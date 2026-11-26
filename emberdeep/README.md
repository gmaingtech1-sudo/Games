# Emberdeep

An idle dungeon crawler for phones. The village Hearth is going out, and somewhere under the mountain old embers still glow, floor after floor of them. Hire a party of heroes and send them down. They fight on their own, they keep going while your phone is in your pocket, and when they can't get any deeper you lead them home, feed the embers to the Hearth, and start again, stronger.

It's plain HTML, CSS and JavaScript. There's no build step and nothing to install. Every hero, monster, cave, relic, sound effect and note of music is drawn or synthesised in code, so the only image files are the app icons. After the first visit it also works offline.

## Playing

### The delve

Your party fights on the left of the screen and monsters come at them from the right. Each floor has 8 monsters. Every 5th floor is a **boss** you have 30 seconds to beat, and every 25th is a biome's **Guardian**. Beat a boss and you walk down to the next floor. Run out of time and your party falls back a floor to "farm" (fight that floor over and over for gold) until they're strong enough. With **Auto-challenge bosses** on (it is by default) they walk back down by themselves as soon as they'd win. Otherwise tap **Fight boss**.

**Tap** the fight to strike with your torch. Crits do ×5. Every so often a glowing **wisp** drifts across the top of the cave: tap it for a pile of gold, a ×3 damage burst, recharged skills or moonstones.

There are eight biomes, 25 floors each: Mossglow Caverns, Sporelight Grotto, Crystal Hollows, Sunken Ruins, Magma Forge, Frostdeep, the Bone Catacombs and the Hollow Dark. Below floor 200 they come round again in stranger colours (Mossglow Caverns II, and so on). Floor 5,000 is the bottom, where the Ember Heart waits.

### Heroes

| Hero | Class | Attack | Perks (levels 50 / 150 / 400) |
| --- | --- | --- | --- |
| Bram | Knight | Sword lunge | +25% party damage / +3 s boss timer / +100% party damage |
| Wren | Ranger | Arrows | +2% crit chance / +×1 crit damage / +3% crit chance |
| Pip | Pyromancer | Fireballs | +30% party damage / +50% boss damage / +100% party damage |
| Sister Maud | Cleric | Holy light from above | +40% / +60% / +150% party damage |
| Kit | Rogue | Thrown daggers | +25% / +50% / +100% gold |
| Granite | Stonewarden | Ground-slam shockwave | +50% boss damage / +3 s boss timer / +100% boss damage |
| Lyra | Bard | Music notes | +100% tap damage / taps deal +2% of party DPS / +100% party damage |
| Vesper | Warlock | Void bolts | +×1 crit damage / +75% party damage / +×2 crit damage |
| Thorne | Druid | Thorns from the ground | +40% gold / +75% party damage / +100% gold |
| Cinder | Dragonling | Fire breath | +50% party damage / +100% boss damage / +200% party damage |
| Auriel | Valkyrie | Spear of light | +3% crit chance / +100% / +200% party damage |
| Echo | Phantom Knight | Ghostly blade | +100% party damage / +100% gold / +300% party damage |

Each level costs 7% more than the last. A hero's damage doubles at level 10, again every 25 levels, and quadruples every 200. The buy buttons can buy ×1, ×10, up to the **Next** milestone, or the **Max** you can afford. **Your Torch** is your tap: it doubles every 25 levels, and the party's DPS adds to it too.

### Skills

| Skill | Unlocks | Does | Recharge |
| --- | --- | --- | --- |
| Battle Cry | Floor 8 | Heroes deal ×2 damage for 30 s | 10 min |
| Golden Hour | Floor 15 | ×3 gold for 30 s | 12 min |
| Flurry | Floor 25 | Your torch strikes 12 times a second for 20 s | 10 min |
| Starfall | Floor 40 | A falling star deals 2 minutes of party damage at once | 15 min |
| Hourglass | Floor 70 | Lives through 30 minutes of AFK progress in an instant | 4 h |

Skills recharge in real time, including while the game is closed. Keys 1–5 cast them on a keyboard, and Space strikes.

### While you're away

Close the game and your party keeps delving for up to 12 hours: the same monsters, bosses, gold and relic chests as if you'd watched. When you come back, a card shows what they did. Once you have the **Quartermaster** (the first Hearth talent, 1 ember), he spends your gold on the best upgrade every second, while you're watching and while you're not, so a party left overnight can be dozens of floors deeper by morning. The Hearth's Time talents make the AFK window longer (36 hours with every level of Long Vigil, more with relics) and the party stronger while you're gone.

### Rekindling the Hearth

From floor 50, the **Hearth** tab lets you rekindle: heroes, gold and floors start over, and you bring back **embers** for how deep you got (more the deeper you went). Embers do two things:

- **Hearth warmth.** Every ember you've ever earned makes all damage and gold bigger, and spending them doesn't take that away.
- **Talents.** Spend them in four branches:

| Branch | Talents |
| --- | --- |
| Might | Kindled Blades (×1.25 damage a level, no limit), Steady Hand (crit chance), Ruinous Crits (crit damage), Giant Slayer (boss damage), Emberbrand (taps deal a share of party DPS) |
| Fortune | Prospector (×1.25 gold a level, no limit), Starting Purse, Treasure Sense (chest chance), Wisp Whistle, Ember Harvest |
| Time | Quartermaster (auto-levels heroes), Long Vigil (+2 h away per level), Lucid Dreams (stronger while away), Echoing Skills (auto-casts skills), Patience (+2 s boss timer), Deep Hourglass |
| Delving | Lift Shaft (start runs deeper), Shortcut (fewer monsters per floor), Bottomless Leap (chance to skip floors), Swift Feet (monsters arrive faster) |

### Relics

24 relics in four rarities, from a Rusty Pick (+20% gold) to a Pocket Sun (+150% hero damage). Guardians have a 20% chance to drop a chest, and the first time you beat each Guardian always gives one. A relic you already own goes up a level, to 25, and after that more copies turn into moonstones. Relics are kept forever.

### Moonstones, feats and the daily gift

**Moonstones** come from feats, the daily gift, wisps and first-time Guardian kills. The Shop sells a Relic Chest (120), a Time Flask (two hours of AFK progress, 50), a Gilded Banner (double gold for an hour, even while you're away, 40) and Second Wind (every skill ready, 15). **Feats** are 13 milestone ladders (floors, monsters, bosses, taps, crits, gold, rekindles and more) that pay out moonstones tier by tier. The **daily gift** is a 7-day loop: moonstones, gold, an hour of AFK progress, and a relic chest on day 7. Missing a day doesn't reset it.

## Putting it on your phone

The game has to be served over HTTPS for offline play and "Add to Home Screen" to work. The simplest way is GitHub Pages:

1. In the repository on GitHub, open **Settings → Pages**.
2. Under **Build and deployment**, pick **Deploy from a branch**, choose the branch that has this folder and `/ (root)`, then **Save**.
3. After a minute, open `https://<your-user>.github.io/<repo>/emberdeep/` on your phone.
4. Add it to your home screen:
   - **iPhone (Safari):** Share button → **Add to Home Screen**.
   - **Android (Chrome):** ⋮ menu → **Add to Home screen** / **Install app**.

Launched from the home screen, it runs full screen like an app and keeps working without a connection.

## Running it locally

```sh
cd emberdeep
python3 -m http.server 8000
```

Then open <http://localhost:8000>. To try it on your phone, connect it to the same Wi-Fi and open `http://<your-computer's-IP>:8000`. Opening `index.html` straight from the file system also works, but without offline support.

## How it's built

| File | What it does |
| --- | --- |
| `index.html` | Layout: the top bar, the battle and its HUD, skill buttons, the five tabs, the settings sheet |
| `css/style.css` | All styling. Mobile-first, respects safe areas (notches) and reduced-motion settings; battle and menus side by side on wide screens |
| `js/core.js` | Maths and colour helpers, number formatting (K, M, B… then aa, ab… or scientific), a small event bus, storage |
| `js/data.js` | The catalogue: heroes, biomes and their monsters and bosses, skills, relics, Hearth talents, feats, the daily gift, the shop |
| `js/econ.js` | The numbers: monster health and gold per floor, hero prices and damage, embers, and `stats()`, which folds every bonus into one object |
| `js/state.js` | The save and every action on it: kills, bosses, relic chests, buying, the Quartermaster, rekindling, feats, saving, save codes |
| `js/sim.js` | The fast-forward: plays the save for any number of seconds without drawing. Used for time away, the Hourglass and Time Flasks |
| `js/art.js` | Draws the heroes, thirteen kinds of monster, the cave backdrops and the relic icons |
| `js/battle.js` | The live fight: hero attacks, projectiles, taps, damage numbers, wisps, particles, walking between floors |
| `js/audio.js` | Sound effects and a generative cave soundtrack in each biome's own mode, synthesised with WebAudio (no audio files) |
| `js/ui.js` | The top bar, HUD, skill buttons, all five tabs, and the pop-up cards |
| `js/main.js` | The controller: main loop, saving, catching up on time away, skills, wisps, rekindling, the daily gift and the shop |
| `sw.js`, `manifest.webmanifest`, `icons/` | Installable app + offline support |
| `tools/balance.js` | A pacing check that plays the game in Node (see below) |

The live battle and the offline simulation both change the save through the same functions in `state.js`, so time away plays by exactly the same rules as time watched.

Progress is saved in the browser's `localStorage`, so each phone or browser has its own delve. **Settings → Copy save** gives you a code you can paste into **Load save** on another device.

### Tuning

- Monster health curve, gold, boss timers, the AFK window and Hearth warmth: `T` at the top of `js/econ.js`. Embers per rekindle: `embersFor()` in the same file.
- Hero prices, damage and perks: `HEROES` in `js/data.js`. Relics, talents, skills, feats, the daily gift and the shop are all in that file too.
- Check what a change does to the pacing:

  ```sh
  node tools/balance.js              # an active player who taps and buys the best upgrade
  node tools/balance.js --afk        # a player who checks in every 4 hours
  node tools/balance.js --runs 40    # more rekindles
  ```

  It prints how deep each run gets, how long it took, and how many embers it earned.
- When you change any file, bump `CACHE` in `sw.js` so installed copies pick up the update.
