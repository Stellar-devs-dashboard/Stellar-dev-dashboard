import { beforeEach, describe, expect, it } from 'vitest';
import {
  computeAssetBalances,
  detectDiscrepancies,
  groupPostingsByCategory,
  groupPostingsByCounterparty,
  mergePostingSources,
  resetDiscrepancyIdSequence,
} from './reconcile';
import { resetPostingIdSequence } from './normalize';
import type { LedgerPosting } from '../../types/treasury';

const NATIVE = { kind: 'native' as const, code: 'XLM', decimals: 7 };
const USDC = { kind: 'credit' as const, code: 'USDC:GISSUER', issuer: 'GISSUER', decimals: 7 };

beforeEach(() => {
  resetPostingIdSequence();
  resetDiscrepancyIdSequence();
});

function posting(overrides: Partial<LedgerPosting> = {}): LedgerPosting {
  return {
    id: overrides.id ?? `p-${Math.random()}`,
    txHash: 'tx1',
    ledger: 1,
    timestamp: '2024-01-01T00:00:00Z',
    kind: 'payment',
    asset: NATIVE,
    amount: '10',
    successful: true,
    provenance: { sourceType: 'operation', sourceId: 'op1' },
    ...overrides,
  };
}

describe('mergePostingSources', () => {
  it('concatenates all four sources and sorts by timestamp', () => {
    const merged = mergePostingSources({
      operationPostings: [posting({ id: 'a', timestamp: '2024-01-02T00:00:00Z' })],
      feePostings: [posting({ id: 'b', kind: 'fee', timestamp: '2024-01-01T00:00:00Z' })],
      tradePostings: [],
      effectPostings: [],
    });
    expect(merged.map((p) => p.id)).toEqual(['b', 'a']);
  });

  it('drops the zero-amount operation-derived claim marker when a resolved effect-derived claim exists for the same tx', () => {
    const marker = posting({ id: 'marker', kind: 'claimable_balance_claim', amount: '0', txHash: 'tx-claim', needsReview: true });
    const resolved = posting({ id: 'resolved', kind: 'claimable_balance_claim', amount: '42', txHash: 'tx-claim' });
    const merged = mergePostingSources({
      operationPostings: [marker],
      feePostings: [],
      tradePostings: [],
      effectPostings: [resolved],
    });
    expect(merged.map((p) => p.id)).toEqual(['resolved']);
  });

  it('keeps an unresolved claim marker when no matching effect exists', () => {
    const marker = posting({ id: 'marker', kind: 'claimable_balance_claim', amount: '0', txHash: 'tx-claim', needsReview: true });
    const merged = mergePostingSources({ operationPostings: [marker], feePostings: [], tradePostings: [], effectPostings: [] });
    expect(merged.map((p) => p.id)).toEqual(['marker']);
  });
});

describe('computeAssetBalances', () => {
  it('computes inflow/outflow/net/closing for a single asset', () => {
    const [balance] = computeAssetBalances([posting({ amount: '100' }), posting({ amount: '-30' })]);
    expect(balance.inflow).toBe('100');
    expect(balance.outflow).toBe('30');
    expect(balance.netChange).toBe('70');
    expect(balance.opening).toBe('0');
    expect(balance.closing).toBe('70');
    expect(balance.postingCount).toBe(2);
  });

  it('carries forward a supplied opening balance', () => {
    const [balance] = computeAssetBalances([posting({ amount: '10' })], { XLM: '500' });
    expect(balance.opening).toBe('500');
    expect(balance.closing).toBe('510');
  });

  it('handles many small amounts without floating-point rounding error', () => {
    const postings = Array.from({ length: 1000 }, () => posting({ amount: '0.0000001' }));
    const [balance] = computeAssetBalances(postings);
    expect(balance.closing).toBe('0.0001'); // 1000 stroops = 0.0001, exact
  });

  it('reports assets that have an opening balance but no activity this period', () => {
    const balances = computeAssetBalances([], { XLM: '250' });
    expect(balances).toHaveLength(1);
    expect(balances[0].closing).toBe('250');
    expect(balances[0].postingCount).toBe(0);
  });

  it('separates balances per distinct asset code', () => {
    const balances = computeAssetBalances([posting({ asset: NATIVE, amount: '10' }), posting({ asset: USDC, amount: '5' })]);
    expect(balances.map((b) => b.asset.code).sort()).toEqual(['USDC:GISSUER', 'XLM']);
  });
});

describe('groupPostings helpers', () => {
  it('groups by category, using "uncategorized" for postings with none', () => {
    const groups = groupPostingsByCategory([posting({ category: 'fees' }), posting()]);
    expect(Object.keys(groups).sort()).toEqual(['fees', 'uncategorized']);
  });

  it('groups by counterparty, using "unknown" when absent', () => {
    const groups = groupPostingsByCounterparty([posting({ counterparty: 'GABC' }), posting()]);
    expect(Object.keys(groups).sort()).toEqual(['GABC', 'unknown']);
  });
});

describe('detectDiscrepancies', () => {
  it('reports a paging-gap warning verbatim as an info/warning discrepancy', () => {
    const discrepancies = detectDiscrepancies({
      periodId: 'p1',
      postings: [],
      balances: [],
      costBasisEntries: [],
      pagingGapWarnings: ['hit the safety cap'],
    });
    expect(discrepancies.some((d) => d.kind === 'paging-gap' && d.message === 'hit the safety cap')).toBe(true);
  });

  it('surfaces needs-review postings as discrepancies', () => {
    const flagged = posting({ id: 'flag1', kind: 'contract_transfer', needsReview: true, reviewReason: 'unresolved transfer' });
    const discrepancies = detectDiscrepancies({ periodId: 'p1', postings: [flagged], balances: [], costBasisEntries: [] });
    expect(discrepancies.some((d) => d.kind === 'unresolved-contract-transfer' && d.postingIds.includes('flag1'))).toBe(true);
  });

  it('classifies a sub-stroop delta as rounding, not unexplained-delta', () => {
    const balances = computeAssetBalances([posting({ amount: '10.0000001' })]);
    const discrepancies = detectDiscrepancies({
      periodId: 'p1',
      postings: [],
      balances,
      costBasisEntries: [],
      expectedClosingBalances: { XLM: '10.0000000' },
    });
    expect(discrepancies.some((d) => d.kind === 'rounding')).toBe(true);
    expect(discrepancies.some((d) => d.kind === 'unexplained-delta')).toBe(false);
  });

  it('classifies a larger delta as a critical unexplained-delta', () => {
    const balances = computeAssetBalances([posting({ amount: '10' })]);
    const discrepancies = detectDiscrepancies({
      periodId: 'p1',
      postings: [],
      balances,
      costBasisEntries: [],
      expectedClosingBalances: { XLM: '5' },
    });
    const found = discrepancies.find((d) => d.kind === 'unexplained-delta');
    expect(found?.severity).toBe('critical');
  });

  it('does not flag a discrepancy when computed balance matches expected exactly', () => {
    const balances = computeAssetBalances([posting({ amount: '10' })]);
    const discrepancies = detectDiscrepancies({
      periodId: 'p1',
      postings: [],
      balances,
      costBasisEntries: [],
      expectedClosingBalances: { XLM: '10' },
    });
    expect(discrepancies).toHaveLength(0);
  });

  it('flags missing cost-basis price for a non-native asset with activity', () => {
    const balances = computeAssetBalances([posting({ asset: USDC, amount: '10' })]);
    const discrepancies = detectDiscrepancies({ periodId: 'p1', postings: [], balances, costBasisEntries: [] });
    expect(discrepancies.some((d) => d.kind === 'missing-price' && d.assetCode === USDC.code)).toBe(true);
  });

  it('does not flag missing price for XLM (native asset is optional to price)', () => {
    const balances = computeAssetBalances([posting({ asset: NATIVE, amount: '10' })]);
    const discrepancies = detectDiscrepancies({ periodId: 'p1', postings: [], balances, costBasisEntries: [] });
    expect(discrepancies.some((d) => d.kind === 'missing-price')).toBe(false);
  });

  it('detects an asset-code collision across two different issuers using the same code', () => {
    const collidingAsset = { kind: 'credit' as const, code: 'USDC:GOTHERISSUER', issuer: 'GOTHERISSUER', decimals: 7 };
    const postings = [posting({ id: 'a', asset: USDC }), posting({ id: 'b', asset: collidingAsset })];
    const discrepancies = detectDiscrepancies({ periodId: 'p1', postings, balances: [], costBasisEntries: [] });
    const found = discrepancies.find((d) => d.kind === 'asset-code-collision');
    expect(found).toBeDefined();
    expect(found?.postingIds.sort()).toEqual(['a', 'b']);
  });

  it('does not flag a collision when only one issuer uses a given code', () => {
    const discrepancies = detectDiscrepancies({ periodId: 'p1', postings: [posting({ asset: USDC })], balances: [], costBasisEntries: [] });
    expect(discrepancies.some((d) => d.kind === 'asset-code-collision')).toBe(false);
  });
});
