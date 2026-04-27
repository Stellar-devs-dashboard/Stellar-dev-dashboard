import '@testing-library/jest-dom';
import { vi } from 'vitest';

// ─── localStorage mock ────────────────────────────────────────────────────────
const localStorageStore = {};
global.localStorage = {
  getItem: (k) => localStorageStore[k] ?? null,
  setItem: (k, v) => { localStorageStore[k] = String(v); },
  removeItem: (k) => { delete localStorageStore[k]; },
  clear: () => { Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k]); },
};

// ─── navigator.clipboard mock ─────────────────────────────────────────────────
Object.assign(navigator, {
  clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
});

// ─── Stellar SDK mock ─────────────────────────────────────────────────────────
vi.mock('@stellar/stellar-sdk', async () => {
  const actual = await vi.importActual('@stellar/stellar-sdk');
  return {
    ...actual,
    // Keep real SDK but allow individual tests to override
  };
});

// ─── Suppress noisy console output in tests ───────────────────────────────────
global.console.warn = vi.fn();
