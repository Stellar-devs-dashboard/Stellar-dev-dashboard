import React, { useState } from 'react';
import { useStore } from '../../lib/store';
import {
  buildClaimTransaction,
  buildClawbackClaimableBalanceTransaction,
} from '../../lib/claimableBalance/composerEngine';
import type { ClaimableBalanceLifecycleRecord } from '../../types/claimableBalanceExplorer';

interface ClaimClawbackActionModalProps {
  balance: ClaimableBalanceLifecycleRecord | null;
  actionType: 'claim' | 'clawback';
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function ClaimClawbackActionModal({
  balance,
  actionType,
  isOpen,
  onClose,
  onSuccess,
}: ClaimClawbackActionModalProps) {
  const { connectedAddress, network } = useStore();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    xdr?: string;
    error?: string;
  } | null>(null);

  if (!isOpen || !balance) return null;

  const isClaim = actionType === 'claim';

  async function handleExecute() {
    if (!balance) return;
    setLoading(true);
    setResult(null);

    try {
      let tx;
      if (isClaim) {
        tx = await buildClaimTransaction(balance.id, connectedAddress, network);
      } else {
        tx = await buildClawbackClaimableBalanceTransaction(balance.id, connectedAddress, network);
      }

      setResult({
        success: true,
        xdr: tx.toXDR(),
      });

      if (onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      setResult({
        success: false,
        error: err.message || 'Failed to construct operation transaction',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '20px',
      }}
    >
      <div
        style={{
          background: 'var(--bg-surface, #1e222d)',
          border: '1px solid var(--border-color, #2d3343)',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '560px',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-color, #2d3343)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h3 style={{ margin: 0, fontSize: '16px', color: '#fff' }}>
            {isClaim ? 'Claim Balance' : 'Clawback Claimable Balance'}
          </h3>
          <button
            type="button"
            onClick={onClose}
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

        {/* Content */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div
            style={{
              background: 'var(--bg-base, #131722)',
              border: '1px solid var(--border-color, #2d3343)',
              borderRadius: '8px',
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ fontSize: '13px', color: '#94a3b8' }}>
              Amount: <strong style={{ color: '#fff' }}>{balance.amount} {balance.assetCode || 'XLM'}</strong>
            </div>
            <div style={{ fontSize: '12px', color: '#94a3b8' }}>
              Balance ID: <span style={{ fontFamily: 'monospace', color: '#a5b4fc' }}>{balance.id}</span>
            </div>
            <div style={{ fontSize: '12px', color: '#94a3b8' }}>
              Signing Account: <span style={{ fontFamily: 'monospace', color: '#fff' }}>{connectedAddress}</span>
            </div>
          </div>

          {!result && (
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary, #94a3b8)' }}>
              {isClaim
                ? 'Submitting this transaction will claim the locked tokens and transfer them directly into your connected wallet.'
                : 'Clawing back this claimable balance will reclaim and burn/return the issued tokens back to the issuer reserve.'}
            </p>
          )}

          {result && (
            <div>
              {result.success ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ color: '#2ecc71', fontSize: '13px', fontWeight: 600 }}>
                    ✓ Transaction generated & ready!
                  </div>
                  <label style={{ fontSize: '11px', color: '#94a3b8' }}>XDR:</label>
                  <textarea
                    readOnly
                    value={result.xdr}
                    rows={3}
                    style={{
                      width: '100%',
                      fontSize: '11px',
                      fontFamily: 'monospace',
                      background: 'var(--bg-base, #131722)',
                      color: '#a5b4fc',
                      border: '1px solid var(--border-color, #2d3343)',
                      borderRadius: '4px',
                      padding: '8px',
                    }}
                  />
                </div>
              ) : (
                <div style={{ color: '#e74c3c', fontSize: '13px' }}>
                  Error: {result.error}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 20px',
            borderTop: '1px solid var(--border-color, #2d3343)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '8px',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              background: 'transparent',
              border: '1px solid var(--border-color, #2d3343)',
              color: 'var(--text-secondary, #94a3b8)',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          {!result?.success && (
            <button
              type="button"
              onClick={handleExecute}
              disabled={loading}
              style={{
                padding: '6px 16px',
                borderRadius: '6px',
                background: isClaim ? '#2ecc71' : '#e74c3c',
                border: 'none',
                color: '#fff',
                fontSize: '12px',
                fontWeight: 600,
                cursor: loading ? 'wait' : 'pointer',
              }}
            >
              {loading ? 'Processing...' : isClaim ? 'Claim Now' : 'Confirm Clawback'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
