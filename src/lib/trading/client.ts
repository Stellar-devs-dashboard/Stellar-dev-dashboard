import type { TradingApiError, TradingSnapshot, TradingSnapshotResponse } from '../../types/trading'
import { createTradingSnapshot } from './fixtures'

const CACHE_TTL = 15_000
const cache = new Map<string, { data: TradingSnapshot; storedAt: number }>()

export class TradingEngineError extends Error implements TradingApiError {
  code: TradingApiError['code']
  retryable: boolean
  requestId?: string
  constructor(error: TradingApiError) {
    super(error.message)
    this.name = 'TradingEngineError'
    this.code = error.code
    this.retryable = error.retryable
    this.requestId = error.requestId
  }
}

const requestId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `trading-${Date.now()}`

const isSnapshot = (value: unknown): value is TradingSnapshot =>
  Boolean(
    value &&
      typeof value === 'object' &&
      Array.isArray((value as TradingSnapshot).opportunities) &&
      Array.isArray((value as TradingSnapshot).quotes) &&
      (value as TradingSnapshot).summary &&
      (value as TradingSnapshot).riskAssessment
  )

export async function getTradingSnapshot(
  network: string,
  options: { signal?: AbortSignal; force?: boolean; allowStale?: boolean } = {}
): Promise<TradingSnapshotResponse> {
  const id = requestId()
  const cacheKey = network
  const existing = cache.get(cacheKey)
  if (!options.force && existing && Date.now() - existing.storedAt < CACHE_TTL) {
    return { data: existing.data, requestId: id, cached: true }
  }

  const endpoint = import.meta.env.VITE_TRADING_API_URL as string | undefined
  if (!endpoint) {
    const data = createTradingSnapshot(network, { state: 'simulation' })
    cache.set(cacheKey, { data, storedAt: Date.now() })
    return { data, requestId: id, cached: false }
  }

  const controller = new AbortController()
  const abort = () => controller.abort()
  options.signal?.addEventListener('abort', abort, { once: true })
  const timeout = window.setTimeout(() => controller.abort(), 8_000)

  try {
    const response = await fetch(
      `${endpoint.replace(/\/$/, '')}/v1/trading/${encodeURIComponent(network)}/snapshot`,
      { headers: { Accept: 'application/json', 'X-Request-ID': id }, signal: controller.signal }
    )
    if (response.status === 429) {
      throw new TradingEngineError({
        code: 'rate-limited',
        message: 'Trading engine service rate limit reached.',
        retryable: true,
        requestId: id,
      })
    }
    if (!response.ok) {
      throw new TradingEngineError({
        code: 'unavailable',
        message: `Trading engine service returned HTTP ${response.status}.`,
        retryable: response.status >= 500,
        requestId: id,
      })
    }
    const payload: unknown = await response.json()
    if (!isSnapshot(payload)) {
      throw new TradingEngineError({
        code: 'invalid-response',
        message: 'Trading engine service returned an invalid snapshot.',
        retryable: true,
        requestId: id,
      })
    }
    const data = { ...payload, state: 'live' as const }
    cache.set(cacheKey, { data, storedAt: Date.now() })
    return { data, requestId: id, cached: false }
  } catch (error) {
    if (options.signal?.aborted) {
      throw new TradingEngineError({
        code: 'aborted',
        message: 'Trading engine request was cancelled.',
        retryable: false,
        requestId: id,
      })
    }
    if (options.allowStale && existing) {
      return { data: { ...existing.data, state: 'degraded' }, requestId: id, cached: true }
    }
    if (error instanceof TradingEngineError) throw error
    throw new TradingEngineError({
      code: controller.signal.aborted ? 'timeout' : 'unavailable',
      message: controller.signal.aborted
        ? 'Trading engine service did not respond in time.'
        : 'Unable to load trading engine data.',
      retryable: true,
      requestId: id,
    })
  } finally {
    window.clearTimeout(timeout)
    options.signal?.removeEventListener('abort', abort)
  }
}

export function createDemonstrationTrading(network: string, stressTest = false, now = new Date()): TradingSnapshot {
  return createTradingSnapshot(network, { now, state: 'simulation', stressTest })
}

export function clearTradingCache(): void {
  cache.clear()
}
