/* Riftborn — the AR encounter. A creature steps out of a rift tear and
   stands in your room as a live 3D model, lit and casting a soft shadow on
   your real floor. Two tools:
   - Darts: keep it in the crosshair (move your phone) and fire when the
     moving target lines up. Hits collect DNA and calm it down.
   - Rift Orbs: flick one up at it. Throw while the ring is small for a
     better chance. Calmer creatures are easier to catch.
   The encounter ends when you catch it, it flees, time runs out, or you
   leave. DNA you collected is yours either way.

   AR world coordinates are meters: x east, y north, z up (see ar.js). The
   3D scene uses three.js axes, so a point [x, y, z] sits at (x, z, -y). */
window.RB = window.RB || {};
(function (RB) {
  'use strict';

  const T = window.THREE;
  const { clamp, rand, TAU, lerp } = RB.util;
  const C = RB.creatures;
  const S = RB.state;
  const GX = RB.gfx;
  const ar = RB.ar;
  const sfx = RB.sfx;
  const $ = (id) => document.getElementById(id);

  const TIME = 75;         // seconds before it slips back into the Rift
  const G = 9.8;
  const ORB_R = 0.09;      // meters

  let E = null;            // current encounter
  let canvas = null, ctx = null, dpr = 1;
  let scene = null, camera = null, renderer = null, sun = null, hemi = null, catcher = null, plain = null, tear = null, orbMesh = null;

  const to3 = (p) => new T.Vector3(p[0], p[2], -p[1]);
  const from3 = (v) => [v.x, -v.z, v.y];

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

  function buildScene() {
    if (scene) return;
    renderer = GX.main();
    scene = new T.Scene();
    scene.environment = GX.environment(renderer);
    camera = new T.PerspectiveCamera(60, 1, 0.05, 600);
    hemi = new T.HemisphereLight('#EEF2FF', '#6A5A48', 1.3);
    scene.add(hemi);
    sun = new T.DirectionalLight('#FFF6EA', 2.2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
    scene.add(sun, sun.target);
    // Soft contact shadow on your real floor.
    catcher = new T.Mesh(new T.PlaneGeometry(60, 60), new T.ShadowMaterial({ opacity: 0.4 }));
    catcher.rotation.x = -Math.PI / 2;
    catcher.receiveShadow = true;
    scene.add(catcher);
    // The Rift plain, when there's no camera.
    plain = new T.Group();
    const c = GX.canvas(256, 256), g = c.getContext('2d');
    g.fillStyle = '#150E28';
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(170,120,255,0.55)';
    g.lineWidth = 3;
    g.strokeRect(0, 0, 256, 256);
    const gt = GX.texture(c);
    gt.wrapS = gt.wrapT = T.RepeatWrapping;
    gt.repeat.set(100, 100);
    gt.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const floor = new T.Mesh(new T.PlaneGeometry(400, 400), new T.MeshStandardMaterial({ map: gt, roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(1.3, -0.01, 0.7);
    floor.receiveShadow = true;
    plain.add(floor);
    const N = 400, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const a = Math.random() * TAU, e = 0.05 + Math.random() * 1.4;
      pos.set([Math.cos(a) * Math.cos(e) * 250, Math.sin(e) * 250, Math.sin(a) * Math.cos(e) * 250], i * 3);
    }
    const sg = new T.BufferGeometry();
    sg.setAttribute('position', new T.BufferAttribute(pos, 3));
    plain.add(new T.Points(sg, new T.PointsMaterial({ color: '#FFFFFF', size: 1.4, sizeAttenuation: false, fog: false })));
    scene.add(plain);
    tear = new T.Sprite(new T.SpriteMaterial({ map: GX.glow(), color: '#FFFFFF', transparent: true, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false }));
    scene.add(tear);
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ar.resize(w, h);
    if (renderer) GX.fit();
  }

  async function start(spawn, done, opts) {
    buildScene();
    const sp = C.byId(spawn.sp);
    const lvl = S.spawnLevel(spawn);
    const H = sp.size;
    const D = clamp(H * 2 + 2.5, 4.5, 17);
    const inst = RB.beasts.instance(sp.id, { own: true });
    scene.add(inst.root);
    if (orbMesh) scene.remove(orbMesh);
    orbMesh = RB.props.orb(S.faction().color);
    orbMesh.scale.setScalar(ORB_R);
    orbMesh.visible = false;
    scene.add(orbMesh);
    E = {
      spawn, sp, lvl, done, inst,
      H, D,
      fly: sp.plan === 'flyer',
      x: 0, y: D, alt: 0,
      vx: 0, vy: 0,
      yaw: Math.PI,
      target: null, pause: 1.5, speedK: 1,
      t: 0, timeLeft: TIME,
      mode: S.save.items.darts > 0 ? 'dart' : 'orb',
      dna: 0, hits: 0, sed: 0,
      tgt: { bone: 0, cur: null, tt: 0, off: new T.Vector3() },
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
    GX.attach($('ar-gl'));
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
    resize();
    if (ar.view.mode === 'touch') hint('Drag to look around. ' + (E.mode === 'dart' ? 'Tap Fire when the target lines up.' : 'Flick an orb up at it.'));
    // Place it straight ahead of wherever you're looking now, facing you.
    const p = ar.spotAhead(D);
    E.x = p[0]; E.y = p[1];
    E.home = ar.heading();
    E.alt = E.fly ? H * 0.2 + 0.5 : 0;
    E.yaw = Math.atan2(-E.x, E.y);
    sfx.roar(E.H);
    E.mouth = 1;
  }

  function stop() {
    ar.stopCamera();
    $('ar-screen').hidden = true;
    if (E) { scene.remove(E.inst.root); E.inst.dispose(); }
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

  // A body point on screen: { x, y, depth } or null.
  function screenOf(v3) { return ar.project(from3(v3)); }

  function bodyCenter() {
    return E.inst.bones.hip.getWorldPosition(new T.Vector3());
  }

  function updateCreature(dt) {
    const e = E;
    e.mouth = Math.max(0, e.mouth - dt * 0.9);
    let speed = 0;
    if (e.phase === 'free') {
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
        // Idle: turn to face you.
        const want = Math.atan2(-e.x, e.y);
        const diff = ((want - e.yaw + Math.PI * 3) % TAU) - Math.PI;
        e.yaw += diff * Math.min(1, dt * 1.5);
      } else {
        const dx = e.target[0] - e.x, dy = e.target[1] - e.y;
        const d = Math.hypot(dx, dy);
        speed = (0.35 + e.H * 0.18) * e.speedK * (1 - e.sed * 0.8);
        if (d < 0.1) {
          e.target = null;
          e.pause = rand(0.8, 2.5);
          e.vx = e.vy = 0;
          speed = 0;
        } else {
          e.vx = dx / d * speed;
          e.vy = dy / d * speed;
          e.x += e.vx * dt;
          e.y += e.vy * dt;
          const want = Math.atan2(e.vx, -e.vy);
          const diff = ((want - e.yaw + Math.PI * 3) % TAU) - Math.PI;
          e.yaw += diff * Math.min(1, dt * 5);
        }
      }
      // Roar now and then.
      e.roarT -= dt;
      if (e.roarT <= 0) { e.roarT = rand(6, 11); e.mouth = 1; sfx.roar(E.H); }
      // The dart target hops between body parts.
      const T0 = e.tgt;
      T0.tt -= dt;
      if (T0.tt <= 0) {
        T0.tt = rand(0.6, 1.4) * (1 + e.sed);
        T0.bone = Math.floor(Math.random() * e.inst.targets.length);
        T0.off.set(rand(-0.05, 0.05), rand(-0.05, 0.08), rand(-0.05, 0.05)).multiplyScalar(e.H);
      }
    }
    const inst = e.inst;
    inst.root.position.copy(to3([e.x, e.y, e.alt + (e.fly ? Math.sin(e.t * 2) * 0.12 : 0)]));
    inst.root.rotation.y = e.yaw;
    inst.update(dt, { speed: e.phase === 'free' ? speed : 0, mouth: e.mouth, flap: e.fly ? 0.4 : 0 });
    if (e.phase === 'free' || e.phase === 'appear' || e.phase === 'flee') {
      const want = e.inst.targets[e.tgt.bone].getWorldPosition(new T.Vector3()).add(e.tgt.off);
      if (!e.tgt.cur) e.tgt.cur = want.clone();
      e.tgt.cur.lerp(want, 1 - Math.exp(-dt * (5 - e.sed * 4)));
    }
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

  const targetR = () => [0.17, 0.14, 0.12, 0.1][E.sp.rar] * (1 + E.sed * 0.5);

  function targetScreen() {
    if (!E.tgt.cur) return null;
    const s = screenOf(E.tgt.cur);
    if (!s) return null;
    return { x: s.x, y: s.y, r: ar.view.f * E.H * targetR() * 0.75 / s.depth };
  }

  function resolveDart() {
    const v = ar.view;
    const cx = v.cx, cy = v.cy;
    const ts = targetScreen();
    if (!ts) { msg('Miss', cx, cy - 30, '#AAB'); sfx.miss(); return; }
    const d = Math.hypot(cx - ts.x, cy - ts.y);
    if (d < ts.r) {
      const bull = d < ts.r * 0.4;
      const n = Math.round(C.RARITY[E.sp.rar].dna * (bull ? 2 : 1) * (1 + E.lvl / 40));
      E.dna += n;
      E.hits++;
      E.sed = Math.min(0.6, E.sed + (bull ? 0.12 : 0.07));
      E.hurt = 1;
      E.speedK = 1.8;
      E.tgt.tt = 0;
      msg(bull ? `Bullseye! +${n} DNA` : `+${n} DNA`, ts.x, ts.y - 20, bull ? '#FFE14D' : '#7CF0C8', bull);
      for (let i = 0; i < (bull ? 16 : 9); i++) spark(ts.x, ts.y, C.ELEMENTS[E.sp.el].color);
      sfx.hit(bull);
    } else {
      // On the body but off target: it just flinches.
      const c = screenOf(bodyCenter());
      const body = c && Math.hypot(cx - c.x, cy - c.y) < v.f * E.H * 0.4 / c.depth;
      msg(body ? 'Off target' : 'Miss', cx, cy - 34, '#C9C3E6');
      if (body) E.speedK = 1.4;
      sfx.miss();
    }
    hud();
  }

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
    const Tt = clamp(dist / 11, 0.45, 1.3);
    E.orb = {
      p: [h[0] * 0.3, h[1] * 0.3, z0],
      v: [Math.cos(yaw) * dist / Tt, Math.sin(yaw) * dist / Tt, (tz - z0 + 0.5 * G * Tt * Tt) / Tt],
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
      const c = screenOf(bodyCenter());
      if (c) msg('It broke free!', c.x, c.y - ar.view.f * e.H / c.depth * 0.7, '#FF8A8A', true);
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
    const out = S.finishEncounter(E.spawn, { caught: !!r.caught, fled: !!r.fled, dna: E.dna, hits: E.hits, bonusXP: E.bonusXP });
    E.final = out;
    const el = $('enc-result');
    const rc = C.RARITY[E.sp.rar];
    $('enc-result-title').textContent = r.caught ? `${E.sp.name} caught!` : 'It got away';
    $('enc-result-text').innerHTML = r.caught
      ? `<b style="color:${rc.color}">${rc.name}</b> · Level ${out.creature.lvl} · Power ${C.power(out.creature)}<br>+${E.dna + 25} ${E.sp.name} DNA · +${rc.xp + E.bonusXP + out.weatherXP} XP${out.weatherXP ? ' (weather boost)' : ''}`
      : `${RB.util.esc(r.text || '')}<br>${E.dna ? `You kept +${E.dna} ${E.sp.name} DNA.` : 'Dart it next time to keep some DNA.'}`;
    el.hidden = false;
    RB.beasts.portrait($('enc-result-pic'), E.sp.id, { silhouette: !r.caught && !(S.save.dex[E.sp.id] && S.save.dex[E.sp.id].caught) });
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
    if (e.dna) S.finishEncounter(e.spawn, { dna: e.dna, hits: e.hits });
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
    matchLight(dt);
    render3d();
    render2d();
  }

  // Light the creature like your room: a few times a second, sample how
  // bright and what colour the camera picture is (like ARCore's light
  // estimate), so it isn't brightly lit in a dim room, and picks up warm
  // lamp light or cool daylight.
  const probe = { cv: null, g: null, t: 0, k: 1, col: new T.Color(1, 1, 1), wantK: 1, want: new T.Color(1, 1, 1) };
  const WHITE = new T.Color(1, 1, 1);
  function matchLight(dt) {
    const v = ar.video;
    const live = ar.view.camera && v && v.videoWidth > 0;
    if (!live) {
      probe.wantK = 1;
      probe.want.copy(WHITE);
    } else if ((probe.t -= dt) <= 0) {
      probe.t = 0.4;
      try {
        if (!probe.cv) { probe.cv = GX.canvas(24, 16); probe.g = probe.cv.getContext('2d', { willReadFrequently: true }); }
        probe.g.drawImage(v, 0, 0, 24, 16);
        const d = probe.g.getImageData(0, 0, 24, 16).data;
        let r = 0, g = 0, b = 0;
        const lin = (x) => Math.pow(x / 255, 2.2);
        for (let i = 0; i < d.length; i += 4) { r += lin(d[i]); g += lin(d[i + 1]); b += lin(d[i + 2]); }
        const n = d.length / 4;
        r /= n; g /= n; b /= n;
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        // Mid grey (0.18) keeps the normal lighting.
        probe.wantK = clamp(Math.sqrt(lum / 0.18), 0.3, 1.5);
        const m = Math.max(r, g, b, 1e-4);
        probe.want.setRGB(r / m, g / m, b / m).lerp(WHITE, 0.55);
      } catch (e) { /* the picture can't be read: keep the normal lighting */ }
    }
    const k = 1 - Math.exp(-dt * 3);
    probe.k += (probe.wantK - probe.k) * k;
    probe.col.lerp(probe.want, k);
    hemi.intensity = 1.3 * probe.k;
    hemi.color.setRGB(0.93, 0.95, 1).multiply(probe.col);
    sun.intensity = 2.2 * probe.k;
    sun.color.set('#FFF6EA').multiply(probe.col);
    scene.environmentIntensity = probe.k;
  }

  // The 3D layer: sync the camera with the phone, then draw the creature.
  const basis = new T.Matrix4();
  function render3d() {
    const v = ar.view, e = E;
    const r = to3(v.right).normalize(), u = to3(v.up).normalize(), f = to3(v.fwd).normalize().negate();
    basis.makeBasis(r, u, f);
    camera.quaternion.setFromRotationMatrix(basis);
    camera.position.set(0, ar.EYE, 0);
    camera.aspect = v.w / v.h;
    camera.fov = 2 * Math.atan(v.h / 2 / v.f) * 180 / Math.PI;
    camera.updateProjectionMatrix();
    plain.visible = !v.camera;
    catcher.visible = v.camera;
    scene.background = v.camera ? null : bg();
    scene.fog = v.camera ? null : fog();

    const inst = e.inst;
    const pos = inst.root.position;
    sun.position.set(pos.x + 4, 12, pos.z + 6);
    sun.target.position.copy(pos);
    const sc = sun.shadow.camera, ext = e.H * 1.6 + 1;
    sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 1; sc.far = 40;
    sc.updateProjectionMatrix();
    catcher.position.set(pos.x, 0.002, pos.z);

    // Fades, flashes and the capture pull.
    let alpha = 1, scale = 1;
    if (e.phase === 'appear') alpha = clamp(e.phaseT / 0.9, 0, 1);
    if (e.phase === 'flee') alpha = clamp(1 - e.phaseT / 0.9, 0, 1);
    if (e.phase === 'absorb') scale = 1 - clamp(e.phaseT / 0.5, 0, 1);
    const hidden = e.phase === 'fall' || e.phase === 'wobble' || e.phase === 'caught';
    inst.root.visible = !hidden && scale > 0.02;
    inst.root.scale.setScalar(e.H * Math.max(scale, 0.001));
    inst.setOpacity(alpha);
    if (e.phase === 'absorb') inst.setTint('#FFFFFF', 1.5);
    else if (e.hurt > 0.02) inst.setTint('#FF3030', e.hurt * 0.9);
    else inst.setTint('#000000', 0);

    // Rift tear it came out of / flees into.
    if (e.phase === 'appear' || e.phase === 'flee') {
      const open = Math.sin(Math.min(1, e.phaseT / (e.phase === 'appear' ? 1.3 : 1.2)) * Math.PI);
      tear.visible = true;
      tear.material.color.set(C.ELEMENTS[e.sp.el].color);
      tear.position.set(pos.x, pos.y + e.H * 0.55, pos.z);
      tear.scale.set(e.H * 0.9 * open + 0.01, e.H * 1.7 * Math.max(open, 0.2), 1);
    } else tear.visible = false;

    // Orb
    const o = e.orb;
    orbMesh.visible = !!o && !(o.state === 'capture' && e.phase === 'absorb');
    if (o) {
      orbMesh.position.copy(to3(o.p));
      orbMesh.rotation.set(o.spin, 0, e.phase === 'wobble' ? Math.sin(e.phaseT / 0.9 * TAU) * 0.5 * Math.max(0, 1 - e.phaseT / 0.6) : 0);
      if (o.state === 'capture') orbMesh.rotation.set(0, e.yaw, orbMesh.rotation.z);
    }
    renderer.toneMappingExposure = 1.05;
    renderer.render(scene, camera);
  }

  let bgTex = null, fogObj = null;
  const bg = () => bgTex || (bgTex = GX.gradient([[0, '#07061A'], [0.55, '#281446'], [1, '#5A2A6E']]));
  const fog = () => fogObj || (fogObj = new T.Fog('#3A1C58', 30, 180));

  // The 2D layer: crosshair, target, ring, darts, sparks and text.
  function render2d() {
    const v = ar.view, e = E;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, v.w, v.h);
    const c = screenOf(bodyCenter());

    if (e.mode === 'dart' && e.phase === 'free') {
      const ts = targetScreen();
      if (ts) {
        ctx.save();
        ctx.strokeStyle = '#FFE14D';
        ctx.fillStyle = 'rgba(255,225,77,0.14)';
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(ts.x, ts.y, ts.r, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(ts.x, ts.y, ts.r * 0.4, 0, TAU); ctx.stroke();
        ctx.restore();
      }
    }
    if (e.mode === 'orb' && e.phase === 'free' && c) {
      const R = v.f * e.H * 0.5 / c.depth;
      const pc = catchChance(0);
      const col = pc > 0.4 ? '#5CFF8A' : pc > 0.2 ? '#FFE14D' : '#FF6A5A';
      ctx.save();
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath(); ctx.arc(c.x, c.y, R, 0, TAU); ctx.stroke();
      ctx.strokeStyle = col;
      ctx.shadowColor = col;
      ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(c.x, c.y, R * e.ring, 0, TAU); ctx.stroke();
      ctx.restore();
    }
    if (e.phase === 'caught' && e.orb) {
      const s = ar.project(e.orb.p);
      if (s) {
        ctx.fillStyle = '#FFE14D';
        ctx.font = '700 22px "Chakra Petch", system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('★', s.x, s.y - 26 - Math.sin(e.t * 6) * 3);
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
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 4;
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
      const x = drag ? drag.x : v.cx;
      const y = drag ? drag.y : v.h - 120 - Math.sin(e.t * 3) * 4;
      const r = 30;
      const col = S.faction().color;
      ctx.save();
      ctx.shadowColor = col;
      ctx.shadowBlur = 20;
      const g = ctx.createRadialGradient(x - 9, y - 9, 3, x, y, r);
      g.addColorStop(0, '#FFFFFF');
      g.addColorStop(0.35, col);
      g.addColorStop(1, '#1A0E30');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#120A1C';
      ctx.lineWidth = 3.5;
      ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.stroke();
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath(); ctx.arc(x, y, 8, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.restore();
    }

    // Off-screen arrow
    if (!c || c.x < -40 || c.x > v.w + 40 || c.y < -40 || c.y > v.h + 40) {
      const d = ar.screenDirection([e.x, e.y, e.alt + e.H * 0.5]);
      let ax = d.x;
      const ay = d.y;
      if (d.depth < 0 && Math.hypot(ax, ay) < 1e-3) ax = 1;
      const a = Math.atan2(ay, ax);
      const R = Math.min(v.w, v.h) * 0.38;
      const elc = C.ELEMENTS[e.sp.el].color;
      ctx.save();
      ctx.translate(v.cx + Math.cos(a) * R, v.cy + Math.sin(a) * R);
      ctx.rotate(a);
      ctx.fillStyle = elc;
      ctx.shadowColor = elc;
      ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.moveTo(22, 0); ctx.lineTo(-10, -16); ctx.lineTo(-4, 0); ctx.lineTo(-10, 16); ctx.closePath(); ctx.fill();
      ctx.restore();
    }

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
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* the pointer already ended */ }
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      if (E.mode === 'orb' && E.phase === 'free' && !E.orb && y > ar.view.h * 0.45) {
        drag = { x, y, id: e.pointerId, hist: [[x, y, e.timeStamp]] };
        return;
      }
      look = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: false };
    });
    canvas.addEventListener('pointermove', (e) => {
      if (drag && e.pointerId === drag.id) {
        const r = canvas.getBoundingClientRect();
        drag.x = e.clientX - r.left;
        drag.y = e.clientY - r.top;
        drag.hist.push([drag.x, drag.y, e.timeStamp]);
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
        // Speed over the last moment of the flick, timed by when the touches
        // happened (not when we got round to handling them).
        const h = drag.hist;
        const now = e.timeStamp;
        const old = h.find((p) => now - p[2] < 120) || h[Math.max(0, h.length - 2)];
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
