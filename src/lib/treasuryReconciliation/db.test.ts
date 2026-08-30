import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import * as db from './db';
import type { CategoryRule, CostBasisEntry, ReconciliationPeriod, ReviewRecord } from '../../types/treasury';

// `db.ts` caches a single IndexedDB connection at module scope (matching
// alertRulesDb.ts), so tests share one database for the whole file, same as
// a real browser tab that's never refreshed. Every test therefore uses a
// unique account/id per case rather than relying on isolation between
// tests — this is more robust than trying to reset the connection anyway,
// since it also matches how the real app behaves across renders.
let counter = 0;
function uniqueAccount() {
  counter += 1;
  return `GACCOUNT${counter}AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`.slice(0, 56);
}

function period(accountId: string, overrides: Partial<ReconciliationPeriod> = {}): ReconciliationPeriod {
  return {
    id: `${accountId}:testnet:2024-01-01`,
    accountId,
    network: 'testnet',
    start: '2024-01-01',
    end: '2024-02-01',
    status: 'open',
    createdAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('periods', () => {
  it('saves and retrieves periods scoped to an account', async () => {
    const account = uniqueAccount();
    await db.savePeriod(period(account));
    const periods = await db.getPeriods(account);
    expect(periods).toHaveLength(1);
    expect(periods[0].accountId).toBe(account);
  });

  it('does not return periods belonging to a different account', async () => {
    const account = uniqueAccount();
    const otherAccount = uniqueAccount();
    await db.savePeriod(period(account));
    expect(await db.getPeriods(otherAccount)).toHaveLength(0);
  });

  it('deletes a period', async () => {
    const account = uniqueAccount();
    await db.savePeriod(period(account));
    await db.deletePeriod(period(account).id);
    expect(await db.getPeriods(account)).toHaveLength(0);
  });
});

describe('snapshots — immutability', () => {
  it('saves and retrieves a snapshot by period id', async () => {
    const account = uniqueAccount();
    const snapshot = {
      schemaVersion: 1 as const,
      period: period(account, { status: 'closed' }),
      postings: [],
      balances: [],
      discrepancies: [],
      review: [],
      generatedAt: '2024-02-01T00:00:00Z',
      checksum: 'abc123',
    };
    await db.saveSnapshot(snapshot);
    const loaded = await db.getSnapshot(snapshot.period.id);
    expect(loaded?.checksum).toBe('abc123');
  });

  it('refuses to overwrite an existing snapshot for the same period', async () => {
    const account = uniqueAccount();
    const snapshot = {
      schemaVersion: 1 as const,
      period: period(account, { status: 'closed' }),
      postings: [],
      balances: [],
      discrepancies: [],
      review: [],
      generatedAt: '2024-02-01T00:00:00Z',
      checksum: 'first',
    };
    await db.saveSnapshot(snapshot);
    await expect(db.saveSnapshot({ ...snapshot, checksum: 'second' })).rejects.toThrow(/already exists/i);
    const loaded = await db.getSnapshot(snapshot.period.id);
    expect(loaded?.checksum).toBe('first');
  });

  it('returns undefined for a period with no snapshot', async () => {
    expect(await db.getSnapshot(`never-closed-${uniqueAccount()}`)).toBeUndefined();
  });
});

describe('rules', () => {
  it('saves and retrieves rules scoped to an account', async () => {
    const account = uniqueAccount();
    const rule: CategoryRule = { id: 'r1', priority: 0, enabled: true, name: 'Fees', match: { kind: 'fee' }, category: 'network-fee' };
    await db.saveRule(account, rule);
    const rules = await db.getRules(account);
    expect(rules).toHaveLength(1);
    expect(rules[0].id).toBe('r1');
  });

  it('deletes a rule', async () => {
    const account = uniqueAccount();
    const rule: CategoryRule = { id: 'r1', priority: 0, enabled: true, name: 'Fees', match: { kind: 'fee' }, category: 'network-fee' };
    await db.saveRule(account, rule);
    await db.deleteRule(account, 'r1');
    expect(await db.getRules(account)).toHaveLength(0);
  });

  it('scopes rules per account so two accounts do not see each other\'s rules', async () => {
    const accountA = uniqueAccount();
    const accountB = uniqueAccount();
    const rule: CategoryRule = { id: 'r1', priority: 0, enabled: true, name: 'Fees', match: { kind: 'fee' }, category: 'network-fee' };
    await db.saveRule(accountA, rule);
    await db.saveRule(accountB, { ...rule, id: 'r2' });
    expect(await db.getRules(accountA)).toHaveLength(1);
    expect(await db.getRules(accountB)).toHaveLength(1);
  });
});

describe('cost basis entries', () => {
  it('saves, retrieves, and deletes cost-basis entries', async () => {
    const account = uniqueAccount();
    const entry: CostBasisEntry = { id: 'cb1', assetCode: 'USDC', effectiveDate: '2024-01-01', pricePerUnit: '1', currency: 'USD', source: 'exchange' };
    await db.saveCostBasisEntry(account, entry);
    expect(await db.getCostBasisEntries(account)).toHaveLength(1);
    await db.deleteCostBasisEntry(account, 'cb1');
    expect(await db.getCostBasisEntries(account)).toHaveLength(0);
  });
});

describe('review state', () => {
  it('saves and retrieves review records, keyed by target type + id', async () => {
    const account = uniqueAccount();
    const review: ReviewRecord = { targetId: 'disc1', targetType: 'discrepancy', status: 'resolved', updatedAt: '2024-01-01T00:00:00Z' };
    await db.saveReview(account, review);
    const records = await db.getReviewState(account);
    expect(records).toHaveLength(1);
    expect(records[0].status).toBe('resolved');
  });

  it('overwrites the prior review for the same target rather than duplicating', async () => {
    const account = uniqueAccount();
    await db.saveReview(account, { targetId: 'disc1', targetType: 'discrepancy', status: 'unresolved', updatedAt: 't1' });
    await db.saveReview(account, { targetId: 'disc1', targetType: 'discrepancy', status: 'resolved', updatedAt: 't2' });
    const records = await db.getReviewState(account);
    expect(records).toHaveLength(1);
    expect(records[0].status).toBe('resolved');
  });
});
