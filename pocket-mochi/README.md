# Pocket Mochi

A virtual pet made for phones. You adopt an egg, hatch it with a few taps, and then look after a squishy mochi creature: feed it, pet it, wash it, put it to bed and play mini-games with it. Its needs keep changing while the app is closed, so check in during the day.

It's plain HTML, CSS and JavaScript. There's no build step and nothing to install.

## Playing

| Action | How |
| --- | --- |
| Pet | Stroke your pet with a finger. Hearts float up and **Fun** goes up. |
| Giggle | Tap your pet. Poking it too much in a row makes it dizzy. |
| Move | Tap the floor and your pet hops over to that spot. |
| Feed | Tap **Feed**, then drag a snack onto its mouth (or just tap the snack). |
| Wash | Tap **Wash**, scrub your pet with a finger until it's foamy, then tap **Rinse**. |
| Clean up | Tap any poop on the floor. Poop makes the room dirty and can make your pet sick. |
| Sleep | Tap **Sleep** to turn the lights off. Energy refills, and your pet wakes up on its own when rested. |
| Play | **Star Catch**: slide your finger to move, catch stars and coins, dodge storm clouds. You have three hearts. |
| Shop | Spend coins on snacks and hats (party hat, daisy, bow, beanie, sunglasses, crown). |
| Medicine | If your pet gets sick, a **Give medicine** button appears. |

Your pet grows from **Baby** to **Kid** to **Grown-up** as you take care of it, and you get 20 coins each time it grows. You also get a 10-coin gift the first time you open the game each day. Nothing bad is permanent: a neglected pet gets sad and sick, but medicine and care always bring it back.

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
| `js/audio.js` | Sound effects synthesized with WebAudio (no audio files), plus vibration |
| `js/art.js` | Canvas drawings: the room, snacks, hats, poop, particles |
| `js/pet.js` | The care model (needs, growth, poop, sickness, offline catch-up) and the animated pet renderer |
| `js/minigame.js` | The Star Catch mini-game |
| `js/main.js` | Touch input, UI, saving and the game loop |
| `sw.js`, `manifest.webmanifest`, `icons/` | Installable app + offline support |

Progress is saved in the browser's `localStorage`, so each phone/browser has its own pet.

### Tuning

- How fast needs drop: `AWAKE_RATE` / `SLEEP_RATE` in `js/pet.js` (points per real hour, meters go 0–100).
- Growth thresholds: `STAGES` in `js/pet.js`.
- Snack and hat prices/effects: `FOODS` and `HATS` in `js/art.js`.
- When you change any file, bump `CACHE` in `sw.js` so installed copies pick up the update.
