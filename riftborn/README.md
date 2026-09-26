# Riftborn

An AR game on your real streets. Rifts between worlds have torn open all over the map, and prehistoric creatures are pouring through. Pick a side, fight over the Rifts, and catch what comes out.

It mixes three games:

- **Like Ingress:** two factions fight over Rifts pinned to real places. Hack them for gear, claim them, link them together, and close triangles of links into control fields that earn Aether.
- **Like Pokémon GO:** creatures roam the streets around you. Walk up to one, and it steps out of a rift tear into your camera. Flick a Rift Orb at it to catch it.
- **Like Jurassic World Alive:** the creatures are dinosaur-like beasts. Fire darts at them in AR to collect their DNA, spend DNA to level them up, fuse DNA into hybrids, and battle the guardians of enemy Rifts.

It's plain HTML, CSS and JavaScript. There's no build step, nothing to install, and no AR or map library. The camera feed and your location stay on your phone.

## Playing

### Getting started

Pick a faction (**Wardens** or **Breachers**), a codename and a first creature (Cindertail, Ripplehorn or Zephyrix). Then choose how you move:

- **Use my location:** the map follows your real GPS.
- **Play at home:** tap the map to walk. You can switch any time in **Menu → Moving**.

### The map

| Thing | What it is |
| --- | --- |
| Glowing crystal with a beam | A **Rift**. Teal = Wardens, magenta = Breachers, grey = unclaimed. The number is its level, ★ means it's yours. A dashed ring means you can hack it right now. |
| Crate | A **supply cache**. Open it for darts, orbs and shards. Refills every 10 minutes. |
| Creature on a coloured ring | A wild creature. The ring colour is its rarity: grey Common, blue Rare, purple Epic, gold Legendary. Creatures move on every 10 minutes. |
| Circle around you | Your reach (60 m). You have to be this close to interact with anything. |

The row of creatures above the bottom bar shows the closest ones. **Scan** (the big button) lists everything around you by distance.

### Rifts

| Action | How |
| --- | --- |
| Hack | Tap a Rift in reach → **Hack**. You get orbs, darts, Rift Shards, and often a key to that Rift. 5 minutes cooldown. |
| Claim | Unclaimed Rifts cost 6 shards to claim for your faction. Your best creature becomes its guardian. |
| Assault | Enemy Rifts are defended by 1 to 3 guardian creatures. Beat them in battle and the Rift goes back to unclaimed, so you can claim it. |
| Upgrade | Raise your own Rift's level with shards. Higher levels hold more guardians and link further. Your agent level caps it. |
| Recharge | Your Rifts lose charge every day. At zero, the other faction takes them. Recharge for 2 shards. |
| Link | Needs a key to another Rift your faction holds, within range. Links can't cross. Link three Rifts into a triangle to raise a **control field**: bigger fields earn more Aether. |

### Catching creatures (AR)

Tap a creature in reach → **Engage in AR**. It steps out of a rift tear into your camera view. Turn around and it stays put in the room, like Pet Cam. You have 75 seconds.

- **Darts:** move your phone to keep the creature in the crosshair, and tap **FIRE** when the yellow target lines up. Hits collect DNA and calm it down (the 💤 bar). A bullseye in the inner ring gives double DNA.
- **Orbs:** switch to **Orbs** and flick one up at the creature. A harder flick throws further; flick at an angle to aim left or right. Throw while the coloured ring is small for a *Nice*, *Great* or *Excellent* bonus. Calmer creatures are easier to catch. If it breaks free, it might flee.

You keep the DNA you collect even if it gets away. **✕** leaves and keeps your DNA.

### The Lab

- **Creatures:** tap one to level it up with its species' DNA, add it to your battle team (★, up to 3), or release it for DNA.
- **Riftdex:** every species, what you've found, and how much DNA you have.
- **Fusion:** spend DNA from two species to make hybrid DNA. At 100, the hybrid is born. There are six hybrids you can't find in the wild.

### Battles

Your team fights the guardians one at a time. Each turn, pick **Strike** (reliable), your element's **special move** (big hit, cooldown), **Guard** (blocks most damage and heals a little, goes first) or **Swap**. Faster creatures act first. Elements matter: Ember beats Gale, Gale beats Stone, Stone beats Volt, Volt beats Tide, Tide beats Ember. Void hits everything harder but also takes more from everything.

### Species

24 in all: 18 wild (6 Common, 5 Rare, 4 Epic, 3 Legendary) and 6 hybrids. Each part of town leans towards one element, and Void creatures come out at night.

## How it works

- **The world:** there's no server. The globe is cut into cells about 120 m across, and each cell's Rift, cache and creatures are generated from its coordinates with a seeded random number generator. Everyone playing in the same place sees the same Rifts. Creatures reroll every 10 minutes per cell, and a few Rifts change hands each day, so the Rift war keeps moving.
- **Your progress** (creatures, items, the Rifts you took, your links and fields) is saved on your phone.
- **The map** uses CARTO's dark street tiles of OpenStreetMap data. Offline, or with **Menu → Map → neon grid**, it draws a grid instead and plays the same.
- **The AR** is the same approach as [Pet Cam](../pet-cam): `getUserMedia` shows the rear camera, and the motion sensors (`deviceorientation`) tell the game which way the phone points. The creature lives at a real position in meters around you and is projected onto the screen each frame. Without motion sensors you drag to look around. Without a camera, you get a glowing rift plain instead. **Menu → AR camera: off** uses the rift plain always.
- **The creatures** are drawn with canvas from six body plans (raptor, rex, horned, plated, longneck, flyer), so there are no image files.
- **Sound** is synthesized with WebAudio.

## Putting it on your phone

The camera and GPS only work over HTTPS, so the easiest way is GitHub Pages:

1. In the repository on GitHub, open **Settings → Pages**.
2. Under **Build and deployment**, pick **Deploy from a branch**, choose the branch that has this folder and `/ (root)`, then **Save**.
3. After a minute, open `https://<your-user>.github.io/<repo>/riftborn/` on your phone.
4. Allow location and camera access when asked. On iPhone, also allow **Motion & Orientation** access.
5. To add it to your home screen:
   - **iPhone (Safari):** Share button → **Add to Home Screen**.
   - **Android (Chrome):** ⋮ menu → **Add to Home screen** (or **Install app**).

It works offline after the first visit (the map falls back to the neon grid).

To try it on a computer: `cd riftborn && python3 -m http.server 8000`, open `http://localhost:8000`, pick **Play at home**, and drag to look around in AR.

## Play safe

Stay aware of your surroundings. Don't go onto private property, and never play while driving or cycling. When you move faster than about 40 km/h, creatures hide.

## Files

| File | What it does |
| --- | --- |
| `index.html` | The screens: onboarding, map, AR encounter, battle |
| `css/style.css` | All the styling |
| `js/core.js` | Seeded random numbers and small helpers |
| `js/host.js` | Saving and vibration, in a browser or a native app shell |
| `js/audio.js` | Synthesized sound effects |
| `js/creatures.js` | Species, elements, stats, fusion recipes, and the creature renderer |
| `js/world.js` | Generates Rifts, caches and creatures from real coordinates |
| `js/state.js` | Your save and the game rules: items, XP, DNA, Rifts, links, fields |
| `js/map.js` | The map screen |
| `js/ar.js` | Camera, motion sensors and the 3D-to-screen projection |
| `js/encounter.js` | The AR encounter: darts, orbs, catching |
| `js/battle.js` | Turn-based Rift battles |
| `js/ui.js` | The panels: Rifts, creatures, Lab, bag, profile, menu, guide |
| `js/main.js` | Start-up, onboarding, GPS and tap-to-walk, the game loop |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline support and home-screen install |
