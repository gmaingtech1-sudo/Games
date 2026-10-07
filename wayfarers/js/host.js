/* Wayfarers — platform bridge. The game runs in two places:
   - a browser: saves go to localStorage, and there's no vibration motor or
     reminder to drive;
   - the Android app: it exposes window.AndroidHost, which saves to the app's
     own storage, drives the vibration motor, and schedules "your AFK chest is
     full" as a real OS alarm that still fires after the app is closed. It
     calls WF.host.receive() with lifecycle messages (pause, resume, back,
     notifyPermission). */
(function (WF) {
  'use strict';

  const SAVE_KEY = 'wayfarers-save-v1';
  const handlers = {};
  const bridge = window.AndroidHost || null;
  const call = (fn, fallback) => { try { return fn(); } catch (e) { return fallback; } };
  let overlay = null;

  // Something with getItem / setItem / removeItem, like localStorage, so
  // state.js doesn't need to know where the save lives.
  function storage() {
    if (bridge) {
      return {
        getItem: () => call(() => bridge.loadSave(), null) || null,
        setItem: (k, json) => call(() => bridge.writeSave(json)),
        removeItem: () => call(() => bridge.clearSave()),
      };
    }
    return call(() => window.localStorage, null);
  }

  // Sounds that also deserve a tap on the hand, and how strong.
  const HAPTIC = {
    level: 'selection',
    buy: 'light',
    tap: 'selection',
    coin: null,
    win: null,
    boss: 'medium',
    lose: 'heavy',
    summon: 'medium',
    legendary: 'success',
    error: 'light',
    claim: 'success',
  };

  WF.host = {
    kind: bridge ? 'android' : 'browser',
    native: !!bridge,
    storage: storage(),
    key: SAVE_KEY,

    haptic(name) {
      const style = HAPTIC[name];
      if (bridge && style) call(() => bridge.haptic(style));
    },

    // Tells the app whether a sheet is open, so Android's back button closes
    // it instead of leaving the app.
    setOverlay(open) {
      if (!bridge || open === overlay) return;
      overlay = open;
      call(() => bridge.setOverlay(open));
    },

    // A reminder for while the app is closed. Only the Android app can
    // promise it'll arrive, so the browser doesn't offer it at all.
    notify: {
      supported: () => !!bridge,
      permission: () => !!bridge && call(() => bridge.notifyPermission(), false),
      // Answers later with receive({t: 'notifyPermission', granted}).
      request: () => bridge && call(() => bridge.requestNotifyPermission()),
      schedule: (minutes, title, body) => bridge && call(() => bridge.scheduleNotification(title, body, minutes)),
      cancel: () => bridge && call(() => bridge.cancelNotification()),
    },

    on(name, fn) { handlers[name] = fn; },

    // Called from the native side with lifecycle messages.
    receive(msg) {
      const fn = msg && handlers[msg.t];
      if (fn) fn(msg);
    },
  };
})(window.WF = window.WF || {});
