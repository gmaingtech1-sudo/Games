/* Eight-Ball — the table and the ball physics. Everything is in millimetres
   and seconds. The table lies long-ways: x runs across it (0..W), y runs
   down it (0..L), and the baulk end is the bottom cushion (y = L). */
(function (EB) {
  'use strict';

  /* ---------- The table ---------- */

  const W = 890;                 // a 7 ft pub table's playing surface
  const L = 1780;
  const R = 25.4;                // 2" balls
  const D = 2 * R;
  const D2 = D * D;
  const H = L / 2;
  const C = 64;                  // corner pockets: cushion noses this far from the corner
  const M = 46;                  // middle pockets: half the mouth
  const J = 36;                  // how far the jaws run back into a pocket

  // Each cushion starts as a polygon whose first edge is the playing face;
  // the edges either side of it are the jaws, and the back edge is under
  // the rail. The noses where face meets jaw are rounded, as on a real
  // table, and the same shape is used for drawing and for bounces.
  const RAW = [
    [[C, 0], [W - C, 0], [W - C + J, -J], [C - J, -J]],
    [[W - C, L], [C, L], [C - J, L + J], [W - C + J, L + J]],
    [[0, H - M], [0, C], [-J, C - J], [-J, H - M + 6]],
    [[0, L - C], [0, H + M], [-J, H + M - 6], [-J, L - C + J]],
    [[W, C], [W, H - M], [W + J, H - M + 6], [W + J, C - J]],
    [[W, H + M], [W, L - C], [W + J, L - C + J], [W + J, H + M - 6]],
  ];
  const NOSE_CORNER = 9;
  const NOSE_MIDDLE = 13;

  // Points along a rounded corner at p, between the edges to prev and next.
  function fillet(prev, p, next, r) {
    let ax = prev[0] - p[0];
    let ay = prev[1] - p[1];
    let bx = next[0] - p[0];
    let by = next[1] - p[1];
    const la = Math.hypot(ax, ay);
    const lb = Math.hypot(bx, by);
    ax /= la; ay /= la; bx /= lb; by /= lb;
    const theta = Math.acos(Math.max(-1, Math.min(1, ax * bx + ay * by)));
    const t = r / Math.tan(theta / 2);
    let hx = ax + bx;
    let hy = ay + by;
    const hl = Math.hypot(hx, hy);
    hx /= hl; hy /= hl;
    const cd = r / Math.sin(theta / 2);
    const cx = p[0] + hx * cd;
    const cy = p[1] + hy * cd;
    let a1 = Math.atan2(p[1] + ay * t - cy, p[0] + ax * t - cx);
    let a2 = Math.atan2(p[1] + by * t - cy, p[0] + bx * t - cx);
    let da = a2 - a1;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    const out = [];
    const n = 6;
    for (let i = 0; i <= n; i++) {
      const ang = a1 + (da * i) / n;
      out.push([cx + Math.cos(ang) * r, cy + Math.sin(ang) * r]);
    }
    return out;
  }

  const noseR = (p) => ((p[0] === 0 || p[0] === W) && Math.abs(p[1] - H) < 100 ? NOSE_MIDDLE : NOSE_CORNER);
  const cushions = RAW.map(([p0, p1, p2, p3]) => {
    const n0 = fillet(p3, p0, p1, noseR(p0));
    const n1 = fillet(p0, p1, p2, noseR(p1));
    return { pts: [...n0, ...n1, p2, p3], face: [n0[n0.length - 1], n1[0]], back: [p2, p3] };
  });
  const segs = [];
  for (const cu of cushions) {
    const pts = cu.pts;
    const pairs = [];
    for (let i = 0; i < pts.length - 2; i++) pairs.push([pts[i], pts[i + 1]]);
    pairs.push([pts[pts.length - 1], pts[0]]);
    for (const [a, b] of pairs) {
      segs.push({ ax: a[0], ay: a[1], ex: b[0] - a[0], ey: b[1] - a[1], len2: (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2 });
    }
  }

  // The pockets. (x, y, r) is the round hole through the rail. The slate is
  // cut back in a shallow arc from nose to nose (the drop: centre dx, dy,
  // radius dr), and a ball falls once its centre is over that edge.
  // (ax, ay) is where a player aims to pot.
  const corner = (sx, sy, x0, y0) => ({
    x: x0 + sx * 20, y: y0 + sy * 20, r: 54,
    dx: x0 + sx * 200, dy: y0 + sy * 200, dr: Math.hypot(C + 200, 200),
    ax: x0 - sx * 4, ay: y0 - sy * 4,
  });
  const middle = (sx, x0) => ({
    x: x0 + sx * 34, y: H, r: 44,
    dx: x0 + sx * 36, dy: H, dr: Math.hypot(36, M),
    ax: x0 + sx * 10, ay: H, mid: true,
  });
  const pockets = [
    corner(-1, -1, 0, 0), corner(1, -1, W, 0),
    middle(-1, 0), middle(1, W),
    corner(-1, 1, 0, L), corner(1, 1, W, L),
  ];

  const TABLE = {
    W, L, R, D, H, C, M, J,
    BAULK: L - L / 5,            // the baulk line
    SPOT: { x: W / 2, y: L / 4 },
    cushions, pockets,
  };

  // 0 is the cue ball, 1–7 reds, 8 the eight-ball, 9–15 yellows.
  const kind = (id) => (id === 0 ? 'cue' : id === 8 ? 'black' : id < 8 ? 'red' : 'yellow');

  /* ---------- Balls ---------- */

  // Each ball carries its velocity (mm/s) and its spin, ω (rad/s). Axes:
  // x across the table, y down it, z down into the cloth, so the ball touches
  // the cloth at (0, 0, R) from its centre. q is the ball's orientation, used
  // only to draw it rolling.
  function ball(id, x, y) {
    return { id, x, y, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0, on: true, pocket: -1, q: randomQuat() };
  }

  function randomQuat() {
    const u = Math.random();
    const a = Math.random() * Math.PI * 2;
    const b = Math.random() * Math.PI * 2;
    const s1 = Math.sqrt(1 - u);
    const s2 = Math.sqrt(u);
    return [s1 * Math.sin(a), s1 * Math.cos(a), s2 * Math.sin(b), s2 * Math.cos(b)];
  }

  function clone(balls) {
    return balls.map((b) => ({ ...b }));
  }

  // A fresh rack: the eight-ball on the spot, the apex towards baulk, and the
  // cue ball in baulk. The pattern is mirrored and recoloured at random.
  function rack() {
    const rows = [['R'], ['Y', 'R'], ['R', '8', 'Y'], ['Y', 'R', 'Y', 'R'], ['R', 'Y', 'Y', 'R', 'Y']];
    const flip = Math.random() < 0.5;
    const swap = Math.random() < 0.5;
    const gap = D + 0.05;
    const dy = gap * Math.sqrt(3) / 2;
    const apexY = TABLE.SPOT.y + 2 * dy;
    const balls = [];
    balls[0] = ball(0, W / 2, TABLE.BAULK + 90);
    let red = 1;
    let yel = 9;
    rows.forEach((row, k) => row.forEach((c, j) => {
      const col = flip ? k - j : j;
      const t = c === '8' ? '8' : swap ? (c === 'R' ? 'Y' : 'R') : c;
      const id = t === '8' ? 8 : t === 'R' ? red++ : yel++;
      const jit = () => (Math.random() - 0.5) * 0.04;
      balls[id] = ball(id, W / 2 + (col - k / 2) * gap + jit(), apexY - k * dy + jit());
    }));
    return balls;
  }

  /* ---------- Simulation ---------- */

  // Real-world figures for pool balls on a napped cloth.
  const G = 9810;                // gravity, mm/s²
  const MU_SLIDE = 0.2;          // cloth friction while a ball skids
  const MU_ROLL = 0.014;         // rolling resistance
  const SPIN_DECAY = 11;         // how fast side spin dies away, rad/s²
  const E_BALL = 0.94;           // ball-to-ball restitution
  const MU_BALL = 0.06;          // ball-to-ball friction: throw and spin transfer
  const MU_CUSH = 0.2;           // cushion friction
  const NOSE = 0.27;             // cushion nose height above the ball's centre, × R
  const NOSE_C = Math.sqrt(1 - NOSE * NOSE);
  const TIP = 0.55;              // furthest the tip can strike from centre without a miscue, × R
  const SQUIRT = 0.03;           // how far side pushes the cue ball off line, radians at full side
  const STOP = 5;                // mm/s
  const SLIP = 2;                // mm/s of skid that counts as rolling
  const SINK = 12;               // a ball this far past the cushion line has dropped

  function events(sounds) {
    return { first: null, cushionAfter: false, cushionBalls: new Set(), potted: [], cue: false, sounds: sounds ? [] : null };
  }

  // Strike the cue ball. spin.x is where the tip lands left (−) or right (+)
  // of centre, spin.y below (−, draw) or above (+, follow), both as a share of
  // the most you can use; 0.8 of each reach is the edge of the spin control.
  function strike(balls, dir, speed, spin) {
    const c = balls[0];
    const a = spin.x * TIP;
    const b = spin.y * TIP;
    // Side pushes the cue ball a touch off line, away from the side struck.
    const ang = Math.atan2(dir.y, dir.x) - a * SQUIRT / TIP;
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);
    c.vx = dx * speed;
    c.vy = dy * speed;
    // ω = r × J / I: topspin about the axis across the line of the shot,
    // side about the vertical.
    const k = 2.5 * speed / R;
    c.wx = k * b * dy;
    c.wy = -k * b * dx;
    c.wz = -k * a;
  }

  // Skid speed of the ball's contact point over the cloth.
  const slipX = (b) => b.vx + R * b.wy;
  const slipY = (b) => b.vy - R * b.wx;

  function moving(balls) {
    for (const b of balls) {
      if (!b.on) continue;
      if (b.vx || b.vy) return true;
      if (Math.abs(slipX(b)) > SLIP || Math.abs(slipY(b)) > SLIP) return true;
    }
    return false;
  }

  // Step the table forward by dt seconds; returns whether anything is still
  // moving. With `turn`, balls' orientations are updated so they can be drawn rolling.
  function advance(balls, dt, ev, turn) {
    let vmax = 0;
    for (const b of balls) {
      if (!b.on) continue;
      const s = Math.max(b.vx * b.vx + b.vy * b.vy, slipX(b) ** 2 + slipY(b) ** 2);
      if (s > vmax) vmax = s;
    }
    if (vmax < 1) return moving(balls);
    const n = Math.min(120, Math.max(1, Math.ceil(Math.sqrt(vmax) * dt / 3)));
    const h = dt / n;
    for (let i = 0; i < n; i++) substep(balls, h, ev, turn);
    return moving(balls);
  }

  // Run a shot to the end (the computer uses this to try shots out).
  function simulate(balls, ev, maxT = 30) {
    for (let t = 0; t < maxT; t += 1 / 30) if (!advance(balls, 1 / 30, ev, false)) break;
  }

  function substep(balls, h, ev, turn) {
    for (const b of balls) {
      if (b.on && (b.vx || b.vy)) {
        b.x += b.vx * h;
        b.y += b.vy * h;
      }
    }
    // Two passes so a hit carries through a pack of touching balls.
    for (let pass = 0; pass < 2; pass++) {
      let hit = false;
      for (let i = 0; i < balls.length; i++) {
        const a = balls[i];
        if (!a.on) continue;
        for (let j = i + 1; j < balls.length; j++) {
          const b = balls[j];
          if (!b.on) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          if (dx > D || dx < -D || dy > D || dy < -D) continue;
          const d2 = dx * dx + dy * dy;
          if (d2 >= D2 || d2 === 0) continue;
          const d = Math.sqrt(d2);
          const nx = dx / d;
          const ny = dy / d;
          const o = (D - d) / 2;
          a.x -= nx * o; a.y -= ny * o;
          b.x += nx * o; b.y += ny * o;
          const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
          if (rel <= 0) continue;
          hit = true;
          collide(a, b, nx, ny, rel, ev);
        }
      }
      if (!hit) break;
    }
    for (const b of balls) {
      if (!b.on) continue;
      if (b.x < R + 1 || b.x > W - R - 1 || b.y < R + 1 || b.y > L - R - 1) {
        cushion(b, ev);
        if (b.x < -SINK || b.x > W + SINK || b.y < -SINK || b.y > L + SINK || overHole(b)) {
          sink(b, ev);
          continue;
        }
      }
      cloth(b, h);
      if (turn) rotate(b, h);
      // A ball that comes to rest with its centre past the cushion line hangs
      // over the hole, so it drops.
      if (!b.vx && !b.vy && (b.x < 0 || b.x > W || b.y < 0 || b.y > L)) sink(b, ev);
    }
  }

  // Two balls meet. Besides the push along the line of centres, friction
  // between them "throws" the object ball off the cut line and passes spin on.
  function collide(a, b, nx, ny, rel, ev) {
    const jn = rel * (1 + E_BALL) / 2;
    // Contact-point velocities: v + ω × r, with r = R·n on a and −R·n on b.
    const cx = (a.vx - R * a.wz * ny) - (b.vx + R * b.wz * ny);
    const cy = (a.vy + R * a.wz * nx) - (b.vy - R * b.wz * nx);
    const cz = R * (a.wx * ny - a.wy * nx) + R * (b.wx * ny - b.wy * nx);
    const cn = cx * nx + cy * ny;
    const tx = cx - cn * nx;
    const ty = cy - cn * ny;
    const tz = cz;
    a.vx -= nx * jn; a.vy -= ny * jn;
    b.vx += nx * jn; b.vy += ny * jn;
    const ts = Math.sqrt(tx * tx + ty * ty + tz * tz);
    if (ts > 1e-6) {
      const jt = Math.min(MU_BALL * jn, ts / 7);
      const ux = tx / ts;
      const uy = ty / ts;
      const uz = tz / ts;
      a.vx -= jt * ux; a.vy -= jt * uy;
      b.vx += jt * ux; b.vy += jt * uy;
      // Both balls pick up the same Δω = −(5 jt / 2R)(n × u).
      const k = -2.5 * jt / R;
      const ox = k * (ny * uz);
      const oy = k * (-nx * uz);
      const oz = k * (nx * uy - ny * ux);
      a.wx += ox; a.wy += oy; a.wz += oz;
      b.wx += ox; b.wy += oy; b.wz += oz;
    }
    if (ev) {
      if (ev.first === null && a.id === 0) ev.first = b.id;
      if (ev.sounds) ev.sounds.push({ t: 'ball', v: rel });
    }
  }

  // A cushion catches the ball a little above its equator, so the rebound
  // depends on the ball's spin: side bends it, and running and check side
  // speed it up or kill it.
  function cushion(b, ev) {
    for (const s of segs) {
      let t = ((b.x - s.ax) * s.ex + (b.y - s.ay) * s.ey) / s.len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = s.ax + s.ex * t;
      const qy = s.ay + s.ey * t;
      const dx = b.x - qx;
      const dy = b.y - qy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= R * R || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const ny = dy / d;
      b.x = qx + nx * R;
      b.y = qy + ny * R;
      const vn = b.vx * nx + b.vy * ny;
      if (vn >= 0) continue;
      const e = 0.84 - Math.min(0.14, -vn / 45000);
      const jn = -(1 + e) * vn;
      // Contact point, from the centre: towards the cushion and up.
      const rx = -nx * R * NOSE_C;
      const ry = -ny * R * NOSE_C;
      const rz = -R * NOSE;
      // Its velocity, v + ω × r, less the part along the normal.
      const cx = b.vx + (b.wy * rz - b.wz * ry);
      const cy = b.vy + (b.wz * rx - b.wx * rz);
      const cz = b.wx * ry - b.wy * rx;
      const cn = cx * nx + cy * ny;
      const tx = cx - cn * nx;
      const ty = cy - cn * ny;
      const tz = cz;
      const ts = Math.sqrt(tx * tx + ty * ty + tz * tz);
      let px = nx * jn;
      let py = ny * jn;
      let pz = 0;
      if (ts > 1e-6) {
        const jt = Math.min(MU_CUSH * jn, ts / 3.5);
        px -= jt * tx / ts;
        py -= jt * ty / ts;
        pz -= jt * tz / ts;
      }
      b.vx += px;
      b.vy += py;
      // Δω = (r × P) · 5 / 2R²
      const k = 2.5 / (R * R);
      b.wx += k * (ry * pz - rz * py);
      b.wy += k * (rz * px - rx * pz);
      b.wz += k * (rx * py - ry * px);
      if (ev) {
        if (b.id !== 0) ev.cushionBalls.add(b.id);
        if (ev.first !== null) ev.cushionAfter = true;
        if (ev.sounds) ev.sounds.push({ t: 'cushion', v: -vn });
      }
    }
  }

  function overHole(b) {
    for (const p of pockets) if ((b.x - p.dx) ** 2 + (b.y - p.dy) ** 2 < p.dr * p.dr) return true;
    return false;
  }

  function sink(b, ev) {
    let best = 0;
    let bd = Infinity;
    pockets.forEach((p, i) => {
      const d = (p.x - b.x) ** 2 + (p.y - b.y) ** 2;
      if (d < bd) { bd = d; best = i; }
    });
    if (ev && ev.sounds) ev.sounds.push({ t: 'pocket', v: Math.hypot(b.vx, b.vy), id: b.id, x: b.x, y: b.y, vx: b.vx, vy: b.vy, pocket: best });
    b.on = false;
    b.vx = b.vy = b.wx = b.wy = b.wz = 0;
    b.pocket = best;
    if (ev) {
      ev.potted.push(b.id);
      if (b.id === 0) ev.cue = true;
    }
  }

  // The cloth: a skidding ball is dragged by sliding friction until it rolls
  // (losing 2/7 of its skid), then only rolling resistance slows it.
  function cloth(b, h) {
    const ux = slipX(b);
    const uy = slipY(b);
    const us = Math.sqrt(ux * ux + uy * uy);
    if (us > SLIP) {
      const a = MU_SLIDE * G * h;
      if (us <= 3.5 * a) {
        b.vx -= ux * 2 / 7;
        b.vy -= uy * 2 / 7;
        b.wx = b.vy / R;
        b.wy = -b.vx / R;
      } else {
        const ex = ux / us;
        const ey = uy / us;
        b.vx -= a * ex;
        b.vy -= a * ey;
        b.wx += 2.5 * a * ey / R;
        b.wy -= 2.5 * a * ex / R;
      }
    } else {
      const s = Math.hypot(b.vx, b.vy);
      if (s) {
        const ns = s - MU_ROLL * G * h;
        if (ns < STOP) {
          b.vx = b.vy = b.wx = b.wy = b.wz = 0;
          return;
        }
        b.vx *= ns / s;
        b.vy *= ns / s;
      }
      b.wx = b.vy / R;
      b.wy = -b.vx / R;
    }
    if (b.wz) {
      const d = SPIN_DECAY * h;
      b.wz = Math.abs(b.wz) <= d ? 0 : b.wz - Math.sign(b.wz) * d;
    }
  }

  // Turn the ball by ω·h (for drawing). q is [w, x, y, z].
  function rotate(b, h) {
    const w = Math.sqrt(b.wx * b.wx + b.wy * b.wy + b.wz * b.wz);
    if (w < 1e-6) return;
    const half = w * h / 2;
    const s = Math.sin(half) / w;
    const dw = Math.cos(half);
    const dx = b.wx * s;
    const dy = b.wy * s;
    const dz = b.wz * s;
    const [qw, qx, qy, qz] = b.q;
    const nw = dw * qw - dx * qx - dy * qy - dz * qz;
    const nx = dw * qx + dx * qw + dy * qz - dz * qy;
    const ny = dw * qy - dx * qz + dy * qw + dz * qx;
    const nz = dw * qz + dx * qy - dy * qx + dz * qw;
    const m = Math.sqrt(nw * nw + nx * nx + ny * ny + nz * nz);
    b.q = [nw / m, nx / m, ny / m, nz / m];
  }

  /* ---------- Sight lines ---------- */

  // How far a ball sent from (ox, oy) along the unit vector (dx, dy) travels
  // before it touches ball b; Infinity if it misses.
  function sweep(ox, oy, dx, dy, b) {
    const fx = ox - b.x;
    const fy = oy - b.y;
    const bd = fx * dx + fy * dy;
    const c = fx * fx + fy * fy - D2;
    const disc = bd * bd - c;
    if (disc < 0) return Infinity;
    const t = -bd - Math.sqrt(disc);
    if (t < -1) return Infinity;
    return t < 0 ? 0 : t;
  }

  // The first ball a ball sent along (dx, dy) would hit. `skip(b)` lets balls through.
  function firstHit(balls, ox, oy, dx, dy, skip) {
    let best = null;
    let bt = Infinity;
    for (const b of balls) {
      if (!b.on || (skip && skip(b))) continue;
      const t = sweep(ox, oy, dx, dy, b);
      if (t < bt) { bt = t; best = b; }
    }
    return best ? { b: best, t: bt } : null;
  }

  // How far the cue ball can travel along (dx, dy) before it meets a cushion.
  function wallDist(x, y, dx, dy) {
    let t = Infinity;
    if (dx > 0) t = Math.min(t, (W - R - x) / dx);
    if (dx < 0) t = Math.min(t, (R - x) / dx);
    if (dy > 0) t = Math.min(t, (L - R - y) / dy);
    if (dy < 0) t = Math.min(t, (R - y) / dy);
    return Math.max(0, t);
  }

  // For each k in ks (−1 = finest cut on one side, 1 = the other), can the cue
  // ball reach `target` in a straight line? Balls for which pass(b) is true
  // don't block.
  function sightLines(balls, target, pass, ks) {
    const c = balls[0];
    const dx = target.x - c.x;
    const dy = target.y - c.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= D + 0.8) return ks.map(() => true);
    const base = Math.atan2(dy, dx);
    const a = Math.asin(Math.min(1, D / dist));
    return ks.map((k) => {
      const ang = base + a * k;
      const h = firstHit(balls, c.x, c.y, Math.cos(ang), Math.sin(ang), (b) => b.id === 0 || (b !== target && pass(b)));
      return !!h && h.b === target;
    });
  }

  const touching = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 < (D + 0.8) ** 2;

  EB.TABLE = TABLE;
  EB.kind = kind;
  EB.phys = {
    ball, clone, rack, events, strike, advance, simulate, moving,
    firstHit, wallDist, sightLines, touching,
  };
})(window.EB = window.EB || {});
