# Filmstrip

Make videos up to **20 minutes** long on your phone. Put photos, video clips, title cards and camera recordings together, add words on screen, transitions and music, then save it all as one video file you can download or share.

It's plain HTML, CSS and JavaScript. There's no build step, nothing to install and no server: your photos and clips never leave your phone.

## Making a video

| Button | What it does |
| --- | --- |
| **Media** | Add photos and video clips from your phone. Photos stay on screen for 4 seconds (you can change it) with a slow zoom or pan. |
| **Record** | Record with your front or back camera, with sound. One recording can last up to 20 minutes, or however much of the 20 minutes is left. |
| **Title** | Add a title card: words on a colored background. |
| **Music** | Pick a song from your phone. It plays under the whole video and fades out at the end. You can set its volume, and the volume of your clips' own sound. |
| **Save video** | Makes the video file. When it's done you can watch it, **Download** it or **Share** it. |

Tap a scene in the strip to edit it:

- **Length** for photos and titles, or **Trim** (start and end) for clips
- **Words on screen**: where they go (top, middle, bottom), how big, and shadow or box style
- **Motion** for photos: still, zoom in, zoom out or pan
- **Fit**: fill the frame, or show the whole picture
- **Transition in**: cut, fade, slide, zoom or dip to black
- **Move**, **Duplicate** or **Delete** the scene

The bar at the top shows how much of the 20 minutes you've used. The settings button sets the video's shape (tall, wide or square) and quality (720p or 1080p), or starts a new video.

## Saving

Saving plays your video through once while it records, so a 20-minute video takes about 20 minutes to save. Keep the screen open (the app asks your phone not to sleep). If you switch away, saving pauses and carries on when you come back.

The file is an MP4 where the browser can make one (Chrome, Edge, Safari) and WebM otherwise (Firefox). A 20-minute video is roughly 600 MB at 720p or 1.2 GB at 1080p.

Your project (scenes, photos, clips and music) is kept in the browser's storage, so you can close the app and carry on later.

## Putting it on your phone

The camera only works over HTTPS, so the simplest way is GitHub Pages:

1. In the repository on GitHub, open **Settings → Pages**.
2. Under **Build and deployment**, pick **Deploy from a branch**, choose the branch that has this folder and `/ (root)`, then **Save**.
3. After a minute, open `https://<your-user>.github.io/<repo>/filmstrip/` on your phone.
4. To add it to your home screen:
   - **iPhone (Safari):** Share button → **Add to Home Screen**.
   - **Android (Chrome):** ⋮ menu → **Add to Home screen** / **Install app**.

## Running it locally

```sh
cd filmstrip
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## How it's built

| File | What it does |
| --- | --- |
| `index.html` | Layout: the preview, the play bar, the scene strip, the buttons, the record screen |
| `css/style.css` | All styling. Mobile-first, handles notches (safe areas), and respects reduced-motion settings |
| `js/store.js` | The timeline maths, and keeping the project, photos, clips and songs in IndexedDB |
| `js/draw.js` | Draws one frame: a scene's picture, its words, its zoom or pan, and the transition into it |
| `js/engine.js` | The player: keeps time, plays clips and music, mixes sound with WebAudio, and records the canvas and sound with `MediaRecorder` to save the video |
| `js/camera.js` | The record screen |
| `js/main.js` | Everything else: adding media, the scene strip, the edit sheets, the 20-minute meter, saving and sharing |
| `sw.js`, `manifest.webmanifest`, `icons/` | Installable app + offline support |

### Tuning

- The longest video: `MAX` in `js/store.js` (seconds).
- How long a new photo lasts: `PHOTO_SECS` in `js/main.js`.
- Transition length: `TRANS` in `js/draw.js`. Title colors: `THEMES` in the same file.
- Video sizes and bitrates: `SIZES` and `videoBitsPerSecond` in `js/engine.js`.
- When you change any file, bump `CACHE` in `sw.js` so installed copies pick up the update.
