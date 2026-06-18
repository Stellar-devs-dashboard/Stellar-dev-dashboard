import { getServer, type NetworkName } from './stellar'

// ── Constants ──────────────────────────────────────────────────────────────────

const RECONNECT_BASE_DELAY_MS = 1_000
const RECONNECT_MAX_DELAY_MS = 30_000
const MAX_RECONNECT_ATTEMPTS = 10

export type StreamStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error'

type LedgerCallback = (ledger: Record<string, unknown>) => void
type StatusCallback = (status: StreamStatus) => void

// ── StreamManager ──────────────────────────────────────────────────────────────

/**
 * Manages a single Horizon SSE ledger stream with automatic reconnection and
 * a pub-sub interface so multiple consumers can attach without creating
 * multiple network connections.
 *
 * Status transitions:
 *   disconnected → connecting → connected
 *   connected    → error      → reconnecting → connecting → …
 *   any          → disconnected  (on explicit .disconnect())
 */
class StreamManager {
  private _closeStream: (() => void) | null = null
  private _status: StreamStatus = 'disconnected'
  private _reconnectAttempts = 0
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private _network: NetworkName | null = null
  private _ledgerSubscribers = new Set<LedgerCallback>()
  private _statusSubscribers = new Set<StatusCallback>()

  subscribe(callback: LedgerCallback) {
    this._ledgerSubscribers.add(callback)
    return () => this._ledgerSubscribers.delete(callback)
  }

  onStatusChange(callback: StatusCallback) {
    this._statusSubscribers.add(callback)
    return () => this._statusSubscribers.delete(callback)
  }

  getStatus(): StreamStatus {
    return this._status
  }

  connect(network: NetworkName = 'testnet') {
    if (this._network !== network && this._closeStream) {
      this.disconnect()
    }
    this._network = network
    this._reconnectAttempts = 0
    this._openStream()
  }

  disconnect() {
    this._cancelReconnect()
    this._closeActiveStream()
    this._setStatus('disconnected')
    this._reconnectAttempts = 0
  }

  private _setStatus(status: StreamStatus) {
    if (this._status === status) return
    this._status = status
    for (const cb of this._statusSubscribers) {
      try { cb(status) } catch { /* ignore subscriber errors */ }
    }
  }

  private _emit(ledger: Record<string, unknown>) {
    for (const cb of this._ledgerSubscribers) {
      try { cb(ledger) } catch { /* ignore subscriber errors */ }
    }
  }

  private _openStream() {
    this._setStatus('connecting')
    try {
      const network = this._network ?? 'testnet'
      const server = getServer(network)
      this._closeStream = server
        .ledgers()
        .cursor('now')
        .stream({
          onmessage: (ledger) => {
            this._reconnectAttempts = 0
            this._setStatus('connected')
            this._emit(ledger as unknown as Record<string, unknown>)
          },
          onerror: (error) => {
            console.error('[StreamManager] SSE error:', error)
            this._setStatus('error')
            this._scheduleReconnect()
          },
        })
    } catch (err) {
      console.error('[StreamManager] Failed to open stream:', err)
      this._setStatus('error')
      this._scheduleReconnect()
    }
  }

  private _closeActiveStream() {
    if (this._closeStream) {
      try { this._closeStream() } catch { /* ignore */ }
      this._closeStream = null
    }
  }

  private _cancelReconnect() {
    if (this._reconnectTimer !== null) {
      clearTimeout(this._reconnectTimer)
      this._reconnectTimer = null
    }
  }

  private _scheduleReconnect() {
    if (this._reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.warn('[StreamManager] Max reconnect attempts reached')
      this._setStatus('error')
      return
    }

    this._cancelReconnect()
    this._closeActiveStream()

    const delay = Math.min(
      RECONNECT_BASE_DELAY_MS * 2 ** this._reconnectAttempts,
      RECONNECT_MAX_DELAY_MS,
    )
    this._reconnectAttempts++
    this._setStatus('reconnecting')

    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null
      if (this._status !== 'disconnected') {
        this._openStream()
      }
    }, delay)
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────────

export const ledgerStreamManager = new StreamManager()

export function connectLedgerStream(
  network: NetworkName,
  onLedger: LedgerCallback,
  onStatus: StatusCallback,
) {
  const unsubLedger = ledgerStreamManager.subscribe(onLedger)
  const unsubStatus = ledgerStreamManager.onStatusChange(onStatus)

  ledgerStreamManager.connect(network)

  return () => {
    unsubLedger()
    unsubStatus()
    ledgerStreamManager.disconnect()
  }
}
