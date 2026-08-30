import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NetworkName } from '../lib/stellar';
import {
  buildDemoSnapshot,
  buildFootprintFromAccounts,
  buildLibraryRecord,
  diffSnapshots,
  exportSanitizedBundle,
  exportSnapshotJson,
  failureMessage,
  inspectSnapshotEntries,
  LedgerSnapshotError,
  readSnapshotFile,
  replayEngine,
  snapshotCaptureClient,
  snapshotRepository,
  toLedgerSnapshotError,
  type CaptureProgress,
  type DeterministicReplayResult,
  type LedgerEntryDiff,
  type PortableLedgerSnapshot,
  type SnapshotComparisonResult,
  type SnapshotLibraryRecord,
  type SnapshotLibraryStats,
} from '../lib/ledgerSnapshots';
import { buildDemoSimulations } from '../lib/ledgerSnapshots/fixtures';

const PREFS_KEY = 'stellar:ledger-snapshots:preferences';

export interface LedgerSnapshotPreferences {
  redactionLevel: 'none' | 'standard' | 'strict';
  strictReplay: boolean;
  maxSnapshotBytes: number;
}

const defaultPreferences: LedgerSnapshotPreferences = {
  redactionLevel: 'standard',
  strictReplay: true,
  maxSnapshotBytes: 25 * 1024 * 1024,
};

function loadPreferences(): LedgerSnapshotPreferences {
  try {
    const stored = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<LedgerSnapshotPreferences>;
    return { ...defaultPreferences, ...stored };
  } catch {
    return defaultPreferences;
  }
}

function savePreferences(prefs: LedgerSnapshotPreferences): void {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

export type LedgerSnapshotView =
  | 'library'
  | 'capture'
  | 'inspect'
  | 'diff'
  | 'replay'
  | 'diagnostics';

export default function useLedgerSnapshots(accountId: string | null, network: NetworkName) {
  const [records, setRecords] = useState<SnapshotLibraryRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [compareId, setCompareId] = useState<string | null>(null);
  const [comparison, setComparison] = useState<SnapshotComparisonResult | null>(null);
  const [diffs, setDiffs] = useState<LedgerEntryDiff[]>([]);
  const [stats, setStats] = useState<SnapshotLibraryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [replaying, setReplaying] = useState(false);
  const [captureProgress, setCaptureProgress] = useState<CaptureProgress | null>(null);
  const [replayResult, setReplayResult] = useState<DeterministicReplayResult | null>(null);
  const [error, setError] = useState<LedgerSnapshotError | null>(null);
  const [message, setMessage] = useState('');
  const [view, setView] = useState<LedgerSnapshotView>('library');
  const [preferences, setPreferencesState] = useState<LedgerSnapshotPreferences>(loadPreferences);
  const [offlineMode, setOfflineMode] = useState(false);
  const controller = useRef<AbortController | null>(null);

  const selectedRecord = useMemo(
    () => records.find((r) => r.id === selectedId) ?? null,
    [records, selectedId]
  );

  const refreshLibrary = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const [all, libraryStats] = await Promise.all([
        snapshotRepository.getAll(),
        snapshotRepository.stats(),
      ]);
      setRecords(all);
      setStats(libraryStats);
      if (all.length === 0) {
        const demo = await buildDemoSnapshot(accountId ?? undefined);
        const record = buildLibraryRecord(demo);
        await snapshotRepository.put(record);
        setRecords([record]);
        setSelectedId(record.id);
        setOfflineMode(true);
        setStats(await snapshotRepository.stats());
      } else if (!selectedId) {
        setSelectedId(all[0].id);
      }
    } catch (err) {
      setError(toLedgerSnapshotError(err));
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [accountId, selectedId]);

  useEffect(() => {
    void refreshLibrary();
  }, [refreshLibrary]);

  const setPreferences = useCallback((next: Partial<LedgerSnapshotPreferences>) => {
    setPreferencesState((prev) => {
      const merged = { ...prev, ...next };
      savePreferences(merged);
      return merged;
    });
  }, []);

  const captureSnapshot = useCallback(
    async (label: string, tags: string[] = []) => {
      if (!accountId) {
        setError(new LedgerSnapshotError({ code: 'NO_ACCOUNT', message: 'Connect an account to capture snapshots.' }));
        return;
      }
      controller.current?.abort();
      controller.current = new AbortController();
      setCapturing(true);
      setError(null);
      setMessage('');
      setCaptureProgress(null);

      try {
        const footprint = buildFootprintFromAccounts([accountId], [], {
          includeSimulations: true,
          includeContractStorage: true,
        });
        const outcome = await snapshotCaptureClient.capture(
          network,
          {
            label,
            tags,
            footprint,
            redactionLevel: preferences.redactionLevel,
            maxSnapshotBytes: preferences.maxSnapshotBytes,
          },
          buildDemoSimulations(),
          controller.current.signal,
          setCaptureProgress
        );

        if (outcome.ok === false) {
          setError(
            new LedgerSnapshotError({
              code: outcome.code.toUpperCase(),
              message: outcome.message,
              retryable: outcome.code === 'network_error',
            })
          );
          return;
        }

        const record = buildLibraryRecord(outcome.snapshot);
        await snapshotRepository.put(record);
        setRecords((prev) => [record, ...prev.filter((r) => r.id !== record.id)]);
        setSelectedId(record.id);
        setMessage(`Snapshot "${label}" captured successfully.`);
        setView('inspect');
        setOfflineMode(false);
      } catch (err) {
        setError(toLedgerSnapshotError(err));
      } finally {
        setCapturing(false);
        setCaptureProgress(null);
      }
    },
    [accountId, network, preferences]
  );

  const cancelCapture = useCallback(() => {
    controller.current?.abort();
    setCapturing(false);
    setCaptureProgress(null);
    setMessage('Capture cancelled.');
  }, []);

  const loadDemoSnapshot = useCallback(async () => {
    setLoading(true);
    try {
      const demo = await buildDemoSnapshot(accountId ?? undefined);
      const record = buildLibraryRecord(demo);
      await snapshotRepository.put(record);
      await refreshLibrary();
      setSelectedId(record.id);
      setOfflineMode(true);
      setMessage('Loaded deterministic demonstration snapshot.');
    } catch (err) {
      setError(toLedgerSnapshotError(err));
    } finally {
      setLoading(false);
    }
  }, [accountId, refreshLibrary]);

  const importSnapshot = useCallback(
    async (file: File) => {
      setError(null);
      const outcome = await readSnapshotFile(file);
      if (outcome.ok === false) {
        setError(
          new LedgerSnapshotError({
            code: outcome.code.toUpperCase(),
            message: failureMessage(outcome),
            retryable: false,
          })
        );
        return;
      }
      await snapshotRepository.put(outcome.record);
      await refreshLibrary();
      setSelectedId(outcome.record.id);
      setMessage(
        outcome.migratedFromVersion
          ? `Imported snapshot (migrated from v${outcome.migratedFromVersion}).`
          : 'Snapshot imported successfully.'
      );
    },
    [refreshLibrary]
  );

  const exportSelected = useCallback(
    async (sanitized = false) => {
      if (!selectedRecord) return;
      const json = await exportSnapshotJson(selectedRecord.snapshot, {
        sanitized,
        redactionLevel: sanitized ? preferences.redactionLevel : 'none',
      });
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `ledger-snapshot-${selectedRecord.label.replace(/\s+/g, '-')}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage(sanitized ? 'Exported sanitized snapshot bundle.' : 'Exported snapshot.');
    },
    [selectedRecord, preferences.redactionLevel]
  );

  const exportBundle = useCallback(async () => {
    const json = await exportSanitizedBundle(records);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'ledger-snapshot-bundle-sanitized.json';
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage('Exported sanitized bundle.');
  }, [records]);

  const deleteSelected = useCallback(async () => {
    if (!selectedId) return;
    await snapshotRepository.delete(selectedId);
    setSelectedId(null);
    setComparison(null);
    setDiffs([]);
    setReplayResult(null);
    await refreshLibrary();
    setMessage('Snapshot deleted.');
  }, [selectedId, refreshLibrary]);

  const togglePin = useCallback(
    async (id: string, pinned: boolean) => {
      await snapshotRepository.setPinned(id, pinned);
      await refreshLibrary();
    },
    [refreshLibrary]
  );

  const updateTags = useCallback(
    async (id: string, tags: string[]) => {
      await snapshotRepository.updateTags(id, tags);
      await refreshLibrary();
    },
    [refreshLibrary]
  );

  const runComparison = useCallback(async () => {
    if (!selectedId || !compareId) return;
    const result = await snapshotRepository.compare(selectedId, compareId);
    setComparison(result);
    if (result && selectedRecord) {
      const compareRecord = records.find((r) => r.id === compareId);
      if (compareRecord) {
        setDiffs(diffSnapshots(selectedRecord.snapshot, compareRecord.snapshot));
      }
    }
    setView('diff');
  }, [selectedId, compareId, selectedRecord, records]);

  const runReplay = useCallback(async () => {
    if (!selectedRecord) return;
    controller.current?.abort();
    controller.current = new AbortController();
    setReplaying(true);
    setError(null);
    setReplayResult(null);

    try {
      const result = await replayEngine.replay(
        selectedRecord.snapshot,
        {
          snapshotId: selectedRecord.id,
          strictMode: preferences.strictReplay,
        },
        controller.current.signal
      );
      setReplayResult(result);
      await snapshotRepository.recordReplay(selectedRecord.id);
      await refreshLibrary();
      setView('replay');
    } catch (err) {
      setError(toLedgerSnapshotError(err));
    } finally {
      setReplaying(false);
    }
  }, [selectedRecord, preferences.strictReplay, refreshLibrary]);

  const cancelReplay = useCallback(() => {
    controller.current?.abort();
    setReplaying(false);
  }, []);

  const pruneLibrary = useCallback(async () => {
    const removed = await snapshotRepository.prune({
      maxRecords: 50,
      maxTotalBytes: 100 * 1024 * 1024,
      retainPinned: true,
      minAgeMs: 7 * 24 * 60 * 60 * 1000,
    });
    await refreshLibrary();
    setMessage(`Pruned ${removed} snapshot(s).`);
  }, [refreshLibrary]);

  const inspection = useMemo(
    () => (selectedRecord ? inspectSnapshotEntries(selectedRecord.snapshot) : null),
    [selectedRecord]
  );

  return {
    records,
    selectedRecord,
    selectedId,
    setSelectedId,
    compareId,
    setCompareId,
    comparison,
    diffs,
    stats,
    loading,
    refreshing,
    capturing,
    replaying,
    captureProgress,
    replayResult,
    error,
    message,
    setMessage,
    view,
    setView,
    preferences,
    setPreferences,
    offlineMode,
    inspection,
    refreshLibrary,
    captureSnapshot,
    cancelCapture,
    loadDemoSnapshot,
    importSnapshot,
    exportSelected,
    exportBundle,
    deleteSelected,
    togglePin,
    updateTags,
    runComparison,
    runReplay,
    cancelReplay,
    pruneLibrary,
  };
}
