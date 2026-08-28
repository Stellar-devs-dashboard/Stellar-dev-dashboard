import { ALL_METRIC_KEYS, METRIC_DESCRIPTORS } from './metrics';
import { isNoisyMetric, metricValue, summarizeBaselineMetrics } from './statistics';
import { requestId } from './errors';
import type {
  Baseline,
  ComparisonResult,
  ComparisonThreshold,
  MetricComparison,
  RegressionClassification,
  ResourceMetricKey,
  ResourceProfile,
} from '../../types/resourceProfiling';

function thresholdFor(metric: ResourceMetricKey, thresholds: ComparisonThreshold[]): ComparisonThreshold | null {
  return thresholds.find((threshold) => threshold.metric === metric) ?? null;
}

/**
 * Determines whether a candidate/baseline delta breaches a threshold. A threshold with both an
 * absolute and a percentage bound requires *both* to be crossed, so a tiny absolute change in a
 * near-zero baseline doesn't get flagged purely because the percentage delta looks enormous.
 */
function breachesThreshold(
  absoluteDelta: number,
  percentageDelta: number | null,
  threshold: ComparisonThreshold
): boolean {
  if (threshold.direction === 'decrease' && absoluteDelta > 0) return false;
  if (threshold.direction === 'increase' && absoluteDelta < 0) return false;

  const magnitude = Math.abs(absoluteDelta);
  const absoluteBreach = threshold.absolute === null ? null : magnitude >= threshold.absolute;
  const percentageBreach =
    threshold.percentage === null || percentageDelta === null ? null : Math.abs(percentageDelta) >= threshold.percentage;

  if (absoluteBreach === null && percentageBreach === null) return false;
  if (absoluteBreach === null) return Boolean(percentageBreach);
  if (percentageBreach === null) return Boolean(absoluteBreach);
  return absoluteBreach && percentageBreach;
}

function classifyMetric(
  metric: ResourceMetricKey,
  baselineValue: number | null,
  candidateValue: number | null,
  noisy: boolean,
  threshold: ComparisonThreshold | null
): { classification: RegressionClassification; absoluteDelta: number | null; percentageDelta: number | null; breached: ComparisonThreshold | null } {
  if (baselineValue === null || candidateValue === null) {
    return { classification: 'insufficient-data', absoluteDelta: null, percentageDelta: null, breached: null };
  }

  const absoluteDelta = candidateValue - baselineValue;
  const percentageDelta = baselineValue === 0 ? (candidateValue === 0 ? 0 : null) : absoluteDelta / baselineValue;
  const higherIsWorse = METRIC_DESCRIPTORS[metric].higherIsWorse;

  if (!threshold) {
    if (absoluteDelta === 0) return { classification: 'neutral', absoluteDelta, percentageDelta, breached: null };
    const worse = higherIsWorse ? absoluteDelta > 0 : absoluteDelta < 0;
    return { classification: worse ? 'regression' : 'improvement', absoluteDelta, percentageDelta, breached: null };
  }

  const breached = breachesThreshold(absoluteDelta, percentageDelta, threshold);
  if (!breached) {
    return { classification: noisy ? 'noise' : 'neutral', absoluteDelta, percentageDelta, breached: null };
  }

  if (noisy) {
    return { classification: 'noise', absoluteDelta, percentageDelta, breached: threshold };
  }

  const worse = higherIsWorse ? absoluteDelta > 0 : absoluteDelta < 0;
  return { classification: worse ? 'regression' : 'improvement', absoluteDelta, percentageDelta, breached: threshold };
}

export interface CompareOptions {
  thresholds?: ComparisonThreshold[];
  /** Use the baseline's median instead of its mean as the comparison anchor. */
  anchor?: 'mean' | 'median';
  noiseThreshold?: number;
}

/**
 * Deterministically compares a single candidate profile against every metric in a baseline's
 * statistical summary. Given the same baseline, candidate, and thresholds, this always returns
 * the same classification -- no randomness, no wall-clock-dependent behavior beyond the result's
 * own `generatedAt` timestamp.
 */
export function compareProfileToBaseline(
  baseline: Baseline,
  candidate: ResourceProfile,
  options: CompareOptions = {}
): ComparisonResult {
  const { thresholds = [], anchor = 'mean', noiseThreshold = 0.15 } = options;
  const summaries = summarizeBaselineMetrics(baseline.profiles);

  const metrics: MetricComparison[] = ALL_METRIC_KEYS.map((metric) => {
    const summary = summaries[metric] ?? null;
    const baselineValue = summary ? (anchor === 'median' ? summary.median : summary.mean) : null;
    const candidateValue = metricValue(candidate, metric);
    const noisy = isNoisyMetric(summary ?? undefined, noiseThreshold);
    const threshold = thresholdFor(metric, thresholds);
    const outcome = classifyMetric(metric, baselineValue, candidateValue, noisy, threshold);

    return {
      metric,
      baselineValue,
      candidateValue,
      baselineSummary: summary,
      absoluteDelta: outcome.absoluteDelta,
      percentageDelta: outcome.percentageDelta,
      classification: outcome.classification,
      breachedThreshold: outcome.breached,
    };
  }).filter((comparison) => comparison.baselineValue !== null || comparison.candidateValue !== null);

  const regressionCount = metrics.filter((metric) => metric.classification === 'regression').length;
  const improvementCount = metrics.filter((metric) => metric.classification === 'improvement').length;
  const overallClassification: RegressionClassification =
    regressionCount > 0 ? 'regression' : improvementCount > 0 ? 'improvement' : 'neutral';

  return {
    id: requestId('comparison'),
    generatedAt: new Date().toISOString(),
    baselineId: baseline.id,
    baselineName: baseline.name,
    candidate,
    metrics,
    regressionCount,
    improvementCount,
    overallClassification,
  };
}

/** Compares two individual profiles (e.g. two saved-template inputs) without a full baseline. */
export function compareProfiles(
  reference: ResourceProfile,
  candidate: ResourceProfile,
  options: CompareOptions = {}
): ComparisonResult {
  const syntheticBaseline: Baseline = {
    id: reference.id,
    schemaVersion: 1,
    name: 'Reference sample',
    description: '',
    tags: [],
    createdAt: reference.provenance.capturedAt,
    updatedAt: reference.provenance.capturedAt,
    profiles: [reference],
  };
  return compareProfileToBaseline(syntheticBaseline, candidate, options);
}
