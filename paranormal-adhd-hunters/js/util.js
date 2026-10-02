/* ParanormalADHDhunters — small shared helpers. */
import { host } from './host.js';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);
export const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));
export const TAU = Math.PI * 2;

export function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

/** Deterministic random numbers (mulberry32). */
export function rng(seed) {
  let s = seed >>> 0;
  const r = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (a, b) => a + (b - a) * r();
  r.int = (a, b) => Math.floor(a + (b - a + 1) * r());
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.chance = (p) => r() < p;
  r.shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  return r;
}

export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const R = rng((Date.now() ^ (Math.random() * 1e9)) >>> 0);

/** Pick a key from {key: weight}. */
export function weighted(weights, r = Math.random) {
  let total = 0;
  for (const k in weights) total += Math.max(0, weights[k]);
  if (total <= 0) return null;
  let x = r() * total;
  for (const k in weights) {
    x -= Math.max(0, weights[k]);
    if (x <= 0) return k;
  }
  return null;
}

export function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const nextFrame = () => new Promise((res) => requestAnimationFrame(() => res()));
export const wait = (ms) => new Promise((res) => setTimeout(res, ms));

/** Tiny DOM builder: h('div.card#id', {onclick}, [children]). */
export function h(spec, attrs, children) {
  if (Array.isArray(attrs) || typeof attrs === 'string') { children = attrs; attrs = null; }
  const m = /^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i.exec(spec) || [];
  const node = document.createElement(m[1] || 'div');
  (m[2] || '').replace(/([.#])([\w-]+)/g, (_, p, n) => {
    if (p === '.') node.classList.add(n); else node.id = n;
    return '';
  });
  if (attrs) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else if (k === 'html') node.innerHTML = v;
      else if (k === 'text') node.textContent = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else node.setAttribute(k, v === true ? '' : v);
    }
  }
  if (children != null) {
    for (const c of [].concat(children)) {
      if (c == null || c === false) continue;
      node.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
  }
  return node;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Minimal event emitter. */
export class Emitter {
  constructor() { this._l = {}; }
  on(type, fn) { (this._l[type] || (this._l[type] = [])).push(fn); return () => this.off(type, fn); }
  off(type, fn) { const a = this._l[type]; if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } }
  emit(type, ...args) {
    const a = this._l[type];
    if (!a) return;
    for (const fn of a.slice()) {
      try { fn(...args); } catch (e) { console.error(e); }
    }
  }
}

/** Closest point on segment ab to p in 2D, returns {x, z, t}. */
export function closestOnSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const len2 = dx * dx + dz * dz || 1e-9;
  let t = ((px - ax) * dx + (pz - az) * dz) / len2;
  t = clamp(t, 0, 1);
  return { x: ax + dx * t, z: az + dz * t, t };
}

/** Do 2D segments p1p2 and p3p4 intersect? */
export function segsCross(x1, z1, x2, z2, x3, z3, x4, z4) {
  const d = (x2 - x1) * (z4 - z3) - (z2 - z1) * (x4 - x3);
  if (Math.abs(d) < 1e-9) return false;
  const u = ((x3 - x1) * (z4 - z3) - (z3 - z1) * (x4 - x3)) / d;
  const v = ((x3 - x1) * (z2 - z1) - (z3 - z1) * (x2 - x1)) / d;
  return u > 0.0001 && u < 0.9999 && v >= 0 && v <= 1;
}

export function vibrate(ms) {
  host.vibrate(ms);
}
