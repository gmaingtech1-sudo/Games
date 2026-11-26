/* Emberdeep — platform bridge. The game runs in two places:
   - a browser: saves go to localStorage, vibration uses navigator.vibrate,
     and there are no reminders (a web page can't wake itself up hours later);
   - the Android app: it exposes window.AndroidHost, which saves to the app's
     own storage, drives the vibration motor, and schedules a real OS alarm
     for when your party makes camp, so the notification arrives even after
     the app is closed. It calls ED.host.receive() with lifecycle messages
     (pause, resume, back, notifyPermission). */
(function (ED) {
  'use strict';

  const SAVE_KEY = 'emberdeep-save-v1';
  const handlers = {};
  let overlay = null;

  // Map the game's vibration lengths (ms) onto native haptic styles.
  function hapticStyle(pattern) {
    if (Array.isArray(pattern)) return 'success';
    if (pattern <= 8) return 'selection';
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
      notify: {
        supported: () => true,
        permission: () => (call(() => bridge.notifyPermission()) ? 'granted' : 'default'),
        // Android answers later with ED.host.receive({t:'notifyPermission', granted}).
        request: () => { call(() => bridge.requestNotifyPermission()); },
        schedule: (minutes, title, body) => call(() => bridge.scheduleNotification(title, body, minutes)),
        cancel: () => call(() => bridge.cancelNotification()),
      },
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
      notify: {
        supported: () => false,
        permission: () => 'unsupported',
        request: () => {},
        schedule: () => {},
        cancel: () => {},
      },
    };
  }

  const kind = window.AndroidHost ? 'android' : 'browser';
  const impl = kind === 'android' ? androidHost(window.AndroidHost) : browserHost();

  ED.host = {
    kind,
    native: kind !== 'browser',
    SAVE_KEY,

    loadSave() {
      const raw = impl.load();
      // The app's own storage is empty on its first run: look for a save the
      // WebView's localStorage may already hold.
      if (!raw && kind !== 'browser') {
        try { return localStorage.getItem(SAVE_KEY); } catch (e) { return null; }
      }
      return raw;
    },
    writeSave: (json) => impl.write(json),
    clearSave: () => {
      impl.clear();
      try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
    },
    haptic: (pattern) => impl.haptic(pattern),

    // Tells the app whether a card or the settings are open, so Android's
    // back button closes them instead of leaving the app.
    setOverlay(open) {
      if (!impl.overlay || open === overlay) return;
      overlay = open;
      impl.overlay(open);
    },

    notify: impl.notify,

    on(name, fn) { handlers[name] = fn; },

    // Called from the native side with lifecycle messages.
    receive(msg) {
      const fn = msg && handlers[msg.t];
      if (fn) fn(msg);
    },
  };
})(window.ED = window.ED || {});
