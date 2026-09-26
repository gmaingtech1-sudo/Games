/* Pocket Mochi — platform bridge. The game runs in three places:
   - a browser: saves go to localStorage, vibration uses navigator.vibrate;
   - the Expo app (a React Native WebView): the app injects window.__PM_NATIVE__
     before this script runs, and saves/haptics are posted to it as messages;
   - the Android app: it exposes window.AndroidHost, which saves to the app's
     own storage and drives the vibration motor.
   Both apps call PM.host.receive() with lifecycle messages (pause, resume, back). */
(function (PM) {
  'use strict';

  const SAVE_KEY = 'pocket-mochi-save-v1';
  const handlers = {};
  let overlay = null;

  // Map the game's vibration lengths (ms) onto native haptic styles.
  function hapticStyle(pattern) {
    if (Array.isArray(pattern)) return 'success';
    if (pattern <= 6) return 'selection';
    if (pattern <= 12) return 'light';
    if (pattern <= 30) return 'medium';
    return 'heavy';
  }

  function expoHost(boot) {
    const post = (msg) => {
      try {
        if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(msg));
      } catch (e) { /* host went away */ }
    };
    return {
      load: () => boot.save || null,
      write: (json) => post({ t: 'save', data: json }),
      clear: () => { boot.save = null; post({ t: 'wipe' }); },
      haptic: (pattern) => post({ t: 'haptic', style: hapticStyle(pattern) }),
      overlay: (open) => post({ t: 'overlay', open }),
    };
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

  const kind = window.__PM_NATIVE__ ? 'expo' : window.AndroidHost ? 'android' : 'browser';
  const impl = kind === 'expo' ? expoHost(window.__PM_NATIVE__)
    : kind === 'android' ? androidHost(window.AndroidHost)
    : browserHost();

  PM.host = {
    kind,
    native: kind !== 'browser',

    loadSave: () => impl.load(),
    writeSave: (json) => impl.write(json),
    clearSave: () => impl.clear(),
    haptic: (pattern) => impl.haptic(pattern),

    // Tells the app whether a sheet, tray or mode is open, so Android's back
    // button closes it instead of leaving the app.
    setOverlay(open) {
      if (!impl.overlay || open === overlay) return;
      overlay = open;
      impl.overlay(open);
    },

    on(name, fn) { handlers[name] = fn; },

    // Called from the native side with lifecycle messages.
    receive(msg) {
      const fn = msg && handlers[msg.t];
      if (fn) fn(msg);
    },
  };
})(window.PM = window.PM || {});
