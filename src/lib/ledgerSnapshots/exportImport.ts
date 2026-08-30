/**
 * Safe import/export of portable ledger snapshots and sanitized bundles.
 */

import type {
  PortableLedgerSnapshot,
  SnapshotExportEnvelope,
  SnapshotImportFailure,
  SnapshotImportOutcome,
  SnapshotLibraryRecord,
} from '../../types/ledgerSnapshots';
import {
  LEDGER_SNAPSHOT_FORMAT_KIND,
  LEDGER_SNAPSHOT_SCHEMA_VERSION,
} from '../../types/ledgerSnapshots';
import { computeSnapshotDigest, stableCanonicalJson } from './canonicalize';
import { wrapCompressedJson, unwrapCompressedJson, type CompressedEnvelope } from './compression';
import { redactSnapshot, buildSanitizedExportLabel } from './redaction';
import { migrateSnapshot, validateSnapshotIntegrity, validateSnapshotStructure, parseSnapshotJson } from './schema';
import { buildLibraryRecord } from './repository';

export interface ExportOptions {
  sanitized?: boolean;
  compress?: boolean;
  redactionLevel?: 'none' | 'standard' | 'strict';
}

export async function exportSnapshotEnvelope(
  snapshot: PortableLedgerSnapshot,
  options: ExportOptions = {}
): Promise<SnapshotExportEnvelope> {
  let payload = snapshot;
  if (options.sanitized || options.redactionLevel) {
    const { snapshot: redacted } = redactSnapshot(snapshot, {
      level: options.redactionLevel ?? 'standard',
    });
    payload = redacted;
  }

  return {
    formatKind: LEDGER_SNAPSHOT_FORMAT_KIND,
    schemaVersion: LEDGER_SNAPSHOT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    sanitized: Boolean(options.sanitized || options.redactionLevel),
    snapshot: payload,
  };
}

export async function exportSnapshotJson(
  snapshot: PortableLedgerSnapshot,
  options: ExportOptions = {}
): Promise<string> {
  const envelope = await exportSnapshotEnvelope(snapshot, options);
  return JSON.stringify(envelope, null, 2);
}

export async function exportSnapshotCompressed(
  snapshot: PortableLedgerSnapshot,
  options: ExportOptions = {}
): Promise<CompressedEnvelope> {
  const json = await exportSnapshotJson(snapshot, options);
  return wrapCompressedJson(json);
}

export function downloadSnapshotFile(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function buildExportFilename(snapshot: PortableLedgerSnapshot, sanitized: boolean): string {
  const label = buildSanitizedExportLabel(snapshot.label);
  const suffix = sanitized ? '-sanitized' : '';
  return `ledger-snapshot-${label}${suffix}-${snapshot.snapshotId.slice(0, 8)}.json`;
}

export async function importSnapshotFromJson(text: string): Promise<SnapshotImportOutcome> {
  let parsed: ReturnType<typeof parseSnapshotJson>;
  try {
    parsed = parseSnapshotJson(text);
  } catch (error) {
    return { ok: false, code: 'corrupt', message: (error as Error).message };
  }
  if (parsed.ok === false) {
    return { ok: false, code: 'corrupt', message: parsed.error };
  }

  const structural = validateSnapshotStructure(parsed.snapshot);
  if (!structural.valid) {
    const firstError = structural.issues.find((i) => i.severity === 'error');
    return {
      ok: false,
      code: 'validation_error',
      message: firstError?.message ?? 'Snapshot validation failed.',
    };
  }

  const validation = await validateSnapshotIntegrity(parsed.snapshot);
  if (!validation.valid) {
    const firstError = validation.issues.find((i) => i.severity === 'error');
    const isIntegrity = firstError?.path === 'integrity.contentDigest';
    return {
      ok: false,
      code: isIntegrity ? 'integrity_mismatch' : 'validation_error',
      message: firstError?.message ?? 'Snapshot validation failed.',
    };
  }

  const record = buildLibraryRecord(parsed.snapshot);
  return {
    ok: true,
    record,
    migratedFromVersion: parsed.migratedFromVersion,
  };
}

export async function importSnapshotFromEnvelope(
  envelope: unknown
): Promise<SnapshotImportOutcome> {
  if (!envelope || typeof envelope !== 'object') {
    return { ok: false, code: 'corrupt', message: 'Import envelope must be an object.' };
  }

  const candidate = envelope as Partial<SnapshotExportEnvelope>;
  if (candidate.formatKind && candidate.formatKind !== LEDGER_SNAPSHOT_FORMAT_KIND) {
    return { ok: false, code: 'corrupt', message: `Unknown format kind: ${candidate.formatKind}` };
  }

  if (!candidate.snapshot) {
    return importSnapshotFromJson(stableCanonicalJson(envelope));
  }

  return importSnapshotFromJson(stableCanonicalJson(candidate.snapshot));
}

export async function importCompressedSnapshot(
  compressed: CompressedEnvelope
): Promise<SnapshotImportOutcome> {
  try {
    const json = await unwrapCompressedJson(compressed);
    return importSnapshotFromJson(json);
  } catch (error) {
    return { ok: false, code: 'corrupt', message: (error as Error).message };
  }
}

export async function readSnapshotFile(file: File): Promise<SnapshotImportOutcome> {
  try {
    const text = await file.text();
    const parsed = JSON.parse(text) as unknown;

    if (parsed && typeof parsed === 'object' && 'payloadBase64' in parsed) {
      return importCompressedSnapshot(parsed as CompressedEnvelope);
    }

    if (parsed && typeof parsed === 'object' && 'snapshot' in parsed) {
      return importSnapshotFromEnvelope(parsed);
    }

    return importSnapshotFromJson(text);
  } catch (error) {
    return { ok: false, code: 'corrupt', message: (error as Error).message };
  }
}

export async function rebuildSnapshotDigest(
  snapshot: PortableLedgerSnapshot
): Promise<PortableLedgerSnapshot> {
  const digest = await computeSnapshotDigest(snapshot);
  return {
    ...snapshot,
    integrity: {
      ...snapshot.integrity,
      contentDigest: digest,
    },
  };
}

export function failureMessage(failure: SnapshotImportFailure): string {
  switch (failure.code) {
    case 'corrupt':
      return `Archive is corrupt or unreadable: ${failure.message}`;
    case 'unsupported_version':
      return `Unsupported snapshot version: ${failure.message}`;
    case 'integrity_mismatch':
      return `Integrity check failed: ${failure.message}`;
    case 'validation_error':
      return `Validation failed: ${failure.message}`;
    default:
      return failure.message;
  }
}

export async function exportSanitizedBundle(
  records: SnapshotLibraryRecord[]
): Promise<string> {
  const bundles = await Promise.all(
    records.map(async (record) => exportSnapshotEnvelope(record.snapshot, { sanitized: true }))
  );
  return JSON.stringify(
    {
      formatKind: 'stellar-dev-dashboard/snapshot-bundle',
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      count: bundles.length,
      snapshots: bundles,
    },
    null,
    2
  );
}

export async function importSanitizedBundle(text: string): Promise<{
  ok: true;
  records: SnapshotLibraryRecord[];
} | SnapshotImportFailure> {
  try {
    const parsed = JSON.parse(text) as {
      snapshots?: SnapshotExportEnvelope[];
    };
    if (!parsed.snapshots?.length) {
      return { ok: false, code: 'corrupt', message: 'Bundle contains no snapshots.' };
    }

    const records: SnapshotLibraryRecord[] = [];
    for (const envelope of parsed.snapshots) {
      const result = await importSnapshotFromEnvelope(envelope);
      if (result.ok === false) {
        return { ok: false, code: result.code, message: failureMessage(result) };
      }
      records.push(result.record);
    }

    return { ok: true, records };
  } catch (error) {
    return { ok: false, code: 'corrupt', message: (error as Error).message };
  }
}

export function migrateSnapshotRecord(record: SnapshotLibraryRecord): SnapshotLibraryRecord {
  const migrated = migrateSnapshot(record.snapshot);
  if (!migrated.ok) return record;
  return {
    ...record,
    snapshot: migrated.snapshot,
    updatedAt: Date.now(),
  };
}
