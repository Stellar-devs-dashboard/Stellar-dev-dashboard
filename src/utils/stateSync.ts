/**
 * stateSync.js
 * Cross-tab state synchronization via BroadcastChannel.
 */

import { setStoredValue } from '../lib/storage';

const CHANNEL_NAME = 'stellar-dashboard-sync';
const STORAGE_CHANNEL_NAME = 'stellar-dashboard-storage-sync';
const SYNC_VERSION = 1;

const ALLOWED_KEYS = ['network', 'activeTab', 'connectedAddress', 'theme'] as const;
type AllowedKey = (typeof ALLOWED_KEYS)[number];

interface SyncStore {
  getState: () => Record<string, unknown>;
  setState: (partial: Record<string, unknown>) => void;
  subscribe: (
    listener: (state: Record<string, unknown>, prevState: Record<string, unknown>) => void
  ) => () => void;
}

let channel: BroadcastChannel | null = null;
let storageChannel: BroadcastChannel | null = null;
let storeRef: SyncStore | null = null;
let unsubscribe: (() => void) | null = null;
let _ignoreNextUpdate = false;
const storageListeners = new Set<(key: string, value: unknown) => void>();

function getStorageChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return null;
  if (storageChannel) return storageChannel;

  storageChannel = new BroadcastChannel(STORAGE_CHANNEL_NAME);
  storageChannel.onmessage = (event: MessageEvent<{ type?: string; key?: string; value?: unknown }>) => {
    const { type, key, value } = event.data || {};
    if (type !== 'STORAGE_UPDATE' || !key) return;
    storageListeners.forEach((callback) => {
      try {
        callback(key, value);
      } catch (err) {
        console.warn('[stateSync] Storage listener error:', err);
      }
    });
  };

  return storageChannel;
}

export async function syncState(key: string, value: unknown): Promise<void> {
  await setStoredValue(key, value);
  const ch = getStorageChannel();
  if (ch) ch.postMessage({ type: 'STORAGE_UPDATE', key, value });
}

export function onStateChange(callback: (key: string, value: unknown) => void): () => void {
  storageListeners.add(callback);
  getStorageChannel();
  return () => {
    storageListeners.delete(callback);
  };
}

export function resolveStateConflict<T>(local: T, incoming: unknown): T | unknown {
  if (incoming === null || incoming === undefined) return local;
  if (
    typeof local === 'object' &&
    local !== null &&
    typeof incoming === 'object' &&
    incoming !== null &&
    !Array.isArray(local) &&
    !Array.isArray(incoming)
  ) {
    return { ...(local as Record<string, unknown>), ...(incoming as Record<string, unknown>) };
  }
  return incoming;
}

function encodeState(state: Record<string, unknown>): Partial<Record<AllowedKey, unknown>> {
  return ALLOWED_KEYS.reduce<Partial<Record<AllowedKey, unknown>>>((acc, key) => {
    if (state[key] !== undefined) acc[key] = state[key];
    return acc;
  }, {});
}

function parseMessage(event: MessageEvent): Partial<Record<AllowedKey, unknown>> | null {
  try {
    const { version, type, payload } = event.data as {
      version?: number;
      type?: string;
      payload?: Record<string, unknown>;
    };
    if (version !== SYNC_VERSION) return null;
    if (type !== 'STATE_UPDATE') return null;
    if (!payload || typeof payload !== 'object') return null;
    const filtered: Partial<Record<AllowedKey, unknown>> = {};
    for (const key of ALLOWED_KEYS) {
      if (key in payload) filtered[key] = payload[key];
    }
    return filtered;
  } catch {
    return null;
  }
}

export function broadcastStateChange(partialState: Record<string, unknown>): void {
  if (!channel) return;
  const safePayload: Partial<Record<AllowedKey, unknown>> = {};
  for (const key of ALLOWED_KEYS) {
    if (key in partialState) safePayload[key] = partialState[key];
  }
  if (Object.keys(safePayload).length === 0) return;
  channel.postMessage({ version: SYNC_VERSION, type: 'STATE_UPDATE', payload: safePayload });
}

export function initStateSync(store: SyncStore): void {
  if (!('BroadcastChannel' in window)) {
    console.warn('[stateSync] BroadcastChannel not supported — cross-tab sync disabled.');
    return;
  }

  storeRef = store;
  channel = new BroadcastChannel(CHANNEL_NAME);

  channel.onmessage = (event) => {
    const payload = parseMessage(event);
    if (!payload) return;
    _ignoreNextUpdate = true;
    store.setState(payload);
    _ignoreNextUpdate = false;
  };

  channel.onmessageerror = (err) => {
    console.warn('[stateSync] Message error:', err);
  };

  unsubscribe = store.subscribe((state, prevState) => {
    if (_ignoreNextUpdate) return;
    const changed: Partial<Record<AllowedKey, unknown>> = {};
    for (const key of ALLOWED_KEYS) {
      if (state[key] !== prevState[key]) changed[key] = state[key];
    }
    if (Object.keys(changed).length > 0) broadcastStateChange(changed);
  });
}

export function destroyStateSync(): void {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  if (channel) {
    channel.close();
    channel = null;
  }
  storeRef = null;
}

const URL_FIELDS = ['network', 'activeTab', 'connectedAddress'] as const;

export function encodeSessionToHash(state: Record<string, unknown>): string {
  const payload: Record<string, unknown> = {};
  for (const key of URL_FIELDS) {
    if (state[key] !== undefined && state[key] !== null && state[key] !== '') {
      payload[key] = state[key];
    }
  }
  try {
    const json = JSON.stringify(payload);
    const encoded = btoa(unescape(encodeURIComponent(json)));
    return '#' + encoded;
  } catch {
    return '';
  }
}

export function decodeSessionFromHash(hash?: string): Record<string, unknown> | null {
  const raw = (hash || window.location.hash).replace(/^#/, '');
  if (!raw) return null;
  try {
    const json = decodeURIComponent(escape(atob(raw)));
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const safe: Record<string, unknown> = {};
    for (const key of URL_FIELDS) {
      if (key in parsed) safe[key] = parsed[key];
    }
    return Object.keys(safe).length ? safe : null;
  } catch {
    return null;
  }
}

export function buildShareableURL(state: Record<string, unknown>): string {
  const base = window.location.origin + window.location.pathname;
  return base + encodeSessionToHash(state);
}

export { encodeState as _encodeState };
