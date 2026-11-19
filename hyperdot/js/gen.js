/* Hyperdot — the puzzle generator, for Endless mode. It carves a twisty maze
   through an N-dimensional block, scatters shards in the dead ends, sometimes
   locks part of it behind a door or a gate, then asks the solver whether it
   can be won and in how few moves. Only puzzles that pass come out, and the
   same seed always gives the same puzzle. */
(function (HD) {
  'use strict';

  const G = HD.grid;
  const S = HD.solver;
  const U = HD.util;

  // Puzzle sizes and contents for each dimension. `fill` is roughly how much
  // of the block is open space.
  const PRESETS = {
    1: { dims: [13], shards: [2, 3], keys: [0, 1], crates: [0, 1], par: [8, 30] },
    2: { dims: [7, 7], shards: [2, 4], keys: [0, 1], crates: [0, 1], par: [14, 44] },
    3: { dims: [4, 4, 3], shards: [2, 4], keys: [0, 1], crates: [0, 1], par: [14, 44] },
    4: { dims: [3, 3, 3, 3], shards: [2, 4], keys: [0, 1], crates: [0, 1], par: [16, 48] },
    5: { dims: [3, 3, 2, 3, 3], shards: [3, 4], keys: [0, 1], crates: [0, 1], par: [16, 52] },
  };

  function neighbours(dims, strides, i, out) {
    out.length = 0;
    for (let k = 0; k < dims.length; k++) {
      const c = Math.floor(i / strides[k]) % dims[k];
      if (c > 0) out.push(i - strides[k]);
      if (c < dims[k] - 1) out.push(i + strides[k]);
    }
    return out;
  }

  // A growing-tree maze in cell space: open cells form corridors one cell
  // wide, with a few extra openings so there's more than one way round.
  function carve(dims, rng, loops) {
    const n = dims.length;
    const strides = [];
    let size = 1;
    for (let k = 0; k < n; k++) {
      strides.push(size);
      size *= dims[k];
    }
    const open = new Uint8Array(size);
    const nb = [];
    const nb2 = [];
    const openCount = (i) => {
      let c = 0;
      for (const j of neighbours(dims, strides, i, nb2)) c += open[j];
      return c;
    };
    const first = rng.int(0, size - 1);
    open[first] = 1;
    const active = [first];
    while (active.length) {
      const ai = rng() < 0.7 ? active.length - 1 : rng.int(0, active.length - 1);
      const c = active[ai];
      const cand = neighbours(dims, strides, c, nb).filter((j) => !open[j] && openCount(j) === 1);
      if (!cand.length) {
        active.splice(ai, 1);
        continue;
      }
      const j = rng.pick(cand);
      open[j] = 1;
      active.push(j);
    }
    // Knock through a few walls between corridors.
    const walls = [];
    for (let i = 0; i < size; i++) if (!open[i] && openCount(i) >= 2) walls.push(i);
    rng.shuffle(walls);
    for (let k = 0; k < Math.min(loops, walls.length); k++) open[walls[k]] = 1;
    return { open, strides, size };
  }

  function bfs(dims, strides, open, from, blocked) {
    const dist = new Int16Array(open.length).fill(-1);
    const q = [from];
    dist[from] = 0;
    const nb = [];
    for (let h = 0; h < q.length; h++) {
      const c = q[h];
      for (const j of neighbours(dims, strides, c, nb)) {
        if (!open[j] || dist[j] >= 0 || j === blocked) continue;
        dist[j] = dist[c] + 1;
        q.push(j);
      }
    }
    return dist;
  }

  // Turn a flat list of cell characters back into a nested map.
  function toMap(dims, chars) {
    function build(level, offset) {
      if (level === 0) return chars.slice(offset, offset + dims[0]).join('');
      let stride = 1;
      for (let k = 0; k < level; k++) stride *= dims[k];
      const out = [];
      for (let i = 0; i < dims[level]; i++) out.push(build(level - 1, offset + i * stride));
      return out;
    }
    return build(dims.length - 1, 0);
  }

  function attempt(dims, cfg, rng) {
    const n = dims.length;
    const { open, strides, size } = carve(dims, rng, n === 1 ? 0 : rng.int(1, 2 + n));
    const cells = [];
    for (let i = 0; i < size; i++) if (open[i]) cells.push(i);
    if (cells.length < 6) return null;
    const nb = [];
    const deg = (i) => neighbours(dims, strides, i, nb).filter((j) => open[j]).length;

    const start = rng.pick(cells);
    const dist = bfs(dims, strides, open, start, -1);
    let maxD = 0;
    for (const c of cells) maxD = Math.max(maxD, dist[c]);
    const leaves = rng.shuffle(cells.filter((c) => c !== start && deg(c) === 1));
    const used = new Set([start]);

    const far = leaves.filter((c) => dist[c] >= maxD * 0.55);
    const exit = far.length ? far[0] : cells.reduce((a, b) => (dist[b] > dist[a] ? b : a), start);
    used.add(exit);

    const chars = new Array(size).fill('#');
    for (const c of cells) chars[c] = '.';
    chars[start] = '@';
    chars[exit] = 'X';

    const free = () => rng.shuffle(cells.filter((c) => !used.has(c) && dist[c] >= 2));
    const nShards = rng.int(cfg.shards[0], cfg.shards[1]);
    const spots = leaves.filter((c) => !used.has(c)).concat(free());
    let placed = 0;
    for (const c of spots) {
      if (placed >= nShards) break;
      if (used.has(c)) continue;
      chars[c] = '*';
      used.add(c);
      placed++;
    }

    // A cell is a choke point if blocking it cuts the start off from the exit
    // or a shard. Doors and gates go there, so they always matter.
    const targets = cells.filter((c) => chars[c] === 'X' || chars[c] === '*');
    const chokes = rng.shuffle(cells.filter((c) => {
      if (used.has(c) || deg(c) !== 2 || dist[c] < 2) return false;
      const d2 = bfs(dims, strides, open, start, c);
      return targets.some((t) => d2[t] < 0);
    }));

    const nKeys = rng.int(cfg.keys[0], cfg.keys[1]);
    for (let k = 0; k < nKeys && chokes.length; k++) {
      const door = chokes.shift();
      const near = bfs(dims, strides, open, start, door);
      const keySpots = rng.shuffle(cells.filter((c) => !used.has(c) && near[c] >= 2 && c !== door));
      if (!keySpots.length) break;
      keySpots.sort((a, b) => deg(a) - deg(b));
      chars[door] = 'ABC'[k];
      chars[keySpots[0]] = 'abc'[k];
      used.add(door);
      used.add(keySpots[0]);
    }

    const nCrates = rng.int(cfg.crates[0], cfg.crates[1]);
    if (nCrates && chokes.length) {
      const gate = chokes.shift();
      const near = bfs(dims, strides, open, start, gate);
      const gd = bfs(dims, strides, open, gate, -1);
      const side = cells.filter((c) => !used.has(c) && near[c] >= 0 && c !== gate);
      const plates = rng.shuffle(side.filter((c) => gd[c] >= 3));
      let ok = false;
      for (const plate of plates.slice(0, 4)) {
        // Put the crate in a straight line with the plate, with room to push.
        const lines = [];
        for (let a = 0; a < n; a++) {
          for (const d of [-1, 1]) {
            const c1 = G.step({ n, dims, strides }, plate, a, d);
            const c2 = c1 >= 0 ? G.step({ n, dims, strides }, c1, a, d) : -1;
            if (c1 >= 0 && c2 >= 0 && open[c1] && open[c2] && !used.has(c1) && c1 !== gate && c2 !== gate) lines.push(c1);
          }
        }
        if (!lines.length) continue;
        const crate = rng.pick(lines);
        chars[gate] = '=';
        chars[plate] = '_';
        chars[crate] = 'o';
        used.add(gate);
        used.add(plate);
        used.add(crate);
        ok = true;
        break;
      }
      if (!ok && chokes.length === 0) return null;
    }

    return toMap(dims, chars);
  }

  // How interesting a solution is: long enough, and it has to use the
  // highest dimension more than once.
  function rate(L, sol) {
    const top = L.n - 1;
    let topMoves = 0;
    let turns = 0;
    for (let i = 0; i < sol.path.length; i++) {
      if (sol.path[i][0] === top) topMoves++;
      if (i && sol.path[i][0] !== sol.path[i - 1][0]) turns++;
    }
    return { topMoves, turns };
  }

  /* Make a puzzle. `dimsOrN` is a dimension (1–5) or an explicit size like
     [3, 3, 3, 3]. Options override the preset; `target` asks for a par close
     to that many moves. Returns { def, par } or null if nothing passed. */
  function generate(dimsOrN, seed, opts) {
    const n = Array.isArray(dimsOrN) ? dimsOrN.length : dimsOrN;
    const base = PRESETS[n];
    const cfg = Object.assign({}, base, opts || {});
    const dims = Array.isArray(dimsOrN) ? dimsOrN : cfg.dims;
    const rng = U.seeded(seed);
    const tries = cfg.tries || 60;
    let best = null;
    for (let t = 0; t < tries; t++) {
      const map = attempt(dims, cfg, rng);
      if (!map) continue;
      const def = { map };
      let L;
      try {
        L = G.compile(def);
      } catch (e) {
        continue;
      }
      const sol = S.solve(L, HD.rules.initial(L), 120000);
      if (sol.moves < cfg.par[0] || sol.moves > cfg.par[1]) continue;
      const r = rate(L, sol);
      if (n > 1 && r.topMoves < 2) continue;
      const extras = (L.crates0.length ? 6 : 0) + L.doors.length * 4;
      // With a target, aim for that many moves; otherwise, longer is better.
      const score = cfg.target
        ? extras + r.turns * 0.3 - Math.abs(sol.moves - cfg.target) * 2
        : sol.moves + r.turns * 0.6 + extras;
      if (!best || score > best.score) best = { def, par: sol.moves, score };
      if (cfg.first || t > tries / 3) {
        if (best) break;
      }
    }
    return best;
  }

  HD.gen = { generate, toMap, PRESETS };
})(window.HD = window.HD || {});
