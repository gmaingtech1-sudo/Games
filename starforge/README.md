# Starforge

A space shooter for phones. Build your own starfighter in the hangar by choosing its hull, wings, engine, weapon and special, and painting it how you like. Then fly it through sector after sector of enemy waves and bosses. Every run earns credits to spend on new parts and upgrades.

It's plain HTML, CSS and JavaScript. There's no build step and nothing to install. Ships, enemies, explosions, sound effects and music are all drawn or synthesised in code, so the only image files are the app icons. After the first visit it also works offline.

## Playing

### Flying

| Action | Touch | Keyboard / mouse |
| --- | --- | --- |
| Move | Drag anywhere on the screen. The ship follows your finger's movement, so your finger never covers it | Move the mouse, or use the arrow keys / WASD |
| Shoot | Automatic | Automatic |
| Special | Tap the round button once its ring is full | Space (or X, E, Shift) |
| Pause | The pause button | Esc or P |

The glowing dot in the middle of your ship is your hitbox. Only that dot has to dodge bullets. Your **shield** takes damage first and recharges after a few seconds without a hit. **Hull** damage only comes back from repair pickups and a small patch-up at the end of each sector. When the hull runs out, the run is over. You keep every credit you picked up.

Pickups:

- **Gold hexagons** are credits. Your tractor beam pulls them in when you fly close.
- **P** raises your weapon power by one level, up to 5. More power means more streams, wider spreads, heavier slugs or a thicker beam. Gunships always drop one.
- **Green cross** repairs 30% of your hull.

Destroying enemies in quick succession builds a chain that multiplies your score by up to ×5. A hit on your hull breaks the chain.

### Sectors and bosses

Each sector has six waves and then a boss:

| Boss | What it does |
| --- | --- |
| Dreadnought | A wide battleship with two turrets you can shoot off. It fires fans of bullets, then spirals and rings as it breaks up. |
| Hive Queen | Pulses out rings of bullets and launches drones from its pods. |
| The Warden | Spins arms that spray spiral streams, and fires sweeping lasers. The glowing line shows where a laser is about to fire. |

Beating a boss drops a shower of credits and a sector bonus. Then you warp to the next sector, where enemies have more armour, shoot faster and hit harder. The game carries on until your ship is destroyed.

The enemies you'll meet: drones in formation, swoopers that fly curved paths, chargers that flash and then ram you, gunships, snipers (watch for their aiming line), mines that blow up when you get close, and asteroids that split apart.

### The hangar

Tap any part to try it on. If you don't own it yet, the preview shows it on your ship, the stat bars show what it would change in green and red, and the ship test-fires your weapon so you can see how it shoots. **Buy** fits the part straight away. Tap the ship's name to rename it.

| | Free | For credits |
| --- | --- | --- |
| **Hull** | Sparrow: all-rounder | Dart (600): fast, tiny hitbox, fragile. Manta (1,200): built-in side cannons. Bastion (1,800): heavy armour and shields, slow. Wraith (2,600): +20% damage. |
| **Wings** | Swept | Delta (400): +25 armour. Forward-swept (500): +10% speed. Twin Pods (900): extra wingtip guns. Blades (1,100): +15% fire rate. Halo Ring (1,500): +30 shield, faster recharge. |
| **Engine** | Ion Drive | Afterburner (500): +15% speed. Fusion Core (900): +25 shield, faster recharge. Quantum Coil (1,400): special charges 35% faster. |
| **Weapon** | Pulse Blaster: rapid bolts | Scatter Cannon (700): shotgun spread. Railgun (1,300): slugs that pierce every ship in a line. Plasma Beam (1,800): a continuous beam. Arc Caster (2,200): chain lightning that aims itself, short range. |
| **Special** | Nova Bomb: clears bullets and hurts everything | Seeker Swarm (600): 14 homing missiles. Aegis Shield (1,000): 6 s invincibility bubble. Overdrive (1,400): double fire rate at max power. Wing Drones (1,900): two helper drones. |
| **Paint** | 12 body colours, 12 trim colours, 9 energy colours (engines, cockpit and your shots), 8 decals | Finishes: Metallic (250), Chrome (700), Gold (1,500), Holo (2,500) |

**Upgrades** apply whatever parts you fit: armour, shield, weapon damage, thrusters, special charge rate and tractor beam range. Each has five levels (150, 300, 550, 900 and 1,400 credits).

## Putting it on your phone

The game has to be served over HTTPS for offline play and "Add to Home Screen" to work. The simplest way is GitHub Pages:

1. In the repository on GitHub, open **Settings → Pages**.
2. Under **Build and deployment**, pick **Deploy from a branch**, choose the branch that has this folder and `/ (root)`, then **Save**.
3. After a minute, open `https://<your-user>.github.io/<repo>/starforge/` on your phone.
4. Add it to your home screen:
   - **iPhone (Safari):** Share button → **Add to Home Screen**.
   - **Android (Chrome):** ⋮ menu → **Add to Home screen** / **Install app**.

Launched from the home screen, it runs full screen like an app and keeps working without a connection.

## Running it locally

```sh
cd starforge
python3 -m http.server 8000
```

Then open <http://localhost:8000>. To try it on your phone, connect it to the same Wi-Fi and open `http://<your-computer's-IP>:8000`. Opening `index.html` straight from the file system also works, but without offline support.

## How it's built

| File | What it does |
| --- | --- |
| `index.html` | Layout: the hangar, the flight HUD, pause and game-over cards, settings and rename sheets |
| `css/style.css` | All styling. Mobile-first, respects safe areas (notches) and reduced-motion settings; two columns on wide screens |
| `js/core.js` | Maths and colour helpers, glow and bullet sprites, and storage |
| `js/parts.js` | The parts catalogue: every hull, wing, engine, weapon, special, colour, decal, finish and upgrade, and how a loadout adds up to stats |
| `js/profile.js` | Your save: credits, owned parts, the ship, upgrades, records and settings |
| `js/art.js` | Draws your ship from its parts and paint, plus the enemy ships, bosses, asteroids and icons |
| `js/fx.js` | Particles (sparks, fireballs, shockwaves, smoke, debris) and the scrolling starfield, nebula and planets |
| `js/weapons.js` | Your weapons and specials: firing patterns, the beam, arc lightning, missiles, the nova, the aegis bubble and drones |
| `js/enemies.js` | How each enemy and boss moves, shoots and breaks apart |
| `js/waves.js` | The director: sectors, wave patterns, boss order and difficulty |
| `js/game.js` | The flight: game loop, your ship, collisions, pickups, the HUD and the end-of-run summary |
| `js/hangar.js` | The hangar: the live test-firing preview, part cards, paint shop, upgrades and buying |
| `js/audio.js` | Sound effects and music synthesised with WebAudio (no audio files) |
| `js/main.js` | Switching screens, settings, the rename sheet, toasts and the main loop |
| `sw.js`, `manifest.webmanifest`, `icons/` | Installable app + offline support |

Progress is saved in the browser's `localStorage`, so each phone or browser has its own pilot.

### Tuning

- Part prices and stats: `HULLS`, `WINGS`, `ENGINES`, `WEAPONS`, `SPECIALS` and `FINISHES` in `js/parts.js`. Upgrade prices: `UPGRADE_COST`.
- How much tougher each sector gets: `difficulty()` in `js/waves.js`. The wave patterns are the templates in `T` in the same file.
- Enemy health, score and credits: `TYPES` in `js/enemies.js`. Boss health is set where the director spawns the boss in `js/waves.js`.
- Starting credits and default ship: `defaults()` in `js/profile.js`.
- When you change any file, bump `CACHE` in `sw.js` so installed copies pick up the update.
