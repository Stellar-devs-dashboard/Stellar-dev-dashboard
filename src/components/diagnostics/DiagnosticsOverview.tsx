import { EyeOff, Pause, Play, Trash2 } from 'lucide-react';
import type {
  DiagnosticRepositoryState,
  DiagnosticSnapshot,
  DiagnosticsViewState,
  EndpointHealth,
  EnvironmentSnapshot,
} from '../../types/diagnostics';
import { buttonStyle, MetricCard, panelStyle, StatusBadge } from './styles';

interface DiagnosticsOverviewProps {
  viewState: DiagnosticsViewState;
  snapshot: DiagnosticSnapshot;
  repository: DiagnosticRepositoryState;
  environment: EnvironmentSnapshot | null;
  endpointHealth: EndpointHealth[];
  onCapture: (_enabled: boolean) => void;
  onRequestClear: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1_024) return `${bytes} B`;
  return `${(bytes / 1_024).toFixed(1)} KiB`;
}

export default function DiagnosticsOverview({
  viewState,
  snapshot,
  repository,
  environment,
  endpointHealth,
  onCapture,
  onRequestClear,
}: DiagnosticsOverviewProps) {
  const failures = snapshot.events.filter((event) =>
    ['failure', 'degraded'].includes(event.outcome)
  );
  return (
    <div className="diagnostic-stack">
      <div className="diagnostic-metrics" aria-label="Diagnostic capture summary">
        <MetricCard
          label="Local events"
          value={snapshot.events.length}
          hint={`${snapshot.droppedEvents} evicted`}
        />
        <MetricCard
          label="Redactions"
          value={snapshot.totalRedactions}
          hint="Applied before capture"
        />
        <MetricCard
          label="Buffer size"
          value={formatBytes(snapshot.approximateBytes)}
          hint="Bounded in memory"
        />
        <MetricCard
          label="Persistence"
          value={<StatusBadge status={repository.persistence} />}
          hint={`${repository.bundles.length} saved bundles`}
        />
      </div>

      {repository.warning && (
        <div className="diagnostic-callout warning" role="status">
          <strong>Storage degraded</strong>
          <span>{repository.warning}</span>
        </div>
      )}
      {viewState === 'offline' && (
        <div className="diagnostic-callout warning" role="status">
          <strong>Offline</strong>
          <span>
            Existing evidence remains available. Endpoint checks will report offline until
            connectivity returns.
          </span>
        </div>
      )}

      <section style={panelStyle} aria-labelledby="capture-heading">
        <div className="diagnostic-section-heading">
          <div>
            <h2 id="capture-heading">Capture buffer</h2>
            <p>
              Raw values are never retained. Redaction and size bounds run before an event enters
              memory.
            </p>
          </div>
          <div className="diagnostic-actions">
            <button type="button" style={buttonStyle} onClick={() => onCapture(!snapshot.enabled)}>
              {snapshot.enabled ? <Pause size={14} /> : <Play size={14} />}
              {snapshot.enabled ? 'Pause capture' : 'Resume capture'}
            </button>
            <button type="button" style={buttonStyle} onClick={onRequestClear}>
              <Trash2 size={14} /> Clear local data
            </button>
          </div>
        </div>
        <div className="diagnostic-inline-status" aria-live="polite">
          <StatusBadge status={snapshot.enabled ? 'success' : 'unknown'}>
            {snapshot.enabled ? 'Capture active' : 'Capture paused'}
          </StatusBadge>
          <span>{failures.length} failure or degraded events</span>
          <span>{snapshot.breadcrumbs.length} reproducible action breadcrumbs</span>
        </div>
      </section>

      {snapshot.events.length === 0 ? (
        <section
          style={panelStyle}
          className="diagnostic-empty"
          aria-labelledby="empty-events-heading"
        >
          <EyeOff size={28} aria-hidden="true" />
          <h2 id="empty-events-heading">No diagnostic events captured</h2>
          <p>Use the dashboard normally or run a guided check. Evidence stays in this browser.</p>
        </section>
      ) : (
        <section style={panelStyle} aria-labelledby="recent-events-heading">
          <div className="diagnostic-section-heading">
            <div>
              <h2 id="recent-events-heading">Recent evidence</h2>
              <p>Newest first. Details shown here have already passed deterministic redaction.</p>
            </div>
            <StatusBadge status={failures.length ? 'degraded' : 'success'} />
          </div>
          <div className="diagnostic-table-wrap">
            <table className="diagnostic-table">
              <thead>
                <tr>
                  <th scope="col">Time</th>
                  <th scope="col">Category</th>
                  <th scope="col">Event</th>
                  <th scope="col">Outcome</th>
                  <th scope="col">Privacy</th>
                </tr>
              </thead>
              <tbody>
                {[...snapshot.events]
                  .reverse()
                  .slice(0, 25)
                  .map((event) => (
                    <tr key={event.id}>
                      <td>{new Date(event.timestamp).toLocaleTimeString()}</td>
                      <td>{event.category}</td>
                      <td>
                        <strong>{event.name}</strong>
                        <small>{event.message}</small>
                      </td>
                      <td>
                        <StatusBadge status={event.outcome} />
                      </td>
                      <td>
                        {event.redactionCount} redacted{event.truncated ? ' · truncated' : ''}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="diagnostic-two-column">
        <section style={panelStyle} aria-labelledby="environment-heading">
          <h2 id="environment-heading">Environment</h2>
          {environment ? (
            <dl className="diagnostic-definition-list">
              <div>
                <dt>Browser</dt>
                <dd>{environment.browserFamily}</dd>
              </div>
              <div>
                <dt>Platform</dt>
                <dd>{environment.platformClass}</dd>
              </div>
              <div>
                <dt>Build</dt>
                <dd>
                  {environment.appVersion} · {environment.buildMode}
                </dd>
              </div>
              <div>
                <dt>Connectivity</dt>
                <dd>{environment.online ? 'online' : 'offline'}</dd>
              </div>
              <div>
                <dt>Storage use</dt>
                <dd>{environment.storageEstimate?.usageBucket ?? 'unknown'}</dd>
              </div>
            </dl>
          ) : (
            <p>Environment metadata has not been collected.</p>
          )}
        </section>
        <section style={panelStyle} aria-labelledby="endpoint-heading">
          <h2 id="endpoint-heading">Endpoint health</h2>
          {endpointHealth.length === 0 ? (
            <p>Run the endpoint or transaction guide to collect read-only health evidence.</p>
          ) : (
            <ul className="diagnostic-plain-list">
              {endpointHealth.map((endpoint) => (
                <li key={endpoint.id}>
                  <div>
                    <strong>{endpoint.kind}</strong>
                    <small>{endpoint.detail}</small>
                  </div>
                  <StatusBadge status={endpoint.state} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
