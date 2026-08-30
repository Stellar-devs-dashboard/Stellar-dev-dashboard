import React, { useState } from 'react';
import type { FeeBumpSimulationResult } from '../../types/feeBumpSponsorship';
import { verifyPostLedgerTransaction } from '../../lib/feeBumpSponsorship/simulationEngine';
import { useStore } from '../../lib/store';

interface SimulationVerificationPanelProps {
  simulationResult: FeeBumpSimulationResult | null;
  isSimulating: boolean;
  onRunSimulation: () => void;
}

export default function SimulationVerificationPanel({
  simulationResult,
  isSimulating,
  onRunSimulation,
}: SimulationVerificationPanelProps) {
  const { network } = useStore();
  const [copied, setCopied] = useState(false);
  const [verifyHash, setVerifyHash] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<any | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  function handleCopyXdr() {
    if (!simulationResult?.xdrEnvelope) return;
    navigator.clipboard.writeText(simulationResult.xdrEnvelope);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleVerifyTx() {
    if (!verifyHash.trim()) return;
    setVerifying(true);
    setVerifyResult(null);
    setVerifyError(null);
    try {
      const res = await verifyPostLedgerTransaction(verifyHash.trim(), network);
      setVerifyResult(res);
    } catch (err: any) {
      setVerifyError(err.message || 'Verification failed');
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Simulation Trigger Banner */}
      <div
        style={{
          background: 'var(--bg-surface, #1e222d)',
          border: '1px solid var(--border-color, #2d3343)',
          borderRadius: '8px',
          padding: '20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: '16px', color: '#fff' }}>
            Simulate & Verify Transaction Envelope
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary, #94a3b8)' }}>
            Simulate fee consumption, sequence validity, authorization signatures, and reserve thresholds before broadcast.
          </p>
        </div>

        <button
          type="button"
          onClick={onRunSimulation}
          disabled={isSimulating}
          style={{
            padding: '10px 24px',
            borderRadius: '6px',
            background: '#2ecc71',
            border: 'none',
            color: '#fff',
            fontSize: '13px',
            fontWeight: 700,
            cursor: isSimulating ? 'wait' : 'pointer',
          }}
        >
          {isSimulating ? 'Simulating...' : 'Run Simulation'}
        </button>
      </div>

      {/* Simulation Results */}
      {simulationResult && (
        <div
          style={{
            background: 'var(--bg-surface, #1e222d)',
            border: simulationResult.success
              ? '1px solid #2ecc71'
              : '1px solid #e74c3c',
            borderRadius: '8px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span
              style={{
                fontSize: '14px',
                fontWeight: 700,
                color: simulationResult.success ? '#2ecc71' : '#e74c3c',
              }}
            >
              {simulationResult.success ? '✓ Simulation Passed' : '✕ Simulation Failed'}
            </span>

            {simulationResult.success && (
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                Estimated Ledger Sequence: #{simulationResult.simulatedLedger}
              </span>
            )}
          </div>

          {simulationResult.error && (
            <div style={{ color: '#e74c3c', fontSize: '13px' }}>
              {simulationResult.error}
            </div>
          )}

          {/* Metrics breakdown */}
          {simulationResult.success && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '12px',
                background: 'var(--bg-base, #131722)',
                padding: '12px',
                borderRadius: '6px',
              }}
            >
              <div>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>Estimated Fee:</span>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>
                  {simulationResult.estimatedFeeCharged} stroops
                </div>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>CPU Instructions:</span>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>
                  {simulationResult.cpuInstructionsUsed?.toLocaleString() || 'N/A'}
                </div>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>Memory Used:</span>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>
                  {simulationResult.memoryBytesUsed?.toLocaleString() || 'N/A'} bytes
                </div>
              </div>
            </div>
          )}

          {/* XDR Inspection */}
          {simulationResult.xdrEnvelope && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8' }}>
                  Transaction Envelope XDR
                </label>
                <button
                  type="button"
                  onClick={handleCopyXdr}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '4px',
                    background: 'var(--bg-base, #131722)',
                    border: '1px solid var(--border-color, #2d3343)',
                    color: copied ? '#2ecc71' : '#3498db',
                    fontSize: '11px',
                    cursor: 'pointer',
                  }}
                >
                  {copied ? 'Copied ✓' : 'Copy XDR'}
                </button>
              </div>
              <textarea
                readOnly
                value={simulationResult.xdrEnvelope}
                rows={4}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'var(--bg-base, #131722)',
                  border: '1px solid var(--border-color, #2d3343)',
                  borderRadius: '6px',
                  color: '#a5b4fc',
                  fontSize: '11px',
                  fontFamily: 'monospace',
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* Post-Ledger Verification Section */}
      <div
        style={{
          background: 'var(--bg-surface, #1e222d)',
          border: '1px solid var(--border-color, #2d3343)',
          borderRadius: '8px',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}
      >
        <h3 style={{ margin: 0, fontSize: '15px', color: '#fff' }}>
          Post-Ledger Verification
        </h3>
        <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary, #94a3b8)' }}>
          Verify executed fee-bump transactions on-chain to audit fee deductions and reserve allocations.
        </p>

        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            placeholder="Enter submitted transaction hash..."
            value={verifyHash}
            onChange={(e) => setVerifyHash(e.target.value)}
            style={{
              flex: 1,
              padding: '8px 12px',
              background: 'var(--bg-base, #131722)',
              border: '1px solid var(--border-color, #2d3343)',
              borderRadius: '6px',
              color: '#fff',
              fontSize: '13px',
              fontFamily: 'monospace',
            }}
          />
          <button
            type="button"
            onClick={handleVerifyTx}
            disabled={verifying || !verifyHash.trim()}
            style={{
              padding: '8px 18px',
              borderRadius: '6px',
              background: '#3498db',
              border: 'none',
              color: '#fff',
              fontWeight: 600,
              fontSize: '12px',
              cursor: verifying ? 'wait' : 'pointer',
            }}
          >
            {verifying ? 'Verifying...' : 'Verify on Ledger'}
          </button>
        </div>

        {verifyError && (
          <div style={{ color: '#e74c3c', fontSize: '12px' }}>
            {verifyError}
          </div>
        )}

        {verifyResult && (
          <div
            style={{
              background: 'var(--bg-base, #131722)',
              padding: '12px',
              borderRadius: '6px',
              fontSize: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div>
              <span style={{ color: '#94a3b8' }}>Status: </span>
              <strong style={{ color: verifyResult.innerTxSuccess ? '#2ecc71' : '#e74c3c' }}>
                {verifyResult.innerTxSuccess ? 'Success on Ledger' : 'Failed on Ledger'}
              </strong>
            </div>
            <div>
              <span style={{ color: '#94a3b8' }}>Ledger Sequence: </span>
              <span style={{ color: '#fff' }}>#{verifyResult.ledgerSequence}</span>
            </div>
            <div>
              <span style={{ color: '#94a3b8' }}>Fee Account Charged: </span>
              <span style={{ fontFamily: 'monospace', color: '#fff' }}>
                {verifyResult.feeSourceCharged}
              </span>
            </div>
            <div>
              <span style={{ color: '#94a3b8' }}>Actual Fee Paid: </span>
              <span style={{ color: '#fff' }}>{verifyResult.actualFeePaid} stroops</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
