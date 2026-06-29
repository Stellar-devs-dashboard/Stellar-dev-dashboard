/**
 * WebSocket client for real-time collaboration (#112).
 *
 * Provides an auto-reconnecting WebSocket wrapper with:
 *  - Exponential back-off reconnect
 *  - Message type routing (subscribe/publish)
 *  - Ping/pong keepalive
 *  - Listener cleanup
 */

const DEFAULT_RECONNECT_BASE_MS = 500
const DEFAULT_RECONNECT_MAX_MS  = 30_000
const PING_INTERVAL_MS          = 25_000

export interface CollaborationSocketOptions {
  reconnectBaseMs?: number
  reconnectMaxMs?: number
}

export type CollaborationEventHandler = (data: Record<string, unknown>) => void

export class CollaborationSocket {
  private _url: string
  private _options: CollaborationSocketOptions
  private _ws: WebSocket | null = null
  private _listeners = new Map<string, Set<CollaborationEventHandler>>()
  private _reconnectDelay: number
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private _pingTimer: ReturnType<typeof setInterval> | null = null
  private _intentionalClose = false
  private _sessionId: string

  constructor(url: string, options: CollaborationSocketOptions = {}) {
    this._url = url
    this._options = options
    this._reconnectDelay = options.reconnectBaseMs ?? DEFAULT_RECONNECT_BASE_MS
    this._sessionId = `session-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`
  }

  get sessionId() { return this._sessionId }
  get connected() { return this._ws?.readyState === WebSocket.OPEN }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  connect() {
    if (this._ws && this._ws.readyState < WebSocket.CLOSING) return

    this._intentionalClose = false

    try {
      this._ws = new WebSocket(this._url)
    } catch {
      this._scheduleReconnect()
      return
    }

    this._ws.onopen = () => {
      this._reconnectDelay = this._options.reconnectBaseMs ?? DEFAULT_RECONNECT_BASE_MS
      this._emit('connected', { sessionId: this._sessionId })
      this._startPing()
    }

    this._ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as Record<string, unknown>
        this._emit(String(msg.type ?? 'message'), msg)
      } catch {
        this._emit('message', { raw: event.data })
      }
    }

    this._ws.onclose = () => {
      this._stopPing()
      this._emit('disconnected', {})
      if (!this._intentionalClose) this._scheduleReconnect()
    }

    this._ws.onerror = (err) => {
      this._emit('error', { error: err })
    }
  }

  disconnect() {
    this._intentionalClose = true
    clearTimeout(this._reconnectTimer ?? undefined)
    this._stopPing()
    if (this._ws) {
      this._ws.close(1000, 'Client disconnect')
      this._ws = null
    }
  }

  // ── Messaging ───────────────────────────────────────────────────────────────

  send(type: string, payload: Record<string, unknown> = {}) {
    if (!this.connected || !this._ws) {
      console.warn('[CollaborationSocket] Cannot send — not connected')
      return false
    }
    this._ws.send(JSON.stringify({ type, payload, sessionId: this._sessionId, ts: Date.now() }))
    return true
  }

  // ── Pub/sub ─────────────────────────────────────────────────────────────────

  on(eventType: string, handler: CollaborationEventHandler) {
    if (!this._listeners.has(eventType)) this._listeners.set(eventType, new Set())
    this._listeners.get(eventType)!.add(handler)
    return () => this.off(eventType, handler)
  }

  off(eventType: string, handler: CollaborationEventHandler) {
    this._listeners.get(eventType)?.delete(handler)
  }

  private _emit(eventType: string, data: Record<string, unknown>) {
    this._listeners.get(eventType)?.forEach((h) => {
      try { h(data) } catch { /* ignore handler errors */ }
    })
  }

  // ── Reconnect ───────────────────────────────────────────────────────────────

  private _scheduleReconnect() {
    clearTimeout(this._reconnectTimer ?? undefined)
    this._reconnectTimer = setTimeout(() => {
      this._emit('reconnecting', { delay: this._reconnectDelay })
      this.connect()
    }, this._reconnectDelay)

    const maxDelay = this._options.reconnectMaxMs ?? DEFAULT_RECONNECT_MAX_MS
    this._reconnectDelay = Math.min(this._reconnectDelay * 2, maxDelay)
  }

  // ── Keepalive ───────────────────────────────────────────────────────────────

  private _startPing() {
    this._stopPing()
    this._pingTimer = setInterval(() => {
      if (this.connected) this.send('ping', {})
    }, PING_INTERVAL_MS)
  }

  private _stopPing() {
    if (this._pingTimer !== null) {
      clearInterval(this._pingTimer)
      this._pingTimer = null
    }
  }
}

// ─── Singleton factory ────────────────────────────────────────────────────────

let _socket: CollaborationSocket | null = null
let _socketRefCount = 0

export function getCollaborationSocket(url?: string) {
  if (!_socket && url) {
    _socket = new CollaborationSocket(url)
    _socket.connect()
  }
  return _socket
}

export function destroyCollaborationSocket() {
  if (_socket) {
    _socket.disconnect()
    _socket = null
    _socketRefCount = 0
  }
}

// ─── React hook ──────────────────────────────────────────────────────────────
// Import useEffect lazily to keep this file usable in non-React contexts.
// Components should use this hook rather than calling getCollaborationSocket
// directly so the singleton is destroyed when the last consumer unmounts.

/**
 * Returns the shared CollaborationSocket for `url`, keeping it alive for the
 * lifetime of the calling component.  The socket is destroyed only when the
 * last mounted consumer unmounts.
 */
export function useCollaborationSocket(url: string): CollaborationSocket | null {
  // Dynamic import of useEffect so this module stays importable outside React.
  // In practice all callers are components, so the import is always available.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { useEffect } = require('react') as typeof import('react')

  useEffect(() => {
    _socketRefCount++
    if (!_socket) {
      _socket = new CollaborationSocket(url)
      _socket.connect()
    }

    return () => {
      _socketRefCount--
      if (_socketRefCount <= 0) {
        destroyCollaborationSocket()
      }
    }
  // url changes intentionally restart the socket
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url])

  return _socket
}
