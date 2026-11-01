// Main menu, credits, the New Game slot picker and character creation.

import { app } from './app.js';
import { $, html, raw, esc, delegate, showScreen, modal, confirmDialog, toast } from './dom.js';
import { listSlots, latestValidSlot, loadGame, saveGame } from '../saveSystem.js';
import { CLASSES, createPlayer, computeStats, sanitizeName } from '../character.js';
import { getAbility } from '../abilities.js';
import { knownAbilityIds } from '../skillTree.js';
import { classEmblem, heroSvg } from '../art.js';
import { newGame } from '../gameState.js';
import { fmtTime } from './format.js';
import { sfx, unlockAudio, playMusic } from '../audio.js';
import { enterGame } from './gameView.js';

export const VERSION = '1.0.0';

export function renderMenu() {
  const cont = latestValidSlot();
  const root = document.createElement('div');
  $('#screen-menu').replaceChildren(root);
  root.innerHTML = `
  <div class="menu-wrap">
    <svg class="menu-emblem" viewBox="0 0 512 512" aria-hidden="true"><use href="#none"/></svg>
    <h1 class="logo">Nicko RPG<small>Tales of Emberhollow</small></h1>
    <div class="menu-buttons">
      <button class="btn primary" data-action="new">New Game</button>
      <button class="btn" data-action="continue" ${cont ? '' : 'disabled aria-disabled="true"'} ${cont ? '' : 'data-tip="No saved game found"'}>Continue</button>
      <button class="btn" data-action="load">Load Game</button>
      <button class="btn" data-action="settings">Settings</button>
      ${app.settings.devTools ? '<button class="btn magic" data-action="creator">Enemy Creator (Dev)</button>' : ''}
      <button class="btn ghost" data-action="credits">Credits</button>
    </div>
    <div class="version">v${VERSION} · Progress is saved in this browser</div>
  </div>`;
  // Emblem: reuse the app icon artwork.
  fetch('icons/icon.svg').then((r) => r.text()).then((svg) => {
    const em = root.querySelector('.menu-emblem');
    if (em && svg.includes('<svg')) em.outerHTML = svg.replace('<svg', '<svg class="menu-emblem" aria-hidden="true"');
  }).catch(() => {});
  delegate(root, {
    new: () => { unlockAudio(); sfx('click'); renderNewGame(); showScreen('newgame'); },
    continue: () => {
      unlockAudio();
      const slot = latestValidSlot();
      if (!slot) { toast('No valid save found.', { type: 'bad' }); renderMenu(); return; }
      startFromSlot(slot);
    },
    load: () => { unlockAudio(); app.returnTo = 'menu'; window.dispatchEvent(new CustomEvent('nicko:open', { detail: 'saves' })); },
    settings: () => { unlockAudio(); app.returnTo = 'menu'; window.dispatchEvent(new CustomEvent('nicko:open', { detail: 'settings' })); },
    creator: () => { unlockAudio(); app.returnTo = 'menu'; window.dispatchEvent(new CustomEvent('nicko:open', { detail: 'creator' })); },
    credits: () => modal({
      title: 'Credits',
      body: `<p><b>Nicko RPG</b> — an original dark-fantasy role-playing game.</p>
        <p class="small">Design, code, art and sound: made for this project. All monster and item artwork is generated from original SVG shapes; every sound effect and the music are synthesised live with the Web Audio API. No third-party assets, characters or logos are used.</p>
        <p class="small muted">Built with plain HTML, CSS and JavaScript modules. No frameworks, no servers, no accounts.</p>`,
    }),
  });
}

export function startFromSlot(slot) {
  const res = loadGame(slot);
  if (!res.ok) {
    toast(res.reason === 'corrupt' ? 'That save is damaged and cannot be loaded.' : 'That slot is empty.', { type: 'bad' });
    return false;
  }
  app.state = res.state;
  app.slot = slot;
  app.exploreLog = [];
  if (res.warnings?.length) toast(`Save repaired: ${res.warnings[0]}`, { type: 'gold', timeout: 4000 });
  toast(`Welcome back, ${res.state.player.name}!`, { type: 'good' });
  enterGame('town');
  return true;
}

/* ---------------- New game: choose a slot ---------------- */

export function renderNewGame() {
  const slots = listSlots();
  const root = document.createElement('div');
  $('#screen-newgame').replaceChildren(root);
  root.innerHTML = `<div class="wrap-narrow">
    <div class="screen-head"><button class="btn small ghost" data-action="back">← Back</button><h2>New Game</h2></div>
    <p class="muted">Choose a save slot for your new hero.</p>
    <div class="stack">${slots.map((s) => slotCard(s)).join('')}</div></div>`;
  delegate(root, {
    back: () => showScreen('menu'),
    pick: async (el) => {
      const slot = +el.dataset.slot;
      const info = slots.find((s) => s.slot === slot);
      if (info.status !== 'empty') {
        const ok = await confirmDialog('Overwrite save?', info.status === 'ok' ? `Slot ${slot} holds ${info.name} (level ${info.level}). Starting a new game here will erase it once you save.` : `Slot ${slot} is damaged. Start a new game there?`, { ok: 'Use this slot', danger: true });
        if (!ok) return;
      }
      creation.slot = slot;
      renderCreate();
      showScreen('create');
    },
  });
}

export function slotCard(s, actions = null) {
  const label = s.status === 'ok'
    ? `<b>${esc(s.name)}</b> <span class="muted">Lv ${s.level} ${esc(CLASSES[s.classId].name)}</span><div class="tiny muted">Saved ${new Date(s.savedAt).toLocaleString()} · played ${fmtTime(s.playTime)}</div>`
    : s.status === 'corrupt' ? '<b class="bad">Damaged save</b><div class="tiny muted">This data could not be read. You can delete it or overwrite it.</div>' : '<b class="muted">Empty slot</b>';
  return `<div class="card slot">${s.status === 'ok' ? classEmblem(s.classId) : '<div class="emblem-svg" style="display:grid;place-items:center;font-size:1.4rem">' + (s.status === 'corrupt' ? '⚠' : '＋') + '</div>'}
    <div class="slot-info"><div class="tiny muted">Slot ${s.slot}</div>${label}</div>
    <div class="slot-actions">${actions ?? `<button class="btn small primary" data-action="pick" data-slot="${s.slot}">${s.status === 'empty' ? 'Start' : 'Overwrite'}</button>`}</div></div>`;
}

/* ---------------- Character creation ---------------- */

const creation = { slot: 1, classId: 'warrior', name: '' };

export function renderCreate() {
  const root = document.createElement('div');
  $('#screen-create').replaceChildren(root);
  const c = CLASSES[creation.classId];
  const preview = createPlayer(creation.name || 'Nicko', creation.classId);
  const st = computeStats(preview);
  const abilities = knownAbilityIds(preview).map(getAbility);
  root.innerHTML = html`<div class="wrap">
    <div class="screen-head"><button class="btn small ghost" data-action="back">← Back</button><h2>Create Your Hero</h2><span class="tiny muted">Slot ${creation.slot}</span></div>
    <div class="panel">
      <label for="hero-name" class="panel-title">Name</label>
      <input id="hero-name" class="text-input" maxlength="18" autocomplete="off" placeholder="Nicko" value="${creation.name}">
      <div class="field-error" id="name-error"></div>
      <h3 class="panel-title" style="margin-top:8px">Class</h3>
      <div class="class-grid" role="radiogroup" aria-label="Class">${raw(Object.values(CLASSES).map((k) => {
        const ps = computeStats(createPlayer('x', k.id));
        return `<button class="card clickable class-card${k.id === creation.classId ? ' selected' : ''}" data-action="class" data-id="${k.id}" role="radio" aria-checked="${k.id === creation.classId}">
          ${heroSvg(k.id)}<h3 style="color:${k.color}">${k.name}</h3><div class="tiny muted">${esc(k.tagline)}</div>
          <div class="stat-mini"><span>HP</span><span>MP</span><span>ATK</span><b>${ps.maxHp}</b><b>${ps.maxMp}</b><b>${ps.atk}</b><span>DEF</span><span>SPD</span><span>CRIT</span><b>${ps.def}</b><b>${ps.spd}</b><b>${ps.crit}%</b></div></button>`;
      }).join(''))}</div>
    </div>
    <div class="panel">
      <h3 class="panel-title">Summary: ${c.name}</h3>
      <p>${c.playstyle}</p>
      <div class="grid-2">
        <div><b class="good">Strengths</b><ul class="plain ticks small">${raw(c.strengths.map((x) => `<li>${esc(x)}</li>`).join(''))}</ul></div>
        <div><b class="bad">Weaknesses</b><ul class="plain crosses small">${raw(c.weaknesses.map((x) => `<li>${esc(x)}</li>`).join(''))}</ul></div>
      </div>
      <h3 class="panel-title" style="margin-top:12px">Starting abilities</h3>
      <div class="grid-2">${raw(abilities.map((a) => `<div class="ability-chip"><div class="icon">✦</div><div><b>${esc(a.name)}</b> <span class="tiny muted">${a.mp} MP${a.cd ? ` · ${a.cd} turn cooldown` : ''}</span><div class="small muted">${esc(a.desc)}</div></div></div>`).join(''))}</div>
      <p class="small muted" style="margin-top:10px">Starting stats: ${st.maxHp} health, ${st.maxMp} mana, ${st.atk} attack, ${st.def} defence, ${st.spd} speed, ${st.crit}% critical chance. You begin with 50 gold, 3 health potions and a mana potion.</p>
      <button class="btn primary block" data-action="begin" style="margin-top:8px">Begin Adventure</button>
    </div></div>`;
  const input = root.querySelector('#hero-name');
  input.addEventListener('input', () => { creation.name = input.value; root.querySelector('#name-error').textContent = ''; });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') root.querySelector('[data-action=begin]').click(); });
  delegate(root, {
    back: () => { renderNewGame(); showScreen('newgame'); },
    class: (el) => { creation.classId = el.dataset.id; creation.name = input.value; sfx('click'); renderCreate(); },
    begin: () => {
      const name = sanitizeName(input.value);
      if (input.value.trim() && name.length < 2) { root.querySelector('#name-error').textContent = 'Use at least 2 letters or numbers.'; return; }
      const state = newGame(name || 'Nicko', creation.classId);
      app.state = state;
      app.slot = creation.slot;
      app.exploreLog = [];
      const r = saveGame(state, creation.slot);
      if (!r.ok) toast('Could not save the new game.', { type: 'bad' });
      sfx('levelup');
      enterGame('town');
      modal({
        title: `Welcome, ${state.player.name}`,
        body: `<p>Emberhollow needs a hero. Monsters crawl out of the Whispering Woods, goblins raid the roads, and something old is stirring beneath the world.</p>
          <p class="small muted">Start by exploring the <b>Whispering Woods</b>. Win fights to earn experience and gold, check your <b>Quest Journal</b> for rewards, and rest at the <b>Inn</b> when you are hurt. Every fifth level, a boss awaits in the <b>Boss Arena</b>.</p>`,
        buttons: [{ label: 'To adventure!', value: true, cls: 'primary' }],
      });
    },
  });
}
