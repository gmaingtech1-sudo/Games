// Major bosses: one every five player levels. Each boss has phases that swap
// its ability list when its health drops below a threshold, telegraphed
// charge attacks that defending (or stunning) counters, unique first-kill
// loot and a chance at rare bonus loot.

import { createEnemyUnit, baselineStats } from './enemies.js';

const B = {};
function boss(id, def) {
  B[id] = { id, hpM: 2.3, atkM: 1.2, defM: 1.15, spdM: 1, weak: [], resist: [], immune: [], tags: ['boss'], bonusLoot: [], ...def };
}

boss('goblinKing', {
  name: 'The Goblin King', title: 'Tyrant of the Caves', level: 5, dungeon: 'goblinCaves',
  desc: 'A bloated goblin in a stolen crown, ruling the caves with a spiked club.',
  intro: 'Torches flare. Atop a throne of stolen carts sits the Goblin King, picking his teeth with a dagger. "Another snack walks into my hall!" he cackles, hefting a club crowned with iron spikes.',
  hpM: 1.9, atkM: 0.95, defM: 1.0,
  tags: ['boss', 'goblin'],
  phases: [
    { at: 1, name: 'Royal Court', abilities: ['royalSwipe', 'callGuards', 'crownCrusher'] },
    { at: 0.5, name: 'Royal Tantrum', abilities: ['royalSwipe', 'callGuards', 'crownCrusher', 'goblinFeast'],
      text: 'The Goblin King flies into a rage! "MY CROWN! MY CAVES!"', self: [{ id: 'enraged', turns: 99, power: 0.25 }] },
  ],
  reward: { xpM: 12, goldM: 15, items: ['goblinCrown', 'goblinSignet'] },
  bonusLoot: [{ id: 'largeHealthPotion', chance: 0.5 }, { id: 'ringOfPower', chance: 0.15 }],
  look: { shape: 'humanoid', color: '#8bb83f', accent: '#ffd700', crown: true },
});
boss('boneReaper', {
  name: 'The Bone Reaper', title: 'Harvester of the Crypt', level: 10, dungeon: 'forgottenCrypt', requires: 'goblinKing',
  desc: 'A towering skeleton in a tattered shroud, its scythe hungry for souls.',
  intro: 'Candles gutter out one by one. From the deepest tomb rises a figure of bone and shadow, a scythe longer than a man in its hands. "Your soul," it rasps, "is overdue."',
  immune: ['poison', 'bleed'], weak: ['lightning', 'fire'], resist: ['shadow', 'ice'], tags: ['boss', 'undead'],
  phases: [
    { at: 1, name: 'The Harvest', abilities: ['attack', 'soulHarvest', 'reapingScythe', 'boneArmor'] },
    { at: 0.5, name: 'Bone Storm', abilities: ['soulHarvest', 'reapingScythe', 'boneStorm', 'boneArmor'],
      text: 'The Bone Reaper shatters into a whirling storm of bone!', self: [{ id: 'atkUp', turns: 99, power: 0.15 }] },
  ],
  reward: { xpM: 12, goldM: 15, items: ['boneRing', 'largeHealthPotion'] },
  bonusLoot: [{ id: 'knightBlade', chance: 0.15 }, { id: 'regenTonic', chance: 0.4 }],
  look: { shape: 'skull', color: '#d8d0b8', accent: '#a37bff', crown: false, big: true },
});
boss('spiderQueen', {
  name: 'The Spider Queen', title: 'Mother of the Nest', level: 15, dungeon: 'spiderNest', requires: 'boneReaper',
  desc: 'An ancient arachnid matriarch. Her venom is legendary, and so is her brood.',
  intro: 'The webs tremble. Eight glowing eyes open in the dark above you, and something vast lowers itself on a silken rope. "Fresh meat for my children..."',
  immune: ['poison'], weak: ['fire'], tags: ['boss', 'spider', 'beast'],
  phases: [
    { at: 1, name: 'Venom', abilities: ['venomFang', 'webCocoon', 'attack'] },
    { at: 0.5, name: 'The Brood Hatches', abilities: ['venomFang', 'webCocoon', 'broodSwarm'],
      text: 'Hundreds of spiderlings burst from their egg sacs!' },
  ],
  reward: { xpM: 12, goldM: 15, items: ['silkPendant', 'antidote', 'antidote'] },
  bonusLoot: [{ id: 'venomKris', chance: 0.15 }, { id: 'compositeBow', chance: 0.15 }],
  look: { shape: 'spider', color: '#3a1f4f', accent: '#ff4f7b', big: true },
});
boss('cursedWarlord', {
  name: 'The Cursed Warlord', title: 'Lord of the Black Fortress', level: 20, dungeon: 'cursedFortress', requires: 'spiderQueen',
  desc: 'A general cursed to fight forever. His banner shields him; his axe executes the weak.',
  intro: 'Iron boots echo through the empty hall. The Cursed Warlord turns, eyes burning green through his helm. "A thousand years I have waited for a worthy death. Are you it?"',
  hpM: 3.0, weak: ['holy', 'lightning'], resist: ['shadow'], tags: ['boss', 'undead', 'humanoid'],
  phases: [
    { at: 1, name: 'March of Iron', abilities: ['warlordCleave', 'warlordCry', 'executioner'] },
    { at: 0.6, name: 'Raise the Banner', abilities: ['warlordCleave', 'warlordCry', 'executioner', 'cursedBanner'],
      text: 'The Warlord roars and raises his cursed banner!', shield: 0.15 },
    { at: 0.3, name: 'Last Stand', abilities: ['warlordCleave', 'executioner', 'cursedBanner'],
      text: 'Cursed fire wreathes the Warlord. He will not fall quietly!', self: [{ id: 'enraged', turns: 99, power: 0.3 }] },
  ],
  reward: { xpM: 12, goldM: 15, items: ['warlordCleaver', 'warlordPlate'] },
  bonusLoot: [{ id: 'amuletOfFury', chance: 0.2 }, { id: 'elixir', chance: 0.3 }],
  look: { shape: 'brute', color: '#2b2b33', accent: '#5fd068', big: true },
});
boss('shadowSorcerer', {
  name: 'The Shadow Sorcerer', title: 'Keeper of the Rift', level: 25, dungeon: 'frozenCaverns', requires: 'cursedWarlord',
  desc: 'Hidden beneath the ice, he drinks power from a rift to the Shadow Realm.',
  intro: 'At the heart of the frozen cavern, a man in black robes floats above a crack in the world. Violet light pours from it. "You are too late, hero. The rift is already open."',
  hpM: 3.0, atkM: 1.25, defM: 1.0, weak: ['physical', 'holy'], resist: ['shadow', 'arcane', 'ice'], tags: ['boss', 'humanoid'],
  phases: [
    { at: 1, name: 'Dark Arts', abilities: ['shadowBolt', 'manaBurn', 'frostPrison', 'oblivion'] },
    { at: 0.5, name: 'Mirror of Shadows', abilities: ['shadowBolt', 'manaBurn', 'oblivion', 'arcaneBarrier', 'shadowClones'],
      text: 'The Sorcerer laughs as his body splits into shadows!', shield: 0.12 },
  ],
  reward: { xpM: 12, goldM: 15, items: ['sorcererPendant', 'archmageScepter'] },
  bonusLoot: [{ id: 'frostCrown', chance: 0.2 }, { id: 'elixir', chance: 0.35 }],
  look: { shape: 'caster', color: '#1e1033', accent: '#b067ff', big: true },
});
boss('ancientDragon', {
  name: 'The Ancient Dragon', title: 'Ember of the First Age', level: 30, dungeon: 'dragonsLair', requires: 'shadowSorcerer',
  desc: 'The oldest living dragon. Its Inferno Breath can end a hero in one breath. Defend when it inhales.',
  intro: 'Gold coins slide away as a mountain of red scales uncoils. Two eyes like molten suns fix on you. The Ancient Dragon speaks, and the cavern shakes: "I HAVE BURNED KINGDOMS. WHAT ARE YOU?"',
  hpM: 3.5, atkM: 1.25, defM: 1.25, weak: ['ice'], resist: ['fire', 'poison'], tags: ['boss', 'dragon'],
  phases: [
    { at: 1, name: 'Wrath of Scales', abilities: ['clawRake', 'tailSwipe', 'infernoBreath'] },
    { at: 0.5, name: 'Takes to the Sky', abilities: ['wingGust', 'meteorDive', 'infernoBreath'],
      text: 'The Ancient Dragon spreads its wings and takes to the air!', self: [{ id: 'evasion', turns: 3, power: 0.2 }] },
    { at: 0.25, name: 'Dying Fury', abilities: ['clawRake', 'infernoBreath', 'meteorDive'],
      text: 'Bleeding and furious, the dragon crashes down. Its scales glow white-hot!', self: [{ id: 'enraged', turns: 99, power: 0.3 }] },
  ],
  reward: { xpM: 12, goldM: 15, items: ['dragonHeart', 'dragonScale'] },
  bonusLoot: [{ id: 'dragonSlayer', chance: 0.25 }, { id: 'dragonEye', chance: 0.2 }, { id: 'dragonScaleMat', chance: 1 }],
  look: { shape: 'dragon', color: '#9e1b14', accent: '#ffd166', big: true },
});
boss('voidHerald', {
  name: 'The Void Herald', title: 'Voice of the Empty Sky', level: 35, dungeon: 'shadowRealm', requires: 'ancientDragon',
  desc: 'A messenger of nothingness, sent to announce the end of the world.',
  intro: 'The Shadow Realm falls silent. A figure of stars and darkness unfolds before you, speaking with a thousand voices: "THE VOID SENDS ITS REGARDS."',
  hpM: 3.5, atkM: 1.25, weak: ['holy', 'lightning'], resist: ['shadow', 'physical'], tags: ['boss', 'demon'],
  phases: [
    { at: 1, name: 'Proclamation', abilities: ['voidLance', 'entropy', 'riftCollapse'] },
    { at: 0.5, name: 'Event Horizon', abilities: ['voidLance', 'riftCollapse', 'voidShield', 'entropy'],
      text: 'The Herald draws the void around itself like a cloak!', shield: 0.15 },
  ],
  reward: { xpM: 12, goldM: 15, items: ['heraldSigil', 'voidLoop'] },
  bonusLoot: [{ id: 'voidShard', chance: 1 }, { id: 'tempestBoots', chance: 0.2 }],
  look: { shape: 'fiend', color: '#0d0620', accent: '#7fd7ff', big: true },
});
boss('lichEmperor', {
  name: 'The Lich Emperor', title: 'The Undying Crown', level: 40, dungeon: 'necropolis', requires: 'voidHerald',
  desc: 'An emperor who refused death. While his phylactery shield holds, he cannot be harmed.',
  intro: 'A throne of ice and bone. Upon it, a crowned corpse slowly raises its head. "I conquered death itself. You are a much smaller thing."',
  hpM: 4.6, atkM: 1.25, weak: ['fire', 'holy'], resist: ['ice', 'shadow'], immune: ['poison', 'bleed'], tags: ['boss', 'undead'],
  phases: [
    { at: 1, name: 'Cold Command', abilities: ['frostbolt', 'deathCoil', 'frostPrison'] },
    { at: 0.6, name: 'Phylactery', abilities: ['frostbolt', 'deathCoil', 'phylactery', 'soulStorm'],
      text: 'The Lich Emperor calls upon his phylactery!', shield: 0.2 },
    { at: 0.25, name: 'Undying', abilities: ['deathCoil', 'soulStorm', 'frostbolt'],
      text: '"I. DO. NOT. DIE." The Lich Emperor\'s eyes blaze.', self: [{ id: 'enraged', turns: 99, power: 0.3 }] },
  ],
  reward: { xpM: 12, goldM: 15, items: ['lichCrown', 'voidblade'] },
  bonusLoot: [{ id: 'starfallStaff', chance: 0.15 }, { id: 'titanEdge', chance: 0.15 }, { id: 'elixir', chance: 0.5 }],
  look: { shape: 'skull', color: '#a7c7d9', accent: '#7fffd4', crown: true, big: true },
});
boss('abyssalBehemoth', {
  name: 'The Abyssal Behemoth', title: 'The Living Earthquake', level: 45, dungeon: 'abyssalThrone', requires: 'lichEmperor',
  desc: 'A beast the size of a fortress. Its quake will stun you unless you brace.',
  intro: 'The ground ripples like water. Something enormous surfaces from the abyss, horns scraping the cavern roof. It roars, and stones fall like rain.',
  hpM: 6.5, atkM: 1.3, defM: 1.3, spdM: 0.7, weak: ['holy', 'ice'], resist: ['physical', 'poison'], tags: ['boss', 'demon', 'giant'],
  phases: [
    { at: 1, name: 'Tremors', abilities: ['crush', 'quake', 'thickHide'] },
    { at: 0.4, name: 'Abyssal Rage', abilities: ['crush', 'quake', 'tyrantStrike'],
      text: 'The Behemoth bellows and charges blindly!', self: [{ id: 'enraged', turns: 99, power: 0.35 }] },
  ],
  reward: { xpM: 12, goldM: 15, items: ['behemothTooth', 'voidweave'] },
  bonusLoot: [{ id: 'ringOfTitan', chance: 0.3 }, { id: 'eclipseFang', chance: 0.15 }, { id: 'galeHorn', chance: 0.15 }],
  look: { shape: 'brute', color: '#3a0f1f', accent: '#ff7a2e', big: true },
});
boss('eternalTyrant', {
  name: 'The Eternal Tyrant', title: 'Final Sovereign of the Abyss', level: 50, dungeon: 'abyssalThrone', requires: 'abyssalBehemoth',
  desc: 'The power behind every boss you have faced. Three phases. No mercy.',
  intro: 'At the end of everything waits a single throne. The Eternal Tyrant rises, armour forged from fallen heroes. "Every king you slew knelt to me. Now you will too."',
  hpM: 6.5, atkM: 1.3, defM: 1.3, weak: ['holy'], resist: ['shadow', 'arcane'], tags: ['boss', 'demon'],
  phases: [
    { at: 1, name: 'The Sovereign', abilities: ['tyrantStrike', 'decreeOfPain', 'executioner'] },
    { at: 0.66, name: 'The Aegis', abilities: ['tyrantStrike', 'eternalAegis', 'apocalypse', 'decreeOfPain'],
      text: 'The Tyrant raises an eternal aegis!', shield: 0.15 },
    { at: 0.33, name: 'Unmaking', abilities: ['tyrantStrike', 'apocalypse', 'riftCollapse'],
      text: 'The Tyrant\'s armour cracks, and raw void pours out!', self: [{ id: 'enraged', turns: 99, power: 0.35 }] },
  ],
  reward: { xpM: 12, goldM: 15, items: ['tyrantBane', 'elixir', 'elixir'] },
  bonusLoot: [{ id: 'voidblade', chance: 0.25 }],
  look: { shape: 'fiend', color: '#1a0b0b', accent: '#ffd700', crown: true, big: true },
});

export const BOSSES = Object.freeze(B);
export const BOSS_ORDER = ['goblinKing', 'boneReaper', 'spiderQueen', 'cursedWarlord', 'shadowSorcerer', 'ancientDragon', 'voidHerald', 'lichEmperor', 'abyssalBehemoth', 'eternalTyrant'];

export function getBoss(id) {
  return Object.prototype.hasOwnProperty.call(BOSSES, id) ? BOSSES[id] : null;
}

/** Why a boss is or isn't available. */
export function bossStatus(state, id) {
  const b = BOSSES[id];
  const defeated = !!state.bosses?.defeated?.[id];
  const reasons = [];
  if (state.player.level < b.level) reasons.push(`Reach level ${b.level}`);
  if (b.requires && !state.bosses?.defeated?.[b.requires]) reasons.push(`Defeat ${BOSSES[b.requires].name}`);
  return { available: reasons.length === 0, defeated, reasons };
}

export function createBossUnit(id, opts = {}) {
  const b = BOSSES[id];
  const unit = createEnemyUnit({ ...b, abilities: b.phases[0].abilities, behaviour: 'balanced', gearChance: 0 }, b.level, { ...opts, variance: 0 });
  unit.name = b.name;
  unit.title = b.title;
  unit.isBoss = true;
  unit.bossId = id;
  unit.ccResist = 0.5;
  unit.crit = 8;
  unit.phases = b.phases;
  unit.phaseIndex = 0;
  unit.phaseAbilities = b.phases[0].abilities;
  const base = baselineStats(b.level);
  unit.xpReward = Math.round(base.xp * b.reward.xpM);
  unit.goldReward = Math.round(base.gold * b.reward.goldM);
  unit.rematchXp = Math.round(base.xp * 2);
  unit.rematchGold = Math.round(base.gold * 2);
  unit.loot = [];
  return unit;
}
