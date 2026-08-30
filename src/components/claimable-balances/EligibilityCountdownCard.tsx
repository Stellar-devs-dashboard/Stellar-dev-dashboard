import React, { useState, useEffect } from 'react';
import type {
  ClaimableBalanceLifecycleRecord,
  ClaimantEvaluation,
  LifecycleStatus,
} from '../../types/claimableBalanceExplorer';

interface EligibilityCountdownCardProps {
  balance: ClaimableBalanceLifecycleRecord;
  currentAddress?: string;
  onClaim?: (balanceId: string) => void;
  onClawback?: (balanceId: string) => void;
}

export default function EligibilityCountdownCard({
  balance,
  currentAddress,
  onClaim,
  onClawback,
}: EligibilityCountdownCardProps) {
  const [nowEpoch, setNowEpoch] = useState<number>(Math.floor(Date.now() / 1000));

  useEffect(() => {
    const timer = setInterval(() => {
      setNowEpoch(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const claimantForCurrent = currentAddress
    ? balance.claimants.find((c) => c.destination === currentAddress)
    : balance.claimants[0];

  const isEligible = claimantForCurrent?.evaluation.isEligibleNow || balance.overallStatus === 'claimable';

  const statusColors: Record<LifecycleStatus, { bg: string; text: string; label: string }> = {
    claimable: { bg: 'rgba(46, 204, 113, 0.15)', text: '#2ecc71', label: 'Claimable Now' },
    locked_pending_time: { bg: 'rgba(241, 196, 15, 0.15)', text: '#f1c40f', label: 'Time-Locked' },
    expired: { bg: 'rgba(231, 76, 60, 0.15)', text: '#e74c3c', label: 'Expired' },
    claimed: { bg: 'rgba(52, 152, 219, 0.15)', text: '#3498db', label: 'Claimed' },
    clawed_back: { bg: 'rgba(155, 89, 182, 0.15)', text: '#9b59b6', label: 'Clawed Back' },
    unknown: { bg: 'rgba(149, 165, 166, 0.15)', text: '#95a5a6', label: 'Pending Evaluation' },
  };

  const currentStatusInfo = statusColors[balance.overallStatus] || statusColors.unknown;

  return (
    <div
      style={{
        background: 'var(--bg-surface, #1e222d)',
        border: '1px solid var(--border-color, #2d3343)',
        borderRadius: '8px',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              fontWeight: 700,
              fontSize: '15px',
              color: 'var(--text-primary, #fff)',
            }}
          >
            {balance.amount} {balance.assetCode || 'XLM'}
          </span>
          {balance.flags?.clawbackEnabled && (
            <span
              style={{
                fontSize: '10px',
                padding: '2px 6px',
                borderRadius: '4px',
                background: 'rgba(231, 76, 60, 0.2)',
                color: '#e74c3c',
                fontWeight: 600,
              }}
            >
              Clawback Enabled
            </span>
          )}
        </div>

        <span
          style={{
            fontSize: '12px',
            fontWeight: 600,
            padding: '4px 10px',
            borderRadius: '12px',
            background: currentStatusInfo.bg,
            color: currentStatusInfo.text,
          }}
        >
          {currentStatusInfo.label}
        </span>
      </div>

      {/* ID & Sponsor */}
      <div style={{ fontSize: '11px', color: 'var(--text-muted, #64748b)' }}>
        ID: <span style={{ fontFamily: 'monospace' }}>{balance.id.slice(0, 16)}...{balance.id.slice(-8)}</span>
        {balance.sponsor && (
          <span style={{ marginLeft: '12px' }}>
            Sponsor: <span style={{ fontFamily: 'monospace' }}>{balance.sponsor.slice(0, 8)}...</span>
          </span>
        )}
      </div>

      {/* Claimants list summary */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary, #94a3b8)' }}>
          Claimants ({balance.claimants.length}):
        </div>
        {balance.claimants.map((c, idx) => (
          <div
            key={idx}
            style={{
              fontSize: '12px',
              padding: '6px 10px',
              background: 'var(--bg-base, #131722)',
              borderRadius: '4px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span style={{ fontFamily: 'monospace', color: 'var(--text-primary, #fff)' }}>
              {c.destination === currentAddress ? '★ (You) ' : ''}
              {c.destination.slice(0, 10)}...{c.destination.slice(-6)}
            </span>
            <span
              style={{
                fontSize: '11px',
                color: c.evaluation.isEligibleNow ? '#2ecc71' : '#f1c40f',
              }}
            >
              {c.evaluation.isEligibleNow ? 'Eligible' : 'Locked'}
            </span>
          </div>
        ))}
      </div>

      {/* Action Buttons */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: '8px',
          marginTop: '8px',
        }}
      >
        {balance.flags?.clawbackEnabled && onClawback && (
          <button
            type="button"
            onClick={() => onClawback(balance.id)}
            style={{
              padding: '6px 12px',
              borderRadius: '4px',
              background: 'transparent',
              border: '1px solid #e74c3c',
              color: '#e74c3c',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            Clawback
          </button>
        )}

        {onClaim && (
          <button
            type="button"
            disabled={!isEligible}
            onClick={() => onClaim(balance.id)}
            style={{
              padding: '6px 16px',
              borderRadius: '4px',
              background: isEligible ? '#2ecc71' : 'var(--bg-muted, #2a2e3d)',
              border: 'none',
              color: isEligible ? '#fff' : 'var(--text-muted, #64748b)',
              fontSize: '12px',
              fontWeight: 600,
              cursor: isEligible ? 'pointer' : 'not-allowed',
            }}
          >
            {isEligible ? 'Claim Balance' : 'Locked'}
          </button>
        )}
      </div>
    </div>
  );
}
