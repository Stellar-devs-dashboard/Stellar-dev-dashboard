import type { CSSProperties } from 'react';
import type { CompatibilityStatus } from '../../types/compatibility';

export const STATUS_COLOR: Record<CompatibilityStatus, string> = {
  compatible: 'var(--green)',
  degraded: 'var(--amber)',
  incompatible: 'var(--red)',
  unknown: 'var(--text-muted)',
  contradictory: 'var(--red)',
  offline: 'var(--amber)',
};

export const panelStyle: CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  padding: 18,
  minWidth: 0,
};

export const buttonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 7,
  minHeight: 40,
  padding: '8px 13px',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--bg-elevated)',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 12,
};

export const inputStyle: CSSProperties = {
  width: '100%',
  minHeight: 42,
  padding: '9px 11px',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--bg-base)',
  color: 'var(--text-primary)',
  fontFamily: 'inherit',
  fontSize: 12,
};

export const labelStyle: CSSProperties = {
  display: 'grid',
  gap: 6,
  color: 'var(--text-secondary)',
  fontSize: 11,
  fontWeight: 600,
};

export function StatusBadge({ status, label }: { status: CompatibilityStatus; label?: string }) {
  const color = STATUS_COLOR[status];
  return (
    <span
      className="compat-status-badge"
      style={{ borderColor: color, color }}
      aria-label={`Status: ${label ?? status}`}
    >
      <span aria-hidden="true" className="compat-status-dot" style={{ background: color }} />
      {label ?? status}
    </span>
  );
}

export function Field({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="compat-field">
      <dt>{label}</dt>
      <dd style={mono ? { fontFamily: 'var(--font-mono)', overflowWrap: 'anywhere' } : undefined}>
        {value ?? 'Unknown'}
      </dd>
    </div>
  );
}
