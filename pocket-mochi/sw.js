/* Pocket Mochi — offline support. Serves the cached game instantly and
   refreshes the cache in the background, so updates land on the next launch. */
const CACHE = 'pocket-mochi-v4';
const SHELL = [
  './',
  'index.html',
  'css/style.css',
  'js/host.js',
  'js/audio.js',
  'js/art.js',
  'js/pet.js',
  'js/minigame.js',
  'js/main.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith('http')) return;
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    const hit = await cache.match(req, { ignoreSearch: true });
    const net = fetch(req)
      .then((res) => {
        if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
        return res;
      })
      .catch(() => hit);
    if (hit) {
      e.waitUntil(net);
      return hit;
    }
    return net;
  }));
});
