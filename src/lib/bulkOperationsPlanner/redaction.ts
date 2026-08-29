/**
 * Privacy-safe redaction for exported manifests and diagnostic bundles.
 */

import type { BulkManifest, BulkOperationSpec } from '../../types/bulkOperationsPlanner';

const STELLAR_KEY = /G[A-Z2-7]{54,55}/g;
const SECRET_KEY = /S[A-Z2-7]{55}/g;

export function redactStellarAddress(value: string): string {
  return value.replace(STELLAR_KEY, (match) => `${match.slice(0, 4)}…${match.slice(-4)}`);
}

export function redactSecretKey(value: string): string {
  return value.replace(SECRET_KEY, 'S***REDACTED***');
}

export function redactFreeText(value: string): string {
  return redactSecretKey(redactStellarAddress(value));
}

export function redactOperationSpec(op: BulkOperationSpec): BulkOperationSpec {
  const params = { ...op.params } as Record<string, unknown>;

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') params[key] = redactFreeText(value);
    else if (value && typeof value === 'object') {
      const nested = value as Record<string, unknown>;
      for (const nestedKey of Object.keys(nested)) {
        if (typeof nested[nestedKey] === 'string') {
          nested[nestedKey] = redactFreeText(String(nested[nestedKey]));
        }
      }
      params[key] = nested;
    }
  }

  return {
    ...op,
    sourceAccount: redactStellarAddress(op.sourceAccount),
    label: redactFreeText(op.label),
    metadata: Object.fromEntries(
      Object.entries(op.metadata).map(([key, val]) => [key, redactFreeText(val)])
    ),
    params: params as BulkOperationSpec['params'],
  };
}

export function redactManifestForExport(manifest: BulkManifest): BulkManifest {
  return {
    ...manifest,
    sourceAccount: redactStellarAddress(manifest.sourceAccount),
    name: redactFreeText(manifest.name),
    description: redactFreeText(manifest.description),
    operations: manifest.operations.map(redactOperationSpec),
  };
}

export function containsSensitiveMaterial(text: string): boolean {
  SECRET_KEY.lastIndex = 0;
  return SECRET_KEY.test(text);
}

export function redactionSummary(before: BulkManifest, after: BulkManifest): {
  addressesRedacted: number;
  labelsRedacted: number;
} {
  const beforeJson = JSON.stringify(before);
  const afterJson = JSON.stringify(after);
  const addressesRedacted = (beforeJson.match(STELLAR_KEY) ?? []).length - (afterJson.match(STELLAR_KEY) ?? []).length;
  const labelsRedacted = before.operations.filter((op, index) => op.label !== after.operations[index]?.label).length;
  return { addressesRedacted: Math.max(0, addressesRedacted), labelsRedacted };
}
