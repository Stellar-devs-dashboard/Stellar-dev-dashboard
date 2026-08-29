/**
 * Export and import envelopes for manifests, plans, checkpoints, and receipts.
 */

import type {
  BulkExecutionPlan,
  BulkExportEnvelope,
  BulkManifest,
  BulkRunCheckpoint,
  BulkRunReceipt,
} from '../../types/bulkOperationsPlanner';
import {
  BULK_MANIFEST_FORMAT_KIND,
  BULK_MANIFEST_SCHEMA_VERSION,
} from '../../types/bulkOperationsPlanner';
import { checksumValue } from './canonicalize';
import { BulkPlannerError } from './errors';
import { redactManifestForExport } from './redaction';

export async function exportManifestJson(manifest: BulkManifest, redact = true): Promise<string> {
  const payload = redact ? redactManifestForExport(manifest) : manifest;
  const envelope: BulkExportEnvelope = {
    formatKind: BULK_MANIFEST_FORMAT_KIND,
    schemaVersion: BULK_MANIFEST_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    manifest: payload,
  };
  return JSON.stringify(envelope, null, 2);
}

export async function exportRunBundle(
  manifest: BulkManifest,
  plan: BulkExecutionPlan,
  checkpoint: BulkRunCheckpoint,
  receipt?: BulkRunReceipt,
  redact = true
): Promise<string> {
  const envelope: BulkExportEnvelope = {
    formatKind: BULK_MANIFEST_FORMAT_KIND,
    schemaVersion: BULK_MANIFEST_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    manifest: redact ? redactManifestForExport(manifest) : manifest,
    plan,
    checkpoint,
    receipt,
  };
  return JSON.stringify(envelope, null, 2);
}

export function exportReconciliationCsv(rows: Array<Record<string, string | number | undefined>>): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escape = (value: unknown) => {
    const text = value == null ? '' : String(value);
    if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  };
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((header) => escape(row[header])).join(','));
  }
  return lines.join('\n');
}

export async function parseExportEnvelope(text: string): Promise<BulkExportEnvelope> {
  let parsed: BulkExportEnvelope;
  try {
    parsed = JSON.parse(text) as BulkExportEnvelope;
  } catch {
    throw new BulkPlannerError('IMPORT_FAILED', 'Export file is not valid JSON');
  }

  if (parsed.formatKind !== BULK_MANIFEST_FORMAT_KIND) {
    throw new BulkPlannerError('SCHEMA_MISMATCH', `Unexpected format kind: ${parsed.formatKind}`);
  }

  if (parsed.schemaVersion !== BULK_MANIFEST_SCHEMA_VERSION) {
    throw new BulkPlannerError('SCHEMA_MISMATCH', `Unsupported schema version ${parsed.schemaVersion}`);
  }

  if (!parsed.manifest?.operations) {
    throw new BulkPlannerError('IMPORT_FAILED', 'Export envelope missing manifest operations');
  }

  return parsed;
}

export async function verifyManifestChecksum(manifest: BulkManifest): Promise<boolean> {
  const checksum = await checksumValue({
    schemaVersion: manifest.schemaVersion,
    formatKind: manifest.formatKind,
    id: manifest.id,
    name: manifest.name,
    description: manifest.description,
    network: manifest.network,
    sourceAccount: manifest.sourceAccount,
    operations: manifest.operations,
    edges: manifest.edges,
    tags: manifest.tags,
    createdAt: manifest.createdAt,
    updatedAt: manifest.updatedAt,
  });
  return checksum === manifest.checksum;
}

export function downloadTextFile(filename: string, content: string, mimeType = 'application/json'): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function suggestedManifestFilename(manifest: BulkManifest): string {
  const slug = manifest.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `bulk-manifest-${slug || manifest.id}.json`;
}

export function suggestedRunFilename(runId: string): string {
  return `bulk-run-${runId}.json`;
}

export function suggestedReconciliationFilename(runId: string): string {
  return `bulk-reconciliation-${runId}.csv`;
}

export async function importExportEnvelope(text: string): Promise<{
  manifest: BulkManifest;
  plan?: BulkExecutionPlan;
  checkpoint?: BulkRunCheckpoint;
  receipt?: BulkRunReceipt;
}> {
  const envelope = await parseExportEnvelope(text);
  const valid = await verifyManifestChecksum(envelope.manifest);
  if (!valid) {
    throw new BulkPlannerError('VALIDATION_FAILED', 'Manifest checksum mismatch — file may be corrupted');
  }
  return {
    manifest: envelope.manifest,
    plan: envelope.plan,
    checkpoint: envelope.checkpoint,
    receipt: envelope.receipt,
  };
}

export function envelopeSummary(envelope: BulkExportEnvelope): string {
  const parts = [
    envelope.manifest.name,
    `${envelope.manifest.operations.length} ops`,
  ];
  if (envelope.plan) parts.push(`${envelope.plan.totalPacks} packs`);
  if (envelope.checkpoint) parts.push(`run ${envelope.checkpoint.runId}`);
  return parts.join(' · ');
}
