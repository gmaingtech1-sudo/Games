// The in-game shell: HUD, navigation, the town and the world map / locations.

import { app, registerTab, setRerender, autosave, announce, refresh } from './app.js';
import { $, html, raw, esc, delegate, barHtml, toast, modal, showScreen } from './dom.js';
import { computeStats, xpToNext, MAX_LEVEL, CLASSES } from '../character.js';
import { classEmblem } from '../art.js';
import { fmt } from '../utils.js';
import { DUNGEONS, getDungeon, dungeonStatus } from '../dungeons.js';
import { ENEMIES } from '../enemies.js';
import { BOSSES } from '../bosses.js';
import { explore } from '../gameState.js';
import { restCost, rest } from '../shop.js';
import { QUESTS, questEntry } from '../quests.js';
import { getItem } from '../items.js';
import { sfx, playMusic } from '../audio.js';
import { startExplorationFight, startBossEncounter } from './combatView.js';

const TABS = [
  { id: 'town', ico: '🏰', label: 'Town', mobile: true },
  { id: 'hero', ico: '🛡', label: 'Hero', mobile: true },
  { id: 'bag', ico: '🎒', label: 'Bag', mobile: true },
  { id: 'skills', ico: '✦', label: 'Skills', mobile: true },
  { id: 'quests', ico: '📜', label: 'Quests', mobile: true },
  { id: 'gear', ico: '⚔', label: 'Gear' },
  { id: 'shop', ico: '⚖', label: 'Shop' },
  { id: 'bosses', ico: '☠', label: 'Bosses' },
  { id: 'saves', ico: '💾', label: 'Save / Load', screen: true },
  { id: 'settings', ico: '⚙', label: 'Settings', screen: true },
  { id: 'creator', ico: '🧪', label: 'Enemy Creator', screen: true, dev: true },
  { id: 'menu', ico: '⏏', label: 'Main Menu', screen: true },
];

export function claimableCount(state) {
  return QUESTS.filter((q) => questEntry(state, q)?.status === 'complete').length;
}

export function renderHud() {
  const s = app.state;
  if (!s) return;
  const p = s.player;
  const st = computeStats(p);
  const need = xpToNext(p.level);
  $('#hud').innerHTML = `
    <div class="row" style="gap:8px;min-width:0">${classEmblem(p.classId)}
      <div style="min-width:0"><div class="hud-name">${esc(p.name)}</div><div class="tiny muted">Lv ${p.level} ${esc(CLASSES[p.classId].name)}</div></div></div>
    <div class="hud-bars">
      ${barHtml('hp', p.hp, st.maxHp)}
      ${barHtml('mp', p.mp, st.maxMp)}
      <div data-tip="${p.level >= MAX_LEVEL ? 'Maximum level' : `${p.xp} / ${need} experience`}">${barHtml('xp', p.level >= MAX_LEVEL ? 1 : p.xp, p.level >= MAX_LEVEL ? 1 : need, { label: false })}</div>
    </div>
    <div class="hud-right"><div class="gold">● ${fmt(p.gold)}</div>${p.skillPoints ? `<div class="tiny" style="color:var(--purple-2)">${p.skillPoints} skill pt${p.skillPoints > 1 ? 's' : ''}</div>` : ''}</div>`;
}

function renderNav() {
  const s = app.state;
  const claim = claimableCount(s);
  const pts = s.player.skillPoints;
  const btn = (t) => {
    if (t.dev && !app.settings.devTools) return '';
    const dot = t.id === 'quests' && claim ? `<span class="dot">${claim}</span>` : t.id === 'skills' && pts ? `<span class="dot">${pts}</span>` : '';
    const cls = t.mobile ? '' : ' nav-desktop-only';
    return `<button class="nav-btn${cls}${app.tab === t.id ? ' active' : ''}" data-action="nav" data-tab="${t.id}" aria-label="${t.label}"><span class="ico" aria-hidden="true">${t.ico}</span><span>${t.label}</span>${dot}</button>`;
  };
  $('#game-nav').innerHTML = TABS.map(btn).join('') + `<button class="nav-btn nav-mobile-only" data-action="more" aria-label="More"><span class="ico" aria-hidden="true">☰</span><span>More</span>${claim && false ? '' : ''}</button>`;
}

export function openTab(id) {
  const t = TABS.find((x) => x.id === id);
  if (t?.screen) { openScreenFromGame(id); return; }
  app.tab = id;
  renderGame();
  window.scrollTo(0, 0);
}

function openScreenFromGame(id) {
  if (id === 'menu') { window.dispatchEvent(new CustomEvent('nicko:menu')); return; }
  app.returnTo = 'game';
  window.dispatchEvent(new CustomEvent('nicko:open', { detail: id }));
}

export function renderGame() {
  if (!app.state) return;
  renderHud();
  renderNav();
  const fn = app.renderers[app.tab] || app.renderers.town;
  // A fresh container each render so delegated listeners never stack up.
  const body = document.createElement('div');
  $('#game-body').replaceChildren(body);
  fn(body);
}

export function enterGame(tab = 'town') {
  app.tab = tab;
  showScreen('game');
  playMusic('town');
  renderGame();
}

/* ---------------- Town ---------------- */

registerTab('town', (root) => {
  const s = app.state;
  const p = s.player;
  const st = computeStats(p);
  const cost = restCost(p.level);
  const claim = claimableCount(s);
  root.innerHTML = html`
    <div class="panel">
      <h2 class="panel-title">🏰 Emberhollow</h2>
      <p class="muted small">The last free town on the edge of the wilds. Rest, resupply, then venture out.</p>
      <div class="town-actions">
        <button class="card clickable" data-action="rest" ${raw(p.hp >= st.maxHp && p.mp >= st.maxMp ? 'data-tip="You are fully rested."' : '')}><span class="big">🛏</span><b>Inn</b><div class="tiny muted">Rest: ${cost}g</div></button>
        <button class="card clickable" data-action="nav" data-tab="shop"><span class="big">⚖</span><b>Market</b><div class="tiny muted">Buy, sell, upgrade</div></button>
        <button class="card clickable" data-action="nav" data-tab="bosses"><span class="big">☠</span><b>Boss Arena</b><div class="tiny muted">${Object.keys(s.bosses.defeated).length}/${Object.keys(BOSSES).length} defeated</div></button>
        <button class="card clickable" data-action="nav" data-tab="quests"><span class="big">📜</span><b>Quest Board</b><div class="tiny ${claim ? 'gold' : 'muted'}">${claim ? `${claim} to claim!` : 'View journal'}</div></button>
      </div>
    </div>
    <div class="panel">
      <h2 class="panel-title">🗺 World Map</h2>
      <div class="map-grid">${raw(DUNGEONS.map((d) => locationCard(s, d)).join(''))}</div>
    </div>`;
  delegate(root, {
    nav: (el) => openTab(el.dataset.tab),
    rest: () => {
      const r = rest(s);
      if (!r.ok) { toast(r.reason, { type: 'bad' }); sfx('error'); return; }
      sfx('heal');
      toast(`You rest at the inn (${r.cost}g). Fully restored!`, { type: 'good' });
      autosave();
      refresh();
    },
    loc: (el) => {
      const d = getDungeon(el.dataset.id);
      const stt = dungeonStatus(s, d);
      if (!stt.unlocked) { toast(`Locked: ${stt.reasons.join(', ')}`, { type: 'bad' }); sfx('error'); return; }
      app.dungeonId = d.id;
      app.exploreLog = [];
      openTab('location');
    },
  });
});

function locationCard(s, d) {
  const st = dungeonStatus(s, d);
  const explored = s.dungeons.explored[d.id] || 0;
  const bossIds = d.bosses || (d.boss ? [d.boss] : []);
  const bossDone = bossIds.length && bossIds.every((b) => s.bosses.defeated[b]);
  const diff = d.rec - s.player.level;
  const danger = diff >= 4 ? 'bad' : diff >= 2 ? 'gold' : 'good';
  return `<button class="card clickable loc-card${st.unlocked ? '' : ' locked'}" data-action="loc" data-id="${d.id}" style="--loc:${d.color}" aria-label="${esc(d.name)}">
    <div class="glyph" aria-hidden="true">${st.unlocked ? d.glyph : '🔒'}</div>
    <div style="text-align:left;min-width:0">
      <b>${esc(d.name)}</b> ${bossDone ? '<span class="tag gold">Cleared</span>' : ''}
      <div class="lvl ${st.unlocked ? danger : 'muted'}">Levels ${d.minLevel}–${d.maxLevel} · recommended ${d.rec}</div>
      <div class="tiny muted">${st.unlocked ? `Explored ${explored} time${explored === 1 ? '' : 's'}` : esc(st.reasons.join(' · '))}</div>
    </div></button>`;
}

/* ---------------- Location ---------------- */

registerTab('location', (root) => {
  const s = app.state;
  const d = getDungeon(app.dungeonId);
  if (!d) { app.tab = 'town'; renderGame(); return; }
  const bossIds = d.bosses || (d.boss ? [d.boss] : []);
  const enemies = [...new Set(d.encounters.map((e) => e.enemy))].map((id) => ENEMIES[id]);
  root.innerHTML = html`
    <div class="loc-hero" style="--loc:${d.color}">
      <button class="btn small ghost" data-action="back">← World Map</button>
      <h2 style="margin-top:10px">${d.glyph} ${d.name}</h2>
      <p class="small">${d.desc}</p>
      <div class="row tiny"><span class="tag">Levels ${d.minLevel}–${d.maxLevel}</span><span class="tag gold">Recommended ${d.rec}</span><span class="tag">Explored ${s.dungeons.explored[d.id] || 0}×</span></div>
    </div>
    <div class="grid-2">
      <div class="panel">
        <h3 class="panel-title">Explore</h3>
        <p class="small muted">Each step into the ${d.name} may bring a monster, a hidden cache, a trap or an ancient shrine.</p>
        <button class="btn primary block" data-action="explore" id="explore-btn" ${raw(s.player.hp <= 0 ? 'disabled' : '')}>⚔ Explore <span class="kbd">E</span></button>
        <div class="stack" id="explore-log" style="margin-top:12px">${raw(app.exploreLog.map(eventCard).join(''))}</div>
      </div>
      <div class="panel">
        <h3 class="panel-title">Bestiary</h3>
        <div class="stack">${raw(enemies.map((e) => `<div class="small"><b>${esc(e.name)}</b> <span class="muted">— ${esc(e.desc)}</span>
          <div class="row" style="gap:4px;margin-top:3px">${e.weak.map((w) => `<span class="tag weak">Weak: ${w}</span>`).join('')}${e.resist.map((w) => `<span class="tag resist">Resists: ${w}</span>`).join('')}${e.immune.map((w) => `<span class="tag immune">Immune: ${w}</span>`).join('')}</div></div>`).join(''))}</div>
        ${raw(bossIds.length ? `<div class="divider"></div><h3 class="panel-title">Lair Boss</h3>${bossIds.map((b) => {
          const B = BOSSES[b];
          return `<div class="row between"><div><b>${esc(B.name)}</b> <span class="tiny muted">Lv ${B.level}</span>${s.bosses.defeated[b] ? ' <span class="tag gold">Defeated</span>' : ''}</div>
            <button class="btn small danger" data-action="boss" data-id="${b}">Challenge</button></div>`;
        }).join('')}` : '')}
      </div>
    </div>`;
  delegate(root, {
    back: () => openTab('town'),
    explore: () => doExplore(d),
    boss: (el) => startBossEncounter(el.dataset.id),
  });
});

function eventCard(ev) {
  const cls = { treasure: 'treasure', trap: 'trap', shrine: 'shrine', traveller: 'treasure' }[ev.type] || '';
  return `<div class="card event-card ${cls} small">${esc(ev.text)}</div>`;
}

export async function doExplore(d) {
  const s = app.state;
  if (s.player.hp <= 1) {
    const go = await modal({ title: 'Badly wounded', body: '<p>You are badly wounded. Rest at the inn or drink a potion first?</p>', buttons: [{ label: 'Explore anyway', value: true }, { label: 'Cancel', value: false, cls: 'primary' }] });
    if (!go) return;
  }
  const r = explore(s, d.id);
  if (r.type === 'error') { toast(r.message, { type: 'bad' }); return; }
  announce({ completed: r.completed });
  if (r.type === 'fight') {
    sfx('click');
    startExplorationFight(r.enemy, d.id);
    return;
  }
  let text = r.text;
  if (r.type === 'treasure') {
    text += ` +${r.gold} gold${r.items.length ? ', ' + r.items.map((i) => getItem(i).name).join(', ') : ''}.`;
    sfx('loot');
  } else if (r.type === 'trap') { text += ` You take ${r.dmg} damage.`; sfx('hurt'); }
  else if (r.type === 'shrine') { text += ` (+${r.hp} health, +${r.mp} mana)`; sfx('heal'); }
  else if (r.type === 'traveller') sfx('rare');
  app.exploreLog.unshift({ type: r.type, text });
  app.exploreLog = app.exploreLog.slice(0, 6);
  autosave();
  refresh();
}

export function initGameShell() {
  setRerender(renderGame);
  delegate($('#game-nav'), {
    nav: (el) => { sfx('click'); openTab(el.dataset.tab); },
    more: async () => {
      const items = TABS.filter((t) => !t.mobile && (!t.dev || app.settings.devTools));
      const v = await modal({
        title: 'Menu',
        body: `<div class="town-actions">${items.map((t) => `<button class="card clickable" data-more="${t.id}"><span class="big">${t.ico}</span><b>${t.label}</b></button>`).join('')}</div>`,
        buttons: [{ label: 'Close', value: null }],
      });
      if (v) openTab(v);
    },
  });
  // "More" sheet buttons resolve the modal via a custom click handler.
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-more]');
    if (!b) return;
    const id = b.dataset.more;
    const back = b.closest('.backdrop');
    if (back) back.querySelector('.actions-row .btn')?.click();
    setTimeout(() => openTab(id), 0);
  });
}
