/**
 * Checkpointed bulk executor with pause, resume, cancel, and injectable submitters.
 */

import type {
  BulkExecutionPlan,
  BulkManifest,
  BulkOperationAttempt,
  BulkOperationState,
  BulkProgressEvent,
  BulkRunCheckpoint,
  BulkRunReceipt,
  BulkRunStatus,
} from '../../types/bulkOperationsPlanner';
import { BULK_CHECKPOINT_SCHEMA_VERSION } from '../../types/bulkOperationsPlanner';
import { checksumValue } from './canonicalize';
import { areDependenciesSatisfied, buildDependencyGraph } from './dependencyGraph';
import { BulkPlannerError } from './errors';
import { evaluateRetry, sleepMs, waitForRetry } from './retryPolicy';

export interface SubmitResult {
  ok: boolean;
  txHash?: string;
  ledger?: number;
  feeCharged?: string;
  error?: string;
}

export interface BulkExecutorContext {
  manifest: BulkManifest;
  plan: BulkExecutionPlan;
  checkpoint: BulkRunCheckpoint;
}

export interface BulkExecutorHooks {
  onProgress?: (event: BulkProgressEvent) => void;
  onCheckpoint?: (checkpoint: BulkRunCheckpoint) => void;
  buildOperationXdr?: (operationId: string) => Promise<string>;
  submitPack?: (packId: string, xdrs: string[]) => Promise<SubmitResult[]>;
}

export interface BulkExecutorControl {
  pause: () => void;
  resume: () => void;
  cancel: () => void;
  isPaused: () => boolean;
  isCancelled: () => boolean;
}

function initialOperationStates(manifest: BulkManifest): BulkOperationState[] {
  return manifest.operations.map((op) => ({
    operationId: op.id,
    status: op.requiresApproval ? 'awaiting_approval' : 'planned',
    attempts: [],
    updatedAt: new Date().toISOString(),
  }));
}

export function createCheckpoint(
  runId: string,
  manifest: BulkManifest,
  plan: BulkExecutionPlan,
  sequenceNumbers: Record<string, number> = {}
): BulkRunCheckpoint {
  const now = new Date().toISOString();
  return {
    schemaVersion: BULK_CHECKPOINT_SCHEMA_VERSION,
    runId,
    manifestId: manifest.id,
    planId: plan.planId,
    status: 'idle',
    currentPackIndex: 0,
    currentOperationIndex: 0,
    operationStates: initialOperationStates(manifest),
    sequenceNumbers: { ...sequenceNumbers },
    startedAt: now,
    updatedAt: now,
  };
}

export function createSimulatedExecutor(hooks: BulkExecutorHooks = {}): BulkExecutorHooks {
  const buildOperationXdr =
    hooks.buildOperationXdr ??
    (async (operationId: string) => `SIMULATED-XDR-${operationId}`);

  const submitPack =
    hooks.submitPack ??
    (async (_packId: string, xdrs: string[]) =>
      xdrs.map(() => ({
        ok: true,
        txHash: `sim-${Math.random().toString(16).slice(2, 10)}`,
        ledger: 1_000_000 + Math.floor(Math.random() * 1000),
        feeCharged: '100',
      })));

  return { ...hooks, buildOperationXdr, submitPack };
}

function emitProgress(
  hooks: BulkExecutorHooks,
  event: Omit<BulkProgressEvent, 'timestamp'> & { timestamp?: string }
): void {
  hooks.onProgress?.({
    ...event,
    timestamp: event.timestamp ?? new Date().toISOString(),
  });
}

function updateCheckpoint(checkpoint: BulkRunCheckpoint, patch: Partial<BulkRunCheckpoint>): BulkRunCheckpoint {
  return {
    ...checkpoint,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
}

export async function runBulkExecution(
  context: BulkExecutorContext,
  hooks: BulkExecutorHooks = {}
): Promise<{ checkpoint: BulkRunCheckpoint; receipt: BulkRunReceipt; control: BulkExecutorControl }> {
  const executor = createSimulatedExecutor(hooks);
  let paused = false;
  let cancelled = false;

  const control: BulkExecutorControl = {
    pause: () => {
      paused = true;
    },
    resume: () => {
      paused = false;
    },
    cancel: () => {
      cancelled = true;
    },
    isPaused: () => paused,
    isCancelled: () => cancelled,
  };

  let working = updateCheckpoint(context.checkpoint, { status: 'running' });
  hooks.onCheckpoint?.(working);

  const operationsById = new Map(context.manifest.operations.map((op) => [op.id, op]));
  const graph = buildDependencyGraph(context.manifest.operations, context.manifest.edges);

  const stateLookup = () => new Map(working.operationStates.map((s) => [s.operationId, s]));
  let states = stateLookup();

  const completed = () => new Set(
    [...states.values()].filter((s) => s.status === 'completed').map((s) => s.operationId)
  );

  emitProgress(executor, {
    type: 'planning',
    runId: working.runId,
    message: 'Starting bulk execution',
    percentComplete: 0,
  });

  for (let packIndex = working.currentPackIndex; packIndex < context.plan.packs.length; packIndex += 1) {
    if (cancelled) {
      working = updateCheckpoint(working, { status: 'cancelled', cancelledAt: new Date().toISOString() });
      hooks.onCheckpoint?.(working);
      throw new BulkPlannerError('EXECUTION_CANCELLED', 'Bulk run cancelled by user');
    }

    while (paused) {
      working = updateCheckpoint(working, { status: 'paused', pausedAt: new Date().toISOString() });
      hooks.onCheckpoint?.(working);
      emitProgress(executor, {
        type: 'paused',
        runId: working.runId,
        message: 'Execution paused',
        percentComplete: Math.round((packIndex / context.plan.packs.length) * 100),
      });
      await sleepMs(200);
      if (cancelled) {
        throw new BulkPlannerError('EXECUTION_CANCELLED', 'Bulk run cancelled while paused');
      }
    }

    const pack = context.plan.packs[packIndex];
    emitProgress(executor, {
      type: 'pack_start',
      runId: working.runId,
      packId: pack.id,
      message: `Submitting pack ${packIndex + 1}/${context.plan.packs.length}`,
      percentComplete: Math.round((packIndex / context.plan.packs.length) * 100),
    });

    const xdrs: string[] = [];
    const packOperationIds: string[] = [];

    for (const opId of pack.operationIds) {
      const op = operationsById.get(opId);
      const state = states.get(opId);
      if (!op || !state) continue;
      if (state.status === 'completed' || state.status === 'skipped') continue;

      if (!areDependenciesSatisfied(graph, opId, completed())) {
        continue;
      }

      if (state.status === 'awaiting_approval') {
        continue;
      }

      emitProgress(executor, {
        type: 'operation_start',
        runId: working.runId,
        packId: pack.id,
        operationId: opId,
        message: `Preparing ${op.label}`,
        percentComplete: Math.round((packIndex / context.plan.packs.length) * 100),
      });

      state.status = 'signing';
      state.updatedAt = new Date().toISOString();

      const xdr = await executor.buildOperationXdr!(opId);
      xdrs.push(xdr);
      packOperationIds.push(opId);
    }

    if (xdrs.length === 0) {
      working = updateCheckpoint(working, { currentPackIndex: packIndex + 1 });
      continue;
    }

    const results = await executor.submitPack!(pack.id, xdrs);

    for (let i = 0; i < packOperationIds.length; i += 1) {
      const opId = packOperationIds[i];
      const op = operationsById.get(opId)!;
      const state = states.get(opId)!;
      const result = results[i] ?? { ok: false, error: 'Missing submit result' };

      const attempt: BulkOperationAttempt = {
        attemptNumber: state.attempts.length + 1,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        retryable: false,
      };

      if (result.ok) {
        attempt.txHash = result.txHash;
        attempt.ledger = result.ledger;
        attempt.feeCharged = result.feeCharged;
        state.status = 'completed';
        state.txHash = result.txHash;
        state.ledger = result.ledger;
        state.lastError = undefined;

        emitProgress(executor, {
          type: 'operation_complete',
          runId: working.runId,
          packId: pack.id,
          operationId: opId,
          message: `Completed ${op.label}`,
          percentComplete: Math.round(((packIndex + 1) / context.plan.packs.length) * 100),
        });
      } else {
        attempt.error = result.error ?? 'Unknown submission error';
        attempt.retryable = true;
        state.lastError = attempt.error;

        const decision = evaluateRetry(op, state.attempts, attempt.error);
        if (decision.shouldRetry) {
          state.status = 'planned';
          await waitForRetry(decision);
        } else {
          state.status = 'failed';
          emitProgress(executor, {
            type: 'operation_failed',
            runId: working.runId,
            packId: pack.id,
            operationId: opId,
            message: attempt.error,
            percentComplete: Math.round(((packIndex + 1) / context.plan.packs.length) * 100),
          });
        }
      }

      state.attempts.push(attempt);
      state.updatedAt = new Date().toISOString();
    }

    working = updateCheckpoint(working, {
      currentPackIndex: packIndex + 1,
      operationStates: [...states.values()],
    });
    hooks.onCheckpoint?.(working);
    states = stateLookup();
  }

  const finalStates = [...states.values()];
  const completedCount = finalStates.filter((s) => s.status === 'completed').length;
  const failedCount = finalStates.filter((s) => s.status === 'failed').length;
  const skippedCount = finalStates.filter((s) => s.status === 'skipped').length;

  const status: BulkRunStatus = failedCount > 0 ? 'failed' : 'completed';
  working = updateCheckpoint(working, {
    status,
    operationStates: finalStates,
    completedAt: new Date().toISOString(),
    failureReason: failedCount > 0 ? `${failedCount} operation(s) failed` : undefined,
  });
  hooks.onCheckpoint?.(working);

  const receiptBody = {
    runId: working.runId,
    manifestId: working.manifestId,
    planId: working.planId,
    status,
    startedAt: working.startedAt,
    finishedAt: working.updatedAt,
    completedCount,
    failedCount,
    skippedCount,
    totalFeeStroops: completedCount * 100,
    operationOutcomes: finalStates.map((state) => ({
      operationId: state.operationId,
      status: state.status,
      txHash: state.txHash,
      error: state.lastError,
    })),
  };

  const receipt: BulkRunReceipt = {
    ...receiptBody,
    checksum: await checksumValue(receiptBody),
  };

  emitProgress(executor, {
    type: 'completed',
    runId: working.runId,
    message: status === 'completed' ? 'Bulk run completed' : 'Bulk run finished with failures',
    percentComplete: 100,
  });

  return { checkpoint: working, receipt, control };
}

export function resumeFromCheckpoint(
  checkpoint: BulkRunCheckpoint,
  manifest: BulkManifest,
  plan: BulkExecutionPlan
): BulkExecutorContext {
  if (checkpoint.status === 'completed') {
    throw new BulkPlannerError('EXECUTION_FAILED', 'Cannot resume a completed run');
  }
  return {
    manifest,
    plan,
    checkpoint: updateCheckpoint(checkpoint, { status: 'running', pausedAt: undefined }),
  };
}

export function approveOperation(checkpoint: BulkRunCheckpoint, operationId: string): BulkRunCheckpoint {
  const operationStates = checkpoint.operationStates.map((state) => {
    if (state.operationId !== operationId) return state;
    if (state.status !== 'awaiting_approval') return state;
    return { ...state, status: 'planned' as const, updatedAt: new Date().toISOString() };
  });
  return updateCheckpoint(checkpoint, { operationStates });
}

export function skipOperation(checkpoint: BulkRunCheckpoint, operationId: string): BulkRunCheckpoint {
  const operationStates = checkpoint.operationStates.map((state) => {
    if (state.operationId !== operationId) return state;
    return { ...state, status: 'skipped' as const, updatedAt: new Date().toISOString() };
  });
  return updateCheckpoint(checkpoint, { operationStates });
}

export function summarizeCheckpoint(checkpoint: BulkRunCheckpoint): {
  completed: number;
  failed: number;
  pending: number;
  awaitingApproval: number;
} {
  let completed = 0;
  let failed = 0;
  let pending = 0;
  let awaitingApproval = 0;

  for (const state of checkpoint.operationStates) {
    if (state.status === 'completed') completed += 1;
    else if (state.status === 'failed') failed += 1;
    else if (state.status === 'awaiting_approval') awaitingApproval += 1;
    else pending += 1;
  }

  return { completed, failed, pending, awaitingApproval };
}

export function checkpointProgress(checkpoint: BulkRunCheckpoint): number {
  const total = checkpoint.operationStates.length;
  if (total === 0) return 100;
  const done = checkpoint.operationStates.filter(
    (s) => s.status === 'completed' || s.status === 'skipped' || s.status === 'failed'
  ).length;
  return Math.round((done / total) * 100);
}
