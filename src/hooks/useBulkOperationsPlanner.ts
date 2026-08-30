import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NetworkName } from '../lib/stellar';
import {
  bulkRepository,
  buildDemoManifest,
  BulkPlannerError,
  createCheckpoint,
  createSimulatedExecutor,
  defaultCsvImportOptions,
  defaultPlannerPreferences,
  detectDelimiter,
  dryRunPlan,
  exportManifestJson,
  exportReconciliationCsv,
  exportRunBundle,
  importCsvManifest,
  importCsvPreview,
  importExportEnvelope,
  persistManifest,
  persistRun,
  planManifest,
  readBulkImportFile,
  reconciliationToCsvRows,
  buildReconciliationReport,
  runBulkExecution,
  toBulkPlannerError,
  type BulkExecutorControl,
  updateManifestRunMeta,
  type BulkExecutionPlan,
  type BulkImportPreview,
  type BulkManifest,
  type BulkPlannerPreferences,
  type BulkProgressEvent,
  type BulkReconciliationReport,
  type BulkRunCheckpoint,
  type BulkRunReceipt,
  type BulkValidationReport,
  type BulkCsvImportOptions,
} from '../lib/bulkOperationsPlanner';
import { DEMO_CSV_PAYMENTS, DEMO_SEQUENCE_NUMBERS } from '../lib/bulkOperationsPlanner/fixtures';

const PREFS_KEY = 'stellar:bulk-operations:preferences';

export interface BulkPlannerViewState {
  activeTab: 'import' | 'preview' | 'plan' | 'execute' | 'receipts' | 'settings' | 'graph' | 'timeline';
}

export interface BulkPlannerUiState extends BulkPlannerViewState {
  csvText: string;
  importPreview: BulkImportPreview | null;
  message: string;
  error: BulkPlannerError | null;
}

function loadPreferences(): BulkPlannerPreferences {
  try {
    const stored = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<BulkPlannerPreferences>;
    return { ...defaultPlannerPreferences(), ...stored };
  } catch {
    return defaultPlannerPreferences();
  }
}

function savePreferences(preferences: BulkPlannerPreferences): void {
  localStorage.setItem(PREFS_KEY, JSON.stringify(preferences));
}

export default function useBulkOperationsPlanner(accountId: string | null, network: NetworkName) {
  const [manifest, setManifest] = useState<BulkManifest | null>(null);
  const [validation, setValidation] = useState<BulkValidationReport | null>(null);
  const [plan, setPlan] = useState<BulkExecutionPlan | null>(null);
  const [checkpoint, setCheckpoint] = useState<BulkRunCheckpoint | null>(null);
  const [receipt, setReceipt] = useState<BulkRunReceipt | null>(null);
  const [reconciliation, setReconciliation] = useState<BulkReconciliationReport | null>(null);
  const [progressEvents, setProgressEvents] = useState<BulkProgressEvent[]>([]);
  const [preferences, setPreferencesState] = useState<BulkPlannerPreferences>(loadPreferences);
  const [csvText, setCsvText] = useState('');
  const [csvOptions, setCsvOptions] = useState<BulkCsvImportOptions>(() => defaultCsvImportOptions(accountId ?? undefined));
  const [importPreview, setImportPreview] = useState<BulkImportPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<BulkPlannerError | null>(null);
  const [activeTab, setActiveTab] = useState<BulkPlannerViewState['activeTab']>('import');
  const [savedManifests, setSavedManifests] = useState<string[]>([]);
  const executorControl = useRef<BulkExecutorControl | null>(null);

  useEffect(() => {
    setCsvOptions((current) => ({
      ...current,
      defaultSourceAccount: accountId ?? current.defaultSourceAccount,
    }));
  }, [accountId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const records = await bulkRepository.listManifests();
        if (!cancelled) setSavedManifests(records.map((record) => record.id));
      } catch {
        if (!cancelled) setSavedManifests([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [manifest?.id]);

  const resetError = useCallback(() => setError(null), []);

  const loadDemoManifest = useCallback(async () => {
    resetError();
    setLoading(true);
    try {
      const demo = await buildDemoManifest();
      setManifest(demo);
      setCsvText(DEMO_CSV_PAYMENTS);
      setImportPreview(null);
      setPlan(null);
      setCheckpoint(null);
      setReceipt(null);
      setReconciliation(null);
      setMessage('Loaded demo manifest');
      setActiveTab('preview');
    } catch (caught) {
      setError(toBulkPlannerError(caught));
    } finally {
      setLoading(false);
    }
  }, [resetError]);

  const loadDemoCsv = useCallback(() => {
    setCsvText(DEMO_CSV_PAYMENTS);
    setMessage('Loaded demo CSV template');
  }, []);

  const previewImport = useCallback(() => {
    resetError();
    try {
      const delimiter = csvOptions.delimiter || detectDelimiter(csvText);
      const preview = importCsvPreview(csvText, { ...csvOptions, delimiter });
      setImportPreview(preview);
      setMessage(`Preview ready — ${preview.mappedOperations.length} mapped operation(s)`);
      setActiveTab('preview');
    } catch (caught) {
      setError(toBulkPlannerError(caught));
    }
  }, [csvOptions, csvText, resetError]);

  const commitImport = useCallback(async () => {
    if (!accountId) {
      setError(new BulkPlannerError('IMPORT_FAILED', 'Connect an account before importing CSV'));
      return;
    }
    resetError();
    setLoading(true);
    try {
      const delimiter = csvOptions.delimiter || detectDelimiter(csvText);
      const imported = await importCsvManifest(
        csvText,
        {
          id: `bulk-${network}-${Date.now()}`,
          name: 'Imported bulk manifest',
          network,
          sourceAccount: accountId,
        },
        { ...csvOptions, delimiter }
      );
      setManifest(imported);
      setImportPreview(importCsvPreview(csvText, { ...csvOptions, delimiter }));
      setPlan(null);
      setCheckpoint(null);
      setReceipt(null);
      setMessage('CSV imported into manifest');
      setActiveTab('plan');
    } catch (caught) {
      setError(toBulkPlannerError(caught));
    } finally {
      setLoading(false);
    }
  }, [accountId, csvOptions, csvText, network, resetError]);

  const planCurrentManifest = useCallback(async () => {
    if (!manifest) return;
    resetError();
    setLoading(true);
    try {
      const sequenceNumbers = accountId ? { ...DEMO_SEQUENCE_NUMBERS, [accountId]: 1_000_001 } : DEMO_SEQUENCE_NUMBERS;
      const result = await planManifest(manifest, sequenceNumbers, preferences);
      setManifest(result.manifest);
      setValidation(result.validation);
      setPlan(result.plan);
      setMessage(`Plan ready — ${result.plan.totalPacks} pack(s), ~${result.plan.estimatedFeeStroops} stroops`);
      setActiveTab('execute');
    } catch (caught) {
      setError(toBulkPlannerError(caught));
    } finally {
      setLoading(false);
    }
  }, [accountId, manifest, preferences, resetError]);

  const dryRunCurrentPlan = useCallback(() => {
    if (!manifest || !plan) return;
    resetError();
    const result = dryRunPlan(manifest, plan);
    setValidation(result.validation);
    const failures = result.simulatedOutcomes.filter((item) => !item.wouldSucceed);
    setMessage(
      failures.length === 0
        ? 'Dry run: all operations would succeed'
        : `Dry run: ${failures.length} operation(s) blocked`
    );
  }, [manifest, plan, resetError]);

  const startExecution = useCallback(async () => {
    if (!manifest || !plan) return;
    resetError();
    setExecuting(true);
    setProgressEvents([]);
    try {
      const runId = `run-${Date.now()}`;
      const initial = createCheckpoint(runId, manifest, plan, accountId ? { [accountId]: 1_000_001 } : DEMO_SEQUENCE_NUMBERS);
      setCheckpoint(initial);

      const hooks = createSimulatedExecutor({
        onProgress: (event) => setProgressEvents((current) => [...current, event]),
        onCheckpoint: (next) => setCheckpoint(next),
      });

      const result = await runBulkExecution({ manifest, plan, checkpoint: initial }, hooks);
      executorControl.current = result.control;
      setCheckpoint(result.checkpoint);
      setReceipt(result.receipt);
      const report = buildReconciliationReport(manifest, result.checkpoint, result.receipt);
      setReconciliation(report);
      await persistRun(result.checkpoint, result.receipt);
      await updateManifestRunMeta(manifest.id, runId, result.checkpoint.status);
      setMessage(result.checkpoint.status === 'completed' ? 'Bulk run completed' : 'Bulk run finished with failures');
      setActiveTab('receipts');
    } catch (caught) {
      setError(toBulkPlannerError(caught));
    } finally {
      setExecuting(false);
    }
  }, [accountId, manifest, plan, resetError]);

  const pauseExecution = useCallback(() => {
    executorControl.current?.pause();
    setMessage('Pause requested');
  }, []);

  const resumeExecution = useCallback(() => {
    executorControl.current?.resume();
    setMessage('Resume requested');
  }, []);

  const cancelExecution = useCallback(() => {
    executorControl.current?.cancel();
    setMessage('Cancel requested');
  }, []);

  const saveCurrentManifest = useCallback(async () => {
    if (!manifest) return;
    resetError();
    try {
      await persistManifest(manifest);
      setSavedManifests((current) => [...new Set([...current, manifest.id])]);
      setMessage('Manifest saved locally');
    } catch (caught) {
      setError(toBulkPlannerError(caught));
    }
  }, [manifest, resetError]);

  const exportManifest = useCallback(async () => {
    if (!manifest) return;
    resetError();
    try {
      const json = await exportManifestJson(manifest, true);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${manifest.id}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage('Manifest exported');
    } catch (caught) {
      setError(toBulkPlannerError(caught));
    }
  }, [manifest, resetError]);

  const exportRun = useCallback(async () => {
    if (!manifest || !plan || !checkpoint) return;
    resetError();
    try {
      const json = await exportRunBundle(manifest, plan, checkpoint, receipt ?? undefined, true);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${checkpoint.runId}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage('Run bundle exported');
    } catch (caught) {
      setError(toBulkPlannerError(caught));
    }
  }, [checkpoint, manifest, plan, receipt, resetError]);

  const exportReconciliation = useCallback(() => {
    if (!reconciliation) return;
    const csv = exportReconciliationCsv(reconciliationToCsvRows(reconciliation));
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `bulk-reconciliation-${reconciliation.runId}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage('Reconciliation CSV exported');
  }, [reconciliation]);

  const importEnvelopeFile = useCallback(async (file: File) => {
    resetError();
    setLoading(true);
    try {
      const text = await readBulkImportFile(file);
      const envelope = await importExportEnvelope(text);
      setManifest(envelope.manifest);
      setPlan(envelope.plan ?? null);
      setCheckpoint(envelope.checkpoint ?? null);
      setReceipt(envelope.receipt ?? null);
      if (envelope.checkpoint) {
        setReconciliation(buildReconciliationReport(envelope.manifest, envelope.checkpoint, envelope.receipt));
      }
      setMessage('Import envelope loaded');
    } catch (caught) {
      setError(toBulkPlannerError(caught));
    } finally {
      setLoading(false);
    }
  }, [resetError]);

  const updatePreferences = useCallback((patch: Partial<BulkPlannerPreferences>) => {
    setPreferencesState((current) => {
      const next = { ...current, ...patch };
      savePreferences(next);
      return next;
    });
  }, []);

  const stats = useMemo(() => {
    if (!manifest) return null;
    return {
      operations: manifest.operations.length,
      packs: plan?.totalPacks ?? 0,
      fee: plan?.estimatedFeeStroops ?? 0,
      progress: checkpoint ? Math.round((checkpoint.operationStates.filter((s) => s.status === 'completed').length / manifest.operations.length) * 100) : 0,
    };
  }, [checkpoint, manifest, plan]);

  return {
    manifest,
    validation,
    plan,
    checkpoint,
    receipt,
    reconciliation,
    progressEvents,
    preferences,
    csvText,
    setCsvText,
    csvOptions,
    setCsvOptions,
    importPreview,
    loading,
    executing,
    message,
    error,
    activeTab,
    setActiveTab,
    savedManifests,
    stats,
    loadDemoManifest,
    loadDemoCsv,
    previewImport,
    commitImport,
    planCurrentManifest,
    dryRunCurrentPlan,
    startExecution,
    pauseExecution,
    resumeExecution,
    cancelExecution,
    saveCurrentManifest,
    exportManifest,
    exportRun,
    exportReconciliation,
    importEnvelopeFile,
    updatePreferences,
    resetError,
  };
}
