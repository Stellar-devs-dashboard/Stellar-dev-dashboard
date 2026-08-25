import { describe, expect, it } from 'vitest'
import { parseGraphQuery, SAMPLE_QUERIES } from '../nlQuery'
import { buildFixtureGraph } from '../fixtures'

const { nodes } = buildFixtureGraph(new Date('2026-08-21T16:00:00.000Z'))

describe('natural language graph query parser', () => {
  it('recognizes top-influencer questions', () => {
    const result = parseGraphQuery('Who are the top influencers in this network?')
    expect(result.intent).toBe('top-influencers')
    expect(result.confidence).toBeGreaterThan(0.5)
  })

  it('recognizes community questions', () => {
    const result = parseGraphQuery('Show me the communities and anchor networks')
    expect(result.intent).toBe('communities')
  })

  it('recognizes pattern/anomaly questions', () => {
    const result = parseGraphQuery('Are there any suspicious circular patterns?')
    expect(result.intent).toBe('patterns')
  })

  it('extracts two addresses for a shortest-path question', () => {
    const [a, b] = nodes.slice(0, 2).map((n) => n.id)
    const result = parseGraphQuery(`What is the path between ${a} and ${b}?`)
    expect(result.intent).toBe('shortest-path')
    expect(result.params.sourceId).toBe(a)
    expect(result.confidence).toBeGreaterThan(0.5)
  })

  it('extracts a hop count when present', () => {
    const result = parseGraphQuery('Show neighbors within 3 hops')
    expect(result.params.hops).toBe(3)
  })

  it('returns unknown with example queries for unrelated text', () => {
    const result = parseGraphQuery('what is the weather today')
    expect(result.intent).toBe('unknown')
    expect(result.confidence).toBe(0)
  })

  it('returns unknown for empty input', () => {
    const result = parseGraphQuery('   ')
    expect(result.intent).toBe('unknown')
  })

  it('resolves every documented sample query to a known intent', () => {
    for (const sample of SAMPLE_QUERIES) {
      const result = parseGraphQuery(sample, nodes)
      expect(result.intent).not.toBe('unknown')
    }
  })
})
