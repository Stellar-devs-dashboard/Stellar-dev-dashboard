/**
 * IssuerConfig — Issuer flag management and readiness dashboard.
 *
 * Shows current account flags, readiness checks, reserves,
 * and provides controls to toggle flags safely.
 */

import React, { useState, useCallback } from 'react';
import { useAccountReadiness } from '../../hooks/useAccountReadiness';
import { useSetFlagsMutation } from '../../hooks/useAssetOperations';
import type { AccountFlags, FlagChangeRequest, FlagRisk } from '../../types/assetControl';

interface IssuerConfigProps {
  issuerAddress: string;
}

const FLAG_LABELS: Record<keyof AccountFlags, { label: string; description: string }> = {
  authRequired: {
    label: 'Auth Required',
    description: 'Trustlines require authorization before the holder can receive payments.',
  },
  authRevocable: {
    label: 'Auth Revocable',
    description: 'Issuer can revoke authorization of existing trustlines.',
  },
  authImmutable: {
    label: 'Auth Immutable',
    description: 'Account flags can never be changed again. IRREVERSIBLE.',
  },
  authClawbackEnabled: {
    label: 'Clawback Enabled',
    description: 'Issuer can clawback tokens from any holder. Requires Auth Revocable.',
  },
};

export default function IssuerConfig({ issuerAddress }: IssuerConfigProps) {
  const { issuerState, readiness, isLoading, isError, error, refetch } =
    useAccountReadiness(issuerAddress);
  const setFlagsMutation = useSetFlagsMutation();
  const [confirmFlag, setConfirmFlag] = useState<keyof AccountFlags | null>(null);

  const handleToggleFlag = useCallback(
    (flag: keyof AccountFlags) => {
      if (!issuerState) return;

      // If it's auth_immutable, always require confirmation
      if (flag === 'authImmutable' || !issuerState.flags[flag]) {
        setConfirmFlag(flag);
        return;
      }

      const request: FlagChangeRequest = {
        clearFlags: { [flag]: true },
      };

      setFlagsMutation.mutate({ issuerAddress, request });
    },
    [issuerState, issuerAddress, setFlagsMutation],
  );

  const handleConfirmToggle = useCallback(() => {
    if (!confirmFlag || !issuerState) return;

    const currentlyEnabled = issuerState.flags[confirmFlag];
    const request: FlagChangeRequest = currentlyEnabled
      ? { clearFlags: { [confirmFlag]: true } }
      : { setFlags: { [confirmFlag]: true } };

    setFlagsMutation.mutate({ issuerAddress, request });
    setConfirmFlag(null);
  }, [confirmFlag, issuerState, issuerAddress, setFlagsMutation]);

  // ─── Loading ─────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="ac-card" aria-busy="true" aria-live="polite">
        <div className="ac-skeleton" style={{ height: 24, width: 200, marginBottom: 16 }} />
        <div className="ac-skeleton" style={{ height: 120 }} />
      </div>
    );
  }

  // ─── Error ───────────────────────────────────────────────────────────────

  if (isError || !issuerState) {
    return (
      <div className="ac-card ac-error-state" role="alert">
        <p>Failed to load issuer state{error ? `: ${error.message}` : '.'}</p>
        <button className="ac-btn ac-btn-secondary ac-btn-sm" onClick={() => refetch()}>
          Retry
        </button>
      </div>
    );
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  const isImmutable = issuerState.flags.authImmutable;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Account Flags */}
      <div className="ac-card">
        <div className="ac-card-header">
          <h3>Account Flags</h3>
          <span className="ac-status">
            <span
              className={`ac-status-dot ${isImmutable ? 'error' : 'success'}`}
            />
            {isImmutable ? 'Immutable' : 'Configurable'}
          </span>
        </div>

        {isImmutable && (
          <div className="ac-danger-banner" role="alert" style={{ marginBottom: 16 }}>
            <span aria-hidden="true">🔒</span>
            <div>
              <strong>Account is immutable.</strong> No flag changes can ever be made to
              this issuer account.
            </div>
          </div>
        )}

        <div className="ac-flag-grid">
          {(Object.keys(FLAG_LABELS) as Array<keyof AccountFlags>).map((flag) => {
            const enabled = issuerState.flags[flag];
            const meta = FLAG_LABELS[flag];
            const isDangerous = flag === 'authImmutable';

            return (
              <button
                key={flag}
                type="button"
                className={`ac-flag-badge ${
                  enabled ? (isDangerous ? 'danger' : 'enabled') : 'disabled'
                }`}
                onClick={() => handleToggleFlag(flag)}
                disabled={isImmutable || setFlagsMutation.isPending}
                title={meta.description}
                aria-pressed={enabled}
                aria-label={`${meta.label}: ${enabled ? 'Enabled' : 'Disabled'}. ${meta.description}`}
              >
                <span aria-hidden="true">{enabled ? '✓' : '○'}</span>
                {meta.label}
              </button>
            );
          })}
        </div>

        {setFlagsMutation.isError && (
          <div className="ac-danger-banner" role="alert" style={{ marginTop: 12 }}>
            <span aria-hidden="true">⚠</span>
            Failed to update flags. Please try again.
          </div>
        )}

        {setFlagsMutation.isSuccess && (
          <div className="ac-warning" role="status" style={{ marginTop: 12, color: '#22c55e', borderColor: 'rgba(34,197,94,0.25)', background: 'rgba(34,197,94,0.08)' }}>
            <span aria-hidden="true">✓</span>
            Transaction built successfully. Sign and submit to apply changes.
          </div>
        )}
      </div>

      {/* Confirm Modal */}
      {confirmFlag && (
        <div
          className="ac-card"
          role="alertdialog"
          aria-labelledby="ac-confirm-title"
          aria-describedby="ac-confirm-desc"
          style={{
            border: confirmFlag === 'authImmutable'
              ? '1px solid rgba(239,68,68,0.5)'
              : '1px solid var(--border)',
          }}
        >
          <h3 id="ac-confirm-title" style={{ color: confirmFlag === 'authImmutable' ? '#ef4444' : undefined }}>
            {confirmFlag === 'authImmutable'
              ? '⚠ Confirm Irreversible Action'
              : `Toggle ${FLAG_LABELS[confirmFlag].label}?`}
          </h3>
          <p id="ac-confirm-desc" style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: '8px 0 16px' }}>
            {confirmFlag === 'authImmutable'
              ? 'Setting auth_immutable will PERMANENTLY lock all flags on this account. This cannot be undone.'
              : FLAG_LABELS[confirmFlag].description}
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className={`ac-btn ${confirmFlag === 'authImmutable' ? 'ac-btn-danger' : 'ac-btn-primary'}`}
              onClick={handleConfirmToggle}
              disabled={setFlagsMutation.isPending}
            >
              {setFlagsMutation.isPending ? 'Building…' : 'Confirm'}
            </button>
            <button
              className="ac-btn ac-btn-secondary"
              onClick={() => setConfirmFlag(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Risks */}
      {issuerState.risks.length > 0 && (
        <div className="ac-card">
          <h3>⚡ Configuration Risks</h3>
          {issuerState.risks.map((risk, i) => (
            <div
              key={i}
              className={risk.severity === 'critical' ? 'ac-danger-banner' : 'ac-warning'}
              style={{ marginTop: i > 0 ? 8 : 0 }}
            >
              <span aria-hidden="true">{risk.irreversible ? '🔒' : '⚠'}</span>
              <div>{risk.message}</div>
            </div>
          ))}
        </div>
      )}

      {/* Readiness Checks */}
      {readiness && (
        <div className="ac-card">
          <div className="ac-card-header">
            <h3>Readiness Checks</h3>
            <span className="ac-status">
              <span className={`ac-status-dot ${readiness.ready ? 'success' : 'warning'}`} />
              {readiness.ready ? 'Ready' : 'Issues Found'}
            </span>
          </div>
          <ul className="ac-readiness-list" aria-label="Readiness checks">
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
        </div>
      )}

      {/* Reserves */}
      <div className="ac-card">
        <h3>Reserves</h3>
        <dl className="ac-summary-fields">
          <dt>Base Reserve</dt>
          <dd>{issuerState.reserves.baseReserve} XLM</dd>
          <dt>Required Reserve</dt>
          <dd>{issuerState.reserves.requiredReserve} XLM</dd>
          <dt>Available Balance</dt>
          <dd>{issuerState.reserves.availableBalance} XLM</dd>
          <dt>Sub-entries</dt>
          <dd>{issuerState.reserves.subentryCount}</dd>
        </dl>
      </div>
    </div>
  );
}
