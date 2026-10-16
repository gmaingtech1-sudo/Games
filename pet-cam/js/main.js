/* Pet Cam — the game: how the pet behaves in the room, finger play (toys,
   hand-fed treats, petting), the ball, photos, the HUD and the adopt screen.

   Each kind of pet acts like the real thing: dogs fetch, bark, wag and roll
   over for belly rubs; cats stalk the laser dot and pounce, purr when you
   stroke them (until they've had enough), and may ignore you when called;
   bunnies hop, nibble and flop over when they're happy. */
(function (PC) {
  'use strict';

  const { ar, pet: P, art: A, sfx } = PC;
  const $ = (id) => document.getElementById(id);
  const TAU = Math.PI * 2;
  const BALL_R = 0.035;  // ball radius in meters
  const G = 9.8;
  const FAR = 4.5;       // the pet stays within this distance of you
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const chance = (p) => Math.random() < p;

  // How each kind moves. stride: meters per full step cycle.
  const MOVES = {
    dog: { walk: 0.75, run: 1.9, stride: 0.5 },
    cat: { walk: 0.5, run: 2.1, stride: 0.34 },
    bunny: { walk: 0.55, run: 1.4, stride: 0.3 },
  };

  // What your finger holds in each mode, by kind of pet.
  const HAND = {
    treat: { dog: ['🍖', 'Treat'], cat: ['🐟', 'Treat'], bunny: ['🥕', 'Carrot'] },
    toy: { dog: ['🧸', 'Toy'], cat: ['🔴', 'Laser'], bunny: ['🌿', 'Leaf'] },
  };

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
    ball: null,   // { p: [x,y,z], v: [x,y,z], held, rest }
    treat: null,  // { from, to, p, t, dur, landed, bites }
    hand: null,   // what your finger is holding: 'ball' | 'treat' | 'toy' | null
    lure: null,   // the treat or toy under your finger: { p: [x,y], live, still, gone }
    parts: [],
  };

  const buddy = {
    x: 0, y: 1.2,
    dir: [0, -1],
    face: 1,          // side views: 1 walks right on screen, -1 left
    state: 'hidden',
    act: 'sit',       // what it's doing while idle: sit | stand | sniff | lie | groom
    timer: 0,
    target: null,
    speed: 0.6,
    onArrive: 'idle',
    phase: 0,
    moving: 0,
    lift: 0,
    blink: 0,
    nextBlink: 2,
    gaze: 0,
    gazeTo: 0,
    gazeT: 0,
    happyT: 0,
    mouthT: 0,        // mouth open (bark/meow) for this long
    tilt: 0,
    tiltTo: 0,
    earT: 0,
    react: 0,
    carry: null,
    hiddenFor: 0,
    zT: 0,
    xpCool: 0,
    tapCount: 0,
    tapT: 0,
    petT: 0,          // how long you've been stroking it, in seconds
    lastStroke: -9,
    purrT: 0,
    bats: 0,
    leap: null,       // cat pounce: { from, to, t }
    screen: null,
  };

  const spec = () => A.SPECIES[save.species];
  const moves = () => MOVES[save.species];
  const isDog = () => save.species === 'dog';
  const isCat = () => save.species === 'cat';
  const isBunny = () => save.species === 'bunny';

  /* ======================= Helpers ======================= */

  function near() {
    return Math.max(0.55, spec().len * 1.1);
  }

  function clampSpot(p) {
    const r = Math.hypot(p[0], p[1]);
    if (r < 1e-3) return [0, near()];
    const k = clamp(r, near(), FAR) / r;
    return [p[0] * k, p[1] * k];
  }

  // A floor spot comfortably in view, a bit below the middle of the screen.
  function spotInView() {
    const v = ar.view;
    const spot = ar.floorAt(v.cx + rand(-0.08, 0.08) * v.w, v.cy + v.h * 0.12);
    const d = spot ? Math.hypot(spot[0], spot[1]) : 0;
    const lo = isDog() ? 1.1 : 0.75;
    return spot && d > lo && d < 2.6 ? spot : ar.spotAhead(lo + 0.4, rand(-0.2, 0.2));
  }

  function setState(s, timer) {
    buddy.state = s;
    buddy.timer = timer || 0;
    if (s !== 'pounce') buddy.leap = null;
  }

  function setIdle(act, time) {
    buddy.act = act;
    setState('idle', time);
    if (act === 'sit' || act === 'groom') faceCamera();
  }

  function goTo(spot, speed, then) {
    buddy.target = clampSpot(spot);
    buddy.speed = speed;
    buddy.onArrive = then || 'idle';
    setState('walk');
  }

  // Turn to look at you (used by the front-facing poses).
  function faceCamera() {
    const d = Math.hypot(buddy.x, buddy.y) || 1;
    buddy.dir = [-buddy.x / d, -buddy.y / d];
  }

  function moveToward(tx, ty, speed, dt) {
    const b = buddy;
    const dx = tx - b.x, dy = ty - b.y;
    const d = Math.hypot(dx, dy);
    b.moving = Math.min(1, speed / moves().walk);
    if (d < 0.03) return true;
    const s = Math.min(d, speed * dt);
    b.x += dx / d * s;
    b.y += dy / d * s;
    b.dir = [dx / d, dy / d];
    b.phase += s * TAU / moves().stride;
    if (isBunny()) b.lift = Math.max(0, Math.sin(b.phase)) * (speed > 1 ? 16 : 10);
    const p = clampSpot([b.x, b.y]);
    b.x = p[0];
    b.y = p[1];
    return d - s < 0.03;
  }

  function dist(p) {
    return Math.hypot(p[0] - buddy.x, p[1] - buddy.y);
  }

  function gainXP(n) {
    if (P.addXP(save, n)) {
      toast(`💖 Friendship level ${P.level(save).level}!`);
      sfx.levelUp();
      burst('spark', [buddy.x, buddy.y, spec().h * 0.8], 12);
    }
  }

  function awake() {
    return buddy.state !== 'sleep' && buddy.state !== 'hidden';
  }

  // The pet's own voice.
  function speak() {
    if (isDog()) sfx.bark();
    else if (isCat()) sfx.meow();
    else sfx.thump();
    buddy.mouthT = isBunny() ? 0 : isDog() ? 0.22 : 0.45;
  }

  /* ======================= Particles ======================= */

  function burst(kind, p, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const part = { kind, p: p.slice(), v: [0, 0, 0], life: 1, max: 1, size: 0.04 };
      if (kind === 'heart') {
        part.v = [Math.cos(a) * 0.12, Math.sin(a) * 0.12, rand(0.25, 0.4)];
        part.life = part.max = rand(0.9, 1.3);
        part.size = rand(0.025, 0.04);
      } else if (kind === 'spark') {
        part.v = [Math.cos(a) * rand(0.3, 0.7), Math.sin(a) * rand(0.3, 0.7), rand(0.4, 1.1)];
        part.life = part.max = rand(0.6, 1);
        part.size = rand(0.02, 0.035);
      } else if (kind === 'crumb') {
        part.v = [Math.cos(a) * rand(0.1, 0.3), Math.sin(a) * rand(0.1, 0.3), rand(0.4, 0.9)];
        part.life = part.max = rand(0.5, 0.9);
        part.size = rand(0.006, 0.011);
      } else if (kind === 'z') {
        part.v = [0.05, 0, 0.12];
        part.life = part.max = 2.2;
        part.size = 0.035;
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

  function text(str, x, y, size) {
    ctx.font = `800 ${Math.max(10, size)}px "M PLUS Rounded 1c", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = 'rgba(30,20,40,0.8)';
    ctx.lineWidth = Math.max(2, size * 0.15);
    ctx.strokeText(str, x, y);
    ctx.fillText(str, x, y);
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
      else if (q.kind === 'z') text('z', s.x, s.y, r * 2);
      else if (q.kind === 'ring') floorEllipse(q.p[0], q.p[1], q.size * (1.4 - k * 0.6), q.size * (1.4 - k * 0.6), null, null, `rgba(255,255,255,${k})`);
    }
    ctx.globalAlpha = 1;
  }

  /* ======================= Floor drawing ======================= */

  // An ellipse lying on the floor, drawn in perspective. `along` is the
  // world direction of its long axis (default: x).
  function floorEllipse(x, y, a, b, along, fill, stroke, width) {
    const u = along || [1, 0];
    const w = [-u[1], u[0]];
    ctx.beginPath();
    let n = 0;
    for (let i = 0; i <= 24; i++) {
      const t = i / 24 * TAU;
      const px = x + u[0] * Math.cos(t) * a + w[0] * Math.sin(t) * b;
      const py = y + u[1] * Math.cos(t) * a + w[1] * Math.sin(t) * b;
      const s = ar.project([px, py, 0]);
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
    if (t && t.landed) { goTo(treatApproach(), moves().walk * 1.3, 'eat'); return; }
    if (s.energy < 10) { goSleep(); return; }
    if (buddy.hiddenFor > 4) { goTo(spotInView(), isCat() ? moves().walk : moves().run * 0.6); return; }
    const bl = world.ball;
    if (bl && bl.rest && !bl.held && s.fun < 85 && !isBunny() && chance(0.3)) { startChase(0.1); return; }

    const r = Math.random();
    const wander = () => {
      const a = Math.random() * TAU;
      const d = isBunny() ? rand(0.2, 0.5) : rand(0.3, 0.9);
      goTo([buddy.x + Math.cos(a) * d, buddy.y + Math.sin(a) * d], moves().walk * rand(0.7, 1), chance(0.4) ? 'sniff' : 'idle');
    };
    if (isDog()) {
      if (r < 0.35) wander();
      else if (r < 0.6) { setIdle('sit', rand(2, 4)); if (chance(0.4)) buddy.tiltTo = rand(-0.3, 0.3); }
      else if (r < 0.72) setIdle('stand', rand(1.5, 3));
      else if (r < 0.82 && s.energy < 70) setIdle('lie', rand(4, 8));
      else if (r < 0.92 && s.fun > 40) { setState('happy', 1); }
      else setIdle('sniff', rand(1.5, 3));
    } else if (isCat()) {
      if (r < 0.28) wander();
      else if (r < 0.52) setIdle('sit', rand(3, 6));
      else if (r < 0.67) setIdle('groom', rand(2, 4));
      else if (r < 0.82) setIdle('lie', rand(5, 10));
      else setIdle('stand', rand(1.5, 3));
    } else {
      if (r < 0.4) wander();
      else if (r < 0.6) setIdle('sit', rand(2, 4));
      else if (r < 0.72) setIdle('groom', rand(1.5, 3));
      else if (r < 0.85) setIdle('sniff', rand(2, 3));
      else if (r < 0.93 && s.energy < 70) setIdle('lie', rand(4, 8));
      else setState('happy', 0.9);
    }
  }

  function treatApproach() {
    const t = world.treat;
    const dx = buddy.x - t.to[0], dy = buddy.y - t.to[1];
    const d = Math.hypot(dx, dy) || 1;
    const off = spec().len * 0.55;
    return [t.to[0] + dx / d * off, t.to[1] + dy / d * off];
  }

  function startChase(react) {
    buddy.react = react;
    buddy.bats = 0;
    setState('chase');
  }

  function goSleep() {
    save.asleep = true;
    if (world.ball && world.ball.held) dropBall();
    buddy.carry = null;
    setState('sleep');
    sfx.sleepy();
    updateDock();
  }

  function wake(msg) {
    save.asleep = false;
    buddy.zT = 0;
    setState('happy', 0.6);
    sfx.wake();
    if (msg) toast(msg);
    updateDock();
  }

  function dropBall() {
    const b = buddy;
    const h = spec().h;
    world.ball = {
      p: [b.x + b.dir[0] * spec().len * 0.5, b.y + b.dir[1] * spec().len * 0.5, h * 0.4],
      v: [-b.x * 0.3, -b.y * 0.3, 0.4],
      held: false,
      rest: false,
    };
    b.carry = null;
  }

  function arrive() {
    const then = buddy.onArrive;
    buddy.onArrive = 'idle';
    if (then === 'eat' && world.treat && world.treat.landed) {
      const t = world.treat;
      const dx = t.to[0] - buddy.x, dy = t.to[1] - buddy.y;
      const d = Math.hypot(dx, dy) || 1;
      buddy.dir = [dx / d, dy / d];
      setState('eat', isBunny() ? 3 : 2.4);
      return;
    }
    if (then === 'sniff') { setIdle('sniff', rand(1.5, 3)); return; }
    setIdle(isCat() && chance(0.3) ? 'stand' : 'sit', rand(1.5, 3));
  }

  // Your finger's treat or toy: what the pet does when it gets there.
  function reachLure() {
    const L = world.lure;
    if (world.hand === 'treat') { setState('beg'); faceCamera(); return; }
    if (isCat()) {
      // Wiggle, then pounce.
      setState('pounce', 0.45);
      buddy.leap = null;
      return;
    }
    if (isDog()) {
      buddy.carry = 'toy';
      sfx.squeak();
      setState('tug');
      return;
    }
    if (L) buddy.dir = norm2([L.p[0] - buddy.x, L.p[1] - buddy.y]);
    setState('nibble', 1.2);
  }

  function lureReach() {
    return world.hand === 'treat' ? spec().len * 0.6 : isCat() ? 0.42 : spec().len * 0.55;
  }

  function updateBuddy(dt) {
    const b = buddy;
    const s = save.stats;
    const L = world.lure && world.lure.live ? world.lure : null;
    b.timer -= dt;
    b.happyT -= dt;
    b.gazeT -= dt;
    b.xpCool -= dt;
    b.tapT -= dt;
    b.mouthT -= dt;
    b.earT -= dt;
    if (b.tapT <= 0) b.tapCount = 0;
    b.nextBlink -= dt;
    b.blink -= dt;
    if (b.nextBlink < 0) { b.blink = 0.12; b.nextBlink = rand(2, 5); }
    if (Math.random() < dt * 0.25) b.earT = 0.25;  // an ear twitch now and then
    if (clock - b.lastStroke > 1.2) b.petT = Math.max(0, b.petT - dt * 2);

    // Your finger's lure pulls it out of whatever it was doing.
    const busy = ['sleep', 'eat', 'fetch', 'appear', 'belly', 'hidden'].indexOf(b.state) !== -1;
    if (L && !busy && ['follow', 'pounce', 'tug', 'nibble', 'beg'].indexOf(b.state) === -1) {
      setState('follow');
      b.react = isCat() ? 0.15 : 0.05;
    }

    let moving = false;
    b.moving = 0;
    switch (b.state) {
      case 'hidden':
        return;
      case 'appear':
        faceCamera();
        if (b.timer <= 0) {
          if (save.asleep) setState('sleep');
          else setIdle('sit', 1.5);
        }
        break;
      case 'idle':
        if (b.act === 'sit' && b.tilt !== b.tiltTo && Math.random() < dt * 0.3) b.tiltTo = 0;
        if (b.timer <= 0) decide();
        break;
      case 'walk':
        moving = true;
        if (b.onArrive === 'eat' && !(world.treat && world.treat.landed)) b.onArrive = 'idle';
        if (moveToward(b.target[0], b.target[1], b.speed, dt)) arrive();
        break;
      case 'follow': {
        if (!L) { setIdle(isCat() ? 'stand' : 'sit', rand(1, 2)); break; }
        if (b.react > 0) { b.react -= dt; break; }
        const d = dist(L.p);
        const reach = lureReach();
        if (d < reach) { reachLure(); break; }
        moving = true;
        const sp = world.hand === 'treat' ? moves().walk * 1.4 : d > 0.8 ? moves().run : moves().run * 0.6;
        moveToward(L.p[0], L.p[1], sp, dt);
        break;
      }
      case 'beg': {
        // Sits pretty for the treat in your hand; takes it if you hold still.
        if (!L) { setIdle('sit', 1.5); break; }
        if (dist(L.p) > lureReach() + 0.25) { setState('follow'); break; }
        faceCamera();
        if (isCat() && Math.random() < dt * 0.8) speak();
        if (L.still > 1.1) handFeed();
        break;
      }
      case 'pounce': {
        const target = L ? L.p : null;
        if (!b.leap) {
          // crouch and wiggle…
          if (target) b.dir = norm2([target[0] - b.x, target[1] - b.y]);
          if (b.timer <= 0) {
            if (!target) { setIdle('stand', 1); break; }
            b.leap = { from: [b.x, b.y], to: target.slice(), t: 0 };
            sfx.pounce();
          }
        } else {
          // …then leap onto it.
          b.leap.t += dt / 0.3;
          const k = Math.min(1, b.leap.t);
          const p = clampSpot([b.leap.from[0] + (b.leap.to[0] - b.leap.from[0]) * k, b.leap.from[1] + (b.leap.to[1] - b.leap.from[1]) * k]);
          b.x = p[0];
          b.y = p[1];
          b.lift = Math.sin(Math.PI * k) * 26;
          b.moving = 1;
          b.phase += dt * 20;
          if (k >= 1) {
            b.lift = 0;
            P.bump(save, 'fun', 6);
            P.bump(save, 'energy', -1.5);
            if (b.xpCool <= 0) { b.xpCool = 0.8; gainXP(2); }
            if (L && dist(L.p) < 0.3) { setState('bat', 0.7); faceCamera(); } else setState('follow');
          }
        }
        break;
      }
      case 'bat':
        if (b.timer <= 0) {
          if (L && dist(L.p) > 0.3) setState('follow');
          else if (L) setState('bat', 0.6);
          else setIdle('sit', rand(1.5, 3));
        }
        break;
      case 'tug': {
        // Holds the toy and pulls against your finger.
        if (!L) { setState('shake', 1.1); faceCamera(); break; }
        const d = dist(L.p);
        const hold = spec().len * 0.5;
        if (d > hold + 0.04) {
          moving = true;
          const dir = norm2([L.p[0] - b.x, L.p[1] - b.y]);
          moveToward(L.p[0] - dir[0] * hold, L.p[1] - dir[1] * hold, moves().run * 0.8, dt);
        } else {
          b.dir = norm2([L.p[0] - b.x, L.p[1] - b.y]);
          b.phase -= dt * 3;  // braced legs, pulling back
          b.moving = 0.35;
        }
        P.bump(save, 'fun', dt * 5);
        if (Math.random() < dt * 0.9) sfx.squeak();
        if (b.xpCool <= 0) { b.xpCool = 1.2; gainXP(1); }
        break;
      }
      case 'shake':
        b.tilt = Math.sin(clock * 22) * 0.35;
        if (b.timer <= 0) {
          b.tilt = 0;
          b.carry = null;
          burst('heart', [b.x, b.y, spec().h], 2);
          setState('happy', 0.8);
        }
        break;
      case 'nibble':
        if (L) b.dir = norm2([L.p[0] - b.x, L.p[1] - b.y]);
        if (b.timer <= 0) {
          P.bump(save, 'fun', 8);
          P.bump(save, 'food', 2);
          if (b.xpCool <= 0) { b.xpCool = 0.8; gainXP(2); }
          if (L && dist(L.p) > lureReach() + 0.1) setState('follow');
          else if (L) setState('nibble', 1.2);
          else setState('happy', 0.9);
        }
        break;
      case 'chase': {
        const bl = world.ball;
        if (!bl || bl.held) { setIdle('sit', 1); break; }
        if (b.react > 0) { b.react -= dt; break; }
        moving = true;
        moveToward(bl.p[0], bl.p[1], moves().run, dt);
        const d = Math.hypot(bl.p[0] - b.x, bl.p[1] - b.y);
        const v = Math.hypot(bl.v[0], bl.v[1]);
        const reach = spec().len * 0.5 + 0.05;
        if (d < reach && bl.p[2] < 0.2 && v < 3) catchBall(bl);
        break;
      }
      case 'fetch':
        moving = true;
        if (moveToward(b.target[0], b.target[1], moves().walk * 1.5, dt)) {
          dropBall();
          world.ball.v = [0, 0, 0.8];
          P.bump(save, 'fun', 18);
          P.bump(save, 'energy', -4);
          save.fetches++;
          gainXP(8);
          sfx.happy();
          burst('heart', [b.x, b.y, spec().h], 3);
          setState('happy', 1.2);
        }
        break;
      case 'eat': {
        const t = world.treat;
        if (Math.floor(b.timer * 4) !== Math.floor((b.timer + dt) * 4)) {
          sfx.munch();
          if (t) {
            burst('crumb', [t.to[0], t.to[1], 0.03], 2);
            t.bites = Math.min(3, t.bites + 0.35);
          }
        }
        if (b.timer <= 0) {
          world.treat = null;
          P.bump(save, 'food', 28);
          P.bump(save, 'energy', 4);
          save.treats++;
          gainXP(5);
          burst('heart', [b.x, b.y, spec().h], 2);
          sfx.happy();
          setState('happy', 1);
        }
        break;
      }
      case 'sleep':
        save.asleep = true;
        P.bump(save, 'energy', 1.6 * dt);  // a nap in the app refills in about a minute
        b.zT -= dt;
        if (b.zT <= 0) { b.zT = 1.3; burst('z', [b.x + 0.05, b.y, spec().h * 0.6], 1); }
        if (s.energy >= 100) wake(`${save.name} woke up refreshed!`);
        break;
      case 'happy':
        if (isBunny()) {
          // a "binky": a happy twisting jump
          b.lift = Math.abs(Math.sin(b.timer * 7)) * 30;
          b.moving = 0;
        } else if (isDog()) {
          b.lift = Math.abs(Math.sin(b.timer * 10)) * 12;
        }
        if (b.timer <= 0) setIdle('sit', rand(1.5, 3));
        break;
      case 'react':
        if (b.timer <= 0) setIdle('sit', rand(1.5, 3));
        break;
      case 'belly':
        if (clock - b.lastStroke < 0.4) b.timer = Math.max(b.timer, 1.6);
        if (b.timer <= 0) { setIdle('sit', 2); b.petT = 0; }
        break;
      default:
        break;
    }
    if (!moving && b.state !== 'happy' && b.state !== 'pounce') b.lift *= Math.exp(-dt * 12);

    // A cat purrs while you stroke it.
    if (isCat() && clock - b.lastStroke < 0.5) {
      b.purrT -= dt;
      if (b.purrT <= 0) { b.purrT = 0.55; sfx.purr(); }
    }

    // Side views: which way it walks on screen (with a little hysteresis).
    if (b.screen) {
      const a = ar.project([b.x, b.y, 0]);
      const c = ar.project([b.x + b.dir[0] * 0.2, b.y + b.dir[1] * 0.2, 0]);
      if (a && c && Math.abs(c.x - a.x) > 3) b.face = c.x > a.x ? 1 : -1;
    }

    // Front views: eyes follow your finger, or wander a little.
    let g = b.gazeT > 0 ? b.gazeTo : 0;
    if (touch.id !== null && b.screen) g = clamp((touch.x - b.screen.x) / (b.screen.k * 80), -1, 1);
    else if (b.gazeT <= 0 && Math.random() < dt * 0.3) { b.gazeTo = rand(-1, 1); b.gazeT = rand(0.6, 1.5); }
    b.gaze += (g - b.gaze) * (1 - Math.exp(-dt * 8));
    if (b.state !== 'shake') b.tilt += (b.tiltTo - b.tilt) * (1 - Math.exp(-dt * 6));
  }

  function norm2(v) {
    const l = Math.hypot(v[0], v[1]) || 1;
    return [v[0] / l, v[1] / l];
  }

  function catchBall(bl) {
    const b = buddy;
    if (isDog()) {
      bl.held = true;
      b.carry = 'ball';
      sfx.pop();
      b.target = clampSpot(spotInView());
      setState('fetch');
      return;
    }
    // Cats bat it away, bunnies nudge it with their nose.
    const push = isCat() ? rand(0.8, 1.5) : rand(0.5, 0.8);
    const a = Math.atan2(b.dir[1], b.dir[0]) + (isCat() ? rand(-1.2, 1.2) : rand(-0.3, 0.3));
    bl.v = [Math.cos(a) * push, Math.sin(a) * push, isCat() ? 0.6 : 0.2];
    bl.rest = false;
    sfx.bounce();
    P.bump(save, 'fun', isCat() ? 8 : 6);
    if (b.xpCool <= 0) { b.xpCool = 0.8; gainXP(3); }
    b.bats++;
    if (isCat()) {
      setState('bat', 0.5);
      if (b.bats < 3) b.react = 0.6;
    } else {
      setState('happy', 0.9);
    }
  }

  function handFeed() {
    const L = world.lure;
    buddy.dir = norm2([L.p[0] - buddy.x, L.p[1] - buddy.y]);
    world.lure = null;
    world.hand = null;
    world.treat = { to: L.p.slice(), p: [L.p[0], L.p[1], 0.03], landed: true, bites: 0 };
    toast(`${save.name} ate from your hand!`);
    gainXP(3);
    setState('eat', isBunny() ? 2.6 : 2);
    updateDock();
  }

  /* ======================= Ball and treats ======================= */

  // Throw the ball along a floor direction so it first lands `d` meters out.
  function throwBall(dir, d) {
    const u = norm2(dir);
    const start = [u[0] * 0.25, u[1] * 0.25, ar.EYE - 0.3];
    const vz = 1.6 + clamp(d / 4, 0, 1) * 1.4;
    const T = (vz + Math.sqrt(vz * vz + 2 * G * (start[2] - BALL_R))) / G;
    const vh = Math.max(0.3, d - 0.25) / T;
    world.ball = { p: start, v: [u[0] * vh, u[1] * vh, vz], held: false, rest: false };
    world.hand = null;
    sfx.throw();
    updateDock();
    if (buddy.state === 'sleep') toast(`${save.name} is asleep…`);
    else if (isBunny() && chance(0.4)) toast(`${save.name} watches it roll`);
    else if (isCat() && save.stats.energy < 30) toast(`${save.name} can't be bothered`);
    else if (buddy.state !== 'hidden' && buddy.state !== 'eat') startChase(isCat() ? 0.5 : 0.2);
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

  // Drop a treat onto the floor where your finger let go.
  function dropTreat(spot) {
    spot = clampSpot(spot);
    world.treat = { from: [spot[0], spot[1], 0.18], to: spot, p: [spot[0], spot[1], 0.18], t: 0, dur: 0.22, landed: false, bites: 0 };
    world.hand = null;
    sfx.toss();
    updateDock();
  }

  function updateTreat(dt) {
    const t = world.treat;
    if (!t || t.landed) return;
    t.t += dt;
    const k = Math.min(1, t.t / t.dur);
    t.p = [t.to[0], t.to[1], t.from[2] + (0.015 - t.from[2]) * k * k];
    if (k >= 1) {
      t.landed = true;
      sfx.bounce();
      if (awake() && ['eat', 'fetch', 'tug'].indexOf(buddy.state) === -1) goTo(treatApproach(), moves().walk * 1.4, 'eat');
    }
  }

  function updateLure(dt) {
    const L = world.lure;
    if (!L) return;
    if (!L.live) {
      L.gone -= dt;
      if (L.gone <= 0) world.lure = null;
      return;
    }
    L.still += dt;
  }

  /* ======================= Rendering ======================= */

  function poseLook() {
    const b = buddy;
    const st = b.state;
    const petting = clock - b.lastStroke < 0.6;
    const s = save.stats;
    const o = {
      pose: 'front',
      moving: 0,
      phase: b.phase,
      headDown: 0,
      crouch: 0,
      hop: 0,
      eyes: 'open',
      mouth: 'closed',
      wag: isDog() ? 0.25 + s.fun / 250 : 0.15,
      tilt: b.tilt,
      pawUp: 0,
      gaze: b.gaze,
      earFlick: b.earT > 0 ? 1 : 0,
      dilate: 0,
      kick: 0,
      carry: b.carry,
    };
    const side = () => { o.pose = 'side'; };
    switch (st) {
      case 'walk': case 'chase': case 'fetch': case 'follow':
        side();
        o.moving = b.moving || (st === 'follow' && b.react > 0 ? 0 : 1);
        if (st === 'chase' || st === 'follow') { o.eyes = 'wide'; o.dilate = 1; o.wag = 1; }
        if (isDog() && (st === 'chase' || st === 'follow' || st === 'fetch')) o.mouth = b.carry ? 'closed' : 'pant';
        break;
      case 'idle':
        if (b.act === 'stand') side();
        else if (b.act === 'sniff') { side(); o.headDown = 1; }
        else if (b.act === 'lie') { o.pose = 'lie'; if (isCat()) o.eyes = 'happy'; }
        else if (b.act === 'groom') { o.pawUp = isDog() ? 0 : 1; o.eyes = 'closed'; if (isCat()) o.mouth = 'open'; }
        break;
      case 'eat': case 'nibble':
        side();
        o.headDown = 1;
        o.mouth = 'chew';
        o.wag = isDog() ? 0.9 : 0.2;
        break;
      case 'beg':
        o.pawUp = isCat() ? 0 : 2;
        o.eyes = 'wide';
        o.dilate = 0.8;
        o.wag = 1;
        if (isDog()) o.mouth = 'pant';
        break;
      case 'pounce':
        side();
        if (!b.leap) {
          o.crouch = 1;
          o.eyes = 'wide';
          o.dilate = 1;
          o.wag = 1.2;
        } else {
          o.moving = 1;
          o.dilate = 1;
        }
        break;
      case 'bat':
        o.pawUp = 1;
        o.eyes = 'wide';
        o.dilate = 1;
        o.wag = 1;
        break;
      case 'tug':
        side();
        o.moving = b.moving;
        o.crouch = 0.4;
        o.wag = 1;
        o.eyes = 'wide';
        break;
      case 'shake':
        o.wag = 1;
        o.eyes = 'happy';
        break;
      case 'sleep':
        o.pose = 'lie';
        o.eyes = 'closed';
        o.wag = 0;
        break;
      case 'belly':
        o.pose = 'belly';
        o.eyes = 'happy';
        o.kick = petting ? 1 : 0;
        o.wag = 1;
        break;
      case 'happy':
        o.eyes = 'happy';
        o.wag = 1;
        if (isDog()) o.mouth = 'pant';
        if (isBunny()) { side(); o.hop = 1; }
        break;
      case 'react':
        o.eyes = isBunny() ? 'wide' : 'open';
        o.wag = 0.9;
        break;
      default:
        break;
    }
    if (b.mouthT > 0) o.mouth = 'open';
    if (petting && awake()) {
      o.eyes = isCat() ? 'closed' : 'happy';
      o.wag = 1;
      if (isDog() && o.mouth === 'closed') o.mouth = 'pant';
    } else if (b.happyT > 0 || photoMode) {
      if (o.eyes === 'open') o.eyes = 'happy';
      if (isDog() && o.mouth === 'closed' && o.pose === 'front') o.mouth = 'pant';
    }
    if (o.eyes === 'open' && b.blink > 0 && !photoMode) o.eyes = 'closed';
    if (isBunny() && o.pose === 'side' && o.moving) o.hop = Math.max(0, Math.sin(b.phase));
    if (P.wish(save) === 'energy' && o.eyes === 'open' && st === 'idle') o.eyes = 'happy';
    return o;
  }

  function drawBuddy() {
    const b = buddy;
    const h = spec().h;
    const foot = ar.project([b.x, b.y, 0]);
    if (!foot) { b.screen = null; return; }
    const head = ar.project([b.x, b.y, h]);
    const k = ar.view.f * h / foot.depth / 100;
    const rot = head ? Math.atan2(head.x - foot.x, foot.y - head.y) : 0;
    const o = poseLook();
    const face = o.pose === 'front' ? 1 : b.face;
    b.screen = { x: foot.x, y: foot.y, k, rot, depth: foot.depth, pose: o.pose, face };

    // A soft shadow the shape of the animal. Side views are drawn across
    // the screen, so the shadow lies across the screen too.
    const v = ar.view;
    const across = norm2([v.right[0], v.right[1]]);
    const long = o.pose === 'front' ? spec().wid * 0.8 : spec().len * 0.5;
    const shrink = 1 - b.lift / 160;
    const cx = o.pose === 'front' ? 0 : spec().len * 0.08 * face;
    floorEllipse(b.x + across[0] * cx, b.y + across[1] * cx, long * shrink, spec().wid * 0.45 * shrink, across, 'rgba(15, 8, 4, 0.3)');

    let pop = 1;
    if (b.state === 'appear') {
      const x = clamp(1 - b.timer / 0.7, 0, 1);
      pop = 1 + 2.7 * Math.pow(x - 1, 3) + 1.7 * Math.pow(x - 1, 2);  // ease-out-back
    }

    ctx.save();
    ctx.translate(foot.x, foot.y);
    ctx.rotate(rot);
    ctx.scale(k * pop * face, k * pop);
    ctx.translate(0, -b.lift);
    if (b.state === 'happy' && isBunny()) ctx.rotate(Math.sin(b.timer * 7) * 0.25);
    A.drawPet(ctx, Object.assign({ species: save.species, coat: save.coat, t: clock }, o));
    ctx.restore();
  }

  function drawWish() {
    const b = buddy;
    const w = P.wish(save);
    if (!w || !b.screen || (b.state !== 'idle' && b.state !== 'walk')) return;
    const { x, y, k, rot } = b.screen;
    const up = 125 * k;
    const bx = x + Math.sin(rot) * up + 26 * k;
    const by = y - Math.cos(rot) * up + Math.sin(clock * 3) * 3;
    const r = clamp(18 * k, 14, 30);
    P.ellipse(ctx, bx - r * 0.9, by + r * 1.05, r * 0.18, r * 0.18, 0, '#FFFFFF');
    P.ellipse(ctx, bx, by, r, r * 0.85, 0, '#FFFFFF');
    ctx.strokeStyle = 'rgba(40,30,50,0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    if (w === 'food') A.treat(ctx, save.species, bx, by, r * 0.6);
    else if (w === 'fun') {
      if (isCat()) { P.ellipse(ctx, bx, by, r * 0.25, r * 0.25, 0, '#FF2A2A'); }
      else A.ball(ctx, bx, by, r * 0.45);
    } else {
      ctx.fillStyle = '#3A3050';
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
        floorEllipse(bl.p[0], bl.p[1], BALL_R, BALL_R, null, `rgba(15, 8, 4, ${shade})`);
        A.ball(ctx, s.x, s.y, ar.view.f * BALL_R / s.depth);
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
        if (t.landed) floorEllipse(t.to[0], t.to[1], 0.035, 0.02, null, 'rgba(15, 8, 4, 0.25)');
        const r = ar.view.f * 0.035 / s.depth * (1 - t.bites / 4);
        A.treat(ctx, save.species, s.x, s.y, r);
      },
    };
  }

  // The toy or treat under your finger.
  function drawLure() {
    const L = world.lure;
    if (!L) return null;
    const z = world.hand === 'treat' ? 0.04 : 0.015;
    const s = ar.project([L.p[0], L.p[1], z]);
    if (!s) return null;
    const alpha = L.live ? 1 : clamp(L.gone / 0.25, 0, 1);
    return {
      depth: s.depth,
      draw() {
        ctx.globalAlpha = alpha;
        if (world.hand === 'treat') {
          A.treat(ctx, save.species, s.x, s.y, ar.view.f * 0.035 / s.depth);
        } else if (isCat()) {
          // a laser dot: a hot centre and a soft red glow
          const r = ar.view.f * 0.012 / s.depth;
          const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r * 4);
          g.addColorStop(0, 'rgba(255,255,255,1)');
          g.addColorStop(0.18, 'rgba(255,40,40,1)');
          g.addColorStop(1, 'rgba(255,0,0,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(s.x, s.y, r * 4, 0, TAU);
          ctx.fill();
        } else if (!(isDog() && buddy.carry === 'toy')) {
          floorEllipse(L.p[0], L.p[1], 0.05, 0.02, null, 'rgba(15, 8, 4, 0.25)');
          A.toy(ctx, save.species, s.x, s.y, ar.view.f * 0.06 / s.depth);
        }
        ctx.globalAlpha = 1;
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
    floorEllipse(spot[0], spot[1], pulse, pulse, null, 'rgba(255,255,255,0.18)', '#FFFFFF', 3);
    floorEllipse(spot[0], spot[1], 0.03, 0.03, null, '#FFFFFF');
  }

  // Arrow at the screen edge pointing to the pet when it's out of view.
  function drawPointer() {
    const b = buddy;
    const v = ar.view;
    const s = b.screen;
    const onScreen = s && s.x > -30 && s.x < v.w + 30 && s.y > -30 && s.y < v.h + 60;
    if (onScreen) return true;
    const d = ar.screenDirection([b.x, b.y, spec().h / 2]);
    let dx = d.x;
    const dy = d.y;
    if (d.depth < 0.1) dx = Math.sign(dx || 1) * Math.max(Math.abs(dx), Math.abs(dy) + 1);
    const a = Math.atan2(dy, dx);
    const top = 110, bottom = v.h - 150, left = 36, right = v.w - 36;
    const cx = v.cx, cy = (top + bottom) / 2;
    const tx = Math.cos(a) > 0 ? (right - cx) / Math.cos(a) : Math.cos(a) < 0 ? (left - cx) / Math.cos(a) : Infinity;
    const ty = Math.sin(a) > 0 ? (bottom - cy) / Math.sin(a) : Math.sin(a) < 0 ? (top - cy) / Math.sin(a) : Infinity;
    const t = Math.min(tx, ty);
    const x = cx + Math.cos(a) * t, y = cy + Math.sin(a) * t;
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
    P.ellipse(ctx, x, y, 23, 23, 0, 'rgba(27,24,48,0.75)');
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, 22, 0, TAU);
    ctx.clip();
    ctx.translate(x, y + 2);
    ctx.scale(0.72, 0.72);
    A.drawFace(ctx, save.species, save.coat, { t: clock });
    ctx.restore();
    return false;
  }

  // What your finger is holding, shown by the dock until you use it.
  function drawHand() {
    if (!world.hand || world.lure) return;
    const v = ar.view;
    const y = v.h - 150 + Math.sin(clock * 4) * 5;
    if (world.hand === 'ball') A.ball(ctx, v.cx, y, 24);
    else if (world.hand === 'treat') A.treat(ctx, save.species, v.cx, y, 28);
    else if (isCat()) {
      P.ellipse(ctx, v.cx, y, 9, 9, 0, '#FF2A2A');
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 3;
      ctx.stroke();
    } else A.toy(ctx, save.species, v.cx, y, 32);
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
    [drawBall(), drawTreat(), drawLure()].forEach((it) => { if (it) items.push(it); });
    items.sort((a, b) => b.depth - a.depth);
    items.forEach((it) => it.draw());
    drawParts();

    if (photoMode) return true;
    drawWish();
    const seen = drawPointer();
    drawHand();
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
      updateLure(dt);
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

  const touch = { id: null, x: 0, y: 0, sx: 0, sy: 0, moved: 0, onPet: false, stroke: 0, samples: [], lastT: 0 };

  // Is the screen point on the pet? Checks the pose's outline box in the
  // pet's own (rotated, mirrored) drawing units.
  function hitPet(x, y) {
    const s = buddy.screen;
    if (!s || buddy.state === 'hidden') return false;
    const dx = x - s.x, dy = y - s.y;
    const c = Math.cos(-s.rot), sn = Math.sin(-s.rot);
    let lx = (dx * c - dy * sn) / s.k;
    const ly = (dx * sn + dy * c) / s.k + buddy.lift;
    if (s.face < 0) lx = -lx;
    const [x0, y0, x1, y1] = A.bounds(save.species, s.pose);
    const pad = Math.max(8, 30 / s.k);
    return lx > x0 - pad && lx < x1 + pad && ly > y0 - pad && ly < y1 + pad;
  }

  function onDown(e) {
    if (touch.id !== null) return;
    sfx.unlock();
    touch.id = e.pointerId;
    touch.x = touch.sx = e.clientX;
    touch.y = touch.sy = e.clientY;
    touch.moved = 0;
    touch.stroke = 0;
    touch.lastT = performance.now();
    touch.onPet = world.placed && !world.hand && hitPet(e.clientX, e.clientY);
    touch.samples = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
    if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
    if (world.placed && (world.hand === 'treat' || world.hand === 'toy')) moveLure(e.clientX, e.clientY);
  }

  // Put the treat or toy on the floor under your finger.
  function moveLure(x, y) {
    const spot = ar.floorAt(x, y);
    if (!spot) return;
    const p = clampSpot(spot);
    const L = world.lure;
    if (L && L.live) {
      if (Math.hypot(p[0] - L.p[0], p[1] - L.p[1]) > 0.02) L.still = 0;
      L.p = p;
    } else {
      world.lure = { p, live: true, still: 0, gone: 0 };
      if (world.hand === 'toy' && isDog()) sfx.squeak();
    }
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

    if (world.placed && (world.hand === 'treat' || world.hand === 'toy')) {
      moveLure(e.clientX, e.clientY);
      return;
    }
    if (touch.onPet && hitPet(e.clientX, e.clientY)) {
      stroke(Math.hypot(dx, dy), (now - touch.lastT) / 1000);
    } else if (!touch.onPet && !world.hand && touch.moved > 8) {
      ar.drag(dx, dy);
    }
    touch.lastT = now;
  }

  // Petting. Each kind likes it in its own way.
  function stroke(len, dt) {
    const b = buddy;
    b.lastStroke = clock;
    b.petT += Math.min(dt, 0.1);
    touch.stroke += len;
    if (!awake()) {
      if (touch.stroke > 70) { touch.stroke = 0; burst('heart', [b.x, b.y, spec().h * 0.8], 1); }
      return;
    }
    // Stop and enjoy it.
    if (b.state === 'walk' || b.state === 'idle' && b.act !== 'lie') {
      if (b.state === 'walk' || b.act === 'stand' || b.act === 'sniff') setIdle('sit', 2);
      b.timer = Math.max(b.timer, 1.5);
    }
    if (touch.stroke > 55) {
      touch.stroke = 0;
      burst('heart', [b.x, b.y, spec().h * 1.05], 1);
      if (!isCat()) sfx.purr();
      P.bump(save, 'fun', 2);
      if (b.xpCool <= 0) { b.xpCool = 0.6; gainXP(1); }
    }
    if (isDog() && b.petT > 2.2 && (b.state === 'idle' || b.state === 'react')) {
      setState('belly', 3);
      toast(`${save.name} rolled over for a belly rub!`);
      sfx.happy();
    } else if (isCat() && b.petT > 7) {
      b.petT = 0;
      b.lastStroke = -9;
      touch.onPet = false;
      sfx.hiss();
      toast(`${save.name} has had enough cuddles`);
      const away = norm2([b.x, b.y]);
      goTo([b.x + away[0] * 0.8 + rand(-0.4, 0.4), b.y + away[1] * 0.8 + rand(-0.4, 0.4)], moves().walk);
    } else if (isBunny() && b.petT > 3 && b.state === 'idle' && b.act !== 'lie') {
      setIdle('lie', 4);
      toast(`${save.name} flopped over. That means happy!`);
    }
  }

  function onUp(e) {
    if (e.pointerId !== touch.id) return;
    touch.id = null;
    const x = e.clientX, y = e.clientY;
    const tap = touch.moved < 12;

    if (world.placed && world.hand === 'treat') {
      const L = world.lure;
      if (L) { world.lure = null; dropTreat(L.p); }
      return;
    }
    if (world.placed && world.hand === 'toy') {
      if (world.lure) { world.lure.live = false; world.lure.gone = 0.25; }
      return;
    }
    if (world.hand === 'ball' && !touch.onPet) {
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
    if (['eat', 'fetch', 'belly', 'appear'].indexOf(buddy.state) !== -1) return;
    burst('ring', [spot[0], spot[1], 0], 1);
    sfx.tap();
    if (isCat() && chance(0.3)) { toast(`${save.name} doesn't feel like it`); return; }
    goTo(spot, moves().walk);
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
    faceCamera();
    buddy.lift = 0;
    buddy.carry = null;
    setState('appear', 0.7);
    burst('poof', [p[0], p[1], 0.1], 12);
    burst('heart', [p[0], p[1], spec().h], 3);
    sfx.pop();
    updateDock();
    toast(save.asleep ? `${save.name} is still napping` : `Hi, ${save.name}!`);
    if (!save.asleep) setTimeout(speak, 500);
  }

  function tapPet() {
    const b = buddy;
    if (b.state === 'sleep') { wake(`${save.name} woke up!`); return; }
    if (['chase', 'fetch', 'eat', 'appear', 'pounce', 'tug', 'belly'].indexOf(b.state) !== -1) return;
    b.tapCount++;
    b.tapT = 1.5;
    if (b.tapCount >= 6) {
      b.tapCount = 0;
      if (isCat()) { sfx.hiss(); toast(`${save.name} swats your finger. Too many pokes!`); setState('bat', 0.6); }
      else toast(`${save.name} is getting silly!`);
      return;
    }
    faceCamera();
    setState('react', 0.9);
    speak();
    if (isDog()) b.tiltTo = chance(0.5) ? 0.3 : -0.3;
    if (isBunny()) b.earT = 0.5;
    P.bump(save, 'fun', 3);
    burst('heart', [b.x, b.y, spec().h * 1.05], 1);
    if (b.xpCool <= 0) { b.xpCool = 0.6; gainXP(1); }
  }

  /* ======================= Actions ======================= */

  function needPlaced() {
    if (world.placed) return true;
    toast(`Tap the floor to put ${save.name} down first`);
    return false;
  }

  function setHand(what) {
    world.hand = world.hand === what ? null : what;
    world.lure = null;
    if (buddy.state === 'beg' || buddy.state === 'follow') setIdle('sit', 1);
    updateDock();
  }

  function onTreat() {
    if (!needPlaced()) return;
    sfx.tap();
    if (world.hand !== 'treat') {
      if (world.treat) { toast('There\'s already a treat out!'); return; }
      if (save.stats.food >= 95) { toast(`${save.name} is too full to eat`); return; }
    }
    setHand('treat');
  }

  function onToy() {
    if (!needPlaced()) return;
    sfx.tap();
    if (world.hand !== 'toy' && buddy.state === 'sleep') { toast(`${save.name} is asleep…`); return; }
    setHand('toy');
  }

  function onBall() {
    if (!needPlaced()) return;
    sfx.tap();
    if (world.hand === 'ball') {
      world.hand = null;
    } else if (world.ball && world.ball.held) {
      toast(`${save.name} has the ball!`);
      return;
    } else {
      if (world.ball && buddy.state === 'chase') setIdle('sit', 1);
      world.ball = null;
      world.hand = 'ball';
      world.lure = null;
      if (save.stats.energy < 15) toast(`${save.name} looks too tired to play`);
    }
    updateDock();
  }

  function onCall() {
    if (!needPlaced()) return;
    sfx.call();
    if (buddy.state === 'sleep') wake();
    if (['eat', 'fetch', 'tug', 'belly'].indexOf(buddy.state) !== -1) return;
    if (isCat() && chance(0.35)) {
      toast(`${save.name} heard you. And is ignoring you.`);
      buddy.earT = 0.4;
      return;
    }
    buddy.happyT = 0.6;
    goTo(spotInView(), isCat() ? moves().walk * 1.3 : moves().run * 0.7);
    if (isDog()) setTimeout(speak, 200);
    gainXP(1);
  }

  function onNap() {
    if (!needPlaced()) return;
    closeSheet('menu-sheet');
    if (buddy.state === 'sleep') { wake(`${save.name} woke up!`); return; }
    if (save.stats.energy > 80) { toast(`${save.name} isn't sleepy`); return; }
    goSleep();
  }

  /* ======================= Photos ======================= */

  let photoUrl = null;
  let photoFile = null;
  let photoB64 = null;

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

    const name = `pet-cam-${save.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'pet'}-${Date.now()}.jpg`;
    if (PC.host.canSavePhoto) {
      // The Android app saves and shares through the native side.
      const url = out.toDataURL('image/jpeg', 0.92);
      photoB64 = url.slice(url.indexOf(',') + 1);
      photoFile = { name };
      $('photo-img').src = url;
      $('photo-save').removeAttribute('href');
      $('photo-share').hidden = false;
      openSheet('photo-sheet');
      return;
    }
    out.toBlob((blob) => {
      if (!blob) return;
      if (photoUrl) URL.revokeObjectURL(photoUrl);
      photoUrl = URL.createObjectURL(blob);
      photoFile = new File([blob], name, { type: 'image/jpeg' });
      $('photo-img').src = photoUrl;
      $('photo-save').href = photoUrl;
      $('photo-save').download = name;
      const canShare = navigator.canShare && navigator.canShare({ files: [photoFile] });
      $('photo-share').hidden = !canShare;
      openSheet('photo-sheet');
    }, 'image/jpeg', 0.92);
  }

  async function sharePhoto() {
    if (!photoFile) return;
    if (PC.host.canSavePhoto) {
      if (!PC.host.sharePhoto(photoB64, photoFile.name)) toast('Couldn\'t share the photo');
      return;
    }
    try {
      await navigator.share({ files: [photoFile], title: `${save.name} on Pet Cam` });
    } catch (e) { /* cancelled */ }
  }

  function savePhoto(e) {
    if (!PC.host.canSavePhoto) return;  // the browser downloads it through the link
    e.preventDefault();
    if (!photoFile) return;
    PC.host.savePhoto(photoB64, photoFile.name);
  }

  /* ======================= Sheets and the back button ======================= */

  function syncOverlay() {
    PC.host.setOverlay(!$('photo-sheet').hidden || !$('menu-sheet').hidden || !!world.hand);
  }

  function openSheet(id) {
    $(id).hidden = false;
    syncOverlay();
  }

  function closeSheet(id) {
    $(id).hidden = true;
    syncOverlay();
  }

  // Android's back button: close whatever is open, one thing at a time.
  function handleBack() {
    if (!$('photo-sheet').hidden) closeSheet('photo-sheet');
    else if (!$('menu-sheet').hidden) closeSheet('menu-sheet');
    else if (world.hand) { world.hand = null; world.lure = null; updateDock(); }
  }

  /* ======================= HUD ======================= */

  let toastTimer = 0;
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  let lastHint = null;
  function updateHint() {
    let h = '';
    const touchMode = ar.view.mode === 'touch';
    if (!world.placed) {
      h = ar.floorAt(ar.view.cx, ar.view.cy)
        ? `Tap the floor to put ${save.name} down`
        : (touchMode ? 'Drag down to see the floor' : 'Tilt your phone down at the floor');
    } else if (world.hand === 'ball') {
      h = 'Flick up to throw!';
    } else if (world.hand === 'treat' && !world.lure) {
      h = `Put your finger on the floor. Hold still near ${save.name} to hand-feed`;
    } else if (world.hand === 'toy' && !world.lure) {
      h = isCat() ? 'Move the laser dot with your finger' : isDog() ? 'Drag the toy on the floor. Tug of war!' : 'Wave the leaf on the floor';
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
  }

  function updateDock() {
    const sp = save.species;
    $('treat-emoji').textContent = HAND.treat[sp][0];
    $('treat-label').textContent = HAND.treat[sp][1];
    $('toy-emoji').textContent = HAND.toy[sp][0];
    $('toy-label').textContent = HAND.toy[sp][1];
    $('btn-ball').classList.toggle('on', world.hand === 'ball');
    $('btn-treat').classList.toggle('on', world.hand === 'treat');
    $('btn-toy').classList.toggle('on', world.hand === 'toy');
    $('menu-nap').textContent = buddy.state === 'sleep' ? 'Wake up' : 'Nap time';
    syncOverlay();
  }

  function openMenu() {
    const lv = P.level(save);
    const days = Math.floor((Date.now() - save.born) / 86400000) + 1;
    $('menu-title').textContent = save.name;
    $('menu-stats').innerHTML = '';
    [
      `${A.coatOf(save.species, save.coat).label} ${spec().label.toLowerCase()} · day ${days}`,
      `Friendship ${lv.level} (${lv.into}/${lv.need} to next)`,
      `${save.fetches} fetches · ${save.treats} treats · ${save.photos} photos`,
      ar.view.mode === 'sensor' ? 'Move your phone to look around.' : 'No motion sensor: drag to look around.',
    ].forEach((line, i) => {
      if (i) $('menu-stats').appendChild(document.createElement('br'));
      $('menu-stats').appendChild(document.createTextNode(line));
    });
    $('menu-sound').textContent = `Sound: ${sfx.on ? 'on' : 'off'}`;
    updateDock();
    openSheet('menu-sheet');
  }

  /* ======================= Start ======================= */

  async function start() {
    sfx.unlock();
    // Both of these must be asked for straight from the tap.
    const sensorAsk = ar.requestSensorPermission();
    $('setup').hidden = true;
    $('stage').hidden = false;
    resize();
    updateDock();
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
    canvas.addEventListener('pointercancel', (e) => {
      if (e.pointerId !== touch.id) return;
      touch.id = null;
      if (world.lure) { world.lure.live = false; world.lure.gone = 0.25; }
    });
    window.addEventListener('resize', resize);
    $('cam').addEventListener('resize', resize);

    $('btn-treat').addEventListener('click', onTreat);
    $('btn-ball').addEventListener('click', onBall);
    $('btn-toy').addEventListener('click', onToy);
    $('btn-call').addEventListener('click', onCall);
    $('btn-photo').addEventListener('click', takePhoto);
    $('btn-menu').addEventListener('click', openMenu);

    $('photo-close').addEventListener('click', () => closeSheet('photo-sheet'));
    $('photo-share').addEventListener('click', sharePhoto);
    $('photo-save').addEventListener('click', savePhoto);

    $('menu-close').addEventListener('click', () => closeSheet('menu-sheet'));
    $('menu-nap').addEventListener('click', onNap);
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
      world.hand = null;
      world.lure = null;
      buddy.carry = null;
      setState('hidden');
      updateDock();
      closeSheet('menu-sheet');
    });
    $('menu-new').addEventListener('click', () => {
      if (!confirm(`Say goodbye to ${save.name} and adopt a new pet?`)) return;
      running = false;
      P.clear();
      ar.stopCamera();
      location.reload();
    });

    const hide = () => {
      if (!save || !running) return;
      P.save(save);
      ar.pauseCamera(true);
    };
    const show = () => {
      if (!save || !running) return;
      P.catchUp(save);
      ar.pauseCamera(false);
      lastT = performance.now();
      updateHud();
    };
    document.addEventListener('visibilitychange', () => (document.hidden ? hide() : show()));
    window.addEventListener('pagehide', () => { if (save && running) P.save(save); });
    PC.host.on('pause', hide);
    PC.host.on('resume', show);
    PC.host.on('back', handleBack);
    PC.host.on('photo-saved', (m) => toast(m.ok ? 'Saved to your photos' : 'Couldn\'t save the photo'));
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
    A.portrait($('welcome-pet'), save.species, save.coat, {
      eyes: save.asleep ? 'closed' : 'happy',
      mouth: save.species === 'dog' ? 'pant' : 'closed',
      wag: 1,
    });
    $('welcome-text').textContent = moodLine(save);
  }

  function showAdopt() {
    $('welcome-back').hidden = true;
    $('adopt').hidden = false;
    const pick = { species: 'dog', coat: 'golden' };
    const speciesList = $('species-list');
    const coatList = $('color-list');
    const nameInput = $('pet-name');
    speciesList.innerHTML = '';
    nameInput.placeholder = A.SPECIES.dog.name;

    const bigCanvases = {};
    Object.keys(A.SPECIES).forEach((k) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'species-btn';
      b.setAttribute('aria-pressed', String(k === pick.species));
      const c = document.createElement('canvas');
      c.width = 200;
      c.height = 200;
      c.setAttribute('aria-hidden', 'true');
      bigCanvases[k] = c;
      b.appendChild(c);
      b.appendChild(document.createTextNode(A.SPECIES[k].label));
      b.addEventListener('click', () => {
        const oldDefault = A.SPECIES[pick.species].name;
        pick.species = k;
        pick.coat = Object.keys(A.COATS[k])[0];
        speciesList.querySelectorAll('.species-btn').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        nameInput.placeholder = A.SPECIES[k].name;
        if (nameInput.value === oldDefault) nameInput.value = '';
        coats();
        sfx.tap();
      });
      speciesList.appendChild(b);
    });

    const paintBig = () => Object.keys(bigCanvases).forEach((k) => {
      A.portrait(bigCanvases[k], k, k === pick.species ? pick.coat : Object.keys(A.COATS[k])[0]);
    });

    // Coat choices for the chosen kind, each shown as a little face.
    function coats() {
      coatList.innerHTML = '';
      Object.keys(A.COATS[pick.species]).forEach((k) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'coat-btn';
        b.setAttribute('aria-pressed', String(k === pick.coat));
        const c = document.createElement('canvas');
        c.width = 120;
        c.height = 120;
        c.setAttribute('aria-hidden', 'true');
        const g = c.getContext('2d');
        g.translate(60, 66);
        g.scale(1.9, 1.9);
        A.drawFace(g, pick.species, k);
        b.appendChild(c);
        const label = document.createElement('span');
        label.textContent = A.COATS[pick.species][k].label;
        b.appendChild(label);
        b.addEventListener('click', () => {
          pick.coat = k;
          coatList.querySelectorAll('.coat-btn').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
          paintBig();
          sfx.tap();
        });
        coatList.appendChild(b);
      });
      paintBig();
    }
    coats();

    $('adopt').onsubmit = (e) => {
      e.preventDefault();
      const name = (nameInput.value.trim() || nameInput.placeholder).slice(0, 12);
      save = P.create({ name, species: pick.species, coat: pick.coat });
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
