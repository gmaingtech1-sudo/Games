// Boss Arena: every fifth level unlocks a major boss.

import { app, registerTab } from './app.js';
import { html, raw, esc, delegate } from './dom.js';
import { BOSSES, BOSS_ORDER, bossStatus } from '../bosses.js';
import { getItem } from '../items.js';
import { getDungeon } from '../dungeons.js';
import { enemySvg } from '../art.js';
import { startBossEncounter } from './combatView.js';

registerTab('bosses', (root) => {
  const s = app.state;
  root.innerHTML = html`
  <div class="screen-head"><h2>☠ Boss Arena</h2><span class="small muted">${Object.keys(s.bosses.defeated).length} / ${BOSS_ORDER.length} defeated</span></div>
  <p class="small muted">A new champion awaits every five levels. First victories grant unique loot and bonus experience; rematches give smaller rewards.</p>
  <div class="grid-2">${raw(BOSS_ORDER.map((id) => card(s, id)).join(''))}</div>`;
  delegate(root, { fight: (el) => startBossEncounter(el.dataset.id) });
});

function card(s, id) {
  const b = BOSSES[id];
  const st = bossStatus(s, id);
  const loot = b.reward.items.map((i) => getItem(i)).filter((d) => d && d.type !== 'potion').map((d) => `<span class="r-${d.rarity}">${esc(d.name)}</span>`).join(', ');
  const attempts = s.bosses.attempts[id] || 0;
  return `<div class="card boss-card${st.defeated ? ' defeated' : ''}${st.available ? '' : ' locked'}">
    <div>${st.available || st.defeated ? enemySvg(b.look, { id: 'arena' + id, label: b.name }) : '<div style="font-size:3rem;text-align:center">🔒</div>'}</div>
    <div style="min-width:0">
      <div class="row between"><b>${esc(b.name)}</b><span class="tag ${st.defeated ? 'gold' : ''}">Lv ${b.level}</span></div>
      <div class="tiny muted">${esc(b.title)} · ${esc(getDungeon(b.dungeon)?.name || '')}</div>
      <div class="small" style="margin:4px 0">${esc(b.desc)}</div>
      <div class="tiny">Unique loot: ${loot || '—'}</div>
      ${st.defeated ? `<div class="tiny good">Defeated${attempts ? ` · ${attempts} attempt${attempts > 1 ? 's' : ''}` : ''}</div>` : ''}
      ${st.available ? `<button class="btn small ${st.defeated ? '' : 'danger'}" data-action="fight" data-id="${id}" style="margin-top:6px">${st.defeated ? 'Rematch' : 'Challenge'}</button>` : `<div class="tiny bad">🔒 ${esc(st.reasons.join(' · '))}</div>`}
    </div></div>`;
}
