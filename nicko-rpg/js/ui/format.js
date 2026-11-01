// Formatting helpers for items, stats and effects shared by several screens.

import { RARITIES, STAT_NAMES, PCT_STATS, ITEM_TYPES, instanceStats, sellPrice, getItem, WEAPON_CLASSES } from '../items.js';
import { EFFECTS } from '../statusEffects.js';
import { CLASSES } from '../character.js';
import { itemIconSvg } from '../art.js';
import { esc } from './dom.js';

export function statLine(k, v, diff = false) {
  const sign = v > 0 ? '+' : '';
  const val = PCT_STATS.has(k) ? `${sign}${v}%` : `${sign}${v}`;
  const cls = diff ? (v > 0 ? 'diff-up' : 'diff-down') : '';
  return `<li><span>${esc(STAT_NAMES[k] || k)}</span><span class="${cls}">${val}</span></li>`;
}

export function rarityName(r) { return RARITIES[r]?.name || r; }

export function itemTooltipHtml(def, plus = 0, compare = null) {
  if (!def) return '';
  const stats = instanceStats(def, plus);
  const lines = Object.entries(stats).map(([k, v]) => statLine(k, v)).join('');
  const who = def.type === 'weapon' && WEAPON_CLASSES[def.wtype] ? WEAPON_CLASSES[def.wtype].map((c) => CLASSES[c].name).join(', ') : '';
  let cmp = '';
  if (compare && Object.keys(compare.diff).length) cmp = `<div class="divider"></div><div class="tiny muted">Compared to equipped:</div><ul class="stat-lines">${Object.entries(compare.diff).map(([k, v]) => statLine(k, v, true)).join('')}</ul>`;
  return `<b class="r-${def.rarity}">${esc(def.name)}${plus ? ` +${plus}` : ''}</b><br><span class="tiny muted">${esc(rarityName(def.rarity))} ${esc(ITEM_TYPES[def.type])}${def.level > 1 ? ` · Lv ${def.level}` : ''}${who ? ` · ${esc(who)}` : ''}</span>
    ${lines ? `<ul class="stat-lines">${lines}</ul>` : ''}<div class="tiny">${esc(def.desc)}</div>${cmp}
    ${def.sellable ? `<div class="tiny gold">Sells for ${sellPrice(def, plus)}g</div>` : '<div class="tiny bad">Cannot be sold</div>'}`;
}

export function itemSlotHtml(entry, { selected = false, upgrade = false, action = 'select-item' } = {}) {
  const def = getItem(entry.id);
  if (!def) return '';
  return `<button class="inv-slot rb-${def.rarity}${selected ? ' selected' : ''}" data-action="${action}" data-uid="${esc(entry.uid)}" data-tip-html="${esc(itemTooltipHtml(def, entry.plus))}" aria-label="${esc(def.name)}${entry.qty > 1 ? ' x' + entry.qty : ''}">
    ${itemIconSvg(def)}${entry.qty > 1 ? `<span class="qty">${entry.qty}</span>` : ''}${entry.plus ? `<span class="plus">+${entry.plus}</span>` : ''}${upgrade ? '<span class="up" title="Upgrade">▲</span>' : ''}
  </button>`;
}

export function effectChips(effects) {
  return effects.filter((e) => e.turns > 0).map((e) => {
    const d = EFFECTS[e.id];
    if (!d) return '';
    const label = e.id === 'shield' ? `${d.name} ${e.power}` : d.name;
    const turns = e.turns >= 90 ? '' : ` ${e.turns}`;
    return `<span class="fx" style="--c:${d.color}" data-tip="${esc(d.desc(Math.round(e.power * 100) / 100 >= 1 ? Math.round(e.power) : e.power))}">${d.glyph} ${esc(label)}${turns}</span>`;
  }).join('');
}

export function fmtTime(sec) {
  sec = Math.floor(sec || 0);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

export const ELEMENT_GLYPH = { physical: '⚔', fire: '🔥', ice: '❄', lightning: '⚡', poison: '☠', shadow: '☾', arcane: '✶', holy: '✚' };
