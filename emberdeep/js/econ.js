/* Emberdeep — the numbers. Monster health and gold per floor, hero prices
   and damage, and stats(): every bonus from heroes, relics, talents and
   embers folded into one object the battle and the offline simulation both
   read. Pure functions of the save, so tools/balance.js can run it in Node. */
(function (ED) {
  'use strict';

  const D = ED.data;
  const U = ED.util;

  /* ---------- Tuning ---------- */
  const T = {
    hpBase: 6,                 // health of the first monster, before growth
    hpRates: [                 // growth of monster health per floor, by depth band
      [100, 0.30],
      [500, 0.17],
      [2000, 0.115],
      [Infinity, 0.085],
    ],
    bossHp: 6,                 // a boss has this many monsters' worth of health
    guardianHp: 11,            // … and a biome Guardian (every 25th floor) this many
    goldRatio: 0.24,           // gold per monster, as a share of its health
    bossGold: 7,               // bosses drop this many monsters' worth of gold
    guardianGold: 20,
    costGrowth: 1.07,          // each hero level costs this much more than the last
    torchBase: 5,
    torchGrowth: 1.075,
    mobs: 8,                   // monsters per floor
    bossEvery: 5,
    bossTime: 30,              // seconds to beat a boss
    mobGap: 0.45,              // seconds between a monster falling and the next arriving
    floorGap: 1.1,             // walking down to the next floor
    bossGap: 1.6,              // a boss's entrance
    critChance: 0.03,
    critMult: 5,
    tapShare: 0.01,            // taps also deal this share of party DPS
    offlineH: 12,              // hours your heroes keep delving while you're away
    chest: 0.2,                // chance a Guardian (every 25th floor) drops a relic chest
    wispEvery: 110,            // average seconds between wisps
    warmth: 0.25,              // Hearth warmth: ×e^(warmth × √embers ever earned) damage and gold
    emberFloor: 50,            // deepest floor in a run needed to rekindle
    bottom: 5000,              // the Ember Heart. Past it, monsters stop getting tougher
  };

  /* ---------- Floors ---------- */

  const isBoss = (f) => f % T.bossEvery === 0;
  const isGuardian = (f) => f % D.FLOORS_PER_BIOME === 0;
  const isHeart = (f) => f === T.bottom;

  // Which biome a floor is in, and how many times the eight have looped.
  function biomeOf(f) {
    const i = Math.floor((f - 1) / D.FLOORS_PER_BIOME);
    return { biome: D.BIOMES[i % D.BIOMES.length], cycle: Math.floor(i / D.BIOMES.length), index: i };
  }

  // ln(health growth) up to floor f: a piecewise-linear curve, steep at first.
  function hpExp(f) {
    f = Math.min(f, T.bottom);
    let e = 0;
    let prev = 0;
    for (const [upto, rate] of T.hpRates) {
      const top = Math.min(f, upto);
      if (top > prev) e += (top - prev) * rate;
      if (f <= upto) break;
      prev = upto;
    }
    return e;
  }

  const mobHP = (f) => U.safe(T.hpBase * Math.exp(hpExp(f)));
  const bossHP = (f) => U.safe(mobHP(f) * (isHeart(f) ? 100 : isGuardian(f) ? T.guardianHp : T.bossHp));
  // A little flat gold on top keeps the very first floors from dragging.
  const mobGold = (f) => U.safe(mobHP(f) * T.goldRatio + 1);
  const bossGold = (f) => U.safe(mobGold(f) * (isGuardian(f) ? T.guardianGold : T.bossGold));

  /* ---------- Heroes ---------- */

  // Damage multiplier from a hero's level milestones: ×2 at 10, then ×2
  // every 25 levels, and a further ×4 every 200.
  function milestone(L) {
    if (L <= 0) return 0;
    return Math.pow(2, Math.floor(L / 25) + (L >= 10 ? 1 : 0)) * Math.pow(4, Math.floor(L / 200));
  }
  const nextMilestone = (L) => (L < 10 ? 10 : (Math.floor(L / 25) + 1) * 25);

  const heroBase = (h, L) => (L > 0 ? h.dps * L * milestone(L) : 0);

  // Price of levels L+1 … L+n.
  function heroCost(h, L, n) {
    const g = T.costGrowth;
    n = n || 1;
    return U.safe(h.cost * Math.pow(g, L) * (Math.pow(g, n) - 1) / (g - 1));
  }

  // How many levels `gold` buys, from level L.
  function heroAfford(h, L, gold) {
    const g = T.costGrowth;
    const first = h.cost * Math.pow(g, L);
    if (gold < first) return 0;
    return Math.max(0, Math.floor(Math.log(gold * (g - 1) / first + 1) / Math.log(g) + 1e-9));
  }

  function torchCost(L, n) {
    const g = T.torchGrowth;
    n = n || 1;
    return U.safe(T.torchBase * Math.pow(g, L) * (Math.pow(g, n) - 1) / (g - 1));
  }
  function torchAfford(L, gold) {
    const g = T.torchGrowth;
    const first = T.torchBase * Math.pow(g, L);
    if (gold < first) return 0;
    return Math.max(0, Math.floor(Math.log(gold * (g - 1) / first + 1) / Math.log(g) + 1e-9));
  }
  // Tap damage from the torch alone: one per level, doubling every 25.
  const torchBase = (L) => (1 + L) * Math.pow(2, Math.floor(L / 25));

  /* ---------- Bonuses ---------- */

  const FX = [
    'gold', 'heroDps', 'tap', 'crit', 'offlineH', 'bossTime', 'chest', 'critDmg', 'wisp', 'boss',
    'skillDur', 'cdr', 'ember', 'leap', 'autoTap', 'tapShare', 'allDmg', 'afk', 'startGold', 'autoBuy',
    'autoCast', 'glass', 'lift', 'mobs', 'swift', 'party',
  ];

  // Everything that's multiplied in, gathered from the save.
  function effects(S) {
    const fx = {};
    for (const k of FX) fx[k] = 0;
    for (const r of D.RELICS) {
      const lv = S.relics[r.id] || 0;
      if (lv) fx[r.fx] += r.per * lv;
    }
    for (const t of D.TALENTS) {
      const lv = S.talents[t.id] || 0;
      if (lv && !t.mult) fx[t.fx] += t.per * lv;
    }
    for (const h of D.HEROES) {
      const lv = S.heroes[h.id] || 0;
      if (!lv) continue;
      for (const p of h.perks) {
        if (lv < p.lv) continue;
        for (const k in p) if (k !== 'lv') fx[k] += p[k];
      }
    }
    return fx;
  }

  // Grows with the square root of every ember ever earned: big early, and
  // steady rather than runaway later. Kept as a log so it can't overflow.
  const warmthLog = (S) => T.warmth * Math.sqrt(S.embersTotal);
  const warmth = (S) => Math.exp(Math.min(600, warmthLog(S)));

  // The two endless talents (Kindled Blades, Prospector) multiply rather
  // than add, so each level stays worth buying.
  const talentMult = (S, id) => Math.pow(D.talent(id).mult, S.talents[id] || 0);

  function stats(S, buffs) {
    buffs = buffs || {};
    const fx = effects(S);
    const warm = warmth(S);
    const dmgAll = U.safe(warm * talentMult(S, 'blades') * (1 + fx.allDmg));
    const heroMult = U.safe((1 + fx.heroDps) * (1 + fx.party) * dmgAll * (buffs.hero || 1));

    const heroDps = {};
    let party = 0;
    for (const h of D.HEROES) {
      const v = U.safe(heroBase(h, S.heroes[h.id] || 0) * heroMult);
      heroDps[h.id] = v;
      party += v;
    }
    party = U.safe(party);

    const tapShare = T.tapShare + fx.tapShare;
    const tapFlat = (1 + fx.tap) * dmgAll;
    const tap = U.safe(torchBase(S.torch) * tapFlat + party * tapShare);
    const critChance = Math.min(0.6, T.critChance + fx.crit);
    const critMult = T.critMult + fx.critDmg;
    const tapAvg = tap * (1 + critChance * (critMult - 1));

    const goldMult = U.safe(warm * talentMult(S, 'greed') * (1 + fx.gold) * (buffs.gold || 1));

    return {
      fx, warm, heroDps, party, heroMult, tap, tapAvg, tapFlat, critChance, critMult, tapShare,
      goldMult,
      bossMult: 1 + fx.boss,
      bossTime: T.bossTime + fx.bossTime,
      offlineCap: (T.offlineH + fx.offlineH) * 3600,
      cdMult: Math.max(0.4, 1 - fx.cdr),
      durMult: 1 + fx.skillDur,
      emberMult: 1 + fx.ember,
      chest: Math.min(0.6, T.chest + fx.chest),
      wispEvery: T.wispEvery / (1 + fx.wisp),
      leap: Math.min(0.5, fx.leap),
      autoTaps: fx.autoTap,
      mobs: Math.max(1, T.mobs - fx.mobs),
      gapMult: Math.max(0.3, 1 - fx.swift),
      afkMult: 1 + fx.afk,
      autoBuy: fx.autoBuy > 0,
      autoCast: fx.autoCast,
      glassSec: 1800 + fx.glass,
      liftFloor: fx.lift,
      startGoldFloor: fx.startGold * 5,
    };
  }

  /* ---------- Rekindling ---------- */

  // Embers for rekindling from a run that reached floor f.
  function embersFor(f, emberMult) {
    if (f < T.emberFloor) return 0;
    const base = Math.pow((f - T.emberFloor + 10) / 10, 0.85) * 2.5;
    return Math.floor(base * (emberMult || 1));
  }

  // Floor a new run starts on.
  function startFloor(S, st) {
    const lift = st.liftFloor;
    if (!lift) return 1;
    return Math.max(1, Math.min(lift, Math.floor(S.bestFloor / 2)) + 1);
  }

  /* ---------- Talents ---------- */

  function talentCost(t, lv) {
    if (t.costs) return t.costs[lv];
    return t.base + t.step * lv;
  }

  /* ---------- Shopping ---------- */

  // The single best-value purchase right now: { kind, id, n, cost, gain }.
  // Looks a milestone ahead so a ×2 is valued properly. Used by the
  // Quartermaster and by tools/balance.js.
  function bestBuy(S, st, gold, withTorch) {
    let best = null;
    const consider = (o) => {
      if (o.cost > gold || !(o.gain > 0)) return;
      o.ratio = o.gain / o.cost;
      if (!best || o.ratio > best.ratio) best = o;
    };
    const mult = st.heroMult;
    for (const h of D.HEROES) {
      const L = S.heroes[h.id] || 0;
      if (!L && heroCost(h, 0) > gold) continue;
      const cur = heroBase(h, L);
      const one = heroBase(h, L + 1) - cur;
      consider({ kind: 'hero', id: h.id, n: 1, cost: heroCost(h, L, 1), gain: one * mult });
      const to = nextMilestone(L) - L;
      if (to > 1) consider({ kind: 'hero', id: h.id, n: to, cost: heroCost(h, L, to), gain: (heroBase(h, L + to) - cur) * mult });
    }
    // withTorch: how many taps a second to credit the torch with.
    if (withTorch) {
      const L = S.torch;
      const crit = 1 + st.critChance * (st.critMult - 1);
      consider({ kind: 'torch', id: 'torch', n: 1, cost: torchCost(L, 1), gain: (torchBase(L + 1) - torchBase(L)) * st.tapFlat * crit * withTorch });
      const n = 25 - (L % 25);
      if (n > 1) consider({ kind: 'torch', id: 'torch', n, cost: torchCost(L, n), gain: (torchBase(L + n) - torchBase(L)) * st.tapFlat * crit * withTorch });
    }
    return best;
  }

  ED.econ = {
    T, isBoss, isGuardian, isHeart, biomeOf, hpExp, mobHP, bossHP, mobGold, bossGold,
    milestone, nextMilestone, heroBase, heroCost, heroAfford, torchCost, torchAfford, torchBase,
    effects, warmth, stats, embersFor, startFloor, talentCost, bestBuy,
  };
})(typeof window !== 'undefined' ? (window.ED = window.ED || {}) : (globalThis.ED = globalThis.ED || {}));
