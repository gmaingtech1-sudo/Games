/* Portal Hackers: Nexus — shared helpers: seeded randomness (so the same street corner
   always has the same portal), maths and formatting. */
window.PH = window.PH || {};
(function (PH) {
  'use strict';

  // 32-bit string hash (FNV-1a with an avalanche finish).
  function hash(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    h ^= h >>> 16; h = Math.imul(h, 2246822507);
    h ^= h >>> 13; h = Math.imul(h, 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  }

  // Seeded generator (mulberry32) → numbers in [0, 1).
  function rng(seed) {
    let a = typeof seed === 'number' ? seed >>> 0 : hash(String(seed));
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b, r) => a + Math.floor((r ? r() : Math.random()) * (b - a + 1));
  const pick = (arr, r) => arr[Math.floor((r ? r() : Math.random()) * arr.length)];

  // Pick from items by weight(item).
  function weighted(items, weight, r) {
    let total = 0;
    for (const it of items) total += weight(it);
    let x = (r ? r() : Math.random()) * total;
    for (const it of items) {
      x -= weight(it);
      if (x <= 0) return it;
    }
    return items[items.length - 1];
  }

  function fmtDist(m) {
    if (m < 1000) return `${Math.round(m)} m`;
    return `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
  }

  function fmtTime(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ${s % 60 ? (s % 60) + 's' : ''}`.trim();
    return `${Math.floor(m / 60)}h ${m % 60}m`;
  }

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const fmt = (n) => Math.round(n).toLocaleString('en-US');

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  PH.util = { hash, rng, clamp, lerp, rand, randInt, pick, weighted, fmtDist, fmtTime, esc, uid, fmt, TAU: Math.PI * 2 };
})(window.PH);
