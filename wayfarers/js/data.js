/* Wayfarers — the catalogue: heroes, enemies, lands, camp upgrades, quests,
   and every formula that sets how strong things are and what they're worth.
   No DOM in here, so the balance can be simulated in Node. */
(function (WF) {
  'use strict';

  /* ---------- Small helpers ---------- */

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  const SUFFIX = ['', 'K', 'M', 'B', 'T'];
  // 1234 → "1.23K", 5.6e15 → "5.60aa". Small numbers stay whole.
  function fmt(n) {
    n = Math.floor(n);
    if (n < 1000) return String(Math.max(0, n));
    let tier = Math.floor(Math.log10(n) / 3);
    const scaled = n / Math.pow(1000, tier);
    let suf;
    if (tier < SUFFIX.length) suf = SUFFIX[tier];
    else {
      const k = tier - SUFFIX.length;
      suf = String.fromCharCode(97 + Math.floor(k / 26) % 26) + String.fromCharCode(97 + (k % 26));
    }
    const digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
    return scaled.toFixed(digits) + suf;
  }

  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return h + 'h ' + String(m).padStart(2, '0') + 'm';
    if (m > 0) return m + 'm ' + String(s).padStart(2, '0') + 's';
    return s + 's';
  }

  /* ---------- Heroes ---------- */

  const RARITY = {
    common: { name: 'Common', mult: 1, color: '#9FB3C8', weight: 55 },
    rare: { name: 'Rare', mult: 1.35, color: '#4FA8FF', weight: 30 },
    epic: { name: 'Epic', mult: 1.8, color: '#B66BFF', weight: 12 },
    legendary: { name: 'Legendary', mult: 2.4, color: '#FFB938', weight: 3 },
  };

  // Base stats at level 1, 1 star, common. `melee` heroes stand in the front
  // row and soak the hits; the rest stay at the back.
  const ROLE = {
    tank: { name: 'Tank', hp: 130, atk: 5, interval: 1.25, melee: true, aggro: 3 },
    warrior: { name: 'Warrior', hp: 85, atk: 10, interval: 1.0, melee: true, aggro: 1.5 },
    rogue: { name: 'Rogue', hp: 62, atk: 9, interval: 0.7, melee: true, aggro: 1 },
    archer: { name: 'Archer', hp: 55, atk: 11, interval: 0.9, melee: false, aggro: 1 },
    mage: { name: 'Mage', hp: 50, atk: 15, interval: 1.35, melee: false, aggro: 1 },
    healer: { name: 'Healer', hp: 60, atk: 6, interval: 1.2, melee: false, aggro: 1 },
  };

  // Skills fire when a hero's energy bar fills (each attack +20, each hit taken +8).
  //   nuke k      → k × attack to the current target
  //   aoe k       → k × attack to every enemy
  //   heal k      → heals every ally by k × attack
  //   shield k    → every ally gets a barrier worth k × the caster's max HP
  //   stun k,t    → k × attack to every enemy and stuns them for t seconds
  //   rally k,t   → the whole party hits k × harder for t seconds
  const HEROES = [
    { id: 'brom', name: 'Brom', title: 'the Stalwart', role: 'tank', rarity: 'common',
      skill: { type: 'shield', k: 0.35, name: 'Shield Wall' }, color: '#4C7BD9', hair: '#7A4B2A', skin: '#F1C7A1' },
    { id: 'wren', name: 'Wren', title: 'the Swift Arrow', role: 'archer', rarity: 'common',
      skill: { type: 'nuke', k: 4, name: 'Piercing Shot' }, color: '#3E9A57', hair: '#D9A441', skin: '#F6D2B3' },
    { id: 'pip', name: 'Pip', title: 'the Plucky', role: 'warrior', rarity: 'common',
      skill: { type: 'nuke', k: 3.5, name: 'Big Swing' }, color: '#C9573E', hair: '#3A2A1E', skin: '#E8B48E' },
    { id: 'moss', name: 'Moss', title: 'of the Glade', role: 'healer', rarity: 'common',
      skill: { type: 'heal', k: 3, name: 'Bloom' }, color: '#6FBF73', hair: '#4F7A3A', skin: '#C99A72' },
    { id: 'sable', name: 'Sable', title: 'the Quiet Knife', role: 'rogue', rarity: 'rare',
      skill: { type: 'nuke', k: 6, name: 'Backstab' }, color: '#3B3F58', hair: '#1C1C24', skin: '#E6BFA0' },
    { id: 'ember', name: 'Ember', title: 'the Kindled', role: 'mage', rarity: 'rare',
      skill: { type: 'aoe', k: 2, name: 'Fireburst' }, color: '#E0622B', hair: '#B5241B', skin: '#F4CFAE' },
    { id: 'thorne', name: 'Thorne', title: 'the Oathbound', role: 'tank', rarity: 'rare',
      skill: { type: 'heal', k: 2.5, name: 'Lay on Hands' }, color: '#D9C25A', hair: '#E9E2C8', skin: '#D9A882' },
    { id: 'kestrel', name: 'Kestrel', title: 'the Snare-Setter', role: 'archer', rarity: 'rare',
      skill: { type: 'stun', k: 1.2, t: 2, name: 'Net Volley' }, color: '#8C6A3F', hair: '#5A3A22', skin: '#B9835C' },
    { id: 'vex', name: 'Vex', title: 'the Hexer', role: 'mage', rarity: 'epic',
      skill: { type: 'aoe', k: 3, name: 'Hexstorm' }, color: '#7A3FC4', hair: '#E3E3F0', skin: '#CDB5E0' },
    { id: 'aurelia', name: 'Aurelia', title: 'the Valkyrie', role: 'warrior', rarity: 'epic',
      skill: { type: 'rally', k: 0.6, t: 5, name: 'War Cry' }, color: '#E8EEF8', hair: '#F2C94C', skin: '#F6D7BE' },
    { id: 'nyx', name: 'Nyx', title: 'the Shadow Dancer', role: 'rogue', rarity: 'legendary',
      skill: { type: 'nuke', k: 11, name: 'Eclipse' }, color: '#231942', hair: '#9F86FF', skin: '#D8C5E8' },
    { id: 'solenne', name: 'Solenne', title: 'the Archmage', role: 'mage', rarity: 'legendary',
      skill: { type: 'stun', k: 4, t: 2.5, name: 'Starfall' }, color: '#2A4BA0', hair: '#F7F7FF', skin: '#F3DCC8' },
  ];
  const HERO = Object.fromEntries(HEROES.map((h) => [h.id, h]));

  const MAX_STARS = 5;
  const PARTY_SIZE = 5;

  // Copies needed to go from `stars` to stars + 1.
  const ascendCost = (stars) => stars;
  const starMult = (stars) => Math.pow(1.45, stars - 1);
  const levelMult = (level) => Math.pow(1.095, level - 1) * (1 + 0.04 * (level - 1));
  // Gold to go from `level` to level + 1.
  const levelCost = (level) => Math.ceil(18 * Math.pow(1.14, level - 1) + 6 * (level - 1));

  // A hero's attack and HP before party-wide bonuses.
  function heroStats(id, level, stars) {
    const def = HERO[id];
    const role = ROLE[def.role];
    const m = RARITY[def.rarity].mult * starMult(stars) * levelMult(level);
    return { hp: role.hp * m, atk: role.atk * m, interval: role.interval };
  }

  /* ---------- Lands and enemies ---------- */

  // Every chapter (10 stages, the last one a boss) is a new land; after the
  // sixth they come round again, darker and tougher.
  const LANDS = [
    { name: 'Greenmeadow', sky: ['#8FD3FF', '#D8F1FF'], far: '#8DB8A0', near: '#5FA05A', ground: '#7CBF5B', dirt: '#A98458',
      foes: ['slime', 'boar', 'bee'], boss: 'kingslime' },
    { name: 'Hollow Wood', sky: ['#4E7A6B', '#A9CBB0'], far: '#2E5845', near: '#25432F', ground: '#3F6B3A', dirt: '#5E4A33',
      foes: ['goblin', 'wolf', 'shroom'], boss: 'treant' },
    { name: 'Sunscar Dunes', sky: ['#F6A65B', '#FCE2B0'], far: '#D99A5B', near: '#C98447', ground: '#E8C27A', dirt: '#C79A55',
      foes: ['scorpion', 'mummy', 'vulture'], boss: 'pharaoh' },
    { name: 'Frostpeak', sky: ['#7FA6D8', '#E2EEFA'], far: '#B9CDE6', near: '#9BB4D3', ground: '#EAF2FA', dirt: '#A9BACF',
      foes: ['yeti', 'wisp', 'penguin'], boss: 'frostwyrm' },
    { name: 'Ashen Crags', sky: ['#43181B', '#B4492E'], far: '#5A2A24', near: '#3A1C1A', ground: '#4D3530', dirt: '#2D201D',
      foes: ['imp', 'golem', 'bat'], boss: 'infernal' },
    { name: 'The Starless Keep', sky: ['#0F0C29', '#3A2C6E'], far: '#2B2255', near: '#1D173D', ground: '#3B3360', dirt: '#25203F',
      foes: ['skeleton', 'ghost', 'knight'], boss: 'lich' },
  ];

  // Enemy looks and multipliers. `shape` picks the drawing; hp/atk scale the
  // stage's base numbers.
  const FOES = {
    slime: { name: 'Slime', shape: 'blob', color: '#6ED46B', hp: 0.9, atk: 0.8 },
    boar: { name: 'Boar', shape: 'beast', color: '#9A6B4A', hp: 1.2, atk: 1.0 },
    bee: { name: 'Giant Bee', shape: 'flyer', color: '#F2C531', hp: 0.7, atk: 1.2 },
    kingslime: { name: 'King Slime', shape: 'blob', color: '#3DBE6E', hp: 1, atk: 1, crown: true },
    goblin: { name: 'Goblin', shape: 'imp', color: '#7FA83E', hp: 0.9, atk: 1.1 },
    wolf: { name: 'Dire Wolf', shape: 'beast', color: '#6C7380', hp: 1.0, atk: 1.2 },
    shroom: { name: 'Shroomling', shape: 'shroom', color: '#C8483B', hp: 1.3, atk: 0.7 },
    treant: { name: 'Old Treant', shape: 'golem', color: '#6B4E2E', hp: 1, atk: 1, crown: true },
    scorpion: { name: 'Scorpion', shape: 'beast', color: '#B5652A', hp: 1.0, atk: 1.2 },
    mummy: { name: 'Mummy', shape: 'imp', color: '#E3D6B4', hp: 1.3, atk: 0.8 },
    vulture: { name: 'Vulture', shape: 'flyer', color: '#5B4636', hp: 0.7, atk: 1.2 },
    pharaoh: { name: 'Sand Pharaoh', shape: 'imp', color: '#E2B33C', hp: 1, atk: 1, crown: true },
    yeti: { name: 'Yeti', shape: 'golem', color: '#F2F6FB', hp: 1.4, atk: 0.9 },
    wisp: { name: 'Ice Wisp', shape: 'ghost', color: '#9FE4FF', hp: 0.7, atk: 1.3 },
    penguin: { name: 'War Penguin', shape: 'blob', color: '#2E3644', hp: 1.0, atk: 1.0 },
    frostwyrm: { name: 'Frostwyrm', shape: 'beast', color: '#7EC8F0', hp: 1, atk: 1, crown: true },
    imp: { name: 'Fire Imp', shape: 'imp', color: '#E2462B', hp: 0.8, atk: 1.3 },
    golem: { name: 'Magma Golem', shape: 'golem', color: '#5B3B33', hp: 1.5, atk: 0.8 },
    bat: { name: 'Ember Bat', shape: 'flyer', color: '#4A2A3A', hp: 0.7, atk: 1.1 },
    infernal: { name: 'The Infernal', shape: 'golem', color: '#B8321F', hp: 1, atk: 1, crown: true },
    skeleton: { name: 'Skeleton', shape: 'imp', color: '#E8E4D8', hp: 0.9, atk: 1.1 },
    ghost: { name: 'Ghost', shape: 'ghost', color: '#C9C2FF', hp: 0.8, atk: 1.2 },
    knight: { name: 'Fallen Knight', shape: 'golem', color: '#4B4F63', hp: 1.4, atk: 1.0 },
    lich: { name: 'The Lich King', shape: 'ghost', color: '#7DF0C4', hp: 1, atk: 1, crown: true },
  };

  const STAGES_PER_CHAPTER = 10;
  const chapterOf = (stage) => Math.floor((stage - 1) / STAGES_PER_CHAPTER) + 1;
  const stepOf = (stage) => ((stage - 1) % STAGES_PER_CHAPTER) + 1;
  const isBoss = (stage) => stage % STAGES_PER_CHAPTER === 0;
  const landOf = (stage) => LANDS[(chapterOf(stage) - 1) % LANDS.length];
  const stageLabel = (stage) => chapterOf(stage) + '-' + stepOf(stage);

  // Base numbers for one enemy on a stage.
  const enemyHp = (stage) => 22 * Math.pow(1.24, stage - 1);
  const enemyAtk = (stage) => 3.2 * Math.pow(1.2, stage - 1);
  const goldPerKill = (stage) => 3 * Math.pow(1.16, stage - 1);
  const STAGE_TIME = 45; // seconds before the party has to retreat
  const BOSS_HP = 7;
  const BOSS_ATK = 2.2;

  // The line-up for a stage: 3–4 foes, or a boss with two minions.
  function waveFor(stage) {
    const land = landOf(stage);
    const loop = Math.floor((chapterOf(stage) - 1) / LANDS.length);
    if (isBoss(stage)) {
      return [
        { type: pick(land.foes), hpK: 0.8, atkK: 0.8 },
        { type: land.boss, hpK: BOSS_HP, atkK: BOSS_ATK, boss: true },
        { type: pick(land.foes), hpK: 0.8, atkK: 0.8 },
      ].map((f) => ({ ...f, loop }));
    }
    const n = stepOf(stage) >= 5 ? 4 : 3;
    const out = [];
    for (let i = 0; i < n; i++) {
      const type = pick(land.foes);
      out.push({ type, hpK: FOES[type].hp, atkK: FOES[type].atk, loop });
    }
    return out;
  }

  /* ---------- Camp upgrades (gold) ---------- */

  const CAMP = [
    { id: 'blades', name: 'Whetstone', desc: '+15% attack for every hero', icon: 'sword', base: 60, growth: 1.55, per: 0.15, max: 0 },
    { id: 'armor', name: 'Armoury', desc: '+15% health for every hero', icon: 'shield', base: 60, growth: 1.55, per: 0.15, max: 0 },
    { id: 'drums', name: 'War Drums', desc: '+4% attack speed', icon: 'drum', base: 150, growth: 1.9, per: 0.04, max: 15 },
    { id: 'purse', name: 'Lucky Purse', desc: '+10% gold from battles and AFK', icon: 'coin', base: 100, growth: 1.6, per: 0.1, max: 0 },
    { id: 'banner', name: 'Camp Banner', desc: '+15% AFK loot', icon: 'flag', base: 200, growth: 1.7, per: 0.15, max: 0 },
    { id: 'tome', name: 'Tome of Focus', desc: 'Skills charge 6% faster', icon: 'book', base: 250, growth: 2.0, per: 0.06, max: 10 },
  ];
  const CAMP_BY = Object.fromEntries(CAMP.map((c) => [c.id, c]));
  const campCost = (id, lvl) => Math.ceil(CAMP_BY[id].base * Math.pow(CAMP_BY[id].growth, lvl));

  /* ---------- AFK loot, rebirth ---------- */

  const AFK_CAP = 12 * 3600; // the chest stops filling after 12 hours
  const FAST_REWARD_SECONDS = 2 * 3600;
  const FAST_REWARD_GEMS = 50;
  const SUMMON_GEMS = 100;
  const SUMMON10_GEMS = 900;
  const FREE_SUMMON_EVERY = 22 * 3600;

  // What the AFK chest collects per second, given your best stage.
  function afkRate(best, bonus) {
    const s = Math.max(1, best);
    return {
      gold: goldPerKill(s) * 0.55 * bonus.gold * bonus.afk,
      gems: (1 / 150) * (1 + Math.min(1, s / 200)), // 24–48 an hour
    };
  }

  const REBIRTH_AT = 40;
  // Soul stones from a rebirth after reaching `best` this run.
  const soulsFor = (best) => (best < REBIRTH_AT ? 0 : Math.floor(Math.pow(best - 30, 1.5) / 10));
  const SOUL_BONUS = 0.1; // +10% attack, health and gold each

  /* ---------- Quests ---------- */

  // Each quest line has tiers; finishing a tier pays gems and opens the next.
  const QUESTS = [
    { id: 'stage', label: (n) => 'Clear stage ' + stageLabel(n), stat: 'best', tiers: [5, 10, 20, 30, 40, 60, 80, 100, 150, 200, 300, 400, 500], gems: [50, 80, 120, 150, 200, 250, 300, 400, 500, 600, 800, 1000, 1200] },
    { id: 'kills', label: (n) => 'Defeat ' + fmt(n) + ' foes', stat: 'kills', tiers: [50, 250, 1000, 5000, 20000, 100000, 500000], gems: [40, 80, 120, 200, 300, 500, 800] },
    { id: 'bosses', label: (n) => 'Defeat ' + n + (n === 1 ? ' boss' : ' bosses'), stat: 'bosses', tiers: [1, 5, 10, 25, 50, 100], gems: [60, 100, 150, 250, 400, 600] },
    { id: 'level', label: (n) => 'Raise a hero to level ' + n, stat: 'topLevel', tiers: [10, 25, 50, 75, 100, 150, 200], gems: [40, 80, 120, 200, 300, 400, 600] },
    { id: 'summons', label: (n) => 'Summon ' + n + ' heroes', stat: 'summons', tiers: [1, 10, 30, 75, 150, 300], gems: [30, 80, 150, 250, 400, 600] },
    { id: 'roster', label: (n) => 'Have ' + n + ' different heroes', stat: 'owned', tiers: [4, 6, 8, 10, 12], gems: [60, 100, 160, 250, 500] },
    { id: 'chest', label: (n) => 'Claim the AFK chest ' + n + (n === 1 ? ' time' : ' times'), stat: 'claims', tiers: [1, 5, 15, 40, 100], gems: [30, 60, 100, 160, 250] },
    { id: 'rebirth', label: (n) => 'Rebirth ' + n + (n === 1 ? ' time' : ' times'), stat: 'rebirths', tiers: [1, 3, 5, 10, 20], gems: [200, 300, 400, 600, 1000] },
  ];

  WF.util = { clamp, pick, fmt, fmtTime };
  WF.data = {
    RARITY, ROLE, HEROES, HERO, MAX_STARS, PARTY_SIZE, ascendCost, starMult, levelMult, levelCost, heroStats,
    LANDS, FOES, STAGES_PER_CHAPTER, chapterOf, stepOf, isBoss, landOf, stageLabel,
    enemyHp, enemyAtk, goldPerKill, STAGE_TIME, waveFor,
    CAMP, CAMP_BY, campCost,
    AFK_CAP, FAST_REWARD_SECONDS, FAST_REWARD_GEMS, SUMMON_GEMS, SUMMON10_GEMS, FREE_SUMMON_EVERY, afkRate,
    REBIRTH_AT, soulsFor, SOUL_BONUS, QUESTS,
  };
})(typeof window !== 'undefined' ? (window.WF = window.WF || {}) : (globalThis.WF = globalThis.WF || {}));
