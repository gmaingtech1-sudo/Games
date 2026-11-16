# Rollmancer

A dice roguelite for phones. Roll your dice, hold the ones you like, reroll the rest, and **Cast**: your best combo showing becomes a spell that hits the monster for **Pips × Mult** damage. Fight down through eight Depths of monsters and bosses, collect charms that bend the rules, etch glyphs onto the faces of your dice, and defeat the Pipwyrm. Then turn up the Heat.

It's plain HTML, CSS and JavaScript. There's no build step and nothing to install. The monsters, dice, effects, sound effects and music are all drawn or synthesised in code, and the fonts ship with it, so it works fully offline. There's also an installable Android app in [`../rollmancer-android`](../rollmancer-android), and [`SELLING.md`](SELLING.md) covers putting it on Google Play and itch.io.

## Playing

### A fight

| Step | What you do |
| --- | --- |
| **Roll** | Every turn starts with your dice rolled. |
| **Hold** | Tap a die to hold it (it lifts up and glows). Held dice stay put when you reroll. |
| **Reroll** | Throws every die you didn't hold. Rerolls are shared across the whole fight (3 to start with), so spend them wisely. |
| **Cast** | Your best combo showing hits the monster. The panel above your dice always shows what a Cast would do right now; the damage turns gold when it would finish the monster off. |

You have 4 Casts per fight. Bring the monster's HP to zero before they run out, or you lose a heart (and no gold) and get driven deeper anyway. Lose your last heart and the run is over. The exception is the Pipwyrm at the bottom of Depth 8: lose to it and you face it again after a trip to the bazaar.

Winning pays gold: $3 for a minion, $4 for a brute, $6 for a boss, plus $1 for each Cast you didn't need.

### Damage

**Damage = Pips × Mult.** Pips start at the combo's base and add each scoring die's number (a Pair of 6s has more Pips than a Pair of 2s). Glyphs and charms then add Pips, add Mult or multiply Mult as each die scores, left to right, then each charm in your row, left to right. The cast plays out step by step so you can see every bonus land.

| Combo | Pips × Mult | Per level |
| --- | --- | --- |
| High Die | 5 × 1 | +10 / +1 |
| Pair | 10 × 2 | +15 / +1 |
| Two Pair | 20 × 2 | +20 / +1 |
| Three of a Kind | 30 × 3 | +20 / +2 |
| Small Straight (4 in a row) | 30 × 3 | +25 / +2 |
| Full House | 40 × 4 | +25 / +2 |
| Large Straight (5 in a row) | 45 × 4 | +30 / +3 |
| Four of a Kind | 60 × 7 | +30 / +3 |
| Five of a Kind | 120 × 12 | +40 / +4 |
| Three Pairs, Grand Straight, Twin Triples, Six of a Kind | need a sixth die | |

### Glyphs

Stones from the bazaar etch a glyph onto one face of one die, for the rest of the run.

| Glyph | When that face scores |
| --- | --- |
| Flame | +15 Pips |
| Storm | +4 Mult |
| Prism | ×1.5 Mult |
| Gold | +$2 |
| Lucky | 1 in 3: +10 Mult, and 1 in 8: +$8 |
| Wild | Counts as whatever number makes the best combo |
| Echo | The die scores twice |
| Loaded | That face lands up twice as often |

The **Chisel** carves +1 pip onto a face (up to 9, so straights can run past 6), and the **Twin Stone** copies one face onto another face of the same die.

### The bazaar

After every fight you visit the Wandering Bazaar. It sells:

- **Charms** (5 slots): 48 of them, common to rare. Flat bonuses (*Whetted Blade*: +4 Mult), conditions (*Snake Eyes*: scoring 1s give +8 Mult), multipliers (*Last Word*: ×3 Mult on your final cast), scaling (*Grindstone* gains Mult every triple; *Metronome* gains ×0.15 Mult every win), economy (*Piggy Bank*, *Midas Touch*, *Overkill*), rule-breakers (*Chameleon*: 1s are wild; *Ouroboros*: straights loop 6→1; *Spare Die*: roll a sixth die) and more. Charms work left to right, so you can reorder them; tap one to move or sell it.
- **Stones** to etch glyphs, **tomes** that level up a combo, a **Heart Tonic** now and then, and **trinkets**: one-use tricks kept on your belt for mid-fight emergencies (*Nudge* a die up one pip, *Flip* one to its opposite face, *Copycat* one die onto another, +1 Cast, +2 Rerolls, or ×2 Mult on your next cast).
- **New stock** for $2, rising by $1 each time.

The bar at the bottom shows the next monster and, for a boss, its rule, so you can shop for it.

### Depths, brutes and bosses

Each Depth has three fights: a minion, a **brute** with a trait (*Armored*, *Swift*, *Greedy*, *Regenerating* or *Warded*) and a **boss** with a rule that works against you. Every two Depths is a new area: the Mossy Cellar, the Bone Crypt, the Ember Forge and the Void Sanctum.

| Boss | Its rule |
| --- | --- |
| The Oddmaw / The Evenhand | Odd (or even) dice score no Pips |
| The Miser King | Every Reroll costs $1 |
| The Glutton | You roll one fewer die |
| The Frost Lich | One die freezes each turn and can't be rerolled |
| The Twin Wraiths | Pairs and Two Pairs deal half damage |
| The Siren | A combo you've already cast this fight deals no damage |
| The Leveller | Every combo counts as level 1 |
| The Iron Warden | Shrugs off the first 15% of its max HP from every cast |
| The Hydra | Heals 10% of its max HP after each of your casts |
| The Gorgon | No Rerolls, but +2 Casts |
| The Mimic Lord | Your leftmost charm does nothing |
| **The Pipwyrm** (Depth 8) | Each cast, a random charm falls asleep |

Beating a boss earns a **boon**, one of three: +1 Reroll every fight, +1 Cast every fight, an extra charm or trinket slot, $15, restored hearts, two combo levels, a free rare charm, a Wild glyph or a sixth die.

Beat the Pipwyrm and the run counts as a win. You can stop there or keep descending into endless Depths.

### Dice sets and Heat

Each run starts with a dice set. The others unlock as you play.

| Dice set | Start | Unlocks |
| --- | --- | --- |
| Apprentice Dice | Five plain dice | From the start |
| Ember Dice | A Flame glyph on every 6 | Reach Depth 3 |
| Gilded Dice | A Gold glyph on every 1, +$6 | Win 12 fights in total |
| Clover Dice | A Lucky glyph on every 3, plus the Four-Leaf Clover | Reach Depth 5 |
| Storm Dice | Storm glyphs on every 2 and 5, −1 Reroll | Cast a Four of a Kind |
| Loaded Dice | Faces numbered 2 to 7 | Cast a Five of a Kind |
| Gambler's Dice | 1 heart, +1 Cast, the Rabbit's Foot | Win a run |
| Hexad Dice | Six dice, −1 Cast | Reach Depth 7 |
| Chaos Dice | Random numbers 1–9 and a random glyph per die | Win a run on Heat 2+ |

**Heat** is the difficulty, from 0 to 8, unlocked one step at a time per dice set by winning. Each level stacks: more monster HP, fewer Rerolls, pricier shops, fewer hearts, traits on every monster and finally one fewer Cast.

### Daily Run, feats and the codex

- **Daily Run:** everyone gets the same dice set, monsters and shops each day (on Heat 1). Your first attempt counts; share your result as a row of squares.
- **Feats:** 24 achievements, from *First Blood* to dealing 10 million damage in one cast.
- **Codex:** every charm you've discovered, combo values, glyphs, bosses, feats and your lifetime stats.
- Every run has a **seed** (like `K7Q-2MX`), shown on the run map and the summary. Type it into the seed box on the setup screen to play the same run again, or send it to a friend.

### Controls

Touch is the main way to play. On a keyboard: **1–6** hold dice, **R** rerolls, **Space** or **Enter** casts, **Esc** opens the menu.

## Putting it on your phone

The game has to be served over HTTPS for offline play and "Add to Home Screen" to work. The simplest way is GitHub Pages:

1. In the repository on GitHub, open **Settings → Pages**.
2. Under **Build and deployment**, pick **Deploy from a branch**, choose the branch that has this folder and `/ (root)`, then **Save**.
3. After a minute, open `https://<your-user>.github.io/<repo>/rollmancer/` on your phone.
4. Add it to your home screen:
   - **iPhone (Safari):** Share button → **Add to Home Screen**.
   - **Android (Chrome):** ⋮ menu → **Add to Home screen** / **Install app**.

Or install the Android app: [`../rollmancer-android`](../rollmancer-android).

## Running it locally

```sh
cd rollmancer
python3 -m http.server 8000
```

Then open <http://localhost:8000>. Opening `index.html` straight from the file system also works, but without offline support.

## How it's built

| File | What it does |
| --- | --- |
| `index.html` | Layout: title, setup, the battle HUD, the bazaar, and the sheet that every pop-up uses |
| `css/style.css` | All styling. Mobile-first portrait, safe areas, reduced motion; a centred column on wide screens |
| `js/core.js` | Maths, seeded random streams, seed codes, number formatting |
| `js/data.js` | The catalogue: combos, glyphs, all 48 charms, stones, trinkets, boons, monsters, bosses, traits, the HP curve, dice sets, Heat and feats |
| `js/rules.js` | The rules on a plain JSON `run` object: fights, rolling, combo detection (including wilds), the scoring pipeline, shops, boons, trinkets. No DOM, so it also runs in Node |
| `js/profile.js` | Your save, unlocks and feats; the bridge to the Android app (storage, vibration, sharing) |
| `js/art.js` | Draws the dice, glyphs, 12 monster body plans with all their variants and bosses, and the dungeon backdrops |
| `js/fx.js` | Particles, floating numbers, rings, lightning, spell orbs, shake and flashes |
| `js/battle.js` | The scene canvas: monster, dice tray, rolling animation and the step-by-step cast |
| `js/ui.js` | The HUD, shop, setup, title and every sheet (rewards, boons, etching, charms, dice, combos, codex, settings, how to play) |
| `js/audio.js` | Sound effects and per-area music, synthesised with WebAudio |
| `js/main.js` | Game flow, actions, saving, first-run tips, the Android back button |
| `sw.js`, `manifest.webmanifest`, `icons/`, `fonts/` | Installable app + offline support; the fonts are Lilita One and Nunito (SIL Open Font License, licences in `fonts/`) |
| `privacy.html` | The privacy policy the stores ask for |

Progress is saved after every action, so closing the app mid-fight is safe.

### Tools

| Tool | What it does |
| --- | --- |
| `node tools/sim.js [runs] [set] [heat]` | Balance simulator: a plain bot plays many runs with the real rules and reports how deep it gets (about 8% wins on Heat 0, 0% on Heat 8) |
| `node tools/fuzz.js [runs]` | Plays thousands of random-choice runs on every set and Heat and checks the run stays consistent |
| `tools/gallery.html` | Every monster and glyph face on one page, for checking the art |
| `node tools/store-shots.js` | Rebuilds the store images in `store/` from the live game (serve the folder on port 8123 first) |
| `tools/feature.html` | The 1024 × 500 Play Store feature graphic |
| `tools/make-web-zip.sh` | Builds `dist/rollmancer-web.zip` for itch.io |

### Tuning

- Monster HP: `BASE_HP` and `monsterHp()` in `js/data.js`. Rewards: `REWARD`.
- Charm effects and prices: `CHARMS` in `js/data.js`. Shop odds: `rollCharm()` and `rollGood()` in `js/rules.js`.
- Casts and Rerolls per fight: `castsFor()` and `rerollsFor()` in `js/rules.js`.
- After changing the balance, run `node tools/sim.js` to see the effect, and `node tools/fuzz.js` to make sure nothing broke.
- When you change any file, bump `CACHE` in `sw.js` so installed copies pick up the update.
