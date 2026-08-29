import { useState, type CSSProperties } from 'react';
import { Camera, Loader2, X } from 'lucide-react';
import type { CaptureProgress } from '../../types/ledgerSnapshots';

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
  capturing: boolean;
  progress: CaptureProgress | null;
  onCapture: (label: string, tags: string[]) => void;
  onCancel: () => void;
  onLoadDemo: () => void;
}

export default function SnapshotCapturePanel({ capturing, progress, onCapture, onCancel, onLoadDemo }: Props) {
  const [label, setLabel] = useState('Ledger snapshot');
  const [tagsText, setTagsText] = useState('capture');

  const handleSubmit = () => {
    const tags = tagsText
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    onCapture(label.trim() || 'Ledger snapshot', tags);
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={panel}>
        <h3 style={{ margin: '0 0 12px', fontSize: 14 }}>Footprint-driven capture</h3>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 16px' }}>
          Capture accounts, contract storage, TTLs, and simulation responses with bounded traversal, compression,
          selective redaction, and size limits. Snapshots never contain secret keys.
        </p>

        <div style={{ display: 'grid', gap: 12, maxWidth: 480 }}>
          <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
            Snapshot label
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              aria-label="Snapshot label"
              style={{
                padding: '8px 10px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)',
                background: 'var(--bg-elevated)',
                color: 'inherit',
              }}
            />
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
            Tags (comma-separated)
            <input
              type="text"
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              aria-label="Snapshot tags"
              style={{
                padding: '8px 10px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)',
                background: 'var(--bg-elevated)',
                color: 'inherit',
              }}
            />
          </label>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
          <button type="button" style={button} onClick={handleSubmit} disabled={capturing}>
            {capturing ? <Loader2 size={14} className="spin" aria-hidden /> : <Camera size={14} aria-hidden />}
            {capturing ? 'Capturing…' : 'Start capture'}
          </button>
          {capturing && (
            <button type="button" style={button} onClick={onCancel}>
              <X size={14} aria-hidden />
              Cancel
            </button>
          )}
          <button type="button" style={button} onClick={onLoadDemo} disabled={capturing}>
            Load demo snapshot
          </button>
        </div>
      </div>

      {progress && (
        <div style={panel} aria-live="polite" aria-busy={capturing}>
          <h4 style={{ margin: '0 0 8px', fontSize: 13 }}>Capture progress</h4>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{progress.message}</div>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.processed}
            style={{
              marginTop: 10,
              height: 8,
              borderRadius: 999,
              background: 'var(--bg-elevated)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${Math.round((progress.processed / Math.max(progress.total, 1)) * 100)}%`,
                background: 'var(--accent)',
                transition: 'width 0.2s ease',
              }}
            />
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
            Phase: {progress.phase} · {progress.processed}/{progress.total} ·{' '}
            {(progress.bytesCollected / 1024).toFixed(1)} KB collected
            {progress.currentTarget ? ` · ${progress.currentTarget.slice(0, 12)}…` : ''}
          </div>
        </div>
      )}
    </div>
  );
}
