/**
 * IssuanceWorkflow — Multi-step guided workflow for issuing new supply
 * of an asset to a distributor.
 *
 * Steps: Configure → Readiness Check → Dry-Run → Review → Complete
 */

import React, { useState, useCallback, useReducer } from 'react';
import { useAccountReadiness } from '../../hooks/useAccountReadiness';
import { useIssuanceMutation } from '../../hooks/useAssetOperations';
import { buildDryRunSummary } from '../../lib/assetControl/verificationService';
import { NETWORKS, type NetworkName } from '../../lib/stellar';
import { useStore } from '../../lib/store';
import { validateStellarAddress, validateAmount } from '../../lib/validation';
import type {
  AssetIdentifier,
  IssuanceRequest,
  OperationSummary,
} from '../../types/assetControl';

interface IssuanceWorkflowProps {
  issuerAddress: string;
}

type Step = 'configure' | 'readiness' | 'review' | 'complete';

interface WorkflowState {
  step: Step;
  asset: AssetIdentifier;
  destination: string;
  amount: string;
  memo: string;
  xdr: string | null;
  summary: OperationSummary | null;
  txHash: string | null;
  error: string | null;
}

const initialState: WorkflowState = {
  step: 'configure',
  asset: { code: '', issuer: '' },
  destination: '',
  amount: '',
  memo: '',
  xdr: null,
  summary: null,
  txHash: null,
  error: null,
};

type Action =
  | { type: 'SET_FIELD'; field: keyof WorkflowState; value: any }
  | { type: 'ADVANCE'; step: Step }
  | { type: 'SET_RESULT'; xdr: string; summary: OperationSummary }
  | { type: 'SET_ERROR'; error: string }
  | { type: 'RESET' };

function reducer(state: WorkflowState, action: Action): WorkflowState {
  switch (action.type) {
    case 'SET_FIELD':
      return { ...state, [action.field]: action.value, error: null };
    case 'ADVANCE':
      return { ...state, step: action.step, error: null };
    case 'SET_RESULT':
      return { ...state, xdr: action.xdr, summary: action.summary, step: 'review', error: null };
    case 'SET_ERROR':
      return { ...state, error: action.error };
    case 'RESET':
      return { ...initialState };
    default:
      return state;
  }
}

export default function IssuanceWorkflow({ issuerAddress }: IssuanceWorkflowProps) {
  const [state, dispatch] = useReducer(reducer, {
    ...initialState,
    asset: { code: '', issuer: issuerAddress },
  });

  const network = useStore((s) => s.network) as NetworkName;
  const { readiness, isLoading: readinessLoading } = useAccountReadiness(
    issuerAddress,
    state.destination || undefined,
  );

  const issuanceMutation = useIssuanceMutation();

  // ─── Validation ──────────────────────────────────────────────────────────

  const validateForm = useCallback((): string[] => {
    const errors: string[] = [];

    if (!state.asset.code.trim()) errors.push('Asset code is required.');
    if (state.asset.code.length > 12) errors.push('Asset code max 12 characters.');

    const addrResult = validateStellarAddress(state.destination);
    if (!addrResult.valid) errors.push(...addrResult.errors);

    const amtResult = validateAmount(state.amount);
    if (!amtResult.valid) errors.push(...amtResult.errors);

    if (state.destination === issuerAddress) {
      errors.push('Destination cannot be the same as the issuer.');
    }

    return errors;
  }, [state, issuerAddress]);

  // ─── Step Handlers ───────────────────────────────────────────────────────

  const handleProceedToReadiness = useCallback(() => {
    const errors = validateForm();
    if (errors.length > 0) {
      dispatch({ type: 'SET_ERROR', error: errors.join(' ') });
      return;
    }
    dispatch({ type: 'ADVANCE', step: 'readiness' });
  }, [validateForm]);

  const handleBuildTransaction = useCallback(async () => {
    const request: IssuanceRequest = {
      destination: state.destination,
      asset: state.asset,
      amount: state.amount,
      memo: state.memo || undefined,
    };

    try {
      const result = await issuanceMutation.mutateAsync({ request });
      const passphrase = NETWORKS[network].passphrase;
      const summary = buildDryRunSummary(result.xdr, passphrase);
      dispatch({ type: 'SET_RESULT', xdr: result.xdr, summary });
    } catch (err: any) {
      dispatch({ type: 'SET_ERROR', error: err?.message ?? 'Failed to build transaction.' });
    }
  }, [state, network, issuanceMutation]);

  // ─── Step Indicators ─────────────────────────────────────────────────────

  const steps: { id: Step; label: string }[] = [
    { id: 'configure', label: 'Configure' },
    { id: 'readiness', label: 'Readiness' },
    { id: 'review', label: 'Review' },
    { id: 'complete', label: 'Complete' },
  ];

  const currentStepIndex = steps.findIndex((s) => s.id === state.step);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Step Indicators */}
      <div
        className="ac-card"
        style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '14px 20px' }}
        role="navigation"
        aria-label="Issuance workflow steps"
      >
        {steps.map((s, i) => (
          <React.Fragment key={s.id}>
            <span
              className="ac-status"
              style={{
                fontWeight: i === currentStepIndex ? 700 : 400,
                color: i <= currentStepIndex ? 'var(--cyan, #06b6d4)' : 'var(--text-secondary)',
              }}
              aria-current={i === currentStepIndex ? 'step' : undefined}
            >
              <span
                className={`ac-status-dot ${
                  i < currentStepIndex ? 'success' : i === currentStepIndex ? 'info' : 'idle'
                }`}
              />
              {s.label}
            </span>
            {i < steps.length - 1 && (
              <span
                aria-hidden="true"
                style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}
              >
                →
              </span>
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Error Banner */}
      {state.error && (
        <div className="ac-danger-banner" role="alert">
          <span aria-hidden="true">⚠</span>
          <div>{state.error}</div>
        </div>
      )}

      {/* Step: Configure */}
      {state.step === 'configure' && (
        <div className="ac-card">
          <h3>Issue New Supply</h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: 20 }}>
            Send newly minted tokens from the issuer to a distributor account.
          </p>

          <div className="ac-form-group">
            <label htmlFor="ac-issue-code">Asset Code</label>
            <input
              id="ac-issue-code"
              className="ac-input"
              type="text"
              maxLength={12}
              placeholder="e.g. USDC"
              value={state.asset.code}
              onChange={(e) =>
                dispatch({
                  type: 'SET_FIELD',
                  field: 'asset',
                  value: { ...state.asset, code: e.target.value.toUpperCase() },
                })
              }
              autoComplete="off"
            />
          </div>

          <div className="ac-form-group">
            <label htmlFor="ac-issue-dest">Destination (Distributor)</label>
            <input
              id="ac-issue-dest"
              className="ac-input"
              type="text"
              placeholder="G…"
              value={state.destination}
              onChange={(e) =>
                dispatch({ type: 'SET_FIELD', field: 'destination', value: e.target.value })
              }
              autoComplete="off"
            />
          </div>

          <div className="ac-form-group">
            <label htmlFor="ac-issue-amount">Amount</label>
            <input
              id="ac-issue-amount"
              className="ac-input"
              type="text"
              inputMode="decimal"
              placeholder="1000"
              value={state.amount}
              onChange={(e) =>
                dispatch({ type: 'SET_FIELD', field: 'amount', value: e.target.value })
              }
              autoComplete="off"
            />
          </div>

          <div className="ac-form-group">
            <label htmlFor="ac-issue-memo">Memo (optional)</label>
            <input
              id="ac-issue-memo"
              className="ac-input"
              type="text"
              maxLength={28}
              placeholder="Batch #1"
              value={state.memo}
              onChange={(e) =>
                dispatch({ type: 'SET_FIELD', field: 'memo', value: e.target.value })
              }
              autoComplete="off"
            />
          </div>

          <button className="ac-btn ac-btn-primary" onClick={handleProceedToReadiness}>
            Next: Readiness Check →
          </button>
        </div>
      )}

      {/* Step: Readiness */}
      {state.step === 'readiness' && (
        <div className="ac-card">
          <h3>Pre-Issuance Readiness Check</h3>
          {readinessLoading ? (
            <div aria-busy="true" aria-live="polite">
              <div className="ac-skeleton" style={{ height: 80 }} />
            </div>
          ) : readiness ? (
            <>
              <ul className="ac-readiness-list" aria-label="Readiness checks" style={{ marginBottom: 16 }}>
                {readiness.checks.map((check) => (
                  <li key={check.id} className="ac-readiness-item">
                    <span
                      className={`ac-readiness-icon ${
                        check.passed ? 'pass' : check.severity === 'warning' ? 'warn' : 'fail'
                      }`}
                      aria-hidden="true"
                    >
                      {check.passed ? '✓' : check.severity === 'warning' ? '!' : '✕'}
                    </span>
                    <div>
                      <div className="ac-readiness-label">{check.label}</div>
                      <div className="ac-readiness-detail">{check.detail}</div>
                    </div>
                  </li>
                ))}
              </ul>

              {!readiness.ready && (
                <div className="ac-warning" style={{ marginBottom: 12 }}>
                  <span aria-hidden="true">⚠</span>
                  <div>Some checks did not pass. Proceeding may result in transaction failure.</div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="ac-btn ac-btn-primary"
                  onClick={handleBuildTransaction}
                  disabled={issuanceMutation.isPending}
                >
                  {issuanceMutation.isPending ? 'Building…' : 'Build Transaction →'}
                </button>
                <button
                  className="ac-btn ac-btn-secondary"
                  onClick={() => dispatch({ type: 'ADVANCE', step: 'configure' })}
                >
                  ← Back
                </button>
              </div>
            </>
          ) : (
            <p style={{ color: 'var(--text-secondary)' }}>Unable to run readiness checks.</p>
          )}
        </div>
      )}

      {/* Step: Review (Dry-Run Summary) */}
      {state.step === 'review' && state.summary && (
        <div className="ac-card">
          <h3>Transaction Review</h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: 16 }}>
            {state.summary.description}
          </p>

          {state.summary.warnings.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              {state.summary.warnings.map((w, i) => (
                <div key={i} className="ac-warning" style={{ marginBottom: i > 0 ? 8 : 0 }}>
                  <span aria-hidden="true">⚠</span>
                  <div>{w}</div>
                </div>
              ))}
            </div>
          )}

          <dl className="ac-summary-fields" style={{ marginBottom: 16 }}>
            {Object.entries(state.summary.fields).map(([key, value]) => (
              <React.Fragment key={key}>
                <dt>{key}</dt>
                <dd>{value}</dd>
              </React.Fragment>
            ))}
          </dl>

          <div className="ac-warning" style={{ marginBottom: 16, color: 'var(--text-secondary)', borderColor: 'var(--border)', background: 'var(--bg-elevated)' }}>
            <span aria-hidden="true">📝</span>
            <div>
              Copy the unsigned XDR below to sign with your wallet or hardware device.
              <pre
                style={{
                  marginTop: 8,
                  padding: 12,
                  background: 'var(--bg-card)',
                  borderRadius: 'var(--radius-md, 8px)',
                  fontSize: '0.75rem',
                  overflowX: 'auto',
                  wordBreak: 'break-all',
                  whiteSpace: 'pre-wrap',
                  maxHeight: 120,
                }}
              >
                {state.xdr}
              </pre>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="ac-btn ac-btn-primary"
              onClick={() => dispatch({ type: 'ADVANCE', step: 'complete' })}
            >
              Done
            </button>
            <button
              className="ac-btn ac-btn-secondary"
              onClick={() => dispatch({ type: 'ADVANCE', step: 'configure' })}
            >
              ← Start Over
            </button>
          </div>
        </div>
      )}

      {/* Step: Complete */}
      {state.step === 'complete' && (
        <div className="ac-card" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }} aria-hidden="true">
            ✅
          </div>
          <h3>Transaction Ready</h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: '8px 0 20px' }}>
            Your issuance transaction has been built. Sign and submit it using your preferred signing method.
          </p>
          <button className="ac-btn ac-btn-primary" onClick={() => dispatch({ type: 'RESET' })}>
            Issue More
          </button>
        </div>
      )}
    </div>
  );
}
