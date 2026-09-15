/* ==========================================================================
   DV-MISSION APP - SERVICE WORKER (sw.js)
   Handles Offline Caching, Cross-Origin Assets, and PWA Installation
   ========================================================================== */

const DV_CACHE_NAME = 'dv-mission-cache-v2';
const DV_URLS_TO_CACHE = [
  './',
  './index.html',
  './styles.css',
  './api.js',
  './app.js',
  './manifest.json'
  // Note: Cross-origin icons are intentionally omitted here to prevent CORS installation crashes.
  // They are dynamically cached on the fly in the fetch event below.
];

// 1. INSTALL EVENT (Cache Core Local Assets)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(DV_CACHE_NAME)
      .then((cache) => {
        console.log('[DV SW] Caching core app assets for offline use.');
        return cache.addAll(DV_URLS_TO_CACHE);
      })
  );
  self.skipWaiting();
});

// 2. ACTIVATE EVENT (Clean up old caches)
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
    })
  );
  self.clients.claim();
});

// 3. FETCH EVENT (Dynamic Cross-Origin Caching)
self.addEventListener('fetch', (event) => {
  // STRICT RULE: Never cache POST requests (Protects GAS API)
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        // Return cached file if it exists
        if (cachedResponse) {
          return cachedResponse;
        }
        
        // Otherwise, fetch from the network dynamically
        return fetch(event.request).then((networkResponse) => {
          // Check if valid response OR an "opaque" response (Cross-Origin asset without CORS)
          if (!networkResponse || (networkResponse.status !== 200 && networkResponse.type !== 'opaque')) {
            return networkResponse;
          }

          // Clone the response and cache it for future offline use
          const responseToCache = networkResponse.clone();
          caches.open(DV_CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });

          return networkResponse;
        }).catch(() => {
          console.warn('[DV SW] Network fetch failed, asset not in cache:', event.request.url);
        });
      })
  );
});
