// Inventory: a list of item instances { uid, id, qty, plus }. Stackable items
// share a stack up to their stack limit; equipment always has qty 1.

import { getItem, RARITIES, ITEM_TYPES, sellPrice } from './items.js';
import { uid as makeUid } from './utils.js';
import { computeStats } from './character.js';
import { removeEffects } from './statusEffects.js';

export const INVENTORY_SLOTS = 60;

const TYPE_ORDER = ['weapon', 'armor', 'helmet', 'boots', 'ring', 'amulet', 'potion', 'material', 'quest'];

export function slotsUsed(state) {
  return state.inventory.filter((e) => getItem(e.id)?.type !== 'quest').length;
}

export function findEntry(state, uid) {
  return state.inventory.find((e) => e.uid === uid) || null;
}

export function countItem(state, id) {
  return state.inventory.filter((e) => e.id === id).reduce((s, e) => s + e.qty, 0);
}

/**
 * Add items. Returns { added, converted } where converted is gold received
 * for items that did not fit (the inventory never silently loses value).
 */
export function addItem(state, id, qty = 1, opts = {}) {
  const def = getItem(id);
  if (!def) return { added: 0, converted: 0 };
  qty = Math.max(0, Math.floor(qty));
  let added = 0, converted = 0;
  const isQuest = def.type === 'quest';
  if (def.stack > 1) {
    for (const e of state.inventory) {
      if (qty <= 0) break;
      if (e.id !== id) continue;
      const space = def.stack - e.qty;
      const n = Math.min(space, qty);
      if (n > 0) { e.qty += n; qty -= n; added += n; }
    }
  }
  while (qty > 0) {
    if (!isQuest && slotsUsed(state) >= INVENTORY_SLOTS) {
      converted += sellPrice(def, opts.plus) * qty;
      state.player.gold += sellPrice(def, opts.plus) * qty;
      qty = 0;
      break;
    }
    const n = Math.min(def.stack, qty);
    state.inventory.push({ uid: makeUid(), id, qty: n, plus: Math.max(0, Math.floor(opts.plus || 0)) });
    qty -= n;
    added += n;
  }
  return { added, converted };
}

export function removeItem(state, uid, qty = 1) {
  const e = findEntry(state, uid);
  if (!e || qty <= 0 || e.qty < qty) return false;
  e.qty -= qty;
  if (e.qty <= 0) state.inventory = state.inventory.filter((x) => x !== e);
  return true;
}

export function removeById(state, id, qty) {
  if (countItem(state, id) < qty) return false;
  for (const e of [...state.inventory]) {
    if (qty <= 0) break;
    if (e.id !== id) continue;
    const n = Math.min(e.qty, qty);
    removeItem(state, e.uid, n);
    qty -= n;
  }
  return true;
}

/** Use a consumable outside combat. Returns { ok, message }. */
export function useConsumable(state, uid) {
  const e = findEntry(state, uid);
  const def = e && getItem(e.id);
  if (!def) return { ok: false, message: 'Item not found.' };
  if (def.type !== 'potion') return { ok: false, message: 'That item cannot be used.' };
  if (def.combatOnly) return { ok: false, message: `${def.name} can only be used in combat.` };
  const p = state.player;
  const s = computeStats(p);
  const fx = def.effect;
  const msgs = [];
  let did = false;
  if (fx.healPct || fx.healMin) {
    if (p.hp < s.maxHp) {
      const before = p.hp;
      p.hp = Math.min(s.maxHp, p.hp + Math.max(fx.healMin || 0, Math.round(s.maxHp * fx.healPct)));
      msgs.push(`Restored ${p.hp - before} health.`);
      did = true;
    }
  }
  if (fx.manaPct || fx.manaMin) {
    if (p.mp < s.maxMp) {
      const before = p.mp;
      p.mp = Math.min(s.maxMp, p.mp + Math.max(fx.manaMin || 0, Math.round(s.maxMp * fx.manaPct)));
      msgs.push(`Restored ${p.mp - before} mana.`);
      did = true;
    }
  }
  if (fx.cure) {
    // Outside combat there are no lingering effects; antidotes only matter in a fight.
    if (state.player.effects?.length) { removeEffects(state.player, fx.cure); did = true; msgs.push('Cured.'); }
  }
  if (fx.status && fx.status.id === 'regen') {
    if (p.hp < s.maxHp) {
      const before = p.hp;
      p.hp = Math.min(s.maxHp, p.hp + Math.round(s.maxHp * fx.status.power * fx.status.turns));
      msgs.push(`Restored ${p.hp - before} health.`);
      did = true;
    }
  }
  if (!did) return { ok: false, message: 'It would have no effect right now.' };
  removeItem(state, uid, 1);
  return { ok: true, message: `Used ${def.name}. ${msgs.join(' ')}` };
}

export function sortInventory(state, mode = 'type') {
  const key = (e) => getItem(e.id);
  const cmp = {
    type: (a, b) => TYPE_ORDER.indexOf(key(a).type) - TYPE_ORDER.indexOf(key(b).type) || RARITIES[key(b).rarity].order - RARITIES[key(a).rarity].order || key(b).level - key(a).level,
    rarity: (a, b) => RARITIES[key(b).rarity].order - RARITIES[key(a).rarity].order || key(b).level - key(a).level,
    level: (a, b) => key(b).level - key(a).level || RARITIES[key(b).rarity].order - RARITIES[key(a).rarity].order,
    value: (a, b) => key(b).value * b.qty - key(a).value * a.qty,
    name: (a, b) => key(a).name.localeCompare(key(b).name),
  }[mode] || (() => 0);
  state.inventory.sort((a, b) => cmp(a, b) || key(a).name.localeCompare(key(b).name));
}

export function filterInventory(state, type = 'all') {
  if (type === 'all') return state.inventory;
  if (type === 'equipment') return state.inventory.filter((e) => ['weapon', 'armor', 'helmet', 'boots', 'ring', 'amulet'].includes(getItem(e.id)?.type));
  return state.inventory.filter((e) => getItem(e.id)?.type === type);
}

export const FILTERS = [
  ['all', 'All'], ['equipment', 'Gear'], ['weapon', 'Weapons'], ['armor', 'Armour'], ['helmet', 'Helmets'], ['boots', 'Boots'],
  ['ring', 'Rings'], ['amulet', 'Amulets'], ['potion', 'Potions'], ['material', 'Materials'], ['quest', 'Quest'],
];
export { ITEM_TYPES };
