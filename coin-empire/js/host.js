/* Coin Empire — platform bridge. In a browser, saves go to localStorage and
   vibration uses navigator.vibrate. Inside the Android app, window.AndroidHost
   saves to the app's own storage and drives the vibration motor; the app calls
   CE.host.receive({t}) with 'pause', 'resume' and 'back'. */
(function () {
  'use strict';
  const SAVE_KEY = 'coin-empire-save-v1';
  const handlers = {};
  const bridge = window.AndroidHost;
  const call = (fn) => { try { return fn(); } catch (e) { return null; } };

  function style(ms) {
    if (Array.isArray(ms)) return 'success';
    if (ms <= 6) return 'selection';
    if (ms <= 12) return 'light';
    if (ms <= 30) return 'medium';
    return 'heavy';
  }

  const host = bridge ? {
    android: true,
    load: () => call(() => bridge.loadSave()) || null,
    write: (json) => call(() => bridge.writeSave(json)),
    clear: () => call(() => bridge.clearSave()),
    haptic: (ms) => call(() => bridge.haptic(style(ms))),
    overlay: (open) => call(() => bridge.setOverlay(open)),
  } : {
    android: false,
    load: () => call(() => localStorage.getItem(SAVE_KEY)),
    write: (json) => call(() => localStorage.setItem(SAVE_KEY, json)),
    clear: () => call(() => localStorage.removeItem(SAVE_KEY)),
    haptic: (ms) => { if (navigator.vibrate) call(() => navigator.vibrate(ms)); },
    overlay: () => {},
  };

  host.on = (type, fn) => { handlers[type] = fn; };
  host.receive = (msg) => { const fn = msg && handlers[msg.t]; if (fn) fn(msg); };

  if (!bridge) {
    document.addEventListener('visibilitychange', () => host.receive({ t: document.hidden ? 'pause' : 'resume' }));
    window.addEventListener('pagehide', () => host.receive({ t: 'pause' }));
  }

  window.CE = window.CE || {};
  window.CE.host = host;
})();
