/**
 * useNetworkStats — polls Horizon for latest ledger + fee statistics.
 *
 * Replaces statsLoading / setNetworkStats / setStatsLoading from the Zustand store.
 * The NetworkStats tab additionally uses a streaming ledger subscription; that
 * is handled separately in useStreamingLedgers (below).
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { fetchNetworkStats, type NetworkName, type NetworkStats } from '../../lib/stellar'
import { networkKeys } from '../../lib/queryKeys'
import { STALE_TIMES } from '../../lib/queryClient'

export interface UseNetworkStatsOptions {
  /** Override the default 5 s refetch interval (ms). Pass false to disable. */
  refetchInterval?: number | false
  enabled?: boolean
}

/**
 * Fetches and periodically refreshes network stats (latest ledger + fee data).
 *
 * @example
 * const { data: stats, isLoading } = useNetworkStats('testnet')
 */
export function useNetworkStats(
  network: NetworkName,
  options: UseNetworkStatsOptions = {},
): UseQueryResult<NetworkStats, Error> {
  const { refetchInterval = 30_000, enabled = true } = options

  return useQuery<NetworkStats, Error>({
    queryKey: networkKeys.stats(network),
    queryFn: () => fetchNetworkStats(network),
    staleTime: STALE_TIMES.NETWORK,
    gcTime: 2 * 60_000,
    refetchInterval,
    // Keep showing stale data while a background refetch is in flight
    // (prevents the loading skeleton from flickering on every poll)
    placeholderData: (prev) => prev,
    enabled,
    // Background refetch only — don't auto-focus refetch for short intervals
    refetchOnWindowFocus: refetchInterval !== false && refetchInterval >= 30_000,
  })
}
