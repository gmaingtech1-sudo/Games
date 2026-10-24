/* Magic Sword RPG — offline support. Serves the saved copy of the game
   instantly and refreshes it in the background, so updates show up the next
   time you open the game. Change CACHE when you add or rename files. */
const CACHE = 'magic-sword-rpg-v1';
const FILES = [
  './',
  'index.html',
  'css/style.css',
  'lib/phaser.min.js',
  'js/config.js',
  'js/data/weapons.js',
  'js/data/items.js',
  'js/data/enemies.js',
  'js/data/skills.js',
  'js/data/quests.js',
  'js/data/world.js',
  'js/state.js',
  'js/audio.js',
  'js/art.js',
  'js/ui.js',
  'js/scenes/BootScene.js',
  'js/scenes/MenuScene.js',
  'js/scenes/WorldScene.js',
  'js/scenes/HudScene.js',
  'js/scenes/BattleScene.js',
  'js/scenes/DialogScene.js',
  'js/scenes/PauseScene.js',
  'js/scenes/panels.js',
  'js/main.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
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
