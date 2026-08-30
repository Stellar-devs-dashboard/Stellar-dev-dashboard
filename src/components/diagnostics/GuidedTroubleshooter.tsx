import { Ban, CheckCircle2, PlayCircle, RotateCcw, ShieldCheck } from 'lucide-react';
import { TROUBLESHOOTING_FLOWS } from '../../lib/diagnostics';
import type { TroubleshootingFlowId, TroubleshootingRun } from '../../types/diagnostics';
import { buttonStyle, panelStyle, primaryButtonStyle, StatusBadge } from './styles';

interface GuidedTroubleshooterProps {
  runs: TroubleshootingRun[];
  runningFlow: TroubleshootingFlowId | null;
  onRun: (_flowId: TroubleshootingFlowId) => Promise<TroubleshootingRun | null>;
  onCancel: () => void;
}

export default function GuidedTroubleshooter({
  runs,
  runningFlow,
  onRun,
  onCancel,
}: GuidedTroubleshooterProps) {
  const activeRun = runs[0];
  return (
    <div className="diagnostic-stack">
      <section style={panelStyle} aria-labelledby="guided-heading">
        <div className="diagnostic-section-heading">
          <div>
            <h2 id="guided-heading">Guided incident troubleshooting</h2>
            <p>
              Every check is read-only or uses one temporary storage key that is removed
              immediately. Wallet access, signing, submission, unregister, and cache deletion are
              excluded.
            </p>
          </div>
          <ShieldCheck size={24} color="var(--green)" aria-hidden="true" />
        </div>
      </section>

      <div className="diagnostic-flow-grid">
        {Object.values(TROUBLESHOOTING_FLOWS).map((flow) => {
          const latest = runs.find((run) => run.flowId === flow.id);
          const running = runningFlow === flow.id;
          return (
            <article key={flow.id} style={panelStyle} className="diagnostic-flow-card">
              <div className="diagnostic-section-heading compact">
                <h3>{flow.title}</h3>
                {latest && <StatusBadge status={latest.status} />}
              </div>
              <p>{flow.summary}</p>
              <ul>
                {flow.checks.map((item) => (
                  <li key={item.id}>{item.title}</li>
                ))}
              </ul>
              <button
                type="button"
                style={running ? buttonStyle : primaryButtonStyle}
                onClick={() => (running ? onCancel() : void onRun(flow.id))}
                disabled={Boolean(runningFlow && !running)}
                aria-busy={running}
              >
                {running ? (
                  <Ban size={14} />
                ) : latest ? (
                  <RotateCcw size={14} />
                ) : (
                  <PlayCircle size={14} />
                )}
                {running ? 'Cancel checks' : latest ? 'Run again' : 'Run checks'}
              </button>
            </article>
          );
        })}
      </div>

      {!activeRun && !runningFlow ? (
        <section style={panelStyle} className="diagnostic-empty" aria-labelledby="no-run-heading">
          <PlayCircle size={28} aria-hidden="true" />
          <h2 id="no-run-heading">Choose an incident guide</h2>
          <p>Results, evidence, and documentation-backed remediation steps will appear here.</p>
        </section>
      ) : runningFlow && !activeRun ? (
        <section
          style={panelStyle}
          aria-live="polite"
          aria-busy="true"
          className="diagnostic-loading-panel"
        >
          <span className="diagnostic-spinner" aria-hidden="true" />
          <div>
            <h2>Running non-destructive checks</h2>
            <p>{TROUBLESHOOTING_FLOWS[runningFlow].title}</p>
          </div>
        </section>
      ) : activeRun ? (
        <section style={panelStyle} aria-labelledby="run-result-heading">
          <div className="diagnostic-section-heading">
            <div>
              <h2 id="run-result-heading">
                Latest result: {TROUBLESHOOTING_FLOWS[activeRun.flowId].title}
              </h2>
              <p>
                Completed {new Date(activeRun.completedAt).toLocaleString()} · correlation evidence
                retained locally.
              </p>
            </div>
            <StatusBadge status={activeRun.status} />
          </div>
          <ol className="diagnostic-check-list">
            {activeRun.results.map((result) => (
              <li key={result.checkId}>
                <div className="diagnostic-check-icon" aria-hidden="true">
                  {result.status === 'pass' ? <CheckCircle2 size={18} /> : <span>!</span>}
                </div>
                <div>
                  <strong>
                    {
                      TROUBLESHOOTING_FLOWS[activeRun.flowId].checks.find(
                        (item) => item.id === result.checkId
                      )?.title
                    }
                  </strong>
                  <p>{result.summary}</p>
                  <small>{result.durationMs} ms · evidence redacted</small>
                </div>
                <StatusBadge status={result.status} />
              </li>
            ))}
          </ol>
          {activeRun.remediations.length > 0 && (
            <div className="diagnostic-remediation" aria-labelledby="remediation-heading">
              <h3 id="remediation-heading">Recommended next steps</h3>
              {activeRun.remediations.map((remediation) => (
                <article key={remediation.id}>
                  <div className="diagnostic-section-heading compact">
                    <h4>{remediation.title}</h4>
                    <StatusBadge status="success">Non-destructive</StatusBadge>
                  </div>
                  <p>{remediation.description}</p>
                  <ol>
                    {remediation.steps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                  <code>{remediation.documentationRef}</code>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
