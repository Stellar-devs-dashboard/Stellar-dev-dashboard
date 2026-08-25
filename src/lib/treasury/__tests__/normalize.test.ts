import { describe, expect, it } from 'vitest'
import { assetKey, detectPagingGaps, normalizeAccountActivity, normalizeOperation, normalizeTransactionFee } from '../normalize'
import type { RawOperationRecord, RawTransactionRecord } from '../normalize'

const ACCOUNT = 'GACCOUNT'
const OTHER = 'GOTHER'
const NOW = '2026-08-21T16:00:00.000Z'

function op(overrides: Partial<RawOperationRecord>): RawOperationRecord {
  return { id: 'op-1', type: 'payment', transaction_hash: 'tx-1', created_at: NOW, paging_token: '1', transaction_successful: true, ...overrides }
}

function tx(overrides: Partial<RawTransactionRecord>): RawTransactionRecord {
  return { hash: 'tx-1', source_account: ACCOUNT, successful: true, fee_charged: '100', created_at: NOW, paging_token: '1', ...overrides }
}

describe('assetKey', () => {
  it('identifies native XLM regardless of casing/omission', () => {
    expect(assetKey({ asset_type: 'native' })).toBe('XLM')
    expect(assetKey({})).toBe('XLM')
  })

  it('keeps two assets with the same code but different issuers distinct (no collision)', () => {
    const a = assetKey({ asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: 'GISSUERX' })
    const b = assetKey({ asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: 'GISSUERY' })
    expect(a).not.toBe(b)
  })
})

describe('normalizeOperation — payment', () => {
  it('produces a debit for the sender and nothing for an unrelated account', () => {
    const postings = normalizeOperation(op({ type: 'payment', from: ACCOUNT, to: OTHER, amount: '10.5', source_account: ACCOUNT }), ACCOUNT)
    expect(postings).toHaveLength(1)
    expect(postings[0].type).toBe('payment-out')
    expect(postings[0].amount).toBe('-10.5')
    expect(postings[0].counterparty).toBe(OTHER)
  })

  it('produces a credit for the recipient', () => {
    const postings = normalizeOperation(op({ type: 'payment', from: OTHER, to: ACCOUNT, amount: '10.5' }), ACCOUNT)
    expect(postings).toHaveLength(1)
    expect(postings[0].type).toBe('payment-in')
    expect(postings[0].amount).toBe('10.5')
  })

  it('produces no posting for an account uninvolved in the payment', () => {
    const postings = normalizeOperation(op({ type: 'payment', from: 'GX', to: 'GY', amount: '10.5' }), ACCOUNT)
    expect(postings).toHaveLength(0)
  })
})

describe('normalizeOperation — path payments (trades)', () => {
  it('classifies both legs as trade postings for the account on both sides', () => {
    const postings = normalizeOperation(
      op({
        type: 'path_payment_strict_send', from: ACCOUNT, to: ACCOUNT,
        source_amount: '20', source_asset_type: 'native',
        amount: '19.5', asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: 'GISSUER',
      }),
      ACCOUNT
    )
    expect(postings).toHaveLength(2)
    expect(postings.every((p) => p.type === 'trade')).toBe(true)
    expect(postings.find((p) => p.asset === 'XLM')?.amount).toBe('-20')
    expect(postings.find((p) => p.asset.startsWith('USDC'))?.amount).toBe('19.5')
  })
})

describe('normalizeOperation — claimable balances', () => {
  it('debits the creator', () => {
    const postings = normalizeOperation(op({ type: 'create_claimable_balance', source_account: ACCOUNT, amount: '15', asset_type: 'native' }), ACCOUNT)
    expect(postings[0].type).toBe('claimable-balance-out')
    expect(postings[0].amount).toBe('-15')
  })

  it('credits the claimant when the amount is present', () => {
    const postings = normalizeOperation(op({ type: 'claim_claimable_balance', claimant: ACCOUNT, amount: '15', asset_type: 'native' }), ACCOUNT)
    expect(postings[0].type).toBe('claimable-balance-in')
    expect(postings[0].amount).toBe('15')
  })

  it('flags a claim with no amount in the record as unknown rather than guessing', () => {
    const postings = normalizeOperation(op({ type: 'claim_claimable_balance', claimant: ACCOUNT }), ACCOUNT)
    expect(postings[0].asset).toBe('UNKNOWN')
    expect(postings[0].amount).toBe('0')
  })
})

describe('normalizeOperation — sponsorship, account_merge, invoke_host_function, other', () => {
  it('records sponsorship events as zero-amount informational postings', () => {
    const postings = normalizeOperation(op({ type: 'begin_sponsoring_future_reserves', source_account: ACCOUNT, sponsor: OTHER }), ACCOUNT)
    expect(postings[0].type).toBe('sponsorship')
    expect(postings[0].amount).toBe('0')
  })

  it('records account_merge as zero-amount informational rather than fabricating the transferred amount', () => {
    const postings = normalizeOperation(op({ type: 'account_merge', account: ACCOUNT, into: OTHER }), ACCOUNT)
    expect(postings[0].type).toBe('account-change')
    expect(postings[0].amount).toBe('0')
  })

  it('records invoke_host_function as an informational contract-transfer posting', () => {
    const postings = normalizeOperation(op({ type: 'invoke_host_function', source_account: ACCOUNT }), ACCOUNT)
    expect(postings[0].type).toBe('contract-transfer')
    expect(postings[0].asset).toBe('CONTRACT')
  })

  it('records unknown operation types as "other" for audit visibility', () => {
    const postings = normalizeOperation(op({ type: 'set_options', source_account: ACCOUNT }), ACCOUNT)
    expect(postings[0].type).toBe('other')
  })
})

describe('normalizeTransactionFee', () => {
  it('debits the fee from the transaction source account', () => {
    const posting = normalizeTransactionFee(tx({ source_account: ACCOUNT, fee_charged: '1000' }), ACCOUNT)
    expect(posting?.type).toBe('fee')
    expect(posting?.amount).toBe('-0.0001')
  })

  it('returns null for an account that did not pay the fee', () => {
    expect(normalizeTransactionFee(tx({ source_account: OTHER }), ACCOUNT)).toBeNull()
  })

  it('still charges the fee on a failed transaction', () => {
    const posting = normalizeTransactionFee(tx({ source_account: ACCOUNT, successful: false, fee_charged: '100' }), ACCOUNT)
    expect(posting).not.toBeNull()
    expect(posting?.transactionSuccessful).toBe(false)
  })
})

describe('normalizeAccountActivity — failed transactions', () => {
  it('excludes operation-level postings for a failed transaction but still posts its fee', () => {
    const transactions = [tx({ hash: 'tx-fail', source_account: ACCOUNT, successful: false, fee_charged: '100' })]
    const operations = [op({ id: 'op-fail', transaction_hash: 'tx-fail', type: 'payment', from: ACCOUNT, to: OTHER, amount: '9999', transaction_successful: false })]
    const { postings } = normalizeAccountActivity(ACCOUNT, transactions, operations)
    expect(postings).toHaveLength(1)
    expect(postings[0].type).toBe('fee')
  })

  it('processes a mix of successful and failed transactions independently', () => {
    const transactions = [
      tx({ hash: 'tx-ok', source_account: ACCOUNT, successful: true, fee_charged: '100' }),
      tx({ hash: 'tx-fail', source_account: ACCOUNT, successful: false, fee_charged: '100' }),
    ]
    const operations = [
      op({ id: 'op-ok', transaction_hash: 'tx-ok', type: 'payment', from: OTHER, to: ACCOUNT, amount: '5' }),
      op({ id: 'op-fail', transaction_hash: 'tx-fail', type: 'payment', from: ACCOUNT, to: OTHER, amount: '9999', transaction_successful: false }),
    ]
    const { postings } = normalizeAccountActivity(ACCOUNT, transactions, operations)
    expect(postings.filter((p) => p.type === 'fee')).toHaveLength(2)
    expect(postings.filter((p) => p.type === 'payment-in')).toHaveLength(1)
    expect(postings.some((p) => p.amount === '9999')).toBe(false)
  })

  it('attaches the transaction memo to derived postings', () => {
    const transactions = [tx({ hash: 'tx-memo', source_account: OTHER, successful: true, fee_charged: '100', memo: 'invoice-42' })]
    const operations = [op({ id: 'op-memo', transaction_hash: 'tx-memo', type: 'payment', from: OTHER, to: ACCOUNT, amount: '5' })]
    const { postings } = normalizeAccountActivity(ACCOUNT, transactions, operations)
    expect(postings.find((p) => p.type === 'payment-in')?.memo).toBe('invoice-42')
  })
})

describe('detectPagingGaps', () => {
  it('finds no gap in a properly chained set of pages', () => {
    const pages = [
      { records: [{ paging_token: '10' } as RawOperationRecord, { paging_token: '5' } as RawOperationRecord], requestedLimit: 2, cursorUsed: null },
      { records: [{ paging_token: '1' } as RawOperationRecord], requestedLimit: 2, cursorUsed: '5' },
    ]
    expect(detectPagingGaps(pages).gapDetected).toBe(false)
  })

  it('detects a broken cursor chain between pages', () => {
    const pages = [
      { records: [{ paging_token: '10' } as RawOperationRecord], requestedLimit: 2, cursorUsed: null },
      { records: [{ paging_token: '1' } as RawOperationRecord], requestedLimit: 2, cursorUsed: 'wrong-cursor' },
    ]
    const report = detectPagingGaps(pages)
    expect(report.gapDetected).toBe(true)
    expect(report.details[0]).toMatch(/cursor/)
  })

  it('detects a short non-final page (implies dropped records)', () => {
    const pages = [
      { records: [{ paging_token: '10' } as RawOperationRecord], requestedLimit: 5, cursorUsed: null },
      { records: [{ paging_token: '1' } as RawOperationRecord], requestedLimit: 5, cursorUsed: '10' },
    ]
    expect(detectPagingGaps(pages).gapDetected).toBe(true)
  })
})
