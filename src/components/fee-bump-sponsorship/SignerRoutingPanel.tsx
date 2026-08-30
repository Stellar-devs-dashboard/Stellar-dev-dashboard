import React from 'react';
import type { SignerRequirement } from '../../types/feeBumpSponsorship';

interface SignerRoutingPanelProps {
  signerRequirements: SignerRequirement[];
}

export default function SignerRoutingPanel({ signerRequirements }: SignerRoutingPanelProps) {
  const roleLabels: Record<SignerRequirement['role'], { label: string; color: string }> = {
    inner_source: { label: 'Inner Source Account', color: '#3498db' },
    fee_source: { label: 'Outer Fee Sponsor', color: '#e67e22' },
    operation_source: { label: 'Operation Source', color: '#9b59b6' },
    sponsor: { label: 'Sponsor', color: '#1abc9c' },
    revokee: { label: 'Revoked Account', color: '#e74c3c' },
  };

  const allSatisfied = signerRequirements.every((r) => r.isSatisfied);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header status */}
      <div
        style={{
          background: 'var(--bg-surface, #1e222d)',
          border: '1px solid var(--border-color, #2d3343)',
          borderRadius: '8px',
          padding: '16px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: '16px', color: '#fff' }}>
            Signer Authorization Matrix
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary, #94a3b8)' }}>
            All participant accounts must meet their required threshold weights for the transaction envelope to be valid.
          </p>
        </div>

        <span
          style={{
            fontSize: '12px',
            fontWeight: 700,
            padding: '6px 14px',
            borderRadius: '16px',
            background: allSatisfied ? 'rgba(46, 204, 113, 0.15)' : 'rgba(241, 196, 15, 0.15)',
            color: allSatisfied ? '#2ecc71' : '#f1c40f',
          }}
        >
          {allSatisfied ? '✓ All Signatures Satisfied' : 'Pending Required Signatures'}
        </span>
      </div>

      {/* List of Required Accounts */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {signerRequirements.map((req, idx) => {
          const roleInfo = roleLabels[req.role] || { label: req.role, color: '#94a3b8' };

          return (
            <div
              key={idx}
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      fontSize: '11px',
                      textTransform: 'uppercase',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      background: `${roleInfo.color}22`,
                      color: roleInfo.color,
                      fontWeight: 700,
                    }}
                  >
                    {roleInfo.label}
                  </span>
                  <span style={{ fontFamily: 'monospace', fontSize: '13px', color: '#fff' }}>
                    {req.account}
                  </span>
                </div>

                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: req.isSatisfied ? '#2ecc71' : '#e74c3c',
                  }}
                >
                  Weight: {req.availableWeight} / {req.requiredWeight} ({req.isSatisfied ? 'Ready' : 'Missing Signature'})
                </span>
              </div>

              {/* Signers list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {req.signers.map((s, sIdx) => (
                  <div
                    key={sIdx}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '6px 10px',
                      background: 'var(--bg-base, #131722)',
                      borderRadius: '4px',
                      fontSize: '12px',
                    }}
                  >
                    <span style={{ fontFamily: 'monospace', color: 'var(--text-secondary, #94a3b8)' }}>
                      Key: {s.key} (Weight: {s.weight})
                    </span>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        color: s.hasSigned ? '#2ecc71' : '#f39c12',
                      }}
                    >
                      {s.hasSigned ? 'Signed ✓' : 'Awaiting signature'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
