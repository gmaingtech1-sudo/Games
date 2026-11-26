/* Job Interview Simulator 3D: a slapstick job interview at Synergex Solutions Ltd.
   You sit across the desk from the interviewer. Every question has a couple of sensible
   answers and a couple of less sensible ones. */

import * as THREE from './vendor/three.module.min.js';
import { CHARS, ACTIONS, WEAPON_LINES, QUESTIONS, HIT_ORDER, MAX_Q } from './data.js';
import { audio, ac, SFX, buzz } from './sound.js';

const V3 = THREE.Vector3;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = t => 1 - Math.pow(1 - t, 3);
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// ---------- 2D helpers (for the textures painted on faces, shirts, posters) ----------

let g = null; // the 2D context currently being painted
function rr(x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function ell(x, y, rx, ry, rot) { g.beginPath(); g.ellipse(x, y, rx, ry, rot || 0, 0, Math.PI * 2); }
function circ(x, y, r) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); }
function star2d(x, y, r1, r2, n) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? r2 : r1, a = -Math.PI / 2 + i * Math.PI / n;
    g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  g.closePath();
}
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => clamp(Math.round(v * f), 0, 255));
  return 'rgb(' + c.join(',') + ')';
}
function canvasTex(w, h, paint) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  g = c.getContext('2d'); paint(g, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// ---------- Renderer, camera, materials ----------

const cvs = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas: cvs, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#d8ccb0');
const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 30);
const CAM_POS = new V3(0, 1.36, 0.72), CAM_LOOK = new V3(0, 1.17, -1.0);
camera.position.copy(CAM_POS); camera.lookAt(CAM_LOOK);
scene.add(camera);

const GRAD = new THREE.DataTexture(new Uint8Array([110, 110, 110, 255, 185, 185, 185, 255, 255, 255, 255, 255]), 3, 1);
GRAD.minFilter = GRAD.magFilter = THREE.NearestFilter; GRAD.needsUpdate = true;
const MATS = {};
function tm(color) { return MATS[color] || (MATS[color] = new THREE.MeshToonMaterial({ color, gradientMap: GRAD })); }
function bm(color) { return new THREE.MeshBasicMaterial({ color }); }
const OUTLINE = new THREE.MeshBasicMaterial({ color: 0x141414, side: THREE.BackSide });
const noRay = () => {};

function mesh(geo, mat, x, y, z) {
  const m = new THREE.Mesh(geo, typeof mat === 'string' ? tm(mat) : mat);
  m.castShadow = true; m.receiveShadow = true;
  if (x !== undefined) m.position.set(x, y, z);
  return m;
}
function outl(m, s) {
  const o = new THREE.Mesh(m.geometry, OUTLINE); o.scale.setScalar(s || 1.07); o.raycast = noRay; m.add(o); return m;
}
const UP = new V3(0, 1, 0);
function setLimb(m, a, b) {
  const d = b.clone().sub(a), len = d.length();
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(UP, d.normalize());
  m.scale.set(1, len, 1);
}
const CYL = new THREE.CylinderGeometry(1, 1, 1, 14);
function limb(r, mat, a, b) { const m = mesh(CYL, mat); m.geometry = new THREE.CylinderGeometry(r, r, 1, 14); setLimb(m, a, b); return outl(m, 1.12); }
function ball(r, mat, x, y, z, sx, sy, sz) {
  const m = mesh(new THREE.SphereGeometry(r, 24, 16), mat, x, y, z);
  if (sx) m.scale.set(sx, sy, sz);
  return m;
}
function box(w, h, d, mat, x, y, z) { return mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z); }

// ---------- Lights and room ----------

scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a66, 1.9));
const sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
sun.position.set(1.4, 3.6, 2.2); sun.target.position.set(0, 0.8, -1);
sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -2.6, right: 2.6, top: 2.6, bottom: -2.6, near: 0.5, far: 9 });
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);

const WALL_Z = -3.0;
function buildRoom() {
  const floor = mesh(new THREE.PlaneGeometry(8, 8), '#5d6c82'); floor.rotation.x = -Math.PI / 2; floor.position.z = -1; scene.add(floor);
  const back = mesh(new THREE.PlaneGeometry(6, 3.2), '#d9ccae', 0, 1.6, WALL_Z); scene.add(back);
  for (const s of [-1, 1]) {
    const side = mesh(new THREE.PlaneGeometry(6, 3.2), '#cfc1a2', s * 2.6, 1.6, 0); side.rotation.y = -s * Math.PI / 2; scene.add(side);
  }
  const ceil = mesh(new THREE.PlaneGeometry(6, 6), '#efe9dc', 0, 2.9, 0); ceil.rotation.x = Math.PI / 2; scene.add(ceil);
  scene.add(box(5.2, 0.12, 0.03, '#8a6a46', 0, 0.06, WALL_Z + 0.02));
  scene.add(box(5.2, 0.05, 0.03, '#c6b694', 0, 1.0, WALL_Z + 0.02));

  // window with a city outside
  const city = canvasTex(512, 512, (c, w, h) => {
    const sky = c.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#59b7ff'); sky.addColorStop(1, '#c9ecff');
    c.fillStyle = sky; c.fillRect(0, 0, w, h);
    c.fillStyle = '#fff'; [[90, 90], [330, 140], [220, 60]].forEach(([x, y]) => { ell(x, y, 50, 16); c.fill(); ell(x + 30, y - 12, 32, 18); c.fill(); });
    const blds = [[0, 300, 90], [80, 220, 70], [140, 330, 80], [215, 180, 90], [300, 260, 70], [360, 200, 95], [450, 300, 70]];
    blds.forEach(([x, y, bw], i) => {
      c.fillStyle = ['#5e6f94', '#6d7fa6', '#53648a'][i % 3]; c.fillRect(x, y, bw, h - y);
      c.fillStyle = '#ffe78a';
      for (let wx = x + 8; wx < x + bw - 10; wx += 16) for (let wy = y + 12; wy < h; wy += 22) if ((wx * 7 + wy * 3) % 5 < 2) c.fillRect(wx, wy, 7, 10);
    });
  });
  const win = new THREE.Group(); win.position.set(-1.35, 1.75, WALL_Z + 0.03);
  win.add(new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.1), new THREE.MeshBasicMaterial({ map: city })));
  const fr = '#5a4a36';
  win.add(box(1.42, 0.07, 0.06, fr, 0, 0.58, 0), box(1.42, 0.07, 0.06, fr, 0, -0.58, 0), box(0.07, 1.22, 0.06, fr, -0.68, 0, 0),
    box(0.07, 1.22, 0.06, fr, 0.68, 0, 0), box(0.04, 1.1, 0.04, fr, 0, 0, 0), box(1.3, 0.04, 0.04, fr, 0, 0.05, 0), box(1.5, 0.05, 0.14, fr, 0, -0.62, 0.05));
  scene.add(win);

  // motivational poster
  const poster = canvasTex(256, 320, (c, w, h) => {
    c.fillStyle = '#1d1d1d'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#ff9a5a'; c.fillRect(16, 16, w - 32, 200);
    c.fillStyle = '#5b3a8c'; c.beginPath(); c.moveTo(16, 216); c.lineTo(90, 96); c.lineTo(140, 150); c.lineTo(180, 110); c.lineTo(w - 16, 216); c.fill();
    c.fillStyle = '#ffe14d'; circ(190, 70, 22); c.fill();
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.font = '900 40px system-ui, sans-serif'; c.fillText('SYNERGY', w / 2, 262);
    c.font = '600 14px system-ui, sans-serif'; c.fillText('TEAMWORK MAKES', w / 2, 288); c.fillText('THE DREAM WORK', w / 2, 306);
  });
  const pst = mesh(new THREE.PlaneGeometry(0.8, 1.0), new THREE.MeshToonMaterial({ map: poster, gradientMap: GRAD }), 1.3, 1.75, WALL_Z + 0.02);
  scene.add(pst);

  // clock
  const clock = new THREE.Group(); clock.position.set(0, 2.42, WALL_Z + 0.04);
  const face = mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.04, 32), '#ffffff'); face.rotation.x = Math.PI / 2; clock.add(outl(face, 1.08));
  const hh = box(0.02, 0.1, 0.01, '#222'); hh.geometry.translate(0, 0.05, 0); hh.position.z = 0.03; clock.add(hh);
  const mh = box(0.015, 0.15, 0.01, '#222'); mh.geometry.translate(0, 0.07, 0); mh.position.z = 0.035; clock.add(mh);
  scene.add(clock); room.hands = [hh, mh];

  // filing cabinet and plant
  const cab = new THREE.Group(); cab.position.set(-1.75, 0, -1.9);
  cab.add(outl(box(0.55, 1.25, 0.6, '#8d97a5', 0, 0.625, 0), 1.02));
  for (let k = 0; k < 3; k++) { cab.add(box(0.48, 0.34, 0.02, '#9fa9b7', 0, 0.25 + k * 0.4, 0.31), box(0.14, 0.03, 0.03, '#555', 0, 0.36 + k * 0.4, 0.33)); }
  cab.add(ball(0.07, '#ffffff', 0.1, 1.32, 0, 1, 0.7, 1));
  scene.add(cab);
  const plant = new THREE.Group(); plant.position.set(1.75, 0, -1.7);
  plant.add(outl(mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.4, 20), '#b5651d', 0, 0.2, 0), 1.05));
  for (let k = 0; k < 9; k++) {
    const leaf = ball(0.08, '#3c8d3c', Math.cos(k * 2.1) * 0.12, 0.6 + (k % 3) * 0.22, Math.sin(k * 2.1) * 0.1, 1, 3, 0.5);
    leaf.rotation.z = Math.cos(k * 2.1) * 0.5; leaf.rotation.x = Math.sin(k * 2.1) * 0.4; plant.add(leaf);
  }
  scene.add(plant); room.plant = plant;

  // ceiling light
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, 0.6), bm('#fffbe8')).translateY(2.88).translateZ(-1));
}
const room = {};
buildRoom();

// ---------- Desk ----------

const desk = { pivot: new THREE.Group(), items: new THREE.Group(), t: -1, plateTex: null };
function makeMug() {
  const m = new THREE.Group();
  m.add(outl(mesh(new THREE.CylinderGeometry(0.045, 0.042, 0.1, 20), '#ffffff'), 1.08));
  const handle = mesh(new THREE.TorusGeometry(0.028, 0.009, 8, 16), '#ffffff', 0.05, 0, 0); m.add(handle);
  const coffee = mesh(new THREE.CircleGeometry(0.04, 20), '#6e3e19', 0, 0.045, 0); coffee.rotation.x = -Math.PI / 2; m.add(coffee);
  return m;
}
function makeStapler() {
  const s = new THREE.Group();
  s.add(outl(box(0.05, 0.03, 0.16, '#c0392b', 0, 0.035, 0), 1.08), box(0.055, 0.015, 0.17, '#333', 0, 0.008, 0));
  return s;
}
function makeChairProp() {
  const c = new THREE.Group(), wood = '#8b5a2b';
  c.add(outl(box(0.4, 0.05, 0.4, wood, 0, 0, 0), 1.04));
  for (const [x, z] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]]) c.add(outl(box(0.04, 0.4, 0.04, wood, x, -0.2, z), 1.1));
  c.add(outl(box(0.4, 0.12, 0.04, wood, 0, 0.38, -0.18), 1.06), box(0.04, 0.36, 0.04, wood, -0.17, 0.2, -0.18), box(0.04, 0.36, 0.04, wood, 0.17, 0.2, -0.18));
  return c;
}
function paintPlate(text) {
  return canvasTex(256, 64, c => {
    c.fillStyle = '#262626'; c.fillRect(0, 0, 256, 64);
    c.strokeStyle = '#d4ac0d'; c.lineWidth = 4; c.strokeRect(6, 6, 244, 52);
    c.fillStyle = '#d4ac0d'; c.font = '800 26px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, 128, 34);
  });
}
function buildDesk() {
  desk.pivot.position.set(0, 0.76, -0.6);
  const body = new THREE.Group(); body.position.set(0, -0.76, 0.6); desk.pivot.add(body);
  const wood = '#7f512e', dark = '#5e3a1f';
  body.add(outl(box(1.8, 0.06, 0.8, '#6d4426', 0, 0.73, -0.2), 1.01));
  body.add(box(1.72, 0.66, 0.04, wood, 0, 0.37, 0.17));
  for (const s of [-1, 1]) {
    body.add(box(0.05, 0.7, 0.76, wood, s * 0.86, 0.35, -0.2));
    body.add(box(0.66, 0.26, 0.02, dark, s * 0.42, 0.52, 0.2), box(0.66, 0.26, 0.02, dark, s * 0.42, 0.22, 0.2));
    body.add(box(0.16, 0.03, 0.03, '#d4ac0d', s * 0.42, 0.52, 0.215), box(0.16, 0.03, 0.03, '#d4ac0d', s * 0.42, 0.22, 0.215));
  }
  body.add(desk.items);
  // papers, stapler, nameplate, mug
  const papers = new THREE.Group(); papers.position.set(-0.55, 0.77, -0.12); papers.rotation.y = 0.2;
  for (let k = 0; k < 4; k++) { const sh = box(0.22, 0.006, 0.3, '#ffffff', rand(-0.01, 0.01), k * 0.007, rand(-0.01, 0.01)); sh.rotation.y = rand(-0.08, 0.08); papers.add(sh); }
  desk.items.add(papers);
  const st = makeStapler(); st.position.set(-0.3, 0.76, -0.05); st.rotation.y = 0.5; desk.items.add(st);
  desk.plateTex = paintPlate('G. PEMBERTON');
  const plateMats = Array(6).fill(tm('#262626')); plateMats[4] = new THREE.MeshBasicMaterial({ map: desk.plateTex });
  const plate = mesh(new THREE.BoxGeometry(0.38, 0.08, 0.03), plateMats, 0, 0.8, -0.04); plate.rotation.x = -0.35;
  desk.plate = plate; desk.items.add(plate);
  const mug = makeMug(); mug.position.set(0.48, 0.81, -0.1); mug.rotation.y = 2.5; desk.items.add(mug);
  const pens = new THREE.Group(); pens.position.set(0.68, 0.76, -0.35);
  pens.add(outl(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.1, 14), '#2b2b2b', 0, 0.05, 0), 1.06));
  ['#1e6fd9', '#e8202a', '#222'].forEach((c, k) => { const p = mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.15, 6), c, (k - 1) * 0.015, 0.12, 0); p.rotation.z = (k - 1) * 0.2; pens.add(p); });
  desk.items.add(pens);
  scene.add(desk.pivot);
}
buildDesk();

// ---------- Interviewers ----------

const FACE_W = 1024, FACE_H = 512, FACE_K = 3.6; // the face is painted around the sphere's front (u = 0.25)

function paintFace(p) {
  const c = p.def, m = p.marks, e = p.expr, ctx = p.faceCanvas.getContext('2d');
  g = ctx;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = c.skin; ctx.fillRect(0, 0, FACE_W, FACE_H);
  ctx.translate(FACE_W / 4, FACE_H / 2); ctx.scale(FACE_K, FACE_K);

  ctx.fillStyle = 'rgba(255,120,120,.25)'; ell(-28, 14, 9, 6); ctx.fill(); ell(28, 14, 9, 6); ctx.fill();
  if (m.blackEye) { ctx.fillStyle = 'rgba(90,40,140,.7)'; ell(-17, -6, 15, 13); ctx.fill(); }
  if (m.bruise) { ctx.fillStyle = 'rgba(110,60,150,.5)'; ell(27, 16, 9, 7); ctx.fill(); }
  if (m.slap) {
    ctx.fillStyle = 'rgba(230,60,70,' + Math.min(0.65, 0.3 + m.slap * 0.05) + ')';
    ell(-26, 18, 10, 9); ctx.fill();
    for (let k = 0; k < 4; k++) { ell(-38 + k * 6, 4 + (k === 0 ? 4 : 0), 2.6, 7, 0.2); ctx.fill(); }
  }

  const blink = p.blinkT < 0.12 && e !== 'ko' && e !== 'shocked';
  for (const s of [-1, 1]) {
    const x = s * 17, y = -6;
    ctx.strokeStyle = '#1b1b1b'; ctx.lineWidth = 3; ctx.fillStyle = '#fff'; ctx.lineCap = 'round';
    if (e === 'ko') {
      ctx.beginPath(); ctx.moveTo(x - 7, y - 7); ctx.lineTo(x + 7, y + 7); ctx.moveTo(x + 7, y - 7); ctx.lineTo(x - 7, y + 7); ctx.stroke();
    } else if (e === 'hurt') {
      ctx.beginPath(); ctx.moveTo(x - 8 * s, y - 6); ctx.lineTo(x + 6 * s, y); ctx.lineTo(x - 8 * s, y + 6); ctx.stroke();
    } else if (e === 'happy') {
      ctx.beginPath(); ctx.arc(x, y + 3, 7, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    } else if (blink) {
      ctx.beginPath(); ctx.moveTo(x - 8, y); ctx.lineTo(x + 8, y); ctx.stroke();
    } else {
      const big = e === 'shocked' ? 12 : 9;
      ell(x, y, big - 1, big); ctx.fill(); ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#1b1b1b'; circ(x + p.look * 3, y + 1, e === 'shocked' ? 3 : 4.5); ctx.fill();
      ctx.fillStyle = '#fff'; circ(x + p.look * 3 + 1.5, y - 1, 1.3); ctx.fill();
      if (e === 'smug') { ctx.fillStyle = c.skin; ctx.fillRect(x - 10, y - 11, 20, 10); ctx.strokeStyle = '#1b1b1b'; ctx.beginPath(); ctx.moveTo(x - 9, y - 1); ctx.lineTo(x + 9, y - 1); ctx.stroke(); }
    }
    ctx.strokeStyle = c.hair === 'bald' ? '#9a9a9a' : shade(c.hairColor, 0.6); ctx.lineWidth = 4;
    ctx.beginPath();
    if (e === 'angry') { ctx.moveTo(x - 10 * s, y - 20); ctx.lineTo(x + 8 * s, y - 13); }
    else if (e === 'shocked' || e === 'hurt') { ctx.moveTo(x - 9, y - 22); ctx.quadraticCurveTo(x, y - 28, x + 9, y - 22); }
    else { ctx.moveTo(x - 9, y - 18); ctx.lineTo(x + 9, y - 18); }
    ctx.stroke();
  }

  ctx.strokeStyle = '#111'; ctx.lineWidth = 2.5;
  if (c.glasses) {
    ctx.save(); if (m.broken) ctx.rotate(0.1);
    for (const s of [-1, 1]) {
      const x = s * 17;
      if (c.glasses === 'cat') {
        ctx.beginPath(); ctx.moveTo(x - 13, -14); ctx.lineTo(x + 13, -12); ctx.lineTo(x + 11, 4); ctx.lineTo(x - 11, 4); ctx.closePath();
        if (s < 0) { ctx.moveTo(x - 13, -14); ctx.lineTo(x - 19, -21); } else { ctx.moveTo(x + 13, -12); ctx.lineTo(x + 19, -21); }
        ctx.stroke();
      } else { rr(x - 13, -16, 26, 20, 4); ctx.stroke(); }
    }
    ctx.beginPath(); ctx.moveTo(-4, -7); ctx.lineTo(4, -7); ctx.stroke();
    if (m.broken) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath();
      ctx.moveTo(10, -14); ctx.lineTo(17, -6); ctx.lineTo(13, 0); ctx.moveTo(17, -6); ctx.lineTo(26, -10); ctx.moveTo(17, -6); ctx.lineTo(22, 2); ctx.stroke();
    }
    ctx.restore();
  }
  if (c.monocle && !m.broken) {
    ctx.strokeStyle = '#d4ac0d'; ctx.lineWidth = 3; circ(17, -6, 13); ctx.stroke();
    ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(28, 2); ctx.quadraticCurveTo(40, 40, 32, 60); ctx.stroke();
  }
  if (c.mustache) {
    ctx.fillStyle = c.hairColor; ctx.strokeStyle = '#777'; ctx.lineWidth = 1; ctx.beginPath();
    ctx.moveTo(0, 13); ctx.quadraticCurveTo(-14, 8, -30, 20); ctx.quadraticCurveTo(-14, 21, 0, 18);
    ctx.quadraticCurveTo(14, 21, 30, 20); ctx.quadraticCurveTo(14, 8, 0, 13); ctx.fill(); ctx.stroke();
  }

  ctx.strokeStyle = '#2b1b10'; ctx.lineWidth = 3; ctx.fillStyle = '#7a1c1c';
  const my = c.mustache ? 29 : 25;
  const teeth = (y, w) => { ctx.fillStyle = '#fff'; ctx.fillRect(-w / 2 + 2, y, w - 4, 4); if (m.toothGone) { ctx.fillStyle = '#7a1c1c'; ctx.fillRect(-3, y, 5, 4); } };
  ctx.beginPath();
  if (e === 'happy') { ctx.moveTo(-14, my - 3); ctx.quadraticCurveTo(0, my + 16, 14, my - 3); ctx.closePath(); ctx.fill(); ctx.stroke(); teeth(my - 2, 26); }
  else if (e === 'smug') { ctx.moveTo(-10, my + 2); ctx.quadraticCurveTo(4, my + 4, 14, my - 4); ctx.stroke(); }
  else if (e === 'shocked') { ell(0, my + 3, 8, 10); ctx.fill(); ctx.stroke(); }
  else if (e === 'hurt') { ell(0, my + 3, 13, 8); ctx.fill(); ctx.stroke(); teeth(my - 3, 22); }
  else if (e === 'ko') { ell(0, my + 2, 10, 6); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#ff7b8a'; ell(5, my + 10, 6, 8); ctx.fill(); ctx.lineWidth = 2; ctx.stroke(); }
  else if (e === 'angry') { ctx.moveTo(-12, my + 5); ctx.quadraticCurveTo(0, my - 6, 12, my + 5); ctx.stroke(); }
  else { ctx.moveTo(-10, my + 1); ctx.lineTo(10, my + 1); ctx.stroke(); }
  if (c.lipstick && (e === 'neutral' || e === 'smug' || e === 'angry')) { ctx.strokeStyle = c.lipstick; ctx.lineWidth = 3; ctx.stroke(); }

  for (const b of m.faceAids) paintAid(ctx, b.x, b.y, b.r, 1);
  p.faceTex.needsUpdate = true;
}

function paintAid(ctx, x, y, r, s) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  for (const a of [r, r + Math.PI / 2]) {
    ctx.save(); ctx.rotate(a);
    ctx.fillStyle = '#f1c27d'; rr(-14, -4.5, 28, 9, 4); ctx.fill(); ctx.strokeStyle = '#a0784a'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = '#e3a868'; ctx.fillRect(-4, -4, 8, 8);
    ctx.restore();
  }
  ctx.restore();
}

// Torso texture: 512 x 256 wrapped round the torso cylinder, front at the middle.
function paintTorso(p) {
  const c = p.def, m = p.marks, ctx = p.torsoCanvas.getContext('2d');
  g = ctx; ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = c.jacket || c.shirt; ctx.fillRect(0, 0, 512, 256);
  const cx = 256;
  if (c.jacket) {
    ctx.fillStyle = c.shirt; ctx.beginPath(); ctx.moveTo(cx - 46, 0); ctx.lineTo(cx, 140); ctx.lineTo(cx + 46, 0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = shade(c.jacket, 0.55); ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(cx - 46, 0); ctx.lineTo(cx - 14, 110); ctx.moveTo(cx + 46, 0); ctx.lineTo(cx + 14, 110); ctx.stroke();
    ctx.fillStyle = '#111'; circ(cx, 175, 5); ctx.fill(); circ(cx, 215, 5); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(cx + 70, 60); ctx.lineTo(cx + 104, 60); ctx.lineTo(cx + 96, 74); ctx.lineTo(cx + 78, 74); ctx.fill();
  } else {
    ctx.fillStyle = shade(c.shirt, 0.88);
    ctx.beginPath(); ctx.moveTo(cx - 34, 0); ctx.lineTo(cx, 24); ctx.lineTo(cx - 8, 36); ctx.lineTo(cx - 40, 12); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx + 34, 0); ctx.lineTo(cx, 24); ctx.lineTo(cx + 8, 36); ctx.lineTo(cx + 40, 12); ctx.fill();
    ctx.fillStyle = '#fff'; for (let y = 60; y < 256; y += 46) { circ(cx, y, 4); ctx.fill(); }
    ctx.fillStyle = shade(c.shirt, 0.8); ctx.fillRect(cx + 60, 70, 46, 50);
  }
  if (c.tie) {
    const end = m.tieCut ? 70 : 210;
    ctx.fillStyle = c.tie; ctx.strokeStyle = '#1b1b1b'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx - 14, 4); ctx.lineTo(cx + 14, 4); ctx.lineTo(cx + 10, 26); ctx.lineTo(cx - 10, 26); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - 10, 26); ctx.lineTo(cx + 10, 26); ctx.lineTo(cx + 22, end);
    if (m.tieCut) { for (let k = 0; k < 4; k++) ctx.lineTo(cx + 22 - (k + 1) * 11, end + (k % 2 ? -8 : 6)); }
    else ctx.lineTo(cx, end + 20);
    ctx.lineTo(cx - 22, end); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 6;
    for (let y = 50; y < end; y += 36) { ctx.beginPath(); ctx.moveTo(cx - 14, y); ctx.lineTo(cx + 14, y + 16); ctx.stroke(); }
  }
  if (c.pearls) {
    ctx.fillStyle = '#fafafa'; ctx.strokeStyle = '#aaa'; ctx.lineWidth = 1;
    for (let k = 0; k <= 12; k++) { const a = Math.PI * (0.1 + 0.067 * k); circ(cx + Math.cos(a) * 48, -10 + Math.sin(a) * 48, 6); ctx.fill(); ctx.stroke(); }
  }
  ctx.fillStyle = 'rgba(105,58,22,.85)';
  for (const s of m.coffee) {
    ell(s.x, s.y, s.r, s.r * 0.8, s.a); ctx.fill();
    for (let k = 0; k < 3; k++) { ell(s.x + Math.cos(s.a + k * 2) * s.r * 1.2, s.y + Math.sin(s.a + k * 2) * s.r, s.r * 0.3, s.r * 0.25); ctx.fill(); }
    ctx.fillRect(s.x - 3, s.y, 6, s.r * 2.2);
  }
  for (const b of m.bodyAids) paintAid(ctx, b.x, b.y, b.r, 2.2);
  p.torsoTex.needsUpdate = true;
}

function buildPerson(i) {
  const def = CHARS[i];
  const p = {
    i, def, hp: def.hp, ko: false, koT: 0, enterT: 1, exitT: -1,
    expr: 'neutral', exprT: 0, blinkT: rand(1, 4), look: 0, faceKey: '', torsoKey: '',
    s: { roll: 0, vroll: 0, lean: 0, vlean: 0, side: 0, vside: 0, back: 0, vback: 0 },
    marks: { blackEye: false, bruise: false, punches: 0, slap: 0, faceAids: [], bodyAids: [], coffee: [], bump: 0, toupeeLost: false,
      broken: false, toothGone: false, tieCut: false, messy: false, smoke: 0, steam: 0 },
  };
  const skin = def.skin, cloth = def.jacket || def.shirt;
  p.root = new THREE.Group(); p.root.position.set(0, 0, -0.95);
  p.koPivot = new THREE.Group(); p.koPivot.position.set(0, 0, -0.32); p.root.add(p.koPivot);
  p.inner = new THREE.Group(); p.inner.position.set(0, 0, 0.32); p.koPivot.add(p.inner);
  p.wobble = new THREE.Group(); p.wobble.position.set(0, 0.5, 0); p.inner.add(p.wobble);
  p.body = new THREE.Group(); p.body.position.set(0, -0.5, 0); p.wobble.add(p.body);

  // office chair
  const chairC = '#2d2d3a';
  p.inner.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.34, 10), '#444', 0, 0.25, 0));
  for (let k = 0; k < 5; k++) {
    const a = k / 5 * Math.PI * 2, leg = box(0.05, 0.035, 0.3, '#333', Math.sin(a) * 0.15, 0.06, Math.cos(a) * 0.15);
    leg.rotation.y = a; p.inner.add(leg); p.inner.add(ball(0.03, '#111', Math.sin(a) * 0.29, 0.03, Math.cos(a) * 0.29));
  }
  p.body.add(outl(box(0.5, 0.08, 0.48, chairC, 0, 0.46, 0.0), 1.03));
  const back = outl(mesh(new THREE.CapsuleGeometry(0.25, 0.42, 6, 16), chairC, 0, 1.05, -0.27), 1.03);
  back.scale.set(1.05, 1, 0.28); p.body.add(back);
  p.body.add(box(0.06, 0.4, 0.05, '#333', 0, 0.68, -0.26));

  // legs (hip -> knee -> foot), hidden under the desk until he's knocked over
  p.knees = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(s * 0.1, 0.52, 0.02); p.inner.add(hip);
    const thigh = outl(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.42, 12), '#3a3d4a', 0, 0, 0.21), 1.08); thigh.rotation.x = Math.PI / 2; hip.add(thigh);
    const knee = new THREE.Group(); knee.position.set(0, 0, 0.42); hip.add(knee);
    knee.add(ball(0.07, '#3a3d4a', 0, 0, 0));
    knee.add(outl(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.42, 12), '#3a3d4a', 0, -0.21, 0), 1.08));
    knee.add(box(0.12, 0.04, 0.05, '#ffffff', 0, -0.42, 0));
    knee.add(outl(box(0.12, 0.08, 0.24, '#151515', 0, -0.47, 0.06), 1.05));
    p.knees.push(knee);
  }

  // torso
  p.torsoCanvas = document.createElement('canvas'); p.torsoCanvas.width = 512; p.torsoCanvas.height = 256;
  p.torsoTex = new THREE.CanvasTexture(p.torsoCanvas); p.torsoTex.colorSpace = THREE.SRGBColorSpace;
  const torso = outl(mesh(new THREE.CylinderGeometry(0.19, 0.23, 0.62, 32, 1, false, Math.PI),
    new THREE.MeshToonMaterial({ map: p.torsoTex, gradientMap: GRAD }), 0, 0.86, 0), 1.04);
  torso.scale.z = 0.62; p.body.add(torso);
  const shoulders = outl(ball(0.2, cloth, 0, 1.16, -0.005, 1.06, 0.36, 0.6), 1.04); p.body.add(shoulders);
  p.body.add(mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.16, 14), shade(skin, 0.92), 0, 1.25, 0));
  if (def.tie) p.body.add(box(0.045, 0.035, 0.02, def.tie, 0, 1.19, 0.1));

  // arms resting on the desk
  for (const s of [-1, 1]) {
    const sh = new V3(s * 0.21, 1.12, 0.0), el = new V3(s * 0.3, 0.88, 0.2), hd = new V3(s * 0.19, 0.81, 0.48);
    p.body.add(ball(0.065, cloth, sh.x, sh.y, sh.z), limb(0.06, cloth, sh, el), ball(0.06, cloth, el.x, el.y, el.z), limb(0.055, cloth, el, hd));
    p.body.add(outl(ball(0.05, skin, hd.x, hd.y, hd.z + 0.03, 1, 0.65, 1.25), 1.1));
  }

  // head
  p.head = new THREE.Group(); p.head.position.set(0, 1.44, 0.0); p.body.add(p.head);
  p.faceCanvas = document.createElement('canvas'); p.faceCanvas.width = FACE_W; p.faceCanvas.height = FACE_H;
  p.faceTex = new THREE.CanvasTexture(p.faceCanvas); p.faceTex.colorSpace = THREE.SRGBColorSpace; p.faceTex.anisotropy = 4;
  p.headMesh = outl(mesh(new THREE.SphereGeometry(0.17, 48, 32), new THREE.MeshToonMaterial({ map: p.faceTex, gradientMap: GRAD })), 1.04);
  p.headMesh.scale.set(1, 1.12, 1.02); p.head.add(p.headMesh);
  for (const s of [-1, 1]) {
    p.head.add(outl(ball(0.042, skin, s * 0.168, 0.0, -0.01, 0.55, 1, 0.9), 1.1));
    if (def.pearls) p.head.add(ball(0.014, '#ffd54f', s * 0.17, -0.055, 0.0));
  }
  p.nose = outl(ball(0.032, shade(skin, 0.95), 0, -0.02, 0.176), 1.1); p.head.add(p.nose);

  const hairM = def.hairColor;
  if (def.hair === 'combover' || def.hair === 'bun') {
    const cap = outl(mesh(new THREE.SphereGeometry(0.178, 40, 20, 0, Math.PI * 2, 0, 1.2), hairM), 1.03);
    cap.scale.set(1.02, 1.13, 1.05); cap.rotation.x = -0.32; if (def.hair === 'combover') cap.rotation.z = -0.12;
    p.head.add(cap); p.toupee = cap;
    if (def.hair === 'combover') {
      for (const s of [-1, 1]) p.head.add(ball(0.05, hairM, s * 0.155, -0.01, -0.04, 0.6, 1.3, 1));
      p.strands = [];
      for (let k = 0; k < 3; k++) {
        const st = mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.09, 4), hairM, (k - 1) * 0.025, 0.225, 0.03);
        st.rotation.z = (k - 1) * 0.5; st.visible = false; p.head.add(st); p.strands.push(st);
      }
    } else {
      p.head.add(outl(ball(0.08, hairM, 0, 0.17, -0.12), 1.06));
      const pencil = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.24, 6), '#ffd400', 0, 0.18, -0.12); pencil.rotation.z = 1.1; p.head.add(pencil);
      p.spikes = [];
      for (let k = 0; k < 9; k++) {
        const a = k / 9 * Math.PI * 2, sp = mesh(new THREE.ConeGeometry(0.025, 0.12, 6), hairM, Math.cos(a) * 0.18, 0.1 + Math.sin(a * 2) * 0.05, Math.sin(a) * 0.16 - 0.03);
        sp.lookAt(sp.position.clone().multiplyScalar(3)); sp.rotateX(Math.PI / 2); sp.visible = false; p.head.add(sp); p.spikes.push(sp);
      }
    }
  } else {
    for (const s of [-1, 1]) p.head.add(outl(ball(0.05, hairM, s * 0.158, -0.02, -0.05, 0.6, 1.3, 1.2), 1.08));
    const shine = new THREE.Mesh(new THREE.CircleGeometry(0.04, 16), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 }));
    shine.position.set(-0.05, 0.17, 0.08); shine.lookAt(new V3(-0.3, 1.2, 0.6)); shine.scale.set(1.3, 0.6, 1); shine.raycast = noRay; p.head.add(shine);
  }
  p.bumps = [];
  [[0.04, 0.2, 0.05], [-0.07, 0.19, 0.04], [0.09, 0.16, -0.05]].forEach(([x, y, z]) => {
    const b = outl(ball(0.04, skin, x, y, z), 1.1); b.visible = false; p.head.add(b); p.bumps.push(b);
  });
  p.root.traverse(o => { if (o.isMesh) o.userData.person = true; });
  paintFace(p); paintTorso(p);
  scene.add(p.root);
  return p;
}

function disposePerson(p) {
  scene.remove(p.root);
  p.faceTex.dispose(); p.torsoTex.dispose();
}

// ---------- Weapons (first person) ----------

const W = {};
function buildWeapons() {
  const skin = '#f0b48a', sleeve = '#2f4f7f';
  // stretchy cartoon fist
  W.fist = new THREE.Group();
  W.fist.add(outl(ball(0.075, skin, 0, 0, 0, 1, 0.85, 1.15), 1.08));
  for (let k = 0; k < 4; k++) W.fist.add(ball(0.022, skin, -0.045 + k * 0.03, 0.025, 0.07));
  W.fist.add(ball(0.03, skin, 0.07, -0.01, 0.03));
  W.arm = limb(0.055, sleeve, new V3(0, 0, 0), new V3(0, 1, 0));
  // open hand for slaps
  W.hand = new THREE.Group();
  W.hand.add(outl(box(0.035, 0.13, 0.11, skin), 1.08));
  for (let k = 0; k < 4; k++) W.hand.add(outl(mesh(new THREE.CapsuleGeometry(0.014, 0.06, 4, 8), skin, 0, 0.1, -0.04 + k * 0.026), 1.1));
  const th = outl(mesh(new THREE.CapsuleGeometry(0.016, 0.05, 4, 8), skin, 0, 0.0, 0.08), 1.1); th.rotation.x = 1.0; W.hand.add(th);
  // gun (barrel along +z so lookAt aims it)
  W.gun = new THREE.Group();
  const gm = new THREE.Group(); W.gun.add(gm);
  gm.add(outl(box(0.04, 0.05, 0.22, '#3b3b3b', 0, 0.02, 0.06), 1.05), box(0.042, 0.02, 0.2, '#555', 0, 0.05, 0.06));
  const grip = outl(box(0.036, 0.12, 0.055, '#6d4426', 0, -0.05, -0.03), 1.06); grip.rotation.x = -0.3; gm.add(grip);
  gm.add(box(0.01, 0.04, 0.04, '#222', 0, -0.02, 0.02));
  gm.add(outl(ball(0.05, skin, 0, -0.05, -0.04, 1, 1, 1.1), 1.08));
  gm.add(limb(0.05, sleeve, new V3(0, -0.06, -0.06), new V3(0.06, -0.3, -0.42)));
  const flashGeo = new THREE.ShapeGeometry((() => { const s = new THREE.Shape(); for (let i = 0; i < 20; i++) { const r = i % 2 ? 0.04 : 0.11, a = i * Math.PI / 10; s[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); } return s; })());
  W.flash = new THREE.Mesh(flashGeo, new THREE.MeshBasicMaterial({ color: '#fff3a0', side: THREE.DoubleSide }));
  W.flash.position.set(0, 0.02, 0.2); W.gun.add(W.flash);
  W.flash2 = new THREE.Mesh(flashGeo, new THREE.MeshBasicMaterial({ color: '#ff9a1f', side: THREE.DoubleSide }));
  W.flash2.scale.setScalar(0.55); W.flash2.position.set(0, 0.02, 0.205); W.gun.add(W.flash2);
  W.light = new THREE.PointLight(0xffcc66, 0, 4); W.light.position.set(0, 0.02, 0.3); W.gun.add(W.light);
  W.tracer = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1, 6), bm('#fff59d'));
  W.mug = makeMug(); W.stapler = makeStapler(); W.chair = makeChairProp(); W.chair.scale.setScalar(0.55);
  for (const k of ['fist', 'arm', 'hand', 'tracer', 'mug', 'stapler', 'chair']) { W[k].visible = false; scene.add(W[k]); }
  W.gun.visible = false; camera.add(W.gun);
  for (const k in W) if (W[k].traverse) W[k].traverse(o => { o.raycast = noRay; });
}
buildWeapons();

// ---------- Particles ----------

const STAR_GEO = new THREE.ShapeGeometry((() => { const s = new THREE.Shape(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.018 : 0.045, a = -Math.PI / 2 + i * Math.PI / 5; s[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); } return s; })());
const SMOKE_TEX = canvasTex(64, 64, c => { const gr = c.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, 64, 64); });
const PGEO = {
  paper: new THREE.PlaneGeometry(0.16, 0.21), drop: new THREE.SphereGeometry(0.018, 8, 6), chunk: new THREE.BoxGeometry(0.2, 0.04, 0.04),
  tooth: new THREE.BoxGeometry(0.02, 0.025, 0.015), shard: new THREE.TetrahedronGeometry(0.015),
};
const PMAT = {
  star: new THREE.MeshBasicMaterial({ color: '#ffd400', side: THREE.DoubleSide }), paper: new THREE.MeshToonMaterial({ color: '#ffffff', side: THREE.DoubleSide, gradientMap: GRAD }),
  drop: tm('#6e3e19'), chunk: tm('#8b5a2b'), tooth: bm('#ffffff'), shard: new THREE.MeshBasicMaterial({ color: '#d8f0ff' }),
};
const parts = [];
function addPart(obj, pos, vel, opt) {
  opt = opt || {};
  obj.position.copy(pos);
  if (opt.rot) obj.quaternion.copy(opt.rot);
  scene.add(obj);
  parts.push({ obj, v: vel, av: opt.av || new V3(rand(-12, 12), rand(-12, 12), rand(-12, 12)), life: opt.life || rand(0.7, 1.2), max: opt.life || 1,
    grav: opt.grav === undefined ? 9 : opt.grav, smoke: !!opt.smoke, bounce: opt.bounce !== false, s0: obj.scale.x, dispose: !!opt.dispose });
}
function burst(type, pos, n, speed, opt) {
  opt = opt || {};
  for (let k = 0; k < n; k++) {
    let obj;
    if (type === 'smoke') {
      obj = new THREE.Sprite(new THREE.SpriteMaterial({ map: SMOKE_TEX, color: opt.color || '#cfcfcf', transparent: true, depthWrite: false }));
      obj.scale.setScalar(opt.size || 0.08);
    } else if (type === 'star') { obj = new THREE.Mesh(STAR_GEO, PMAT.star); obj.scale.setScalar(rand(0.7, 1.3)); }
    else obj = new THREE.Mesh(PGEO[type], PMAT[type]);
    const dir = new V3(rand(-1, 1), rand(-0.3, 1), rand(-0.2, 1)).normalize();
    if (opt.dir) dir.add(opt.dir).normalize();
    const vel = dir.multiplyScalar(speed * rand(0.4, 1)); vel.y += opt.up || 0;
    addPart(obj, pos.clone().add(new V3(rand(-0.03, 0.03), rand(-0.03, 0.03), rand(-0.03, 0.03))), vel,
      { life: opt.life || rand(0.6, 1.2), grav: opt.grav, smoke: type === 'smoke', bounce: type !== 'smoke' && type !== 'star', dispose: type === 'smoke' });
  }
}
function flingObject(obj, pos, vel, life) {
  addPart(obj, pos, vel, { life: life || 1.6, grav: 9, av: new V3(rand(-14, 14), rand(-8, 8), rand(-14, 14)) });
}
function updateParts(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const q = parts[i];
    q.life -= dt;
    if (q.life <= 0) {
      scene.remove(q.obj); if (q.dispose) q.obj.material.dispose();
      parts.splice(i, 1); continue;
    }
    q.v.y -= q.grav * dt;
    q.obj.position.addScaledVector(q.v, dt);
    if (!q.smoke) { q.obj.rotation.x += q.av.x * dt; q.obj.rotation.y += q.av.y * dt; q.obj.rotation.z += q.av.z * dt; }
    if (q.bounce && q.obj.position.y < 0.02) { q.obj.position.y = 0.02; q.v.y = Math.abs(q.v.y) * 0.3; q.v.x *= 0.6; q.v.z *= 0.6; q.av.multiplyScalar(0.5); }
    const f = q.life / q.max;
    if (q.smoke) { q.obj.material.opacity = f * 0.8; q.obj.scale.setScalar(q.s0 * (1 + (1 - f) * 3)); }
    else if (f < 0.25) q.obj.scale.setScalar(q.s0 * f / 0.25);
  }
}

// ---------- Comic words (DOM, over the 3D view) ----------

const fxLayer = document.getElementById('fx-layer');
const flashEl = document.getElementById('flash');
(() => {
  const pts = [];
  for (let i = 0; i < 24; i++) { const r = i % 2 ? 34 : 50, a = -Math.PI / 2 + i * Math.PI / 12; pts.push((50 + Math.cos(a) * r).toFixed(1) + '% ' + (50 + Math.sin(a) * r).toFixed(1) + '%'); }
  document.documentElement.style.setProperty('--star', 'polygon(' + pts.join(',') + ')');
})();
function toScreen(v) {
  const p = v.clone().project(camera);
  return { x: (p.x + 1) / 2 * view.w, y: (1 - p.y) / 2 * view.h };
}
function word(text, at, opt) {
  opt = opt || {};
  const pt = at.isVector3 ? toScreen(at) : at;
  const el = document.createElement('div');
  el.className = 'word' + (opt.burst ? ' burst' : '');
  el.textContent = text;
  const life = opt.life || 1.1;
  el.style.cssText = 'left:' + clamp(pt.x + (opt.dx || 0), 40, view.w - 40) + 'px;top:' + clamp(pt.y + (opt.dy || 0), 24, view.h - 20) + 'px;font-size:' + (opt.size || 30) + 'px;' +
    '--c:' + (opt.color || '#e8202a') + ';--rot:' + (opt.rot !== undefined ? opt.rot : rand(-14, 14)) + 'deg;--life:' + life + 's;--rise:' + (opt.rise || 20) + 'px;' + (opt.bg ? '--bg:' + opt.bg + ';' : '');
  fxLayer.appendChild(el);
  setTimeout(() => el.remove(), life * 1000 + 50);
}

// ---------- State ----------

let person, game, anim = null, ui = { state: 'title' }, lastTap = 0, oldPerson = null;
const fx = { shake: 0, flash: 0 };
const koStars = [];
for (let k = 0; k < 4; k++) { const s = new THREE.Mesh(STAR_GEO, PMAT.star); s.scale.setScalar(1.3); s.visible = false; scene.add(s); koStars.push(s); }

function resetGame() {
  game = { q: 0, hire: 50, chaos: 0, kos: 0, streak: 0, used: new Set(),
    stats: { hits: 0, shots: 0, coffee: 0, slaps: 0, flips: 0, talk: 0 } };
  if (person) disposePerson(person);
  if (oldPerson) { disposePerson(oldPerson); oldPerson = null; }
  person = buildPerson(0);
  setPlate();
  desk.items.visible = true; desk.t = -1; desk.pivot.rotation.x = 0;
  anim = null;
  for (const k of ['fist', 'arm', 'hand', 'tracer', 'mug', 'stapler', 'chair', 'gun']) W[k].visible = false;
}
function setPlate() {
  desk.plateTex.dispose(); desk.plateTex = paintPlate(person.def.plate);
  desk.plate.material[4].map = desk.plateTex; desk.plate.material[4].needsUpdate = true;
}

const headPos = () => person.headMesh.getWorldPosition(new V3());
const camLocal = (x, y, z) => camera.localToWorld(new V3(x, y, z));

// ---------- Main loop ----------

let view = { w: 1, h: 1 };
function resize() {
  const r = cvs.getBoundingClientRect();
  view = { w: Math.max(1, r.width), h: Math.max(1, r.height) };
  renderer.setSize(view.w, view.h, false);
  camera.aspect = view.w / view.h;
  const hfov = 54 * Math.PI / 180;
  camera.fov = clamp(2 * Math.atan(Math.tan(hfov / 2) / camera.aspect) * 180 / Math.PI, 42, 80);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

let lastT = performance.now(), clock = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now; clock += dt;
  update(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

function baseExpr() {
  if (ui.state === 'title') return 'smug';
  const f = person.hp / person.def.hp;
  if (f < 0.35) return 'hurt';
  if (f < 0.75) return 'angry';
  return 'neutral';
}

function updatePerson(p, dt) {
  p.blinkT -= dt; if (p.blinkT < 0) p.blinkT = rand(2, 5);
  p.look = Math.round(Math.sin(clock * 0.7) * 2) / 3;
  if (p.exprT > 0) { p.exprT -= dt; if (p.exprT <= 0 && !p.ko) p.expr = baseExpr(); }
  const s = p.s;
  for (const [k, v] of [['roll', 'vroll'], ['lean', 'vlean'], ['side', 'vside'], ['back', 'vback']]) {
    s[v] += (-s[k] * 70 - s[v] * 8) * dt; s[k] += s[v] * dt;
  }
  p.wobble.rotation.set(s.lean, 0, s.roll);
  p.wobble.position.set(s.side, 0.5, s.back);
  p.head.rotation.set(s.lean * 0.35 + (p.ko ? 0 : Math.sin(clock * 1.3) * 0.03), Math.sin(clock * 0.6) * 0.08, s.roll * 0.6);
  p.head.position.y = 1.44 + Math.sin(clock * 2.2) * 0.004;

  if (p.enterT < 1) {
    p.enterT = Math.min(1, p.enterT + dt / 1.1);
    p.root.position.x = 2.9 * (1 - easeOut(p.enterT));
    p.root.rotation.y = Math.sin(p.enterT * 30) * 0.08 * (1 - p.enterT);
  }
  if (p.exitT >= 0) { p.exitT += dt; p.root.position.x = -3.5 * easeOut(Math.min(1, p.exitT / 0.9)); }
  if (p.ko) {
    p.koT = Math.min(1, p.koT + dt / 0.7);
    const e = easeOut(p.koT);
    p.koPivot.rotation.x = -1.42 * e;
    p.knees.forEach((k, i) => { k.rotation.x = -Math.PI / 2 * e + (p.koT >= 1 ? Math.sin(clock * 9 + i * 2) * 0.25 : 0); });
  }
  // repaint face/torso only when something changed
  const blink = p.blinkT < 0.12 ? 1 : 0;
  const fk = p.expr + blink + p.look + JSON.stringify(p.marks.faceAids.length) + [p.marks.blackEye, p.marks.bruise, p.marks.slap, p.marks.broken, p.marks.toothGone].join();
  if (fk !== p.faceKey) { p.faceKey = fk; paintFace(p); }
  const tk = p.marks.coffee.length + ',' + p.marks.bodyAids.length + ',' + p.marks.tieCut;
  if (tk !== p.torsoKey) { p.torsoKey = tk; paintTorso(p); }
}

function update(dt) {
  updatePerson(person, dt);
  if (oldPerson) { updatePerson(oldPerson, dt); if (oldPerson.exitT > 1) { disposePerson(oldPerson); oldPerson = null; } }
  const m = person.marks;
  if (m.smoke > 0) { m.smoke -= dt; if (Math.random() < 0.25) burst('smoke', headPos().add(new V3(rand(-0.1, 0.1), 0.12, 0.05)), 1, 0.15, { grav: -0.4, life: 1, size: 0.06 }); }
  if (m.steam > 0) { m.steam -= dt; if (Math.random() < 0.2) burst('smoke', headPos().add(new V3(rand(-0.15, 0.15), rand(-0.35, 0), 0.12)), 1, 0.1, { grav: -0.5, life: 0.9, size: 0.05, color: '#ffffff' }); }

  // KO stars round the head of whoever's lying on the floor
  const kp = person.ko ? person : null;
  koStars.forEach((s, k) => {
    s.visible = !!kp && kp.koT > 0.6;
    if (s.visible) {
      const h = headPos(), a = clock * 3 + k * Math.PI / 2;
      s.position.set(h.x + Math.cos(a) * 0.2, h.y + 0.22 + Math.sin(a * 2) * 0.02, h.z + Math.sin(a) * 0.12);
      s.lookAt(camera.position);
    }
  });

  if (desk.t >= 0) {
    desk.t += dt;
    const f = desk.t / 1.2;
    const lift = f < 0.25 ? easeOut(f / 0.25) : f < 1 ? Math.max(0, 1 - easeOut((f - 0.25) / 0.75)) : 0;
    desk.pivot.rotation.x = -1.25 * lift;
    desk.pivot.position.y = 0.76 + Math.sin(lift * Math.PI) * 0.12;
    if (f >= 1) { desk.t = -1; desk.pivot.rotation.x = 0; desk.pivot.position.y = 0.76; }
  }
  room.hands[0].rotation.z = -clock * 0.05; room.hands[1].rotation.z = -clock * 0.6;

  // camera: tiny idle sway plus shake
  fx.shake = Math.max(0, fx.shake - dt * 30);
  camera.position.copy(CAM_POS);
  camera.position.x += Math.sin(clock * 0.4) * 0.015 + (fx.shake ? rand(-1, 1) * fx.shake * 0.003 : 0);
  camera.position.y += Math.sin(clock * 0.55) * 0.008 + (fx.shake ? rand(-1, 1) * fx.shake * 0.003 : 0);
  camera.lookAt(CAM_LOOK);
  camera.updateMatrixWorld();

  if (anim) {
    const before = anim.t;
    anim.t += dt;
    animate(anim, clamp(anim.t / anim.dur, 0, 1));
    if (!anim.hit && anim.t >= anim.dur * anim.impact) { anim.hit = true; anim.onImpact(); }
    if (anim.t >= anim.dur && before < anim.dur) { finishAnim(anim); const done = anim.onDone; anim = null; if (done) done(); }
  }
  fx.flash = Math.max(0, fx.flash - dt * 4);
  flashEl.style.opacity = fx.flash * 0.7;
  updateParts(dt);
}

// ---------- Attack animations ----------

function animate(a, f) {
  if (a.t < 0) return;
  const head = headPos(), towardCam = camera.position.clone().sub(head).normalize();
  if (a.type === 'punch') {
    const k = f < 0.45 ? easeOut(f / 0.45) : 1 - easeOut((f - 0.45) / 0.55);
    const S = camLocal(0.14, -0.3, -0.35), T = head.clone().addScaledVector(towardCam, 0.2);
    const pos = S.lerp(T, k);
    W.fist.visible = W.arm.visible = true;
    W.fist.position.copy(pos); W.fist.lookAt(head);
    setLimb(W.arm, camLocal(0.3, -0.7, -0.1), pos);
  } else if (a.type === 'slap') {
    const R = head.clone().add(new V3(0.2, 0.0, 0.12)), L = head.clone().add(new V3(-0.35, -0.05, 0.12));
    const pos = f < 0.4 ? camLocal(0.55, 0.05, -0.55).lerp(R, easeOut(f / 0.4)) : R.clone().lerp(L, easeOut((f - 0.4) / 0.6));
    W.hand.visible = W.arm.visible = f < 0.85;
    W.hand.position.copy(pos); W.hand.rotation.set(0, 0, -0.3);
    setLimb(W.arm, camLocal(0.4, -0.7, -0.1), pos.clone().add(new V3(0.0, -0.08, 0)));
  } else if (a.type === 'gun') {
    const rise = f < 0.25 ? easeOut(f / 0.25) : f > 0.82 ? 1 - (f - 0.82) / 0.18 : 1;
    const recoil = (f > 0.38 && f < 0.56) ? Math.sin((f - 0.38) / 0.18 * Math.PI) : 0;
    W.gun.visible = true;
    W.gun.position.set(lerp(0.22, 0.13, rise), lerp(-0.55, -0.17, rise) + recoil * 0.02, -0.42 + recoil * 0.04);
    W.gun.lookAt(head); W.gun.rotateX(-recoil * 0.5);
    const firing = f > 0.38 && f < 0.47;
    W.flash.visible = W.flash2.visible = firing; W.flash.rotation.z = f * 30;
    W.light.intensity = firing ? 6 : 0;
    W.tracer.visible = f > 0.38 && f < 0.42;
    if (W.tracer.visible) setLimb(W.tracer, W.flash.getWorldPosition(new V3()), head.clone().addScaledVector(towardCam, 0.1));
  } else if (a.type === 'coffee' || a.type === 'stapler' || a.type === 'chair') {
    const o = W[a.type === 'coffee' ? 'mug' : a.type];
    if (f < a.impact) {
      const k = f / a.impact;
      const S = camLocal(0.05, -0.22, -0.4), T = head.clone().addScaledVector(towardCam, a.type === 'chair' ? 0.12 : 0.08).add(new V3(0, a.type === 'chair' ? 0.15 : 0.02, 0));
      o.visible = true;
      o.position.copy(S.lerp(T, k)); o.position.y += Math.sin(k * Math.PI) * 0.3;
      o.rotation.set(k * 9, k * 4, a.type === 'chair' ? k * 3 : 0);
    } else o.visible = false;
  }
}
function finishAnim() {
  for (const k of ['fist', 'arm', 'hand', 'tracer', 'mug', 'stapler', 'chair', 'gun']) W[k].visible = false;
  W.light.intensity = 0;
}

// ---------- Hits ----------

function impulse(side, lean, roll, back) { const s = person.s; s.vside += side || 0; s.vlean += lean || 0; s.vroll += roll || 0; s.vback += back || 0; }
function setExpr(e, t) { person.expr = e; person.exprT = t || 1.4; }
const FACE_SPOTS = [[-28, 16], [26, 20], [-6, -26], [12, 42], [30, -4], [-30, 34]];

function applyHit(w, mult) {
  const p = person, m = p.marks, head = headPos(), toCam = camera.position.clone().sub(head).normalize();
  const dmg = Math.round(ACTIONS[w].dmg * mult);
  p.hp = Math.max(0, p.hp - dmg);
  game.stats.hits++;
  setExpr('hurt', 1.6);
  word(ACTIONS[w].word, head, { burst: true, size: 30, dx: rand(-40, 40), dy: -60 });
  word('-' + dmg, head, { size: 20, color: '#fff', life: 0.9, rot: 0, rise: 40, dx: 80, dy: 10 });
  fx.shake = 8; buzz(w === 'gun' || w === 'desk' ? 120 : 60);
  SFX[w]();
  const front = head.clone().addScaledVector(toCam, 0.15);
  switch (w) {
    case 'gun':
      game.stats.shots++; fx.flash = 1; fx.shake = 14;
      impulse(rand(-0.6, 0.6), -7, rand(-3, 3), -1.2);
      if (Math.random() < 0.6) { const sp = pick(FACE_SPOTS); m.faceAids.push({ x: sp[0] + rand(-4, 4), y: sp[1] + rand(-4, 4), r: rand(-0.6, 0.6) }); }
      else m.bodyAids.push({ x: 256 + rand(-90, 90), y: rand(60, 200), r: rand(-0.6, 0.6) });
      m.smoke = 1.5; burst('star', front, 8, 2.2); burst('smoke', front, 6, 0.4, { grav: -0.3, life: 1.2, size: 0.12 });
      if (!m.broken && (p.def.glasses || p.def.monocle) && Math.random() < 0.6) breakGlasses(front);
      break;
    case 'punch':
      m.punches++; impulse(rand(-0.5, 0.5), -3, Math.random() < 0.5 ? -7 : 7, -0.4);
      if (!m.blackEye) m.blackEye = true; else if (!m.bruise) m.bruise = true;
      else if (!m.toothGone) { m.toothGone = true; burst('tooth', front, 1, 2.5, { up: 2, life: 1.6 }); }
      if (m.punches >= 2) { p.nose.material = tm('#e0524a'); p.nose.scale.setScalar(1.3); }
      if (m.punches >= 2 && p.def.glasses && !m.broken) breakGlasses(front);
      burst('star', front, 10, 2.5);
      break;
    case 'slap':
      m.slap++; game.stats.slaps++; impulse(-1.2, 0, 8);
      burst('star', front.clone().add(new V3(-0.12, 0, 0)), 5, 1.6);
      break;
    case 'coffee':
      game.stats.coffee++; impulse(0, -3, rand(-4, 4));
      for (let k = 0; k < 3; k++) m.coffee.push({ x: 256 + rand(-110, 110), y: rand(20, 220), r: rand(14, 26), a: rand(0, 3) });
      m.steam = 3; burst('drop', front, 28, 2.6, { up: 1 });
      flingObject(makeMug(), front, new V3(rand(-1, 1), 3, 1.2));
      break;
    case 'stapler':
      m.bump = Math.min(3, m.bump + 1); impulse(0, 4, rand(-4, 4));
      burst('star', head.clone().add(new V3(0, 0.2, 0)), 8, 1.8);
      flingObject(makeStapler(), head.clone().add(new V3(0, 0.25, 0.1)), new V3(rand(-1, 1), 3.5, 1.2));
      break;
    case 'desk':
      game.stats.flips++; m.tieCut = true; impulse(0, -6, rand(-5, 5), -1); fx.shake = 16;
      desk.t = 0; desk.items.visible = false;
      burst('paper', new V3(-0.4, 0.85, -0.2), 14, 2.5, { up: 2.5, life: 2, grav: 3 });
      flingObject(makeMug(), new V3(0.48, 0.85, -0.1), new V3(1, 3, 0.8));
      flingObject(makeStapler(), new V3(-0.3, 0.85, -0.05), new V3(-1, 3, 0.8));
      break;
    case 'chair':
      m.bump = Math.min(3, m.bump + 1);
      m.faceAids.push({ x: rand(-10, 10), y: -26, r: rand(-0.5, 0.5) });
      impulse(0.8, 4, 7); fx.shake = 12;
      burst('chunk', head.clone().add(new V3(0, 0.2, 0.1)), 14, 2.8, { up: 1.5, life: 1.6 });
      burst('star', head.clone().add(new V3(0, 0.2, 0)), 8, 2);
      break;
  }
  p.bumps.forEach((b, k) => { b.visible = k < m.bump; b.scale.setScalar(1 + k * 0.15); });
  if (p.def.hair === 'combover' && !m.toupeeLost && p.hp / p.def.hp < 0.55) {
    m.toupeeLost = true;
    const tp = p.toupee, pos = tp.getWorldPosition(new V3()), q = tp.getWorldQuaternion(new THREE.Quaternion()), sc = tp.getWorldScale(new V3());
    p.head.remove(tp); tp.scale.copy(sc); tp.quaternion.copy(q);
    addPart(tp, pos, new V3(rand(-0.8, 0.8), 4.2, 1.2), { life: 2.2, grav: 7, av: new V3(rand(-6, 6), 12, rand(-6, 6)), rot: q });
    p.strands.forEach(s => { s.visible = true; });
    word('TOUPEE!', head, { size: 18, color: '#ffd400', life: 1.4, dy: -110 });
  }
  if (p.def.hair === 'bun' && !m.messy && p.hp / p.def.hp < 0.6) { m.messy = true; p.spikes.forEach(s => { s.visible = true; }); }
  renderHud();
}

function breakGlasses(at) {
  const p = person;
  p.marks.broken = true;
  burst('shard', at, 10, 2.2, { up: 1 });
  if (p.def.monocle) {
    const mono = mesh(new THREE.TorusGeometry(0.04, 0.008, 8, 20), '#d4ac0d');
    flingObject(mono, at, new V3(1.2, 3, 1));
  }
}

// ---------- UI ----------

const $ = id => document.getElementById(id);
const elWho = $('who'), elLine = $('line'), elAns = $('answers');
let typer = null;

function say(who, text, isYou) {
  elWho.textContent = who; elWho.className = isYou ? 'you' : '';
  clearInterval(typer);
  let i = 0;
  elLine.textContent = '';
  typer = setInterval(() => {
    i += 2; elLine.textContent = text.slice(0, i);
    if (i >= text.length) clearInterval(typer);
  }, 28);
  elLine.dataset.full = text;
}
$('speech').addEventListener('click', () => { clearInterval(typer); if (elLine.dataset.full) elLine.textContent = elLine.dataset.full; });

function fmt(s) { return s.replace(/\{o\}/g, person.def.o).replace(/\{p\}/g, person.def.p); }

function renderHud() {
  const p = person;
  $('hud-name').textContent = p.def.name;
  $('hud-title').textContent = p.def.title;
  $('hp-fill').style.width = (p.hp / p.def.hp * 100) + '%';
  $('hire-fill').style.width = game.hire + '%';
  $('hire-num').textContent = Math.round(game.hire) + '%';
  $('hud-q').textContent = 'Q ' + Math.min(game.q + 1, MAX_Q) + '/' + MAX_Q;
  $('hud-chaos').textContent = 'Chaos ' + game.chaos;
}

function setButtons(list) {
  elAns.innerHTML = '';
  for (const b of list) {
    const el = document.createElement('button');
    el.textContent = b.text; el.className = b.cls || '';
    el.addEventListener('click', () => { SFX.click(); lockButtons(); b.fn(); });
    elAns.appendChild(el);
  }
}
function lockButtons() { for (const b of elAns.querySelectorAll('button')) b.disabled = true; }
function nextButton(label, fn) { setButtons([{ text: label, cls: 'next', fn }]); }

function changeHire(d) {
  game.hire = clamp(game.hire + d, 0, 100);
  if (d) word((d > 0 ? '+' : '') + d + '% HIRE', { x: view.w / 2, y: 40 }, { size: 18, color: d > 0 ? '#2ecc71' : '#ff5a5a', life: 1.2, rot: 0, rise: 30 });
  renderHud();
}

function askNext() {
  if (game.q >= MAX_Q) return endGame();
  ui.state = 'asking';
  desk.items.visible = true;
  let pool = QUESTIONS.map((_, i) => i).filter(i => !game.used.has(i));
  if (!pool.length) { game.used.clear(); pool = QUESTIONS.map((_, i) => i); }
  const qi = pick(pool); game.used.add(qi);
  const Q = QUESTIONS[qi];
  renderHud();
  person.expr = baseExpr();
  say(person.def.name, Q.q);

  const talk = shuffle(Q.a.slice()).slice(0, 2).map(a => ({ text: a[0], fn: () => answerTalk(a) }));
  const acts = [];
  if (Q.v) for (const [w, t] of Q.v) acts.push({ w, text: fmt(t) });
  let others = shuffle(HIT_ORDER.filter(w => !acts.some(a => a.w === w)));
  // The gun is the headline act, so it turns up more often than the rest.
  if (others.includes('gun') && Math.random() < 0.55) others = ['gun'].concat(others.filter(w => w !== 'gun'));
  while (acts.length < 2) { const w = others.shift(); acts.push({ w, text: fmt(ACTIONS[w].label) }); }
  const actBtns = acts.slice(0, 2).map(a => ({ text: a.text, cls: 'act' + (a.w === 'gun' ? ' gun' : ''), fn: () => answerAct(a.w, a.text) }));
  setButtons(shuffle(talk.concat(actBtns)));
}

function answerTalk(a) {
  game.stats.talk++; game.streak = 0;
  say('You', a[0], true);
  setTimeout(() => {
    const d = a[1];
    setExpr(d >= 8 ? 'happy' : d < 0 ? 'angry' : 'smug', 2.5);
    say(person.def.name, a[2]);
    changeHire(d);
    if (d > 0) SFX.good(); else if (d < 0) SFX.bad();
    game.q++;
    nextButton(game.q >= MAX_Q ? 'See the result ▶' : 'Next question ▶', askNext);
  }, 900);
}

const ANIM_DUR = { gun: 1.3, punch: 0.6, slap: 0.55, coffee: 0.9, stapler: 0.8, desk: 0.5, chair: 0.9 };
const ANIM_HIT = { gun: 0.4, punch: 0.45, slap: 0.4, coffee: 0.55, stapler: 0.55, desk: 0.1, chair: 0.55 };

function answerAct(w, text) {
  ui.state = 'busy';
  game.streak++;
  const mult = 1 + Math.min(game.streak - 1, 4) * 0.15;
  say('You', text.replace(/^\S+\s/, ''), true);
  setExpr('shocked', 3);
  if (w !== 'gun' && w !== 'desk') setTimeout(SFX.whoosh, 30);
  anim = { type: w, t: -0.35, dur: ANIM_DUR[w], impact: ANIM_HIT[w], hit: false,
    onImpact() {
      applyHit(w, mult);
      game.chaos += Math.round(ACTIONS[w].dmg * mult);
      if (game.streak >= 2) word('RAMPAGE x' + game.streak, { x: view.w / 2, y: 70 }, { size: 20, color: '#ff8c1a', life: 1.3, rot: 0 });
      renderHud();
    },
    onDone() { setTimeout(() => afterHit(w), 450); } };
}

function afterHit(w) {
  const p = person;
  game.q++;
  if (p.hp <= 0) return knockOut();
  let line, d;
  if (Math.random() < 0.18) { line = pick(p.def.impressed); d = 10; setExpr('smug', 2.5); }
  else { line = Math.random() < 0.5 ? pick(WEAPON_LINES[w]) : pick(p.def.hits); d = -8; setExpr('angry', 2.5); }
  say(p.def.name, line);
  changeHire(d);
  nextButton(game.q >= MAX_Q ? 'See the result ▶' : 'Next question ▶', askNext);
}

function knockOut() {
  const p = person;
  p.ko = true; p.koT = 0; p.expr = 'ko'; p.exprT = 0;
  game.kos++; game.chaos += 50;
  SFX.ko(); buzz(200);
  word('K.O.!', { x: view.w / 2, y: view.h * 0.4 }, { burst: true, size: 44, color: '#fff', bg: '#e8202a', life: 1.8, rot: -6 });
  say(p.def.name, p.def.ko);
  renderHud();
  setTimeout(() => {
    if (game.kos >= CHARS.length) { nextButton('See the result ▶', endGame); return; }
    nextButton('Uh oh. Someone\'s coming... ▶', nextInterviewer);
  }, 1200);
}

function nextInterviewer() {
  oldPerson = person; oldPerson.exitT = 0;
  person = buildPerson(game.kos);
  person.enterT = 0; person.root.position.x = 2.9;
  setPlate();
  desk.items.visible = true;
  SFX.ding();
  renderHud();
  setTimeout(() => {
    setExpr('angry', 3);
    say(person.def.name, person.def.intro);
    nextButton(game.q >= MAX_Q ? 'See the result ▶' : 'Continue the interview ▶', askNext);
  }, 1100);
}

const RANKS = [[0, 'Unemployed'], [150, 'Intern'], [300, 'Middle Manager'], [500, 'Corporate Menace'], [700, 'Hostile Takeover Specialist']];

function endGame() {
  ui.state = 'ended';
  const s = game.stats, h = Math.round(game.hire);
  let stamp, cls, text;
  if (game.kos >= CHARS.length) {
    stamp = 'HOSTILE TAKEOVER'; cls = 'boss'; SFX.cheer();
    text = "With the entire management chain unconscious behind one desk, you are technically the CEO now. Your first act: casual Friday, every day.";
  } else if (h >= 70) {
    stamp = game.chaos > 0 ? 'HIRED... SOMEHOW' : 'HIRED!'; cls = ''; SFX.cheer();
    text = game.chaos > 0
      ? person.def.name.split(' ')[0] + ", holding an ice pack: \"We love a self-starter. You start Monday. Please leave the gun at home.\""
      : "A flawless, polite interview. You start Monday. Somewhere, deep down, you wonder what might have been.";
  } else if (game.chaos >= 100) {
    stamp = 'ESCORTED OUT'; cls = 'bad'; SFX.boo();
    text = "Two security guards walk you to the lift. On the way out you take a free biscuit. You've earned it.";
  } else if (h >= 40) {
    stamp = "WE'LL BE IN TOUCH"; cls = 'meh'; SFX.boo();
    text = "\"We'll be in touch.\" They will not be in touch.";
  } else {
    stamp = 'REJECTED'; cls = 'bad'; SFX.boo();
    text = "\"Thanks for coming in. We've decided to go with someone who answered the questions.\"";
  }
  const score = game.chaos + h * 2 + game.kos * 100;
  let best = 0; try { best = +localStorage.getItem('jis-best') || 0; if (score > best) localStorage.setItem('jis-best', score); } catch (e) { /* no storage */ }
  const rank = RANKS.filter(r => score >= r[0]).pop()[1];
  $('end-stamp').textContent = stamp; $('end-stamp').className = 'stamp ' + cls;
  $('end-text').textContent = text;
  $('end-stats').innerHTML = [
    ['Hire chance', h + '%'], ['Knockouts', game.kos], ['Hits landed', s.hits], ['Shots fired', s.shots],
    ['Coffees thrown', s.coffee], ['Desks flipped', s.flips], ['Slaps', s.slaps], ['Polite answers', s.talk],
  ].map(([k, v]) => '<div>' + k + '<b>' + v + '</b></div>').join('');
  $('end-score').innerHTML = 'Score ' + score + (score > best ? ' — NEW BEST!' : '') + '<small>Rank: ' + rank + '</small>';
  $('title-card').classList.add('hidden'); $('end-card').classList.remove('hidden'); $('overlay').classList.remove('hidden');
}

function startGame() {
  ac();
  resetGame();
  ui.state = 'intro';
  $('overlay').classList.add('hidden');
  renderHud();
  setExpr('happy', 2);
  say(person.def.name, person.def.intro);
  nextButton('Sit down ▶', askNext);
}

// Tap the interviewer for a quick cheap slap.
const ray = new THREE.Raycaster();
cvs.addEventListener('pointerdown', ev => {
  if (ui.state !== 'asking' || anim || person.ko || person.enterT < 1) return;
  const r = cvs.getBoundingClientRect();
  const ndc = new THREE.Vector2((ev.clientX - r.left) / r.width * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObject(person.wobble, true).find(h => h.object.userData.person);
  if (!hit) return;
  const now = performance.now(); if (now - lastTap < 220) return; lastTap = now;
  ac();
  person.hp = Math.max(1, person.hp - 3); game.chaos += 3; game.stats.slaps++; game.stats.hits++;
  person.marks.slap++;
  game.hire = clamp(game.hire - 1, 0, 100);
  const left = hit.point.x < headPos().x;
  impulse(left ? 0.8 : -0.8, 0, left ? -6 : 6);
  setExpr('hurt', 0.6); SFX.slap(); buzz(25);
  burst('star', hit.point, 4, 1.4);
  word(pick(['SLAP!', 'THWAP!', 'SMACK!', 'OI!']), { x: ev.clientX - r.left, y: ev.clientY - r.top - 20 }, { size: 20, life: 0.7 });
  if (Math.random() < 0.3) word(pick(['Stop that!', 'Please!', 'OW!', 'Seriously?!', 'Rude!']), headPos(), { size: 14, color: '#fff', life: 1, rot: 0, dy: -90 });
  renderHud();
});

$('start').addEventListener('click', startGame);
$('again').addEventListener('click', startGame);
$('mute').addEventListener('click', () => {
  audio.muted = !audio.muted; $('mute').textContent = audio.muted ? '🔇' : '🔊';
  try { localStorage.setItem('jis-muted', audio.muted ? '1' : ''); } catch (e) { /* no storage */ }
});
document.addEventListener('visibilitychange', () => {
  if (!audio.ctx) return;
  if (document.hidden) audio.ctx.suspend(); else audio.ctx.resume();
});

// ---------- Boot ----------

try {
  audio.muted = localStorage.getItem('jis-muted') === '1'; $('mute').textContent = audio.muted ? '🔇' : '🔊';
  const best = +localStorage.getItem('jis-best') || 0;
  if (best) $('best').textContent = 'Best score: ' + best;
} catch (e) { /* no storage */ }
resetGame();
person.expr = 'smug';
renderHud();
say('Gary Pemberton', 'Next candidate, please!');
resize();
requestAnimationFrame(frame);
