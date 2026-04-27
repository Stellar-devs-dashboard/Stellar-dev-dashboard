import { useState, useEffect, useCallback, useRef } from 'react'
import { getCollaborationSocket } from '../lib/websocket'
import {
  createPresenceRecord,
  mergePresence,
  pruneStalePresence,
  buildCursorPayload,
  mergeSharedViewState,
} from '../utils/collaboration'

/**
 * useCollaboration (#112)
 *
 * Connects to the collaboration WebSocket and exposes:
 *  - `peers`        — Map of sessionId → PresenceRecord for other connected users
 *  - `connected`    — whether the socket is currently open
 *  - `broadcastTab` — share the active tab with other collaborators
 *  - `broadcastCursor` — share pointer position (normalised 0–1)
 *  - `sharedState`  — merged view state from all peers
 *
 * @param {string | null} wsUrl            WebSocket endpoint URL
 * @param {string | null} connectedAddress Current user's Stellar address
 */
export function useCollaboration(wsUrl, connectedAddress) {
  const [connected, setConnected]   = useState(false)
  const [peers, setPeers]           = useState(new Map())
  const [sharedState, setSharedState] = useState({})
  const socketRef = useRef(null)

  useEffect(() => {
    if (!wsUrl) return

    const socket = getCollaborationSocket(wsUrl)
    socketRef.current = socket

    const unsubConnected = socket.on('connected', ({ sessionId }) => {
      setConnected(true)
      // Announce our presence
      socket.send('presence:join', createPresenceRecord(sessionId, connectedAddress))
    })

    const unsubDisconnected = socket.on('disconnected', () => setConnected(false))

    const unsubPresenceJoin = socket.on('presence:join', (msg) => {
      setPeers((prev) => mergePresence(prev, msg.payload))
    })

    const unsubPresenceLeave = socket.on('presence:leave', (msg) => {
      setPeers((prev) => {
        const next = new Map(prev)
        next.delete(msg.payload?.sessionId)
        return next
      })
    })

    const unsubHeartbeat = socket.on('presence:heartbeat', (msg) => {
      setPeers((prev) => mergePresence(prev, { ...msg.payload, lastSeen: Date.now() }))
    })

    const unsubViewState = socket.on('view:state', (msg) => {
      setSharedState((prev) => mergeSharedViewState(prev, msg.payload ?? {}))
    })

    // Prune stale peers every 15 seconds
    const pruneInterval = setInterval(() => {
      setPeers((prev) => pruneStalePresence(prev, 30_000))
    }, 15_000)

    // Send heartbeat every 10 seconds
    const heartbeatInterval = setInterval(() => {
      if (socket.connected) {
        socket.send('presence:heartbeat', {
          sessionId: socket.sessionId,
          address: connectedAddress ?? null,
          lastSeen: Date.now(),
        })
      }
    }, 10_000)

    return () => {
      unsubConnected()
      unsubDisconnected()
      unsubPresenceJoin()
      unsubPresenceLeave()
      unsubHeartbeat()
      unsubViewState()
      clearInterval(pruneInterval)
      clearInterval(heartbeatInterval)
    }
  }, [wsUrl, connectedAddress])

  const broadcastTab = useCallback((tab) => {
    socketRef.current?.send('view:state', { activeTab: tab })
  }, [])

  const broadcastCursor = useCallback((x, y) => {
    socketRef.current?.send('cursor:move', buildCursorPayload(x, y))
  }, [])

  return { connected, peers, sharedState, broadcastTab, broadcastCursor }
}
