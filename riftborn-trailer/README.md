# Riftborn trailer

**[Watch the trailer](riftborn-trailer.mp4)** (40 seconds, 720×1280, for phones).

It's made entirely from the game itself: every scene uses Riftborn's own 3D creatures, Rifts, rocks and orbs, rendered with the same three.js code as the game, and the soundtrack is synthesized from scratch. Nothing is filmed or licensed.

| Time | Scene |
| --- | --- |
| 0–10 s | A Rift ignites at the end of a night-time street, then an Emberjaw steps out of a tear in the air and roars |
| 10–15 s | Over the scanner map: three Rifts get linked into a control field |
| 15–20 s | Catching a Stonehorn in AR in a park |
| 20–26 s | An arena battle between Sailfin and Stormcrown |
| 26–31 s | An Apex Solarch in a thunderstorm |
| 31–35 s | A line of creatures |
| 35–40 s | The logo |

## Making it again

```sh
npm install playwright   # and ffmpeg on your PATH
node make.js
```

`make.js` serves the repository locally, opens `trailer.html` in headless Chromium, draws each of the 960 frames with `window.frame(i)` (so it looks the same however slow the computer is), mixes the soundtrack from `soundtrack.js`, and encodes `riftborn-trailer.mp4` with ffmpeg. `node make.js preview 3 12.5 28` saves just those moments as JPEGs, which is handy while editing scenes. Set `FFMPEG` or `PLAYWRIGHT` if they aren't found.

| File | What it does |
| --- | --- |
| `trailer.html` | The page: 3D canvas, titles, AR overlay and logo |
| `trailer.js` | The scenes, camera moves and title timings |
| `soundtrack.js` | Drone, drums, whooshes, roars, thunder and chimes, timed to the scenes |
| `make.js` | Renders the frames and encodes the video |
| `fonts/` | Audiowide and Chakra Petch, the game's fonts (SIL Open Font License) |
