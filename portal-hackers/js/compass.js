/* Portal Hackers: Nexus — the Sci-Fi Compass, in 3D. A holographic disc
   on the ground around you, seen from a camera above and behind you: a
   glowing bezel with N/E/S/W, range rings and a sweep, and every portal
   standing at its real bearing and distance as a spinning crystal on a beam
   of light. Energy cells float as small cubes, Nexus signals ripple, and
   your links arc between portals.

   No 3D library: points are projected with a simple perspective camera and
   the shapes are drawn back to front on a 2D canvas.

   The camera faces where you're heading when the compass sensor is on;
   otherwise drag sideways to orbit. Tap a portal to open it, or (in
   tap-to-walk mode) tap the ground to walk there. */
window.PH = window.PH || {};
(function (PH) {
  'use strict';

  const { TAU, clamp } = PH.util;
  const W = PH.world;
  const D = PH.data;

  const DEG = Math.PI / 180;
  const RING = 10;               // world units: the bezel radius = radar range

  let canvas = null, ctx = null, dpr = 1, Wd = 1, Ht = 1;
  let handlers = { tap: null, ground: null };
  let last = null;
  let hits = [];
  let cam = null;
  let userYaw = 0;               // degrees, when not following the phone
  let yawShown = 0;
  let pitchShown = 52;
  const stars = [];

  /* ------------------ Setup and input ------------------ */

  function init(el, h) {
    canvas = el;
    ctx = canvas.getContext('2d');
    handlers = Object.assign(handlers, h);
    for (let i = 0; i < 90; i++) stars.push([Math.random(), Math.random() * 0.45, Math.random() * 1.4 + 0.3, Math.random() * TAU]);

    let down = null;
    canvas.addEventListener('pointerdown', (e) => {
      down = { x: e.clientX, y: e.clientY, yaw: userYaw, moved: false, id: e.pointerId };
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!down || e.pointerId !== down.id) return;
      const dx = e.clientX - down.x;
      if (Math.abs(dx) > 8 || Math.abs(e.clientY - down.y) > 8) down.moved = true;
      if (down.moved && !(last && last.follow)) {
        userYaw = down.yaw - dx * 0.4;
        yawShown = userYaw;
      }
    });
    // Act on the click, not on pointerup: on phones the click that follows
    // a tap would otherwise land on the panel the tap just opened, and shut it.
    let dragged = false;
    canvas.addEventListener('pointerup', () => {
      if (!down) return;
      dragged = down.moved;
      down = null;
    });
    canvas.addEventListener('pointercancel', () => { down = null; dragged = true; });
    canvas.addEventListener('click', (e) => {
      if (dragged) { dragged = false; return; }
      onTap(e);
    });
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    Wd = canvas.clientWidth;
    Ht = canvas.clientHeight;
    canvas.width = Math.round(Wd * dpr);
    canvas.height = Math.round(Ht * dpr);
  }

  /* ------------------ Camera ------------------ */

  // A camera looking down at the player at `pitch` degrees, facing `yaw`
  // (compass degrees), `dist` units back along its line of sight.
  function makeCamera(yaw, pitch) {
    const y = yaw * DEG, p = pitch * DEG;
    const fx = Math.sin(y), fy = Math.cos(y);
    const L = [fx * Math.cos(p), fy * Math.cos(p), -Math.sin(p)];
    const R = [Math.cos(y), -Math.sin(y), 0];
    const U = [R[1] * L[2] - R[2] * L[1], R[2] * L[0] - R[0] * L[2], R[0] * L[1] - R[1] * L[0]];
    const dist = 21;
    const T = [fx * 2, fy * 2, 0];          // look a little ahead of you
    const C = [T[0] - L[0] * dist, T[1] - L[1] * dist, T[2] - L[2] * dist];
    // Fit the whole bezel across the screen, with a little room either side.
    const F = Math.min(Wd * 0.86, Ht * 0.95);
    return { L, R, U, C, F, cx: Wd / 2, cy: Ht * 0.5, yaw };
  }

  // World point → [screen x, screen y, depth, scale], or null behind the camera.
  function proj(x, y, z) {
    const dx = x - cam.C[0], dy = y - cam.C[1], dz = z - cam.C[2];
    const zc = dx * cam.L[0] + dy * cam.L[1] + dz * cam.L[2];
    if (zc < 0.5) return null;
    const xc = dx * cam.R[0] + dy * cam.R[1] + dz * cam.R[2];
    const yc = dx * cam.U[0] + dy * cam.U[1] + dz * cam.U[2];
    const s = cam.F / zc;
    return [cam.cx + xc * s, cam.cy - yc * s, zc, s];
  }

  // Screen point → the ground point under it (z = 0), or null above the horizon.
  function unprojectGround(sx, sy) {
    const xc = (sx - cam.cx) / cam.F, yc = -(sy - cam.cy) / cam.F;
    const d = [cam.L[0] + cam.R[0] * xc + cam.U[0] * yc, cam.L[1] + cam.R[1] * xc + cam.U[1] * yc, cam.L[2] + cam.R[2] * xc + cam.U[2] * yc];
    if (d[2] >= -1e-4) return null;
    const t = -cam.C[2] / d[2];
    return [cam.C[0] + d[0] * t, cam.C[1] + d[1] * t];
  }

  // Lat/lng → world units around the player.
  function toWorld(f, ll) {
    const [dx, dy] = W.offset(f.pos, ll);
    const k = RING / f.range;
    return [dx * k, dy * k, Math.hypot(dx, dy)];
  }

  function onTap(e) {
    if (!last || !cam) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    let best = null, bd = Infinity;
    for (const h of hits) {
      const d = Math.hypot(h.x - sx, h.y - sy);
      if (d < h.r && d < bd) { bd = d; best = h; }
    }
    if (best) { if (handlers.tap) handlers.tap(best.ent); return; }
    const g = unprojectGround(sx, sy);
    if (!g || Math.hypot(g[0], g[1]) > RING * 1.05) return;
    const k = last.range / RING;
    if (handlers.ground) handlers.ground(W.move(last.pos, g[0] * k, g[1] * k));
  }

  /* ------------------ Colour helpers ------------------ */

  function rgb(col) {
    if (col[0] === '#') {
      const n = parseInt(col.slice(1), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    const m = /hsl\((\d+(?:\.\d+)?)\s+(\d+)%\s+(\d+)%/.exec(col);
    if (!m) return [255, 255, 255];
    const h = +m[1] / 360, s = +m[2] / 100, l = +m[3] / 100;
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = (t) => {
      t = (t + 1) % 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255].map(Math.round);
  }
  const rgba = (c, a) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;
  const shade = (c, k) => `rgb(${Math.min(255, Math.round(c[0] * k))}, ${Math.min(255, Math.round(c[1] * k))}, ${Math.min(255, Math.round(c[2] * k))})`;

  function skinColors(f) {
    const sk = D.SKINS[f.skin] || D.SKINS.basic;
    if (!sk.animated) return sk.colors.map(rgb);
    const h = (f.t * 40) % 360;
    return [`hsl(${h} 100% 70%)`, `hsl(${(h + 120) % 360} 100% 55%)`, `hsl(${(h + 240) % 360} 100% 70%)`].map(rgb);
  }

  /* ------------------ Ground ------------------ */

  function groundPath(pts) {
    ctx.beginPath();
    let open = false;
    for (const p of pts) {
      const s = proj(p[0], p[1], p[2] || 0);
      if (!s) { open = false; continue; }
      if (open) ctx.lineTo(s[0], s[1]); else { ctx.moveTo(s[0], s[1]); open = true; }
    }
  }

  function circlePts(r, z, n) {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * TAU;
      out.push([Math.cos(a) * r, Math.sin(a) * r, z || 0]);
    }
    return out;
  }

  function drawSky(f, ring) {
    const g = ctx.createLinearGradient(0, 0, 0, Ht);
    g.addColorStop(0, '#02040C');
    g.addColorStop(0.42, '#061334');
    g.addColorStop(1, '#030814');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, Wd, Ht);
    for (const s of stars) {
      const x = ((s[0] * Wd - cam.yaw * 1.6) % Wd + Wd) % Wd;
      ctx.fillStyle = `rgba(200, 225, 255, ${0.35 + 0.35 * Math.sin(f.t * 1.5 + s[3])})`;
      ctx.fillRect(x, s[1] * Ht, s[2], s[2]);
    }
    // Horizon glow.
    const hz = proj(cam.C[0] + cam.L[0] * 400, cam.C[1] + cam.L[1] * 400, 0);
    if (hz) {
      const hg = ctx.createLinearGradient(0, hz[1] - 60, 0, hz[1] + 40);
      hg.addColorStop(0, 'rgba(0,0,0,0)');
      hg.addColorStop(0.7, rgba(ring, 0.16));
      hg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = hg;
      ctx.fillRect(0, hz[1] - 60, Wd, 100);
    }
  }

  function drawGround(f, ring, glow, sweep) {
    // Disc.
    groundPath(circlePts(RING, 0, 72));
    const c0 = proj(0, 0, 0);
    const g = ctx.createRadialGradient(c0[0], c0[1], 10, c0[0], c0[1], c0[3] * RING * 1.2);
    g.addColorStop(0, rgba(glow, 0.22));
    g.addColorStop(1, 'rgba(4, 12, 30, 0.55)');
    ctx.fillStyle = g;
    ctx.fill();

    // Grid.
    ctx.lineWidth = 1;
    const step = RING / 5;
    for (let k = -7; k <= 7; k++) {
      for (const axis of [0, 1]) {
        const pts = [];
        for (let j = -14; j <= 14; j++) {
          const a = k * step, b = (j / 2) * step;
          pts.push(axis ? [a, b] : [b, a]);
        }
        ctx.strokeStyle = rgba(ring, 0.07);
        groundPath(pts);
        ctx.stroke();
      }
    }

    // Range rings.
    ctx.strokeStyle = rgba([160, 220, 255], 0.16);
    for (let k = 1; k <= 3; k++) { groundPath(circlePts((RING * k) / 4, 0, 60)); ctx.stroke(); }

    // Scanner range.
    const sr = (f.scan / f.range) * RING;
    if (sr < RING * 1.05) {
      groundPath(circlePts(sr, 0, 64));
      ctx.fillStyle = rgba(ring, 0.07);
      ctx.fill();
      ctx.strokeStyle = rgba(ring, 0.55);
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    // Reach.
    const ir = (D.RANGE.interact / f.range) * RING;
    ctx.setLineDash([4, 5]);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1;
    groundPath(circlePts(ir, 0, 48));
    ctx.stroke();
    ctx.setLineDash([]);

    // Sweep: a fading wedge turning clockwise.
    const sa = (f.t * 92) % 360;
    for (let k = 0; k < 14; k++) {
      const a0 = (sa - k * 3.5) * DEG, a1 = (sa - (k + 1) * 3.5) * DEG;
      ctx.beginPath();
      const p0 = proj(0, 0, 0.02), p1 = proj(Math.sin(a0) * RING, Math.cos(a0) * RING, 0.02), p2 = proj(Math.sin(a1) * RING, Math.cos(a1) * RING, 0.02);
      if (!p0 || !p1 || !p2) continue;
      ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]);
      ctx.closePath();
      ctx.fillStyle = rgba(sweep, 0.22 * (1 - k / 14));
      ctx.fill();
    }

    // Bezel: a raised glowing ring with ticks.
    ctx.shadowColor = rgba(glow, 1);
    ctx.shadowBlur = 18;
    ctx.lineWidth = 3;
    ctx.strokeStyle = rgba(ring, 1);
    groundPath(circlePts(RING, 0.05, 96));
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(ring, 0.35);
    groundPath(circlePts(RING, 0.45, 96));
    ctx.stroke();
    if (f.frame) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#FFD23F';
      groundPath(circlePts(RING * 1.07, 0.05, 96));
      ctx.stroke();
    }
    for (let a = 0; a < 360; a += 5) {
      const big = a % 45 === 0;
      const r1 = RING + (big ? 0.8 : a % 15 === 0 ? 0.5 : 0.25);
      const s = Math.sin(a * DEG), c = Math.cos(a * DEG);
      const p = proj(s * RING, c * RING, 0), q = proj(s * r1, c * r1, 0);
      if (!p || !q) continue;
      ctx.strokeStyle = big ? rgba(ring, 1) : 'rgba(180, 220, 255, 0.45)';
      ctx.lineWidth = big ? 2 : 1;
      ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
    }
    // N/E/S/W stand up off the ring.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const [lab, a] of [['N', 0], ['E', 90], ['S', 180], ['W', 270]]) {
      const p = proj(Math.sin(a * DEG) * (RING + 1.6), Math.cos(a * DEG) * (RING + 1.6), 0.6);
      if (!p) continue;
      ctx.font = `700 ${Math.round(clamp(p[3] * 1.1, 9, 26))}px "Audiowide", sans-serif`;
      ctx.fillStyle = lab === 'N' ? '#FF5A6E' : 'rgba(220, 240, 255, 0.85)';
      ctx.fillText(lab, p[0], p[1]);
    }
  }

  /* ------------------ Solids ------------------ */

  // A bipyramid: an n-sided ring of radius r at height z, with tips `h` above and below.
  function bipyramid(n, r, h, spin) {
    const ring = [];
    for (let i = 0; i < n; i++) {
      const a = spin + (i / n) * TAU;
      ring.push([Math.cos(a) * r, Math.sin(a) * r, 0]);
    }
    const top = [0, 0, h], bot = [0, 0, -h * 0.9];
    const faces = [];
    for (let i = 0; i < n; i++) {
      const a = ring[i], b = ring[(i + 1) % n];
      faces.push([top, a, b], [bot, b, a]);
    }
    return faces;
  }

  function cube(r, spin) {
    const v = [];
    for (const z of [-r, r]) for (let i = 0; i < 4; i++) {
      const a = spin + Math.PI / 4 + (i / 4) * TAU;
      v.push([Math.cos(a) * r * 1.414, Math.sin(a) * r * 1.414, z]);
    }
    return [[v[4], v[5], v[6], v[7]], [v[0], v[3], v[2], v[1]], [v[0], v[1], v[5], v[4]], [v[1], v[2], v[6], v[5]], [v[2], v[3], v[7], v[6]], [v[3], v[0], v[4], v[7]]];
  }

  const LIGHT = (() => { const l = [-0.4, 0.5, 0.75]; const n = Math.hypot(...l); return l.map((x) => x / n); })();

  // Draw faces of a solid centred at (x, y, z) world, flat-shaded.
  function drawSolid(faces, x, y, z, col, edge) {
    const list = [];
    for (const fc of faces) {
      const pts = fc.map((p) => proj(x + p[0], y + p[1], z + p[2]));
      if (pts.some((p) => !p)) continue;
      // Back-face cull in screen space.
      let area = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        area += a[0] * b[1] - b[0] * a[1];
      }
      if (area >= 0) continue;
      const u = fc[1].map((v, i) => v - fc[0][i]), w = fc[2].map((v, i) => v - fc[0][i]);
      const nrm = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      const nl = Math.hypot(...nrm) || 1;
      const lit = Math.max(0, (nrm[0] * LIGHT[0] + nrm[1] * LIGHT[1] + nrm[2] * LIGHT[2]) / nl);
      list.push({ pts, k: 0.45 + 0.85 * lit, depth: pts.reduce((s, p) => s + p[2], 0) / pts.length });
    }
    list.sort((a, b) => b.depth - a.depth);
    for (const fc of list) {
      ctx.beginPath();
      fc.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.closePath();
      ctx.fillStyle = shade(col, fc.k);
      ctx.fill();
      ctx.strokeStyle = edge;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  /* ------------------ Things on the disc ------------------ */

  const SIZE = { common: 0.55, rare: 0.62, epic: 0.7, legendary: 0.82, nexus: 0.95 };
  const BEAM = { common: 2.2, rare: 3, epic: 4, legendary: 5.5, nexus: 7 };

  function drawPortal(f, p, x, y, ring) {
    const R = D.RARITY[p.rarity];
    const rc = rgb(R.color);
    const col = p.owner ? rgb(D.TEAMS[p.owner].color) : [190, 202, 225];
    const small = f.territory ? 0.6 : 1;
    const sz = SIZE[p.rarity] * small;
    const base = proj(x, y, 0);
    if (!base) return;

    if (!p.known && !f.territory) {
      const bob = Math.sin(f.t * 2 + x) * 0.15;
      const s = proj(x, y, 1 + bob);
      if (!s) return;
      // Not discovered yet, but you can see which team holds it from afar.
      const tc = p.owner ? col : [200, 225, 255];
      ctx.strokeStyle = rgba(tc, p.owner ? 0.5 : 0.25);
      ctx.lineWidth = 1.2;
      groundPath(circlePts(0.45, 0, 18).map((q) => [q[0] + x, q[1] + y, 0]));
      ctx.stroke();
      ctx.beginPath(); ctx.moveTo(base[0], base[1]); ctx.lineTo(s[0], s[1]); ctx.stroke();
      ctx.font = `700 ${Math.round(clamp(s[3] * 0.9, 11, 30))}px "Audiowide", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (p.owner) { ctx.shadowColor = rgba(tc, 1); ctx.shadowBlur = 8; }
      ctx.fillStyle = rgba(tc, (p.owner ? 0.75 : 0.5) + 0.25 * Math.sin(f.t * 3 + x));
      ctx.fillText('?', s[0], s[1]);
      ctx.shadowBlur = 0;
      hits.push({ x: s[0], y: s[1], r: Math.max(30, s[3] * 0.8), ent: p });
      return;
    }

    // Base plate.
    ctx.fillStyle = rgba(col, p.owner ? 0.28 : 0.15);
    groundPath(circlePts(sz * 1.5, 0, 24).map((q) => [q[0] + x, q[1] + y, 0]));
    ctx.fill();
    ctx.strokeStyle = rgba(rc, 0.9);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Uplink slots: 8 around the base, lit for each one deployed.
    if (!f.territory) {
      for (let i = 0; i < D.MAX_UPLINKS; i++) {
        const a = (i / D.MAX_UPLINKS) * TAU + Math.PI / 8;
        const u = proj(x + Math.cos(a) * sz * 1.9, y + Math.sin(a) * sz * 1.9, 0.08);
        if (!u) continue;
        const on = i < (p.uplinks || 0);
        ctx.fillStyle = on ? rgba(col, 1) : 'rgba(255, 255, 255, 0.12)';
        ctx.beginPath(); ctx.arc(u[0], u[1], Math.max(1.5, u[3] * (on ? 0.09 : 0.06)), 0, TAU); ctx.fill();
      }
    }
    if (p.firewalls) {
      ctx.strokeStyle = rgba([255, 140, 80], 0.7);
      ctx.lineWidth = 2;
      for (let k = 0; k < p.firewalls; k++) {
        groundPath(circlePts(sz * (2.5 + k * 0.35), 0.1, 28).map((q) => [q[0] + x, q[1] + y, q[2]]));
        ctx.stroke();
      }
    }
    if (p.ready && !f.territory) {
      ctx.strokeStyle = rgba(ring, 0.5 + 0.5 * Math.sin(f.t * 4));
      groundPath(circlePts(sz * 2.3, 0, 28).map((q) => [q[0] + x, q[1] + y, 0]));
      ctx.stroke();
    }
    if (p.breached) {
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = '#FF5A6E';
      groundPath(circlePts(sz * 1.9, 0, 28).map((q) => [q[0] + x, q[1] + y, 0]));
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Beam of light.
    const top = proj(x, y, BEAM[p.rarity] * small);
    if (top) {
      const bg = ctx.createLinearGradient(base[0], base[1], top[0], top[1]);
      bg.addColorStop(0, rgba(col, p.owner ? 0.7 : 0.35));
      bg.addColorStop(1, rgba(col, 0));
      ctx.strokeStyle = bg;
      ctx.lineWidth = Math.max(2, base[3] * sz * 0.5);
      ctx.beginPath(); ctx.moveTo(base[0], base[1]); ctx.lineTo(top[0], top[1]); ctx.stroke();
    }

    // Crystal.
    const zc = (1.15 + 0.12 * Math.sin(f.t * 1.8 + x * 3)) * small + sz;
    const spin = f.t * 0.9 + x;
    const c = proj(x, y, zc);
    if (!c) return;
    ctx.shadowColor = rgba(col, 1);
    ctx.shadowBlur = 14;
    if (p.rarity === 'nexus') {
      // A black hole with a tilted accretion ring.
      const rr = sz * 1.9;
      const ringPts = [];
      for (let i = 0; i <= 40; i++) {
        const a = (i / 40) * TAU + f.t;
        ringPts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.5, zc + Math.sin(a) * rr * 0.35]);
      }
      ctx.lineWidth = Math.max(2, c[3] * 0.18);
      ctx.strokeStyle = 'rgba(233, 228, 255, 0.85)';
      groundPath(ringPts);
      ctx.stroke();
      ctx.shadowColor = '#B45CFF';
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.arc(c[0], c[1], c[3] * sz, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#B45CFF';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      const shape = p.rarity === 'common' ? bipyramid(4, sz, sz * 1.5, spin)
        : p.rarity === 'rare' ? bipyramid(3, sz * 1.1, sz * 1.7, spin)
        : p.rarity === 'epic' ? bipyramid(6, sz, sz * 1.6, spin)
        : bipyramid(5, sz * 1.1, sz * 2, spin);
      drawSolid(shape, x, y, zc, col, rgba(rc, 0.95));
    }
    ctx.shadowBlur = 0;

    if (p.key && !f.territory) {
      const k = proj(x, y, zc - sz * 2.2);
      if (k) {
        ctx.font = `${Math.round(clamp(k[3] * 0.45, 8, 14))}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('🔑', k[0] + k[3] * sz * 1.4, k[1]);
      }
    }
    if (p.mine) {
      ctx.fillStyle = '#fff';
      const t = proj(x, y, zc + sz * 2.4);
      if (t) {
        ctx.font = `700 ${Math.round(clamp(t[3] * 0.6, 8, 16))}px "Chakra Petch", sans-serif`;
        ctx.fillText('★', t[0], t[1]);
      }
      if (f.portalFx) {
        const a = f.t * 2.4 + x;
        const s = proj(x + Math.cos(a) * sz * 2, y + Math.sin(a) * sz * 2, zc);
        if (s) { ctx.beginPath(); ctx.arc(s[0], s[1], 2.2, 0, TAU); ctx.fill(); }
      }
    }
    if (p.defending) {
      // A shield dome.
      ctx.strokeStyle = rgba([255, 255, 255], 0.35 + 0.25 * Math.sin(f.t * 4));
      ctx.lineWidth = 1.5;
      for (let k = 1; k <= 3; k++) {
        const rr = sz * 2.6 * Math.cos((k / 4) * (Math.PI / 2));
        const zz = sz * 2.6 * Math.sin((k / 4) * (Math.PI / 2)) + zc * 0.4;
        groundPath(circlePts(rr, zz, 28).map((q) => [q[0] + x, q[1] + y, q[2]]));
        ctx.stroke();
      }
    }
    hits.push({ x: c[0], y: c[1], r: Math.max(32, c[3] * sz * 2.4), ent: p });
  }

  function drawEnergy(f, e, x, y) {
    const z = 0.7 + 0.15 * Math.sin(f.t * 3 + x * 5);
    const c = proj(x, y, z);
    if (!c) return;
    ctx.shadowColor = '#FFE65A';
    ctx.shadowBlur = 10;
    drawSolid(cube(0.26, f.t * 1.5 + y), x, y, z, [255, 214, 60], 'rgba(255, 250, 200, 0.95)');
    ctx.shadowBlur = 0;
    const g = proj(x, y, 0);
    if (g) {
      ctx.fillStyle = 'rgba(255, 230, 90, 0.18)';
      ctx.beginPath(); ctx.ellipse(g[0], g[1], g[3] * 0.3, g[3] * 0.12, 0, 0, TAU); ctx.fill();
    }
    hits.push({ x: c[0], y: c[1], r: 22, ent: e });
  }

  function drawSignal(f, s, x, y) {
    for (let k = 0; k < 3; k++) {
      const ph = (f.t * 0.6 + k / 3) % 1;
      ctx.strokeStyle = `rgba(190, 120, 255, ${0.85 * (1 - ph)})`;
      ctx.lineWidth = 2;
      groundPath(circlePts(0.3 + ph * 2.2, 0, 32).map((q) => [q[0] + x, q[1] + y, 0]));
      ctx.stroke();
    }
    const b = proj(x, y, 0), t = proj(x, y, 6);
    if (b && t) {
      const g = ctx.createLinearGradient(b[0], b[1], t[0], t[1]);
      g.addColorStop(0, 'rgba(200, 140, 255, 0.8)');
      g.addColorStop(1, 'rgba(200, 140, 255, 0)');
      ctx.strokeStyle = g;
      ctx.lineWidth = Math.max(2, b[3] * 0.12);
      ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.lineTo(t[0], t[1]); ctx.stroke();
    }
    const c = proj(x, y, 1.2 + 0.2 * Math.sin(f.t * 2));
    if (c) {
      ctx.fillStyle = '#E0C2FF';
      ctx.shadowColor = '#B45CFF';
      ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.arc(c[0], c[1], Math.max(3, c[3] * 0.16), 0, TAU); ctx.fill();
      ctx.shadowBlur = 0;
      hits.push({ x: c[0], y: c[1], r: 26, ent: s });
    }
  }

  // The part of segment a→b inside the disc, as [k0, k1] along it, or null.
  function clipToDisc(a, b, R) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const A = dx * dx + dy * dy, B = 2 * (a[0] * dx + a[1] * dy), C = a[0] * a[0] + a[1] * a[1] - R * R;
    if (A < 1e-9) return C <= 0 ? [0, 1] : null;
    const disc = B * B - 4 * A * C;
    if (disc <= 0) return null;
    const r = Math.sqrt(disc);
    const k0 = Math.max(0, (-B - r) / (2 * A)), k1 = Math.min(1, (-B + r) / (2 * A));
    return k0 < k1 ? [k0, k1] : null;
  }

  // A convex polygon cut down to the disc (approximated by a 48-gon).
  const DISC = Array.from({ length: 48 }, (_, i) => [Math.cos((i / 48) * TAU), Math.sin((i / 48) * TAU)]);
  function clipPolyToDisc(poly, R) {
    let out = poly;
    for (let i = 0; i < DISC.length && out.length; i++) {
      const p = [DISC[i][0] * R, DISC[i][1] * R], q = [DISC[(i + 1) % DISC.length][0] * R, DISC[(i + 1) % DISC.length][1] * R];
      const side = (v) => (q[0] - p[0]) * (v[1] - p[1]) - (q[1] - p[1]) * (v[0] - p[0]);
      const inp = out; out = [];
      for (let j = 0; j < inp.length; j++) {
        const u = inp[j], v = inp[(j + 1) % inp.length];
        const su = side(u), sv = side(v);
        if (su >= 0) out.push(u);
        if ((su >= 0) !== (sv >= 0)) {
          const t = su / (su - sv);
          out.push([u[0] + (v[0] - u[0]) * t, u[1] + (v[1] - u[1]) * t, u[2]]);
        }
      }
    }
    return out;
  }

  function drawLink(f, a, b, team, mine) {
    // Only the stretch over the disc: a link to a far portal runs off its edge.
    const cut = clipToDisc(a, b, RING * 1.04);
    if (!cut) return;
    const pts = [];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let i = 0; i <= 24; i++) {
      const k = cut[0] + (cut[1] - cut[0]) * (i / 24);
      pts.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, 1.2 + Math.sin(k * Math.PI) * Math.min(4, d * 0.25)]);
    }
    ctx.shadowColor = rgba(team, 1);
    ctx.shadowBlur = mine ? 10 : 4;
    ctx.strokeStyle = rgba(team, mine ? 0.85 : 0.6);
    ctx.lineWidth = mine ? 2.5 : 1.5;
    groundPath(pts);
    ctx.stroke();
    ctx.shadowBlur = 0;
    if (!mine) return;
    // A pulse of energy running along your links.
    const k = (f.t * 0.5) % 1;
    const i = Math.floor(k * 24);
    const s = proj(...pts[i]);
    if (s) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(s[0], s[1], 2.5, 0, TAU); ctx.fill(); }
  }

  function drawPlayer(f, team) {
    const yaw = (f.heading != null ? f.heading : cam.yaw) * DEG;
    const fx = Math.sin(yaw), fy = Math.cos(yaw), rx = Math.cos(yaw), ry = -Math.sin(yaw);
    const at = (u, v, z) => proj(fx * u + rx * v, fy * u + ry * v, z);
    // Glow on the ground.
    const g = proj(0, 0, 0);
    const gr = ctx.createRadialGradient(g[0], g[1], 1, g[0], g[1], g[3] * 1.4);
    gr.addColorStop(0, rgba(team, 0.5));
    gr.addColorStop(1, rgba(team, 0));
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.ellipse(g[0], g[1], g[3] * 1.4, g[3] * 0.7, 0, 0, TAU); ctx.fill();
    // An arrowhead with a little thickness.
    const outline = [[0.9, 0], [-0.55, 0.55], [-0.25, 0], [-0.55, -0.55]];
    const h = 0.18 + 0.05 * Math.sin(f.t * 3);
    const lo = outline.map(([u, v]) => at(u, v, h));
    const hi = outline.map(([u, v]) => at(u, v, h + 0.22));
    if (lo.some((p) => !p) || hi.some((p) => !p)) return;
    ctx.fillStyle = shade(team, 0.5);
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      ctx.beginPath();
      ctx.moveTo(lo[i][0], lo[i][1]); ctx.lineTo(lo[j][0], lo[j][1]); ctx.lineTo(hi[j][0], hi[j][1]); ctx.lineTo(hi[i][0], hi[i][1]);
      ctx.closePath();
      ctx.fill();
    }
    ctx.shadowColor = rgba(team, 1);
    ctx.shadowBlur = 16;
    ctx.fillStyle = shade(team, 1.1);
    ctx.beginPath();
    hi.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  /* ------------------ Frame ------------------ */

  function draw(f) {
    last = f;
    hits = [];
    const [ring, glow, sweep] = skinColors(f);
    const team = rgb(f.teamColor);

    // Ease the camera towards where it should face and how steeply.
    const targetYaw = f.follow ? f.heading : userYaw;
    let dy = ((targetYaw - yawShown + 540) % 360) - 180;
    yawShown += dy * (f.follow ? 0.12 : 1);
    pitchShown += ((f.territory ? 76 : 52) - pitchShown) * 0.1;
    if (!f.follow) userYaw = yawShown;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cam = makeCamera(yawShown, pitchShown);
    drawSky(f, ring);
    drawGround(f, ring, glow, sweep);

    // The portal you're linking from pulses.
    if (f.linkFrom) {
      const [x, y] = toWorld(f, f.linkFrom);
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.5 + 0.4 * Math.sin(f.t * 5)})`;
      ctx.lineWidth = 2;
      groundPath(circlePts(1.6 + 0.2 * Math.sin(f.t * 5), 0, 32).map((q) => [q[0] + x, q[1] + y, 0]));
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Walk target.
    if (f.walkTo) {
      const [x, y] = toWorld(f, f.walkTo);
      const p = proj(x, y, 0);
      if (p) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = 2;
        groundPath(circlePts(0.35 + 0.1 * Math.sin(f.t * 5), 0, 20).map((q) => [q[0] + x, q[1] + y, 0]));
        ctx.stroke();
      }
    }

    // Control fields: translucent triangles just above the ground.
    // Other teams' fields are fainter; yours pulse gently.
    for (const fl of f.fields || []) {
      const col = fl.team ? rgb(D.TEAMS[fl.team].color) : team;
      const pts = clipPolyToDisc(fl.pts.map((ll) => toWorld(f, ll)).map((w) => [w[0], w[1], 0.04]), RING * 1.04);
      if (pts.length < 3) continue;
      groundPath([...pts, pts[0]]);
      ctx.fillStyle = rgba(col, fl.mine ? 0.16 + 0.05 * Math.sin(f.t * 2) : 0.1);
      ctx.fill();
      ctx.strokeStyle = rgba(col, 0.4);
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Links (drawn under the portals).
    for (const l of f.links) {
      const a = toWorld(f, l.a), b = toWorld(f, l.b);
      drawLink(f, a, b, l.team ? rgb(D.TEAMS[l.team].color) : team, !!l.mine);
    }

    // Everything standing on the disc, far to near.
    const items = [];
    for (const p of f.portals) {
      const [x, y, d] = toWorld(f, p);
      if (d > f.range * 1.02) continue;
      items.push({ x, y, draw: () => drawPortal(f, p, x, y, ring) });
    }
    for (const e of f.energy) {
      const [x, y, d] = toWorld(f, e);
      if (d <= f.range) items.push({ x, y, draw: () => drawEnergy(f, e, x, y) });
    }
    for (const s of f.signals) {
      const [x, y, d] = toWorld(f, s);
      if (d <= f.range) items.push({ x, y, draw: () => drawSignal(f, s, x, y) });
    }
    items.push({ x: 0, y: 0, draw: () => drawPlayer(f, team) });
    for (const it of items) {
      const p = proj(it.x, it.y, 0);
      it.depth = p ? p[2] : -1;
    }
    items.filter((it) => it.depth > 0).sort((a, b) => b.depth - a.depth).forEach((it) => it.draw());
    // Pulse Bomb blasts: an expanding shockwave dome.
    for (const b of f.blasts || []) {
      const age = f.t - b.t;
      if (age < 0 || age > 1.2) continue;
      const [x, y] = toWorld(f, b);
      const k = age / 1.2;
      ctx.strokeStyle = `rgba(255, 120, 90, ${1 - k})`;
      ctx.lineWidth = 3;
      for (let j = 0; j < 3; j++) {
        const rr = 0.4 + k * 3.2 * (1 - j * 0.25);
        groundPath(circlePts(rr, j * 0.6 * (1 - k), 32).map((q) => [q[0] + x, q[1] + y, q[2]]));
        ctx.stroke();
      }
    }

    // Nearest things win taps.
    hits.reverse();

    // Range label.
    ctx.fillStyle = 'rgba(200, 225, 255, 0.65)';
    ctx.font = '600 11px "Chakra Petch", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${f.range >= 1000 ? `${(f.range / 1000).toFixed(1)} km` : `${Math.round(f.range)} m`} radar${f.follow ? '' : ' · drag to turn'}`, 8, Ht - 6);
  }

  PH.compass = { init, resize, draw };
})(window.PH);
