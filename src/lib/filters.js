function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function applyTransactionFilters(transactions = [], filters = {}) {
  return transactions.filter((tx) => {
    if (filters.status === "success" && !tx.successful) return false;
    if (filters.status === "failed" && tx.successful) return false;

    if (filters.memoOnly && !String(tx.memo || "").trim()) return false;

    if (filters.minFee && toNumber(tx.fee_charged) < toNumber(filters.minFee)) {
      return false;
    }

    if (filters.maxFee && toNumber(tx.fee_charged) > toNumber(filters.maxFee)) {
      return false;
    }

    return true;
  });
}

export function applyOperationFilters(operations = [], filters = {}) {
  return operations.filter((op) => {
    if (filters.type && op.type !== filters.type) return false;
    if (filters.account && !String(op.from || op.to || "").includes(filters.account)) {
      return false;
    }
    return true;
  });
}

export function applyAssetFilters(assets = [], filters = {}) {
  return assets.filter((asset) => {
    if (filters.verifiedOnly && !asset.is_verified) return false;
    if (filters.minHolders && toNumber(asset.num_accounts) < toNumber(filters.minHolders)) {
      return false;
    }
    if (filters.assetCode && asset.code !== filters.assetCode) return false;
    return true;
  });
}

export default {
  applyTransactionFilters,
  applyOperationFilters,
  applyAssetFilters,
};
