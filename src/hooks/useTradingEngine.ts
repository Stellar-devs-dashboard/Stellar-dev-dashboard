import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  TradingEngineError,
  createDemonstrationTrading,
  getTradingSnapshot,
} from '../lib/trading/client'
import { runBacktest } from '../lib/trading/algorithms'
import { defaultRiskLimits, defaultStrategyConfig } from '../lib/trading/fixtures'
import type { RiskLimits, StrategyConfig, TradingSnapshot } from '../types/trading'

const KEY = 'stellar:trading-engine:config'

interface StoredConfig {
  strategy: StrategyConfig
  risk: RiskLimits
  autoRefresh: boolean
  refreshIntervalMs: number
}

function loadConfig(): StoredConfig {
  const fallback: StoredConfig = {
    strategy: defaultStrategyConfig(),
    risk: defaultRiskLimits(),
    autoRefresh: true,
    refreshIntervalMs: 20_000,
  }
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<StoredConfig>
    return {
      strategy: { ...fallback.strategy, ...stored.strategy },
      risk: { ...fallback.risk, ...stored.risk },
      autoRefresh: stored.autoRefresh ?? fallback.autoRefresh,
      refreshIntervalMs: stored.refreshIntervalMs ?? fallback.refreshIntervalMs,
    }
  } catch {
    return fallback
  }
}

export default function useTradingEngine(network: string) {
  const [snapshot, setSnapshot] = useState<TradingSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<TradingEngineError | null>(null)
  const [requestId, setRequestId] = useState<string | null>(null)
  const [cached, setCached] = useState(false)
  const [stressTest, setStressTest] = useState(false)
  const [config, setConfigState] = useState<StoredConfig>(loadConfig)
  const controller = useRef<AbortController | null>(null)

  const refresh = useCallback(
    async (force = false) => {
      controller.current?.abort()
      const requestController = new AbortController()
      controller.current = requestController
      setError(null)
      if (snapshot) setRefreshing(true)
      else setLoading(true)
      try {
        const result = await getTradingSnapshot(network, {
          signal: requestController.signal,
          force,
          allowStale: true,
        })
        if (requestController.signal.aborted) return
        setSnapshot(result.data)
        setRequestId(result.requestId)
        setCached(result.cached)
        setStressTest(false)
      } catch (cause) {
        if (!requestController.signal.aborted) {
          setError(
            cause instanceof TradingEngineError
              ? cause
              : new TradingEngineError({
                  code: 'unavailable',
                  message: 'Unable to load trading engine data.',
                  retryable: true,
                })
          )
        }
      } finally {
        if (!requestController.signal.aborted) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    },
    [network, snapshot]
  )

  useEffect(() => {
    void refresh()
    return () => controller.current?.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [network])

  useEffect(() => {
    if (!config.autoRefresh || stressTest) return
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) void refresh(true)
    }, config.refreshIntervalMs)
    return () => window.clearInterval(id)
  }, [config.autoRefresh, config.refreshIntervalMs, refresh, stressTest])

  const persist = useCallback((next: StoredConfig) => {
    setConfigState(next)
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      /* storage may be disabled */
    }
  }, [])

  const updateStrategyConfig = useCallback(
    (patch: Partial<StrategyConfig>) => persist({ ...config, strategy: { ...config.strategy, ...patch } }),
    [config, persist]
  )

  const updateRiskLimits = useCallback(
    (patch: Partial<RiskLimits>) => persist({ ...config, risk: { ...config.risk, ...patch } }),
    [config, persist]
  )

  const setAutoRefresh = useCallback(
    (autoRefresh: boolean) => persist({ ...config, autoRefresh }),
    [config, persist]
  )

  const runStressTest = useCallback(() => {
    setSnapshot(createDemonstrationTrading(network, true, new Date()))
    setStressTest(true)
    setError(null)
    setCached(false)
  }, [network])

  const backtest = useMemo(() => {
    if (!snapshot) return null
    const series = snapshot.priceHistory.XLM
    if (!series || series.length < 2) return null
    return runBacktest(series, config.strategy, { seed: 7 })
  }, [snapshot, config.strategy])

  return {
    snapshot,
    loading,
    refreshing,
    error,
    requestId,
    cached,
    stressTest,
    strategyConfig: config.strategy,
    riskLimits: config.risk,
    autoRefresh: config.autoRefresh,
    backtest,
    refresh,
    updateStrategyConfig,
    updateRiskLimits,
    setAutoRefresh,
    runStressTest,
    exitStressTest: () => void refresh(true),
  }
}
