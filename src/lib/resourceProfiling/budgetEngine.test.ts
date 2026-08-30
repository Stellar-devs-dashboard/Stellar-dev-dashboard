import { describe, expect, it } from 'vitest';
import { createDefaultBudget, createDefaultThreshold, evaluateBudget } from './budgetEngine';
import { createSampleRegressionCandidate } from './sampleFixtures';
import type { ResourceBudget } from '../../types/resourceProfiling';

describe('evaluateBudget', () => {
  it('passes when metrics are within an absolute bound', () => {
    const budget: ResourceBudget = { ...createDefaultBudget(), thresholds: [createDefaultThreshold('cpuInstructions', { absolute: 10_000_000, percentage: null })] };
    const candidate = createSampleRegressionCandidate();
    const result = evaluateBudget(budget, candidate);
    expect(result.pass).toBe(true);
  });

  it('fails when a metric exceeds its absolute bound', () => {
    const budget: ResourceBudget = { ...createDefaultBudget(), thresholds: [createDefaultThreshold('cpuInstructions', { absolute: 1_000_000, percentage: null })] };
    const candidate = createSampleRegressionCandidate();
    const result = evaluateBudget(budget, candidate);
    expect(result.pass).toBe(false);
    expect(result.results[0].reason).toMatch(/exceeds the absolute budget/);
  });

  it('fails when a metric regresses beyond the percentage bound against a supplied baseline value', () => {
    const budget: ResourceBudget = { ...createDefaultBudget(), thresholds: [createDefaultThreshold('cpuInstructions', { percentage: 0.1 })] };
    const candidate = createSampleRegressionCandidate();
    const result = evaluateBudget(budget, candidate, { cpuInstructions: 4_200_000 });
    expect(result.pass).toBe(false);
  });

  it('passes (skips) a metric that was not captured for the candidate profile', () => {
    const budget: ResourceBudget = { ...createDefaultBudget(), thresholds: [createDefaultThreshold('inclusionFeeStroops', { absolute: 100 })] };
    const candidate = createSampleRegressionCandidate();
    const result = evaluateBudget(budget, candidate);
    expect(result.pass).toBe(true);
    expect(result.results[0].reason).toMatch(/not captured/);
  });

  it('applies the most specific matching override over the base threshold', () => {
    const budget: ResourceBudget = {
      ...createDefaultBudget(),
      thresholds: [createDefaultThreshold('cpuInstructions', { absolute: 1_000_000, percentage: null })],
      overrides: [
        {
          contractId: null,
          functionName: 'transfer',
          thresholds: [createDefaultThreshold('cpuInstructions', { absolute: 10_000_000, percentage: null })],
        },
      ],
    };
    const candidate = createSampleRegressionCandidate();
    expect(candidate.provenance.functionName).toBe('transfer');
    const result = evaluateBudget(budget, candidate);
    expect(result.pass).toBe(true);
  });

  it('is deterministic for the same budget and candidate', () => {
    const budget = createDefaultBudget();
    const candidate = createSampleRegressionCandidate();
    const first = evaluateBudget(budget, candidate, { cpuInstructions: 4_200_000 });
    const second = evaluateBudget(budget, candidate, { cpuInstructions: 4_200_000 });
    expect(first.results.map((r) => r.pass)).toEqual(second.results.map((r) => r.pass));
  });
});
