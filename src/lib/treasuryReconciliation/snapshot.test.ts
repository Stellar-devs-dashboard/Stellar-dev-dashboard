import { describe, expect, it } from 'vitest';
import { buildPeriodSnapshot, computeSnapshotChecksum, fnv1aHash, loadPeriodSnapshot, verifySnapshotIntegrity } from './snapshot';
import type { SnapshotMigrationError } from './snapshot';
import type { AssetBalance, LedgerPosting, ReconciliationPeriod } from '../../types/treasury';

function expectRejected(result: ReturnType<typeof loadPeriodSnapshot>): asserts result is SnapshotMigrationError {
  if (result.ok) throw new Error('expected loadPeriodSnapshot to reject this payload');
}

const period: ReconciliationPeriod = {
  id: 'acct:testnet:2024-01-01',
  accountId: 'GACCT',
  network: 'testnet',
  start: '2024-01-01',
  end: '2024-02-01',
  status: 'open',
  createdAt: '2024-01-01T00:00:00Z',
};

const postings: LedgerPosting[] = [
  {
    id: 'p1',
    txHash: 'tx1',
    ledger: 1,
    timestamp: '2024-01-05T00:00:00Z',
    kind: 'payment',
    asset: { kind: 'native', code: 'XLM', decimals: 7 },
    amount: '10',
    successful: true,
    provenance: { sourceType: 'operation', sourceId: 'op1' },
  },
];

const balances: AssetBalance[] = [
  { asset: { kind: 'native', code: 'XLM', decimals: 7 }, opening: '0', closing: '10', netChange: '10', inflow: '10', outflow: '0', postingCount: 1 },
];

describe('fnv1aHash', () => {
  it('is deterministic for the same input', () => {
    expect(fnv1aHash('hello')).toBe(fnv1aHash('hello'));
  });

  it('differs for different input', () => {
    expect(fnv1aHash('hello')).not.toBe(fnv1aHash('world'));
  });
});

describe('buildPeriodSnapshot / verifySnapshotIntegrity', () => {
  it('produces a snapshot whose checksum verifies against its own contents', () => {
    const snapshot = buildPeriodSnapshot(period, postings, balances, [], []);
    expect(verifySnapshotIntegrity(snapshot)).toBe(true);
  });

  it('is order-independent: shuffled postings/balances still checksum the same', () => {
    const a = computeSnapshotChecksum(postings, balances);
    const b = computeSnapshotChecksum([...postings].reverse(), [...balances].reverse());
    expect(a).toBe(b);
  });

  it('detects tampering: mutating a posting amount after the fact breaks the checksum', () => {
    const snapshot = buildPeriodSnapshot(period, postings, balances, [], []);
    const tampered = { ...snapshot, postings: [{ ...snapshot.postings[0], amount: '999999' }] };
    expect(verifySnapshotIntegrity(tampered)).toBe(false);
  });
});

describe('loadPeriodSnapshot', () => {
  it('accepts a snapshot with a valid schema version and matching checksum', () => {
    const snapshot = buildPeriodSnapshot(period, postings, balances, [], []);
    const result = loadPeriodSnapshot(JSON.parse(JSON.stringify(snapshot)));
    expect(result.ok).toBe(true);
  });

  it('rejects a snapshot with an unsupported schema version', () => {
    const snapshot = buildPeriodSnapshot(period, postings, balances, [], []);
    const result = loadPeriodSnapshot({ ...snapshot, schemaVersion: 99 });
    expectRejected(result);
    expect(result.error).toMatch(/schema version/i);
  });

  it('rejects a payload missing required fields', () => {
    const result = loadPeriodSnapshot({ schemaVersion: 1 });
    expect(result.ok).toBe(false);
  });

  it('rejects a hand-edited snapshot whose checksum no longer matches', () => {
    const snapshot = buildPeriodSnapshot(period, postings, balances, [], []);
    const tampered = { ...snapshot, balances: [{ ...snapshot.balances[0], closing: '999999' }] };
    const result = loadPeriodSnapshot(tampered);
    expectRejected(result);
    expect(result.error).toMatch(/checksum/i);
  });

  it('rejects a non-object payload', () => {
    expect(loadPeriodSnapshot(null).ok).toBe(false);
    expect(loadPeriodSnapshot('not an object').ok).toBe(false);
  });
});
