/* Hyperdot — shared helpers: maths, seeded random numbers, the five axes,
   colour and storage. Loads before everything else and touches no DOM, so the
   level checker in tools/ can run it under Node too. */
(function (HD) {
  'use strict';

  const TAU = Math.PI * 2;
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const easeOut = (k) => 1 - Math.pow(1 - clamp(k, 0, 1), 3);
  const easeInOut = (k) => {
    k = clamp(k, 0, 1);
    return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  };
  const easeBack = (k) => {
    k = clamp(k, 0, 1);
    const c = 1.7;
    return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2);
  };

  // Seeded generator (mulberry32): numbers in [0, 1). The same seed always
  // builds the same puzzle.
  function seeded(seed) {
    let a = seed >>> 0;
    const next = function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    next.int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
    next.pick = (arr) => arr[Math.floor(next() * arr.length)];
    next.shuffle = (arr) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const t = arr[i];
        arr[i] = arr[j];
        arr[j] = t;
      }
      return arr;
    };
    return next;
  }

  /* ---------- The five axes ----------
     Every dimension adds one axis. Each axis keeps its colour everywhere: on
     the move buttons, the axis gizmo, the slice panels and the hypercube art.
     X, Y and Z follow the usual red / green / blue. W and V are the two you
     can't point at: moving along them takes you to another slice. */
  const AXES = [
    { name: 'X', color: '#FF5C70', minus: 'left', plus: 'right' },
    { name: 'Y', color: '#5EE07E', minus: 'back', plus: 'forward' },
    { name: 'Z', color: '#4FA3FF', minus: 'down', plus: 'up' },
    { name: 'W', color: '#C07CFF', minus: 'kata', plus: 'ana' },
    { name: 'V', color: '#FFB648', minus: 'V minus', plus: 'V plus' },
  ];

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

  function mix(a, b, k) {
    const A = hexToRgb(a);
    const B = hexToRgb(b);
    return toHex(lerp(A[0], B[0], k), lerp(A[1], B[1], k), lerp(A[2], B[2], k));
  }

  // k < 0 darkens towards black, k > 0 lightens towards white.
  const shade = (hex, k) => (k < 0 ? mix(hex, '#000000', -k) : mix(hex, '#ffffff', k));

  /* ---------- Storage ----------
     Inside the Android app (hyperdot-android), window.AndroidHost keeps the
     save in the app's own storage and drives the vibration motor. In a
     browser it's localStorage. */

  const native = typeof window !== 'undefined' && window.AndroidHost ? window.AndroidHost : null;

  const store = {
    read(key) {
      try {
        const raw = native ? native.load(key) : localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    },
    write(key, value) {
      try {
        const json = JSON.stringify(value);
        if (native) native.save(key, json);
        else localStorage.setItem(key, json);
      } catch (e) { /* storage may be blocked */ }
    },
    remove(key) {
      try {
        if (native) native.remove(key);
        else localStorage.removeItem(key);
      } catch (e) { /* ignore */ }
    },
  };

  HD.AXES = AXES;
  HD.store = store;
  HD.native = native;
  HD.util = { TAU, clamp, lerp, easeOut, easeInOut, easeBack, seeded, hexToRgb, rgba, mix, shade };
})(window.HD = window.HD || {});
