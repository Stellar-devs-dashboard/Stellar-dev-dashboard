export const DIAGNOSTIC_SCHEMA_VERSION = 1 as const;
export const DIAGNOSTIC_BUNDLE_KIND = 'stellar-dashboard-diagnostic-bundle' as const;

export type DiagnosticCategory =
  | 'request'
  | 'stream'
  | 'wallet'
  | 'signing'
  | 'storage'
  | 'rendering'
  | 'performance'
  | 'service-worker'
  | 'navigation'
  | 'runtime';

export type DiagnosticSeverity = 'debug' | 'info' | 'warning' | 'error' | 'critical';
export type DiagnosticOutcome = 'started' | 'success' | 'degraded' | 'failure' | 'cancelled';
export type DiagnosticSource = 'browser' | 'dashboard' | 'probe' | 'import';

export interface DiagnosticProblem {
  code:
    | 'aborted'
    | 'timeout'
    | 'offline'
    | 'storage-unavailable'
    | 'invalid-bundle'
    | 'integrity-failed'
    | 'unsupported-version'
    | 'size-limit'
    | 'capture-failed'
    | 'check-failed';
  message: string;
  retryable: boolean;
  context?: string;
}

export interface DiagnosticEventInput {
  category: DiagnosticCategory;
  severity?: DiagnosticSeverity;
  name: string;
  message: string;
  outcome?: DiagnosticOutcome;
  details?: unknown;
  requestId?: string;
  correlationId?: string;
  causationId?: string;
  feature?: string;
  durationMs?: number;
  source?: DiagnosticSource;
}

export interface DiagnosticEvent {
  schemaVersion: typeof DIAGNOSTIC_SCHEMA_VERSION;
  id: string;
  sequence: number;
  timestamp: string;
  category: DiagnosticCategory;
  severity: DiagnosticSeverity;
  name: string;
  message: string;
  outcome: DiagnosticOutcome;
  details: unknown;
  requestId?: string;
  correlationId?: string;
  causationId?: string;
  feature?: string;
  durationMs?: number;
  source: DiagnosticSource;
  redactionCount: number;
  truncated: boolean;
}

export interface DiagnosticBreadcrumbInput {
  action: string;
  feature?: string;
  detail?: unknown;
  correlationId?: string;
}

export interface DiagnosticBreadcrumb {
  id: string;
  sequence: number;
  timestamp: string;
  action: string;
  feature?: string;
  detail: unknown;
  correlationId?: string;
  redactionCount: number;
}

export interface RedactionRule {
  id: string;
  label: string;
  literal: string;
  caseSensitive: boolean;
  enabled: boolean;
}

export interface RedactionOptions {
  customRules?: RedactionRule[];
  maxDepth?: number;
  maxNodes?: number;
  maxArrayItems?: number;
  maxObjectKeys?: number;
  maxStringLength?: number;
  maxOutputBytes?: number;
}

export interface RedactionReport {
  value: unknown;
  replacements: number;
  truncated: boolean;
  cycles: number;
  bytes: number;
  ruleHits: Record<string, number>;
}

export interface DiagnosticCollectorConfig {
  maxEvents: number;
  maxBreadcrumbs: number;
  maxEventBytes: number;
  enabled: boolean;
  customRules: RedactionRule[];
}

export interface DiagnosticSnapshot {
  capturedAt: string;
  enabled: boolean;
  events: DiagnosticEvent[];
  breadcrumbs: DiagnosticBreadcrumb[];
  droppedEvents: number;
  totalRedactions: number;
  approximateBytes: number;
}

export interface DiagnosticRequestContext {
  requestId: string;
  correlationId: string;
  startedAt: number;
  finish: (
    _outcome: Exclude<DiagnosticOutcome, 'started'>,
    _message: string,
    _details?: unknown,
    _severity?: DiagnosticSeverity
  ) => DiagnosticEvent | null;
}

export interface EnvironmentSnapshot {
  capturedAt: string;
  appVersion: string;
  buildMode: string;
  browserFamily: 'chromium' | 'firefox' | 'webkit' | 'unknown';
  platformClass: 'desktop' | 'mobile' | 'tablet' | 'unknown';
  language: string;
  timezone: string;
  viewport: { width: number; height: number };
  online: boolean;
  cookieEnabled: boolean;
  storageEstimate?: { usageBucket: string; quotaBucket: string };
}

export interface FeatureFlagSnapshot {
  id: string;
  enabled: boolean;
  source: 'default' | 'runtime' | 'query';
}

export type EndpointHealthState = 'healthy' | 'degraded' | 'unreachable' | 'unknown';

export interface EndpointHealth {
  id: string;
  kind: 'horizon' | 'soroban-rpc' | 'service';
  state: EndpointHealthState;
  checkedAt: string;
  latencyMs?: number;
  statusCode?: number;
  requestId: string;
  detail: string;
}

export interface ServiceWorkerDiagnosticState {
  supported: boolean;
  controlled: boolean;
  registrationState: 'active' | 'installing' | 'waiting' | 'none' | 'unknown';
  scope: 'same-origin' | 'unexpected' | 'unknown' | 'none';
  cacheNames: string[];
  checkedAt: string;
}

export type TroubleshootingFlowId =
  | 'endpoint-connectivity'
  | 'wallet-connection'
  | 'transaction-submission'
  | 'rendering-failure'
  | 'storage-failure'
  | 'offline-service-worker';

export type TroubleshootingCheckId =
  | 'browser-online'
  | 'endpoint-reachable'
  | 'rpc-responsive'
  | 'wallet-api-present'
  | 'storage-roundtrip'
  | 'root-mounted'
  | 'css-variables'
  | 'service-worker-state'
  | 'cache-availability'
  | 'recent-failure-evidence';

export interface TroubleshootingRemediation {
  id: string;
  title: string;
  description: string;
  steps: string[];
  destructive: false;
  documentationRef: string;
}

export interface TroubleshootingCheckDefinition {
  id: TroubleshootingCheckId;
  title: string;
  description: string;
  timeoutMs: number;
}

export interface TroubleshootingFlowDefinition {
  id: TroubleshootingFlowId;
  title: string;
  summary: string;
  checks: TroubleshootingCheckDefinition[];
  remediationIds: string[];
}

export type TroubleshootingCheckStatus =
  'pending' | 'running' | 'pass' | 'warning' | 'fail' | 'skipped';

export interface TroubleshootingCheckResult {
  checkId: TroubleshootingCheckId;
  status: Exclude<TroubleshootingCheckStatus, 'pending' | 'running'>;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  summary: string;
  evidence: unknown;
  problem?: DiagnosticProblem;
}

export interface TroubleshootingRun {
  schemaVersion: typeof DIAGNOSTIC_SCHEMA_VERSION;
  id: string;
  flowId: TroubleshootingFlowId;
  startedAt: string;
  completedAt: string;
  status: 'resolved' | 'action-needed' | 'inconclusive' | 'cancelled';
  results: TroubleshootingCheckResult[];
  remediations: TroubleshootingRemediation[];
  correlationId: string;
}

export interface TroubleshootingContext {
  signal?: AbortSignal;
  horizonUrl?: string;
  rpcUrl?: string;
  now?: () => Date;
  fetcher?: typeof fetch;
  storage?: Storage;
  events?: DiagnosticEvent[];
}

export interface TroubleshootingService {
  run(
    _flowId: TroubleshootingFlowId,
    _context?: TroubleshootingContext
  ): Promise<TroubleshootingRun>;
}

export interface BundleInclusion {
  events: boolean;
  eventDetails: boolean;
  eventCategories: DiagnosticCategory[];
  breadcrumbs: boolean;
  breadcrumbDetails: boolean;
  environment: boolean;
  environmentLocale: boolean;
  environmentTimezone: boolean;
  environmentViewport: boolean;
  featureFlags: boolean;
  endpointHealth: boolean;
  serviceWorker: boolean;
  troubleshooting: boolean;
}

export interface DiagnosticBundleContent {
  events: DiagnosticEvent[];
  breadcrumbs: DiagnosticBreadcrumb[];
  environment?: Partial<EnvironmentSnapshot>;
  featureFlags?: FeatureFlagSnapshot[];
  endpointHealth?: EndpointHealth[];
  serviceWorker?: ServiceWorkerDiagnosticState;
  troubleshootingRuns?: TroubleshootingRun[];
}

export interface DiagnosticBundleManifest {
  algorithm: 'SHA-256';
  digest: string;
  generatedAt: string;
  expiresAt: string;
  eventCount: number;
  breadcrumbCount: number;
  redactionCount: number;
  byteLength: number;
  inclusion: BundleInclusion;
}

export interface DiagnosticBundle {
  kind: typeof DIAGNOSTIC_BUNDLE_KIND;
  schemaVersion: typeof DIAGNOSTIC_SCHEMA_VERSION;
  id: string;
  createdAt: string;
  manifest: DiagnosticBundleManifest;
  content: DiagnosticBundleContent;
}

export interface DiagnosticBundlePreview {
  bundle: DiagnosticBundle;
  eventCount: number;
  breadcrumbCount: number;
  redactionCount: number;
  byteLength: number;
  omittedFields: string[];
  expiresAt: string;
}

export interface DiagnosticBundleComparison {
  leftId: string;
  rightId: string;
  comparedAt: string;
  integrity: { left: boolean; right: boolean };
  eventDelta: number;
  breadcrumbDelta: number;
  categoryDeltas: Array<{
    category: DiagnosticCategory;
    left: number;
    right: number;
    delta: number;
  }>;
  newFailureNames: string[];
  resolvedFailureNames: string[];
  environmentChanges: Array<{ field: string; left: string; right: string }>;
  troubleshootingChanges: Array<{ flowId: TroubleshootingFlowId; left: string; right: string }>;
}

export interface DiagnosticRepositoryState {
  bundles: DiagnosticBundle[];
  persistence: 'durable' | 'memory-only';
  warning?: string;
}

export interface DiagnosticRepository {
  load(): DiagnosticRepositoryState;
  save(_bundle: DiagnosticBundle): DiagnosticRepositoryState;
  remove(_id: string): DiagnosticRepositoryState;
  cleanup(_now?: Date): DiagnosticRepositoryState;
  clear(): DiagnosticRepositoryState;
}

export type DiagnosticsViewState =
  'loading' | 'empty' | 'success' | 'error' | 'degraded' | 'offline';
