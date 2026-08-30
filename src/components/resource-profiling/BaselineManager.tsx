import { useRef, useState } from 'react';
import type { Baseline } from '../../types/resourceProfiling';
import { buttonStyle, cardStyle, inputStyle, labelStyle, mutedStyle, primaryButtonStyle, tableStyle, tableWrapStyle, tdStyle, thStyle } from './styles';

export interface BaselineManagerProps {
  baselines: Baseline[];
  selectedBaselineId: string | null;
  onSelect: (_id: string) => void;
  onCreate: (_name: string, _description: string) => void;
  onDelete: (_id: string) => void;
  onRemoveSample: (_baselineId: string, _profileId: string) => void;
  onLoadSample: () => void;
  onImportFile: (_file: File) => void;
  importError: string | null;
}

export default function BaselineManager({
  baselines,
  selectedBaselineId,
  onSelect,
  onCreate,
  onDelete,
  onRemoveSample,
  onLoadSample,
  onImportFile,
  importError,
}: BaselineManagerProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selected = baselines.find((baseline) => baseline.id === selectedBaselineId) ?? null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={cardStyle}>
        <h2 style={{ margin: '0 0 12px' }}>Baselines</h2>
        {baselines.length === 0 ? (
          <p style={mutedStyle}>
            No baselines yet. Create one below, load the bundled sample, or import a previously exported JSON baseline.
          </p>
        ) : (
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Name</th>
                  <th style={thStyle}>Samples</th>
                  <th style={thStyle}>Updated</th>
                  <th style={thStyle}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {baselines.map((baseline) => (
                  <tr key={baseline.id} style={{ background: baseline.id === selectedBaselineId ? 'var(--bg-card)' : undefined }}>
                    <td style={tdStyle}>
                      <button
                        type="button"
                        style={{ ...buttonStyle, borderColor: baseline.id === selectedBaselineId ? 'var(--cyan)' : undefined }}
                        aria-pressed={baseline.id === selectedBaselineId}
                        onClick={() => onSelect(baseline.id)}
                      >
                        {baseline.name}
                      </button>
                      {baseline.description && <div style={mutedStyle}>{baseline.description}</div>}
                    </td>
                    <td style={tdStyle}>{baseline.profiles.length}</td>
                    <td style={tdStyle}>{new Date(baseline.updatedAt).toLocaleString()}</td>
                    <td style={tdStyle}>
                      <button type="button" style={buttonStyle} onClick={() => onDelete(baseline.id)} aria-label={`Delete baseline ${baseline.name}`}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px', marginTop: '12px' }}>
          <div>
            <label htmlFor="rp-baseline-name" style={labelStyle}>
              New baseline name
            </label>
            <input id="rp-baseline-name" style={inputStyle} value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div>
            <label htmlFor="rp-baseline-desc" style={labelStyle}>
              Description
            </label>
            <input id="rp-baseline-desc" style={inputStyle} value={description} onChange={(event) => setDescription(event.target.value)} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
          <button
            type="button"
            style={primaryButtonStyle}
            disabled={!name.trim()}
            onClick={() => {
              onCreate(name.trim(), description.trim());
              setName('');
              setDescription('');
            }}
          >
            Create baseline
          </button>
          <button type="button" style={buttonStyle} onClick={onLoadSample}>
            Load sample data
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            style={{ display: 'none' }}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onImportFile(file);
              event.target.value = '';
            }}
          />
          <button type="button" style={buttonStyle} onClick={() => fileInputRef.current?.click()}>
            Import baseline JSON
          </button>
        </div>
        {importError && (
          <p role="alert" style={{ color: 'var(--red)', marginTop: '8px' }}>
            {importError}
          </p>
        )}
      </div>

      {selected && selected.profiles.length > 0 && (
        <div style={cardStyle}>
          <h3 style={{ margin: '0 0 8px' }}>Samples in &quot;{selected.name}&quot;</h3>
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Captured</th>
                  <th style={thStyle}>Source</th>
                  <th style={thStyle}>Function</th>
                  <th style={thStyle}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {selected.profiles.map((profile) => (
                  <tr key={profile.id}>
                    <td style={tdStyle}>{new Date(profile.provenance.capturedAt).toLocaleString()}</td>
                    <td style={tdStyle}>{profile.provenance.source}</td>
                    <td style={tdStyle}>{profile.provenance.functionName ?? '—'}</td>
                    <td style={tdStyle}>
                      <button type="button" style={buttonStyle} onClick={() => onRemoveSample(selected.id, profile.id)} aria-label="Remove sample">
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
