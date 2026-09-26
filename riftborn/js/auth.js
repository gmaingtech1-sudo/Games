/* Riftborn — agent accounts: sign up, log in, log out, and keeping your
   progress with your account.

   Two back ends:
   - Online (when config.js has a Firebase project): email and password
     accounts through Firebase Authentication, your save stored in
     Firestore so it follows you to any phone, and a shared leaderboard.
     Uses Firebase's REST APIs directly, so no SDK is loaded.
   - On this device (no Firebase configured): accounts live on the phone,
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

  const fb = () => (window.RB_CONFIG && window.RB_CONFIG.firebase) || {};
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
    writeJSON(SESSION, session);
    H.useSave(`riftborn-save-${u.uid}`);
    adoptLegacySave();
    return user;
  }

  // The first account on a phone takes over the agent from before accounts.
  function adoptLegacySave() {
    if (H.get(LEGACY_TAKEN) || H.loadSave()) return;
    const old = H.get(H.LEGACY_SAVE);
    if (!old) return;
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
    return start({ uid: d.localId, name: name.trim(), email: d.email, mode: 'cloud' }, tokens(d));
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
    if (!res.ok) throw new Error('refresh failed');
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
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Firestore ${res.status}`);
    return res.json();
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
    } catch (e) {
      pending = pending || json;   // try again next time
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
    if (!res.ok) throw new Error(`Leaderboard ${res.status}`);
    const rows = await res.json();
    return rows.filter((r) => r.document).map((r) => {
      const f = r.document.fields;
      return { uid: r.document.name.split('/').pop(), name: f.name.stringValue, faction: f.faction.stringValue, level: Number(f.level.integerValue), xp: Number(f.xp.integerValue) };
    });
  }

  /* ======================= Public ======================= */

  // The remembered login, if any.
  function restore() {
    const s = readJSON(SESSION, null);
    if (!s || !s.uid) return null;
    if (s.mode === 'cloud' && !online()) return null;   // the build changed
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
    H.useSave(H.LEGACY_SAVE);
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
    online, restore, signUp, logIn, logOut, resetPassword,
    queueSave, flush, pullSave, dropSave, publish, leaderboard,
    get user() { return user; },
    get lastSync() { return lastSync; },
    // True once, right after an account took over the pre-accounts agent.
    takeAdopted() { const a = adopted; adopted = false; return a; },
  };
})(window.RB);
