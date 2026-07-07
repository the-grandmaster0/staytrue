// public/sw.js — StayTrue Service Worker
// Handles Web Push notifications and notification click actions.
// Does NOT use workbox imports — the precache manifest is injected by VitePWA
// at build time via the injectManifest strategy, but we cache manually to avoid
// the missing workbox-precaching dependency.

// VitePWA injects self.__WB_MANIFEST at build time. We cache those assets.
const CACHE_NAME = 'staytrue-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // __WB_MANIFEST is injected by VitePWA at build time.
      // In dev (SW disabled) this won't run anyway.
      const manifest = self.__WB_MANIFEST || [];
      const urls = manifest.map((entry) =>
        typeof entry === 'string' ? entry : entry.url
      );
      // Precache all injected assets, ignoring failures for individual assets
      return Promise.allSettled(urls.map((url) => cache.add(url)));
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      // Clean up old caches
      caches.keys().then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
        )
      ),
    ])
  );
});

// ── Fetch: serve from cache, fall back to network ────────────────────────────
self.addEventListener('fetch', (event) => {
  // Only handle GET requests for same-origin or precached assets
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // Cache successful same-origin responses
        if (
          response.ok &&
          response.type === 'basic' &&
          event.request.url.startsWith(self.location.origin)
        ) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});

// ── Push event ────────────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: 'StayTrue', body: event.data.text(), url: '/' };
  }

  const title = data.title || 'StayTrue';
  const body  = data.body  || '';
  const url   = data.url   || '/';

  const options = {
    body,
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    tag: 'staytrue-' + url.replace(/\//g, '-'),
    renotify: true,
    requireInteraction: false,
    data: { url },
    actions: [
      { action: 'open',    title: 'Open' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// ── Notification click ────────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        // If there's already a window open on the right path, focus it
        for (const client of clients) {
          try {
            const clientPath = new URL(client.url).pathname;
            if (clientPath === targetUrl && 'focus' in client) {
              return client.focus();
            }
          } catch {
            // ignore malformed URLs
          }
        }
        // Otherwise open a new window
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});
