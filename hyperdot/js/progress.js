/* Hyperdot — your save: the best result on every level, Endless records,
   which world intros you've seen, and settings. Kept in localStorage. */
(function (HD) {
  'use strict';

  const KEY = 'hyperdot-save-v1';
  const W = HD.levels.WORLDS;

  function defaults() {
    return {
      v: 1,
      levels: {},
      endless: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      seen: {},
      settings: { sound: true, music: true, vibe: true },
      last: null,
    };
  }

  function sanitize(raw) {
    const d = defaults();
    if (!raw || typeof raw !== 'object') return d;
    if (raw.levels && typeof raw.levels === 'object') {
      for (const w of W) {
        for (const lv of w.levels) {
          const r = raw.levels[lv.id];
          if (!r || typeof r.best !== 'number' || r.best <= 0) continue;
          d.levels[lv.id] = { best: Math.floor(r.best), stars: Math.max(1, Math.min(3, Math.floor(r.stars) || 1)) };
        }
      }
    }
    if (raw.endless) for (const k of Object.keys(d.endless)) d.endless[k] = Math.max(0, Math.floor(Number(raw.endless[k]) || 0));
    if (raw.seen && typeof raw.seen === 'object') for (const k of Object.keys(raw.seen)) d.seen[k] = !!raw.seen[k];
    if (raw.settings) for (const k of Object.keys(d.settings)) if (typeof raw.settings[k] === 'boolean') d.settings[k] = raw.settings[k];
    if (typeof raw.last === 'string' && HD.levels.find(raw.last)) d.last = raw.last;
    return d;
  }

  const P = {
    data: sanitize(HD.store.read(KEY)),
    save() { HD.store.write(KEY, P.data); },
    reset() {
      const settings = P.data.settings;
      P.data = defaults();
      P.data.settings = settings;
      P.save();
    },

    result(id) { return P.data.levels[id] || null; },
    done(id) { return !!P.data.levels[id]; },

    // A level is open if it's the first one, or the one before it is done.
    unlocked(lv) {
      if (lv.world.n === 1 && lv.index === 0) return true;
      if (lv.index > 0) return P.done(lv.world.levels[lv.index - 1].id);
      const prev = W[lv.world.n - 2];
      return P.done(prev.levels[prev.levels.length - 1].id);
    },
    worldOpen(w) { return P.unlocked(w.levels[0]); },
    worldDone(w) { return w.levels.every((lv) => P.done(lv.id)); },

    stars(w) {
      let s = 0;
      for (const lv of w ? w.levels : [].concat(...W.map((x) => x.levels))) s += (P.data.levels[lv.id] || { stars: 0 }).stars;
      return s;
    },
    maxStars(w) { return 3 * (w ? w.levels.length : W.reduce((a, x) => a + x.levels.length, 0)); },

    // Record a win. Returns true if it's a new best.
    record(id, moves, stars) {
      const r = P.data.levels[id];
      let better = false;
      if (!r) {
        P.data.levels[id] = { best: moves, stars };
        better = true;
      } else {
        if (moves < r.best) {
          r.best = moves;
          better = true;
        }
        if (stars > r.stars) r.stars = stars;
      }
      P.save();
      return better;
    },

    // The first level not yet done, or the last one played.
    nextUp() {
      for (const w of W) for (const lv of w.levels) if (!P.done(lv.id) && P.unlocked(lv)) return lv;
      return HD.levels.find(P.data.last) || W[0].levels[0];
    },
  };

  // Stars for a finish: three at par, two close to it, one otherwise. Using a
  // hint means the run counts for one star.
  P.starsFor = function (moves, par, hinted) {
    if (hinted) return 1;
    if (moves <= par) return 3;
    if (moves <= par + Math.max(2, Math.ceil(par * 0.25))) return 2;
    return 1;
  };

  HD.progress = P;
})(window.HD = window.HD || {});
