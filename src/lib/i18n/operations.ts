import type { CatalogIssue, LocaleCatalog } from '../../types/i18nPlatform';
import { entriesFor } from './catalog';

export interface TranslationOperation { id: string; labelKey?: string; descriptionKey?: string; errorKeys?: string[]; extensionId?: string; }
export interface OperationTranslationAudit { operationId: string; missing: string[]; issues: CatalogIssue[]; }

export function auditOperationTranslations(operations: TranslationOperation[], catalog: LocaleCatalog): OperationTranslationAudit[] {
  const available = new Set(entriesFor(catalog).map(item => item.key));
  return operations.map(operation => {
    const keys = [operation.labelKey, operation.descriptionKey, ...(operation.errorKeys ?? [])].filter((key): key is string => Boolean(key));
    const missing = keys.filter(key => !available.has(key.includes(':') ? key : `translation:${key}`));
    return { operationId: operation.id, missing, issues: missing.map(key => ({ code: 'missing', severity: 'error', locale: catalog.locale, key, message: `Operation ${operation.id} references an unavailable translation.` })) };
  });
}

export function localizedOperation<T extends TranslationOperation>(operation: T, translate: (key: string) => string): T & { label: string; description?: string } {
  return { ...operation, label: operation.labelKey ? translate(operation.labelKey) : operation.id, description: operation.descriptionKey ? translate(operation.descriptionKey) : undefined };
}
