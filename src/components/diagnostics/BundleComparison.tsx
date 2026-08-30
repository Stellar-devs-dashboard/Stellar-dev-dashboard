import { GitCompareArrows, Upload } from 'lucide-react';
import type { ChangeEvent } from 'react';
import type {
  DiagnosticBundle,
  DiagnosticBundleComparison,
  DiagnosticBundlePreview,
} from '../../types/diagnostics';
import { buttonStyle, panelStyle, primaryButtonStyle, StatusBadge } from './styles';

interface BundleComparisonProps {
  preview: DiagnosticBundlePreview | null;
  imported: DiagnosticBundle | null;
  comparison: DiagnosticBundleComparison | null;
  onImport: (_file: File) => Promise<DiagnosticBundle | null>;
  onCompare: () => Promise<DiagnosticBundleComparison | null>;
}

export default function BundleComparison({
  preview,
  imported,
  comparison,
  onImport,
  onCompare,
}: BundleComparisonProps) {
  const selectFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void onImport(file);
  };
  return (
    <div className="diagnostic-stack">
      <section style={panelStyle} aria-labelledby="compare-heading">
        <div className="diagnostic-section-heading">
          <div>
            <h2 id="compare-heading">Import and compare</h2>
            <p>
              Imports are size-bounded, schema-validated, checked against the redaction contract,
              and verified against their SHA-256 manifest.
            </p>
          </div>
          <GitCompareArrows size={23} color="var(--cyan)" aria-hidden="true" />
        </div>
        <div className="diagnostic-actions">
          <label style={buttonStyle} className="diagnostic-file-label">
            <Upload size={14} /> Import diagnostic JSON
            <input type="file" accept="application/json,.json" onChange={selectFile} />
          </label>
          <button
            type="button"
            style={primaryButtonStyle}
            disabled={!preview || !imported}
            onClick={() => void onCompare()}
          >
            <GitCompareArrows size={14} /> Compare with preview
          </button>
        </div>
        <div className="diagnostic-compare-inputs">
          <div>
            <span>Imported bundle</span>
            <strong>
              {imported ? new Date(imported.createdAt).toLocaleString() : 'not selected'}
            </strong>
          </div>
          <div>
            <span>Current preview</span>
            <strong>
              {preview ? new Date(preview.bundle.createdAt).toLocaleString() : 'not generated'}
            </strong>
          </div>
        </div>
      </section>

      {!comparison ? (
        <section
          style={panelStyle}
          className="diagnostic-empty"
          aria-labelledby="comparison-empty-heading"
        >
          <GitCompareArrows size={28} aria-hidden="true" />
          <h2 id="comparison-empty-heading">Two verified bundles are required</h2>
          <p>
            Import a bundle and generate a current preview to compare incident evidence locally.
          </p>
        </section>
      ) : (
        <section style={panelStyle} aria-labelledby="comparison-result-heading">
          <div className="diagnostic-section-heading">
            <div>
              <h2 id="comparison-result-heading">Comparison result</h2>
              <p>{new Date(comparison.comparedAt).toLocaleString()}</p>
            </div>
            <StatusBadge
              status={comparison.integrity.left && comparison.integrity.right ? 'success' : 'error'}
            >
              {comparison.integrity.left && comparison.integrity.right
                ? 'Integrity verified'
                : 'Integrity issue'}
            </StatusBadge>
          </div>
          <div className="diagnostic-preview-grid">
            <div>
              <span>Event delta</span>
              <strong>
                {comparison.eventDelta > 0 ? '+' : ''}
                {comparison.eventDelta}
              </strong>
            </div>
            <div>
              <span>Breadcrumb delta</span>
              <strong>
                {comparison.breadcrumbDelta > 0 ? '+' : ''}
                {comparison.breadcrumbDelta}
              </strong>
            </div>
            <div>
              <span>New failures</span>
              <strong>{comparison.newFailureNames.length}</strong>
            </div>
            <div>
              <span>Resolved failures</span>
              <strong>{comparison.resolvedFailureNames.length}</strong>
            </div>
          </div>
          <div className="diagnostic-two-column">
            <div>
              <h3>Category changes</h3>
              <ul className="diagnostic-plain-list compact">
                {comparison.categoryDeltas.map((item) => (
                  <li key={item.category}>
                    <span>{item.category}</span>
                    <strong>
                      {item.left} → {item.right} ({item.delta > 0 ? '+' : ''}
                      {item.delta})
                    </strong>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3>Evidence changes</h3>
              <p>
                <strong>New:</strong> {comparison.newFailureNames.join(', ') || 'none'}
              </p>
              <p>
                <strong>Resolved:</strong> {comparison.resolvedFailureNames.join(', ') || 'none'}
              </p>
              <p>
                <strong>Environment fields:</strong> {comparison.environmentChanges.length}
              </p>
              <p>
                <strong>Guide results:</strong> {comparison.troubleshootingChanges.length}
              </p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
