import {
  COMPATIBILITY_SCHEMA_VERSION,
  type CompatibilityAssessment,
  type CompatibilityStatus,
  type EndpointComparisonResult,
  type EndpointDifference,
  type FeatureDecision,
  type Freshness,
  type MaintainerOverride,
  type NetworkProbeResult,
  type ProbeEvidence,
  type RpcMethodName,
  type SdkCapabilityProfile,
} from '../../types/compatibility';
import {
  COMPATIBILITY_MATRIX,
  DASHBOARD_FEATURE_REQUIREMENTS,
  INSTALLED_SDK_PROFILE,
  compareSemver,
  getMatrixRelease,
  isVersionInRange,
} from './matrix';

const STATUS_WEIGHT: Record<CompatibilityStatus, number> = {
  compatible: 0,
  degraded: 1,
  unknown: 2,
  offline: 3,
  contradictory: 4,
  incompatible: 5,
};

function worseStatus(left: CompatibilityStatus, right: CompatibilityStatus): CompatibilityStatus {
  return STATUS_WEIGHT[left] >= STATUS_WEIGHT[right] ? left : right;
}

function matrixEvidence(
  probe: NetworkProbeResult,
  field: string,
  value: string | number | boolean | null,
  now: Date,
  detail?: string
): ProbeEvidence {
  return {
    id: `${probe.requestId}:matrix:${field}`,
    source: 'matrix',
    field,
    value,
    observedAt: now.toISOString(),
    endpoint: `matrix:${COMPATIBILITY_MATRIX.matrixVersion}`,
    confidence: 'inferred',
    ...(detail ? { detail } : {}),
  };
}

export function calculateFreshness(probe: NetworkProbeResult, now = new Date()): Freshness {
  const observedTime = Date.parse(probe.completedAt);
  const expiryTime = Date.parse(probe.expiresAt);
  const safeObserved = Number.isFinite(observedTime) ? observedTime : 0;
  const safeExpiry = Number.isFinite(expiryTime) ? expiryTime : safeObserved;
  const ageMs = Math.max(0, now.getTime() - safeObserved);
  const ttlMs = Math.max(0, safeExpiry - safeObserved);
  const stale = !Number.isFinite(expiryTime) || now.getTime() >= safeExpiry;
  const minutes = Math.floor(ageMs / 60_000);
  return {
    observedAt: probe.completedAt,
    expiresAt: probe.expiresAt,
    ageMs,
    ttlMs,
    stale,
    label: stale
      ? `Expired ${minutes}m after observation`
      : minutes < 1
        ? 'Observed less than a minute ago'
        : `Observed ${minutes}m ago`,
  };
}

function activeOverride(
  overrides: MaintainerOverride[],
  targetId: string,
  featureId: FeatureDecision['feature']['id'],
  now: Date
): MaintainerOverride | null {
  return (
    overrides
      .filter(
        (override) =>
          override.targetId === targetId &&
          (override.featureId === featureId || override.featureId === '*') &&
          Date.parse(override.expiresAt) > now.getTime()
      )
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0] ?? null
  );
}

function observedMethod(
  probe: NetworkProbeResult,
  method: RpcMethodName
): { supported: boolean | null; evidence: ProbeEvidence | null } {
  const observation = probe.methods.find((item) => item.name === method);
  const evidence = observation
    ? (probe.evidence.find((item) => item.id === observation.evidenceId) ?? null)
    : null;
  return { supported: observation?.supported ?? null, evidence };
}

function evaluateFeature(
  probe: NetworkProbeResult,
  sdk: SdkCapabilityProfile,
  feature: (typeof DASHBOARD_FEATURE_REQUIREMENTS)[number],
  overrides: MaintainerOverride[],
  now: Date,
  knownProtocol: boolean
): FeatureDecision {
  const protocol = probe.protocolVersion;
  const required = feature.requiredMethods.map((method) => ({
    method,
    ...observedMethod(probe, method),
  }));
  const optional = feature.optionalMethods.map((method) => ({
    method,
    ...observedMethod(probe, method),
  }));
  const missingMethods = required
    .filter((item) => item.supported === false)
    .map((item) => item.method);
  const unknownMethods = required
    .filter((item) => item.supported === null)
    .map((item) => item.method);
  const optionalMissingMethods = optional
    .filter((item) => item.supported !== true)
    .map((item) => item.method);
  const evidence = [...required, ...optional]
    .map((item) => item.evidence)
    .filter((item): item is ProbeEvidence => item !== null);

  let status: CompatibilityStatus = 'compatible';
  let summary = `${feature.label} requirements are directly satisfied.`;
  let action = 'No action required.';

  if (!probe.online) {
    status = 'offline';
    summary = `${feature.label} was not revalidated because the browser is offline.`;
    action = 'Reconnect and refresh; cached evidence is informational only.';
  } else if (protocol === null) {
    status = 'unknown';
    summary = `${feature.label} is gated because no protocol version was observed.`;
    action = feature.recovery;
  } else if (!knownProtocol) {
    status = 'incompatible';
    summary = `Protocol ${protocol} is outside reviewed matrix ${COMPATIBILITY_MATRIX.matrixVersion}.`;
    action =
      'Review its XDR and RPC changes, update the matrix, then release a compatible SDK build.';
  } else if (!isVersionInRange(protocol, feature.protocolRange)) {
    status = 'incompatible';
    summary = feature.hardFailureMessage;
    action = feature.recovery;
  } else if (
    !isVersionInRange(protocol, sdk.protocolRange) ||
    !isVersionInRange(protocol, sdk.xdrRange)
  ) {
    status = 'incompatible';
    summary = `Installed SDK ${sdk.version} does not include protocol ${protocol} XDR.`;
    action = `Upgrade to the reviewed SDK for protocol ${protocol} before enabling ${feature.label}.`;
  } else if (missingMethods.length > 0) {
    status = 'incompatible';
    summary = `${feature.hardFailureMessage} Missing: ${missingMethods.join(', ')}.`;
    action = feature.recovery;
  } else if (unknownMethods.length > 0) {
    status = 'unknown';
    summary = `Required method evidence is incomplete: ${unknownMethods.join(', ')}.`;
    action = 'Retry the probe before using this feature.';
  } else if (optionalMissingMethods.length > 0) {
    status = 'degraded';
    summary = `${feature.degradedMessage} Missing or unverified: ${optionalMissingMethods.join(', ')}.`;
    action = feature.recovery;
  }

  const override = activeOverride(overrides, probe.target.id, feature.id, now);
  if (override) {
    status = override.forcedStatus;
    summary = `Maintainer override: ${override.reason}`;
    action = `Revalidate before override expiry ${override.expiresAt}.`;
    evidence.push({
      id: `${probe.requestId}:override:${override.id}`,
      source: 'maintainer-override',
      field: `feature.${feature.id}.status`,
      value: override.forcedStatus,
      observedAt: now.toISOString(),
      endpoint: `target:${probe.target.id}`,
      confidence: 'overridden',
      detail: `Author: ${override.author}; expires: ${override.expiresAt}`,
    });
  }

  return {
    feature,
    status,
    enabled: status === 'compatible' || status === 'degraded',
    summary,
    action,
    missingMethods: [...missingMethods, ...unknownMethods],
    optionalMissingMethods,
    evidence,
    override,
  };
}

function hasContradictoryIdentity(probe: NetworkProbeResult): boolean {
  if (probe.errors.some((problem) => problem.code === 'identity-mismatch')) return true;
  const protocols = new Set(
    probe.evidence
      .filter((item) => item.field === 'protocolVersion' && typeof item.value === 'number')
      .map((item) => item.value)
  );
  return protocols.size > 1 || probe.warnings.some((warning) => /contradictory/i.test(warning));
}

export function assessCompatibility(
  probe: NetworkProbeResult,
  options: {
    sdk?: SdkCapabilityProfile;
    overrides?: MaintainerOverride[];
    now?: Date;
  } = {}
): CompatibilityAssessment {
  const sdk = options.sdk ?? INSTALLED_SDK_PROFILE;
  const overrides = options.overrides ?? [];
  const now = options.now ?? new Date();
  const release = getMatrixRelease(probe.protocolVersion);
  const knownProtocol = release !== null;
  const freshness = calculateFreshness(probe, now);
  const features = DASHBOARD_FEATURE_REQUIREMENTS.map((feature) =>
    evaluateFeature(probe, sdk, feature, overrides, now, knownProtocol)
  );
  const contradictory = hasContradictoryIdentity(probe);
  let status: CompatibilityStatus = features.reduce<CompatibilityStatus>(
    (current, feature) => worseStatus(current, feature.status),
    'compatible'
  );
  let summary = 'Protocol, SDK, XDR, and required RPC evidence are aligned.';
  let action = 'Continue monitoring freshness and re-run before a network upgrade.';

  if (!probe.online) {
    status = 'offline';
    summary = 'Endpoint evidence was not refreshed because the browser is offline.';
    action =
      'Reconnect and retry; do not interpret stale evidence as a fresh compatibility result.';
  } else if (contradictory) {
    status = 'contradictory';
    summary = 'Horizon and RPC identity or protocol evidence contradict each other.';
    action =
      'Pause writes, verify endpoint network passphrases, and compare endpoints before continuing.';
  } else if (probe.protocolVersion === null) {
    status = 'unknown';
    summary = 'No protocol version could be established from direct evidence.';
    action = 'Restore getNetwork/getLatestLedger or Horizon ledger access and retry.';
  } else if (!release) {
    status = 'incompatible';
    summary = `Protocol ${probe.protocolVersion} is not represented in matrix ${COMPATIBILITY_MATRIX.matrixVersion}.`;
    action = 'Keep transaction and contract features gated until the matrix and SDK are reviewed.';
  } else if (compareSemver(sdk.version, release.sdk.version) < 0) {
    status = 'incompatible';
    summary = `Installed SDK ${sdk.version} is older than reviewed ${release.sdk.version} for protocol ${release.protocol}.`;
    action = `Upgrade the SDK/XDR toolchain and re-run all saved-artifact audits for protocol ${release.protocol}.`;
  } else if (status === 'incompatible') {
    summary = 'One or more dashboard workflows have hard compatibility failures.';
    action =
      'Review the gated feature list and resolve every hard requirement before submitting transactions.';
  } else if (status === 'unknown') {
    summary = 'Compatibility evidence is incomplete for one or more required capabilities.';
    action = 'Retry the probe and verify endpoint method exposure.';
  } else if (status === 'degraded') {
    summary = 'Core workflows are compatible with optional capabilities unavailable.';
    action = 'Review degraded-mode behavior before relying on enrichment or history features.';
  }

  const warningEvidence = probe.warnings.map((warning, index) =>
    matrixEvidence(probe, `warning.${index}`, warning, now, 'Probe correlation warning')
  );
  const freshnessEvidence: ProbeEvidence = {
    id: `${probe.requestId}:freshness`,
    source: freshness.stale ? 'cache' : 'browser',
    field: 'freshness.stale',
    value: freshness.stale,
    observedAt: now.toISOString(),
    endpoint: `target:${probe.target.id}`,
    confidence: freshness.stale ? 'cached' : 'direct',
    detail: freshness.label,
  };
  if (freshness.stale && probe.online) {
    status = worseStatus(status, 'unknown');
    summary = `Evidence expired at ${freshness.expiresAt}; compatibility requires a fresh probe.`;
    action = 'Refresh endpoint evidence before using gated features.';
  }

  return {
    schemaVersion: COMPATIBILITY_SCHEMA_VERSION,
    matrixVersion: COMPATIBILITY_MATRIX.matrixVersion,
    targetId: probe.target.id,
    evaluatedAt: now.toISOString(),
    status,
    summary,
    action,
    protocolVersion: probe.protocolVersion,
    matrixRelease: release,
    sdk,
    freshness,
    features,
    evidence: [...probe.evidence, ...warningEvidence, freshnessEvidence],
    warnings: [...probe.warnings, ...probe.errors.map((problem) => problem.message)],
    appliedOverrides: features
      .map((feature) => feature.override)
      .filter((override): override is MaintainerOverride => override !== null),
  };
}

function printable(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'unknown';
  if (Array.isArray(value)) return value.join(', ') || 'none';
  return String(value);
}

function addDifference(
  differences: EndpointDifference[],
  field: string,
  values: Record<string, unknown>,
  severity: EndpointDifference['severity'],
  explanation: string
): void {
  const printableValues = Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, printable(value)])
  );
  if (new Set(Object.values(printableValues)).size > 1) {
    differences.push({ field, severity, values: printableValues, explanation });
  }
}

export function compareEndpoints(
  probes: NetworkProbeResult[],
  now = new Date()
): EndpointComparisonResult {
  const differences: EndpointDifference[] = [];
  const byTarget = <T>(selector: (_probe: NetworkProbeResult) => T) =>
    Object.fromEntries(probes.map((probe) => [probe.target.label, selector(probe)]));

  addDifference(
    differences,
    'Network passphrase',
    byTarget((probe) => probe.identity.passphrase),
    'critical',
    'Endpoints with different passphrases are different networks and must not be used interchangeably.'
  );
  addDifference(
    differences,
    'Protocol version',
    byTarget((probe) => probe.protocolVersion),
    'critical',
    'Different protocol versions can change XDR and transaction behavior.'
  );
  addDifference(
    differences,
    'Latest ledger',
    byTarget((probe) => probe.latestLedger),
    'warning',
    'Ledger lag can make simulation, state, and transaction confirmation disagree.'
  );
  addDifference(
    differences,
    'Oldest retained ledger',
    byTarget((probe) => probe.retention.oldestLedger),
    'warning',
    'Different retention windows produce inconsistent history and event results.'
  );
  for (const method of RPC_METHOD_NAMES) {
    addDifference(
      differences,
      `RPC method: ${method}`,
      byTarget((probe) => probe.methods.find((item) => item.name === method)?.supported ?? null),
      ['getNetwork', 'getLatestLedger', 'simulateTransaction', 'sendTransaction'].includes(method)
        ? 'critical'
        : 'warning',
      'Method exposure differs across the compared endpoints.'
    );
  }

  const hasCritical = differences.some((difference) => difference.severity === 'critical');
  const hasWarning = differences.some((difference) => difference.severity === 'warning');
  const anyOffline = probes.some((probe) => !probe.online);
  const status: CompatibilityStatus = anyOffline
    ? 'offline'
    : hasCritical
      ? 'contradictory'
      : hasWarning
        ? 'degraded'
        : probes.length < 2
          ? 'unknown'
          : 'compatible';
  return {
    generatedAt: now.toISOString(),
    status,
    probes,
    differences,
    recommendation:
      probes.length < 2
        ? 'Add and probe at least one comparison endpoint.'
        : hasCritical
          ? 'Do not fail over between these endpoints until critical differences are resolved.'
          : hasWarning
            ? 'Core identity aligns; account for the listed degraded capabilities.'
            : 'Compared endpoints report equivalent identity and capabilities.',
  };
}

const RPC_METHOD_NAMES: RpcMethodName[] = [
  'getHealth',
  'getNetwork',
  'getLatestLedger',
  'getLedgerEntries',
  'getTransaction',
  'getTransactions',
  'getEvents',
  'simulateTransaction',
  'sendTransaction',
  'getFeeStats',
  'getVersionInfo',
];
