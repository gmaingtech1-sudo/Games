// The skill tree. Each skill costs 1 skill point. Leo gets points by levelling up.
// `requires` is a skill you must learn first; `minLevel` is the level you need.
// `effect` is read by State.stats():
//   attackBonus, critChance, magicBonus, magicBurn {damage, turns},
//   magicSlowChance, magicCostReduce, maxHpBonus, damageReduction

const SKILL_BRANCHES = [
  { id: 'sword', name: 'Sword', color: 0xdfe8ff },
  { id: 'fire', name: 'Fire', color: 0xff8a3d },
  { id: 'ice', name: 'Ice', color: 0x7fe0ff },
  { id: 'defence', name: 'Defence', color: 0x8ce08a },
];

const SKILLS = {
  sword_1: {
    branch: 'sword', tier: 1, name: 'Blade Training',
    text: '+4 sword damage.',
    effect: { attackBonus: 4 },
  },
  sword_2: {
    branch: 'sword', tier: 2, name: 'Keen Edge', requires: 'sword_1', minLevel: 3,
    text: '15% chance of a critical hit for double damage.',
    effect: { critChance: 0.15 },
  },
  fire_1: {
    branch: 'fire', tier: 1, name: 'Ember Spell',
    text: 'Magic deals +8 fire damage.',
    effect: { magicBonus: 8 },
  },
  fire_2: {
    branch: 'fire', tier: 2, name: 'Kindle', requires: 'fire_1', minLevel: 3,
    text: 'Magic sets the enemy on fire: 5 damage a turn for 3 turns.',
    effect: { magicBurn: { damage: 5, turns: 3 } },
  },
  ice_1: {
    branch: 'ice', tier: 1, name: 'Frost Touch',
    text: 'Magic has a 30% chance to slow the enemy.',
    effect: { magicSlowChance: 0.3 },
  },
  ice_2: {
    branch: 'ice', tier: 2, name: 'Cold Focus', requires: 'ice_1', minLevel: 3,
    text: 'Spells cost 4 less magic.',
    effect: { magicCostReduce: 4 },
  },
  defence_1: {
    branch: 'defence', tier: 1, name: 'Tough Skin',
    text: '+20 max health.',
    effect: { maxHpBonus: 20 },
  },
  defence_2: {
    branch: 'defence', tier: 2, name: 'Guard Stance', requires: 'defence_1', minLevel: 3,
    text: 'Take 20% less damage.',
    effect: { damageReduction: 0.2 },
  },
};
