import React, { useState } from 'react';
import type {
  ClaimableBalanceLifecycleRecord,
} from '../../types/claimableBalanceExplorer';
import EligibilityCountdownCard from './EligibilityCountdownCard';
import VisualPredicateBuilder from './VisualPredicateBuilder';

interface LifecycleTimelineExplorerProps {
  balances: ClaimableBalanceLifecycleRecord[];
  loading: boolean;
  error: string | null;
  connectedAddress: string;
  onRefresh: () => void;
  onOpenCreate: () => void;
  onClaim: (balanceId: string) => void;
  onClawback: (balanceId: string) => void;
}

export default function LifecycleTimelineExplorer({
  balances,
  loading,
  error,
  connectedAddress,
  onRefresh,
  onOpenCreate,
  onClaim,
  onClawback,
}: LifecycleTimelineExplorerProps) {
  const [selectedBalance, setSelectedBalance] = useState<ClaimableBalanceLifecycleRecord | null>(null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header controls & summary stats */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '14px', fontWeight: 600, color: '#fff' }}>
            Found {balances.length} Balance{balances.length !== 1 ? 's' : ''}
          </span>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            style={{
              fontSize: '12px',
              padding: '4px 10px',
              borderRadius: '4px',
              background: 'var(--bg-surface, #1e222d)',
              border: '1px solid var(--border-color, #2d3343)',
              color: 'var(--text-secondary, #94a3b8)',
              cursor: loading ? 'wait' : 'pointer',
            }}
          >
            {loading ? 'Refreshing...' : '↻ Refresh'}
          </button>
        </div>

        <button
          type="button"
          onClick={onOpenCreate}
          style={{
            padding: '8px 16px',
            borderRadius: '6px',
            background: '#3498db',
            border: 'none',
            color: '#fff',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          + Compose New Balance
        </button>
      </div>

      {error && (
        <div
          style={{
            background: 'rgba(231, 76, 60, 0.1)',
            border: '1px solid #e74c3c',
            color: '#e74c3c',
            padding: '12px 16px',
            borderRadius: '6px',
            fontSize: '13px',
          }}
        >
          {error}
        </div>
      )}

      {/* Grid of Balances */}
      {balances.length === 0 && !loading ? (
        <div
          style={{
            padding: '48px 20px',
            textAlign: 'center',
            background: 'var(--bg-surface, #1e222d)',
            borderRadius: '8px',
            border: '1px solid var(--border-color, #2d3343)',
            color: 'var(--text-muted, #64748b)',
          }}
        >
          <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-secondary, #94a3b8)', margin: '0 0 8px' }}>
            No claimable balances found
          </p>
          <p style={{ fontSize: '13px', margin: '0 0 16px' }}>
            Create your first custom claimable balance with time-locks, vesting, or escrow predicates.
          </p>
          <button
            type="button"
            onClick={onOpenCreate}
            style={{
              padding: '8px 18px',
              borderRadius: '6px',
              background: '#3498db',
              border: 'none',
              color: '#fff',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Create Claimable Balance
          </button>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
            gap: '16px',
          }}
        >
          {balances.map((b) => (
            <div key={b.id} onClick={() => setSelectedBalance(b)} style={{ cursor: 'pointer' }}>
              <EligibilityCountdownCard
                balance={b}
                currentAddress={connectedAddress}
                onClaim={onClaim}
                onClawback={onClawback}
              />
            </div>
          ))}
        </div>
      )}

      {/* Selected Balance Detail Drawer */}
      {selectedBalance && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            width: '460px',
            maxWidth: '100vw',
            background: 'var(--bg-surface, #1e222d)',
            borderLeft: '1px solid var(--border-color, #2d3343)',
            zIndex: 9990,
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            overflowY: 'auto',
            boxShadow: '-10px 0 25px -5px rgba(0,0,0,0.5)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '16px', color: '#fff' }}>Balance Details</h3>
            <button
              type="button"
              onClick={() => setSelectedBalance(null)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted, #64748b)',
                fontSize: '18px',
                cursor: 'pointer',
              }}
            >
              ✕
            </button>
          </div>

          <div
            style={{
              background: 'var(--bg-base, #131722)',
              borderRadius: '8px',
              padding: '12px',
              fontSize: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Balance ID: </span>
              <span style={{ fontFamily: 'monospace', color: '#a5b4fc', wordBreak: 'break-all' }}>
                {selectedBalance.id}
              </span>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Amount: </span>
              <strong style={{ color: '#fff' }}>
                {selectedBalance.amount} {selectedBalance.assetCode || 'XLM'}
              </strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Last Modified: </span>
              <span style={{ color: '#fff' }}>{selectedBalance.lastModifiedTime}</span>
            </div>
            {selectedBalance.sponsor && (
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Sponsor: </span>
                <span style={{ fontFamily: 'monospace', color: '#fff' }}>
                  {selectedBalance.sponsor}
                </span>
              </div>
            )}
          </div>

          <h4 style={{ margin: '8px 0 0', fontSize: '14px', color: '#fff' }}>
            Claimants & Predicates ({selectedBalance.claimants.length})
          </h4>

          {selectedBalance.claimants.map((c, idx) => (
            <div
              key={idx}
              style={{
                border: '1px solid var(--border-color, #2d3343)',
                borderRadius: '6px',
                padding: '12px',
                background: 'var(--bg-base, #131722)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ fontSize: '12px', fontFamily: 'monospace', color: '#fff', wordBreak: 'break-all' }}>
                {c.destination}
              </div>
              <VisualPredicateBuilder rootNode={c.predicate} onChange={() => {}} readOnly={true} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
