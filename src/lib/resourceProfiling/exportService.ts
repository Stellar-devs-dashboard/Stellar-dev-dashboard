import { RESOURCE_PROFILING_SCHEMA_VERSION } from '../../types/resourceProfiling';
import type {
  Baseline,
  BudgetEvaluation,
  ComparisonResult,
  ProfilingExportDocument,
} from '../../types/resourceProfiling';
import { redactBaseline, redactResourceProfile } from './redaction';
import { ProfilingError } from './errors';

export interface ExportOptions {
  /** Redact addresses and free-text input summaries. Defaults to true -- exports are opt OUT of redaction, never opt in. */
  redact?: boolean;
}

function redactComparison(comparison: ComparisonResult): ComparisonResult {
  return { ...comparison, candidate: redactResourceProfile(comparison.candidate) };
}

export function buildBaselineExport(baseline: Baseline, options: ExportOptions = {}): ProfilingExportDocument {
  const redact = options.redact ?? true;
  return {
    schemaVersion: RESOURCE_PROFILING_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    kind: 'baseline',
    redacted: redact,
    payload: redact ? redactBaseline(baseline) : baseline,
  };
}

export function buildComparisonExport(comparison: ComparisonResult, options: ExportOptions = {}): ProfilingExportDocument {
  const redact = options.redact ?? true;
  return {
    schemaVersion: RESOURCE_PROFILING_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    kind: 'comparison',
    redacted: redact,
    payload: redact ? redactComparison(comparison) : comparison,
  };
}

/**
 * Budget evaluations carry a candidate id but no profile payload, so there's nothing address-
 * shaped to redact; `redacted` still reflects the caller's intent for downstream consumers.
 */
export function buildBudgetEvaluationExport(evaluation: BudgetEvaluation, options: ExportOptions = {}): ProfilingExportDocument {
  return {
    schemaVersion: RESOURCE_PROFILING_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    kind: 'budget-evaluation',
    redacted: options.redact ?? true,
    payload: evaluation,
  };
}

export function serializeExport(document: ProfilingExportDocument): string {
  return JSON.stringify(document, null, 2);
}

/**
 * Parses and validates a previously exported document's envelope (schema version + kind) without
 * assuming the payload's inner shape -- callers pass the payload on to the relevant `migrate*`
 * function for the real shape validation.
 */
export function parseExportDocument(raw: string): ProfilingExportDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ProfilingError({ code: 'invalid-input', message: 'Export file is not valid JSON.', retryable: false });
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new ProfilingError({ code: 'invalid-input', message: 'Export file does not contain a JSON object.', retryable: false });
  }
  const record = parsed as Record<string, unknown>;
  if (typeof record.schemaVersion !== 'number') {
    throw new ProfilingError({ code: 'invalid-input', message: 'Export file is missing a schemaVersion.', retryable: false });
  }
  if (record.schemaVersion > RESOURCE_PROFILING_SCHEMA_VERSION) {
    throw new ProfilingError({
      code: 'unsupported-schema-version',
      message: `Export schema version ${record.schemaVersion} is newer than this build supports (${RESOURCE_PROFILING_SCHEMA_VERSION}).`,
      retryable: false,
    });
  }
  if (!['baseline', 'comparison', 'budget-evaluation'].includes(String(record.kind))) {
    throw new ProfilingError({ code: 'invalid-input', message: `Unknown export kind: ${String(record.kind)}.`, retryable: false });
  }
  return parsed as ProfilingExportDocument;
}

/**
 * Builds a minimal, stable JSON object intended for a CI step to gate on (e.g. `jq .pass` or a
 * one-line Node check that exits non-zero on failure). This is a summary view of a
 * BudgetEvaluation, not a new persisted format -- it is not migrated or schema-versioned on its
 * own because CI is expected to regenerate it every run.
 */
export function buildCiGateSummary(evaluation: BudgetEvaluation): { pass: boolean; budgetName: string; failures: { metric: string; reason: string }[] } {
  return {
    pass: evaluation.pass,
    budgetName: evaluation.budgetName,
    failures: evaluation.results.filter((result) => !result.pass).map((result) => ({ metric: result.metric, reason: result.reason })),
  };
}
