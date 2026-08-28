/**
 * Treasury reconciliation & accounting exports domain model (#97).
 *
 * These are operational records reconstructed from public ledger activity —
 * NOT tax or accounting advice, and independent of the AI portfolio
 * optimizer (#33). Every derived value carries a `Provenance` entry so a
 * reviewer can trace it back to the source ledger activity that produced it.
 */

// ─── Assets ─────────────────────────────────────────────────────────────────────

export type AssetKind = 'native' | 'credit' | 'liquidity_pool' | 'contract';

export interface TreasuryAsset {
  kind: AssetKind;
  /** Stable identifier used as a map/grouping key, e.g. "XLM" or "USDC:GABC...". */
  code: string;
  issuer?: string;
  contractId?: string;
  /** Display decimals; Stellar classic assets are always 7. */
  decimals: number;
}

export const NATIVE_ASSET: TreasuryAsset = { kind: 'native', code: 'XLM', decimals: 7 };

// ─── Provenance ───────────────────────────────────────────────────────────────

export type ProvenanceSourceType =
  | 'operation'
  | 'transaction-fee'
  | 'trade'
  | 'effect'
  | 'manual-adjustment'
  | 'rule';

export interface Provenance {
  sourceType: ProvenanceSourceType;
  /** Horizon paging token / id / hash of the record this value was derived from. */
  sourceId: string;
  /** Other posting/discrepancy ids this value was derived from, if any. */
  derivedFrom?: string[];
  /** Id of the rule that produced a category/label, if applicable. */
  ruleId?: string;
  note?: string;
}

// ─── Ledger postings ────────────────────────────────────────────────────────────

export type PostingKind =
  | 'payment'
  | 'path_payment'
  | 'trade'
  | 'fee'
  | 'claimable_balance_create'
  | 'claimable_balance_claim'
  | 'sponsorship'
  | 'contract_transfer'
  | 'account_change';

export interface LedgerPosting {
  id: string;
  txHash: string;
  operationId?: string;
  ledger: number;
  timestamp: string;
  kind: PostingKind;
  asset: TreasuryAsset;
  /** Signed decimal amount string (Stellar precision); positive = inflow, negative = outflow. */
  amount: string;
  counterparty?: string;
  counterpartyLabel?: string;
  memo?: string;
  category?: string;
  successful: boolean;
  provenance: Provenance;
  /** Set when normalization could not fully resolve the posting (e.g. an
   * unrecognized contract invocation) and it needs manual review. */
  needsReview?: boolean;
  reviewReason?: string;
}

// ─── Rules ──────────────────────────────────────────────────────────────────────

export interface CategoryRule {
  id: string;
  /** Evaluated in ascending order; first match wins. */
  priority: number;
  enabled: boolean;
  name: string;
  /** Case-insensitive substring/exact matchers; all provided fields must match. */
  match: {
    counterparty?: string;
    assetCode?: string;
    memoContains?: string;
    kind?: PostingKind;
  };
  category: string;
  counterpartyLabel?: string;
}

// ─── Cost basis ───────────────────────────────────────────────────────────────

export interface CostBasisEntry {
  id: string;
  assetCode: string;
  /** ISO date (yyyy-mm-dd) the price applies from, effective until superseded. */
  effectiveDate: string;
  pricePerUnit: string;
  currency: string;
  source: string;
  note?: string;
}

// ─── Discrepancies & review ─────────────────────────────────────────────────────

export type DiscrepancySeverity = 'info' | 'warning' | 'critical';

export type DiscrepancyKind =
  | 'unexplained-delta'
  | 'paging-gap'
  | 'rounding'
  | 'missing-price'
  | 'unresolved-contract-transfer'
  | 'asset-code-collision'
  | 'failed-transaction-fee';

export interface Discrepancy {
  id: string;
  periodId: string;
  kind: DiscrepancyKind;
  severity: DiscrepancySeverity;
  assetCode?: string;
  message: string;
  expected?: string;
  actual?: string;
  postingIds: string[];
  provenance: Provenance;
}

export type ReviewStatus = 'unresolved' | 'resolved' | 'flagged';

export interface ReviewRecord {
  /** id of the LedgerPosting or Discrepancy being reviewed. */
  targetId: string;
  targetType: 'posting' | 'discrepancy';
  status: ReviewStatus;
  reviewer?: string;
  note?: string;
  updatedAt: string;
}

// ─── Periods & balances ─────────────────────────────────────────────────────────

export type PeriodStatus = 'open' | 'closed';

export interface ReconciliationPeriod {
  id: string;
  accountId: string;
  network: string;
  /** ISO date, inclusive. */
  start: string;
  /** ISO date, exclusive. */
  end: string;
  status: PeriodStatus;
  createdAt: string;
  closedAt?: string;
}

export interface AssetBalance {
  asset: TreasuryAsset;
  opening: string;
  closing: string;
  netChange: string;
  inflow: string;
  outflow: string;
  postingCount: number;
}

// ─── Immutable snapshots ────────────────────────────────────────────────────────

export const SNAPSHOT_SCHEMA_VERSION = 1 as const;

export interface PeriodSnapshot {
  schemaVersion: typeof SNAPSHOT_SCHEMA_VERSION;
  period: ReconciliationPeriod;
  postings: LedgerPosting[];
  balances: AssetBalance[];
  discrepancies: Discrepancy[];
  review: ReviewRecord[];
  generatedAt: string;
  /** Deterministic checksum of postings+balances, so a re-derived snapshot
   * for the same period can be compared for byte-for-byte equality. */
  checksum: string;
}

// ─── Data / request state (mirrors FraudDataState) ──────────────────────────────

export type TreasuryDataState = 'live' | 'degraded' | 'simulation';

export interface TreasuryApiError {
  code: 'timeout' | 'unavailable' | 'invalid-response' | 'rate-limited' | 'aborted' | 'invalid-input';
  message: string;
  retryable: boolean;
  requestId?: string;
}

export interface ReconciliationResult {
  state: TreasuryDataState;
  period: ReconciliationPeriod;
  postings: LedgerPosting[];
  balances: AssetBalance[];
  discrepancies: Discrepancy[];
  generatedAt: string;
  requestId: string;
  /** True when pagination hit the configured cap before exhausting history —
   * surfaced so large-history reconciliation is never silently partial. */
  truncated: boolean;
}

// ─── Export / import contracts ──────────────────────────────────────────────────

export const EXPORT_SCHEMA_VERSION = 1 as const;
export const SUPPORTED_EXPORT_VERSIONS: readonly number[] = [1];

export interface TreasuryExportPayload {
  version: typeof EXPORT_SCHEMA_VERSION;
  exportedAt: string;
  period: ReconciliationPeriod;
  postings: LedgerPosting[];
  balances: AssetBalance[];
  discrepancies: Discrepancy[];
  review: ReviewRecord[];
}

export interface AccountingMappingEntry {
  category: string;
  accountCode: string;
  accountName: string;
}

export interface AccountingMapping {
  id: string;
  name: string;
  entries: AccountingMappingEntry[];
  /** Category used when a posting's category has no matching entry. */
  defaultAccountCode: string;
}

export interface GenericLedgerRow {
  date: string;
  accountCode: string;
  accountName: string;
  description: string;
  debit: string;
  credit: string;
  assetCode: string;
  reference: string;
}
