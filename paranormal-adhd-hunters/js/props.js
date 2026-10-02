/* ParanormalADHDhunters — furniture and small objects, all built from simple
   shapes. Each builder returns a group facing local +Z plus its collision
   footprint, so the house can drop it anywhere at any quarter turn. */
import * as THREE from 'three';
import { T, glowTexture } from './textures.js';

const mats = new Map();

/** Shared Lambert material for a texture name or a hex colour. */
export function M(key, opts = {}) {
  const id = key + JSON.stringify(opts);
  if (mats.has(id)) return mats.get(id);
  const o = { ...opts };
  if (key.startsWith('#')) o.color = new THREE.Color(key);
  else o.map = T(key);
  const m = new THREE.MeshLambertMaterial(o);
  m.name = id;
  mats.set(id, m);
  return m;
}

const boxGeo = new Map();
function bgeo(w, h, d) {
  const k = `${w}|${h}|${d}`;
  if (!boxGeo.has(k)) boxGeo.set(k, new THREE.BoxGeometry(w, h, d));
  return boxGeo.get(k);
}

/** Box with its base at y. */
function box(g, w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(bgeo(w, h, d), mat);
  m.position.set(x, y + h / 2, z);
  g.add(m);
  return m;
}
function cyl(g, rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 10) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y + h / 2, z);
  g.add(m);
  return m;
}
function sph(g, r, mat, x, y, z, seg = 10) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(6, seg - 2)), mat);
  m.position.set(x, y, z);
  g.add(m);
  return m;
}

function legs(g, w, d, h, mat, t = 0.06, inset = 0.05) {
  const xs = w / 2 - inset - t / 2, zs = d / 2 - inset - t / 2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, t, h, t, mat, sx * xs, 0, sz * zs);
}

/* ------------------------------------------------------------------ */
/* Furniture                                                           */
/* ------------------------------------------------------------------ */

const B = {
  table({ w = 1.2, d = 0.8, h = 0.76, wood = 'wood' }) {
    const g = new THREE.Group();
    box(g, w, 0.05, d, M(wood), 0, h - 0.05, 0);
    box(g, w - 0.12, 0.08, d - 0.12, M(wood), 0, h - 0.13, 0);
    legs(g, w, d, h - 0.05, M(wood));
    return { g, boxes: [[-w / 2, -d / 2, w / 2, d / 2, h]], top: h };
  },
  chair({ wood = 'wood', fabric = null }) {
    const g = new THREE.Group();
    const s = 0.44;
    box(g, s, 0.05, s, M(fabric || wood), 0, 0.44, 0);
    legs(g, s, s, 0.44, M(wood), 0.04, 0.02);
    box(g, s, 0.5, 0.04, M(wood), 0, 0.49, -s / 2 + 0.02);
    return { g, boxes: [[-0.22, -0.22, 0.22, 0.22, 0.95]] };
  },
  sofa({ w = 2, fabric = 'fabricGreen' }) {
    const g = new THREE.Group();
    const d = 0.9, f = M(fabric);
    box(g, w, 0.42, d, f, 0, 0.05, 0);
    box(g, w, 0.5, 0.2, f, 0, 0.42, -d / 2 + 0.1);
    box(g, 0.18, 0.25, d, f, -w / 2 + 0.09, 0.47, 0);
    box(g, 0.18, 0.25, d, f, w / 2 - 0.09, 0.47, 0);
    for (let i = 0; i < 3; i++) box(g, w / 3 - 0.24, 0.1, d - 0.3, f, (i - 1) * (w / 3 - 0.06), 0.47, 0.06);
    legs(g, w, d, 0.06, M('woodDark'), 0.05, 0.04);
    return { g, boxes: [[-w / 2, -d / 2, w / 2, d / 2, 0.92]], top: 0.52 };
  },
  armchair({ fabric = 'fabricRed' }) {
    const g = new THREE.Group();
    const f = M(fabric);
    box(g, 0.85, 0.4, 0.8, f, 0, 0.06, 0);
    box(g, 0.85, 0.6, 0.18, f, 0, 0.4, -0.31);
    box(g, 0.15, 0.25, 0.8, f, -0.35, 0.46, 0);
    box(g, 0.15, 0.25, 0.8, f, 0.35, 0.46, 0);
    legs(g, 0.85, 0.8, 0.07, M('woodDark'), 0.05, 0.04);
    return { g, boxes: [[-0.43, -0.4, 0.43, 0.4, 1]], top: 0.46 };
  },
  rockingChair({}) {
    const g = new THREE.Group();
    const w = M('woodDark');
    box(g, 0.5, 0.05, 0.5, w, 0, 0.42, 0);
    box(g, 0.5, 0.7, 0.04, w, 0, 0.47, -0.25);
    for (const sx of [-0.22, 0.22]) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.02, 4, 16, 0.95), w);
      r.rotation.set(0, Math.PI / 2, 0);
      r.position.set(sx, 0.62, 0);
      r.rotateZ(Math.PI + 1.1);
      g.add(r);
      box(g, 0.04, 0.42, 0.04, w, sx, 0.02, 0.18);
      box(g, 0.04, 0.42, 0.04, w, sx, 0.02, -0.2);
    }
    return { g, boxes: [[-0.3, -0.35, 0.3, 0.35, 1]], dynamic: true };
  },
  bed({ w = 1.6, d = 2.1, sheet = 'fabricCream', blanket = 'fabricBlue' }) {
    const g = new THREE.Group();
    box(g, w, 0.32, d, M('woodDark'), 0, 0.08, 0);
    box(g, w - 0.06, 0.2, d - 0.1, M(sheet), 0, 0.4, 0.02);
    box(g, w - 0.04, 0.06, d * 0.62, M(blanket), 0, 0.58, d * 0.17);
    box(g, w * 0.36, 0.1, 0.32, M('fabricCream'), -w * 0.22, 0.6, -d / 2 + 0.3);
    if (w > 1.2) box(g, w * 0.36, 0.1, 0.32, M('fabricCream'), w * 0.22, 0.6, -d / 2 + 0.3);
    box(g, w, 1.1, 0.08, M('woodDark'), 0, 0, -d / 2 + 0.04);
    box(g, w, 0.55, 0.06, M('woodDark'), 0, 0, d / 2 - 0.03);
    return { g, boxes: [[-w / 2, -d / 2, w / 2, d / 2, 0.65]], top: 0.64 };
  },
  wardrobe({ w = 1.2, d = 0.6, h = 2.05, wood = 'wood' }) {
    const g = new THREE.Group();
    const m = M(wood);
    box(g, w, h, 0.04, m, 0, 0, -d / 2 + 0.02);
    box(g, 0.04, h, d, m, -w / 2 + 0.02, 0, 0);
    box(g, 0.04, h, d, m, w / 2 - 0.02, 0, 0);
    box(g, w, 0.06, d, m, 0, h - 0.06, 0);
    box(g, w, 0.1, d, m, 0, 0, 0);
    box(g, w + 0.06, 0.08, d + 0.04, m, 0, h, 0);
    // front doors with a gap to peek through
    const dm = M('woodLight');
    box(g, w / 2 - 0.025, h - 0.2, 0.03, dm, -w / 4 - 0.005, 0.1, d / 2 - 0.015);
    box(g, w / 2 - 0.025, h - 0.2, 0.03, dm, w / 4 + 0.005, 0.1, d / 2 - 0.015);
    const knob = M('#b89a5a');
    sph(g, 0.022, knob, -0.05, h * 0.5, d / 2 + 0.01, 6);
    sph(g, 0.022, knob, 0.05, h * 0.5, d / 2 + 0.01, 6);
    return { g, boxes: [[-w / 2, -d / 2, w / 2, d / 2, h]], hide: { x: 0, z: d / 2 - 0.075, h } };
  },
  bookshelf({ w = 1.3, h = 2, d = 0.35 }) {
    const g = new THREE.Group();
    const m = M('woodDark');
    box(g, w, h, 0.03, M('books'), 0, 0, -d / 2 + 0.05);
    box(g, 0.05, h, d, m, -w / 2 + 0.025, 0, 0);
    box(g, 0.05, h, d, m, w / 2 - 0.025, 0, 0);
    box(g, w, 0.05, d, m, 0, h - 0.05, 0);
    for (let i = 0; i < 4; i++) box(g, w - 0.1, 0.03, d - 0.04, m, 0, i * (h / 4), 0);
    return { g, boxes: [[-w / 2, -d / 2, w / 2, d / 2, h]], top: h };
  },
  desk({ w = 1.5, d = 0.7 }) {
    const g = new THREE.Group();
    const m = M('wood');
    box(g, w, 0.05, d, m, 0, 0.72, 0);
    box(g, 0.45, 0.72, d - 0.04, m, -w / 2 + 0.25, 0, 0);
    box(g, 0.45, 0.72, d - 0.04, m, w / 2 - 0.25, 0, 0);
    for (let i = 0; i < 3; i++) {
      box(g, 0.38, 0.18, 0.01, M('woodLight'), -w / 2 + 0.25, 0.08 + i * 0.22, d / 2 - 0.015);
      box(g, 0.38, 0.18, 0.01, M('woodLight'), w / 2 - 0.25, 0.08 + i * 0.22, d / 2 - 0.015);
    }
    return { g, boxes: [[-w / 2, -d / 2, w / 2, d / 2, 0.77]], top: 0.77 };
  },
  dresser({ w = 1.2, d = 0.5, h = 0.9, mirror = false }) {
    const g = new THREE.Group();
    box(g, w, h, d, M('wood'), 0, 0, 0);
    for (let i = 0; i < 3; i++) {
      box(g, w - 0.1, h / 3 - 0.06, 0.02, M('woodLight'), 0, 0.04 + i * (h / 3), d / 2);
      sph(g, 0.025, M('#b89a5a'), -w * 0.25, 0.04 + i * (h / 3) + h / 6, d / 2 + 0.02, 6);
      sph(g, 0.025, M('#b89a5a'), w * 0.25, 0.04 + i * (h / 3) + h / 6, d / 2 + 0.02, 6);
    }
    if (mirror) {
      box(g, w * 0.7, 0.8, 0.04, M('woodDark'), 0, h, -d / 2 + 0.04);
      box(g, w * 0.6, 0.68, 0.01, M('#4a5466', { emissive: 0x070b14 }), 0, h + 0.06, -d / 2 + 0.07);
    }
    return { g, boxes: [[-w / 2, -d / 2, w / 2, d / 2, h]], top: h };
  },
  nightstand({}) {
    const g = new THREE.Group();
    box(g, 0.45, 0.55, 0.4, M('wood'), 0, 0, 0);
    box(g, 0.38, 0.16, 0.01, M('woodLight'), 0, 0.3, 0.2);
    return { g, boxes: [[-0.23, -0.2, 0.23, 0.2, 0.55]], top: 0.55 };
  },
  fireplace({ w = 1.8 }) {
    const g = new THREE.Group();
    const stone = M('plasterGrey');
    box(g, w, 1.2, 0.5, stone, 0, 0, 0);
    box(g, w + 0.2, 0.1, 0.6, M('woodDark'), 0, 1.2, 0.02);
    box(g, w * 0.55, 0.75, 0.05, M('#0a0806'), 0, 0.02, 0.24);
    const ember = new THREE.MeshBasicMaterial({ color: 0xff5a1a, transparent: true, opacity: 0.55 });
    const e = box(g, w * 0.4, 0.06, 0.2, ember, 0, 0.04, 0.12);
    e.userData.noMerge = true;
    box(g, w * 0.4, 0.06, 0.25, M('#1a0f08'), 0, 0.02, 0.16);
    return { g, boxes: [[-w / 2, -0.3, w / 2, 0.3, 1.3]], top: 1.3 };
  },
  piano({}) {
    const g = new THREE.Group();
    const m = M('woodDark');
    box(g, 1.5, 1.25, 0.6, m, 0, 0, -0.05);
    box(g, 1.4, 0.04, 0.22, M('#d8d2c0'), 0, 0.72, 0.33);
    for (let i = 0; i < 20; i++) if (i % 7 !== 2 && i % 7 !== 6) box(g, 0.025, 0.03, 0.12, M('#111'), -0.66 + i * 0.07, 0.76, 0.29);
    box(g, 1.5, 0.06, 0.3, m, 0, 0.68, 0.32);
    box(g, 0.9, 0.06, 0.35, m, 0, 0.45, 0.75);
    legs(g, 0.9, 0.35, 0.45, m, 0.05, 0.03);
    return { g, boxes: [[-0.75, -0.35, 0.75, 0.45, 1.25], [-0.45, 0.58, 0.45, 0.92, 0.5]], top: 1.25 };
  },
  clock({}) {
    const g = new THREE.Group();
    const m = M('woodDark');
    box(g, 0.5, 2.1, 0.35, m, 0, 0, 0);
    box(g, 0.56, 0.12, 0.4, m, 0, 2.1, 0);
    const face = cyl(g, 0.17, 0.17, 0.02, M('#d8d0b8'), 0, 1.68, 0.18, 20);
    face.rotation.x = Math.PI / 2;
    face.position.y = 1.72;
    box(g, 0.01, 0.12, 0.01, M('#111'), 0, 1.7, 0.2);
    box(g, 0.3, 0.9, 0.01, M('#1a1410'), 0, 0.5, 0.18);
    const pend = new THREE.Group();
    pend.position.set(0, 1.4, 0.19);
    const rod = new THREE.Mesh(bgeo(0.015, 0.6, 0.01), M('#a08a4a'));
    rod.position.y = -0.3;
    pend.add(rod);
    const bob = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 14), M('#c8a85a', { emissive: 0x221a08 }));
    bob.rotation.x = Math.PI / 2;
    bob.position.y = -0.62;
    pend.add(bob);
    pend.userData.noMerge = true;
    g.add(pend);
    return { g, boxes: [[-0.25, -0.18, 0.25, 0.18, 2.2]], anim: { pendulum: pend } };
  },
  counter({ w = 2, sink = false }) {
    const g = new THREE.Group();
    box(g, w, 0.86, 0.6, M('woodLight'), 0, 0, 0);
    box(g, w + 0.02, 0.05, 0.64, M('#6f6b62'), 0, 0.86, 0.01);
    const n = Math.max(1, Math.round(w / 0.6));
    for (let i = 0; i < n; i++) box(g, w / n - 0.06, 0.7, 0.01, M('wood'), -w / 2 + (i + 0.5) * (w / n), 0.08, 0.3);
    if (sink) {
      box(g, 0.6, 0.02, 0.4, M('#9aa3a8'), 0, 0.9, 0);
      cyl(g, 0.015, 0.015, 0.3, M('#9aa3a8'), 0, 0.9, -0.22, 6);
    }
    return { g, boxes: [[-w / 2, -0.3, w / 2, 0.32, 0.91]], top: 0.91 };
  },
  stove({}) {
    const g = new THREE.Group();
    box(g, 0.7, 0.9, 0.62, M('#c9c4b4'), 0, 0, 0);
    box(g, 0.6, 0.4, 0.01, M('#1a1a1a'), 0, 0.2, 0.31);
    for (const [x, z] of [[-0.17, -0.13], [0.17, -0.13], [-0.17, 0.13], [0.17, 0.13]]) cyl(g, 0.1, 0.1, 0.02, M('#222'), x, 0.9, z, 12);
    box(g, 0.7, 0.4, 0.05, M('#c9c4b4'), 0, 0.9, -0.29);
    return { g, boxes: [[-0.35, -0.31, 0.35, 0.31, 0.92]], top: 0.92 };
  },
  fridge({}) {
    const g = new THREE.Group();
    box(g, 0.7, 1.7, 0.65, M('#d6d0bc'), 0, 0, 0);
    box(g, 0.66, 0.01, 0.01, M('#555'), 0, 1.1, 0.33);
    box(g, 0.03, 0.3, 0.03, M('#9aa3a8'), 0.27, 1.25, 0.34);
    return { g, boxes: [[-0.35, -0.33, 0.35, 0.33, 1.7]], top: 1.7 };
  },
  bathtub({ w = 1.7, d = 0.78 }) {
    const g = new THREE.Group();
    const e = M('#cfd6d2');
    box(g, w, 0.55, d, e, 0, 0.08, 0);
    box(g, w - 0.16, 0.02, d - 0.16, M('#4a5652'), 0, 0.62, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) sph(g, 0.05, M('#b89a5a'), sx * (w / 2 - 0.12), 0.05, sz * (d / 2 - 0.1), 6);
    cyl(g, 0.02, 0.02, 0.3, M('#9aa3a8'), -w / 2 + 0.1, 0.63, 0, 6);
    return { g, boxes: [[-w / 2, -d / 2, w / 2, d / 2, 0.63]], top: 0.63 };
  },
  toilet({}) {
    const g = new THREE.Group();
    const e = M('#cfd6d2');
    cyl(g, 0.18, 0.15, 0.4, e, 0, 0, 0.05, 12);
    box(g, 0.42, 0.04, 0.5, e, 0, 0.4, 0.05);
    box(g, 0.42, 0.4, 0.18, e, 0, 0.42, -0.2);
    return { g, boxes: [[-0.22, -0.3, 0.22, 0.32, 0.8]] };
  },
  sink({ mirror = true }) {
    const g = new THREE.Group();
    const e = M('#cfd6d2');
    cyl(g, 0.08, 0.12, 0.8, e, 0, 0, 0, 10);
    box(g, 0.55, 0.12, 0.42, e, 0, 0.8, 0);
    cyl(g, 0.015, 0.015, 0.2, M('#9aa3a8'), 0, 0.92, -0.15, 6);
    if (mirror) {
      box(g, 0.55, 0.7, 0.03, M('woodDark'), 0, 1.25, -0.2);
      box(g, 0.47, 0.6, 0.01, M('#4a5466', { emissive: 0x070b14 }), 0, 1.3, -0.18);
    }
    return { g, boxes: [[-0.28, -0.22, 0.28, 0.22, 0.92]], top: 0.92 };
  },
  painting({ tex = 'portrait1', w = 0.7, h = 0.9 }) {
    const g = new THREE.Group();
    box(g, w + 0.12, h + 0.12, 0.05, M('#5a4220'), 0, -(h + 0.12) / 2, 0.025);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), M(tex));
    p.position.set(0, 0, 0.055);
    g.add(p);
    return { g, boxes: [], wall: true };
  },
  mirror({ w = 0.6, h = 0.8 }) {
    const g = new THREE.Group();
    box(g, w + 0.1, h + 0.1, 0.04, M('#5a4220'), 0, -(h + 0.1) / 2, 0.02);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), M('#4a5466', { emissive: 0x070b14 }));
    p.position.set(0, 0, 0.045);
    g.add(p);
    return { g, boxes: [], wall: true };
  },
  rockingHorse({}) {
    const g = new THREE.Group();
    const w = M('#8a5a3a'), mane = M('#e8dcc0');
    box(g, 0.24, 0.26, 0.7, w, 0, 0.42, 0);
    box(g, 0.2, 0.36, 0.2, w, 0, 0.62, 0.32);
    box(g, 0.18, 0.18, 0.3, w, 0, 0.88, 0.42);
    box(g, 0.05, 0.3, 0.2, mane, 0, 0.7, 0.22);
    box(g, 0.04, 0.2, 0.08, mane, 0, 0.42, -0.36);
    for (const sx of [-0.1, 0.1]) {
      box(g, 0.05, 0.36, 0.05, w, sx, 0.08, 0.25);
      box(g, 0.05, 0.36, 0.05, w, sx, 0.08, -0.25);
      const rk = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.025, 4, 18, 0.9), M('#5a3a20'));
      rk.rotation.y = Math.PI / 2;
      rk.position.set(sx, 0.82, 0);
      rk.rotateZ(Math.PI + 1.12);
      g.add(rk);
    }
    return { g, boxes: [[-0.2, -0.45, 0.2, 0.5, 1]], dynamic: true };
  },
  toyBox({}) {
    const g = new THREE.Group();
    box(g, 0.8, 0.5, 0.45, M('#6a3a7a'), 0, 0, 0);
    box(g, 0.82, 0.05, 0.47, M('#d8b04a'), 0, 0.5, 0);
    box(g, 0.2, 0.2, 0.01, M('#d8b04a'), 0, 0.2, 0.23);
    return { g, boxes: [[-0.4, -0.23, 0.4, 0.23, 0.55]], top: 0.55 };
  },
  musicBox({}) {
    const g = new THREE.Group();
    box(g, 0.22, 0.12, 0.15, M('#6a2a4a'), 0, 0, 0);
    box(g, 0.23, 0.02, 0.16, M('#d8b04a'), 0, 0.12, 0);
    cyl(g, 0.012, 0.012, 0.06, M('#d8b04a'), 0, 0.14, 0, 6);
    sph(g, 0.02, M('#e8f0ff'), 0, 0.22, 0, 6);
    return { g, boxes: [] };
  },
  sheeted({ w = 0.9, d = 0.9, h = 1 }) {
    const g = new THREE.Group();
    const s = M('sheet');
    box(g, w, h * 0.85, d, s, 0, 0, 0);
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), s);
    top.scale.set(w, h * 0.3, d);
    top.position.y = h * 0.85;
    g.add(top);
    return { g, boxes: [[-w / 2, -d / 2, w / 2, d / 2, h]] };
  },
  boxes({ n = 3 }) {
    const g = new THREE.Group();
    const c = M('#7a5f3e');
    let y = 0;
    for (let i = 0; i < n; i++) {
      const s = 0.55 - i * 0.08;
      const b = box(g, s, s * 0.8, s, c, (i % 2) * 0.05, y, 0);
      b.rotation.y = i * 0.3;
      y += s * 0.8;
    }
    return { g, boxes: [[-0.3, -0.3, 0.3, 0.3, y]] };
  },
  boiler({}) {
    const g = new THREE.Group();
    const m = M('#4a4d4a');
    cyl(g, 0.45, 0.45, 1.8, m, 0, 0, 0, 14);
    for (let i = 0; i < 3; i++) cyl(g, 0.05, 0.05, 1.2, M('#6a5040'), -0.2 + i * 0.2, 1.8, -0.1, 6);
    box(g, 0.25, 0.25, 0.05, M('#1a1a1a'), 0, 0.5, 0.43);
    const glow = new THREE.MeshBasicMaterial({ color: 0xff6a20 });
    const gm = box(g, 0.16, 0.04, 0.01, glow, 0, 0.58, 0.46);
    gm.userData.noMerge = true;
    return { g, boxes: [[-0.48, -0.48, 0.48, 0.48, 2.5]] };
  },
  shelves({ w = 1.6, h = 1.9 }) {
    const g = new THREE.Group();
    const m = M('#3a3d40');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, 0.04, h, 0.04, m, sx * (w / 2 - 0.02), 0, sz * 0.18);
    for (let i = 0; i < 4; i++) box(g, w, 0.03, 0.4, M('woodLight'), 0, 0.1 + i * (h / 4), 0);
    return { g, boxes: [[-w / 2, -0.2, w / 2, 0.2, h]], shelves: [0.13, 0.13 + h / 4, 0.13 + h / 2] };
  },
  workbench({ w = 1.8 }) {
    const g = new THREE.Group();
    box(g, w, 0.08, 0.6, M('woodLight'), 0, 0.84, 0);
    legs(g, w, 0.6, 0.84, M('wood'), 0.08);
    box(g, w - 0.2, 0.03, 0.5, M('wood'), 0, 0.25, 0);
    box(g, w, 0.9, 0.03, M('woodDark'), 0, 0.92, -0.29);
    return { g, boxes: [[-w / 2, -0.3, w / 2, 0.3, 0.92]], top: 0.92 };
  },
  coatRack({}) {
    const g = new THREE.Group();
    const m = M('woodDark');
    cyl(g, 0.025, 0.03, 1.8, m, 0, 0, 0, 6);
    cyl(g, 0.2, 0.22, 0.04, m, 0, 0, 0, 10);
    const coat = M('#2a2a32');
    box(g, 0.34, 0.8, 0.12, coat, 0, 0.85, 0.06);
    sph(g, 0.1, M('#3a2a20'), 0, 1.8, 0.04, 8);
    return { g, boxes: [[-0.22, -0.22, 0.22, 0.22, 1.9]] };
  },
  plant({}) {
    const g = new THREE.Group();
    cyl(g, 0.18, 0.13, 0.35, M('#6a3a2a'), 0, 0, 0, 10);
    const st = M('#4a3a26');
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Mesh(bgeo(0.015, 0.7, 0.015), st);
      s.position.set(0, 0.6, 0);
      s.rotation.set(Math.sin(i * 2.1) * 0.5, 0, Math.cos(i * 1.7) * 0.5);
      g.add(s);
    }
    return { g, boxes: [[-0.18, -0.18, 0.18, 0.18, 0.9]] };
  },
  globe({}) {
    const g = new THREE.Group();
    cyl(g, 0.02, 0.2, 0.8, M('woodDark'), 0, 0, 0, 8);
    sph(g, 0.2, M('#3a5a6a'), 0, 1.0, 0, 12);
    return { g, boxes: [[-0.2, -0.2, 0.2, 0.2, 1.2]] };
  },
  sewingTable({}) {
    const g = new THREE.Group();
    const r = B.table({ w: 1.2, d: 0.6, h: 0.75 });
    g.add(r.g);
    box(g, 0.4, 0.2, 0.18, M('#1a1a22'), 0, 0.75, 0);
    box(g, 0.08, 0.14, 0.18, M('#1a1a22'), -0.16, 0.95, 0);
    box(g, 0.4, 0.06, 0.18, M('#1a1a22'), 0, 1.03, 0);
    return { g, boxes: r.boxes, top: 0.75 };
  },
  dressForm({}) {
    const g = new THREE.Group();
    cyl(g, 0.02, 0.02, 1.0, M('woodDark'), 0, 0, 0, 6);
    cyl(g, 0.2, 0.25, 0.04, M('woodDark'), 0, 0, 0, 10);
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.22, 0.65, 12), M('fabricCream'));
    torso.position.y = 1.32;
    g.add(torso);
    sph(g, 0.19, M('fabricCream'), 0, 1.0, 0, 10).scale.set(1, 0.6, 0.8);
    cyl(g, 0.05, 0.05, 0.12, M('woodDark'), 0, 1.64, 0, 6);
    box(g, 0.36, 0.25, 0.01, M('fabricPink'), 0, 1.25, 0.19);
    return { g, boxes: [[-0.25, -0.25, 0.25, 0.25, 1.8]] };
  },
  chest({ w = 1.1 }) {
    const g = new THREE.Group();
    box(g, w, 0.5, 0.5, M('woodDark'), 0, 0, 0);
    box(g, w + 0.02, 0.1, 0.52, M('wood'), 0, 0.5, 0);
    box(g, 0.12, 0.12, 0.02, M('#b89a5a'), 0, 0.42, 0.26);
    return { g, boxes: [[-w / 2, -0.25, w / 2, 0.25, 0.6]], top: 0.6 };
  },
  tableLamp({ shade = '#c8b080' }) {
    const g = new THREE.Group();
    cyl(g, 0.02, 0.07, 0.3, M('#8a7a5a'), 0, 0, 0, 8);
    cyl(g, 0.09, 0.15, 0.2, M(shade), 0, 0.3, 0, 10);
    return { g, boxes: [] };
  },
  rug({ w = 2, d = 3, tex = 'rug' }) {
    const g = new THREE.Group();
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), M(tex));
    p.rotation.x = -Math.PI / 2;
    p.position.y = 0.012;
    g.add(p);
    return { g, boxes: [] };
  },
  candles({ r = 1.05 }) {
    const g = new THREE.Group();
    const wax = M('#d8cfb8');
    const flames = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const fresh = i === 3;
      cyl(g, 0.035, 0.04, fresh ? 0.22 : 0.05, wax, x, 0, z, 8);
      if (fresh) {
        const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('255,190,90'), color: 0xffb060, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        f.scale.set(0.12, 0.18, 1);
        f.position.set(x, 0.3, z);
        f.userData.noMerge = true;
        g.add(f);
        flames.push(f);
      }
    }
    return { g, boxes: [], anim: { flames } };
  },
  sigil({ size = 2.8 }) {
    const g = new THREE.Group();
    const m = new THREE.MeshBasicMaterial({ map: T('sigil'), transparent: true, opacity: 0.35, depthWrite: false, color: 0xb9a0ff, blending: THREE.AdditiveBlending });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(size, size), m);
    p.rotation.x = -Math.PI / 2;
    p.position.y = 0.015;
    p.userData.noMerge = true;
    g.add(p);
    return { g, boxes: [], anim: { sigil: m } };
  },
  cobweb({ s = 0.7 }) {
    const g = new THREE.Group();
    const m = new THREE.MeshBasicMaterial({ map: T('cobweb'), transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
    // the web's hub is the plane's top-left corner, which sits at the group origin
    const p = new THREE.Mesh(new THREE.PlaneGeometry(s, s), m);
    p.geometry.translate(s / 2, -s / 2, 0);
    p.userData.noMerge = true;
    g.add(p);
    return { g, boxes: [] };
  },
  bunkBox({}) { return B.boxes({ n: 2 }); },
};

export function buildProp(type, opts = {}) {
  const b = B[type];
  if (!b) throw new Error('Unknown prop ' + type);
  return b(opts);
}

/* ------------------------------------------------------------------ */
/* Ceiling lamps                                                       */
/* ------------------------------------------------------------------ */

export function buildLamp(kind) {
  const g = new THREE.Group();
  const bulb = new THREE.MeshBasicMaterial({ color: 0x3a3428 });
  const shadeOn = new THREE.MeshLambertMaterial({ color: 0x6a5a40, emissive: 0x000000 });
  if (kind === 'chandelier') {
    cyl(g, 0.01, 0.01, 0.35, M('#222'), 0, -0.35, 0, 4);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.015, 4, 20), M('#8a7040'));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.38;
    g.add(ring);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const b = sph(g, 0.035, bulb, Math.cos(a) * 0.32, -0.33, Math.sin(a) * 0.32, 6);
      b.userData.noMerge = true;
    }
  } else if (kind === 'pendant') {
    cyl(g, 0.006, 0.006, 0.5, M('#222'), 0, -0.5, 0, 4);
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.24, 0.18, 14, 1, true), shadeOn);
    shade.material.side = THREE.DoubleSide;
    shade.position.y = -0.56;
    g.add(shade);
    sph(g, 0.05, bulb, 0, -0.6, 0, 8);
  } else {
    cyl(g, 0.006, 0.006, 0.3, M('#222'), 0, -0.3, 0, 4);
    sph(g, 0.055, bulb, 0, -0.35, 0, 8);
  }
  g.traverse((o) => { o.userData.noMerge = true; });
  compactGroup(g);
  return { g, bulb, shade: shadeOn };
}

/* ------------------------------------------------------------------ */
/* Throwable objects                                                   */
/* ------------------------------------------------------------------ */

const THROW = {
  book: () => { const g = new THREE.Group(); const c = ['#5a1e1e', '#1e3a5a', '#2a4a2a', '#4a2a5a'][Math.floor(Math.random() * 4)]; box(g, 0.16, 0.04, 0.22, M(c), 0, 0, 0); box(g, 0.15, 0.03, 0.2, M('#d8d0b8'), 0.01, 0.005, 0); return { g, r: 0.12, h: 0.04 }; },
  cup: () => { const g = new THREE.Group(); cyl(g, 0.04, 0.035, 0.09, M('#d8d8e0'), 0, 0, 0, 10); return { g, r: 0.05, h: 0.09 }; },
  plate: () => { const g = new THREE.Group(); cyl(g, 0.12, 0.09, 0.02, M('#e0dcd0'), 0, 0, 0, 14); return { g, r: 0.12, h: 0.02 }; },
  bottle: () => { const g = new THREE.Group(); const c = ['#2a5a3a', '#5a3a1a', '#3a4a6a'][Math.floor(Math.random() * 3)]; cyl(g, 0.035, 0.035, 0.2, M(c), 0, 0, 0, 8); cyl(g, 0.014, 0.03, 0.08, M(c), 0, 0.2, 0, 8); return { g, r: 0.04, h: 0.28 }; },
  vase: () => { const g = new THREE.Group(); cyl(g, 0.05, 0.08, 0.26, M('#3a4a7a'), 0, 0, 0, 10); return { g, r: 0.08, h: 0.26 }; },
  block: () => { const g = new THREE.Group(); const c = ['#c83a3a', '#3a8ac8', '#e8c33a', '#3ab070'][Math.floor(Math.random() * 4)]; box(g, 0.08, 0.08, 0.08, M(c), 0, 0, 0); return { g, r: 0.06, h: 0.08 }; },
  teddy: () => { const g = new THREE.Group(); const f = M('#8a6040'); sph(g, 0.09, f, 0, 0.09, 0, 8); sph(g, 0.065, f, 0, 0.22, 0, 8); sph(g, 0.025, f, -0.05, 0.28, 0, 6); sph(g, 0.025, f, 0.05, 0.28, 0, 6); return { g, r: 0.1, h: 0.3 }; },
  candle: () => { const g = new THREE.Group(); cyl(g, 0.05, 0.06, 0.03, M('#a08a4a'), 0, 0, 0, 8); cyl(g, 0.02, 0.02, 0.2, M('#d8cfb8'), 0, 0.03, 0, 8); return { g, r: 0.06, h: 0.23 }; },
  frame: () => { const g = new THREE.Group(); const b = box(g, 0.18, 0.22, 0.03, M('#5a4220'), 0, 0, 0); b.rotation.x = -0.25; const p = box(g, 0.13, 0.16, 0.01, M('portrait3'), 0, 0.03, 0.025); p.rotation.x = -0.25; return { g, r: 0.12, h: 0.22 }; },
  ball: () => { const g = new THREE.Group(); sph(g, 0.08, M('#c83a5a'), 0, 0.08, 0, 10); return { g, r: 0.08, h: 0.16, ball: true }; },
  jar: () => { const g = new THREE.Group(); cyl(g, 0.05, 0.05, 0.14, M('#6a7a5a'), 0, 0, 0, 8); cyl(g, 0.052, 0.052, 0.02, M('#8a7a4a'), 0, 0.14, 0, 8); return { g, r: 0.05, h: 0.16 }; },
  pan: () => { const g = new THREE.Group(); cyl(g, 0.12, 0.1, 0.05, M('#2a2a2a'), 0, 0, 0, 12); box(g, 0.2, 0.02, 0.03, M('#2a2a2a'), 0.2, 0.03, 0); return { g, r: 0.15, h: 0.05 }; },
};

export function buildThrowable(kind) {
  const t = (THROW[kind] || THROW.book)();
  compactGroup(t.g);
  return t;
}

/* ------------------------------------------------------------------ */
/* Merging                                                             */
/* ------------------------------------------------------------------ */

export function mergeGeos(geos) {
  let count = 0;
  for (const g of geos) count += g.attributes.position.count;
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), uv = new Float32Array(count * 2);
  let o = 0;
  for (const g of geos) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array.subarray(0, n * 3), o * 3);
    nor.set(g.attributes.normal.array.subarray(0, n * 3), o * 3);
    uv.set(g.attributes.uv.array.subarray(0, n * 2), o * 2);
    o += n;
    g.dispose();
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  m.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  m.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  m.computeBoundingSphere();
  m.computeBoundingBox();
  return m;
}

/** Bake a mesh into a plain position/normal/uv geometry in another space. */
export function bakeGeo(mesh, matrix) {
  const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  g.applyMatrix4(matrix);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  return g;
}

/** Merge a group's opaque meshes by material, in place. Meshes marked keep stay as they are. */
export function compactGroup(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const buckets = new Map();
  const remove = [];
  group.traverse((o) => {
    if (!o.isMesh || o === group) return;
    if (o.userData.keep || o.material.transparent || o.material.visible === false || o.userData.interact) return;
    const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    if (!buckets.has(o.material)) buckets.set(o.material, []);
    buckets.get(o.material).push(bakeGeo(o, m));
    remove.push(o);
  });
  for (const o of remove) o.parent.remove(o);
  for (const [mat, geos] of buckets) {
    const mesh = new THREE.Mesh(mergeGeos(geos), mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}
