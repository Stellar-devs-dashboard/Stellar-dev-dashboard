import type { NetworkName } from '../lib/stellar';

/** Bump when the shape of a persisted or exported document changes. */
export const RESOURCE_PROFILING_SCHEMA_VERSION = 2;

export type ProfileSource = 'simulation' | 'confirmed-transaction' | 'imported';

export type ResourceMetricKey =
  | 'cpuInstructions'
  | 'memoryBytes'
  | 'readBytes'
  | 'writeBytes'
  | 'readLedgerEntries'
  | 'writeLedgerEntries'
  | 'eventCount'
  | 'eventSizeBytes'
  | 'returnValueSizeBytes'
  | 'transactionSizeBytes'
  | 'resourceFeeStroops'
  | 'inclusionFeeStroops'
  | 'totalFeeStroops';

export type MetricCategory = 'compute' | 'storage' | 'footprint' | 'events' | 'size' | 'fee';

export interface MetricDescriptor {
  key: ResourceMetricKey;
  label: string;
  category: MetricCategory;
  unit: 'instructions' | 'bytes' | 'entries' | 'count' | 'stroops';
  /** Whether a larger value is worse (true for every current metric). */
  higherIsWorse: boolean;
}

/** A single named ledger footprint entry captured for hot-path annotation. */
export interface FootprintEntryProfile {
  type: string;
  xdr: string;
  access: 'read-only' | 'read-write';
  /** Best-effort byte size of the entry's XDR encoding, used to rank hot paths. */
  approxSizeBytes: number;
}

export interface ProfileProvenance {
  network: NetworkName | 'unknown';
  source: ProfileSource;
  capturedAt: string;
  ledgerSequence: number | null;
  contractId: string | null;
  functionName: string | null;
  /** Deterministic hash of the normalized inputs, used to group repeat samples. */
  inputsHash: string;
  /** Human-readable, redaction-safe summary of the inputs used for this call. */
  inputsSummary: string;
  transactionHash: string | null;
  rpcLatestLedger: number | null;
  sdkVersion: string | null;
  artifactName: string | null;
}

/** A single normalized measurement of classic + Soroban resource usage. */
export interface ResourceProfile {
  id: string;
  metrics: Partial<Record<ResourceMetricKey, number>>;
  /** Metric keys that could not be extracted from the source data (RPC version gaps, etc). */
  missingMetrics: ResourceMetricKey[];
  footprint: FootprintEntryProfile[];
  provenance: ProfileProvenance;
}

export interface StatisticalSummary {
  count: number;
  mean: number;
  median: number;
  stdDev: number;
  min: number;
  max: number;
  p50: number;
  p90: number;
  p99: number;
  /** Coefficient of variation (stdDev / mean); high values flag noisy samples. */
  coefficientOfVariation: number;
}

export type MetricSummaryMap = Partial<Record<ResourceMetricKey, StatisticalSummary>>;

/** A named, versioned collection of samples used as a comparison anchor. */
export interface Baseline {
  id: string;
  schemaVersion: number;
  name: string;
  description: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  profiles: ResourceProfile[];
}

export type ThresholdDirection = 'increase' | 'decrease' | 'any';

export interface ComparisonThreshold {
  metric: ResourceMetricKey;
  /** Absolute unit delta that triggers a regression, or null to only use percentage. */
  absolute: number | null;
  /** Fractional (0.1 = 10%) delta that triggers a regression, or null to only use absolute. */
  percentage: number | null;
  direction: ThresholdDirection;
}

export interface BudgetOverride {
  /** Match on contractId, functionName, or both; null means "any". */
  contractId: string | null;
  functionName: string | null;
  thresholds: ComparisonThreshold[];
}

export interface ResourceBudget {
  id: string;
  schemaVersion: number;
  name: string;
  description: string;
  thresholds: ComparisonThreshold[];
  overrides: BudgetOverride[];
  createdAt: string;
  updatedAt: string;
}

export type RegressionClassification =
  | 'regression'
  | 'improvement'
  | 'neutral'
  | 'noise'
  | 'insufficient-data';

export interface MetricComparison {
  metric: ResourceMetricKey;
  baselineValue: number | null;
  candidateValue: number | null;
  baselineSummary: StatisticalSummary | null;
  absoluteDelta: number | null;
  percentageDelta: number | null;
  classification: RegressionClassification;
  breachedThreshold: ComparisonThreshold | null;
}

export interface ComparisonResult {
  id: string;
  generatedAt: string;
  baselineId: string;
  baselineName: string;
  candidate: ResourceProfile;
  metrics: MetricComparison[];
  regressionCount: number;
  improvementCount: number;
  overallClassification: RegressionClassification;
}

export interface BudgetMetricEvaluation {
  metric: ResourceMetricKey;
  value: number | null;
  threshold: ComparisonThreshold;
  baselineValue: number | null;
  pass: boolean;
  reason: string;
}

export interface BudgetEvaluation {
  budgetId: string;
  budgetName: string;
  candidateId: string;
  generatedAt: string;
  results: BudgetMetricEvaluation[];
  pass: boolean;
}

export type ProfilingErrorCode =
  | 'invalid-input'
  | 'simulation-failed'
  | 'network-unavailable'
  | 'offline'
  | 'timeout'
  | 'aborted'
  | 'storage-unavailable'
  | 'not-found'
  | 'unsupported-schema-version'
  | 'export-failed';

export interface ProfilingApiError {
  code: ProfilingErrorCode;
  message: string;
  retryable: boolean;
  requestId?: string;
}

/** Versioned, CI-consumable export document. */
export interface ProfilingExportDocument {
  schemaVersion: number;
  exportedAt: string;
  kind: 'baseline' | 'comparison' | 'budget-evaluation';
  redacted: boolean;
  payload: Baseline | ComparisonResult | BudgetEvaluation;
}

export interface CaptureSimulationInput {
  network: NetworkName;
  contractId: string;
  functionName: string;
  args: { type: 'string' | 'int' | 'address' | 'bool'; value: string }[];
  sourceAccount: string;
  artifactName?: string;
}
