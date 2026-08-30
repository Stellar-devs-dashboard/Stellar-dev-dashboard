import type { CSSProperties } from 'react';
import { Pause, Play, Square } from 'lucide-react';
import type { BulkExecutionPlan, BulkProgressEvent, BulkRunCheckpoint } from '../../types/bulkOperationsPlanner';
import { checkpointProgress, summarizeCheckpoint } from '../../lib/bulkOperationsPlanner/executor';

const panel: CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  padding: 18,
};

interface BulkExecutePanelProps {
  plan: BulkExecutionPlan | null;
  checkpoint: BulkRunCheckpoint | null;
  progressEvents: BulkProgressEvent[];
  executing: boolean;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
}

export default function BulkExecutePanel({
  plan,
  checkpoint,
  progressEvents,
  executing,
  onStart,
  onPause,
  onResume,
  onCancel,
}: BulkExecutePanelProps) {
  const summary = checkpoint ? summarizeCheckpoint(checkpoint) : null;
  const progress = checkpoint ? checkpointProgress(checkpoint) : 0;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <section style={panel} aria-labelledby="bulk-execute-heading">
        <h2 id="bulk-execute-heading" style={{ marginTop: 0 }}>
          Execute
        </h2>

        {!plan && (
          <p role="status" style={{ color: 'var(--text-muted)' }}>
            Build a plan on the Plan tab before executing.
          </p>
        )}

        {plan && (
          <>
            <p>
              Ready to execute {plan.totalOperations} operations across {plan.totalPacks} pack(s).
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button type="button" onClick={onStart} disabled={executing}>
                <Play size={16} aria-hidden="true" /> Start run
              </button>
              <button type="button" onClick={onPause} disabled={!executing}>
                <Pause size={16} aria-hidden="true" /> Pause
              </button>
              <button type="button" onClick={onResume} disabled={!executing}>
                Resume
              </button>
              <button type="button" onClick={onCancel} disabled={!executing}>
                <Square size={16} aria-hidden="true" /> Cancel
              </button>
            </div>

            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              aria-label="Bulk run progress"
              style={{
                marginTop: 16,
                height: 10,
                borderRadius: 999,
                background: 'var(--bg-elevated)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${progress}%`,
                  height: '100%',
                  background: 'var(--accent)',
                  transition: 'width 200ms ease',
                }}
              />
            </div>

            {summary && (
              <ul style={{ marginTop: 12 }}>
                <li>Completed: {summary.completed}</li>
                <li>Failed: {summary.failed}</li>
                <li>Pending: {summary.pending}</li>
                <li>Awaiting approval: {summary.awaitingApproval}</li>
              </ul>
            )}
          </>
        )}
      </section>

      {progressEvents.length > 0 && (
        <section style={panel} aria-labelledby="bulk-progress-log-heading">
          <h2 id="bulk-progress-log-heading" style={{ marginTop: 0, fontSize: 16 }}>
            Progress log
          </h2>
          <ol reversed style={{ margin: 0, paddingLeft: 20, maxHeight: 260, overflow: 'auto', fontSize: 13 }}>
            {[...progressEvents].reverse().slice(0, 30).map((event, index) => (
              <li key={`${event.timestamp}-${index}`} style={{ marginBottom: 6 }}>
                [{event.type}] {event.message}
                {event.percentComplete != null ? ` (${event.percentComplete}%)` : ''}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
