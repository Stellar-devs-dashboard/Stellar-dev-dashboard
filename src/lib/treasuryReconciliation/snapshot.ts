/**
 * Immutable period snapshots: once a period is closed, its postings,
 * balances, and discrepancies are frozen into a `PeriodSnapshot` with a
 * deterministic checksum, so re-deriving the same period later can be
 * verified byte-for-byte against what was originally closed.
 */

import type {
  AssetBalance,
  Discrepancy,
  LedgerPosting,
  PeriodSnapshot,
  ReconciliationPeriod,
  ReviewRecord,
} from '../../types/treasury';
import { SNAPSHOT_SCHEMA_VERSION } from '../../types/treasury';

/**
 * Deterministic, non-cryptographic FNV-1a hash. Good enough to detect
 * accidental drift between two snapshots of "the same" period — this is an
 * integrity check, not a security boundary, so no need for SubtleCrypto's
 * async API here.
 */
export function fnv1aHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function canonicalize(postings: LedgerPosting[], balances: AssetBalance[]): string {
  const sortedPostings = [...postings].sort((a, b) => a.id.localeCompare(b.id));
  const sortedBalances = [...balances].sort((a, b) => a.asset.code.localeCompare(b.asset.code));
  return JSON.stringify({ postings: sortedPostings, balances: sortedBalances });
}

export function computeSnapshotChecksum(postings: LedgerPosting[], balances: AssetBalance[]): string {
  return fnv1aHash(canonicalize(postings, balances));
}

export function buildPeriodSnapshot(
  period: ReconciliationPeriod,
  postings: LedgerPosting[],
  balances: AssetBalance[],
  discrepancies: Discrepancy[],
  review: ReviewRecord[],
  now = new Date()
): PeriodSnapshot {
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    period,
    postings,
    balances,
    discrepancies,
    review,
    generatedAt: now.toISOString(),
    checksum: computeSnapshotChecksum(postings, balances),
  };
}

export function verifySnapshotIntegrity(snapshot: PeriodSnapshot): boolean {
  return computeSnapshotChecksum(snapshot.postings, snapshot.balances) === snapshot.checksum;
}

export interface SnapshotMigrationError {
  ok: false;
  error: string;
}
export interface SnapshotMigrationSuccess {
  ok: true;
  data: PeriodSnapshot;
}

/**
 * Loads a snapshot from arbitrary (e.g. imported-file) JSON, validating its
 * schema version. There is only one schema version today; this function is
 * the seam a future `schemaVersion: 2` migration would hang off of, mirroring
 * `src/lib/import.ts`'s `SUPPORTED_VERSIONS` allowlist pattern.
 */
export function loadPeriodSnapshot(raw: unknown): SnapshotMigrationSuccess | SnapshotMigrationError {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'Snapshot payload must be an object.' };
  }
  const candidate = raw as Partial<PeriodSnapshot>;
  if (candidate.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
    return {
      ok: false,
      error: `Unsupported snapshot schema version: ${String(candidate.schemaVersion)}. Expected ${SNAPSHOT_SCHEMA_VERSION}.`,
    };
  }
  if (!candidate.period || !Array.isArray(candidate.postings) || !Array.isArray(candidate.balances)) {
    return { ok: false, error: 'Snapshot payload is missing required fields (period, postings, balances).' };
  }
  const snapshot = candidate as PeriodSnapshot;
  if (!verifySnapshotIntegrity(snapshot)) {
    return { ok: false, error: 'Snapshot checksum does not match its postings/balances — the file may be corrupted or hand-edited.' };
  }
  return { ok: true, data: snapshot };
}
