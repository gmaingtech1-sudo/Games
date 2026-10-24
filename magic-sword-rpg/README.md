# Magic Sword RPG

A 2D fantasy role-playing game for Android phones, made with HTML, CSS, JavaScript and [Phaser 3](https://phaser.io).

The world of Embers is threatened by King Thalorion the Eternal. Leo Smith, a young hero with dark blue hair, has inherited the Magic Sword from his grandfather. The sword holds ancient magic, but for now it sleeps. Leo has to start with an iron blade, help the people of Ashbrook, and grow strong enough to wake it.

Everything is free: no paid services, no paid assets. All the pictures are simple shapes drawn by the code, and all the sounds are made by the browser.

## What's in version 1

| Feature | What works now |
| --- | --- |
| Main menu | Play, Inventory, Skills, Quests, Character and Settings all open working screens. |
| Story intro | A short story when you start a new game (you can skip it). |
| Ashbrook village | Houses, a healing well, Elder Maren, Bram the Merchant and Mira. |
| Gloom Meadow | South of the river: Gloom Slimes wander here, plus a pond and treasure. |
| Moving | On-screen joystick or D-pad (pick in Settings). Arrow keys or WASD on a computer. |
| Action button | Talk, Open, Read, Drink or Pick up, depending on what's next to you. |
| Combat | Turn-based. Attack, Magic, Potion and Run. Health bars for both sides, enemy attacks, a victory screen with XP and gold, and a defeat screen. You can't act while defeated. |
| Swords | Iron Sword (10 damage) to start, and Frostbite (25 damage, can slow enemies) as a quest reward. Equip them in Inventory. |
| Levels | Level 1 to start. 100 XP for level 2, then each level needs 1.5 times more. Levelling up raises max health and magic, heals you, and gives a skill point. |
| Skill tree | Sword, Fire, Ice and Defence, two skills each. The second skill in each needs level 3. |
| Quests | *Slime Trouble* (defeat 3 slimes) and *The Lost Pendant* (find Mira's pendant). A "!" shows who has a quest for you. |
| Treasure chests | Three, each with gold or potions. |
| Shop | Bram sells Healing Potions for 15 gold. |
| Saving | Saves automatically on the phone: level, XP, health, magic, gold, inventory, swords, equipped sword, skills, quests, opened chests and where you're standing. Close the game, open it again, tap **Play (continue)**. |
| Pause menu | The ❚❚ button. Resume, all the menus, a quick sound on/off, and Save & Main Menu. |
| Settings | Sound effects, music, volume, joystick or D-pad, and start a new game. |
| Offline | After the first visit it works without internet, and you can add it to your home screen. |

### Not built yet

These are honest gaps, not hidden features:

- **The Enchanted Forest and the Ancient Ruins.** The brambles at the bottom of the meadow block the path; a sign there says so.
- **Sunfire and The Magic Sword.** Their stats and abilities are already written (`js/data/weapons.js`) and the battle code knows how to use them, but there's no way to get them in the game yet.
- Only one kind of monster (the Gloom Slime).
- Lists in Inventory and Quests don't scroll yet. That's fine for version 1, but they'll need scrolling once there are many more items.
- No online multiplayer (on purpose, see below).

## How to play

1. Tap **Play**, read the story (or tap **Skip**).
2. Use the joystick (bottom left) to walk. Walk up to Elder Maren (the "!" above her head) and tap the round **Talk** button.
3. Cross the bridge south into the meadow. Touch a purple slime to start a battle.
4. In battle, tap **Attack**. **Magic** costs magic points and always hits. **Potion** heals 40. **Run** usually works.
5. If you're hurt, go back to the village and **Drink** from the glowing well. It restores everything for free.
6. After 3 slimes, return to Elder Maren for your reward.

## Put it on your Android phone

The game is a web page, so you need to put it somewhere your phone can open it. Here are two free ways.

### Option A: GitHub Pages (recommended, works anywhere)

1. On a computer, open the repository on GitHub: **github.com/gmaingtech1-sudo/Games**.
2. Click **Settings** (top of the page), then **Pages** (left side).
3. Under **Build and deployment → Source**, choose **Deploy from a branch**.
4. Under **Branch**, choose the branch that has the `magic-sword-rpg` folder (for example `main`, or `claude/magic-sword-rpg-android-c3wo3a` until it's merged), leave the folder as **/ (root)**, and click **Save**.
5. Wait 1 or 2 minutes. The Pages settings page will show your site's address.
6. On your Android phone, open **Chrome** and go to:
   `https://gmaingtech1-sudo.github.io/Games/magic-sword-rpg/`
7. Hold your phone upright (portrait).
8. Optional: tap Chrome's **⋮** menu → **Add to Home screen** (or **Install app**). Now it opens like a normal app, full screen, and works offline.

### Option B: from your own computer, on the same Wi-Fi

You need Python installed on the computer (it usually is on Mac and Linux; on Windows get it free from python.org).

1. Open a terminal (Windows: **Command Prompt**) in the `magic-sword-rpg` folder.
2. Run: `python3 -m http.server 8000` (on Windows you might need `python -m http.server 8000`).
3. Find your computer's local IP address (Windows: run `ipconfig` and look for **IPv4 Address**; Mac: **System Settings → Wi-Fi → Details**). It looks like `192.168.1.23`.
4. Make sure your phone is on the **same Wi-Fi** as the computer.
5. On the phone, open Chrome and go to `http://192.168.1.23:8000` (with your own address).
6. To test on the computer itself, open `http://localhost:8000`. Use the arrow keys or WASD to walk, Space to use the action button and Esc to pause.

Don't open `index.html` by double-clicking it: browsers block some features for files opened that way. Always use one of the options above.

## Testing checklist

Try these on your phone after any change:

- [ ] The menu shows. Every button opens something, and **Back** returns to the menu.
- [ ] **Play** shows the story, then the village.
- [ ] The joystick moves Leo. Switch to the D-pad in Settings, and it moves him too.
- [ ] Talk to Elder Maren and accept her quest. The quest appears at the top of the screen and in **Quests**.
- [ ] Touch a slime. The battle starts. Attack until it's defeated. You get XP and gold.
- [ ] Lose a battle on purpose: fight slime after slime without drinking potions or visiting the well. The defeat screen shows, the battle buttons stop working, and you wake up in the village.
- [ ] Open a chest. Buy a potion from Bram.
- [ ] Close Chrome completely, open the game again, and tap **Play (continue)**. Your level, gold and items are still there.

## If something goes wrong

If the game hits an error, a red box appears at the top of the screen saying what went wrong and which file and line. Tap it to reload.

| What you see | What it means | How to fix it |
| --- | --- | --- |
| A black screen, nothing happens | The page couldn't load a file, usually because it was opened by double-clicking. | Use Option A or B above. |
| `Phaser is not defined` | `lib/phaser.min.js` is missing or in the wrong place. | Make sure the `lib` folder is inside `magic-sword-rpg` with `phaser.min.js` in it. |
| `Unexpected token` or `missing )` | A typing mistake in a file you edited, such as a missing comma or bracket. | Go to the file and line in the red box. Check the line before it too: a missing comma at the end of one line often shows up as an error on the next. |
| `Cannot read properties of undefined` | A name doesn't match, for example a quest reward `weapon: 'frostbit'` instead of `'frostbite'`. | Check the spelling of the id in the file and line shown. |
| The phone shows an old version after you changed something | The game is saved for offline use. | Close the game and open it again (it updates in the background). If it's still old, add 1 to `CACHE` in `sw.js` (for example `magic-sword-rpg-v2`). |
| No sound | Phones only allow sound after you tap the screen. | Tap anywhere. Check **Settings** and the phone's volume. |
| The progress is gone | Browsers keep saves per website address, so `localhost` and GitHub Pages have different saves. Clearing Chrome's site data also deletes it. | Always play from the same address. |

If you get stuck, copy the exact words in the red box and ask for help.

## How the project is organised

```
magic-sword-rpg/
├── index.html             The page. Loads Phaser and every script, in order.
├── css/style.css          Makes the game fill the phone screen.
├── lib/phaser.min.js      The Phaser 3 game engine (3.90.0, MIT licence), kept here so it works offline.
├── js/
│   ├── config.js          ★ All the game-balance numbers. Start here to tweak the game.
│   ├── data/              ★ The game's content. Edit these to add things.
│   │   ├── weapons.js       Swords: damage and abilities.
│   │   ├── items.js         Potions and quest items.
│   │   ├── enemies.js       Monsters: health, attack, XP and gold.
│   │   ├── skills.js        The skill tree.
│   │   ├── quests.js        Quests: goals and rewards.
│   │   └── world.js         The map (drawn with letters), people, chests and signs.
│   ├── state.js           The hero's progress and the rules: XP, levels, items, skills, quests, saving.
│   ├── audio.js           Sound effects and music, made with WebAudio.
│   ├── art.js             Draws all the placeholder pictures.
│   ├── ui.js              Buttons, panels, bars and the magical background.
│   ├── main.js            Starts the game.
│   └── scenes/            The screens:
│       ├── BootScene.js     Draws the art and loads the save.
│       ├── MenuScene.js     The main menu and story intro.
│       ├── WorldScene.js    Walking around, people, chests, monsters.
│       ├── HudScene.js      Health bars, joystick/D-pad and action button.
│       ├── BattleScene.js   Turn-based combat.
│       ├── DialogScene.js   The talking box.
│       ├── PauseScene.js    The pause menu.
│       └── panels.js        Inventory, Skills, Quests, Character and Settings.
├── sw.js, manifest.webmanifest, icons/   Offline play and "Add to Home screen".
└── README.md              This file.
```

## Changing the game

You don't need to touch the scenes to change most things. Edit a file, save, and reload the page.

- **Make the game easier or harder:** change numbers in `js/config.js` (starting health, XP per level, potion healing, slime count) and `js/data/enemies.js` (slime health and attack).
- **Change a sword:** edit its `damage` or `ability` in `js/data/weapons.js`.
- **Give Leo a different starting sword:** change `startWeapon` in `js/config.js` to another sword's id (like `'sunfire'`). This only affects new games.
- **Edit the map:** change letters in `WORLD.map` in `js/data/world.js`. The legend is at the top of the file. Every row must stay exactly 24 letters long.
- **Move people or chests:** change their `x` (column) and `y` (row) in `js/data/world.js`. Count from 0 at the top-left corner, and put them on a walkable tile.
- **Add a chest:** copy a line in `chests` in `js/data/world.js`, give it a new `id`, a new position and its own `contents`.
- **Change a skill:** edit `js/data/skills.js`. The effects you can use are listed at the top of the file.

## Thinking ahead: multiplayer

There's no online play in version 1, but it's built so it could be added later without starting over:

- All the game rules (XP, levelling, quests, rewards) are in `js/state.js` and work on one plain data object, `State.data`. A server could keep that same data for each player.
- Each hero has an `id`, ready to tell players apart.
- The screens change the hero's data almost entirely through `State` functions (battle damage and Leo's position are the two exceptions). Those functions are the places that would send changes to a server.
