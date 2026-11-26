/* Emberdeep — the catalogue: heroes, biomes and their monsters, skills,
   relics, Hearth talents, feats and daily rewards. Plain data; the maths that
   turns it into numbers lives in econ.js. */
(function (ED) {
  'use strict';

  /* ---------- Heroes ----------
     cost: price of the first level (hiring). Each further level costs
     COST_GROWTH times the last. dps: damage per second per level, before
     milestones and bonuses. look: how art.js draws them. perks unlock at the
     given level and apply to the whole party. */
  const HEROES = [
    {
      id: 'bram', name: 'Bram', cls: 'Knight', cost: 10, dps: 2.2, rate: 1.1, attack: 'slash',
      blurb: 'A farmhand with his grandfather\'s sword and more courage than sense.',
      look: { kind: 'human', skin: '#F2C29B', body: '#4A6FD0', trim: '#C8D3E8', hat: 'helm', hair: '#7A4A26', weapon: 'sword', shield: true },
      perks: [{ lv: 50, party: 0.25 }, { lv: 150, bossTime: 3 }, { lv: 400, party: 1 }],
    },
    {
      id: 'wren', name: 'Wren', cls: 'Ranger', cost: 120, dps: 13.2, rate: 0.9, attack: 'arrow',
      blurb: 'Can hit a bat in the dark from forty paces. Has, often.',
      look: { kind: 'human', skin: '#D9A27B', body: '#3F8F4E', trim: '#8A5A2E', hat: 'hood', hair: '#C9692B', weapon: 'bow' },
      perks: [{ lv: 50, crit: 0.02 }, { lv: 150, critDmg: 1 }, { lv: 400, crit: 0.03 }],
    },
    {
      id: 'pip', name: 'Pip', cls: 'Pyromancer', cost: 2.5e3, dps: 138, rate: 1.5, attack: 'fireball',
      blurb: 'Singed eyebrows, permanently. Says it was worth it.',
      look: { kind: 'human', skin: '#F5CFA8', body: '#C2412D', trim: '#F5B33D', hat: 'wizard', hair: '#F2E3C4', weapon: 'staff', orb: '#FF7A2E' },
      perks: [{ lv: 50, party: 0.3 }, { lv: 150, boss: 0.5 }, { lv: 400, party: 1 }],
    },
    {
      id: 'maud', name: 'Sister Maud', cls: 'Cleric', cost: 6e4, dps: 1.65e3, rate: 1.7, attack: 'smite',
      blurb: 'Blesses the party, then hits things with a very holy mace.',
      look: { kind: 'human', skin: '#C98E68', body: '#F1EBDD', trim: '#E8B547', hat: 'veil', hair: '#3B2A22', weapon: 'mace' },
      perks: [{ lv: 50, party: 0.4 }, { lv: 150, party: 0.6 }, { lv: 400, party: 1.5 }],
    },
    {
      id: 'kit', name: 'Kit', cls: 'Rogue', cost: 2e6, dps: 2.75e4, rate: 0.55, attack: 'daggers',
      blurb: 'Fast hands. Faster hands near treasure.',
      look: { kind: 'human', skin: '#EAB892', body: '#3A3550', trim: '#9E3D5B', hat: 'mask', hair: '#1E1B24', weapon: 'daggers' },
      perks: [{ lv: 50, gold: 0.25 }, { lv: 150, gold: 0.5 }, { lv: 400, gold: 1 }],
    },
    {
      id: 'granite', name: 'Granite', cls: 'Stonewarden', cost: 3e8, dps: 2.06e6, rate: 2.1, attack: 'slam',
      blurb: 'Woke up under the mountain three centuries ago. Still a little grumpy about it.',
      look: { kind: 'golem', body: '#8C8478', trim: '#5FE3C0' },
      perks: [{ lv: 50, boss: 0.5 }, { lv: 150, bossTime: 3 }, { lv: 400, boss: 1 }],
    },
    {
      id: 'lyra', name: 'Lyra', cls: 'Bard', cost: 1.5e11, dps: 5.16e8, rate: 1.25, attack: 'notes',
      blurb: 'Her songs make swords swing faster and goblins cry.',
      look: { kind: 'human', skin: '#F2C7A5', body: '#7B4FC9', trim: '#F5D06B', hat: 'feather', hair: '#E8A23A', weapon: 'lute' },
      perks: [{ lv: 50, tap: 1 }, { lv: 150, tapShare: 0.02 }, { lv: 400, party: 1 }],
    },
    {
      id: 'vesper', name: 'Vesper', cls: 'Warlock', cost: 3e14, dps: 5.16e11, rate: 1.35, attack: 'void',
      blurb: 'Made a deal with something in the dark. Won\'t say what it wanted.',
      look: { kind: 'human', skin: '#B9A6D6', body: '#2A1F45', trim: '#B86BFF', hat: 'horns', hair: '#E9E4F7', weapon: 'staff', orb: '#B86BFF' },
      perks: [{ lv: 50, critDmg: 1 }, { lv: 150, party: 0.75 }, { lv: 400, critDmg: 2 }],
    },
    {
      id: 'thorne', name: 'Thorne', cls: 'Druid', cost: 5e18, dps: 4.3e15, rate: 1.6, attack: 'thorns',
      blurb: 'Talks to roots. The roots, apparently, talk back.',
      look: { kind: 'human', skin: '#A8744F', body: '#5B7A2E', trim: '#B5D96B', hat: 'antlers', hair: '#6B4B2A', weapon: 'staff', orb: '#9BE36B' },
      perks: [{ lv: 50, gold: 0.4 }, { lv: 150, party: 0.75 }, { lv: 400, gold: 1 }],
    },
    {
      id: 'cinder', name: 'Cinder', cls: 'Dragonling', cost: 2e23, dps: 8.59e19, rate: 1.9, attack: 'breath',
      blurb: 'Hatched from an ember the party found in the Magma Forge. Thinks Bram is its mum.',
      look: { kind: 'dragon', body: '#E2553A', trim: '#FFD166' },
      perks: [{ lv: 50, party: 0.5 }, { lv: 150, boss: 1 }, { lv: 400, party: 2 }],
    },
    {
      id: 'auriel', name: 'Auriel', cls: 'Valkyrie', cost: 5e29, dps: 1.07e26, rate: 1.2, attack: 'spear',
      blurb: 'Came down from the sky to see what all the noise was.',
      look: { kind: 'human', skin: '#F3D2B5', body: '#DDE6F5', trim: '#FFC94A', hat: 'wings', hair: '#FFF1C2', weapon: 'spear' },
      perks: [{ lv: 50, crit: 0.03 }, { lv: 150, party: 1 }, { lv: 400, party: 2 }],
    },
    {
      id: 'echo', name: 'Echo', cls: 'Phantom Knight', cost: 1e38, dps: 1.07e34, rate: 1.45, attack: 'phantom',
      blurb: 'A knight who delved too deep, long ago. Fights for you now, mostly.',
      look: { kind: 'human', skin: '#9FE8E0', body: '#28465A', trim: '#7CF5E6', hat: 'helm', hair: '#7CF5E6', weapon: 'sword', ghost: true },
      perks: [{ lv: 50, party: 1 }, { lv: 150, gold: 1 }, { lv: 400, party: 3 }],
    },
  ];

  /* ---------- Biomes ----------
     Twenty-five floors each. The eight repeat in deeper, stranger shades:
     floor 201 is Mossglow Caverns II. Floor 25 of each is its Guardian. */
  const BIOMES = [
    {
      id: 'moss', name: 'Mossglow Caverns', sky: ['#0E2A24', '#06130F'], rock: '#1E3B30', rock2: '#2C5242', glow: '#7CFFB2', floor: '#24402F',
      deco: 'moss', mote: '#B6FFCF', music: [0, 3, 7, 10],
      mobs: [['slime', 'Moss Slime', '#6BD98A'], ['bat', 'Cave Bat', '#6D5C8F'], ['beetle', 'Shellback', '#5D8C4A'], ['mushroom', 'Glowcap', '#E06B4F']],
      boss: ['Old Mossback', 'Grumbleshell', 'The Squelch', 'Bat Matriarch'], guardian: ['The Moss King', 'slime'],
    },
    {
      id: 'fungus', name: 'Sporelight Grotto', sky: ['#24123A', '#0D0618'], rock: '#3A1F4F', rock2: '#55306E', glow: '#FF7AE0', floor: '#3A2148',
      deco: 'shrooms', mote: '#FFC2F0', music: [0, 2, 3, 7],
      mobs: [['mushroom', 'Sporeling', '#C96BFF'], ['spider', 'Silk Creeper', '#8A6BB8'], ['slime', 'Jelly Mold', '#FF8AD8'], ['bat', 'Dusk Flitter', '#5C4A8F']],
      boss: ['Puffmother', 'Weaver of Threads', 'Gloomcap Elder', 'The Bloom'], guardian: ['Mother Sporecap', 'mushroom'],
    },
    {
      id: 'crystal', name: 'Crystal Hollows', sky: ['#0B2342', '#050D1C'], rock: '#1B3558', rock2: '#28507E', glow: '#6FE8FF', floor: '#1D3150',
      deco: 'crystals', mote: '#D6F8FF', music: [0, 4, 7, 11],
      mobs: [['golem', 'Shardling', '#7FD8F5'], ['eye', 'Prism Eye', '#B6A6FF'], ['beetle', 'Geode Beetle', '#4F8FD9'], ['bat', 'Glass Wing', '#9BC9FF']],
      boss: ['Facet', 'The Refractor', 'Quartzjaw', 'Lumen Tyrant'], guardian: ['Prism Colossus', 'golem'],
    },
    {
      id: 'ruins', name: 'Sunken Ruins', sky: ['#0A2E33', '#041416'], rock: '#1A4448', rock2: '#2A5F63', glow: '#5FFFE0', floor: '#1E3F3D',
      deco: 'pillars', mote: '#9FFFF0', music: [0, 3, 5, 10],
      mobs: [['crab', 'Ruin Crab', '#E07B5B'], ['jelly', 'Drift Jelly', '#8FE8FF'], ['serpent', 'Bog Eel', '#4F9F8F'], ['skeleton', 'Drowned Guard', '#C9D6C9']],
      boss: ['Old Pincers', 'The Tidewight', 'Coil of the Deep', 'Captain Barnacle'], guardian: ['The Drowned Warden', 'skeleton'],
    },
    {
      id: 'magma', name: 'Magma Forge', sky: ['#3A0E08', '#140402'], rock: '#4A1A10', rock2: '#6E2A14', glow: '#FF9B3D', floor: '#3E1A0E',
      deco: 'lava', mote: '#FFC46B', music: [0, 1, 5, 7],
      mobs: [['imp', 'Cinder Imp', '#FF6A3D'], ['golem', 'Slag Brute', '#A3503A'], ['slime', 'Lava Ooze', '#FF9B3D'], ['serpent', 'Salamander', '#FF4F2E']],
      boss: ['Bellows', 'The Anvil', 'Smoulder', 'Ashmaw'], guardian: ['Forgeheart', 'golem'],
    },
    {
      id: 'frost', name: 'Frostdeep', sky: ['#13284A', '#070F1E'], rock: '#2A4468', rock2: '#3F6394', glow: '#BFE8FF', floor: '#2C4566',
      deco: 'ice', mote: '#FFFFFF', music: [0, 2, 7, 9],
      mobs: [['ghost', 'Rime Wraith', '#CFEFFF'], ['golem', 'Ice Hulk', '#8FC8F0'], ['bat', 'Frost Flitter', '#7FA8D9'], ['jelly', 'Snow Jelly', '#E8F6FF']],
      boss: ['Hailbringer', 'The Glacier', 'Whiteout', 'Old Shiver'], guardian: ['The Pale Queen', 'ghost'],
    },
    {
      id: 'bone', name: 'Bone Catacombs', sky: ['#2A2230', '#0E0B12'], rock: '#3D3442', rock2: '#574B5C', glow: '#E8D59B', floor: '#3A3138',
      deco: 'bones', mote: '#F2E6C2', music: [0, 1, 3, 8],
      mobs: [['skeleton', 'Rattlebones', '#E8DFC9'], ['ghost', 'Lantern Shade', '#C8B8FF'], ['serpent', 'Grave Worm', '#B59A8A'], ['spider', 'Crypt Crawler', '#6E5F72']],
      boss: ['Sexton', 'The Ossifier', 'Mournwail', 'Grinning Jack'], guardian: ['The Ossuary Lord', 'skeleton'],
    },
    {
      id: 'void', name: 'The Hollow Dark', sky: ['#120A2E', '#030108'], rock: '#1E1442', rock2: '#2E1F5E', glow: '#B07CFF', floor: '#1A1238',
      deco: 'void', mote: '#E0CCFF', music: [0, 3, 6, 10],
      mobs: [['eye', 'Watcher', '#B07CFF'], ['jelly', 'Void Drifter', '#7C5CFF'], ['ghost', 'Hollow One', '#5E4AA8'], ['serpent', 'Star Eater', '#9B6BFF']],
      boss: ['Unblinking', 'The Quiet', 'Nullmaw', 'What Waits'], guardian: ['The Hollow Eye', 'eye'],
    },
  ];
  const FLOORS_PER_BIOME = 25;

  /* ---------- Skills ----------
     Tap to use. floor: deepest floor (ever) that unlocks it. dur and cd in
     seconds. */
  const SKILLS = [
    { id: 'cry', name: 'Battle Cry', short: 'Heroes ×2 damage', desc: 'Your heroes deal double damage for 30 seconds.', floor: 8, dur: 30, cd: 600, color: '#FF6A4D' },
    { id: 'midas', name: 'Golden Hour', short: '×3 gold', desc: 'Every coin is worth three for 30 seconds.', floor: 15, dur: 30, cd: 720, color: '#FFC94A' },
    { id: 'flurry', name: 'Flurry', short: '12 strikes / s', desc: 'Your torch strikes 12 times a second on its own for 20 seconds.', floor: 25, dur: 20, cd: 600, color: '#6FE8FF' },
    { id: 'star', name: 'Starfall', short: '2 min of damage', desc: 'Call down a falling star that deals two minutes of your party\'s damage at once.', floor: 40, dur: 0, cd: 900, color: '#B07CFF' },
    { id: 'glass', name: 'Hourglass', short: 'Skip 30 min', desc: 'Your heroes live through 30 minutes of AFK progress in an instant.', floor: 70, dur: 0, cd: 14400, color: '#7CFFB2' },
  ];

  /* ---------- Relics ----------
     Found in chests. Kept forever. A duplicate raises the relic a level.
     per: bonus per level, of the effect named by fx (see econ.js). */
  const RARITY = {
    common: { name: 'Common', color: '#B8C2D9', weight: 56 },
    rare: { name: 'Rare', color: '#5FB8FF', weight: 30 },
    epic: { name: 'Epic', color: '#C77CFF', weight: 11 },
    legendary: { name: 'Legendary', color: '#FFB443', weight: 3 },
  };
  const RELIC_MAX = 25;
  const RELICS = [
    { id: 'pick', name: 'Rusty Pick', rarity: 'common', icon: 'pick', color: '#C98A5B', fx: 'gold', per: 0.2 },
    { id: 'boots', name: 'Worn Boots', rarity: 'common', icon: 'boots', color: '#9B6B44', fx: 'heroDps', per: 0.2 },
    { id: 'candle', name: 'Stub Candle', rarity: 'common', icon: 'candle', color: '#F2E3B8', fx: 'tap', per: 0.4 },
    { id: 'coin', name: 'Lucky Coin', rarity: 'common', icon: 'coin', color: '#FFC94A', fx: 'crit', per: 0.005 },
    { id: 'flask', name: 'Murky Flask', rarity: 'common', icon: 'flask', color: '#7FBF6B', fx: 'offlineH', per: 0.5 },
    { id: 'horn', name: 'Cracked Horn', rarity: 'common', icon: 'horn', color: '#E3D3B0', fx: 'bossTime', per: 0.5 },
    { id: 'whet', name: 'Whetstone', rarity: 'rare', icon: 'stone', color: '#8FA3B8', fx: 'heroDps', per: 0.4 },
    { id: 'lamp', name: 'Miner\'s Lamp', rarity: 'rare', icon: 'lamp', color: '#FFB443', fx: 'chest', per: 0.004 },
    { id: 'dice', name: 'Bone Dice', rarity: 'rare', icon: 'dice', color: '#F2EBDD', fx: 'critDmg', per: 0.4 },
    { id: 'bell', name: 'Silver Bell', rarity: 'rare', icon: 'bell', color: '#D9E3F0', fx: 'wisp', per: 0.06 },
    { id: 'fang', name: 'Hunter\'s Fang', rarity: 'rare', icon: 'fang', color: '#F2EBDD', fx: 'boss', per: 0.3 },
    { id: 'purse', name: 'Glowmoss Purse', rarity: 'rare', icon: 'purse', color: '#5FD98A', fx: 'gold', per: 0.4 },
    { id: 'quill', name: 'Bard\'s Quill', rarity: 'rare', icon: 'quill', color: '#F5D06B', fx: 'skillDur', per: 0.05 },
    { id: 'scale', name: 'Dragon Scale', rarity: 'epic', icon: 'scale', color: '#E2553A', fx: 'heroDps', per: 0.8 },
    { id: 'sand', name: 'Hourglass Sand', rarity: 'epic', icon: 'hourglass', color: '#F2D28B', fx: 'cdr', per: 0.02 },
    { id: 'crown', name: 'Delver\'s Crown', rarity: 'epic', icon: 'crown', color: '#FFC94A', fx: 'ember', per: 0.05 },
    { id: 'map', name: 'Starlit Map', rarity: 'epic', icon: 'map', color: '#8FB8FF', fx: 'leap', per: 0.015 },
    { id: 'hand', name: 'Phantom Gauntlet', rarity: 'epic', icon: 'gauntlet', color: '#7CF5E6', fx: 'autoTap', per: 1 },
    { id: 'idol', name: 'Gilded Idol', rarity: 'epic', icon: 'idol', color: '#FFC94A', fx: 'gold', per: 0.8 },
    { id: 'lens', name: 'Seer\'s Lens', rarity: 'epic', icon: 'lens', color: '#B6A6FF', fx: 'tapShare', per: 0.005 },
    { id: 'heart', name: 'Heart of the Mountain', rarity: 'legendary', icon: 'heart', color: '#FF6A3D', fx: 'allDmg', per: 0.5 },
    { id: 'eye', name: 'Eye of the Deep', rarity: 'legendary', icon: 'eye', color: '#B07CFF', fx: 'ember', per: 0.1 },
    { id: 'dream', name: 'Dreamcatcher', rarity: 'legendary', icon: 'dream', color: '#7CFFB2', fx: 'afk', per: 0.25 },
    { id: 'sun', name: 'Pocket Sun', rarity: 'legendary', icon: 'sun', color: '#FFD166', fx: 'heroDps', per: 1.5 },
  ];

  /* ---------- Hearth talents ----------
     Bought with embers. cost(level) = base + step × level (or the fixed list
     in costs). per: effect per level, of the effect named by fx; a talent
     with mult instead multiplies by that much per level. */
  const BRANCHES = [
    { id: 'might', name: 'Might', color: '#FF6A4D' },
    { id: 'fortune', name: 'Fortune', color: '#FFC94A' },
    { id: 'time', name: 'Time', color: '#7CFFB2' },
    { id: 'delve', name: 'Delving', color: '#8FB8FF' },
  ];
  const TALENTS = [
    { id: 'blades', branch: 'might', name: 'Kindled Blades', mult: 1.25, max: 2000, base: 1, step: 1, text: (v, lv) => `×${ED.util.fmt(Math.pow(1.25, lv))} damage (×1.25 a level)` },
    { id: 'focus', branch: 'might', name: 'Steady Hand', fx: 'crit', per: 0.015, max: 10, base: 2, step: 2, text: (v) => `+${pct(v, 1)} critical chance` },
    { id: 'ruin', branch: 'might', name: 'Ruinous Crits', fx: 'critDmg', per: 1, max: 15, base: 2, step: 2, text: (v) => `+×${v} critical damage` },
    { id: 'slayer', branch: 'might', name: 'Giant Slayer', fx: 'boss', per: 0.4, max: 25, base: 3, step: 2, text: (v) => `+${pct(v)} damage to bosses` },
    { id: 'brand', branch: 'might', name: 'Emberbrand', fx: 'tapShare', per: 0.01, max: 10, base: 2, step: 2, text: (v) => `Taps also deal ${pct(v)} of party DPS` },
    { id: 'greed', branch: 'fortune', name: 'Prospector', mult: 1.25, max: 2000, base: 1, step: 1, text: (v, lv) => `×${ED.util.fmt(Math.pow(1.25, lv))} gold (×1.25 a level)` },
    { id: 'purse', branch: 'fortune', name: 'Starting Purse', fx: 'startGold', per: 1, max: 20, base: 2, step: 1, text: (v) => (v ? `Start each run with floor ${v * 5}'s worth of gold` : 'Start each run with some gold') },
    { id: 'sense', branch: 'fortune', name: 'Treasure Sense', fx: 'chest', per: 0.01, max: 10, base: 3, step: 2, text: (v) => `+${pct(v)} chest chance from bosses` },
    { id: 'whistle', branch: 'fortune', name: 'Wisp Whistle', fx: 'wisp', per: 0.2, max: 5, base: 2, step: 2, text: (v) => `Wisps appear ${pct(v)} more often` },
    { id: 'harvest', branch: 'fortune', name: 'Ember Harvest', fx: 'ember', per: 0.1, max: 25, base: 5, step: 3, text: (v) => `+${pct(v)} embers when you rekindle` },
    { id: 'quarter', branch: 'time', name: 'Quartermaster', fx: 'autoBuy', per: 1, max: 1, base: 1, step: 0, text: () => 'Levels your heroes for you, even while you\'re away' },
    { id: 'vigil', branch: 'time', name: 'Long Vigil', fx: 'offlineH', per: 2, max: 12, base: 2, step: 2, text: (v) => `Heroes keep delving ${v}h longer while you're away` },
    { id: 'dream', branch: 'time', name: 'Lucid Dreams', fx: 'afk', per: 0.1, max: 20, base: 3, step: 2, text: (v) => `+${pct(v)} damage and gold while you're away` },
    { id: 'echoes', branch: 'time', name: 'Echoing Skills', fx: 'autoCast', per: 1, max: 5, base: 4, step: 4, text: (v) => (v ? `Casts your first ${v} skill${v > 1 ? 's' : ''} by itself` : 'Casts skills by itself') },
    { id: 'patience', branch: 'time', name: 'Patience', fx: 'bossTime', per: 2, max: 10, base: 2, step: 1, text: (v) => `+${v}s to beat each boss` },
    { id: 'sands', branch: 'time', name: 'Deep Hourglass', fx: 'glass', per: 600, max: 9, base: 4, step: 2, text: (v) => `Hourglass skips ${30 + v / 60} minutes` },
    { id: 'lift', branch: 'delve', name: 'Lift Shaft', fx: 'lift', per: 10, max: 40, base: 3, step: 1, text: (v) => `Start each run on floor ${v + 1} (at most half your deepest)` },
    { id: 'short', branch: 'delve', name: 'Shortcut', fx: 'mobs', per: 1, max: 3, costs: [10, 25, 60], text: (v) => `${v} fewer monster${v === 1 ? '' : 's'} per floor` },
    { id: 'leap', branch: 'delve', name: 'Bottomless Leap', fx: 'leap', per: 0.04, max: 5, base: 5, step: 5, text: (v) => `${pct(v)} chance to drop straight past a floor` },
    { id: 'swift', branch: 'delve', name: 'Swift Feet', fx: 'swift', per: 0.1, max: 5, base: 3, step: 3, text: (v) => `Monsters arrive ${pct(v)} faster` },
  ];

  function pct(v, digits) {
    const p = v * 100;
    return (digits ? p.toFixed(digits).replace(/\.0$/, '') : ED.util.fmt(Math.round(p))) + '%';
  }

  /* ---------- Feats ----------
     Milestones that pay out moonstones, one tier at a time. stat names a
     key in econ.featValue(). */
  const FEATS = [
    { id: 'depth', name: 'Delver', what: 'Reach floor', stat: 'bestFloor', tiers: [10, 25, 50, 75, 100, 150, 200, 300, 400, 500, 750, 1000, 1500, 2000, 3000, 4000, 5000] },
    { id: 'hunter', name: 'Monster Hunter', what: 'Defeat monsters', stat: 'kills', tiers: [100, 1e3, 1e4, 5e4, 2e5, 1e6, 5e6, 2e7, 1e8] },
    { id: 'bossbane', name: 'Bossbane', what: 'Defeat bosses', stat: 'bosses', tiers: [5, 25, 100, 250, 1000, 2500, 10000, 25000] },
    { id: 'hands', name: 'Busy Hands', what: 'Strike with your torch', stat: 'taps', tiers: [100, 1e3, 1e4, 5e4, 2.5e5, 1e6] },
    { id: 'lucky', name: 'Lucky Strikes', what: 'Land critical hits', stat: 'crits', tiers: [50, 500, 5e3, 5e4, 5e5] },
    { id: 'hoard', name: 'Hoarder', what: 'Earn gold in total', stat: 'goldTotal', tiers: [1e3, 1e6, 1e9, 1e12, 1e15, 1e20, 1e25, 1e30, 1e40, 1e50, 1e60, 1e80, 1e100, 1e130, 1e160, 1e200, 1e250] },
    { id: 'keeper', name: 'Hearthkeeper', what: 'Rekindle the Hearth', stat: 'rekindles', tiers: [1, 3, 10, 25, 50, 100, 250] },
    { id: 'fire', name: 'Firestarter', what: 'Earn embers in total', stat: 'embersTotal', tiers: [10, 100, 1e3, 1e4, 1e5, 1e6] },
    { id: 'curator', name: 'Curator', what: 'Find different relics', stat: 'relicKinds', tiers: [3, 6, 10, 15, 20, 24] },
    { id: 'mentor', name: 'Mentor', what: 'Hero levels in one run', stat: 'levels', tiers: [100, 500, 1000, 2000, 4000, 8000, 15000] },
    { id: 'party', name: 'Full Party', what: 'Heroes hired in one run', stat: 'hired', tiers: [3, 6, 9, 12] },
    { id: 'wisps', name: 'Wisp Catcher', what: 'Catch wisps', stat: 'wisps', tiers: [5, 25, 100, 300, 1000] },
    { id: 'sleep', name: 'Sleepwalker', what: 'Hours delved while away', stat: 'afkHours', tiers: [1, 10, 72, 240, 720, 2400] },
  ];
  const featReward = (tier) => Math.min(60, 10 + tier * 5);

  /* ---------- Daily rewards ----------
     One a day; the week loops. Missing a day doesn't reset anything. */
  const DAILY = [
    { kind: 'moon', n: 15, label: '15 moonstones' },
    { kind: 'gold', n: 10, label: '10 minutes of gold' },
    { kind: 'moon', n: 25, label: '25 moonstones' },
    { kind: 'time', n: 3600, label: '1 hour of AFK progress' },
    { kind: 'moon', n: 35, label: '35 moonstones' },
    { kind: 'gold', n: 30, label: '30 minutes of gold' },
    { kind: 'chest', n: 1, label: 'A relic chest' },
  ];

  /* ---------- Moonstone shop ---------- */
  const SHOP = [
    { id: 'chest', name: 'Relic Chest', desc: 'A random relic for your collection.', cost: 120 },
    { id: 'flask', name: 'Time Flask', desc: 'Two hours of AFK progress, right now.', cost: 50 },
    { id: 'banner', name: 'Gilded Banner', desc: 'Double gold for one hour, even while you\'re away.', cost: 40 },
    { id: 'refresh', name: 'Second Wind', desc: 'Every skill ready to use again.', cost: 15 },
  ];

  ED.data = {
    HEROES, BIOMES, FLOORS_PER_BIOME, SKILLS, RARITY, RELICS, RELIC_MAX, BRANCHES, TALENTS,
    FEATS, featReward, DAILY, SHOP, pct,
    hero: (id) => HEROES.find((h) => h.id === id),
    relic: (id) => RELICS.find((r) => r.id === id),
    talent: (id) => TALENTS.find((t) => t.id === id),
    skill: (id) => SKILLS.find((s) => s.id === id),
  };
})(typeof window !== 'undefined' ? (window.ED = window.ED || {}) : (globalThis.ED = globalThis.ED || {}));
