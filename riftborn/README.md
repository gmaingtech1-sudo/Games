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

**Sign up** with an agent codename, email and password (or **Log in**), pick a faction (**Wardens** or **Breachers**) and a first creature (Cindertail, Ripplehorn or Zephyrix), then turn on location. The game remembers your login until you log out (**Menu → Account**).

### Accounts

- **On this phone (works out of the box):** accounts are stored on the device, with passwords stored only as salted hashes. Several agents can share one phone, each with its own progress. Log in with your email or codename. The leaderboard shows the agents on this phone.
- **Online (optional, with Firebase):** your progress is saved to your account, so you can log in on any phone and carry on. There's a shared leaderboard of all agents, and a **Forgot password?** email.

The agent you had before accounts existed is linked to the first account made on that phone.

To turn on online accounts, create a free [Firebase](https://console.firebase.google.com/) project:

1. **Add project**, then in **Build → Authentication → Sign-in method**, enable **Email/Password**.
2. In **Build → Firestore Database**, create a database. Under **Rules**, paste the contents of [`firestore.rules`](firestore.rules) and **Publish**. Only you can read or write your save, and anyone signed in can read the leaderboard.
3. In **Project settings → General**, copy the **Web API key** and **Project ID** into `config.js` (`firebase: { apiKey: '…', projectId: '…' }`) on your web copy, or build the APK with `FIREBASE_API_KEY=… FIREBASE_PROJECT_ID=… ./build.sh`.

The Web API key only identifies the project and is meant to sit in apps; the Firestore rules are what protect your data. Progress is checked on the phone, not on a server, so a determined player could edit their own save and leaderboard entry.

### XP, levels and medals

You earn XP for nearly everything: catching and darting creatures, hacking, claiming, upgrading, recharging and linking Rifts, control fields, battles, fusing and levelling creatures, missions, medals and walking. XP pops up by your level bar as you earn it.

- **40 agent levels.** Each level up gives supplies. Even levels up to 14 let you upgrade Rifts one level higher. Every five levels you get a new title: Recruit, Scout, Tracker, Hunter, Ranger, Riftwalker, Vanguard, Legend, and Riftborn at level 40. **Agent → 📈 Levels** lists every level's XP and reward.
- **Medals**, like Ingress badges: Trekker (km walked), Collector, Hacker, Sharpshooter (dart hits), Builder, Connector, Mind Controller (fields), Brawler and Geneticist. Each has Bronze, Silver, Gold, Platinum and Onyx tiers, worth 500 to 40,000 XP. They're shown in **Agent**.
- **🏆 Leaderboard** in **Agent**: top agents by XP.

### Moving

Like Ingress, you play by walking around in real life. Your agent follows your phone's GPS, and there's no way to move in the game without moving yourself. You have to be within 60 m of a Rift, cache or creature to use it, so to reach something, walk there.

- Until the GPS has found you, the map waits behind a **Finding your location…** notice and nothing is in reach. The Lab, Bag and Menu still work.
- If location is blocked, the game says how to turn it on for your browser, with a **Try again** button.
- If you move faster than about 40 km/h (a car, a bus, or a GPS jump), creatures hide until you slow down.
- **Profile → Walked** counts the distance you've walked.

### The map

The camera hovers behind your agent, looking out across the streets to the horizon. Drag sideways to swing it around you (tap **N** to face north again), and pinch or scroll to zoom. The map looks like the Ingress scanner by default: a near-black world with faint teal streets, no labels, a dark horizon and glowing XM on the ground. Ingress draws its own map from OpenStreetMap data (Niantic's map isn't open to other apps), so Riftborn recreates the look from the same OpenStreetMap data, or from Google Maps if you've added a key. **Menu → Map** switches between:

- **Scanner (like Ingress):** the default.
- **Day and night follow your clock:** a bright street map by day (6:30 to 19:30) and a dark one at night, like Pokémon GO.
- **Always day**, **always night**, or **no street map** (plain ground, for offline).

| Thing | What it is |
| --- | --- |
| Floating crystal with a beam of light | A **Rift**. Teal = Wardens, magenta = Breachers, grey = unclaimed. The badge is its level (★ means it's yours), and a shard orbits it for every level. A spinning white ring means you can hack it right now. |
| Crate with a blinking light | A **supply cache**. Open it for darts, orbs and shards. Refills every 10 minutes (the lid stays open until then). |
| Creature on a coloured ring | A wild creature, walking around its spot. The ring colour is its rarity: grey Common, blue Rare, purple Epic, gold Legendary. Creatures move on every 10 minutes. |
| Glowing circle around you | Your reach (60 m). You have to be this close to interact with anything. |

The row of creatures above the bottom bar shows the closest ones. **Scan** (the big button) lists everything around you by distance.

### Google Maps

Riftborn can draw your streets with Google Maps, restyled for the game (no shop or transit labels, a dark night style). Google needs an API key, so you bring your own:

1. In the [Google Cloud console](https://console.cloud.google.com/), create a project and add billing. Google gives a free monthly allowance, and you pay only beyond it.
2. Under **APIs & Services → Library**, enable the **Map Tiles API**.
3. Under **APIs & Services → Credentials**, create an API key. Restrict it to the **Map Tiles API**, and under **Website restrictions** add your site (for example `https://<your-user>.github.io/*`). For the Android app, add `https://appassets.androidplatform.net/*`.
4. In the game, open **Menu → Google Maps**, paste the key and tap **Save key**. It's stored on your phone only.

For the Android app you can also build the key in: `GOOGLE_MAPS_KEY=AIza... ./build.sh` in `../riftborn-android`. Don't commit a key to the repository.

Without a key, or if Google refuses it (the menu says why), the game uses a free map instead. Google's copyright line for the area in view is shown in the corner, as Google requires.

### Field missions and walking

- **📋 Missions:** three new missions every day, like catching creatures, hacking Rifts, opening caches, landing darts, winning a battle or walking a distance. Each pays orbs, darts, shards and XP. Finish all three for a **Rift Surge**: 60 DNA of a rare creature plus extra supplies.
- **Walking buddy:** the first creature on your team (★ in the Lab) walks with you and finds 5 of its DNA every 250 m.
- **Supply stash:** every kilometre you walk you find a stash of orbs, darts and shards. **Agent** shows how far to the next one.

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
- **The map** lays street tiles on the ground in 3D (tinted teal for the scanner look), with fog to the horizon and sun shadows: Google's roadmap through the Map Tiles API when you've added a key, otherwise a free map that needs no key: Esri's Dark Gray Canvas for the scanner and night and Esri's street map by day, switching to OpenStreetMap by itself if Esri can't be reached. **Menu → Map source** picks one yourself if a map ever looks wrong. Offline, or with **Menu → Map → no street map**, it shows plain ground instead and plays the same.
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
| `js/host.js` | Storage and vibration, in a browser or a native app shell |
| `js/auth.js` | Accounts: sign up, log in, log out, cloud saves and the leaderboard (Firebase or on the phone) |
| `firestore.rules` | Security rules for online accounts |
| `js/audio.js` | Synthesized sound effects |
| `vendor/three.min.js` | three.js, the 3D engine |
| `js/gfx.js` | The shared 3D renderer, lighting and generated textures |
| `js/creatures.js` | Species, elements, stats and fusion recipes |
| `js/beasts.js` | The 3D creature models: rigs, skinned meshes, skin textures, animation, portraits |
| `js/props.js` | 3D agent, Rift towers, supply crates, Rift Orbs, rocks |
| `js/world.js` | Generates Rifts, caches and creatures from real coordinates |
| `js/state.js` | Your save and the game rules: items, XP, levels, medals, missions, DNA, Rifts, links, fields |
| `js/map.js` | The 3D map screen |
| `js/gmaps.js` | Google Maps tiles: sessions, day and night styles, copyright line |
| `config.js` | Build settings: an optional Google Maps key and Firebase project (leave them empty in the repository) |
| `js/ar.js` | Camera, motion sensors and the 3D-to-screen projection |
| `js/encounter.js` | The AR encounter: darts, orbs, catching |
| `js/battle.js` | Turn-based Rift battles in the 3D arena |
| `js/ui.js` | The panels: Rifts, creatures, Lab, bag, profile, menu, guide |
| `js/main.js` | Start-up, onboarding, following your GPS, the game loop |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline support and home-screen install |
