import { negateAmount, stroopsToAmount } from './amount'
import type { LedgerPosting, PagingGapReport, PostingType, Provenance } from '../../types/treasury'

export interface RawAsset {
  asset_type?: string
  asset_code?: string
  asset_issuer?: string
}

export interface RawOperationRecord extends RawAsset {
  id: string
  type: string
  transaction_hash: string
  source_account?: string
  created_at: string
  paging_token: string
  transaction_successful?: boolean
  from?: string
  to?: string
  amount?: string
  starting_balance?: string
  funder?: string
  account?: string
  into?: string
  source_amount?: string
  source_asset_type?: string
  source_asset_code?: string
  source_asset_issuer?: string
  balance_id?: string
  claimant?: string
  sponsor?: string
  sponsored_id?: string
}

export interface RawTransactionRecord {
  hash: string
  source_account: string
  successful: boolean
  fee_charged: string
  memo?: string
  created_at: string
  paging_token: string
}

/** Canonical asset key: native XLM, or "CODE:ISSUER" — the full issuer (not truncated) so two assets sharing a code under different issuers are never merged. */
export function assetKey(asset: RawAsset): string {
  if (!asset.asset_type || asset.asset_type === 'native') return 'XLM'
  return `${asset.asset_code || '?'}:${asset.asset_issuer || '?'}`
}

const derived = (note: string): Provenance => ({ source: 'derived', note })

function makePosting(
  op: RawOperationRecord,
  accountId: string,
  type: PostingType,
  asset: string,
  amount: string,
  counterparty: string | null,
  note: string
): LedgerPosting {
  return {
    id: `${op.id}:${type}:${asset}`,
    txHash: op.transaction_hash,
    operationId: op.id,
    ledgerCloseTime: op.created_at,
    type,
    asset,
    amount,
    counterparty,
    memo: null,
    transactionSuccessful: op.transaction_successful ?? true,
    category: null,
    counterpartyLabel: null,
    provenance: derived(note),
  }
}

/**
 * Normalizes a single Horizon operation into zero or more account-perspective
 * ledger postings. Only operation types with a directly observable amount in
 * the operation record produce a balance-affecting posting; types that need
 * effect-level data the /operations endpoint doesn't carry (account_merge
 * transfer amount, claimable-balance claim amount on some Horizon versions,
 * Soroban token-transfer events) produce a zero-amount informational posting
 * instead of a fabricated number — see docs/treasury-reconciliation.md.
 */
export function normalizeOperation(op: RawOperationRecord, accountId: string): LedgerPosting[] {
  const postings: LedgerPosting[] = []

  switch (op.type) {
    case 'create_account': {
      const amount = op.starting_balance || '0'
      if (op.funder === accountId) postings.push(makePosting(op, accountId, 'payment-out', 'XLM', negateAmount(amount), op.account || null, 'Funded new account creation'))
      else if (op.account === accountId) postings.push(makePosting(op, accountId, 'payment-in', 'XLM', amount, op.funder || null, 'Account created with starting balance'))
      break
    }
    case 'payment': {
      const asset = assetKey(op)
      const amount = op.amount || '0'
      if (op.from === accountId) postings.push(makePosting(op, accountId, 'payment-out', asset, negateAmount(amount), op.to || null, 'Outgoing payment'))
      else if (op.to === accountId) postings.push(makePosting(op, accountId, 'payment-in', asset, amount, op.from || null, 'Incoming payment'))
      break
    }
    case 'path_payment_strict_send':
    case 'path_payment_strict_receive': {
      const sourceAsset = assetKey({ asset_type: op.source_asset_type, asset_code: op.source_asset_code, asset_issuer: op.source_asset_issuer })
      const destAsset = assetKey(op)
      if (op.from === accountId) postings.push(makePosting(op, accountId, 'trade', sourceAsset, negateAmount(op.source_amount || '0'), op.to || null, 'Path payment source leg'))
      if (op.to === accountId) postings.push(makePosting(op, accountId, 'trade', destAsset, op.amount || '0', op.from || null, 'Path payment destination leg'))
      break
    }
    case 'manage_buy_offer':
    case 'manage_sell_offer':
    case 'create_passive_sell_offer': {
      if (op.source_account === accountId) {
        postings.push(makePosting(op, accountId, 'trade', assetKey(op), '0', null, 'Offer instruction — the /operations feed does not report executed fill amounts; verify against the trades endpoint before relying on this for balance reconciliation.'))
      }
      break
    }
    case 'create_claimable_balance': {
      if (op.source_account === accountId) {
        postings.push(makePosting(op, accountId, 'claimable-balance-out', assetKey(op), negateAmount(op.amount || '0'), null, 'Funds locked into a claimable balance'))
      }
      break
    }
    case 'claim_claimable_balance': {
      if (op.claimant === accountId) {
        if (op.amount) postings.push(makePosting(op, accountId, 'claimable-balance-in', assetKey(op), op.amount, null, 'Claimable balance claimed'))
        else postings.push(makePosting(op, accountId, 'claimable-balance-in', 'UNKNOWN', '0', null, 'Claimable balance claimed, but this Horizon response omitted the amount/asset — resolve manually from the balance_id.'))
      }
      break
    }
    case 'begin_sponsoring_future_reserves':
    case 'end_sponsoring_future_reserves':
    case 'revoke_sponsorship': {
      if (op.source_account === accountId || op.sponsor === accountId || op.sponsored_id === accountId) {
        postings.push(makePosting(op, accountId, 'sponsorship', 'XLM', '0', op.sponsor || op.sponsored_id || null, 'Sponsorship reserve event (informational — does not itself move a balance)'))
      }
      break
    }
    case 'account_merge': {
      if (op.account === accountId || op.source_account === accountId) {
        postings.push(makePosting(op, accountId, 'account-change', 'XLM', '0', op.into || null, 'Account merged away — resulting XLM transfer amount is not in the operation record; check the destination account effects.'))
      } else if (op.into === accountId) {
        postings.push(makePosting(op, accountId, 'account-change', 'XLM', '0', op.account || null, 'Received a merged account — resulting XLM transfer amount is not in the operation record; check account effects.'))
      }
      break
    }
    case 'invoke_host_function': {
      if (op.source_account === accountId) {
        postings.push(makePosting(op, accountId, 'contract-transfer', 'CONTRACT', '0', null, 'Soroban contract invocation — token-transfer amounts require parsing contract events, which is out of scope for this normalizer; see docs for the follow-up plan.'))
      }
      break
    }
    default: {
      if (op.source_account === accountId) {
        postings.push(makePosting(op, accountId, 'other', 'XLM', '0', null, `Operation type "${op.type}" recorded for audit visibility; no balance-affecting amount is derived from it.`))
      }
    }
  }

  return postings
}

/** Fee is charged to the transaction's source account even when the transaction fails — Stellar consumes the fee for including it in a ledger regardless of the inner operations' success. */
export function normalizeTransactionFee(tx: RawTransactionRecord, accountId: string): LedgerPosting | null {
  if (tx.source_account !== accountId) return null
  const feeStroops = BigInt(tx.fee_charged || '0')
  if (feeStroops === 0n) return null
  return {
    id: `${tx.hash}:fee`,
    txHash: tx.hash,
    operationId: `${tx.hash}:fee`,
    ledgerCloseTime: tx.created_at,
    type: 'fee',
    asset: 'XLM',
    amount: negateAmount(stroopsToAmount(feeStroops)),
    counterparty: null,
    memo: tx.memo || null,
    transactionSuccessful: tx.successful,
    category: null,
    counterpartyLabel: null,
    provenance: derived(tx.successful ? 'Network fee' : 'Network fee (transaction failed but the fee was still charged)'),
  }
}

export interface NormalizeResult {
  postings: LedgerPosting[]
}

export function normalizeAccountActivity(
  accountId: string,
  transactions: RawTransactionRecord[],
  operations: RawOperationRecord[]
): NormalizeResult {
  const txByHash = new Map(transactions.map((tx) => [tx.hash, tx]))
  const postings: LedgerPosting[] = []

  for (const tx of transactions) {
    const feePosting = normalizeTransactionFee(tx, accountId)
    if (feePosting) postings.push(feePosting)
  }

  for (const op of operations) {
    const tx = txByHash.get(op.transaction_hash)
    if (tx && !tx.successful) continue // Failed transactions produce no operation-level effect, only the fee above.
    const memo = tx?.memo || null
    const opPostings = normalizeOperation(op, accountId).map((posting) => ({ ...posting, memo }))
    postings.push(...opPostings)
  }

  postings.sort((a, b) => a.ledgerCloseTime.localeCompare(b.ledgerCloseTime) || a.id.localeCompare(b.id))
  return { postings }
}

/**
 * Verifies that a sequence of fetched operation pages chains together
 * without a gap: each page's cursor should pick up exactly where the
 * previous page's last record left off, and a non-final page should be full
 * (a short page followed by more results would mean records were dropped
 * between requests, e.g. by an intermediary cache or a retried request that
 * skipped a cursor).
 */
export function detectPagingGaps(
  pages: Array<{ records: RawOperationRecord[]; requestedLimit: number; cursorUsed: string | null }>
): PagingGapReport {
  const details: string[] = []
  for (let i = 1; i < pages.length; i++) {
    const previous = pages[i - 1]
    const current = pages[i]
    const previousLast = previous.records[previous.records.length - 1]
    if (previousLast && current.cursorUsed !== previousLast.paging_token) {
      details.push(`Page ${i} was requested with cursor "${current.cursorUsed}" but page ${i - 1} ended at "${previousLast.paging_token}".`)
    }
    // `previous` is, by construction of this loop, always followed by another fetched page
    // (`current`) — so if it came back short of the requested page size, pagination should
    // have stopped there. A short page with a page after it means records were dropped.
    if (previous.records.length < previous.requestedLimit) {
      details.push(`Page ${i - 1} returned fewer records (${previous.records.length}) than requested (${previous.requestedLimit}) but was not the last page fetched.`)
    }
  }
  return { gapDetected: details.length > 0, details }
}
