import { useMemo, useState } from "react";
import { useStore } from "../lib/store";
import {
  globalSearch,
  loadSavedSearches,
  saveSearch,
  deleteSavedSearch,
} from "../utils/search";
import {
  applyTransactionFilters,
  applyOperationFilters,
} from "../lib/filters";

export function useSearch() {
  const { transactions, operations, connectedAddress } = useStore();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState({
    status: "all",
    memoOnly: false,
    minFee: "",
    maxFee: "",
  });
  const [savedSearches, setSavedSearches] = useState(() => loadSavedSearches());

  const dataset = useMemo(() => {
    const tx = applyTransactionFilters(transactions, filters).map((item) => ({
      id: `tx-${item.id}`,
      type: "transaction",
      hash: item.hash,
      memo: item.memo || "",
      created_at: item.created_at,
      label: item.hash,
      meta: `${item.operation_count || 0} ops`,
    }));

    const ops = applyOperationFilters(operations, {}).map((item) => ({
      id: `op-${item.id}`,
      type: "operation",
      hash: item.transaction_hash || item.id,
      memo: "",
      created_at: item.created_at,
      label: `${item.type} ${item.id}`,
      meta: item.from || item.to || "",
    }));

    const account = connectedAddress
      ? [
          {
            id: `account-${connectedAddress}`,
            type: "account",
            hash: connectedAddress,
            memo: "",
            created_at: new Date().toISOString(),
            label: connectedAddress,
            meta: "Connected account",
          },
        ]
      : [];

    return [...account, ...tx, ...ops];
  }, [transactions, operations, connectedAddress, filters]);

  const results = useMemo(() => {
    return globalSearch(dataset, query, ["label", "meta", "memo", "hash"]).slice(0, 25);
  }, [dataset, query]);

  function saveCurrentSearch(name) {
    setSavedSearches(saveSearch(name, query, filters));
  }

  function removeSavedSearch(name) {
    setSavedSearches(deleteSavedSearch(name));
  }

  function applySavedSearch(entry) {
    if (!entry) return;
    setQuery(entry.query || "");
    setFilters(entry.filters || filters);
  }

  return {
    query,
    setQuery,
    filters,
    setFilters,
    results,
    savedSearches,
    saveCurrentSearch,
    removeSavedSearch,
    applySavedSearch,
  };
}

export default useSearch;
