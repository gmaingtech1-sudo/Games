// Quests. `goal` is either
//   { type: 'defeat', enemy: <enemy id>, count: n }
//   { type: 'collect', item: <item id> }
// `reward` can have xp, gold, items { id: count } and weapon (a sword id).

const QUESTS = {
  slime_trouble: {
    name: 'Slime Trouble',
    giver: 'elder',
    hint: 'Elder Maren in Ashbrook needs help.',
    description: 'Gloom Slimes are creeping out of the meadow south of the river. Defeat 3 of them, then return to Elder Maren.',
    goal: { type: 'defeat', enemy: 'gloom_slime', count: 3 },
    reward: { xp: 50, gold: 40, weapon: 'frostbite' },
  },
  lost_pendant: {
    name: 'The Lost Pendant',
    giver: 'mira',
    hint: 'Mira, by the garden, looks worried.',
    description: "Mira lost her mother's pendant near the pond in the meadow. Find it and bring it back to her.",
    goal: { type: 'collect', item: 'pendant' },
    reward: { xp: 30, gold: 25, items: { potion: 2 } },
  },
};
