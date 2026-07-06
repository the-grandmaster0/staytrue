// public/sw.js — StayTrue Service Worker
// Handles Web Push notifications and click actions.
// NOTE: This file is the SOURCE for the injectManifest strategy.
// VitePWA will inject the precache manifest at build time.

import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';

// Injected by VitePWA at build time — DO NOT remove this line
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
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

  const { title = 'StayTrue', body = '', url = '/' } = data;

  const options = {
    body,
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    tag: 'staytrue-' + (url || '/').replace(/\//g, '-'),
    renotify: true,
    requireInteraction: false,
    data: { url },
    actions: [
      { action: 'open', title: 'Open' },
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
        for (const client of clients) {
          const clientUrl = new URL(client.url);
          if (clientUrl.pathname === targetUrl && 'focus' in client) {
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});
