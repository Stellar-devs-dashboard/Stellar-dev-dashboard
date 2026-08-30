import type { VerificationRecord } from '../../types/wasmVerification'

/**
 * Verification records get their own IndexedDB database rather than a new
 * object store bolted onto the shared `stellar-dev-dashboard` database
 * (see src/lib/storage.ts). That database's version/migration path is
 * shared by many unrelated features; owning a dedicated, independently
 * versioned database keeps this feature's schema changes from ever risking
 * a migration bug in the rest of the app, at the cost of one extra
 * `indexedDB.open` call. See docs/wasm-verification.md.
 */
const DB_NAME = 'stellar-wasm-verification'
const DB_VERSION = 1
const STORE = 'records'
const MAX_RECORDS_PER_CONTRACT = 100

function isIndexedDbAvailable(): boolean {
  return typeof indexedDB !== 'undefined'
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex('byContract', ['contractId', 'network'], { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function withStore<T>(mode: IDBTransactionMode, fn: (_store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  if (!isIndexedDbAvailable()) return undefined
  const db = await openDb()
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const store = tx.objectStore(STORE)
      const request = fn(store)
      tx.oncomplete = () => resolve(request ? (request.result as T) : undefined)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

export async function saveVerificationRecord(record: VerificationRecord): Promise<void> {
  await withStore('readwrite', (store) => store.put(record))
  await pruneOldRecords(record.contractId, record.network)
}

export async function getVerificationRecords(contractId: string, network: string): Promise<VerificationRecord[]> {
  if (!isIndexedDbAvailable()) return []
  const db = await openDb()
  try {
    return await new Promise<VerificationRecord[]>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const index = tx.objectStore(STORE).index('byContract')
      const range = IDBKeyRange.only([contractId, network])
      const results: VerificationRecord[] = []
      const cursorRequest = index.openCursor(range)
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result
        if (cursor) {
          results.push(cursor.value as VerificationRecord)
          cursor.continue()
        }
      }
      tx.oncomplete = () => resolve(results.sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
      tx.onerror = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

async function pruneOldRecords(contractId: string, network: string): Promise<void> {
  const records = await getVerificationRecords(contractId, network)
  if (records.length <= MAX_RECORDS_PER_CONTRACT) return
  const toRemove = records.slice(MAX_RECORDS_PER_CONTRACT)
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      for (const record of toRemove) store.delete(record.id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

export async function deleteVerificationRecord(id: string): Promise<void> {
  await withStore('readwrite', (store) => store.delete(id))
}

export async function clearAllVerificationRecords(): Promise<void> {
  await withStore('readwrite', (store) => store.clear())
}
