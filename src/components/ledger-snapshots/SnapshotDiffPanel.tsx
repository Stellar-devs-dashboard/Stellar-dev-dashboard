import type { CSSProperties } from 'react';
import { GitCompare } from 'lucide-react';
import type { LedgerEntryDiff, SnapshotComparisonResult, SnapshotLibraryRecord } from '../../types/ledgerSnapshots';

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
  records: SnapshotLibraryRecord[];
  selectedId: string | null;
  compareId: string | null;
  comparison: SnapshotComparisonResult | null;
  diffs: LedgerEntryDiff[];
  summary: string | null;
  onSelect: (id: string) => void;
  onCompareSelect: (id: string) => void;
  onRunComparison: () => void;
}

export default function SnapshotDiffPanel({
  records,
  selectedId,
  compareId,
  comparison,
  diffs,
  summary,
  onSelect,
  onCompareSelect,
  onRunComparison,
}: Props) {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={panel}>
        <h3 style={{ margin: '0 0 12px', fontSize: 14 }}>Ledger entry diff</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12, alignItems: 'end' }}>
          <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
            Left snapshot
            <select
              value={selectedId ?? ''}
              onChange={(e) => onSelect(e.target.value)}
              aria-label="Left snapshot"
              style={{ padding: 8, borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'inherit' }}
            >
              {records.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
            Right snapshot
            <select
              value={compareId ?? ''}
              onChange={(e) => onCompareSelect(e.target.value)}
              aria-label="Right snapshot"
              style={{ padding: 8, borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'inherit' }}
            >
              <option value="">Select…</option>
              {records.filter((r) => r.id !== selectedId).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" style={button} onClick={onRunComparison} disabled={!selectedId || !compareId}>
            <GitCompare size={14} aria-hidden />
            Compare
          </button>
        </div>
        {summary && (
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12 }} role="status">
            {summary}
          </p>
        )}
      </div>

      {comparison && (
        <div style={{ ...panel, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
          <Stat label="Added" value={comparison.addedEntries.length} />
          <Stat label="Removed" value={comparison.removedEntries.length} />
          <Stat label="Changed" value={comparison.changedEntries.length} />
          <Stat label="Sequence changes" value={comparison.accountSequenceChanges.length} />
        </div>
      )}

      <div style={panel}>
        <h4 style={{ margin: '0 0 12px', fontSize: 13 }}>Field diffs</h4>
        {diffs.length === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>No diffs yet. Select two snapshots and run compare.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
                <th style={{ padding: 6 }}>Kind</th>
                <th style={{ padding: 6 }}>Field</th>
                <th style={{ padding: 6 }}>Before</th>
                <th style={{ padding: 6 }}>After</th>
                <th style={{ padding: 6 }}>Severity</th>
              </tr>
            </thead>
            <tbody>
              {diffs.slice(0, 100).map((diff, index) => (
                <tr key={`${diff.entryId}-${diff.field}-${index}`} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: 6 }}>{diff.kind}</td>
                  <td style={{ padding: 6 }}>{diff.field}</td>
                  <td style={{ padding: 6, fontFamily: 'monospace', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>{diff.before}</td>
                  <td style={{ padding: 6, fontFamily: 'monospace', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>{diff.after}</td>
                  <td style={{ padding: 6, color: diff.severity === 'critical' ? 'var(--red)' : diff.severity === 'warning' ? 'var(--amber)' : 'var(--text-muted)' }}>
                    {diff.severity}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 600, marginTop: 4 }}>{value}</div>
    </div>
  );
}
