// src/utils/accessibility.js
import { TRANSACTION_TEMPLATES } from "../lib/transactionTemplates";
import { getCachedUserTransactionTemplates } from "../lib/transactionTemplateVault.ts";
let listeners: Array<(message: string, politeness: 'polite' | 'assertive') => void> = [];

/**
 * Trigger an announcement via the ScreenReaderAnnouncer component.
 * @param {string} message The text to be read by the screen reader.
 */
export const announceToScreenReader = (
  message: string,
  politeness: 'polite' | 'assertive' = 'assertive'
) => {
  listeners.forEach((listener) => listener(message, politeness));
};

/**
 * Subscribe a component to announcements.
 * Use internally by the ScreenReaderAnnouncer.
 * @param {function} listener Callback to execute on new message.
 * @returns {function} Unsubscribe function.
 */
export const subscribeToAnnouncements = (
  listener: (message: string, politeness: 'polite' | 'assertive') => void
) => {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
};

/**
 * Set focus to a specific element safely.
 * Useful for focusing main content areas after routing, or returning focus
 * to a trigger button after a modal closes.
 * @param {string|HTMLElement} elementOrId Ensure it has tabindex="-1" or is natively focusable.
 */
export const setFocus = (elementOrId: string | HTMLElement) => {
  if (!elementOrId) return;

  const el =
    typeof elementOrId === "string"
      ? document.getElementById(elementOrId)
      : elementOrId;

  if (el) {
    el.focus();
  }
};

/**
 * Keyboard shortcut registry
 */
let shortcutHandlers = new Map<string, ShortcutHandlerData[]>();
let globalKeyboardListener: ((event: KeyboardEvent) => void) | null = null;

interface ShortcutHandlerData {
  handler: (event: KeyboardEvent) => void;
  description: string;
  category: string;
  id: string;
}

/**
 * Register a keyboard shortcut
 * @param {string} key - Key combination (e.g., 'ctrl+k', 'cmd+/', 'shift+?')
 * @param {function} handler - Callback function
 * @param {object} options - Options like description, category
 * @returns {function} Unregister function
 */
export const registerShortcut = (
  key: string,
  handler: (event: KeyboardEvent) => void,
  options: { description?: string; category?: string; id?: string } = {}
) => {
  const normalizedKey = normalizeShortcut(key);

  if (!shortcutHandlers.has(normalizedKey)) {
    shortcutHandlers.set(normalizedKey, []);
  }

  const handlerData = {
    handler,
    description: options.description || "",
    category: options.category || "general",
    id: options.id || `shortcut-${Date.now()}-${Math.random()}`,
  };

  shortcutHandlers.get(normalizedKey).push(handlerData);

  // Initialize global listener if not already done
  if (!globalKeyboardListener) {
    initializeGlobalKeyboardListener();
  }

  // Return unregister function
  return () => {
    const handlers = shortcutHandlers.get(normalizedKey);
    if (handlers) {
      const index = handlers.findIndex((h) => h.id === handlerData.id);
      if (index > -1) {
        handlers.splice(index, 1);
      }
      if (handlers.length === 0) {
        shortcutHandlers.delete(normalizedKey);
      }
    }
  };
};

/**
 * Normalize keyboard shortcut string
 * @param {string} key - Raw key combination
 * @returns {string} Normalized key
 */
function normalizeShortcut(key: string): string {
  const parts = key
    .toLowerCase()
    .split("+")
    .map((p) => p.trim());
  const modifiers: string[] = [];
  let mainKey = "";

  parts.forEach((part) => {
    if (["ctrl", "control", "cmd", "meta", "alt", "shift"].includes(part)) {
      let normalized = part;
      if (normalized === "cmd") normalized = "meta";
      if (normalized === "control") normalized = "ctrl";
      modifiers.push(normalized);
    } else {
      mainKey = part;
    }
  });

  // Sort modifiers for consistency
  modifiers.sort();

  return [...modifiers, mainKey].join("+");
}

/**
 * Check if event matches shortcut
 * @param {KeyboardEvent} event
 * @param {string} shortcut
 * @returns {boolean}
 */
function matchesShortcut(event: KeyboardEvent, shortcut: string): boolean {
  const parts = shortcut.split("+");
  const mainKey = parts[parts.length - 1];
  const modifiers = parts.slice(0, -1);

  // Check main key
  if (
    event.key.toLowerCase() !== mainKey &&
    event.code.toLowerCase() !== mainKey
  ) {
    return false;
  }

  // Check modifiers
  const hasCtrl = modifiers.includes("ctrl");
  const hasMeta = modifiers.includes("meta");
  const hasAlt = modifiers.includes("alt");
  const hasShift = modifiers.includes("shift");

  return (
    event.ctrlKey === hasCtrl &&
    event.metaKey === hasMeta &&
    event.altKey === hasAlt &&
    event.shiftKey === hasShift
  );
}

/**
 * Initialize global keyboard event listener
 */
function initializeGlobalKeyboardListener() {
  if (globalKeyboardListener) return;

  globalKeyboardListener = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable)
    ) {
      // Allow some shortcuts even in inputs (like Escape)
      if (event.key !== "Escape") {
        return;
      }
    }

    // Check all registered shortcuts
    for (const [shortcut, handlers] of shortcutHandlers.entries()) {
      if (matchesShortcut(event, shortcut)) {
        event.preventDefault();
        event.stopPropagation();

        // Execute all handlers for this shortcut
        handlers.forEach(({ handler }) => {
          try {
            handler(event);
          } catch (error) {
            console.error("Shortcut handler error:", error);
          }
        });

        break;
      }
    }
  };

  document.addEventListener("keydown", globalKeyboardListener);
}

/**
 * Get all registered shortcuts
 * @returns {Array} List of shortcuts with metadata
 */
export const getAllShortcuts = () => {
  const shortcuts = [];

  for (const [key, handlers] of shortcutHandlers.entries()) {
    handlers.forEach((handler) => {
      shortcuts.push({
        key,
        ...handler,
      });
    });
  }

  return shortcuts;
};

/**
 * Unregister all shortcuts
 */
export const clearAllShortcuts = () => {
  shortcutHandlers.clear();

  if (globalKeyboardListener) {
    document.removeEventListener("keydown", globalKeyboardListener);
    globalKeyboardListener = null;
  }
};

/**
 * Transaction template storage
 */

/**
 * Get all transaction templates (built-ins + any unlocked user templates).
 *
 * Note: user templates are stored encrypted in IndexedDB and are only
 * available here after the user unlocks them in the UI (cached in-memory).
 *
 * @returns {object} Templates keyed by id
 */
export const getTransactionTemplates = (): Record<string, Record<string, unknown>> => {
  const builtIns = TRANSACTION_TEMPLATES.map((t) => ({
    ...t,
    label: t.label,
  }));
  const user = getCachedUserTransactionTemplates();
  const all = [...user, ...builtIns];
  const byId: Record<string, Record<string, unknown>> = {};
  all.forEach((t) => {
    if (!t?.id) return;
    byId[t.id] = t as Record<string, unknown>;
  });
  return byId;
};

/**
 * Get single transaction template
 * @param {string} id - Template ID
 * @returns {object|null} Template data
 */
export const getTransactionTemplate = (id: string): Record<string, unknown> | null => {
  const templates = getTransactionTemplates();
  return templates[id] || null;
};

// NOTE: CRUD operations live in src/lib/transactionTemplateVault.ts (encrypted).

/**
 * Recent accounts storage
 */
const RECENT_ACCOUNTS_KEY = "stellar_recent_accounts";
const MAX_RECENT_ACCOUNTS = 10;

/**
 * Add account to recent list
 * @param {string} publicKey - Account public key
 * @param {object} metadata - Optional metadata
 */
export const addRecentAccount = (
  publicKey: string,
  metadata: Record<string, unknown> = {}
) => {
  const recent = getRecentAccounts();

  // Remove if already exists
  const filtered = recent.filter((acc) => acc.publicKey !== publicKey);

  // Add to front
  filtered.unshift({
    publicKey,
    ...metadata,
    lastAccessed: new Date().toISOString(),
  });

  // Keep only MAX_RECENT_ACCOUNTS
  const trimmed = filtered.slice(0, MAX_RECENT_ACCOUNTS);

  localStorage.setItem(RECENT_ACCOUNTS_KEY, JSON.stringify(trimmed));
};

export interface RecentAccount {
  publicKey: string;
  lastAccessed?: string;
}

/**
 * Get recent accounts
 * @returns {Array} Recent accounts
 */
export const getRecentAccounts = (): RecentAccount[] => {
  try {
    const stored = localStorage.getItem(RECENT_ACCOUNTS_KEY);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is RecentAccount =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as RecentAccount).publicKey === 'string'
    );
  } catch {
    return [];
  }
};

/**
 * Clear recent accounts
 */
export const clearRecentAccounts = () => {
  localStorage.removeItem(RECENT_ACCOUNTS_KEY);
};
