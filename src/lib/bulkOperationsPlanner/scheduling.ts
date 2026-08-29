/**
 * Execution scheduling policies for bulk runs (sequential, batched, gated).
 */

import type { BulkExecutionPlan, BulkManifest, BulkOperationSpec } from '../../types/bulkOperationsPlanner';
import { areDependenciesSatisfied, buildDependencyGraph } from './dependencyGraph';

export type SchedulingPolicy = 'sequential' | 'dependency_parallel' | 'priority_first';

export interface SchedulingOptions {
  policy: SchedulingPolicy;
  maxConcurrentPacks: number;
  pauseBetweenPacksMs: number;
}

export function defaultSchedulingOptions(): SchedulingOptions {
  return {
    policy: 'sequential',
    maxConcurrentPacks: 1,
    pauseBetweenPacksMs: 0,
  };
}

export function scheduleNextOperations(
  manifest: BulkManifest,
  plan: BulkExecutionPlan,
  completed: Set<string>,
  options: SchedulingOptions = defaultSchedulingOptions()
): string[] {
  const graph = buildDependencyGraph(manifest.operations, manifest.edges);
  const ready: string[] = [];

  for (const opId of plan.orderedOperationIds) {
    if (completed.has(opId)) continue;
    if (!areDependenciesSatisfied(graph, opId, completed)) continue;
    ready.push(opId);
    if (options.policy === 'sequential') break;
    if (ready.length >= options.maxConcurrentPacks) break;
  }

  if (options.policy === 'priority_first') {
    const byId = new Map(manifest.operations.map((op) => [op.id, op]));
    ready.sort((a, b) => (byId.get(b)?.priority ?? 0) - (byId.get(a)?.priority ?? 0));
  }

  return ready;
}

export function estimateScheduleDuration(
  manifest: BulkManifest,
  plan: BulkExecutionPlan,
  averageOperationMs = 500
): number {
  const complexity = manifest.operations.reduce((sum, op) => sum + (op.timeoutMs > 10_000 ? 2 : 1), 0);
  return complexity * averageOperationMs + plan.totalPacks * 200;
}

export function buildScheduleTimeline(
  manifest: BulkManifest,
  plan: BulkExecutionPlan
): Array<{ operationId: string; startOffsetMs: number; durationMs: number }> {
  const timeline: Array<{ operationId: string; startOffsetMs: number; durationMs: number }> = [];
  let cursor = 0;

  for (const opId of plan.orderedOperationIds) {
    const op = manifest.operations.find((item) => item.id === opId);
    const durationMs = op ? Math.min(op.timeoutMs, 5_000) : 1_000;
    timeline.push({ operationId: opId, startOffsetMs: cursor, durationMs });
    cursor += durationMs + 100;
  }

  return timeline;
}

export function groupOperationsByAccount(operations: BulkOperationSpec[]): Map<string, BulkOperationSpec[]> {
  const grouped = new Map<string, BulkOperationSpec[]>();
  for (const op of operations) {
    const list = grouped.get(op.sourceAccount) ?? [];
    list.push(op);
    grouped.set(op.sourceAccount, list);
  }
  return grouped;
}

export function schedulePacksWithDelay(plan: BulkExecutionPlan, delayMs: number): Array<{ packId: string; startAtMs: number }> {
  return plan.packs.map((pack, index) => ({
    packId: pack.id,
    startAtMs: index * delayMs,
  }));
}

export function canStartPack(
  plan: BulkExecutionPlan,
  packIndex: number,
  completedPackIndexes: Set<number>
): boolean {
  if (packIndex === 0) return true;
  return completedPackIndexes.has(packIndex - 1);
}

export function nextRunnablePackIndex(plan: BulkExecutionPlan, completedPackIndexes: Set<number>): number | null {
  for (let i = 0; i < plan.packs.length; i += 1) {
    if (completedPackIndexes.has(i)) continue;
    if (canStartPack(plan, i, completedPackIndexes)) return i;
  }
  return null;
}

export function describeSchedulePolicy(options: SchedulingOptions): string {
  switch (options.policy) {
    case 'sequential':
      return 'Sequential — one operation batch at a time';
    case 'dependency_parallel':
      return `Dependency-aware parallel — up to ${options.maxConcurrentPacks} packs`;
    case 'priority_first':
      return 'Priority-first — higher priority operations scheduled earlier';
    default:
      return options.policy;
  }
}
