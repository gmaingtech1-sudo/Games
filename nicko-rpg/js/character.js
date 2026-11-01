// Character classes, the experience curve, derived statistics and level-ups.

import { getItem, instanceStats, EQUIP_SLOTS } from './items.js';
import { passiveMods } from './skillTree.js';
import { clamp } from './utils.js';

export const MAX_LEVEL = 50;

export const CLASSES = {
  warrior: {
    id: 'warrior', name: 'Warrior', color: '#e0334a',
    tagline: 'An armoured juggernaut who outlasts anything.',
    strengths: ['Highest health and defence', 'Strong physical damage', 'Can stun and shrug off hits'],
    weaknesses: ['Small mana pool', 'Slow', 'No elemental magic'],
    playstyle: 'Trade blows head-on. Use Shield Block when an enemy winds up, then punish with Heavy Strike.',
    base: { hp: 120, mp: 30, atk: 14, def: 10, spd: 8, crit: 5, critDmg: 150, res: 0 },
    growth: { hp: 17, mp: 3, atk: 2.9, def: 2.0, spd: 0.35, crit: 0.08 },
    mpRegen: 0.08,
    start: { weapon: 'rustySword', armor: 'clothTunic' },
  },
  mage: {
    id: 'mage', name: 'Mage', color: '#b067ff',
    tagline: 'A scholar of fire, frost and the arcane.',
    strengths: ['Huge elemental damage', 'Exploits enemy weaknesses', 'Large mana pool and shields'],
    weaknesses: ['Lowest health and defence', 'Relies on mana', 'Weak basic attack'],
    playstyle: 'Keep an Arcane Shield up and burn enemies down with spells. Match your element to their weakness.',
    base: { hp: 80, mp: 70, atk: 16, def: 5, spd: 10, crit: 6, critDmg: 160, res: 5 },
    growth: { hp: 10, mp: 8, atk: 2.8, def: 1.0, spd: 0.4, crit: 0.1 },
    mpRegen: 0.04,
    start: { weapon: 'apprenticeWand', armor: 'clothTunic' },
    basicMult: 0.8,
  },
  rogue: {
    id: 'rogue', name: 'Rogue', color: '#7bd448',
    tagline: 'A blur of steel that strikes from the shadows.',
    strengths: ['Fastest class, dodges often', 'Very high critical hits', 'Poisons stack up damage'],
    weaknesses: ['Fragile if caught', 'Damage relies on crits and setup'],
    playstyle: 'Shadowstep before big hits, poison the enemy, then Eviscerate for massive damage.',
    base: { hp: 95, mp: 40, atk: 13, def: 7, spd: 15, crit: 15, critDmg: 175, res: 0 },
    growth: { hp: 12.5, mp: 4, atk: 2.8, def: 1.3, spd: 0.7, crit: 0.25 },
    mpRegen: 0.06,
    start: { weapon: 'wornDagger', armor: 'clothTunic' },
  },
  ranger: {
    id: 'ranger', name: 'Ranger', color: '#ffd166',
    tagline: 'A patient hunter with a bow and a bag of traps.',
    strengths: ['Accurate shots that never miss', 'Damage over time', 'Self-healing from nature'],
    weaknesses: ['Average defence', 'Damage builds up slowly'],
    playstyle: "Open with Hunter's Mark and Poison Arrow, then let Aimed Shots and traps finish the job.",
    base: { hp: 100, mp: 45, atk: 14, def: 7, spd: 12, crit: 10, critDmg: 160, res: 0 },
    growth: { hp: 13, mp: 4.5, atk: 2.8, def: 1.4, spd: 0.5, crit: 0.15 },
    mpRegen: 0.05,
    start: { weapon: 'shortBow', armor: 'clothTunic' },
  },
};

/** Experience needed to go from `level` to `level + 1`. Grows faster than linearly. */
export function xpToNext(level) {
  if (level >= MAX_LEVEL) return Infinity;
  return Math.round(50 * Math.pow(level, 1.6) + 30 * level);
}

/** Skill points granted on reaching `level` (bonus point every 10 levels). */
export function skillPointsForLevel(level) {
  return level % 10 === 0 ? 2 : 1;
}

/** Stats from class + level alone (no gear, no skills). */
export function baseStatsAt(classId, level) {
  const c = CLASSES[classId];
  const s = {};
  for (const k of Object.keys(c.base)) s[k] = c.base[k] + (c.growth[k] || 0) * (level - 1);
  return s;
}

export function equipmentStats(player) {
  const s = {};
  for (const slot of EQUIP_SLOTS) {
    const inst = player.equipment?.[slot];
    if (!inst) continue;
    const def = getItem(inst.id);
    if (!def) continue;
    for (const [k, v] of Object.entries(instanceStats(def, inst.plus))) s[k] = (s[k] || 0) + v;
  }
  return s;
}

/**
 * Final derived stats. Always recomputed from scratch from class, level,
 * equipped items and learned passives, so a bonus can never be applied twice.
 */
export function computeStats(player) {
  const base = baseStatsAt(player.classId, player.level);
  const gear = equipmentStats(player);
  const mods = passiveMods(player);
  const add = (k) => (base[k] || 0) + (gear[k] || 0);
  const s = {
    maxHp: add('hp') * (1 + (mods.hpPct || 0)),
    maxMp: add('mp') * (1 + (mods.mpPct || 0)),
    atk: add('atk') * (1 + (mods.atkPct || 0)),
    def: add('def') * (1 + (mods.defPct || 0)),
    spd: add('spd') + (mods.spd || 0),
    crit: add('crit') + (mods.crit || 0),
    critDmg: add('critDmg') + (mods.critDmg || 0),
    res: add('res') + (mods.res || 0),
  };
  s.maxHp = Math.max(1, Math.round(s.maxHp));
  s.maxMp = Math.max(0, Math.round(s.maxMp));
  s.atk = Math.max(1, Math.round(s.atk));
  s.def = Math.max(0, Math.round(s.def));
  s.spd = Math.max(1, Math.round(s.spd));
  s.crit = clamp(Math.round(s.crit), 0, 75);
  s.critDmg = Math.max(100, Math.round(s.critDmg));
  s.res = clamp(Math.round(s.res), 0, 60);
  s.mods = mods;
  return s;
}

/** Keep hp/mp/gold/xp within legal bounds. Called after anything that changes them. */
export function clampVitals(player) {
  const s = computeStats(player);
  player.hp = clamp(Math.round(player.hp), 0, s.maxHp);
  player.mp = clamp(Math.round(player.mp), 0, s.maxMp);
  player.gold = Math.max(0, Math.floor(player.gold));
  player.xp = Math.max(0, Math.floor(player.xp));
  player.skillPoints = Math.max(0, Math.floor(player.skillPoints));
  return s;
}

/**
 * Add experience and process any level-ups. Returns an array describing each
 * level gained so the UI can announce it.
 */
export function gainXp(player, amount) {
  amount = Math.max(0, Math.floor(amount || 0));
  const levels = [];
  if (player.level >= MAX_LEVEL) { player.xp = 0; return levels; }
  player.xp += amount;
  while (player.level < MAX_LEVEL && player.xp >= xpToNext(player.level)) {
    player.xp -= xpToNext(player.level);
    const before = computeStats(player);
    player.level += 1;
    const pts = skillPointsForLevel(player.level);
    player.skillPoints += pts;
    const after = computeStats(player);
    // Gains in max hp/mp are added to current, then 30% of max is restored.
    player.hp = Math.min(after.maxHp, player.hp + (after.maxHp - before.maxHp) + Math.round(after.maxHp * 0.3));
    player.mp = Math.min(after.maxMp, player.mp + (after.maxMp - before.maxMp) + Math.round(after.maxMp * 0.3));
    levels.push({
      level: player.level, skillPoints: pts,
      gains: { maxHp: after.maxHp - before.maxHp, maxMp: after.maxMp - before.maxMp, atk: after.atk - before.atk, def: after.def - before.def },
    });
  }
  if (player.level >= MAX_LEVEL) player.xp = 0;
  clampVitals(player);
  return levels;
}

export function createPlayer(name, classId) {
  if (!CLASSES[classId]) throw new Error('Unknown class');
  const p = {
    name: sanitizeName(name) || 'Nicko', classId, level: 1, xp: 0,
    hp: 0, mp: 0, gold: 50, skillPoints: 0, skills: {},
    equipment: { weapon: null, armor: null, helmet: null, boots: null, ring: null, amulet: null },
  };
  for (const [slot, id] of Object.entries(CLASSES[classId].start)) p.equipment[slot] = { uid: `start-${slot}`, id, qty: 1, plus: 0 };
  const s = computeStats(p);
  p.hp = s.maxHp;
  p.mp = s.maxMp;
  return p;
}

export function sanitizeName(name) {
  return String(name ?? '').replace(/[^\p{L}\p{N} '\-_]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 18);
}
