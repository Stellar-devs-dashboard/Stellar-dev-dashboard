import type { GraphNode, NLQueryIntent, NLQueryResult } from '../../types/networkGraph'

interface IntentRule {
  intent: NLQueryIntent
  keywords: string[]
  summary: string
}

// A lightweight keyword/pattern interpreter, not an LLM — it maps a bounded
// set of exploration intents onto the graph engine's existing query
// functions (pathfinding, centrality, community detection, pattern
// detectors). See docs/network-graph-analysis.md for accuracy methodology
// and the follow-up plan for a model-backed interpreter.
const INTENT_RULES: IntentRule[] = [
  {
    intent: 'shortest-path',
    keywords: ['path between', 'connected to', 'connection between', 'how are', 'relationship between', 'route from'],
    summary: 'Finds the shortest relationship path between two accounts.',
  },
  {
    intent: 'top-influencers',
    keywords: ['top influencer', 'most influential', 'important account', 'key account', 'hub account', 'who influences'],
    summary: 'Ranks accounts by composite influence (PageRank, betweenness, degree).',
  },
  {
    intent: 'communities',
    keywords: ['communit', 'cluster', 'anchor network', 'group of account', 'segment'],
    summary: 'Lists detected communities such as anchor networks or payment corridors.',
  },
  {
    intent: 'patterns',
    keywords: ['suspicious', 'anomal', 'circular', 'sybil', 'ponzi', 'dust attack', 'pattern', 'fraud'],
    summary: 'Surfaces detected risk patterns such as circular flows or Sybil clusters.',
  },
  {
    intent: 'neighbors',
    keywords: ['neighbor', 'connections of', 'who does', 'transacted with', 'linked to'],
    summary: 'Lists accounts directly or indirectly connected to a given account.',
  },
]

const PUBLIC_KEY_PATTERN = /G[A-Z2-7]{55}/g
const HOP_PATTERN = /(\d+)\s*-?\s*hop/i

function extractAddresses(text: string): string[] {
  const matches = text.match(PUBLIC_KEY_PATTERN)
  return matches ? Array.from(new Set(matches)) : []
}

function extractLabelReference(text: string, nodes: GraphNode[]): string | undefined {
  const lower = text.toLowerCase()
  const match = nodes.find((node) => node.label && lower.includes(node.label.toLowerCase()))
  return match?.id
}

function scoreIntent(text: string, rule: IntentRule): { matches: string[]; score: number } {
  const lower = text.toLowerCase()
  const matches = rule.keywords.filter((keyword) => lower.includes(keyword))
  // Coverage is measured against how many distinct keyword *hits* land, not
  // the size of the rule's keyword list — a single unambiguous phrase (e.g.
  // "top influencer") should already carry most of the confidence, with
  // extra matches nudging it higher.
  const score = matches.length ? Math.min(1, 0.55 + (matches.length - 1) * 0.15) : 0
  return { matches, score }
}

/**
 * Parses a natural-language exploration query into a structured intent the
 * graph engine already knows how to answer. Returns `unknown` with example
 * phrasings when no rule clears the confidence floor, so the UI can guide
 * the user rather than silently failing.
 */
export function parseGraphQuery(rawText: string, nodes: GraphNode[] = []): NLQueryResult {
  const text = rawText.trim()
  if (!text) {
    return {
      intent: 'unknown',
      confidence: 0,
      summary: 'Enter a question, e.g. "top influencers" or "path between account A and account B".',
      matchedTerms: [],
      params: {},
    }
  }

  let best: { rule: IntentRule; matches: string[]; score: number } | null = null
  for (const rule of INTENT_RULES) {
    const { matches, score } = scoreIntent(text, rule)
    if (matches.length && (!best || score > best.score)) {
      best = { rule, matches, score }
    }
  }

  if (!best) {
    return {
      intent: 'unknown',
      confidence: 0,
      summary: 'No matching intent. Try "top influencers", "communities", "suspicious patterns", or "path between X and Y".',
      matchedTerms: [],
      params: {},
    }
  }

  const addresses = extractAddresses(text)
  const params: Record<string, string | number> = {}
  const hopMatch = text.match(HOP_PATTERN)
  if (hopMatch) params.hops = Number(hopMatch[1])

  if (best.rule.intent === 'shortest-path' || best.rule.intent === 'neighbors') {
    const [first, second] = addresses.length ? addresses : []
    const labelRef = extractLabelReference(text, nodes)
    if (first) params.sourceId = first
    else if (labelRef) params.sourceId = labelRef
    if (second) params.targetId = second
  }

  // Confidence blends keyword coverage with whether the query supplied the
  // parameters (addresses, hop counts) that intent needs to actually run.
  const needsAddress = best.rule.intent === 'shortest-path' || best.rule.intent === 'neighbors'
  const hasRequiredParams = !needsAddress || Boolean(params.sourceId)
  const confidence = Number(
    Math.max(0, Math.min(0.98, best.score * 0.85 + (hasRequiredParams ? 0.15 : -0.2))).toFixed(2)
  )

  return {
    intent: best.rule.intent,
    confidence,
    summary: best.rule.summary,
    matchedTerms: best.matches,
    params,
  }
}

export const SAMPLE_QUERIES: string[] = [
  'Who are the top influencers in this network?',
  'Show me the communities and anchor networks',
  'Are there any suspicious or circular patterns?',
  'What is the path between two connected accounts?',
  'Show neighbors of the most active account',
]
