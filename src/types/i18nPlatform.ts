export type TextDirection = 'ltr' | 'rtl';
export type PluralRule = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';
export type TranslationStatus = 'translated' | 'missing' | 'review' | 'invalid';
export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface LocaleDefinition {
  code: string;
  label: string;
  nativeLabel: string;
  direction: TextDirection;
  fallback: string;
  owner: string;
  pluralRules: PluralRule[];
}

export interface TranslationMetadata {
  description?: string;
  interpolation?: string[];
  maxLength?: number;
  allowHtml?: boolean;
  owner?: string;
  updatedAt?: string;
}

export interface CatalogEntry {
  key: string;
  value: string;
  metadata: TranslationMetadata;
}

export interface LocaleCatalog {
  format: 'stellar-locale-catalog';
  version: 1;
  locale: string;
  fallbackLocale: string;
  namespaces: Record<string, Record<string, CatalogEntry>>;
  updatedAt: string;
}

export interface CatalogIssue {
  code: 'missing' | 'unused' | 'malformed' | 'unsafe-html' | 'interpolation-mismatch' | 'layout-risk' | 'plural-mismatch';
  severity: ValidationSeverity;
  locale: string;
  key: string;
  message: string;
}

export interface CatalogValidationReport {
  locale: string;
  generatedAt: string;
  totalKeys: number;
  translatedKeys: number;
  coverage: number;
  issues: CatalogIssue[];
}

export interface CatalogImportResult {
  catalog?: LocaleCatalog;
  errors: string[];
  warnings: string[];
}

export interface ExtractionResult {
  keys: string[];
  dynamicCalls: Array<{ file: string; expression: string }>;
  filesScanned: number;
}

export interface LocaleFormatter {
  locale: string;
  amount(value: number | string, asset?: string, options?: Intl.NumberFormatOptions): string;
  number(value: number | string, options?: Intl.NumberFormatOptions): string;
  date(value: Date | string | number, options?: Intl.DateTimeFormatOptions): string;
  duration(seconds: number): string;
  list(values: string[], options?: { style?: 'long' | 'short' | 'narrow'; type?: 'conjunction' | 'disjunction' | 'unit' }): string;
  relativeTime(value: number, unit: Intl.RelativeTimeFormatUnit): string;
  text(value: string, direction?: TextDirection): string;
}

export interface ExtensionCatalogRegistration {
  extensionId: string;
  locale: string;
  namespace: string;
  entries: Record<string, string>;
  owner?: string;
}
