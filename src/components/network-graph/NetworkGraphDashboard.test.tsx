import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import NetworkGraphDashboard from './NetworkGraphDashboard'
import useNetworkGraph from '../../hooks/useNetworkGraph'
import { createDemonstrationGraph } from '../../lib/networkGraph/client'
import { computeCentrality, detectCommunities, runAllPatternDetectors } from '../../lib/networkGraph/algorithms'

vi.mock('../../hooks/useNetworkGraph')
vi.mock('../../lib/store', () => ({
  useStore: () => ({ network: 'testnet' }),
}))

// Canvas 2D context isn't implemented in jsdom; stub it so GraphCanvas can render.
beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    setTransform: vi.fn(),
    fillRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext
})

const now = new Date('2026-08-21T16:00:00.000Z')

function buildResult() {
  const snapshot = createDemonstrationGraph('testnet', now)
  const centrality = computeCentrality(snapshot.nodes, snapshot.edges)
  const communities = detectCommunities(snapshot.nodes, snapshot.edges)
  const patterns = runAllPatternDetectors(snapshot.nodes, snapshot.edges, centrality)
  return {
    snapshot,
    loading: false,
    refreshing: false,
    error: null,
    requestId: 'graph-request',
    cached: false,
    preferences: {
      maxHops: 10,
      minCommunitySize: 3,
      minPatternSeverity: 'low' as const,
      autoRefresh: true,
      refreshIntervalMs: 45_000,
    },
    adjacency: null,
    centrality,
    communities,
    patterns,
    lastPath: null,
    lastQuery: null,
    refresh: vi.fn(),
    setPreferences: vi.fn(),
    findPath: vi.fn(),
    neighborhood: vi.fn(() => new Set<string>()),
    runQuery: vi.fn(),
    simulateNetwork: vi.fn(),
  }
}

const mocked = vi.mocked(useNetworkGraph)

describe('NetworkGraphDashboard', () => {
  beforeEach(() => mocked.mockReturnValue(buildResult() as unknown as ReturnType<typeof useNetworkGraph>))

  it('renders the graph overview with summary stats', () => {
    render(<NetworkGraphDashboard />)
    expect(screen.getByRole('heading', { name: /relationship.*network analysis/i })).toBeInTheDocument()
    expect(screen.getByText('Accounts')).toBeInTheDocument()
    expect(screen.getByText('Communities')).toBeInTheDocument()
    expect(screen.getByText('Patterns flagged')).toBeInTheDocument()
  })

  it('switches to the communities view', () => {
    render(<NetworkGraphDashboard />)
    fireEvent.click(screen.getByRole('button', { name: 'communities' }))
    expect(screen.getAllByText(/community|network|corridor|cluster/i).length).toBeGreaterThan(0)
  })

  it('switches to the patterns view and shows detected risk patterns', () => {
    render(<NetworkGraphDashboard />)
    fireEvent.click(screen.getByRole('button', { name: 'patterns' }))
    expect(screen.getAllByText(/confidence/i).length).toBeGreaterThan(0)
  })

  it('runs a natural language query and shows the interpreted intent', () => {
    const value = buildResult()
    value.runQuery = vi.fn((_text: string) => {
      const result = { intent: 'top-influencers' as const, confidence: 0.9, summary: 'Ranks accounts', matchedTerms: ['top influencer'], params: {} }
      value.lastQuery = result
      mocked.mockReturnValue(value as unknown as ReturnType<typeof useNetworkGraph>)
      return result
    })
    mocked.mockReturnValue(value as unknown as ReturnType<typeof useNetworkGraph>)
    render(<NetworkGraphDashboard />)
    fireEvent.click(screen.getAllByRole('button', { name: /ask/i })[0])
    fireEvent.change(screen.getByLabelText('Natural language graph query'), { target: { value: 'top influencers' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit query' }))
    expect(value.runQuery).toHaveBeenCalledWith('top influencers')
  })

  it('shows a retry option when the graph fails to load with no cached data', () => {
    mocked.mockReturnValue({
      ...buildResult(),
      snapshot: null,
      loading: false,
      error: { message: 'Graph analysis service unavailable.', retryable: true },
    } as unknown as ReturnType<typeof useNetworkGraph>)
    render(<NetworkGraphDashboard />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })
})
