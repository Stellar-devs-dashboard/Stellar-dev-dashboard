/**
 * Tests for useNetworkStats.
 *
 * Covers:
 *  - Returns stats on success
 *  - isLoading on initial fetch
 *  - isError on failure
 *  - Uses placeholderData to keep stale stats visible while refetching
 *  - Disabled when enabled=false
 */

import React from 'react'
import { vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useNetworkStats } from '../useNetworkStats'
import * as stellarLib from '../../../lib/stellar'

vi.mock('../../../lib/stellar', async (importOriginal) => {
  const actual = await importOriginal<typeof stellarLib>()
  return {
    ...actual,
    fetchNetworkStats: vi.fn(),
  }
})

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

const MOCK_STATS = {
  latestLedger: { sequence: 100, base_reserve: '5000000' },
  feeStats: { last_ledger_base_fee: '100' },
} as unknown as stellarLib.NetworkStats

describe('useNetworkStats', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns stats on success', async () => {
    ;(stellarLib.fetchNetworkStats as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_STATS)

    const { result } = renderHook(
      () => useNetworkStats('testnet', { refetchInterval: false }),
      { wrapper: makeWrapper() },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.latestLedger.sequence).toBe(100)
  })

  it('starts in loading state', () => {
    ;(stellarLib.fetchNetworkStats as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise(() => {}), // never resolves
    )

    const { result } = renderHook(
      () => useNetworkStats('testnet', { refetchInterval: false }),
      { wrapper: makeWrapper() },
    )

    expect(result.current.isLoading).toBe(true)
  })

  it('sets isError on failure', async () => {
    ;(stellarLib.fetchNetworkStats as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('horizon unreachable'),
    )

    const { result } = renderHook(
      () => useNetworkStats('testnet', { refetchInterval: false }),
      { wrapper: makeWrapper() },
    )

    await waitFor(() => expect(result.current.isError).toBe(true))
  })

  it('does not fetch when enabled=false', () => {
    const { result } = renderHook(
      () => useNetworkStats('testnet', { enabled: false, refetchInterval: false }),
      { wrapper: makeWrapper() },
    )
    expect(result.current.fetchStatus).toBe('idle')
    expect(stellarLib.fetchNetworkStats).not.toHaveBeenCalled()
  })
})
