/**
 * Manifest construction, planning orchestration, and dry-run simulation.
 */

import type {
  BulkDryRunResult,
  BulkExecutionPlan,
  BulkManifest,
  BulkOperationSpec,
  BulkPlannerPreferences,
  BulkValidationReport,
} from '../../types/bulkOperationsPlanner';
import {
  BULK_MANIFEST_FORMAT_KIND,
  BULK_MANIFEST_SCHEMA_VERSION,
} from '../../types/bulkOperationsPlanner';
import { checksumValue } from './canonicalize';
import { BulkPlannerError } from './errors';
import { buildExecutionPlan } from './packing';
import { validateManifestOperations } from './validation';

export interface PlanManifestResult {
  manifest: BulkManifest;
  validation: BulkValidationReport;
  plan: BulkExecutionPlan;
}

export async function buildManifest(input: {
  id: string;
  name: string;
  description?: string;
  network: string;
  sourceAccount: string;
  operations: BulkOperationSpec[];
  edges?: BulkManifest['edges'];
  tags?: string[];
}): Promise<BulkManifest> {
  const now = new Date().toISOString();
  const body = {
    schemaVersion: BULK_MANIFEST_SCHEMA_VERSION,
    formatKind: BULK_MANIFEST_FORMAT_KIND,
    id: input.id,
    name: input.name,
    description: input.description ?? '',
    network: input.network,
    sourceAccount: input.sourceAccount,
    operations: input.operations,
    edges: input.edges ?? [],
    tags: input.tags ?? [],
    createdAt: now,
    updatedAt: now,
  };

  const checksum = await checksumValue({
    ...body,
    checksum: undefined,
  });

  return { ...body, checksum };
}

export async function planManifest(
  manifest: BulkManifest,
  sequenceByAccount: Record<string, number> = {},
  preferences: Partial<BulkPlannerPreferences> = {}
): Promise<PlanManifestResult> {
  const validation = validateManifestOperations(manifest.operations, manifest.edges);
  if (!validation.valid) {
    throw new BulkPlannerError('VALIDATION_FAILED', 'Manifest validation failed', {
      issues: validation.issues,
    });
  }

  const plan = await buildExecutionPlan(manifest, sequenceByAccount, {
    maxOperationsPerPack: preferences.maxOperationsPerTransaction,
    feeMultiplier: preferences.feeMultiplier,
  });

  return { manifest, validation, plan };
}

export function dryRunPlan(
  manifest: BulkManifest,
  plan: BulkExecutionPlan
): BulkDryRunResult {
  const validation = validateManifestOperations(manifest.operations, manifest.edges);
  const simulatedOutcomes = plan.orderedOperationIds.map((operationId) => {
    const op = manifest.operations.find((item) => item.id === operationId);
    if (!op) {
      return { operationId, wouldSucceed: false, reason: 'Operation missing from manifest' };
    }
    if (op.requiresApproval) {
      return { operationId, wouldSucceed: false, reason: 'Requires approval' };
    }
    return { operationId, wouldSucceed: true };
  });

  return { plan, validation, simulatedOutcomes };
}

export async function cloneManifest(manifest: BulkManifest, overrides: Partial<BulkManifest> = {}): Promise<BulkManifest> {
  const clonedOps = manifest.operations.map((op) => ({
    ...op,
    params: { ...op.params },
    dependencies: [...op.dependencies],
    tags: [...op.tags],
    metadata: { ...op.metadata },
    updatedAt: new Date().toISOString(),
  }));

  return buildManifest({
    id: overrides.id ?? `${manifest.id}-copy`,
    name: overrides.name ?? `${manifest.name} (copy)`,
    description: overrides.description ?? manifest.description,
    network: overrides.network ?? manifest.network,
    sourceAccount: overrides.sourceAccount ?? manifest.sourceAccount,
    operations: overrides.operations ?? clonedOps,
    edges: overrides.edges ?? manifest.edges,
    tags: overrides.tags ?? manifest.tags,
  });
}

export function updateManifestOperations(
  manifest: BulkManifest,
  operations: BulkOperationSpec[]
): BulkManifest {
  return {
    ...manifest,
    operations,
    updatedAt: new Date().toISOString(),
  };
}

export function appendOperation(manifest: BulkManifest, operation: BulkOperationSpec): BulkManifest {
  return updateManifestOperations(manifest, [...manifest.operations, operation]);
}

export function removeOperation(manifest: BulkManifest, operationId: string): BulkManifest {
  const operations = manifest.operations.filter((op) => op.id !== operationId);
  const edges = manifest.edges.filter((edge) => edge.fromId !== operationId && edge.toId !== operationId);
  return {
    ...updateManifestOperations(manifest, operations),
    edges,
  };
}

export function describeManifest(manifest: BulkManifest): string {
  return `${manifest.name}: ${manifest.operations.length} operation(s) on ${manifest.network}`;
}

export function manifestStats(manifest: BulkManifest): {
  operationCount: number;
  familyCounts: Record<string, number>;
  taggedCount: number;
  approvalRequiredCount: number;
} {
  const familyCounts: Record<string, number> = {};
  let taggedCount = 0;
  let approvalRequiredCount = 0;

  for (const op of manifest.operations) {
    familyCounts[op.family] = (familyCounts[op.family] ?? 0) + 1;
    if (op.tags.length > 0) taggedCount += 1;
    if (op.requiresApproval) approvalRequiredCount += 1;
  }

  return {
    operationCount: manifest.operations.length,
    familyCounts,
    taggedCount,
    approvalRequiredCount,
  };
}

export function filterManifestByTag(manifest: BulkManifest, tag: string): BulkManifest {
  return updateManifestOperations(
    manifest,
    manifest.operations.filter((op) => op.tags.includes(tag))
  );
}

export async function refreshManifestChecksum(manifest: BulkManifest): Promise<BulkManifest> {
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
  return { ...manifest, checksum, updatedAt: new Date().toISOString() };
}

export function compareManifestOperations(a: BulkManifest, b: BulkManifest): string[] {
  const diffs: string[] = [];
  if (a.operations.length !== b.operations.length) {
    diffs.push(`Operation count changed: ${a.operations.length} -> ${b.operations.length}`);
  }

  const bById = new Map(b.operations.map((op) => [op.id, op]));
  for (const op of a.operations) {
    const other = bById.get(op.id);
    if (!other) {
      diffs.push(`Removed operation ${op.id}`);
      continue;
    }
    if (op.family !== other.family) diffs.push(`${op.id}: family ${op.family} -> ${other.family}`);
    if (op.sourceAccount !== other.sourceAccount) diffs.push(`${op.id}: source account changed`);
  }

  for (const op of b.operations) {
    if (!a.operations.find((item) => item.id === op.id)) {
      diffs.push(`Added operation ${op.id}`);
    }
  }

  return diffs;
}

export function defaultPlannerPreferences(): BulkPlannerPreferences {
  return {
    maxOperationsPerTransaction: 100,
    defaultMaxRetries: 3,
    defaultTimeoutMs: 30_000,
    autoPauseOnFailure: true,
    requireApprovalBeforeSubmit: false,
    simulatedMode: true,
    concurrency: 1,
    feeMultiplier: 1,
  };
}

export function mergePreferences(
  base: BulkPlannerPreferences,
  overrides: Partial<BulkPlannerPreferences>
): BulkPlannerPreferences {
  return { ...base, ...overrides };
}
