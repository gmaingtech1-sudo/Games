// Inventory screen: grid, filters, sorting, inspect, use, equip, sell, compare.

import { app, registerTab, refresh, autosave, announce } from './app.js';
import { html, raw, esc, delegate, toast, confirmDialog } from './dom.js';
import { FILTERS, filterInventory, sortInventory, findEntry, useConsumable, slotsUsed, INVENTORY_SLOTS } from '../inventory.js';
import { getItem, isEquipment, sellPrice } from '../items.js';
import { equip, compareWithEquipped, canEquip } from '../equipment.js';
import { canSell, sell } from '../shop.js';
import { questEvent, refreshQuests } from '../quests.js';
import { itemSlotHtml, itemTooltipHtml } from './format.js';
import { itemIconSvg } from '../art.js';
import { sfx } from '../audio.js';

const ui = { filter: 'all', sort: 'type', selected: null };

function isUpgrade(s, entry) {
  const def = getItem(entry.id);
  if (!isEquipment(def) || !canEquip(s, entry.uid).ok) return false;
  const cmp = compareWithEquipped(s, entry);
  const score = (d) => (d.atk || 0) * 2 + (d.def || 0) * 2 + (d.hp || 0) * 0.3 + (d.mp || 0) * 0.2 + (d.crit || 0) * 2 + (d.critDmg || 0) * 0.5 + (d.spd || 0) * 2 + (d.res || 0);
  return !cmp.current || score(cmp.diff) > 0;
}

registerTab('bag', (root) => {
  const s = app.state;
  const list = filterInventory(s, ui.filter);
  if (ui.selected && !findEntry(s, ui.selected)) ui.selected = null;
  const sel = ui.selected ? findEntry(s, ui.selected) : null;
  root.innerHTML = html`
  <div class="screen-head"><h2>🎒 Inventory</h2><span class="small muted">${slotsUsed(s)} / ${INVENTORY_SLOTS} slots</span></div>
  <div class="toolbar">
    <div class="chips" role="tablist">${raw(FILTERS.map(([id, label]) => `<button class="chip${ui.filter === id ? ' active' : ''}" data-action="filter" data-f="${id}" role="tab" aria-selected="${ui.filter === id}">${label}</button>`).join(''))}</div>
    <label class="small muted">Sort <select class="select" id="sort-select" aria-label="Sort inventory">
      ${raw(['type', 'rarity', 'level', 'value', 'name'].map((k) => `<option value="${k}" ${ui.sort === k ? 'selected' : ''}>${k[0].toUpperCase() + k.slice(1)}</option>`).join(''))}
    </select></label>
  </div>
  <div class="grid-2">
    <div class="panel"><div class="inv-grid">${raw(list.length ? list.map((e) => itemSlotHtml(e, { selected: e.uid === ui.selected, upgrade: isUpgrade(s, e) })).join('') : '<p class="muted small">Nothing here.</p>')}</div></div>
    <div class="panel item-detail" id="item-detail">${raw(sel ? detailHtml(s, sel) : '<p class="muted">Select an item to inspect it. Green arrows mark upgrades.</p>')}</div>
  </div>`;
  root.querySelector('#sort-select').addEventListener('change', (e) => {
    ui.sort = e.target.value;
    sortInventory(s, ui.sort);
    refresh();
  });
  delegate(root, {
    filter: (el) => { ui.filter = el.dataset.f; refresh(); },
    'select-item': (el) => { ui.selected = el.dataset.uid; sfx('click'); refresh(); },
    use: () => {
      const r = useConsumable(s, ui.selected);
      toast(r.message, { type: r.ok ? 'good' : 'bad' });
      if (r.ok) { sfx('potion'); refreshQuests(s); autosave(); }
      refresh();
    },
    equip: () => {
      const r = equip(s, ui.selected);
      if (!r.ok) { toast(r.reason, { type: 'bad' }); sfx('error'); return; }
      sfx('buy');
      toast(`Equipped ${r.def.name}.`, { type: 'good' });
      announce({ completed: questEvent(s, { type: 'equip', rarity: r.def.rarity }) });
      ui.selected = null;
      autosave();
      refresh();
    },
    sell: async () => {
      const e = findEntry(s, ui.selected);
      const chk = canSell(s, ui.selected, 1);
      if (!chk.ok) { toast(chk.reason, { type: 'bad' }); sfx('error'); return; }
      const def = getItem(e.id);
      const rareish = ['rare', 'epic', 'legendary', 'mythic'].includes(def.rarity);
      if (rareish && !(await confirmDialog('Sell item?', `Sell ${def.name} for ${chk.gold} gold?`, { ok: 'Sell' }))) return;
      const r = sell(s, ui.selected, 1);
      if (r.ok) { sfx('buy'); toast(`Sold ${def.name} for ${r.gold} gold.`, { type: 'gold' }); refreshQuests(s); autosave(); }
      refresh();
    },
    sellall: async () => {
      const e = findEntry(s, ui.selected);
      const chk = canSell(s, ui.selected, e.qty);
      if (!chk.ok) { toast(chk.reason, { type: 'bad' }); return; }
      if (!(await confirmDialog('Sell stack?', `Sell all ${e.qty} ${getItem(e.id).name} for ${chk.gold} gold?`, { ok: 'Sell all' }))) return;
      const r = sell(s, ui.selected, e.qty);
      if (r.ok) { sfx('buy'); toast(`Sold for ${r.gold} gold.`, { type: 'gold' }); refreshQuests(s); autosave(); }
      refresh();
    },
  });
});

function detailHtml(s, e) {
  const def = getItem(e.id);
  const cmp = isEquipment(def) ? compareWithEquipped(s, e) : null;
  const chk = isEquipment(def) ? canEquip(s, e.uid) : null;
  const sc = canSell(s, e.uid, 1);
  return `<div class="head"><div class="icon-box rb-${def.rarity}">${itemIconSvg(def)}</div><div>${itemTooltipHtml(def, e.plus, cmp)}</div></div>
    ${e.qty > 1 ? `<p class="small muted">You have ${e.qty}.</p>` : ''}
    ${cmp?.current ? `<p class="tiny muted">Currently equipped: <span class="r-${cmp.current.rarity}">${esc(cmp.current.name)}</span></p>` : ''}
    ${chk && !chk.ok ? `<p class="small bad">${esc(chk.reason)}</p>` : ''}
    ${!sc.ok && def.sellable ? `<p class="small bad">${esc(sc.reason)}</p>` : ''}
    <div class="row" style="margin-top:10px">
      ${def.type === 'potion' ? `<button class="btn primary" data-action="use" ${def.combatOnly ? 'disabled data-tip="Combat only"' : ''}>Use</button>` : ''}
      ${isEquipment(def) ? `<button class="btn primary" data-action="equip" ${chk.ok ? '' : 'disabled'}>Equip</button>` : ''}
      ${def.sellable ? `<button class="btn" data-action="sell" ${sc.ok ? '' : 'disabled'}>Sell ${sellPrice(def, e.plus)}g</button>` : ''}
      ${def.sellable && e.qty > 1 ? `<button class="btn ghost" data-action="sellall" ${canSell(s, e.uid, e.qty).ok ? '' : 'disabled'}>Sell all</button>` : ''}
    </div>`;
}
