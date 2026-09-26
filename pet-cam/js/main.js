/* Pet Cam — the game: the pet's behaviour in the room, the ball and treats,
   touch input, photos, the HUD and the adopt screen. */
(function (PC) {
  'use strict';

  const { ar, pet: P, sfx } = PC;
  const $ = (id) => document.getElementById(id);
  const TAU = Math.PI * 2;
  const PET_H = 0.24;    // pet height in meters
  const BALL_R = 0.045;  // ball radius in meters
  const G = 9.8;
  const NEAR = 0.6;      // the pet keeps at least this far from you...
  const FAR = 4.5;       // ...and at most this far
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  let save = null;
  let canvas = null;
  let ctx = null;
  let dpr = 1;
  let running = false;
  let lastT = 0;
  let clock = 0;
  let saveTimer = 0;
  let hudTimer = 0;
  let photoMode = false;

  const world = {
    placed: false,
    ball: null,        // { p: [x,y,z], v: [x,y,z], held, rest }
    treat: null,       // { from, to, p, t, dur, landed, bites }
    ballReady: false,  // a ball is in your hand, ready to flick
    parts: [],
  };

  const buddy = {
    x: 0, y: 1.2,
    dir: [0, -1],
    state: 'hidden',
    timer: 0,
    target: null,
    speed: 0.55,
    onArrive: 'idle',
    step: 0,
    lift: 0,
    blink: 0,
    nextBlink: 2,
    gaze: 0,
    gazeTo: 0,
    gazeT: 0,
    happyT: 0,
    react: 0,
    carry: null,
    hiddenFor: 0,
    zT: 0,
    tapCount: 0,
    tapT: 0,
    xpCool: 0,
    screen: null,
  };

  /* ======================= Helpers ======================= */

  function clampSpot(p) {
    const r = Math.hypot(p[0], p[1]);
    if (r < 1e-3) return [0, NEAR];
    const k = clamp(r, NEAR, FAR) / r;
    return [p[0] * k, p[1] * k];
  }

  // A floor spot comfortably in view, a bit below the middle of the screen,
  // for the pet to come back to.
  function spotInView() {
    const v = ar.view;
    const spot = ar.floorAt(v.cx + rand(-0.08, 0.08) * v.w, v.cy + v.h * 0.12);
    const d = spot ? Math.hypot(spot[0], spot[1]) : 0;
    return spot && d > 0.8 && d < 2.5 ? spot : ar.spotAhead(1.3, rand(-0.2, 0.2));
  }

  function setState(s, timer) {
    buddy.state = s;
    buddy.timer = timer || 0;
  }

  function goTo(spot, speed, then) {
    buddy.target = clampSpot(spot);
    buddy.speed = speed;
    buddy.onArrive = then || 'idle';
    setState('walk');
  }

  function moveToward(tx, ty, speed, dt) {
    const b = buddy;
    const dx = tx - b.x, dy = ty - b.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.05) return true;
    const s = Math.min(d, speed * dt);
    b.x += dx / d * s;
    b.y += dy / d * s;
    b.dir = [dx / d, dy / d];
    b.step += dt * (6 + speed * 9);
    b.lift = Math.abs(Math.sin(b.step)) * (speed > 1 ? 16 : 9);
    const p = clampSpot([b.x, b.y]);
    b.x = p[0];
    b.y = p[1];
    return d - s < 0.05;
  }

  function gainXP(n) {
    if (P.addXP(save, n)) {
      const lv = P.level(save).level;
      toast(`💖 Friendship level ${lv}!`);
      sfx.levelUp();
      burst('spark', [buddy.x, buddy.y, PET_H * 0.8], 12);
    }
  }

  function awake() {
    return buddy.state !== 'sleep' && buddy.state !== 'hidden';
  }

  /* ======================= Particles ======================= */

  function burst(kind, p, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const part = { kind, p: p.slice(), v: [0, 0, 0], life: 1, max: 1, size: 0.04 };
      if (kind === 'heart') {
        part.v = [Math.cos(a) * 0.12, Math.sin(a) * 0.12, rand(0.25, 0.4)];
        part.life = part.max = rand(0.9, 1.3);
        part.size = rand(0.03, 0.045);
      } else if (kind === 'spark') {
        part.v = [Math.cos(a) * rand(0.3, 0.7), Math.sin(a) * rand(0.3, 0.7), rand(0.4, 1.1)];
        part.life = part.max = rand(0.6, 1);
        part.size = rand(0.02, 0.035);
      } else if (kind === 'crumb') {
        part.v = [Math.cos(a) * rand(0.1, 0.3), Math.sin(a) * rand(0.1, 0.3), rand(0.4, 0.9)];
        part.life = part.max = rand(0.5, 0.9);
        part.size = rand(0.008, 0.014);
      } else if (kind === 'z') {
        part.v = [0.05, 0, 0.12];
        part.life = part.max = 2.2;
        part.size = 0.04;
      } else if (kind === 'poof') {
        part.v = [Math.cos(a) * 0.35, Math.sin(a) * 0.35, rand(0.05, 0.3)];
        part.life = part.max = rand(0.4, 0.7);
        part.size = rand(0.04, 0.07);
      } else if (kind === 'ring') {
        part.life = part.max = 0.6;
        part.size = 0.12;
      }
      world.parts.push(part);
    }
  }

  function updateParts(dt) {
    world.parts = world.parts.filter((q) => {
      q.life -= dt;
      if (q.life <= 0) return false;
      if (q.kind === 'crumb' || q.kind === 'spark') q.v[2] -= G * 0.4 * dt;
      for (let i = 0; i < 3; i++) q.p[i] += q.v[i] * dt;
      if (q.p[2] < 0) { q.p[2] = 0; q.v = [0, 0, 0]; }
      return true;
    });
  }

  function drawStar(x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5;
      const rr = i % 2 ? r * 0.45 : r;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fillStyle = '#FFD84D';
    ctx.fill();
  }

  function drawParts() {
    const f = ar.view.f;
    for (const q of world.parts) {
      const s = ar.project(q.p);
      if (!s) continue;
      const r = f * q.size / s.depth;
      const k = q.life / q.max;
      ctx.globalAlpha = Math.min(1, k * 2.5);
      if (q.kind === 'heart') P.heart(ctx, s.x, s.y, r, '#FF5D8F');
      else if (q.kind === 'spark') drawStar(s.x, s.y, r);
      else if (q.kind === 'crumb') P.ellipse(ctx, s.x, s.y, r, r, 0, '#B97A3E');
      else if (q.kind === 'poof') P.ellipse(ctx, s.x, s.y, r * (1.6 - k), r * (1.6 - k), 0, 'rgba(255,255,255,0.9)');
      else if (q.kind === 'z') {
        ctx.font = `800 ${Math.max(10, r * 2)}px "M PLUS Rounded 1c", system-ui, sans-serif`;
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = P.INK;
        ctx.lineWidth = Math.max(2, r * 0.25);
        ctx.strokeText('z', s.x, s.y);
        ctx.fillText('z', s.x, s.y);
      } else if (q.kind === 'ring') {
        floorEllipse(q.p[0], q.p[1], q.size * (1.4 - k * 0.6), null, `rgba(255,255,255,${k})`);
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ======================= Floor drawing ======================= */

  // A circle lying on the floor, drawn in perspective.
  function floorEllipse(x, y, r, fill, stroke, width) {
    ctx.beginPath();
    let n = 0;
    for (let i = 0; i <= 24; i++) {
      const a = i / 24 * TAU;
      const s = ar.project([x + Math.cos(a) * r, y + Math.sin(a) * r, 0]);
      if (!s) continue;
      if (n++) ctx.lineTo(s.x, s.y); else ctx.moveTo(s.x, s.y);
    }
    if (n < 3) return;
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width || 3; ctx.stroke(); }
  }

  /* ======================= The pet's brain ======================= */

  function decide() {
    const s = save.stats;
    const t = world.treat;
    if (t && t.landed) { goTo(treatApproach(), 0.8, 'eat'); return; }
    if (s.energy < 10) { goSleep(); return; }
    if (buddy.hiddenFor > 4) {
      goTo(spotInView(), 0.8);
      return;
    }
    const bl = world.ball;
    if (bl && bl.rest && !bl.held && s.fun < 85 && Math.random() < 0.35) { startChase(0.1); return; }
    const r = Math.random();
    if (r < 0.45) {
      const a = Math.random() * TAU;
      const d = rand(0.3, 0.9);
      goTo([buddy.x + Math.cos(a) * d, buddy.y + Math.sin(a) * d], rand(0.4, 0.6));
    } else if (r < 0.75) {
      buddy.gazeTo = rand(-1, 1);
      buddy.gazeT = rand(0.8, 1.8);
      setState('idle', rand(1.5, 3));
    } else if (r < 0.85 && s.fun > 40) {
      setState('happy', 0.8);
    } else {
      setState('idle', rand(1, 2.5));
    }
  }

  function treatApproach() {
    const t = world.treat;
    const dx = buddy.x - t.to[0], dy = buddy.y - t.to[1];
    const d = Math.hypot(dx, dy) || 1;
    return [t.to[0] + dx / d * 0.1, t.to[1] + dy / d * 0.1];
  }

  function startChase(react) {
    buddy.react = react;
    setState('chase');
  }

  function goSleep() {
    save.asleep = true;
    buddy.carry = null;
    if (world.ball && world.ball.held) dropBall();
    setState('sleep');
    sfx.sleepy();
  }

  function wake(msg) {
    save.asleep = false;
    buddy.zT = 0;
    setState('happy', 0.6);
    sfx.wake();
    if (msg) toast(msg);
    updateHud();
  }

  function dropBall() {
    const b = buddy;
    world.ball = {
      p: [b.x - b.dir[0] * 0.02, b.y - b.dir[1] * 0.02, BALL_R],
      v: [-b.x * 0.4, -b.y * 0.4, 0.6],
      held: false,
      rest: false,
    };
    b.carry = null;
  }

  function arrive() {
    const then = buddy.onArrive;
    buddy.onArrive = 'idle';
    if (then === 'eat' && world.treat && world.treat.landed) {
      // Face the treat, then munch.
      const t = world.treat;
      const dx = t.to[0] - buddy.x, dy = t.to[1] - buddy.y;
      const d = Math.hypot(dx, dy) || 1;
      buddy.dir = [dx / d, dy / d];
      setState('eat', 2.4);
      return;
    }
    setState('idle', rand(1.2, 3));
  }

  function updateBuddy(dt) {
    const b = buddy;
    const s = save.stats;
    b.timer -= dt;
    b.happyT -= dt;
    b.gazeT -= dt;
    b.xpCool -= dt;
    b.tapT -= dt;
    if (b.tapT <= 0) b.tapCount = 0;
    b.nextBlink -= dt;
    b.blink -= dt;
    if (b.nextBlink < 0) { b.blink = 0.13; b.nextBlink = rand(1.8, 4.5); }

    let moving = false;
    switch (b.state) {
      case 'hidden':
        return;
      case 'appear':
        if (b.timer <= 0) setState(save.asleep ? 'sleep' : 'idle', 1.2);
        break;
      case 'idle':
        if (b.timer <= 0) decide();
        break;
      case 'walk':
        moving = true;
        if (b.onArrive === 'eat' && !(world.treat && world.treat.landed)) b.onArrive = 'idle';
        if (moveToward(b.target[0], b.target[1], b.speed, dt)) arrive();
        break;
      case 'chase': {
        const bl = world.ball;
        if (!bl || bl.held) { setState('idle', 1); break; }
        if (b.react > 0) { b.react -= dt; break; }
        moving = true;
        moveToward(bl.p[0], bl.p[1], 1.4, dt);
        const d = Math.hypot(bl.p[0] - b.x, bl.p[1] - b.y);
        const v = Math.hypot(bl.v[0], bl.v[1]);
        if (d < 0.14 && bl.p[2] < 0.2 && v < 3) {
          bl.held = true;
          b.carry = 'ball';
          sfx.pop();
          b.target = clampSpot(spotInView());
          setState('fetch');
        }
        break;
      }
      case 'fetch':
        moving = true;
        if (moveToward(b.target[0], b.target[1], 0.9, dt)) {
          dropBall();
          world.ball.v = [0, 0, 0.8];
          P.bump(save, 'fun', 18);
          P.bump(save, 'energy', -4);
          save.fetches++;
          gainXP(8);
          sfx.happy();
          burst('heart', [b.x, b.y, PET_H], 3);
          setState('happy', 1.2);
        }
        break;
      case 'eat': {
        const t = world.treat;
        if (Math.floor(b.timer * 4) !== Math.floor((b.timer + dt) * 4)) {
          sfx.munch();
          if (t) burst('crumb', [t.to[0], t.to[1], 0.05], 2);
          if (t) t.bites = Math.min(3, t.bites + 0.35);
        }
        if (b.timer <= 0) {
          world.treat = null;
          P.bump(save, 'food', 28);
          P.bump(save, 'energy', 4);
          save.treats++;
          gainXP(5);
          burst('heart', [b.x, b.y, PET_H], 2);
          sfx.happy();
          setState('happy', 1);
        }
        break;
      }
      case 'sleep':
        save.asleep = true;
        P.bump(save, 'energy', 1.6 * dt);  // a nap in the app refills in about a minute
        b.zT -= dt;
        if (b.zT <= 0) { b.zT = 1.1; burst('z', [b.x + 0.06, b.y, PET_H * 0.9], 1); }
        if (s.energy >= 100) wake(`${save.name} woke up refreshed!`);
        break;
      case 'happy':
        b.lift = Math.abs(Math.sin(b.timer * 11)) * 16;
        if (b.timer <= 0) setState('idle', rand(1, 2));
        break;
      case 'giggle':
        if (b.timer <= 0) setState('idle', rand(1, 2));
        break;
      default:
        break;
    }
    if (!moving && b.state !== 'happy') b.lift *= Math.exp(-dt * 12);

    // Gaze: where it's heading when moving, otherwise at you (or looking around).
    let g = b.gazeT > 0 ? b.gazeTo : 0;
    if (moving && b.screen) {
      const a = ar.project([b.x, b.y, 0]);
      const c = ar.project([b.x + b.dir[0] * 0.2, b.y + b.dir[1] * 0.2, 0]);
      if (a && c) g = clamp((c.x - a.x) / (b.screen.k * 30), -1, 1);
    }
    b.gaze += (g - b.gaze) * (1 - Math.exp(-dt * 8));
  }

  /* ======================= Ball and treats ======================= */

  // Throw the ball along a floor direction so it first lands `dist` meters out.
  function throwBall(dir, dist) {
    const l = Math.hypot(dir[0], dir[1]) || 1;
    const d = [dir[0] / l, dir[1] / l];
    const start = [d[0] * 0.25, d[1] * 0.25, ar.EYE - 0.3];
    const vz = 1.6 + clamp(dist / 4, 0, 1) * 1.4;
    const T = (vz + Math.sqrt(vz * vz + 2 * G * (start[2] - BALL_R))) / G;
    const vh = Math.max(0.3, dist - 0.25) / T;
    world.ball = { p: start, v: [d[0] * vh, d[1] * vh, vz], held: false, rest: false };
    world.ballReady = false;
    sfx.throw();
    updateDock();
    if (buddy.state === 'sleep') toast(`${save.name} is asleep…`);
    else if (buddy.state !== 'hidden' && buddy.state !== 'eat') startChase(0.25);
  }

  // Floor direction through a screen x position.
  function directionAt(sx) {
    const v = ar.view;
    const dx = (sx - v.cx) / v.f;
    const d = [v.fwd[0] + dx * v.right[0], v.fwd[1] + dx * v.right[1]];
    return Math.hypot(d[0], d[1]) < 0.15 ? ar.heading() : d;
  }

  function updateBall(dt) {
    const bl = world.ball;
    if (!bl || bl.held || bl.rest) return;
    bl.v[2] -= G * dt;
    for (let i = 0; i < 3; i++) bl.p[i] += bl.v[i] * dt;
    if (bl.p[2] <= BALL_R) {
      bl.p[2] = BALL_R;
      if (bl.v[2] < -0.7) {
        bl.v[2] = -bl.v[2] * 0.5;
        bl.v[0] *= 0.8;
        bl.v[1] *= 0.8;
        sfx.bounce();
      } else {
        bl.v[2] = 0;
      }
    }
    if (bl.p[2] <= BALL_R + 1e-3 && bl.v[2] === 0) {
      const k = Math.exp(-dt * 1.6);
      bl.v[0] *= k;
      bl.v[1] *= k;
      if (Math.hypot(bl.v[0], bl.v[1]) < 0.05) { bl.v = [0, 0, 0]; bl.rest = true; }
    }
    // Keep it within reach so the pet never runs off into the distance.
    const r = Math.hypot(bl.p[0], bl.p[1]);
    if (r > FAR + 0.3) {
      const k = (FAR + 0.3) / r;
      bl.p[0] *= k;
      bl.p[1] *= k;
      bl.v[0] = -bl.v[0] * 0.3;
      bl.v[1] = -bl.v[1] * 0.3;
    } else if (r < 0.3 && bl.p[2] <= BALL_R + 1e-3) {
      const k = 0.3 / (r || 1);
      bl.p[0] *= k;
      bl.p[1] *= k;
    }
  }

  function tossTreat() {
    let spot = ar.floorAt(ar.view.cx, ar.view.cy + ar.view.h * 0.1);
    if (!spot || Math.hypot(spot[0], spot[1]) > 3) spot = ar.spotAhead(1.2);
    spot = clampSpot(spot);
    const h = ar.heading();
    world.treat = {
      from: [h[0] * 0.2, h[1] * 0.2, ar.EYE - 0.3],
      to: spot,
      p: [h[0] * 0.2, h[1] * 0.2, ar.EYE - 0.3],
      t: 0,
      dur: 0.6,
      landed: false,
      bites: 0,
    };
    sfx.toss();
  }

  function updateTreat(dt) {
    const t = world.treat;
    if (!t || t.landed) return;
    t.t += dt;
    const k = Math.min(1, t.t / t.dur);
    t.p = [
      t.from[0] + (t.to[0] - t.from[0]) * k,
      t.from[1] + (t.to[1] - t.from[1]) * k,
      t.from[2] + (0.015 - t.from[2]) * k + Math.sin(Math.PI * k) * 0.35,
    ];
    if (k >= 1) {
      t.landed = true;
      sfx.bounce();
      if (awake() && buddy.state !== 'eat' && buddy.state !== 'fetch') goTo(treatApproach(), 0.8, 'eat');
    }
  }

  /* ======================= Rendering ======================= */

  function drawBuddy() {
    const b = buddy;
    const foot = ar.project([b.x, b.y, 0]);
    if (!foot) { b.screen = null; return; }
    const head = ar.project([b.x, b.y, PET_H]);
    const k = ar.view.f * PET_H / foot.depth / 100;
    const rot = head ? Math.atan2(head.x - foot.x, foot.y - head.y) : 0;
    b.screen = { x: foot.x, y: foot.y, k, rot, depth: foot.depth };

    floorEllipse(b.x, b.y, PET_H * 0.46 * (1 - b.lift / 120), 'rgba(20, 10, 40, 0.28)');

    let pop = 1;
    if (b.state === 'appear') {
      const x = clamp(1 - b.timer / 0.7, 0, 1);
      pop = 1 + 2.7 * Math.pow(x - 1, 3) + 1.7 * Math.pow(x - 1, 2);  // ease-out-back
    }

    const s = save.stats;
    const st = b.state;
    const happy = b.happyT > 0 || st === 'happy' || st === 'giggle' || photoMode;
    let eyes = 'open';
    if (st === 'sleep' || (b.blink > 0 && !photoMode)) eyes = 'closed';
    else if (happy) eyes = 'happy';
    else if (st === 'chase') eyes = 'wide';

    let mouth = 'smile';
    if (st === 'sleep') mouth = 'o';
    else if (st === 'eat') mouth = 'chew';
    else if (happy || st === 'chase') mouth = 'open';
    else if (P.wish(save)) mouth = 'flat';

    let squash = Math.sin(clock * 2.5) * 0.025;
    if (st === 'sleep') squash = 0.07 + Math.sin(clock * 1.4) * 0.04;
    if (st === 'giggle') squash = Math.sin(clock * 34) * 0.07;
    if (st === 'happy' && b.lift < 3) squash = 0.08;

    ctx.save();
    ctx.translate(foot.x, foot.y);
    ctx.rotate(rot);
    ctx.scale(k * pop, k * pop);
    P.draw(ctx, {
      t: clock,
      species: save.species,
      color: save.color,
      squash,
      lift: b.lift,
      gaze: b.gaze,
      eyes,
      mouth,
      step: b.step,
      wiggle: happy ? 1 : 0,
      droop: s.energy < 25 ? 0.4 : 0,
      carry: b.carry,
    });
    ctx.restore();
  }

  function drawWish() {
    const b = buddy;
    const w = P.wish(save);
    if (!w || !b.screen || (b.state !== 'idle' && b.state !== 'walk')) return;
    const { x, y, k, rot } = b.screen;
    const up = 128 * k;
    const bx = x + Math.sin(rot) * up + 24 * k;
    const by = y - Math.cos(rot) * up + Math.sin(clock * 3) * 3;
    const r = clamp(20 * k, 14, 34);
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = P.INK;
    ctx.lineWidth = Math.max(2, r * 0.12);
    P.ellipse(ctx, bx - r * 0.9, by + r * 1.05, r * 0.18, r * 0.18, 0, '#FFFFFF', ctx.lineWidth);
    P.ellipse(ctx, bx, by, r, r * 0.85, 0, '#FFFFFF', ctx.lineWidth);
    if (w === 'food') P.cookie(ctx, bx, by, r * 0.55);
    else if (w === 'fun') P.ball(ctx, bx, by, r * 0.5);
    else {
      ctx.fillStyle = P.INK;
      ctx.font = `800 ${r * 0.8}px "M PLUS Rounded 1c", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Zz', bx, by + r * 0.05);
    }
  }

  function drawBall() {
    const bl = world.ball;
    if (!bl || bl.held) return null;
    const s = ar.project(bl.p);
    if (!s) return null;
    return {
      depth: s.depth,
      draw() {
        const shade = clamp(0.3 - bl.p[2] * 0.15, 0.05, 0.3);
        floorEllipse(bl.p[0], bl.p[1], BALL_R, `rgba(20, 10, 40, ${shade})`);
        P.ball(ctx, s.x, s.y, ar.view.f * BALL_R / s.depth);
      },
    };
  }

  function drawTreat() {
    const t = world.treat;
    if (!t) return null;
    const s = ar.project(t.p);
    if (!s) return null;
    return {
      depth: s.depth,
      draw() {
        if (t.landed) floorEllipse(t.to[0], t.to[1], 0.045, 'rgba(20, 10, 40, 0.25)');
        const r = ar.view.f * 0.04 / s.depth * (1 - t.bites / 4);
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.scale(1, t.landed ? 0.65 : 1);
        P.cookie(ctx, 0, 0, r);
        ctx.restore();
      },
    };
  }

  function drawReticle() {
    const v = ar.view;
    const spot = ar.floorAt(v.cx, v.cy);
    if (!spot) return;
    const d = Math.hypot(spot[0], spot[1]);
    if (d < 0.35 || d > 5) return;
    const pulse = 0.16 + Math.sin(clock * 4) * 0.02;
    floorEllipse(spot[0], spot[1], pulse, 'rgba(255,255,255,0.18)', '#FFFFFF', 3);
    floorEllipse(spot[0], spot[1], 0.03, '#FFFFFF');
  }

  // Arrow at the screen edge pointing to the pet when it's out of view.
  function drawPointer() {
    const b = buddy;
    const v = ar.view;
    const s = b.screen;
    const onScreen = s && s.x > -30 && s.x < v.w + 30 && s.y > -30 && s.y < v.h + 60;
    if (onScreen) return true;
    const d = ar.screenDirection([b.x, b.y, PET_H / 2]);
    let dx = d.x, dy = d.y;
    if (d.depth < 0.1) dx = Math.sign(dx || 1) * Math.max(Math.abs(dx), Math.abs(dy) + 1);
    const a = Math.atan2(dy, dx);
    const top = 110, bottom = v.h - 150, left = 36, right = v.w - 36;
    const cx = v.cx, cy = (top + bottom) / 2;
    const tx = Math.cos(a) > 0 ? (right - cx) / Math.cos(a) : Math.cos(a) < 0 ? (left - cx) / Math.cos(a) : Infinity;
    const ty = Math.sin(a) > 0 ? (bottom - cy) / Math.sin(a) : Math.sin(a) < 0 ? (top - cy) / Math.sin(a) : Infinity;
    const t = Math.min(tx, ty);
    const x = cx + Math.cos(a) * t, y = cy + Math.sin(a) * t;
    const c = P.COLORS[save.color];
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(34, 0);
    ctx.lineTo(18, -13);
    ctx.lineTo(18, 13);
    ctx.closePath();
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.restore();
    P.ellipse(ctx, x, y, 22, 22, 0, c.body, 4);
    ctx.save();
    ctx.translate(x, y + 17);
    ctx.scale(0.3, 0.3);
    P.draw(ctx, { t: clock, species: save.species, color: save.color, eyes: 'open', mouth: 'smile' });
    ctx.restore();
    return false;
  }

  function drawBallInHand() {
    if (!world.ballReady) return;
    const v = ar.view;
    const y = v.h - 150 + Math.sin(clock * 4) * 5;
    P.ball(ctx, v.cx, y, 26);
  }

  function render() {
    const v = ar.view;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (v.camera) ctx.clearRect(0, 0, v.w, v.h);
    else ar.drawBackdrop(ctx);

    if (!world.placed) {
      if (!photoMode) drawReticle();
      drawParts();
      return true;
    }

    const items = [];
    if (buddy.state !== 'hidden') {
      const f = ar.project([buddy.x, buddy.y, 0]);
      if (f) items.push({ depth: f.depth, draw: drawBuddy });
      else buddy.screen = null;
    }
    const bi = drawBall();
    if (bi) items.push(bi);
    const ti = drawTreat();
    if (ti) items.push(ti);
    items.sort((a, b) => b.depth - a.depth);
    items.forEach((it) => it.draw());
    drawParts();

    if (photoMode) return true;
    drawWish();
    const seen = drawPointer();
    drawBallInHand();
    return seen;
  }

  /* ======================= Loop ======================= */

  function frame(t) {
    if (!running) return;
    const dt = Math.min(0.05, (t - lastT) / 1000 || 0);
    lastT = t;
    clock += dt;

    ar.update(dt);
    P.tick(save, dt / 3600);
    if (world.placed) {
      updateBuddy(dt);
      updateBall(dt);
      updateTreat(dt);
    }
    updateParts(dt);
    buddy.hiddenFor = render() ? 0 : buddy.hiddenFor + dt;
    updateHint();

    hudTimer -= dt;
    if (hudTimer <= 0) { hudTimer = 0.3; updateHud(); }
    saveTimer -= dt;
    if (saveTimer <= 0) { saveTimer = 4; P.save(save); }
    requestAnimationFrame(frame);
  }

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ar.resize(w, h);
  }

  /* ======================= Input ======================= */

  const touch = { id: null, x: 0, y: 0, sx: 0, sy: 0, moved: 0, onPet: false, stroke: 0, samples: [] };

  function hitPet(x, y) {
    const s = buddy.screen;
    if (!s || buddy.state === 'hidden') return false;
    const up = 45 * s.k;
    const cx = s.x + Math.sin(s.rot) * up;
    const cy = s.y - Math.cos(s.rot) * up;
    return Math.hypot(x - cx, y - cy) < Math.max(36, 62 * s.k);
  }

  function onDown(e) {
    if (touch.id !== null) return;
    sfx.unlock();
    touch.id = e.pointerId;
    touch.x = touch.sx = e.clientX;
    touch.y = touch.sy = e.clientY;
    touch.moved = 0;
    touch.stroke = 0;
    touch.onPet = world.placed && hitPet(e.clientX, e.clientY);
    touch.samples = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
    canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
  }

  function onMove(e) {
    if (e.pointerId !== touch.id) return;
    const dx = e.clientX - touch.x, dy = e.clientY - touch.y;
    touch.x = e.clientX;
    touch.y = e.clientY;
    touch.moved += Math.hypot(dx, dy);
    const now = performance.now();
    touch.samples.push({ x: e.clientX, y: e.clientY, t: now });
    while (touch.samples.length > 2 && now - touch.samples[0].t > 100) touch.samples.shift();

    if (touch.onPet && hitPet(e.clientX, e.clientY)) {
      touch.stroke += Math.hypot(dx, dy);
      if (touch.stroke > 55) {
        touch.stroke = 0;
        const b = buddy;
        burst('heart', [b.x, b.y, PET_H * 1.05], 1);
        sfx.purr();
        if (awake()) {
          b.happyT = 0.7;
          P.bump(save, 'fun', 2);
          if (b.state === 'idle') b.timer = Math.max(b.timer, 1);
        }
        if (b.xpCool <= 0) { b.xpCool = 0.6; gainXP(1); }
      }
    } else if (!touch.onPet && !world.ballReady && touch.moved > 8) {
      ar.drag(dx, dy);
    }
  }

  function onUp(e) {
    if (e.pointerId !== touch.id) return;
    touch.id = null;
    const x = e.clientX, y = e.clientY;
    const tap = touch.moved < 12;

    if (world.ballReady && !touch.onPet) {
      const a = touch.samples[0];
      const z = touch.samples[touch.samples.length - 1];
      const dt = Math.max(16, z.t - a.t) / 1000;
      const vy = (z.y - a.y) / dt;
      if (!tap && vy < -350 && touch.sy - y > 30) {
        const power = clamp((-vy - 350) / 2400, 0, 1);
        throwBall(directionAt(x), 1 + power * 3.2);
      } else if (tap) {
        const spot = ar.floorAt(x, y);
        if (spot) throwBall(spot, clamp(Math.hypot(spot[0], spot[1]), 0.8, FAR));
        else throwBall(directionAt(x), 2.5);
      }
      return;
    }

    if (!tap) return;
    if (!world.placed) { placeAt(x, y); return; }
    if (touch.onPet) { tapPet(); return; }

    const spot = ar.floorAt(x, y);
    if (!spot) return;
    if (buddy.state === 'sleep') { toast(`Shh… ${save.name} is napping`); return; }
    if (buddy.state === 'eat' || buddy.state === 'fetch') return;
    burst('ring', [spot[0], spot[1], 0], 1);
    sfx.tap();
    goTo(spot, 0.75);
  }

  function placeAt(x, y) {
    const spot = ar.floorAt(x, y);
    const d = spot ? Math.hypot(spot[0], spot[1]) : 0;
    if (!spot || d < 0.35 || d > 5) {
      toast(spot ? 'Tap the floor a little closer' : 'Point at the floor first');
      return;
    }
    const p = clampSpot(spot);
    world.placed = true;
    buddy.x = p[0];
    buddy.y = p[1];
    buddy.dir = [-p[0] / d, -p[1] / d];
    buddy.lift = 0;
    buddy.carry = null;
    setState('appear', 0.7);
    burst('poof', [p[0], p[1], 0.1], 12);
    burst('heart', [p[0], p[1], PET_H], 3);
    sfx.pop();
    updateDock();
    toast(save.asleep ? `${save.name} is still napping` : `Hi, ${save.name}!`);
  }

  function tapPet() {
    const b = buddy;
    if (b.state === 'sleep') { wake(`${save.name} woke up!`); return; }
    if (b.state === 'chase' || b.state === 'fetch' || b.state === 'eat' || b.state === 'appear') return;
    b.tapCount++;
    b.tapT = 1.5;
    if (b.tapCount >= 6) {
      b.tapCount = 0;
      toast(`${save.name} is getting dizzy!`);
      setState('giggle', 1.4);
      return;
    }
    setState('giggle', 0.7);
    sfx.giggle();
    P.bump(save, 'fun', 3);
    burst('heart', [b.x, b.y, PET_H * 1.05], 1);
    if (b.xpCool <= 0) { b.xpCool = 0.6; gainXP(1); }
  }

  /* ======================= Actions ======================= */

  function needPlaced() {
    if (world.placed) return true;
    toast(`Tap the floor to put ${save.name} down first`);
    return false;
  }

  function onTreat() {
    if (!needPlaced()) return;
    if (world.treat) { toast('There\'s already a treat out!'); return; }
    if (save.stats.food >= 95) { toast(`${save.name} is too full to eat`); return; }
    tossTreat();
  }

  function onBall() {
    if (!needPlaced()) return;
    sfx.tap();
    if (world.ballReady) {
      world.ballReady = false;
    } else if (world.ball && world.ball.held) {
      toast(`${save.name} has the ball!`);
      return;
    } else {
      if (world.ball && buddy.state === 'chase') setState('idle', 1);
      world.ball = null;
      world.ballReady = true;
      if (save.stats.energy < 15) toast(`${save.name} looks too tired to play`);
    }
    updateDock();
  }

  function onCall() {
    if (!needPlaced()) return;
    sfx.call();
    if (buddy.state === 'sleep') wake();
    if (buddy.state === 'eat' || buddy.state === 'fetch') return;
    buddy.happyT = 0.6;
    goTo(spotInView(), 1.1);
    gainXP(1);
  }

  function onNap() {
    if (!needPlaced()) return;
    if (buddy.state === 'sleep') { wake(`${save.name} woke up!`); updateDock(); return; }
    if (save.stats.energy > 80) { toast(`${save.name} isn't sleepy`); return; }
    goSleep();
    updateDock();
  }

  /* ======================= Photos ======================= */

  let photoUrl = null;
  let photoFile = null;

  function takePhoto() {
    sfx.shutter();
    const flash = $('flash');
    flash.classList.remove('go');
    void flash.offsetWidth;
    flash.classList.add('go');

    // Render one clean frame (no arrows or bubbles) and grab it.
    photoMode = true;
    render();
    photoMode = false;
    const w = canvas.width, h = canvas.height;
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const o = out.getContext('2d');
    const v = ar.video;
    if (ar.view.camera && v && v.videoWidth) {
      const s = Math.max(w / v.videoWidth, h / v.videoHeight);
      const dw = v.videoWidth * s, dh = v.videoHeight * s;
      o.drawImage(v, (w - dw) / 2, (h - dh) / 2, dw, dh);
    }
    o.drawImage(canvas, 0, 0);
    // A little caption sticker.
    const fs = Math.round(18 * dpr);
    o.font = `800 ${fs}px "M PLUS Rounded 1c", system-ui, sans-serif`;
    const label = `${save.name} · Pet Cam`;
    const tw = o.measureText(label).width;
    o.fillStyle = 'rgba(27, 24, 48, 0.6)';
    o.beginPath();
    if (o.roundRect) o.roundRect(w - tw - fs * 2.2, h - fs * 3.2, tw + fs * 1.4, fs * 2, fs);
    else o.rect(w - tw - fs * 2.2, h - fs * 3.2, tw + fs * 1.4, fs * 2);
    o.fill();
    o.fillStyle = '#FFFFFF';
    o.textBaseline = 'middle';
    o.fillText(label, w - tw - fs * 1.5, h - fs * 2.2);

    save.photos++;
    gainXP(3);
    if (world.placed && awake()) buddy.happyT = 1;

    out.toBlob((blob) => {
      if (!blob) return;
      if (photoUrl) URL.revokeObjectURL(photoUrl);
      photoUrl = URL.createObjectURL(blob);
      const name = `pet-cam-${save.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}.jpg`;
      photoFile = new File([blob], name, { type: 'image/jpeg' });
      $('photo-img').src = photoUrl;
      $('photo-save').href = photoUrl;
      $('photo-save').download = name;
      const canShare = navigator.canShare && navigator.canShare({ files: [photoFile] });
      $('photo-share').hidden = !canShare;
      $('photo-sheet').hidden = false;
    }, 'image/jpeg', 0.92);
  }

  async function sharePhoto() {
    if (!photoFile) return;
    try {
      await navigator.share({ files: [photoFile], title: `${save.name} on Pet Cam` });
    } catch (e) { /* cancelled */ }
  }

  /* ======================= HUD ======================= */

  let toastTimer = 0;
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  let lastHint = null;
  function updateHint() {
    let h = '';
    const touchMode = ar.view.mode === 'touch';
    if (!world.placed) {
      h = ar.floorAt(ar.view.cx, ar.view.cy)
        ? `Tap the floor to put ${save.name} down`
        : (touchMode ? 'Drag down to see the floor' : 'Tilt your phone down at the floor');
    } else if (world.ballReady) {
      h = 'Flick up to throw!';
    }
    if (h !== lastHint) {
      lastHint = h;
      $('hint').textContent = h;
    }
  }

  function updateHud() {
    const s = save.stats;
    document.querySelectorAll('.meter').forEach((m) => {
      const v = s[m.dataset.stat];
      m.querySelector('i').style.width = `${Math.round(v)}%`;
      m.classList.toggle('low', v < 25);
    });
    $('hud-name').textContent = save.name;
    $('hud-level').textContent = `Friendship ${P.level(save).level}`;
    $('nap-label').textContent = buddy.state === 'sleep' ? 'Wake' : 'Nap';
  }

  function updateDock() {
    $('btn-ball').classList.toggle('on', world.ballReady);
    $('nap-label').textContent = buddy.state === 'sleep' ? 'Wake' : 'Nap';
  }

  function openMenu() {
    const lv = P.level(save);
    const days = Math.floor((Date.now() - save.born) / 86400000) + 1;
    $('menu-title').textContent = save.name;
    $('menu-stats').innerHTML = '';
    [
      `${P.COLORS[save.color].label} ${P.SPECIES[save.species].label} · day ${days}`,
      `Friendship ${lv.level} (${lv.into}/${lv.need} to next)`,
      `${save.fetches} fetches · ${save.treats} treats · ${save.photos} photos`,
      ar.view.mode === 'sensor' ? 'Move your phone to look around.' : 'No motion sensor: drag to look around.',
    ].forEach((line, i) => {
      if (i) $('menu-stats').appendChild(document.createElement('br'));
      $('menu-stats').appendChild(document.createTextNode(line));
    });
    $('menu-sound').textContent = `Sound: ${sfx.on ? 'on' : 'off'}`;
    $('menu-sheet').hidden = false;
  }

  /* ======================= Start ======================= */

  async function start() {
    sfx.unlock();
    // Both of these must be asked for straight from the tap.
    const sensorAsk = ar.requestSensorPermission();
    $('setup').hidden = true;
    $('stage').hidden = false;
    resize();
    const cam = await ar.startCamera($('cam'));
    const perm = await sensorAsk;
    let sensors = false;
    if (perm === 'granted') sensors = await ar.startSensors();
    resize();

    P.catchUp(save);
    running = true;
    lastT = performance.now();
    requestAnimationFrame(frame);
    updateHud();

    if (!cam.ok) {
      const why = {
        insecure: 'The camera needs an https:// link, so here\'s a pretend room',
        denied: 'Camera is off, so here\'s a pretend room',
      }[cam.reason] || 'No camera found, so here\'s a pretend room';
      toast(why);
    } else if (!sensors) {
      toast('No motion sensor: drag to look around');
    }
  }

  function wireStage() {
    canvas = $('view');
    ctx = canvas.getContext('2d');
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', (e) => { if (e.pointerId === touch.id) touch.id = null; });
    window.addEventListener('resize', resize);
    $('cam').addEventListener('resize', resize);

    $('btn-treat').addEventListener('click', onTreat);
    $('btn-ball').addEventListener('click', onBall);
    $('btn-call').addEventListener('click', onCall);
    $('btn-nap').addEventListener('click', onNap);
    $('btn-photo').addEventListener('click', takePhoto);
    $('btn-menu').addEventListener('click', openMenu);

    $('photo-close').addEventListener('click', () => { $('photo-sheet').hidden = true; });
    $('photo-share').addEventListener('click', sharePhoto);

    $('menu-close').addEventListener('click', () => { $('menu-sheet').hidden = true; });
    $('menu-sound').addEventListener('click', () => {
      sfx.on = !sfx.on;
      save.sound = sfx.on;
      $('menu-sound').textContent = `Sound: ${sfx.on ? 'on' : 'off'}`;
      P.save(save);
    });
    $('menu-place').addEventListener('click', () => {
      world.placed = false;
      world.ball = null;
      world.treat = null;
      world.ballReady = false;
      buddy.carry = null;
      setState('hidden');
      updateDock();
      $('menu-sheet').hidden = true;
    });
    $('menu-new').addEventListener('click', () => {
      if (!confirm(`Say goodbye to ${save.name} and adopt a new pet?`)) return;
      running = false;
      P.clear();
      ar.stopCamera();
      location.reload();
    });

    document.addEventListener('visibilitychange', () => {
      if (!save || !running) return;
      if (document.hidden) {
        P.save(save);
        ar.pauseCamera(true);
      } else {
        P.catchUp(save);
        ar.pauseCamera(false);
        lastT = performance.now();
        updateHud();
      }
    });
    window.addEventListener('pagehide', () => { if (save && running) P.save(save); });
  }

  /* ======================= Adopt / welcome ======================= */

  function moodLine(s) {
    if (s.asleep) return `${s.name} is napping.`;
    const w = P.wish(s);
    if (w === 'food') return `${s.name} is hungry!`;
    if (w === 'fun') return `${s.name} wants to play!`;
    if (w === 'energy') return `${s.name} is sleepy.`;
    return `${s.name} missed you!`;
  }

  function showWelcome() {
    $('welcome-back').hidden = false;
    $('adopt').hidden = true;
    P.portrait($('welcome-pet'), save.species, save.color, { eyes: save.asleep ? 'closed' : 'happy', mouth: 'open' });
    $('welcome-text').textContent = moodLine(save);
  }

  function showAdopt() {
    $('welcome-back').hidden = true;
    $('adopt').hidden = false;
    const pick = { species: 'mochi', color: 'berry' };
    const speciesList = $('species-list');
    const colorList = $('color-list');
    const nameInput = $('pet-name');
    speciesList.innerHTML = '';
    colorList.innerHTML = '';

    const canvases = {};
    Object.keys(P.SPECIES).forEach((k) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'species-btn';
      b.setAttribute('aria-pressed', String(k === pick.species));
      const c = document.createElement('canvas');
      c.width = 160;
      c.height = 160;
      c.setAttribute('aria-hidden', 'true');
      canvases[k] = c;
      b.appendChild(c);
      b.appendChild(document.createTextNode(P.SPECIES[k].label));
      b.addEventListener('click', () => {
        const oldDefault = P.SPECIES[pick.species].label;
        pick.species = k;
        speciesList.querySelectorAll('.species-btn').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        nameInput.placeholder = P.SPECIES[k].label;
        if (nameInput.value === oldDefault) nameInput.value = '';
        sfx.tap();
      });
      speciesList.appendChild(b);
    });

    const paint = () => Object.keys(canvases).forEach((k) => P.portrait(canvases[k], k, pick.color));

    Object.keys(P.COLORS).forEach((k) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'color-btn';
      b.style.setProperty('--swatch', P.COLORS[k].body);
      b.setAttribute('aria-label', P.COLORS[k].label);
      b.setAttribute('aria-pressed', String(k === pick.color));
      b.addEventListener('click', () => {
        pick.color = k;
        colorList.querySelectorAll('.color-btn').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        paint();
        sfx.tap();
      });
      colorList.appendChild(b);
    });
    paint();

    $('adopt').onsubmit = (e) => {
      e.preventDefault();
      const name = (nameInput.value.trim() || nameInput.placeholder).slice(0, 12);
      save = P.create({ name, species: pick.species, color: pick.color });
      P.save(save);
      start();
    };
  }

  function boot() {
    wireStage();
    save = P.load();
    if (save) {
      sfx.on = save.sound !== false;
      P.catchUp(save);
      showWelcome();
    } else {
      showAdopt();
    }
    $('btn-continue').addEventListener('click', () => start());
    $('btn-newpet').addEventListener('click', () => {
      if (!confirm(`Say goodbye to ${save.name} and adopt a new pet?`)) return;
      P.clear();
      save = null;
      showAdopt();
    });
  }

  boot();
})(window.PC);
