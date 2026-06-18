import type { SearchFilters } from '../lib/store';

const SAVED_SEARCHES_KEY = 'saved-searches';

export interface SavedSearchEntry {
  name: string;
  query: string;
  filters: Partial<SearchFilters>;
  savedAt: string;
}

export function normalizeSearchText(value: unknown): string {
  return String(value || '').toLowerCase().trim();
}

export function scoreMatch(query: string, candidate: unknown): number {
  const q = normalizeSearchText(query);
  const c = normalizeSearchText(candidate);
  if (!q || !c) return 0;
  if (c === q) return 100;
  if (c.startsWith(q)) return 80;
  if (c.includes(q)) return 60;
  return 0;
}

export function globalSearch<T extends Record<string, unknown>>(
  items: T[],
  query: string,
  fields: string[] = []
): Array<T & { _score: number }> {
  const q = normalizeSearchText(query);
  if (!q) return [];

  return items
    .map((item) => {
      const max = fields.reduce((best, field) => {
        const value = field.split('.').reduce<unknown>((acc, part) => {
          if (acc && typeof acc === 'object' && part in (acc as Record<string, unknown>)) {
            return (acc as Record<string, unknown>)[part];
          }
          return undefined;
        }, item);
        return Math.max(best, scoreMatch(q, value));
      }, 0);
      return { ...item, _score: max };
    })
    .filter((item) => item._score > 0)
    .sort((a, b) => b._score - a._score);
}

export function loadSavedSearches(): SavedSearchEntry[] {
  try {
    const raw = localStorage.getItem(SAVED_SEARCHES_KEY);
    return raw ? (JSON.parse(raw) as SavedSearchEntry[]) : [];
  } catch {
    return [];
  }
}

export function saveSearch(
  name: string,
  query: string,
  filters: Partial<SearchFilters> = {}
): SavedSearchEntry[] {
  const normalizedName = String(name || '').trim();
  if (!normalizedName) return loadSavedSearches();

  const current = loadSavedSearches().filter((entry) => entry.name !== normalizedName);
  const next: SavedSearchEntry[] = [
    { name: normalizedName, query, filters, savedAt: new Date().toISOString() },
    ...current,
  ].slice(0, 20);
  localStorage.setItem(SAVED_SEARCHES_KEY, JSON.stringify(next));
  return next;
}

export function deleteSavedSearch(name: string): SavedSearchEntry[] {
  const next = loadSavedSearches().filter((entry) => entry.name !== name);
  localStorage.setItem(SAVED_SEARCHES_KEY, JSON.stringify(next));
  return next;
}
