export type GraphNodeType = 'account' | 'anchor' | 'issuer' | 'contract' | 'liquidity-pool'

export type GraphEdgeType =
  | 'payment'
  | 'trustline'
  | 'contract-invoke'
  | 'path-payment'
  | 'offer'
  | 'create-account'

export type GraphDataState = 'live' | 'degraded' | 'offline' | 'simulation'

export interface GraphNode {
  id: string
  label: string
  type: GraphNodeType
  createdAt: string
  txCount: number
  tags: string[]
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  type: GraphEdgeType
  weight: number
  volume: number
  asset: string
  txCount: number
  lastActivity: string
}

export interface GraphSummary {
  nodeCount: number
  edgeCount: number
  communityCount: number
  patternCount: number
  dataFreshnessSeconds: number
  modelVersion: string
}

export interface GraphSnapshot {
  generatedAt: string
  state: GraphDataState
  network: string
  summary: GraphSummary
  nodes: GraphNode[]
  edges: GraphEdge[]
  caveats: string[]
  methodologyVersion: string
}

export interface CentralityScore {
  nodeId: string
  degree: number
  weightedDegree: number
  pageRank: number
  betweenness: number
  compositeInfluence: number
}

export type CommunityKind =
  | 'anchor-network'
  | 'payment-corridor'
  | 'liquidity-cluster'
  | 'sybil-suspect'
  | 'general'

export interface Community {
  id: string
  kind: CommunityKind
  label: string
  memberIds: string[]
  internalEdgeCount: number
  externalEdgeCount: number
  density: number
  avgInternalWeight: number
}

export type PatternType =
  | 'circular-flow'
  | 'dust-network'
  | 'sybil-cluster'
  | 'ponzi-topology'
  | 'hub-concentration'

export type PatternSeverity = 'low' | 'medium' | 'high' | 'critical'

export interface PatternMatch {
  id: string
  type: PatternType
  severity: PatternSeverity
  title: string
  description: string
  nodeIds: string[]
  edgeIds: string[]
  confidence: number
  evidence: string[]
}

export interface PathHop {
  nodeId: string
  edgeId: string | null
}

export interface PathResult {
  found: boolean
  hops: PathHop[]
  totalWeight: number
  hopCount: number
  truncated: boolean
}

export type NLQueryIntent =
  | 'shortest-path'
  | 'top-influencers'
  | 'communities'
  | 'patterns'
  | 'neighbors'
  | 'unknown'

export interface NLQueryResult {
  intent: NLQueryIntent
  confidence: number
  summary: string
  matchedTerms: string[]
  params: Record<string, string | number>
}

export interface GraphAnalysisPreferences {
  maxHops: number
  minCommunitySize: number
  minPatternSeverity: PatternSeverity
  autoRefresh: boolean
  refreshIntervalMs: number
}

export interface GraphApiError {
  code: 'timeout' | 'unavailable' | 'invalid-response' | 'rate-limited' | 'aborted'
  message: string
  retryable: boolean
  requestId?: string
}

export interface GraphSnapshotResponse {
  data: GraphSnapshot
  requestId: string
  cached: boolean
}
