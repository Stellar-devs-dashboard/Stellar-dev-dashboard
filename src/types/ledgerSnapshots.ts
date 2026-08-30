/**
 * Portable ledger snapshot and deterministic offline replay domain types.
 * Snapshots freeze network identity, ledger metadata, accounts, contract state,
 * and captured simulation responses for diagnostic replay — not consensus execution.
 */

export const LEDGER_SNAPSHOT_SCHEMA_VERSION = 1 as const;
export const LEDGER_SNAPSHOT_FORMAT_KIND = 'stellar-dev-dashboard/ledger-snapshot' as const;
export const REPLAY_RESULT_SCHEMA_VERSION = 1 as const;
export const REPLAY_RESULT_FORMAT_KIND = 'stellar-dev-dashboard/replay-result' as const;

export type SnapshotCaptureStatus =
  | 'idle'
  | 'capturing'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type ReplayStatus = 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';

export type LedgerEntryKind =
  | 'account'
  | 'trustline'
  | 'offer'
  | 'data'
  | 'claimable_balance'
  | 'liquidity_pool'
  | 'contract_code'
  | 'contract_data'
  | 'contract_ttl'
  | 'config_setting'
  | 'unknown';

export type SimulationKind = 'classic' | 'soroban';

export type RedactionLevel = 'none' | 'standard' | 'strict';

export interface NetworkIdentity {
  networkName: string;
  passphrase: string;
  horizonUrl: string;
  sorobanRpcUrl?: string;
  protocolVersion?: number;
}

export interface LedgerMetadata {
  sequence: number;
  hash: string;
  closeTime: number;
  baseFee: string;
  baseReserve: string;
  maxTxSetSize?: number;
}

export interface SourceProvenance {
  capturedAt: string;
  capturedBy: string;
  dashboardVersion: string;
  sdkVersion: string;
  captureSessionId: string;
  footprintRoot?: string;
  notes?: string;
}

export interface LedgerEntryRecord {
  id: string;
  kind: LedgerEntryKind;
  key: string;
  ledgerKeyXdr: string;
  valueXdr: string;
  lastModifiedLedgerSeq?: number;
  liveUntilLedgerSeq?: number;
  accountId?: string;
  contractId?: string;
  assetCode?: string;
  assetIssuer?: string;
}

export interface AccountSnapshot {
  accountId: string;
  sequence: string;
  subentryCount: number;
  balances: Array<{
    assetType: string;
    assetCode?: string;
    assetIssuer?: string;
    balance: string;
    limit?: string;
    buyingLiabilities?: string;
    sellingLiabilities?: string;
  }>;
  signers: Array<{ key: string; weight: number; type: string }>;
  flags: number;
  homeDomain?: string;
  inflationDestination?: string;
  thresholds: { low: number; med: number; high: number };
  sponsor?: string;
}

export interface ContractStorageEntry {
  contractId: string;
  keyXdr: string;
  valXdr: string;
  durability: 'persistent' | 'temporary' | 'instance';
  liveUntilLedgerSeq?: number;
}

export interface CapturedSimulation {
  id: string;
  kind: SimulationKind;
  requestDigest: string;
  requestCanonical: string;
  responseCanonical: string;
  capturedAt: string;
  supported: boolean;
  unsupportedReasons?: string[];
  classicEnvelopeXdr?: string;
  sorobanTransactionXdr?: string;
  resourceFee?: string;
  minResourceFee?: string;
  cpuInstructions?: number;
  memoryBytes?: number;
}

export interface SnapshotFootprint {
  accounts: string[];
  contracts: string[];
  maxDepth: number;
  maxEntries: number;
  includeSimulations: boolean;
  includeContractStorage: boolean;
  includeTtlEntries: boolean;
}

export interface SnapshotIntegrity {
  algorithm: 'sha256';
  contentDigest: string;
  entryCount: number;
  compressedSizeBytes?: number;
  uncompressedSizeBytes?: number;
}

export interface SnapshotRedactionReport {
  level: RedactionLevel;
  redactedFieldCount: number;
  redactedPaths: string[];
  secretsRemoved: boolean;
}

export interface PortableLedgerSnapshot {
  formatKind: typeof LEDGER_SNAPSHOT_FORMAT_KIND;
  schemaVersion: typeof LEDGER_SNAPSHOT_SCHEMA_VERSION;
  snapshotId: string;
  label: string;
  tags: string[];
  network: NetworkIdentity;
  ledger: LedgerMetadata;
  provenance: SourceProvenance;
  footprint: SnapshotFootprint;
  accounts: AccountSnapshot[];
  ledgerEntries: LedgerEntryRecord[];
  contractStorage: ContractStorageEntry[];
  simulations: CapturedSimulation[];
  integrity: SnapshotIntegrity;
  redaction: SnapshotRedactionReport;
  compatibility: {
    replayEngineMinVersion: number;
    unsupportedEntryKinds: LedgerEntryKind[];
    diagnosticOnly: true;
  };
}

export interface SnapshotLibraryRecord {
  id: string;
  snapshot: PortableLedgerSnapshot;
  createdAt: number;
  updatedAt: number;
  sizeBytes: number;
  tags: string[];
  label: string;
  pinned: boolean;
  lastReplayAt?: number;
  replayCount: number;
}

export interface SnapshotComparisonResult {
  leftId: string;
  rightId: string;
  addedEntries: LedgerEntryRecord[];
  removedEntries: LedgerEntryRecord[];
  changedEntries: Array<{
    id: string;
    kind: LedgerEntryKind;
    key: string;
    beforeValueXdr: string;
    afterValueXdr: string;
  }>;
  accountSequenceChanges: Array<{
    accountId: string;
    beforeSequence: string;
    afterSequence: string;
  }>;
  simulationChanges: Array<{
    requestDigest: string;
    changed: boolean;
    unsupportedDelta: string[];
  }>;
}

export interface LedgerEntryDiff {
  entryId: string;
  kind: LedgerEntryKind;
  key: string;
  field: string;
  before: string;
  after: string;
  severity: 'info' | 'warning' | 'critical';
}

export interface ReplayTimelineEvent {
  id: string;
  timestamp: string;
  phase: 'prepare' | 'lookup' | 'replay' | 'validate' | 'complete' | 'error';
  simulationId?: string;
  message: string;
  deterministic: boolean;
  durationMs?: number;
}

export interface UnsupportedFeatureDiagnostic {
  code: string;
  category: 'host_fn' | 'ledger_entry' | 'protocol' | 'simulation' | 'storage';
  message: string;
  remediation?: string;
  blocking: boolean;
}

export interface ReplayRequest {
  snapshotId: string;
  simulationIds?: string[];
  strictMode: boolean;
  compareWithLive?: boolean;
}

export interface ReplaySimulationResult {
  simulationId: string;
  requestDigest: string;
  matched: boolean;
  replayedResponseCanonical: string;
  expectedResponseCanonical: string;
  diffSummary?: string;
  unsupportedFeatures: UnsupportedFeatureDiagnostic[];
  timeline: ReplayTimelineEvent[];
}

export interface DeterministicReplayResult {
  formatKind: typeof REPLAY_RESULT_FORMAT_KIND;
  schemaVersion: typeof REPLAY_RESULT_SCHEMA_VERSION;
  replayId: string;
  snapshotId: string;
  startedAt: string;
  completedAt: string;
  status: 'completed' | 'failed' | 'partial';
  diagnosticOnly: true;
  simulationResults: ReplaySimulationResult[];
  unsupportedFeatures: UnsupportedFeatureDiagnostic[];
  timeline: ReplayTimelineEvent[];
  integrityDigest: string;
}

export interface CaptureProgress {
  phase: 'init' | 'accounts' | 'entries' | 'contracts' | 'simulations' | 'finalize';
  processed: number;
  total: number;
  currentTarget?: string;
  bytesCollected: number;
  message: string;
}

export interface CaptureOptions {
  label: string;
  tags?: string[];
  footprint: SnapshotFootprint;
  redactionLevel?: RedactionLevel;
  maxSnapshotBytes?: number;
  includeProvenance?: boolean;
}

export interface CaptureResult {
  ok: true;
  snapshot: PortableLedgerSnapshot;
  warnings: string[];
}

export interface CaptureFailure {
  ok: false;
  code:
    | 'cancelled'
    | 'size_limit'
    | 'network_error'
    | 'validation_error'
    | 'unsupported'
    | 'timeout';
  message: string;
  partialProgress?: CaptureProgress;
}

export type CaptureOutcome = CaptureResult | CaptureFailure;

export interface SnapshotImportResult {
  ok: true;
  record: SnapshotLibraryRecord;
  migratedFromVersion?: number;
}

export interface SnapshotImportFailure {
  ok: false;
  code: 'corrupt' | 'unsupported_version' | 'integrity_mismatch' | 'validation_error';
  message: string;
}

export type SnapshotImportOutcome = SnapshotImportResult | SnapshotImportFailure;

export interface SnapshotExportEnvelope {
  formatKind: typeof LEDGER_SNAPSHOT_FORMAT_KIND;
  schemaVersion: typeof LEDGER_SNAPSHOT_SCHEMA_VERSION;
  exportedAt: string;
  sanitized: boolean;
  snapshot: PortableLedgerSnapshot;
}

export interface SnapshotLibraryQuery {
  tags?: string[];
  networkName?: string;
  search?: string;
  pinnedOnly?: boolean;
  limit?: number;
  offset?: number;
}

export interface SnapshotPrunePolicy {
  maxRecords: number;
  maxTotalBytes: number;
  retainPinned: boolean;
  minAgeMs?: number;
}

export interface SnapshotLibraryStats {
  recordCount: number;
  totalBytes: number;
  pinnedCount: number;
  networks: string[];
  oldestCreatedAt?: number;
  newestCreatedAt?: number;
}

export interface LedgerSnapshotError {
  code: string;
  message: string;
  retryable: boolean;
  requestId?: string;
  cause?: string;
}

export interface SnapshotValidationIssue {
  path: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface SnapshotValidationReport {
  valid: boolean;
  issues: SnapshotValidationIssue[];
}
