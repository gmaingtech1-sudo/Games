# Neon Break

An arcade pool game for touchscreen phones, with neon tables and balls that really roll.

Open `index.html` in a browser to play, or install the Android app from [`../neon-break-android`](../neon-break-android).

## Modes

- **VS CPU**: 8-ball against three CPU players: Rookie, Hustler and Shark. The CPU tries its candidate shots in the same physics engine before it picks one, so it plays real position. The weaker levels just aim less accurately and sometimes pick a worse shot.
- **2 Players**: 8-ball for two people passing one phone.
- **Blitz**: 90 seconds on the clock. Every pot scores and adds 2 seconds. Pot on shot after shot for a combo up to x5. The black 8 is worth 3. Potting the white costs 5 seconds. Clear the table for a bonus and a fresh rack.

You earn coins by winning matches and scoring in Blitz. Spend them in the **Shop** on cues (Bubblegum, Ice Blade, Toxic, Golden Break, Laser, Rainbow) and table cloths (Midnight, Crimson, Purple Haze, Neon Grid, Galaxy).

## Controls

- **Aim**: touch the table and the cue points at your finger. Drag to move it.
- **Fine aim**: slide along the ribbed strip for tiny adjustments.
- **Shoot**: drag right along the power bar and let go. Slide back to the start to cancel.
- **Spin**: tap the little white ball, then tap where the cue should hit. Low screws the cue ball back, high follows through, and the sides bend its bounce off cushions.
- **Ball in hand**: after a foul, drag the white ball wherever you like (behind the line after a scratch on the break).

## 8-ball rules used

- The table is open after the break. The first ball you pot after that makes you solids (1–7) or stripes (9–15).
- Pot one of your balls and you shoot again. Pot all of yours, then the 8, to win.
- Fouls give the other player ball in hand: potting the white, missing every ball, hitting the other group (or the 8) first, or nothing touching a cushion after the hit.
- Potting the 8 before your group is clear, or fouling while potting it, loses the game. Potting it on the break just puts it back on its spot.

## Files

| File | What it does |
| --- | --- |
| `js/physics.js` | Table shape (cushions, pocket jaws), ball physics on a fixed time step, aim ray |
| `js/rules.js` | 8-ball rules and the CPU player |
| `js/main.js` | Drawing (each ball is shaded per pixel and rotates as it rolls), controls, sound effects made with Web Audio, modes, shop and saving |
| `css/style.css`, `index.html` | Menus and HUD |

Progress is saved in the browser's local storage (in the Android app, in the app's own storage).
