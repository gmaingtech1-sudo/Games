// Enemy database, enemy abilities, level scaling and the enemy AI.
// Built-in data is frozen; custom enemies live in their own store and are
// turned into combat units through the same createEnemyUnit() path.

import { clamp } from './utils.js';

/* ---------------- Enemy abilities ---------------- */
// kind: attack | heal | buff | debuff | charge. A charge ability spends one
// turn telegraphing, then releases `release` on the next turn. Defending
// against a released charge cuts its damage to a quarter and blocks its effects.
const EA = {};
function ea(id, def) {
  // Only attacks deal damage by default; heals, buffs, debuffs and charge set-ups
  // deal damage only when they say so with an explicit multiplier.
  const kind = def.kind || 'attack';
  EA[id] = { id, kind, mult: kind === 'attack' ? 1 : 0, hits: 1, element: 'physical', cd: 0, w: 10, effects: [], self: [], ...def };
}

ea('attack', { name: 'Attack', mult: 1, w: 10 });
ea('acidSplash', { name: 'Acid Splash', mult: 0.9, element: 'poison', effects: [{ id: 'poison', chance: 0.4, turns: 3, scale: 0.25 }], w: 8 });
ea('oozeRegrowth', { name: 'Ooze Regrowth', kind: 'heal', heal: { pct: 0.2 }, cd: 3, w: 6 });
ea('quickStab', { name: 'Quick Stab', mult: 0.6, hits: 2, w: 12 });
ea('dirtyTrick', { name: 'Dirty Trick', kind: 'debuff', mult: 0.6, effects: [{ id: 'weakness', chance: 1, turns: 2, power: 0.25 }], cd: 3, w: 6 });
ea('rattlingSlash', { name: 'Rattling Slash', mult: 1.2, w: 10 });
ea('boneShield', { name: 'Bone Shield', kind: 'buff', self: [{ id: 'defUp', turns: 3, power: 0.6 }], cd: 4, w: 6 });
ea('bite', { name: 'Savage Bite', mult: 1.15, effects: [{ id: 'bleed', chance: 0.3, turns: 3, scale: 0.25 }], w: 10 });
ea('howl', { name: 'Blood Howl', kind: 'buff', self: [{ id: 'atkUp', turns: 3, power: 0.3 }], cd: 4, w: 5 });
ea('venomBite', { name: 'Venom Bite', mult: 1.0, element: 'poison', effects: [{ id: 'poison', chance: 0.7, turns: 3, scale: 0.35 }], w: 10 });
ea('webShot', { name: 'Web Shot', kind: 'debuff', mult: 0.5, effects: [{ id: 'freeze', chance: 0.5, turns: 2 }], cd: 3, w: 6, verb: 'spits sticky webbing' });
ea('orcCleave', { name: 'Cleave', mult: 1.25, w: 10 });
ea('warCry', { name: 'War Cry', kind: 'buff', self: [{ id: 'atkUp', turns: 3, power: 0.25 }], cd: 4, w: 5 });
ea('brutalSmash', { name: 'Brutal Smash', kind: 'charge', cd: 4, w: 6,
  telegraph: 'raises its weapon high, preparing a Brutal Smash!',
  release: { name: 'Brutal Smash', mult: 2.4 } });
ea('darkBolt', { name: 'Dark Bolt', mult: 1.4, element: 'shadow', ignoreDef: 0.3, w: 12 });
ea('manaDrain', { name: 'Mana Drain', mult: 0.8, element: 'arcane', manaBurn: 0.25, cd: 2, w: 7 });
ea('curse', { name: 'Curse of Frailty', kind: 'debuff', effects: [{ id: 'weakness', chance: 1, turns: 3, power: 0.3 }, { id: 'marked', chance: 1, turns: 3, power: 0.15 }], cd: 4, w: 6 });
ea('trollSmash', { name: 'Troll Smash', mult: 1.35, w: 10 });
ea('trollRegen', { name: 'Regenerate', kind: 'heal', heal: { pct: 0.15 }, self: [{ id: 'regen', turns: 3, power: 0.05 }], cd: 3, w: 6 });
ea('wail', { name: 'Haunting Wail', kind: 'debuff', mult: 0.7, element: 'shadow', effects: [{ id: 'weakness', chance: 1, turns: 2, power: 0.3 }], cd: 3, w: 7 });
ea('lifeTouch', { name: 'Life Touch', mult: 1.1, element: 'shadow', drain: 0.5, w: 10 });
ea('clawRake', { name: 'Claw Rake', mult: 0.75, hits: 2, effects: [{ id: 'bleed', chance: 0.3, turns: 3, scale: 0.3 }], w: 10 });
ea('tailSwipe', { name: 'Tail Swipe', mult: 1.3, effects: [{ id: 'stun', chance: 0.2, turns: 1 }], cd: 2, w: 7 });
ea('fireBreath', { name: 'Fire Breath', kind: 'charge', cd: 4, w: 7,
  telegraph: 'draws in a deep, rumbling breath. Flames flicker between its teeth!',
  release: { name: 'Fire Breath', mult: 2.4, element: 'fire', effects: [{ id: 'burn', chance: 1, turns: 3, scale: 0.3 }] } });
ea('frostBite', { name: 'Frost Bite', mult: 1.1, element: 'ice', effects: [{ id: 'freeze', chance: 0.25, turns: 2 }], w: 10 });
ea('iceShard', { name: 'Ice Shard', mult: 1.3, element: 'ice', ignoreDef: 0.2, w: 10 });
ea('shadowClaw', { name: 'Shadow Claw', mult: 1.2, element: 'shadow', effects: [{ id: 'bleed', chance: 0.3, turns: 3, scale: 0.3 }], w: 10 });
ea('voidGaze', { name: 'Void Gaze', kind: 'debuff', mult: 0.6, element: 'shadow', effects: [{ id: 'marked', chance: 1, turns: 3, power: 0.25 }], cd: 3, w: 6 });
ea('healingChant', { name: 'Healing Chant', kind: 'heal', heal: { pct: 0.25 }, cd: 4, w: 6 });
ea('firebolt', { name: 'Firebolt', mult: 1.3, element: 'fire', effects: [{ id: 'burn', chance: 0.35, turns: 3, scale: 0.25 }], w: 10 });
ea('stoneSkin', { name: 'Stone Skin', kind: 'buff', self: [{ id: 'defUp', turns: 3, power: 0.8 }], cd: 4, w: 5 });
ea('crush', { name: 'Crush', mult: 1.5, w: 9 });

/* --------------- Boss abilities (shared format) --------------- */
ea('royalSwipe', { name: 'Royal Swipe', mult: 1.25, w: 10 });
ea('callGuards', { name: 'Call the Guards', mult: 0.45, hits: 3, cd: 3, w: 8, verb: 'whistles; goblin guards hurl spears' });
ea('crownCrusher', { name: 'Crown Crusher', kind: 'charge', cd: 3, w: 9,
  telegraph: 'lifts his crown-topped club over his head. Brace yourself!',
  release: { name: 'Crown Crusher', mult: 2.7 } });
ea('goblinFeast', { name: 'Goblin Feast', kind: 'heal', heal: { pct: 0.12 }, cd: 5, w: 6, verb: 'gobbles a roast boar' });
ea('reapingScythe', { name: 'Reaping Scythe', kind: 'charge', cd: 3, w: 9,
  telegraph: 'draws back its scythe; the blade glows with stolen souls!',
  release: { name: 'Reaping Scythe', mult: 2.8, element: 'shadow' } });
ea('soulHarvest', { name: 'Soul Harvest', mult: 1.15, element: 'shadow', drain: 0.7, cd: 2, w: 9 });
ea('boneArmor', { name: 'Bone Armour', kind: 'buff', self: [{ id: 'defUp', turns: 3, power: 0.8 }], cd: 4, w: 6 });
ea('boneStorm', { name: 'Bone Storm', mult: 0.4, hits: 4, effects: [{ id: 'bleed', chance: 0.4, turns: 3, scale: 0.25 }], cd: 2, w: 9 });
ea('venomFang', { name: 'Venom Fang', mult: 1.1, element: 'poison', effects: [{ id: 'poison', chance: 1, turns: 4, scale: 0.35 }], w: 10 });
ea('webCocoon', { name: 'Web Cocoon', kind: 'charge', cd: 4, w: 8,
  telegraph: 'begins spinning a cocoon around you! Defend to tear free!',
  release: { name: 'Web Cocoon', mult: 0.6, effects: [{ id: 'stun', chance: 1, turns: 1 }] } });
ea('broodSwarm', { name: 'Brood Swarm', mult: 0.35, hits: 5, element: 'poison', effects: [{ id: 'poison', chance: 0.25, turns: 3, scale: 0.2 }], cd: 2, w: 9, verb: 'unleashes a swarm of spiderlings' });
ea('warlordCleave', { name: 'Cursed Cleave', mult: 1.35, element: 'shadow', w: 10 });
ea('warlordCry', { name: 'Dread Warcry', kind: 'debuff', effects: [{ id: 'weakness', chance: 1, turns: 3, power: 0.3 }], cd: 4, w: 6 });
ea('cursedBanner', { name: 'Cursed Banner', kind: 'buff', shield: { pctMaxHp: 0.18 }, cd: 5, w: 7, verb: 'plants a cursed banner; a dark barrier surrounds him' });
ea('executioner', { name: 'Executioner', kind: 'charge', cd: 3, w: 9,
  telegraph: 'marks you for execution and hefts his greataxe!',
  release: { name: 'Execution', mult: 3.0, execute: 0.4 } });
ea('shadowBolt', { name: 'Shadow Bolt', mult: 1.5, element: 'shadow', ignoreDef: 0.3, w: 10 });
ea('manaBurn', { name: 'Mana Burn', mult: 0.9, element: 'arcane', manaBurn: 0.35, cd: 2, w: 8 });
ea('frostPrison', { name: 'Frost Prison', kind: 'debuff', mult: 0.6, element: 'ice', effects: [{ id: 'freeze', chance: 0.7, turns: 2 }], cd: 4, w: 7 });
ea('arcaneBarrier', { name: 'Arcane Barrier', kind: 'buff', shield: { pctMaxHp: 0.15 }, cd: 5, w: 7 });
ea('shadowClones', { name: 'Shadow Clones', kind: 'buff', self: [{ id: 'evasion', turns: 3, power: 0.35 }], cd: 5, w: 6, verb: 'splits into flickering shadow clones' });
ea('oblivion', { name: 'Oblivion', kind: 'charge', cd: 3, w: 9,
  telegraph: 'gathers a sphere of pure darkness. The air itself screams!',
  release: { name: 'Oblivion', mult: 3.2, element: 'shadow' } });
ea('infernoBreath', { name: 'Inferno Breath', kind: 'charge', cd: 3, w: 10,
  telegraph: 'inhales deeply... the cavern glows white-hot! DEFEND!',
  release: { name: 'Inferno Breath', mult: 3.4, element: 'fire', effects: [{ id: 'burn', chance: 1, turns: 3, scale: 0.4 }] } });
ea('wingGust', { name: 'Wing Gust', mult: 1.0, effects: [{ id: 'weakness', chance: 1, turns: 2, power: 0.25 }], cd: 3, w: 7 });
ea('meteorDive', { name: 'Meteor Dive', kind: 'charge', cd: 4, w: 8,
  telegraph: 'soars high above, then folds its wings for a dive!',
  release: { name: 'Meteor Dive', mult: 2.9, element: 'fire', effects: [{ id: 'stun', chance: 0.5, turns: 1 }] } });
ea('voidLance', { name: 'Void Lance', mult: 1.5, element: 'shadow', ignoreDef: 0.4, w: 10 });
ea('entropy', { name: 'Entropy', kind: 'debuff', effects: [{ id: 'weakness', chance: 1, turns: 3, power: 0.3 }, { id: 'marked', chance: 1, turns: 3, power: 0.25 }], cd: 4, w: 7 });
ea('riftCollapse', { name: 'Rift Collapse', kind: 'charge', cd: 3, w: 9,
  telegraph: 'tears open a rift; reality begins to fold inward!',
  release: { name: 'Rift Collapse', mult: 3.4, element: 'shadow' } });
ea('voidShield', { name: 'Void Shield', kind: 'buff', shield: { pctMaxHp: 0.18 }, cd: 5, w: 7 });
ea('frostbolt', { name: 'Frostbolt', mult: 1.4, element: 'ice', effects: [{ id: 'freeze', chance: 0.3, turns: 2 }], w: 10 });
ea('deathCoil', { name: 'Death Coil', mult: 1.3, element: 'shadow', drain: 0.6, cd: 2, w: 9 });
ea('phylactery', { name: 'Phylactery Ward', kind: 'buff', shield: { pctMaxHp: 0.2 }, cd: 5, w: 7 });
ea('soulStorm', { name: 'Soul Storm', kind: 'charge', cd: 3, w: 9,
  telegraph: 'raises his staff; a storm of screaming souls gathers!',
  release: { name: 'Soul Storm', mult: 0.85, hits: 4, element: 'shadow', effects: [{ id: 'weakness', chance: 1, turns: 2, power: 0.2 }] } });
ea('quake', { name: 'Abyssal Quake', kind: 'charge', cd: 3, w: 9,
  telegraph: 'rears up on its hind legs; the ground cracks beneath you!',
  release: { name: 'Abyssal Quake', mult: 3.4, effects: [{ id: 'stun', chance: 0.6, turns: 1 }] } });
ea('thickHide', { name: 'Thick Hide', kind: 'buff', self: [{ id: 'defUp', turns: 3, power: 0.7 }, { id: 'regen', turns: 3, power: 0.03 }], cd: 4, w: 6 });
ea('tyrantStrike', { name: 'Tyrant Strike', mult: 1.5, w: 10 });
ea('decreeOfPain', { name: 'Decree of Pain', kind: 'debuff', effects: [{ id: 'marked', chance: 1, turns: 3, power: 0.3 }, { id: 'bleed', chance: 1, turns: 3, scale: 0.35 }], cd: 4, w: 7 });
ea('eternalAegis', { name: 'Eternal Aegis', kind: 'buff', shield: { pctMaxHp: 0.15 }, self: [{ id: 'regen', turns: 3, power: 0.03 }], cd: 5, w: 7 });
ea('apocalypse', { name: 'Apocalypse', kind: 'charge', cd: 3, w: 10,
  telegraph: 'speaks a word that unmakes the world. Everything goes silent...',
  release: { name: 'Apocalypse', mult: 3.8, element: 'arcane', effects: [{ id: 'burn', chance: 1, turns: 3, scale: 0.35 }] } });

export const ENEMY_ABILITIES = Object.freeze(EA);

/* ---------------- Behaviours ---------------- */
// Weight multipliers by ability kind, plus the hp fraction under which the
// enemy prefers to heal. All AI decisions follow these rules.
export const BEHAVIOURS = {
  aggressive: { name: 'Aggressive', desc: 'Prefers damaging attacks; rarely buffs.', mult: { attack: 1.5, buff: 0.5, debuff: 0.8, heal: 0.6, charge: 1.2 }, healBelow: 0.25 },
  defensive:  { name: 'Defensive', desc: 'Buffs and heals early, then attacks.', mult: { attack: 0.8, buff: 1.6, debuff: 1, heal: 1.5, charge: 0.8 }, healBelow: 0.5 },
  caster:     { name: 'Caster', desc: 'Uses spells over basic attacks and loves debuffs.', mult: { attack: 1, buff: 1, debuff: 1.6, heal: 1, charge: 1 }, healBelow: 0.4, basicMult: 0.25 },
  trickster:  { name: 'Trickster', desc: 'Applies status effects the hero does not already have.', mult: { attack: 0.9, buff: 1, debuff: 2, heal: 1, charge: 1 }, healBelow: 0.35 },
  berserker:  { name: 'Berserker', desc: 'Grows more aggressive as its health drops.', mult: { attack: 1.2, buff: 0.8, debuff: 0.6, heal: 0.5, charge: 1.5 }, healBelow: 0.2, rageBelow: 0.4 },
  balanced:   { name: 'Balanced', desc: 'Mixes everything evenly.', mult: { attack: 1, buff: 1, debuff: 1, heal: 1, charge: 1 }, healBelow: 0.35 },
};

/* ---------------- Enemy templates ---------------- */
// Multipliers apply to the level-based baseline in baselineStats().
const E = {};
function enemy(id, def) {
  E[id] = { id, hpM: 1, atkM: 1, defM: 1, spdM: 1, xpM: 1, goldM: 1, weak: [], resist: [], immune: [], tags: [], gearChance: 0.07, behaviour: 'balanced', ...def };
}
enemy('slime', { name: 'Slime', desc: 'A quivering blob of acidic jelly. Weak to fire.', hpM: 0.8, atkM: 0.75, defM: 0.6, spdM: 0.6, xpM: 0.8, goldM: 0.8,
  weak: ['fire'], abilities: ['attack', 'acidSplash', 'oozeRegrowth'], behaviour: 'defensive', tags: ['slime'],
  loot: [{ id: 'slimeGel', chance: 0.6, min: 1, max: 2 }, { id: 'smallHealthPotion', chance: 0.06 }], look: { shape: 'blob', color: '#55d16b', accent: '#c9ffcf' } });
enemy('goblin', { name: 'Goblin', desc: 'A wiry thief with a rusty knife. Attacks twice in quick succession.', hpM: 0.85, atkM: 0.9, defM: 0.8, spdM: 1.3,
  abilities: ['attack', 'quickStab', 'dirtyTrick'], behaviour: 'aggressive', tags: ['goblin', 'humanoid'],
  loot: [{ id: 'goblinEar', chance: 0.5 }, { id: 'smallHealthPotion', chance: 0.1 }], look: { shape: 'humanoid', color: '#7fae3a', accent: '#f2d14b' } });
enemy('goblinShaman', { name: 'Goblin Shaman', desc: 'Chants hexes and patches up its own wounds.', hpM: 0.8, atkM: 1.0, defM: 0.7, spdM: 1.0, xpM: 1.1,
  abilities: ['attack', 'firebolt', 'healingChant', 'curse'], behaviour: 'caster', tags: ['goblin', 'humanoid'], weak: ['physical'],
  loot: [{ id: 'goblinEar', chance: 0.5 }, { id: 'manaPotion', chance: 0.12 }, { id: 'arcaneDust', chance: 0.15 }], look: { shape: 'caster', color: '#6f9a34', accent: '#ff7a2e' } });
enemy('skeleton', { name: 'Skeleton', desc: 'Animated bones that feel no pain. Immune to poison and bleeding.', hpM: 1.0, atkM: 1.0, defM: 1.3, spdM: 0.8,
  weak: ['lightning'], resist: ['ice', 'shadow'], immune: ['poison', 'bleed'], abilities: ['attack', 'rattlingSlash', 'boneShield'], behaviour: 'defensive', tags: ['undead'],
  loot: [{ id: 'boneFragment', chance: 0.55, min: 1, max: 2 }, { id: 'moonsteelShard', chance: 0.25, quest: 'moonsteel' }], look: { shape: 'skull', color: '#e6dfc8', accent: '#7fd7ff' } });
enemy('wolf', { name: 'Wolf', desc: 'A hungry grey wolf. Fast, and its bites cause bleeding.', hpM: 0.9, atkM: 1.05, defM: 0.8, spdM: 1.4,
  abilities: ['attack', 'bite', 'howl'], behaviour: 'aggressive', tags: ['beast'],
  loot: [{ id: 'wolfPelt', chance: 0.55 }], look: { shape: 'beast', color: '#8a8f99', accent: '#ffd166' } });
enemy('giantSpider', { name: 'Giant Spider', desc: 'A spider the size of a cart. Its venom lingers.', hpM: 1.0, atkM: 0.95, defM: 0.9, spdM: 1.2,
  weak: ['fire'], immune: ['poison'], abilities: ['attack', 'venomBite', 'webShot'], behaviour: 'trickster', tags: ['beast', 'spider'],
  loot: [{ id: 'spiderSilk', chance: 0.45 }, { id: 'antidote', chance: 0.12 }], look: { shape: 'spider', color: '#4a3b5c', accent: '#b4ff4f' } });
enemy('orcWarrior', { name: 'Orc Warrior', desc: 'A hulking brute. Watch for the Brutal Smash wind-up.', hpM: 1.25, atkM: 1.15, defM: 1.1, spdM: 0.85, xpM: 1.2, goldM: 1.2,
  abilities: ['attack', 'orcCleave', 'brutalSmash', 'warCry'], behaviour: 'berserker', tags: ['humanoid', 'orc'],
  loot: [{ id: 'orcTusk', chance: 0.45 }, { id: 'smallHealthPotion', chance: 0.1 }], gearChance: 0.1, look: { shape: 'brute', color: '#4f7a3a', accent: '#d4d4d4' } });
enemy('darkMage', { name: 'Dark Mage', desc: 'A renegade sorcerer. Drains mana and casts curses. Frail against steel.', hpM: 0.8, atkM: 1.25, defM: 0.7, spdM: 1.0, xpM: 1.15, goldM: 1.3,
  weak: ['physical'], resist: ['shadow', 'arcane'], abilities: ['darkBolt', 'manaDrain', 'curse'], behaviour: 'caster', tags: ['humanoid'],
  loot: [{ id: 'arcaneDust', chance: 0.4 }, { id: 'manaPotion', chance: 0.15 }], gearChance: 0.1, look: { shape: 'caster', color: '#3b2a5c', accent: '#c38bff' } });
enemy('troll', { name: 'Troll', desc: 'Enormous and slow. Regenerates unless you burn it down fast.', hpM: 1.7, atkM: 1.1, defM: 1.0, spdM: 0.6, xpM: 1.35, goldM: 1.2,
  weak: ['fire'], abilities: ['attack', 'trollSmash', 'trollRegen'], behaviour: 'berserker', tags: ['giant'],
  loot: [{ id: 'trollHide', chance: 0.45 }, { id: 'largeHealthPotion', chance: 0.08 }], look: { shape: 'brute', color: '#5f7d6e', accent: '#e8c27a' } });
enemy('wraith', { name: 'Wraith', desc: 'A vengeful spirit. Weapons pass half through it; magic does not.', hpM: 0.9, atkM: 1.1, defM: 0.6, spdM: 1.15, xpM: 1.15,
  weak: ['arcane', 'fire', 'holy'], resist: ['physical', 'shadow'], immune: ['poison', 'bleed'], abilities: ['lifeTouch', 'wail'], behaviour: 'trickster', tags: ['undead', 'spirit'],
  loot: [{ id: 'ectoplasm', chance: 0.4 }, { id: 'moonsteelShard', chance: 0.2, quest: 'moonsteel' }], look: { shape: 'ghost', color: '#9fb7d9', accent: '#e8f4ff' } });
enemy('frostWolf', { name: 'Frost Wolf', desc: 'Its breath freezes the air. Bites can freeze you in place.', hpM: 1.0, atkM: 1.05, defM: 0.9, spdM: 1.4,
  weak: ['fire'], resist: ['ice'], abilities: ['attack', 'frostBite', 'howl'], behaviour: 'aggressive', tags: ['beast'],
  loot: [{ id: 'wolfPelt', chance: 0.4 }, { id: 'frostCrystal', chance: 0.2 }], look: { shape: 'beast', color: '#b8e3ff', accent: '#5aa9ff' } });
enemy('iceGolem', { name: 'Ice Golem', desc: 'A walking glacier. Hardens its body and shatters with fire.', hpM: 1.5, atkM: 1.0, defM: 1.5, spdM: 0.5, xpM: 1.3,
  weak: ['fire', 'lightning'], resist: ['ice', 'physical'], immune: ['poison', 'bleed', 'freeze'], abilities: ['attack', 'iceShard', 'stoneSkin', 'crush'], behaviour: 'defensive', tags: ['construct'],
  loot: [{ id: 'frostCrystal', chance: 0.45 }], look: { shape: 'golem', color: '#a9d8f5', accent: '#ffffff' } });
enemy('frostTroll', { name: 'Frost Troll', desc: 'A troll grown huge in the cold. Regenerates quickly.', hpM: 1.8, atkM: 1.15, defM: 1.0, spdM: 0.6, xpM: 1.4,
  weak: ['fire'], resist: ['ice'], abilities: ['attack', 'trollSmash', 'trollRegen', 'frostBite'], behaviour: 'berserker', tags: ['giant'],
  loot: [{ id: 'trollHide', chance: 0.4 }, { id: 'frostCrystal', chance: 0.25 }], look: { shape: 'brute', color: '#9cc9d9', accent: '#ffffff' } });
enemy('shadowFiend', { name: 'Shadow Fiend', desc: 'A clawed thing from the Shadow Realm that marks its prey.', hpM: 1.05, atkM: 1.2, defM: 0.9, spdM: 1.3, xpM: 1.25,
  weak: ['holy', 'arcane'], resist: ['shadow'], abilities: ['attack', 'shadowClaw', 'voidGaze'], behaviour: 'trickster', tags: ['demon'],
  loot: [{ id: 'shadowEssence', chance: 0.4 }], gearChance: 0.1, look: { shape: 'fiend', color: '#2a1d3f', accent: '#ff4f7b' } });
enemy('voidStalker', { name: 'Void Stalker', desc: 'Blinks in and out of reality. Hard to pin down.', hpM: 1.0, atkM: 1.3, defM: 0.8, spdM: 1.5, xpM: 1.3,
  weak: ['lightning'], resist: ['shadow', 'physical'], abilities: ['shadowClaw', 'voidGaze', 'lifeTouch'], behaviour: 'aggressive', tags: ['demon'],
  loot: [{ id: 'voidShard', chance: 0.2 }, { id: 'shadowEssence', chance: 0.3 }], gearChance: 0.1, look: { shape: 'ghost', color: '#1b0f2e', accent: '#b067ff' } });
enemy('dragonCultist', { name: 'Dragon Cultist', desc: 'A fanatic who calls down flame and heals in the dragon\'s name.', hpM: 0.9, atkM: 1.25, defM: 0.8, spdM: 1.0, xpM: 1.2, goldM: 1.4,
  weak: ['ice'], resist: ['fire'], abilities: ['firebolt', 'healingChant', 'curse'], behaviour: 'caster', tags: ['humanoid'],
  loot: [{ id: 'arcaneDust', chance: 0.3 }, { id: 'greaterManaPotion', chance: 0.08 }], gearChance: 0.1, look: { shape: 'caster', color: '#7a1f1f', accent: '#ffb02e' } });
enemy('dragon', { name: 'Drake', desc: 'A young dragon. Its fire breath can be blunted by defending.', hpM: 1.6, atkM: 1.3, defM: 1.3, spdM: 1.0, xpM: 1.8, goldM: 1.8,
  weak: ['ice'], resist: ['fire'], abilities: ['attack', 'clawRake', 'tailSwipe', 'fireBreath'], behaviour: 'berserker', tags: ['dragon'],
  loot: [{ id: 'dragonScaleMat', chance: 0.3 }], gearChance: 0.14, look: { shape: 'dragon', color: '#b3261e', accent: '#ffb02e' } });
enemy('abyssalHorror', { name: 'Abyssal Horror', desc: 'A writhing mass of eyes and teeth from the deep.', hpM: 1.5, atkM: 1.3, defM: 1.1, spdM: 0.9, xpM: 1.5, goldM: 1.5,
  weak: ['holy', 'fire'], resist: ['shadow', 'poison'], abilities: ['attack', 'crush', 'voidGaze', 'thickHide'], behaviour: 'berserker', tags: ['demon'],
  loot: [{ id: 'voidShard', chance: 0.3 }], gearChance: 0.12, look: { shape: 'eye', color: '#3d0f2a', accent: '#ff4f7b' } });
enemy('lichAcolyte', { name: 'Lich Acolyte', desc: 'A half-dead spellcaster that freezes and drains its victims.', hpM: 1.0, atkM: 1.35, defM: 0.9, spdM: 1.0, xpM: 1.35, goldM: 1.4,
  weak: ['fire', 'holy'], resist: ['ice', 'shadow'], immune: ['poison', 'bleed'], abilities: ['frostbolt', 'deathCoil', 'curse'], behaviour: 'caster', tags: ['undead'],
  loot: [{ id: 'ectoplasm', chance: 0.3 }, { id: 'arcaneDust', chance: 0.3 }], gearChance: 0.12, look: { shape: 'skull', color: '#8fa3b8', accent: '#7fffd4' } });

export const ENEMIES = Object.freeze(E);

export function getEnemyTemplate(id) {
  return Object.prototype.hasOwnProperty.call(ENEMIES, id) ? ENEMIES[id] : null;
}

/** Level baseline every template is scaled from. */
export function baselineStats(L) {
  return {
    hp: 45 + 34 * L,
    atk: 14 + 5.8 * L,
    def: 3 + 1.75 * L,
    spd: 7 + 0.45 * L,
    xp: Math.round(18 * Math.pow(L, 1.3) + 10),
    gold: Math.round(5 * Math.pow(L, 1.2) + 4),
  };
}

/**
 * Build a combat unit from a template (built-in or custom). opts:
 *  rng, elite (bool), variance (default 0.08), fixed (custom enemies use their exact stats)
 */
export function createEnemyUnit(tpl, level, opts = {}) {
  const rng = opts.rng || Math.random;
  level = clamp(Math.round(level), 1, 99);
  const v = opts.variance ?? 0.08;
  const vary = () => 1 + (rng() * 2 - 1) * v;
  const b = baselineStats(level);
  const elite = !!opts.elite;
  const eliteHp = elite ? 1.45 : 1, eliteAtk = elite ? 1.2 : 1, eliteReward = elite ? 2 : 1;
  let maxHp, atk, def, spd, xp, gold;
  if (tpl.fixed) {
    ({ hp: maxHp, atk, def, spd, xp, gold } = tpl.fixed);
  } else {
    maxHp = b.hp * tpl.hpM * vary() * eliteHp;
    atk = b.atk * tpl.atkM * vary() * eliteAtk;
    def = b.def * tpl.defM;
    spd = b.spd * tpl.spdM;
    xp = b.xp * tpl.xpM * eliteReward;
    gold = b.gold * tpl.goldM * eliteReward;
  }
  maxHp = Math.max(1, Math.round(maxHp));
  return {
    side: 'enemy', templateId: tpl.id, custom: !!tpl.custom,
    name: (elite ? 'Elite ' : '') + tpl.name, desc: tpl.desc, level, elite,
    maxHp, hp: maxHp, maxMp: 0, mp: 0,
    atk: Math.max(1, Math.round(atk)), def: Math.max(0, Math.round(def)), spd: Math.max(1, Math.round(spd)),
    crit: tpl.crit ?? 5, critDmg: 150, res: tpl.res ?? 0,
    weak: [...(tpl.weak || [])], resist: [...(tpl.resist || [])], immune: [...(tpl.immune || [])], tags: [...(tpl.tags || [])],
    abilities: [...(tpl.abilities?.length ? tpl.abilities : ['attack'])],
    behaviour: BEHAVIOURS[tpl.behaviour] ? tpl.behaviour : 'balanced',
    xpReward: Math.max(0, Math.round(xp)), goldReward: Math.max(0, Math.round(gold)),
    loot: tpl.loot || [], gearChance: tpl.gearChance ?? 0.07,
    look: { ...(tpl.look || { shape: 'blob', color: '#888', accent: '#fff' }) },
    effects: [], cooldowns: {}, charging: null, isBoss: false, ccResist: 0,
  };
}

/* ---------------- Enemy AI ---------------- */

function abilityKind(a) { return a.kind || 'attack'; }

/**
 * Choose the enemy's action. Rules, in priority order:
 *  1. A charged attack started last turn is always released.
 *  2. If health is below the behaviour's heal threshold and a heal is ready, heal.
 *  3. Otherwise weigh every ready ability:
 *     - base weight x behaviour multiplier for its kind;
 *     - buffs the enemy already has, and debuffs the hero already has, weigh 0;
 *     - berserkers below their rage threshold double attack and charge weights;
 *     - casters rarely use plain attacks.
 *  4. Pick by weight (deterministic for a given rng).
 * Returns an ability object from ENEMY_ABILITIES (or a boss phase list).
 */
export function chooseEnemyAction(enemy, player, rng = Math.random) {
  if (enemy.charging) return { ...ENEMY_ABILITIES[enemy.charging], releasing: true };
  const beh = BEHAVIOURS[enemy.behaviour] || BEHAVIOURS.balanced;
  const pool = (enemy.phaseAbilities || enemy.abilities).map((id) => ENEMY_ABILITIES[id]).filter(Boolean);
  const ready = pool.filter((a) => !(enemy.cooldowns[a.id] > 0));
  const hpFrac = enemy.hp / enemy.maxHp;

  const heal = ready.find((a) => abilityKind(a) === 'heal');
  if (heal && hpFrac < beh.healBelow) return heal;

  const entries = [];
  for (const a of ready) {
    const kind = abilityKind(a);
    let w = a.w * (beh.mult[kind] ?? 1);
    if (kind === 'heal' && hpFrac > 0.8) w = 0;
    if (kind === 'buff') {
      const hasAll = (a.self || []).length > 0 && a.self.every((s) => enemy.effects.some((e) => e.id === s.id));
      const shielded = a.shield && enemy.effects.some((e) => e.id === 'shield');
      if (hasAll || shielded) w = 0;
    }
    if (kind === 'debuff') {
      const allPresent = a.effects.length > 0 && a.effects.every((s) => player.effects.some((e) => e.id === s.id));
      if (allPresent) w = 0;
    }
    if (a.id === 'attack' && beh.basicMult) w *= beh.basicMult;
    if (beh.rageBelow && hpFrac < beh.rageBelow && (kind === 'attack' || kind === 'charge')) w *= 2;
    if (w > 0) entries.push({ w, a });
  }
  if (!entries.length) return ENEMY_ABILITIES.attack;
  return (rng.weighted ? rng.weighted(entries) : weightedPick(entries, rng)).a;
}

function weightedPick(entries, rng) {
  const total = entries.reduce((s, e) => s + e.w, 0);
  let r = rng() * total;
  for (const e of entries) { r -= e.w; if (r < 0) return e; }
  return entries[entries.length - 1];
}
