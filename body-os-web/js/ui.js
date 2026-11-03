// BODY.OS — user interface (DOM). Reads state from the systems and listens to events;
// it never keeps its own copy of game data. Every modal layer blocks touches to the
// game underneath and pauses gameplay (G.modal).
import * as THREE from 'three';
import { G, events, notify, saveInfo, hasSave, loadSave, writeSettings, vibrate } from './core.js';
import { host } from './host.js';
import { STATS, VISION, UPGRADES, UPGRADE_CATS, LOCATIONS, MISSIONS, ITEMS } from './data.js';
import * as R from './rules.js';
import {
  Body, Vitals, Vision, Environment, Upgrades, Reality, Missions, Progression, Inventory, Presets, Threats,
  visionInfo, loc, upgradeDef, itemName, coldSeverity, toxicSeverity, atmoName, save, hasFlag, setFlag, world,
} from './systems.js';
import { input, joystick, attachLook, pressButton } from './input.js';
import { sfx, applyVolumes } from './audio.js';
import { SCAN_COLORS, W, applyQuality } from './world.js';

// ---------------------------------------------------------------- DOM helpers
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) el.append(k.nodeType ? k : document.createTextNode(String(k)));
  return el;
}
const $ = (sel) => document.querySelector(sel);
function btn(label, fn, style = 'secondary', extra = {}) {
  return h('button', { class: 'btn ' + style + (extra.cls ? ' ' + extra.cls : ''), type: 'button', disabled: extra.disabled || false,
    onclick: (e) => { e.stopPropagation(); sfx(style === 'ghost' ? 'back' : 'click'); fn && fn(); } }, label);
}
function bar(frac, color) {
  const fill = h('i', { style: `width:${Math.max(0, Math.min(1, frac)) * 100}%;background:${color}` });
  return h('div', { class: 'bar' }, fill);
}
const kv = (k, v, cls = '') => h('div', { class: 'kv' }, h('span', { text: k }), h('b', { class: cls, text: v }));
const card = (...kids) => h('div', { class: 'card' }, ...kids);
const chip = (text, cls) => h('span', { class: 'chip ' + cls, text });
const para = (text, cls = '') => h('p', { class: 'para ' + cls, text });
const fmt = (n, d = 2) => (n >= 0 ? '+' : '') + n.toFixed(d);

// ---------------------------------------------------------------- Modal layers
const layers = [];
function pushLayer(id, close) {
  layers.push({ id, close });
  G.modal.push(id);
  input.reset();
  host.overlay(true);
}
function popLayer(id) {
  const i = layers.findIndex((l) => l.id === id);
  if (i >= 0) layers.splice(i, 1);
  const j = G.modal.indexOf(id);
  if (j >= 0) G.modal.splice(j, 1);
  input.reset();
  host.overlay(layers.length > 0 || G.inGame);
}
let modalId = 0;
function modal(cls, onClose) {
  const id = 'modal' + (++modalId);
  const win = h('div', { class: 'window ' + (cls || '') });
  const back = h('div', { class: 'modal' }, win);
  $('#layers').append(back);
  let closed = false;
  const close = () => { if (closed) return; closed = true; popLayer(id); back.remove(); onClose && onClose(); };
  pushLayer(id, close);
  return { win, close };
}

export const UI = {
  init, back, fade, showHud, hideHud, showMainMenu, hideMainMenu, openOS, closeOS, showScan, dialog, confirm, transmission, calibration, closeAll,
};

// ---------------------------------------------------------------- Init
let hud = {};
function init() {
  buildHud();
  buildOS();
  events.on('notice', toast);
  events.on('vitals', refreshVitals);
  events.on('progression', () => { refreshLevel(); osDirty(); });
  events.on('mission', () => { refreshMission(); osDirty(); });
  events.on('abilities', () => { refreshSlots(); osDirty(); });
  events.on('stats', osDirty);
  events.on('inventory', () => { refreshLevel(); osDirty(); });
  events.on('environment', osDirty);
  events.on('vision', () => { refreshVision(); osDirty(); });
  events.on('missionComplete', (m) => dialog('MISSION COMPLETE: ' + m.title,
    m.summary + '\n\nREWARDS\n+' + m.xp + ' XP' + (m.points ? '\n+' + m.points + ' upgrade points' : '') + (m.nanites ? '\n+' + m.nanites + ' nanite shards' : ''),
    [{ label: 'CONTINUE', style: 'primary' }]));
  events.on('damage', () => fx('flash', 'rgba(255,40,60,.45)'));
  events.on('realityFx', (def) => fx('flash', def.color + '88'));
  events.on('flash', (c) => fx('flash', c + '66'));
  input.onKey = (code) => {
    if (code === 'Escape') back();
    if (G.blocked) return;
    if (code === 'Space') input.queueJump();
    if (code === 'KeyE') input.queueInteract();
    if (code === 'KeyQ') Vision.cycle();
    if (code === 'Tab') openOS(-1);
  };
  applyUiScale();
}

export function applyUiScale() {
  const s = G.settings ? G.settings.uiScale : 1;
  // Base unit scales with the short side so text stays readable on every phone.
  const base = Math.max(12, Math.min(22, Math.min(window.innerWidth, window.innerHeight) / 34));
  document.documentElement.style.setProperty('--u', (base * s).toFixed(2) + 'px');
}
window.addEventListener('resize', applyUiScale);

/** Android Back / Escape: close the top layer, or pause. */
function back() {
  if (layers.length) { layers[layers.length - 1].close(); return; }
  if (G.inGame && !G.loading) openPause();
  else if (!G.inGame) host.quit();
}
function closeAll() { for (let g = 0; g < 20 && layers.length; g++) layers[layers.length - 1].close(); }

function fade(on) { $('#fade').classList.toggle('on', on); }

// ---------------------------------------------------------------- FX overlay
const TINTS = { normal: 'transparent', night: 'rgba(40,255,90,.17)', scanner: 'rgba(20,200,255,.08)', thermal: 'rgba(30,10,80,.12)', dimensional: 'rgba(140,50,255,.17)' };
let flashTimer = 0;
function fx(kind, color) {
  if (kind === 'flash') {
    const f = $('#fx-flash');
    f.style.transition = 'none'; f.style.background = color; f.style.opacity = '1';
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { f.style.transition = 'opacity .45s'; f.style.opacity = '0'; }, 30);
  }
}
function refreshVision() {
  const m = Vision.current;
  $('#fx-tint').style.background = TINTS[m];
  const lines = $('#fx-lines');
  lines.className = 'fx-lines ' + m;
  if (hud.visionLabel) hud.visionLabel.textContent = m === 'normal' ? 'VISION' : visionInfo(m).name.replace(' VISION', '');
}

// ---------------------------------------------------------------- Notifications
const toastQueue = [];
export const history = [];
function toast(text, type) {
  history.push(new Date().toLocaleTimeString() + '  ' + text);
  if (history.length > 30) history.shift();
  toastQueue.push([text, type]);
  while (toastQueue.length > 6) toastQueue.shift();
  pumpToasts();
}
function pumpToasts() {
  const box = $('#toasts');
  while (toastQueue.length && box.children.length < 4) {
    const [text, type] = toastQueue.shift();
    const t = h('div', { class: 'toast ' + type, text });
    box.append(t);
    const life = type === 'story' ? 9000 : type === 'danger' ? 5000 : 3800;
    setTimeout(() => { t.classList.add('out'); setTimeout(() => { t.remove(); pumpToasts(); }, 350); }, life);
  }
}

// ---------------------------------------------------------------- HUD
function buildHud() {
  const root = $('#hud');
  const look = h('div', { class: 'look-zone' });
  const joyBase = h('div', { class: 'joy-base' }, h('div', { class: 'joy-knob' }));
  const joyZone = h('div', { class: 'joy-zone' }, joyBase);
  attachLook(look);
  joystick.attach(joyZone, joyBase, joyBase.firstChild);

  hud.hp = h('i'); hud.en = h('i'); hud.suit = h('i');
  hud.hpText = h('b'); hud.enText = h('b'); hud.suitText = h('b');
  hud.suitRow = h('div', { class: 'vrow suit' }, h('span', { text: 'SUIT' }), h('div', { class: 'bar' }, hud.suit), hud.suitText);
  hud.level = h('div', { class: 'vlevel' });
  const vitals = h('div', { class: 'panel vitals' },
    h('div', { class: 'vrow hp' }, h('span', { text: 'HP' }), h('div', { class: 'bar' }, hud.hp), hud.hpText),
    h('div', { class: 'vrow en' }, h('span', { text: 'EN' }), h('div', { class: 'bar' }, hud.en), hud.enText),
    hud.suitRow, hud.level);
  hud.warn = h('div', { class: 'warning', hidden: true });
  hud.objTitle = h('div', { class: 'obj-title' }); hud.objText = h('div', { class: 'obj-text' }); hud.objHint = h('div', { class: 'obj-hint' });
  const objective = h('div', { class: 'panel objective' }, hud.objTitle, hud.objText, hud.objHint);
  const top = h('div', { class: 'top-right' },
    btn('BODY.OS', () => openOS(-1), 'primary', { cls: 'os-btn' }),
    btn('II', openPause, 'secondary', { cls: 'pause-btn' }));
  hud.fps = h('div', { class: 'fps' });

  const round = (cls, label) => h('div', { class: 'rbtn ' + cls }, h('span', { text: label }));
  const jump = round('jump', 'JUMP'); pressButton(jump, () => input.queueJump());
  hud.use = round('use', 'USE'); pressButton(hud.use, () => input.queueInteract());
  hud.vision = round('vision', 'VISION'); hud.visionLabel = hud.vision.firstChild; pressButton(hud.vision, () => { if (!G.blocked) Vision.cycle(); });
  hud.slots = [0, 1].map((i) => {
    const el = round('slot slot' + i, '');
    el.append(h('div', { class: 'cool' }));
    pressButton(el, () => { const id = G.data && G.data.slots[i]; if (id && !G.blocked) Reality.activate(id); });
    return el;
  });
  hud.prompt = h('div', { class: 'prompt' });
  hud.threat = h('div', { class: 'threat' }, h('div', { class: 'arrow' }), h('div', { class: 'tlabel' }));
  hud.scanRing = h('div', { class: 'scan-ring' }, h('div', { class: 'scan-label' }));
  hud.scanCard = h('div', { class: 'panel scan-card' });
  hud.markers = h('div', { class: 'markers' });
  hud.markerEls = [];
  for (let i = 0; i < 8; i++) { const m = h('div', { class: 'marker' }, h('i'), h('span')); hud.markers.append(m); hud.markerEls.push(m); }
  root.append(look, joyZone, hud.markers, vitals, hud.warn, objective, top, hud.fps, jump, hud.use, hud.vision, ...hud.slots, hud.prompt, hud.threat, hud.scanRing, hud.scanCard);
}

function showHud() { $('#hud').hidden = false; refreshVitals(); refreshLevel(); refreshMission(); refreshSlots(); refreshVision(); host.overlay(true); }
function hideHud() { $('#hud').hidden = true; }

let lastHp = -1, lastEn = -1;
function refreshVitals() {
  if (!G.data) return;
  hud.hp.style.width = (Vitals.health / Vitals.maxHealth * 100) + '%';
  hud.en.style.width = (Vitals.fraction * 100) + '%';
  hud.en.classList.toggle('low', Vitals.low);
  hud.suit.style.width = (Vitals.suit / Vitals.maxSuit * 100) + '%';
  const hp = Math.ceil(Vitals.health), en = Math.floor(Vitals.energy);
  if (hp !== lastHp) { lastHp = hp; hud.hpText.textContent = hp; }
  if (en !== lastEn) { lastEn = en; hud.enText.textContent = en + '/' + Math.round(Vitals.maxEnergy); }
  hud.suitText.textContent = Math.round(Vitals.suit);
  hud.suitRow.hidden = !(Vitals.suit < Vitals.maxSuit - 0.5 || Environment.hazardous);
}
function refreshLevel() {
  if (!G.data) return;
  hud.level.textContent = 'LV ' + Progression.level + '  XP ' + Progression.xp + '/' + Progression.toNext + '  PTS ' + Progression.points + '  NANITES ' + Inventory.count('nanites');
}
function refreshMission() {
  if (!G.data) return;
  const m = Missions.active, o = Missions.objective;
  if (!m || !o) { hud.objTitle.textContent = 'NO ACTIVE MISSION'; hud.objText.textContent = 'Explore THE DERELICT.'; hud.objHint.textContent = ''; return; }
  hud.objTitle.textContent = m.title + '  ' + (Missions.state(m.id).obj + 1) + '/' + m.objectives.length;
  hud.objText.textContent = o.text;
  hud.objHint.textContent = Missions.hint && o.hint ? 'Hint: ' + o.hint : '';
}
function refreshSlots() {
  if (!G.data) return;
  hud.slots.forEach((el, i) => {
    const id = G.data.slots[i], r = id && Reality.get(id);
    const show = !!r && Reality.unlocked(id);
    el.hidden = !show;
    if (show) el.firstChild.textContent = r.def.short;
  });
}
function showScan(title, text) {
  const c = hud.scanCard;
  c.replaceChildren(h('div', { class: 'scan-title', text: 'ANALYSIS: ' + title }), h('div', { class: 'scan-text', text }), btn('DISMISS', () => { c.classList.remove('on'); }, 'ghost'));
  c.classList.add('on');
  clearTimeout(c._t);
  c._t = setTimeout(() => c.classList.remove('on'), 9000);
}

function warningText() {
  const E = Environment, pct = Math.round(Vitals.suit / Vitals.maxSuit * 100);
  if (E.damaging) return ['SUIT DEPLETED // TAKING DAMAGE', 'danger'];
  if (E.deficit) return [(E.radD ? 'RADIATION' : E.toxic ? 'TOXIC ATMOSPHERE' : 'EXTREME COLD') + ' // SUIT ' + pct + '%', 'danger'];
  if (Vitals.critical) return ['CRITICAL ENERGY // LOW POWER MODE', 'danger'];
  if (Vitals.low) return ['LOW ENERGY', 'warning'];
  if (coldSeverity(E.cond) > 0) return ['COLD: HEATING DRAIN ACTIVE', 'cold'];
  return ['', ''];
}

let lastPrompt = null, fpsFrames = 0, fpsTime = 0, markerTimer = 0;
const pv = new THREE.Vector3();
/** Per-frame HUD work that depends on the player (prompt, scan, threat, markers). */
export function updateHud(dt, interactor) {
  if (!G.inGame || !G.player) return;
  const label = interactor.label;
  const key = label + '|' + (interactor.focus ? interactor.focus.id + interactor.focus.scanned() : '');
  if (key !== lastPrompt) {
    lastPrompt = key;
    const f = interactor.focus;
    hud.use.firstChild.textContent = label || 'USE';
    hud.use.classList.toggle('ready', !!f || interactor.scanning);
    hud.prompt.hidden = !f;
    if (f) hud.prompt.textContent = f.name + (Vision.current === 'scanner' && f.scanText ? (f.scanned() ? '  [analysed]' : '  [scan available]') : '');
  }
  hud.scanRing.classList.toggle('on', interactor.scanning);
  if (interactor.scanning) {
    const p = interactor.progress;
    hud.scanRing.style.setProperty('--p', (p * 360).toFixed(0) + 'deg');
    hud.scanRing.firstChild.textContent = 'ANALYSING ' + Math.round(p * 100) + '%';
  }
  const t = Threats.nearest;
  hud.threat.classList.toggle('on', !!t);
  if (t) {
    const dir = Body.threatDirection, arrow = hud.threat.firstChild;
    arrow.hidden = !dir;
    if (dir) {
      // Angle of the threat relative to the camera's facing.
      const yaw = G.player.camYaw, fx = Math.sin(yaw), fz = Math.cos(yaw);
      const fwd = Threats.dirX * fx + Threats.dirZ * fz, right = Threats.dirX * -fz + Threats.dirZ * fx;
      const a = Math.atan2(right, fwd);
      arrow.style.transform = `rotate(${a}rad) translateY(calc(var(--u) * -8))`;
    }
    hud.threat.lastChild.textContent = 'HOSTILE  ' + Math.round(Threats.distance) + ' m' + (dir ? '' : '  (direction unknown)');
  }
  const [w, wc] = warningText();
  if (hud.warn.textContent !== w) { hud.warn.textContent = w; hud.warn.className = 'warning ' + wc; hud.warn.hidden = !w; }
  hud.slots.forEach((el, i) => {
    if (el.hidden) return;
    const r = Reality.get(G.data.slots[i]);
    if (!r) return;
    el.classList.toggle('active', r.active > 0);
    el.lastChild.style.setProperty('--p', ((r.active > 0 ? 0 : r.cooldown / r.def.cd) * 360).toFixed(0) + 'deg');
  });
  // Scanner markers.
  const scanner = Vision.current === 'scanner';
  markerTimer -= dt;
  if (scanner && markerTimer <= 0) {
    markerTimer = 0.25;
    const p = G.player.pos, range = Vision.scanRange;
    const list = world.interactables.filter((e) => e.available() && (e.pos.x - p.x) ** 2 + (e.pos.z - p.z) ** 2 < range * range)
      .sort((a, b) => ((a.pos.x - p.x) ** 2 + (a.pos.z - p.z) ** 2) - ((b.pos.x - p.x) ** 2 + (b.pos.z - p.z) ** 2)).slice(0, 8);
    hud.markerEls.forEach((m, i) => {
      const e = list[i];
      m._e = e;
      if (!e) return;
      const c = SCAN_COLORS[(e.target && e.target.scan) || 'interact'];
      m.style.color = c;
      m.lastChild.textContent = e.name + (e.scanText && !e.scanned() ? '  ?' : '');
    });
  }
  const cam = W.camera, ww = window.innerWidth, hh = window.innerHeight;
  for (const m of hud.markerEls) {
    const e = scanner && m._e;
    if (!e) { m.style.display = 'none'; continue; }
    const v = pv.set(e.pos.x, e.pos.y + 0.4, e.pos.z).project(cam);
    if (v.z > 1 || v.z < -1) { m.style.display = 'none'; continue; }
    m.style.display = '';
    m.style.transform = `translate(${((v.x + 1) / 2 * ww).toFixed(0)}px, ${((1 - v.y) / 2 * hh).toFixed(0)}px)`;
  }
  if (G.settings.fps) {
    fpsFrames++; fpsTime += dt;
    if (fpsTime >= 0.5) { hud.fps.textContent = Math.round(fpsFrames / fpsTime) + ' FPS'; fpsFrames = 0; fpsTime = 0; }
  } else if (hud.fps.textContent) hud.fps.textContent = '';
}

// ---------------------------------------------------------------- BODY.OS menu
const SECTIONS = [
  ['DASHBOARD', 'System overview. Every BODY.OS setting has a real effect on your body and the world.', dashboard],
  ['BODY', 'Reconfigure musculature and actuators. Attributes share a bio-allocation budget; values above 5 add overclock energy drain.', (c) => statPanel(c, 'body')],
  ['BRAIN', 'Tune cognitive subsystems (fictional game mechanics). Attributes share a neural-allocation budget.', (c) => statPanel(c, 'brain')],
  ['SENSES', 'Select a vision mode. Modes cost energy per second (reduced by Endurance). Expensive modes shut off below 20% energy.', senses],
  ['ENVIRONMENT', 'Conditions where you stand, compared with your protection. Values and effects are fictional game mechanics.', environment],
  ['TECHNOLOGY', 'Install upgrades with upgrade points (from levels and missions) and nanite shards. Some need schematics from upgrade terminals.', technology],
  ['REALITY', 'Controlled reality manipulation. Each ability has an energy cost, duration and cooldown, and needs at least 20% energy.', reality],
  ['CONFIGURATIONS', 'Presets store all eleven attributes plus a vision mode. Loading is checked against your current caps, budgets and unlocks.', configurations],
  ['CHARACTER STATUS', 'Subject 7. All values are read live from BODY.OS systems.', status],
  ['DIAGNOSTICS', 'Where your energy goes, how the device is performing, and save-data status.', diagnostics],
];
let os = {}, section = 0, dirty = false, statUi = null;

function buildOS() {
  const tabs = h('nav', { class: 'os-tabs' });
  os.tabs = SECTIONS.map(([name], i) => { const b = btn(name, () => select(i), 'tab'); tabs.append(b); return b; });
  os.title = h('h2'); os.sub = h('p', { class: 'os-sub' });
  os.content = h('div', { class: 'os-content' });
  os.status = h('div', { class: 'os-status' });
  os.root = h('div', { class: 'os', hidden: true },
    h('header', { class: 'os-head' }, h('div', { class: 'logo' }, 'BODY.OS', h('small', { text: 'v7.3 // SUBJECT 7 // INTEGRATION 100%' })), os.status, btn('×', closeOS, 'secondary', { cls: 'close' })),
    tabs,
    h('section', { class: 'os-main' }, h('div', { class: 'os-title' }, os.title, os.sub), os.content));
  $('#menus').append(os.root);
}
function osDirty() { if (!os.root.hidden) dirty = true; }
export function tickUi() {
  if (dirty) { dirty = false; renderSection(false); }
}
function openOS(sec) {
  if (!G.inGame || G.loading) return;
  if (os.root.hidden) {
    os.root.hidden = false;
    pushLayer('os', closeOS);
    sfx('osOpen');
    setFlag('os.opened');
  }
  select(sec >= 0 ? sec : section);
}
function closeOS() {
  if (os.root.hidden) return;
  os.root.hidden = true;
  statUi = null;
  popLayer('os');
  sfx('osClose');
  save(false);
}
function select(i) {
  section = i;
  os.tabs.forEach((b, k) => b.classList.toggle('sel', k === i));
  os.title.textContent = SECTIONS[i][0];
  os.sub.textContent = SECTIONS[i][1];
  statUi = null;
  renderSection(true);
  os.content.scrollTop = 0;
  setFlag('os.section.' + i);
}
function renderSection(full) {
  os.status.textContent = 'HP ' + Math.ceil(Vitals.health) + '   EN ' + Math.floor(Vitals.energy) + '/' + Math.round(Vitals.maxEnergy) + '   LV ' + Progression.level + '   PTS ' + Progression.points;
  if (statUi && !full) { statUi.update(); return; }
  const scroll = os.content.scrollTop;
  os.content.replaceChildren();
  SECTIONS[section][2](os.content);
  if (!full) os.content.scrollTop = scroll;
}

function dashboard(c) {
  const b = Vitals.breakdown;
  c.append(card(h('h3', { text: 'VITALS' }),
    kv('Health', Math.ceil(Vitals.health) + ' / ' + Math.round(Vitals.maxHealth), 'hp'), bar(Vitals.health / Vitals.maxHealth, 'var(--hp)'),
    kv('Energy', Math.floor(Vitals.energy) + ' / ' + Math.round(Vitals.maxEnergy), 'en'), bar(Vitals.fraction, 'var(--accent)'),
    kv('Suit reserve', Math.round(Vitals.suit) + ' / ' + Math.round(Vitals.maxSuit), 'suit'), bar(Vitals.suit / Vitals.maxSuit, 'var(--suit)'),
    kv('Energy flow', fmt(b.net) + ' /s  (regen ' + b.regen.toFixed(2) + ', drain ' + b.drain.toFixed(2) + ')', b.net >= 0 ? 'ok' : 'warn')));
  const vis = card(h('h3', { text: 'VISION' }));
  const row = h('div', { class: 'row wrap' });
  for (const v of VISION) {
    const unlocked = Vision.unlocked(v.id);
    row.append(btn(v.name + (unlocked ? '' : ' (LOCKED)'), () => Vision.set(v.id), Vision.current === v.id ? 'primary' : 'secondary', { disabled: !unlocked }));
  }
  vis.append(row, para(Vision.info.desc + '  Drain ' + Vision.drain.toFixed(1) + '/s.'));
  c.append(vis);
  const m = Missions.active, o = Missions.objective;
  c.append(card(h('h3', { text: 'CURRENT MISSION' }), m && o ? [h('div', { class: 'big', text: m.title }), para(o.text, 'bright'), Missions.hint && o.hint ? para('Hint: ' + o.hint) : null] : para('No active mission. Explore the ship.')));
  const inv = card(h('h3', { text: 'SUPPLIES' }), kv('Nanite shards', Inventory.count('nanites')), kv('Upgrade points', Progression.points));
  for (const id of ['energy_capsule', 'medigel']) {
    const n = Inventory.count(id);
    inv.append(h('div', { class: 'row' }, h('span', { class: 'grow', text: itemName(id) + '  x' + n }), btn('USE', () => Inventory.use(id), 'secondary', { disabled: n <= 0 })));
  }
  for (const id of ['power_cell', 'phase_core']) if (Inventory.count(id)) inv.append(kv(itemName(id), 'x' + Inventory.count(id), 'warn'));
  c.append(inv);
  const nav = card(h('h3', { text: 'NAVIGATION' }));
  for (const l of LOCATIONS.filter((x) => x.dest)) {
    const cur = G.data.story.location === l.id;
    nav.append(h('div', { class: 'row' }, h('b', { class: 'grow' + (l.playable ? '' : ' muted'), text: l.name }), chip(cur ? 'CURRENT LOCATION' : l.playable ? 'AVAILABLE' : 'LOCKED', cur ? 'ok' : l.playable ? 'accent' : 'muted')),
      para(l.desc + (l.playable ? '' : '  ' + l.locked), 'small'));
  }
  c.append(nav);
}

function statPanel(c, pool) {
  const head = card();
  const budgetText = h('h3'), budgetBar = h('i');
  head.append(budgetText, h('div', { class: 'bar' }, budgetBar), para(pool === 'body'
    ? 'Raising one attribute uses free allocation. When full, lower another attribute first. Technology upgrades raise caps and the budget.'
    : 'Brain attributes unlock and improve mechanics: calibrations, scanning, memory recovery, threat detection and analysis.'));
  c.append(head);
  const rows = [];
  let lastDeny = 0;
  STATS.forEach((s, i) => {
    if (!(s.pool === pool || (pool === 'body' && s.pool === 'none'))) return;
    const value = h('b', { class: 'accent' }), effect = para('', 'effect');
    const range = h('input', { type: 'range', min: R.MIN, max: R.MAX, step: 1, class: 'slider ' + (s.pool === 'none' ? 'amber' : pool) });
    const set = (v) => {
      v = Math.max(R.MIN, Math.min(R.MAX, v));
      if (v === Body.get(i)) { update(); return; }
      let why = Body.trySet(i, v);
      if (why) {
        const legal = Math.max(R.MIN, Math.min(v, Body.maxSettable(i)));
        if (legal !== Body.get(i) && !Body.trySet(i, legal)) why = null;
        if (why && performance.now() - lastDeny > 1200) { lastDeny = performance.now(); sfx('denied'); notify(why, 'warning'); }
      } else sfx('click');
      update();
    };
    range.addEventListener('input', () => set(+range.value));
    c.append(card(h('div', { class: 'row' }, h('b', { class: 'grow big', text: s.name.toUpperCase() }), value),
      h('div', { class: 'slider-row' }, btn('−', () => set(Body.get(i) - 1)), range, btn('+', () => set(Body.get(i) + 1))),
      effect, para(s.desc, 'small muted')));
    rows.push({ i, range, value, effect });
  });
  const foot = para('');
  c.append(card(foot, h('div', { class: 'row' },
    btn('RESET TO BALANCED', () => confirm('RECALIBRATE', 'Reset all body and brain attributes to the balanced default (5)?', 'RESET', () => Body.reset())),
    btn('PRESETS', () => select(7), 'ghost'))));
  function update() {
    const used = Body.used(pool), budget = Body.budget(pool);
    budgetText.textContent = (pool === 'body' ? 'BIO-ALLOCATION  ' : 'NEURAL ALLOCATION  ') + used + ' / ' + budget + '   (' + Math.max(0, budget - used) + ' free)';
    budgetBar.style.width = Math.min(100, used / budget * 100) + '%';
    budgetBar.style.background = pool === 'body' ? 'var(--accent)' : 'var(--violet)';
    for (const r of rows) {
      const v = Body.get(r.i), cap = Body.cap(r.i);
      if (+r.range.value !== v) r.range.value = v;
      r.range.style.setProperty('--cap', ((cap - R.MIN) / (R.MAX - R.MIN) * 100) + '%');
      r.value.textContent = v + '   cap ' + cap;
      r.effect.textContent = Body.describe(r.i, v);
    }
    foot.textContent = pool === 'body'
      ? 'Live: move speed ' + Body.moveSpeed.toFixed(1) + ' m/s, jump ' + Body.jumpHeight.toFixed(2) + ' m, push class ' + Body.get('strength') + '. Overclock drain ' + (R.overclockDrain(G.data.stats) * Body.consumption).toFixed(2) + ' energy/s. Changes apply when you close BODY.OS.'
      : 'Threat radius ' + Math.round(Body.threatRadius) + ' m, calibration window ' + Math.round(Body.calWindow * 100) + '%, scan time x' + Body.analysis.toFixed(2) + '. Memory ' + Body.get('memory') + ' recovers fragments for discovered locations.';
    os.status.textContent = 'HP ' + Math.ceil(Vitals.health) + '   EN ' + Math.floor(Vitals.energy) + '/' + Math.round(Vitals.maxEnergy) + '   LV ' + Progression.level + '   PTS ' + Progression.points;
  }
  update();
  statUi = { update };
}

function senses(c) {
  for (const v of VISION) {
    const unlocked = Vision.unlocked(v.id), active = Vision.current === v.id;
    const drain = v.drain * (1 - Math.min(0.6, Upgrades.total('visionDrain')));
    c.append(card(h('div', { class: 'row' }, h('b', { class: 'grow big' + (unlocked ? '' : ' muted'), text: v.name }), chip(active ? 'ACTIVE' : unlocked ? 'AVAILABLE' : 'LOCKED', active ? 'ok' : unlocked ? 'accent' : 'muted')),
      para(v.desc),
      para('Energy: ' + (drain ? drain.toFixed(1) + '/s base, ' + (drain * Body.endurance * Body.consumption).toFixed(2) + '/s with your configuration' : 'none') +
        (unlocked ? '' : '. Requires ' + (v.id === 'thermal' ? 'Thermal Optics' : 'the Reality Kernel') + ' (Technology).'), 'small muted'),
      unlocked && !active ? h('div', { class: 'row' }, btn('ACTIVATE', () => Vision.set(v.id), 'primary')) : null));
  }
  c.append(card(h('h3', { text: 'SCANNER' }), kv('Highlight range', Math.round(Vision.scanRange) + ' m'),
    kv('Analysis time / energy', 'x' + Body.analysis.toFixed(2) + '  (Analysis ' + Body.get('analysis') + ')'),
    kv('Interference disruption', Math.round(Body.interference * 100) + '%  (Concentration ' + Body.get('concentration') + ')'),
    para('In SCANNER vision the USE button becomes SCAN on objects with data. Analysis costs a little energy and gives XP the first time.')));
  const t = Threats.nearest;
  c.append(card(h('h3', { text: 'THREAT DETECTION' }), kv('Detection radius', Math.round(Body.threatRadius) + ' m'),
    kv('Direction tracking', Body.threatDirection ? 'ONLINE' : 'OFFLINE (needs 7+)', Body.threatDirection ? 'ok' : 'warn'),
    kv('Current contact', t ? t.threatName + ' (' + Math.round(Threats.distance) + ' m)' : 'None', t ? 'danger' : '')));
}

function environment(c) {
  const E = Environment, k = E.cond;
  const sev = (key, value, s, p) => kv(key, value + (s ? '   severity ' + s + ' / protection ' + p + (s <= p ? '  OK' : '  INSUFFICIENT') : ''), s ? (s <= p ? 'ok' : 'danger') : '');
  c.append(card(h('h3', { text: 'AREA: ' + (E.zone ? k.name.toUpperCase() : 'SHIP STANDARD') }),
    sev('Temperature', k.temp + '°C', coldSeverity(k), E.protCold),
    sev('Atmosphere', atmoName(k.atmo), toxicSeverity(k), E.protToxic),
    sev('Radiation', k.rad ? 'Level ' + k.rad : 'None', k.rad, E.protRad),
    kv('Gravity', k.gravity.toFixed(2) + ' g' + (Math.abs(k.gravity - 1) > 0.05 ? '  (jumps reach ' + (Body.jumpHeight / k.gravity).toFixed(1) + ' m)' : ''), Math.abs(k.gravity - 1) > 0.05 ? 'warn' : '')));
  let fxText = '';
  if (E.extraDrain > 0) fxText += 'Heating drain ' + E.extraDrain.toFixed(2) + ' energy/s. ';
  if (E.speedMult < 1) fxText += 'Cold stiffens movement (-20% speed). ';
  if (E.deficit) fxText += 'Protection shortfall: the suit reserve is draining' + (E.damaging ? ' and you are taking damage!' : ', then you will take damage.');
  c.append(card(h('h3', { text: 'SUIT RESERVE' }), kv('Reserve', Math.round(Vitals.suit) + ' / ' + Math.round(Vitals.maxSuit), 'suit'), bar(Vitals.suit / Vitals.maxSuit, 'var(--suit)'),
    para(fxText || 'No environmental effects. The suit reserve recharges outside hazards.', E.deficit ? 'warn' : '')));
  c.append(card(h('h3', { text: 'PROTECTION RATINGS' }), kv('Cold', E.protCold), kv('Toxic atmosphere', E.protToxic), kv('Radiation', E.protRad),
    para('A hazard is neutralised when your protection meets its severity. ENVIRONMENTAL WEAVE (Technology) adds +1 to every rating per tier. Wall-mounted environmental scanners survey nearby hazards.')));
}

function technology(c) {
  c.append(card(kv('Upgrade points', Progression.points, 'accent'), kv('Nanite shards', Inventory.count('nanites'), 'accent'),
    h('div', { class: 'row' }, btn('SYSTEM RESTORE', () => confirm('SYSTEM RESTORE', 'Uninstall all upgrades and refund every point and nanite? Use this to try a different build.', 'RESTORE', () => Upgrades.refundAll(), true), 'ghost'))));
  for (const cat of UPGRADE_CATS) {
    const ups = UPGRADES.filter((u) => u.cat === cat);
    if (!ups.length) continue;
    c.append(h('div', { class: 'group-title', text: cat.toUpperCase() + ' SYSTEMS' }));
    for (const def of ups) {
      const ev = Upgrades.evaluate(def), tier = Upgrades.tier(def.id), installed = ev.state === 'installed';
      const chipText = installed ? 'INSTALLED' : ev.state === 'locked' ? 'LOCKED' : tier > 0 ? 'TIER ' + tier + '/' + def.tiers : 'AVAILABLE';
      const cost = Upgrades.cost(def, tier + 1);
      c.append(h('div', { class: 'card' + (installed ? ' done' : '') },
        h('div', { class: 'row' }, h('b', { class: 'grow big' + (ev.state === 'locked' ? ' muted' : ''), text: def.name.toUpperCase() }),
          chip(chipText, installed ? 'ok' : ev.state === 'locked' ? 'muted' : ev.state === 'afford' ? 'warn' : 'accent')),
        para(def.desc),
        installed ? para('Tier ' + tier + '/' + def.tiers + ' installed.', 'ok small') : [
          para('Next tier ' + (tier + 1) + '/' + def.tiers + ': ' + cost.pts + ' point' + (cost.pts === 1 ? '' : 's') + (cost.nan ? ' + ' + cost.nan + ' nanites' : '') + (def.level > 1 ? '   Requires level ' + def.level : ''), 'bright small'),
          ev.reason ? para(ev.reason, (ev.state === 'locked' ? 'muted' : 'warn') + ' small') : null,
          h('div', { class: 'row' }, btn(tier > 0 ? 'UPGRADE' : 'INSTALL', () => Upgrades.install(def.id), 'primary', { disabled: ev.state !== 'available' })),
        ]));
    }
  }
}

function reality(c) {
  if (!Reality.anyUnlocked) c.append(h('div', { class: 'card violet' }, h('h3', { class: 'violet', text: 'REALITY KERNEL: DORMANT' }),
    para('BODY.OS contains a dormant kernel that does not belong to any human specification. Complete WAKE PROTOCOL, then install the REALITY KERNEL in Technology to bring it online.')));
  for (const r of Reality.list) {
    const d = r.def, un = Reality.unlocked(d.id);
    const st = !un ? 'LOCKED' : r.active > 0 ? 'ACTIVE ' + Math.ceil(r.active) + 's' : r.cooldown > 0 ? 'RECHARGING ' + Math.ceil(r.cooldown) + 's' : 'READY';
    const by = UPGRADES.find((u) => u.fx.some((f) => f.t === 'ability' && f.key === d.id));
    const el = card(h('div', { class: 'row' }, h('b', { class: 'grow big' + (un ? '' : ' muted'), text: d.name.toUpperCase() }), chip(st, !un ? 'muted' : r.active > 0 ? 'violet' : r.cooldown > 0 ? 'warn' : 'ok')),
      para(d.desc), para('Cost ' + d.cost + ' energy   Duration ' + d.dur + 's   Cooldown ' + d.cd + 's', 'small muted'));
    if (!un) el.append(para('Unlock: install ' + (by ? by.name : 'its reality module') + '.', 'small muted'));
    else {
      const row = h('div', { class: 'row wrap' }, btn('ACTIVATE', () => { closeOS(); Reality.activate(d.id); }, 'primary'));
      for (let s = 0; s < 2; s++) {
        const on = G.data.slots[s] === d.id;
        row.append(btn('SLOT ' + (s + 1) + (on ? ' ✓' : ''), () => { G.data.slots[s] = on ? '' : d.id; events.emit('abilities'); }, on ? 'primary' : 'secondary'));
      }
      el.append(row);
    }
    c.append(el);
  }
  c.append(para('Quick slots appear as buttons above JUMP on the HUD.', 'small muted'));
}

const ABBR = ['STR', 'SPD', 'JMP', 'END', 'REC', 'THR', 'REA', 'CON', 'MEM', 'THT', 'ANA'];
const summary = (v) => v.map((x, i) => ABBR[i] + ' ' + x).slice(0, 6).join('   ') + '\n' + v.map((x, i) => ABBR[i] + ' ' + x).slice(6).join('   ');
function configurations(c) {
  c.append(card(h('h3', { text: 'ACTIVE CONFIGURATION' }), para(summary(G.data.stats) + '\nVision: ' + Vision.info.name, 'bright pre')));
  for (const p of Presets.all) {
    c.append(card(h('div', { class: 'row' }, h('b', { class: 'grow big', text: p.name }), p.custom ? chip('CUSTOMISED', 'warn') : null),
      para(p.desc), para(summary(p.stats) + '\nVision: ' + visionInfo(p.vision).name, 'small muted pre'),
      h('div', { class: 'row wrap' },
        btn('LOAD', () => Presets.load(p.id), 'primary'),
        btn('SAVE CURRENT', () => confirm('OVERWRITE PRESET', 'Store your current configuration in ' + p.name + '?', 'SAVE', () => Presets.saveCurrent(p.id))),
        p.custom ? btn('RESET', () => Presets.reset(p.id), 'ghost') : null)));
  }
}

function status(c) {
  const P = Progression;
  c.append(card(h('h3', { text: 'PROGRESSION' }), kv('Level', P.level, 'accent'), kv('Experience', P.xp + ' / ' + P.toNext), bar(P.xp / P.toNext, 'var(--accent)'),
    kv('Upgrade points', P.points), kv('Play time', Math.floor(G.data.playTime / 60) + ' min')));
  const active = Reality.list.filter((r) => r.active > 0).map((r) => r.def.name).join(', ');
  c.append(card(h('h3', { text: 'CONDITION' }), kv('Health', Math.ceil(Vitals.health) + ' / ' + Math.round(Vitals.maxHealth), 'hp'),
    kv('Energy', Math.floor(Vitals.energy) + ' / ' + Math.round(Vitals.maxEnergy), 'en'), kv('Active vision', Vision.info.name),
    kv('Active abilities', active || 'None'), kv('Protection (cold/toxic/rad)', Environment.protCold + ' / ' + Environment.protToxic + ' / ' + Environment.protRad)));
  c.append(card(h('h3', { text: 'BODY CONFIGURATION' }), STATS.map((s, i) => kv(s.name, Body.get(i) + '  (cap ' + Body.cap(i) + ')'))));
  const ups = Object.entries(G.data.upgrades);
  c.append(card(h('h3', { text: 'INSTALLED UPGRADES' }), ups.length ? ups.map(([id, t]) => kv(upgradeDef(id).name, 'Tier ' + t + '/' + upgradeDef(id).tiers, 'ok')) : para('None installed.')));
  const inv = Object.entries(G.data.inventory);
  c.append(card(h('h3', { text: 'INVENTORY' }), inv.length ? inv.map(([id, n]) => kv(itemName(id), 'x' + n)) : para('Empty.')));
  c.append(card(h('h3', { text: 'MISSIONS' }), MISSIONS.map((m) => {
    const st = G.data.story.missions[m.id];
    return kv(m.title, st ? (st.done ? 'Complete' : 'Objective ' + (st.obj + 1) + '/' + m.objectives.length) : (!m.start || hasFlag(m.start) ? 'Available' : 'Unknown'), st && st.done ? 'ok' : '');
  }), Missions.objective ? para('Current: ' + Missions.objective.text, 'bright') : null));
  const mem = Body.get('memory');
  const locs = card(h('h3', { text: 'DISCOVERED LOCATIONS & MEMORY' }));
  for (const id of G.data.progress.discovered) {
    const l = loc(id);
    if (!l) continue;
    locs.append(h('b', { class: 'big', text: l.name }), para(l.desc, 'small muted'));
    for (const f of l.frags || []) locs.append(G.data.progress.fragments.includes(f.id) ? para('MEMORY: ' + f.text, 'violet small') : para('Fragment locked (Memory ' + f.mem + ' required, current ' + mem + ').', 'muted small'));
  }
  if (!G.data.progress.discovered.length) locs.append(para('None yet.'));
  c.append(locs);
}

function diagnostics(c) {
  const b = Vitals.breakdown;
  c.append(card(h('h3', { text: 'ENERGY ACCOUNTING (per second)' }),
    kv('Regeneration (Recovery ' + Body.get('recovery') + ')', '+' + b.regen.toFixed(2), 'ok'), kv('Passive systems', '-' + b.passive.toFixed(2)),
    kv('Overclock (attributes > 5)', '-' + b.overclock.toFixed(2)), kv('Movement', '-' + b.movement.toFixed(2)),
    kv('Vision: ' + Vision.info.name, '-' + b.vision.toFixed(2)), kv('Environment', '-' + b.environment.toFixed(2)),
    kv('NET', fmt(b.net), b.net >= 0 ? 'ok' : 'warn'),
    para('Multipliers: throttle consumption x' + Body.consumption.toFixed(2) + ', endurance x' + Body.endurance.toFixed(2) + '. The game is paused while BODY.OS is open, so movement values update after you close it.', 'small muted')));
  c.append(card(h('h3', { text: 'PERFORMANCE' }), kv('Graphics quality', ['LOW', 'MEDIUM', 'HIGH'][G.settings.quality]), kv('Screen', window.innerWidth + ' x ' + window.innerHeight + ' @' + (window.devicePixelRatio || 1).toFixed(2)),
    kv('Renderer', W.renderer ? (W.renderer.info.render.calls + ' draw calls') : '-')));
  const si = saveInfo();
  c.append(card(h('h3', { text: 'SAVE DATA' }), kv('Format version', si.version), kv('Last save', si.lastSaveTime), kv('Storage', host.kind === 'android' ? 'App storage (offline)' : 'Browser storage (offline)'),
    si.lastSaveError ? para('Last error: ' + si.lastSaveError, 'warn small') : null,
    h('div', { class: 'row wrap' },
      btn('SAVE NOW', () => save(true), 'primary'),
      btn('RECALIBRATE', () => confirm('RECALIBRATE', 'Reset all attributes to balanced defaults?', 'RESET', () => Body.reset())),
      btn('SYSTEM RESTORE', () => confirm('SYSTEM RESTORE', 'Uninstall all upgrades and refund every point and nanite?', 'RESTORE', () => Upgrades.refundAll(), true), 'ghost'))));
  const log = card(h('h3', { text: 'EVENT LOG' }));
  G.data.story.log.slice(-12).reverse().forEach((e) => log.append(para(e, 'small')));
  log.append(h('h3', { class: 'muted', text: 'RECENT NOTIFICATIONS' }));
  history.slice(-10).reverse().forEach((e) => log.append(para(e, 'small muted')));
  c.append(log);
}

// ---------------------------------------------------------------- Dialogs
function dialog(title, body, buttons) {
  const { win, close } = modal('dialog');
  win.append(h('h2', { text: title }), h('div', { class: 'dialog-body', text: body }),
    h('div', { class: 'dialog-buttons' }, buttons.map((b) => btn(b.label, () => { close(); b.fn && b.fn(); }, b.style || 'secondary'))));
}
function confirm(title, body, label, fn, danger) {
  dialog(title, body, [{ label: 'CANCEL', style: 'ghost' }, { label, style: danger ? 'danger' : 'primary', fn }]);
}

function transmission(title, text, onClose) {
  const { win, close } = modal('dialog transmission', onClose);
  const bodyEl = h('div', { class: 'dialog-body' });
  let shown = 0, done = false;
  const b = btn('SKIP', () => { if (!done) { shown = text.length; bodyEl.textContent = text; done = true; b.textContent = 'CONTINUE'; } else close(); }, 'primary');
  win.append(h('h2', { class: 'violet', text: title }), h('div', { class: 'signal' }), bodyEl, h('div', { class: 'dialog-buttons' }, b));
  sfx('transmission');
  let last = performance.now();
  const step = (now) => {
    if (done || !win.isConnected) return;
    shown = Math.min(text.length, shown + (now - last) / 1000 * 42);
    last = now;
    bodyEl.textContent = text.slice(0, shown | 0);
    if (shown >= text.length) { done = true; b.textContent = 'CONTINUE'; return; }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** Timed calibration (Reaction): stop the sweeping marker inside the window, twice. */
function calibration(title, onSuccess, onFail) {
  const { win, close } = modal('dialog calibration');
  const windowSize = Body.calWindow;
  let speed = Body.calSpeed, stage = 0, pos = 0, dir = 1, start = 0, finished = false;
  const zone = h('div', { class: 'cal-window' }), marker = h('div', { class: 'cal-marker' }), statusEl = h('div', { class: 'cal-status' });
  const newWindow = () => {
    start = 0.1 + Math.random() * (0.8 - windowSize);
    zone.style.left = start * 100 + '%'; zone.style.width = windowSize * 100 + '%';
    statusEl.textContent = 'PHASE ' + (stage + 1) + ' / 2'; statusEl.className = 'cal-status';
  };
  const lock = () => {
    if (finished) return;
    if (pos >= start && pos <= start + windowSize) {
      sfx('calibrate');
      if (++stage >= 2) return finish(true);
      speed *= 1.15; newWindow();
    } else finish(false);
  };
  const finish = (ok) => {
    finished = true;
    statusEl.textContent = ok ? 'CALIBRATION LOCKED' : 'CALIBRATION FAILED';
    statusEl.className = 'cal-status ' + (ok ? 'ok' : 'danger');
    setTimeout(() => { close(); (ok ? onSuccess : onFail)(); }, 600);
  };
  const lockBtn = h('button', { class: 'btn primary big-btn', type: 'button' }, 'LOCK');
  lockBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); lock(); });
  win.append(h('h2', { text: title }),
    para('Tap LOCK while the marker is inside the bright window. Two phases.\nReaction Speed ' + Body.get('reaction') + ': window ' + Math.round(windowSize * 100) + '%, marker ' + speed.toFixed(2) + ' sweeps/s.', 'center pre'),
    h('div', { class: 'cal-track' }, zone, marker), statusEl,
    h('div', { class: 'dialog-buttons' }, btn('ABORT', () => { finished = true; close(); }, 'ghost'), lockBtn));
  newWindow();
  let last = performance.now();
  const step = (now) => {
    if (!win.isConnected) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!finished) {
      pos += dir * speed * 2 * dt;
      if (pos > 1) { pos = 1; dir = -1; } if (pos < 0) { pos = 0; dir = 1; }
      marker.style.left = pos * 100 + '%';
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ---------------------------------------------------------------- Pause & settings
let pauseEl = null;
function openPause() {
  if (pauseEl) return;
  const { win, close } = modal('pause', () => { pauseEl = null; });
  pauseEl = win;
  win.append(h('h2', { class: 'center', text: 'PAUSED' }),
    btn('RESUME', close, 'primary'),
    btn('SAVE GAME', () => save(true)),
    btn('BODY.OS', () => { close(); openOS(-1); }),
    btn('SETTINGS', openSettings),
    btn('MAIN MENU', () => confirm('RETURN TO MAIN MENU', 'Your progress will be saved first.', 'MAIN MENU', () => { close(); events.emit('toMenu'); }), 'ghost'));
  sfx('osOpen');
}

function openSettings() {
  const s = G.settings;
  const { win } = modal('dialog settings', () => { writeSettings(s); events.emit('settings'); });
  const apply = () => { applyVolumes(); applyQuality(s.quality); applyUiScale(); events.emit('settings'); };
  const slider = (label, key, min, max, stepV, fmtFn) => {
    const val = h('b', { class: 'accent', text: fmtFn(s[key]) });
    const r = h('input', { type: 'range', min, max, step: stepV, value: s[key], class: 'slider body' });
    r.addEventListener('input', () => { s[key] = +r.value; val.textContent = fmtFn(s[key]); apply(); });
    r.addEventListener('change', () => { if (key === 'sfx') sfx('click'); });
    return h('div', { class: 'set-row' }, h('span', { text: label }), r, val);
  };
  const toggle = (label, key) => {
    const b = h('button', { class: 'switch' + (s[key] ? ' on' : ''), type: 'button', onclick: () => { s[key] = !s[key]; b.classList.toggle('on', s[key]); sfx('click'); apply(); if (key === 'vibration' && s[key]) vibrate('medium'); } }, h('i'));
    return h('div', { class: 'set-row' }, h('span', { text: label }), b);
  };
  const pct = (v) => Math.round(v * 100) + '%', x = (v) => (+v).toFixed(1) + 'x';
  const quality = h('div', { class: 'row' }, ...['LOW', 'MEDIUM', 'HIGH'].map((q, i) => {
    const b = btn(q, () => { s.quality = i; [...quality.children].forEach((c, k) => c.classList.toggle('primary', k === i)); apply(); }, i === s.quality ? 'primary' : 'secondary');
    return b;
  }));
  win.append(h('h2', { text: 'SETTINGS' }), h('div', { class: 'settings-body' },
    h('div', { class: 'group-title', text: 'AUDIO' }),
    slider('Master volume', 'master', 0, 1, 0.05, pct), slider('Music volume', 'music', 0, 1, 0.05, pct), slider('Sound effects', 'sfx', 0, 1, 0.05, pct),
    h('div', { class: 'group-title', text: 'CONTROLS' }),
    slider('Camera sensitivity', 'camSens', 0.2, 3, 0.1, x), slider('Joystick response', 'joySens', 0.5, 2, 0.1, x),
    toggle('Invert camera (vertical)', 'invert'), toggle('Vibration', 'vibration'),
    h('div', { class: 'group-title', text: 'DISPLAY' }),
    h('div', { class: 'set-row' }, h('span', { text: 'Graphics quality' }), quality),
    slider('Interface scale', 'uiScale', 0.8, 1.3, 0.05, pct), toggle('Show frame rate', 'fps')),
    h('div', { class: 'dialog-buttons' }, btn('DONE', () => layers[layers.length - 1].close(), 'primary')));
}

// ---------------------------------------------------------------- Main menu
let menuEl = null;
function showMainMenu(onContinue, onNew) {
  hideHud();
  if (menuEl) menuEl.remove();
  const saved = hasSave() ? loadSave() : null;
  menuEl = h('div', { class: 'main-menu' },
    h('div', { class: 'title' }, h('h1', { text: 'BODY.OS' }), h('h2', { text: 'BEYOND EXISTENCE' }),
      h('p', { text: 'You woke up on a derelict ship. Your body runs an operating system that was never meant for a human.' })),
    h('div', { class: 'menu-buttons' },
      saved ? btn('CONTINUE', onContinue, 'primary') : null,
      saved ? h('div', { class: 'menu-info', text: 'Level ' + saved.progress.level + '  //  ' + Math.floor(saved.playTime / 60) + ' min played' }) : null,
      btn('NEW GAME', () => (saved ? confirm('START A NEW GAME?', 'This replaces your current progress (your settings are kept). This cannot be undone.', 'START NEW GAME', onNew, true) : onNew()), saved ? 'secondary' : 'primary'),
      btn('SETTINGS', openSettings),
      host.kind === 'android' ? btn('QUIT', () => host.quit(), 'ghost') : null),
    h('div', { class: 'version', text: 'v1.0  //  offline  //  first chapter: THE DERELICT' }));
  $('#menus').append(menuEl);
  host.overlay(false);
}
function hideMainMenu() { if (menuEl) { menuEl.remove(); menuEl = null; } }
