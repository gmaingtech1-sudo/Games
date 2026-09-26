// Cosmos 360: game loop and flight logic.
import * as THREE from 'three';
import { SYSTEMS, BODY, KM_PER_UNIT, C_KMS, KIND_LABEL } from './data.js';
import { World } from './world.js';
import { Sky, SKY_R } from './sky.js';
import { Baker } from './bake.js';
import { Ship } from './ship.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import { UI, Overlay, fmtKm, fmtSpeed } from './ui.js';
import { formatDate, DEG } from './astro.js';

const WARPS = [[0, 'Paused'], [1, 'Real time'], [60, '1 minute / s'], [3600, '1 hour / s'], [86400, '1 day / s'], [604800, '1 week / s'], [2629800, '1 month / s'], [31557600, '1 year / s']];
const WARP_SHORT = ['Paused', '1×', '60×', '1 h/s', '1 d/s', '1 wk/s', '1 mo/s', '1 yr/s'];
const Y = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0), Z = new THREE.Vector3(0, 0, 1);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4();
const clamp = THREE.MathUtils.clamp;

// ───────────────────────────── save data ─────────────────────────────
const SAVE_KEY = 'cosmos360-v1';
const coarse = matchMedia('(pointer: coarse)').matches;
let save = null;
try { save = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { save = null; }
if (!save || typeof save !== 'object') save = {};
save.settings = Object.assign({ labels: true, orbits: true, dots: true, lines: false, sound: true, invert: false, quality: coarse ? 'medium' : 'high' }, save.settings || {});
save.stats = Object.assign({ traveledKm: 0, maxSpeed: 0, jumps: 0 }, save.stats || {});
const found = new Set((save.found || []).filter((id) => BODY[id]));
const S = save.settings;
let saveTimer = 0;
function persist() {
  save.found = [...found];
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* storage full or blocked */ }
}

// ───────────────────────────── renderer ─────────────────────────────
const canvas = document.getElementById('scene');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
} catch (e) {
  document.getElementById('title-note').textContent = 'Sorry, this browser can\'t run 3D graphics (WebGL 2 is needed).';
  document.getElementById('btn-start').disabled = true;
  throw e;
}
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.autoClear = false;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(65, 1, 1e-5, 1e10);
camera.rotation.order = 'YXZ';

const sky = new Sky(renderer);
scene.add(sky.group);
const shipModel = new Ship();
const sound = new Sound();
sound.on = S.sound;
const overlay = new Overlay(document.getElementById('overlay'));
let baker = null, world = null;

// ───────────────────────────── game state ─────────────────────────────
let sys = null;
let state = 'boot';            // boot | loading | title | play | jump
let sceneReady = false;
const ship = { pos: new THREE.Vector3(), q: new THREE.Quaternion(), speed: 0, throttle: 0, anchor: null };
let mode = 'fly';              // fly | orbit
let view = 'chase';            // chase | cockpit
let target = null, travel = null, scan = null;
const orbit = { body: null, az: 0, el: 0.25, dist: 3, idle: 0 };
let simMs = Date.now();
let warpIdx = 1;
let fov = 65;
let realT = 0;
let gyroOn = false, gyroCalib = false;
const gyroBase = new THREE.Quaternion(), devQ = new THREE.Quaternion();
const look = { vx: 0, vy: 0, t: 0 };
let hyper = 0, hyperHold = false;
let wantOrbit = false;
let horizonT = 0;
let turnX = 0, turnY = 0;
let photoReq = false;
let loadResolve = null, loadTotal = 1;
let uiTick = 0;
let W = 1, H = 1, DPR = 1;

// ───────────────────────────── UI & input ─────────────────────────────
const ui = new UI({
  onGo: () => goButton(),
  onOrbit: () => orbitButton(),
  onScan: () => scanButton(),
  onInfo: () => { if (target) openInfo(target.def); },
  onOpen: (k) => openSheet(k),
  onGyro: () => toggleGyro(),
  onView: () => toggleView(),
  onPhoto: () => { photoReq = true; sound.blip('tap'); },
  onThrottle: (v) => setThrottle(v),
  onAction: (a, d) => sheetAction(a, d),
  onSheetClosed: () => {},
});

const input = new Input(canvas, {
  onLook: (dx, dy) => onLook(dx, dy),
  onPinch: (s) => onPinch(s),
  onRoll: (a) => { if (state === 'play' && mode === 'fly' && !gyroOn && !travel) ship.q.multiply(_q.setFromAxisAngle(Z, a)); },
  onTap: (x, y) => { if (state === 'play' && !ui.sheetOpen) pick(x, y); },
  onDoubleTap: () => { if (state === 'play' && mode === 'fly') { fov = 65; ui.toast('Zoom reset'); } },
  onDown: () => { orbit.idle = 0; look.vx = look.vy = 0; },
  onKey: (code, e) => onKey(code, e),
});

function resize() {
  W = window.innerWidth; H = window.innerHeight;
  const cap = S.quality === 'high' ? 2 : S.quality === 'low' ? 1 : 1.5;
  DPR = Math.min(window.devicePixelRatio || 1, cap);
  if (sys && sys.id === 'sgra') DPR *= S.quality === 'high' ? 0.75 : S.quality === 'low' ? 0.45 : 0.55;
  renderer.setPixelRatio(DPR);
  renderer.setSize(W, H, false);
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
  overlay.resize(W, H, Math.min(window.devicePixelRatio || 1, 2));
}
window.addEventListener('resize', resize);

// ───────────────────────────── helpers ─────────────────────────────
const kmPerUnit = KM_PER_UNIT;
function surfKm(b) { return Math.max(0, b.dist - b.R) * kmPerUnit; }
function arriveDist(b) {
  if (b.kind === 'star') return b.R * 5;
  if (b.kind === 'blackhole') return b.R * 26;
  if (b.kind === 'comet') return b.R * 90;
  if (b.def.shape) return b.R * 6;
  return b.R * (b.def.rings ? 4.4 : 3.2);
}
function scanRange(b) {
  if (b.kind === 'star') return b.R * 40;
  if (b.kind === 'blackhole') return b.R * 150;
  if (b.kind === 'comet') return b.R * 3000;
  if (b.def.shape) return b.R * 400;
  return b.R * 60;
}
function minDist(b) {
  if (b.kind === 'star') return b.R * 1.03;
  if (b.kind === 'blackhole') return 0;
  if (b.def.shape) return b.R * Math.max(...b.def.shape) / b.def.radius * 1.3;
  return b.R * (1 + (b.def.atmo ? 0.004 : 0.0025)) + 0.0004;
}
function forward(out) { return out.set(0, 0, -1).applyQuaternion(ship.q); }
const camQInv = new THREE.Quaternion();
function project(p, out = {}) {
  const f = (H / 2) / Math.tan((camera.fov * DEG) / 2);
  _v.copy(p).sub(camera.position).applyQuaternion(camQInv);
  out.front = _v.z < 0;
  const z = -_v.z || 1e-9;
  out.x = W / 2 + (_v.x / z) * f;
  out.y = H / 2 - (_v.y / z) * f;
  out.vx = _v.x; out.vy = _v.y; out.vz = _v.z;
  return out;
}
function projectDir(dir, out = {}) {
  _v2.copy(dir).multiplyScalar(SKY_R).add(camera.position);
  return project(_v2, out);
}
// Is the straight line from the camera to point p (at distance dist) blocked by a body?
const _bd = new THREE.Vector3(), _bo = new THREE.Vector3();
function blocked(p, dist, except) {
  _bd.copy(p).sub(camera.position).normalize();
  for (const b of world.bodies) {
    if (b === except || b.dist >= dist || b.kind === 'blackhole') continue;
    const r = b.R * 0.98;
    _bo.copy(b.pos).sub(camera.position);
    const t = _bo.dot(_bd);
    if (t <= 0) continue;
    if (_bo.lengthSq() - t * t < r * r) return true;
  }
  return false;
}
const _le = new THREE.Vector3(), _lt = new THREE.Vector3(), _lm = new THREE.Matrix4();
function lookRotation(dir, up, out) {
  _lm.lookAt(_le.set(0, 0, 0), _lt.copy(dir), up);
  return out.setFromRotationMatrix(_lm);
}
function rotateShip(yaw, pitch) {
  ship.q.multiply(_q.setFromAxisAngle(Y, yaw)).multiply(_q.setFromAxisAngle(X, pitch)).normalize();
}

// ───────────────────────────── controls ─────────────────────────────
function onLook(dx, dy) {
  if (state !== 'play' || ui.sheetOpen) return;
  const inv = S.invert ? -1 : 1;
  if (mode === 'orbit') {
    orbit.az -= dx * 0.006 * inv;
    orbit.el = clamp(orbit.el + dy * 0.006 * inv, -1.45, 1.45);
    orbit.idle = 0;
    return;
  }
  if (travel) return;
  const k = ((camera.fov * DEG) / H) * inv;
  if (gyroOn) { gyroBase.multiply(_q.setFromAxisAngle(Y, dx * k)); return; }
  rotateShip(dx * k, dy * k);
  const now = performance.now();
  const dt = Math.max(0.008, (now - look.t) / 1000);
  look.t = now;
  look.vx = look.vx * 0.3 + (dx * k / dt) * 0.7;
  look.vy = look.vy * 0.3 + (dy * k / dt) * 0.7;
  turnX = dx * k / dt * 0.05; turnY = dy * k / dt * 0.05;
}

function onPinch(s) {
  if (state !== 'play' || ui.sheetOpen) return;
  if (mode === 'orbit') {
    const b = orbit.body;
    orbit.dist = clamp(orbit.dist / s, minOrbit(b), b.kind === 'blackhole' ? 380 : 1500);
    orbit.idle = 0;
  } else {
    fov = clamp(fov / s, 0.5, 80);
  }
}

function setThrottle(v) {
  if (state !== 'play') return;
  if (travel) { travel = null; wantOrbit = false; ui.toast('Autopilot off'); }
  if (mode === 'orbit' && v > 0.02) exitOrbit();
  ship.throttle = v;
}

function onKey(code, e) {
  if (state !== 'play' || ui.sheetOpen) return;
  const map = {
    Space: () => goButton(), KeyF: () => scanButton(), KeyO: () => orbitButton(), KeyC: () => toggleView(),
    KeyG: () => toggleGyro(), KeyP: () => { photoReq = true; }, KeyM: () => openSheet('map'), KeyB: () => openSheet('log'),
    KeyN: () => openSheet('targets'), KeyI: () => { if (target) openInfo(target.def); },
    KeyT: () => { warpIdx = (warpIdx + 1) % WARPS.length; ui.toast(`Time: ${WARPS[warpIdx][1]}`); },
    KeyL: () => { S.labels = !S.labels; persist(); },
    Tab: () => cycleTarget(e.shiftKey ? -1 : 1),
    Digit0: () => { fov = 65; },
  };
  if (map[code]) { e.preventDefault(); map[code](); }
}

function cycleTarget(dir) {
  const list = world.bodies.filter((b) => b.kind !== 'moon' || (b.parent.dist / b.parent.R < 900));
  if (!list.length) return;
  let i = list.indexOf(target);
  i = (i + dir + list.length) % list.length;
  select(list[i]);
}

function pick(x, y) {
  let best = null, bestScore = Infinity;
  const s = {};
  for (const b of world.bodies) {
    project(b.pos, s);
    if (!s.front) continue;
    const visible = b.pixR > 1.5 || b.dotA > 0.05 || b.kind === 'star' || b.kind === 'blackhole' || b.labelShown;
    if (!visible) continue;
    const r = Math.max(b.pixR, 0) + 24;
    const d = Math.min(Math.hypot(s.x - x, s.y - y), b.labelShown ? Math.hypot(s.x - x, s.y + Math.max(b.pixR, 3) + 14 - y) : Infinity);
    const score = d / r;
    if (score < 1 && score < bestScore) { best = b; bestScore = score; }
  }
  if (best) { select(best); return; }
  if (S.labels) {
    for (const m of sky.markers) {
      projectDir(m.dir, s);
      if (s.front && Math.hypot(s.x - x, s.y - y) < 30) { openSystemInfo(m.sys, m.ly); return; }
    }
  }
}

function select(b) {
  if (!b) return;
  if (target !== b) { scan = null; sound.blip('select'); }
  target = b;
}

// ───────────────────────────── actions ─────────────────────────────
function goButton() {
  if (state !== 'play' || !target) return;
  if (travel && travel.body === target) { travel = null; wantOrbit = false; ui.toast('Autopilot off'); return; }
  if (target.dist < arriveDist(target) * 1.3) { ui.toast(`You're at ${target.name}`); return; }
  startTravel(target, false);
}

function orbitButton() {
  if (state !== 'play' || !target) return;
  if (mode === 'orbit' && orbit.body === target) { exitOrbit(); ui.toast('Back to free flight'); return; }
  if (target.dist < Math.max(arriveDist(target) * 1.5, target.R * 40)) enterOrbit(target);
  else startTravel(target, true);
}

function scanButton() {
  if (state !== 'play' || !target) return;
  if (found.has(target.id)) { openInfo(target.def); return; }
  if (scan && scan.body === target) return;
  const range = scanRange(target);
  if (target.dist > range) {
    ui.toast(`Too far to scan. Get within ${fmtKm((range - target.R) * kmPerUnit)}.`);
    sound.blip('error');
    return;
  }
  scan = { body: target, t: 0 };
  sound.blip('scan');
}

function startTravel(b, orbitAfter) {
  if (mode === 'orbit') exitOrbit();
  travel = { body: b, phase: 'align', v: Math.max(ship.speed, b.R * 0.05), t: 0 };
  wantOrbit = orbitAfter;
  ship.throttle = 0;
  sound.blip('warp');
}

function enterOrbit(b) {
  travel = null;
  mode = 'orbit';
  orbit.body = b;
  _v.copy(ship.pos).sub(b.pos);
  const r = _v.length();
  orbit.dist = clamp(r / b.R, minOrbit(b), b.kind === 'blackhole' ? 380 : 1500);
  orbit.el = Math.asin(clamp(_v.y / (r || 1), -1, 1));
  orbit.az = Math.atan2(_v.x, _v.z);
  orbit.idle = 0;
  ship.throttle = 0; ship.speed = 0;
  if (gyroOn) { gyroOn = false; input.disableGyro(); ui.setGyro(false); }
}
function minOrbit(b) {
  if (b.kind === 'blackhole') return 2.6;
  if (b.kind === 'star') return 1.4;
  if (b.def.shape) return 3;
  return 1 + (b.def.atmo ? b.def.atmo.height * 1.5 : 0.02);
}
function exitOrbit() {
  if (mode !== 'orbit') return;
  mode = 'fly';
  ship.anchor = orbit.body;
  orbit.body = null;
}

async function toggleGyro() {
  if (state !== 'play') return;
  sound.init();
  if (gyroOn) {
    gyroOn = false; input.disableGyro(); ui.setGyro(false); ui.toast('360° look off');
    return;
  }
  const ok = await input.enableGyro();
  if (!ok) { ui.toast('No motion sensors here. Drag to look around instead.'); return; }
  if (mode === 'orbit') exitOrbit();
  gyroOn = true; gyroCalib = false;
  ui.setGyro(true);
  ui.toast('360° look on. Move your phone to look around.');
  setTimeout(() => {
    if (gyroOn && !input.gyro.has) {
      gyroOn = false; input.disableGyro(); ui.setGyro(false);
      ui.toast('No motion sensor found. Drag to look around instead.');
    }
  }, 1800);
}

function toggleView() {
  if (state !== 'play') return;
  if (mode === 'orbit') { exitOrbit(); view = 'chase'; ui.toast('Chase view'); return; }
  view = view === 'chase' ? 'cockpit' : 'chase';
  ui.toast(view === 'chase' ? 'Chase view' : 'Cockpit view');
  sound.blip('tap');
}

// ───────────────────────────── sheets ─────────────────────────────
function openInfo(def) {
  const here = sys && def.sys === sys.id;
  ui.openInfo(def, found.has(def.id), {
    canTarget: here && (!target || target.id !== def.id),
    canGo: here && target && target.id === def.id && target.dist > arriveDist(target) * 1.3,
    jump: !here,
  });
}
function openSystemInfo(other, ly) {
  ui.openMap(sys.id, found);
  const d = ly < 100 ? ly.toFixed(2) : Math.round(ly).toLocaleString('en-US');
  ui.toast(`${other.id === 'sol' ? 'The Sun' : other.name} is ${d} light-years from here`);
}
function targetRows() {
  const rows = [];
  const add = (b, child) => rows.push({
    id: b.id, name: b.name, color: b.def.color, child, found: found.has(b.id),
    kind: b.def.candidate ? 'Candidate planet' : KIND_LABEL[b.kind], dist: fmtKm(surfKm(b)),
  });
  for (const b of world.bodies) {
    if (b.parent && b.parent.kind !== 'star') continue;
    add(b, false);
    for (const m of world.bodies) if (m.parent === b && b.kind !== 'star') add(m, true);
  }
  return rows;
}
function openSheet(k) {
  if (state !== 'play') return;
  sound.blip('tap');
  if (k === 'map') ui.openMap(sys.id, found);
  else if (k === 'log') ui.openLog(found, save.stats);
  else if (k === 'settings') ui.openSettings(S);
  else if (k === 'targets') ui.openTargets(targetRows(), target && target.id);
  else if (k === 'time') ui.openTime(WARPS, warpIdx, formatDate(simMs));
}
function sheetAction(a, d) {
  if (a === 'target' || a === 'go') {
    const b = world.byId[d.id];
    if (!b) return;
    select(b);
    ui.closeSheet();
    if (a === 'go') startTravel(b, false);
  } else if (a === 'jump') {
    jump(d.sys);
  } else if (a === 'log') {
    openInfo(BODY[d.id]);
  } else if (a === 'warp') {
    warpIdx = Number(d.i);
    ui.openTime(WARPS, warpIdx, formatDate(simMs));
  } else if (a === 'now') {
    simMs = Date.now(); warpIdx = 1;
    ui.openTime(WARPS, warpIdx, formatDate(simMs));
    ui.toast('Back to the present');
  } else if (a === 'toggle') {
    S[d.key] = !S[d.key];
    persist();
    if (d.key === 'sound') { sound.init(); sound.setEnabled(S.sound); }
    ui.openSettings(S);
  } else if (a === 'quality') {
    if (S.quality !== d.v) {
      S.quality = d.v;
      persist();
      ui.closeSheet();
      rebuild();
    }
  } else if (a === 'reset') {
    if (window.confirm('Erase all scanned worlds from your logbook?')) {
      found.clear(); save.stats = { traveledKm: 0, maxSpeed: 0, jumps: 0 }; persist();
      ui.toast('Logbook cleared');
      ui.openSettings(S);
    }
  } else if (a === 'share') {
    sharePhoto();
  }
}

// ───────────────────────────── systems ─────────────────────────────
function loadSystem(id) {
  sys = SYSTEMS.find((s) => s.id === id) || SYSTEMS[0];
  save.sys = sys.id;
  persist();
  sceneReady = false;
  state = 'loading';
  resize();
  ui.setSystem(sys.name);
  const skyTex = sky.build(sys, S.quality);
  scene.background = skyTex;
  world.build(sys, S.quality, skyTex);
  loadTotal = Math.max(1, baker.pending);
  return new Promise((res) => { loadResolve = res; });
}

function placeAtStart() {
  const st = sys.start;
  const b = world.byId[st.near];
  world.advance(simMs, 0);
  let dirSun;
  const star = world.stars.find((s) => s !== b);
  if (b.kind === 'blackhole') dirSun = new THREE.Vector3(0, 0, 1);
  else if (star) dirSun = _v.copy(star.pos).sub(b.pos).normalize().clone();
  else dirSun = new THREE.Vector3(1, 0, 0);
  const off = dirSun.applyAxisAngle(Y, st.angle * DEG).multiplyScalar(st.dist * b.R);
  off.y += st.lift * b.R;
  ship.pos.copy(b.pos).add(off);
  lookRotation(_v.copy(b.pos).sub(ship.pos).normalize(), Y, ship.q);
  ship.speed = 0; ship.throttle = 0; ship.anchor = b;
  target = world.byId[st.target] || b;
  mode = 'fly'; travel = null; scan = null; orbit.body = null; fov = 65;
}

async function jump(id) {
  if (state !== 'play' || !sys || id === sys.id) { ui.closeSheet(); return; }
  ui.closeSheet();
  if (mode === 'orbit') exitOrbit();
  travel = null; scan = null;
  sound.blip('jump');
  state = 'jump';
  hyperHold = true;
  ui.showHUD(false);
  ui.updateLabels([]);
  await new Promise((r) => setTimeout(r, 1300));
  save.stats.jumps++;
  const dest = SYSTEMS.find((s) => s.id === id);
  ui.showLoading('Hyperspace', `Destination: ${dest.name}`);
  await loadSystem(id);
  placeAtStart();
  ui.hideLoading();
  state = 'play';
  sceneReady = true;
  hyperHold = false;
  ui.fade(true, true);
  setTimeout(() => ui.fade(false), 120);
  ui.showHUD(true);
  ui.toast(`Welcome to ${dest.name}`, 'good', 3200);
  sound.blip('arrive');
}

async function rebuild() {
  const keep = { pos: ship.pos.clone(), q: ship.q.clone(), target: target && target.id };
  ui.showLoading('Repainting worlds');
  ui.showHUD(false);
  await loadSystem(sys.id);
  ui.hideLoading();
  world.advance(simMs, 0);
  ship.pos.copy(keep.pos); ship.q.copy(keep.q);
  target = world.byId[keep.target] || null;
  mode = 'fly'; travel = null;
  state = 'play'; sceneReady = true;
  ui.showHUD(true);
}

// ───────────────────────────── per-frame logic ─────────────────────────────
function updateFly(dt) {
  const k = input.keys;
  if (k.has('KeyW')) ship.throttle = Math.min(1, ship.throttle + dt * 0.5);
  if (k.has('KeyS')) ship.throttle = Math.max(0, ship.throttle - dt * 0.7);
  const rate = 1.1 * (camera.fov / 65);
  const yaw = ((k.has('KeyA') || k.has('ArrowLeft')) ? 1 : 0) - ((k.has('KeyD') || k.has('ArrowRight')) ? 1 : 0);
  const pitch = (k.has('ArrowUp') ? 1 : 0) - (k.has('ArrowDown') ? 1 : 0);
  const roll = (k.has('KeyQ') ? 1 : 0) - (k.has('KeyE') ? 1 : 0);
  if (yaw || pitch) { rotateShip(yaw * rate * dt, pitch * rate * dt); turnX = -yaw * 0.08; turnY = pitch * 0.05; }
  if (roll) ship.q.multiply(_q.setFromAxisAngle(Z, roll * 1.2 * dt));

  if (gyroOn && input.gyro.has) {
    input.deviceQuaternion(devQ);
    if (!gyroCalib) { gyroBase.copy(ship.q).multiply(_q.copy(devQ).invert()); gyroCalib = true; }
    ship.q.copy(gyroBase).multiply(devQ).normalize();
  } else if (!input.dragging) {
    if (Math.abs(look.vx) + Math.abs(look.vy) > 1e-4) rotateShip(look.vx * dt, look.vy * dt);
    const damp = Math.exp(-dt * 6);
    look.vx *= damp; look.vy *= damp;
  }
  turnX *= Math.exp(-dt * 3); turnY *= Math.exp(-dt * 3);

  const near = world.nearest(ship.pos);
  // Near a black hole there's no surface to slow for: let the player fall in.
  const floor = near.body && near.body.kind === 'blackhole' ? near.body.R * 0.08 : 0.00005;
  const vmax = Math.max(near.surf, floor) * 1.5;
  const want = ship.throttle * ship.throttle * vmax;
  ship.speed += (want - ship.speed) * (1 - Math.exp(-dt * 2.5));
  ship.pos.addScaledVector(forward(_v2), ship.speed * dt);
}

function updateTravel(dt) {
  const b = travel.body;
  const stop = arriveDist(b);
  const dir = _v.copy(b.pos).sub(ship.pos);
  const dist = dir.length();
  dir.divideScalar(dist || 1);
  const remain = dist - stop;
  // Steer around anything in the way.
  for (const o of world.bodies) {
    if (o === b || o.kind === 'blackhole') continue;
    _v2.copy(o.pos).sub(ship.pos);
    const t = _v2.dot(dir);
    if (t <= 0 || t > dist) continue;
    const closest = _v2.addScaledVector(dir, -t);
    const miss = closest.length();
    if (miss < o.R * 1.6 && o.dist < o.R * 60) {
      dir.addScaledVector(closest.normalize(), -0.9).normalize();
    }
  }
  const up = _v2.set(0, 1, 0).applyQuaternion(ship.q);
  lookRotation(dir, up, _q2);
  ship.q.slerp(_q2, 1 - Math.exp(-dt * 4));
  const fwd = forward(new THREE.Vector3());
  const ang = fwd.angleTo(dir);
  travel.t += dt;
  if (travel.phase === 'align') {
    ship.speed *= Math.exp(-dt * 2);
    ship.pos.addScaledVector(fwd, ship.speed * dt);
    if (ang < 4 * DEG || travel.t > 1.3) { travel.phase = 'cruise'; travel.v = Math.max(ship.speed, b.R * 0.05, 0.01); }
    return;
  }
  travel.v = Math.min(travel.v * (1 + dt * 4.0) + b.R * 0.05 * dt, Math.max(remain, 0) * 3.0 + b.R * 0.02);
  const step = Math.min(travel.v * dt, Math.max(remain, 0));
  ship.pos.addScaledVector(dir, step);
  ship.speed = travel.v;
  if (remain <= b.R * 0.03 || remain <= 1e-4) {
    travel = null;
    ship.speed = 0;
    ship.throttle = 0;
    ship.anchor = b;
    gyroCalib = false;
    sound.blip('arrive');
    if (wantOrbit) { enterOrbit(b); wantOrbit = false; }
    ui.toast(found.has(b.id) ? `Arrived at ${b.name}` : `Arrived at ${b.name}. Tap Scan!`, 'good');
  }
}

function updateOrbit(dt) {
  const b = orbit.body;
  if (!input.dragging) {
    orbit.idle += dt;
    if (orbit.idle > 3) orbit.az += dt * 0.05 * Math.min(1, (orbit.idle - 3) / 2);
  }
  const r = orbit.dist * b.R;
  const ce = Math.cos(orbit.el);
  ship.pos.set(ce * Math.sin(orbit.az), Math.sin(orbit.el), ce * Math.cos(orbit.az)).multiplyScalar(r).add(b.pos);
  _m.lookAt(ship.pos, b.pos, Y);
  ship.q.setFromRotationMatrix(_m);
  ship.speed = 0;
}

function collide() {
  for (const b of world.bodies) {
    const d = ship.pos.distanceTo(b.pos);
    if (b.kind === 'blackhole') {
      if (d < b.R * 1.0 && !horizonT) crossHorizon();
      continue;
    }
    const m = minDist(b);
    if (d < m) {
      ship.pos.sub(b.pos).setLength(m).add(b.pos);
      ship.speed *= 0.3;
    }
  }
}

function crossHorizon() {
  horizonT = 1;
  ui.fade(true);
  ui.toast('You crossed the event horizon. Nothing gets back out… but this time, you do.', '', 5200);
  setTimeout(() => {
    placeAtStart();
    ui.fade(false);
    horizonT = 0;
  }, 1600);
}

function chooseAnchor() {
  let best = null, bestRatio = Infinity;
  for (const b of world.bodies) {
    const ratio = (b.dist - b.R) / b.R;
    if (ratio < 250 && ratio < bestRatio) { best = b; bestRatio = ratio; }
  }
  ship.anchor = best;
}

function updateScan(dt) {
  if (!scan) return;
  if (scan.body !== target || target.dist > scanRange(target) * 1.1) { scan = null; ui.toast('Scan interrupted'); return; }
  scan.t += dt / 2.6;
  if (scan.t >= 1) {
    const b = scan.body;
    scan = null;
    found.add(b.id);
    persist();
    sound.blip('discover');
    ui.toast(`New discovery: ${b.name}  (${found.size} logged)`, 'good', 3200);
    openInfo(b.def);
  }
}

function update(dt) {
  if (state === 'play') simMs += dt * 1000 * WARPS[warpIdx][0];
  if (!Number.isFinite(simMs) || Math.abs(simMs) > 8.6e15) simMs = Date.now();
  world.advance(simMs, dt);

  if (state === 'title') {
    if (mode !== 'orbit' && target) enterOrbit(target);
    orbit.idle = 10;
    updateOrbit(dt);
  } else {
    if (mode === 'fly' && ship.anchor) ship.pos.add(_v.copy(ship.anchor.pos).sub(ship.anchor.prevPos));
    if (travel) updateTravel(dt);
    else if (mode === 'orbit') updateOrbit(dt);
    else updateFly(dt);
    if (mode === 'fly') collide();
    updateScan(dt);
  }

  camera.position.copy(ship.pos);
  camera.quaternion.copy(ship.q);
  const wantFov = mode === 'orbit' ? 50 : fov;
  if (camera.fov !== wantFov) { camera.fov = wantFov; camera.updateProjectionMatrix(); }
  camera.updateMatrixWorld();
  camQInv.copy(camera.quaternion).invert();

  world.sync(camera, H, DPR, { dots: S.dots, orbits: S.orbits }, realT);
  sky.update(camera, camera.fov, DPR, S.lines);
  if (state === 'play') chooseAnchor();

  // Stats
  const kms = ship.speed * kmPerUnit;
  if (state === 'play' && WARPS[warpIdx][0] !== 0) save.stats.traveledKm += kms * dt;
  if (kms > save.stats.maxSpeed) save.stats.maxSpeed = kms;
  saveTimer += dt;
  if (saveTimer > 5) { saveTimer = 0; persist(); }

  // Sound
  const cfac = kms / C_KMS;
  const warpFx = travel && travel.phase === 'cruise' ? clamp(Math.log10(Math.max(cfac, 1e-6)) / 3 + 0.35, 0, 1) : 0;
  sound.engine(travel ? 0.6 : ship.throttle, warpFx);
  return warpFx;
}

// ───────────────────────────── HUD ─────────────────────────────
const _s = {};
function hudFrame(dt, warpFx) {
  const labels = [];
  const playing = state === 'play';
  const placed = [];
  const tryPlace = (it, w, h) => {
    const r = { x0: it.x - w / 2, x1: it.x + w / 2, y0: it.y, y1: it.y + h };
    for (const p of placed) if (r.x0 < p.x1 && r.x1 > p.x0 && r.y0 < p.y1 && r.y1 > p.y0) return false;
    placed.push(r);
    labels.push(it);
    return true;
  };
  const cands = [];
  for (const b of world.bodies) {
    b.labelShown = false;
    const isT = b === target;
    if (!playing || (!S.labels && !isT)) continue;
    project(b.pos, _s);
    if (!_s.front || _s.x < -40 || _s.x > W + 40 || _s.y < -40 || _s.y > H + 40) continue;
    if (b.kind === 'moon' && b.parent.dist / b.parent.R > 900 && !isT) continue;
    if (b.pixR > H * 0.3 && !isT) continue;
    if (blocked(b.pos, b.dist, b)) continue;
    const pri = isT ? 0 : b.kind === 'star' || b.kind === 'blackhole' ? 1 : b.kind === 'planet' ? 2 : b.kind === 'moon' ? 5 : 3;
    let cls = b.kind === 'moon' ? 'moon' : b.kind === 'star' ? 'star' : '';
    if (isT) cls += ' sel';
    if (found.has(b.id)) cls += ' found';
    cands.push({ b, pri, it: { key: b.id, text: b.name, sub: isT ? fmtKm(surfKm(b)) : '', x: _s.x, y: _s.y + Math.max(b.pixR, 3) + 7, cls } });
  }
  if (S.labels && playing) {
    for (const m of sky.markers) {
      projectDir(m.dir, _s);
      if (!_s.front || _s.x < 0 || _s.x > W || _s.y < 0 || _s.y > H) continue;
      if (blocked(_v2.copy(m.dir).multiplyScalar(SKY_R).add(camera.position), Infinity, null)) continue;
      const ly = m.ly < 100 ? m.ly.toFixed(1) : Math.round(m.ly).toLocaleString('en-US');
      cands.push({ pri: 6, it: { key: 'sys-' + m.sys.id, text: m.sys.id === 'sol' ? 'The Sun' : m.sys.name, sub: `${ly} ly`, x: _s.x, y: _s.y + 8, cls: 'sys' } });
    }
    if (S.lines && sky.constellationNames) {
      for (const c of sky.constellationNames) {
        projectDir(c.dir, _s);
        if (!_s.front || _s.x < 0 || _s.x > W || _s.y < 0 || _s.y > H) continue;
        cands.push({ pri: 7, it: { key: 'con-' + c.name, text: c.name, x: _s.x, y: _s.y, cls: 'cons' } });
      }
    }
  }
  cands.sort((a, b) => a.pri - b.pri);
  for (const c of cands) {
    const w = Math.max(c.it.text.length, (c.it.sub || '').length) * 6.8 + 8;
    const h = c.it.sub ? 28 : 15;
    if (tryPlace(c.it, w, h) && c.b) c.b.labelShown = true;
  }
  ui.updateLabels(labels);

  // Overlay: target, flares, streaks
  let tgt = null;
  if (target && state === 'play') {
    project(target.pos, _s);
    const on = _s.front && _s.x > 0 && _s.x < W && _s.y > 0 && _s.y < H;
    tgt = {
      onScreen: on, x: _s.x, y: _s.y, r: target.pixR, name: target.name, found: found.has(target.id),
      dirX: _s.front ? _s.x - W / 2 : -_s.vx, dirY: _s.front ? _s.y - H / 2 : _s.vy,
    };
  }
  const flares = [];
  if (state === 'play' || state === 'title') {
    for (const s of world.stars) {
      project(s.pos, _s);
      if (!_s.front || _s.x < -50 || _s.x > W + 50 || _s.y < -50 || _s.y > H + 50) continue;
      if (blocked(s.pos, s.dist, s)) continue;
      const far = Math.log10(Math.max(1, s.dist / (s.R * 215)));
      let I = clamp(0.95 - 0.18 * far, 0.2, 0.95);
      if (s.pixR > H * 0.15) I *= clamp(1 - (s.pixR - H * 0.15) / (H * 0.3), 0, 1);
      flares.push({ x: _s.x, y: _s.y, intensity: I * (sys.id === 'alphacen' ? 0.7 : 1) });
    }
  }
  overlay.draw({
    dt, time: realT, target: tgt, flares, warp: warpFx, hyper,
    scan: scan ? scan.t : 0,
    reticle: state === 'play' && mode === 'fly' && view === 'cockpit',
  });

  // Text HUD at ~10 Hz
  uiTick -= dt;
  if (uiTick > 0 || state !== 'play') return;
  uiTick = 0.1;
  ui.setDate(formatDate(simMs), WARP_SHORT[warpIdx]);
  ui.setLogCount(found.size);
  ui.setGyro(gyroOn);
  const kms = ship.speed * kmPerUnit;
  let main;
  if (travel) main = travel.phase === 'align' ? `Aligning with ${travel.body.name}` : `Autopilot · ${fmtSpeed(kms)}`;
  else if (mode === 'orbit') main = `Orbiting ${orbit.body.name}`;
  else main = kms < 0.001 ? 'Holding position' : fmtSpeed(kms);
  let sub = '', warn = false;
  const near = ship.anchor;
  if (near) {
    if (near.kind === 'blackhole') {
      const r = near.dist / near.R;
      const f = Math.sqrt(Math.max(0, 1 - 1 / Math.max(r, 1)));
      sub = `${fmtKm(surfKm(near))} from the event horizon · time runs at ${f.toFixed(f < 0.1 ? 3 : 2)}×`;
      warn = f < 0.8;
    } else if (near.dist / near.R < 40) {
      sub = `${near.name} · altitude ${fmtKm(surfKm(near))}`;
    }
  }
  if (fov < 60 && mode === 'fly') main += ` · zoom ${(65 / fov).toFixed(fov < 6 ? 0 : 1)}×`;
  ui.setReadout(main, sub, warn);
  ui.setThrottle(ship.throttle, mode === 'fly' && !travel);

  if (target) {
    const range = scanRange(target);
    const near2 = target.dist < arriveDist(target) * 1.3;
    ui.setCard(target, {
      sub: `${target.def.candidate ? 'Candidate planet' : KIND_LABEL[target.kind]} · ${fmtKm(surfKm(target))}`,
      goLabel: travel && travel.body === target ? 'Stop' : near2 ? 'Here' : 'Go',
      goDisabled: near2 && !(travel && travel.body === target),
      orbitOn: mode === 'orbit' && orbit.body === target,
      scanLabel: found.has(target.id) ? 'Info' : scan ? 'Scanning' : target.dist > range ? 'Scan' : 'Scan',
      found: found.has(target.id),
      scanProgress: scan ? scan.t : 0,
    });
  } else ui.setCard(null);
}

// ───────────────────────────── rendering ─────────────────────────────
function render() {
  renderer.setRenderTarget(null);
  renderer.clear();
  if (sceneReady) renderer.render(scene, camera);
  const showShip = state === 'play' && mode === 'fly' && view === 'chase' && camera.fov > 20 && !photoReq;
  if (sceneReady && showShip) {
    const star = world.stars[0] || null;
    let lit = 1;
    const sd = new THREE.Vector3(0.3, 0.6, 0.7);
    let tint = [1, 1, 1];
    if (star) {
      sd.copy(star.pos).sub(ship.pos).normalize();
      tint = star.tint;
      for (const b of world.bodies) {
        if (b.kind === 'star' || b.kind === 'blackhole') continue;
        _v.copy(b.pos).sub(ship.pos);
        const t = _v.dot(sd);
        if (t <= 0) continue;
        if (_v.lengthSq() - t * t < b.R * b.R) { lit = 0.03; break; }
      }
      sd.applyQuaternion(camQInv);
    } else if (sys.id === 'sgra') {
      sd.set(0, -1, 0.2).normalize().applyQuaternion(camQInv); tint = [1, 0.75, 0.5]; lit = 0.7;
    }
    shipModel.update(1 / 60, realT, {
      aspect: W / H, fov: camera.fov, throttle: travel ? 1 : ship.throttle, turnX, turnY,
      sunDirView: sd, sunColor: tint, lit,
    });
    renderer.clearDepth();
    renderer.render(shipModel.scene, shipModel.camera);
  }
  if (photoReq && sceneReady) {
    photoReq = false;
    capturePhoto();
  }
}

let lastPhoto = null;
function capturePhoto() {
  const src = renderer.domElement;
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(src, 0, 0);
  const s = c.height / 900;
  ctx.font = `600 ${Math.round(22 * s)}px "Exo 2", sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 6 * s;
  const where = target && target.dist < target.R * 200 ? target.name : sys.name;
  ctx.fillText(`${where} · ${formatDate(simMs).slice(0, 10)}`, 24 * s, c.height - 50 * s);
  ctx.font = `700 ${Math.round(14 * s)}px "Orbitron", sans-serif`;
  ctx.fillStyle = 'rgba(160,200,255,0.8)';
  ctx.fillText('COSMOS 360', 24 * s, c.height - 24 * s);
  const url = c.toDataURL('image/jpeg', 0.92);
  lastPhoto = { url, name: `cosmos360-${where.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.jpg` };
  ui.openPhoto(url, lastPhoto.name);
  sound.blip('select');
}
async function sharePhoto() {
  if (!lastPhoto) return;
  try {
    const blob = await (await fetch(lastPhoto.url)).blob();
    const file = new File([blob], lastPhoto.name, { type: 'image/jpeg' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: 'Cosmos 360' });
    else ui.toast('Sharing isn\'t supported here. Use Save photo.');
  } catch { /* cancelled */ }
}

// ───────────────────────────── main loop ─────────────────────────────
let lastNow = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0, (now - lastNow) / 1000));
  lastNow = now;
  realT += dt;
  if (state === 'loading') {
    const done = baker.step(sceneReady ? 8 : 18);
    const f = 1 - baker.pending / loadTotal;
    ui.setLoading(f);
    if (!document.getElementById('title').hidden) document.getElementById('title-note').textContent = `Painting planets… ${Math.round(f * 100)}%`;
    if (done && loadResolve) { const r = loadResolve; loadResolve = null; r(); }
  }
  hyper = hyperHold ? Math.min(1, hyper + dt / 1.1) : Math.max(0, hyper - dt / 0.9);
  let warpFx = 0;
  if (sceneReady && world.hasPos) warpFx = update(dt);
  render();
  if (world && world.hasPos) hudFrame(dt, warpFx);
  else overlay.draw({ dt, time: realT, target: null, flares: [], warp: 0, hyper, scan: 0, reticle: false });
}

// ───────────────────────────── boot ─────────────────────────────
async function boot() {
  resize();
  const note = document.getElementById('title-note');
  const startBtn = document.getElementById('btn-start');
  startBtn.disabled = true;
  startBtn.textContent = 'Preparing';
  note.textContent = 'Loading…';
  requestAnimationFrame(frame);
  let land;
  try {
    land = await new THREE.TextureLoader().loadAsync('assets/earth-land.png');
  } catch {
    land = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    land.needsUpdate = true;
  }
  land.colorSpace = THREE.NoColorSpace;
  land.generateMipmaps = false;
  land.minFilter = THREE.LinearFilter;
  land.wrapS = THREE.RepeatWrapping;
  baker = new Baker(renderer, land);
  world = new World(renderer, scene, baker);
  await loadSystem(save.sys || 'sol');
  placeAtStart();
  enterOrbit(target);
  orbit.dist = sys.id === 'sgra' ? 40 : Math.max(orbit.dist, 3.2);
  sceneReady = true;
  state = 'title';
  startBtn.disabled = false;
  startBtn.textContent = 'Launch';
  note.textContent = found.size ? `${found.size} worlds in your logbook` : '';
}

document.getElementById('btn-start').addEventListener('click', () => {
  if (state !== 'title') return;
  sound.init();
  sound.setEnabled(S.sound);
  document.getElementById('title').hidden = true;
  placeAtStart();
  state = 'play';
  ui.showHUD(true);
  sound.blip('arrive');
  setTimeout(() => {
    if (!found.size) ui.toast(`Welcome aboard. ${target.name} is right ahead: tap Scan to log it.`, 'good', 5000);
    else ui.toast(`Welcome back to ${sys.name}`, 'good');
  }, 600);
});

document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); });

// Test hook: open the game with #debug to drive it from the console.
if (location.hash.includes('debug')) {
  window.cosmos = {
    get state() { return state; },
    get world() { return world; },
    ship, orbit, S, input,
    get fov() { return camera.fov; },
    orbitAt(id, dist, azDeg = 30, elDeg = 15, sunRel = true) {
      const b = world.byId[id];
      select(b); enterOrbit(b);
      let base = 0;
      const star = world.stars.find((s) => s !== b);
      if (sunRel && star) { const s = _v.copy(star.pos).sub(b.pos); base = Math.atan2(s.x, s.z); }
      orbit.dist = dist; orbit.az = base + azDeg * DEG; orbit.el = elDeg * DEG; orbit.idle = 0;
    },
    flyAt(id, dist, azDeg = 30, elDeg = 10) {
      this.orbitAt(id, dist, azDeg, elDeg); updateOrbit(0); exitOrbit();
    },
    select: (id) => select(world.byId[id]),
    go: () => goButton(),
    scan: () => scanButton(),
    jump: (id) => jump(id),
    setTime(ms) { simMs = ms; },
    setWarp(i) { warpIdx = i; },
    setView(v) { view = v; },
    setFov(f) { fov = f; },
    look(yawDeg, pitchDeg) { rotateShip(yawDeg * DEG, pitchDeg * DEG); },
    lookAt(id) { const b = world.byId[id]; lookRotation(_v.copy(b.pos).sub(ship.pos).normalize(), Y, ship.q); },
  };
}
boot();
