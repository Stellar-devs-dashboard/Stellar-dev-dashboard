import { entriesFor, extractInterpolations } from './catalog';
import type { CatalogIssue, CatalogValidationReport, ExtractionResult, LocaleCatalog } from '../../types/i18nPlatform';

const HTML = /<\/?[a-z][^>]*>/i;
const DANGEROUS_HTML = /<(script|style|iframe|object|embed)|\son\w+\s*=|javascript:/i;
const KEY_CALL = /(?:\bt\s*\(|\bi18n\.t\s*\(|\btranslate\s*\()\s*(['"`])([^'"`$]+)\1/g;
const DYNAMIC_CALL = /(?:\bt\s*\(|\bi18n\.t\s*\(|\btranslate\s*\()\s*([^'"\s][^,)]*)/g;

function issue(locale: string, key: string, code: CatalogIssue['code'], severity: CatalogIssue['severity'], message: string): CatalogIssue {
  return { locale, key, code, severity, message };
}

function sameSet(left: string[], right: string[]) { return left.length === right.length && left.every((item, index) => item === right[index]); }

export function validateCatalog(catalog: LocaleCatalog, source: LocaleCatalog, usedKeys: Iterable<string> = []): CatalogValidationReport {
  const issues: CatalogIssue[] = [];
  const sourceEntries = new Map(entriesFor(source).map(entry => [entry.key, entry]));
  const targetEntries = new Map(entriesFor(catalog).map(entry => [entry.key, entry]));
  const used = new Set([...usedKeys].map(key => key.includes(':') ? key : `translation:${key}`));
  for (const [key, sourceEntry] of sourceEntries) {
    const target = targetEntries.get(key);
    if (!target || !target.value.trim()) { issues.push(issue(catalog.locale, key, 'missing', 'error', 'No translation has been supplied.')); continue; }
    const expected = sourceEntry.metadata.interpolation ?? extractInterpolations(sourceEntry.value);
    const received = target.metadata.interpolation ?? extractInterpolations(target.value);
    if (!sameSet(expected, received)) issues.push(issue(catalog.locale, key, 'interpolation-mismatch', 'error', `Expected variables ${expected.join(', ') || 'none'}; found ${received.join(', ') || 'none'}.`));
    if (DANGEROUS_HTML.test(target.value)) issues.push(issue(catalog.locale, key, 'unsafe-html', 'error', 'Translation contains unsafe HTML or an event handler.'));
    if (HTML.test(target.value) && !sourceEntry.metadata.allowHtml) issues.push(issue(catalog.locale, key, 'unsafe-html', 'warning', 'HTML is not allowed for this translation.'));
    if ((sourceEntry.metadata.maxLength && target.value.length > sourceEntry.metadata.maxLength) || target.value.length > Math.max(80, sourceEntry.value.length * 2.4)) issues.push(issue(catalog.locale, key, 'layout-risk', 'warning', 'Translation may overflow constrained dashboard layouts.'));
    if (!validPluralKey(key, target.value, catalog.locale)) issues.push(issue(catalog.locale, key, 'plural-mismatch', 'warning', 'Plural key is incomplete for this locale.'));
  }
  for (const key of targetEntries.keys()) if (!sourceEntries.has(key)) issues.push(issue(catalog.locale, key, 'unused', used.has(key) ? 'info' : 'warning', 'Key is not present in the source catalog.'));
  for (const key of used) if (!sourceEntries.has(key)) issues.push(issue(catalog.locale, key, 'missing', 'error', 'Code references a key absent from the source catalog.'));
  const translated = [...sourceEntries.keys()].filter(key => Boolean(targetEntries.get(key)?.value.trim())).length;
  return { locale: catalog.locale, generatedAt: new Date().toISOString(), totalKeys: sourceEntries.size, translatedKeys: translated, coverage: sourceEntries.size ? Math.round(translated / sourceEntries.size * 100) : 100, issues };
}

function validPluralKey(key: string, value: string, locale: string): boolean {
  if (!/_((zero|one|two|few|many|other))$/.test(key)) return true;
  if (!value.trim()) return false;
  if (locale.startsWith('ar') && !/_((zero|one|two|few|many|other))$/.test(key)) return false;
  return true;
}

export function extractTranslationKeys(files: Record<string, string>): ExtractionResult {
  const keys = new Set<string>(); const dynamicCalls: ExtractionResult['dynamicCalls'] = [];
  for (const [file, source] of Object.entries(files)) {
    for (const match of source.matchAll(KEY_CALL)) keys.add(match[2]);
    for (const match of source.matchAll(DYNAMIC_CALL)) {
      const expression = match[1].trim();
      if (!expression.startsWith("'") && !expression.startsWith('"') && !expression.startsWith('`')) dynamicCalls.push({ file, expression: expression.slice(0, 120) });
    }
  }
  return { keys: [...keys].sort(), dynamicCalls, filesScanned: Object.keys(files).length };
}

export function validateCatalogJson(input: string, source: LocaleCatalog, usedKeys: Iterable<string> = []): CatalogValidationReport | { errors: string[] } {
  try {
    const parsed = JSON.parse(input) as LocaleCatalog;
    if (parsed.format !== 'stellar-locale-catalog' || parsed.version !== 1) return { errors: ['Unsupported catalog format or version.'] };
    return validateCatalog(parsed, source, usedKeys);
  } catch { return { errors: ['Catalog JSON could not be parsed.'] }; }
}

export function summarizeIssues(issues: CatalogIssue[]): Record<CatalogIssue['code'], number> {
  return issues.reduce((summary, current) => { summary[current.code] += 1; return summary; }, { missing: 0, unused: 0, malformed: 0, 'unsafe-html': 0, 'interpolation-mismatch': 0, 'layout-risk': 0, 'plural-mismatch': 0 });
}

export function isCatalogSafe(report: CatalogValidationReport): boolean { return !report.issues.some(item => item.severity === 'error'); }
