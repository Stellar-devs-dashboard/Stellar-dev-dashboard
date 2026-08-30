import type {
  CentralityScore,
  Community,
  CommunityKind,
  GraphEdge,
  GraphNode,
  PathHop,
  PathResult,
  PatternMatch,
  PatternSeverity,
} from '../../types/networkGraph'

export interface AdjacencyEntry {
  neighbor: string
  edge: GraphEdge
}

export interface Adjacency {
  /** source -> outgoing edges */
  out: Map<string, AdjacencyEntry[]>
  /** target -> incoming edges */
  in: Map<string, AdjacencyEntry[]>
  /** node -> edges in either direction, used for undirected relationship queries */
  undirected: Map<string, AdjacencyEntry[]>
}

function pushEntry(map: Map<string, AdjacencyEntry[]>, key: string, entry: AdjacencyEntry): void {
  const list = map.get(key)
  if (list) list.push(entry)
  else map.set(key, [entry])
}

export function buildAdjacency(nodes: GraphNode[], edges: GraphEdge[]): Adjacency {
  const out = new Map<string, AdjacencyEntry[]>()
  const inMap = new Map<string, AdjacencyEntry[]>()
  const undirected = new Map<string, AdjacencyEntry[]>()
  for (const node of nodes) {
    out.set(node.id, [])
    inMap.set(node.id, [])
    undirected.set(node.id, [])
  }
  for (const edge of edges) {
    if (!out.has(edge.source) || !out.has(edge.target)) continue
    pushEntry(out, edge.source, { neighbor: edge.target, edge })
    pushEntry(inMap, edge.target, { neighbor: edge.source, edge })
    pushEntry(undirected, edge.source, { neighbor: edge.target, edge })
    pushEntry(undirected, edge.target, { neighbor: edge.source, edge })
  }
  return { out, in: inMap, undirected }
}

/**
 * Breadth-first shortest path with a hop budget, so a 10-hop relationship
 * query stays bounded regardless of graph size (see docs/network-graph-analysis.md
 * for the complexity discussion behind the 5-second / 10-hop performance target).
 */
export function bfsPath(
  adjacency: Adjacency,
  sourceId: string,
  targetId: string,
  maxHops = 10
): PathResult {
  if (!adjacency.undirected.has(sourceId) || !adjacency.undirected.has(targetId)) {
    return { found: false, hops: [], totalWeight: 0, hopCount: 0, truncated: false }
  }
  if (sourceId === targetId) {
    return { found: true, hops: [{ nodeId: sourceId, edgeId: null }], totalWeight: 0, hopCount: 0, truncated: false }
  }

  const visited = new Set<string>([sourceId])
  const cameFrom = new Map<string, AdjacencyEntry>()
  let frontier: string[] = [sourceId]
  let depth = 0
  let found = false

  while (frontier.length && depth < maxHops && !found) {
    const next: string[] = []
    for (const current of frontier) {
      const neighbors = adjacency.undirected.get(current) || []
      for (const entry of neighbors) {
        if (visited.has(entry.neighbor)) continue
        visited.add(entry.neighbor)
        cameFrom.set(entry.neighbor, { neighbor: current, edge: entry.edge })
        if (entry.neighbor === targetId) {
          found = true
          break
        }
        next.push(entry.neighbor)
      }
      if (found) break
    }
    frontier = next
    depth += 1
  }

  if (!found) {
    return { found: false, hops: [], totalWeight: 0, hopCount: 0, truncated: frontier.length > 0 }
  }

  const hops: PathHop[] = []
  let cursor: string | null = targetId
  let totalWeight = 0
  while (cursor && cursor !== sourceId) {
    const step = cameFrom.get(cursor)
    if (!step) break
    hops.unshift({ nodeId: cursor, edgeId: step.edge.id })
    totalWeight += step.edge.weight
    cursor = step.neighbor
  }
  hops.unshift({ nodeId: sourceId, edgeId: null })

  return { found: true, hops, totalWeight: Number(totalWeight.toFixed(4)), hopCount: hops.length - 1, truncated: false }
}

/** All nodes reachable from `sourceId` within `hops` steps (undirected). */
export function kHopNeighborhood(adjacency: Adjacency, sourceId: string, hops: number): Set<string> {
  const visited = new Set<string>([sourceId])
  let frontier = [sourceId]
  for (let depth = 0; depth < hops && frontier.length; depth++) {
    const next: string[] = []
    for (const current of frontier) {
      for (const entry of adjacency.undirected.get(current) || []) {
        if (!visited.has(entry.neighbor)) {
          visited.add(entry.neighbor)
          next.push(entry.neighbor)
        }
      }
    }
    frontier = next
  }
  return visited
}

export function degreeCentrality(nodes: GraphNode[], adjacency: Adjacency): Map<string, { degree: number; weightedDegree: number }> {
  const result = new Map<string, { degree: number; weightedDegree: number }>()
  for (const node of nodes) {
    const edges = adjacency.undirected.get(node.id) || []
    const weighted = edges.reduce((sum, entry) => sum + entry.edge.weight, 0)
    result.set(node.id, { degree: edges.length, weightedDegree: Number(weighted.toFixed(4)) })
  }
  return result
}

/**
 * Weighted PageRank via power iteration. Dangling nodes (no outgoing edges)
 * redistribute their rank uniformly so total probability mass is conserved.
 */
export function pageRank(
  nodes: GraphNode[],
  adjacency: Adjacency,
  options: { damping?: number; iterations?: number; tolerance?: number } = {}
): Map<string, number> {
  const damping = options.damping ?? 0.85
  const maxIterations = options.iterations ?? 60
  const tolerance = options.tolerance ?? 1e-6
  const n = nodes.length
  if (n === 0) return new Map()

  const ids = nodes.map((node) => node.id)
  let ranks = new Map(ids.map((id) => [id, 1 / n]))

  const outWeight = new Map<string, number>()
  for (const id of ids) {
    const total = (adjacency.out.get(id) || []).reduce((sum, entry) => sum + Math.max(entry.edge.weight, 0.0001), 0)
    outWeight.set(id, total)
  }

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    let danglingMass = 0
    for (const id of ids) {
      const outgoing = adjacency.out.get(id) || []
      if (outgoing.length === 0) danglingMass += ranks.get(id) || 0
    }

    const next = new Map<string, number>()
    const base = (1 - damping) / n + (damping * danglingMass) / n
    for (const id of ids) next.set(id, base)

    for (const id of ids) {
      const rank = ranks.get(id) || 0
      const outgoing = adjacency.out.get(id) || []
      const total = outWeight.get(id) || 0
      if (!outgoing.length || total <= 0) continue
      for (const entry of outgoing) {
        const share = Math.max(entry.edge.weight, 0.0001) / total
        next.set(entry.neighbor, (next.get(entry.neighbor) || 0) + damping * rank * share)
      }
    }

    let delta = 0
    for (const id of ids) delta += Math.abs((next.get(id) || 0) - (ranks.get(id) || 0))
    ranks = next
    if (delta < tolerance) break
  }

  return ranks
}

/**
 * Unweighted Brandes' betweenness centrality over the undirected relationship
 * graph (bridge/intermediary importance does not depend on payment direction).
 * O(V*E) — appropriate for the interactive, filtered subgraphs this dashboard
 * renders; see docs for the scale-out plan for full-network batch runs.
 */
export function betweennessCentrality(nodes: GraphNode[], adjacency: Adjacency): Map<string, number> {
  const scores = new Map<string, number>(nodes.map((node) => [node.id, 0]))
  const ids = nodes.map((node) => node.id)

  for (const source of ids) {
    const stack: string[] = []
    const predecessors = new Map<string, string[]>(ids.map((id) => [id, []]))
    const sigma = new Map<string, number>(ids.map((id) => [id, 0]))
    const distance = new Map<string, number>(ids.map((id) => [id, -1]))
    sigma.set(source, 1)
    distance.set(source, 0)
    const queue: string[] = [source]

    while (queue.length) {
      const current = queue.shift() as string
      stack.push(current)
      for (const entry of adjacency.undirected.get(current) || []) {
        const w = entry.neighbor
        if (distance.get(w) === -1) {
          distance.set(w, (distance.get(current) || 0) + 1)
          queue.push(w)
        }
        if (distance.get(w) === (distance.get(current) || 0) + 1) {
          sigma.set(w, (sigma.get(w) || 0) + (sigma.get(current) || 0))
          predecessors.get(w)?.push(current)
        }
      }
    }

    const delta = new Map<string, number>(ids.map((id) => [id, 0]))
    while (stack.length) {
      const w = stack.pop() as string
      for (const v of predecessors.get(w) || []) {
        const contribution = ((sigma.get(v) || 0) / (sigma.get(w) || 1)) * (1 + (delta.get(w) || 0))
        delta.set(v, (delta.get(v) || 0) + contribution)
      }
      if (w !== source) scores.set(w, (scores.get(w) || 0) + (delta.get(w) || 0))
    }
  }

  // Undirected graphs are visited from both endpoints, so normalize by /2.
  for (const id of ids) scores.set(id, (scores.get(id) || 0) / 2)
  return scores
}

export function computeCentrality(nodes: GraphNode[], edges: GraphEdge[]): CentralityScore[] {
  const adjacency = buildAdjacency(nodes, edges)
  const degree = degreeCentrality(nodes, adjacency)
  const rank = pageRank(nodes, adjacency)
  const betweenness = betweennessCentrality(nodes, adjacency)

  const maxBetweenness = Math.max(1e-9, ...Array.from(betweenness.values()))
  const maxDegree = Math.max(1, ...Array.from(degree.values()).map((d) => d.degree))
  const maxRank = Math.max(1e-9, ...Array.from(rank.values()))

  return nodes
    .map((node) => {
      const d = degree.get(node.id) || { degree: 0, weightedDegree: 0 }
      const pr = rank.get(node.id) || 0
      const bc = betweenness.get(node.id) || 0
      const compositeInfluence =
        0.45 * (pr / maxRank) + 0.3 * (bc / maxBetweenness) + 0.25 * (d.degree / maxDegree)
      return {
        nodeId: node.id,
        degree: d.degree,
        weightedDegree: d.weightedDegree,
        pageRank: Number(pr.toFixed(6)),
        betweenness: Number(bc.toFixed(4)),
        compositeInfluence: Number(compositeInfluence.toFixed(4)),
      }
    })
    .sort((a, b) => b.compositeInfluence - a.compositeInfluence)
}

/**
 * Synchronous label propagation community detection (Raghavan, Albert & Kumar
 * 2007). Near-linear time, so it scales far better than modularity-maximizing
 * alternatives like Louvain on large, sparse Stellar activity graphs.
 */
export function labelPropagationCommunities(
  nodes: GraphNode[],
  adjacency: Adjacency,
  maxIterations = 20
): Map<string, string> {
  const labels = new Map<string, string>(nodes.map((node) => [node.id, node.id]))
  const ids = nodes.map((node) => node.id)
  if (!ids.length) return labels

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    let changed = false
    // Deterministic order (sorted ids) keeps results reproducible for tests.
    for (const id of [...ids].sort()) {
      const neighbors = adjacency.undirected.get(id) || []
      if (!neighbors.length) continue
      const weightByLabel = new Map<string, number>()
      for (const entry of neighbors) {
        const label = labels.get(entry.neighbor)
        if (!label) continue
        weightByLabel.set(label, (weightByLabel.get(label) || 0) + Math.max(entry.edge.weight, 0.0001))
      }
      let bestLabel = labels.get(id) as string
      let bestWeight = weightByLabel.get(bestLabel) || 0
      for (const [label, weight] of weightByLabel) {
        if (weight > bestWeight || (weight === bestWeight && label < bestLabel)) {
          bestLabel = label
          bestWeight = weight
        }
      }
      if (bestLabel !== labels.get(id)) {
        labels.set(id, bestLabel)
        changed = true
      }
    }
    if (!changed) break
  }
  return labels
}

function classifyCommunity(memberIds: string[], nodes: Map<string, GraphNode>, edges: GraphEdge[]): CommunityKind {
  const members = memberIds.map((id) => nodes.get(id)).filter((n): n is GraphNode => Boolean(n))
  const hasAnchor = members.some((n) => n.type === 'anchor' || n.type === 'issuer')
  const trustlineShare =
    edges.filter((e) => e.type === 'trustline').length / Math.max(1, edges.length)
  if (hasAnchor && trustlineShare > 0.2) return 'anchor-network'

  const hasLiquidityPool = members.some((n) => n.type === 'liquidity-pool')
  const offerShare = edges.filter((e) => e.type === 'offer').length / Math.max(1, edges.length)
  if (hasLiquidityPool || offerShare > 0.3) return 'liquidity-cluster'

  const avgTxCount = members.reduce((sum, n) => sum + n.txCount, 0) / Math.max(1, members.length)
  const createdTimes = members.map((n) => new Date(n.createdAt).getTime()).filter((t) => !Number.isNaN(t))
  const span = createdTimes.length > 1 ? Math.max(...createdTimes) - Math.min(...createdTimes) : Infinity
  const dense = edges.length / Math.max(1, (members.length * (members.length - 1)) / 2)
  if (members.length >= 4 && avgTxCount < 5 && span < 1000 * 60 * 60 * 24 * 3 && dense > 0.4) {
    return 'sybil-suspect'
  }

  const paymentShare = edges.filter((e) => e.type === 'payment' || e.type === 'path-payment').length / Math.max(1, edges.length)
  if (paymentShare > 0.6 && members.length >= 3) return 'payment-corridor'

  return 'general'
}

export function detectCommunities(
  nodes: GraphNode[],
  edges: GraphEdge[],
  minCommunitySize = 3
): Community[] {
  const adjacency = buildAdjacency(nodes, edges)
  const labels = labelPropagationCommunities(nodes, adjacency)
  const nodeById = new Map(nodes.map((node) => [node.id, node]))

  const groups = new Map<string, string[]>()
  for (const [nodeId, label] of labels) {
    const list = groups.get(label)
    if (list) list.push(nodeId)
    else groups.set(label, [nodeId])
  }

  const communities: Community[] = []
  for (const [label, memberIds] of groups) {
    if (memberIds.length < minCommunitySize) continue
    const memberSet = new Set(memberIds)
    const internalEdges = edges.filter((e) => memberSet.has(e.source) && memberSet.has(e.target))
    const externalEdges = edges.filter(
      (e) => (memberSet.has(e.source)) !== (memberSet.has(e.target))
    ).filter((e) => memberSet.has(e.source) || memberSet.has(e.target))
    const maxPossible = (memberIds.length * (memberIds.length - 1)) / 2
    const density = maxPossible > 0 ? internalEdges.length / maxPossible : 0
    const avgInternalWeight = internalEdges.length
      ? internalEdges.reduce((sum, e) => sum + e.weight, 0) / internalEdges.length
      : 0
    const kind = classifyCommunity(memberIds, nodeById, internalEdges)
    const representative = nodeById.get(label)?.label || nodeById.get(memberIds[0])?.label || label
    communities.push({
      id: `community-${label}`,
      kind,
      label: `${kindLabel(kind)} · ${representative}`,
      memberIds: memberIds.sort(),
      internalEdgeCount: internalEdges.length,
      externalEdgeCount: externalEdges.length,
      density: Number(density.toFixed(4)),
      avgInternalWeight: Number(avgInternalWeight.toFixed(4)),
    })
  }

  return communities.sort((a, b) => b.memberIds.length - a.memberIds.length)
}

function kindLabel(kind: CommunityKind): string {
  switch (kind) {
    case 'anchor-network':
      return 'Anchor network'
    case 'payment-corridor':
      return 'Payment corridor'
    case 'liquidity-cluster':
      return 'Liquidity cluster'
    case 'sybil-suspect':
      return 'Sybil-suspect cluster'
    default:
      return 'Community'
  }
}

function cycleId(nodeIds: string[]): string {
  // Rotate to start at the lexicographically smallest node so equivalent
  // rotations of the same cycle produce the same id.
  let smallestIndex = 0
  for (let i = 1; i < nodeIds.length; i++) {
    if (nodeIds[i] < nodeIds[smallestIndex]) smallestIndex = i
  }
  const rotated = [...nodeIds.slice(smallestIndex), ...nodeIds.slice(0, smallestIndex)]
  return rotated.join('>')
}

/**
 * DFS-based directed cycle search bounded to `maxLength`, filtered to cycles
 * whose edge amounts stay within `amountTolerance` of each other — the
 * signature of value moving in a loop rather than an incidental short cycle.
 */
export function detectCircularFlows(
  nodes: GraphNode[],
  edges: GraphEdge[],
  adjacency: Adjacency,
  options: { maxLength?: number; amountTolerance?: number } = {}
): PatternMatch[] {
  const maxLength = options.maxLength ?? 6
  const amountTolerance = options.amountTolerance ?? 0.15
  const seen = new Set<string>()
  const matches: PatternMatch[] = []

  function amountsAligned(cycleEdges: GraphEdge[]): boolean {
    if (cycleEdges.length < 2) return false
    const amounts = cycleEdges.map((e) => e.volume)
    const max = Math.max(...amounts)
    const min = Math.min(...amounts)
    if (max <= 0) return false
    return (max - min) / max <= amountTolerance
  }

  function dfs(start: string, current: string, path: string[], pathEdges: GraphEdge[], visited: Set<string>): void {
    if (path.length > maxLength) return
    for (const entry of adjacency.out.get(current) || []) {
      if (entry.neighbor === start && path.length >= 3) {
        const id = cycleId(path)
        if (!seen.has(id)) {
          seen.add(id)
          const cycleEdges = [...pathEdges, entry.edge]
          if (amountsAligned(cycleEdges)) {
            const totalVolume = cycleEdges.reduce((sum, e) => sum + e.volume, 0)
            matches.push({
              id: `circular-${id}`,
              type: 'circular-flow',
              severity: path.length <= 4 ? 'high' : 'medium',
              title: `Circular fund flow across ${path.length} accounts`,
              description:
                'Value moves through a closed loop of accounts with near-equal amounts, a common layering pattern used to obscure the origin of funds.',
              nodeIds: [...path],
              edgeIds: cycleEdges.map((e) => e.id),
              confidence: Number(Math.min(0.95, 0.55 + (1 - (path.length - 3) * 0.08)).toFixed(2)),
              evidence: [
                `${path.length}-hop loop back to the starting account`,
                `Total volume in loop: ${totalVolume.toFixed(2)}`,
                `Amount variance within ${Math.round(amountTolerance * 100)}% tolerance`,
              ],
            })
          }
        }
        continue
      }
      if (visited.has(entry.neighbor)) continue
      visited.add(entry.neighbor)
      dfs(start, entry.neighbor, [...path, entry.neighbor], [...pathEdges, entry.edge], visited)
      visited.delete(entry.neighbor)
    }
  }

  for (const node of nodes) {
    dfs(node.id, node.id, [node.id], [], new Set([node.id]))
  }

  return matches
}

export function detectDustNetworks(
  nodes: GraphNode[],
  edges: GraphEdge[],
  options: { dustThreshold?: number; minFanout?: number } = {}
): PatternMatch[] {
  const dustThreshold = options.dustThreshold ?? 0.01
  const minFanout = options.minFanout ?? 5
  const bySource = new Map<string, GraphEdge[]>()
  for (const edge of edges) {
    if (edge.type !== 'payment' || edge.volume > dustThreshold) continue
    const list = bySource.get(edge.source)
    if (list) list.push(edge)
    else bySource.set(edge.source, [edge])
  }

  const nodeById = new Map(nodes.map((n) => [n.id, n]))
  const matches: PatternMatch[] = []
  for (const [source, dustEdges] of bySource) {
    const distinctTargets = new Set(dustEdges.map((e) => e.target))
    if (distinctTargets.size < minFanout) continue
    matches.push({
      id: `dust-${source}`,
      type: 'dust-network',
      severity: distinctTargets.size >= minFanout * 2 ? 'high' : 'medium',
      title: `Dust attack fan-out from ${nodeById.get(source)?.label || source}`,
      description:
        'A single account sends many near-zero payments to distinct accounts, a pattern used to seed address books for spam or phishing follow-ups.',
      nodeIds: [source, ...Array.from(distinctTargets)],
      edgeIds: dustEdges.map((e) => e.id),
      confidence: Number(Math.min(0.92, 0.5 + distinctTargets.size * 0.03).toFixed(2)),
      evidence: [
        `${distinctTargets.size} distinct recipients`,
        `All payments below ${dustThreshold} in volume`,
      ],
    })
  }
  return matches
}

export function detectSybilClusters(
  nodes: GraphNode[],
  adjacency: Adjacency,
  options: { minClusterSize?: number; maxCreationSpanMs?: number; maxTxCount?: number } = {}
): PatternMatch[] {
  const minClusterSize = options.minClusterSize ?? 4
  const maxCreationSpanMs = options.maxCreationSpanMs ?? 1000 * 60 * 60 * 24 * 3
  const maxTxCount = options.maxTxCount ?? 6
  const nodeById = new Map(nodes.map((n) => [n.id, n]))
  const matches: PatternMatch[] = []

  for (const hub of nodes) {
    const candidates = (adjacency.out.get(hub.id) || [])
      .map((entry) => nodeById.get(entry.neighbor))
      .filter((n): n is GraphNode => Boolean(n) && n.txCount <= maxTxCount)
    if (candidates.length < minClusterSize) continue

    const created = candidates.map((n) => new Date(n.createdAt).getTime()).filter((t) => !Number.isNaN(t))
    if (!created.length) continue
    const span = Math.max(...created) - Math.min(...created)
    if (span > maxCreationSpanMs) continue

    const mutualLinks = candidates.filter((candidate) =>
      (adjacency.undirected.get(candidate.id) || []).some((entry) =>
        candidates.some((other) => other.id === entry.neighbor)
      )
    )
    const density = mutualLinks.length / candidates.length
    if (density < 0.3) continue

    matches.push({
      id: `sybil-${hub.id}`,
      type: 'sybil-cluster',
      severity: candidates.length >= minClusterSize * 2 ? 'critical' : 'high',
      title: `Likely Sybil cluster funded by ${hub.label}`,
      description:
        'A group of low-activity accounts created within a short window, funded by the same account and densely interconnected — consistent with fake-account networks used to manipulate votes, airdrops, or liquidity metrics.',
      nodeIds: [hub.id, ...candidates.map((c) => c.id)],
      edgeIds: [],
      confidence: Number(Math.min(0.9, 0.5 + density * 0.4).toFixed(2)),
      evidence: [
        `${candidates.length} low-activity accounts (≤${maxTxCount} transactions)`,
        `Created within ${Math.round(span / (1000 * 60 * 60))}h of each other`,
        `${Math.round(density * 100)}% mutually interconnected`,
      ],
    })
  }

  return matches
}

export function detectPonziTopology(
  nodes: GraphNode[],
  adjacency: Adjacency,
  options: { minInDegree?: number; fanInRatio?: number; payoutRatio?: number } = {}
): PatternMatch[] {
  const minInDegree = options.minInDegree ?? 6
  const fanInRatio = options.fanInRatio ?? 3
  const payoutRatio = options.payoutRatio ?? 1.5
  const nodeById = new Map(nodes.map((n) => [n.id, n]))
  const matches: PatternMatch[] = []

  for (const node of nodes) {
    const incoming = adjacency.in.get(node.id) || []
    const outgoing = adjacency.out.get(node.id) || []
    if (incoming.length < minInDegree) continue
    if (incoming.length < outgoing.length * fanInRatio) continue

    const avgIn = incoming.reduce((sum, e) => sum + e.edge.volume, 0) / Math.max(1, incoming.length)
    const avgOut = outgoing.length
      ? outgoing.reduce((sum, e) => sum + e.edge.volume, 0) / outgoing.length
      : 0
    if (avgOut < avgIn * payoutRatio) continue

    matches.push({
      id: `ponzi-${node.id}`,
      type: 'ponzi-topology',
      severity: incoming.length >= minInDegree * 2 ? 'critical' : 'high',
      title: `Ponzi-like topology around ${nodeById.get(node.id)?.label || node.id}`,
      description:
        'Many accounts feed small amounts into this account while a few large payouts flow back out — the fan-in/fan-out and amount-ratio signature associated with Ponzi and referral-scheme graph topology.',
      nodeIds: [node.id, ...incoming.map((e) => e.neighbor), ...outgoing.map((e) => e.neighbor)],
      edgeIds: [...incoming.map((e) => e.edge.id), ...outgoing.map((e) => e.edge.id)],
      confidence: Number(Math.min(0.88, 0.45 + incoming.length * 0.02).toFixed(2)),
      evidence: [
        `${incoming.length} inbound counterparties vs ${outgoing.length} outbound`,
        `Average payout ${avgOut.toFixed(2)} vs average contribution ${avgIn.toFixed(2)}`,
      ],
    })
  }

  return matches
}

export function detectHubConcentration(
  nodes: GraphNode[],
  centrality: CentralityScore[],
  options: { zScoreThreshold?: number } = {}
): PatternMatch[] {
  const zScoreThreshold = options.zScoreThreshold ?? 2
  const nodeById = new Map(nodes.map((n) => [n.id, n]))
  const values = centrality.map((c) => c.betweenness)
  const mean = values.reduce((sum, v) => sum + v, 0) / Math.max(1, values.length)
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / Math.max(1, values.length)
  const stdDev = Math.sqrt(variance)
  if (stdDev === 0) return []

  const matches: PatternMatch[] = []
  for (const score of centrality) {
    const z = (score.betweenness - mean) / stdDev
    if (z < zScoreThreshold) continue
    matches.push({
      id: `hub-${score.nodeId}`,
      type: 'hub-concentration',
      severity: z >= zScoreThreshold * 2 ? 'critical' : 'high',
      title: `Systemic bridge account: ${nodeById.get(score.nodeId)?.label || score.nodeId}`,
      description:
        'This account sits on a disproportionate share of shortest paths between other accounts. If it were removed or compromised, many relationships in the network would be disconnected — a single point of failure.',
      nodeIds: [score.nodeId],
      edgeIds: [],
      confidence: Number(Math.min(0.95, 0.6 + z * 0.08).toFixed(2)),
      evidence: [
        `Betweenness z-score ${z.toFixed(2)} (threshold ${zScoreThreshold})`,
        `Degree ${score.degree}, PageRank ${(score.pageRank * 100).toFixed(2)}%`,
      ],
    })
  }
  return matches
}

const SEVERITY_RANK: Record<PatternSeverity, number> = { low: 0, medium: 1, high: 2, critical: 3 }

export function runAllPatternDetectors(
  nodes: GraphNode[],
  edges: GraphEdge[],
  centrality: CentralityScore[],
  minSeverity: PatternSeverity = 'low'
): PatternMatch[] {
  const adjacency = buildAdjacency(nodes, edges)
  const all = [
    ...detectCircularFlows(nodes, edges, adjacency),
    ...detectDustNetworks(nodes, edges),
    ...detectSybilClusters(nodes, adjacency),
    ...detectPonziTopology(nodes, adjacency),
    ...detectHubConcentration(nodes, centrality),
  ]
  return all
    .filter((match) => SEVERITY_RANK[match.severity] >= SEVERITY_RANK[minSeverity])
    .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.confidence - a.confidence)
}
