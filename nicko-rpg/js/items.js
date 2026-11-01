// Data-driven item database. Every item has a unique id; inventory entries
// reference items by id and carry their own instance uid.

export const RARITIES = {
  common:    { name: 'Common',    order: 0, statMult: 1.0,  valueMult: 1,   color: '#c9c4bb' },
  uncommon:  { name: 'Uncommon',  order: 1, statMult: 1.12, valueMult: 1.6, color: '#5fd068' },
  rare:      { name: 'Rare',      order: 2, statMult: 1.25, valueMult: 2.6, color: '#4aa3ff' },
  epic:      { name: 'Epic',      order: 3, statMult: 1.4,  valueMult: 4.2, color: '#b067ff' },
  legendary: { name: 'Legendary', order: 4, statMult: 1.6,  valueMult: 7,   color: '#ffb02e' },
  mythic:    { name: 'Mythic',    order: 5, statMult: 1.85, valueMult: 12,  color: '#ff4f7b' },
};

export const ITEM_TYPES = {
  weapon: 'Weapon', armor: 'Armour', helmet: 'Helmet', boots: 'Boots', ring: 'Ring',
  amulet: 'Amulet', potion: 'Potion', material: 'Material', quest: 'Quest Item',
};

export const EQUIP_SLOTS = ['weapon', 'armor', 'helmet', 'boots', 'ring', 'amulet'];

export const STAT_NAMES = {
  hp: 'Max Health', mp: 'Max Mana', atk: 'Attack', def: 'Defence', spd: 'Speed',
  crit: 'Crit Chance', critDmg: 'Crit Damage', res: 'Elemental Resist',
};
export const PCT_STATS = new Set(['crit', 'critDmg', 'res']);

export const WEAPON_CLASSES = { sword: ['warrior'], staff: ['mage'], dagger: ['rogue'], bow: ['ranger'], any: null };

// Base stat templates per slot, scaled by item level and rarity.
function baseStats(slot, L, rm, wtype) {
  const r = (x) => Math.max(0, Math.round(x * rm));
  switch (slot) {
    case 'weapon': {
      const s = { atk: r(3 + 1.9 * L) };
      if (wtype === 'staff') s.mp = r(5 + 2 * L);
      if (wtype === 'dagger') s.crit = Math.round(3 + L * 0.1);
      if (wtype === 'bow') s.crit = Math.round(2 + L * 0.06);
      if (wtype === 'sword') s.hp = r(2 * L);
      return s;
    }
    case 'armor': return { def: r(2 + 1.1 * L), hp: r(5 + 4 * L) };
    case 'helmet': return { def: r(1 + 0.5 * L), hp: r(3 + 2.5 * L) };
    case 'boots': return { def: r(1 + 0.35 * L), spd: r(1 + 0.12 * L) };
    default: return {};
  }
}

function equipValue(L, rarity) {
  return Math.round((20 + L * L * 6 + L * 25) * RARITIES[rarity].valueMult);
}

const DB = {};

function eq(id, name, slot, rarity, level, extra, desc, opts = {}) {
  const rm = RARITIES[rarity].statMult;
  const stats = baseStats(slot, level, rm, opts.wtype);
  for (const [k, v] of Object.entries(extra || {})) stats[k] = (stats[k] || 0) + v;
  DB[id] = {
    id, name, type: slot, slot, rarity, level, stats, desc,
    wtype: opts.wtype || (slot === 'weapon' ? 'any' : undefined),
    value: opts.value ?? equipValue(level, rarity),
    stack: 1, shop: !!opts.shop, bossOnly: !!opts.bossOnly, sellable: true,
    bonusVs: opts.bonusVs, // e.g. { tag: 'dragon', mult: 1.5 }
  };
}

function consumable(id, name, rarity, value, effect, desc, opts = {}) {
  DB[id] = { id, name, type: 'potion', rarity, level: opts.level || 1, value, effect, desc, stack: 20, shop: opts.shop !== false, sellable: true, combatOnly: !!opts.combatOnly };
}

function material(id, name, rarity, value, desc) {
  DB[id] = { id, name, type: 'material', rarity, level: 1, value, desc, stack: 99, shop: false, sellable: true };
}

function questItem(id, name, desc, quest) {
  DB[id] = { id, name, type: 'quest', rarity: 'rare', level: 1, value: 0, desc, stack: 10, shop: false, sellable: false, quest };
}

/* ---------- Weapons: Warrior swords ---------- */
eq('rustySword', 'Rusty Sword', 'weapon', 'common', 1, {}, 'A pitted blade. Better than bare fists.', { wtype: 'sword', shop: true });
eq('ironSword', 'Iron Sword', 'weapon', 'common', 4, {}, 'Standard issue for the town guard.', { wtype: 'sword', shop: true });
eq('steelSword', 'Steel Sword', 'weapon', 'uncommon', 10, {}, 'Well balanced and razor sharp.', { wtype: 'sword', shop: true });
eq('knightBlade', "Knight's Blade", 'weapon', 'rare', 16, { def: 4 }, 'Forged for the old order of Emberhollow.', { wtype: 'sword', shop: true });
eq('runicGreatsword', 'Runic Greatsword', 'weapon', 'epic', 24, { crit: 4 }, 'Runes along the fuller pulse with every swing.', { wtype: 'sword' });
eq('warlordCleaver', "Warlord's Cleaver", 'weapon', 'epic', 20, { atk: 6, critDmg: 15 }, 'Taken from the Cursed Warlord. Still warm.', { wtype: 'sword', bossOnly: true });
eq('dragonSlayer', 'Dragon Slayer', 'weapon', 'legendary', 30, { critDmg: 25 }, 'A slab of iron too big to be called a sword. Deals 50% more damage to dragons.', { wtype: 'sword', bonusVs: { tag: 'dragon', mult: 1.5 } });
eq('steelSword2', 'Tempered Claymore', 'weapon', 'rare', 22, {}, 'A heavy two-hander tempered in frost-water.', { wtype: 'sword', shop: true });
eq('titanEdge', 'Edge of the Titan', 'weapon', 'legendary', 42, { hp: 80, critDmg: 20 }, 'Said to have been carved from a fallen star.', { wtype: 'sword' });

/* ---------- Mage staves ---------- */
eq('apprenticeWand', 'Apprentice Wand', 'weapon', 'common', 1, {}, 'A training wand that fizzles more than it flares.', { wtype: 'staff', shop: true });
eq('oakStaff', 'Oak Staff', 'weapon', 'common', 4, {}, 'Carved from a Whispering Woods oak.', { wtype: 'staff', shop: true });
eq('arcaneStaff', 'Arcane Staff', 'weapon', 'uncommon', 10, { res: 4 }, 'Hums softly with arcane power.', { wtype: 'staff', shop: true });
eq('crystalStaff', 'Crystal Staff', 'weapon', 'rare', 16, { crit: 3 }, 'A frost crystal caps the staff, focusing spells.', { wtype: 'staff', shop: true });
eq('emberStaff', 'Staff of Embers', 'weapon', 'epic', 24, { critDmg: 15 }, 'Never quite stops smouldering.', { wtype: 'staff' });
eq('runeStaff', 'Runed Spire', 'weapon', 'rare', 22, {}, 'A tall staff etched with warding runes.', { wtype: 'staff', shop: true });
eq('archmageScepter', "Archmage's Scepter", 'weapon', 'legendary', 30, { mp: 40, res: 8 }, 'Once carried by the Shadow Sorcerer before his fall.', { wtype: 'staff' });
eq('starfallStaff', 'Starfall Staff', 'weapon', 'legendary', 42, { mp: 60, crit: 5 }, 'Pulls meteors from a sky that is not there.', { wtype: 'staff' });

/* ---------- Rogue daggers ---------- */
eq('wornDagger', 'Worn Dagger', 'weapon', 'common', 1, {}, 'Chipped, but still finds the gaps in armour.', { wtype: 'dagger', shop: true });
eq('ironDagger', 'Iron Dagger', 'weapon', 'common', 4, {}, 'Simple, light and quick.', { wtype: 'dagger', shop: true });
eq('shadowDagger', 'Shadow Dagger', 'weapon', 'uncommon', 10, { spd: 2 }, 'Its blade seems to drink the light.', { wtype: 'dagger', shop: true });
eq('venomKris', 'Venom Kris', 'weapon', 'rare', 16, { critDmg: 10 }, 'The wavy blade is grooved to hold poison.', { wtype: 'dagger', shop: true });
eq('nightfang', 'Nightfang', 'weapon', 'epic', 24, { spd: 3 }, 'Strikes twice before its shadow does.', { wtype: 'dagger' });
eq('silentEdge', 'Silent Edge', 'weapon', 'rare', 22, {}, 'Wrapped in felt so it never rings on the sheath.', { wtype: 'dagger', shop: true });
eq('duskreaver', 'Duskreaver', 'weapon', 'legendary', 30, { crit: 6, critDmg: 25 }, 'A dagger of the long dusk. Bleeds the light from the air.', { wtype: 'dagger' });
eq('eclipseFang', 'Eclipse Fang', 'weapon', 'legendary', 42, { spd: 6, crit: 6 }, 'Its edge is a sliver of an eclipsed sun.', { wtype: 'dagger' });

/* ---------- Ranger bows ---------- */
eq('shortBow', 'Short Bow', 'weapon', 'common', 1, {}, 'A light hunting bow.', { wtype: 'bow', shop: true });
eq('huntingBow', 'Hunting Bow', 'weapon', 'common', 4, {}, 'Favoured by Whispering Woods trappers.', { wtype: 'bow', shop: true });
eq('longbow', 'Longbow', 'weapon', 'uncommon', 10, { spd: 1 }, 'Long reach, steady draw.', { wtype: 'bow', shop: true });
eq('compositeBow', 'Composite Bow', 'weapon', 'rare', 16, { critDmg: 10 }, 'Horn and sinew laminated for a brutal draw.', { wtype: 'bow', shop: true });
eq('stormstring', 'Stormstring Bow', 'weapon', 'epic', 24, { spd: 3, crit: 3 }, 'The string crackles with static.', { wtype: 'bow' });
eq('ashwoodBow', 'Ashwood Recurve', 'weapon', 'rare', 22, {}, 'A recurve of pale ash, quick to draw.', { wtype: 'bow', shop: true });
eq('sunpiercer', 'Sunpiercer', 'weapon', 'legendary', 30, { crit: 6, critDmg: 20 }, 'Arrows loosed from it glow like dawn.', { wtype: 'bow' });
eq('galeHorn', 'Galehorn Greatbow', 'weapon', 'legendary', 42, { spd: 6, critDmg: 25 }, 'Each shot sounds like a horn of war.', { wtype: 'bow' });

/* ---------- Universal weapons ---------- */
eq('moonsteelBlade', 'Moonsteel Blade', 'weapon', 'rare', 12, { crit: 4, mp: 15 }, 'A magical sword reforged from moonsteel shards. Any hero can wield it.', { wtype: 'any' });
eq('voidblade', 'Mythic Voidblade', 'weapon', 'mythic', 40, { crit: 8, critDmg: 35, spd: 4 }, 'A rift given an edge. Usable by every class.', { wtype: 'any', bossOnly: true });
eq('tyrantBane', 'Tyrantbane', 'weapon', 'mythic', 50, { crit: 10, critDmg: 40, hp: 120 }, 'The blade that ended an eternal reign.', { wtype: 'any', bossOnly: true });

/* ---------- Armour ---------- */
eq('clothTunic', 'Cloth Tunic', 'armor', 'common', 1, {}, 'Keeps the wind off. Barely.', { shop: true });
eq('leatherArmor', 'Leather Armour', 'armor', 'common', 3, { spd: 1 }, 'Supple boiled leather.', { shop: true });
eq('mageRobes', 'Mage Robes', 'armor', 'uncommon', 6, { mp: 30, res: 6, def: -2 }, 'Embroidered with protective sigils. Light, but thin.', { shop: true });
eq('ironArmor', 'Iron Armour', 'armor', 'common', 8, { spd: -1 }, 'Heavy plates riveted to mail.', { shop: true });
eq('scaleMail', 'Scale Mail', 'armor', 'uncommon', 13, {}, 'Overlapping steel scales.', { shop: true });
eq('shadowArmor', 'Shadow Armour', 'armor', 'rare', 18, { spd: 3, crit: 3 }, 'Dark leather that muffles every step.', { shop: true });
eq('warlordPlate', "Warlord's Plate", 'armor', 'epic', 20, { hp: 40, res: 5 }, 'Black plate etched with curses that now protect you.', { bossOnly: true });
eq('frostweave', 'Frostweave Robes', 'armor', 'rare', 22, { mp: 40, res: 12 }, 'Spun from frozen spider silk.', { shop: true });
eq('runeplate', 'Runeplate', 'armor', 'epic', 26, { res: 8 }, 'Every plate bears a warding rune.', {});
eq('dragonScale', 'Dragon Scale Armour', 'armor', 'legendary', 30, { res: 15, hp: 60 }, 'Scales of the Ancient Dragon. Shrugs off fire.', { bossOnly: true });
eq('voidweave', 'Voidweave Mantle', 'armor', 'mythic', 45, { res: 18, spd: 4 }, 'Woven from the threads between worlds.', { bossOnly: true });
eq('bastionPlate', 'Bastion Plate', 'armor', 'rare', 34, {}, 'Plate armour forged for the frontier wars.', { shop: true });

/* ---------- Helmets ---------- */
eq('leatherCap', 'Leather Cap', 'helmet', 'common', 1, {}, 'A simple padded cap.', { shop: true });
eq('ironHelm', 'Iron Helm', 'helmet', 'common', 7, {}, 'Dented but dependable.', { shop: true });
eq('goblinCrown', 'Crown of the Goblin King', 'helmet', 'rare', 5, { atk: 3, crit: 2 }, 'Too small for your head, yet it fits perfectly.', { bossOnly: true });
eq('steelHelm', 'Steel Helm', 'helmet', 'uncommon', 14, {}, 'Visored and sturdy.', { shop: true });
eq('circletOfFocus', 'Circlet of Focus', 'helmet', 'rare', 18, { mp: 25, crit: 2 }, 'Clears the mind before a spell.', { shop: true });
eq('frostCrown', 'Crown of Frost', 'helmet', 'epic', 26, { res: 10, mp: 20 }, 'Rimed with ice that never melts.', {});
eq('dragonboneHelm', 'Dragonbone Helm', 'helmet', 'legendary', 32, { atk: 8, res: 8 }, 'The skull of a lesser drake, hollowed out.', {});
eq('lichCrown', 'Crown of the Lich Emperor', 'helmet', 'legendary', 40, { mp: 60, crit: 5, res: 10 }, 'Cold to the touch. Whispers at night.', { bossOnly: true });
eq('greatHelm', 'Great Helm', 'helmet', 'rare', 30, {}, 'Full-face plate helm.', { shop: true });

/* ---------- Boots ---------- */
eq('wornBoots', 'Worn Boots', 'boots', 'common', 1, {}, 'Holes in both soles.', { shop: true });
eq('leatherBoots', 'Leather Boots', 'boots', 'common', 4, {}, 'Good for long walks.', { shop: true });
eq('swiftBoots', 'Swift Boots', 'boots', 'uncommon', 10, { spd: 2 }, 'Light as a feather.', { shop: true });
eq('ironGreaves', 'Iron Greaves', 'boots', 'uncommon', 14, { def: 4, spd: -1 }, 'Heavy, but nothing gets through.', { shop: true });
eq('shadowTreads', 'Shadow Treads', 'boots', 'rare', 18, { spd: 3, crit: 2 }, 'Your footsteps vanish.', { shop: true });
eq('windwalkers', 'Windwalkers', 'boots', 'epic', 26, { spd: 4 }, 'You could run across a lake in these.', {});
eq('tempestBoots', 'Boots of the Tempest', 'boots', 'legendary', 34, { spd: 6, crit: 3 }, 'Lightning dances around your ankles.', {});
eq('marchBoots', 'Marching Boots', 'boots', 'rare', 30, {}, 'Reinforced soldier boots.', { shop: true });

/* ---------- Rings ---------- */
eq('copperRing', 'Copper Ring', 'ring', 'common', 2, { crit: 2 }, 'A plain band. Lucky, apparently.', { shop: true });
eq('ringOfVigor', 'Ring of Vigor', 'ring', 'uncommon', 8, { hp: 45 }, 'You feel healthier just wearing it.', { shop: true });
eq('goblinSignet', 'Goblin Signet', 'ring', 'rare', 5, { atk: 4, spd: 1 }, 'The Goblin King\'s seal of office.', { bossOnly: true });
eq('ringOfPower', 'Ring of Power', 'ring', 'rare', 12, { atk: 9 }, 'Strength flows into your arms.', { shop: true });
eq('boneRing', 'Reaper\'s Band', 'ring', 'epic', 10, { atk: 6, crit: 4, critDmg: 10 }, 'Carved from the Bone Reaper\'s knuckle.', { bossOnly: true });
eq('ringOfPrecision', 'Ring of Precision', 'ring', 'rare', 16, { crit: 5, critDmg: 15 }, 'Steadies the hand.', { shop: true });
eq('arcaneRing', 'Ring of the Arcane', 'ring', 'rare', 20, { mp: 40, atk: 5 }, 'A spiral of silver around a violet stone.', { shop: true });
eq('dragonEye', "Dragon's Eye Ring", 'ring', 'legendary', 30, { atk: 18, crit: 6, critDmg: 20 }, 'The gem blinks when you aren\'t looking.', {});
eq('voidLoop', 'Loop of the Void', 'ring', 'mythic', 35, { atk: 22, crit: 8, spd: 4 }, 'A ring with no inside.', { bossOnly: true });
eq('ringOfTitan', "Titan's Ring", 'ring', 'epic', 36, { hp: 160, atk: 12 }, 'Heavy as a mountain.', {});

/* ---------- Amulets ---------- */
eq('woodenCharm', 'Wooden Charm', 'amulet', 'common', 2, { hp: 20 }, 'Whittled by a grandmother, for luck.', { shop: true });
eq('wardingAmulet', 'Amulet of Warding', 'amulet', 'uncommon', 10, { def: 4, res: 8 }, 'Turns aside curses and flame alike.', { shop: true });
eq('silkPendant', 'Spider Silk Pendant', 'amulet', 'epic', 15, { hp: 70, spd: 3, res: 6 }, 'Woven by the Spider Queen herself.', { bossOnly: true });
eq('amuletOfFury', 'Amulet of Fury', 'amulet', 'rare', 20, { atk: 10, crit: 3 }, 'Pounds like a second heart.', { shop: true });
eq('sorcererPendant', "Sorcerer's Pendant", 'amulet', 'epic', 25, { mp: 60, atk: 8, res: 10 }, 'Shadows coil inside the glass.', { bossOnly: true });
eq('dragonHeart', 'Heart of the Dragon', 'amulet', 'legendary', 30, { hp: 150, atk: 12, res: 12 }, 'It still beats.', { bossOnly: true });
eq('heraldSigil', "Herald's Sigil", 'amulet', 'legendary', 35, { atk: 16, spd: 5, crit: 4 }, 'Marks you as one who walked the Shadow Realm.', { bossOnly: true });
eq('behemothTooth', 'Behemoth Tooth', 'amulet', 'mythic', 45, { hp: 260, def: 20, res: 12 }, 'Bigger than your fist. Hums with abyssal power.', { bossOnly: true });
eq('amuletOfSages', 'Amulet of Sages', 'amulet', 'epic', 32, { mp: 70, crit: 4, res: 10 }, 'Bright with old knowledge.', {});

/* ---------- Potions ---------- */
consumable('smallHealthPotion', 'Small Health Potion', 'common', 25, { healPct: 0.35, healMin: 40 }, 'Restores 35% of your max health (at least 40).');
consumable('largeHealthPotion', 'Large Health Potion', 'uncommon', 75, { healPct: 0.7, healMin: 120 }, 'Restores 70% of your max health (at least 120).', { level: 8 });
consumable('manaPotion', 'Mana Potion', 'common', 30, { manaPct: 0.4, manaMin: 25 }, 'Restores 40% of your max mana (at least 25).');
consumable('greaterManaPotion', 'Greater Mana Potion', 'uncommon', 85, { manaPct: 0.8, manaMin: 70 }, 'Restores 80% of your max mana (at least 70).', { level: 8 });
consumable('antidote', 'Antidote', 'common', 20, { cure: ['poison', 'burn', 'bleed'] }, 'Cures poison, burns and bleeding.');
consumable('strengthPotion', 'Strength Potion', 'uncommon', 60, { status: { id: 'atkUp', turns: 4, power: 0.3 } }, 'Attack +30% for 4 turns.', { combatOnly: true });
consumable('defencePotion', 'Defence Potion', 'uncommon', 60, { status: { id: 'defUp', turns: 4, power: 0.5 } }, 'Defence +50% for 4 turns.', { combatOnly: true });
consumable('regenTonic', 'Regeneration Tonic', 'rare', 110, { status: { id: 'regen', turns: 5, power: 0.08 } }, 'Regenerate 8% of max health each turn for 5 turns.', { level: 12 });
consumable('elixir', 'Elixir of Renewal', 'epic', 400, { healPct: 1, manaPct: 1, cure: ['poison', 'burn', 'bleed', 'weakness', 'freeze'] }, 'Fully restores health and mana and removes harmful effects.', { level: 20 });
consumable('smokeBomb', 'Smoke Bomb', 'uncommon', 45, { flee: true }, 'Guarantees escape from an ordinary fight. Useless against bosses.', { combatOnly: true });

/* ---------- Materials ---------- */
material('slimeGel', 'Slime Gel', 'common', 4, 'Wobbly and faintly glowing.');
material('wolfPelt', 'Wolf Pelt', 'common', 8, 'Thick grey fur. Tanners pay well.');
material('goblinEar', 'Goblin Ear', 'common', 6, 'Proof of a goblin hunt. Ew.');
material('boneFragment', 'Bone Fragment', 'common', 9, 'Old, dry and humming with necromancy.');
material('spiderSilk', 'Spider Silk', 'uncommon', 18, 'Stronger than steel wire.');
material('orcTusk', 'Orc Tusk', 'uncommon', 22, 'Yellowed and cracked.');
material('arcaneDust', 'Arcane Dust', 'uncommon', 28, 'Sparkles when you breathe on it.');
material('trollHide', 'Troll Hide', 'uncommon', 32, 'Still trying to heal itself.');
material('ectoplasm', 'Ectoplasm', 'rare', 40, 'Cold, sticky and slightly sad.');
material('frostCrystal', 'Frost Crystal', 'rare', 50, 'Never melts, even in a forge.');
material('shadowEssence', 'Shadow Essence', 'rare', 65, 'A wisp of living darkness in a vial.');
material('dragonScaleMat', 'Dragon Scale', 'epic', 120, 'Harder than any metal you know.');
material('voidShard', 'Void Shard', 'epic', 150, 'A splinter of nothing at all.');

/* ---------- Quest items ---------- */
questItem('travellerLocket', "Traveller's Locket", 'A silver locket with a portrait inside. Belongs to Edda the lost traveller.', 'lostTraveller');
questItem('moonsteelShard', 'Moonsteel Shard', 'A shard of the legendary Moonsteel Blade. The smith in town could reforge it.', 'moonsteel');
questItem('crypticMap', 'Cryptic Map', 'A map of the Forgotten Crypt\'s lower halls.', 'intoCrypt');

export const ITEMS = Object.freeze(DB);

export function getItem(id) {
  return Object.prototype.hasOwnProperty.call(ITEMS, id) ? ITEMS[id] : null;
}

export function isEquipment(def) {
  return !!def && EQUIP_SLOTS.includes(def.type);
}

export function canClassUse(def, classId) {
  if (!def || def.type !== 'weapon') return true;
  const allowed = WEAPON_CLASSES[def.wtype || 'any'];
  return !allowed || allowed.includes(classId);
}

/** Stats of an equipment instance including upgrade level (+8% per level, rounded). */
export function instanceStats(def, plus = 0) {
  const out = {};
  if (!def || !def.stats) return out;
  const m = 1 + 0.08 * Math.max(0, plus);
  for (const [k, v] of Object.entries(def.stats)) {
    out[k] = v > 0 ? Math.round(v * m) : v; // penalties don't grow
  }
  return out;
}

export function sellPrice(def, plus = 0) {
  if (!def || !def.sellable) return 0;
  return Math.max(1, Math.floor(def.value * 0.4 * (1 + 0.15 * Math.max(0, plus))));
}

export function itemsOfType(type) {
  return Object.values(ITEMS).filter((i) => i.type === type);
}
