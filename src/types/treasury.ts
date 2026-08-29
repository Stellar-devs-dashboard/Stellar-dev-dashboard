export const JOURNAL_SCHEMA_VERSION = 1 as const
export const SNAPSHOT_SCHEMA_VERSION = 1 as const

export type PostingType =
  | 'payment-in'
  | 'payment-out'
  | 'trade'
  | 'fee'
  | 'claimable-balance-out'
  | 'claimable-balance-in'
  | 'sponsorship'
  | 'contract-transfer'
  | 'account-change'
  | 'other'

export type ProvenanceSource = 'derived' | 'rule' | 'manual'

export interface Provenance {
  source: ProvenanceSource
  note: string
}

export interface LedgerPosting {
  id: string
  txHash: string
  operationId: string
  ledgerCloseTime: string
  type: PostingType
  asset: string
  /** Signed amount in the account's perspective: positive = credit, negative = debit. Decimal string, up to 7 fractional digits. */
  amount: string
  counterparty: string | null
  memo: string | null
  transactionSuccessful: boolean
  category: string | null
  counterpartyLabel: string | null
  provenance: Provenance
}

export interface Discrepancy {
  asset: string
  expectedClosing: string
  computedClosing: string
  differenceAbs: string
  differencePct: number | null
  possibleCauses: string[]
}

export interface AssetWaterfallStep {
  asset: string
  opening: string
  inflow: string
  outflow: string
  fees: string
  closing: string
}

export type ReconciliationStatus = 'open' | 'closed'
export type ReviewStatus = 'unreviewed' | 'in-review' | 'approved'

export interface ReconciliationPeriod {
  id: string
  label: string
  startTime: string
  endTime: string
  status: ReconciliationStatus
  reviewStatus: ReviewStatus
  openingBalances: Record<string, string>
  actualClosingBalances: Record<string, string> | null
  postings: LedgerPosting[]
  waterfall: AssetWaterfallStep[]
  discrepancies: Discrepancy[]
  pagingGapDetected: boolean
}

export type RuleMatcherField = 'type' | 'asset' | 'counterparty' | 'memo'

export interface RuleMatcher {
  field: RuleMatcherField
  pattern: string
}

export interface CategoryRule {
  id: string
  priority: number
  matchers: RuleMatcher[]
  category: string
  enabled: boolean
}

export interface CounterpartyLabel {
  address: string
  label: string
  tags: string[]
}

export interface CostBasisEntry {
  asset: string
  unitPrice: string
  currency: string
  effectiveAt: string
  source: string
}

export interface DisposalLot {
  asset: string
  acquiredAt: string
  quantity: string
  unitCost: string
}

export interface RealizedGainLoss {
  asset: string
  disposedAt: string
  quantity: string
  proceedsPerUnit: string
  costBasisPerUnit: string
  gainLoss: string
  costBasisMissing: boolean
}

export type UnresolvedReason = 'uncategorized' | 'missing-cost-basis' | 'discrepancy' | 'failed-transaction'

export interface UnresolvedItem {
  postingId: string
  reason: UnresolvedReason
  detail: string
}

export interface PeriodSnapshot {
  schemaVersion: typeof SNAPSHOT_SCHEMA_VERSION
  id: string
  periodId: string
  generatedAt: string
  period: ReconciliationPeriod
  contentHash: string
}

export interface JournalEntry {
  date: string
  reference: string
  account: string
  debit: string
  credit: string
  memo: string
  asset: string
}

export interface AccountMappingRule {
  postingType: PostingType
  category: string | null
  debitAccount: string
  creditAccount: string
}

export interface JournalExport {
  schemaVersion: typeof JOURNAL_SCHEMA_VERSION
  format: 'csv' | 'json'
  periodId: string
  generatedAt: string
  rowCount: number
  checksum: string
  entries: JournalEntry[]
}

export interface ImportValidationIssue {
  row: number
  message: string
}

export interface ImportValidationResult {
  valid: boolean
  issues: ImportValidationIssue[]
  entries: JournalEntry[]
}

export interface PagingGapReport {
  gapDetected: boolean
  details: string[]
}

export interface TreasuryApiError {
  code: 'invalid-account' | 'timeout' | 'unavailable' | 'rate-limited' | 'aborted' | 'oversized'
  message: string
  retryable: boolean
}
