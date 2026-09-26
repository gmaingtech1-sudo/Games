/* Riftborn — the player's save and the game's rules: items, XP, creatures,
   DNA, fusion, and everything you can do to a Rift (hack, claim, upgrade,
   recharge, link, and the control fields that links make). */
window.RB = window.RB || {};
(function (RB) {
  'use strict';

  const { rng, hash, randInt, uid, clamp } = RB.util;
  const C = RB.creatures;
  const W = RB.world;

  const FACTIONS = {
    W: { id: 'W', name: 'Wardens', one: 'Warden', color: '#2EE6C5', glyph: '⬡', motto: 'Seal the Rifts. Protect both worlds.' },
    B: { id: 'B', name: 'Breachers', one: 'Breacher', color: '#FF4FA3', glyph: '✶', motto: 'Tear them open. Claim the power beyond.' },
  };
  const NEUTRAL = '#A9A3C9';

  const HACK_MS = 5 * 60e3;
  const DROP_MS = 10 * 60e3;
  const DECAY_PER_DAY = 12;
  const MAX_TEAM = 3;
  const RANGE = 60;           // meters you can reach things from
  const MAX_LEVEL = 40;

  let save = null;
  let saveTimer = null;

  /* ------------------ Save ------------------ */

  function blank(name, faction) {
    return {
      v: 1,
      created: Date.now(),
      agent: { name, faction, xp: 0 },
      items: { orbs: 20, darts: 30, shards: 12 },
      keys: {},          // riftId → { n, name, lat, lng }
      creatures: [],     // { id, sp, lvl, iv, t }
      team: [],
      dna: {},           // species → amount
      dex: {},           // species → { seen, caught }
      rifts: {},         // riftId → override
      links: [],         // { a, b, al: [lat, lng], bl: [lat, lng] }
      fields: [],        // { ids: [a, b, c], ll: [[lat, lng] x3], aether }
      gone: {},          // spawnId → expiry (caught or fled)
      hacks: {},         // riftId → time
      drops: {},         // dropId → time
      events: [],        // news to show on next look ("your Rift fell")
      stats: { caught: 0, darts: 0, hacks: 0, claimed: 0, links: 0, fields: 0, wins: 0, fused: 0, meters: 0 },
      settings: { sound: true, walk: 'gps', map: 'streets', ar: true },
      lastPos: null,
    };
  }

  function load() {
    const raw = RB.host.loadSave();
    if (!raw) return null;
    try {
      const s = JSON.parse(raw);
      if (!s || s.v !== 1 || !s.agent) return null;
      const b = blank(s.agent.name, s.agent.faction);
      for (const k of Object.keys(b)) if (s[k] === undefined) s[k] = b[k];
      s.stats = Object.assign(b.stats, s.stats);
      s.settings = Object.assign(b.settings, s.settings);
      save = s;
      return s;
    } catch (e) {
      return null;
    }
  }

  function persist(now) {
    if (!save) return;
    if (now) {
      clearTimeout(saveTimer);
      saveTimer = null;
      RB.host.writeSave(JSON.stringify(save));
      return;
    }
    if (saveTimer) return;
    saveTimer = setTimeout(() => { saveTimer = null; RB.host.writeSave(JSON.stringify(save)); }, 400);
  }

  function newGame(name, faction, starter) {
    save = blank(name, faction);
    const c = addCreature(starter, 5, [7, 7, 7]);
    save.team = [c.id];
    save.dna[starter] = 60;
    persist(true);
    return save;
  }

  function reset() {
    RB.host.clearSave();
    save = null;
  }

  /* ------------------ Agent level ------------------ */

  // Total XP needed to reach level L.
  const xpFor = (L) => (L <= 1 ? 0 : Math.round(400 * Math.pow(L - 1, 1.75)));

  function level() {
    const xp = save.agent.xp;
    let L = 1;
    while (L < MAX_LEVEL && xp >= xpFor(L + 1)) L++;
    const into = xp - xpFor(L), need = L >= MAX_LEVEL ? 1 : xpFor(L + 1) - xpFor(L);
    return { level: L, into, need, frac: L >= MAX_LEVEL ? 1 : into / need };
  }

  // Returns the new level if this XP levelled you up, else 0.
  function addXP(n) {
    const before = level().level;
    save.agent.xp += Math.round(n);
    const after = level().level;
    if (after > before) {
      // Level-up bonus.
      give({ orbs: 5 + after, darts: 10 + after * 2, shards: 3 + Math.floor(after / 2) });
      persist();
      return after;
    }
    persist();
    return 0;
  }

  const faction = () => FACTIONS[save.agent.faction];
  const enemyId = () => (save.agent.faction === 'W' ? 'B' : 'W');

  /* ------------------ Items ------------------ */

  function give(loot) {
    for (const k of ['orbs', 'darts', 'shards']) if (loot[k]) save.items[k] += loot[k];
    persist();
  }

  function take(kind, n) {
    if (save.items[kind] < n) return false;
    save.items[kind] -= n;
    persist();
    return true;
  }

  function addKey(rift) {
    const k = save.keys[rift.id] || (save.keys[rift.id] = { n: 0, name: rift.name, lat: rift.lat, lng: rift.lng });
    k.n++;
    k.name = rift.name;
  }

  /* ------------------ Creatures & DNA ------------------ */

  function addCreature(sp, lvl, iv) {
    const c = { id: uid(), sp, lvl: clamp(lvl, 1, C.MAX_LEVEL), iv: iv || [randInt(0, 10), randInt(0, 10), randInt(0, 10)], t: Date.now() };
    save.creatures.push(c);
    markDex(sp, 'caught');
    persist();
    return c;
  }

  function creature(id) {
    return save.creatures.find((c) => c.id === id) || null;
  }

  function markDex(sp, what) {
    const d = save.dex[sp] || (save.dex[sp] = { seen: 0, caught: 0 });
    d.seen = Math.max(d.seen, 1);
    if (what === 'caught') d.caught++;
  }

  const dna = (sp) => save.dna[sp] || 0;
  function addDNA(sp, n) {
    save.dna[sp] = dna(sp) + Math.round(n);
    persist();
  }

  function levelUp(id) {
    const c = creature(id);
    if (!c || c.lvl >= C.MAX_LEVEL) return { ok: false, why: 'Already at max level.' };
    const cost = C.levelCost(c);
    if (dna(c.sp) < cost) return { ok: false, why: `Needs ${cost} ${C.byId(c.sp).name} DNA.` };
    save.dna[c.sp] -= cost;
    c.lvl++;
    addXP(40);
    persist();
    return { ok: true };
  }

  // Release a creature back through the Rift for some DNA.
  function release(id) {
    if (save.creatures.length <= 1) return { ok: false, why: 'You need to keep at least one creature.' };
    const c = creature(id);
    if (!c) return { ok: false };
    const back = 20 + c.lvl * 5;
    addDNA(c.sp, back);
    save.creatures = save.creatures.filter((x) => x.id !== id);
    save.team = save.team.filter((x) => x !== id);
    for (const o of Object.values(save.rifts)) if (o.guard) o.guard = o.guard.filter((x) => x !== id);
    persist();
    return { ok: true, dna: back };
  }

  function team() {
    const picked = save.team.map(creature).filter(Boolean);
    if (picked.length >= Math.min(MAX_TEAM, save.creatures.length)) return picked.slice(0, MAX_TEAM);
    // Fill empty slots with the strongest others.
    const rest = save.creatures.filter((c) => !picked.includes(c)).sort((a, b) => C.power(b) - C.power(a));
    return picked.concat(rest).slice(0, MAX_TEAM);
  }

  function toggleTeam(id) {
    if (save.team.includes(id)) {
      save.team = save.team.filter((x) => x !== id);
    } else {
      if (save.team.length >= MAX_TEAM) save.team.shift();
      save.team.push(id);
    }
    persist();
  }

  // Fusing spends DNA from both parents and gives hybrid DNA. The first time
  // hybrid DNA reaches 100, the hybrid is created.
  function canFuse(h) {
    const sp = C.byId(h);
    return sp.parents.every((p) => dna(p) >= C.fuseCost(p));
  }

  function fuse(h) {
    const sp = C.byId(h);
    if (!canFuse(h)) return { ok: false, why: 'Not enough DNA.' };
    for (const p of sp.parents) save.dna[p] -= C.fuseCost(p);
    const gain = randInt(15, 45) + (Math.random() < 0.1 ? 40 : 0);
    addDNA(h, gain);
    save.stats.fused++;
    markDex(h, 'seen');
    let created = null;
    const owned = save.creatures.some((c) => c.sp === h);
    if (!owned && dna(h) >= 100) {
      save.dna[h] -= 100;
      created = addCreature(h, 1);
    }
    addXP(200);
    persist();
    return { ok: true, gain, created };
  }

  /* ------------------ Rifts ------------------ */

  const day = (t) => Math.floor(t / 86400e3);

  // Current state of a Rift: the generated one, overridden by what players
  // (you) have done to it.
  function riftState(rift, now) {
    now = now || Date.now();
    const o = save.rifts[rift.id];
    if (o) {
      let health = o.health;
      if (o.faction && o.mine) health = Math.max(0, o.health - (now - o.t) / 86400e3 * DECAY_PER_DAY);
      return {
        faction: o.faction, level: o.level, health: Math.round(health), mine: !!o.mine,
        guard: o.mine ? (o.guard || []).map(creature).filter(Boolean) : o.faction ? W.guardians(rift, o.level, o.gseed) : [],
      };
    }
    // Untouched: the generated owner, but the Rift war shifts a few every day.
    let f = rift.base.faction, L = rift.base.level;
    const r = rng(`contest:${rift.id}:${day(now)}`);
    if (r() < 0.1) {
      const x = r();
      f = x < 0.4 ? 'W' : x < 0.8 ? 'B' : null;
      L = f ? randInt(1, 6, r) : 0;
    }
    const health = f ? 55 + (hash(`hp:${rift.id}:${day(now)}`) % 46) : 0;
    return { faction: f, level: L, health, mine: false, guard: f ? W.guardians(rift, L, day(now)) : [] };
  }

  function riftColor(st) {
    return st.faction ? FACTIONS[st.faction].color : NEUTRAL;
  }

  function hackReady(rift, now) {
    const t = save.hacks[rift.id] || 0;
    return Math.max(0, t + HACK_MS - (now || Date.now()));
  }

  function hack(rift) {
    const now = Date.now();
    if (hackReady(rift, now) > 0) return { ok: false, why: 'Cooling down.' };
    const st = riftState(rift, now);
    const friendly = st.faction === save.agent.faction;
    const enemy = st.faction && !friendly;
    const lvl = Math.max(1, st.level);
    const loot = {
      orbs: randInt(enemy ? 0 : 1, 2 + Math.ceil(lvl / 3)),
      darts: randInt(2, 4 + lvl),
      shards: randInt(1, 2 + Math.floor(lvl / 3)),
    };
    give(loot);
    let key = false;
    if (Math.random() < (enemy ? 0.45 : 0.7)) { addKey(rift); key = true; }
    save.hacks[rift.id] = now;
    save.stats.hacks++;
    const up = addXP(enemy ? 100 : 50);
    persist();
    return { ok: true, loot, key, up };
  }

  const claimCost = 6;
  const upgradeCost = (L) => 3 + L * 2;
  const maxRiftLevel = () => Math.min(8, 1 + Math.floor(level().level / 2));
  const maxGuards = (L) => (L <= 2 ? 1 : L <= 5 ? 2 : 3);

  function claim(rift) {
    const st = riftState(rift);
    if (st.faction) return { ok: false, why: 'This Rift is already held.' };
    if (!take('shards', claimCost)) return { ok: false, why: `Claiming needs ${claimCost} Rift Shards. Hack Rifts and open caches to get more.` };
    const best = team()[0];
    save.rifts[rift.id] = { faction: save.agent.faction, level: 1, health: 100, t: Date.now(), mine: true, guard: best ? [best.id] : [] };
    addKey(rift);
    save.stats.claimed++;
    const up = addXP(300);
    persist();
    return { ok: true, up };
  }

  function upgrade(rift) {
    const st = riftState(rift);
    if (!st.mine) return { ok: false, why: 'You can only upgrade your own Rifts.' };
    if (st.level >= 8) return { ok: false, why: 'Already at the top level.' };
    if (st.level >= maxRiftLevel()) return { ok: false, why: `Reach agent level ${st.level * 2} to go higher.` };
    const cost = upgradeCost(st.level);
    if (!take('shards', cost)) return { ok: false, why: `Needs ${cost} Rift Shards.` };
    const o = save.rifts[rift.id];
    o.level++;
    o.health = 100;
    o.t = Date.now();
    const up = addXP(150);
    persist();
    return { ok: true, up };
  }

  function recharge(rift) {
    const st = riftState(rift);
    if (st.faction !== save.agent.faction) return { ok: false, why: 'Not your faction.' };
    if (st.health >= 100) return { ok: false, why: 'Already fully charged.' };
    if (!take('shards', 2)) return { ok: false, why: 'Needs 2 Rift Shards.' };
    const o = save.rifts[rift.id];
    if (o) { o.health = 100; o.t = Date.now(); }
    else save.rifts[rift.id] = { faction: st.faction, level: st.level, health: 100, t: Date.now(), mine: false };
    const up = addXP(60);
    persist();
    return { ok: true, up };
  }

  function setGuards(rift, ids) {
    const o = save.rifts[rift.id];
    if (!o || !o.mine) return;
    o.guard = ids.slice(0, maxGuards(o.level));
    persist();
  }

  // You beat the guardians: the Rift goes neutral.
  function neutralize(rift) {
    const st = riftState(rift);
    save.rifts[rift.id] = { faction: null, level: 0, health: 0, t: Date.now(), mine: false };
    for (const g of st.guard) addDNA(g.sp, 15 + g.lvl);
    save.stats.wins++;
    validateLinks();
    const up = addXP(400 + st.level * 50);
    persist();
    return { ok: true, up, dna: st.guard.map((g) => ({ sp: g.sp, n: 15 + g.lvl })) };
  }

  /* ------------------ Links & fields ------------------ */

  const linkRange = (L) => 300 * Math.pow(2, Math.max(0, L - 1));
  const llOf = (r) => [r.lat, r.lng];
  const xy = (ll) => W.toXY(ll[0], ll[1]);

  function linkExists(a, b) {
    return save.links.some((l) => (l.a === a && l.b === b) || (l.a === b && l.b === a));
  }

  function linkCrosses(al, bl) {
    const A = xy(al), B = xy(bl);
    return save.links.some((l) => W.crosses(A, B, xy(l.al), xy(l.bl)));
  }

  // Rifts you could link to from `rift`, from the keys you hold.
  function linkTargets(rift) {
    const st = riftState(rift);
    const out = [];
    if (st.faction !== save.agent.faction) return out;
    const range = linkRange(st.level);
    for (const [id, k] of Object.entries(save.keys)) {
      if (id === rift.id || k.n <= 0) continue;
      const target = W.riftById(id);
      if (!target) continue;
      const tst = riftState(target);
      const d = W.distM(rift, target);
      let why = '';
      if (tst.faction !== save.agent.faction) why = 'Not held by your faction';
      else if (d > range) why = `Too far (range ${RB.util.fmtDist(range)})`;
      else if (linkExists(rift.id, id)) why = 'Already linked';
      else if (linkCrosses(llOf(rift), llOf(target))) why = 'Would cross a link';
      out.push({ rift: target, key: k, dist: d, why });
    }
    return out.sort((a, b) => (a.why ? 1 : 0) - (b.why ? 1 : 0) || a.dist - b.dist);
  }

  function link(rift, target) {
    const t = linkTargets(rift).find((x) => x.rift.id === target.id);
    if (!t) return { ok: false, why: 'You need a key to that Rift.' };
    if (t.why) return { ok: false, why: t.why };
    save.keys[target.id].n--;
    if (save.keys[target.id].n <= 0) delete save.keys[target.id];
    save.links.push({ a: rift.id, b: target.id, al: llOf(rift), bl: llOf(target) });
    save.stats.links++;
    let up = addXP(300);
    // New fields: every Rift linked to both ends closes a triangle.
    const made = [];
    const nb = (id) => save.links.filter((l) => l.a === id || l.b === id).map((l) => (l.a === id ? { id: l.b, ll: l.bl } : { id: l.a, ll: l.al }));
    const nA = nb(rift.id), nB = nb(target.id);
    for (const c of nA) {
      if (!nB.some((x) => x.id === c.id)) continue;
      const ids = [rift.id, target.id, c.id].sort();
      if (save.fields.some((f) => f.ids.join() === ids.join())) continue;
      const ll = [llOf(rift), llOf(target), c.ll];
      const area = W.triArea(xy(ll[0]), xy(ll[1]), xy(ll[2]));
      const aether = Math.max(1, Math.round(area / 100));
      save.fields.push({ ids, ll, aether });
      save.stats.fields++;
      made.push(aether);
      up = addXP(1000 + Math.min(aether, 5000)) || up;
    }
    persist();
    return { ok: true, fields: made, up };
  }

  // Drop links and fields whose Rifts are no longer ours.
  function validateLinks() {
    const now = Date.now();
    const ok = {};
    const check = (id) => {
      if (ok[id] === undefined) {
        const r = W.riftById(id);
        ok[id] = !!r && riftState(r, now).faction === save.agent.faction;
      }
      return ok[id];
    };
    const before = save.links.length;
    save.links = save.links.filter((l) => check(l.a) && check(l.b));
    save.fields = save.fields.filter((f) => f.ids.every(check));
    return before - save.links.length;
  }

  const aether = () => save.fields.reduce((s, f) => s + f.aether, 0);

  // Time passes: your Rifts lose charge, and fall to the other side at zero.
  function tick() {
    const now = Date.now();
    let changed = false;
    for (const [id, o] of Object.entries(save.rifts)) {
      if (!o.mine || !o.faction) continue;
      const health = o.health - (now - o.t) / 86400e3 * DECAY_PER_DAY;
      if (health <= 0) {
        const r = W.riftById(id);
        save.rifts[id] = { faction: enemyId(), level: Math.max(1, o.level - 1), health: 80, t: now, mine: false, gseed: randInt(1, 1e6) };
        save.events.push(`${r ? r.name : 'One of your Rifts'} ran out of charge and was taken by the ${FACTIONS[enemyId()].name}.`);
        changed = true;
      }
    }
    if (changed) validateLinks();
    for (const [id, t] of Object.entries(save.gone)) if (t < now) delete save.gone[id];
    for (const [id, t] of Object.entries(save.hacks)) if (t + HACK_MS < now) delete save.hacks[id];
    for (const [id, t] of Object.entries(save.drops)) if (t + DROP_MS < now) delete save.drops[id];
    if (changed) persist();
    return changed;
  }

  /* ------------------ Caches & encounters ------------------ */

  function dropReady(drop, now) {
    return Math.max(0, (save.drops[drop.id] || 0) + DROP_MS - (now || Date.now()));
  }

  function openDrop(drop) {
    if (dropReady(drop) > 0) return { ok: false, why: 'Already looted. It refills soon.' };
    const loot = { darts: randInt(4, 9), orbs: randInt(2, 4), shards: randInt(0, 2) };
    give(loot);
    save.drops[drop.id] = Date.now();
    const up = addXP(30);
    return { ok: true, loot, up };
  }

  function spawnLevel(spawn) {
    const cap = Math.min(C.MAX_LEVEL, 3 + Math.floor(level().level * 1.5));
    return 1 + Math.floor(spawn.lvlRoll * cap);
  }

  function isGone(spawn) {
    return !!save.gone[spawn.id];
  }

  // result: { caught, dna, dartHits, orbs }
  function finishEncounter(spawn, result) {
    const sp = C.byId(spawn.sp);
    markDex(spawn.sp, 'seen');
    if (result.dna) addDNA(spawn.sp, result.dna);
    let c = null, up = 0;
    if (result.caught) {
      c = addCreature(spawn.sp, spawnLevel(spawn), spawn.ivs);
      addDNA(spawn.sp, 25);
      save.stats.caught++;
      up = addXP(C.RARITY[sp.rar].xp + (result.bonusXP || 0));
    } else if (result.dna) {
      up = addXP(20 + result.dna);
    }
    if (result.caught || result.fled) save.gone[spawn.id] = spawn.expires;
    persist();
    return { creature: c, up };
  }

  RB.state = {
    FACTIONS, NEUTRAL, RANGE, MAX_TEAM, HACK_MS, DROP_MS, claimCost, upgradeCost, maxRiftLevel, maxGuards, linkRange,
    get save() { return save; },
    load, persist, newGame, reset,
    level, addXP, faction, enemyId, xpFor,
    give, take,
    addCreature, creature, dna, addDNA, levelUp, release, team, toggleTeam, canFuse, fuse, markDex,
    riftState, riftColor, hackReady, hack, claim, upgrade, recharge, setGuards, neutralize,
    linkTargets, link, validateLinks, aether, tick,
    dropReady, openDrop, spawnLevel, isGone, finishEncounter,
  };
})(window.RB);
