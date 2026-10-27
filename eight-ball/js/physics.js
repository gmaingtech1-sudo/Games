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

  // Each cushion is a polygon whose first edge is the playing face; the edges
  // either side of it are the jaws. The back edge is under the rail.
  const cushions = [
    [[C, 0], [W - C, 0], [W - C + J, -J], [C - J, -J]],
    [[W - C, L], [C, L], [C - J, L + J], [W - C + J, L + J]],
    [[0, H - M], [0, C], [-J, C - J], [-J, H - M + 6]],
    [[0, L - C], [0, H + M], [-J, H + M - 6], [-J, L - C + J]],
    [[W, C], [W, H - M], [W + J, H - M + 6], [W + J, C - J]],
    [[W, H + M], [W, L - C], [W + J, L - C + J], [W + J, H + M - 6]],
  ];
  const segs = [];
  for (const c of cushions) {
    for (const [a, b] of [[c[0], c[1]], [c[1], c[2]], [c[3], c[0]]]) {
      segs.push({ ax: a[0], ay: a[1], ex: b[0] - a[0], ey: b[1] - a[1], len2: (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2 });
    }
  }

  // Hole centres and sizes for drawing; (ax, ay) is where a player aims to pot.
  const pockets = [
    { x: -14, y: -14, r: 48, ax: 4, ay: 4 },
    { x: W + 14, y: -14, r: 48, ax: W - 4, ay: 4 },
    { x: -26, y: H, r: 44, ax: -10, ay: H, mid: true },
    { x: W + 26, y: H, r: 44, ax: W + 10, ay: H, mid: true },
    { x: -14, y: L + 14, r: 48, ax: 4, ay: L - 4 },
    { x: W + 14, y: L + 14, r: 48, ax: W - 4, ay: L - 4 },
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

  function ball(id, x, y) {
    return { id, x, y, vx: 0, vy: 0, on: true, follow: 0, side: 0, spun: false, pocket: -1 };
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
    const gap = D + 0.15;
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
      const jit = () => (Math.random() - 0.5) * 0.1;
      balls[id] = ball(id, W / 2 + (col - k / 2) * gap + jit(), apexY - k * dy + jit());
    }));
    return balls;
  }

  /* ---------- Simulation ---------- */

  const E_BALL = 0.95;           // ball-to-ball restitution
  const E_CUSH = 0.74;           // cushion restitution
  const CUSH_GRIP = 0.94;        // speed kept along a cushion
  const ROLL_A = 300;            // rolling resistance, mm/s²
  const ROLL_B = 0.42;           // plus a little in proportion to speed, 1/s
  const STOP = 6;
  const NATURAL = 2 / 7;         // follow a rolling ball carries
  const GRIP = 2.4;              // how fast the cloth turns slide into roll
  const DRAW = 0.62;             // how much follow / draw the cue ball keeps through a collision
  const SIDE = 0.4;              // how much side bends a cushion rebound
  const SINK = 12;               // a ball this far past the cushion line has dropped

  function events(sounds) {
    return { first: null, cushionAfter: false, cushionBalls: new Set(), potted: [], cue: false, sounds: sounds ? [] : null };
  }

  // Hit the cue ball. spin.x is side (+ = right), spin.y is follow (+) or draw (−).
  function strike(balls, dir, speed, spin) {
    const c = balls[0];
    c.vx = dir.x * speed;
    c.vy = dir.y * speed;
    c.follow = speed * spin.y * 0.9;
    c.side = spin.x;
    c.spun = true;
  }

  function moving(balls) {
    for (const b of balls) if (b.on && (b.vx || b.vy)) return true;
    return false;
  }

  // Step the table forward by dt seconds; returns whether anything is still moving.
  function advance(balls, dt, ev) {
    let vmax = 0;
    for (const b of balls) {
      if (!b.on) continue;
      const s = b.vx * b.vx + b.vy * b.vy;
      if (s > vmax) vmax = s;
    }
    if (!vmax) return false;
    const n = Math.min(90, Math.max(1, Math.ceil(Math.sqrt(vmax) * dt / 3.5)));
    const h = dt / n;
    const grip = 1 - Math.exp(-GRIP * h);
    for (let i = 0; i < n; i++) substep(balls, h, grip, ev);
    return moving(balls);
  }

  // Run a shot to the end (the computer uses this to try shots out).
  function simulate(balls, ev, maxT = 30) {
    for (let t = 0; t < maxT; t += 1 / 60) if (!advance(balls, 1 / 60, ev)) break;
  }

  function substep(balls, h, grip, ev) {
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
        if (b.x < -SINK || b.x > W + SINK || b.y < -SINK || b.y > L + SINK) {
          sink(b, ev);
          continue;
        }
      }
      roll(b, h, grip);
      // A ball that comes to rest with its centre past the cushion line hangs
      // over the hole, so it drops.
      if (!b.vx && !b.vy && (b.x < 0 || b.x > W || b.y < 0 || b.y > L)) sink(b, ev);
    }
  }

  function collide(a, b, nx, ny, rel, ev) {
    // The cue ball (always `a`, as it has the lowest id) carries its spin through.
    let ux = 0;
    let uy = 0;
    if (a.spun) {
      const s = Math.hypot(a.vx, a.vy) || 1;
      ux = a.vx / s;
      uy = a.vy / s;
    }
    const j = rel * (1 + E_BALL) / 2;
    a.vx -= nx * j; a.vy -= ny * j;
    b.vx += nx * j; b.vy += ny * j;
    if (a.spun) {
      const k = Math.abs(ux * nx + uy * ny) * a.follow * DRAW;
      a.vx += ux * k;
      a.vy += uy * k;
      a.spun = false;
      a.follow = 0;
    }
    if (ev) {
      if (ev.first === null && a.id === 0) ev.first = b.id;
      if (ev.sounds) ev.sounds.push({ t: 'ball', v: rel });
    }
  }

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
      const sp = Math.hypot(b.vx, b.vy);
      const tx = -ny;
      const ty = nx;
      let vt = (b.vx * tx + b.vy * ty) * CUSH_GRIP;
      if (b.side) {
        // Side spin kicks the ball off towards the side it was struck on.
        const rx = -b.vy / sp;
        const ry = b.vx / sp;
        vt += (rx * tx + ry * ty) * b.side * SIDE * -vn;
        b.side *= 0.45;
      }
      const e = E_CUSH - Math.min(0.1, -vn / 40000);
      b.vx = tx * vt - nx * vn * e;
      b.vy = ty * vt - ny * vn * e;
      if (b.spun) b.follow *= 0.3;
      if (ev) {
        if (b.id !== 0) ev.cushionBalls.add(b.id);
        if (ev.first !== null) ev.cushionAfter = true;
        if (ev.sounds) ev.sounds.push({ t: 'cushion', v: -vn });
      }
    }
  }

  function sink(b, ev) {
    let best = 0;
    let bd = Infinity;
    pockets.forEach((p, i) => {
      const d = (p.x - b.x) ** 2 + (p.y - b.y) ** 2;
      if (d < bd) { bd = d; best = i; }
    });
    if (ev && ev.sounds) ev.sounds.push({ t: 'pocket', v: Math.hypot(b.vx, b.vy), id: b.id, x: b.x, y: b.y, pocket: best });
    b.on = false;
    b.vx = b.vy = 0;
    b.pocket = best;
    if (ev) {
      ev.potted.push(b.id);
      if (b.id === 0) ev.cue = true;
    }
  }

  function roll(b, h, grip) {
    const s = Math.hypot(b.vx, b.vy);
    if (!s) return;
    if (b.spun) b.follow += (NATURAL * s - b.follow) * grip;
    const ns = s - (ROLL_A + ROLL_B * s) * h;
    if (ns < STOP) {
      b.vx = b.vy = 0;
      b.follow = 0;
      b.spun = false;
      return;
    }
    b.vx *= ns / s;
    b.vy *= ns / s;
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
