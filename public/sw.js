// ─────────────────────────────────────────────────────────────────────────────
// StayTrue Service Worker
// VitePWA injects self.__WB_MANIFEST here at build time (injectManifest strategy).
// Handles: precaching, push notifications, notification clicks.
// No external imports — zero dependencies.
// ─────────────────────────────────────────────────────────────────────────────

const CACHE = 'staytrue-v2';

// ── Install: precache VitePWA-injected assets ────────────────────────────────
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) => {
      const manifest = (self.__WB_MANIFEST || []).map((e) =>
        typeof e === 'string' ? e : e.url
      );
      // Cache each asset individually; ignore individual failures
      return Promise.allSettled(manifest.map((url) => cache.add(url)));
    })
  );
});

// ── Activate: claim clients + delete old caches ──────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ── Fetch: cache-first for static assets only ────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET
  if (request.method !== 'GET') return;

  // Never intercept navigation requests (HTML / React routes) — let the
  // browser fetch the shell index.html from the network as normal.
  if (request.mode === 'navigate') return;

  // Don't intercept cross-origin requests (Supabase API, CDNs, etc.)
  if (!request.url.startsWith(self.location.origin)) return;

  // Don't intercept Vite dev-server internals
  if (request.url.includes('__vite') || request.url.includes('/@')) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((res) => {
        if (res.ok && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(request, clone));
        }
        return res;
      });
    })
  );
});

// ── Push: display OS notification ────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'StayTrue', body: event.data.text(), url: '/dashboard' };
  }

  const title = String(payload.title || 'StayTrue');
  const body  = String(payload.body  || '');
  const url   = String(payload.url   || '/dashboard');

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon:               '/icons/icon-192.svg',
      badge:              '/icons/icon-192.svg',
      tag:                'staytrue-push',
      renotify:           true,
      requireInteraction: false,
      data:               { url },
    })
  );
});

// ── Notification click: focus or open the app ────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = (event.notification.data && event.notification.data.url) || '/dashboard';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        // Focus an existing tab if one is open
        for (const client of clients) {
          if ('focus' in client) {
            client.postMessage({ type: 'NAVIGATE', url: targetUrl });
            return client.focus();
          }
        }
        // Otherwise open a new tab
        return self.clients.openWindow(targetUrl);
      })
  );
});
