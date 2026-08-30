import { describe, expect, it } from 'vitest';
import { applyCategoryRules, recategorize, validateRule } from './rules';
import type { CategoryRule, LedgerPosting } from '../../types/treasury';

function posting(overrides: Partial<LedgerPosting> = {}): LedgerPosting {
  return {
    id: 'p1',
    txHash: 'tx1',
    ledger: 1,
    timestamp: '2024-01-01T00:00:00Z',
    kind: 'payment',
    asset: { kind: 'native', code: 'XLM', decimals: 7 },
    amount: '10',
    successful: true,
    provenance: { sourceType: 'operation', sourceId: 'op1' },
    ...overrides,
  };
}

describe('validateRule', () => {
  it('requires at least one match criterion', () => {
    const errors = validateRule({ id: 'r1', priority: 0, enabled: true, name: 'x', match: {}, category: 'c' });
    expect(errors.some((e) => e.includes('at least one'))).toBe(true);
  });

  it('accepts a rule matching on kind alone', () => {
    const errors = validateRule({ id: 'r1', priority: 0, enabled: true, name: 'x', match: { kind: 'fee' }, category: 'c' });
    expect(errors).toHaveLength(0);
  });
});

describe('applyCategoryRules', () => {
  it('assigns a category when a rule matches', () => {
    const rules: CategoryRule[] = [{ id: 'r1', priority: 0, enabled: true, name: 'Fees', match: { kind: 'fee' }, category: 'network-fee' }];
    const [result] = applyCategoryRules([posting({ kind: 'fee' })], rules);
    expect(result.category).toBe('network-fee');
    expect(result.provenance.ruleId).toBe('r1');
  });

  it('leaves category unset when no rule matches', () => {
    const [result] = applyCategoryRules([posting()], []);
    expect(result.category).toBeUndefined();
  });

  it('uses the first matching rule by ascending priority, ignoring array order', () => {
    const rules: CategoryRule[] = [
      { id: 'low-priority', priority: 5, enabled: true, name: 'B', match: { kind: 'payment' }, category: 'wrong' },
      { id: 'high-priority', priority: 1, enabled: true, name: 'A', match: { kind: 'payment' }, category: 'right' },
    ];
    const [result] = applyCategoryRules([posting()], rules);
    expect(result.category).toBe('right');
  });

  it('skips disabled rules', () => {
    const rules: CategoryRule[] = [{ id: 'r1', priority: 0, enabled: false, name: 'x', match: { kind: 'payment' }, category: 'nope' }];
    const [result] = applyCategoryRules([posting()], rules);
    expect(result.category).toBeUndefined();
  });

  it('matches on counterparty substring case-insensitively', () => {
    const rules: CategoryRule[] = [
      { id: 'r1', priority: 0, enabled: true, name: 'Vendor', match: { counterparty: 'gvendor' }, category: 'vendor-payment', counterpartyLabel: 'Acme Vendor' },
    ];
    const [result] = applyCategoryRules([posting({ counterparty: 'GVENDORAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' })], rules);
    expect(result.category).toBe('vendor-payment');
    expect(result.counterpartyLabel).toBe('Acme Vendor');
  });

  it('does not mutate the input posting array', () => {
    const rules: CategoryRule[] = [{ id: 'r1', priority: 0, enabled: true, name: 'x', match: { kind: 'payment' }, category: 'c' }];
    const input = [posting()];
    applyCategoryRules(input, rules);
    expect(input[0].category).toBeUndefined();
  });
});

describe('recategorize', () => {
  it('replaces a previously assigned category when rules change', () => {
    const original = applyCategoryRules(
      [posting({ kind: 'fee' })],
      [{ id: 'r1', priority: 0, enabled: true, name: 'x', match: { kind: 'fee' }, category: 'old-category' }]
    );
    const updated = recategorize(original, [
      { id: 'r2', priority: 0, enabled: true, name: 'y', match: { kind: 'fee' }, category: 'new-category' },
    ]);
    expect(updated[0].category).toBe('new-category');
  });
});
