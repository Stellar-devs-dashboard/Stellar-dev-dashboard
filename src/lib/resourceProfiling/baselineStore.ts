import type { Baseline, ResourceBudget } from '../../types/resourceProfiling';
import { RESOURCE_PROFILING_SCHEMA_VERSION } from '../../types/resourceProfiling';
import { ProfilingError, requestId } from './errors';
import { validateBaseline, validateBudget } from './validation';
import { createDefaultBudget } from './budgetEngine';

const DB_NAME = 'stellar-dev-dashboard-resource-profiling';
const DB_VERSION = 1;
const BASELINE_STORE = 'baselines';
const BUDGET_STORE = 'budgets';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(
      new ProfilingError({ code: 'storage-unavailable', message: 'IndexedDB is not available in this environment.', retryable: false })
    );
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(BASELINE_STORE)) {
          const store = db.createObjectStore(BASELINE_STORE, { keyPath: 'id' });
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
        if (!db.objectStoreNames.contains(BUDGET_STORE)) {
          db.createObjectStore(BUDGET_STORE, { keyPath: 'id' });
        }
      };
    });
  }
  return dbPromise;
}

function runTransaction<T>(storeName: string, mode: IDBTransactionMode, action: (_store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const request = action(store);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      })
  );
}

function listAll<T>(storeName: string): Promise<T[]> {
  return openDb().then(
    (db) =>
      new Promise<T[]>((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const request = tx.objectStore(storeName).getAll();
        request.onsuccess = () => resolve(request.result as T[]);
        request.onerror = () => reject(request.error);
      })
  );
}

/**
 * Upgrades a persisted or imported baseline document to the current schema version in place.
 * Version 1 documents predate the `tags` field and used a plain `notes` string instead of
 * `description`; both are backfilled here so older exports keep working after an upgrade.
 */
export function migrateBaseline(raw: unknown): Baseline {
  if (!raw || typeof raw !== 'object') {
    throw new ProfilingError({ code: 'invalid-input', message: 'Baseline document is not an object.', retryable: false });
  }
  const record = raw as Record<string, unknown> & { schemaVersion?: number; notes?: string };
  const schemaVersion = typeof record.schemaVersion === 'number' ? record.schemaVersion : 1;

  if (schemaVersion > RESOURCE_PROFILING_SCHEMA_VERSION) {
    throw new ProfilingError({
      code: 'unsupported-schema-version',
      message: `Baseline schema version ${schemaVersion} is newer than this build supports (${RESOURCE_PROFILING_SCHEMA_VERSION}). Update the dashboard before importing it.`,
      retryable: false,
    });
  }

  const migrated: Baseline = {
    id: typeof record.id === 'string' ? record.id : requestId('baseline'),
    schemaVersion: RESOURCE_PROFILING_SCHEMA_VERSION,
    name: typeof record.name === 'string' ? record.name : 'Untitled baseline',
    description: typeof record.description === 'string' ? record.description : record.notes ?? '',
    tags: Array.isArray(record.tags) ? (record.tags as string[]) : [],
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : new Date().toISOString(),
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : new Date().toISOString(),
    profiles: Array.isArray(record.profiles) ? (record.profiles as Baseline['profiles']) : [],
  };

  const result = validateBaseline(migrated);
  if (!result.valid) {
    throw new ProfilingError({ code: 'invalid-input', message: `Invalid baseline: ${result.errors.join(' ')}`, retryable: false });
  }
  return migrated;
}

export async function listBaselines(): Promise<Baseline[]> {
  const baselines = await listAll<Baseline>(BASELINE_STORE);
  return baselines.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getBaseline(id: string): Promise<Baseline | null> {
  const result = await runTransaction<Baseline | undefined>(BASELINE_STORE, 'readonly', (store) => store.get(id));
  return result ?? null;
}

export async function saveBaseline(baseline: Baseline): Promise<Baseline> {
  const validation = validateBaseline(baseline);
  if (!validation.valid) {
    throw new ProfilingError({ code: 'invalid-input', message: `Invalid baseline: ${validation.errors.join(' ')}`, retryable: false });
  }
  const next: Baseline = { ...baseline, updatedAt: new Date().toISOString() };
  await runTransaction(BASELINE_STORE, 'readwrite', (store) => store.put(next));
  return next;
}

export async function deleteBaseline(id: string): Promise<void> {
  await runTransaction<undefined>(BASELINE_STORE, 'readwrite', (store) => store.delete(id));
}

export function createEmptyBaseline(name: string, description = ''): Baseline {
  const now = new Date().toISOString();
  return {
    id: requestId('baseline'),
    schemaVersion: RESOURCE_PROFILING_SCHEMA_VERSION,
    name,
    description,
    tags: [],
    createdAt: now,
    updatedAt: now,
    profiles: [],
  };
}

export async function listBudgets(): Promise<ResourceBudget[]> {
  const budgets = await listAll<ResourceBudget>(BUDGET_STORE);
  if (budgets.length === 0) {
    const seeded = createDefaultBudget();
    await saveBudget(seeded);
    return [seeded];
  }
  return budgets.sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveBudget(budget: ResourceBudget): Promise<ResourceBudget> {
  const validation = validateBudget(budget);
  if (!validation.valid) {
    throw new ProfilingError({ code: 'invalid-input', message: `Invalid budget: ${validation.errors.join(' ')}`, retryable: false });
  }
  const next: ResourceBudget = { ...budget, updatedAt: new Date().toISOString() };
  await runTransaction(BUDGET_STORE, 'readwrite', (store) => store.put(next));
  return next;
}

export async function deleteBudget(id: string): Promise<void> {
  await runTransaction<undefined>(BUDGET_STORE, 'readwrite', (store) => store.delete(id));
}

/** Resets the cached DB connection promise; test-only. */
export function __resetConnectionForTests(): void {
  dbPromise = null;
}
