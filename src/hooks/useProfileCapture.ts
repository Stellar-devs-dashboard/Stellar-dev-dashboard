import { useCallback, useEffect, useRef, useState } from 'react';
import { captureProfileFromSimulation } from '../lib/resourceProfiling/simulationCapture';
import { ProfilingError } from '../lib/resourceProfiling/errors';
import { getOnlineStatus, subscribeToOnlineStatus } from '../utils/offline';
import type { CaptureSimulationInput, ResourceProfile } from '../types/resourceProfiling';

export interface UseProfileCaptureResult {
  profile: ResourceProfile | null;
  loading: boolean;
  error: ProfilingError | null;
  online: boolean;
  capture: (_input: CaptureSimulationInput) => Promise<ResourceProfile | null>;
  cancel: () => void;
  reset: () => void;
}

/**
 * Drives a single cancellable profile capture. Isolated from baseline/budget state so the
 * capture form can be reused anywhere a fresh ResourceProfile is needed (the lab's Capture tab,
 * a future "compare against current" shortcut, etc.) without dragging in persistence.
 */
export default function useProfileCapture(): UseProfileCaptureResult {
  const [profile, setProfile] = useState<ResourceProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ProfilingError | null>(null);
  const [online, setOnline] = useState(getOnlineStatus());
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => subscribeToOnlineStatus(setOnline), []);
  useEffect(() => () => controllerRef.current?.abort(), []);

  const capture = useCallback(async (input: CaptureSimulationInput) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const result = await captureProfileFromSimulation(input, { signal: controller.signal });
      if (controllerRef.current !== controller) return null;
      setProfile(result);
      return result;
    } catch (cause) {
      if (controllerRef.current !== controller) return null;
      setError(
        cause instanceof ProfilingError
          ? cause
          : new ProfilingError({ code: 'simulation-failed', message: 'Unable to capture a resource profile.', retryable: true })
      );
      return null;
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        setLoading(false);
      }
    }
  }, []);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    setProfile(null);
    setError(null);
  }, []);

  return { profile, loading, error, online, capture, cancel, reset };
}
