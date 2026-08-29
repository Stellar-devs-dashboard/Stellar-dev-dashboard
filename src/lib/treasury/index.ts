export {
  STROOP_DECIMALS,
  AmountParseError,
  parseAmountToStroops,
  stroopsToAmount,
  sumStroops,
  addAmounts,
  subtractAmounts,
  negateAmount,
  isZeroAmount,
  compareAmounts,
  percentDifference,
} from './amount'

export { assetKey, normalizeOperation, normalizeTransactionFee, normalizeAccountActivity, detectPagingGaps } from './normalize'
export type { RawAsset, RawOperationRecord, RawTransactionRecord, NormalizeResult } from './normalize'

export { DEFAULT_CATEGORY_RULES, matchRule, applyRules, labelCounterparties, validateRule } from './rules'

export {
  groupByTransaction,
  computeBalanceWaterfall,
  detectDiscrepancies,
  findUnresolvedItems,
  buildPeriod,
  computedClosingBalances,
  closePeriod,
  setReviewStatus,
  deriveNextOpeningBalances,
} from './reconciliation'
export type { BuildPeriodInput } from './reconciliation'

export { lookupCostBasis, validateCostBasisEntry, computeRealizedGainLoss, summarizeRealizedGainLoss } from './costBasis'

export {
  CASH_ACCOUNT_PREFIX,
  DEFAULT_MAPPING_RULES,
  findMappingRule,
  toJournalEntries,
  exportJournalJson,
  serializeJournalJson,
  exportJournalCsv,
  parseJournalCsv,
  parseJournalJson,
} from './journal'

export { createPeriodSnapshot, verifySnapshotIntegrity } from './snapshot'

export {
  saveCategoryRules,
  loadCategoryRules,
  saveCounterpartyLabels,
  loadCounterpartyLabels,
  saveCostBasisEntries,
  loadCostBasisEntries,
  saveSnapshot,
  loadSnapshots,
} from './records'

export { TreasuryFetchError, fetchAccountLedgerActivity } from './client'
export type { FetchLedgerActivityResult } from './client'

export { buildFixtureLedger, buildFixtureCostBasisEntries, FIXTURE_ACCOUNT } from './fixtures'
