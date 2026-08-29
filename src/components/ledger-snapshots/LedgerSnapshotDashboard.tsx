import { useRef, type ChangeEvent, type CSSProperties } from 'react';
import {
  AlertTriangle,
  Camera,
  Download,
  FileJson,
  GitCompare,
  Play,
  RefreshCw,
  Shield,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import useLedgerSnapshots from '../../hooks/useLedgerSnapshots';
import { useStore } from '../../lib/store';
import { summarizeComparison } from '../../lib/ledgerSnapshots/diffEngine';
import SnapshotLibraryPanel from './SnapshotLibraryPanel';
import SnapshotInspectPanel from './SnapshotInspectPanel';
import SnapshotDiffPanel from './SnapshotDiffPanel';
import SnapshotReplayPanel from './SnapshotReplayPanel';
import SnapshotCapturePanel from './SnapshotCapturePanel';
import SnapshotDiagnosticsPanel from './SnapshotDiagnosticsPanel';

type View = ReturnType<typeof useLedgerSnapshots>['view'];

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
  fontSize: 11,
};

const tabs: Array<{ id: View; label: string }> = [
  { id: 'library', label: 'Library' },
  { id: 'capture', label: 'Capture' },
  { id: 'inspect', label: 'Inspect' },
  { id: 'diff', label: 'Diff' },
  { id: 'replay', label: 'Replay' },
  { id: 'diagnostics', label: 'Diagnostics' },
];

export default function LedgerSnapshotDashboard() {
  const { connectedAddress, network } = useStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const snap = useLedgerSnapshots(connectedAddress, network);

  const handleImport = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void snap.importSnapshot(file);
    event.target.value = '';
  };

  if (!connectedAddress) {
    return (
      <div style={panel} role="region" aria-labelledby="ledger-snapshots-heading">
        <h2 id="ledger-snapshots-heading" style={{ margin: 0, fontSize: 18 }}>
          Ledger snapshots
        </h2>
        <p style={{ color: 'var(--text-muted)', marginTop: 12 }}>
          Connect an account to capture portable ledger snapshots and run deterministic offline replay.
        </p>
        <button type="button" style={button} onClick={() => void snap.loadDemoSnapshot()}>
          <FileJson size={14} aria-hidden />
          Explore offline demo snapshot
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 16 }} role="region" aria-labelledby="ledger-snapshots-heading">
      <header style={{ ...panel, display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 id="ledger-snapshots-heading" style={{ margin: 0, fontSize: 18 }}>
              Portable ledger snapshots
            </h2>
            <p style={{ margin: '6px 0 0', color: 'var(--text-muted)', fontSize: 12 }}>
              Diagnostic simulation replay against immutable snapshots — not consensus-equivalent execution.
            </p>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button type="button" style={button} onClick={() => void snap.refreshLibrary()} disabled={snap.refreshing}>
              <RefreshCw size={14} aria-hidden />
              {snap.refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
            <button type="button" style={button} onClick={() => fileInputRef.current?.click()}>
              <Upload size={14} aria-hidden />
              Import
            </button>
            <input ref={fileInputRef} type="file" accept=".json,application/json" hidden onChange={handleImport} aria-hidden />
          </div>
        </div>

        {snap.offlineMode && (
          <div
            role="status"
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              padding: '10px 12px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(255, 193, 7, 0.08)',
              border: '1px solid rgba(255, 193, 7, 0.25)',
              fontSize: 12,
            }}
          >
            <AlertTriangle size={14} aria-hidden />
            <span>
              Showing a <strong>deterministic demonstration snapshot</strong> because live capture is unavailable or the library is empty.
            </span>
          </div>
        )}

        {snap.error && (
          <div role="alert" style={{ color: 'var(--red)', fontSize: 12 }}>
            {snap.error.message}
            {snap.error.retryable && (
              <button type="button" style={{ ...button, marginLeft: 8 }} onClick={() => void snap.refreshLibrary()}>
                Retry
              </button>
            )}
          </div>
        )}

        {snap.message && (
          <div role="status" style={{ color: 'var(--cyan)', fontSize: 12 }}>
            {snap.message}
          </div>
        )}

        <nav aria-label="Snapshot views" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              aria-current={snap.view === tab.id ? 'page' : undefined}
              style={{
                ...button,
                background: snap.view === tab.id ? 'var(--accent-muted)' : button.background,
                color: snap.view === tab.id ? 'var(--accent)' : button.color,
              }}
              onClick={() => snap.setView(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      {snap.loading ? (
        <div style={panel} aria-busy="true" aria-live="polite">
          Loading snapshot library…
        </div>
      ) : (
        <>
          {snap.view === 'library' && (
            <SnapshotLibraryPanel
              records={snap.records}
              selectedId={snap.selectedId}
              stats={snap.stats}
              onSelect={snap.setSelectedId}
              onPin={snap.togglePin}
              onDelete={snap.deleteSelected}
              onExport={() => void snap.exportSelected(false)}
              onExportSanitized={() => void snap.exportSelected(true)}
              onExportBundle={() => void snap.exportBundle()}
              onPrune={() => void snap.pruneLibrary()}
            />
          )}

          {snap.view === 'capture' && (
            <SnapshotCapturePanel
              capturing={snap.capturing}
              progress={snap.captureProgress}
              onCapture={(label, tags) => void snap.captureSnapshot(label, tags)}
              onCancel={snap.cancelCapture}
              onLoadDemo={() => void snap.loadDemoSnapshot()}
            />
          )}

          {snap.view === 'inspect' && snap.selectedRecord && (
            <SnapshotInspectPanel record={snap.selectedRecord} inspection={snap.inspection} />
          )}

          {snap.view === 'diff' && (
            <SnapshotDiffPanel
              records={snap.records}
              selectedId={snap.selectedId}
              compareId={snap.compareId}
              comparison={snap.comparison}
              diffs={snap.diffs}
              onSelect={snap.setSelectedId}
              onCompareSelect={snap.setCompareId}
              onRunComparison={() => void snap.runComparison()}
              summary={snap.comparison ? summarizeComparison(snap.comparison) : null}
            />
          )}

          {snap.view === 'replay' && (
            <SnapshotReplayPanel
              record={snap.selectedRecord}
              replaying={snap.replaying}
              result={snap.replayResult}
              strictMode={snap.preferences.strictReplay}
              onRun={() => void snap.runReplay()}
              onCancel={snap.cancelReplay}
              onToggleStrict={(value) => snap.setPreferences({ strictReplay: value })}
            />
          )}

          {snap.view === 'diagnostics' && (
            <SnapshotDiagnosticsPanel
              record={snap.selectedRecord}
              replayResult={snap.replayResult}
              preferences={snap.preferences}
              onPreferencesChange={snap.setPreferences}
            />
          )}
        </>
      )}

      {snap.selectedRecord && snap.view !== 'library' && (
        <footer style={{ ...panel, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button type="button" style={button} onClick={() => snap.setView('capture')}>
            <Camera size={14} aria-hidden />
            Capture
          </button>
          <button type="button" style={button} onClick={() => void snap.runReplay()} disabled={snap.replaying}>
            <Play size={14} aria-hidden />
            Replay
          </button>
          <button type="button" style={button} onClick={() => snap.setView('diff')}>
            <GitCompare size={14} aria-hidden />
            Compare
          </button>
          <button type="button" style={button} onClick={() => void snap.exportSelected(true)}>
            <Shield size={14} aria-hidden />
            Export sanitized
          </button>
          <button type="button" style={button} onClick={() => void snap.exportSelected(false)}>
            <Download size={14} aria-hidden />
            Export
          </button>
          <button type="button" style={{ ...button, color: 'var(--red)' }} onClick={() => void snap.deleteSelected()}>
            <Trash2 size={14} aria-hidden />
            Delete
          </button>
          {snap.capturing && (
            <button type="button" style={button} onClick={snap.cancelCapture}>
              <X size={14} aria-hidden />
              Cancel capture
            </button>
          )}
        </footer>
      )}
    </div>
  );
}
