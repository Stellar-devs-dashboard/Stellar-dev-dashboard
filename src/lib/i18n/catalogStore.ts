import { importCatalog, mergeCatalog } from './catalog';
import type { LocaleCatalog } from '../../types/i18nPlatform';

const PREFIX = 'stellar:i18n-catalog:';
const extensions = new Map<string, LocaleCatalog>();

function key(locale: string) { return `${PREFIX}${locale}`; }
export function loadStoredCatalog(locale: string): LocaleCatalog | null {
  try { const raw = localStorage.getItem(key(locale)); return raw ? (JSON.parse(raw) as LocaleCatalog) : null; } catch { return null; }
}
export function saveStoredCatalog(catalog: LocaleCatalog): void { try { localStorage.setItem(key(catalog.locale), JSON.stringify(catalog)); } catch { /* storage is optional */ } }
export function clearStoredCatalog(locale: string): void { try { localStorage.removeItem(key(locale)); } catch { /* storage is optional */ } }
export function registerExtensionCatalog(extensionId: string, catalog: LocaleCatalog): void { extensions.set(`${extensionId}:${catalog.locale}`, catalog); }
export function unregisterExtensionCatalog(extensionId: string, locale: string): void { extensions.delete(`${extensionId}:${locale}`); }
export function extensionCatalogs(locale: string): LocaleCatalog[] { return [...extensions.entries()].filter(([id]) => id.endsWith(`:${locale}`)).map(([, catalog]) => catalog); }
export function resolveCatalog(base: LocaleCatalog): LocaleCatalog {
  const saved = loadStoredCatalog(base.locale); let resolved = saved ? mergeCatalog(base, saved) : base;
  for (const extension of extensionCatalogs(base.locale)) resolved = mergeCatalog(resolved, extension);
  return resolved;
}
export function importAndStore(input: string, expectedLocale: string): { catalog?: LocaleCatalog; errors: string[]; warnings: string[] } {
  const result = importCatalog(input);
  if (!result.catalog) return result;
  if (result.catalog.locale !== expectedLocale) return { errors: [`Expected ${expectedLocale}, received ${result.catalog.locale}.`], warnings: result.warnings };
  saveStoredCatalog(result.catalog); return result;
}
