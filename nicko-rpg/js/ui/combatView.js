// Combat screen: renders the fight, sends player actions to the engine and
// animates the resulting events. Input is locked while events play and while
// it is the enemy's turn, so rapid clicks can't trigger extra actions.

import { app, autosave, announce } from './app.js';
import { $, $$, esc, html, raw, barHtml, setBar, toast, modal, showScreen, wait, delegate, banner } from './dom.js';
import { effectChips, itemTooltipHtml, ELEMENT_GLYPH } from './format.js';
import { enemySvg, heroSvg, itemIconSvg } from '../art.js';
import { getAbility, manaCost, ELEMENTS } from '../abilities.js';
import { getItem } from '../items.js';
import { makeCombat, startBossFight, finishCombat } from '../gameState.js';
import { getBoss } from '../bosses.js';
import { BEHAVIOURS } from '../enemies.js';
import { eventDelay } from '../settings.js';
import { sfx, playMusic } from '../audio.js';
import { fmt } from '../utils.js';

let cur = null; // { combat, state, busy, onExit, showItems, ended }

export function combatActive() { return !!cur && !cur.ended; }

/* ---------------- Entry points ---------------- */

export function startExplorationFight(enemy, dungeonId) {
  const combat = makeCombat(app.state, enemy, { dungeonId });
  run(combat, app.state, async (summary) => {
    const { enterGame } = await import('./gameView.js');
    if (summary.result === 'victory') {
      app.exploreLog.unshift({ type: 'fight', text: `Defeated ${enemy.name} (+${summary.xp} XP, +${summary.gold} gold).` });
    } else if (summary.result === 'fled') {
      app.exploreLog.unshift({ type: 'fight', text: `You escaped from ${enemy.name}.` });
    }
    app.exploreLog = app.exploreLog.slice(0, 6);
    enterGame('location');
  });
}

export async function startBossEncounter(bossId) {
  const b = getBoss(bossId);
  const res = startBossFight(app.state, bossId);
  if (!res.ok) { toast(`Locked: ${res.reason}`, { type: 'bad' }); sfx('error'); return; }
  sfx('boss');
  const first = !app.state.bosses.defeated[bossId];
  const go = await modal({
    title: '',
    className: 'boss-intro',
    dismissible: false,
    body: `<div class="boss-intro">${enemySvg(b.look, { boss: true, id: 'intro' + bossId, label: b.name })}
      <div class="title">${esc(b.title)}</div><h2 style="color:var(--red-2);font-size:1.8rem">${esc(b.name)}</h2>
      <p><i>${esc(b.intro)}</i></p><p class="small muted">${esc(b.desc)}</p>
      <p class="small">${first ? '<span class="gold">First victory grants unique loot and bonus experience.</span>' : '<span class="muted">Already defeated: a rematch gives smaller rewards and a chance at bonus loot.</span>'}</p>
      <p class="tiny muted">Tip: when a boss winds up a big attack, Defend to take a quarter of the damage — or stun it to interrupt.</p></div>`,
    buttons: [{ label: 'Retreat', value: false }, { label: 'Fight!', value: true, cls: 'danger' }],
  });
  if (!go) { app.state.bosses.attempts[bossId] = Math.max(0, (app.state.bosses.attempts[bossId] || 1) - 1); return; }
  run(res.combat, app.state, async () => {
    const { enterGame } = await import('./gameView.js');
    enterGame('bosses');
  }, { boss: true });
}

/** Developer test fight: a sandboxed copy of the hero, no rewards. */
export function startTestFight(state, enemyUnit, onExit) {
  const combat = makeCombat(state, enemyUnit, { mode: 'test' });
  run(combat, state, onExit, { test: true });
}

/* ---------------- Rendering ---------------- */

function run(combat, state, onExit, opts = {}) {
  cur = { combat, state, busy: false, onExit, showItems: false, ended: false, opts };
  showScreen('combat');
  playMusic(combat.e.isBoss ? 'boss' : 'combat');
  render();
  log(combat.e.isBoss ? `${combat.e.name} stands before you!` : `A wild ${combat.e.name} (level ${combat.e.level}) appears!`, 'warn');
  if (opts.test) log('Test fight: nothing you do here affects your saved progress.', 'info');
  setTurn('player');
}

function render() {
  const { combat: c } = cur;
  const e = c.e, p = c.p;
  const markers = e.isBoss ? e.phases.slice(1).map((ph) => ph.at) : [];
  // Fresh container per fight so delegated listeners never stack up.
  const root = document.createElement('div');
  $('#screen-combat').replaceChildren(root);
  root.innerHTML = html`
  <div class="combat">
    <div class="enemy-zone panel">
      ${raw(e.isBoss ? `<div class="tiny" style="color:var(--red-2);letter-spacing:.3em;text-transform:uppercase">${esc(e.title || 'Boss')}</div>` : '')}
      <div class="enemy-name">${e.name} <span class="lvl">Lv ${e.level}${raw(e.elite ? ' · <span class="gold">Elite</span>' : '')}</span></div>
      <div class="row" style="justify-content:center;gap:4px">${raw(tagsHtml(e))}</div>
      <div id="e-bar">${raw(barHtml('enemy', e.hp, e.maxHp, { cls: e.isBoss ? 'boss' : '', markers }))}</div>
      ${raw(e.isBoss ? `<div class="tiny muted" id="e-phase">Phase ${(e.phaseIndex || 0) + 1}: ${esc(e.phases[e.phaseIndex || 0].name)}</div>` : '')}
      <div class="effects" id="e-fx"></div>
      <div class="sprite${e.isBoss ? ' boss' : ''}" id="e-sprite">${raw(enemySvg(e.look, { boss: e.isBoss, id: 'c' + (e.bossId || e.templateId), label: e.name }))}<div class="floaters"></div></div>
      <div class="telegraph" id="telegraph"></div>
    </div>
    <div class="player-zone panel">
      <div class="sprite" id="p-sprite">${raw(heroSvg(p.classId))}<div class="floaters"></div></div>
      <div class="combatant">
        <div class="row between"><b>${p.name}</b><span class="tiny muted">Lv ${p.level} · ATK ${p.atk} · DEF ${p.def} · SPD ${p.spd}</span></div>
        <div id="p-hp">${raw(barHtml('hp', p.hp, p.maxHp))}</div>
        <div id="p-mp">${raw(barHtml('mp', p.mp, p.maxMp))}</div>
        <div class="effects" id="p-fx" style="justify-content:flex-start"></div>
      </div>
    </div>
    <div class="log-wrap"><div class="turn-indicator" id="turn"></div><div class="log" id="log" aria-live="polite"></div></div>
    <div class="action-wrap panel" id="actions"></div>
  </div>`;
  renderEffects(p.effects, e.effects);
  renderActions();
  delegate(root, {
    attack: () => act({ type: 'attack' }),
    defend: () => act({ type: 'defend' }),
    flee: () => act({ type: 'flee' }),
    ability: (el) => act({ type: 'ability', id: el.dataset.id }),
    useitem: (el) => { cur.showItems = false; act({ type: 'item', uid: el.dataset.uid }); },
    items: () => { cur.showItems = !cur.showItems; renderActions(); },
  });
}

function tagsHtml(e) {
  const t = [];
  for (const w of e.weak) t.push(`<span class="tag weak" data-tip="Takes 50% more ${w} damage">${ELEMENT_GLYPH[w] || ''} Weak: ${w}</span>`);
  for (const w of e.resist) t.push(`<span class="tag resist" data-tip="Takes 50% less ${w} damage">${ELEMENT_GLYPH[w] || ''} Resists: ${w}</span>`);
  for (const w of e.immune) t.push(`<span class="tag immune">Immune: ${w}</span>`);
  if (!e.isBoss) t.push(`<span class="tag" data-tip="${esc(BEHAVIOURS[e.behaviour]?.desc || '')}">${esc(BEHAVIOURS[e.behaviour]?.name || '')}</span>`);
  return t.join('');
}

function potionsAvailable() {
  const c = cur.combat;
  if (c.hooks.sandbox) {
    return Object.entries(c.hooks.sandbox).filter(([, n]) => n > 0).map(([id, n]) => ({ uid: id, id, qty: n }));
  }
  return cur.state.inventory.filter((x) => getItem(x.id)?.type === 'potion');
}

function renderActions() {
  const c = cur.combat;
  const box = $('#actions');
  if (!box) return;
  const locked = cur.busy || c.phase !== 'player';
  const dis = locked ? 'disabled' : '';
  const potions = potionsAvailable();
  const abil = c.p.abilities.map((id, i) => {
    const a = getAbility(id);
    const st = c.abilityState(id);
    const color = ELEMENTS[a.element]?.color || '#888';
    const disabled = locked || !st.usable;
    const tip = `${a.desc}${st.usable || locked ? '' : ` — ${st.reason}`}`;
    return `<button class="btn ability-btn${a.ultimate ? ' ult' : ''}" style="--ec:${color}" data-action="ability" data-id="${id}" ${disabled ? 'disabled' : ''} data-tip="${esc(tip)}" aria-label="${esc(a.name)}">
      <span class="nm">${esc(a.name)}${i < 9 ? ` <span class="kbd">${i + 1}</span>` : ''}</span>
      <span class="meta"><span class="mp">${manaCost(a, c.p.level)} MP</span> · ${a.kind === 'attack' ? `${ELEMENT_GLYPH[a.element] || ''} ${Math.round(a.mult * a.hits * 100)}%` : a.kind}</span>
      ${st.cd ? `<span class="cd">⟳${st.cd}</span>` : ''}</button>`;
  }).join('');
  const items = cur.showItems ? `<div class="combat-items" style="margin-top:8px">${potions.length ? potions.map((x) => {
    const d = getItem(x.id);
    const blocked = d.effect.flee && !c.canFlee;
    return `<button class="btn small" data-action="useitem" data-uid="${esc(x.uid)}" ${locked || blocked ? 'disabled' : ''} data-tip-html="${esc(itemTooltipHtml(d))}"><span style="width:22px;height:22px;display:inline-block">${itemIconSvg(d)}</span>${esc(d.name)} ×${x.qty}</button>`;
  }).join('') : '<p class="small muted">No potions. Buy some at the market.</p>'}</div>` : '';
  box.innerHTML = `
    <div class="actions">
      <button class="btn primary" data-action="attack" ${dis}>⚔ Attack<small>A</small></button>
      <button class="btn" data-action="defend" ${dis} data-tip="Halve incoming damage (quarter against charged attacks) and recover 10% mana.">⛨ Defend<small>D</small></button>
      <button class="btn${cur.showItems ? ' magic' : ''}" data-action="items" ${locked ? 'disabled' : ''}>🧪 Items<small>I · ${potions.reduce((s, x) => s + x.qty, 0)}</small></button>
      <button class="btn" data-action="flee" ${locked || !c.canFlee ? 'disabled' : ''} data-tip="${c.canFlee ? 'Try to escape. Faster heroes escape more often.' : 'You cannot flee from a boss.'}">🏃 Flee<small>F</small></button>
    </div>
    ${items}
    <div class="ability-grid" style="margin-top:8px">${abil}</div>`;
}

function renderEffects(pfx, efx) {
  const a = $('#p-fx'), b = $('#e-fx');
  if (a) a.innerHTML = effectChips(pfx);
  if (b) b.innerHTML = effectChips(efx);
}

function applySnap(snap) {
  if (!snap) return;
  setBar($('#p-hp .bar'), snap.p.hp, snap.p.maxHp);
  setBar($('#p-mp .bar'), snap.p.mp, snap.p.maxMp);
  setBar($('#e-bar .bar'), snap.e.hp, snap.e.maxHp);
  renderEffects(snap.p.effects, snap.e.effects);
  const tel = $('#telegraph');
  const spr = $('#e-sprite');
  if (tel && !snap.e.charging) { tel.classList.remove('show'); spr?.classList.remove('charging'); }
}

function log(text, cls = 'info') {
  const box = $('#log');
  if (!box) return;
  const p = document.createElement('p');
  p.className = cls;
  p.textContent = text;
  box.appendChild(p);
  while (box.children.length > 80) box.firstChild.remove();
  box.scrollTop = box.scrollHeight;
}

function setTurn(who) {
  const t = $('#turn');
  if (!t) return;
  t.className = `turn-indicator ${who}`;
  t.textContent = who === 'player' ? 'Your turn' : who === 'enemy' ? `${cur.combat.e.name}'s turn` : '';
}

function floater(target, text, cls) {
  if (!app.settings.combatText) return;
  const box = $(`#${target === 'player' ? 'p' : 'e'}-sprite .floaters`);
  if (!box) return;
  const f = document.createElement('div');
  f.className = `floater ${cls}`;
  f.textContent = text;
  f.style.left = `${40 + Math.random() * 20}%`;
  box.appendChild(f);
  setTimeout(() => f.remove(), 1200);
}

function hitAnim(target) {
  const el = $(`#${target === 'player' ? 'p' : 'e'}-sprite`);
  if (!el || app.settings.animation === 'off' || app.settings.reducedMotion) return;
  el.classList.remove('hit', 'flash');
  void el.offsetWidth;
  el.classList.add('hit', 'flash');
  setTimeout(() => el.classList.remove('flash'), 140);
}

async function play(events) {
  const d = eventDelay(app.settings);
  for (const ev of events) {
    switch (ev.type) {
      case 'log': log(ev.text, ev.cls); await wait(d * 0.55); break;
      case 'turn': setTurn(ev.who); if (ev.who === 'enemy') await wait(d * 0.4); break;
      case 'damage': {
        const txt = ev.amount + (ev.absorbed ? ` (${ev.absorbed})` : '');
        floater(ev.target, ev.crit ? `${txt}!` : txt, `${ev.target === 'player' ? 'hurt' : 'dmg'}${ev.crit ? ' crit' : ''}${ev.weak ? ' weak' : ''}`);
        hitAnim(ev.target);
        sfx(ev.target === 'player' ? 'hurt' : ev.crit ? 'crit' : ev.element === 'fire' ? 'fire' : ev.element === 'ice' ? 'ice' : 'hit');
        break;
      }
      case 'dot': floater(ev.target, `${ev.amount}`, ev.target === 'player' ? 'hurt' : 'dmg'); log(ev.text, ev.cls); await wait(d * 0.5); break;
      case 'heal': floater(ev.target, `+${ev.amount}`, 'heal'); if (ev.text) log(ev.text, ev.cls); if (ev.target === 'player') sfx('heal'); break;
      case 'mana': floater(ev.target, `${ev.amount > 0 ? '+' : ''}${ev.amount} MP`, 'mana'); break;
      case 'miss': floater(ev.target, 'Miss', 'miss'); sfx('miss'); break;
      case 'skip': log(ev.text, 'warn'); await wait(d * 0.5); break;
      case 'item': sfx('potion'); break;
      case 'ability': sfx(ev.kind === 'attack' ? 'spell' : 'buff'); break;
      case 'defend': sfx('buff'); break;
      case 'telegraph': {
        const tel = $('#telegraph');
        if (tel) { tel.textContent = `⚠ ${ev.name} incoming! Defend to brace (75% less damage) or stun to interrupt.`; tel.classList.add('show'); }
        $('#e-sprite')?.classList.add('charging');
        sfx('telegraph');
        break;
      }
      case 'interrupt': sfx('crit'); break;
      case 'phase': {
        sfx('phase');
        const ph = $('#e-phase');
        if (ph) ph.textContent = `Phase ${ev.index + 1}: ${ev.name}`;
        banner(`Phase ${ev.index + 1}`, ev.name);
        await wait(d);
        break;
      }
      case 'end': break;
      default: break;
    }
    applySnap(ev.snap);
    if (ev.type === 'damage' || ev.type === 'heal' || ev.type === 'miss') await wait(d * 0.45);
  }
}

/* ---------------- Actions ---------------- */

async function act(action) {
  if (!cur || cur.busy || cur.ended) return;
  const c = cur.combat;
  if (c.phase !== 'player') return;
  cur.busy = true;
  renderActions();
  try {
    const res = c.act(action);
    if (!res.ok) {
      toast(res.error, { type: 'bad' });
      sfx('error');
      return;
    }
    await play(res.events);
  } catch (err) {
    console.error(err);
  } finally {
    if (cur) {
      cur.busy = false;
      if (c.over) await end();
      else renderActions();
    }
  }
}

async function end() {
  if (!cur || cur.ended) return;
  cur.ended = true;
  const { combat: c, state, onExit, opts } = cur;
  const summary = finishCombat(state, c);
  if (c.phase === 'victory') {
    $('#e-sprite')?.classList.add('dead');
    sfx('victory');
  } else if (c.phase === 'defeat') {
    $('#p-sprite')?.classList.add('dead');
    sfx('defeat');
  }
  await wait(600);
  // Defeats are not autosaved, so 'Load last save' returns to before the fight.
  if (!opts.test && c.phase !== 'defeat') autosave();
  if (c.phase === 'defeat' && !opts.test) {
    cur = null;
    window.dispatchEvent(new CustomEvent('nicko:gameover', { detail: summary }));
    return;
  }
  await showResult(c, summary, opts);
  cur = null;
  if (!opts.test) announce({ levelUps: summary.levelUps, completed: summary.completed, unlocked: summary.unlocked });
  onExit && onExit(summary);
}

function showResult(c, s, opts) {
  const e = c.e;
  let body;
  if (s.result === 'victory') {
    const items = (s.items || []).map((it) => {
      const d = getItem(it.id);
      return `<div class="reward rb-${d.rarity}"><span class="icon-box">${itemIconSvg(d)}</span><span class="r-${d.rarity}"><b>${esc(d.name)}</b>${it.qty > 1 ? ` ×${it.qty}` : ''}</span>${it.guaranteed ? '<span class="tag gold" style="margin-left:auto">Boss reward</span>' : it.bonus ? '<span class="tag purple" style="margin-left:auto">Bonus</span>' : ''}</div>`;
    }).join('');
    body = `<div class="result victory"><h2>${e.isBoss ? 'BOSS DEFEATED' : 'Victory!'}</h2>
      ${opts.test ? '<p class="muted">Test fight complete. No rewards are given.</p>' : `
      <p>${esc(e.name)} has been defeated${s.firstKill ? ' for the first time!' : '.'}</p>
      <div class="row" style="justify-content:center"><span class="tag purple">+${fmt(s.xp)} XP</span><span class="tag gold">+${fmt(s.gold)} gold</span>${s.levelUps.length ? `<span class="tag gold">Level ${s.levelUps[s.levelUps.length - 1].level}!</span>` : ''}</div>
      <div class="reward-list">${items || '<p class="small muted center">No items dropped.</p>'}</div>
      ${s.converted ? `<p class="small gold">Your bag was full: ${s.converted} gold for the overflow.</p>` : ''}`}
      <p class="tiny muted">Damage dealt ${c.stats.damageDealt} · taken ${c.stats.damageTaken} · crits ${c.stats.crits} · turns ${c.turn}</p></div>`;
  } else if (s.result === 'fled') {
    body = `<div class="result"><h2>Escaped</h2><p>You live to fight another day.</p></div>`;
  } else {
    body = `<div class="result defeat"><h2>Defeated</h2><p class="muted">Test fight over. Your real hero is unharmed.</p></div>`;
  }
  return modal({ title: '', body, dismissible: false, buttons: [{ label: 'Continue', value: true, cls: 'primary' }] });
}

/* ---------------- Keyboard ---------------- */

export function combatKey(e) {
  if (!cur || cur.ended || cur.busy) return false;
  const k = e.key.toLowerCase();
  if (k === 'a') { act({ type: 'attack' }); return true; }
  if (k === 'd') { act({ type: 'defend' }); return true; }
  if (k === 'f') { act({ type: 'flee' }); return true; }
  if (k === 'i') { cur.showItems = !cur.showItems; renderActions(); return true; }
  if (/^[1-9]$/.test(k)) {
    const id = cur.combat.p.abilities[+k - 1];
    if (id) act({ type: 'ability', id });
    return true;
  }
  if (k === 'escape' && cur.showItems) { cur.showItems = false; renderActions(); return true; }
  return false;
}
