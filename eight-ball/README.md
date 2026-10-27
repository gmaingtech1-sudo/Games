# Eight-Ball

Pub pool for phones, played to the official rules of the World Eightball Pool Federation (WEPF), from the abridged January 2020 rules sheet. You get reds and yellows on a 7 ft table, a baulk line, and two visits after a foul. Play against the computer at three skill levels, or pass the phone between two players.

The balls skid, roll, spin, draw and throw the way real ones do. The table is lit by overhead pub lamps and sounds like the real thing. It's plain HTML, CSS and JavaScript, with [three.js](https://threejs.org) (MIT licence, in `lib/`) for the 3D. There's no build step and nothing to install. The table, room, balls and cue are built in code and the sounds are synthesised, so the only image files are the app icons. After the first visit it also works offline.

## Playing

| Action | Touch | Keyboard / mouse |
| --- | --- | --- |
| Aim | Touch or drag anywhere on the table. The cue points where your finger is | Click or drag on the table |
| Fine aim | Drag sideways along the **fine aim** strip | ← / → (hold Shift for bigger steps) |
| Power and shoot | Pull right along the power bar and let go. Slide back to zero to cancel | Drag the bar, or ↑ / ↓ to set power and Space to shoot |
| Spin | The cue-ball button. Touch where the tip should strike: high for follow, low for draw (screw), left or right for side | Same |
| Ball in hand | Drag the cue ball anywhere behind the baulk line | Same |
| Pause | The pause button | Esc |

The aiming line shows the ghost ball where the cue ball will make contact, the path the object ball will take, and where the cue ball would glance off without spin. If you're lined up on a ball you're not on, the ghost ball turns red with a cross. In Settings you can shorten the guide, cut it to a single line, or turn it off.

## In 3D

The table is fully 3D, in a pub room with wood-panelled walls, wall lights and a dartboard. A long lamp hangs over the table, and its three shades are spotlights that cast real shadows of the balls and the cue. The balls are glossy and reflect the lamp. The cue is a real tapered cue, held with the butt raised to clear the rail, and it comes through the ball when you shoot.

The camera button next to the spin control switches views:

| View | What you see |
| --- | --- |
| **Player** | Down on the shot behind the cue ball, the way you'd line it up for real. Drag sideways anywhere to turn. When you shoot, you stand up to watch the balls run. When you have ball in hand, you stand over the table to place it. |
| **Overhead** | The whole table from above the baulk end, or from the side on a landscape screen. Touch where you want to aim. |
| **Top** | Straight down, like a plan. Touch where you want to aim. |

The fine aim strip, power bar and spin work the same in every view. If a phone can't do 3D (no WebGL), the game uses the flat table instead, and you can also choose it with **3D table** in Settings.

## How real it is

The balls behave the way real ones do, using real-world figures for resin balls on a worsted cloth:

- **Skid, then roll.** A ball struck in the middle skids first and only starts rolling after a short distance, losing 2/7 of its speed. A cue ball that's still skidding when it hits stops dead (a stun shot). One that's rolling follows through.
- **Spin.** Where the tip strikes matters. Hit low and the backspin draws the cue ball back after contact. It wears off over distance, so long draw shots need more power, just like on a real table. Hit high and it follows. Side spin bends rebounds off the cushions and dies away as the ball rolls. Using side also pushes the cue ball slightly off line ("squirt"), so you have to allow for it.
- **Throw.** Friction between the balls "throws" a cut object ball a degree or two off the line of centres, and passes a little spin on to it.
- **Cushions.** The rubber catches the ball a little above its centre, so a rebound depends on speed and spin. A ball comes off slower than it went in.
- **Pockets.** As on a real table, the cushions end in rounded jaws, and the slate is cut back in an arc between them where the pocket falls away. A ball drops once its centre is over that edge. It can rattle on the jaws and stay out, and a ball hugging the cushion runs past a middle pocket.
- **Rolling resistance.** Balls roll a long way on good cloth. It's the cushions that take their speed off.

You see and hear it too. The table is lit by a row of pub lamps, which light pools on the cloth, shine on each ball and cast soft shadows from the balls and the cue. The 8 and the red spots on the cue ball turn as the balls roll and spin, so you can watch your draw and side at work. The cue comes through the ball when you shoot. The sounds are the click of the balls, the thump of the cushions, the tip, the rumble of balls rolling on the cloth, and a potted ball running down the return channel to knock into the others.

For the real thing, set the aiming guide to **None** in Settings. Then you have only the cue to line up with.

## The rules

The referee in `js/rules.js` follows the WEPF rules. The **Rules** screen in the game explains them in plain words. In short:

- **Winning:** pot all seven of your colour, then the eight-ball.
- **The break** is played from baulk. It's a fair break if a colour drops or four balls reach a cushion. If it isn't, the opponent re-breaks with two visits. If the eight-ball goes down on the break, the balls are re-racked and the same player breaks again. An in-off on a fair break passes the turn.
- **Colours:** the table is open until someone legally pots a colour. If you pot on the break you choose. Choose a colour you didn't pot and you must pot it with your next shot. Pot both colours later and you choose. Colours are never decided on a foul.
- **Legal shot:** hit a ball you're on first, then pot one of yours or get any ball to a cushion. In a total snooker you only need to hit one. The game works this out.
- **Fouls:** in-off, wrong ball first, missing everything, potting an opponent's ball, no cushion, or playing into a touching ball. Any foul gives the opponent **two visits**. After an in-off they play from baulk; otherwise from where the cue ball stopped. The 60-second shot clock (with a warning at 30) gives a time foul with the same two visits, plus the option to play from baulk.
- **Foul snookers:** after a foul, if you can't hit both edges of any of your balls in a straight line, you can nominate one of your opponent's balls (or the eight-ball) as yours for that shot, or take the cue ball into baulk. The game spots the snooker and offers the choice.
- **Losing the frame:** potting the eight-ball on a foul, before your colour is cleared, or together with your last ball.
- **Stalemate:** if both players have three turns in a row without hitting a ball, the frame is replayed with the same breaker.

Some rules can't apply on a phone, so they're left out: the lag (a coin toss decides the first break), conduct at the table, push shots, double hits, jump shots, balls leaving the table and balls falling on their own. Foul jaw snookers aren't detected.

## The computer

The computer finds every open pot, plus thin, half-ball and full-ball safeties. It tries each one with the real physics and asks the referee what would happen. It scores the results: wins and fouls first, then pots that leave a good next shot, then safeties that leave you nothing. It also uses the referee to place the cue ball when it has ball in hand, to choose a colour, and to nominate a ball after a foul snooker. Its skill level sets how many shots it considers and how much its aim and power wobble:

| Level | Aim wobble | Looks at |
| --- | --- | --- |
| Easy | about 1.4° | its 4 best pots at one speed, and straight safeties. Sometimes picks its second or third choice |
| Medium | about 0.6° | 6 pots at two speeds, with and without draw |
| Hard | about 0.2° | 9 pots at three speeds with follow, stun and draw, and five safety lines per ball |

Your match record against each level is kept on the menu.

## Putting it on your phone

The game has to be served over HTTPS for offline play and "Add to Home Screen" to work. The simplest way is GitHub Pages:

1. In the repository on GitHub, open **Settings → Pages**.
2. Under **Build and deployment**, pick **Deploy from a branch**, choose the branch that has this folder and `/ (root)`, then **Save**.
3. After a minute, open `https://<your-user>.github.io/<repo>/eight-ball/` on your phone.
4. Add it to your home screen:
   - **iPhone (Safari):** Share button → **Add to Home Screen**.
   - **Android (Chrome):** ⋮ menu → **Add to Home screen** / **Install app**.

Hold the phone upright and the table stands long-ways. Turn it sideways and the table turns with it.

## Running it locally

```sh
cd eight-ball
python3 -m http.server 8000
```

Then open <http://localhost:8000>. Opening `index.html` straight from the file system also works, but without offline support.

## How it's built

| File | What it does |
| --- | --- |
| `index.html` | Layout: the menu, the table with its scoreboard and controls, the rules page, and the sheets for colours, spin, pause, frame over and settings |
| `css/style.css` | All styling. Mobile-first, respects safe areas (notches) and reduced motion |
| `js/physics.js` | The table (cushions, jaws, pockets, baulk line, spot), the rack, and the physics: each ball's velocity and 3D spin, skidding and rolling on the cloth, the tip's strike (with squirt), ball-to-ball collisions with throw and spin transfer, cushion rebounds that depend on spin, and balls dropping. Also sight lines for snookers and aiming |
| `js/rules.js` | The referee: balls on, fair breaks, legal shots, fouls, two visits, deciding colours, touching balls, total and foul snookers, loss of frame and stalemates |
| `js/ai.js` | The computer player |
| `js/render3d.js` | The 3D table and room, built with three.js from the same cushion, jaw and pocket shapes the physics uses: lighting and shadows, glossy balls turning with their spin, the cue, the aiming guide in 3D, and the three camera views |
| `lib/three.min.js` | three.js r160 (MIT licence, see `lib/three.LICENSE`) |
| `js/render.js` | The flat table, used when 3D is off or not available: the lamp-lit table, shaded balls whose markings turn as they roll, their shadows, the aiming guide and the cue, portrait or landscape |
| `js/game.js` | A match in play: frames, turns, referee calls, the shot clock, touch controls and the computer's turns |
| `js/audio.js` | Sounds synthesised with WebAudio (no audio files): ball clicks, cushions, the tip, rolling, pockets and the ball return |
| `js/main.js` | The menu, settings, sheets and the main loop |
| `sw.js`, `manifest.webmanifest`, `icons/` | Installable app + offline support |

Settings and your record are saved in the browser's `localStorage`.

### Tuning

- Table size, pocket mouths and jaws: the constants at the top of `js/physics.js` (`C` for corner pockets, `M` for middle pockets, `NOSE_CORNER` and `NOSE_MIDDLE` for how rounded the jaws are, and `pockets` for where the slate falls away).
- How the balls skid, roll and bounce: `MU_SLIDE`, `MU_ROLL`, `SPIN_DECAY`, `E_BALL`, `MU_BALL`, `MU_CUSH`, `NOSE`, `TIP` and `SQUIRT` in `js/physics.js`.
- The lamps (where they hang and how high): `LAMPS` and `LAMP_H` in `js/render.js`.
- Computer skill: `LEVELS` in `js/ai.js`.
- Shot clock: `SHOT_TIME` and `WARN_TIME` in `js/game.js`.
- When you change any file, bump `CACHE` in `sw.js` so installed copies pick up the update.
