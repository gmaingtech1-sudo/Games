/* Portal Hackers: Nexus — sign-up and log-in. Accounts live on this phone:
   each one has a username, a salted password hash (PBKDF2-SHA256 through
   WebCrypto) and its own save. Several people can have accounts on one
   phone. The phone remembers who's logged in until they log out.

   There's no server, so an account doesn't follow you to another phone. */
window.PH = window.PH || {};
(function (PH) {
  'use strict';

  const KEY = 'portal-hackers-accounts-v1';
  const SESSION = 'portal-hackers-session-v1';
  const LEGACY_SAVE = 'portal-hackers-save-v1';
  const ITERATIONS = 120000;

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
  };

  function list() {
    try {
      const a = JSON.parse(store.get(KEY) || '[]');
      return Array.isArray(a) ? a : [];
    } catch (e) {
      return [];
    }
  }

  const writeList = (a) => store.set(KEY, JSON.stringify(a));
  const norm = (u) => String(u || '').trim().toLowerCase();
  const find = (u) => list().find((a) => a.id === norm(u)) || null;
  const saveKey = (u) => `${LEGACY_SAVE}:${norm(u)}`;

  const hex = (buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');

  function salt() {
    const r = new Uint8Array(16);
    (window.crypto || window.msCrypto).getRandomValues(r);
    return hex(r);
  }

  // PBKDF2 where WebCrypto is available (https, localhost and the Android
  // app); a slow iterated hash elsewhere, so a password is never stored as is.
  async function hashPass(pass, s) {
    const subtle = window.crypto && window.crypto.subtle;
    if (subtle) {
      const enc = new TextEncoder();
      const key = await subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveBits']);
      const bits = await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(s), iterations: ITERATIONS }, key, 256);
      return `pbkdf2$${hex(bits)}`;
    }
    let h = `${s}:${pass}`;
    for (let i = 0; i < 2000; i++) h = PH.util.hash(h + i).toString(36) + h.slice(0, 64);
    return `fnv$${h.slice(0, 64)}`;
  }

  function checkName(u) {
    const t = String(u || '').trim();
    if (t.length < 3 || t.length > 16) return 'Usernames are 3 to 16 characters';
    if (!/^[A-Za-z0-9_-]+$/.test(t)) return 'Use letters, numbers, - and _ only';
    return null;
  }

  function checkPass(p) {
    if (String(p || '').length < 6) return 'Passwords need at least 6 characters';
    return null;
  }

  async function signUp(user, pass) {
    const bad = checkName(user) || checkPass(pass);
    if (bad) return { ok: false, error: bad };
    if (find(user)) return { ok: false, error: 'That username is taken on this phone. Log in instead?' };
    const s = salt();
    const acc = { id: norm(user), name: String(user).trim(), salt: s, hash: await hashPass(pass, s), created: Date.now(), last: Date.now() };
    const all = list();
    all.push(acc);
    if (!writeList(all)) return { ok: false, error: 'This browser won\'t let the game save. Turn off private browsing and try again.' };
    store.set(SESSION, acc.id);
    return { ok: true, account: acc };
  }

  async function logIn(user, pass) {
    const acc = find(user);
    if (!acc) return { ok: false, error: 'No account with that username on this phone' };
    const h = await hashPass(String(pass || ''), acc.salt);
    if (h !== acc.hash) return { ok: false, error: 'Wrong password' };
    const all = list();
    const me = all.find((a) => a.id === acc.id);
    me.last = Date.now();
    writeList(all);
    store.set(SESSION, acc.id);
    return { ok: true, account: me };
  }

  async function changePassword(user, oldPass, newPass) {
    const acc = find(user);
    if (!acc) return { ok: false, error: 'No such account' };
    if (await hashPass(String(oldPass || ''), acc.salt) !== acc.hash) return { ok: false, error: 'Your current password is wrong' };
    const bad = checkPass(newPass);
    if (bad) return { ok: false, error: bad };
    const all = list();
    const me = all.find((a) => a.id === acc.id);
    me.salt = salt();
    me.hash = await hashPass(newPass, me.salt);
    writeList(all);
    return { ok: true };
  }

  function current() {
    const id = store.get(SESSION);
    return id ? find(id) : null;
  }

  function logOut() { store.del(SESSION); }

  // Deletes the account and its save.
  function remove(user) {
    writeList(list().filter((a) => a.id !== norm(user)));
    store.del(saveKey(user));
    if (store.get(SESSION) === norm(user)) logOut();
  }

  // A hacker from before accounts existed, waiting to be claimed.
  function legacySave() {
    const raw = store.get(LEGACY_SAVE);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  function adoptLegacy(user) {
    const raw = store.get(LEGACY_SAVE);
    if (!raw) return;
    try {
      const s = JSON.parse(raw);
      s.name = String(user).trim();
      store.set(saveKey(user), JSON.stringify(s));
      store.del(LEGACY_SAVE);
    } catch (e) { /* leave it */ }
  }

  PH.accounts = { list, find, signUp, logIn, logOut, changePassword, current, remove, saveKey, checkName, checkPass, legacySave, adoptLegacy };
})(window.PH);
