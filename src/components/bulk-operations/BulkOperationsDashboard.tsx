import { useRef, type ChangeEvent, type CSSProperties } from 'react';
import { Download, Pause, Play, RefreshCw, Upload, X } from 'lucide-react';
import useBulkOperationsPlanner from '../../hooks/useBulkOperationsPlanner';
import { useStore } from '../../lib/store';
import BulkImportPanel from './BulkImportPanel';
import BulkPreviewPanel from './BulkPreviewPanel';
import BulkPlanPanel from './BulkPlanPanel';
import BulkExecutePanel from './BulkExecutePanel';
import BulkReceiptsPanel from './BulkReceiptsPanel';
import BulkSettingsPanel from './BulkSettingsPanel';
import BulkDependencyGraphPanel from './BulkDependencyGraphPanel';
import BulkTimelinePanel from './BulkTimelinePanel';

const panel: CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  padding: 18,
};

const button: CSSProperties = {
  minHeight: 36,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 7,
  padding: '7px 12px',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--bg-elevated)',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
};

const primaryButton: CSSProperties = {
  ...button,
  background: 'var(--accent)',
  color: 'var(--bg-base)',
  borderColor: 'transparent',
};

type TabId = 'import' | 'preview' | 'plan' | 'execute' | 'receipts' | 'settings' | 'graph' | 'timeline';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'import', label: 'import' },
  { id: 'preview', label: 'preview' },
  { id: 'plan', label: 'plan' },
  { id: 'execute', label: 'execute' },
  { id: 'receipts', label: 'receipts' },
  { id: 'graph', label: 'graph' },
  { id: 'timeline', label: 'timeline' },
  { id: 'settings', label: 'settings' },
];

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ ...panel, padding: 14 }}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600 }}>{value}</div>
    </div>
  );
}

export default function BulkOperationsDashboard() {
  const connectedAddress = useStore((state) => state.connectedAddress);
  const network = useStore((state) => state.network);
  const planner = useBulkOperationsPlanner(connectedAddress, network);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onImportFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void planner.importEnvelopeFile(file);
    event.target.value = '';
  };

  return (
    <section aria-labelledby="bulk-ops-title" style={{ display: 'grid', gap: 16 }}>
      <header style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 id="bulk-ops-title" style={{ margin: 0, fontSize: 24 }}>
            Bulk operations planner
          </h1>
          <p style={{ margin: '6px 0 0', color: 'var(--text-muted)', maxWidth: 760 }}>
            Import CSV manifests, plan dependency-aware transaction packs, and run resumable simulated bulk submissions with checkpointed receipts.
          </p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button type="button" style={button} onClick={() => void planner.loadDemoManifest()}>
            <RefreshCw size={16} aria-hidden="true" />
            Load demo
          </button>
          <button type="button" style={button} onClick={() => fileInputRef.current?.click()}>
            <Upload size={16} aria-hidden="true" />
            Import JSON
          </button>
          <button type="button" style={button} onClick={() => void planner.exportManifest()} disabled={!planner.manifest}>
            <Download size={16} aria-hidden="true" />
            Export manifest
          </button>
          <input ref={fileInputRef} type="file" accept="application/json,.json" hidden onChange={onImportFile} />
        </div>
      </header>

      {!connectedAddress && (
        <div role="status" style={{ ...panel, borderColor: 'var(--amber)', color: 'var(--amber)' }}>
          Connect an account to import CSV manifests with your source account prefilled. Demo mode still works offline.
        </div>
      )}

      {planner.message && (
        <div role="status" style={{ ...panel, padding: 12, color: 'var(--cyan)' }}>
          {planner.message}
        </div>
      )}

      {planner.error && (
        <div role="alert" style={{ ...panel, borderColor: 'var(--red)', color: 'var(--red)', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ flex: 1 }}>{planner.error.message}</span>
          <button type="button" aria-label="Dismiss error" style={button} onClick={planner.resetError}>
            <X size={16} />
          </button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        <Stat label="Operations" value={planner.stats?.operations ?? 0} />
        <Stat label="Packs" value={planner.stats?.packs ?? 0} />
        <Stat label="Est. fee (stroops)" value={planner.stats?.fee ?? 0} />
        <Stat label="Progress" value={`${planner.stats?.progress ?? 0}%`} />
      </div>

      <nav aria-label="Bulk planner sections" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            aria-current={planner.activeTab === tab.id ? 'page' : undefined}
            style={{
              ...button,
              ...(planner.activeTab === tab.id ? primaryButton : {}),
            }}
            onClick={() => planner.setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {planner.activeTab === 'import' && (
        <BulkImportPanel
          csvText={planner.csvText}
          onCsvTextChange={planner.setCsvText}
          csvOptions={planner.csvOptions}
          onCsvOptionsChange={planner.setCsvOptions}
          onLoadDemoCsv={planner.loadDemoCsv}
          onPreviewImport={planner.previewImport}
          onCommitImport={() => void planner.commitImport()}
          loading={planner.loading}
        />
      )}

      {planner.activeTab === 'preview' && (
        <BulkPreviewPanel preview={planner.importPreview} manifest={planner.manifest} validation={planner.validation} />
      )}

      {planner.activeTab === 'plan' && (
        <BulkPlanPanel
          manifest={planner.manifest}
          plan={planner.plan}
          validation={planner.validation}
          onPlan={() => void planner.planCurrentManifest()}
          onDryRun={planner.dryRunCurrentPlan}
          onSave={() => void planner.saveCurrentManifest()}
          loading={planner.loading}
        />
      )}

      {planner.activeTab === 'execute' && (
        <BulkExecutePanel
          plan={planner.plan}
          checkpoint={planner.checkpoint}
          progressEvents={planner.progressEvents}
          executing={planner.executing}
          onStart={() => void planner.startExecution()}
          onPause={planner.pauseExecution}
          onResume={planner.resumeExecution}
          onCancel={planner.cancelExecution}
        />
      )}

      {planner.activeTab === 'receipts' && (
        <BulkReceiptsPanel
          receipt={planner.receipt}
          reconciliation={planner.reconciliation}
          checkpoint={planner.checkpoint}
          onExportRun={() => void planner.exportRun()}
          onExportReconciliation={planner.exportReconciliation}
        />
      )}

      {planner.activeTab === 'graph' && <BulkDependencyGraphPanel manifest={planner.manifest} plan={planner.plan} />}

      {planner.activeTab === 'timeline' && (
        <BulkTimelinePanel manifest={planner.manifest} plan={planner.plan} progressEvents={planner.progressEvents} />
      )}

      {planner.activeTab === 'settings' && (
        <BulkSettingsPanel preferences={planner.preferences} onChange={planner.updatePreferences} />
      )}

      <footer style={{ ...panel, fontSize: 13, color: 'var(--text-muted)' }}>
        Simulated execution mode is enabled by default. Bulk submissions use deterministic offline simulation — not live Horizon submission.
        {planner.preferences.simulatedMode ? ' Network calls are not required for planning or execution.' : ''}
      </footer>
    </section>
  );
}
