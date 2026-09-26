/* Riftborn — platform bridge. The game runs in two places:
   - a browser: saves and accounts go to localStorage, vibration uses
     navigator.vibrate, copy and paste use the Clipboard API;
   - an Android app shell: it exposes window.AndroidHost, which keeps them in
     the app's own storage, drives the vibration motor, reaches Android's
     clipboard, and calls RB.host.receive() with lifecycle messages (pause,
     resume, back). */
window.RB = window.RB || {};
(function (RB) {
  'use strict';

  // The save you had before accounts existed; the first account takes it.
  const LEGACY_SAVE = 'riftborn-save-v1';
  let saveKey = null;        // the logged-in account's save; none when logged out
  const handlers = {};
  let overlay = null;

  function hapticStyle(pattern) {
    if (Array.isArray(pattern)) return 'success';
    if (pattern <= 6) return 'selection';
    if (pattern <= 12) return 'light';
    if (pattern <= 30) return 'medium';
    return 'heavy';
  }

  // The clipboard, for the Copy and Paste buttons.
  async function webCopy(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) { /* try the old way */ }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }
  async function webPaste() {
    try { return (await navigator.clipboard.readText()) || ''; } catch (e) { return ''; }
  }

  function androidHost(bridge) {
    const call = (fn) => { try { return fn(); } catch (e) { return null; } };
    return {
      get: (k) => call(() => bridge.getItem(k)) || null,
      set: (k, v) => call(() => bridge.setItem(k, v)),
      remove: (k) => call(() => bridge.removeItem(k)),
      haptic: (pattern) => call(() => bridge.haptic(hapticStyle(pattern))),
      overlay: (open) => call(() => bridge.setOverlay(open)),
      copy: async (text) => call(() => { bridge.copyText(text); return true; }) || webCopy(text),
      paste: async () => call(() => bridge.pasteText()) || webPaste(),
    };
  }

  function browserHost() {
    return {
      get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
      set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* storage may be blocked */ } },
      remove: (k) => { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
      haptic: (pattern) => {
        if (!navigator.vibrate) return;
        try { navigator.vibrate(pattern); } catch (e) { /* ignore */ }
      },
      overlay: null,
      copy: webCopy,
      paste: webPaste,
    };
  }

  const kind = window.AndroidHost ? 'android' : 'browser';
  const impl = kind === 'android' ? androidHost(window.AndroidHost) : browserHost();

  RB.host = {
    kind,
    native: kind !== 'browser',
    // Small key/value storage that survives restarts (the app's own storage
    // on Android, localStorage in a browser).
    get: (k) => impl.get(k),
    set: (k, v) => impl.set(k, v),
    remove: (k) => impl.remove(k),
    LEGACY_SAVE,
    // Each account keeps its own save. Logged out there's none, so nothing
    // is written for an agent that has just logged out.
    useSave(key) { saveKey = key; },
    loadSave: () => (saveKey ? impl.get(saveKey) : null),
    writeSave: (json) => { if (saveKey) impl.set(saveKey, json); },
    clearSave: () => { if (saveKey) impl.remove(saveKey); },
    haptic: (pattern) => impl.haptic(pattern),
    // Resolve to true once copied / to the copied text ('' if not allowed).
    copy: (text) => impl.copy(text),
    paste: () => impl.paste(),

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
