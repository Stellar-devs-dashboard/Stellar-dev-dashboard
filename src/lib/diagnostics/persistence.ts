import {
  DIAGNOSTIC_BUNDLE_KIND,
  DIAGNOSTIC_SCHEMA_VERSION,
  type DiagnosticBundle,
  type DiagnosticRepository,
  type DiagnosticRepositoryState,
} from '../../types/diagnostics';
import { isDiagnosticBundleStructure } from './bundle';
import { diagnosticByteLength, redactDiagnosticValue, stableCanonicalJson } from './redaction';

const STORAGE_KEY = 'stellar:diagnostics:bundles:v1';
const LEGACY_KEY = 'stellar:diagnostics:bundles';
const MAX_BUNDLES = 5;
const MAX_PERSISTED_BYTES = 3 * 1024 * 1024;

interface PersistedBundleEnvelope {
  schemaVersion: typeof DIAGNOSTIC_SCHEMA_VERSION;
  savedAt: string;
  bundles: DiagnosticBundle[];
}

function isBundleCandidate(value: unknown): value is DiagnosticBundle {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const bundle = value as Partial<DiagnosticBundle>;
  return (
    bundle.kind === DIAGNOSTIC_BUNDLE_KIND &&
    bundle.schemaVersion === DIAGNOSTIC_SCHEMA_VERSION &&
    typeof bundle.id === 'string' &&
    typeof bundle.createdAt === 'string' &&
    Boolean(bundle.manifest && typeof bundle.manifest.digest === 'string') &&
    Boolean(
      bundle.content &&
      Array.isArray(bundle.content.events) &&
      Array.isArray(bundle.content.breadcrumbs)
    )
  );
}

function isPersistableBundle(value: unknown): value is DiagnosticBundle {
  if (!isBundleCandidate(value) || !isDiagnosticBundleStructure(value)) return false;
  try {
    const sanitized = redactDiagnosticValue(value, { maxOutputBytes: 2 * 1024 * 1024 }).value;
    return stableCanonicalJson(sanitized) === stableCanonicalJson(value);
  } catch {
    return false;
  }
}

function cloneBundle(bundle: DiagnosticBundle): DiagnosticBundle {
  try {
    return structuredClone(bundle);
  } catch {
    return JSON.parse(JSON.stringify(bundle)) as DiagnosticBundle;
  }
}

function boundedBundles(bundles: DiagnosticBundle[], now: Date): DiagnosticBundle[] {
  const ids = new Set<string>();
  const current = bundles
    .filter(isPersistableBundle)
    .filter((bundle) => {
      const expires = Date.parse(bundle.manifest.expiresAt);
      return Number.isFinite(expires) && expires > now.getTime();
    })
    .filter((bundle) => {
      if (ids.has(bundle.id)) return false;
      ids.add(bundle.id);
      return diagnosticByteLength(bundle) <= 2 * 1024 * 1024;
    })
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .slice(0, MAX_BUNDLES);
  while (current.length && diagnosticByteLength(current) > MAX_PERSISTED_BYTES) current.pop();
  return current;
}

export class BrowserDiagnosticRepository implements DiagnosticRepository {
  private memory: DiagnosticBundle[] = [];
  private persistence: DiagnosticRepositoryState['persistence'] = 'durable';
  private warning: string | undefined;
  private readonly storage: Storage | null;
  private readonly now: () => Date;

  constructor(
    storage: Storage | null = typeof localStorage === 'undefined' ? null : localStorage,
    now: () => Date = () => new Date()
  ) {
    this.storage = storage;
    this.now = now;
    if (!storage)
      this.useMemory('Browser storage is unavailable; bundles remain in this tab only.');
  }

  load(): DiagnosticRepositoryState {
    if (!this.storage || this.persistence === 'memory-only') return this.state();
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (!raw) return this.migrateLegacy();
      if (new TextEncoder().encode(raw).byteLength > MAX_PERSISTED_BYTES) {
        this.storage.removeItem(STORAGE_KEY);
        this.memory = [];
        this.warning = 'Oversized diagnostic storage was cleared.';
        return this.state();
      }
      const parsed = JSON.parse(raw) as Partial<PersistedBundleEnvelope>;
      if (parsed.schemaVersion !== DIAGNOSTIC_SCHEMA_VERSION || !Array.isArray(parsed.bundles)) {
        this.storage.removeItem(STORAGE_KEY);
        this.memory = [];
        this.warning =
          Number(parsed.schemaVersion) > DIAGNOSTIC_SCHEMA_VERSION
            ? 'A newer diagnostic storage schema was ignored and cleared.'
            : 'Malformed diagnostic storage was cleared.';
        return this.state();
      }
      this.memory = boundedBundles(parsed.bundles, this.now());
      if (this.memory.length !== parsed.bundles.length) this.persist();
      return this.state();
    } catch {
      this.useMemory('Storage access failed; bundles remain in this tab only.');
      return this.state();
    }
  }

  save(bundle: DiagnosticBundle): DiagnosticRepositoryState {
    if (!isPersistableBundle(bundle))
      throw new Error('Only redaction-safe diagnostic bundles can be saved.');
    this.memory = boundedBundles(
      [cloneBundle(bundle), ...this.memory.filter((item) => item.id !== bundle.id)],
      this.now()
    );
    this.persist();
    return this.state();
  }

  remove(id: string): DiagnosticRepositoryState {
    this.memory = this.memory.filter((bundle) => bundle.id !== id);
    this.persist();
    return this.state();
  }

  cleanup(now = this.now()): DiagnosticRepositoryState {
    this.memory = boundedBundles(this.memory, now);
    this.persist();
    return this.state();
  }

  clear(): DiagnosticRepositoryState {
    this.memory = [];
    if (this.storage && this.persistence === 'durable') {
      try {
        this.storage.removeItem(STORAGE_KEY);
        this.storage.removeItem(LEGACY_KEY);
      } catch {
        this.useMemory('Storage cleanup failed; in-memory diagnostic data was cleared.');
      }
    }
    return this.state();
  }

  private migrateLegacy(): DiagnosticRepositoryState {
    if (!this.storage) return this.state();
    const raw = this.storage.getItem(LEGACY_KEY);
    if (!raw) return this.state();
    try {
      const parsed = JSON.parse(raw) as unknown;
      const candidates = Array.isArray(parsed) ? parsed : [];
      this.memory = boundedBundles(candidates.filter(isBundleCandidate), this.now());
      this.storage.removeItem(LEGACY_KEY);
      this.persist();
      this.warning = 'Compatible legacy bundle records were migrated to schema v1.';
    } catch {
      this.storage.removeItem(LEGACY_KEY);
      this.warning = 'Malformed legacy diagnostic records were cleared.';
    }
    return this.state();
  }

  private persist(): void {
    if (!this.storage || this.persistence === 'memory-only') return;
    const envelope: PersistedBundleEnvelope = {
      schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
      savedAt: this.now().toISOString(),
      bundles: this.memory,
    };
    try {
      const serialized = JSON.stringify(envelope);
      if (new TextEncoder().encode(serialized).byteLength > MAX_PERSISTED_BYTES) {
        throw new Error('Diagnostic storage exceeds its bounded size.');
      }
      this.storage.setItem(STORAGE_KEY, serialized);
    } catch {
      this.useMemory('Browser storage rejected diagnostic data; continuing in memory-only mode.');
    }
  }

  private useMemory(warning: string): void {
    this.persistence = 'memory-only';
    this.warning = warning;
  }

  private state(): DiagnosticRepositoryState {
    return {
      bundles: this.memory.map(cloneBundle),
      persistence: this.persistence,
      ...(this.warning ? { warning: this.warning } : {}),
    };
  }
}

export const browserDiagnosticRepository = new BrowserDiagnosticRepository();
