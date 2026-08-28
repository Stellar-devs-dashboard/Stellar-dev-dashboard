import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NetworkName } from '../lib/stellar';
import {
  buildExportPayload,
  buildPeriodSnapshot,
  DEFAULT_ACCOUNTING_MAPPING,
  DEFAULT_CATEGORY_RULES,
  exportGenericLedgerCsv,
  exportPeriodCsv,
  exportPeriodJson,
  fetchReconciliationPeriod,
  parseExportPayload,
  recategorize,
  TreasuryReconciliationError,
  treasuryDb,
  validateCostBasisEntry,
  validateRule,
} from '../lib/treasuryReconciliation';
import type {
  AccountingMapping,
  CategoryRule,
  CostBasisEntry,
  PeriodSnapshot,
  ReconciliationPeriod,
  ReconciliationResult,
  ReviewRecord,
  ReviewStatus,
} from '../types/treasury';

const PREFS_KEY = 'stellar:treasury-reconciliation:preferences';

export interface TreasuryPreferences {
  minimumDiscrepancySeverity: 'info' | 'warning' | 'critical';
  accountingMappingId: string;
}

const defaultPreferences: TreasuryPreferences = {
  minimumDiscrepancySeverity: 'info',
  accountingMappingId: DEFAULT_ACCOUNTING_MAPPING.id,
};

function loadPreferences(): TreasuryPreferences {
  try {
    const stored = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<TreasuryPreferences>;
    return { ...defaultPreferences, ...stored };
  } catch {
    return defaultPreferences;
  }
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function currentMonthRange(now: Date): { start: string; end: string } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start: isoDate(start), end: isoDate(end) };
}

export default function useTreasuryReconciliation(accountId: string | null, network: NetworkName) {
  const [periods, setPeriods] = useState<ReconciliationPeriod[]>([]);
  const [activePeriodId, setActivePeriodId] = useState<string | null>(null);
  const [result, setResult] = useState<ReconciliationResult | null>(null);
  const [closedSnapshot, setClosedSnapshot] = useState<PeriodSnapshot | null>(null);
  const [rules, setRules] = useState<CategoryRule[]>(DEFAULT_CATEGORY_RULES);
  const [costBasisEntries, setCostBasisEntries] = useState<CostBasisEntry[]>([]);
  const [review, setReview] = useState<ReviewRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<TreasuryReconciliationError | null>(null);
  const [message, setMessage] = useState('');
  const [preferences, setPreferencesState] = useState<TreasuryPreferences>(loadPreferences);
  const controller = useRef<AbortController | null>(null);

  const activePeriod = useMemo(() => periods.find((p) => p.id === activePeriodId) ?? null, [periods, activePeriodId]);

  // ── Bootstrap: load persisted periods/rules/cost-basis/review, create a default period ──
  useEffect(() => {
    if (!accountId) {
      setPeriods([]);
      setActivePeriodId(null);
      setResult(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [storedPeriods, storedRules, storedCostBasis, storedReview] = await Promise.all([
          treasuryDb.getPeriods(accountId),
          treasuryDb.getRules(accountId),
          treasuryDb.getCostBasisEntries(accountId),
          treasuryDb.getReviewState(accountId),
        ]);
        if (cancelled) return;

        let workingPeriods = storedPeriods;
        if (workingPeriods.length === 0) {
          const { start, end } = currentMonthRange(new Date());
          const period: ReconciliationPeriod = {
            id: `${accountId}:${network}:${start}`,
            accountId,
            network,
            start,
            end,
            status: 'open',
            createdAt: new Date().toISOString(),
          };
          await treasuryDb.savePeriod(period);
          workingPeriods = [period];
        }

        setPeriods(workingPeriods);
        setActivePeriodId((current) => current ?? workingPeriods[workingPeriods.length - 1].id);
        setRules(storedRules.length ? storedRules : DEFAULT_CATEGORY_RULES);
        setCostBasisEntries(storedCostBasis);
        setReview(storedReview);
      } catch {
        if (!cancelled) {
          setError(
            new TreasuryReconciliationError({
              code: 'unavailable',
              message: 'Unable to load saved reconciliation data from this browser.',
              retryable: true,
            })
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId, network]);

  // ── Fetch reconciliation data for the active period ──
  const refresh = useCallback(async () => {
    if (!accountId || !activePeriod) return;
    controller.current?.abort();
    const requestController = new AbortController();
    controller.current = requestController;
    setError(null);
    if (result) setRefreshing(true);
    else setLoading(true);

    if (activePeriod.status === 'closed') {
      try {
        const snapshot = await treasuryDb.getSnapshot(activePeriod.id);
        if (!requestController.signal.aborted) {
          setClosedSnapshot(snapshot ?? null);
          setResult(null);
        }
      } finally {
        if (!requestController.signal.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
      return;
    }

    setClosedSnapshot(null);
    try {
      const priorPeriod = periods
        .filter((p) => p.end <= activePeriod.start)
        .sort((a, b) => (a.end < b.end ? 1 : -1))[0];
      const priorSnapshot = priorPeriod ? await treasuryDb.getSnapshot(priorPeriod.id) : undefined;
      const openingBalances = priorSnapshot
        ? Object.fromEntries(priorSnapshot.balances.map((b) => [b.asset.code, b.closing]))
        : undefined;

      const data = await fetchReconciliationPeriod(accountId, network, activePeriod, {
        signal: requestController.signal,
        rules,
        costBasisEntries,
        openingBalances,
      });
      if (requestController.signal.aborted) return;
      setResult(data);
    } catch (cause) {
      if (!requestController.signal.aborted) {
        setError(
          cause instanceof TreasuryReconciliationError
            ? cause
            : new TreasuryReconciliationError({
                code: 'unavailable',
                message: 'Unable to load reconciliation data.',
                retryable: true,
              })
        );
      }
    } finally {
      if (!requestController.signal.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, network, activePeriod, rules, costBasisEntries, periods]);

  useEffect(() => {
    void refresh();
    return () => controller.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePeriodId, activePeriod?.status]);

  // ── Re-apply categories locally when rules change, without a full re-fetch ──
  useEffect(() => {
    setResult((current) => (current ? { ...current, postings: recategorize(current.postings, rules) } : current));
  }, [rules]);

  const setPreferences = useCallback((patch: Partial<TreasuryPreferences>) => {
    setPreferencesState((current) => {
      const next = { ...current, ...patch };
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {
        /* storage may be disabled */
      }
      return next;
    });
  }, []);

  // ── Periods ──
  const createPeriod = useCallback(
    async (start: string, end: string) => {
      if (!accountId) return;
      if (end <= start) {
        setMessage('Period end must be after its start date.');
        return;
      }
      const period: ReconciliationPeriod = {
        id: `${accountId}:${network}:${start}`,
        accountId,
        network,
        start,
        end,
        status: 'open',
        createdAt: new Date().toISOString(),
      };
      await treasuryDb.savePeriod(period);
      setPeriods((current) => [...current.filter((p) => p.id !== period.id), period]);
      setActivePeriodId(period.id);
    },
    [accountId, network]
  );

  const closePeriod = useCallback(async () => {
    if (!activePeriod || !result) return;
    if (result.discrepancies.some((d) => d.severity === 'critical')) {
      setMessage('Cannot close a period with unresolved critical discrepancies.');
      return;
    }
    const snapshot = buildPeriodSnapshot(
      { ...activePeriod, status: 'closed', closedAt: new Date().toISOString() },
      result.postings,
      result.balances,
      result.discrepancies,
      review.filter((r) => result.postings.some((p) => p.id === r.targetId) || result.discrepancies.some((d) => d.id === r.targetId))
    );
    await treasuryDb.saveSnapshot(snapshot);
    await treasuryDb.savePeriod(snapshot.period);
    setPeriods((current) => current.map((p) => (p.id === snapshot.period.id ? snapshot.period : p)));
    setMessage('Period closed. Its snapshot is now immutable.');
  }, [activePeriod, result, review]);

  // ── Rules ──
  const upsertRule = useCallback(
    async (rule: CategoryRule) => {
      if (!accountId) return;
      const errors = validateRule(rule);
      if (errors.length) {
        setMessage(errors.join(' '));
        return;
      }
      await treasuryDb.saveRule(accountId, rule);
      setRules((current) => [...current.filter((r) => r.id !== rule.id), rule].sort((a, b) => a.priority - b.priority));
    },
    [accountId]
  );

  const removeRule = useCallback(
    async (ruleId: string) => {
      if (!accountId) return;
      await treasuryDb.deleteRule(accountId, ruleId);
      setRules((current) => current.filter((r) => r.id !== ruleId));
    },
    [accountId]
  );

  // ── Cost basis ──
  const upsertCostBasisEntry = useCallback(
    async (entry: CostBasisEntry) => {
      if (!accountId) return;
      const errors = validateCostBasisEntry(entry);
      if (errors.length) {
        setMessage(errors.join(' '));
        return;
      }
      await treasuryDb.saveCostBasisEntry(accountId, entry);
      setCostBasisEntries((current) => [...current.filter((e) => e.id !== entry.id), entry]);
    },
    [accountId]
  );

  const removeCostBasisEntry = useCallback(
    async (entryId: string) => {
      if (!accountId) return;
      await treasuryDb.deleteCostBasisEntry(accountId, entryId);
      setCostBasisEntries((current) => current.filter((e) => e.id !== entryId));
    },
    [accountId]
  );

  // ── Review state ──
  const setReviewStatus = useCallback(
    async (targetId: string, targetType: ReviewRecord['targetType'], status: ReviewStatus, note?: string) => {
      if (!accountId) return;
      const record: ReviewRecord = { targetId, targetType, status, note, updatedAt: new Date().toISOString() };
      await treasuryDb.saveReview(accountId, record);
      setReview((current) => [...current.filter((r) => !(r.targetId === targetId && r.targetType === targetType)), record]);
    },
    [accountId]
  );

  // ── Export / import ──
  const exportJson = useCallback(() => {
    if (!activePeriod || !result) return;
    const payload = buildExportPayload(activePeriod, result.postings, result.balances, result.discrepancies, review);
    exportPeriodJson(payload);
  }, [activePeriod, result, review]);

  const exportCsv = useCallback(() => {
    if (!activePeriod || !result) return;
    const payload = buildExportPayload(activePeriod, result.postings, result.balances, result.discrepancies, review);
    exportPeriodCsv(payload);
  }, [activePeriod, result, review]);

  const exportGenericLedger = useCallback(
    (mapping: AccountingMapping = DEFAULT_ACCOUNTING_MAPPING) => {
      if (!result) return;
      exportGenericLedgerCsv(result.postings, mapping);
    },
    [result]
  );

  const importAndVerify = useCallback((raw: string) => {
    const parsed = parseExportPayload(raw);
    if (!parsed.ok) {
      setMessage(`Import rejected: ${parsed.error}`);
      return null;
    }
    setMessage(`Verified export for period ${parsed.data!.period.id} (${parsed.data!.postings.length} postings).`);
    return parsed.data!;
  }, []);

  const unresolvedCount = useMemo(
    () => (result?.discrepancies ?? closedSnapshot?.discrepancies ?? []).filter((d) => {
      const reviewRecord = review.find((r) => r.targetId === d.id && r.targetType === 'discrepancy');
      return !reviewRecord || reviewRecord.status === 'unresolved';
    }).length,
    [result, closedSnapshot, review]
  );

  return {
    periods,
    activePeriod,
    setActivePeriodId,
    result,
    closedSnapshot,
    rules,
    costBasisEntries,
    review,
    loading,
    refreshing,
    error,
    message,
    clearMessage: () => setMessage(''),
    preferences,
    setPreferences,
    unresolvedCount,
    refresh,
    createPeriod,
    closePeriod,
    upsertRule,
    removeRule,
    upsertCostBasisEntry,
    removeCostBasisEntry,
    setReviewStatus,
    exportJson,
    exportCsv,
    exportGenericLedger,
    importAndVerify,
  };
}
