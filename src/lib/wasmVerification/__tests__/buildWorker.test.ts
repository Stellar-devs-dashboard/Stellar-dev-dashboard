import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestBuild, simulateBuild } from '../buildWorker'
import { createEmptyManifestDraft } from '../manifest'

const manifest = createEmptyManifestDraft('CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF', 'testnet')

function streamResponse(chunks: Uint8Array[], init: { ok?: boolean; status?: number } = {}): Response {
  let index = 0
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    body: {
      getReader: () => ({
        read: async () => {
          if (index < chunks.length) {
            const value = chunks[index]
            index += 1
            return { done: false, value }
          }
          return { done: true, value: undefined }
        },
        cancel: async () => {},
      }),
    },
  } as unknown as Response
}

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

describe('requestBuild — origin restrictions', () => {
  afterEach(() => vi.restoreAllMocks())

  it('rejects a non-https origin without making a network call', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const result = await requestBuild(manifest, { origin: 'http://insecure.example.com' })
    expect(result.status).toBe('rejected')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('rejects an origin with embedded credentials', async () => {
    const result = await requestBuild(manifest, { origin: 'https://user:pass@worker.example.com' })
    expect(result.status).toBe('rejected')
  })

  it('rejects an origin with a path component', async () => {
    const result = await requestBuild(manifest, { origin: 'https://worker.example.com/v1' })
    expect(result.status).toBe('rejected')
  })

  it('rejects a malformed origin URL', async () => {
    const result = await requestBuild(manifest, { origin: 'not a url' })
    expect(result.status).toBe('rejected')
  })
})

describe('requestBuild — success and failure paths', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns a succeeded result and redacts secrets in worker logs', async () => {
    const body = JSON.stringify({
      wasmBase64: 'AGFzbQEAAAA=',
      logs: ['build ok', 'Authorization: Bearer abcdefghijklmnopqrstuvwxyzABCDEFGH'],
    })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(streamResponse([encode(body)]))
    const result = await requestBuild(manifest, { origin: 'https://worker.example.com' })
    expect(result.status).toBe('succeeded')
    expect(result.wasmBase64).toBe('AGFzbQEAAAA=')
    expect(result.logs.join(' ')).not.toMatch(/abcdefghijklmnopqrstuvwxyzABCDEFGH/)
  })

  it('returns a failed result on a non-2xx response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(streamResponse([], { ok: false, status: 503 }))
    const result = await requestBuild(manifest, { origin: 'https://worker.example.com' })
    expect(result.status).toBe('failed')
    expect(result.error).toMatch(/503/)
  })

  it('returns a rejected result when the response exceeds the byte cap, without buffering it all', async () => {
    const chunk = new Uint8Array(50)
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(streamResponse([chunk, chunk, chunk]))
    const result = await requestBuild(manifest, { origin: 'https://worker.example.com', maxResponseBytes: 60 })
    expect(result.status).toBe('rejected')
    expect(result.error).toMatch(/exceeded/)
  })

  it('returns a timeout result when the worker never responds within the configured budget', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          const signal = (init as RequestInit).signal
          signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        })
    )
    const result = await requestBuild(manifest, { origin: 'https://worker.example.com', timeoutMs: 20 })
    expect(result.status).toBe('timeout')
  }, 2000)

  it('returns a failed result when fetch itself rejects with a network error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('DNS lookup failed for token notarealsecretvaluejustatestfixture'))
    const result = await requestBuild(manifest, { origin: 'https://worker.example.com' })
    expect(result.status).toBe('failed')
    expect(result.error).not.toMatch(/notarealsecretvaluejustatestfixture/)
  })
})

describe('simulateBuild', () => {
  it('always returns a clearly-labeled simulated result', () => {
    const result = simulateBuild(manifest, 'AGFzbQEAAAA=')
    expect(result.simulated).toBe(true)
    expect(result.status).toBe('succeeded')
    expect(result.workerOrigin).toBe('simulation')
  })
})
