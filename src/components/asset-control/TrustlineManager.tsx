/**
 * TrustlineManager — Trustline authorization workflows.
 *
 * Provides a table of asset holders with authorization state, batch selection,
 * and controls to authorize / deauthorize / maintain-liabilities trustlines.
 */

import React, { useState, useCallback } from 'react';
import { useAssetHolders, type AssetHoldersFilter } from '../../hooks/useAssetHolders';
import { useTrustlineAuthMutation } from '../../hooks/useAssetOperations';
import type {
  AssetIdentifier,
  TrustlineAuthState,
} from '../../types/assetControl';

interface TrustlineManagerProps {
  issuerAddress: string;
  asset: AssetIdentifier;
}

const AUTH_STATE_LABELS: Record<TrustlineAuthState, string> = {
  authorized: 'Authorized',
  authorized_to_maintain_liabilities: 'Maintain Liabilities',
  deauthorized: 'Deauthorized',
};

export default function TrustlineManager({ issuerAddress, asset }: TrustlineManagerProps) {
  const [filters, setFilters] = useState<AssetHoldersFilter>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [targetState, setTargetState] = useState<TrustlineAuthState>('authorized');

  const {
    records,
    totalUnfiltered,
    isLoading,
    isError,
    error,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    refetch,
  } = useAssetHolders(asset, filters);

  const trustlineAuth = useTrustlineAuthMutation();

  // ─── Selection ───────────────────────────────────────────────────────────

  const handleToggleSelect = useCallback((address: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(address)) {
        next.delete(address);
      } else {
        next.add(address);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (selected.size === records.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(records.map((r) => r.address)));
    }
  }, [records, selected.size]);

  // ─── Batch Action ────────────────────────────────────────────────────────

  const handleBatchAuth = useCallback(() => {
    if (selected.size === 0) return;

    selected.forEach((holderAddress) => {
      trustlineAuth.mutate({
        issuerAddress,
        request: {
          holderAddress,
          asset,
          targetState,
        },
      });
    });
  }, [selected, issuerAddress, asset, targetState, trustlineAuth]);

  // ─── Single Action ──────────────────────────────────────────────────────

  const handleSingleAuth = useCallback(
    (holderAddress: string, state: TrustlineAuthState) => {
      trustlineAuth.mutate({
        issuerAddress,
        request: { holderAddress, asset, targetState: state },
      });
    },
    [issuerAddress, asset, trustlineAuth],
  );

  // ─── Filter Helpers ─────────────────────────────────────────────────────

  const handleFilterChange = useCallback((key: keyof AssetHoldersFilter, value: string) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value || undefined,
    }));
  }, []);

  // ─── Loading ────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="ac-card" aria-busy="true" aria-live="polite">
        <div className="ac-skeleton" style={{ height: 24, width: 200, marginBottom: 16 }} />
        <div className="ac-skeleton" style={{ height: 200 }} />
      </div>
    );
  }

  // ─── Error ──────────────────────────────────────────────────────────────

  if (isError) {
    return (
      <div className="ac-card ac-error-state" role="alert">
        <p>Failed to load asset holders{error ? `: ${error.message}` : '.'}</p>
        <button className="ac-btn ac-btn-secondary ac-btn-sm" onClick={() => refetch()}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Filters */}
      <div className="ac-card">
        <h3>Trustline Holders — {asset.code}</h3>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
          <div className="ac-form-group" style={{ marginBottom: 0, flex: '1 1 180px' }}>
            <label htmlFor="ac-filter-auth">Authorization</label>
            <select
              id="ac-filter-auth"
              className="ac-select"
              value={filters.authState ?? ''}
              onChange={(e) =>
                handleFilterChange('authState', e.target.value as TrustlineAuthState)
              }
            >
              <option value="">All</option>
              <option value="authorized">Authorized</option>
              <option value="authorized_to_maintain_liabilities">Maintain Liabilities</option>
              <option value="deauthorized">Deauthorized</option>
            </select>
          </div>
          <div className="ac-form-group" style={{ marginBottom: 0, flex: '1 1 140px' }}>
            <label htmlFor="ac-filter-min-bal">Min Balance</label>
            <input
              id="ac-filter-min-bal"
              className="ac-input"
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={filters.minBalance ?? ''}
              onChange={(e) => handleFilterChange('minBalance', e.target.value)}
            />
          </div>
          <div className="ac-form-group" style={{ marginBottom: 0, flex: '2 1 200px' }}>
            <label htmlFor="ac-filter-search">Search Address</label>
            <input
              id="ac-filter-search"
              className="ac-input"
              type="search"
              placeholder="G…"
              value={filters.searchAddress ?? ''}
              onChange={(e) => handleFilterChange('searchAddress', e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Batch Actions */}
      {selected.size > 0 && (
        <div className="ac-card" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            {selected.size} selected
          </span>
          <select
            className="ac-select"
            value={targetState}
            onChange={(e) => setTargetState(e.target.value as TrustlineAuthState)}
            aria-label="Target authorization state"
          >
            <option value="authorized">Authorize</option>
            <option value="authorized_to_maintain_liabilities">Maintain Liabilities</option>
            <option value="deauthorized">Deauthorize</option>
          </select>
          <button
            className="ac-btn ac-btn-primary ac-btn-sm"
            onClick={handleBatchAuth}
            disabled={trustlineAuth.isPending}
          >
            {trustlineAuth.isPending ? 'Processing…' : 'Apply to Selected'}
          </button>
          <button
            className="ac-btn ac-btn-secondary ac-btn-sm"
            onClick={() => setSelected(new Set())}
          >
            Clear
          </button>
        </div>
      )}

      {/* Holders Table */}
      {records.length === 0 ? (
        <div className="ac-card ac-empty-state">
          <div className="icon" aria-hidden="true">📋</div>
          <p>
            {totalUnfiltered === 0
              ? 'No accounts hold this asset yet.'
              : 'No holders match the current filters.'}
          </p>
        </div>
      ) : (
        <div className="ac-table-wrapper">
          <table className="ac-table" aria-label={`Holders of ${asset.code}`}>
            <thead>
              <tr>
                <th scope="col" style={{ width: 36 }}>
                  <input
                    type="checkbox"
                    checked={selected.size === records.length && records.length > 0}
                    onChange={handleSelectAll}
                    aria-label="Select all holders"
                  />
                </th>
                <th scope="col">Address</th>
                <th scope="col">Balance</th>
                <th scope="col">Limit</th>
                <th scope="col">Authorization</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {records.map((holder) => {
                const authLabel = holder.authorized
                  ? 'Authorized'
                  : holder.authorizedToMaintainLiabilities
                    ? 'Maintain Liabilities'
                    : 'Deauthorized';

                return (
                  <tr key={holder.address}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.has(holder.address)}
                        onChange={() => handleToggleSelect(holder.address)}
                        aria-label={`Select ${holder.address.slice(0, 8)}…`}
                      />
                    </td>
                    <td className="mono" title={holder.address}>
                      {holder.address.slice(0, 8)}…{holder.address.slice(-4)}
                    </td>
                    <td className="mono">{holder.balance}</td>
                    <td className="mono">{holder.limit}</td>
                    <td>
                      <span className="ac-status">
                        <span
                          className={`ac-status-dot ${
                            holder.authorized
                              ? 'success'
                              : holder.authorizedToMaintainLiabilities
                                ? 'warning'
                                : 'error'
                          }`}
                        />
                        {authLabel}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {!holder.authorized && (
                          <button
                            className="ac-btn ac-btn-primary ac-btn-sm"
                            onClick={() => handleSingleAuth(holder.address, 'authorized')}
                            disabled={trustlineAuth.isPending}
                            aria-label={`Authorize ${holder.address.slice(0, 8)}`}
                          >
                            Auth
                          </button>
                        )}
                        {holder.authorized && (
                          <button
                            className="ac-btn ac-btn-danger ac-btn-sm"
                            onClick={() => handleSingleAuth(holder.address, 'deauthorized')}
                            disabled={trustlineAuth.isPending}
                            aria-label={`Deauthorize ${holder.address.slice(0, 8)}`}
                          >
                            Deauth
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Load More */}
      {hasNextPage && (
        <button
          className="ac-btn ac-btn-secondary"
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
          style={{ alignSelf: 'center' }}
        >
          {isFetchingNextPage ? 'Loading more…' : 'Load More Holders'}
        </button>
      )}

      {/* Mutation Status */}
      {trustlineAuth.isError && (
        <div className="ac-danger-banner" role="alert">
          <span aria-hidden="true">⚠</span>
          Failed to update trustline authorization. Please try again.
        </div>
      )}
      {trustlineAuth.isSuccess && (
        <div className="ac-warning" role="status" style={{ color: '#22c55e', borderColor: 'rgba(34,197,94,0.25)', background: 'rgba(34,197,94,0.08)' }}>
          <span aria-hidden="true">✓</span>
          Transaction built. Sign and submit to apply changes.
        </div>
      )}
    </div>
  );
}
