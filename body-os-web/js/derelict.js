// BODY.OS — THE DERELICT, built procedurally (no external models).
//
//                        [VAULT] (sealed: portal only)
//   [BRIDGE] ───── [CONTAINMENT LAB]
//      │ bulkhead (power puzzle)
//   [ATRIUM] (hostile drone)
//      │ coolant leak (cold)
//   [ENGINEERING] ─ [CORRIDOR] ─ [STORAGE BAY] (dark; low gravity; power cell on a 1.9 m catwalk)
//   (reactor: radiation)  │
//                     [MED BAY] (start)
import * as THREE from 'three';
import { W, M, box, mesh, group, room, sign, lit, unlit, glow, hazard, flagZone, lightAnchor, visionTarget } from './world.js';
import { door, terminal, recharge, pickup, socket, crate, envScanner, clue, drone, barrier, portal, phaseLocked } from './entities.js';

export const START = { x: 0, y: 0.05, z: -2.5, yaw: 0 };

export function buildDerelict() {
  W.baseAmbient.setRGB(0.16, 0.17, 0.21);
  W.baseFog = 0x02040a;
  medBay(); corridor(); engineering(); storage(); atrium(); bridge(); lab(); vault();
  return START;
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ------------------------------------------------------------------ MED BAY
function medBay() {
  room([-7, 0, -6], [7, 0, 6], 4, [['N', 0]]);
  lightAnchor(0, 3.4, 0, 0xc0e6ff, 12, 2.6);
  lightAnchor(-4.5, 2.5, -3, 0x1ae6ff, 5, 1.2);
  for (let i = 0; i < 3; i++) { pod(-5.6, -3 + i * 3, 0, i === 0); pod(5.6, -3 + i * 3, 180, false); }

  terminal('medterminal', 'Medical Terminal', 2.5, -5.3, 0, {
    title: 'MEDICAL TERMINAL // POD 7',
    body: 'REVIVAL COMPLETE. Subject 7 vital signs: stable.\n\nNeural lattice integration: 100%. BODY.OS v7.3 is installed and running.\n\n' +
      'BODY.OS lets you reconfigure your body, brain and senses. Every adjustment has a real effect, and every effect has a cost.\n\n' +
      'WARNING: Several BODY.OS modules are not part of the human specification. Origin: unknown.\n\nCrew status: NO RESPONSE. Ship status: DERELICT.',
    section: 0, sectionLabel: 'OPEN BODY.OS',
    scanText: 'Medical terminal, still on emergency power. It holds your revival record.',
  });
  recharge('medbay', 3.5, 5.4, 180);
  pickup('medbay_n1', 'nanites', 5, -2, 0, 4.5);
  box(null, 4, 0.45, -5.3, 1.6, 0.9, 0.6, M.hullLight);
  pickup('medbay_gel', 'medigel', 1, 4, 0.9, -5.2);
  const panel = box(null, -4.6, 1.2, -4.2, 0.5, 0.4, 0.1, M.cyan, { collide: false, env: false });
  clue('pod7', 'Pod 7 Readout', panel, V(-4.6, 1.2, -4.2),
    'Pod 7 occupancy log: 3 revival attempts aborted. Attempt 4 succeeded after BODY.OS overrode the safety interlocks. Something wanted you awake.');
  sign(null, 'MEDICAL BAY', 0, 3.3, 5.8, 180);
  flagZone(0, 2, 0, 14, 4, 12, '', 'medbay');
  door('medbay_door', 'Med Bay Door', 0, 6, true);
}

function pod(x, z, yaw, open) {
  const g = group(null, x, 0, z, yaw);
  box(g, 0, 0.3, 0, 1.1, 0.6, 2.2, M.hullLight);
  box(g, -0.5, 1.4, 0, 0.2, 2.2, 2.2, M.hullDark);
  box(g, -0.38, 1.4, 0, 0.04, 1.6, 1.8, open ? M.amber : M.blue, { collide: false, env: false });
  if (!open) mesh(g, 'capsule', 0, 1.3, 0, 0.9, 0.7, 0.9, M.glass).userData.noVision = true;
}

// ------------------------------------------------------------------ CORRIDOR
function corridor() {
  room([-2.5, 0, 6], [2.5, 0, 30], 4, [['S', 0], ['W', 18], ['E', 18], ['N', 0]]);
  lightAnchor(0, 3.4, 10, 0xb3d9ff, 9, 2.2);
  lightAnchor(0, 3.4, 18, 0xb3d9ff, 9, 2.2);
  lightAnchor(0, 3, 26.5, 0x80c0ff, 8, 2.6);
  const cold = hazard(0, 2, 26.5, 5, 4, 7, { name: 'Coolant leak', temp: -45, atmo: 0, rad: 0, gravity: 1 });
  const frost = lit('frost', 0xbfe6ff, { emissive: 0x335a80, ei: 0.6 });
  box(null, -2.1, 3.2, 26.5, 0.35, 0.35, 7, frost);
  for (let i = 0; i < 6; i++) box(null, -1.6 + (i % 3) * 1.4, 0.05, 24 + i * 0.9, 0.8, 0.1, 0.6, frost, { collide: false });
  sign(null, 'WARNING: COOLANT LEAK', 2.3, 2.8, 23, -90, '#ffb326', 0.24);
  envScanner('corridor', 2.25, 21.5, -90, cold);
  sign(null, 'ENGINEERING', -2.3, 3.3, 18, 90, '#1ae6ff', 0.24);
  sign(null, 'STORAGE', 2.3, 3.3, 18, -90, '#1ae6ff', 0.24);
  flagZone(0, 2, 18, 5, 4, 24, '', 'corridor');
  door('eng_door', 'Engineering Door', -2.5, 18, false);
  door('storage_door', 'Storage Door', 2.5, 18, false);
  door('atrium_door', 'Atrium Door', 0, 30, true);
  pickup('corridor_n1', 'nanites', 5, 1.5, 0, 8);
}

// ------------------------------------------------------------------ ENGINEERING
function engineering() {
  room([-20, 0, 10], [-2.5, 0, 26], 4.5, [['E', 18]]);
  lightAnchor(-8, 3.8, 18, 0xffe6bf, 12, 2.6);
  lightAnchor(-18, 2.5, 18, 0xff3a48, 7, 2.6);

  terminal('fabricator', 'Upgrade Fabricator', -9, 25.3, 180, {
    screen: M.cyan, prompt: 'LINK', title: 'UPGRADE FABRICATOR', heat: 0.7,
    body: 'Fabricator linked to BODY.OS.\n\nSchematics recovered from the ship archive:\n • THERMAL OPTICS (advanced sensory system)\n • CAPACITOR LATTICE (energy capacity)\n • ENVIRONMENTAL WEAVE (suit protection)\n\n' +
      'Spend upgrade points and nanite shards to install technology. Earn points by levelling up: explore, analyse, solve problems.',
    schematics: [['schematic.thermal', 'Thermal Optics'], ['schematic.capacitor', 'Capacitor Lattice'], ['schematic.weave', 'Environmental Weave']],
    section: 5, sectionLabel: 'OPEN TECHNOLOGY',
    scanText: 'A matter fabricator retooled for BODY.OS hardware. The work is recent: weeks, not years.',
  });
  for (let i = 0; i < 3; i++) box(null, -7 - i * 3.2, 0.5, 12, 2.2, 1, 1, M.hullLight);
  box(null, -5, 1.5, 24.5, 2.5, 3, 1.5, M.hullDark, { heat: 0.5 });
  recharge('engineering', -12.5, 25.6, 180);
  pickup('eng_n1', 'nanites', 5, -10, 1, 12);
  pickup('eng_cap', 'energy_capsule', 1, -7, 1, 12);

  box(null, -14.5, 2, 13, 0.3, 4, 6, M.hullDark);
  box(null, -14.5, 2, 23, 0.3, 4, 6, M.hullDark);
  const core = mesh(null, 'cyl', -18.2, 2, 18, 1.6, 4, 1.6, M.red);
  visionTarget(core, { env: false, heat: 1 });
  box(null, -18.2, 2, 18, 1.4, 4, 1.4, M.red, { vision: false }).visible = false;
  const rad = hazard(-17.3, 2, 18, 5.4, 4.5, 16, { name: 'Reactor alcove', temp: 34, atmo: 0, rad: 1, gravity: 1 });
  hazard(-18.2, 2, 18, 3.6, 4.5, 3.6, { name: 'Reactor core', temp: 60, atmo: 0, rad: 2, gravity: 1 }, 1);
  envScanner('reactor', -14.2, 14.5, 90, rad);
  sign(null, 'REACTOR // RADIATION', -14.3, 3.6, 18, 90, '#ff3a48', 0.24);
  terminal('reactorlog', 'Reactor Log', -16.5, 10.6, 0, {
    title: 'REACTOR LOG // CHIEF ENGINEER ODA', xp: 30, interference: 0.4,
    body: 'Day 211. I shut the reactor down by hand. The readings were not coming from the core.\n\nThey were coming from the Veyra cargo, and from Subject 7’s pod. The same frequency.\n\nIf you are reading this, Seven: the fabricator is yours. We built it for you. I’m sorry for everything else.',
    scanText: 'Personal log terminal belonging to the chief engineer. Heavy radiation noise.',
  });
  pickup('reactor_n1', 'nanites', 10, -19, 0, 24);
  flagZone(-11, 2, 18, 17, 4, 16, '', 'engineering');
  flagZone(-17.3, 2, 18, 5, 4, 15, '', 'reactor');
}

// ------------------------------------------------------------------ STORAGE BAY (dark)
function storage() {
  room([2.5, 0, 10], [22, 0, 28], 6, [['W', 18]], false);
  lightAnchor(12, 5.5, 19, 0xff4033, 9, 0.5); // emergency light only: night vision, thermal or the scanner help here
  const dark = lit('storageHull', 0x23272e, { map: 'panel' });
  for (let r = 0; r < 3; r++) {
    const x = 11 + r * 2.6;
    box(null, x, 1.6, 15, 0.8, 3.2, 5, dark);
    box(null, x, 1.6, 24.5, 0.8, 3.2, 5, dark);
  }
  const cat = box(null, 20.25, 0.95, 19, 3.5, 1.9, 14, M.hullLight, { env: false });
  box(null, 18.52, 1.86, 19, 0.06, 0.06, 14, M.amber, { collide: false, env: false });
  clue('catwalk', 'Upper Rack', cat, V(18.5, 1.95, 19),
    'Upper rack deck, 1.90 m. Standard jump output reaches about 1.55 m. Options: raise Jump Height in BODY.OS (7+), or find something to climb.', { range: 3, xp: 20, env: true });
  pickup('cell1', 'power_cell', 1, 20.6, 1.9, 24.5, { auto: false, xp: 20, scanText: 'Class-C power cell, 94% charge. Compatible with standard door couplings.' });
  crate('crate1', 12.5, 20, [1.2, 1, 1.2], 7);

  hazard(6.25, 3, 19, 7.5, 6, 18, { name: 'Damaged gravity plating', temp: 6, atmo: 0, rad: 0, gravity: 0.4 });
  box(null, 5, 1.5, 26.7, 4, 3, 2.4, M.hullLight);
  pickup('lowg_n1', 'nanites', 10, 5, 3, 26.7);
  sign(null, 'GRAVITY PLATING DAMAGED', 2.8, 4.5, 22, 90, '#ffb326', 0.24);
  const debris = [];
  for (let i = 0; i < 7; i++) {
    const d = box(null, 3.8 + (i * 1.3) % 5, 1.2 + (i % 3) * 1.1, 13 + i * 1.9, 0.35, 0.25, 0.4, M.hullLight, { collide: false });
    d.rotation.set(i * 0.4, i * 0.8, i * 0.2);
    debris.push([d, d.position.y, i]);
  }
  W.debris = debris;

  hazard(14, 2, 11.6, 4, 4, 3.2, { name: 'Ruptured vent', temp: 25, atmo: 2, rad: 0, gravity: 1 });
  box(null, 14, 0.08, 10.6, 2, 0.16, 1, lit('vent', 0x4d992e, { emissive: 0x2e7a1a, ei: 0.8 }));
  lightAnchor(14, 1, 11, 0x66ff4d, 4, 1.2);
  pickup('toxic_n1', 'nanites', 10, 15.2, 0, 10.8);
  terminal('manifest', 'Cargo Manifest', 8.5, 10.6, 0, {
    title: 'CARGO MANIFEST', xp: 15,
    body: 'BAY 2 INVENTORY\n\n• VEYRA SURVEY CRATES x14 — DO NOT OPEN\n• Class-C power cell x1 — upper rack deck, east wall\n• Gravity plating, west section — FAULTY, repair pending\n\nNote: emergency lighting only.',
  });
  flagZone(12, 2, 19, 19, 4, 18, '', 'storage');
}

// ------------------------------------------------------------------ ATRIUM
function atrium() {
  room([-6, 0, 30], [6, 0, 42], 6, [['S', 0], ['N', 0, 3, 3.4]]);
  lightAnchor(0, 5.4, 36, 0x99ccff, 12, 2.4);
  mesh(null, 'cyl', 0, 5.9, 36, 7, 0.05, 7, M.blue);
  mesh(null, 'cyl', 0, 0.4, 36, 2.4, 0.8, 2.4, M.hullLight);
  box(null, 0, 0.4, 36, 1.9, 0.8, 1.9, M.hullLight, { vision: false }).visible = false;
  door('bulkhead', 'Bridge Bulkhead', 0, 42, true, {
    width: 3, height: 3.4, requires: 'power.bulkhead', locked: 'Sealed. The bulkhead has no power.',
    scanTitle: 'BRIDGE BULKHEAD', scanXp: 40,
    scanText: 'Emergency bulkhead, sealed. Power coupling: OFFLINE.\nRequirement: one Class-C power cell seated in the coupling beside the door.\nThe coupling’s regulator is damaged: manual calibration needed.',
  });
  socket('bulkhead_socket', 'power.bulkhead', 2.4, 41.75, 180);
  sign(null, 'BRIDGE', 0, 4, 41.8, 180);
  drone('drone1', 0, 1.3, 36, [V(-4, 1.3, 33), V(4, 1.3, 33), V(4, 1.3, 39), V(-4, 1.3, 39)]);
  pickup('atrium_n1', 'nanites', 5, -5, 0, 41);
  flagZone(0, 2, 36, 12, 4, 12, '', 'atrium');
}

// ------------------------------------------------------------------ BRIDGE
function bridge() {
  room([-8, 0, 42], [8, 0, 56], 5, [['S', 0, 3, 3.4], ['E', 50]]);
  lightAnchor(0, 4.4, 49, 0xa6ccff, 13, 2.4);
  const stars = unlit('stars', 0xffffff, { map: 'stars', fog: false });
  box(null, 0, 2.6, 55.8, 13, 3, 0.05, stars, { collide: false, env: false });
  box(null, 0, 0.5, 51, 6, 1, 1, M.hullLight);
  box(null, 0, 1.02, 51, 5.6, 0.04, 0.8, M.cyan, { collide: false, env: false });
  box(null, 0, 0.5, 48.5, 0.9, 1, 0.9, M.hullDark);
  terminal('commarray', 'Comm Array', 3.5, 54.6, 180, {
    screen: M.cyan, prompt: 'RECEIVE', transmission: true, xp: 40, requires: 'power.bulkhead', interference: 0.6,
    title: 'INCOMING TRANSMISSION // SOURCE: VEYRA',
    body: '...signal lock... carrier stable...\n\nSeven. If you are hearing this, BODY.OS woke you. It was never built for a human body. It was built for what you were before.\n\n' +
      'The ruins on Veyra are not ruins. They are waiting.\n\nThe reality kernel inside you is dormant. The crew sealed the containment lab off the bridge. Open it. Learn what you can do.\n\nThen come home.\n\n...signal lost...',
    sets: ['transmission.heard'],
    scanText: 'Long-range comm array. A transmission is looping on a frequency that should not exist.',
  });
  terminal('navigation', 'Navigation Console', -3.5, 54.6, 180, {
    title: 'NAVIGATION', xp: 20, section: 0, sectionLabel: 'VIEW DESTINATIONS',
    body: 'Known destinations:\n\n• VEYRA — ancient ruins, environmental hazards\n• THE FROZEN MOON — extreme cold\n• THE FRACTURED WORLD — unstable gravity and space\n\nNavigation core: OFFLINE. The jump drive needs a phase-stable core and a working navigation map.\n\n(These destinations are planned for a future update and are not playable yet.)',
  });
  terminal('captainlog', 'Captain’s Log', 7.4, 45, -90, {
    title: 'CAPTAIN’S LOG // FINAL ENTRY', xp: 30,
    body: 'We came for a survey and left with a passenger.\n\nThe thing in Pod 7 looks human now. The integration took. BODY.OS reports it can adjust “gravity response, temporal coupling, dimensional perception”. None of those words should belong on a medical readout.\n\nI have ordered the crew to the escape pods. Seven can’t come. Seven isn’t finished yet.',
  });
  door('lab_door', 'Containment Lab', 8, 50, false, {
    requires: 'mission.wake.complete', locked: 'CONTAINMENT LAB: sealed by the captain’s order.',
    scanText: 'Containment lab door, sealed by command authority. The lock is listening on the same frequency as the comm array.',
  });
  sign(null, 'CONTAINMENT', 7.8, 3.3, 50, -90, '#b359ff', 0.24);
  flagZone(0, 2, 49, 16, 4, 14, '', 'bridge');
}

// ------------------------------------------------------------------ CONTAINMENT LAB
function lab() {
  room([8, 0, 44], [26, 0, 58], 8, [['W', 50]]);
  lightAnchor(14, 6, 54, 0xb359ff, 12, 2.4);
  lightAnchor(22, 5, 47, 0x99e6ff, 9, 2);
  box(null, 18.5, 4, 51, 3, 8, 0.3, M.hull);
  box(null, 24.5, 4, 51, 3, 8, 0.3, M.hull);
  box(null, 21.5, 6, 51, 4, 4, 0.3, M.hull);
  box(null, 17, 4, 47.5, 0.3, 8, 7, M.hull);

  // 1) Hidden glyph: only exists in dimensional perception.
  terminal('glyph', 'Dimensional Glyph', 11, 57.4, 180, {
    screen: M.violet, prompt: 'DECODE', title: 'GLYPH // DECODED', xp: 40, hidden: true, sets: ['glyph.decoded'],
    body: 'The glyph resolves into coordinates and a single word in a language you somehow read: RETURN.\n\nYour Memory attribute strains to hold the shape of it.',
  });
  // 2) Gravity shaft ledge (Reduced Gravity).
  box(null, 23.5, 1.9, 55.5, 5, 3.8, 5, M.hullLight);
  box(null, 21, 3.78, 55.5, 0.06, 0.06, 5, M.cyan, { collide: false, env: false });
  const marker = box(null, 20.9, 1.5, 55.5, 0.05, 1, 2, M.violet, { collide: false, env: false });
  clue('ledge', 'Observation Ledge', marker, V(20.9, 1.5, 55.5), 'Observation ledge: 3.8 m. Far beyond any body configuration at standard gravity.', { range: 4 });
  flagZone(23.5, 5, 55.5, 5, 2.4, 5, 'lab.ledge', '', 'From up here you can see the lab’s true shape: it was built around the vault.');
  pickup('ledge_n1', 'nanites', 10, 24.5, 3.8, 56.5);
  // 3) Pulse barrier (Time Distortion).
  barrier(21.5, 51, 3, 3.6, 2);
  lightAnchor(21.5, 3, 51, 0xffd84d, 6, 1.6);
  flagZone(21.5, 1.5, 48.6, 3, 3, 2, 'lab.chrono');
  // 4) Phase-locked core (Matter Interaction).
  phaseLocked('core', 23.5, 46.2);
  // 5) Spatial fold to the vault (Spatial Anomaly).
  const a = portal('lab', 19.2, 45, 0), b = portal('vault', 31, 45, 0);
  a.partner = b; b.partner = a;
  sign(null, 'CONTAINMENT LAB', 8.3, 4, 53, 90, '#b359ff', 0.26);
  recharge('lab', 9, 45.6, 0);
  flagZone(17, 2, 51, 18, 4, 14, '', 'reality_lab');
}

// ------------------------------------------------------------------ VAULT
function vault() {
  room([28, 0, 43], [34, 0, 52], 4, []);
  lightAnchor(31, 3.4, 48, 0x66ffb3, 9, 2.2);
  terminal('starmap', 'Star Map', 31, 51.4, 180, {
    screen: M.violet, title: 'STAR MAP', xp: 50, sets: ['starmap.read'],
    body: 'A navigation map unlike any human chart. Veyra is marked not as a planet but as an origin.\n\nThe Frozen Moon and the Fractured World orbit it like guards.\n\nWith the phase core and this map, the jump drive could reach Veyra. (Planned for a future update: not playable yet.)',
  });
  recharge('vault', 33.4, 47.5, -90);
  flagZone(31, 2, 47.5, 6, 4, 9, 'lab.vault', 'vault');
}

/** Slow drift for low-gravity debris. */
export function tickDebris(t) {
  if (!W.debris) return;
  for (const [d, y, i] of W.debris) { d.position.y = y + Math.sin(t * 0.6 + i) * 0.25; d.rotation.x += 0.003; d.rotation.y += 0.004; }
}
