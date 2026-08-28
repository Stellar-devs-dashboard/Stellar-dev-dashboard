/**
 * Reconciliation engine: merges normalized postings from every source,
 * computes per-asset opening/closing balances for a period, and detects
 * discrepancies. Pure and deterministic — the same postings + opening
 * balances always produce the same balances and discrepancies, which is
 * what makes a period snapshot reproducible/verifiable.
 */

import type { AssetBalance, CostBasisEntry, Discrepancy, LedgerPosting, TreasuryAsset } from '../../types/treasury';
import { addAmounts, formatAmount, isWithinRoundingTolerance, parseAmount } from './decimal';
import { findEffectiveCostBasis } from './costBasis';

// ─── Merging sources ────────────────────────────────────────────────────────────

export interface PostingSources {
  operationPostings: LedgerPosting[];
  feePostings: LedgerPosting[];
  tradePostings: LedgerPosting[];
  effectPostings: LedgerPosting[];
}

/**
 * Combines every normalized source into one deduplicated posting list.
 * The only overlap between sources today is `claim_claimable_balance`:
 * `normalizeOperations` emits a zero-amount, needs-review marker (Horizon
 * doesn't echo the claimed amount on the operation), and `normalizeEffects`
 * emits the real amount from the paired `claimable_balance_claimed` effect.
 * When both exist for the same transaction, the effect-derived posting
 * wins and the marker is dropped so balances aren't double-counted.
 */
export function mergePostingSources(sources: PostingSources): LedgerPosting[] {
  const { operationPostings, feePostings, tradePostings, effectPostings } = sources;

  const resolvedClaimTxHashes = new Set(
    effectPostings.filter((posting) => posting.kind === 'claimable_balance_claim').map((posting) => posting.txHash)
  );

  const filteredOperationPostings = operationPostings.filter(
    (posting) => !(posting.kind === 'claimable_balance_claim' && resolvedClaimTxHashes.has(posting.txHash))
  );

  return [...filteredOperationPostings, ...feePostings, ...tradePostings, ...effectPostings].sort((a, b) =>
    a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0
  );
}

// ─── Balances ───────────────────────────────────────────────────────────────────

function assetMapKey(asset: TreasuryAsset): string {
  return asset.code;
}

export function computeAssetBalances(
  postings: LedgerPosting[],
  openingBalances: Record<string, string> = {}
): AssetBalance[] {
  const byAsset = new Map<string, { asset: TreasuryAsset; inflow: bigint; outflow: bigint; count: number }>();

  for (const posting of postings) {
    const key = assetMapKey(posting.asset);
    const entry = byAsset.get(key) ?? { asset: posting.asset, inflow: 0n, outflow: 0n, count: 0 };
    const amount = parseAmount(posting.amount);
    if (amount >= 0n) entry.inflow = addAmounts(entry.inflow, amount);
    else entry.outflow = addAmounts(entry.outflow, -amount);
    entry.count += 1;
    byAsset.set(key, entry);
  }

  // Also surface assets that only have an opening balance and no postings
  // this period (nothing happened, but the balance should still be reported).
  for (const key of Object.keys(openingBalances)) {
    if (!byAsset.has(key)) {
      byAsset.set(key, { asset: { kind: 'credit', code: key, decimals: 7 }, inflow: 0n, outflow: 0n, count: 0 });
    }
  }

  const balances: AssetBalance[] = [];
  for (const [key, entry] of byAsset) {
    const opening = parseAmount(openingBalances[key] ?? '0');
    const netChange = entry.inflow - entry.outflow;
    const closing = opening + netChange;
    balances.push({
      asset: entry.asset,
      opening: formatAmount(opening),
      closing: formatAmount(closing),
      netChange: formatAmount(netChange),
      inflow: formatAmount(entry.inflow),
      outflow: formatAmount(entry.outflow),
      postingCount: entry.count,
    });
  }

  return balances.sort((a, b) => a.asset.code.localeCompare(b.asset.code));
}

// ─── Grouping ───────────────────────────────────────────────────────────────────

export function groupPostingsByCategory(postings: LedgerPosting[]): Record<string, LedgerPosting[]> {
  const groups: Record<string, LedgerPosting[]> = {};
  for (const posting of postings) {
    const key = posting.category ?? 'uncategorized';
    (groups[key] ??= []).push(posting);
  }
  return groups;
}

export function groupPostingsByCounterparty(postings: LedgerPosting[]): Record<string, LedgerPosting[]> {
  const groups: Record<string, LedgerPosting[]> = {};
  for (const posting of postings) {
    const key = posting.counterparty ?? 'unknown';
    (groups[key] ??= []).push(posting);
  }
  return groups;
}

// ─── Discrepancy detection ───────────────────────────────────────────────────────

let discrepancySequence = 0;
function discrepancyId(): string {
  discrepancySequence += 1;
  return `disc-${discrepancySequence.toString(36)}`;
}
export function resetDiscrepancyIdSequence(): void {
  discrepancySequence = 0;
}

export interface DetectDiscrepanciesOptions {
  periodId: string;
  postings: LedgerPosting[];
  balances: AssetBalance[];
  costBasisEntries: CostBasisEntry[];
  /** Independently-verified expected closing balances (e.g. from a fetched
   * account snapshot), if available, to cross-check computed balances against. */
  expectedClosingBalances?: Record<string, string>;
  /** Notes about pagination interruptions detected during ingestion. */
  pagingGapWarnings?: string[];
}

export function detectDiscrepancies(options: DetectDiscrepanciesOptions): Discrepancy[] {
  const { periodId, postings, balances, costBasisEntries, expectedClosingBalances, pagingGapWarnings } = options;
  const discrepancies: Discrepancy[] = [];

  // 1. Paging gaps surfaced by the ingestion layer.
  for (const warning of pagingGapWarnings ?? []) {
    discrepancies.push({
      id: discrepancyId(),
      periodId,
      kind: 'paging-gap',
      severity: 'warning',
      message: warning,
      postingIds: [],
      provenance: { sourceType: 'manual-adjustment', sourceId: 'ingestion' },
    });
  }

  // 2. Items flagged during normalization as needing review.
  for (const posting of postings) {
    if (!posting.needsReview) continue;
    discrepancies.push({
      id: discrepancyId(),
      periodId,
      kind: posting.kind === 'contract_transfer' ? 'unresolved-contract-transfer' : 'failed-transaction-fee',
      severity: posting.kind === 'contract_transfer' ? 'warning' : 'info',
      assetCode: posting.asset.code,
      message: posting.reviewReason ?? 'Posting flagged for manual review.',
      postingIds: [posting.id],
      provenance: { sourceType: 'manual-adjustment', sourceId: posting.id, derivedFrom: [posting.id] },
    });
  }

  // 3. Expected-vs-computed closing balance mismatches (rounding vs. real delta).
  if (expectedClosingBalances) {
    for (const balance of balances) {
      const expected = expectedClosingBalances[balance.asset.code];
      if (expected === undefined) continue;
      const delta = parseAmount(balance.closing) - parseAmount(expected);
      if (delta === 0n) continue;
      const postingIds = postings.filter((p) => p.asset.code === balance.asset.code).map((p) => p.id);
      if (isWithinRoundingTolerance(delta)) {
        discrepancies.push({
          id: discrepancyId(),
          periodId,
          kind: 'rounding',
          severity: 'info',
          assetCode: balance.asset.code,
          expected,
          actual: balance.closing,
          message: `Closing balance for ${balance.asset.code} differs from the expected value by a sub-stroop rounding residual.`,
          postingIds,
          provenance: { sourceType: 'manual-adjustment', sourceId: 'balance-check' },
        });
      } else {
        discrepancies.push({
          id: discrepancyId(),
          periodId,
          kind: 'unexplained-delta',
          severity: 'critical',
          assetCode: balance.asset.code,
          expected,
          actual: balance.closing,
          message: `Computed closing balance for ${balance.asset.code} (${balance.closing}) does not match the expected balance (${expected}). Some activity may be missing from this period.`,
          postingIds,
          provenance: { sourceType: 'manual-adjustment', sourceId: 'balance-check' },
        });
      }
    }
  }

  // 4. Missing cost-basis price for assets that have activity this period.
  for (const balance of balances) {
    if (balance.postingCount === 0) continue;
    const hasAnyPrice = costBasisEntries.some((entry) => entry.assetCode === balance.asset.code);
    if (hasAnyPrice) continue;
    if (balance.asset.code === 'XLM') continue; // native asset is optional to price
    discrepancies.push({
      id: discrepancyId(),
      periodId,
      kind: 'missing-price',
      severity: 'info',
      assetCode: balance.asset.code,
      message: `No cost-basis price has been entered for ${balance.asset.code}; valuations for this asset will be unavailable.`,
      postingIds: [],
      provenance: { sourceType: 'manual-adjustment', sourceId: 'cost-basis-check' },
    });
  }

  // 5. Asset-code collisions: the same human-readable code from more than one issuer.
  const codesByRawCode = new Map<string, Set<string>>();
  for (const posting of postings) {
    if (posting.asset.kind !== 'credit') continue;
    const rawCode = posting.asset.code.split(':')[0];
    const set = codesByRawCode.get(rawCode) ?? new Set<string>();
    set.add(posting.asset.code);
    codesByRawCode.set(rawCode, set);
  }
  for (const [rawCode, variants] of codesByRawCode) {
    if (variants.size <= 1) continue;
    const postingIds = postings.filter((p) => p.asset.code.split(':')[0] === rawCode).map((p) => p.id);
    discrepancies.push({
      id: discrepancyId(),
      periodId,
      kind: 'asset-code-collision',
      severity: 'warning',
      message: `Multiple distinct issuers use the asset code "${rawCode}" (${[...variants].join(', ')}). Verify postings are grouped by the intended issuer, not just the code.`,
      postingIds,
      provenance: { sourceType: 'manual-adjustment', sourceId: `asset-collision:${rawCode}` },
    });
  }

  return discrepancies;
}

/** Convenience re-export so callers doing valuation don't need a second import. */
export { findEffectiveCostBasis };
