import { beforeEach, describe, expect, it } from 'vitest'
import 'fake-indexeddb/auto'
import {
  loadCategoryRules,
  loadCostBasisEntries,
  loadCounterpartyLabels,
  loadSnapshots,
  saveCategoryRules,
  saveCostBasisEntries,
  saveCounterpartyLabels,
  saveSnapshot,
} from '../records'
import { createPeriodSnapshot } from '../snapshot'
import { buildPeriod } from '../reconciliation'
import type { LedgerPosting } from '../../../types/treasury'

function posting(overrides: Partial<LedgerPosting> = {}): LedgerPosting {
  return {
    id: 'p1', txHash: 'tx1', operationId: 'op1', ledgerCloseTime: '2026-01-15T00:00:00.000Z',
    type: 'payment-in', asset: 'XLM', amount: '10', counterparty: null, memo: null,
    transactionSuccessful: true, category: 'General', counterpartyLabel: null,
    provenance: { source: 'derived', note: 'test' }, ...overrides,
  }
}

describe('treasury records store', () => {
  beforeEach(async () => {
    await saveCategoryRules([])
    await saveCounterpartyLabels([])
    await saveCostBasisEntries([])
  })

  it('persists and reloads category rules', async () => {
    await saveCategoryRules([{ id: 'r1', priority: 1, matchers: [{ field: 'type', pattern: 'fee' }], category: 'Fees', enabled: true }])
    const rules = await loadCategoryRules()
    expect(rules).toHaveLength(1)
    expect(rules[0].category).toBe('Fees')
  })

  it('persists and reloads counterparty labels', async () => {
    await saveCounterpartyLabels([{ address: 'GABC', label: 'Exchange', tags: ['dex'] }])
    const labels = await loadCounterpartyLabels()
    expect(labels).toHaveLength(1)
    expect(labels[0].label).toBe('Exchange')
  })

  it('persists and reloads cost basis entries', async () => {
    await saveCostBasisEntries([{ asset: 'XLM', unitPrice: '0.12', currency: 'USD', effectiveAt: '2026-01-01T00:00:00.000Z', source: 'manual' }])
    const entries = await loadCostBasisEntries()
    expect(entries).toHaveLength(1)
    expect(entries[0].unitPrice).toBe('0.12')
  })

  it('replaces the full rule set on each save (not an append)', async () => {
    await saveCategoryRules([{ id: 'r1', priority: 1, matchers: [{ field: 'type', pattern: 'fee' }], category: 'Fees', enabled: true }])
    await saveCategoryRules([{ id: 'r2', priority: 1, matchers: [{ field: 'type', pattern: 'trade' }], category: 'Trading', enabled: true }])
    const rules = await loadCategoryRules()
    expect(rules).toHaveLength(1)
    expect(rules[0].id).toBe('r2')
  })

  it('saves and lists snapshots newest first', async () => {
    const period = buildPeriod({ id: 'p1', label: 'Jan', startTime: '2026-01-01T00:00:00.000Z', endTime: '2026-02-01T00:00:00.000Z', postings: [posting()], openingBalances: {} })
    const older = await createPeriodSnapshot(period, 'snap-older', new Date('2026-01-01T00:00:00.000Z'))
    const newer = await createPeriodSnapshot(period, 'snap-newer', new Date('2026-06-01T00:00:00.000Z'))
    await saveSnapshot(older)
    await saveSnapshot(newer)
    const snapshots = await loadSnapshots()
    expect(snapshots.map((s) => s.id)).toEqual(['snap-newer', 'snap-older'])
  })
})
