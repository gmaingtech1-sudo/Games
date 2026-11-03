// BODY.OS: BEYOND EXISTENCE — entry point: startup, game flow, interaction/scanning,
// and the main loop.
import * as THREE from 'three';
import { G, events, notify, loadSave, newSave, deleteSave, loadSettings, writeSettings } from './core.js';
import { host } from './host.js';
import {
  world, resetWorld, startSession, tickSystems, Vision, Vitals, Environment, Body, Missions, Progression, Threats, setFlag, hasFlag, save, log, Upgrades, Reality, Inventory,
} from './systems.js';
import { W, initRenderer, clearWorld, applyVision, applyQuality, resize, tickLights, tickVision, M, glow, mesh, group } from './world.js';
import { buildDerelict, tickDebris } from './derelict.js';
import { createPlayer } from './player.js';
import { tryUse, completeScan } from './entities.js';
import { input } from './input.js';
import { UI, updateHud, tickUi } from './ui.js';
import { sfx, unlockAudio, startMusic, applyVolumes, suspendAudio, resumeAudio } from './audio.js';

// ---------------------------------------------------------------- Interaction & scanning
const interactor = {
  focus: null, scanning: false, target: null, elapsed: 0, duration: 0, spike: 0, poll: 0,
  get progress() { return this.duration ? Math.min(1, this.elapsed / this.duration) : 0; },
  get label() {
    if (this.scanning) return 'ANALYSING';
    if (!this.focus) return '';
    return this.isScan(this.focus) ? 'SCAN' : this.focus.prompt();
  },
  isScan(e) { return (Vision.current === 'scanner' && e.scanText && !e.scanned()) || !e.hasUse(); },
  choose() {
    const p = G.player.pos, scanner = Vision.current === 'scanner';
    const fx = Math.sin(G.player.camYaw), fz = Math.cos(G.player.camYaw);
    let best = null, bestScore = Infinity;
    for (const e of world.interactables) {
      if (!e.available()) continue;
      const scannable = scanner && e.scanText && !e.scanned();
      if (!scannable && !e.hasUse()) continue;
      const range = scannable ? Math.max(e.range, 5) : e.range;
      const dx = e.pos.x - p.x, dy = e.pos.y - (p.y + 1), dz = e.pos.z - p.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > range) continue;
      const hl = Math.hypot(dx, dz);
      const facing = hl > 0.1 ? (dx * fx + dz * fz) / hl : 1;
      const score = d - facing * 1.2;
      if (score < bestScore) { bestScore = score; best = e; }
    }
    this.focus = best;
  },
  activate() {
    const f = this.focus;
    if (this.scanning || !f) return;
    if (this.isScan(f)) {
      if (Vision.current !== 'scanner') { notify('Switch to SCANNER vision (VISION button) to analyse objects.'); return; }
      const cost = 3 * f.scanDiff * Body.analysis;
      if (!Vitals.trySpend(cost)) { sfx('denied'); notify('Analysis needs ' + Math.ceil(cost) + ' energy.', 'warning'); return; }
      this.scanning = true; this.target = f; this.elapsed = 0; this.duration = 2 * f.scanDiff * Body.analysis; this.spike = 0.7;
      sfx('scan');
    } else tryUse(f);
  },
  update(dt) {
    this.poll -= dt;
    if (this.poll <= 0) { this.poll = 0.1; this.choose(); }
    if (input.consumeInteract()) this.activate();
    if (!this.scanning) return;
    const t = this.target, p = G.player.pos;
    const cancel = (why) => { this.scanning = false; this.target = null; if (why) { sfx('denied'); notify(why, 'warning'); } };
    if (!world.interactables.includes(t)) return cancel();
    if (Vision.current !== 'scanner') return cancel('Scan aborted: scanner vision disengaged.');
    const r = Math.max(t.range, 5) * 1.5;
    if ((t.pos.x - p.x) ** 2 + (t.pos.z - p.z) ** 2 > r * r) return cancel('Scan aborted: target out of range.');
    this.elapsed += dt;
    // Interference from the object or a hazardous area can knock analysis back (Concentration resists).
    const source = Math.min(1, t.interference + (Environment.hazardous ? 0.35 : 0));
    if (source > 0 && (this.spike -= dt) <= 0) {
      this.spike = 0.7;
      if (Math.random() < source) {
        if (Math.random() < Body.interference) {
          this.elapsed = Math.max(0, this.elapsed - this.duration * 0.35);
          sfx('interference');
          events.emit('flash', '#1ae6ff');
          notify('INTERFERENCE: analysis disrupted. Higher Concentration resists this.', 'warning');
          setFlag('scan.interrupted');
        } else notify('Interference resisted (Concentration).');
      }
    }
    if (this.elapsed >= this.duration) { this.scanning = false; this.target = null; completeScan(t); }
  },
};

// ---------------------------------------------------------------- Flow
let menuScene = null, checkpointDefault = null;

function buildMenuBackdrop() {
  clearWorld();
  resetWorld();
  W.baseAmbient.setRGB(0.3, 0.35, 0.45);
  applyVision();
  const g = group(null, 1.6, 1.2, 0);
  const rings = [];
  for (let i = 0; i < 3; i++) {
    const r = mesh(g, 'ring', 0, 0, 0, 3.2 + i * 0.7, 3.2 + i * 0.7, 3.2 + i * 0.7, glow('menuRing' + i, i === 1 ? 0x4d70ff : 0x1ae6ff, 0.6));
    r.rotation.x = 1.2 + i * 0.4; r.rotation.y = i;
    rings.push(r);
  }
  const holo = glow('holo', 0x1ab3ff, 0.35);
  const fig = group(null, 1.6, 0, 0);
  mesh(fig, 'capsule', 0, 1.35, 0, 0.55, 0.42, 0.35, holo);
  mesh(fig, 'sphere', 0, 2.0, 0, 0.36, 0.4, 0.36, holo);
  for (const x of [-0.15, 0.15]) mesh(fig, 'capsule', x, 0.5, 0, 0.18, 0.45, 0.18, holo);
  for (const x of [-0.42, 0.42]) mesh(fig, 'capsule', x, 1.3, 0, 0.14, 0.38, 0.14, holo);
  mesh(fig, 'sphere', 0, 1.45, 0.1, 0.18, 0.18, 0.18, M.cyan);
  mesh(null, 'cyl', 1.6, 0, 0, 2.6, 0.02, 2.6, glow('platform', 0x4d70ff, 0.4));
  W.camera.position.set(0, 1.3, 6.5);
  W.camera.lookAt(0.6, 1.1, 0);
  menuScene = { rings, fig };
}

function showMenu() {
  G.inGame = false;
  G.player = null;
  buildMenuBackdrop();
  UI.showMainMenu(continueGame, newGame);
  UI.fade(false);
  startMusic(true);
}

function continueGame() {
  const data = loadSave();
  if (!data) { notify('Save data unreadable: starting a new game.', 'warning'); return newGame(); }
  begin(data, false);
}

function newGame() {
  deleteSave();
  begin(newSave(), true);
}

function begin(data, fresh) {
  unlockAudio();
  UI.fade(true);
  G.loading = true;
  setTimeout(() => {
    UI.hideMainMenu();
    startSession(data);
    log(fresh ? 'BODY.OS cold boot. Subject 7 revived.' : 'Session restored.');
    menuScene = null;
    clearWorld();
    resetWorld();
    const start = buildDerelict();
    checkpointDefault = { ...start };
    G.checkpoint = null;
    const p = data.story.pos;
    G.player = createPlayer(p ? p.x : start.x, p ? p.y + 0.05 : start.y, p ? p.z : start.z, p ? p.yaw : start.yaw);
    G.inGame = true;
    applyVision();
    UI.showHud();
    startMusic(false);
    Missions.begin();
    events.emit('stats'); events.emit('vitals');
    G.loading = false;
    UI.fade(false);
  }, 250);
}

function toMenu() {
  if (G.inGame) save(false);
  UI.closeAll();
  UI.hideHud();
  showMenu();
}
events.on('toMenu', toMenu);

events.on('collapse', () => {
  const c = G.checkpoint || checkpointDefault;
  G.player.teleport(c.x, c.y, c.z, c.yaw);
  Vitals.revive();
  notify('BODY.OS emergency reboot. Systems restored at your last recharge point.', 'warning');
});

// ---------------------------------------------------------------- Loop
let last = performance.now(), autosave = 0, threatTimer = 0, zoneTimer = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const raw = Math.min(0.05, (now - last) / 1000);
  last = now;
  input.poll();
  const paused = G.blocked;
  if (G.inGame && G.player) {
    if (!paused) {
      G.player.update(raw);
      tickSystems(raw, G.player.pos);
      for (const fn of world.timed) fn(raw);
      interactor.update(raw);
      if ((zoneTimer -= raw) <= 0) {
        zoneTimer = 0.2;
        const p = G.player.pos;
        for (const z of world.flagZones) {
          if (z.done || Math.abs(p.x - z.cx) > z.sx / 2 || Math.abs(p.y + 0.9 - z.cy) > z.sy / 2 || Math.abs(p.z - z.cz) > z.sz / 2) continue;
          z.done = true;
          if (z.location) Progression.discover(z.location);
          if (z.flag && !hasFlag(z.flag)) { setFlag(z.flag); if (z.message) notify(z.message, 'story'); }
        }
      }
      if ((threatTimer -= raw) <= 0) { threatTimer = 0.2; Threats.poll(G.player.pos); }
      if ((autosave += raw) > 120) { autosave = 0; save(false); }
      tickDebris(now / 1000);
    }
    G.player.updateCamera(paused ? 0 : raw);
    tickLights(raw, G.player.pos);
    tickVision(raw);
    updateHud(raw, interactor);
  } else if (menuScene) {
    const t = now / 1000;
    menuScene.rings.forEach((r, i) => { r.rotation.z = t * (i % 2 ? -0.3 : 0.4); });
    menuScene.fig.rotation.y = t * 0.35;
  }
  tickUi();
  W.renderer.render(W.scene, W.camera);
}

// ---------------------------------------------------------------- Start
// Test/debug handle (used by the automated playtest; harmless in normal play).
window.BOS = window.BOS || {};
Object.assign(window.BOS, { G, interactor, sys: { Vision, Vitals, Environment, Body, Missions, Progression, Threats, hasFlag, setFlag, Upgrades, Reality, Inventory }, world });

function boot() {
  G.settings = loadSettings();
  initRenderer(document.getElementById('view'));
  applyQuality(G.settings.quality);
  UI.init();
  applyVolumes();
  window.addEventListener('resize', resize);
  // The first touch unlocks audio (browsers and WebViews require a user gesture).
  window.addEventListener('pointerdown', () => { unlockAudio(); applyVolumes(); }, { once: false, passive: true });
  events.on('settings', () => { applyVolumes(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (G.inGame) save(false); suspendAudio(); } else resumeAudio();
  });
  host.on('pause', () => { if (G.inGame) save(false); suspendAudio(); input.reset(); });
  host.on('resume', () => { resumeAudio(); last = performance.now(); });
  host.on('back', () => UI.back());
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  showMenu();
  document.getElementById('boot').remove();
  requestAnimationFrame(frame);
}

try { boot(); } catch (e) {
  const b = document.getElementById('boot');
  if (b) b.textContent = 'BODY.OS failed to start: ' + (e && e.message ? e.message : e) + '. WebGL may be unavailable on this device.';
  throw e;
}
