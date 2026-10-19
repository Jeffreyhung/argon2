'use strict';

/*
 * Service worker: makes the calculator work offline and installable.
 *
 * Everything the page needs is precached on install under a versioned cache
 * name. Requests are answered from the cache first and the network is only
 * used when nothing is cached. Whenever a cached response is served, a fresh
 * copy is fetched in the background and stored for the next visit
 * (stale-while-revalidate), so a new deploy is picked up on the next load.
 *
 * Bump CACHE whenever the list of precached files changes; old caches are
 * removed on activate.
 */

var CACHE = 'argon2-v1';

var PRECACHE = [
    './',
    'index.html',
    'css/app.css',
    'js/main.js',
    'js/worker.js',
    'js/argon2-hasher.js',
    'dist/argon2.js',
    'dist/argon2.wasm',
    'dist/argon2-simd.wasm',
    'manifest.json',
    'icon/android-chrome-192x192.png',
    'icon/android-chrome-512x512.png',
    'icon/apple-touch-icon.png',
    'icon/browserconfig.xml',
    'icon/favicon-16x16.png',
    'icon/favicon-32x32.png',
    'icon/favicon.ico',
    'icon/mstile-150x150.png',
    'icon/safari-pinned-tab.svg',
];

self.addEventListener('install', function (event) {
    event.waitUntil(
        caches.open(CACHE).then(function (cache) {
            return cache.addAll(PRECACHE);
        })
    );
});

self.addEventListener('activate', function (event) {
    event.waitUntil(
        caches.keys().then(function (keys) {
            return Promise.all(
                keys.filter(function (key) {
                    return key !== CACHE;
                }).map(function (key) {
                    return caches.delete(key);
                })
            );
        }).then(function () {
            return self.clients.claim();
        })
    );
});

function refresh(cache, request) {
    return fetch(request).then(function (response) {
        if (response && response.ok) {
            return cache.put(request, response.clone()).then(function () {
                return response;
            });
        }
        return response;
    });
}

self.addEventListener('fetch', function (event) {
    var request = event.request;
    if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) {
        return;
    }

    event.respondWith(
        caches.open(CACHE).then(function (cache) {
            return cache.match(request, { ignoreSearch: true }).then(function (cached) {
                if (cached) {
                    // Serve what we have now; update the copy for next time.
                    event.waitUntil(refresh(cache, request).catch(function () {}));
                    return cached;
                }
                return refresh(cache, request);
            });
        })
    );
});
