/* Hyperdot — the rules. A state is where you are, what you've picked up,
   which doors you've opened and where the crates are. A move takes one state
   to the next. The game, the hint button and the level checker all use this
   one function, so they can never disagree about what's allowed.

   - You move one cell at a time along any axis the level has.
   - Walls and the edge of the grid stop you.
   - Walking onto a shard or a key picks it up.
   - A door opens if you hold a key of its colour, using the key up.
   - Walking into a crate pushes it one cell, if the cell beyond is empty
     (no wall, crate, item, exit, closed door or closed gate).
   - Gates are open while every plate has you or a crate on it. A gate that
     something is standing in stays open until it's free.
   - The exit opens once every shard is collected. Step on it to win. */
(function (HD) {
  'use strict';

  const G = HD.grid;

  function initial(L) {
    return { pos: L.start, items: 0, doors: 0, crates: L.crates0.slice() };
  }

  const has = (mask, i) => (mask >>> i) & 1;

  function platesHeld(L, s) {
    if (!L.plates.length) return false;
    for (const p of L.plates) if (s.pos !== p && s.crates.indexOf(p) < 0) return false;
    return true;
  }

  function gateOpen(L, s, cell, held) {
    return held || s.pos === cell || s.crates.indexOf(cell) >= 0;
  }

  function keysHeld(L, s, color) {
    let k = 0;
    for (let i = 0; i < L.items.length; i++) {
      const it = L.items[i];
      if (it.kind === G.KEY && it.color === color && has(s.items, i)) k++;
    }
    for (let i = 0; i < L.doors.length; i++) if (L.doors[i].color === color && has(s.doors, i)) k--;
    return k;
  }

  const allShards = (L, s) => (s.items & L.shardMask) === L.shardMask;

  function shardsLeft(L, s) {
    let k = 0;
    for (let i = 0; i < L.items.length; i++) if (L.items[i].kind === G.SHARD && !has(s.items, i)) k++;
    return k;
  }

  // Can a crate be pushed into `cell`?
  function freeForCrate(L, s, cell, doors, held) {
    if (cell < 0 || L.wall[cell] || cell === L.exit) return false;
    const d = L.doorAt[cell];
    if (d >= 0 && !has(doors, d)) return false;
    if (L.gateAt[cell] && !held) return false;
    const it = L.itemAt[cell];
    if (it >= 0 && !has(s.items, it)) return false;
    return s.crates.indexOf(cell) < 0;
  }

  /* Try to move along `axis` by `dir` (+1 or -1).
     Returns { ok: false, why } if you can't, or
     { ok: true, state, events, pushed, win } if you can. `pushed` is the index
     of the crate that moved (or -1). `events` lists what happened, for sounds
     and effects: push, shard, key, door, gate-open, gate-close, exit-open. */
  function move(L, s, axis, dir) {
    const t = G.step(L, s.pos, axis, dir);
    if (t < 0) return { ok: false, why: 'edge' };
    if (L.wall[t]) return { ok: false, why: 'wall' };
    const held = platesHeld(L, s);
    const events = [];
    let doors = s.doors;
    let items = s.items;
    let crates = s.crates;
    let pushed = -1;

    const d = L.doorAt[t];
    if (d >= 0 && !has(doors, d)) {
      if (keysHeld(L, s, L.doors[d].color) <= 0) return { ok: false, why: 'door', door: d };
      doors |= 1 << d;
      events.push('door');
    }
    if (L.gateAt[t] && !gateOpen(L, s, t, held)) return { ok: false, why: 'gate' };

    const ci = crates.indexOf(t);
    if (ci >= 0) {
      const t2 = G.step(L, t, axis, dir);
      if (!freeForCrate(L, s, t2, doors, held)) return { ok: false, why: 'crate', crate: ci };
      crates = crates.slice();
      crates[ci] = t2;
      pushed = ci;
      events.push('push');
    }

    const it = L.itemAt[t];
    if (it >= 0 && !has(items, it)) {
      items |= 1 << it;
      events.push(L.items[it].kind === G.SHARD ? 'shard' : 'key');
    }

    const next = { pos: t, items, doors, crates };
    if (L.gates.length) {
      const held2 = platesHeld(L, next);
      if (held2 && !held) events.push('gate-open');
      else if (!held2 && held) events.push('gate-close');
    }
    const done = allShards(L, next);
    if (done && !allShards(L, s) && L.shardCount) events.push('exit-open');
    return { ok: true, state: next, events, pushed, win: t === L.exit && done };
  }

  // A compact string that identifies a state (crate order doesn't matter).
  function key(s) {
    let c = '';
    if (s.crates.length === 1) c = s.crates[0];
    else if (s.crates.length > 1) c = s.crates.slice().sort((a, b) => a - b).join(',');
    return s.pos + ':' + s.items + ':' + s.doors + ':' + c;
  }

  HD.rules = { initial, move, key, platesHeld, gateOpen, keysHeld, allShards, shardsLeft, has };
})(window.HD = window.HD || {});
