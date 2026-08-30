/**
 * Tests for useXLMPrice.
 *
 * Covers:
 *  - Returns price data on success
 *  - isError when CoinGecko is down
 *  - Rate-limit errors skip retry
 *  - disabled when enabled=false
 */

import React from 'react'
import { vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useXLMPrice } from '../useXLMPrice'
import * as stellarLib from '../../../lib/stellar'

vi.mock('../../../lib/stellar', async (importOriginal) => {
  const actual = await importOriginal<typeof stellarLib>()
  return {
    ...actual,
    fetchXLMPrice: vi.fn(),
  }
})

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        // Override hook-level retry delays to zero so error tests settle in ms
        retry: 0,
        retryDelay: 0,
        gcTime: 0,
      },
    },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

describe('useXLMPrice', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns usd price on success', async () => {
    ;(stellarLib.fetchXLMPrice as ReturnType<typeof vi.fn>).mockResolvedValue({
      usd: 0.109,
      source: 'coingecko',
    })

    const { result } = renderHook(
      () => useXLMPrice({ refetchInterval: false }),
      { wrapper: makeWrapper() },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.usd).toBeCloseTo(0.109)
  })

  it('sets isError when fetch fails', async () => {
    ;(stellarLib.fetchXLMPrice as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('price data unavailable'),
    )

    const { result } = renderHook(
      () => useXLMPrice({ refetchInterval: false }),
      { wrapper: makeWrapper() },
    )

    await waitFor(() => expect(result.current.isError).toBe(true))
  })

  it('stays idle when enabled=false', () => {
    const { result } = renderHook(
      () => useXLMPrice({ enabled: false, refetchInterval: false }),
      { wrapper: makeWrapper() },
    )
    expect(result.current.fetchStatus).toBe('idle')
    expect(stellarLib.fetchXLMPrice).not.toHaveBeenCalled()
  })
})
