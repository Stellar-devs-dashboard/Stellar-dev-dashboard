import { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Download,
  FileSearch,
  GitCompareArrows,
  RefreshCw,
  RotateCcw,
  Settings2,
  ShieldCheck,
  WifiOff,
  X,
} from 'lucide-react';
import { useStore } from '../../lib/store';
import useCompatibility from '../../hooks/useCompatibility';
import { createCompatibilityExport, downloadCompatibilityExport } from '../../lib/compatibility';
import CompatibilityStatusPanel from './CompatibilityStatusPanel';
import EndpointComparison from './EndpointComparison';
import UpgradeAudit from './UpgradeAudit';
import ChangeHistory from './ChangeHistory';
import OverrideManager from './OverrideManager';
import { buttonStyle, panelStyle, STATUS_COLOR, StatusBadge } from './styles';
import './compatibility.css';

type View = 'status' | 'compare' | 'audit' | 'history' | 'overrides';

const VIEWS: Array<{ id: View; label: string; icon: typeof ShieldCheck }> = [
  { id: 'status', label: 'Status', icon: ShieldCheck },
  { id: 'compare', label: 'Compare', icon: GitCompareArrows },
  { id: 'audit', label: 'Upgrade audit', icon: FileSearch },
  { id: 'history', label: 'Change history', icon: BookOpen },
  { id: 'overrides', label: 'Overrides', icon: Settings2 },
];

function LoadingState() {
  return (
    <div className="compat-stack" aria-busy="true" aria-live="polite">
      <section style={panelStyle} className="compat-loading-card">
        <span className="spinner" aria-hidden="true" />
        <div>
          <h2>Probing protocol compatibility</h2>
          <p>Correlating Horizon identity, RPC methods, XDR support, retention, and limits…</p>
        </div>
      </section>
      <div className="compat-stat-grid" aria-hidden="true">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="compat-skeleton" />
        ))}
      </div>
      <div className="compat-skeleton large" aria-hidden="true" />
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section
      style={{ ...panelStyle, borderColor: 'var(--red)' }}
      className="compat-empty"
      role="alert"
    >
      <WifiOff size={34} color="var(--red)" aria-hidden="true" />
      <h2>Compatibility evidence unavailable</h2>
      <p>{message}</p>
      <button type="button" style={buttonStyle} onClick={onRetry}>
        <RotateCcw size={15} aria-hidden="true" /> Retry probe
      </button>
    </section>
  );
}

export default function CompatibilityDashboard() {
  const { network } = useStore();
  const [view, setView] = useState<View>('status');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const compatibility = useCompatibility(network);
  const {
    assessment,
    probe,
    comparison,
    comparisonProbes,
    audit,
    artifacts,
    overrides,
    refreshing,
    error,
    storageWarning,
    viewState,
  } = compatibility;

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [view]);

  const exportReport = () => {
    if (!assessment) return;
    downloadCompatibilityExport(createCompatibilityExport(assessment, comparison, audit));
  };

  return (
    <div className="compat-dashboard">
      <header className="compat-page-header">
        <div>
          <div className="compat-kicker">
            <ShieldCheck size={14} aria-hidden="true" /> Network assurance
          </div>
          <h1 ref={headingRef} tabIndex={-1}>
            Protocol & Soroban RPC Compatibility
          </h1>
          <p>
            Evidence-driven feature gates, endpoint drift detection, and protocol upgrade readiness
            for {network}.
          </p>
        </div>
        <div className="compat-header-actions">
          {assessment && <StatusBadge status={assessment.status} />}
          <button
            type="button"
            style={buttonStyle}
            onClick={() => void compatibility.refresh(true)}
            disabled={refreshing}
          >
            <RefreshCw size={15} className={refreshing ? 'compat-spin' : ''} aria-hidden="true" />
            {refreshing ? 'Refreshing…' : 'Refresh evidence'}
          </button>
          <button type="button" style={buttonStyle} onClick={exportReport} disabled={!assessment}>
            <Download size={15} aria-hidden="true" /> Export JSON
          </button>
        </div>
      </header>

      <nav className="compat-view-nav" aria-label="Compatibility views">
        {VIEWS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              aria-current={view === item.id ? 'page' : undefined}
              onClick={() => setView(item.id)}
            >
              <Icon size={15} aria-hidden="true" /> {item.label}
            </button>
          );
        })}
      </nav>

      {assessment && assessment.status === 'offline' && (
        <div className="compat-mode-banner offline" role="status">
          <WifiOff size={18} aria-hidden="true" />
          <div>
            <strong>Offline mode</strong>
            <p>
              {assessment.summary} {assessment.freshness.label}.
            </p>
          </div>
        </div>
      )}
      {assessment && !['compatible', 'offline'].includes(assessment.status) && (
        <div
          className="compat-mode-banner"
          role="status"
          style={{ borderColor: STATUS_COLOR[assessment.status] }}
        >
          <ShieldCheck size={18} color={STATUS_COLOR[assessment.status]} aria-hidden="true" />
          <div>
            <strong>
              {assessment.status === 'degraded' ? 'Degraded mode' : 'Feature gates active'}
            </strong>
            <p>{assessment.summary}</p>
          </div>
        </div>
      )}
      {(error || storageWarning) && assessment && (
        <div className="compat-inline-alert" role="alert">
          <span>{error?.message ?? storageWarning}</span>
          {error && (
            <button
              type="button"
              onClick={compatibility.clearError}
              aria-label="Dismiss compatibility error"
            >
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      {viewState === 'loading' && <LoadingState />}
      {viewState === 'error' && (
        <ErrorState
          message={error?.message ?? 'No compatibility evidence is available.'}
          onRetry={() => void compatibility.refresh(true)}
        />
      )}

      {assessment && probe && (
        <>
          {view === 'status' && <CompatibilityStatusPanel assessment={assessment} probe={probe} />}
          {view === 'compare' && (
            <EndpointComparison
              primary={probe}
              probes={comparisonProbes.length ? comparisonProbes : [probe]}
              comparison={comparison}
              refreshing={refreshing}
              onAdd={compatibility.addComparisonEndpoint}
              onRemove={compatibility.removeComparisonEndpoint}
            />
          )}
          {view === 'audit' && (
            <UpgradeAudit
              assessment={assessment}
              audit={audit}
              artifacts={artifacts}
              onArtifacts={compatibility.replaceArtifacts}
              onRun={compatibility.runAudit}
            />
          )}
          {view === 'history' && <ChangeHistory />}
          {view === 'overrides' && (
            <OverrideManager
              assessment={assessment}
              overrides={overrides}
              onAdd={compatibility.addOverride}
              onRemove={compatibility.removeOverride}
            />
          )}
        </>
      )}

      {!assessment && !error && viewState === 'empty' && (
        <section style={panelStyle} className="compat-empty">
          <ShieldCheck size={32} aria-hidden="true" />
          <h2>No compatibility observation yet</h2>
          <p>Run a probe to establish protocol, RPC, XDR, and freshness evidence.</p>
          <button
            type="button"
            style={buttonStyle}
            onClick={() => void compatibility.refresh(true)}
          >
            Probe selected network
          </button>
        </section>
      )}
    </div>
  );
}
