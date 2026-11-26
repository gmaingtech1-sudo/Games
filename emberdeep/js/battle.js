/* Emberdeep — the battle you watch. The party stands on the left and each
   hero attacks in their own way (sword lunges, arrows, fireballs, holy
   light, a golem's slam, a dragon's breath…); monsters walk in on the
   right. Tapping strikes with your torch. Gold, kills and floors all go
   through ED.state, the same as the offline simulation. */
(function (ED) {
  'use strict';

  const U = ED.util;
  const A = ED.art;
  const D = ED.data;
  const E = ED.econ;
  const ST = ED.state;
  const { TAU, rand, clamp, rgba, pick } = U;
  const bus = ED.bus;

  let cv = null;
  let g = null;
  let W = 0;
  let H = 0;
  let dpr = 1;
  let ground = 0;
  let bg = null;
  let bgKey = '';
  let scroll = 0;
  let shake = 0;
  let time = 0;
  let vignette = null;

  const heroes = new Map(); // id → { x, y, timer, bucket, pose, lunge, bob }
  let mon = null;
  let fx = [];
  let shots = [];
  let nums = [];
  let motes = [];
  let later = [];
  let wisp = null;
  let tapAcc = 0;
  let cur = null; // this frame's stats, with skill buffs applied

  const S = () => ED.game.S;
  const stats = () => cur || ST.stats(S());
  const audio = (n) => ED.audio && ED.audio.play(n);
  const saver = () => S().settings.saver;

  /* ---------- Glow sprites ---------- */

  const glowCache = new Map();
  function glow(color) {
    let c = glowCache.get(color);
    if (c) return c;
    c = A.canvas(64, 64);
    const gg = c.getContext('2d');
    const gr = gg.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, rgba(color, 1));
    gr.addColorStop(0.25, rgba(color, 0.55));
    gr.addColorStop(0.6, rgba(color, 0.15));
    gr.addColorStop(1, rgba(color, 0));
    gg.fillStyle = gr;
    gg.fillRect(0, 0, 64, 64);
    glowCache.set(color, c);
    return c;
  }
  function drawGlow(color, x, y, r, a) {
    g.globalAlpha = a == null ? 1 : a;
    g.drawImage(glow(color), x - r, y - r, r * 2, r * 2);
    g.globalAlpha = 1;
  }

  /* ---------- Layout ---------- */

  function resize() {
    if (!cv) return;
    const r = cv.getBoundingClientRect();
    W = Math.max(200, r.width);
    H = Math.max(150, r.height);
    dpr = Math.min(saver() ? 1.25 : 2, window.devicePixelRatio || 1);
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    ground = H * A.GROUND;
    bgKey = '';
    vignette = null;
    placeHeroes();
    if (mon) placeMonster(mon);
  }

  // Hero height on screen, in CSS px: a little smaller as the party grows.
  let partySize = 1;
  const heroScale = () => clamp(H * 0.25, 46, 100) / 72 * (1 - 0.022 * Math.max(0, partySize - 3));

  function placeHeroes() {
    const list = D.HEROES.filter((h) => (S().heroes[h.id] || 0) > 0);
    partySize = list.length;
    const k = heroScale();
    const frontX = W * 0.42;
    const cols = Math.max(1, Math.ceil(list.length / 3));
    const col = Math.min(52 * k, (frontX - W * 0.06) / Math.max(1, cols - 0.4));
    const band = H - ground;
    const rows = [ground + band * 0.2, ground + band * 0.5, ground + band * 0.82];
    const order = [1, 0, 2];
    list.forEach((h, i) => {
      const c = Math.floor(i / 3);
      const r = order[i % 3];
      let v = heroes.get(h.id);
      if (!v) {
        v = { timer: rand(0.2, 1.2), bucket: 0, pose: 0, lunge: 0, act: 0, born: time };
        heroes.set(h.id, v);
        burst(frontX - c * col, rows[r] - 30 * k, h.look.trim || '#FFFFFF', 16, 80);
      }
      v.x = frontX - c * col - (r === 0 ? col * 0.4 : r === 2 ? -col * 0.25 : 0);
      v.y = rows[r];
      v.h = h;
    });
    for (const id of [...heroes.keys()]) if (!(S().heroes[id] > 0)) heroes.delete(id);
  }

  /* ---------- Backdrop ---------- */

  function ensureBackdrop() {
    const f = S().floor;
    const { biome, cycle } = E.biomeOf(f);
    const key = biome.id + cycle + '|' + W + 'x' + H + '|' + dpr;
    if (key === bgKey) return;
    bgKey = key;
    bg = A.backdrop(biome, cycle, W, H, dpr);
    bg.biome = biome;
    bg.cycle = cycle;
    motes = [];
  }

  function drawLayer(layer, par) {
    const off = ((scroll * par) % W + W) % W;
    g.drawImage(layer, 0, 0, layer.width, layer.height, -off, 0, W, H);
    g.drawImage(layer, 0, 0, layer.width, layer.height, W - off, 0, W, H);
  }

  /* ---------- Monsters ---------- */

  function monsterFor(f, farming) {
    const { biome, cycle } = E.biomeOf(f);
    const P = A.palette(biome, cycle);
    const boss = E.isBoss(f) && !farming;
    const guardian = boss && E.isGuardian(f);
    const heart = boss && E.isHeart(f);
    let kind;
    let name;
    let color;
    if (heart) {
      kind = 'eye';
      name = 'The Ember Heart';
      color = '#FF7A2E';
    } else if (guardian) {
      kind = biome.guardian[1];
      name = biome.guardian[0];
      color = (biome.mobs.find((m) => m[0] === kind) || biome.mobs[0])[2];
    } else if (boss) {
      const idx = Math.floor(((f - 1) % D.FLOORS_PER_BIOME) / 5);
      const m = biome.mobs[idx % biome.mobs.length];
      kind = m[0];
      name = biome.boss[idx % biome.boss.length];
      color = m[2];
    } else {
      const m = pick(biome.mobs);
      kind = m[0];
      name = m[1];
      color = m[2];
    }
    if (cycle && !heart) {
      color = A.hue(color, P.hueShift);
      if (!boss) name = name + ' ' + roman(cycle + 1);
    }
    return { kind, name, color, boss: heart ? 2 : guardian ? 2 : boss ? 1 : 0, glowC: P.glow };
  }

  function roman(n) {
    const R = [['M', 1000], ['CM', 900], ['D', 500], ['CD', 400], ['C', 100], ['XC', 90], ['L', 50], ['XL', 40], ['X', 10], ['IX', 9], ['V', 5], ['IV', 4], ['I', 1]];
    let s = '';
    for (const [k, v] of R) while (n >= v) { s += k; n -= v; }
    return s;
  }

  const FLYERS = { bat: 1, eye: 1, ghost: 1, jelly: 1, imp: 1 };

  function spawn() {
    const s = S();
    const def = monsterFor(s.floor, s.farming);
    const isBoss = E.isBoss(s.floor) && !s.farming;
    const st = stats();
    if (isBoss && s.bossT == null) s.bossT = st.bossTime;
    mon = Object.assign(def, {
      floor: s.floor, isBoss, maxHp: isBoss ? E.bossHP(s.floor) : E.mobHP(s.floor),
      t: 0, spawn: 0.35, flash: 0, hitX: 0, dying: 0, fly: !!FLYERS[def.kind],
    });
    placeMonster(mon);
    bus.emit('spawn', mon);
    if (isBoss) {
      audio('boss');
      bus.emit('bossIn', mon);
    }
  }

  function placeMonster(m) {
    const scale = m.boss === 2 ? 1.5 : m.boss ? 1.28 : 1;
    m.size = clamp(H * 0.36, 70, 190) * scale; // drawn size of the 130-unit box
    m.x = W * 0.75;
    m.y = ground + (H - ground) * 0.42;
    m.sprScale = Math.max(0.5, (m.size / A.monster.W) * dpr);
  }

  // Top of the monster's body and its centre, for aiming.
  const aimX = () => (mon ? mon.x : W * 0.75);
  const aimY = () => (mon ? mon.y - mon.size * 0.38 - (mon.fly ? H * 0.05 : 0) : ground - 40);

  /* ---------- Damage ---------- */

  function damage(amount, opts) {
    opts = opts || {};
    const s = S();
    if (!mon || mon.dying || !(amount > 0)) return;
    if (mon.isBoss) amount *= stats().bossMult;
    s.hpFrac -= amount / mon.maxHp;
    mon.flash = 0.1;
    mon.hitX = Math.min(8, mon.hitX + (opts.tap ? 3 : 1.5));
    if (S().settings.numbers && (opts.tap || opts.big || nums.length < 24)) {
      number(opts.x != null ? opts.x : aimX() + rand(-20, 20), opts.y != null ? opts.y : aimY() + rand(-25, 10), amount, opts.crit ? 'crit' : opts.tap ? 'tap' : 'hero');
    }
    if (s.hpFrac <= 1e-9) kill();
  }

  function kill() {
    const s = S();
    const m = mon;
    m.dying = 0.4;
    const st = stats();
    const goldMult = st.goldMult;
    const cx = m.x;
    const cy = aimY();
    burst(cx, cy, m.color, saver() ? 10 : 22, 160);
    if (m.isBoss) {
      const r = ST.killBoss(s, st, goldMult);
      coins(cx, cy, 24);
      shake = Math.max(shake, 8);
      audio('bossKill');
      ED.game.haptic([20, 40, 30]);
      bus.emit('bossDown', m, r);
      if (r.relics.length) bus.emit('relics', r.relics, r.first ? 'guardian' : 'boss');
      if (r.heart) bus.emit('heart');
    } else {
      const r = ST.killMob(s, st, goldMult);
      coins(cx, cy, 6);
      audio('kill');
      if (r.floorDone) {
        bus.emit('floor', s.floor, r.leapt);
        audio('floor');
      }
    }
    bus.emit('kill', m);
  }

  function failBoss() {
    const s = S();
    ST.failBoss(s, stats());
    if (mon) {
      mon.dying = 0.5;
      mon.escaped = true;
    }
    audio('fail');
    bus.emit('bossFail');
  }

  /* ---------- Taps ---------- */

  function strike(x, y, auto) {
    const s = S();
    const st = stats();
    if (!auto) {
      s.stats.taps += 1;
      ED.game.haptic(6);
    }
    if (!mon || mon.dying || mon.spawn > 0.2) {
      sparks(x, y, '#FFE6A8', 4);
      return;
    }
    const crit = Math.random() < st.critChance;
    let dmg = st.tap;
    if (crit) {
      dmg *= st.critMult;
      s.stats.crits += 1;
    }
    const hx = auto ? aimX() + rand(-mon.size * 0.25, mon.size * 0.25) : x;
    const hy = auto ? aimY() + rand(-mon.size * 0.2, mon.size * 0.2) : y;
    slash(hx, hy, crit ? '#FFD166' : '#FFF2D6', crit ? 1.5 : 1);
    if (crit) {
      shake = Math.max(shake, 3);
      audio('crit');
    } else audio(auto ? 'tick' : 'tap');
    damage(dmg, { tap: true, crit, x: hx, y: hy - 14 });
  }

  function tap(px, py) {
    if (wisp && Math.hypot(px - wisp.x, py - wisp.y) < 34) {
      catchWisp();
      return;
    }
    strike(px, py, false);
  }

  /* ---------- Heroes attacking ---------- */

  function fire(v, dmg) {
    const h = v.h;
    const k = heroScale();
    const hx = v.x + 12 * k;
    const hy = v.y - 40 * k;
    const tx = aimX();
    const ty = aimY();
    v.pose = 0.22;
    const hit = (x, y, big) => damage(dmg, { x, y, big });
    switch (h.attack) {
      case 'slash':
      case 'phantom': {
        v.lunge = 0.3;
        const col = h.attack === 'phantom' ? '#7CF5E6' : '#FFFFFF';
        later.push({ t: 0.12, fn: () => { slash(tx - 10, ty, col, 1.2); audio('slash'); hit(); } });
        break;
      }
      case 'arrow':
        shoot({ kind: 'arrow', x0: hx, y0: hy, x1: tx, y1: ty, dur: 0.32, arc: 18, color: '#F2EBDD', dmg, sfx: 'arrow' });
        break;
      case 'fireball':
        shoot({ kind: 'orb', x0: hx, y0: hy - 18 * k, x1: tx, y1: ty, dur: 0.5, arc: 30, color: '#FF7A2E', r: 7, trail: '#FFB443', dmg, boom: '#FF7A2E', sfx: 'fire' });
        break;
      case 'smite':
        later.push({ t: 0.18, fn: () => { fx.push({ type: 'beam', x: tx, y: ty, life: 0.45, max: 0.45, color: '#FFE08A' }); audio('smite'); hit(); } });
        break;
      case 'daggers':
        for (let i = 0; i < 2; i++) {
          shoot({ kind: 'dagger', x0: hx, y0: hy + i * 6, x1: tx, y1: ty + (i ? 10 : -6), dur: 0.2 + i * 0.05, arc: 6, color: '#E8ECF5', dmg: dmg / 2, sfx: i ? null : 'throw' });
        }
        break;
      case 'slam':
        v.lunge = 0.2;
        later.push({ t: 0.15, fn: () => {
          shake = Math.max(shake, 4);
          fx.push({ type: 'wave', x: v.x + 20 * k, y: v.y, x1: tx, life: 0.42, max: 0.42, color: '#B8E8D8' });
          audio('slam');
        } });
        later.push({ t: 0.5, fn: () => hit() });
        break;
      case 'notes':
        for (let i = 0; i < 2; i++) {
          shoot({ kind: 'note', x0: hx, y0: hy, x1: tx, y1: ty + (i ? 12 : -12), dur: 0.7 + i * 0.1, arc: 0, wob: 14, color: i ? '#F5D06B' : '#FF8AD8', dmg: dmg / 2, sfx: i ? null : 'note' });
        }
        break;
      case 'void':
        shoot({ kind: 'orb', x0: hx, y0: hy - 18 * k, x1: tx, y1: ty, dur: 0.55, arc: -10, wob: 10, color: '#B86BFF', r: 6, trail: '#6B3FFF', dmg, boom: '#B86BFF', sfx: 'void' });
        break;
      case 'thorns':
        later.push({ t: 0.25, fn: () => { fx.push({ type: 'thorns', x: tx, y: ground + (H - ground) * 0.42, life: 0.55, max: 0.55, color: '#7CCB4A' }); audio('thorn'); hit(); } });
        break;
      case 'breath':
        for (let i = 0; i < (saver() ? 6 : 12); i++) {
          later.push({ t: i * 0.025, fn: () => shoot({ kind: 'ember', x0: v.x + 30 * k, y0: v.y - 50 * k, x1: tx + rand(-20, 20), y1: ty + rand(-20, 20), dur: 0.3, arc: 0, color: Math.random() < 0.5 ? '#FFB443' : '#FF5A2E', r: rand(4, 8), dmg: 0 }) });
        }
        audio('breath');
        later.push({ t: 0.3, fn: () => hit() });
        break;
      case 'spear':
        v.lunge = 0.15;
        shoot({ kind: 'spear', x0: hx, y0: hy - 6 * k, x1: tx, y1: ty, dur: 0.24, arc: 4, color: '#FFE08A', dmg, boom: '#FFE08A', sfx: 'spear' });
        break;
      default:
        hit();
    }
  }

  function shoot(o) {
    o.t = 0;
    shots.push(o);
    if (o.sfx) audio(o.sfx);
  }

  /* ---------- Wisps ---------- */

  function updateWisp(dt, now) {
    const s = S();
    if (!wisp) {
      if (now >= s.wispAt && mon) {
        const fromLeft = Math.random() < 0.5;
        wisp = { t: 0, dur: 11, fromLeft, x: fromLeft ? -20 : W + 20, y: H * 0.2, phase: rand(0, TAU) };
        audio('wisp');
        bus.emit('wispIn');
      }
      return;
    }
    wisp.t += dt;
    const k = wisp.t / wisp.dur;
    wisp.x = wisp.fromLeft ? -20 + (W + 40) * k : W + 20 - (W + 40) * k;
    wisp.y = H * (0.16 + 0.08 * Math.sin(wisp.t * 2.2 + wisp.phase)) + Math.sin(wisp.t * 5.3) * 6;
    if (Math.random() < 0.6) fx.push({ type: 'spark', x: wisp.x, y: wisp.y, vx: rand(-15, 15), vy: rand(-10, 20), life: 0.6, max: 0.6, color: '#BFFFE0', r: rand(2, 4) });
    if (k >= 1) {
      wisp = null;
      scheduleWisp(now);
    }
  }

  function scheduleWisp(now) {
    const st = stats();
    S().wispAt = now + st.wispEvery * rand(0.6, 1.4) * 1000;
  }

  function catchWisp() {
    const s = S();
    const now = Date.now();
    const x = wisp.x;
    const y = wisp.y;
    wisp = null;
    scheduleWisp(now);
    s.stats.wisps += 1;
    burst(x, y, '#BFFFE0', 26, 140);
    audio('catch');
    ED.game.haptic([10, 30, 10]);
    bus.emit('wisp', ED.game.wispReward(), x, y);
  }

  /* ---------- Effects ---------- */

  function burst(x, y, color, n, speed) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const sp = rand(speed * 0.3, speed);
      fx.push({ type: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - speed * 0.3, life: rand(0.35, 0.7), max: 0.7, color, r: rand(2, 5), grav: 260 });
    }
  }
  function sparks(x, y, color, n) { burst(x, y, color, n, 90); }

  function coins(x, y, n) {
    if (saver()) n = Math.ceil(n / 2);
    for (let i = 0; i < n; i++) {
      fx.push({ type: 'coin', x, y, vx: rand(-90, 60), vy: rand(-260, -140), life: 1.1, max: 1.1, spin: rand(0, TAU) });
    }
  }

  function slash(x, y, color, size) {
    fx.push({ type: 'slash', x, y, a: rand(-0.9, -0.3), life: 0.2, max: 0.2, color, size: (size || 1) * clamp(H * 0.12, 26, 60) });
  }

  function number(x, y, v, kind) {
    if (nums.length > 40) nums.shift();
    const big = kind === 'crit';
    const text = v >= 100 ? U.fmt(v) : v >= 1 ? String(Math.round(v)) : v.toFixed(1);
    nums.push({ x, y, vy: big ? -70 : -50, life: big ? 1.1 : 0.8, max: big ? 1.1 : 0.8, text: text + (big ? '!' : ''), kind });
  }

  function skillFx(id) {
    const s = S();
    if (id === 'star') {
      const st = stats();
      const tx = aimX();
      const ty = aimY();
      fx.push({ type: 'star', x0: W + 30, y0: -40, x1: tx, y1: ty, t: 0, life: 0.6, max: 0.6 });
      later.push({ t: 0.6, fn: () => {
        shake = Math.max(shake, 12);
        burst(tx, ty, '#D6B8FF', 40, 260);
        fx.push({ type: 'ring', x: tx, y: ty, life: 0.5, max: 0.5, color: '#D6B8FF', r: mon ? mon.size * 0.8 : 80 });
        audio('boom');
        ED.game.haptic(40);
        damage(st.party * 120, { big: true, x: tx, y: ty - 30 });
      } });
    } else if (id === 'cry') {
      for (const v of heroes.values()) burst(v.x, v.y - 30, '#FF6A4D', 6, 60);
    } else if (id === 'midas') {
      burst(W / 2, H * 0.4, '#FFD166', 30, 200);
    } else if (id === 'glass') {
      fx.push({ type: 'ring', x: W / 2, y: H / 2, life: 0.9, max: 0.9, color: '#7CFFB2', r: Math.max(W, H) });
    }
  }

  /* ---------- Update ---------- */

  function update(dt) {
    const s = S();
    const now = Date.now();
    time += dt;
    ensureBackdrop();
    const buffs = ST.buffMult(s, now);
    const st = ST.stats(s, buffs);
    cur = st;

    // Walking between floors: the cave scrolls by.
    const walking = s.wait > 0 && !mon;
    if (walking) scroll += dt * W * 0.55;

    if (mon && !mon.dying && (mon.floor !== s.floor || (mon.isBoss !== (E.isBoss(s.floor) && !s.farming)))) {
      // The floor changed underneath us (a challenge, the Hourglass): this
      // one slinks off and the right monster comes in.
      mon.dying = 0.3;
      mon.escaped = true;
    }
    if (s.wait > 0) s.wait = Math.max(0, s.wait - dt);
    else if (!mon) spawn();

    const fighting = mon && !mon.dying && mon.spawn <= 0.2;
    if (fighting && mon.isBoss) {
      s.bossT = (s.bossT == null ? st.bossTime : s.bossT) - dt;
      if (s.bossT <= 0) failBoss();
    }

    // Heroes fill their damage up while there's something to hit, and
    // let it all out when their attack comes round.
    for (const v of heroes.values()) {
      v.pose = Math.max(0, v.pose - dt);
      v.lunge = Math.max(0, v.lunge - dt);
      if (!fighting) continue;
      v.bucket += (st.heroDps[v.h.id] || 0) * dt;
      v.timer -= dt;
      if (v.timer <= 0) {
        v.timer = v.h.rate * rand(0.92, 1.08);
        const dmg = v.bucket;
        v.bucket = 0;
        if (dmg > 0) fire(v, dmg);
      }
    }

    // Auto strikes: the Phantom Gauntlet and Flurry.
    const autoRate = st.autoTaps + (buffs.flurry ? 12 : 0);
    if (fighting && autoRate > 0) {
      tapAcc += autoRate * dt;
      let n = 0;
      while (tapAcc >= 1 && n++ < 6) {
        tapAcc -= 1;
        strike(0, 0, true);
        if (!mon || mon.dying) break;
      }
    } else tapAcc = 0;

    for (let i = later.length - 1; i >= 0; i--) {
      const l = later[i];
      l.t -= dt;
      if (l.t <= 0) {
        later.splice(i, 1);
        l.fn();
      }
    }

    for (let i = shots.length - 1; i >= 0; i--) {
      const p = shots[i];
      p.t += dt;
      if (p.t >= p.dur) {
        shots.splice(i, 1);
        if (p.boom) {
          burst(p.x1, p.y1, p.boom, saver() ? 5 : 10, 120);
          fx.push({ type: 'ring', x: p.x1, y: p.y1, life: 0.25, max: 0.25, color: p.boom, r: 26 });
        }
        if (p.dmg > 0) damage(p.dmg, { x: p.x1 + rand(-8, 8), y: p.y1 - 10 });
      } else if (p.trail && Math.random() < 0.7) {
        const q = shotPos(p);
        fx.push({ type: 'spark', x: q.x, y: q.y, vx: rand(-20, 20), vy: rand(-20, 20), life: 0.3, max: 0.3, color: p.trail, r: rand(2, 4) });
      }
    }

    if (mon) {
      mon.t += dt;
      mon.spawn = Math.max(0, mon.spawn - dt);
      mon.flash = Math.max(0, mon.flash - dt);
      mon.hitX = Math.max(0, mon.hitX - dt * 40);
      if (mon.dying) {
        mon.dying -= dt;
        if (mon.dying <= 0) mon = null;
      }
    }

    for (let i = fx.length - 1; i >= 0; i--) {
      const e = fx[i];
      e.life -= dt;
      if (e.life <= 0) { fx.splice(i, 1); continue; }
      if (e.vx != null) {
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        if (e.grav) e.vy += e.grav * dt;
        if (e.type === 'coin') e.vy += 600 * dt;
      }
    }
    if (fx.length > (saver() ? 120 : 320)) fx.splice(0, fx.length - (saver() ? 120 : 320));

    for (let i = nums.length - 1; i >= 0; i--) {
      const n = nums[i];
      n.life -= dt;
      n.y += n.vy * dt;
      n.vy *= 0.96;
      if (n.life <= 0) nums.splice(i, 1);
    }

    updateMotes(dt);
    updateWisp(dt, now);
    shake = Math.max(0, shake - dt * 30);
  }

  function shotPos(p) {
    const k = clamp(p.t / p.dur, 0, 1);
    let x = p.x0 + (p.x1 - p.x0) * k;
    let y = p.y0 + (p.y1 - p.y0) * k - Math.sin(k * Math.PI) * (p.arc || 0);
    if (p.wob) y += Math.sin(k * 14) * p.wob * (1 - k);
    return { x, y, k };
  }

  function updateMotes(dt) {
    if (!bg) return;
    const want = saver() ? 10 : 26;
    const deco = bg.P.deco;
    while (motes.length < want) {
      motes.push({ x: rand(0, W), y: rand(0, H), vx: rand(-6, 6), vy: deco === 'ice' ? rand(14, 30) : deco === 'lava' ? rand(-30, -12) : rand(-8, 4), r: rand(0.8, 2.2), ph: rand(0, TAU) });
    }
    for (const m of motes) {
      m.x += (m.vx + Math.sin(time * 0.8 + m.ph) * 6) * dt;
      m.y += m.vy * dt;
      if (m.y < -10) m.y = H + 5;
      if (m.y > H + 10) m.y = -5;
      if (m.x < -10) m.x = W + 5;
      if (m.x > W + 10) m.x = -5;
    }
  }

  /* ---------- Draw ---------- */

  function draw() {
    if (!g || !bg) return;
    const s = S();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (shake > 0) g.translate(rand(-shake, shake) * 0.5, rand(-shake, shake) * 0.5);
    g.drawImage(bg.sky, 0, 0, bg.sky.width, bg.sky.height, -2, -2, W + 4, H + 4);
    drawLayer(bg.far, 0.25);
    drawLayer(bg.mid, 0.6);
    drawLayer(bg.floor, 1);

    // Buff auras
    const now = Date.now();
    const buffs = ST.buffMult(s, now);
    if (buffs.gold > 1) {
      g.globalCompositeOperation = 'lighter';
      drawGlow('#FFC94A', W * 0.5, H * 0.55, W * 0.7, 0.12 + 0.04 * Math.sin(time * 3));
      g.globalCompositeOperation = 'source-over';
    }

    if (mon) drawMonster(mon);
    drawHeroes(buffs);
    drawShots();
    drawFx();
    drawMotes();
    if (wisp) drawWisp();
    drawNums();

    if (!vignette) {
      vignette = A.canvas(Math.ceil(W * dpr), Math.ceil(H * dpr));
      const vg = vignette.getContext('2d');
      const gr = vg.createRadialGradient(W * dpr / 2, H * dpr * 0.55, Math.min(W, H) * dpr * 0.35, W * dpr / 2, H * dpr * 0.55, Math.max(W, H) * dpr * 0.75);
      gr.addColorStop(0, 'rgba(0,0,0,0)');
      gr.addColorStop(1, 'rgba(0,0,0,0.55)');
      vg.fillStyle = gr;
      vg.fillRect(0, 0, vignette.width, vignette.height);
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(vignette, 0, 0);
  }

  function shadow(x, y, rx) {
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.beginPath();
    g.ellipse(x, y, rx, rx * 0.28, 0, 0, TAU);
    g.fill();
  }

  function drawHeroes(buffs) {
    const s = S();
    const k = heroScale();
    const walking = s.wait > 0 && !mon;
    const list = [...heroes.values()].sort((a, b) => a.y - b.y);
    for (const v of list) {
      const spr = A.hero(v.h, v.pose > 0 ? 1 : 0, Math.round(k * dpr * 4) / 4);
      const bob = walking ? Math.abs(Math.sin(time * 9 + v.x)) * -4 : Math.sin(time * 2.4 + v.x * 0.05) * 1.2;
      const lunge = v.lunge > 0 ? Math.sin((1 - v.lunge / 0.3) * Math.PI) * 22 * k : 0;
      const born = clamp((time - v.born) / 0.4, 0, 1);
      const fly = v.h.look.kind === 'dragon' ? -10 * k + Math.sin(time * 3) * 3 : 0;
      const x = v.x + lunge;
      const y = v.y + bob + fly;
      shadow(v.x + lunge, v.y, 15 * k);
      if (buffs.hero > 1) {
        g.globalCompositeOperation = 'lighter';
        drawGlow(buffs.hero >= 3 ? '#BFFFE0' : '#FF6A4D', x, y - 34 * k, 34 * k, 0.35 + 0.1 * Math.sin(time * 6 + v.x));
        g.globalCompositeOperation = 'source-over';
      }
      const w = A.hero.W * k;
      const h = A.hero.H * k;
      g.globalAlpha = born;
      g.drawImage(spr, x - A.hero.FX * k, y - A.hero.FY * k - (1 - born) * 20, w, h);
      g.globalAlpha = 1;
    }
  }

  function drawMonster(m) {
    const s = S();
    const flyY = m.fly ? -H * 0.05 + Math.sin(m.t * 2.6) * 5 : 0;
    const frame = Math.floor(m.t * (m.fly ? 6 : 2.5)) % 2;
    const spr = A.monster(m.kind, m.color, frame, Math.round(m.sprScale * 4) / 4, m.boss, m.glowC);
    let sc = 1;
    let alpha = 1;
    if (m.spawn > 0) {
      const k = 1 - m.spawn / 0.35;
      sc = 0.6 + 0.4 * U.easeOut(k);
      alpha = k;
    }
    if (m.dying) {
      const k = clamp(m.dying / (m.escaped ? 0.5 : 0.4), 0, 1);
      alpha = k;
      sc = m.escaped ? 1 : 0.7 + 0.3 * k;
    }
    const breathe = 1 + Math.sin(m.t * 3) * 0.02;
    const size = m.size * sc;
    const x = m.x + m.hitX + (m.escaped ? (1 - alpha) * W * 0.3 : 0);
    const y = m.y + flyY;
    shadow(m.x, m.y + 2, size * 0.3);
    if (m.boss) {
      g.globalCompositeOperation = 'lighter';
      drawGlow(m.boss === 2 ? '#FF6A4D' : m.glowC, x, y - size * 0.4, size * 0.75, 0.22 + 0.06 * Math.sin(m.t * 4));
      g.globalCompositeOperation = 'source-over';
    }
    g.save();
    g.globalAlpha = alpha;
    g.translate(x, y);
    g.scale(-1, 1); // face the party
    const foot = A.monster.FOOT / A.monster.H;
    g.drawImage(spr, -size / 2, -size * foot * breathe, size, size * breathe);
    if (m.flash > 0) {
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = alpha * (m.flash / 0.1) * 0.5;
      g.drawImage(spr, -size / 2, -size * foot * breathe, size, size * breathe);
    }
    g.restore();
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  function drawShots() {
    for (const p of shots) {
      const q = shotPos(p);
      const dx = p.x1 - p.x0;
      const dy = (p.y1 - p.y0) - Math.cos(q.k * Math.PI) * Math.PI * (p.arc || 0);
      const ang = Math.atan2(dy, dx);
      g.save();
      g.translate(q.x, q.y);
      switch (p.kind) {
        case 'arrow':
          g.rotate(ang);
          g.strokeStyle = '#7A4A26'; g.lineWidth = 2;
          g.beginPath(); g.moveTo(-14, 0); g.lineTo(6, 0); g.stroke();
          g.fillStyle = '#E8ECF5';
          g.beginPath(); g.moveTo(10, 0); g.lineTo(4, -3); g.lineTo(4, 3); g.fill();
          g.fillStyle = '#FF6A4D';
          g.fillRect(-15, -2.5, 4, 5);
          break;
        case 'dagger':
          g.rotate(p.t * 30);
          g.fillStyle = p.color;
          g.beginPath(); g.moveTo(8, 0); g.lineTo(-4, -2.5); g.lineTo(-4, 2.5); g.fill();
          g.fillStyle = '#9E3D5B'; g.fillRect(-7, -2, 3, 4);
          break;
        case 'spear':
          g.rotate(ang);
          g.globalCompositeOperation = 'lighter';
          g.drawImage(glow(p.color), -30, -8, 40, 16);
          g.globalCompositeOperation = 'source-over';
          g.strokeStyle = '#FFF4C2'; g.lineWidth = 3;
          g.beginPath(); g.moveTo(-22, 0); g.lineTo(8, 0); g.stroke();
          g.fillStyle = '#FFFFFF'; g.beginPath(); g.moveTo(14, 0); g.lineTo(6, -4); g.lineTo(6, 4); g.fill();
          break;
        case 'note': {
          g.fillStyle = p.color;
          g.strokeStyle = p.color;
          g.lineWidth = 2;
          g.beginPath(); g.ellipse(0, 4, 4.5, 3.5, -0.4, 0, TAU); g.fill();
          g.beginPath(); g.moveTo(4, 3); g.lineTo(4, -9); g.lineTo(9, -6); g.stroke();
          g.globalCompositeOperation = 'lighter';
          g.drawImage(glow(p.color), -12, -12, 24, 24);
          break;
        }
        case 'ember':
          g.globalCompositeOperation = 'lighter';
          g.globalAlpha = 1 - q.k * 0.6;
          g.drawImage(glow(p.color), -p.r * 2, -p.r * 2, p.r * 4 * (1 + q.k), p.r * 4 * (1 + q.k));
          break;
        default: { // orb
          g.globalCompositeOperation = 'lighter';
          const r = p.r || 6;
          g.drawImage(glow(p.color), -r * 3, -r * 3, r * 6, r * 6);
          g.drawImage(glow('#FFFFFF'), -r, -r, r * 2, r * 2);
        }
      }
      g.restore();
    }
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
  }

  function drawFx() {
    for (const e of fx) {
      const k = e.life / e.max;
      switch (e.type) {
        case 'spark':
          g.globalCompositeOperation = 'lighter';
          g.globalAlpha = k;
          g.drawImage(glow(e.color), e.x - e.r * 2, e.y - e.r * 2, e.r * 4, e.r * 4);
          break;
        case 'coin': {
          g.globalAlpha = Math.min(1, k * 2);
          const w = Math.abs(Math.cos(e.spin + e.life * 10)) * 5 + 1;
          g.fillStyle = '#FFC94A';
          g.beginPath(); g.ellipse(e.x, e.y, w, 5.5, 0, 0, TAU); g.fill();
          g.strokeStyle = '#B9761A'; g.lineWidth = 1.2; g.stroke();
          break;
        }
        case 'slash': {
          g.globalCompositeOperation = 'lighter';
          g.globalAlpha = k;
          g.save();
          g.translate(e.x, e.y);
          g.rotate(e.a);
          g.strokeStyle = e.color;
          g.lineCap = 'round';
          g.lineWidth = 5 * k + 1;
          g.beginPath();
          g.arc(0, 0, e.size * 0.6, -0.9 + (1 - k) * 0.6, 0.9 + (1 - k) * 0.6);
          g.stroke();
          g.restore();
          break;
        }
        case 'ring':
          g.globalCompositeOperation = 'lighter';
          g.globalAlpha = k * 0.8;
          g.strokeStyle = e.color;
          g.lineWidth = 3 * k + 1;
          g.beginPath(); g.arc(e.x, e.y, e.r * (1.2 - k), 0, TAU); g.stroke();
          break;
        case 'beam': {
          g.globalCompositeOperation = 'lighter';
          g.globalAlpha = Math.sin(k * Math.PI);
          const w = 26 * (0.6 + 0.4 * k);
          const gr = g.createLinearGradient(e.x - w, 0, e.x + w, 0);
          gr.addColorStop(0, rgba(e.color, 0));
          gr.addColorStop(0.5, rgba(e.color, 0.85));
          gr.addColorStop(1, rgba(e.color, 0));
          g.fillStyle = gr;
          g.fillRect(e.x - w, 0, w * 2, e.y + 30);
          g.drawImage(glow('#FFFFFF'), e.x - 30, e.y - 30, 60, 60);
          break;
        }
        case 'wave': {
          const p = 1 - k;
          const x = e.x + (e.x1 - e.x) * p;
          g.globalCompositeOperation = 'lighter';
          g.globalAlpha = 0.9;
          g.drawImage(glow(e.color), x - 26, e.y - 30, 52, 40);
          g.fillStyle = rgba('#8C8478', 0.9);
          for (let i = 0; i < 3; i++) {
            g.beginPath(); g.moveTo(x - 14 + i * 10, e.y); g.lineTo(x - 10 + i * 10, e.y - 12 - (i % 2) * 6); g.lineTo(x - 6 + i * 10, e.y); g.fill();
          }
          break;
        }
        case 'thorns': {
          const p = Math.sin((1 - k) * Math.PI);
          g.fillStyle = e.color;
          g.strokeStyle = '#1A1224';
          g.lineWidth = 1.5;
          for (let i = -2; i <= 2; i++) {
            const h = (34 - Math.abs(i) * 7) * p;
            g.beginPath(); g.moveTo(e.x + i * 12 - 5, e.y); g.lineTo(e.x + i * 12 + i * 2, e.y - h); g.lineTo(e.x + i * 12 + 5, e.y); g.closePath(); g.fill(); g.stroke();
          }
          break;
        }
        case 'star': {
          const p = 1 - k;
          const x = e.x0 + (e.x1 - e.x0) * p;
          const y = e.y0 + (e.y1 - e.y0) * p;
          g.globalCompositeOperation = 'lighter';
          for (let i = 0; i < 6; i++) g.drawImage(glow('#B07CFF'), x - (e.x1 - e.x0) * 0.05 * i - 20, y - (e.y1 - e.y0) * 0.05 * i - 20, 40, 40);
          g.drawImage(glow('#FFFFFF'), x - 22, y - 22, 44, 44);
          break;
        }
      }
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }
  }

  function drawMotes() {
    g.globalCompositeOperation = 'lighter';
    const col = bg.P.mote;
    for (const m of motes) {
      g.globalAlpha = 0.35 + 0.35 * Math.sin(time * 2 + m.ph);
      g.drawImage(glow(col), m.x - m.r * 2.5, m.y - m.r * 2.5, m.r * 5, m.r * 5);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  function drawWisp() {
    const w = wisp;
    const pulse = 1 + Math.sin(time * 8) * 0.12;
    g.globalCompositeOperation = 'lighter';
    drawGlow('#7CFFB2', w.x, w.y, 30 * pulse, 0.7);
    drawGlow('#FFFFFF', w.x, w.y, 9, 1);
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#0E2A24';
    g.beginPath(); g.arc(w.x - 3, w.y - 1, 1.6, 0, TAU); g.arc(w.x + 3, w.y - 1, 1.6, 0, TAU); g.fill();
  }

  function drawNums() {
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    for (const n of nums) {
      const k = n.life / n.max;
      const crit = n.kind === 'crit';
      const sz = crit ? 22 : n.kind === 'tap' ? 16 : 13;
      const pop = crit ? 1 + Math.max(0, (k - 0.85) * 3) : 1;
      g.font = `800 ${Math.round(sz * pop)}px "Fredoka", system-ui, sans-serif`;
      g.globalAlpha = Math.min(1, k * 2.5);
      g.lineWidth = 4;
      g.strokeStyle = 'rgba(16,10,24,0.85)';
      g.strokeText(n.text, n.x, n.y);
      g.fillStyle = crit ? '#FFD166' : n.kind === 'tap' ? '#FFFFFF' : '#E8DDF5';
      g.fillText(n.text, n.x, n.y);
    }
    g.globalAlpha = 1;
  }

  /* ---------- API ---------- */

  function init(canvasEl) {
    cv = canvasEl;
    g = cv.getContext('2d');
    resize();
    cv.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      const r = cv.getBoundingClientRect();
      ED.audio && ED.audio.unlock();
      tap(e.clientX - r.left, e.clientY - r.top);
    });
  }

  // Throw away everything on screen and rebuild from the save (after a
  // load, a rekindle, or skipping time).
  function reset() {
    mon = null;
    shots = [];
    later = [];
    nums = [];
    fx = [];
    wisp = null;
    heroes.clear();
    bgKey = '';
    placeHeroes();
    for (const v of heroes.values()) v.born = -1;
  }

  function frame(dt) {
    if (!cv) return;
    update(dt);
    draw();
  }

  ED.battle = {
    init, resize, frame, reset, placeHeroes, skillFx, tap,
    step: (dt) => { if (cv) update(dt); }, // advance without drawing
    monster: () => mon,
    hasWisp: () => !!wisp,
    roman,
  };
})(window.ED = window.ED || {});
