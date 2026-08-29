import { describe, expect, it } from 'vitest'
import { applyRules, DEFAULT_CATEGORY_RULES, labelCounterparties, matchRule, validateRule } from '../rules'
import type { CategoryRule, CounterpartyLabel, LedgerPosting } from '../../../types/treasury'

function posting(overrides: Partial<LedgerPosting>): LedgerPosting {
  return {
    id: 'p1', txHash: 'tx1', operationId: 'op1', ledgerCloseTime: '2026-01-01T00:00:00.000Z',
    type: 'payment-in', asset: 'XLM', amount: '10', counterparty: null, memo: null,
    transactionSuccessful: true, category: null, counterpartyLabel: null,
    provenance: { source: 'derived', note: 'test' }, ...overrides,
  }
}

describe('matchRule / applyRules', () => {
  it('matches the fee rule for fee postings', () => {
    const rule = matchRule(posting({ type: 'fee' }), DEFAULT_CATEGORY_RULES)
    expect(rule?.category).toBe('Network fees')
  })

  it('leaves unmatched postings uncategorized', () => {
    const rule = matchRule(posting({ type: 'other' }), DEFAULT_CATEGORY_RULES)
    expect(rule).toBeNull()
  })

  it('picks the lowest-priority matching rule when multiple match', () => {
    const rules: CategoryRule[] = [
      { id: 'low', priority: 100, matchers: [{ field: 'type', pattern: 'payment-in' }], category: 'Low priority', enabled: true },
      { id: 'high', priority: 1, matchers: [{ field: 'type', pattern: 'payment-in' }], category: 'High priority', enabled: true },
    ]
    expect(matchRule(posting({ type: 'payment-in' }), rules)?.category).toBe('High priority')
  })

  it('ignores disabled rules', () => {
    const rules: CategoryRule[] = [{ id: 'r', priority: 1, matchers: [{ field: 'type', pattern: 'payment-in' }], category: 'X', enabled: false }]
    expect(matchRule(posting({ type: 'payment-in' }), rules)).toBeNull()
  })

  it('supports wildcard patterns', () => {
    const rules: CategoryRule[] = [{ id: 'r', priority: 1, matchers: [{ field: 'type', pattern: 'claimable-balance-*' }], category: 'Escrow', enabled: true }]
    expect(matchRule(posting({ type: 'claimable-balance-in' }), rules)?.category).toBe('Escrow')
    expect(matchRule(posting({ type: 'claimable-balance-out' }), rules)?.category).toBe('Escrow')
  })

  it('requires every matcher on a rule to pass', () => {
    const rules: CategoryRule[] = [{ id: 'r', priority: 1, matchers: [{ field: 'type', pattern: 'payment-in' }, { field: 'asset', pattern: 'USDC:GX' }], category: 'X', enabled: true }]
    expect(matchRule(posting({ type: 'payment-in', asset: 'XLM' }), rules)).toBeNull()
    expect(matchRule(posting({ type: 'payment-in', asset: 'USDC:GX' }), rules)?.category).toBe('X')
  })

  it('applyRules sets category and provenance without mutating the input', () => {
    const postings = [posting({ type: 'fee' })]
    const result = applyRules(postings, DEFAULT_CATEGORY_RULES)
    expect(result[0].category).toBe('Network fees')
    expect(result[0].provenance.source).toBe('rule')
    expect(postings[0].category).toBeNull()
  })
})

describe('labelCounterparties', () => {
  it('applies a label to matching counterparties and leaves others untouched', () => {
    const labels: CounterpartyLabel[] = [{ address: 'GABC', label: 'Exchange', tags: [] }]
    const postings = [posting({ counterparty: 'GABC' }), posting({ counterparty: 'GXYZ' }), posting({ counterparty: null })]
    const result = labelCounterparties(postings, labels)
    expect(result[0].counterpartyLabel).toBe('Exchange')
    expect(result[1].counterpartyLabel).toBeNull()
    expect(result[2].counterpartyLabel).toBeNull()
  })
})

describe('validateRule', () => {
  it('accepts a well-formed rule', () => {
    expect(validateRule({ matchers: [{ field: 'type', pattern: 'fee' }], category: 'Fees' })).toHaveLength(0)
  })

  it('rejects an empty category and empty matcher list', () => {
    const issues = validateRule({ matchers: [], category: '' })
    expect(issues.length).toBeGreaterThan(0)
  })

  it('rejects an oversized category name', () => {
    expect(validateRule({ matchers: [{ field: 'type', pattern: 'fee' }], category: 'x'.repeat(200) }).length).toBeGreaterThan(0)
  })
})
