import { useCallback, useState } from 'react';
import { useStore } from '../../lib/store';
import useResourceProfilingLab from '../../hooks/useResourceProfilingLab';
import CapturePanel from './CapturePanel';
import BaselineManager from './BaselineManager';
import ComparisonView from './ComparisonView';
import FlameResourceView from './FlameResourceView';
import MetricTimeline from './MetricTimeline';
import HotPathPanel from './HotPathPanel';
import BudgetEditor from './BudgetEditor';
import ExportPanel from './ExportPanel';
import { buttonStyle, cardStyle, mutedStyle, pageStyle, primaryButtonStyle } from './styles';

type View = 'capture' | 'baselines' | 'compare' | 'flame' | 'timeline' | 'hotpaths' | 'budgets' | 'export';

const VIEWS: View[] = ['capture', 'baselines', 'compare', 'flame', 'timeline', 'hotpaths', 'budgets', 'export'];
const VIEW_LABEL: Record<View, string> = {
  capture: 'Capture',
  baselines: 'Baselines',
  compare: 'Compare',
  flame: 'Resource View',
  timeline: 'Timeline',
  hotpaths: 'Hot Paths',
  budgets: 'Budgets',
  export: 'Export / CI',
};

export default function ResourceProfilingDashboard() {
  const { network } = useStore();
  const lab = useResourceProfilingLab();
  const [view, setView] = useState<View>('capture');

  const handleCapture = useCallback(
    (input: Parameters<typeof lab.capture.capture>[0]) => {
      void lab.capture.capture(input).then((profile) => {
        if (profile) lab.clearCandidate();
      });
    },
    [lab]
  );

  const loadingAny = lab.baselines.loading || lab.budgets.loading;
  const hasAnyBaselines = lab.baselines.baselines.length > 0;

  return (
    <main style={pageStyle}>
      <header>
        <div style={mutedStyle}>SOROBAN PERFORMANCE TOOLING</div>
        <h1 style={{ margin: '4px 0' }}>Resource Profiling Lab</h1>
        <p style={mutedStyle}>
          Capture typed resource profiles from real simulations, compare them against named baselines with deterministic
          thresholds, and enforce resource budgets in CI -- without relying on AI fee predictions.
        </p>
      </header>

      {lab.baselines.error && (
        <div style={{ ...cardStyle, borderColor: 'var(--red)' }} role="alert">
          <strong style={{ color: 'var(--red)' }}>Couldn&apos;t load saved baselines</strong>
          <p>{lab.baselines.error.message}</p>
          {lab.baselines.error.retryable && (
            <button type="button" style={buttonStyle} onClick={() => void lab.baselines.refresh()}>
              Retry
            </button>
          )}
        </div>
      )}

      {lab.capture.error && (
        <div style={{ ...cardStyle, borderColor: 'var(--red)' }} role="alert">
          <strong style={{ color: 'var(--red)' }}>Capture failed</strong>
          <p>{lab.capture.error.message}</p>
          {lab.capture.error.retryable && <p style={mutedStyle}>You can retry the capture from the Capture tab.</p>}
        </div>
      )}

      {loadingAny && !hasAnyBaselines ? (
        <div style={cardStyle} aria-busy="true">
          <p>Loading saved baselines and budgets…</p>
        </div>
      ) : (
        <>
          {!hasAnyBaselines && (
            <div style={cardStyle}>
              <p style={mutedStyle}>
                No baselines saved yet. Capture a profile and save it as a new baseline, or{' '}
                <button type="button" style={buttonStyle} onClick={() => void lab.loadSampleData()}>
                  load bundled sample data
                </button>{' '}
                to explore the workspace offline.
              </p>
            </div>
          )}

          <nav aria-label="Resource profiling views" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {VIEWS.map((item) => (
              <button key={item} type="button" aria-current={view === item ? 'page' : undefined} style={view === item ? primaryButtonStyle : buttonStyle} onClick={() => setView(item)}>
                {VIEW_LABEL[item]}
              </button>
            ))}
          </nav>

          {view === 'capture' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <CapturePanel defaultNetwork={network} online={lab.capture.online} loading={lab.capture.loading} onCapture={handleCapture} onCancel={lab.capture.cancel} />
              {lab.capture.profile && (
                <div style={cardStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <strong>Captured profile ready</strong>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {lab.selectedBaseline && (
                        <button type="button" style={buttonStyle} onClick={() => void lab.saveCandidateToBaseline(lab.selectedBaseline!.id)}>
                          Save to &quot;{lab.selectedBaseline.name}&quot;
                        </button>
                      )}
                      <button type="button" style={primaryButtonStyle} onClick={() => setView('compare')}>
                        View comparison
                      </button>
                    </div>
                  </div>
                  {lab.capture.profile.missingMetrics.length > 0 && (
                    <p style={mutedStyle}>
                      Not captured: {lab.capture.profile.missingMetrics.join(', ')} (this RPC response didn&apos;t include them).
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {view === 'baselines' && (
            <BaselineManager
              baselines={lab.baselines.baselines}
              selectedBaselineId={lab.selectedBaselineId}
              onSelect={lab.setSelectedBaselineId}
              onCreate={(name, description) => void lab.baselines.createBaseline(name, description)}
              onDelete={(id) => void lab.baselines.deleteBaseline(id)}
              onRemoveSample={(baselineId, profileId) => void lab.baselines.removeSample(baselineId, profileId)}
              onLoadSample={() => void lab.loadSampleData()}
              onImportFile={(file) => void lab.importBaselineFromFile(file)}
              importError={lab.importError?.message ?? null}
            />
          )}

          {view === 'compare' && <ComparisonView comparison={lab.comparison} />}
          {view === 'flame' && <FlameResourceView profile={lab.candidateProfile} />}
          {view === 'timeline' && <MetricTimeline baseline={lab.selectedBaseline} candidate={lab.candidateProfile} />}
          {view === 'hotpaths' && <HotPathPanel profile={lab.candidateProfile} />}

          {view === 'budgets' && (
            <BudgetEditor
              budgets={lab.budgets.budgets}
              selectedBudgetId={lab.selectedBudgetId}
              onSelect={lab.setSelectedBudgetId}
              onCreate={(name) => void lab.budgets.createBudget(name)}
              onDelete={(id) => void lab.budgets.deleteBudget(id)}
              onSave={(budget) => void lab.budgets.saveBudget(budget)}
              evaluation={lab.budgetEvaluation}
            />
          )}

          {view === 'export' && (
            <ExportPanel
              hasBaseline={Boolean(lab.selectedBaseline)}
              hasComparison={Boolean(lab.comparison)}
              hasBudgetEvaluation={Boolean(lab.budgetEvaluation)}
              onExportBaseline={lab.exportBaselineJson}
              onExportComparison={lab.exportComparisonJson}
              onExportCiGate={lab.exportCiGate}
            />
          )}
        </>
      )}
    </main>
  );
}
