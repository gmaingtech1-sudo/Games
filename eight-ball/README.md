# Eight-Ball

Pub pool for phones, played to the official rules of the World Eightball Pool Federation (WEPF), from the abridged January 2020 rules sheet. You get reds and yellows on a 7 ft table, a baulk line, and two visits after a foul. Play against the computer at three skill levels, or pass the phone between two players.

It's plain HTML, CSS and JavaScript. There's no build step and nothing to install. The table, balls and cue are drawn in code and the sounds are synthesised, so the only image files are the app icons. After the first visit it also works offline.

## Playing

| Action | Touch | Keyboard / mouse |
| --- | --- | --- |
| Aim | Touch or drag anywhere on the table. The cue points where your finger is | Click or drag on the table |
| Fine aim | Drag sideways along the **fine aim** strip | ← / → (hold Shift for bigger steps) |
| Power and shoot | Pull right along the power bar and let go. Slide back to zero to cancel | Drag the bar, or ↑ / ↓ to set power and Space to shoot |
| Spin | The cue-ball button. Touch where to strike: top for follow, bottom for draw, the sides for side | Same |
| Ball in hand | Drag the cue ball anywhere behind the baulk line | Same |
| Pause | The pause button | Esc |

The aiming line shows the ghost ball where the cue ball will make contact, the path the object ball will take, and where the cue ball will glance off. If you're lined up on a ball you're not on, the ghost ball turns red with a cross. The guide can be shortened in Settings.

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
| `js/physics.js` | The table (cushions, jaws, pockets, baulk line, spot), the rack, and the physics: ball and cushion collisions, rolling resistance, follow, draw and side, and balls dropping. Also sight lines for snookers and aiming |
| `js/rules.js` | The referee: balls on, fair breaks, legal shots, fouls, two visits, deciding colours, touching balls, total and foul snookers, loss of frame and stalemates |
| `js/ai.js` | The computer player |
| `js/render.js` | Draws the table, balls, aiming guide and cue, portrait or landscape |
| `js/game.js` | A match in play: frames, turns, referee calls, the shot clock, touch controls and the computer's turns |
| `js/audio.js` | Sounds synthesised with WebAudio (no audio files) |
| `js/main.js` | The menu, settings, sheets and the main loop |
| `sw.js`, `manifest.webmanifest`, `icons/` | Installable app + offline support |

Settings and your record are saved in the browser's `localStorage`.

### Tuning

- Table size, pocket mouths and jaws: the constants at the top of `js/physics.js` (`C` for corner pockets, `M` for middle pockets).
- How the balls roll and bounce: `E_BALL`, `E_CUSH`, `ROLL_A`, `ROLL_B`, `DRAW` and `SIDE` in `js/physics.js`.
- Computer skill: `LEVELS` in `js/ai.js`.
- Shot clock: `SHOT_TIME` and `WARN_TIME` in `js/game.js`.
- When you change any file, bump `CACHE` in `sw.js` so installed copies pick up the update.
