/**
 * useAssetHolders — Paginated query hook for fetching accounts
 * that hold a specific asset.
 */

import { useInfiniteQuery } from '@tanstack/react-query';
import { useStore } from '../lib/store';
import { assetControlKeys } from '../lib/queryKeys';
import { fetchAssetHolders, type AssetHolderPage } from '../lib/assetControl/assetService';
import { STALE_TIMES } from '../lib/queryClient';
import type { NetworkName } from '../lib/stellar';
import type { AssetIdentifier, TrustlineAuthState } from '../types/assetControl';

export interface AssetHoldersFilter {
  authState?: TrustlineAuthState;
  minBalance?: string;
  searchAddress?: string;
}

/**
 * Infinite-scroll-aware query for asset holders.
 *
 * @param asset  Asset code + issuer to query.
 * @param filters  Optional client-side filters applied after fetch.
 * @param pageSize  Number of records per page (max 200).
 */
export function useAssetHolders(
  asset: AssetIdentifier | undefined,
  filters?: AssetHoldersFilter,
  pageSize = 50,
) {
  const network = useStore((s) => s.network) as NetworkName;

  const query = useInfiniteQuery<AssetHolderPage>({
    queryKey: assetControlKeys.holders(
      asset?.code ?? '',
      asset?.issuer ?? '',
      network,
    ),
    queryFn: async ({ pageParam, signal }) => {
      if (!asset) throw new Error('No asset specified');
      return fetchAssetHolders(
        asset,
        network,
        pageParam as string | undefined,
        pageSize,
        signal,
      );
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: Boolean(asset?.code && asset?.issuer),
    staleTime: STALE_TIMES.ACCOUNT,
  });

  // Client-side filtering on the flattened records
  const allRecords = query.data?.pages.flatMap((p) => p.records) ?? [];

  const filteredRecords = allRecords.filter((record) => {
    if (filters?.authState) {
      const isAuthorized = record.authorized;
      const isMaintainLiabilities = record.authorizedToMaintainLiabilities;

      switch (filters.authState) {
        case 'authorized':
          if (!isAuthorized) return false;
          break;
        case 'authorized_to_maintain_liabilities':
          if (!isMaintainLiabilities) return false;
          break;
        case 'deauthorized':
          if (isAuthorized || isMaintainLiabilities) return false;
          break;
      }
    }

    if (filters?.minBalance) {
      const min = parseFloat(filters.minBalance);
      if (!isNaN(min) && parseFloat(record.balance) < min) return false;
    }

    if (filters?.searchAddress) {
      const search = filters.searchAddress.toLowerCase();
      if (!record.address.toLowerCase().includes(search)) return false;
    }

    return true;
  });

  return {
    records: filteredRecords,
    totalUnfiltered: allRecords.length,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as Error | null,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    refetch: query.refetch,
  };
}
