// BODY.OS — platform bridge. In the Android app, window.AndroidHost stores saves
// in the app's private storage and drives the vibration motor; the activity calls
// BOS.host.receive({t}) with pause / resume / back. In a browser we use localStorage.
const handlers = {};

function android(b) {
  const call = (fn) => { try { return fn(); } catch (e) { return null; } };
  return {
    load: (key) => call(() => b.loadSave(key)) || null,
    write: (key, json) => call(() => b.writeSave(key, json)),
    clear: (key) => call(() => b.clearSave(key)),
    haptic: (style) => call(() => b.haptic(style)),
    overlay: (open) => call(() => b.setOverlay(open)),
    quit: () => call(() => b.quit()),
  };
}

function browser() {
  return {
    load: (key) => { try { return localStorage.getItem(key); } catch (e) { return null; } },
    write: (key, json) => { try { localStorage.setItem(key, json); } catch (e) { /* storage may be blocked */ } },
    clear: (key) => { try { localStorage.removeItem(key); } catch (e) { /* ignore */ } },
    haptic: (style) => {
      if (!navigator.vibrate) return;
      try { navigator.vibrate(style === 'heavy' ? 40 : style === 'success' ? [18, 60, 18] : 12); } catch (e) { /* ignore */ }
    },
    overlay: () => {},
    quit: () => {},
  };
}

const impl = window.AndroidHost ? android(window.AndroidHost) : browser();

export const host = {
  kind: window.AndroidHost ? 'android' : 'browser',
  load: impl.load,
  write: impl.write,
  clear: impl.clear,
  haptic: impl.haptic,
  /** Tell the Android activity whether Back should go to the game (a menu is open / in game). */
  overlay: impl.overlay,
  quit: impl.quit,
  on(type, fn) { handlers[type] = fn; },
  receive(msg) { const fn = msg && handlers[msg.t]; if (fn) fn(msg); },
};

window.BOS = window.BOS || {};
window.BOS.host = host;
