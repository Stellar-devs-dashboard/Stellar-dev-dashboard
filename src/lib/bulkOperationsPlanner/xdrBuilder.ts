/**
 * Build deterministic placeholder XDR payloads from bulk operation specs.
 * Used by simulated executor and offline dry-run paths.
 */

import type { BulkManifest, BulkOperationSpec } from '../../types/bulkOperationsPlanner';
import { stableCanonicalJson } from './canonicalize';

function hashPayload(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

export function buildOperationXdrFromSpec(op: BulkOperationSpec): string {
  const body = stableCanonicalJson({
    id: op.id,
    family: op.family,
    sourceAccount: op.sourceAccount,
    params: op.params,
  });
  return `BULK-XDR-${op.family.toUpperCase()}-${hashPayload(body)}`;
}

export function buildPackXdr(manifest: BulkManifest, operationIds: string[]): string[] {
  const byId = new Map(manifest.operations.map((op) => [op.id, op]));
  return operationIds.map((id) => {
    const op = byId.get(id);
    if (!op) return `BULK-XDR-MISSING-${id}`;
    return buildOperationXdrFromSpec(op);
  });
}

export function estimateXdrSize(xdr: string): number {
  return xdr.length;
}

export function summarizeXdrBatch(xdrs: string[]): { count: number; totalBytes: number; averageBytes: number } {
  const totalBytes = xdrs.reduce((sum, xdr) => sum + estimateXdrSize(xdr), 0);
  return {
    count: xdrs.length,
    totalBytes,
    averageBytes: xdrs.length === 0 ? 0 : Math.round(totalBytes / xdrs.length),
  };
}

export function validateXdrPrefix(xdr: string): boolean {
  return xdr.startsWith('BULK-XDR-') || xdr.startsWith('SIMULATED-XDR-');
}

export function xdrLabel(xdr: string): string {
  if (xdr.length <= 16) return xdr;
  return `${xdr.slice(0, 12)}…${xdr.slice(-4)}`;
}

export async function buildOperationXdrLookup(manifest: BulkManifest): Promise<Map<string, string>> {
  const lookup = new Map<string, string>();
  for (const op of manifest.operations) {
    lookup.set(op.id, buildOperationXdrFromSpec(op));
  }
  return lookup;
}

export function compareXdrSets(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

export function operationFamilyFromXdr(xdr: string): string | undefined {
  const match = xdr.match(/^BULK-XDR-([A-Z_]+)-/);
  return match?.[1]?.toLowerCase().replace(/_/g, '');
}

export function buildFeeBumpXdr(baseXdr: string, fee: string): string {
  return `FEE-BUMP-${fee}-${hashPayload(baseXdr)}`;
}

export function serializeXdrList(xdrs: string[]): string {
  return xdrs.join('\n');
}

export function parseXdrList(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}
