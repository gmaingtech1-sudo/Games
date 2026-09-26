/* Starforge — platform bridge. The game runs in two places:
   - a browser: saves go to localStorage, vibration uses navigator.vibrate;
   - the Android app: it exposes window.AndroidHost, which saves to the app's
     own storage, drives the vibration motor and hides the system bars while
     you fly, and it calls SF.host.receive() with lifecycle messages (pause,
     resume, back). */
(function (SF) {
  'use strict';

  const SAVE_KEY = 'starforge-save-v1';
  const handlers = {};
  let overlay = null;

  // Map the game's vibration lengths (ms) onto native haptic styles.
  function hapticStyle(pattern) {
    if (Array.isArray(pattern)) return 'heavy';
    if (pattern <= 12) return 'selection';
    if (pattern <= 20) return 'light';
    if (pattern <= 50) return 'medium';
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
      immersive: (on) => call(() => bridge.setImmersive(on)),
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
      immersive: null,
    };
  }

  const kind = window.AndroidHost ? 'android' : 'browser';
  const impl = kind === 'android' ? androidHost(window.AndroidHost) : browserHost();

  SF.host = {
    kind,
    native: kind !== 'browser',

    loadSave() {
      const raw = impl.load();
      if (!raw) return null;
      try { return JSON.parse(raw); } catch (e) { return null; }
    },
    writeSave: (data) => impl.write(JSON.stringify(data)),
    clearSave: () => impl.clear(),
    haptic: (pattern) => impl.haptic(pattern),

    // Tells the app whether the back button belongs to the game right now
    // (flying, or a sheet is open) or should leave the app.
    setOverlay(open) {
      if (!impl.overlay || open === overlay) return;
      overlay = open;
      impl.overlay(open);
    },

    // Full screen with the status and navigation bars hidden, for flying.
    setImmersive(on) {
      if (impl.immersive) impl.immersive(!!on);
    },

    on(name, fn) { handlers[name] = fn; },

    // Called from the native side with lifecycle messages.
    receive(msg) {
      const fn = msg && handlers[msg.t];
      if (fn) fn(msg);
    },
  };
})(window.SF = window.SF || {});
