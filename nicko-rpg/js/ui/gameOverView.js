// Game Over screen: revive in town, reload the last save, or quit.

import { app, autosave } from './app.js';
import { $, delegate, showScreen, toast } from './dom.js';
import { revive } from '../gameState.js';
import { playMusic, stopMusic } from '../audio.js';
import { startFromSlot, renderMenu } from './menuView.js';
import { enterGame } from './gameView.js';
import { fmt } from '../utils.js';

export function renderGameOver() {
  const p = app.state.player;
  const root = document.createElement('div');
  $('#screen-gameover').replaceChildren(root);
  stopMusic();
  root.innerHTML = `<div class="gameover panel">
    <h1>You Have Fallen</h1>
    <p>${p.name.replace(/[<>&]/g, '')} collapses as the world fades to black...</p>
    <p class="small muted">Revive in Emberhollow with half health. The temple keeps 10% of your gold (${fmt(Math.floor(p.gold * 0.1))}) as an offering.</p>
    <div class="menu-buttons" style="margin:16px auto 0">
      <button class="btn primary" data-action="revive">Revive in Town</button>
      <button class="btn" data-action="load">Load Last Save</button>
      <button class="btn ghost" data-action="menu">Main Menu</button>
    </div></div>`;
  delegate(root, {
    revive: () => {
      const r = revive(app.state);
      toast(`You wake at the temple. ${r.lost} gold offered.`, { type: 'gold' });
      autosave();
      enterGame('town');
    },
    load: () => { if (!startFromSlot(app.slot)) { renderMenu(); showScreen('menu'); } },
    menu: () => { renderMenu(); showScreen('menu'); playMusic('menu'); },
  });
}
