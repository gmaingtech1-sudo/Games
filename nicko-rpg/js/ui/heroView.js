// Character statistics and equipment screens.

import { app, registerTab, refresh, autosave } from './app.js';
import { html, raw, esc, delegate, toast, modal } from './dom.js';
import { computeStats, xpToNext, baseStatsAt, equipmentStats, CLASSES, MAX_LEVEL } from '../character.js';
import { heroSvg, itemIconSvg } from '../art.js';
import { EQUIP_SLOTS, ITEM_TYPES, getItem, instanceStats, STAT_NAMES, PCT_STATS } from '../items.js';
import { unequip, equip, compareWithEquipped, canEquip } from '../equipment.js';
import { itemTooltipHtml, statLine, fmtTime } from './format.js';
import { knownAbilityIds, PASSIVE_LABELS } from '../skillTree.js';
import { getAbility, manaCost } from '../abilities.js';
import { questEvent } from '../quests.js';
import { sfx } from '../audio.js';
import { fmt } from '../utils.js';

const SLOT_ICONS = { weapon: '⚔', armor: '🛡', helmet: '⛑', boots: '🥾', ring: '💍', amulet: '📿' };

registerTab('hero', (root) => {
  const s = app.state;
  const p = s.player;
  const st = computeStats(p);
  const base = baseStatsAt(p.classId, p.level);
  const gear = equipmentStats(p);
  const c = CLASSES[p.classId];
  const need = xpToNext(p.level);
  const row = (label, val, tip) => `<dt data-tip="${esc(tip || '')}">${label}</dt><dd>${val}</dd>`;
  const mods = Object.entries(st.mods).map(([k, v]) => `<li>${esc(PASSIVE_LABELS[k] ? PASSIVE_LABELS[k](Math.round(v * 100) / 100) : k)}</li>`).join('');
  root.innerHTML = html`
  <div class="grid-2">
    <div class="panel center">
      ${raw(heroSvg(p.classId))}
      <h2 style="margin-top:6px">${p.name}</h2>
      <div class="muted">Level ${p.level} ${c.name}</div>
      <p class="small" style="margin-top:8px">${c.playstyle}</p>
      <div class="row" style="justify-content:center"><button class="btn small" data-action="gear">⚔ Equipment</button><button class="btn small" data-action="skills">✦ Skill Tree</button></div>
    </div>
    <div class="panel">
      <h3 class="panel-title">Statistics</h3>
      <dl class="stat-table">
        ${raw(row('Level', p.level))}
        ${raw(row('Experience', p.level >= MAX_LEVEL ? 'MAX' : `${fmt(p.xp)} / ${fmt(need)}`, 'Experience towards the next level'))}
        ${raw(row('To next level', p.level >= MAX_LEVEL ? '—' : fmt(need - p.xp)))}
        ${raw(row('Health', `<span class="good">${p.hp}</span> / ${st.maxHp}`, `Base ${Math.round(base.hp)} + gear ${gear.hp || 0}`))}
        ${raw(row('Mana', `<span style="color:#8bb8ff">${p.mp}</span> / ${st.maxMp}`, `Base ${Math.round(base.mp)} + gear ${gear.mp || 0}`))}
        ${raw(row('Attack', st.atk, `Base ${Math.round(base.atk)} + gear ${gear.atk || 0}. Drives all damage.`))}
        ${raw(row('Defence', st.def, `Base ${Math.round(base.def)} + gear ${gear.def || 0}. Reduces damage taken.`))}
        ${raw(row('Speed', st.spd, 'Higher speed than your foe improves dodging and fleeing.'))}
        ${raw(row('Critical chance', `${st.crit}%`))}
        ${raw(row('Critical damage', `${st.critDmg}%`))}
        ${raw(row('Elemental resist', `${st.res}%`, 'Reduces fire, ice, shadow and other non-physical damage.'))}
        ${raw(row('Gold', `<span class="gold">${fmt(p.gold)}</span>`))}
        ${raw(row('Skill points', p.skillPoints))}
      </dl>
    </div>
  </div>
  <div class="grid-2" style="margin-top:14px">
    <div class="panel">
      <h3 class="panel-title">Known Abilities</h3>
      <div class="stack">${raw(knownAbilityIds(p).map((id) => { const a = getAbility(id); return `<div class="ability-chip"><div class="icon">${a.ultimate ? '★' : '✦'}</div><div><b>${esc(a.name)}</b> <span class="tiny muted">${manaCost(a, p.level)} MP${a.cd ? ` · ${a.cd} turn cooldown` : ''}</span><div class="small muted">${esc(a.desc)}</div></div></div>`; }).join(''))}</div>
    </div>
    <div class="panel">
      <h3 class="panel-title">Passive Bonuses</h3>
      ${raw(mods ? `<ul class="small">${mods}</ul>` : '<p class="small muted">Learn passive skills in the skill tree to gain bonuses.</p>')}
      <div class="divider"></div>
      <h3 class="panel-title">Records</h3>
      <dl class="stat-table small">
        ${raw(row('Monsters slain', fmt(s.stats.kills)))}${raw(row('Elites slain', fmt(s.stats.elitesKilled)))}${raw(row('Bosses defeated', `${Object.keys(s.bosses.defeated).length}`))}
        ${raw(row('Times fallen', fmt(s.stats.deaths)))}${raw(row('Gold earned', fmt(s.stats.goldEarned)))}${raw(row('Play time', fmtTime(s.playTime)))}
      </dl>
    </div>
  </div>`;
  delegate(root, {
    gear: () => import('./gameView.js').then((m) => m.openTab('gear')),
    skills: () => import('./gameView.js').then((m) => m.openTab('skills')),
  });
});

registerTab('gear', (root) => {
  const s = app.state;
  const p = s.player;
  const st = computeStats(p);
  const slots = EQUIP_SLOTS.map((slot) => {
    const inst = p.equipment[slot];
    const def = inst && getItem(inst.id);
    return `<button class="card clickable equip-slot${def ? ` filled rb-${def.rarity}` : ''}" data-action="slot" data-slot="${slot}" ${def ? `data-tip-html="${esc(itemTooltipHtml(def, inst.plus))}"` : ''}>
      <div class="tiny muted">${SLOT_ICONS[slot]} ${ITEM_TYPES[slot]}</div>
      <div class="icon-box">${def ? itemIconSvg(def) : ''}</div>
      <div class="name ${def ? 'r-' + def.rarity : 'muted'}">${def ? esc(def.name) + (inst.plus ? ` +${inst.plus}` : '') : 'Empty'}</div></button>`;
  }).join('');
  root.innerHTML = html`
  <div class="screen-head"><h2>⚔ Equipment</h2></div>
  <div class="grid-2">
    <div class="panel"><div class="paperdoll">${raw(slots)}</div><p class="tiny muted" style="margin-top:10px">Tap a slot to swap gear. Equipment stats are recalculated from scratch every time, so bonuses never stack twice.</p></div>
    <div class="panel">
      <h3 class="panel-title">Totals</h3>
      <dl class="stat-table">
        <dt>Max health</dt><dd>${st.maxHp}</dd><dt>Max mana</dt><dd>${st.maxMp}</dd><dt>Attack</dt><dd>${st.atk}</dd><dt>Defence</dt><dd>${st.def}</dd>
        <dt>Speed</dt><dd>${st.spd}</dd><dt>Crit chance</dt><dd>${st.crit}%</dd><dt>Crit damage</dt><dd>${st.critDmg}%</dd><dt>Resist</dt><dd>${st.res}%</dd>
      </dl>
    </div>
  </div>`;
  delegate(root, { slot: (el) => slotDialog(el.dataset.slot) });
});

async function slotDialog(slot) {
  const s = app.state;
  const p = s.player;
  const inst = p.equipment[slot];
  const def = inst && getItem(inst.id);
  const options = s.inventory.filter((e) => getItem(e.id)?.slot === slot);
  const list = options.map((e) => {
    const d = getItem(e.id);
    const cmp = compareWithEquipped(s, e);
    const chk = canEquip(s, e.uid);
    const diff = Object.entries(cmp.diff).map(([k, v]) => `<span class="${v > 0 ? 'diff-up' : 'diff-down'}">${v > 0 ? '+' : ''}${v}${PCT_STATS.has(k) ? '%' : ''} ${esc(STAT_NAMES[k])}</span>`).join(', ');
    return `<div class="card shop-item rb-${d.rarity}"><div class="icon-box">${itemIconSvg(d)}</div>
      <div><b class="r-${d.rarity}">${esc(d.name)}${e.plus ? ` +${e.plus}` : ''}</b> <span class="tiny muted">Lv ${d.level}</span><div class="tiny">${diff || '<span class="muted">No change</span>'}</div>${chk.ok ? '' : `<div class="tiny bad">${esc(chk.reason)}</div>`}</div>
      <button class="btn small primary" data-equip="${esc(e.uid)}" ${chk.ok ? '' : 'disabled'}>Equip</button></div>`;
  }).join('');
  const body = `${def ? `<div class="card"><div class="tiny muted">Equipped</div>${itemTooltipHtml(def, inst.plus)}</div>` : '<p class="muted">Nothing equipped.</p>'}
    <h3 style="margin-top:12px">From your bag</h3><div class="shop-list">${list || '<p class="small muted">No other items for this slot.</p>'}</div>`;
  const buttons = [{ label: 'Close', value: null }];
  if (def) buttons.unshift({ label: 'Unequip', value: 'unequip', cls: 'danger' });
  buttons.onMount = (back) => {
    back.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-equip]');
      if (!b || b.disabled) return;
      b.disabled = true;
      const r = equip(s, b.dataset.equip);
      if (r.ok) {
        sfx('buy');
        toast(`Equipped ${r.def.name}.`, { type: 'good' });
        announce2(questEvent(s, { type: 'equip', rarity: r.def.rarity }));
        autosave();
      } else toast(r.reason, { type: 'bad' });
      back.querySelector('.actions-row .btn:last-child').click();
      refresh();
    });
  };
  const v = await modal({ title: ITEM_TYPES[slot], body, buttons });
  if (v === 'unequip') {
    const r = unequip(s, slot);
    toast(r.ok ? `Unequipped ${r.def.name}.` : r.reason, { type: r.ok ? '' : 'bad' });
    if (r.ok) autosave();
    refresh();
  }
}

function announce2(completed) {
  import('./app.js').then((m) => m.announce({ completed }));
}
