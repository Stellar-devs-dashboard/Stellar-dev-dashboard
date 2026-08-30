/**
 * Transaction packing by operation limits, dependencies, and sequence constraints.
 */

import type {
  BulkExecutionPlan,
  BulkManifest,
  BulkOperationSpec,
  BulkTransactionPack,
} from '../../types/bulkOperationsPlanner';
import { BULK_MANIFEST_SCHEMA_VERSION } from '../../types/bulkOperationsPlanner';
import { checksumValue, stableCanonicalJson } from './canonicalize';
import {
  addSequenceDependencies,
  areDependenciesSatisfied,
  buildDependencyGraph,
  topologicalSort,
} from './dependencyGraph';

const DEFAULT_MAX_OPS = 100;
const BASE_FEE_STROOPS = 100;
const ESTIMATED_OP_BYTES = 180;

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export interface PackingOptions {
  maxOperationsPerPack?: number;
  feeMultiplier?: number;
  groupBySourceAccount?: boolean;
  respectDependencies?: boolean;
}

export function estimatePackFee(operationCount: number, feeMultiplier = 1): number {
  return BASE_FEE_STROOPS * operationCount * feeMultiplier;
}

export function estimatePackSizeBytes(operationCount: number): number {
  return operationCount * ESTIMATED_OP_BYTES + 120;
}

export function packOperationsIntoTransactions(
  manifest: BulkManifest,
  orderedIds: string[],
  operationsById: Map<string, BulkOperationSpec>,
  options: PackingOptions = {}
): BulkTransactionPack[] {
  const maxOps = options.maxOperationsPerPack ?? DEFAULT_MAX_OPS;
  const feeMultiplier = options.feeMultiplier ?? 1;
  const groupByAccount = options.groupBySourceAccount ?? true;
  const respectDependencies = options.respectDependencies ?? true;

  const packs: BulkTransactionPack[] = [];
  const completedInPlan = new Set<string>();
  const graph = buildDependencyGraph(manifest.operations, manifest.edges);

  let currentPack: BulkTransactionPack | null = null;
  let packIndex = 0;

  const startNewPack = (sequenceAccount: string) => {
    packIndex += 1;
    currentPack = {
      id: `${manifest.id}-pack-${packIndex}`,
      sequenceAccount,
      operationIds: [],
      estimatedFeeStroops: 0,
      estimatedSizeBytes: 120,
      dependsOnPackIds: packs.length > 0 ? [packs[packs.length - 1].id] : [],
    };
    packs.push(currentPack);
  };

  for (const opId of orderedIds) {
    const op = operationsById.get(opId);
    if (!op) continue;

    if (respectDependencies && !areDependenciesSatisfied(graph, opId, completedInPlan)) {
      continue;
    }

    const needsNewPack =
      !currentPack ||
      currentPack.operationIds.length >= maxOps ||
      (groupByAccount && currentPack.sequenceAccount !== op.sourceAccount);

    if (needsNewPack) {
      startNewPack(op.sourceAccount);
    }

    currentPack!.operationIds.push(opId);
    currentPack!.estimatedFeeStroops = estimatePackFee(currentPack!.operationIds.length, feeMultiplier);
    currentPack!.estimatedSizeBytes = estimatePackSizeBytes(currentPack!.operationIds.length);
    completedInPlan.add(opId);
  }

  return packs;
}

export async function buildExecutionPlan(
  manifest: BulkManifest,
  sequenceByAccount: Record<string, number> = {},
  options: PackingOptions = {}
): Promise<BulkExecutionPlan> {
  const sequenceEdges = addSequenceDependencies(manifest.operations, sequenceByAccount);
  const mergedEdges = [...manifest.edges, ...sequenceEdges];
  const graph = buildDependencyGraph(manifest.operations, mergedEdges);
  const orderedOperationIds = topologicalSort(graph);
  const operationsById = new Map(manifest.operations.map((op) => [op.id, op]));

  const sortedByPriority = [...manifest.operations].sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority;
    return orderedOperationIds.indexOf(a.id) - orderedOperationIds.indexOf(b.id);
  });

  const priorityOrderedIds = sortedByPriority.map((op) => op.id);
  const finalOrder = orderedOperationIds.filter((id) => priorityOrderedIds.includes(id));

  const packs = packOperationsIntoTransactions(manifest, finalOrder, operationsById, options);
  const warnings: string[] = [];

  if (packs.length > 1) {
    warnings.push(`Plan split into ${packs.length} transaction pack(s) due to limits and dependencies`);
  }

  const accounts = new Set(manifest.operations.map((op) => op.sourceAccount));
  for (const account of accounts) {
    if (sequenceByAccount[account] === undefined) {
      warnings.push(`Sequence number not provided for ${account.slice(0, 8)}… — planner assumes sequential submission`);
    }
  }

  const planBody = {
    manifestId: manifest.id,
    orderedOperationIds: finalOrder,
    packs,
  };

  const checksum = await checksumValue(planBody);

  return {
    manifestId: manifest.id,
    planId: fnv1a(stableCanonicalJson(planBody)),
    createdAt: new Date().toISOString(),
    orderedOperationIds: finalOrder,
    packs,
    totalOperations: manifest.operations.length,
    totalPacks: packs.length,
    estimatedFeeStroops: packs.reduce((sum, pack) => sum + pack.estimatedFeeStroops, 0),
    warnings,
    checksum,
  };
}

export function summarizePlan(plan: BulkExecutionPlan): string {
  return `${plan.totalOperations} operations in ${plan.totalPacks} pack(s), ~${plan.estimatedFeeStroops} stroops`;
}

export function findPackForOperation(plan: BulkExecutionPlan, operationId: string): BulkTransactionPack | undefined {
  return plan.packs.find((pack) => pack.operationIds.includes(operationId));
}

export function packProgress(plan: BulkExecutionPlan, completedOperationIds: Set<string>): number {
  if (plan.totalOperations === 0) return 100;
  const completed = plan.orderedOperationIds.filter((id) => completedOperationIds.has(id)).length;
  return Math.round((completed / plan.totalOperations) * 100);
}

export function validatePlanAgainstManifest(plan: BulkExecutionPlan, manifest: BulkManifest): string[] {
  const errors: string[] = [];
  const manifestIds = new Set(manifest.operations.map((op) => op.id));
  const plannedIds = new Set(plan.orderedOperationIds);

  for (const id of manifestIds) {
    if (!plannedIds.has(id)) errors.push(`Operation ${id} missing from plan order`);
  }

  for (const id of plannedIds) {
    if (!manifestIds.has(id)) errors.push(`Plan references unknown operation ${id}`);
  }

  if (manifest.schemaVersion !== BULK_MANIFEST_SCHEMA_VERSION) {
    errors.push(`Unsupported manifest schema version ${manifest.schemaVersion}`);
  }

  return errors;
}

export function rebalancePacks(packs: BulkTransactionPack[], maxOps: number): BulkTransactionPack[] {
  const allOperationIds = packs.flatMap((pack) => pack.operationIds);
  const rebalanced: BulkTransactionPack[] = [];

  for (let i = 0; i < allOperationIds.length; i += maxOps) {
    const slice = allOperationIds.slice(i, i + maxOps);
    rebalanced.push({
      id: `rebalanced-pack-${rebalanced.length + 1}`,
      sequenceAccount: packs[0]?.sequenceAccount ?? '',
      operationIds: slice,
      estimatedFeeStroops: estimatePackFee(slice.length),
      estimatedSizeBytes: estimatePackSizeBytes(slice.length),
      dependsOnPackIds: rebalanced.length > 0 ? [rebalanced[rebalanced.length - 1].id] : [],
    });
  }

  return rebalanced;
}

export function computePackDependencies(packs: BulkTransactionPack[]): Map<string, string[]> {
  const deps = new Map<string, string[]>();
  for (const pack of packs) {
    deps.set(pack.id, [...pack.dependsOnPackIds]);
  }
  return deps;
}

export function nextPack(plan: BulkExecutionPlan, currentPackIndex: number): BulkTransactionPack | undefined {
  return plan.packs[currentPackIndex];
}

export function operationsInPack(plan: BulkExecutionPlan, packId: string): string[] {
  const pack = plan.packs.find((p) => p.id === packId);
  return pack ? [...pack.operationIds] : [];
}
