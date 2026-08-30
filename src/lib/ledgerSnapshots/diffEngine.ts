/**
 * Ledger entry diff engine for snapshot inspection and comparison.
 */

import type {
  LedgerEntryDiff,
  LedgerEntryRecord,
  PortableLedgerSnapshot,
  SnapshotComparisonResult,
} from '../../types/ledgerSnapshots';

function truncateXdr(value: string, max = 48): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max / 2)}…${value.slice(-max / 2)}`;
}

export function diffLedgerEntries(before: LedgerEntryRecord, after: LedgerEntryRecord): LedgerEntryDiff[] {
  const diffs: LedgerEntryDiff[] = [];

  if (before.kind !== after.kind) {
    diffs.push({
      entryId: before.id,
      kind: before.kind,
      key: before.key,
      field: 'kind',
      before: before.kind,
      after: after.kind,
      severity: 'critical',
    });
  }

  if (before.valueXdr !== after.valueXdr) {
    diffs.push({
      entryId: before.id,
      kind: before.kind,
      key: before.key,
      field: 'valueXdr',
      before: truncateXdr(before.valueXdr),
      after: truncateXdr(after.valueXdr),
      severity: 'warning',
    });
  }

  if (before.lastModifiedLedgerSeq !== after.lastModifiedLedgerSeq) {
    diffs.push({
      entryId: before.id,
      kind: before.kind,
      key: before.key,
      field: 'lastModifiedLedgerSeq',
      before: String(before.lastModifiedLedgerSeq ?? ''),
      after: String(after.lastModifiedLedgerSeq ?? ''),
      severity: 'info',
    });
  }

  if (before.liveUntilLedgerSeq !== after.liveUntilLedgerSeq) {
    diffs.push({
      entryId: before.id,
      kind: before.kind,
      key: before.key,
      field: 'liveUntilLedgerSeq',
      before: String(before.liveUntilLedgerSeq ?? ''),
      after: String(after.liveUntilLedgerSeq ?? ''),
      severity: 'info',
    });
  }

  return diffs;
}

export function diffSnapshots(
  left: PortableLedgerSnapshot,
  right: PortableLedgerSnapshot
): LedgerEntryDiff[] {
  const leftMap = new Map(left.ledgerEntries.map((e) => [e.id, e]));
  const diffs: LedgerEntryDiff[] = [];

  for (const entry of right.ledgerEntries) {
    const before = leftMap.get(entry.id);
    if (!before) {
      diffs.push({
        entryId: entry.id,
        kind: entry.kind,
        key: entry.key,
        field: 'presence',
        before: '(missing)',
        after: '(added)',
        severity: 'warning',
      });
      continue;
    }
    diffs.push(...diffLedgerEntries(before, entry));
  }

  for (const entry of left.ledgerEntries) {
    if (!right.ledgerEntries.some((e) => e.id === entry.id)) {
      diffs.push({
        entryId: entry.id,
        kind: entry.kind,
        key: entry.key,
        field: 'presence',
        before: '(present)',
        after: '(removed)',
        severity: 'warning',
      });
    }
  }

  return diffs.sort((a, b) => {
    const sev = { critical: 0, warning: 1, info: 2 };
    const sevCmp = sev[a.severity] - sev[b.severity];
    if (sevCmp !== 0) return sevCmp;
    return a.entryId.localeCompare(b.entryId);
  });
}

export function summarizeComparison(comparison: SnapshotComparisonResult): string {
  const parts = [
    `${comparison.addedEntries.length} added`,
    `${comparison.removedEntries.length} removed`,
    `${comparison.changedEntries.length} changed`,
    `${comparison.accountSequenceChanges.length} sequence changes`,
    `${comparison.simulationChanges.filter((s) => s.changed).length} simulation changes`,
  ];
  return parts.join(', ');
}

export function groupDiffsByKind(diffs: LedgerEntryDiff[]): Map<string, LedgerEntryDiff[]> {
  const groups = new Map<string, LedgerEntryDiff[]>();
  for (const diff of diffs) {
    const list = groups.get(diff.kind) ?? [];
    list.push(diff);
    groups.set(diff.kind, list);
  }
  return groups;
}

export function filterDiffsBySeverity(
  diffs: LedgerEntryDiff[],
  minSeverity: LedgerEntryDiff['severity']
): LedgerEntryDiff[] {
  const order = { critical: 0, warning: 1, info: 2 };
  const threshold = order[minSeverity];
  return diffs.filter((d) => order[d.severity] <= threshold);
}

export function inspectSnapshotEntries(snapshot: PortableLedgerSnapshot): {
  byKind: Record<string, number>;
  totalEntries: number;
  accountCount: number;
  contractStorageCount: number;
  simulationCount: number;
} {
  const byKind: Record<string, number> = {};
  for (const entry of snapshot.ledgerEntries) {
    byKind[entry.kind] = (byKind[entry.kind] ?? 0) + 1;
  }
  return {
    byKind,
    totalEntries: snapshot.ledgerEntries.length,
    accountCount: snapshot.accounts.length,
    contractStorageCount: snapshot.contractStorage.length,
    simulationCount: snapshot.simulations.length,
  };
}

export function findMissingEntryReferences(snapshot: PortableLedgerSnapshot): string[] {
  const accountIds = new Set(snapshot.accounts.map((a) => a.accountId));
  const missing: string[] = [];

  for (const entry of snapshot.ledgerEntries) {
    if (entry.accountId && !accountIds.has(entry.accountId)) {
      missing.push(`Entry ${entry.id} references missing account ${entry.accountId}`);
    }
  }

  return missing;
}
