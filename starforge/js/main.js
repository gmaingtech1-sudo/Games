/* Starforge — app controller: switching between the hangar and flight,
   settings, the name editor, toasts and the main loop. */
(function (SF) {
  'use strict';

  const A = SF.audio;
  const prof = SF.profile;
  const $ = (id) => document.getElementById(id);

  const els = {
    flight: $('flight'), launch: $('btn-launch'), settingsBtn: $('btn-settings'),
    scrim: $('scrim'), settings: $('sheet-settings'), nameSheet: $('sheet-name'),
    nameInput: $('name-input'), nameForm: $('name-form'), nameCancel: $('name-cancel'),
    toast: $('toast'), pauseBtn: $('btn-pause'), resume: $('btn-resume'), quit: $('btn-quit'),
    again: $('btn-again'), home: $('btn-home'), sens: $('set-sens'), sensVal: $('set-sens-val'),
    reset: $('btn-reset'), closeSettings: $('settings-close'),
  };
  const TOGGLES = ['sound', 'music', 'vibe', 'shake'];

  let screen = 'hangar';
  let sheet = null;
  let toastTimer = 0;
  let resetArmed = 0;

  /* ---------- Settings ---------- */

  function applySettings() {
    const s = prof.data.settings;
    A.setSound(s.sound);
    A.setMusic(s.music);
    for (const k of TOGGLES) for (const el of document.querySelectorAll(`[data-setting="${k}"]`)) el.checked = !!s[k];
    els.sens.value = s.sens;
    els.sensVal.textContent = s.sens.toFixed(1) + '×';
  }

  document.addEventListener('change', (e) => {
    const k = e.target.dataset && e.target.dataset.setting;
    if (!k) return;
    prof.data.settings[k] = e.target.checked;
    prof.save();
    applySettings();
    A.play('click');
  });

  els.sens.addEventListener('input', () => {
    prof.data.settings.sens = Number(els.sens.value);
    els.sensVal.textContent = prof.data.settings.sens.toFixed(1) + '×';
  });
  els.sens.addEventListener('change', () => prof.save());

  els.reset.addEventListener('click', () => {
    const now = Date.now();
    if (now - resetArmed > 3000) {
      resetArmed = now;
      els.reset.textContent = 'Tap again to erase everything';
      A.play('deny');
      return;
    }
    resetArmed = 0;
    prof.reset();
    els.reset.textContent = 'Reset progress';
    closeSheet();
    SF.hangar.refresh();
    toast('Progress reset. Fresh ship, fresh start.');
  });

  /* ---------- Sheets ---------- */

  // In the Android app, the back button is the game's while you're flying
  // or a sheet is open; otherwise it leaves the app.
  function syncOverlay() {
    SF.host.setOverlay(!!sheet || screen === 'flight');
  }

  function openSheet(el) {
    closeSheet();
    sheet = el;
    els.scrim.hidden = false;
    el.hidden = false;
    syncOverlay();
  }

  function closeSheet() {
    if (!sheet) return;
    sheet.hidden = true;
    sheet = null;
    els.scrim.hidden = true;
    els.reset.textContent = 'Reset progress';
    resetArmed = 0;
    syncOverlay();
  }

  els.settingsBtn.addEventListener('click', () => {
    A.play('click');
    applySettings();
    openSheet(els.settings);
  });
  els.closeSettings.addEventListener('click', () => {
    A.play('click');
    closeSheet();
  });
  els.scrim.addEventListener('click', closeSheet);

  function editName() {
    els.nameInput.value = prof.data.ship.name;
    openSheet(els.nameSheet);
    setTimeout(() => {
      els.nameInput.focus();
      els.nameInput.select();
    }, 50);
  }

  els.nameForm.addEventListener('submit', (e) => {
    e.preventDefault();
    prof.rename(els.nameInput.value);
    els.nameInput.blur();
    closeSheet();
    A.play('equip');
    SF.hangar.refresh();
  });
  els.nameCancel.addEventListener('click', () => {
    els.nameInput.blur();
    closeSheet();
  });

  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.hidden = false;
    els.toast.classList.remove('show');
    void els.toast.offsetWidth;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { els.toast.hidden = true; }, 2600);
  }

  /* ---------- Screens ---------- */

  function launch() {
    A.unlock();
    A.play('launch');
    closeSheet();
    SF.hangar.hide();
    els.flight.hidden = false;
    screen = 'flight';
    syncOverlay();
    SF.host.setImmersive(true);
    SF.game.start();
  }

  function toHangar() {
    SF.game.stop();
    els.flight.hidden = true;
    screen = 'hangar';
    syncOverlay();
    SF.host.setImmersive(false);
    SF.hangar.show();
    A.music('hangar');
  }

  els.launch.addEventListener('click', launch);
  els.pauseBtn.addEventListener('click', () => {
    A.play('click');
    SF.game.pause();
  });
  els.resume.addEventListener('click', () => {
    A.play('click');
    SF.game.resume();
  });
  els.quit.addEventListener('click', () => {
    A.play('click');
    SF.game.finish(true);
  });
  els.again.addEventListener('click', () => {
    A.play('launch');
    SF.game.start();
  });
  els.home.addEventListener('click', () => {
    A.play('click');
    toHangar();
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sheet) closeSheet();
    else if (e.key === 'Enter' && screen === 'hangar' && !sheet && document.activeElement === document.body) launch();
  });

  document.addEventListener('pointerdown', () => A.unlock(), { capture: true });

  // Switching away pauses the flight and silences the sound.
  function goneAway() {
    if (screen === 'flight' && SF.game.running) SF.game.pause();
    A.suspend(true);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) goneAway();
    else A.suspend(false);
  });

  // The Android back button: close a sheet, pause or resume the flight, or
  // leave the summary for the hangar.
  function back() {
    if (sheet) {
      A.play('click');
      closeSheet();
    } else if (screen === 'flight') {
      const G = SF.game.G;
      if (G.state === 'over') toHangar();
      else if (G.paused) SF.game.resume();
      else SF.game.pause();
    }
  }

  SF.host.on('back', back);
  SF.host.on('pause', goneAway);
  SF.host.on('resume', () => A.suspend(false));

  window.addEventListener('resize', () => {
    if (screen === 'flight') SF.game.resize();
  });

  /* ---------- Loop ---------- */

  let last = 0;
  function loop(now) {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    try {
      if (screen === 'flight') SF.game.frame(dt);
      else SF.hangar.frame(dt);
    } catch (err) {
      console.error(err);
    }
    requestAnimationFrame(loop);
  }

  function registerSW() {
    if (SF.host.native || !('serviceWorker' in navigator) || window.top !== window) return;
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is optional */ });
  }

  SF.ui = { toast, editName };

  applySettings();
  syncOverlay();
  SF.hangar.show();
  A.music('hangar');
  requestAnimationFrame(loop);
  registerSW();
})(window.SF = window.SF || {});
