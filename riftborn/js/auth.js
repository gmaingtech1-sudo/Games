/* Riftborn — agent accounts: sign up, log in, log out, and keeping your
   progress with your account.

   Two back ends:
   - Online (when there's a Firebase project, built into config.js or
     pasted in the game under "Set up online accounts"): email and
     password accounts through Firebase Authentication, your save stored
     in Firestore so it follows you to any phone, and a shared
     leaderboard. Uses Firebase's REST APIs directly, so no SDK is loaded.
   - On this device (no Firebase project): accounts live on the phone,
     with passwords hashed (PBKDF2). Several agents can share one phone.

   Either way the current login is remembered until you log out, and each
   account has its own save (see RB.host.useSave). */
window.RB = window.RB || {};
(function (RB) {
  'use strict';

  const H = RB.host;
  const SESSION = 'riftborn-session';
  const ACCOUNTS = 'riftborn-accounts';
  const LEGACY_TAKEN = 'riftborn-legacy-taken';
  const ONLINE_SETUP = 'riftborn-firebase';     // Firebase project pasted in the game
  const LAST_LOCAL = 'riftborn-last-local';     // the phone account that last played

  // Firebase project: built into config.js, or pasted in the game.
  const built = () => (window.RB_CONFIG && window.RB_CONFIG.firebase) || {};
  const builtIn = () => !!(built().apiKey && built().projectId);
  const fb = () => (builtIn() ? built() : readJSON(ONLINE_SETUP, {}));
  const online = () => !!(fb().apiKey && fb().projectId);

  let user = null;          // { uid, name, email, mode }
  let session = null;       // stored login (with tokens when online)

  const readJSON = (k, d) => { try { return JSON.parse(H.get(k)) || d; } catch (e) { return d; } };
  const writeJSON = (k, v) => H.set(k, JSON.stringify(v));

  function fail(text) { const e = new Error(text); e.friendly = true; throw e; }

  function validate({ name, email, password }, signup) {
    if (signup) {
      const n = (name || '').trim();
      if (n.length < 2 || n.length > 16) fail('Pick a codename of 2 to 16 characters.');
      if (!/^[\p{L}\p{N} _.-]+$/u.test(n)) fail('Codenames can use letters, numbers, spaces, dots, dashes and underscores.');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || '').trim()) && (signup || online())) fail('Enter a valid email address.');
    if (!password || password.length < (signup ? 8 : 1)) fail(signup ? 'Use a password of at least 8 characters.' : 'Enter your password.');
  }

  function start(u, extra) {
    user = u;
    session = Object.assign({ uid: u.uid, name: u.name, email: u.email, mode: u.mode }, extra || {});
    if (u.mode === 'cloud') session.projectId = fb().projectId;
    writeJSON(SESSION, session);
    H.useSave(`riftborn-save-${u.uid}`);
    adoptLegacySave();
    if (u.mode === 'local') H.set(LAST_LOCAL, u.uid);
    return user;
  }

  // Signing up online on a phone that already has an agent on a phone
  // account: bring that agent along instead of starting over.
  function moveLocalAgent() {
    if (H.loadSave()) return;
    const from = H.get(LAST_LOCAL);
    const db = localAccounts();
    const acct = from && db.users[from];
    const json = from && H.get(`riftborn-save-${from}`);
    if (!acct || !json || acct.movedTo) return;
    H.writeSave(json);
    acct.movedTo = user.uid;
    writeJSON(ACCOUNTS, db);
    moved = true;
  }
  let moved = false;

  // The first account on a phone takes over the agent from before accounts.
  function adoptLegacySave() {
    if (H.get(LEGACY_TAKEN) || H.loadSave()) return;
    const old = H.get(H.LEGACY_SAVE);
    if (!old) return;
    // Versions 1.3.x could leave a copy of an agent that had just logged
    // out here. That agent already has its account, so drop the copy.
    const born = (json) => { try { return JSON.parse(json).created || 0; } catch (e) { return 0; } };
    const b = born(old);
    const owned = Object.keys(localAccounts().users).some((uid) => uid !== user.uid && b && born(H.get(`riftborn-save-${uid}`)) === b);
    if (owned) { H.remove(H.LEGACY_SAVE); return; }
    H.writeSave(old);
    H.set(LEGACY_TAKEN, user.uid);
    adopted = true;
  }
  let adopted = false;

  /* ======================= On this device ======================= */

  async function hash(password, salt) {
    if (!window.crypto || !crypto.subtle) fail('Accounts need a secure (https) page.');
    const enc = new TextEncoder();
    const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations: 150000, hash: 'SHA-256' }, base, 256);
    return Array.from(new Uint8Array(bits), (b) => b.toString(16).padStart(2, '0')).join('');
  }

  const localAccounts = () => readJSON(ACCOUNTS, { users: {} });

  async function localSignUp({ name, email, password }) {
    const db = localAccounts();
    const em = (email || '').trim().toLowerCase();
    const nm = name.trim();
    for (const u of Object.values(db.users)) {
      if (u.email && u.email === em) fail('There is already an account with that email on this phone. Log in instead.');
      if (u.name.toLowerCase() === nm.toLowerCase()) fail('That codename is taken on this phone.');
    }
    const uid = `L${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
    db.users[uid] = { name: nm, email: em, salt, hash: await hash(password, salt), created: Date.now() };
    writeJSON(ACCOUNTS, db);
    return start({ uid, name: nm, email: em, mode: 'local' });
  }

  async function localLogIn({ email, password }) {
    const db = localAccounts();
    const id = (email || '').trim().toLowerCase();
    const entry = Object.entries(db.users).find(([, u]) => u.email === id || u.name.toLowerCase() === id);
    if (!entry) fail('No account with that email or codename on this phone.');
    const [uid, u] = entry;
    if (await hash(password, u.salt) !== u.hash) fail('Wrong password.');
    return start({ uid, name: u.name, email: u.email, mode: 'local' });
  }

  /* ======================= Online (Firebase) ======================= */

  const IDT = 'https://identitytoolkit.googleapis.com/v1/accounts';
  const docs = () => `https://firestore.googleapis.com/v1/projects/${fb().projectId}/databases/(default)/documents`;

  const MESSAGES = {
    EMAIL_EXISTS: 'There is already an account with that email. Log in instead.',
    INVALID_LOGIN_CREDENTIALS: 'Wrong email or password.',
    EMAIL_NOT_FOUND: 'No account with that email.',
    INVALID_PASSWORD: 'Wrong password.',
    INVALID_EMAIL: 'Enter a valid email address.',
    USER_DISABLED: 'This account has been turned off.',
    TOO_MANY_ATTEMPTS_TRY_LATER: 'Too many tries. Wait a few minutes and try again.',
    OPERATION_NOT_ALLOWED: 'Email sign-in is turned off for this game’s Firebase project.',
  };

  async function post(url, body) {
    let res;
    try {
      res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    } catch (e) {
      fail('Can’t reach the server. Check your internet connection.');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const code = ((data.error && data.error.message) || '').split(' ')[0].split(':')[0];
      fail(MESSAGES[code] || (code.startsWith('WEAK_PASSWORD') ? 'Use a stronger password (at least 8 characters).' : `Sign-in problem: ${(data.error && data.error.message) || res.status}`));
    }
    return data;
  }

  const tokens = (d) => ({ idToken: d.idToken || d.id_token, refreshToken: d.refreshToken || d.refresh_token, expires: Date.now() + (Number(d.expiresIn || d.expires_in || 3600) - 60) * 1000 });

  async function cloudSignUp({ name, email, password }) {
    const d = await post(`${IDT}:signUp?key=${fb().apiKey}`, { email: email.trim(), password, returnSecureToken: true });
    await post(`${IDT}:update?key=${fb().apiKey}`, { idToken: d.idToken, displayName: name.trim(), returnSecureToken: false });
    start({ uid: d.localId, name: name.trim(), email: d.email, mode: 'cloud' }, tokens(d));
    moveLocalAgent();
    return user;
  }

  async function cloudLogIn({ email, password }) {
    const d = await post(`${IDT}:signInWithPassword?key=${fb().apiKey}`, { email: email.trim(), password, returnSecureToken: true });
    return start({ uid: d.localId, name: d.displayName || email.split('@')[0], email: d.email, mode: 'cloud' }, tokens(d));
  }

  // A fresh ID token (they last an hour).
  async function idToken() {
    if (!session || session.mode !== 'cloud') return null;
    if (session.idToken && session.expires > Date.now()) return session.idToken;
    const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${fb().apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(session.refreshToken)}`,
    });
    if (!res.ok) {
      const e = new Error('refresh failed');
      e.status = res.status < 500 ? 401 : res.status;
      throw e;
    }
    Object.assign(session, tokens(await res.json()));
    writeJSON(SESSION, session);
    return session.idToken;
  }

  async function firestore(method, path, body) {
    const tok = await idToken();
    const res = await fetch(`${docs()}${path}`, {
      method,
      headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      const msg = (b.error && b.error.message) || '';
      // A missing document is fine; a missing database isn't.
      if (res.status === 404 && method === 'GET' && !/does not exist/i.test(msg)) return null;
      const e = new Error(msg || `Firestore ${res.status}`);
      e.status = res.status;
      throw e;
    }
    return res.json();
  }

  // What to tell you when the cloud refuses a save.
  function syncProblem(e) {
    if (/has not been used|is disabled/i.test(e.message)) return 'Firestore isn’t turned on for your Firebase project yet. Open Firestore Database in Firebase and tap Create database.';
    if (/does not exist/i.test(e.message)) return 'Your Firebase project has no Firestore database yet. Open Firestore Database in Firebase and tap Create database.';
    if (e.status === 403) return 'Your Firestore rules are blocking saves. Paste the Riftborn rules in Firebase → Firestore Database → Rules and tap Publish.';
    if (e.status === 401) return 'Your online login has run out. Log out and log in again.';
    return 'Couldn’t reach your online save. It will try again.';
  }
  let syncError = '';
  let syncNeedsFix = false;    // the project or login needs fixing (not just a weak signal)
  function syncFailed(e) {
    syncError = syncProblem(e);
    syncNeedsFix = [401, 403, 404].includes(e.status);
  }

  /* ======================= Cloud save & leaderboard ======================= */

  let pushTimer = null, pending = null;
  let lastSync = 0;

  // Online: send the save up (at most every 20 seconds).
  function queueSave(json) {
    if (!user || user.mode !== 'cloud') return;
    pending = json;
    if (pushTimer) return;
    pushTimer = setTimeout(flush, 20000);
  }

  async function flush() {
    clearTimeout(pushTimer);
    pushTimer = null;
    if (!pending || !user || user.mode !== 'cloud') return;
    const json = pending;
    pending = null;
    try {
      await firestore('PATCH', `/saves/${user.uid}`, { fields: { data: { stringValue: json }, updated: { integerValue: String(Date.now()) } } });
      lastSync = Date.now();
      syncError = '';
      syncNeedsFix = false;
    } catch (e) {
      pending = pending || json;   // try again next time
      syncFailed(e);
    }
  }

  // Online: the save stored with your account, if it's newer than this
  // phone's copy.
  async function pullSave(localUpdated) {
    if (!user || user.mode !== 'cloud') return null;
    try {
      const d = await firestore('GET', `/saves/${user.uid}`);
      if (!d || !d.fields) return null;
      const updated = Number(d.fields.updated.integerValue || 0);
      lastSync = Date.now();
      return updated > (localUpdated || 0) ? d.fields.data.stringValue : null;
    } catch (e) {
      syncFailed(e);
      return null;
    }
  }

  // Your public line on the leaderboard.
  async function publish(p) {
    if (!user) return;
    if (user.mode === 'local') {
      const db = localAccounts();
      if (db.users[user.uid]) { db.users[user.uid].profile = p; writeJSON(ACCOUNTS, db); }
      return;
    }
    try {
      await firestore('PATCH', `/agents/${user.uid}`, { fields: {
        name: { stringValue: p.name }, faction: { stringValue: p.faction },
        level: { integerValue: String(p.level) }, xp: { integerValue: String(p.xp) },
        updated: { integerValue: String(Date.now()) },
      } });
    } catch (e) { /* next time */ }
  }

  async function leaderboard() {
    if (!user) return [];
    if (user.mode === 'local') {
      return Object.entries(localAccounts().users).filter(([, u]) => u.profile)
        .map(([uid, u]) => Object.assign({ uid }, u.profile)).sort((a, b) => b.xp - a.xp).slice(0, 25);
    }
    const tok = await idToken();
    const res = await fetch(`${docs()}:runQuery`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'agents' }], orderBy: [{ field: { fieldPath: 'xp' }, direction: 'DESCENDING' }], limit: 25 } }),
    });
    if (!res.ok) {
      const e = new Error(`Leaderboard ${res.status}`);
      e.status = res.status;
      throw e;
    }
    const rows = await res.json();
    return rows.filter((r) => r.document).map((r) => {
      const f = r.document.fields;
      return { uid: r.document.name.split('/').pop(), name: f.name.stringValue, faction: f.faction.stringValue, level: Number(f.level.integerValue), xp: Number(f.xp.integerValue) };
    });
  }

  /* ======================= Online setup in the game ======================= */

  // Pull the Project ID and Web API key out of what was pasted: the two
  // values on their own (in either box), or Firebase's whole
  // firebaseConfig snippet. The Project ID may be left out: checkSetup
  // finds it from the key.
  function parseSetup(projectText, keyText) {
    const boxes = [projectText, keyText].map((t) => (t || '').trim());
    const all = boxes.join('\n');
    const apiKey = (/AIza[0-9A-Za-z_-]{35}/.exec(all) || [])[0] || '';
    if (!apiKey) fail('That doesn’t look like a Web API key. It starts with AIza and is 39 characters long.');
    const fromSnippet = (/projectId["']?\s*[:=]\s*["']([a-z0-9-]+)["']/.exec(all) || [])[1];
    const projectId = (fromSnippet || boxes.find((t) => t && !t.includes('AIza')) || '').toLowerCase();
    return { projectId, apiKey };
  }

  const PROJECT_ID = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;

  // Try the project out and say what's missing. Returns { ok, steps, cfg }:
  // each step is { ok, text }, and cfg carries the Project ID the key
  // belongs to.
  async function checkSetup(input) {
    const cfg = { apiKey: input.apiKey, projectId: input.projectId || '' };
    const steps = [];
    const say = (ok, text) => steps.push({ ok, text });
    const call = async (url, opts) => {
      const r = await fetch(url, opts);
      const b = await r.json().catch(() => ({}));
      return { status: r.status, body: b, msg: (b.error && b.error.message) || '' };
    };

    // 1. The key, and email sign-in (with an account that doesn't exist).
    let a;
    try {
      a = await call(`${IDT}:signInWithPassword?key=${cfg.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'setup-check@example.com', password: 'setup-check-only', returnSecureToken: true }),
      });
    } catch (e) {
      return { ok: false, steps: [{ ok: false, text: 'Can’t reach Firebase. Check your internet connection and try again.' }], cfg };
    }
    const m = a.msg;
    if (/API key not valid|API_KEY_INVALID/i.test(m)) say(false, 'The Web API key isn’t right. Copy it again from Project settings → General.');
    else if (/CONFIGURATION_NOT_FOUND|has not been used|is disabled/i.test(m)) say(false, 'Authentication isn’t set up yet. Open Authentication in Firebase and tap Get started.');
    else if (/OPERATION_NOT_ALLOWED|PASSWORD_LOGIN_DISABLED/.test(m)) say(false, 'Email sign-in is off. In Authentication → Sign-in method, turn on Email/Password and save.');
    else if (/INVALID_LOGIN_CREDENTIALS|EMAIL_NOT_FOUND|INVALID_PASSWORD|TOO_MANY_ATTEMPTS/.test(m)) say(true, 'Email sign-in works.');
    else if (/referer|referrer|blocked/i.test(m)) say(false, 'Your API key has restrictions that block Riftborn. Remove them in Google Cloud → APIs & Services → Credentials.');
    else say(false, `The sign-in check failed: ${m || `error ${a.status}`}`);

    // 2. Which project the key belongs to. Its sign-in domains include
    // <project>.firebaseapp.com and <project>.web.app.
    try {
      const p = await call(`https://identitytoolkit.googleapis.com/v1/projects?key=${cfg.apiKey}`);
      const ids = [...new Set((p.body.authorizedDomains || [])
        .map((d) => (/^([a-z0-9-]+)\.(firebaseapp\.com|web\.app)$/.exec(d) || [])[1]).filter(Boolean))];
      if (ids.length === 1 && ids[0] !== cfg.projectId) {
        if (cfg.projectId) say(true, `Your key belongs to the project ${ids[0]}, so Riftborn will use that.`);
        cfg.projectId = ids[0];
      }
    } catch (e) { /* go with what was typed */ }
    if (!PROJECT_ID.test(cfg.projectId)) {
      say(false, cfg.projectId
        ? 'That doesn’t look like a Project ID. Copy it from Project settings → General. It looks like riftborn-1a2b3.'
        : 'Enter the Project ID too. It’s in Project settings → General and looks like riftborn-1a2b3.');
      return { ok: false, steps, cfg };
    }

    // 3. The database and its rules. The Riftborn rules let anyone look up
    // setup/rules-v1 (nothing is stored there) and lock everything else.
    const base = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents`;
    try {
      const mark = await call(`${base}/setup/rules-v1`);
      if (/has not been used|is disabled/i.test(mark.msg)) say(false, 'Firestore isn’t turned on. Open Firestore Database in Firebase and tap Create database.');
      else if (/does not exist/i.test(mark.msg)) say(false, 'There’s no Firestore database yet. Open Firestore Database in Firebase and tap Create database.');
      else if (mark.status === 403 && /insufficient permissions/i.test(mark.msg)) say(false, 'The Riftborn rules aren’t published yet. Tap Copy rules, paste them over everything in Firestore Database → Rules and tap Publish. Then wait a minute and check again.');
      else if (mark.status === 404 && /not found/i.test(mark.msg)) {
        const probe = await call(`${base}/agents/setup-check`);
        if (probe.status === 403) say(true, 'The Firestore database is ready and locked with the Riftborn rules.');
        else say(false, 'Your database is open to anyone (test mode). Paste the Riftborn rules over everything in Firestore Database → Rules and tap Publish.');
      } else say(false, `Couldn’t find the project “${cfg.projectId}”. Check the Project ID.`);
    } catch (e) {
      say(false, 'Can’t reach Firestore. Check your internet connection and try again.');
    }
    return { ok: steps.every((x) => x.ok), steps, cfg };
  }

  // The phone agent that an online sign-up here would bring along.
  function movable() {
    if (!online()) return null;
    const from = H.get(LAST_LOCAL);
    const acct = from && localAccounts().users[from];
    if (!acct || acct.movedTo) return null;
    try {
      const s = JSON.parse(H.get(`riftborn-save-${from}`));
      return s && s.agent ? { name: s.agent.name, xp: s.agent.xp || 0 } : null;
    } catch (e) {
      return null;
    }
  }

  function saveSetup(cfg) { writeJSON(ONLINE_SETUP, cfg); }
  function clearSetup() { H.remove(ONLINE_SETUP); }

  /* ======================= Public ======================= */

  // The remembered login, if any.
  function restore() {
    const s = readJSON(SESSION, null);
    if (!s || !s.uid) return null;
    // Online accounts were turned off, or now use another Firebase project.
    if (s.mode === 'cloud' && (!online() || (s.projectId && s.projectId !== fb().projectId))) return null;
    session = s;
    user = { uid: s.uid, name: s.name, email: s.email, mode: s.mode };
    H.useSave(`riftborn-save-${s.uid}`);
    return user;
  }

  async function signUp(form) {
    validate(form, true);
    return online() ? cloudSignUp(form) : localSignUp(form);
  }

  async function logIn(form) {
    validate(form, false);
    return online() ? cloudLogIn(form) : localLogIn(form);
  }

  async function logOut() {
    await flush();
    H.remove(SESSION);
    user = null;
    session = null;
    H.useSave(null);
  }

  // Online: forget the cloud copy (when starting an agent over).
  async function dropSave() {
    pending = null;
    if (!user || user.mode !== 'cloud') return;
    try { await firestore('DELETE', `/saves/${user.uid}`); } catch (e) { /* ignore */ }
  }

  async function resetPassword(email) {
    if (!online()) fail('Accounts on this phone can’t reset passwords. Make a new account instead.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || '').trim())) fail('Enter your email address first.');
    await post(`${IDT}:sendOobCode?key=${fb().apiKey}`, { requestType: 'PASSWORD_RESET', email: email.trim() });
  }

  RB.auth = {
    online, builtIn, restore, signUp, logIn, logOut, resetPassword,
    parseSetup, checkSetup, saveSetup, clearSetup, movable,
    get projectId() { return fb().projectId || ''; },
    // The Firebase project pasted in the game, if any.
    get setup() { return builtIn() ? null : readJSON(ONLINE_SETUP, null); },
    get syncError() { return syncError; },
    get syncNeedsFix() { return syncNeedsFix; },
    // True once, right after a phone agent moved to a new online account.
    takeMoved() { const m = moved; moved = false; return m; },
    queueSave, flush, pullSave, dropSave, publish, leaderboard,
    get user() { return user; },
    get lastSync() { return lastSync; },
    // True once, right after an account took over the pre-accounts agent.
    takeAdopted() { const a = adopted; adopted = false; return a; },
  };
})(window.RB);
