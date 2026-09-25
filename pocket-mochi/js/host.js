/* Pocket Mochi — platform bridge.
   In a browser, saves go to localStorage and vibration uses navigator.vibrate.
   Inside the Expo app (a React Native WebView), the native side injects
   window.__PM_NATIVE__ before this script runs; saves and haptics are then
   posted to it, and it sends back lifecycle messages (pause, resume, back). */
(function (PM) {
  'use strict';

  const SAVE_KEY = 'pocket-mochi-save-v1';
  const boot = window.__PM_NATIVE__ || null;
  const native = !!boot;
  const handlers = {};
  let overlay = null;

  function post(msg) {
    try {
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(msg));
    } catch (e) { /* host went away */ }
  }

  // Map the game's vibration lengths (ms) onto native haptic styles.
  function hapticStyle(pattern) {
    if (Array.isArray(pattern)) return 'success';
    if (pattern <= 6) return 'selection';
    if (pattern <= 12) return 'light';
    if (pattern <= 30) return 'medium';
    return 'heavy';
  }

  PM.host = {
    native,

    loadSave() {
      if (native) return boot.save || null;
      try { return localStorage.getItem(SAVE_KEY); } catch (e) { return null; }
    },

    writeSave(json) {
      if (native) { post({ t: 'save', data: json }); return; }
      try { localStorage.setItem(SAVE_KEY, json); } catch (e) { /* storage may be blocked */ }
    },

    clearSave() {
      if (native) { boot.save = null; post({ t: 'wipe' }); return; }
      try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
    },

    haptic(pattern) {
      if (native) { post({ t: 'haptic', style: hapticStyle(pattern) }); return; }
      if (!navigator.vibrate) return;
      try { navigator.vibrate(pattern); } catch (e) { /* ignore */ }
    },

    // Tells the app whether a sheet, tray or mode is open, so Android's back
    // button closes it instead of leaving the app.
    setOverlay(open) {
      if (!native || open === overlay) return;
      overlay = open;
      post({ t: 'overlay', open });
    },

    on(name, fn) { handlers[name] = fn; },

    // Called from the native side via injectJavaScript.
    receive(msg) {
      const fn = msg && handlers[msg.t];
      if (fn) fn(msg);
    },
  };
})(window.PM = window.PM || {});
