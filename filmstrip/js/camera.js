/* Filmstrip — the record screen. Shows the camera full screen and records
   it (with sound) until you stop or it reaches the time you have left, which
   is never more than 20 minutes. */
(function (FS) {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const TYPES = ['video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];

  let screen;
  let view;
  let stream = null;
  let rec = null;
  let facing = 'user';
  let maxSec = FS.MAX;
  let onDone = null;
  let startedAt = 0;
  let timer = 0;
  let wake = null;

  const fmt = (s) => {
    s = Math.max(0, Math.floor(s));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  function msg(text) {
    const el = $('rec-msg');
    el.textContent = text || '';
    el.hidden = !text;
  }

  async function startCamera() {
    stopStream();
    msg('');
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch (e) {
      // No microphone, or it was refused? Try pictures only.
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing } });
        msg('No microphone, so this will record without sound.');
      } catch (e2) {
        msg('Camera not available. Allow camera access in your browser settings, then try again.');
        $('rec-go').disabled = true;
        return;
      }
    }
    $('rec-go').disabled = false;
    view.srcObject = stream;
    view.classList.toggle('mirror', facing === 'user');
    view.play().catch(() => {});
  }

  function stopStream() {
    if (stream) stream.getTracks().forEach((tr) => tr.stop());
    stream = null;
    view.srcObject = null;
  }

  function showTime() {
    const el = $('rec-time');
    const s = rec ? (performance.now() - startedAt) / 1000 : 0;
    el.querySelector('span').textContent = fmt(s);
    el.classList.toggle('on', !!rec);
    if (rec && s >= maxSec) stop();
  }

  async function lockScreen(on) {
    try {
      if (on && 'wakeLock' in navigator) wake = await navigator.wakeLock.request('screen');
      else if (!on && wake) {
        await wake.release();
        wake = null;
      }
    } catch (e) { /* not available, fine */ }
  }

  function start() {
    if (!stream || rec) return;
    const type = TYPES.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
    const chunks = [];
    try {
      rec = new MediaRecorder(stream, type ? { mimeType: type, videoBitsPerSecond: 3500000 } : {});
    } catch (e) {
      msg("This browser can't record video.");
      return;
    }
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      const secs = (performance.now() - startedAt) / 1000;
      const blob = new Blob(chunks, { type: (rec.mimeType || type || 'video/webm').split(';')[0] });
      rec = null;
      clearInterval(timer);
      lockScreen(false);
      close();
      if (blob.size && onDone) onDone(blob, secs);
    };
    rec.start(1000);
    startedAt = performance.now();
    timer = setInterval(showTime, 250);
    lockScreen(true);
    $('rec-go').classList.add('on');
    $('rec-go').setAttribute('aria-label', 'Stop recording');
    $('rec-flip').disabled = true;
    $('rec-close').disabled = true;
    showTime();
  }

  function stop() {
    if (rec && rec.state !== 'inactive') rec.stop();
  }

  function open(limit, done) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      FS.toast('Recording needs a camera and a secure (https) page.');
      return;
    }
    maxSec = Math.min(FS.MAX, limit);
    onDone = done;
    $('rec-max').textContent = fmt(maxSec);
    $('rec-go').classList.remove('on');
    $('rec-go').setAttribute('aria-label', 'Start recording');
    $('rec-flip').disabled = false;
    $('rec-close').disabled = false;
    screen.hidden = false;
    showTime();
    startCamera();
  }

  function close() {
    stopStream();
    screen.hidden = true;
  }

  document.addEventListener('DOMContentLoaded', () => {
    screen = $('rec');
    view = $('rec-view');
    $('rec-go').addEventListener('click', () => (rec ? stop() : start()));
    $('rec-flip').addEventListener('click', () => {
      facing = facing === 'user' ? 'environment' : 'user';
      startCamera();
    });
    $('rec-close').addEventListener('click', () => { if (!rec) close(); });
  });

  FS.camera = { open, get recording() { return !!rec; } };
})(window.FS = window.FS || {});
