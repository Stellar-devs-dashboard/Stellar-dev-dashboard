import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearTradingCache,
  createDemonstrationTrading,
  getTradingSnapshot,
  TradingEngineError,
} from '../client'

describe('trading engine client', () => {
  afterEach(() => {
    clearTradingCache()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('returns demonstration snapshots when no API is configured', async () => {
    const result = await getTradingSnapshot('testnet')
    expect(result.cached).toBe(false)
    expect(result.data.state).toBe('simulation')
    expect(result.data.opportunities.length).toBeGreaterThan(0)
    expect(result.data.quotes.length).toBeGreaterThan(0)
    expect(result.requestId).toBeTruthy()
  })

  it('serves cached snapshots within the TTL', async () => {
    const first = await getTradingSnapshot('testnet')
    const second = await getTradingSnapshot('testnet')
    expect(second.cached).toBe(true)
    expect(second.data.generatedAt).toBe(first.data.generatedAt)
  })

  it('creates a stress-test demonstration snapshot that trips the circuit breaker', () => {
    const snapshot = createDemonstrationTrading('testnet', true)
    expect(snapshot.state).toBe('simulation')
    expect(snapshot.riskAssessment.circuitBreakerActive).toBe(true)
  })

  it('a normal demonstration snapshot does not trip the circuit breaker', () => {
    const snapshot = createDemonstrationTrading('testnet', false)
    expect(snapshot.riskAssessment.circuitBreakerActive).toBe(false)
  })

  it('maps HTTP failures to retryable TradingEngineError', async () => {
    vi.stubEnv('VITE_TRADING_API_URL', 'https://trading.example.invalid')
    clearTradingCache()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 503 }))
    await expect(getTradingSnapshot('testnet', { force: true })).rejects.toMatchObject({
      name: 'TradingEngineError',
      code: 'unavailable',
      retryable: true,
    })
  })

  it('returns stale degraded data when allowStale is set', async () => {
    const base = await getTradingSnapshot('public')
    vi.stubEnv('VITE_TRADING_API_URL', 'https://trading.example.invalid')
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'))
    const degraded = await getTradingSnapshot('public', { force: true, allowStale: true })
    expect(degraded.cached).toBe(true)
    expect(degraded.data.state).toBe('degraded')
    expect(degraded.data.summary.modelVersion).toBe(base.data.summary.modelVersion)
  })

  it('constructs typed errors', () => {
    const error = new TradingEngineError({ code: 'timeout', message: 'too slow', retryable: true, requestId: 'abc' })
    expect(error).toBeInstanceOf(Error)
    expect(error.code).toBe('timeout')
    expect(error.requestId).toBe('abc')
  })
})
