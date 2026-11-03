// BODY.OS — interactive objects. Every interactable shares one interface:
//   name, pos (focus point), range, prompt(), hasUse(), available(), canUse() -> reason|null,
//   use(), and optional scan data (scanText, scanTitle, scanDiff, scanXp, interference).
import * as THREE from 'three';
import { G, events, notify, vibrate } from './core.js';
import {
  world, hasFlag, setFlag, Inventory, Progression, Vitals, Reality, Body, Environment, coldSeverity, toxicSeverity, atmoName, itemName, log,
} from './systems.js';
import { ITEMS } from './data.js';
import { W, M, box, mesh, group, lit, glow, visionTarget, addCollider, moveCollider, lightAnchor } from './world.js';
import { sfx } from './audio.js';
import { UI } from './ui.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const toWorld = (g, x, y, z) => { g.updateWorldMatrix(true, false); return V(x, y, z).applyMatrix4(g.matrixWorld); };

function interactable(o) {
  const e = Object.assign({
    id: 'object', name: 'Object', range: 2.4, pos: V(0, 0, 0), scanText: '', scanTitle: '', scanDiff: 1, scanXp: 15, interference: 0,
    target: null, prompt: () => 'USE', hasUse: () => true, canUse: () => null, use: () => {}, onScanned: () => {},
  }, o);
  e.available = o.available || (() => !e.target || !e.target.hidden || e.target.revealed);
  e.scanned = () => hasFlag('scanned.' + e.id);
  world.interactables.push(e);
  return e;
}
function updater(fn) { world.timed.push(fn); }
const distSq = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;
const own = (m) => { const c = m.clone(); return c; };

export function tryUse(e) {
  const why = e.canUse();
  if (why) { sfx('denied'); notify(why, 'warning'); return; }
  sfx('confirm');
  e.use();
}

export function completeScan(e) {
  const first = !e.scanned();
  setFlag('scanned.' + e.id);
  sfx('scanDone');
  UI.showScan(e.scanTitle || e.name, e.scanText);
  if (first) { Progression.addXp(e.scanXp, 'analysis'); log('Analysed ' + e.name + '.'); }
  e.onScanned(first);
}

function discoverTech(flag, name) {
  if (hasFlag(flag)) return;
  setFlag(flag);
  sfx('discovery');
  notify('TECHNOLOGY DISCOVERED: ' + name, 'success');
  Progression.addXp(40, 'technology');
}

// ---------------------------------------------------------------- Door
/** Sliding double door; opens automatically when unlocked and the player is near. */
export function door(id, name, x, z, alongX, opts = {}) {
  const w = opts.width || 2.4, h = opts.height || 3, half = w / 2;
  const g = group(null, x, 0, z, alongX ? 0 : 90);
  const light = own(M.cyan);
  const pl = box(g, -half / 2, h / 2, 0, half, h, 0.2, M.hullLight, { env: false });
  const pr = box(g, half / 2, h / 2, 0, half, h, 0.2, M.hullLight, { env: false });
  box(pl, half / 2 - 0.05, 0, 0.11, 0.06, h * 0.8, 0.03, light, { collide: false, env: false });
  box(pr, -half / 2 + 0.05, 0, 0.11, 0.06, h * 0.8, 0.03, light, { collide: false, env: false });
  const cl = pl.userData.collider, cr = pr.userData.collider;
  const unlocked = () => !opts.requires || hasFlag(opts.requires);
  const setLight = () => { const c = unlocked() ? 0x1ae6ff : 0xff3a48; light.emissive.set(c); light.color.set(c).multiplyScalar(0.3); };
  setLight();
  const e = interactable({
    id, name, range: 2.8, pos: V(x, 1.4, z), scanText: opts.scanText || '', scanTitle: opts.scanTitle || '', scanXp: opts.scanXp || 15,
    prompt: () => (unlocked() ? 'OPEN' : 'LOCKED'), hasUse: () => !unlocked(),
    canUse: () => (unlocked() ? null : opts.locked || 'Locked.'),
  });
  e.target = visionTarget(g, { env: true, scan: 'interact' });
  let open = 0, want = false, wasUnlocked = unlocked(), poll = 0;
  const bb = new THREE.Box3();
  const sync = (mesh, c) => { mesh.updateWorldMatrix(true, false); bb.setFromObject(mesh); c.x0 = bb.min.x; c.x1 = bb.max.x; c.z0 = bb.min.z; c.z1 = bb.max.z; };
  updater((dt) => {
    poll -= dt;
    if (poll <= 0 && G.player) {
      poll = 0.2;
      const u = unlocked();
      if (u !== wasUnlocked) { wasUnlocked = u; setLight(); if (u) notify(name + ' unlocked.', 'success'); }
      const p = G.player.pos;
      const near = (p.x - x) ** 2 + (p.z - z) ** 2 < 3.4 * 3.4;
      if (u && near && !want) sfx('door');
      want = u && near;
    }
    const target = want ? 1 : 0;
    if (open !== target) {
      open = target > open ? Math.min(1, open + dt * 2.5) : Math.max(0, open - dt * 2.5);
      const k = open * open * (3 - 2 * open) * half * 0.95;
      pl.position.x = -half / 2 - k; pr.position.x = half / 2 + k;
      sync(pl, cl); sync(pr, cr);
    }
  });
  return e;
}

// ---------------------------------------------------------------- Terminal
/** Computer terminal: logs, schematics (technology discovery), transmissions, BODY.OS shortcuts. */
export function terminal(id, name, x, z, yaw, o = {}) {
  const g = group(null, x, 0, z, yaw);
  box(g, 0, 0.5, 0, 0.9, 1, 0.6, M.hullLight, { env: false });
  const scr = box(g, 0, 1.35, 0.05, 0.85, 0.6, 0.06, o.screen || M.screen, { collide: false, env: false });
  scr.rotation.x = -0.26;
  box(g, 0, 1.02, 0.31, 0.8, 0.04, 0.02, M.cyan, { collide: false, env: false });
  const e = interactable({
    id, name, pos: toWorld(g, 0, 1.2, 0), range: 2.4, prompt: () => o.prompt || 'ACCESS',
    scanText: o.scanText || '', interference: o.interference || 0,
    canUse: () => (o.requires && !hasFlag(o.requires) ? o.locked || 'No response.' : null),
    use: () => {
      const first = !hasFlag('interact.' + id);
      setFlag('interact.' + id);
      if (first && (o.xp ?? 20) > 0) Progression.addXp(o.xp ?? 20, 'terminal');
      (o.schematics || []).forEach(([f, n]) => discoverTech(f, n));
      const finish = () => (o.sets || []).forEach(setFlag);
      if (o.transmission) UI.transmission(o.title || name, o.body, finish);
      else if (o.section !== undefined) UI.dialog(o.title || name.toUpperCase(), o.body, [
        { label: 'CLOSE', style: 'ghost', fn: finish },
        { label: o.sectionLabel || 'OPEN BODY.OS', style: 'primary', fn: () => { finish(); UI.openOS(o.section); } },
      ]);
      else UI.dialog(o.title || name.toUpperCase(), o.body, [{ label: 'CLOSE', style: 'primary', fn: finish }]);
    },
  });
  e.target = visionTarget(g, { env: false, heat: o.heat ?? 0.4, scan: 'interact', hidden: o.hidden, anomaly: o.hidden });
  if (o.hidden) g.traverse((m) => { if (m.userData.collider) e.target.colliders.push(m.userData.collider); });
  if (o.hidden) for (const c of e.target.colliders) c.on = false;
  return e;
}

// ---------------------------------------------------------------- Recharge station
export function recharge(id, x, z, yaw) {
  const g = group(null, x, 0, z, yaw);
  const ring = own(M.cyan);
  box(g, 0, 1.2, -0.2, 0.8, 2.4, 0.4, M.hullLight, { env: false });
  mesh(g, 'cyl', 0, 0.03, 0.6, 1.3, 0.06, 1.3, ring);
  box(g, 0, 1.4, 0.02, 0.5, 1.4, 0.06, ring, { collide: false, env: false });
  lightAnchor(...toWorld(g, 0, 1.8, 0.9).toArray(), 0x1ae6ff, 5, 1.6);
  let ready = 0;
  const e = interactable({
    id: 'recharge_' + id, name: 'Recharge Station', pos: toWorld(g, 0, 1.1, 0.4),
    scanText: 'Standard crew recharge cradle. Restores BODY.OS energy and suit reserve. Registers as your emergency reboot point.',
    prompt: () => (performance.now() < ready ? 'CHARGING' : 'RECHARGE'),
    canUse: () => (performance.now() < ready ? 'Recharge cycle in progress.' : null),
    use: () => {
      ready = performance.now() + 12000;
      Vitals.refill();
      sfx('recharge');
      events.emit('flash', '#1ae6ff');
      const sp = toWorld(g, 0, 0.1, 1.4);
      G.checkpoint = { x: sp.x, y: sp.y, z: sp.z, yaw: g.rotation.y };
      notify('Energy and suit restored. Reboot point updated.', 'success');
      setFlag('recharged');
    },
  });
  e.target = visionTarget(g, { env: false, heat: 0.8, scan: 'interact' });
  updater(() => { const k = performance.now() < ready ? 0.4 : 1 + 0.3 * Math.sin(performance.now() / 330); ring.emissiveIntensity = k; });
  return e;
}

// ---------------------------------------------------------------- Pickup
export function pickup(id, item, amount, x, y, z, o = {}) {
  if (hasFlag('picked.' + id)) return null;
  const def = ITEMS[item];
  const g = group(null, x, y, z);
  const mat = lit('pickup_' + item, new THREE.Color(def.color).multiplyScalar(0.4), { emissive: def.color, ei: 1.3 });
  let vis;
  if (item === 'power_cell') {
    vis = mesh(g, 'cyl', 0, 0.5, 0, 0.28, 0.6, 0.28, mat);
    mesh(vis, 'cyl', 0, 0.55, 0, 1.3, 0.15, 1.3, M.hullLight);
  } else {
    vis = mesh(g, 'sphere', 0, 0.5, 0, 0.3, 0.45, 0.3, mat);
    vis.geometry = new THREE.OctahedronGeometry(0.6);
  }
  const auto = o.auto !== false;
  let taken = false, t = Math.random() * 6;
  const e = interactable({
    id, name: def.name, pos: V(x, y + 0.5, z), range: 2.2, scanText: o.scanText || '', prompt: () => 'COLLECT',
    use: () => collect(),
  });
  e.target = visionTarget(g, { env: false, heat: item === 'power_cell' ? 0.9 : 0.2, scan: 'collect', hidden: o.hidden, anomaly: o.hidden });
  function collect() {
    if (taken) return;
    taken = true;
    setFlag('picked.' + id);
    Inventory.add(item, amount);
    if (o.xp) Progression.addXp(o.xp, 'discovery');
    sfx('pickup');
    g.parent && g.parent.remove(g);
    world.interactables.splice(world.interactables.indexOf(e), 1);
    world.targets.splice(world.targets.indexOf(e.target), 1);
  }
  updater((dt) => {
    if (taken) return;
    t += dt;
    vis.position.y = 0.5 + Math.sin(t * 2) * 0.08;
    vis.rotation.y += dt;
    if (auto && G.player && e.available()) {
      const p = G.player.pos;
      if ((p.x - x) ** 2 + (p.y + 0.5 - y) ** 2 + (p.z - z) ** 2 < 1.7) collect();
    }
  });
  return e;
}

// ---------------------------------------------------------------- Power socket (puzzle)
export function socket(id, flag, x, z, yaw) {
  const g = group(null, x, 0, z, yaw);
  const light = own(M.red);
  box(g, 0, 1.2, 0, 0.7, 1, 0.3, M.hullDark, { env: false });
  box(g, 0, 1.2, 0.16, 0.3, 0.5, 0.04, M.hullLight, { collide: false, env: false });
  box(g, 0, 1.8, 0.16, 0.5, 0.08, 0.04, light, { collide: false, env: false });
  const powered = () => hasFlag(flag);
  const setLight = () => { const c = powered() ? 0x4dff99 : 0xff3a48; light.emissive.set(c); light.color.set(c).multiplyScalar(0.3); };
  setLight();
  const e = interactable({
    id, name: 'Power Coupling', pos: toWorld(g, 0, 1.2, 0.1),
    scanText: 'Bulkhead power coupling. Accepts a Class-C power cell. The phase regulator is damaged: the coupling must be calibrated by hand when the cell is seated.',
    prompt: () => (powered() ? 'POWERED' : 'INSTALL CELL'),
    canUse: () => (powered() ? 'The coupling is already powered.' : Inventory.count('power_cell') <= 0 ? 'Requires a ' + itemName('power_cell') + '.' : null),
    use: () => UI.calibration('POWER COUPLING CALIBRATION', () => {
      Inventory.remove('power_cell', 1);
      setFlag(flag);
      setLight();
      sfx('success'); vibrate('success');
      notify('Coupling calibrated. Power restored.', 'success');
      Progression.addXp(50, 'puzzle solved');
      log('Restored power to the bridge bulkhead.');
    }, () => {
      Vitals.addEnergy(-5);
      sfx('denied');
      notify('Calibration failed (-5 energy). Higher Reaction Speed widens the window.', 'warning');
    }),
  });
  e.target = visionTarget(g, { env: false, scan: 'interact' });
  return e;
}

// ---------------------------------------------------------------- Pushable crate
export function crate(id, x, z, size, massClass) {
  const [sx, sy, sz] = size;
  const m = box(null, x, sy / 2, z, sx, sy, sz, lit('crate', 0x5a4d38, { map: 'panel' }), { env: false });
  box(m, 0, 0, 0, sx + 0.04, 0.12, sz + 0.04, M.amber, { collide: false, env: false });
  const c = m.userData.collider;
  c.crate = { massClass, mesh: m };
  const e = interactable({
    id, name: 'Cargo Container', pos: m.position, range: 3, hasUse: () => false,
    scanText: 'Sealed cargo container, mass class ' + massClass + '. Pushing it requires Strength ' + massClass + ' or higher. It is tall enough to climb on.',
  });
  e.target = visionTarget(m, { env: false, scan: 'clue' });
  c.crate.push = (dx, dz, speed, dt) => {
    if (Body.get('strength') < massClass) return 'Too heavy: mass class ' + massClass + '. Strength ' + massClass + ' required (current ' + Body.get('strength') + ').';
    // Snap to the dominant axis so the crate moves predictably.
    if (Math.abs(dx) > Math.abs(dz)) { dx = Math.sign(dx); dz = 0; } else { dz = Math.sign(dz); dx = 0; }
    const step = Math.min(Math.max(speed, 0.5), 2) * 0.8 * dt;
    const nx = m.position.x + dx * step, nz = m.position.z + dz * step;
    const test = { x0: nx - sx / 2, x1: nx + sx / 2, y0: 0.05, y1: sy, z0: nz - sz / 2, z1: nz + sz / 2 };
    for (const o of W.colliders) {
      if (o === c || !o.on || o.player) continue;
      if (test.x0 < o.x1 && test.x1 > o.x0 && test.y0 < o.y1 && test.y1 > o.y0 && test.z0 < o.z1 && test.z1 > o.z0) return null; // against a wall
    }
    m.position.x = nx; m.position.z = nz;
    moveCollider(c, nx, sy / 2, nz);
    setFlag('crate.pushed');
    return null;
  };
  return e;
}

// ---------------------------------------------------------------- Environmental scanner
export function envScanner(id, x, z, yaw, zone) {
  const g = group(null, x, 0, z, yaw);
  box(g, 0, 1.4, 0, 0.6, 0.8, 0.2, M.hullLight, { env: false });
  box(g, 0, 1.45, 0.11, 0.45, 0.4, 0.02, M.amber, { collide: false, env: false });
  const e = interactable({
    id: 'survey_' + id, name: 'Environmental Scanner', pos: toWorld(g, 0, 1.4, 0.1), prompt: () => 'SURVEY',
    use: () => {
      const c = zone.cond, E = Environment;
      const safe = coldSeverity(c) <= E.protCold && toxicSeverity(c) <= E.protToxic && c.rad <= E.protRad;
      const body = 'AREA: ' + c.name + '\n' +
        'Temperature: ' + c.temp + '°C (cold severity ' + coldSeverity(c) + ', your protection ' + E.protCold + ')\n' +
        'Atmosphere: ' + atmoName(c.atmo) + ' (severity ' + toxicSeverity(c) + ', your protection ' + E.protToxic + ')\n' +
        'Radiation: ' + c.rad + ' (your protection ' + E.protRad + ')\n' +
        'Gravity: ' + c.gravity.toFixed(2) + ' g\n\n' +
        (safe ? 'ASSESSMENT: Your protection is sufficient.' : 'ASSESSMENT: Protection insufficient. Your suit reserve will drain, then you will take damage. Environmental Weave upgrades raise protection.');
      if (!hasFlag('surveyed.' + id)) { setFlag('surveyed.' + id); Progression.addXp(20, 'survey'); }
      UI.dialog('ENVIRONMENTAL SURVEY', body, [{ label: 'CLOSE', style: 'primary' }]);
    },
  });
  e.target = visionTarget(g, { env: false, heat: 0.3, scan: 'interact' });
  return e;
}

/** A scan-only object (evidence, readouts). */
export function clue(id, name, obj, focus, text, o = {}) {
  const e = interactable({ id, name, pos: focus, range: o.range || 2.4, hasUse: () => false, scanText: text, scanXp: o.xp || 15 });
  e.target = visionTarget(obj, { env: !!o.env, scan: 'clue' });
  return e;
}

// ---------------------------------------------------------------- Hostile drone
export function drone(id, x, y, z, patrol) {
  const g = group(null, x, y, z);
  mesh(g, 'sphere', 0, 0, 0, 0.7, 0.55, 0.7, lit('drone', 0x82868c));
  mesh(g, 'sphere', 0, 0.02, 0.3, 0.25, 0.25, 0.12, M.red);
  const ring = mesh(g, 'ring', 0, 0, 0, 1.5, 1.5, 1.5, M.red);
  ring.rotation.x = Math.PI / 2;
  const home = V(x, y, z);
  let pi = 0, cool = 0, bob = 0;
  const e = interactable({
    id, name: 'Maintenance Drone', pos: g.position, range: 6, hasUse: () => false, interference: 0.5, scanDiff: 1.2, scanXp: 25,
    scanText: 'Maintenance Drone MK-II. Firmware corrupted by an unknown signal; it treats organic life as debris. Contact discharge: 12 damage. Its servos can be slowed by temporal distortion.',
  });
  e.target = visionTarget(g, { env: false, heat: 1, scan: 'hostile' });
  world.threats.push({ pos: g.position, threatName: 'Maintenance Drone MK-II' });
  updater((rawDt) => {
    if (!G.player) return;
    const dt = rawDt * Reality.timeScaleAt(g.position.x, g.position.z);
    bob += dt; ring.rotation.z += 4 * dt;
    const pos = g.position, pl = G.player.pos;
    const player = V(pl.x, pl.y + 1, pl.z);
    const chasing = distSq(player, pos) < 4.5 * 4.5 && distSq(player, home) < 9 * 9;
    let tgt = chasing ? player.clone() : patrol[pi].clone();
    if (!chasing && distSq(tgt, pos) < 0.3) pi = (pi + 1) % patrol.length;
    tgt.y = home.y + Math.sin(bob * 2) * 0.15;
    const d = tgt.sub(pos), len = d.length(), step = 2 * (chasing ? 1.15 : 1) * dt;
    if (len > 0.001) pos.addScaledVector(d, Math.min(1, step / len));
    if (Math.abs(d.x) + Math.abs(d.z) > 0.01) g.rotation.y = Math.atan2(d.x, d.z);
    if (cool > 0) cool -= dt;
    else if (distSq(player, pos) < 1.2 * 1.2) {
      cool = 1.3;
      const kx = player.x - pos.x, kz = player.z - pos.z, kl = Math.hypot(kx, kz) || 1;
      G.player.knockback(kx / kl * 7, 4, kz / kl * 7);
      sfx('damage'); vibrate('heavy');
      Vitals.damage(12, 'drone discharge');
    }
  });
  return e;
}

// ---------------------------------------------------------------- Pulse barrier (Time Distortion)
export function barrier(x, z, sx, sy, sz) {
  const g = group(null, x, 0, z);
  const mat = glow('barrier', 0xffd84d, 0.45).clone();
  const planes = [];
  for (let i = 0; i < 3; i++) planes.push(box(g, 0, sy / 2, -sz / 2 + i * sz / 2, sx, sy, 0.02, mat, { collide: false, env: false }));
  let t = 0, on = true, cool = 0;
  updater((dt) => {
    if (!G.player) return;
    const ts = Reality.timeScaleAt(x, z);
    t += dt * ts;
    // Off for 0.22 s: too short to cross (0.32 s at maximum speed) unless time is slowed.
    if (t >= (on ? 0.7 : 0.22)) { t = 0; on = !on; planes.forEach((p) => (p.visible = on)); world.barrierOn = on; }
    mat.color.set(ts < 1 ? 0x80a0ff : 0xffd84d);
    if (cool > 0) cool -= dt;
    if (!on) return;
    const p = G.player.pos;
    if (Math.abs(p.x - x) < sx / 2 && p.y + 0.9 < sy && Math.abs(p.z - z) < sz / 2 + 0.3) {
      // Repel every frame while active (no grace period); damage at most every 0.6 s.
      const side = p.z >= z ? 1 : -1;
      G.player.knockback(0, 2, side * 9);
      if (cool <= 0) {
        cool = 0.6;
        sfx('damage');
        Vitals.damage(8, 'pulse barrier');
        notify('The barrier pulses too fast to cross. Can you make it slower?', 'warning');
      }
    }
  });
}

// ---------------------------------------------------------------- Spatial portal (Spatial Anomaly)
export function portal(id, x, z, yaw) {
  const g = group(null, x, 0, z, yaw);
  const mat = glow('portal_' + id, 0x66ffb3, 0.5).clone();
  const disc = mesh(g, 'cyl', 0, 1.4, 0, 2.2, 0.02, 2.2, mat);
  disc.rotation.x = Math.PI / 2;
  box(g, -1.25, 1.4, 0, 0.15, 2.8, 0.3, M.violet, { env: false });
  box(g, 1.25, 1.4, 0, 0.15, 2.8, 0.3, M.violet, { env: false });
  const e = interactable({
    id: 'portal_' + id, name: 'Spatial Fold', pos: toWorld(g, 0, 1.4, 0), range: 2.6, prompt: () => 'TRAVERSE', scanXp: 25,
    scanText: 'A stable fold in local space, dormant. A sufficiently strong spatial field (SPATIAL ANOMALY) would let a body pass through to wherever the fold leads.',
    canUse: () => (Reality.spatial && e.partner ? null : 'The fold is dormant. It needs a spatial field to open.'),
    use: () => {
      const exit = toWorld(e.partner.group, 0, 0.1, 1.6);
      G.player.teleport(exit.x, exit.y, exit.z, e.partner.group.rotation.y);
      sfx('reality');
      events.emit('flash', '#66ffb3');
      setFlag('portal.used');
    },
  });
  e.group = g;
  e.target = visionTarget(g, { env: false, anomaly: true, scan: 'clue' });
  updater((dt) => {
    const a = Reality.spatial;
    disc.rotation.y += (a ? 3 : 0.3) * dt;
    mat.opacity = a ? 0.55 + 0.2 * Math.sin(performance.now() / 160) : 0.1;
  });
  return e;
}

// ---------------------------------------------------------------- Phase-locked container (Matter Interaction)
export function phaseLocked(id, x, z) {
  const g = group(null, x, 0, z);
  box(g, 0, 0.4, 0, 1.2, 0.8, 1.2, M.hullDark, { env: false });
  const mat = glow('phase', 0xff66bf, 0.4).clone();
  mesh(g, 'sphere', 0, 1.3, 0, 1.3, 1.3, 1.3, mat).geometry = new THREE.BoxGeometry(0.8, 0.8, 0.8);
  const core = mesh(g, 'sphere', 0, 1.3, 0, 0.4, 0.4, 0.4, M.violet);
  const opened = () => hasFlag('phase.opened');
  if (opened()) core.visible = false;
  const e = interactable({
    id, name: 'Phase-Locked Containment', pos: V(x, 1.1, z), prompt: () => 'EXTRACT', hasUse: () => !opened(),
    scanText: 'Containment cube holding a vibrating core. The field and core exist slightly out of phase with this reality: ordinary hands pass straight through. MATTER INTERACTION could synchronise with it.',
    canUse: () => (opened() ? 'Empty.' : Reality.matter ? null : 'Your hand passes straight through it. It is phase-locked.'),
    use: () => {
      setFlag('phase.opened');
      Inventory.add('phase_core', 1);
      Progression.addXp(50, 'puzzle solved');
      sfx('success');
      core.visible = false;
    },
  });
  e.target = visionTarget(g, { env: false, anomaly: true, heat: 0.5, scan: 'clue' });
  updater((dt) => {
    const t = performance.now() / 1000;
    mat.opacity = Reality.matter ? 0.6 : 0.15 + 0.25 * Math.abs(Math.sin(t * 9) * Math.sin(t * 2.3));
    core.rotation.y += dt;
  });
  return e;
}
