import React, { useState } from 'react';
import type { PredicateTemplate } from '../../types/claimableBalanceExplorer';
import VisualPredicateBuilder from './VisualPredicateBuilder';

interface PredicateTemplateLibraryProps {
  templates: PredicateTemplate[];
  onSelectTemplate?: (template: PredicateTemplate) => void;
  onSaveCustomTemplate?: (template: Omit<PredicateTemplate, 'id' | 'createdAt' | 'version'>) => void;
  onDeleteTemplate?: (id: string) => void;
  onExportTemplates?: () => string;
  onImportTemplates?: (json: string) => { success: boolean; importedCount: number; errors: string[] };
}

export default function PredicateTemplateLibrary({
  templates,
  onSelectTemplate,
  onDeleteTemplate,
  onExportTemplates,
  onImportTemplates,
}: PredicateTemplateLibraryProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<PredicateTemplate | null>(templates[0] || null);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [importJson, setImportJson] = useState<string>('');
  const [importStatus, setImportStatus] = useState<{ success?: boolean; message?: string } | null>(null);

  const categories = ['all', 'vesting', 'escrow', 'timelock', 'custom'];

  const filteredTemplates = templates.filter((t) => {
    if (filterCategory === 'all') return true;
    return t.category === filterCategory;
  });

  function handleExport() {
    if (!onExportTemplates) return;
    const json = onExportTemplates();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stellar_predicate_templates_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImportSubmit() {
    if (!onImportTemplates || !importJson.trim()) return;
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
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      }}
    >
      {/* Header controls & Export / Import */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setFilterCategory(cat)}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: '1px solid var(--border-color, #2d3343)',
                background: filterCategory === cat ? '#3498db' : 'var(--bg-surface, #1e222d)',
                color: filterCategory === cat ? '#fff' : 'var(--text-secondary, #94a3b8)',
                fontSize: '12px',
                fontWeight: 600,
                textTransform: 'capitalize',
                cursor: 'pointer',
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          {onExportTemplates && (
            <button
              type="button"
              onClick={handleExport}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                background: 'var(--bg-surface, #1e222d)',
                border: '1px solid var(--border-color, #2d3343)',
                color: 'var(--text-primary, #fff)',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              Export JSON Vault
            </button>
          )}
        </div>
      </div>

      {/* Main split grid: Template cards on left, detail / preview on right */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '20px',
        }}
      >
        {/* Left Column: List of templates */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filteredTemplates.map((template) => (
            <div
              key={template.id}
              onClick={() => setSelectedTemplate(template)}
              style={{
                background:
                  selectedTemplate?.id === template.id
                    ? 'rgba(52, 152, 219, 0.1)'
                    : 'var(--bg-surface, #1e222d)',
                border:
                  selectedTemplate?.id === template.id
                    ? '1px solid #3498db'
                    : '1px solid var(--border-color, #2d3343)',
                borderRadius: '8px',
                padding: '14px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary, #fff)' }}>
                  {template.name}
                </span>
                <span
                  style={{
                    fontSize: '10px',
                    textTransform: 'uppercase',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: 'var(--bg-base, #131722)',
                    color: 'var(--text-muted, #64748b)',
                  }}
                >
                  {template.category}
                </span>
              </div>

              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary, #94a3b8)' }}>
                {template.description}
              </p>

              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                {template.tags.map((tag) => (
                  <span
                    key={tag}
                    style={{
                      fontSize: '10px',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      color: 'var(--text-muted, #64748b)',
                    }}
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Right Column: Template preview & builder inspection */}
        {selectedTemplate && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              background: 'var(--bg-surface, #1e222d)',
              border: '1px solid var(--border-color, #2d3343)',
              borderRadius: '8px',
              padding: '16px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', color: '#fff' }}>
                  {selectedTemplate.name}
                </h3>
                <span style={{ fontSize: '11px', color: 'var(--text-muted, #64748b)' }}>
                  Version {selectedTemplate.version} • Created: {selectedTemplate.createdAt.slice(0, 10)}
                </span>
              </div>

              {onSelectTemplate && (
                <button
                  type="button"
                  onClick={() => onSelectTemplate(selectedTemplate)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '4px',
                    background: '#2ecc71',
                    border: 'none',
                    color: '#fff',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Use Template
                </button>
              )}
            </div>

            <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary, #94a3b8)' }}>
              {selectedTemplate.description}
            </p>

            <VisualPredicateBuilder
              rootNode={selectedTemplate.predicate}
              onChange={() => {}}
              readOnly={true}
            />
          </div>
        )}
      </div>

      {/* JSON Import Section */}
      {onImportTemplates && (
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
      )}
    </div>
  );
}
