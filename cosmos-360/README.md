# Cosmos 360

A space exploration game in a to-scale universe. Look in any direction, fly to real planets, moons and stars, scan them for your logbook, and jump to other star systems, all the way to the black hole at the centre of the Milky Way.

It runs in the browser on phones and computers. It's plain HTML, CSS and JavaScript with a bundled copy of [three.js](https://threejs.org/). There's no build step and nothing to install. After the first visit it also works offline.

## What's real

- **Distances and sizes are to scale.** One scene unit is 1,062 km (Earth's radius is 6 units), so the Sun really looks half a degree wide from Earth, and Neptune is 4.5 billion km away.
- **Everything is where it is today.** Planets move on their real orbits (JPL orbital elements), the Moon's position and phase come from a simplified lunar theory, and every body spins about its real pole at its real rate. Speed up time to watch it all move.
- **The sky is real.** About 120 of the brightest stars sit at their true positions and colours, with constellation lines and thousands of fainter background stars crowding toward the Milky Way, and a painted Milky Way lines up with the real galactic plane. It includes the Magellanic Clouds, Andromeda and the Great Rift. From other systems you'll see the Sun as a star in the right place and at the right brightness.
- **Earth has its real coastlines**, drawn from Natural Earth data, with deserts, rainforests, ice caps, clouds, city lights on the night side and sunlight glinting off the oceans.
- **Other worlds are painted from what we know**: the Moon's maria and Tycho's rays, Olympus Mons and Valles Marineris on Mars, Jupiter's Great Red Spot, Saturn's hexagon and ring gaps, Europa's cracks, Io's volcanoes, Pluto's heart, Iapetus' two-tone face and Mimas' giant crater.
- **Light behaves**: day and night, atmospheres that glow blue at Earth's edge and orange at Titan's, Saturn's rings casting shadows on the planet and the planet shadowing its rings, red light from red dwarfs, and a black hole that bends light around itself.

Exoplanet surfaces are educated guesses, because nobody has seen them yet. The game says so in each one's logbook entry.

## Playing

### Looking around

| Action | Touch | Keyboard / mouse |
| --- | --- | --- |
| Look around | Drag | Drag, or A D and ← → ↑ ↓ |
| Look with your phone | Tap **360°** and move the phone around you | |
| Zoom like a telescope | Pinch (double-tap to reset) | Mouse wheel, 0 to reset |
| Roll | Twist two fingers | Q E |

### Flying

- **Thrust**: the slider on the right. Speed scales with how close you are to something, so you can creep past a moon or cross the Solar System in seconds. W S also work.
- **Pick a target**: tap a planet, moon, star or label, or open the **navigation list** (the crosshair button at the top) to see everything in the system with distances. Tab cycles targets.
- **Go**: the autopilot turns you toward the target, accelerates, and brakes to a stop just outside it (Space). It steers around planets in the way.
- **Orbit**: circle the target and drag to swing around it. Pinch to move closer or farther. It slowly drifts around by itself if you leave it (O).
- **View**: switch between the chase view behind your ship and the cockpit view (C).

### Scanning and the logbook

Get close to a world and tap **Scan** (F). After a few seconds its data unlocks: size, gravity, day and year length, temperature and some facts. The **logbook** (the book button) tracks all 42 worlds across the five systems, plus how far you've flown and your top speed.

### Time

Tap the date to pause, run in real time, or speed time up to a year per second. **Back to now** returns to the present. Watch the Moon go through its phases, Io whip around Jupiter, or Halley's Comet fall in from the edge of the Solar System and grow its tails.

### Star map

Open the star map (the sparkle button) to jump through hyperspace to:

| System | Distance | What's there |
| --- | --- | --- |
| Solar System | Home | The Sun, eight planets, Ceres, Pluto, 15 moons, the asteroid and Kuiper belts, and Halley's Comet |
| Alpha Centauri | 4.34 ly | Two Sun-like stars in an 80-year orbit, and a possible giant planet JWST spotted in 2025 |
| Proxima Centauri | 4.25 ly | A flaring red dwarf with Proxima b in its habitable zone and Proxima d close in |
| TRAPPIST-1 | 40.7 ly | Seven Earth-sized planets around a tiny red star |
| Sagittarius A* | 26,670 ly | The Milky Way's supermassive black hole, with a lensed accretion disc. Watch time slow down as you get close. |

Sky markers show where the other systems are. The labels for other systems tell you how far away they are, and tapping one opens the star map.

### Photos

The camera button takes a clean shot of the view, stamped with where you are and the date, to save or share.

## Settings

Labels, orbit lines, bright dots for faraway worlds, constellations, sound, inverted drag, and graphics quality (Low / Med / High). Lower quality paints smaller textures and renders fewer pixels, which helps older phones.

## How it works

- `js/data.js`: every star system, body, orbit, rotation, colour and fact, plus the bright-star catalogue.
- `js/astro.js`: Kepler's equation, coordinate frames (ecliptic, equatorial, galactic) and IAU-style body orientation.
- `js/bake.js`: GPU shaders that paint each world's surface, height and cloud maps when you arrive in a system. Earth's land comes from `assets/earth-land.png`.
- `js/materials.js`: lighting for planets, atmospheres (a small ray-march), rings with shadows, stars, glows, belts and comet tails.
- `js/blackhole.js`: traces light through curved space around a Schwarzschild black hole.
- `js/sky.js`: the Milky Way cube map, star points and constellation lines.
- `js/world.js`: builds a system and moves every body each frame.
- `js/main.js`: flight, autopilot, orbit camera, 360° look, scanning, jumps and saving.
- `js/ui.js`, `js/input.js`, `js/audio.js`, `js/ship.js`: the HUD, controls, synthesised sound and your ship.

Progress and settings are saved in the browser's local storage.

## Credits

- [three.js](https://github.com/mrdoob/three.js) (MIT licence), bundled in `vendor/`.
- Coastlines from [Natural Earth](https://www.naturalearthdata.com/) (public domain) via the [world-atlas](https://github.com/topojson/world-atlas) package.
- Orbital elements from NASA JPL's *Approximate Positions of the Planets*, and rotation poles from the IAU Working Group on Cartographic Coordinates and Rotational Elements.
