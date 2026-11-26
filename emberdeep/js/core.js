/* Emberdeep — shared helpers: maths, colour, number formatting, a tiny event
   bus and storage. Loaded first; everything else hangs off window.ED. */
(function (ED) {
  'use strict';

  const TAU = Math.PI * 2;
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const chance = (p) => Math.random() < p;
  const easeOut = (k) => 1 - Math.pow(1 - clamp(k, 0, 1), 3);
  const easeInOut = (k) => {
    k = clamp(k, 0, 1);
    return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  };
  // Biggest number the economy is allowed to reach. Doubles go to ~1.8e308;
  // stopping well short keeps every product of two values finite.
  const CAP = 1e295;
  const safe = (v) => (v > CAP ? CAP : v);

  // Seeded generator (mulberry32) → numbers in [0, 1), so a cave keeps its shape.
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

  /* ---------- Numbers ---------- */

  // K, M, B, T, then the classic short-scale names, then aa, ab, ac… for
  // everything past a decillion.
  const NAMED = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
  const ABC = 'abcdefghijklmnopqrstuvwxyz';
  function suffix(i) {
    if (i < NAMED.length) return NAMED[i];
    const j = i - NAMED.length;
    return ABC[Math.floor(j / 26) % 26] + ABC[j % 26];
  }

  let notation = 'letters';
  function setNotation(n) { notation = n === 'sci' ? 'sci' : 'letters'; }

  // A compact number: 999, 1.23K, 45.6M, 7.89aa… or 1.23e45 in scientific.
  function fmt(n) {
    if (!isFinite(n)) return '∞';
    if (n < 0) return '-' + fmt(-n);
    if (n < 1000) {
      if (n >= 100 || Number.isInteger(n)) return String(Math.floor(n));
      return n >= 10 ? n.toFixed(1).replace(/\.0$/, '') : n.toFixed(2).replace(/\.?0+$/, '');
    }
    const e = Math.floor(Math.log10(n) + 1e-9);
    if (notation === 'sci' && e >= 6) {
      const m = n / Math.pow(10, e);
      return (m >= 9.995 ? '1.00' : m.toFixed(2)) + 'e' + (m >= 9.995 ? e + 1 : e);
    }
    let i = Math.floor(e / 3);
    let m = Number((n / Math.pow(10, i * 3)).toPrecision(3));
    if (m >= 1000) { m /= 1000; i += 1; }
    const s = m >= 100 ? m.toFixed(0) : m >= 10 ? m.toFixed(1) : m.toFixed(2);
    return s + suffix(i);
  }

  // A whole number with thousands separators, for counts like kills.
  function count(n) {
    if (n >= 1e9) return fmt(n);
    return Math.floor(n).toLocaleString('en-US');
  }

  // 3h 12m, 4m 05s, 37s
  function duration(sec) {
    sec = Math.max(0, Math.floor(sec));
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (d) return `${d}d ${h}h`;
    if (h) return `${h}h ${String(m).padStart(2, '0')}m`;
    if (m) return `${m}m ${String(s).padStart(2, '0')}s`;
    return `${s}s`;
  }

  // Short clock for cooldowns: 4:05, 1:02:10
  function clock(sec) {
    sec = Math.max(0, Math.ceil(sec));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
  }

  // Local calendar day as YYYY-MM-DD, for daily rewards.
  function dayKey(t) {
    const d = new Date(t);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /* ---------- Colour ---------- */

  const rgbCache = new Map();
  function hexToRgb(hex) {
    let v = rgbCache.get(hex);
    if (v) return v;
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    rgbCache.set(hex, v);
    return v;
  }
  const toHex = (r, g, b) => '#' + [r, g, b].map((c) => clamp(Math.round(c), 0, 255).toString(16).padStart(2, '0')).join('');
  function rgba(hex, a) {
    const [r, g, b] = hexToRgb(hex);
    return `rgba(${r},${g},${b},${a})`;
  }
  // Lighten (amt > 0) or darken (amt < 0).
  function shade(hex, amt) {
    const [r, g, b] = hexToRgb(hex);
    const t = amt < 0 ? 0 : 255;
    const k = Math.abs(amt);
    return toHex(r + (t - r) * k, g + (t - g) * k, b + (t - b) * k);
  }
  function mix(a, b, k) {
    const x = hexToRgb(a);
    const y = hexToRgb(b);
    return toHex(lerp(x[0], y[0], k), lerp(x[1], y[1], k), lerp(x[2], y[2], k));
  }

  /* ---------- Events ---------- */

  const handlers = {};
  ED.bus = {
    on(name, fn) { (handlers[name] = handlers[name] || []).push(fn); },
    emit(name, a, b) {
      const list = handlers[name];
      if (!list) return;
      for (const fn of list) {
        try { fn(a, b); } catch (e) { console.error(e); }
      }
    },
  };

  /* ---------- Storage ---------- */

  ED.store = {
    read(key) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    },
    write(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
    },
    remove(key) {
      try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
    },
  };

  ED.util = {
    TAU, clamp, lerp, rand, randInt, pick, chance, easeOut, easeInOut, safe, CAP,
    seeded, fmt, count, duration, clock, dayKey, setNotation,
    hexToRgb, rgba, shade, mix,
  };
})(typeof window !== 'undefined' ? (window.ED = window.ED || {}) : (globalThis.ED = globalThis.ED || {}));
