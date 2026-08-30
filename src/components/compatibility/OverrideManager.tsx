import { useMemo, useState, type FormEvent } from 'react';
import { ShieldAlert, Trash2 } from 'lucide-react';
import type {
  CompatibilityAssessment,
  DashboardFeatureId,
  MaintainerOverride,
} from '../../types/compatibility';
import { buttonStyle, inputStyle, labelStyle, panelStyle, StatusBadge } from './styles';

interface OverrideManagerProps {
  assessment: CompatibilityAssessment;
  overrides: MaintainerOverride[];
  onAdd: (_input: {
    featureId: DashboardFeatureId | '*';
    forcedStatus: MaintainerOverride['forcedStatus'];
    reason: string;
    author: string;
    expiresAt: string;
  }) => boolean;
  onRemove: (_id: string) => void;
}

function tomorrowInput(): string {
  const date = new Date(Date.now() + 24 * 60 * 60_000);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export default function OverrideManager({
  assessment,
  overrides,
  onAdd,
  onRemove,
}: OverrideManagerProps) {
  const [featureId, setFeatureId] = useState<DashboardFeatureId | '*'>('*');
  const [forcedStatus, setForcedStatus] = useState<MaintainerOverride['forcedStatus']>('degraded');
  const [reason, setReason] = useState('');
  const [author, setAuthor] = useState('');
  const [expiresAt, setExpiresAt] = useState(tomorrowInput);
  const targetOverrides = useMemo(
    () => overrides.filter((override) => override.targetId === assessment.targetId),
    [assessment.targetId, overrides]
  );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const saved = onAdd({
      featureId,
      forcedStatus,
      reason,
      author,
      expiresAt: new Date(expiresAt).toISOString(),
    });
    if (saved) setReason('');
  };

  return (
    <div className="compat-stack">
      <section
        style={{ ...panelStyle, borderColor: 'var(--amber)' }}
        aria-labelledby="override-heading"
      >
        <div className="compat-section-heading">
          <div>
            <h2 id="override-heading">Maintainer overrides</h2>
            <p>
              Time-bounded, attributed decisions for verified vendor behavior. Overrides are visible
              in evidence and exports and never alter the versioned matrix.
            </p>
          </div>
          <ShieldAlert size={22} color="var(--amber)" aria-hidden="true" />
        </div>
        <div className="compat-warning-note" role="note">
          A “compatible” override can enable a gated workflow. Record external test evidence in the
          reason and keep expiry short; unknown future protocols should instead receive a reviewed
          matrix release.
        </div>
        <form className="compat-override-form" onSubmit={submit}>
          <label style={labelStyle}>
            Feature
            <select
              style={inputStyle}
              value={featureId}
              onChange={(event) => setFeatureId(event.target.value as DashboardFeatureId | '*')}
            >
              <option value="*">All features</option>
              {assessment.features.map((decision) => (
                <option value={decision.feature.id} key={decision.feature.id}>
                  {decision.feature.label}
                </option>
              ))}
            </select>
          </label>
          <label style={labelStyle}>
            Forced status
            <select
              style={inputStyle}
              value={forcedStatus}
              onChange={(event) =>
                setForcedStatus(event.target.value as MaintainerOverride['forcedStatus'])
              }
            >
              <option value="compatible">Compatible</option>
              <option value="degraded">Degraded</option>
              <option value="incompatible">Incompatible</option>
              <option value="unknown">Unknown</option>
            </select>
          </label>
          <label style={labelStyle}>
            Maintainer
            <input
              style={inputStyle}
              value={author}
              onChange={(event) => setAuthor(event.target.value)}
              maxLength={100}
              required
              autoComplete="off"
            />
          </label>
          <label style={labelStyle}>
            Expires
            <input
              style={inputStyle}
              type="datetime-local"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
              required
            />
          </label>
          <label style={{ ...labelStyle, gridColumn: '1 / -1' }}>
            Evidence-backed reason
            <textarea
              style={{ ...inputStyle, minHeight: 92, resize: 'vertical' }}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              minLength={10}
              maxLength={500}
              required
              placeholder="Vendor release and fixture evidence supporting this temporary decision…"
            />
          </label>
          <div style={{ gridColumn: '1 / -1' }}>
            <button type="submit" style={buttonStyle}>
              Save attributed override
            </button>
          </div>
        </form>
      </section>

      <section style={panelStyle} aria-labelledby="active-overrides-heading">
        <div className="compat-section-heading">
          <div>
            <h2 id="active-overrides-heading">Active target overrides</h2>
            <p>Expired records are discarded during load.</p>
          </div>
          <span className="compat-count">{targetOverrides.length}</span>
        </div>
        {targetOverrides.length === 0 ? (
          <div className="compat-empty compact">
            <ShieldAlert size={25} aria-hidden="true" />
            <p>No maintainer override affects this endpoint.</p>
          </div>
        ) : (
          <div className="compat-override-list">
            {targetOverrides.map((override) => (
              <article key={override.id} className="compat-override-card">
                <div className="compat-heading-line">
                  <div>
                    <span className="compat-eyebrow">{override.featureId}</span>
                    <h3>{override.reason}</h3>
                  </div>
                  <StatusBadge status={override.forcedStatus} />
                </div>
                <p>
                  {override.author} · created {new Date(override.createdAt).toLocaleString()} ·
                  expires {new Date(override.expiresAt).toLocaleString()}
                </p>
                <button
                  type="button"
                  style={buttonStyle}
                  onClick={() => onRemove(override.id)}
                  aria-label={`Remove override for ${override.featureId}`}
                >
                  <Trash2 size={14} aria-hidden="true" /> Remove
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
