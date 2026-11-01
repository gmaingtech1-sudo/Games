// The Emberhollow market: buying, selling, the inn and stock rules.

import { ITEMS, getItem, isEquipment, canClassUse, sellPrice } from './items.js';
import { addItem, removeItem, findEntry, slotsUsed, INVENTORY_SLOTS, countItem } from './inventory.js';
import { questReservedCount } from './quests.js';
import { computeStats } from './character.js';

/** Consumable prices rise gently with level so gold stays meaningful. */
export function buyPrice(def, level) {
  if (def.type === 'potion') return Math.round(def.value * (1 + 0.06 * (level - 1)));
  return def.value;
}

export function shopStock(state) {
  const L = state.player.level;
  const potions = Object.values(ITEMS).filter((d) => d.type === 'potion' && d.shop).sort((a, b) => a.level - b.level || a.value - b.value);
  const gear = Object.values(ITEMS)
    .filter((d) => isEquipment(d) && d.shop && canClassUse(d, state.player.classId) && d.level <= L + 6 && d.level >= L - 12)
    .sort((a, b) => a.level - b.level || a.slot.localeCompare(b.slot));
  return { potions, gear };
}

export function canBuy(state, itemId, qty = 1) {
  const def = getItem(itemId);
  if (!def) return { ok: false, reason: 'Unknown item.' };
  const { potions, gear } = shopStock(state);
  if (![...potions, ...gear].includes(def)) return { ok: false, reason: 'Not sold here.' };
  qty = Math.max(1, Math.floor(qty));
  if (def.stack === 1 && qty > 1) return { ok: false, reason: 'Buy one at a time.' };
  if (def.level > state.player.level) return { ok: false, reason: `Requires level ${def.level}.` };
  const cost = buyPrice(def, state.player.level) * qty;
  if (state.player.gold < cost) return { ok: false, reason: `Not enough gold (needs ${cost}).` };
  // Inventory space: stackables may fit into an existing stack.
  const existing = state.inventory.filter((e) => e.id === itemId).reduce((s, e) => s + (def.stack - e.qty), 0);
  const newStacks = Math.ceil(Math.max(0, qty - existing) / def.stack);
  if (slotsUsed(state) + newStacks > INVENTORY_SLOTS) return { ok: false, reason: 'Inventory is full.' };
  return { ok: true, cost, def, qty };
}

export function buy(state, itemId, qty = 1) {
  const chk = canBuy(state, itemId, qty);
  if (!chk.ok) return chk;
  state.player.gold -= chk.cost;
  addItem(state, itemId, chk.qty);
  return chk;
}

export function canSell(state, uid, qty = 1) {
  const e = findEntry(state, uid);
  const def = e && getItem(e.id);
  if (!def) return { ok: false, reason: 'Item not found.' };
  if (!def.sellable) return { ok: false, reason: 'Quest items cannot be sold.' };
  qty = Math.max(1, Math.floor(qty));
  if (qty > e.qty) return { ok: false, reason: 'You do not have that many.' };
  const reserved = questReservedCount(state, def.id);
  if (countItem(state, def.id) - qty < reserved) {
    const spare = Math.max(0, countItem(state, def.id) - reserved);
    return { ok: false, reason: spare ? `An active quest needs these. You can sell up to ${spare}.` : 'An active quest needs these.' };
  }
  return { ok: true, def, qty, gold: sellPrice(def, e.plus) * qty };
}

export function sell(state, uid, qty = 1) {
  const chk = canSell(state, uid, qty);
  if (!chk.ok) return chk;
  removeItem(state, uid, chk.qty);
  state.player.gold += chk.gold;
  return chk;
}

export function restCost(level) {
  return 10 + level * 6;
}

export function rest(state) {
  const p = state.player;
  const s = computeStats(p);
  if (p.hp >= s.maxHp && p.mp >= s.maxMp) return { ok: false, reason: 'You are already fully rested.' };
  const cost = restCost(p.level);
  if (p.gold < cost) return { ok: false, reason: `A room costs ${cost} gold.` };
  p.gold -= cost;
  p.hp = s.maxHp;
  p.mp = s.maxMp;
  return { ok: true, cost };
}
