/* Riftborn — the AR encounter. A creature steps out of a rift tear into
   your camera view. Two tools:
   - Darts: keep it in the crosshair (move your phone) and fire when the
     moving target lines up. Hits collect DNA and calm it down.
   - Rift Orbs: flick one up at it. Throw while the ring is small for a
     better chance. Calmer creatures are easier to catch.
   The encounter ends when you catch it, it flees, time runs out, or you
   leave. DNA you collected is yours either way. */
window.RB = window.RB || {};
(function (RB) {
  'use strict';

  const { clamp, rand, TAU, lerp } = RB.util;
  const C = RB.creatures;
  const S = RB.state;
  const ar = RB.ar;
  const sfx = RB.sfx;
  const $ = (id) => document.getElementById(id);

  const TIME = 75;         // seconds before it slips back into the Rift
  const G = 9.8;
  const ORB_R = 0.09;      // meters

  let E = null;            // current encounter
  let canvas = null, ctx = null, dpr = 1;

  /* ------------------ Setup ------------------ */

  function init() {
    canvas = $('ar-view');
    ctx = canvas.getContext('2d');
    bindInput();
    $('enc-dart').addEventListener('click', () => setMode('dart'));
    $('enc-orb').addEventListener('click', () => setMode('orb'));
    $('enc-fire').addEventListener('click', (e) => { e.stopPropagation(); fireDart(); });
    $('enc-run').addEventListener('click', () => leave());
    $('enc-done').addEventListener('click', () => finish());
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ar.resize(w, h);
  }

  async function start(spawn, done, opts) {
    const sp = C.byId(spawn.sp);
    const lvl = S.spawnLevel(spawn);
    const H = sp.size;
    const D = clamp(H * 2 + 2.5, 4.5, 17);
    E = {
      spawn, sp, lvl, done,
      H, D,
      fly: sp.plan === 'flyer',
      x: 0, y: D, alt: 0,
      vx: 0, vy: 0,
      face: 1,
      target: null, pause: 1.5, speedK: 1,
      t: 0, timeLeft: TIME,
      mode: S.save.items.darts > 0 ? 'dart' : 'orb',
      dna: 0, hits: 0, sed: 0,
      tgt: { u: 0, v: -0.55, tu: 0, tv: -0.55, tt: 0 },
      darts: [],
      orb: null,
      ring: 0,
      phase: 'appear', phaseT: 0,
      catchP: 0, wobbles: 0, willCatch: false,
      flash: 0, hurt: 0, mouth: 0, roarT: rand(4, 8),
      parts: [],
      msgs: [],
      result: null,
      bonusXP: 0,
    };
    $('ar-screen').hidden = false;
    $('enc-result').hidden = true;
    $('enc-name').textContent = sp.name;
    $('enc-meta').innerHTML = `<span style="color:${C.RARITY[sp.rar].color}">${C.RARITY[sp.rar].name}</span> · Lv ${lvl} · ${C.ELEMENTS[sp.el].icon} ${C.ELEMENTS[sp.el].name}`;
    setMode(E.mode);
    resize();
    hud();
    hint(E.mode === 'dart'
      ? 'Keep it in the crosshair. Fire when the target lines up.'
      : 'Flick an orb up at it. Throw when the ring is small.');

    if (opts.useCamera) {
      const r = await ar.startCamera($('cam'));
      if (!r.ok && E) hint(r.reason === 'denied' ? 'No camera access, so you see the Rift plain. Turn it on in your browser settings.' : 'No camera here, so you see the Rift plain.');
    }
    if (opts.sensors) { await opts.sensors; await ar.startSensors(); }
    if (!E) return;
    if (ar.view.mode === 'touch') hint('Drag to look around. ' + (E.mode === 'dart' ? 'Tap Fire when the target lines up.' : 'Flick an orb up at it.'));
    // Place it straight ahead of wherever you're looking now.
    const p = ar.spotAhead(D);
    E.x = p[0]; E.y = p[1];
    E.home = ar.heading();
    E.alt = E.fly ? H * 0.2 + 0.5 : 0;
    sfx.roar();
    E.mouth = 1;
  }

  function stop() {
    ar.stopCamera();
    $('ar-screen').hidden = true;
    E = null;
  }

  function setMode(m) {
    if (!E) return;
    E.mode = m;
    $('enc-dart').classList.toggle('on', m === 'dart');
    $('enc-orb').classList.toggle('on', m === 'orb');
    $('enc-fire').hidden = m !== 'dart';
    $('ar-screen').dataset.mode = m;
    hud();
  }

  function hud() {
    if (!E) return;
    $('enc-darts').textContent = S.save.items.darts;
    $('enc-orbs').textContent = S.save.items.orbs;
    $('enc-dna').textContent = `+${E.dna}`;
    $('enc-sed-bar').style.width = `${Math.round(E.sed / 0.6 * 100)}%`;
  }

  let hintTimer = null;
  function hint(text) {
    const el = $('enc-hint');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => el.classList.remove('show'), 4200);
  }

  function msg(text, x, y, color, big) {
    for (const m of E.msgs) m.y -= big ? 32 : 24;
    E.msgs.push({ text, x, y, color: color || '#FFFFFF', life: 1.2, big });
  }

  /* ------------------ Creature ------------------ */

  // Where on screen the creature is: its feet, and how many pixels one unit
  // of its body is (one unit = its height), plus the tilt of the view.
  function creatureScreen() {
    const g = ar.project([E.x, E.y, E.alt]);
    const top = ar.project([E.x, E.y, E.alt + E.H]);
    if (!g || !top) return null;
    const hpx = Math.hypot(top.x - g.x, top.y - g.y);
    const ang = Math.atan2(top.x - g.x, -(top.y - g.y));
    return { x: g.x, y: g.y, h: hpx, ang, depth: g.depth };
  }

  // A point on the body (in unit coordinates) → screen.
  function bodyPoint(cs, u, v) {
    const ux = u * E.face;
    const c = Math.cos(cs.ang), s = Math.sin(cs.ang);
    return [cs.x + (ux * c - v * s) * cs.h, cs.y + (ux * s + v * c) * cs.h];
  }

  function updateCreature(dt) {
    const e = E;
    if (e.phase !== 'free') return;
    e.speedK = lerp(e.speedK, 1, dt * 0.5);
    if (!e.target) {
      e.pause -= dt;
      if (e.pause <= 0) {
        // Wander within a cone in front of where it appeared.
        const h = e.home || [0, 1];
        const a = Math.atan2(h[1], h[0]) + rand(-0.22, 0.22);
        const d = e.D * rand(0.8, 1.2);
        e.target = [Math.cos(a) * d, Math.sin(a) * d];
      }
    } else {
      const dx = e.target[0] - e.x, dy = e.target[1] - e.y;
      const d = Math.hypot(dx, dy);
      const speed = (0.35 + e.H * 0.18) * e.speedK * (1 - e.sed * 0.8);
      if (d < 0.1) {
        e.target = null;
        e.pause = rand(0.8, 2.5);
        e.vx = e.vy = 0;
      } else {
        e.vx = dx / d * speed;
        e.vy = dy / d * speed;
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        const side = e.vx * ar.view.right[0] + e.vy * ar.view.right[1];
        if (Math.abs(side) > 0.05) e.face = side > 0 ? 1 : -1;
      }
    }
    // Roar now and then.
    e.roarT -= dt;
    if (e.roarT <= 0) { e.roarT = rand(6, 11); e.mouth = 1; sfx.roar(); }
    e.mouth = Math.max(0, e.mouth - dt * 0.9);
    // The dart target drifts over its body.
    const T = e.tgt;
    T.tt -= dt;
    if (T.tt <= 0) {
      T.tt = rand(0.6, 1.4) * (1 + e.sed);
      T.tu = rand(-0.4, 0.35);
      T.tv = e.fly ? rand(-0.72, -0.55) : rand(-0.8, -0.4);
    }
    const k = 1 - Math.exp(-dt * (2.4 - e.sed * 2));
    T.u = lerp(T.u, T.tu, k);
    T.v = lerp(T.v, T.tv, k);
  }

  /* ------------------ Darts ------------------ */

  function fireDart() {
    if (!E || E.phase !== 'free' || E.mode !== 'dart') return;
    if (E.darts.length > 1) return;
    if (!S.take('darts', 1)) { hint('Out of darts. Hack Rifts or open caches for more.'); sfx.error(); return; }
    S.save.stats.darts++;
    E.darts.push({ t: 0, dur: 0.18 });
    sfx.dart();
    hud();
  }

  function resolveDart() {
    const v = ar.view;
    const cs = creatureScreen();
    const cx = v.cx, cy = v.cy;
    if (!cs) { msg('Miss', cx, cy - 30, '#AAB'); sfx.miss(); return; }
    const tp = bodyPoint(cs, E.tgt.u, E.tgt.v);
    const rpx = cs.h * targetR();
    const d = Math.hypot(cx - tp[0], cy - tp[1]);
    if (d < rpx) {
      const bull = d < rpx * 0.4;
      const n = Math.round(C.RARITY[E.sp.rar].dna * (bull ? 2 : 1) * (1 + E.lvl / 40));
      E.dna += n;
      E.hits++;
      E.sed = Math.min(0.6, E.sed + (bull ? 0.12 : 0.07));
      E.hurt = 1;
      E.speedK = 1.8;
      E.tgt.tt = 0;
      msg(bull ? `Bullseye! +${n} DNA` : `+${n} DNA`, tp[0], tp[1] - 20, bull ? '#FFE14D' : '#7CF0C8', bull);
      for (let i = 0; i < (bull ? 16 : 9); i++) spark(tp[0], tp[1], C.ELEMENTS[E.sp.el].color);
      sfx.hit(bull);
    } else {
      // On the body but off target: it just flinches.
      const body = Math.hypot(cx - bodyPoint(cs, 0, -0.55)[0], cy - bodyPoint(cs, 0, -0.55)[1]) < cs.h * 0.45;
      msg(body ? 'Off target' : 'Miss', cx, cy - 34, '#C9C3E6');
      if (body) E.speedK = 1.4;
      sfx.miss();
    }
    hud();
  }

  const targetR = () => [0.17, 0.14, 0.12, 0.1][E.sp.rar] * (1 + E.sed * 0.5);

  /* ------------------ Orbs ------------------ */

  function throwOrb(vx, vy, x0) {
    if (!E || E.phase !== 'free' || E.orb) return;
    if (!S.take('orbs', 1)) { hint('Out of Rift Orbs. Hack Rifts or open caches for more.'); sfx.error(); return; }
    const v = ar.view;
    const h = ar.heading();
    // Sideways flick turns the throw; its speed sets the distance.
    let yaw = Math.atan2(h[1], h[0]) - (vx / Math.max(200, -vy)) * 0.55 - ((x0 - v.cx) / v.f) * 0.8;
    let dist = clamp(-vy / 150, 1.5, 32);
    // Aim assist: a throw that's pointed at the creature and strong enough
    // to reach it flies to it. Bigger creatures are easier to hit.
    const cd = Math.hypot(E.x, E.y);
    const ca = Math.atan2(E.y, E.x);
    const da = ((ca - yaw + Math.PI * 3) % TAU) - Math.PI;
    const tol = Math.max(0.1, Math.atan(E.H * 0.4 / cd)) + 0.06;
    let assisted = false;
    if (Math.abs(da) < tol && dist > cd * 0.6) {
      yaw += da;
      dist = cd;
      assisted = true;
    }
    const z0 = ar.EYE - 0.25;
    const tz = assisted ? E.alt + E.H * 0.45 : 0;
    const T = clamp(dist / 11, 0.45, 1.3);
    const p = [h[0] * 0.3, h[1] * 0.3, z0];
    E.orb = {
      p,
      v: [Math.cos(yaw) * dist / T, Math.sin(yaw) * dist / T, (tz - z0 + 0.5 * G * T * T) / T],
      spin: 0, life: 3, state: 'fly', ring: E.ring,
    };
    sfx.throw();
    hud();
  }

  function updateOrb(dt) {
    const o = E.orb;
    if (!o) return;
    o.spin += dt * 12;
    if (o.state === 'fly') {
      o.v[2] -= G * dt;
      for (let i = 0; i < 3; i++) o.p[i] += o.v[i] * dt;
      // Hit?
      const dx = o.p[0] - E.x, dy = o.p[1] - E.y;
      const rH = E.H * (E.fly ? 0.45 : 0.4) + ORB_R;
      if (E.phase === 'free' && Math.hypot(dx, dy) < rH && o.p[2] > E.alt - 0.1 && o.p[2] < E.alt + E.H * 1.02) {
        orbHit();
        return;
      }
      if (o.p[2] <= ORB_R) {
        o.p[2] = ORB_R;
        o.state = 'rest';
        o.life = 0.8;
        sfx.miss();
        const s = ar.project(o.p);
        if (s) msg('Missed', s.x, s.y - 30, '#C9C3E6');
      }
      o.life -= dt;
      if (o.life <= 0) E.orb = null;
    } else if (o.state === 'rest') {
      o.life -= dt;
      if (o.life <= 0) E.orb = null;
    }
  }

  function orbHit() {
    const o = E.orb;
    const r = o.ring;
    let bonus = 0, label = '';
    if (r < 0.45) { bonus = 1; label = 'Excellent!'; E.bonusXP = 100; }
    else if (r < 0.65) { bonus = 0.6; label = 'Great!'; E.bonusXP = 50; }
    else if (r < 0.85) { bonus = 0.3; label = 'Nice!'; E.bonusXP = 10; }
    E.catchP = catchChance(bonus);
    E.willCatch = Math.random() < E.catchP;
    E.wobbles = E.willCatch ? 3 : Math.floor(Math.random() * 3);
    E.phase = 'absorb';
    E.phaseT = 0;
    o.state = 'capture';
    o.p = [E.x, E.y, E.alt + E.H * 0.45];
    o.v = [0, 0, 0];
    const s = ar.project(o.p);
    if (s) {
      if (label) msg(label, s.x, s.y - 60, '#FFE14D', true);
      for (let i = 0; i < 18; i++) spark(s.x, s.y, '#FFFFFF');
    }
    E.flash = 0.6;
    sfx.absorb();
  }

  function catchChance(bonus) {
    const base = C.RARITY[E.sp.rar].catch;
    const p = base * (1 + bonus) * (1 + E.sed * 1.6) * (1 - E.lvl / 70);
    return clamp(p, 0.03, 0.97);
  }

  function updateCapture(dt) {
    const e = E;
    e.phaseT += dt;
    const o = e.orb;
    if (e.phase === 'absorb') {
      if (e.phaseT > 0.6) {
        e.phase = 'fall';
        e.phaseT = 0;
        o.v = [0, 0, 1.5];
      }
    } else if (e.phase === 'fall') {
      o.v[2] -= G * dt;
      o.p[2] += o.v[2] * dt;
      if (o.p[2] <= ORB_R) {
        o.p[2] = ORB_R;
        e.phase = 'wobble';
        e.phaseT = 0;
        e.wob = 0;
        sfx.wobble();
      }
    } else if (e.phase === 'wobble') {
      if (e.phaseT > 0.9) {
        e.phaseT = 0;
        e.wob++;
        if (e.wob >= e.wobbles) {
          if (e.willCatch) caught();
          else breakout();
        } else {
          sfx.wobble();
        }
      }
    }
  }

  function caught() {
    E.phase = 'caught';
    sfx.caught();
    const s = ar.project(E.orb.p);
    if (s) for (let i = 0; i < 30; i++) spark(s.x, s.y, i % 2 ? '#FFE14D' : C.ELEMENTS[E.sp.el].color);
    E.result = { caught: true };
    setTimeout(() => showResult(), 900);
  }

  function breakout() {
    const e = E;
    sfx.breakout();
    const s = ar.project(e.orb.p);
    if (s) for (let i = 0; i < 20; i++) spark(s.x, s.y, C.ELEMENTS[e.sp.el].color);
    e.orb = null;
    e.hurt = 1;
    e.mouth = 1;
    if (Math.random() < C.RARITY[e.sp.rar].flee) {
      flee('It broke free and fled back into the Rift!');
    } else {
      e.phase = 'free';
      const cs = creatureScreen();
      if (cs) msg('It broke free!', cs.x, cs.y - cs.h - 20, '#FF8A8A', true);
    }
  }

  function flee(text) {
    E.phase = 'flee';
    E.phaseT = 0;
    E.result = { fled: true, text };
    sfx.flee();
    setTimeout(() => showResult(), 1400);
  }

  /* ------------------ Result ------------------ */

  function showResult() {
    if (!E) return;
    const r = E.result;
    const out = S.finishEncounter(E.spawn, { caught: !!r.caught, fled: !!r.fled, dna: E.dna, bonusXP: E.bonusXP });
    E.final = out;
    const el = $('enc-result');
    const rc = C.RARITY[E.sp.rar];
    $('enc-result-title').textContent = r.caught ? `${E.sp.name} caught!` : 'It got away';
    $('enc-result-text').innerHTML = r.caught
      ? `<b style="color:${rc.color}">${rc.name}</b> · Level ${out.creature.lvl} · Power ${C.power(out.creature)}<br>+${E.dna + 25} ${E.sp.name} DNA · +${rc.xp + E.bonusXP} XP`
      : `${RB.util.esc(r.text || '')}<br>${E.dna ? `You kept +${E.dna} ${E.sp.name} DNA.` : 'Dart it next time to keep some DNA.'}`;
    const cv = $('enc-result-pic');
    C.portrait(cv, E.sp.id, { silhouette: !r.caught && !S.save.dex[E.sp.id]?.caught });
    el.hidden = false;
    if (out.up) RB.ui.levelUp(out.up);
  }

  function finish() {
    const e = E;
    if (!e) return;
    const res = e.final;
    stop();
    e.done(res);
  }

  // Leaving early keeps your DNA and leaves the creature on the map.
  function leave() {
    const e = E;
    if (!e) return;
    if (e.phase !== 'free' && e.phase !== 'appear') return;
    if (e.dna) S.finishEncounter(e.spawn, { dna: e.dna });
    stop();
    e.done(null);
  }

  /* ------------------ Loop ------------------ */

  function spark(x, y, color) {
    const a = Math.random() * TAU, s = rand(60, 260);
    E.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 80, life: rand(0.5, 1), max: 1, color, r: rand(2, 4.5) });
  }

  function update(dt) {
    if (!E) return;
    ar.update(dt);
    const e = E;
    e.t += dt;
    e.hurt = Math.max(0, e.hurt - dt * 3);
    e.flash = Math.max(0, e.flash - dt * 2);
    e.ring = 0.3 + 0.7 * (1 - ((e.t / 2.2) % 1));
    if (e.phase === 'appear') {
      e.phaseT += dt;
      if (e.phaseT > 1.3) { e.phase = 'free'; e.phaseT = 0; }
    } else if (e.phase === 'free') {
      e.timeLeft -= dt;
      if (e.timeLeft <= 0) flee('Time ran out. It slipped back into the Rift.');
    } else if (e.phase === 'flee') {
      e.phaseT += dt;
    } else if (e.phase !== 'caught') {
      updateCapture(dt);
    }
    updateCreature(dt);
    updateOrb(dt);
    for (const d of e.darts) d.t += dt;
    const landed = e.darts.filter((d) => d.t >= d.dur);
    if (landed.length) { e.darts = e.darts.filter((d) => d.t < d.dur); landed.forEach(resolveDart); }
    for (const p of e.parts) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 400 * dt; }
    e.parts = e.parts.filter((p) => p.life > 0);
    for (const m of e.msgs) { m.life -= dt; m.y -= 30 * dt; }
    e.msgs = e.msgs.filter((m) => m.life > 0);
    $('enc-timer-bar').style.width = `${clamp(e.timeLeft / TIME, 0, 1) * 100}%`;
    render();
  }

  function drawRiftTear(x, y, h, open, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.shadowColor = color;
    ctx.shadowBlur = 30;
    const w = h * 0.35 * open;
    const g = ctx.createRadialGradient(0, 0, 1, 0, 0, h * 0.6);
    g.addColorStop(0, '#FFFFFF');
    g.addColorStop(0.3, color);
    g.addColorStop(1, color + '00');
    ctx.fillStyle = g;
    ctx.globalAlpha = open;
    ctx.beginPath();
    ctx.moveTo(0, -h * 0.6);
    ctx.quadraticCurveTo(w, 0, 0, h * 0.6);
    ctx.quadraticCurveTo(-w, 0, 0, -h * 0.6);
    ctx.fill();
    ctx.restore();
  }

  function drawOrb(p, spin, wob) {
    const s = ar.project(p);
    if (!s) return;
    const r = Math.max(4, ar.view.f * ORB_R / s.depth);
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(wob || 0);
    const col = S.faction().color;
    ctx.shadowColor = col;
    ctx.shadowBlur = 18;
    const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
    g.addColorStop(0, '#FFFFFF');
    g.addColorStop(0.35, col);
    g.addColorStop(1, '#1A0E30');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#120A1C';
    ctx.lineWidth = Math.max(1.5, r * 0.12);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
    ctx.rotate(spin);
    ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.stroke();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath(); ctx.arc(0, 0, r * 0.25, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function render() {
    const v = ar.view;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, v.w, v.h);
    if (!v.camera) ar.drawBackdrop(ctx, E.t);
    const e = E;
    const cs = creatureScreen();
    const elc = C.ELEMENTS[e.sp.el].color;

    // Rift tear it came out of / flees into.
    if (cs && (e.phase === 'appear' || e.phase === 'flee')) {
      const open = e.phase === 'appear' ? Math.sin(Math.min(1, e.phaseT / 1.3) * Math.PI) : Math.sin(Math.min(1, e.phaseT / 1.2) * Math.PI);
      drawRiftTear(cs.x, cs.y - cs.h * 0.55, cs.h * 1.3, open, elc);
    }

    // The creature.
    let alpha = 1, scale = 1;
    if (e.phase === 'appear') alpha = clamp(e.phaseT / 0.9, 0, 1);
    if (e.phase === 'flee') alpha = clamp(1 - e.phaseT / 0.9, 0, 1);
    if (e.phase === 'absorb') { scale = 1 - clamp(e.phaseT / 0.5, 0, 1); }
    const hidden = e.phase === 'fall' || e.phase === 'wobble' || e.phase === 'caught';
    if (cs && !hidden && scale > 0.02) {
      if (e.fly) {
        const gs = ar.project([e.x, e.y, 0]);
        if (gs) {
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          ctx.beginPath(); ctx.ellipse(gs.x, gs.y, cs.h * 0.3, cs.h * 0.06, 0, 0, TAU); ctx.fill();
        }
      }
      ctx.save();
      ctx.translate(cs.x, cs.y);
      ctx.rotate(cs.ang);
      const pull = e.phase === 'absorb' ? cs.h * 0.45 * (1 - scale) : 0;
      C.draw(ctx, e.sp.id, {
        x: 0, y: -pull, h: cs.h * scale, t: e.t, walk: Math.min(1, Math.hypot(e.vx, e.vy) * 1.2),
        phase: e.t * (5 + Math.hypot(e.vx, e.vy) * 2), face: e.face, mouth: e.mouth,
        tint: Math.max(e.hurt * 0.6, e.phase === 'absorb' ? 0.8 : 0), tintCol: e.phase === 'absorb' ? '#FFFFFF' : '#FF5A5A',
        alpha, shadow: !e.fly, seed: 3,
      });
      ctx.restore();

      // Dart target
      if (e.mode === 'dart' && e.phase === 'free') {
        const tp = bodyPoint(cs, e.tgt.u, e.tgt.v);
        const r = cs.h * targetR();
        ctx.save();
        ctx.strokeStyle = '#FFE14D';
        ctx.fillStyle = 'rgba(255,225,77,0.14)';
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(tp[0], tp[1], r, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(tp[0], tp[1], r * 0.4, 0, TAU); ctx.stroke();
        ctx.restore();
      }
      // Capture ring
      if (e.mode === 'orb' && e.phase === 'free') {
        const c = bodyPoint(cs, 0, e.fly ? -0.62 : -0.5);
        const R = cs.h * 0.55;
        const pc = catchChance(0);
        const col = pc > 0.4 ? '#5CFF8A' : pc > 0.2 ? '#FFE14D' : '#FF6A5A';
        ctx.save();
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath(); ctx.arc(c[0], c[1], R, 0, TAU); ctx.stroke();
        ctx.strokeStyle = col;
        ctx.shadowColor = col;
        ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.arc(c[0], c[1], R * e.ring, 0, TAU); ctx.stroke();
        ctx.restore();
      }
    }

    // Orb
    if (e.orb && e.orb.state !== 'capture') drawOrb(e.orb.p, e.orb.spin);
    if (e.orb && e.orb.state === 'capture' && e.phase !== 'absorb') {
      const w = e.phase === 'wobble' ? Math.sin(e.phaseT / 0.9 * Math.PI * 2) * 0.4 * Math.max(0, 1 - e.phaseT / 0.6) : 0;
      drawOrb(e.orb.p, 0, w);
      if (e.phase === 'caught') {
        const s = ar.project(e.orb.p);
        if (s) {
          ctx.fillStyle = '#FFE14D';
          ctx.font = '700 22px "Chakra Petch", system-ui';
          ctx.textAlign = 'center';
          ctx.fillText('★', s.x, s.y - 26 - Math.sin(e.t * 6) * 3);
        }
      }
    }

    // Darts in flight, from the bottom of the screen to the crosshair.
    for (const d of e.darts) {
      const k = d.t / d.dur;
      const x = lerp(v.cx + 40, v.cx, k), y = lerp(v.h + 20, v.cy, k);
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 3 * (1 - k) + 1;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 6 * (1 - k), y + 26 * (1 - k)); ctx.stroke();
    }

    // Crosshair (dart mode)
    if (e.mode === 'dart' && e.phase === 'free') {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 2;
      const R = 18;
      ctx.beginPath(); ctx.arc(v.cx, v.cy, R, 0, TAU); ctx.stroke();
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(v.cx + Math.cos(a) * (R + 4), v.cy + Math.sin(a) * (R + 4));
        ctx.lineTo(v.cx + Math.cos(a) * (R + 14), v.cy + Math.sin(a) * (R + 14));
        ctx.stroke();
      }
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath(); ctx.arc(v.cx, v.cy, 2.5, 0, TAU); ctx.fill();
      ctx.restore();
    }

    // Orb ready in hand
    if (e.mode === 'orb' && e.phase === 'free' && !e.orb && S.save.items.orbs > 0) {
      const y = v.h - 120 - (drag ? 0 : Math.sin(e.t * 3) * 4);
      const x = drag ? drag.x : v.cx;
      const yy = drag ? drag.y : y;
      ctx.save();
      const r = 30;
      const col = S.faction().color;
      ctx.shadowColor = col;
      ctx.shadowBlur = 20;
      const g = ctx.createRadialGradient(x - 9, yy - 9, 3, x, yy, r);
      g.addColorStop(0, '#FFFFFF');
      g.addColorStop(0.35, col);
      g.addColorStop(1, '#1A0E30');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, yy, r, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#120A1C';
      ctx.lineWidth = 3.5;
      ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - r, yy); ctx.lineTo(x + r, yy); ctx.stroke();
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath(); ctx.arc(x, yy, 8, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.restore();
    }

    // Off-screen arrow
    if (!cs || cs.x < -40 || cs.x > v.w + 40 || cs.y < -40 || cs.y > v.h + 40) {
      const d = ar.screenDirection([e.x, e.y, e.alt + e.H * 0.5]);
      let ax = d.x, ay = d.y;
      if (d.depth < 0 && Math.hypot(ax, ay) < 1e-3) ax = 1;
      const a = Math.atan2(ay, ax);
      const R = Math.min(v.w, v.h) * 0.38;
      const x = v.cx + Math.cos(a) * R, y = v.cy + Math.sin(a) * R;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      ctx.fillStyle = elc;
      ctx.shadowColor = elc;
      ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.moveTo(22, 0); ctx.lineTo(-10, -16); ctx.lineTo(-4, 0); ctx.lineTo(-10, 16); ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    // Particles and floating text
    for (const p of e.parts) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    for (const m of e.msgs) {
      ctx.globalAlpha = clamp(m.life / 0.4, 0, 1);
      ctx.font = `700 ${m.big ? 26 : 18}px "Chakra Petch", system-ui, sans-serif`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(10,5,20,0.8)';
      ctx.strokeText(m.text, m.x, m.y);
      ctx.fillStyle = m.color;
      ctx.fillText(m.text, m.x, m.y);
    }
    ctx.globalAlpha = 1;

    if (e.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${e.flash * 0.6})`;
      ctx.fillRect(0, 0, v.w, v.h);
    }
  }

  /* ------------------ Input ------------------ */

  let drag = null;

  function bindInput() {
    let look = null;
    canvas.addEventListener('pointerdown', (e) => {
      if (!E) return;
      canvas.setPointerCapture(e.pointerId);
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      if (E.mode === 'orb' && E.phase === 'free' && !E.orb && y > ar.view.h * 0.45) {
        drag = { x, y, id: e.pointerId, hist: [[x, y, performance.now()]] };
        return;
      }
      look = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: false };
    });
    canvas.addEventListener('pointermove', (e) => {
      if (drag && e.pointerId === drag.id) {
        const r = canvas.getBoundingClientRect();
        drag.x = e.clientX - r.left;
        drag.y = e.clientY - r.top;
        drag.hist.push([drag.x, drag.y, performance.now()]);
        if (drag.hist.length > 8) drag.hist.shift();
        return;
      }
      if (look && e.pointerId === look.id) {
        const dx = e.clientX - look.x, dy = e.clientY - look.y;
        if (Math.hypot(dx, dy) > 4) look.moved = true;
        ar.drag(dx, dy);
        look.x = e.clientX;
        look.y = e.clientY;
      }
    });
    const up = (e) => {
      if (drag && e.pointerId === drag.id) {
        const h = drag.hist;
        const now = performance.now();
        const old = h.find((p) => now - p[2] < 120) || h[0];
        const last = h[h.length - 1];
        const dt = Math.max(0.016, (last[2] - old[2]) / 1000);
        const vx = (last[0] - old[0]) / dt, vy = (last[1] - old[1]) / dt;
        const x0 = drag.x;
        drag = null;
        if (vy < -250 && e.type === 'pointerup') throwOrb(vx, vy, x0);
        return;
      }
      if (look && e.pointerId === look.id) {
        if (!look.moved && e.type === 'pointerup' && E && E.mode === 'dart') fireDart();
        look = null;
      }
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
  }

  RB.encounter = {
    init, start, stop, update, resize, leave,
    get active() { return !!E; },
    get current() { return E; },   // for tests
  };
})(window.RB);
