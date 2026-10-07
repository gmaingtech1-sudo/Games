# Wayfarers

An AFK adventure for phones. A party of chibi heroes marches through stage after stage of monsters on its own, and keeps fighting even when the game is closed. Come back to claim their loot, level them up, summon new heroes, and push deeper into the lands.

It's plain HTML, CSS and JavaScript. There's no build step and nothing to install. Heroes, monsters, lands, effects and sounds are all drawn or synthesised in code, so the only image files are the app icons. After the first visit it also works offline.

## Playing

The fight runs by itself. Your job is to make the party stronger.

- **Gold** drops from every foe. Spend it on **hero levels** (Heroes tab) and **camp upgrades** (Camp tab). Use ×1 / ×10 / Max to choose how many levels a tap buys.
- **Stages** come in chapters of ten, and the tenth is a **boss**. Clear a stage within 45 seconds or your party falls back to farm the stage before it. Tap **Challenge** once you're stronger, or turn **Auto-push** back on.
- **The AFK chest** fills with gold and gems all the time, including while the game is closed, for up to 12 hours. The further you've got, the faster it fills. Claim it from the AFK tab. When you come back after a while, a welcome screen shows what your heroes collected.
- **Fast rewards** hand you 2 hours of AFK gold right away: free once a day, then 50 gems.
- **Gems** come from the chest, first-time boss kills and quests. Spend them at the **altar** (Summon tab): 100 for one hero, 900 for ten with an Epic or better guaranteed, and one free summon about every day.
- **Copies** of a hero you already have let them **ascend** to more stars. Each star makes them 45% stronger, up to 5 stars.
- **Rebirth** at the camp's shrine once you reach stage 4-10. You start again from 1-1, with heroes back at level 1 and no gold or camp upgrades, but you keep your heroes, stars and gems, and earn **soul stones**. Each soul stone gives +10% attack, health and gold for good, so every run gets further than the last.
- **Quests** pay gems for milestones: stages cleared, foes and bosses beaten, hero levels, summons and more.
- The **×1** button on the battle speeds the fight up to ×2 or ×3.

### Heroes

Up to five heroes fight at once. Tanks, warriors and rogues stand at the front and take the hits. Archers, mages and healers stay at the back. Each hero fills an energy bar (the yellow line under their health) by attacking and getting hit, and fires their skill when it's full.

| Hero | Rarity | Role | Skill |
| --- | --- | --- | --- |
| Brom | Common | Tank | Shield Wall: shields the whole party |
| Wren | Common | Archer | Piercing Shot: 400% attack to one foe |
| Pip | Common | Warrior | Big Swing: 350% attack to one foe |
| Moss | Common | Healer | Bloom: heals the whole party |
| Sable | Rare | Rogue | Backstab: 600% attack to the weakest foe |
| Ember | Rare | Mage | Fireburst: 200% attack to every foe |
| Thorne | Rare | Tank | Lay on Hands: heals the whole party |
| Kestrel | Rare | Archer | Net Volley: hits and stuns every foe |
| Vex | Epic | Mage | Hexstorm: 300% attack to every foe |
| Aurelia | Epic | Warrior | War Cry: the party hits 60% harder for 5 s |
| Nyx | Legendary | Rogue | Eclipse: 1,100% attack to the weakest foe |
| Solenne | Legendary | Mage | Starfall: big hits and a long stun on every foe |

### Lands

Greenmeadow, Hollow Wood, Sunscar Dunes, Frostpeak, the Ashen Crags and the Starless Keep, each with its own monsters and boss (King Slime, Old Treant, Sand Pharaoh, Frostwyrm, the Infernal and the Lich King). After the sixth land they come round again, darker and tougher.

## Putting it on your phone

The game has to be served over HTTPS for offline play and "Add to Home Screen" to work. The simplest way is GitHub Pages:

1. In the repository on GitHub, open **Settings → Pages**.
2. Under **Build and deployment**, pick **Deploy from a branch**, choose the branch that has this folder and `/ (root)`, then **Save**.
3. After a minute, open `https://<your-user>.github.io/<repo>/wayfarers/` on your phone.
4. Add it to your home screen:
   - **iPhone (Safari):** Share button → **Add to Home Screen**.
   - **Android (Chrome):** ⋮ menu → **Add to Home screen** / **Install app**.

## Running it locally

```sh
cd wayfarers
python3 -m http.server 8000
```

Then open <http://localhost:8000>. Opening `index.html` straight from the file system also works, but without offline support.

## How it's built

| File | What it does |
| --- | --- |
| `index.html` | Layout: resource bar, battle scene, the five menu pages, tabs, sheets |
| `css/style.css` | All styling. Mobile-first, respects safe areas (notches) and reduced-motion settings |
| `js/data.js` | The catalogue and every formula: heroes, lands, monsters, camp upgrades, quests, costs and scaling |
| `js/state.js` | Your save and everything you can do with it: levelling, summoning, ascending, upgrades, the AFK chest, quests, rebirth |
| `js/battle.js` | One stage's fight: attack timers, targeting, skills, shields, stuns and the stage timer |
| `js/render.js` | Draws the scrolling lands, heroes, monsters, projectiles, effects and floating numbers, and the menu portraits |
| `js/ui.js` | The menus, hero sheet, summon results, welcome-back screen, settings and toasts |
| `js/audio.js` | Sound effects synthesised with WebAudio (no audio files) |
| `js/main.js` | Start-up, the main loop, saving and time spent away |
| `sw.js`, `manifest.webmanifest`, `icons/` | Installable app + offline support |

Progress is saved in the browser's `localStorage`. Time away is worked out from the clock when you come back, so loot also piles up while the phone is asleep or the tab is in the background.

`data.js`, `state.js` and `battle.js` don't touch the page, so they also load in Node. That makes it easy to simulate a player and check the balance after changing numbers.

### Tuning

- How fast monsters get tougher, and what they're worth: `enemyHp`, `enemyAtk` and `goldPerKill` in `js/data.js`.
- Hero growth and level costs: `levelMult`, `starMult` and `levelCost`. Hero base stats: `ROLE` and `RARITY`.
- AFK chest speed and cap: `afkRate` and `AFK_CAP`. Summon prices and odds: `SUMMON_GEMS`, `SUMMON10_GEMS` and `RARITY` weights.
- Rebirth: `REBIRTH_AT`, `soulsFor` and `SOUL_BONUS`.
- Starting gems and heroes: `defaults()` in `js/state.js`.
- When you change any file, bump `CACHE` in `sw.js` so installed copies pick up the update.
