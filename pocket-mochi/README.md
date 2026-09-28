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
| Playroom | Flick the ball and your pet chases it and bops it with its head, which is fun for it. The arcade machine has four games: **Star Catch** (slide to move, catch stars and coins, dodge storm clouds), **Bubble Pop** (tap bubbles before they float away; quick pops build a combo up to x5, rainbow bubbles are worth more, storm bubbles cost 3 seconds), **Memory Match** (flip cards to find the six pairs before the clock runs out; quick matches build a bigger combo) and **Bubble Pop for 2** (two players on one phone, one half of the screen each, with the same bubbles mirrored on both sides). |

If you're not sure what your pet needs, tap its thought bubble or one of the need rings at the top, and you'll go straight to the room that helps. Your pet also talks in speech bubbles: it says hi, tells you when it's hungry or bored, and reacts when you feed, pet or wash it.

Poop lands in whatever room your pet is in. Tap it to clean it up; a brown dot on a room button tells you there's a mess in that room. If your pet gets sick, a **Give medicine** button appears.

### Levels, goals and the shop

- **Levels:** everything you do earns XP, shown by the ring around the level number at the top left. Each level pays 10 coins and can unlock new snacks, hats and wallpapers. Your pet grows from **Baby** to **Kid** at level 5 and to **Grown-up** at level 12, with 20 bonus coins each time.
- **Daily goals:** three new goals every day, such as feeding snacks, a bath, bops with the ball or a score in an arcade game. Tap the checklist at the top to see them; a pink dot means one is ready to claim. Each pays 15 coins and 10 XP, plus 25 bonus coins for finishing all three.
- **Shop:** tap your coins at the top. **Snacks** and **Hats** have items that unlock as you level up (pizza, ice cream, a chef hat, a wizard hat, headphones). **Outfits** are a second clothing slot worn alongside a hat — a bandana, a bow tie, a sweater, a scarf, a backpack. **Decor** has wallpapers: buy one and it goes up in the room you're in, and you can move it to any other room later.

### Daily rewards, birthdays and stickers

- **Daily rewards:** the first time you open the game each day, a reward card shows a 7-day calendar. Coins grow each day in a row (10, 15, 20, 20, 30, 30, 60), with snacks on days 2, 4, 6 and 7. Miss a day and the streak starts over.
- **Birthdays:** your pet has a birthday every month on the day it hatched, and a big one each year. The living room gets bunting, balloons, a cake and a present. Tap the cake to blow out the candles (you get two slices of birthday cake for the fridge), then open the present for coins and a balloon hat. Add your own birthday under **Settings → About you** and your pet throws you a party too, once a year.
- **Weekly quest:** one bigger goal every week (Monday to Sunday), on the checklist button's **Week** tab — things like feeding 20 snacks or winning 10 rounds of Memory Match. It pays 100 coins and 40 XP.
- **Sticker album:** 19 stickers for things like feeding 10 snacks, a 7-day streak, owning 3 outfits, finishing a weekly quest or winning a duel. Each pays 10 coins. Find them under the checklist button, on the **Stickers** tab.

### Playing with friends

Tap the two-people button at the top to start a **playdate**:

1. One player taps **Host a playdate** and reads out the five-letter code.
2. The other types the code and taps **Join**.

The friend's pet walks into your house and follows you from room to room. The round buttons in the top corner send a wave, a heart or a dance, and the gift button lets you send a snack or challenge your friend to a **Bubble Pop duel**: both phones get the same bubbles, you see each other's score live, and the winner gets 20 bonus coins. Tap your friend's pet to poke it.

Playdates need an internet connection. The two phones find each other through the free [PeerJS](https://peerjs.com) server and then talk directly, so it works best when both are on the same Wi-Fi; some mobile networks block direct connections. Only small game messages are sent: pet names, looks and level, emotes, snacks and duel scores. There's no chat.

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
| `index.html` | Layout: pet card, need rings, the room canvas, room tabs, the shop/goals/playdate/settings sheets (goals sheet has Today/Week/Stickers tabs), the daily reward card, adopt screen |
| `css/style.css` | All styling. Mobile-first, respects safe areas (notches) and reduced-motion settings |
| `js/host.js` | Where saves and vibration go: the browser, or the Android app when running inside it |
| `js/audio.js` | Sound effects synthesized with WebAudio (no audio files), plus vibration |
| `js/art.js` | Canvas drawings: snacks, hats, poop, particles |
| `js/rooms.js` | The house: each room's art, wallpapers, its tappable props (fridge, duck, lamp, arcade), the birthday party and where the pet stands |
| `js/pet.js` | The care model (needs, levels, daily goals, login streak, birthdays, stickers, poop, sickness, offline catch-up) and the animated pet renderer with its speech bubbles |
| `js/minigame.js` | The arcade games: Star Catch, Bubble Pop (solo, two players, or seeded for an online duel) and Memory Match |
| `js/online.js` | Playdates: hosting, joining with a code, and passing messages between the two phones |
| `js/vendor/peerjs.min.js` | [PeerJS](https://peerjs.com) 1.5.5 (MIT license, see `PEERJS-LICENSE` next to it) |
| `js/main.js` | Touch input, moving between rooms, the playroom ball, shop, goals, rewards, parties, playdates, UI, saving and the game loop |
| `sw.js`, `manifest.webmanifest`, `icons/` | Installable app + offline support |

Progress is saved in the browser's `localStorage`, so each phone/browser has its own pet.

If you change the game, run `./build.sh` in `../pocket-mochi-android` so the Android app gets the change too.

### Tuning

- How fast needs drop: `AWAKE_RATE` / `SLEEP_RATE` in `js/pet.js` (points per real hour, meters go 0–100).
- Growth thresholds: `STAGES` in `js/pet.js`; the level curve (`xpForLevel`) is built to pass through them.
- Daily goals and their rewards: `GOALS`, `GOAL_REWARD` and `GOAL_BONUS` in `js/pet.js`.
- Daily rewards and stickers: `LOGIN_REWARDS` and `STICKERS` in `js/pet.js`.
- The weekly quest and its reward: `WEEKLY_GOALS` and `WEEKLY_REWARD` in `js/pet.js`.
- Outfit prices, levels and drawings: `OUTFITS` and `outfitDraw` in `js/art.js`.
- Snack and hat prices, effects and unlock levels: `FOODS` and `HATS` in `js/art.js`; wallpapers: `WALLS` in `js/rooms.js`.
- Open the game with `?debug` in the address to reach its state from the browser console (`PM.debug.s`).
- To test playdates with your own PeerJS server (`npx -p peer peerjs --port 9000 --path /pm`), add `?peerhost=localhost&peerport=9000&peerpath=/pm` to the address on both devices (`&peersecure=1` for HTTPS).
- When you change any file, bump `CACHE` in `sw.js` so installed copies pick up the update.
