// Small, dependency-free helpers shared by game logic and UI.

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Finite number or fallback. Used everywhere external data is read. */
export function num(v, fallback = 0) {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function int(v, fallback = 0, lo = -Infinity, hi = Infinity) {
  return clamp(Math.round(num(v, fallback)), lo, hi);
}

/** Seedable PRNG (mulberry32) so combat and loot can be tested deterministically. */
export function makeRng(seed = (Math.random() * 2 ** 32) >>> 0) {
  let a = seed >>> 0;
  const rng = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.int = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
  rng.chance = (p) => rng() < p;
  rng.pick = (arr) => arr[Math.floor(rng() * arr.length)];
  rng.weighted = (entries) => {
    // entries: [{ w, ... }]
    const total = entries.reduce((s, e) => s + Math.max(0, e.w), 0);
    if (total <= 0) return entries[0];
    let r = rng() * total;
    for (const e of entries) {
      r -= Math.max(0, e.w);
      if (r < 0) return e;
    }
    return entries[entries.length - 1];
  };
  return rng;
}

export const defaultRng = makeRng();

let uidCounter = 0;
export function uid(prefix = 'i') {
  uidCounter = (uidCounter + 1) % 1e6;
  return `${prefix}${Date.now().toString(36)}${uidCounter.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function deepClone(o) {
  return JSON.parse(JSON.stringify(o));
}

export function fmt(n) {
  n = Math.floor(num(n));
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1e4) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}

export function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Tiny pub/sub used to decouple game logic from the UI (toasts, sounds, level-ups). */
export function createEmitter() {
  const map = new Map();
  return {
    on(evt, fn) {
      if (!map.has(evt)) map.set(evt, new Set());
      map.get(evt).add(fn);
      return () => map.get(evt).delete(fn);
    },
    emit(evt, payload) {
      for (const fn of map.get(evt) || []) {
        try { fn(payload); } catch (e) { console.error('listener error', evt, e); }
      }
    },
  };
}
