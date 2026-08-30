import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiagnosticEvent } from '../../../types/diagnostics';
import {
  BrowserTroubleshootingService,
  TROUBLESHOOTING_FLOWS,
  TROUBLESHOOTING_REMEDIATIONS,
} from '../troubleshooting';

const service = new BrowserTroubleshootingService();
const originalOnline = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine');
const originalCaches = globalThis.caches;

function setOnline(value: boolean) {
  Object.defineProperty(Navigator.prototype, 'onLine', { configurable: true, get: () => value });
}

function diagnosticFailure(): DiagnosticEvent {
  return {
    schemaVersion: 1,
    id: 'event-wallet-failure',
    sequence: 1,
    timestamp: '2026-08-28T12:00:00.000Z',
    category: 'wallet',
    severity: 'error',
    name: 'wallet.connect.failed',
    message: 'Wallet connection failed.',
    outcome: 'failure',
    details: { authorization: 'Bearer should-not-escape' },
    source: 'dashboard',
    redactionCount: 1,
    truncated: false,
  };
}

describe('guided troubleshooting', () => {
  beforeEach(() => {
    setOnline(true);
    Object.defineProperty(globalThis, 'caches', {
      configurable: true,
      value: { keys: vi.fn().mockResolvedValue(['stellar-static-v1']) },
    });
  });

  afterEach(() => {
    if (originalOnline) Object.defineProperty(Navigator.prototype, 'onLine', originalOnline);
    else Reflect.deleteProperty(Navigator.prototype, 'onLine');
    Object.defineProperty(globalThis, 'caches', {
      configurable: true,
      value: originalCaches,
    });
    document.documentElement.removeAttribute('style');
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('runs only read-only Horizon and Soroban health requests', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return new Response(JSON.stringify({ result: { status: 'healthy' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ network_passphrase: 'Test SDF Network' }), {
        status: 200,
      });
    });
    const fetcher = fetchMock as typeof fetch;

    const run = await service.run('endpoint-connectivity', {
      fetcher,
      horizonUrl: 'https://horizon.example.test',
      rpcUrl: 'https://rpc.example.test',
    });

    expect(run.status).toBe('resolved');
    expect(run.results.map((result) => result.status)).toEqual(['pass', 'pass', 'pass']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'GET' });
    const rpcRequest = fetchMock.mock.calls[1][1] as RequestInit;
    expect(rpcRequest.method).toBe('POST');
    expect(JSON.parse(String(rpcRequest.body))).toEqual({
      jsonrpc: '2.0',
      id: 'diagnostic-health',
      method: 'getHealth',
    });
    expect(String(rpcRequest.body)).not.toMatch(/sign|submit|sendTransaction/i);
  });

  it('uses and removes exactly one temporary storage key', async () => {
    const values = new Map<string, string>();
    const setItem = vi.fn((key: string, value: string) => values.set(key, value));
    const getItem = vi.fn((key: string) => values.get(key) ?? null);
    const removeItem = vi.fn((key: string) => values.delete(key));
    const storage = {
      get length() {
        return values.size;
      },
      clear: vi.fn(() => values.clear()),
      getItem,
      key: vi.fn(() => null),
      removeItem,
      setItem,
    } satisfies Storage;

    const run = await service.run('storage-failure', { storage });

    expect(run.status).toBe('resolved');
    expect(setItem).toHaveBeenCalledOnce();
    expect(setItem).toHaveBeenCalledWith('__stellar_diagnostic_roundtrip__', 'ok');
    expect(getItem).toHaveBeenCalledWith('__stellar_diagnostic_roundtrip__');
    expect(removeItem).toHaveBeenCalledWith('__stellar_diagnostic_roundtrip__');
    expect(values.size).toBe(0);
    expect(storage.clear).not.toHaveBeenCalled();
  });

  it('reports offline and missing wallet states with non-destructive remediations', async () => {
    setOnline(false);
    const run = await service.run('wallet-connection', { events: [diagnosticFailure()] });

    expect(run.status).toBe('action-needed');
    expect(run.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ checkId: 'browser-online', status: 'fail' }),
        expect.objectContaining({ checkId: 'wallet-api-present', status: 'fail' }),
        expect.objectContaining({ checkId: 'recent-failure-evidence', status: 'warning' }),
      ])
    );
    expect(run.remediations.length).toBeGreaterThan(0);
    expect(run.remediations.every((item) => item.destructive === false)).toBe(true);
    expect(JSON.stringify(run)).not.toContain('should-not-escape');
  });

  it('checks rendering state without mutating the root or theme variables', async () => {
    document.body.innerHTML = '<div id="root"><main>mounted</main></div>';
    document.documentElement.style.setProperty('--bg-primary', '#000');
    document.documentElement.style.setProperty('--text-primary', '#fff');
    document.documentElement.style.setProperty('--border', '#333');
    const before = document.body.innerHTML;

    const run = await service.run('rendering-failure');

    expect(run.status).toBe('resolved');
    expect(run.results.every((result) => result.status === 'pass')).toBe(true);
    expect(document.body.innerHTML).toBe(before);
  });

  it('honors cancellation before executing any check', async () => {
    const controller = new AbortController();
    controller.abort(new DOMException('cancelled by user', 'AbortError'));
    const fetcher = vi.fn() as typeof fetch;

    const run = await service.run('endpoint-connectivity', {
      signal: controller.signal,
      fetcher,
      horizonUrl: 'https://horizon.example.test',
      rpcUrl: 'https://rpc.example.test',
    });

    expect(run.status).toBe('cancelled');
    expect(run.results).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('enforces a timeout even when an injected fetch implementation ignores AbortSignal', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return Promise.resolve(
          new Response(JSON.stringify({ result: { status: 'healthy' } }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        );
      }
      return new Promise<Response>(() => undefined);
    }) as typeof fetch;

    const pending = service.run('endpoint-connectivity', {
      fetcher,
      horizonUrl: 'https://horizon.example.test',
      rpcUrl: 'https://rpc.example.test',
    });
    await vi.advanceTimersByTimeAsync(4_100);
    const run = await pending;

    expect(run.status).toBe('action-needed');
    expect(run.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          checkId: 'endpoint-reachable',
          status: 'fail',
          problem: expect.objectContaining({ code: 'timeout' }),
        }),
        expect.objectContaining({ checkId: 'rpc-responsive', status: 'pass' }),
      ])
    );
  });

  it('keeps every declared flow bounded and every remediation explicitly non-destructive', () => {
    expect(Object.keys(TROUBLESHOOTING_FLOWS)).toHaveLength(6);
    for (const flow of Object.values(TROUBLESHOOTING_FLOWS)) {
      expect(flow.checks.length).toBeGreaterThan(0);
      expect(flow.checks.every((check) => check.timeoutMs > 0 && check.timeoutMs <= 4_000)).toBe(
        true
      );
      expect(flow.remediationIds.every((id) => TROUBLESHOOTING_REMEDIATIONS[id])).toBe(true);
    }
    expect(
      Object.values(TROUBLESHOOTING_REMEDIATIONS).every(
        (remediation) => remediation.destructive === false && remediation.steps.length > 0
      )
    ).toBe(true);
  });
});
