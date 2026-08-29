import { describe, expect, it } from 'vitest';
import { isNoisyMetric, metricValue, summarizeBaselineMetrics, summarizeSamples } from './statistics';
import { createSampleBaseline } from './sampleFixtures';

describe('summarizeSamples', () => {
  it('returns zeroed stats for an empty sample set', () => {
    const summary = summarizeSamples([]);
    expect(summary).toEqual({ count: 0, mean: 0, median: 0, stdDev: 0, min: 0, max: 0, p50: 0, p90: 0, p99: 0, coefficientOfVariation: 0 });
  });

  it('computes deterministic mean/median/stdDev for a known set', () => {
    const summary = summarizeSamples([10, 20, 30]);
    expect(summary.count).toBe(3);
    expect(summary.mean).toBe(20);
    expect(summary.median).toBe(20);
    expect(summary.min).toBe(10);
    expect(summary.max).toBe(30);
    expect(summary.stdDev).toBeCloseTo(8.16496, 4);
  });

  it('ignores non-finite values instead of propagating NaN', () => {
    const summary = summarizeSamples([10, Number.NaN, 20, Number.POSITIVE_INFINITY]);
    expect(summary.count).toBe(2);
    expect(summary.mean).toBe(15);
  });

  it('is stable across repeated calls with the same input (deterministic)', () => {
    const values = [4_200_000, 4_260_000, 4_180_000, 5_600_000, 100];
    expect(summarizeSamples(values)).toEqual(summarizeSamples(values));
  });

  it('handles a single-sample set without dividing by zero', () => {
    const summary = summarizeSamples([42]);
    expect(summary.count).toBe(1);
    expect(summary.mean).toBe(42);
    expect(summary.stdDev).toBe(0);
    expect(summary.coefficientOfVariation).toBe(0);
  });
});

describe('summarizeBaselineMetrics', () => {
  it('only includes metrics that have at least one sample', () => {
    const baseline = createSampleBaseline();
    const summary = summarizeBaselineMetrics(baseline.profiles);
    expect(summary.cpuInstructions?.count).toBe(3);
    expect(summary.inclusionFeeStroops).toBeUndefined();
  });
});

describe('isNoisyMetric', () => {
  it('flags a high coefficient of variation as noisy', () => {
    const summary = summarizeSamples([10, 1000]);
    expect(isNoisyMetric(summary, 0.15)).toBe(true);
  });

  it('does not flag a tight sample set as noisy', () => {
    const summary = summarizeSamples([100, 101, 99, 100]);
    expect(isNoisyMetric(summary, 0.15)).toBe(false);
  });

  it('never flags a single-sample summary as noisy (nothing to compare against)', () => {
    const summary = summarizeSamples([100]);
    expect(isNoisyMetric(summary)).toBe(false);
  });

  it('treats an undefined summary as not noisy', () => {
    expect(isNoisyMetric(undefined)).toBe(false);
  });
});

describe('metricValue', () => {
  it('returns null for a missing metric instead of undefined or NaN', () => {
    const baseline = createSampleBaseline();
    expect(metricValue(baseline.profiles[0], 'inclusionFeeStroops')).toBeNull();
    expect(metricValue(baseline.profiles[0], 'cpuInstructions')).toBe(4_200_000);
  });
});
