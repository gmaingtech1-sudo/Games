// Reusable player ability system. Abilities are pure data; combat.js reads
// these fields and applies them. Fields:
//  id, name, desc, classes, level (required level), mp (base mana cost),
//  cd (cooldown in turns), kind ('attack' | 'heal' | 'buff'), element,
//  mult (damage multiplier on attack), hits, critBonus (+% crit), ignoreDef (0..1),
//  accurate (cannot be dodged), drain (fraction of damage healed),
//  dotBonus (extra multiplier per damage-over-time effect on target),
//  effects (applied to target: {id, chance, turns, power | scale (x attack)}),
//  self (applied to the caster), heal ({ pct } of max health), cleanse (bool),
//  unlock: 'starter' or the skill-tree node id that teaches it, ultimate.

const A = {};
function ability(id, def) {
  A[id] = { id, kind: 'attack', element: 'physical', mult: 0, hits: 1, cd: 0, critBonus: 0, ignoreDef: 0, effects: [], self: [], level: 1, ...def };
}

/* ---------------- Warrior ---------------- */
ability('heavyStrike', { name: 'Heavy Strike', classes: ['warrior'], unlock: 'starter', mp: 6, mult: 2.0,
  desc: 'A crushing overhead blow for 200% damage.' });
ability('shieldBlock', { name: 'Shield Block', classes: ['warrior'], unlock: 'starter', mp: 5, cd: 3, kind: 'buff',
  self: [{ id: 'guard', turns: 2, power: 0.6 }], desc: 'Raise your shield: take 60% less damage for 2 enemy turns.' });
ability('whirlwind', { name: 'Whirlwind', classes: ['warrior'], unlock: 'w_off1', level: 2, mp: 10, cd: 1, mult: 0.75, hits: 3,
  desc: 'Spin into the enemy, striking three times for 75% damage each.' });
ability('thunderStrike', { name: 'Thunder Strike', classes: ['warrior'], unlock: 'w_off3', level: 10, mp: 14, cd: 3, mult: 1.9, element: 'lightning',
  effects: [{ id: 'stun', chance: 0.35, turns: 1 }], desc: 'A lightning-charged strike for 190% damage with a 35% chance to stun. Stuns interrupt charged attacks.' });
ability('titansWrath', { name: "Titan's Wrath", classes: ['warrior'], unlock: 'w_off5', level: 25, mp: 30, cd: 5, mult: 4.0, critBonus: 20, ultimate: true,
  desc: 'ULTIMATE. Channel the strength of titans for 400% damage with +20% crit chance.' });
ability('ironSkin', { name: 'Iron Skin', classes: ['warrior'], unlock: 'w_def1', level: 2, mp: 10, cd: 4, kind: 'buff',
  self: [{ id: 'defUp', turns: 4, power: 0.6 }, { id: 'regen', turns: 4, power: 0.04 }], desc: 'Defence +60% and regenerate 4% health per turn for 4 turns.' });
ability('shieldBash', { name: 'Shield Bash', classes: ['warrior'], unlock: 'w_def3', level: 10, mp: 12, cd: 3, mult: 1.3,
  effects: [{ id: 'stun', chance: 0.6, turns: 1 }], desc: 'Slam with your shield for 130% damage and a 60% chance to stun.' });
ability('unbreakable', { name: 'Unbreakable', classes: ['warrior'], unlock: 'w_def5', level: 25, mp: 25, cd: 6, kind: 'heal', ultimate: true,
  heal: { pct: 0.3 }, self: [{ id: 'guard', turns: 3, power: 0.8 }], desc: 'ULTIMATE. Heal 30% health and take 80% less damage for 3 enemy turns.' });
ability('rendingBlow', { name: 'Rending Blow', classes: ['warrior'], unlock: 'w_ber1', level: 2, mp: 8, mult: 1.2,
  effects: [{ id: 'bleed', chance: 1, turns: 3, scale: 0.35 }], desc: '120% damage and causes heavy bleeding for 3 turns.' });
ability('bloodthirst', { name: 'Bloodthirst', classes: ['warrior'], unlock: 'w_ber3', level: 10, mp: 14, cd: 2, mult: 1.6, drain: 0.5,
  desc: '160% damage; heal for half the damage dealt.' });
ability('berserkRage', { name: 'Berserk Rage', classes: ['warrior'], unlock: 'w_ber5', level: 25, mp: 28, cd: 6, mult: 2.5, ultimate: true,
  self: [{ id: 'berserk', turns: 4, power: 0.6 }], desc: 'ULTIMATE. Strike for 250% damage and go berserk: attack +60%, defence -30% for 4 turns.' });

/* ---------------- Mage ---------------- */
ability('firebolt', { name: 'Firebolt', classes: ['mage'], unlock: 'starter', mp: 6, mult: 1.6, element: 'fire', ignoreDef: 0.2,
  effects: [{ id: 'burn', chance: 0.3, turns: 3, scale: 0.25 }], desc: 'Hurl a bolt of fire for 160% damage, 30% chance to burn.' });
ability('arcaneShield', { name: 'Arcane Shield', classes: ['mage'], unlock: 'starter', mp: 10, cd: 3, kind: 'buff',
  self: [{ id: 'shield', turns: 3, scale: 2.2 }], desc: 'Conjure a barrier that absorbs damage equal to 220% of your attack.' });
ability('fireball', { name: 'Fireball', classes: ['mage'], unlock: 'm_fire1', level: 2, mp: 14, cd: 1, mult: 2.2, element: 'fire', ignoreDef: 0.2,
  effects: [{ id: 'burn', chance: 0.6, turns: 3, scale: 0.35 }], desc: 'An exploding sphere of flame for 220% damage, 60% chance to burn.' });
ability('immolate', { name: 'Immolate', classes: ['mage'], unlock: 'm_fire3', level: 10, mp: 16, cd: 3, mult: 1.0, element: 'fire', ignoreDef: 0.2,
  effects: [{ id: 'burn', chance: 1, turns: 4, scale: 0.6 }], desc: 'Engulf the target: 100% damage plus a fierce burn for 4 turns.' });
ability('meteor', { name: 'Meteor', classes: ['mage'], unlock: 'm_fire5', level: 25, mp: 40, cd: 5, mult: 4.2, element: 'fire', ignoreDef: 0.3, ultimate: true,
  effects: [{ id: 'burn', chance: 1, turns: 3, scale: 0.5 }], desc: 'ULTIMATE. Call down a meteor for 420% fire damage and burn.' });
ability('iceSpear', { name: 'Ice Spear', classes: ['mage'], unlock: 'm_ice1', level: 2, mp: 12, mult: 1.9, element: 'ice', ignoreDef: 0.2,
  effects: [{ id: 'freeze', chance: 0.35, turns: 2 }], desc: 'A lance of ice for 190% damage, 35% chance to freeze.' });
ability('frostNova', { name: 'Frost Nova', classes: ['mage'], unlock: 'm_ice3', level: 10, mp: 18, cd: 4, mult: 1.2, element: 'ice', ignoreDef: 0.2,
  effects: [{ id: 'freeze', chance: 0.8, turns: 2 }], desc: '120% ice damage with an 80% chance to freeze for 2 turns.' });
ability('blizzard', { name: 'Blizzard', classes: ['mage'], unlock: 'm_ice5', level: 25, mp: 38, cd: 5, mult: 0.95, hits: 4, element: 'ice', ignoreDef: 0.3, ultimate: true,
  effects: [{ id: 'freeze', chance: 0.5, turns: 2 }], desc: 'ULTIMATE. Four waves of ice for 95% damage each; may freeze.' });
ability('healingLight', { name: 'Healing Light', classes: ['mage'], unlock: 'm_arc1', level: 2, mp: 16, cd: 2, kind: 'heal', heal: { pct: 0.35 },
  desc: 'Bathe in holy light, restoring 35% of your max health.' });
ability('arcaneMissiles', { name: 'Arcane Missiles', classes: ['mage'], unlock: 'm_arc3', level: 10, mp: 16, mult: 0.6, hits: 4, element: 'arcane', ignoreDef: 0.5, accurate: true,
  desc: 'Four seeking missiles for 60% damage each. Never miss; ignore half of defence.' });
ability('singularity', { name: 'Singularity', classes: ['mage'], unlock: 'm_arc5', level: 25, mp: 40, cd: 5, mult: 3.6, element: 'arcane', ignoreDef: 0.8, ultimate: true,
  effects: [{ id: 'weakness', chance: 1, turns: 3, power: 0.3 }], desc: 'ULTIMATE. Collapse space on the target: 360% damage ignoring most defence, and weakness.' });

/* ---------------- Rogue ---------------- */
ability('quickStrike', { name: 'Quick Strike', classes: ['rogue'], unlock: 'starter', mp: 5, mult: 0.75, hits: 2, critBonus: 10,
  desc: 'Two lightning-fast cuts for 75% damage each, +10% crit chance.' });
ability('shadowstep', { name: 'Shadowstep', classes: ['rogue'], unlock: 'starter', mp: 8, cd: 3, kind: 'buff',
  self: [{ id: 'evasion', turns: 2, power: 0.5 }, { id: 'focus', turns: 2, power: 40 }], desc: 'Melt into shadow: +50% dodge and +40% crit chance for 2 turns.' });
ability('poisonBlade', { name: 'Poison Blade', classes: ['rogue'], unlock: 'r_ass1', level: 2, mp: 8, mult: 1.2, element: 'poison',
  effects: [{ id: 'poison', chance: 1, turns: 4, scale: 0.4 }], desc: '120% damage and a strong poison for 4 turns.' });
ability('eviscerate', { name: 'Eviscerate', classes: ['rogue'], unlock: 'r_ass3', level: 10, mp: 14, cd: 2, mult: 1.6, dotBonus: 0.5,
  desc: '160% damage, +50% for each poison, burn or bleed on the target.' });
ability('deathMark', { name: 'Death Mark', classes: ['rogue'], unlock: 'r_ass5', level: 25, mp: 32, cd: 5, mult: 3.2, element: 'shadow', ultimate: true,
  effects: [{ id: 'marked', chance: 1, turns: 3, power: 0.35 }], desc: 'ULTIMATE. Mark the target for death (takes 35% more damage), then strike for 320%.' });
ability('smokeScreen', { name: 'Smoke Screen', classes: ['rogue'], unlock: 'r_eva1', level: 2, mp: 10, cd: 4, kind: 'buff',
  self: [{ id: 'evasion', turns: 3, power: 0.6 }], desc: '+60% dodge chance for 3 enemy turns.' });
ability('bladeDance', { name: 'Blade Dance', classes: ['rogue'], unlock: 'r_eva3', level: 10, mp: 14, cd: 2, mult: 0.6, hits: 3,
  self: [{ id: 'evasion', turns: 2, power: 0.3 }], desc: 'Three graceful cuts for 60% each, gaining +30% dodge.' });
ability('phantomAssault', { name: 'Phantom Assault', classes: ['rogue'], unlock: 'r_eva5', level: 25, mp: 34, cd: 5, mult: 0.75, hits: 5, critBonus: 15, element: 'shadow', ultimate: true,
  desc: 'ULTIMATE. Five phantom strikes for 75% each with +15% crit chance.' });
ability('shadowStrike', { name: 'Shadow Strike', classes: ['rogue'], unlock: 'r_sha1', level: 2, mp: 12, cd: 1, mult: 2.0, critBonus: 25, element: 'shadow',
  desc: 'Strike from the shadows for 200% damage with +25% crit chance.' });
ability('shadowSiphon', { name: 'Shadow Siphon', classes: ['rogue'], unlock: 'r_sha3', level: 10, mp: 14, cd: 2, mult: 1.4, drain: 0.6, element: 'shadow',
  desc: '140% shadow damage; heal for 60% of the damage dealt.' });
ability('nightsEmbrace', { name: "Night's Embrace", classes: ['rogue'], unlock: 'r_sha5', level: 25, mp: 30, cd: 5, mult: 2.2, element: 'shadow', ultimate: true,
  effects: [{ id: 'weakness', chance: 1, turns: 3, power: 0.35 }], self: [{ id: 'regen', turns: 3, power: 0.08 }],
  desc: 'ULTIMATE. 220% shadow damage, weakens the enemy and regenerates your health.' });

/* ---------------- Ranger ---------------- */
ability('aimedShot', { name: 'Aimed Shot', classes: ['ranger'], unlock: 'starter', mp: 6, mult: 1.8, critBonus: 15, accurate: true,
  desc: 'A careful shot for 180% damage, +15% crit chance. Never misses.' });
ability('poisonArrow', { name: 'Poison Arrow', classes: ['ranger'], unlock: 'starter', mp: 6, mult: 0.9, element: 'poison',
  effects: [{ id: 'poison', chance: 1, turns: 4, scale: 0.45 }], desc: '90% damage and poisons the target for 4 turns.' });
ability('powerShot', { name: 'Power Shot', classes: ['ranger'], unlock: 'g_arc1', level: 2, mp: 14, cd: 1, mult: 2.4,
  desc: 'Draw to the ear and loose for 240% damage.' });
ability('multishot', { name: 'Multishot', classes: ['ranger'], unlock: 'g_arc3', level: 10, mp: 16, cd: 2, mult: 0.55, hits: 4, accurate: true,
  desc: 'Loose four arrows at once for 55% each. Never miss.' });
ability('stormOfArrows', { name: 'Storm of Arrows', classes: ['ranger'], unlock: 'g_arc5', level: 25, mp: 38, cd: 5, mult: 0.7, hits: 6, element: 'lightning', ultimate: true,
  desc: 'ULTIMATE. Six lightning-charged arrows for 70% damage each.' });
ability('spikeTrap', { name: 'Spike Trap', classes: ['ranger'], unlock: 'g_trp1', level: 2, mp: 10, cd: 2, mult: 0.8,
  effects: [{ id: 'bleed', chance: 1, turns: 3, scale: 0.5 }], desc: 'A spring-loaded trap: 80% damage and severe bleeding.' });
ability('frostTrap', { name: 'Frost Trap', classes: ['ranger'], unlock: 'g_trp3', level: 10, mp: 14, cd: 4, mult: 1.0, element: 'ice',
  effects: [{ id: 'freeze', chance: 0.75, turns: 2 }], desc: '100% ice damage with a 75% chance to freeze.' });
ability('explosiveTrap', { name: 'Explosive Trap', classes: ['ranger'], unlock: 'g_trp5', level: 25, mp: 34, cd: 5, mult: 3.5, element: 'fire', ultimate: true,
  effects: [{ id: 'burn', chance: 1, turns: 3, scale: 0.45 }, { id: 'stun', chance: 0.5, turns: 1 }], desc: 'ULTIMATE. 350% fire damage, burns and may stun.' });
ability('huntersMark', { name: "Hunter's Mark", classes: ['ranger'], unlock: 'g_nat1', level: 2, mp: 8, cd: 4, kind: 'buff',
  effects: [{ id: 'marked', chance: 1, turns: 4, power: 0.3 }], desc: 'Mark your prey: it takes 30% more damage for 4 turns.' });
ability('naturesRemedy', { name: "Nature's Remedy", classes: ['ranger'], unlock: 'g_nat3', level: 10, mp: 16, cd: 3, kind: 'heal', heal: { pct: 0.3 }, cleanse: true,
  self: [{ id: 'regen', turns: 3, power: 0.06 }], desc: 'Heal 30% health, cure harmful effects and regenerate 6% per turn.' });
ability('wrathOfTheWild', { name: 'Wrath of the Wild', classes: ['ranger'], unlock: 'g_nat5', level: 25, mp: 34, cd: 5, mult: 3.0, element: 'poison', ultimate: true,
  effects: [{ id: 'poison', chance: 1, turns: 4, scale: 0.6 }, { id: 'weakness', chance: 1, turns: 3, power: 0.3 }],
  desc: 'ULTIMATE. The forest strikes for 300% damage, poisons and weakens.' });

export const ABILITIES = Object.freeze(A);

export function getAbility(id) {
  return Object.prototype.hasOwnProperty.call(ABILITIES, id) ? ABILITIES[id] : null;
}

/** Mana costs scale gently with level so mana stays a resource to manage. */
export function manaCost(ability, level) {
  return Math.round(ability.mp * (1 + 0.02 * Math.max(0, level - 1)));
}

export const ELEMENTS = {
  physical: { name: 'Physical', color: '#d9d4c7' },
  fire: { name: 'Fire', color: '#ff7a2e' },
  ice: { name: 'Ice', color: '#7fd7ff' },
  lightning: { name: 'Lightning', color: '#ffe066' },
  poison: { name: 'Poison', color: '#7bd448' },
  shadow: { name: 'Shadow', color: '#a37bff' },
  arcane: { name: 'Arcane', color: '#e07bff' },
  holy: { name: 'Holy', color: '#fff2b0' },
};
