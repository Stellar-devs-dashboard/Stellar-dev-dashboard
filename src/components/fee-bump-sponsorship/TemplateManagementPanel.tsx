import React, { useState } from 'react';
import type { FeeBumpTemplate } from '../../types/feeBumpSponsorship';

interface TemplateManagementPanelProps {
  templates: FeeBumpTemplate[];
  onApplyTemplate: (template: FeeBumpTemplate) => void;
  onSaveCurrentAsTemplate: (template: Omit<FeeBumpTemplate, 'id' | 'createdAt' | 'version'>) => void;
  onExportTemplates: () => string;
  onImportTemplates: (json: string) => { success: boolean; importedCount: number; errors: string[] };
}

export default function TemplateManagementPanel({
  templates,
  onApplyTemplate,
  onExportTemplates,
  onImportTemplates,
}: TemplateManagementPanelProps) {
  const [importJson, setImportJson] = useState('');
  const [importStatus, setImportStatus] = useState<{ success?: boolean; message?: string } | null>(null);

  function handleExport() {
    const json = onExportTemplates();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stellar_feebump_templates_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImportSubmit() {
    if (!importJson.trim()) return;
    const res = onImportTemplates(importJson.trim());
    if (res.success) {
      setImportStatus({
        success: true,
        message: `Successfully imported ${res.importedCount} template(s)!`,
      });
      setImportJson('');
    } else {
      setImportStatus({
        success: false,
        message: `Import failed: ${res.errors.join('; ')}`,
      });
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header controls */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <h3 style={{ margin: 0, fontSize: '16px', color: '#fff' }}>
          Fee-Bump & Sponsorship Templates
        </h3>

        <button
          type="button"
          onClick={handleExport}
          style={{
            padding: '6px 14px',
            borderRadius: '6px',
            background: 'var(--bg-surface, #1e222d)',
            border: '1px solid var(--border-color, #2d3343)',
            color: '#fff',
            fontSize: '12px',
            cursor: 'pointer',
          }}
        >
          Export Template Vault (JSON)
        </button>
      </div>

      {/* Grid of Templates */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: '16px',
        }}
      >
        {templates.map((tpl) => (
          <div
            key={tpl.id}
            style={{
              background: 'var(--bg-surface, #1e222d)',
              border: '1px solid var(--border-color, #2d3343)',
              borderRadius: '8px',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: '14px', color: '#fff' }}>{tpl.name}</strong>
              <span
                style={{
                  fontSize: '10px',
                  textTransform: 'uppercase',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  background: 'var(--bg-base, #131722)',
                  color: '#94a3b8',
                }}
              >
                {tpl.category}
              </span>
            </div>

            <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary, #94a3b8)' }}>
              {tpl.description}
            </p>

            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
              {tpl.tags.map((tag) => (
                <span
                  key={tag}
                  style={{
                    fontSize: '10px',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    color: '#64748b',
                  }}
                >
                  #{tag}
                </span>
              ))}
            </div>

            <button
              type="button"
              onClick={() => onApplyTemplate(tpl)}
              style={{
                marginTop: 'auto',
                padding: '6px 12px',
                borderRadius: '4px',
                background: '#3498db',
                border: 'none',
                color: '#fff',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Load into Studio
            </button>
          </div>
        ))}
      </div>

      {/* JSON Import Section */}
      <div
        style={{
          background: 'var(--bg-surface, #1e222d)',
          border: '1px solid var(--border-color, #2d3343)',
          borderRadius: '8px',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}
      >
        <h4 style={{ margin: 0, fontSize: '13px', color: '#fff' }}>
          Import Template Package (JSON)
        </h4>
        <textarea
          value={importJson}
          onChange={(e) => setImportJson(e.target.value)}
          placeholder="Paste JSON template vault export here..."
          rows={3}
          style={{
            width: '100%',
            padding: '8px',
            background: 'var(--bg-base, #131722)',
            border: '1px solid var(--border-color, #2d3343)',
            borderRadius: '4px',
            color: '#fff',
            fontSize: '11px',
            fontFamily: 'monospace',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {importStatus && (
            <span
              style={{
                fontSize: '12px',
                color: importStatus.success ? '#2ecc71' : '#e74c3c',
              }}
            >
              {importStatus.message}
            </span>
          )}
          <button
            type="button"
            onClick={handleImportSubmit}
            style={{
              marginLeft: 'auto',
              padding: '6px 14px',
              borderRadius: '4px',
              background: '#3498db',
              border: 'none',
              color: '#fff',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Import JSON
          </button>
        </div>
      </div>
    </div>
  );
}
