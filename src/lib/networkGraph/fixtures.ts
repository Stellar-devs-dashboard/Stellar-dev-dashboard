import type { GraphEdge, GraphEdgeType, GraphNode, GraphNodeType, GraphSnapshot } from '../../types/networkGraph'
import { buildAdjacency, detectCommunities, runAllPatternDetectors, computeCentrality } from './algorithms'

const METHODOLOGY_VERSION = 'graph-methodology-1.0.0'
export const MODEL_VERSION = 'graph-engine-v1.0.0'

/** Deterministic mulberry32 PRNG so fixture volumes vary but stay reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Builds a syntactically valid-looking Stellar public key (G + 55 base32 chars) from a tag. */
function addr(tag: string): string {
  const clean = tag.toUpperCase().replace(/[^A-Z2-7]/g, '') || 'X'
  const filler = clean[clean.length - 1] || 'X'
  return `G${clean.padEnd(55, filler).slice(0, 55)}`
}

interface NodeSpec {
  id: string
  label: string
  type: GraphNodeType
  createdAt: string
  txCount: number
  tags: string[]
}

interface EdgeSpec {
  source: string
  target: string
  type: GraphEdgeType
  weight: number
  volume: number
  asset: string
  txCount: number
  lastActivity: string
}

class GraphBuilder {
  nodes = new Map<string, NodeSpec>()
  edges: EdgeSpec[] = []
  private counter = 0

  node(tag: string, label: string, type: GraphNodeType, createdAt: string, txCount: number, tags: string[] = []): string {
    const id = addr(tag)
    if (!this.nodes.has(id)) {
      this.nodes.set(id, { id, label, type, createdAt, txCount, tags })
    }
    return id
  }

  edge(source: string, target: string, type: GraphEdgeType, weight: number, volume: number, asset: string, txCount: number, lastActivity: string): void {
    this.counter += 1
    this.edges.push({ source, target, type, weight, volume, asset, txCount, lastActivity })
  }

  build(): { nodes: GraphNode[]; edges: GraphEdge[] } {
    const nodes: GraphNode[] = Array.from(this.nodes.values())
    const edges: GraphEdge[] = this.edges.map((e, index) => ({
      id: `edge-${index}-${e.source.slice(1, 6)}-${e.target.slice(1, 6)}`,
      ...e,
    }))
    return { nodes, edges }
  }
}

function isoOffset(now: Date, ms: number): string {
  return new Date(now.getTime() - ms).toISOString()
}

const DAY = 1000 * 60 * 60 * 24

/**
 * Builds a synthetic but structurally realistic Stellar relationship graph
 * with deliberately embedded patterns (anchor network, payment corridor,
 * circular flow ring, Sybil cluster, Ponzi-like hub, dust fan-out, and a
 * systemic bridge account) so the detectors in algorithms.ts — and the
 * acceptance criteria that depend on them — have known ground truth to find.
 * A production deployment swaps this generator for the indexer-backed
 * client in client.ts without touching the algorithms or UI layer.
 */
export function buildFixtureGraph(now = new Date('2026-08-21T16:00:00.000Z')): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const rng = mulberry32(42)
  const g = new GraphBuilder()

  // ── Anchor network: an issuer plus accounts holding trustlines and
  //    transacting through it (classic remittance / on-off ramp topology).
  const anchor = g.node('anchorissuer', 'Meridian Anchor', 'anchor', isoOffset(now, 400 * DAY), 5400, ['anchor'])
  const anchorMembers = ['anchorusera', 'anchoruserb', 'anchoruserc', 'anchoruserd', 'anchorusere'].map((tag, i) =>
    g.node(tag, `Anchor User ${String.fromCharCode(65 + i)}`, 'account', isoOffset(now, (300 - i * 10) * DAY), 80 + i * 12)
  )
  for (const member of anchorMembers) {
    g.edge(member, anchor, 'trustline', 0.6, 0, 'USDC', 1, isoOffset(now, 200 * DAY))
    g.edge(member, anchor, 'payment', 0.7, 200 + rng() * 300, 'USDC', 12 + Math.floor(rng() * 8), isoOffset(now, rng() * 5 * DAY))
    g.edge(anchor, member, 'payment', 0.5, 150 + rng() * 250, 'USDC', 8 + Math.floor(rng() * 6), isoOffset(now, rng() * 5 * DAY))
  }
  for (let i = 0; i < anchorMembers.length; i++) {
    for (let j = i + 1; j < anchorMembers.length; j++) {
      if (rng() > 0.55) continue
      g.edge(anchorMembers[i], anchorMembers[j], 'payment', 0.3, 20 + rng() * 60, 'USDC', 2, isoOffset(now, rng() * 10 * DAY))
    }
  }

  // ── Payment corridor: linear forwarding chain (cross-border remittance).
  const corridor = ['corridorstart', 'corridorhop1', 'corridorhop2', 'corridorend'].map((tag, i) =>
    g.node(tag, `Corridor Hop ${i + 1}`, 'account', isoOffset(now, (250 - i * 5) * DAY), 40 + i * 5)
  )
  for (let i = 0; i < corridor.length - 1; i++) {
    g.edge(corridor[i], corridor[i + 1], 'payment', 0.65, 900 - i * 20, 'XLM', 6, isoOffset(now, (2 - i * 0.3) * DAY))
  }

  // ── Circular flow ring: near-equal amounts looping back to origin.
  const ring = ['ringnodea', 'ringnodeb', 'ringnodec', 'ringnoded'].map((tag, i) =>
    g.node(tag, `Ring Account ${String.fromCharCode(65 + i)}`, 'account', isoOffset(now, (60 - i) * DAY), 15 + i)
  )
  for (let i = 0; i < ring.length; i++) {
    const next = ring[(i + 1) % ring.length]
    g.edge(ring[i], next, 'payment', 0.5, 500 + (i % 2 === 0 ? 4 : -4), 'XLM', 1, isoOffset(now, (1 - i * 0.1) * DAY))
  }

  // ── Sybil cluster: fresh, low-activity accounts funded by one hub, densely
  //    interconnected only among themselves.
  const sybilHub = g.node('sybilhub', 'Sybil Funding Hub', 'account', isoOffset(now, 400 * DAY), 900)
  const sybils = Array.from({ length: 6 }, (_, i) =>
    g.node(`sybilclone${i}`, `New Account ${i + 1}`, 'account', isoOffset(now, (2 - i * 0.2) * DAY), 2 + (i % 2))
  )
  for (const clone of sybils) {
    g.edge(sybilHub, clone, 'create-account', 0.4, 5, 'XLM', 1, isoOffset(now, (2 - rng()) * DAY))
  }
  for (let i = 0; i < sybils.length; i++) {
    for (let j = i + 1; j < sybils.length; j++) {
      if (rng() > 0.5) continue
      g.edge(sybils[i], sybils[j], 'payment', 0.2, 1 + rng() * 3, 'XLM', 1, isoOffset(now, rng() * 2 * DAY))
    }
  }

  // ── Ponzi-like topology: many small inbound "investments", few large
  //    outbound "payouts".
  const ponziHub = g.node('ponzihub', 'HighYield Pool', 'account', isoOffset(now, 90 * DAY), 340)
  const investors = Array.from({ length: 9 }, (_, i) =>
    g.node(`investor${i}`, `Investor ${i + 1}`, 'account', isoOffset(now, (120 - i * 3) * DAY), 10 + i)
  )
  for (const investor of investors) {
    g.edge(investor, ponziHub, 'payment', 0.55, 60 + rng() * 30, 'XLM', 2, isoOffset(now, rng() * 20 * DAY))
  }
  const operators = ['ponzioperatora', 'ponzioperatorb'].map((tag, i) =>
    g.node(tag, `Payout Wallet ${i + 1}`, 'account', isoOffset(now, 85 * DAY), 30)
  )
  for (const operator of operators) {
    g.edge(ponziHub, operator, 'payment', 0.8, 620 + rng() * 100, 'XLM', 3, isoOffset(now, rng() * 5 * DAY))
  }

  // ── Dust attack fan-out: near-zero payments to many distinct accounts.
  const dustSource = g.node('dustsource', 'Dust Spam Source', 'account', isoOffset(now, 20 * DAY), 1200)
  const dustTargets = Array.from({ length: 8 }, (_, i) =>
    g.node(`dusttarget${i}`, `Recipient ${i + 1}`, 'account', isoOffset(now, (500 - i * 8) * DAY), 200 + i * 10)
  )
  for (const target of dustTargets) {
    g.edge(dustSource, target, 'payment', 0.1, 0.0000015, 'XLM', 1, isoOffset(now, rng() * 3 * DAY))
  }

  // ── Liquidity cluster: a pool plus DEX participants trading through offers.
  const pool = g.node('xlmusdcpool', 'XLM/USDC Pool', 'liquidity-pool', isoOffset(now, 300 * DAY), 8600)
  const traders = Array.from({ length: 5 }, (_, i) =>
    g.node(`trader${i}`, `DEX Trader ${i + 1}`, 'account', isoOffset(now, (200 - i * 4) * DAY), 300 + i * 40)
  )
  for (const trader of traders) {
    g.edge(trader, pool, 'offer', 0.6, 400 + rng() * 800, 'XLM', 20 + Math.floor(rng() * 15), isoOffset(now, rng() * DAY))
    g.edge(pool, trader, 'offer', 0.4, 380 + rng() * 780, 'USDC', 18, isoOffset(now, rng() * DAY))
  }

  // ── Systemic bridge: sole connector between the anchor network and the
  //    payment corridor, so it carries disproportionate betweenness.
  // Weights stay low on purpose: betweenness centrality (unweighted, purely
  // structural) still makes this account a hub, but a low weight keeps
  // label propagation from folding the anchor network and payment corridor
  // into a single community just because a bridge connects them.
  const bridge = g.node('bridgehub', 'Cross-Cluster Bridge', 'account', isoOffset(now, 500 * DAY), 4200, ['bridge'])
  g.edge(anchorMembers[0], bridge, 'payment', 0.08, 700, 'XLM', 40, isoOffset(now, 0.5 * DAY))
  g.edge(bridge, corridor[0], 'payment', 0.08, 690, 'XLM', 38, isoOffset(now, 0.4 * DAY))
  g.edge(bridge, ponziHub, 'payment', 0.05, 90, 'XLM', 4, isoOffset(now, 3 * DAY))
  g.edge(bridge, pool, 'offer', 0.05, 200, 'XLM', 6, isoOffset(now, 1 * DAY))

  // ── Organic filler accounts for a more realistic, less-uniform network.
  const organic = Array.from({ length: 14 }, (_, i) =>
    g.node(`organic${i}`, `Account ${i + 1}`, 'account', isoOffset(now, (700 - i * 20) * DAY), 20 + Math.floor(rng() * 400))
  )
  const allForOrganicLinks = [...anchorMembers, ...corridor, ...traders, bridge, ...organic]
  for (const account of organic) {
    const linkCount = 1 + Math.floor(rng() * 3)
    for (let i = 0; i < linkCount; i++) {
      const other = allForOrganicLinks[Math.floor(rng() * allForOrganicLinks.length)]
      if (other === account) continue
      g.edge(account, other, 'payment', 0.3 + rng() * 0.4, 5 + rng() * 200, 'XLM', 1 + Math.floor(rng() * 5), isoOffset(now, rng() * 60 * DAY))
    }
  }

  return g.build()
}

const CAVEATS = [
  'This snapshot is generated from deterministic fixtures for demonstration and testing — it is not a live indexer feed.',
  'Community, centrality, and pattern detection run entirely in the browser over the current filtered subgraph; a production deployment would run heavier batch jobs (e.g. full-network Louvain, GNN embeddings) server-side and stream results through the same client.ts contract.',
  'Pattern detectors are heuristic and topology-based, not proof of wrongdoing — always corroborate with off-chain investigation before acting.',
  'Natural-language queries are parsed with a keyword/intent matcher, not a language model; unsupported phrasings return example queries instead of a guess.',
  'No private keys, device identifiers, or off-chain personal data are represented in the graph — only public ledger relationships.',
]

export function createGraphSnapshot(
  network = 'testnet',
  options: { now?: Date; state?: GraphSnapshot['state'] } = {}
): GraphSnapshot {
  const now = options.now || new Date('2026-08-21T16:00:00.000Z')
  const { nodes, edges } = buildFixtureGraph(now)
  const centrality = computeCentrality(nodes, edges)
  const communities = detectCommunities(nodes, edges)
  const patterns = runAllPatternDetectors(nodes, edges, centrality)

  return {
    generatedAt: now.toISOString(),
    state: options.state || 'simulation',
    network,
    summary: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      communityCount: communities.length,
      patternCount: patterns.length,
      dataFreshnessSeconds: 8,
      modelVersion: MODEL_VERSION,
    },
    nodes,
    edges,
    caveats: CAVEATS,
    methodologyVersion: METHODOLOGY_VERSION,
  }
}

// Precomputed export used by lightweight demos/tests that don't need a fresh snapshot.
export const fixtureGraph = buildFixtureGraph()
export { buildAdjacency }
