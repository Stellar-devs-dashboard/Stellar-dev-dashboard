import { useMemo, useState } from 'react';
import { DEFAULT_SEARCH_FILTERS, useStore } from '../lib/store';
import { globalSearch, loadSavedSearches, saveSearch, deleteSavedSearch, type SavedSearchEntry } from '../utils/search';
import { applyTransactionFilters, applyOperationFilters } from '../lib/filters';
import type { TransactionFilterOptions } from '../lib/filters';

interface SearchableTransaction {
  id: string;
  hash?: string;
  memo?: string;
  created_at?: string;
  operation_count?: number;
  successful?: boolean;
  fee_charged?: number | string;
}

interface SearchableOperation {
  id: string;
  type?: string;
  from?: string;
  to?: string;
  transaction_hash?: string;
  created_at?: string;
  amount?: number | string;
}

interface SearchResultItem extends Record<string, unknown> {
  id: string;
  type: string;
  hash: string;
  memo: string;
  created_at: string;
  label: string;
  meta: string;
  _score?: number;
}

function toTransactionFilters(
  filters: typeof DEFAULT_SEARCH_FILTERS
): TransactionFilterOptions {
  return {
    status: filters.status === 'all' ? undefined : filters.status,
    memoOnly: filters.memoOnly,
    minFee: filters.minFee,
    maxFee: filters.maxFee,
    startDate: filters.startDate,
    endDate: filters.endDate,
  };
}

export function useSearch() {
  const { transactions, operations, connectedAddress, searchFilters, setSearchFilters } =
    useStore();
  const [query, setQuery] = useState('');
  const [savedSearches, setSavedSearches] = useState<SavedSearchEntry[]>(() => loadSavedSearches());

  const dataset = useMemo(() => {
    const txFilters = toTransactionFilters(searchFilters);
    const tx = applyTransactionFilters(
      transactions as SearchableTransaction[],
      txFilters
    ).map((item) => ({
      id: `tx-${item.id}`,
      type: 'transaction',
      hash: item.hash || '',
      memo: item.memo || '',
      created_at: item.created_at || '',
      label: item.hash || item.id,
      meta: `${item.operation_count || 0} ops`,
    }));

    const ops = applyOperationFilters(
      operations as SearchableOperation[],
      {
        type: searchFilters.type === 'all' ? undefined : searchFilters.type,
        minAmount: searchFilters.minAmount,
        maxAmount: searchFilters.maxAmount,
        startDate: searchFilters.startDate,
        endDate: searchFilters.endDate,
      }
    ).map((item) => ({
      id: `op-${item.id}`,
      type: 'operation',
      hash: item.transaction_hash || item.id,
      memo: '',
      created_at: item.created_at || '',
      label: `${item.type || 'operation'} ${item.id}`,
      meta: item.from || item.to || '',
    }));

    const account: SearchResultItem[] = connectedAddress
      ? [
          {
            id: `account-${connectedAddress}`,
            type: 'account',
            hash: connectedAddress,
            memo: '',
            created_at: '',
            label: connectedAddress,
            meta: 'Connected wallet',
          },
        ]
      : [];

    return [...account, ...tx, ...ops];
  }, [transactions, operations, connectedAddress, searchFilters]);

  const results = useMemo(() => {
    return globalSearch<SearchResultItem>(
      dataset,
      query,
      ['label', 'meta', 'memo', 'hash']
    ).slice(0, 25);
  }, [dataset, query]);

  function saveCurrentSearch(name: string) {
    setSavedSearches(saveSearch(name, query, searchFilters));
  }

  function removeSavedSearch(name: string) {
    setSavedSearches(deleteSavedSearch(name));
  }

  function applySavedSearch(entry: SavedSearchEntry) {
    if (!entry) return;
    setQuery(entry.query || '');
    setSearchFilters({ ...DEFAULT_SEARCH_FILTERS, ...(entry.filters || {}) });
  }

  return {
    query,
    setQuery,
    filters: searchFilters,
    setFilters: setSearchFilters,
    results,
    savedSearches,
    saveCurrentSearch,
    removeSavedSearch,
    applySavedSearch,
  };
}

export default useSearch;
