import type { CSSProperties } from 'react';
import { AlertTriangle, Loader2, Play } from 'lucide-react';
import type { DeterministicReplayResult, SnapshotLibraryRecord } from '../../types/ledgerSnapshots';

const panel: CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  padding: 18,
};

const button: CSSProperties = {
  minHeight: 36,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 7,
  padding: '7px 12px',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--bg-elevated)',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  fontSize: 11,
};

interface Props {
  record: SnapshotLibraryRecord | null;
  replaying: boolean;
  result: DeterministicReplayResult | null;
  strictMode: boolean;
  onRun: () => void;
  onCancel: () => void;
  onToggleStrict: (value: boolean) => void;
}

export default function SnapshotReplayPanel({
  record,
  replaying,
  result,
  strictMode,
  onRun,
  onCancel,
  onToggleStrict,
}: Props) {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={panel}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 14 }}>Deterministic offline replay</h3>
            <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
              Replays captured simulation responses against immutable snapshot state. This is diagnostic simulation,
              not consensus-equivalent execution.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <input
                type="checkbox"
                checked={strictMode}
                onChange={(e) => onToggleStrict(e.target.checked)}
                aria-label="Strict replay mode"
              />
              Strict mode
            </label>
            <button type="button" style={button} onClick={onRun} disabled={!record || replaying}>
              {replaying ? <Loader2 size={14} aria-hidden /> : <Play size={14} aria-hidden />}
              {replaying ? 'Replaying…' : 'Run replay'}
            </button>
            {replaying && (
              <button type="button" style={button} onClick={onCancel}>
                Cancel
              </button>
            )}
          </div>
        </div>

        <div
          role="note"
          style={{
            marginTop: 12,
            padding: '10px 12px',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(255, 193, 7, 0.08)',
            border: '1px solid rgba(255, 193, 7, 0.25)',
            fontSize: 12,
            display: 'flex',
            gap: 8,
            alignItems: 'center',
          }}
        >
          <AlertTriangle size={14} aria-hidden />
          Offline replay validates recorded responses; it does not execute Soroban host functions against live consensus state.
        </div>
      </div>

      {result && (
        <>
          <div style={{ ...panel, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
            <Metric label="Status" value={result.status} />
            <Metric
              label="Matched"
              value={`${result.simulationResults.filter((r) => r.matched).length}/${result.simulationResults.length}`}
            />
            <Metric label="Unsupported" value={String(result.unsupportedFeatures.length)} />
          </div>

          <div style={panel}>
            <h4 style={{ margin: '0 0 12px', fontSize: 13 }}>Replay timeline</h4>
            <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, display: 'grid', gap: 6 }}>
              {result.timeline.map((event) => (
                <li key={event.id}>
                  <span style={{ color: 'var(--text-muted)' }}>[{event.phase}]</span> {event.message}
                  {event.durationMs !== undefined ? ` (${event.durationMs.toFixed(1)}ms)` : ''}
                </li>
              ))}
            </ol>
          </div>

          <div style={panel}>
            <h4 style={{ margin: '0 0 12px', fontSize: 13 }}>Simulation results</h4>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
              {result.simulationResults.map((sim) => (
                <li
                  key={sim.simulationId}
                  style={{
                    padding: 10,
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border)',
                    fontSize: 12,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{sim.requestDigest.slice(0, 12)}…</span>
                    <span style={{ color: sim.matched ? 'var(--green)' : 'var(--red)' }}>
                      {sim.matched ? 'Matched' : 'Mismatch'}
                    </span>
                  </div>
                  {sim.diffSummary && (
                    <div style={{ marginTop: 6, color: 'var(--text-muted)', fontSize: 11 }}>{sim.diffSummary}</div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 600, marginTop: 4 }}>{value}</div>
    </div>
  );
}
