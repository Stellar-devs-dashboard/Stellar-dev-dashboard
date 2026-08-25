import type { CategoryRule, CostBasisEntry, CounterpartyLabel, PeriodSnapshot } from '../../types/treasury'

/**
 * Dedicated, independently-versioned IndexedDB database for treasury data
 * (rules, labels, cost-basis entries, immutable snapshots) — mirrors the
 * pattern used by src/lib/wasmVerification/records.ts rather than adding a
 * new object store to the shared stellar-dev-dashboard database, so this
 * feature's schema changes can never risk a migration bug elsewhere.
 */
const DB_NAME = 'stellar-treasury'
const DB_VERSION = 1
const STORE_RULES = 'rules'
const STORE_LABELS = 'labels'
const STORE_COST_BASIS = 'costBasis'
const STORE_SNAPSHOTS = 'snapshots'

function isIndexedDbAvailable(): boolean {
  return typeof indexedDB !== 'undefined'
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_RULES)) db.createObjectStore(STORE_RULES, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(STORE_LABELS)) db.createObjectStore(STORE_LABELS, { keyPath: 'address' })
      if (!db.objectStoreNames.contains(STORE_COST_BASIS)) {
        const store = db.createObjectStore(STORE_COST_BASIS, { keyPath: ['asset', 'effectiveAt'] })
        store.createIndex('byAsset', 'asset', { unique: false })
      }
      if (!db.objectStoreNames.contains(STORE_SNAPSHOTS)) {
        const store = db.createObjectStore(STORE_SNAPSHOTS, { keyPath: 'id' })
        store.createIndex('byPeriod', 'periodId', { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function getAll<T>(storeName: string): Promise<T[]> {
  if (!isIndexedDbAvailable()) return []
  const db = await openDb()
  try {
    return await new Promise<T[]>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly')
      const request = tx.objectStore(storeName).getAll()
      tx.oncomplete = () => resolve(request.result as T[])
      tx.onerror = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

async function putAll(storeName: string, records: Array<Record<string, unknown>>): Promise<void> {
  if (!isIndexedDbAvailable()) return
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite')
      const store = tx.objectStore(storeName)
      store.clear()
      for (const record of records) store.put(record)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

export async function saveCategoryRules(rules: CategoryRule[]): Promise<void> {
  await putAll(STORE_RULES, rules as unknown as Array<Record<string, unknown>>)
}
export async function loadCategoryRules(): Promise<CategoryRule[]> {
  return getAll<CategoryRule>(STORE_RULES)
}

export async function saveCounterpartyLabels(labels: CounterpartyLabel[]): Promise<void> {
  await putAll(STORE_LABELS, labels as unknown as Array<Record<string, unknown>>)
}
export async function loadCounterpartyLabels(): Promise<CounterpartyLabel[]> {
  return getAll<CounterpartyLabel>(STORE_LABELS)
}

export async function saveCostBasisEntries(entries: CostBasisEntry[]): Promise<void> {
  await putAll(STORE_COST_BASIS, entries as unknown as Array<Record<string, unknown>>)
}
export async function loadCostBasisEntries(): Promise<CostBasisEntry[]> {
  return getAll<CostBasisEntry>(STORE_COST_BASIS)
}

export async function saveSnapshot(snapshot: PeriodSnapshot): Promise<void> {
  if (!isIndexedDbAvailable()) return
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_SNAPSHOTS, 'readwrite')
      tx.objectStore(STORE_SNAPSHOTS).put(snapshot)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

export async function loadSnapshots(): Promise<PeriodSnapshot[]> {
  const all = await getAll<PeriodSnapshot>(STORE_SNAPSHOTS)
  return all.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
}
