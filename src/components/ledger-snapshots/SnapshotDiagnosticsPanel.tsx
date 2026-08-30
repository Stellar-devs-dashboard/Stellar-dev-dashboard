import type { CSSProperties } from 'react';
import type { DeterministicReplayResult, SnapshotLibraryRecord } from '../../types/ledgerSnapshots';
import type { LedgerSnapshotPreferences } from '../../hooks/useLedgerSnapshots';
import { findMissingEntryReferences } from '../../lib/ledgerSnapshots/diffEngine';

const panel: CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  padding: 18,
};

interface Props {
  record: SnapshotLibraryRecord | null;
  replayResult: DeterministicReplayResult | null;
  preferences: LedgerSnapshotPreferences;
  onPreferencesChange: (next: Partial<LedgerSnapshotPreferences>) => void;
}

export default function SnapshotDiagnosticsPanel({
  record,
  replayResult,
  preferences,
  onPreferencesChange,
}: Props) {
  const missingRefs = record ? findMissingEntryReferences(record.snapshot) : [];
  const unsupported = replayResult?.unsupportedFeatures ?? [];

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={panel}>
        <h3 style={{ margin: '0 0 12px', fontSize: 14 }}>Privacy and replay preferences</h3>
        <div style={{ display: 'grid', gap: 12, maxWidth: 420, fontSize: 12 }}>
          <label style={{ display: 'grid', gap: 4 }}>
            Redaction level
            <select
              value={preferences.redactionLevel}
              onChange={(e) =>
                onPreferencesChange({ redactionLevel: e.target.value as LedgerSnapshotPreferences['redactionLevel'] })
              }
              aria-label="Redaction level"
              style={{ padding: 8, borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'inherit' }}
            >
              <option value="none">None (local only)</option>
              <option value="standard">Standard (masked IDs)</option>
              <option value="strict">Strict (fully redacted)</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            Max snapshot bytes
            <input
              type="number"
              min={1024 * 1024}
              step={1024 * 1024}
              value={preferences.maxSnapshotBytes}
              onChange={(e) => onPreferencesChange({ maxSnapshotBytes: Number(e.target.value) })}
              aria-label="Maximum snapshot bytes"
              style={{ padding: 8, borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'inherit' }}
            />
          </label>
        </div>
      </div>

      <div style={panel}>
        <h4 style={{ margin: '0 0 12px', fontSize: 13 }}>Unsupported feature diagnostics</h4>
        {unsupported.length === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>No unsupported features reported in the latest replay.</p>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
            {unsupported.map((item) => (
              <li
                key={`${item.code}-${item.message}`}
                style={{
                  padding: 10,
                  borderRadius: 'var(--radius-md)',
                  border: `1px solid ${item.blocking ? 'rgba(255, 80, 80, 0.35)' : 'var(--border)'}`,
                  fontSize: 12,
                }}
              >
                <div style={{ fontWeight: 600 }}>
                  {item.code} · {item.category}
                  {item.blocking ? ' (blocking)' : ''}
                </div>
                <div style={{ marginTop: 4 }}>{item.message}</div>
                {item.remediation && (
                  <div style={{ marginTop: 4, color: 'var(--text-muted)', fontSize: 11 }}>{item.remediation}</div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div style={panel}>
        <h4 style={{ margin: '0 0 12px', fontSize: 13 }}>Missing entry references</h4>
        {missingRefs.length === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--green)' }}>No missing account references detected.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
            {missingRefs.map((ref) => (
              <li key={ref}>{ref}</li>
            ))}
          </ul>
        )}
      </div>

      <div style={panel}>
        <h4 style={{ margin: '0 0 12px', fontSize: 13 }}>Security notes</h4>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--text-muted)', display: 'grid', gap: 6 }}>
          <li>Snapshots never contain secret keys or signing material.</li>
          <li>Exported bundles are sanitized by default; strict redaction removes account and contract identifiers.</li>
          <li>Offline replay is labeled diagnostic simulation rather than consensus-equivalent execution.</li>
          <li>Integrity is verified with SHA-256 over canonical JSON before import.</li>
        </ul>
      </div>
    </div>
  );
}
