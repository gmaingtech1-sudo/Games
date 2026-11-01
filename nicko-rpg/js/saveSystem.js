// LocalStorage save system with slots, a version number, migrations and
// strict validation. Saves are plain JSON: nothing is ever evaluated as code.
// Corrupt or tampered data is repaired where possible, otherwise rejected.

import { defaultState, SAVE_VERSION, updateUnlocks } from './gameState.js';
import { CLASSES, MAX_LEVEL, xpToNext, skillPointsForLevel, computeStats, sanitizeName } from './character.js';
import { getItem, EQUIP_SLOTS } from './items.js';
import { SKILL_NODES, spentPoints } from './skillTree.js';
import { QUESTS, refreshQuests } from './quests.js';
import { BOSSES } from './bosses.js';
import { DUNGEONS } from './dungeons.js';
import { int, num, uid as makeUid, todayKey } from './utils.js';

export const SLOTS = [1, 2, 3];
const PREFIX = 'nickoRpg.save.';
const FORMAT = 'nicko-rpg-save';

/* Storage wrapper: falls back to memory if localStorage is blocked. */
const memory = new Map();
export const storage = {
  get(key) {
    try { return window.localStorage.getItem(key); } catch { return memory.has(key) ? memory.get(key) : null; }
  },
  set(key, value) {
    try { window.localStorage.setItem(key, value); return true; } catch { memory.set(key, value); return false; }
  },
  remove(key) {
    try { window.localStorage.removeItem(key); } catch { /* ignore */ }
    memory.delete(key);
  },
};

/* ---------------- Migrations ---------------- */
// Each entry upgrades a save from version N to N + 1.
export const MIGRATIONS = {
  // v1 (pre-release) stored potions as a counter and had no daily quests.
  1: (s) => {
    s.inventory = Array.isArray(s.inventory) ? s.inventory : [];
    const potions = int(s.player?.potions, 0, 0, 99);
    if (potions) s.inventory.push({ uid: makeUid(), id: 'smallHealthPotion', qty: Math.min(20, potions), plus: 0 });
    if (s.player) delete s.player.potions;
    s.daily = { date: todayKey(), quests: {} };
    s.version = 2;
    return s;
  },
};

export function migrate(raw) {
  let s = raw;
  let v = int(s.version, 1);
  if (v > SAVE_VERSION) throw new Error(`Save is from a newer version (${v}).`);
  while (v < SAVE_VERSION) {
    const m = MIGRATIONS[v];
    if (!m) throw new Error(`No migration from version ${v}.`);
    s = m(s);
    v = int(s.version, v + 1);
  }
  return s;
}

/* ---------------- Validation ---------------- */

function cleanInstance(raw, expectSlot) {
  if (!raw || typeof raw !== 'object') return null;
  const def = getItem(String(raw.id));
  if (!def) return null;
  if (expectSlot && def.slot !== expectSlot) return null;
  return {
    uid: typeof raw.uid === 'string' && raw.uid.length <= 64 ? raw.uid : makeUid(),
    id: def.id,
    qty: int(raw.qty, 1, 1, def.stack),
    plus: int(raw.plus, 0, 0, 5),
  };
}

/**
 * Build a valid state from untrusted data. Returns { state, warnings }.
 * Throws if the data is unusable (e.g. no valid character).
 */
export function validateState(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Save data is not an object.');
  const warnings = [];
  const s = defaultState();
  const rp = raw.player;
  if (!rp || typeof rp !== 'object' || !CLASSES[rp.classId]) throw new Error('Save has no valid character.');
  const p = {
    name: sanitizeName(rp.name) || 'Nicko',
    classId: rp.classId,
    level: int(rp.level, 1, 1, MAX_LEVEL),
    xp: 0, hp: 0, mp: 0,
    gold: int(rp.gold, 0, 0, 1e9),
    skillPoints: 0,
    skills: {},
    equipment: {},
  };
  p.xp = p.level >= MAX_LEVEL ? 0 : int(rp.xp, 0, 0, xpToNext(p.level) - 1);
  for (const slot of EQUIP_SLOTS) p.equipment[slot] = cleanInstance(rp.equipment?.[slot], slot);

  // Skills: only this class's nodes, ranks clamped, total points consistent with level.
  if (rp.skills && typeof rp.skills === 'object') {
    for (const [id, rank] of Object.entries(rp.skills)) {
      const n = SKILL_NODES[id];
      if (n && n.classId === p.classId) p.skills[id] = int(rank, 0, 0, n.maxRank);
      if (!p.skills[id]) delete p.skills[id];
    }
  }
  let earned = 0;
  for (let l = 2; l <= p.level; l++) earned += skillPointsForLevel(l);
  const spent = spentPoints(p);
  if (spent > earned) { warnings.push('Skill tree was reset (invalid point totals).'); p.skills = {}; }
  p.skillPoints = earned - spentPoints(p);
  const prereqBroken = Object.keys(p.skills).some((id) => SKILL_NODES[id].requires.some((r) => !p.skills[r]) || SKILL_NODES[id].level > p.level);
  if (prereqBroken) { warnings.push('Skill tree was reset (missing prerequisites).'); p.skills = {}; p.skillPoints = earned; }

  const st = computeStats(p);
  p.hp = int(rp.hp, st.maxHp, 0, st.maxHp);
  p.mp = int(rp.mp, st.maxMp, 0, st.maxMp);
  if (p.hp <= 0) p.hp = Math.max(1, Math.round(st.maxHp * 0.5));
  s.player = p;

  // Inventory
  const seen = new Set(Object.values(p.equipment).filter(Boolean).map((e) => e.uid));
  if (Array.isArray(raw.inventory)) {
    for (const r of raw.inventory.slice(0, 200)) {
      const inst = cleanInstance(r);
      if (!inst) { warnings.push('Removed an unknown item.'); continue; }
      if (seen.has(inst.uid)) inst.uid = makeUid();
      seen.add(inst.uid);
      s.inventory.push(inst);
    }
  }

  // Quests
  const statuses = new Set(['active', 'complete', 'claimed']);
  const cleanQuests = (src, kind) => {
    const out = {};
    if (!src || typeof src !== 'object') return out;
    for (const q of QUESTS) {
      if (q.kind === 'daily' ? kind !== 'daily' : kind === 'daily') continue;
      const e = src[q.id];
      if (!e || !statuses.has(e.status)) continue;
      out[q.id] = { status: e.status, progress: int(e.progress, 0, 0, q.objective.count || 1) };
    }
    return out;
  };
  s.quests = cleanQuests(raw.quests, 'story');
  const dailyDate = typeof raw.daily?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.daily.date) ? raw.daily.date : todayKey();
  s.daily = { date: dailyDate, quests: cleanQuests(raw.daily?.quests, 'daily') };

  // Bosses and locations
  for (const id of Object.keys(BOSSES)) {
    if (raw.bosses?.defeated?.[id] === true) s.bosses.defeated[id] = true;
    const a = int(raw.bosses?.attempts?.[id], 0, 0, 1e6);
    if (a) s.bosses.attempts[id] = a;
  }
  for (const d of DUNGEONS) {
    const n = int(raw.dungeons?.explored?.[d.id], 0, 0, 1e7);
    if (n) s.dungeons.explored[d.id] = n;
  }
  for (const k of Object.keys(s.stats)) s.stats[k] = int(raw.stats?.[k], 0, 0, 1e12);
  s.playTime = Math.max(0, num(raw.playTime, 0));
  s.createdAt = int(raw.createdAt, Date.now());
  updateUnlocks(s);
  refreshQuests(s);
  return { state: s, warnings };
}

/* ---------------- Slots ---------------- */

export function saveGame(state, slot) {
  if (!SLOTS.includes(slot)) return { ok: false, reason: 'Invalid slot.' };
  const envelope = {
    format: FORMAT,
    version: SAVE_VERSION,
    savedAt: Date.now(),
    summary: { name: state.player.name, classId: state.player.classId, level: state.player.level, playTime: Math.round(state.playTime) },
    state: { ...state, version: SAVE_VERSION },
  };
  let json;
  try { json = JSON.stringify(envelope); } catch (e) { return { ok: false, reason: 'Could not serialise save.' }; }
  const persisted = storage.set(PREFIX + slot, json);
  storage.set('nickoRpg.lastSlot', String(slot));
  return { ok: true, persisted };
}

/** Load a slot. Returns { ok, state?, warnings?, reason? }. Never throws. */
export function loadGame(slot) {
  const text = storage.get(PREFIX + slot);
  if (!text) return { ok: false, reason: 'empty' };
  try {
    const env = JSON.parse(text);
    if (!env || env.format !== FORMAT || typeof env.state !== 'object') throw new Error('Not a Nicko RPG save.');
    const migrated = migrate({ ...env.state, version: env.state.version ?? env.version });
    const { state, warnings } = validateState(migrated);
    return { ok: true, state, warnings, savedAt: int(env.savedAt, 0) };
  } catch (e) {
    return { ok: false, reason: 'corrupt', error: String(e.message || e) };
  }
}

/** Slot overview for the menus. */
export function listSlots() {
  return SLOTS.map((slot) => {
    const text = storage.get(PREFIX + slot);
    if (!text) return { slot, status: 'empty' };
    const res = loadGame(slot);
    if (!res.ok) return { slot, status: 'corrupt', error: res.error };
    const p = res.state.player;
    return { slot, status: 'ok', name: p.name, classId: p.classId, level: p.level, savedAt: res.savedAt, playTime: res.state.playTime };
  });
}

export function deleteSave(slot) {
  storage.remove(PREFIX + slot);
}

/** The most recently saved valid slot, for Continue. */
export function latestValidSlot() {
  const valid = listSlots().filter((s) => s.status === 'ok');
  if (!valid.length) return null;
  const last = int(storage.get('nickoRpg.lastSlot'), 0);
  const pref = valid.find((s) => s.slot === last);
  return (pref || valid.sort((a, b) => b.savedAt - a.savedAt)[0]).slot;
}
