import { useCallback, useMemo, useState } from 'react';
import useResourceBaselines from './useResourceBaselines';
import useResourceBudgets from './useResourceBudgets';
import useProfileCapture from './useProfileCapture';
import { compareProfileToBaseline } from '../lib/resourceProfiling/comparisonEngine';
import { evaluateBudget } from '../lib/resourceProfiling/budgetEngine';
import { summarizeBaselineMetrics } from '../lib/resourceProfiling/statistics';
import {
  buildBaselineExport,
  buildBudgetEvaluationExport,
  buildCiGateSummary,
  buildComparisonExport,
  parseExportDocument,
  serializeExport,
} from '../lib/resourceProfiling/exportService';
import { createSampleRegressionCandidate } from '../lib/resourceProfiling/sampleFixtures';
import { ProfilingError } from '../lib/resourceProfiling/errors';
import type { ResourceProfile } from '../types/resourceProfiling';

function downloadTextFile(filename: string, contents: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type: mimeType }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * Top-level composition hook for the Resource Profiling Lab workspace. Wires together the
 * baseline/budget persistence hooks, a single capture slot, and derived comparison/budget
 * evaluation -- so the dashboard component itself stays a thin view over already-computed state.
 */
export default function useResourceProfilingLab() {
  const baselinesState = useResourceBaselines();
  const budgetsState = useResourceBudgets();
  const captureState = useProfileCapture();

  const [selectedBaselineId, setSelectedBaselineId] = useState<string | null>(null);
  const [selectedBudgetId, setSelectedBudgetId] = useState<string | null>(null);
  const [candidateProfile, setCandidateProfile] = useState<ResourceProfile | null>(null);
  const [importError, setImportError] = useState<ProfilingError | null>(null);

  const selectedBaseline = useMemo(
    () => baselinesState.baselines.find((baseline) => baseline.id === selectedBaselineId) ?? baselinesState.baselines[0] ?? null,
    [baselinesState.baselines, selectedBaselineId]
  );

  const selectedBudget = useMemo(
    () => budgetsState.budgets.find((budget) => budget.id === selectedBudgetId) ?? budgetsState.budgets[0] ?? null,
    [budgetsState.budgets, selectedBudgetId]
  );

  const effectiveCandidate = candidateProfile ?? captureState.profile;

  const comparison = useMemo(() => {
    if (!selectedBaseline || !effectiveCandidate || selectedBaseline.profiles.length === 0) return null;
    return compareProfileToBaseline(selectedBaseline, effectiveCandidate, {
      thresholds: selectedBudget?.thresholds ?? [],
    });
  }, [selectedBaseline, effectiveCandidate, selectedBudget]);

  const budgetEvaluation = useMemo(() => {
    if (!selectedBudget || !effectiveCandidate) return null;
    const baselineSummary = selectedBaseline ? summarizeBaselineMetrics(selectedBaseline.profiles) : {};
    const baselineValues = Object.fromEntries(
      Object.entries(baselineSummary).map(([metric, summary]) => [metric, summary?.mean ?? 0])
    ) as Parameters<typeof evaluateBudget>[2];
    return evaluateBudget(selectedBudget, effectiveCandidate, baselineValues);
  }, [selectedBudget, selectedBaseline, effectiveCandidate]);

  const useAsCandidate = useCallback((profile: ResourceProfile) => {
    setCandidateProfile(profile);
  }, []);

  const clearCandidate = useCallback(() => {
    setCandidateProfile(null);
    captureState.reset();
  }, [captureState]);

  const saveCandidateToBaseline = useCallback(
    async (baselineId: string) => {
      if (!effectiveCandidate) return;
      await baselinesState.appendSample(baselineId, effectiveCandidate);
    },
    [baselinesState, effectiveCandidate]
  );

  const loadSampleData = useCallback(async () => {
    const baseline = await baselinesState.loadSampleBaseline();
    setSelectedBaselineId(baseline.id);
    setCandidateProfile(createSampleRegressionCandidate());
  }, [baselinesState]);

  const exportBaselineJson = useCallback((redact: boolean) => {
    if (!selectedBaseline) return;
    const document = buildBaselineExport(selectedBaseline, { redact });
    downloadTextFile(`${selectedBaseline.name.replace(/\s+/g, '-').toLowerCase()}-baseline.json`, serializeExport(document), 'application/json');
  }, [selectedBaseline]);

  const exportComparisonJson = useCallback((redact: boolean) => {
    if (!comparison) return;
    const document = buildComparisonExport(comparison, { redact });
    downloadTextFile(`resource-comparison-${comparison.id.slice(0, 8)}.json`, serializeExport(document), 'application/json');
  }, [comparison]);

  const exportCiGate = useCallback(() => {
    if (!budgetEvaluation) return;
    const document = buildBudgetEvaluationExport(budgetEvaluation, { redact: true });
    downloadTextFile(`resource-budget-${budgetEvaluation.budgetId}.json`, serializeExport(document), 'application/json');
    const summary = buildCiGateSummary(budgetEvaluation);
    downloadTextFile(`resource-budget-${budgetEvaluation.budgetId}-ci-summary.json`, JSON.stringify(summary, null, 2), 'application/json');
  }, [budgetEvaluation]);

  const importBaselineFromFile = useCallback(
    async (file: File) => {
      setImportError(null);
      try {
        const text = await file.text();
        const document = parseExportDocument(text);
        if (document.kind !== 'baseline') {
          throw new ProfilingError({ code: 'invalid-input', message: `Expected a baseline export, got "${document.kind}".`, retryable: false });
        }
        const baseline = await baselinesState.importBaseline(document.payload);
        setSelectedBaselineId(baseline.id);
      } catch (cause) {
        setImportError(
          cause instanceof ProfilingError ? cause : new ProfilingError({ code: 'invalid-input', message: 'Unable to import baseline file.', retryable: false })
        );
      }
    },
    [baselinesState]
  );

  return {
    baselines: baselinesState,
    budgets: budgetsState,
    capture: captureState,
    selectedBaseline,
    selectedBaselineId: selectedBaseline?.id ?? null,
    setSelectedBaselineId,
    selectedBudget,
    selectedBudgetId: selectedBudget?.id ?? null,
    setSelectedBudgetId,
    candidateProfile: effectiveCandidate,
    useAsCandidate,
    clearCandidate,
    saveCandidateToBaseline,
    comparison,
    budgetEvaluation,
    loadSampleData,
    exportBaselineJson,
    exportComparisonJson,
    exportCiGate,
    importBaselineFromFile,
    importError,
  };
}

export type ResourceProfilingLab = ReturnType<typeof useResourceProfilingLab>;
