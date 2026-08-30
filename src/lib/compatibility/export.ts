import {
  COMPATIBILITY_SCHEMA_VERSION,
  type CompatibilityAssessment,
  type CompatibilityExportDocument,
  type EndpointComparisonResult,
  type UpgradeReadinessAudit,
} from '../../types/compatibility';
import { redactUnknown } from './redaction';

export function createCompatibilityExport(
  assessment: CompatibilityAssessment,
  comparison: EndpointComparisonResult | null,
  audit: UpgradeReadinessAudit | null,
  now = new Date()
): CompatibilityExportDocument {
  return redactUnknown({
    schemaVersion: COMPATIBILITY_SCHEMA_VERSION,
    kind: 'compatibility-report',
    exportedAt: now.toISOString(),
    redacted: true,
    matrixVersion: assessment.matrixVersion,
    assessment,
    comparison,
    audit,
  }) as CompatibilityExportDocument;
}

export function downloadCompatibilityExport(document: CompatibilityExportDocument): void {
  const blob = new Blob([JSON.stringify(document, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const href = URL.createObjectURL(blob);
  const anchor = window.document.createElement('a');
  anchor.href = href;
  anchor.download = `stellar-compatibility-${document.assessment.targetId}-${document.exportedAt.slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(href);
}
