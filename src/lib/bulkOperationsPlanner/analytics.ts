/**
 * Aggregate analytics across persisted bulk runs.
 */

import type { BulkAnalyticsSummary, BulkStoredRunRecord } from '../../types/bulkOperationsPlanner';
import { classifyRetryability } from './retryPolicy';

export function computeAnalyticsSummary(runs: BulkStoredRunRecord[]): BulkAnalyticsSummary {
  let completedRuns = 0;
  let failedRuns = 0;
  let totalOperationsSubmitted = 0;
  let totalOperationsFailed = 0;
  let totalCompletionMs = 0;
  let completionSamples = 0;
  let totalAttempts = 0;
  let retriedOperations = 0;
  const failureReasons = new Map<string, number>();

  for (const run of runs) {
    const status = run.receipt?.status ?? run.checkpoint.status;
    if (status === 'completed') completedRuns += 1;
    if (status === 'failed') failedRuns += 1;

    if (run.receipt) {
      totalOperationsSubmitted += run.receipt.completedCount;
      totalOperationsFailed += run.receipt.failedCount;
      const started = new Date(run.receipt.startedAt).getTime();
      const finished = new Date(run.receipt.finishedAt).getTime();
      if (Number.isFinite(started) && Number.isFinite(finished) && finished >= started) {
        totalCompletionMs += finished - started;
        completionSamples += 1;
      }
    }

    for (const state of run.checkpoint.operationStates) {
      totalAttempts += state.attempts.length;
      if (state.attempts.length > 1) retriedOperations += 1;
      const lastError = state.lastError ?? state.attempts[state.attempts.length - 1]?.error;
      if (lastError) {
        const key = classifyRetryability(lastError) ? 'retryable' : lastError.slice(0, 80);
        failureReasons.set(key, (failureReasons.get(key) ?? 0) + 1);
      }
    }
  }

  const topFailureReasons = [...failureReasons.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([reason, count]) => ({ reason, count }));

  return {
    totalRuns: runs.length,
    completedRuns,
    failedRuns,
    totalOperationsSubmitted,
    totalOperationsFailed,
    averageCompletionMs: completionSamples === 0 ? 0 : Math.round(totalCompletionMs / completionSamples),
    retryRate: totalAttempts === 0 ? 0 : retriedOperations / totalAttempts,
    topFailureReasons,
  };
}

export function formatAnalyticsSummary(summary: BulkAnalyticsSummary): string {
  return `${summary.completedRuns}/${summary.totalRuns} runs completed · ${summary.totalOperationsSubmitted} ops submitted`;
}

export function successRate(summary: BulkAnalyticsSummary): number {
  if (summary.totalRuns === 0) return 100;
  return Math.round((summary.completedRuns / summary.totalRuns) * 100);
}

export function filterRunsSince(runs: BulkStoredRunRecord[], isoDate: string): BulkStoredRunRecord[] {
  const cutoff = new Date(isoDate).getTime();
  return runs.filter((run) => new Date(run.savedAt).getTime() >= cutoff);
}

export function groupRunsByManifest(runs: BulkStoredRunRecord[]): Map<string, BulkStoredRunRecord[]> {
  const grouped = new Map<string, BulkStoredRunRecord[]>();
  for (const run of runs) {
    const list = grouped.get(run.manifestId) ?? [];
    list.push(run);
    grouped.set(run.manifestId, list);
  }
  return grouped;
}

export function latestAnalyticsWindow(runs: BulkStoredRunRecord[], days = 30): BulkAnalyticsSummary {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  return computeAnalyticsSummary(filterRunsSince(runs, cutoff.toISOString()));
}
