// Builds one star system and keeps every body where it really is.
import * as THREE from 'three';
import { BODIES, KM_PER_UNIT, AU } from './data.js';
import {
  DEG, daysSinceJ2000, orbitFramePos, eclToScene, moonEcliptic, raDecToScene,
  orientation, lockedOrientation, equatorBasis,
} from './astro.js';
import {
  planetMaterial, atmosphereMaterial, ringMaterial, ringTexture, starMaterial, glowMaterial,
  dotsMaterial, beltMaterial, tailMaterial, orbitMaterial,
} from './materials.js';
import { blackHoleMesh } from './blackhole.js';
import { blackbody, vfbm3, mulberry32 } from './glsl.js';

const SUN_RGB = blackbody(5772);
export function starTint(T) {
  const c = blackbody(T);
  const n = c.map((v, i) => v / SUN_RGB[i]);
  const m = Math.max(...n);
  return n.map((v) => v / m);
}
function hexRGB(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion();

function irregularGeometry(def) {
  const g = new THREE.SphereGeometry(1, 96, 48);
  const pos = g.attributes.position;
  const R = def.radius;
  const [a, b, c] = def.shape.map((s) => s / R);
  const sd = (def.tex && def.tex.seed) || 1;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = vfbm3(x * 1.6 + sd, y * 1.6, z * 1.6, 4);
    const k = 1 + 0.22 * n;
    pos.setXYZ(i, x * a * k, y * c * k, z * b * k);
  }
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

export class World {
  constructor(renderer, scene, baker) {
    this.renderer = renderer;
    this.scene = scene;
    this.baker = baker;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.bodies = [];
    this.byId = {};
    this.flare = 0;
    this.nextFlare = 20;
  }

  build(sys, quality, skyTex) {
    this.dispose();
    this.sys = sys;
    this.quality = quality;
    const texScale = quality === 'low' ? 0.5 : quality === 'medium' ? 0.75 : 1;
    const hi = quality === 'high';
    const defs = BODIES.filter((b) => b.sys === sys.id);
    const order = [];
    const placed = new Set();
    for (let pass = 0; pass < 6 && order.length < defs.length; pass++) {
      for (const d of defs) {
        if (placed.has(d.id)) continue;
        if (!d.parent || placed.has(d.parent)) { order.push(d); placed.add(d.id); }
      }
    }
    const stars = defs.filter((d) => d.kind === 'star');
    const ringTexCache = {};
    for (const def of order) {
      const b = {
        def, id: def.id, name: def.name, kind: def.kind,
        R: def.radius / KM_PER_UNIT,
        pos: new THREE.Vector3(), prevPos: new THREE.Vector3(), vel: new THREE.Vector3(),
        q: new THREE.Quaternion(), qInv: new THREE.Quaternion(),
        parent: def.parent ? this.byId[def.parent] : null,
        color: hexRGB(def.color || '#ffffff'),
        pole: null,
      };
      if (def.rot && def.rot.ra !== undefined) b.pole = raDecToScene(def.rot.ra, def.rot.dec);
      this.bodies.push(b);
      this.byId[def.id] = b;

      if (def.kind === 'star') {
        b.tint = starTint(def.star.temp);
        b.lum = def.star.lum;
        b.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 48), starMaterial(b.tint, def.id === 'sun' ? 1 : 0.6));
        b.glow = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), glowMaterial(b.tint));
        b.glow.frustumCulled = false;
        b.glow.renderOrder = 2;
        this.root.add(b.mesh, b.glow);
      } else if (def.kind === 'blackhole') {
        b.mesh = blackHoleMesh(skyTex, quality);
        this.root.add(b.mesh);
      } else {
        if (stars.length > 1) def.twoSuns = true;
        b.tex = this.baker.prepare(def, texScale);
        let rt = null;
        if (def.rings) {
          rt = ringTexCache[def.rings.profile] || (ringTexCache[def.rings.profile] = ringTexture(def.rings.profile));
          b.ringTex = rt;
        }
        const seg = def.kind === 'planet' || def.kind === 'exoplanet' || def.kind === 'dwarf' ? (hi ? 160 : 112) : (hi ? 96 : 64);
        const geo = def.shape ? irregularGeometry(def) : new THREE.SphereGeometry(1, seg, seg / 2);
        b.mesh = new THREE.Mesh(geo, planetMaterial(def, b.tex, rt));
        this.root.add(b.mesh);
        if (def.atmo) {
          b.atmo = new THREE.Mesh(new THREE.SphereGeometry(1 + def.atmo.height, 96, 48), atmosphereMaterial(def));
          b.atmo.renderOrder = 3;
          b.mesh.add(b.atmo);
        }
        if (def.rings) {
          const rg = new THREE.RingGeometry(def.rings.inner, def.rings.outer, 256, 6);
          rg.rotateX(-Math.PI / 2);
          b.rings = new THREE.Mesh(rg, ringMaterial(def, rt, def.rings.profile === 'saturn' ? 1 : 1.4));
          b.rings.renderOrder = 4;
          b.mesh.add(b.rings);
        }
        if (def.comet) this.buildComet(b);
      }
    }
    this.stars = this.bodies.filter((b) => b.kind === 'star');
    this.buildOrbits();
    if (sys.id === 'sol') this.buildBelts(quality);
    this.buildDots();
    this.lastOrbitDay = null;
  }

  buildComet(b) {
    b.coma = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), glowMaterial([0.75, 0.88, 1.0]));
    b.coma.frustumCulled = false;
    b.coma.renderOrder = 6;
    const tg = new THREE.PlaneGeometry(1, 1, 1, 32);
    tg.translate(0, 0.5, 0);
    b.ionTail = new THREE.Mesh(tg, tailMaterial([0.35, 0.6, 1.0]));
    b.dustTail = new THREE.Mesh(tg, tailMaterial([1.0, 0.9, 0.72]));
    for (const m of [b.ionTail, b.dustTail]) { m.frustumCulled = false; m.renderOrder = 6; }
    this.root.add(b.coma, b.ionTail, b.dustTail);
  }

  buildBelts(quality) {
    const make = (n, aMin, aMax, eMax, iMax, tint, bright, gaps) => {
      const rnd = mulberry32(n * 7 + 3);
      const orb = new Float32Array(n * 4), P = new Float32Array(n * 3), Q = new Float32Array(n * 3);
      for (let k = 0; k < n; k++) {
        let a;
        do { a = aMin + (aMax - aMin) * rnd(); } while (gaps.some(([c, w]) => Math.abs(a - c) < w * rnd()));
        const e = eMax * rnd() * rnd();
        const inc = iMax * DEG * Math.abs(rnd() + rnd() - 1);
        const node = rnd() * 360, peri = rnd() * 360;
        const n0 = (0.9856076686 / Math.pow(a, 1.5)) * DEG;
        orb.set([a * AU, e, rnd() * Math.PI * 2, n0], k * 4);
        const p = orbitFramePos(1, 0, inc / DEG, node, peri, 0);
        const qv = orbitFramePos(1, 0, inc / DEG, node, peri, Math.PI / 2);
        const ps = eclToScene(p), qs = eclToScene(qv);
        P.set([ps.x, ps.y, ps.z], k * 3);
        Q.set([qs.x, qs.y, qs.z], k * 3);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      g.setAttribute('orb', new THREE.BufferAttribute(orb, 4));
      g.setAttribute('axP', new THREE.BufferAttribute(P, 3));
      g.setAttribute('axQ', new THREE.BufferAttribute(Q, 3));
      const pts = new THREE.Points(g, beltMaterial(tint, bright));
      pts.frustumCulled = false;
      pts.renderOrder = 1;
      this.root.add(pts);
      return pts;
    };
    const f = quality === 'low' ? 0.5 : quality === 'high' ? 1.5 : 1;
    this.belts = [
      make(Math.round(9000 * f), 2.1, 3.3, 0.25, 18, [0.72, 0.64, 0.55], 0.55, [[2.5, 0.03], [2.82, 0.02], [2.95, 0.02]]),
      make(Math.round(6000 * f), 39.0, 48.0, 0.18, 25, [0.6, 0.68, 0.8], 0.4, [[40.5, 0.6]]),
    ];
  }

  // Orbit paths drawn relative to each parent.
  buildOrbits() {
    this.orbitLines = [];
    for (const b of this.bodies) {
      const o = b.def.orbit;
      if (!o || o.binary || !b.parent) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(513 * 3), 3));
      const moon = b.parent.kind !== 'star';
      const col = b.kind === 'comet' ? 0x7fb6d8 : moon ? 0x6b7fa6 : 0x5a86d6;
      const el = o.model === 'moon' ? { a: 384400 / KM_PER_UNIT } : this.elements(b, 0);
      const line = new THREE.Line(g, orbitMaterial(col, moon ? 0.28 : 0.3, el.a * 0.12));
      line.frustumCulled = false;
      line.renderOrder = 0;
      this.root.add(line);
      b.orbitLine = line;
      this.orbitLines.push(b);
    }
  }

  refreshOrbits(d) {
    for (const b of this.orbitLines) {
      const arr = b.orbitLine.geometry.attributes.position.array;
      const o = b.def.orbit;
      if (o.model === 'moon') {
        for (let k = 0; k <= 512; k++) {
          const e = moonEcliptic(d + (k / 512) * 27.3217);
          eclToScene(e, _v).multiplyScalar(1 / KM_PER_UNIT);
          arr.set([_v.x, _v.y, _v.z], k * 3);
        }
      } else {
        const el = this.elements(b, d);
        for (let k = 0; k <= 512; k++) {
          const E = (k / 512) * Math.PI * 2;
          const M = E - el.e * Math.sin(E);
          this.frameToScene(b, orbitFramePos(el.a, el.e, el.i, el.node, el.peri, M), _v);
          arr.set([_v.x, _v.y, _v.z], k * 3);
        }
      }
      b.orbitLine.geometry.attributes.position.needsUpdate = true;
    }
  }

  // Keplerian elements at day d: a in scene units, angles in degrees, M in radians.
  elements(b, d) {
    const o = b.def.orbit;
    if (o.el) {
      const [a, e, i, L, lp, node, dL] = o.el;
      const T = d / 36525;
      const Ld = L + dL * T;
      return { a: a * AU, e, i, node, peri: lp - node, M: (Ld - lp) * DEG };
    }
    const a = o.unit === 'km' ? o.a / KM_PER_UNIT : o.a * AU;
    const M = o.tp !== undefined ? (2 * Math.PI * (d - o.tp)) / o.P : (o.M0 + (360 * d) / o.P) * DEG;
    return { a, e: o.e, i: o.i, node: o.node, peri: o.peri, M };
  }

  frameToScene(b, v, out) {
    const o = b.def.orbit;
    if (o.frame === 'equator') {
      if (!b.eqBasis) b.eqBasis = equatorBasis(b.parent.pole || new THREE.Vector3(0, 1, 0));
      const { N, B, P } = b.eqBasis;
      return out.set(0, 0, 0).addScaledVector(N, v[0]).addScaledVector(B, v[1]).addScaledVector(P, v[2]);
    }
    return eclToScene(v, out);
  }

  orbitNormal(b) {
    const o = b.def.orbit;
    if (!o || o.model === 'moon') return new THREE.Vector3(0, 1, 0);
    const i = (o.el ? o.el[2] : o.i) * DEG, node = (o.el ? o.el[5] : o.node) * DEG;
    return this.frameToScene(b, [Math.sin(i) * Math.sin(node), -Math.sin(i) * Math.cos(node), Math.cos(i)], new THREE.Vector3()).normalize();
  }

  positionAt(b, d, out) {
    const o = b.def.orbit;
    if (!o) return out.set(0, 0, 0);
    if (o.binary) {
      const M = (o.M0 + (360 * d) / o.P) * DEG;
      eclToScene(orbitFramePos(o.a * AU, o.e, o.i, o.node, o.peri, M), out);
      return out.multiplyScalar(o.frac);
    }
    if (o.model === 'moon') {
      eclToScene(moonEcliptic(d), out).multiplyScalar(1 / KM_PER_UNIT);
      return out.add(b.parent.pos);
    }
    const el = this.elements(b, d);
    this.frameToScene(b, orbitFramePos(el.a, el.e, el.i, el.node, el.peri, el.M), out);
    return out.add(b.parent.pos);
  }

  buildDots() {
    const n = this.bodies.length;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('size', new THREE.BufferAttribute(new Float32Array(n), 1));
    this.dots = new THREE.Points(g, dotsMaterial());
    this.dots.frustumCulled = false;
    this.dots.renderOrder = 7;
    this.root.add(this.dots);
  }

  // Move every body to where it is at 'simMs'.
  advance(simMs, dt) {
    const d = daysSinceJ2000(simMs);
    this.day = d;
    for (const b of this.bodies) {
      b.prevPos.copy(b.pos);
      this.positionAt(b, d, b.pos);
      if (!this.hasPos) b.prevPos.copy(b.pos);
    }
    this.hasPos = true;
    if (this.lastOrbitDay === null || Math.abs(d - this.lastOrbitDay) > 3) {
      this.refreshOrbits(d);
      this.lastOrbitDay = d;
    }

    // Orientation
    for (const b of this.bodies) {
      const r = b.def.rot;
      if (!r) continue;
      if (r.locked) {
        if (!b.lockPole) b.lockPole = b.pole ? b.pole.clone() : this.orbitNormal(b);
        const toward = _w.copy(b.parent.pos).sub(b.pos);
        lockedOrientation(b.lockPole, toward, b.q);
      } else {
        orientation(b.pole, r.W0 + r.Wd * d, r.ra, b.q);
      }
      b.qInv.copy(b.q).invert();
    }

    // Proxima's flares
    if (this.byId.proxima) {
      this.nextFlare -= dt;
      if (this.nextFlare <= 0) { this.flare = 0.6 + Math.random() * 0.6; this.nextFlare = 25 + Math.random() * 50; }
      this.flare *= Math.exp(-dt * 0.35);
    }
  }

  // Push camera-dependent state (uniforms, dots, orbit lines) to the GPU.
  sync(camera, viewH, dpr, opts, realT) {
    const d = this.day;
    const tanHalf = Math.tan((camera.fov * DEG) / 2);
    const pxPerRad = viewH / 2 / tanHalf;
    const camPos = camera.position;
    const dotPos = this.dots.geometry.attributes.position.array;
    const dotCol = this.dots.geometry.attributes.color.array;
    const dotSize = this.dots.geometry.attributes.size.array;
    this.dots.position.copy(camPos);

    for (let k = 0; k < this.bodies.length; k++) {
      const b = this.bodies[k];
      const dist = _v.copy(b.pos).sub(camPos).length();
      b.dist = dist;
      b.pixR = (b.R / Math.max(dist, 1e-9)) * pxPerRad;
      // Far-away dot
      let dotA = 0;
      if (b.kind !== 'star' && b.kind !== 'blackhole') {
        dotA = 1 - THREE.MathUtils.smoothstep(b.pixR, 1.0, 2.6);
        if (b.parent && b.parent.kind !== 'star') {
          const pd = b.parent.dist ?? dist;
          dotA *= 1 - THREE.MathUtils.smoothstep(pd / b.parent.R, 900, 2500);
        }
        if (!opts.dots) dotA = 0;
      }
      _v.copy(b.pos).sub(camPos);
      dotPos[k * 3] = _v.x; dotPos[k * 3 + 1] = _v.y; dotPos[k * 3 + 2] = _v.z;
      const bright = b.kind === 'moon' ? 0.55 : b.kind === 'comet' ? 0.5 : 0.85;
      dotCol[k * 3] = b.color[0] * bright * dotA; dotCol[k * 3 + 1] = b.color[1] * bright * dotA; dotCol[k * 3 + 2] = b.color[2] * bright * dotA;
      dotSize[k] = (b.kind === 'moon' || b.kind === 'comet' ? 3.0 : 4.0) * dpr;
      b.dotA = dotA;

      if (!b.mesh) continue;
      b.mesh.position.copy(b.pos);
      if (b.kind === 'blackhole') {
        b.mesh.scale.setScalar(b.R);
        const u = b.mesh.material.uniforms;
        u.camPos.value.copy(camPos).sub(b.pos).divideScalar(b.R);
        u.time.value = realT;
        continue;
      }
      b.mesh.quaternion.copy(b.q);
      const ob = b.def.oblate || 1;
      b.mesh.scale.set(b.R, b.R * ob, b.R);
      b.mesh.visible = b.pixR > 0.25;
      const camL = _w.copy(camPos).sub(b.pos).applyQuaternion(b.qInv).divideScalar(b.R);

      if (b.kind === 'star') {
        const u = b.mesh.material.uniforms;
        u.camPos.value.copy(camL);
        u.time.value = realT;
        u.flare.value = b.id === 'proxima' ? this.flare : 0;
        const gu = b.glow.material.uniforms;
        b.glow.position.copy(b.pos);
        const size = Math.max(b.R * 8, dist * 0.09);
        gu.size.value = size;
        gu.coreFrac.value = b.R / size;
        const far = Math.log10(Math.max(dist / b.R, 1));
        gu.glare.value = THREE.MathUtils.clamp(0.1 + 0.2 * far, 0.12, 0.95) * (1 + (b.id === 'proxima' ? this.flare * 2 : 0)) * Math.min(1, 0.35 + b.lum * 20);
        gu.corona.value = 0.9;
        gu.time.value = realT;
        b.glow.visible = true;
        continue;
      }

      // Lighting from the system's stars
      let best = null, bestF = 0, second = null, secondF = 0;
      for (const s of this.stars) {
        const f = s.lum / Math.max(_v.copy(s.pos).sub(b.pos).lengthSq(), 1);
        if (f > bestF) { second = best; secondF = bestF; best = s; bestF = f; } else if (f > secondF) { second = s; secondF = f; }
      }
      const u = b.mesh.material.uniforms;
      u.camPos.value.copy(camL);
      u.detail.value = 1 - THREE.MathUtils.smoothstep(camL.length(), 1.02, 1.35);
      if (best) {
        u.sunDir.value.copy(best.pos).sub(b.pos).normalize().applyQuaternion(b.qInv);
        u.sunCol.value.setRGB(best.tint[0] * 1.15, best.tint[1] * 1.15, best.tint[2] * 1.15);
        if (best.id === 'proxima') u.sunCol.value.multiplyScalar(1 + this.flare * 0.8);
      }
      if (second && u.sun2Dir) {
        const k2 = Math.min(1, secondF / bestF) * 1.15;
        u.sun2Dir.value.copy(second.pos).sub(b.pos).normalize().applyQuaternion(b.qInv);
        u.sun2Col.value.setRGB(second.tint[0] * k2, second.tint[1] * k2, second.tint[2] * k2);
      }
      if (b.def.clouds === 'earth') u.cloudShift.value = (((d - 9765) * 0.0015) % 1 + 1) % 1;
      if (b.def.clouds === 'eyeball') u.cloudShift.value = (d * 0.004) % 1;
      if (b.atmo) {
        const au = b.atmo.material.uniforms;
        au.camPos.value.copy(camL);
        au.sunDir.value.copy(u.sunDir.value);
        au.sunCol.value.copy(u.sunCol.value);
        const inside = camL.length() < au.Ra.value * 1.001;
        b.atmo.material.side = inside ? THREE.BackSide : THREE.FrontSide;
        b.atmo.material.depthTest = !inside;
      }
      if (b.rings) {
        const ru = b.rings.material.uniforms;
        ru.camPos.value.copy(camL);
        ru.sunDir.value.copy(u.sunDir.value);
        ru.sunCol.value.copy(u.sunCol.value);
      }
      if (b.coma) this.updateComet(b, d, camera, dist);
    }
    this.dots.geometry.attributes.position.needsUpdate = true;
    this.dots.geometry.attributes.color.needsUpdate = true;
    this.dots.geometry.attributes.size.needsUpdate = true;

    // Orbit lines follow their parent; hide a planet's own line when close.
    for (const b of this.orbitLines) {
      const line = b.orbitLine;
      line.position.copy(b.parent.pos);
      let show = opts.orbits;
      if (show && b.parent.kind !== 'star') show = b.parent.dist / b.parent.R < 600;
      if (show) {
        const near = b.dist / b.R;
        line.material.uniforms.opacity.value = (b.parent.kind !== 'star' ? 0.28 : 0.3) * THREE.MathUtils.smoothstep(near, 30, 200);
      }
      line.visible = show;
    }
    if (this.belts) {
      for (const p of this.belts) {
        p.material.uniforms.days.value = d;
        p.material.uniforms.pxSize.value = 1.6 * dpr;
      }
    }
  }

  updateComet(b, d, camera, dist) {
    const sun = this.stars[0];
    const toSun = _v.copy(b.pos).sub(sun.pos);
    const rAU = toSun.length() / AU;
    const act = Math.pow(THREE.MathUtils.clamp((4.2 - rAU) / 3.4, 0, 1), 1.6);
    const axisW = toSun.normalize();
    const vel = this.positionAt(b, d + 0.2, new THREE.Vector3()).sub(b.pos).normalize();
    const view = camera.matrixWorldInverse;
    const len = act * 0.3 * AU / Math.sqrt(Math.max(rAU, 0.3));
    for (const [m, bend, w] of [[b.ionTail, 0, 0.05], [b.dustTail, 0.35, 0.16]]) {
      const u = m.material.uniforms;
      m.position.copy(b.pos);
      u.axisV.value.copy(axisW).transformDirection(view);
      u.bendV.value.copy(vel).multiplyScalar(-bend).transformDirection(view).multiplyScalar(bend);
      u.len.value = len;
      u.width.value = len * w;
      u.strength.value = act * (m === b.ionTail ? 0.9 : 1.1) * THREE.MathUtils.clamp(dist / (len * 0.03 + 1e-6), 0.03, 1);
      m.visible = act > 0.001;
    }
    const cu = b.coma.material.uniforms;
    b.coma.position.copy(b.pos);
    const coma = act * 100000 / KM_PER_UNIT;
    cu.size.value = Math.max(coma * 4, dist * 0.02 * act);
    cu.coreFrac.value = Math.max(b.R / cu.size.value, 1e-4);
    // Inside the coma it's a faint haze, not a wall of light.
    cu.glare.value = act * (0.015 + 0.6 * THREE.MathUtils.smoothstep(dist, coma * 0.5, coma * 6));
    cu.corona.value = 0;
    b.coma.visible = act > 0.001;
  }

  // Closest body surface to point p: { body, surf } in scene units.
  nearest(p) {
    let best = null, bestS = Infinity;
    for (const b of this.bodies) {
      const s = _v.copy(b.pos).sub(p).length() - b.R;
      if (s < bestS) { bestS = s; best = b; }
    }
    return { body: best, surf: bestS };
  }

  dispose() {
    if (!this.bodies.length) return;
    this.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    for (const b of this.bodies) {
      if (b.tex) b.tex.dispose();
      if (b.ringTex) b.ringTex.dispose();
    }
    this.root.clear();
    this.bodies = [];
    this.byId = {};
    this.belts = null;
    this.hasPos = false;
  }
}
