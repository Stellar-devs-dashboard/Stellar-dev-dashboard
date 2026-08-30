import type { GraphApiError, GraphSnapshot, GraphSnapshotResponse } from '../../types/networkGraph'
import { createGraphSnapshot } from './fixtures'

const CACHE_TTL = 20_000
const cache = new Map<string, { data: GraphSnapshot; storedAt: number }>()

export class GraphAnalysisError extends Error implements GraphApiError {
  code: GraphApiError['code']
  retryable: boolean
  requestId?: string
  constructor(error: GraphApiError) {
    super(error.message)
    this.name = 'GraphAnalysisError'
    this.code = error.code
    this.retryable = error.retryable
    this.requestId = error.requestId
  }
}

const requestId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `graph-${Date.now()}`

const isSnapshot = (value: unknown): value is GraphSnapshot =>
  Boolean(
    value &&
      typeof value === 'object' &&
      Array.isArray((value as GraphSnapshot).nodes) &&
      Array.isArray((value as GraphSnapshot).edges) &&
      (value as GraphSnapshot).summary
  )

export async function getGraphSnapshot(
  network: string,
  options: { signal?: AbortSignal; force?: boolean; allowStale?: boolean } = {}
): Promise<GraphSnapshotResponse> {
  const id = requestId()
  const cacheKey = network
  const existing = cache.get(cacheKey)
  if (!options.force && existing && Date.now() - existing.storedAt < CACHE_TTL) {
    return { data: existing.data, requestId: id, cached: true }
  }

  const endpoint = import.meta.env.VITE_GRAPH_API_URL as string | undefined
  if (!endpoint) {
    const data = createGraphSnapshot(network, { state: 'simulation' })
    cache.set(cacheKey, { data, storedAt: Date.now() })
    return { data, requestId: id, cached: false }
  }

  const controller = new AbortController()
  const abort = () => controller.abort()
  options.signal?.addEventListener('abort', abort, { once: true })
  const timeout = window.setTimeout(() => controller.abort(), 8_000)

  try {
    const response = await fetch(
      `${endpoint.replace(/\/$/, '')}/v1/graph/${encodeURIComponent(network)}/snapshot`,
      { headers: { Accept: 'application/json', 'X-Request-ID': id }, signal: controller.signal }
    )
    if (response.status === 429) {
      throw new GraphAnalysisError({
        code: 'rate-limited',
        message: 'Graph analysis service rate limit reached.',
        retryable: true,
        requestId: id,
      })
    }
    if (!response.ok) {
      throw new GraphAnalysisError({
        code: 'unavailable',
        message: `Graph analysis service returned HTTP ${response.status}.`,
        retryable: response.status >= 500,
        requestId: id,
      })
    }
    const payload: unknown = await response.json()
    if (!isSnapshot(payload)) {
      throw new GraphAnalysisError({
        code: 'invalid-response',
        message: 'Graph analysis service returned an invalid snapshot.',
        retryable: true,
        requestId: id,
      })
    }
    const data = { ...payload, state: 'live' as const }
    cache.set(cacheKey, { data, storedAt: Date.now() })
    return { data, requestId: id, cached: false }
  } catch (error) {
    if (options.signal?.aborted) {
      throw new GraphAnalysisError({
        code: 'aborted',
        message: 'Graph analysis request was cancelled.',
        retryable: false,
        requestId: id,
      })
    }
    if (options.allowStale && existing) {
      return { data: { ...existing.data, state: 'degraded' }, requestId: id, cached: true }
    }
    if (error instanceof GraphAnalysisError) throw error
    throw new GraphAnalysisError({
      code: controller.signal.aborted ? 'timeout' : 'unavailable',
      message: controller.signal.aborted
        ? 'Graph analysis service did not respond in time.'
        : 'Unable to load graph analysis data.',
      retryable: true,
      requestId: id,
    })
  } finally {
    window.clearTimeout(timeout)
    options.signal?.removeEventListener('abort', abort)
  }
}

export function createDemonstrationGraph(network: string, now = new Date()): GraphSnapshot {
  return createGraphSnapshot(network, { now, state: 'simulation' })
}

export function clearGraphCache(): void {
  cache.clear()
}
