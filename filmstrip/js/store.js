/* Filmstrip — where things are kept. Photos, clips and songs go into
   IndexedDB so a project survives closing the app, and the project itself (a
   small JSON object listing the scenes) sits next to them. If the browser
   won't give us storage (some private windows), everything still works, it
   just lives in memory until the page is closed. */
(function (FS) {
  'use strict';

  const MAX = 20 * 60; // the longest video, in seconds

  /* ---------- the timeline ---------- */

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // How long a scene lasts. Clips run from their trim-in to their trim-out,
  // photos and titles hold for `dur` seconds.
  const sceneLen = (sc) => (sc.type === 'video' ? Math.max(0.1, sc.out - sc.in) : sc.dur);

  function timeline(project) {
    const scenes = project.scenes;
    const starts = [];
    let total = 0;
    for (const sc of scenes) {
      starts.push(total);
      total += sceneLen(sc);
    }
    return { scenes, starts, total };
  }

  // The scene playing at time t (the last one whose start is at or before t).
  function indexAt(tl, t) {
    let lo = 0;
    let hi = tl.scenes.length - 1;
    if (hi < 0) return -1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (tl.starts[mid] <= t + 1e-6) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  function newProject() {
    return { v: 1, aspect: '9:16', quality: 720, scenes: [], music: null, clipVolume: 1 };
  }

  /* ---------- IndexedDB ---------- */

  let dbp = null;
  let ok = 'indexedDB' in window;

  function db() {
    if (!dbp) {
      dbp = new Promise((resolve, reject) => {
        const r = indexedDB.open('filmstrip', 1);
        r.onupgradeneeded = () => {
          r.result.createObjectStore('media');
          r.result.createObjectStore('kv');
        };
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
    }
    return dbp;
  }

  async function run(store, mode, fn) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(store, mode);
      const req = fn(tx.objectStore(store));
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  }

  async function safe(fn, fallback) {
    if (!ok) return fallback;
    try {
      return await fn();
    } catch (e) {
      console.warn('Filmstrip storage:', e);
      ok = false;
      return fallback;
    }
  }

  /* ---------- media ---------- */

  // id -> { id, kind: 'image'|'video'|'audio', name, duration, w, h, thumb, blob, url }
  const media = new Map();

  function usedIds(project) {
    const ids = new Set();
    for (const sc of project.scenes) if (sc.mediaId) ids.add(sc.mediaId);
    if (project.music) ids.add(project.music.mediaId);
    return ids;
  }

  async function addMedia(m) {
    m.id = m.id || uid();
    m.url = URL.createObjectURL(m.blob);
    m.added = Date.now();
    media.set(m.id, m);
    const { url, added, ...rec } = m;
    await safe(() => run('media', 'readwrite', (s) => s.put(rec, m.id)));
    return m;
  }

  async function loadProject() {
    const p = await safe(() => run('kv', 'readonly', (s) => s.get('project')), null);
    if (!p) return null;
    for (const id of usedIds(p)) {
      const rec = await safe(() => run('media', 'readonly', (s) => s.get(id)), null);
      if (rec && rec.blob) {
        rec.url = URL.createObjectURL(rec.blob);
        media.set(id, rec);
      }
    }
    // Drop scenes whose media went missing (storage cleared under us).
    p.scenes = p.scenes.filter((sc) => !sc.mediaId || media.has(sc.mediaId));
    if (p.music && !media.has(p.music.mediaId)) p.music = null;
    return p;
  }

  let saveTimer = 0;
  function saveProject(project) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      await safe(() => run('kv', 'readwrite', (s) => s.put(project, 'project')));
      await prune(project);
    }, 400);
  }

  // Forget media no scene uses any more, in memory and on disk. Media added in
  // the last little while is left alone: it may be on its way into a scene.
  // Media an undo may still bring back (see hold()).
  let held = new Set();

  async function prune(project) {
    const used = usedIds(project);
    const fresh = (id) => held.has(id) || (media.has(id) && Date.now() - (media.get(id).added || 0) < 60000);
    for (const [id, m] of media) {
      if (!used.has(id) && !fresh(id)) {
        URL.revokeObjectURL(m.url);
        media.delete(id);
      }
    }
    const keys = await safe(() => run('media', 'readonly', (s) => s.getAllKeys()), []);
    for (const k of keys) {
      if (!used.has(k) && !fresh(k)) await safe(() => run('media', 'readwrite', (s) => s.delete(k)));
    }
  }

  FS.MAX = MAX;
  FS.uid = uid;
  FS.sceneLen = sceneLen;
  FS.timeline = timeline;
  FS.indexAt = indexAt;
  FS.newProject = newProject;
  FS.store = {
    media,
    get persistent() { return ok; },
    addMedia,
    loadProject,
    saveProject,
    // Keep this media even while no scene uses it (pass null to let go).
    hold(ids) { held = new Set(ids || []); },
  };
})(window.FS = window.FS || {});
