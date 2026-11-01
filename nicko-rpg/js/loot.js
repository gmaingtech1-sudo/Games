// Loot tables. Enemies roll their own table plus a chance at a random piece
// of gear near their level. Bosses grant guaranteed loot on the first kill
// and roll rare bonus loot.

import { ITEMS, RARITIES, getItem, isEquipment, canClassUse } from './items.js';
import { getBoss } from './bosses.js';

const GEAR_RARITY_WEIGHTS = [
  { r: 'common', w: 58 }, { r: 'uncommon', w: 26 }, { r: 'rare', w: 11 }, { r: 'epic', w: 4 }, { r: 'legendary', w: 1 },
];

export function rollRarity(rng, { minLevel = 1, elite = false } = {}) {
  const entries = GEAR_RARITY_WEIGHTS.filter((e) => e.r !== 'legendary' || minLevel >= 22).map((e) => ({ ...e, w: elite && e.r !== 'common' ? e.w * 1.8 : e.w }));
  return rng.weighted(entries).r;
}

/** Random non-boss equipment for an enemy of `level`, biased towards the player's class. */
export function randomGear(level, rng, classId, opts = {}) {
  let rarity = opts.rarity || rollRarity(rng, { minLevel: level, elite: opts.elite });
  const order = Object.keys(RARITIES);
  for (let tries = 0; tries < 6; tries++) {
    let pool = Object.values(ITEMS).filter((d) => isEquipment(d) && !d.bossOnly && d.rarity === rarity && d.level <= level + 2 && d.level >= level - 10);
    const usable = pool.filter((d) => canClassUse(d, classId));
    if (usable.length && rng() < 0.8) pool = usable;
    if (pool.length) return rng.pick(pool).id;
    rarity = order[Math.max(0, order.indexOf(rarity) - 1)];
  }
  return null;
}

/** Roll an ordinary enemy's drops. activeQuests: Set of quest ids in progress. */
export function rollEnemyLoot(enemy, rng, { classId, activeQuests = new Set() } = {}) {
  const drops = [];
  for (const entry of enemy.loot || []) {
    if (!getItem(entry.id)) continue;
    if (entry.quest && !activeQuests.has(entry.quest)) continue;
    const chance = Math.min(1, entry.chance * (enemy.elite ? 1.5 : 1));
    if (rng() < chance) {
      const qty = entry.min ? rng.int(entry.min, entry.max || entry.min) : 1;
      drops.push({ id: entry.id, qty });
    }
  }
  const gearChance = (enemy.gearChance ?? 0.07) * (enemy.elite ? 3 : 1);
  if (rng() < gearChance) {
    const id = randomGear(enemy.level, rng, classId, { elite: enemy.elite });
    if (id) drops.push({ id, qty: 1 });
  }
  return drops;
}

/** Boss drops: guaranteed items only the first time; bonus loot every time (halved on rematches). */
export function rollBossLoot(bossId, rng, { firstKill, classId }) {
  const b = getBoss(bossId);
  const drops = [];
  if (firstKill) for (const id of b.reward.items) drops.push({ id, qty: 1, guaranteed: true });
  for (const entry of b.bonusLoot) {
    const chance = firstKill ? entry.chance : entry.chance * 0.5;
    if (rng() < chance) drops.push({ id: entry.id, qty: 1, bonus: true });
  }
  if (!firstKill && rng() < 0.5) {
    const id = randomGear(b.level, rng, classId, { rarity: rng() < 0.3 ? 'epic' : 'rare' });
    if (id) drops.push({ id, qty: 1 });
  }
  return drops;
}
