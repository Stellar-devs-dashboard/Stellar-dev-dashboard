import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_FEE_BUMP_TEMPLATES,
  loadAllFeeBumpTemplates,
  saveCustomFeeBumpTemplate,
  exportFeeBumpTemplatesToJson,
  importFeeBumpTemplatesFromJson,
} from '../templateVault';

describe('Fee-Bump Template Vault', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('loads built-in standard fee-bump templates', () => {
    const templates = loadAllFeeBumpTemplates();
    expect(templates.length).toBeGreaterThanOrEqual(3);
    expect(templates.some((t) => t.id === 'template_sponsored_onboarding')).toBe(true);
  });

  it('exports and imports template vault JSON safely without secrets', () => {
    const exported = exportFeeBumpTemplatesToJson(DEFAULT_FEE_BUMP_TEMPLATES);
    expect(exported).toContain('schemaVersion');
    expect(exported).toContain('1.0.0');

    const res = importFeeBumpTemplatesFromJson(exported);
    expect(res.success).toBe(true);
    expect(res.importedCount).toBeGreaterThan(0);
  });
});
