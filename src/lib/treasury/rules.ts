import type { CategoryRule, CounterpartyLabel, LedgerPosting } from '../../types/treasury'

export const DEFAULT_CATEGORY_RULES: CategoryRule[] = [
  { id: 'rule-fee', priority: 0, matchers: [{ field: 'type', pattern: 'fee' }], category: 'Network fees', enabled: true },
  { id: 'rule-trade', priority: 10, matchers: [{ field: 'type', pattern: 'trade' }], category: 'Trading', enabled: true },
  { id: 'rule-claimable', priority: 20, matchers: [{ field: 'type', pattern: 'claimable-balance-*' }], category: 'Claimable balances', enabled: true },
  { id: 'rule-sponsorship', priority: 30, matchers: [{ field: 'type', pattern: 'sponsorship' }], category: 'Sponsorship', enabled: true },
]

function matchesPattern(value: string, pattern: string): boolean {
  if (!pattern.includes('*')) return value === pattern
  const escaped = pattern.split('*').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')
  return new RegExp(`^${escaped}$`).test(value)
}

function fieldValue(posting: LedgerPosting, field: CategoryRule['matchers'][number]['field']): string {
  switch (field) {
    case 'type':
      return posting.type
    case 'asset':
      return posting.asset
    case 'counterparty':
      return posting.counterparty || ''
    case 'memo':
      return posting.memo || ''
    default:
      return ''
  }
}

/** Finds the highest-priority (lowest `priority` number) enabled rule whose matchers all pass. Later rules never override an already-matched posting when iterating `applyRules`, so rule order is deterministic and explainable. */
export function matchRule(posting: LedgerPosting, rules: CategoryRule[]): CategoryRule | null {
  const candidates = rules
    .filter((rule) => rule.enabled)
    .filter((rule) => rule.matchers.every((matcher) => matchesPattern(fieldValue(posting, matcher.field), matcher.pattern)))
    .sort((a, b) => a.priority - b.priority)
  return candidates[0] || null
}

export function applyRules(postings: LedgerPosting[], rules: CategoryRule[]): LedgerPosting[] {
  return postings.map((posting) => {
    const rule = matchRule(posting, rules)
    if (!rule) return posting
    return { ...posting, category: rule.category, provenance: { source: 'rule' as const, note: `Matched rule "${rule.id}"` } }
  })
}

export function labelCounterparties(postings: LedgerPosting[], labels: CounterpartyLabel[]): LedgerPosting[] {
  const byAddress = new Map(labels.map((label) => [label.address, label]))
  return postings.map((posting) => {
    if (!posting.counterparty) return posting
    const label = byAddress.get(posting.counterparty)
    return label ? { ...posting, counterpartyLabel: label.label } : posting
  })
}

export function validateRule(rule: Pick<CategoryRule, 'matchers' | 'category'>): string[] {
  const issues: string[] = []
  if (!rule.category.trim()) issues.push('Category name is required.')
  if (rule.category.length > 100) issues.push('Category name must be 100 characters or fewer.')
  if (!rule.matchers.length) issues.push('At least one matcher is required.')
  for (const matcher of rule.matchers) {
    if (!matcher.pattern.trim()) issues.push(`Matcher on "${matcher.field}" has an empty pattern.`)
    if (matcher.pattern.length > 200) issues.push(`Matcher on "${matcher.field}" exceeds the 200-character limit.`)
  }
  return issues
}
