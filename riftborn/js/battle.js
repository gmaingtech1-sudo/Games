/* Riftborn — Rift battles, in a 3D arena under a swirling rift. To take an
   enemy Rift you beat the creatures guarding it: your team of up to three
   against theirs, one at a time. Each turn both sides pick a move; faster
   creatures act first, and Guard always goes first. Elements matter: see
   RB.creatures.advantage. */
window.RB = window.RB || {};
(function (RB) {
  'use strict';

  const { clamp, rand, TAU } = RB.util;
  const C = RB.creatures;
  const sfx = RB.sfx;
  const $ = (id) => document.getElementById(id);

  const MOVES = {
    strike: { name: 'Strike', power: 1, cd: 0 },
    blast: { name: 'Blast', power: 1.75, cd: 2 },
    guard: { name: 'Guard', power: 0, cd: 2 },
  };

  let B = null;
  let canvas = null, ctx = null, dpr = 1, Wd = 1, Ht = 1;

  function fighter(c, side) {
    const st = C.stats(c);
    // Apex bosses (c.hpx) have several times the health.
    const hp = Math.round(st.hp * (c.hpx || 1));
    return { c, sp: C.byId(c.sp), side, st, hp, max: hp, cd: { blast: 0, guard: 0 }, guard: false, anim: { lunge: 0, hurt: 0, faint: 0, shield: 0, mouth: 0 } };
  }

  function init() {
    canvas = $('battle-view');
    ctx = canvas.getContext('2d');
    for (const m of Object.keys(MOVES)) {
      $(`bt-${m}`).addEventListener('click', () => choose(m));
    }
    $('bt-swap').addEventListener('click', () => openSwap());
    $('bt-flee').addEventListener('click', () => { if (B && !B.busy) end(false, true); });
    $('bt-done').addEventListener('click', () => { const b = B; if (!b) return; close(); b.done(b.outcome); });
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    Wd = canvas.clientWidth;
    Ht = canvas.clientHeight;
    canvas.width = Math.round(Wd * dpr);
    canvas.height = Math.round(Ht * dpr);
  }

  // mine / theirs: arrays of creature records { sp, lvl, iv }.
  function start(mine, theirs, opts, done) {
    B = {
      me: mine.map((c) => fighter(c, 0)),
      foe: theirs.map((c) => fighter(c, 1)),
      mi: 0, fi: 0,
      t: 0, busy: false, done, opts,
      fx: [], nums: [],
      outcome: null,
    };
    $('battle-screen').hidden = false;
    buildArena();
    GX.attach($('battle-gl'));
    $('bt-result').hidden = true;
    $('bt-title').textContent = opts.title || 'Rift battle';
    resize();
    hud();
    log(opts.intro || `${B.foe[0].sp.name} guards the Rift!`);
    sfx.roar(B.foe[0].sp.size);
    B.foe[0].anim.mouth = 1;
  }

  function close() {
    $('battle-screen').hidden = true;
    for (const f of B.me.concat(B.foe)) if (f.model) { scene.remove(f.model.root); f.model.dispose(); }
    for (const x of B.fx) if (x.obj) fxGroup.remove(x.obj);
    B = null;
  }

  const cur = (side) => (side === 0 ? B.me[B.mi] : B.foe[B.fi]);

  function hud() {
    const set = (pre, f, team, idx) => {
      $(`${pre}-name`).textContent = f.sp.name;
      $(`${pre}-lvl`).textContent = `Lv ${f.c.lvl} ${C.ELEMENTS[f.sp.el].icon}`;
      const pct = clamp(f.hp / f.max, 0, 1);
      const bar = $(`${pre}-hp`);
      bar.style.width = `${pct * 100}%`;
      bar.style.background = pct > 0.5 ? '#5CFF8A' : pct > 0.2 ? '#FFE14D' : '#FF5A5A';
      $(`${pre}-hpt`).textContent = `${Math.max(0, Math.ceil(f.hp))} / ${f.max}`;
      $(`${pre}-pips`).innerHTML = team.map((x, i) => `<i class="${x.hp <= 0 ? 'down' : i === idx ? 'cur' : ''}"></i>`).join('');
    };
    set('bt-foe', cur(1), B.foe, B.fi);
    set('bt-me', cur(0), B.me, B.mi);
    const m = cur(0);
    $('bt-blast').innerHTML = `<b>${C.ELEMENTS[m.sp.el].icon} ${C.ELEMENTS[m.sp.el].move}</b><small>${m.cd.blast ? `Ready in ${m.cd.blast}` : `${adText(m.sp.el, cur(1).sp.el)}`}</small>`;
    $('bt-strike').innerHTML = '<b>🗡️ Strike</b><small>Reliable hit</small>';
    $('bt-guard').innerHTML = `<b>🛡️ Guard</b><small>${m.cd.guard ? `Ready in ${m.cd.guard}` : 'Block + heal a bit'}</small>`;
    $('bt-blast').disabled = B.busy || m.cd.blast > 0;
    $('bt-guard').disabled = B.busy || m.cd.guard > 0;
    $('bt-strike').disabled = B.busy;
    $('bt-swap').disabled = B.busy || B.me.filter((f) => f.hp > 0).length < 2;
  }

  function adText(a, d) {
    const x = C.advantage(a, d);
    return x > 1.3 ? 'Super effective' : x > 1 ? 'Effective' : x < 1 ? 'Not very effective' : 'Big hit, cooldown 2';
  }

  function log(text) {
    $('bt-log').textContent = text;
  }

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  function aiMove(f, target) {
    const adv = C.advantage(f.sp.el, target.sp.el);
    if (f.cd.blast === 0 && (adv >= 1 || Math.random() < 0.4)) return 'blast';
    if (f.cd.guard === 0 && f.hp < f.max * 0.45 && Math.random() < 0.5) return 'guard';
    return 'strike';
  }

  async function choose(move) {
    if (!B || B.busy) return;
    const me = cur(0), foe = cur(1);
    if (MOVES[move].cd && me.cd[move] > 0) return;
    B.busy = true;
    hud();
    const theirs = aiMove(foe, me);
    const order = [[me, move, foe], [foe, theirs, me]];
    order.sort((a, b) => {
      const pa = a[1] === 'guard' ? 1 : 0, pb = b[1] === 'guard' ? 1 : 0;
      if (pa !== pb) return pb - pa;
      return b[0].st.spd - a[0].st.spd || (Math.random() - 0.5);
    });
    for (const [who, mv, target] of order) {
      if (!B) return;
      if (who.hp <= 0 || target.hp <= 0) continue;
      await act(who, mv, target);
    }
    if (!B) return;
    // End of turn: shields drop, cooldowns tick.
    for (const f of [me, foe]) {
      f.guard = false;
      for (const k of Object.keys(f.cd)) f.cd[k] = Math.max(0, f.cd[k] - 1);
    }
    await afterFaints();
    if (!B || B.outcome) return;
    B.busy = false;
    hud();
  }

  async function act(who, mv, target) {
    const M = MOVES[mv];
    if (M.cd) who.cd[mv] = M.cd + 1;
    const el = C.ELEMENTS[who.sp.el];
    if (mv === 'guard') {
      who.guard = true;
      who.anim.shield = 1;
      const heal = Math.round(who.max * 0.08);
      who.hp = Math.min(who.max, who.hp + heal);
      log(`${who.sp.name} guards!`);
      sfx.guard();
      hud();
      await wait(650);
      return;
    }
    const adv = mv === 'blast' ? C.advantage(who.sp.el, target.sp.el) : 1;
    const crit = Math.random() < 0.1;
    let dmg = who.st.atk * M.power * adv * rand(0.9, 1.1) * (crit ? 1.5 : 1);
    if (target.guard) dmg *= 0.4;
    dmg = Math.max(1, Math.round(dmg));
    log(mv === 'blast' ? `${who.sp.name} used ${el.move}!` : `${who.sp.name} strikes!`);
    who.anim.lunge = 1;
    who.anim.mouth = 1;
    if (mv === 'blast') {
      sfx.blast(who.sp.el);
      B.fx.push({ kind: 'blast', from: who.side, t: 0, dur: 0.45, color: el.color });
      await wait(450);
    } else {
      sfx.strike();
      await wait(220);
    }
    if (!B) return;
    target.hp = Math.max(0, target.hp - dmg);
    target.anim.hurt = 1;
    const p = chestOf(target);
    B.nums.push({ text: `-${dmg}${crit ? '!' : ''}`, p: p.clone().add(new T.Vector3(0, dispH(target) * 0.55, 0)), life: 1.1, color: adv > 1 ? '#FFE14D' : '#FFFFFF' });
    for (let i = 0; i < (mv === 'blast' ? 26 : 12); i++) spark(p, mv === 'blast' ? el.color : '#FFF2D0');
    if (adv > 1.3) log('Super effective!');
    else if (adv < 1) log('Not very effective…');
    else if (target.guard) log(`${target.sp.name} blocked most of it.`);
    else if (crit) log('Critical hit!');
    hud();
    await wait(650);
  }

  async function afterFaints() {
    const foe = cur(1), me = cur(0);
    if (foe.hp <= 0) {
      foe.anim.faint = 0.001;
      sfx.faint();
      log(`${foe.sp.name} fainted!`);
      await wait(900);
      if (!B) return;
      const next = B.foe.findIndex((f) => f.hp > 0);
      if (next < 0) return end(true);
      B.fi = next;
      log(`${cur(1).sp.name} steps up!`);
      cur(1).anim.mouth = 1;
      sfx.roar(cur(1).sp.size);
      hud();
      await wait(500);
    }
    if (!B) return;
    if (me.hp <= 0) {
      me.anim.faint = 0.001;
      sfx.faint();
      log(`${me.sp.name} fainted!`);
      await wait(900);
      if (!B) return;
      const next = B.me.findIndex((f) => f.hp > 0);
      if (next < 0) return end(false);
      B.mi = next;
      log(`Go, ${cur(0).sp.name}!`);
      hud();
      await wait(400);
    }
  }

  function openSwap() {
    if (!B || B.busy) return;
    const list = $('bt-swap-list');
    list.innerHTML = B.me.map((f, i) => `<button class="swap-item" data-i="${i}" ${f.hp <= 0 || i === B.mi ? 'disabled' : ''}>
      <b>${RB.util.esc(f.sp.name)}</b> Lv ${f.c.lvl} ${C.ELEMENTS[f.sp.el].icon}<small>${Math.ceil(f.hp)} / ${f.max} HP</small></button>`).join('')
      + '<button class="swap-item cancel" data-i="-1">Cancel</button>';
    $('bt-swap-sheet').hidden = false;
    list.querySelectorAll('button').forEach((b) => b.addEventListener('click', async () => {
      $('bt-swap-sheet').hidden = true;
      const i = +b.dataset.i;
      if (i < 0 || !B) return;
      // Swapping uses your turn.
      B.busy = true;
      B.mi = i;
      log(`Go, ${cur(0).sp.name}!`);
      hud();
      await wait(500);
      if (!B) return;
      const foe = cur(1);
      await act(foe, aiMove(foe, cur(0)), cur(0));
      if (!B) return;
      for (const f of [cur(0), foe]) { f.guard = false; for (const k of Object.keys(f.cd)) f.cd[k] = Math.max(0, f.cd[k] - 1); }
      await afterFaints();
      if (!B || B.outcome) return;
      B.busy = false;
      hud();
    }));
  }

  function end(win, fled) {
    B.busy = true;
    B.outcome = { win, fled: !!fled };
    if (fled) { const d = B.done, o = B.outcome; close(); d(o); return; }
    if (win) sfx.win(); else sfx.lose();
    $('bt-result-title').textContent = win ? 'Victory!' : 'Defeated';
    $('bt-result-text').textContent = win
      ? (B.opts.winText || 'The guardians are down.')
      : 'Your team was knocked out. Level up your creatures with DNA and try again.';
    $('bt-result').hidden = false;
  }

  /* ------------------ The arena ------------------ */

  const T = window.THREE;
  const GX = RB.gfx;
  const SPOT = [new T.Vector3(-2.3, 0, 2.7), new T.Vector3(2.3, 0, -2.7)];
  let scene = null, camera = null, renderer = null, portal = null, fxGroup = null, sun = null;
  const shields = [];

  function stoneTexture() {
    const c = GX.canvas(512, 512), g = c.getContext('2d');
    g.fillStyle = '#4A4452';
    g.fillRect(0, 0, 512, 512);
    const r = RB.util.rng('arena');
    // Flagstones
    for (let y = 0; y < 512; y += 64) {
      for (let x = -((y / 64) % 2) * 40; x < 512; x += 80) {
        const sh = 60 + Math.floor(r() * 30);
        g.fillStyle = `rgb(${sh},${sh - 6},${sh + 8})`;
        g.fillRect(x + 3, y + 3, 74, 58);
      }
    }
    for (let i = 0; i < 1800; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.05)';
      g.beginPath(); g.arc(r() * 512, r() * 512, 1 + r() * 5, 0, TAU); g.fill();
    }
    const t = GX.texture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(4, 4);
    return t;
  }

  function buildArena() {
    if (scene) return;
    renderer = GX.main();
    scene = new T.Scene();
    scene.environment = GX.environment(renderer);
    scene.background = GX.gradient([[0, '#06041A'], [0.45, '#241046'], [1, '#6A2E7A']]);
    scene.fog = new T.Fog('#3A1C58', 22, 70);
    camera = new T.PerspectiveCamera(46, 1, 0.1, 300);
    scene.add(new T.HemisphereLight('#B8B0FF', '#2A1A30', 1.1));
    sun = new T.DirectionalLight('#FFE8D0', 2.3);
    sun.position.set(6, 14, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const sc = sun.shadow.camera;
    sc.left = -9; sc.right = 9; sc.top = 9; sc.bottom = -9; sc.near = 1; sc.far = 40;
    sun.shadow.bias = -0.0006;
    scene.add(sun);
    const rim = new T.DirectionalLight('#C070FF', 1.6);
    rim.position.set(-4, 5, -12);
    scene.add(rim);
    const floor = new T.Mesh(new T.CircleGeometry(13, 72), new T.MeshStandardMaterial({ map: stoneTexture(), roughness: 0.92 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    const outer = new T.Mesh(new T.PlaneGeometry(400, 400), new T.MeshStandardMaterial({ color: '#1A1224', roughness: 1 }));
    outer.rotation.x = -Math.PI / 2;
    outer.position.y = -0.05;
    scene.add(outer);
    const runes = RB.props.ringMarker('#B45CFF', 7, 0.55);
    runes.position.y = 0.03;
    scene.add(runes);
    for (const s of SPOT) {
      const pad = RB.props.ringMarker('#FFFFFF', 1.8, 0.35);
      pad.position.set(s.x, 0.04, s.z);
      scene.add(pad);
    }
    const r = RB.util.rng('rocks');
    for (let i = 0; i < 22; i++) {
      const a = i / 22 * TAU + r() * 0.2;
      const rock = RB.props.rock(i);
      const d = 12.5 + r() * 3;
      const s = 0.8 + r() * 1.2;
      rock.position.set(Math.cos(a) * d, 0.4 * s, Math.sin(a) * d);
      rock.scale.set(s * (1 + r() * 0.6), s * (0.8 + r() * 1.6), s * (1 + r() * 0.6));
      rock.rotation.set(r() * 0.3, r() * 6, r() * 0.3);
      scene.add(rock);
    }
    // The rift overhead.
    portal = new T.Group();
    portal.position.set(4, 11, -22);
    const torus = new T.Mesh(new T.TorusGeometry(6, 0.45, 12, 64), RB.props.std({ color: '#B45CFF', emissive: new T.Color('#B45CFF'), emissiveIntensity: 1.6 }));
    portal.add(torus);
    for (let i = 0; i < 3; i++) {
      const sw = GX.sprite(i === 1 ? '#FF5CF0' : '#8A5CFF', 13 - i * 3, 0.55);
      portal.add(sw);
    }
    scene.add(portal);
    fxGroup = new T.Group();
    scene.add(fxGroup);
    for (let i = 0; i < 2; i++) {
      const sh = new T.Mesh(new T.SphereGeometry(1, 32, 20), new T.MeshBasicMaterial({ color: '#9FE8FF', transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false }));
      scene.add(sh);
      shields.push(sh);
    }
  }

  // Creatures are shown at a size that fits the arena, big ones bigger.
  const dispH = (f) => clamp(1.15 + Math.log2(f.sp.size) * 0.6, 1.1, 2.7) * (f.c.boss ? 1.4 : 1);

  function model(f) {
    if (!f.model) {
      f.model = RB.beasts.instance(f.sp.id, { own: true });
      f.model.root.scale.setScalar(dispH(f));
      scene.add(f.model.root);
    }
    return f.model;
  }

  function chestOf(f) {
    return model(f).bones.f0.getWorldPosition(new T.Vector3());
  }

  function spark(p, color) {
    const s = GX.sprite(color, rand(0.15, 0.35), 1);
    s.position.copy(p);
    fxGroup.add(s);
    const a = Math.random() * TAU, e = rand(-0.3, 1.2), sp = rand(2, 6);
    B.fx.push({ kind: 'spark', obj: s, v: new T.Vector3(Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp + 1, Math.sin(a) * Math.cos(e) * sp), t: 0, dur: rand(0.4, 0.8) });
  }

  function update(dt) {
    if (!B) return;
    B.t += dt;
    for (const f of B.me.concat(B.foe)) {
      const a = f.anim;
      a.lunge = Math.max(0, a.lunge - dt * 2.4);
      a.hurt = Math.max(0, a.hurt - dt * 2.5);
      a.shield = Math.max(0, a.shield - dt * 0.8);
      a.mouth = Math.max(0, a.mouth - dt * 1.5);
      if (a.faint > 0) a.faint = Math.min(1, a.faint + dt * 1.4);
    }
    // Fighters
    for (const f of B.me.concat(B.foe)) if (f.model) f.model.root.visible = false;
    for (const side of [0, 1]) {
      const f = cur(side);
      const m = model(f);
      const a = f.anim;
      const base = SPOT[side], other = SPOT[1 - side];
      const dir = other.clone().sub(base);
      const dist = dir.length();
      dir.normalize();
      const h = dispH(f);
      const lunge = Math.sin(a.lunge * Math.PI) * dist * 0.32;
      const knock = a.hurt * 0.35;
      const fly = f.sp.plan === 'flyer' ? h * 0.35 + Math.sin(B.t * 2 + side) * 0.1 : 0;
      m.root.visible = true;
      m.root.position.copy(base).addScaledVector(dir, lunge - knock);
      m.root.position.y = fly - a.faint * h * 0.15;
      m.root.rotation.set(0, Math.atan2(dir.x, dir.z), a.faint * Math.PI * 0.45 * (side ? 1 : -1));
      m.update(dt, { speed: a.lunge > 0.05 ? 4 * h : 0, mouth: a.mouth, flap: 0.5 });
      if (a.hurt > 0.02) m.setTint('#FF3030', a.hurt * 0.9); else m.setTint('#000000', 0);
      m.setOpacity(a.faint > 0.5 ? 1 - (a.faint - 0.5) * 2 : 1);
      const sh = shields[side];
      sh.material.opacity = a.shield * 0.3;
      sh.visible = a.shield > 0.01;
      sh.position.copy(m.root.position).add(new T.Vector3(0, h * 0.5, 0));
      sh.scale.setScalar(h * 0.85 * (1 + (1 - a.shield) * 0.2));
    }
    // Effects
    for (const x of B.fx) {
      x.t += dt;
      if (x.kind === 'blast') {
        if (!x.obj) {
          x.obj = GX.sprite(x.color, 1.4, 1);
          const core = new T.Mesh(new T.SphereGeometry(0.22, 16, 12), new T.MeshBasicMaterial({ color: '#FFFFFF', toneMapped: false }));
          x.obj.add(core);
          core.scale.setScalar(1 / 1.4);
          fxGroup.add(x.obj);
          x.a = chestOf(cur(x.from));
          x.b = chestOf(cur(1 - x.from));
        }
        const k = Math.min(1, x.t / x.dur);
        x.obj.position.copy(x.a).lerp(x.b, k);
        x.obj.position.y += Math.sin(k * Math.PI) * 1.2;
        x.obj.scale.setScalar(1.2 + Math.sin(B.t * 30) * 0.2);
        if (Math.random() < 0.8) spark(x.obj.position, x.color);
      } else if (x.kind === 'spark') {
        x.v.y -= 9 * dt;
        x.obj.position.addScaledVector(x.v, dt);
        x.obj.material.opacity = 1 - x.t / x.dur;
      }
    }
    for (const x of B.fx) if (x.t >= x.dur && x.obj) { fxGroup.remove(x.obj); x.obj.material.dispose(); }
    B.fx = B.fx.filter((x) => x.t < x.dur);
    for (const n of B.nums) { n.life -= dt; n.p.y += 0.9 * dt; }
    B.nums = B.nums.filter((n) => n.life > 0);
    portal.rotation.z += dt * 0.25;
    portal.children.forEach((c, i) => { if (c.isSprite) c.material.rotation += dt * (0.3 + i * 0.2); });
    render();
  }

  function frameCamera() {
    const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
    camera.aspect = w / Math.max(1, h);
    // Behind and to the right of your creature, looking across at theirs;
    // pulled back further on narrow screens.
    const narrow = camera.aspect < 0.8;
    const dir = SPOT[1].clone().sub(SPOT[0]).normalize();
    const right = new T.Vector3(-dir.z, 0, dir.x);
    camera.position.copy(SPOT[0]).addScaledVector(dir, narrow ? -6.5 : -4.5).addScaledVector(right, narrow ? 3.6 : 3.2).setY(narrow ? 4.4 : 3.4);
    const look = SPOT[0].clone().lerp(SPOT[1], 0.5).setY(1.0);
    camera.lookAt(look);
    camera.updateProjectionMatrix();
  }

  function render() {
    GX.fit();
    frameCamera();
    renderer.toneMappingExposure = 1.05;
    renderer.render(scene, camera);
    // Damage numbers on the 2D layer.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, Wd, Ht);
    ctx.textAlign = 'center';
    for (const n of B.nums) {
      const v = n.p.clone().project(camera);
      if (v.z > 1) continue;
      const x = (v.x + 1) / 2 * Wd, y = (1 - v.y) / 2 * Ht;
      ctx.globalAlpha = clamp(n.life / 0.4, 0, 1);
      ctx.font = '700 30px "Chakra Petch", system-ui, sans-serif';
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(10,5,20,0.85)';
      ctx.strokeText(n.text, x, y);
      ctx.fillStyle = n.color;
      ctx.fillText(n.text, x, y);
    }
    ctx.globalAlpha = 1;
  }

  RB.battle = {
    init, start, update, resize,
    get active() { return !!B; },
  };
})(window.RB);
