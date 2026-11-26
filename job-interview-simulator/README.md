# Job Interview Simulator

A slapstick 3D job interview at Synergex Solutions Ltd. You sit across the desk from the interviewer in a toon-shaded office. Every question comes with a couple of sensible answers and a couple of less sensible ones: shoot the interviewer, punch them, throw your coffee, lob the stapler, flip the desk or smash a chair over their head. You can also tap the interviewer for a cheeky slap any time.

- 12 questions per interview, drawn from a pool of 20.
- Knock out Gary the Regional Manager and Karen from HR turns up. Knock her out and the CEO comes in.
- Violent answers in a row build a **Rampage** combo that hits harder.
- Polite answers raise your hire chance. Violence usually lowers it, but sometimes they're impressed.
- Endings: Hired, Hired... Somehow, We'll Be In Touch, Rejected, Escorted Out and Hostile Takeover (knock out all three).

It's built with [three.js](https://threejs.org/) (bundled in `js/vendor/`, MIT licence), so it works offline. Because it uses JavaScript modules, serve the folder over HTTP to play in a browser (for example `python3 -m http.server`), rather than opening `index.html` directly. Or install the [Android app](../job-interview-simulator-android/).

| File | What it does |
| --- | --- |
| `js/game.js` | The 3D office, the interviewers, the weapon animations, effects and game flow |
| `js/data.js` | Interviewers, weapons and the question pool |
| `js/sound.js` | Synthesised sound effects and vibration |
