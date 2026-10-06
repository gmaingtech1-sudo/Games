/* Frontline — shared helpers: maths, seeded randomness and the save file. */
window.FL = window.FL || {};
(function (FL) {
  'use strict';

  const TAU = Math.PI * 2;
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const chance = (p) => Math.random() < p;
  const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
  const angleTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
  // Smallest signed difference between two angles.
  const angleDiff = (a, b) => {
    let d = (b - a) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    return d;
  };
  const turnTo = (a, b, step) => {
    const d = angleDiff(a, b);
    return Math.abs(d) <= step ? b : a + Math.sign(d) * step;
  };

  // Seeded generator (mulberry32) → numbers in [0, 1), so each map is the same every time.
  function seeded(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function fmtTime(s) {
    s = Math.max(0, Math.floor(s));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  /* ---------- Save file ---------- */

  const KEY = 'frontline-save-v1';

  function defaults() {
    return {
      missions: {},          // id → { done, stars, bestTime }
      kills: 0,
      survivalBest: 0,
      outpostBest: 0,
      loadout: { primary: 'garand', secondary: 'pistol' },
      settings: { sound: true, vibe: true, shake: true, difficulty: 'regular', aimAssist: true, afk: false, autoFire: true },
    };
  }

  const save = {
    data: defaults(),
    load() {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) {
          const d = JSON.parse(raw);
          const base = defaults();
          this.data = Object.assign(base, d);
          this.data.settings = Object.assign(defaults().settings, d.settings || {});
          this.data.loadout = Object.assign(defaults().loadout, d.loadout || {});
        }
      } catch (e) { /* private mode or corrupt save: start fresh */ }
    },
    write() {
      try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* ignore */ }
    },
    reset() {
      this.data = defaults();
      this.write();
    },
  };

  FL.util = { TAU, clamp, lerp, rand, randInt, pick, chance, dist, angleTo, angleDiff, turnTo, seeded, fmtTime };
  FL.save = save;
})(window.FL);
