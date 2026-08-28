import type { CSSProperties } from 'react';
import type { RegressionClassification } from '../../types/resourceProfiling';

export const pageStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '20px',
  padding: 'var(--content-padding, 24px)',
  color: 'var(--text-primary)',
};

export const cardStyle: CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--bg-elevated)',
  padding: '16px',
};

export const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: '12px',
};

export const mutedStyle: CSSProperties = { color: 'var(--text-secondary)', fontSize: '13px' };

export const tableWrapStyle: CSSProperties = {
  overflowX: 'auto',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)',
};

export const tableStyle: CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: '13px' };

export const thStyle: CSSProperties = {
  textAlign: 'left',
  padding: '10px 12px',
  borderBottom: '1px solid var(--border)',
  color: 'var(--text-secondary)',
  fontSize: '11px',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

export const tdStyle: CSSProperties = { padding: '10px 12px', borderBottom: '1px solid var(--border)', verticalAlign: 'top' };

export const buttonStyle: CSSProperties = {
  border: '1px solid var(--border-bright)',
  background: 'var(--bg-card)',
  color: 'var(--text-primary)',
  borderRadius: 'var(--radius-sm)',
  padding: '8px 14px',
  fontSize: '13px',
  cursor: 'pointer',
};

export const primaryButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: 'var(--cyan)',
  borderColor: 'var(--cyan)',
  color: 'var(--bg-base)',
  fontWeight: 600,
};

export const inputStyle: CSSProperties = {
  width: '100%',
  padding: '8px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border)',
  background: 'var(--bg-card)',
  color: 'var(--text-primary)',
};

export const labelStyle: CSSProperties = { ...mutedStyle, display: 'block', marginBottom: '4px' };

const CLASSIFICATION_COLOR: Record<RegressionClassification, string> = {
  regression: 'var(--red)',
  improvement: 'var(--green)',
  neutral: 'var(--text-muted)',
  noise: 'var(--amber)',
  'insufficient-data': 'var(--text-muted)',
};

export function classificationColor(classification: RegressionClassification): string {
  return CLASSIFICATION_COLOR[classification];
}

export function pillStyle(color: string): CSSProperties {
  return {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '999px',
    fontSize: '11px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
    color,
    border: `1px solid ${color}`,
    background: 'transparent',
  };
}
