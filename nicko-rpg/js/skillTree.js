// Skill trees: three branches per class, five tiers per branch.
// Tiers 1, 3 and 5 teach abilities (tier 5 is an ultimate); tiers 2 and 4 are
// passive bonuses with up to three ranks. Each tier requires the previous tier
// of the same branch and a minimum character level.

import { ABILITIES } from './abilities.js';

const TIER = {
  1: { level: 2, cost: 1, maxRank: 1 },
  2: { level: 5, cost: 1, maxRank: 3 },
  3: { level: 10, cost: 2, maxRank: 1 },
  4: { level: 16, cost: 2, maxRank: 3 },
  5: { level: 25, cost: 3, maxRank: 1 },
};

export const PASSIVE_LABELS = {
  hpPct: (v) => `+${Math.round(v * 100)}% max health`,
  mpPct: (v) => `+${Math.round(v * 100)}% max mana`,
  atkPct: (v) => `+${Math.round(v * 100)}% attack`,
  defPct: (v) => `+${Math.round(v * 100)}% defence`,
  spd: (v) => `+${v} speed`,
  crit: (v) => `+${v}% crit chance`,
  critDmg: (v) => `+${v}% crit damage`,
  res: (v) => `+${v}% elemental resist`,
  dodge: (v) => `+${v}% dodge chance`,
  dotPct: (v) => `+${Math.round(v * 100)}% damage over time`,
  healPct: (v) => `+${Math.round(v * 100)}% healing`,
  mpRegen: (v) => `+${Math.round(v * 100)}% mana regen per turn`,
  elemPct: (v) => `+${Math.round(v * 100)}% elemental damage`,
  lifesteal: (v) => `Heal ${Math.round(v * 100)}% of damage dealt`,
};

export const BRANCHES = {
  warrior: [
    { id: 'off', name: 'Offensive', color: '#ff7a2e', nodes: [
      { ability: 'whirlwind' },
      { name: 'Weapon Mastery', passive: { atkPct: 0.05 } },
      { ability: 'thunderStrike' },
      { name: 'Executioner', passive: { critDmg: 10, crit: 2 } },
      { ability: 'titansWrath' },
    ] },
    { id: 'def', name: 'Defensive', color: '#5aa9ff', nodes: [
      { ability: 'ironSkin' },
      { name: 'Toughness', passive: { hpPct: 0.06 } },
      { ability: 'shieldBash' },
      { name: 'Bulwark', passive: { defPct: 0.06, res: 3 } },
      { ability: 'unbreakable' },
    ] },
    { id: 'ber', name: 'Berserker', color: '#e0334a', nodes: [
      { ability: 'rendingBlow' },
      { name: 'Bloodlust', passive: { lifesteal: 0.03 } },
      { ability: 'bloodthirst' },
      { name: 'Fury', passive: { atkPct: 0.04, crit: 2 } },
      { ability: 'berserkRage' },
    ] },
  ],
  mage: [
    { id: 'fire', name: 'Fire Magic', color: '#ff7a2e', nodes: [
      { ability: 'fireball' },
      { name: 'Pyromancy', passive: { dotPct: 0.1, elemPct: 0.03 } },
      { ability: 'immolate' },
      { name: 'Inferno', passive: { elemPct: 0.04 } },
      { ability: 'meteor' },
    ] },
    { id: 'ice', name: 'Ice Magic', color: '#7fd7ff', nodes: [
      { ability: 'iceSpear' },
      { name: 'Frost Armour', passive: { defPct: 0.08, res: 3 } },
      { ability: 'frostNova' },
      { name: 'Permafrost', passive: { hpPct: 0.06, mpPct: 0.04 } },
      { ability: 'blizzard' },
    ] },
    { id: 'arc', name: 'Arcane Magic', color: '#e07bff', nodes: [
      { ability: 'healingLight' },
      { name: 'Arcane Intellect', passive: { mpPct: 0.08, mpRegen: 0.01 } },
      { ability: 'arcaneMissiles' },
      { name: 'Spell Mastery', passive: { crit: 3, critDmg: 8 } },
      { ability: 'singularity' },
    ] },
  ],
  rogue: [
    { id: 'ass', name: 'Assassination', color: '#7bd448', nodes: [
      { ability: 'poisonBlade' },
      { name: 'Lethality', passive: { critDmg: 12 } },
      { ability: 'eviscerate' },
      { name: 'Toxicology', passive: { dotPct: 0.15 } },
      { ability: 'deathMark' },
    ] },
    { id: 'eva', name: 'Evasion', color: '#c0c0ff', nodes: [
      { ability: 'smokeScreen' },
      { name: 'Nimble', passive: { dodge: 3, spd: 1 } },
      { ability: 'bladeDance' },
      { name: 'Acrobatics', passive: { dodge: 3, hpPct: 0.04 } },
      { ability: 'phantomAssault' },
    ] },
    { id: 'sha', name: 'Shadow Magic', color: '#a37bff', nodes: [
      { ability: 'shadowStrike' },
      { name: 'Dark Pact', passive: { mpPct: 0.08, elemPct: 0.03 } },
      { ability: 'shadowSiphon' },
      { name: 'Umbral Edge', passive: { crit: 3, atkPct: 0.03 } },
      { ability: 'nightsEmbrace' },
    ] },
  ],
  ranger: [
    { id: 'arc', name: 'Archery', color: '#ffd166', nodes: [
      { ability: 'powerShot' },
      { name: 'Steady Aim', passive: { crit: 3 } },
      { ability: 'multishot' },
      { name: 'Deadeye', passive: { critDmg: 12, atkPct: 0.02 } },
      { ability: 'stormOfArrows' },
    ] },
    { id: 'trp', name: 'Traps', color: '#ff9d3b', nodes: [
      { ability: 'spikeTrap' },
      { name: 'Trapper', passive: { dotPct: 0.12 } },
      { ability: 'frostTrap' },
      { name: 'Ambush', passive: { atkPct: 0.04, spd: 1 } },
      { ability: 'explosiveTrap' },
    ] },
    { id: 'nat', name: 'Nature Skills', color: '#4fe08a', nodes: [
      { ability: 'huntersMark' },
      { name: 'Wild Vigor', passive: { hpPct: 0.06 } },
      { ability: 'naturesRemedy' },
      { name: 'Bark Skin', passive: { defPct: 0.06, res: 4, healPct: 0.05 } },
      { ability: 'wrathOfTheWild' },
    ] },
  ],
};

const PREFIX = { warrior: 'w', mage: 'm', rogue: 'r', ranger: 'g' };

// Flatten into a node map with ids like "w_off1".
const NODES = {};
for (const [classId, branches] of Object.entries(BRANCHES)) {
  for (const br of branches) {
    br.nodes.forEach((n, i) => {
      const tier = i + 1;
      const id = `${PREFIX[classId]}_${br.id}${tier}`;
      const t = TIER[tier];
      const ab = n.ability ? ABILITIES[n.ability] : null;
      if (n.ability && (!ab || ab.unlock !== id)) throw new Error(`Skill node ${id} / ability ${n.ability} mismatch`);
      NODES[id] = {
        id, classId, branch: br.id, branchName: br.name, tier,
        type: ab ? 'ability' : 'passive',
        ability: n.ability || null,
        name: ab ? ab.name : n.name,
        passive: n.passive || null,
        maxRank: t.maxRank, cost: t.cost, level: t.level,
        requires: tier > 1 ? [`${PREFIX[classId]}_${br.id}${tier - 1}`] : [],
        ultimate: tier === 5,
      };
      n.id = id;
    });
  }
}
export const SKILL_NODES = Object.freeze(NODES);

export function nodeDescription(node) {
  if (node.type === 'ability') return ABILITIES[node.ability].desc;
  return Object.entries(node.passive).map(([k, v]) => PASSIVE_LABELS[k](v)).join(', ') + (node.maxRank > 1 ? ' per rank' : '');
}

export function skillRank(player, nodeId) {
  return Math.max(0, Math.floor(player.skills?.[nodeId] || 0));
}

/** Returns { ok, reasons } explaining exactly why a node can't be learned. */
export function canUnlock(player, nodeId) {
  const node = SKILL_NODES[nodeId];
  const reasons = [];
  if (!node) return { ok: false, reasons: ['Unknown skill'] };
  if (node.classId !== player.classId) reasons.push('Belongs to another class');
  const rank = skillRank(player, nodeId);
  if (rank >= node.maxRank) reasons.push('Already at maximum rank');
  if (player.level < node.level) reasons.push(`Requires level ${node.level}`);
  for (const req of node.requires) {
    if (skillRank(player, req) < 1) reasons.push(`Requires ${SKILL_NODES[req].name}`);
  }
  if (player.skillPoints < node.cost) reasons.push(`Needs ${node.cost} skill point${node.cost > 1 ? 's' : ''}`);
  return { ok: reasons.length === 0, reasons };
}

export function unlockSkill(player, nodeId) {
  const check = canUnlock(player, nodeId);
  if (!check.ok) return check;
  const node = SKILL_NODES[nodeId];
  player.skillPoints -= node.cost;
  player.skills[nodeId] = skillRank(player, nodeId) + 1;
  return { ok: true, reasons: [], node };
}

export function spentPoints(player) {
  let s = 0;
  for (const [id, rank] of Object.entries(player.skills || {})) {
    const n = SKILL_NODES[id];
    if (n) s += n.cost * Math.min(rank, n.maxRank);
  }
  return s;
}

export function respecCost(player) {
  return 50 + player.level * 40;
}

/** Refund every spent point for a gold fee. */
export function respec(player) {
  const cost = respecCost(player);
  const spent = spentPoints(player);
  if (spent === 0) return { ok: false, reason: 'No skills to reset' };
  if (player.gold < cost) return { ok: false, reason: `Needs ${cost} gold` };
  player.gold -= cost;
  player.skillPoints += spent;
  player.skills = {};
  return { ok: true, refunded: spent, cost };
}

/** Sum of passive bonuses from learned nodes. */
export function passiveMods(player) {
  const mods = {};
  for (const [id, rank] of Object.entries(player.skills || {})) {
    const n = SKILL_NODES[id];
    if (!n || n.type !== 'passive' || n.classId !== player.classId) continue;
    const r = Math.min(rank, n.maxRank);
    for (const [k, v] of Object.entries(n.passive)) mods[k] = (mods[k] || 0) + v * r;
  }
  return mods;
}

export function knownAbilityIds(player) {
  const ids = Object.values(ABILITIES).filter((a) => a.unlock === 'starter' && a.classes.includes(player.classId)).map((a) => a.id);
  for (const [id, rank] of Object.entries(player.skills || {})) {
    const n = SKILL_NODES[id];
    if (n && n.type === 'ability' && rank > 0 && n.classId === player.classId) ids.push(n.ability);
  }
  return ids;
}

export function nodesForClass(classId) {
  return Object.values(SKILL_NODES).filter((n) => n.classId === classId);
}
