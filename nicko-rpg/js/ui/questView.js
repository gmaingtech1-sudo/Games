// Quest journal: main, side and daily quests with progress and rewards.

import { app, registerTab, refresh, autosave, announce } from './app.js';
import { html, raw, esc, delegate, toast, barHtml } from './dom.js';
import { QUESTS, questEntry, questProgress, questTarget, resolveReward, refreshQuests } from '../quests.js';
import { claimQuestReward } from '../gameState.js';
import { getItem } from '../items.js';
import { fmt } from '../utils.js';
import { sfx } from '../audio.js';

const ui = { tab: 'active' };

registerTab('quests', (root) => {
  const s = app.state;
  refreshQuests(s);
  const all = QUESTS.map((q) => ({ q, e: questEntry(s, q) })).filter((x) => x.e);
  const groups = {
    active: all.filter((x) => x.e.status !== 'claimed' && x.q.kind !== 'daily'),
    daily: all.filter((x) => x.q.kind === 'daily'),
    completed: all.filter((x) => x.e.status === 'claimed' && x.q.kind !== 'daily'),
  };
  groups.active.sort((a, b) => (b.e.status === 'complete') - (a.e.status === 'complete') || (a.q.kind === 'main' ? -1 : 1));
  const list = groups[ui.tab];
  root.innerHTML = html`
  <div class="screen-head"><h2>📜 Quest Journal</h2></div>
  <div class="tabs" role="tablist">
    ${raw(['active', 'daily', 'completed'].map((t) => `<button class="tab${ui.tab === t ? ' active' : ''}" data-action="tab" data-t="${t}" role="tab">${t[0].toUpperCase() + t.slice(1)} (${groups[t].length})</button>`).join(''))}
  </div>
  ${raw(ui.tab === 'daily' ? '<p class="small muted">Daily bounties reset every day. Each can be claimed once per day.</p>' : '')}
  <div class="grid-2">${raw(list.length ? list.map(({ q, e }) => questCard(s, q, e)).join('') : '<p class="muted">No quests here yet.</p>')}</div>`;
  delegate(root, {
    tab: (el) => { ui.tab = el.dataset.t; refresh(); },
    claim: (el) => {
      const r = claimQuestReward(s, el.dataset.id);
      if (!r.ok) { toast(r.reason, { type: 'bad' }); sfx('error'); refresh(); return; }
      sfx('victory');
      toast(`${r.quest.name}: +${fmt(r.xp)} XP, +${fmt(r.gold)} gold${r.items.length ? ', ' + r.items.map((i) => getItem(i.id).name + (i.qty > 1 ? ` x${i.qty}` : '')).join(', ') : ''}`, { type: 'gold', timeout: 4000 });
      announce({ levelUps: r.levelUps, completed: r.completed, unlocked: r.unlocked });
      autosave();
      refresh();
    },
  });
});

function questCard(s, q, e) {
  const prog = questProgress(s, q);
  const target = questTarget(q);
  const r = resolveReward(s, q);
  const rewards = [r.xp ? `${fmt(r.xp)} XP` : '', r.gold ? `${fmt(r.gold)} gold` : '', ...(r.items || []).map((i) => `${getItem(i.id)?.name}${i.qty > 1 ? ` ×${i.qty}` : ''}`)].filter(Boolean).join(' · ');
  return `<div class="card quest ${e.status}">
    <div class="row between"><span class="kind ${q.kind}">${q.kind === 'main' ? 'Main quest' : q.kind === 'daily' ? 'Daily' : 'Side quest'}</span>${e.status === 'claimed' ? '<span class="tag">Claimed</span>' : e.status === 'complete' ? '<span class="tag gold">Complete!</span>' : ''}</div>
    <b>${esc(q.name)}</b>
    <div class="small muted">${esc(q.desc)}</div>
    <div class="small">${esc(q.objective.label)}: <b>${prog} / ${target}</b></div>
    <div class="progress">${barHtml('xp', prog, target, { label: false })}</div>
    <div class="tiny gold">Reward: ${esc(rewards)}</div>
    ${e.status === 'complete' ? `<button class="btn primary small" data-action="claim" data-id="${q.id}">Claim reward</button>` : ''}
  </div>`;
}
