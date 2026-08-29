import { afterEach, describe, expect, it, vi } from 'vitest'
import * as StellarSdk from '@stellar/stellar-sdk'
import { fetchAccountLedgerActivity, TreasuryFetchError } from '../client'
import * as stellar from '../../stellar'

const ACCOUNT = StellarSdk.Keypair.random().publicKey()

vi.mock('../../stellar', async () => {
  const actual = await vi.importActual<typeof import('../../stellar')>('../../stellar')
  return { ...actual, fetchTransactions: vi.fn(), fetchOperations: vi.fn() }
})

describe('fetchAccountLedgerActivity', () => {
  afterEach(() => vi.resetAllMocks())

  it('rejects an invalid account address before making any request', async () => {
    await expect(fetchAccountLedgerActivity('not-an-account', 'testnet')).rejects.toMatchObject({ code: 'invalid-account' })
    expect(stellar.fetchTransactions).not.toHaveBeenCalled()
  })

  it('fetches a single page of transactions and operations when there is no more history', async () => {
    vi.mocked(stellar.fetchTransactions).mockResolvedValue({
      records: [{ hash: 'tx1', source_account: ACCOUNT, successful: true, fee_charged: '100', created_at: '2026-01-01T00:00:00.000Z', paging_token: '1' }] as never,
      nextCursor: null,
      hasMore: false,
    })
    vi.mocked(stellar.fetchOperations).mockResolvedValue({
      records: [{ id: 'op1', type: 'payment', transaction_hash: 'tx1', created_at: '2026-01-01T00:00:00.000Z', paging_token: '1' }] as never,
      nextCursor: null,
      hasMore: false,
    })

    const result = await fetchAccountLedgerActivity(ACCOUNT, 'testnet')
    expect(result.transactions).toHaveLength(1)
    expect(result.operations).toHaveLength(1)
    expect(result.pagingGap.gapDetected).toBe(false)
    expect(result.truncated).toBe(false)
  })

  it('paginates across multiple pages until hasMore is false', async () => {
    vi.mocked(stellar.fetchTransactions).mockResolvedValueOnce({
      records: [{ hash: 'tx1', source_account: ACCOUNT, successful: true, fee_charged: '100', created_at: '2026-01-01T00:00:00.000Z', paging_token: '2' }] as never,
      nextCursor: '2',
      hasMore: true,
    }).mockResolvedValueOnce({
      records: [{ hash: 'tx2', source_account: ACCOUNT, successful: true, fee_charged: '100', created_at: '2026-01-02T00:00:00.000Z', paging_token: '1' }] as never,
      nextCursor: null,
      hasMore: false,
    })
    vi.mocked(stellar.fetchOperations).mockResolvedValue({ records: [], nextCursor: null, hasMore: false })

    const result = await fetchAccountLedgerActivity(ACCOUNT, 'testnet')
    expect(result.transactions).toHaveLength(2)
    expect(stellar.fetchTransactions).toHaveBeenCalledTimes(2)
  })

  it('returns oldest-first ordering even though the underlying feed is newest-first', async () => {
    vi.mocked(stellar.fetchTransactions).mockResolvedValue({
      records: [
        { hash: 'newest', source_account: ACCOUNT, successful: true, fee_charged: '100', created_at: '2026-01-05T00:00:00.000Z', paging_token: '2' },
        { hash: 'oldest', source_account: ACCOUNT, successful: true, fee_charged: '100', created_at: '2026-01-01T00:00:00.000Z', paging_token: '1' },
      ] as never,
      nextCursor: null,
      hasMore: false,
    })
    vi.mocked(stellar.fetchOperations).mockResolvedValue({ records: [], nextCursor: null, hasMore: false })

    const result = await fetchAccountLedgerActivity(ACCOUNT, 'testnet')
    expect(result.transactions.map((t) => t.hash)).toEqual(['oldest', 'newest'])
  })

  it('maps an underlying fetch failure to a retryable TreasuryFetchError', async () => {
    vi.mocked(stellar.fetchTransactions).mockRejectedValue(new Error('network down'))
    vi.mocked(stellar.fetchOperations).mockResolvedValue({ records: [], nextCursor: null, hasMore: false })
    const error: TreasuryFetchError = await fetchAccountLedgerActivity(ACCOUNT, 'testnet').catch((e) => e)
    expect(error).toBeInstanceOf(TreasuryFetchError)
    expect(error.code).toBe('unavailable')
    expect(error.retryable).toBe(true)
  })

  it('propagates cancellation as an aborted error', async () => {
    const controller = new AbortController()
    vi.mocked(stellar.fetchTransactions).mockImplementation(() => new Promise((_resolve, reject) => {
      controller.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    }))
    vi.mocked(stellar.fetchOperations).mockResolvedValue({ records: [], nextCursor: null, hasMore: false })
    const pending = fetchAccountLedgerActivity(ACCOUNT, 'testnet', controller.signal)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ code: 'aborted' })
  })
})
