import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import useProfileCapture from './useProfileCapture';
import * as simulationCapture from '../lib/resourceProfiling/simulationCapture';
import { ProfilingError } from '../lib/resourceProfiling/errors';
import { createSampleRegressionCandidate } from '../lib/resourceProfiling/sampleFixtures';
import type { CaptureSimulationInput } from '../types/resourceProfiling';

function deferred<T>() {
  let resolve!: (_value: T) => void;
  let reject!: (_reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

const sampleInput: CaptureSimulationInput = {
  network: 'testnet',
  contractId: 'CABC',
  functionName: 'transfer',
  args: [],
  sourceAccount: 'GABC',
};

describe('useProfileCapture', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ignores a superseded capture and resolves with the newest result', async () => {
    const first = deferred<ReturnType<typeof createSampleRegressionCandidate>>();
    const second = deferred<ReturnType<typeof createSampleRegressionCandidate>>();
    vi.spyOn(simulationCapture, 'captureProfileFromSimulation').mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const { result } = renderHook(() => useProfileCapture());

    let firstRun!: Promise<unknown>;
    let secondRun!: Promise<unknown>;
    act(() => {
      firstRun = result.current.capture(sampleInput);
    });
    act(() => {
      secondRun = result.current.capture(sampleInput);
    });
    expect(result.current.loading).toBe(true);

    const staleProfile = { ...createSampleRegressionCandidate(), id: 'stale' };
    await act(async () => {
      first.resolve(staleProfile);
      await firstRun;
    });
    expect(result.current.profile).toBeNull();

    const freshProfile = { ...createSampleRegressionCandidate(), id: 'fresh' };
    await act(async () => {
      second.resolve(freshProfile);
      await secondRun;
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.profile?.id).toBe('fresh');
  });

  it('surfaces a ProfilingError from a failed capture and clears loading', async () => {
    vi.spyOn(simulationCapture, 'captureProfileFromSimulation').mockRejectedValue(
      new ProfilingError({ code: 'simulation-failed', message: 'RPC unavailable', retryable: true })
    );
    const { result } = renderHook(() => useProfileCapture());

    await act(async () => {
      await result.current.capture(sampleInput);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error?.message).toBe('RPC unavailable');
    expect(result.current.error?.retryable).toBe(true);
  });

  it('reset clears both the captured profile and any error', async () => {
    vi.spyOn(simulationCapture, 'captureProfileFromSimulation').mockResolvedValue(createSampleRegressionCandidate());
    const { result } = renderHook(() => useProfileCapture());

    await act(async () => {
      await result.current.capture(sampleInput);
    });
    expect(result.current.profile).not.toBeNull();

    act(() => result.current.reset());
    expect(result.current.profile).toBeNull();
    expect(result.current.error).toBeNull();
  });
});
