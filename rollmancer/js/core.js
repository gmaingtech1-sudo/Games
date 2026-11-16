/* Rollmancer — shared helpers: maths, seeded randomness, number formatting
   and the save slot. Everything hangs off one global, RM, so the game runs
   from plain <script> tags (and straight from the file system). */
(function (root) {
  'use strict';

  const RM = root.RM || (root.RM = {});

  const TAU = Math.PI * 2;
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const easeOut = (k) => 1 - Math.pow(1 - clamp(k, 0, 1), 3);
  const easeIn = (k) => Math.pow(clamp(k, 0, 1), 3);
  const easeInOut = (k) => {
    k = clamp(k, 0, 1);
    return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  };
  // Overshoots a little and settles: used for pops and landings.
  const easeBack = (k) => {
    k = clamp(k, 0, 1);
    const c = 1.9;
    return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2);
  };
  const approach = (v, to, step) => (v < to ? Math.min(to, v + step) : Math.max(to, v - step));

  /* ---------------- seeded randomness ----------------
     A run is driven by a few independent mulberry32 streams (dice rolls,
     shop stock, loot), each saved as a single integer. Splitting them means
     a Daily Run shows everyone the same shops and monsters no matter how
     many times each player rerolled their dice. */
  function hashStr(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  // A stream works on a plain {s} object so its state saves as JSON.
  function Stream(state) {
    this.o = typeof state === 'object' && state ? state : { s: state >>> 0 };
  }
  Stream.prototype.next = function () {
    this.o.s = (this.o.s + 0x6D2B79F5) >>> 0;
    let t = this.o.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  Stream.prototype.int = function (a, b) {
    return a + Math.floor(this.next() * (b - a + 1));
  };
  Stream.prototype.pick = function (arr) {
    return arr[Math.floor(this.next() * arr.length)];
  };
  Stream.prototype.chance = function (p) {
    return this.next() < p;
  };
  // Picks from [{w, ...}] by weight.
  Stream.prototype.weighted = function (arr, wf) {
    let total = 0;
    for (const a of arr) total += wf(a);
    let r = this.next() * total;
    for (const a of arr) {
      r -= wf(a);
      if (r < 0) return a;
    }
    return arr[arr.length - 1];
  };
  Stream.prototype.shuffle = function (arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  };

  function newSeed() {
    let s = 0;
    try {
      const a = new Uint32Array(1);
      root.crypto.getRandomValues(a);
      s = a[0];
    } catch (e) {
      s = (Math.random() * 4294967296) >>> 0;
    }
    return s >>> 0;
  }

  // A short code for a seed, like "K7Q-2MX", so players can share runs.
  const SEED_ALPHA = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  function seedCode(seed) {
    let s = seed >>> 0;
    let out = '';
    for (let i = 0; i < 6; i++) {
      out += SEED_ALPHA[s % 32];
      s = Math.floor(s / 32);
    }
    return out.slice(0, 3) + '-' + out.slice(3);
  }
  function parseSeedCode(code) {
    const c = String(code || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
    if (c.length !== 6) return null;
    let s = 0;
    for (let i = 5; i >= 0; i--) {
      const k = SEED_ALPHA.indexOf(c[i]);
      if (k < 0) return null;
      s = s * 32 + k;
    }
    return s >>> 0;
  }

  /* ---------------- numbers ---------------- */
  function fmt(n) {
    n = Math.floor(n);
    if (!isFinite(n)) return '∞';
    if (Math.abs(n) < 100000) return n.toLocaleString('en-US');
    const units = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx'];
    let u = 0;
    let v = n;
    while (Math.abs(v) >= 1000 && u < units.length - 1) {
      v /= 1000;
      u++;
    }
    if (Math.abs(v) >= 1000) return n.toExponential(2).replace('+', '');
    const digits = Math.abs(v) < 10 ? 2 : Math.abs(v) < 100 ? 1 : 0;
    return v.toFixed(digits).replace(/\.0+$/, '') + units[u];
  }
  // Mult can be fractional (×1.5 glyphs); show at most two decimals.
  function fmtMult(m) {
    if (m >= 100000) return fmt(m);
    if (Math.abs(m - Math.round(m)) < 0.005) return Math.round(m).toLocaleString('en-US');
    return (Math.round(m * 100) / 100).toString();
  }

  function todayKey(d) {
    d = d || new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }
  // Days since 2026-01-01, for "Daily #123".
  function dailyNumber(d) {
    d = d || new Date();
    const a = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    const b = Date.UTC(2026, 0, 1);
    return Math.floor((a - b) / 86400000) + 1;
  }

  function deepCopy(o) {
    return JSON.parse(JSON.stringify(o));
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  Object.assign(RM, {
    TAU, clamp, lerp, easeOut, easeIn, easeInOut, easeBack, approach,
    hashStr, Stream, newSeed, seedCode, parseSeedCode,
    fmt, fmtMult, todayKey, dailyNumber, deepCopy, escapeHtml,
  });
})(typeof window !== 'undefined' ? window : globalThis);
