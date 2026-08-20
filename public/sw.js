const CACHE_NAME = 'zaura-v8';
const STATIC = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/api.js',
  '/js/core.js',
  '/js/vues-direction.js',
  '/js/vues-equipe.js',
  '/js/vues-membre.js',
  '/js/app.js',
  '/manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(STATIC)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.url.includes('/api/')) return;
  e.respondWith(
    fetch(e.request).then((r) => {
      if (r.ok) {
        const clone = r.clone();
        caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
      }
      return r;
    }).catch(() => caches.match(e.request))
  );
});
