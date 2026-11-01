// Save and Load screen: manual save, load, delete (with confirmation).

import { app } from './app.js';
import { $, delegate, showScreen, toast, confirmDialog } from './dom.js';
import { listSlots, saveGame, deleteSave } from '../saveSystem.js';
import { slotCard, startFromSlot, renderMenu } from './menuView.js';
import { sfx } from '../audio.js';

export function renderSaves() {
  const slots = listSlots();
  const inGame = !!app.state;
  const root = document.createElement('div');
  $('#screen-saves').replaceChildren(root);
  root.innerHTML = `<div class="wrap-narrow">
    <div class="screen-head"><button class="btn small ghost" data-action="back">← Back</button><h2>Save &amp; Load</h2></div>
    ${inGame ? `<div class="panel"><p class="small">Current hero: <b>${escapeName(app.state.player.name)}</b> in slot ${app.slot}. ${app.settings.autosave ? 'Autosave is on.' : 'Autosave is off.'}</p>
      <button class="btn primary" data-action="save" data-slot="${app.slot}">💾 Save now (slot ${app.slot})</button></div>` : ''}
    <div class="stack" style="margin-top:14px">${slots.map((s) => slotCard(s, actions(s, inGame))).join('')}</div>
    <p class="tiny muted" style="margin-top:12px">Saves are stored in this browser's local storage. Clearing site data deletes them.</p></div>`;
  delegate(root, {
    back: () => back(),
    save: async (el) => {
      const slot = +el.dataset.slot;
      const info = slots.find((s) => s.slot === slot);
      if (slot !== app.slot && info.status === 'ok' && !(await confirmDialog('Overwrite save?', `Replace ${info.name} (level ${info.level}) in slot ${slot}?`, { ok: 'Overwrite', danger: true }))) return;
      const r = saveGame(app.state, slot);
      if (r.ok) { app.slot = slot; sfx('buy'); toast(r.persisted ? `Saved to slot ${slot}.` : 'Saved for this session only (storage is unavailable).', { type: r.persisted ? 'good' : 'gold' }); }
      else toast(r.reason, { type: 'bad' });
      renderSaves();
    },
    load: async (el) => {
      const slot = +el.dataset.slot;
      if (app.state && !(await confirmDialog('Load game?', 'Any unsaved progress on your current hero will be lost.', { ok: 'Load' }))) return;
      startFromSlot(slot);
    },
    del: async (el) => {
      const slot = +el.dataset.slot;
      if (!(await confirmDialog('Delete save?', `Permanently delete the save in slot ${slot}? This cannot be undone.`, { ok: 'Delete', danger: true }))) return;
      deleteSave(slot);
      if (app.slot === slot && app.state) toast('Save deleted. Your current hero will be saved again next time you save.', { type: 'gold' });
      else toast(`Slot ${slot} deleted.`);
      renderSaves();
    },
  });
}

function escapeName(n) { return String(n).replace(/[&<>"']/g, ''); }

function actions(s, inGame) {
  const b = [];
  if (inGame) b.push(`<button class="btn small" data-action="save" data-slot="${s.slot}">Save here</button>`);
  if (s.status === 'ok') b.push(`<button class="btn small primary" data-action="load" data-slot="${s.slot}">Load</button>`);
  if (s.status !== 'empty') b.push(`<button class="btn small danger" data-action="del" data-slot="${s.slot}">Delete</button>`);
  return b.join('');
}

function back() {
  if (app.returnTo === 'game' && app.state) import('./gameView.js').then((m) => m.enterGame(app.tab === 'saves' ? 'town' : app.tab));
  else { renderMenu(); showScreen('menu'); }
}
