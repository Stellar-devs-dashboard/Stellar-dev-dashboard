import React, { useEffect, useState, useMemo } from 'react'
import { useStore } from '../../lib/store'
import { fetchNetworkStats, getServer, streamLedgers } from '../../lib/stellar'
import { fetchValidatorStatus, fetchNetworkCongestion, fetchFeePredictions, fetchPerformanceMetrics } from '../../lib/networkMonitoring'
import { format } from 'date-fns'
import { StatCard } from './Card'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'

export default function Network() {
  const { network, networkStats, setNetworkStats, statsLoading, setStatsLoading } = useStore()
  const [recentLedgers, setRecentLedgers] = useState([])
  const [ledgersLoading, setLedgersLoading] = useState(false)
  const [monitoringLoading, setMonitoringLoading] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [validatorStatus, setValidatorStatus] = useState(null)
  const [congestion, setCongestion] = useState(null)
  const [feePrediction, setFeePrediction] = useState(null)
  const [performance, setPerformance] = useState(null)

  // Calculate ledger close intervals for chart
  const chartData = useMemo(() => {
    if (recentLedgers.length < 2) return []

    // Sort ledgers by sequence (ascending for chart)
    const sortedLedgers = [...recentLedgers].sort((a, b) => a.sequence - b.sequence)

    const data = []
    for (let i = 1; i < sortedLedgers.length; i++) {
      const current = sortedLedgers[i]
      const previous = sortedLedgers[i - 1]

      const currentTime = new Date(current.closed_at).getTime()
      const previousTime = new Date(previous.closed_at).getTime()
      const interval = (currentTime - previousTime) / 1000 // Convert to seconds

      data.push({
        sequence: current.sequence,
        interval: interval,
        formattedSequence: current.sequence.toLocaleString()
      })
    }

    return data
  }, [recentLedgers])

  // Calculate average close time for reference line
  const averageCloseTime = useMemo(() => {
    if (chartData.length === 0) return 0
    const sum = chartData.reduce((acc, item) => acc + item.interval, 0)
    return sum / chartData.length
  }, [chartData])

  useEffect(() => {
    setStatsLoading(true)
    setLedgersLoading(true)
    setMonitoringLoading(true)

    // Initial fetch
    fetchNetworkStats(network)
      .then((s) => setNetworkStats(s))
      .catch(() => { })
      .finally(() => setStatsLoading(false))

    getServer(network).ledgers().order('desc').limit(20).call()
      .then((r) => setRecentLedgers(r.records))
      .catch(() => { })
      .finally(() => setLedgersLoading(false))

    Promise.all([
      fetchValidatorStatus(network),
      fetchNetworkCongestion(network),
      fetchFeePredictions(network),
      fetchPerformanceMetrics(network),
    ])
      .then(([validator, congestionData, feePredictionData, performanceData]) => {
        setValidatorStatus(validator)
        setCongestion(congestionData)
        setFeePrediction(feePredictionData)
        setPerformance(performanceData)
      })
      .catch(() => { })
      .finally(() => setMonitoringLoading(false))

    // Set up streaming
    let closeStream = null
    try {
      closeStream = streamLedgers((newLedger) => {
        setIsStreaming(true)
        setRecentLedgers((prev) => {
          if (prev.some((l) => l.sequence === newLedger.sequence)) return prev
          return [newLedger, ...prev.slice(0, 19)]
        })

        // Update latest ledger immediately for instant UI feedback
        setNetworkStats((prev) => ({
          ...prev,
          latestLedger: newLedger,
        }))

        // Refresh full stats to ensure fee stats and other data stay current
        fetchNetworkStats(network)
          .then((s) => setNetworkStats(s))
          .catch(() => { })
      }, network)
    } catch (e) {
      console.error('Streaming failed:', e)
      setIsStreaming(false)
    }

    return () => {
      if (closeStream) closeStream()
      setIsStreaming(false)
    }
  }, [network, setNetworkStats, setStatsLoading])

  const ledger = networkStats?.latestLedger
  const fee = networkStats?.feeStats

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 700 }}>Network</div>
        {isStreaming && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 10px',
            borderRadius: '20px',
            background: 'rgba(0, 230, 118, 0.1)',
            border: '1px solid rgba(0, 230, 118, 0.2)',
            fontSize: '11px',
            fontWeight: 600,
            color: 'var(--green)',
            textTransform: 'uppercase',
            letterSpacing: '1px'
          }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 8px var(--green)' }} className="pulse" />
            Live
          </div>
        )}
      </div>

      {/* Key stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
        <StatCard label="Latest Ledger" value={ledger?.sequence?.toLocaleString()} loading={statsLoading} accent="var(--cyan)" />
        <StatCard label="Base Fee" value={fee ? fee.last_ledger_base_fee + ' stroops' : '—'} loading={statsLoading} />
        <StatCard
          label="Closed At"
          value={ledger ? format(new Date(ledger.closed_at), 'HH:mm:ss') : '—'}
          sub={ledger ? format(new Date(ledger.closed_at), 'MMM d, yyyy') : ''}
          loading={statsLoading}
        />
        <StatCard label="Tx Count" value={ledger?.successful_transaction_count?.toLocaleString()} sub="successful in last ledger" loading={statsLoading} accent="var(--green)" />
        <StatCard label="Failed Tx" value={ledger?.failed_transaction_count?.toLocaleString()} sub="failed in last ledger" loading={statsLoading} accent="var(--red)" />
        <StatCard label="Op Count" value={ledger?.operation_count?.toLocaleString()} sub="in last ledger" loading={statsLoading} accent="var(--amber)" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
        <StatCard
          label="Validator Status"
          value={validatorStatus?.healthy ? 'Healthy' : 'Degraded'}
          sub={validatorStatus?.message}
          loading={monitoringLoading}
          accent={validatorStatus?.healthy ? 'var(--green)' : 'var(--red)'}
        />
        <StatCard
          label="Congestion"
          value={congestion?.level || '—'}
          sub={congestion?.range ? `${Math.round((congestion.load || 0) * 100)}% load · ${congestion.range} ops` : '—'}
          loading={monitoringLoading}
          accent={congestion?.level === 'High' ? 'var(--red)' : congestion?.level === 'Moderate' ? 'var(--amber)' : 'var(--green)'}
        />
        <StatCard
          label="Fee Prediction"
          value={feePrediction?.medium ? `${feePrediction.medium} stroops` : '—'}
          sub={feePrediction?.high ? `Low ${feePrediction.low} · High ${feePrediction.high}` : '—'}
          loading={monitoringLoading}
          accent="var(--cyan)"
        />
        <StatCard
          label="Performance"
          value={performance?.txPerSecond ? `${performance.txPerSecond.toFixed(2)} tx/s` : '—'}
          sub={performance?.opsPerSecond ? `${performance.opsPerSecond.toFixed(2)} ops/s` : '—'}
          loading={monitoringLoading}
          accent="var(--text-secondary)"
        />
      </div>

      {/* Fee Stats */}
      {fee && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '13px' }}>Fee Statistics</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1px', background: 'var(--border)' }}>
            {[
              ['Min Fee', fee.min_accepted_fee],
              ['Mode Fee', fee.mode_accepted_fee],
              ['Median Fee', fee.median_accepted_fee],
              ['Max Fee', fee.max_accepted_fee],
              ['P10', fee.p10_accepted_fee],
              ['P90', fee.p90_accepted_fee],
            ].map(([label, val]) => (
              <div key={label} style={{ background: 'var(--bg-card)', padding: '14px 18px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', letterSpacing: '0.8px', marginBottom: '6px' }}>{label}</div>
                <div style={{ fontSize: '16px', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                  {val} <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>stroops</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ledger Close Time Chart */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '13px' }}>
          Ledger Close Times
          <span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--text-muted)', marginLeft: '8px' }}>
            (Last {chartData.length} ledgers)
          </span>
        </div>
        {ledgersLoading ? (
          <div style={{ padding: '32px', display: 'flex', justifyContent: 'center' }}><div className="spinner" /></div>
        ) : chartData.length > 0 ? (
          <div style={{ padding: '18px', height: '280px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="sequence"
                  tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                  tickFormatter={(value) => value.toLocaleString()}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                  label={{ value: 'Seconds', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fontSize: '11px', fill: 'var(--text-muted)' } }}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    fontSize: '12px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                  }}
                  formatter={(value) => [`${value.toFixed(2)}s`, 'Close Time']}
                  labelFormatter={(label) => `Ledger ${label.toLocaleString()}`}
                />
                <ReferenceLine
                  y={averageCloseTime}
                  stroke="var(--amber)"
                  strokeDasharray="5 5"
                  label={{ value: `Avg: ${averageCloseTime.toFixed(2)}s`, position: 'topRight', fontSize: 11, fill: 'var(--amber)' }}
                />
                <Line
                  type="monotone"
                  dataKey="interval"
                  stroke="var(--cyan)"
                  strokeWidth={2}
                  dot={{ fill: 'var(--cyan)', strokeWidth: 2, r: 3 }}
                  activeDot={{ r: 5, stroke: 'var(--cyan)', strokeWidth: 2, fill: 'var(--bg-card)' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
            No data available
          </div>
        )}
      </div>

      {/* Recent Ledgers */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '13px' }}>Recent Ledgers</div>
        {ledgersLoading ? (
          <div style={{ padding: '32px', display: 'flex', justifyContent: 'center' }}><div className="spinner" /></div>
        ) : (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', padding: '8px 18px', fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', borderBottom: '1px solid var(--border)' }}>
              <span>Sequence</span><span>Tx</span><span>Ops</span><span>Closed</span>
            </div>
            {recentLedgers.slice(0, 10).map((l, i) => (
              <div key={l.id} style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr 1fr',
                padding: '10px 18px',
                fontSize: '12px',
                borderBottom: i < 9 ? '1px solid var(--border)' : 'none',
                transition: 'var(--transition)',
              }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <span style={{ color: 'var(--cyan)', fontFamily: 'var(--font-mono)' }}>{l.sequence.toLocaleString()}</span>
                <span style={{ color: 'var(--text-secondary)' }}>{l.successful_transaction_count}</span>
                <span style={{ color: 'var(--text-secondary)' }}>{l.operation_count}</span>
                <span style={{ color: 'var(--text-muted)' }}>{format(new Date(l.closed_at), 'HH:mm:ss')}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
