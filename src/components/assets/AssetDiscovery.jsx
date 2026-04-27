import React, { useState, useEffect } from 'react';
import { useStore } from '../../lib/store';
import { useResponsive } from '../../hooks/useResponsive';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { searchAssets, fetchAssets, POPULAR_ASSETS } from '../../lib/stellar';
import { addBreadcrumb } from '../../lib/errorReporting';
import AssetList from './AssetList';
import AssetSearch from './AssetSearch';
import AssetFilters from './AssetFilters';
import PopularAssets from './PopularAssets';
import TrustlineRecommendations from './TrustlineRecommendations';

export default function AssetDiscovery() {
  const { network, connectedAddress } = useStore();
  const { isMobile } = useResponsive();
  const { handleError } = useErrorHandler('AssetDiscovery');
  
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({
    verified_only: false,
    min_accounts: null,
    has_domain: false,
    sort_by: 'num_accounts',
    order: 'desc'
  });
  const [activeTab, setActiveTab] = useState('popular');
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);

  // Load initial data
  useEffect(() => {
    loadAssets();
    addBreadcrumb('Asset discovery opened', 'navigation', { network });
  }, [network, filters]);

  const loadAssets = async (cursor = null, append = false) => {
    try {
      setLoading(true);
      
      let result;
      if (searchQuery.trim()) {
        result = { records: await searchAssets(searchQuery, network, { ...filters, cursor }) };
      } else {
        result = await fetchAssets(network, { ...filters, cursor, limit: 20 });
      }
      
      if (append) {
        setAssets(prev => [...prev, ...result.records]);
      } else {
        setAssets(result.records);
      }
      
      setNextCursor(result.next);
      setHasMore(!!result.next);
      
      addBreadcrumb('Assets loaded', 'api_call', { 
        count: result.records.length, 
        searchQuery,
        filters 
      });
    } catch (error) {
      handleError(error, { searchQuery, filters });
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (query) => {
    setSearchQuery(query);
    setActiveTab('search');
    await loadAssets();
  };

  const handleFilterChange = (newFilters) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  };

  const loadMore = () => {
    if (nextCursor && !loading) {
      loadAssets(nextCursor, true);
    }
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    addBreadcrumb('Asset discovery tab changed', 'navigation', { tab });
  };

  const containerStyles = {
    padding: isMobile ? '16px' : '24px',
    maxWidth: '1200px',
    margin: '0 auto'
  };

  const tabStyles = {
    display: 'flex',
    gap: '8px',
    marginBottom: '24px',
    borderBottom: '1px solid var(--border)',
    overflowX: 'auto',
    paddingBottom: '8px'
  };

  const tabButtonStyles = (isActive) => ({
    padding: isMobile ? '12px 16px' : '8px 16px',
    background: isActive ? 'var(--cyan-glow)' : 'transparent',
    border: `1px solid ${isActive ? 'var(--cyan)' : 'var(--border)'}`,
    borderRadius: 'var(--radius-md)',
    color: isActive ? 'var(--cyan)' : 'var(--text-secondary)',
    fontSize: '13px',
    fontFamily: 'var(--font-mono)',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'var(--transition)',
    whiteSpace: 'nowrap',
    minHeight: isMobile ? 'var(--touch-target)' : 'auto'
  });

  return (
    <div className="animate-in" style={containerStyles}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: isMobile ? '24px' : '28px',
          fontWeight: 800,
          color: 'var(--text-primary)',
          marginBottom: '8px'
        }}>
          Asset Discovery
        </h1>
        <p style={{
          color: 'var(--text-secondary)',
          fontSize: isMobile ? '14px' : '16px',
          lineHeight: 1.5
        }}>
          Discover, analyze, and manage Stellar assets with verified issuer information, 
          market data, and trustline recommendations.
        </p>
      </div>

      {/* Search */}
      <div style={{ marginBottom: '24px' }}>
        <AssetSearch 
          onSearch={handleSearch}
          loading={loading}
          placeholder="Search assets by code, issuer, or domain..."
        />
      </div>

      {/* Tabs */}
      <div style={tabStyles}>
        <button
          onClick={() => handleTabChange('popular')}
          style={tabButtonStyles(activeTab === 'popular')}
        >
          🌟 Popular
        </button>
        <button
          onClick={() => handleTabChange('all')}
          style={tabButtonStyles(activeTab === 'all')}
        >
          📋 All Assets
        </button>
        {searchQuery && (
          <button
            onClick={() => handleTabChange('search')}
            style={tabButtonStyles(activeTab === 'search')}
          >
            🔍 Search Results
          </button>
        )}
        {connectedAddress && (
          <button
            onClick={() => handleTabChange('recommendations')}
            style={tabButtonStyles(activeTab === 'recommendations')}
          >
            💡 Recommendations
          </button>
        )}
      </div>

      {/* Filters */}
      {(activeTab === 'all' || activeTab === 'search') && (
        <div style={{ marginBottom: '24px' }}>
          <AssetFilters 
            filters={filters}
            onChange={handleFilterChange}
          />
        </div>
      )}

      {/* Content */}
      <div>
        {activeTab === 'popular' && (
          <PopularAssets 
            assets={POPULAR_ASSETS}
            network={network}
          />
        )}
        
        {(activeTab === 'all' || activeTab === 'search') && (
          <AssetList
            assets={assets}
            loading={loading}
            hasMore={hasMore}
            onLoadMore={loadMore}
            network={network}
            emptyMessage={
              activeTab === 'search' 
                ? `No assets found for "${searchQuery}"` 
                : 'No assets found'
            }
          />
        )}
        
        {activeTab === 'recommendations' && connectedAddress && (
          <TrustlineRecommendations
            accountId={connectedAddress}
            network={network}
          />
        )}
      </div>
    </div>
  );
}