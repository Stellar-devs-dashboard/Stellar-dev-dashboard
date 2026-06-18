/**
 * Offline detection and sync utilities
 */

import { enqueueOfflineOp, getOfflineQueue, dequeueOfflineOp, type OfflineOp } from '../lib/storage';
import { retryManager } from '../lib/errorHandling/RetryManager.ts';
import { createLogger } from './logger.ts';

const logger = createLogger('offline');

let isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
const listeners: Array<(online: boolean) => void> = [];
let _flushing = false;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const installPromptListeners: Array<(available: boolean) => void> = [];

export function captureInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    logger.info('Install prompt captured');
    notifyInstallPromptListeners(true);
  });

  window.addEventListener('appinstalled', () => {
    logger.info('App was installed');
    deferredPrompt = null;
    notifyInstallPromptListeners(false);
  });
}

export async function promptInstall(): Promise<void> {
  if (!deferredPrompt) return;
  await deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  logger.info(`User response to install prompt: ${outcome}`);
  deferredPrompt = null;
  notifyInstallPromptListeners(false);
}

export const subscribeToInstallPrompt = (callback: (available: boolean) => void): (() => void) => {
  installPromptListeners.push(callback);
  callback(!!deferredPrompt);
  return () => {
    const index = installPromptListeners.indexOf(callback);
    if (index >= 0) installPromptListeners.splice(index, 1);
  };
};

function notifyInstallPromptListeners(available: boolean): void {
  installPromptListeners.forEach((cb) => { try { cb(available); } catch { /* ignore */ } });
}

export async function registerServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  if (import.meta.env.BASE_URL !== '/') return;

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });
    logger.info('Service Worker registered with scope', { scope: registration.scope });

    if (registration.sync) {
      try {
        await registration.sync.register('sync-offline-queue');
        logger.info('Background sync registered');
      } catch (err) {
        logger.warn('Background sync registration failed:', err as Record<string, unknown>);
      }
    }
  } catch (error) {
    logger.error('Service Worker registration failed:', {}, error instanceof Error ? error : new Error(String(error)));
  }

  initOfflineDetection();
}

export function initOfflineDetection(): void {
  window.addEventListener('online', () => {
    isOnline = true;
    logger.info('Network online');
    notifyListeners(true);
    void flushOfflineQueue();
  });

  window.addEventListener('offline', () => {
    isOnline = false;
    logger.info('Network offline');
    notifyListeners(false);
  });
}

export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!('Notification' in window)) {
    logger.warn('Notifications not supported');
    return 'unsupported';
  }

  const permission = await Notification.requestPermission();
  logger.info(`Notification permission: ${permission}`);
  return permission;
}

export async function showTestNotification(): Promise<void> {
  if (Notification.permission !== 'granted') {
    const res = await requestNotificationPermission();
    if (res !== 'granted') return;
  }

  if ('serviceWorker' in navigator) {
    const reg = await navigator.serviceWorker.ready;
    reg.showNotification('Stellar Dev Dashboard', {
      body: 'Notifications are working! 🚀',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-72.png',
      tag: 'test-notification',
      vibrate: [100, 50, 100],
      data: {
        url: window.location.origin,
      },
    });
  }
}

export const getOnlineStatus = (): boolean => isOnline;

export const subscribeToOnlineStatus = (callback: (online: boolean) => void): (() => void) => {
  listeners.push(callback);
  return () => {
    const index = listeners.indexOf(callback);
    if (index >= 0) listeners.splice(index, 1);
  };
};

function notifyListeners(online: boolean): void {
  listeners.forEach((cb) => { try { cb(online); } catch { /* ignore */ } });
}

interface MemoryQueueEntry {
  id: string;
  fn: () => Promise<unknown>;
  label: string;
  priority: number;
}

const _memoryQueue = new Map<string, MemoryQueueEntry>();

export const queueRequest = async (
  id: string,
  fn: () => Promise<unknown>,
  label = '',
  priority = 0
): Promise<void> => {
  await enqueueOfflineOp({
    type: id,
    payload: { label, priority, serialised: fn.toString() },
  });

  _memoryQueue.set(id, { id, fn, label, priority });
  logger.info(`Queued offline op: ${id}`);
};

export const cancelQueuedRequest = (id: string): void => {
  _memoryQueue.delete(id);
};

export const getPendingRequests = (): MemoryQueueEntry[] => [..._memoryQueue.values()];

export const getPendingCount = async (): Promise<number> => {
  const queue = await getOfflineQueue();
  return queue.length;
};

export async function flushOfflineQueue(): Promise<void> {
  if (_flushing || !isOnline) return;
  _flushing = true;

  logger.info('Flushing offline queue…');

  const persisted = await getOfflineQueue();

  persisted.sort((a, b) => {
    const aPayload = (a.payload ?? {}) as { priority?: number };
    const bPayload = (b.payload ?? {}) as { priority?: number };
    if ((bPayload.priority ?? 0) !== (aPayload.priority ?? 0)) {
      return (bPayload.priority ?? 0) - (aPayload.priority ?? 0);
    }
    return (a.queuedAt ?? 0) - (b.queuedAt ?? 0);
  });

  for (const record of persisted) {
    const customId = record.type;
    const entry = _memoryQueue.get(customId);
    if (!entry || record.id == null) {
      if (record.id != null) await dequeueOfflineOp(record.id);
      continue;
    }

    try {
      await retryManager.executeWithRetry(entry.fn, {
        maxRetries: 3,
        baseDelay: 1000,
        onRetry: (attempt, err) => {
          logger.warn(`Retry ${attempt} for queued op "${entry.id}": ${err}`);
        },
      });

      _memoryQueue.delete(entry.id);
      await dequeueOfflineOp(record.id);
      logger.info(`Replayed offline op: ${entry.id}`);
    } catch (err) {
      logger.error(
        `Failed to replay offline op "${entry.id}" after retries`,
        {},
        err instanceof Error ? err : new Error(String(err))
      );
    }
  }

  _flushing = false;
}

export type { OfflineOp };
