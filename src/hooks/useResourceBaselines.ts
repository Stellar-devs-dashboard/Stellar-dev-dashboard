import { useCallback, useEffect, useState } from 'react';
import {
  createEmptyBaseline,
  deleteBaseline as deleteBaselineFromStore,
  listBaselines,
  migrateBaseline,
  saveBaseline as saveBaselineToStore,
} from '../lib/resourceProfiling/baselineStore';
import { ProfilingError } from '../lib/resourceProfiling/errors';
import { createSampleBaseline } from '../lib/resourceProfiling/sampleFixtures';
import type { Baseline, ResourceProfile } from '../types/resourceProfiling';

export interface UseResourceBaselinesResult {
  baselines: Baseline[];
  loading: boolean;
  error: ProfilingError | null;
  refresh: () => Promise<void>;
  createBaseline: (_name: string, _description?: string) => Promise<Baseline>;
  renameBaseline: (_id: string, _name: string, _description: string) => Promise<void>;
  deleteBaseline: (_id: string) => Promise<void>;
  appendSample: (_baselineId: string, _profile: ResourceProfile) => Promise<void>;
  removeSample: (_baselineId: string, _profileId: string) => Promise<void>;
  importBaseline: (_raw: unknown) => Promise<Baseline>;
  loadSampleBaseline: () => Promise<Baseline>;
}

/**
 * CRUD boundary over the IndexedDB-backed baseline store. Kept separate from capture and
 * comparison so components that only need to list/manage baselines don't pull in simulation or
 * statistics logic, and so the persistence backend can change without touching those callers.
 */
export default function useResourceBaselines(): UseResourceBaselinesResult {
  const [baselines, setBaselines] = useState<Baseline[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ProfilingError | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listBaselines();
      setBaselines(list);
    } catch (cause) {
      setError(
        cause instanceof ProfilingError
          ? cause
          : new ProfilingError({ code: 'storage-unavailable', message: 'Unable to load saved baselines.', retryable: true })
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createBaseline = useCallback(
    async (name: string, description = '') => {
      const baseline = await saveBaselineToStore(createEmptyBaseline(name, description));
      await refresh();
      return baseline;
    },
    [refresh]
  );

  const renameBaseline = useCallback(
    async (id: string, name: string, description: string) => {
      const existing = baselines.find((baseline) => baseline.id === id);
      if (!existing) throw new ProfilingError({ code: 'not-found', message: 'Baseline not found.', retryable: false });
      await saveBaselineToStore({ ...existing, name, description });
      await refresh();
    },
    [baselines, refresh]
  );

  const deleteBaseline = useCallback(
    async (id: string) => {
      await deleteBaselineFromStore(id);
      await refresh();
    },
    [refresh]
  );

  const appendSample = useCallback(
    async (baselineId: string, profile: ResourceProfile) => {
      const existing = baselines.find((baseline) => baseline.id === baselineId);
      if (!existing) throw new ProfilingError({ code: 'not-found', message: 'Baseline not found.', retryable: false });
      await saveBaselineToStore({ ...existing, profiles: [...existing.profiles, profile] });
      await refresh();
    },
    [baselines, refresh]
  );

  const removeSample = useCallback(
    async (baselineId: string, profileId: string) => {
      const existing = baselines.find((baseline) => baseline.id === baselineId);
      if (!existing) throw new ProfilingError({ code: 'not-found', message: 'Baseline not found.', retryable: false });
      await saveBaselineToStore({ ...existing, profiles: existing.profiles.filter((profile) => profile.id !== profileId) });
      await refresh();
    },
    [baselines, refresh]
  );

  const importBaseline = useCallback(
    async (raw: unknown) => {
      const migrated = migrateBaseline(raw);
      const saved = await saveBaselineToStore({ ...migrated, id: `${migrated.id}-import-${Date.now().toString(36)}` });
      await refresh();
      return saved;
    },
    [refresh]
  );

  const loadSampleBaseline = useCallback(async () => {
    const sample = createSampleBaseline();
    const saved = await saveBaselineToStore({ ...sample, id: `${sample.id}-${Date.now().toString(36)}` });
    await refresh();
    return saved;
  }, [refresh]);

  return {
    baselines,
    loading,
    error,
    refresh,
    createBaseline,
    renameBaseline,
    deleteBaseline,
    appendSample,
    removeSample,
    importBaseline,
    loadSampleBaseline,
  };
}
