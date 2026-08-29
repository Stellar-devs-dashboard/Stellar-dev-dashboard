import type { NetworkName } from '../lib/stellar';

/** Stable schema for persisted probes, maintainer overrides, and JSON exports. */
export const COMPATIBILITY_SCHEMA_VERSION = 1 as const;

export type CompatibilitySchemaVersion = typeof COMPATIBILITY_SCHEMA_VERSION;
export type CompatibilityStatus =
  'compatible' | 'degraded' | 'incompatible' | 'unknown' | 'contradictory' | 'offline';

export type EvidenceSource =
  | 'horizon-root'
  | 'horizon-ledger'
  | 'rpc-getNetwork'
  | 'rpc-getLatestLedger'
  | 'rpc-method-probe'
  | 'rpc-response'
  | 'matrix'
  | 'cache'
  | 'maintainer-override'
  | 'browser';

export type RpcMethodName =
  | 'getHealth'
  | 'getNetwork'
  | 'getLatestLedger'
  | 'getLedgerEntries'
  | 'getTransaction'
  | 'getTransactions'
  | 'getEvents'
  | 'simulateTransaction'
  | 'sendTransaction'
  | 'getFeeStats'
  | 'getVersionInfo';

export type DashboardFeatureId =
  | 'network-overview'
  | 'classic-transactions'
  | 'contract-read'
  | 'contract-simulation'
  | 'contract-submission'
  | 'contract-events'
  | 'transaction-history'
  | 'resource-profiling'
  | 'fee-estimation'
  | 'upgrade-readiness';

export type AuditArtifactKind =
  'saved-envelope' | 'snapshot' | 'contract-artifact' | 'plugin' | 'custom-network' | 'cached-data';

export interface VersionRange {
  minimum: number;
  maximum: number | null;
}

export interface SdkCapabilityProfile {
  packageName: '@stellar/stellar-sdk';
  version: string;
  protocolRange: VersionRange;
  xdrRange: VersionRange;
  rpcMethods: RpcMethodName[];
  notes: string[];
}

export interface RpcMethodCapability {
  name: RpcMethodName;
  introducedInProtocol: number;
  requiredForIdentity: boolean;
  safeProbe: 'no-params' | 'invalid-params';
  description: string;
}

export interface DashboardFeatureRequirement {
  id: DashboardFeatureId;
  label: string;
  description: string;
  protocolRange: VersionRange;
  xdrRange: VersionRange;
  requiredMethods: RpcMethodName[];
  optionalMethods: RpcMethodName[];
  hardFailureMessage: string;
  degradedMessage: string;
  recovery: string;
}

export interface ProtocolMatrixRelease {
  protocol: number;
  lifecycle: 'legacy' | 'supported' | 'preferred' | 'preview';
  sdk: SdkCapabilityProfile;
  xdr: {
    supported: boolean;
    label: string;
    notes: string[];
  };
  rpc: {
    required: RpcMethodName[];
    optional: RpcMethodName[];
  };
  dashboardFeatures: DashboardFeatureId[];
  changed: string[];
}

export interface CompatibilityMatrixDocument {
  schemaVersion: CompatibilitySchemaVersion;
  matrixVersion: string;
  generatedFromSdkVersion: string;
  reviewedAt: string;
  knownProtocolRange: VersionRange;
  releases: ProtocolMatrixRelease[];
  methods: RpcMethodCapability[];
  features: DashboardFeatureRequirement[];
}

export interface ProbeEvidence {
  id: string;
  source: EvidenceSource;
  field: string;
  value: string | number | boolean | null;
  observedAt: string;
  endpoint: string;
  confidence: 'direct' | 'inferred' | 'cached' | 'overridden';
  detail?: string;
}

export interface RpcMethodObservation {
  name: RpcMethodName;
  supported: boolean | null;
  evidenceId: string;
  responseCode?: number;
  latencyMs: number | null;
  detail: string;
}

export interface RetentionWindow {
  latestLedger: number | null;
  oldestLedger: number | null;
  ledgerCount: number | null;
  estimatedSeconds: number | null;
  evidence: string[];
}

export interface NetworkLimits {
  maxLedgerEntriesPerRequest: number | null;
  maxEventFilters: number | null;
  maxEventRangeLedgers: number | null;
  maxTransactionSizeBytes: number | null;
  maxContractSizeBytes: number | null;
  maxTransactionsPerLedger: number | null;
  source: 'reported' | 'matrix-default' | 'unknown';
}

export interface VendorExtension {
  name: string;
  value: string;
  source: 'header' | 'rpc-version' | 'rpc-response';
}

export interface NetworkIdentity {
  network: NetworkName | 'unmapped';
  passphrase: string | null;
  networkId: string | null;
  horizonVersion: string | null;
  coreVersion: string | null;
  rpcVersion: string | null;
  captiveCoreVersion: string | null;
}

export interface NetworkProbeTarget {
  id: string;
  label: string;
  network: NetworkName | 'custom';
  horizonUrl: string;
  rpcUrl: string;
  expectedPassphrase?: string;
  /** Values are used only for requests and must never be persisted or exported. */
  headers?: Record<string, string>;
}

export interface NetworkProbeResult {
  schemaVersion: CompatibilitySchemaVersion;
  target: Omit<NetworkProbeTarget, 'headers'>;
  requestId: string;
  startedAt: string;
  completedAt: string;
  expiresAt: string;
  identity: NetworkIdentity;
  latestLedger: number | null;
  protocolVersion: number | null;
  methods: RpcMethodObservation[];
  retention: RetentionWindow;
  limits: NetworkLimits;
  vendorExtensions: VendorExtension[];
  evidence: ProbeEvidence[];
  warnings: string[];
  errors: ProbeProblem[];
  online: boolean;
}

export type ProbeProblemCode =
  | 'offline'
  | 'timeout'
  | 'aborted'
  | 'network-error'
  | 'invalid-response'
  | 'identity-mismatch'
  | 'rpc-error'
  | 'horizon-error';

export interface ProbeProblem {
  code: ProbeProblemCode;
  source: 'browser' | 'horizon' | 'rpc';
  message: string;
  retryable: boolean;
  endpoint: string;
  context?: string;
}

export interface MaintainerOverride {
  id: string;
  schemaVersion: CompatibilitySchemaVersion;
  targetId: string;
  featureId: DashboardFeatureId | '*';
  forcedStatus: Exclude<CompatibilityStatus, 'contradictory' | 'offline'>;
  reason: string;
  createdAt: string;
  expiresAt: string;
  author: string;
}

export interface FeatureDecision {
  feature: DashboardFeatureRequirement;
  status: CompatibilityStatus;
  enabled: boolean;
  summary: string;
  action: string;
  missingMethods: RpcMethodName[];
  optionalMissingMethods: RpcMethodName[];
  evidence: ProbeEvidence[];
  override: MaintainerOverride | null;
}

export interface Freshness {
  observedAt: string;
  expiresAt: string;
  ageMs: number;
  ttlMs: number;
  stale: boolean;
  label: string;
}

export interface CompatibilityAssessment {
  schemaVersion: CompatibilitySchemaVersion;
  matrixVersion: string;
  targetId: string;
  evaluatedAt: string;
  status: CompatibilityStatus;
  summary: string;
  action: string;
  protocolVersion: number | null;
  matrixRelease: ProtocolMatrixRelease | null;
  sdk: SdkCapabilityProfile;
  freshness: Freshness;
  features: FeatureDecision[];
  evidence: ProbeEvidence[];
  warnings: string[];
  appliedOverrides: MaintainerOverride[];
}

export interface EndpointDifference {
  field: string;
  severity: 'info' | 'warning' | 'critical';
  values: Record<string, string>;
  explanation: string;
}

export interface EndpointComparisonResult {
  generatedAt: string;
  status: CompatibilityStatus;
  probes: NetworkProbeResult[];
  differences: EndpointDifference[];
  recommendation: string;
}

export interface AuditArtifact {
  id: string;
  kind: AuditArtifactKind;
  name: string;
  schemaVersion: number | null;
  protocolVersion: number | null;
  xdrType: string | null;
  updatedAt: string | null;
  payload: unknown;
}

export interface AuditInventoryDocument {
  schemaVersion: CompatibilitySchemaVersion;
  kind: 'upgrade-audit-inventory';
  exportedAt: string;
  artifacts: AuditArtifact[];
}

export interface AuditFinding {
  artifactId: string;
  artifactName: string;
  kind: AuditArtifactKind;
  status: 'pass' | 'warning' | 'fail' | 'unknown';
  title: string;
  explanation: string;
  action: string;
  evidence: string[];
}

export interface UpgradeReadinessAudit {
  schemaVersion: CompatibilitySchemaVersion;
  auditId: string;
  generatedAt: string;
  targetProtocol: number;
  status: 'ready' | 'attention' | 'blocked' | 'unknown';
  counts: Record<AuditFinding['status'], number>;
  findings: AuditFinding[];
  evidence: ProbeEvidence[];
}

export interface CompatibilityExportDocument {
  schemaVersion: CompatibilitySchemaVersion;
  kind: 'compatibility-report';
  exportedAt: string;
  redacted: true;
  matrixVersion: string;
  assessment: CompatibilityAssessment;
  comparison: EndpointComparisonResult | null;
  audit: UpgradeReadinessAudit | null;
}

export interface ProbeOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  cacheTtlMs?: number;
  now?: () => Date;
}

export interface ProbeService {
  probe(_target: NetworkProbeTarget, _options?: ProbeOptions): Promise<NetworkProbeResult>;
}
