/* ==========================================================================
   DV-MISSION APP - SERVICE WORKER (sw.js)
   Handles Offline Caching, Cross-Origin Assets, and PWA Installation

   IMPORTANT: Bump DV_CACHE_VERSION on every deploy that changes any
   cached file (index.html, styles.css, api.js, app.js, manifest.json).
   If you don't bump it, users keep the old version from cache.
   ========================================================================== */

const DV_CACHE_VERSION = 'v2.1';
const DV_CACHE_NAME = 'dv-mission-cache-' + DV_CACHE_VERSION;

const DV_URLS_TO_CACHE = [
  './',
  './index.html',
  './styles.css',
  './api.js',
  './app.js',
  './manifest.json'
];

// Requests to this origin should never be cached or intercepted.
// Adjust if you host the GAS backend on a different hostname.
const DV_BYPASS_ORIGINS = [
  'script.google.com',
  'script.googleusercontent.com'
];

// 1. INSTALL EVENT — cache core local assets.
// Uses Promise.allSettled so one missing file doesn't kill the whole install.
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

// 2. ACTIVATE EVENT — remove old caches.
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

// 3. FETCH EVENT
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // RULE 1: Never intercept non-GET requests (POST to GAS, etc.).
  if (request.method !== 'GET') {
    return;
  }

  // RULE 2: Never intercept requests to the GAS backend or other bypassed origins.
  if (DV_BYPASS_ORIGINS.indexOf(url.hostname) !== -1) {
    return;
  }

  // RULE 3: Navigations (the HTML shell) use network-first.
  // This ensures a new deploy is picked up on the next app open,
  // while still working offline if the network is down.
  if (request.mode === 'navigate') {
    event.respondWith(dvNetworkFirstWithCacheFallback(request));
    return;
  }

  // RULE 4: Static assets (CSS, JS, images) use cache-first.
  event.respondWith(dvCacheFirstWithNetworkFallback(event, request));
});

/* ==========================================================================
   DV CACHE STRATEGIES
   ========================================================================== */

/**
 * Network-first: try to fetch fresh HTML. If the network fails,
 * fall back to the cached version. Keeps the app updatable without
 * breaking offline mode.
 */
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

/**
 * Cache-first: serve from cache immediately if we have it.
 * Otherwise fetch from network and store a copy for next time.
 */
function dvCacheFirstWithNetworkFallback(event, request) {
  return caches.match(request).then((cachedResponse) => {
    if (cachedResponse) {
      return cachedResponse;
    }

    return fetch(request).then((networkResponse) => {
      // Cache only valid or opaque cross-origin responses.
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
      // Return an empty 504 so the page doesn't hang waiting for a response.
      return new Response('', { status: 504, statusText: 'Offline' });
    });
  });
}