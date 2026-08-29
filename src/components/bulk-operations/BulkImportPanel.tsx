import type { CSSProperties } from 'react';
import type { BulkCsvImportOptions } from '../../types/bulkOperationsPlanner';
import { csvTemplate, detectDelimiter } from '../../lib/bulkOperationsPlanner';

const panel: CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  padding: 18,
};

const labelStyle: CSSProperties = { display: 'grid', gap: 6, fontSize: 13 };

interface BulkImportPanelProps {
  csvText: string;
  onCsvTextChange: (value: string) => void;
  csvOptions: BulkCsvImportOptions;
  onCsvOptionsChange: (value: BulkCsvImportOptions) => void;
  onLoadDemoCsv: () => void;
  onPreviewImport: () => void;
  onCommitImport: () => void;
  loading: boolean;
}

export default function BulkImportPanel({
  csvText,
  onCsvTextChange,
  csvOptions,
  onCsvOptionsChange,
  onLoadDemoCsv,
  onPreviewImport,
  onCommitImport,
  loading,
}: BulkImportPanelProps) {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <section style={panel} aria-labelledby="bulk-import-heading">
        <h2 id="bulk-import-heading" style={{ marginTop: 0 }}>
          CSV import
        </h2>
        <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
          Paste or edit a CSV manifest. Column mapping follows the template headers below.
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <button type="button" onClick={onLoadDemoCsv}>
            Load demo CSV
          </button>
          <button type="button" onClick={() => onCsvTextChange(csvTemplate())}>
            Insert template
          </button>
          <button
            type="button"
            onClick={() =>
              onCsvOptionsChange({
                ...csvOptions,
                delimiter: detectDelimiter(csvText),
              })
            }
          >
            Detect delimiter
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 12 }}>
          <label style={labelStyle}>
            Delimiter
            <input
              aria-label="CSV delimiter"
              value={csvOptions.delimiter}
              onChange={(event) => onCsvOptionsChange({ ...csvOptions, delimiter: event.target.value || ',' })}
            />
          </label>
          <label style={labelStyle}>
            Default source account
            <input
              aria-label="Default source account"
              value={csvOptions.defaultSourceAccount ?? ''}
              onChange={(event) => onCsvOptionsChange({ ...csvOptions, defaultSourceAccount: event.target.value })}
            />
          </label>
          <label style={{ ...labelStyle, alignContent: 'end' }}>
            <span>
              <input
                type="checkbox"
                checked={csvOptions.hasHeader}
                onChange={(event) => onCsvOptionsChange({ ...csvOptions, hasHeader: event.target.checked })}
              />{' '}
              First row is header
            </span>
          </label>
          <label style={{ ...labelStyle, alignContent: 'end' }}>
            <span>
              <input
                type="checkbox"
                checked={csvOptions.skipEmptyRows}
                onChange={(event) => onCsvOptionsChange({ ...csvOptions, skipEmptyRows: event.target.checked })}
              />{' '}
              Skip empty rows
            </span>
          </label>
        </div>

        <label style={labelStyle}>
          CSV content
          <textarea
            aria-label="CSV content"
            value={csvText}
            onChange={(event) => onCsvTextChange(event.target.value)}
            rows={12}
            style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: 13 }}
          />
        </label>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          <button type="button" onClick={onPreviewImport}>
            Preview import
          </button>
          <button type="button" onClick={onCommitImport} disabled={loading || !csvText.trim()}>
            Commit import
          </button>
        </div>
      </section>
    </div>
  );
}
