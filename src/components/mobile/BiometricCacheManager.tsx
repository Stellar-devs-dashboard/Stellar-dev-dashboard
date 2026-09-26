import React, { useState } from 'react';
import { Fingerprint, Lock, Unlock, Shield, AlertCircle, Check, X } from 'lucide-react';
import { useBiometricCache } from '../../hooks/useBiometricCache';

interface BiometricCacheManagerProps {
  userId: string;
  userName: string;
  onDataAccess?: (key: string, value: string) => void;
}

export default function BiometricCacheManager({
  userId,
  userName,
  onDataAccess,
}: BiometricCacheManagerProps) {
  const {
    isAvailable,
    isRegistered,
    isAuthenticated,
    isLocked,
    error,
    register,
    authenticate,
    lock,
    unregister,
    setCachedData,
    getCachedData,
    removeCachedData,
    clearError,
  } = useBiometricCache({
    userId,
    userName,
    autoLock: true,
    lockTimeout: 300000, // 5 minutes
  });

  const [showSettings, setShowSettings] = useState(false);
  const [testKey, setTestKey] = useState('');
  const [testValue, setTestValue] = useState('');

  const handleRegister = async () => {
    const success = await register();
    if (success) {
      // Store some initial cached data
      await setCachedData('account_snapshot', JSON.stringify({ balance: 1000, timestamp: Date.now() }));
    }
  };

  const handleAuthenticate = async () => {
    const success = await authenticate();
    if (success) {
      clearError();
    }
  };

  const handleLock = () => {
    lock();
  };

  const handleUnregister = async () => {
    if (window.confirm('Are you sure you want to remove biometric protection? This will delete all cached data.')) {
      await unregister();
    }
  };

  const handleSetTestData = async () => {
    if (!testKey || !testValue) return;
    const success = await setCachedData(testKey, testValue);
    if (success) {
      setTestKey('');
      setTestValue('');
    }
  };

  const handleGetTestData = async (key: string) => {
    const value = await getCachedData(key);
    if (value && onDataAccess) {
      onDataAccess(key, value);
    }
  };

  const handleRemoveData = (key: string) => {
    removeCachedData(key);
  };

  if (!isAvailable) {
    return (
      <div
        style={{
          padding: '16px',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <AlertCircle size={20} style={{ color: 'var(--amber)' }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
            Biometric Authentication Not Available
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Your device does not support biometric authentication. Cached data will not be protected.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Status Banner */}
      <div
        style={{
          padding: '12px 16px',
          background: isLocked ? 'var(--bg-elevated)' : 'var(--cyan-glow-sm)',
          border: `1px solid ${isLocked ? 'var(--border)' : 'var(--cyan-dim)'}`,
          borderRadius: 'var(--radius-md)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        {isLocked ? (
          <Lock size={20} style={{ color: 'var(--amber)' }} />
        ) : (
          <Unlock size={20} style={{ color: 'var(--green)' }} />
        )}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '2px' }}>
            {isLocked ? 'Cache Locked' : 'Cache Unlocked'}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {isLocked
              ? 'Authenticate with biometrics to access cached data'
              : 'Cached data is accessible'}
          </div>
        </div>
        {isLocked ? (
          <button
            onClick={handleAuthenticate}
            style={{
              padding: '8px 12px',
              background: 'var(--cyan)',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              color: 'white',
              fontSize: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Fingerprint size={14} />
            <span>Unlock</span>
          </button>
        ) : (
          <button
            onClick={handleLock}
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
            <Lock size={14} />
            <span>Lock</span>
          </button>
        )}
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
          <button
            onClick={clearError}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Registration Status */}
      {!isRegistered ? (
        <div
          style={{
            padding: '16px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            textAlign: 'center',
          }}
        >
          <Shield size={32} style={{ color: 'var(--cyan)', marginBottom: '12px' }} />
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
            Enable Biometric Protection
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: 1.5 }}>
            Protect your cached offline data with fingerprint or face authentication. Your data will
            only be accessible after biometric verification.
          </div>
          <button
            onClick={handleRegister}
            style={{
              padding: '10px 16px',
              background: 'var(--cyan)',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              color: 'white',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              margin: '0 auto',
            }}
          >
            <Fingerprint size={16} />
            <span>Setup Biometric Lock</span>
          </button>
        </div>
      ) : (
        <>
          {/* Settings Toggle */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            style={{
              padding: '8px 12px',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-secondary)',
              fontSize: '12px',
              cursor: 'pointer',
              width: 'fit-content',
            }}
          >
            {showSettings ? 'Hide Settings' : 'Show Settings'}
          </button>

          {showSettings && (
            <div
              style={{
                padding: '16px',
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
              }}
            >
              {/* Test Data Input */}
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
                  Test Cached Data
                </div>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <input
                    type="text"
                    placeholder="Key"
                    value={testKey}
                    onChange={(e) => setTestKey(e.target.value)}
                    disabled={isLocked}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      background: 'var(--bg-canvas)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--text-primary)',
                      fontSize: '12px',
                    }}
                  />
                  <input
                    type="text"
                    placeholder="Value"
                    value={testValue}
                    onChange={(e) => setTestValue(e.target.value)}
                    disabled={isLocked}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      background: 'var(--bg-canvas)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--text-primary)',
                      fontSize: '12px',
                    }}
                  />
                </div>
                <button
                  onClick={handleSetTestData}
                  disabled={isLocked || !testKey || !testValue}
                  style={{
                    padding: '8px 12px',
                    background: isLocked || !testKey || !testValue ? 'var(--bg-elevated)' : 'var(--cyan)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    color: isLocked || !testKey || !testValue ? 'var(--text-muted)' : 'white',
                    fontSize: '12px',
                    cursor: isLocked || !testKey || !testValue ? 'not-allowed' : 'pointer',
                  }}
                >
                  Set Cached Data
                </button>
              </div>

              {/* Unregister */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                <button
                  onClick={handleUnregister}
                  style={{
                    padding: '8px 12px',
                    background: 'var(--red-glow-sm)',
                    border: '1px solid var(--red)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--red)',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  Remove Biometric Protection
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
