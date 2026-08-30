import { useState, type FormEvent } from 'react';
import { EyeOff, LockKeyhole, Plus, ShieldAlert, Trash2 } from 'lucide-react';
import type { RedactionRule } from '../../types/diagnostics';
import {
  buttonStyle,
  inputStyle,
  labelStyle,
  panelStyle,
  primaryButtonStyle,
  StatusBadge,
} from './styles';

interface PrivacyControlsProps {
  rules: RedactionRule[];
  onAdd: (_rule: RedactionRule) => void;
  onRemove: (_id: string) => void;
}

function makeRuleId(label: string): string {
  const normalized = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24);
  return normalized || `rule-${Date.now().toString(36)}`;
}

export default function PrivacyControls({ rules, onAdd, onRemove }: PrivacyControlsProps) {
  const [label, setLabel] = useState('');
  const [literal, setLiteral] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    try {
      onAdd({
        id: makeRuleId(label),
        label: label.trim(),
        literal,
        caseSensitive,
        enabled: true,
      });
      setLabel('');
      setLiteral('');
      setFormError(null);
    } catch (cause) {
      setFormError(
        cause instanceof Error ? cause.message : 'Sensitive pattern could not be added.'
      );
    }
  };

  return (
    <div className="diagnostic-stack">
      <section style={panelStyle} aria-labelledby="privacy-heading">
        <div className="diagnostic-section-heading">
          <div>
            <h2 id="privacy-heading">Privacy and data flow</h2>
            <p>
              Diagnostic capture has no remote endpoint. Data leaves the page only when you
              explicitly download JSON.
            </p>
          </div>
          <LockKeyhole size={23} color="var(--green)" aria-hidden="true" />
        </div>
        <div className="diagnostic-privacy-grid">
          <article>
            <StatusBadge status="success">Local only</StatusBadge>
            <h3>No telemetry transport</h3>
            <p>No beacon, analytics event, background sync, or upload is added by diagnostics.</p>
          </article>
          <article>
            <StatusBadge status="success">Redact first</StatusBadge>
            <h3>Before memory</h3>
            <p>
              Secrets, addresses, XDR, signatures, URLs, file paths, and local identifiers are
              replaced before capture.
            </p>
          </article>
          <article>
            <StatusBadge status="success">Bounded</StatusBadge>
            <h3>Finite retention</h3>
            <p>
              Ring buffers evict old records; five bundles are retained locally for no more than 30
              days.
            </p>
          </article>
          <article>
            <StatusBadge status="success">Verifiable</StatusBadge>
            <h3>Integrity manifest</h3>
            <p>
              Every export includes canonical SHA-256 content integrity, record counts, inclusion
              choices, size, and expiry.
            </p>
          </article>
        </div>
      </section>

      <section style={panelStyle} aria-labelledby="custom-pattern-heading">
        <div className="diagnostic-section-heading">
          <div>
            <h2 id="custom-pattern-heading">Session-sensitive literals</h2>
            <p>
              Add an organization-specific name or identifier. Literals stay in memory, are never
              displayed again, and are excluded from bundles.
            </p>
          </div>
          <EyeOff size={21} aria-hidden="true" />
        </div>
        <form onSubmit={submit} className="diagnostic-pattern-form">
          <label style={labelStyle}>
            Rule label
            <input
              style={inputStyle}
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              maxLength={80}
              required
              placeholder="Internal project name"
            />
          </label>
          <label style={labelStyle}>
            Sensitive literal
            <input
              style={inputStyle}
              type="password"
              value={literal}
              onChange={(event) => setLiteral(event.target.value)}
              minLength={3}
              maxLength={128}
              required
              autoComplete="off"
              placeholder="Value to redact"
            />
          </label>
          <label className="diagnostic-check-control inline">
            <input
              type="checkbox"
              checked={caseSensitive}
              onChange={(event) => setCaseSensitive(event.target.checked)}
            />
            <span>
              <strong>Case-sensitive match</strong>
            </span>
          </label>
          <button type="submit" style={primaryButtonStyle}>
            <Plus size={14} /> Add session rule
          </button>
        </form>
        {formError && (
          <div className="diagnostic-callout error" role="alert">
            <ShieldAlert size={16} />
            <span>{formError}</span>
          </div>
        )}
        {rules.length === 0 ? (
          <p>No custom session rules are active. Built-in redaction remains enabled.</p>
        ) : (
          <ul className="diagnostic-plain-list">
            {rules.map((rule) => (
              <li key={rule.id}>
                <div>
                  <strong>{rule.label}</strong>
                  <small>
                    Literal hidden · {rule.caseSensitive ? 'case-sensitive' : 'case-insensitive'}
                  </small>
                </div>
                <button
                  type="button"
                  style={buttonStyle}
                  onClick={() => onRemove(rule.id)}
                  aria-label={`Remove ${rule.label}`}
                >
                  <Trash2 size={14} /> Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        style={{ ...panelStyle, borderColor: 'var(--amber)' }}
        aria-labelledby="threat-heading"
      >
        <div className="diagnostic-section-heading compact">
          <h2 id="threat-heading">Threat boundary</h2>
          <ShieldAlert size={20} color="var(--amber)" aria-hidden="true" />
        </div>
        <p>
          Same-origin scripts and browser extensions can inspect in-memory page state. Keep wallet
          secrets outside the dashboard, review the preview before download, and share exported
          files through your normal secure support channel. Integrity detects modification; it does
          not encrypt the file or prove its author.
        </p>
      </section>
    </div>
  );
}
