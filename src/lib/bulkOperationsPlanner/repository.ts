/**
 * IndexedDB persistence for bulk manifests, checkpoints, and run receipts.
 */

import type {
  BulkRunCheckpoint,
  BulkRunReceipt,
  BulkStoredManifestRecord,
  BulkStoredRunRecord,
} from '../../types/bulkOperationsPlanner';
import type { BulkManifest } from '../../types/bulkOperationsPlanner';

const DB_NAME = 'stellar-dev-dashboard-bulk-operations';
const DB_VERSION = 1;
const MANIFESTS_STORE = 'bulk-manifests';
const RUNS_STORE = 'bulk-runs';

let dbPromise: Promise<IDBDatabase> | null = null;

function initDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(MANIFESTS_STORE)) {
          const store = db.createObjectStore(MANIFESTS_STORE, { keyPath: 'id' });
          store.createIndex('savedAt', 'savedAt', { unique: false });
          store.createIndex('pinned', 'pinned', { unique: false });
        }
        if (!db.objectStoreNames.contains(RUNS_STORE)) {
          const store = db.createObjectStore(RUNS_STORE, { keyPath: 'id' });
          store.createIndex('manifestId', 'manifestId', { unique: false });
          store.createIndex('savedAt', 'savedAt', { unique: false });
        }
      };
    });
  }
  return dbPromise;
}

function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  run: (_store: IDBObjectStore) => IDBRequest<T> | void
): Promise<T> {
  return initDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const request = run(store);
        tx.oncomplete = () => {
          if (request && 'result' in request) resolve((request as IDBRequest<T>).result);
          else resolve(undefined as T);
        };
        tx.onerror = () => reject(tx.error);
      })
  );
}

export interface BulkRepository {
  saveManifest(record: BulkStoredManifestRecord): Promise<void>;
  getManifest(id: string): Promise<BulkStoredManifestRecord | undefined>;
  listManifests(): Promise<BulkStoredManifestRecord[]>;
  deleteManifest(id: string): Promise<void>;
  pinManifest(id: string, pinned: boolean): Promise<void>;
  saveRun(record: BulkStoredRunRecord): Promise<void>;
  getRun(id: string): Promise<BulkStoredRunRecord | undefined>;
  listRuns(manifestId?: string): Promise<BulkStoredRunRecord[]>;
  deleteRun(id: string): Promise<void>;
  pruneRuns(beforeIso: string): Promise<number>;
}

export class IndexedDbBulkRepository implements BulkRepository {
  async saveManifest(record: BulkStoredManifestRecord): Promise<void> {
    await withStore(MANIFESTS_STORE, 'readwrite', (store) => store.put(record));
  }

  async getManifest(id: string): Promise<BulkStoredManifestRecord | undefined> {
    return withStore(MANIFESTS_STORE, 'readonly', (store) => store.get(id));
  }

  async listManifests(): Promise<BulkStoredManifestRecord[]> {
    return withStore(MANIFESTS_STORE, 'readonly', (store) => store.getAll());
  }

  async deleteManifest(id: string): Promise<void> {
    await withStore(MANIFESTS_STORE, 'readwrite', (store) => store.delete(id));
  }

  async pinManifest(id: string, pinned: boolean): Promise<void> {
    const existing = await this.getManifest(id);
    if (!existing) return;
    await this.saveManifest({ ...existing, pinned });
  }

  async saveRun(record: BulkStoredRunRecord): Promise<void> {
    await withStore(RUNS_STORE, 'readwrite', (store) => store.put(record));
  }

  async getRun(id: string): Promise<BulkStoredRunRecord | undefined> {
    return withStore(RUNS_STORE, 'readonly', (store) => store.get(id));
  }

  async listRuns(manifestId?: string): Promise<BulkStoredRunRecord[]> {
    const all = await withStore(RUNS_STORE, 'readonly', (store) => store.getAll());
    if (!manifestId) return all;
    return all.filter((run) => run.manifestId === manifestId);
  }

  async deleteRun(id: string): Promise<void> {
    await withStore(RUNS_STORE, 'readwrite', (store) => store.delete(id));
  }

  async pruneRuns(beforeIso: string): Promise<number> {
    const all = await this.listRuns();
    const cutoff = new Date(beforeIso).getTime();
    let removed = 0;
    for (const run of all) {
      if (new Date(run.savedAt).getTime() < cutoff && run.checkpoint.status !== 'running') {
        await this.deleteRun(run.id);
        removed += 1;
      }
    }
    return removed;
  }
}

export class InMemoryBulkRepository implements BulkRepository {
  private manifests = new Map<string, BulkStoredManifestRecord>();
  private runs = new Map<string, BulkStoredRunRecord>();

  async saveManifest(record: BulkStoredManifestRecord): Promise<void> {
    this.manifests.set(record.id, record);
  }

  async getManifest(id: string): Promise<BulkStoredManifestRecord | undefined> {
    return this.manifests.get(id);
  }

  async listManifests(): Promise<BulkStoredManifestRecord[]> {
    return [...this.manifests.values()].sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  }

  async deleteManifest(id: string): Promise<void> {
    this.manifests.delete(id);
  }

  async pinManifest(id: string, pinned: boolean): Promise<void> {
    const existing = this.manifests.get(id);
    if (existing) this.manifests.set(id, { ...existing, pinned });
  }

  async saveRun(record: BulkStoredRunRecord): Promise<void> {
    this.runs.set(record.id, record);
  }

  async getRun(id: string): Promise<BulkStoredRunRecord | undefined> {
    return this.runs.get(id);
  }

  async listRuns(manifestId?: string): Promise<BulkStoredRunRecord[]> {
    const all = [...this.runs.values()];
    return manifestId ? all.filter((run) => run.manifestId === manifestId) : all;
  }

  async deleteRun(id: string): Promise<void> {
    this.runs.delete(id);
  }

  async pruneRuns(beforeIso: string): Promise<number> {
    const cutoff = new Date(beforeIso).getTime();
    let removed = 0;
    for (const [id, run] of this.runs.entries()) {
      if (new Date(run.savedAt).getTime() < cutoff) {
        this.runs.delete(id);
        removed += 1;
      }
    }
    return removed;
  }
}

export const bulkRepository: BulkRepository = new IndexedDbBulkRepository();

export async function persistManifest(manifest: BulkManifest, pinned = false): Promise<BulkStoredManifestRecord> {
  const record: BulkStoredManifestRecord = {
    id: manifest.id,
    manifest,
    savedAt: new Date().toISOString(),
    pinned,
  };
  await bulkRepository.saveManifest(record);
  return record;
}

export async function persistRun(
  checkpoint: BulkRunCheckpoint,
  receipt?: BulkRunReceipt
): Promise<BulkStoredRunRecord> {
  const record: BulkStoredRunRecord = {
    id: checkpoint.runId,
    manifestId: checkpoint.manifestId,
    checkpoint,
    receipt,
    savedAt: new Date().toISOString(),
  };
  await bulkRepository.saveRun(record);
  return record;
}

export async function updateManifestRunMeta(
  manifestId: string,
  runId: string,
  status: BulkRunCheckpoint['status']
): Promise<void> {
  const existing = await bulkRepository.getManifest(manifestId);
  if (!existing) return;
  await bulkRepository.saveManifest({
    ...existing,
    lastRunId: runId,
    lastRunStatus: status,
  });
}

export function compareManifestRecords(a: BulkStoredManifestRecord, b: BulkStoredManifestRecord): number {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  return b.savedAt.localeCompare(a.savedAt);
}

export async function listPinnedManifests(): Promise<BulkStoredManifestRecord[]> {
  const all = await bulkRepository.listManifests();
  return all.filter((record) => record.pinned).sort(compareManifestRecords);
}

export async function latestRunForManifest(manifestId: string): Promise<BulkStoredRunRecord | undefined> {
  const runs = await bulkRepository.listRuns(manifestId);
  return runs.sort((a, b) => b.savedAt.localeCompare(a.savedAt))[0];
}
