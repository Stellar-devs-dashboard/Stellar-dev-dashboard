import React, { useState } from 'react';
import { useStore } from '../../lib/store';
import { createSession } from '../../lib/multisig';
import { useNotifications } from '../../hooks/useNotifications';
import MultisigSetup from './MultisigSetup';
import SessionManager from './SessionManager';

const TABS = [
  { id: 'setup', label: 'Setup', icon: '⚙' },
  { id: 'sessions', label: 'Sessions', icon: '✎' },
];

/**
 * Top-level multisig management view.
 * Tabs: Setup (configure signers/thresholds) | Sessions (collect signatures & submit)
 */
export default function MultisigManager() {
  const { connectedAddress, network } = useStore();
  const { success } = useNotifications();
  const [activeTab, setActiveTab] = useState('setup');
  const [sessionCount, setSessionCount] = useState(0);

  // When setup produces an XDR, auto-create a session and switch to Sessions tab
  const handleXdrReady = (xdr, signers, thresholds) => {
    const session = createSession({
      txXdr: xdr,
      sourceAddress: connectedAddress || '',
      description: 'SetOptions — Multisig Configuration',
      requiredSigners: signers.filter((s) => !s.isMaster).map((s) => ({ key: s.key, weight: s.weight, label: s.label })),
      threshold: thresholds.high,
      network,
    });
    success('Session Created', 'Switch to Sessions to collect signatures');
    setSessionCount((c) => c + 1);
    setActiveTab('sessions');
  };

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 700 }}>
          Multi-Signature
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
          Configure co-signers, set thresholds, and coordinate signature collection
        </div>
      </div>

      {/* Tab bar */}
      <div style={{
        display: 'flex',
        gap: '4px',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: '4px',
        width: 'fit-content',
      }}>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                borderRadius: 'var(--radius-md)',
                border: `1px solid ${isActive ? 'var(--cyan-dim)' : 'transparent'}`,
                background: isActive ? 'var(--cyan-glow)' : 'transparent',
                color: isActive ? 'var(--cyan)' : 'var(--text-secondary)',
                fontSize: '12px',
                fontFamily: 'var(--font-mono)',
                cursor: 'pointer',
                transition: 'var(--transition)',
              }}
              aria-current={isActive ? 'page' : undefined}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'setup' && (
        <MultisigSetup onXdrReady={handleXdrReady} />
      )}
      {activeTab === 'sessions' && (
        <SessionManager key={sessionCount} />
      )}
    </div>
  );
}
