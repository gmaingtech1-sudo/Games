# Nested Arcade

A game inside a game inside a game.

1. **The Arcade.** You're a kid at an arcade from 8 PM until it closes at midnight. Walk around (drag anywhere for a joystick), grab coins off the carpet before the robot vacuum gets them, and feed one into the **Star Hopper** cabinet.
2. **Star Hopper**, on the cabinet's screen. Hold the left or right side of the screen to steer an astronaut hopping up through space. Collect stars, dodge UFOs, and look for a **handheld console** floating up there.
3. **Pip Dash**, on that handheld's LCD. Tap left or right to dodge falling blocks and catch pips. When it ends, every pip fuels a rocket back in Star Hopper.

Star Hopper's score pays out in tickets at the arcade. Spend them at the prize counter on upgrades (Lucky Socks, a Coin Magnet, Fresh Batteries, a Spare Helmet), and save up 350 for **the Golden Cartridge** before closing time.

**The twist:** time runs slower the deeper you go — ×1 in the arcade, ×¼ in the cabinet, ×1/16 in the handheld. Win the Golden Cartridge to find out what's on it.

## How it's built

Each game really is drawn inside the one above it. Pip Dash renders to a 40×32 canvas, Star Hopper draws that canvas onto its handheld's screen in its own 160×200 canvas, and the Arcade draws Star Hopper's canvas onto the cabinet. "Going into" a game is just the camera zooming into its parent's screen, so you always see the outer game's frame around you. Each layer is lower-tech than the last: smooth vector graphics, then 16-bit-style pixels with CRT scanlines, then a four-shade green LCD.

Plain HTML, CSS and JavaScript (`index.html`, `css/style.css`, `js/game.js`), with no build step and no image files besides the icons. Sounds are synthesised. Open `index.html` in a browser to play; arrow keys/WASD and Enter work on a computer.

The Android app is in [`../nested-arcade-android`](../nested-arcade-android).
