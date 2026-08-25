import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  GraphAnalysisError,
  createDemonstrationGraph,
  getGraphSnapshot,
} from '../lib/networkGraph/client'
import {
  bfsPath,
  buildAdjacency,
  computeCentrality,
  detectCommunities,
  kHopNeighborhood,
  runAllPatternDetectors,
} from '../lib/networkGraph/algorithms'
import { parseGraphQuery } from '../lib/networkGraph/nlQuery'
import type {
  GraphAnalysisPreferences,
  GraphSnapshot,
  NLQueryResult,
  PathResult,
  PatternSeverity,
} from '../types/networkGraph'

const KEY = 'stellar:network-graph:preferences'
const defaults: GraphAnalysisPreferences = {
  maxHops: 10,
  minCommunitySize: 3,
  minPatternSeverity: 'low',
  autoRefresh: true,
  refreshIntervalMs: 45_000,
}

function loadPreferences(): GraphAnalysisPreferences {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<GraphAnalysisPreferences>
    const severities: PatternSeverity[] = ['low', 'medium', 'high', 'critical']
    return {
      ...defaults,
      ...stored,
      maxHops: stored.maxHops && stored.maxHops >= 1 && stored.maxHops <= 10 ? stored.maxHops : defaults.maxHops,
      minPatternSeverity: severities.includes(stored.minPatternSeverity ?? 'low')
        ? (stored.minPatternSeverity as PatternSeverity)
        : defaults.minPatternSeverity,
    }
  } catch {
    return defaults
  }
}

export default function useNetworkGraph(network: string) {
  const [snapshot, setSnapshot] = useState<GraphSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<GraphAnalysisError | null>(null)
  const [requestId, setRequestId] = useState<string | null>(null)
  const [cached, setCached] = useState(false)
  const [preferences, setPreferencesState] = useState<GraphAnalysisPreferences>(loadPreferences)
  const [lastPath, setLastPath] = useState<PathResult | null>(null)
  const [lastQuery, setLastQuery] = useState<NLQueryResult | null>(null)
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
        const result = await getGraphSnapshot(network, {
          signal: requestController.signal,
          force,
          allowStale: true,
        })
        if (requestController.signal.aborted) return
        setSnapshot(result.data)
        setRequestId(result.requestId)
        setCached(result.cached)
      } catch (cause) {
        if (!requestController.signal.aborted) {
          setError(
            cause instanceof GraphAnalysisError
              ? cause
              : new GraphAnalysisError({
                  code: 'unavailable',
                  message: 'Unable to load graph analysis data.',
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
    if (!preferences.autoRefresh) return
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) void refresh(true)
    }, preferences.refreshIntervalMs)
    return () => window.clearInterval(id)
  }, [preferences.autoRefresh, preferences.refreshIntervalMs, refresh])

  const setPreferences = useCallback((patch: Partial<GraphAnalysisPreferences>) => {
    setPreferencesState((current) => {
      const next = { ...current, ...patch }
      try {
        localStorage.setItem(KEY, JSON.stringify(next))
      } catch {
        /* storage may be disabled */
      }
      return next
    })
  }, [])

  const adjacency = useMemo(
    () => (snapshot ? buildAdjacency(snapshot.nodes, snapshot.edges) : null),
    [snapshot]
  )

  const centrality = useMemo(
    () => (snapshot ? computeCentrality(snapshot.nodes, snapshot.edges) : []),
    [snapshot]
  )

  const communities = useMemo(
    () => (snapshot ? detectCommunities(snapshot.nodes, snapshot.edges, preferences.minCommunitySize) : []),
    [snapshot, preferences.minCommunitySize]
  )

  const patterns = useMemo(
    () =>
      snapshot ? runAllPatternDetectors(snapshot.nodes, snapshot.edges, centrality, preferences.minPatternSeverity) : [],
    [snapshot, centrality, preferences.minPatternSeverity]
  )

  const findPath = useCallback(
    (sourceId: string, targetId: string, maxHops = preferences.maxHops) => {
      if (!adjacency) return null
      const result = bfsPath(adjacency, sourceId, targetId, maxHops)
      setLastPath(result)
      return result
    },
    [adjacency, preferences.maxHops]
  )

  const neighborhood = useCallback(
    (nodeId: string, hops = preferences.maxHops) => {
      if (!adjacency) return new Set<string>()
      return kHopNeighborhood(adjacency, nodeId, hops)
    },
    [adjacency, preferences.maxHops]
  )

  const runQuery = useCallback(
    (text: string) => {
      const result = parseGraphQuery(text, snapshot?.nodes || [])
      setLastQuery(result)
      return result
    },
    [snapshot]
  )

  const simulateNetwork = useCallback(() => {
    setSnapshot(createDemonstrationGraph(network, new Date()))
    setError(null)
    setCached(false)
  }, [network])

  return {
    snapshot,
    loading,
    refreshing,
    error,
    requestId,
    cached,
    preferences,
    adjacency,
    centrality,
    communities,
    patterns,
    lastPath,
    lastQuery,
    refresh,
    setPreferences,
    findPath,
    neighborhood,
    runQuery,
    simulateNetwork,
  }
}
