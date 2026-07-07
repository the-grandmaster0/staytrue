// ─────────────────────────────────────────────────────────────────────────────
// StayTrue Service Worker
// VitePWA injects self.__WB_MANIFEST here at build time (injectManifest strategy).
// Handles: precaching + cache-first fetch strategy.
// Push notifications have been removed in favour of email + in-app inbox.
// ─────────────────────────────────────────────────────────────────────────────

const CACHE = 'staytrue-v4';

// ── Install: precache VitePWA-injected assets ────────────────────────────────
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) => {
      const manifest = (self.__WB_MANIFEST || []).map((e) =>
        typeof e === 'string' ? e : e.url
      );
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

  if (request.method !== 'GET') return;

  // Never intercept navigation requests — let the browser fetch index.html normally
  if (request.mode === 'navigate') return;

  // Skip cross-origin requests (Supabase API, CDNs, etc.)
  if (!request.url.startsWith(self.location.origin)) return;

  // Skip Vite dev-server internals
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
