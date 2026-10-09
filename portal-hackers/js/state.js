/* Portal Hackers: Nexus — your save and the game rules: XP and its caps,
   levels and their rewards, Tech Cores, the Compass upgrade tree, portals
   (discover, hack, capture, defend, link), daily missions, squad and
   Legendary missions, team events, weekly team objectives, team level,
   achievements and Prestige.

   Every rule that hands out XP goes through award(), so the daily and weekly
   caps always apply. Things that happen are reported through `emit` (toasts,
   level-ups), which the UI listens to. */
window.PH = window.PH || {};
(function (PH) {
  'use strict';

  const D = PH.data;
  const W = PH.world;
  const { rng, randInt, pick, clamp, fmt } = PH.util;

  const SAVE_KEY = 'portal-hackers-save-v1';
  const LAUNCH = Date.UTC(2026, 9, 5);     // when the teams' war began (a Monday)

  let save = null;
  let listener = () => {};
  const emit = (type, data) => listener(type, data || {});

  /* ------------------ Calendar ------------------ */

  const pad = (n) => String(n).padStart(2, '0');
  function dayKey(t) {
    const d = new Date(t);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  // Weeks start on Monday, local time.
  function weekStart(t) {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d.getTime();
  }
  const weekKey = (t) => dayKey(weekStart(t));
  function nextMidnight(t) {
    const d = new Date(t);
    d.setHours(24, 0, 0, 0);
    return d.getTime();
  }

  /* ------------------ Save ------------------ */

  function fresh(name, team) {
    const r = rng(`${name}:${Date.now()}`);
    const CALL = ['Vex', 'Juno', 'Kite', 'Rook', 'Sable', 'Tamsin', 'Orin', 'Lyra', 'Moss', 'Indigo', 'Pax', 'Wren', 'Zed', 'Echo'];
    const mates = [];
    while (mates.length < 3) {
      const n = pick(CALL, r);
      if (!mates.includes(n)) mates.push(n);
    }
    return {
      v: 1,
      name, team,
      created: Date.now(),
      xp: 0,                 // XP earned this Prestige (0 → 374,000)
      claimed: 1,            // highest level whose reward was handed out
      prestige: 0,
      cores: 0,
      energy: D.ENERGY.base,
      energyAt: Date.now(),
      up: { scanner: 0, hacking: 0, energy: 0, defense: 0, network: 0, quantum: 0 },
      tokens: 0,             // Compass Modules: a free level in any branch
      skin: 'basic', gear: null,
      skins: ['basic'], gears: [], badges: [],
      title: null, frame: false, portalFx: false, stars: 0,
      ach: {},
      stats: { discovered: 0, hacked: 0, captured: 0, defended: 0, squad: 0, nexusEvents: 0, eventsWon: 0, links: 0, signals: 0, legendary: 0, meters: 0, maxed: 0, lost: 0 },
      portals: {},           // id → { disc, hackAt, owner, mine, heldAt, checked, breach }
      links: [],             // [{ a, b }]
      signals: {},           // id → discovered time
      energyTaken: {},       // energy cell id → time
      caps: { day: '', dayXP: 0, week: '', weekXP: 0 },
      daily: null,
      squad: { window: -1, offer: [], active: null },
      squadmates: mates,
      legend: null,
      defense: null,
      event: { win: -1, pts: 0, done: {} },
      weekly: null,
      fp: 0,
      settings: { walk: 'gps', sound: true, rotate: true },
      home: null,
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      return s && s.v === 1 ? s : null;
    } catch (e) {
      return null;
    }
  }

  let persistTimer = 0;
  function persist(now) {
    if (!save) return;
    if (now !== true) {
      clearTimeout(persistTimer);
      persistTimer = setTimeout(() => persist(true), 400);
      return;
    }
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* storage may be blocked */ }
  }

  function reset() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
    save = null;
  }

  /* ------------------ Level, rank, unlocks ------------------ */

  const level = () => D.levelFor(save.xp);
  const rank = () => D.rankOf(level());
  const has = (u) => D.unlocked(level(), u);

  function progress() {
    const l = level();
    if (l >= D.MAX_LEVEL) return { level: l, next: null, into: 0, need: 0, left: 0, frac: 1 };
    const into = save.xp - D.CUM[l];
    const need = D.LEVELS[l][0];
    return { level: l, next: l + 1, into, need, left: need - into, frac: into / need };
  }

  /* ------------------ XP, with the daily and weekly caps ------------------ */

  function rollCaps(now) {
    const dk = dayKey(now), wk = weekKey(now);
    if (save.caps.day !== dk) { save.caps.day = dk; save.caps.dayXP = 0; }
    if (save.caps.week !== wk) { save.caps.week = wk; save.caps.weekXP = 0; }
  }

  function capRoom(now) {
    rollCaps(now || Date.now());
    return Math.max(0, Math.min(D.CAPS.day - save.caps.dayXP, D.CAPS.week - save.caps.weekXP));
  }

  // Give XP for `why`. Returns the XP actually added.
  function award(xp, why) {
    const now = Date.now();
    const room = capRoom(now);
    const maxRoom = D.CUM[D.MAX_LEVEL] - save.xp;
    const got = Math.max(0, Math.min(xp, room, maxRoom));
    save.caps.dayXP += got;
    save.caps.weekXP += got;
    save.xp += got;
    if (got < xp) {
      if (maxRoom <= 0) emit('cap', { text: 'Level 50 reached: Prestige to keep earning XP' });
      else if (room < xp) emit('cap', { text: save.caps.weekXP >= D.CAPS.week ? `Weekly XP cap reached (${fmt(D.CAPS.week)})` : `Daily XP cap reached (${fmt(D.CAPS.day)})` });
    }
    if (got > 0) emit('xp', { xp: got, why });
    checkLevel();
    persist();
    return got;
  }

  function addCores(n) {
    if (n <= 0) return;
    save.cores += n;
    emit('cores', { n });
    persist();
  }

  function checkLevel() {
    const l = level();
    while (save.claimed < l) {
      save.claimed++;
      const got = grantLevel(save.claimed);
      emit('levelup', { level: save.claimed, rewards: got, rank: D.rankOf(save.claimed) });
    }
    if (l >= D.MAX_LEVEL) save.stats.maxed = 1;
    checkAch();
  }

  function rewardText(rw) {
    switch (rw.t) {
      case 'item': return rw.name;
      case 'cores': return `${fmt(rw.n)} Tech Cores`;
      case 'free': return rw.b === 'any' ? `${rw.name} (a free upgrade of your choice)`
        : rw.b === 'all' ? `${rw.name} (+1 to every branch)`
        : `${rw.name} (+1 ${D.BRANCHES[rw.b].name})`;
      case 'unlock': return `${D.GATES[rw.u].name} unlocked`;
      case 'rank': return `${D.BADGES[rw.r].name}`;
      case 'gear': return `${D.GEAR[rw.id].kind}: ${D.GEAR[rw.id].name}`;
      case 'skin': return `${D.SKINS[rw.id].kind}: ${D.SKINS[rw.id].name}`;
      default: return '';
    }
  }

  function freeLevel(b) {
    if (save.up[b] >= D.BRANCH_MAX) { save.cores += D.MAXED_REFUND; return `${D.BRANCHES[b].name} is maxed: +${D.MAXED_REFUND} Tech Cores instead`; }
    save.up[b]++;
    return null;
  }

  function grantLevel(l) {
    const out = [];
    for (const rw of D.LEVELS[l][1]) {
      let note = null;
      if (rw.t === 'cores') save.cores += rw.n;
      else if (rw.t === 'free') {
        if (rw.b === 'any') save.tokens++;
        else if (rw.b === 'all') { for (const b of D.BRANCH_ORDER) { const n = freeLevel(b); if (n) note = n; } }
        else note = freeLevel(rw.b);
      } else if (rw.t === 'rank') { if (!save.badges.includes(rw.r)) save.badges.push(rw.r); }
      else if (rw.t === 'gear') { if (!save.gears.includes(rw.id)) save.gears.push(rw.id); }
      else if (rw.t === 'skin') { if (!save.skins.includes(rw.id)) save.skins.push(rw.id); }
      out.push({ text: rewardText(rw), note, rw });
    }
    return out;
  }

  /* ------------------ Upgrades and their effects ------------------ */

  function upgrade(b) {
    const B = D.BRANCHES[b];
    if (B.gate && !has(B.gate)) return { ok: false, text: `${B.name} opens at Level ${D.GATES[B.gate].level}` };
    const l = save.up[b];
    if (l >= D.BRANCH_MAX) return { ok: false, text: 'Already at max' };
    if (save.tokens > 0) {
      save.tokens--;
    } else {
      const cost = D.branchCost(b, l);
      if (save.cores < cost) return { ok: false, text: `Needs ${fmt(cost)} Tech Cores` };
      save.cores -= cost;
    }
    save.up[b]++;
    persist();
    return { ok: true, text: `${B.name} upgraded to ${save.up[b]}` };
  }

  const teamLevel = () => D.teamLevelFor(teamFP());

  function scanRange() {
    let r = 60 + 15 * save.up.scanner;
    if (has('advScanner')) r += 50;
    if (teamLevel() >= 5) r += 25;
    return r;
  }
  const signalRange = () => 300 + 60 * save.up.quantum;
  const maxEnergy = () => D.ENERGY.base + D.ENERGY.perLevel * save.up.energy;
  const linkRange = () => D.RANGE.linkBase + 75 * save.up.network;
  const maxLinks = () => 4 + 2 * save.up.network;
  const hackCooldown = () => (has('masterHack') ? D.COOLDOWN.hack / 2 : D.COOLDOWN.hack);

  function hackParams(tier, rarity) {
    const H = D.HACKS[tier];
    const l = save.up.hacking;
    let mistakes = l >= 10 ? 2 : l >= 5 ? 1 : 0;
    if (has('masterHack')) mistakes++;
    let len = H.len;
    if (rarity === 'nexus') len += 2;
    return {
      grid: H.grid, len, mistakes,
      flash: Math.round(H.flash * (1 + 0.05 * l)),
      time: H.time * (1 + 0.08 * l) + (rarity === 'nexus' ? 0.6 * save.up.quantum : 0),
    };
  }

  /* ------------------ Energy ------------------ */

  function regenEnergy(now) {
    const step = D.ENERGY.regenMs(save.up.energy);
    const max = maxEnergy();
    if (save.energy >= max) { save.energyAt = now; return; }
    const n = Math.floor((now - save.energyAt) / step);
    if (n > 0) {
      save.energy = Math.min(max, save.energy + n);
      save.energyAt += n * step;
    }
  }

  function spend(n) {
    if (save.energy < n) return false;
    if (save.energy >= maxEnergy()) save.energyAt = Date.now();
    save.energy -= n;
    return true;
  }

  function takeEnergy(cell) {
    if (save.energyTaken[cell.id]) return 0;
    save.energyTaken[cell.id] = Date.now();
    const before = save.energy;
    save.energy = Math.min(maxEnergy(), save.energy + D.ENERGY.cell(save.up.energy));
    persist();
    return save.energy - before;
  }

  /* ------------------ Portals ------------------ */

  const rec = (id) => save.portals[id] || (save.portals[id] = {});

  function ownerOf(p, now) {
    const r = save.portals[p.id];
    if (r && r.owner !== undefined) return r.owner;
    return W.baseOwner(p, now || Date.now());
  }

  const visible = (p) => level() >= D.RARITY[p.rarity].level;
  const discovered = (p) => !!(save.portals[p.id] && save.portals[p.id].disc);

  function discover(p) {
    const r = rec(p.id);
    if (r.disc) return false;
    r.disc = Date.now();
    save.stats.discovered++;
    const R = D.RARITY[p.rarity];
    if (p.rarity === 'nexus') {
      emit('discover', { p, text: `⚫ Nexus portal found: ${p.name}`, xp: 0, cores: 0 });
    } else {
      const xp = award(D.XP.discover[p.rarity], `Discovered ${R.name} portal`);
      const cores = D.CORES.discover[p.rarity];
      addCores(cores);
      emit('discover', { p, text: `${R.icon} ${R.name} portal discovered: ${p.name}`, xp, cores });
    }
    progressEvent('discover');
    eventPts(D.EVENT_PTS.discover);
    persist();
    return true;
  }

  function discoverSignal(s) {
    if (save.signals[s.id]) return false;
    save.signals[s.id] = Date.now();
    save.stats.signals++;
    weeklyMine('nexus', 1);
    const xp = award(D.XP.nexusSignal, 'Discovered a Nexus signal');
    emit('signal', { s, xp });
    progressEvent('signal');
    eventPts(D.EVENT_PTS.signal);
    persist();
    return true;
  }

  function tiersFor(p) {
    const min = D.TIER_ORDER.indexOf(D.RARITY[p.rarity].minTier);
    return D.TIER_ORDER.map((t, i) => {
      const H = D.HACKS[t];
      const open = level() >= H.level;
      return { tier: t, H, open, allowed: open && i >= min, lockText: !open ? `Level ${H.level}` : i < min ? `${D.RARITY[p.rarity].name} needs ${D.HACKS[D.RARITY[p.rarity].minTier].name}` : '' };
    });
  }

  // Can a hack start now? Returns a reason when not.
  function canHack(p, tier, dist) {
    const now = Date.now();
    if (!discovered(p)) return 'Get closer to discover it first';
    if (dist > D.RANGE.interact) return `Get within ${D.RANGE.interact} m`;
    if (p.rarity === 'nexus' && !has('nexusTech')) return 'Needs Nexus Technology (Level 40)';
    const r = save.portals[p.id];
    if (r && r.hackAt && now < r.hackAt) return `Cooling down`;
    const t = tiersFor(p).find((x) => x.tier === tier);
    if (!t.allowed) return t.lockText;
    if (save.energy < D.HACKS[tier].energy) return `Needs ${D.HACKS[tier].energy} energy`;
    return null;
  }

  function startHack(p, tier) {
    spend(D.HACKS[tier].energy);
    persist();
  }

  function finishHack(p, tier, success) {
    const r = rec(p.id);
    const now = Date.now();
    if (!success) {
      r.hackAt = now + D.COOLDOWN.fail;
      persist();
      return { ok: false };
    }
    r.hackAt = now + hackCooldown();
    save.stats.hacked++;
    const H = D.HACKS[tier];
    const xp = award(D.XP.hack[tier], `${H.name} complete`);
    let cores = D.CORES.hack[tier];
    let doubled = false;
    if (Math.random() < 0.04 * save.up.quantum) { cores *= 2; doubled = true; }
    addCores(cores);
    const owner = ownerOf(p, now);
    let breached = false;
    if (owner && owner !== save.team) { r.breach = now + D.COOLDOWN.breach; breached = true; }
    if (p.rarity === 'nexus') { r.breach = now + D.COOLDOWN.breach; breached = true; }
    progressEvent('hack');
    if (tier === 'expert' && ['epic', 'legendary', 'nexus'].includes(p.rarity)) progressEvent('hackElite');
    eventPts(H.pts);
    persist();
    return { ok: true, xp, cores, doubled, breached };
  }

  function canCapture(p, dist) {
    const now = Date.now();
    const owner = ownerOf(p, now);
    const r = save.portals[p.id] || {};
    if (owner === save.team) return { ok: false, text: 'Already held by your team' };
    if (dist > D.RANGE.interact) return { ok: false, text: `Get within ${D.RANGE.interact} m` };
    if (!discovered(p)) return { ok: false, text: 'Discover it first' };
    if ((owner || p.rarity === 'nexus') && !(r.breach > now)) return { ok: false, text: p.rarity === 'nexus' ? 'Breach it with an Expert Hack first' : 'Breach its shields with a hack first' };
    if (save.energy < D.ENERGY.cost.capture) return { ok: false, text: `Needs ${D.ENERGY.cost.capture} energy` };
    return { ok: true };
  }

  function capture(p) {
    const now = Date.now();
    const owner = ownerOf(p, now);
    spend(D.ENERGY.cost.capture);
    const r = rec(p.id);
    r.owner = save.team;
    r.mine = true;
    r.heldAt = now;
    r.checked = Math.floor(now / 3600e3);
    r.breach = 0;
    save.stats.captured++;
    let xp, cores = 0, text;
    if (p.rarity === 'nexus') {
      const R = D.RARITY.nexus;
      xp = award(randInt(R.xp[0], R.xp[1]), `Captured ${p.name}`);
      cores = randInt(R.cores[0], R.cores[1]);
      text = `⚫ ${p.name} is yours`;
    } else if (owner) {
      xp = award(D.XP.captureEnemy, 'Captured an enemy portal');
      cores = D.CORES.captureEnemy;
      text = `Taken from ${D.TEAMS[owner].name}`;
      progressEvent('captureEnemy');
    } else {
      xp = award(D.XP.captureNeutral, 'Captured a neutral portal');
      text = 'Neutral portal claimed';
    }
    addCores(cores);
    progressEvent('capture');
    eventPts(D.EVENT_PTS.capture);
    persist();
    return { xp, cores, text };
  }

  const held = () => Object.keys(save.portals).filter((id) => save.portals[id].mine && save.portals[id].owner === save.team);

  // Enemy teams attack the portals you hold. Each hour, each portal has a
  // small chance to fall; Defense upgrades and Team Level 10 lower it, and a
  // portal you are defending right now can't fall.
  function simulateAttacks(now) {
    const hour = Math.floor(now / 3600e3);
    let p = 0.03 * (1 - 0.07 * save.up.defense);
    if (teamLevel() >= 10) p *= 0.8;
    const lost = [];
    for (const id of held()) {
      const r = save.portals[id];
      const from = Math.max((r.checked || hour) + 1, hour - 72);
      for (let h = from; h <= hour; h++) {
        if (save.defense && save.defense.id === id) continue;
        const roll = rng(`atk:${id}:${r.heldAt}:${h}`);
        if (roll() < p) {
          const foes = Object.keys(D.TEAMS).filter((t) => t !== save.team);
          r.owner = pick(foes, roll);
          r.mine = false;
          lost.push({ id, by: r.owner });
          break;
        }
      }
      r.checked = hour;
    }
    if (lost.length) {
      save.stats.lost += lost.length;
      const gone = new Set(lost.map((x) => x.id));
      save.links = save.links.filter((l) => !gone.has(l.a) && !gone.has(l.b));
      emit('lost', { lost });
      persist();
    }
  }

  /* ------------------ Defending ------------------ */

  function canDefend(p, dist) {
    if (!has('defense')) return { ok: false, text: `Portal Defense opens at Level ${D.GATES.defense.level}` };
    if (ownerOf(p) !== save.team) return { ok: false, text: 'Only your team\'s portals' };
    if (dist > D.RANGE.interact) return { ok: false, text: `Get within ${D.RANGE.interact} m` };
    if (save.defense) return { ok: false, text: 'Already defending a portal' };
    return { ok: true };
  }

  function startDefense(p) {
    save.defense = { id: p.id, name: p.name, acc: 0, paid10: false, start: Date.now() };
    persist();
  }

  function stopDefense(why) {
    if (!save.defense) return;
    emit('defenseEnd', { d: save.defense, why });
    save.defense = null;
    persist();
  }

  // Called every frame with how far you are from the portal you defend.
  function tickDefense(dt, dist) {
    const d = save.defense;
    if (!d) return;
    if (dist > D.RANGE.defendSlack) { stopDefense('You left the portal'); return; }
    if (ownerOf(W.portalById(d.id)) !== save.team) { stopDefense('The portal fell'); return; }
    const before = d.acc;
    d.acc += Math.min(dt, 60) * 1000;
    if (Math.floor(d.acc / 60e3) > Math.floor(before / 60e3)) eventPts(D.EVENT_PTS.defendMin);
    if (!d.paid10 && d.acc >= 10 * 60e3) {
      d.paid10 = true;
      save.stats.defended++;
      award(D.XP.defend10, 'Defended a portal for 10 minutes');
      progressEvent('defend');
    }
    if (d.acc >= 30 * 60e3) {
      award(D.XP.defend30, 'Defended a portal for 30 minutes');
      stopDefense('30 minutes held');
    }
    persist();
  }

  /* ------------------ Linking ------------------ */

  function canLink(a, b, posLL) {
    if (!has('linking')) return `Portal Linking opens at Level ${D.GATES.linking.level}`;
    if (a.id === b.id) return 'Pick another portal';
    if (ownerOf(a) !== save.team || ownerOf(b) !== save.team) return 'Both portals must be held by your team';
    if (!discovered(b)) return 'Discover it first';
    if (W.distM(posLL, a) > D.RANGE.interact) return `Stand within ${D.RANGE.interact} m of the first portal`;
    if (W.distM(a, b) > linkRange()) return `Out of link range (${linkRange()} m)`;
    if (save.links.length >= maxLinks()) return `You can hold ${maxLinks()} links. Upgrade Network for more`;
    if (save.links.some((l) => (l.a === a.id && l.b === b.id) || (l.a === b.id && l.b === a.id))) return 'Already linked';
    if (save.energy < D.ENERGY.cost.link) return `Needs ${D.ENERGY.cost.link} energy`;
    const o = a;
    const A = W.offset(o, a), B = W.offset(o, b);
    for (const l of save.links) {
      const pa = W.portalById(l.a), pb = W.portalById(l.b);
      if (pa && pb && W.crosses(A, B, W.offset(o, pa), W.offset(o, pb))) return 'That link would cross one of yours';
    }
    return null;
  }

  // The number of portals in the network that contains `id`.
  function networkSize(id) {
    const seen = new Set([id]);
    const stack = [id];
    while (stack.length) {
      const cur = stack.pop();
      for (const l of save.links) {
        const nb = l.a === cur ? l.b : l.b === cur ? l.a : null;
        if (nb && !seen.has(nb)) { seen.add(nb); stack.push(nb); }
      }
    }
    return seen.size;
  }

  function link(a, b) {
    spend(D.ENERGY.cost.link);
    save.links.push({ a: a.id, b: b.id });
    save.stats.links++;
    weeklyMine('network', 1);
    const n = networkSize(a.id);
    const xp = n >= 3 ? award(D.XP.link3, `Connected a network of ${n} portals`) : award(D.XP.link2, 'Connected 2 portals');
    progressEvent('link');
    eventPts(D.EVENT_PTS.link);
    persist();
    return { xp, n };
  }

  /* ------------------ Missions: events feed them ------------------ */

  function progressEvent(ev) {
    dailyEvent(ev);
    squadEvent(ev);
    legendEvent(ev);
    checkAch();
  }

  // Daily: 3 missions a day, picked from the ones you've unlocked.
  function rollDaily(now) {
    const dk = dayKey(now);
    if (save.daily && save.daily.day === dk) return;
    const pool = Object.keys(D.DAILY).filter((id) => !D.DAILY[id].gate || has(D.DAILY[id].gate));
    const r = rng(`daily:${save.name}:${dk}`);
    const ids = [];
    while (ids.length < 3 && pool.length) ids.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
    save.daily = { day: dk, ids, prog: {}, done: {}, bonus: false };
  }

  function dailyEvent(ev) {
    rollDaily(Date.now());
    const dl = save.daily;
    const key = ev === 'captureEnemy' ? 'capture' : ev === 'capture' ? null : ev;
    if (!key || !dl.ids.includes(key) || dl.done[key]) return;
    dl.prog[key] = (dl.prog[key] || 0) + 1;
    const M = D.DAILY[key];
    if (dl.prog[key] >= M.goal) {
      dl.done[key] = true;
      award(M.xp, `Daily mission: ${M.text}`);
      addCores(M.cores);
      emit('mission', { text: `Daily mission complete: ${M.text}`, xp: M.xp, cores: M.cores });
      if (!dl.bonus && dl.ids.every((id) => dl.done[id])) {
        dl.bonus = true;
        award(D.DAILY_BONUS.xp, 'Daily Completion Bonus');
        addCores(D.DAILY_BONUS.cores);
        emit('mission', { text: 'Daily Completion Bonus!', xp: D.DAILY_BONUS.xp, cores: D.DAILY_BONUS.cores, big: true });
      }
    }
  }

  // Squad: three offers every 4 hours; take one on and finish it in 45 min.
  function rollSquad(now) {
    const win = Math.floor(now / (4 * 3600e3));
    const sq = save.squad;
    if (sq.active && now > sq.active.until) {
      emit('mission', { text: `Squad mission failed: ${D.SQUAD[sq.active.type].name} ran out of time`, bad: true });
      sq.active = null;
    }
    if (sq.window === win) return;
    sq.window = win;
    const pool = Object.keys(D.SQUAD).filter((k) => {
      const M = D.SQUAD[k];
      return (!M.gate || has(M.gate)) && (!M.teamLevel || teamLevel() >= M.teamLevel);
    });
    const r = rng(`squad:${save.name}:${win}`);
    const offer = [];
    while (offer.length < 3 && pool.length) offer.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
    sq.offer = offer;
  }

  function acceptSquad(type) {
    if (!has('squad')) return false;
    if (save.squad.active) return false;
    save.squad.active = { type, prog: 0, until: Date.now() + D.SQUAD_MINUTES * 60e3 };
    save.squad.offer = save.squad.offer.filter((t) => t !== type);
    persist();
    return true;
  }

  function squadEvent(ev) {
    const a = save.squad.active;
    if (!a) return;
    const M = D.SQUAD[a.type];
    if (M.ev !== ev) return;
    a.prog++;
    const mate = pick(save.squadmates);
    if (a.prog < M.goal) emit('squadChat', { text: `${mate}: Nice one. ${M.goal - a.prog} to go!` });
    if (a.prog >= M.goal) {
      save.squad.active = null;
      save.stats.squad++;
      const fp = a.type === 'teamop' ? 100 : 40;
      save.fp += fp;
      award(D.XP.squad, `Squad mission: ${M.name}`);
      addCores(D.CORES.squad);
      emit('mission', { text: `Squad mission complete: ${M.name}`, xp: D.XP.squad, cores: D.CORES.squad, fp, big: true });
      dailyEvent('squad');
    }
  }

  // Legendary: one a day from Level 35, three stages in order.
  function rollLegend(now) {
    const dk = dayKey(now);
    if (save.legend && save.legend.day === dk) return;
    save.legend = { day: dk, active: false, stage: 0, done: false };
  }

  function acceptLegend() {
    if (!has('legendaryMissions')) return false;
    rollLegend(Date.now());
    if (save.legend.done) return false;
    save.legend.active = true;
    persist();
    return true;
  }

  function legendEvent(ev) {
    const L = save.legend;
    if (!L || !L.active || L.done) return;
    const st = D.LEGENDARY_STAGES[L.stage];
    if (st.ev !== ev) return;
    L.stage++;
    if (L.stage >= D.LEGENDARY_STAGES.length) {
      L.done = true;
      L.active = false;
      save.stats.legendary++;
      save.fp += 150;
      award(D.XP.legendaryMission, 'Legendary Mission complete');
      addCores(D.CORES.legendaryMission);
      emit('mission', { text: 'LEGENDARY MISSION COMPLETE', xp: D.XP.legendaryMission, cores: D.CORES.legendaryMission, big: true });
    } else {
      emit('mission', { text: `Legendary stage ${L.stage}/3 cleared` });
    }
  }

  /* ------------------ Team events ------------------ */

  function eventWindow(now) {
    const win = Math.floor(now / D.EVENT.every);
    const start = win * D.EVENT.every;
    return { win, start, end: start + D.EVENT.length, next: start + D.EVENT.every, live: now < start + D.EVENT.length };
  }

  function eventName() {
    const tl = teamLevel();
    if (tl >= 50) return 'NEXUS WAR';
    if (tl >= 30) return 'Legendary Event';
    if (level() >= 31) return 'Large-Scale Portal Surge';
    return 'Portal Surge';
  }

  function eventPts(n) {
    const now = Date.now();
    const w = eventWindow(now);
    if (!w.live) return;
    if (save.event.win !== w.win) save.event = { win: w.win, pts: 0, done: save.event.done || {} };
    save.event.pts += n;
  }

  // The scores of the three teams in an event window. Teammates and rivals
  // are simulated from the window's seed; your points count four times over
  // (you're the one in the field).
  function eventScores(win, pts) {
    const r = rng(`event:${win}`);
    const scores = {};
    for (const t of Object.keys(D.TEAMS)) scores[t] = Math.round(900 + r() * 500);
    scores[save.team] = Math.round(scores[save.team] * 0.8) + pts * 4;
    return scores;
  }

  function resolveEvent(now) {
    const e = save.event;
    if (e.win < 0 || e.done[e.win]) return;
    const w = eventWindow(now);
    if (e.win === w.win && w.live) return;
    e.done = { [e.win]: true };
    if (e.pts <= 0) return;
    const scores = eventScores(e.win, e.pts);
    const best = Object.keys(scores).sort((a, b) => scores[b] - scores[a])[0];
    const win = best === save.team;
    save.stats.nexusEvents++;
    const mult = teamLevel() >= 30 ? 2 : 1;
    save.fp += (win ? 100 : 20) * mult;
    if (win) {
      save.stats.eventsWon++;
      award(D.XP.teamEvent, 'Won a team event');
    }
    emit('event', { win, scores, pts: e.pts });
    checkAch();
    persist();
  }

  /* ------------------ Weekly team objectives and team level ------------------ */

  function rollWeekly(now) {
    const wk = weekKey(now);
    if (save.weekly && save.weekly.week === wk) return;
    save.weekly = { week: wk, mine: { network: 0, territory: 0, nexus: 0 }, claimed: {} };
  }

  function weeklyMine(id, n) {
    rollWeekly(Date.now());
    save.weekly.mine[id] = (save.weekly.mine[id] || 0) + n;
  }

  // Team progress = your teammates (simulated, steady through the week) + you.
  function objectiveProgress(o, now) {
    rollWeekly(now);
    const ws = weekStart(now);
    const frac = clamp((now - ws) / (7 * 86400e3), 0, 1);
    const r = rng(`obj:${save.team}:${save.weekly.week}:${o.id}`);
    const pace = 0.82 + r() * 0.3;
    let team = Math.floor(o.goal * pace * frac);
    let mine = save.weekly.mine[o.id] || 0;
    if (o.id === 'territory') mine = held().length;
    const total = Math.min(o.goal, team + mine);
    return { total, mine, frac: total / o.goal, done: total >= o.goal, claimed: !!save.weekly.claimed[o.id] };
  }

  function claimObjective(id) {
    const o = D.OBJECTIVES.find((x) => x.id === id);
    const pr = objectiveProgress(o, Date.now());
    if (!pr.done || pr.claimed) return false;
    save.weekly.claimed[id] = true;
    save.fp += o.teamXP;
    save.cores += o.cores;
    if (o.badge && !save.badges.includes(o.badge)) save.badges.push(o.badge);
    if (o.gear && !save.gears.includes(o.gear)) save.gears.push(o.gear);
    persist();
    return true;
  }

  // Your team's Faction Points: everyone else (simulated, growing every
  // week since the war began) plus everything you've earned.
  function teamFP(now) {
    const weeks = Math.max(0, ((now || Date.now()) - LAUNCH) / (7 * 86400e3));
    const r = rng(`team:${save.team}`);
    return Math.round(weeks * (18000 + r() * 6000)) + save.fp;
  }

  /* ------------------ Achievements ------------------ */

  function checkAch() {
    for (const a of D.ACHIEVEMENTS) {
      if (save.ach[a.id]) continue;
      if ((save.stats[a.stat] || 0) >= a.n) {
        save.ach[a.id] = Date.now();
        emit('ach', { a });
      }
    }
  }

  /* ------------------ Prestige ------------------ */

  function canPrestige() { return level() >= D.MAX_LEVEL; }

  function prestige() {
    if (!canPrestige()) return null;
    save.prestige++;
    const pr = D.prestigeReward(save.prestige);
    for (const g of pr.give) {
      if (g.t === 'badge' && !save.badges.includes(g.id)) save.badges.push(g.id);
      if (g.t === 'frame') save.frame = true;
      if (g.t === 'portalFx') save.portalFx = true;
      if (g.t === 'title') save.title = g.name;
      if (g.t === 'skin' && !save.skins.includes(g.id)) save.skins.push(g.id);
      if (g.t === 'gear' && !save.gears.includes(g.id)) save.gears.push(g.id);
      if (g.t === 'star') save.stars++;
    }
    save.xp = 0;
    save.claimed = 1;
    save.defense = null;
    persist(true);
    return pr;
  }

  /* ------------------ Recommendations ------------------ */

  // Three things to do next, sized to the XP you still need: hacking takes
  // up whatever the other two (one of each) don't cover.
  function recommend() {
    const pr = progress();
    if (!pr.next) return [];
    const tier = has('expertHack') ? 'expert' : has('advancedHack') ? 'advanced' : 'basic';
    const extras = [];
    if (has('squad') && !save.squad.active) extras.push({ text: '🤝 Complete 1 squad mission', xp: D.XP.squad });
    if (has('defense') && !save.defense) extras.push({ text: '🛡️ Defend a team portal', xp: D.XP.defend10 });
    if (has('linking')) extras.push({ text: '🔗 Connect 2 portals', xp: D.XP.link2 });
    extras.push({ text: '🏴 Capture 1 enemy portal', xp: D.XP.captureEnemy });
    extras.push({ text: '🔎 Discover a new portal', xp: D.XP.discover.common });
    const two = extras.slice(0, 2);
    const rest = pr.left - two.reduce((n, e) => n + e.xp, 0);
    const n = clamp(Math.ceil(rest / D.XP.hack[tier]), 1, 9);
    const hack = `⚡ Hack ${n} portal${n > 1 ? 's' : ''}${tier === 'basic' ? '' : ` (${D.HACKS[tier].name})`}`;
    return [hack, ...two.map((e) => e.text)];
  }

  /* ------------------ Housekeeping ------------------ */

  function tick(now) {
    regenEnergy(now);
    rollCaps(now);
    rollDaily(now);
    rollSquad(now);
    rollLegend(now);
    rollWeekly(now);
    resolveEvent(now);
    // Forget energy cells taken more than an hour ago.
    for (const id in save.energyTaken) if (now - save.energyTaken[id] > 3600e3) delete save.energyTaken[id];
    for (const id in save.signals) if (now - save.signals[id] > 2 * 86400e3) delete save.signals[id];
  }

  PH.state = {
    get save() { return save; },
    start(s) { save = s; checkLevel(); },
    fresh, load, persist, reset,
    on(fn) { listener = fn; },
    level, rank, has, progress, award, addCores, rewardText, capRoom,
    upgrade, scanRange, signalRange, maxEnergy, linkRange, maxLinks, hackParams, teamLevel, teamFP,
    takeEnergy, ownerOf, visible, discovered, discover, discoverSignal,
    tiersFor, canHack, startHack, finishHack, canCapture, capture, held, simulateAttacks,
    canDefend, startDefense, stopDefense, tickDefense,
    canLink, link, networkSize,
    acceptSquad, acceptLegend, eventWindow, eventName, eventScores,
    objectiveProgress, claimObjective,
    canPrestige, prestige, recommend, tick,
    nextMidnight, weekStart, dayKey,
  };
})(window.PH);
