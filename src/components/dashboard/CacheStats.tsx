import React, { useEffect, useState } from 'react'
import Card from './Card'
import { useRateLimiter } from '../../hooks/useRateLimiter'
import {
  getCombinedCacheStats,
  pruneCaches,
  stellarCacheManager,
  realtimeCacheManager,
  sorobanCacheManager,
} from '../../lib/cacheManager'

const REFRESH_MS = 5_000

const ROW_STYLE: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1.5fr repeat(7, 1fr)',
  gap: '12px',
  padding: '10px 14px',
  fontSize: '12px',
  alignItems: 'center',
}

const HEADER_STYLE: React.CSSProperties = {
  ...ROW_STYLE,
  borderBottom: '1px solid var(--border)',
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  fontSize: '10px',
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function StatusPill({ online }: { online: boolean }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '2px 8px',
        borderRadius: '999px',
        fontSize: '11px',
        background: online ? 'var(--bg-card)' : 'rgba(245, 158, 11, 0.15)',
        color: online ? 'var(--text-primary)' : 'var(--warning, #f59e0b)',
        border: `1px solid ${online ? 'var(--border)' : 'rgba(245, 158, 11, 0.4)'}`,
      }}
    >
      <span
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: online ? 'var(--success, #22c55e)' : 'var(--warning, #f59e0b)',
        }}
      />
      {online ? 'online' : 'offline'}
    </span>
  )
}

interface CacheManagerSnapshot {
  namespace: string
  size: number
  maxSize: number
  hits: number
  misses: number
  hitRate: string
  writes: number
  evictions: number
  persist: boolean
  offline: boolean
}

interface CacheSnapshot {
  managers: CacheManagerSnapshot[]
  storage: { appState: number; apiCache: number; offlineQueue: number }
}

function Stat({ label, value, accent }: { label: string; value: string | number | null | undefined; accent?: boolean }) {
  return (
    <div>
      <div
        style={{
          fontSize: '10px',
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '1px',
          marginBottom: '6px',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '22px',
          fontWeight: 700,
          color: accent ? 'var(--cyan, #06b6d4)' : 'var(--text-primary)',
        }}
      >
        {value ?? '—'}
      </div>
    </div>
  )
}

export default function CacheStats() {
  const [snapshot, setSnapshot] = useState<CacheSnapshot>({ managers: [], storage: { appState: 0, apiCache: 0, offlineQueue: 0 } })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const { stats: rateLimiterStats } = useRateLimiter()

  const refresh = async () => {
    try {
      const next = await getCombinedCacheStats()
      setSnapshot(next)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, REFRESH_MS)
    return () => clearInterval(interval)
  }, [])

  const handleClear = async (which: string) => {
    setBusy(true)
    try {
      if (which === 'stellar') stellarCacheManager.clear()
      else if (which === 'realtime') realtimeCacheManager.clear()
      else if (which === 'soroban') sorobanCacheManager.clear()
      else {
        stellarCacheManager.clear()
        realtimeCacheManager.clear()
        sorobanCacheManager.clear()
      }
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const handlePrune = async () => {
    setBusy(true)
    try {
      await pruneCaches()
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const totalEntries = snapshot.managers.reduce((sum: number, m) => sum + m.size, 0)
  const totalHits = snapshot.managers.reduce((sum: number, m) => sum + m.hits, 0)
  const totalMisses = snapshot.managers.reduce((sum: number, m) => sum + m.misses, 0)
  const overallRate =
    totalHits + totalMisses === 0
      ? '0.0%'
      : `${((totalHits / (totalHits + totalMisses)) * 100).toFixed(1)}%`
  const offline = snapshot.managers.some((m) => m.offline)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <Card
        title="Cache overview"
        subtitle="Live in-memory + IndexedDB cache statistics"
        action={
          <div style={{ display: 'flex', gap: '8px' }}>
            <StatusPill online={!offline} />
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={handlePrune}
              style={{ fontSize: '12px' }}
            >
              Prune expired
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => handleClear('all')}
              style={{ fontSize: '12px' }}
            >
              Clear all
            </button>
          </div>
        }
      >
        <div style={{ padding: '14px 18px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
          <Stat label="Total entries" value={formatNumber(totalEntries)} />
          <Stat label="Total hits" value={formatNumber(totalHits)} />
          <Stat label="Total misses" value={formatNumber(totalMisses)} />
          <Stat label="Overall hit rate" value={overallRate} accent />
        </div>
      </Card>

      {rateLimiterStats && (
        <Card
          title="Rate limiter metrics"
          subtitle={`Queue depth and throttling (Mode: ${rateLimiterStats.throttleMode})`}
        >
          <div style={{ padding: '14px 18px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
            <Stat label="Queue length" value={formatNumber(rateLimiterStats.totalQueued)} />
            <Stat label="Queued requests" value={formatNumber(rateLimiterStats.queuedRequests)} />
            <Stat label="Dropped requests" value={formatNumber(rateLimiterStats.droppedRequests)} />
            <Stat label="Rejected requests" value={formatNumber(rateLimiterStats.rejectedRequests)} />
          </div>
          <div style={{ padding: '0 18px 14px 18px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
            <Stat label="High priority queue" value={formatNumber(rateLimiterStats.queueSizes.high)} />
            <Stat label="Medium priority queue" value={formatNumber(rateLimiterStats.queueSizes.medium)} />
            <Stat label="Low priority queue" value={formatNumber(rateLimiterStats.queueSizes.low)} />
          </div>
        </Card>
      )}

      <Card title="Per-namespace stats">
        <div style={HEADER_STYLE}>
          <div>Namespace</div>
          <div>Size</div>
          <div>Hits</div>
          <div>Misses</div>
          <div>Hit rate</div>
          <div>Writes</div>
          <div>Evictions</div>
          <div>Persist</div>
        </div>
        {loading ? (
          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
        ) : (
          snapshot.managers.map((m) => (
            <div key={m.namespace} style={{ ...ROW_STYLE, borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 600 }}>{m.namespace}</div>
              <div>
                {m.size}
                <span style={{ color: 'var(--text-muted)' }}> /{m.maxSize}</span>
              </div>
              <div>{formatNumber(m.hits)}</div>
              <div>{formatNumber(m.misses)}</div>
              <div>{m.hitRate}</div>
              <div>{formatNumber(m.writes)}</div>
              <div>{formatNumber(m.evictions)}</div>
              <div>
                {m.persist ? (
                  <span style={{ color: 'var(--cyan, #06b6d4)' }}>yes</span>
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>no</span>
                )}
              </div>
            </div>
          ))
        )}
      </Card>

      <Card
        title="IndexedDB storage"
        subtitle="Persistent records currently held in browser storage"
      >
        <div style={{ padding: '14px 18px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
          <Stat label="App state rows" value={snapshot.storage.appState} />
          <Stat label="API cache rows" value={snapshot.storage.apiCache} />
          <Stat label="Offline queue" value={snapshot.storage.offlineQueue} />
        </div>
      </Card>
    </div>
  )
}
