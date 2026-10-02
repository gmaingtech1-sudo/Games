/* ParanormalADHDhunters — platform bridge. The game runs in two places:
   - a browser, where it uses navigator.vibrate, speechSynthesis and
     localStorage directly;
   - the Android app, which exposes window.AndroidHost: it drives the
     vibration motor, speaks spirit box answers with the phone's own
     text-to-speech, and keeps a copy of the save in the app's storage.
   The app calls window.PAH_back / PAH_pause / PAH_resume (set up in main.js). */

const bridge = typeof window !== 'undefined' ? window.AndroidHost : null;
const call = (fn, fallback = null) => { try { return fn(); } catch (e) { return fallback; } };

export const host = {
  android: !!bridge,

  vibrate(pattern) {
    if (bridge && bridge.vibrate) { call(() => bridge.vibrate(JSON.stringify(pattern))); return; }
    call(() => navigator.vibrate && navigator.vibrate(pattern));
  },

  /** Speaks with native TTS in the app. Returns false if the browser should speak instead. */
  speak(text, pitch, rate) {
    if (!bridge || !bridge.speak) return false;
    return call(() => bridge.speak(text, pitch, rate), false) !== false;
  },

  loadSave() { return bridge && bridge.loadSave ? call(() => bridge.loadSave()) : null; },

  writeSave(json) { if (bridge && bridge.writeSave) call(() => bridge.writeSave(json)); },
};
