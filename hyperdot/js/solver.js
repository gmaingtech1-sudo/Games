/* Hyperdot — the solver. A breadth-first search over every state you can
   reach, so the first win it finds is the shortest one. That gives each
   level its par (the fewest moves possible) and powers the hint button. */
(function (HD) {
  'use strict';

  const R = HD.rules;

  /* Search from state `s0`. Returns { moves, path, explored } where `path` is
     a list of [axis, dir] steps, or { moves: -1 } if there's no way to win
     (or the search hit `cap` states first, which sets `capped`). */
  function solve(L, s0, cap) {
    cap = cap || 600000;
    const states = [s0];
    const parent = [-1];
    const via = [-1];
    const seen = new Map();
    seen.set(R.key(s0), 0);
    const axes = L.n;
    for (let head = 0; head < states.length; head++) {
      const s = states[head];
      for (let a = 0; a < axes; a++) {
        for (let d = -1; d <= 1; d += 2) {
          const r = R.move(L, s, a, d);
          if (!r.ok) continue;
          if (r.win) {
            const path = [[a, d]];
            for (let i = head; parent[i] >= 0; i = parent[i]) {
              const v = via[i];
              path.push([v >> 1, v & 1 ? 1 : -1]);
            }
            path.reverse();
            return { moves: path.length, path, explored: states.length };
          }
          const k = R.key(r.state);
          if (seen.has(k)) continue;
          seen.set(k, states.length);
          states.push(r.state);
          parent.push(head);
          via.push(a * 2 + (d > 0 ? 1 : 0));
          if (states.length > cap) return { moves: -1, path: null, explored: states.length, capped: true };
        }
      }
    }
    return { moves: -1, path: null, explored: states.length };
  }

  HD.solver = { solve };
})(window.HD = window.HD || {});
