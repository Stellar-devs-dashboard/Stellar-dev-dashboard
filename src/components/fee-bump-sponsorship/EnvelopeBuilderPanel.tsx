import React from 'react';
import type { FeeBumpEnvelopeModel } from '../../types/feeBumpSponsorship';

interface EnvelopeBuilderPanelProps {
  envelope: FeeBumpEnvelopeModel;
  onChange: (updated: FeeBumpEnvelopeModel) => void;
  connectedAddress: string;
}

export default function EnvelopeBuilderPanel({
  envelope,
  onChange,
  connectedAddress,
}: EnvelopeBuilderPanelProps) {
  const { isFeeBump, feeSource, maxFee, innerTransaction } = envelope;

  const minRequiredMaxFee =
    parseInt(innerTransaction.baseFee || '100', 10) *
    (Math.max(1, innerTransaction.operations.length) + 1);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      }}
    >
      {/* Outer Fee-Bump Configuration Section */}
      <div
        style={{
          background: 'var(--bg-surface, #1e222d)',
          border: isFeeBump ? '1px solid #3498db' : '1px solid var(--border-color, #2d3343)',
          borderRadius: '8px',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', color: '#fff' }}>
              Outer Fee-Bump Wrapper
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary, #94a3b8)' }}>
              Enables a sponsor/relayer to pay fees on behalf of the inner transaction without consuming sequence numbers.
            </p>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={isFeeBump}
              onChange={(e) => onChange({ ...envelope, isFeeBump: e.target.checked })}
              style={{ width: '16px', height: '16px', cursor: 'pointer' }}
            />
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>
              Enable Fee-Bump
            </span>
          </label>
        </div>

        {isFeeBump && (
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ fontSize: '12px', color: 'var(--text-secondary, #94a3b8)', display: 'block', marginBottom: '6px' }}>
                Fee Source Account (G...)
              </label>
              <input
                type="text"
                value={feeSource}
                onChange={(e) => onChange({ ...envelope, feeSource: e.target.value })}
                placeholder="G... (Sponsor / Relayer address)"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'var(--bg-base, #131722)',
                  border: '1px solid var(--border-color, #2d3343)',
                  borderRadius: '6px',
                  color: '#fff',
                  fontSize: '13px',
                  fontFamily: 'monospace',
                }}
              />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary, #94a3b8)' }}>
                  Max Fee (Stroops)
                </label>
                <button
                  type="button"
                  onClick={() => onChange({ ...envelope, maxFee: String(minRequiredMaxFee) })}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#3498db',
                    fontSize: '11px',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  Min ({minRequiredMaxFee})
                </button>
              </div>
              <input
                type="number"
                min={minRequiredMaxFee}
                value={maxFee}
                onChange={(e) => onChange({ ...envelope, maxFee: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'var(--bg-base, #131722)',
                  border: '1px solid var(--border-color, #2d3343)',
                  borderRadius: '6px',
                  color: '#fff',
                  fontSize: '13px',
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Inner Transaction Envelope Settings */}
      <div
        style={{
          background: 'var(--bg-surface, #1e222d)',
          border: '1px solid var(--border-color, #2d3343)',
          borderRadius: '8px',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <h3 style={{ margin: 0, fontSize: '16px', color: '#fff' }}>
          Inner Transaction Parameters
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '16px' }}>
          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary, #94a3b8)', display: 'block', marginBottom: '6px' }}>
              Source Account (Signer & Sequence Owner)
            </label>
            <input
              type="text"
              value={innerTransaction.sourceAccount}
              onChange={(e) =>
                onChange({
                  ...envelope,
                  innerTransaction: {
                    ...innerTransaction,
                    sourceAccount: e.target.value,
                  },
                })
              }
              placeholder="G..."
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'var(--bg-base, #131722)',
                border: '1px solid var(--border-color, #2d3343)',
                borderRadius: '6px',
                color: '#fff',
                fontSize: '13px',
                fontFamily: 'monospace',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary, #94a3b8)', display: 'block', marginBottom: '6px' }}>
              Sequence Number
            </label>
            <input
              type="text"
              value={innerTransaction.sequenceNumber}
              onChange={(e) =>
                onChange({
                  ...envelope,
                  innerTransaction: {
                    ...innerTransaction,
                    sequenceNumber: e.target.value,
                  },
                })
              }
              placeholder="e.g. 1000"
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'var(--bg-base, #131722)',
                border: '1px solid var(--border-color, #2d3343)',
                borderRadius: '6px',
                color: '#fff',
                fontSize: '13px',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary, #94a3b8)', display: 'block', marginBottom: '6px' }}>
              Base Fee (Stroops)
            </label>
            <input
              type="number"
              min="100"
              value={innerTransaction.baseFee}
              onChange={(e) =>
                onChange({
                  ...envelope,
                  innerTransaction: {
                    ...innerTransaction,
                    baseFee: e.target.value,
                  },
                })
              }
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'var(--bg-base, #131722)',
                border: '1px solid var(--border-color, #2d3343)',
                borderRadius: '6px',
                color: '#fff',
                fontSize: '13px',
              }}
            />
          </div>
        </div>

        {/* Memo & Time Bounds */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px' }}>
          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary, #94a3b8)', display: 'block', marginBottom: '6px' }}>
              Memo Type
            </label>
            <select
              value={innerTransaction.memo?.type || 'none'}
              onChange={(e) =>
                onChange({
                  ...envelope,
                  innerTransaction: {
                    ...innerTransaction,
                    memo: {
                      type: e.target.value as any,
                      value: innerTransaction.memo?.value || '',
                    },
                  },
                })
              }
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'var(--bg-base, #131722)',
                border: '1px solid var(--border-color, #2d3343)',
                borderRadius: '6px',
                color: '#fff',
                fontSize: '13px',
              }}
            >
              <option value="none">None</option>
              <option value="text">MEMO_TEXT</option>
              <option value="id">MEMO_ID</option>
            </select>
          </div>

          {innerTransaction.memo?.type && innerTransaction.memo.type !== 'none' && (
            <div>
              <label style={{ fontSize: '12px', color: 'var(--text-secondary, #94a3b8)', display: 'block', marginBottom: '6px' }}>
                Memo Value
              </label>
              <input
                type="text"
                value={innerTransaction.memo.value}
                onChange={(e) =>
                  onChange({
                    ...envelope,
                    innerTransaction: {
                      ...innerTransaction,
                      memo: {
                        type: innerTransaction.memo!.type,
                        value: e.target.value,
                      },
                    },
                  })
                }
                placeholder="Memo content..."
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'var(--bg-base, #131722)',
                  border: '1px solid var(--border-color, #2d3343)',
                  borderRadius: '6px',
                  color: '#fff',
                  fontSize: '13px',
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
