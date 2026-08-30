import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import useResourceBaselines from './useResourceBaselines';
import { __resetConnectionForTests } from '../lib/resourceProfiling/baselineStore';

beforeEach(() => {
  __resetConnectionForTests();
  indexedDB = new IDBFactory();
});

describe('useResourceBaselines', () => {
  it('starts loading and settles to an empty list when there are no saved baselines', async () => {
    const { result } = renderHook(() => useResourceBaselines());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.baselines).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('creates a baseline and reflects it in the list after refresh', async () => {
    const { result } = renderHook(() => useResourceBaselines());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.createBaseline('Load test', 'from a hook test');
    });

    expect(result.current.baselines).toHaveLength(1);
    expect(result.current.baselines[0].name).toBe('Load test');
  });

  it('loadSampleBaseline seeds a usable baseline with pre-populated samples', async () => {
    const { result } = renderHook(() => useResourceBaselines());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.loadSampleBaseline();
    });

    expect(result.current.baselines).toHaveLength(1);
    expect(result.current.baselines[0].profiles.length).toBeGreaterThan(0);
  });

  it('deleteBaseline removes it from the list', async () => {
    const { result } = renderHook(() => useResourceBaselines());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let created!: Awaited<ReturnType<typeof result.current.createBaseline>>;
    await act(async () => {
      created = await result.current.createBaseline('Temp');
    });
    expect(result.current.baselines).toHaveLength(1);

    await act(async () => {
      await result.current.deleteBaseline(created.id);
    });
    expect(result.current.baselines).toHaveLength(0);
  });

  it('importBaseline rejects a document from a newer, unsupported schema version', async () => {
    const { result } = renderHook(() => useResourceBaselines());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(result.current.importBaseline({ schemaVersion: 999, name: 'future', profiles: [] })).rejects.toThrow();
  });
});
