/* ParanormalADHDhunters — offline support. Serves the cached game instantly and
   refreshes the cache in the background, so updates land on the next launch.
   Fonts come from Google and are left to the browser's own cache. */
const CACHE = 'paranormaladhdhunters-v2';
const SHELL = [
  './',
  'index.html',
  'css/style.css',
  'vendor/three.module.min.js',
  'vendor/peerjs.min.js',
  'js/main.js',
  'js/util.js',
  'js/host.js',
  'js/data.js',
  'js/textures.js',
  'js/props.js',
  'js/house.js',
  'js/engine.js',
  'js/audio.js',
  'js/input.js',
  'js/player.js',
  'js/equipment.js',
  'js/ghost.js',
  'js/game.js',
  'js/avatars.js',
  'js/profile.js',
  'js/art.js',
  'js/ui.js',
  'js/net.js',
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
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    const hit = await cache.match(req, { ignoreSearch: true });
    const net = fetch(req)
      .then((res) => {
        if (res && res.ok) cache.put(req, res.clone());
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
