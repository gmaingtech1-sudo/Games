/* Hyperdot — drawing a level. 1D and 2D levels are drawn flat, straight from
   above, like a board. From 3D up, the view is a little 3D scene you can turn:
   walls are glass blocks, empty cells are faint lattice points, and the dot
   floats between them. In 4D and 5D the scene shows the 3D slice you're in;
   the strip (or grid) of panels above it shows every slice at once. */
(function (HD) {
  'use strict';

  const U = HD.util;
  const G = HD.grid;
  const R = HD.rules;
  const { TAU, rgba, shade, clamp } = U;

  const COL = {
    wall: '#5E6FB0',
    wallEdge: '#A9B6FF',
    floor: '#121838',
    floorEdge: '#232C5C',
    player: '#7DF9FF',
    shard: '#FFD95A',
    exit: '#9DF7FF',
    exitShut: '#6B7499',
    crate: '#C98848',
    gate: '#FF8A3D',
    ground: '#28315F',
  };

  /* ---------- Cached glow sprites ---------- */

  const glowCache = new Map();
  function glow(color, alpha) {
    const k = color + alpha;
    let c = glowCache.get(k);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, rgba(color, alpha));
    gr.addColorStop(0.35, rgba(color, alpha * 0.45));
    gr.addColorStop(1, rgba(color, 0));
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    glowCache.set(k, c);
    return c;
  }

  function drawGlow(g, color, x, y, r, a) {
    g.drawImage(glow(color, a === undefined ? 0.9 : a), x - r, y - r, r * 2, r * 2);
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

  /* ---------- Sprites (shared by the flat and 3D views) ---------- */

  function drawPlayer(g, x, y, r, t, alpha, mini) {
    g.globalAlpha = alpha;
    if (!mini) drawGlow(g, COL.player, x, y, r * 3.2, 0.8);
    else drawGlow(g, COL.player, x, y, r * 2.6, 0.9);
    const gr = g.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
    gr.addColorStop(0, '#FFFFFF');
    gr.addColorStop(0.55, '#D6FDFF');
    gr.addColorStop(1, COL.player);
    g.fillStyle = gr;
    g.beginPath();
    g.arc(x, y, r * (1 + Math.sin(t * 3) * (mini ? 0 : 0.04)), 0, TAU);
    g.fill();
    g.globalAlpha = 1;
  }

  function drawGhost(g, x, y, r, t) {
    g.strokeStyle = rgba(COL.player, 0.75);
    g.lineWidth = Math.max(1.2, r * 0.18);
    g.setLineDash([r * 0.5, r * 0.35]);
    g.lineDashOffset = -t * 10;
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.stroke();
    g.setLineDash([]);
  }

  function drawShard(g, x, y, r, t, mini) {
    if (!mini) drawGlow(g, COL.shard, x, y, r * 2.8, 0.55);
    const spin = Math.cos(t * 2.2);
    const w = r * (0.35 + 0.45 * Math.abs(spin));
    const bob = mini ? 0 : Math.sin(t * 2.6) * r * 0.12;
    y += bob;
    g.fillStyle = spin > 0 ? '#FFF3B8' : COL.shard;
    g.beginPath();
    g.moveTo(x, y - r);
    g.lineTo(x + w, y);
    g.lineTo(x, y + r);
    g.lineTo(x - w, y);
    g.closePath();
    g.fill();
    g.fillStyle = shade(COL.shard, -0.25);
    g.beginPath();
    g.moveTo(x, y - r);
    g.lineTo(x + w * (spin > 0 ? 1 : -1), y);
    g.lineTo(x, y + r);
    g.closePath();
    g.fill();
  }

  function drawKey(g, x, y, r, color, t, mini) {
    if (!mini) drawGlow(g, color, x, y, r * 2.6, 0.5);
    y += mini ? 0 : Math.sin(t * 2.4 + 1) * r * 0.1;
    g.save();
    g.translate(x, y);
    g.rotate(-0.7);
    g.strokeStyle = color;
    g.fillStyle = color;
    g.lineWidth = Math.max(1.5, r * 0.28);
    g.lineCap = 'round';
    g.beginPath();
    g.arc(-r * 0.45, 0, r * 0.38, 0, TAU);
    g.stroke();
    g.beginPath();
    g.moveTo(-r * 0.07, 0);
    g.lineTo(r * 0.95, 0);
    g.moveTo(r * 0.55, 0);
    g.lineTo(r * 0.55, r * 0.35);
    g.moveTo(r * 0.85, 0);
    g.lineTo(r * 0.85, r * 0.3);
    g.stroke();
    g.restore();
  }

  function drawExit(g, x, y, r, t, open, mini) {
    if (open) {
      if (!mini) drawGlow(g, COL.exit, x, y, r * 3, 0.7);
      g.lineWidth = Math.max(1.5, r * 0.2);
      g.strokeStyle = '#FFFFFF';
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.stroke();
      if (!mini) {
        g.strokeStyle = rgba(COL.exit, 0.9);
        g.lineWidth = Math.max(1, r * 0.12);
        for (let i = 0; i < 3; i++) {
          const a = t * 2.4 + (i * TAU) / 3;
          g.beginPath();
          g.arc(x, y, r * 0.62, a, a + 1.2);
          g.stroke();
        }
      }
      g.fillStyle = rgba(COL.exit, 0.35);
      g.beginPath();
      g.arc(x, y, r * 0.45, 0, TAU);
      g.fill();
    } else {
      g.lineWidth = Math.max(1.2, r * 0.16);
      g.strokeStyle = COL.exitShut;
      g.setLineDash([r * 0.42, r * 0.3]);
      g.lineDashOffset = mini ? 0 : -t * 4;
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = rgba(COL.exitShut, 0.35);
      g.beginPath();
      g.arc(x, y, r * 0.3, 0, TAU);
      g.fill();
    }
  }

  // A keyhole, drawn on doors.
  function drawKeyhole(g, x, y, r, color) {
    g.fillStyle = color;
    g.beginPath();
    g.arc(x, y - r * 0.22, r * 0.3, 0, TAU);
    g.fill();
    g.beginPath();
    g.moveTo(x - r * 0.16, y - r * 0.1);
    g.lineTo(x + r * 0.16, y - r * 0.1);
    g.lineTo(x + r * 0.26, y + r * 0.55);
    g.lineTo(x - r * 0.26, y + r * 0.55);
    g.closePath();
    g.fill();
  }

  /* ---------- Which cells to draw ----------
     `hidden` holds the W and V coordinates of the slice being drawn; `layer`
     picks a single floor (for the 3D floor-plan panels). */

  function inSlice(L, i, P) {
    for (let k = 3; k < L.n; k++) if (G.coord(L, i, k) !== P.hidden[k - 3]) return false;
    if (P.layer >= 0 && G.coord(L, i, 2) !== P.layer) return false;
    return true;
  }

  const xyz = (L, i) => [G.coord(L, i, 0), G.coord(L, i, 1), G.coord(L, i, 2)];

  /* ---------- Fitting ---------- */

  const sizeOf = (L) => [L.dims[0], L.dims[1] || 1, L.dims[2] || 1];

  // Cell size in pixels for a box. Flat views fit exactly; 3D views fit a
  // sphere around the block, so turning it never changes the zoom.
  function fit(L, box, flat, maxCell) {
    const [X, Y, Z] = sizeOf(L);
    let s;
    if (flat) s = Math.min(box.w / (X + 0.6), box.h / (Y + 0.6));
    else {
      const r = Math.hypot(X, Y, Z) / 2;
      s = Math.min(box.w, box.h) / (2 * r + 0.5);
    }
    return Math.min(s, maxCell || 96);
  }

  /* ---------- Projection ---------- */

  function projector(cam, box, scale, L) {
    const [X, Y, Z] = sizeOf(L);
    const cx = (X - 1) / 2;
    const cy = (Y - 1) / 2;
    const cz = (Z - 1) / 2;
    const cyaw = Math.cos(cam.yaw);
    const syaw = Math.sin(cam.yaw);
    const sp = Math.sin(cam.pitch);
    const cp = Math.cos(cam.pitch);
    const ox = box.x + box.w / 2 + (box.ox || 0);
    const oy = box.y + box.h / 2 + (box.oy || 0);
    const P = function (x, y, z) {
      x -= cx;
      y -= cy;
      z -= cz;
      const xr = x * cyaw - y * syaw;
      const yr = x * syaw + y * cyaw;
      return { x: ox + xr * scale, y: oy + (yr * sp - z * cp) * scale, d: yr * cp + z * sp };
    };
    // How much a face with this normal points at the camera.
    P.facing = [
      [-syaw * cp, syaw * cp],
      [-cyaw * cp, cyaw * cp],
      [-sp, sp],
    ];
    P.scale = scale;
    P.half = [cx, cy, cz];
    return P;
  }

  // Screen direction of each spatial axis (for the gizmo and the camera-
  // relative pad).
  function axisScreen(cam) {
    const cyaw = Math.cos(cam.yaw);
    const syaw = Math.sin(cam.yaw);
    const sp = Math.sin(cam.pitch);
    const cp = Math.cos(cam.pitch);
    return [
      [cyaw, syaw * sp],
      [-syaw, cyaw * sp],
      [0, -cp],
    ];
  }

  /* ---------- Light ---------- */

  const LIGHT = (() => {
    const v = [-0.45, 0.35, 0.82];
    const m = Math.hypot(v[0], v[1], v[2]);
    return v.map((c) => c / m);
  })();
  // Tops catch the light; sides are shaded by how much they face it.
  const faceLight = (axis, sign) => (axis === 2 && sign > 0 ? 1.18 : 0.42 + 0.45 * Math.max(0, LIGHT[axis] * sign));

  /* ---------- The 3D view ---------- */

  // Cube corner offsets for the face on `axis` at `sign`.
  function faceCorners(axis, sign, h) {
    const u = (axis + 1) % 3;
    const v = (axis + 2) % 3;
    const out = [];
    const quad = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (const [a, b] of quad) {
      const p = [0, 0, 0];
      p[axis] = sign * h;
      p[u] = a * h;
      p[v] = b * h;
      out.push(p);
    }
    return out;
  }
  const FACES = [];
  for (let a = 0; a < 3; a++) for (const s of [-1, 1]) FACES.push({ axis: a, sign: s });

  // Everything drawn in 3D goes in one list, sorted far to near.
  function pushCube(list, Pj, pos, h, style, cullFn) {
    const c = Pj(pos[0], pos[1], pos[2]);
    for (const f of FACES) {
      if (Pj.facing[f.axis][f.sign > 0 ? 1 : 0] <= 1e-4) continue;
      if (cullFn && cullFn(f.axis, f.sign)) continue;
      const pts = faceCorners(f.axis, f.sign, h).map((o) => Pj(pos[0] + o[0], pos[1] + o[1], pos[2] + o[2]));
      const fc = [0, 0, 0];
      fc[f.axis] = f.sign * h;
      const d = Pj(pos[0] + fc[0], pos[1] + fc[1], pos[2] + fc[2]).d;
      list.push({ d, type: 'face', pts, style, light: faceLight(f.axis, f.sign), axis: f.axis, sign: f.sign });
    }
    return c;
  }

  // `fog` fades faces further from the camera, which helps judge depth.
  function drawFace(g, e, P, fog) {
    const st = e.style;
    const p = e.pts;
    g.beginPath();
    g.moveTo(p[0].x, p[0].y);
    for (let i = 1; i < 4; i++) g.lineTo(p[i].x, p[i].y);
    g.closePath();
    const a = (st.alpha === undefined ? 1 : st.alpha) * P.alpha;
    if (a <= 0.01) return;
    const lit = e.light >= 1 ? shade(st.color, (e.light - 1) * 1.4) : shade(st.color, (e.light - 1) * 0.85);
    g.fillStyle = rgba(lit, Math.min(1, a * st.fill * (st.fill < 1 ? fog : 1)));
    g.fill();
    if (st.edge) {
      const top = e.axis === 2 && e.sign > 0;
      g.strokeStyle = rgba(st.edge, a * (st.edgeAlpha || 0.6) * (top ? 1 : 0.6) * (0.5 + fog * 0.5));
      g.lineWidth = st.lw || 1;
      g.stroke();
    }
    if (st.cross) {
      g.strokeStyle = rgba(shade(st.color, -0.45), a * 0.8);
      g.lineWidth = Math.max(1, (st.lw || 1) * 1.2);
      g.beginPath();
      g.moveTo(p[0].x, p[0].y);
      g.lineTo(p[2].x, p[2].y);
      g.moveTo(p[1].x, p[1].y);
      g.lineTo(p[3].x, p[3].y);
      g.stroke();
    }
  }

  function draw3D(g, P) {
    const L = P.L;
    const s = P.s;
    const t = P.t;
    const mini = !!P.mini;
    const Pj = projector(P.cam, P.box, P.scale, L);
    const sc = P.scale;
    const [X, Y, Z] = sizeOf(L);
    const list = [];
    const held = R.platesHeld(L, s);
    const lw = mini ? 0.75 : Math.max(1, sc / 48);
    P.alpha = P.alpha === undefined ? 1 : P.alpha;
    const pz = P.playerPos ? P.playerPos[2] : G.coord(L, s.pos, 2);

    // Ground grid and the outline of the block.
    g.save();
    g.globalAlpha = P.alpha;
    g.strokeStyle = rgba(COL.ground, mini ? 0.55 : 0.6);
    g.lineWidth = lw;
    g.beginPath();
    const gz = -0.5;
    for (let x = 0; x <= X; x++) {
      const a = Pj(x - 0.5, -0.5, gz);
      const b = Pj(x - 0.5, Y - 0.5, gz);
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
    }
    for (let y = 0; y <= Y; y++) {
      const a = Pj(-0.5, y - 0.5, gz);
      const b = Pj(X - 0.5, y - 0.5, gz);
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
    }
    g.stroke();
    if (Z > 1) {
      g.strokeStyle = rgba(COL.ground, 0.45);
      g.setLineDash(mini ? [] : [3, 4]);
      g.beginPath();
      for (const [x, y] of [[-0.5, -0.5], [X - 0.5, -0.5], [X - 0.5, Y - 0.5], [-0.5, Y - 0.5]]) {
        const a = Pj(x, y, gz);
        const b = Pj(x, y, Z - 0.5);
        g.moveTo(a.x, a.y);
        g.lineTo(b.x, b.y);
      }
      g.stroke();
      g.setLineDash([]);
    }
    g.restore();

    const wallStyle = { color: COL.wall, fill: mini ? 0.62 : 0.58, edge: COL.wallEdge, edgeAlpha: mini ? 0.55 : 0.6, lw };
    const wallAbove = Object.assign({}, wallStyle, { fill: 0.16, edgeAlpha: 0.35 });
    const isWall = (i) => i >= 0 && L.wall[i] === 1;

    for (let i = 0; i < L.size; i++) {
      if (!inSlice(L, i, P)) continue;
      const pos = xyz(L, i);
      if (L.wall[i]) {
        const above = !mini && Z > 1 && pos[2] > pz + 0.01;
        pushCube(list, Pj, pos, 0.5, above ? wallAbove : wallStyle, (axis, sign) => isWall(G.step(L, i, axis, sign)));
        continue;
      }
      const d = L.doorAt[i];
      if (d >= 0 && !R.has(s.doors, d)) {
        const col = G.KEY_COLORS[L.doors[d].color];
        const fade = P.fxDoor && P.fxDoor.cell === i ? 1 - P.fxDoor.k : 1;
        pushCube(list, Pj, pos, 0.46 * (0.6 + 0.4 * fade), { color: col, fill: 0.5, edge: col, edgeAlpha: 0.95, lw, alpha: fade });
        const c = Pj(pos[0], pos[1], pos[2]);
        list.push({ d: c.d + 0.6, type: 'keyhole', x: c.x, y: c.y, r: sc * 0.22, color: shade(col, 0.7), alpha: fade });
        continue;
      }
      if (L.gateAt[i]) {
        const open = R.gateOpen(L, s, i, held);
        const k = P.fxGate === undefined ? (open ? 1 : 0) : P.fxGate;
        if (k < 0.99) {
          pushCube(list, Pj, pos, 0.47, { color: COL.gate, fill: 0.3 * (1 - k), edge: COL.gate, edgeAlpha: 0.9 * (1 - k) + 0.15, lw, alpha: 1 });
        } else {
          pushCube(list, Pj, pos, 0.47, { color: COL.gate, fill: 0, edge: COL.gate, edgeAlpha: 0.22, lw, alpha: 1 });
        }
      }
      if (L.plateAt[i]) {
        const on = s.pos === i || s.crates.indexOf(i) >= 0;
        pushCube(list, Pj, pos, 0.49, { color: COL.gate, fill: on ? 0.16 : 0.05, edge: COL.gate, edgeAlpha: on ? 1 : 0.7, lw: lw * 1.4 });
      }
      const c = Pj(pos[0], pos[1], pos[2]);
      if (i === L.exit) {
        list.push({ d: c.d, type: 'exit', x: c.x, y: c.y, r: sc * 0.3, open: R.allShards(L, s) });
      }
      const it = L.itemAt[i];
      if (it >= 0) {
        const got = R.has(s.items, it);
        const fx = P.fxItem && P.fxItem.cell === i ? P.fxItem.k : -1;
        if (!got || fx >= 0) {
          const item = L.items[it];
          list.push({ d: c.d, type: item.kind === G.SHARD ? 'shard' : 'key', x: c.x, y: c.y, r: sc * (item.kind === G.SHARD ? 0.22 : 0.26), color: G.KEY_COLORS[item.color], fx });
        }
      } else if (!mini && i !== L.exit && i !== s.pos && !L.plateAt[i] && !L.gateAt[i]) {
        list.push({ d: c.d - 0.01, type: 'dot', x: c.x, y: c.y });
      }
    }

    // Crates.
    for (let ci = 0; ci < s.crates.length; ci++) {
      const cell = s.crates[ci];
      if (!inSlice(L, cell, P)) continue;
      const pos = P.cratePos && P.cratePos[ci] ? P.cratePos[ci] : xyz(L, cell);
      pushCube(list, Pj, pos, 0.4, { color: COL.crate, fill: 1, edge: shade(COL.crate, -0.5), edgeAlpha: 1, lw, cross: !mini });
    }

    // The dot.
    const playerHere = P.showPlayer !== false && inSlice(L, s.pos, P);
    if (playerHere) {
      let pos = P.playerPos || xyz(L, s.pos);
      if (P.bump) {
        pos = pos.slice();
        pos[P.bump.axis] += P.bump.dir * P.bump.amt;
      }
      const c = Pj(pos[0], pos[1], pos[2]);
      list.push({ d: c.d + 0.02, type: 'player', x: c.x, y: c.y, r: sc * (mini ? 0.3 : 0.24) * (P.playerScale || 1), pos });
    }
    if (P.ghost >= 0 && inSlice(L, P.ghost, P) && P.ghost !== s.pos) {
      const pos = xyz(L, P.ghost);
      const c = Pj(pos[0], pos[1], pos[2]);
      list.push({ d: c.d + 0.02, type: 'ghost', x: c.x, y: c.y, r: sc * 0.24 });
    }

    // Lit neighbours you can step to.
    if (P.hints) {
      for (const h of P.hints) {
        const pos = xyz(L, h.cell);
        const c = Pj(pos[0], pos[1], pos[2]);
        list.push({ d: c.d + 0.03, type: 'hint', x: c.x, y: c.y, r: sc * 0.11, color: HD.AXES[h.axis].color, strong: h.strong });
      }
    }

    list.sort((a, b) => a.d - b.d);
    const dotR = Math.max(1, sc * 0.035);
    // Depth range for the fog: half the block's diagonal either side.
    const reach = Math.hypot(X, Y, Z) / 2 + 0.5;

    for (const e of list) {
      switch (e.type) {
        case 'face':
          drawFace(g, e, P, mini ? 1 : clamp(0.45 + 0.55 * ((e.d + reach) / (2 * reach)), 0.35, 1));
          break;
        case 'dot':
          g.fillStyle = rgba('#8C9BE0', 0.45 * P.alpha);
          g.fillRect(e.x - dotR, e.y - dotR, dotR * 2, dotR * 2);
          break;
        case 'keyhole':
          g.globalAlpha = P.alpha * e.alpha;
          drawKeyhole(g, e.x, e.y, e.r, e.color);
          g.globalAlpha = 1;
          break;
        case 'exit':
          g.globalAlpha = P.alpha;
          drawExit(g, e.x, e.y, e.r, t, e.open, mini);
          g.globalAlpha = 1;
          break;
        case 'shard':
        case 'key': {
          let r = e.r;
          let y = e.y;
          let a = P.alpha;
          if (e.fx >= 0) {
            r *= 1 + e.fx * 0.8;
            y -= e.fx * sc * 0.5;
            a *= 1 - e.fx;
          }
          g.globalAlpha = a;
          if (e.type === 'shard') drawShard(g, e.x, y, r, t, mini);
          else drawKey(g, e.x, y, r, e.color, t, mini);
          g.globalAlpha = 1;
          break;
        }
        case 'player': {
          if (!mini && Z > 1) {
            // A drop line to the ground helps judge height.
            const pos = e.pos;
            const base = Pj(pos[0], pos[1], -0.5);
            g.strokeStyle = rgba(COL.player, 0.35 * P.alpha);
            g.lineWidth = 1;
            g.setLineDash([2, 3]);
            g.beginPath();
            g.moveTo(e.x, e.y);
            g.lineTo(base.x, base.y);
            g.stroke();
            g.setLineDash([]);
            g.fillStyle = rgba(COL.player, 0.25 * P.alpha);
            g.beginPath();
            for (let k = 0; k <= 16; k++) {
              const a = (k / 16) * TAU;
              const q = Pj(pos[0] + Math.cos(a) * 0.22, pos[1] + Math.sin(a) * 0.22, -0.5);
              if (k) g.lineTo(q.x, q.y);
              else g.moveTo(q.x, q.y);
            }
            g.fill();
          }
          drawPlayer(g, e.x, e.y, e.r, t, P.alpha * (P.playerAlpha === undefined ? 1 : P.playerAlpha), mini);
          break;
        }
        case 'ghost':
          drawGhost(g, e.x, e.y, e.r, t);
          break;
        case 'hint': {
          const pulse = 0.55 + 0.45 * Math.sin(t * 5);
          g.globalAlpha = P.alpha * (e.strong ? 1 : 0.5 + pulse * 0.3);
          g.strokeStyle = e.color;
          g.lineWidth = e.strong ? 3 : 2;
          g.beginPath();
          g.arc(e.x, e.y, e.r * (e.strong ? 1.6 + pulse * 0.5 : 1), 0, TAU);
          g.stroke();
          if (e.strong) {
            g.fillStyle = rgba(e.color, 0.35);
            g.fill();
          }
          g.globalAlpha = 1;
          break;
        }
      }
    }
    return Pj;
  }

  /* ---------- The flat view (1D, 2D, and the 3D floor plans) ---------- */

  function flatProjector(box, scale, L) {
    const [X, Y] = sizeOf(L);
    const ox = box.x + box.w / 2 + (box.ox || 0) - (X * scale) / 2;
    const oy = box.y + box.h / 2 + (box.oy || 0) - (Y * scale) / 2;
    const P = (x, y) => ({ x: ox + (x + 0.5) * scale, y: oy + (y + 0.5) * scale, d: 0 });
    P.scale = scale;
    return P;
  }

  function drawFlat(g, P) {
    const L = P.L;
    const s = P.s;
    const t = P.t;
    const mini = !!P.mini;
    const sc = P.scale;
    const Pj = flatProjector(P.box, sc, L);
    const held = R.platesHeld(L, s);
    const inset = sc * 0.06;
    const rad = sc * 0.16;
    P.alpha = P.alpha === undefined ? 1 : P.alpha;
    g.save();
    g.globalAlpha = P.alpha;

    const cells = [];
    for (let i = 0; i < L.size; i++) if (inSlice(L, i, P)) cells.push(i);

    // In 1D the board is a stretch of an endless line.
    if (L.n === 1 && !mini) {
      const y = Pj(0, 0).y;
      const x0 = P.box.x + (P.box.ox || 0);
      const gr = g.createLinearGradient(x0, 0, x0 + P.box.w, 0);
      gr.addColorStop(0, rgba(HD.AXES[0].color, 0));
      gr.addColorStop(0.5, rgba(HD.AXES[0].color, 0.5));
      gr.addColorStop(1, rgba(HD.AXES[0].color, 0));
      g.strokeStyle = gr;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x0, y);
      g.lineTo(x0 + P.box.w, y);
      g.stroke();
    }

    // Floor tiles first, then raised things with their shadows.
    for (const i of cells) {
      if (L.wall[i]) continue;
      const c = Pj(G.coord(L, i, 0), G.coord(L, i, 1));
      roundRect(g, c.x - sc / 2 + inset, c.y - sc / 2 + inset, sc - inset * 2, sc - inset * 2, rad);
      g.fillStyle = COL.floor;
      g.fill();
      if (!mini) {
        g.strokeStyle = COL.floorEdge;
        g.lineWidth = 1;
        g.stroke();
      }
    }
    // Wall shadows, then walls.
    const sh = sc * 0.08;
    g.fillStyle = 'rgba(2,3,10,0.6)';
    for (const i of cells) {
      if (!L.wall[i]) continue;
      const c = Pj(G.coord(L, i, 0), G.coord(L, i, 1));
      roundRect(g, c.x - sc / 2 + inset * 0.5, c.y - sc / 2 + inset * 0.5 + sh, sc - inset, sc - inset, rad);
      g.fill();
    }
    for (const i of cells) {
      if (!L.wall[i]) continue;
      const c = Pj(G.coord(L, i, 0), G.coord(L, i, 1));
      const x0 = c.x - sc / 2 + inset * 0.5;
      const y0 = c.y - sc / 2 + inset * 0.5;
      const gr = g.createLinearGradient(0, y0, 0, y0 + sc);
      gr.addColorStop(0, '#46559A');
      gr.addColorStop(1, '#2A3466');
      roundRect(g, x0, y0, sc - inset, sc - inset, rad);
      g.fillStyle = gr;
      g.fill();
      if (!mini) {
        g.strokeStyle = 'rgba(169,182,255,0.35)';
        g.lineWidth = 1;
        g.stroke();
      }
    }

    for (const i of cells) {
      if (L.wall[i]) continue;
      const c = Pj(G.coord(L, i, 0), G.coord(L, i, 1));
      const x0 = c.x - sc / 2;
      const y0 = c.y - sc / 2;
      if (L.plateAt[i]) {
        const on = s.pos === i || s.crates.indexOf(i) >= 0;
        const m = sc * 0.14;
        const k = sc * 0.2;
        g.strokeStyle = rgba(COL.gate, on ? 1 : 0.75);
        g.lineWidth = Math.max(1.5, sc * 0.05);
        g.beginPath();
        for (const [ax, ay, dx, dy] of [[x0 + m, y0 + m, 1, 1], [x0 + sc - m, y0 + m, -1, 1], [x0 + sc - m, y0 + sc - m, -1, -1], [x0 + m, y0 + sc - m, 1, -1]]) {
          g.moveTo(ax + dx * k, ay);
          g.lineTo(ax, ay);
          g.lineTo(ax, ay + dy * k);
        }
        g.stroke();
        if (on) {
          g.fillStyle = rgba(COL.gate, 0.18);
          roundRect(g, x0 + m, y0 + m, sc - m * 2, sc - m * 2, rad * 0.6);
          g.fill();
        }
      }
      if (L.gateAt[i]) {
        const open = R.gateOpen(L, s, i, held);
        const k = P.fxGate === undefined ? (open ? 1 : 0) : P.fxGate;
        const m = sc * 0.1;
        g.save();
        roundRect(g, x0 + m, y0 + m, sc - m * 2, sc - m * 2, rad * 0.6);
        if (k < 0.99) {
          g.clip();
          g.fillStyle = rgba(COL.gate, 0.22 * (1 - k));
          g.fillRect(x0, y0, sc, sc);
          g.strokeStyle = rgba(COL.gate, 0.85 * (1 - k));
          g.lineWidth = Math.max(1.5, sc * 0.07);
          g.beginPath();
          for (let q = -1; q <= 3; q++) {
            const xx = x0 + (q * sc) / 3 + ((t * 0.15 * sc) % (sc / 3));
            g.moveTo(xx, y0 + sc);
            g.lineTo(xx + sc / 2, y0);
          }
          g.stroke();
          g.restore();
          g.save();
          roundRect(g, x0 + m, y0 + m, sc - m * 2, sc - m * 2, rad * 0.6);
          g.strokeStyle = rgba(COL.gate, 0.9);
          g.lineWidth = Math.max(1, sc * 0.03);
          g.stroke();
        } else {
          g.strokeStyle = rgba(COL.gate, 0.4);
          g.setLineDash([sc * 0.08, sc * 0.08]);
          g.lineWidth = Math.max(1, sc * 0.03);
          g.stroke();
          g.setLineDash([]);
        }
        g.restore();
      }
      const d = L.doorAt[i];
      if (d >= 0 && !R.has(s.doors, d)) {
        const col = G.KEY_COLORS[L.doors[d].color];
        const fade = P.fxDoor && P.fxDoor.cell === i ? 1 - P.fxDoor.k : 1;
        const m = sc * (0.08 + (1 - fade) * 0.2);
        g.globalAlpha = P.alpha * fade;
        g.fillStyle = 'rgba(2,3,10,0.5)';
        roundRect(g, x0 + m, y0 + m + sh, sc - m * 2, sc - m * 2, rad);
        g.fill();
        roundRect(g, x0 + m, y0 + m, sc - m * 2, sc - m * 2, rad);
        g.fillStyle = shade(col, -0.35);
        g.fill();
        g.strokeStyle = col;
        g.lineWidth = Math.max(1.5, sc * 0.05);
        g.stroke();
        drawKeyhole(g, c.x, c.y, sc * 0.3, shade(col, 0.6));
        g.globalAlpha = P.alpha;
      }
      if (i === L.exit) drawExit(g, c.x, c.y, sc * 0.3, t, R.allShards(L, s), mini);
      const it = L.itemAt[i];
      if (it >= 0) {
        const got = R.has(s.items, it);
        const fx = P.fxItem && P.fxItem.cell === i ? P.fxItem.k : -1;
        if (!got || fx >= 0) {
          const item = L.items[it];
          let r = sc * (item.kind === G.SHARD ? 0.24 : 0.27);
          let y = c.y;
          if (fx >= 0) {
            r *= 1 + fx * 0.8;
            y -= fx * sc * 0.5;
            g.globalAlpha = P.alpha * (1 - fx);
          }
          if (item.kind === G.SHARD) drawShard(g, c.x, y, r, t, mini);
          else drawKey(g, c.x, y, r, G.KEY_COLORS[item.color], t, mini);
          g.globalAlpha = P.alpha;
        }
      }
    }

    // Crates.
    for (let ci = 0; ci < s.crates.length; ci++) {
      const cell = s.crates[ci];
      if (!inSlice(L, cell, P)) continue;
      const pos = P.cratePos && P.cratePos[ci] ? P.cratePos[ci] : xyz(L, cell);
      const c = Pj(pos[0], pos[1]);
      const m = sc * 0.12;
      const x0 = c.x - sc / 2 + m;
      const y0 = c.y - sc / 2 + m;
      const w = sc - m * 2;
      g.fillStyle = 'rgba(2,3,10,0.55)';
      roundRect(g, x0, y0 + sh, w, w, rad * 0.6);
      g.fill();
      roundRect(g, x0, y0, w, w, rad * 0.6);
      g.fillStyle = COL.crate;
      g.fill();
      g.strokeStyle = shade(COL.crate, -0.5);
      g.lineWidth = Math.max(1.5, sc * 0.05);
      g.stroke();
      if (!mini) {
        g.beginPath();
        g.moveTo(x0 + w * 0.18, y0 + w * 0.18);
        g.lineTo(x0 + w * 0.82, y0 + w * 0.82);
        g.moveTo(x0 + w * 0.82, y0 + w * 0.18);
        g.lineTo(x0 + w * 0.18, y0 + w * 0.82);
        g.stroke();
      }
    }

    if (P.hints) {
      for (const h of P.hints) {
        if (!h.strong) continue;
        const pos = xyz(L, h.cell);
        const c = Pj(pos[0], pos[1]);
        const pulse = 0.55 + 0.45 * Math.sin(t * 5);
        g.strokeStyle = HD.AXES[h.axis].color;
        g.lineWidth = 3;
        g.beginPath();
        g.arc(c.x, c.y, sc * (0.2 + pulse * 0.06), 0, TAU);
        g.stroke();
      }
    }

    if (P.ghost >= 0 && inSlice(L, P.ghost, P) && P.ghost !== s.pos) {
      const c = Pj(G.coord(L, P.ghost, 0), G.coord(L, P.ghost, 1));
      drawGhost(g, c.x, c.y, sc * 0.26, t);
    }

    if (P.showPlayer !== false && inSlice(L, s.pos, P)) {
      let pos = P.playerPos || xyz(L, s.pos);
      if (P.bump) {
        pos = pos.slice();
        pos[P.bump.axis] += P.bump.dir * P.bump.amt;
      }
      const c = Pj(pos[0], pos[1]);
      drawPlayer(g, c.x, c.y, sc * (mini ? 0.32 : 0.26) * (P.playerScale || 1), t, P.alpha * (P.playerAlpha === undefined ? 1 : P.playerAlpha), mini);
    }
    g.restore();
    return Pj;
  }

  /* ---------- Gizmo ---------- */

  function drawGizmo(g, cam, x, y, len, axes, flat) {
    const dirs = flat ? [[1, 0], [0, 1], [0, 0]] : axisScreen(cam);
    const order = [];
    for (let a = 0; a < Math.min(3, axes); a++) order.push(a);
    g.lineCap = 'round';
    g.font = `600 ${Math.round(len * 0.42)}px "Space Grotesk", system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const a of order) {
      const [dx, dy] = dirs[a];
      const m = Math.hypot(dx, dy);
      const col = HD.AXES[a].color;
      g.strokeStyle = rgba(col, m < 0.2 ? 0.35 : 0.9);
      g.lineWidth = 2.2;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + dx * len, y + dy * len);
      g.stroke();
      g.fillStyle = col;
      const lx = m < 0.2 ? x + len * 0.35 : x + (dx / m) * (len * m + len * 0.32);
      const ly = m < 0.2 ? y - len * 0.35 : y + (dy / m) * (len * m + len * 0.32);
      g.fillText(HD.AXES[a].name, lx, ly);
    }
    g.fillStyle = '#E8ECFF';
    g.beginPath();
    g.arc(x, y, 2, 0, TAU);
    g.fill();
  }

  /* ---------- Hit testing ---------- */

  // Which in-view move (if any) does a tap at (px, py) point to?
  function pick(Pj, L, s, px, py, flat, cands) {
    let best = null;
    let bestD = Infinity;
    const lim = Pj.scale * (flat ? 0.8 : 0.62);
    for (const c of cands) {
      const pos = xyz(L, c.cell);
      const q = Pj(pos[0], pos[1], pos[2]);
      const d = Math.hypot(q.x - px, q.y - py);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return bestD <= lim ? best : null;
  }

  HD.view = {
    COL, fit, draw3D, drawFlat, drawGizmo, axisScreen, pick, projector, flatProjector, inSlice, xyz, sizeOf,
    sprites: { drawPlayer, drawShard, drawKey, drawExit, drawKeyhole, drawGlow, roundRect },
  };
})(window.HD = window.HD || {});
