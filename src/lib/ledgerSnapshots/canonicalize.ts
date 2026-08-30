/**
 * Canonical serialization and SHA-256 integrity for portable ledger snapshots.
 * Deterministic ordering ensures identical snapshots produce identical digests.
 */

import type { LedgerEntryRecord, PortableLedgerSnapshot } from '../../types/ledgerSnapshots';

export function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      sorted[key] = sortKeysDeep(record[key]);
    }
    return sorted;
  }
  return value;
}

export function stableCanonicalJson(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function sortLedgerEntries(entries: LedgerEntryRecord[]): LedgerEntryRecord[] {
  return [...entries].sort((a, b) => {
    const kindCmp = a.kind.localeCompare(b.kind);
    if (kindCmp !== 0) return kindCmp;
    const keyCmp = a.key.localeCompare(b.key);
    if (keyCmp !== 0) return keyCmp;
    return a.id.localeCompare(b.id);
  });
}

export function sortAccounts<T extends { accountId: string }>(accounts: T[]): T[] {
  return [...accounts].sort((a, b) => a.accountId.localeCompare(b.accountId));
}

export interface DigestPayload {
  formatKind: string;
  schemaVersion: number;
  snapshotId: string;
  network: PortableLedgerSnapshot['network'];
  ledger: PortableLedgerSnapshot['ledger'];
  accounts: PortableLedgerSnapshot['accounts'];
  ledgerEntries: LedgerEntryRecord[];
  contractStorage: PortableLedgerSnapshot['contractStorage'];
  simulations: PortableLedgerSnapshot['simulations'];
  redaction: PortableLedgerSnapshot['redaction'];
}

export function buildDigestPayload(snapshot: PortableLedgerSnapshot): DigestPayload {
  return {
    formatKind: snapshot.formatKind,
    schemaVersion: snapshot.schemaVersion,
    snapshotId: snapshot.snapshotId,
    network: snapshot.network,
    ledger: snapshot.ledger,
    accounts: sortAccounts(snapshot.accounts),
    ledgerEntries: sortLedgerEntries(snapshot.ledgerEntries),
    contractStorage: [...snapshot.contractStorage].sort((a, b) => {
      const contractCmp = a.contractId.localeCompare(b.contractId);
      if (contractCmp !== 0) return contractCmp;
      return a.keyXdr.localeCompare(b.keyXdr);
    }),
    simulations: [...snapshot.simulations].sort((a, b) => a.requestDigest.localeCompare(b.requestDigest)),
    redaction: snapshot.redaction,
  };
}

export async function computeSnapshotDigest(snapshot: PortableLedgerSnapshot): Promise<string> {
  const payload = buildDigestPayload(snapshot);
  return sha256Hex(stableCanonicalJson(payload));
}

export async function verifySnapshotDigest(snapshot: PortableLedgerSnapshot): Promise<boolean> {
  const expected = await computeSnapshotDigest(snapshot);
  return expected === snapshot.integrity.contentDigest;
}

export function computeRequestDigest(requestCanonical: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < requestCanonical.length; i += 1) {
    hash ^= requestCanonical.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(16, '0');
}

export function normalizeSimulationResponse(response: unknown): string {
  return stableCanonicalJson(response);
}

export function normalizeSimulationRequest(request: unknown): string {
  return stableCanonicalJson(request);
}

export function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function estimateSnapshotSize(snapshot: PortableLedgerSnapshot): number {
  return byteLength(stableCanonicalJson(snapshot));
}
