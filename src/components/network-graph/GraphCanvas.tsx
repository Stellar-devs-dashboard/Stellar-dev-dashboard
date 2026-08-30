import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { Community, GraphEdge, GraphNode } from '../../types/networkGraph'

export interface GraphCanvasProps {
  nodes: GraphNode[]
  edges: GraphEdge[]
  communities: Community[]
  highlightNodeIds?: string[]
  pathNodeIds?: string[]
  selectedNodeId?: string | null
  onSelectNode?: (_nodeId: string) => void
  height?: number
}

interface Position {
  x: number
  y: number
}

const PALETTE = ['#38bdf8', '#a78bfa', '#34d399', '#fbbf24', '#f87171', '#22d3ee', '#c084fc', '#4ade80', '#fb923c', '#f472b6']

/**
 * Deterministic radial-cluster layout: communities are arranged around a
 * macro circle, and each community's members are arranged around their own
 * centroid. This is O(n) and stays responsive at thousands of nodes because
 * — unlike a force simulation — it never iterates pairwise repulsion; the
 * tradeoff (documented in docs/network-graph-analysis.md) is a less organic
 * layout than physics-based alternatives.
 */
function computeLayout(nodes: GraphNode[], communities: Community[]): Map<string, Position> {
  const positions = new Map<string, Position>()
  if (!nodes.length) return positions

  const grouped = new Map<string, string[]>()
  const assigned = new Set<string>()
  communities.forEach((community) => {
    grouped.set(community.id, community.memberIds)
    community.memberIds.forEach((id) => assigned.add(id))
  })
  const unassigned = nodes.map((n) => n.id).filter((id) => !assigned.has(id))
  if (unassigned.length) grouped.set('__unassigned__', unassigned)

  const groupEntries = Array.from(grouped.entries())
  const macroRadius = 340
  const center = { x: 420, y: 340 }

  groupEntries.forEach(([, memberIds], groupIndex) => {
    const angle = (groupIndex / Math.max(1, groupEntries.length)) * Math.PI * 2
    const centroid = {
      x: center.x + Math.cos(angle) * (groupEntries.length > 1 ? macroRadius : 0),
      y: center.y + Math.sin(angle) * (groupEntries.length > 1 ? macroRadius : 0),
    }
    const microRadius = Math.min(220, 40 + memberIds.length * 9)
    memberIds.forEach((id, memberIndex) => {
      const memberAngle = (memberIndex / Math.max(1, memberIds.length)) * Math.PI * 2
      positions.set(id, {
        x: centroid.x + Math.cos(memberAngle) * microRadius,
        y: centroid.y + Math.sin(memberAngle) * microRadius,
      })
    })
  })

  return positions
}

export default function GraphCanvas({
  nodes,
  edges,
  communities,
  highlightNodeIds = [],
  pathNodeIds = [],
  selectedNodeId = null,
  onSelectNode,
  height = 480,
}: GraphCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 })
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const dragState = useRef<{ dragging: boolean; lastX: number; lastY: number }>({ dragging: false, lastX: 0, lastY: 0 })

  const positions = useMemo(() => computeLayout(nodes, communities), [nodes, communities])
  const communityByNode = useMemo(() => {
    const map = new Map<string, number>()
    communities.forEach((community, index) => {
      community.memberIds.forEach((id) => map.set(id, index))
    })
    return map
  }, [communities])

  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])
  const degreeById = useMemo(() => {
    const map = new Map<string, number>()
    for (const edge of edges) {
      map.set(edge.source, (map.get(edge.source) || 0) + 1)
      map.set(edge.target, (map.get(edge.target) || 0) + 1)
    }
    return map
  }, [edges])
  const maxDegree = useMemo(() => Math.max(1, ...Array.from(degreeById.values())), [degreeById])

  const highlightSet = useMemo(() => new Set(highlightNodeIds), [highlightNodeIds])
  const pathSet = useMemo(() => new Set(pathNodeIds), [pathNodeIds])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const dpr = window.devicePixelRatio || 1
    const width = canvas.clientWidth
    const displayHeight = canvas.clientHeight
    if (canvas.width !== width * dpr || canvas.height !== displayHeight * dpr) {
      canvas.width = width * dpr
      canvas.height = displayHeight * dpr
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light'
    ctx.fillStyle = isDark ? '#0b0f14' : '#f8fafc'
    ctx.fillRect(0, 0, width, displayHeight)

    ctx.save()
    ctx.translate(transform.x, transform.y)
    ctx.scale(transform.scale, transform.scale)

    const dimOthers = highlightSet.size > 0 || pathSet.size > 0

    for (const edge of edges) {
      const from = positions.get(edge.source)
      const to = positions.get(edge.target)
      if (!from || !to) continue
      const onPath = pathSet.has(edge.source) && pathSet.has(edge.target)
      const emphasized = onPath || (highlightSet.has(edge.source) && highlightSet.has(edge.target))
      ctx.beginPath()
      ctx.moveTo(from.x, from.y)
      ctx.lineTo(to.x, to.y)
      ctx.strokeStyle = emphasized
        ? '#f87171'
        : isDark
          ? `rgba(148, 163, 184, ${dimOthers ? 0.08 : Math.min(0.5, 0.12 + edge.weight * 0.3)})`
          : `rgba(71, 85, 105, ${dimOthers ? 0.08 : Math.min(0.5, 0.12 + edge.weight * 0.3)})`
      ctx.lineWidth = emphasized ? 2 : 1
      ctx.stroke()
    }

    for (const node of nodes) {
      const pos = positions.get(node.id)
      if (!pos) continue
      const degree = degreeById.get(node.id) || 0
      const radius = 4 + (degree / maxDegree) * 8
      const communityIndex = communityByNode.get(node.id)
      const color = communityIndex !== undefined ? PALETTE[communityIndex % PALETTE.length] : '#64748b'
      const isDimmed = dimOthers && !highlightSet.has(node.id) && !pathSet.has(node.id)

      ctx.beginPath()
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2)
      ctx.fillStyle = isDimmed ? `${color}33` : color
      ctx.fill()

      if (node.id === selectedNodeId || highlightSet.has(node.id) || pathSet.has(node.id)) {
        ctx.beginPath()
        ctx.arc(pos.x, pos.y, radius + 3, 0, Math.PI * 2)
        ctx.strokeStyle = node.id === selectedNodeId ? '#38bdf8' : '#f87171'
        ctx.lineWidth = 2
        ctx.stroke()
      }
      if (node.id === hoveredNodeId) {
        ctx.beginPath()
        ctx.arc(pos.x, pos.y, radius + 5, 0, Math.PI * 2)
        ctx.strokeStyle = '#e2e8f0'
        ctx.lineWidth = 1
        ctx.stroke()
      }
    }

    ctx.restore()
  }, [
    nodes,
    edges,
    positions,
    transform,
    communityByNode,
    degreeById,
    maxDegree,
    hoveredNodeId,
    selectedNodeId,
    highlightSet,
    pathSet,
  ])

  useEffect(() => {
    draw()
  }, [draw])

  useEffect(() => {
    const handleResize = () => draw()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [draw])

  const screenToWorld = useCallback(
    (screenX: number, screenY: number) => ({
      x: (screenX - transform.x) / transform.scale,
      y: (screenY - transform.y) / transform.scale,
    }),
    [transform]
  )

  const findNodeAt = useCallback(
    (worldX: number, worldY: number): string | null => {
      let closest: string | null = null
      let closestDistance = 14 / transform.scale
      for (const node of nodes) {
        const pos = positions.get(node.id)
        if (!pos) continue
        const distance = Math.hypot(pos.x - worldX, pos.y - worldY)
        if (distance < closestDistance) {
          closestDistance = distance
          closest = node.id
        }
      }
      return closest
    },
    [nodes, positions, transform.scale]
  )

  const handleMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const localX = event.clientX - rect.left
    const localY = event.clientY - rect.top
    if (dragState.current.dragging) {
      const dx = event.clientX - dragState.current.lastX
      const dy = event.clientY - dragState.current.lastY
      dragState.current.lastX = event.clientX
      dragState.current.lastY = event.clientY
      setTransform((prev) => ({ ...prev, x: prev.x + dx, y: prev.y + dy }))
      return
    }
    const world = screenToWorld(localX, localY)
    setHoveredNodeId(findNodeAt(world.x, world.y))
  }

  const handleMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
    dragState.current = { dragging: true, lastX: event.clientX, lastY: event.clientY }
  }

  const handleMouseUp = () => {
    dragState.current.dragging = false
  }

  const handleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const world = screenToWorld(event.clientX - rect.left, event.clientY - rect.top)
    const hit = findNodeAt(world.x, world.y)
    if (hit && onSelectNode) onSelectNode(hit)
  }

  const handleWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault()
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const cursorX = event.clientX - rect.left
    const cursorY = event.clientY - rect.top
    setTransform((prev) => {
      const nextScale = Math.min(4, Math.max(0.25, prev.scale * (event.deltaY > 0 ? 0.9 : 1.1)))
      const worldX = (cursorX - prev.x) / prev.scale
      const worldY = (cursorY - prev.y) / prev.scale
      return {
        scale: nextScale,
        x: cursorX - worldX * nextScale,
        y: cursorY - worldY * nextScale,
      }
    })
  }

  const resetView = () => setTransform({ scale: 1, x: 0, y: 0 })

  const containerStyle: CSSProperties = {
    position: 'relative',
    width: '100%',
    height,
    borderRadius: 'var(--radius-lg)',
    border: '1px solid var(--border)',
    overflow: 'hidden',
  }

  const hoveredNode = hoveredNodeId ? nodeById.get(hoveredNodeId) : null

  return (
    <div ref={containerRef} style={containerStyle}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`Relationship graph with ${nodes.length} accounts and ${edges.length} relationships`}
        style={{ width: '100%', height: '100%', display: 'block', cursor: dragState.current.dragging ? 'grabbing' : 'grab' }}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleClick}
        onWheel={handleWheel}
      />
      <button
        type="button"
        onClick={resetView}
        aria-label="Reset graph view"
        style={{
          position: 'absolute',
          top: 10,
          right: 10,
          fontSize: 11,
          padding: '5px 9px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border)',
          background: 'var(--bg-elevated)',
          color: 'var(--text-secondary)',
          cursor: 'pointer',
        }}
      >
        Reset view
      </button>
      {hoveredNode && (
        <div
          role="status"
          style={{
            position: 'absolute',
            left: 10,
            bottom: 10,
            fontSize: 11,
            padding: '7px 10px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)',
            background: 'var(--bg-card)',
            color: 'var(--text-primary)',
            maxWidth: 260,
          }}
        >
          <strong>{hoveredNode.label}</strong>
          <div style={{ color: 'var(--text-muted)' }}>
            {hoveredNode.type} · {hoveredNode.txCount} tx · {degreeById.get(hoveredNode.id) || 0} connections
          </div>
        </div>
      )}
    </div>
  )
}
