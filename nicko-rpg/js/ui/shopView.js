// Market: buy potions and gear, sell items, upgrade equipment at the blacksmith.

import { app, registerTab, refresh, autosave } from './app.js';
import { html, raw, esc, delegate, toast, confirmDialog } from './dom.js';
import { shopStock, buyPrice, canBuy, buy, canSell, sell } from '../shop.js';
import { getItem, sellPrice, isEquipment, EQUIP_SLOTS } from '../items.js';
import { upgradeCost, upgradeItem, MAX_PLUS, compareWithEquipped } from '../equipment.js';
import { refreshQuests } from '../quests.js';
import { itemIconSvg } from '../art.js';
import { itemTooltipHtml, statLine } from './format.js';
import { sfx } from '../audio.js';
import { fmt } from '../utils.js';

const ui = { tab: 'potions' };

registerTab('shop', (root) => {
  const s = app.state;
  const p = s.player;
  const { potions, gear } = shopStock(s);
  let content = '';
  if (ui.tab === 'potions') content = potions.map((d) => buyRow(s, d)).join('');
  else if (ui.tab === 'gear') content = gear.map((d) => buyRow(s, d)).join('') || '<p class="muted">Nothing for your class right now.</p>';
  else if (ui.tab === 'sell') content = sellRows(s);
  else content = smithRows(s);
  root.innerHTML = html`
  <div class="screen-head"><h2>⚖ Emberhollow Market</h2><span class="gold" style="font-size:1.1rem">● ${fmt(p.gold)} gold</span></div>
  <div class="tabs" role="tablist">
    ${raw([['potions', '🧪 Potions'], ['gear', '⚔ Gear'], ['sell', '💰 Sell'], ['smith', '🔨 Blacksmith']].map(([id, l]) => `<button class="tab${ui.tab === id ? ' active' : ''}" data-action="tab" data-t="${id}" role="tab">${l}</button>`).join(''))}
  </div>
  ${raw(ui.tab === 'smith' ? '<p class="small muted">The blacksmith strengthens equipment by 8% per upgrade, up to +5.</p>' : ui.tab === 'sell' ? '<p class="small muted">Merchants pay 40% of an item\'s value. Items an active quest needs are protected.</p>' : '')}
  <div class="shop-list">${raw(content)}</div>`;
  delegate(root, {
    tab: (el) => { ui.tab = el.dataset.t; refresh(); },
    buy: (el) => {
      const qty = +el.dataset.qty || 1;
      const r = buy(s, el.dataset.id, qty);
      if (!r.ok) { toast(r.reason, { type: 'bad' }); sfx('error'); return; }
      sfx('buy');
      toast(`Bought ${r.def.name}${qty > 1 ? ` x${qty}` : ''} for ${r.cost} gold.`, { type: 'gold', icon: itemIconSvg(r.def) });
      refreshQuests(s);
      autosave();
      refresh();
    },
    sell: async (el) => {
      const uid = el.dataset.uid;
      const qty = +el.dataset.qty || 1;
      const chk = canSell(s, uid, qty);
      if (!chk.ok) { toast(chk.reason, { type: 'bad' }); sfx('error'); return; }
      if (['epic', 'legendary', 'mythic'].includes(chk.def.rarity) && !(await confirmDialog('Sell item?', `Sell ${chk.def.name} for ${chk.gold} gold?`, { ok: 'Sell' }))) return;
      const r = sell(s, uid, qty);
      if (r.ok) { sfx('buy'); toast(`Sold ${r.def.name}${qty > 1 ? ` x${qty}` : ''} for ${r.gold} gold.`, { type: 'gold' }); refreshQuests(s); autosave(); }
      refresh();
    },
    upgrade: (el) => {
      const ref = el.dataset.slot ? { slot: el.dataset.slot } : { uid: el.dataset.uid };
      const r = upgradeItem(s, ref);
      if (!r.ok) { toast(r.reason, { type: 'bad' }); sfx('error'); return; }
      sfx('crit');
      toast(`${r.def.name} upgraded to +${r.plus} (${r.cost} gold).`, { type: 'gold' });
      autosave();
      refresh();
    },
  });
});

function buyRow(s, d) {
  const L = s.player.level;
  const price = buyPrice(d, L);
  const chk = canBuy(s, d.id, 1);
  const chk5 = d.stack > 1 ? canBuy(s, d.id, 5) : null;
  const cmp = isEquipment(d) ? compareWithEquipped(s, { id: d.id, plus: 0, uid: 'shop' }) : null;
  const diff = cmp ? Object.entries(cmp.diff).map(([k, v]) => statLine(k, v, true)).join('') : '';
  const locked = d.level > L;
  return `<div class="card shop-item rb-${d.rarity}${locked ? ' locked' : ''}" data-tip-html="${esc(itemTooltipHtml(d, 0, cmp))}">
    <div class="icon-box">${itemIconSvg(d)}</div>
    <div style="min-width:0"><b class="r-${d.rarity}">${esc(d.name)}</b>${d.level > 1 ? ` <span class="tiny ${locked ? 'bad' : 'muted'}">Lv ${d.level}</span>` : ''}
      <div class="tiny muted">${esc(d.desc)}</div>${diff ? `<ul class="stat-lines tiny" style="margin:2px 0">${diff}</ul>` : ''}</div>
    <div class="center"><div class="price${chk.ok ? '' : ' cant'}">${fmt(price)}g</div>
      <button class="btn small primary" data-action="buy" data-id="${d.id}" ${chk.ok ? '' : 'disabled'} data-tip="${esc(chk.ok ? 'Buy one' : chk.reason)}">Buy</button>
      ${chk5 ? `<button class="btn small ghost" data-action="buy" data-id="${d.id}" data-qty="5" ${chk5.ok ? '' : 'disabled'} style="margin-top:4px">×5</button>` : ''}</div>
  </div>`;
}

function sellRows(s) {
  const rows = s.inventory.filter((e) => getItem(e.id)).map((e) => {
    const d = getItem(e.id);
    const chk = canSell(s, e.uid, 1);
    const chkAll = e.qty > 1 ? canSell(s, e.uid, e.qty) : null;
    return `<div class="card shop-item rb-${d.rarity}" data-tip-html="${esc(itemTooltipHtml(d, e.plus))}"><div class="icon-box">${itemIconSvg(d)}</div>
      <div style="min-width:0"><b class="r-${d.rarity}">${esc(d.name)}${e.plus ? ` +${e.plus}` : ''}</b>${e.qty > 1 ? ` <span class="tiny muted">×${e.qty}</span>` : ''}
      ${chk.ok ? '' : `<div class="tiny bad">${esc(chk.reason)}</div>`}</div>
      <div class="center"><div class="price">${d.sellable ? fmt(sellPrice(d, e.plus)) + 'g' : '—'}</div>
      <button class="btn small" data-action="sell" data-uid="${esc(e.uid)}" ${chk.ok ? '' : 'disabled'}>Sell</button>
      ${chkAll ? `<button class="btn small ghost" data-action="sell" data-uid="${esc(e.uid)}" data-qty="${e.qty}" ${chkAll.ok ? '' : 'disabled'} style="margin-top:4px">All</button>` : ''}</div></div>`;
  });
  return rows.join('') || '<p class="muted">Your bag is empty.</p>';
}

function smithRows(s) {
  const p = s.player;
  const rows = [];
  for (const slot of EQUIP_SLOTS) {
    const inst = p.equipment[slot];
    if (inst) rows.push(smithRow(s, getItem(inst.id), inst.plus || 0, `data-slot="${slot}"`, true));
  }
  for (const e of s.inventory) {
    const d = getItem(e.id);
    if (isEquipment(d)) rows.push(smithRow(s, d, e.plus || 0, `data-uid="${esc(e.uid)}"`, false));
  }
  return rows.join('') || '<p class="muted">No equipment to upgrade.</p>';
}

function smithRow(s, d, plus, ref, equipped) {
  const maxed = plus >= MAX_PLUS;
  const cost = maxed ? 0 : upgradeCost(d, plus);
  const can = !maxed && s.player.gold >= cost;
  return `<div class="card shop-item rb-${d.rarity}" data-tip-html="${esc(itemTooltipHtml(d, plus))}"><div class="icon-box">${itemIconSvg(d)}</div>
    <div><b class="r-${d.rarity}">${esc(d.name)}${plus ? ` +${plus}` : ''}</b> ${equipped ? '<span class="tag gold">Equipped</span>' : ''}<div class="tiny muted">${maxed ? 'Fully upgraded' : `Next: +${plus + 1}`}</div></div>
    <div class="center"><div class="price${can || maxed ? '' : ' cant'}">${maxed ? '—' : fmt(cost) + 'g'}</div><button class="btn small magic" data-action="upgrade" ${ref} ${can ? '' : 'disabled'}>Upgrade</button></div></div>`;
}
