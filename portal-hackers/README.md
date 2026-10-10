# Portal Hackers: Nexus

Portals are opening on your real streets. Find them with your Sci-Fi Compass, hack them for gear, knock out the other teams' Uplinks, deploy your own, and link your portals into control fields. Climb 50 levels from **Scout** to **Nexus Master**, then Prestige and do it again.

It plays like Ingress, with some differences:

| Like Ingress | Different |
| --- | --- |
| Teams fight over portals pinned to real places. | Three teams (NOVA, PULSAR, ECLIPSE), not two. |
| Hacking a portal gives you gear and keys. | Hacking is a memory puzzle you have to solve, at three difficulties. A successful hack on an enemy portal also **sabotages** it, knocking out Uplinks. |
| Portals are held up by 8 deployed items (Uplinks), and their count is the portal's level. | You find portals with a 3D Sci-Fi Compass instead of a map. |
| You knock out enemy portals with bombs (Pulse Bombs), then claim them. | Rare 🌌 Nexus signals and ⚫ Nexus portals: endgame black holes worth thousands of XP. |
| Links need a key to the far portal, and a triangle of links raises a control field. | Squad missions, timed team events, daily missions, a Compass upgrade tree and Prestige. |
| You walk over the energy lying on the street to collect it. | It's **Tech Cubes**, which give Tech Cores as well as energy. |

Everything you do earns XP, every level gives a reward, every 5 levels opens something big, and every 10 levels brings a new rank. A progress card sits under the compass at all times with your XP bar and what to do next:

```
LV 27 → 28   🛰️ OPERATIVE        8,800 / 12,000 XP
[■■■■■■■■■■■■■■■■■■■■■■■■■■■■■·········]
Next: ⚡ Hack 2 portals · 3,200 XP to go     Today 2.4k/10k
```

Tap it for the full level table and the list of what each level unlocks.

It's plain HTML, CSS and JavaScript. There's no build step, nothing to install, and no map library. Your location stays on your phone. The only library is [PeerJS](https://peerjs.com/) (in `js/vendor/`, MIT licence), for team chat.

## Playing

### Getting started

**Sign up** with a username and password, pick a team (**NOVA**, **PULSAR** or **ECLIPSE**) and an avatar. Then choose how you move:

- **Use my location:** the compass follows your real GPS.
- **Play at home:** tap the compass to walk there. You can switch any time in **☰ → Moving**.

### The Sci-Fi Compass

The compass is a 3D holographic disc on the ground around you, seen from above and behind you. Portals stand at their real bearing and distance as spinning crystals on beams of light, your links arc between them, and a sweep circles the disc. With a compass sensor, the view turns with your phone (🧭 switches this off). Without one, drag sideways to turn the view.

| On the compass | What it is |
| --- | --- |
| **?** | A portal you haven't discovered, coloured by the team that holds it (grey = neutral), so you can spot enemy portals from afar. Walk within your scanner range (the solid ring) to discover it. |
| Dots around a portal | Its 8 **Uplink** slots, lit for each one deployed. Orange rings are **Firewalls**, and 🔑 means you have a key to it. |
| Translucent triangles | **Control fields**. Yours are brighter; other teams' are fainter, in their colour. |
| Crystals | Portals. The shape is its rarity: 4-sided Common, 3-sided Rare, 6-sided Epic, 5-sided Legendary (with taller beams for rarer portals). The colour is the team that holds it (grey = neutral), and the base ring is its rarity colour. A ★ above it means it's yours. |
| Black hole | A ⚫ **Nexus portal** (Level 40+), with a spinning accretion ring. |
| Yellow cubes | **Tech Cubes.** Walk within reach (45 m) and they're picked up for you, or tap one in reach. Each gives +5 Tech Cores and energy, even when your energy is full. They come back every 10 minutes. |
| Violet ripples and pillar | A 🌌 **Nexus signal** (Level 30+). Walk to it for 750 XP. Each lasts an hour. |
| Dashed ring | Your reach (45 m). You hack, attack, capture and defend from inside it. Linking works at any distance. |

Tap a portal to open it. The bar under the compass shows the portal you're in reach of or, when you aren't near one, the **nearest enemy portal**, with its team, distance and direction: tap it to open that portal (it says **HACK** once you're in reach).

**⤢** widens the radar. From Level 20, **🗺️ Territory map** zooms out to a kilometre, tilts the camera to look down from above, and shows who holds every portal.

### Portals

| Action | How |
| --- | --- |
| **Discover** | Walk within scanner range. |
| **Hack** | Tap a portal in reach and pick a hack. The portal flashes a code across a grid of nodes: tap it back in order before time runs out. Basic (3×3, 4 nodes), Advanced (4×4, 6 nodes, Level 11), Expert (5×5, 8 nodes, Level 17). Epic portals need Advanced or better; Legendary and Nexus portals need Expert. 5-minute cooldown per portal. A successful hack drops gear (Basic 2–3 items, Advanced 3–5, Expert 5–7) and a key to that portal (50% / 75% / always). On an enemy portal it also knocks out Uplinks (Basic 1, Advanced 2, Expert 3). |
| **Attack** | Fire a 💥 **Pulse Bomb** at an enemy portal in reach: it knocks out 2 Uplinks. When the last one goes, the portal is neutral. |
| **Capture** | Deploy a 📶 **Uplink** on a neutral portal. If you knocked it out yourself, it counts as capturing an enemy portal, with no time limit. ⚫ Nexus portals need an Expert Hack first to drop their wards; they stay down until you capture it. |
| **Fortify** | Deploy more Uplinks on your team's portals (up to 8: that's its level, L1–L8) and install up to 2 🧱 **Firewalls**. Both make it much harder for the other teams to take. |
| **Defend** | From Level 15, stand by one of your team's portals. Defended portals can't fall. You get XP at 10 minutes and at 30 minutes. |
| **Link** | From Level 1, connect any two of your team's portals, at **any distance**, and from wherever you are. Tap **Link** on a portal and pick the other from the list of portals you hold keys to (or tap it on the compass). You need a 🔑 key to the far portal, and linking uses it up. A link that grows a network to 3 or more portals is worth more, and one that closes a triangle raises a **control field**. Links can't cross, and that includes other teams' links: knock out one of their portals first to bring its links down. |

Enemy teams attack the portals you hold: each hour, each one has a small chance to fall (and its links and fields go with it). More Uplinks, Firewalls, the **Defense** upgrade and **Team Level 10** make that less likely.

### Control fields and the world score

Close a triangle of links to raise a **control field**. A field's worth is its area: **1 Control Point (CP) per 1,000 m²** (at least 10). Bigger fields score more:

| | For every field |
| --- | --- |
| XP | 500 (Connect 3+ Portals) + a size bonus of 50 + CP ÷ 10 (up to 1,500) |
| Tech Cores | 10 + CP ÷ 20 (up to 300) |
| Faction Points | CP ÷ 20 (at least 5) |
| World score | The field's CP counts for your team at every checkpoint while you hold it |

Links work at any distance, so long links make big, valuable fields. A field disappears if one of its portals falls.

### World standings

**Team → 🌍 World standings** (or **☰ → World standings**) shows who's winning, like Ingress's global score:

- The war is scored in **cycles** of 175 hours, with a **checkpoint** every 5 hours (35 per cycle). At each checkpoint, every team's CP is counted, and the team with the highest **average** wins the cycle.
- A line chart shows every team's CP at each checkpoint so far (touch it for the numbers, or open it as a table), with the leader and the gap at the top.
- **Top agents this cycle** ranks you against the strongest players by the CP of the fields they hold.

The other players are simulated (there's no server), the same for everyone; your own fields count for your team live.

### Intel map

**Team → 🛰️ Intel map** (or **☰ → Intel map**) opens a map of every portal, like Ingress's Intel map. It's also a website, `intel.html`, that works on a computer:

- Every portal on real streets, coloured by the team that holds it and ringed by rarity. Tap one for its name, owner, level, Uplinks and your keys.
- Every team's links and control fields from zoom 13, in the team's colour. Tap a field for its CP. A link or field only stands while its team holds every one of its portals, so capture one and it's gone.
- Your own links and control fields drawn brighter on top, if you're logged into the game in the same browser or app.
- Filters for rarity, team and links & fields, 📍 to jump to where you are, and the world standings panel (tap the score bar).
- Portals show from street level (zoom 14) inwards.

The map uses [Leaflet](https://leafletjs.com/) (in `js/vendor/leaflet/`, BSD licence) with CARTO's dark street tiles of OpenStreetMap data. With GitHub Pages turned on (see below), the website is at `https://<your-user>.github.io/<repo>/portal-hackers/intel.html`.

### Gear

Open it with **🎒** at the top. You start with 6 Uplinks, 4 Pulse Bombs and 1 Firewall, and get more from hacking.

| Item | What it does |
| --- | --- |
| 📶 Uplink | Claims a neutral portal, or adds a level to your team's portal |
| 💥 Pulse Bomb | Knocks 2 Uplinks off an enemy portal |
| 🧱 Firewall | Helps your team's portal resist attacks (2 per portal) |
| 🔑 Portal Key | Lets you link to that portal; used up when you do |

**Energy** pays for hacks (5 / 10 / 15), Pulse Bombs (10), captures (20), deploying Uplinks and Firewalls (5) and links (10). It refills by itself, and Tech Cubes top it up.

### Accounts

- **Sign up** with a username (3–16 letters, numbers, `-` or `_`) and a password (6+ characters). **Log in** again with them any time.
- Accounts are saved **on this phone**. Several people can have their own account on one phone, each with their own hacker. An account doesn't follow you to another phone, because there's no server.
- Passwords are never stored as you typed them: each one is salted and hashed with PBKDF2-SHA256 (120,000 rounds).
- The phone remembers who's logged in. **☰ → Log out** switches account; **☰ → Change password** and **☰ → Delete account** are there too.
- If you played before accounts existed, the title screen offers **Continue as (your name)**: pick a password and your hacker moves into the new account.

### Team chat

Every team has one chat room, shared by every teammate who's online, anywhere. Open it from **Team → 💬 Team chat**. New messages pop up while you play, and a red dot appears on **Team**.

- Messages show each player's avatar, name colour, title and level.
- With **☰ → Share my captures** on, the room also hears when you capture a portal, raise a control field, reach a new rank, or help win a team event.
- Tap someone's name to mute them (☰ → Unmute everyone undoes it). Messages are text only, up to 200 characters, and at most 5 every 5 seconds.

How it works without a server: [PeerJS](https://peerjs.com/)'s free public server only introduces phones to each other, and messages go directly between phones (WebRTC). The first teammate in the room becomes its host and relays messages, handing newcomers the last 50. If the host leaves, another phone takes over within about 15 seconds. Nothing is stored anywhere except on the phones in the room, so a message sent when nobody else is online is only seen by you. Anyone who picks the same team can join its room, so don't share anything private.

### Shop

Tap your **⬢ Tech Cores** at the top (or **☰ → Shop**). Everything costs Tech Cores; there are no real-money purchases.

| Section | What's in it |
| --- | --- |
| Daily deals | 3 items at 30% off, new every day |
| Gear | 5 Uplinks (150), 5 Pulse Bombs (150), 2 Firewalls (200), Breach Crate (380) |
| Boosts | Energy Refill (100), Cooldown Reset for every portal near you (120) |
| Style | Avatars, name colours, profile banners, compass skins and titles (400–2,000) |

### Profile customisation

**Profile → Customise** changes how you look in your profile and in team chat:

- **Avatar:** 12 free, 4 that open at Levels 11, 21, 31 and 41, and 6 in the shop. It also shows in the top-left corner.
- **Name colour:** your team colour, white or sky for free, 4 more in the shop.
- **Banner:** the background of your profile card. Two free, Aurora at Level 15, Gold Circuit at Level 41, and 3 in the shop.
- **Title:** shown under your name. Earn titles from ranks, achievements and Prestige, or buy them.
- **Bio:** one line, up to 80 characters.
- **Showcase:** up to 3 badges or achievements on your card.

Compass skins and agent gear are still under **Profile → Cosmetics**.

### Missions

- **Daily:** three a day, from the ones you've unlocked. Do all three for the Daily Completion Bonus.
- **Squad** (Level 5+): three offers every 4 hours. Accept one and finish it within 45 minutes with your squad.
- **Legendary** (Level 35+): one a day, three stages in order: Expert Hack an Epic or better portal, capture an enemy portal, then discover a Nexus signal.
- **Team events:** a 30-minute event every 2 hours. Everything you do scores points for your team. If your team wins, you get 1,000 XP.

## The progression system

### XP rewards

| Action | XP Reward |
| --- | --- |
| Discover Common Portal | 50 XP |
| Discover Rare Portal | 150 XP |
| Discover Epic Portal | 300 XP |
| Discover Legendary Portal | 750 XP |
| Complete Basic Hack | 100 XP |
| Complete Advanced Hack | 250 XP |
| Complete Expert Hack | 500 XP |
| Capture Neutral Portal | 200 XP |
| Capture Enemy Portal | 350 XP |
| Defend Portal for 10 min | 100 XP |
| Defend Portal for 30 min | 350 XP |
| Connect 2 Portals | 250 XP |
| Connect 3+ Portals | 500 XP |
| Complete Squad Mission | 400 XP |
| Win Team Event | 1,000 XP |
| Discover Nexus Signal | 750 XP |
| Complete Legendary Mission | 2,000 XP |

**Daily XP Cap: 10,000 XP. Weekly XP Cap: 50,000 XP.** Every XP reward counts towards the caps, including missions. The day resets at midnight and the week on Monday, both in your local time. Tech Cores aren't capped.

### Levels

The full table is in the game (tap the progress card under the compass, or **☰ → Progression guide**). It goes from 500 XP for Level 1 → 2 up to 17,000 XP for Level 49 → 50, and Level 50 takes 374,000 XP in total.

| Level | XP to Next | Cumulative XP | Major Reward |
| --- | --- | --- | --- |
| 1 | 500 | 0 | Basic Compass |
| 2 | 750 | 500 | 100 Tech Cores |
| 3 | 1,000 | 1,250 | Scanner Upgrade |
| 4 | 1,250 | 2,250 | 150 Tech Cores |
| 5 | 1,500 | 3,500 | Squad Missions Unlocked |
| … | … | … | … |
| 30 | 9,000 | 128,500 | OPERATIVE Rank + Quantum Scanner |
| … | … | … | … |
| 49 | 17,000 | 357,000 | 2,500 Tech Cores |
| 50 | — | 374,000 | NEXUS MASTER |

What the rewards do:

- **Tech Cores** go straight to your balance.
- **Modules and upgrades** (Scanner Upgrade, Hacker Module, Energy Upgrade and so on) give a free level in that Compass branch. **Compass Module** (Level 6) is a free level in any branch you choose. **Ultimate Compass Module** (Level 47) adds a level to every branch. A free level on a branch that's already maxed pays 500 Tech Cores instead.
- **Cosmetics and compass skins** go to **Profile → Cosmetics**, where you equip them.
- **Rank rewards** (Levels 10, 20, 30, 40, 50) are rank badges.

### Ranks and unlocks

| Levels | Rank | Unlocks |
| --- | --- | --- |
| 1–10 | 🔭 SCOUT | Basic compass, portal scanner, basic hacking, portal linking, team, squad, Common portals |
| 11–20 | 💻 HACKER | Advanced hacks, capture Rare portals, portal defense, territory map |
| 21–30 | ⚡ OPERATIVE | Capture Epic portals, bigger link networks, Quantum scanner |
| 31–40 | 🌌 NEXUS AGENT | Capture Legendary portals, Legendary missions, Nexus technology |
| 41–50 | 👑 NEXUS MASTER | Master hacking, the last skins and cosmetics, Prestige |

Every 5 levels there's a major unlock:

| Level | Unlock |
| --- | --- |
| 5 | Squad Missions |
| 10 | Advanced Scanner (+50 m) |
| 15 | Portal Defense |
| 20 | Territory Map |
| 25 | Link Master Module (+1 Network) |
| 30 | Quantum Scanner (Nexus signals, Quantum branch) |
| 35 | Legendary Missions |
| 40 | Nexus Technology (Nexus portals) |
| 45 | Master Hacking (half cooldowns, one more mistake forgiven) |
| 50 | Nexus Master rank, Prestige |

Every portal shows on your compass from Level 1, and you can hack and attack any of them that your hacks allow. Capturing (and deploying Uplinks on) rarer portals opens as you rank up: Rare portals from Level 11, Epic from 21, Legendary from 31 and Nexus from 40. Advanced Hacks open at Level 11 and Expert Hacks at Level 17.

### Tech Cores

| Source | Tech Cores |
| --- | --- |
| Common Portal | 10 |
| Rare Portal | 25 |
| Epic Portal | 50 |
| Legendary Portal | 150 |
| Basic Hack | 15 |
| Advanced Hack | 35 |
| Expert Hack | 75 |
| Enemy Portal Capture | 50 |
| Tech Cube (picked up) | 5 |
| Squad Mission | 75 |
| Legendary Mission | 250 |
| Weekly Team Objective | 500 |

Portal cores are paid when you discover the portal. Tech Cubes aren't in the original table: they were added so the yellow cubes are worth picking up.

### Portal reward table

| Portal | XP | Tech Cores | Difficulty |
| --- | --- | --- | --- |
| 🔵 Common | 50–150 | 10–25 | Easy |
| 🟣 Rare | 150–400 | 25–75 | Medium |
| 🟠 Epic | 400–900 | 75–150 | Hard |
| 🟡 Legendary | 750–2,000 | 150–500 | Extreme |
| ⚫ Nexus | 2,000–5,000 | 500–2,000 | Endgame |

The range is what a portal is worth across discovering, hacking and capturing it. A Nexus portal pays a random amount in its range when you capture it.

### Daily missions

| Mission | Reward |
| --- | --- |
| Discover 3 portals | 300 XP + 50 Cores |
| Hack 3 portals | 500 XP + 75 Cores |
| Defend a portal | 400 XP + 50 Cores |
| Complete a squad mission | 600 XP + 100 Cores |
| Capture an enemy portal | 750 XP + 125 Cores |

Completing all 3 daily missions gives a **Daily Completion Bonus: 500 XP + 150 Tech Cores**. Defend and squad missions only come up once you've unlocked them.

### Compass upgrade tree

Spend Tech Cores on six branches, 10 levels each. Levels cost 150, 300, 500, 750, 1,000, 1,400, 1,800, 2,300, 2,900 and 3,500 Tech Cores. Quantum costs 1.5×.

| Branch | Effect per level |
| --- | --- |
| 📡 Scanner | Detection range +15 m (60 m base) |
| 💻 Hacking | +8% hack time and 5% slower codes. Level 5 forgives 1 mistake, Level 10 forgives 2. |
| 🔋 Energy | +20 max energy, +5 energy per cell, faster refill |
| 🛡️ Defense | Your portals resist attacks 7% better |
| 🔗 Network | +2 links you can hold |
| ⚛️ Quantum (Level 30+) | Nexus signals seen 60 m further, 4% chance of double hack cores |

You choose your own path: nothing is upgraded automatically except the free levels from level rewards.

### Teams

Squad missions, team events, Legendary Missions and weekly objectives earn **Faction Points**, which level up your team.

| Team Level | Benefit |
| --- | --- |
| 1 | Basic Headquarters |
| 5 | Better Portal Detection (+25 m scanner) |
| 10 | Team Portal Upgrades (portals resist attacks 20% better) |
| 20 | Special Team Missions (Special Team Ops in the squad list) |
| 30 | Legendary Events (team events pay double Faction Points) |
| 50 | Nexus War |

**Weekly team objectives** (they reset on Monday):

| Objective | Goal | Reward |
| --- | --- | --- |
| 1: Portal Network | Connect 1,000 portals | 25,000 Team XP + 5,000 Tech Cores |
| 2: Territory | Control 500 portals simultaneously | Exclusive Team Badge + 10,000 Team XP + 500 Tech Cores |
| 3: Nexus Hunt | Discover 100 Nexus signals | Legendary Team Cosmetic + 15,000 Team XP + 500 Tech Cores |

Team XP goes into your team's Faction Points. Objectives 2 and 3 don't list Tech Cores, so they pay the standard 500 for a Weekly Team Objective.

### Prestige

At Level 50 you can enter **NEXUS PRESTIGE** from your profile. Your level goes back to 1. You keep your cosmetics, achievements, badges, collectibles, Tech Cores and Compass upgrades, and your name gets a Prestige tag: **[P3] NovaPlayer**.

| Prestige | Reward |
| --- | --- |
| P1 | Prestige Badge + Compass Frame |
| P2 | Unique Portal Effect |
| P3 | Exclusive Player Title |
| P4 | Animated Compass Skin |
| P5 | Master Nexus Armor |
| P6+ | Prestige Stars + exclusive cosmetics |

### Profile

```
PLAYER LEVEL: 27
RANK: OPERATIVE
TEAM: NOVA
PORTALS HACKED: 184
PORTALS DEFENDED: 76
SQUAD MISSIONS: 42
NEXUS EVENTS: 8
PRESTIGE: 0
```

The profile also has your rank ladder, cosmetics, badges and achievements.

### The core loop

Explore → Discover → Hack → Earn XP → Level Up → Unlock → Upgrade Compass → Join Stronger Missions → Control More Portals → Compete → Reach Nexus Master

## How it works

- **The world:** there's no server. The globe is cut into cells about 120 m across, and each cell's portal is generated from its coordinates with a seeded random number generator, so everyone in the same place sees the same portals. A few portals change hands every day. Tech Cubes reroll every 10 minutes and Nexus signals every hour.
- **Other players:** your squadmates, the rest of your team and the other teams are simulated. Team progress, event scores and attacks on your portals come from seeds, so they're the same every time you look.
- **Your progress** is saved on your phone (`localStorage`), one save per account.
- **Team chat** uses PeerJS: see [Team chat](#team-chat). To test it without the internet, run a local PeerServer and add `?peerhost=localhost&peerport=9000&peerpath=/ph&peersecure=0` to the address.
- **The 3D view** is drawn on a 2D canvas with no 3D library: every point is projected through a simple perspective camera, and the crystals are flat-shaded solids drawn back to front.
- **Sound** is synthesized with WebAudio. There are no image or audio files apart from the app icons.

## Putting it on your phone

GPS only works over HTTPS, so the easiest way is GitHub Pages:

1. In the repository on GitHub, open **Settings → Pages**.
2. Under **Build and deployment**, pick **Deploy from a branch**, choose the branch that has this folder and `/ (root)`, then **Save**.
3. After a minute, open `https://<your-user>.github.io/<repo>/portal-hackers/` on your phone.
4. Allow location access when asked. On iPhone, tap the screen once and allow **Motion & Orientation** so the compass can turn.
5. To add it to your home screen:
   - **iPhone (Safari):** Share button → **Add to Home Screen**.
   - **Android (Chrome):** ⋮ menu → **Add to Home screen** (or **Install app**).

It works offline after the first visit.

To try it on a computer: `cd portal-hackers && python3 -m http.server 8000`, open `http://localhost:8000`, and pick **Play at home**.

## Play safe

Stay aware of your surroundings. Don't go onto private property, and never play while driving or cycling. When you move faster than about 40 km/h, the scanner pauses.

## Files

| File | What it does |
| --- | --- |
| `index.html` | The screens: onboarding, compass, hack puzzle, panels |
| `css/style.css` | All the styling |
| `js/core.js` | Seeded random numbers and small helpers |
| `js/data.js` | **Every number in the progression system:** XP and Tech Core rewards, caps, the level table, ranks, unlocks, upgrades, cosmetics, missions, objectives, team levels, Prestige |
| `js/world.js` | Generates portals, Tech Cubes and Nexus signals from real coordinates |
| `js/accounts.js` | Sign-up, log-in and passwords |
| `js/state.js` | Your save and the game rules, including the shop and profile customisation |
| `js/chat.js` | Team chat over PeerJS |
| `js/score.js` | Control Points, cycles and checkpoints, the simulated world score, top agents |
| `js/worldchart.js` | The world standings chart, shared by the game and the Intel map |
| `intel.html`, `js/intel.js` | The Intel map website |
| `js/vendor/leaflet/` | Leaflet 1.9.4, the map library for the Intel map (BSD licence, see `LEAFLET-LICENSE`) |
| `js/vendor/peerjs.min.js` | PeerJS 1.x (MIT licence, see `PEERJS-LICENSE`) |
| `js/compass.js` | The 3D Sci-Fi Compass: camera, projection, and drawing the disc, portals, links and you |
| `js/hack.js` | The hacking puzzle |
| `js/ui.js` | The HUD, progress card, nearest-portal bar and all the panels |
| `js/audio.js` | Synthesized sound effects and vibration |
| `js/main.js` | Start-up, onboarding, GPS and tap-to-walk, the game loop |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline support and home-screen install |
