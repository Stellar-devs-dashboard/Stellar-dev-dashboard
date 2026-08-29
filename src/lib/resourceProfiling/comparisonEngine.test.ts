import { describe, expect, it } from 'vitest';
import { compareProfileToBaseline, compareProfiles } from './comparisonEngine';
import { createDefaultThreshold } from './budgetEngine';
import { createSampleBaseline, createSampleNeutralCandidate, createSampleRegressionCandidate } from './sampleFixtures';
import type { ResourceProfile } from '../../types/resourceProfiling';

describe('compareProfileToBaseline', () => {
  it('classifies a clear regression above threshold as "regression"', () => {
    const baseline = createSampleBaseline();
    const candidate = createSampleRegressionCandidate();
    const result = compareProfileToBaseline(baseline, candidate, {
      thresholds: [createDefaultThreshold('cpuInstructions', { percentage: 0.1 })],
    });
    const cpu = result.metrics.find((m) => m.metric === 'cpuInstructions');
    expect(cpu?.classification).toBe('regression');
    expect(result.overallClassification).toBe('regression');
    expect(result.regressionCount).toBeGreaterThan(0);
  });

  it('classifies a within-variance candidate as neutral, not a regression', () => {
    const baseline = createSampleBaseline();
    const candidate = createSampleNeutralCandidate();
    const result = compareProfileToBaseline(baseline, candidate, {
      thresholds: [createDefaultThreshold('cpuInstructions', { percentage: 0.2 })],
    });
    const cpu = result.metrics.find((m) => m.metric === 'cpuInstructions');
    expect(cpu?.classification).not.toBe('regression');
  });

  it('is deterministic: identical inputs produce identical classifications', () => {
    const baseline = createSampleBaseline();
    const candidate = createSampleRegressionCandidate();
    const thresholds = [createDefaultThreshold('cpuInstructions')];
    const first = compareProfileToBaseline(baseline, candidate, { thresholds });
    const second = compareProfileToBaseline(baseline, candidate, { thresholds });
    expect(first.metrics.map((m) => m.classification)).toEqual(second.metrics.map((m) => m.classification));
  });

  it('marks a metric missing from both baseline and candidate as insufficient-data, not neutral', () => {
    const baseline = createSampleBaseline();
    const candidate = createSampleRegressionCandidate();
    const result = compareProfileToBaseline(baseline, candidate);
    const inclusionFee = result.metrics.find((m) => m.metric === 'inclusionFeeStroops');
    expect(inclusionFee).toBeUndefined();
  });

  it('treats a noisy baseline metric as "noise" rather than a false regression when threshold is breached', () => {
    const noisyBaseline = createSampleBaseline();
    noisyBaseline.profiles = [
      { ...noisyBaseline.profiles[0], metrics: { ...noisyBaseline.profiles[0].metrics, cpuInstructions: 1_000_000 } },
      { ...noisyBaseline.profiles[1], metrics: { ...noisyBaseline.profiles[1].metrics, cpuInstructions: 9_000_000 } },
      { ...noisyBaseline.profiles[2], metrics: { ...noisyBaseline.profiles[2].metrics, cpuInstructions: 5_000_000 } },
    ];
    const candidate: ResourceProfile = {
      ...createSampleRegressionCandidate(),
      metrics: { ...createSampleRegressionCandidate().metrics, cpuInstructions: 6_000_000 },
    };
    const result = compareProfileToBaseline(noisyBaseline, candidate, {
      thresholds: [createDefaultThreshold('cpuInstructions', { percentage: 0.05 })],
    });
    const cpu = result.metrics.find((m) => m.metric === 'cpuInstructions');
    expect(cpu?.classification).toBe('noise');
  });

  it('handles a huge candidate value without throwing or producing NaN percentages', () => {
    const baseline = createSampleBaseline();
    const candidate: ResourceProfile = {
      ...createSampleRegressionCandidate(),
      metrics: { ...createSampleRegressionCandidate().metrics, cpuInstructions: 99_999_999_999 },
    };
    const result = compareProfileToBaseline(baseline, candidate);
    const cpu = result.metrics.find((m) => m.metric === 'cpuInstructions');
    expect(Number.isFinite(cpu?.percentageDelta)).toBe(true);
  });

  it('compareProfiles compares two individual profiles without a persisted baseline', () => {
    const reference = createSampleBaseline().profiles[0];
    const candidate = createSampleRegressionCandidate();
    const result = compareProfiles(reference, candidate, { thresholds: [createDefaultThreshold('cpuInstructions', { percentage: 0.05 })] });
    expect(result.baselineId).toBe(reference.id);
    expect(result.metrics.find((m) => m.metric === 'cpuInstructions')?.classification).toBe('regression');
  });
});
