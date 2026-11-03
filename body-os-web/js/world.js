// BODY.OS — 3D world toolkit: renderer, procedural materials and textures, the level
// kit (boxes with world-scaled UVs, rooms with doorways), axis-aligned collision,
// a light manager that keeps the shader light count fixed, and vision-mode rendering.
import * as THREE from 'three';
import { G, events } from './core.js';
import { world, Vision } from './systems.js';

export const W = {
  renderer: null, scene: null, camera: null, root: null,
  colliders: [], anchors: [], pool: [], ambient: null, hemi: null,
  baseAmbient: new THREE.Color(0x1c2028), baseFog: 0x02040a,
};

// ---------------------------------------------------------------- Renderer
export function initRenderer(canvas) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  r.setClearColor(0x02040a);
  r.outputColorSpace = THREE.SRGBColorSpace;
  W.renderer = r;
  W.scene = new THREE.Scene();
  W.camera = new THREE.PerspectiveCamera(62, 1, 0.08, 160);
  W.ambient = new THREE.AmbientLight(0xffffff, 1);
  W.scene.add(W.ambient);
  W.scene.fog = new THREE.FogExp2(W.baseFog, 0.02);
  for (let i = 0; i < 4; i++) {
    const l = new THREE.PointLight(0xffffff, 0, 10, 1.3);
    W.scene.add(l);
    W.pool.push(l);
  }
  resize();
  return r;
}

export function applyQuality(q) {
  if (!W.renderer) return;
  const dpr = window.devicePixelRatio || 1;
  W.renderer.setPixelRatio(Math.min(dpr, [0.75, 1, 1.5][q] || 1));
  W.lightCount = [2, 4, 4][q] || 4;
  resize();
}

export function resize() {
  if (!W.renderer) return;
  const w = window.innerWidth, h = window.innerHeight;
  W.renderer.setSize(w, h, false);
  W.camera.aspect = w / Math.max(1, h);
  W.camera.updateProjectionMatrix();
}

/** Removes the previous location and starts an empty one. */
export function clearWorld() {
  if (W.root) {
    W.scene.remove(W.root);
    W.root.traverse((o) => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); });
  }
  W.root = new THREE.Group();
  W.scene.add(W.root);
  W.colliders = [];
  W.anchors = [];
  for (const l of W.pool) l.intensity = 0;
}

// ---------------------------------------------------------------- Textures
function canvasTex(n, draw, repeat = true) {
  const c = document.createElement('canvas');
  c.width = c.height = n;
  draw(c.getContext('2d'), n);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 2;
  return t;
}
const TEX = {};
export function tex(name) {
  if (TEX[name]) return TEX[name];
  if (name === 'panel') TEX.panel = canvasTex(128, (g, n) => {
    g.fillStyle = '#d4d8dc'; g.fillRect(0, 0, n, n);
    for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`; g.fillRect(Math.random() * n, Math.random() * n, 3, 3); }
    g.fillStyle = '#6f757c'; g.fillRect(0, 0, n, 4); g.fillRect(0, 0, 4, n);
    g.fillStyle = '#f2f4f6'; g.fillRect(4, 4, n - 4, 3); g.fillRect(4, 4, 3, n - 4);
    g.fillStyle = '#7d838a';
    for (const [x, y] of [[16, 16], [n - 16, 16], [16, n - 16], [n - 16, n - 16]]) { g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); }
  });
  if (name === 'grid') TEX.grid = canvasTex(128, (g, n) => {
    g.fillStyle = '#8a9096'; g.fillRect(0, 0, n, n);
    g.fillStyle = '#c8f6ff'; g.fillRect(0, 0, n, 2); g.fillRect(0, 0, 2, n);
    g.fillStyle = '#a6acb2'; g.fillRect(0, n / 2, n, 1); g.fillRect(n / 2, 0, 1, n);
  });
  if (name === 'stars') TEX.stars = canvasTex(512, (g, n) => {
    const grd = g.createLinearGradient(0, 0, n, n);
    grd.addColorStop(0, '#02030a'); grd.addColorStop(0.6, '#0a0620'); grd.addColorStop(1, '#03101c');
    g.fillStyle = grd; g.fillRect(0, 0, n, n);
    for (let i = 0; i < 500; i++) { const a = Math.random(); g.fillStyle = `rgba(255,255,255,${a})`; g.fillRect(Math.random() * n, Math.random() * n, a > 0.9 ? 2 : 1, a > 0.9 ? 2 : 1); }
    g.fillStyle = '#5a3a7a'; g.beginPath(); g.arc(n * 0.28, n * 0.62, n * 0.12, 0, 7); g.fill();
    g.fillStyle = 'rgba(160,110,255,0.35)'; g.beginPath(); g.arc(n * 0.28, n * 0.62, n * 0.135, 0, 7); g.fill();
  }, false);
  return TEX[name];
}

/** Text drawn onto a canvas texture, used for wall signs. */
function textTexture(text, color) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  g.font = 'bold 64px sans-serif';
  const w = Math.ceil(g.measureText(text).width) + 40;
  c.width = w; c.height = 96;
  g.font = 'bold 64px sans-serif';
  g.fillStyle = color; g.textBaseline = 'middle'; g.textAlign = 'center';
  g.shadowColor = color; g.shadowBlur = 12;
  g.fillText(text, w / 2, 50);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return { t, aspect: w / 96 };
}

// ---------------------------------------------------------------- Materials
const MATS = {};
const col = (c) => (c instanceof THREE.Color ? c : new THREE.Color(c));
export function lit(key, color, opts = {}) {
  if (MATS[key]) return MATS[key];
  const m = new THREE.MeshLambertMaterial({ color: col(color), map: opts.map ? tex(opts.map) : null });
  if (opts.emissive !== undefined) { m.emissive = col(opts.emissive); m.emissiveIntensity = opts.ei || 1; }
  return (MATS[key] = m);
}
export function unlit(key, color, opts = {}) {
  if (MATS[key]) return MATS[key];
  return (MATS[key] = new THREE.MeshBasicMaterial({ color: col(color), map: opts.map ? tex(opts.map) : null, fog: opts.fog !== false }));
}
export function glow(key, color, opacity = 0.5) {
  if (MATS[key]) return MATS[key];
  return (MATS[key] = new THREE.MeshBasicMaterial({ color: col(color), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
}

export const M = {
  get hull() { return lit('hull', 0x3a4048, { map: 'panel' }); },
  get hullDark() { return lit('hullDark', 0x22262e, { map: 'panel' }); },
  get hullLight() { return lit('hullLight', 0x5c636e, { map: 'panel' }); },
  get floor() { return lit('floor', 0x2a3038, { map: 'grid' }); },
  get cyan() { return lit('gCyan', 0x0a3a44, { emissive: 0x1ae6ff, ei: 1.2 }); },
  get blue() { return lit('gBlue', 0x0a1a44, { emissive: 0x3a70ff, ei: 1.1 }); },
  get amber() { return lit('gAmber', 0x442a08, { emissive: 0xffb326, ei: 1.1 }); },
  get red() { return lit('gRed', 0x440a0e, { emissive: 0xff3a48, ei: 1.1 }); },
  get violet() { return lit('gViolet', 0x2a0a44, { emissive: 0xb359ff, ei: 1.2 }); },
  get screen() { return unlit('screen', 0x0e5a6e); },
  get glass() { return glow('glass', 0x2a7aa0, 0.18); },
};

// Vision-mode materials (shared). Scanner/dimensional colours pulse in tickVision().
const VM = {
  cold: new THREE.MeshBasicMaterial({ color: 0x0a1452 }),
  coldDim: new THREE.MeshBasicMaterial({ color: 0x060c34 }),
  warm: new THREE.MeshBasicMaterial({ color: 0xe6404c }),
  hot: new THREE.MeshBasicMaterial({ color: 0xffd84d }),
  dimEnv: new THREE.MeshLambertMaterial({ color: 0x3a2a54 }),
  reveal: new THREE.MeshBasicMaterial({ color: 0xcc73ff }),
  interact: new THREE.MeshBasicMaterial({ color: 0x1ae6ff }),
  collect: new THREE.MeshBasicMaterial({ color: 0xffcc33 }),
  clue: new THREE.MeshBasicMaterial({ color: 0xff4de6 }),
  hostile: new THREE.MeshBasicMaterial({ color: 0xff3333 }),
};
export const SCAN_COLORS = { interact: '#1ae6ff', collect: '#ffcc33', clue: '#ff4de6', hostile: '#ff3333' };
const SCAN_BASE = { interact: new THREE.Color(0x1ae6ff), collect: new THREE.Color(0xffcc33), clue: new THREE.Color(0xff4de6), hostile: new THREE.Color(0xff3333), reveal: new THREE.Color(0xcc73ff) };

// ---------------------------------------------------------------- Geometry
const GEO = {};
const TILE = 2;
export function boxGeo(sx, sy, sz) {
  const key = sx.toFixed(2) + ',' + sy.toFixed(2) + ',' + sz.toFixed(2);
  if (GEO[key]) return GEO[key];
  const g = new THREE.BoxGeometry(sx, sy, sz);
  const uv = g.attributes.uv;
  // Face order: +x, -x, +y, -y, +z, -z (4 vertices each). Scale UVs to world size.
  const dims = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
    const i = f * 4 + v;
    uv.setXY(i, uv.getX(i) * dims[f][0] / TILE, uv.getY(i) * dims[f][1] / TILE);
  }
  g.userData.shared = true;
  return (GEO[key] = g);
}
const SHARED = {};
export function shared(name) {
  if (SHARED[name]) return SHARED[name];
  let g;
  if (name === 'sphere') g = new THREE.SphereGeometry(0.5, 16, 12);
  else if (name === 'cyl') g = new THREE.CylinderGeometry(0.5, 0.5, 1, 20);
  else if (name === 'capsule') g = new THREE.CapsuleGeometry(0.5, 1, 4, 10);
  else if (name === 'plane') g = new THREE.PlaneGeometry(1, 1);
  else if (name === 'ring') g = new THREE.TorusGeometry(0.5, 0.04, 6, 32);
  g.userData.shared = true;
  return (SHARED[name] = g);
}

// ---------------------------------------------------------------- Collision
// Axis-aligned boxes; each may be toggled (hidden objects, doors) via c.on.
export function addCollider(x, y, z, sx, sy, sz, extra) {
  const c = { x0: x - sx / 2, x1: x + sx / 2, y0: y - sy / 2, y1: y + sy / 2, z0: z - sz / 2, z1: z + sz / 2, on: true, ...(extra || {}) };
  W.colliders.push(c);
  return c;
}
export function moveCollider(c, x, y, z) {
  const hx = (c.x1 - c.x0) / 2, hy = (c.y1 - c.y0) / 2, hz = (c.z1 - c.z0) / 2;
  c.x0 = x - hx; c.x1 = x + hx; c.y0 = y - hy; c.y1 = y + hy; c.z0 = z - hz; c.z1 = z + hz;
}

/** Ray against all colliders (slab test). Returns the nearest hit distance or Infinity. */
export function raycast(ox, oy, oz, dx, dy, dz, maxDist, pad = 0) {
  let best = maxDist;
  for (const c of W.colliders) {
    if (!c.on || c.noCamera) continue;
    let t0 = 0, t1 = best;
    const sl = (o, d, a, b) => {
      a -= pad; b += pad;
      if (Math.abs(d) < 1e-6) return o >= a && o <= b;
      let ta = (a - o) / d, tb = (b - o) / d;
      if (ta > tb) { const s = ta; ta = tb; tb = s; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      return t0 <= t1;
    };
    if (sl(ox, dx, c.x0, c.x1) && sl(oy, dy, c.y0, c.y1) && sl(oz, dz, c.z0, c.z1) && t0 < best) best = t0;
  }
  return best;
}

// ---------------------------------------------------------------- Vision targets
/** Registers meshes for vision-mode rendering. opts: env, heat (0..1), scan, hidden, anomaly. */
export function visionTarget(obj, opts = {}) {
  const meshes = [];
  obj.traverse((o) => { if (o.isMesh && !o.userData.noVision) meshes.push(o); });
  const t = { obj, meshes, orig: meshes.map((m) => m.material), env: opts.env !== false, heat: opts.heat || 0,
    scan: opts.scan || '', hidden: !!opts.hidden, anomaly: !!opts.anomaly, colliders: opts.colliders || [], revealed: true };
  world.targets.push(t);
  if (t.hidden) setRevealed(t, false);
  return t;
}
function setRevealed(t, r) {
  t.revealed = r;
  t.obj.visible = r;
  for (const c of t.colliders) c.on = r;
}
function materialFor(t, mode, reveal, orig) {
  if (t.hidden && reveal) return VM.reveal;
  switch (mode) {
    case 'thermal': return t.heat > 0.66 ? VM.hot : t.heat > 0.01 ? VM.warm : t.env ? VM.cold : VM.coldDim;
    case 'scanner': return t.scan ? VM[t.scan] : orig;
    case 'dimensional': return t.anomaly ? VM.reveal : t.env ? VM.dimEnv : orig;
    default: return orig;
  }
}
export function applyVision() {
  const mode = Vision.current, reveal = Vision.revealed;
  for (const t of world.targets) {
    if (t.hidden) setRevealed(t, reveal);
    for (let i = 0; i < t.meshes.length; i++) t.meshes[i].material = materialFor(t, mode, reveal, t.orig[i]);
  }
  // Lighting per mode.
  const amb = W.ambient, fog = W.scene.fog;
  fog.color.set(W.baseFog);
  fog.density = 0.02;
  switch (mode) {
    case 'night': amb.color.setRGB(0.55, 0.95, 0.6); amb.intensity = 2.2; fog.color.setRGB(0.03, 0.12, 0.05); fog.density = 0.008; break;
    case 'scanner': amb.color.copy(W.baseAmbient); amb.intensity = 2.2; break;
    case 'thermal': amb.color.setRGB(0.2, 0.2, 0.4); amb.intensity = 1; fog.color.setRGB(0.01, 0.01, 0.06); break;
    case 'dimensional': amb.color.setRGB(0.5, 0.35, 0.8); amb.intensity = 1.6; fog.color.setRGB(0.06, 0.02, 0.1); break;
    default: amb.color.copy(W.baseAmbient); amb.intensity = 1;
  }
}
let pulse = 0;
export function tickVision(dt) {
  if (Vision.current !== 'scanner' && !Vision.revealed) return;
  pulse += dt;
  const k = 0.65 + 0.35 * Math.sin(pulse * 4);
  for (const n of ['interact', 'collect', 'clue', 'hostile']) VM[n].color.copy(SCAN_BASE[n]).multiplyScalar(k);
  VM.reveal.color.copy(SCAN_BASE.reveal).multiplyScalar(0.7 + 0.3 * Math.sin(pulse * 2.5));
}
events.on('vision', applyVision);

// ---------------------------------------------------------------- Lights
/** Room light anchors. The four nearest to the player drive a fixed pool of point lights,
 *  so the shader light count never changes (no recompiles, predictable cost on phones). */
export function lightAnchor(x, y, z, color, range, intensity) { W.anchors.push({ x, y, z, color: new THREE.Color(color), range, intensity }); }
let lightTimer = 0;
export function tickLights(dt, p) {
  lightTimer -= dt;
  if (lightTimer > 0 || !p) return;
  lightTimer = 0.3;
  const sorted = W.anchors.slice().sort((a, b) => ((a.x - p.x) ** 2 + (a.z - p.z) ** 2) - ((b.x - p.x) ** 2 + (b.z - p.z) ** 2));
  const n = W.lightCount || 4;
  W.pool.forEach((l, i) => {
    const a = i < n ? sorted[i] : null;
    if (!a) { l.intensity = 0; return; }
    l.position.set(a.x, a.y, a.z); l.color.copy(a.color); l.distance = a.range; l.intensity = a.intensity * 1.35;
  });
}

// ---------------------------------------------------------------- Level kit
export function group(parent, x = 0, y = 0, z = 0, yawDeg = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = yawDeg * Math.PI / 180;
  (parent || W.root).add(g);
  return g;
}

/** A box in world (or group-local, if parent is rotated) coordinates. Options:
 *  collide (default true), env (vision environment, default true), heat, scan. */
export function box(parent, x, y, z, sx, sy, sz, mat, opts = {}) {
  const m = new THREE.Mesh(boxGeo(sx, sy, sz), mat);
  m.position.set(x, y, z);
  (parent || W.root).add(m);
  if (opts.collide !== false) {
    // Colliders are world-space AABBs: compute from the mesh's world transform.
    m.updateWorldMatrix(true, false);
    const b = new THREE.Box3().setFromObject(m);
    m.userData.collider = addCollider((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2, b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z, opts.collider);
  }
  if (opts.env !== false && opts.vision !== false) visionTarget(m, { env: true, heat: opts.heat, scan: opts.scan });
  return m;
}

export function mesh(parent, geoName, x, y, z, sx, sy, sz, mat) {
  const m = new THREE.Mesh(shared(geoName), mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  (parent || W.root).add(m);
  return m;
}

export function sign(parent, text, x, y, z, yawDeg, color = '#1ae6ff', height = 0.3) {
  const { t, aspect } = textTexture(text, color);
  const m = new THREE.Mesh(shared('plane'), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, fog: false }));
  m.position.set(x, y, z);
  m.rotation.y = yawDeg * Math.PI / 180;
  m.scale.set(height * aspect, height, 1);
  m.userData.noVision = true;
  (parent || W.root).add(m);
  return m;
}

/** Room shell. openings: [side ('N','S','E','W'), centre, width, height]. */
export function room(min, max, height, openings = [], strips = true) {
  const [x0, y0, z0] = min, [x1, , z1] = max;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, sx = x1 - x0, sz = z1 - z0;
  box(null, cx, y0 - 0.1, cz, sx, 0.2, sz, M.floor);
  box(null, cx, y0 + height + 0.1, cz, sx, 0.2, sz, M.hullDark);
  for (const side of ['N', 'S', 'E', 'W']) wall(side, min, max, height, openings.filter((o) => o[0] === side));
  if (strips) {
    if (sx >= sz) {
      box(null, cx, y0 + height - 0.3, z0 + 0.14, sx * 0.8, 0.08, 0.05, M.blue, { collide: false, env: false });
      box(null, cx, y0 + height - 0.3, z1 - 0.14, sx * 0.8, 0.08, 0.05, M.blue, { collide: false, env: false });
    } else {
      box(null, x0 + 0.14, y0 + height - 0.3, cz, 0.05, 0.08, sz * 0.8, M.blue, { collide: false, env: false });
      box(null, x1 - 0.14, y0 + height - 0.3, cz, 0.05, 0.08, sz * 0.8, M.blue, { collide: false, env: false });
    }
  }
}

function wall(side, min, max, height, cuts) {
  const thick = 0.3, inset = 0.02; // inset avoids coplanar faces where rooms share a wall
  const alongX = side === 'N' || side === 'S';
  const a0 = alongX ? min[0] : min[2], a1 = alongX ? max[0] : max[2];
  let fixed = side === 'N' ? max[2] : side === 'S' ? min[2] : side === 'E' ? max[0] : min[0];
  fixed += side === 'N' || side === 'E' ? -inset : inset;
  const y0 = min[1];
  const piece = (a, b, ya, yb) => {
    if (b - a < 0.01) return;
    if (alongX) box(null, (a + b) / 2, (ya + yb) / 2, fixed, b - a, yb - ya, thick, M.hull);
    else box(null, fixed, (ya + yb) / 2, (a + b) / 2, thick, yb - ya, b - a, M.hull);
  };
  const post = (a, h) => {
    if (alongX) box(null, a, y0 + h / 2, fixed, 0.12, h, 0.42, M.cyan, { collide: false, env: false });
    else box(null, fixed, y0 + h / 2, a, 0.42, h, 0.12, M.cyan, { collide: false, env: false });
  };
  cuts.sort((p, q) => p[1] - q[1]);
  let cur = a0;
  for (const [, c, w = 2.4, h = 3] of cuts) {
    const s = c - w / 2, e = c + w / 2;
    if (s > cur) piece(cur, s, y0, y0 + height);
    if (h < height) piece(s, e, y0 + h, y0 + height);
    post(s, h); post(e, h);
    cur = e;
  }
  if (cur < a1) piece(cur, a1, y0, y0 + height);
}

/** Position-polled hazard zone. cond: { name, temp, atmo, rad, gravity, drift? } */
export function hazard(cx, cy, cz, sx, sy, sz, cond, priority = 0) {
  world.zones.push({ cx, cy, cz, sx, sy, sz, cond, priority });
  return world.zones[world.zones.length - 1];
}

/** Position-polled trigger that sets a flag and/or discovers a location once. */
export function flagZone(cx, cy, cz, sx, sy, sz, flag, location, message) {
  world.flagZones.push({ cx, cy, cz, sx, sy, sz, flag, location, message, done: false });
}
