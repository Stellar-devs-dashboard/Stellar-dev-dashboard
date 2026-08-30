/**
 * Tests for useTransactions and useInfiniteTransactions.
 *
 * Covers:
 *  - useTransactions: returns data, loading, error
 *  - useInfiniteTransactions: initial page, fetchNextPage, hasNextPage
 *  - flattenTransactionPages utility
 *  - disabled when address is empty
 */

import React from 'react'
import { vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  useTransactions,
  useInfiniteTransactions,
  flattenTransactionPages,
} from '../useTransactions'
import * as stellarLib from '../../../lib/stellar'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

const MOCK_ADDRESS = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN'
const MOCK_NETWORK = 'testnet' as const

function makePage(
  count: number,
  startIndex = 0,
  hasMore = false,
) {
  const records = Array.from({ length: count }, (_, i) => ({
    id: `tx-${startIndex + i}`,
    paging_token: `cursor-${startIndex + i}`,
    hash: `hash-${startIndex + i}`,
  })) as unknown as typeof stellarLib.fetchTransactions extends (...args: any[]) => Promise<infer T>
    ? T extends { records: infer R } ? R : never
    : never

  return {
    records,
    nextCursor: hasMore ? `cursor-${startIndex + count - 1}` : null,
    hasMore,
  }
}

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../../lib/stellar', async (importOriginal) => {
  const actual = await importOriginal<typeof stellarLib>()
  return {
    ...actual,
    fetchTransactions: vi.fn(),
  }
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useTransactions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns records on success', async () => {
    ;(stellarLib.fetchTransactions as ReturnType<typeof vi.fn>).mockResolvedValue(
      makePage(5),
    )

    const { result } = renderHook(
      () => useTransactions(MOCK_ADDRESS, MOCK_NETWORK, 5),
      { wrapper: makeWrapper() },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.records).toHaveLength(5)
    expect(result.current.data?.hasMore).toBe(false)
  })

  it('sets isError on failure', async () => {
    ;(stellarLib.fetchTransactions as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('horizon down'),
    )

    const { result } = renderHook(
      () => useTransactions(MOCK_ADDRESS, MOCK_NETWORK),
      { wrapper: makeWrapper() },
    )

    await waitFor(() => expect(result.current.isError).toBe(true))
  })

  it('stays idle when address is empty', () => {
    const { result } = renderHook(
      () => useTransactions('', MOCK_NETWORK),
      { wrapper: makeWrapper() },
    )
    expect(result.current.fetchStatus).toBe('idle')
    expect(stellarLib.fetchTransactions).not.toHaveBeenCalled()
  })
})

describe('useInfiniteTransactions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('loads the first page', async () => {
    ;(stellarLib.fetchTransactions as ReturnType<typeof vi.fn>).mockResolvedValue(
      makePage(10, 0, true),
    )

    const { result } = renderHook(
      () => useInfiniteTransactions(MOCK_ADDRESS, MOCK_NETWORK, 10),
      { wrapper: makeWrapper() },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.pages[0].records).toHaveLength(10)
    expect(result.current.hasNextPage).toBe(true)
  })

  it('fetches the next page on fetchNextPage()', async () => {
    const page1 = makePage(10, 0, true)
    const page2 = makePage(5, 10, false)

    ;(stellarLib.fetchTransactions as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(page1)
      .mockResolvedValueOnce(page2)

    // Use a single shared client for this test so both hook renders share cache
    const client = new QueryClient({
      defaultOptions: { queries: { retry: 0, gcTime: 0 } },
    })
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )

    const { result } = renderHook(
      () => useInfiniteTransactions(MOCK_ADDRESS, MOCK_NETWORK, 10),
      { wrapper },
    )

    // Wait for page 1 to load
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.pages).toHaveLength(1)

    // Trigger next page fetch
    await act(async () => {
      await result.current.fetchNextPage()
    })

    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2))
    expect(result.current.hasNextPage).toBe(false)
  })

  it('does not fetch when disabled', () => {
    const { result } = renderHook(
      () => useInfiniteTransactions(MOCK_ADDRESS, MOCK_NETWORK, 10, false),
      { wrapper: makeWrapper() },
    )
    expect(result.current.fetchStatus).toBe('idle')
    expect(stellarLib.fetchTransactions).not.toHaveBeenCalled()
  })
})

describe('flattenTransactionPages', () => {
  it('returns empty array for undefined data', () => {
    expect(flattenTransactionPages(undefined)).toEqual([])
  })

  it('flattens multi-page data into a single array', () => {
    const page1 = makePage(3, 0, true)
    const page2 = makePage(2, 3, false)
    const data = {
      pages: [page1, page2],
      pageParams: [null, page1.nextCursor],
    }
    const flat = flattenTransactionPages(data as any)
    expect(flat).toHaveLength(5)
    expect(flat[0].id).toBe('tx-0')
    expect(flat[4].id).toBe('tx-4')
  })
})
