# Hyperdot

A puzzle game for phones that climbs from one dimension to five. You are a glowing dot. Collect every shard to open the exit, using keys, doors, crates, plates and gates along the way. The rules never change, but each world gives you one more direction to move in: a line, a plane, space, a tesseract and finally a penteract.

It's plain HTML, CSS and JavaScript. There's no build step and nothing to install. The levels, the 3D views, the hypercube art, the sound effects and the music are all made in code, so the only image files are the app icons. After the first visit it also works offline.

## Playing

### The rules

You move one cell at a time. Every level is turn-based, so take as long as you like.

| Thing | What it does |
| --- | --- |
| The dot | You. |
| Shard (gold diamond) | Pick up every one to open the exit. |
| Exit (ring) | Dashed while shards are left, bright once it's open. Step on it to win. |
| Key and door (pink, teal, silver) | A key opens one door of the same colour, and is used up. |
| Crate | Walk into it to push it one cell, if the space beyond is empty. You can't pull. |
| Plate (orange corners) | Held down by you or a crate standing on it. |
| Gate (orange stripes) | Open only while every plate is held down. A gate with something in it stays open until it's empty. |

**Par** is the fewest moves the level can be solved in, worked out by the game's own solver. Match par for three stars, come close for two, finish for one. **Undo** takes back moves one at a time, and **Restart** starts over. **Hint** lights up the best next move, and keeps lighting the next one while you follow it, but a run that uses a hint only earns one star.

### The five worlds

| World | Size | What's new |
| --- | --- | --- |
| 1D · The Line | 5 levels | Forward and back. Nothing can get past anything, so order is everything. |
| 2D · The Plane | 8 levels | A second direction: now you can go around. Sokoban-style crate puzzles. |
| 3D · The Space | 8 levels | Up and down. Walls are glass blocks you can see through; drag to turn the view. Panels above the view show each floor as a flat map. |
| 4D · The Tesseract | 8 levels | **Ana** and **kata** (+W and −W), a fourth direction at right angles to the other three. Each step along it takes you to the next 3D slice. A strip of panels shows every slice at once. |
| 5D · The Penteract | 6 levels | W and V. The 3D slices are laid out in a grid: W moves you across it, V moves you down it. |

Each world opens when you finish the one before. The first time you enter a world, an intro shows its shape (a line, a square, a cube, a tesseract, a penteract) turning in its own dimensions, with each edge in the colour of its axis.

### Moving

Every axis has its own colour, used on the buttons, the axis marker in the corner of the view and the hypercube art: **X** red, **Y** green, **Z** blue, **W** violet, **V** amber.

| Action | Touch | Keyboard |
| --- | --- | --- |
| Move along X / Y | The four-way pad. In 1D and 2D you can also swipe, or tap the side you want to go. In 3D and up you can tap a glowing neighbour | Arrows or WASD |
| Up / down (Z) | ▲ ▼ | R / F |
| Ana / kata (W) | +W / −W | T / G |
| +V / −V | +V / −V | Y / H |
| Turn the view (3D and up) | Drag it. **View** puts it back | Q / E |
| Undo · restart · hint | The buttons under the view | Z, U or Backspace · X · / |

In 3D and up the four-way pad turns with the camera, so **up** on the pad always points away from you on screen. Buttons dim when that move is blocked.

From 4D on, a dashed ring in each slice panel shows where a jump along W or V would land. Tap a panel to look into that slice without moving; tap again (or anywhere in the view) to come back.

### Endless

Once you finish a world, Endless mode opens for that dimension. It makes fresh puzzles on the spot: it carves a maze through the block, puts shards in the dead ends, sometimes adds a locked door or a crate and gate, and only keeps puzzles the solver can win. They get a little longer the more you solve.

## Putting it on your phone

The game has to be served over HTTPS for offline play and "Add to Home Screen" to work. The simplest way is GitHub Pages:

1. In the repository on GitHub, open **Settings → Pages**.
2. Under **Build and deployment**, pick **Deploy from a branch**, choose the branch that has this folder and `/ (root)`, then **Save**.
3. After a minute, open `https://<your-user>.github.io/<repo>/hyperdot/` on your phone.
4. Add it to your home screen:
   - **iPhone (Safari):** Share button → **Add to Home Screen**.
   - **Android (Chrome):** ⋮ menu → **Add to Home screen** / **Install app**.

Launched from the home screen, it runs full screen like an app and keeps working without a connection.

## Running it locally

```sh
cd hyperdot
python3 -m http.server 8000
```

Then open <http://localhost:8000>. To try it on your phone, connect it to the same Wi-Fi and open `http://<your-computer's-IP>:8000`. Opening `index.html` straight from the file system also works, but without offline support.

## How it's built

| File | What it does |
| --- | --- |
| `index.html` | Layout: the title, worlds, levels and Endless screens, the play screen, the world intro, the win card, settings and help |
| `css/style.css` | All styling. Mobile-first, respects safe areas (notches) and reduced-motion settings; on wide or landscape screens the pad moves beside the view |
| `js/core.js` | Maths, the seeded random generator, the five axes and their colours, and storage |
| `js/grid.js` | The N-dimensional grid: turns a level's text map into cells, and finds a cell's neighbour along any axis |
| `js/rules.js` | The rules: one `move()` function that the game, the hint button and the solver all share |
| `js/solver.js` | A breadth-first search that finds the shortest win. It gives every level its par and powers hints |
| `js/gen.js` | The Endless puzzle generator |
| `js/levels.js` | The campaign: five worlds and their levels |
| `js/progress.js` | Your save: best results and stars, Endless counts, settings |
| `js/view.js` | Draws a level: the flat board for 1D and 2D, the 3D scene (glass walls, lattice points, the drop line under the dot) for 3D and up, and the slice panels |
| `js/art.js` | The turning n-cube art, projected from up to 5D down to the screen |
| `js/controls.js` | The move pad for each dimension, turned to match the camera |
| `js/game.js` | The play screen: moves and their animations, undo, hints, peeking into slices, touch, mouse and keyboard |
| `js/audio.js` | Sound effects and generative music, synthesised with WebAudio (no audio files). Each axis plays its own note |
| `js/main.js` | Switching screens, intros, the win card, settings, help, toasts and the main loop |
| `tools/check-levels.js` | Proves every level can be won and checks its par (see below) |
| `sw.js`, `manifest.webmanifest`, `icons/` | Installable app + offline support |

Progress is saved in the browser's `localStorage`, so each phone or browser has its own save.

### Writing levels

A level's map is text, nested one array per dimension. The key is at the top of `js/grid.js`: `.` empty, `#` wall, `@` start, `X` exit, `*` shard, `a b c` keys, `A B C` doors, `o` crate, `_` plate, `=` gate.

```js
map: [            // 2D: rows, top to bottom
  '@....#',
  '.o...#',
  '.#.#.#',
  '.#_#.#',
  '####=#',
  '..X...',
],
```

A 3D map is a list of floors (bottom first), a 4D map a list of 3D maps (one per W slice), and a 5D map a list of 4D maps (one per V). After changing a map, run:

```sh
node tools/check-levels.js
```

It plays every level with the solver, fails if one can't be won, and prints the par to put in `levels.js`. It also checks that the Endless generator still works in every dimension.

### Tuning

- Star thresholds: `starsFor()` in `js/progress.js`.
- How long Endless puzzles are, and how fast that grows: `target` in `playEndless()` in `js/main.js`. Sizes and contents per dimension: `PRESETS` in `js/gen.js`.
- Axis colours: `AXES` in `js/core.js`. Wall, crate and gate colours: `COL` in `js/view.js`.
- When you change any file, bump `CACHE` in `sw.js` so installed copies pick up the update.
