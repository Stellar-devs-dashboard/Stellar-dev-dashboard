import React, { useState } from 'react';
import { Download, RefreshCw, Trash2, BookOpen, Wifi, WifiOff, Check, AlertCircle } from 'lucide-react';
import { useDocsCache } from '../../hooks/useDocsCache';

export default function DocsCacheManager() {
  const {
    isCached,
    isUpdating,
    lastUpdated,
    error,
    cachedDocs,
    updateDocsCache,
    clearDocsCache,
    checkCacheStatus,
  } = useDocsCache();

  const [showDetails, setShowDetails] = useState(false);

  const handleUpdateCache = async () => {
    await updateDocsCache();
  };

  const handleClearCache = async () => {
    if (window.confirm('Are you sure you want to clear the documentation cache?')) {
      await clearDocsCache();
    }
  };

  const handleRefreshStatus = () => {
    checkCacheStatus();
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const totalSize = cachedDocs.reduce((sum, doc) => sum + doc.size, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Status Banner */}
      <div
        style={{
          padding: '12px 16px',
          background: isCached ? 'var(--cyan-glow-sm)' : 'var(--bg-elevated)',
          border: `1px solid ${isCached ? 'var(--cyan-dim)' : 'var(--border)'}`,
          borderRadius: 'var(--radius-md)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        {isCached ? (
          <Wifi size={20} style={{ color: 'var(--green)' }} />
        ) : (
          <WifiOff size={20} style={{ color: 'var(--amber)' }} />
        )}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '2px' }}>
            {isCached ? 'Documentation Cached' : 'Documentation Not Cached'}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {isCached
              ? `${cachedDocs.length} pages available offline (${formatFileSize(totalSize)})`
              : 'Documentation will not be available offline'}
          </div>
        </div>
        <button
          onClick={handleRefreshStatus}
          style={{
            padding: '8px',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div
          style={{
            padding: '12px 16px',
            background: 'var(--red-glow-sm)',
            border: '1px solid var(--red)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <AlertCircle size={18} style={{ color: 'var(--red)' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '12px', color: 'var(--red)' }}>{error}</div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button
          onClick={handleUpdateCache}
          disabled={isUpdating}
          style={{
            padding: '8px 12px',
            background: isUpdating ? 'var(--bg-elevated)' : 'var(--cyan)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            color: isUpdating ? 'var(--text-muted)' : 'white',
            fontSize: '12px',
            cursor: isUpdating ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          {isUpdating ? (
            <>
              <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} />
              <span>Updating...</span>
            </>
          ) : (
            <>
              <Download size={14} />
              <span>Cache Documentation</span>
            </>
          )}
        </button>

        {isCached && (
          <button
            onClick={handleClearCache}
            style={{
              padding: '8px 12px',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-secondary)',
              fontSize: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Trash2 size={14} />
            <span>Clear Cache</span>
          </button>
        )}

        <button
          onClick={() => setShowDetails(!showDetails)}
          style={{
            padding: '8px 12px',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-secondary)',
            fontSize: '12px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <BookOpen size={14} />
          <span>{showDetails ? 'Hide Details' : 'Show Details'}</span>
        </button>
      </div>

      {/* Last Updated */}
      {lastUpdated && (
        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          Last updated: {lastUpdated.toLocaleString()}
        </div>
      )}

      {/* Cached Documents Details */}
      {showDetails && isCached && (
        <div
          style={{
            padding: '16px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>
            Cached Documentation ({cachedDocs.length} pages)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {cachedDocs.map((doc) => (
              <div
                key={doc.url}
                style={{
                  padding: '8px 12px',
                  background: 'var(--bg-elevated)',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '11px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Check size={12} style={{ color: 'var(--green)' }} />
                  <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                    {doc.url}
                  </span>
                </div>
                <div style={{ color: 'var(--text-muted)' }}>{formatFileSize(doc.size)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info Message */}
      <div
        style={{
          padding: '12px 16px',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          fontSize: '11px',
          color: 'var(--text-muted)',
          lineHeight: 1.5,
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: '4px', color: 'var(--text-secondary)' }}>
          Offline Documentation
        </div>
        Cache critical documentation pages for offline reference. When the network is unavailable,
        cached documentation will be served from the browser cache. This is useful for working in
        environments with limited or intermittent connectivity.
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
