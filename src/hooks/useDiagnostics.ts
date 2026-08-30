import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NETWORKS, type NetworkName } from '../lib/stellar';
import {
  DEFAULT_BUNDLE_INCLUSION,
  browserDiagnosticRepository,
  browserTroubleshootingService,
  buildDiagnosticBundle,
  collectEnvironmentSnapshot,
  collectFeatureFlags,
  collectServiceWorkerState,
  compareDiagnosticBundles,
  diagnosticCollector,
  downloadDiagnosticBundle,
  parseDiagnosticBundle,
  type BrowserDiagnosticRepository,
  type DiagnosticCollector,
} from '../lib/diagnostics';
import type {
  BundleInclusion,
  DiagnosticBundle,
  DiagnosticBundleComparison,
  DiagnosticBundlePreview,
  DiagnosticCategory,
  DiagnosticProblem,
  DiagnosticRepository,
  DiagnosticRepositoryState,
  DiagnosticSnapshot,
  DiagnosticsViewState,
  EndpointHealth,
  EnvironmentSnapshot,
  FeatureFlagSnapshot,
  RedactionRule,
  ServiceWorkerDiagnosticState,
  TroubleshootingFlowId,
  TroubleshootingRun,
  TroubleshootingService,
} from '../types/diagnostics';

interface UseDiagnosticsOptions {
  collector?: DiagnosticCollector;
  repository?: DiagnosticRepository | BrowserDiagnosticRepository;
  troubleshootingService?: TroubleshootingService;
  now?: () => Date;
  featureFlags?: Record<string, boolean>;
  autoInitialize?: boolean;
}

export interface DiagnosticsHookError {
  operation: 'initialize' | 'troubleshoot' | 'preview' | 'import' | 'compare' | 'storage';
  problem: DiagnosticProblem;
}

function endpointHealthFromRun(network: NetworkName, run: TroubleshootingRun): EndpointHealth[] {
  return run.results
    .filter((result) => ['endpoint-reachable', 'rpc-responsive'].includes(result.checkId))
    .map((result) => ({
      id: `${network}:${result.checkId === 'endpoint-reachable' ? 'horizon' : 'soroban-rpc'}`,
      kind:
        result.checkId === 'endpoint-reachable' ? ('horizon' as const) : ('soroban-rpc' as const),
      state:
        result.status === 'pass'
          ? ('healthy' as const)
          : result.status === 'warning'
            ? ('degraded' as const)
            : result.status === 'fail'
              ? ('unreachable' as const)
              : ('unknown' as const),
      checkedAt: result.completedAt,
      latencyMs: result.durationMs,
      requestId: run.correlationId,
      detail: result.summary,
    }));
}

function deriveViewState(
  loading: boolean,
  snapshot: DiagnosticSnapshot,
  repository: DiagnosticRepositoryState,
  error: DiagnosticsHookError | null
): DiagnosticsViewState {
  if (loading) return 'loading';
  if (error && snapshot.events.length === 0) return 'error';
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
  if (snapshot.events.length === 0 && snapshot.breadcrumbs.length === 0) return 'empty';
  if (
    repository.persistence === 'memory-only' ||
    snapshot.events.some((event) => ['failure', 'degraded'].includes(event.outcome))
  ) {
    return 'degraded';
  }
  return 'success';
}

export default function useDiagnostics(network: NetworkName, options: UseDiagnosticsOptions = {}) {
  const collector = options.collector ?? diagnosticCollector;
  const repository = options.repository ?? browserDiagnosticRepository;
  const troubleshootingService = options.troubleshootingService ?? browserTroubleshootingService;
  const now = useMemo(() => options.now ?? (() => new Date()), [options.now]);
  const featureFlagsInput = useMemo(() => options.featureFlags ?? {}, [options.featureFlags]);
  const [snapshot, setSnapshot] = useState<DiagnosticSnapshot>(() => collector.getSnapshot());
  const [repositoryState, setRepositoryState] = useState<DiagnosticRepositoryState>(() =>
    repository.load()
  );
  const [environment, setEnvironment] = useState<EnvironmentSnapshot | null>(null);
  const [featureFlags, setFeatureFlags] = useState<FeatureFlagSnapshot[]>(() =>
    collectFeatureFlags(featureFlagsInput)
  );
  const [serviceWorker, setServiceWorker] = useState<ServiceWorkerDiagnosticState | null>(null);
  const [endpointHealth, setEndpointHealth] = useState<EndpointHealth[]>([]);
  const [runs, setRuns] = useState<TroubleshootingRun[]>([]);
  const [runningFlow, setRunningFlow] = useState<TroubleshootingFlowId | null>(null);
  const [inclusion, setInclusion] = useState<BundleInclusion>(DEFAULT_BUNDLE_INCLUSION);
  const [preview, setPreview] = useState<DiagnosticBundlePreview | null>(null);
  const [importedBundle, setImportedBundle] = useState<DiagnosticBundle | null>(null);
  const [comparison, setComparison] = useState<DiagnosticBundleComparison | null>(null);
  const [loading, setLoading] = useState(options.autoInitialize !== false);
  const [error, setError] = useState<DiagnosticsHookError | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const automaticInitializationStartedRef = useRef(false);

  const initialize = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextEnvironment, nextWorker] = await Promise.all([
        collectEnvironmentSnapshot(now()),
        collectServiceWorkerState(now()),
      ]);
      setEnvironment(nextEnvironment);
      setServiceWorker(nextWorker);
      setFeatureFlags(collectFeatureFlags(featureFlagsInput));
      setRepositoryState(repository.cleanup(now()));
      collector.addBreadcrumb({
        action: 'Opened local diagnostics workspace',
        feature: 'diagnostics',
        detail: { network, transport: 'none' },
      });
    } catch (cause) {
      setError({
        operation: 'initialize',
        problem: {
          code: 'capture-failed',
          message: cause instanceof Error ? cause.message : 'Diagnostic initialization failed.',
          retryable: true,
        },
      });
    } finally {
      setLoading(false);
    }
  }, [collector, featureFlagsInput, network, now, repository]);

  useEffect(() => collector.subscribe(setSnapshot), [collector]);

  useEffect(() => {
    if (options.autoInitialize !== false && !automaticInitializationStartedRef.current) {
      automaticInitializationStartedRef.current = true;
      void initialize();
    }
    return () => controllerRef.current?.abort();
  }, [initialize, options.autoInitialize]);

  const runFlow = useCallback(
    async (flowId: TroubleshootingFlowId) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setRunningFlow(flowId);
      setError(null);
      collector.addBreadcrumb({
        action: `Started troubleshooting flow: ${flowId}`,
        feature: 'diagnostics',
      });
      try {
        const config = NETWORKS[network];
        const run = await troubleshootingService.run(flowId, {
          signal: controller.signal,
          horizonUrl: config.horizonUrl || undefined,
          rpcUrl: config.sorobanUrl || undefined,
          now,
          events: snapshot.events,
        });
        if (controller.signal.aborted) return null;
        setRuns((current) => [run, ...current].slice(0, 50));
        const health = endpointHealthFromRun(network, run);
        if (health.length) {
          setEndpointHealth((current) => {
            const replaced = current.filter((item) => !health.some((next) => next.id === item.id));
            return [...health, ...replaced].slice(0, 50);
          });
        }
        collector.capture({
          category: 'runtime',
          severity: run.status === 'action-needed' ? 'warning' : 'info',
          name: 'troubleshooting.completed',
          message: `Troubleshooting flow completed with status ${run.status}.`,
          outcome: run.status === 'resolved' ? 'success' : 'degraded',
          details: {
            flowId,
            checks: run.results.map((result) => ({ id: result.checkId, status: result.status })),
          },
          correlationId: run.correlationId,
          feature: 'diagnostics',
        });
        return run;
      } catch (cause) {
        if (controller.signal.aborted) return null;
        setError({
          operation: 'troubleshoot',
          problem: {
            code: 'check-failed',
            message: cause instanceof Error ? cause.message : 'Troubleshooting flow failed.',
            retryable: true,
            context: flowId,
          },
        });
        return null;
      } finally {
        if (!controller.signal.aborted) setRunningFlow(null);
      }
    },
    [collector, network, now, snapshot.events, troubleshootingService]
  );

  const cancelFlow = useCallback(() => {
    controllerRef.current?.abort();
    setRunningFlow(null);
  }, []);

  const createPreview = useCallback(async () => {
    setError(null);
    try {
      const nextPreview = await buildDiagnosticBundle({
        events: snapshot.events,
        breadcrumbs: snapshot.breadcrumbs,
        environment: environment ?? undefined,
        featureFlags,
        endpointHealth,
        serviceWorker: serviceWorker ?? undefined,
        troubleshootingRuns: runs,
        inclusion,
        now: now(),
      });
      setPreview(nextPreview);
      collector.addBreadcrumb({
        action: 'Generated diagnostic bundle preview',
        feature: 'diagnostics',
        detail: {
          eventCount: nextPreview.eventCount,
          byteLength: nextPreview.byteLength,
          downloaded: false,
        },
      });
      return nextPreview;
    } catch (cause) {
      setError({
        operation: 'preview',
        problem: {
          code: 'capture-failed',
          message: cause instanceof Error ? cause.message : 'Bundle preview failed.',
          retryable: true,
        },
      });
      return null;
    }
  }, [
    collector,
    endpointHealth,
    environment,
    featureFlags,
    inclusion,
    now,
    runs,
    serviceWorker,
    snapshot.breadcrumbs,
    snapshot.events,
  ]);

  const savePreview = useCallback(() => {
    if (!preview) return false;
    try {
      setRepositoryState(repository.save(preview.bundle));
      return true;
    } catch (cause) {
      setError({
        operation: 'storage',
        problem: {
          code: 'storage-unavailable',
          message: cause instanceof Error ? cause.message : 'Bundle storage failed.',
          retryable: true,
        },
      });
      return false;
    }
  }, [preview, repository]);

  const exportPreview = useCallback(() => {
    if (!preview) return false;
    downloadDiagnosticBundle(preview.bundle);
    collector.addBreadcrumb({
      action: 'Downloaded diagnostic bundle locally',
      feature: 'diagnostics',
      detail: { bundleId: preview.bundle.id, transmitted: false },
    });
    return true;
  }, [collector, preview]);

  const importBundle = useCallback(
    async (file: File) => {
      setError(null);
      try {
        if (file.size > 2 * 1024 * 1024)
          throw new Error('Diagnostic bundle exceeds the 2 MiB limit.');
        const parsed = await parseDiagnosticBundle(await file.text(), { now: now() });
        setImportedBundle(parsed);
        setComparison(null);
        collector.addBreadcrumb({
          action: 'Imported diagnostic bundle for local comparison',
          feature: 'diagnostics',
          detail: { byteLength: file.size, persisted: false },
        });
        return parsed;
      } catch (cause) {
        setImportedBundle(null);
        setError({
          operation: 'import',
          problem: {
            code: /integrity/i.test(cause instanceof Error ? cause.message : '')
              ? 'integrity-failed'
              : 'invalid-bundle',
            message: cause instanceof Error ? cause.message : 'Bundle import failed.',
            retryable: false,
          },
        });
        return null;
      }
    },
    [collector, now]
  );

  const compareWithImported = useCallback(async () => {
    if (!preview || !importedBundle) return null;
    const next = await compareDiagnosticBundles(importedBundle, preview.bundle, now());
    setComparison(next);
    return next;
  }, [importedBundle, now, preview]);

  const removeSavedBundle = useCallback(
    (id: string) => setRepositoryState(repository.remove(id)),
    [repository]
  );

  const clearAll = useCallback(() => {
    collector.clear();
    setRepositoryState(repository.clear());
    setRuns([]);
    setEndpointHealth([]);
    setPreview(null);
    setImportedBundle(null);
    setComparison(null);
  }, [collector, repository]);

  const setCaptureEnabled = useCallback(
    (enabled: boolean) => collector.setEnabled(enabled),
    [collector]
  );

  const addRule = useCallback(
    (rule: RedactionRule) => {
      collector.setCustomRules([...collector.getCustomRules(), rule]);
      setPreview(null);
    },
    [collector]
  );

  const removeRule = useCallback(
    (id: string) => {
      collector.setCustomRules(collector.getCustomRules().filter((rule) => rule.id !== id));
      setPreview(null);
    },
    [collector]
  );

  const updateInclusion = useCallback((patch: Partial<BundleInclusion>) => {
    setInclusion((current) => ({ ...current, ...patch }));
    setPreview(null);
    setComparison(null);
  }, []);

  const toggleCategory = useCallback((category: DiagnosticCategory) => {
    setInclusion((current) => ({
      ...current,
      eventCategories: current.eventCategories.includes(category)
        ? current.eventCategories.filter((item) => item !== category)
        : [...current.eventCategories, category],
    }));
    setPreview(null);
  }, []);

  return {
    viewState: deriveViewState(loading, snapshot, repositoryState, error),
    snapshot,
    repositoryState,
    environment,
    featureFlags,
    serviceWorker,
    endpointHealth,
    runs,
    runningFlow,
    inclusion,
    preview,
    importedBundle,
    comparison,
    loading,
    error,
    customRules: collector.getCustomRules(),
    initialize,
    runFlow,
    cancelFlow,
    createPreview,
    savePreview,
    exportPreview,
    importBundle,
    compareWithImported,
    removeSavedBundle,
    clearAll,
    setCaptureEnabled,
    addRule,
    removeRule,
    updateInclusion,
    toggleCategory,
  };
}

export { useDiagnostics };
