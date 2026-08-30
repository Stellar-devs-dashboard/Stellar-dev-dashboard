import type { CatalogEntry, CatalogImportResult, LocaleCatalog, TranslationMetadata } from '../../types/i18nPlatform';

const FORMAT = 'stellar-locale-catalog' as const;
const VERSION = 1 as const;
const KEY = /^[a-zA-Z][a-zA-Z0-9_-]*(?:\.[a-zA-Z][a-zA-Z0-9_-]*)*$/;
const INTERPOLATION = /{{\s*([a-zA-Z][\w-]*)\s*}}/g;

export function extractInterpolations(value: string): string[] {
  return [...value.matchAll(INTERPOLATION)].map(match => match[1]).filter((item, index, all) => all.indexOf(item) === index).sort();
}

export function flattenMessages(messages: Record<string, unknown>, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(messages)) {
    const key = prefix ? `${prefix}.${name}` : name;
    if (typeof value === 'string') result[key] = value;
    else if (value && typeof value === 'object' && !Array.isArray(value)) Object.assign(result, flattenMessages(value as Record<string, unknown>, key));
  }
  return result;
}

export function unflattenMessages(entries: Record<string, string>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entries)) {
    const path = key.split('.');
    let node = result;
    path.forEach((part, index) => {
      if (index === path.length - 1) node[part] = value;
      else node = (node[part] ??= {}) as Record<string, unknown>;
    });
  }
  return result;
}

export function createCatalog(locale: string, messages: Record<string, unknown>, fallbackLocale = 'en', namespace = 'translation'): LocaleCatalog {
  const entries: Record<string, CatalogEntry> = {};
  for (const [key, value] of Object.entries(flattenMessages(messages))) {
    entries[key] = { key, value, metadata: { interpolation: extractInterpolations(value) } };
  }
  return { format: FORMAT, version: VERSION, locale, fallbackLocale, namespaces: { [namespace]: entries }, updatedAt: new Date().toISOString() };
}

export function cloneCatalog(catalog: LocaleCatalog): LocaleCatalog {
  return JSON.parse(JSON.stringify(catalog)) as LocaleCatalog;
}

export function entriesFor(catalog: LocaleCatalog, namespace?: string): CatalogEntry[] {
  return Object.entries(catalog.namespaces)
    .filter(([name]) => !namespace || name === namespace)
    .flatMap(([name, entries]) => Object.values(entries).map(entry => ({ ...entry, key: `${name}:${entry.key}` })));
}

export function getEntry(catalog: LocaleCatalog, qualifiedKey: string): CatalogEntry | undefined {
  const [namespace, ...parts] = qualifiedKey.includes(':') ? qualifiedKey.split(':') : ['translation', qualifiedKey];
  return catalog.namespaces[namespace]?.[parts.join(':')];
}

export function setEntry(catalog: LocaleCatalog, qualifiedKey: string, value: string, metadata: TranslationMetadata = {}): LocaleCatalog {
  const next = cloneCatalog(catalog);
  const [namespace, ...parts] = qualifiedKey.includes(':') ? qualifiedKey.split(':') : ['translation', qualifiedKey];
  const key = parts.join(':');
  if (!KEY.test(key)) throw new Error(`Invalid translation key: ${key}`);
  next.namespaces[namespace] ??= {};
  next.namespaces[namespace][key] = { key, value, metadata: { ...metadata, interpolation: extractInterpolations(value), updatedAt: new Date().toISOString() } };
  next.updatedAt = new Date().toISOString();
  return next;
}

export function removeEntry(catalog: LocaleCatalog, qualifiedKey: string): LocaleCatalog {
  const next = cloneCatalog(catalog);
  const [namespace, key] = qualifiedKey.includes(':') ? qualifiedKey.split(':', 2) : ['translation', qualifiedKey];
  delete next.namespaces[namespace]?.[key];
  next.updatedAt = new Date().toISOString();
  return next;
}

export function mergeCatalog(base: LocaleCatalog, incoming: LocaleCatalog): LocaleCatalog {
  const next = cloneCatalog(base);
  for (const [namespace, entries] of Object.entries(incoming.namespaces)) {
    next.namespaces[namespace] = { ...next.namespaces[namespace], ...entries };
  }
  next.updatedAt = new Date().toISOString();
  return next;
}

export function exportCatalog(catalog: LocaleCatalog): string {
  return JSON.stringify(catalog, null, 2);
}

function record(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }

export function importCatalog(input: string): CatalogImportResult {
  const errors: string[] = []; const warnings: string[] = [];
  let parsed: unknown;
  try { parsed = JSON.parse(input); } catch { return { errors: ['The selected file is not valid JSON.'], warnings }; }
  if (!record(parsed) || parsed.format !== FORMAT || parsed.version !== VERSION) return { errors: ['Unsupported catalog format or version.'], warnings };
  if (typeof parsed.locale !== 'string' || !/^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(parsed.locale)) errors.push('A valid BCP-47 locale is required.');
  if (!record(parsed.namespaces)) errors.push('Catalog namespaces must be an object.');
  const catalog = parsed as unknown as LocaleCatalog;
  for (const [namespace, rawEntries] of Object.entries(catalog.namespaces ?? {})) {
    if (!KEY.test(namespace) || !record(rawEntries)) { errors.push(`Invalid namespace: ${namespace}`); continue; }
    for (const [key, entry] of Object.entries(rawEntries)) {
      if (!KEY.test(key) || !record(entry) || typeof entry.value !== 'string') errors.push(`Invalid entry: ${namespace}:${key}`);
      else if (entry.value.length === 0) warnings.push(`Empty translation: ${namespace}:${key}`);
    }
  }
  return errors.length ? { errors, warnings } : { catalog, errors, warnings };
}

const PSEUDO_MAP: Record<string, string> = { a: 'á', b: 'ƀ', c: 'ç', d: 'đ', e: 'é', f: 'ƒ', g: 'ğ', h: 'ħ', i: 'í', j: 'ĵ', k: 'ķ', l: 'ľ', m: 'ḿ', n: 'ñ', o: 'ó', p: 'ṕ', q: 'ʠ', r: 'ř', s: 'š', t: 'ť', u: 'ú', v: 'ṽ', w: 'ŵ', x: 'ẋ', y: 'ý', z: 'ž' };

export function pseudoLocalize(value: string, expansion = 0.35): string {
  const tokens = value.split(/({{\s*[a-zA-Z][\w-]*\s*}}|<[^>]*>)/g);
  const translated = tokens.map(token => token.startsWith('{{') || token.startsWith('<') ? token : token.replace(/[a-z]/gi, char => PSEUDO_MAP[char.toLowerCase()] ?? char));
  const plainLength = value.replace(/{{[^}]+}}|<[^>]*>/g, '').length;
  return `［${translated.join('')}${' ~'.repeat(Math.ceil(plainLength * expansion / 2))}］`;
}

export function pseudoCatalog(catalog: LocaleCatalog, locale = 'en-XA'): LocaleCatalog {
  const next = cloneCatalog(catalog); next.locale = locale;
  for (const entries of Object.values(next.namespaces)) for (const entry of Object.values(entries)) entry.value = pseudoLocalize(entry.value);
  next.updatedAt = new Date().toISOString(); return next;
}
