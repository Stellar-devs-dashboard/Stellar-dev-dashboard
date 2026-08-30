/**
 * ClawbackWorkflow — Guided clawback workflow.
 *
 * Steps: Configure → Confirm → Review → Complete
 */

import React, { useReducer, useCallback } from 'react';
import { useClawbackMutation } from '../../hooks/useAssetOperations';
import { useAccountReadiness } from '../../hooks/useAccountReadiness';
import { buildDryRunSummary } from '../../lib/assetControl/verificationService';
import { NETWORKS, type NetworkName } from '../../lib/stellar';
import { useStore } from '../../lib/store';
import { validateStellarAddress, validateAmount } from '../../lib/validation';
import type {
  AssetIdentifier,
  ClawbackRequest,
  OperationSummary,
} from '../../types/assetControl';

interface ClawbackWorkflowProps {
  issuerAddress: string;
}

type Step = 'configure' | 'confirm' | 'review' | 'complete';

interface WorkflowState {
  step: Step;
  asset: AssetIdentifier;
  from: string;
  amount: string;
  xdr: string | null;
  summary: OperationSummary | null;
  error: string | null;
}

const initialState: WorkflowState = {
  step: 'configure',
  asset: { code: '', issuer: '' },
  from: '',
  amount: '',
  xdr: null,
  summary: null,
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

export default function ClawbackWorkflow({ issuerAddress }: ClawbackWorkflowProps) {
  const [state, dispatch] = useReducer(reducer, {
    ...initialState,
    asset: { code: '', issuer: issuerAddress },
  });

  const network = useStore((s) => s.network) as NetworkName;
  const { issuerState } = useAccountReadiness(issuerAddress);
  const clawbackMutation = useClawbackMutation();

  const clawbackEnabled = issuerState?.flags.authClawbackEnabled ?? false;

  // ─── Validation ──────────────────────────────────────────────────────────

  const validateForm = useCallback((): string[] => {
    const errors: string[] = [];

    if (!state.asset.code.trim()) errors.push('Asset code is required.');

    const addrResult = validateStellarAddress(state.from);
    if (!addrResult.valid) errors.push(...addrResult.errors);

    const amtResult = validateAmount(state.amount);
    if (!amtResult.valid) errors.push(...amtResult.errors);

    return errors;
  }, [state]);

  const handleProceedToConfirm = useCallback(() => {
    const errors = validateForm();
    if (errors.length > 0) {
      dispatch({ type: 'SET_ERROR', error: errors.join(' ') });
      return;
    }
    dispatch({ type: 'ADVANCE', step: 'confirm' });
  }, [validateForm]);

  const handleBuildClawback = useCallback(async () => {
    const request: ClawbackRequest = {
      from: state.from,
      asset: state.asset,
      amount: state.amount,
    };

    try {
      const result = await clawbackMutation.mutateAsync({
        issuerAddress,
        request,
      });
      const passphrase = NETWORKS[network].passphrase;
      const summary = buildDryRunSummary(result.xdr, passphrase);
      dispatch({ type: 'SET_RESULT', xdr: result.xdr, summary });
    } catch (err: any) {
      dispatch({ type: 'SET_ERROR', error: err?.message ?? 'Failed to build clawback.' });
    }
  }, [state, network, issuerAddress, clawbackMutation]);

  // ─── Clawback Not Enabled ───────────────────────────────────────────────

  if (!clawbackEnabled && issuerState) {
    return (
      <div className="ac-card">
        <h3>Clawback</h3>
        <div className="ac-warning">
          <span aria-hidden="true">🔒</span>
          <div>
            <strong>Clawback is not enabled</strong> on this issuer account.
            Enable <code>auth_clawback_enabled</code> (and <code>auth_revocable</code>)
            in the Issuer Config tab to use clawback.
          </div>
        </div>
      </div>
    );
  }

  // ─── Steps ──────────────────────────────────────────────────────────────

  const steps: { id: Step; label: string }[] = [
    { id: 'configure', label: 'Configure' },
    { id: 'confirm', label: 'Confirm' },
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
        aria-label="Clawback workflow steps"
      >
        {steps.map((s, i) => (
          <React.Fragment key={s.id}>
            <span
              className="ac-status"
              style={{
                fontWeight: i === currentStepIndex ? 700 : 400,
                color: i <= currentStepIndex ? '#ef4444' : 'var(--text-secondary)',
              }}
              aria-current={i === currentStepIndex ? 'step' : undefined}
            >
              <span
                className={`ac-status-dot ${
                  i < currentStepIndex ? 'error' : i === currentStepIndex ? 'error' : 'idle'
                }`}
              />
              {s.label}
            </span>
            {i < steps.length - 1 && (
              <span aria-hidden="true" style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
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
          <h3>Clawback Tokens</h3>
          <div className="ac-danger-banner" style={{ marginBottom: 16 }}>
            <span aria-hidden="true">⚠</span>
            <div>
              Clawback permanently removes tokens from a holder's account.
              This action cannot be reversed.
            </div>
          </div>

          <div className="ac-form-group">
            <label htmlFor="ac-claw-code">Asset Code</label>
            <input
              id="ac-claw-code"
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
            <label htmlFor="ac-claw-from">From (Holder Address)</label>
            <input
              id="ac-claw-from"
              className="ac-input"
              type="text"
              placeholder="G…"
              value={state.from}
              onChange={(e) =>
                dispatch({ type: 'SET_FIELD', field: 'from', value: e.target.value })
              }
              autoComplete="off"
            />
          </div>

          <div className="ac-form-group">
            <label htmlFor="ac-claw-amount">Amount</label>
            <input
              id="ac-claw-amount"
              className="ac-input"
              type="text"
              inputMode="decimal"
              placeholder="100"
              value={state.amount}
              onChange={(e) =>
                dispatch({ type: 'SET_FIELD', field: 'amount', value: e.target.value })
              }
              autoComplete="off"
            />
          </div>

          <button className="ac-btn ac-btn-danger" onClick={handleProceedToConfirm}>
            Next: Confirm Clawback →
          </button>
        </div>
      )}

      {/* Step: Confirm */}
      {state.step === 'confirm' && (
        <div className="ac-card" style={{ border: '1px solid rgba(239,68,68,0.4)' }}>
          <h3 style={{ color: '#ef4444' }}>⚠ Confirm Clawback</h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: '8px 0 16px' }}>
            You are about to clawback <strong>{state.amount} {state.asset.code}</strong> from:
          </p>
          <div
            style={{
              padding: '10px 14px',
              background: 'var(--bg-elevated)',
              borderRadius: 'var(--radius-md, 8px)',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '0.8125rem',
              marginBottom: 16,
              wordBreak: 'break-all',
            }}
          >
            {state.from}
          </div>

          <div className="ac-danger-banner" style={{ marginBottom: 16 }}>
            <span aria-hidden="true">🔒</span>
            <div>This action is irreversible. The tokens will be destroyed.</div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="ac-btn ac-btn-danger"
              onClick={handleBuildClawback}
              disabled={clawbackMutation.isPending}
            >
              {clawbackMutation.isPending ? 'Building…' : 'Build Clawback Transaction'}
            </button>
            <button
              className="ac-btn ac-btn-secondary"
              onClick={() => dispatch({ type: 'ADVANCE', step: 'configure' })}
            >
              ← Back
            </button>
          </div>
        </div>
      )}

      {/* Step: Review */}
      {state.step === 'review' && state.summary && (
        <div className="ac-card">
          <h3>Clawback Transaction Review</h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: 16 }}>
            {state.summary.description}
          </p>

          {state.summary.warnings.map((w, i) => (
            <div key={i} className="ac-danger-banner" style={{ marginBottom: 8 }}>
              <span aria-hidden="true">⚠</span>
              <div>{w}</div>
            </div>
          ))}

          <dl className="ac-summary-fields" style={{ marginBottom: 16 }}>
            {Object.entries(state.summary.fields).map(([key, value]) => (
              <React.Fragment key={key}>
                <dt>{key}</dt>
                <dd>{value}</dd>
              </React.Fragment>
            ))}
          </dl>

          <div style={{ marginBottom: 16, padding: 12, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md, 8px)' }}>
            <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
              Unsigned XDR
            </div>
            <pre
              style={{
                fontSize: '0.75rem',
                overflowX: 'auto',
                wordBreak: 'break-all',
                whiteSpace: 'pre-wrap',
                maxHeight: 100,
                margin: 0,
              }}
            >
              {state.xdr}
            </pre>
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
              onClick={() => dispatch({ type: 'RESET' })}
            >
              Start Over
            </button>
          </div>
        </div>
      )}

      {/* Step: Complete */}
      {state.step === 'complete' && (
        <div className="ac-card" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }} aria-hidden="true">
            🔨
          </div>
          <h3>Clawback Transaction Ready</h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: '8px 0 20px' }}>
            Sign and submit the transaction using your preferred signing method to execute the clawback.
          </p>
          <button className="ac-btn ac-btn-secondary" onClick={() => dispatch({ type: 'RESET' })}>
            New Clawback
          </button>
        </div>
      )}
    </div>
  );
}
