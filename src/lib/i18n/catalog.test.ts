import { describe, expect, it } from 'vitest';
import { createCatalog, importCatalog, pseudoLocalize, setEntry } from './catalog';
import { createLocaleFormatter } from './formatters';
import { extractTranslationKeys, validateCatalog } from './validation';

describe('locale catalog platform', () => {
  const source = createCatalog('en', { greeting: 'Hello {{name}}', nav: { home: 'Home' } });

  it('preserves nested keys and interpolation schema', () => {
    const catalog = createCatalog('es', { greeting: 'Hola {{name}}', nav: { home: 'Inicio' } });
    expect(catalog.namespaces.translation.greeting.metadata.interpolation).toEqual(['name']);
    expect(validateCatalog(catalog, source).coverage).toBe(100);
  });

  it('reports missing variables and unsafe markup', () => {
    let catalog = createCatalog('es', { greeting: 'Hola', nav: { home: '<script>alert(1)</script>' } });
    catalog = setEntry(catalog, 'translation:greeting', 'Hola');
    const codes = validateCatalog(catalog, source).issues.map(item => item.code);
    expect(codes).toContain('interpolation-mismatch');
    expect(codes).toContain('unsafe-html');
  });

  it('rejects unversioned imports and expands pseudo text without changing tokens', () => {
    expect(importCatalog('{"locale":"es"}').errors).not.toHaveLength(0);
    expect(pseudoLocalize('Hello {{name}}')).toContain('{{name}}');
  });

  it('extracts static translation calls and marks dynamic calls', () => {
    const result = extractTranslationKeys({ 'view.tsx': "t('nav.home'); i18n.t(\"greeting\"); t(prefix + key)" });
    expect(result.keys).toEqual(['greeting', 'nav.home']);
    expect(result.dynamicCalls).toHaveLength(1);
  });

  it('uses locale-aware formatters and bidi isolation', () => {
    const formatter = createLocaleFormatter('de-DE');
    expect(formatter.number(1234.5)).toContain('1.234');
    expect(formatter.amount('12.5', 'XLM')).toContain('XLM');
    expect(formatter.text('GABC')).toContain('GABC');
  });
});
