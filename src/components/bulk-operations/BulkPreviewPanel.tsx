import type { CSSProperties } from 'react';
import type { BulkImportPreview, BulkManifest, BulkValidationReport } from '../../types/bulkOperationsPlanner';
import { summarizeImportPreview } from '../../lib/bulkOperationsPlanner/csvImport';

const panel: CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  padding: 18,
};

interface BulkPreviewPanelProps {
  preview: BulkImportPreview | null;
  manifest: BulkManifest | null;
  validation: BulkValidationReport | null;
}

export default function BulkPreviewPanel({ preview, manifest, validation }: BulkPreviewPanelProps) {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <section style={panel} aria-labelledby="bulk-preview-heading">
        <h2 id="bulk-preview-heading" style={{ marginTop: 0 }}>
          Import preview
        </h2>
        {!preview && !manifest && (
          <p role="status" style={{ color: 'var(--text-muted)' }}>
            Run Preview import on the Import tab to map CSV rows into operation specs.
          </p>
        )}

        {preview && (
          <>
            <p>{summarizeImportPreview(preview)}</p>
            {preview.duplicateRowIndexes.length > 0 && (
              <p style={{ color: 'var(--amber)' }}>Duplicate row indexes: {preview.duplicateRowIndexes.join(', ')}</p>
            )}

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    <th scope="col" style={{ textAlign: 'left', padding: 8 }}>ID</th>
                    <th scope="col" style={{ textAlign: 'left', padding: 8 }}>Label</th>
                    <th scope="col" style={{ textAlign: 'left', padding: 8 }}>Family</th>
                    <th scope="col" style={{ textAlign: 'left', padding: 8 }}>Source</th>
                    <th scope="col" style={{ textAlign: 'left', padding: 8 }}>Tags</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.mappedOperations.map((op) => (
                    <tr key={op.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: 8 }}>{op.id}</td>
                      <td style={{ padding: 8 }}>{op.label}</td>
                      <td style={{ padding: 8 }}>{op.family}</td>
                      <td style={{ padding: 8, fontFamily: 'var(--font-mono)', fontSize: 12 }}>{op.sourceAccount.slice(0, 8)}…</td>
                      <td style={{ padding: 8 }}>{op.tags.join(', ') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {(preview.issues.length > 0 || validation?.issues.length) && (
              <div style={{ marginTop: 16 }}>
                <h3 style={{ fontSize: 15 }}>Validation issues</h3>
                <ul>
                  {[...preview.issues, ...(validation?.issues ?? [])].slice(0, 20).map((item, index) => (
                    <li key={`${item.code}-${index}`} style={{ color: item.severity === 'error' ? 'var(--red)' : 'var(--amber)' }}>
                      Row {item.row}: {item.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {manifest && (
          <div style={{ marginTop: 16 }}>
            <h3 style={{ fontSize: 15 }}>Active manifest</h3>
            <p>
              {manifest.name} · {manifest.operations.length} operations · network {manifest.network}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
