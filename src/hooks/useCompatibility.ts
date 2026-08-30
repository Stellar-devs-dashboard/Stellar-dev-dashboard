import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  COMPATIBILITY_SCHEMA_VERSION,
  type AuditArtifact,
  type CompatibilityAssessment,
  type DashboardFeatureId,
  type EndpointComparisonResult,
  type MaintainerOverride,
  type NetworkProbeResult,
  type NetworkProbeTarget,
  type ProbeService,
  type UpgradeReadinessAudit,
} from '../types/compatibility';
import { NETWORKS, getCustomNetworkAuthHeaders, type NetworkName } from '../lib/stellar';
import {
  assessCompatibility,
  browserNetworkProbeService,
  compareEndpoints,
  discoverLocalArtifacts,
  loadOverrides,
  loadProbe,
  runUpgradeReadinessAudit,
  saveOverrides,
  saveProbe,
} from '../lib/compatibility';

export type CompatibilityViewState =
  'loading' | 'empty' | 'success' | 'error' | 'offline' | 'degraded';

export interface CompatibilityHookError {
  code:
    'invalid-network' | 'probe-failed' | 'comparison-failed' | 'audit-failed' | 'storage-failed';
  message: string;
  retryable: boolean;
}

interface UseCompatibilityOptions {
  service?: ProbeService;
  autoProbe?: boolean;
  now?: () => Date;
}

function makeId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function buildProbeTarget(network: NetworkName): NetworkProbeTarget {
  const config = NETWORKS[network];
  if (!config.horizonUrl || !config.sorobanUrl) {
    throw new Error(
      network === 'custom'
        ? 'Complete the custom Horizon URL, Soroban RPC URL, and passphrase before probing.'
        : `${config.name} has no configured Soroban RPC endpoint.`
    );
  }
  return {
    id: `network:${network}`,
    label: config.name,
    network,
    horizonUrl: config.horizonUrl,
    rpcUrl: config.sorobanUrl,
    expectedPassphrase: config.passphrase || undefined,
    ...(network === 'custom' ? { headers: getCustomNetworkAuthHeaders() } : {}),
  };
}

function cachedProbeAsOffline(cached: NetworkProbeResult, now: Date): NetworkProbeResult {
  return {
    ...cached,
    completedAt: cached.completedAt,
    online: false,
    evidence: cached.evidence.map((item) => ({
      ...item,
      source: 'cache',
      confidence: 'cached',
      detail: item.detail ? `${item.detail} Cached; offline.` : 'Cached; offline.',
    })),
    warnings: [
      ...cached.warnings,
      `Offline mode is showing evidence cached at ${cached.completedAt}.`,
    ],
    errors: [
      ...cached.errors.filter((problem) => problem.code !== 'offline'),
      {
        code: 'offline',
        source: 'browser',
        message: `Offline mode; last successful observation was ${cached.completedAt}.`,
        retryable: true,
        endpoint: 'browser',
        context: now.toISOString(),
      },
    ],
  };
}

function deriveViewState(
  loading: boolean,
  assessment: CompatibilityAssessment | null,
  error: CompatibilityHookError | null
): CompatibilityViewState {
  if (loading && !assessment) return 'loading';
  if (error && !assessment) return 'error';
  if (!assessment) return 'empty';
  if (assessment.status === 'offline') return 'offline';
  if (assessment.status !== 'compatible') return 'degraded';
  return 'success';
}

export function useCompatibility(network: NetworkName, options: UseCompatibilityOptions = {}) {
  const service = options.service ?? browserNetworkProbeService;
  const now = useMemo(() => options.now ?? (() => new Date()), [options.now]);
  const [probe, setProbe] = useState<NetworkProbeResult | null>(null);
  const [assessment, setAssessment] = useState<CompatibilityAssessment | null>(null);
  const [comparisonProbes, setComparisonProbes] = useState<NetworkProbeResult[]>([]);
  const [comparison, setComparison] = useState<EndpointComparisonResult | null>(null);
  const [audit, setAudit] = useState<UpgradeReadinessAudit | null>(null);
  const [artifacts, setArtifacts] = useState<AuditArtifact[]>(() => discoverLocalArtifacts());
  const [overrides, setOverridesState] = useState<MaintainerOverride[]>(() => loadOverrides());
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<CompatibilityHookError | null>(null);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const commitProbe = useCallback(
    (nextProbe: NetworkProbeResult, nextOverrides = overrides) => {
      const nextAssessment = assessCompatibility(nextProbe, {
        overrides: nextOverrides,
        now: now(),
      });
      setProbe(nextProbe);
      setAssessment(nextAssessment);
      setComparisonProbes((current) => {
        const withoutPrimary = current.filter((item) => item.target.id !== nextProbe.target.id);
        const next = [nextProbe, ...withoutPrimary];
        setComparison(next.length >= 2 ? compareEndpoints(next, now()) : null);
        return next;
      });
      setAudit(null);
    },
    [now, overrides]
  );

  const refresh = useCallback(
    async (force = true) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setError(null);
      if (probe) setRefreshing(true);
      else setLoading(true);

      try {
        const target = buildProbeTarget(network);
        const cached = loadProbe(target.id);
        const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
        if (offline && cached) {
          commitProbe(cachedProbeAsOffline(cached, now()));
          return;
        }
        if (!force && cached && Date.parse(cached.expiresAt) > now().getTime()) {
          commitProbe(cached);
          return;
        }
        const result = await service.probe(target, {
          signal: controller.signal,
          timeoutMs: 8_000,
          cacheTtlMs: 5 * 60_000,
          now,
        });
        if (controller.signal.aborted) return;
        commitProbe(result);
        if (result.online) {
          try {
            saveProbe(result);
            setStorageWarning(null);
          } catch {
            setStorageWarning('Probe succeeded, but browser storage rejected the redacted cache.');
          }
        }
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError({
          code: /custom|configured/i.test(cause instanceof Error ? cause.message : '')
            ? 'invalid-network'
            : 'probe-failed',
          message: cause instanceof Error ? cause.message : 'Compatibility probe failed.',
          retryable: true,
        });
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [commitProbe, network, now, probe, service]
  );

  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    setProbe(null);
    setAssessment(null);
    setComparisonProbes([]);
    setComparison(null);
    setAudit(null);
    setError(null);
    if (options.autoProbe !== false) void refreshRef.current(false);
    return () => controllerRef.current?.abort();
  }, [network, options.autoProbe]);

  useEffect(() => {
    const handleOnline = () => void refresh(true);
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [refresh]);

  const addComparisonEndpoint = useCallback(
    async (input: { label: string; rpcUrl: string; horizonUrl?: string }) => {
      if (!probe) {
        setError({
          code: 'comparison-failed',
          message: 'Probe the primary endpoint first.',
          retryable: true,
        });
        return null;
      }
      let parsedRpc: URL;
      try {
        parsedRpc = new URL(input.rpcUrl);
        if (!['http:', 'https:'].includes(parsedRpc.protocol))
          throw new Error('Unsupported protocol');
      } catch {
        setError({
          code: 'comparison-failed',
          message: 'Comparison RPC URL must be an absolute HTTP or HTTPS URL.',
          retryable: false,
        });
        return null;
      }
      const label = input.label.trim().slice(0, 80) || parsedRpc.host;
      const target: NetworkProbeTarget = {
        id: makeId('comparison'),
        label,
        network,
        rpcUrl: parsedRpc.toString(),
        horizonUrl: input.horizonUrl?.trim() || probe.target.horizonUrl,
        expectedPassphrase: probe.identity.passphrase ?? undefined,
      };
      setRefreshing(true);
      setError(null);
      try {
        const result = await service.probe(target, {
          timeoutMs: 8_000,
          cacheTtlMs: 5 * 60_000,
          now,
        });
        const next = [
          probe,
          ...comparisonProbes.filter((item) => item.target.id !== probe.target.id),
          result,
        ]
          .filter(
            (item, index, all) =>
              all.findIndex((candidate) => candidate.target.id === item.target.id) === index
          )
          .slice(0, 5);
        setComparisonProbes(next);
        const nextComparison = compareEndpoints(next, now());
        setComparison(nextComparison);
        return nextComparison;
      } catch (cause) {
        setError({
          code: 'comparison-failed',
          message: cause instanceof Error ? cause.message : 'Comparison endpoint probe failed.',
          retryable: true,
        });
        return null;
      } finally {
        setRefreshing(false);
      }
    },
    [comparisonProbes, network, now, probe, service]
  );

  const removeComparisonEndpoint = useCallback(
    (targetId: string) => {
      if (!probe || targetId === probe.target.id) return;
      const next = comparisonProbes.filter((item) => item.target.id !== targetId);
      setComparisonProbes(next);
      setComparison(next.length >= 2 ? compareEndpoints(next, now()) : null);
    },
    [comparisonProbes, now, probe]
  );

  const addOverride = useCallback(
    (input: {
      featureId: DashboardFeatureId | '*';
      forcedStatus: MaintainerOverride['forcedStatus'];
      reason: string;
      author: string;
      expiresAt: string;
    }) => {
      if (!probe || input.reason.trim().length < 10 || input.author.trim().length < 2) {
        setError({
          code: 'storage-failed',
          message:
            'Override requires a feature, author, expiry, and a reason of at least 10 characters.',
          retryable: false,
        });
        return false;
      }
      const expiry = Date.parse(input.expiresAt);
      if (
        !Number.isFinite(expiry) ||
        expiry <= now().getTime() ||
        expiry > now().getTime() + 30 * 24 * 60 * 60_000
      ) {
        setError({
          code: 'storage-failed',
          message: 'Override expiry must be in the future and no more than 30 days away.',
          retryable: false,
        });
        return false;
      }
      const nextOverride: MaintainerOverride = {
        id: makeId('override'),
        schemaVersion: COMPATIBILITY_SCHEMA_VERSION,
        targetId: probe.target.id,
        featureId: input.featureId,
        forcedStatus: input.forcedStatus,
        reason: input.reason.trim().slice(0, 500),
        author: input.author.trim().slice(0, 100),
        createdAt: now().toISOString(),
        expiresAt: new Date(expiry).toISOString(),
      };
      const next = [nextOverride, ...overrides].slice(0, 100);
      try {
        saveOverrides(next);
        setOverridesState(next);
        commitProbe(probe, next);
        setError(null);
        return true;
      } catch (cause) {
        setError({
          code: 'storage-failed',
          message: cause instanceof Error ? cause.message : 'Override could not be saved.',
          retryable: true,
        });
        return false;
      }
    },
    [commitProbe, now, overrides, probe]
  );

  const removeOverride = useCallback(
    (overrideId: string) => {
      const next = overrides.filter((override) => override.id !== overrideId);
      try {
        saveOverrides(next);
        setOverridesState(next);
        if (probe) commitProbe(probe, next);
      } catch (cause) {
        setError({
          code: 'storage-failed',
          message: cause instanceof Error ? cause.message : 'Override could not be removed.',
          retryable: true,
        });
      }
    },
    [commitProbe, overrides, probe]
  );

  const runAudit = useCallback(
    (targetProtocol: number, inventory = artifacts) => {
      if (!assessment) {
        setError({
          code: 'audit-failed',
          message: 'Probe the network before running an audit.',
          retryable: true,
        });
        return null;
      }
      try {
        const result = runUpgradeReadinessAudit(inventory, targetProtocol, assessment, now());
        setArtifacts(inventory);
        setAudit(result);
        setError(null);
        return result;
      } catch (cause) {
        setError({
          code: 'audit-failed',
          message: cause instanceof Error ? cause.message : 'Upgrade audit failed.',
          retryable: false,
        });
        return null;
      }
    },
    [artifacts, assessment, now]
  );

  const replaceArtifacts = useCallback((inventory: AuditArtifact[]) => {
    setArtifacts(inventory.slice(0, 1_000));
    setAudit(null);
  }, []);

  const clearError = useCallback(() => setError(null), []);
  const viewState = useMemo(
    () => deriveViewState(loading, assessment, error),
    [assessment, error, loading]
  );
  const featureGate = useCallback(
    (featureId: DashboardFeatureId) =>
      assessment?.features.find((feature) => feature.feature.id === featureId) ?? null,
    [assessment]
  );

  return {
    probe,
    assessment,
    comparison,
    comparisonProbes,
    audit,
    artifacts,
    overrides,
    loading,
    refreshing,
    error,
    storageWarning,
    viewState,
    refresh,
    addComparisonEndpoint,
    removeComparisonEndpoint,
    addOverride,
    removeOverride,
    runAudit,
    replaceArtifacts,
    clearError,
    featureGate,
  };
}

export default useCompatibility;
