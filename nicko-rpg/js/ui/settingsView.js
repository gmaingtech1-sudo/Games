// Settings screen. Changes apply immediately and are stored locally.

import { app } from './app.js';
import { $, delegate, showScreen, toast } from './dom.js';
import { saveSettings, DEFAULT_SETTINGS } from '../settings.js';
import { configureAudio, sfx, unlockAudio } from '../audio.js';
import { renderMenu } from './menuView.js';

export function applySettings() {
  const s = app.settings;
  document.documentElement.style.setProperty('--ui-scale', s.uiScale);
  const b = document.body.classList;
  b.remove('anim-off', 'anim-low', 'anim-normal', 'anim-high');
  b.add(`anim-${s.animation}`);
  b.toggle('reduced-motion', s.reducedMotion);
  configureAudio(s);
}

export function renderSettings() {
  const s = app.settings;
  const root = document.createElement('div');
  $('#screen-settings').replaceChildren(root);
  const range = (id, label, val, min, max, step, desc = '') => `<div class="setting"><label for="set-${id}">${label}</label><span class="row" style="gap:8px"><input type="range" id="set-${id}" data-key="${id}" min="${min}" max="${max}" step="${step}" value="${val}"><span class="tiny muted" style="width:3em">${id === 'uiScale' ? Math.round(val * 100) + '%' : Math.round(val * 100)}</span></span>${desc ? `<div class="desc">${desc}</div>` : ''}</div>`;
  const toggle = (id, label, val, desc = '') => `<div class="setting"><label for="set-${id}">${label}</label><span class="switch"><input type="checkbox" id="set-${id}" data-key="${id}" ${val ? 'checked' : ''}><span class="track"></span></span>${desc ? `<div class="desc">${desc}</div>` : ''}</div>`;
  const select = (id, label, val, opts, desc = '') => `<div class="setting"><label for="set-${id}">${label}</label><select class="select" id="set-${id}" data-key="${id}">${opts.map(([v, l]) => `<option value="${v}" ${v === val ? 'selected' : ''}>${l}</option>`).join('')}</select>${desc ? `<div class="desc">${desc}</div>` : ''}</div>`;
  root.innerHTML = `<div class="wrap-narrow">
    <div class="screen-head"><button class="btn small ghost" data-action="back">← Back</button><h2>Settings</h2></div>
    <div class="panel"><h3 class="panel-title">Audio</h3>
      ${toggle('muted', 'Mute all sound', s.muted)}
      ${range('musicVolume', 'Music volume', s.musicVolume, 0, 1, 0.05)}
      ${range('sfxVolume', 'Sound effects volume', s.sfxVolume, 0, 1, 0.05)}
    </div>
    <div class="panel"><h3 class="panel-title">Display</h3>
      ${select('animation', 'Animation intensity', s.animation, [['off', 'Off'], ['low', 'Low'], ['normal', 'Normal'], ['high', 'High']])}
      ${toggle('reducedMotion', 'Reduced motion', s.reducedMotion, 'Removes shaking, floating and screen transitions.')}
      ${toggle('combatText', 'Floating combat numbers', s.combatText)}
      ${select('combatSpeed', 'Combat speed', s.combatSpeed, [['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast']])}
      ${range('uiScale', 'Interface scale', s.uiScale, 0.85, 1.3, 0.05)}
    </div>
    <div class="panel"><h3 class="panel-title">Game</h3>
      ${toggle('autosave', 'Autosave', s.autosave, 'Saves automatically after fights, purchases and quest rewards.')}
      ${toggle('devTools', 'Developer tools', s.devTools, 'Shows the Enemy Creator. Test fights never affect your progress.')}
      <div class="row" style="margin-top:10px"><button class="btn small ghost" data-action="reset">Restore defaults</button><button class="btn small" data-action="test">Test sound</button></div>
    </div></div>`;
  root.addEventListener('input', (e) => {
    const el = e.target.closest('[data-key]');
    if (!el) return;
    const k = el.dataset.key;
    s[k] = el.type === 'checkbox' ? el.checked : el.type === 'range' ? Number(el.value) : el.value;
    if (el.type === 'range') el.nextElementSibling.textContent = k === 'uiScale' ? Math.round(s[k] * 100) + '%' : Math.round(s[k] * 100);
    saveSettings(s);
    unlockAudio();
    applySettings();
  });
  root.addEventListener('change', (e) => { if (e.target.matches('select,input[type=checkbox]')) root.dispatchEvent(new Event('input', { bubbles: true })); });
  delegate(root, {
    back: () => {
      if (app.returnTo === 'game' && app.state) import('./gameView.js').then((m) => m.enterGame(app.tab));
      else { renderMenu(); showScreen('menu'); }
    },
    reset: () => { Object.assign(s, DEFAULT_SETTINGS); saveSettings(s); applySettings(); renderSettings(); toast('Settings restored.'); },
    test: () => { unlockAudio(); sfx('levelup'); },
  });
}
