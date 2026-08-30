import { ALL_METRIC_KEYS, METRIC_SANITY_CEILING } from './metrics';
import type {
  Baseline,
  ComparisonThreshold,
  ResourceBudget,
  ResourceMetricKey,
  ResourceProfile,
} from '../../types/resourceProfiling';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function ok(): ValidationResult {
  return { valid: true, errors: [] };
}

function fail(errors: string[]): ValidationResult {
  return { valid: false, errors };
}

/**
 * Guards against non-finite, negative, and implausibly large metric values so a single
 * corrupt RPC response (or a hand-edited import) can't silently poison a baseline's
 * statistics or pass a budget it should have failed.
 */
export function sanitizeMetricValue(key: ResourceMetricKey, raw: unknown): number | undefined {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return undefined;
  if (raw < 0) return undefined;
  if (raw > METRIC_SANITY_CEILING) return undefined;
  void key;
  return raw;
}

export function validateResourceProfile(profile: ResourceProfile): ValidationResult {
  const errors: string[] = [];
  if (!profile.id || typeof profile.id !== 'string') errors.push('Profile is missing an id.');
  if (!profile.provenance) {
    errors.push('Profile is missing provenance.');
  } else {
    if (!profile.provenance.capturedAt || Number.isNaN(Date.parse(profile.provenance.capturedAt))) {
      errors.push('Profile provenance has an invalid capturedAt timestamp.');
    }
    if (!['simulation', 'confirmed-transaction', 'imported'].includes(profile.provenance.source)) {
      errors.push(`Profile provenance has an unknown source: ${String(profile.provenance.source)}.`);
    }
  }

  const metricKeys = Object.keys(profile.metrics ?? {});
  for (const key of metricKeys) {
    if (!ALL_METRIC_KEYS.includes(key as ResourceMetricKey)) {
      errors.push(`Unknown metric key: ${key}.`);
      continue;
    }
    const value = profile.metrics[key as ResourceMetricKey];
    if (value === undefined) continue;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      errors.push(`Metric ${key} must be a finite number.`);
    } else if (value < 0) {
      errors.push(`Metric ${key} cannot be negative.`);
    } else if (value > METRIC_SANITY_CEILING) {
      errors.push(`Metric ${key} exceeds the sanity ceiling (${METRIC_SANITY_CEILING.toLocaleString()}).`);
    }
  }

  if (metricKeys.length === 0 && (profile.missingMetrics ?? []).length === 0) {
    errors.push('Profile has no metrics and no declared missing metrics.');
  }

  return errors.length === 0 ? ok() : fail(errors);
}

export function validateBaseline(baseline: Baseline): ValidationResult {
  const errors: string[] = [];
  if (!baseline.id) errors.push('Baseline is missing an id.');
  if (!baseline.name || !baseline.name.trim()) errors.push('Baseline name cannot be empty.');
  if (!Array.isArray(baseline.profiles)) {
    errors.push('Baseline profiles must be an array.');
    return fail(errors);
  }
  baseline.profiles.forEach((profile, index) => {
    const result = validateResourceProfile(profile);
    if (!result.valid) {
      errors.push(...result.errors.map((message) => `Sample ${index + 1}: ${message}`));
    }
  });
  return errors.length === 0 ? ok() : fail(errors);
}

export function validateThreshold(threshold: ComparisonThreshold): ValidationResult {
  const errors: string[] = [];
  if (!ALL_METRIC_KEYS.includes(threshold.metric)) errors.push(`Unknown threshold metric: ${threshold.metric}.`);
  if (threshold.absolute === null && threshold.percentage === null) {
    errors.push(`Threshold for ${threshold.metric} must define an absolute or percentage bound.`);
  }
  if (threshold.absolute !== null && (!Number.isFinite(threshold.absolute) || threshold.absolute < 0)) {
    errors.push(`Threshold for ${threshold.metric} has an invalid absolute bound.`);
  }
  if (threshold.percentage !== null && (!Number.isFinite(threshold.percentage) || threshold.percentage < 0)) {
    errors.push(`Threshold for ${threshold.metric} has an invalid percentage bound.`);
  }
  if (!['increase', 'decrease', 'any'].includes(threshold.direction)) {
    errors.push(`Threshold for ${threshold.metric} has an invalid direction.`);
  }
  return errors.length === 0 ? ok() : fail(errors);
}

export function validateBudget(budget: ResourceBudget): ValidationResult {
  const errors: string[] = [];
  if (!budget.id) errors.push('Budget is missing an id.');
  if (!budget.name || !budget.name.trim()) errors.push('Budget name cannot be empty.');
  for (const threshold of budget.thresholds ?? []) {
    const result = validateThreshold(threshold);
    if (!result.valid) errors.push(...result.errors);
  }
  for (const override of budget.overrides ?? []) {
    if (!override.contractId && !override.functionName) {
      errors.push('A budget override must scope to a contract id, a function name, or both.');
    }
    for (const threshold of override.thresholds ?? []) {
      const result = validateThreshold(threshold);
      if (!result.valid) errors.push(...result.errors);
    }
  }
  return errors.length === 0 ? ok() : fail(errors);
}
