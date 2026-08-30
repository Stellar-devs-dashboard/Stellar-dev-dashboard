import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  FileArchive,
  GitCompareArrows,
  LifeBuoy,
  LockKeyhole,
  RotateCcw,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useStore } from '../../lib/store';
import useDiagnostics from '../../hooks/useDiagnostics';
import BundleBuilder from './BundleBuilder';
import BundleComparison from './BundleComparison';
import DiagnosticsOverview from './DiagnosticsOverview';
import GuidedTroubleshooter from './GuidedTroubleshooter';
import PrivacyControls from './PrivacyControls';
import { buttonStyle, panelStyle, primaryButtonStyle, StatusBadge } from './styles';
import './diagnostics.css';

type DiagnosticsTab = 'overview' | 'troubleshoot' | 'bundle' | 'compare' | 'privacy';

const DIAGNOSTIC_FEATURE_FLAGS = {
  'offline-support': true,
  'service-worker': typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
  'wallet-connect': true,
  'soroban-tools': true,
};

const TABS: Array<{ id: DiagnosticsTab; label: string; icon: typeof Activity }> = [
  { id: 'overview', label: 'Status', icon: Activity },
  { id: 'troubleshoot', label: 'Guided checks', icon: LifeBuoy },
  { id: 'bundle', label: 'Bundle preview', icon: FileArchive },
  { id: 'compare', label: 'Compare', icon: GitCompareArrows },
  { id: 'privacy', label: 'Privacy', icon: LockKeyhole },
];

export default function DiagnosticsDashboard() {
  const network = useStore((state) => state.network);
  const diagnostics = useDiagnostics(network, {
    featureFlags: DIAGNOSTIC_FEATURE_FLAGS,
  });
  const [tab, setTab] = useState<DiagnosticsTab>('overview');
  const [confirmClear, setConfirmClear] = useState(false);
  const cancelClearRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (confirmClear) cancelClearRef.current?.focus();
  }, [confirmClear]);

  const content = () => {
    switch (tab) {
      case 'overview':
        return (
          <DiagnosticsOverview
            viewState={diagnostics.viewState}
            snapshot={diagnostics.snapshot}
            repository={diagnostics.repositoryState}
            environment={diagnostics.environment}
            endpointHealth={diagnostics.endpointHealth}
            onCapture={diagnostics.setCaptureEnabled}
            onRequestClear={() => setConfirmClear(true)}
          />
        );
      case 'troubleshoot':
        return (
          <GuidedTroubleshooter
            runs={diagnostics.runs}
            runningFlow={diagnostics.runningFlow}
            onRun={diagnostics.runFlow}
            onCancel={diagnostics.cancelFlow}
          />
        );
      case 'bundle':
        return (
          <BundleBuilder
            inclusion={diagnostics.inclusion}
            preview={diagnostics.preview}
            repository={diagnostics.repositoryState}
            onUpdate={diagnostics.updateInclusion}
            onToggleCategory={diagnostics.toggleCategory}
            onPreview={diagnostics.createPreview}
            onSave={diagnostics.savePreview}
            onExport={diagnostics.exportPreview}
            onRemoveSaved={diagnostics.removeSavedBundle}
          />
        );
      case 'compare':
        return (
          <BundleComparison
            preview={diagnostics.preview}
            imported={diagnostics.importedBundle}
            comparison={diagnostics.comparison}
            onImport={diagnostics.importBundle}
            onCompare={diagnostics.compareWithImported}
          />
        );
      case 'privacy':
        return (
          <PrivacyControls
            rules={diagnostics.customRules}
            onAdd={diagnostics.addRule}
            onRemove={diagnostics.removeRule}
          />
        );
    }
  };

  if (diagnostics.viewState === 'loading') {
    return (
      <div className="diagnostics-root" aria-busy="true" aria-live="polite">
        <div className="diagnostic-loading-hero" style={panelStyle}>
          <span className="diagnostic-spinner" aria-hidden="true" />
          <div>
            <h1>Preparing private diagnostics</h1>
            <p>Collecting coarse local environment and worker state.</p>
          </div>
        </div>
        <div className="diagnostic-skeleton-grid" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
      </div>
    );
  }

  if (diagnostics.viewState === 'error' && diagnostics.error) {
    return (
      <div className="diagnostics-root">
        <section style={panelStyle} className="diagnostic-error-state" role="alert">
          <ShieldCheck size={30} aria-hidden="true" />
          <h1>Diagnostics initialization needs attention</h1>
          <p>{diagnostics.error.problem.message}</p>
          <button
            type="button"
            style={primaryButtonStyle}
            onClick={() => void diagnostics.initialize()}
          >
            <RotateCcw size={14} /> Retry initialization
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="diagnostics-root">
      <header className="diagnostic-hero" style={panelStyle}>
        <div>
          <div className="diagnostic-eyebrow">
            LOCAL INCIDENT WORKSPACE · {network.toUpperCase()}
          </div>
          <h1>Privacy-safe diagnostics</h1>
          <p>
            Capture bounded evidence, run non-destructive checks, review every included field, and
            download a verifiable bundle. Nothing is transmitted.
          </p>
        </div>
        <div className="diagnostic-hero-status">
          <StatusBadge status={diagnostics.viewState} />
          <span>
            <LockKeyhole size={14} /> Local only
          </span>
          <span>Schema v1</span>
        </div>
      </header>

      {diagnostics.error && (
        <div className="diagnostic-callout error" role="alert">
          <strong>{diagnostics.error.operation} failed</strong>
          <span>{diagnostics.error.problem.message}</span>
          {diagnostics.error.problem.retryable && (
            <button type="button" style={buttonStyle} onClick={() => void diagnostics.initialize()}>
              Retry
            </button>
          )}
        </div>
      )}

      <nav className="diagnostic-tabs" aria-label="Diagnostic workspace sections">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            aria-current={tab === id ? 'page' : undefined}
            className={tab === id ? 'active' : ''}
            onClick={() => setTab(id)}
          >
            <Icon size={15} aria-hidden="true" /> {label}
          </button>
        ))}
      </nav>

      <div
        id={`diagnostics-${tab}`}
        role="region"
        aria-label={`${TABS.find((item) => item.id === tab)?.label} diagnostics`}
        tabIndex={-1}
      >
        {content()}
      </div>

      {confirmClear && (
        <div
          className="diagnostic-dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setConfirmClear(false);
          }}
        >
          <section
            className="diagnostic-dialog"
            style={panelStyle}
            role="dialog"
            aria-modal="true"
            aria-labelledby="clear-dialog-heading"
            aria-describedby="clear-dialog-description"
            onKeyDown={(event) => {
              if (event.key === 'Escape') setConfirmClear(false);
            }}
          >
            <button
              className="diagnostic-dialog-close"
              type="button"
              onClick={() => setConfirmClear(false)}
              aria-label="Close clear-data dialog"
            >
              <X size={18} />
            </button>
            <h2 id="clear-dialog-heading">Clear local diagnostic data?</h2>
            <p id="clear-dialog-description">
              This removes the in-memory capture, saved bundles, previews, comparisons, and
              troubleshooting results. It does not change dashboard settings or network data.
            </p>
            <div className="diagnostic-actions">
              <button
                ref={cancelClearRef}
                type="button"
                style={buttonStyle}
                onClick={() => setConfirmClear(false)}
              >
                Keep data
              </button>
              <button
                type="button"
                style={{
                  ...primaryButtonStyle,
                  background: 'var(--diagnostic-danger)',
                  borderColor: 'var(--diagnostic-danger)',
                  color: '#fff',
                }}
                onClick={() => {
                  diagnostics.clearAll();
                  setConfirmClear(false);
                }}
              >
                Clear local data
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
