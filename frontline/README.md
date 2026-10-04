# Frontline 1944

A top-down World War 2 shooter for phones. You play an American soldier, from the landing at Omaha Beach to the frozen woods around Bastogne. You use rifles, submachine guns, a trench shotgun, a B.A.R., a bazooka, grenades and artillery. Enemy soldiers take cover, flank you and throw grenades, and there are machine-gun nests, snipers and tanks.

It's plain HTML, CSS and JavaScript. There's no build step and nothing to install. Soldiers, tanks, terrain, explosions and every sound effect are drawn or synthesised in code, so the only image files are the app icons. After the first visit it also works offline.

## Playing

### Controls

| Action | Touch | Keyboard / mouse |
| --- | --- | --- |
| Move | Put your left thumb down anywhere on the left side and drag | WASD or arrow keys |
| Aim and fire | Put your right thumb down anywhere on the right side and push. The gun fires while the stick is pushed | Mouse to aim, click (or Space) to fire |
| Grenade | Grenade button. It's thrown the way you're aiming and lands on the nearest enemy in that direction | G, or right-click exactly where you want it |
| Reload | Reload button (also automatic when empty) | R |
| Swap weapon | Swap button | Q, or 1 / 2 |
| Pick up a dropped gun | The **Take** button that appears when you stand on one | E |
| Artillery strike | Radio button, once its bar is full | F |
| Pause | Pause button | Esc or P |

Turning the phone sideways gives the widest view, but portrait works too.

### AFK mode

Tap **AFK** at the top right (or press K, or turn it on in Settings) and your soldier plays by himself. He follows the objective around walls and shoots anything he has a clear shot at. He grenades MG nests and tanks, switches to the bazooka for armour, and calls in artillery when it's charged. He also sidesteps grenades and tank shells, falls back to heal when hurt, and picks up ammo, medkits and the bazooka.

When a mission ends, the debrief moves on by itself after 6 seconds: to the next mission if he won, or a retry if he didn't. Tap the debrief to stop it. Touch a stick or press a movement key and you're in control for as long as you keep doing it. Let go and he takes over again. While AFK is on, switching to another app doesn't open the pause menu, so it carries on when you come back.

He wins most missions on Regular by himself, but not every time.

### How the fighting works

- **Cover.** Walls, buildings, hedgerows, trees, wrecks and concrete stop bullets. **Sandbags** stop them too, unless the shooter is crouched right behind them. So you can fire over your own sandbags but can't hit someone tucked behind theirs from a distance. Get close, go round, or use a grenade.
- **Health** comes back on its own after a few seconds out of fire. Medkits heal straight away. A red arc around you shows where the last hit came from.
- **Warnings.** A red ring around a stick grenade means get clear. A thin red line is a sniper about to fire. A thick dashed red line ending in a circle is a tank's main gun: move off the line.
- **Tanks** shrug off bullets (about a tenth of the damage). The bazooka kills a Panzer in about three hits. Grenades and artillery work too.
- **Unaware enemies** have a **?** over them. Gunfire and explosions wake up everyone nearby.
- **Kills charge your radio.** When it's full, call in an eight-shell artillery strike. It aims at the biggest group of enemies you can see, or straight ahead if you can't see any. Stay out of the yellow circle.
- Fallen enemies sometimes drop their **MP 40** or **Kar98k**, ammo, grenades or medkits. Ammo boxes top up both your guns and give you a grenade.

### The campaign

| # | Mission | Objectives | Unlocks |
| --- | --- | --- | --- |
| 1 | **Omaha Beach** (6 June 1944) | Cross the beach, knock out three MG nests on the bluff, reach the top | Thompson |
| 2 | **Hedgerows** (18 June 1944) | Clear the enemy out of a maze of bocage fields, snipers in the tree lines | Trench Gun |
| 3 | **Carentan** (12 June 1944) | Fight up the high street to the church square, then hold it for 75 s against counter-attacks | B.A.R. |
| 4 | **The Bridge** (20 September 1944) | Pick up the bazooka, destroy two Panzers, cross the bridge under MG fire | Bazooka |
| 5 | **Bastogne** (24 December 1944) | Hold the foxhole line in the snow for 110 s (with tank attacks), then destroy the Tiger | — |

Each mission gives up to three stars: one for finishing, one for beating the par time, and one for 35% accuracy or better. Every enemy you kill counts towards your rank, from Private up to Colonel.

**Last Stand** is an endless survival mode at a ruined crossroads. Each wave is bigger than the last, every fifth wave brings tanks, and supplies are dropped between waves.

### Weapons

| Weapon | Slot | Notes |
| --- | --- | --- |
| M1 Garand | Primary | 8-round semi-auto, kills most soldiers in one hit, *ping* when empty |
| Thompson | Primary | 30-round SMG, fast and close-range |
| Trench Gun | Primary | 8-pellet shotgun, reloads a shell at a time (fire to interrupt) |
| B.A.R. | Primary | Heavy automatic rifle, bullets punch through one target, slows you a little |
| MP 40, Kar98k | Primary | Picked up from enemies only |
| M1911 | Sidearm | Endless spare magazines |
| Bazooka | Sidearm | Rockets with a big blast, the anti-tank weapon |

Difficulty (Recruit, Regular or Veteran) changes how hard enemies hit, how well they aim and how much health they have. You can change it in the briefing or in Settings.

## Putting it on your phone

On Android, the easiest way is the app: [download the APK](../frontline-android/dist/frontline.apk) (see [`../frontline-android`](../frontline-android)). Otherwise, install it from the web:

The game has to be served over HTTPS for offline play and "Add to Home Screen" to work. The simplest way is GitHub Pages:

1. In the repository on GitHub, open **Settings → Pages**.
2. Under **Build and deployment**, pick **Deploy from a branch**, choose the branch that has this folder and `/ (root)`, then **Save**.
3. After a minute, open `https://<your-user>.github.io/<repo>/frontline/` on your phone.
4. Add it to your home screen:
   - **iPhone (Safari):** Share button → **Add to Home Screen**.
   - **Android (Chrome):** ⋮ menu → **Add to Home screen** / **Install app**.

## Running it locally

```sh
cd frontline
python3 -m http.server 8000
```

Then open <http://localhost:8000>. To try it on your phone, connect it to the same Wi-Fi and open `http://<your-computer's-IP>:8000`.

## How it's built

| File | What it does |
| --- | --- |
| `index.html` | Layout: menu, briefing dossier, battle HUD and touch buttons, pause and debrief cards, settings and help sheets |
| `css/style.css` | All styling. Mobile-first, works in portrait and landscape, respects safe areas (notches) and reduced-motion settings |
| `js/core.js` | Maths helpers, the seeded random generator, and the save file |
| `js/data.js` | The arsenal, the enemy roster, ranks and difficulty levels |
| `js/audio.js` | Gunshots, explosions, the Garand ping and everything else, synthesised with WebAudio |
| `js/world.js` | The battlefield: cover, collisions, line of sight, the flow field enemies use to path around walls, and the ground painted in 512 px chunks (craters, scorch marks and tank tracks are painted into them) |
| `js/art.js` | Draws soldiers, tanks, MG nests, sandbags, buildings, hedgerows, trees, wire and pickups |
| `js/missions.js` | The five campaign maps and Last Stand, built with a small map builder, plus their objectives |
| `js/input.js` | Twin thumbsticks, keyboard and mouse |
| `js/afk.js` | AFK mode: the soldier's own brain (targeting, pathing to the objective, grenades, dodging, healing, supplies) |
| `js/game.js` | The battle: player, enemy AI, tanks, bullets, grenades, rockets, artillery, explosions, objectives, camera, HUD, minimap and drawing |
| `js/main.js` | Menu, briefing and loadout, settings, debrief and stars, and the main loop |
| `sw.js`, `manifest.webmanifest`, `icons/` | Installable app + offline support |

Progress is saved in the browser's `localStorage`.

### Tuning

- Weapon damage, fire rate, magazines and unlocks: `WEAPONS` in `js/data.js`.
- Enemy health, accuracy, damage and how far away they like to fight: `ENEMIES` in `js/data.js`. Difficulty multipliers: `DIFFICULTY`.
- Maps, enemy placement, objectives, hold timers and wave makeup: `MISSIONS` in `js/missions.js`. Par times are `par` on each mission.
- Player speed and grenade blast radius: `PLAYER_SPEED` and `GRENADE_R` at the top of `js/game.js`.
- When you change any file, bump `CACHE` in `sw.js` so installed copies pick up the update.
