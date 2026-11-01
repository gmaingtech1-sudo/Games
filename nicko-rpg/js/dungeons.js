// Locations on the world map. Each has a level range, an encounter table,
// unlock requirements and (where appropriate) a resident boss.

import { BOSSES } from './bosses.js';

export const DUNGEONS = [
  { id: 'whisperingWoods', name: 'Whispering Woods', minLevel: 1, maxLevel: 6, rec: 1,
    desc: 'Mossy trees that murmur in the wind. Slimes and wolves prowl the paths, and goblins raid travellers.',
    unlock: {}, encounters: [{ enemy: 'slime', w: 40 }, { enemy: 'wolf', w: 30 }, { enemy: 'goblin', w: 30 }],
    treasure: ['smallHealthPotion', 'manaPotion', 'copperRing', 'woodenCharm'], color: '#2f6b3a', glyph: '🌲' },
  { id: 'goblinCaves', name: 'Goblin Caves', minLevel: 3, maxLevel: 9, rec: 4,
    desc: 'Damp tunnels stinking of goblin. Their king holds court in the deepest cavern.',
    unlock: { level: 3 }, encounters: [{ enemy: 'goblin', w: 45 }, { enemy: 'goblinShaman', w: 25 }, { enemy: 'slime', w: 15 }, { enemy: 'wolf', w: 15 }],
    treasure: ['smallHealthPotion', 'antidote', 'leatherBoots', 'ironHelm'], boss: 'goblinKing', color: '#5a4a2a', glyph: '⛰' },
  { id: 'forgottenCrypt', name: 'Forgotten Crypt', minLevel: 7, maxLevel: 14, rec: 8,
    desc: 'An ancient dungeon of tombs beneath the old chapel. The dead do not rest here.',
    unlock: { boss: 'goblinKing' }, encounters: [{ enemy: 'skeleton', w: 45 }, { enemy: 'wraith', w: 30 }, { enemy: 'darkMage', w: 25 }],
    treasure: ['largeHealthPotion', 'manaPotion', 'ringOfVigor', 'swiftBoots'], boss: 'boneReaper', color: '#4b4458', glyph: '⚰' },
  { id: 'spiderNest', name: 'Spider Nest', minLevel: 12, maxLevel: 19, rec: 13,
    desc: 'A forest swallowed by webs. Things wrapped in silk twitch in the branches.',
    unlock: { boss: 'boneReaper' }, encounters: [{ enemy: 'giantSpider', w: 60 }, { enemy: 'wolf', w: 20 }, { enemy: 'goblinShaman', w: 20 }],
    treasure: ['antidote', 'largeHealthPotion', 'ringOfPrecision', 'steelHelm'], boss: 'spiderQueen', color: '#3a2a4a', glyph: '🕸' },
  { id: 'cursedFortress', name: 'Cursed Fortress', minLevel: 17, maxLevel: 24, rec: 18,
    desc: 'A black citadel where cursed soldiers still man the walls after a thousand years.',
    unlock: { boss: 'spiderQueen' }, encounters: [{ enemy: 'orcWarrior', w: 40 }, { enemy: 'skeleton', w: 30 }, { enemy: 'darkMage', w: 30 }],
    treasure: ['largeHealthPotion', 'greaterManaPotion', 'amuletOfFury', 'shadowTreads'], boss: 'cursedWarlord', color: '#3d2323', glyph: '🏰' },
  { id: 'frozenCaverns', name: 'Frozen Caverns', minLevel: 22, maxLevel: 29, rec: 23,
    desc: 'Glittering ice tunnels. Something deep below is bleeding shadow into the frost.',
    unlock: { boss: 'cursedWarlord' }, encounters: [{ enemy: 'frostWolf', w: 30 }, { enemy: 'iceGolem', w: 25 }, { enemy: 'frostTroll', w: 25 }, { enemy: 'wraith', w: 20 }],
    treasure: ['regenTonic', 'greaterManaPotion', 'frostweave', 'arcaneRing'], boss: 'shadowSorcerer', color: '#2a4f66', glyph: '❄' },
  { id: 'dragonsLair', name: "Dragon's Lair", minLevel: 27, maxLevel: 36, rec: 28,
    desc: 'A volcano hollowed by ages of dragonfire. Cultists guard the hoard of the Ancient Dragon.',
    unlock: { boss: 'shadowSorcerer', level: 27 }, encounters: [{ enemy: 'dragon', w: 35 }, { enemy: 'dragonCultist', w: 35 }, { enemy: 'troll', w: 30 }],
    treasure: ['elixir', 'regenTonic', 'runeplate', 'windwalkers'], boss: 'ancientDragon', color: '#6b1d12', glyph: '🐉' },
  { id: 'shadowRealm', name: 'Shadow Realm', minLevel: 31, maxLevel: 40, rec: 32,
    desc: 'The world behind the rift. Colours are wrong and the ground whispers your name.',
    unlock: { boss: 'ancientDragon' }, encounters: [{ enemy: 'shadowFiend', w: 40 }, { enemy: 'voidStalker', w: 35 }, { enemy: 'wraith', w: 25 }],
    treasure: ['elixir', 'amuletOfSages', 'dragonboneHelm', 'tempestBoots'], boss: 'voidHerald', color: '#26123d', glyph: '🌑' },
  { id: 'necropolis', name: 'Necropolis of Ash', minLevel: 36, maxLevel: 45, rec: 37,
    desc: 'A city of the dead ruled by an emperor who would not die.',
    unlock: { boss: 'voidHerald' }, encounters: [{ enemy: 'lichAcolyte', w: 40 }, { enemy: 'skeleton', w: 25 }, { enemy: 'wraith', w: 20 }, { enemy: 'voidStalker', w: 15 }],
    treasure: ['elixir', 'ringOfTitan', 'greatHelm', 'bastionPlate'], boss: 'lichEmperor', color: '#3b3b3b', glyph: '💀' },
  { id: 'abyssalThrone', name: 'Abyssal Throne', minLevel: 42, maxLevel: 50, rec: 42,
    desc: 'The bottom of the world. The Eternal Tyrant waits upon a throne of fallen heroes.',
    unlock: { boss: 'lichEmperor' }, encounters: [{ enemy: 'abyssalHorror', w: 40 }, { enemy: 'shadowFiend', w: 30 }, { enemy: 'dragon', w: 30 }],
    treasure: ['elixir', 'titanEdge', 'eclipseFang', 'starfallStaff', 'galeHorn'], boss: 'abyssalBehemoth', bosses: ['abyssalBehemoth', 'eternalTyrant'], color: '#2a0a12', glyph: '👁' },
];

export function getDungeon(id) {
  return DUNGEONS.find((d) => d.id === id) || null;
}

export function dungeonStatus(state, d) {
  const reasons = [];
  if (d.unlock.level && state.player.level < d.unlock.level) reasons.push(`Reach level ${d.unlock.level}`);
  if (d.unlock.boss && !state.bosses.defeated[d.unlock.boss]) reasons.push(`Defeat ${BOSSES[d.unlock.boss].name}`);
  return { unlocked: reasons.length === 0, reasons };
}

/** Enemy level for an encounter: near the player's level, within the dungeon range. */
export function encounterLevel(d, playerLevel, rng) {
  const target = playerLevel + rng.int(-1, 1);
  return Math.max(d.minLevel, Math.min(d.maxLevel, target));
}
