/* Starforge — shared helpers: maths, colour and glow sprites. */
(function (SF) {
  'use strict';

  const TAU = Math.PI * 2;
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const chance = (p) => Math.random() < p;
  const approach = (v, to, step) => (v < to ? Math.min(to, v + step) : Math.max(to, v - step));
  const easeOut = (k) => 1 - Math.pow(1 - clamp(k, 0, 1), 3);
  const easeInOut = (k) => {
    k = clamp(k, 0, 1);
    return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  };
  const dist2 = (ax, ay, bx, by) => {
    const dx = ax - bx;
    const dy = ay - by;
    return dx * dx + dy * dy;
  };
  const angleTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
  // Smallest signed difference between two angles.
  const angleDiff = (a, b) => {
    let d = (b - a) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    return d;
  };

  // Point on a cubic Bézier, one axis at a time.
  function cubic(a, b, c, d, k) {
    const u = 1 - k;
    return u * u * u * a + 3 * u * u * k * b + 3 * u * k * k * c + k * k * k * d;
  }

  // Distance from point (px, py) to the ray starting at (x, y) heading `ang`.
  function rayDist(px, py, x, y, ang, len) {
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);
    const t = clamp((px - x) * dx + (py - y) * dy, 0, len);
    return Math.hypot(px - (x + dx * t), py - (y + dy * t));
  }

  function fmt(n) {
    return Math.floor(n).toLocaleString('en-US');
  }

  // Seeded generator (mulberry32) → numbers in [0, 1), so rocks keep their shape.
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

  // Lighten (amt > 0) or darken (amt < 0) a hex colour. Returns hex.
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

  /* ---------- Sprites ---------- */

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    return c;
  }

  // Everything that shines (bullets, flames, explosions) is one of these sprites
  // drawn with the 'lighter' blend. That's far cheaper than canvas shadows on phones.
  const glowCache = new Map();
  function glow(color) {
    let c = glowCache.get(color);
    if (c) return c;
    c = canvas(64, 64);
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, rgba(color, 1));
    grad.addColorStop(0.2, rgba(color, 0.6));
    grad.addColorStop(0.5, rgba(color, 0.18));
    grad.addColorStop(1, rgba(color, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    glowCache.set(color, c);
    return c;
  }

  // An engine flame: brightest at the top, trailing off downwards.
  const flameCache = new Map();
  function flame(color) {
    let c = flameCache.get(color);
    if (c) return c;
    c = canvas(32, 96);
    const g = c.getContext('2d');
    g.scale(1, 3);
    const grad = g.createRadialGradient(16, 5, 0, 16, 5, 27);
    grad.addColorStop(0, rgba(color, 1));
    grad.addColorStop(0.18, rgba(color, 0.75));
    grad.addColorStop(0.55, rgba(color, 0.2));
    grad.addColorStop(1, rgba(color, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, 32, 32);
    flameCache.set(color, c);
    return c;
  }

  // An enemy bullet: white-hot centre, coloured rim and a soft halo.
  const orbCache = new Map();
  function orb(color) {
    let c = orbCache.get(color);
    if (c) return c;
    c = canvas(64, 64);
    const g = c.getContext('2d');
    const halo = g.createRadialGradient(32, 32, 8, 32, 32, 32);
    halo.addColorStop(0, rgba(color, 0.55));
    halo.addColorStop(1, rgba(color, 0));
    g.fillStyle = halo;
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = color;
    g.beginPath();
    g.arc(32, 32, 13, 0, TAU);
    g.fill();
    g.fillStyle = mix(color, '#ffffff', 0.8);
    g.beginPath();
    g.arc(32, 32, 8, 0, TAU);
    g.fill();
    orbCache.set(color, c);
    return c;
  }

  // A player bolt: a bright capsule pointing up.
  const boltCache = new Map();
  function bolt(color) {
    let c = boltCache.get(color);
    if (c) return c;
    c = canvas(32, 96);
    const g = c.getContext('2d');
    g.save();
    g.scale(1, 3);
    const halo = g.createRadialGradient(16, 16, 2, 16, 16, 16);
    halo.addColorStop(0, rgba(color, 0.7));
    halo.addColorStop(1, rgba(color, 0));
    g.fillStyle = halo;
    g.fillRect(0, 0, 32, 32);
    g.restore();
    g.fillStyle = mix(color, '#ffffff', 0.35);
    roundRect(g, 11, 14, 10, 68, 5);
    g.fill();
    g.fillStyle = '#ffffff';
    roundRect(g, 13.5, 20, 5, 56, 2.5);
    g.fill();
    boltCache.set(color, c);
    return c;
  }

  function roundRect(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  SF.util = {
    TAU, clamp, lerp, rand, randInt, pick, chance, approach, easeOut, easeInOut,
    dist2, angleTo, angleDiff, cubic, rayDist, fmt, seeded,
    hexToRgb, rgba, shade, mix, canvas, roundRect,
    glow, flame, orb, bolt,
  };
})(window.SF = window.SF || {});
