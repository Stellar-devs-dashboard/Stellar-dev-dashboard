import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_PREDICATE_TEMPLATES,
  loadAllTemplates,
  saveCustomTemplate,
  deleteCustomTemplate,
  exportTemplatesToJson,
  importTemplatesFromJson,
} from '../templateStore';
import { createUnconditional } from '../predicateTree';

describe('Template Store', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('loads default built-in templates', () => {
    const templates = loadAllTemplates();
    expect(templates.length).toBeGreaterThanOrEqual(4);
    expect(templates.some((t) => t.id === 'template_immediate')).toBe(true);
  });

  it('saves and deletes custom templates', () => {
    const saved = saveCustomTemplate({
      name: 'Test Custom Template',
      description: 'Custom testing template description',
      category: 'custom',
      tags: ['test'],
      predicate: createUnconditional(),
    });

    expect(saved.id).toContain('template_custom');
    let all = loadAllTemplates();
    expect(all.some((t) => t.id === saved.id)).toBe(true);

    deleteCustomTemplate(saved.id);
    all = loadAllTemplates();
    expect(all.some((t) => t.id === saved.id)).toBe(false);
  });

  it('exports and imports template vault JSON safely', () => {
    const exported = exportTemplatesToJson(DEFAULT_PREDICATE_TEMPLATES);
    expect(exported).toContain('schemaVersion');
    expect(exported).toContain('1.0.0');

    const result = importTemplatesFromJson(exported);
    expect(result.success).toBe(true);
    expect(result.importedCount).toBeGreaterThan(0);

    // Test malformed JSON
    const badResult = importTemplatesFromJson('{ invalid json }');
    expect(badResult.success).toBe(false);
  });
});
