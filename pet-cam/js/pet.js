/* Pet Cam — the pet itself: what kind it is, its needs (food, fun, energy),
   friendship levels and saving. The drawings live in js/art.js. */
window.PC = window.PC || {};
(function (PC) {
  'use strict';

  const TAU = Math.PI * 2;
  const INK = '#2B2140';
  const { SPECIES, COATS } = PC.art;

  // Needs change this much per real hour (meters go 0–100).
  const AWAKE_RATE = { food: -9, fun: -11, energy: -6 };
  const SLEEP_RATE = { food: -4, fun: -2, energy: 40 };
  const FLOOR = 5;  // needs never drop all the way to zero
  const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

  // Pets adopted before the real animals arrived.
  const OLD_SPECIES = { mochi: 'dog', pup: 'dog', kitty: 'cat', bunny: 'bunny' };
  const OLD_COAT = {
    dog: { peach: 'golden', berry: 'golden', lemon: 'golden', cocoa: 'chocolate', mint: 'beagle', sky: 'husky', lilac: 'black' },
    cat: { peach: 'orange', berry: 'calico', lemon: 'orange', cocoa: 'tuxedo', mint: 'gray', sky: 'white', lilac: 'black' },
    bunny: { peach: 'brown', berry: 'white', lemon: 'brown', cocoa: 'brown', mint: 'gray', sky: 'white', lilac: 'dutch' },
  };

  /* ======================= Model ======================= */

  function create(opts) {
    const species = SPECIES[opts.species] ? opts.species : 'dog';
    return {
      v: 1,
      name: opts.name || SPECIES[species].name,
      species,
      coat: COATS[species][opts.coat] ? opts.coat : Object.keys(COATS[species])[0],
      born: Date.now(),
      last: Date.now(),
      stats: { food: 75, fun: 70, energy: 90 },
      asleep: false,
      xp: 0,
      photos: 0,
      fetches: 0,
      treats: 0,
      sound: true,
    };
  }

  function revive(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== 1 || !raw.name) return null;
    const r = Object.assign({}, raw);
    if (!SPECIES[r.species]) {
      const sp = OLD_SPECIES[r.species] || 'dog';
      r.coat = (OLD_COAT[sp] || {})[r.color];
      r.species = sp;
    }
    delete r.color;
    const base = create(r);
    const s = Object.assign(base, r);
    s.stats = Object.assign(base.stats, raw.stats || {});
    if (!COATS[s.species][s.coat]) s.coat = Object.keys(COATS[s.species])[0];
    return s;
  }

  function load() {
    try { return revive(JSON.parse(PC.host.loadSave())); } catch (e) { return null; }
  }

  function save(s) {
    s.last = Date.now();
    PC.host.writeSave(JSON.stringify(s));
  }

  function clear() {
    PC.host.clearSave();
  }

  // Advance needs by `hours` (also used to catch up after the app was closed).
  function tick(s, hours) {
    const rate = s.asleep ? SLEEP_RATE : AWAKE_RATE;
    for (const k in rate) {
      const v = s.stats[k] + rate[k] * hours;
      s.stats[k] = rate[k] < 0 ? clamp(Math.min(s.stats[k], Math.max(FLOOR, v))) : clamp(v);
    }
    if (s.asleep && s.stats.energy >= 100) s.asleep = false;
  }

  function catchUp(s) {
    const hours = Math.min(72, Math.max(0, (Date.now() - s.last) / 3600000));
    if (hours > 0) tick(s, hours);
  }

  function bump(s, k, n) {
    s.stats[k] = clamp(s.stats[k] + n);
  }

  // Friendship level from XP: each level needs a bit more than the last.
  function level(s) {
    let lv = 1, need = 30, xp = s.xp;
    while (xp >= need) { xp -= need; lv++; need = Math.round(need * 1.35); }
    return { level: lv, into: xp, need };
  }

  // Returns true if this XP made the pet level up.
  function addXP(s, n) {
    const before = level(s).level;
    s.xp += n;
    return level(s).level > before;
  }

  // What the pet wants most right now, if anything.
  function wish(s) {
    if (s.asleep) return null;
    const { food, fun, energy } = s.stats;
    const low = [['food', food], ['energy', energy], ['fun', fun]].filter(([, v]) => v < 30);
    if (!low.length) return null;
    low.sort((a, b) => a[1] - b[1]);
    return low[0][0];
  }

  /* ======================= Small drawings for effects ======================= */

  function ellipse(ctx, x, y, rx, ry, rot, fill, stroke) {
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot || 0, 0, TAU);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = INK; ctx.lineWidth = stroke; ctx.stroke(); }
  }

  function heart(ctx, x, y, r, color) {
    ctx.beginPath();
    ctx.moveTo(x, y + r * 0.9);
    ctx.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.7, y - r * 1.4, x, y - r * 0.5);
    ctx.bezierCurveTo(x + r * 0.7, y - r * 1.4, x + r * 1.6, y - r * 0.2, x, y + r * 0.9);
    ctx.fillStyle = color || '#FF5D8F';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = r * 0.22;
    ctx.stroke();
  }

  PC.pet = {
    INK,
    SPECIES,
    COATS,
    create,
    load,
    save,
    clear,
    tick,
    catchUp,
    bump,
    level,
    addXP,
    wish,
    ellipse,
    heart,
  };
})(window.PC);
