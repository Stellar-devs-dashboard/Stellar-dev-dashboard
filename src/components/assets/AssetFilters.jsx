import React, { useState } from 'react';
import { useResponsive } from '../../hooks/useResponsive';

export default function AssetFilters({ filters, onChange }) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { isMobile } = useResponsive();

  const handleFilterChange = (key, value) => {
    onChange({ [key]: value });
  };

  const resetFilters = () => {
    onChange({
      verified_only: false,
      min_accounts: null,
      has_domain: false,
      sort_by: 'num_accounts',
      order: 'desc'
    });
  };

  const containerStyles = {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    padding: isMobile ? '16px' : '20px'
  };

  const headerStyles = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px'
  };

  const titleStyles = {
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--text-primary)',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  };

  const toggleButtonStyles = {
    background: 'none',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-secondary)',
    fontSize: '12px',
    padding: '6px 12px',
    cursor: 'pointer',
    transition: 'var(--transition)',
    fontFamily: 'var(--font-mono)'
  };

  const filtersGridStyles = {
    display: 'grid',
    gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px',
    marginBottom: showAdvanced ? '16px' : '0'
  };

  const filterGroupStyles = {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  };

  const labelStyles = {
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  };

  const selectStyles = {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--text-primary)',
    fontSize: '13px',
    fontFamily: 'var(--font-mono)',
    padding: '8px 12px',
    cursor: 'pointer',
    minHeight: isMobile ? 'var(--touch-target-sm)' : 'auto'
  };

  const inputStyles = {
    ...selectStyles,
    cursor: 'text'
  };

  const checkboxContainerStyles = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer',
    padding: '8px 0'
  };

  const checkboxStyles = {
    width: '16px',
    height: '16px',
    accentColor: 'var(--cyan)'
  };

  const resetButtonStyles = {
    background: 'var(--bg-hover)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-secondary)',
    fontSize: '12px',
    padding: '6px 12px',
    cursor: 'pointer',
    transition: 'var(--transition)',
    fontFamily: 'var(--font-mono)'
  };

  return (
    <div style={containerStyles}>
      <div style={headerStyles}>
        <div style={titleStyles}>
          🔧 Filters
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            style={toggleButtonStyles}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--bg-hover)'
              e.currentTarget.style.color = 'var(--text-primary)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'none'
              e.currentTarget.style.color = 'var(--text-secondary)'
            }}
          >
            {showAdvanced ? '🔼 Less' : '🔽 More'}
          </button>
          <button
            onClick={resetFilters}
            style={resetButtonStyles}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--bg-elevated)'
              e.currentTarget.style.color = 'var(--text-primary)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'var(--bg-hover)'
              e.currentTarget.style.color = 'var(--text-secondary)'
            }}
          >
            Reset
          </button>
        </div>
      </div>

      <div style={filtersGridStyles}>
        {/* Sort By */}
        <div style={filterGroupStyles}>
          <label style={labelStyles}>Sort By</label>
          <select
            value={filters.sort_by}
            onChange={(e) => handleFilterChange('sort_by', e.target.value)}
            style={selectStyles}
          >
            <option value="num_accounts">Number of Accounts</option>
            <option value="amount">Total Amount</option>
            <option value="code">Asset Code</option>
          </select>
        </div>

        {/* Order */}
        <div style={filterGroupStyles}>
          <label style={labelStyles}>Order</label>
          <select
            value={filters.order}
            onChange={(e) => handleFilterChange('order', e.target.value)}
            style={selectStyles}
          >
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </div>

        {/* Quick Filters */}
        <div style={filterGroupStyles}>
          <label style={labelStyles}>Quick Filters</label>
          <div>
            <label style={checkboxContainerStyles}>
              <input
                type="checkbox"
                checked={filters.verified_only}
                onChange={(e) => handleFilterChange('verified_only', e.target.checked)}
                style={checkboxStyles}
              />
              <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                Verified only
              </span>
            </label>
            <label style={checkboxContainerStyles}>
              <input
                type="checkbox"
                checked={filters.has_domain}
                onChange={(e) => handleFilterChange('has_domain', e.target.checked)}
                style={checkboxStyles}
              />
              <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                Has domain
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* Advanced Filters */}
      {showAdvanced && (
        <div style={{
          ...filtersGridStyles,
          borderTop: '1px solid var(--border)',
          paddingTop: '16px',
          marginBottom: '0'
        }}>
          <div style={filterGroupStyles}>
            <label style={labelStyles}>Min Accounts</label>
            <input
              type="number"
              value={filters.min_accounts || ''}
              onChange={(e) => handleFilterChange('min_accounts', e.target.value ? parseInt(e.target.value) : null)}
              placeholder="e.g. 100"
              style={inputStyles}
              min="0"
            />
          </div>

          <div style={filterGroupStyles}>
            <label style={labelStyles}>Max Accounts</label>
            <input
              type="number"
              value={filters.max_accounts || ''}
              onChange={(e) => handleFilterChange('max_accounts', e.target.value ? parseInt(e.target.value) : null)}
              placeholder="e.g. 10000"
              style={inputStyles}
              min="0"
            />
          </div>

          <div style={filterGroupStyles}>
            <label style={labelStyles}>Asset Type</label>
            <select
              value={filters.asset_type || ''}
              onChange={(e) => handleFilterChange('asset_type', e.target.value || null)}
              style={selectStyles}
            >
              <option value="">All Types</option>
              <option value="credit_alphanum4">4-char Assets</option>
              <option value="credit_alphanum12">12-char Assets</option>
            </select>
          </div>
        </div>
      )}

      {/* Active Filters Summary */}
      {(filters.verified_only || filters.has_domain || filters.min_accounts || filters.max_accounts) && (
        <div style={{
          marginTop: '16px',
          padding: '12px',
          background: 'var(--cyan-glow-sm)',
          border: '1px solid var(--cyan)',
          borderRadius: 'var(--radius-md)',
          fontSize: '12px',
          color: 'var(--text-primary)'
        }}>
          <div style={{ fontWeight: 600, marginBottom: '4px' }}>Active Filters:</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {filters.verified_only && (
              <span style={{
                background: 'var(--cyan)',
                color: 'var(--bg-base)',
                padding: '2px 8px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '11px'
              }}>
                Verified Only
              </span>
            )}
            {filters.has_domain && (
              <span style={{
                background: 'var(--cyan)',
                color: 'var(--bg-base)',
                padding: '2px 8px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '11px'
              }}>
                Has Domain
              </span>
            )}
            {filters.min_accounts && (
              <span style={{
                background: 'var(--cyan)',
                color: 'var(--bg-base)',
                padding: '2px 8px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '11px'
              }}>
                Min {filters.min_accounts} accounts
              </span>
            )}
            {filters.max_accounts && (
              <span style={{
                background: 'var(--cyan)',
                color: 'var(--bg-base)',
                padding: '2px 8px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '11px'
              }}>
                Max {filters.max_accounts} accounts
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}