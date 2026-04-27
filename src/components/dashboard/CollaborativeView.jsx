/**
 * CollaborativeView (#112)
 *
 * Wraps dashboard content to show who else is currently viewing the same
 * dashboard and broadcasts shared tab/filter state via WebSocket.
 *
 * Usage:
 *   <CollaborativeView wsUrl={process.env.VITE_COLLAB_WS_URL}>
 *     <YourDashboardContent />
 *   </CollaborativeView>
 *
 * When VITE_COLLAB_WS_URL is unset the component renders children normally
 * (graceful degradation — no WebSocket connection is attempted).
 */

import { useEffect } from 'react'
import { useCollaboration } from '../../hooks/useCollaboration'
import { sessionColor } from '../../utils/collaboration'
import { useStore } from '../../lib/store'

const WS_URL = import.meta.env?.VITE_COLLAB_WS_URL ?? null

function PeerAvatar({ sessionId, address }) {
  const color = sessionColor(sessionId)
  const label = address
    ? `${address.slice(0, 4)}…${address.slice(-4)}`
    : sessionId.slice(0, 6)

  return (
    <div
      className="flex size-7 items-center justify-center rounded-full text-[0.55rem] font-bold text-white ring-2 ring-background"
      style={{ backgroundColor: color }}
      title={address ?? sessionId}
    >
      {label.slice(0, 2).toUpperCase()}
    </div>
  )
}

export function CollaborativeView({ children }) {
  const connectedAddress = useStore((s) => s.connectedAddress)
  const activeTab = useStore((s) => s.activeTab)
  const setActiveTab = useStore((s) => s.setActiveTab)

  const { connected, peers, sharedState, broadcastTab } = useCollaboration(
    WS_URL,
    connectedAddress,
  )

  // Broadcast our active tab when it changes
  useEffect(() => {
    if (connected && activeTab) broadcastTab(activeTab)
  }, [activeTab, connected, broadcastTab])

  // Apply incoming shared tab if peers navigate (optional — comment out to disable)
  useEffect(() => {
    if (sharedState.activeTab && sharedState.activeTab !== activeTab) {
      setActiveTab(sharedState.activeTab)
    }
  }, [sharedState.activeTab]) // eslint-disable-line react-hooks/exhaustive-deps

  const peerList = [...peers.values()]

  return (
    <div className="relative">
      {/* Collaboration presence bar — only shown when WS is configured */}
      {WS_URL && (
        <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
          <span
            className={`size-1.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-slate-400'}`}
          />
          <span>{connected ? 'Live' : 'Connecting…'}</span>

          {peerList.length > 0 && (
            <>
              <span className="mx-1 text-slate-600">·</span>
              <span>{peerList.length} viewer{peerList.length > 1 ? 's' : ''}</span>
              <div className="flex -space-x-1.5">
                {peerList.slice(0, 5).map((peer) => (
                  <PeerAvatar
                    key={peer.sessionId}
                    sessionId={peer.sessionId}
                    address={peer.address}
                  />
                ))}
                {peerList.length > 5 && (
                  <div className="flex size-7 items-center justify-center rounded-full bg-slate-700 text-[0.55rem] font-bold text-white ring-2 ring-background">
                    +{peerList.length - 5}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {children}
    </div>
  )
}

export default CollaborativeView
