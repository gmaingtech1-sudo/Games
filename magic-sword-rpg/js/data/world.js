// The first area: Ashbrook village (north) and Gloom Meadow (south of the river).
//
// The map is drawn with letters. Every row must be the same length.
//   .  grass          ,  flowers        =  path          g  meadow grass
//   ~  water          b  bridge         T  tree          #  fence
//   R  roof           H  house wall     D  door          X  brambles
// Trees, water, fences, houses and brambles block the way.
//
// Positions of people and things are given in tiles: { x: column, y: row },
// counting from 0 at the top-left corner.

const WORLD = {
  name: 'Ashbrook',

  tiles: {
    '.': { index: 0, solid: false },
    ',': { index: 1, solid: false },
    '=': { index: 2, solid: false },
    '~': { index: 3, solid: true },
    'T': { index: 4, solid: true },
    'R': { index: 5, solid: true },
    'H': { index: 6, solid: true },
    'D': { index: 7, solid: true },
    '#': { index: 8, solid: true },
    'b': { index: 9, solid: false },
    'g': { index: 10, solid: false },
    'X': { index: 11, solid: true },
  },

  map: [
    'TTTTTTTTTTTTTTTTTTTTTTTT', // 0
    'T,....TT...==..TT....,.T', // 1
    'T.RRRR.....==...RRRR...T', // 2
    'T.RRRR.....==...RRRR...T', // 3
    'T.HHDH.....==...HDHH...T', // 4
    'T...=......==....=.....T', // 5
    'T,..===============....T', // 6
    'T..........==..........T', // 7
    'T.,...RRRRR==..........T', // 8
    'T.....RRRRR==....,.....T', // 9
    'T.....HHDHH==...#####..T', // 10
    'T.......=..==...#,,,#..T', // 11
    'T.......=====...#,,,#..T', // 12
    'T...,......==...#,,,#..T', // 13
    'T..........==...##.##..T', // 14
    'TT.....,...==..........T', // 15
    'TTT........==.......TTTT', // 16
    'TTT.......,==........TTT', // 17
    '~~~~~~~~~~~bb~~~~~~~~~~~', // 18
    '~~~~~~~~~~~bb~~~~~~~~~~~', // 19
    'Tgggggggggg==ggggggggggT', // 20
    'TgTgggggggg==ggggggg,ggT', // 21
    'TTTgg,ggggg==gggggggggTT', // 22
    'TTggggggggg==ggggTgggggT', // 23
    'TggggggTggg==ggggggggggT', // 24
    'Tgggg,gTTgg==gggggg,gggT', // 25
    'Tgggggggggg==ggggggggTgT', // 26
    'TggTggggggg==ggggggTTggT', // 27
    'TgTTggggg,g==ggggggggggT', // 28
    'Tgggggggggg==ggg,gggggTT', // 29
    'Tgggggg~~~g==ggggggggggT', // 30
    'Tggggg~~~~g==gggTggggggT', // 31
    'Tgggggg~~gg==ggTTggggg,T', // 32
    'Tg,gggggggg==ggggggggggT', // 33
    'TTgggggTggg==gggggggggTT', // 34
    'TTTgggggggg==ggggggggTTT', // 35
    'TTTTggggggg==gggggggTTTT', // 36
    'TTTTTgggggg==ggggggTTTTT', // 37
    'TTTTTTTTTTTXXTTTTTTTTTTT', // 38
    'TTTTTTTTTTTTTTTTTTTTTTTT', // 39
  ],

  // Where a new game starts, and where Leo wakes up after a defeat.
  start: { x: 11.5, y: 7.5 },

  // Slimes appear on walkable tiles between these rows.
  enemyZone: { enemy: 'gloom_slime', top: 21, bottom: 37 },

  npcs: [
    { id: 'elder', name: 'Elder Maren', texture: 'npc_elder', x: 9, y: 11 },
    { id: 'merchant', name: 'Bram the Merchant', texture: 'npc_merchant', x: 6, y: 5 },
    { id: 'mira', name: 'Mira', texture: 'npc_mira', x: 15, y: 12 },
  ],

  well: { x: 7, y: 7 },

  signs: [
    { x: 10, y: 17, text: 'South: Gloom Meadow.\nBeware of slimes!' },
    { x: 13, y: 37, text: 'Thick brambles block the path into the Enchanted Forest.\n\n(The forest and the Ancient Ruins are coming in the next part of the game.)' },
  ],

  chests: [
    { id: 'village_chest', x: 21, y: 1, contents: { items: { potion: 2 } } },
    { id: 'meadow_chest', x: 2, y: 29, contents: { gold: 40 } },
    { id: 'forest_edge_chest', x: 17, y: 37, contents: { gold: 25, items: { potion: 1 } } },
  ],

  // Mira's pendant, found by the pond while her quest is active.
  pendant: { x: 10, y: 31 },
};
