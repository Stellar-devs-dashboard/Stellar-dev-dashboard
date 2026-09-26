/**
 * Stellar Dev Dashboard — Service Worker
 * Caches the app shell (HTML + static assets) for offline use.
 * Network-first for Horizon/Soroban API calls; cache-first for everything else.
 */

const CACHE_NAME = 'stellar-shell-v1';
const DOCS_CACHE_NAME = 'stellar-docs-v1';
const OUTBOX_DB_NAME = 'stellar-transaction-outbox';
const OUTBOX_DB_VERSION = 1;
const OUTBOX_STORE_NAME = 'transactions';
const OUTBOX_SYNC_TAG = 'stellar-transaction-outbox';
const OUTBOX_SUBMIT_LEASE_MS = 60_000;

// Assets that form the offline-capable app shell
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
];

// Critical documentation pages to cache for offline reference
const DOCS_ASSETS = [
  '/docs/getting-started',
  '/docs/api-reference',
  '/docs/soroban',
  '/docs/horizon',
  '/docs/transactions',
  '/docs/operations',
  '/docs/assets',
  '/docs/contracts',
  '/docs/offline',
  '/docs/security',
];

// URL prefixes that should NEVER be cached (live network data)
const NETWORK_ONLY_PREFIXES = [
  'https://horizon',
  'https://soroban',
  'https://friendbot',
  'https://api.coingecko',
  'https://api.stellar',
];

function isNetworkOnly(url) {
  return NETWORK_ONLY_PREFIXES.some((prefix) => url.startsWith(prefix));
}

// Check if URL is a documentation page
function isDocsUrl(url) {
  return url.includes('/docs/') || DOCS_ASSETS.some((doc) => url.includes(doc));
}

// ─── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)),
      caches.open(DOCS_CACHE_NAME).then((cache) => cache.addAll(DOCS_ASSETS)),
    ]).then(() => self.skipWaiting()) // activate immediately
  );
});

// ─── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME && key !== DOCS_CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ─── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = request.url;

  // Only handle GET requests
  if (request.method !== 'GET') return;

  // Skip cross-origin requests that aren't part of the shell or docs
  if (!url.startsWith(self.location.origin) && !isNetworkOnly(url)) {
    return;
  }

  // Network-only: Horizon / Soroban / price APIs — never cache these
  if (isNetworkOnly(url)) {
    event.respondWith(fetch(request));
    return;
  }

  // App shell & static assets: cache-first, fallback to network then offline page
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request)
        .then((response) => {
          // Cache successful same-origin responses
          if (
            response.ok &&
            (url.startsWith(self.location.origin) ||
              url.startsWith('https://fonts.'))
          ) {
            const clone = response.clone();
            // Cache docs in docs cache, everything else in shell cache
            const cacheName = isDocsUrl(url) ? DOCS_CACHE_NAME : CACHE_NAME;
            caches.open(cacheName).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          // Offline fallback: serve index.html for navigation requests
          if (request.mode === 'navigate') {
            return caches.match('/index.html');
          }
          // Try to serve from docs cache for documentation pages
          if (isDocsUrl(url)) {
            return caches.open(DOCS_CACHE_NAME).then((cache) => cache.match(request));
          }
        });
    })
  );
});

// ─── Background Sync ─────────────────────────────────────────────────────────

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-offline-queue') {
    console.log('Background sync triggered: sync-offline-queue');
    // In a real app, you'd call a function here to flush the IndexedDB queue
    // but since the SW doesn't have easy access to the same JS modules as the
    // client, we often rely on the client to flush when it wakes up, or
    // implement the flush logic here using IDB directly.
    event.waitUntil(Promise.resolve());
  }

  if (event.tag === OUTBOX_SYNC_TAG) {
    event.waitUntil(flushTransactionOutbox());
  }
});

function openOutboxDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OUTBOX_DB_NAME, OUTBOX_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OUTBOX_STORE_NAME)) {
        const store = db.createObjectStore(OUTBOX_STORE_NAME, { keyPath: 'id' });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function listOutboxItems() {
  const db = await openOutboxDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(OUTBOX_STORE_NAME, 'readonly');
    const request = transaction.objectStore(OUTBOX_STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function putOutboxItem(item) {
  const db = await openOutboxDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(OUTBOX_STORE_NAME, 'readwrite');
    transaction.objectStore(OUTBOX_STORE_NAME).put(item);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

async function claimOutboxItem(id) {
  const db = await openOutboxDatabase();
  const now = Date.now();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(OUTBOX_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(OUTBOX_STORE_NAME);
    const request = store.get(id);
    let claimed;

    request.onsuccess = () => {
      const item = request.result;
      if (!item) return;

      if (item.expiresAt !== null && item.expiresAt <= now) {
        store.put({
          ...item,
          status: 'expired',
          updatedAt: now,
          submitLeaseUntil: undefined,
          error: 'The transaction time bound has passed and it can no longer be submitted.',
        });
        return;
      }

      const stale =
        item.status === 'submitting' && (item.submitLeaseUntil || 0) <= now;
      if (item.status !== 'queued' && !stale) return;

      claimed = {
        ...item,
        status: 'submitting',
        attempts: item.attempts + 1,
        updatedAt: now,
        submitLeaseUntil: now + OUTBOX_SUBMIT_LEASE_MS,
        error: undefined,
      };
      store.put(claimed);
    };

    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => resolve(claimed);
    transaction.onerror = () => reject(transaction.error);
  });
}

async function notifyOutboxClients() {
  const windowClients = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true,
  });
  windowClients.forEach((client) => {
    client.postMessage({ type: 'TRANSACTION_OUTBOX_CHANGED' });
  });
}

async function submitOutboxItem(id) {
  const item = await claimOutboxItem(id);
  if (!item) return;
  await notifyOutboxClients();

  try {
    const isSoroban = item.submissionKind === 'soroban';
    const endpoint = isSoroban
      ? item.rpcUrl
      : `${item.horizonUrl.replace(/\/$/, '')}/transactions`;
    if (!endpoint) throw new Error('No submission endpoint is configured');

    const response = await fetch(
      endpoint,
      isSoroban
        ? {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: item.id,
              method: 'sendTransaction',
              params: { transaction: item.xdr },
            }),
          }
        : {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ tx: item.xdr }).toString(),
          },
    );
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      const error = new Error(
        body?.extras?.result_codes?.transaction ||
          body?.detail ||
          `Horizon returned HTTP ${response.status}`,
      );
      error.status = response.status;
      throw error;
    }

    if (body.error || body.result?.status === 'ERROR') {
      const error = new Error(
        body.error?.message ||
          body.result?.errorResult ||
          'Soroban RPC rejected the transaction',
      );
      error.status = 400;
      throw error;
    }

    const result = isSoroban ? body.result || {} : body;
    await putOutboxItem({
      ...item,
      status: 'confirmed',
      updatedAt: Date.now(),
      submitLeaseUntil: undefined,
      hash: result.hash,
      ledger: result.ledger ?? result.latestLedger,
      successful: result.successful ?? true,
      error: undefined,
    });
  } catch (error) {
    const status = error?.status;
    const retryable =
      status === undefined || status === 408 || status === 429 || status >= 500;
    await putOutboxItem({
      ...item,
      status: retryable ? 'queued' : 'failed',
      updatedAt: Date.now(),
      submitLeaseUntil: undefined,
      error: error instanceof Error ? error.message : String(error),
    });
    if (retryable) throw error;
  } finally {
    await notifyOutboxClients();
  }
}

async function flushTransactionOutbox() {
  const items = await listOutboxItems();
  const eligible = items.filter(
    (item) =>
      item.status === 'queued' ||
      (item.status === 'submitting' && (item.submitLeaseUntil || 0) <= Date.now()),
  );
  const results = await Promise.allSettled(
    eligible.map((item) => submitOutboxItem(item.id)),
  );
  const rejected = results.find((result) => result.status === 'rejected');
  if (rejected) {
    throw rejected.reason;
  }
}

// ─── Push Notifications ───────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  let data = { title: 'Stellar Dev Dashboard', body: 'New update available!' };

  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/'
    }
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const urlToOpen = event.notification.data.url;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // If a window is already open, focus it
      for (const client of windowClients) {
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

// ─── Message Handling ───────────────────────────────────────────────────────

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
