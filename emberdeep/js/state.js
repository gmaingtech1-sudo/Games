/* Emberdeep — the save and everything that changes it: earning gold,
   killing monsters and bosses, buying levels and talents, relics, feats,
   daily rewards, the moonstone shop and rekindling. The live battle and the
   offline simulation both go through these, so they can never disagree. */
(function (ED) {
  'use strict';

  const D = ED.data;
  const E = ED.econ;
  const U = ED.util;
  const SAVE_KEY = 'emberdeep-save-v1';
  const VERSION = 1;

  function defaults(now) {
    return {
      v: VERSION,
      created: now,
      lastSeen: now,
      gold: 10,           // enough to hire Bram straight away
      moon: 0,
      embers: 0,
      embersTotal: 0,
      floor: 1,
      mobKills: 0,        // monsters beaten on this floor
      hpFrac: 1,          // health left on the current monster, 0–1
      bossT: null,        // seconds left on a boss fight in progress
      wait: 0,            // seconds before the next monster can be hit
      farming: false,     // lost to the boss above; fighting this floor over and over
      bestFloorRun: 1,
      bestFloor: 1,
      bestGuardian: 0,    // deepest Guardian ever beaten
      heartAt: 0,         // when you first beat the Ember Heart, floor 5000
      heroes: {},
      torch: 0,
      talents: {},
      relics: {},
      skills: {},         // id → { ready: ms timestamp, until: ms timestamp }
      buffs: {},          // id → ms timestamp it ends
      feats: {},          // id → tiers claimed
      daily: { last: '', step: 0 },
      runStart: now,
      wispAt: now + 45000,
      seenHint: {},
      settings: { sound: true, music: true, vibe: true, notation: 'letters', numbers: true, saver: false, autoBuy: true, autoBoss: true, notify: false },
      stats: {
        kills: 0, bosses: 0, taps: 0, crits: 0, goldTotal: 0, goldRun: 0, rekindles: 0, wisps: 0,
        chests: 0, afkSec: 0, playSec: 0, bestLevels: 0, bestHired: 0, bossFails: 0,
      },
    };
  }

  // Fill in anything a save from an older version is missing.
  function migrate(S, now) {
    const base = defaults(now);
    for (const k in base) if (S[k] === undefined) S[k] = base[k];
    for (const k in base.settings) if (S.settings[k] === undefined) S.settings[k] = base.settings[k];
    for (const k in base.stats) if (S.stats[k] === undefined) S.stats[k] = base.stats[k];
    for (const k of ['gold', 'moon', 'embers', 'embersTotal']) if (!isFinite(S[k]) || S[k] < 0) S[k] = 0;
    if (!(S.floor >= 1)) S.floor = 1;
    if (!(S.hpFrac > 0 && S.hpFrac <= 1)) S.hpFrac = 1;
    S.v = VERSION;
    return S;
  }

  /* ---------- Derived ---------- */

  // stats() for the save, recomputed only when something that feeds it
  // changes. Everything here that touches heroes, the torch, talents, relics
  // or embers calls invalidate().
  let cache = null;
  let cacheS = null;
  let cacheB = '';
  let rev = 0;
  let cacheRev = -1;
  function stats(S, buffs) {
    const bk = buffs ? buffs.hero + '|' + buffs.gold : '';
    if (S !== cacheS || rev !== cacheRev || bk !== cacheB) {
      cache = E.stats(S, buffs);
      cacheS = S;
      cacheRev = rev;
      cacheB = bk;
    }
    return cache;
  }
  const invalidate = () => { rev += 1; };

  const totalLevels = (S) => D.HEROES.reduce((n, h) => n + (S.heroes[h.id] || 0), 0);
  const hiredCount = (S) => D.HEROES.reduce((n, h) => n + ((S.heroes[h.id] || 0) > 0 ? 1 : 0), 0);
  const relicKinds = (S) => D.RELICS.reduce((n, r) => n + ((S.relics[r.id] || 0) > 0 ? 1 : 0), 0);

  /* ---------- Gold ---------- */

  function earn(S, g) {
    if (!(g > 0)) return;
    S.gold = U.safe(S.gold + g);
    S.stats.goldTotal = U.safe(S.stats.goldTotal + g);
    S.stats.goldRun = U.safe(S.stats.goldRun + g);
  }

  function spend(S, g) {
    if (!(g <= S.gold)) return false;
    S.gold = Math.max(0, S.gold - g);
    return true;
  }

  /* ---------- Floors ---------- */

  function arrive(S, f) {
    S.floor = f;
    S.mobKills = 0;
    S.hpFrac = 1;
    S.bossT = null;
    if (f > S.bestFloorRun) S.bestFloorRun = f;
    if (f > S.bestFloor) S.bestFloor = f;
  }

  // Called when a monster falls. Returns what happened, for the battle to show.
  function killMob(S, st, goldMult, rng) {
    rng = rng || Math.random;
    const g = E.mobGold(S.floor) * goldMult;
    earn(S, g);
    S.stats.kills += 1;
    S.hpFrac = 1;
    S.wait = E.T.mobGap * st.gapMult;
    if (S.farming) return { gold: g, floorDone: false };
    S.mobKills += 1;
    if (S.mobKills < st.mobs) return { gold: g, floorDone: false };
    let to = S.floor + 1;
    let leapt = false;
    if (!E.isBoss(to) && rng() < st.leap) { to += 1; leapt = true; }
    arrive(S, to);
    S.wait = E.T.floorGap * st.gapMult + (E.isBoss(to) ? E.T.bossGap : 0);
    return { gold: g, floorDone: true, leapt };
  }

  function killBoss(S, st, goldMult, rng) {
    rng = rng || Math.random;
    const f = S.floor;
    const g = E.bossGold(f) * goldMult;
    earn(S, g);
    S.stats.bosses += 1;
    S.stats.kills += 1;
    const out = { gold: g, relics: [], moon: 0, guardian: E.isGuardian(f), first: false, heart: false };
    if (E.isHeart(f) && !S.heartAt) {
      S.heartAt = Date.now();
      out.heart = true;
      S.moon += 500;
    }
    if (E.isGuardian(f) && f > S.bestGuardian) {
      S.bestGuardian = f;
      out.first = true;
      out.moon = 5 + Math.min(25, Math.floor(f / 50));
      S.moon += out.moon;
      out.relics.push(grantRelic(S, rng));
    } else if (E.isGuardian(f) && rng() < st.chest) {
      out.relics.push(grantRelic(S, rng));
    }
    arrive(S, f + 1);
    S.wait = E.T.floorGap * st.gapMult;
    return out;
  }

  function failBoss(S, st) {
    S.stats.bossFails += 1;
    S.farming = true;
    arrive(S, Math.max(1, S.floor - 1));
    S.wait = E.T.floorGap * st.gapMult;
  }

  // Leave farming and walk down to the boss again.
  function challenge(S, st) {
    if (!S.farming) return;
    S.farming = false;
    arrive(S, S.floor + 1);
    S.wait = E.T.bossGap;
  }

  // Can the party beat the boss below without the player's help?
  function canBeatBoss(S, st, dps) {
    const f = S.floor + 1;
    if (!E.isBoss(f)) return true;
    return E.bossHP(f) / Math.max(1e-300, dps * st.bossMult) <= st.bossTime * 0.92;
  }

  /* ---------- Relics ---------- */

  function rollRelic(rng) {
    rng = rng || Math.random;
    const tiers = Object.keys(D.RARITY);
    let total = 0;
    for (const k of tiers) total += D.RARITY[k].weight;
    let x = rng() * total;
    let rarity = tiers[0];
    for (const k of tiers) {
      x -= D.RARITY[k].weight;
      if (x < 0) { rarity = k; break; }
    }
    const pool = D.RELICS.filter((r) => r.rarity === rarity);
    return pool[Math.floor(rng() * pool.length)];
  }

  // Open a chest: a new relic, or a level for one you have. A relic already
  // at its top level turns into moonstones instead.
  function grantRelic(S, rng) {
    const r = rollRelic(rng);
    const lv = S.relics[r.id] || 0;
    S.stats.chests += 1;
    invalidate();
    if (lv >= D.RELIC_MAX) {
      const moon = { common: 10, rare: 20, epic: 40, legendary: 80 }[r.rarity];
      S.moon += moon;
      return { id: r.id, level: lv, moon, isNew: false };
    }
    S.relics[r.id] = lv + 1;
    return { id: r.id, level: lv + 1, isNew: lv === 0, moon: 0 };
  }

  /* ---------- Buying ---------- */

  function buyHero(S, id, n) {
    const h = D.hero(id);
    const L = S.heroes[id] || 0;
    const cost = E.heroCost(h, L, n);
    if (!(n > 0) || !spend(S, cost)) return false;
    S.heroes[id] = L + n;
    invalidate();
    const lv = totalLevels(S);
    if (lv > S.stats.bestLevels) S.stats.bestLevels = lv;
    const hired = hiredCount(S);
    if (hired > S.stats.bestHired) S.stats.bestHired = hired;
    return true;
  }

  function buyTorch(S, n) {
    const cost = E.torchCost(S.torch, n);
    if (!(n > 0) || !spend(S, cost)) return false;
    S.torch += n;
    invalidate();
    return true;
  }

  // The Quartermaster: keeps buying the best-value level while it can.
  // Waits for the best option if it'll be affordable within `patience`
  // seconds of income rather than frittering gold on lesser ones.
  function autoBuy(S, goldRate, patience, buffs) {
    let bought = 0;
    for (let i = 0; i < 200; i++) {
      const st = stats(S, buffs);
      const best = E.bestBuy(S, st, Infinity, 0);
      if (!best) break;
      if (best.cost <= S.gold) {
        if (!buyHero(S, best.id, best.n)) break;
        bought += best.n;
        continue;
      }
      if (goldRate > 0 && (best.cost - S.gold) / goldRate < (patience || 20)) break;
      const aff = E.bestBuy(S, st, S.gold, 0);
      if (!aff || !buyHero(S, aff.id, aff.n)) break;
      bought += aff.n;
    }
    return bought;
  }

  function buyTalent(S, id) {
    const t = D.talent(id);
    const lv = S.talents[id] || 0;
    if (lv >= t.max) return false;
    const cost = E.talentCost(t, lv);
    if (S.embers < cost) return false;
    S.embers -= cost;
    S.talents[id] = lv + 1;
    invalidate();
    return true;
  }

  /* ---------- Rekindling ---------- */

  function rekindleGain(S) {
    return E.embersFor(S.bestFloorRun, stats(S).emberMult);
  }

  function rekindle(S, now) {
    const gain = rekindleGain(S);
    if (gain <= 0) return 0;
    S.embers += gain;
    S.embersTotal += gain;
    S.stats.rekindles += 1;
    S.heroes = {};
    S.torch = 0;
    S.gold = 10;
    S.farming = false;
    S.stats.goldRun = 0;
    S.runStart = now;
    S.bestFloorRun = 1;
    // Skill and wisp buffs end with the run; a Gilded Banner you paid for doesn't.
    S.buffs = S.buffs.banner ? { banner: S.buffs.banner } : {};
    invalidate();
    const st = stats(S);
    arrive(S, E.startFloor(S, st));
    S.bestFloorRun = S.floor;
    S.wait = 1.5;
    // Gold to hire with: enough for the floor you start on, or more with
    // the Starting Purse.
    const purseFloor = Math.max(st.startGoldFloor, S.floor > 1 ? S.floor : 0);
    if (purseFloor) earn(S, E.mobGold(purseFloor) * 40 * st.goldMult);
    return gain;
  }

  /* ---------- Feats ---------- */

  function featValue(S, stat) {
    switch (stat) {
      case 'bestFloor': return S.bestFloor;
      case 'relicKinds': return relicKinds(S);
      case 'levels': return Math.max(S.stats.bestLevels, totalLevels(S));
      case 'hired': return Math.max(S.stats.bestHired, hiredCount(S));
      case 'embersTotal': return S.embersTotal;
      case 'afkHours': return S.stats.afkSec / 3600;
      default: return S.stats[stat] || 0;
    }
  }

  // How many tiers of a feat are done but not yet claimed.
  function featReady(S, f) {
    const v = featValue(S, f.stat);
    const done = f.tiers.filter((t) => v >= t).length;
    return Math.max(0, done - (S.feats[f.id] || 0));
  }

  function claimFeat(S, id) {
    const f = D.FEATS.find((x) => x.id === id);
    if (!f || featReady(S, f) <= 0) return 0;
    const tier = S.feats[id] || 0;
    const moon = D.featReward(tier);
    S.feats[id] = tier + 1;
    S.moon += moon;
    return moon;
  }

  const featsReady = (S) => D.FEATS.reduce((n, f) => n + featReady(S, f), 0);

  /* ---------- Skills & buffs ---------- */

  function skillUnlocked(S, sk) { return S.bestFloor >= sk.floor; }

  function buffMult(S, now) {
    const b = S.buffs;
    const on = (id) => b[id] && b[id] > now;
    return {
      hero: (on('cry') ? 2 : 1) * (on('wisp') ? 3 : 1),
      gold: (on('midas') ? 3 : 1) * (on('banner') ? 2 : 1),
      flurry: on('flurry'),
    };
  }

  /* ---------- Saving ---------- */

  // Saves go through ED.host: localStorage in a browser, the app's own
  // storage on Android.
  function load(now) {
    let raw = null;
    try { raw = JSON.parse(ED.host.loadSave() || 'null'); } catch (e) { raw = null; }
    if (raw && typeof raw === 'object' && raw.v) {
      try { return migrate(raw, now); } catch (e) { /* fall through to a new save */ }
    }
    return defaults(now);
  }

  function save(S) {
    ED.host.writeSave(JSON.stringify(S));
  }

  function wipe() {
    ED.host.clearSave();
  }

  // A save as a shareable text code, and back.
  function exportCode(S) {
    const json = JSON.stringify(S);
    return 'ED1:' + btoa(unescape(encodeURIComponent(json)));
  }
  function importCode(code, now) {
    code = String(code || '').trim();
    if (!code.startsWith('ED1:')) return null;
    try {
      const S = JSON.parse(decodeURIComponent(escape(atob(code.slice(4)))));
      if (!S || typeof S !== 'object' || !S.v) return null;
      return migrate(S, now);
    } catch (e) {
      return null;
    }
  }

  ED.state = {
    SAVE_KEY, defaults, migrate, stats, invalidate, totalLevels, hiredCount, relicKinds,
    earn, spend, arrive, killMob, killBoss, failBoss, challenge, canBeatBoss,
    rollRelic, grantRelic, buyHero, buyTorch, autoBuy, buyTalent, rekindleGain, rekindle,
    featValue, featReady, claimFeat, featsReady, skillUnlocked, buffMult,
    load, save, wipe, exportCode, importCode,
  };
})(typeof window !== 'undefined' ? (window.ED = window.ED || {}) : (globalThis.ED = globalThis.ED || {}));
