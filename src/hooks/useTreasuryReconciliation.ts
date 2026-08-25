import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { NetworkName } from '../lib/stellar'
import { fetchAccountLedgerActivity, TreasuryFetchError } from '../lib/treasury/client'
import { normalizeAccountActivity } from '../lib/treasury/normalize'
import { applyRules, DEFAULT_CATEGORY_RULES, labelCounterparties } from '../lib/treasury/rules'
import { buildPeriod, findUnresolvedItems, type BuildPeriodInput } from '../lib/treasury/reconciliation'
import { computeRealizedGainLoss } from '../lib/treasury/costBasis'
import { createPeriodSnapshot, verifySnapshotIntegrity } from '../lib/treasury/snapshot'
import {
  loadCategoryRules,
  loadCostBasisEntries,
  loadCounterpartyLabels,
  loadSnapshots,
  saveCategoryRules,
  saveCostBasisEntries,
  saveCounterpartyLabels,
  saveSnapshot,
} from '../lib/treasury/records'
import { buildFixtureCostBasisEntries, buildFixtureLedger, FIXTURE_ACCOUNT } from '../lib/treasury/fixtures'
import type {
  CategoryRule,
  CostBasisEntry,
  CounterpartyLabel,
  LedgerPosting,
  PeriodSnapshot,
  RealizedGainLoss,
  ReconciliationPeriod,
} from '../types/treasury'

interface LedgerState {
  loading: boolean
  error: TreasuryFetchError | null
  postings: LedgerPosting[]
  pagingGapDetected: boolean
  truncated: boolean
  simulated: boolean
}

const IDLE_LEDGER: LedgerState = { loading: false, error: null, postings: [], pagingGapDetected: false, truncated: false, simulated: false }

export default function useTreasuryReconciliation(accountId: string | null, network: NetworkName) {
  const [ledger, setLedger] = useState<LedgerState>(IDLE_LEDGER)
  const [rules, setRules] = useState<CategoryRule[]>(DEFAULT_CATEGORY_RULES)
  const [labels, setLabels] = useState<CounterpartyLabel[]>([])
  const [costBasisEntries, setCostBasisEntries] = useState<CostBasisEntry[]>([])
  const [snapshots, setSnapshots] = useState<PeriodSnapshot[]>([])
  const [period, setPeriod] = useState<ReconciliationPeriod | null>(null)
  const controller = useRef<AbortController | null>(null)

  const loadPersisted = useCallback(async () => {
    const [storedRules, storedLabels, storedCostBasis, storedSnapshots] = await Promise.all([
      loadCategoryRules(),
      loadCounterpartyLabels(),
      loadCostBasisEntries(),
      loadSnapshots(),
    ])
    if (storedRules.length) setRules(storedRules)
    setLabels(storedLabels)
    setCostBasisEntries(storedCostBasis)
    setSnapshots(storedSnapshots)
  }, [])

  useEffect(() => {
    void loadPersisted()
  }, [loadPersisted])

  const refresh = useCallback(
    async (simulate = false) => {
      controller.current?.abort()
      const requestController = new AbortController()
      controller.current = requestController
      setLedger((prev) => ({ ...prev, loading: true, error: null }))

      try {
        let transactions
        let operations
        let pagingGap
        let truncated
        let subjectAccount: string

        if (simulate || !accountId) {
          const fixture = buildFixtureLedger()
          transactions = fixture.transactions
          operations = fixture.operations
          pagingGap = { gapDetected: false, details: [] }
          truncated = false
          subjectAccount = FIXTURE_ACCOUNT
          if (!costBasisEntries.length) setCostBasisEntries(buildFixtureCostBasisEntries())
        } else {
          const result = await fetchAccountLedgerActivity(accountId, network, requestController.signal)
          transactions = result.transactions
          operations = result.operations
          pagingGap = result.pagingGap
          truncated = result.truncated
          subjectAccount = accountId
        }

        if (requestController.signal.aborted) return
        const { postings: rawPostings } = normalizeAccountActivity(subjectAccount, transactions, operations)
        const categorized = applyRules(rawPostings, rules)
        const labeled = labelCounterparties(categorized, labels)
        setLedger({ loading: false, error: null, postings: labeled, pagingGapDetected: pagingGap.gapDetected, truncated, simulated: simulate || !accountId })
      } catch (error) {
        if (requestController.signal.aborted) return
        setLedger({
          loading: false,
          error: error instanceof TreasuryFetchError ? error : new TreasuryFetchError({ code: 'unavailable', message: 'Unable to load ledger activity.', retryable: true }),
          postings: [],
          pagingGapDetected: false,
          truncated: false,
          simulated: false,
        })
      }
    },
    [accountId, network, rules, labels, costBasisEntries.length]
  )

  useEffect(() => {
    void refresh()
    return () => controller.current?.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, network])

  const updateRules = useCallback(async (next: CategoryRule[]) => {
    setRules(next)
    await saveCategoryRules(next)
  }, [])

  const updateLabels = useCallback(async (next: CounterpartyLabel[]) => {
    setLabels(next)
    await saveCounterpartyLabels(next)
  }, [])

  const updateCostBasisEntries = useCallback(async (next: CostBasisEntry[]) => {
    setCostBasisEntries(next)
    await saveCostBasisEntries(next)
  }, [])

  const buildReconciliationPeriod = useCallback(
    (input: Omit<BuildPeriodInput, 'postings' | 'pagingGapDetected'>) => {
      const next = buildPeriod({ ...input, postings: ledger.postings, pagingGapDetected: ledger.pagingGapDetected })
      setPeriod(next)
      return next
    },
    [ledger.postings, ledger.pagingGapDetected]
  )

  const realizedGainLossByAsset = useMemo(() => {
    if (!period) return new Map<string, RealizedGainLoss[]>()
    const assets = Array.from(new Set(period.postings.map((p) => p.asset)))
    const map = new Map<string, RealizedGainLoss[]>()
    for (const asset of assets) {
      map.set(asset, computeRealizedGainLoss(asset, period.postings, costBasisEntries).realized)
    }
    return map
  }, [period, costBasisEntries])

  const allRealizedGainLoss = useMemo(() => Array.from(realizedGainLossByAsset.values()).flat(), [realizedGainLossByAsset])

  const unresolvedItems = useMemo(() => (period ? findUnresolvedItems(period.postings, allRealizedGainLoss) : []), [period, allRealizedGainLoss])

  const saveCurrentSnapshot = useCallback(async () => {
    if (!period) return null
    const snapshot = await createPeriodSnapshot(period, `${period.id}-${Date.now()}`)
    await saveSnapshot(snapshot)
    setSnapshots((prev) => [snapshot, ...prev])
    return snapshot
  }, [period])

  const verifySnapshot = useCallback((snapshot: PeriodSnapshot) => verifySnapshotIntegrity(snapshot), [])

  return {
    ledger,
    rules,
    labels,
    costBasisEntries,
    snapshots,
    period,
    realizedGainLossByAsset,
    unresolvedItems,
    refresh,
    updateRules,
    updateLabels,
    updateCostBasisEntries,
    buildReconciliationPeriod,
    saveCurrentSnapshot,
    verifySnapshot,
    setPeriod,
  }
}
