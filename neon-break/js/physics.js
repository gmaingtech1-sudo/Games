// Neon Break: table geometry and ball physics.
// Everything here is deterministic (fixed time step), so the CPU player can
// run the exact same simulation ahead of time to judge its shots.
'use strict';
var NB = window.NB || (window.NB = {});

(function () {
  var W = 500, H = 1000, R = 12;
  var DT = 1 / 180;               // fixed physics step
  var ROLL_DECEL = 135;           // constant rolling resistance (units/s^2)
  var DRAG = 0.3;                 // speed-proportional slowdown (1/s)
  var STOP = 4;                   // below this speed a ball stops
  var CUSHION_E = 0.76;           // cushion bounciness
  var BALL_E = 0.95;              // ball-ball bounciness
  var MAX_SPEED = 3300;

  var M = 34;                     // corner pocket mouth (distance along each rail)
  var S = 27;                     // half-width of a side pocket mouth

  // Cushion segments, including the angled pocket jaws.
  var segs = [];
  function seg(x1, y1, x2, y2) { segs.push([x1, y1, x2, y2]); }
  function mirror(fn) {
    // fn draws in the top-left quadrant; mirror it to all four.
    [[1, 1], [-1, 1], [1, -1], [-1, -1]].forEach(function (m) {
      fn(function (x1, y1, x2, y2) {
        var X = function (x) { return m[0] > 0 ? x : W - x; };
        var Y = function (y) { return m[1] > 0 ? y : H - y; };
        seg(X(x1), Y(y1), X(x2), Y(y2));
      });
    });
  }
  mirror(function (s) {
    s(M, 0, W / 2, 0);                     // half of the short rail
    s(0, M, 0, H / 2 - S);                 // long rail down to the side pocket
    s(M, 0, M - 13, -20);                  // corner jaw on the short rail
    s(0, M, -20, M - 13);                  // corner jaw on the long rail
    s(0, H / 2 - S, -18, H / 2 - S + 6);   // side pocket jaw
  });

  var pockets = [
    { x: -6, y: -6, r: 23 }, { x: W + 6, y: -6, r: 23 },
    { x: -14, y: H / 2, r: 21 }, { x: W + 14, y: H / 2, r: 21 },
    { x: -6, y: H + 6, r: 23 }, { x: W + 6, y: H + 6, r: 23 }
  ];
  // Where the CPU aims for each pocket (just inside the mouth).
  var aimPoints = [
    { x: 7, y: 7 }, { x: W - 7, y: 7 }, { x: -4, y: H / 2 }, { x: W + 4, y: H / 2 },
    { x: 7, y: H - 7 }, { x: W - 7, y: H - 7 }
  ];

  var HEAD_Y = H * 0.75;          // the "kitchen" is below this line
  var FOOT = { x: W / 2, y: H * 0.25 };

  function makeBall(n, x, y) {
    return { n: n, x: x, y: y, vx: 0, vy: 0, on: true, moving: false, rot: null, sunkAt: -1 };
  }

  // A standard 8-ball rack: 8 in the middle, a solid and a stripe in the back corners.
  function rack8(rand) {
    var solids = [1, 2, 3, 4, 5, 6, 7], stripes = [9, 10, 11, 12, 13, 14, 15];
    shuffle(solids, rand); shuffle(stripes, rand);
    var order = new Array(15);
    order[4] = 8;
    var corners = rand() < 0.5 ? [solids.pop(), stripes.pop()] : [stripes.pop(), solids.pop()];
    order[10] = corners[0]; order[14] = corners[1];
    var rest = solids.concat(stripes); shuffle(rest, rand);
    for (var i = 0; i < 15; i++) if (order[i] == null) order[i] = rest.pop();
    return rackPositions(order);
  }
  function rackRandom(rand) {
    var order = [];
    for (var i = 1; i <= 15; i++) order.push(i);
    shuffle(order, rand);
    return rackPositions(order);
  }
  function rackPositions(order) {
    var balls = [], k = 0, gap = R * 2 + 0.6;
    for (var row = 0; row < 5; row++) {
      for (var i = 0; i <= row; i++) {
        var x = FOOT.x + (i - row / 2) * gap;
        var y = FOOT.y - row * gap * Math.sqrt(3) / 2;
        balls.push(makeBall(order[k++], x, y));
      }
    }
    return balls;
  }
  function shuffle(a, rand) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function newState(objectBalls) {
    var cue = makeBall(0, W / 2, H * 0.8);
    return { balls: [cue].concat(objectBalls), time: 0 };
  }

  function cloneState(st) {
    var b = st.balls.map(function (o) {
      return { n: o.n, x: o.x, y: o.y, vx: o.vx, vy: o.vy, on: o.on, moving: o.moving, rot: null, sunkAt: o.sunkAt, spin: o.spin, side: o.side };
    });
    return { balls: b, time: st.time };
  }

  // Start a shot. power 0..1, spin -1 (draw) .. 1 (follow), side -1..1.
  function strike(st, angle, power, spin, side) {
    var cue = st.balls[0];
    var sp = 100 + (MAX_SPEED - 100) * (power * power * 0.55 + power * 0.45);
    cue.vx = Math.cos(angle) * sp;
    cue.vy = Math.sin(angle) * sp;
    cue.moving = true;
    cue.spin = spin || 0;
    cue.side = side || 0;
    return {
      first: -1,          // number of the first ball the cue ball touched
      sunk: [],           // numbers of balls pocketed, in order
      rails: 0,           // cushion hits by any ball after first contact
      cueRails: 0,
      contacts: []        // {kind, speed} for sounds (only when wanted)
    };
  }

  function anyMoving(st) {
    for (var i = 0; i < st.balls.length; i++) if (st.balls[i].on && st.balls[i].moving) return true;
    return false;
  }

  // Advance one fixed step. ev collects what happened during the shot.
  function step(st, ev, wantSounds) {
    var balls = st.balls, n = balls.length, i, b, maxSp = 0;
    st.time += DT;
    // Rolling friction once per step.
    for (i = 0; i < n; i++) {
      b = balls[i];
      if (!b.on || !b.moving) continue;
      var sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      var nsp = sp - (ROLL_DECEL + DRAG * sp) * DT;
      if (nsp <= STOP) { b.vx = 0; b.vy = 0; b.moving = false; continue; }
      var k = nsp / sp;
      b.vx *= k; b.vy *= k;
      if (nsp > maxSp) maxSp = nsp;
    }
    // Fast balls move in small pieces so they never sink deep into each other.
    var sub = Math.max(1, Math.ceil(maxSp * DT / (R * 0.3)));
    var h = DT / sub;
    for (var s = 0; s < sub; s++) {
      for (i = 0; i < n; i++) {
        b = balls[i];
        if (b.on && b.moving) { b.x += b.vx * h; b.y += b.vy * h; }
      }
      collideBalls(balls, ev, wantSounds);
      collideBalls(balls, ev, wantSounds);
      railsAndPockets(st, ev, wantSounds);
    }
  }

  function collideBalls(balls, ev, wantSounds) {
    var n = balls.length, i, j, b;
    for (i = 0; i < n; i++) {
      var a = balls[i];
      if (!a.on) continue;
      for (j = i + 1; j < n; j++) {
        b = balls[j];
        if (!b.on || (!a.moving && !b.moving)) continue;
        var dx = b.x - a.x, dy = b.y - a.y;
        if (dx > 2 * R || dx < -2 * R || dy > 2 * R || dy < -2 * R) continue;
        var d2 = dx * dx + dy * dy;
        if (d2 >= 4 * R * R || d2 === 0) continue;
        var d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
        var over = 2 * R - d;
        a.x -= nx * over / 2; a.y -= ny * over / 2;
        b.x += nx * over / 2; b.y += ny * over / 2;
        var rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (rel <= 0) continue;
        var cueInvolved = a.n === 0 ? a : null;
        if (cueInvolved && ev.first < 0) ev.first = b.n;
        var preSpeed = cueInvolved ? Math.sqrt(a.vx * a.vx + a.vy * a.vy) : 0;
        var preDirX = cueInvolved ? a.vx / (preSpeed || 1) : 0, preDirY = cueInvolved ? a.vy / (preSpeed || 1) : 0;
        var imp = rel * (1 + BALL_E) / 2;
        a.vx -= imp * nx; a.vy -= imp * ny;
        b.vx += imp * nx; b.vy += imp * ny;
        a.moving = true; b.moving = true;
        // Follow / draw: the cue ball's spin kicks in after its first hit.
        if (cueInvolved && a.spin) {
          var kick = a.spin * preSpeed * (a.spin > 0 ? 0.42 : 0.62) * Math.min(1, rel / (preSpeed || 1) + 0.25);
          a.vx += preDirX * kick; a.vy += preDirY * kick;
          a.spin *= 0.15;
        }
        if (wantSounds && rel > 20) ev.contacts.push({ kind: 'ball', speed: rel, x: a.x, y: a.y });
      }
    }
  }

  function railsAndPockets(st, ev, wantSounds) {
    var balls = st.balls, n = balls.length, i, j, b;
    for (i = 0; i < n; i++) {
      b = balls[i];
      if (!b.on || !b.moving) continue;
      if (b.x < R + 2 || b.x > W - R - 2 || b.y < R + 2 || b.y > H - R - 2) {
        for (j = 0; j < segs.length; j++) collideSeg(b, segs[j], ev, wantSounds);
      }
      for (j = 0; j < pockets.length; j++) {
        var p = pockets[j], px = b.x - p.x, py = b.y - p.y;
        if (px * px + py * py < p.r * p.r) { sink(st, b, ev, j, wantSounds); break; }
      }
      // Anything that slips past the cushion line is in a pocket.
      if (b.on && (b.x < -R * 0.9 || b.x > W + R * 0.9 || b.y < -R * 0.9 || b.y > H + R * 0.9)) {
        sink(st, b, ev, nearestPocket(b.x, b.y), wantSounds);
      }
    }
  }

  function nearestPocket(x, y) {
    var best = 0, bd = 1e9;
    for (var j = 0; j < pockets.length; j++) {
      var dx = x - pockets[j].x, dy = y - pockets[j].y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = j; }
    }
    return best;
  }

  function sink(st, b, ev, pocketIndex, wantSounds) {
    b.on = false; b.moving = false; b.vx = 0; b.vy = 0; b.sunkAt = st.time;
    ev.sunk.push(b.n);
    if (wantSounds) ev.contacts.push({ kind: 'pocket', speed: 0, n: b.n, pocket: pocketIndex });
  }

  function collideSeg(b, s, ev, wantSounds) {
    var x1 = s[0], y1 = s[1], ex = s[2] - x1, ey = s[3] - y1;
    var len2 = ex * ex + ey * ey;
    var t = ((b.x - x1) * ex + (b.y - y1) * ey) / len2;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    var cx = x1 + ex * t, cy = y1 + ey * t;
    var dx = b.x - cx, dy = b.y - cy, d2 = dx * dx + dy * dy;
    if (d2 >= R * R || d2 === 0) return;
    var d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
    b.x = cx + nx * R; b.y = cy + ny * R;
    var vn = b.vx * nx + b.vy * ny;
    if (vn >= 0) return;
    b.vx -= (1 + CUSHION_E) * vn * nx;
    b.vy -= (1 + CUSHION_E) * vn * ny;
    // Side spin bends the rebound, then wears off.
    if (b.n === 0 && b.side) {
      var ang = b.side * 0.32 * Math.min(1, -vn / 900);
      var c = Math.cos(ang), sn = Math.sin(ang), vx = b.vx;
      b.vx = vx * c - b.vy * sn; b.vy = vx * sn + b.vy * c;
      b.side *= 0.45;
    }
    if (ev.first >= 0) ev.rails++;
    if (b.n === 0) ev.cueRails++;
    if (wantSounds) ev.contacts.push({ kind: 'rail', speed: -vn, x: b.x, y: b.y });
  }

  // Run a whole shot to the end (used by the CPU). Caps at 20 s of table time.
  function simulate(st, angle, power, spin, side) {
    var ev = strike(st, angle, power, spin, side);
    var steps = 0;
    while (anyMoving(st) && steps < 4800) { step(st, ev, false); steps++; }
    return ev;
  }

  // Is the cue ball position free and inside the allowed area?
  function canPlace(st, x, y, kitchenOnly) {
    if (x < R || x > W - R || y < R || y > H - R) return false;
    if (kitchenOnly && y < HEAD_Y + R * 0.2) return false;
    for (var i = 1; i < st.balls.length; i++) {
      var b = st.balls[i];
      if (!b.on) continue;
      var dx = b.x - x, dy = b.y - y;
      if (dx * dx + dy * dy < 4 * R * R + 1) return false;
    }
    return true;
  }

  // Put a ball back on (or near) a spot, avoiding the others.
  function spotBall(st, ball, x, y) {
    for (var k = 0; k < 400; k++) {
      var tx = x, ty = y + k * 2;
      if (ty > H - R) ty = y - (k * 2 - (H - R - y));
      var ok = tx >= R && tx <= W - R && ty >= R && ty <= H - R;
      for (var i = 0; ok && i < st.balls.length; i++) {
        var b = st.balls[i];
        if (b === ball || !b.on) continue;
        var dx = b.x - tx, dy = b.y - ty;
        if (dx * dx + dy * dy < 4 * R * R + 1) ok = false;
      }
      if (ok) { ball.x = tx; ball.y = ty; ball.on = true; ball.vx = ball.vy = 0; ball.moving = false; return; }
    }
  }

  // Cast a ray from the cue ball: what does it hit first? Used by the aim guide.
  function aimRay(st, angle) {
    var cue = st.balls[0], dx = Math.cos(angle), dy = Math.sin(angle);
    var best = 1e9, hitBall = null;
    for (var i = 1; i < st.balls.length; i++) {
      var b = st.balls[i];
      if (!b.on) continue;
      var t = rayCircle(cue.x, cue.y, dx, dy, b.x, b.y, 2 * R);
      if (t !== null && t < best) { best = t; hitBall = b; }
    }
    // Cushions: shrink the table by R and intersect with its edges.
    var tw = rayBox(cue.x, cue.y, dx, dy);
    if (tw < best) { best = tw; hitBall = null; }
    var gx = cue.x + dx * best, gy = cue.y + dy * best;
    var res = { x: gx, y: gy, ball: hitBall, dist: best };
    if (hitBall) {
      var nx = hitBall.x - gx, ny = hitBall.y - gy, nl = Math.sqrt(nx * nx + ny * ny) || 1;
      nx /= nl; ny /= nl;
      res.objDir = { x: nx, y: ny };
      var dot = dx * nx + dy * ny;
      var tx = dx - dot * nx, ty = dy - dot * ny, tl = Math.sqrt(tx * tx + ty * ty);
      res.cueDir = tl > 1e-4 ? { x: tx / tl, y: ty / tl } : null;
      res.cut = dot; // 1 = full ball, 0 = thin
    } else {
      // Bounce direction off the cushion.
      var bx = dx, by = dy;
      if (Math.abs(gx - R) < 0.5 || Math.abs(gx - (W - R)) < 0.5) bx = -bx;
      if (Math.abs(gy - R) < 0.5 || Math.abs(gy - (H - R)) < 0.5) by = -by;
      res.bounce = { x: bx, y: by };
    }
    return res;
  }
  function rayCircle(ox, oy, dx, dy, cx, cy, r) {
    var fx = ox - cx, fy = oy - cy;
    var b = fx * dx + fy * dy, c = fx * fx + fy * fy - r * r;
    var disc = b * b - c;
    if (disc < 0) return null;
    var t = -b - Math.sqrt(disc);
    return t > 0 ? t : null;
  }
  function rayBox(ox, oy, dx, dy) {
    var t = 1e9;
    if (dx > 1e-9) t = Math.min(t, (W - R - ox) / dx);
    if (dx < -1e-9) t = Math.min(t, (R - ox) / dx);
    if (dy > 1e-9) t = Math.min(t, (H - R - oy) / dy);
    if (dy < -1e-9) t = Math.min(t, (R - oy) / dy);
    return Math.max(0, t);
  }

  // Is the straight path from (x1,y1) to (x2,y2) clear for a ball? (ignores listed balls)
  function pathClear(st, x1, y1, x2, y2, ignoreA, ignoreB) {
    var dx = x2 - x1, dy = y2 - y1, len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) return true;
    dx /= len; dy /= len;
    for (var i = 0; i < st.balls.length; i++) {
      var b = st.balls[i];
      if (!b.on || b === ignoreA || b === ignoreB) continue;
      var px = b.x - x1, py = b.y - y1, t = px * dx + py * dy;
      if (t < 0 || t > len) continue;
      var ox = px - dx * t, oy = py - dy * t;
      if (ox * ox + oy * oy < 4 * R * R * 0.96) return false;
    }
    return true;
  }

  NB.phys = {
    W: W, H: H, R: R, DT: DT, M: M, S: S, HEAD_Y: HEAD_Y, FOOT: FOOT,
    segs: segs, pockets: pockets, aimPoints: aimPoints,
    rack8: rack8, rackRandom: rackRandom, newState: newState, cloneState: cloneState,
    strike: strike, step: step, anyMoving: anyMoving, simulate: simulate,
    canPlace: canPlace, spotBall: spotBall, aimRay: aimRay, pathClear: pathClear,
    shuffle: shuffle
  };
})();
