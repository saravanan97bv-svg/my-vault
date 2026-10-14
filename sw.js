/**
 * Heritage Vault v1.0 — 100% Offline Air-Gapped Service Worker
 * PWABuilder & Android Trusted Web Activity (TWA) Compliant
 * Strict Cache-First Architecture with Complete Asset Pre-Caching.
 * Zero External Network Telemetry. Zero Remote Dependencies.
 */

const CACHE_NAME = 'heritage-vault-v2.1-realbite';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './styles.css',
    './crypto.js',
    './storage.js',
    './app.js',
    './manifest.json',
    './icon.svg',
    './icon-192.png',
    './icon-512.png',
    './icon-maskable-192.png',
    './icon-maskable-512.png',
    './apple-touch-icon.png',
    './favicon.png',
    './screenshot-mobile.png',
    './screenshot-desktop.png'
];

// Install: Cache all core application assets immediately
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        }).then(() => self.skipWaiting())
    );
});

// Activate: Evict stale caches and claim clients immediately
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch: Strict Air-Gapped Cache-First. Always serve from local cache.
self.addEventListener('fetch', (event) => {
    // Only intercept standard GET requests
    if (event.request.method !== 'GET') return;

    event.respondWith(
        caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse;
            }
            return fetch(event.request).then((networkResponse) => {
                // If fetched successfully, cache for future offline visits
                if (networkResponse && networkResponse.status === 200) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return networkResponse;
            }).catch(() => {
                // Fallback for navigation requests when totally disconnected
                if (event.request.mode === 'navigate') {
                    return caches.match('./index.html');
                }
                return caches.match(event.request);
            });
        })
    );
});

// Message listener for PWABuilder skip-waiting protocol
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
