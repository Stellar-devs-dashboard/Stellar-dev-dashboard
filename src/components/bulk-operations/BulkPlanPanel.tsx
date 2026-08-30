import type { CSSProperties } from 'react';
import type { BulkExecutionPlan, BulkManifest, BulkValidationReport } from '../../types/bulkOperationsPlanner';
import { describeManifest, manifestStats, summarizePlan } from '../../lib/bulkOperationsPlanner';

const panel: CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  padding: 18,
};

interface BulkPlanPanelProps {
  manifest: BulkManifest | null;
  plan: BulkExecutionPlan | null;
  validation: BulkValidationReport | null;
  onPlan: () => void;
  onDryRun: () => void;
  onSave: () => void;
  loading: boolean;
}

export default function BulkPlanPanel({ manifest, plan, validation, onPlan, onDryRun, onSave, loading }: BulkPlanPanelProps) {
  const stats = manifest ? manifestStats(manifest) : null;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <section style={panel} aria-labelledby="bulk-plan-heading">
        <h2 id="bulk-plan-heading" style={{ marginTop: 0 }}>
          Execution plan
        </h2>

        {!manifest && (
          <p role="status" style={{ color: 'var(--text-muted)' }}>
            Import or load a demo manifest before planning.
          </p>
        )}

        {manifest && (
          <>
            <p>{describeManifest(manifest)}</p>
            {stats && (
              <ul style={{ marginTop: 0 }}>
                <li>Approval required: {stats.approvalRequiredCount}</li>
                <li>Tagged operations: {stats.taggedCount}</li>
                {Object.entries(stats.familyCounts).map(([family, count]) => (
                  <li key={family}>
                    {family}: {count}
                  </li>
                ))}
              </ul>
            )}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button type="button" onClick={onPlan} disabled={loading}>
                Build plan
              </button>
              <button type="button" onClick={onDryRun} disabled={!plan}>
                Dry run
              </button>
              <button type="button" onClick={onSave}>
                Save manifest
              </button>
            </div>
          </>
        )}

        {validation && !validation.valid && (
          <div role="alert" style={{ marginTop: 16, color: 'var(--red)' }}>
            Validation failed with {validation.issues.length} issue(s).
          </div>
        )}

        {plan && (
          <div style={{ marginTop: 16 }}>
            <h3 style={{ fontSize: 15 }}>{summarizePlan(plan)}</h3>
            {plan.warnings.map((warning) => (
              <p key={warning} style={{ color: 'var(--amber)', margin: '4px 0' }}>
                {warning}
              </p>
            ))}

            <div style={{ overflowX: 'auto', marginTop: 12 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    <th scope="col" style={{ textAlign: 'left', padding: 8 }}>Pack</th>
                    <th scope="col" style={{ textAlign: 'left', padding: 8 }}>Account</th>
                    <th scope="col" style={{ textAlign: 'right', padding: 8 }}>Ops</th>
                    <th scope="col" style={{ textAlign: 'right', padding: 8 }}>Fee</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.packs.map((pack) => (
                    <tr key={pack.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: 8 }}>{pack.id}</td>
                      <td style={{ padding: 8, fontFamily: 'var(--font-mono)', fontSize: 12 }}>{pack.sequenceAccount.slice(0, 8)}…</td>
                      <td style={{ padding: 8, textAlign: 'right' }}>{pack.operationIds.length}</td>
                      <td style={{ padding: 8, textAlign: 'right' }}>{pack.estimatedFeeStroops}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
