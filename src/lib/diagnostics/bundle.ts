import {
  DIAGNOSTIC_BUNDLE_KIND,
  DIAGNOSTIC_SCHEMA_VERSION,
  type BundleInclusion,
  type DiagnosticBreadcrumb,
  type DiagnosticBundle,
  type DiagnosticBundleComparison,
  type DiagnosticBundleContent,
  type DiagnosticBundlePreview,
  type DiagnosticCategory,
  type DiagnosticEvent,
  type EndpointHealth,
  type EnvironmentSnapshot,
  type FeatureFlagSnapshot,
  type ServiceWorkerDiagnosticState,
  type TroubleshootingFlowId,
  type TroubleshootingRun,
} from '../../types/diagnostics';
import { diagnosticByteLength, redactDiagnosticValue, stableCanonicalJson } from './redaction';

export const DEFAULT_BUNDLE_INCLUSION: BundleInclusion = {
  events: true,
  eventDetails: true,
  eventCategories: [
    'request',
    'stream',
    'wallet',
    'signing',
    'storage',
    'rendering',
    'performance',
    'service-worker',
    'navigation',
    'runtime',
  ],
  breadcrumbs: true,
  breadcrumbDetails: true,
  environment: true,
  environmentLocale: false,
  environmentTimezone: false,
  environmentViewport: true,
  featureFlags: true,
  endpointHealth: true,
  serviceWorker: true,
  troubleshooting: true,
};

const VALID_CATEGORIES = new Set<DiagnosticCategory>(DEFAULT_BUNDLE_INCLUSION.eventCategories);
const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
const MAX_EVENTS = 1_000;
const MAX_BREADCRUMBS = 500;
const MAX_RUNS = 50;
const VALID_SEVERITIES = new Set(['debug', 'info', 'warning', 'error', 'critical']);
const VALID_OUTCOMES = new Set(['started', 'success', 'degraded', 'failure', 'cancelled']);
const VALID_SOURCES = new Set(['browser', 'dashboard', 'probe', 'import']);
const VALID_FLOW_IDS = new Set([
  'endpoint-connectivity',
  'wallet-connection',
  'transaction-submission',
  'rendering-failure',
  'storage-failure',
  'offline-service-worker',
]);
const VALID_CHECK_IDS = new Set([
  'browser-online',
  'endpoint-reachable',
  'rpc-responsive',
  'wallet-api-present',
  'storage-roundtrip',
  'root-mounted',
  'css-variables',
  'service-worker-state',
  'cache-availability',
  'recent-failure-evidence',
]);

export interface BuildDiagnosticBundleInput {
  events: DiagnosticEvent[];
  breadcrumbs: DiagnosticBreadcrumb[];
  environment?: EnvironmentSnapshot;
  featureFlags?: FeatureFlagSnapshot[];
  endpointHealth?: EndpointHealth[];
  serviceWorker?: ServiceWorkerDiagnosticState;
  troubleshootingRuns?: TroubleshootingRun[];
  inclusion?: BundleInclusion;
  now?: Date;
  expiresInDays?: number;
  id?: string;
}

export class DiagnosticBundleError extends Error {
  readonly code:
    'invalid-bundle' | 'integrity-failed' | 'unsupported-version' | 'size-limit' | 'expired';

  constructor(
    message: string,
    code: 'invalid-bundle' | 'integrity-failed' | 'unsupported-version' | 'size-limit' | 'expired'
  ) {
    super(message);
    this.name = 'DiagnosticBundleError';
    this.code = code;
  }
}

function makeId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? `bundle-${crypto.randomUUID().replace(/-/g, '')}`
    : `bundle-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeInclusion(input?: BundleInclusion): BundleInclusion {
  const source = input ?? DEFAULT_BUNDLE_INCLUSION;
  const categories = Array.from(new Set(source.eventCategories)).filter((category) =>
    VALID_CATEGORIES.has(category)
  );
  return {
    events: Boolean(source.events),
    eventDetails: Boolean(source.eventDetails),
    eventCategories: categories,
    breadcrumbs: Boolean(source.breadcrumbs),
    breadcrumbDetails: Boolean(source.breadcrumbDetails),
    environment: Boolean(source.environment),
    environmentLocale: Boolean(source.environmentLocale),
    environmentTimezone: Boolean(source.environmentTimezone),
    environmentViewport: Boolean(source.environmentViewport),
    featureFlags: Boolean(source.featureFlags),
    endpointHealth: Boolean(source.endpointHealth),
    serviceWorker: Boolean(source.serviceWorker),
    troubleshooting: Boolean(source.troubleshooting),
  };
}

function safe<T>(value: T, maxOutputBytes = 512 * 1024): T {
  return redactDiagnosticValue(value, { maxOutputBytes }).value as T;
}

function environmentFields(
  environment: EnvironmentSnapshot | undefined,
  inclusion: BundleInclusion
): Partial<EnvironmentSnapshot> | undefined {
  if (!environment || !inclusion.environment) return undefined;
  return {
    capturedAt: environment.capturedAt,
    appVersion: environment.appVersion,
    buildMode: environment.buildMode,
    browserFamily: environment.browserFamily,
    platformClass: environment.platformClass,
    online: environment.online,
    cookieEnabled: environment.cookieEnabled,
    ...(environment.storageEstimate ? { storageEstimate: environment.storageEstimate } : {}),
    ...(inclusion.environmentLocale ? { language: environment.language } : {}),
    ...(inclusion.environmentTimezone ? { timezone: environment.timezone } : {}),
    ...(inclusion.environmentViewport ? { viewport: environment.viewport } : {}),
  };
}

async function sha256(value: string): Promise<string> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new DiagnosticBundleError(
      'SHA-256 is unavailable in this browser context.',
      'integrity-failed'
    );
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function integrityPayload(bundle: DiagnosticBundle): unknown {
  const { digest: _digest, ...manifest } = bundle.manifest;
  return {
    kind: bundle.kind,
    schemaVersion: bundle.schemaVersion,
    id: bundle.id,
    createdAt: bundle.createdAt,
    manifest,
    content: bundle.content,
  };
}

function buildContent(
  input: BuildDiagnosticBundleInput,
  inclusion: BundleInclusion
): DiagnosticBundleContent {
  const events = inclusion.events
    ? input.events
        .filter((event) => inclusion.eventCategories.includes(event.category))
        .slice(-MAX_EVENTS)
        .map((event) =>
          safe({ ...event, details: inclusion.eventDetails ? event.details : {} }, 64 * 1024)
        )
    : [];
  const breadcrumbs = inclusion.breadcrumbs
    ? input.breadcrumbs
        .slice(-MAX_BREADCRUMBS)
        .map((item) =>
          safe({ ...item, detail: inclusion.breadcrumbDetails ? item.detail : {} }, 32 * 1024)
        )
    : [];
  const environment = environmentFields(input.environment, inclusion);
  return {
    events,
    breadcrumbs,
    ...(environment ? { environment: safe(environment) } : {}),
    ...(inclusion.featureFlags && input.featureFlags
      ? { featureFlags: safe(input.featureFlags.slice(0, 100)) }
      : {}),
    ...(inclusion.endpointHealth && input.endpointHealth
      ? { endpointHealth: safe(input.endpointHealth.slice(0, 50)) }
      : {}),
    ...(inclusion.serviceWorker && input.serviceWorker
      ? { serviceWorker: safe(input.serviceWorker) }
      : {}),
    ...(inclusion.troubleshooting && input.troubleshootingRuns
      ? { troubleshootingRuns: safe(input.troubleshootingRuns.slice(-MAX_RUNS), 256 * 1024) }
      : {}),
  };
}

export async function buildDiagnosticBundle(
  input: BuildDiagnosticBundleInput
): Promise<DiagnosticBundlePreview> {
  const now = input.now ?? new Date();
  const inclusion = normalizeInclusion(input.inclusion);
  const content = buildContent(input, inclusion);
  const days = Math.max(1, Math.min(30, Math.floor(input.expiresInDays ?? 7)));
  const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60_000).toISOString();
  const redactionCount =
    content.events.reduce((total, event) => total + event.redactionCount, 0) +
    content.breadcrumbs.reduce((total, breadcrumb) => total + breadcrumb.redactionCount, 0);
  const bundle: DiagnosticBundle = {
    kind: DIAGNOSTIC_BUNDLE_KIND,
    schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
    id: input.id ?? makeId(),
    createdAt: now.toISOString(),
    manifest: {
      algorithm: 'SHA-256',
      digest: '0'.repeat(64),
      generatedAt: now.toISOString(),
      expiresAt,
      eventCount: content.events.length,
      breadcrumbCount: content.breadcrumbs.length,
      redactionCount,
      byteLength: diagnosticByteLength(content),
      inclusion,
    },
    content,
  };
  bundle.manifest.digest = await sha256(stableCanonicalJson(integrityPayload(bundle)));
  const omittedFields = [
    ...(!inclusion.events ? ['events'] : []),
    ...(!inclusion.eventDetails ? ['event details'] : []),
    ...(!inclusion.breadcrumbs ? ['breadcrumbs'] : []),
    ...(!inclusion.breadcrumbDetails ? ['breadcrumb details'] : []),
    ...(!inclusion.environment ? ['environment'] : []),
    ...(!inclusion.environmentLocale ? ['locale'] : []),
    ...(!inclusion.environmentTimezone ? ['timezone'] : []),
    ...(!inclusion.environmentViewport ? ['viewport'] : []),
    ...(!inclusion.featureFlags ? ['feature flags'] : []),
    ...(!inclusion.endpointHealth ? ['endpoint health'] : []),
    ...(!inclusion.serviceWorker ? ['service worker'] : []),
    ...(!inclusion.troubleshooting ? ['troubleshooting runs'] : []),
  ];
  return {
    bundle,
    eventCount: content.events.length,
    breadcrumbCount: content.breadcrumbs.length,
    redactionCount,
    byteLength: diagnosticByteLength(bundle),
    omittedFields,
    expiresAt,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function invalid(message: string): never {
  throw new DiagnosticBundleError(message, 'invalid-bundle');
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = new Set(allowed);
  return Object.keys(value).every((key) => keys.has(key));
}

function boundedString(value: unknown, maxLength: number, allowEmpty = false): value is string {
  return (
    typeof value === 'string' &&
    value.length <= maxLength &&
    (allowEmpty || value.trim().length > 0)
  );
}

function validTimestamp(value: unknown): value is string {
  return (
    boundedString(value, 40) &&
    /^\d{4}-\d{2}-\d{2}T/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function integerInRange(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}

function validateInclusion(value: unknown): asserts value is BundleInclusion {
  if (!isRecord(value)) invalid('Bundle inclusion manifest is malformed.');
  const booleanKeys: Array<Exclude<keyof BundleInclusion, 'eventCategories'>> = [
    'events',
    'eventDetails',
    'breadcrumbs',
    'breadcrumbDetails',
    'environment',
    'environmentLocale',
    'environmentTimezone',
    'environmentViewport',
    'featureFlags',
    'endpointHealth',
    'serviceWorker',
    'troubleshooting',
  ];
  if (
    !hasOnlyKeys(value, [...booleanKeys, 'eventCategories']) ||
    booleanKeys.some((key) => typeof value[key] !== 'boolean') ||
    !Array.isArray(value.eventCategories) ||
    value.eventCategories.length > VALID_CATEGORIES.size ||
    value.eventCategories.some(
      (category) =>
        typeof category !== 'string' || !VALID_CATEGORIES.has(category as DiagnosticCategory)
    ) ||
    new Set(value.eventCategories).size !== value.eventCategories.length
  ) {
    invalid('Bundle inclusion manifest is malformed.');
  }
}

function validateEvent(value: unknown, index: number): asserts value is DiagnosticEvent {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'schemaVersion',
      'id',
      'sequence',
      'timestamp',
      'category',
      'severity',
      'name',
      'message',
      'outcome',
      'details',
      'requestId',
      'correlationId',
      'causationId',
      'feature',
      'durationMs',
      'source',
      'redactionCount',
      'truncated',
    ]) ||
    value.schemaVersion !== DIAGNOSTIC_SCHEMA_VERSION ||
    !boundedString(value.id, 120) ||
    !integerInRange(value.sequence, 0, Number.MAX_SAFE_INTEGER) ||
    !validTimestamp(value.timestamp) ||
    typeof value.category !== 'string' ||
    !VALID_CATEGORIES.has(value.category as DiagnosticCategory) ||
    typeof value.severity !== 'string' ||
    !VALID_SEVERITIES.has(value.severity) ||
    !boundedString(value.name, 120) ||
    !boundedString(value.message, 8_192, true) ||
    typeof value.outcome !== 'string' ||
    !VALID_OUTCOMES.has(value.outcome) ||
    typeof value.source !== 'string' ||
    !VALID_SOURCES.has(value.source) ||
    !integerInRange(value.redactionCount, 0, 1_000_000) ||
    typeof value.truncated !== 'boolean' ||
    ['requestId', 'correlationId', 'causationId', 'feature'].some(
      (key) => value[key] !== undefined && !boundedString(value[key], 160)
    ) ||
    (value.durationMs !== undefined &&
      (typeof value.durationMs !== 'number' ||
        !Number.isFinite(value.durationMs) ||
        value.durationMs < 0 ||
        value.durationMs > 86_400_000))
  ) {
    invalid(`Bundle event ${index + 1} is malformed.`);
  }
}

function validateBreadcrumb(value: unknown, index: number): void {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'id',
      'sequence',
      'timestamp',
      'action',
      'feature',
      'detail',
      'correlationId',
      'redactionCount',
    ]) ||
    !boundedString(value.id, 120) ||
    !integerInRange(value.sequence, 0, Number.MAX_SAFE_INTEGER) ||
    !validTimestamp(value.timestamp) ||
    !boundedString(value.action, 8_192) ||
    !integerInRange(value.redactionCount, 0, 1_000_000) ||
    ['feature', 'correlationId'].some(
      (key) => value[key] !== undefined && !boundedString(value[key], 160)
    )
  ) {
    invalid(`Bundle breadcrumb ${index + 1} is malformed.`);
  }
}

function validateEnvironment(value: unknown): void {
  if (value === undefined) return;
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'capturedAt',
      'appVersion',
      'buildMode',
      'browserFamily',
      'platformClass',
      'language',
      'timezone',
      'viewport',
      'online',
      'cookieEnabled',
      'storageEstimate',
    ]) ||
    !validTimestamp(value.capturedAt) ||
    !boundedString(value.appVersion, 40) ||
    !boundedString(value.buildMode, 40) ||
    !['chromium', 'firefox', 'webkit', 'unknown'].includes(String(value.browserFamily)) ||
    !['desktop', 'mobile', 'tablet', 'unknown'].includes(String(value.platformClass)) ||
    typeof value.online !== 'boolean' ||
    typeof value.cookieEnabled !== 'boolean' ||
    (value.language !== undefined && !boundedString(value.language, 16)) ||
    (value.timezone !== undefined && !boundedString(value.timezone, 80))
  ) {
    invalid('Bundle environment is malformed.');
  }
  if (
    value.viewport !== undefined &&
    (!isRecord(value.viewport) ||
      !hasOnlyKeys(value.viewport, ['width', 'height']) ||
      !integerInRange(value.viewport.width, 0, 100_000) ||
      !integerInRange(value.viewport.height, 0, 100_000))
  ) {
    invalid('Bundle viewport is malformed.');
  }
  if (
    value.storageEstimate !== undefined &&
    (!isRecord(value.storageEstimate) ||
      !hasOnlyKeys(value.storageEstimate, ['usageBucket', 'quotaBucket']) ||
      !boundedString(value.storageEstimate.usageBucket, 40) ||
      !boundedString(value.storageEstimate.quotaBucket, 40))
  ) {
    invalid('Bundle storage estimate is malformed.');
  }
}

function validateOptionalCollections(content: Record<string, unknown>): void {
  if (
    content.featureFlags !== undefined &&
    (!Array.isArray(content.featureFlags) ||
      content.featureFlags.length > 100 ||
      content.featureFlags.some(
        (flag) =>
          !isRecord(flag) ||
          !hasOnlyKeys(flag, ['id', 'enabled', 'source']) ||
          !boundedString(flag.id, 64) ||
          typeof flag.enabled !== 'boolean' ||
          !['default', 'runtime', 'query'].includes(String(flag.source))
      ))
  ) {
    invalid('Bundle feature flags are malformed.');
  }
  if (
    content.endpointHealth !== undefined &&
    (!Array.isArray(content.endpointHealth) ||
      content.endpointHealth.length > 50 ||
      content.endpointHealth.some(
        (endpoint) =>
          !isRecord(endpoint) ||
          !hasOnlyKeys(endpoint, [
            'id',
            'kind',
            'state',
            'checkedAt',
            'latencyMs',
            'statusCode',
            'requestId',
            'detail',
          ]) ||
          !boundedString(endpoint.id, 160) ||
          !['horizon', 'soroban-rpc', 'service'].includes(String(endpoint.kind)) ||
          !['healthy', 'degraded', 'unreachable', 'unknown'].includes(String(endpoint.state)) ||
          !validTimestamp(endpoint.checkedAt) ||
          !boundedString(endpoint.requestId, 160) ||
          !boundedString(endpoint.detail, 1_024, true) ||
          (endpoint.latencyMs !== undefined &&
            (typeof endpoint.latencyMs !== 'number' || !Number.isFinite(endpoint.latencyMs))) ||
          (endpoint.statusCode !== undefined && !integerInRange(endpoint.statusCode, 0, 999))
      ))
  ) {
    invalid('Bundle endpoint health is malformed.');
  }
}

function validateServiceWorker(value: unknown): void {
  if (value === undefined) return;
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'supported',
      'controlled',
      'registrationState',
      'scope',
      'cacheNames',
      'checkedAt',
    ]) ||
    typeof value.supported !== 'boolean' ||
    typeof value.controlled !== 'boolean' ||
    !['active', 'installing', 'waiting', 'none', 'unknown'].includes(
      String(value.registrationState)
    ) ||
    !['same-origin', 'unexpected', 'unknown', 'none'].includes(String(value.scope)) ||
    !Array.isArray(value.cacheNames) ||
    value.cacheNames.length > 20 ||
    value.cacheNames.some((name) => !boundedString(name, 40)) ||
    !validTimestamp(value.checkedAt)
  ) {
    invalid('Bundle service-worker state is malformed.');
  }
}

function validateInclusionContent(
  content: DiagnosticBundleContent,
  inclusion: BundleInclusion
): void {
  const emptyRecord = (value: unknown) => isRecord(value) && Object.keys(value).length === 0;
  if (
    (!inclusion.events && content.events.length > 0) ||
    content.events.some((event) => !inclusion.eventCategories.includes(event.category)) ||
    (!inclusion.eventDetails && content.events.some((event) => !emptyRecord(event.details))) ||
    (!inclusion.breadcrumbs && content.breadcrumbs.length > 0) ||
    (!inclusion.breadcrumbDetails &&
      content.breadcrumbs.some((breadcrumb) => !emptyRecord(breadcrumb.detail))) ||
    (!inclusion.environment && content.environment !== undefined) ||
    (!inclusion.environmentLocale && content.environment?.language !== undefined) ||
    (!inclusion.environmentTimezone && content.environment?.timezone !== undefined) ||
    (!inclusion.environmentViewport && content.environment?.viewport !== undefined) ||
    (!inclusion.featureFlags && content.featureFlags !== undefined) ||
    (!inclusion.endpointHealth && content.endpointHealth !== undefined) ||
    (!inclusion.serviceWorker && content.serviceWorker !== undefined) ||
    (!inclusion.troubleshooting && content.troubleshootingRuns !== undefined)
  ) {
    invalid('Bundle content does not match its inclusion manifest.');
  }
}

function validateTroubleshootingRuns(value: unknown): void {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length > MAX_RUNS)
    invalid('Bundle troubleshooting record count is invalid.');
  value.forEach((run, runIndex) => {
    if (
      !isRecord(run) ||
      !hasOnlyKeys(run, [
        'schemaVersion',
        'id',
        'flowId',
        'startedAt',
        'completedAt',
        'status',
        'results',
        'remediations',
        'correlationId',
      ]) ||
      run.schemaVersion !== DIAGNOSTIC_SCHEMA_VERSION ||
      !boundedString(run.id, 120) ||
      !VALID_FLOW_IDS.has(String(run.flowId)) ||
      !validTimestamp(run.startedAt) ||
      !validTimestamp(run.completedAt) ||
      !['resolved', 'action-needed', 'inconclusive', 'cancelled'].includes(String(run.status)) ||
      !boundedString(run.correlationId, 160) ||
      !Array.isArray(run.results) ||
      run.results.length > 20 ||
      !Array.isArray(run.remediations) ||
      run.remediations.length > 20
    ) {
      invalid(`Bundle troubleshooting run ${runIndex + 1} is malformed.`);
    }
    run.results.forEach((checkResult, checkIndex) => {
      if (
        !isRecord(checkResult) ||
        !hasOnlyKeys(checkResult, [
          'checkId',
          'status',
          'startedAt',
          'completedAt',
          'durationMs',
          'summary',
          'evidence',
          'problem',
        ]) ||
        !VALID_CHECK_IDS.has(String(checkResult.checkId)) ||
        !['pass', 'warning', 'fail', 'skipped'].includes(String(checkResult.status)) ||
        !validTimestamp(checkResult.startedAt) ||
        !validTimestamp(checkResult.completedAt) ||
        typeof checkResult.durationMs !== 'number' ||
        !Number.isFinite(checkResult.durationMs) ||
        checkResult.durationMs < 0 ||
        !boundedString(checkResult.summary, 2_048, true)
      ) {
        invalid(`Bundle check result ${runIndex + 1}.${checkIndex + 1} is malformed.`);
      }
      if (
        checkResult.problem !== undefined &&
        (!isRecord(checkResult.problem) ||
          !hasOnlyKeys(checkResult.problem, ['code', 'message', 'retryable', 'context']) ||
          ![
            'aborted',
            'timeout',
            'offline',
            'storage-unavailable',
            'invalid-bundle',
            'integrity-failed',
            'unsupported-version',
            'size-limit',
            'capture-failed',
            'check-failed',
          ].includes(String(checkResult.problem.code)) ||
          !boundedString(checkResult.problem.message, 2_048) ||
          typeof checkResult.problem.retryable !== 'boolean' ||
          (checkResult.problem.context !== undefined &&
            !boundedString(checkResult.problem.context, 200)))
      ) {
        invalid(`Bundle check problem ${runIndex + 1}.${checkIndex + 1} is malformed.`);
      }
    });
    run.remediations.forEach((remediation, remediationIndex) => {
      if (
        !isRecord(remediation) ||
        !hasOnlyKeys(remediation, [
          'id',
          'title',
          'description',
          'steps',
          'destructive',
          'documentationRef',
        ]) ||
        !boundedString(remediation.id, 100) ||
        !boundedString(remediation.title, 200) ||
        !boundedString(remediation.description, 2_048) ||
        remediation.destructive !== false ||
        !boundedString(remediation.documentationRef, 200) ||
        !Array.isArray(remediation.steps) ||
        remediation.steps.length > 20 ||
        remediation.steps.some((step) => !boundedString(step, 1_024))
      ) {
        invalid(`Bundle remediation ${runIndex + 1}.${remediationIndex + 1} is malformed.`);
      }
    });
  });
}

function rejectDangerousKeys(value: unknown, depth = 0): void {
  if (depth > 20)
    throw new DiagnosticBundleError('Imported bundle nesting is too deep.', 'invalid-bundle');
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item) => rejectDangerousKeys(item, depth + 1));
    return;
  }
  for (const key of Object.keys(value)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key)) {
      throw new DiagnosticBundleError(
        'Imported bundle contains a prohibited key.',
        'invalid-bundle'
      );
    }
    rejectDangerousKeys((value as Record<string, unknown>)[key], depth + 1);
  }
}

function validateStructure(value: unknown): asserts value is DiagnosticBundle {
  if (!isRecord(value) || value.kind !== DIAGNOSTIC_BUNDLE_KIND) {
    throw new DiagnosticBundleError(
      'File is not a Stellar dashboard diagnostic bundle.',
      'invalid-bundle'
    );
  }
  if (value.schemaVersion !== DIAGNOSTIC_SCHEMA_VERSION) {
    throw new DiagnosticBundleError(
      Number(value.schemaVersion) > DIAGNOSTIC_SCHEMA_VERSION
        ? 'Bundle was created by a newer unsupported schema.'
        : 'Legacy bundle schema has no integrity contract and must be regenerated.',
      'unsupported-version'
    );
  }
  if (
    !hasOnlyKeys(value, ['kind', 'schemaVersion', 'id', 'createdAt', 'manifest', 'content']) ||
    !boundedString(value.id, 100) ||
    !validTimestamp(value.createdAt) ||
    !isRecord(value.manifest)
  ) {
    throw new DiagnosticBundleError('Bundle identity or manifest is malformed.', 'invalid-bundle');
  }
  if (
    !isRecord(value.content) ||
    !hasOnlyKeys(value.content, [
      'events',
      'breadcrumbs',
      'environment',
      'featureFlags',
      'endpointHealth',
      'serviceWorker',
      'troubleshootingRuns',
    ]) ||
    !Array.isArray(value.content.events) ||
    !Array.isArray(value.content.breadcrumbs)
  ) {
    throw new DiagnosticBundleError('Bundle content is malformed.', 'invalid-bundle');
  }
  if (
    value.content.events.length > MAX_EVENTS ||
    value.content.breadcrumbs.length > MAX_BREADCRUMBS
  ) {
    throw new DiagnosticBundleError(
      'Bundle record count exceeds the supported limit.',
      'size-limit'
    );
  }
  const manifest = value.manifest;
  if (
    !hasOnlyKeys(manifest, [
      'algorithm',
      'digest',
      'generatedAt',
      'expiresAt',
      'eventCount',
      'breadcrumbCount',
      'redactionCount',
      'byteLength',
      'inclusion',
    ]) ||
    manifest.algorithm !== 'SHA-256' ||
    typeof manifest.digest !== 'string' ||
    !/^[a-f0-9]{64}$/.test(manifest.digest) ||
    !validTimestamp(manifest.generatedAt) ||
    !validTimestamp(manifest.expiresAt) ||
    !integerInRange(manifest.eventCount, 0, MAX_EVENTS) ||
    !integerInRange(manifest.breadcrumbCount, 0, MAX_BREADCRUMBS) ||
    !integerInRange(manifest.redactionCount, 0, 10_000_000) ||
    !integerInRange(manifest.byteLength, 0, MAX_IMPORT_BYTES) ||
    !isRecord(manifest.inclusion)
  ) {
    throw new DiagnosticBundleError('Bundle integrity manifest is malformed.', 'invalid-bundle');
  }
  validateInclusion(manifest.inclusion);
  value.content.events.forEach(validateEvent);
  value.content.breadcrumbs.forEach(validateBreadcrumb);
  validateEnvironment(value.content.environment);
  validateOptionalCollections(value.content);
  validateServiceWorker(value.content.serviceWorker);
  validateTroubleshootingRuns(value.content.troubleshootingRuns);
  validateInclusionContent(value.content as unknown as DiagnosticBundleContent, manifest.inclusion);
}

export function isDiagnosticBundleStructure(value: unknown): value is DiagnosticBundle {
  try {
    rejectDangerousKeys(value);
    validateStructure(value);
    return true;
  } catch {
    return false;
  }
}

export async function verifyDiagnosticBundle(
  bundle: DiagnosticBundle,
  options: { allowExpired?: boolean; now?: Date } = {}
): Promise<boolean> {
  validateStructure(bundle);
  rejectDangerousKeys(bundle);
  const digest = await sha256(stableCanonicalJson(integrityPayload(bundle)));
  if (digest !== bundle.manifest.digest) {
    throw new DiagnosticBundleError(
      'Bundle content does not match its SHA-256 manifest.',
      'integrity-failed'
    );
  }
  if (
    bundle.manifest.eventCount !== bundle.content.events.length ||
    bundle.manifest.breadcrumbCount !== bundle.content.breadcrumbs.length ||
    bundle.manifest.byteLength !== diagnosticByteLength(bundle.content)
  ) {
    throw new DiagnosticBundleError('Bundle counts do not match its manifest.', 'integrity-failed');
  }
  const expires = Date.parse(bundle.manifest.expiresAt);
  if (!Number.isFinite(expires)) {
    throw new DiagnosticBundleError('Bundle expiry is malformed.', 'invalid-bundle');
  }
  if (!options.allowExpired && expires <= (options.now ?? new Date()).getTime()) {
    throw new DiagnosticBundleError('Diagnostic bundle has expired.', 'expired');
  }
  return true;
}

export async function parseDiagnosticBundle(
  text: string,
  options: { allowExpired?: boolean; now?: Date } = {}
): Promise<DiagnosticBundle> {
  if (typeof text !== 'string' || new TextEncoder().encode(text).byteLength > MAX_IMPORT_BYTES) {
    throw new DiagnosticBundleError(
      'Diagnostic bundle exceeds the 2 MiB import limit.',
      'size-limit'
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new DiagnosticBundleError('Diagnostic bundle is not valid JSON.', 'invalid-bundle');
  }
  rejectDangerousKeys(parsed);
  validateStructure(parsed);
  await verifyDiagnosticBundle(parsed, options);
  const sanitized = safe(parsed, MAX_IMPORT_BYTES) as DiagnosticBundle;
  if (stableCanonicalJson(sanitized) !== stableCanonicalJson(parsed)) {
    throw new DiagnosticBundleError(
      'Bundle contains values that do not satisfy the diagnostic redaction contract.',
      'invalid-bundle'
    );
  }
  return parsed;
}

function categoryCounts(bundle: DiagnosticBundle): Map<DiagnosticCategory, number> {
  const counts = new Map<DiagnosticCategory, number>();
  for (const event of bundle.content.events) {
    counts.set(event.category, (counts.get(event.category) ?? 0) + 1);
  }
  return counts;
}

function failureNames(bundle: DiagnosticBundle): Set<string> {
  return new Set(
    bundle.content.events
      .filter((event) => ['failure', 'degraded'].includes(event.outcome))
      .map((event) => event.name)
  );
}

function printable(value: unknown): string {
  if (value === undefined) return 'omitted';
  if (value === null) return 'null';
  return typeof value === 'object' ? stableCanonicalJson(value) : String(value);
}

export async function compareDiagnosticBundles(
  left: DiagnosticBundle,
  right: DiagnosticBundle,
  now = new Date()
): Promise<DiagnosticBundleComparison> {
  const integrity = { left: true, right: true };
  try {
    await verifyDiagnosticBundle(left, { allowExpired: true, now });
  } catch {
    integrity.left = false;
  }
  try {
    await verifyDiagnosticBundle(right, { allowExpired: true, now });
  } catch {
    integrity.right = false;
  }
  const leftCategories = categoryCounts(left);
  const rightCategories = categoryCounts(right);
  const categories = Array.from(
    new Set([...leftCategories.keys(), ...rightCategories.keys()])
  ).sort();
  const leftFailures = failureNames(left);
  const rightFailures = failureNames(right);
  const environmentChanges: DiagnosticBundleComparison['environmentChanges'] = [];
  const environmentFieldsToCompare: Array<keyof EnvironmentSnapshot> = [
    'appVersion',
    'buildMode',
    'browserFamily',
    'platformClass',
    'language',
    'timezone',
    'viewport',
    'online',
    'cookieEnabled',
    'storageEstimate',
  ];
  for (const field of environmentFieldsToCompare) {
    const leftValue = left.content.environment?.[field];
    const rightValue = right.content.environment?.[field];
    if (printable(leftValue) !== printable(rightValue)) {
      environmentChanges.push({
        field,
        left: printable(leftValue),
        right: printable(rightValue),
      });
    }
  }
  const flowIds = new Set<TroubleshootingFlowId>([
    ...(left.content.troubleshootingRuns ?? []).map((run) => run.flowId),
    ...(right.content.troubleshootingRuns ?? []).map((run) => run.flowId),
  ]);
  const flowStatus = (bundle: DiagnosticBundle, flowId: TroubleshootingFlowId) =>
    [...(bundle.content.troubleshootingRuns ?? [])].reverse().find((run) => run.flowId === flowId)
      ?.status ?? 'not-run';
  return {
    leftId: left.id,
    rightId: right.id,
    comparedAt: now.toISOString(),
    integrity,
    eventDelta: right.content.events.length - left.content.events.length,
    breadcrumbDelta: right.content.breadcrumbs.length - left.content.breadcrumbs.length,
    categoryDeltas: categories.map((category) => ({
      category,
      left: leftCategories.get(category) ?? 0,
      right: rightCategories.get(category) ?? 0,
      delta: (rightCategories.get(category) ?? 0) - (leftCategories.get(category) ?? 0),
    })),
    newFailureNames: [...rightFailures].filter((name) => !leftFailures.has(name)).sort(),
    resolvedFailureNames: [...leftFailures].filter((name) => !rightFailures.has(name)).sort(),
    environmentChanges,
    troubleshootingChanges: [...flowIds]
      .sort()
      .map((flowId) => ({
        flowId,
        left: flowStatus(left, flowId),
        right: flowStatus(right, flowId),
      }))
      .filter((item) => item.left !== item.right),
  };
}

export function serializeDiagnosticBundle(bundle: DiagnosticBundle): string {
  return `${JSON.stringify(bundle, null, 2)}\n`;
}

export function downloadDiagnosticBundle(bundle: DiagnosticBundle): void {
  const blob = new Blob([serializeDiagnosticBundle(bundle)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `stellar-diagnostic-${bundle.createdAt.slice(0, 10)}.json`;
  anchor.rel = 'noopener';
  anchor.click();
  URL.revokeObjectURL(url);
}
