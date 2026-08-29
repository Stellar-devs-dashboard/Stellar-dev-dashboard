import { fetchOperations, fetchTransactions, isValidPublicKey, type NetworkName } from '../stellar'
import { detectPagingGaps, type RawOperationRecord, type RawTransactionRecord } from './normalize'
import type { PagingGapReport, TreasuryApiError } from '../../types/treasury'

const PAGE_SIZE = 200
const MAX_PAGES = 25 // Bounds worst-case history size per fetch — see docs for the "very large histories" follow-up plan.

export class TreasuryFetchError extends Error implements TreasuryApiError {
  code: TreasuryApiError['code']
  retryable: boolean
  constructor(error: TreasuryApiError) {
    super(error.message)
    this.name = 'TreasuryFetchError'
    this.code = error.code
    this.retryable = error.retryable
  }
}

export interface FetchLedgerActivityResult {
  transactions: RawTransactionRecord[]
  operations: RawOperationRecord[]
  pagingGap: PagingGapReport
  truncated: boolean
}

async function fetchAllPages<T extends { paging_token: string }>(
  fetchPage: (_limit: number, _cursor: string | null, _signal?: AbortSignal) => Promise<{ records: T[]; nextCursor: string | null; hasMore: boolean }>,
  signal?: AbortSignal
): Promise<{ pages: Array<{ records: T[]; requestedLimit: number; cursorUsed: string | null }>; truncated: boolean }> {
  const pages: Array<{ records: T[]; requestedLimit: number; cursorUsed: string | null }> = []
  let cursor: string | null = null
  let truncated = false

  for (let i = 0; i < MAX_PAGES; i++) {
    if (signal?.aborted) throw new TreasuryFetchError({ code: 'aborted', message: 'Fetch was cancelled.', retryable: false })
    const page = await fetchPage(PAGE_SIZE, cursor, signal)
    pages.push({ records: page.records, requestedLimit: PAGE_SIZE, cursorUsed: cursor })
    if (!page.hasMore) break
    cursor = page.nextCursor
    if (i === MAX_PAGES - 1) truncated = true
  }
  return { pages, truncated }
}

/**
 * Fetches an account's full transaction + operation history (bounded to
 * MAX_PAGES per call) via the app's existing Horizon client, oldest-first,
 * and cross-checks the fetched pages for gaps before handing them to the
 * normalizer.
 */
export async function fetchAccountLedgerActivity(
  accountId: string,
  network: NetworkName,
  signal?: AbortSignal
): Promise<FetchLedgerActivityResult> {
  if (!isValidPublicKey(accountId)) {
    throw new TreasuryFetchError({ code: 'invalid-account', message: `"${accountId}" is not a valid Stellar account address.`, retryable: false })
  }

  try {
    const [txResult, opResult] = await Promise.all([
      fetchAllPages((limit, cursor, sig) => fetchTransactions(accountId, network, limit, cursor, sig), signal),
      fetchAllPages((limit, cursor, sig) => fetchOperations(accountId, network, limit, cursor, sig), signal),
    ])

    const pagingGap = detectPagingGaps(opResult.pages as never)
    const transactions = txResult.pages.flatMap((p) => p.records).reverse() as unknown as RawTransactionRecord[]
    const operations = opResult.pages.flatMap((p) => p.records).reverse() as unknown as RawOperationRecord[]

    return { transactions, operations, pagingGap, truncated: txResult.truncated || opResult.truncated }
  } catch (error) {
    if (error instanceof TreasuryFetchError) throw error
    if (signal?.aborted || (error as Error)?.name === 'AbortError') {
      throw new TreasuryFetchError({ code: 'aborted', message: 'Fetch was cancelled.', retryable: false })
    }
    throw new TreasuryFetchError({ code: 'unavailable', message: `Unable to load ledger activity: ${(error as Error).message}`, retryable: true })
  }
}
