/* ParanormalADHDhunters — every surface is painted in code on a canvas:
   wallpapers, floors, books, paintings, the clue documents and the van. */
import * as THREE from 'three';
import { rng } from './util.js';

let SIZE = 256;
let ANISO = 4;
const cache = new Map();

export function setTextureQuality(q, renderer) {
  SIZE = q === 'high' ? 512 : 256;
  ANISO = renderer ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 4;
}

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function toTex(c, { repeat = true, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = ANISO;
  t.needsUpdate = true;
  return t;
}

function cached(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

/* ---------- painting helpers ---------- */

function noise(ctx, w, h, r, amount, dark = true) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * amount;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  if (!dark) return;
}

function stains(ctx, w, h, r, count, color = '60,40,20', max = 0.22) {
  for (let i = 0; i < count; i++) {
    const x = r() * w, y = r() * h, rad = (0.05 + r() * 0.25) * w;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    const a = r() * max;
    g.addColorStop(0, `rgba(${color},${a})`);
    g.addColorStop(0.7, `rgba(${color},${a * 0.4})`);
    g.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
}

function drips(ctx, w, h, r, count, color = '50,35,20') {
  for (let i = 0; i < count; i++) {
    const x = r() * w;
    const len = (0.2 + r() * 0.6) * h;
    const g = ctx.createLinearGradient(0, 0, 0, len);
    g.addColorStop(0, `rgba(${color},${0.18 + r() * 0.15})`);
    g.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, 1 + r() * 3, len);
  }
}

function cracks(ctx, w, h, r, count, color = 'rgba(20,15,10,0.35)') {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  for (let i = 0; i < count; i++) {
    let x = r() * w, y = r() * h;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const n = 6 + r() * 14;
    for (let j = 0; j < n; j++) {
      x += (r() - 0.5) * w * 0.08;
      y += (r() - 0.3) * h * 0.06;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

function age(ctx, w, h, r, level = 1) {
  stains(ctx, w, h, r, Math.round(8 * level));
  drips(ctx, w, h, r, Math.round(6 * level));
  noise(ctx, w, h, r, 18 * level);
}

/* ---------- wallpapers ---------- */

function damask(base, ink, seed) {
  const s = SIZE, c = canvas(s), x = c.getContext('2d'), r = rng(seed);
  x.fillStyle = base; x.fillRect(0, 0, s, s);
  x.fillStyle = ink;
  const motif = (cx, cy, sc) => {
    x.save(); x.translate(cx, cy); x.scale(sc, sc);
    x.beginPath();
    x.moveTo(0, -40);
    x.bezierCurveTo(22, -30, 26, -6, 8, 6);
    x.bezierCurveTo(26, 14, 20, 36, 0, 44);
    x.bezierCurveTo(-20, 36, -26, 14, -8, 6);
    x.bezierCurveTo(-26, -6, -22, -30, 0, -40);
    x.fill();
    x.beginPath(); x.arc(0, -52, 6, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.arc(0, 56, 5, 0, Math.PI * 2); x.fill();
    x.restore();
  };
  const k = s / 256;
  motif(s * 0.25, s * 0.25, 0.9 * k); motif(s * 0.75, s * 0.75, 0.9 * k);
  motif(s * 0.75, s * -0.25, 0.9 * k); motif(s * 0.25, s * 1.25, 0.9 * k);
  motif(s * -0.25, s * 0.75, 0.9 * k); motif(s * 1.25, s * 0.25, 0.9 * k);
  age(x, s, s, r, 1.2);
  return c;
}

function stripes(c1, c2, seed, n = 8) {
  const s = SIZE, c = canvas(s), x = c.getContext('2d'), r = rng(seed);
  for (let i = 0; i < n; i++) {
    x.fillStyle = i % 2 ? c2 : c1;
    x.fillRect((i * s) / n, 0, s / n + 1, s);
  }
  x.fillStyle = 'rgba(255,255,255,0.05)';
  for (let i = 0; i < n; i += 2) x.fillRect((i * s) / n + s / n / 2 - 1, 0, 2, s);
  age(x, s, s, r, 1.3);
  return c;
}

function floral(base, petal, leaf, seed) {
  const s = SIZE, c = canvas(s), x = c.getContext('2d'), r = rng(seed);
  x.fillStyle = base; x.fillRect(0, 0, s, s);
  const k = s / 256;
  const flower = (cx, cy) => {
    x.fillStyle = leaf;
    x.beginPath(); x.ellipse(cx + 8 * k, cy + 8 * k, 6 * k, 3 * k, 0.6, 0, Math.PI * 2); x.fill();
    x.fillStyle = petal;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      x.beginPath(); x.arc(cx + Math.cos(a) * 5 * k, cy + Math.sin(a) * 5 * k, 4 * k, 0, Math.PI * 2); x.fill();
    }
    x.fillStyle = 'rgba(255,240,200,0.8)';
    x.beginPath(); x.arc(cx, cy, 2.4 * k, 0, Math.PI * 2); x.fill();
  };
  for (let gy = 0; gy < 4; gy++) for (let gx = 0; gx < 4; gx++) {
    flower((gx + (gy % 2) * 0.5 + 0.25) * s / 4, (gy + 0.5) * s / 4);
  }
  age(x, s, s, r, 1.1);
  return c;
}

function plaster(base, seed, lvl = 1.4) {
  const s = SIZE, c = canvas(s), x = c.getContext('2d'), r = rng(seed);
  x.fillStyle = base; x.fillRect(0, 0, s, s);
  stains(x, s, s, r, 14, '40,30,25', 0.2);
  cracks(x, s, s, r, 4);
  noise(x, s, s, r, 22 * lvl);
  return c;
}

function tiles(base, grout, seed, n = 8, lower = false) {
  const s = SIZE, c = canvas(s), x = c.getContext('2d'), r = rng(seed);
  x.fillStyle = grout; x.fillRect(0, 0, s, s);
  const t = s / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const v = (r() - 0.5) * 18;
    x.fillStyle = shade(base, v);
    x.fillRect(i * t + 1, j * t + 1, t - 2, t - 2);
  }
  if (lower) {
    x.fillStyle = 'rgba(30,60,70,0.5)';
    x.fillRect(0, s * 0.48, s, s * 0.04);
  }
  stains(x, s, s, r, 10, '50,45,20', 0.25);
  cracks(x, s, s, r, 2);
  noise(x, s, s, r, 14);
  return c;
}

function bricks(seed) {
  const s = SIZE, c = canvas(s), x = c.getContext('2d'), r = rng(seed);
  x.fillStyle = '#2c2522'; x.fillRect(0, 0, s, s);
  const rows = 8, bh = s / rows, bw = s / 4;
  for (let j = 0; j < rows; j++) {
    const off = (j % 2) * bw / 2;
    for (let i = -1; i < 5; i++) {
      const v = (r() - 0.5) * 30;
      x.fillStyle = shade('#6a3d30', v);
      x.fillRect(i * bw + off + 2, j * bh + 2, bw - 4, bh - 4);
    }
  }
  stains(x, s, s, r, 12, '10,20,10', 0.3);
  noise(x, s, s, r, 26);
  return c;
}

function woodPanel(seed) {
  const s = SIZE, c = canvas(s), x = c.getContext('2d'), r = rng(seed);
  const n = 4;
  for (let i = 0; i < n; i++) {
    x.fillStyle = shade('#3e2717', (r() - 0.5) * 16);
    x.fillRect((i * s) / n, 0, s / n, s);
    x.strokeStyle = 'rgba(0,0,0,0.5)';
    x.strokeRect((i * s) / n + 6, s * 0.08, s / n - 12, s * 0.84);
    grain(x, (i * s) / n, 0, s / n, s, r, 'rgba(20,10,5,0.25)');
  }
  age(x, s, s, r, 0.8);
  return c;
}

/* ---------- floors ---------- */

function grain(x, ox, oy, w, h, r, col, vertical = true) {
  x.strokeStyle = col;
  x.lineWidth = 1;
  for (let i = 0; i < (vertical ? w : h) / 3; i++) {
    x.beginPath();
    if (vertical) {
      const gx = ox + r() * w;
      x.moveTo(gx, oy);
      for (let y = 0; y <= h; y += h / 6) x.lineTo(gx + Math.sin(y * 0.05 + i) * 2, oy + y);
    } else {
      const gy = oy + r() * h;
      x.moveTo(ox, gy);
      for (let xx = 0; xx <= w; xx += w / 6) x.lineTo(ox + xx, gy + Math.sin(xx * 0.05 + i) * 2);
    }
    x.stroke();
  }
}

function planks(base, seed, n = 6) {
  const s = SIZE, c = canvas(s), x = c.getContext('2d'), r = rng(seed);
  const pw = s / n;
  for (let i = 0; i < n; i++) {
    let y = -r() * s;
    while (y < s) {
      const len = s * (0.4 + r() * 0.6);
      x.fillStyle = shade(base, (r() - 0.5) * 28);
      x.fillRect(i * pw, y, pw, len);
      grain(x, i * pw, y, pw, len, r, 'rgba(0,0,0,0.18)');
      x.fillStyle = 'rgba(0,0,0,0.55)';
      x.fillRect(i * pw, y, pw, 2);
      y += len;
    }
    x.fillStyle = 'rgba(0,0,0,0.6)';
    x.fillRect(i * pw, 0, 2, s);
  }
  stains(x, s, s, r, 8, '20,12,6', 0.3);
  noise(x, s, s, r, 14);
  return c;
}

function checker(c1, c2, seed, n = 8) {
  const s = SIZE, c = canvas(s), x = c.getContext('2d'), r = rng(seed);
  const t = s / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    x.fillStyle = shade((i + j) % 2 ? c1 : c2, (r() - 0.5) * 14);
    x.fillRect(i * t, j * t, t, t);
  }
  stains(x, s, s, r, 12, '40,30,10', 0.3);
  cracks(x, s, s, r, 3);
  noise(x, s, s, r, 16);
  return c;
}

function carpet(base, border, seed) {
  const s = SIZE, c = canvas(s), x = c.getContext('2d'), r = rng(seed);
  x.fillStyle = base; x.fillRect(0, 0, s, s);
  x.strokeStyle = border; x.lineWidth = s / 64;
  for (let i = 0; i < 4; i++) {
    x.beginPath();
    const o = (i * s) / 4 + s / 8;
    x.moveTo(o, 0); x.lineTo(o + s / 8, s / 8); x.lineTo(o, s / 4);
    x.stroke();
  }
  noise(x, s, s, r, 30);
  stains(x, s, s, r, 10, '20,10,10', 0.3);
  return c;
}

function concrete(seed, base = '#55585a') {
  const s = SIZE, c = canvas(s), x = c.getContext('2d'), r = rng(seed);
  x.fillStyle = base; x.fillRect(0, 0, s, s);
  stains(x, s, s, r, 18, '20,20,15', 0.3);
  cracks(x, s, s, r, 5, 'rgba(10,10,10,0.5)');
  noise(x, s, s, r, 34);
  return c;
}

/* ---------- exterior ---------- */

function siding(seed) {
  const s = SIZE, c = canvas(s), x = c.getContext('2d'), r = rng(seed);
  const n = 10, bh = s / n;
  for (let i = 0; i < n; i++) {
    const g = x.createLinearGradient(0, i * bh, 0, (i + 1) * bh);
    const b = shade('#5d6470', (r() - 0.5) * 14);
    g.addColorStop(0, shade(b, 18)); g.addColorStop(1, shade(b, -22));
    x.fillStyle = g; x.fillRect(0, i * bh, s, bh);
    x.fillStyle = 'rgba(0,0,0,0.5)'; x.fillRect(0, (i + 1) * bh - 2, s, 2);
  }
  drips(x, s, s, r, 14, '20,25,20');
  stains(x, s, s, r, 10, '30,40,25', 0.3);
  noise(x, s, s, r, 20);
  return c;
}

function shingles(seed) {
  const s = SIZE, c = canvas(s), x = c.getContext('2d'), r = rng(seed);
  x.fillStyle = '#1c1d24'; x.fillRect(0, 0, s, s);
  const rows = 8, h = s / rows, w = s / 6;
  for (let j = 0; j < rows; j++) for (let i = -1; i < 7; i++) {
    x.fillStyle = shade('#2f303b', (r() - 0.5) * 24);
    x.fillRect(i * w + (j % 2) * w / 2 + 1, j * h + 1, w - 2, h - 2);
  }
  stains(x, s, s, r, 10, '40,50,30', 0.3);
  noise(x, s, s, r, 20);
  return c;
}

function grass(seed) {
  const s = SIZE, c = canvas(s), x = c.getContext('2d'), r = rng(seed);
  x.fillStyle = '#1d2a1c'; x.fillRect(0, 0, s, s);
  for (let i = 0; i < s * 6; i++) {
    x.fillStyle = `rgba(${40 + r() * 40},${60 + r() * 50},${30 + r() * 30},${0.4 + r() * 0.4})`;
    const gx = r() * s, gy = r() * s;
    x.fillRect(gx, gy, 1, 2 + r() * 4);
  }
  stains(x, s, s, r, 14, '25,20,10', 0.45);
  return c;
}

function pathStones(seed) {
  const s = SIZE, c = canvas(s), x = c.getContext('2d'), r = rng(seed);
  x.fillStyle = '#1e1f1c'; x.fillRect(0, 0, s, s);
  for (let i = 0; i < 18; i++) {
    x.fillStyle = shade('#5b5a55', (r() - 0.5) * 30);
    x.beginPath();
    x.ellipse(r() * s, r() * s, s * (0.08 + r() * 0.08), s * (0.06 + r() * 0.06), r() * 3, 0, Math.PI * 2);
    x.fill();
  }
  noise(x, s, s, r, 24);
  return c;
}

function asphalt(seed) {
  const s = SIZE, c = canvas(s), x = c.getContext('2d'), r = rng(seed);
  x.fillStyle = '#202226'; x.fillRect(0, 0, s, s);
  noise(x, s, s, r, 40);
  stains(x, s, s, r, 10, '5,5,5', 0.4);
  cracks(x, s, s, r, 3, 'rgba(0,0,0,0.6)');
  return c;
}

/* ---------- props ---------- */

function woodFurniture(base, seed) {
  const s = 128, c = canvas(s), x = c.getContext('2d'), r = rng(seed);
  x.fillStyle = base; x.fillRect(0, 0, s, s);
  grain(x, 0, 0, s, s, r, 'rgba(0,0,0,0.22)', false);
  noise(x, s, s, r, 14);
  return c;
}

function fabric(base, seed, lvl = 1) {
  const s = 128, c = canvas(s), x = c.getContext('2d'), r = rng(seed);
  x.fillStyle = base; x.fillRect(0, 0, s, s);
  x.strokeStyle = 'rgba(0,0,0,0.08)';
  for (let i = 0; i < s; i += 3) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, s); x.stroke(); }
  stains(x, s, s, r, 6 * lvl, '50,40,30', 0.25);
  noise(x, s, s, r, 16);
  return c;
}

function sheet(seed) {
  const s = 128, c = canvas(s), x = c.getContext('2d'), r = rng(seed);
  const g = x.createLinearGradient(0, 0, s, 0);
  for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, i % 2 ? '#b9b6ad' : '#d6d2c6');
  x.fillStyle = g; x.fillRect(0, 0, s, s);
  stains(x, s, s, r, 10, '70,60,40', 0.3);
  noise(x, s, s, r, 14);
  return c;
}

function books(seed) {
  const s = SIZE, c = canvas(s), x = c.getContext('2d'), r = rng(seed);
  x.fillStyle = '#120c08'; x.fillRect(0, 0, s, s);
  const shelves = 4, sh = s / shelves;
  const cols = ['#5a1e1e', '#1e3a5a', '#2a4a2a', '#5a4a1e', '#3a1e4a', '#4a3a2a', '#6a5a4a', '#222'];
  for (let j = 0; j < shelves; j++) {
    let bx = 2;
    while (bx < s - 4) {
      const bw = s * (0.03 + r() * 0.04);
      const bh = sh * (0.6 + r() * 0.35);
      if (r() < 0.08) { bx += bw; continue; }
      x.fillStyle = shade(cols[Math.floor(r() * cols.length)], (r() - 0.5) * 20);
      x.fillRect(bx, j * sh + sh - bh - 4, bw - 1, bh);
      x.fillStyle = 'rgba(220,190,120,0.35)';
      x.fillRect(bx + 1, j * sh + sh - bh + 4, bw - 3, 2);
      bx += bw;
    }
    x.fillStyle = '#2b1a10'; x.fillRect(0, j * sh + sh - 4, s, 4);
  }
  noise(x, s, s, r, 12);
  return c;
}

function portrait(seed, kind = 0) {
  const w = 128, hgt = 160, c = canvas(w, hgt), x = c.getContext('2d'), r = rng(seed);
  const g = x.createRadialGradient(w / 2, hgt * 0.4, 5, w / 2, hgt * 0.5, w);
  g.addColorStop(0, kind ? '#3b4a3a' : '#4a3b2a'); g.addColorStop(1, '#0b0806');
  x.fillStyle = g; x.fillRect(0, 0, w, hgt);
  if (kind === 2) {
    // a moonlit house
    x.fillStyle = '#d8d4c0'; x.beginPath(); x.arc(w * 0.75, hgt * 0.22, 10, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#0d0b0a';
    x.fillRect(w * 0.2, hgt * 0.5, w * 0.6, hgt * 0.4);
    x.beginPath(); x.moveTo(w * 0.15, hgt * 0.5); x.lineTo(w * 0.5, hgt * 0.3); x.lineTo(w * 0.85, hgt * 0.5); x.fill();
    x.fillStyle = '#c9a85a'; x.fillRect(w * 0.6, hgt * 0.58, 8, 10);
  } else {
    // a sombre figure whose eyes are a little too bright
    x.fillStyle = '#1a120c';
    x.beginPath(); x.ellipse(w / 2, hgt * 0.85, w * 0.36, hgt * 0.3, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#b89a7a';
    x.beginPath(); x.ellipse(w / 2, hgt * 0.42, w * 0.17, hgt * 0.15, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = kind ? '#2a2a2a' : '#3a2416';
    x.beginPath(); x.ellipse(w / 2, hgt * 0.33, w * 0.2, hgt * 0.1, 0, Math.PI, Math.PI * 2); x.fill();
    x.fillStyle = '#e8f1ff';
    x.fillRect(w * 0.43, hgt * 0.41, 4, 2); x.fillRect(w * 0.54, hgt * 0.41, 4, 2);
  }
  stains(x, w, hgt, r, 6, '20,15,5', 0.4);
  noise(x, w, hgt, r, 18);
  return c;
}

function cobweb(seed) {
  const s = 128, c = canvas(s), x = c.getContext('2d'), r = rng(seed);
  x.strokeStyle = 'rgba(230,235,245,0.55)';
  x.lineWidth = 1;
  const spokes = 7;
  for (let i = 0; i <= spokes; i++) {
    const a = (i / spokes) * (Math.PI / 2);
    x.beginPath(); x.moveTo(0, 0); x.lineTo(Math.cos(a) * s, Math.sin(a) * s); x.stroke();
  }
  for (let k = 1; k < 9; k++) {
    const rad = k * s / 9 + r() * 4;
    x.beginPath();
    for (let i = 0; i <= spokes; i++) {
      const a = (i / spokes) * (Math.PI / 2);
      const rr = rad * (0.92 + r() * 0.1);
      if (i === 0) x.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else x.quadraticCurveTo(Math.cos(a - 0.1) * rr * 0.9, Math.sin(a - 0.1) * rr * 0.9, Math.cos(a) * rr, Math.sin(a) * rr);
    }
    x.stroke();
  }
  return c;
}

function fogPuff(seed) {
  const s = 256, c = canvas(s), x = c.getContext('2d'), r = rng(seed);
  for (let i = 0; i < 26; i++) {
    const px = s * (0.2 + r() * 0.6), py = s * (0.3 + r() * 0.4), rad = s * (0.1 + r() * 0.2);
    const g = x.createRadialGradient(px, py, 0, px, py, rad);
    g.addColorStop(0, 'rgba(200,210,255,0.12)');
    g.addColorStop(1, 'rgba(200,210,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, s, s);
  }
  return c;
}

export function glowCanvas(color = '255,255,255', s = 128) {
  const c = canvas(s), x = c.getContext('2d');
  const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, `rgba(${color},1)`);
  g.addColorStop(0.25, `rgba(${color},0.45)`);
  g.addColorStop(1, `rgba(${color},0)`);
  x.fillStyle = g; x.fillRect(0, 0, s, s);
  return c;
}

/** The lantern mark: a circle with an eye and eight rays. */
export function drawSigil(x, cx, cy, rad, color, width) {
  x.save();
  x.strokeStyle = color; x.fillStyle = color; x.lineWidth = width; x.lineCap = 'round';
  x.beginPath(); x.arc(cx, cy, rad, 0, Math.PI * 2); x.stroke();
  x.beginPath();
  x.moveTo(cx - rad * 0.62, cy);
  x.quadraticCurveTo(cx, cy - rad * 0.55, cx + rad * 0.62, cy);
  x.quadraticCurveTo(cx, cy + rad * 0.55, cx - rad * 0.62, cy);
  x.stroke();
  x.beginPath(); x.arc(cx, cy, rad * 0.16, 0, Math.PI * 2); x.fill();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    x.beginPath();
    x.moveTo(cx + Math.cos(a) * rad * 1.18, cy + Math.sin(a) * rad * 1.18);
    x.lineTo(cx + Math.cos(a) * rad * 1.48, cy + Math.sin(a) * rad * 1.48);
    x.stroke();
  }
  x.restore();
}

function sigilTex() {
  const s = 512, c = canvas(s), x = c.getContext('2d');
  x.shadowColor = 'rgba(170,120,255,1)'; x.shadowBlur = 18;
  drawSigil(x, s / 2, s / 2, s * 0.3, 'rgba(210,190,255,0.95)', 10);
  return c;
}

function paper(seed, kind) {
  const w = 256, hgt = 320, c = canvas(w, hgt), x = c.getContext('2d'), r = rng(seed);
  x.fillStyle = kind === 'map' ? '#cdb98d' : '#e6dcc0'; x.fillRect(0, 0, w, hgt);
  stains(x, w, hgt, r, 10, '120,90,40', 0.3);
  if (kind === 'drawing') {
    x.lineWidth = 3; x.strokeStyle = '#3a6ac8';
    x.strokeRect(60, 90, 130, 100);
    x.beginPath(); x.moveTo(50, 92); x.lineTo(125, 40); x.lineTo(200, 92); x.stroke();
    x.fillStyle = '#e8a33a'; x.fillRect(80, 110, 22, 22); x.fillRect(150, 110, 22, 22);
    const kid = (px, ph, col) => {
      x.strokeStyle = col; x.beginPath(); x.arc(px, 230 - ph, 7, 0, Math.PI * 2); x.stroke();
      x.beginPath(); x.moveTo(px, 237 - ph); x.lineTo(px, 262); x.moveTo(px - 8, 248 - ph * 0.5); x.lineTo(px + 8, 248 - ph * 0.5); x.stroke();
    };
    kid(70, 12, '#c83a3a'); kid(95, 12, '#3a8a3a'); kid(120, 0, '#c83ab0'); kid(140, -6, '#c8a03a');
    x.strokeStyle = '#555'; x.beginPath(); x.moveTo(20, 270); x.lineTo(236, 270); x.stroke();
    x.strokeStyle = '#2a2a2a'; x.beginPath(); x.arc(190, 292, 6, 0, Math.PI * 2); x.moveTo(190, 298); x.lineTo(190, 316); x.stroke();
    x.fillStyle = '#e8c33a'; x.fillRect(198, 296, 8, 10);
    drawSigil(x, 200, 40, 18, '#7a3ac8', 3);
  } else if (kind === 'map') {
    x.strokeStyle = 'rgba(80,60,30,0.4)'; x.lineWidth = 1;
    for (let i = 0; i < 12; i++) { x.beginPath(); x.moveTo(0, r() * hgt); x.bezierCurveTo(w * 0.3, r() * hgt, w * 0.6, r() * hgt, w, r() * hgt); x.stroke(); }
    const pts = [[0.5, 0.14], [0.8, 0.28], [0.88, 0.58], [0.7, 0.84], [0.3, 0.84], [0.12, 0.58], [0.2, 0.28], [0.5, 0.5]];
    x.strokeStyle = '#6a2a1a'; x.lineWidth = 2;
    x.beginPath();
    for (let i = 0; i < 7; i++) { const p = pts[i]; if (i) x.lineTo(p[0] * w, p[1] * hgt); else x.moveTo(p[0] * w, p[1] * hgt); }
    x.closePath(); x.stroke();
    for (let i = 0; i < 7; i++) { x.beginPath(); x.moveTo(pts[i][0] * w, pts[i][1] * hgt); x.lineTo(pts[7][0] * w, pts[7][1] * hgt); x.stroke(); }
    pts.forEach((p) => { x.beginPath(); x.arc(p[0] * w, p[1] * hgt, 7, 0, Math.PI * 2); x.stroke(); });
    x.fillStyle = '#6a2a1a'; x.font = 'italic 14px serif'; x.fillText('1887', w * 0.72, hgt * 0.97);
  } else {
    x.fillStyle = 'rgba(40,30,60,0.75)';
    for (let i = 0; i < 16; i++) {
      let lx = 24;
      const ly = 40 + i * 16;
      while (lx < w - 30) { const ww = 10 + r() * 30; x.fillRect(lx, ly, ww, 2); lx += ww + 6; }
    }
  }
  noise(x, w, hgt, r, 10);
  return c;
}

/* ---------- colour helper ---------- */

export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

/* ---------- public catalogue ---------- */

const MAKERS = {
  // walls
  damaskPurple: () => damask('#4a3d55', '#3a2f45', 11),
  damaskBlue: () => damask('#2f3a55', '#253048', 12),
  stripesGreen: () => stripes('#2d4034', '#26372c', 13),
  stripesYellow: () => stripes('#6b6244', '#5d5539', 14),
  floralRed: () => floral('#5a2e33', '#7a454a', '#3a4a33', 15),
  floralChild: () => floral('#6f5f78', '#9a7fa8', '#5b7a6a', 16),
  plasterGrey: () => plaster('#6a6560', 17),
  tileWhite: () => tiles('#a9b3ad', '#4a4f4c', 18, 8, true),
  tileKitchen: () => tiles('#8b9a88', '#3d453c', 19, 8, true),
  brick: () => bricks(20),
  woodPanel: () => woodPanel(21),
  ceiling: () => plaster('#77736c', 22, 1.2),
  // floors
  planks: () => planks('#4a3222', 23),
  planksDark: () => planks('#32221a', 24),
  checker: () => checker('#bdb8a5', '#2b2a28', 25),
  carpetRed: () => carpet('#4a1f2a', '#5f2a38', 26),
  carpetBlue: () => carpet('#25304f', '#2f3d63', 27),
  bathFloor: () => checker('#9aa39f', '#6c7572', 28, 12),
  concrete: () => concrete(29),
  // exterior
  siding: () => siding(30),
  roof: () => shingles(31),
  grass: () => grass(32),
  path: () => pathStones(33),
  asphalt: () => asphalt(34),
  // props
  wood: () => woodFurniture('#4b301e', 35),
  woodLight: () => woodFurniture('#7a5a3a', 36),
  woodDark: () => woodFurniture('#2a1a10', 37),
  fabricRed: () => fabric('#5a2028', 38),
  fabricGreen: () => fabric('#2f4a3a', 39),
  fabricBlue: () => fabric('#2c3a62', 40),
  fabricCream: () => fabric('#a59a84', 41),
  fabricPink: () => fabric('#8a6a8f', 42),
  sheet: () => sheet(43),
  books: () => books(44),
  portrait1: () => portrait(45, 0),
  portrait2: () => portrait(46, 1),
  portrait3: () => portrait(47, 2),
  cobweb: () => cobweb(48),
  fog: () => fogPuff(49),
  sigil: () => sigilTex(),
  paperDrawing: () => paper(50, 'drawing'),
  paperLetter: () => paper(51, 'letter'),
  paperMap: () => paper(52, 'map'),
  paperNote: () => paper(53, 'note'),
  rug: () => carpet('#3a2440', '#6a3a5a', 54),
  rugChild: () => carpet('#3a4a6a', '#7a6aa0', 55),
};

/** Get a shared texture by name. Repeat is set by the caller via clone if needed. */
export function T(name) {
  return cached(name, () => {
    const make = MAKERS[name];
    if (!make) throw new Error('No texture ' + name);
    const c = make();
    const repeat = !/^(portrait|cobweb|fog|sigil|paper)/.test(name);
    return toTex(c, { repeat });
  });
}

export function textureFromCanvas(c, opts) {
  return toTex(c, opts);
}

export function glowTexture(color) {
  return cached('glow:' + color, () => toTex(glowCanvas(color), { repeat: false }));
}

export const TEXTURE_NAMES = Object.keys(MAKERS);
