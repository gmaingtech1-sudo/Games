// BODY.OS — shared core: event hub, the single game-state holder, and persistence.
// Systems change state and emit events; the UI listens and reads state. No UI keeps
// its own copy of game data.
import { host } from './host.js';
import { PRESETS, STATS, ITEMS } from './data.js';
import * as R from './rules.js';

// ---------------------------------------------------------------- Events
const listeners = {};
export const events = {
  on(name, fn) { (listeners[name] = listeners[name] || []).push(fn); },
  emit(name, a, b) { const l = listeners[name]; if (l) for (let i = 0; i < l.length; i++) l[i](a, b); },
};
export function notify(text, type = 'info') { events.emit('notice', text, type); }

// ---------------------------------------------------------------- Game holder
// Filled in by systems.js / main.js. Kept here so every module can import it.
export const G = {
  data: null,        // SaveData (authoritative progress)
  settings: null,    // GameSettings
  inGame: false,
  modal: [],         // open modal layers; gameplay pauses while non-empty
  player: null,
  flagSet: new Set(),
  get blocked() { return !this.inGame || this.modal.length > 0 || this.loading; },
  loading: false,
};

// ---------------------------------------------------------------- Save data
export const SAVE_VERSION = 1;
const SAVE_KEY = 'bodyos-save-v1';
const SETTINGS_KEY = 'bodyos-settings-v1';

export function newSave() {
  return {
    version: SAVE_VERSION,
    savedAt: '',
    playTime: 0,
    vitals: { health: 100, energy: 100, suit: 100 },
    progress: { level: 1, xp: 0, points: 1, discovered: [], fragments: [] },
    inventory: {},
    stats: R.defaults(),
    vision: 'normal',
    upgrades: {},
    slots: ['', ''],
    presets: PRESETS.map((p) => ({ ...p, stats: p.stats.slice() })),
    story: { flags: [], missions: {}, active: '', location: 'derelict', pos: null, log: [] },
  };
}

export function newSettings() {
  return {
    version: 1, master: 0.9, music: 0.6, sfx: 0.85, camSens: 1, joySens: 1,
    quality: 1, uiScale: 1, vibration: true, invert: false, fps: false,
  };
}

const num = (v, a, b, fb) => (Number.isFinite(+v) ? R.clamp(+v, a, b) : fb);
const strList = (l) => (Array.isArray(l) ? [...new Set(l.filter((x) => typeof x === 'string' && x))] : []);

/** Structural validation: merges onto defaults (so new optional fields never erase
 *  progress), clamps numbers and drops malformed entries. Rule-dependent checks
 *  (caps from upgrades) are applied later by the body system. */
export function validateSave(raw) {
  const d = newSave();
  if (!raw || typeof raw !== 'object') return d;
  d.version = SAVE_VERSION;
  d.savedAt = typeof raw.savedAt === 'string' ? raw.savedAt : '';
  d.playTime = num(raw.playTime, 0, 1e9, 0);
  const v = raw.vitals || {};
  d.vitals = { health: num(v.health, 1, 1000, 100), energy: num(v.energy, 0, 1000, 100), suit: num(v.suit, 0, 1000, 100) };
  const p = raw.progress || {};
  d.progress = {
    level: Math.round(num(p.level, 1, R.MAX_LEVEL, 1)), xp: Math.round(num(p.xp, 0, 1e7, 0)),
    points: Math.round(num(p.points, 0, 999, 1)), discovered: strList(p.discovered), fragments: strList(p.fragments),
  };
  if (raw.inventory && typeof raw.inventory === 'object')
    for (const [k, n] of Object.entries(raw.inventory)) if (ITEMS[k] && Number.isFinite(+n) && +n > 0) d.inventory[k] = Math.min(9999, Math.round(+n));
  d.stats = R.sanitize(raw.stats, () => R.MAX, 999, 999).values;
  if (typeof raw.vision === 'string') d.vision = raw.vision;
  if (raw.upgrades && typeof raw.upgrades === 'object')
    for (const [k, t] of Object.entries(raw.upgrades)) if (Number.isFinite(+t) && +t > 0) d.upgrades[k] = Math.round(+t);
  if (Array.isArray(raw.slots)) d.slots = [0, 1].map((i) => (typeof raw.slots[i] === 'string' ? raw.slots[i] : ''));
  if (Array.isArray(raw.presets)) {
    for (const rp of raw.presets) {
      if (!rp || typeof rp.id !== 'string') continue;
      const i = d.presets.findIndex((x) => x.id === rp.id);
      const fixed = { ...(i >= 0 ? d.presets[i] : {}), ...rp, stats: R.sanitize(rp.stats, () => R.MAX, 999, 999).values };
      if (i >= 0) d.presets[i] = fixed; else d.presets.push(fixed);
    }
  }
  const s = raw.story || {};
  d.story.flags = strList(s.flags);
  if (s.missions && typeof s.missions === 'object')
    for (const [k, m] of Object.entries(s.missions)) if (m && typeof m === 'object') d.story.missions[k] = { obj: Math.max(0, m.obj | 0), done: !!m.done };
  d.story.active = typeof s.active === 'string' ? s.active : '';
  d.story.location = typeof s.location === 'string' ? s.location : 'derelict';
  if (s.pos && [s.pos.x, s.pos.y, s.pos.z, s.pos.yaw].every((x) => Number.isFinite(+x)) && Math.abs(s.pos.y) < 500)
    d.story.pos = { x: +s.pos.x, y: +s.pos.y, z: +s.pos.z, yaw: +s.pos.yaw };
  d.story.log = Array.isArray(s.log) ? s.log.filter((x) => typeof x === 'string').slice(-40) : [];
  return d;
}

export function validateSettings(raw) {
  const s = newSettings();
  if (!raw || typeof raw !== 'object') return s;
  s.master = num(raw.master, 0, 1, s.master);
  s.music = num(raw.music, 0, 1, s.music);
  s.sfx = num(raw.sfx, 0, 1, s.sfx);
  s.camSens = num(raw.camSens, 0.2, 3, 1);
  s.joySens = num(raw.joySens, 0.5, 2, 1);
  s.quality = Math.round(num(raw.quality, 0, 2, 1));
  s.uiScale = num(raw.uiScale, 0.8, 1.3, 1);
  s.vibration = raw.vibration !== false;
  s.invert = raw.invert === true;
  s.fps = raw.fps === true;
  return s;
}

let lastSaveTime = 'never', lastSaveError = '';
export const saveInfo = () => ({ lastSaveTime, lastSaveError, version: SAVE_VERSION });

export function hasSave() { return !!(host.load(SAVE_KEY) || host.load(SAVE_KEY + '.bak')); }

/** Loads the save, falling back to the backup copy if the main one is unreadable. */
export function loadSave() {
  for (const key of [SAVE_KEY, SAVE_KEY + '.bak']) {
    const json = host.load(key);
    if (!json) continue;
    try {
      const raw = JSON.parse(json);
      if (raw && typeof raw === 'object') return validateSave(raw);
    } catch (e) {
      if (key === SAVE_KEY) host.write(SAVE_KEY + '.corrupt', json); // keep it for inspection
    }
  }
  return null;
}

export function writeSave(data) {
  try {
    data.version = SAVE_VERSION;
    data.savedAt = new Date().toISOString();
    const json = JSON.stringify(data);
    const prev = host.load(SAVE_KEY);
    if (prev) host.write(SAVE_KEY + '.bak', prev);
    host.write(SAVE_KEY, json);
    lastSaveTime = new Date().toLocaleTimeString();
    return true;
  } catch (e) {
    lastSaveError = String(e && e.message || e);
    return false;
  }
}

export function deleteSave() {
  const prev = host.load(SAVE_KEY);
  if (prev) host.write(SAVE_KEY + '.previous', prev); // last-resort recovery copy
  host.clear(SAVE_KEY);
  host.clear(SAVE_KEY + '.bak');
}

export function loadSettings() {
  try { return validateSettings(JSON.parse(host.load(SETTINGS_KEY) || 'null')); } catch (e) { return newSettings(); }
}
export function writeSettings(s) { host.write(SETTINGS_KEY, JSON.stringify(validateSettings(s))); }

export function vibrate(style = 'light') { if (G.settings && G.settings.vibration) host.haptic(style); }
export const statIndex = (id) => STATS.findIndex((s) => s.id === id);
