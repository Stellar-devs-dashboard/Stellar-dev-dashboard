import type { RawOperationRecord, RawTransactionRecord } from './normalize'
import type { CostBasisEntry } from '../../types/treasury'

export const FIXTURE_ACCOUNT = 'GDEMOACCT2QW4V6VVWLXVFSA5XYKTXOFA4BDANE2NF4XG52YZKX2H5X'
const COUNTERPARTY_A = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'
const COUNTERPARTY_B = 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBAJWL'
const ISSUER_X = 'GISSUERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXAV6O'
const ISSUER_Y = 'GISSUERYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYA4C2'

function pagingToken(seq: number): string {
  return String(seq).padStart(19, '0')
}

/**
 * A deterministic fixture ledger covering the edge cases this feature is
 * required to handle: 7-decimal rounding, fee attribution on a failed
 * transaction, and two distinct assets that share the code "USDC" under
 * different issuers (must never be merged into one balance).
 */
export function buildFixtureLedger(now = new Date('2026-08-21T16:00:00.000Z')): { transactions: RawTransactionRecord[]; operations: RawOperationRecord[] } {
  const iso = (offsetMinutes: number) => new Date(now.getTime() - offsetMinutes * 60_000).toISOString()
  const transactions: RawTransactionRecord[] = []
  const operations: RawOperationRecord[] = []
  let seq = 1000

  function addPaymentTx(opts: {
    minutesAgo: number
    from: string
    to: string
    amount: string
    assetCode?: string
    assetIssuer?: string
    successful?: boolean
    memo?: string
    feeChargedStroops?: string
  }) {
    seq += 10
    const hash = `hash-${seq}`
    const createdAt = iso(opts.minutesAgo)
    transactions.push({
      hash,
      source_account: opts.from,
      successful: opts.successful ?? true,
      fee_charged: opts.feeChargedStroops ?? '100',
      memo: opts.memo,
      created_at: createdAt,
      paging_token: pagingToken(seq),
    })
    operations.push({
      id: `op-${seq}`,
      type: 'payment',
      transaction_hash: hash,
      source_account: opts.from,
      created_at: createdAt,
      paging_token: pagingToken(seq + 1),
      transaction_successful: opts.successful ?? true,
      from: opts.from,
      to: opts.to,
      amount: opts.amount,
      asset_type: opts.assetCode ? 'credit_alphanum4' : 'native',
      asset_code: opts.assetCode,
      asset_issuer: opts.assetIssuer,
    })
  }

  // Ordinary inbound payment.
  addPaymentTx({ minutesAgo: 600, from: COUNTERPARTY_A, to: FIXTURE_ACCOUNT, amount: '100.5000000', memo: 'invoice-1001' })

  // Outbound payment with a 7-decimal amount to exercise rounding-safe arithmetic.
  addPaymentTx({ minutesAgo: 540, from: FIXTURE_ACCOUNT, to: COUNTERPARTY_B, amount: '25.1234567', memo: 'refund' })

  // Failed transaction: the payment never executes, but the fee is still charged (fee attribution + failed-transaction handling).
  addPaymentTx({ minutesAgo: 480, from: FIXTURE_ACCOUNT, to: COUNTERPARTY_B, amount: '9999.0000000', successful: false, feeChargedStroops: '100' })

  // Two distinct "USDC" assets under different issuers — must remain separate balances (asset code collision).
  addPaymentTx({ minutesAgo: 420, from: COUNTERPARTY_A, to: FIXTURE_ACCOUNT, amount: '50.0000000', assetCode: 'USDC', assetIssuer: ISSUER_X, memo: 'usdc-x' })
  addPaymentTx({ minutesAgo: 400, from: COUNTERPARTY_B, to: FIXTURE_ACCOUNT, amount: '30.0000000', assetCode: 'USDC', assetIssuer: ISSUER_Y, memo: 'usdc-y' })

  // A disposal of USDC-from-issuer-X with no cost-basis entry provided (missing price).
  addPaymentTx({ minutesAgo: 360, from: FIXTURE_ACCOUNT, to: COUNTERPARTY_A, amount: '10.0000000', assetCode: 'USDC', assetIssuer: ISSUER_X, memo: 'partial-spend' })

  // Claimable balance create + claim.
  seq += 10
  const cbHash = `hash-${seq}`
  const cbCreatedAt = iso(300)
  transactions.push({ hash: cbHash, source_account: FIXTURE_ACCOUNT, successful: true, fee_charged: '100', created_at: cbCreatedAt, paging_token: pagingToken(seq) })
  operations.push({
    id: `op-${seq}`, type: 'create_claimable_balance', transaction_hash: cbHash, source_account: FIXTURE_ACCOUNT,
    created_at: cbCreatedAt, paging_token: pagingToken(seq + 1), transaction_successful: true,
    amount: '15.0000000', asset_type: 'native', balance_id: 'cb-001',
  })

  seq += 10
  const claimHash = `hash-${seq}`
  const claimCreatedAt = iso(240)
  transactions.push({ hash: claimHash, source_account: COUNTERPARTY_A, successful: true, fee_charged: '100', created_at: claimCreatedAt, paging_token: pagingToken(seq) })
  operations.push({
    id: `op-${seq}`, type: 'claim_claimable_balance', transaction_hash: claimHash, source_account: COUNTERPARTY_A,
    created_at: claimCreatedAt, paging_token: pagingToken(seq + 1), transaction_successful: true,
    claimant: FIXTURE_ACCOUNT, balance_id: 'cb-001', amount: '15.0000000', asset_type: 'native',
  })

  // Path payment (trade classification).
  seq += 10
  const pathHash = `hash-${seq}`
  const pathCreatedAt = iso(180)
  transactions.push({ hash: pathHash, source_account: FIXTURE_ACCOUNT, successful: true, fee_charged: '100', created_at: pathCreatedAt, paging_token: pagingToken(seq) })
  operations.push({
    id: `op-${seq}`, type: 'path_payment_strict_send', transaction_hash: pathHash, source_account: FIXTURE_ACCOUNT,
    created_at: pathCreatedAt, paging_token: pagingToken(seq + 1), transaction_successful: true,
    from: FIXTURE_ACCOUNT, to: COUNTERPARTY_B,
    source_amount: '20.0000000', source_asset_type: 'native',
    amount: '19.5000000', asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: ISSUER_X,
  })

  // A larger run of routine payments to exercise pagination-scale reconciliation.
  for (let i = 0; i < 40; i++) {
    addPaymentTx({
      minutesAgo: 120 + i,
      from: i % 2 === 0 ? COUNTERPARTY_A : FIXTURE_ACCOUNT,
      to: i % 2 === 0 ? FIXTURE_ACCOUNT : COUNTERPARTY_B,
      amount: `${1 + (i % 5)}.${String(1000000 + i).slice(1)}`,
      memo: `bulk-${i}`,
    })
  }

  return { transactions, operations }
}

export function buildFixtureCostBasisEntries(now = new Date('2026-08-21T16:00:00.000Z')): CostBasisEntry[] {
  return [
    { asset: 'XLM', unitPrice: '0.12', currency: 'USD', effectiveAt: new Date(now.getTime() - 700 * 60_000).toISOString(), source: 'manual-input' },
    { asset: 'XLM', unitPrice: '0.13', currency: 'USD', effectiveAt: new Date(now.getTime() - 200 * 60_000).toISOString(), source: 'manual-input' },
    // Note: no entry is provided for USDC:ISSUER_X — its disposal above is expected to surface as "missing cost basis".
  ]
}

export const FIXTURE_ISSUERS = { ISSUER_X, ISSUER_Y }
export const FIXTURE_COUNTERPARTIES = { COUNTERPARTY_A, COUNTERPARTY_B }
