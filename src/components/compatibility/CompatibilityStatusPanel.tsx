import {
  AlertTriangle,
  Check,
  ChevronDown,
  CircleOff,
  Clock3,
  Database,
  ExternalLink,
  Server,
  ShieldCheck,
} from 'lucide-react';
import type {
  CompatibilityAssessment,
  FeatureDecision,
  NetworkProbeResult,
} from '../../types/compatibility';
import { Field, panelStyle, STATUS_COLOR, StatusBadge } from './styles';

function FeatureRow({ decision }: { decision: FeatureDecision }) {
  const color = STATUS_COLOR[decision.status];
  return (
    <article className="compat-feature-row" aria-labelledby={`feature-${decision.feature.id}`}>
      <div className="compat-feature-icon" style={{ color, borderColor: color }} aria-hidden="true">
        {decision.enabled ? <Check size={15} /> : <CircleOff size={15} />}
      </div>
      <div className="compat-feature-copy">
        <div className="compat-feature-heading">
          <h3 id={`feature-${decision.feature.id}`}>{decision.feature.label}</h3>
          <StatusBadge status={decision.status} />
        </div>
        <p>{decision.summary}</p>
        <p className="compat-action">
          <strong>Next:</strong> {decision.action}
        </p>
        {(decision.missingMethods.length > 0 || decision.optionalMissingMethods.length > 0) && (
          <div className="compat-chip-list" aria-label="Missing RPC capabilities">
            {decision.missingMethods.map((method) => (
              <span key={`required-${method}`} className="compat-chip compat-chip-required">
                {method} required
              </span>
            ))}
            {decision.optionalMissingMethods.map((method) => (
              <span key={`optional-${method}`} className="compat-chip">
                {method} optional
              </span>
            ))}
          </div>
        )}
        {decision.override && (
          <p className="compat-override-note">
            Override by {decision.override.author}; expires{' '}
            {new Date(decision.override.expiresAt).toLocaleString()}.
          </p>
        )}
      </div>
    </article>
  );
}

function MethodGrid({ probe }: { probe: NetworkProbeResult }) {
  return (
    <div className="compat-method-grid" aria-label="Soroban RPC method support">
      {probe.methods.map((method) => (
        <div key={method.name} className="compat-method">
          <span
            className="compat-method-indicator"
            style={{
              background:
                method.supported === true
                  ? 'var(--green)'
                  : method.supported === false
                    ? 'var(--red)'
                    : 'var(--text-muted)',
            }}
            aria-hidden="true"
          />
          <span>{method.name}</span>
          <span className="sr-only">
            {method.supported === true
              ? 'supported'
              : method.supported === false
                ? 'missing'
                : 'unknown'}
          </span>
          {method.latencyMs !== null && <small>{method.latencyMs} ms</small>}
        </div>
      ))}
    </div>
  );
}

export default function CompatibilityStatusPanel({
  assessment,
  probe,
}: {
  assessment: CompatibilityAssessment;
  probe: NetworkProbeResult;
}) {
  const enabled = assessment.features.filter((feature) => feature.enabled).length;
  const hardFailures = assessment.features.filter(
    (feature) => feature.status === 'incompatible'
  ).length;

  return (
    <div className="compat-stack">
      <section
        style={{ ...panelStyle, borderColor: STATUS_COLOR[assessment.status] }}
        aria-labelledby="compat-summary-heading"
      >
        <div className="compat-summary">
          <div
            className="compat-summary-icon"
            style={{ color: STATUS_COLOR[assessment.status] }}
            aria-hidden="true"
          >
            {assessment.status === 'compatible' ? (
              <ShieldCheck size={30} />
            ) : (
              <AlertTriangle size={30} />
            )}
          </div>
          <div>
            <div className="compat-heading-line">
              <h2 id="compat-summary-heading">Compatibility assessment</h2>
              <StatusBadge status={assessment.status} />
            </div>
            <p>{assessment.summary}</p>
            <p className="compat-action">
              <strong>Action:</strong> {assessment.action}
            </p>
          </div>
        </div>
      </section>

      <div className="compat-stat-grid">
        <section style={panelStyle} aria-label="Observed protocol">
          <span className="compat-eyebrow">Protocol</span>
          <strong className="compat-stat-value">{probe.protocolVersion ?? 'Unknown'}</strong>
          <small>{assessment.matrixRelease?.lifecycle ?? 'not reviewed'} in matrix</small>
        </section>
        <section style={panelStyle} aria-label="Installed SDK">
          <span className="compat-eyebrow">Installed SDK</span>
          <strong className="compat-stat-value">v{assessment.sdk.version}</strong>
          <small>
            reviewed through protocol {assessment.sdk.protocolRange.maximum ?? 'unbounded'}
          </small>
        </section>
        <section style={panelStyle} aria-label="Feature gates">
          <span className="compat-eyebrow">Feature gates</span>
          <strong className="compat-stat-value">
            {enabled}/{assessment.features.length}
          </strong>
          <small>
            {hardFailures} hard failure{hardFailures === 1 ? '' : 's'}
          </small>
        </section>
        <section style={panelStyle} aria-label="Evidence freshness">
          <span className="compat-eyebrow">Freshness</span>
          <strong className="compat-stat-value">
            {assessment.freshness.stale ? 'Expired' : 'Fresh'}
          </strong>
          <small>{assessment.freshness.label}</small>
        </section>
      </div>

      <section style={panelStyle} aria-labelledby="identity-heading">
        <div className="compat-section-heading">
          <div>
            <h2 id="identity-heading">Network identity & bounds</h2>
            <p>Direct evidence from Horizon and Soroban RPC; request headers are excluded.</p>
          </div>
          <Server size={20} color="var(--cyan)" aria-hidden="true" />
        </div>
        <dl className="compat-field-grid">
          <Field label="Target" value={probe.target.label} />
          <Field label="Latest ledger" value={probe.latestLedger?.toLocaleString() ?? 'Unknown'} />
          <Field label="Network passphrase" value={probe.identity.passphrase} mono />
          <Field label="RPC version" value={probe.identity.rpcVersion} mono />
          <Field label="Captive Core" value={probe.identity.captiveCoreVersion} mono />
          <Field label="Horizon version" value={probe.identity.horizonVersion} mono />
          <Field
            label="Oldest retained ledger"
            value={probe.retention.oldestLedger?.toLocaleString() ?? 'Unknown'}
          />
          <Field
            label="Approx. retention"
            value={
              probe.retention.estimatedSeconds === null
                ? 'Unknown'
                : `${(probe.retention.estimatedSeconds / 86_400).toFixed(1)} days`
            }
          />
        </dl>
      </section>

      <section style={panelStyle} aria-labelledby="rpc-methods-heading">
        <div className="compat-section-heading">
          <div>
            <h2 id="rpc-methods-heading">Soroban RPC capability evidence</h2>
            <p>“Recognized” includes a valid result or a structured invalid-parameter response.</p>
          </div>
          <Database size={20} color="var(--cyan)" aria-hidden="true" />
        </div>
        <MethodGrid probe={probe} />
      </section>

      <section style={panelStyle} aria-labelledby="feature-gates-heading">
        <div className="compat-section-heading">
          <div>
            <h2 id="feature-gates-heading">Dashboard feature gates</h2>
            <p>
              Hard failures remain disabled; degraded modes include their missing optional evidence.
            </p>
          </div>
          <ShieldCheck size={20} color="var(--cyan)" aria-hidden="true" />
        </div>
        <div className="compat-feature-list">
          {assessment.features.map((decision) => (
            <FeatureRow key={decision.feature.id} decision={decision} />
          ))}
        </div>
      </section>

      <section style={panelStyle} aria-labelledby="limits-heading">
        <div className="compat-section-heading">
          <div>
            <h2 id="limits-heading">Reported retention and limits</h2>
            <p>Unknown values stay unknown rather than receiving optimistic defaults.</p>
          </div>
          <Clock3 size={20} color="var(--cyan)" aria-hidden="true" />
        </div>
        <dl className="compat-field-grid">
          <Field label="Ledger entries / request" value={probe.limits.maxLedgerEntriesPerRequest} />
          <Field label="Event filters" value={probe.limits.maxEventFilters} />
          <Field label="Event range (ledgers)" value={probe.limits.maxEventRangeLedgers} />
          <Field label="Transaction bytes" value={probe.limits.maxTransactionSizeBytes} />
          <Field label="Contract bytes" value={probe.limits.maxContractSizeBytes} />
          <Field label="Transactions / ledger" value={probe.limits.maxTransactionsPerLedger} />
        </dl>
      </section>

      <details style={panelStyle} className="compat-evidence">
        <summary>
          <span>
            <ExternalLink size={16} aria-hidden="true" /> Evidence ledger (
            {assessment.evidence.length})
          </span>
          <ChevronDown size={16} aria-hidden="true" />
        </summary>
        <div className="compat-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Source</th>
                <th>Field</th>
                <th>Value</th>
                <th>Observed</th>
                <th>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {assessment.evidence.map((item) => (
                <tr key={item.id}>
                  <td>{item.source}</td>
                  <td>
                    <code>{item.field}</code>
                  </td>
                  <td>{String(item.value ?? 'unknown')}</td>
                  <td>{new Date(item.observedAt).toLocaleString()}</td>
                  <td>{item.confidence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
