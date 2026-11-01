# Neon Break

An arcade pool game for touchscreen phones, with neon tables, realistic ball physics and balls that really roll.

Open `index.html` in a browser to play, or install the Android app from [`../neon-break-android`](../neon-break-android).

## Modes

- **VS CPU**: 8-ball against three CPU players: Rookie, Hustler and Shark. The CPU tries its candidate shots in the same physics engine before it picks one, so it plays real position. The weaker levels just aim less accurately and sometimes pick a worse shot.
- **2 Players**: 8-ball for two people passing one phone.
- **Trick Shots**: twelve challenges, from simple pots to banks, combos, kick shots and a six-ball clearance, with up to three stars each. On the one-shot challenges a miss puts the balls back and keeps your aim, so you can nudge it and go again.
- **Blitz**: 90 seconds on the clock. Every pot scores and adds 2 seconds. Pot on shot after shot for a combo up to x5. The black 8 is worth 3. Potting the white costs 5 seconds. Clear the table for a bonus and a fresh rack.

You earn coins by winning matches, scoring in Blitz, earning trick-shot stars and coming back each day (the daily bonus grows with your streak). Spend them in the **Shop** on cues, table cloths and ball sets.

### Argon Crystal

The premium set:
- **Balls**: faceted glass with a glowing core. Each facet catches the lamps on its own, so the balls glitter as they roll, and they cast coloured light on the cloth.
- **Table**: a crystal table with glowing seams.
- **Cue**: a faceted crystal cue with light running up the shaft.

### Showing off

Bank shots, combos, kick shots, doubles and long pots get called out on screen and earn bonus coins (bonus points in Blitz). Pot on three shots in a row and you're **on fire**: the cue ball blazes and leaves a trail. When a ball that would win the game heads for a pocket, time slows down.

## Controls

- **Aim**: touch the table and the cue points at your finger. Drag to move it.
- **Fine aim**: slide along the ribbed strip for tiny adjustments.
- **Shoot**: drag right along the power bar and let go. Slide back to the start to cancel.
- **Spin**: tap the little white ball, then tap where the cue should hit. Low screws the cue ball back, high follows through, and the sides bend its bounce off cushions.
- **Ball in hand**: after a foul, drag the white ball wherever you like (behind the line after a scratch on the break).

## Realism

- **Spin**: balls skid, then roll. The cue ball carries real topspin or backspin, so draw and follow come from the physics: hit low and the white screws back after contact, hit high and it follows through. Struck balls slide before they start rolling, and cushions take the spin out of a ball.
- **Lighting**: three lamps hang over the table. They light pools on the cloth, cast a soft shadow from every ball and show up as reflections in each ball's polish.
- **Table**: woven cloth texture, wood-grain rails, chrome pocket caps.

## 8-ball rules used

- The table is open after the break. The first ball you pot after that makes you solids (1–7) or stripes (9–15).
- Pot one of your balls and you shoot again. Pot all of yours, then the 8, to win.
- Fouls give the other player ball in hand: potting the white, missing every ball, hitting the other group (or the 8) first, or nothing touching a cushion after the hit.
- Potting the 8 before your group is clear, or fouling while potting it, loses the game. Potting it on the break just puts it back on its spot.

## Files

| File | What it does |
| --- | --- |
| `js/physics.js` | Table shape (cushions, pocket jaws), slide/roll ball physics with spin on a fixed time step, aim ray |
| `js/rules.js` | 8-ball rules and the CPU player |
| `js/levels.js` | The Trick Shot layouts |
| `js/main.js` | Drawing (each ball is shaded per pixel and rotates as it rolls), controls, sound effects made with Web Audio, modes, shop and saving |
| `css/style.css`, `index.html` | Menus and HUD |

Progress is saved in the browser's local storage (in the Android app, in the app's own storage).
