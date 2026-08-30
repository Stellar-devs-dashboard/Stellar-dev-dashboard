import { createCatalog, mergeCatalog } from './catalog';
import type { ExtensionCatalogRegistration, LocaleCatalog, LocaleDefinition, PluralRule } from '../../types/i18nPlatform';

const DEFAULT_PLURALS: Record<string, PluralRule[]> = {
  ar: ['zero', 'one', 'two', 'few', 'many', 'other'],
  fr: ['one', 'other'],
  ja: ['other'], ko: ['other'], zh: ['other'],
};

const defaultLocale = (code: string): LocaleDefinition => ({
  code, label: code, nativeLabel: code, direction: /^(ar|he|fa|ur)/.test(code) ? 'rtl' : 'ltr', fallback: 'en', owner: 'dashboard', pluralRules: DEFAULT_PLURALS[code.split('-')[0]] ?? ['one', 'other'],
});

export class LocaleRegistry {
  private locales = new Map<string, LocaleDefinition>();
  private catalogs = new Map<string, LocaleCatalog>();
  private extensionOwners = new Map<string, string[]>();

  constructor(definitions: LocaleDefinition[] = []) { definitions.forEach(definition => this.registerLocale(definition)); }

  registerLocale(definition: LocaleDefinition): LocaleDefinition {
    if (!/^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(definition.code)) throw new Error(`Invalid locale code: ${definition.code}`);
    if (!definition.fallback) throw new Error('A fallback locale is required.');
    const normalized = { ...defaultLocale(definition.code), ...definition, pluralRules: [...new Set(definition.pluralRules)] };
    this.locales.set(normalized.code, normalized); return normalized;
  }

  ensureLocale(code: string): LocaleDefinition { return this.locales.get(code) ?? this.registerLocale(defaultLocale(code)); }
  getLocale(code: string): LocaleDefinition | undefined { return this.locales.get(code); }
  listLocales(): LocaleDefinition[] { return [...this.locales.values()].sort((a, b) => a.code.localeCompare(b.code)); }

  registerCatalog(catalog: LocaleCatalog): LocaleCatalog {
    this.ensureLocale(catalog.locale);
    const existing = this.catalogs.get(catalog.locale);
    const merged = existing ? mergeCatalog(existing, catalog) : catalog;
    this.catalogs.set(catalog.locale, merged); return merged;
  }

  registerMessages(locale: string, messages: Record<string, unknown>, namespace = 'translation'): LocaleCatalog {
    const metadata = this.ensureLocale(locale); return this.registerCatalog(createCatalog(locale, messages, metadata.fallback, namespace));
  }

  registerExtension(registration: ExtensionCatalogRegistration): LocaleCatalog {
    if (!/^[a-zA-Z][\w-]*$/.test(registration.extensionId)) throw new Error('Extension identifiers must be stable, simple tokens.');
    const catalog = createCatalog(registration.locale, registration.entries, this.ensureLocale(registration.locale).fallback, registration.namespace);
    for (const entry of Object.values(catalog.namespaces[registration.namespace])) entry.metadata.owner = registration.owner ?? registration.extensionId;
    const owners = this.extensionOwners.get(registration.extensionId) ?? [];
    if (!owners.includes(registration.locale)) owners.push(registration.locale);
    this.extensionOwners.set(registration.extensionId, owners); return this.registerCatalog(catalog);
  }

  removeExtension(extensionId: string): void {
    const locales = this.extensionOwners.get(extensionId) ?? [];
    for (const locale of locales) {
      const catalog = this.catalogs.get(locale); if (!catalog) continue;
      for (const [namespace, entries] of Object.entries(catalog.namespaces)) {
        for (const [key, entry] of Object.entries(entries)) if (entry.metadata.owner === extensionId) delete catalog.namespaces[namespace][key];
      }
    }
    this.extensionOwners.delete(extensionId);
  }

  getCatalog(locale: string): LocaleCatalog | undefined { return this.catalogs.get(locale); }
  resolveCatalog(locale: string): LocaleCatalog | undefined {
    const direct = this.catalogs.get(locale); if (direct) return direct;
    const visited = new Set<string>(); let current = locale;
    while (!visited.has(current)) { visited.add(current); const definition = this.locales.get(current); if (!definition) return this.catalogs.get('en'); current = definition.fallback; const fallback = this.catalogs.get(current); if (fallback) return fallback; }
    return this.catalogs.get('en');
  }

  snapshot(): { locales: LocaleDefinition[]; catalogs: LocaleCatalog[] } { return { locales: this.listLocales(), catalogs: [...this.catalogs.values()] }; }
}
