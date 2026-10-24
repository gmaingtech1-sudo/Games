// Swords. Change `damage` to rebalance. `ability` is what the sword does
// on top of its damage; the battle code reads `ability.type`:
//   slow   — `chance` to slow the enemy, so it loses its next turn
//   burn   — `chance` to set the enemy on fire for `damage` a turn, `turns` turns
//   awaken — grows with Leo's level: +`bonusPerLevel` damage per level, and a
//            `doubleChancePerLevel` chance per level (up to `maxDoubleChance`)
//            to strike twice

const WEAPONS = {
  iron_sword: {
    name: 'Iron Sword',
    damage: 10,
    blade: '#c9d3dc',
    glow: null,
    description: 'A plain, honest blade from the Ashbrook forge.',
    ability: null,
  },
  frostbite: {
    name: 'Frostbite',
    damage: 25,
    blade: '#9ee8ff',
    glow: '#5fd0ff',
    description: 'Cold to the touch, even in summer.',
    ability: { type: 'slow', chance: 0.3, text: '30% chance to slow the enemy, so it loses its next turn.' },
  },
  sunfire: {
    name: 'Sunfire',
    damage: 60,
    blade: '#ffcf6b',
    glow: '#ff8a3d',
    description: 'Forged in the heart of a falling star.',
    ability: { type: 'burn', chance: 0.35, damage: 12, turns: 3, text: '35% chance to set the enemy on fire: 12 damage a turn for 3 turns.' },
  },
  magic_sword: {
    name: 'The Magic Sword',
    damage: 100,
    blade: '#7cc8ff',
    glow: '#3f8cff',
    description: "Grandfather's sword. Ancient magic sleeps inside it.",
    ability: {
      type: 'awaken', bonusPerLevel: 5, doubleChancePerLevel: 0.03, maxDoubleChance: 0.5,
      text: 'Ancient Echo: +5 damage per level, and a 3% chance per level to strike twice.',
    },
  },
};
