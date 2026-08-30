/**
 * Resumable bulk operations planner domain types.
 * Supports dependency-aware execution with checkpointed signing and submission.
 */

export const BULK_MANIFEST_SCHEMA_VERSION = 1 as const;
export const BULK_MANIFEST_FORMAT_KIND = 'stellar-dev-dashboard/bulk-manifest' as const;
export const BULK_RUN_SCHEMA_VERSION = 1 as const;
export const BULK_CHECKPOINT_SCHEMA_VERSION = 1 as const;

export type BulkOperationFamily =
  | 'payment'
  | 'changeTrust'
  | 'setOptions'
  | 'sponsorship'
  | 'contractInvoke'
  | 'accountMerge'
  | 'createAccount'
  | 'manageData'
  | 'pathPayment';

export type BulkOperationStatus =
  | 'draft'
  | 'validated'
  | 'planned'
  | 'awaiting_approval'
  | 'signing'
  | 'submitting'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'cancelled'
  | 'paused';

export type BulkRunStatus =
  | 'idle'
  | 'planning'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type BulkSeverity = 'info' | 'warning' | 'error';

export type BulkDependencyKind = 'hard' | 'soft' | 'sequence';

export interface BulkAssetRef {
  code: string;
  issuer?: string;
  type: 'native' | 'credit_alphanum4' | 'credit_alphanum12';
}

export interface BulkPaymentParams {
  destination: string;
  amount: string;
  asset: BulkAssetRef;
  memo?: string;
  memoType?: 'text' | 'id' | 'hash' | 'return';
}

export interface BulkChangeTrustParams {
  asset: BulkAssetRef;
  limit?: string;
}

export interface BulkSetOptionsParams {
  masterWeight?: number;
  lowThreshold?: number;
  medThreshold?: number;
  highThreshold?: number;
  homeDomain?: string;
  signer?: { key: string; weight: number };
  clearFlags?: number;
  setFlags?: number;
}

export interface BulkSponsorshipParams {
  action: 'begin' | 'end' | 'revoke';
  sponsoredId?: string;
}

export interface BulkContractInvokeParams {
  contractId: string;
  functionName: string;
  args: Array<{ type: string; value: string }>;
}

export interface BulkCreateAccountParams {
  destination: string;
  startingBalance: string;
}

export interface BulkAccountMergeParams {
  destination: string;
}

export interface BulkManageDataParams {
  name: string;
  value: string;
  action: 'set' | 'remove';
}

export interface BulkPathPaymentParams {
  sendAsset: BulkAssetRef;
  sendMax: string;
  destination: string;
  destAsset: BulkAssetRef;
  destAmount: string;
  path?: BulkAssetRef[];
}

export type BulkOperationParams =
  | BulkPaymentParams
  | BulkChangeTrustParams
  | BulkSetOptionsParams
  | BulkSponsorshipParams
  | BulkContractInvokeParams
  | BulkCreateAccountParams
  | BulkAccountMergeParams
  | BulkManageDataParams
  | BulkPathPaymentParams;

export interface BulkOperationSpec {
  id: string;
  label: string;
  family: BulkOperationFamily;
  sourceAccount: string;
  params: BulkOperationParams;
  dependencies: string[];
  tags: string[];
  priority: number;
  maxRetries: number;
  timeoutMs: number;
  requiresApproval: boolean;
  metadata: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface BulkDependencyEdge {
  fromId: string;
  toId: string;
  kind: BulkDependencyKind;
  reason?: string;
}

export interface BulkManifest {
  schemaVersion: typeof BULK_MANIFEST_SCHEMA_VERSION;
  formatKind: typeof BULK_MANIFEST_FORMAT_KIND;
  id: string;
  name: string;
  description: string;
  network: string;
  sourceAccount: string;
  operations: BulkOperationSpec[];
  edges: BulkDependencyEdge[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
  checksum: string;
}

export interface BulkRowValidationIssue {
  row: number;
  field?: string;
  code: string;
  message: string;
  severity: BulkSeverity;
}

export interface BulkValidationReport {
  valid: boolean;
  operationCount: number;
  issues: BulkRowValidationIssue[];
  warnings: BulkRowValidationIssue[];
  cycleDetected: boolean;
  cyclePath: string[];
  duplicateIds: string[];
  missingDependencies: Array<{ operationId: string; missingId: string }>;
  estimatedFeeStroops: number;
  estimatedTransactions: number;
}

export interface BulkTransactionPack {
  id: string;
  sequenceAccount: string;
  operationIds: string[];
  estimatedFeeStroops: number;
  estimatedSizeBytes: number;
  dependsOnPackIds: string[];
  memo?: string;
}

export interface BulkExecutionPlan {
  manifestId: string;
  planId: string;
  createdAt: string;
  orderedOperationIds: string[];
  packs: BulkTransactionPack[];
  totalOperations: number;
  totalPacks: number;
  estimatedFeeStroops: number;
  warnings: string[];
  checksum: string;
}

export interface BulkOperationAttempt {
  attemptNumber: number;
  startedAt: string;
  finishedAt?: string;
  error?: string;
  txHash?: string;
  ledger?: number;
  feeCharged?: string;
  retryable: boolean;
}

export interface BulkOperationState {
  operationId: string;
  status: BulkOperationStatus;
  packId?: string;
  attempts: BulkOperationAttempt[];
  lastError?: string;
  txHash?: string;
  ledger?: number;
  updatedAt: string;
}

export interface BulkRunCheckpoint {
  schemaVersion: typeof BULK_CHECKPOINT_SCHEMA_VERSION;
  runId: string;
  manifestId: string;
  planId: string;
  status: BulkRunStatus;
  currentPackIndex: number;
  currentOperationIndex: number;
  operationStates: BulkOperationState[];
  sequenceNumbers: Record<string, number>;
  startedAt: string;
  updatedAt: string;
  pausedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  failureReason?: string;
}

export interface BulkRunReceipt {
  runId: string;
  manifestId: string;
  planId: string;
  status: BulkRunStatus;
  startedAt: string;
  finishedAt: string;
  completedCount: number;
  failedCount: number;
  skippedCount: number;
  totalFeeStroops: number;
  operationOutcomes: Array<{
    operationId: string;
    status: BulkOperationStatus;
    txHash?: string;
    error?: string;
  }>;
  checksum: string;
}

export interface BulkProgressEvent {
  type: 'planning' | 'pack_start' | 'operation_start' | 'operation_complete' | 'operation_failed' | 'paused' | 'resumed' | 'cancelled' | 'completed';
  runId: string;
  timestamp: string;
  packId?: string;
  operationId?: string;
  message: string;
  percentComplete: number;
}

export interface BulkCsvColumnMapping {
  id?: string;
  label?: string;
  family?: string;
  sourceAccount?: string;
  destination?: string;
  amount?: string;
  assetCode?: string;
  assetIssuer?: string;
  memo?: string;
  dependencies?: string;
  tags?: string;
  priority?: string;
}

export interface BulkCsvImportOptions {
  delimiter: string;
  hasHeader: boolean;
  mapping: BulkCsvColumnMapping;
  defaultSourceAccount?: string;
  defaultFamily?: BulkOperationFamily;
  skipEmptyRows: boolean;
  trimValues: boolean;
}

export interface BulkImportPreview {
  rowCount: number;
  mappedOperations: BulkOperationSpec[];
  issues: BulkRowValidationIssue[];
  duplicateRowIndexes: number[];
  sampleRows: string[][];
  headers: string[];
}

export interface BulkPlannerPreferences {
  maxOperationsPerTransaction: number;
  defaultMaxRetries: number;
  defaultTimeoutMs: number;
  autoPauseOnFailure: boolean;
  requireApprovalBeforeSubmit: boolean;
  simulatedMode: boolean;
  concurrency: number;
  feeMultiplier: number;
}

export interface BulkStoredManifestRecord {
  id: string;
  manifest: BulkManifest;
  savedAt: string;
  pinned: boolean;
  lastRunId?: string;
  lastRunStatus?: BulkRunStatus;
}

export interface BulkStoredRunRecord {
  id: string;
  manifestId: string;
  checkpoint: BulkRunCheckpoint;
  receipt?: BulkRunReceipt;
  savedAt: string;
}

export interface BulkReconciliationRow {
  operationId: string;
  label: string;
  family: BulkOperationFamily;
  expectedStatus: BulkOperationStatus;
  actualStatus: BulkOperationStatus;
  txHash?: string;
  discrepancy?: string;
}

export interface BulkReconciliationReport {
  runId: string;
  manifestId: string;
  generatedAt: string;
  rows: BulkReconciliationRow[];
  matchedCount: number;
  discrepancyCount: number;
  missingCount: number;
}

export interface BulkAnalyticsSummary {
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  totalOperationsSubmitted: number;
  totalOperationsFailed: number;
  averageCompletionMs: number;
  retryRate: number;
  topFailureReasons: Array<{ reason: string; count: number }>;
}

export interface BulkDryRunResult {
  plan: BulkExecutionPlan;
  validation: BulkValidationReport;
  simulatedOutcomes: Array<{ operationId: string; wouldSucceed: boolean; reason?: string }>;
}

export interface BulkExportEnvelope {
  formatKind: typeof BULK_MANIFEST_FORMAT_KIND;
  schemaVersion: typeof BULK_MANIFEST_SCHEMA_VERSION;
  exportedAt: string;
  manifest: BulkManifest;
  plan?: BulkExecutionPlan;
  checkpoint?: BulkRunCheckpoint;
  receipt?: BulkRunReceipt;
}
