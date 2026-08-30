import type { CSSProperties } from 'react';
import { Download } from 'lucide-react';
import type { BulkReconciliationReport, BulkRunCheckpoint, BulkRunReceipt } from '../../types/bulkOperationsPlanner';
import { reconciliationPassRate, summarizeReconciliation } from '../../lib/bulkOperationsPlanner/reconciliation';

const panel: CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  padding: 18,
};

interface BulkReceiptsPanelProps {
  receipt: BulkRunReceipt | null;
  reconciliation: BulkReconciliationReport | null;
  checkpoint: BulkRunCheckpoint | null;
  onExportRun: () => void;
  onExportReconciliation: () => void;
}

export default function BulkReceiptsPanel({
  receipt,
  reconciliation,
  checkpoint,
  onExportRun,
  onExportReconciliation,
}: BulkReceiptsPanelProps) {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <section style={panel} aria-labelledby="bulk-receipts-heading">
        <h2 id="bulk-receipts-heading" style={{ marginTop: 0 }}>
          Receipts & reconciliation
        </h2>

        {!receipt && !checkpoint && (
          <p role="status" style={{ color: 'var(--text-muted)' }}>
            Run a bulk execution to generate receipts and reconciliation output.
          </p>
        )}

        {receipt && (
          <>
            <p>
              Run <code>{receipt.runId}</code> finished with status <strong>{receipt.status}</strong>.
            </p>
            <ul>
              <li>Completed: {receipt.completedCount}</li>
              <li>Failed: {receipt.failedCount}</li>
              <li>Skipped: {receipt.skippedCount}</li>
              <li>Total fee (stroops): {receipt.totalFeeStroops}</li>
            </ul>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button type="button" onClick={onExportRun}>
                <Download size={16} aria-hidden="true" /> Export run bundle
              </button>
              <button type="button" onClick={onExportReconciliation} disabled={!reconciliation}>
                <Download size={16} aria-hidden="true" /> Export reconciliation CSV
              </button>
            </div>
          </>
        )}

        {reconciliation && (
          <div style={{ marginTop: 16 }}>
            <h3 style={{ fontSize: 15 }}>
              {summarizeReconciliation(reconciliation)} · pass rate {reconciliationPassRate(reconciliation)}%
            </h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    <th scope="col" style={{ textAlign: 'left', padding: 8 }}>Operation</th>
                    <th scope="col" style={{ textAlign: 'left', padding: 8 }}>Expected</th>
                    <th scope="col" style={{ textAlign: 'left', padding: 8 }}>Actual</th>
                    <th scope="col" style={{ textAlign: 'left', padding: 8 }}>Discrepancy</th>
                  </tr>
                </thead>
                <tbody>
                  {reconciliation.rows.map((row) => (
                    <tr key={row.operationId} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: 8 }}>{row.label}</td>
                      <td style={{ padding: 8 }}>{row.expectedStatus}</td>
                      <td style={{ padding: 8 }}>{row.actualStatus}</td>
                      <td style={{ padding: 8, color: row.discrepancy ? 'var(--red)' : 'var(--text-muted)' }}>
                        {row.discrepancy ?? '—'}
                      </td>
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
