/**
 * IndexedDB persistence for treasury reconciliation: periods, immutable
 * snapshots, category rules, cost-basis entries, and review state.
 * Follows the same native-IndexedDB coding style as
 * `src/lib/alertRulesDb.ts`, but deliberately uses its own database rather
 * than sharing `alertRulesDb.ts`'s `'stellar-dev-dashboard'` database and
 * bumping its version: that module keeps its connection open for the life
 * of the page (module-scope singleton, never closes on `versionchange`), so
 * a second `indexedDB.open(sameName, higherVersion)` call from here would
 * block forever waiting for a `versionchange`/close that never happens.
 * A dedicated database name sidesteps that entirely.
 */

import type { CategoryRule, CostBasisEntry, PeriodSnapshot, ReconciliationPeriod, ReviewRecord } from '../../types/treasury';

const DB_NAME = 'stellar-dev-dashboard-treasury';
const DB_VERSION = 1;
const PERIODS_STORE = 'treasury-periods';
const SNAPSHOTS_STORE = 'treasury-snapshots';
const RULES_STORE = 'treasury-rules';
const COST_BASIS_STORE = 'treasury-cost-basis';
const REVIEW_STORE = 'treasury-review';

let dbPromise: Promise<IDBDatabase> | null = null;

function initDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        // If a future schema bump tries to open a higher version while this
        // connection is still alive, close gracefully instead of blocking
        // that upgrade forever.
        db.onversionchange = () => db.close();
        resolve(db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(PERIODS_STORE)) {
          const store = db.createObjectStore(PERIODS_STORE, { keyPath: 'id' });
          store.createIndex('accountId', 'accountId', { unique: false });
        }
        if (!db.objectStoreNames.contains(SNAPSHOTS_STORE)) {
          // Out-of-line key (the period id) rather than a keyPath, since the
          // key lives at snapshot.period.id and IDB keyPaths into nested
          // objects are best avoided for cross-engine reliability.
          db.createObjectStore(SNAPSHOTS_STORE);
        }
        if (!db.objectStoreNames.contains(RULES_STORE)) {
          const store = db.createObjectStore(RULES_STORE, { keyPath: 'key' });
          store.createIndex('accountId', 'accountId', { unique: false });
        }
        if (!db.objectStoreNames.contains(COST_BASIS_STORE)) {
          const store = db.createObjectStore(COST_BASIS_STORE, { keyPath: 'key' });
          store.createIndex('accountId', 'accountId', { unique: false });
        }
        if (!db.objectStoreNames.contains(REVIEW_STORE)) {
          const store = db.createObjectStore(REVIEW_STORE, { keyPath: 'key' });
          store.createIndex('accountId', 'accountId', { unique: false });
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
        if (request) {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        }
        tx.oncomplete = () => {
          if (!request) resolve(undefined as T);
        };
        tx.onerror = () => reject(tx.error);
      })
  );
}

// ─── Periods ────────────────────────────────────────────────────────────────────

export async function savePeriod(period: ReconciliationPeriod): Promise<void> {
  await withStore(PERIODS_STORE, 'readwrite', (store) => store.put(period));
}

export async function getPeriods(accountId: string): Promise<ReconciliationPeriod[]> {
  const db = await initDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PERIODS_STORE, 'readonly');
    const index = tx.objectStore(PERIODS_STORE).index('accountId');
    const request = index.getAll(accountId);
    request.onsuccess = () => resolve((request.result as ReconciliationPeriod[]).sort((a, b) => (a.start < b.start ? -1 : 1)));
    request.onerror = () => reject(request.error);
  });
}

export async function deletePeriod(id: string): Promise<void> {
  await withStore(PERIODS_STORE, 'readwrite', (store) => store.delete(id));
}

// ─── Snapshots (immutable once closed) ─────────────────────────────────────────

export async function saveSnapshot(snapshot: PeriodSnapshot): Promise<void> {
  const db = await initDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SNAPSHOTS_STORE, 'readwrite');
    const store = tx.objectStore(SNAPSHOTS_STORE);
    // Snapshots are immutable: refuse to overwrite an existing one.
    const getRequest = store.get(snapshot.period.id);
    getRequest.onsuccess = () => {
      if (getRequest.result) {
        reject(new Error(`A snapshot for period "${snapshot.period.id}" already exists and cannot be overwritten.`));
        return;
      }
      store.put(snapshot, snapshot.period.id);
    };
    getRequest.onerror = () => reject(getRequest.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getSnapshot(periodId: string): Promise<PeriodSnapshot | undefined> {
  const db = await initDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SNAPSHOTS_STORE, 'readonly');
    const request = tx.objectStore(SNAPSHOTS_STORE).get(periodId);
    request.onsuccess = () => resolve(request.result as PeriodSnapshot | undefined);
    request.onerror = () => reject(request.error);
  });
}

// ─── Rules ──────────────────────────────────────────────────────────────────────

interface KeyedRecord<T> {
  key: string;
  accountId: string;
  value: T;
}

export async function saveRule(accountId: string, rule: CategoryRule): Promise<void> {
  const record: KeyedRecord<CategoryRule> = { key: `${accountId}:${rule.id}`, accountId, value: rule };
  await withStore(RULES_STORE, 'readwrite', (store) => store.put(record));
}

export async function deleteRule(accountId: string, ruleId: string): Promise<void> {
  await withStore(RULES_STORE, 'readwrite', (store) => store.delete(`${accountId}:${ruleId}`));
}

export async function getRules(accountId: string): Promise<CategoryRule[]> {
  const db = await initDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(RULES_STORE, 'readonly');
    const index = tx.objectStore(RULES_STORE).index('accountId');
    const request = index.getAll(accountId);
    request.onsuccess = () =>
      resolve((request.result as KeyedRecord<CategoryRule>[]).map((record) => record.value));
    request.onerror = () => reject(request.error);
  });
}

// ─── Cost basis ─────────────────────────────────────────────────────────────────

export async function saveCostBasisEntry(accountId: string, entry: CostBasisEntry): Promise<void> {
  const record: KeyedRecord<CostBasisEntry> = { key: `${accountId}:${entry.id}`, accountId, value: entry };
  await withStore(COST_BASIS_STORE, 'readwrite', (store) => store.put(record));
}

export async function deleteCostBasisEntry(accountId: string, entryId: string): Promise<void> {
  await withStore(COST_BASIS_STORE, 'readwrite', (store) => store.delete(`${accountId}:${entryId}`));
}

export async function getCostBasisEntries(accountId: string): Promise<CostBasisEntry[]> {
  const db = await initDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(COST_BASIS_STORE, 'readonly');
    const index = tx.objectStore(COST_BASIS_STORE).index('accountId');
    const request = index.getAll(accountId);
    request.onsuccess = () =>
      resolve((request.result as KeyedRecord<CostBasisEntry>[]).map((record) => record.value));
    request.onerror = () => reject(request.error);
  });
}

// ─── Review state ───────────────────────────────────────────────────────────────

export async function saveReview(accountId: string, review: ReviewRecord): Promise<void> {
  const record: KeyedRecord<ReviewRecord> = {
    key: `${accountId}:${review.targetType}:${review.targetId}`,
    accountId,
    value: review,
  };
  await withStore(REVIEW_STORE, 'readwrite', (store) => store.put(record));
}

export async function getReviewState(accountId: string): Promise<ReviewRecord[]> {
  const db = await initDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(REVIEW_STORE, 'readonly');
    const index = tx.objectStore(REVIEW_STORE).index('accountId');
    const request = index.getAll(accountId);
    request.onsuccess = () =>
      resolve((request.result as KeyedRecord<ReviewRecord>[]).map((record) => record.value));
    request.onerror = () => reject(request.error);
  });
}

// Initialize the database on module load, matching alertRulesDb.ts.
if (typeof window !== 'undefined' && typeof indexedDB !== 'undefined') {
  initDb().catch((err) => console.error('Failed to initialize treasury reconciliation database:', err));
}
