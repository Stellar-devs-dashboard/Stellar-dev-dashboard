import React from 'react';
import { X, ChevronLeft, ChevronRight, CheckCircle } from 'lucide-react';

/**
 * Tooltip bubble rendered next to a tour target element.
 */
export default function TourTooltip({
  step,
  stepIndex,
  totalSteps,
  position,
  onNext,
  onPrev,
  onSkip,
}) {
  const isLast = stepIndex === totalSteps - 1;

  const style = {
    position: 'fixed',
    zIndex: 10001,
    background: 'var(--bg-card, #1e293b)',
    border: '1px solid var(--border, #334155)',
    borderRadius: '12px',
    padding: '16px',
    width: '280px',
    boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
    ...position,
  };

  return (
    <div style={style} role="dialog" aria-label={`Tour step: ${step.title}`}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
        <span style={{ fontSize: '11px', color: 'var(--text-muted, #94a3b8)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Step {stepIndex + 1} of {totalSteps}
        </span>
        <button
          onClick={onSkip}
          aria-label="Skip tour"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted, #94a3b8)', padding: '0', lineHeight: 1 }}
        >
          <X size={14} />
        </button>
      </div>

      <h3 style={{ margin: '0 0 6px', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary, #f1f5f9)' }}>
        {step.title}
      </h3>
      <p style={{ margin: '0 0 14px', fontSize: '13px', color: 'var(--text-secondary, #cbd5e1)', lineHeight: 1.5 }}>
        {step.content}
      </p>

      {/* Progress dots */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '12px' }}>
        {Array.from({ length: totalSteps }).map((_, i) => (
          <div
            key={i}
            style={{
              width: i === stepIndex ? '16px' : '6px',
              height: '6px',
              borderRadius: '3px',
              background: i === stepIndex ? 'var(--accent, #6366f1)' : 'var(--border, #334155)',
              transition: 'width 0.2s',
            }}
          />
        ))}
      </div>

      {/* Navigation */}
      <div style={{ display: 'flex', gap: '8px' }}>
        {stepIndex > 0 && (
          <button onClick={onPrev} style={btnStyle('secondary')}>
            <ChevronLeft size={14} /> Back
          </button>
        )}
        <button onClick={onNext} style={{ ...btnStyle('primary'), marginLeft: 'auto' }}>
          {isLast ? (
            <><CheckCircle size={14} /> Done</>
          ) : (
            <>Next <ChevronRight size={14} /></>
          )}
        </button>
      </div>
    </div>
  );
}

function btnStyle(variant) {
  const base = {
    display: 'flex', alignItems: 'center', gap: '4px',
    padding: '6px 12px', borderRadius: '6px', fontSize: '13px',
    fontWeight: 600, cursor: 'pointer', border: 'none',
  };
  return variant === 'primary'
    ? { ...base, background: 'var(--accent, #6366f1)', color: '#fff' }
    : { ...base, background: 'var(--bg-secondary, #0f172a)', color: 'var(--text-secondary, #cbd5e1)' };
}
