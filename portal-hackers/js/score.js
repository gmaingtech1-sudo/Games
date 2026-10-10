/* Portal Hackers: Nexus — the world score. Like Ingress, the war is scored
   in cycles: each cycle lasts 175 hours and has 35 checkpoints, one every 5
   hours. At each checkpoint every team's Control Points (CP) are counted:
   the CP of all the control fields it holds. The team with the highest
   average over the cycle wins it.

   A control field's CP comes from its area: 1 CP per 1,000 m², at least 10.

   There's no server, so the rest of the world (the other players on every
   team) is simulated from seeds, the same for everyone; your own fields are
   added to your team's score live. Used by the game and the Intel map. */
window.PH = window.PH || {};
(function (PH) {
  'use strict';

  const { rng } = PH.util;
  const W = PH.world;

  const LAUNCH = Date.UTC(2026, 9, 5);
  const CHECKPOINT_MS = 5 * 3600e3;
  const CHECKPOINTS = 35;
  const CYCLE_MS = CHECKPOINT_MS * CHECKPOINTS;
  const TEAMS = ['N', 'P', 'E'];

  // Chart colours: deeper steps of each team's colour that pass the
  // colour-blind, contrast and lightness checks on the dark background.
  const CHART = { N: '#0092B0', P: '#B12083', E: '#C26F00' };

  function triangleArea(a, b, c) {
    const B = W.offset(a, b), C = W.offset(a, c);
    return Math.abs(B[0] * C[1] - C[0] * B[1]) / 2;
  }

  const fieldCP = (a, b, c) => Math.max(10, Math.round(triangleArea(a, b, c) / 1000));

  function cycleOf(now) {
    const t = Math.max(0, now - LAUNCH);
    const index = Math.floor(t / CYCLE_MS);
    const start = LAUNCH + index * CYCLE_MS;
    const checkpoint = Math.min(CHECKPOINTS, Math.floor((now - start) / CHECKPOINT_MS));
    return {
      index, start, end: start + CYCLE_MS, checkpoint,   // checkpoints passed so far (0–35)
      nextCheckpoint: start + (checkpoint + 1) * CHECKPOINT_MS,
    };
  }

  // The simulated rest of the world: each team's CP at checkpoint k of a
  // cycle. A seeded random walk around a team-and-cycle base.
  function simSeries(team, cycleIndex) {
    const r = rng(`cycle:${cycleIndex}:${team}`);
    let v = 32000 + r() * 30000;
    const drift = (r() - 0.5) * 0.04;
    const out = [];
    for (let k = 0; k < CHECKPOINTS; k++) {
      v *= 1 + drift + (r() - 0.5) * 0.12;
      v = Math.max(8000, v);
      out.push(Math.round(v));
    }
    return out;
  }

  // Scores so far this cycle. `mine` is { team, cp, log } where cp is the CP
  // of the fields you hold now and log maps checkpoint → your CP back then.
  function standings(now, mine) {
    const cyc = cycleOf(now);
    const n = Math.max(1, cyc.checkpoint);
    const series = {};
    for (const t of TEAMS) {
      const s = simSeries(t, cyc.index).slice(0, n);
      if (mine && t === mine.team) {
        for (let k = 0; k < s.length; k++) {
          const add = k === s.length - 1 ? Math.max(mine.cp, (mine.log && mine.log[k]) || 0) : (mine.log && mine.log[k]) || 0;
          s[k] += add;
        }
      }
      series[t] = s;
    }
    const avg = {};
    for (const t of TEAMS) avg[t] = Math.round(series[t].reduce((x, y) => x + y, 0) / series[t].length);
    const order = TEAMS.slice().sort((a, b) => avg[b] - avg[a]);
    return { cycle: cyc, series, avg, order, leader: order[0] };
  }

  // The top agents this cycle: simulated players plus you.
  const CALL = ['Vex', 'Juno', 'Kite', 'Rook', 'Sable', 'Tamsin', 'Orin', 'Lyra', 'Moss', 'Indigo', 'Pax', 'Wren', 'Zed', 'Echo', 'Nyx', 'Corvo', 'Astra', 'Bolt', 'Cipher', 'Delta'];
  function topAgents(now, me) {
    const cyc = cycleOf(now);
    const r = rng(`agents:${cyc.index}`);
    const frac = Math.max(0.05, (now - cyc.start) / CYCLE_MS);
    const list = [];
    const used = new Set();
    for (let i = 0; i < 9; i++) {
      let name;
      do { name = CALL[Math.floor(r() * CALL.length)] + (r() < 0.4 ? Math.floor(r() * 99) : ''); } while (used.has(name));
      used.add(name);
      list.push({ name, team: TEAMS[Math.floor(r() * 3)], cp: Math.round((1500 + r() * 9000) * frac), you: false });
    }
    if (me) list.push({ name: me.name, team: me.team, cp: me.cp, you: true });
    return list.sort((a, b) => b.cp - a.cp);
  }

  PH.score = { LAUNCH, CHECKPOINT_MS, CHECKPOINTS, CYCLE_MS, TEAMS, CHART, triangleArea, fieldCP, cycleOf, standings, topAgents };
})(window.PH);
