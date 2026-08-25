import { useMemo, useState, type CSSProperties } from 'react'
import { AlertTriangle, Network, RefreshCw, Search, Share2, Users, Waypoints } from 'lucide-react'
import useNetworkGraph from '../../hooks/useNetworkGraph'
import { useStore } from '../../lib/store'
import { SAMPLE_QUERIES } from '../../lib/networkGraph/nlQuery'
import GraphCanvas from './GraphCanvas'
import type {
  CentralityScore,
  Community,
  GraphEdge,
  GraphNode,
  NLQueryResult,
  PatternMatch,
  PatternSeverity,
} from '../../types/networkGraph'

type View = 'explorer' | 'communities' | 'centrality' | 'patterns' | 'pathfinder' | 'query' | 'methodology'

const SEVERITY_COLORS: Record<PatternSeverity, string> = {
  low: 'var(--green)',
  medium: 'var(--amber)',
  high: 'var(--orange, #f97316)',
  critical: 'var(--red)',
}

const panel: CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  padding: 18,
}

const button: CSSProperties = {
  minHeight: 36,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 7,
  padding: '7px 12px',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--bg-elevated)',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  fontSize: 11,
}

const short = (value: string) => (value.length > 13 ? `${value.slice(0, 7)}…${value.slice(-5)}` : value)

function SeverityPill({ severity }: { severity: PatternSeverity }) {
  return (
    <span
      style={{
        color: SEVERITY_COLORS[severity],
        border: `1px solid ${SEVERITY_COLORS[severity]}`,
        borderRadius: 999,
        padding: '3px 8px',
        fontSize: 10,
        fontWeight: 700,
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}
    >
      {severity}
    </span>
  )
}

function Stat({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return (
    <div style={panel}>
      <div style={{ color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em' }}>{label}</div>
      <div style={{ color: 'var(--text-primary)', fontSize: 26, fontWeight: 700, margin: '8px 0 4px', fontFamily: 'var(--font-display)' }}>{value}</div>
      <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>{detail}</div>
    </div>
  )
}

function NodePicker({ nodes, value, onChange, label }: { nodes: GraphNode[]; value: string; onChange: (_id: string) => void; label: string }) {
  return (
    <label style={{ display: 'grid', gap: 4, fontSize: 10, color: 'var(--text-muted)' }}>
      {label}
      <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} style={{ ...button, minWidth: 180 }}>
        <option value="">Select an account…</option>
        {nodes.map((node) => (
          <option key={node.id} value={node.id}>
            {node.label} ({short(node.id)})
          </option>
        ))}
      </select>
    </label>
  )
}

function ExplorerView({
  nodes,
  edges,
  communities,
  highlightNodeIds,
  pathNodeIds,
  selectedNodeId,
  onSelectNode,
}: {
  nodes: GraphNode[]
  edges: GraphEdge[]
  communities: Community[]
  highlightNodeIds: string[]
  pathNodeIds: string[]
  selectedNodeId: string | null
  onSelectNode: (_id: string) => void
}) {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <GraphCanvas
        nodes={nodes}
        edges={edges}
        communities={communities}
        highlightNodeIds={highlightNodeIds}
        pathNodeIds={pathNodeIds}
        selectedNodeId={selectedNodeId}
        onSelectNode={onSelectNode}
      />
      <p style={{ color: 'var(--text-muted)', fontSize: 10, margin: 0 }}>
        Drag to pan, scroll to zoom, click an account to inspect it. Node size reflects connection count; color reflects detected community.
      </p>
    </div>
  )
}

function SelectedNodePanel({ node, centrality, onClear }: { node: GraphNode; centrality?: CentralityScore; onClear: () => void }) {
  return (
    <div style={panel}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 15 }}>{node.label}</h2>
        <button type="button" onClick={onClear} style={{ ...button, padding: '4px 8px' }} aria-label="Clear selection">
          Clear
        </button>
      </div>
      <div style={{ color: 'var(--text-muted)', fontSize: 10, marginTop: 4 }}>{short(node.id)} · {node.type}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: 10, marginTop: 12 }}>
        <div><div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Tx count</div><div style={{ fontSize: 16, fontWeight: 700 }}>{node.txCount}</div></div>
        {centrality && (
          <>
            <div><div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Degree</div><div style={{ fontSize: 16, fontWeight: 700 }}>{centrality.degree}</div></div>
            <div><div style={{ fontSize: 10, color: 'var(--text-muted)' }}>PageRank</div><div style={{ fontSize: 16, fontWeight: 700 }}>{(centrality.pageRank * 100).toFixed(2)}%</div></div>
            <div><div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Betweenness</div><div style={{ fontSize: 16, fontWeight: 700 }}>{centrality.betweenness.toFixed(2)}</div></div>
          </>
        )}
      </div>
    </div>
  )
}

function CommunitiesView({ communities, onInspect }: { communities: Community[]; onInspect: (_ids: string[]) => void }) {
  if (!communities.length) {
    return <div style={{ ...panel, color: 'var(--text-muted)' }}>No communities meet the minimum size threshold yet. Lower it in preferences or wait for more relationship data.</div>
  }
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {communities.map((community) => (
        <article key={community.id} style={panel}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div>
              <span style={{ fontSize: 10, color: 'var(--cyan)', textTransform: 'uppercase', fontWeight: 700 }}>{community.kind.replace('-', ' ')}</span>
              <h3 style={{ margin: '4px 0', fontSize: 14 }}>{community.label}</h3>
            </div>
            <button type="button" onClick={() => onInspect(community.memberIds)} style={button}>
              <Share2 size={13} /> View in explorer
            </button>
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-secondary)' }}>
            <span>{community.memberIds.length} members</span>
            <span>{community.internalEdgeCount} internal edges</span>
            <span>{community.externalEdgeCount} external edges</span>
            <span>{(community.density * 100).toFixed(0)}% density</span>
          </div>
        </article>
      ))}
    </div>
  )
}

function CentralityView({ centrality, nodeById, onInspect }: { centrality: CentralityScore[]; nodeById: Map<string, GraphNode>; onInspect: (_id: string) => void }) {
  const top = centrality.slice(0, 15)
  return (
    <div style={panel}>
      <h2 style={{ margin: '0 0 4px', fontSize: 15 }}>Top influencers</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 11, margin: '0 0 10px' }}>
        Ranked by a composite of PageRank, betweenness, and degree centrality.
      </p>
      <div role="table" aria-label="Top influencers" style={{ display: 'grid', gap: 4 }}>
        {top.map((score, index) => {
          const node = nodeById.get(score.nodeId)
          return (
            <div
              key={score.nodeId}
              role="row"
              style={{ display: 'grid', gridTemplateColumns: '24px 1.6fr 0.8fr 0.8fr 0.8fr 90px', gap: 8, alignItems: 'center', borderTop: '1px solid var(--border)', padding: '9px 0', fontSize: 11 }}
            >
              <span style={{ color: 'var(--text-muted)' }}>{index + 1}</span>
              <strong>{node?.label || score.nodeId}</strong>
              <span title="Degree">deg {score.degree}</span>
              <span title="PageRank">pr {(score.pageRank * 100).toFixed(2)}%</span>
              <span title="Betweenness">bc {score.betweenness.toFixed(1)}</span>
              <button type="button" onClick={() => onInspect(score.nodeId)} style={{ ...button, padding: '4px 8px' }}>
                Inspect
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PatternsView({ patterns, onInspect }: { patterns: PatternMatch[]; onInspect: (_ids: string[]) => void }) {
  if (!patterns.length) {
    return (
      <div role="status" style={{ ...panel, color: 'var(--green)' }}>
        No suspicious topology patterns detected in the current filtered view.
      </div>
    )
  }
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {patterns.map((pattern) => (
        <article key={pattern.id} style={panel}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <SeverityPill severity={pattern.severity} />
              <strong style={{ fontSize: 13 }}>{pattern.title}</strong>
            </div>
            <button type="button" onClick={() => onInspect(pattern.nodeIds)} style={button}>
              <Share2 size={13} /> Investigate
            </button>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{pattern.description}</p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {pattern.evidence.map((item) => (
              <span key={item} style={{ color: 'var(--text-muted)', background: 'var(--bg-elevated)', padding: '3px 7px', borderRadius: 4, fontSize: 10 }}>
                {item}
              </span>
            ))}
          </div>
          <span style={{ color: 'var(--cyan)', fontSize: 10 }}>{Math.round(pattern.confidence * 100)}% confidence · {pattern.nodeIds.length} accounts involved</span>
        </article>
      ))}
    </div>
  )
}

function PathfinderView({ graph }: { graph: ReturnType<typeof useNetworkGraph> }) {
  const [sourceId, setSourceId] = useState('')
  const [targetId, setTargetId] = useState('')
  const [maxHops, setMaxHops] = useState(graph.preferences.maxHops)
  const nodes = useMemo(() => graph.snapshot?.nodes || [], [graph.snapshot])
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])

  const handleFind = () => {
    if (!sourceId || !targetId) return
    graph.findPath(sourceId, targetId, maxHops)
  }

  const path = graph.lastPath

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ ...panel, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'end' }}>
        <NodePicker nodes={nodes} value={sourceId} onChange={setSourceId} label="From account" />
        <NodePicker nodes={nodes} value={targetId} onChange={setTargetId} label="To account" />
        <label style={{ display: 'grid', gap: 4, fontSize: 10, color: 'var(--text-muted)' }}>
          Max hops
          <input
            type="number"
            min={1}
            max={10}
            value={maxHops}
            aria-label="Maximum hops"
            onChange={(event) => setMaxHops(Math.min(10, Math.max(1, Number(event.target.value) || 1)))}
            style={{ ...button, width: 70 }}
          />
        </label>
        <button type="button" onClick={handleFind} disabled={!sourceId || !targetId} style={button}>
          <Waypoints size={14} /> Find path
        </button>
      </div>
      {path && (
        <div style={panel}>
          {path.found ? (
            <>
              <h3 style={{ margin: '0 0 8px', fontSize: 13 }}>
                {path.hopCount === 0 ? 'Same account' : `Path found · ${path.hopCount} hop${path.hopCount === 1 ? '' : 's'}`}
              </h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', fontSize: 11 }}>
                {path.hops.map((hop, index) => (
                  <span key={`${hop.nodeId}-${index}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ background: 'var(--bg-elevated)', padding: '4px 9px', borderRadius: 999 }}>
                      {nodeById.get(hop.nodeId)?.label || short(hop.nodeId)}
                    </span>
                    {index < path.hops.length - 1 && <span style={{ color: 'var(--text-muted)' }}>→</span>}
                  </span>
                ))}
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: 10, marginTop: 10 }}>Total relationship weight: {path.totalWeight}</p>
            </>
          ) : (
            <div role="status" style={{ color: 'var(--amber)' }}>
              <AlertTriangle size={14} /> No path found within {maxHops} hops.{' '}
              {path.truncated ? 'Try increasing the hop limit.' : 'These accounts appear to be in disconnected parts of the network.'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function QueryView({ graph, onInspect }: { graph: ReturnType<typeof useNetworkGraph>; onInspect: (_ids: string[]) => void }) {
  const [text, setText] = useState('')
  const result: NLQueryResult | null = graph.lastQuery
  const nodes = useMemo(() => graph.snapshot?.nodes || [], [graph.snapshot])
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])

  const handleSubmit = (value: string) => {
    setText(value)
    graph.runQuery(value)
  }

  const renderAnswer = () => {
    if (!result) return null
    if (result.intent === 'top-influencers') {
      return <CentralityView centrality={graph.centrality.slice(0, 5)} nodeById={nodeById} onInspect={(id) => onInspect([id])} />
    }
    if (result.intent === 'communities') {
      return <CommunitiesView communities={graph.communities.slice(0, 5)} onInspect={onInspect} />
    }
    if (result.intent === 'patterns') {
      return <PatternsView patterns={graph.patterns.slice(0, 5)} onInspect={onInspect} />
    }
    if (result.intent === 'shortest-path' || result.intent === 'neighbors') {
      const sourceId = String(result.params.sourceId || '')
      if (sourceId && result.intent === 'neighbors') {
        const ids = Array.from(graph.neighborhood(sourceId, Number(result.params.hops) || 2))
        return (
          <div style={panel}>
            <h3 style={{ margin: '0 0 8px', fontSize: 13 }}>{ids.length} accounts connected to {nodeById.get(sourceId)?.label || short(sourceId)}</h3>
            <button type="button" onClick={() => onInspect(ids)} style={button}>
              <Share2 size={13} /> View in explorer
            </button>
          </div>
        )
      }
    }
    return (
      <div role="status" style={{ ...panel, color: 'var(--text-muted)' }}>
        {result.summary}
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={panel}>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Ask a question about this network</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              aria-label="Natural language graph query"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder='e.g. "who are the top influencers?"'
              style={{ ...button, flex: 1, justifyContent: 'flex-start' }}
            />
            <button type="button" aria-label="Submit query" onClick={() => handleSubmit(text)} style={button}>
              <Search size={13} /> Ask
            </button>
          </div>
        </label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
          {SAMPLE_QUERIES.map((sample) => (
            <button key={sample} type="button" onClick={() => handleSubmit(sample)} style={{ ...button, fontSize: 10 }}>
              {sample}
            </button>
          ))}
        </div>
      </div>
      {result && (
        <div style={{ display: 'grid', gap: 10 }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>
            Interpreted as <strong style={{ color: 'var(--text-primary)' }}>{result.intent}</strong> · {Math.round(result.confidence * 100)}% confidence
          </span>
          {renderAnswer()}
        </div>
      )}
    </div>
  )
}

function MethodologyView({ caveats, methodologyVersion, modelVersion }: { caveats: string[]; methodologyVersion: string; modelVersion: string }) {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={panel}>
        <h2 style={{ margin: '0 0 6px', fontSize: 15 }}>Algorithms in this build</h2>
        <ul style={{ color: 'var(--text-secondary)', fontSize: 11, margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
          <li>Centrality: weighted PageRank (power iteration), unweighted Brandes betweenness, degree/weighted-degree.</li>
          <li>Communities: synchronous label propagation, classified into anchor networks, payment corridors, liquidity clusters, or Sybil-suspect clusters using topology and node-type heuristics.</li>
          <li>Pattern detection: bounded DFS cycle search for circular flows, fan-out/fan-in heuristics for dust and Ponzi-like topology, creation-time + density heuristics for Sybil clusters, and betweenness z-scores for systemic bridge accounts.</li>
          <li>Pathfinding: breadth-first search bounded to a configurable hop limit (default 10).</li>
          <li>Natural language: keyword/intent parser mapped onto the above (not a language model).</li>
        </ul>
      </div>
      <div style={panel}>
        <h2 style={{ margin: '0 0 6px', fontSize: 15 }}>Known limitations</h2>
        {caveats.map((caveat) => (
          <p key={caveat} style={{ color: 'var(--text-muted)', fontSize: 11 }}>{caveat}</p>
        ))}
        <p style={{ color: 'var(--text-muted)', fontSize: 10 }}>Engine {modelVersion} · Methodology {methodologyVersion}</p>
      </div>
    </div>
  )
}

export default function NetworkGraphDashboard() {
  const { network } = useStore()
  const graph = useNetworkGraph(network)
  const [view, setView] = useState<View>('explorer')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [highlightNodeIds, setHighlightNodeIds] = useState<string[]>([])

  const nodeById = useMemo(() => new Map((graph.snapshot?.nodes || []).map((n) => [n.id, n])), [graph.snapshot])
  const centralityById = useMemo(() => new Map(graph.centrality.map((c) => [c.nodeId, c])), [graph.centrality])

  const inspect = (ids: string[]) => {
    setHighlightNodeIds(ids)
    if (ids.length === 1) setSelectedNodeId(ids[0])
    setView('explorer')
  }

  if (graph.loading && !graph.snapshot) {
    return (
      <section role="status" style={panel}>
        <RefreshCw size={16} /> Building relationship graph…
      </section>
    )
  }
  if (graph.error && !graph.snapshot) {
    return (
      <section role="alert" style={{ ...panel, display: 'grid', gap: 12 }}>
        <strong><AlertTriangle size={17} /> Graph analysis unavailable</strong>
        <span>{graph.error.message}</span>
        {graph.error.retryable && (
          <button type="button" onClick={() => void graph.refresh(true)} style={{ ...button, width: 'fit-content' }}>
            Retry
          </button>
        )}
      </section>
    )
  }
  const snapshot = graph.snapshot
  if (!snapshot) return null

  const selectedNode = selectedNodeId ? nodeById.get(selectedNodeId) : undefined

  return (
    <section aria-labelledby="graph-title" style={{ display: 'grid', gap: 16 }}>
      <header style={{ ...panel, display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 10, fontWeight: 700 }}>GRAPH ANALYSIS · {network.toUpperCase()}</div>
          <h1 id="graph-title" style={{ margin: '6px 0', fontSize: 25 }}>Relationship &amp; network analysis</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 12, margin: 0, maxWidth: 650 }}>
            Explore relationships between Stellar accounts, detect communities, rank influence, and surface suspicious topology patterns.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={graph.simulateNetwork} style={button}>
            <Network size={14} /> Regenerate demo network
          </button>
          <button type="button" disabled={graph.refreshing} onClick={() => void graph.refresh(true)} style={button}>
            <RefreshCw size={13} /> {graph.refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>

      {(snapshot.state === 'degraded' || graph.cached) && (
        <div role="status" style={{ ...panel, color: 'var(--text-secondary)', padding: 12 }}>
          <AlertTriangle size={14} color="var(--amber)" /> Showing cached graph data. Relationships may not reflect the latest ledger state.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <Stat label="Accounts" value={snapshot.summary.nodeCount} detail="Nodes in current view" />
        <Stat label="Relationships" value={snapshot.summary.edgeCount} detail="Payments, trustlines, offers, contract calls" />
        <Stat label="Communities" value={snapshot.summary.communityCount} detail="Detected via label propagation" />
        <Stat label="Patterns flagged" value={snapshot.summary.patternCount} detail="Circular flow, Sybil, Ponzi, dust, hub risk" />
      </div>

      <nav aria-label="Graph analysis views" style={{ display: 'flex', gap: 5, borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
        {(['explorer', 'communities', 'centrality', 'patterns', 'pathfinder', 'query', 'methodology'] as View[]).map((item) => (
          <button
            type="button"
            key={item}
            aria-current={view === item ? 'page' : undefined}
            onClick={() => setView(item)}
            style={{ ...button, border: 0, borderBottom: view === item ? '2px solid var(--cyan)' : '2px solid transparent', borderRadius: 0, background: 'transparent', textTransform: 'capitalize' }}
          >
            {item === 'query' ? <><Users size={12} style={{ marginRight: 4 }} />Ask</> : item}
          </button>
        ))}
      </nav>

      {view === 'explorer' && (
        <div style={{ display: 'grid', gridTemplateColumns: selectedNode ? 'minmax(0, 2fr) minmax(220px, 1fr)' : '1fr', gap: 16 }}>
          <ExplorerView
            nodes={snapshot.nodes}
            edges={snapshot.edges}
            communities={graph.communities}
            highlightNodeIds={highlightNodeIds}
            pathNodeIds={graph.lastPath?.hops.map((h) => h.nodeId) || []}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
          />
          {selectedNode && (
            <SelectedNodePanel node={selectedNode} centrality={centralityById.get(selectedNode.id)} onClear={() => setSelectedNodeId(null)} />
          )}
        </div>
      )}
      {view === 'communities' && <CommunitiesView communities={graph.communities} onInspect={inspect} />}
      {view === 'centrality' && <CentralityView centrality={graph.centrality} nodeById={nodeById} onInspect={(id) => inspect([id])} />}
      {view === 'patterns' && <PatternsView patterns={graph.patterns} onInspect={inspect} />}
      {view === 'pathfinder' && <PathfinderView graph={graph} />}
      {view === 'query' && <QueryView graph={graph} onInspect={inspect} />}
      {view === 'methodology' && (
        <MethodologyView caveats={snapshot.caveats} methodologyVersion={snapshot.methodologyVersion} modelVersion={snapshot.summary.modelVersion} />
      )}

      <div style={{ ...panel, padding: 12, color: 'var(--text-muted)', fontSize: 10, display: 'flex', gap: 8 }}>
        Request ID: {graph.requestId || 'local'} · Generated {new Date(snapshot.generatedAt).toLocaleString()}
      </div>
    </section>
  )
}
