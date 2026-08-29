/**
 * Post-run reconciliation between planned and actual operation outcomes.
 */

import type {
  BulkManifest,
  BulkReconciliationReport,
  BulkReconciliationRow,
  BulkRunCheckpoint,
  BulkRunReceipt,
} from '../../types/bulkOperationsPlanner';

export function buildReconciliationReport(
  manifest: BulkManifest,
  checkpoint: BulkRunCheckpoint,
  receipt?: BulkRunReceipt
): BulkReconciliationReport {
  const rows: BulkReconciliationRow[] = manifest.operations.map((op) => {
    const state = checkpoint.operationStates.find((item) => item.operationId === op.id);
    const receiptOutcome = receipt?.operationOutcomes.find((item) => item.operationId === op.id);

    const expectedStatus = op.requiresApproval ? 'awaiting_approval' : 'completed';
    const actualStatus = receiptOutcome?.status ?? state?.status ?? 'draft';

    let discrepancy: string | undefined;
    if (actualStatus === 'failed') discrepancy = state?.lastError ?? receiptOutcome?.error ?? 'failed';
    else if (actualStatus !== expectedStatus && actualStatus !== 'completed' && actualStatus !== 'skipped') {
      discrepancy = `Expected ${expectedStatus}, got ${actualStatus}`;
    }

    return {
      operationId: op.id,
      label: op.label,
      family: op.family,
      expectedStatus,
      actualStatus,
      txHash: state?.txHash ?? receiptOutcome?.txHash,
      discrepancy,
    };
  });

  const matchedCount = rows.filter((row) => !row.discrepancy).length;
  const discrepancyCount = rows.filter((row) => row.discrepancy).length;
  const missingCount = rows.filter((row) => row.actualStatus === 'draft' || row.actualStatus === 'planned').length;

  return {
    runId: checkpoint.runId,
    manifestId: manifest.id,
    generatedAt: new Date().toISOString(),
    rows,
    matchedCount,
    discrepancyCount,
    missingCount,
  };
}

export function reconciliationToCsvRows(report: BulkReconciliationReport): Array<Record<string, string>> {
  return report.rows.map((row) => ({
    operationId: row.operationId,
    label: row.label,
    family: row.family,
    expectedStatus: row.expectedStatus,
    actualStatus: row.actualStatus,
    txHash: row.txHash ?? '',
    discrepancy: row.discrepancy ?? '',
  }));
}

export function summarizeReconciliation(report: BulkReconciliationReport): string {
  return `${report.matchedCount} matched, ${report.discrepancyCount} discrepancies, ${report.missingCount} missing`;
}

export function filterDiscrepancies(report: BulkReconciliationReport): BulkReconciliationRow[] {
  return report.rows.filter((row) => row.discrepancy);
}

export function reconciliationPassRate(report: BulkReconciliationReport): number {
  if (report.rows.length === 0) return 100;
  return Math.round((report.matchedCount / report.rows.length) * 100);
}

export function groupReconciliationByFamily(report: BulkReconciliationReport): Record<string, BulkReconciliationRow[]> {
  const grouped: Record<string, BulkReconciliationRow[]> = {};
  for (const row of report.rows) {
    grouped[row.family] = grouped[row.family] ?? [];
    grouped[row.family].push(row);
  }
  return grouped;
}

export function compareReconciliationReports(a: BulkReconciliationReport, b: BulkReconciliationReport): string[] {
  const diffs: string[] = [];
  if (a.matchedCount !== b.matchedCount) {
    diffs.push(`Matched count ${a.matchedCount} -> ${b.matchedCount}`);
  }
  if (a.discrepancyCount !== b.discrepancyCount) {
    diffs.push(`Discrepancy count ${a.discrepancyCount} -> ${b.discrepancyCount}`);
  }
  return diffs;
}

export function hasBlockingDiscrepancies(report: BulkReconciliationReport): boolean {
  return report.rows.some(
    (row) => row.discrepancy && row.actualStatus !== 'skipped' && row.actualStatus !== 'cancelled'
  );
}

export function reconciliationSeverity(report: BulkReconciliationReport): 'ok' | 'warning' | 'error' {
  if (report.discrepancyCount === 0 && report.missingCount === 0) return 'ok';
  if (report.discrepancyCount > 0) return 'error';
  return 'warning';
}
