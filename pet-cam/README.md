# Pet Cam

An AR pet that lives in your phone's camera. Point your phone at the floor, tap, and your pet pops out into your room. Turn around and it stays where you left it. Pet it, toss it treats, play fetch, and take photos together.

It's plain HTML, CSS and JavaScript. There's no build step, nothing to install, and no AR library. The camera feed stays on your phone. There's also an installable Android app in [`../pet-cam-android`](../pet-cam-android).

## Playing

| Action | How |
| --- | --- |
| Put your pet down | Point at the floor until you see the white ring, then tap the floor. |
| Pet | Stroke your pet with a finger. Hearts float up and **Fun** goes up. |
| Giggle | Tap your pet. Too many taps in a row make it dizzy. |
| Move | Tap the floor and your pet walks there. |
| Treat | Tap **Treat** to toss a cookie. Your pet runs over and eats it (**Food** goes up). |
| Fetch | Tap **Ball**, then flick up on the screen to throw. A harder flick throws farther. You can also tap a spot on the floor to throw it there. Your pet chases the ball and brings it back. |
| Call | Tap **Call** and your pet comes back in front of you. It also comes back by itself if you look away for a while. |
| Nap | Tap **Nap** when **Energy** is low. Your pet wakes up by itself when rested, or tap it to wake it. |
| Photo | Tap the big round button to take a photo of your pet in your room, then save or share it. |

If your pet is out of view, an arrow at the edge of the screen points to it. A thought bubble shows what it wants (a cookie, the ball, or sleep). Every time you play together, **Friendship** goes up. Food, fun and energy slowly go down while the app is closed, but never all the way to zero.

There are four kinds (Mochi, Kitty, Bunny, Pup) and seven colors.

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
| `js/pet.js` | The pet's needs, friendship levels and saving, plus the drawings for each kind |
| `js/main.js` | The pet's behaviour, ball physics, treats, touch input, photos and the HUD |
| `sw.js`, `manifest.webmanifest`, `icons/` | Installable app + offline support |

Progress is saved in the browser's `localStorage`.

If you change the game, run `./build.sh` in `../pet-cam-android` so the Android app gets the change too.

### Tuning

- Pet size, and how close or far it wanders: `PET_H`, `NEAR` and `FAR` in `js/main.js`.
- How high you hold the phone, and the camera's field of view: `EYE` and `LONG_FOV` in `js/ar.js`.
- How fast needs drop: `AWAKE_RATE` / `SLEEP_RATE` in `js/pet.js` (points per real hour, meters go 0–100).
- When you change any file, bump `CACHE` in `sw.js` so installed copies pick up the update.
