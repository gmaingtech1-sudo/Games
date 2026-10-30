/* Filmstrip — platform bridge. The app runs in two places:
   - a browser: finished videos are downloaded with a link or shared with
     the share sheet, and the screen is kept on with the Wake Lock API;
   - the Android app: it exposes window.AndroidHost, which keeps the screen
     on, saves finished videos to the gallery or shares them, and calls
     FS.host.receive() with lifecycle messages (back, video-saved). */
window.FS = window.FS || {};
(function (FS) {
  'use strict';

  const bridge = window.AndroidHost || null;
  const CHUNK = 3 * 1024 * 1024; // bytes per hop over the bridge
  const handlers = {};
  let overlay = null;
  let sent = null;   // the blob the app already has a copy of
  let wake = null;

  const call = (fn) => { try { return fn(); } catch (e) { return null; } };

  function base64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).slice(String(r.result).indexOf(',') + 1));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  }

  // Copy a finished video over to the app, a few MB at a time (the bridge
  // only carries strings, and a video can be over a gigabyte).
  async function handOver(blob, name, onProgress) {
    if (sent === blob) return true;
    sent = null;
    if (!call(() => bridge.beginVideo(name, blob.type || 'video/mp4'))) return false;
    for (let off = 0; off < blob.size; off += CHUNK) {
      const part = await base64(blob.slice(off, off + CHUNK));
      if (!call(() => bridge.appendVideo(part))) return false;
      if (onProgress) onProgress(Math.min(1, (off + CHUNK) / blob.size));
    }
    if (!call(() => bridge.endVideo())) return false;
    sent = blob;
    return true;
  }

  FS.host = {
    native: !!bridge,

    async keepAwake(on) {
      if (bridge) return call(() => bridge.keepAwake(on));
      try {
        if (on && 'wakeLock' in navigator) wake = await navigator.wakeLock.request('screen');
        else if (!on && wake) {
          await wake.release();
          wake = null;
        }
      } catch (e) { /* not available, fine */ }
    },

    // Tells the app whether a sheet or the camera is up, so Android's back
    // button closes it instead of leaving the app.
    setOverlay(open) {
      if (!bridge || open === overlay) return;
      overlay = open;
      call(() => bridge.setOverlay(open));
    },

    // Android app only. Each resolves to true when it worked.
    async saveVideo(blob, name, onProgress) {
      if (!(await handOver(blob, name, onProgress))) return false;
      return new Promise((resolve) => {
        handlers['video-saved'] = (msg) => resolve(!!msg.ok);
        if (!call(() => bridge.saveVideo())) resolve(false);
      });
    },

    async shareVideo(blob, name, onProgress) {
      if (!(await handOver(blob, name, onProgress))) return false;
      return call(() => bridge.shareVideo()) === true;
    },

    on(name, fn) { handlers[name] = fn; },

    // Called from the native side.
    receive(msg) {
      const fn = msg && handlers[msg.t];
      if (fn) fn(msg);
    },
  };
})(window.FS);
