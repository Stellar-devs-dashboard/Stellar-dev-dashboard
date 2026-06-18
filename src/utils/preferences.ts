import type { SearchFilters } from '../lib/store';

const PREFERENCES_KEY = 'user-preferences';

export interface UserPreferences {
  compactMode: boolean;
  showAdvancedPanels: boolean;
  autoRefreshDashboard: boolean;
  defaultSearchScope: string;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  compactMode: false,
  showAdvancedPanels: true,
  autoRefreshDashboard: true,
  defaultSearchScope: 'all',
};

export function loadPreferences(): UserPreferences {
  try {
    const raw = localStorage.getItem(PREFERENCES_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<UserPreferences>) : {};
    return { ...DEFAULT_PREFERENCES, ...parsed };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function savePreferences(preferences: Partial<UserPreferences>): UserPreferences {
  const next = { ...DEFAULT_PREFERENCES, ...(preferences || {}) };
  localStorage.setItem(PREFERENCES_KEY, JSON.stringify(next));
  return next;
}

export function updatePreference<K extends keyof UserPreferences>(
  key: K,
  value: UserPreferences[K]
): UserPreferences {
  const current = loadPreferences();
  const next = { ...current, [key]: value };
  return savePreferences(next);
}
