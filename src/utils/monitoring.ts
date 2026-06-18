import { probeAllNetworks } from '../lib/stellar';

export interface MemorySnapshot {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

export interface NavigationSnapshot {
  domContentLoadedMs: number;
  loadEventMs: number;
  responseStartMs: number;
}

export interface LatencyPoint {
  timestamp: string;
  latency: number;
}

export interface BaseHealthSnapshot {
  timestamp: string;
  online: boolean;
  visibility: DocumentVisibilityState;
  memory: MemorySnapshot | null;
  navigation: NavigationSnapshot | null;
}

export interface HealthSnapshot extends BaseHealthSnapshot {
  networkHealth: Awaited<ReturnType<typeof probeAllNetworks>>;
  latencyHistory: LatencyPoint[];
}

export interface RuntimeErrorRecord {
  kind: string;
  message: string;
  timestamp: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function readMemory(): MemorySnapshot | null {
  const memory = performance?.memory;
  if (!memory) return null;
  return {
    usedJSHeapSize: memory.usedJSHeapSize,
    totalJSHeapSize: memory.totalJSHeapSize,
    jsHeapSizeLimit: memory.jsHeapSizeLimit,
  };
}

function readNavigationTiming(): NavigationSnapshot | null {
  const entry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  if (!entry) return null;
  return {
    domContentLoadedMs: Math.round(entry.domContentLoadedEventEnd),
    loadEventMs: Math.round(entry.loadEventEnd),
    responseStartMs: Math.round(entry.responseStart),
  };
}

export function collectHealthSnapshot(): BaseHealthSnapshot {
  return {
    timestamp: nowIso(),
    online: navigator.onLine,
    visibility: document.visibilityState,
    memory: readMemory(),
    navigation: readNavigationTiming(),
  };
}

const MAX_LATENCY_POINTS = 96;
const latencyHistory: LatencyPoint[] = [];

function recordLatencySample(latency: number): void {
  if (!Number.isFinite(latency)) return;
  latencyHistory.push({ timestamp: nowIso(), latency });
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  while (latencyHistory.length && Date.parse(latencyHistory[0].timestamp) < cutoff) {
    latencyHistory.shift();
  }
  while (latencyHistory.length > MAX_LATENCY_POINTS) {
    latencyHistory.shift();
  }
}

export async function collectSystemHealthSnapshot(): Promise<HealthSnapshot> {
  const snapshot = collectHealthSnapshot();
  let networkHealth: Awaited<ReturnType<typeof probeAllNetworks>> = [];

  try {
    networkHealth = await probeAllNetworks();

    const horizonLatencies = networkHealth
      .map((network) => network.horizon.latency)
      .filter((latency): latency is number => Number.isFinite(latency));

    if (horizonLatencies.length) {
      const avgLatency =
        horizonLatencies.reduce((sum, value) => sum + value, 0) / horizonLatencies.length;
      recordLatencySample(avgLatency);
    }
  } catch (error) {
    console.warn('Network probe failed:', error);
  }

  return {
    ...snapshot,
    networkHealth,
    latencyHistory: [...latencyHistory],
  };
}

export function computeHealthScore(snapshot: HealthSnapshot | BaseHealthSnapshot | null | undefined): number {
  if (!snapshot) return 0;
  let score = 100;

  if (!snapshot.online) score -= 40;
  if (snapshot.visibility === 'hidden') score -= 5;

  if (snapshot.memory?.jsHeapSizeLimit) {
    const ratio = snapshot.memory.usedJSHeapSize / snapshot.memory.jsHeapSizeLimit;
    if (ratio > 0.9) score -= 30;
    else if (ratio > 0.8) score -= 20;
    else if (ratio > 0.7) score -= 10;
  }

  if (snapshot.navigation?.loadEventMs && snapshot.navigation.loadEventMs > 8000) score -= 20;
  else if (snapshot.navigation?.loadEventMs && snapshot.navigation.loadEventMs > 4000) score -= 10;

  return Math.max(0, Math.min(100, score));
}

export function watchErrors(onError: (record: RuntimeErrorRecord) => void): () => void {
  function handleError(event: ErrorEvent): void {
    onError?.({
      kind: 'runtime-error',
      message: event?.message || 'Unknown runtime error',
      timestamp: nowIso(),
    });
  }

  function handleRejection(event: PromiseRejectionEvent): void {
    onError?.({
      kind: 'promise-rejection',
      message: String(event?.reason || 'Unhandled rejection'),
      timestamp: nowIso(),
    });
  }

  window.addEventListener('error', handleError);
  window.addEventListener('unhandledrejection', handleRejection);

  return () => {
    window.removeEventListener('error', handleError);
    window.removeEventListener('unhandledrejection', handleRejection);
  };
}

export default {
  collectHealthSnapshot,
  computeHealthScore,
  watchErrors,
};
