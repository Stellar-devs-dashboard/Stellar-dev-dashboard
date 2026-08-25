import { describe, expect, it } from 'vitest'
import { computeRealizedGainLoss, lookupCostBasis, summarizeRealizedGainLoss, validateCostBasisEntry } from '../costBasis'
import type { CostBasisEntry, LedgerPosting } from '../../../types/treasury'

function posting(overrides: Partial<LedgerPosting>): LedgerPosting {
  return {
    id: 'p1', txHash: 'tx1', operationId: 'op1', ledgerCloseTime: '2026-01-15T00:00:00.000Z',
    type: 'payment-in', asset: 'XLM', amount: '10', counterparty: null, memo: null,
    transactionSuccessful: true, category: null, counterpartyLabel: null,
    provenance: { source: 'derived', note: 'test' }, ...overrides,
  }
}

describe('lookupCostBasis', () => {
  const entries: CostBasisEntry[] = [
    { asset: 'XLM', unitPrice: '0.10', currency: 'USD', effectiveAt: '2026-01-01T00:00:00.000Z', source: 'manual' },
    { asset: 'XLM', unitPrice: '0.12', currency: 'USD', effectiveAt: '2026-02-01T00:00:00.000Z', source: 'manual' },
  ]

  it('picks the most recent entry at or before the disposal time', () => {
    expect(lookupCostBasis('XLM', '2026-01-15T00:00:00.000Z', entries)?.unitPrice).toBe('0.10')
    expect(lookupCostBasis('XLM', '2026-03-01T00:00:00.000Z', entries)?.unitPrice).toBe('0.12')
  })

  it('returns null rather than guessing when no entry covers the date', () => {
    expect(lookupCostBasis('XLM', '2025-01-01T00:00:00.000Z', entries)).toBeNull()
  })

  it('never mixes entries across assets', () => {
    expect(lookupCostBasis('USDC', '2026-06-01T00:00:00.000Z', entries)).toBeNull()
  })
})

describe('validateCostBasisEntry', () => {
  it('accepts a valid entry', () => {
    expect(validateCostBasisEntry({ asset: 'XLM', unitPrice: '0.12', currency: 'USD', effectiveAt: '2026-01-01T00:00:00.000Z' })).toHaveLength(0)
  })

  it('rejects a non-positive price, invalid date, and missing asset', () => {
    expect(validateCostBasisEntry({ asset: '', unitPrice: '0', currency: 'USD', effectiveAt: 'not-a-date' }).length).toBeGreaterThan(0)
  })
})

describe('computeRealizedGainLoss — FIFO', () => {
  it('matches a disposal against the oldest lot first and computes gain/loss', () => {
    const postings = [
      posting({ id: 'buy1', ledgerCloseTime: '2026-01-01T00:00:00.000Z', amount: '10' }),
      posting({ id: 'buy2', ledgerCloseTime: '2026-01-10T00:00:00.000Z', amount: '10' }),
      posting({ id: 'sell1', ledgerCloseTime: '2026-02-01T00:00:00.000Z', amount: '-5', type: 'payment-out' }),
    ]
    const costBasis: CostBasisEntry[] = [
      { asset: 'XLM', unitPrice: '0.10', currency: 'USD', effectiveAt: '2026-01-01T00:00:00.000Z', source: 'manual' },
      { asset: 'XLM', unitPrice: '0.15', currency: 'USD', effectiveAt: '2026-02-01T00:00:00.000Z', source: 'manual' },
    ]
    const { realized, remainingLots } = computeRealizedGainLoss('XLM', postings, costBasis)
    expect(realized).toHaveLength(1)
    expect(realized[0].quantity).toBe('5')
    expect(realized[0].costBasisPerUnit).toBe('0.10')
    expect(realized[0].proceedsPerUnit).toBe('0.15')
    expect(realized[0].gainLoss).toBe('0.25') // 5 * (0.15 - 0.10)
    expect(realized[0].costBasisMissing).toBe(false)
    expect(remainingLots).toHaveLength(2) // 5 left in the first lot, 10 untouched in the second
    expect(remainingLots[0].quantity).toBe('5')
  })

  it('splits a disposal across multiple lots in FIFO order', () => {
    const postings = [
      posting({ id: 'buy1', ledgerCloseTime: '2026-01-01T00:00:00.000Z', amount: '3' }),
      posting({ id: 'buy2', ledgerCloseTime: '2026-01-10T00:00:00.000Z', amount: '10' }),
      posting({ id: 'sell1', ledgerCloseTime: '2026-02-01T00:00:00.000Z', amount: '-5', type: 'payment-out' }),
    ]
    const { realized } = computeRealizedGainLoss('XLM', postings, [])
    expect(realized).toHaveLength(2)
    expect(realized[0].quantity).toBe('3')
    expect(realized[1].quantity).toBe('2')
  })

  it('flags a disposal with no cost-basis coverage as missing rather than assuming zero cost', () => {
    const postings = [
      posting({ id: 'buy1', ledgerCloseTime: '2026-01-01T00:00:00.000Z', amount: '10' }),
      posting({ id: 'sell1', ledgerCloseTime: '2026-02-01T00:00:00.000Z', amount: '-5', type: 'payment-out' }),
    ]
    const { realized } = computeRealizedGainLoss('XLM', postings, [])
    expect(realized[0].costBasisMissing).toBe(true)
  })

  it('flags a disposal exceeding all tracked lots instead of inventing a lot', () => {
    const postings = [posting({ id: 'sell1', ledgerCloseTime: '2026-02-01T00:00:00.000Z', amount: '-5', type: 'payment-out' })]
    const { realized, remainingLots } = computeRealizedGainLoss('XLM', postings, [])
    expect(realized).toHaveLength(1)
    expect(realized[0].costBasisMissing).toBe(true)
    expect(remainingLots).toHaveLength(0)
  })

  it('excludes postings from failed transactions', () => {
    const postings = [posting({ id: 'buy1', amount: '10', transactionSuccessful: false })]
    const { remainingLots } = computeRealizedGainLoss('XLM', postings, [])
    expect(remainingLots).toHaveLength(0)
  })
})

describe('summarizeRealizedGainLoss', () => {
  it('totals gain/loss and counts missing-cost-basis entries', () => {
    const summary = summarizeRealizedGainLoss([
      { asset: 'XLM', disposedAt: 'x', quantity: '1', proceedsPerUnit: '1', costBasisPerUnit: '0.5', gainLoss: '0.5', costBasisMissing: false },
      { asset: 'XLM', disposedAt: 'y', quantity: '1', proceedsPerUnit: '0', costBasisPerUnit: '0', gainLoss: '0', costBasisMissing: true },
    ])
    expect(summary.totalGainLoss).toBe('0.5')
    expect(summary.missingCostBasisCount).toBe(1)
  })
})
