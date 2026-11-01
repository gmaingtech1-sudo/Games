// Equipping and unequipping. An item instance is either in the inventory or
// in an equipment slot, never both, and stats are always recomputed from what
// is equipped, so bonuses cannot be duplicated.

import { getItem, isEquipment, canClassUse, instanceStats, EQUIP_SLOTS, WEAPON_CLASSES } from './items.js';
import { findEntry, slotsUsed, INVENTORY_SLOTS } from './inventory.js';
import { computeStats, clampVitals, CLASSES } from './character.js';

export function canEquip(state, uid) {
  const e = findEntry(state, uid);
  const def = e && getItem(e.id);
  if (!def) return { ok: false, reason: 'Item not found.' };
  if (!isEquipment(def)) return { ok: false, reason: 'That cannot be equipped.' };
  if (state.player.level < def.level) return { ok: false, reason: `Requires level ${def.level}.` };
  if (!canClassUse(def, state.player.classId)) {
    const who = (WEAPON_CLASSES[def.wtype] || []).map((c) => CLASSES[c].name).join(', ');
    return { ok: false, reason: `Only ${who} can use this.` };
  }
  return { ok: true, def, entry: e };
}

export function equip(state, uid) {
  const chk = canEquip(state, uid);
  if (!chk.ok) return chk;
  const { def, entry } = chk;
  const p = state.player;
  const slot = def.slot;
  const prev = p.equipment[slot];
  state.inventory = state.inventory.filter((x) => x !== entry);
  p.equipment[slot] = { uid: entry.uid, id: entry.id, qty: 1, plus: entry.plus || 0 };
  if (prev) state.inventory.push({ ...prev, qty: 1 });
  clampVitals(p);
  return { ok: true, def, slot, replaced: prev ? getItem(prev.id) : null };
}

export function unequip(state, slot) {
  const p = state.player;
  if (!EQUIP_SLOTS.includes(slot) || !p.equipment[slot]) return { ok: false, reason: 'Nothing equipped there.' };
  if (slotsUsed(state) >= INVENTORY_SLOTS) return { ok: false, reason: 'Your inventory is full.' };
  const inst = p.equipment[slot];
  p.equipment[slot] = null;
  state.inventory.push({ ...inst, qty: 1 });
  clampVitals(p);
  return { ok: true, def: getItem(inst.id) };
}

/** Stat difference if `uid` replaced whatever is in its slot. */
export function compareWithEquipped(state, entryOrUid) {
  const e = typeof entryOrUid === 'string' ? findEntry(state, entryOrUid) : entryOrUid;
  const def = e && getItem(e.id);
  if (!isEquipment(def)) return null;
  const cur = state.player.equipment[def.slot];
  const a = instanceStats(def, e.plus);
  const b = cur ? instanceStats(getItem(cur.id), cur.plus) : {};
  const diff = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const d = (a[k] || 0) - (b[k] || 0);
    if (d !== 0) diff[k] = d;
  }
  return { diff, current: cur ? getItem(cur.id) : null, currentPlus: cur?.plus || 0 };
}

/** Upgrade cost at the blacksmith: a gold sink that grows quickly per level. */
export const MAX_PLUS = 5;
export function upgradeCost(def, plus) {
  return Math.round(def.value * 0.45 * (plus + 1) ** 1.5) + 20;
}

/** Upgrade an equipped item or one in the inventory. */
export function upgradeItem(state, ref) {
  const p = state.player;
  let inst = null;
  if (ref.slot) inst = p.equipment[ref.slot];
  else inst = findEntry(state, ref.uid);
  const def = inst && getItem(inst.id);
  if (!isEquipment(def)) return { ok: false, reason: 'Only equipment can be upgraded.' };
  const plus = inst.plus || 0;
  if (plus >= MAX_PLUS) return { ok: false, reason: 'Already fully upgraded.' };
  const cost = upgradeCost(def, plus);
  if (p.gold < cost) return { ok: false, reason: `Needs ${cost} gold.` };
  p.gold -= cost;
  inst.plus = plus + 1;
  clampVitals(p);
  return { ok: true, def, plus: inst.plus, cost };
}

export function equippedSummary(state) {
  return computeStats(state.player);
}
