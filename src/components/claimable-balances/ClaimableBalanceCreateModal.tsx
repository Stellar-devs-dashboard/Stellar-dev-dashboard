import React, { useState } from 'react';
import { useStore } from '../../lib/store';
import { isValidPublicKey } from '../../lib/stellar';
import VisualPredicateBuilder from './VisualPredicateBuilder';
import {
  buildCreateClaimableBalanceTransaction,
  validateClaimableBalanceParams,
  estimateClaimableBalanceReserves,
} from '../../lib/claimableBalance/composerEngine';
import {
  createUnconditional,
  generateNodeId,
} from '../../lib/claimableBalance/predicateTree';
import type {
  ClaimantEntry,
  PredicateNode,
  PredicateTemplate,
} from '../../types/claimableBalanceExplorer';

interface ClaimableBalanceCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  templates: PredicateTemplate[];
  onSuccess?: () => void;
}

export default function ClaimableBalanceCreateModal({
  isOpen,
  onClose,
  templates,
  onSuccess,
}: ClaimableBalanceCreateModalProps) {
  const { connectedAddress, network } = useStore();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [assetType, setAssetType] = useState<'native' | 'credit_alphanum4' | 'credit_alphanum12'>('native');
  const [assetCode, setAssetCode] = useState('XLM');
  const [assetIssuer, setAssetIssuer] = useState('');
  const [amount, setAmount] = useState('10');
  const [sponsor, setSponsor] = useState('');

  const [claimants, setClaimants] = useState<ClaimantEntry[]>([
    {
      id: generateNodeId('claimant'),
      destination: '',
      predicate: createUnconditional(),
    },
  ]);

  const [simulating, setSimulating] = useState(false);
  const [simulationResult, setSimulationResult] = useState<{
    success: boolean;
    xdr?: string;
    error?: string;
  } | null>(null);

  if (!isOpen) return null;

  const reserveEstimate = estimateClaimableBalanceReserves(claimants.length, sponsor || undefined);

  function handleAddClaimant() {
    if (claimants.length >= 10) return;
    setClaimants((prev) => [
      ...prev,
      {
        id: generateNodeId('claimant'),
        destination: '',
        predicate: createUnconditional(),
      },
    ]);
  }

  function handleRemoveClaimant(id: string) {
    if (claimants.length <= 1) return;
    setClaimants((prev) => prev.filter((c) => c.id !== id));
  }

  function handleUpdateDestination(id: string, destination: string) {
    setClaimants((prev) =>
      prev.map((c) => (c.id === id ? { ...c, destination } : c))
    );
  }

  function handleUpdatePredicate(id: string, predicate: PredicateNode) {
    setClaimants((prev) =>
      prev.map((c) => (c.id === id ? { ...c, predicate } : c))
    );
  }

  function handleApplyTemplate(id: string, template: PredicateTemplate) {
    handleUpdatePredicate(id, template.predicate);
  }

  async function handleSimulate() {
    setSimulating(true);
    setSimulationResult(null);
    try {
      const tx = await buildCreateClaimableBalanceTransaction(
        {
          asset: {
            type: assetType,
            code: assetType === 'native' ? 'XLM' : assetCode,
            issuer: assetType === 'native' ? '' : assetIssuer,
          },
          amount,
          claimants,
          sponsor: sponsor || undefined,
          sourceAccount: connectedAddress,
        },
        network
      );

      const xdr = tx.toXDR();
      setSimulationResult({
        success: true,
        xdr,
      });
      setStep(4);
    } catch (err: any) {
      setSimulationResult({
        success: false,
        error: err.message || 'Simulation error',
      });
    } finally {
      setSimulating(false);
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
          maxWidth: '840px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
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
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', color: 'var(--text-primary, #fff)' }}>
              Create Claimable Balance
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-muted, #64748b)' }}>
              Configure custom predicates, multiple claimants, and reserve sponsorship.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted, #64748b)',
              fontSize: '20px',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        {/* Wizard Steps Navigation */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--border-color, #2d3343)',
            background: 'var(--bg-base, #131722)',
          }}
        >
          {[
            { num: 1, title: '1. Asset & Amount' },
            { num: 2, title: '2. Claimants & Rules' },
            { num: 3, title: '3. Reserves & Sponsor' },
            { num: 4, title: '4. Review & Build' },
          ].map((s) => (
            <button
              key={s.num}
              type="button"
              onClick={() => setStep(s.num as any)}
              style={{
                flex: 1,
                padding: '10px 12px',
                border: 'none',
                background: step === s.num ? 'rgba(52, 152, 219, 0.1)' : 'transparent',
                borderBottom: step === s.num ? '2px solid #3498db' : 'none',
                color: step === s.num ? '#3498db' : 'var(--text-secondary, #94a3b8)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {s.title}
            </button>
          ))}
        </div>

        {/* Content Body */}
        <div
          style={{
            padding: '20px',
            overflowY: 'auto',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          {/* Step 1: Asset & Amount */}
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary, #94a3b8)', display: 'block', marginBottom: '6px' }}>
                  Asset Type
                </label>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <label style={{ fontSize: '13px', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="assetType"
                      checked={assetType === 'native'}
                      onChange={() => {
                        setAssetType('native');
                        setAssetCode('XLM');
                        setAssetIssuer('');
                      }}
                    />
                    Native (XLM)
                  </label>
                  <label style={{ fontSize: '13px', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="assetType"
                      checked={assetType !== 'native'}
                      onChange={() => {
                        setAssetType('credit_alphanum4');
                        setAssetCode('USDC');
                      }}
                    />
                    Custom Issued Asset
                  </label>
                </div>
              </div>

              {assetType !== 'native' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px' }}>
                  <div>
                    <label style={{ fontSize: '12px', color: 'var(--text-secondary, #94a3b8)', display: 'block', marginBottom: '6px' }}>
                      Asset Code
                    </label>
                    <input
                      type="text"
                      value={assetCode}
                      onChange={(e) => setAssetCode(e.target.value)}
                      placeholder="e.g. USDC"
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
                      Issuer Public Key (G...)
                    </label>
                    <input
                      type="text"
                      value={assetIssuer}
                      onChange={(e) => setAssetIssuer(e.target.value)}
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
                </div>
              )}

              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary, #94a3b8)', display: 'block', marginBottom: '6px' }}>
                  Amount to Deposit
                </label>
                <input
                  type="number"
                  min="0.0000001"
                  step="any"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: 'var(--bg-base, #131722)',
                    border: '1px solid var(--border-color, #2d3343)',
                    borderRadius: '6px',
                    color: '#fff',
                    fontSize: '14px',
                    fontWeight: 600,
                  }}
                />
              </div>
            </div>
          )}

          {/* Step 2: Claimants & Rules */}
          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>
                  Claimants ({claimants.length} / 10)
                </span>
                <button
                  type="button"
                  onClick={handleAddClaimant}
                  disabled={claimants.length >= 10}
                  style={{
                    padding: '4px 12px',
                    borderRadius: '4px',
                    background: '#3498db',
                    border: 'none',
                    color: '#fff',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  + Add Claimant
                </button>
              </div>

              {claimants.map((claimant, idx) => (
                <div
                  key={claimant.id}
                  style={{
                    border: '1px solid var(--border-color, #2d3343)',
                    borderRadius: '8px',
                    padding: '12px',
                    background: 'var(--bg-base, #131722)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary, #fff)' }}>
                      Claimant #{idx + 1}
                    </span>
                    {claimants.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveClaimant(claimant.id)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#e74c3c',
                          fontSize: '11px',
                          cursor: 'pointer',
                        }}
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--text-secondary, #94a3b8)', display: 'block', marginBottom: '4px' }}>
                      Destination Address (G...)
                    </label>
                    <input
                      type="text"
                      placeholder="G..."
                      value={claimant.destination}
                      onChange={(e) => handleUpdateDestination(claimant.id, e.target.value)}
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        background: 'var(--bg-surface, #1e222d)',
                        border: '1px solid var(--border-color, #2d3343)',
                        borderRadius: '4px',
                        color: '#fff',
                        fontSize: '12px',
                        fontFamily: 'monospace',
                      }}
                    />
                  </div>

                  {/* Template Quick Selector */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted, #64748b)' }}>
                      Apply Preset:
                    </span>
                    {templates.map((tpl) => (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => handleApplyTemplate(claimant.id, tpl)}
                        style={{
                          fontSize: '11px',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: 'var(--bg-surface, #1e222d)',
                          border: '1px solid var(--border-color, #2d3343)',
                          color: 'var(--text-secondary, #94a3b8)',
                          cursor: 'pointer',
                        }}
                      >
                        {tpl.name}
                      </button>
                    ))}
                  </div>

                  {/* Visual Predicate Builder */}
                  <VisualPredicateBuilder
                    rootNode={claimant.predicate}
                    onChange={(newNode) => handleUpdatePredicate(claimant.id, newNode)}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Step 3: Reserves & Sponsor */}
          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div
                style={{
                  background: 'var(--bg-base, #131722)',
                  border: '1px solid var(--border-color, #2d3343)',
                  borderRadius: '8px',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <h3 style={{ margin: 0, fontSize: '14px', color: '#fff' }}>
                  Reserve Requirements Breakdown
                </h3>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#94a3b8' }}>
                  <span>Claimable Balance Base Entry:</span>
                  <span style={{ color: '#fff', fontWeight: 600 }}>0.5 XLM</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#94a3b8' }}>
                  <span>Claimant Entries ({claimants.length} × 0.5 XLM):</span>
                  <span style={{ color: '#fff', fontWeight: 600 }}>
                    {reserveEstimate.claimantReservesTotal} XLM
                  </span>
                </div>
                <div
                  style={{
                    borderTop: '1px solid var(--border-color, #2d3343)',
                    paddingTop: '8px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '14px',
                    color: '#fff',
                    fontWeight: 700,
                  }}
                >
                  <span>Total Reserve Locked:</span>
                  <span style={{ color: '#2ecc71' }}>{reserveEstimate.totalReserveRequired} XLM</span>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary, #94a3b8)', display: 'block', marginBottom: '6px' }}>
                  Optional Sponsor Public Key (Leave empty to fund from source account)
                </label>
                <input
                  type="text"
                  placeholder="G..."
                  value={sponsor}
                  onChange={(e) => setSponsor(e.target.value)}
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
            </div>
          )}

          {/* Step 4: Review & Build */}
          {step === 4 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div
                style={{
                  background: 'var(--bg-base, #131722)',
                  border: '1px solid var(--border-color, #2d3343)',
                  borderRadius: '8px',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div style={{ fontSize: '13px', color: '#94a3b8' }}>
                  Asset: <strong style={{ color: '#fff' }}>{amount} {assetType === 'native' ? 'XLM' : assetCode}</strong>
                </div>
                <div style={{ fontSize: '13px', color: '#94a3b8' }}>
                  Source: <strong style={{ color: '#fff', fontFamily: 'monospace' }}>{connectedAddress || 'None connected'}</strong>
                </div>
                <div style={{ fontSize: '13px', color: '#94a3b8' }}>
                  Claimants: <strong style={{ color: '#fff' }}>{claimants.length}</strong>
                </div>
              </div>

              {simulationResult && (
                <div>
                  {simulationResult.success ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ color: '#2ecc71', fontSize: '13px', fontWeight: 600 }}>
                        ✓ Transaction successfully simulated & generated!
                      </div>
                      <label style={{ fontSize: '11px', color: '#94a3b8' }}>XDR Envelope:</label>
                      <textarea
                        readOnly
                        value={simulationResult.xdr}
                        rows={4}
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
                      Simulation Error: {simulationResult.error}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: '16px 20px',
            borderTop: '1px solid var(--border-color, #2d3343)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <button
            type="button"
            onClick={() => setStep((prev) => (prev > 1 ? ((prev - 1) as any) : 1))}
            disabled={step === 1}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              background: 'transparent',
              border: '1px solid var(--border-color, #2d3343)',
              color: 'var(--text-secondary, #94a3b8)',
              cursor: step > 1 ? 'pointer' : 'not-allowed',
            }}
          >
            Back
          </button>

          {step < 3 && (
            <button
              type="button"
              onClick={() => setStep((prev) => ((prev + 1) as any))}
              style={{
                padding: '8px 20px',
                borderRadius: '6px',
                background: '#3498db',
                border: 'none',
                color: '#fff',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Continue
            </button>
          )}

          {step === 3 && (
            <button
              type="button"
              onClick={handleSimulate}
              disabled={simulating}
              style={{
                padding: '8px 20px',
                borderRadius: '6px',
                background: '#2ecc71',
                border: 'none',
                color: '#fff',
                fontWeight: 600,
                cursor: simulating ? 'wait' : 'pointer',
              }}
            >
              {simulating ? 'Simulating...' : 'Simulate & Review'}
            </button>
          )}

          {step === 4 && (
            <button
              type="button"
              onClick={() => {
                if (onSuccess) onSuccess();
                onClose();
              }}
              style={{
                padding: '8px 20px',
                borderRadius: '6px',
                background: '#2ecc71',
                border: 'none',
                color: '#fff',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
