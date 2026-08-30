import type { CSSProperties } from 'react';
import type { BulkPlannerPreferences } from '../../types/bulkOperationsPlanner';
import { describeSchedulePolicy, defaultSchedulingOptions } from '../../lib/bulkOperationsPlanner/scheduling';

const panel: CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  padding: 18,
};

const labelStyle: CSSProperties = { display: 'grid', gap: 6, fontSize: 13 };

interface BulkSettingsPanelProps {
  preferences: BulkPlannerPreferences;
  onChange: (patch: Partial<BulkPlannerPreferences>) => void;
}

export default function BulkSettingsPanel({ preferences, onChange }: BulkSettingsPanelProps) {
  const schedule = defaultSchedulingOptions();

  return (
    <section style={panel} aria-labelledby="bulk-settings-heading">
      <h2 id="bulk-settings-heading" style={{ marginTop: 0 }}>
        Planner settings
      </h2>
      <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>{describeSchedulePolicy(schedule)}</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <label style={labelStyle}>
          Max operations per transaction
          <input
            aria-label="Max operations per transaction"
            type="number"
            min={1}
            max={100}
            value={preferences.maxOperationsPerTransaction}
            onChange={(event) => onChange({ maxOperationsPerTransaction: Number(event.target.value) })}
          />
        </label>

        <label style={labelStyle}>
          Default max retries
          <input
            aria-label="Default max retries"
            type="number"
            min={0}
            max={10}
            value={preferences.defaultMaxRetries}
            onChange={(event) => onChange({ defaultMaxRetries: Number(event.target.value) })}
          />
        </label>

        <label style={labelStyle}>
          Default timeout (ms)
          <input
            aria-label="Default timeout ms"
            type="number"
            min={1000}
            max={300000}
            step={1000}
            value={preferences.defaultTimeoutMs}
            onChange={(event) => onChange({ defaultTimeoutMs: Number(event.target.value) })}
          />
        </label>

        <label style={labelStyle}>
          Fee multiplier
          <input
            aria-label="Fee multiplier"
            type="number"
            min={1}
            max={10}
            step={0.1}
            value={preferences.feeMultiplier}
            onChange={(event) => onChange({ feeMultiplier: Number(event.target.value) })}
          />
        </label>
      </div>

      <div style={{ display: 'grid', gap: 8, marginTop: 16 }}>
        <label>
          <input
            type="checkbox"
            checked={preferences.autoPauseOnFailure}
            onChange={(event) => onChange({ autoPauseOnFailure: event.target.checked })}
          />{' '}
          Auto-pause run after repeated retryable failures
        </label>
        <label>
          <input
            type="checkbox"
            checked={preferences.requireApprovalBeforeSubmit}
            onChange={(event) => onChange({ requireApprovalBeforeSubmit: event.target.checked })}
          />{' '}
          Require approval before submitting flagged operations
        </label>
        <label>
          <input
            type="checkbox"
            checked={preferences.simulatedMode}
            onChange={(event) => onChange({ simulatedMode: event.target.checked })}
          />{' '}
          Simulated execution mode (offline-safe)
        </label>
      </div>
    </section>
  );
}
