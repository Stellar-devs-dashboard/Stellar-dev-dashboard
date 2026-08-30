import type {
  EnvironmentSnapshot,
  FeatureFlagSnapshot,
  ServiceWorkerDiagnosticState,
} from '../../types/diagnostics';

interface NavigatorWithMemory extends Navigator {
  userAgentData?: { mobile?: boolean; platform?: string };
}

function browserFamily(userAgent: string): EnvironmentSnapshot['browserFamily'] {
  if (/Firefox\//i.test(userAgent)) return 'firefox';
  if (/AppleWebKit/i.test(userAgent) && !/(?:Chrome|Chromium|Edg)\//i.test(userAgent))
    return 'webkit';
  if (/(?:Chrome|Chromium|Edg)\//i.test(userAgent)) return 'chromium';
  return 'unknown';
}

function platformClass(nav: NavigatorWithMemory): EnvironmentSnapshot['platformClass'] {
  if (nav.userAgentData?.mobile || /Android|iPhone|Mobile/i.test(nav.userAgent)) return 'mobile';
  if (/iPad|Tablet/i.test(nav.userAgent)) return 'tablet';
  if (/Windows|Macintosh|Linux|CrOS/i.test(nav.userAgent)) return 'desktop';
  return 'unknown';
}

function bucketBytes(value: number | undefined): string {
  if (!value || value <= 0) return 'unknown';
  const mib = value / (1024 * 1024);
  if (mib < 1) return '<1MiB';
  if (mib < 10) return '1–10MiB';
  if (mib < 100) return '10–100MiB';
  if (mib < 1_024) return '100MiB–1GiB';
  return '>=1GiB';
}

export async function collectEnvironmentSnapshot(now = new Date()): Promise<EnvironmentSnapshot> {
  const nav = navigator as NavigatorWithMemory;
  let storageEstimate: EnvironmentSnapshot['storageEstimate'];
  try {
    const estimate = await nav.storage?.estimate();
    if (estimate) {
      storageEstimate = {
        usageBucket: bucketBytes(estimate.usage),
        quotaBucket: bucketBytes(estimate.quota),
      };
    }
  } catch {
    // Private browsing and hardened contexts may block storage estimates.
  }
  return {
    capturedAt: now.toISOString(),
    appVersion: '0.1.0',
    buildMode: import.meta.env.MODE || 'unknown',
    browserFamily: browserFamily(nav.userAgent),
    platformClass: platformClass(nav),
    language: String(nav.language || 'unknown').slice(0, 16),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown',
    viewport: {
      width: Math.max(0, Math.round(window.innerWidth)),
      height: Math.max(0, Math.round(window.innerHeight)),
    },
    online: nav.onLine,
    cookieEnabled: nav.cookieEnabled,
    ...(storageEstimate ? { storageEstimate } : {}),
  };
}

export function collectFeatureFlags(input: Record<string, boolean> = {}): FeatureFlagSnapshot[] {
  return Object.entries(input)
    .filter(([id]) => /^[a-z0-9][a-z0-9-]{0,63}$/i.test(id))
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, 100)
    .map(([id, enabled]) => ({ id, enabled: Boolean(enabled), source: 'runtime' as const }));
}

function registrationState(
  registration: ServiceWorkerRegistration
): ServiceWorkerDiagnosticState['registrationState'] {
  if (registration.installing) return 'installing';
  if (registration.waiting) return 'waiting';
  if (registration.active) return 'active';
  return 'none';
}

export async function collectServiceWorkerState(
  now = new Date()
): Promise<ServiceWorkerDiagnosticState> {
  if (!('serviceWorker' in navigator)) {
    return {
      supported: false,
      controlled: false,
      registrationState: 'none',
      scope: 'none',
      cacheNames: [],
      checkedAt: now.toISOString(),
    };
  }
  let registration: ServiceWorkerRegistration | undefined;
  try {
    registration = await navigator.serviceWorker.getRegistration();
  } catch {
    return {
      supported: true,
      controlled: Boolean(navigator.serviceWorker.controller),
      registrationState: 'unknown',
      scope: 'unknown',
      cacheNames: [],
      checkedAt: now.toISOString(),
    };
  }
  let cacheNames: string[] = [];
  try {
    cacheNames = typeof caches !== 'undefined' ? (await caches.keys()).sort().slice(0, 20) : [];
  } catch {
    // CacheStorage can be unavailable in private browsing.
  }
  let scope: ServiceWorkerDiagnosticState['scope'] = 'none';
  if (registration) {
    try {
      scope =
        new URL(registration.scope).origin === window.location.origin
          ? 'same-origin'
          : 'unexpected';
    } catch {
      scope = 'unexpected';
    }
  }
  return {
    supported: true,
    controlled: Boolean(navigator.serviceWorker.controller),
    registrationState: registration ? registrationState(registration) : 'none',
    scope,
    cacheNames: cacheNames.map((_, index) => `cache-${index + 1}`),
    checkedAt: now.toISOString(),
  };
}
