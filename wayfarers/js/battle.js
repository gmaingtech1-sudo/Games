/* Wayfarers — one stage's fight. Heroes on the left, foes on the right; both
   sides swing on their own timers, fill energy and fire skills. The fight
   only produces numbers and events; render.js turns the events into
   swooshes, arrows and floating damage. */
(function (WF) {
  'use strict';

  const D = WF.data;
  const ENEMY_INTERVAL = 1.5;
  const ENERGY_PER_ATTACK = 20;
  const ENERGY_PER_HIT = 8;
  const CRIT_CHANCE = 0.1;
  const ENTER_TIME = 1.1;
  const WON_TIME = 1.3;
  const LOST_TIME = 1.8;

  // Depth lanes: 0 is the middle of the road, ±1 the near and far edges.
  const LANES = [0, -0.75, 0.75, -0.38, 0.38];

  let uid = 0;

  function makeHero(id, i, group, full) {
    const def = D.HERO[id];
    const role = D.ROLE[def.role];
    const homeX = role.melee ? 0.38 - (i % 2) * 0.06 - Math.floor(i / 3) * 0.02 : 0.22 - (i % 2) * 0.08 - Math.floor(i / 3) * 0.02;
    return {
      uid: ++uid, side: 'hero', id, def, role: def.role, melee: role.melee, aggro: role.aggro,
      maxHp: full.hp, hp: full.hp, atk: full.atk, interval: full.interval,
      cd: Math.random() * full.interval * 0.6, energy: 0, shield: 0, stun: 0,
      homeX, x: homeX - 0.35, lane: LANES[i % LANES.length] * (group === 'back' ? 0.85 : 1),
      alive: true, anim: { lunge: 0, hit: 0, cast: 0, die: 0, walk: 0 },
    };
  }

  function makeEnemy(f, i, n, stage) {
    const def = D.FOES[f.type];
    const hp = D.enemyHp(stage) * f.hpK;
    const lane = f.boss ? 0 : n === 3 && i === 1 ? 0 : LANES[(i + 1) % LANES.length];
    const homeX = f.boss ? 0.72 : 0.63 + i * 0.07 + (lane === 0 ? 0.02 : 0);
    return {
      uid: ++uid, side: 'foe', id: f.type, def, boss: !!f.boss, loop: f.loop,
      maxHp: hp, hp, atk: D.enemyAtk(stage) * f.atkK, interval: ENEMY_INTERVAL * (f.boss ? 1.15 : 1),
      cd: 0.4 + Math.random() * ENEMY_INTERVAL, energy: 0, shield: 0, stun: 0,
      homeX, x: homeX + 0.45, lane, alive: true,
      anim: { lunge: 0, hit: 0, cast: 0, die: 0, walk: 0 },
    };
  }

  // stage: number; party: hero ids; fullStats(id) → {hp, atk, interval};
  // energyMult: skill charge bonus.
  function create(stage, party, fullStats, energyMult) {
    const melee = party.filter((id) => D.ROLE[D.HERO[id].role].melee);
    const back = party.filter((id) => !D.ROLE[D.HERO[id].role].melee);
    const heroes = [
      ...melee.map((id, i) => makeHero(id, i, 'front', fullStats(id))),
      ...back.map((id, i) => makeHero(id, i, 'back', fullStats(id))),
    ];
    const wave = D.waveFor(stage);
    const foes = wave.map((f, i) => makeEnemy(f, i, wave.length, stage));
    return {
      stage, heroes, foes, boss: D.isBoss(stage),
      phase: 'enter', phaseT: 0, time: D.STAGE_TIME,
      rallyT: 0, rallyK: 0, energyMult: energyMult || 1,
      events: [],
    };
  }

  const living = (arr) => arr.filter((u) => u.alive);

  function heroTarget(b, h) {
    const foes = living(b.foes);
    if (!foes.length) return null;
    // Rogues slip past to finish off the weakest; everyone else hits the front.
    if (h.role === 'rogue') return foes.reduce((a, c) => (c.hp < a.hp ? c : a));
    return foes.reduce((a, c) => (c.x < a.x ? c : a));
  }

  function foeTarget(b) {
    const heroes = living(b.heroes);
    if (!heroes.length) return null;
    const front = heroes.filter((h) => h.melee);
    const pool = front.length ? front : heroes;
    const total = pool.reduce((s, h) => s + h.aggro, 0);
    let x = Math.random() * total;
    for (const h of pool) {
      if (x < h.aggro) return h;
      x -= h.aggro;
    }
    return pool[0];
  }

  function damage(b, target, amount, src, crit) {
    if (!target.alive) return;
    let left = amount;
    if (target.shield > 0) {
      const soak = Math.min(target.shield, left);
      target.shield -= soak;
      left -= soak;
    }
    target.hp -= left;
    target.anim.hit = 1;
    target.energy = Math.min(100, target.energy + ENERGY_PER_HIT * (target.side === 'hero' ? b.energyMult : 1));
    b.events.push({ kind: 'dmg', unit: target, amount, crit, src: src && src.side, blocked: left <= 0 });
    if (target.hp <= 0) {
      target.hp = 0;
      target.alive = false;
      target.anim.die = 0.0001;
      b.events.push({ kind: 'death', unit: target });
    }
  }

  function heal(b, target, amount) {
    if (!target.alive) return;
    const before = target.hp;
    target.hp = Math.min(target.maxHp, target.hp + amount);
    if (target.hp > before) b.events.push({ kind: 'heal', unit: target, amount: target.hp - before });
  }

  function heroHit(b, h) {
    const k = b.rallyT > 0 ? 1 + b.rallyK : 1;
    const crit = Math.random() < CRIT_CHANCE;
    return { amount: h.atk * k * (crit ? 2 : 1), crit };
  }

  function castSkill(b, h) {
    const s = h.def.skill;
    h.energy = 0;
    h.anim.cast = 1;
    b.events.push({ kind: 'cast', unit: h, skill: s });
    const k = b.rallyT > 0 ? 1 + b.rallyK : 1;
    const foes = living(b.foes);
    const heroes = living(b.heroes);
    if (s.type === 'nuke') {
      const t = heroTarget(b, h);
      if (t) {
        b.events.push({ kind: 'shot', from: h, to: t, style: 'skill' });
        damage(b, t, h.atk * s.k * k, h, true);
      }
    } else if (s.type === 'aoe' || s.type === 'stun') {
      for (const f of foes) {
        damage(b, f, h.atk * s.k * k, h, false);
        if (s.type === 'stun' && f.alive) f.stun = Math.max(f.stun, s.t);
      }
      b.events.push({ kind: 'blast', side: 'foe', style: s.type, color: h.def.color });
    } else if (s.type === 'heal') {
      for (const a of heroes) heal(b, a, h.atk * s.k);
      b.events.push({ kind: 'blast', side: 'hero', style: 'heal' });
    } else if (s.type === 'shield') {
      for (const a of heroes) a.shield = Math.min(a.maxHp * 0.6, a.shield + h.maxHp * s.k);
      b.events.push({ kind: 'blast', side: 'hero', style: 'shield' });
    } else if (s.type === 'rally') {
      b.rallyT = s.t;
      b.rallyK = s.k;
      b.events.push({ kind: 'blast', side: 'hero', style: 'rally' });
    }
  }

  function heroAct(b, h) {
    if (h.energy >= 100) {
      castSkill(b, h);
      return;
    }
    if (h.role === 'healer') {
      const hurt = living(b.heroes).filter((a) => a.hp < a.maxHp * 0.98);
      if (hurt.length) {
        const t = hurt.reduce((a, c) => (c.hp / c.maxHp < a.hp / a.maxHp ? c : a));
        b.events.push({ kind: 'shot', from: h, to: t, style: 'heal' });
        heal(b, t, h.atk * 1.7);
        h.energy = Math.min(100, h.energy + ENERGY_PER_ATTACK * b.energyMult);
        return;
      }
    }
    const t = heroTarget(b, h);
    if (!t) return;
    const hit = heroHit(b, h);
    if (h.melee) h.anim.lunge = 1;
    else b.events.push({ kind: 'shot', from: h, to: t, style: h.role });
    damage(b, t, hit.amount, h, hit.crit);
    h.energy = Math.min(100, h.energy + ENERGY_PER_ATTACK * b.energyMult);
  }

  function foeAct(b, f) {
    const t = foeTarget(b);
    if (!t) return;
    f.anim.lunge = 1;
    if (f.def.shape === 'ghost' || f.def.shape === 'flyer') b.events.push({ kind: 'shot', from: f, to: t, style: 'foe' });
    damage(b, t, f.atk * (0.9 + Math.random() * 0.2), f, false);
  }

  function decayAnims(u, dt) {
    const a = u.anim;
    a.lunge = Math.max(0, a.lunge - dt * 4);
    a.hit = Math.max(0, a.hit - dt * 5);
    a.cast = Math.max(0, a.cast - dt * 2);
    if (a.die > 0) a.die = Math.min(1, a.die + dt * 2);
  }

  // Advances the fight. cb: { kill(foe), won(), lost() }.
  function update(b, dt, cb) {
    b.phaseT += dt;
    const all = b.heroes.concat(b.foes);
    for (const u of all) decayAnims(u, dt);

    if (b.phase === 'enter') {
      const k = Math.min(1, b.phaseT / ENTER_TIME);
      const ease = 1 - Math.pow(1 - k, 3);
      for (const u of all) {
        const from = u.side === 'hero' ? u.homeX - 0.35 : u.homeX + 0.45;
        u.x = from + (u.homeX - from) * ease;
        u.anim.walk += dt * 9 * (1 - ease * 0.8);
      }
      if (k >= 1) { b.phase = 'fight'; b.phaseT = 0; }
      return;
    }

    if (b.phase === 'won' || b.phase === 'lost') {
      if (b.phase === 'won') for (const h of b.heroes) h.anim.walk += dt * 6;
      const wait = b.phase === 'won' ? WON_TIME : LOST_TIME;
      if (b.phaseT >= wait && !b.done) {
        b.done = true;
        if (b.phase === 'won') cb.won();
        else cb.lost();
      }
      return;
    }

    // Fighting.
    b.time -= dt;
    b.rallyT = Math.max(0, b.rallyT - dt);
    for (const h of b.heroes) {
      if (!h.alive) continue;
      h.cd -= dt;
      if (h.cd <= 0) {
        h.cd += h.interval;
        heroAct(b, h);
      }
    }
    for (const f of b.foes) {
      if (!f.alive) continue;
      if (f.stun > 0) { f.stun -= dt; continue; }
      f.cd -= dt;
      if (f.cd <= 0) {
        f.cd += f.interval;
        foeAct(b, f);
      }
    }
    for (const e of b.events) {
      if (e.kind === 'death' && e.unit.side === 'foe' && !e.counted) {
        e.counted = true;
        cb.kill(e.unit);
      }
    }
    if (!living(b.foes).length) { b.phase = 'won'; b.phaseT = 0; }
    else if (!living(b.heroes).length || b.time <= 0) {
      b.phase = 'lost';
      b.phaseT = 0;
      b.timedOut = b.time <= 0;
    }
  }

  WF.battle = { create, update, living };
})(typeof window !== 'undefined' ? (window.WF = window.WF || {}) : (globalThis.WF = globalThis.WF || {}));
