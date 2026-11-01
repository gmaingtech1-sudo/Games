// Developer tool logic: create, validate, store, duplicate and delete custom
// enemies. Custom enemies are kept in their own storage key and never modify
// the built-in ENEMIES database. Test fights with them never grant rewards.

import { storage } from './saveSystem.js';
import { ENEMY_ABILITIES, BEHAVIOURS, createEnemyUnit } from './enemies.js';
import { getItem } from './items.js';
import { uid } from './utils.js';

const KEY = 'nickoRpg.customEnemies';
export const MAX_CUSTOM = 50;
export const SHAPES = ['blob', 'humanoid', 'skull', 'beast', 'spider', 'brute', 'caster', 'ghost', 'dragon', 'golem', 'fiend', 'eye'];
export const ELEMENT_OPTIONS = ['physical', 'fire', 'ice', 'lightning', 'poison', 'shadow', 'arcane', 'holy'];

export const LIMITS = {
  level: [1, 60], hp: [1, 50000], atk: [1, 2000], def: [0, 2000], spd: [1, 200], xp: [0, 50000], gold: [0, 50000], scale: [0.6, 1.4],
};

// Abilities a custom enemy may use (bosses' unique moves are excluded).
export const ALLOWED_ABILITIES = ['attack', 'acidSplash', 'oozeRegrowth', 'quickStab', 'dirtyTrick', 'rattlingSlash', 'boneShield', 'bite', 'howl',
  'venomBite', 'webShot', 'orcCleave', 'warCry', 'brutalSmash', 'darkBolt', 'manaDrain', 'curse', 'trollSmash', 'trollRegen', 'wail', 'lifeTouch',
  'clawRake', 'tailSwipe', 'fireBreath', 'frostBite', 'iceShard', 'shadowClaw', 'voidGaze', 'healingChant', 'firebolt', 'stoneSkin', 'crush'];

export function blankEnemy() {
  return {
    id: null, name: 'New Monster', desc: 'A mysterious creature.', level: 5,
    hp: 180, atk: 30, def: 12, spd: 10, xp: 80, gold: 30,
    abilities: ['attack'], behaviour: 'balanced', weak: [], resist: [],
    loot: [],
    look: { shape: 'blob', color: '#7a4fd1', accent: '#ffd166', scale: 1, aura: false },
  };
}

const isColor = (c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);

/** Validate a draft. Returns { ok, errors: { field: message }, value } with a cleaned copy. */
export function validateEnemy(d) {
  const errors = {};
  const v = {};
  const name = String(d?.name ?? '').trim();
  if (name.length < 2 || name.length > 24) errors.name = 'Name must be 2-24 characters.';
  else if (!/^[\p{L}\p{N} '\-]+$/u.test(name)) errors.name = 'Use letters, numbers, spaces, apostrophes or hyphens.';
  v.name = name;
  const desc = String(d?.desc ?? '').trim();
  if (desc.length > 160) errors.desc = 'Description must be 160 characters or fewer.';
  v.desc = desc || 'A custom creature.';
  for (const f of ['level', 'hp', 'atk', 'def', 'spd', 'xp', 'gold']) {
    const raw = d?.[f];
    const n = typeof raw === 'number' ? raw : Number(String(raw ?? '').trim());
    const [lo, hi] = LIMITS[f];
    if (String(raw ?? '').trim() === '' || !Number.isFinite(n) || !Number.isInteger(n)) errors[f] = 'Enter a whole number.';
    else if (n < lo || n > hi) errors[f] = `Must be between ${lo} and ${hi}.`;
    v[f] = Number.isFinite(n) ? Math.round(n) : lo;
  }
  const abilities = Array.isArray(d?.abilities) ? [...new Set(d.abilities)] : [];
  if (!abilities.length) errors.abilities = 'Pick at least one ability.';
  else if (abilities.length > 6) errors.abilities = 'Pick at most 6 abilities.';
  else if (abilities.some((a) => !ALLOWED_ABILITIES.includes(a) || !ENEMY_ABILITIES[a])) errors.abilities = 'Unknown ability selected.';
  v.abilities = abilities.filter((a) => ALLOWED_ABILITIES.includes(a));
  v.behaviour = BEHAVIOURS[d?.behaviour] ? d.behaviour : (errors.behaviour = 'Choose a behaviour.', 'balanced');
  v.weak = (Array.isArray(d?.weak) ? d.weak : []).filter((e) => ELEMENT_OPTIONS.includes(e));
  v.resist = (Array.isArray(d?.resist) ? d.resist : []).filter((e) => ELEMENT_OPTIONS.includes(e));
  if (v.weak.some((e) => v.resist.includes(e))) errors.weak = 'An element cannot be both a weakness and a resistance.';
  const loot = Array.isArray(d?.loot) ? d.loot : [];
  if (loot.length > 5) errors.loot = 'At most 5 loot entries.';
  v.loot = [];
  loot.slice(0, 5).forEach((l, i) => {
    const def = getItem(l?.id);
    const chance = Number(l?.chance);
    if (!def || def.type === 'quest') errors[`loot${i}`] = 'Choose a valid item.';
    else if (!Number.isFinite(chance) || chance < 1 || chance > 100) errors[`loot${i}`] = 'Drop chance must be 1-100%.';
    else v.loot.push({ id: def.id, chance: Math.round(chance) });
  });
  const look = d?.look || {};
  v.look = {
    shape: SHAPES.includes(look.shape) ? look.shape : 'blob',
    color: isColor(look.color) ? look.color : '#7a4fd1',
    accent: isColor(look.accent) ? look.accent : '#ffd166',
    scale: Math.min(LIMITS.scale[1], Math.max(LIMITS.scale[0], Number(look.scale) || 1)),
    aura: look.aura === true,
  };
  if (!SHAPES.includes(look.shape)) errors.shape = 'Choose a shape.';
  v.id = typeof d?.id === 'string' && /^c_[a-z0-9]+$/i.test(d.id) ? d.id : null;
  return { ok: Object.keys(errors).length === 0, errors, value: v };
}

export function loadCustomEnemies() {
  try {
    const arr = JSON.parse(storage.get(KEY) || '[]');
    if (!Array.isArray(arr)) return [];
    return arr.map((e) => validateEnemy(e)).filter((r) => r.ok && r.value.id).map((r) => r.value).slice(0, MAX_CUSTOM);
  } catch {
    return [];
  }
}

function persist(list) {
  storage.set(KEY, JSON.stringify(list));
}

export function saveCustomEnemy(draft) {
  const res = validateEnemy(draft);
  if (!res.ok) return res;
  const list = loadCustomEnemies();
  const v = res.value;
  if (v.id && list.some((e) => e.id === v.id)) {
    const i = list.findIndex((e) => e.id === v.id);
    list[i] = v;
  } else {
    if (list.length >= MAX_CUSTOM) return { ok: false, errors: { name: `You can keep up to ${MAX_CUSTOM} custom enemies.` } };
    v.id = 'c_' + uid('').replace(/[^a-z0-9]/gi, '');
    list.push(v);
  }
  persist(list);
  return { ok: true, value: v, errors: {} };
}

export function duplicateCustomEnemy(id) {
  const list = loadCustomEnemies();
  const src = list.find((e) => e.id === id);
  if (!src) return { ok: false };
  const copy = { ...structuredCloneSafe(src), id: null, name: (src.name + ' Copy').slice(0, 24) };
  return saveCustomEnemy(copy);
}

export function deleteCustomEnemy(id) {
  const list = loadCustomEnemies();
  const next = list.filter((e) => e.id !== id);
  persist(next);
  return next.length !== list.length;
}

function structuredCloneSafe(o) { return JSON.parse(JSON.stringify(o)); }

/** Turn a stored custom enemy into a combat unit (always a test fight). */
export function customEnemyUnit(v) {
  const tpl = {
    id: v.id || 'custom', custom: true, name: v.name, desc: v.desc,
    fixed: { hp: v.hp, atk: v.atk, def: v.def, spd: v.spd, xp: v.xp, gold: v.gold },
    abilities: v.abilities, behaviour: v.behaviour, weak: v.weak, resist: v.resist, immune: [], tags: ['custom'],
    loot: v.loot.map((l) => ({ id: l.id, chance: l.chance / 100 })), gearChance: 0, look: v.look,
  };
  return createEnemyUnit(tpl, v.level, { variance: 0 });
}
