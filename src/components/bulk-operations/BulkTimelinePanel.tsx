import { useMemo, type CSSProperties } from 'react';
import type { BulkExecutionPlan, BulkManifest, BulkProgressEvent } from '../../types/bulkOperationsPlanner';
import { buildScheduleTimeline, estimateScheduleDuration } from '../../lib/bulkOperationsPlanner/scheduling';

const panel: CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  padding: 18,
};

interface BulkTimelinePanelProps {
  manifest: BulkManifest | null;
  plan: BulkExecutionPlan | null;
  progressEvents: BulkProgressEvent[];
}

export default function BulkTimelinePanel({ manifest, plan, progressEvents }: BulkTimelinePanelProps) {
  const timeline = useMemo(() => {
    if (!manifest || !plan) return [];
    return buildScheduleTimeline(manifest, plan);
  }, [manifest, plan]);

  const estimatedMs = manifest && plan ? estimateScheduleDuration(manifest, plan) : 0;

  if (!manifest || !plan) {
    return (
      <section style={panel}>
        <p role="status" style={{ color: 'var(--text-muted)', margin: 0 }}>
          Build a plan to preview the estimated execution timeline.
        </p>
      </section>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <section style={panel} aria-labelledby="bulk-timeline-heading">
        <h2 id="bulk-timeline-heading" style={{ marginTop: 0 }}>
          Schedule timeline
        </h2>
        <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
          Estimated total duration ~{Math.round(estimatedMs / 1000)}s for simulated execution.
        </p>

        <div style={{ display: 'grid', gap: 8 }}>
          {timeline.map((entry) => {
            const op = manifest.operations.find((item) => item.id === entry.operationId);
            return (
              <div
                key={entry.operationId}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '120px 1fr auto',
                  gap: 12,
                  alignItems: 'center',
                  padding: '8px 0',
                  borderTop: '1px solid var(--border)',
                }}
              >
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>+{entry.startOffsetMs}ms</span>
                <div>
                  <div style={{ fontWeight: 600 }}>{op?.label ?? entry.operationId}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{op?.family ?? 'unknown'}</div>
                </div>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{entry.durationMs}ms</span>
              </div>
            );
          })}
        </div>
      </section>

      {progressEvents.length > 0 && (
        <section style={panel} aria-labelledby="bulk-live-timeline-heading">
          <h2 id="bulk-live-timeline-heading" style={{ marginTop: 0, fontSize: 16 }}>
            Live events
          </h2>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
            {progressEvents.map((event, index) => (
              <li key={`${event.timestamp}-${index}`}>
                {new Date(event.timestamp).toLocaleTimeString()} — {event.message}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
