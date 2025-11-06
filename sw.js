/**
 * BioSynCare Lab - Service Worker
 *
 * Provides offline support, caching, and background sync
 * for the neurosensory audio application.
 *
 * Features:
 * - Static asset caching
 * - Runtime caching for dynamic content
 * - Offline fallback
 * - Cache versioning and cleanup
 * - Background sync for analytics
 */

const CACHE_VERSION = 'v1.0.0';
const CACHE_NAME = `biosyncare-${CACHE_VERSION}`;
const RUNTIME_CACHE = `biosyncare-runtime-${CACHE_VERSION}`;

// Static assets to cache on install
// Keep minimal - other assets cached on first access
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
];

// Assets to cache at runtime (on first access)
const RUNTIME_CACHE_URLS = [
  '/src/',
  '/icons/',
];

// Network-first resources (always try network, fallback to cache)
const NETWORK_FIRST = [
  '/api/',
  'firestore.googleapis.com',
  'firebase.googleapis.com',
];

/**
 * Install event - cache static assets
 */
self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Install event', CACHE_VERSION);

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[ServiceWorker] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting()) // Activate immediately
  );
});

/**
 * Activate event - clean up old caches
 */
self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activate event', CACHE_VERSION);

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((cacheName) => {
              // Delete old versions of our cache
              return cacheName.startsWith('biosyncare-') && cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE;
            })
            .map((cacheName) => {
              console.log('[ServiceWorker] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            })
        );
      })
      .then(() => self.clients.claim()) // Take control immediately
  );
});

/**
 * Fetch event - serve from cache, fallback to network
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip chrome-extension and other non-http(s) requests
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // Network-first strategy for API calls and Firebase
  if (NETWORK_FIRST.some((pattern) => url.href.includes(pattern))) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Cache-first strategy for static assets
  event.respondWith(cacheFirst(request));
});

/**
 * Cache-first strategy
 * Try cache first, fallback to network, then cache the response
 */
async function cacheFirst(request) {
  try {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    const networkResponse = await fetch(request);

    // Cache successful responses
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    console.warn('[ServiceWorker] Fetch failed, serving offline fallback', error);

    // Return offline fallback for navigation requests
    if (request.destination === 'document') {
      const cache = await caches.open(CACHE_NAME);
      return cache.match('/index.html');
    }

    // For other requests, return a generic error response
    return new Response('Offline - content not available', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: new Headers({
        'Content-Type': 'text/plain',
      }),
    });
  }
}

/**
 * Network-first strategy
 * Try network first, fallback to cache
 */
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);

    // Cache successful responses
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    console.warn('[ServiceWorker] Network fetch failed, trying cache', error);

    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    // Return error response if not in cache
    return new Response('Network error and no cached version available', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: new Headers({
        'Content-Type': 'text/plain',
      }),
    });
  }
}

/**
 * Message event - handle commands from clients
 */
self.addEventListener('message', (event) => {
  const { type, payload } = event.data || {};

  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;

    case 'CLEAR_CACHE':
      event.waitUntil(
        caches.keys()
          .then((cacheNames) => {
            return Promise.all(
              cacheNames.map((cacheName) => caches.delete(cacheName))
            );
          })
          .then(() => {
            event.ports[0].postMessage({ success: true });
          })
      );
      break;

    case 'CACHE_URLS':
      if (payload && Array.isArray(payload.urls)) {
        event.waitUntil(
          caches.open(RUNTIME_CACHE)
            .then((cache) => cache.addAll(payload.urls))
            .then(() => {
              event.ports[0].postMessage({ success: true });
            })
        );
      }
      break;

    default:
      console.log('[ServiceWorker] Unknown message type:', type);
  }
});

/**
 * Background sync event - sync data when online
 */
self.addEventListener('sync', (event) => {
  console.log('[ServiceWorker] Background sync:', event.tag);

  if (event.tag === 'sync-analytics') {
    event.waitUntil(syncAnalytics());
  }
});

/**
 * Sync analytics data when connection is restored
 */
async function syncAnalytics() {
  try {
    // Placeholder for analytics sync
    // In a real implementation, this would send queued analytics events
    console.log('[ServiceWorker] Syncing analytics data');
    return Promise.resolve();
  } catch (error) {
    console.error('[ServiceWorker] Analytics sync failed', error);
    throw error; // Re-throw to retry later
  }
}

/**
 * Push event - handle push notifications
 */
self.addEventListener('push', (event) => {
  const options = {
    body: event.data ? event.data.text() : 'New notification from BioSynCare',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    vibrate: [200, 100, 200],
    tag: 'biosyncare-notification',
    requireInteraction: false,
  };

  event.waitUntil(
    self.registration.showNotification('BioSynCare Lab', options)
  );
});

/**
 * Notification click event
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Focus existing window if available
        for (const client of clientList) {
          if (client.url === '/' && 'focus' in client) {
            return client.focus();
          }
        }
        // Open new window if none found
        if (clients.openWindow) {
          return clients.openWindow('/');
        }
      })
  );
});
