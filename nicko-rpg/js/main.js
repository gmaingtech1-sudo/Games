// Nicko RPG entry point: wires screens, global keyboard support, autosave and
// error safety nets. Game logic lives in the other modules; this file only
// connects them to the page.

import { app, autosave } from './ui/app.js';
import { showScreen, onScreen, initTooltips, closeTopModal, modalOpen, activeScreen, toast, confirmDialog } from './ui/dom.js';
import { initGameShell, enterGame, doExplore, renderGame } from './ui/gameView.js';
import { renderMenu } from './ui/menuView.js';
import { renderSaves } from './ui/saveView.js';
import { renderSettings, applySettings } from './ui/settingsView.js';
import { renderCreator } from './ui/creatorView.js';
import { renderGameOver } from './ui/gameOverView.js';
import { combatKey, combatActive } from './ui/combatView.js';
import { tickPlayTime } from './gameState.js';
import { getDungeon } from './dungeons.js';
import { playMusic, unlockAudio, stopMusic, resumeMusic } from './audio.js';
import { openTab } from './ui/gameView.js';

// Tab renderers register themselves on import.
import './ui/heroView.js';
import './ui/inventoryView.js';
import './ui/skillView.js';
import './ui/questView.js';
import './ui/shopView.js';
import './ui/bossView.js';

function boot() {
  applySettings();
  initTooltips();
  initGameShell();

  onScreen('menu', () => playMusic('menu'));

  window.addEventListener('nicko:open', (e) => {
    const id = e.detail;
    if (id === 'saves') { renderSaves(); showScreen('saves'); }
    if (id === 'settings') { renderSettings(); showScreen('settings'); }
    if (id === 'creator') { renderCreator(); showScreen('creator'); }
  });
  window.addEventListener('nicko:menu', async () => {
    if (app.state && !(await confirmDialog('Return to main menu?', app.settings.autosave ? 'Your progress will be saved first.' : 'Autosave is off: unsaved progress will be lost.', { ok: 'Main menu' }))) return;
    autosave();
    app.state = null;
    app.slot = null;
    renderMenu();
    showScreen('menu');
  });
  window.addEventListener('nicko:gameover', () => { renderGameOver(); showScreen('gameover'); });

  // Keyboard support on desktop.
  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, select')) return;
    if (e.key === 'Escape' && modalOpen()) { closeTopModal(); return; }
    if (modalOpen()) return;
    const scr = activeScreen();
    if (scr === 'combat' && combatActive()) { if (combatKey(e)) e.preventDefault(); return; }
    if (scr === 'game' && app.state) {
      if (e.key.toLowerCase() === 'e' && app.tab === 'location') { const d = getDungeon(app.dungeonId); if (d) doExplore(d); }
    }
  });

  // Play time and autosave when the page is hidden (e.g. switching apps on Android).
  setInterval(() => {
    if (app.state && document.visibilityState === 'visible') tickPlayTime(app.state, 10);
  }, 10000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') autosave(); });
  window.addEventListener('pagehide', autosave);
  document.addEventListener('pointerdown', unlockAudio, { once: true });

  // Safety net: an unexpected error should never leave the player stuck.
  window.addEventListener('error', (e) => { console.error(e.error || e.message); });
  window.addEventListener('unhandledrejection', (e) => { console.error(e.reason); });

  // Hooks for the Android app shell (nicko-rpg-android). Harmless in a browser.
  window.nickoBack = () => {
    if (modalOpen()) { closeTopModal(); return true; }
    const scr = activeScreen();
    if (scr === 'menu') return false;
    if (scr === 'combat' || scr === 'gameover') return true; // no leaving mid-fight
    if (scr === 'game') {
      if (app.tab !== 'town') { openTab('town'); return true; }
      return false;
    }
    const back = document.querySelector(`#screen-${scr} [data-action=back]`);
    if (back) back.click();
    return true;
  };
  window.nickoPause = () => { autosave(); stopMusic(true); };
  window.nickoResume = () => { resumeMusic(); };

  renderMenu();
  showScreen('menu');
}

boot();
