import { describe, expect, it } from 'vitest'
import { createPeriodSnapshot, verifySnapshotIntegrity } from '../snapshot'
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

const period = buildPeriod({
  id: 'p1', label: 'January', startTime: '2026-01-01T00:00:00.000Z', endTime: '2026-02-01T00:00:00.000Z',
  postings: [posting()], openingBalances: { XLM: '0' },
})

describe('createPeriodSnapshot / verifySnapshotIntegrity', () => {
  it('creates a snapshot whose integrity verifies immediately after creation', async () => {
    const snapshot = await createPeriodSnapshot(period, 'snap-1')
    expect(snapshot.schemaVersion).toBe(1)
    expect(await verifySnapshotIntegrity(snapshot)).toBe(true)
  })

  it('is deterministic — the same period always hashes the same way', async () => {
    const a = await createPeriodSnapshot(period, 'snap-a')
    const b = await createPeriodSnapshot(period, 'snap-b')
    expect(a.contentHash).toBe(b.contentHash)
  })

  it('is frozen (immutable) once created', async () => {
    const snapshot = await createPeriodSnapshot(period, 'snap-1')
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot.period)).toBe(true)
  })

  it('detects tampering: a mutated copy of the period fails integrity verification', async () => {
    const snapshot = await createPeriodSnapshot(period, 'snap-1')
    const tampered = { ...snapshot, period: { ...snapshot.period, discrepancies: [{ asset: 'XLM', expectedClosing: '0', computedClosing: '999', differenceAbs: '999', differencePct: null, possibleCauses: [] }] } }
    expect(await verifySnapshotIntegrity(tampered)).toBe(false)
  })

  it('rejects an unrecognized schema version outright', async () => {
    const snapshot = await createPeriodSnapshot(period, 'snap-1')
    expect(await verifySnapshotIntegrity({ ...snapshot, schemaVersion: 99 as never })).toBe(false)
  })
})
