/* Filmstrip — the player. Keeps the clock, loads every clip and photo into
   an element the canvas can draw, starts and stops clips as the clock moves
   through them, mixes clip sound and music with WebAudio, and records the
   canvas plus that mix into one video file when you save.

   While a clip is on screen the clip itself is the clock, so a clip that
   stalls to load holds the video instead of skipping. Photos and titles run
   on the wall clock. Saving plays the whole thing through once in real time. */
(function (FS) {
  'use strict';

  const SIZES = { '9:16': [720, 1280], '16:9': [1280, 720], '1:1': [720, 720] };
  const PREROLL = 1.5;     // seek the next clip to its start this early
  const MUSIC_FADE = 2.5;  // seconds of music fade at the very end

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  let canvas = null;
  let ctx = null;
  let pool = null;
  let project = null;
  let tl = { scenes: [], starts: [], total: 0 };

  let t = 0;
  let playing = false;
  let cur = -1;        // the scene the playing clock has entered
  let dirty = true;    // redraw even though paused
  let last = 0;
  let exporting = null;

  const imgs = new Map();  // mediaId -> <img>
  const vids = new Map();  // scene id -> { el, gain, mediaId, unlocked, failed }
  let music = null;        // { el, gain, mediaId }

  let ac = null;
  let master = null;    // everything mixes into here
  let speakers = null;  // master -> your speakers (silenced while saving)
  let recDest = null;   // master -> the recording

  const handlers = { time: [], state: [] };
  const emit = (ev, v) => handlers[ev].forEach((fn) => fn(v));

  function audio() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      ac = new AC();
      master = ac.createGain();
      speakers = ac.createGain();
      master.connect(speakers);
      speakers.connect(ac.destination);
    }
    return ac;
  }

  /* ---------- media elements ---------- */

  function makeVideo(sc) {
    const m = FS.store.media.get(sc.mediaId);
    const el = document.createElement('video');
    el.playsInline = true;
    el.setAttribute('playsinline', '');
    el.preload = 'auto';
    el.src = m ? m.url : '';
    el.addEventListener('loadeddata', () => { dirty = true; });
    el.addEventListener('seeked', () => { dirty = true; });
    pool.appendChild(el);
    audio();
    const node = ac.createMediaElementSource(el);
    const gain = ac.createGain();
    node.connect(gain);
    gain.connect(master);
    return { el, node, gain, mediaId: sc.mediaId, unlocked: false, failed: false };
  }

  function dropElement(el, node) {
    el.pause();
    el.removeAttribute('src');
    el.load();
    if (node) node.disconnect();
    el.remove();
  }

  function makeMusic(mu) {
    const m = FS.store.media.get(mu.mediaId);
    const el = document.createElement('audio');
    el.loop = true;
    el.preload = 'auto';
    el.src = m ? m.url : '';
    pool.appendChild(el);
    audio();
    const node = ac.createMediaElementSource(el);
    const gain = ac.createGain();
    node.connect(gain);
    gain.connect(master);
    return { el, node, gain, mediaId: mu.mediaId };
  }

  function srcFor(sc) {
    if (sc.type === 'photo') return imgs.get(sc.mediaId) || null;
    if (sc.type === 'video') {
      const v = vids.get(sc.id);
      return v ? v.el : null;
    }
    return null;
  }

  // Bring the elements in line with the project after any edit.
  function sync(p) {
    project = p;
    tl = FS.timeline(p);

    const usedImgs = new Set();
    const live = new Set();
    for (const sc of tl.scenes) {
      if (sc.type === 'photo') {
        usedImgs.add(sc.mediaId);
        if (!imgs.has(sc.mediaId)) {
          const m = FS.store.media.get(sc.mediaId);
          const img = new Image();
          img.decoding = 'async';
          img.onload = () => { dirty = true; };
          if (m) img.src = m.url;
          imgs.set(sc.mediaId, img);
        }
      } else if (sc.type === 'video') {
        live.add(sc.id);
        let v = vids.get(sc.id);
        if (v && v.mediaId !== sc.mediaId) {
          dropElement(v.el, v.node);
          v = null;
        }
        if (!v) {
          v = makeVideo(sc);
          vids.set(sc.id, v);
        }
        v.gain.gain.value = sc.muted ? 0 : (p.clipVolume ?? 1);
      }
    }
    for (const id of [...imgs.keys()]) if (!usedImgs.has(id)) imgs.delete(id);
    for (const [id, v] of [...vids]) {
      if (!live.has(id)) {
        dropElement(v.el, v.node);
        vids.delete(id);
      }
    }

    const want = p.music ? p.music.mediaId : null;
    if (music && music.mediaId !== want) {
      dropElement(music.el, music.node);
      music = null;
    }
    if (want && !music) {
      music = makeMusic(p.music);
      if (playing) startMusic();
    }

    const [w, h] = SIZES[p.aspect] || SIZES['9:16'];
    const s = p.quality === 1080 ? 1.5 : 1;
    if (canvas.width !== w * s || canvas.height !== h * s) {
      canvas.width = w * s;
      canvas.height = h * s;
    }

    if (t > tl.total) t = tl.total;
    if (!tl.scenes.length && playing) pause();
    // Re-enter the current scene so trims and reorders take effect right away.
    if (playing) {
      cur = -1;
    } else {
      place(t);
    }
    dirty = true;
  }

  /* ---------- the clock ---------- */

  function startVideo(v) {
    v.failed = false;
    const pr = v.el.play();
    if (pr) pr.catch((e) => {
      // A pause() racing a play() also rejects; only a real refusal counts.
      if (e && e.name !== 'AbortError') v.failed = true;
    });
  }

  // Move into scene i, `local` seconds in.
  function enter(i, local) {
    if (cur >= 0 && cur !== i && tl.scenes[cur] && tl.scenes[cur].type === 'video') {
      const old = vids.get(tl.scenes[cur].id);
      if (old) old.el.pause();
    }
    cur = i;
    const sc = tl.scenes[i];
    if (sc.type === 'video') {
      const v = vids.get(sc.id);
      const want = sc.in + local;
      if (Math.abs(v.el.currentTime - want) > 0.08) v.el.currentTime = want;
      if (playing) startVideo(v);
    }
  }

  // Line every clip up for time t while paused (scrubbing, editing).
  function place(nt) {
    for (const v of vids.values()) v.el.pause();
    cur = -1;
    if (!tl.scenes.length) return;
    const i = FS.indexAt(tl, nt);
    const local = nt - tl.starts[i];
    enter(i, local);
    // During a transition the scene before shows its last frame.
    const prev = tl.scenes[i - 1];
    if (prev && prev.type === 'video' && local < FS.draw.TRANS) {
      vids.get(prev.id).el.currentTime = Math.max(prev.in, prev.out - 0.04);
    }
  }

  function startMusic() {
    if (!music) return;
    const d = music.el.duration;
    if (isFinite(d) && d > 0) music.el.currentTime = t % d;
    music.el.play().catch(() => {});
  }

  // iOS only lets a clip play with sound if it was started from a tap at
  // least once. On the Play tap, start every clip silently and stop it again.
  function unlock() {
    for (const v of vids.values()) {
      if (v.unlocked) continue;
      v.unlocked = true;
      if (!v.el.paused) continue;
      const keep = v.gain.gain.value;
      const at = v.el.currentTime;
      v.gain.gain.value = 0;
      const pr = v.el.play();
      const done = () => {
        if (tl.scenes[cur] && vids.get(tl.scenes[cur].id) === v && playing) {
          v.gain.gain.value = keep;
          return;
        }
        v.el.pause();
        v.el.currentTime = at;
        v.gain.gain.value = keep;
      };
      if (pr) pr.then(done, done);
      else done();
    }
  }

  function play() {
    if (!tl.scenes.length || playing) return;
    audio();
    if (ac.state !== 'running') ac.resume();
    if (t >= tl.total - 0.05) t = 0;
    playing = true;
    unlock();
    for (const v of vids.values()) v.el.pause();
    cur = -1;
    last = performance.now();
    startMusic();
    emit('state', true);
  }

  function pause() {
    if (!playing) return;
    playing = false;
    for (const v of vids.values()) v.el.pause();
    if (music) music.el.pause();
    cur = -1;
    emit('state', false);
  }

  function seek(nt) {
    t = clamp(nt, 0, tl.total);
    if (playing) {
      for (const v of vids.values()) v.el.pause();
      cur = -1;
      startMusic();
    } else {
      place(t);
    }
    dirty = true;
    emit('time', t);
  }

  function finish() {
    t = tl.total;
    pause();
    dirty = true;
    emit('time', t);
    if (exporting) {
      // A little tail so the recorder catches the last frame.
      const ex = exporting;
      setTimeout(() => { if (ex.rec.state !== 'inactive') ex.rec.stop(); }, 300);
    }
  }

  function tick(now) {
    requestAnimationFrame(tick);
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;

    if (playing && tl.scenes.length) {
      const i = FS.indexAt(tl, t);
      if (i !== cur) enter(i, t - tl.starts[i]);
      const sc = tl.scenes[i];
      const start = tl.starts[i];
      const end = start + FS.sceneLen(sc);

      if (sc.type === 'video') {
        const v = vids.get(sc.id);
        const el = v.el;
        if (v.failed || el.error) {
          t += dt;
        } else {
          if (el.paused && !el.ended) startVideo(v);
          if (!el.paused && !el.seeking && el.readyState >= 2) {
            t = Math.max(start, start + (el.currentTime - sc.in));
          }
          // Otherwise the clip is still loading: hold the clock for it.
          if (el.ended || (!el.seeking && el.currentTime >= sc.out - 0.02)) t = Math.max(t, end);
        }
      } else {
        t += dt;
      }

      // Have the next clip waiting at its first frame.
      const nx = tl.scenes[i + 1];
      if (nx && nx.type === 'video' && tl.starts[i + 1] - t < PREROLL) {
        const nv = vids.get(nx.id);
        if (nv.el.paused && !nv.el.seeking && Math.abs(nv.el.currentTime - nx.in) > 0.05) {
          nv.el.currentTime = nx.in;
        }
      }

      if (music && project.music) {
        const fade = clamp((tl.total - t) / MUSIC_FADE, 0, 1);
        music.gain.gain.value = project.music.volume * fade;
      }

      if (exporting) exporting.onProgress(t / tl.total);
      if (t >= tl.total) finish();
      else emit('time', t);
    }

    if (playing || dirty) {
      FS.draw.drawFrame(ctx, tl, t, canvas.width, canvas.height, srcFor);
      dirty = false;
    }
  }

  /* ---------- saving a video file ---------- */

  const TYPES = [
    'video/mp4;codecs=avc1.42E01F,mp4a.40.2',
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];

  function canExport() {
    return !!(window.MediaRecorder && HTMLCanvasElement.prototype.captureStream);
  }

  function pickType() {
    for (const m of TYPES) {
      try {
        if (MediaRecorder.isTypeSupported(m)) return m;
      } catch (e) { /* keep looking */ }
    }
    return '';
  }

  // Wait until the clip at time 0 (if any) has a frame to show.
  function firstFrameReady() {
    const sc = tl.scenes[0];
    if (!sc || sc.type !== 'video') return Promise.resolve();
    const el = vids.get(sc.id).el;
    if (el.readyState >= 2 && !el.seeking) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        el.removeEventListener('seeked', done);
        el.removeEventListener('loadeddata', done);
        resolve();
      };
      el.addEventListener('seeked', done);
      el.addEventListener('loadeddata', done);
      setTimeout(done, 4000);
    });
  }

  async function exportVideo(onProgress) {
    if (!canExport()) throw new Error('unsupported');
    pause();
    audio();
    await ac.resume().catch(() => {});
    if (document.fonts) await document.fonts.load(`800 40px ${FS.draw.FONT}`).catch(() => {});

    seek(0);
    unlock();
    await firstFrameReady();

    if (!recDest) recDest = ac.createMediaStreamDestination();
    master.connect(recDest);
    speakers.gain.value = 0;

    const vstream = canvas.captureStream(30);
    const stream = new MediaStream([...vstream.getVideoTracks(), ...recDest.stream.getAudioTracks()]);
    const type = pickType();
    const opts = {
      videoBitsPerSecond: project.quality === 1080 ? 8000000 : 4000000,
      audioBitsPerSecond: 128000,
    };
    if (type) opts.mimeType = type;
    const rec = new MediaRecorder(stream, opts);
    const chunks = [];

    return new Promise((resolve, reject) => {
      const ex = { rec, onProgress, cancelled: false };
      const cleanup = () => {
        try { master.disconnect(recDest); } catch (e) { /* already off */ }
        speakers.gain.value = 1;
        vstream.getTracks().forEach((tr) => tr.stop());
        if (exporting === ex) exporting = null;
      };
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        cleanup();
        if (ex.cancelled) return resolve(null);
        const mime = (rec.mimeType || type || 'video/webm').split(';')[0];
        resolve(new Blob(chunks, { type: mime }));
      };
      rec.onerror = (e) => {
        cleanup();
        pause();
        reject(e.error || new Error('recorder'));
      };
      exporting = ex;
      rec.start(1000);
      play();
    });
  }

  function cancelExport() {
    if (!exporting) return;
    exporting.cancelled = true;
    pause();
    if (exporting.rec.state !== 'inactive') exporting.rec.stop();
  }

  // Browsers stop drawing hidden pages, so if you leave mid-save, the save
  // pauses (recorder and all) and carries on when you come back.
  document.addEventListener('visibilitychange', () => {
    if (!exporting) return;
    const rec = exporting.rec;
    if (document.hidden) {
      pause();
      if (rec.state === 'recording') rec.pause();
    } else if (rec.state === 'paused') {
      rec.resume();
      play();
    }
  });

  function init(cv, poolEl) {
    canvas = cv;
    ctx = canvas.getContext('2d');
    pool = poolEl;
    last = performance.now();
    requestAnimationFrame(tick);
  }

  FS.engine = {
    init,
    sync,
    play,
    pause,
    seek,
    toggle() { if (playing) pause(); else play(); },
    redraw() { dirty = true; },
    on(ev, fn) { handlers[ev].push(fn); },
    get time() { return t; },
    get total() { return tl.total; },
    get playing() { return playing; },
    get exporting() { return !!exporting; },
    canExport,
    exportVideo,
    cancelExport,
  };
})(window.FS = window.FS || {});
