import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TroubleshootingRun, TroubleshootingService } from '../types/diagnostics';
import useDiagnostics from './useDiagnostics';
import { DiagnosticCollector } from '../lib/diagnostics/collector';
import { BrowserDiagnosticRepository } from '../lib/diagnostics/persistence';
import { verifyDiagnosticBundle } from '../lib/diagnostics/bundle';
import { redactDiagnosticValue } from '../lib/diagnostics/redaction';

const NOW = new Date('2026-08-28T12:00:00.000Z');
const now = () => new Date(NOW);

function collector() {
  let id = 0;
  return new DiagnosticCollector({}, now, (prefix) => `${prefix}-${++id}`);
}

function troubleshootingService(): TroubleshootingService {
  return {
    run: vi.fn(async (flowId): Promise<TroubleshootingRun> => ({
      schemaVersion: 1,
      id: 'run-1',
      flowId,
      startedAt: NOW.toISOString(),
      completedAt: NOW.toISOString(),
      status: 'action-needed',
      results: [
        {
          checkId: 'endpoint-reachable',
          status: 'fail',
          startedAt: NOW.toISOString(),
          completedAt: NOW.toISOString(),
          durationMs: 25,
          summary: 'Horizon returned a non-success response.',
          evidence: { status: 503 },
        },
      ],
      remediations: [],
      correlationId: 'troubleshooting-1',
    })),
  };
}

describe('useDiagnostics integration boundary', () => {
  it('initializes coarse metadata and exposes private-storage degradation', async () => {
    const repository = new BrowserDiagnosticRepository(null, now);
    const localCollector = collector();
    const service = troubleshootingService();
    const { result } = renderHook(() =>
      useDiagnostics('testnet', {
        collector: localCollector,
        repository,
        troubleshootingService: service,
        now,
        featureFlags: { diagnostics: true, experimental: false },
      })
    );

    expect(result.current.viewState).toBe('loading');
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.viewState).toBe('degraded');
    expect(result.current.repositoryState.persistence).toBe('memory-only');
    expect(result.current.environment?.capturedAt).toBe(NOW.toISOString());
    expect(result.current.featureFlags).toEqual([
      { id: 'diagnostics', enabled: true, source: 'runtime' },
      { id: 'experimental', enabled: false, source: 'runtime' },
    ]);
    expect(result.current.snapshot.breadcrumbs).toEqual([
      expect.objectContaining({ action: 'Opened local diagnostics workspace' }),
    ]);
  });

  it('orchestrates a guide into endpoint health and a redacted, verifiable preview', async () => {
    const repository = new BrowserDiagnosticRepository(null, now);
    const localCollector = collector();
    const service = troubleshootingService();
    const { result } = renderHook(() =>
      useDiagnostics('testnet', {
        collector: localCollector,
        repository,
        troubleshootingService: service,
        now,
      })
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      localCollector.capture({
        category: 'signing',
        name: 'signing.failed',
        message: `Seed S${'R'.repeat(55)} was rejected.`,
        outcome: 'failure',
        details: { transactionXdr: 'AAAA-sensitive-envelope' },
      });
    });
    await act(async () => {
      await result.current.runFlow('endpoint-connectivity');
    });

    expect(service.run).toHaveBeenCalledWith(
      'endpoint-connectivity',
      expect.objectContaining({
        horizonUrl: 'https://horizon-testnet.stellar.org',
        rpcUrl: 'https://soroban-testnet.stellar.org',
      })
    );
    expect(result.current.runs[0].status).toBe('action-needed');
    expect(result.current.endpointHealth[0]).toMatchObject({
      kind: 'horizon',
      state: 'unreachable',
    });
    expect(result.current.endpointHealth[0]).not.toHaveProperty('statusCode');

    let preview;
    await act(async () => {
      preview = await result.current.createPreview();
    });
    const serialized = JSON.stringify(preview);
    expect(serialized).not.toContain(`S${'R'.repeat(55)}`);
    expect(serialized).not.toContain('AAAA-sensitive-envelope');
    expect(result.current.preview?.bundle.manifest.digest).toMatch(/^[a-f0-9]{64}$/);
    await expect(
      verifyDiagnosticBundle(result.current.preview!.bundle, { now: NOW })
    ).resolves.toBe(true);
    expect(redactDiagnosticValue(result.current.preview!.bundle).value).toEqual(
      result.current.preview!.bundle
    );
    act(() => expect(result.current.savePreview()).toBe(true));
    expect(result.current.repositoryState.bundles).toHaveLength(1);
  });

  it('pauses capture and clears every local workflow state after confirmation is delegated', async () => {
    const repository = new BrowserDiagnosticRepository(null, now);
    const localCollector = collector();
    const { result } = renderHook(() =>
      useDiagnostics('testnet', {
        collector: localCollector,
        repository,
        troubleshootingService: troubleshootingService(),
        now,
      })
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setCaptureEnabled(false));
    expect(result.current.snapshot.enabled).toBe(false);
    expect(
      localCollector.capture({ category: 'runtime', name: 'paused', message: 'not retained' })
    ).toBeNull();
    act(() => result.current.clearAll());

    expect(result.current.viewState).toBe('empty');
    expect(result.current.snapshot.events).toEqual([]);
    expect(result.current.snapshot.breadcrumbs).toEqual([]);
    expect(result.current.runs).toEqual([]);
    expect(result.current.preview).toBeNull();
    expect(result.current.repositoryState.bundles).toEqual([]);
  });
});
