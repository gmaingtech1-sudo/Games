# Pet Cam

A real-looking dog, cat or bunny that lives in your phone's camera. Point your phone at the floor, tap, and your pet walks out into your room. Turn around and it stays where you left it. Play with it with your finger: stroke it, hand-feed it, wave a toy for it to chase, play fetch, and take photos together.

It's plain HTML, CSS and JavaScript. There's no build step, nothing to install, and no AR library. The camera feed stays on your phone. There's also an installable Android app in [`../pet-cam-android`](../pet-cam-android).

## The pets

| Pet | Coats | What it's like |
| --- | --- | --- |
| **Dog** | Golden, Black Lab, Chocolate, Husky, Dalmatian, Beagle | Wags its tail, barks and tilts its head when you tap it, rolls over for belly rubs, plays tug of war, and fetches the ball. |
| **Cat** | Orange Tabby, Gray Tabby, Black, White, Tuxedo, Calico | Stalks the laser dot and pounces, purrs when you stroke it (until it's had enough), grooms itself, bats the ball around, and sometimes ignores you when you call. |
| **Bunny** | White, Brown, Gray, Dutch | Hops around, twitches its nose, nibbles leaves, stands up for treats, does happy jumps, and flops over when it's content. |

They walk on four legs, sit facing you, sniff the floor, lie down, and curl up to sleep. Their eyes follow your finger.

## Playing with your finger

| Action | How |
| --- | --- |
| Put your pet down | Point at the floor until you see the white ring, then tap the floor. |
| Pet | Stroke your pet with your finger. Keep stroking a dog and it rolls onto its back for a belly rub. |
| Tap | Tap your pet: dogs bark, cats meow, bunnies twitch their ears. Too many pokes and a cat swats you. |
| Toy | Tap **Toy** (**Laser** for cats, **Leaf** for bunnies), then drag your finger on the floor. Your pet chases it. Dogs grab the toy and play tug of war, cats crouch, wiggle and pounce, and bunnies nibble the leaf. |
| Treat | Tap **Treat** (**Carrot** for bunnies), then put your finger on the floor. Your pet follows the treat and begs. Hold still near it and it eats from your hand, or let go to drop the treat on the floor. |
| Fetch | Tap **Ball**, then flick up on the screen to throw. A harder flick throws farther. Dogs bring it back; cats bat it around; bunnies nudge it with their nose. |
| Move | Tap the floor and your pet walks there (a cat might not bother). |
| Call | Tap **Call** and your pet comes back in front of you. It also comes back by itself if you look away for a while. |
| Nap | Pets nap on their own when they're tired. You can also use **Nap time** in the menu. Tap a sleeping pet to wake it. |
| Photo | Tap the big round button to take a photo of your pet in your room, then save or share it. |

If your pet is out of view, an arrow at the edge of the screen points to it. A thought bubble shows what it wants (a treat, playtime, or sleep). Every time you play together, **Friendship** goes up. Food, fun and energy slowly go down while the app is closed, but never all the way to zero.

Pets adopted in the earlier version (Mochi, Kitty, Bunny, Pup) come back as a dog, cat or bunny with the same name, friendship and stats.

## How the AR works

`getUserMedia` shows the rear camera full screen. The phone's motion sensors (`deviceorientation`) tell the game which way the phone is pointing. The pet, ball and treats live at real floor positions, measured in meters around you, and are projected onto the screen every frame. That keeps them fixed in the room as you turn and tilt the phone, and they get bigger and smaller with distance. It tracks turning, not walking: if you walk across the room, the pet comes with you.

If there's no motion sensor (a laptop, or you said no to motion access), drag the screen to look around. If there's no camera, you play in a pretend room.

## Putting it on your phone

The camera only works over HTTPS, so the simplest way is GitHub Pages:

1. In the repository on GitHub, open **Settings → Pages**.
2. Under **Build and deployment**, pick **Deploy from a branch**, choose the branch that has this folder and `/ (root)`, then **Save**.
3. After a minute, open `https://<your-user>.github.io/<repo>/pet-cam/` on your phone.
4. Tap **Open camera**, then allow camera access. On iPhone, also allow **Motion & Orientation** access.
5. To add it to your home screen:
   - **iPhone (Safari):** Share button → **Add to Home Screen**.
   - **Android (Chrome):** ⋮ menu → **Add to Home screen** / **Install app**.

## Running it locally

```sh
cd pet-cam
python3 -m http.server 8000
```

Then open <http://localhost:8000>. Browsers only allow the camera on `localhost` or HTTPS. So to try it on your phone, use GitHub Pages (above) or an HTTPS tunnel. A plain `http://<your-IP>:8000` link opens in the pretend room.

## How it's built

| File | What it does |
| --- | --- |
| `index.html` | Layout: the camera view and HUD, the action dock, photo and menu sheets, and the adopt screen |
| `css/style.css` | All styling. Mobile-first, handles notches (safe areas), and respects reduced-motion settings |
| `js/host.js` | Where saves, vibration and photos go: the browser, or the Android app when running inside it |
| `js/audio.js` | Sound effects made with WebAudio (no audio files), plus vibration |
| `js/ar.js` | Camera, motion sensors, the floor-to-screen projection maths, and the pretend room |
| `js/art.js` | The drawings: each kind of pet in every pose (walking, sitting, sniffing, sleeping, belly-up, begging), coats and markings, treats and toys |
| `js/pet.js` | The pet's needs, friendship levels and saving |
| `js/main.js` | How each kind of pet behaves, finger play (toys, hand-feeding, petting), ball physics, photos and the HUD |
| `sw.js`, `manifest.webmanifest`, `icons/` | Installable app + offline support |

Progress is saved in the browser's `localStorage`.

If you change the game, run `./build.sh` in `../pet-cam-android` so the Android app gets the change too.

### Tuning

- Pet sizes (in meters): `SPECIES` in `js/art.js`. Coats and markings: `COATS` in the same file.
- How fast each kind walks and runs: `MOVES` in `js/main.js`. How far it wanders: `FAR`.
- How high you hold the phone, and the camera's field of view: `EYE` and `LONG_FOV` in `js/ar.js`.
- How fast needs drop: `AWAKE_RATE` / `SLEEP_RATE` in `js/pet.js` (points per real hour, meters go 0–100).
- When you change any file, bump `CACHE` in `sw.js` so installed copies pick up the update.
