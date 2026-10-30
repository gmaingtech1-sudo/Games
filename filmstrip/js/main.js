/* Filmstrip — the app around the player: adding photos, clips, titles,
   recordings and music, the scene strip, the edit sheets, the 20-minute
   meter, and saving the finished video. */
(function (FS) {
  'use strict';

  const { engine, store, draw } = FS;
  const $ = (id) => document.getElementById(id);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const PHOTO_SECS = 4;   // how long a new photo stays on screen
  const MIN_LEN = 0.5;    // the shortest a scene can be

  let project = FS.newProject();
  let selected = null;    // id of the scene being edited
  let openSheet = null;
  let scrubbing = false;
  let lastExport = null;  // { blob, url, name }

  /* ---------- small helpers ---------- */

  function fmt(s) {
    s = Math.max(0, s);
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  }

  function fmtLong(s) {
    const m = Math.floor(s / 60);
    const sec = Math.round(s % 60);
    if (!m) return `${sec} second${sec === 1 ? '' : 's'}`;
    return `${m} minute${m === 1 ? '' : 's'}${sec ? ` ${sec} second${sec === 1 ? '' : 's'}` : ''}`;
  }

  function fmtSize(bytes) {
    if (bytes > 1e9) return (bytes / 1e9).toFixed(1) + ' GB';
    if (bytes > 1e6) return Math.round(bytes / 1e6) + ' MB';
    return Math.max(1, Math.round(bytes / 1e3)) + ' KB';
  }

  let toastTimer = 0;
  function toast(text) {
    const el = $('toast');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
  }
  FS.toast = toast;

  const keepAwake = (on) => FS.host.keepAwake(on);

  const total = () => FS.timeline(project).total;
  const sceneById = (id) => project.scenes.find((s) => s.id === id);
  const sceneStart = (sc) => FS.timeline(project).starts[project.scenes.indexOf(sc)] || 0;
  // Seconds left in the 20 minutes, counting `except` as if it weren't there.
  const room = (except) => FS.MAX - total() + (except ? FS.sceneLen(except) : 0);

  /* ---------- after every change ---------- */

  function commit() {
    engine.sync(project);
    renderStrip();
    renderMeter();
    renderTransport();
    store.saveProject(project);
  }

  function renderMeter() {
    const tt = total();
    const f = tt / FS.MAX;
    $('meter-fill').style.width = `${clamp(f * 100, 0, 100)}%`;
    $('meter').classList.toggle('warn', f > 0.9);
    $('meter-text').textContent = `${fmt(tt)} / ${fmt(FS.MAX)}`;
  }

  function renderTransport() {
    const tt = engine.total;
    const scrub = $('scrub');
    scrub.max = String(tt);
    if (!scrubbing) scrub.value = String(engine.time);
    scrub.style.setProperty('--p', tt ? `${(engine.time / tt) * 100}%` : '0%');
    $('time-now').textContent = fmt(engine.time);
    $('time-total').textContent = fmt(tt);
    const empty = !project.scenes.length;
    $('empty').hidden = !empty;
    $('btn-bigplay').hidden = empty || engine.playing;
    $('btn-play').disabled = empty;
    $('btn-play').classList.toggle('playing', engine.playing);
    $('btn-play').setAttribute('aria-label', engine.playing ? 'Pause' : 'Play');
    highlightTile();
  }

  function thumbStyle(sc) {
    if (sc.type === 'title') {
      const th = draw.theme(sc.theme);
      return `background:linear-gradient(160deg,${th.a},${th.b});color:${th.fg}`;
    }
    const m = store.media.get(sc.mediaId);
    return m && m.thumb ? `background-image:url(${m.thumb})` : '';
  }

  const TYPE_ICON = {
    photo: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 16l5-5 4 4 3-3 6 6"/></svg>',
    video: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z"/></svg>',
    title: '<svg viewBox="0 0 24 24"><path d="M5 6h14M12 6v13"/></svg>',
  };

  function renderStrip() {
    const strip = $('strip');
    const keep = strip.scrollLeft;
    const tiles = project.scenes.map((sc, i) => {
      const words = sc.type === 'title' ? `<span class="tile-words">${esc((sc.text || '').slice(0, 40))}</span>` : '';
      return `<button class="tile${sc.id === selected ? ' sel' : ''}" type="button" data-id="${sc.id}"
          aria-label="Scene ${i + 1}, ${sc.type}, ${fmt(FS.sceneLen(sc))}">
        <span class="tile-img" style="${thumbStyle(sc)}">${words}</span>
        <span class="tile-num">${i + 1}</span>
        <span class="tile-icon" aria-hidden="true">${TYPE_ICON[sc.type]}</span>
        <span class="tile-len">${fmt(FS.sceneLen(sc))}</span>
        ${sc.text && sc.type !== 'title' ? '<span class="tile-text" aria-hidden="true">Aa</span>' : ''}
      </button>`;
    });
    tiles.push(`<button class="tile add" type="button" data-act="media" aria-label="Add photos and clips">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>`);
    strip.innerHTML = tiles.join('');
    strip.scrollLeft = keep;
    highlightTile();
  }

  let lastLit = -2;
  function highlightTile() {
    const tl = FS.timeline(project);
    const i = tl.scenes.length ? FS.indexAt(tl, engine.time) : -1;
    if (i === lastLit && document.querySelector('.tile.now')) return;
    lastLit = i;
    document.querySelectorAll('.tile.now').forEach((el) => el.classList.remove('now'));
    const sc = tl.scenes[i];
    if (!sc) return;
    const el = document.querySelector(`.tile[data-id="${sc.id}"]`);
    if (el) {
      el.classList.add('now');
      if (engine.playing) el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    }
  }

  /* ---------- adding photos and clips ---------- */

  function insertScene(sc, at) {
    project.scenes.splice(at, 0, sc);
    return at + 1;
  }

  function insertIndex() {
    const i = project.scenes.findIndex((s) => s.id === selected);
    return i >= 0 ? i + 1 : project.scenes.length;
  }

  function loadImage(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => resolve({ img, url });
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('image'));
      };
      img.src = url;
    });
  }

  function makeThumb(src, sw, sh) {
    const c = document.createElement('canvas');
    c.width = c.height = 144;
    const r = Math.max(144 / sw, 144 / sh);
    c.getContext('2d').drawImage(src, (144 - sw * r) / 2, (144 - sh * r) / 2, sw * r, sh * r);
    return c.toDataURL('image/jpeg', 0.75);
  }

  async function prepImage(file) {
    const { img, url } = await loadImage(file);
    try {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      // Big phone photos are shrunk: plenty for a 1080p video, far less memory.
      const s = Math.min(1, 2400 / Math.max(w, h));
      let blob = file;
      if (s < 1 || !/^image\/(jpeg|png|webp|gif)$/.test(file.type)) {
        const c = document.createElement('canvas');
        c.width = Math.round(w * s);
        c.height = Math.round(h * s);
        const cx = c.getContext('2d');
        cx.fillStyle = '#000';
        cx.fillRect(0, 0, c.width, c.height);
        cx.drawImage(img, 0, 0, c.width, c.height);
        blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.9));
        if (!blob) throw new Error('image');
      }
      return { kind: 'image', name: file.name || 'Photo', blob, w, h, thumb: makeThumb(img, w, h) };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  // Read a clip's length and grab a thumbnail. `knownDur` helps with camera
  // recordings, which some browsers save without a length.
  function prepVideo(blob, name, knownDur) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const el = document.createElement('video');
      el.muted = true;
      el.playsInline = true;
      el.setAttribute('playsinline', '');
      el.preload = 'auto';
      $('media-pool').appendChild(el);
      let dur = 0;
      let finished = false;
      const cleanup = () => {
        finished = true;
        clearTimeout(giveUp);
        el.removeAttribute('src');
        el.load();
        el.remove();
        URL.revokeObjectURL(url);
      };
      const fail = () => {
        if (finished) return;
        cleanup();
        reject(new Error('video'));
      };
      const giveUp = setTimeout(fail, 20000);
      const grab = () => {
        if (dur || finished) return;
        dur = el.duration;
        if (!isFinite(dur) || dur <= 0) dur = knownDur || 0;
        if (!dur) return fail();
        el.onseeked = () => {
          el.onseeked = null;
          if (!el.videoWidth) return fail();
          const out = {
            kind: 'video',
            name: name || 'Clip',
            blob,
            duration: knownDur ? Math.min(dur, knownDur) : dur,
            w: el.videoWidth,
            h: el.videoHeight,
            thumb: makeThumb(el, el.videoWidth, el.videoHeight),
          };
          cleanup();
          resolve(out);
        };
        el.currentTime = Math.min(1, dur * 0.25);
      };
      el.onerror = fail;
      el.onloadedmetadata = () => {
        if (isFinite(el.duration) && el.duration > 0) return grab();
        // Length unknown: jumping far ahead makes the browser work it out.
        el.ondurationchange = () => {
          if (isFinite(el.duration) && el.duration > 0) {
            el.ondurationchange = null;
            el.currentTime = 0;
            grab();
          }
        };
        el.currentTime = 1e7;
        setTimeout(() => { if (!dur && knownDur) grab(); }, 2500);
      };
      el.src = url;
    });
  }

  function videoScene(m, len) {
    return {
      id: FS.uid(), type: 'video', mediaId: m.id, in: 0, out: len, muted: false,
      text: '', textPos: 'bottom', size: 'M', look: 'shadow', fit: 'cover', transition: 'fade',
    };
  }

  async function importFiles(files) {
    files = [...files];
    if (!files.length) return;
    let at = insertIndex();
    let added = 0;
    let skipped = 0;
    let full = false;
    toast(files.length > 1 ? `Adding ${files.length} files…` : 'Adding…');
    for (const f of files) {
      const left = room();
      if (left < MIN_LEN) {
        full = true;
        break;
      }
      try {
        if (f.type.startsWith('image/') || /\.(heic|heif|jpe?g|png|webp|gif)$/i.test(f.name)) {
          const m = await store.addMedia(await prepImage(f));
          at = insertScene({
            id: FS.uid(), type: 'photo', mediaId: m.id, dur: Math.min(PHOTO_SECS, left),
            text: '', textPos: 'bottom', size: 'M', look: 'shadow', fit: 'cover',
            effect: ['zoom-in', 'zoom-out', 'pan'][project.scenes.length % 3], transition: 'fade',
          }, at);
        } else if (f.type.startsWith('video/') || /\.(mp4|mov|m4v|webm|mkv)$/i.test(f.name)) {
          const m = await store.addMedia(await prepVideo(f, f.name));
          if (m.duration > left) full = true;
          at = insertScene(videoScene(m, Math.min(m.duration, left)), at);
        } else {
          skipped++;
          continue;
        }
        added++;
        commit();
      } catch (e) {
        console.warn(e);
        skipped++;
      }
    }
    if (full) toast('Your video is full: it has reached 20 minutes.');
    else if (skipped) toast(`Added ${added}. ${skipped} file${skipped === 1 ? '' : 's'} couldn't be opened here.`);
    else toast(`Added ${added} to your video.`);
  }

  function addTitle() {
    const left = room();
    if (left < MIN_LEN) return toast('Your video is full: it has reached 20 minutes.');
    const sc = {
      id: FS.uid(), type: 'title', text: project.scenes.length ? 'The end' : 'My video', dur: Math.min(3, left),
      theme: 'ink', textPos: 'middle', size: 'L', transition: 'fade',
    };
    insertScene(sc, insertIndex());
    commit();
    editScene(sc.id, true);
  }

  function record() {
    const left = room();
    if (left < 1) return toast('Your video is full: it has reached 20 minutes.');
    engine.pause();
    FS.camera.show(left, async (blob, secs) => {
      toast('Adding your recording…');
      try {
        const m = await store.addMedia(await prepVideo(blob, 'Recording', secs));
        const len = Math.min(m.duration, room());
        if (len < 0.2) return;
        insertScene(videoScene(m, len), insertIndex());
        commit();
        toast(`Recording added (${fmt(len)}).`);
      } catch (e) {
        console.warn(e);
        toast("Sorry, that recording couldn't be read.");
      }
    });
  }

  /* ---------- sheets ---------- */

  function showSheet(id) {
    if (openSheet && openSheet !== id) $(openSheet).hidden = true;
    openSheet = id;
    $(id).hidden = false;
    $('scrim').hidden = false;
    document.body.classList.add('sheet-open');
    FS.host.setOverlay(true);
  }

  function closeSheet() {
    if (!openSheet) return;
    if (openSheet === 'sheet-export' && engine.exporting) return;
    $(openSheet).hidden = true;
    openSheet = null;
    $('scrim').hidden = true;
    document.body.classList.remove('sheet-open');
    FS.host.setOverlay(false);
    if (selected) {
      selected = null;
      renderStrip();
    }
  }

  function chips(key, value, options, extraClass) {
    return `<div class="chips ${extraClass || ''}" data-key="${key}">${options
      .map(([v, label, style]) => `<button type="button" class="chip" data-val="${v}" aria-pressed="${String(v) === String(value)}"${style ? ` style="${style}"` : ''}>${label}</button>`)
      .join('')}</div>`;
  }

  function sheetHead(id, title, sub) {
    return `<div class="sheet-grip" aria-hidden="true"></div>
      <header class="sheet-head">
        <div><h2 id="${id}">${title}</h2>${sub ? `<p class="sub">${sub}</p>` : ''}</div>
        <button class="pill" type="button" data-do="close">Done</button>
      </header>`;
  }

  /* ----- edit a scene ----- */

  const TYPE_NAME = { photo: 'Photo', video: 'Clip', title: 'Title' };

  function editScene(id, focusText) {
    const sc = sceneById(id);
    if (!sc) return;
    selected = id;
    renderStrip();
    const i = project.scenes.indexOf(sc);
    const len = FS.sceneLen(sc);
    const m = sc.mediaId ? store.media.get(sc.mediaId) : null;
    const parts = [sheetHead('scene-head', `Scene ${i + 1} · ${TYPE_NAME[sc.type]}`, fmt(len))];

    if (sc.type === 'video') {
      const d = m ? m.duration : sc.out;
      parts.push(`<div class="field"><label>Trim</label>
        <div class="trim">
          <span>Start <b id="trim-in-v">${fmt(sc.in)}</b></span>
          <input type="range" id="trim-in" min="0" max="${d}" step="0.1" value="${sc.in}" aria-label="Clip start">
          <span>End <b id="trim-out-v">${fmt(sc.out)}</b></span>
          <input type="range" id="trim-out" min="0" max="${d}" step="0.1" value="${sc.out}" aria-label="Clip end">
        </div></div>`);
      parts.push(`<div class="field"><label>Clip sound</label>${chips('sound', sc.muted ? 'off' : 'on', [['on', 'On'], ['off', 'Off']])}</div>`);
    } else {
      const max = Math.max(MIN_LEN, Math.min(600, room(sc)));
      parts.push(`<div class="field"><label for="dur-n">Length (seconds)</label>
        <div class="dur">
          <input type="range" id="dur" min="${MIN_LEN}" max="${Math.min(60, max)}" step="0.5" value="${Math.min(sc.dur, 60)}" aria-label="Length">
          <input type="number" id="dur-n" min="${MIN_LEN}" max="${max}" step="0.5" value="${sc.dur}" inputmode="decimal">
        </div></div>`);
    }

    parts.push(`<div class="field"><label for="text">${sc.type === 'title' ? 'Title' : 'Words on screen'}</label>
      <textarea id="text" rows="2" maxlength="300" placeholder="${sc.type === 'title' ? 'Your title' : 'Add words (optional)'}">${esc(sc.text || '')}</textarea></div>`);
    parts.push(`<div class="field row">
      <div><label>Place</label>${chips('textPos', sc.textPos, [['top', 'Top'], ['middle', 'Middle'], ['bottom', 'Bottom']])}</div>
      <div><label>Size</label>${chips('size', sc.size, [['S', 'S'], ['M', 'M'], ['L', 'L']])}</div>
    </div>`);
    if (sc.type !== 'title') {
      parts.push(`<div class="field"><label>Words style</label>${chips('look', sc.look, [['shadow', 'Shadow'], ['box', 'Box']])}</div>`);
    }

    if (sc.type === 'title') {
      parts.push(`<div class="field"><label>Background</label>${chips('theme', sc.theme,
        draw.THEMES.map((th) => [th.id, `<span class="sr">${th.name}</span>`, `background:linear-gradient(160deg,${th.a},${th.b})`]), 'swatches')}</div>`);
    }
    if (sc.type === 'photo') {
      parts.push(`<div class="field"><label>Motion</label>${chips('effect', sc.effect, [['none', 'Still'], ['zoom-in', 'Zoom in'], ['zoom-out', 'Zoom out'], ['pan', 'Pan']])}</div>`);
    }
    if (sc.type !== 'title') {
      parts.push(`<div class="field"><label>Fit</label>${chips('fit', sc.fit, [['cover', 'Fill the frame'], ['contain', 'Show it all']])}</div>`);
    }
    parts.push(`<div class="field"><label>Transition in</label>${chips('transition', sc.transition, [['cut', 'Cut'], ['fade', 'Fade'], ['slide', 'Slide'], ['zoom', 'Zoom'], ['dip', 'Dip to black']])}</div>`);

    parts.push(`<div class="actions">
      <button class="pill" type="button" data-do="left" ${i === 0 ? 'disabled' : ''}>◀ Move</button>
      <button class="pill" type="button" data-do="right" ${i === project.scenes.length - 1 ? 'disabled' : ''}>Move ▶</button>
      <button class="pill" type="button" data-do="dup">Duplicate</button>
      <button class="pill danger" type="button" data-do="delete">Delete</button>
    </div>`);

    const sheet = $('sheet-scene');
    sheet.innerHTML = parts.join('');
    sheet.dataset.id = id;
    showSheet('sheet-scene');
    engine.pause();
    showSceneAt(sc, 'middle');
    if (focusText) {
      const ta = $('text');
      ta.focus();
      ta.select();
    }
  }

  function showSceneAt(sc, where) {
    const s = sceneStart(sc);
    const len = FS.sceneLen(sc);
    if (where === 'in') engine.seek(s + Math.min(sc.transition === 'cut' ? 0 : draw.TRANS, len / 2));
    else if (where === 'out') engine.seek(s + len - 0.05);
    else engine.seek(s + Math.min(len / 2, 1.2));
  }

  function refreshSceneHead(sc) {
    const sub = $('sheet-scene').querySelector('.sub');
    if (sub) sub.textContent = fmt(FS.sceneLen(sc));
  }

  function onSceneInput(e) {
    const sc = sceneById($('sheet-scene').dataset.id);
    if (!sc) return;
    const el = e.target;
    if (el.id === 'text') {
      sc.text = el.value;
      commit();
      return;
    }
    if (el.id === 'dur' || el.id === 'dur-n') {
      const v = parseFloat(el.value);
      if (!isFinite(v)) return;
      sc.dur = clamp(Math.round(v * 2) / 2, MIN_LEN, Math.max(MIN_LEN, room(sc)));
      if (el.id === 'dur') $('dur-n').value = sc.dur;
      else $('dur').value = Math.min(sc.dur, 60);
      commit();
      refreshSceneHead(sc);
      return;
    }
    if (el.id === 'trim-in' || el.id === 'trim-out') {
      const m = store.media.get(sc.mediaId);
      const d = m ? m.duration : sc.out;
      let a = parseFloat($('trim-in').value);
      let b = parseFloat($('trim-out').value);
      const limit = room(sc);
      if (el.id === 'trim-in') {
        a = clamp(a, 0, b - MIN_LEN);
        b = Math.min(b, a + limit);
      } else {
        b = clamp(b, a + MIN_LEN, d);
        b = Math.min(b, a + limit);
      }
      sc.in = Math.max(0, a);
      sc.out = Math.max(sc.in + MIN_LEN, b);
      $('trim-in').value = sc.in;
      $('trim-out').value = sc.out;
      $('trim-in-v').textContent = fmt(sc.in);
      $('trim-out-v').textContent = fmt(sc.out);
      commit();
      refreshSceneHead(sc);
      showSceneAt(sc, el.id === 'trim-in' ? 'in' : 'out');
    }
  }

  function onSceneClick(e) {
    const sc = sceneById($('sheet-scene').dataset.id);
    if (!sc) return;
    const chip = e.target.closest('.chip');
    if (chip) {
      const key = chip.parentElement.dataset.key;
      const val = chip.dataset.val;
      if (key === 'sound') sc.muted = val === 'off';
      else sc[key] = val;
      chip.parentElement.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
      commit();
      showSceneAt(sc, key === 'transition' ? 'start' : 'middle');
      if (key === 'transition' && val !== 'cut') {
        // Play the transition so you can see it.
        engine.seek(Math.max(0, sceneStart(sc) - 0.4));
        engine.play();
        setTimeout(() => { if (engine.playing && selected === sc.id) engine.pause(); }, 1400);
      }
      return;
    }
    const act = e.target.closest('[data-do]');
    if (!act) return;
    const i = project.scenes.indexOf(sc);
    switch (act.dataset.do) {
      case 'close':
        closeSheet();
        break;
      case 'left':
      case 'right': {
        const j = act.dataset.do === 'left' ? i - 1 : i + 1;
        if (j < 0 || j >= project.scenes.length) return;
        project.scenes.splice(i, 1);
        project.scenes.splice(j, 0, sc);
        commit();
        editScene(sc.id);
        break;
      }
      case 'dup': {
        if (room() < FS.sceneLen(sc)) return toast('Not enough room left in the 20 minutes.');
        const copy = { ...sc, id: FS.uid() };
        project.scenes.splice(i + 1, 0, copy);
        commit();
        editScene(copy.id);
        break;
      }
      case 'delete':
        project.scenes.splice(i, 1);
        selected = null;
        closeSheet();
        commit();
        toast('Scene deleted.');
        break;
      default:
    }
  }

  /* ----- music ----- */

  function musicSheet() {
    const mu = project.music;
    const m = mu ? store.media.get(mu.mediaId) : null;
    const hasClips = project.scenes.some((s) => s.type === 'video');
    $('sheet-music').innerHTML = [
      sheetHead('music-head', 'Music', 'Plays under the whole video and fades out at the end'),
      mu
        ? `<div class="field"><div class="song"><span class="song-icon" aria-hidden="true">♪</span><span class="song-name">${esc(m ? m.name : 'Song')}</span></div></div>
           <div class="field"><label for="music-vol">Music volume</label><input type="range" id="music-vol" min="0" max="1" step="0.05" value="${mu.volume}"></div>
           <div class="actions"><button class="pill" type="button" data-do="pick">Change song</button><button class="pill danger" type="button" data-do="remove">Remove music</button></div>`
        : `<div class="field"><button class="pill primary wide" type="button" data-do="pick">Choose a song from your phone</button>
           <p class="note">Use music you made or have the rights to, especially if you'll post the video online.</p></div>`,
      hasClips ? `<div class="field"><label for="clip-vol">Clip sound volume</label><input type="range" id="clip-vol" min="0" max="1" step="0.05" value="${project.clipVolume ?? 1}"></div>` : '',
    ].join('');
    showSheet('sheet-music');
  }

  async function setMusic(file) {
    if (!file) return;
    try {
      const m = await store.addMedia({ kind: 'audio', name: (file.name || 'Song').replace(/\.[^.]+$/, ''), blob: file });
      project.music = { mediaId: m.id, volume: project.music ? project.music.volume : 0.7 };
      commit();
      musicSheet();
      toast('Music added.');
    } catch (e) {
      toast("Sorry, that song couldn't be added.");
    }
  }

  /* ----- settings ----- */

  function settingsSheet() {
    $('sheet-settings').innerHTML = [
      sheetHead('settings-head', 'Video settings'),
      `<div class="field"><label>Shape</label>${chips('aspect', project.aspect, [
        ['9:16', '<span class="shape tall"></span>Tall'], ['16:9', '<span class="shape wide"></span>Wide'], ['1:1', '<span class="shape square"></span>Square'],
      ], 'shapes')}</div>`,
      `<div class="field"><label>Quality</label>${chips('quality', project.quality, [['720', '720p · smaller file'], ['1080', '1080p · sharper']])}
        <p class="note">A 20-minute video is roughly ${project.quality === 1080 ? '1.2 GB' : '600 MB'} at this quality.</p></div>`,
      `<div class="field"><p class="note">${store.persistent
        ? 'Your project is kept on this device, so you can close the app and carry on later.'
        : "This browser won't let the app keep files, so your project is lost when you close the page. Save your video before you leave."}</p></div>`,
      `<div class="actions"><button class="pill danger" type="button" data-do="new">Start a new video</button></div>`,
    ].join('');
    showSheet('sheet-settings');
  }

  function onSettingsClick(e) {
    const chip = e.target.closest('.chip');
    if (chip) {
      const key = chip.parentElement.dataset.key;
      project[key] = key === 'quality' ? parseInt(chip.dataset.val, 10) : chip.dataset.val;
      commit();
      settingsSheet();
      return;
    }
    const act = e.target.closest('[data-do]');
    if (!act) return;
    if (act.dataset.do === 'close') closeSheet();
    if (act.dataset.do === 'new') {
      if (project.scenes.length && !confirm('Start a new video? This one will be deleted from the app.')) return;
      const keep = { aspect: project.aspect, quality: project.quality };
      project = Object.assign(FS.newProject(), keep);
      engine.seek(0);
      closeSheet();
      commit();
    }
  }

  /* ----- saving the video ----- */

  function exportSheet(state, info) {
    const tt = total();
    let body = '';
    if (state === 'ready') {
      body = engine.canExport()
        ? `<p class="lead">Your video is <b>${fmtLong(tt)}</b> long.</p>
           <p class="note">Saving plays it through once while it records, so it takes about ${fmtLong(tt)}. Keep this screen open; if you leave the app, saving pauses until you come back.</p>
           <div class="actions"><button class="pill primary wide" type="button" data-do="start">Start saving</button></div>`
        : `<p class="note">This browser can't save videos. Try the latest Chrome, Edge, Firefox or Safari.</p>`;
    } else if (state === 'busy') {
      body = `<div class="progress"><i id="ex-fill"></i></div>
        <p class="lead center"><span id="ex-time">0:00</span> of ${fmt(tt)}</p>
        <p class="note center">Keep this screen open while your video saves.</p>
        <div class="actions"><button class="pill wide" type="button" data-do="cancel">Cancel</button></div>`;
    } else if (state === 'done') {
      const canShare = FS.host.native
        || (navigator.canShare && navigator.canShare({ files: [new File([info.blob], info.name, { type: info.blob.type })] }));
      const save = FS.host.native
        ? '<button class="pill primary" type="button" data-do="save">Save to gallery</button>'
        : `<a class="pill primary" href="${info.url}" download="${esc(info.name)}">Download</a>`;
      body = `<video class="result" src="${info.url}" controls playsinline></video>
        <p class="note center" id="ex-note">${esc(info.name)} · ${fmtSize(info.blob.size)}</p>
        <div class="actions">
          ${save}
          ${canShare ? '<button class="pill" type="button" data-do="share">Share</button>' : ''}
        </div>`;
    }
    $('sheet-export').innerHTML = sheetHead('export-head', state === 'done' ? 'Your video is ready' : 'Save video') + body;
    showSheet('sheet-export');
  }

  async function startExport() {
    exportSheet('busy');
    $('sheet-export').querySelector('[data-do="close"]').disabled = true;
    keepAwake(true);
    const tt = total();
    try {
      const blob = await engine.exportVideo((p) => {
        const fill = $('ex-fill');
        if (fill) fill.style.width = `${clamp(p * 100, 0, 100)}%`;
        const tm = $('ex-time');
        if (tm) tm.textContent = fmt(p * tt);
      });
      keepAwake(false);
      if (!blob) {
        exportSheet('ready');
        return;
      }
      if (lastExport) URL.revokeObjectURL(lastExport.url);
      const d = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
      const name = `filmstrip-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.${ext}`;
      lastExport = { blob, url: URL.createObjectURL(blob), name };
      exportSheet('done', lastExport);
    } catch (e) {
      console.warn(e);
      keepAwake(false);
      exportSheet('ready');
      toast('Saving stopped because of an error. Please try again.');
    }
  }

  // In the Android app the video is copied over to the app, then saved to
  // the gallery or handed to the share sheet.
  let handing = false;
  async function nativeHandOff(what) {
    if (handing || !lastExport) return;
    handing = true;
    const note = $('ex-note');
    const was = note ? note.textContent : '';
    const buttons = $('sheet-export').querySelectorAll('.actions button');
    buttons.forEach((b) => { b.disabled = true; });
    const progress = (p) => { if (note) note.textContent = `Getting it ready… ${Math.round(p * 100)}%`; };
    const ex = lastExport;
    const ok = what === 'save'
      ? await FS.host.saveVideo(ex.blob, ex.name, progress)
      : await FS.host.shareVideo(ex.blob, ex.name, progress);
    handing = false;
    buttons.forEach((b) => { b.disabled = false; });
    if (note) note.textContent = was;
    if (what === 'save') toast(ok ? 'Saved to your gallery, in Movies/Filmstrip.' : "Sorry, the video couldn't be saved.");
    else if (!ok) toast("Sorry, the video couldn't be shared.");
  }

  async function onExportClick(e) {
    const act = e.target.closest('[data-do]');
    if (!act) return;
    switch (act.dataset.do) {
      case 'close': closeSheet(); break;
      case 'start': startExport(); break;
      case 'cancel': engine.cancelExport(); break;
      case 'save':
      case 'share':
        if (FS.host.native) {
          nativeHandOff(act.dataset.do);
          break;
        }
        try {
          await navigator.share({ files: [new File([lastExport.blob], lastExport.name, { type: lastExport.blob.type })], title: 'My video' });
        } catch (err) { /* cancelled */ }
        break;
      default:
    }
  }

  /* ---------- wiring ---------- */

  function act(name) {
    switch (name) {
      case 'media': $('file-media').click(); break;
      case 'record': record(); break;
      case 'title': addTitle(); break;
      case 'music': engine.pause(); musicSheet(); break;
      case 'export':
        if (!project.scenes.length) return toast('Add something to your video first.');
        engine.pause();
        exportSheet('ready');
        break;
      default:
    }
  }

  async function boot() {
    engine.init($('out'), $('media-pool'));
    engine.on('time', renderTransport);
    engine.on('state', renderTransport);

    const saved = await store.loadProject();
    if (saved) project = Object.assign(FS.newProject(), saved);
    commit();
    engine.seek(0);

    if (document.fonts) document.fonts.load(`800 40px ${draw.FONT}`).then(() => engine.redraw()).catch(() => {});

    document.addEventListener('click', (e) => {
      const a = e.target.closest('[data-act]');
      if (a) act(a.dataset.act);
    });
    $('file-media').addEventListener('change', (e) => {
      importFiles(e.target.files);
      e.target.value = '';
    });
    $('file-music').addEventListener('change', (e) => {
      setMusic(e.target.files[0]);
      e.target.value = '';
    });

    $('btn-play').addEventListener('click', () => engine.toggle());
    $('btn-bigplay').addEventListener('click', () => engine.play());
    $('out').addEventListener('click', () => { if (project.scenes.length) engine.toggle(); });
    const scrub = $('scrub');
    scrub.addEventListener('input', () => {
      scrubbing = true;
      engine.seek(parseFloat(scrub.value));
    });
    scrub.addEventListener('change', () => { scrubbing = false; renderTransport(); });

    $('strip').addEventListener('click', (e) => {
      const tile = e.target.closest('.tile[data-id]');
      if (tile) editScene(tile.dataset.id);
    });

    $('btn-settings').addEventListener('click', () => { engine.pause(); settingsSheet(); });
    $('scrim').addEventListener('click', closeSheet);

    const sceneSheet = $('sheet-scene');
    sceneSheet.addEventListener('input', onSceneInput);
    sceneSheet.addEventListener('click', onSceneClick);
    $('sheet-settings').addEventListener('click', onSettingsClick);
    $('sheet-export').addEventListener('click', onExportClick);
    $('sheet-music').addEventListener('click', (e) => {
      const a = e.target.closest('[data-do]');
      if (!a) return;
      if (a.dataset.do === 'close') closeSheet();
      if (a.dataset.do === 'pick') $('file-music').click();
      if (a.dataset.do === 'remove') {
        project.music = null;
        commit();
        musicSheet();
      }
    });
    $('sheet-music').addEventListener('input', (e) => {
      if (e.target.id === 'music-vol' && project.music) project.music.volume = parseFloat(e.target.value);
      if (e.target.id === 'clip-vol') project.clipVolume = parseFloat(e.target.value);
      commit();
    });

    document.addEventListener('keydown', (e) => {
      if (e.target.closest('input, textarea, select')) return;
      if (e.key === 'Escape') closeSheet();
      if (e.key === ' ' && !openSheet && project.scenes.length) {
        e.preventDefault();
        engine.toggle();
      }
    });
    // Android's back button, while a sheet or the camera is up.
    FS.host.on('back', () => {
      if (FS.camera.open && !FS.camera.recording) FS.camera.close();
      else closeSheet();
    });
    window.addEventListener('beforeunload', (e) => {
      if (engine.exporting || FS.camera.recording) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }

  document.addEventListener('DOMContentLoaded', boot);
})(window.FS = window.FS || {});
