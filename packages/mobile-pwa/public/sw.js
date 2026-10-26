/**
 * YTM-Connect — Mobile PWA Service Worker
 */
const CACHE_NAME = 'ytm-connect-pwa-v1';
const CORE_ASSETS = [
  '/__ytm_connect__/manifest.json',
  '/__ytm_connect__/overlay.css',
  '/__ytm_connect__/bridge.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/__ytm_connect__/')) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
  }
});
