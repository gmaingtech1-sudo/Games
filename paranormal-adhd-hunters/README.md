# ParanormalADHDhunters

A first-person paranormal investigation game for phones. You're the newest recruit on the ParanormalADHDhunters team, a small crew who notice the things other investigators miss: the flicker in a window, a cold spot that shouldn't be there, a voice under the static. Walk into a dark, foggy haunted house with your kit, collect evidence, work out which ghost is there, and uncover the secret that links eight haunted places across the county.

It's spooky and mysterious but never gory. When a ghost catches you, you get "spooked" and the team pulls you back to the van.

It runs in the browser on phones and computers. It's plain HTML, CSS and JavaScript with a bundled copy of [three.js](https://threejs.org/) for the 3D. There's no build step and nothing to install. Every texture, model, icon and sound is made in code, so the only image files are the app icons. After the first visit it also works offline (team play needs the internet).

There's also an Android app: [download the APK](../paranormal-adhd-hunters-android/dist/paranormal-adhd-hunters.apk), or see [`../paranormal-adhd-hunters-android`](../paranormal-adhd-hunters-android) for how to install and build it.

## What's in this first version

This is the first playable version: **one haunted house, three ghost types, five pieces of equipment and a complete story chapter**, plus the progression, team mode and branding the larger game is built on.

| | Playable now | Coming later |
| --- | --- | --- |
| Locations | Abandoned House (13 Wren Lane), with three floors and a basement | Haunted Hotel, Old Graveyard, Abandoned Hospital, Old Castle, Haunted School, Forest Cabin, Old Prison (shown as sealed case files on the county map) |
| Ghosts | Shadow Ghost, Poltergeist, Child Spirit | Phantom, Possessed Spirit, Screaming Ghost, Demon, Ancient Spirit (listed as "not encountered yet" in the journal) |
| Equipment | Flashlight, EMF meter, Thermometer, Spirit box, Digital camera | Video camera, Audio recorder, Motion sensor, UV light |
| Story | Chapter 1: Whispers on Wren Lane (three cases, ending on a cliffhanger) | Chapter 2: The Marlowe Grand, and beyond |

## Playing

### Controls

| Action | Touch | Keyboard / mouse |
| --- | --- | --- |
| Walk | Drag anywhere on the left side of the screen (a joystick appears under your thumb) | W A S D or arrow keys, Shift to run |
| Look around | Swipe on the right side | Click to capture the mouse, then move it |
| Use what you're looking at (doors, light switches, wardrobes, clues, the van) | The big round button, which shows what it will do | E |
| Flashlight | The torch in the equipment bar | F |
| Switch equipment | The equipment bar | 1 to 4 |
| Snap a photo / ask the spirit box | The second round button | Q or Space |
| Journal / map / pause | Buttons at the top right | J, M, Esc |

There's a left-handed option in Settings that swaps the sides. **How to play** on the main menu (and in the pause menu) walks through the basics, and the first story case has the team talking you through it over the radio.

### An investigation

1. You arrive by the team van. Walk up to the house and go in. Switch your flashlight on.
2. **Find the ghost room.** The ghost room is the coldest room in the house, so use the thermometer and walk from room to room. Activity, EMF readings and odd noises also give it away.
3. **Collect evidence.** Each ghost type shows three of these five:

   | Evidence | How you find it |
   | --- | --- |
   | EMF Level 5 | When a ghost does something it leaves EMF energy behind for about 20 seconds. Hold the EMF meter near it; all five lights is evidence. |
   | Freezing Temperatures | The thermometer reads below 0 °C in the ghost room. You can see your breath. |
   | Spirit Box Voice | Switch the lights off in the ghost room and ask the spirit box a question. Some spirits answer, out loud and on its screen. |
   | Ghost Photograph | Some spirits show up on camera even when your eyes see nothing. Photograph the ghost room. |
   | Objects Thrown | You have to see something fly off a shelf or a table. |

   Your equipment logs evidence in the journal automatically. You can also rule evidence out yourself. The journal's Kit tab shows everything you're carrying.
4. **Identify the ghost.** The journal shows which ghosts still fit your evidence. Pick one.
5. **Go back to the van** and finish. The investigation report shows whether you were right, the evidence, your photos, objectives and rewards.

Each case also has two bonus objectives (for example "Photograph paranormal activity" or "Don't get spooked").

### The ghosts

They don't all behave the same, and how they behave is a clue too:

| Ghost | Evidence | Behaviour |
| --- | --- | --- |
| Shadow Ghost | EMF 5, Freezing, Photo | Flickers lights and makes your flashlight stutter. Shows itself for a moment in doorways, then melts away. Quietly follows investigators who wander alone in the dark (listen for footsteps behind you). Never throws things. |
| Poltergeist | EMF 5, Spirit Box, Objects Thrown | Throws books, cups and plates, sometimes several at once. Slams doors, plays with light switches, knocks on walls. Almost never seen. |
| Child Spirit | Spirit Box, Freezing, Photo | Giggles, hums and runs about. Plays Ellie's music box and squeaks toys. Turns lights ON. Sometimes seen as a small glowing figure. |

### Nerve, surges and hiding

Your **nerve** drops in the dark and when things happen near you. Lit rooms steady it, and resting by the van restores it. When the team's nerve gets low, the ghost may **surge**: the lights flicker everywhere, the front door jams, and the ghost becomes visible and comes looking for you. Keep your distance or hide in a wardrobe (there's one in most bedrooms, the kitchen pantry and the study) until it calms down. If it catches you, you're spooked: you wake up at the van and lose a share of the case's rewards.

Stay too long and the house turns dangerous: after a few surges the team radios everyone to get back to the van, and surges come faster until you leave.

### Story: Chapter 1, Whispers on Wren Lane

The Halloway family left 13 Wren Lane in the middle of the night in 1987 and never came back. Over three cases you find out why:

1. **First Night**: your first investigation, with tips from the team over the radio.
2. **The Halloway Letters**: something keeps drawing spirits to the house.
3. **Beneath Wren Lane**: the cellar is finally open. Find what the Order of the Lantern hid down there, then get out.

Each story case has a clue to find before the story moves on. After Case 1, **free investigations** open up: a random ghost in a random room every time, with four lost pages of Sam Halloway's notebook hidden around the house.

### Progression

- **XP and levels**, and **investigator ranks** from Rookie to Keeper of the Lantern, each with its own badge.
- **Coins** for every case: more for a correct call, evidence, bonus objectives, photos (ghost photos earn the most) and clues.
- **Difficulty**: Amateur, Intermediate (level 3, ×1.5 rewards) and Professional (level 6, ×2 rewards). Harder means faster nerve loss and earlier, longer surges.
- **Equipment upgrades**: each piece of gear has three tiers (brighter torch, longer EMF range, faster and steadier thermometer, a spirit box that answers more often, more photos and a longer flash).
- **Team uniforms**, unlocked with levels and coins. Your uniform shows on your arm in first person and on your avatar in team mode.
- **Daily challenges**: three new ones every day, with a bonus for finishing all three.
- **20 badges** to earn.

## Team mode

Up to four investigators in one investigation. In **Team Up**, one player hosts and gets a five-letter code; friends join with it. The host picks the case. In the house you can:

- talk on the team radio, with quick calls or typed messages,
- share evidence: anything one of you finds goes into everyone's journal,
- see each other's photos,
- split up to search different rooms (teammates show up on the map),
- complete objectives together,
- escape together: the case ends when everyone is back at the van.

Teammates appear as uniformed investigators with headlamps and name tags. The host's phone runs the ghost; it can target whoever it likes. It works over the internet through [PeerJS](https://peerjs.com/)'s free public server, with the phones then talking directly (being on the same Wi-Fi helps).

## Putting it on your phone

The game has to be served over HTTPS for offline play and "Add to Home Screen" to work. The simplest way is GitHub Pages:

1. In the repository on GitHub, open **Settings → Pages**.
2. Under **Build and deployment**, pick **Deploy from a branch**, choose the branch that has this folder and `/ (root)`, then **Save**.
3. After a minute, open `https://<your-user>.github.io/<repo>/paranormal-adhd-hunters/` on your phone.
4. Add it to your home screen:
   - **iPhone (Safari):** Share button → **Add to Home Screen**.
   - **Android (Chrome):** ⋮ menu → **Add to Home screen** / **Install app**.

Launched from the home screen, it runs full screen like an app. It's best with headphones: sounds come from where they happen in the house, and are muffled through walls.

## Running it locally

```sh
cd paranormal-adhd-hunters
python3 -m http.server 8000
```

Then open <http://localhost:8000>. To try it on your phone, connect it to the same Wi-Fi and open `http://<your-computer's-IP>:8000`.

To test team mode on one computer, add `?net=local` to the address and open the game in two tabs of the same browser: they talk to each other directly instead of over the internet. To use your own PeerJS server instead of the public one (`npx -p peer peerjs --port 9000 --path /pah`), add `?peerhost=localhost&peerport=9000&peerpath=/pah` on every device (`&peersecure=1` for HTTPS).

## Settings

Volume (overall, effects, ambience), spirit voices, look sensitivity, invert look, left-handed controls, vibration, graphics quality (Low / Medium / High) and **reduce flashing**, which calms the flickering lights, surges and camera flash.

## How it's built

| File | What it does |
| --- | --- |
| `index.html` | Layout: the HUD, menus, loading screens and the sheet that holds every menu |
| `css/style.css` | All styling. Mobile-first, works in portrait and landscape, respects safe areas (notches), reduced motion and the reduce-flashing setting |
| `js/data.js` | Everything the game knows: evidence, ghosts and their behaviour weights, equipment tiers, locations, the team, the story, clues, tutorial lines, difficulty, objectives, ranks, uniforms, badges and daily challenges |
| `js/textures.js` | Paints every surface on canvases: wallpapers, floors, books, portraits, cobwebs, fog, clue documents and the lantern mark |
| `js/props.js` | Furniture and small objects built from simple shapes (beds, wardrobes you can hide in, the piano, the grandfather clock, the boiler, toys…), plus geometry merging |
| `js/house.js` | 13 Wren Lane: rooms on a half-metre grid over three floors, generated walls, floors, ceilings, doors, stairs, windows, lights, the yard, the van and the sky. Also collisions, floor heights, line of sight and the ghost's route finding |
| `js/engine.js` | Renderer, scene, fog, moonlight (its shadow is drawn once) and your chest torch |
| `js/player.js` | Walking, stairs, sliding along walls, footsteps on different floors, head bob and hiding |
| `js/input.js` | Floating joystick, swipe-to-look, keyboard and mouse |
| `js/equipment.js` | The held EMF meter, thermometer, spirit box and camera with live screens, drawn in their own pass so they never clip into walls |
| `js/ghost.js` | How each ghost looks (shader-drawn) and behaves: wandering, events, following, manifesting, surges and the finale hunt |
| `js/game.js` | One investigation: the shared world (solo, or run by the team host), evidence, nerve, photos, objectives, tips, story beats, the finale escape, rewards and the report |
| `js/audio.js` | Every sound synthesised with WebAudio, positioned in 3D and muffled through walls: footsteps, creaks, slams, knocks, giggles, the music box, the spirit box, heartbeat, ambience and menu music |
| `js/ui.js` | HUD, case board, briefings, story scenes, evidence journal, ghost guide, floor maps, the van, investigation report, profile, equipment, badges, daily challenges, settings and team radio |
| `js/art.js` | The logo, team emblem, rank and achievement badges, icons, uniforms, ghost art and the county map, all as SVG |
| `js/net.js` | Team mode: hosting, joining with a code, and passing messages over PeerJS (or between tabs for testing) |
| `js/avatars.js` | Your teammates as you see them |
| `js/profile.js` | Your save: level, coins, gear, uniforms, story, badges, daily challenges and settings |
| `js/main.js` | Boot, the menu backdrop, starting cases, the main loop, report and story flow, the team lobby, and the back button and pause hooks the Android app calls |
| `js/host.js` | The bridge to the Android app (vibration, spoken spirit answers, a copy of the save); in a browser it falls back to the web versions |
| `vendor/` | [three.js](https://github.com/mrdoob/three.js) r186 and [PeerJS](https://peerjs.com) 1.5.5 (both MIT licence, see `PEERJS-LICENSE`) |
| `sw.js`, `manifest.webmanifest`, `icons/` | Installable app + offline support |

Progress is saved in the browser's `localStorage`, so each phone or browser has its own investigator.

### Tuning

- Ghost behaviour: `acts` (how often each ghost does each thing), `pace` and `surgeSpeed` in `GHOSTS` in `js/data.js`. Event timing and surge rules are in `GhostBrain` in `js/ghost.js`.
- How hard each difficulty is: `DIFFICULTY` in `js/data.js` (nerve drain, when surges can start, how long they last).
- Equipment tiers and prices: `EQUIPMENT` in `js/data.js`.
- Rewards: `score()` in `js/game.js`. XP per level: `xpToNext` in `js/data.js`.
- The house: `ROOMS`, `DOORS`, `FURNITURE`, `THROWABLES` and `CLUE_SPOTS` at the top of `js/house.js`.
- When you change any file, bump `CACHE` in `sw.js` so installed copies pick up the update, and run `./build.sh` in `../paranormal-adhd-hunters-android` so the Android app gets the change too.

### Adding the next location

The game is built to grow. A new location needs a layout like `js/house.js` (rooms, doors and furniture), a `playable: true` entry in `LOCATIONS`, and its chapter in `CHAPTERS`. New ghosts are entries in `GHOSTS` with their evidence, `acts` and spirit box words, plus a look in `GhostVisual`. New equipment needs an entry in `EQUIPMENT` with `active: true`, a held model and reading in `js/equipment.js`, and the evidence it reveals in `EVIDENCE`.
