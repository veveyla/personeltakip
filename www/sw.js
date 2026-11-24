const CACHE_NAME = 'personeltakip-v1.1';
const APP_SHELL = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './html5-qrcode.min.js',
    './logo.png',
    './manifest.json'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
            )
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;

    event.respondWith(
        caches.match(req).then((cached) => {
            if (cached) return cached;
            return fetch(req).then((resp) => {
                if (resp && resp.status === 200) {
                    const clone = resp.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
                }
                return resp;
            }).catch(() => caches.match('./index.html'));
        })
    );
});
