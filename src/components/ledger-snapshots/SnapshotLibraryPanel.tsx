import type { CSSProperties } from 'react';
import { Download, Pin, Trash2 } from 'lucide-react';
import type { SnapshotLibraryRecord, SnapshotLibraryStats } from '../../types/ledgerSnapshots';

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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface Props {
  records: SnapshotLibraryRecord[];
  selectedId: string | null;
  stats: SnapshotLibraryStats | null;
  onSelect: (id: string) => void;
  onPin: (id: string, pinned: boolean) => void;
  onDelete: () => void;
  onExport: () => void;
  onExportSanitized: () => void;
  onExportBundle: () => void;
  onPrune: () => void;
}

export default function SnapshotLibraryPanel({
  records,
  selectedId,
  stats,
  onSelect,
  onPin,
  onDelete,
  onExport,
  onExportSanitized,
  onExportBundle,
  onPrune,
}: Props) {
  if (records.length === 0) {
    return (
      <div style={panel}>
        <h3 style={{ margin: 0, fontSize: 14 }}>Snapshot library</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>No snapshots yet. Capture or import one to get started.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {stats && (
        <div style={{ ...panel, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
          <Stat label="Records" value={String(stats.recordCount)} />
          <Stat label="Total size" value={formatBytes(stats.totalBytes)} />
          <Stat label="Pinned" value={String(stats.pinnedCount)} />
          <Stat label="Networks" value={stats.networks.join(', ') || '—'} />
        </div>
      )}

      <div style={panel}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 14 }}>Snapshot library</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" style={button} onClick={onExportBundle}>
              Export bundle
            </button>
            <button type="button" style={button} onClick={onPrune}>
              Prune old
            </button>
          </div>
        </div>

        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
          {records.map((record) => (
            <li key={record.id}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: 8,
                  padding: 12,
                  borderRadius: 'var(--radius-md)',
                  border: `1px solid ${selectedId === record.id ? 'var(--accent)' : 'var(--border)'}`,
                  background: selectedId === record.id ? 'var(--accent-muted)' : 'var(--bg-elevated)',
                }}
              >
                <button
                  type="button"
                  onClick={() => onSelect(record.id)}
                  aria-pressed={selectedId === record.id}
                  style={{
                    textAlign: 'left',
                    background: 'none',
                    border: 'none',
                    color: 'inherit',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{record.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                    {record.snapshot.network.networkName} · ledger {record.snapshot.ledger.sequence} ·{' '}
                    {formatBytes(record.sizeBytes)} · {record.replayCount} replays
                  </div>
                  {record.tags.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                      {record.tags.map((tag) => (
                        <span
                          key={tag}
                          style={{
                            fontSize: 10,
                            padding: '2px 6px',
                            borderRadius: 999,
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border)',
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
                <div style={{ display: 'flex', gap: 6, alignItems: 'start' }}>
                  <button
                    type="button"
                    aria-label={record.pinned ? 'Unpin snapshot' : 'Pin snapshot'}
                    style={button}
                    onClick={() => onPin(record.id, !record.pinned)}
                  >
                    <Pin size={14} aria-hidden fill={record.pinned ? 'currentColor' : 'none'} />
                  </button>
                  {selectedId === record.id && (
                    <>
                      <button type="button" aria-label="Export snapshot" style={button} onClick={onExport}>
                        <Download size={14} aria-hidden />
                      </button>
                      <button type="button" aria-label="Export sanitized" style={button} onClick={onExportSanitized}>
                        Sanitize
                      </button>
                      <button type="button" aria-label="Delete snapshot" style={{ ...button, color: 'var(--red)' }} onClick={onDelete}>
                        <Trash2 size={14} aria-hidden />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 600, marginTop: 4 }}>{value}</div>
    </div>
  );
}
