import { useState, type FormEvent } from 'react';
import { GitCompareArrows, Plus, Server, Trash2 } from 'lucide-react';
import type {
  CompatibilityStatus,
  EndpointComparisonResult,
  NetworkProbeResult,
} from '../../types/compatibility';
import { buttonStyle, Field, inputStyle, labelStyle, panelStyle, StatusBadge } from './styles';

interface EndpointComparisonProps {
  primary: NetworkProbeResult;
  probes: NetworkProbeResult[];
  comparison: EndpointComparisonResult | null;
  refreshing: boolean;
  onAdd: (_input: { label: string; rpcUrl: string; horizonUrl?: string }) => Promise<unknown>;
  onRemove: (_targetId: string) => void;
}

function endpointStatus(probe: NetworkProbeResult): CompatibilityStatus {
  if (!probe.online) return 'offline';
  if (probe.errors.some((problem) => problem.code === 'identity-mismatch')) return 'contradictory';
  if (probe.protocolVersion === null) return 'unknown';
  if (probe.methods.some((method) => method.supported === false)) return 'degraded';
  return 'compatible';
}

export default function EndpointComparison({
  primary,
  probes,
  comparison,
  refreshing,
  onAdd,
  onRemove,
}: EndpointComparisonProps) {
  const [label, setLabel] = useState('');
  const [rpcUrl, setRpcUrl] = useState('');
  const [horizonUrl, setHorizonUrl] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const result = await onAdd({ label, rpcUrl, horizonUrl: horizonUrl || undefined });
    if (result) {
      setLabel('');
      setRpcUrl('');
      setHorizonUrl('');
    }
  };

  return (
    <div className="compat-stack">
      <section style={panelStyle} aria-labelledby="compare-add-heading">
        <div className="compat-section-heading">
          <div>
            <h2 id="compare-add-heading">Compare RPC endpoints</h2>
            <p>
              Probe up to four failover or vendor endpoints and detect identity, protocol,
              retention, ledger-lag, and method contradictions.
            </p>
          </div>
          <GitCompareArrows size={21} color="var(--cyan)" aria-hidden="true" />
        </div>
        <form onSubmit={(event) => void submit(event)} className="compat-form-grid">
          <label style={labelStyle}>
            Endpoint label
            <input
              style={inputStyle}
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Failover RPC"
              maxLength={80}
            />
          </label>
          <label style={labelStyle}>
            Soroban RPC URL
            <input
              style={inputStyle}
              value={rpcUrl}
              onChange={(event) => setRpcUrl(event.target.value)}
              placeholder="https://rpc.example"
              inputMode="url"
              type="url"
              required
            />
          </label>
          <label style={labelStyle}>
            Horizon URL <span className="compat-optional">optional; defaults to primary</span>
            <input
              style={inputStyle}
              value={horizonUrl}
              onChange={(event) => setHorizonUrl(event.target.value)}
              placeholder={primary.target.horizonUrl}
              inputMode="url"
              type="url"
            />
          </label>
          <div className="compat-form-action">
            <button type="submit" style={buttonStyle} disabled={refreshing || !rpcUrl.trim()}>
              <Plus size={15} aria-hidden="true" />
              {refreshing ? 'Probing…' : 'Probe & compare'}
            </button>
          </div>
        </form>
        <p className="compat-privacy-note">
          URLs are held in memory for this comparison. Authentication headers from the primary
          profile are not copied to comparison endpoints.
        </p>
      </section>

      <div className="compat-endpoint-grid">
        {probes.map((probe) => (
          <article key={probe.target.id} style={panelStyle}>
            <div className="compat-heading-line">
              <div className="compat-endpoint-title">
                <Server size={17} aria-hidden="true" />
                <h2>{probe.target.label}</h2>
              </div>
              <StatusBadge status={endpointStatus(probe)} />
            </div>
            <dl className="compat-compact-fields">
              <Field label="Protocol" value={probe.protocolVersion} />
              <Field label="Latest ledger" value={probe.latestLedger?.toLocaleString()} />
              <Field
                label="Oldest retained"
                value={probe.retention.oldestLedger?.toLocaleString()}
              />
              <Field
                label="Methods"
                value={`${probe.methods.filter((method) => method.supported).length}/${probe.methods.length}`}
              />
            </dl>
            <div className="compat-endpoint-url" title={probe.target.rpcUrl}>
              {probe.target.rpcUrl}
            </div>
            {probe.target.id !== primary.target.id && (
              <button
                type="button"
                style={{ ...buttonStyle, marginTop: 12 }}
                onClick={() => onRemove(probe.target.id)}
                aria-label={`Remove ${probe.target.label} from comparison`}
              >
                <Trash2 size={14} aria-hidden="true" /> Remove
              </button>
            )}
          </article>
        ))}
      </div>

      {!comparison ? (
        <section
          style={panelStyle}
          className="compat-empty"
          aria-labelledby="compare-empty-heading"
        >
          <GitCompareArrows size={30} aria-hidden="true" />
          <h2 id="compare-empty-heading">One endpoint is not a comparison</h2>
          <p>Add another RPC endpoint to produce field-by-field contradiction evidence.</p>
        </section>
      ) : (
        <section style={panelStyle} aria-labelledby="differences-heading">
          <div className="compat-section-heading">
            <div>
              <div className="compat-heading-line">
                <h2 id="differences-heading">Comparison result</h2>
                <StatusBadge status={comparison.status} />
              </div>
              <p>{comparison.recommendation}</p>
            </div>
            <GitCompareArrows size={21} color="var(--cyan)" aria-hidden="true" />
          </div>
          {comparison.differences.length === 0 ? (
            <div className="compat-success-note" role="status">
              No material identity or capability differences were observed.
            </div>
          ) : (
            <div className="compat-difference-list">
              {comparison.differences.map((difference) => (
                <article
                  key={difference.field}
                  className={`compat-difference ${difference.severity}`}
                >
                  <div className="compat-heading-line">
                    <h3>{difference.field}</h3>
                    <span className="compat-severity">{difference.severity}</span>
                  </div>
                  <p>{difference.explanation}</p>
                  <dl>
                    {Object.entries(difference.values).map(([target, value]) => (
                      <div key={target}>
                        <dt>{target}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
