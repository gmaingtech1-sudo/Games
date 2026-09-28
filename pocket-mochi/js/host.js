/* Pocket Mochi — platform bridge. The game runs in two places:
   - a browser: saves go to localStorage, vibration uses navigator.vibrate,
     and a reminder is a setTimeout that only fires while this page survives;
   - the Android app: it exposes window.AndroidHost, which saves to the app's
     own storage, drives the vibration motor, and schedules a reminder as a
     real OS alarm that still fires after the app is closed. It calls
     PM.host.receive() with lifecycle messages (pause, resume, back,
     notifyPermission). */
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

  /* ---------------- reminders: "Mochi is hungry", sent while you're away ---------------- */

  // Android schedules a real OS alarm, so it fires even if the app was
  // closed. A browser tab can only set a timer that runs while the page (or
  // installed PWA) is still alive in the background — a smaller promise, but
  // still worth keeping for anyone who hasn't installed the Android app.
  function androidNotify(bridge) {
    const call = (fn) => { try { return fn(); } catch (e) { return null; } };
    return {
      supported: () => true,
      permission: () => call(() => bridge.notifyPermission()) || 'default',
      // Android answers this later via PM.host.receive({t:'notifyPermission', granted}),
      // since showing the system prompt isn't something a return value can carry.
      request: () => { call(() => bridge.requestNotifyPermission()); },
      schedule: (minutes, title, body) => call(() => bridge.scheduleNotification(title, body, minutes)),
      cancel: () => call(() => bridge.cancelNotification()),
    };
  }

  function browserNotify() {
    const supported = () => typeof window.Notification === 'function';
    let timer = null;
    return {
      supported,
      permission: () => (supported() ? window.Notification.permission : 'unsupported'),
      // Returns a promise of 'granted' | 'denied' | 'default', unlike Android's request().
      request: () => (supported() ? window.Notification.requestPermission() : Promise.resolve('unsupported')),
      schedule(minutes, title, body) {
        this.cancel();
        if (!supported() || window.Notification.permission !== 'granted') return;
        timer = setTimeout(() => {
          timer = null;
          try { new window.Notification(title, { body, icon: 'icons/icon-192.png', tag: 'pocket-mochi-need' }); } catch (e) { /* ignore */ }
        }, Math.max(0, minutes) * 60000);
      },
      cancel() {
        if (timer) { clearTimeout(timer); timer = null; }
      },
    };
  }

  const kind = window.AndroidHost ? 'android' : 'browser';
  const impl = kind === 'android' ? androidHost(window.AndroidHost) : browserHost();
  const notifyImpl = kind === 'android' ? androidNotify(window.AndroidHost) : browserNotify();

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

    // A reminder for while the app is closed, e.g. "Mochi is hungry".
    notify: notifyImpl,

    on(name, fn) { handlers[name] = fn; },

    // Called from the native side with lifecycle messages.
    receive(msg) {
      const fn = msg && handlers[msg.t];
      if (fn) fn(msg);
    },
  };
})(window.PM = window.PM || {});
