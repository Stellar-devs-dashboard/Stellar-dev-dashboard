/**
 * IndexedDB snapshot library with migration, comparison, pruning, and tagging.
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  PortableLedgerSnapshot,
  SnapshotComparisonResult,
  SnapshotLibraryQuery,
  SnapshotLibraryRecord,
  SnapshotLibraryStats,
  SnapshotPrunePolicy,
} from '../../types/ledgerSnapshots';
import { estimateSnapshotSize } from './canonicalize';

const DB_NAME = 'stellar-ledger-snapshots';
const DB_VERSION = 1;
const STORE_NAME = 'snapshots';

interface SnapshotDbSchema extends DBSchema {
  snapshots: {
    key: string;
    value: SnapshotLibraryRecord;
    indexes: {
      createdAt: number;
      networkName: string;
      label: string;
      pinned: number;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<SnapshotDbSchema>> | null = null;

function openSnapshotDatabase(): Promise<IDBPDatabase<SnapshotDbSchema>> {
  if (dbPromise) return dbPromise;

  dbPromise = openDB<SnapshotDbSchema>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
        store.createIndex('networkName', 'snapshot.network.networkName');
        store.createIndex('label', 'label');
        store.createIndex('pinned', 'pinned');
      }
    },
  });

  return dbPromise;
}

export interface SnapshotRepository {
  put(record: SnapshotLibraryRecord): Promise<void>;
  get(id: string): Promise<SnapshotLibraryRecord | undefined>;
  getAll(): Promise<SnapshotLibraryRecord[]>;
  delete(id: string): Promise<boolean>;
  query(query: SnapshotLibraryQuery): Promise<SnapshotLibraryRecord[]>;
  compare(leftId: string, rightId: string): Promise<SnapshotComparisonResult | null>;
  prune(policy: SnapshotPrunePolicy): Promise<number>;
  stats(): Promise<SnapshotLibraryStats>;
  updateTags(id: string, tags: string[]): Promise<boolean>;
  setPinned(id: string, pinned: boolean): Promise<boolean>;
  recordReplay(id: string): Promise<boolean>;
}

function matchesQuery(record: SnapshotLibraryRecord, query: SnapshotLibraryQuery): boolean {
  if (query.pinnedOnly && !record.pinned) return false;
  if (query.networkName && record.snapshot.network.networkName !== query.networkName) return false;
  if (query.tags?.length) {
    const hasAll = query.tags.every((tag) => record.tags.includes(tag));
    if (!hasAll) return false;
  }
  if (query.search) {
    const haystack = `${record.label} ${record.tags.join(' ')} ${record.snapshot.network.networkName}`.toLowerCase();
    if (!haystack.includes(query.search.toLowerCase())) return false;
  }
  return true;
}

export function buildLibraryRecord(snapshot: PortableLedgerSnapshot): SnapshotLibraryRecord {
  const now = Date.now();
  return {
    id: snapshot.snapshotId,
    snapshot,
    createdAt: now,
    updatedAt: now,
    sizeBytes: estimateSnapshotSize(snapshot),
    tags: snapshot.tags,
    label: snapshot.label,
    pinned: false,
    replayCount: 0,
  };
}

export class IndexedDbSnapshotRepository implements SnapshotRepository {
  async put(record: SnapshotLibraryRecord): Promise<void> {
    const db = await openSnapshotDatabase();
    await db.put(STORE_NAME, { ...record, updatedAt: Date.now() });
  }

  async get(id: string): Promise<SnapshotLibraryRecord | undefined> {
    const db = await openSnapshotDatabase();
    return db.get(STORE_NAME, id);
  }

  async getAll(): Promise<SnapshotLibraryRecord[]> {
    const db = await openSnapshotDatabase();
    const records = await db.getAll(STORE_NAME);
    return records.sort((a, b) => b.createdAt - a.createdAt);
  }

  async delete(id: string): Promise<boolean> {
    const db = await openSnapshotDatabase();
    const existing = await db.get(STORE_NAME, id);
    if (!existing) return false;
    await db.delete(STORE_NAME, id);
    return true;
  }

  async query(query: SnapshotLibraryQuery): Promise<SnapshotLibraryRecord[]> {
    const all = await this.getAll();
    const filtered = all.filter((record) => matchesQuery(record, query));
    const offset = query.offset ?? 0;
    const limit = query.limit ?? filtered.length;
    return filtered.slice(offset, offset + limit);
  }

  async compare(leftId: string, rightId: string): Promise<SnapshotComparisonResult | null> {
    const [left, right] = await Promise.all([this.get(leftId), this.get(rightId)]);
    if (!left || !right) return null;

    const leftEntries = new Map(left.snapshot.ledgerEntries.map((e) => [e.id, e]));
    const rightEntries = new Map(right.snapshot.ledgerEntries.map((e) => [e.id, e]));

    const addedEntries = right.snapshot.ledgerEntries.filter((e) => !leftEntries.has(e.id));
    const removedEntries = left.snapshot.ledgerEntries.filter((e) => !rightEntries.has(e.id));
    const changedEntries = left.snapshot.ledgerEntries
      .filter((e) => {
        const other = rightEntries.get(e.id);
        return other && other.valueXdr !== e.valueXdr;
      })
      .map((e) => {
        const other = rightEntries.get(e.id)!;
        return {
          id: e.id,
          kind: e.kind,
          key: e.key,
          beforeValueXdr: e.valueXdr,
          afterValueXdr: other.valueXdr,
        };
      });

    const leftAccounts = new Map(left.snapshot.accounts.map((a) => [a.accountId, a]));
    const accountSequenceChanges = right.snapshot.accounts
      .filter((a) => {
        const before = leftAccounts.get(a.accountId);
        return before && before.sequence !== a.sequence;
      })
      .map((a) => ({
        accountId: a.accountId,
        beforeSequence: leftAccounts.get(a.accountId)!.sequence,
        afterSequence: a.sequence,
      }));

    const leftSims = new Map(left.snapshot.simulations.map((s) => [s.requestDigest, s]));
    const simulationChanges = right.snapshot.simulations.map((sim) => {
      const before = leftSims.get(sim.requestDigest);
      const changed = !before || before.responseCanonical !== sim.responseCanonical;
      const unsupportedDelta: string[] = [];
      if (before?.unsupportedReasons || sim.unsupportedReasons) {
        const beforeSet = new Set(before?.unsupportedReasons ?? []);
        for (const reason of sim.unsupportedReasons ?? []) {
          if (!beforeSet.has(reason)) unsupportedDelta.push(reason);
        }
      }
      return { requestDigest: sim.requestDigest, changed, unsupportedDelta };
    });

    return {
      leftId,
      rightId,
      addedEntries,
      removedEntries,
      changedEntries,
      accountSequenceChanges,
      simulationChanges,
    };
  }

  async prune(policy: SnapshotPrunePolicy): Promise<number> {
    const records = await this.getAll();
    let candidates = records.filter((r) => {
      if (policy.retainPinned && r.pinned) return false;
      if (policy.minAgeMs && Date.now() - r.createdAt < policy.minAgeMs) return false;
      return true;
    });

    candidates = candidates.sort((a, b) => a.createdAt - b.createdAt);

    let totalBytes = records.reduce((sum, r) => sum + r.sizeBytes, 0);
    let removed = 0;

    while (
      (records.length - removed > policy.maxRecords || totalBytes > policy.maxTotalBytes) &&
      candidates.length > 0
    ) {
      const victim = candidates.shift()!;
      if (policy.retainPinned && victim.pinned) continue;
      const deleted = await this.delete(victim.id);
      if (deleted) {
        removed += 1;
        totalBytes -= victim.sizeBytes;
      }
    }

    return removed;
  }

  async stats(): Promise<SnapshotLibraryStats> {
    const records = await this.getAll();
    const networks = [...new Set(records.map((r) => r.snapshot.network.networkName))];
    return {
      recordCount: records.length,
      totalBytes: records.reduce((sum, r) => sum + r.sizeBytes, 0),
      pinnedCount: records.filter((r) => r.pinned).length,
      networks,
      oldestCreatedAt: records.length ? Math.min(...records.map((r) => r.createdAt)) : undefined,
      newestCreatedAt: records.length ? Math.max(...records.map((r) => r.createdAt)) : undefined,
    };
  }

  async updateTags(id: string, tags: string[]): Promise<boolean> {
    const record = await this.get(id);
    if (!record) return false;
    record.tags = tags;
    record.snapshot.tags = tags;
    await this.put(record);
    return true;
  }

  async setPinned(id: string, pinned: boolean): Promise<boolean> {
    const record = await this.get(id);
    if (!record) return false;
    record.pinned = pinned;
    await this.put(record);
    return true;
  }

  async recordReplay(id: string): Promise<boolean> {
    const record = await this.get(id);
    if (!record) return false;
    record.replayCount += 1;
    record.lastReplayAt = Date.now();
    await this.put(record);
    return true;
  }
}

export class InMemorySnapshotRepository implements SnapshotRepository {
  private records = new Map<string, SnapshotLibraryRecord>();

  async put(record: SnapshotLibraryRecord): Promise<void> {
    this.records.set(record.id, { ...record, updatedAt: Date.now() });
  }

  async get(id: string): Promise<SnapshotLibraryRecord | undefined> {
    return this.records.get(id);
  }

  async getAll(): Promise<SnapshotLibraryRecord[]> {
    return [...this.records.values()].sort((a, b) => b.createdAt - a.createdAt);
  }

  async delete(id: string): Promise<boolean> {
    return this.records.delete(id);
  }

  async query(query: SnapshotLibraryQuery): Promise<SnapshotLibraryRecord[]> {
    const all = await this.getAll();
    const filtered = all.filter((record) => matchesQuery(record, query));
    const offset = query.offset ?? 0;
    const limit = query.limit ?? filtered.length;
    return filtered.slice(offset, offset + limit);
  }

  async compare(leftId: string, rightId: string): Promise<SnapshotComparisonResult | null> {
    const left = await this.get(leftId);
    const right = await this.get(rightId);
    if (!left || !right) return null;

    const leftEntries = new Map(left.snapshot.ledgerEntries.map((e) => [e.id, e]));
    const rightEntries = new Map(right.snapshot.ledgerEntries.map((e) => [e.id, e]));

    const addedEntries = right.snapshot.ledgerEntries.filter((e) => !leftEntries.has(e.id));
    const removedEntries = left.snapshot.ledgerEntries.filter((e) => !rightEntries.has(e.id));
    const changedEntries = left.snapshot.ledgerEntries
      .filter((e) => {
        const other = rightEntries.get(e.id);
        return other && other.valueXdr !== e.valueXdr;
      })
      .map((e) => {
        const other = rightEntries.get(e.id)!;
        return {
          id: e.id,
          kind: e.kind,
          key: e.key,
          beforeValueXdr: e.valueXdr,
          afterValueXdr: other.valueXdr,
        };
      });

    const leftAccounts = new Map(left.snapshot.accounts.map((a) => [a.accountId, a]));
    const accountSequenceChanges = right.snapshot.accounts
      .filter((a) => {
        const before = leftAccounts.get(a.accountId);
        return before && before.sequence !== a.sequence;
      })
      .map((a) => ({
        accountId: a.accountId,
        beforeSequence: leftAccounts.get(a.accountId)!.sequence,
        afterSequence: a.sequence,
      }));

    const leftSims = new Map(left.snapshot.simulations.map((s) => [s.requestDigest, s]));
    const simulationChanges = right.snapshot.simulations.map((sim) => {
      const before = leftSims.get(sim.requestDigest);
      const changed = !before || before.responseCanonical !== sim.responseCanonical;
      const unsupportedDelta: string[] = [];
      if (before?.unsupportedReasons || sim.unsupportedReasons) {
        const beforeSet = new Set(before?.unsupportedReasons ?? []);
        for (const reason of sim.unsupportedReasons ?? []) {
          if (!beforeSet.has(reason)) unsupportedDelta.push(reason);
        }
      }
      return { requestDigest: sim.requestDigest, changed, unsupportedDelta };
    });

    return {
      leftId,
      rightId,
      addedEntries,
      removedEntries,
      changedEntries,
      accountSequenceChanges,
      simulationChanges,
    };
  }

  async prune(policy: SnapshotPrunePolicy): Promise<number> {
    const records = await this.getAll();
    let removed = 0;
    let totalBytes = records.reduce((sum, r) => sum + r.sizeBytes, 0);
    const candidates = records
      .filter((r) => !(policy.retainPinned && r.pinned))
      .sort((a, b) => a.createdAt - b.createdAt);

    for (const candidate of candidates) {
      if (records.length - removed <= policy.maxRecords && totalBytes <= policy.maxTotalBytes) break;
      if (this.records.delete(candidate.id)) {
        removed += 1;
        totalBytes -= candidate.sizeBytes;
      }
    }
    return removed;
  }

  async stats(): Promise<SnapshotLibraryStats> {
    const records = await this.getAll();
    return {
      recordCount: records.length,
      totalBytes: records.reduce((sum, r) => sum + r.sizeBytes, 0),
      pinnedCount: records.filter((r) => r.pinned).length,
      networks: [...new Set(records.map((r) => r.snapshot.network.networkName))],
    };
  }

  async updateTags(id: string, tags: string[]): Promise<boolean> {
    const record = await this.get(id);
    if (!record) return false;
    record.tags = tags;
    await this.put(record);
    return true;
  }

  async setPinned(id: string, pinned: boolean): Promise<boolean> {
    const record = await this.get(id);
    if (!record) return false;
    record.pinned = pinned;
    await this.put(record);
    return true;
  }

  async recordReplay(id: string): Promise<boolean> {
    const record = await this.get(id);
    if (!record) return false;
    record.replayCount += 1;
    record.lastReplayAt = Date.now();
    await this.put(record);
    return true;
  }
}

export const snapshotRepository = new IndexedDbSnapshotRepository();

export async function resetSnapshotDatabaseForTests(): Promise<void> {
  dbPromise = null;
  if (typeof indexedDB !== 'undefined') {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(DB_NAME);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}
