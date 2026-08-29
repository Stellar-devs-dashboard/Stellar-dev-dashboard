import { describe, expect, it } from 'vitest'
import {
  buildPeriod,
  closePeriod,
  computeBalanceWaterfall,
  computedClosingBalances,
  deriveNextOpeningBalances,
  detectDiscrepancies,
  findUnresolvedItems,
  groupByTransaction,
  setReviewStatus,
} from '../reconciliation'
import type { LedgerPosting, RealizedGainLoss } from '../../../types/treasury'

function posting(overrides: Partial<LedgerPosting>): LedgerPosting {
  return {
    id: 'p1', txHash: 'tx1', operationId: 'op1', ledgerCloseTime: '2026-01-15T00:00:00.000Z',
    type: 'payment-in', asset: 'XLM', amount: '10', counterparty: null, memo: null,
    transactionSuccessful: true, category: 'General', counterpartyLabel: null,
    provenance: { source: 'derived', note: 'test' }, ...overrides,
  }
}

describe('groupByTransaction', () => {
  it('groups postings sharing a transaction hash', () => {
    const postings = [posting({ id: 'a', txHash: 'tx1' }), posting({ id: 'b', txHash: 'tx1' }), posting({ id: 'c', txHash: 'tx2' })]
    const groups = groupByTransaction(postings)
    expect(groups.get('tx1')).toHaveLength(2)
    expect(groups.get('tx2')).toHaveLength(1)
  })
})

describe('computeBalanceWaterfall', () => {
  it('separates inflow, outflow, and fees per asset and keeps two same-code assets distinct', () => {
    const postings = [
      posting({ id: 'a', asset: 'XLM', amount: '10' }),
      posting({ id: 'b', asset: 'XLM', amount: '-3', type: 'payment-out' }),
      posting({ id: 'c', asset: 'XLM', amount: '-0.5', type: 'fee' }),
      posting({ id: 'd', asset: 'USDC:GISSUERX', amount: '5' }),
      posting({ id: 'e', asset: 'USDC:GISSUERY', amount: '7' }),
    ]
    const waterfall = computeBalanceWaterfall(postings, { XLM: '100' })
    const xlm = waterfall.find((w) => w.asset === 'XLM')!
    expect(xlm.inflow).toBe('10')
    expect(xlm.outflow).toBe('-3')
    expect(xlm.fees).toBe('-0.5')
    expect(xlm.closing).toBe('106.5')

    const usdcX = waterfall.find((w) => w.asset === 'USDC:GISSUERX')!
    const usdcY = waterfall.find((w) => w.asset === 'USDC:GISSUERY')!
    expect(usdcX.closing).toBe('5')
    expect(usdcY.closing).toBe('7')
  })

  it('includes an asset present only in the opening balances (no activity that period)', () => {
    const waterfall = computeBalanceWaterfall([], { XLM: '50' })
    expect(waterfall).toHaveLength(1)
    expect(waterfall[0].closing).toBe('50')
  })
})

describe('detectDiscrepancies', () => {
  it('finds no discrepancy when computed matches actual within tolerance', () => {
    const waterfall = computeBalanceWaterfall([posting({ asset: 'XLM', amount: '10' })], { XLM: '0' })
    expect(detectDiscrepancies(waterfall, { XLM: '10' })).toHaveLength(0)
  })

  it('flags a real discrepancy with a signed difference and possible causes', () => {
    const waterfall = computeBalanceWaterfall([posting({ asset: 'XLM', amount: '10' })], { XLM: '0' })
    const discrepancies = detectDiscrepancies(waterfall, { XLM: '8' })
    expect(discrepancies).toHaveLength(1)
    expect(discrepancies[0].differenceAbs).toBe('2')
    expect(discrepancies[0].possibleCauses.length).toBeGreaterThan(0)
  })

  it('returns no discrepancies when no actual balances are supplied', () => {
    const waterfall = computeBalanceWaterfall([posting({ asset: 'XLM', amount: '10' })], { XLM: '0' })
    expect(detectDiscrepancies(waterfall, null)).toHaveLength(0)
  })

  it('ignores sub-stroop rounding noise', () => {
    const waterfall = computeBalanceWaterfall([posting({ asset: 'XLM', amount: '10.0000001' })], { XLM: '0' })
    expect(detectDiscrepancies(waterfall, { XLM: '10.0000002' })).toHaveLength(0)
  })
})

describe('findUnresolvedItems', () => {
  it('flags failed transactions, uncategorized postings, and unknown assets', () => {
    const postings = [
      posting({ id: 'a', transactionSuccessful: false }),
      posting({ id: 'b', category: null }),
      posting({ id: 'c', asset: 'UNKNOWN' }),
      posting({ id: 'd', category: 'General' }),
    ]
    const items = findUnresolvedItems(postings)
    expect(items.some((i) => i.postingId === 'a' && i.reason === 'failed-transaction')).toBe(true)
    expect(items.some((i) => i.postingId === 'b' && i.reason === 'uncategorized')).toBe(true)
    expect(items.some((i) => i.postingId === 'c')).toBe(true)
    expect(items.some((i) => i.postingId === 'd')).toBe(false)
  })

  it('flags disposals with missing cost basis from a realized gain/loss list', () => {
    const postings = [posting({ id: 'a', asset: 'USDC:GX', ledgerCloseTime: '2026-02-01T00:00:00.000Z' })]
    const realized: RealizedGainLoss[] = [{ asset: 'USDC:GX', disposedAt: '2026-02-01T00:00:00.000Z', quantity: '5', proceedsPerUnit: '0', costBasisPerUnit: '0', gainLoss: '0', costBasisMissing: true }]
    const items = findUnresolvedItems(postings, realized)
    expect(items.some((i) => i.reason === 'missing-cost-basis')).toBe(true)
  })
})

describe('buildPeriod', () => {
  it('filters postings to the period window and computes the waterfall/discrepancies together', () => {
    const period = buildPeriod({
      id: 'p1', label: 'January', startTime: '2026-01-01T00:00:00.000Z', endTime: '2026-02-01T00:00:00.000Z',
      postings: [
        posting({ id: 'in-window', ledgerCloseTime: '2026-01-15T00:00:00.000Z', amount: '10' }),
        posting({ id: 'out-of-window', ledgerCloseTime: '2026-03-01T00:00:00.000Z', amount: '999' }),
      ],
      openingBalances: { XLM: '0' },
      actualClosingBalances: { XLM: '10' },
    })
    expect(period.postings).toHaveLength(1)
    expect(period.postings[0].id).toBe('in-window')
    expect(period.discrepancies).toHaveLength(0)
    expect(period.status).toBe('open')
    expect(period.reviewStatus).toBe('unreviewed')
  })
})

describe('period lifecycle helpers', () => {
  const period = buildPeriod({
    id: 'p1', label: 'January', startTime: '2026-01-01T00:00:00.000Z', endTime: '2026-02-01T00:00:00.000Z',
    postings: [posting({ amount: '10' })], openingBalances: { XLM: '0' },
  })

  it('closes a period', () => {
    expect(closePeriod(period).status).toBe('closed')
  })

  it('updates review status', () => {
    expect(setReviewStatus(period, 'approved').reviewStatus).toBe('approved')
  })

  it('rolls computed closing balances forward as next opening balances', () => {
    const closing = computedClosingBalances(period)
    expect(deriveNextOpeningBalances(period)).toEqual(closing)
    expect(closing.XLM).toBe('10')
  })
})
