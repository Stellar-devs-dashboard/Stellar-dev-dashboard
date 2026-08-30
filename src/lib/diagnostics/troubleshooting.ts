import {
  DIAGNOSTIC_SCHEMA_VERSION,
  type DiagnosticEvent,
  type TroubleshootingCheckDefinition,
  type TroubleshootingCheckId,
  type TroubleshootingCheckResult,
  type TroubleshootingContext,
  type TroubleshootingFlowDefinition,
  type TroubleshootingFlowId,
  type TroubleshootingRemediation,
  type TroubleshootingRun,
  type TroubleshootingService,
} from '../../types/diagnostics';
import { collectServiceWorkerState } from './environment';
import { redactDiagnosticValue } from './redaction';

export const TROUBLESHOOTING_REMEDIATIONS: Record<string, TroubleshootingRemediation> = {
  'check-browser-network': {
    id: 'check-browser-network',
    title: 'Restore browser connectivity',
    description: 'The browser is offline or cannot reach the configured endpoint.',
    steps: [
      'Confirm the browser network indicator is online.',
      'Open the endpoint root in a separate tab and verify a response.',
      'Check VPN, proxy, DNS, and browser extension rules.',
      'Retry this non-destructive check after connectivity returns.',
    ],
    destructive: false,
    documentationRef: 'docs/diagnostics.md#endpoint-connectivity',
  },
  'review-endpoint-profile': {
    id: 'review-endpoint-profile',
    title: 'Review endpoint configuration',
    description:
      'The selected Horizon or Soroban RPC endpoint did not return an expected health response.',
    steps: [
      'Confirm the selected network matches the endpoint.',
      'Verify the custom endpoint uses HTTPS and has browser-compatible CORS headers.',
      'Check provider status and request limits.',
      'Use the dashboard network selector to retry with a known endpoint.',
    ],
    destructive: false,
    documentationRef: 'docs/diagnostics.md#endpoint-profile',
  },
  'review-wallet-extension': {
    id: 'review-wallet-extension',
    title: 'Review wallet availability',
    description: 'The wallet bridge is absent or not exposed to this page.',
    steps: [
      'Confirm the wallet extension is enabled for this origin.',
      'Unlock the wallet without entering secret material into the dashboard.',
      'Confirm the wallet network matches the selected dashboard network.',
      'Reload the page and repeat the wallet-presence check.',
    ],
    destructive: false,
    documentationRef: 'docs/diagnostics.md#wallet-connection',
  },
  'review-transaction-evidence': {
    id: 'review-transaction-evidence',
    title: 'Review transaction lifecycle evidence',
    description: 'Recent local evidence indicates a simulation, signing, or submission failure.',
    steps: [
      'Locate the earliest failed simulation or signing event in the bundle preview.',
      'Confirm sequence, fee, network, and timeout assumptions without resubmitting.',
      'Re-simulate before requesting a new signature.',
      'Submit only after the non-destructive checks pass.',
    ],
    destructive: false,
    documentationRef: 'docs/diagnostics.md#transaction-submission',
  },
  'review-rendering-state': {
    id: 'review-rendering-state',
    title: 'Restore rendering prerequisites',
    description: 'The application root or required theme variables are unavailable.',
    steps: [
      'Confirm the application root is mounted.',
      'Disable page-modifying extensions for this origin and reload.',
      'Check that the production CSS asset loaded successfully.',
      'Retry in a current browser profile with default zoom.',
    ],
    destructive: false,
    documentationRef: 'docs/diagnostics.md#rendering',
  },
  'review-browser-storage': {
    id: 'review-browser-storage',
    title: 'Restore local storage access',
    description: 'A temporary write/read/delete round trip did not complete.',
    steps: [
      'Check whether private browsing or storage blocking is active.',
      'Allow site data for this origin.',
      'Confirm the browser has available storage quota.',
      'Continue in memory-only mode if durable storage remains blocked.',
    ],
    destructive: false,
    documentationRef: 'docs/diagnostics.md#storage',
  },
  'review-service-worker': {
    id: 'review-service-worker',
    title: 'Review offline worker state',
    description: 'The service worker or CacheStorage is unavailable or waiting.',
    steps: [
      'Confirm this page is running on HTTPS or localhost.',
      'Reload once to allow an installed worker to take control.',
      'Check browser storage and service-worker permissions.',
      'Use the network normally while the dashboard reports memory-only mode.',
    ],
    destructive: false,
    documentationRef: 'docs/diagnostics.md#offline-and-service-worker',
  },
};

const check = (
  id: TroubleshootingCheckId,
  title: string,
  description: string,
  timeoutMs = 4_000
): TroubleshootingCheckDefinition => ({ id, title, description, timeoutMs });

export const TROUBLESHOOTING_FLOWS: Record<TroubleshootingFlowId, TroubleshootingFlowDefinition> = {
  'endpoint-connectivity': {
    id: 'endpoint-connectivity',
    title: 'Endpoint connectivity',
    summary:
      'Checks browser connectivity, Horizon reachability, and Soroban RPC health without mutations.',
    checks: [
      check('browser-online', 'Browser connectivity', 'Reads the browser online state.', 500),
      check('endpoint-reachable', 'Horizon endpoint', 'Reads the Horizon root resource.'),
      check('rpc-responsive', 'Soroban RPC', 'Calls the read-only getHealth method.'),
    ],
    remediationIds: ['check-browser-network', 'review-endpoint-profile'],
  },
  'wallet-connection': {
    id: 'wallet-connection',
    title: 'Wallet connection',
    summary:
      'Checks only whether a wallet bridge is present; it never requests an account or signature.',
    checks: [
      check('browser-online', 'Browser connectivity', 'Reads the browser online state.', 500),
      check(
        'wallet-api-present',
        'Wallet bridge',
        'Checks for a supported injected wallet API.',
        500
      ),
      check(
        'recent-failure-evidence',
        'Recent wallet evidence',
        'Reviews already-redacted local events.',
        500
      ),
    ],
    remediationIds: ['check-browser-network', 'review-wallet-extension'],
  },
  'transaction-submission': {
    id: 'transaction-submission',
    title: 'Transaction submission',
    summary:
      'Reviews local lifecycle evidence and endpoint health without building, signing, or submitting.',
    checks: [
      check('browser-online', 'Browser connectivity', 'Reads the browser online state.', 500),
      check('rpc-responsive', 'Soroban RPC', 'Calls the read-only getHealth method.'),
      check(
        'recent-failure-evidence',
        'Transaction evidence',
        'Reviews redacted simulation/signing/submission events.',
        500
      ),
    ],
    remediationIds: ['review-endpoint-profile', 'review-transaction-evidence'],
  },
  'rendering-failure': {
    id: 'rendering-failure',
    title: 'Rendering failure',
    summary: 'Checks the mounted root and required CSS variables without changing the document.',
    checks: [
      check(
        'root-mounted',
        'Application root',
        'Checks that the React mount point has content.',
        500
      ),
      check('css-variables', 'Theme variables', 'Reads required computed CSS variables.', 500),
      check(
        'recent-failure-evidence',
        'Rendering evidence',
        'Reviews already-redacted runtime events.',
        500
      ),
    ],
    remediationIds: ['review-rendering-state'],
  },
  'storage-failure': {
    id: 'storage-failure',
    title: 'Storage failure',
    summary: 'Uses one temporary diagnostic key and removes it immediately after a round trip.',
    checks: [
      check(
        'storage-roundtrip',
        'Storage round trip',
        'Writes, reads, and removes one temporary value.',
        1_000
      ),
      check(
        'cache-availability',
        'CacheStorage availability',
        'Lists cache metadata without reading entries.',
        1_000
      ),
      check(
        'recent-failure-evidence',
        'Storage evidence',
        'Reviews already-redacted storage events.',
        500
      ),
    ],
    remediationIds: ['review-browser-storage'],
  },
  'offline-service-worker': {
    id: 'offline-service-worker',
    title: 'Offline and service worker',
    summary:
      'Inspects registration, controller, and cache metadata without unregistering or deleting data.',
    checks: [
      check('browser-online', 'Browser connectivity', 'Reads the browser online state.', 500),
      check(
        'service-worker-state',
        'Service worker',
        'Reads registration and controller state.',
        2_000
      ),
      check(
        'cache-availability',
        'CacheStorage availability',
        'Lists cache metadata without reading entries.',
        1_000
      ),
    ],
    remediationIds: ['check-browser-network', 'review-service-worker'],
  },
};

function makeId(prefix: string): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? `${prefix}-${crypto.randomUUID().replace(/-/g, '')}`
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function safeEvidence(value: unknown): unknown {
  return redactDiagnosticValue(value, { maxOutputBytes: 16 * 1024 }).value;
}

function result(
  checkId: TroubleshootingCheckId,
  status: TroubleshootingCheckResult['status'],
  summary: string,
  evidence: unknown,
  start: Date,
  end: Date
): TroubleshootingCheckResult {
  return {
    checkId,
    status,
    startedAt: start.toISOString(),
    completedAt: end.toISOString(),
    durationMs: Math.max(0, end.getTime() - start.getTime()),
    summary,
    evidence: safeEvidence(evidence),
  };
}

function recentFailures(events: DiagnosticEvent[], categories?: string[]): DiagnosticEvent[] {
  return events
    .filter(
      (event) =>
        ['failure', 'degraded'].includes(event.outcome) &&
        (!categories || categories.includes(event.category))
    )
    .slice(-10);
}

async function executeCheck(
  definition: TroubleshootingCheckDefinition,
  context: TroubleshootingContext,
  signal: AbortSignal
): Promise<TroubleshootingCheckResult> {
  const now = context.now ?? (() => new Date());
  const started = now();
  const fetcher = context.fetcher ?? fetch;
  const finish = (
    status: TroubleshootingCheckResult['status'],
    summary: string,
    evidence: unknown
  ) => result(definition.id, status, summary, evidence, started, now());
  if (signal.aborted) return finish('skipped', 'Check cancelled before it started.', {});
  switch (definition.id) {
    case 'browser-online':
      return navigator.onLine
        ? finish('pass', 'Browser reports online connectivity.', { online: true })
        : finish('fail', 'Browser reports offline connectivity.', { online: false });
    case 'endpoint-reachable': {
      if (!context.horizonUrl) return finish('skipped', 'No Horizon endpoint is configured.', {});
      const response = await fetcher(context.horizonUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal,
      });
      return response.ok
        ? finish('pass', 'Horizon returned a successful root response.', {
            status: response.status,
          })
        : finish('fail', 'Horizon returned a non-success response.', { status: response.status });
    }
    case 'rpc-responsive': {
      if (!context.rpcUrl) return finish('skipped', 'No Soroban RPC endpoint is configured.', {});
      const response = await fetcher(context.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 'diagnostic-health', method: 'getHealth' }),
        signal,
      });
      if (!response.ok)
        return finish('fail', 'Soroban RPC returned an HTTP error.', { status: response.status });
      const body = (await response.json()) as {
        result?: { status?: string };
        error?: { code?: number };
      };
      const healthy = body.result?.status === 'healthy';
      return healthy
        ? finish('pass', 'Soroban RPC reports healthy.', { status: 'healthy' })
        : finish('warning', 'Soroban RPC responded without a healthy status.', {
            rpcStatus: body.result?.status ?? 'unknown',
            errorCode: body.error?.code,
          });
    }
    case 'wallet-api-present': {
      const scope = window as unknown as Record<string, unknown>;
      const available = Boolean(scope.freighterApi || scope.freighter || scope.albedo);
      return available
        ? finish('pass', 'An injected wallet bridge is present.', { bridge: 'present' })
        : finish('fail', 'No supported injected wallet bridge was detected.', { bridge: 'absent' });
    }
    case 'storage-roundtrip': {
      const storage = context.storage ?? localStorage;
      const key = '__stellar_diagnostic_roundtrip__';
      try {
        storage.setItem(key, 'ok');
        const read = storage.getItem(key);
        storage.removeItem(key);
        return read === 'ok'
          ? finish('pass', 'Storage write/read/delete round trip succeeded.', { durable: true })
          : finish('fail', 'Storage did not return the temporary value.', { durable: false });
      } finally {
        try {
          storage.removeItem(key);
        } catch {
          // The check remains non-destructive even when cleanup is blocked.
        }
      }
    }
    case 'root-mounted': {
      const root = document.getElementById('root');
      const mounted = Boolean(root?.childElementCount);
      return mounted
        ? finish('pass', 'The application root is mounted.', { mounted: true })
        : finish('fail', 'The application root has no rendered children.', { mounted: false });
    }
    case 'css-variables': {
      const styles = getComputedStyle(document.documentElement);
      const required = ['--bg-primary', '--text-primary', '--border'];
      const missing = required.filter((name) => !styles.getPropertyValue(name).trim());
      return missing.length === 0
        ? finish('pass', 'Required theme variables are available.', {
            requiredCount: required.length,
          })
        : finish('fail', 'Required theme variables are missing.', { missing });
    }
    case 'service-worker-state': {
      const state = await collectServiceWorkerState(now());
      if (!state.supported) return finish('warning', 'Service workers are unsupported.', state);
      if (state.registrationState === 'waiting') {
        return finish('warning', 'A service worker is waiting to activate.', state);
      }
      return state.registrationState === 'active'
        ? finish('pass', 'An active service worker registration is present.', state)
        : finish('warning', 'No active service worker registration is present.', state);
    }
    case 'cache-availability': {
      if (typeof caches === 'undefined')
        return finish('warning', 'CacheStorage is unavailable.', {});
      const names = await caches.keys();
      return finish('pass', 'CacheStorage metadata is readable.', { cacheCount: names.length });
    }
    case 'recent-failure-evidence': {
      const events = context.events ?? [];
      const failures = recentFailures(events);
      return failures.length === 0
        ? finish('pass', 'No recent local failure evidence was found.', { failureCount: 0 })
        : finish('warning', 'Recent local failure evidence is available for review.', {
            failureCount: failures.length,
            names: failures.map((event) => event.name),
          });
    }
  }
}

function executeBoundedCheck(
  definition: TroubleshootingCheckDefinition,
  context: TroubleshootingContext,
  signal: AbortSignal
): Promise<TroubleshootingCheckResult> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new DOMException('Cancelled', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    void executeCheck(definition, context, signal).then(
      (value) => {
        signal.removeEventListener('abort', abort);
        resolve(value);
      },
      (cause) => {
        signal.removeEventListener('abort', abort);
        reject(cause);
      }
    );
  });
}

function timeoutSignal(
  parent: AbortSignal | undefined,
  timeoutMs: number
): {
  signal: AbortSignal;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const abort = () =>
    controller.abort(parent?.reason ?? new DOMException('Cancelled', 'AbortError'));
  if (parent?.aborted) abort();
  else parent?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(
    () => controller.abort(new DOMException(`Check exceeded ${timeoutMs} ms.`, 'TimeoutError')),
    timeoutMs
  );
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      parent?.removeEventListener('abort', abort);
    },
  };
}

export class BrowserTroubleshootingService implements TroubleshootingService {
  async run(
    flowId: TroubleshootingFlowId,
    context: TroubleshootingContext = {}
  ): Promise<TroubleshootingRun> {
    const definition = TROUBLESHOOTING_FLOWS[flowId];
    if (!definition) throw new Error(`Unknown troubleshooting flow: ${flowId}.`);
    const now = context.now ?? (() => new Date());
    const startedAt = now();
    const correlationId = makeId('troubleshooting');
    const results: TroubleshootingCheckResult[] = [];
    for (const checkDefinition of definition.checks) {
      if (context.signal?.aborted) break;
      const bounded = timeoutSignal(context.signal, checkDefinition.timeoutMs);
      try {
        results.push(await executeBoundedCheck(checkDefinition, context, bounded.signal));
      } catch (cause) {
        const completedAt = now();
        const timeout =
          bounded.signal.reason instanceof DOMException &&
          bounded.signal.reason.name === 'TimeoutError';
        const cancelled = context.signal?.aborted;
        results.push({
          checkId: checkDefinition.id,
          status: cancelled ? 'skipped' : 'fail',
          startedAt: startedAt.toISOString(),
          completedAt: completedAt.toISOString(),
          durationMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
          summary: cancelled
            ? 'Check cancelled.'
            : timeout
              ? `Check timed out after ${checkDefinition.timeoutMs} ms.`
              : cause instanceof Error
                ? cause.message
                : 'Check failed.',
          evidence: safeEvidence({ error: cause }),
          problem: {
            code: cancelled ? 'aborted' : timeout ? 'timeout' : 'check-failed',
            message: cancelled
              ? 'Troubleshooting was cancelled.'
              : 'The non-destructive check failed.',
            retryable: true,
            context: checkDefinition.id,
          },
        });
      } finally {
        bounded.cleanup();
      }
    }
    const cancelled = Boolean(context.signal?.aborted);
    const failed = results.some((item) => item.status === 'fail');
    const uncertain = results.some((item) => ['warning', 'skipped'].includes(item.status));
    const status: TroubleshootingRun['status'] = cancelled
      ? 'cancelled'
      : failed
        ? 'action-needed'
        : uncertain
          ? 'inconclusive'
          : 'resolved';
    return {
      schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
      id: makeId('run'),
      flowId,
      startedAt: startedAt.toISOString(),
      completedAt: now().toISOString(),
      status,
      results,
      remediations:
        status === 'resolved'
          ? []
          : definition.remediationIds.map((id) => TROUBLESHOOTING_REMEDIATIONS[id]),
      correlationId,
    };
  }
}

export const browserTroubleshootingService = new BrowserTroubleshootingService();
