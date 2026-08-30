import { describe, expect, it } from 'vitest';
import { sanitizeMetricValue, validateBaseline, validateBudget, validateResourceProfile, validateThreshold } from './validation';
import { createDefaultBudget, createDefaultThreshold } from './budgetEngine';
import { createSampleBaseline } from './sampleFixtures';

describe('sanitizeMetricValue', () => {
  it('accepts a normal finite non-negative number', () => {
    expect(sanitizeMetricValue('cpuInstructions', 4_200_000)).toBe(4_200_000);
  });

  it('rejects NaN, negative, non-number, and implausibly huge values', () => {
    expect(sanitizeMetricValue('cpuInstructions', Number.NaN)).toBeUndefined();
    expect(sanitizeMetricValue('cpuInstructions', -1)).toBeUndefined();
    expect(sanitizeMetricValue('cpuInstructions', '42' as unknown as number)).toBeUndefined();
    expect(sanitizeMetricValue('cpuInstructions', 1e15)).toBeUndefined();
  });
});

describe('validateResourceProfile', () => {
  it('accepts a well-formed sample profile', () => {
    const profile = createSampleBaseline().profiles[0];
    expect(validateResourceProfile(profile).valid).toBe(true);
  });

  it('rejects a profile with a negative metric value', () => {
    const profile = createSampleBaseline().profiles[0];
    const invalid = { ...profile, metrics: { ...profile.metrics, cpuInstructions: -5 } };
    const result = validateResourceProfile(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('cpuInstructions'))).toBe(true);
  });

  it('rejects a profile with an invalid capturedAt timestamp', () => {
    const profile = createSampleBaseline().profiles[0];
    const invalid = { ...profile, provenance: { ...profile.provenance, capturedAt: 'not-a-date' } };
    expect(validateResourceProfile(invalid).valid).toBe(false);
  });

  it('rejects a profile with no metrics and no declared missing metrics', () => {
    const profile = createSampleBaseline().profiles[0];
    const invalid = { ...profile, metrics: {}, missingMetrics: [] };
    expect(validateResourceProfile(invalid).valid).toBe(false);
  });
});

describe('validateBaseline', () => {
  it('accepts the bundled sample baseline', () => {
    expect(validateBaseline(createSampleBaseline()).valid).toBe(true);
  });

  it('rejects a baseline with an empty name', () => {
    expect(validateBaseline({ ...createSampleBaseline(), name: '' }).valid).toBe(false);
  });

  it('surfaces per-sample errors with a 1-based index for readability', () => {
    const baseline = createSampleBaseline();
    baseline.profiles[1] = { ...baseline.profiles[1], metrics: { ...baseline.profiles[1].metrics, memoryBytes: -1 } };
    const result = validateBaseline(baseline);
    expect(result.errors.some((e) => e.startsWith('Sample 2:'))).toBe(true);
  });
});

describe('validateThreshold', () => {
  it('requires at least an absolute or percentage bound', () => {
    const threshold = createDefaultThreshold('cpuInstructions', { absolute: null, percentage: null });
    expect(validateThreshold(threshold).valid).toBe(false);
  });

  it('accepts a threshold with only a percentage bound', () => {
    expect(validateThreshold(createDefaultThreshold('cpuInstructions')).valid).toBe(true);
  });
});

describe('validateBudget', () => {
  it('accepts the default budget', () => {
    expect(validateBudget(createDefaultBudget()).valid).toBe(true);
  });

  it('rejects an override that scopes neither a contract id nor a function name', () => {
    const budget = createDefaultBudget();
    budget.overrides.push({ contractId: null, functionName: null, thresholds: [createDefaultThreshold('cpuInstructions')] });
    expect(validateBudget(budget).valid).toBe(false);
  });
});
