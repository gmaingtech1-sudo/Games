/* Eight-Ball — the tournament: the Eight-Ball Open, an eight-player
   knockout. You and seven regulars from the pub, each with their own skill.
   Quarter-finals and semi-finals are first to 2 frames, the final first to
   3. The strongest players are seeded apart, so the best are met late.
   Matches between computer players are played out (by their skill) while
   you play yours. A tournament is plain data, so it can be saved. */
(function (EB) {
  'use strict';

  const ROUNDS = ['Quarter-final', 'Semi-final', 'Final'];
  const RACE = [2, 2, 3];

  // The regulars. Which ones turn up, and how good they are, depends on
  // the level of the field.
  const REGULARS = [
    'Big Dave', 'Tina Marsh', 'Lefty Lewis', 'Old Arthur', 'Sharon Pike', 'Raj Patel',
    'Mick Doyle', 'Jen Okafor', 'Kev Rourke', 'Pearl Hughes', 'Sully', 'Dot Kaminski',
  ];
  const FIELDS = {
    easy: ['easy', 'easy', 'easy', 'easy', 'medium', 'medium', 'medium'],
    medium: ['easy', 'easy', 'medium', 'medium', 'medium', 'hard', 'hard'],
    hard: ['medium', 'medium', 'medium', 'hard', 'hard', 'hard', 'hard'],
  };
  const STRENGTH = { easy: 1, medium: 2.3, hard: 4.4 };
  // Draw slots, from the weakest opponent to the strongest: the weakest
  // plays you first; the strongest is in the other half, for the final.
  const SLOTS = [1, 2, 3, 5, 6, 4, 7];

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function create(field, you) {
    const levels = (FIELDS[field] || FIELDS.medium).slice();
    const names = shuffle(REGULARS.slice()).slice(0, 7);
    const players = [{ name: you, level: null }];
    levels.forEach((level, i) => { players[SLOTS[i]] = { name: names[i], level }; });
    const t = { field, players, round: 0, rounds: [[], [], []], out: null, champion: null };
    for (let i = 0; i < 8; i += 2) t.rounds[0].push({ a: i, b: i + 1, s: [0, 0], w: null });
    return t;
  }

  // The match you're due to play, or null if you're out or it's over.
  function next(t) {
    if (t.out !== null || t.champion !== null) return null;
    const m = t.rounds[t.round].find((x) => x.a === 0 || x.b === 0);
    if (!m) return null;
    const opp = t.players[m.a === 0 ? m.b : m.a];
    return { m, opp, round: ROUNDS[t.round], race: RACE[t.round] };
  }

  // Frame by frame, by skill, until someone reaches the race.
  function play(t, m) {
    const pa = STRENGTH[t.players[m.a].level];
    const pb = STRENGTH[t.players[m.b].level];
    const race = RACE[t.round];
    while (m.s[0] < race && m.s[1] < race) m.s[Math.random() < pa / (pa + pb) ? 0 : 1]++;
    m.w = m.s[0] > m.s[1] ? m.a : m.b;
  }

  // Finish the round (playing out the other matches) and draw the next one.
  function advance(t) {
    for (const m of t.rounds[t.round]) if (m.w === null) play(t, m);
    if (t.round === 2) {
      t.champion = t.rounds[2][0].w;
      return;
    }
    const ws = t.rounds[t.round].map((m) => m.w);
    t.round++;
    for (let i = 0; i < ws.length; i += 2) t.rounds[t.round].push({ a: ws[i], b: ws[i + 1], s: [0, 0], w: null });
  }

  // Your match is over. If you lost, the rest of the tournament is played out.
  function result(t, mine, theirs) {
    const n = next(t);
    if (!n) return;
    const youA = n.m.a === 0;
    n.m.s = youA ? [mine, theirs] : [theirs, mine];
    n.m.w = mine > theirs ? 0 : youA ? n.m.b : n.m.a;
    if (n.m.w !== 0) t.out = t.round;
    advance(t);
    if (t.out !== null) while (t.champion === null) advance(t);
  }

  EB.tour = { ROUNDS, RACE, create, next, result };
})(window.EB = window.EB || {});
