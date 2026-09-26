# Pocket Mochi

A virtual pet made for phones. You adopt an egg, hatch it with a few taps, and then look after a squishy mochi creature in its own little house: feed it in the kitchen, give it a bubble bath, tuck it into bed and play ball in the playroom. Its needs keep changing while the app is closed, so check in during the day.

It's plain HTML, CSS and JavaScript. There's no build step and nothing to install. There's also an installable Android app in [`../pocket-mochi-android`](../pocket-mochi-android).

## Playing

The house has five rooms. Move between them with the room buttons at the bottom, the arrows on the sides, or by swiping sideways on an empty spot.

| Room | What you do there |
| --- | --- |
| Living room | Hang out. Stroke your pet to pet it, tap it to make it giggle (too many pokes make it dizzy), tap the floor and it hops over. |
| Kitchen | The snack tray opens when you walk in. Drag a snack onto its mouth, or just tap the snack. Tap the fridge to open the snacks again. The clock shows the real time. |
| Bathroom | Your pet sits in a bubble bath. Scrub it with your finger until it's foamy, then tap **Rinse** or the shower. The rubber duck squeaks. |
| Bedroom | Tap the lamp (or **Lights off**) and your pet climbs into bed. Energy refills while it sleeps, and it wakes up on its own when rested. |
| Playroom | Flick the ball and your pet chases it and bops it with its head, which is fun for it. The arcade machine has two games: **Star Catch** (slide to move, catch stars and coins, dodge storm clouds) and **Bubble Pop** (tap bubbles before they float away; quick pops build a combo up to x5, rainbow bubbles are worth more, storm bubbles cost 3 seconds). |

If you're not sure what your pet needs, tap its thought bubble or one of the need meters at the top, and you'll go straight to the room that helps.

Poop lands in whatever room your pet is in. Tap it to clean it up; a brown dot on a room button tells you there's a mess in that room. If your pet gets sick, a **Give medicine** button appears.

### Levels, goals and the shop

- **Levels:** everything you do earns XP, shown by the bar under your pet's name. Each level pays 10 coins and can unlock new snacks, hats and wallpapers. Your pet grows from **Baby** to **Kid** at level 5 and to **Grown-up** at level 12, with 20 bonus coins each time.
- **Daily goals:** three new goals every day, such as feeding snacks, a bath, bops with the ball or a score in an arcade game. Tap the checklist at the top to see them; a pink dot means one is ready to claim. Each pays 15 coins and 10 XP, plus 25 bonus coins for finishing all three.
- **Shop:** tap your coins at the top. **Snacks** and **Hats** have items that unlock as you level up (pizza, ice cream, a chef hat, a wizard hat, headphones). **Decor** has wallpapers: buy one and it goes up in the room you're in, and you can move it to any other room later.
- You also get a 10-coin gift the first time you open the game each day.

Nothing bad is permanent: a neglected pet gets sad and sick, but medicine and care always bring it back.

There are four kinds (Mochi, Kitty, Bunny, Pup) and five flavors (Strawberry, Matcha, Yuzu, Taro, Soda).

## Putting it on your phone

The game has to be served over HTTPS for offline play and "Add to Home Screen" to work. The simplest way is GitHub Pages:

1. In the repository on GitHub, open **Settings → Pages**.
2. Under **Build and deployment**, pick **Deploy from a branch**, choose the branch that has this folder and `/ (root)`, then **Save**.
3. After a minute, open `https://<your-user>.github.io/<repo>/pocket-mochi/` on your phone.
4. Add it to your home screen:
   - **iPhone (Safari):** Share button → **Add to Home Screen**.
   - **Android (Chrome):** ⋮ menu → **Add to Home screen** / **Install app**.

Launched from the home screen, it runs full screen like an app and keeps working without a connection.

## Running it locally

```sh
cd pocket-mochi
python3 -m http.server 8000
```

Then open <http://localhost:8000>. To try it on your phone, connect it to the same Wi-Fi and open `http://<your-computer's-IP>:8000`. Opening `index.html` straight from the file system also works, but without offline support.

## How it's built

| File | What it does |
| --- | --- |
| `index.html` | Layout: top bar, need meters, the room canvas, action dock, shop/settings sheets, adopt screen |
| `css/style.css` | All styling. Mobile-first, respects safe areas (notches) and reduced-motion settings |
| `js/host.js` | Where saves and vibration go: the browser, or the Android app when running inside it |
| `js/audio.js` | Sound effects synthesized with WebAudio (no audio files), plus vibration |
| `js/art.js` | Canvas drawings: snacks, hats, poop, particles |
| `js/rooms.js` | The house: each room's art, wallpapers, its tappable props (fridge, duck, lamp, arcade) and where the pet stands |
| `js/pet.js` | The care model (needs, levels, daily goals, poop, sickness, offline catch-up) and the animated pet renderer |
| `js/minigame.js` | The arcade games: Star Catch and Bubble Pop |
| `js/main.js` | Touch input, moving between rooms, the playroom ball, shop, goals, UI, saving and the game loop |
| `sw.js`, `manifest.webmanifest`, `icons/` | Installable app + offline support |

Progress is saved in the browser's `localStorage`, so each phone/browser has its own pet.

If you change the game, run `./build.sh` in `../pocket-mochi-android` so the Android app gets the change too.

### Tuning

- How fast needs drop: `AWAKE_RATE` / `SLEEP_RATE` in `js/pet.js` (points per real hour, meters go 0–100).
- Growth thresholds: `STAGES` in `js/pet.js`; the level curve (`xpForLevel`) is built to pass through them.
- Daily goals and their rewards: `GOALS`, `GOAL_REWARD` and `GOAL_BONUS` in `js/pet.js`.
- Snack and hat prices, effects and unlock levels: `FOODS` and `HATS` in `js/art.js`; wallpapers: `WALLS` in `js/rooms.js`.
- Open the game with `?debug` in the address to reach its state from the browser console (`PM.debug.s`).
- When you change any file, bump `CACHE` in `sw.js` so installed copies pick up the update.
