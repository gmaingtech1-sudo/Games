/* Wayfarers — your save and everything you can do with it: levelling,
   summoning, ascending, camp upgrades, the AFK chest, quests and rebirth.
   No DOM here either; the UI calls these and redraws. */
(function (WF) {
  'use strict';

  const D = WF.data;
  const KEY = 'wayfarers-save-v1';

  function defaults() {
    return {
      v: 1,
      gold: 0,
      gems: 300,
      souls: 0,
      heroes: {
        brom: { level: 1, stars: 1, copies: 0 },
        wren: { level: 1, stars: 1, copies: 0 },
      },
      party: ['brom', 'wren'],
      stage: 1, // the stage being fought
      best: 0, // highest stage cleared this run
      bestEver: 0,
      autoPush: true,
      speed: 1,
      camp: {},
      chest: { gold: 0, gems: 0, secs: 0 },
      stats: { kills: 0, bosses: 0, summons: 0, claims: 0, rebirths: 0 },
      quests: {},
      lastFree: 0,
      fastDay: '',
      fastUsed: 0,
      lastSeen: Date.now(),
      sound: true,
      haptics: true,
      remind: false,
      tutorial: true,
    };
  }

  let S = defaults();

  function load(storage) {
    try {
      const raw = storage && storage.getItem(KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        const base = defaults();
        S = Object.assign(base, saved);
        S.chest = Object.assign(base.chest, saved.chest);
        S.stats = Object.assign(base.stats, saved.stats);
        S.party = (S.party || []).filter((id) => S.heroes[id] && D.HERO[id]);
      }
    } catch (e) {
      S = defaults();
    }
    return S;
  }

  function save(storage) {
    S.lastSeen = Date.now();
    try { storage && storage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage may be blocked */ }
  }

  function reset(storage) {
    try { storage && storage.removeItem(KEY); } catch (e) { /* ignore */ }
    S = defaults();
    return S;
  }

  /* ---------- Derived numbers ---------- */

  const campLvl = (id) => S.camp[id] || 0;

  function bonus() {
    const soul = 1 + D.SOUL_BONUS * S.souls;
    const c = D.CAMP_BY;
    return {
      atk: (1 + c.blades.per * campLvl('blades')) * soul,
      hp: (1 + c.armor.per * campLvl('armor')) * soul,
      speed: 1 + c.drums.per * campLvl('drums'),
      gold: (1 + c.purse.per * campLvl('purse')) * soul,
      afk: 1 + c.banner.per * campLvl('banner'),
      energy: 1 + c.tome.per * campLvl('tome'),
    };
  }

  // A hero's fighting numbers with every bonus applied.
  function heroFull(id) {
    const h = S.heroes[id];
    const base = D.heroStats(id, h.level, h.stars);
    const b = bonus();
    return { hp: base.hp * b.hp, atk: base.atk * b.atk, interval: base.interval / b.speed };
  }

  function power(id) {
    const f = heroFull(id);
    return Math.round((f.atk / f.interval) * 6 + f.hp / 2);
  }

  const partyPower = () => S.party.reduce((sum, id) => sum + power(id), 0);
  const topLevel = () => Math.max(...Object.values(S.heroes).map((h) => h.level));
  const owned = () => Object.keys(S.heroes).length;

  function stat(name) {
    if (name === 'topLevel') return topLevel();
    if (name === 'owned') return owned();
    if (name === 'best') return S.bestEver;
    return S.stats[name] || 0;
  }

  /* ---------- Heroes ---------- */

  // How many levels `gold` buys for a hero, and what they cost (up to `max`).
  function levelPlan(id, max) {
    const h = S.heroes[id];
    let lvl = h.level;
    let cost = 0;
    let n = 0;
    while (n < max) {
      const c = D.levelCost(lvl);
      if (n > 0 && cost + c > S.gold) break;
      cost += c;
      lvl++;
      n++;
    }
    return { n, cost };
  }

  function levelUp(id, max) {
    const plan = levelPlan(id, max);
    if (plan.n === 0 || plan.cost > S.gold) return 0;
    S.gold -= plan.cost;
    S.heroes[id].level += plan.n;
    return plan.n;
  }

  function canAscend(id) {
    const h = S.heroes[id];
    return h && h.stars < D.MAX_STARS && h.copies >= D.ascendCost(h.stars);
  }

  function ascend(id) {
    if (!canAscend(id)) return false;
    const h = S.heroes[id];
    h.copies -= D.ascendCost(h.stars);
    h.stars++;
    return true;
  }

  function toggleParty(id) {
    const i = S.party.indexOf(id);
    if (i >= 0) {
      if (S.party.length <= 1) return 'last';
      S.party.splice(i, 1);
      return 'out';
    }
    if (S.party.length >= D.PARTY_SIZE) return 'full';
    S.party.push(id);
    return 'in';
  }

  /* ---------- Summoning ---------- */

  function rollHero(rng) {
    rng = rng || Math.random;
    const total = Object.values(D.RARITY).reduce((s, r) => s + r.weight, 0);
    let x = rng() * total;
    let rarity = 'common';
    for (const [k, r] of Object.entries(D.RARITY)) {
      if (x < r.weight) { rarity = k; break; }
      x -= r.weight;
    }
    const pool = D.HEROES.filter((h) => h.rarity === rarity);
    return pool[Math.floor(rng() * pool.length)].id;
  }

  const freeSummonIn = (now) => Math.max(0, S.lastFree + D.FREE_SUMMON_EVERY * 1000 - now) / 1000;

  // kind: 'one' | 'ten' | 'free'. Returns [{ id, isNew }] or null.
  function summon(kind, now) {
    let n = 1;
    if (kind === 'free') {
      if (freeSummonIn(now) > 0) return null;
      S.lastFree = now;
    } else if (kind === 'ten') {
      if (S.gems < D.SUMMON10_GEMS) return null;
      S.gems -= D.SUMMON10_GEMS;
      n = 10;
    } else {
      if (S.gems < D.SUMMON_GEMS) return null;
      S.gems -= D.SUMMON_GEMS;
    }
    const out = [];
    for (let i = 0; i < n; i++) {
      // A ten-pull always has at least one Epic or better.
      let id = rollHero();
      if (n === 10 && i === 9 && !out.some((r) => ['epic', 'legendary'].includes(D.HERO[r.id].rarity))) {
        while (!['epic', 'legendary'].includes(D.HERO[id].rarity)) id = rollHero();
      }
      const isNew = !S.heroes[id];
      if (isNew) {
        S.heroes[id] = { level: 1, stars: 1, copies: 0 };
        if (S.party.length < D.PARTY_SIZE) S.party.push(id);
      } else {
        S.heroes[id].copies++;
      }
      out.push({ id, isNew });
    }
    S.stats.summons += n;
    return out;
  }

  /* ---------- Camp ---------- */

  function campCanBuy(id) {
    const c = D.CAMP_BY[id];
    const lvl = campLvl(id);
    return (!c.max || lvl < c.max) && S.gold >= D.campCost(id, lvl);
  }

  function campBuy(id) {
    if (!campCanBuy(id)) return false;
    S.gold -= D.campCost(id, campLvl(id));
    S.camp[id] = campLvl(id) + 1;
    return true;
  }

  /* ---------- AFK chest ---------- */

  // Adds `secs` of AFK loot to the chest (stopping at the cap). Returns how
  // many seconds actually counted.
  function fillChest(secs) {
    const room = Math.max(0, D.AFK_CAP - S.chest.secs);
    const t = Math.min(room, Math.max(0, secs));
    if (t <= 0) return 0;
    const r = D.afkRate(S.best, bonus());
    S.chest.gold += r.gold * t;
    S.chest.gems += r.gems * t;
    S.chest.secs += t;
    return t;
  }

  function claimChest() {
    const gold = Math.floor(S.chest.gold);
    const gems = Math.floor(S.chest.gems);
    if (gold <= 0 && gems <= 0) return null;
    S.gold += gold;
    S.gems += gems;
    // Keep the fractions so nothing is lost to rounding.
    S.chest = { gold: S.chest.gold - gold, gems: S.chest.gems - gems, secs: 0 };
    S.stats.claims++;
    return { gold, gems };
  }

  const today = (now) => new Date(now).toDateString();

  function fastRewardCost(now) {
    if (S.fastDay !== today(now)) return 0;
    return S.fastUsed === 0 ? 0 : D.FAST_REWARD_GEMS;
  }

  function fastReward(now) {
    const cost = fastRewardCost(now);
    if (S.gems < cost) return null;
    if (S.fastDay !== today(now)) { S.fastDay = today(now); S.fastUsed = 0; }
    S.gems -= cost;
    S.fastUsed++;
    const r = D.afkRate(S.best, bonus());
    const gold = Math.floor(r.gold * D.FAST_REWARD_SECONDS);
    S.gold += gold;
    return { gold, cost };
  }

  /* ---------- Battle results ---------- */

  function onKill(stage, boss) {
    S.stats.kills++;
    const g = D.goldPerKill(stage) * bonus().gold * (boss ? 5 : 1);
    S.gold += g;
    return g;
  }

  // Returns any gems earned for a first clear.
  function onStageWon(stage) {
    let gems = 0;
    if (D.isBoss(stage)) {
      S.stats.bosses++;
      if (stage > S.bestEver) gems = 50;
    }
    if (stage > S.best) S.best = stage;
    if (stage > S.bestEver) S.bestEver = stage;
    S.gems += gems;
    if (S.autoPush) S.stage = stage + 1;
    return gems;
  }

  function onStageLost(stage) {
    S.autoPush = false;
    S.stage = Math.max(1, Math.min(stage - 1, S.best));
  }

  function challenge() {
    S.autoPush = true;
    S.stage = S.best + 1;
  }

  /* ---------- Quests ---------- */

  function questState(q) {
    const tier = S.quests[q.id] || 0;
    if (tier >= q.tiers.length) return { done: true, tier, q };
    const target = q.tiers[tier];
    const have = stat(q.stat);
    return { done: false, tier, q, target, have, ready: have >= target, gems: q.gems[tier], label: q.label(target) };
  }

  const questsReady = () => D.QUESTS.filter((q) => questState(q).ready).length;

  function claimQuest(id) {
    const q = D.QUESTS.find((x) => x.id === id);
    const st = questState(q);
    if (!st.ready) return 0;
    S.quests[id] = st.tier + 1;
    S.gems += st.gems;
    return st.gems;
  }

  /* ---------- Rebirth ---------- */

  function rebirth() {
    const souls = D.soulsFor(S.best);
    if (souls <= 0) return 0;
    S.souls += souls;
    S.gold = 0;
    S.stage = 1;
    S.best = 0;
    S.autoPush = true;
    S.camp = {};
    S.chest = { gold: 0, gems: S.chest.gems, secs: 0 };
    for (const h of Object.values(S.heroes)) h.level = 1;
    S.stats.rebirths++;
    return souls;
  }

  WF.state = {
    get S() { return S; },
    defaults, load, save, reset,
    bonus, heroFull, power, partyPower, topLevel, owned, campLvl,
    levelPlan, levelUp, canAscend, ascend, toggleParty,
    rollHero, freeSummonIn, summon,
    campCanBuy, campBuy,
    fillChest, claimChest, fastRewardCost, fastReward,
    onKill, onStageWon, onStageLost, challenge,
    questState, questsReady, claimQuest,
    rebirth,
  };
})(typeof window !== 'undefined' ? (window.WF = window.WF || {}) : (globalThis.WF = globalThis.WF || {}));
