import React, { useState } from 'react';
import type {
  SponsoredOperationEntry,
  SponsorshipOperationType,
  SponsorshipBoundary,
} from '../../types/feeBumpSponsorship';

interface SponsorshipTreePanelProps {
  operations: SponsoredOperationEntry[];
  boundaries: SponsorshipBoundary[];
  unbalancedErrors: string[];
  onAddOperation: (type?: SponsorshipOperationType) => void;
  onUpdateOperation: (id: string, updates: Partial<SponsoredOperationEntry>) => void;
  onRemoveOperation: (id: string) => void;
  onSponsorOperations: (sponsor: string, sponsoredAccount: string) => void;
  onAddRevokeOperation: (params: any) => void;
}

export default function SponsorshipTreePanel({
  operations,
  boundaries,
  unbalancedErrors,
  onAddOperation,
  onUpdateOperation,
  onRemoveOperation,
  onSponsorOperations,
  onAddRevokeOperation,
}: SponsorshipTreePanelProps) {
  const [showWrapModal, setShowWrapModal] = useState(false);
  const [wrapSponsor, setWrapSponsor] = useState('');
  const [wrapSponsored, setWrapSponsored] = useState('');

  const [showRevokeModal, setShowRevokeModal] = useState(false);
  const [revokeType, setRevokeType] = useState<'account' | 'trustline' | 'offer' | 'data' | 'claimableBalance' | 'signer'>('trustline');
  const [revokeAccount, setRevokeAccount] = useState('');
  const [revokeAssetCode, setRevokeAssetCode] = useState('USDC');
  const [revokeAssetIssuer, setRevokeAssetIssuer] = useState('');

  function handleWrapSubmit() {
    if (!wrapSponsor || !wrapSponsored) return;
    onSponsorOperations(wrapSponsor, wrapSponsored);
    setShowWrapModal(false);
  }

  function handleRevokeSubmit() {
    onAddRevokeOperation({
      type: revokeType,
      account: revokeAccount,
      assetCode: revokeAssetCode,
      assetIssuer: revokeAssetIssuer,
    });
    setShowRevokeModal(false);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Action Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '15px', fontWeight: 700, color: '#fff' }}>
            Inner Operations ({operations.length})
          </span>
          <span
            style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '12px',
              background:
                unbalancedErrors.length === 0
                  ? 'rgba(46, 204, 113, 0.15)'
                  : 'rgba(231, 76, 60, 0.15)',
              color: unbalancedErrors.length === 0 ? '#2ecc71' : '#e74c3c',
            }}
          >
            {unbalancedErrors.length === 0
              ? `${boundaries.length} Sponsorship Boundary${boundaries.length !== 1 ? 'ies' : 'y'}`
              : `${unbalancedErrors.length} Boundary Error${unbalancedErrors.length > 1 ? 's' : ''}`}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setShowWrapModal(true)}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              background: 'rgba(155, 89, 182, 0.2)',
              border: '1px solid #9b59b6',
              color: '#9b59b6',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Wrap in Sponsorship
          </button>

          <button
            type="button"
            onClick={() => setShowRevokeModal(true)}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              background: 'rgba(231, 76, 60, 0.2)',
              border: '1px solid #e74c3c',
              color: '#e74c3c',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            + Revoke Sponsorship
          </button>

          <button
            type="button"
            onClick={() => onAddOperation('payment')}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              background: '#3498db',
              border: 'none',
              color: '#fff',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            + Add Operation
          </button>
        </div>
      </div>

      {/* Unbalanced Error Banner */}
      {unbalancedErrors.length > 0 && (
        <div
          style={{
            background: 'rgba(231, 76, 60, 0.1)',
            border: '1px solid #e74c3c',
            borderRadius: '6px',
            padding: '12px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          <strong style={{ color: '#e74c3c', fontSize: '13px' }}>
            Unbalanced Sponsorship Boundaries:
          </strong>
          {unbalancedErrors.map((err, idx) => (
            <div key={idx} style={{ color: '#ff7675', fontSize: '12px' }}>
              • {err}
            </div>
          ))}
        </div>
      )}

      {/* Operations List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {operations.map((op, idx) => {
          const isBegin = op.type === 'beginSponsoringFutureReserves';
          const isEnd = op.type === 'endSponsoringFutureReserves';
          const isRevoke = op.type === 'revokeSponsorship';

          let borderStyle = '1px solid var(--border-color, #2d3343)';
          let bgStyle = 'var(--bg-surface, #1e222d)';

          if (isBegin || isEnd) {
            borderStyle = '1px dashed #9b59b6';
            bgStyle = 'rgba(155, 89, 182, 0.06)';
          } else if (isRevoke) {
            borderStyle = '1px dashed #e74c3c';
            bgStyle = 'rgba(231, 76, 60, 0.06)';
          }

          return (
            <div
              key={op.id}
              style={{
                background: bgStyle,
                border: borderStyle,
                borderRadius: '8px',
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              {/* Op Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted, #64748b)' }}>
                    #{idx + 1}
                  </span>
                  <select
                    value={op.type}
                    onChange={(e) =>
                      onUpdateOperation(op.id, { type: e.target.value as SponsorshipOperationType })
                    }
                    style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      padding: '4px 8px',
                      borderRadius: '4px',
                      background: 'var(--bg-base, #131722)',
                      border: '1px solid var(--border-color, #2d3343)',
                      color: '#fff',
                    }}
                  >
                    <option value="payment">Payment</option>
                    <option value="createAccount">Create Account</option>
                    <option value="changeTrust">Change Trust</option>
                    <option value="manageData">Manage Data</option>
                    <option value="setOptions">Set Options / Multi-Sig</option>
                    <option value="beginSponsoringFutureReserves">Begin Sponsoring Future Reserves</option>
                    <option value="endSponsoringFutureReserves">End Sponsoring Future Reserves</option>
                    <option value="revokeSponsorship">Revoke Sponsorship</option>
                  </select>
                </div>

                {operations.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onRemoveOperation(op.id)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#e74c3c',
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    Delete
                  </button>
                )}
              </div>

              {/* Op Parameters */}
              {isBegin && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                      Sponsor Address (Source)
                    </label>
                    <input
                      type="text"
                      placeholder="G... (Sponsor Key)"
                      value={op.sourceAccount || ''}
                      onChange={(e) => onUpdateOperation(op.id, { sourceAccount: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        background: 'var(--bg-base, #131722)',
                        border: '1px solid var(--border-color, #2d3343)',
                        borderRadius: '4px',
                        color: '#fff',
                        fontSize: '12px',
                        fontFamily: 'monospace',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                      Sponsored Account (sponsoredId)
                    </label>
                    <input
                      type="text"
                      placeholder="G... (Sponsored Target)"
                      value={op.params.sponsoredId || ''}
                      onChange={(e) =>
                        onUpdateOperation(op.id, {
                          params: { ...op.params, sponsoredId: e.target.value },
                        })
                      }
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        background: 'var(--bg-base, #131722)',
                        border: '1px solid var(--border-color, #2d3343)',
                        borderRadius: '4px',
                        color: '#fff',
                        fontSize: '12px',
                        fontFamily: 'monospace',
                      }}
                    />
                  </div>
                </div>
              )}

              {op.type === 'payment' && (
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                      Destination Address
                    </label>
                    <input
                      type="text"
                      placeholder="G..."
                      value={op.params.destination || ''}
                      onChange={(e) =>
                        onUpdateOperation(op.id, {
                          params: { ...op.params, destination: e.target.value },
                        })
                      }
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        background: 'var(--bg-base, #131722)',
                        border: '1px solid var(--border-color, #2d3343)',
                        borderRadius: '4px',
                        color: '#fff',
                        fontSize: '12px',
                        fontFamily: 'monospace',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                      Amount (XLM)
                    </label>
                    <input
                      type="number"
                      value={op.params.amount || '1'}
                      onChange={(e) =>
                        onUpdateOperation(op.id, {
                          params: { ...op.params, amount: e.target.value },
                        })
                      }
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        background: 'var(--bg-base, #131722)',
                        border: '1px solid var(--border-color, #2d3343)',
                        borderRadius: '4px',
                        color: '#fff',
                        fontSize: '12px',
                      }}
                    />
                  </div>
                </div>
              )}

              {op.type === 'changeTrust' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px' }}>
                  <div>
                    <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                      Asset Code
                    </label>
                    <input
                      type="text"
                      placeholder="USDC"
                      value={op.params.assetCode || ''}
                      onChange={(e) =>
                        onUpdateOperation(op.id, {
                          params: { ...op.params, assetCode: e.target.value },
                        })
                      }
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        background: 'var(--bg-base, #131722)',
                        border: '1px solid var(--border-color, #2d3343)',
                        borderRadius: '4px',
                        color: '#fff',
                        fontSize: '12px',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                      Issuer Public Key (G...)
                    </label>
                    <input
                      type="text"
                      placeholder="G..."
                      value={op.params.assetIssuer || ''}
                      onChange={(e) =>
                        onUpdateOperation(op.id, {
                          params: { ...op.params, assetIssuer: e.target.value },
                        })
                      }
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        background: 'var(--bg-base, #131722)',
                        border: '1px solid var(--border-color, #2d3343)',
                        borderRadius: '4px',
                        color: '#fff',
                        fontSize: '12px',
                        fontFamily: 'monospace',
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Wrap Modal */}
      {showWrapModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
        >
          <div
            style={{
              background: 'var(--bg-surface, #1e222d)',
              border: '1px solid var(--border-color, #2d3343)',
              borderRadius: '8px',
              padding: '20px',
              width: '460px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <h3 style={{ margin: 0, color: '#fff', fontSize: '16px' }}>
              Wrap Operations in Sponsored Block
            </h3>
            <div>
              <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                Sponsor Public Key (G...)
              </label>
              <input
                type="text"
                value={wrapSponsor}
                onChange={(e) => setWrapSponsor(e.target.value)}
                placeholder="G... (Sponsor funding reserves)"
                style={{
                  width: '100%',
                  padding: '8px',
                  background: 'var(--bg-base, #131722)',
                  border: '1px solid var(--border-color, #2d3343)',
                  borderRadius: '4px',
                  color: '#fff',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                Sponsored Target Account (G...)
              </label>
              <input
                type="text"
                value={wrapSponsored}
                onChange={(e) => setWrapSponsored(e.target.value)}
                placeholder="G... (Target beneficiary)"
                style={{
                  width: '100%',
                  padding: '8px',
                  background: 'var(--bg-base, #131722)',
                  border: '1px solid var(--border-color, #2d3343)',
                  borderRadius: '4px',
                  color: '#fff',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setShowWrapModal(false)}
                style={{
                  padding: '6px 12px',
                  background: 'transparent',
                  border: '1px solid var(--border-color, #2d3343)',
                  color: '#94a3b8',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleWrapSubmit}
                style={{
                  padding: '6px 16px',
                  background: '#9b59b6',
                  border: 'none',
                  color: '#fff',
                  borderRadius: '4px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Apply Sponsorship
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revoke Sponsorship Modal */}
      {showRevokeModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
        >
          <div
            style={{
              background: 'var(--bg-surface, #1e222d)',
              border: '1px solid var(--border-color, #2d3343)',
              borderRadius: '8px',
              padding: '20px',
              width: '460px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <h3 style={{ margin: 0, color: '#fff', fontSize: '16px' }}>
              Revoke Sponsorship Operation
            </h3>
            <div>
              <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                Revocation Target Type
              </label>
              <select
                value={revokeType}
                onChange={(e) => setRevokeType(e.target.value as any)}
                style={{
                  width: '100%',
                  padding: '8px',
                  background: 'var(--bg-base, #131722)',
                  border: '1px solid var(--border-color, #2d3343)',
                  borderRadius: '4px',
                  color: '#fff',
                  fontSize: '12px',
                }}
              >
                <option value="account">Account Reserve</option>
                <option value="trustline">Trustline Reserve</option>
                <option value="offer">DEX Offer Reserve</option>
                <option value="data">Data Entry Reserve</option>
                <option value="claimableBalance">Claimable Balance Reserve</option>
                <option value="signer">Signer Reserve</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                Account Address (G...)
              </label>
              <input
                type="text"
                value={revokeAccount}
                onChange={(e) => setRevokeAccount(e.target.value)}
                placeholder="G..."
                style={{
                  width: '100%',
                  padding: '8px',
                  background: 'var(--bg-base, #131722)',
                  border: '1px solid var(--border-color, #2d3343)',
                  borderRadius: '4px',
                  color: '#fff',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setShowRevokeModal(false)}
                style={{
                  padding: '6px 12px',
                  background: 'transparent',
                  border: '1px solid var(--border-color, #2d3343)',
                  color: '#94a3b8',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRevokeSubmit}
                style={{
                  padding: '6px 16px',
                  background: '#e74c3c',
                  border: 'none',
                  color: '#fff',
                  borderRadius: '4px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Add Revocation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
