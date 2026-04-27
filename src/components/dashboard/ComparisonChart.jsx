import React, { useMemo } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar
} from 'recharts'
import { CHART_COLORS, TOOLTIP_STYLE, AXIS_TICK_STYLE, formatCompactNumber } from '../../lib/chartUtils'
import { formatXLM } from '../../lib/stellar'
import { shortAddress } from '../../lib/stellar'

const SLOT_COLORS = [
  CHART_COLORS.cyan,
  CHART_COLORS.amber,
  CHART_COLORS.green,
  CHART_COLORS.red,
  '#b388ff' // Extra color for slot 5
]

export default function ComparisonChart({ comparisonSlots }) {
  // Filter out slots that don't have data yet
  const activeSlots = comparisonSlots.filter(s => s.data && !s.error && s.key)

  // 1. Bar Chart Data (XLM Balance)
  const balanceData = useMemo(() => {
    if (activeSlots.length === 0) return []
    const entry = { name: 'XLM Balance' }
    activeSlots.forEach((slot, i) => {
      const balStr = slot.data.balances.find(b => b.asset_type === 'native')?.balance || '0'
      entry[`slot_${i}`] = parseFloat(balStr)
    })
    return [entry]
  }, [activeSlots])

  // 2. Bar Chart Data (Assets, Subentries)
  const activityData = useMemo(() => {
    if (activeSlots.length === 0) return []
    const assetsEntry = { name: 'Assets' }
    const subentriesEntry = { name: 'Subentries' }
    
    activeSlots.forEach((slot, i) => {
      const otherAssets = slot.data.balances.filter(b => b.asset_type !== 'native')
      assetsEntry[`slot_${i}`] = otherAssets.length
      subentriesEntry[`slot_${i}`] = slot.data.subentry_count
    })
    
    return [assetsEntry, subentriesEntry]
  }, [activeSlots])

  // 3. Radar Chart Data (Normalized Score 0-100)
  const radarData = useMemo(() => {
    if (activeSlots.length < 2) return []

    // Helper to get max value of a metric across slots
    const getMax = (extractFn) => Math.max(...activeSlots.map(s => extractFn(s)), 1)
    
    const maxBal = getMax(s => parseFloat(s.data.balances.find(b => b.asset_type === 'native')?.balance || '0'))
    const maxAssets = getMax(s => s.data.balances.filter(b => b.asset_type !== 'native').length)
    const maxSubentries = getMax(s => s.data.subentry_count)
    const maxSeq = getMax(s => parseFloat(s.data.sequence || '0'))
    const maxSigners = getMax(s => s.data.signers?.length || 1)

    return [
      { metric: 'Balance', ...Object.fromEntries(activeSlots.map((s, i) => [`slot_${i}`, (parseFloat(s.data.balances.find(b => b.asset_type === 'native')?.balance || '0') / maxBal) * 100])) },
      { metric: 'Assets', ...Object.fromEntries(activeSlots.map((s, i) => [`slot_${i}`, (s.data.balances.filter(b => b.asset_type !== 'native').length / maxAssets) * 100])) },
      { metric: 'Subentries', ...Object.fromEntries(activeSlots.map((s, i) => [`slot_${i}`, (s.data.subentry_count / maxSubentries) * 100])) },
      { metric: 'Signers', ...Object.fromEntries(activeSlots.map((s, i) => [`slot_${i}`, ((s.data.signers?.length || 1) / maxSigners) * 100])) },
    ]
  }, [activeSlots])

  if (activeSlots.length === 0) {
    return (
      <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
        Add at least one account to view charts
      </div>
    )
  }

  // Custom tooltips
  const CustomBalanceTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      return (
        <div style={TOOLTIP_STYLE} className="p-3">
          <div style={{ color: 'var(--text-muted)', fontSize: '11px', marginBottom: '8px' }}>XLM BALANCE</div>
          {payload.map((entry, idx) => (
            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', gap: '20px', marginBottom: '4px' }}>
              <span style={{ color: entry.color, fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                {shortAddress(activeSlots[idx].key, 4)}:
              </span>
              <span style={{ fontWeight: 600, fontSize: '13px' }}>{formatXLM(entry.value.toString())} XLM</span>
            </div>
          ))}
        </div>
      )
    }
    return null
  }

  const CustomRadarTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div style={TOOLTIP_STYLE} className="p-3">
          <div style={{ color: 'var(--text-muted)', fontSize: '11px', marginBottom: '8px', textTransform: 'uppercase' }}>{label} Strength</div>
          {payload.map((entry, idx) => (
            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', gap: '20px', marginBottom: '4px' }}>
              <span style={{ color: entry.color, fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                {shortAddress(activeSlots[idx].key, 4)}:
              </span>
              <span style={{ fontWeight: 600, fontSize: '13px' }}>{Math.round(entry.value)}%</span>
            </div>
          ))}
        </div>
      )
    }
    return null
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', animation: 'var(--fade-in)' }}>
      {/* 1. Bar Chart: Balances */}
      <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-lg)', padding: '20px', border: '1px solid var(--border)' }}>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '16px' }}>
          Balance Comparison
        </div>
        <div style={{ height: '220px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={balanceData} margin={{ top: 5, right: 0, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="name" tick={AXIS_TICK_STYLE} axisLine={false} tickLine={false} />
              <YAxis tick={AXIS_TICK_STYLE} tickFormatter={formatCompactNumber} axisLine={false} tickLine={false} />
              <RechartsTooltip content={<CustomBalanceTooltip />} cursor={{ fill: 'rgba(255,255,255,0.02)' }} />
              <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} 
                formatter={(value, entry, index) => <span style={{ fontFamily: 'var(--font-mono)' }}>{shortAddress(activeSlots[index]?.key || '', 4)}</span>} />
              {activeSlots.map((slot, i) => (
                <Bar key={slot.key} dataKey={`slot_${i}`} name={`slot_${i}`} fill={SLOT_COLORS[i % SLOT_COLORS.length]} radius={[4, 4, 0, 0]} maxBarSize={40} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 2. Radar Chart: Relative Metrics (only if 2+ slots) */}
      <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-lg)', padding: '20px', border: '1px solid var(--border)' }}>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '16px' }}>
          Relative Strength (Normalized)
        </div>
        <div style={{ height: '220px' }}>
          {activeSlots.length >= 2 ? (
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarData}>
                <PolarGrid stroke="var(--border)" />
                <PolarAngleAxis dataKey="metric" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                <RechartsTooltip content={<CustomRadarTooltip />} />
                <Legend wrapperStyle={{ fontSize: '11px' }} 
                  formatter={(value, entry, index) => <span style={{ fontFamily: 'var(--font-mono)' }}>{shortAddress(activeSlots[index]?.key || '', 4)}</span>} />
                {activeSlots.map((slot, i) => (
                  <Radar key={slot.key} name={`slot_${i}`} dataKey={`slot_${i}`} stroke={SLOT_COLORS[i % SLOT_COLORS.length]} fill={SLOT_COLORS[i % SLOT_COLORS.length]} fillOpacity={0.3} />
                ))}
              </RadarChart>
            </ResponsiveContainer>
          ) : (
             <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
               Add at least 2 accounts to see radar chart
             </div>
          )}
        </div>
      </div>

      {/* 3. Bar Chart: Other Metrics */}
      <div style={{ gridColumn: '1 / -1', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-lg)', padding: '20px', border: '1px solid var(--border)' }}>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '16px' }}>
          Activity & Assets
        </div>
        <div style={{ height: '220px' }}>
          <ResponsiveContainer width="100%" height="100%">
             <BarChart data={activityData} margin={{ top: 5, right: 0, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="name" tick={AXIS_TICK_STYLE} axisLine={false} tickLine={false} />
              <YAxis tick={AXIS_TICK_STYLE} axisLine={false} tickLine={false} />
              <RechartsTooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(255,255,255,0.02)' }} />
              <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} 
                formatter={(value, entry, index) => <span style={{ fontFamily: 'var(--font-mono)' }}>{shortAddress(activeSlots[index]?.key || '', 4)}</span>} />
              {activeSlots.map((slot, i) => (
                <Bar key={slot.key} dataKey={`slot_${i}`} fill={SLOT_COLORS[i % SLOT_COLORS.length]} radius={[4, 4, 0, 0]} maxBarSize={40} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
