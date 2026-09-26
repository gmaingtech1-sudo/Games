# Riftborn

An AR game on your real streets. Rifts between worlds have torn open all over the map, and prehistoric creatures are pouring through. Pick a side, fight over the Rifts, and catch what comes out.

It mixes three games:

- **Like Ingress:** two factions fight over Rifts pinned to real places. Hack them for gear, claim them, link them together, and close triangles of links into control fields that earn Aether.
- **Like Pokémon GO:** creatures roam the streets around you. Walk up to one, and it steps out of a rift tear into your camera. Flick a Rift Orb at it to catch it.
- **Like Jurassic World Alive:** the creatures are dinosaur-like beasts. Fire darts at them in AR to collect their DNA, spend DNA to level them up, fuse DNA into hybrids, and battle the guardians of enemy Rifts.

Everything is in 3D, like those games: a tilted 3D map of your real streets with a day/night sky, animated 3D dinosaurs that stand in your room through the camera with real shadows, and a 3D battle arena.

It's plain HTML, CSS and JavaScript on top of [three.js](https://threejs.org) (included in `vendor/`, MIT licence). There's no build step and nothing to install. The camera feed and your location stay on your phone.

## Playing

### Getting started

Pick a faction (**Wardens** or **Breachers**), a codename and a first creature (Cindertail, Ripplehorn or Zephyrix), then turn on location.

### Moving

Like Ingress, you play by walking around in real life. Your agent follows your phone's GPS, and there's no way to move in the game without moving yourself. You have to be within 60 m of a Rift, cache or creature to use it, so to reach something, walk there.

- Until the GPS has found you, the map waits behind a **Finding your location…** notice and nothing is in reach. The Lab, Bag and Menu still work.
- If location is blocked, the game says how to turn it on for your browser, with a **Try again** button.
- If you move faster than about 40 km/h (a car, a bus, or a GPS jump), creatures hide until you slow down.
- **Profile → Walked** counts the distance you've walked.

### The map

The camera hovers behind your agent, looking out across the streets to the horizon. Drag sideways to swing it around you (tap **N** to face north again), and pinch or scroll to zoom. The sky, light and map colours follow your clock: day from 6:30 to 19:30, night otherwise (**Menu → Map** to pick one).

| Thing | What it is |
| --- | --- |
| Floating crystal with a beam of light | A **Rift**. Teal = Wardens, magenta = Breachers, grey = unclaimed. The badge is its level (★ means it's yours), and a shard orbits it for every level. A spinning white ring means you can hack it right now. |
| Crate with a blinking light | A **supply cache**. Open it for darts, orbs and shards. Refills every 10 minutes (the lid stays open until then). |
| Creature on a coloured ring | A wild creature, walking around its spot. The ring colour is its rarity: grey Common, blue Rare, purple Epic, gold Legendary. Creatures move on every 10 minutes. |
| Glowing circle around you | Your reach (60 m). You have to be this close to interact with anything. |

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

Tap a creature in reach → **Engage in AR**. It steps out of a rift tear into your camera view as a life-size 3D animal, lit from above and casting a shadow on your floor. It turns to look at you, wanders, and roars. Turn around and it stays put in the room, like Pet Cam. You have 75 seconds.

- **Darts:** move your phone to keep the creature in the crosshair, and tap **FIRE** when the yellow target lines up. Hits collect DNA and calm it down (the 💤 bar). A bullseye in the inner ring gives double DNA.
- **Orbs:** switch to **Orbs** and flick one up at the creature. A harder flick throws further; flick at an angle to aim left or right. Throw while the coloured ring is small for a *Nice*, *Great* or *Excellent* bonus. Calmer creatures are easier to catch. If it breaks free, it might flee.

You keep the DNA you collect even if it gets away. **✕** leaves and keeps your DNA.

### The Lab

- **Creatures:** tap one to level it up with its species' DNA, add it to your battle team (★, up to 3), or release it for DNA.
- **Riftdex:** every species, what you've found, and how much DNA you have.
- **Fusion:** spend DNA from two species to make hybrid DNA. At 100, the hybrid is born. There are six hybrids you can't find in the wild.

### Battles

Battles happen in a 3D arena under the Rift. Your team fights the guardians one at a time. Each turn, pick **Strike** (reliable), your element's **special move** (big hit, cooldown), **Guard** (blocks most damage and heals a little, goes first) or **Swap**. Faster creatures act first. Elements matter: Ember beats Gale, Gale beats Stone, Stone beats Volt, Volt beats Tide, Tide beats Ember. Void hits everything harder but also takes more from everything.

### Species

24 in all: 18 wild (6 Common, 5 Rare, 4 Epic, 3 Legendary) and 6 hybrids. Each part of town leans towards one element, and Void creatures come out at night.

## How it works

- **The world:** there's no server. The globe is cut into cells about 120 m across, and each cell's Rift, cache and creatures are generated from its coordinates with a seeded random number generator. Everyone playing in the same place sees the same Rifts. Creatures reroll every 10 minutes per cell, and a few Rifts change hands each day, so the Rift war keeps moving.
- **Your progress** (creatures, items, the Rifts you took, your links and fields) is saved on your phone.
- **The 3D creatures** are modelled in code, so there are no model or image files. Each of six body plans (raptor, rex, horned, plated, longneck, flyer) is a bone rig with a skinned mesh swept along it: tail, body, neck and head in one smooth skin, plus legs, arms or wings. The skin texture is generated per species (pale belly, darker back, stripes or spots, scales in a bump map), and eyes, teeth, claws, horns, frills, plates and crests ride on the bones. Legs walk with inverse kinematics so the feet plant on the ground; tails sway, heads look around, jaws open to roar, wings flap. Lighting uses a generated sky for soft reflections.
- **The map** lays CARTO's street tiles of OpenStreetMap data on the ground in 3D (Voyager by day, Dark Matter at night), with fog to the horizon and sun shadows. Offline, or with **Menu → Map → no street map**, it shows plain ground instead and plays the same.
- **The AR** is the same approach as [Pet Cam](../pet-cam): `getUserMedia` shows the rear camera, and the motion sensors (`deviceorientation`) tell the game which way the phone points. The 3D camera is turned to match every frame, so the creature stays at a real spot in the room, and an invisible floor catches its shadow over the camera picture. Without motion sensors you drag to look around. Without a camera, you get a glowing rift plain instead. **Menu → AR camera: off** uses the rift plain always.
- **Sound** is synthesized with WebAudio.

It needs a phone or computer with WebGL (nearly all do). The 3D runs best in a recent Chrome or Safari.

## Putting it on your phone

The camera and GPS only work over HTTPS, so the easiest way is GitHub Pages:

1. In the repository on GitHub, open **Settings → Pages**.
2. Under **Build and deployment**, pick **Deploy from a branch**, choose the branch that has this folder and `/ (root)`, then **Save**.
3. After a minute, open `https://<your-user>.github.io/<repo>/riftborn/` on your phone.
4. Allow location and camera access when asked. On iPhone, also allow **Motion & Orientation** access.
5. To add it to your home screen:
   - **iPhone (Safari):** Share button → **Add to Home Screen**.
   - **Android (Chrome):** ⋮ menu → **Add to Home screen** (or **Install app**).

On Android you can also install it as a regular app instead: see [`../riftborn-android`](../riftborn-android) ([download the APK](../riftborn-android/dist/riftborn.apk)).

It works offline after the first visit (the map falls back to plain ground).

To try it on a computer: `cd riftborn && python3 -m http.server 8000` and open `http://localhost:8000`. The browser uses the computer's rough location. To "walk", open the developer tools, find **Sensors** (Chrome: ⋮ → More tools → Sensors) and change the location. In AR, drag to look around.

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
| `vendor/three.min.js` | three.js, the 3D engine |
| `js/gfx.js` | The shared 3D renderer, lighting and generated textures |
| `js/creatures.js` | Species, elements, stats and fusion recipes |
| `js/beasts.js` | The 3D creature models: rigs, skinned meshes, skin textures, animation, portraits |
| `js/props.js` | 3D agent, Rift towers, supply crates, Rift Orbs, rocks |
| `js/world.js` | Generates Rifts, caches and creatures from real coordinates |
| `js/state.js` | Your save and the game rules: items, XP, DNA, Rifts, links, fields |
| `js/map.js` | The 3D map screen |
| `js/ar.js` | Camera, motion sensors and the 3D-to-screen projection |
| `js/encounter.js` | The AR encounter: darts, orbs, catching |
| `js/battle.js` | Turn-based Rift battles in the 3D arena |
| `js/ui.js` | The panels: Rifts, creatures, Lab, bag, profile, menu, guide |
| `js/main.js` | Start-up, onboarding, following your GPS, the game loop |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline support and home-screen install |
