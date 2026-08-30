import { useRef, useState, type ChangeEvent } from 'react';
import { AlertTriangle, FileCheck2, FileUp, Play, SearchCheck } from 'lucide-react';
import type {
  AuditArtifact,
  CompatibilityAssessment,
  UpgradeReadinessAudit,
} from '../../types/compatibility';
import { COMPATIBILITY_MATRIX, parseAuditInventory } from '../../lib/compatibility';
import { buttonStyle, inputStyle, labelStyle, panelStyle } from './styles';

interface UpgradeAuditProps {
  assessment: CompatibilityAssessment;
  audit: UpgradeReadinessAudit | null;
  artifacts: AuditArtifact[];
  onArtifacts: (_artifacts: AuditArtifact[]) => void;
  onRun: (_targetProtocol: number, _inventory?: AuditArtifact[]) => unknown;
}

const FINDING_COLOR = {
  pass: 'var(--green)',
  warning: 'var(--amber)',
  fail: 'var(--red)',
  unknown: 'var(--text-muted)',
} as const;

export default function UpgradeAudit({
  assessment,
  audit,
  artifacts,
  onArtifacts,
  onRun,
}: UpgradeAuditProps) {
  const [targetProtocol, setTargetProtocol] = useState(
    assessment.protocolVersion ?? COMPATIBILITY_MATRIX.knownProtocolRange.maximum ?? 27
  );
  const [importError, setImportError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const importInventory = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 1_000_000) {
      setImportError('Audit inventory exceeds the 1 MB import limit.');
      return;
    }
    try {
      const document = parseAuditInventory(await file.text());
      onArtifacts(document.artifacts);
      setImportError(null);
    } catch (cause) {
      setImportError(
        cause instanceof Error ? cause.message : 'Audit inventory could not be imported.'
      );
    }
  };

  return (
    <div className="compat-stack">
      <section style={panelStyle} aria-labelledby="audit-config-heading">
        <div className="compat-section-heading">
          <div>
            <h2 id="audit-config-heading">Upgrade-readiness audit</h2>
            <p>
              Evaluate saved envelopes, snapshots, contract artifacts, plugins, custom networks, and
              cached data before a protocol change.
            </p>
          </div>
          <SearchCheck size={21} color="var(--cyan)" aria-hidden="true" />
        </div>
        <div className="compat-audit-controls">
          <label style={labelStyle}>
            Target protocol
            <input
              style={inputStyle}
              type="number"
              min={1}
              max={1000}
              value={targetProtocol}
              onChange={(event) => setTargetProtocol(Number(event.target.value))}
            />
          </label>
          <div>
            <span className="compat-control-label">Inventory</span>
            <strong>
              {artifacts.length} discovered or imported artifact{artifacts.length === 1 ? '' : 's'}
            </strong>
          </div>
          <button type="button" style={buttonStyle} onClick={() => inputRef.current?.click()}>
            <FileUp size={15} aria-hidden="true" /> Import versioned inventory
          </button>
          <input
            ref={inputRef}
            className="sr-only"
            type="file"
            accept="application/json,.json"
            onChange={(event) => void importInventory(event)}
          />
          <button
            type="button"
            style={{
              ...buttonStyle,
              background: 'var(--cyan)',
              color: 'var(--bg-base)',
              borderColor: 'var(--cyan)',
            }}
            onClick={() => onRun(targetProtocol)}
          >
            <Play size={15} aria-hidden="true" /> Run audit
          </button>
        </div>
        {importError && (
          <p role="alert" className="compat-inline-error">
            {importError}
          </p>
        )}
        <p className="compat-privacy-note">
          Imported JSON is limited to 1 MB and 1,000 typed records. Findings export metadata and
          digests only; arbitrary artifact payloads and credentials are excluded.
        </p>
      </section>

      {artifacts.length === 0 && !audit && (
        <section style={panelStyle} className="compat-empty" aria-labelledby="audit-empty-heading">
          <FileCheck2 size={31} aria-hidden="true" />
          <h2 id="audit-empty-heading">No saved artifacts discovered</h2>
          <p>
            The browser stores no recognized upgrade inventory. Import a versioned inventory to
            audit build systems or another browser profile; a matrix/SDK readiness check still runs
            with an empty inventory.
          </p>
          <button type="button" style={buttonStyle} onClick={() => onRun(targetProtocol, [])}>
            Run matrix-only audit
          </button>
        </section>
      )}

      {artifacts.length > 0 && (
        <section style={panelStyle} aria-labelledby="inventory-heading">
          <div className="compat-section-heading">
            <div>
              <h2 id="inventory-heading">Audit inventory</h2>
              <p>Only compatibility provenance used by the rules is displayed.</p>
            </div>
            <FileCheck2 size={20} color="var(--cyan)" aria-hidden="true" />
          </div>
          <div className="compat-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Kind</th>
                  <th>Schema</th>
                  <th>Protocol</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {artifacts.map((artifact) => (
                  <tr key={artifact.id}>
                    <td>{artifact.name}</td>
                    <td>{artifact.kind}</td>
                    <td>{artifact.schemaVersion ?? 'unknown'}</td>
                    <td>{artifact.protocolVersion ?? 'unknown'}</td>
                    <td>
                      {artifact.updatedAt
                        ? new Date(artifact.updatedAt).toLocaleString()
                        : 'unknown'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {audit && (
        <section style={panelStyle} aria-labelledby="audit-results-heading">
          <div className="compat-section-heading">
            <div>
              <div className="compat-heading-line">
                <h2 id="audit-results-heading">Protocol {audit.targetProtocol} readiness</h2>
                <span className={`compat-audit-status ${audit.status}`}>{audit.status}</span>
              </div>
              <p>
                {audit.counts.pass} pass, {audit.counts.warning} warnings, {audit.counts.fail}{' '}
                failures, {audit.counts.unknown} unknown.
              </p>
            </div>
            {audit.status === 'ready' ? (
              <FileCheck2 size={23} color="var(--green)" aria-hidden="true" />
            ) : (
              <AlertTriangle size={23} color="var(--amber)" aria-hidden="true" />
            )}
          </div>
          <div className="compat-finding-list">
            {audit.findings.length === 0 ? (
              <div className="compat-success-note">
                Matrix readiness passed; there were no individual artifacts to evaluate.
              </div>
            ) : (
              audit.findings.map((finding, index) => (
                <article
                  key={`${finding.artifactId}-${index}`}
                  className="compat-finding"
                  style={{ borderLeftColor: FINDING_COLOR[finding.status] }}
                >
                  <div className="compat-heading-line">
                    <div>
                      <span className="compat-eyebrow">
                        {finding.kind} · {finding.artifactName}
                      </span>
                      <h3>{finding.title}</h3>
                    </div>
                    <span
                      style={{ color: FINDING_COLOR[finding.status] }}
                      className="compat-severity"
                    >
                      {finding.status}
                    </span>
                  </div>
                  <p>{finding.explanation}</p>
                  <p className="compat-action">
                    <strong>Action:</strong> {finding.action}
                  </p>
                  <div className="compat-chip-list">
                    {finding.evidence.map((item) => (
                      <code key={item} className="compat-chip">
                        {item}
                      </code>
                    ))}
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      )}
    </div>
  );
}
