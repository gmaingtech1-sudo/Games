/* Frontline — the battle itself: the player, enemy soldiers and tanks, bullets,
   grenades, rockets, explosions, objectives, the camera, the HUD and drawing. */
(function (FL) {
  'use strict';

  const U = FL.util;
  const D = FL.data;
  const A = FL.audio;
  const art = FL.art;
  const input = FL.input;
  const { TAU, clamp, rand, chance, dist, angleTo, angleDiff, turnTo } = U;
  const LOW_SKIP = FL.world.LOW_SKIP;
  const $ = (id) => document.getElementById(id);

  const PLAYER_SPEED = 172;
  const PLAYER_R = 11;
  const GRENADE_R = 115;

  let G = null;          // the current battle
  let canvas = null;
  let ctx = null;
  let mini = null;
  let mctx = null;
  let dpr = 1;
  let cw = 0;
  let ch = 0;
  const hud = {};

  /* ===================== Setup ===================== */

  function init() {
    canvas = $('stage');
    ctx = canvas.getContext('2d');
    mini = $('minimap');
    mctx = mini.getContext('2d');
    for (const id of ['hp-fill', 'hp-box', 'obj-text', 'obj-sub', 'obj-bar', 'obj-fill', 'weapon-name', 'ammo-mag', 'ammo-res',
      'reload-bar', 'reload-fill', 'gren-count', 'score', 'b-swap', 'swap-label', 'b-art', 'art-fill', 'b-take', 'take-label',
      'banner', 'banner-t', 'banner-s', 'vignette', 'b-gren', 'b-reload', 'hint', 'b-afk']) hud[id] = $(id);
    const afkBtn = $('b-afk');
    const afkTap = (e) => { e.preventDefault(); e.stopPropagation(); if (G) toggleAfk(); };
    afkBtn.addEventListener('touchstart', afkTap, { passive: false });
    afkBtn.addEventListener('mousedown', afkTap);
    input.bind($('touch'), canvas);
    for (const [id, act] of [['b-gren', 'grenade'], ['b-reload', 'reload'], ['b-swap', 'swap'], ['b-art', 'artillery'], ['b-take', 'take']]) {
      const el = $(id);
      const fire = (e) => {
        e.preventDefault();
        e.stopPropagation();
        input.touch = e.type === 'touchstart' || input.touch;
        input.actions.add(act);
      };
      el.addEventListener('touchstart', fire, { passive: false });
      el.addEventListener('mousedown', fire);
    }
    window.addEventListener('resize', resize);
    resize();
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cw = canvas.clientWidth || window.innerWidth;
    ch = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    if (mini) mini.width = 1; // re-fit the minimap on the next draw
  }

  function makeWeapon(id, full) {
    const w = D.WEAPONS[id];
    return { id, mag: w.mag, reserve: full ? w.reserve : Math.min(w.reserve, Math.ceil(w.reserve / 2)) };
  }

  function start(mission, loadout, onEnd) {
    resize();
    const s = FL.save.data.settings;
    const world = new FL.World(mission.w, mission.h, mission.theme, mission.seed);
    const B = FL.missions.builder(world, U.seeded(mission.seed));
    mission.build(B);
    world.buildNav();
    const out = B.out;
    const diff = D.DIFFICULTY[s.difficulty] || D.DIFFICULTY.regular;

    G = {
      mission, world, diff, onEnd,
      t: 0,
      player: {
        x: out.start.x, y: out.start.y, a: out.start.a, r: PLAYER_R, hp: 100, walk: 0, flash: 0,
        weapons: [makeWeapon(loadout.primary, true), makeWeapon(loadout.secondary, true)], cur: 0,
        fireT: 0, reloadT: 0, grenades: 4, regenT: 0, hurt: 0, art: 0.35, moving: 0, vx: 0, vy: 0,
        lowHp: 100, dead: false, triggerHeld: false,
      },
      enemies: [], bullets: [], grenades: [], rockets: [], shells: [], strikes: [], particles: [], texts: [],
      pickups: [], corpses: [], hits: [], later: [],
      zones: out.zones, spawnPts: out.spawns,
      objIndex: -1, objT: 0, holdT: 0, waveT: 3, tankQueue: [],
      stats: { shots: 0, hits: 0, kills: 0, score: 0, time: 0, taken: {} },
      cam: { x: out.start.x, y: out.start.y, shake: 0, k: 1 },
      paused: false, ended: false, endT: 0, result: null,
      bannerT: 0, rumbleT: 4, miniT: 0, flowT: 0, hintT: 0,
      survival: mission.survival ? { wave: 0, toSpawn: 0, breakT: 4, spawnT: 0 } : null,
      tankNum: 1,
    };
    for (const e of out.enemies) spawnEnemy(e.type, e.x, e.y, e);
    for (const p of out.pickups) addPickup(p.kind, p.x, p.y, p);
    if (mission.base) FL.base.start(G, api);
    G.miniBg = renderMiniBg();
    input.reset();
    input.enabled = true;
    input.aimAngle = out.start.a;
    FL.afk.reset();
    nextObjective();
    hud.hint.hidden = false;
    hud.hint.textContent = input.touch || matchMedia('(pointer: coarse)').matches
      ? (FL.save.data.settings.autoFire ? 'Left thumb: move · You shoot automatically · Right thumb to aim yourself' : 'Left thumb: move · Right thumb: aim and fire')
      : 'WASD move · Mouse aim · Click fire · R reload · G / right-click grenade · Q swap · F artillery' + (mission.base ? ' · B build · T rotate · N next wave' : '');
    G.hintT = 6;
    updateHud(true);
  }

  /* ===================== Spawning ===================== */

  function spawnEnemy(type, x, y, opts) {
    const def = D.ENEMIES[type];
    opts = opts || {};
    const hp = def.hp * G.diff.hp;
    const e = {
      type, def, x, y, r: def.r, hp, maxHp: hp, a: opts.facing != null ? opts.facing : rand(0, TAU),
      facing0: opts.facing != null ? opts.facing : Math.PI / 2, tag: opts.tag || null,
      alert: !!opts.alert, react: 0, fireCd: rand(0.5, 1.5), burst: 0, burstT: 0, aimT: 0,
      grenCd: def.grenade ? rand(def.grenade[0], def.grenade[1]) : rand(10, 18),
      canSee: false, canHit: false, seeT: Math.random() * 0.25, walk: 0, flash: 0, hurt: 0,
      strafe: chance(0.5) ? 1 : -1, strafeT: rand(1, 3), tele: 0, dead: false, stuckT: 0, lastX: x, lastY: y,
      ta: opts.facing != null ? opts.facing : Math.PI / 2, cannonCd: def.cannon ? rand(2, 3) : 0, cannonTele: 0,
      teleTarget: null, tread: 0, recoil: 0, num: def.tank ? String(G.tankNum++ * 3 + 1) : '',
      sweep: Math.random() * 10, pathT: 0,
    };
    G.enemies.push(e);
    return e;
  }

  function addPickup(kind, x, y, extra) {
    const p = { kind, x, y, weapon: extra && extra.weapon, mag: extra && extra.mag, reserve: extra && extra.reserve, t: 0 };
    if (kind === 'weapon' && p.mag == null) {
      const w = D.WEAPONS[p.weapon];
      p.mag = w.mag;
      p.reserve = w.reserve === Infinity ? Infinity : Math.ceil(w.reserve * 0.6);
    }
    G.pickups.push(p);
    return p;
  }

  // A spot near (x, y) that isn't inside anything.
  function freeSpot(x, y, r, spread) {
    for (let i = 0; i < 20; i++) {
      const px = x + rand(-spread, spread) * (i ? 1 : 0);
      const py = y + rand(-spread, spread) * (i ? 1 : 0);
      if (!G.world.solidAt(px, py, r)) return { x: px, y: py };
    }
    return { x, y };
  }

  // Pick a spawn point away from the player, preferably out of sight.
  function spawnPoint() {
    const p = G.player;
    const pts = G.spawnPts.slice().sort(() => Math.random() - 0.5);
    let best = null;
    let bestScore = -Infinity;
    for (const s of pts) {
      const d = dist(s[0], s[1], p.x, p.y);
      let score = Math.min(d, 1100) + (G.world.sight(s[0], s[1], p.x, p.y) ? -500 : 0);
      if (d < 450) score -= 2000;
      if (score > bestScore) { bestScore = score; best = s; }
    }
    return best || [p.x, 40];
  }

  function spawnSquad(types) {
    const sp = spawnPoint();
    for (const t of types) {
      const spot = freeSpot(sp[0], sp[1], 14, 60);
      const e = spawnEnemy(t, spot.x, spot.y, { alert: true });
      e.react = 0.5;
    }
  }

  // Which way an enemy walks to close in: the flow field (to you, or to the HQ
  // in Outpost); if your walls have sealed every way in, the field that
  // ignores them, which walks them up to a wall to break through.
  function pathDir(e, fallback) {
    const W = G.world;
    let a = W.flowDir(e.x, e.y);
    if (a == null && G.base) a = W.flowDir(e.x, e.y, G.base.soft);
    if (a == null) a = G.base ? angleTo(e.x, e.y, G.base.hqX, G.base.hqY) : fallback;
    return a;
  }

  // What Outpost (base.js) is allowed to call back into.
  const api = {
    spawnEnemy: (...a) => spawnEnemy(...a), spawnSquad: (...a) => spawnSquad(...a), spawnPoint: () => spawnPoint(),
    freeSpot: (...a) => freeSpot(...a), addPickup: (...a) => addPickup(...a), explode: (...a) => explode(...a),
    later: (...a) => later(...a), text: (...a) => text(...a), banner: (...a) => banner(...a), puff: (...a) => puff(...a),
    destroyObstacle: (o) => destroyObstacle(o), finish: (...a) => finish(...a), screenToWorld: (x, y) => screenToWorld(x, y),
  };

  /* ===================== Objectives ===================== */

  function objective() {
    return G.mission.objectives[G.objIndex] || null;
  }

  function nextObjective() {
    G.objIndex++;
    G.holdT = 0;
    G.waveT = 2;
    const o = objective();
    if (!o) {
      finish(true);
      return;
    }
    if (o.spawn) {
      const s = o.spawn;
      const e = spawnEnemy(s.type, s.x, s.y, { tag: s.tag, alert: true, facing: Math.PI / 2 });
      e.react = 1;
      banner('Enemy armour!', 'A ' + e.def.name + ' is coming down the road');
      A.play('cannon', 0.6);
    } else if (G.objIndex > 0) {
      banner('Objective', o.text);
    } else {
      banner(G.mission.name, o.text);
    }
    if (o.type === 'hold' && o.waves) G.tankQueue = (o.waves.tanks || []).map((t) => Object.assign({}, t));
    if (G.objIndex > 0) A.play('objective');
  }

  function updateObjective(dt) {
    const o = objective();
    if (!o || G.ended) return;
    const p = G.player;
    // Supply drops at the position you're defending.
    const rs = G.mission.resupply;
    if (rs) {
      G.supplyT = (G.supplyT == null ? rs.every : G.supplyT) - dt;
      if (G.supplyT <= 0) {
        G.supplyT = rs.every;
        const near = G.pickups.filter((k) => k.kind === 'ammo' && dist(k.x, k.y, rs.x, rs.y) < 300).length;
        if (near < 2) {
          const s = freeSpot(rs.x + rand(-140, 140), rs.y + rand(-100, 100), 14, 40);
          addPickup('ammo', s.x, s.y);
          text(s.x, s.y - 20, 'Supplies', '#FFE08A');
        }
      }
    }
    if (o.type === 'destroy') {
      if (!G.enemies.some((e) => !e.dead && e.tag === o.tag)) nextObjective();
    } else if (o.type === 'clear') {
      if (!G.enemies.some((e) => !e.dead)) nextObjective();
    } else if (o.type === 'reach') {
      const z = G.zones[o.zone];
      if (dist(p.x, p.y, z.x, z.y) < z.r) nextObjective();
    } else if (o.type === 'hold') {
      const z = G.zones[o.zone];
      const inside = dist(p.x, p.y, z.x, z.y) < (o.radius || z.r);
      if (inside) G.holdT += dt;
      G.objOutside = !inside;
      // Waves.
      G.waveT -= dt;
      const alive = G.enemies.filter((e) => !e.dead).length;
      if (G.waveT <= 0) {
        G.waveT = rand(o.waves.every[0], o.waves.every[1]);
        if (alive < 16) spawnSquad(U.pick(o.waves.squads));
      }
      for (const t of G.tankQueue) {
        if (!t.done && G.holdT >= t.at) {
          t.done = true;
          const sp = spawnPoint();
          const spot = freeSpot(sp[0], sp[1], 40, 80);
          spawnEnemy(t.type, spot.x, spot.y, { alert: true, facing: angleTo(sp[0], sp[1], p.x, p.y) });
          banner('Tank!', 'Enemy armour inbound');
          A.play('cannon', 0.5);
        }
      }
      if (G.holdT >= o.time) {
        banner('Line held!', '');
        nextObjective();
      }
    } else if (o.type === 'survive') {
      updateSurvival(dt);
    } else if (o.type === 'base') {
      FL.base.update(dt);
    }
  }

  function updateSurvival(dt) {
    const S = G.survival;
    const alive = G.enemies.filter((e) => !e.dead).length;
    if (S.toSpawn <= 0 && alive === 0) {
      if (S.breakT === null) {
        S.breakT = 7;
        if (S.wave > 0) {
          banner('Wave ' + S.wave + ' cleared', 'Supplies dropped at the crossroads');
          A.play('objective');
          for (const k of ['ammo', 'ammo', 'medkit', 'grenade']) {
            const s = freeSpot(1000 + rand(-120, 120), 1000 + rand(-120, 120), 14, 40);
            addPickup(k, s.x, s.y);
          }
          if (S.wave % 3 === 0 && !G.player.weapons.some((w) => w.id === 'bazooka')) {
            const s = freeSpot(1000, 1080, 14, 40);
            addPickup('weapon', s.x, s.y, { weapon: 'bazooka' });
          }
        }
      }
      S.breakT -= dt;
      if (S.breakT <= 0) {
        S.breakT = null;
        S.wave++;
        S.toSpawn = 3 + S.wave * 2;
        S.spawnT = 0;
        banner('Wave ' + S.wave, S.wave % 5 === 0 ? 'Armour incoming!' : 'Here they come');
        A.play('radio');
        const n = S.wave;
        if (n % 5 === 0) {
          for (let i = 0; i < Math.floor(n / 10) + 1; i++) {
            const sp = spawnPoint();
            const spot = freeSpot(sp[0], sp[1], 40, 80);
            spawnEnemy(n % 10 === 0 && i === 0 ? 'tiger' : 'tank', spot.x, spot.y, { alert: true });
          }
        }
      }
      return;
    }
    S.spawnT -= dt;
    if (S.toSpawn > 0 && S.spawnT <= 0 && alive < 14 + Math.min(10, S.wave)) {
      S.spawnT = rand(1.5, 3);
      const n = S.wave;
      const pool = ['rifle', 'rifle', 'smg', 'smg'];
      if (n >= 2) pool.push('grenadier');
      if (n >= 3) pool.push('smg', 'officer');
      if (n >= 4) pool.push('sniper');
      if (n >= 6) pool.push('grenadier', 'smg');
      const size = Math.min(S.toSpawn, U.randInt(2, 4));
      const types = [];
      for (let i = 0; i < size; i++) types.push(U.pick(pool));
      S.toSpawn -= size;
      spawnSquad(types);
    }
  }

  function finish(win, title, sub) {
    if (G.ended) return;
    G.ended = true;
    G.endT = win ? 2.2 : 2.6;
    G.result = { win, time: G.stats.time, kills: G.stats.kills, score: G.stats.score,
      accuracy: G.stats.shots ? G.stats.hits / G.stats.shots : 0, wave: G.survival ? G.survival.wave : G.base ? G.base.wave : 0 };
    if (title) {
      banner(title, sub);
      A.play(win ? 'win' : 'lose');
    } else if (win) {
      banner('Mission complete', G.mission.name + ' is ours');
      A.play('win');
    } else {
      banner(G.survival ? 'Overrun' : 'Killed in action', G.survival ? 'You held out to wave ' + G.survival.wave : '');
      A.play('lose');
    }
    input.enabled = false;
  }

  /* ===================== Player ===================== */

  function weapon() {
    const p = G.player;
    return p.weapons[p.cur];
  }

  function updatePlayer(dt) {
    const p = G.player;
    if (p.dead) return;
    const w = weapon();
    const W = D.WEAPONS[w.id];
    const s = FL.save.data.settings;

    // Movement.
    let speed = PLAYER_SPEED * (W.move || 1);
    if (input.firing) speed *= 0.85;
    if (G.world.inWire(p.x, p.y)) speed *= 0.45;
    const mx = input.move.x;
    const my = input.move.y;
    const ox = p.x;
    const oy = p.y;
    G.world.move(p, mx * speed * dt, my * speed * dt, p.r);
    // Don't walk through tanks.
    for (const e of G.enemies) {
      if (e.dead || !e.def.tank) continue;
      const d = dist(p.x, p.y, e.x, e.y);
      const min = e.r + p.r + 6;
      if (d < min && d > 0) {
        p.x = e.x + ((p.x - e.x) / d) * min;
        p.y = e.y + ((p.y - e.y) / d) * min;
      }
    }
    p.vx = (p.x - ox) / Math.max(dt, 1e-4);
    p.vy = (p.y - oy) / Math.max(dt, 1e-4);
    p.moving = Math.hypot(p.vx, p.vy);
    p.walk += p.moving * dt * 0.09;

    // Aim, with a gentle pull towards enemies on touchscreens.
    let aim = input.aimAngle;
    if (input.touch && s.aimAssist && input.firing) {
      let best = null;
      let bestD = 0.22;
      for (const e of G.enemies) {
        if (e.dead || !e.canSee) continue;
        const d = dist(p.x, p.y, e.x, e.y);
        if (d > W.range) continue;
        const diff = Math.abs(angleDiff(aim, angleTo(p.x, p.y, e.x, e.y)));
        if (diff < bestD) { bestD = diff; best = e; }
      }
      if (best) aim = angleTo(p.x, p.y, best.x, best.y);
    }
    p.a = turnTo(p.a, aim, 18 * dt);

    // Timers.
    p.fireT -= dt;
    p.flash -= dt;
    p.hurt -= dt;
    p.regenT -= dt;
    if (p.regenT <= 0 && p.hp < 100) p.hp = Math.min(100, p.hp + 14 * dt);

    // Reloading.
    if (p.reloadT > 0) {
      p.reloadT -= dt;
      if (p.reloadT <= 0) {
        if (W.shellReload) {
          w.mag++;
          if (w.reserve !== Infinity) w.reserve--;
          A.play('shell', 0.8);
          if (w.mag < W.mag && w.reserve > 0 && !input.firing) p.reloadT = W.reload;
          else p.reloadT = 0;
        } else {
          const need = W.mag - w.mag;
          const take = Math.min(need, w.reserve);
          w.mag += take;
          if (w.reserve !== Infinity) w.reserve -= take;
          A.play('reload', 0.8);
        }
      }
    }

    // Actions.
    for (const act of input.actions) {
      if (act === 'reload') startReload();
      else if (act === 'swap') swapWeapon(1 - p.cur);
      else if (act === 'slot0') swapWeapon(0);
      else if (act === 'slot1') swapWeapon(1);
      else if (act === 'grenade') throwGrenade();
      else if (act === 'artillery') callArtillery();
      else if (act === 'take') takeWeapon();
      else if (act === 'pause') FL.app.pause();
      else if (act === 'afk') toggleAfk();
    }
    input.actions.clear();
    input.grenadeTarget = null;

    // Shooting.
    if (input.firing) {
      // On a touchscreen, holding the stick keeps semi-automatics firing at their own pace.
      const canPull = W.auto || !p.triggerHeld || input.touch || G.afk || FL.save.data.settings.autoFire;
      if (p.fireT <= 0 && canPull) {
        if (W.shellReload && p.reloadT > 0 && w.mag > 0) p.reloadT = 0;
        if (p.reloadT <= 0) {
          if (w.mag > 0) fire(p, w, W);
          else {
            if (!p.triggerHeld) A.play('empty');
            startReload();
            p.fireT = 0.3;
          }
        }
      }
      p.triggerHeld = true;
    } else {
      p.triggerHeld = false;
    }
    if (w.mag === 0 && p.reloadT <= 0 && w.reserve > 0 && !input.firing) startReload();

    // Pickups.
    G.nearWeapon = null;
    for (let i = G.pickups.length - 1; i >= 0; i--) {
      const k = G.pickups[i];
      const d = dist(p.x, p.y, k.x, k.y);
      if (d > 26) continue;
      if (k.kind === 'weapon') {
        const held = p.weapons.find((x) => x.id === k.weapon);
        if (held) {
          if (held.reserve !== Infinity) {
            const max = D.WEAPONS[held.id].reserve;
            if (held.reserve >= max) continue;
            held.reserve = Math.min(max, held.reserve + k.mag + (k.reserve === Infinity ? 0 : k.reserve));
            G.pickups.splice(i, 1);
            text(p.x, p.y - 20, '+ammo', '#FFE08A');
            A.play('pickup');
          }
        } else {
          G.nearWeapon = k;
        }
      } else if (k.kind === 'ammo') {
        let used = false;
        for (const x of p.weapons) {
          const max = D.WEAPONS[x.id].reserve;
          if (max === Infinity || x.reserve >= max) continue;
          x.reserve = Math.min(max, x.reserve + Math.ceil(max * (D.WEAPONS[x.id].rocket ? 0.4 : 0.5)));
          used = true;
        }
        if (p.grenades < 6) { p.grenades++; used = true; }
        if (used) {
          G.pickups.splice(i, 1);
          text(p.x, p.y - 20, '+ammo', '#FFE08A');
          A.play('pickup');
        }
      } else if (k.kind === 'supply') {
        if (G.base && FL.base.onPickup(k)) G.pickups.splice(i, 1);
      } else if (k.kind === 'medkit') {
        if (p.hp < 100) {
          p.hp = Math.min(100, p.hp + 60);
          G.pickups.splice(i, 1);
          text(p.x, p.y - 20, '+health', '#7CFF9A');
          A.play('pickup');
        }
      } else if (k.kind === 'grenade') {
        if (p.grenades < 6) {
          p.grenades = Math.min(6, p.grenades + 2);
          G.pickups.splice(i, 1);
          text(p.x, p.y - 20, '+grenades', '#FFE08A');
          A.play('pickup');
        }
      }
    }
  }

  // Auto-fire: when you aren't shooting yourself, aim at the nearest enemy
  // you have a clear shot at and pull the trigger. You just steer.
  function autoFire(dt) {
    const p = G.player;
    if (p.dead || G.ended) return;
    const w = weapon();
    const W = D.WEAPONS[w.id];
    G.autoT = (G.autoT || 0) - dt;
    if (G.autoT <= 0 || (G.autoTarget && G.autoTarget.dead)) {
      G.autoT = 0.15;
      G.autoTarget = null;
      let bd = Infinity;
      for (const e of G.enemies) {
        if (e.dead || !e.canSee) continue;
        // Rockets are kept for armour and nests, and never fired point-blank.
        if (W.rocket && !(e.def.tank || e.def.static)) continue;
        const d = dist(p.x, p.y, e.x, e.y);
        if (d > W.range * 0.95 || (W.rocket && d < 150)) continue;
        if (d < bd && G.world.clearShot(p.x, p.y, e.x, e.y)) { bd = d; G.autoTarget = e; }
      }
    }
    const t = G.autoTarget;
    if (!t) return;
    const a = angleTo(p.x, p.y, t.x, t.y);
    input.aimAngle = a;
    input.aimActive = true;
    // Only fire once the gun is actually pointing there.
    if (Math.abs(angleDiff(p.a, a)) < 0.2) input.firing = true;
    G.autoFiring = true;
  }

  function startReload() {
    const p = G.player;
    const w = weapon();
    const W = D.WEAPONS[w.id];
    if (p.reloadT > 0 || w.mag >= W.mag || w.reserve <= 0) return;
    p.reloadT = W.reload;
    if (!W.shellReload) A.play('reload', 0.6);
  }

  function swapWeapon(i) {
    const p = G.player;
    if (i === p.cur) return;
    p.cur = i;
    p.reloadT = 0;
    p.fireT = 0.25;
    A.play('reload', 0.5);
  }

  function takeWeapon() {
    const p = G.player;
    const k = G.nearWeapon;
    if (!k) return;
    const W = D.WEAPONS[k.weapon];
    const slot = W.slot === 'primary' ? 0 : 1;
    const old = p.weapons[slot];
    const oW = D.WEAPONS[old.id];
    // Drop what you were carrying (the pistol is just holstered and lost).
    if (!(oW.reserve === Infinity)) addPickup('weapon', p.x + rand(-10, 10), p.y + 14, { weapon: old.id, mag: old.mag, reserve: old.reserve });
    p.weapons[slot] = { id: k.weapon, mag: k.mag, reserve: k.reserve };
    G.pickups.splice(G.pickups.indexOf(k), 1);
    p.cur = slot;
    p.reloadT = 0;
    text(p.x, p.y - 22, W.name, '#FFE08A');
    A.play('pickup');
    G.nearWeapon = null;
  }

  function fire(p, w, W) {
    p.fireT = W.rate;
    w.mag--;
    p.flash = 0.06;
    G.stats.shots += W.pellets || 1;
    const mx = p.x + Math.cos(p.a) * 22;
    const my = p.y + Math.sin(p.a) * 22;
    if (W.rocket) {
      G.rockets.push({ x: p.x, y: p.y, ox: p.x, oy: p.y, a: p.a, speed: W.speed, life: W.range, owner: 'p', dmg: W.dmg, splash: W.splash });
      for (let i = 0; i < 8; i++) puff(p.x - Math.cos(p.a) * 18, p.y - Math.sin(p.a) * 18, '#CFC8B8', 8, 0.8, 60, p.a + Math.PI);
    } else {
      const n = W.pellets || 1;
      const moveSpread = Math.min(1, p.moving / PLAYER_SPEED) * 0.03;
      for (let i = 0; i < n; i++) {
        const a = p.a + (Math.random() * 2 - 1) * (W.spread + moveSpread);
        const sp = W.speed * rand(0.92, 1.05);
        G.bullets.push({ x: p.x, y: p.y, ox: p.x, oy: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, travel: 0,
          range: W.range * (n > 1 ? rand(0.8, 1.1) : 1), dmg: W.dmg, owner: 'p', pierce: W.pierce || 0, hitSet: null });
      }
      // Brass.
      G.particles.push({ x: p.x + Math.cos(p.a + 1.6) * 8, y: p.y + Math.sin(p.a + 1.6) * 8, vx: Math.cos(p.a + 1.6) * rand(60, 110), vy: Math.sin(p.a + 1.6) * rand(60, 110),
        life: 0.5, max: 0.5, size: 2, color: '#D4AA4F', type: 'casing', drag: 4 });
    }
    puff(mx, my, 'rgba(220,215,200,0.7)', 2, 0.35, 40, p.a);
    A.play(W.sound, 0.9);
    if (W.ping && w.mag === 0) later(0.09, () => A.play('ping', 0.9));
    G.cam.shake = Math.max(G.cam.shake, (W.kick || 3) * 0.6);
    // Gunfire wakes up anyone nearby.
    alertAround(p.x, p.y, W.rocket ? 700 : 460);
  }

  function throwGrenade() {
    const p = G.player;
    if (p.grenades <= 0 || p.dead) return;
    p.grenades--;
    let tx;
    let ty;
    if (input.grenadeTarget) {
      const w = screenToWorld(input.grenadeTarget.x, input.grenadeTarget.y);
      tx = w.x;
      ty = w.y;
    } else {
      let d = 270;
      // Lob it at an enemy you're roughly facing.
      let best = null;
      let bestDiff = 0.4;
      for (const e of G.enemies) {
        if (e.dead) continue;
        const de = dist(p.x, p.y, e.x, e.y);
        if (de > 430 || de < 60) continue;
        const diff = Math.abs(angleDiff(p.a, angleTo(p.x, p.y, e.x, e.y)));
        if (diff < bestDiff) { bestDiff = diff; best = e; }
      }
      if (best) d = dist(p.x, p.y, best.x, best.y);
      tx = p.x + Math.cos(p.a) * d;
      ty = p.y + Math.sin(p.a) * d;
    }
    launchGrenade(p.x, p.y, tx, ty, 'p', 2.0);
    A.play('throw');
  }

  function launchGrenade(x, y, tx, ty, owner, fuse) {
    let d = dist(x, y, tx, ty);
    d = clamp(d, 40, 460);
    const a = angleTo(x, y, tx, ty);
    const T = 0.45 + d / 900;
    G.grenades.push({ x, y, z: 14, vx: (Math.cos(a) * d) / T, vy: (Math.sin(a) * d) / T, vz: (900 * T) / 2 - 14 / T,
      fuse, owner, spin: rand(-12, 12), rot: 0, landed: false });
  }

  function callArtillery() {
    const p = G.player;
    if (p.art < 1 || p.dead) return;
    p.art = 0;
    // Aim at the thickest knot of enemies you can see, or straight ahead.
    let tx = p.x + Math.cos(p.a) * 380;
    let ty = p.y + Math.sin(p.a) * 380;
    let best = 0;
    for (const e of G.enemies) {
      if (e.dead || !e.canSee) continue;
      const d = dist(p.x, p.y, e.x, e.y);
      if (d < 200 || d > 800) continue;
      let n = 1 + (e.def.tank ? 3 : 0);
      for (const o of G.enemies) if (o !== e && !o.dead && dist(o.x, o.y, e.x, e.y) < 180) n++;
      if (n > best) { best = n; tx = e.x; ty = e.y; }
    }
    G.strikes.push({ x: tx, y: ty, t: 0, n: 8, next: 1.2 });
    banner('Artillery inbound', 'Fire mission on the marked position');
    A.play('radio');
  }

  function hurtPlayer(dmg, fromX, fromY, src) {
    const p = G.player;
    if (p.dead || G.ended) return;
    G.stats.taken[src || '?'] = (G.stats.taken[src || '?'] || 0) + dmg;
    p.hp -= dmg;
    p.hurt = 0.15;
    p.regenT = 4.5;
    p.lowHp = Math.min(p.lowHp, p.hp);
    if (fromX != null) G.hits.push({ a: angleTo(p.x, p.y, fromX, fromY), t: 1 });
    A.play('hurt', 0.5);
    if (FL.save.data.settings.vibe) {
      const ms = dmg > 30 ? 60 : 20;
      if (window.AndroidHost) window.AndroidHost.vibrate(ms);
      else if (navigator.vibrate) navigator.vibrate(ms);
    }
    if (p.hp <= 0) {
      p.hp = 0;
      p.dead = true;
      G.corpses.push({ x: p.x, y: p.y, a: p.a, side: 'us', t: 0 });
      if (G.base) FL.base.onPlayerDown();
      else finish(false);
    }
  }

  /* ===================== Enemies ===================== */

  function alertAround(x, y, r) {
    for (const e of G.enemies) {
      if (e.dead || e.alert) continue;
      if (dist(x, y, e.x, e.y) < r) wake(e);
    }
  }

  function wake(e) {
    if (e.alert) return;
    e.alert = true;
    e.react = rand(0.3, 0.7);
    // Squadmates hear the shout.
    for (const o of G.enemies) if (!o.dead && !o.alert && dist(o.x, o.y, e.x, e.y) < 260) { o.alert = true; o.react = rand(0.5, 1); }
  }

  function updateEnemies(dt) {
    const p = G.player;
    const W = G.world;
    G.flowT -= dt;
    if (G.flowT <= 0 || W.navDirty) {
      G.flowT = 0.3;
      // In Outpost they march on the HQ; the soft field ignores what you built,
      // for when your walls leave no way round (so they come and break through).
      if (G.base) {
        W.updateFlow(G.base.hqX, G.base.hqY);
        W.updateFlow(G.base.hqX, G.base.hqY, G.base.soft);
      } else W.updateFlow(p.x, p.y);
    }
    for (const e of G.enemies) {
      if (e.dead) continue;
      const def = e.def;
      const d = dist(e.x, e.y, p.x, p.y);
      e.flash -= dt;
      e.hurt -= dt;
      e.recoil = Math.max(0, e.recoil - dt * 2);

      // Sight checks a few times a second.
      e.seeT -= dt;
      if (e.seeT <= 0) {
        e.seeT = 0.2 + Math.random() * 0.1;
        if (p.dead || d > 1150) {
          e.canSee = false;
          e.canHit = false;
        } else {
          e.canSee = W.sight(e.x, e.y, p.x, p.y);
          e.canHit = e.canSee && W.clearShot(e.x, e.y, p.x, p.y);
        }
        if (!e.alert && ((e.canSee && d < (def.tank ? 800 : 640)) || d < 240)) wake(e);
        if (G.base) {
          const busy = e.canHit && d < def.range;
          e.siege = busy || e.type === 'sniper' ? null : FL.base.siegeTarget(e, def.tank ? def.range : def.range * 0.9, !!def.tank);
        }
      }
      if (!e.alert) {
        // Idle: look around a little.
        if (!def.static && !def.tank) e.a += Math.sin(G.t * 0.7 + e.sweep) * 0.3 * dt;
        continue;
      }
      if (e.react > 0) { e.react -= dt; }

      if (def.tank) { updateTank(e, d, dt); continue; }

      const toP = angleTo(e.x, e.y, p.x, p.y);

      // Facing.
      if (def.static) {
        let want = e.canSee ? toP : e.facing0;
        const off = angleDiff(e.facing0, want);
        if (Math.abs(off) > def.arc) want = e.facing0 + Math.sign(off) * def.arc;
        e.a = turnTo(e.a, want, 2.2 * dt);
      } else if (e.canSee) {
        e.a = turnTo(e.a, toP, 6 * dt);
      }

      // Movement.
      if (!def.static) {
        let mvA = null;
        let spd = def.speed;
        if (!e.canSee || d > def.range * 0.92 || (!e.canHit && d > 110)) {
          mvA = pathDir(e, toP);
          if (e.canSee && !e.canHit) spd *= 0.8;
        } else if (d < def.keep[0]) {
          mvA = toP + Math.PI;
          spd *= 0.8;
        } else if (d > def.keep[1]) {
          mvA = pathDir(e, toP);
        } else {
          e.strafeT -= dt;
          if (e.strafeT <= 0) { e.strafeT = rand(1.2, 3); e.strafe = chance(0.3) ? 0 : chance(0.5) ? 1 : -1; }
          if (e.strafe) { mvA = toP + (Math.PI / 2) * e.strafe; spd *= 0.45; }
        }
        // Snipers barely move once set.
        if (e.type === 'sniper' && e.canSee && d < def.range) mvA = null;
        // Outpost: something of yours in range and nothing better to do: stand and shoot it.
        if (e.siege && !(e.canSee && d < def.range)) {
          const sx = e.siege.x + e.siege.w / 2;
          const sy = e.siege.y + e.siege.h / 2;
          if (dist(e.x, e.y, sx, sy) < def.range * 0.7) mvA = null;
          e.a = turnTo(e.a, angleTo(e.x, e.y, sx, sy), 6 * dt);
        }
        // Don't wander into the grenade at your feet.
        for (const gr of G.grenades) {
          if (gr.owner === 'p' && dist(gr.x, gr.y, e.x, e.y) < GRENADE_R) { mvA = angleTo(gr.x, gr.y, e.x, e.y); spd = def.speed * 1.3; }
        }
        let vx = 0;
        let vy = 0;
        if (mvA != null) {
          vx = Math.cos(mvA) * spd;
          vy = Math.sin(mvA) * spd;
          if (!e.canSee) e.a = turnTo(e.a, mvA, 5 * dt);
        }
        // Keep a little space from squadmates.
        for (const o of G.enemies) {
          if (o === e || o.dead) continue;
          const od = dist(e.x, e.y, o.x, o.y);
          const min = e.r + o.r + (o.def.tank ? 10 : 6);
          if (od < min && od > 0.01) {
            vx += ((e.x - o.x) / od) * 90;
            vy += ((e.y - o.y) / od) * 90;
          }
        }
        if (W.inWire(e.x, e.y)) { vx *= 0.5; vy *= 0.5; }
        const bx = e.x;
        const by = e.y;
        W.move(e, vx * dt, vy * dt, e.r);
        const moved = dist(bx, by, e.x, e.y);
        e.walk += moved * 0.09;
      }

      // Shooting.
      if (e.react > 0 || (p.dead && !e.siege)) continue;
      e.fireCd -= dt;
      e.grenCd -= dt;
      if ((e.canSee && d < def.range) || e.siege) e.aimT += dt; else e.aimT = 0;

      if (e.burst > 0) {
        e.burstT -= dt;
        if (e.burstT <= 0) {
          e.burst--;
          e.burstT = def.burstGap;
          enemyShoot(e, d);
        }
      } else if (def.telegraph) {
        if (e.tele > 0) {
          e.tele -= dt;
          if (!e.canSee) e.tele = 0;
          else if (e.tele <= 0) {
            enemyShoot(e, d);
            e.fireCd = rand(def.cd[0], def.cd[1]);
          }
        } else if (e.fireCd <= 0 && e.canHit && d < def.range && e.aimT > 0.6) {
          e.tele = def.telegraph;
        }
      } else if (e.fireCd <= 0 && e.canHit && d < def.range && e.aimT > 0.35) {
        e.burst = def.burst;
        e.burstT = 0;
        e.fireCd = rand(def.cd[0], def.cd[1]);
        e.shootAt = null;
      } else if (e.fireCd <= 0 && e.siege && e.aimT > 0.35) {
        e.burst = def.burst;
        e.burstT = 0;
        e.fireCd = rand(def.cd[0], def.cd[1]);
        e.shootAt = e.siege;
      }
      // Grenadiers lob them at your defences too.
      if (e.siege && e.type === 'grenadier' && e.grenCd <= 0) {
        const sx = e.siege.x + e.siege.w / 2;
        const sy = e.siege.y + e.siege.h / 2;
        const sd = dist(e.x, e.y, sx, sy);
        if (sd > 110 && sd < 400) {
          e.grenCd = rand(def.grenade[0], def.grenade[1]);
          launchGrenade(e.x, e.y, sx + rand(-20, 20), sy + rand(-20, 20), 'e', 2.6);
          A.play('throw', 0.6);
        }
      }

      // Grenades: grenadiers love them; the rest use them to flush you out of cover.
      if (!def.static && e.type !== 'sniper' && e.grenCd <= 0 && e.canSee && d > 130 && d < 400 && (e.type === 'grenadier' || !e.canHit)) {
        e.grenCd = def.grenade ? rand(def.grenade[0], def.grenade[1]) : rand(12, 20);
        const miss = 40 / G.diff.aim;
        launchGrenade(e.x, e.y, p.x + rand(-miss, miss), p.y + rand(-miss, miss), 'e', 2.6);
        A.play('throw', 0.6);
      }
    }
  }

  function enemyShoot(e, d) {
    const p = G.player;
    const def = e.def;
    const S = def.shot;
    if (e.shootAt) {
      // Shooting at something you built.
      const o = e.shootAt;
      if (o.dead) { e.burst = 0; e.shootAt = null; return; }
      const fa = (def.tank ? e.ta : angleTo(e.x, e.y, o.x + o.w / 2, o.y + o.h / 2)) + rand(-S.spread, S.spread);
      if (!def.tank) e.a = fa;
      const ox = e.x + Math.cos(fa) * 14;
      const oy = e.y + Math.sin(fa) * 14;
      G.bullets.push({ x: ox, y: oy, ox, oy, vx: Math.cos(fa) * S.speed, vy: Math.sin(fa) * S.speed, travel: 0,
        range: def.range * 1.15, dmg: S.dmg * G.diff.dmg, owner: 'e', pierce: 0, src: e.type });
      e.flash = 0.06;
      A.play(def.sound === 'bolt' ? 'rifle' : def.sound, clamp(1 - dist(e.x, e.y, p.x, p.y) / 1300, 0.08, 0.6));
      return;
    }
    // Lead the target a bit and miss a bit, depending on difficulty and how fast you're moving.
    const lead = rand(0.3, 0.8);
    const t = d / S.speed;
    const tx = p.x + p.vx * t * lead;
    const ty = p.y + p.vy * t * lead;
    let a = angleTo(e.x, e.y, tx, ty);
    const miss = (10 + Math.min(1, p.moving / PLAYER_SPEED) * 18) * def.aim / G.diff.aim;
    a += Math.atan2(rand(-miss, miss), Math.max(d, 60));
    if (def.static) {
      e.sweep += 0.6;
      a += Math.sin(e.sweep) * 0.05;
    }
    a += rand(-S.spread, S.spread) / G.diff.aim;
    let ox = e.x;
    let oy = e.y;
    let fa = a;
    if (def.tank) {
      fa = e.ta + rand(-S.spread, S.spread);
      ox = e.x + Math.cos(e.ta) * 14;
      oy = e.y + Math.sin(e.ta) * 14;
    } else {
      e.a = a;
    }
    G.bullets.push({ x: ox, y: oy, ox, oy, vx: Math.cos(fa) * S.speed, vy: Math.sin(fa) * S.speed, travel: 0,
      range: def.range * 1.15, dmg: S.dmg * G.diff.dmg, owner: 'e', pierce: 0, sniper: !!def.telegraph, src: e.type });
    e.flash = 0.06;
    const vol = clamp(1 - d / 1300, 0.08, 0.7);
    A.play(def.sound === 'bolt' && !def.telegraph ? 'rifle' : def.sound, vol);
    if (!def.tank) puff(e.x + Math.cos(e.a) * 22, e.y + Math.sin(e.a) * 22, 'rgba(220,215,200,0.6)', 2, 0.3, 30, e.a);
  }

  function updateTank(e, d, dt) {
    const p = G.player;
    const def = e.def;
    const W = G.world;
    const toP = angleTo(e.x, e.y, p.x, p.y);
    const sieging = e.siege && !(e.canSee && d < def.range);
    const sx = e.siege ? e.siege.x + e.siege.w / 2 : 0;
    const sy = e.siege ? e.siege.y + e.siege.h / 2 : 0;
    const toS = sieging ? angleTo(e.x, e.y, sx, sy) : 0;
    // Turret tracks you whether or not the hull is moving.
    e.ta = turnTo(e.ta, sieging ? toS : e.canSee ? toP : e.a, 1.0 * dt);

    // Hull: drive into range, then hold.
    let want = null;
    if (!e.canSee || d > def.keep[1]) {
      want = pathDir(e, toP);
    } else if (d < def.keep[0]) {
      want = toP + Math.PI;
    }
    if (sieging && dist(e.x, e.y, sx, sy) < def.range * 0.75) want = null;
    if (want != null) {
      const back = Math.abs(angleDiff(e.a, want)) > 2.2 && d < def.keep[0];
      const target = back ? want + Math.PI : want;
      e.a = turnTo(e.a, target, 0.9 * dt);
      if (Math.abs(angleDiff(e.a, target)) < 0.5) {
        const sp = def.speed * (back ? -0.7 : 1);
        const bx = e.x;
        const by = e.y;
        // Tanks flatten crates and barrels in their way.
        W.query(e.x - e.r - 10, e.y - e.r - 10, e.x + e.r + 10, e.y + e.r + 10, (o) => {
          // ...and sandbags you built, but your tank traps stop them.
          if ((o.kind === 'crate' || o.kind === 'barrel' || (o.kind === 'hedgehog' && !o.built) || (o.kind === 'sandbag' && o.built)) && !o.dead) {
            const cx = clamp(e.x, o.x, o.x + o.w);
            const cy = clamp(e.y, o.y, o.y + o.h);
            if (dist(e.x, e.y, cx, cy) < e.r + 4) destroyObstacle(o);
          }
        });
        W.move(e, Math.cos(e.a) * sp * dt, Math.sin(e.a) * sp * dt, e.r);
        const moved = dist(bx, by, e.x, e.y);
        if (G.base) W.wires = W.wires.filter((w) => !(w.built && e.x > w.x - e.r && e.x < w.x + w.w + e.r && e.y > w.y - e.r && e.y < w.y + w.h + e.r));
        e.tread += moved * (back ? -1 : 1);
        e.trackD = (e.trackD || 0) + moved;
        if (e.trackD > 14) {
          e.trackD = 0;
          W.decal({ t: 'track', x: e.x, y: e.y, a: e.a, r: 30, w: def.big ? 22 : 19, snow: W.themeName === 'snow' });
        }
        // Stuck on something: turn away.
        if (moved < sp * dt * 0.2) {
          e.stuckT += dt;
          if (e.stuckT > 1) { e.a += rand(-1.5, 1.5); e.stuckT = 0; }
        } else e.stuckT = 0;
      }
    }
    // Shove the player out of the way.
    const pd = dist(p.x, p.y, e.x, e.y);
    if (pd < e.r + p.r + 4 && pd > 0) {
      p.x = e.x + ((p.x - e.x) / pd) * (e.r + p.r + 4);
      p.y = e.y + ((p.y - e.y) / pd) * (e.r + p.r + 4);
    }

    if (e.react > 0 || (p.dead && !sieging)) return;
    // Main gun: a red line shows where it's about to fire.
    e.cannonCd -= dt;
    if (e.cannonTele > 0) {
      e.cannonTele -= dt;
      if (e.cannonTele <= 0) {
        const C = def.cannon;
        const bx = e.x + Math.cos(e.ta) * 60;
        const by = e.y + Math.sin(e.ta) * 60;
        G.shells.push({ x: bx, y: by, tx: e.teleTarget.x, ty: e.teleTarget.y, a: e.ta, speed: 1000, dmg: C.dmg * G.diff.dmg, splash: C.splash, owner: 'e' });
        e.flash = 0.1;
        e.recoil = 1;
        e.cannonCd = rand(C.cd[0], C.cd[1]);
        A.play('cannon', clamp(1 - d / 1400, 0.2, 1));
        G.cam.shake = Math.max(G.cam.shake, 6 * clamp(1 - d / 900, 0, 1));
        for (let i = 0; i < 10; i++) puff(bx, by, 'rgba(200,195,185,0.7)', 10, 1.2, 80, e.ta + rand(-0.8, 0.8));
      }
    } else if (e.cannonCd <= 0 && sieging && Math.abs(angleDiff(e.ta, toS)) < 0.1) {
      e.cannonTele = def.cannon.telegraph;
      e.teleTarget = { x: sx, y: sy };
    } else if (e.cannonCd <= 0 && e.canSee && d < def.range && Math.abs(angleDiff(e.ta, toP)) < 0.1) {
      e.cannonTele = def.cannon.telegraph;
      const lead = rand(0.2, 0.6);
      const tt = def.cannon.telegraph + d / 1000;
      const tx = p.x + p.vx * tt * lead;
      const ty = p.y + p.vy * tt * lead;
      const range = Math.min(dist(e.x, e.y, tx, ty), def.range);
      e.teleTarget = { x: e.x + Math.cos(e.ta) * range, y: e.y + Math.sin(e.ta) * range };
    }
    // Hull machine gun.
    e.fireCd -= dt;
    if (e.burst > 0) {
      e.burstT -= dt;
      if (e.burstT <= 0) { e.burst--; e.burstT = def.burstGap; enemyShoot(e, d); }
    } else if (e.fireCd <= 0 && e.canHit && d < 480 && Math.abs(angleDiff(e.ta, toP)) < 0.3) {
      e.burst = def.burst;
      e.fireCd = rand(def.cd[0], def.cd[1]);
    }
  }

  function damageEnemy(e, dmg, explosive, fromX, fromY) {
    if (e.dead) return;
    if (!explosive && e.def.bulletArmor) {
      dmg *= e.def.bulletArmor;
      if (e.def.tank) A.play('clang', 0.4);
    }
    e.hp -= dmg;
    e.hurt = 0.1;
    if (!e.alert) wake(e);
    if (fromX != null && !e.def.static && !e.def.tank && !e.canSee) e.a = angleTo(e.x, e.y, fromX, fromY);
    if (e.hp <= 0) killEnemy(e);
  }

  function killEnemy(e) {
    e.dead = true;
    const def = e.def;
    G.stats.kills++;
    G.stats.score += def.score;
    G.player.art = Math.min(1, G.player.art + (def.tank ? 0.5 : 0.12));
    text(e.x, e.y - 22, '+' + def.score, def.tank ? '#FFB347' : '#FFE08A');
    if (G.base) FL.base.onKill(e);
    if (def.tank) {
      explode(e.x, e.y, 120, 60, 'x');
      const L = def.big ? 88 : 76;
      const Wd = def.big ? 60 : 52;
      const horiz = Math.abs(Math.cos(e.a)) > 0.7;
      const o = G.world.add('wreck', e.x - (horiz ? L : Wd) / 2, e.y - (horiz ? Wd : L) / 2, horiz ? L : Wd, horiz ? Wd : L,
        { angle: horiz ? (Math.cos(e.a) > 0 ? e.a : e.a - Math.PI) : 0 });
      o.burn = 30;
      G.world.buildNav();
      G.world.flowTarget = -1;
      banner(def.name + ' destroyed!', '');
    } else {
      G.corpses.push({ x: e.x, y: e.y, a: e.a + rand(-0.4, 0.4), side: G.world.themeName === 'snow' ? 'snow' : 'axis', t: 0, officer: e.type === 'officer' });
      if (G.corpses.length > 60) G.corpses.shift();
      // Drops.
      if (def.drop) {
        for (const id of Object.keys(def.drop)) {
          if (chance(def.drop[id])) { addPickup('weapon', e.x + rand(-8, 8), e.y + rand(-8, 8), { weapon: id }); break; }
        }
      }
      if (chance(def.medkit || 0.07)) addPickup('medkit', e.x + rand(-12, 12), e.y + rand(-12, 12));
      else if (chance(0.15)) addPickup('ammo', e.x + rand(-12, 12), e.y + rand(-12, 12));
      else if (chance(0.06)) addPickup('grenade', e.x + rand(-12, 12), e.y + rand(-12, 12));
    }
  }

  /* ===================== Projectiles ===================== */

  // Closest point of the segment to a circle; returns t (0–1) or -1.
  function segCircle(x0, y0, x1, y1, cx, cy, r) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const L2 = dx * dx + dy * dy || 1;
    const t = clamp(((cx - x0) * dx + (cy - y0) * dy) / L2, 0, 1);
    const px = x0 + dx * t;
    const py = y0 + dy * t;
    return (px - cx) * (px - cx) + (py - cy) * (py - cy) < r * r ? t : -1;
  }

  function updateBullets(dt) {
    const W = G.world;
    const p = G.player;
    for (let i = G.bullets.length - 1; i >= 0; i--) {
      const b = G.bullets[i];
      const nx = b.x + b.vx * dt;
      const ny = b.y + b.vy * dt;
      const seg = Math.hypot(nx - b.x, ny - b.y);
      const hit = W.segHit(b.x, b.y, nx, ny, 'shot', Math.max(0, LOW_SKIP - b.travel));
      let tHit = hit ? hit.t : 2;
      let unit = null;
      if (b.owner !== 'e') {
        for (const e of G.enemies) {
          if (e.dead || (b.hitSet && b.hitSet.includes(e))) continue;
          const t = segCircle(b.x, b.y, nx, ny, e.x, e.y, e.r + 3);
          if (t >= 0 && t < tHit) { tHit = t; unit = e; }
        }
      } else if (!p.dead) {
        const t = segCircle(b.x, b.y, nx, ny, p.x, p.y, p.r);
        if (t >= 0 && t < tHit) { tHit = t; unit = p; }
        // Near misses crack past you.
        if (!unit && segCircle(b.x, b.y, nx, ny, p.x, p.y, 40) >= 0 && !b.cracked) { b.cracked = true; A.play('hit', 0.25); }
      }
      if (unit) {
        const hx = b.x + (nx - b.x) * tHit;
        const hy = b.y + (ny - b.y) * tHit;
        if (unit === p) {
          hurtPlayer(b.dmg, b.ox, b.oy, b.src);
          G.bullets.splice(i, 1);
          continue;
        }
        if (b.owner === 'p') {
          G.stats.hits++;
          G.hitMarker = 0.12;
        }
        damageEnemy(unit, b.dmg * (b.travel > b.range * 0.75 ? 0.8 : 1), false, b.ox, b.oy);
        if (unit.def.tank || unit.def.static) sparks(hx, hy, 4);
        else puff(hx, hy, 'rgba(120,30,25,0.7)', 3, 0.35, 50, Math.atan2(b.vy, b.vx));
        A.play('hit', 0.5);
        if (b.pierce > 0) {
          b.pierce--;
          (b.hitSet || (b.hitSet = [])).push(unit);
          b.dmg *= 0.7;
        } else {
          G.bullets.splice(i, 1);
          continue;
        }
      }
      if (hit && !unit) {
        const hx = b.x + (nx - b.x) * hit.t;
        const hy = b.y + (ny - b.y) * hit.t;
        const o = hit.o;
        const color = o.kind === 'sandbag' ? 'rgba(190,170,120,0.8)' : o.kind === 'hedge' || o.kind === 'tree' ? 'rgba(80,110,50,0.8)' : 'rgba(170,160,145,0.8)';
        puff(hx, hy, color, 3, 0.4, 40, Math.atan2(hit.ny, hit.nx) + rand(-0.6, 0.6));
        if (o.kind === 'wreck' || o.kind === 'concrete') sparks(hx, hy, 2);
        if (o.built) {
          if (b.owner === 'e') FL.base.damage(o, b.dmg);
        } else if (o.hp && b.owner === 'p') {
          o.hp -= b.dmg;
          if (o.hp <= 0) destroyObstacle(o);
        }
        G.bullets.splice(i, 1);
        continue;
      }
      b.x = nx;
      b.y = ny;
      b.travel += seg;
      if (b.travel > b.range) {
        puff(b.x, b.y, 'rgba(170,150,120,0.6)', 2, 0.3, 20, 0);
        G.bullets.splice(i, 1);
      }
    }
  }

  function updateRockets(dt) {
    const W = G.world;
    for (let i = G.rockets.length - 1; i >= 0; i--) {
      const r = G.rockets[i];
      const step = r.speed * dt;
      const nx = r.x + Math.cos(r.a) * step;
      const ny = r.y + Math.sin(r.a) * step;
      const travel = dist(r.ox, r.oy, r.x, r.y);
      const hit = W.segHit(r.x, r.y, nx, ny, 'shot', Math.max(0, LOW_SKIP - travel));
      let t = hit ? hit.t : 2;
      for (const e of G.enemies) {
        if (e.dead) continue;
        const te = segCircle(r.x, r.y, nx, ny, e.x, e.y, e.r + 4);
        if (te >= 0 && te < t) t = te;
      }
      if (t <= 1) {
        const hx = r.x + (nx - r.x) * t - Math.cos(r.a) * 4;
        const hy = r.y + (ny - r.y) * t - Math.sin(r.a) * 4;
        G.rockets.splice(i, 1);
        if (r.owner === 'p') G.stats.hits++;
        explode(hx, hy, r.splash, r.dmg, r.owner);
        continue;
      }
      r.x = nx;
      r.y = ny;
      if (!r.shell) r.speed = Math.min(900, r.speed + 500 * dt);
      if (!r.shell) G.particles.push({ x: r.x - Math.cos(r.a) * 10, y: r.y - Math.sin(r.a) * 10, vx: rand(-15, 15), vy: rand(-15, 15), life: 0.7, max: 0.7, size: 5, grow: 14, color: 'rgba(210,205,195,0.55)', type: 'smoke', drag: 1 });
      if (travel > 950) { G.rockets.splice(i, 1); explode(r.x, r.y, r.splash, r.dmg, r.owner); }
    }
  }

  function updateShells(dt) {
    for (let i = G.shells.length - 1; i >= 0; i--) {
      const s = G.shells[i];
      const step = s.speed * dt;
      const left = dist(s.x, s.y, s.tx, s.ty);
      const nx = s.x + Math.cos(s.a) * Math.min(step, left);
      const ny = s.y + Math.sin(s.a) * Math.min(step, left);
      const hit = G.world.segHit(s.x, s.y, nx, ny, 'sight');
      if (hit || left <= step) {
        const hx = hit ? s.x + (nx - s.x) * hit.t : s.tx;
        const hy = hit ? s.y + (ny - s.y) * hit.t : s.ty;
        G.shells.splice(i, 1);
        explode(hx, hy, s.splash, s.dmg, 'e');
        continue;
      }
      s.x = nx;
      s.y = ny;
    }
  }

  function updateGrenades(dt) {
    const W = G.world;
    for (let i = G.grenades.length - 1; i >= 0; i--) {
      const g = G.grenades[i];
      g.fuse -= dt;
      g.rot += g.spin * dt;
      if (g.z > 0 || g.vz > 0) {
        g.vz -= 900 * dt;
        g.z += g.vz * dt;
        if (g.z <= 0) {
          g.z = 0;
          g.vz = Math.abs(g.vz) * 0.25;
          if (g.vz < 40) g.vz = 0;
          g.vx *= 0.45;
          g.vy *= 0.45;
          g.spin *= 0.5;
          A.play('bounce', 0.4);
        }
      } else {
        const f = Math.pow(0.04, dt);
        g.vx *= f;
        g.vy *= f;
      }
      const nx = g.x + g.vx * dt;
      const ny = g.y + g.vy * dt;
      // High in the air it sails over cover; low, it bounces off.
      const hit = g.z < 18 ? W.segHit(g.x, g.y, nx, ny, 'move') : null;
      if (hit) {
        if (hit.nx) g.vx = -g.vx * 0.4;
        if (hit.ny) g.vy = -g.vy * 0.4;
        g.x += g.vx * dt * 0.5;
        g.y += g.vy * dt * 0.5;
      } else {
        g.x = clamp(nx, 4, W.w - 4);
        g.y = clamp(ny, 4, W.h - 4);
      }
      if (g.fuse <= 0) {
        G.grenades.splice(i, 1);
        explode(g.x, g.y, GRENADE_R, g.owner === 'p' ? 210 : 80 * G.diff.dmg, g.owner);
      }
    }
  }

  function updateStrikes(dt) {
    for (let i = G.strikes.length - 1; i >= 0; i--) {
      const s = G.strikes[i];
      s.t += dt;
      s.next -= dt;
      if (s.next <= 0 && s.n > 0) {
        s.n--;
        s.next = rand(0.2, 0.4);
        const x = s.x + rand(-110, 110);
        const y = s.y + rand(-110, 110);
        A.play('whistle', 0.5);
        later(0.65, () => explode(x, y, 120, 220, 'a'));
      }
      if (s.n <= 0 && s.next < -1.5) G.strikes.splice(i, 1);
    }
  }

  /* ===================== Explosions ===================== */

  function explode(x, y, radius, dmg, owner) {
    const W = G.world;
    const p = G.player;
    for (const e of G.enemies) {
      if (e.dead) continue;
      const d = dist(x, y, e.x, e.y) - e.r;
      if (d > radius) continue;
      if (!W.sight(x, y, e.x, e.y)) continue;
      const k = 1 - Math.max(0, d) / radius;
      const f = owner === 'e' ? 0.5 : 1;
      damageEnemy(e, dmg * (0.35 + 0.65 * k) * f, true, x, y);
    }
    if (!p.dead) {
      const d = dist(x, y, p.x, p.y) - p.r;
      if (d < radius && W.sight(x, y, p.x, p.y)) {
        const k = 1 - Math.max(0, d) / radius;
        const f = owner === 'e' ? 1 : owner === 'p' ? 0.35 : owner === 'x' ? 0.6 : owner === 't' ? 0 : 0.3;
        if (f) hurtPlayer(dmg * (0.3 + 0.7 * k) * f, x, y, 'boom-' + owner);
      }
    }
    // Crates splinter, barrels go up.
    W.query(x - radius, y - radius, x + radius, y + radius, (o) => {
      if (!o.hp || o.dead) return;
      // Your own explosives don't wreck your own outpost.
      if (o.built && owner !== 'e') return;
      const cx = clamp(x, o.x, o.x + o.w);
      const cy = clamp(y, o.y, o.y + o.h);
      if (dist(x, y, cx, cy) < radius * 0.8) {
        if (o.built) { FL.base.damage(o, dmg * 0.8); return; }
        o.hp -= dmg;
        if (o.hp <= 0) later(o.explodes ? 0.15 : 0, () => destroyObstacle(o));
      }
    });
    alertAround(x, y, 650);
    W.decal({ t: 'crater', x, y, r: radius * 0.32 });
    W.decal({ t: 'scorch', x, y, r: radius * 0.7 });
    // Fireball, smoke, dirt.
    G.particles.push({ x, y, vx: 0, vy: 0, life: 0.18, max: 0.18, size: radius * 0.9, color: 'rgba(255,240,200,0.9)', type: 'flash' });
    for (let i = 0; i < 14; i++) {
      const a = rand(0, TAU);
      const s = rand(30, 160);
      G.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.3, 0.6), max: 0.6, size: rand(10, 22), grow: 20, color: U.pick(['#FFB347', '#FF8C2A', '#FFD27A']), type: 'fire', drag: 3 });
    }
    for (let i = 0; i < 12; i++) {
      const a = rand(0, TAU);
      const s = rand(20, 90);
      G.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(1.2, 2.6), max: 2.6, size: rand(12, 24), grow: 26, color: 'rgba(70,64,58,0.5)', type: 'smoke', drag: 1.5 });
    }
    for (let i = 0; i < 16; i++) {
      const a = rand(0, TAU);
      const s = rand(120, 320);
      G.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.4, 0.8), max: 0.8, size: rand(2, 4), color: U.pick(['#4A3F33', '#6B5D4A', '#2E2A25']), type: 'debris', drag: 3 });
    }
    const pd = dist(x, y, p.x, p.y);
    A.play('boom', clamp(1.1 - pd / 1200, 0.15, 1));
    if (FL.save.data.settings.shake) G.cam.shake = Math.max(G.cam.shake, 16 * clamp(1 - pd / 700, 0, 1));
  }

  function destroyObstacle(o) {
    if (o.dead) return;
    G.world.remove(o);
    const cx = o.x + o.w / 2;
    const cy = o.y + o.h / 2;
    if (o.explodes) {
      explode(cx, cy, 110, 120, 'x');
      return;
    }
    for (let i = 0; i < 10; i++) {
      const a = rand(0, TAU);
      G.particles.push({ x: cx, y: cy, vx: Math.cos(a) * rand(40, 160), vy: Math.sin(a) * rand(40, 160), life: 0.6, max: 0.6, size: rand(2, 5), color: '#7A5A36', type: 'debris', drag: 4 });
    }
    G.world.decal({ t: 'rubble', x: cx, y: cy, r: 30, color: 'rgba(110,85,55,0.8)' });
    if (o.built) {
      A.play('hit', 0.6);
      FL.base.destroyed(o);
      return;
    }
    if (o.ammo) addPickup('ammo', cx, cy);
    else if (chance(0.25)) addPickup(chance(0.5) ? 'ammo' : 'grenade', cx, cy);
    A.play('hit', 0.6);
  }

  // Run fn after t seconds of game time (so pausing pauses it too).
  function later(t, fn) {
    G.later.push({ t, fn });
  }

  /* ===================== Particles ===================== */

  function puff(x, y, color, n, life, speed, a) {
    for (let i = 0; i < n; i++) {
      const aa = a + rand(-0.7, 0.7);
      const s = rand(speed * 0.3, speed);
      G.particles.push({ x, y, vx: Math.cos(aa) * s, vy: Math.sin(aa) * s, life: life * rand(0.6, 1), max: life, size: rand(2, 4), grow: 8, color, type: 'dust', drag: 4 });
    }
  }

  function sparks(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const s = rand(80, 220);
      G.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.2, max: 0.2, size: 1.5, color: '#FFE08A', type: 'spark', drag: 2 });
    }
  }

  function text(x, y, s, color) {
    G.texts.push({ x, y, s, color, t: 0 });
  }

  function updateParticles(dt) {
    for (let i = G.particles.length - 1; i >= 0; i--) {
      const q = G.particles[i];
      q.life -= dt;
      if (q.life <= 0) {
        if (q.type === 'casing' && chance(0.3)) G.world.decal({ t: 'shell', x: q.x, y: q.y, r: 2 });
        G.particles.splice(i, 1);
        continue;
      }
      const f = q.drag ? Math.exp(-q.drag * dt) : 1;
      q.vx *= f;
      q.vy *= f;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      if (q.grow) q.size += q.grow * dt;
    }
    if (G.particles.length > 900) G.particles.splice(0, G.particles.length - 900);
    for (let i = G.texts.length - 1; i >= 0; i--) {
      G.texts[i].t += dt;
      if (G.texts[i].t > 1) G.texts.splice(i, 1);
    }
    // Burning wrecks.
    for (const o of G.world.obstacles) {
      if (!o.burn || o.dead) continue;
      o.burn -= dt;
      if (Math.random() < dt * 12) {
        G.particles.push({ x: o.x + o.w / 2 + rand(-10, 10), y: o.y + o.h / 2 + rand(-10, 10), vx: rand(-10, 10) + 14, vy: rand(-30, -10), life: 2.4, max: 2.4, size: 8, grow: 18, color: 'rgba(40,36,32,0.45)', type: 'smoke', drag: 0.5 });
        if (Math.random() < 0.4) G.particles.push({ x: o.x + o.w / 2 + rand(-12, 12), y: o.y + o.h / 2 + rand(-12, 12), vx: 0, vy: -10, life: 0.5, max: 0.5, size: 7, grow: 6, color: U.pick(['#FF8C2A', '#FFB347']), type: 'fire', drag: 1 });
      }
    }
  }

  /* ===================== Main update ===================== */

  function update(dt) {
    if (!G || G.paused) return;
    dt = Math.min(dt, 0.05);
    G.t += dt;
    const p = G.player;
    input.update(worldToScreen(p.x, p.y));
    if (G.base) FL.base.handleInput(input);
    // AFK mode drives whenever you aren't touching the controls yourself.
    G.afk = !!FL.save.data.settings.afk && !input.sticks.left && !input.sticks.right && !input.move.x && !input.move.y && !input.mouse.down;
    if (G.afk) FL.afk.control(G, input, dt);
    else if (FL.save.data.settings.autoFire && !input.firing) autoFire(dt);
    if (!G.ended) G.stats.time += dt;
    updatePlayer(dt);
    updateEnemies(dt);
    updateBullets(dt);
    updateRockets(dt);
    updateShells(dt);
    updateGrenades(dt);
    updateStrikes(dt);
    for (let i = G.later.length - 1; i >= 0; i--) {
      const l = G.later[i];
      l.t -= dt;
      if (l.t <= 0) { G.later.splice(i, 1); l.fn(); }
    }
    updateParticles(dt);
    updateObjective(dt);

    // Distant artillery for atmosphere.
    G.rumbleT -= dt;
    if (G.rumbleT <= 0) {
      G.rumbleT = rand(5, 12);
      A.play('rumble', 0.5);
    }
    for (let i = G.hits.length - 1; i >= 0; i--) {
      G.hits[i].t -= dt * 1.2;
      if (G.hits[i].t <= 0) G.hits.splice(i, 1);
    }
    G.hitMarker = Math.max(0, (G.hitMarker || 0) - dt);
    G.bannerT -= dt;
    if (G.bannerT <= 0 && !hud.banner.hidden) hud.banner.hidden = true;
    if (G.hintT > 0) {
      G.hintT -= dt;
      if (G.hintT <= 0) hud.hint.hidden = true;
    }

    // Camera: follow, look a little ahead of your aim.
    const s = FL.save.data.settings;
    const look = input.aimActive || input.firing ? 90 : 30;
    const tx = p.x + Math.cos(p.a) * look;
    const ty = p.y + Math.sin(p.a) * look;
    const k = 1 - Math.exp(-dt * 6);
    G.cam.x += (tx - G.cam.x) * k;
    G.cam.y += (ty - G.cam.y) * k;
    G.cam.shake = s.shake ? Math.max(0, G.cam.shake - dt * 30) : 0;

    if (G.ended) {
      G.endT -= dt;
      if (G.endT <= 0 && G.onEnd) {
        const cb = G.onEnd;
        G.onEnd = null;
        cb(G.result);
      }
    }
    updateHud(false);
  }

  /* ===================== Camera ===================== */

  function camScale() {
    return clamp(Math.hypot(cw, ch) / 1000, 0.62, 2.0);
  }

  function camOrigin() {
    const k = camScale();
    const vw = cw / k;
    const vh = ch / k;
    const W = G.world;
    let x = G.cam.x - vw / 2;
    let y = G.cam.y - vh / 2;
    x = vw >= W.w ? (W.w - vw) / 2 : clamp(x, 0, W.w - vw);
    y = vh >= W.h ? (W.h - vh) / 2 : clamp(y, 0, W.h - vh);
    return { x, y, k, vw, vh };
  }

  function worldToScreen(x, y) {
    const c = camOrigin();
    return { x: (x - c.x) * c.k, y: (y - c.y) * c.k };
  }

  function screenToWorld(x, y) {
    const r = canvas.getBoundingClientRect();
    const c = camOrigin();
    return { x: (x - r.left) / c.k + c.x, y: (y - r.top) / c.k + c.y };
  }

  /* ===================== Drawing ===================== */

  function render() {
    if (!G) return;
    const g = ctx;
    const W = G.world;
    const p = G.player;
    const c = camOrigin();
    const sx = G.cam.shake ? rand(-G.cam.shake, G.cam.shake) : 0;
    const sy = G.cam.shake ? rand(-G.cam.shake, G.cam.shake) : 0;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#1A1A16';
    g.fillRect(0, 0, cw, ch);
    g.save();
    g.scale(c.k, c.k);
    g.translate(-c.x + sx / c.k, -c.y + sy / c.k);
    const vx = c.x - 60;
    const vy = c.y - 60;
    const vw = c.vw + 120;
    const vh = c.vh + 120;

    W.drawGround(g, c.x, c.y, c.vw, c.vh);

    // Objective zone.
    const o = objective();
    if (o && (o.type === 'reach' || o.type === 'hold') && !G.ended) {
      const z = G.zones[o.zone];
      const r = o.type === 'hold' ? o.radius || z.r : z.r;
      g.save();
      g.strokeStyle = 'rgba(255,215,90,0.85)';
      g.lineWidth = 3;
      g.setLineDash([14, 10]);
      g.lineDashOffset = -G.t * 20;
      g.beginPath(); g.arc(z.x, z.y, r, 0, TAU); g.stroke();
      g.fillStyle = 'rgba(255,215,90,0.08)';
      g.fill();
      g.restore();
      g.fillStyle = 'rgba(255,225,130,0.95)';
      g.font = 'bold 14px "Black Ops One", sans-serif';
      g.textAlign = 'center';
      g.fillText(z.label.toUpperCase(), z.x, z.y - r - 8);
    }

    for (const w of W.wires) if (w.x < vx + vw && w.x + w.w > vx && w.y < vy + vh && w.y + w.h > vy) art.wire(g, w);

    // Cover.
    const vis = [];
    W.query(vx, vy, vx + vw, vy + vh, (ob) => { if (!ob.dead && ob.kind !== 'water') vis.push(ob); });
    for (const ob of vis) art.cover(g, ob, W.themeName);
    if (G.base) FL.base.draw(g);

    for (const k of G.pickups) if (k.x > vx && k.x < vx + vw && k.y > vy && k.y < vy + vh) art.pickup(g, k, G.t);
    for (const cp of G.corpses) art.soldier(g, cp.x, cp.y, cp.a, { dead: true, side: cp.side });

    // Enemies.
    for (const e of G.enemies) {
      if (e.dead || e.x < vx - 60 || e.x > vx + vw + 60 || e.y < vy - 60 || e.y > vy + vh + 60) continue;
      if (e.def.tank) {
        art.tank(g, e.x, e.y, e.a, e.ta, { big: e.def.big, tread: e.tread, flash: e.flash, recoil: e.recoil, hurt: e.hurt, snow: W.themeName === 'snow', num: e.num });
      } else if (e.def.static) {
        art.soldier(g, e.x, e.y, e.a, { gun: 'mg', flash: e.flash, side: 'axis', hurt: e.hurt });
        // The MG on its bipod.
        g.save();
        g.translate(e.x, e.y);
        g.rotate(e.a);
        g.fillStyle = '#1F1E1B';
        g.fillRect(10, -2.5, 30, 5);
        g.fillRect(14, -7, 3, 14);
        g.restore();
      } else {
        const side = W.themeName === 'snow' ? 'snow' : 'axis';
        const gun = e.type === 'smg' ? 'smg' : e.type === 'officer' ? 'pistol' : 'rifle';
        art.soldier(g, e.x, e.y, e.a, { walk: e.walk, gun, flash: e.flash, side, hurt: e.hurt, officer: e.type === 'officer' });
      }
      // Health bar once hurt.
      if (e.hp < e.maxHp) {
        const bw = e.def.tank ? 60 : 26;
        const by = e.y - (e.def.tank ? 46 : 22);
        g.fillStyle = 'rgba(0,0,0,0.5)';
        g.fillRect(e.x - bw / 2, by, bw, 4);
        g.fillStyle = e.def.tank ? '#FFB347' : '#E5533D';
        g.fillRect(e.x - bw / 2, by, (bw * Math.max(0, e.hp)) / e.maxHp, 4);
      }
      if (!e.alert && !e.def.tank && !e.def.static && e.react <= 0 && dist(e.x, e.y, p.x, p.y) < 500) {
        // Unaware: a little "zzz"-free marker so you know you can sneak up.
        g.fillStyle = 'rgba(255,255,255,0.5)';
        g.font = 'bold 12px sans-serif';
        g.textAlign = 'center';
        g.fillText('?', e.x, e.y - 18);
      }
    }

    // Player.
    if (!p.dead) {
      const W0 = D.WEAPONS[weapon().id];
      const gun = { garand: 'rifle', thompson: 'smg', trench: 'shotgun', bar: 'bar', mp40: 'smg', kar98: 'rifle', pistol: 'pistol', bazooka: 'bazooka' }[W0 && weapon().id];
      // Aim line on touchscreens.
      if (input.touch && input.sticks.right) {
        g.save();
        g.strokeStyle = 'rgba(255,240,180,0.35)';
        g.lineWidth = 2;
        g.setLineDash([6, 8]);
        const hit = W.segHit(p.x, p.y, p.x + Math.cos(p.a) * 400, p.y + Math.sin(p.a) * 400, 'shot', LOW_SKIP);
        const L = hit ? hit.t * 400 : 400;
        g.beginPath();
        g.moveTo(p.x + Math.cos(p.a) * 26, p.y + Math.sin(p.a) * 26);
        g.lineTo(p.x + Math.cos(p.a) * L, p.y + Math.sin(p.a) * L);
        g.stroke();
        g.restore();
      }
      art.soldier(g, p.x, p.y, p.a, { walk: p.walk, gun, flash: p.flash, side: 'us', hurt: p.hurt });
    }

    // Grenades, with a warning ring on theirs.
    for (const gr of G.grenades) {
      const s = 1 + gr.z / 60;
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.beginPath(); g.arc(gr.x + gr.z * 0.3, gr.y + gr.z * 0.4, 4, 0, TAU); g.fill();
      if (gr.owner === 'e') art.stickGrenade(g, gr.x, gr.y - gr.z * 0.3, gr.rot);
      else art.grenadeIcon(g, gr.x, gr.y - gr.z * 0.3, 0.8 * s);
      if (gr.owner === 'e' && gr.z < 30) {
        g.strokeStyle = 'rgba(255,60,40,' + (0.5 + 0.4 * Math.sin(G.t * 20)) + ')';
        g.lineWidth = 2;
        g.beginPath(); g.arc(gr.x, gr.y, GRENADE_R * 0.8, 0, TAU); g.stroke();
      }
    }

    // Tracers.
    g.lineCap = 'round';
    for (const b of G.bullets) {
      const sp = Math.hypot(b.vx, b.vy);
      const L = Math.min(b.travel + 1, b.sniper ? 60 : 26);
      g.strokeStyle = b.owner !== 'e' ? 'rgba(255,236,150,0.95)' : b.sniper ? 'rgba(255,255,255,0.95)' : 'rgba(255,140,90,0.95)';
      g.lineWidth = b.owner === 'p' ? 2 : 2.2;
      g.beginPath();
      g.moveTo(b.x - (b.vx / sp) * L, b.y - (b.vy / sp) * L);
      g.lineTo(b.x, b.y);
      g.stroke();
    }
    for (const r of G.rockets) {
      if (r.shell) {
        g.fillStyle = '#FFE6A0';
        g.beginPath(); g.arc(r.x, r.y, 4, 0, TAU); g.fill();
        continue;
      }
      g.save();
      g.translate(r.x, r.y);
      g.rotate(r.a);
      g.fillStyle = '#3D4128';
      g.fillRect(-10, -2.5, 16, 5);
      g.fillStyle = '#6D6A5C';
      g.beginPath(); g.moveTo(6, -3); g.lineTo(12, 0); g.lineTo(6, 3); g.fill();
      g.fillStyle = 'rgba(255,190,90,0.95)';
      g.beginPath(); g.arc(-12, 0, 4 + Math.random() * 2, 0, TAU); g.fill();
      g.restore();
    }
    for (const s of G.shells) {
      g.fillStyle = '#FFE6A0';
      g.beginPath(); g.arc(s.x, s.y, 4, 0, TAU); g.fill();
    }

    // Particles below the treetops.
    drawParticles(g, false);

    // Tree canopies — see-through when you're under one.
    for (const ob of vis) {
      if (ob.kind !== 'tree') continue;
      const cx = ob.x + ob.w / 2;
      const cy = ob.y + ob.h / 2;
      const under = dist(cx, cy, p.x, p.y) < (ob.canopy || 40) + 6;
      art.canopy(g, ob, W.themeName, under ? 0.35 : 0.95);
    }
    drawParticles(g, true);

    // Warnings: sniper glints and tank gun lines.
    for (const e of G.enemies) {
      if (e.dead) continue;
      if (e.tele > 0) {
        const k = 1 - e.tele / e.def.telegraph;
        g.strokeStyle = 'rgba(255,40,30,' + (0.25 + k * 0.6) + ')';
        g.lineWidth = 1 + k * 1.5;
        g.beginPath(); g.moveTo(e.x, e.y); g.lineTo(p.x, p.y); g.stroke();
        g.fillStyle = 'rgba(255,255,255,' + (0.5 + 0.5 * Math.sin(G.t * 30)) + ')';
        g.beginPath(); g.arc(e.x + Math.cos(e.a) * 20, e.y + Math.sin(e.a) * 20, 3 + k * 3, 0, TAU); g.fill();
      }
      if (e.cannonTele > 0 && e.teleTarget) {
        const k = 1 - e.cannonTele / e.def.cannon.telegraph;
        g.strokeStyle = 'rgba(255,50,30,' + (0.3 + k * 0.6) + ')';
        g.lineWidth = 2 + k * 2;
        g.setLineDash([10, 8]);
        g.beginPath(); g.moveTo(e.x + Math.cos(e.ta) * 50, e.y + Math.sin(e.ta) * 50); g.lineTo(e.teleTarget.x, e.teleTarget.y); g.stroke();
        g.setLineDash([]);
        g.beginPath(); g.arc(e.teleTarget.x, e.teleTarget.y, e.def.cannon.splash * (0.4 + 0.6 * k), 0, TAU); g.stroke();
      }
    }
    for (const s of G.strikes) {
      g.strokeStyle = 'rgba(255,200,60,' + (0.5 + 0.4 * Math.sin(G.t * 12)) + ')';
      g.lineWidth = 3;
      g.setLineDash([8, 8]);
      g.beginPath(); g.arc(s.x, s.y, 120, 0, TAU); g.stroke();
      g.setLineDash([]);
      g.fillStyle = 'rgba(255,90,40,0.8)';
      g.fillRect(s.x - 2, s.y - 14, 4, 28);
      g.fillRect(s.x - 14, s.y - 2, 28, 4);
    }

    // Floating score text.
    g.textAlign = 'center';
    g.font = 'bold 14px "Black Ops One", sans-serif';
    for (const t of G.texts) {
      g.globalAlpha = 1 - t.t;
      g.fillStyle = 'rgba(0,0,0,0.6)';
      g.fillText(t.s, t.x + 1, t.y - t.t * 30 + 1);
      g.fillStyle = t.color;
      g.fillText(t.s, t.x, t.y - t.t * 30);
    }
    g.globalAlpha = 1;
    g.restore();

    drawScreenOverlays(g, c);
    G.miniT -= 1 / 60;
    if (G.miniT <= 0) { G.miniT = 0.15; drawMinimap(); }
  }

  function drawParticles(g, above) {
    for (const q of G.particles) {
      const isAbove = q.type === 'smoke' || q.type === 'flash';
      if (isAbove !== above) continue;
      const k = q.life / q.max;
      if (q.type === 'spark') {
        g.strokeStyle = q.color;
        g.globalAlpha = k;
        g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(q.x, q.y); g.lineTo(q.x - q.vx * 0.03, q.y - q.vy * 0.03); g.stroke();
      } else if (q.type === 'casing' || q.type === 'debris') {
        g.globalAlpha = Math.min(1, k * 2);
        g.fillStyle = q.color;
        g.fillRect(q.x, q.y, q.size, q.size * 0.6);
      } else if (q.type === 'flash') {
        g.globalAlpha = k;
        g.fillStyle = q.color;
        g.beginPath(); g.arc(q.x, q.y, q.size * (1.2 - k * 0.4), 0, TAU); g.fill();
      } else {
        g.globalAlpha = q.type === 'fire' ? k : Math.min(1, k * 1.5);
        g.fillStyle = q.color;
        g.beginPath(); g.arc(q.x, q.y, q.size, 0, TAU); g.fill();
      }
    }
    g.globalAlpha = 1;
  }

  function drawScreenOverlays(g, c) {
    const p = G.player;
    const ps = { x: (p.x - c.x) * c.k, y: (p.y - c.y) * c.k };

    // Which way did that come from?
    for (const h of G.hits) {
      g.strokeStyle = 'rgba(220,30,20,' + h.t * 0.8 + ')';
      g.lineWidth = 6;
      g.beginPath();
      g.arc(ps.x, ps.y, 70, h.a - 0.35, h.a + 0.35);
      g.stroke();
    }

    // Arrow to the objective when it's off screen.
    const tgt = objectiveTarget();
    if (tgt && !G.ended) {
      const tx = (tgt.x - c.x) * c.k;
      const ty = (tgt.y - c.y) * c.k;
      const m = 34;
      if (tx < m || ty < m + 50 || tx > cw - m || ty > ch - m - 40) {
        const a = Math.atan2(ty - ps.y, tx - ps.x);
        const cx = clamp(ps.x + Math.cos(a) * 2000, m, cw - m);
        const cy = clamp(ps.y + Math.sin(a) * 2000, m + 56, ch - m - 60);
        // Walk the ray back onto the screen edge.
        const kx = Math.cos(a) > 0 ? (cw - m - ps.x) / Math.cos(a) : (m - ps.x) / Math.cos(a);
        const ky = Math.sin(a) > 0 ? (ch - m - 60 - ps.y) / Math.sin(a) : (m + 56 - ps.y) / Math.sin(a);
        const kk = Math.min(Math.abs(kx), Math.abs(ky));
        const ax = isFinite(kk) ? ps.x + Math.cos(a) * kk : cx;
        const ay = isFinite(kk) ? ps.y + Math.sin(a) * kk : cy;
        g.save();
        g.translate(ax, ay);
        g.rotate(a);
        g.fillStyle = 'rgba(255,215,90,0.95)';
        g.strokeStyle = 'rgba(0,0,0,0.5)';
        g.lineWidth = 2;
        g.beginPath(); g.moveTo(14, 0); g.lineTo(-8, -10); g.lineTo(-3, 0); g.lineTo(-8, 10); g.closePath();
        g.fill(); g.stroke();
        g.restore();
        g.fillStyle = 'rgba(255,225,130,0.95)';
        g.font = 'bold 11px sans-serif';
        g.textAlign = 'center';
        g.fillText(Math.round(dist(p.x, p.y, tgt.x, tgt.y) / 10) + ' m', ax - Math.cos(a) * 24, ay - Math.sin(a) * 24 + 4);
      }
    }

    // Mouse crosshair.
    if (!input.touch && input.mouse.inside && !G.ended) {
      const r = canvas.getBoundingClientRect();
      const mx = input.mouse.x - r.left;
      const my = input.mouse.y - r.top;
      const W0 = D.WEAPONS[weapon().id];
      const gap = 6 + (W0.spread || 0) * 120 + Math.min(1, p.moving / PLAYER_SPEED) * 6;
      g.strokeStyle = G.hitMarker > 0 ? '#FF5040' : 'rgba(255,255,255,0.9)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(mx - gap - 8, my); g.lineTo(mx - gap, my);
      g.moveTo(mx + gap, my); g.lineTo(mx + gap + 8, my);
      g.moveTo(mx, my - gap - 8); g.lineTo(mx, my - gap);
      g.moveTo(mx, my + gap); g.lineTo(mx, my + gap + 8);
      g.stroke();
    } else if (G.hitMarker > 0) {
      g.strokeStyle = 'rgba(255,80,60,0.9)';
      g.lineWidth = 2;
      const hx = ps.x + Math.cos(p.a) * 60;
      const hy = ps.y + Math.sin(p.a) * 60;
      g.beginPath();
      g.moveTo(hx - 7, hy - 7); g.lineTo(hx - 3, hy - 3);
      g.moveTo(hx + 7, hy - 7); g.lineTo(hx + 3, hy - 3);
      g.moveTo(hx - 7, hy + 7); g.lineTo(hx - 3, hy + 3);
      g.moveTo(hx + 7, hy + 7); g.lineTo(hx + 3, hy + 3);
      g.stroke();
    }

    // Thumbsticks.
    for (const side of ['left', 'right']) {
      const s = input.sticks[side];
      if (!s) continue;
      const r = canvas.getBoundingClientRect();
      const ox = s.ox - r.left;
      const oy = s.oy - r.top;
      let dx = s.x - s.ox;
      let dy = s.y - s.oy;
      const d = Math.hypot(dx, dy);
      const R = input.STICK_R;
      if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
      g.fillStyle = 'rgba(255,255,255,0.08)';
      g.strokeStyle = side === 'right' && input.firing ? 'rgba(255,120,80,0.6)' : 'rgba(255,255,255,0.3)';
      g.lineWidth = 2;
      g.beginPath(); g.arc(ox, oy, R, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = side === 'right' && input.firing ? 'rgba(255,140,90,0.55)' : 'rgba(255,255,255,0.35)';
      g.beginPath(); g.arc(ox + dx, oy + dy, 24, 0, TAU); g.fill();
    }
  }

  function objectiveTarget() {
    const o = objective();
    if (!o) return null;
    const p = G.player;
    if (o.type === 'reach' || o.type === 'hold') return G.zones[o.zone];
    if (o.type === 'base') return dist(p.x, p.y, G.base.hqX, G.base.hqY) > 650 ? { x: G.base.hqX, y: G.base.hqY } : null;
    let list = null;
    if (o.type === 'destroy') list = G.enemies.filter((e) => !e.dead && e.tag === o.tag);
    else if (o.type === 'clear') {
      list = G.enemies.filter((e) => !e.dead);
      if (list.length > 4) return null;
    }
    if (!list || !list.length) return null;
    let best = null;
    let bd = Infinity;
    for (const e of list) {
      const d = dist(p.x, p.y, e.x, e.y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  /* ===================== Minimap ===================== */

  function renderMiniBg() {
    const W = G.world;
    const S = 140;
    const k = S / Math.max(W.w, W.h);
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(W.w * k);
    cv.height = Math.ceil(W.h * k);
    const g = cv.getContext('2d');
    g.fillStyle = W.theme.base;
    g.fillRect(0, 0, cv.width, cv.height);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(0, 0, cv.width, cv.height);
    for (const s of W.ground) {
      if (s.t === 'water') { g.fillStyle = '#3B6A7A'; g.fillRect(s.x * k, s.y * k, s.w * k, s.h * k); }
    }
    for (const o of W.obstacles) {
      if (o.kind === 'water') continue;
      g.fillStyle = o.kind === 'building' ? '#5A3E32' : o.kind === 'hedge' || o.kind === 'tree' ? '#2E3E22' : o.kind === 'sandbag' ? '#8E7E5A' : '#4C4840';
      g.fillRect(o.x * k, o.y * k, Math.max(1, o.w * k), Math.max(1, o.h * k));
    }
    cv.k = k;
    return cv;
  }

  function drawMinimap() {
    const bg = G.miniBg;
    if (mini.width !== bg.width * 2) {
      mini.width = bg.width * 2;
      mini.height = bg.height * 2;
      // Fit inside the CSS max box, keeping the map's shape.
      const cs = getComputedStyle(mini);
      const mw = parseFloat(cs.maxWidth) || 130;
      const mh = parseFloat(cs.maxHeight) || 130;
      const s = Math.min(mw / bg.width, mh / bg.height);
      mini.style.width = Math.round(bg.width * s) + 'px';
      mini.style.height = Math.round(bg.height * s) + 'px';
    }
    const g = mctx;
    const k = bg.k * 2;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(bg, 0, 0, mini.width, mini.height);
    if (G.base) FL.base.drawMini(g, k);
    const o = objective();
    const showAll = o && o.type === 'clear' && G.enemies.filter((e) => !e.dead).length <= 4;
    for (const e of G.enemies) {
      if (e.dead) continue;
      const tagged = o && o.type === 'destroy' && e.tag === o.tag;
      if (!(e.canSee || tagged || showAll)) continue;
      g.fillStyle = tagged ? '#FFD75A' : '#FF4A3A';
      const s = e.def.tank ? 7 : 4;
      g.fillRect(e.x * k - s / 2, e.y * k - s / 2, s, s);
    }
    if (o && (o.type === 'reach' || o.type === 'hold')) {
      const z = G.zones[o.zone];
      g.strokeStyle = '#FFD75A';
      g.lineWidth = 2;
      g.beginPath(); g.arc(z.x * k, z.y * k, Math.max(5, z.r * k), 0, TAU); g.stroke();
    }
    const p = G.player;
    g.fillStyle = '#7CFF9A';
    g.beginPath(); g.arc(p.x * k, p.y * k, 4, 0, TAU); g.fill();
    // View box.
    const c = camOrigin();
    g.strokeStyle = 'rgba(255,255,255,0.4)';
    g.lineWidth = 1;
    g.strokeRect(c.x * k, c.y * k, c.vw * k, c.vh * k);
  }

  /* ===================== HUD ===================== */

  const last = {};
  function set(id, prop, v) {
    const key = id + prop;
    if (last[key] === v) return;
    last[key] = v;
    if (prop === 'text') hud[id].textContent = v;
    else if (prop === 'hidden') hud[id].hidden = v;
    else if (prop === 'width') hud[id].style.width = v;
    else if (prop === 'cls') hud[id].className = v;
    else if (prop === 'opacity') hud[id].style.opacity = v;
  }

  function updateHud(force) {
    if (force) for (const k of Object.keys(last)) delete last[k];
    const p = G.player;
    const w = weapon();
    const W = D.WEAPONS[w.id];
    set('hp-fill', 'width', Math.max(0, p.hp).toFixed(0) + '%');
    set('hp-box', 'cls', 'hp' + (p.hp < 35 ? ' low' : ''));
    set('vignette', 'opacity', String(clamp((60 - p.hp) / 60, 0, 0.85).toFixed(2)));
    set('weapon-name', 'text', W.name);
    set('ammo-mag', 'text', String(w.mag));
    set('ammo-res', 'text', w.reserve === Infinity ? '∞' : String(w.reserve));
    const reloading = p.reloadT > 0;
    set('reload-bar', 'hidden', !reloading);
    if (reloading) hud['reload-fill'].style.width = ((1 - p.reloadT / W.reload) * 100).toFixed(0) + '%';
    set('gren-count', 'text', String(p.grenades));
    set('b-gren', 'cls', 'tbtn gren' + (p.grenades ? '' : ' off'));
    const other = p.weapons[1 - p.cur];
    set('swap-label', 'text', D.WEAPONS[other.id].name);
    set('art-fill', 'width', (p.art * 100).toFixed(0) + '%');
    set('b-art', 'cls', 'tbtn art' + (p.art >= 1 ? ' ready' : ' off'));
    set('b-take', 'hidden', !G.nearWeapon);
    if (G.nearWeapon) set('take-label', 'text', 'Take ' + D.WEAPONS[G.nearWeapon.weapon].name);
    set('score', 'text', G.stats.score.toLocaleString('en-US'));
    set('b-afk', 'cls', 'afk-btn' + (FL.save.data.settings.afk ? ' on' : '') + (G.afk ? ' driving' : ''));

    const o = objective();
    if (o) {
      let sub = '';
      let bar = null;
      if (o.type === 'destroy') {
        const n = G.enemies.filter((e) => !e.dead && e.tag === o.tag).length;
        sub = n + ' left';
      } else if (o.type === 'clear') {
        sub = G.enemies.filter((e) => !e.dead).length + ' enemies left';
      } else if (o.type === 'reach') {
        const z = G.zones[o.zone];
        sub = Math.round(dist(p.x, p.y, z.x, z.y) / 10) + ' m';
      } else if (o.type === 'hold') {
        bar = G.holdT / o.time;
        sub = G.objOutside ? 'Get back to the ' + G.zones[o.zone].label.toLowerCase() + '!' : U.fmtTime(o.time - G.holdT) + ' to go';
      } else if (o.type === 'base') {
        const st = FL.base.status();
        set('obj-text', 'text', st.text);
        set('obj-sub', 'text', st.sub);
        set('obj-sub', 'cls', 'obj-sub' + (st.warn ? ' warn' : ''));
        set('obj-bar', 'hidden', false);
        hud['obj-fill'].style.width = (clamp(st.bar, 0, 1) * 100).toFixed(1) + '%';
        return;
      } else if (o.type === 'survive') {
        const S = G.survival;
        const alive = G.enemies.filter((e) => !e.dead).length;
        sub = S.wave ? 'Wave ' + S.wave + ' · ' + (alive + S.toSpawn) + ' left' : 'Get ready';
      }
      set('obj-text', 'text', o.text);
      set('obj-sub', 'text', sub);
      set('obj-sub', 'cls', 'obj-sub' + (G.objOutside && o.type === 'hold' ? ' warn' : ''));
      set('obj-bar', 'hidden', bar == null);
      if (bar != null) hud['obj-fill'].style.width = (clamp(bar, 0, 1) * 100).toFixed(1) + '%';
    }
  }

  function toggleAfk() {
    const s = FL.save.data.settings;
    s.afk = !s.afk;
    FL.save.write();
    FL.afk.reset();
    banner(s.afk ? 'AFK mode on' : 'AFK mode off', s.afk ? 'Your soldier fights on his own. Touch the controls to take over.' : '');
    A.play('click');
  }

  function banner(t, s) {
    hud['banner-t'].textContent = t;
    hud['banner-s'].textContent = s || '';
    hud.banner.hidden = false;
    hud.banner.classList.remove('pop');
    void hud.banner.offsetWidth;
    hud.banner.classList.add('pop');
    G.bannerT = 2.6;
  }

  function pause(v) {
    if (!G) return;
    G.paused = v;
    input.reset();
  }

  function stop() {
    if (FL.base.active) FL.base.stop();
    input.enabled = false;
    input.reset();
    G = null;
  }

  FL.game = {
    init, start, update, render, pause, stop, resize,
    get active() { return !!G; },
    get state() { return G; },
    get paused() { return G ? G.paused : false; },
  };
})(window.FL);
