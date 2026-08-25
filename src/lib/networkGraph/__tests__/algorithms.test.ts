import { describe, expect, it } from 'vitest'
import {
  bfsPath,
  buildAdjacency,
  computeCentrality,
  degreeCentrality,
  detectCircularFlows,
  detectCommunities,
  detectDustNetworks,
  detectHubConcentration,
  detectPonziTopology,
  detectSybilClusters,
  kHopNeighborhood,
  pageRank,
  runAllPatternDetectors,
} from '../algorithms'
import { buildFixtureGraph } from '../fixtures'
import type { GraphEdge, GraphNode } from '../../../types/networkGraph'

const NOW = new Date('2026-08-21T16:00:00.000Z')

function byLabelPrefix(nodes: GraphNode[], prefix: string): GraphNode[] {
  return nodes.filter((node) => node.label.startsWith(prefix))
}

function byLabel(nodes: GraphNode[], label: string): GraphNode {
  const node = nodes.find((n) => n.label === label)
  if (!node) throw new Error(`fixture missing expected node: ${label}`)
  return node
}

describe('graph algorithms — pathfinding', () => {
  const nodes: GraphNode[] = [
    { id: 'a', label: 'A', type: 'account', createdAt: NOW.toISOString(), txCount: 1, tags: [] },
    { id: 'b', label: 'B', type: 'account', createdAt: NOW.toISOString(), txCount: 1, tags: [] },
    { id: 'c', label: 'C', type: 'account', createdAt: NOW.toISOString(), txCount: 1, tags: [] },
    { id: 'd', label: 'D', type: 'account', createdAt: NOW.toISOString(), txCount: 1, tags: [] },
    { id: 'isolated', label: 'Isolated', type: 'account', createdAt: NOW.toISOString(), txCount: 1, tags: [] },
  ]
  const edges: GraphEdge[] = [
    { id: 'e1', source: 'a', target: 'b', type: 'payment', weight: 0.5, volume: 10, asset: 'XLM', txCount: 1, lastActivity: NOW.toISOString() },
    { id: 'e2', source: 'b', target: 'c', type: 'payment', weight: 0.5, volume: 10, asset: 'XLM', txCount: 1, lastActivity: NOW.toISOString() },
    { id: 'e3', source: 'a', target: 'd', type: 'payment', weight: 0.5, volume: 10, asset: 'XLM', txCount: 1, lastActivity: NOW.toISOString() },
    { id: 'e4', source: 'd', target: 'c', type: 'payment', weight: 0.5, volume: 10, asset: 'XLM', txCount: 1, lastActivity: NOW.toISOString() },
  ]
  const adjacency = buildAdjacency(nodes, edges)

  it('finds the shortest path between two connected accounts', () => {
    const result = bfsPath(adjacency, 'a', 'c', 10)
    expect(result.found).toBe(true)
    expect(result.hopCount).toBe(2)
    expect(result.hops[0].nodeId).toBe('a')
    expect(result.hops[result.hops.length - 1].nodeId).toBe('c')
  })

  it('returns not-found for accounts in disconnected components', () => {
    const result = bfsPath(adjacency, 'a', 'isolated', 10)
    expect(result.found).toBe(false)
    expect(result.hops).toHaveLength(0)
  })

  it('respects the hop budget', () => {
    const chain: GraphNode[] = Array.from({ length: 6 }, (_, i) => ({
      id: `n${i}`,
      label: `N${i}`,
      type: 'account',
      createdAt: NOW.toISOString(),
      txCount: 1,
      tags: [],
    }))
    const chainEdges: GraphEdge[] = chain.slice(0, -1).map((node, i) => ({
      id: `ce${i}`,
      source: node.id,
      target: chain[i + 1].id,
      type: 'payment',
      weight: 0.5,
      volume: 5,
      asset: 'XLM',
      txCount: 1,
      lastActivity: NOW.toISOString(),
    }))
    const chainAdjacency = buildAdjacency(chain, chainEdges)
    const capped = bfsPath(chainAdjacency, 'n0', 'n5', 2)
    expect(capped.found).toBe(false)
    const uncapped = bfsPath(chainAdjacency, 'n0', 'n5', 10)
    expect(uncapped.found).toBe(true)
    expect(uncapped.hopCount).toBe(5)
  })

  it('returns a trivial path when source equals target', () => {
    const result = bfsPath(adjacency, 'a', 'a', 10)
    expect(result.found).toBe(true)
    expect(result.hopCount).toBe(0)
  })

  it('computes k-hop neighborhoods', () => {
    const oneHop = kHopNeighborhood(adjacency, 'a', 1)
    expect(oneHop).toEqual(new Set(['a', 'b', 'd']))
    const twoHop = kHopNeighborhood(adjacency, 'a', 2)
    expect(twoHop.has('c')).toBe(true)
  })

  it('computes degree centrality', () => {
    const degree = degreeCentrality(nodes, adjacency)
    expect(degree.get('a')?.degree).toBe(2)
    expect(degree.get('isolated')?.degree).toBe(0)
  })
})

describe('graph algorithms — PageRank', () => {
  it('ranks a heavily-referenced hub above leaf nodes', () => {
    const nodes: GraphNode[] = ['hub', 'leaf1', 'leaf2', 'leaf3'].map((id) => ({
      id,
      label: id,
      type: 'account',
      createdAt: NOW.toISOString(),
      txCount: 1,
      tags: [],
    }))
    const edges: GraphEdge[] = ['leaf1', 'leaf2', 'leaf3'].map((leaf, i) => ({
      id: `e${i}`,
      source: leaf,
      target: 'hub',
      type: 'payment',
      weight: 0.5,
      volume: 10,
      asset: 'XLM',
      txCount: 1,
      lastActivity: NOW.toISOString(),
    }))
    const adjacency = buildAdjacency(nodes, edges)
    const ranks = pageRank(nodes, adjacency)
    const hubRank = ranks.get('hub') || 0
    const leafRank = ranks.get('leaf1') || 0
    expect(hubRank).toBeGreaterThan(leafRank)
    const total = Array.from(ranks.values()).reduce((sum, v) => sum + v, 0)
    expect(total).toBeCloseTo(1, 1)
  })
})

describe('graph algorithms — betweenness', () => {
  it('gives the bridge node in a barbell graph the highest betweenness', () => {
    const clusterA = ['a1', 'a2', 'a3']
    const clusterB = ['b1', 'b2', 'b3']
    const nodes: GraphNode[] = [...clusterA, 'bridge', ...clusterB].map((id) => ({
      id,
      label: id,
      type: 'account',
      createdAt: NOW.toISOString(),
      txCount: 1,
      tags: [],
    }))
    const edges: GraphEdge[] = []
    let counter = 0
    const link = (source: string, target: string) => {
      edges.push({ id: `e${counter++}`, source, target, type: 'payment', weight: 0.5, volume: 10, asset: 'XLM', txCount: 1, lastActivity: NOW.toISOString() })
    }
    for (let i = 0; i < clusterA.length; i++) {
      for (let j = i + 1; j < clusterA.length; j++) link(clusterA[i], clusterA[j])
    }
    for (let i = 0; i < clusterB.length; i++) {
      for (let j = i + 1; j < clusterB.length; j++) link(clusterB[i], clusterB[j])
    }
    link('a1', 'bridge')
    link('bridge', 'b1')

    const adjacency = buildAdjacency(nodes, edges)
    const centrality = computeCentrality(nodes, edges)
    const byId = new Map(centrality.map((c) => [c.nodeId, c]))
    const bridgeScore = byId.get('bridge')?.betweenness || 0
    const clusterScore = byId.get('a2')?.betweenness || 0
    expect(bridgeScore).toBeGreaterThan(clusterScore)
    expect(adjacency.undirected.get('bridge')?.length).toBe(2)
  })
})

describe('graph algorithms — community detection on fixture data', () => {
  const { nodes, edges } = buildFixtureGraph(NOW)

  it('groups the anchor and its members into an anchor-network community', () => {
    const communities = detectCommunities(nodes, edges, 3)
    const anchorMembers = byLabelPrefix(nodes, 'Anchor User').map((n) => n.id)
    const anchorCommunity = communities.find((community) =>
      anchorMembers.some((id) => community.memberIds.includes(id))
    )
    expect(anchorCommunity).toBeDefined()
    expect(anchorCommunity?.kind).toBe('anchor-network')
    expect(anchorCommunity?.memberIds.length).toBeGreaterThanOrEqual(3)
  })
})

describe('graph algorithms — pattern detection on fixture data', () => {
  const { nodes, edges } = buildFixtureGraph(NOW)
  const adjacency = buildAdjacency(nodes, edges)
  const centrality = computeCentrality(nodes, edges)

  it('detects the circular flow ring', () => {
    const matches = detectCircularFlows(nodes, edges, adjacency)
    const ringIds = new Set(byLabelPrefix(nodes, 'Ring Account').map((n) => n.id))
    const found = matches.find((match) => match.nodeIds.every((id) => ringIds.has(id)) && match.nodeIds.length === ringIds.size)
    expect(found).toBeDefined()
    expect(found?.type).toBe('circular-flow')
  })

  it('detects the dust fan-out source', () => {
    const matches = detectDustNetworks(nodes, edges)
    const dustSource = byLabel(nodes, 'Dust Spam Source')
    expect(matches.some((match) => match.nodeIds.includes(dustSource.id))).toBe(true)
  })

  it('detects the Sybil-funded cluster', () => {
    const matches = detectSybilClusters(nodes, adjacency)
    const hub = byLabel(nodes, 'Sybil Funding Hub')
    expect(matches.some((match) => match.nodeIds.includes(hub.id))).toBe(true)
  })

  it('detects the Ponzi-like fan-in/fan-out hub', () => {
    const matches = detectPonziTopology(nodes, adjacency)
    const hub = byLabel(nodes, 'HighYield Pool')
    expect(matches.some((match) => match.nodeIds.includes(hub.id))).toBe(true)
  })

  it('flags a systemic bridge account via betweenness concentration', () => {
    const matches = detectHubConcentration(nodes, centrality, { zScoreThreshold: 1.5 })
    const bridge = byLabel(nodes, 'Cross-Cluster Bridge')
    expect(matches.some((match) => match.nodeIds.includes(bridge.id))).toBe(true)
  })

  it('aggregates and filters all detectors by severity', () => {
    const all = runAllPatternDetectors(nodes, edges, centrality, 'low')
    const highOnly = runAllPatternDetectors(nodes, edges, centrality, 'high')
    expect(all.length).toBeGreaterThan(0)
    expect(highOnly.length).toBeLessThanOrEqual(all.length)
    expect(highOnly.every((match) => match.severity === 'high' || match.severity === 'critical')).toBe(true)
  })
})
