import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearGraphCache,
  createDemonstrationGraph,
  GraphAnalysisError,
  getGraphSnapshot,
} from '../client'

describe('graph analysis client', () => {
  afterEach(() => {
    clearGraphCache()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('returns demonstration snapshots when no API is configured', async () => {
    const result = await getGraphSnapshot('testnet')
    expect(result.cached).toBe(false)
    expect(result.data.state).toBe('simulation')
    expect(result.data.nodes.length).toBeGreaterThan(0)
    expect(result.data.edges.length).toBeGreaterThan(0)
    expect(result.requestId).toBeTruthy()
  })

  it('serves cached snapshots within the TTL', async () => {
    const first = await getGraphSnapshot('testnet')
    const second = await getGraphSnapshot('testnet')
    expect(second.cached).toBe(true)
    expect(second.data.generatedAt).toBe(first.data.generatedAt)
  })

  it('creates demonstration data on demand', () => {
    const snapshot = createDemonstrationGraph('testnet')
    expect(snapshot.state).toBe('simulation')
    expect(snapshot.summary.nodeCount).toBe(snapshot.nodes.length)
  })

  it('maps HTTP failures to retryable GraphAnalysisError', async () => {
    vi.stubEnv('VITE_GRAPH_API_URL', 'https://graph.example.invalid')
    clearGraphCache()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 503 }))
    await expect(getGraphSnapshot('testnet', { force: true })).rejects.toMatchObject({
      name: 'GraphAnalysisError',
      code: 'unavailable',
      retryable: true,
    })
  })

  it('returns stale degraded data when allowStale is set', async () => {
    const base = await getGraphSnapshot('public')
    vi.stubEnv('VITE_GRAPH_API_URL', 'https://graph.example.invalid')
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'))
    const degraded = await getGraphSnapshot('public', { force: true, allowStale: true })
    expect(degraded.cached).toBe(true)
    expect(degraded.data.state).toBe('degraded')
    expect(degraded.data.summary.modelVersion).toBe(base.data.summary.modelVersion)
  })

  it('rejects with an aborted error when the signal is aborted', async () => {
    vi.stubEnv('VITE_GRAPH_API_URL', 'https://graph.example.invalid')
    clearGraphCache()
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () => new Promise((_resolve, reject) => {
        setTimeout(() => reject(new DOMException('aborted', 'AbortError')), 5)
      })
    )
    const controller = new AbortController()
    const pending = getGraphSnapshot('testnet', { force: true, signal: controller.signal })
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'GraphAnalysisError', code: 'aborted' })
  })

  it('constructs typed errors', () => {
    const error = new GraphAnalysisError({ code: 'timeout', message: 'too slow', retryable: true, requestId: 'abc' })
    expect(error).toBeInstanceOf(Error)
    expect(error.code).toBe('timeout')
    expect(error.requestId).toBe('abc')
  })
})
