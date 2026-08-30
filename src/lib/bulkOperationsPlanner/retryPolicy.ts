/**
 * Retry classification and exponential backoff for bulk operation attempts.
 */

import type { BulkOperationAttempt, BulkOperationSpec } from '../../types/bulkOperationsPlanner';

export interface RetryDecision {
  shouldRetry: boolean;
  delayMs: number;
  reason: string;
}

const RETRYABLE_PATTERNS = [
  /timeout/i,
  /network/i,
  /503/,
  /429/,
  /rate limit/i,
  /temporarily unavailable/i,
  /connection reset/i,
  /econnreset/i,
  /socket hang up/i,
  /horizon.*busy/i,
];

const NON_RETRYABLE_PATTERNS = [
  /op_underfunded/i,
  /op_no_trust/i,
  /op_line_full/i,
  /bad auth/i,
  /invalid/i,
  /malformed/i,
  /tx_insufficient_fee/i,
  /tx_bad_seq/i,
  /op_not_supported/i,
  /op_no_destination/i,
  /op_no_source_account/i,
];

export function classifyRetryability(error: string): boolean {
  if (NON_RETRYABLE_PATTERNS.some((pattern) => pattern.test(error))) return false;
  if (RETRYABLE_PATTERNS.some((pattern) => pattern.test(error))) return true;
  return false;
}

export function computeBackoffMs(attemptNumber: number, baseMs = 500, maxMs = 30_000): number {
  const exponential = baseMs * 2 ** Math.max(0, attemptNumber - 1);
  const jitter = Math.floor(Math.random() * baseMs);
  return Math.min(exponential + jitter, maxMs);
}

export function evaluateRetry(
  operation: BulkOperationSpec,
  attempts: BulkOperationAttempt[],
  error: string
): RetryDecision {
  const attemptNumber = attempts.length + 1;
  const retryable = classifyRetryability(error);

  if (!retryable) {
    return {
      shouldRetry: false,
      delayMs: 0,
      reason: 'Error classified as non-retryable',
    };
  }

  if (attemptNumber > operation.maxRetries) {
    return {
      shouldRetry: false,
      delayMs: 0,
      reason: `Maximum retries (${operation.maxRetries}) exceeded`,
    };
  }

  const delayMs = computeBackoffMs(attemptNumber);
  return {
    shouldRetry: true,
    delayMs,
    reason: `Retryable error on attempt ${attemptNumber}`,
  };
}

export function summarizeAttempts(attempts: BulkOperationAttempt[]): {
  totalAttempts: number;
  lastError?: string;
  lastTxHash?: string;
  retryableFailures: number;
} {
  let retryableFailures = 0;
  let lastError: string | undefined;
  let lastTxHash: string | undefined;

  for (const attempt of attempts) {
    if (attempt.error) {
      lastError = attempt.error;
      if (attempt.retryable) retryableFailures += 1;
    }
    if (attempt.txHash) lastTxHash = attempt.txHash;
  }

  return {
    totalAttempts: attempts.length,
    lastError,
    lastTxHash,
    retryableFailures,
  };
}

export function shouldPauseRunOnFailure(
  failures: Array<{ operationId: string; error: string }>,
  threshold = 3
): boolean {
  const consecutiveRetryable = failures.filter((f) => classifyRetryability(f.error)).length;
  return consecutiveRetryable >= threshold;
}

export function formatAttemptSummary(attempt: BulkOperationAttempt): string {
  const duration =
    attempt.finishedAt && attempt.startedAt
      ? new Date(attempt.finishedAt).getTime() - new Date(attempt.startedAt).getTime()
      : undefined;

  const parts = [`attempt ${attempt.attemptNumber}`];
  if (attempt.txHash) parts.push(`tx ${attempt.txHash.slice(0, 8)}…`);
  if (attempt.error) parts.push(attempt.error);
  if (duration !== undefined) parts.push(`${duration}ms`);
  return parts.join(' · ');
}

export function aggregateRetryStats(
  attemptsByOperation: Map<string, BulkOperationAttempt[]>
): { retryRate: number; totalRetries: number; totalOperations: number } {
  let totalRetries = 0;
  let operationsWithRetries = 0;

  for (const attempts of attemptsByOperation.values()) {
    const retries = Math.max(0, attempts.length - 1);
    totalRetries += retries;
    if (retries > 0) operationsWithRetries += 1;
  }

  const totalOperations = attemptsByOperation.size;
  const retryRate = totalOperations === 0 ? 0 : operationsWithRetries / totalOperations;

  return { retryRate, totalRetries, totalOperations };
}

export async function sleepMs(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForRetry(decision: RetryDecision): Promise<void> {
  if (decision.shouldRetry && decision.delayMs > 0) {
    await sleepMs(decision.delayMs);
  }
}
