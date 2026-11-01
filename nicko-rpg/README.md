# Nicko RPG

A dark-fantasy, turn-based role-playing game that runs in any modern browser and as an Android app. Create a hero, explore ten dangerous locations, fight monsters, collect loot, learn skills, complete quests and defeat a major boss every five levels, from the Goblin King at level 5 to the Eternal Tyrant at level 50.

No accounts, servers, frameworks or paid services. Progress is saved in your browser.

**Android:** an installable APK is in [`../nicko-rpg-android`](../nicko-rpg-android).

## Running it

The game uses JavaScript ES modules, which browsers only load over `http://`, not from a `file://` path. Start any static web server in this folder:

```sh
cd nicko-rpg
python3 -m http.server 8080        # or: npx serve .
```

Then open <http://localhost:8080>. (`npm start` runs the Python command for you.)

### Tests

```sh
node tests/logic.test.js     # 59 tests of the game systems (Node 18+)
node tests/ui.test.cjs       # 24 browser tests with Playwright + Chromium
node tests/balance.sim.js    # balance simulation: win rates and fight lengths by class and level
```

`ui.test.cjs` starts its own server. Set `SHOTS=/some/dir` to save screenshots.

## Controls

Everything works by tap or click. On a desktop you can also use the keyboard:

| Where | Key | Action |
| --- | --- | --- |
| Combat | `A` | Attack |
| Combat | `D` | Defend |
| Combat | `I` | Open or close items |
| Combat | `F` | Flee |
| Combat | `1`–`9` | Use ability 1–9 |
| Location | `E` | Explore |
| Anywhere | `Esc` | Close a dialog |
| Anywhere | `Tab` / `Enter` | Move between and press buttons |

On touch screens, long-press anything with extra details (items, abilities, status effects) to see its tooltip. On Android the back button closes dialogs and steps back through screens.

## Features

**Screens.** Main menu (New Game, Continue, Load, Settings, Credits; Continue is only enabled when a valid save exists), New Game slot picker, Character Creation, the main game (town and world map), Character Statistics, Inventory, Equipment, Skill Tree, Quest Journal, Shop, Boss Arena, Enemy Creator, Settings, Save & Load and Game Over.

**Classes.** Each class has its own stats, growth, strengths, weaknesses and play style.

| Class | Style | Starting abilities |
| --- | --- | --- |
| Warrior | Highest health and defence, fast mana regeneration, stuns | Heavy Strike, Shield Block |
| Mage | Huge elemental damage, shields, lowest health | Firebolt, Arcane Shield |
| Rogue | Fastest, dodges, high crits, stacking poison | Quick Strike, Shadowstep |
| Ranger | Accurate shots, damage over time, traps, self-healing | Aimed Shot, Poison Arrow |

**Character statistics.** Level, experience and experience to the next level, health, mana, attack, defence, speed, critical chance, critical damage, elemental resistance, gold and skill points. Levels go up to 50. The experience curve grows with each level (`50·L^1.6 + 30·L`). A level-up raises max health and mana, improves stats, awards a skill point (two every tenth level), restores 30% of health and mana, and shows a banner. Stats are always recalculated from scratch (class + level + equipment + passives), so they can't go negative or pick up a bonus twice.

**Turn-based combat.** Attack, abilities, items, Defend and Flee (not against bosses). Damage is `raw² / (raw + defence)`, where raw = attack × ability multiplier. On top of that come ±10% variance, critical hits, elemental weaknesses (×1.5) and resistances (×0.5), elemental resistance, Marked and Guard effects, and Defend. Decisions matter:
- Enemies and bosses telegraph big **charged attacks**. Defending cuts the damage to a quarter and blocks the side effects, and stunning or freezing the attacker interrupts the charge.
- Each enemy type has its own weaknesses, resistances and immunities. Skeletons ignore poison and bleeding, wraiths resist weapons, trolls regenerate, and golems shrug off ice.
- Mana regenerates slowly each turn. Defending restores 10%.

The engine rejects any action outside the player's turn or after the fight ends. While the turn animates, the buttons are locked and keyboard input is ignored. A fight always ends (victory, defeat, escape, or a turn-250 safety limit), and the 200-battle random test checks this.

**Abilities.** 44 data-driven abilities. Each has a mana cost that scales gently with level, a damage multiplier, hits, element, healing, cooldown, status effects, a required level and a class or skill unlock. They include Fireball, Ice Spear, Thunder Strike, Healing Light, Poison Blade, Shadow Strike, Whirlwind, Power Shot, Meteor and four ultimates per class.

**Skill tree.** Three branches per class (Warrior: Offensive, Defensive, Berserker; Mage: Fire, Ice, Arcane; Rogue: Assassination, Evasion, Shadow Magic; Ranger: Archery, Traps, Nature). Each branch has five tiers: active abilities at tiers 1, 3 and 5 (the ultimate) and three-rank passives at tiers 2 and 4. Locked nodes show exactly what's missing: level, the previous tier, or points. You can reset the tree for gold.

**Enemies.** 20 enemy types (Slime, Goblin, Goblin Shaman, Skeleton, Wolf, Giant Spider, Orc Warrior, Dark Mage, Troll, Wraith, Frost Wolf, Ice Golem, Frost Troll, Shadow Fiend, Void Stalker, Dragon Cultist, Drake, Abyssal Horror, Lich Acolyte). They have six behaviours (aggressive, defensive, caster, trickster, berserker, balanced) and 40+ abilities. Stats scale with level and vary ±8% per encounter, and 8% of encounters are Elite (tougher, double rewards, better loot). The enemy AI follows clear, testable rules: release a charged attack, heal below a threshold, never re-apply a debuff the hero already has or a buff the enemy already has, and grow more aggressive at low health as a berserker.

**Bosses.** The Goblin King (5), the Bone Reaper (10), the Spider Queen (15), the Cursed Warlord (20), the Shadow Sorcerer (25), the Ancient Dragon (30), the Void Herald (35), the Lich Emperor (40), the Abyssal Behemoth (45) and the Eternal Tyrant (50). Each has an introduction, a large health bar with phase markers, two or three phases with new abilities, enrages or shields, telegraphed signature attacks (the Ancient Dragon's Inferno Breath), resistance to crowd control (they can't be stun-locked), unique first-kill loot, bonus experience and gold. Rematches pay smaller rewards and never repeat the guaranteed loot.

**Quests.** 13 main story quests, 14 side quests (kill, collect, find the lost traveller, recover the Moonsteel Blade, explore an ancient dungeon, equip an epic item, reach a level) and 3 daily bounties that reset each day. Progress tracks automatically. A reward can be claimed only once.

**Inventory and equipment.** A 60-slot grid with filters, five sort orders, inspection, comparison with what you have equipped (green arrows mark upgrades), use, equip, unequip and sell. Equipment slots: weapon, armour, helmet, boots, ring and amulet. 110 items across six rarities (Common to Mythic), each with a unique id, type, rarity, value, stats and stack limit. Weapons are tied to a class, except a few universal legendary and mythic blades. A blacksmith can upgrade any piece of equipment to +5. If your bag is full, extra loot is sold automatically instead of lost.

**Shop and economy.** Potions, class gear, selling at 40% of value, the inn and the blacksmith. Purchases are checked for gold, level and space, the screen updates right away, and rapid taps can't buy twice. Gold sinks are potions (prices rise with level), gear, upgrades, rest, skill resets and the gold lost when you're revived. Selling can never earn back more than an item cost.

**Potions and status effects.** Small and Large Health, Mana and Greater Mana, Antidote, Strength, Defence, Regeneration Tonic, Elixir and Smoke Bomb. The status effects are Poison, Burn, Bleed, Freeze, Stun, Weakness, Marked, Regeneration, Defence Boost, Strength, Guard, Shield, Evasion, Focus, Berserk and Enraged. Each has a duration, a strength and its own behaviour, and they all show in combat with tooltips. Healing never goes above max health or mana.

**Exploration.** Ten locations: Whispering Woods, Goblin Caves, Forgotten Crypt, Spider Nest, Cursed Fortress, Frozen Caverns, Dragon's Lair, Shadow Realm, Necropolis of Ash and the Abyssal Throne. Each has a level range, a recommended level, an encounter table, treasure, a bestiary, a resident boss and unlock requirements. Each Explore step can bring a fight, a treasure cache, a trap, a healing shrine or a story event. Enemies far below your level give less experience, so farming them doesn't pay.

**Custom Enemy Creator** (turn on Settings → Developer tools). Set the name, description, level, health, attack, defence, speed, rewards, up to six abilities, behaviour, weaknesses and resistances, a loot table of up to five drops, and the look: one of 12 body shapes, colours, size and an aura. It has a live preview, checks every field, and lets you save, edit, duplicate, delete and test-fight your creations. Custom enemies are stored apart from the built-in bestiary. Test fights use a copy of your hero and a sandboxed potion bag, and never give rewards or change your save.

**Saving.** Three save slots in LocalStorage. The save holds the character, stats, gold, inventory, equipment, skills, quests, daily quests, boss progress, unlocked and explored locations, records and play time. You can save manually, Continue, start a New Game (with an overwrite warning), Load, and Delete (with confirmation). The game autosaves after fights, purchases and rewards (you can turn this off). Defeats aren't autosaved, so "Load last save" really goes back. Every save carries a version number, with a migration from version 1. Loading checks the data field by field: unknown items are removed, numbers are clamped, skill points are checked against the level, and a damaged save is flagged without crashing. Saved data is plain JSON and is never run as code.

**Presentation.** Charcoal and black panels with purple magic, gold accents, red danger, green health and blue mana. Animated health and mana bars with a trailing "ghost" bar, floating damage numbers, hit flashes and shakes, charged-attack warnings, phase banners, level-up banners, loot toasts, victory and defeat screens, tooltips and confirmation dialogs. All art is original procedural SVG, and all sound is synthesised live with the Web Audio API (12 kinds of sound effects plus mood music).

**Settings.** Music and sound volume, mute, animation intensity (off, low, normal or high), floating combat numbers, reduced motion, combat speed, interface scale (85–130%), autosave and developer tools. Settings are stored locally and take effect immediately. The game is fully playable with sound off, and audio errors can never interrupt it.

**Responsive.** Built for phones first: a bottom tab bar, 44px+ touch targets and no horizontal scrolling (the browser tests check every screen at 360px wide). On tablets and desktops it switches to a sidebar layout with a two-column combat screen. It also handles landscape phones.

## Project structure

```
nicko-rpg/
  index.html            page skeleton (one <section> per screen)
  manifest.webmanifest  install metadata
  css/style.css         theme, components, animations
  css/responsive.css    phone / tablet / desktop layouts
  icons/                app icon (SVG + PNG)
  js/
    main.js             entry point: wiring, keyboard, autosave, Android hooks
    utils.js            seeded RNG, clamping, escaping, event emitter
    gameState.js        new game, exploring, starting fights, applying results, reviving
    character.js        classes, experience curve, derived stats, level-ups
    abilities.js        player ability database
    statusEffects.js    effect definitions and rules
    skillTree.js        skill trees, unlocking, passives, respec
    enemies.js          enemy database, enemy abilities, behaviours, scaling, AI
    bosses.js           bosses, phases, rewards, unlock rules
    combat.js           turn-based combat engine (no DOM)
    items.js            item database, rarities, stats
    loot.js             loot tables
    inventory.js        stacking, capacity, consumables, sorting, filtering
    equipment.js        equip/unequip, comparison, blacksmith upgrades
    shop.js             buying, selling, the inn
    quests.js           quest database and tracking
    dungeons.js         locations and unlock rules
    saveSystem.js       slots, versioning, migrations, validation
    settings.js         settings storage
    customEnemyCreator.js  developer tool logic
    audio.js            synthesised sound effects and music
    art.js              procedural SVG monsters, items and heroes
    ui/                 one module per screen, plus shared helpers (dom.js, format.js, app.js)
  tests/
    logic.test.js       system tests (Node)
    ui.test.cjs         browser tests (Playwright)
    balance.sim.js      balance simulation
```

Game logic modules never touch the DOM, so they run unchanged in Node for the tests and could move to another front end. All game content (enemies, bosses, abilities, items, quests, locations and skill trees) is plain data.

## Balance

Tuned with `tests/balance.sim.js`, which plays thousands of scripted fights for every class from level 1 to 50 using shop gear. Ordinary fights at your level take about 3–7 turns and cost 15–35% of your health, so potions and resting matter without forcing a grind. At their level, with shop gear and earlier boss loot, a simple scripted player beats most bosses 85–100% of the time in 9–30 turns. The Cursed Warlord is the hardest wall for Rogues (about 50% for the script), and a thoughtful player who uses Defend against charged attacks does much better than the script. Mages are the strongest class against regular monsters with an elemental weakness; Warriors are the safest.

## Known limitations

- The Android APK is built, signed and checked (package, manifest, contents, signature), but it wasn't run on a real device or emulator here. The web game it contains was tested in Chromium at phone and desktop sizes.
- Each fight is one hero against one enemy. Dragon "area" attacks are shown as heavy charged breath attacks rather than hitting several targets.
- Several late enemies are weak to Holy, but no player ability deals holy damage yet. Those weaknesses are there for future holy skills.
- Daily quests use the device's clock, so changing the date resets them.
- Saves live in the browser's local storage. Clearing site data, or a private window, loses them. There's no cloud sync or save export yet.
- Custom enemies are shared by all three save slots and kept with the settings, not inside a slot.
- Balance comes from simulation and some hand play, not long playtests.

## Ideas for future development

- Multi-enemy encounters and party members
- Holy damage skills (a Paladin or Cleric class)
- Crafting with materials, equipment sets and random affixes
- Save export and import, and cloud backup
- An endless tower or New Game+ after the Eternal Tyrant
- Achievements and a bestiary that records what you've discovered
- Recorded music and illustrated portraits
- Google Play release using the App Bundle approach from Pocket Mochi
