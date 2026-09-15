/* ==========================================================================
   DV-MISSION APP - SERVICE WORKER (sw.js)
   Handles Offline Caching and PWA Installation

   IMPORTANT: Bump DV_CACHE_VERSION on every deploy that changes any
   cached file (index.html, styles.css, api.js, app.js, manifest.json).
   ========================================================================== */

const DV_CACHE_VERSION = 'v1';
const DV_CACHE_NAME = 'dv-mission-cache-' + DV_CACHE_VERSION;

const DV_URLS_TO_CACHE = [
  './',
  './index.html',
  './styles.css',
  './api.js',
  './app.js',
  './manifest.json'
];

// Requests to these origins bypass the service worker entirely.
const DV_BYPASS_ORIGINS = [
  'script.google.com',
  'script.googleusercontent.com'
];

/* ==========================================================================
   INSTALL
   ========================================================================== */

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(DV_CACHE_NAME).then((cache) => {
      const tasks = DV_URLS_TO_CACHE.map((url) =>
        cache.add(url).catch((err) => {
          console.warn('[DV SW] Failed to cache', url, err && err.message);
        })
      );
      return Promise.all(tasks);
    })
  );
  self.skipWaiting();
});

/* ==========================================================================
   ACTIVATE
   ========================================================================== */

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== DV_CACHE_NAME) {
            console.log('[DV SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

/* ==========================================================================
   FETCH
   ========================================================================== */

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Never intercept non-GET requests (POST to GAS, etc.)
  if (request.method !== 'GET') {
    return;
  }

  // Never intercept requests to the GAS backend.
  if (DV_BYPASS_ORIGINS.indexOf(url.hostname) !== -1) {
    return;
  }

  // Navigations use network-first so new deploys are picked up.
  if (request.mode === 'navigate') {
    event.respondWith(dvNetworkFirstWithCacheFallback(request));
    return;
  }

  // Static assets use cache-first.
  event.respondWith(dvCacheFirstWithNetworkFallback(event, request));
});

/* ==========================================================================
   STRATEGIES
   ========================================================================== */

function dvNetworkFirstWithCacheFallback(request) {
  return fetch(request)
    .then((networkResponse) => {
      if (networkResponse && networkResponse.status === 200) {
        const responseToCache = networkResponse.clone();
        caches.open(DV_CACHE_NAME).then((cache) => {
          cache.put(request, responseToCache);
        });
      }
      return networkResponse;
    })
    .catch(() => {
      return caches.match(request).then((cached) => {
        if (cached) return cached;
        return caches.match('./index.html');
      });
    });
}

function dvCacheFirstWithNetworkFallback(event, request) {
  return caches.match(request).then((cachedResponse) => {
    if (cachedResponse) {
      return cachedResponse;
    }

    return fetch(request).then((networkResponse) => {
      const isCacheable =
        networkResponse &&
        (networkResponse.status === 200 || networkResponse.type === 'opaque');

      if (!isCacheable) {
        return networkResponse;
      }

      const responseToCache = networkResponse.clone();
      event.waitUntil(
        caches.open(DV_CACHE_NAME).then((cache) => {
          cache.put(request, responseToCache);
        })
      );

      return networkResponse;
    }).catch(() => {
      console.warn('[DV SW] Network fetch failed, asset not in cache:', request.url);
      return new Response('', { status: 504, statusText: 'Offline' });
    });
  });
}