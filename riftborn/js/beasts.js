/* Riftborn — 3D creatures. Every species is modelled in code: a skinned
   mesh swept along a bone rig (tail, spine, neck, head, legs, arms or
   wings), wrapped in generated scaly skin with countershading and
   markings, with rigid parts (eyes, teeth, claws, horns, frills, plates)
   riding on the bones. Legs walk with inverse kinematics so feet plant on
   the ground; tails sway, jaws open to roar, wings flap.

   Model space: y up, the creature faces +z, and its height is about one
   unit. Scale the returned object by the species' size in meters. */
window.RB = window.RB || {};
(function (RB) {
  'use strict';

  const T = window.THREE;
  const G = RB.gfx;
  const C = RB.creatures;
  const { rng, clamp } = RB.util;
  const V = (x, y, z) => new T.Vector3(x, y, z);

  /* ======================= Body plans ======================= */

  // spine: [z, y, halfWidth, halfHeight] from tail tip to snout tip.
  // hip: the root joint. tail/front: joints that carry bones, going out
  // from the hip. Legs: [z, y] joints hip → knee → ankle → ball → toe tip.
  const PLANS = {
    raptor: {
      spine: [[-1.05, 0.72, 0.006, 0.006], [-0.88, 0.71, 0.025, 0.03], [-0.66, 0.68, 0.045, 0.055], [-0.44, 0.65, 0.07, 0.085], [-0.22, 0.62, 0.1, 0.12],
        [0, 0.6, 0.125, 0.15], [0.14, 0.6, 0.13, 0.155], [0.27, 0.64, 0.11, 0.13], [0.36, 0.73, 0.065, 0.07], [0.42, 0.84, 0.055, 0.058],
        [0.48, 0.92, 0.062, 0.07], [0.58, 0.925, 0.05, 0.054], [0.68, 0.905, 0.034, 0.037], [0.75, 0.885, 0.01, 0.012]],
      hip: 5, tail: [4, 3, 2, 1], front: [7, 8, 9, 10],
      jaw: { at: [0.46, 0.862], pts: [[0, 0, 0.05, 0.028], [0.1, -0.012, 0.043, 0.024], [0.19, -0.022, 0.03, 0.018], [0.275, -0.032, 0.008, 0.007]] },
      eye: [0.53, 0.945, 0.05, 0.019], teeth: 0.02,
      legs: [{ parent: 'hip', x: 0.09, pts: [[0.02, 0.56], [0.1, 0.34], [-0.02, 0.13], [0.06, 0.02], [0.13, 0.01]], r: [0.085, 0.048, 0.03, 0.022, 0.012], knee: true, phase: [0, Math.PI], toes: 3 }],
      arms: { x: 0.075, pts: [[0.27, 0.6], [0.3, 0.5], [0.39, 0.47], [0.45, 0.445]], r: [0.034, 0.024, 0.017, 0.008] },
      stride: 0.2, lift: 0.08,
    },
    rex: {
      spine: [[-1.1, 0.62, 0.008, 0.008], [-0.9, 0.63, 0.05, 0.055], [-0.66, 0.62, 0.09, 0.1], [-0.42, 0.6, 0.14, 0.16], [-0.2, 0.58, 0.19, 0.22],
        [0, 0.57, 0.22, 0.25], [0.16, 0.59, 0.22, 0.26], [0.3, 0.64, 0.18, 0.22], [0.38, 0.74, 0.125, 0.135], [0.44, 0.82, 0.115, 0.125],
        [0.51, 0.87, 0.11, 0.14], [0.64, 0.86, 0.095, 0.11], [0.78, 0.83, 0.072, 0.08], [0.88, 0.8, 0.045, 0.05], [0.93, 0.78, 0.012, 0.012]],
      hip: 5, tail: [4, 3, 2, 1], front: [7, 8, 9, 10],
      jaw: { at: [0.49, 0.79], pts: [[0, 0, 0.1, 0.05], [0.15, -0.012, 0.085, 0.045], [0.29, -0.03, 0.06, 0.034], [0.41, -0.042, 0.015, 0.012]] },
      eye: [0.58, 0.93, 0.09, 0.024], teeth: 0.035,
      legs: [{ parent: 'hip', x: 0.15, pts: [[0.02, 0.55], [0.12, 0.33], [-0.02, 0.13], [0.07, 0.02], [0.17, 0.01]], r: [0.13, 0.085, 0.065, 0.05, 0.03], knee: true, phase: [0, Math.PI], toes: 3 }],
      arms: { x: 0.12, pts: [[0.3, 0.56], [0.33, 0.5], [0.38, 0.49], [0.41, 0.47]], r: [0.04, 0.03, 0.02, 0.009] },
      stride: 0.2, lift: 0.07,
    },
    horned: {
      spine: [[-0.92, 0.36, 0.006, 0.006], [-0.76, 0.41, 0.04, 0.045], [-0.58, 0.47, 0.08, 0.09], [-0.42, 0.52, 0.14, 0.15], [-0.26, 0.56, 0.24, 0.24],
        [-0.02, 0.58, 0.3, 0.28], [0.24, 0.55, 0.26, 0.25], [0.4, 0.5, 0.15, 0.16], [0.53, 0.47, 0.14, 0.16], [0.67, 0.42, 0.1, 0.11],
        [0.78, 0.35, 0.06, 0.07], [0.84, 0.3, 0.012, 0.012]],
      hip: 4, tail: [3, 2, 1], front: [6, 7, 8],
      jaw: { at: [0.56, 0.37], pts: [[0, 0, 0.09, 0.05], [0.12, -0.03, 0.065, 0.04], [0.25, -0.075, 0.015, 0.012]] },
      eye: [0.61, 0.52, 0.12, 0.022], beak: true,
      legs: [
        { parent: 'hip', x: 0.2, pts: [[-0.28, 0.5], [-0.22, 0.3], [-0.3, 0.12], [-0.26, 0.02], [-0.2, 0]], r: [0.13, 0.09, 0.075, 0.07, 0.05], knee: true, phase: [0, Math.PI], toes: 4, hoof: true },
        { parent: 'chest', x: 0.19, pts: [[0.26, 0.45], [0.22, 0.27], [0.27, 0.1], [0.29, 0.02], [0.34, 0]], r: [0.11, 0.08, 0.07, 0.065, 0.045], knee: false, phase: [Math.PI * 0.5, Math.PI * 1.5], toes: 4, hoof: true },
      ],
      stride: 0.13, lift: 0.06,
    },
    plated: {
      spine: [[-1.05, 0.5, 0.008, 0.008], [-0.86, 0.56, 0.04, 0.045], [-0.64, 0.62, 0.08, 0.09], [-0.42, 0.66, 0.14, 0.16], [-0.2, 0.66, 0.24, 0.26],
        [0.06, 0.6, 0.27, 0.27], [0.3, 0.48, 0.2, 0.2], [0.46, 0.38, 0.1, 0.1], [0.58, 0.32, 0.07, 0.075], [0.68, 0.28, 0.05, 0.05], [0.75, 0.25, 0.012, 0.012]],
      hip: 4, tail: [3, 2, 1], front: [6, 7, 8],
      jaw: { at: [0.58, 0.285], pts: [[0, 0, 0.05, 0.03], [0.1, -0.02, 0.04, 0.025], [0.17, -0.035, 0.012, 0.01]] },
      eye: [0.62, 0.335, 0.058, 0.014], beak: true,
      legs: [
        { parent: 'hip', x: 0.18, pts: [[-0.2, 0.58], [-0.14, 0.34], [-0.22, 0.13], [-0.18, 0.02], [-0.12, 0]], r: [0.13, 0.085, 0.07, 0.065, 0.045], knee: true, phase: [0, Math.PI], toes: 4, hoof: true },
        { parent: 'chest', x: 0.16, pts: [[0.3, 0.4], [0.27, 0.24], [0.31, 0.09], [0.32, 0.02], [0.36, 0]], r: [0.09, 0.07, 0.06, 0.055, 0.04], knee: false, phase: [Math.PI * 0.5, Math.PI * 1.5], toes: 4, hoof: true },
      ],
      stride: 0.12, lift: 0.06,
    },
    longneck: {
      spine: [[-1.18, 0.28, 0.006, 0.006], [-0.98, 0.33, 0.03, 0.035], [-0.76, 0.38, 0.06, 0.07], [-0.52, 0.43, 0.1, 0.11], [-0.3, 0.47, 0.17, 0.19],
        [-0.16, 0.5, 0.22, 0.23], [0.05, 0.52, 0.25, 0.25], [0.26, 0.53, 0.2, 0.21], [0.4, 0.62, 0.11, 0.11], [0.47, 0.76, 0.085, 0.085],
        [0.51, 0.9, 0.07, 0.07], [0.57, 1.04, 0.058, 0.062], [0.66, 1.05, 0.04, 0.042], [0.72, 1.03, 0.01, 0.01]],
      hip: 5, tail: [4, 3, 2, 1], front: [7, 8, 9, 10, 11],
      jaw: { at: [0.57, 1.015], pts: [[0, 0, 0.04, 0.025], [0.08, 0, 0.032, 0.02], [0.145, -0.005, 0.01, 0.008]] },
      eye: [0.6, 1.07, 0.048, 0.014], beak: true,
      legs: [
        { parent: 'hip', x: 0.17, pts: [[-0.18, 0.45], [-0.15, 0.27], [-0.18, 0.1], [-0.17, 0.02], [-0.13, 0]], r: [0.12, 0.09, 0.08, 0.075, 0.05], knee: true, phase: [0, Math.PI], toes: 4, hoof: true },
        { parent: 'chest', x: 0.16, pts: [[0.26, 0.45], [0.26, 0.27], [0.26, 0.1], [0.27, 0.02], [0.31, 0]], r: [0.1, 0.08, 0.075, 0.07, 0.05], knee: false, phase: [Math.PI * 0.5, Math.PI * 1.5], toes: 4, hoof: true },
      ],
      stride: 0.11, lift: 0.05,
    },
    flyer: {
      spine: [[-0.42, 0.6, 0.005, 0.005], [-0.3, 0.6, 0.02, 0.02], [-0.16, 0.6, 0.06, 0.065], [0, 0.62, 0.085, 0.09], [0.1, 0.64, 0.07, 0.075],
        [0.18, 0.7, 0.04, 0.042], [0.25, 0.76, 0.035, 0.036], [0.3, 0.79, 0.042, 0.05], [0.42, 0.77, 0.028, 0.03], [0.56, 0.745, 0.014, 0.014], [0.68, 0.725, 0.004, 0.004]],
      hip: 2, tail: [1], front: [4, 5, 6, 7],
      jaw: { at: [0.3, 0.772], pts: [[0, 0, 0.034, 0.018], [0.14, -0.024, 0.02, 0.011], [0.37, -0.05, 0.004, 0.004]] },
      eye: [0.325, 0.81, 0.036, 0.012], beak: true,
      legs: [{ parent: 'hip', x: 0.05, pts: [[-0.15, 0.58], [-0.2, 0.5], [-0.28, 0.46], [-0.31, 0.45], [-0.34, 0.445]], r: [0.03, 0.02, 0.013, 0.01, 0.006], knee: false, dangle: true, toes: 3 }],
      wing: { pts: [[0.06, 0.665, 0.08], [0.3, 0.68, 0.14], [0.55, 0.68, 0.12], [1.05, 0.66, -0.12]], r: [0.03, 0.022, 0.016, 0.004], root: [0.05, 0.6, -0.16] },
    },
  };

  /* ======================= Geometry builder ======================= */

  class Acc {
    constructor(skinned) {
      this.skinned = skinned;
      this.pos = []; this.uv = []; this.si = []; this.sw = []; this.idx = [];
      this.groups = []; this.seams = [];
      this.bones = null;
    }
    get n() { return this.pos.length / 3; }
    vert(p, u, v, w) {
      this.pos.push(p.x, p.y, p.z);
      this.uv.push(u, v);
      if (this.skinned) {
        const ws = w.slice().sort((a, b) => b[1] - a[1]).slice(0, 4);
        let sum = 0;
        for (const x of ws) sum += x[1];
        for (let i = 0; i < 4; i++) {
          this.si.push(ws[i] ? ws[i][0] : 0);
          this.sw.push(ws[i] ? ws[i][1] / (sum || 1) : 0);
        }
      }
      return this.n - 1;
    }
    tri(a, b, c) { this.idx.push(a, b, c); }
    begin() { this._start = this.idx.length; }
    end(mat) {
      const count = this.idx.length - this._start;
      const last = this.groups[this.groups.length - 1];
      if (last && last.mat === mat && last.start + last.count === this._start) last.count += count;
      else this.groups.push({ start: this._start, count, mat });
    }
    geometry() {
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(this.pos, 3));
      g.setAttribute('uv', new T.Float32BufferAttribute(this.uv, 2));
      if (this.skinned) {
        g.setAttribute('skinIndex', new T.Uint16BufferAttribute(this.si, 4));
        g.setAttribute('skinWeight', new T.Float32BufferAttribute(this.sw, 4));
      }
      g.setIndex(this.idx);
      g.computeVertexNormals();
      // Weld normals across the texture seam of each ring.
      const nm = g.attributes.normal;
      const a = new T.Vector3(), b = new T.Vector3();
      for (const [i, j] of this.seams) {
        a.fromBufferAttribute(nm, i);
        b.fromBufferAttribute(nm, j);
        a.add(b).normalize();
        nm.setXYZ(i, a.x, a.y, a.z);
        nm.setXYZ(j, a.x, a.y, a.z);
      }
      for (const gr of this.groups) g.addGroup(gr.start, gr.count, gr.mat);
      g.computeBoundingSphere();
      return g;
    }
  }

  const cat = (p0, p1, p2, p3, t) => {
    const t2 = t * t, t3 = t2 * t;
    return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  };

  // Sample a smooth tube through joints [{p, hw, hh}] every `step` units.
  function sample(J, step) {
    const out = [];
    for (let i = 0; i < J.length - 1; i++) {
      const a = J[Math.max(0, i - 1)], b = J[i], c = J[i + 1], d = J[Math.min(J.length - 1, i + 2)];
      const n = Math.max(1, Math.ceil(b.p.distanceTo(c.p) / step));
      for (let s = 0; s < n; s++) {
        const t = s / n;
        const lo = Math.min(b.hw, c.hw, b.hh, c.hh) * 0.6;
        out.push({
          p: V(cat(a.p.x, b.p.x, c.p.x, d.p.x, t), cat(a.p.y, b.p.y, c.p.y, d.p.y, t), cat(a.p.z, b.p.z, c.p.z, d.p.z, t)),
          hw: Math.max(lo, cat(a.hw, b.hw, c.hw, d.hw, t), 0.002),
          hh: Math.max(lo, cat(a.hh, b.hh, c.hh, d.hh, t), 0.002),
          param: i + t,
        });
      }
    }
    const e = J[J.length - 1];
    out.push({ p: e.p.clone(), hw: e.hw, hh: e.hh, param: J.length - 1 });
    return out;
  }

  // Sweep an elliptical cross-section along joints. opts: segs, step, side
  // (reference axis for the ring's width), u0/u1 (texture range), weight
  // (param → [[bone, w]]), mat, ridge (a slight spine ridge on top).
  function sweep(acc, J, opts) {
    const segs = opts.segs || 16;
    const S = sample(J, opts.step || 0.02);
    const side = opts.side || V(1, 0, 0);
    let len = 0;
    const arc = [0];
    for (let k = 1; k < S.length; k++) { len += S[k].p.distanceTo(S[k - 1].p); arc.push(len); }
    const tan = new T.Vector3(), nrm = new T.Vector3(), sd = new T.Vector3(), q = new T.Vector3();
    let lastN = V(0, 1, 0);
    const rings = [];
    acc.begin();
    for (let k = 0; k < S.length; k++) {
      const a = S[Math.max(0, k - 1)].p, b = S[Math.min(S.length - 1, k + 1)].p;
      tan.subVectors(b, a).normalize();
      nrm.crossVectors(tan, side);
      if (nrm.lengthSq() < 1e-6) nrm.copy(lastN); else nrm.normalize();
      lastN.copy(nrm);
      sd.crossVectors(nrm, tan).normalize();
      const w = opts.weight ? opts.weight(S[k].param) : null;
      const u = (opts.u0 || 0) + ((opts.u1 == null ? 1 : opts.u1) - (opts.u0 || 0)) * (arc[k] / (len || 1));
      const base = acc.n;
      for (let j = 0; j <= segs; j++) {
        const al = j / segs * Math.PI * 2;
        const sa = Math.sin(al), ca = Math.cos(al);
        let up = -ca * S[k].hh;
        if (opts.ridge && ca < 0) up -= Math.pow(-ca, 12) * S[k].hh * opts.ridge;
        q.copy(S[k].p).addScaledVector(sd, sa * S[k].hw).addScaledVector(nrm, up);
        acc.vert(q, u, j / segs, w);
      }
      acc.seams.push([base, base + segs]);
      rings.push({ base, p: S[k].p.clone(), hw: S[k].hw, hh: S[k].hh, nrm: nrm.clone(), sd: sd.clone(), tan: tan.clone(), param: S[k].param, w });
      if (k > 0) {
        const pb = rings[k - 1].base;
        for (let j = 0; j < segs; j++) {
          const A = pb + j, D = pb + j + 1, B = base + j, Cc = base + j + 1;
          acc.tri(A, D, B);
          acc.tri(B, D, Cc);
        }
      }
    }
    // Caps
    const cap = (ring, dir, end) => {
      const c = acc.vert(ring.p.clone().addScaledVector(ring.tan, dir * Math.min(ring.hw, ring.hh) * 0.6), opts.u1 == null ? (end ? 1 : 0) : (end ? opts.u1 : opts.u0 || 0), 0.5, ring.w);
      for (let j = 0; j < segs; j++) {
        if (end) acc.tri(ring.base + j, ring.base + j + 1, c);
        else acc.tri(ring.base + j, c, ring.base + j + 1);
      }
    };
    cap(rings[0], -1, false);
    cap(rings[rings.length - 1], 1, true);
    acc.end(opts.mat || 0);
    return rings;
  }

  // Skin weights along a chain of bones placed at positions `pos` (in the
  // chain's parameter units). Neighbouring bones blend across each joint.
  function chainWeights(pos, bones, d) {
    const n = pos.length;
    let k = 0;
    while (k < n - 1 && d >= pos[k + 1]) k++;
    const L = k < n - 1 ? pos[k + 1] - pos[k] : (k > 0 ? pos[k] - pos[k - 1] : 1);
    const f = Math.max(0, (d - pos[k]) / L);
    const wp = k > 0 ? Math.max(0, 0.35 - f) / 0.7 : 0;
    const wn = k < n - 1 ? Math.max(0, f - 0.65) / 0.7 : 0;
    const out = [[bones[k], 1 - wp - wn]];
    if (wp > 0) out.push([bones[k - 1], wp]);
    if (wn > 0) out.push([bones[k + 1], wn]);
    return out;
  }

  /* ======================= Skin textures ======================= */

  const hex = (c) => new T.Color(c);
  const css = (col) => `#${col.getHexString()}`;
  const mixc = (a, b, k) => hex(a).lerp(hex(b), k);

  // Real animals are rarely neon: tone the species' colours down to
  // natural, earthy versions (fantasy Void and glowing species keep more).
  function natural(sp) {
    const fantasy = sp.el === 'void' || sp.feat.has('glow');
    return sp.col.map((c, i) => {
      const col = hex(c), hsl = {};
      col.getHSL(hsl);
      const sat = hsl.s * (fantasy ? 0.9 : i === 2 ? 0.78 : 0.62);
      const lum = clamp(hsl.l * (i === 1 ? 0.95 : 1), 0.1, i === 1 ? 0.78 : 0.62);
      return css(col.setHSL(hsl.h, sat, lum));
    });
  }

  function skinTextures(sp, r) {
    const [dorsal, belly, accent] = sp.col;
    const W = 1024, H = 512;
    const c = G.canvas(W, H), g = c.getContext('2d');
    // Countershading: pale belly (top and bottom rows), dark back (middle).
    const gr = g.createLinearGradient(0, 0, 0, H);
    const flank = css(mixc(dorsal, belly, 0.35));
    const back = css(hex(dorsal).multiplyScalar(0.72));
    gr.addColorStop(0, belly); gr.addColorStop(0.18, belly); gr.addColorStop(0.32, flank);
    gr.addColorStop(0.43, dorsal); gr.addColorStop(0.5, back); gr.addColorStop(0.57, dorsal);
    gr.addColorStop(0.68, flank); gr.addColorStop(0.82, belly); gr.addColorStop(1, belly);
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
    // Soft shapes are drawn on a layer, which is then blurred onto the skin
    // in one go (blurring each shape on its own is very slow).
    const layer = G.canvas(W, H), lay = layer.getContext('2d');
    const soft = (px, draw) => {
      lay.clearRect(0, 0, W, H);
      draw(lay);
      try { g.filter = `blur(${px}px)`; } catch (e) { /* older browsers: sharp edges */ }
      g.drawImage(layer, 0, 0);
      try { g.filter = 'none'; } catch (e) { /* ignore */ }
    };
    // Soft, uneven boundary between back and belly.
    soft(6, (x) => {
      for (let i = 0; i < 90; i++) {
        const px = r() * W, top = r() < 0.5;
        x.fillStyle = top ? flank : dorsal;
        x.globalAlpha = 0.35;
        x.beginPath(); x.ellipse(px, H * (top ? 0.3 : 0.7) + (r() - 0.5) * 30, 14 + r() * 30, 8 + r() * 16, 0, 0, Math.PI * 2); x.fill();
      }
      x.globalAlpha = 1;
    });
    // Big soft blotches (like a crocodile's or a monitor lizard's).
    soft(4, (x) => {
      for (let i = 0; i < 160; i++) {
        const px = r() * W, y = H * (0.28 + r() * 0.44), rad = 6 + r() * 22;
        x.fillStyle = r() < 0.6 ? 'rgba(20,12,6,0.16)' : 'rgba(255,248,230,0.08)';
        x.beginPath(); x.ellipse(px, y, rad * 1.5, rad, r() * 3, 0, Math.PI * 2); x.fill();
      }
    });
    const glow = sp.feat.has('glow') ? G.canvas(W, H) : null;
    const gg = glow && glow.getContext('2d');
    if (gg) { gg.fillStyle = '#000'; gg.fillRect(0, 0, W, H); }
    const elc = C.ELEMENTS[sp.el].color;
    // An irregular stripe from the spine down one flank and the other.
    const band = (ctx, x, w, color, alpha, spread) => {
      ctx.fillStyle = color;
      ctx.globalAlpha = alpha;
      for (const half of [-1, 1]) {
        ctx.beginPath();
        const y0 = H * 0.5, y1 = H * (0.5 + half * spread);
        const lean = (r() - 0.3) * w * 1.4;
        ctx.moveTo(x - w / 2, y0);
        for (let k = 0; k <= 10; k++) { const f = k / 10; ctx.lineTo(x - w / 2 * (1 - f * 0.7) + lean * f + Math.sin(k * 1.9 + x) * w * 0.25, y0 + (y1 - y0) * f); }
        for (let k = 10; k >= 0; k--) { const f = k / 10; ctx.lineTo(x + w / 2 * (1 - f * 0.7) + lean * f + Math.sin(k * 1.4 + x * 0.7) * w * 0.25, y0 + (y1 - y0) * f); }
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
    if (sp.feat.has('stripes')) {
      const n = 11 + Math.floor(r() * 4);
      const xs = [];
      soft(2.5, (ctx) => {
        for (let i = 0; i < n; i++) {
          const x = W * (0.1 + 0.7 * i / (n - 1)) + (r() - 0.5) * 20;
          const w = 12 + r() * 14;
          xs.push([x, w]);
          band(ctx, x, w, css(hex(accent).multiplyScalar(0.85)), 0.62, 0.17 + r() * 0.06);
        }
      });
      if (gg) for (const [x, w] of xs) band(gg, x, w * 0.6, elc, 1, 0.14);
    }
    if (sp.feat.has('spots')) {
      soft(2, (ctx) => {
        for (let i = 0; i < 170; i++) {
          const x = r() * W, y = H * (0.27 + r() * 0.46), rad = 4 + r() * 11;
          ctx.fillStyle = r() < 0.6 ? accent : css(hex(belly).multiplyScalar(1.02));
          ctx.globalAlpha = 0.5 + r() * 0.2;
          ctx.beginPath(); ctx.ellipse(x, y, rad * (1.2 + r() * 0.6), rad, r() * 3, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
      });
    }
    // Fine speckle and a row of darker scutes along the spine.
    for (let i = 0; i < 6000; i++) {
      g.fillStyle = r() < 0.55 ? 'rgba(0,0,0,0.12)' : 'rgba(255,250,235,0.07)';
      g.fillRect(r() * W, r() * H, 1 + r() * 2, 1 + r() * 2);
    }
    for (let x = 0; x < W; x += 9 + r() * 4) {
      g.fillStyle = `rgba(15,10,6,${0.18 + r() * 0.12})`;
      g.beginPath(); g.ellipse(x, H * 0.5, 3.5, 5, 0, 0, Math.PI * 2); g.fill();
    }
    if (gg) {
      // Glowing markings along the back and flanks.
      gg.fillStyle = elc;
      for (let i = 0; i < 40; i++) {
        const x = W * (0.05 + 0.85 * i / 40);
        gg.beginPath(); gg.ellipse(x, H * 0.5, 7, 5, 0, 0, Math.PI * 2); gg.fill();
        gg.beginPath(); gg.ellipse(x + 12, H * 0.37, 4, 3, 0, 0, Math.PI * 2); gg.fill();
        gg.beginPath(); gg.ellipse(x + 12, H * 0.63, 4, 3, 0, 0, Math.PI * 2); gg.fill();
      }
    }
    // Limb texture: same colouring, darker and rougher towards the feet.
    const lc = G.canvas(512, 256), lg = lc.getContext('2d');
    const lgr = lg.createLinearGradient(0, 0, 0, 256);
    lgr.addColorStop(0, belly); lgr.addColorStop(0.3, flank); lgr.addColorStop(0.5, dorsal);
    lgr.addColorStop(0.7, flank); lgr.addColorStop(1, belly);
    lg.fillStyle = lgr;
    lg.fillRect(0, 0, 512, 256);
    const fade = lg.createLinearGradient(0, 0, 512, 0);
    fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(0.5, 'rgba(0,0,0,0.08)'); fade.addColorStop(1, 'rgba(22,16,12,0.6)');
    lg.fillStyle = fade;
    lg.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 3000; i++) {
      lg.fillStyle = r() < 0.55 ? 'rgba(0,0,0,0.12)' : 'rgba(255,250,235,0.06)';
      lg.fillRect(r() * 512, r() * 256, 1 + r() * 2, 1 + r() * 2);
    }
    return { skin: G.texture(c), limb: G.texture(lc), glow: glow ? G.texture(glow) : null };
  }

  // Shared, tileable reptile scales from a Voronoi pattern: a normal map for
  // the raised scales, and an occlusion/roughness map (red: grooves darken
  // the ambient light; green: grooves are rough, scale tops a bit glossy).
  let scaleSet = null;
  function scaleMaps() {
    if (scaleSet) return scaleSet;
    const N = 256, cells = 16;
    const r = rng('scales-v2');
    const seed = [];
    for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) seed.push([(i + 0.1 + r() * 0.8) / cells, (j + 0.1 + r() * 0.8) / cells, r()]);
    const hgt = new Float32Array(N * N), groove = new Float32Array(N * N);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const px = (x + 0.5) / N, py = (y + 0.5) / N;
        const ci = Math.floor(px * cells), cj = Math.floor(py * cells);
        let d1 = 9, d2 = 9, k1 = 0;
        for (let dj = -2; dj <= 2; dj++) {
          for (let di = -2; di <= 2; di++) {
            const ii = (ci + di + cells) % cells, jj = (cj + dj + cells) % cells;
            const sd = seed[jj * cells + ii];
            const sx = sd[0] + Math.floor((ci + di) / cells) * 1, sy = sd[1] + Math.floor((cj + dj) / cells) * 1;
            const d = Math.hypot(px - sx, py - sy);
            if (d < d1) { d2 = d1; d1 = d; k1 = sd[2]; } else if (d < d2) d2 = d;
          }
        }
        const edge = clamp((d2 - d1) * cells * 2.2, 0, 1);
        const dome = 1 - clamp(d1 * cells * 0.9, 0, 1);
        hgt[y * N + x] = Math.pow(edge, 0.55) * (0.7 + 0.3 * k1) + dome * 0.25;
        groove[y * N + x] = edge;
      }
    }
    const nc = G.canvas(N, N), oc = G.canvas(N, N);
    const nd = nc.getContext('2d').createImageData(N, N), od = oc.getContext('2d').createImageData(N, N);
    const at = (x, y) => hgt[((y + N) % N) * N + ((x + N) % N)];
    const K = 2.6;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const dx = (at(x + 1, y) - at(x - 1, y)) * K, dy = (at(x, y + 1) - at(x, y - 1)) * K;
        const len = Math.hypot(dx, dy, 1);
        const o = (y * N + x) * 4;
        nd.data[o] = (-dx / len * 0.5 + 0.5) * 255;
        nd.data[o + 1] = (dy / len * 0.5 + 0.5) * 255;
        nd.data[o + 2] = (1 / len * 0.5 + 0.5) * 255;
        nd.data[o + 3] = 255;
        const e = groove[y * N + x];
        od.data[o] = (0.35 + 0.65 * Math.pow(e, 0.5)) * 255;
        od.data[o + 1] = (0.95 - 0.4 * e) * 255;
        od.data[o + 2] = 0;
        od.data[o + 3] = 255;
      }
    }
    nc.getContext('2d').putImageData(nd, 0, 0);
    oc.getContext('2d').putImageData(od, 0, 0);
    const wrap = (t) => { t.wrapS = t.wrapT = T.RepeatWrapping; return t; };
    scaleSet = { normal: wrap(G.texture(nc, false)), orm: wrap(G.texture(oc, false)) };
    return scaleSet;
  }

  // A reptile eye: golden iris with streaks, a dark rim and a slit pupil.
  // Mapped so the middle of the texture faces +x on a sphere.
  function eyeTexture(sp) {
    const c = G.canvas(256, 128), g = c.getContext('2d');
    g.fillStyle = '#1A120C';
    g.fillRect(0, 0, 256, 128);
    const col = hex(sp.eye);
    const iris = g.createRadialGradient(128, 64, 4, 128, 64, 34);
    iris.addColorStop(0, css(col.clone().multiplyScalar(1.1)));
    iris.addColorStop(0.55, css(col));
    iris.addColorStop(0.85, css(col.clone().multiplyScalar(0.55)));
    iris.addColorStop(1, '#1A120C');
    g.fillStyle = iris;
    g.beginPath(); g.arc(128, 64, 34, 0, Math.PI * 2); g.fill();
    const r = rng(`eye:${sp.id}`);
    for (let i = 0; i < 70; i++) {
      const a = r() * Math.PI * 2, r0 = 8 + r() * 6, r1 = 20 + r() * 12;
      g.strokeStyle = r() < 0.5 ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,220,0.2)';
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(128 + Math.cos(a) * r0, 64 + Math.sin(a) * r0); g.lineTo(128 + Math.cos(a) * r1, 64 + Math.sin(a) * r1); g.stroke();
    }
    g.fillStyle = '#050403';
    g.beginPath(); g.ellipse(128, 64, 4.5, 24, 0, 0, Math.PI * 2); g.fill();
    return G.texture(c);
  }

  // Wing membrane: thin skin, darker by the arm, with fine stiffening
  // fibres running out to the trailing edge and a few blood vessels.
  function membraneTexture(sp) {
    const c = G.canvas(512, 256), g = c.getContext('2d');
    const base = mixc(sp.col[0], sp.col[2], 0.45);
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, css(base.clone().multiplyScalar(0.55)));
    gr.addColorStop(0.25, css(base.clone().multiplyScalar(0.8)));
    gr.addColorStop(1, css(base.clone().lerp(hex(sp.col[1]), 0.25)));
    g.fillStyle = gr;
    g.fillRect(0, 0, 512, 256);
    const r = rng(`wing:${sp.id}`);
    g.lineWidth = 1;
    for (let i = 0; i < 140; i++) {
      const x = r() * 560 - 24;
      g.strokeStyle = `rgba(0,0,0,${0.08 + r() * 0.1})`;
      g.beginPath(); g.moveTo(x, 20); g.quadraticCurveTo(x + 14, 140, x - 20 + r() * 10, 256); g.stroke();
    }
    g.strokeStyle = 'rgba(90,20,20,0.35)';
    g.lineWidth = 1.6;
    for (let i = 0; i < 7; i++) {
      let x = 30 + i * 70, y = 10;
      g.beginPath(); g.moveTo(x, y);
      while (y < 230) { x += (r() - 0.5) * 18; y += 12 + r() * 16; g.lineTo(x, y); }
      g.stroke();
    }
    // Darker, thicker trailing edge.
    const edge = g.createLinearGradient(0, 220, 0, 256);
    edge.addColorStop(0, 'rgba(0,0,0,0)'); edge.addColorStop(1, 'rgba(0,0,0,0.35)');
    g.fillStyle = edge;
    g.fillRect(0, 220, 512, 36);
    return G.texture(c);
  }

  // Sail: skin stretched over long spines, body colour at the base fading
  // to the accent colour at the top, with the spines showing through.
  function sailTexture(sp) {
    const c = G.canvas(512, 256), g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 256, 0, 0);
    gr.addColorStop(0, sp.col[0]);
    gr.addColorStop(0.55, css(mixc(sp.col[0], sp.col[2], 0.6)));
    gr.addColorStop(1, sp.col[2]);
    g.fillStyle = gr;
    g.fillRect(0, 0, 512, 256);
    const r = rng(`sail:${sp.id}`);
    for (let x = 6; x < 512; x += 16 + r() * 6) {
      g.strokeStyle = 'rgba(20,10,6,0.35)';
      g.lineWidth = 3;
      g.beginPath(); g.moveTo(x, 256); g.lineTo(x + (r() - 0.5) * 8, 10); g.stroke();
      g.strokeStyle = 'rgba(255,245,225,0.15)';
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(x + 2, 256); g.lineTo(x + 2, 12); g.stroke();
    }
    for (let i = 0; i < 2500; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.1)' : 'rgba(255,250,235,0.06)';
      g.fillRect(r() * 512, r() * 256, 2, 2);
    }
    return G.texture(c);
  }

  // Frill: body colour in the middle, bold accent bands to the rim.
  function frillTexture(sp) {
    const c = G.canvas(256, 256), g = c.getContext('2d');
    const gr = g.createRadialGradient(128, 128, 10, 128, 128, 128);
    gr.addColorStop(0, sp.col[0]);
    gr.addColorStop(0.55, css(mixc(sp.col[0], sp.col[2], 0.5)));
    gr.addColorStop(0.8, sp.col[2]);
    gr.addColorStop(1, css(hex(sp.col[0]).multiplyScalar(0.6)));
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = 'rgba(0,0,0,0.18)';
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2;
      g.beginPath(); g.ellipse(128 + Math.cos(a) * 80, 128 + Math.sin(a) * 80, 14, 9, a, 0, Math.PI * 2); g.fill();
    }
    return G.texture(c);
  }

  /* ======================= Assets ======================= */

  const assets = new Map();

  function asset(id) {
    if (assets.has(id)) return assets.get(id);
    const real = C.byId(id);
    const sp = Object.assign({}, real, { col: natural(real) });
    const P = PLANS[sp.plan];
    const r = rng(`beast:${id}`);
    const acc = new Acc(true);
    const bones = [];
    const bi = {};
    const parts = [];
    const addBone = (name, parent, pos) => {
      bi[name] = bones.length;
      bones.push({ name, parent: parent == null ? -1 : bi[parent], pos: pos.clone() });
    };
    const J = P.spine.map(([z, y, hw, hh]) => ({ p: V(0, y, z), hw, hh }));

    // Spine bones: hip is the root; tail bones go back, front bones go forward.
    addBone('hip', null, J[P.hip].p);
    let prev = 'hip';
    P.tail.forEach((j, k) => { addBone(`t${k}`, prev, J[j].p); prev = `t${k}`; });
    prev = 'hip';
    P.front.forEach((j, k) => { addBone(`f${k}`, prev, J[j].p); prev = `f${k}`; });
    const headName = `f${P.front.length - 1}`;
    const chestName = 'f0';
    const tailPos = [0].concat(P.tail.map((j) => P.hip - j));
    const tailBones = ['hip'].concat(P.tail.map((_, k) => `t${k}`)).map((n) => bi[n]);
    const frontPos = [0].concat(P.front.map((j) => j - P.hip));
    const frontBones = ['hip'].concat(P.front.map((_, k) => `f${k}`)).map((n) => bi[n]);
    const spineW = (p) => (p >= P.hip ? chainWeights(frontPos, frontBones, p - P.hip) : chainWeights(tailPos, tailBones, P.hip - p));
    const spine = sweep(acc, J, { segs: 20, step: 0.018, weight: spineW, mat: 0, ridge: sp.plan === 'horned' || sp.plan === 'plated' ? 0 : 0.18 });

    // A ring of the body at a spine param (for placing parts on the surface).
    const ringAt = (param) => {
      let best = spine[0];
      for (const rg of spine) if (Math.abs(rg.param - param) < Math.abs(best.param - param)) best = rg;
      return best;
    };
    const boneAtParam = (param) => {
      const w = spineW(param);
      return w.sort((a, b) => b[1] - a[1])[0][0];
    };
    const ringAtZ = (z, from) => {
      let best = null;
      for (const rg of spine) if (rg.param >= from && (!best || Math.abs(rg.p.z - z) < Math.abs(best.p.z - z))) best = rg;
      return best;
    };

    // Legs
    const legs = [];
    for (const L of P.legs || []) {
      for (const side of [1, -1]) {
        const tag = `${L.parent === 'hip' ? 'b' : 'f'}${side > 0 ? 'L' : 'R'}`;
        // Heavy, muscular thighs that taper to a slim ankle.
        const bulk = L.dangle ? [1, 1, 1, 1, 1] : L.hoof ? [1.22, 1.0, 0.88, 1.22, 1.3] : [1.25, 1.0, 0.8, 0.88, 1];
        const lj = L.pts.map(([z, y], i) => ({ p: V(side * L.x, y, z), hw: L.r[i] * bulk[i] * (i === 0 ? 0.9 : 0.88), hh: L.r[i] * bulk[i] * (i === 0 ? 1.35 : 1.08) }));
        const parentName = L.parent === 'hip' ? 'hip' : chestName;
        const names = [];
        for (let i = 0; i < 4; i++) { const n = `${tag}${i}`; addBone(n, i === 0 ? parentName : names[i - 1], lj[i].p); names.push(n); }
        const ids = names.map((n) => bi[n]);
        // Start the skin a little up inside the body so the thigh blends in.
        const top = { p: lj[0].p.clone().add(V(-side * L.x * 0.6, L.r[0] * 1.2, 0)), hw: L.r[0] * (L.dangle ? 0.8 : 0.95), hh: L.r[0] * (L.dangle ? 1.1 : 1.45) };
        sweep(acc, [top].concat(lj), { segs: 14, step: 0.015, weight: (p) => chainWeights([0, 1, 2, 3], ids, Math.max(0, p - 1)), mat: 1 });
        // Toes and claws on the last bone.
        const ball = lj[3].p, tip = lj[4].p;
        const toeLen = ball.distanceTo(tip) * (L.hoof ? 0.6 : 1.1);
        for (let k = 0; k < L.toes; k++) {
          const spread = (k - (L.toes - 1) / 2) * (L.hoof ? 0.5 : 0.45);
          const dir = V(Math.sin(spread) * side * (L.hoof ? 1 : 1), L.dangle ? -0.4 : -0.08, Math.cos(spread)).normalize();
          if (L.dangle) dir.set(Math.sin(spread) * 0.5, -0.6, -0.6).normalize();
          const base = ball.clone().add(V(0, L.hoof ? -L.r[3] * 0.45 : 0, 0));
          parts.push({ kind: 'skinlimb', bone: names[3], shape: 'toe', len: toeLen, rad: L.r[4] * (L.hoof ? 1.15 : 1.1), pos: base, dir });
          if (L.hoof) parts.push({ kind: 'nail', bone: names[3], shape: 'blob', pos: base.clone().addScaledVector(dir, toeLen * 1.02).add(V(0, L.r[4] * 0.1, 0)), scale: V(L.r[4] * 0.95, L.r[4] * 0.7, L.r[4] * 0.75) });
          else parts.push({ kind: 'claw', bone: names[3], shape: 'claw', len: toeLen * 0.45, rad: L.r[4] * 0.7, pos: base.clone().addScaledVector(dir, toeLen * 0.95), dir: dir.clone().add(V(0, -0.5, 0)).normalize() });
        }

        legs.push({ tag, bones: names, parent: parentName, rest: lj.map((j) => j.p.clone()), knee: L.knee, phase: side > 0 ? L.phase && L.phase[0] : L.phase && L.phase[1], dangle: !!L.dangle, side });
      }
    }

    // Arms (theropods)
    const arms = [];
    if (P.arms) {
      for (const side of [1, -1]) {
        const A = P.arms;
        const aj = A.pts.map(([z, y], i) => ({ p: V(side * A.x, y, z), hw: A.r[i], hh: A.r[i] }));
        const names = [];
        for (let i = 0; i < 3; i++) { const n = `a${side > 0 ? 'L' : 'R'}${i}`; addBone(n, i === 0 ? chestName : names[i - 1], aj[i].p); names.push(n); }
        const top = { p: aj[0].p.clone().add(V(-side * A.x * 0.4, A.r[0] * 0.5, -A.r[0] * 0.3)), hw: A.r[0] * 0.9, hh: A.r[0] };
        sweep(acc, [top].concat(aj), { segs: 10, step: 0.012, weight: (p) => chainWeights([0, 1, 2], names.map((n) => bi[n]), Math.max(0, p - 1)), mat: 1 });
        for (let k = 0; k < 3; k++) {
          const dir = V(side * (k - 1) * 0.3, -0.6, 0.8).normalize();
          parts.push({ kind: 'claw', bone: names[2], shape: 'claw', len: A.r[0] * 1.2, rad: A.r[3] * 0.9, pos: aj[3].p.clone(), dir });
        }
        if (sp.feat.has('feathers')) {
          for (let k = 0; k < 4; k++) {
            const at = aj[1].p.clone().lerp(aj[2].p, k / 3);
            parts.push({ kind: 'accent', bone: names[k < 2 ? 1 : 2], shape: 'quill', len: 0.07 + k * 0.01, rad: 0.01, pos: at, dir: V(side * 0.3, -0.35, -1).normalize() });
          }
        }
        arms.push({ bones: names, side });
      }
    }

    // Wings (flyers): arm bones in 3D with a skinned membrane to the body.
    const wings = [];
    if (P.wing) {
      for (const side of [1, -1]) {
        const Wd = P.wing;
        const wj = Wd.pts.map(([x, y, z], i) => ({ p: V(side * x, y, z), hw: Wd.r[i], hh: Wd.r[i] }));
        const names = [];
        for (let i = 0; i < 3; i++) { const n = `w${side > 0 ? 'L' : 'R'}${i}`; addBone(n, i === 0 ? chestName : names[i - 1], wj[i].p); names.push(n); }
        const ids = names.map((n) => bi[n]);
        sweep(acc, wj, { segs: 8, step: 0.03, side: V(0, 0, 1), weight: (p) => chainWeights([0, 1, 2], ids, p), mat: 1 });
        // Membrane grid: leading edge along the arm, trailing edge from the
        // body back to the wing tip.
        const rootP = V(side * Wd.root[0], Wd.root[1], Wd.root[2]);
        const tip = wj[3].p;
        const lead = sample(wj, 0.05);
        const NU = lead.length - 1, NV = 6;
        const hipB = bi.hip;
        acc.begin();
        const grid = [];
        for (let iu = 0; iu <= NU; iu++) {
          const L = lead[iu];
          const u = iu / NU;
          const trail = rootP.clone().lerp(tip, Math.pow(u, 0.8));
          trail.z += Math.sin(u * Math.PI) * 0.05 * u;   // the trailing edge curves in towards the tip
          trail.y -= Math.sin(u * Math.PI) * 0.015;
          const lw = chainWeights([0, 1, 2], ids, L.param);
          const row = [];
          for (let iv = 0; iv <= NV; iv++) {
            const v = iv / NV;
            const p = L.p.clone().lerp(trail, v);
            const w = lw.map(([b, x]) => [b, x * (1 - v)]);
            w.push([hipB, v * (1 - u)]);
            w.push([ids[2], v * u]);
            const merged = {};
            for (const [b, x] of w) merged[b] = (merged[b] || 0) + x;
            row.push(acc.vert(p, u, v, Object.entries(merged).map(([b, x]) => [+b, x])));
          }
          grid.push(row);
        }
        for (let iu = 0; iu < NU; iu++) {
          for (let iv = 0; iv < NV; iv++) {
            const a = grid[iu][iv], b = grid[iu + 1][iv], c = grid[iu + 1][iv + 1], d = grid[iu][iv + 1];
            if (side > 0) { acc.tri(a, b, d); acc.tri(b, c, d); } else { acc.tri(a, d, b); acc.tri(b, d, c); }
          }
        }
        acc.end(2);
        wings.push({ bones: names, side });
      }
    }

    // Head: jaw bone, eyes, teeth, mouth.
    const head = J[P.front[P.front.length - 1]];
    const jawAt = V(0, P.jaw.at[1], P.jaw.at[0]);
    addBone('jaw', headName, jawAt);
    const jawJ = P.jaw.pts.map(([dz, dy, hw, hh]) => ({ p: V(0, jawAt.y + dy, jawAt.z + dz), hw, hh }));
    const jawAcc = new Acc(false);
    sweep(jawAcc, jawJ, { segs: 14, step: 0.012, u0: 0.86, u1: 1, mat: 0 });
    parts.push({ kind: 'skin', bone: 'jaw', geo: jawAcc.geometry() });
    const jawLen = P.jaw.pts[P.jaw.pts.length - 1][0];
    // Dark mouth lining, seen when the jaw opens.
    const mid = jawAt.clone().add(V(0, 0.012, jawLen * 0.45));
    parts.push({ kind: 'mouth', bone: headName, shape: 'blob', pos: mid, scale: V(P.jaw.pts[0][2] * 0.75, P.jaw.pts[0][3] * 0.5, jawLen * 0.48) });
    parts.push({ kind: 'mouth', bone: 'jaw', shape: 'blob', pos: jawAt.clone().add(V(0, P.jaw.pts[0][3] * 0.55, jawLen * 0.4)), scale: V(P.jaw.pts[0][2] * 0.6, P.jaw.pts[0][3] * 0.35, jawLen * 0.42) });
    if (P.teeth) {
      const n = Math.round(jawLen / 0.022);
      for (let k = 0; k < n; k++) {
        const z = jawAt.z + 0.03 + (jawLen - 0.05) * k / (n - 1);
        const rg = ringAtZ(z, P.front[P.front.length - 1] - 0.5);
        if (!rg) continue;
        for (const s of [1, -1]) {
          const len = P.teeth * (0.7 + 0.5 * Math.sin(k * 2.3) ** 2);
          parts.push({ kind: 'teeth', bone: headName, shape: 'tooth', len, rad: len * 0.28, pos: V(s * rg.hw * 0.72, rg.p.y - rg.hh * 0.78, z), dir: V(0, -1, 0.1).normalize() });
          const jz = z - jawAt.z;
          const f = clamp(jz / jawLen, 0, 1);
          const jy = jawAt.y + P.jaw.pts[0][1] + (P.jaw.pts[P.jaw.pts.length - 1][1]) * f;
          const jw = P.jaw.pts[0][2] * (1 - f * 0.8);
          if (f < 0.9) parts.push({ kind: 'teeth', bone: 'jaw', shape: 'tooth', len: len * 0.8, rad: len * 0.25, pos: V(s * jw * 0.7, jy + P.jaw.pts[0][3] * 0.6, z), dir: V(0, 1, 0.1).normalize() });
        }
      }
    }
    const [ez, ey, ex, er] = P.eye;
    for (const s of [1, -1]) {
      // The eye looks out and a little forward, set in a ring of eyelid.
      const look = V(s * 0.94, 0.05, 0.34).normalize();
      parts.push({ kind: 'eye', bone: headName, shape: 'eye', pos: V(s * ex * 0.97, ey, ez), rad: er, look });
      parts.push({ kind: 'skin', bone: headName, shape: 'lid', pos: V(s * ex * 0.97, ey, ez).addScaledVector(look, er * 0.42), rad: er, look });
      // Brow ridge
      parts.push({ kind: 'skin', bone: headName, shape: 'blob', pos: V(s * ex * 0.92, ey + er * 0.95, ez - er * 0.1), scale: V(er * 0.85, er * 0.5, er * 1.8) });
    }
    // Nostrils near the tip of the snout.
    {
      const tipJ = J[J.length - 1], preJ = J[J.length - 3] || J[J.length - 2];
      const at = preJ.p.clone().lerp(tipJ.p, 0.55);
      const hw = preJ.hw * 0.55 + tipJ.hw * 0.45, hh = preJ.hh * 0.55 + tipJ.hh * 0.45;
      for (const s of [1, -1]) {
        parts.push({ kind: 'nostril', bone: headName, shape: 'blob', pos: at.clone().add(V(s * hw * 0.62, hh * 0.45, 0)), scale: V(hw * 0.2, hh * 0.16, hw * 0.34) });
      }
    }

    // Species features
    const f = sp.feat;
    const horn = (bone, pos, dir, len, rad) => parts.push({ kind: 'horn', bone, shape: 'horn', pos, dir: dir.normalize(), len, rad });
    if (sp.plan === 'horned') {
      if (f.has('frill')) parts.push({ kind: 'frill', bone: headName, shape: 'frill', pos: V(0, head.p.y + 0.1, head.p.z - 0.05), size: 0.4 });
      if (f.has('horns3')) {
        horn(headName, V(0.075, head.p.y + 0.1, head.p.z + 0.07), V(0.12, 0.55, 1), 0.3, 0.032);
        horn(headName, V(-0.075, head.p.y + 0.1, head.p.z + 0.07), V(-0.12, 0.55, 1), 0.3, 0.032);
        horn(headName, V(0, 0.45, 0.74), V(0, 1, 0.5), 0.1, 0.025);
      } else if (f.has('horns1')) {
        horn(headName, V(0, 0.44, 0.73), V(0, 1, 0.35), 0.2, 0.036);
      }
    }
    if (sp.plan === 'plated' && f.has('plates')) {
      let side = 1;
      for (let p = 1.3; p <= P.front[0] + 0.4; p += 0.32) {
        const rg = ringAt(p);
        const mid2 = (P.hip + 0.4);
        const h = 0.2 * Math.exp(-((p - mid2) ** 2) / 3.5) + 0.04;
        parts.push({ kind: 'accent', bone: boneAtParam(p), shape: 'plate', pos: rg.p.clone().addScaledVector(rg.nrm, rg.hh * 0.85).add(V(side * 0.025, 0, 0)), h, tilt: side * 0.14, tan: rg.tan.clone() });
        side = -side;
      }
      for (const s of [1, -1]) {
        for (let k = 0; k < 2; k++) {
          const rg = ringAt(1.2 + k * 0.5);
          horn(boneAtParam(1.2 + k * 0.5), rg.p.clone().add(V(s * rg.hw * 0.6, rg.hh * 0.6, 0)), V(s * 0.7, 0.55, -0.6), 0.16, 0.022);
        }
      }
    }
    if (f.has('spikes') && sp.plan !== 'plated' && !f.has('sail')) {
      // A row of dorsal spikes down the back and tail.
      for (let p = 1.2; p < P.hip + 1.6; p += 0.28) {
        const rg = ringAt(p);
        const s = 0.025 + 0.035 * Math.exp(-((p - P.hip) ** 2) / 4);
        parts.push({ kind: 'horn', bone: boneAtParam(p), shape: 'horn', pos: rg.p.clone().addScaledVector(rg.nrm, rg.hh * 0.85), dir: rg.nrm.clone().addScaledVector(rg.tan, -0.6).normalize(), len: s * 2.2, rad: s * 0.55 });
      }
    }
    if (f.has('crest')) {
      if (sp.plan === 'flyer') {
        parts.push({ kind: 'accent', bone: headName, shape: 'crest', pos: V(0, head.p.y + 0.02, head.p.z - 0.01), pts: [[0.02, 0], [-0.24, 0.2], [-0.12, 0.02]] });
      } else if (sp.plan === 'longneck') {
        for (let p = P.front[0] + 0.2; p < P.front[P.front.length - 1]; p += 0.22) {
          const rg = ringAt(p);
          parts.push({ kind: 'accent', bone: boneAtParam(p), shape: 'horn', pos: rg.p.clone().addScaledVector(rg.nrm, rg.hh * 0.8), dir: rg.nrm.clone().addScaledVector(rg.tan, -0.5).normalize(), len: 0.05, rad: 0.018 });
        }
      } else {
        parts.push({ kind: 'accent', bone: headName, shape: 'crest', pos: V(0, head.p.y + head.hh * 0.8, head.p.z + 0.03), pts: [[0.1, 0], [0.0, 0.07], [-0.08, 0.05], [-0.06, 0]] });
      }
    }
    if (f.has('crown')) {
      for (let k = 0; k < 5; k++) {
        const a = (k - 2) * 0.35;
        horn(headName, V(Math.sin(a) * head.hw * 0.8, head.p.y + head.hh * 0.75, head.p.z - 0.02 + Math.cos(a) * 0.02), V(Math.sin(a) * 0.6, 1, -0.5), 0.13 - Math.abs(k - 2) * 0.02, 0.022);
      }
    }
    // A tall sail of skin on long spines down the back (like Spinosaurus),
    // in panels that ride the spine bones.
    if (f.has('sail')) {
      const p0 = P.hip - 2.2, p1 = P.front[0] + 1.1, mid = P.hip + 0.6;
      const height = (p) => Math.max(0.015, 0.27 * Math.exp(-((p - mid) ** 2) / 5.5) - 0.02);
      const top = (p) => { const rg = ringAt(p); return rg.p.clone().addScaledVector(rg.nrm, rg.hh * 0.8); };
      const zs = [top(p0).z, top(p1).z];
      for (let p = p0; p < p1 - 0.01; p += 0.25) {
        const q = Math.min(p1, p + 0.27);
        parts.push({ kind: 'sail', bone: boneAtParam(p + 0.12), shape: 'sail', pos: V(0, 0, 0), a: top(p), b: top(q), ha: height(p), hb: height(q), z0: Math.min(...zs), z1: Math.max(...zs) });
      }
    }
    // Rows of bony studs along the back and flanks (like Ankylosaurus).
    if (f.has('armor')) {
      for (let p = P.hip - 1.6; p <= P.front[0] + 0.3; p += 0.2) {
        const rg = ringAt(p);
        for (const a of [-1.2, -0.6, 0, 0.6, 1.2]) {
          const at = rg.p.clone().addScaledVector(rg.nrm, Math.cos(a) * rg.hh * 0.95).addScaledVector(rg.sd, Math.sin(a) * rg.hw * 0.95);
          const dir = at.clone().sub(rg.p).normalize();
          const sz = (0.01 + rg.hh * 0.06) * (a === 0 ? 1.1 : Math.abs(a) > 1 ? 0.8 : 1);
          parts.push({ kind: 'osteo', bone: boneAtParam(p), shape: 'horn', pos: at, dir, len: sz * 1.3, rad: sz });
        }
      }
    }
    // A heavy bone club at the end of the tail.
    if (f.has('club')) {
      const tb = `t${P.tail.length - 1}`;
      const at = J[P.tail[P.tail.length - 1]].p.clone().lerp(J[0].p, 0.35);
      parts.push({ kind: 'osteo', bone: tb, shape: 'blob', pos: at, scale: V(0.1, 0.06, 0.1) });
      for (const s2 of [1, -1]) parts.push({ kind: 'osteo', bone: tb, shape: 'blob', pos: at.clone().add(V(s2 * 0.075, -0.008, 0.01)), scale: V(0.065, 0.048, 0.075) });
    }
    // A thick domed skull ringed with knobs (like Pachycephalosaurus).
    if (f.has('dome')) {
      parts.push({ kind: 'skin', bone: headName, shape: 'blob', pos: V(0, head.p.y + head.hh * 0.6, head.p.z - head.hw * 0.25), scale: V(head.hw * 1.05, head.hh * 0.9, head.hw * 1.3) });
      for (let k = 0; k < 7; k++) {
        const a = (k / 6 - 0.5) * 2.6;
        horn(headName, V(Math.sin(a) * head.hw * 0.95, head.p.y + head.hh * 0.35, head.p.z - head.hw * 0.25 - Math.cos(a) * head.hw * 1.1), V(Math.sin(a), 0.4, -Math.cos(a)), 0.03, 0.014);
      }
    }
    // A long hollow crest sweeping back from the head (like
    // Parasaurolophus). It hoots through it.
    if (f.has('tubecrest')) {
      const y = head.p.y + head.hh * 0.55, z = head.p.z + head.hw * 0.4;
      parts.push({ kind: 'accent', bone: headName, shape: 'tube', pos: V(0, 0, 0), rad: head.hw * 0.32,
        pts: [V(0, y, z), V(0, y + 0.06, z - 0.1), V(0, y + 0.1, z - 0.24), V(0, y + 0.1, z - 0.34)] });
    }

    // Materials
    const tex = skinTextures(sp, r);
    const sc = scaleMaps();
    const tiled = (t, u, v) => { const x = t.clone(); x.repeat.set(u, v); x.needsUpdate = true; return x; };
    const elc = C.ELEMENTS[sp.el].color;
    // Scaly skin with a soft sheen, like a lizard's in the sun.
    const skinLike = (map, u, v) => new T.MeshPhysicalMaterial({
      map, normalMap: tiled(sc.normal, u, v), normalScale: new T.Vector2(0.75, 0.75),
      aoMap: tiled(sc.orm, u, v), aoMapIntensity: 1, roughnessMap: tiled(sc.orm, u, v), roughness: 0.95,
      metalness: 0, envMapIntensity: 0.85,
      sheen: 0.35, sheenRoughness: 0.55, sheenColor: mixc(sp.col[1], '#FFFFFF', 0.4),
    });
    const skin = skinLike(tex.skin, 18, 6);
    if (tex.glow) { skin.emissiveMap = tex.glow; skin.emissive = new T.Color('#FFFFFF'); skin.emissiveIntensity = 1; }
    const limb = skinLike(tex.limb, 7, 4);
    const membrane = new T.MeshStandardMaterial({ map: membraneTexture(sp), roughness: 0.75, side: T.DoubleSide, envMapIntensity: 0.6 });
    const accentCol = hex(sp.col[2]);
    const mats = {
      horn: new T.MeshStandardMaterial({ color: sp.feat.has('crown') ? accentCol : mixc('#EDE3CC', sp.col[2], 0.15), roughness: 0.45, envMapIntensity: 0.8, emissive: sp.feat.has('crown') ? accentCol : new T.Color(0), emissiveIntensity: sp.feat.has('crown') ? 0.8 : 0 }),
      claw: new T.MeshStandardMaterial({ color: '#2A2420', roughness: 0.4 }),
      nail: new T.MeshStandardMaterial({ color: '#5E5446', roughness: 0.45 }),
      eye: new T.MeshPhysicalMaterial({ map: eyeTexture(sp), roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.2, emissiveMap: eyeTexture(sp), emissive: new T.Color('#FFFFFF'), emissiveIntensity: sp.rar >= 2 ? 0.45 : 0.08 }),
      nostril: new T.MeshStandardMaterial({ color: '#140C08', roughness: 0.9 }),
      mouth: new T.MeshStandardMaterial({ color: '#6A2A2A', roughness: 0.4 }),
      teeth: new T.MeshStandardMaterial({ color: '#E6DCC2', roughness: 0.3 }),
      frill: new T.MeshStandardMaterial({ map: frillTexture(sp), normalMap: tiled(sc.normal, 4, 4), normalScale: new T.Vector2(0.7, 0.7), roughness: 0.7, envMapIntensity: 0.7, side: T.DoubleSide, emissive: sp.feat.has('glow') ? new T.Color(elc) : new T.Color(0), emissiveIntensity: sp.feat.has('glow') ? 0.35 : 0 }),
      // Plates, crests and quills: horny skin, part body colour, part accent.
      osteo: new T.MeshStandardMaterial({ color: mixc(sp.col[0], '#CFC2A0', 0.3), normalMap: tiled(sc.normal, 2, 2), normalScale: new T.Vector2(0.6, 0.6), roughness: 0.6, envMapIntensity: 0.8 }),
      sail: new T.MeshStandardMaterial({ map: sailTexture(sp), roughness: 0.65, side: T.DoubleSide, envMapIntensity: 0.7, emissive: sp.feat.has('glow') ? new T.Color(elc) : new T.Color(0), emissiveIntensity: sp.feat.has('glow') ? 0.35 : 0 }),
      accent: new T.MeshStandardMaterial({ color: mixc(sp.col[0], sp.col[2], sp.feat.has('glow') || sp.el === 'void' ? 0.8 : 0.55), normalMap: tiled(sc.normal, 3, 3), normalScale: new T.Vector2(0.5, 0.5), roughness: 0.7, envMapIntensity: 0.8, side: T.DoubleSide, emissive: sp.feat.has('glow') ? new T.Color(elc) : new T.Color(0), emissiveIntensity: sp.feat.has('glow') ? 0.5 : 0 }),
    };

    // Rigid part geometries (shared across instances).
    const geoCache = {};
    const unitGeo = (shape) => {
      if (geoCache[shape]) return geoCache[shape];
      let g;
      if (shape === 'toe') { g = new T.CapsuleGeometry(1, 2, 3, 8); g.translate(0, 2, 0); g.scale(1, 0.25, 1); }
      else if (shape === 'claw' || shape === 'tooth' || shape === 'horn') { g = new T.ConeGeometry(1, 1, shape === 'horn' ? 12 : 6, 1); g.translate(0, 0.5, 0); }
      else if (shape === 'quill') { g = new T.ConeGeometry(1, 1, 4, 1); g.translate(0, 0.5, 0); g.scale(1, 1, 0.25); }
      else if (shape === 'blob') { g = new T.SphereGeometry(1, 16, 12); }
      else if (shape === 'eye') { g = new T.SphereGeometry(1, 24, 16); }
      return (geoCache[shape] = g);
    };
    const up = V(0, 1, 0);
    const extra = [];   // knobs added while building frills
    const built = parts.map((pt) => {
      const out = { bone: typeof pt.bone === 'number' ? pt.bone : bi[pt.bone], kind: pt.kind, pos: pt.pos ? pt.pos.clone() : V(0, 0, 0), quat: new T.Quaternion(), scale: V(1, 1, 1), geo: pt.geo };
      if (pt.shape === 'toe') {
        out.geo = unitGeo('toe');
        out.quat.setFromUnitVectors(up, pt.dir);
        out.scale.set(pt.rad, pt.len, pt.rad);
      } else if (pt.shape === 'claw' || pt.shape === 'tooth' || pt.shape === 'horn' || pt.shape === 'quill') {
        out.geo = unitGeo(pt.shape);
        out.quat.setFromUnitVectors(up, pt.dir);
        out.scale.set(pt.rad, pt.len, pt.rad);
      } else if (pt.shape === 'blob') {
        out.geo = unitGeo('blob');
        out.scale.copy(pt.scale);
      } else if (pt.shape === 'eye') {
        out.geo = unitGeo('eye');
        out.scale.setScalar(pt.rad);
        // The iris is in the middle of the texture, which faces +x.
        out.quat.setFromUnitVectors(V(1, 0, 0), pt.look);
      } else if (pt.shape === 'sail') {
        // One panel of the sail: from the back up to its scalloped top.
        const pos = [], uv = [], idx = [];
        const N = 4;
        for (let k = 0; k <= N; k++) {
          const f2 = k / N;
          const base = pt.a.clone().lerp(pt.b, f2);
          const h = pt.ha + (pt.hb - pt.ha) * f2 - Math.sin(f2 * Math.PI) * 0.012;
          const u = (base.z - pt.z0) / ((pt.z1 - pt.z0) || 1);
          pos.push(base.x, base.y - 0.01, base.z, base.x, base.y + h, base.z);
          uv.push(u, 0, u, 1);
          if (k) { const q = (k - 1) * 2; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
        }
        out.geo = new T.BufferGeometry();
        out.geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
        out.geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
        out.geo.setIndex(idx);
        out.geo.computeVertexNormals();
      } else if (pt.shape === 'tube') {
        out.geo = new T.TubeGeometry(new T.CatmullRomCurve3(pt.pts), 16, pt.rad, 8, false);
      } else if (pt.shape === 'lid') {
        if (!geoCache.lid) geoCache.lid = new T.TorusGeometry(0.86, 0.3, 8, 20);
        out.geo = geoCache.lid;
        out.scale.setScalar(pt.rad);
        out.quat.setFromUnitVectors(V(0, 0, 1), pt.look);
      } else if (pt.shape === 'frill') {
        // A curved shield: a finely divided fan whose sides sweep forward,
        // with a scalloped rim.
        const R = pt.size, NR = 8, NA = 28;
        const a0 = -0.14 * Math.PI, a1 = 1.14 * Math.PI;
        const pos = [], uv = [], idx = [];
        const rim = (a) => 1 + 0.05 * Math.cos(a * 11);
        for (let i = 0; i <= NR; i++) {
          for (let j = 0; j <= NA; j++) {
            const a = a0 + (a1 - a0) * j / NA;
            const rr = R * (0.12 + 0.88 * i / NR) * (i === NR ? rim(a) : 1);
            const x = -Math.cos(a) * rr, y = Math.sin(a) * rr * 0.85;
            pos.push(x, y, x * x * 1.8 - (i / NR) * 0.03);
            uv.push(0.5 + x / (R * 2.3), 0.5 + y / (R * 2.3));
          }
        }
        for (let i = 0; i < NR; i++) {
          for (let j = 0; j < NA; j++) {
            const q0 = i * (NA + 1) + j, q1 = q0 + 1, q2 = q0 + NA + 1, q3 = q2 + 1;
            idx.push(q0, q1, q2, q1, q3, q2);
          }
        }
        out.geo = new T.BufferGeometry();
        out.geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
        out.geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
        out.geo.setIndex(idx);
        out.geo.computeVertexNormals();
        out.quat.setFromEuler(new T.Euler(-0.75, 0, 0));
        // Knobs around the rim
        for (let k = 2; k < NA; k += 3) {
          const a = a0 + (a1 - a0) * k / NA;
          const lx = -Math.cos(a) * R * rim(a);
          const loc = V(lx, Math.sin(a) * R * 0.85 * rim(a), lx * lx * 1.8 - 0.03).applyQuaternion(out.quat).add(pt.pos);
          const dir = V(-Math.cos(a), Math.sin(a), 0).applyQuaternion(out.quat);
          extra.push({ bone: out.bone, kind: 'horn', geo: unitGeo('horn'), pos: loc, quat: new T.Quaternion().setFromUnitVectors(up, dir), scale: V(0.016, 0.05, 0.016) });
        }
      } else if (pt.shape === 'plate') {
        const s = new T.Shape();
        const h = pt.h, w = h * 0.9;
        s.moveTo(-w / 2, 0);
        s.quadraticCurveTo(-w * 0.6, h * 0.6, 0, h);
        s.quadraticCurveTo(w * 0.6, h * 0.6, w / 2, 0);
        s.closePath();
        out.geo = new T.ExtrudeGeometry(s, { depth: 0.01, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 1, curveSegments: 6 });
        out.geo.translate(0, 0, -0.005);
        // Stand the plate along the spine, leaning slightly outwards.
        out.quat.setFromAxisAngle(V(0, 0, 1), pt.tilt).multiply(new T.Quaternion().setFromAxisAngle(up, -Math.PI / 2));
      } else if (pt.shape === 'crest') {
        const s = new T.Shape();
        s.moveTo(pt.pts[0][0], pt.pts[0][1]);
        for (let k = 1; k < pt.pts.length; k++) s.lineTo(pt.pts[k][0], pt.pts[k][1]);
        s.closePath();
        out.geo = new T.ExtrudeGeometry(s, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1 });
        out.geo.translate(0, 0, -0.004);
        out.quat.setFromEuler(new T.Euler(0, -Math.PI / 2, 0));
      }
      return out;
    });
    const allParts = built.concat(extra);

    // Bounds (for framing portraits).
    const geometry = acc.geometry();
    geometry.computeBoundingBox();
    const box = geometry.boundingBox.clone();

    const A = {
      id, sp, plan: P, geometry, bones, bi, parts: allParts, legs, arms, wings,
      mats: [skin, limb, membrane], rigid: mats, glow: !!tex.glow, box,
      headName, chestName, tailCount: P.tail.length, frontCount: P.front.length,
    };
    assets.set(id, A);
    return A;
  }

  /* ======================= Instances ======================= */

  // A live, animated creature. opts.own: its own materials (for fading and
  // flashing without touching other copies).
  function instance(id, opts) {
    opts = opts || {};
    const A = asset(id);
    const bones = A.bones.map((b) => { const bone = new T.Bone(); bone.name = b.name; return bone; });
    A.bones.forEach((b, i) => {
      if (b.parent >= 0) { bones[b.parent].add(bones[i]); bones[i].position.copy(b.pos).sub(A.bones[b.parent].pos); }
      else bones[i].position.copy(b.pos);
    });
    const skinMats = opts.own ? A.mats.map((m) => m.clone()) : A.mats;
    const rigid = opts.own ? Object.fromEntries(Object.entries(A.rigid).map(([k, m]) => [k, m.clone()])) : A.rigid;
    const mesh = new T.SkinnedMesh(A.geometry, skinMats);
    mesh.add(bones[0]);
    mesh.updateMatrixWorld(true);
    const skeleton = new T.Skeleton(bones);
    mesh.bind(skeleton);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    const meshes = [mesh];
    for (const p of A.parts) {
      let mat;
      if (p.kind === 'skin') mat = skinMats[0];
      else if (p.kind === 'skinlimb') mat = skinMats[1];
      else mat = rigid[p.kind];
      const m = new T.Mesh(p.geo, mat);
      m.position.copy(p.pos).sub(A.bones[p.bone].pos);
      m.quaternion.copy(p.quat);
      m.scale.copy(p.scale);
      m.castShadow = p.kind !== 'nostril' && p.kind !== 'mouth' && p.kind !== 'eye';
      bones[p.bone].add(m);
      meshes.push(m);
    }
    const root = new T.Group();
    const body = new T.Group();   // unit-height model, scaled to meters by root
    body.add(mesh);
    root.add(body);
    root.scale.setScalar(A.sp.size);

    const byName = {};
    bones.forEach((b) => { byName[b.name] = b; });
    const hipRest = bones[0].position.clone();
    const legRest = A.legs.map((L) => {
      // Joint positions in the leg-parent bone's frame, as (z, y).
      const parent = A.bones[A.bi[L.parent]].pos;
      const pts = L.rest.map((p) => p.clone().sub(parent));
      const ang = (a, b) => Math.atan2(b.y - a.y, b.z - a.z);
      return {
        L, pts,
        l1: pts[0].distanceTo(pts[1]), l2: pts[1].distanceTo(pts[2]),
        a0: [ang(pts[0], pts[1]), ang(pts[1], pts[2]), ang(pts[2], pts[3])],
        bones: L.bones.map((n) => byName[n]),
      };
    });

    const S = { ph: 0, t: Math.random() * 10, look: 0, lookT: 0, lookTo: 0 };
    const P = A.plan;
    const allMats = skinMats.concat(Object.values(rigid));
    let tint = 0;

    function solveLeg(R, dz, lift, bob) {
      const [H, K0, A0, B0] = R.pts;
      const bt = { z: B0.z + dz, y: B0.y - bob + lift };
      const at = { z: bt.z + (A0.z - B0.z), y: bt.y + (A0.y - B0.y) };
      let vz = at.z - H.z, vy = at.y - H.y;
      let d = Math.hypot(vz, vy);
      const max = (R.l1 + R.l2) * 0.999;
      if (d > max) { vz *= max / d; vy *= max / d; d = max; }
      d = Math.max(d, Math.abs(R.l1 - R.l2) + 1e-4);
      const a = Math.acos(clamp((R.l1 * R.l1 + d * d - R.l2 * R.l2) / (2 * R.l1 * d), -1, 1));
      const th = Math.atan2(vy, vz);
      const k1 = { z: H.z + R.l1 * Math.cos(th - a), y: H.y + R.l1 * Math.sin(th - a) };
      const k2 = { z: H.z + R.l1 * Math.cos(th + a), y: H.y + R.l1 * Math.sin(th + a) };
      const K = (k1.z > k2.z) === !!R.L.knee ? k1 : k2;
      const A2 = { z: H.z + vz, y: H.y + vy };
      const phiT = Math.atan2(K.y - H.y, K.z - H.z);
      const phiS = Math.atan2(A2.y - K.y, A2.z - K.z);
      const thT = R.a0[0] - phiT;
      const thS = R.a0[1] - thT - phiS;
      R.bones[0].rotation.x = thT;
      R.bones[1].rotation.x = thS;
      R.bones[2].rotation.x = -(thT + thS);
      R.bones[3].rotation.x = -lift * 2.5;
      void K0;
    }

    // st: { speed (m/s), mouth (0..1), look (radians) }
    function update(dt, st) {
      st = st || {};
      S.t += dt;
      const t = S.t;
      const speedU = (st.speed || 0) / root.scale.x;
      const stride = P.stride || 0.15;
      const wk = clamp(speedU / 0.25, 0, 1);
      S.ph += dt * Math.PI * speedU / (2 * stride);
      const mouth = st.mouth || 0;
      const b = byName;

      if (A.sp.plan === 'flyer') {
        const w = 6 + (st.flap || 0) * 4;
        const f = Math.sin(t * w);
        bones[0].position.y = hipRest.y - f * 0.02;
        for (const W of A.wings) {
          const s = W.side;
          b[W.bones[0]].rotation.z = s * (f * 0.75 + 0.12);
          b[W.bones[1]].rotation.z = -s * Math.sin(t * w - 0.8) * 0.25;
          b[W.bones[2]].rotation.z = -s * Math.sin(t * w - 1.4) * 0.2;
          b[W.bones[0]].rotation.y = s * 0.05 * Math.sin(t * w + 0.5);
        }
        for (const R of legRest) { R.bones[0].rotation.x = 0.2 + Math.sin(t * 2) * 0.1; R.bones[1].rotation.x = Math.sin(t * 2 + 1) * 0.15; }
      } else {
        const bob = -Math.abs(Math.cos(S.ph)) * 0.02 * wk + Math.sin(t * 1.8) * 0.004;
        bones[0].position.y = hipRest.y + bob;
        bones[0].rotation.z = Math.sin(S.ph) * 0.03 * wk;
        for (const R of legRest) {
          const ph = S.ph + (R.L.phase || 0);
          const s = Math.sin(ph), c = Math.cos(ph);
          solveLeg(R, s * stride * wk, Math.max(0, c) * (P.lift || 0.06) * wk, bob);
        }
        for (const Ar of A.arms) {
          b[Ar.bones[0]].rotation.x = Math.sin(S.ph + (Ar.side > 0 ? Math.PI : 0)) * 0.25 * wk + Math.sin(t * 1.4) * 0.06;
          b[Ar.bones[1]].rotation.x = -0.2 + Math.sin(t * 1.4 + 0.5) * 0.08;
        }
      }
      // Tail sway
      for (let k = 0; k < A.tailCount; k++) {
        const bn = b[`t${k}`];
        bn.rotation.y = Math.sin(t * 1.3 - k * 0.7) * 0.07 * (1 + k * 0.3) + Math.sin(S.ph) * 0.06 * wk;
        bn.rotation.x = Math.sin(t * 0.9 - k * 0.5) * 0.025 + (A.sp.plan === 'flyer' ? 0 : -0.01 * wk);
      }
      // Looking around
      S.lookT -= dt;
      if (S.lookT <= 0) { S.lookT = 2 + Math.random() * 4; S.lookTo = (Math.random() - 0.5) * 0.9; }
      const lookTarget = st.look != null ? st.look : S.lookTo * (1 - wk * 0.7);
      S.look += (lookTarget - S.look) * (1 - Math.exp(-dt * 2));
      const nf = A.frontCount - 1;
      for (let k = 1; k <= nf; k++) {
        const bn = b[`f${k}`];
        bn.rotation.y = S.look / nf + Math.sin(t * 0.8 + k) * 0.015;
        bn.rotation.x = k === nf ? -mouth * 0.35 + Math.sin(t * 1.1) * 0.03 : -mouth * 0.08;
      }
      b.jaw.rotation.x = mouth * 0.6 + (Math.sin(t * 1.8) + 1) * 0.01;
      // Glowing markings pulse.
      if (A.glow) skinMats[0].emissiveIntensity = tint > 0 ? skinMats[0].emissiveIntensity : 0.7 + Math.sin(t * 3) * 0.35;
    }

    // Flash a colour over the whole creature (hits, capture). Needs own mats.
    function setTint(color, k) {
      if (k <= 0 && tint <= 0) return;
      for (const m of skinMats) {
        if (!m.userData.base) m.userData.base = { e: m.emissive.clone(), i: m.emissiveIntensity, map: m.emissiveMap };
        const base = m.userData.base;
        if (k > 0) {
          m.emissive.set(color);
          m.emissiveIntensity = k;
          if (m.emissiveMap) { m.emissiveMap = null; m.needsUpdate = true; }
        } else {
          m.emissive.copy(base.e);
          m.emissiveIntensity = base.i;
          if (base.map) { m.emissiveMap = base.map; m.needsUpdate = true; }
        }
      }
      tint = k;
    }

    let opacity = 1;
    function setOpacity(a) {
      if (a === opacity) return;
      opacity = a;
      for (const m of allMats) {
        m.transparent = a < 1;
        m.opacity = a;
        m.depthWrite = a >= 0.99;
      }
    }

    update(0, {});
    return {
      root, body, mesh, meshes, bones: byName, sp: A.sp, box: A.box,
      update, setTint, setOpacity,
      headBone: byName[A.headName],
      // Bones good for the dart target to wander over.
      targets: ['hip', 'f0', A.headName, 't0', A.legs.length ? A.legs[0].bones[0] : 'hip'].filter((n) => byName[n]).map((n) => byName[n]),
      dispose() { if (opts.own) allMats.forEach((m) => m.dispose()); },
    };
  }

  /* ======================= Portraits ======================= */

  let studio = null;

  function studioScene() {
    if (studio) return studio;
    const renderer = G.makeRenderer({ preserveDrawingBuffer: false });
    const scene = new T.Scene();
    scene.environment = G.environment(renderer);
    const key = new T.DirectionalLight('#FFF4E6', 2.2);
    key.position.set(2, 3, 2.5);
    const rim = new T.DirectionalLight('#B8A8FF', 1.6);
    rim.position.set(-2.5, 1.5, -2);
    scene.add(key, rim, new T.HemisphereLight('#DDE6FF', '#40302A', 0.8));
    const camera = new T.PerspectiveCamera(28, 1, 0.01, 50);
    studio = { renderer, scene, camera, cache: new Map(), sil: new T.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.16 }) };
    return studio;
  }

  // Render a creature into a 2D canvas. opts: { t (seconds, animates),
  // silhouette, angle }
  function portrait(canvas, id, opts) {
    const o = opts || {};
    const st = studioScene();
    let inst = st.cache.get(id);
    if (!inst) {
      inst = instance(id, {});
      inst.root.scale.setScalar(1);
      st.cache.set(id, inst);
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round((canvas.clientWidth || canvas.width) * dpr));
    const h = Math.max(1, Math.round((canvas.clientHeight || canvas.height) * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    st.renderer.setPixelRatio(1);
    st.renderer.setSize(w, h, false);
    st.scene.add(inst.root);
    if (o.t != null) { inst.update(o.dt || 0.016, { mouth: o.mouth || 0 }); }
    // Frame the model: three-quarter view from the front left.
    const box = inst.box;
    const center = box.getCenter(new T.Vector3());
    const size = box.getSize(new T.Vector3());
    const fly = inst.sp.plan === 'flyer';
    const ang = o.angle != null ? o.angle : fly ? 0.5 : 0.95;
    const radius = Math.max(size.z * 0.42, size.y * 0.55, size.x * (fly ? 0.36 : 0.5));
    const cam = st.camera;
    cam.aspect = w / h;
    const fitH = radius / Math.tan(cam.fov * Math.PI / 360);
    const fitW = fitH / Math.min(1, cam.aspect * 0.95);
    const dist = Math.max(fitH, fitW) * 0.95;
    const elev = o.elev != null ? o.elev : fly ? 0.75 : 0.25;
    cam.position.set(center.x + Math.sin(ang) * dist, center.y + dist * elev, center.z + Math.cos(ang) * dist);
    cam.lookAt(center);
    cam.updateProjectionMatrix();
    st.scene.overrideMaterial = o.silhouette ? st.sil : null;
    st.renderer.render(st.scene, cam);
    st.scene.remove(inst.root);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(st.renderer.domElement, 0, 0, w, h);
  }

  // Render many portraits a few per frame, so opening a list stays smooth.
  const queue = [];
  let pumping = false;
  function portraitLater(canvas, id, opts) {
    queue.push([canvas, id, opts]);
    if (pumping) return;
    pumping = true;
    const pump = () => {
      const t0 = performance.now();
      while (queue.length && performance.now() - t0 < 12) {
        const [c, i, o] = queue.shift();
        if (c.isConnected) portrait(c, i, o);
      }
      if (queue.length) requestAnimationFrame(pump); else pumping = false;
    };
    requestAnimationFrame(pump);
  }

  RB.beasts = { PLANS, asset, instance, portrait, portraitLater };
})(window.RB);
