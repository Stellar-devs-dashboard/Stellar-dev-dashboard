import { DEFAULT_THRESHOLD_METRICS, METRIC_DESCRIPTORS } from './metrics';
import { metricValue } from './statistics';
import type {
  BudgetEvaluation,
  BudgetMetricEvaluation,
  BudgetOverride,
  ComparisonThreshold,
  ResourceBudget,
  ResourceMetricKey,
  ResourceProfile,
} from '../../types/resourceProfiling';

export function createDefaultThreshold(
  metric: ResourceMetricKey,
  overrides: Partial<ComparisonThreshold> = {}
): ComparisonThreshold {
  return {
    metric,
    absolute: null,
    percentage: 0.2,
    direction: 'increase',
    ...overrides,
  };
}

export function createDefaultBudget(name = 'Default budget'): ResourceBudget {
  const now = new Date().toISOString();
  return {
    id: `budget-${Date.now().toString(36)}`,
    schemaVersion: 1,
    name,
    description: 'Flags a 20% or greater regression on the core Soroban resource metrics.',
    thresholds: DEFAULT_THRESHOLD_METRICS.map((metric) => createDefaultThreshold(metric)),
    overrides: [],
    createdAt: now,
    updatedAt: now,
  };
}

function overrideMatches(override: BudgetOverride, contractId: string | null, functionName: string | null): boolean {
  const contractMatches = !override.contractId || override.contractId === contractId;
  const functionMatches = !override.functionName || override.functionName === functionName;
  return contractMatches && functionMatches;
}

/**
 * Overrides are applied most-specific-first: a rule scoping both contractId and functionName
 * wins over one scoping only a function, which wins over a contract-only rule, which wins over
 * the budget's base thresholds. Later matching overrides with equal specificity replace earlier
 * ones for the same metric, so override order matters for ties.
 */
function resolveThresholds(budget: ResourceBudget, contractId: string | null, functionName: string | null): ComparisonThreshold[] {
  const bySpecificity = [...(budget.overrides ?? [])].sort((a, b) => {
    const specificity = (override: BudgetOverride) => (override.contractId ? 1 : 0) + (override.functionName ? 1 : 0);
    return specificity(a) - specificity(b);
  });

  const resolved = new Map<ResourceMetricKey, ComparisonThreshold>();
  for (const threshold of budget.thresholds ?? []) {
    resolved.set(threshold.metric, threshold);
  }
  for (const override of bySpecificity) {
    if (!overrideMatches(override, contractId, functionName)) continue;
    for (const threshold of override.thresholds) {
      resolved.set(threshold.metric, threshold);
    }
  }
  return [...resolved.values()];
}

function evaluateMetric(
  profile: ResourceProfile,
  threshold: ComparisonThreshold,
  baselineValue: number | null
): BudgetMetricEvaluation {
  const value = metricValue(profile, threshold.metric);
  const descriptor = METRIC_DESCRIPTORS[threshold.metric];

  if (value === null) {
    return {
      metric: threshold.metric,
      value: null,
      threshold,
      baselineValue,
      pass: true,
      reason: 'Metric was not captured for this profile; budget check skipped.',
    };
  }

  if (threshold.absolute !== null && value > threshold.absolute) {
    return {
      metric: threshold.metric,
      value,
      threshold,
      baselineValue,
      pass: false,
      reason: `${descriptor.label} of ${value.toLocaleString()} exceeds the absolute budget of ${threshold.absolute.toLocaleString()}.`,
    };
  }

  if (threshold.percentage !== null && baselineValue !== null && baselineValue > 0) {
    const delta = (value - baselineValue) / baselineValue;
    const direction = threshold.direction;
    const overBudget = direction === 'decrease' ? delta < -threshold.percentage : delta >= threshold.percentage;
    if (overBudget) {
      return {
        metric: threshold.metric,
        value,
        threshold,
        baselineValue,
        pass: false,
        reason: `${descriptor.label} changed ${(delta * 100).toFixed(1)}% against baseline, exceeding the ${(
          threshold.percentage * 100
        ).toFixed(0)}% budget.`,
      };
    }
  }

  return {
    metric: threshold.metric,
    value,
    threshold,
    baselineValue,
    pass: true,
    reason: `${descriptor.label} is within budget.`,
  };
}

export function evaluateBudget(
  budget: ResourceBudget,
  candidate: ResourceProfile,
  baselineValues: Partial<Record<ResourceMetricKey, number>> = {}
): BudgetEvaluation {
  const thresholds = resolveThresholds(budget, candidate.provenance.contractId, candidate.provenance.functionName);
  const results = thresholds.map((threshold) => evaluateMetric(candidate, threshold, baselineValues[threshold.metric] ?? null));

  return {
    budgetId: budget.id,
    budgetName: budget.name,
    candidateId: candidate.id,
    generatedAt: new Date().toISOString(),
    results,
    pass: results.every((result) => result.pass),
  };
}
