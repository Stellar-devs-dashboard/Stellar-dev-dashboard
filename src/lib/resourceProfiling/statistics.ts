import type { MetricSummaryMap, ResourceMetricKey, ResourceProfile, StatisticalSummary } from '../../types/resourceProfiling';
import { ALL_METRIC_KEYS } from './metrics';

function percentile(sorted: number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const rank = fraction * (sorted.length - 1);
  const lowerIndex = Math.floor(rank);
  const upperIndex = Math.ceil(rank);
  if (lowerIndex === upperIndex) return sorted[lowerIndex];
  const weight = rank - lowerIndex;
  return sorted[lowerIndex] * (1 - weight) + sorted[upperIndex] * weight;
}

/** Computes deterministic descriptive statistics for a set of same-metric samples. */
export function summarizeSamples(values: number[]): StatisticalSummary {
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length === 0) {
    return { count: 0, mean: 0, median: 0, stdDev: 0, min: 0, max: 0, p50: 0, p90: 0, p99: 0, coefficientOfVariation: 0 };
  }

  const sorted = [...finite].sort((a, b) => a - b);
  const count = sorted.length;
  const sum = sorted.reduce((acc, value) => acc + value, 0);
  const mean = sum / count;
  const variance = sorted.reduce((acc, value) => acc + (value - mean) ** 2, 0) / count;
  const stdDev = Math.sqrt(variance);

  return {
    count,
    mean,
    median: percentile(sorted, 0.5),
    stdDev,
    min: sorted[0],
    max: sorted[count - 1],
    p50: percentile(sorted, 0.5),
    p90: percentile(sorted, 0.9),
    p99: percentile(sorted, 0.99),
    coefficientOfVariation: mean === 0 ? 0 : stdDev / mean,
  };
}

/** Builds per-metric statistical summaries across every sample in a baseline. */
export function summarizeBaselineMetrics(profiles: ResourceProfile[]): MetricSummaryMap {
  const summary: MetricSummaryMap = {};
  for (const key of ALL_METRIC_KEYS) {
    const values = profiles
      .map((profile) => profile.metrics[key])
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    if (values.length === 0) continue;
    summary[key] = summarizeSamples(values);
  }
  return summary;
}

/**
 * A high coefficient of variation means the baseline's own historical samples disagree with
 * each other enough that a single-sample delta shouldn't be trusted as a real regression.
 */
export function isNoisyMetric(summary: StatisticalSummary | undefined, noiseThreshold = 0.15): boolean {
  if (!summary || summary.count < 2) return false;
  return summary.coefficientOfVariation > noiseThreshold;
}

export function metricValue(profile: ResourceProfile, key: ResourceMetricKey): number | null {
  const value = profile.metrics[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
