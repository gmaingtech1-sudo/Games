// Visual skill tree: three branches, five tiers each, with prerequisites,
// costs, ranks and the reasons a node is locked.

import { app, registerTab, refresh, autosave } from './app.js';
import { html, raw, esc, delegate, toast, confirmDialog, modal } from './dom.js';
import { BRANCHES, SKILL_NODES, canUnlock, unlockSkill, skillRank, nodeDescription, respec, respecCost, spentPoints } from '../skillTree.js';
import { getAbility, manaCost } from '../abilities.js';
import { CLASSES } from '../character.js';
import { sfx } from '../audio.js';

registerTab('skills', (root) => {
  const s = app.state;
  const p = s.player;
  const branches = BRANCHES[p.classId];
  root.innerHTML = html`
  <div class="screen-head"><h2>✦ Skill Tree</h2>
    <span class="tag purple">${p.skillPoints} point${p.skillPoints === 1 ? '' : 's'} available</span>
    <button class="btn small ghost" data-action="respec" ${raw(spentPoints(p) ? '' : 'disabled')}>Reset (${respecCost(p)}g)</button></div>
  <p class="small muted">Earn 1 skill point per level (2 every tenth level). Each tier needs the one above it. Tap a skill for details.</p>
  <div class="tree">${raw(branches.map((br) => branchHtml(p, br)).join(''))}</div>`;
  delegate(root, {
    node: (el) => nodeDialog(el.dataset.id),
    respec: async () => {
      if (!(await confirmDialog('Reset skill tree?', `Refund all ${spentPoints(p)} spent points for ${respecCost(p)} gold?`, { ok: 'Reset', danger: true }))) return;
      const r = respec(p);
      toast(r.ok ? `Skills reset. ${r.refunded} points refunded.` : r.reason, { type: r.ok ? 'good' : 'bad' });
      if (r.ok) autosave();
      refresh();
    },
  });
});

function branchHtml(p, br) {
  const nodes = br.nodes.map((n) => {
    const node = SKILL_NODES[n.id];
    const rank = skillRank(p, node.id);
    const chk = canUnlock(p, node.id);
    const state = rank >= node.maxRank ? 'learned' : chk.ok ? 'available' : rank > 0 ? 'learned' : 'locked';
    const reqs = chk.ok || rank >= node.maxRank ? '' : chk.reasons.filter((r) => !r.startsWith('Already')).join(' · ');
    return `<button class="node ${state}${node.ultimate ? ' ultimate' : ''}" data-action="node" data-id="${node.id}" aria-label="${esc(node.name)}">
      <div class="orb"><span>${node.maxRank > 1 ? `${rank}/${node.maxRank}` : rank ? '✓' : node.tier}</span></div>
      <div><b>${esc(node.name)}</b> <span class="tiny muted">${node.type === 'ability' ? (node.ultimate ? 'Ultimate' : 'Ability') : 'Passive'} · ${node.cost} pt · Lv ${node.level}</span>
      <div class="tiny muted">${esc(nodeDescription(node))}</div>${reqs ? `<div class="req">🔒 ${esc(reqs)}</div>` : ''}</div></button>`;
  }).join('');
  return `<div class="panel branch" style="--bc:${br.color}"><h3>${esc(br.name)}</h3><div class="nodes">${nodes}</div></div>`;
}

async function nodeDialog(id) {
  const p = app.state.player;
  const node = SKILL_NODES[id];
  const rank = skillRank(p, id);
  const chk = canUnlock(p, id);
  const a = node.ability ? getAbility(node.ability) : null;
  const body = `<p>${esc(nodeDescription(node))}</p>
    ${a ? `<p class="small muted">Mana ${manaCost(a, p.level)}${a.cd ? ` · cooldown ${a.cd} turn${a.cd > 1 ? 's' : ''}` : ''} · element ${esc(a.element)}</p>` : ''}
    <dl class="stat-table small"><dt>Branch</dt><dd>${esc(node.branchName)}</dd><dt>Tier</dt><dd>${node.tier}</dd><dt>Cost</dt><dd>${node.cost} point${node.cost > 1 ? 's' : ''}${node.maxRank > 1 ? ' per rank' : ''}</dd>
    <dt>Rank</dt><dd>${rank} / ${node.maxRank}</dd><dt>Required level</dt><dd>${node.level}</dd><dt>Prerequisite</dt><dd>${node.requires.length ? esc(SKILL_NODES[node.requires[0]].name) : 'None'}</dd></dl>
    ${chk.ok ? '' : `<p class="small bad" style="margin-top:8px">${esc(chk.reasons.join(' · '))}</p>`}`;
  const v = await modal({ title: node.name, body, buttons: [{ label: 'Close', value: false }, { label: rank ? 'Rank up' : 'Learn', value: true, cls: 'primary', disabled: !chk.ok }] });
  if (!v) return;
  const r = unlockSkill(p, id);
  if (!r.ok) { toast(r.reasons.join(', '), { type: 'bad' }); sfx('error'); return; }
  sfx('levelup');
  toast(`Learned ${node.name}${node.maxRank > 1 ? ` (rank ${skillRank(p, id)})` : ''}!`, { type: 'good' });
  autosave();
  refresh();
}
