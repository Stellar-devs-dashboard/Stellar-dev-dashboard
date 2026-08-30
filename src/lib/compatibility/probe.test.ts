import { afterEach, describe, expect, it } from 'vitest';
import { delay, http, HttpResponse } from 'msw';
import { server } from '../../../tests/mocks/server';
import type { NetworkProbeTarget } from '../../types/compatibility';
import { BrowserNetworkProbeService } from './probe';

const target: NetworkProbeTarget = {
  id: 'network:testnet',
  label: 'Testnet fixture',
  network: 'testnet',
  horizonUrl: 'https://horizon.compat.test',
  rpcUrl: 'https://rpc.compat.test',
  expectedPassphrase: 'Test SDF Network ; September 2015',
  headers: { authorization: 'Bearer sensitive-fixture-token' },
};

function installHappyHandlers(protocol = 21) {
  server.use(
    http.get('https://horizon.compat.test/', () =>
      HttpResponse.json({
        network_passphrase: 'Test SDF Network ; September 2015',
        horizon_version: '2.30.0',
        core_version: '21.0.0',
        current_protocol_version: protocol,
      })
    ),
    http.get('https://horizon.compat.test/ledgers', () =>
      HttpResponse.json({
        _embedded: {
          records: [{ sequence: '1000', protocol_version: protocol, max_tx_set_size: 1000 }],
        },
      })
    ),
    http.post('https://rpc.compat.test/', async ({ request }) => {
      const body = (await request.json()) as { id: string; method: string };
      const common = { jsonrpc: '2.0', id: body.id };
      switch (body.method) {
        case 'getNetwork':
          return HttpResponse.json({
            ...common,
            result: {
              passphrase: 'Test SDF Network ; September 2015',
              protocolVersion: String(protocol),
            },
          });
        case 'getLatestLedger':
          return HttpResponse.json({
            ...common,
            result: { id: 'ledger-id', sequence: 1000, protocolVersion: String(protocol) },
          });
        case 'getVersionInfo':
          return HttpResponse.json(
            {
              ...common,
              result: {
                version: '21.3.0-fixture',
                captiveCoreVersion: 'stellar-core 21.0.0',
                protocolVersion: protocol,
                commitHash: 'fixture-commit',
                limits: { maxEventFilters: 5, maxTransactionSizeBytes: 100000 },
              },
            },
            { headers: { 'x-vendor': 'fixture-rpc' } }
          );
        case 'getTransaction':
          return HttpResponse.json({
            ...common,
            result: { status: 'NOT_FOUND', latestLedger: 1000, oldestLedger: 500 },
          });
        case 'getTransactions':
          return HttpResponse.json({
            ...common,
            result: { transactions: [], latestLedger: 1000, oldestLedger: 500 },
          });
        case 'getEvents':
          return HttpResponse.json({
            ...common,
            result: { events: [], latestLedger: 1000, oldestLedger: 500 },
          });
        case 'simulateTransaction':
        case 'sendTransaction':
          return HttpResponse.json({
            ...common,
            error: { code: -32602, message: 'invalid params' },
          });
        default:
          return HttpResponse.json({
            ...common,
            result: body.method === 'getHealth' ? { status: 'healthy' } : {},
          });
      }
    })
  );
}

afterEach(() => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
});

describe('browser network probe service', () => {
  it('correlates identity, protocol, methods, retention, limits, and vendor extensions', async () => {
    installHappyHandlers();
    const service = new BrowserNetworkProbeService();
    const result = await service.probe(target, {
      timeoutMs: 1_000,
      cacheTtlMs: 60_000,
      now: () => new Date('2026-08-28T12:00:00.000Z'),
    });
    expect(result.online).toBe(true);
    expect(result.protocolVersion).toBe(21);
    expect(result.latestLedger).toBe(1000);
    expect(result.identity.passphrase).toBe(target.expectedPassphrase);
    expect(result.methods.every((method) => method.supported === true)).toBe(true);
    expect(result.retention).toMatchObject({
      oldestLedger: 500,
      latestLedger: 1000,
      ledgerCount: 501,
    });
    expect(result.limits.maxEventFilters).toBe(5);
    expect(result.vendorExtensions).toContainEqual({
      name: 'x-vendor',
      value: 'fixture-rpc',
      source: 'header',
    });
    expect(JSON.stringify(result)).not.toContain('sensitive-fixture-token');
  });

  it('distinguishes a missing method from a recognized invalid-params response', async () => {
    installHappyHandlers();
    server.use(
      http.post('https://rpc.compat.test/', async ({ request }) => {
        const body = (await request.clone().json()) as { id: string; method: string };
        if (body.method === 'getEvents') {
          return HttpResponse.json({
            jsonrpc: '2.0',
            id: body.id,
            error: { code: -32601, message: 'not found' },
          });
        }
        return undefined;
      })
    );
    const result = await new BrowserNetworkProbeService().probe(target, { timeoutMs: 1_000 });
    expect(result.methods.find((method) => method.name === 'getEvents')?.supported).toBe(false);
    expect(result.methods.find((method) => method.name === 'simulateTransaction')?.supported).toBe(
      true
    );
  });

  it('returns a complete offline observation without contacting endpoints', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    const result = await new BrowserNetworkProbeService().probe(target);
    expect(result.online).toBe(false);
    expect(result.errors[0].code).toBe('offline');
    expect(result.methods.every((method) => method.supported === null)).toBe(true);
    expect(result.evidence).toHaveLength(result.methods.length);
  });

  it('bounds slow endpoint requests with contextual timeout errors', async () => {
    server.use(
      http.get('https://horizon.compat.test/', async () => {
        await delay('infinite');
        return HttpResponse.json({});
      }),
      http.get('https://horizon.compat.test/ledgers', async () => {
        await delay('infinite');
        return HttpResponse.json({});
      }),
      http.post('https://rpc.compat.test/', async () => {
        await delay('infinite');
        return HttpResponse.json({});
      })
    );
    const result = await new BrowserNetworkProbeService().probe(target, { timeoutMs: 500 });
    expect(result.online).toBe(false);
    expect(result.errors.map((problem) => problem.code)).toContain('timeout');
    expect(result.errors.every((problem) => problem.endpoint !== '')).toBe(true);
  });

  it('honors caller cancellation', async () => {
    server.use(
      http.get('https://horizon.compat.test/', async () => {
        await delay(200);
        return HttpResponse.json({});
      }),
      http.get('https://horizon.compat.test/ledgers', async () => {
        await delay(200);
        return HttpResponse.json({});
      }),
      http.post('https://rpc.compat.test/', async () => {
        await delay(200);
        return HttpResponse.json({});
      })
    );
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 10);
    const result = await new BrowserNetworkProbeService().probe(target, {
      signal: controller.signal,
      timeoutMs: 1_000,
    });
    expect(result.errors.some((problem) => problem.code === 'aborted')).toBe(true);
    expect(result.online).toBe(false);
  });
});
