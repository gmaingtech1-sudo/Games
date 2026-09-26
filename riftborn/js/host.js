/* Riftborn — platform bridge. The game runs in two places:
   - a browser: saves go to localStorage, vibration uses navigator.vibrate;
   - an Android app shell: it exposes window.AndroidHost, which saves to the
     app's own storage, drives the vibration motor, and calls
     RB.host.receive() with lifecycle messages (pause, resume, back). */
window.RB = window.RB || {};
(function (RB) {
  'use strict';

  const SAVE_KEY = 'riftborn-save-v1';
  const handlers = {};
  let overlay = null;

  function hapticStyle(pattern) {
    if (Array.isArray(pattern)) return 'success';
    if (pattern <= 6) return 'selection';
    if (pattern <= 12) return 'light';
    if (pattern <= 30) return 'medium';
    return 'heavy';
  }

  function androidHost(bridge) {
    const call = (fn) => { try { return fn(); } catch (e) { return null; } };
    return {
      load: () => call(() => bridge.loadSave()) || null,
      write: (json) => call(() => bridge.writeSave(json)),
      clear: () => call(() => bridge.clearSave()),
      haptic: (pattern) => call(() => bridge.haptic(hapticStyle(pattern))),
      overlay: (open) => call(() => bridge.setOverlay(open)),
    };
  }

  function browserHost() {
    return {
      load: () => { try { return localStorage.getItem(SAVE_KEY); } catch (e) { return null; } },
      write: (json) => { try { localStorage.setItem(SAVE_KEY, json); } catch (e) { /* storage may be blocked */ } },
      clear: () => { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } },
      haptic: (pattern) => {
        if (!navigator.vibrate) return;
        try { navigator.vibrate(pattern); } catch (e) { /* ignore */ }
      },
      overlay: null,
    };
  }

  const kind = window.AndroidHost ? 'android' : 'browser';
  const impl = kind === 'android' ? androidHost(window.AndroidHost) : browserHost();

  RB.host = {
    kind,
    native: kind !== 'browser',
    loadSave: () => impl.load(),
    writeSave: (json) => impl.write(json),
    clearSave: () => impl.clear(),
    haptic: (pattern) => impl.haptic(pattern),

    // Tells the app whether a sheet is up, so Android's back button closes
    // it instead of leaving the app.
    setOverlay(open) {
      if (!impl.overlay || open === overlay) return;
      overlay = open;
      impl.overlay(open);
    },

    on(name, fn) { handlers[name] = fn; },
    receive(msg) {
      const fn = msg && handlers[msg.t];
      if (fn) fn(msg);
    },
  };
})(window.RB);
