/* Portal Hackers: Nexus — the numbers. Every XP reward, Tech Core reward,
   level, rank, unlock, mission, objective and prestige reward lives here, so
   the whole progression system can be read (and tuned) in one place. */
window.PH = window.PH || {};
(function (PH) {
  'use strict';

  /* ------------------ XP rewards ------------------ */

  const XP = {
    discover: { common: 50, rare: 150, epic: 300, legendary: 750 },
    hack: { basic: 100, advanced: 250, expert: 500 },
    captureNeutral: 200,
    captureEnemy: 350,
    defend10: 100,
    defend30: 350,
    link2: 250,
    link3: 500,
    squad: 400,
    teamEvent: 1000,
    nexusSignal: 750,
    legendaryMission: 2000,
  };

  const CAPS = { day: 10000, week: 50000 };

  /* ------------------ Tech Core rewards ------------------ */

  const CORES = {
    discover: { common: 10, rare: 25, epic: 50, legendary: 150 },
    hack: { basic: 15, advanced: 35, expert: 75 },
    captureEnemy: 50,
    squad: 75,
    legendaryMission: 250,
    weeklyObjective: 500,
  };

  /* ------------------ Portals ------------------ */

  // The reward range is what a portal is worth across discovering, hacking
  // and capturing it. A Nexus portal pays its range in one roll on capture.
  const RARITY = {
    common:    { name: 'Common',    icon: '🔵', color: '#3D9BFF', xp: [50, 150],    cores: [10, 25],    diff: 'Easy',    minTier: 'basic',    level: 1 },
    rare:      { name: 'Rare',      icon: '🟣', color: '#B05CFF', xp: [150, 400],   cores: [25, 75],    diff: 'Medium',  minTier: 'basic',    level: 11 },
    epic:      { name: 'Epic',      icon: '🟠', color: '#FF8A2B', xp: [400, 900],   cores: [75, 150],   diff: 'Hard',    minTier: 'advanced', level: 21 },
    legendary: { name: 'Legendary', icon: '🟡', color: '#FFD23F', xp: [750, 2000],  cores: [150, 500],  diff: 'Extreme', minTier: 'expert',   level: 31 },
    nexus:     { name: 'Nexus',     icon: '⚫', color: '#E9E4FF', xp: [2000, 5000], cores: [500, 2000], diff: 'Endgame', minTier: 'expert',   level: 40 },
  };
  const RARITY_ORDER = ['common', 'rare', 'epic', 'legendary', 'nexus'];

  /* ------------------ Hacks ------------------ */

  // grid × grid nodes; memorise a `len`-node code shown `flash` ms per node,
  // then repeat it within `time` seconds.
  const HACKS = {
    basic:    { name: 'Basic Hack',    grid: 3, len: 4, flash: 620, time: 12, energy: 5,  level: 1,  pts: 10 },
    advanced: { name: 'Advanced Hack', grid: 4, len: 6, flash: 500, time: 15, energy: 10, level: 11, pts: 20 },
    expert:   { name: 'Expert Hack',   grid: 5, len: 8, flash: 400, time: 18, energy: 15, level: 17, pts: 40 },
  };
  const TIER_ORDER = ['basic', 'advanced', 'expert'];

  /* ------------------ Teams ------------------ */

  const TEAMS = {
    N: { id: 'N', name: 'NOVA',    color: '#35E0FF', glyph: '✦', motto: 'Light the network. Every portal, a star.' },
    P: { id: 'P', name: 'PULSAR',  color: '#FF4FD8', glyph: '◈', motto: 'Strike fast, hold the signal.' },
    E: { id: 'E', name: 'ECLIPSE', color: '#FFB238', glyph: '◐', motto: 'Swallow the light. Own the dark.' },
  };

  /* ------------------ Ranks ------------------ */

  const RANKS = [
    { id: 'scout',  name: 'SCOUT',        icon: '🔭', from: 1,  to: 10, blurb: 'New players learn the basics.',
      unlocks: ['Basic Sci-Fi Compass', 'Portal scanner', 'Basic hacking', 'First team selection', 'Squad system', 'Common portals'] },
    { id: 'hacker', name: 'HACKER',       icon: '💻', from: 11, to: 20, blurb: 'Players become advanced portal hackers.',
      unlocks: ['Advanced hacking puzzles', 'Longer-range portal scanner', 'Portal defenses', 'Team territory map', 'Rare portals', 'New compass abilities'] },
    { id: 'op',     name: 'OPERATIVE',    icon: '⚡', from: 21, to: 30, blurb: 'Players become important members of their faction.',
      unlocks: ['Portal linking', 'Energy networks', 'Squad abilities', 'Advanced team missions', 'Epic portals', 'Custom compass modules'] },
    { id: 'agent',  name: 'NEXUS AGENT',  icon: '🌌', from: 31, to: 40, blurb: 'Players gain access to dangerous Nexus technology.',
      unlocks: ['Quantum scanner', 'Legendary portals', 'Nexus missions', 'Advanced team upgrades', 'Special hacking abilities', 'Large-scale multiplayer events'] },
    { id: 'master', name: 'NEXUS MASTER', icon: '👑', from: 41, to: 50, blurb: 'The highest normal progression tier.',
      unlocks: ['Master Compass', 'Ultimate hacking abilities', 'Legendary missions', 'Exclusive cosmetics', 'Elite portal access', 'Nexus Master events'] },
  ];

  const rankOf = (level) => RANKS.find((r) => level >= r.from && level <= r.to) || RANKS[RANKS.length - 1];

  /* ------------------ Levels ------------------ */

  // [XP to next level, reward on reaching this level]. Reward kinds:
  //   cores  — Tech Cores
  //   free   — a free level in a Compass upgrade branch ('any' = your choice)
  //   unlock — a feature (see GATES)
  //   rank   — a rank insignia (every 10 levels)
  //   gear / skin — a cosmetic
  const LEVELS = [
    null,
    [500,   [{ t: 'item', name: 'Basic Compass' }]],
    [750,   [{ t: 'cores', n: 100 }]],
    [1000,  [{ t: 'free', b: 'scanner', name: 'Scanner Upgrade' }]],
    [1250,  [{ t: 'cores', n: 150 }]],
    [1500,  [{ t: 'unlock', u: 'squad' }]],
    [1750,  [{ t: 'free', b: 'any', name: 'Compass Module' }]],
    [2000,  [{ t: 'cores', n: 200 }]],
    [2250,  [{ t: 'free', b: 'scanner', name: 'Portal Scanner Upgrade' }]],
    [2500,  [{ t: 'cores', n: 250 }]],
    [3000,  [{ t: 'rank', r: 'scout' }, { t: 'unlock', u: 'advScanner' }]],
    [3250,  [{ t: 'free', b: 'hacking', name: 'Hacker Module' }, { t: 'unlock', u: 'advancedHack' }, { t: 'unlock', u: 'rare' }]],
    [3500,  [{ t: 'cores', n: 300 }]],
    [3750,  [{ t: 'free', b: 'energy', name: 'Energy Upgrade' }]],
    [4000,  [{ t: 'gear', id: 'visor' }]],
    [4500,  [{ t: 'unlock', u: 'defense' }]],
    [4750,  [{ t: 'cores', n: 400 }]],
    [5000,  [{ t: 'free', b: 'hacking', name: 'Advanced Hack Module' }, { t: 'unlock', u: 'expertHack' }]],
    [5250,  [{ t: 'skin', id: 'aurora' }]],
    [5500,  [{ t: 'cores', n: 500 }]],
    [6000,  [{ t: 'rank', r: 'hacker' }, { t: 'unlock', u: 'territory' }]],
    [6250,  [{ t: 'free', b: 'network', name: 'Network Module' }, { t: 'unlock', u: 'epic' }]],
    [6500,  [{ t: 'cores', n: 600 }]],
    [6750,  [{ t: 'free', b: 'network', name: 'Portal Link Upgrade' }]],
    [7000,  [{ t: 'gear', id: 'cape' }]],
    [7500,  [{ t: 'unlock', u: 'linking' }]],
    [7750,  [{ t: 'cores', n: 750 }]],
    [8000,  [{ t: 'free', b: 'network', name: 'Advanced Network Module' }]],
    [8250,  [{ t: 'skin', id: 'flare' }]],
    [8500,  [{ t: 'cores', n: 900 }]],
    [9000,  [{ t: 'rank', r: 'op' }, { t: 'unlock', u: 'quantum' }]],
    [9250,  [{ t: 'free', b: 'quantum', name: 'Quantum Module' }, { t: 'unlock', u: 'legendary' }]],
    [9500,  [{ t: 'cores', n: 1000 }]],
    [9750,  [{ t: 'free', b: 'hacking', name: 'Legendary Hack Module' }]],
    [10000, [{ t: 'gear', id: 'halo' }]],
    [10500, [{ t: 'unlock', u: 'legendaryMissions' }]],
    [10750, [{ t: 'cores', n: 1250 }]],
    [11000, [{ t: 'free', b: 'energy', name: 'Quantum Energy Upgrade' }, { t: 'free', b: 'quantum', name: 'Quantum Energy Upgrade' }]],
    [11250, [{ t: 'skin', id: 'nebula' }]],
    [11500, [{ t: 'cores', n: 1500 }]],
    [12000, [{ t: 'rank', r: 'agent' }, { t: 'unlock', u: 'nexusTech' }]],
    [12500, [{ t: 'free', b: 'quantum', name: 'Nexus Module' }]],
    [13000, [{ t: 'cores', n: 1750 }]],
    [13500, [{ t: 'free', b: 'hacking', name: 'Master Hack Module' }]],
    [14000, [{ t: 'gear', id: 'insignia' }]],
    [14500, [{ t: 'unlock', u: 'masterHack' }]],
    [15000, [{ t: 'cores', n: 2000 }]],
    [15500, [{ t: 'free', b: 'all', name: 'Ultimate Compass Module' }]],
    [16000, [{ t: 'skin', id: 'singularity' }]],
    [17000, [{ t: 'cores', n: 2500 }]],
    [0,     [{ t: 'rank', r: 'master' }, { t: 'unlock', u: 'prestige' }]],
  ];
  const MAX_LEVEL = 50;

  // Cumulative XP needed to reach each level: CUM[1] = 0 … CUM[50] = 374,000.
  const CUM = [0, 0];
  for (let l = 1; l < MAX_LEVEL; l++) CUM[l + 1] = CUM[l] + LEVELS[l][0];

  function levelFor(xp) {
    let l = 1;
    while (l < MAX_LEVEL && xp >= CUM[l + 1]) l++;
    return l;
  }

  // What each unlock opens, and the level it opens at.
  const GATES = {
    squad:             { level: 5,  name: 'Squad Missions',      text: 'Team up with your squad for missions worth 400 XP and 75 Tech Cores.' },
    advScanner:        { level: 10, name: 'Advanced Scanner',    text: 'Your scanner reaches 50 m further.' },
    advancedHack:      { level: 11, name: 'Advanced Hacking',    text: 'Advanced Hacks: harder puzzles worth 250 XP.' },
    rare:              { level: 11, name: 'Rare Portals',        text: 'Your scanner can see 🟣 Rare portals.' },
    defense:           { level: 15, name: 'Portal Defense',      text: 'Defend your team\'s portals: 10 minutes for 100 XP, 30 minutes for 350 XP.' },
    expertHack:        { level: 17, name: 'Expert Hacking',      text: 'Expert Hacks: the hardest puzzles, worth 500 XP.' },
    territory:         { level: 20, name: 'Territory Map',       text: 'Zoom the compass out to see who holds every portal in a kilometre.' },
    epic:              { level: 21, name: 'Epic Portals',        text: 'Your scanner can see 🟠 Epic portals.' },
    linking:           { level: 25, name: 'Portal Linking',      text: 'Connect your team\'s portals into energy networks.' },
    quantum:           { level: 30, name: 'Quantum Scanner',     text: 'Detect 🌌 Nexus signals, and upgrade the Quantum branch.' },
    legendary:         { level: 31, name: 'Legendary Portals',   text: 'Your scanner can see 🟡 Legendary portals.' },
    legendaryMissions: { level: 35, name: 'Legendary Missions',  text: 'One three-stage mission a day, worth 2,000 XP and 250 Tech Cores.' },
    nexusTech:         { level: 40, name: 'Nexus Technology',    text: 'Your scanner can see ⚫ Nexus portals, the endgame.' },
    masterHack:        { level: 45, name: 'Master Hacking',      text: 'Portal cooldowns are halved, and one extra mistake is forgiven in every hack.' },
    prestige:          { level: 50, name: 'Nexus Prestige',      text: 'Reset to Level 1 for a Prestige reward. You keep everything you collected.' },
  };

  const unlocked = (level, u) => level >= GATES[u].level;

  /* ------------------ Compass upgrade tree ------------------ */

  const BRANCH_MAX = 10;
  const BRANCH_COST = [150, 300, 500, 750, 1000, 1400, 1800, 2300, 2900, 3500];

  const BRANCHES = {
    scanner: { name: 'Scanner', icon: '📡', text: 'Increase portal detection range.',
      effect: (l) => `Detection range ${60 + 15 * l} m` },
    hacking: { name: 'Hacking', icon: '💻', text: 'Make advanced hacking systems easier to manage.',
      effect: (l) => `+${8 * l}% time, ${5 * l}% slower codes${l >= 10 ? ', 2 mistakes forgiven' : l >= 5 ? ', 1 mistake forgiven' : ''}` },
    energy:  { name: 'Energy',  icon: '🔋', text: 'Increase the amount of energy the player can collect.',
      effect: (l) => `Max ${100 + 20 * l} energy, +${15 + 5 * l} per energy cell` },
    defense: { name: 'Defense', icon: '🛡️', text: 'Improve the player\'s ability to defend team portals.',
      effect: (l) => `Your portals resist attacks ${7 * l}% better` },
    network: { name: 'Network', icon: '🔗', text: 'Increase the number of portals the player can connect.',
      effect: (l) => `Up to ${4 + 2 * l} links, ${250 + 75 * l} m long` },
    quantum: { name: 'Quantum', icon: '⚛️', text: 'Unlock powerful late-game abilities.', gate: 'quantum', mult: 1.5,
      effect: (l) => `Nexus signals seen at ${300 + 60 * l} m, ${4 * l}% chance of double hack cores` },
  };
  const BRANCH_ORDER = ['scanner', 'hacking', 'energy', 'defense', 'network', 'quantum'];

  const branchCost = (b, l) => Math.round(BRANCH_COST[l] * (BRANCHES[b].mult || 1));
  const MAXED_REFUND = 500;   // a free upgrade on a maxed branch pays this instead

  /* ------------------ Cosmetics ------------------ */

  // Compass skins: [ring, glow, sweep] colours.
  const SKINS = {
    basic:       { name: 'Basic Compass', from: 'Level 1',  colors: ['#5FE3FF', '#1A8CFF', '#5FE3FF'] },
    aurora:      { kind: 'Rare Compass Skin', name: 'Aurora',        from: 'Level 18 · Rare Compass Skin',      colors: ['#7CFFB2', '#00C2A8', '#B6FF6A'] },
    flare:       { kind: 'Epic Compass Skin', name: 'Solar Flare',   from: 'Level 28 · Epic Compass Skin',      colors: ['#FFB547', '#FF5A2B', '#FFE07A'] },
    nebula:      { kind: 'Legendary Compass Skin', name: 'Nebula Gold',   from: 'Level 38 · Legendary Compass Skin', colors: ['#FFD86B', '#B65CFF', '#FFF1B0'] },
    singularity: { kind: 'Master Compass Skin', name: 'Singularity',   from: 'Level 48 · Master Compass Skin',    colors: ['#FFFFFF', '#7A5CFF', '#FF4FD8'] },
    prism:       { name: 'Prism Drive',   from: 'Prestige 4 · Animated Compass Skin', colors: ['#FF4FD8', '#35E0FF', '#FFD23F'], animated: true },
  };

  const GEAR = {
    visor:    { kind: 'Rare Cosmetic', name: 'Circuit Visor',    icon: '🥽', from: 'Level 14 · Rare Cosmetic' },
    cape:     { kind: 'Epic Cosmetic', name: 'Holo Cape',        icon: '🧥', from: 'Level 24 · Epic Cosmetic' },
    halo:     { kind: 'Legendary Cosmetic', name: 'Nexus Halo',       icon: '😇', from: 'Level 34 · Legendary Cosmetic' },
    insignia: { kind: 'Elite Cosmetic', name: 'Elite Insignia',   icon: '🎖️', from: 'Level 44 · Elite Cosmetic' },
    armor:    { name: 'Master Nexus Armor', icon: '🛡️', from: 'Prestige 5' },
    teamwing: { name: 'Legendary Team Wings', icon: '🪽', from: 'Weekly Team Objective: Nexus Hunt' },
  };

  const BADGES = {
    scout:    { name: 'SCOUT Rank',        icon: '🔭' },
    hacker:   { name: 'HACKER Rank',       icon: '💻' },
    op:       { name: 'OPERATIVE Rank',    icon: '⚡' },
    agent:    { name: 'NEXUS AGENT Rank',  icon: '🌌' },
    master:   { name: 'NEXUS MASTER',      icon: '👑' },
    teamBadge:{ name: 'Territory Badge',   icon: '🏴' },
    prestige: { name: 'Prestige Badge',    icon: '💠' },
  };

  /* ------------------ Prestige ------------------ */

  const PRESTIGE = [
    null,
    { name: 'Prestige Badge + Compass Frame', give: [{ t: 'badge', id: 'prestige' }, { t: 'frame' }] },
    { name: 'Unique Portal Effect',           give: [{ t: 'portalFx' }] },
    { name: 'Exclusive Player Title',         give: [{ t: 'title', name: 'Nexus Ascendant' }] },
    { name: 'Animated Compass Skin',          give: [{ t: 'skin', id: 'prism' }] },
    { name: 'Master Nexus Armor',             give: [{ t: 'gear', id: 'armor' }] },
  ];
  const prestigeReward = (p) => PRESTIGE[p] || { name: 'Prestige Star + exclusive cosmetic', give: [{ t: 'star' }] };

  /* ------------------ Daily missions ------------------ */

  const DAILY = {
    discover: { text: 'Discover 3 portals',       goal: 3, xp: 300, cores: 50,  icon: '🔎' },
    hack:     { text: 'Hack 3 portals',           goal: 3, xp: 500, cores: 75,  icon: '💻' },
    defend:   { text: 'Defend a portal',          goal: 1, xp: 400, cores: 50,  icon: '🛡️', gate: 'defense' },
    squad:    { text: 'Complete a squad mission', goal: 1, xp: 600, cores: 100, icon: '🤝', gate: 'squad' },
    capture:  { text: 'Capture an enemy portal',  goal: 1, xp: 750, cores: 125, icon: '🏴' },
  };
  const DAILY_BONUS = { xp: 500, cores: 150 };

  /* ------------------ Squad missions ------------------ */

  const SQUAD = {
    breach: { name: 'Breach Run',    text: 'Hack 3 portals',             ev: 'hack',     goal: 3 },
    sweep:  { name: 'Signal Sweep',  text: 'Discover 3 portals',         ev: 'discover', goal: 3 },
    strike: { name: 'Strike Team',   text: 'Capture 1 portal',           ev: 'capture',  goal: 1 },
    hold:   { name: 'Hold the Line', text: 'Defend a portal for 10 min', ev: 'defend',   goal: 1, gate: 'defense' },
    wire:   { name: 'Wire Job',      text: 'Connect 2 portals',          ev: 'link',     goal: 1, gate: 'linking' },
    teamop: { name: 'Special Team Op', text: 'Hack 4 portals',           ev: 'hack',     goal: 4, teamLevel: 20 },
  };
  const SQUAD_MINUTES = 45;

  /* ------------------ Legendary missions ------------------ */

  const LEGENDARY_STAGES = [
    { text: 'Expert Hack an Epic, Legendary or Nexus portal', ev: 'hackElite' },
    { text: 'Capture an enemy portal', ev: 'captureEnemy' },
    { text: 'Discover a Nexus signal', ev: 'signal' },
  ];

  /* ------------------ Weekly team objectives ------------------ */

  const OBJECTIVES = [
    { id: 'network',   name: 'Portal Network', text: 'Connect 1,000 portals.',               goal: 1000,
      reward: 'Reward: 25,000 Team XP + 5,000 Tech Cores', teamXP: 25000, cores: 5000 },
    { id: 'territory', name: 'Territory',      text: 'Control 500 portals simultaneously.',  goal: 500,
      reward: 'Reward: Exclusive Team Badge + 10,000 Team XP + 500 Tech Cores', teamXP: 10000, cores: 500, badge: 'teamBadge' },
    { id: 'nexus',     name: 'Nexus Hunt',     text: 'Discover 100 Nexus signals.',          goal: 100,
      reward: 'Reward: Legendary Team Cosmetic + 15,000 Team XP + 500 Tech Cores', teamXP: 15000, cores: 500, gear: 'teamwing' },
  ];

  /* ------------------ Team levels ------------------ */

  const TEAM_PERKS = [
    { level: 1,  name: 'Basic Headquarters' },
    { level: 5,  name: 'Better Portal Detection', text: '+25 m scanner range for everyone' },
    { level: 10, name: 'Team Portal Upgrades',    text: 'Team portals resist attacks 20% better' },
    { level: 20, name: 'Special Team Missions',   text: 'Special Team Ops appear in squad missions' },
    { level: 30, name: 'Legendary Events',        text: 'Team events pay double Faction Points' },
    { level: 50, name: 'Nexus War',               text: 'Team events become the Nexus War' },
  ];
  const TEAM_MAX = 50;
  const teamFPFor = (lvl) => 2000 * (lvl - 1) * (lvl - 1);
  const teamLevelFor = (fp) => Math.min(TEAM_MAX, 1 + Math.floor(Math.sqrt(Math.max(0, fp) / 2000)));

  /* ------------------ Team events ------------------ */

  const EVENT = { every: 2 * 3600e3, length: 30 * 60e3 };
  const EVENT_PTS = { discover: 5, capture: 30, link: 20, defendMin: 3, signal: 25 };

  /* ------------------ Achievements (kept through Prestige) ------------------ */

  const ACHIEVEMENTS = [
    { id: 'hack1',    icon: '💻', name: 'First Breach',      text: 'Hack a portal',            stat: 'hacked',     n: 1 },
    { id: 'hack100',  icon: '🧠', name: 'Code Breaker',      text: 'Hack 100 portals',         stat: 'hacked',     n: 100 },
    { id: 'disc50',   icon: '🔎', name: 'Pathfinder',        text: 'Discover 50 portals',      stat: 'discovered', n: 50 },
    { id: 'cap1',     icon: '🏴', name: 'Flag Planted',      text: 'Capture a portal',         stat: 'captured',   n: 1 },
    { id: 'cap50',    icon: '🏰', name: 'Warlord',           text: 'Capture 50 portals',       stat: 'captured',   n: 50 },
    { id: 'def1',     icon: '🛡️', name: 'Sentinel',          text: 'Defend a portal',          stat: 'defended',   n: 1 },
    { id: 'link1',    icon: '🔗', name: 'Wired',             text: 'Connect 2 portals',        stat: 'links',      n: 1 },
    { id: 'squad10',  icon: '🤝', name: 'Squad Leader',      text: 'Complete 10 squad missions', stat: 'squad',    n: 10 },
    { id: 'event1',   icon: '🏆', name: 'Champion',          text: 'Win a team event',         stat: 'eventsWon',  n: 1 },
    { id: 'signal1',  icon: '🌌', name: 'Listener',          text: 'Discover a Nexus signal',  stat: 'signals',    n: 1 },
    { id: 'legend1',  icon: '🐉', name: 'Legend',            text: 'Complete a Legendary Mission', stat: 'legendary', n: 1 },
    { id: 'max',      icon: '👑', name: 'Nexus Master',      text: 'Reach Level 50',           stat: 'maxed',      n: 1 },
  ];

  /* ------------------ World tuning ------------------ */

  const RANGE = {
    interact: 45,      // meters: hack, capture, defend, link from here
    defendSlack: 90,   // meters: how far you can wander while defending
    linkBase: 250,
  };

  const ENERGY = {
    base: 100, perLevel: 20,
    cost: { capture: 20, link: 10 },
    regenMs: (l) => (30 - 2 * l) * 1000,
    cell: (l) => 15 + 5 * l,
  };

  const COOLDOWN = { hack: 5 * 60e3, fail: 60e3, breach: 5 * 60e3 };

  PH.data = {
    XP, CAPS, CORES, RARITY, RARITY_ORDER, HACKS, TIER_ORDER, TEAMS, RANKS, rankOf,
    LEVELS, MAX_LEVEL, CUM, levelFor, GATES, unlocked,
    BRANCHES, BRANCH_ORDER, BRANCH_MAX, branchCost, MAXED_REFUND,
    SKINS, GEAR, BADGES, PRESTIGE, prestigeReward,
    DAILY, DAILY_BONUS, SQUAD, SQUAD_MINUTES, LEGENDARY_STAGES, OBJECTIVES,
    TEAM_PERKS, TEAM_MAX, teamFPFor, teamLevelFor, EVENT, EVENT_PTS, ACHIEVEMENTS,
    RANGE, ENERGY, COOLDOWN,
  };
})(window.PH);
