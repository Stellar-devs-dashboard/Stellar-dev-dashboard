/**
 * useAccountReadiness — React hook that queries an issuer account's
 * readiness state and caches the result via TanStack Query.
 */

import { useQuery } from '@tanstack/react-query';
import { useStore } from '../lib/store';
import { assetControlKeys } from '../lib/queryKeys';
import { buildIssuerState, runReadinessChecks } from '../lib/assetControl';
import { STALE_TIMES } from '../lib/queryClient';
import type { NetworkName } from '../lib/stellar';
import type { IssuerState, IssuerReadiness } from '../types/assetControl';

export interface AccountReadinessResult {
  issuerState: IssuerState | null;
  readiness: IssuerReadiness | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Fetch and evaluate readiness for the given issuer address.
 *
 * @param issuerAddress  The issuer G-address.
 * @param distributorAddress  Optional distributor for separation check.
 */
export function useAccountReadiness(
  issuerAddress: string | undefined,
  distributorAddress?: string,
): AccountReadinessResult {
  const network = useStore((s) => s.network) as NetworkName;

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: assetControlKeys.issuerReadiness(issuerAddress ?? '', network),
    queryFn: async ({ signal }) => {
      if (!issuerAddress) throw new Error('No issuer address');
      const state = await buildIssuerState(issuerAddress, network, signal);
      const readiness = runReadinessChecks(state, distributorAddress);
      return { issuerState: state, readiness };
    },
    enabled: Boolean(issuerAddress),
    staleTime: STALE_TIMES.ACCOUNT,
    retry: 2,
  });

  return {
    issuerState: data?.issuerState ?? null,
    readiness: data?.readiness ?? null,
    isLoading,
    isError,
    error: error as Error | null,
    refetch,
  };
}
