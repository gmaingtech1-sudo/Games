/* Pet Cam — platform bridge. The game runs in two places:
   - a browser: saves go to localStorage, vibration uses navigator.vibrate,
     photos are saved with a download link or the share sheet;
   - the Android app: it exposes window.AndroidHost, which saves to the app's
     own storage, drives the vibration motor, puts photos in the gallery or
     shares them, and calls PC.host.receive() with lifecycle messages
     (pause, resume, back). */
window.PC = window.PC || {};
(function (PC) {
  'use strict';

  const SAVE_KEY = 'pet-cam-save-v1';
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
      // Photos arrive as a base64 JPEG (no "data:" prefix).
      // Saving may first ask for storage access, so the result comes back
      // later as a { t: 'photo-saved', ok } message.
      savePhoto: (b64, name) => { call(() => bridge.savePhoto(b64, name)); return true; },
      sharePhoto: (b64, name) => call(() => bridge.sharePhoto(b64, name)) === true,
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
      savePhoto: null,
      sharePhoto: null,
    };
  }

  const kind = window.AndroidHost ? 'android' : 'browser';
  const impl = kind === 'android' ? androidHost(window.AndroidHost) : browserHost();

  PC.host = {
    kind,
    native: kind !== 'browser',

    loadSave: () => impl.load(),
    writeSave: (json) => impl.write(json),
    clearSave: () => impl.clear(),
    haptic: (pattern) => impl.haptic(pattern),

    // Native photo handling, when there is one. Each returns true on success.
    canSavePhoto: !!impl.savePhoto,
    savePhoto: (b64, name) => !!impl.savePhoto && impl.savePhoto(b64, name),
    sharePhoto: (b64, name) => !!impl.sharePhoto && impl.sharePhoto(b64, name),

    // Tells the app whether a sheet or the ball is up, so Android's back
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
})(window.PC);
