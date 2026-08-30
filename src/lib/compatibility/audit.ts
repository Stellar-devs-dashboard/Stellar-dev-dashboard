import {
  COMPATIBILITY_SCHEMA_VERSION,
  type AuditArtifact,
  type AuditArtifactKind,
  type AuditFinding,
  type AuditInventoryDocument,
  type CompatibilityAssessment,
  type ProbeEvidence,
  type UpgradeReadinessAudit,
} from '../../types/compatibility';
import { getMatrixRelease, INSTALLED_SDK_PROFILE, isVersionInRange } from './matrix';
import { redactText } from './redaction';

const MAX_ARTIFACTS = 1_000;
const STALE_SNAPSHOT_MS = 7 * 24 * 60 * 60_000;

const ARTIFACT_KINDS: AuditArtifactKind[] = [
  'saved-envelope',
  'snapshot',
  'contract-artifact',
  'plugin',
  'custom-network',
  'cached-data',
];

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function finding(
  artifact: AuditArtifact,
  status: AuditFinding['status'],
  title: string,
  explanation: string,
  action: string,
  evidence: string[]
): AuditFinding {
  return {
    artifactId: artifact.id,
    artifactName: redactText(artifact.name).slice(0, 160),
    kind: artifact.kind,
    status,
    title,
    explanation,
    action,
    evidence,
  };
}

function auditEnvelope(artifact: AuditArtifact, targetProtocol: number): AuditFinding {
  if (artifact.xdrType === null) {
    return finding(
      artifact,
      'unknown',
      'Envelope XDR type is missing',
      'The saved envelope cannot be routed to the correct decoder from metadata alone.',
      'Open and decode the envelope with the target SDK, then save explicit XDR provenance.',
      ['xdrType=unknown']
    );
  }
  if (artifact.protocolVersion === null) {
    return finding(
      artifact,
      'warning',
      'Envelope protocol provenance is missing',
      'Classic envelopes can remain valid, but Soroban transaction data is protocol-sensitive.',
      `Re-simulate and rebuild Soroban envelopes against protocol ${targetProtocol}.`,
      [`xdrType=${artifact.xdrType}`, 'protocolVersion=unknown']
    );
  }
  if (
    artifact.protocolVersion !== targetProtocol &&
    /soroban|fee.?bump|transaction/i.test(artifact.xdrType)
  ) {
    return finding(
      artifact,
      'fail',
      'Protocol-sensitive envelope must be rebuilt',
      `Envelope provenance is protocol ${artifact.protocolVersion}; target is ${targetProtocol}.`,
      'Discard its simulation data, rebuild, simulate, review, and collect signatures again.',
      [`artifactProtocol=${artifact.protocolVersion}`, `targetProtocol=${targetProtocol}`]
    );
  }
  return finding(
    artifact,
    'pass',
    'Envelope provenance is aligned',
    `Envelope metadata identifies ${artifact.xdrType} for protocol ${artifact.protocolVersion}.`,
    'Retain the original and revalidate signatures immediately before submission.',
    [`protocol=${artifact.protocolVersion}`, `xdrType=${artifact.xdrType}`]
  );
}

function auditSnapshot(artifact: AuditArtifact, targetProtocol: number, now: Date): AuditFinding {
  const updatedAt = artifact.updatedAt ? Date.parse(artifact.updatedAt) : Number.NaN;
  if (!Number.isFinite(updatedAt)) {
    return finding(
      artifact,
      'unknown',
      'Snapshot has no reliable timestamp',
      'Freshness cannot be proven.',
      'Regenerate the snapshot after the target network is upgraded.',
      ['updatedAt=unknown']
    );
  }
  if (
    now.getTime() - updatedAt > STALE_SNAPSHOT_MS ||
    artifact.protocolVersion !== targetProtocol
  ) {
    return finding(
      artifact,
      'warning',
      'Snapshot must be refreshed',
      'The snapshot is older than seven days or comes from a different protocol.',
      `Regenerate it from fresh protocol ${targetProtocol} evidence.`,
      [`updatedAt=${artifact.updatedAt}`, `protocol=${artifact.protocolVersion ?? 'unknown'}`]
    );
  }
  return finding(
    artifact,
    'pass',
    'Snapshot is fresh and aligned',
    'Snapshot timestamp and protocol provenance meet the readiness policy.',
    'Keep the snapshot only until its normal expiry.',
    [`updatedAt=${artifact.updatedAt}`, `protocol=${artifact.protocolVersion}`]
  );
}

function auditContract(artifact: AuditArtifact, targetProtocol: number): AuditFinding {
  const payload = record(artifact.payload);
  const wasmHash = stringValue(payload?.wasmHash);
  const sdkVersion = stringValue(payload?.sdkVersion);
  const interfaceVersion = numberValue(payload?.interfaceVersion);
  if (!wasmHash || !sdkVersion || interfaceVersion === null) {
    return finding(
      artifact,
      'unknown',
      'Contract build provenance is incomplete',
      'WASM hash, contract SDK version, and interface version are required for a reproducible audit.',
      'Rebuild from a pinned toolchain and record a digest before deployment.',
      [`wasmHash=${wasmHash ? 'present' : 'missing'}`, `sdkVersion=${sdkVersion ?? 'missing'}`]
    );
  }
  if (artifact.protocolVersion !== targetProtocol) {
    return finding(
      artifact,
      'warning',
      'Contract artifact targets another protocol',
      `Build provenance targets ${artifact.protocolVersion ?? 'unknown'} rather than ${targetProtocol}.`,
      'Run contract tests and simulation with the target host; rebuild if new host functions are used.',
      [`wasmHash=${wasmHash}`, `interfaceVersion=${interfaceVersion}`]
    );
  }
  return finding(
    artifact,
    'pass',
    'Contract artifact is reproducible',
    'Digest, toolchain, interface, and protocol provenance are present.',
    'Run the target-network simulation suite before deployment.',
    [`wasmHash=${wasmHash}`, `sdkVersion=${sdkVersion}`, `interfaceVersion=${interfaceVersion}`]
  );
}

function auditPlugin(artifact: AuditArtifact, targetProtocol: number): AuditFinding {
  const payload = record(artifact.payload);
  const minimum = numberValue(payload?.minimumProtocol);
  const maximum = numberValue(payload?.maximumProtocol);
  if (minimum === null || maximum === null) {
    return finding(
      artifact,
      'unknown',
      'Plugin compatibility declaration is missing',
      'The plugin has no bounded protocol range.',
      'Keep it disabled until its manifest declares and tests a minimum and maximum protocol.',
      ['minimumProtocol=unknown', 'maximumProtocol=unknown']
    );
  }
  if (targetProtocol < minimum || targetProtocol > maximum) {
    return finding(
      artifact,
      'fail',
      'Plugin does not declare target-protocol support',
      `Manifest range ${minimum}-${maximum} excludes protocol ${targetProtocol}.`,
      'Disable the plugin or install a reviewed version with matching protocol coverage.',
      [`range=${minimum}-${maximum}`, `target=${targetProtocol}`]
    );
  }
  return finding(
    artifact,
    'pass',
    'Plugin declares target support',
    `Manifest range includes protocol ${targetProtocol}.`,
    'Run the plugin integration suite against a deterministic target-protocol fixture.',
    [`range=${minimum}-${maximum}`]
  );
}

function auditCustomNetwork(
  artifact: AuditArtifact,
  targetProtocol: number,
  assessment: CompatibilityAssessment
): AuditFinding {
  const payload = record(artifact.payload);
  const hasHorizon = Boolean(stringValue(payload?.horizonUrl));
  const hasRpc = Boolean(stringValue(payload?.rpcUrl) ?? stringValue(payload?.sorobanUrl));
  const hasPassphrase = Boolean(stringValue(payload?.passphrase));
  if (!hasHorizon || !hasRpc || !hasPassphrase) {
    return finding(
      artifact,
      'fail',
      'Custom network profile is incomplete',
      'Horizon URL, RPC URL, and passphrase are all required for identity correlation.',
      'Complete the profile without persisting authentication headers, then probe it.',
      [`horizon=${hasHorizon}`, `rpc=${hasRpc}`, `passphrase=${hasPassphrase}`]
    );
  }
  if (assessment.protocolVersion !== targetProtocol || assessment.status === 'contradictory') {
    return finding(
      artifact,
      'warning',
      'Custom network identity needs revalidation',
      'The current endpoint assessment does not directly establish the audit target.',
      'Probe this profile and compare its passphrase and protocol evidence before use.',
      [`assessedProtocol=${assessment.protocolVersion ?? 'unknown'}`, `target=${targetProtocol}`]
    );
  }
  return finding(
    artifact,
    'pass',
    'Custom network profile is complete',
    'Required endpoint and identity fields are present and match the active assessment.',
    'Keep authentication values session-only and refresh the probe before writes.',
    [`protocol=${targetProtocol}`, 'credentials=excluded']
  );
}

function auditCachedData(artifact: AuditArtifact, targetProtocol: number, now: Date): AuditFinding {
  const updatedAt = artifact.updatedAt ? Date.parse(artifact.updatedAt) : Number.NaN;
  if (
    artifact.schemaVersion === null ||
    artifact.protocolVersion !== targetProtocol ||
    !Number.isFinite(updatedAt) ||
    now.getTime() - updatedAt > STALE_SNAPSHOT_MS
  ) {
    return finding(
      artifact,
      'warning',
      'Cached data must be invalidated',
      'Schema, protocol, or freshness provenance is incomplete for the upgrade target.',
      'Purge this cache and repopulate it from target-protocol endpoints.',
      [
        `schemaVersion=${artifact.schemaVersion ?? 'unknown'}`,
        `protocol=${artifact.protocolVersion ?? 'unknown'}`,
        `updatedAt=${artifact.updatedAt ?? 'unknown'}`,
      ]
    );
  }
  return finding(
    artifact,
    'pass',
    'Cached data is versioned and fresh',
    'Schema, protocol, and timestamp provenance are present.',
    'Allow normal TTL expiry; purge immediately if endpoint identity changes.',
    [`schemaVersion=${artifact.schemaVersion}`, `protocol=${artifact.protocolVersion}`]
  );
}

function auditOne(
  artifact: AuditArtifact,
  targetProtocol: number,
  assessment: CompatibilityAssessment,
  now: Date
): AuditFinding {
  switch (artifact.kind) {
    case 'saved-envelope':
      return auditEnvelope(artifact, targetProtocol);
    case 'snapshot':
      return auditSnapshot(artifact, targetProtocol, now);
    case 'contract-artifact':
      return auditContract(artifact, targetProtocol);
    case 'plugin':
      return auditPlugin(artifact, targetProtocol);
    case 'custom-network':
      return auditCustomNetwork(artifact, targetProtocol, assessment);
    case 'cached-data':
      return auditCachedData(artifact, targetProtocol, now);
  }
}

export function runUpgradeReadinessAudit(
  artifacts: AuditArtifact[],
  targetProtocol: number,
  assessment: CompatibilityAssessment,
  now = new Date()
): UpgradeReadinessAudit {
  if (!Number.isInteger(targetProtocol) || targetProtocol < 1 || targetProtocol > 1_000) {
    throw new Error('Target protocol must be an integer between 1 and 1000.');
  }
  if (!Array.isArray(artifacts) || artifacts.length > MAX_ARTIFACTS) {
    throw new Error(`Audit inventory must contain at most ${MAX_ARTIFACTS} artifacts.`);
  }

  const matrixRelease = getMatrixRelease(targetProtocol);
  const findings = artifacts.map((artifact) => auditOne(artifact, targetProtocol, assessment, now));
  if (!matrixRelease) {
    findings.unshift({
      artifactId: 'compatibility-matrix',
      artifactName: 'Compatibility matrix',
      kind: 'cached-data',
      status: 'fail',
      title: 'Target protocol is not reviewed',
      explanation: `Protocol ${targetProtocol} is outside the versioned compatibility matrix.`,
      action: 'Review protocol, RPC, SDK, and XDR changes before auditing individual artifacts.',
      evidence: [`targetProtocol=${targetProtocol}`],
    });
  } else if (!isVersionInRange(targetProtocol, INSTALLED_SDK_PROFILE.xdrRange)) {
    findings.unshift({
      artifactId: 'installed-sdk',
      artifactName: '@stellar/stellar-sdk',
      kind: 'contract-artifact',
      status: 'fail',
      title: 'Installed SDK does not decode target XDR',
      explanation: `SDK ${INSTALLED_SDK_PROFILE.version} supports XDR through protocol ${INSTALLED_SDK_PROFILE.xdrRange.maximum}.`,
      action: `Upgrade to reviewed SDK ${matrixRelease.sdk.version} or newer and rerun the audit.`,
      evidence: [
        `installedSdk=${INSTALLED_SDK_PROFILE.version}`,
        `reviewedSdk=${matrixRelease.sdk.version}`,
        `targetProtocol=${targetProtocol}`,
      ],
    });
  }

  const counts: Record<AuditFinding['status'], number> = {
    pass: 0,
    warning: 0,
    fail: 0,
    unknown: 0,
  };
  for (const item of findings) counts[item.status] += 1;
  const status =
    counts.fail > 0
      ? 'blocked'
      : counts.warning > 0 || counts.unknown > 0
        ? 'attention'
        : findings.length
          ? 'ready'
          : 'unknown';
  const evidence: ProbeEvidence[] = [
    {
      id: `audit:${targetProtocol}:matrix`,
      source: 'matrix',
      field: 'audit.targetProtocol',
      value: targetProtocol,
      observedAt: now.toISOString(),
      endpoint: `matrix:${assessment.matrixVersion}`,
      confidence: 'inferred',
      detail: matrixRelease
        ? `Reviewed SDK ${matrixRelease.sdk.version}`
        : 'No reviewed matrix release',
    },
    ...assessment.evidence.filter((item) =>
      ['protocolVersion', 'network.passphrase', 'freshness.stale'].includes(item.field)
    ),
  ];
  return {
    schemaVersion: COMPATIBILITY_SCHEMA_VERSION,
    auditId: `audit-${targetProtocol}-${now.getTime()}`,
    generatedAt: now.toISOString(),
    targetProtocol,
    status,
    counts,
    findings,
    evidence,
  };
}

const KIND_PATTERNS: Array<{ kind: AuditArtifactKind; pattern: RegExp }> = [
  { kind: 'saved-envelope', pattern: /outbox|envelope|transaction|multisig/i },
  { kind: 'snapshot', pattern: /snapshot|baseline|profile/i },
  { kind: 'contract-artifact', pattern: /contract|wasm|artifact/i },
  { kind: 'plugin', pattern: /plugin/i },
  { kind: 'custom-network', pattern: /network-profile|custom-network|app-config-profile/i },
  { kind: 'cached-data', pattern: /cache|query-cache|simulation/i },
];

export function discoverLocalArtifacts(storage?: Storage): AuditArtifact[] {
  const source = storage ?? (typeof localStorage === 'undefined' ? null : localStorage);
  if (!source || typeof source.length !== 'number' || typeof source.key !== 'function') return [];
  const artifacts: AuditArtifact[] = [];
  for (let index = 0; index < Math.min(source.length, MAX_ARTIFACTS); index += 1) {
    const key = source.key(index);
    if (!key || key.startsWith('stellar:compatibility:')) continue;
    const matched = KIND_PATTERNS.find((candidate) => candidate.pattern.test(key));
    if (!matched) continue;
    const raw = source.getItem(key);
    if (!raw || raw.length > 256_000) continue;
    let payload: unknown = null;
    try {
      payload = JSON.parse(raw) as unknown;
    } catch {
      payload = null;
    }
    const data = record(payload);
    artifacts.push({
      id: `local:${index}:${key.replace(/[^a-zA-Z0-9:_-]/g, '_').slice(0, 80)}`,
      kind: matched.kind,
      name: key.slice(0, 120),
      schemaVersion: numberValue(data?.schemaVersion),
      protocolVersion: numberValue(data?.protocolVersion),
      xdrType: stringValue(data?.xdrType),
      updatedAt: stringValue(data?.updatedAt) ?? stringValue(data?.capturedAt),
      payload: data
        ? {
            wasmHash: stringValue(data.wasmHash),
            sdkVersion: stringValue(data.sdkVersion),
            interfaceVersion: numberValue(data.interfaceVersion),
            minimumProtocol: numberValue(data.minimumProtocol),
            maximumProtocol: numberValue(data.maximumProtocol),
            horizonUrl: stringValue(data.horizonUrl) ? '[configured]' : null,
            rpcUrl:
              stringValue(data.rpcUrl) || stringValue(data.sorobanUrl) ? '[configured]' : null,
            passphrase: stringValue(data.passphrase) ? '[configured]' : null,
          }
        : null,
    });
  }
  return artifacts;
}

function validateImportedArtifact(value: unknown, index: number): AuditArtifact {
  const data = record(value);
  if (!data) throw new Error(`Artifact ${index + 1} must be an object.`);
  const kind = stringValue(data.kind) as AuditArtifactKind | null;
  const id = stringValue(data.id);
  const name = stringValue(data.name);
  if (!kind || !ARTIFACT_KINDS.includes(kind)) {
    throw new Error(`Artifact ${index + 1} has an unsupported kind.`);
  }
  if (!id || id.length > 160 || !name || name.length > 160) {
    throw new Error(`Artifact ${index + 1} requires bounded id and name fields.`);
  }
  const schemaVersion = data.schemaVersion === null ? null : numberValue(data.schemaVersion);
  const protocolVersion = data.protocolVersion === null ? null : numberValue(data.protocolVersion);
  const xdrType = data.xdrType === null ? null : stringValue(data.xdrType);
  const updatedAt = data.updatedAt === null ? null : stringValue(data.updatedAt);
  if (updatedAt !== null && Number.isNaN(Date.parse(updatedAt))) {
    throw new Error(`Artifact ${index + 1} has an invalid updatedAt timestamp.`);
  }
  return {
    id,
    kind,
    name,
    schemaVersion,
    protocolVersion,
    xdrType: xdrType?.slice(0, 120) ?? null,
    updatedAt,
    payload: record(data.payload) ?? null,
  };
}

export function parseAuditInventory(raw: string): AuditInventoryDocument {
  if (raw.length > 1_000_000) throw new Error('Audit inventory exceeds the 1 MB import limit.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error('Audit inventory is not valid JSON.');
  }
  const data = record(parsed);
  if (!data || data.kind !== 'upgrade-audit-inventory') {
    throw new Error('Import kind must be upgrade-audit-inventory.');
  }
  if (data.schemaVersion !== COMPATIBILITY_SCHEMA_VERSION) {
    throw new Error(`Audit inventory schema must be ${COMPATIBILITY_SCHEMA_VERSION}.`);
  }
  if (!Array.isArray(data.artifacts) || data.artifacts.length > MAX_ARTIFACTS) {
    throw new Error(`Audit inventory must contain at most ${MAX_ARTIFACTS} artifacts.`);
  }
  return {
    schemaVersion: COMPATIBILITY_SCHEMA_VERSION,
    kind: 'upgrade-audit-inventory',
    exportedAt: stringValue(data.exportedAt) ?? new Date(0).toISOString(),
    artifacts: data.artifacts.map(validateImportedArtifact),
  };
}
