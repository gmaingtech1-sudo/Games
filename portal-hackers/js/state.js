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

  // Each account has its own save (see accounts.js).
  let SAVE_KEY = 'portal-hackers-save-v1';
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
      portals: {},           // id → { disc, hackAt, owner, mine, heldAt, checked, breach, uplinks, fw, neutral, from }
      links: [],             // [{ a, b }]
      fields: [],            // [{ a, b, c }] control fields: triangles of links
      inv: Object.assign({}, D.START_ITEMS),
      keys: {},              // portal id → how many keys
      signals: {},           // id → discovered time
      energyTaken: {},       // Tech Cube id → time
      caps: { day: '', dayXP: 0, week: '', weekXP: 0 },
      daily: null,
      squad: { window: -1, offer: [], active: null },
      squadmates: mates,
      legend: null,
      defense: null,
      event: { win: -1, pts: 0, done: {} },
      weekly: null,
      fp: 0,
      settings: { walk: 'gps', sound: true, rotate: true, share: true },
      look: { avatar: 'fox', color: 'team', banner: 'night', title: '', bio: '', showcase: [] },
      owned: { avatar: [], color: [], banner: [], title: [] },
      bought: {},            // shop item id → how many times
      chat: [],              // your team chat, last 100 messages
      muted: [],             // names you've muted in chat
      home: null,
    };
  }

  function useAccount(id) { SAVE_KEY = PH.accounts.saveKey(id); }

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

  // Tech Cubes: always worth picking up. Energy (as much as fits) and Tech Cores.
  function collectCube(cube) {
    if (save.energyTaken[cube.id]) return null;
    save.energyTaken[cube.id] = Date.now();
    const before = save.energy;
    save.energy = Math.max(save.energy, Math.min(maxEnergy(), save.energy + D.ENERGY.cell(save.up.energy)));
    save.cores += D.CORES.cube;
    persist();
    return { energy: save.energy - before, cores: D.CORES.cube };
  }

  /* ------------------ Gear ------------------ */

  const itemCount = (k) => save.inv[k] || 0;

  function giveItem(k, n) {
    save.inv[k] = Math.min(D.ITEM_CAP, itemCount(k) + n);
  }

  function useItem(k) {
    if (itemCount(k) <= 0) return false;
    save.inv[k]--;
    return true;
  }

  const keyCount = (id) => save.keys[id] || 0;

  /* ------------------ Portals ------------------ */

  const rec = (id) => save.portals[id] || (save.portals[id] = {});

  function ownerOf(p, now) {
    const r = save.portals[p.id];
    if (r && r.owner !== undefined) return r.owner;
    return W.baseOwner(p, now || Date.now());
  }

  const visible = (p) => level() >= D.RARITY[p.rarity].level;
  const discovered = (p) => !!(save.portals[p.id] && save.portals[p.id].disc);

  // How many Uplinks hold a portal up. Portals nobody has touched get theirs
  // from the world seed; neutral portals have none.
  function uplinksOf(p, now) {
    const r = save.portals[p.id];
    if (r && r.uplinks != null) return r.uplinks;
    if (!ownerOf(p, now)) return 0;
    const [lo, hi] = D.BASE_UPLINKS[p.rarity];
    return randInt(lo, hi, rng(`up:${p.id}:${Math.floor((now || Date.now()) / 86400e3)}`));
  }
  const firewallsOf = (p) => (save.portals[p.id] && save.portals[p.id].fw) || 0;

  // An enemy portal with no Uplinks left goes neutral, and capturing it
  // counts as taking it from its team, however long you take.
  function knockOut(p, n) {
    const now = Date.now();
    const r = rec(p.id);
    const owner = ownerOf(p, now);
    r.uplinks = Math.max(0, uplinksOf(p, now) - n);
    if (r.uplinks === 0) {
      r.fw = 0;
      r.owner = null;
      r.mine = false;
      r.neutral = true;   // counts as taken from `from` whenever you capture it
      r.from = owner;
      return true;
    }
    return false;
  }
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
    // Gear drops.
    const drops = {};
    const [lo, hi] = D.DROPS[tier];
    const n = randInt(lo, hi);
    for (let i = 0; i < n; i++) {
      const k = PH.util.weighted(D.ITEM_ORDER, (x) => D.DROP_WEIGHT[x]);
      drops[k] = (drops[k] || 0) + 1;
      giveItem(k, 1);
    }
    let key = false;
    if (Math.random() < D.KEY_CHANCE[tier]) { save.keys[p.id] = keyCount(p.id) + 1; key = true; }
    // Sabotage: a hack on an enemy portal knocks out some of its Uplinks.
    const owner = ownerOf(p, now);
    let sabotaged = 0, neutralized = false, breached = false;
    if (owner && owner !== save.team) {
      sabotaged = Math.min(D.SABOTAGE[tier], uplinksOf(p, now));
      neutralized = knockOut(p, D.SABOTAGE[tier]);
    }
    if (p.rarity === 'nexus' && !owner) { r.breach = true; breached = true; }
    progressEvent('hack');
    if (tier === 'expert' && ['epic', 'legendary', 'nexus'].includes(p.rarity)) progressEvent('hackElite');
    eventPts(H.pts);
    persist();
    return { ok: true, xp, cores, doubled, breached, drops, key, sabotaged, neutralized };
  }

  // Capturing = deploying the first Uplink on a neutral portal.
  function canCapture(p, dist) {
    const now = Date.now();
    const owner = ownerOf(p, now);
    const r = save.portals[p.id] || {};
    if (owner === save.team) return { ok: false, text: 'Already held by your team' };
    if (dist > D.RANGE.interact) return { ok: false, text: `Get within ${D.RANGE.interact} m` };
    if (!discovered(p)) return { ok: false, text: 'Discover it first' };
    if (owner) return { ok: false, text: `Knock out its ${uplinksOf(p, now)} Uplinks first (Pulse Bombs or a hack)` };
    if (p.rarity === 'nexus' && !r.breach) return { ok: false, text: 'Breach it with an Expert Hack first' };
    if (itemCount('uplink') <= 0) return { ok: false, text: 'You need an Uplink. Hack portals for more' };
    if (save.energy < D.ENERGY.cost.capture) return { ok: false, text: `Needs ${D.ENERGY.cost.capture} energy` };
    return { ok: true };
  }

  function capture(p) {
    const now = Date.now();
    const r = rec(p.id);
    const owner = r.neutral ? r.from || null : null;   // you emptied it
    spend(D.ENERGY.cost.capture);
    useItem('uplink');
    r.uplinks = 1;
    r.fw = 0;
    r.neutral = 0;
    r.owner = save.team;
    r.mine = true;
    r.heldAt = now;
    r.checked = Math.floor(now / 3600e3);
    r.breach = 0;
    save.stats.captured++;
    let xp, cores = 0, text;
    if (p.rarity === 'nexus') {
      const R = D.RARITY.nexus;
      r.uplinks = 1;
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

  function canDeploy(p, dist) {
    if (ownerOf(p) !== save.team) return 'Only on your team\'s portals';
    if (dist > D.RANGE.interact) return `Get within ${D.RANGE.interact} m`;
    if (uplinksOf(p) >= D.MAX_UPLINKS) return 'All 8 Uplink slots are full';
    if (itemCount('uplink') <= 0) return 'No Uplinks. Hack portals for more';
    if (save.energy < D.ENERGY.cost.deploy) return `Needs ${D.ENERGY.cost.deploy} energy`;
    return null;
  }

  function deploy(p) {
    const r = rec(p.id);
    r.uplinks = uplinksOf(p) + 1;
    useItem('uplink');
    spend(D.ENERGY.cost.deploy);
    eventPts(D.EVENT_PTS.deploy);
    persist();
    return r.uplinks;
  }

  function canFirewall(p, dist) {
    if (ownerOf(p) !== save.team) return 'Only on your team\'s portals';
    if (dist > D.RANGE.interact) return `Get within ${D.RANGE.interact} m`;
    if (firewallsOf(p) >= D.MAX_FIREWALLS) return 'Both Firewall slots are full';
    if (itemCount('firewall') <= 0) return 'No Firewalls. Hack portals for more';
    if (save.energy < D.ENERGY.cost.firewall) return `Needs ${D.ENERGY.cost.firewall} energy`;
    return null;
  }

  function installFirewall(p) {
    const r = rec(p.id);
    if (r.uplinks == null) r.uplinks = uplinksOf(p);
    r.fw = firewallsOf(p) + 1;
    useItem('firewall');
    spend(D.ENERGY.cost.firewall);
    persist();
    return r.fw;
  }

  function canBomb(p, dist) {
    const owner = ownerOf(p);
    if (!owner || owner === save.team) return 'Only enemy portals';
    if (!discovered(p)) return 'Discover it first';
    if (dist > D.RANGE.interact) return `Get within ${D.RANGE.interact} m`;
    if (itemCount('bomb') <= 0) return 'No Pulse Bombs. Hack portals for more';
    if (save.energy < D.ENERGY.cost.bomb) return `Needs ${D.ENERGY.cost.bomb} energy`;
    return null;
  }

  function bomb(p) {
    const before = uplinksOf(p);
    useItem('bomb');
    spend(D.ENERGY.cost.bomb);
    save.stats.bombs++;
    const neutral = knockOut(p, D.BOMB_HITS);
    eventPts(D.EVENT_PTS.bomb);
    persist();
    return { hit: Math.min(before, D.BOMB_HITS), left: uplinksOf(p), neutral };
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
      // Every Uplink and Firewall makes the portal harder to take.
      const pp = p * Math.max(0.15, 1 - 0.07 * (r.uplinks || 1)) * (1 - 0.3 * (r.fw || 0));
      const from = Math.max((r.checked || hour) + 1, hour - 72);
      for (let h = from; h <= hour; h++) {
        if (save.defense && save.defense.id === id) continue;
        const roll = rng(`atk:${id}:${r.heldAt}:${h}`);
        if (roll() < pp) {
          const foes = Object.keys(D.TEAMS).filter((t) => t !== save.team);
          r.owner = pick(foes, roll);
          r.mine = false;
          r.uplinks = randInt(1, 4, roll);
          r.fw = 0;
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
      save.fields = save.fields.filter((f) => !gone.has(f.a) && !gone.has(f.b) && !gone.has(f.c));
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

  // Links have no distance limit: any two of your team's portals, anywhere,
  // as long as you hold a key to the far one.
  function canLink(a, b) {
    if (a.id === b.id) return 'Pick another portal';
    if (ownerOf(a) !== save.team || ownerOf(b) !== save.team) return 'Both portals must be held by your team';
    if (!discovered(b)) return 'Discover it first';
    if (keyCount(b.id) <= 0) return `You need a Portal Key to ${b.name}. Hack it to get one`;
    if (save.links.length >= maxLinks()) return `You can hold ${maxLinks()} links. Upgrade Network for more`;
    if (save.links.some((l) => (l.a === a.id && l.b === b.id) || (l.a === b.id && l.b === a.id))) return 'Already linked';
    if (save.energy < D.ENERGY.cost.link) return `Needs ${D.ENERGY.cost.link} energy`;
    const o = a;
    const A = W.offset(o, a), B = W.offset(o, b);
    for (const l of save.links) {
      const pa = W.portalById(l.a), pb = W.portalById(l.b);
      if (pa && pb && W.crosses(A, B, W.offset(o, pa), W.offset(o, pb))) return 'That link would cross one of yours';
    }
    // Like Ingress, no link may cross anyone else's link either.
    const d = W.distM(a, b);
    if (d < 16000) {
      const mid = { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
      for (const l of worldNetworks(mid, d / 2 + 2000).links) {
        if (l.a === a.id || l.a === b.id || l.b === a.id || l.b === b.id) continue;
        const pa = W.portalById(l.a), pb = W.portalById(l.b);
        if (W.crosses(A, B, W.offset(o, pa), W.offset(o, pb))) return `That link would cross a ${D.TEAMS[l.team].name} link`;
      }
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

  // What a control field of `cp` Control Points pays on top of the link XP.
  function fieldReward(cp) {
    return {
      xp: Math.min(1500, 50 + Math.round(cp / 10)),
      cores: Math.min(300, 10 + Math.round(cp / 20)),
      fp: Math.max(5, Math.round(cp / 20)),
    };
  }

  // The CP of all the fields you hold right now.
  function myCP() {
    let total = 0;
    for (const f of save.fields) {
      if (f.cp == null) {
        const pa = W.portalById(f.a), pb = W.portalById(f.b), pc = W.portalById(f.c);
        f.cp = pa && pb && pc ? PH.score.fieldCP(pa, pb, pc) : 10;
      }
      total += f.cp;
    }
    return total;
  }

  // Remember your CP at each checkpoint of the cycle, for the world chart.
  function logCP(now) {
    const cyc = PH.score.cycleOf(now);
    if (!save.cpLog || save.cpLog.cycle !== cyc.index) save.cpLog = { cycle: cyc.index, pts: {} };
    const k = Math.max(0, cyc.checkpoint - 1);
    save.cpLog.pts[k] = Math.max(save.cpLog.pts[k] || 0, myCP());
  }

  function worldStandings(now) {
    now = now || Date.now();
    const cyc = PH.score.cycleOf(now);
    const log = save.cpLog && save.cpLog.cycle === cyc.index ? save.cpLog.pts : {};
    return PH.score.standings(now, { team: save.team, cp: myCP(), log });
  }

  function topAgents(now) {
    return PH.score.topAgents(now || Date.now(), { name: save.name, team: save.team, cp: myCP() });
  }

  // Other players' links and fields near `pos` that still stand: their team
  // still holds every portal (you may have captured one since).
  function worldNetworks(pos, radius, now) {
    now = now || Date.now();
    const net = W.networks(pos, radius, now);
    const holds = (team, ids) => ids.every((id) => { const p = W.portalById(id); return p && ownerOf(p, now) === team; });
    // Your links came first: anything of theirs that would cross one isn't there.
    const mine = save.links.map((l) => [W.portalById(l.a), W.portalById(l.b)]).filter(([x, y]) => x && y);
    const blocked = (aId, bId) => {
      if (!mine.length) return false;
      const a = W.portalById(aId), b = W.portalById(bId);
      const A = W.offset(pos, a), B = W.offset(pos, b);
      return mine.some(([x, y]) => W.crosses(A, B, W.offset(pos, x), W.offset(pos, y)));
    };
    const links = net.links.filter((l) => holds(l.team, [l.a, l.b]) && !blocked(l.a, l.b));
    const ok = (x, y) => links.some((l) => (l.a === x && l.b === y) || (l.a === y && l.b === x));
    return {
      links,
      fields: net.fields.filter((f) => holds(f.team, [f.a, f.b, f.c]) && ok(f.a, f.b) && ok(f.b, f.c) && ok(f.c, f.a)),
    };
  }

  const linked = (x, y) => save.links.some((l) => (l.a === x && l.b === y) || (l.a === y && l.b === x));

  function link(a, b) {
    spend(D.ENERGY.cost.link);
    save.keys[b.id] = keyCount(b.id) - 1;
    if (save.keys[b.id] <= 0) delete save.keys[b.id];
    save.links.push({ a: a.id, b: b.id });
    save.stats.links++;
    weeklyMine('network', 1);
    // A link that closes triangles raises control fields.
    const ids = new Set();
    for (const l of save.links) { ids.add(l.a); ids.add(l.b); }
    let fields = 0, cp = 0;
    for (const c of ids) {
      if (c === a.id || c === b.id || !linked(a.id, c) || !linked(b.id, c)) continue;
      const pc = W.portalById(c);
      const f = { a: a.id, b: b.id, c, cp: pc ? PH.score.fieldCP(a, b, pc) : 10 };
      save.fields.push(f);
      fields++;
      cp += f.cp;
    }
    save.stats.fields += fields;
    const n = networkSize(a.id);
    let xp = fields ? award(D.XP.link3, `Control field raised (${n} portals connected)`)
      : n >= 3 ? award(D.XP.link3, `Connected a network of ${n} portals`) : award(D.XP.link2, 'Connected 2 portals');
    // Bigger fields are worth more: Control Points for your team's world
    // score, plus bonus XP, Tech Cores and Faction Points by size.
    let bonus = null;
    if (fields) {
      const r = fieldReward(cp);
      xp += award(r.xp, `Control field bonus (${cp} CP)`);
      addCores(r.cores);
      save.fp += r.fp;
      save.stats.cp = (save.stats.cp || 0) + cp;
      bonus = Object.assign({ cp }, r);
      logCP(Date.now());
    }
    progressEvent('link');
    eventPts(D.EVENT_PTS.link + (fields ? Math.min(200, Math.round(cp / 50)) : 0));
    persist();
    return { xp, n, fields, bonus };
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

  /* ------------------ Profile customisation ------------------ */

  // Can you use this avatar / colour / banner? Returns null, or why not.
  function lookLock(kind, it) {
    if (it.level && level() < it.level && save.prestige === 0) return `Level ${it.level}`;
    if (it.shop && !save.owned[kind].includes(it.id)) return 'Shop';
    return null;
  }

  // Every title you've earned: ranks, achievements, Prestige and the shop.
  function titles() {
    const out = [];
    for (const r of D.RANKS) if (save.badges.includes(r.id) || (r.from <= level())) out.push({ id: `rank:${r.id}`, text: r.name });
    for (const a of D.ACHIEVEMENTS) if (save.ach[a.id]) out.push({ id: `ach:${a.id}`, text: a.name });
    if (save.title) out.push({ id: 'prestige', text: save.title });
    for (const id of save.owned.title) out.push({ id: `shop:${id}`, text: D.SHOP_TITLES[id] });
    return out;
  }

  function titleText() {
    const t = titles().find((x) => x.id === save.look.title);
    return t ? t.text : rank().name;
  }

  const avatarIcon = (id) => (D.AVATARS.find((a) => a.id === (id || save.look.avatar)) || D.AVATARS[0]).icon;

  function nameColor() {
    const c = D.NAME_COLORS.find((x) => x.id === save.look.color) || D.NAME_COLORS[0];
    return c.color === 'team' ? D.TEAMS[save.team].color : c.color;
  }

  function setLook(kind, id) {
    const lists = { avatar: D.AVATARS, color: D.NAME_COLORS, banner: D.BANNERS };
    if (kind === 'title') {
      if (id && !titles().some((t) => t.id === id)) return false;
      save.look.title = id || '';
    } else if (kind === 'bio') {
      save.look.bio = String(id || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    } else if (kind === 'showcase') {
      const sc = save.look.showcase;
      const i = sc.indexOf(id);
      if (i >= 0) sc.splice(i, 1);
      else if (save.badges.includes(id) || save.ach[id]) { sc.push(id); while (sc.length > 3) sc.shift(); }
    } else {
      const it = lists[kind].find((x) => x.id === id);
      if (!it || lookLock(kind, it)) return false;
      save.look[kind] = id;
    }
    persist();
    return true;
  }

  // What other players see in team chat.
  function publicProfile() {
    const c = D.NAME_COLORS.find((x) => x.id === save.look.color) || D.NAME_COLORS[0];
    return { name: save.name, avatar: avatarIcon(), color: c.color === 'team' ? 'team' : c.color, title: titleText(), level: level(), prestige: save.prestige };
  }

  /* ------------------ Shop ------------------ */

  // Three items a day at 30% off, the same for everyone.
  function deals(now) {
    const r = rng(`deals:${dayKey(now || Date.now())}`);
    const pool = D.SHOP.slice();
    const out = [];
    while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0].id);
    return out;
  }

  function price(it) {
    return deals().includes(it.id) ? Math.round(it.cost * (1 - D.DEAL_OFF)) : it.cost;
  }

  // Already own it (for one-off cosmetics)?
  function ownsShop(it) {
    const g = it.give;
    if (g.avatar) return save.owned.avatar.includes(g.avatar);
    if (g.color) return save.owned.color.includes(g.color);
    if (g.banner) return save.owned.banner.includes(g.banner);
    if (g.title) return save.owned.title.includes(g.title);
    if (g.skin) return save.skins.includes(g.skin);
    return false;
  }

  function buy(id, nearbyIds) {
    const it = D.SHOP.find((x) => x.id === id);
    if (!it) return { ok: false, text: 'Not for sale' };
    if (ownsShop(it)) return { ok: false, text: 'You already own it' };
    const g = it.give;
    if (g.energy && save.energy >= maxEnergy()) return { ok: false, text: 'Your energy is already full' };
    const cost = price(it);
    if (save.cores < cost) return { ok: false, text: `Needs ${fmt(cost)} Tech Cores` };
    save.cores -= cost;
    if (g.items) for (const k in g.items) giveItem(k, g.items[k]);
    if (g.energy) { save.energy = maxEnergy(); save.energyAt = Date.now(); }
    if (g.cooldowns) for (const pid of nearbyIds || []) if (save.portals[pid]) save.portals[pid].hackAt = 0;
    if (g.avatar) save.owned.avatar.push(g.avatar);
    if (g.color) save.owned.color.push(g.color);
    if (g.banner) save.owned.banner.push(g.banner);
    if (g.title) save.owned.title.push(g.title);
    if (g.skin) save.skins.push(g.skin);
    save.bought[id] = (save.bought[id] || 0) + 1;
    persist();
    return { ok: true, text: `Bought ${it.name}`, cost };
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
    extras.push({ text: '🔗 Connect 2 portals', xp: D.XP.link2 });
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
    logCP(now);
    // Forget energy cells taken more than an hour ago.
    for (const id in save.energyTaken) if (now - save.energyTaken[id] > 3600e3) delete save.energyTaken[id];
    for (const id in save.signals) if (now - save.signals[id] > 2 * 86400e3) delete save.signals[id];
  }

  PH.state = {
    get save() { return save; },
    useAccount, lookLock, titles, titleText, avatarIcon, nameColor, setLook, publicProfile,
    deals, price, ownsShop, buy,
    start(s) {
      save = s;
      // Saves from before gear and fields existed.
      if (!save.inv) save.inv = Object.assign({}, D.START_ITEMS);
      if (!save.keys) save.keys = {};
      if (!save.fields) save.fields = [];
      if (save.stats.fields == null) save.stats.fields = 0;
      if (save.stats.bombs == null) save.stats.bombs = 0;
      // Saves from before profiles and the shop.
      if (!save.look) save.look = { avatar: 'fox', color: 'team', banner: 'night', title: '', bio: '', showcase: [] };
      if (!save.owned) save.owned = { avatar: [], color: [], banner: [], title: [] };
      if (!save.bought) save.bought = {};
      if (!save.chat) save.chat = [];
      if (!save.muted) save.muted = [];
      if (save.settings.share == null) save.settings.share = true;
      checkLevel();
    },
    fresh, load, persist, reset,
    on(fn) { listener = fn; },
    level, rank, has, progress, award, addCores, rewardText, capRoom,
    upgrade, scanRange, signalRange, maxEnergy, maxLinks, hackParams, teamLevel, teamFP,
    collectCube, itemCount, keyCount, uplinksOf, firewallsOf,
    canDeploy, deploy, canFirewall, installFirewall, canBomb, bomb,
    ownerOf, visible, discovered, discover, discoverSignal,
    tiersFor, canHack, startHack, finishHack, canCapture, capture, held, simulateAttacks,
    canDefend, startDefense, stopDefense, tickDefense,
    canLink, link, networkSize, fieldReward, myCP, worldStandings, topAgents, worldNetworks,
    acceptSquad, acceptLegend, eventWindow, eventName, eventScores,
    objectiveProgress, claimObjective,
    canPrestige, prestige, recommend, tick,
    nextMidnight, weekStart, dayKey,
  };
})(window.PH);
