/**
 * Persistent Storage Layer — IndexedDB with localStorage fallback
 *
 * Provides:
 *   - getStoredValue / setStoredValue / removeStoredValue / clearStorage
 *   - getCachedApiResponse / setCachedApiResponse  (TTL-aware API cache in IDB)
 *   - getOfflineQueue / enqueueOfflineOp / dequeueOfflineOp  (offline write queue)
 *   - storageStats  (size estimates)
 */

// ─── DB config ────────────────────────────────────────────────────────────────

const DB_NAME    = 'stellar-dev-dashboard';
const DB_VERSION = 3;

const STORES = {
  APP_STATE:  'app-state',
  API_CACHE:  'api-cache',
  OFFLINE_Q:  'offline-queue',
  CONTRACT_HISTORY: 'contract-history',
} as const;

type StoreName = (typeof STORES)[keyof typeof STORES];

interface ApiCacheRecord {
  key: string;
  value: unknown;
  expiresAt: number;
  tag: string;
  cachedAt: number;
}

export interface OfflineOp {
  type: string;
  payload: unknown;
  queuedAt?: number;
  id?: number;
}

export interface ContractInteractionRecord {
  id: string;
  contractId: string;
  functionName?: string;
  type?: string;
  status?: string;
  timestamp: number;
  [key: string]: unknown;
}

export interface ContractInteractionFilters {
  contractId?: string;
  functionName?: string;
  type?: string;
  status?: string;
}

export interface EncryptedStoredRecord {
  ciphertext: string;
  iv: string;
  salt?: string;
}

// ─── DB open ──────────────────────────────────────────────────────────────────

let _db: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(STORES.APP_STATE)) {
        db.createObjectStore(STORES.APP_STATE);
      }

      if (!db.objectStoreNames.contains(STORES.API_CACHE)) {
        const store = db.createObjectStore(STORES.API_CACHE, { keyPath: 'key' });
        store.createIndex('expiresAt', 'expiresAt', { unique: false });
        store.createIndex('tag',       'tag',       { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.OFFLINE_Q)) {
        db.createObjectStore(STORES.OFFLINE_Q, { keyPath: 'id', autoIncrement: true });
      }

      if (!db.objectStoreNames.contains(STORES.CONTRACT_HISTORY)) {
        const store = db.createObjectStore(STORES.CONTRACT_HISTORY, { keyPath: 'id' });
        store.createIndex('contractId', 'contractId', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('type', 'type', { unique: false });
      }
    };

    request.onsuccess = () => {
      _db = request.result;

      _db.onversionchange = () => {
        _db?.close();
        _db = null;
      };

      resolve(_db);
    };

    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('IndexedDB blocked'));
  });
}

// ─── Generic transaction helper ───────────────────────────────────────────────

async function tx<T>(
  storeName: StoreName,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | undefined> {
  const db       = await openDB();
  const trans    = db.transaction(storeName, mode);
  const store    = trans.objectStore(storeName);
  return new Promise((resolve, reject) => {
    const req = fn(store);
    if (req && typeof req.onsuccess !== 'undefined') {
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    } else {
      trans.oncomplete = () => resolve(undefined);
      trans.onerror    = () => reject(trans.error);
    }
  });
}

// ─── App-state store (Zustand persistence) ───────────────────────────────────

export async function getStoredValue(key: string): Promise<unknown> {
  try {
    return await tx(STORES.APP_STATE, 'readonly', (s) => s.get(key)) ?? null;
  } catch {
    try {
      const raw = localStorage.getItem(`idb:${key}`);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }
}

export async function setStoredValue(key: string, value: unknown): Promise<void> {
  try {
    await tx(STORES.APP_STATE, 'readwrite', (s) => s.put(value, key));
  } catch {
    try { localStorage.setItem(`idb:${key}`, JSON.stringify(value)); } catch { /* ignore */ }
  }
}

export async function removeStoredValue(key: string): Promise<void> {
  try {
    await tx(STORES.APP_STATE, 'readwrite', (s) => s.delete(key));
  } catch {
    try { localStorage.removeItem(`idb:${key}`); } catch { /* ignore */ }
  }
}

export async function clearStorage(): Promise<void> {
  try {
    await tx(STORES.APP_STATE, 'readwrite', (s) => s.clear());
  } catch { /* ignore */ }
}

// ─── API cache store ──────────────────────────────────────────────────────────

export async function getCachedApiResponse(key: string): Promise<unknown> {
  try {
    const record = await tx<ApiCacheRecord>(STORES.API_CACHE, 'readonly', (s) => s.get(key));
    if (!record) return null;
    if (Date.now() > record.expiresAt) {
      deleteCachedApiResponse(key).catch(() => {});
      return null;
    }
    return record.value;
  } catch { return null; }
}

export async function setCachedApiResponse(
  key: string,
  value: unknown,
  ttl: number,
  tag = '',
): Promise<void> {
  try {
    const record: ApiCacheRecord = { key, value, expiresAt: Date.now() + ttl, tag, cachedAt: Date.now() };
    await tx(STORES.API_CACHE, 'readwrite', (s) => s.put(record));
  } catch { /* ignore */ }
}

export async function deleteCachedApiResponse(key: string): Promise<void> {
  try {
    await tx(STORES.API_CACHE, 'readwrite', (s) => s.delete(key));
  } catch { /* ignore */ }
}

export async function invalidateCacheByTag(tag: string): Promise<void> {
  try {
    const db    = await openDB();
    const trans = db.transaction(STORES.API_CACHE, 'readwrite');
    const index = trans.objectStore(STORES.API_CACHE).index('tag');
    const req   = index.openCursor(IDBKeyRange.only(tag));

    await new Promise<void>((resolve, reject) => {
      req.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (cursor) { cursor.delete(); cursor.continue(); }
        else resolve();
      };
      req.onerror = () => reject(req.error);
    });
  } catch { /* ignore */ }
}

export async function pruneExpiredApiCache(): Promise<void> {
  try {
    const db    = await openDB();
    const trans = db.transaction(STORES.API_CACHE, 'readwrite');
    const index = trans.objectStore(STORES.API_CACHE).index('expiresAt');
    const range = IDBKeyRange.upperBound(Date.now());
    const req   = index.openCursor(range);

    await new Promise<void>((resolve, reject) => {
      req.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (cursor) { cursor.delete(); cursor.continue(); }
        else resolve();
      };
      req.onerror = () => reject(req.error);
    });
  } catch { /* ignore */ }
}

// ─── Offline write queue ──────────────────────────────────────────────────────

export async function enqueueOfflineOp(op: Omit<OfflineOp, 'id' | 'queuedAt'>): Promise<void> {
  try {
    await tx(STORES.OFFLINE_Q, 'readwrite', (s) => s.add({ ...op, queuedAt: Date.now() }));
  } catch { /* ignore */ }
}

export async function getOfflineQueue(): Promise<OfflineOp[]> {
  try {
    return (await tx<OfflineOp[]>(STORES.OFFLINE_Q, 'readonly', (s) => s.getAll())) ?? [];
  } catch { return []; }
}

export async function dequeueOfflineOp(id: number): Promise<void> {
  try {
    await tx(STORES.OFFLINE_Q, 'readwrite', (s) => s.delete(id));
  } catch { /* ignore */ }
}

export async function clearOfflineQueue(): Promise<void> {
  try {
    await tx(STORES.OFFLINE_Q, 'readwrite', (s) => s.clear());
  } catch { /* ignore */ }
}

// ─── Contract History Store ──────────────────────────────────────────────────

export async function addContractInteraction(record: ContractInteractionRecord): Promise<void> {
  try {
    await tx(STORES.CONTRACT_HISTORY, 'readwrite', (s) => s.put(record));
  } catch { /* ignore */ }
}

export async function getContractInteractions(
  filters: ContractInteractionFilters = {},
): Promise<ContractInteractionRecord[]> {
  try {
    const all = (await tx<ContractInteractionRecord[]>(
      STORES.CONTRACT_HISTORY,
      'readonly',
      (s) => s.getAll(),
    )) ?? [];
    let results = all.sort((a, b) => b.timestamp - a.timestamp);

    if (filters.contractId) {
      results = results.filter((r) =>
        r.contractId.toLowerCase().includes(filters.contractId!.toLowerCase()),
      );
    }
    if (filters.functionName) {
      results = results.filter((r) =>
        (r.functionName ?? '').toLowerCase().includes(filters.functionName!.toLowerCase()),
      );
    }
    if (filters.type && filters.type !== 'all') {
      results = results.filter((r) => r.type === filters.type);
    }
    if (filters.status && filters.status !== 'all') {
      results = results.filter((r) => r.status === filters.status);
    }
    return results;
  } catch {
    return [];
  }
}

export async function clearContractInteractions(): Promise<void> {
  try {
    await tx(STORES.CONTRACT_HISTORY, 'readwrite', (s) => s.clear());
  } catch { /* ignore */ }
}

// ─── Storage stats ────────────────────────────────────────────────────────────

export async function storageStats(): Promise<{
  appState: number;
  apiCache: number;
  offlineQueue: number;
}> {
  try {
    const [appState, apiCache, offlineQueue] = await Promise.all([
      tx<number>(STORES.APP_STATE, 'readonly', (s) => s.count()),
      tx<number>(STORES.API_CACHE, 'readonly', (s) => s.count()),
      tx<number>(STORES.OFFLINE_Q, 'readonly', (s) => s.count()),
    ]);
    return {
      appState: appState ?? 0,
      apiCache: apiCache ?? 0,
      offlineQueue: offlineQueue ?? 0,
    };
  } catch {
    return { appState: 0, apiCache: 0, offlineQueue: 0 };
  }
}

// ─── Auto-prune on load ───────────────────────────────────────────────────────

if (typeof window !== 'undefined') {
  setTimeout(() => pruneExpiredApiCache().catch(() => {}), 3_000);
}

// ─── Encrypted storage ────────────────────────────────────────────────────────

export async function setEncryptedValue(
  key: string,
  plaintext: string,
  passphrase: string,
): Promise<void> {
  const { encrypt } = await import('./encryption');
  const encrypted = await encrypt(plaintext, passphrase);
  await setStoredValue(`enc:${key}`, encrypted);
}

export async function getEncryptedValue(key: string, passphrase: string): Promise<string | null> {
  const record = await getStoredValue(`enc:${key}`) as EncryptedStoredRecord | null;
  if (!record) return null;
  const { decrypt } = await import('./encryption');
  return decrypt(record.ciphertext, passphrase, record.iv, record.salt);
}

export async function removeEncryptedValue(key: string): Promise<void> {
  await removeStoredValue(`enc:${key}`);
}
