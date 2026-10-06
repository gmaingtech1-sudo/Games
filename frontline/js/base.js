/* Frontline — Outpost, the base-building mode.

   You hold a field HQ. Kills, wave bonuses and supply crates earn supplies;
   spend them on sandbags, walls, wire, tank traps, MG nests, mortar pits,
   anti-tank guns, a medic tent and an ammo depot. Between waves there's a
   build phase. Each wave marches on the HQ: they shoot you when they can,
   otherwise they shoot (or shell) whatever you built in their way. If they
   can't find a way round your walls, they break through them. Lose the HQ
   and it's over; if you fall, you're back on your feet at the HQ.

   game.js calls in through FL.base.*, and this file calls back through the
   small api game.js passes to start(). */
(function (FL) {
  'use strict';

  const U = FL.util;
  const A = FL.audio;
  const art = FL.art;
  const { TAU, clamp, rand, dist, angleTo, angleDiff, turnTo } = U;
  const $ = (id) => document.getElementById(id);

  // What you can build. w×h is the footprint before rotating.
  const BUILD = [
    { id: 'sandbag', name: 'Sandbags', cost: 15, w: 64, h: 18, kind: 'sandbag', hp: 260, desc: 'Low cover. Stops bullets, you can fire over it' },
    { id: 'wall', name: 'Wall', cost: 30, w: 64, h: 14, kind: 'wall', hp: 520, desc: 'Tall wall. Blocks shots and the way through' },
    { id: 'wire', name: 'Barbed wire', cost: 10, w: 90, h: 30, wire: true, desc: 'Slows infantry to a crawl' },
    { id: 'trap', name: 'Tank trap', cost: 20, w: 26, h: 26, kind: 'hedgehog', hp: 420, desc: 'Stops tanks and men, not bullets' },
    { id: 'mg', name: 'MG nest', cost: 100, w: 40, h: 40, kind: 'emplacement', hp: 360, turret: 'mg', range: 520, desc: 'Machine gun that mows down infantry' },
    { id: 'mortar', name: 'Mortar pit', cost: 150, w: 44, h: 44, kind: 'emplacement', hp: 300, turret: 'mortar', range: 850, min: 240, desc: 'Lobs shells on groups far away' },
    { id: 'at', name: 'AT gun', cost: 200, w: 44, h: 44, kind: 'emplacement', hp: 420, turret: 'at', range: 720, desc: 'Anti-tank gun. Cracks armour' },
    { id: 'medic', name: 'Medic tent', cost: 90, w: 70, h: 50, kind: 'tent', hp: 300, desc: 'Heals you fast while you stand nearby' },
    { id: 'depot', name: 'Ammo depot', cost: 70, w: 46, h: 46, kind: 'depot', hp: 300, desc: 'Refills ammo and grenades nearby' },
  ];
  const byId = {};
  for (const b of BUILD) byId[b.id] = b;

  const REWARD = { rifle: 6, smg: 6, grenadier: 8, sniper: 10, officer: 15, mg: 12, tank: 60, tiger: 150 };
  const HQ_HP = 2500;

  let G = null;
  let api = null;
  let el = null;

  /* ===================== Setup ===================== */

  function start(game, gameApi) {
    G = game;
    api = gameApi;
    const W = G.world;
    const hq = W.obstacles.find((o) => o.hq);
    hq.built = true;
    hq.hp = hq.maxHp = HQ_HP;
    G.base = {
      hq,
      hqX: hq.x + hq.w / 2,
      hqY: hq.y + hq.h / 2,
      supplies: 220,
      wave: 0,
      phase: 'build',
      timer: 45,
      toSpawn: 0,
      spawnT: 0,
      built: [hq],
      turrets: [],
      building: false,
      sel: 'sandbag',
      rot: false,
      ghost: null,
      soft: W.makeField(),
      respawnT: 0,
      crateT: 6,
      depotT: 0,
    };
    G.base.soft.soft = true;
    // A few free defences to get going.
    for (const [id, x, y, rot] of [['sandbag', G.base.hqX - 32, hq.y - 70, false], ['sandbag', G.base.hqX - 32, hq.y + hq.h + 52, false],
      ['sandbag', hq.x - 70, G.base.hqY - 32, true], ['sandbag', hq.x + hq.w + 52, G.base.hqY - 32, true], ['mg', G.base.hqX + 90, hq.y - 80, false]]) {
      place(byId[id], x, y, rot, true);
    }
    buildUi();
    showUi(true);
    api.banner('Outpost', 'Build your defences. The first wave attacks in 45 seconds');
  }

  function stop() {
    if (el) showUi(false);
    $('game').classList.remove('building');
    G = null;
  }

  /* ===================== UI ===================== */

  function buildUi() {
    if (el) return;
    el = {
      bar: $('buildbar'), items: $('bb-items'), place: $('bb-place'), rot: $('bb-rot'), repair: $('bb-repair'),
      close: $('bb-close'), toggle: $('b-build'), wave: $('b-wave'), supplies: $('supplies'), suppliesN: $('supplies-n'),
      desc: $('bb-desc'),
    };
    for (const b of BUILD) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'bb-item';
      btn.dataset.id = b.id;
      btn.innerHTML = '<canvas width="64" height="64" aria-hidden="true"></canvas><span class="bb-name">' + b.name + '</span><span class="bb-cost">' + b.cost + '</span>';
      drawIcon(btn.querySelector('canvas'), b);
      el.items.appendChild(btn);
    }
    const tap = (node, fn) => {
      const h = (e) => { e.preventDefault(); e.stopPropagation(); if (G) fn(e); };
      node.addEventListener('touchstart', h, { passive: false });
      node.addEventListener('mousedown', h);
    };
    for (const btn of el.items.children) tap(btn, () => select(btn.dataset.id));
    tap(el.place, () => placeGhost());
    tap(el.rot, () => { G.base.rot = !G.base.rot; A.play('click'); });
    tap(el.repair, () => repairAll());
    tap(el.close, () => setBuilding(false));
    tap(el.toggle, () => setBuilding(!G.base.building));
    tap(el.wave, () => startWaveNow());
  }

  function showUi(on) {
    el.toggle.hidden = !on;
    el.supplies.hidden = !on;
    if (!on) {
      el.bar.hidden = true;
      el.wave.hidden = true;
    }
  }

  function drawIcon(cv, b) {
    const g = cv.getContext('2d');
    g.clearRect(0, 0, 64, 64);
    g.save();
    const s = Math.min(1, 50 / Math.max(b.w, b.h));
    g.translate(32, 32);
    g.scale(s, s);
    if (b.wire) {
      art.wire(g, { x: -b.w / 2, y: -b.h / 2, w: b.w, h: b.h });
    } else {
      art.cover(g, { kind: b.kind, x: -b.w / 2, y: -b.h / 2, w: b.w, h: b.h, seed: 3, hp: 1, maxHp: 1 }, 'grass');
      if (b.turret) drawGun(g, b.turret, 0, 0, -Math.PI / 2, 0);
    }
    g.restore();
  }

  function select(id) {
    G.base.sel = id;
    A.play('click');
  }

  function setBuilding(on) {
    G.base.building = on;
    el.bar.hidden = !on;
    $('game').classList.toggle('building', on);
    if (on) $('hint').hidden = true;
    A.play('click');
  }

  /* ===================== Building ===================== */

  function dims(b, rot) {
    return rot ? { w: b.h, h: b.w } : { w: b.w, h: b.h };
  }

  // Where the ghost sits: under the mouse on a computer, just in front of you on a phone.
  function ghostPos(input) {
    const B = G.base;
    const b = byId[B.sel];
    const d = dims(b, B.rot);
    const p = G.player;
    let cx;
    let cy;
    if (!input.touch && input.mouse.inside) {
      const w = api.screenToWorld(input.mouse.x, input.mouse.y);
      cx = w.x;
      cy = w.y;
    } else {
      // In front of you; if that's taken, the nearest free spot that way.
      const reach = Math.max(d.w, d.h) / 2 + 38;
      const snap = (a, r) => ({
        x: Math.round((p.x + Math.cos(a) * r - d.w / 2) / 10) * 10,
        y: Math.round((p.y + Math.sin(a) * r - d.h / 2) / 10) * 10,
      });
      let first = null;
      for (const da of [0, 0.35, -0.35, 0.7, -0.7]) {
        for (let r = reach; r <= reach + 120; r += 20) {
          const s = snap(p.a + da, r);
          if (!first) first = s;
          if (valid(b, s.x, s.y, d.w, d.h)) return { x: s.x, y: s.y, w: d.w, h: d.h, b, ok: true };
        }
      }
      return { x: first.x, y: first.y, w: d.w, h: d.h, b, ok: false };
    }
    const x = Math.round((cx - d.w / 2) / 10) * 10;
    const y = Math.round((cy - d.h / 2) / 10) * 10;
    return { x, y, w: d.w, h: d.h, b, ok: valid(b, x, y, d.w, d.h) };
  }

  function valid(b, x, y, w, h) {
    const W = G.world;
    if (x < 20 || y < 20 || x + w > W.w - 20 || y + h > W.h - 20) return false;
    if (G.base.supplies < b.cost) return false;
    let clash = false;
    W.query(x, y, x + w, y + h, (o) => {
      if (o.dead || !o.block) return;
      if (x < o.x + o.w - 1 && x + w > o.x + 1 && y < o.y + o.h - 1 && y + h > o.y + 1) { clash = true; return false; }
    });
    if (clash) return false;
    if (b.wire) {
      for (const wr of W.wires) if (x < wr.x + wr.w && x + w > wr.x && y < wr.y + wr.h && y + h > wr.y) return false;
      return true;
    }
    const hitsCircle = (cx, cy, r) => Math.hypot(cx - clamp(cx, x, x + w), cy - clamp(cy, y, y + h)) < r;
    if (!G.player.dead && hitsCircle(G.player.x, G.player.y, G.player.r + 2)) return false;
    for (const e of G.enemies) if (!e.dead && hitsCircle(e.x, e.y, e.r)) return false;
    for (const s of G.spawnPts) if (hitsCircle(s[0], s[1], 60)) return false;
    return true;
  }

  function place(b, x, y, rot, free) {
    const d = dims(b, rot);
    const W = G.world;
    if (!free) G.base.supplies -= b.cost;
    if (b.wire) {
      W.wires.push({ x, y, w: d.w, h: d.h, built: true });
      return null;
    }
    const o = W.add(b.kind, x, y, d.w, d.h, { built: true, hp: b.hp, maxHp: b.hp, buildId: b.id });
    G.base.built.push(o);
    if (b.turret) {
      G.base.turrets.push({ kind: b.turret, def: b, ob: o, x: x + d.w / 2, y: y + d.h / 2, a: -Math.PI / 2, cd: rand(0.5, 1.5), burst: 0, burstT: 0, flash: 0, recoil: 0 });
    }
    return o;
  }

  function placeGhost() {
    const B = G.base;
    const gh = B.ghost;
    if (!gh) return;
    if (!gh.ok) {
      api.text(gh.x + gh.w / 2, gh.y - 10, B.supplies < gh.b.cost ? 'Not enough supplies' : "Can't build there", '#FF8E7A');
      A.play('empty');
      return;
    }
    place(gh.b, gh.x, gh.y, B.rot, false);
    api.text(gh.x + gh.w / 2, gh.y - 10, '-' + gh.b.cost, '#FFE08A');
    A.play('reload', 0.8);
    for (let i = 0; i < 6; i++) api.puff(gh.x + rand(0, gh.w), gh.y + rand(0, gh.h), 'rgba(170,150,110,0.7)', 2, 0.5, 40, rand(0, TAU));
  }

  function repairCost() {
    let missing = 0;
    for (const o of G.base.built) if (!o.dead) missing += o.maxHp - o.hp;
    return Math.ceil(missing / 12);
  }

  function repairAll() {
    const B = G.base;
    const cost = repairCost();
    if (!cost) { api.text(G.player.x, G.player.y - 24, 'Nothing to repair', '#FFE08A'); return; }
    if (B.supplies < cost) {
      // Spend what we have, fixing the most damaged first.
      let budget = B.supplies * 12;
      const list = B.built.filter((o) => !o.dead && o.hp < o.maxHp).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
      for (const o of list) {
        const fix = Math.min(budget, o.maxHp - o.hp);
        o.hp += fix;
        budget -= fix;
      }
      B.supplies = 0;
    } else {
      for (const o of B.built) if (!o.dead) o.hp = o.maxHp;
      B.supplies -= cost;
    }
    A.play('reload');
    api.text(G.player.x, G.player.y - 24, 'Repaired', '#7CFF9A');
  }

  /* ===================== Input (called before the player moves) ===================== */

  function handleInput(input) {
    const B = G.base;
    for (const act of Array.from(input.actions)) {
      if (act === 'build') { setBuilding(!B.building); input.actions.delete(act); }
      else if (act === 'nextwave') { startWaveNow(); input.actions.delete(act); }
      else if (B.building && act === 'rotate') { B.rot = !B.rot; A.play('click'); input.actions.delete(act); }
      else if (B.building && act.startsWith('num')) {
        const b = BUILD[Number(act.slice(3)) - 1];
        if (b) select(b.id);
        input.actions.delete(act);
        input.actions.delete('slot0');
        input.actions.delete('slot1');
      } else if (act.startsWith('num')) input.actions.delete(act);
    }
    B.ghost = B.building && !G.player.dead ? ghostPos(input) : null;
    // On a computer, clicking in build mode builds instead of shooting.
    if (B.building && !input.touch && input.mouse.down) {
      input.mouse.down = false;
      placeGhost();
    }
  }

  /* ===================== The wave cycle ===================== */

  function startWaveNow() {
    const B = G.base;
    if (B.phase !== 'build') return;
    // A little bonus for not waiting.
    const bonus = Math.floor(B.timer / 2);
    if (bonus > 0) { B.supplies += bonus; api.text(G.player.x, G.player.y - 30, '+' + bonus + ' supplies', '#FFE08A'); }
    B.timer = 0;
  }

  function beginWave() {
    const B = G.base;
    B.phase = 'wave';
    B.wave++;
    B.toSpawn = 4 + B.wave * 2;
    B.spawnT = 0;
    const n = B.wave;
    let armour = n >= 4 && n % 3 === 1 ? Math.floor(n / 6) + 1 : 0;
    if (n % 10 === 0) armour = 0;
    api.banner('Wave ' + n, armour || n % 10 === 0 ? 'Armour inbound! Get the AT guns ready' : 'They are coming for the HQ');
    A.play('radio');
    for (let i = 0; i < armour; i++) {
      const sp = api.spawnPoint();
      const s = api.freeSpot(sp[0], sp[1], 40, 80);
      api.spawnEnemy('tank', s.x, s.y, { alert: true });
    }
    if (n % 10 === 0) {
      const sp = api.spawnPoint();
      const s = api.freeSpot(sp[0], sp[1], 40, 80);
      api.spawnEnemy('tiger', s.x, s.y, { alert: true });
    }
  }

  function update(dt) {
    const B = G.base;
    const p = G.player;
    const alive = G.enemies.filter((e) => !e.dead).length;

    if (B.phase === 'build') {
      B.timer -= dt;
      if (B.timer <= 0) beginWave();
    } else {
      B.spawnT -= dt;
      if (B.toSpawn > 0 && B.spawnT <= 0 && alive < 14 + Math.min(12, B.wave)) {
        B.spawnT = rand(1.4, 2.6);
        const n = B.wave;
        const pool = ['rifle', 'rifle', 'smg', 'smg'];
        if (n >= 2) pool.push('grenadier');
        if (n >= 3) pool.push('smg', 'officer');
        if (n >= 5) pool.push('grenadier', 'sniper');
        const size = Math.min(B.toSpawn, U.randInt(2, 4));
        const types = [];
        for (let i = 0; i < size; i++) types.push(U.pick(pool));
        B.toSpawn -= size;
        api.spawnSquad(types);
      }
      if (B.toSpawn <= 0 && alive === 0) {
        const bonus = 50 + B.wave * 12;
        B.supplies += bonus;
        B.phase = 'build';
        B.timer = 30;
        api.banner('Wave ' + B.wave + ' beaten', '+' + bonus + ' supplies · Next wave in 30 s');
        A.play('objective');
      }
    }

    // Supply crates turn up around the outpost.
    B.crateT -= dt;
    if (B.crateT <= 0) {
      B.crateT = rand(10, 16);
      const crates = G.pickups.filter((k) => k.kind === 'supply').length;
      if (crates < 5) {
        const a = rand(0, TAU);
        const r = rand(260, 820);
        const s = api.freeSpot(clamp(B.hqX + Math.cos(a) * r, 60, G.world.w - 60), clamp(B.hqY + Math.sin(a) * r, 60, G.world.h - 60), 16, 50);
        api.addPickup('supply', s.x, s.y);
      }
    }

    // Medic tents and ammo depots look after you.
    B.depotT -= dt;
    if (!p.dead) {
      for (const o of B.built) {
        if (o.dead) continue;
        const d = dist(p.x, p.y, o.x + o.w / 2, o.y + o.h / 2);
        if (o.buildId === 'medic' && d < 120 && p.hp < 100) {
          p.hp = Math.min(100, p.hp + 12 * dt);
          if (Math.random() < dt * 4) api.text(p.x + rand(-10, 10), p.y - 20, '+', '#7CFF9A');
        }
        if (o.buildId === 'depot' && d < 90 && B.depotT <= 0) {
          let used = false;
          for (const w of p.weapons) {
            const max = FL.data.WEAPONS[w.id].reserve;
            if (max === Infinity || w.reserve >= max) continue;
            w.reserve = Math.min(max, w.reserve + Math.ceil(max * 0.5));
            used = true;
          }
          if (p.grenades < 6) { p.grenades++; used = true; }
          if (used) {
            B.depotT = 6;
            api.text(p.x, p.y - 22, '+ammo', '#FFE08A');
            A.play('pickup');
          }
        }
      }
    }

    // Back on your feet.
    if (p.dead) {
      B.respawnT -= dt;
      if (B.respawnT <= 0) {
        const s = api.freeSpot(B.hqX, B.hq.y + B.hq.h + 30, 14, 60);
        p.x = s.x;
        p.y = s.y;
        p.hp = 100;
        p.dead = false;
        p.regenT = 0;
        p.reloadT = 0;
        api.banner('Back in the fight', '');
      }
    }

    updateTurrets(dt);
    updateUi();
  }

  /* ===================== Turrets ===================== */

  function updateTurrets(dt) {
    const B = G.base;
    const W = G.world;
    for (let i = B.turrets.length - 1; i >= 0; i--) {
      const t = B.turrets[i];
      if (t.ob.dead) { B.turrets.splice(i, 1); continue; }
      t.flash -= dt;
      t.recoil = Math.max(0, t.recoil - dt * 3);
      t.cd -= dt;
      // Pick a target a few times a second.
      t.seeT = (t.seeT || 0) - dt;
      if (t.seeT <= 0 || (t.target && t.target.dead)) {
        t.seeT = 0.25;
        t.target = null;
        let best = Infinity;
        for (const e of G.enemies) {
          if (e.dead) continue;
          const d = dist(t.x, t.y, e.x, e.y);
          if (d > t.def.range || (t.def.min && d < t.def.min)) continue;
          let score = d;
          if (t.kind === 'at') score -= e.def.tank ? 1000 : 0;
          if (t.kind === 'mg' && e.def.tank) score += 600;
          if (t.kind === 'mortar') {
            for (const o of G.enemies) if (o !== e && !o.dead && dist(o.x, o.y, e.x, e.y) < 120) score -= 120;
          } else if (!W.clearShot(t.x, t.y, e.x, e.y)) continue;
          if (score < best) { best = score; t.target = e; }
        }
      }
      const e = t.target;
      if (!e) { t.a += Math.sin(G.t * 0.5 + i) * 0.2 * dt; continue; }
      const want = angleTo(t.x, t.y, e.x, e.y);
      t.a = turnTo(t.a, want, (t.kind === 'mg' ? 4 : 1.6) * dt);
      const aimed = Math.abs(angleDiff(t.a, want)) < (t.kind === 'mortar' ? 0.4 : 0.08);
      if (t.kind === 'mg') {
        if (t.burst > 0) {
          t.burstT -= dt;
          if (t.burstT <= 0) {
            t.burst--;
            t.burstT = 0.09;
            const a = t.a + rand(-0.06, 0.06);
            G.bullets.push({ x: t.x, y: t.y, ox: t.x, oy: t.y, vx: Math.cos(a) * 1150, vy: Math.sin(a) * 1150, travel: 0, range: t.def.range * 1.1, dmg: 11, owner: 't', pierce: 0 });
            t.flash = 0.05;
            A.play('mg', clamp(1 - dist(t.x, t.y, G.player.x, G.player.y) / 1100, 0.1, 0.6));
          }
        } else if (t.cd <= 0 && aimed) {
          t.burst = 7;
          t.cd = rand(0.8, 1.1);
        }
      } else if (t.kind === 'at' && t.cd <= 0 && aimed) {
        t.cd = 3.2;
        t.flash = 0.1;
        t.recoil = 1;
        G.rockets.push({ x: t.x, y: t.y, ox: t.x, oy: t.y, a: t.a, speed: 1100, life: t.def.range, owner: 't', dmg: 520, splash: 60, shell: true });
        A.play('cannon', clamp(1 - dist(t.x, t.y, G.player.x, G.player.y) / 1300, 0.15, 0.8));
        for (let k = 0; k < 6; k++) api.puff(t.x + Math.cos(t.a) * 30, t.y + Math.sin(t.a) * 30, 'rgba(200,195,185,0.7)', 3, 0.8, 70, t.a + rand(-0.8, 0.8));
      } else if (t.kind === 'mortar' && t.cd <= 0 && aimed) {
        t.cd = rand(4, 5);
        t.flash = 0.1;
        const tx = e.x + rand(-45, 45);
        const ty = e.y + rand(-45, 45);
        A.play('rifle', 0.3);
        api.puff(t.x, t.y, 'rgba(200,195,185,0.7)', 6, 0.9, 50, -Math.PI / 2);
        api.later(0.4, () => A.play('whistle', 0.4));
        api.later(1.3, () => api.explode(tx, ty, 100, 140, 't'));
      }
    }
  }

  /* ===================== Hooks from game.js ===================== */

  // Something we built took damage from the enemy.
  function damage(o, dmg) {
    if (o.dead || !o.built) return;
    o.hp -= dmg;
    o.hurtT = 0.15;
    if (o.hp <= 0) api.destroyObstacle(o);
  }

  // Called by destroyObstacle for anything we built.
  function destroyed(o) {
    const B = G.base;
    const i = B.built.indexOf(o);
    if (i >= 0) B.built.splice(i, 1);
    if (o.hq) {
      api.explode(o.x + o.w / 2, o.y + o.h / 2, 160, 0, 'x');
      api.finish(false, 'HQ destroyed', 'The outpost fell on wave ' + B.wave);
    } else {
      api.text(o.x + o.w / 2, o.y, (byId[o.buildId] ? byId[o.buildId].name : 'Defence') + ' destroyed', '#FF8E7A');
    }
  }

  function onKill(e) {
    const v = REWARD[e.type] || 6;
    G.base.supplies += v;
    api.text(e.x, e.y - 36, '+' + v + ' supplies', '#C9E27A');
  }

  function onPickup(k) {
    if (k.kind !== 'supply') return false;
    const v = 25 + G.base.wave * 3;
    G.base.supplies += v;
    api.text(k.x, k.y - 20, '+' + v + ' supplies', '#C9E27A');
    A.play('pickup');
    return true;
  }

  function onPlayerDown() {
    G.base.respawnT = 6;
    api.banner('You are down!', 'Back on your feet at the HQ in 6 seconds');
  }

  // The built thing an enemy at (e) should shoot at, if any.
  // Infantry can't hurt tank traps with bullets, so they skip those.
  function siegeTarget(e, range, explosive) {
    const B = G.base;
    let best = null;
    let bd = Infinity;
    for (const o of B.built) {
      if (o.dead) continue;
      if (!explosive && o.kind === 'hedgehog') continue;
      const cx = o.x + o.w / 2;
      const cy = o.y + o.h / 2;
      const d = Math.hypot(e.x - clamp(e.x, o.x, o.x + o.w), e.y - clamp(e.y, o.y, o.y + o.h));
      if (d > range) continue;
      const score = d - (o.buildId && byId[o.buildId].turret ? 120 : 0) - (o.hq ? 80 : 0);
      if (score >= bd) continue;
      // Whatever we'd actually hit on the way is fine, as long as it's ours.
      const hit = G.world.segHit(e.x, e.y, cx, cy, explosive ? 'sight' : 'shot', 46);
      if (hit && !hit.o.built) continue;
      bd = score;
      best = hit && hit.o.built ? hit.o : o;
    }
    return best;
  }

  /* ===================== Drawing ===================== */

  function drawGun(g, kind, x, y, a, recoil, flash) {
    g.save();
    g.translate(x, y);
    g.rotate(a);
    if (kind === 'mg') {
      art.soldier(g, -10, 0, 0, { gun: 'none', side: 'us' });
      g.fillStyle = '#1F1E1B';
      g.fillRect(-2, -2.5, 30 - recoil * 4, 5);
      g.fillRect(4, -7, 3, 14);
      if (flash > 0) { g.fillStyle = 'rgba(255,220,120,0.95)'; g.beginPath(); g.arc(30, 0, 5, 0, TAU); g.fill(); }
    } else if (kind === 'at') {
      g.fillStyle = '#4C5530';
      g.fillRect(-12, -14, 10, 28); // shield
      g.fillStyle = '#2C2F1E';
      g.fillRect(-4 - recoil * 8, -3, 40, 6);
      g.fillStyle = '#3A3F26';
      g.fillRect(-16, -9, 8, 4);
      g.fillRect(-16, 5, 8, 4);
      if (flash > 0) { g.fillStyle = 'rgba(255,220,130,0.95)'; g.beginPath(); g.arc(38, 0, 9, 0, TAU); g.fill(); }
    } else if (kind === 'mortar') {
      g.fillStyle = '#2C2F1E';
      g.beginPath(); g.arc(0, 0, 9, 0, TAU); g.fill();
      g.fillStyle = '#4C5530';
      g.fillRect(0, -4, 14, 8);
      g.fillStyle = '#111';
      g.beginPath(); g.arc(0, 0, 5, 0, TAU); g.fill();
      if (flash > 0) { g.fillStyle = 'rgba(255,220,130,0.8)'; g.beginPath(); g.arc(0, 0, 10, 0, TAU); g.fill(); }
    }
    g.restore();
  }

  // Above the cover layer: guns, health bars, the HQ flag, and the build ghost.
  function draw(g) {
    const B = G.base;
    for (const t of B.turrets) if (!t.ob.dead) drawGun(g, t.kind, t.x, t.y, t.a, t.recoil, t.flash);
    // Flag on the HQ.
    if (!B.hq.dead) drawFlag(g, B.hq.x + 14, B.hq.y + 10);
    for (const o of B.built) {
      if (o.dead || o.hp >= o.maxHp) continue;
      const w = Math.min(60, Math.max(24, o.w));
      const x = o.x + o.w / 2 - w / 2;
      const y = o.y - 8;
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillRect(x, y, w, 4);
      g.fillStyle = o.hp / o.maxHp > 0.4 ? '#9BE36B' : '#E5533D';
      g.fillRect(x, y, (w * Math.max(0, o.hp)) / o.maxHp, 4);
    }
    drawGhost(g);
  }

  function drawFlag(g, fx, fy) {
    g.fillStyle = '#3A3226';
    g.fillRect(fx - 1, fy - 2, 3, 26);
    g.fillStyle = '#4F5A22';
    g.beginPath();
    g.moveTo(fx + 2, fy);
    g.quadraticCurveTo(fx + 14, fy + 3 + Math.sin(G.t * 4) * 3, fx + 26, fy + 1);
    g.lineTo(fx + 26, fy + 13);
    g.quadraticCurveTo(fx + 14, fy + 15 + Math.sin(G.t * 4 + 1) * 3, fx + 2, fy + 12);
    g.fill();
    g.fillStyle = '#F2E9C9';
    g.beginPath(); g.arc(fx + 14, fy + 7, 3, 0, TAU); g.fill();
  }

  // The see-through outline of what you're about to build, green if it fits.
  function drawGhost(g) {
    const gh = G.base.ghost;
    if (gh) {
      g.save();
      g.globalAlpha = 0.55;
      if (gh.b.wire) art.wire(g, gh);
      else {
        art.cover(g, { kind: gh.b.kind, x: gh.x, y: gh.y, w: gh.w, h: gh.h, seed: 3, hp: 1, maxHp: 1 }, G.world.themeName);
        if (gh.b.turret) drawGun(g, gh.b.turret, gh.x + gh.w / 2, gh.y + gh.h / 2, G.player.a, 0, 0);
      }
      g.globalAlpha = 1;
      g.strokeStyle = gh.ok ? 'rgba(124,255,154,0.9)' : 'rgba(255,80,60,0.9)';
      g.lineWidth = 2;
      g.setLineDash([6, 5]);
      g.strokeRect(gh.x, gh.y, gh.w, gh.h);
      if (gh.b.range) {
        g.strokeStyle = 'rgba(255,255,255,0.25)';
        g.beginPath(); g.arc(gh.x + gh.w / 2, gh.y + gh.h / 2, gh.b.range, 0, TAU); g.stroke();
      }
      if (gh.b.id === 'medic' || gh.b.id === 'depot') {
        g.strokeStyle = 'rgba(124,255,154,0.35)';
        g.beginPath(); g.arc(gh.x + gh.w / 2, gh.y + gh.h / 2, gh.b.id === 'medic' ? 120 : 90, 0, TAU); g.stroke();
      }
      g.restore();
    }
  }

  function drawMini(g, k) {
    for (const o of G.base.built) {
      if (o.dead) continue;
      g.fillStyle = o.hq ? '#FFD75A' : '#9BE36B';
      g.fillRect(o.x * k, o.y * k, Math.max(2, o.w * k), Math.max(2, o.h * k));
    }
  }

  /* ===================== HUD ===================== */

  const lastUi = {};
  function updateUi() {
    const B = G.base;
    const b = byId[B.sel];
    const sup = String(B.supplies);
    if (lastUi.sup !== sup) { el.suppliesN.textContent = sup; lastUi.sup = sup; }
    el.wave.hidden = B.phase !== 'build';
    if (!el.bar.hidden) {
      for (const btn of el.items.children) {
        const it = byId[btn.dataset.id];
        btn.classList.toggle('on', it.id === B.sel);
        btn.classList.toggle('poor', it.cost > B.supplies);
      }
      const desc = b.name + ' — ' + b.desc;
      if (lastUi.desc !== desc) { el.desc.textContent = desc; lastUi.desc = desc; }
      const rc = repairCost();
      const rl = rc ? 'Repair (' + rc + ')' : 'Repair';
      if (lastUi.rl !== rl) { el.repair.textContent = rl; lastUi.rl = rl; }
      el.place.classList.toggle('bad', !(B.ghost && B.ghost.ok));
    }
  }

  // What the objective box shows.
  function status() {
    const B = G.base;
    const alive = G.enemies.filter((e) => !e.dead).length;
    const text = B.phase === 'build'
      ? 'Wave ' + (B.wave + 1) + ' in ' + U.fmtTime(B.timer)
      : 'Wave ' + B.wave + ' · ' + (alive + B.toSpawn) + ' left';
    const sub = G.player.dead
      ? 'Back up in ' + Math.ceil(B.respawnT) + ' s'
      : 'HQ ' + Math.max(0, Math.ceil(B.hq.hp)).toLocaleString('en-US') + ' / ' + B.hq.maxHp.toLocaleString('en-US');
    return { text, sub, bar: Math.max(0, B.hq.hp) / B.hq.maxHp, warn: B.hq.hp < B.hq.maxHp * 0.35 || G.player.dead };
  }

  FL.base = {
    BUILD, start, stop, update, handleInput, draw, drawMini, status,
    // For scripts and tests: build something for free at a spot.
    place: (id, x, y, rot) => place(byId[id], x, y, !!rot, true),
    damage, destroyed, onKill, onPickup, onPlayerDown, siegeTarget,
    get active() { return !!G; },
  };
})(window.FL);
