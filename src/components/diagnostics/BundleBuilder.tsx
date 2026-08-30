import { Database, Download, Eye, FileCheck2, Save } from 'lucide-react';
import type {
  BundleInclusion,
  DiagnosticBundlePreview,
  DiagnosticCategory,
  DiagnosticRepositoryState,
} from '../../types/diagnostics';
import { buttonStyle, panelStyle, primaryButtonStyle, StatusBadge } from './styles';

const CATEGORIES: DiagnosticCategory[] = [
  'request',
  'stream',
  'wallet',
  'signing',
  'storage',
  'rendering',
  'performance',
  'service-worker',
  'navigation',
  'runtime',
];

interface BundleBuilderProps {
  inclusion: BundleInclusion;
  preview: DiagnosticBundlePreview | null;
  repository: DiagnosticRepositoryState;
  onUpdate: (_patch: Partial<BundleInclusion>) => void;
  onToggleCategory: (_category: DiagnosticCategory) => void;
  onPreview: () => Promise<DiagnosticBundlePreview | null>;
  onSave: () => boolean;
  onExport: () => boolean;
  onRemoveSaved: (_id: string) => void;
}

function Check({
  checked,
  label,
  hint,
  onChange,
}: {
  checked: boolean;
  label: string;
  hint?: string;
  onChange: (_checked: boolean) => void;
}) {
  return (
    <label className="diagnostic-check-control">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>
        <strong>{label}</strong>
        {hint && <small>{hint}</small>}
      </span>
    </label>
  );
}

function formatBytes(bytes: number): string {
  return bytes < 1_024 ? `${bytes} B` : `${(bytes / 1_024).toFixed(1)} KiB`;
}

export default function BundleBuilder({
  inclusion,
  preview,
  repository,
  onUpdate,
  onToggleCategory,
  onPreview,
  onSave,
  onExport,
  onRemoveSaved,
}: BundleBuilderProps) {
  return (
    <div className="diagnostic-stack">
      <section style={panelStyle} aria-labelledby="bundle-heading">
        <div className="diagnostic-section-heading">
          <div>
            <h2 id="bundle-heading">Bundle inclusion controls</h2>
            <p>
              Choose each section and field before previewing. Download is a separate explicit
              action.
            </p>
          </div>
          <Eye size={23} color="var(--cyan)" aria-hidden="true" />
        </div>
        <div className="diagnostic-control-grid">
          <Check
            checked={inclusion.events}
            label="Events"
            hint="Bounded to 1,000"
            onChange={(events) => onUpdate({ events })}
          />
          <Check
            checked={inclusion.eventDetails}
            label="Event details"
            hint="Already redacted"
            onChange={(eventDetails) => onUpdate({ eventDetails })}
          />
          <Check
            checked={inclusion.breadcrumbs}
            label="Breadcrumbs"
            hint="Reproduction actions"
            onChange={(breadcrumbs) => onUpdate({ breadcrumbs })}
          />
          <Check
            checked={inclusion.breadcrumbDetails}
            label="Breadcrumb details"
            hint="No raw input"
            onChange={(breadcrumbDetails) => onUpdate({ breadcrumbDetails })}
          />
          <Check
            checked={inclusion.environment}
            label="Environment"
            hint="Coarse browser metadata"
            onChange={(environment) => onUpdate({ environment })}
          />
          <Check
            checked={inclusion.environmentLocale}
            label="Language"
            hint="Excluded by default"
            onChange={(environmentLocale) => onUpdate({ environmentLocale })}
          />
          <Check
            checked={inclusion.environmentTimezone}
            label="Timezone"
            hint="Excluded by default"
            onChange={(environmentTimezone) => onUpdate({ environmentTimezone })}
          />
          <Check
            checked={inclusion.environmentViewport}
            label="Viewport"
            hint="Dimensions only"
            onChange={(environmentViewport) => onUpdate({ environmentViewport })}
          />
          <Check
            checked={inclusion.featureFlags}
            label="Feature flags"
            onChange={(featureFlags) => onUpdate({ featureFlags })}
          />
          <Check
            checked={inclusion.endpointHealth}
            label="Endpoint health"
            hint="No endpoint URLs"
            onChange={(endpointHealth) => onUpdate({ endpointHealth })}
          />
          <Check
            checked={inclusion.serviceWorker}
            label="Service worker"
            hint="Cache names normalized"
            onChange={(serviceWorker) => onUpdate({ serviceWorker })}
          />
          <Check
            checked={inclusion.troubleshooting}
            label="Troubleshooting results"
            onChange={(troubleshooting) => onUpdate({ troubleshooting })}
          />
        </div>
        <fieldset className="diagnostic-category-fieldset" disabled={!inclusion.events}>
          <legend>Event categories</legend>
          <div>
            {CATEGORIES.map((category) => (
              <label key={category}>
                <input
                  type="checkbox"
                  checked={inclusion.eventCategories.includes(category)}
                  onChange={() => onToggleCategory(category)}
                />
                {category}
              </label>
            ))}
          </div>
        </fieldset>
        <button type="button" style={primaryButtonStyle} onClick={() => void onPreview()}>
          <FileCheck2 size={15} /> Generate local preview
        </button>
      </section>

      {!preview ? (
        <section
          style={panelStyle}
          className="diagnostic-empty"
          aria-labelledby="preview-empty-heading"
        >
          <Eye size={28} aria-hidden="true" />
          <h2 id="preview-empty-heading">Preview before download</h2>
          <p>
            No bundle exists yet. Changing any inclusion control invalidates the previous preview.
          </p>
        </section>
      ) : (
        <section style={panelStyle} aria-labelledby="preview-heading" aria-live="polite">
          <div className="diagnostic-section-heading">
            <div>
              <h2 id="preview-heading">Diagnostic bundle preview</h2>
              <p>
                Schema v{preview.bundle.schemaVersion} · expires{' '}
                {new Date(preview.expiresAt).toLocaleString()}
              </p>
            </div>
            <StatusBadge status="success">Integrity ready</StatusBadge>
          </div>
          <div className="diagnostic-preview-grid">
            <div>
              <span>Events</span>
              <strong>{preview.eventCount}</strong>
            </div>
            <div>
              <span>Breadcrumbs</span>
              <strong>{preview.breadcrumbCount}</strong>
            </div>
            <div>
              <span>Redactions</span>
              <strong>{preview.redactionCount}</strong>
            </div>
            <div>
              <span>Bundle size</span>
              <strong>{formatBytes(preview.byteLength)}</strong>
            </div>
          </div>
          <dl className="diagnostic-manifest">
            <div>
              <dt>Integrity</dt>
              <dd>SHA-256</dd>
            </div>
            <div>
              <dt>Digest</dt>
              <dd>
                <code>{preview.bundle.manifest.digest.slice(0, 20)}…</code>
              </dd>
            </div>
            <div>
              <dt>Omitted</dt>
              <dd>{preview.omittedFields.join(', ') || 'none'}</dd>
            </div>
            <div>
              <dt>Transport</dt>
              <dd>none</dd>
            </div>
          </dl>
          <div className="diagnostic-actions">
            <button type="button" style={buttonStyle} onClick={onSave}>
              <Save size={14} /> Save locally
            </button>
            <button type="button" style={primaryButtonStyle} onClick={onExport}>
              <Download size={14} /> Download JSON
            </button>
          </div>
        </section>
      )}

      <section style={panelStyle} aria-labelledby="saved-heading">
        <div className="diagnostic-section-heading">
          <div>
            <h2 id="saved-heading">Saved local bundles</h2>
            <p>At most five unexpired bundles are retained.</p>
          </div>
          <Database size={21} aria-hidden="true" />
        </div>
        {repository.bundles.length === 0 ? (
          <p>No bundles are stored.</p>
        ) : (
          <ul className="diagnostic-plain-list">
            {repository.bundles.map((bundle) => (
              <li key={bundle.id}>
                <div>
                  <strong>{new Date(bundle.createdAt).toLocaleString()}</strong>
                  <small>
                    {bundle.manifest.eventCount} events · expires{' '}
                    {new Date(bundle.manifest.expiresAt).toLocaleDateString()}
                  </small>
                </div>
                <button type="button" style={buttonStyle} onClick={() => onRemoveSaved(bundle.id)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
