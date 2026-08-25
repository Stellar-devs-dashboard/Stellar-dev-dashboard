import { useId, useMemo, useState, type CSSProperties } from 'react'
import type { EquityPoint } from '../../types/trading'

export interface EquityCurveChartProps {
  points: EquityPoint[]
  height?: number
}

const WIDTH = 720

export default function EquityCurveChart({ points, height = 220 }: EquityCurveChartProps) {
  const gradientId = useId()
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const [showTable, setShowTable] = useState(false)

  const { path, areaPath, coords, minEquity, maxEquity } = useMemo(() => {
    if (!points.length) return { path: '', areaPath: '', coords: [] as { x: number; y: number }[], minEquity: 0, maxEquity: 0 }
    const values = points.map((p) => p.equity)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const range = Math.max(1e-9, max - min)
    const padding = 10
    const plotHeight = height - padding * 2
    const coordinates = points.map((point, index) => {
      const x = (index / Math.max(1, points.length - 1)) * WIDTH
      const y = padding + plotHeight - ((point.equity - min) / range) * plotHeight
      return { x, y }
    })
    const linePath = coordinates.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(2)},${c.y.toFixed(2)}`).join(' ')
    const area = `${linePath} L${coordinates[coordinates.length - 1].x.toFixed(2)},${height} L0,${height} Z`
    return { path: linePath, areaPath: area, coords: coordinates, minEquity: min, maxEquity: max }
  }, [points, height])

  if (!points.length) {
    return <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>No equity curve data yet.</div>
  }

  const hovered = hoverIndex !== null ? points[hoverIndex] : null
  const hoveredCoord = hoverIndex !== null ? coords[hoverIndex] : null

  const handleMove = (event: React.MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1)
    const index = Math.round(ratio * (points.length - 1))
    setHoverIndex(index)
  }

  const first = points[0]
  const last = points[points.length - 1]
  const totalReturnPct = first.equity !== 0 ? ((last.equity - first.equity) / first.equity) * 100 : 0
  const lineColor = totalReturnPct >= 0 ? 'var(--green)' : 'var(--red)'

  const wrapStyle: CSSProperties = { display: 'grid', gap: 8 }

  return (
    <div style={wrapStyle}>
      <svg
        role="img"
        aria-label={`Equity curve from ${first.date} to ${last.date}: starting ${first.equity.toFixed(2)}, ending ${last.equity.toFixed(2)}, total return ${totalReturnPct.toFixed(2)} percent, max drawdown ${Math.max(...points.map((p) => p.drawdownPct)).toFixed(2)} percent.`}
        viewBox={`0 0 ${WIDTH} ${height}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height, display: 'block', cursor: 'crosshair' }}
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIndex(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity={0.22} />
            <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((fraction) => (
          <line
            key={fraction}
            x1={0}
            x2={WIDTH}
            y1={height * fraction}
            y2={height * fraction}
            stroke="var(--border)"
            strokeWidth={1}
            opacity={0.5}
          />
        ))}
        <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
        <path d={path} fill="none" stroke={lineColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {hoveredCoord && (
          <>
            <line x1={hoveredCoord.x} x2={hoveredCoord.x} y1={0} y2={height} stroke="var(--text-muted)" strokeWidth={1} strokeDasharray="3,3" />
            <circle cx={hoveredCoord.x} cy={hoveredCoord.y} r={4} fill={lineColor} stroke="var(--bg-card)" strokeWidth={2} />
          </>
        )}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)' }}>
        <span>{first.date} · {minEquity.toFixed(0)} min</span>
        {hovered ? (
          <span role="status" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
            {hovered.date} · equity {hovered.equity.toFixed(2)} · drawdown {hovered.drawdownPct.toFixed(2)}%
          </span>
        ) : (
          <span>Hover the chart for daily detail</span>
        )}
        <span>{last.date} · {maxEquity.toFixed(0)} max</span>
      </div>
      <button
        type="button"
        onClick={() => setShowTable((prev) => !prev)}
        aria-expanded={showTable}
        style={{
          justifySelf: 'start',
          fontSize: 10,
          padding: '4px 8px',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--bg-elevated)',
          color: 'var(--text-secondary)',
          cursor: 'pointer',
        }}
      >
        {showTable ? 'Hide data table' : 'Show data table'}
      </button>
      {showTable && (
        <div style={{ maxHeight: 220, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ position: 'sticky', top: 0, background: 'var(--bg-elevated)' }}>
                <th style={cellStyle}>Day</th>
                <th style={cellStyle}>Date</th>
                <th style={cellStyle}>Equity</th>
                <th style={cellStyle}>Drawdown %</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.day}>
                  <td style={cellStyle}>{point.day}</td>
                  <td style={cellStyle}>{point.date}</td>
                  <td style={cellStyle}>{point.equity.toFixed(2)}</td>
                  <td style={cellStyle}>{point.drawdownPct.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

const cellStyle: CSSProperties = { padding: '4px 8px', textAlign: 'left', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }
