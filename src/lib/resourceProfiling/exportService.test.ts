import { describe, expect, it } from 'vitest';
import { buildBaselineExport, buildBudgetEvaluationExport, buildCiGateSummary, buildComparisonExport, parseExportDocument, serializeExport } from './exportService';
import { compareProfileToBaseline } from './comparisonEngine';
import { evaluateBudget, createDefaultBudget } from './budgetEngine';
import { createSampleBaseline, createSampleRegressionCandidate } from './sampleFixtures';
import { RESOURCE_PROFILING_SCHEMA_VERSION } from '../../types/resourceProfiling';

describe('buildBaselineExport', () => {
  it('redacts contract ids by default', () => {
    const baseline = createSampleBaseline();
    const doc = buildBaselineExport(baseline);
    expect(doc.redacted).toBe(true);
    expect(doc.schemaVersion).toBe(RESOURCE_PROFILING_SCHEMA_VERSION);
    const payload = doc.payload as typeof baseline;
    expect(payload.profiles[0].provenance.contractId).not.toBe(baseline.profiles[0].provenance.contractId);
  });

  it('preserves the original contract id when redaction is explicitly disabled', () => {
    const baseline = createSampleBaseline();
    const doc = buildBaselineExport(baseline, { redact: false });
    const payload = doc.payload as typeof baseline;
    expect(payload.profiles[0].provenance.contractId).toBe(baseline.profiles[0].provenance.contractId);
  });
});

describe('buildComparisonExport', () => {
  it('produces a versioned, round-trippable document', () => {
    const baseline = createSampleBaseline();
    const comparison = compareProfileToBaseline(baseline, createSampleRegressionCandidate());
    const doc = buildComparisonExport(comparison);
    const serialized = serializeExport(doc);
    const parsed = parseExportDocument(serialized);
    expect(parsed.kind).toBe('comparison');
    expect(parsed.schemaVersion).toBe(RESOURCE_PROFILING_SCHEMA_VERSION);
  });
});

describe('parseExportDocument', () => {
  it('rejects invalid JSON', () => {
    expect(() => parseExportDocument('not json')).toThrow();
  });

  it('rejects a document claiming a newer schema version than this build supports', () => {
    const doc = JSON.stringify({ schemaVersion: RESOURCE_PROFILING_SCHEMA_VERSION + 1, kind: 'baseline', payload: {} });
    expect(() => parseExportDocument(doc)).toThrow(/newer than this build supports/);
  });

  it('rejects an unknown export kind', () => {
    const doc = JSON.stringify({ schemaVersion: 1, kind: 'unknown-kind', payload: {} });
    expect(() => parseExportDocument(doc)).toThrow();
  });
});

describe('buildCiGateSummary', () => {
  it('summarizes a passing evaluation with no failures', () => {
    const budget = createDefaultBudget();
    const evaluation = evaluateBudget(budget, createSampleRegressionCandidate(), { cpuInstructions: 100_000_000 });
    const summary = buildCiGateSummary(evaluation);
    expect(summary.pass).toBe(true);
    expect(summary.failures).toEqual([]);
  });

  it('lists each failing metric with a human-readable reason', () => {
    const budget = createDefaultBudget();
    const evaluation = evaluateBudget(budget, createSampleRegressionCandidate(), { cpuInstructions: 100 });
    const summary = buildCiGateSummary(evaluation);
    expect(summary.pass).toBe(false);
    expect(summary.failures.length).toBeGreaterThan(0);
    expect(summary.failures[0].reason).toBeTruthy();
  });
});

describe('buildBudgetEvaluationExport', () => {
  it('tags the export kind as budget-evaluation', () => {
    const budget = createDefaultBudget();
    const evaluation = evaluateBudget(budget, createSampleRegressionCandidate());
    const doc = buildBudgetEvaluationExport(evaluation);
    expect(doc.kind).toBe('budget-evaluation');
  });
});
