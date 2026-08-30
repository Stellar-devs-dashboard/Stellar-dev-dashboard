import type { CSSProperties, ReactNode } from 'react';

export const panelStyle: CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: '14px',
  padding: '18px',
  boxShadow: '0 12px 32px rgba(0, 0, 0, 0.12)',
};

export const buttonStyle: CSSProperties = {
  minHeight: '42px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  border: '1px solid var(--border)',
  borderRadius: '9px',
  padding: '9px 13px',
  background: 'var(--bg-elevated)',
  color: 'var(--text-primary)',
  font: 'inherit',
  fontSize: '12px',
  fontWeight: 700,
  cursor: 'pointer',
};

export const primaryButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: 'var(--cyan)',
  borderColor: 'var(--cyan)',
  color: '#06131b',
};

export const inputStyle: CSSProperties = {
  minHeight: '42px',
  width: '100%',
  border: '1px solid var(--border)',
  borderRadius: '9px',
  background: 'var(--bg-primary)',
  color: 'var(--text-primary)',
  padding: '9px 11px',
  font: 'inherit',
  fontSize: '13px',
};

export const labelStyle: CSSProperties = {
  display: 'grid',
  gap: '7px',
  color: 'var(--text-secondary)',
  fontSize: '12px',
  fontWeight: 700,
};

const STATUS_COLOR = {
  success: 'var(--diagnostic-success)',
  resolved: 'var(--diagnostic-success)',
  pass: 'var(--diagnostic-success)',
  healthy: 'var(--diagnostic-success)',
  error: 'var(--diagnostic-danger)',
  critical: 'var(--diagnostic-danger)',
  fail: 'var(--diagnostic-danger)',
  failure: 'var(--diagnostic-danger)',
  'action-needed': 'var(--diagnostic-danger)',
  warning: 'var(--diagnostic-warning)',
  degraded: 'var(--diagnostic-warning)',
  inconclusive: 'var(--diagnostic-warning)',
  offline: 'var(--diagnostic-warning)',
  running: 'var(--diagnostic-accent)',
  info: 'var(--diagnostic-accent)',
  compatible: 'var(--diagnostic-success)',
  unknown: 'var(--text-muted)',
  skipped: 'var(--text-muted)',
  cancelled: 'var(--text-muted)',
  'memory-only': 'var(--diagnostic-warning)',
  durable: 'var(--diagnostic-success)',
} as const;

export function StatusBadge({ status, children }: { status: string; children?: ReactNode }) {
  const color = STATUS_COLOR[status as keyof typeof STATUS_COLOR] ?? 'var(--text-muted)';
  return (
    <span
      className="diagnostic-status-badge"
      style={{ color, borderColor: `color-mix(in srgb, ${color} 55%, var(--border))` }}
    >
      <span className="diagnostic-status-dot" style={{ background: color }} aria-hidden="true" />
      {children ?? status.replace(/-/g, ' ')}
    </span>
  );
}

export function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint: string;
}) {
  return (
    <article className="diagnostic-metric" style={panelStyle}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </article>
  );
}
