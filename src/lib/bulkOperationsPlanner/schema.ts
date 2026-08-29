/**
 * Manifest schema guards and structural validation for imported envelopes.
 */

import type { BulkExportEnvelope, BulkManifest, BulkOperationSpec } from '../../types/bulkOperationsPlanner';
import {
  BULK_MANIFEST_FORMAT_KIND,
  BULK_MANIFEST_SCHEMA_VERSION,
} from '../../types/bulkOperationsPlanner';
import { BulkPlannerError } from './errors';

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function assertManifestShape(raw: unknown): asserts raw is BulkManifest {
  if (!isObject(raw)) {
    throw new BulkPlannerError('SCHEMA_MISMATCH', 'Manifest must be an object');
  }

  if (raw.schemaVersion !== BULK_MANIFEST_SCHEMA_VERSION) {
    throw new BulkPlannerError('SCHEMA_MISMATCH', `Unsupported schema version ${String(raw.schemaVersion)}`);
  }

  if (raw.formatKind !== BULK_MANIFEST_FORMAT_KIND) {
    throw new BulkPlannerError('SCHEMA_MISMATCH', `Unexpected format kind ${String(raw.formatKind)}`);
  }

  if (!isNonEmptyString(raw.id) || !isNonEmptyString(raw.name) || !isNonEmptyString(raw.network)) {
    throw new BulkPlannerError('SCHEMA_MISMATCH', 'Manifest missing required identifiers');
  }

  if (!Array.isArray(raw.operations)) {
    throw new BulkPlannerError('SCHEMA_MISMATCH', 'Manifest operations must be an array');
  }

  raw.operations.forEach((op, index) => assertOperationShape(op, index + 1));
}

export function assertOperationShape(raw: unknown, row = 0): asserts raw is BulkOperationSpec {
  if (!isObject(raw)) {
    throw new BulkPlannerError('SCHEMA_MISMATCH', `Operation row ${row} must be an object`);
  }

  const required = ['id', 'label', 'family', 'sourceAccount', 'params'] as const;
  for (const key of required) {
    if (!isNonEmptyString(raw[key]) && key !== 'params') {
      throw new BulkPlannerError('SCHEMA_MISMATCH', `Operation row ${row} missing ${key}`);
    }
  }

  if (!isObject(raw.params)) {
    throw new BulkPlannerError('SCHEMA_MISMATCH', `Operation row ${row} params must be an object`);
  }

  if (raw.dependencies !== undefined && !Array.isArray(raw.dependencies)) {
    throw new BulkPlannerError('SCHEMA_MISMATCH', `Operation row ${row} dependencies must be an array`);
  }

  if (raw.tags !== undefined && !Array.isArray(raw.tags)) {
    throw new BulkPlannerError('SCHEMA_MISMATCH', `Operation row ${row} tags must be an array`);
  }
}

export function assertEnvelopeShape(raw: unknown): asserts raw is BulkExportEnvelope {
  if (!isObject(raw)) {
    throw new BulkPlannerError('SCHEMA_MISMATCH', 'Export envelope must be an object');
  }

  if (raw.formatKind !== BULK_MANIFEST_FORMAT_KIND) {
    throw new BulkPlannerError('SCHEMA_MISMATCH', 'Export envelope has invalid format kind');
  }

  if (raw.schemaVersion !== BULK_MANIFEST_SCHEMA_VERSION) {
    throw new BulkPlannerError('SCHEMA_MISMATCH', 'Export envelope has invalid schema version');
  }

  assertManifestShape(raw.manifest);
}

export function coerceManifest(raw: unknown): BulkManifest {
  assertManifestShape(raw);
  return raw;
}

export function migrateManifest(raw: Record<string, unknown>): BulkManifest {
  if (raw.schemaVersion === BULK_MANIFEST_SCHEMA_VERSION) {
    assertManifestShape(raw);
    return raw;
  }

  throw new BulkPlannerError('SCHEMA_MISMATCH', `No migration path for schema version ${String(raw.schemaVersion)}`);
}

export function validateEnvelopeIntegrity(envelope: BulkExportEnvelope): string[] {
  const warnings: string[] = [];

  if (!envelope.exportedAt) warnings.push('Missing exportedAt timestamp');
  if (envelope.plan && envelope.plan.manifestId !== envelope.manifest.id) {
    warnings.push('Plan manifestId does not match envelope manifest');
  }
  if (envelope.checkpoint && envelope.checkpoint.manifestId !== envelope.manifest.id) {
    warnings.push('Checkpoint manifestId does not match envelope manifest');
  }
  if (envelope.receipt && envelope.receipt.manifestId !== envelope.manifest.id) {
    warnings.push('Receipt manifestId does not match envelope manifest');
  }

  return warnings;
}

export function summarizeSchemaVersion(manifest: BulkManifest): string {
  return `${manifest.formatKind} v${manifest.schemaVersion}`;
}

export function isSupportedManifest(manifest: BulkManifest): boolean {
  return (
    manifest.schemaVersion === BULK_MANIFEST_SCHEMA_VERSION &&
    manifest.formatKind === BULK_MANIFEST_FORMAT_KIND
  );
}

export function stripUnknownManifestFields(raw: Record<string, unknown>): BulkManifest {
  const allowed = [
    'schemaVersion',
    'formatKind',
    'id',
    'name',
    'description',
    'network',
    'sourceAccount',
    'operations',
    'edges',
    'tags',
    'createdAt',
    'updatedAt',
    'checksum',
  ] as const;

  const cleaned: Record<string, unknown> = {};
  for (const key of allowed) {
    if (raw[key] !== undefined) cleaned[key] = raw[key];
  }

  assertManifestShape(cleaned);
  return cleaned;
}
