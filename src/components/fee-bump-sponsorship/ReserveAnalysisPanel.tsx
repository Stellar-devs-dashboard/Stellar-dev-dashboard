import React from 'react';
import type { ReserveRequirementBreakdown } from '../../types/feeBumpSponsorship';

interface ReserveAnalysisPanelProps {
  reserveBreakdown: ReserveRequirementBreakdown;
}

export default function ReserveAnalysisPanel({ reserveBreakdown }: ReserveAnalysisPanelProps) {
  const { totalReserveRequiredXLM, totalEntriesCount, sponsorObligations, impactItems } =
    reserveBreakdown;

  const sponsorsList = Object.values(sponsorObligations);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Metric Tiles */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px',
        }}
      >
        <div
          style={{
            background: 'var(--bg-surface, #1e222d)',
            border: '1px solid var(--border-color, #2d3343)',
            borderRadius: '8px',
            padding: '16px',
          }}
        >
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted, #64748b)', fontWeight: 700 }}>
            Total Reserve Locked
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#3498db', marginTop: '4px' }}>
            {totalReserveRequiredXLM.toFixed(2)} XLM
          </div>
        </div>

        <div
          style={{
            background: 'var(--bg-surface, #1e222d)',
            border: '1px solid var(--border-color, #2d3343)',
            borderRadius: '8px',
            padding: '16px',
          }}
        >
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted, #64748b)', fontWeight: 700 }}>
            Modified Ledger Entries
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#fff', marginTop: '4px' }}>
            {totalEntriesCount}
          </div>
        </div>

        <div
          style={{
            background: 'var(--bg-surface, #1e222d)',
            border: '1px solid var(--border-color, #2d3343)',
            borderRadius: '8px',
            padding: '16px',
          }}
        >
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted, #64748b)', fontWeight: 700 }}>
            Active Sponsors
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#9b59b6', marginTop: '4px' }}>
            {sponsorsList.length}
          </div>
        </div>
      </div>

      {/* Sponsor Obligations Table */}
      {sponsorsList.length > 0 && (
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
          <h3 style={{ margin: 0, fontSize: '15px', color: '#fff' }}>
            Sponsor Liability Allocations
          </h3>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color, #2d3343)', color: '#94a3b8', textAlign: 'left' }}>
                  <th style={{ padding: '8px' }}>Sponsor Address</th>
                  <th style={{ padding: '8px' }}>Sponsored Entries</th>
                  <th style={{ padding: '8px' }}>Reserve Liability</th>
                  <th style={{ padding: '8px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {sponsorsList.map((s, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--border-color, #2d3343)' }}>
                    <td style={{ padding: '8px', fontFamily: 'monospace', color: '#fff' }}>
                      {s.sponsorAddress}
                    </td>
                    <td style={{ padding: '8px', color: '#fff' }}>{s.sponsoredEntriesCount}</td>
                    <td style={{ padding: '8px', fontWeight: 600, color: '#3498db' }}>
                      {s.totalReserveXLM.toFixed(2)} XLM
                    </td>
                    <td style={{ padding: '8px' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: s.isSufficient ? 'rgba(46, 204, 113, 0.15)' : 'rgba(231, 76, 60, 0.15)',
                          color: s.isSufficient ? '#2ecc71' : '#e74c3c',
                        }}
                      >
                        {s.isSufficient ? 'Sufficient' : 'Insufficient Balance'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Entry Impact Breakdown List */}
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
        <h3 style={{ margin: 0, fontSize: '15px', color: '#fff' }}>
          Detailed Entry Reserve Impact
        </h3>

        {impactItems.length === 0 ? (
          <div style={{ color: 'var(--text-muted, #64748b)', fontSize: '13px' }}>
            No reserve-consuming operations in current transaction.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {impactItems.map((item, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 12px',
                  background: 'var(--bg-base, #131722)',
                  borderRadius: '6px',
                  fontSize: '13px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      fontSize: '10px',
                      textTransform: 'uppercase',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      background: item.isSponsored ? 'rgba(155, 89, 182, 0.2)' : 'rgba(52, 152, 219, 0.2)',
                      color: item.isSponsored ? '#9b59b6' : '#3498db',
                    }}
                  >
                    {item.isSponsored ? 'Sponsored' : 'Self-Funded'}
                  </span>
                  <span style={{ color: '#fff', fontWeight: 600 }}>{item.name}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#94a3b8' }}>
                    {item.responsibleAccount.slice(0, 8)}...
                  </span>
                  <span
                    style={{
                      fontWeight: 700,
                      color: item.reserveAmountXLM >= 0 ? '#2ecc71' : '#e74c3c',
                    }}
                  >
                    {item.reserveAmountXLM > 0 ? `+${item.reserveAmountXLM} XLM` : `${item.reserveAmountXLM} XLM`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
