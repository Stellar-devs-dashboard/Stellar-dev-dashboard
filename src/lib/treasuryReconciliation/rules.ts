/**
 * Configurable account/category rules: assign a `category` and optional
 * `counterpartyLabel` to a posting. Rules are evaluated in ascending
 * `priority` order; the first enabled rule whose `match` fields all match
 * wins. A posting that matches no rule keeps `category` unset rather than
 * being force-assigned "uncategorized" — callers decide how to present that.
 */

import type { CategoryRule, LedgerPosting, Provenance } from '../../types/treasury';

export const DEFAULT_CATEGORY_RULES: CategoryRule[] = [
  { id: 'default-fee', priority: 0, enabled: true, name: 'Network fees', match: { kind: 'fee' }, category: 'network-fee' },
  {
    id: 'default-sponsorship',
    priority: 1,
    enabled: true,
    name: 'Sponsorship changes',
    match: { kind: 'sponsorship' },
    category: 'sponsorship',
  },
];

function matchesRule(posting: LedgerPosting, rule: CategoryRule): boolean {
  const { match } = rule;
  if (match.kind && posting.kind !== match.kind) return false;
  if (match.assetCode && posting.asset.code.toLowerCase() !== match.assetCode.toLowerCase()) return false;
  if (
    match.counterparty &&
    (!posting.counterparty || !posting.counterparty.toLowerCase().includes(match.counterparty.toLowerCase()))
  ) {
    return false;
  }
  if (match.memoContains && (!posting.memo || !posting.memo.toLowerCase().includes(match.memoContains.toLowerCase()))) {
    return false;
  }
  // A rule with no match criteria at all would match everything, which is
  // almost certainly a configuration mistake — require at least one field.
  const hasCriteria = Boolean(match.kind || match.assetCode || match.counterparty || match.memoContains);
  return hasCriteria;
}

export function validateRule(rule: CategoryRule): string[] {
  const errors: string[] = [];
  if (!rule.id.trim()) errors.push('Rule id is required.');
  if (!rule.name.trim()) errors.push('Rule name is required.');
  if (!rule.category.trim()) errors.push('Rule category is required.');
  const hasCriteria = Boolean(
    rule.match.kind || rule.match.assetCode || rule.match.counterparty || rule.match.memoContains
  );
  if (!hasCriteria) errors.push('Rule must match on at least one of: kind, assetCode, counterparty, memoContains.');
  return errors;
}

/**
 * Applies rules to postings, returning new posting objects (never mutates
 * input) with `category`/`counterpartyLabel`/`provenance.ruleId` set for
 * whichever rule matched first. Rules are re-sorted by priority so callers
 * don't have to pre-sort a user-edited rule list.
 */
export function applyCategoryRules(postings: LedgerPosting[], rules: CategoryRule[]): LedgerPosting[] {
  const enabled = [...rules].filter((rule) => rule.enabled).sort((a, b) => a.priority - b.priority);
  return postings.map((posting) => {
    const matched = enabled.find((rule) => matchesRule(posting, rule));
    if (!matched) return posting;
    const provenance: Provenance = { ...posting.provenance, ruleId: matched.id };
    return {
      ...posting,
      category: matched.category,
      counterpartyLabel: matched.counterpartyLabel ?? posting.counterpartyLabel,
      provenance,
    };
  });
}

/** Reassigns categories after a rule set changes without re-fetching ledger data. */
export function recategorize(postings: LedgerPosting[], rules: CategoryRule[]): LedgerPosting[] {
  const stripped = postings.map((posting) => ({
    ...posting,
    category: undefined,
    provenance: { ...posting.provenance, ruleId: undefined },
  }));
  return applyCategoryRules(stripped, rules);
}
