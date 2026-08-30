import {
  COMPATIBILITY_SCHEMA_VERSION,
  type CompatibilityExportDocument,
  type MaintainerOverride,
  type NetworkProbeResult,
} from '../../types/compatibility';
import { redactEndpoint, redactUnknown } from './redaction';

const PROBE_PREFIX = 'stellar:compatibility:probe:v1:';
const OVERRIDES_KEY = 'stellar:compatibility:overrides:v1';
const MAX_CACHE_BYTES = 512_000;
const MAX_OVERRIDES = 100;

interface PersistedProbeEnvelope {
  schemaVersion: number;
  savedAt: string;
  probe: NetworkProbeResult;
}

interface PersistedOverridesEnvelope {
  schemaVersion: number;
  overrides: MaintainerOverride[];
}

export class CompatibilityPersistenceError extends Error {
  readonly code: 'storage-unavailable' | 'invalid-document' | 'unsupported-version' | 'too-large';

  constructor(
    message: string,
    code: 'storage-unavailable' | 'invalid-document' | 'unsupported-version' | 'too-large'
  ) {
    super(message);
    this.code = code;
    this.name = 'CompatibilityPersistenceError';
  }
}

function storageOrNull(storage?: Storage): Storage | null {
  if (storage) return storage;
  if (typeof localStorage === 'undefined') return null;
  return localStorage;
}

function assertRecord(value: unknown, message: string): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new CompatibilityPersistenceError(message, 'invalid-document');
  }
}

function safeParse(raw: string): unknown {
  if (raw.length > MAX_CACHE_BYTES) {
    throw new CompatibilityPersistenceError(
      'Compatibility document exceeds the size limit.',
      'too-large'
    );
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new CompatibilityPersistenceError(
      'Compatibility document is not valid JSON.',
      'invalid-document'
    );
  }
}

function validateProbe(value: unknown): NetworkProbeResult {
  assertRecord(value, 'Cached probe must be an object.');
  if (value.schemaVersion !== COMPATIBILITY_SCHEMA_VERSION) {
    throw new CompatibilityPersistenceError(
      'Cached probe uses an unsupported schema version.',
      'unsupported-version'
    );
  }
  if (
    typeof value.requestId !== 'string' ||
    typeof value.completedAt !== 'string' ||
    typeof value.expiresAt !== 'string' ||
    !Array.isArray(value.evidence) ||
    !Array.isArray(value.methods)
  ) {
    throw new CompatibilityPersistenceError(
      'Cached probe is missing required fields.',
      'invalid-document'
    );
  }
  assertRecord(value.target, 'Cached probe target is invalid.');
  if (typeof value.target.id !== 'string' || typeof value.target.rpcUrl !== 'string') {
    throw new CompatibilityPersistenceError(
      'Cached probe target is missing identity.',
      'invalid-document'
    );
  }
  return value as unknown as NetworkProbeResult;
}

export function probeCacheKey(targetId: string): string {
  const safeId = targetId.replace(/[^a-zA-Z0-9:_-]/g, '_').slice(0, 120);
  return `${PROBE_PREFIX}${safeId}`;
}

export function saveProbe(probe: NetworkProbeResult, storage?: Storage): void {
  const target = storageOrNull(storage);
  if (!target)
    throw new CompatibilityPersistenceError(
      'Browser storage is unavailable.',
      'storage-unavailable'
    );

  const sanitized = redactUnknown({
    ...probe,
    target: {
      ...probe.target,
      horizonUrl: redactEndpoint(probe.target.horizonUrl),
      rpcUrl: redactEndpoint(probe.target.rpcUrl),
    },
  }) as NetworkProbeResult;
  const envelope: PersistedProbeEnvelope = {
    schemaVersion: COMPATIBILITY_SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    probe: sanitized,
  };
  const serialized = JSON.stringify(envelope);
  if (serialized.length > MAX_CACHE_BYTES) {
    throw new CompatibilityPersistenceError(
      'Compatibility probe exceeds the cache size limit.',
      'too-large'
    );
  }
  try {
    target.setItem(probeCacheKey(probe.target.id), serialized);
  } catch {
    throw new CompatibilityPersistenceError(
      'Browser storage rejected the compatibility probe.',
      'storage-unavailable'
    );
  }
}

export function loadProbe(targetId: string, storage?: Storage): NetworkProbeResult | null {
  const target = storageOrNull(storage);
  if (!target) return null;
  let raw: string | null = null;
  try {
    raw = target.getItem(probeCacheKey(targetId));
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const envelope = safeParse(raw);
    assertRecord(envelope, 'Cached probe envelope must be an object.');
    if (envelope.schemaVersion !== COMPATIBILITY_SCHEMA_VERSION) {
      target.removeItem(probeCacheKey(targetId));
      return null;
    }
    return validateProbe(envelope.probe);
  } catch {
    target.removeItem(probeCacheKey(targetId));
    return null;
  }
}

function validateOverride(value: unknown): MaintainerOverride | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (
    candidate.schemaVersion !== COMPATIBILITY_SCHEMA_VERSION ||
    typeof candidate.id !== 'string' ||
    typeof candidate.targetId !== 'string' ||
    typeof candidate.featureId !== 'string' ||
    !['compatible', 'degraded', 'incompatible', 'unknown'].includes(
      String(candidate.forcedStatus)
    ) ||
    typeof candidate.reason !== 'string' ||
    candidate.reason.trim().length < 10 ||
    typeof candidate.createdAt !== 'string' ||
    typeof candidate.expiresAt !== 'string' ||
    typeof candidate.author !== 'string'
  ) {
    return null;
  }
  if (Number.isNaN(Date.parse(candidate.expiresAt))) return null;
  return candidate as unknown as MaintainerOverride;
}

export function loadOverrides(storage?: Storage, now = new Date()): MaintainerOverride[] {
  const target = storageOrNull(storage);
  if (!target) return [];
  try {
    const raw = target.getItem(OVERRIDES_KEY);
    if (!raw) return [];
    const envelope = safeParse(raw);
    assertRecord(envelope, 'Override envelope must be an object.');
    if (
      envelope.schemaVersion !== COMPATIBILITY_SCHEMA_VERSION ||
      !Array.isArray(envelope.overrides)
    ) {
      return [];
    }
    return envelope.overrides
      .map(validateOverride)
      .filter((override): override is MaintainerOverride => override !== null)
      .filter((override) => Date.parse(override.expiresAt) > now.getTime())
      .slice(0, MAX_OVERRIDES);
  } catch {
    return [];
  }
}

export function saveOverrides(overrides: MaintainerOverride[], storage?: Storage): void {
  const target = storageOrNull(storage);
  if (!target)
    throw new CompatibilityPersistenceError(
      'Browser storage is unavailable.',
      'storage-unavailable'
    );
  const valid = overrides
    .map(validateOverride)
    .filter((override): override is MaintainerOverride => override !== null)
    .slice(0, MAX_OVERRIDES);
  const envelope: PersistedOverridesEnvelope = {
    schemaVersion: COMPATIBILITY_SCHEMA_VERSION,
    overrides: valid,
  };
  try {
    target.setItem(OVERRIDES_KEY, JSON.stringify(envelope));
  } catch {
    throw new CompatibilityPersistenceError(
      'Browser storage rejected the overrides.',
      'storage-unavailable'
    );
  }
}

export function parseCompatibilityExport(raw: string): CompatibilityExportDocument {
  const parsed = safeParse(raw);
  assertRecord(parsed, 'Compatibility export must be an object.');
  if (typeof parsed.schemaVersion !== 'number') {
    throw new CompatibilityPersistenceError(
      'Compatibility export has no schema version.',
      'invalid-document'
    );
  }
  if (parsed.schemaVersion > COMPATIBILITY_SCHEMA_VERSION) {
    throw new CompatibilityPersistenceError(
      `Compatibility schema ${parsed.schemaVersion} is newer than this dashboard supports.`,
      'unsupported-version'
    );
  }
  if (
    parsed.schemaVersion !== COMPATIBILITY_SCHEMA_VERSION ||
    parsed.kind !== 'compatibility-report' ||
    parsed.redacted !== true
  ) {
    throw new CompatibilityPersistenceError(
      'Compatibility export contract is invalid.',
      'invalid-document'
    );
  }
  assertRecord(parsed.assessment, 'Compatibility export assessment is missing.');
  return parsed as unknown as CompatibilityExportDocument;
}
