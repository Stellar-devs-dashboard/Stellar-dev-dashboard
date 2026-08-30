import type { BuildWorkerResult, VerificationManifest } from '../../types/wasmVerification'
import { redactLogLines, redactSecrets } from './redaction'

export const DEFAULT_TIMEOUT_MS = 45_000
export const MAX_RESPONSE_BYTES = 20 * 1024 * 1024

export interface BuildWorkerConfig {
  origin: string
  timeoutMs?: number
  maxResponseBytes?: number
}

function validateOrigin(origin: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(origin)
  } catch {
    return 'Build worker origin is not a valid URL.'
  }
  if (parsed.protocol !== 'https:') return 'Build worker origin must use https://.'
  if (parsed.username || parsed.password) return 'Build worker origin must not embed credentials.'
  if (parsed.pathname !== '/' && parsed.pathname !== '') return 'Build worker origin must not include a path.'
  return null
}

/**
 * Reads a fetch response body incrementally, aborting the moment the
 * configured byte cap is exceeded. A malicious or misbehaving worker cannot
 * exhaust browser memory by lying about (or omitting) Content-Length.
 */
async function readBoundedBody(response: Response, maxBytes: number): Promise<Uint8Array> {
  const reader = response.body?.getReader()
  if (!reader) {
    const buffer = await response.arrayBuffer()
    if (buffer.byteLength > maxBytes) throw new Error(`OVERSIZED:${buffer.byteLength}`)
    return new Uint8Array(buffer)
  }
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      total += value.length
      if (total > maxBytes) {
        await reader.cancel()
        throw new Error(`OVERSIZED:${total}`)
      }
      chunks.push(value)
    }
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

/**
 * Requests a reproducible build from an external worker over HTTPS. The
 * browser never executes the manifest's build command itself — this
 * function only ever performs a single bounded `fetch` to an allow-listed
 * https origin and returns whatever bytes/logs the worker reports.
 */
export async function requestBuild(
  manifest: VerificationManifest,
  config: BuildWorkerConfig,
  signal?: AbortSignal
): Promise<BuildWorkerResult> {
  const started = Date.now()
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const maxResponseBytes = config.maxResponseBytes ?? MAX_RESPONSE_BYTES

  const originError = validateOrigin(config.origin)
  if (originError) {
    return { status: 'rejected', wasmBase64: null, logs: [], durationMs: 0, workerOrigin: config.origin, simulated: false, error: originError }
  }

  const controller = new AbortController()
  const onExternalAbort = () => controller.abort()
  signal?.addEventListener('abort', onExternalAbort, { once: true })
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(`${config.origin.replace(/\/$/, '')}/v1/build`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ manifest }),
      signal: controller.signal,
    })

    if (!response.ok) {
      return {
        status: 'failed',
        wasmBase64: null,
        logs: [],
        durationMs: Date.now() - started,
        workerOrigin: config.origin,
        simulated: false,
        error: redactSecrets(`Build worker returned HTTP ${response.status}.`),
      }
    }

    const bodyBytes = await readBoundedBody(response, maxResponseBytes)
    const parsed = JSON.parse(new TextDecoder().decode(bodyBytes)) as { wasmBase64?: string; logs?: string[] }

    return {
      status: 'succeeded',
      wasmBase64: parsed.wasmBase64 || null,
      logs: Array.isArray(parsed.logs) ? redactLogLines(parsed.logs.map(String)) : [],
      durationMs: Date.now() - started,
      workerOrigin: config.origin,
      simulated: false,
      error: null,
    }
  } catch (error) {
    const message = (error as Error).message || 'Unknown build worker error.'
    if (message.startsWith('OVERSIZED:')) {
      return {
        status: 'rejected',
        wasmBase64: null,
        logs: [],
        durationMs: Date.now() - started,
        workerOrigin: config.origin,
        simulated: false,
        error: `Build worker response exceeded the ${maxResponseBytes}-byte limit.`,
      }
    }
    if (controller.signal.aborted) {
      return {
        status: 'timeout',
        wasmBase64: null,
        logs: [],
        durationMs: Date.now() - started,
        workerOrigin: config.origin,
        simulated: false,
        error: `Build worker did not respond within ${timeoutMs}ms.`,
      }
    }
    return {
      status: 'failed',
      wasmBase64: null,
      logs: [],
      durationMs: Date.now() - started,
      workerOrigin: config.origin,
      simulated: false,
      error: redactSecrets(message),
    }
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', onExternalAbort)
  }
}

/**
 * Demo/offline mode: no real build worker is configured, so this returns a
 * clearly-labeled simulated result (`simulated: true`) instead of silently
 * pretending a real build ran. Used for local development and tests.
 */
export function simulateBuild(manifest: VerificationManifest, wasmBase64: string): BuildWorkerResult {
  return {
    status: 'succeeded',
    wasmBase64,
    logs: [
      `Simulated build for ${manifest.contractId} — no VITE_WASM_BUILD_WORKER_URL is configured.`,
      `Would run: ${manifest.buildCommand}`,
    ],
    durationMs: 1,
    workerOrigin: 'simulation',
    simulated: true,
    error: null,
  }
}

export function bytesToBase64Public(bytes: Uint8Array): string {
  return bytesToBase64(bytes)
}
