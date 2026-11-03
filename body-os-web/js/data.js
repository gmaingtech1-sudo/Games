// BODY.OS — game content. Everything here is data: add upgrades, abilities,
// missions or locations without touching the systems that run them.

// ---------------------------------------------------------------- Attributes
// Order matters: saves store attribute values as an array in this order.
export const STATS = [
  { id: 'strength', pool: 'body', name: 'Strength', desc: 'Myofiber output. Determines the heaviest object you can push.' },
  { id: 'speed', pool: 'body', name: 'Movement Speed', desc: 'Locomotion actuator output. Faster exploration, higher movement drain.' },
  { id: 'jump', pool: 'body', name: 'Jump Height', desc: 'Leg actuator burst. Reach higher platforms.' },
  { id: 'endurance', pool: 'body', name: 'Endurance', desc: 'Reduces the energy cost of sustained activity: movement and vision modes.' },
  { id: 'recovery', pool: 'body', name: 'Recovery Efficiency', desc: 'Energy and health regeneration rate.' },
  { id: 'throttle', pool: 'none', name: 'Energy Consumption', desc: 'Power throttle. Higher settings boost speed and jump but drain energy faster. Does not use allocation.' },
  { id: 'reaction', pool: 'brain', name: 'Reaction Speed', desc: 'Widens the success window and slows the marker in timed calibrations.' },
  { id: 'concentration', pool: 'brain', name: 'Concentration', desc: 'Resists interference that interrupts scans and analysis.' },
  { id: 'memory', pool: 'brain', name: 'Memory', desc: 'Recovers memory fragments about discovered locations.' },
  { id: 'threat', pool: 'brain', name: 'Threat Detection', desc: 'Detection range for hostiles. 7+ shows their direction.' },
  { id: 'analysis', pool: 'brain', name: 'Analysis Efficiency', desc: 'Scans and analysis take less time and energy.' },
];
export const STAT_INDEX = Object.fromEntries(STATS.map((s, i) => [s.id, i]));

// ---------------------------------------------------------------- Vision modes
export const VISION = [
  { id: 'normal', name: 'NORMAL', drain: 0, unlock: '', min: 0, desc: 'Standard optical perception. No energy cost.' },
  { id: 'night', name: 'NIGHT VISION', drain: 0.6, unlock: '', min: 0.01, desc: 'Light amplification. See clearly in dark areas. Low drain.' },
  { id: 'scanner', name: 'SCANNER', drain: 0.9, unlock: '', min: 0.01, desc: 'Highlights interactables (cyan), collectables (gold), clues (magenta) and hostiles (red). Enables object analysis.' },
  { id: 'thermal', name: 'THERMAL', drain: 1.6, unlock: 'thermal', min: 0.2, desc: 'Heat signatures glow; cold matter fades to blue. Reveals creatures and powered machinery. Medium drain.' },
  { id: 'dimensional', name: 'DIMENSIONAL', drain: 3.0, unlock: 'dimensional', min: 0.2, desc: 'Perceive adjacent dimensional layers: hidden objects and anomalies become visible and tangible. High drain.' },
];

// ---------------------------------------------------------------- Upgrades
// effects: { t: type, v: value per tier, stat?, key? }
export const UPGRADES = [
  { id: 'kinetic_actuators', name: 'Kinetic Actuators', cat: 'Movement', tiers: 2, pts: [1, 2], nan: [0, 10], level: 1,
    desc: 'Enhanced movement systems. Raises the Movement Speed and Jump Height caps by 1 per tier.',
    fx: [{ t: 'cap', stat: 'speed', v: 1 }, { t: 'cap', stat: 'jump', v: 1 }] },
  { id: 'myofiber_lattice', name: 'Myofiber Lattice', cat: 'Movement', tiers: 2, pts: [1, 2], nan: [5, 15], level: 2,
    desc: 'Reinforced musculature. +2 body allocation budget and +1 Strength cap per tier.',
    fx: [{ t: 'bodyBudget', v: 2 }, { t: 'cap', stat: 'strength', v: 1 }] },
  { id: 'neural_bus', name: 'Neural Bus Expansion', cat: 'Neural', tiers: 2, pts: [1, 2], nan: [5, 15], level: 2,
    desc: 'Additional cognitive bandwidth. +2 brain allocation budget and +1 Reaction/Analysis cap per tier.',
    fx: [{ t: 'brainBudget', v: 2 }, { t: 'cap', stat: 'reaction', v: 1 }, { t: 'cap', stat: 'analysis', v: 1 }] },
  { id: 'thermal_optics', name: 'Thermal Optics', cat: 'Senses', tiers: 1, pts: [1], nan: [10], level: 1, flags: ['schematic.thermal'],
    hint: 'Schematic required: find an upgrade terminal.',
    desc: 'Advanced sensory system. Unlocks THERMAL vision: heat-emitting objects and creatures glow through the dark.',
    fx: [{ t: 'vision', key: 'thermal' }] },
  { id: 'capacitor_lattice', name: 'Capacitor Lattice', cat: 'Energy', tiers: 3, pts: [1, 1, 2], nan: [0, 10, 20], level: 1, flags: ['schematic.capacitor'],
    hint: 'Schematic required: find an upgrade terminal.',
    desc: 'Improved energy capacity. +25 maximum energy per tier.',
    fx: [{ t: 'maxEnergy', v: 25 }] },
  { id: 'environmental_weave', name: 'Environmental Weave', cat: 'Protection', tiers: 3, pts: [1, 1, 2], nan: [5, 15, 25], level: 1, flags: ['schematic.weave'],
    hint: 'Schematic required: find an upgrade terminal.',
    desc: 'Suit protection mesh. +1 cold, toxic and radiation protection and +20 suit capacity per tier.',
    fx: [{ t: 'protCold', v: 1 }, { t: 'protToxic', v: 1 }, { t: 'protRad', v: 1 }, { t: 'suit', v: 20 }] },
  { id: 'regen_matrix', name: 'Regenerative Matrix', cat: 'Recovery', tiers: 2, pts: [1, 2], nan: [5, 15], level: 2,
    desc: 'Enhanced recovery. +25% energy and health regeneration and +10 max health per tier.',
    fx: [{ t: 'regen', v: 0.25 }, { t: 'maxHealth', v: 10 }] },
  { id: 'deep_scanner', name: 'Deep Scanner Suite', cat: 'Scanner', tiers: 2, pts: [1, 1], nan: [5, 10], level: 1,
    desc: 'Scanner upgrade. +40% scanner range and -20% vision mode drain per tier.',
    fx: [{ t: 'scanRange', v: 0.4 }, { t: 'visionDrain', v: 0.2 }] },
  { id: 'reality_kernel', name: 'Reality Kernel', cat: 'Reality', tiers: 1, pts: [2], nan: [15], level: 1, flags: ['mission.wake.complete'],
    hint: 'Dormant. Complete WAKE PROTOCOL.',
    desc: 'The dormant core of BODY.OS. Unlocks REDUCED GRAVITY, DIMENSIONAL PERCEPTION and DIMENSIONAL vision.',
    fx: [{ t: 'ability', key: 'reduced_gravity' }, { t: 'ability', key: 'dimensional_perception' }, { t: 'vision', key: 'dimensional' }] },
  { id: 'chrono_module', name: 'Chrono Distortion Module', cat: 'Reality', tiers: 1, pts: [1], nan: [5], level: 1, requires: ['reality_kernel'],
    desc: 'Reality module. Unlocks TIME DISTORTION: slow designated moving objects and hostiles.',
    fx: [{ t: 'ability', key: 'time_distortion' }] },
  { id: 'matter_module', name: 'Matter Phase Module', cat: 'Reality', tiers: 1, pts: [1], nan: [5], level: 1, requires: ['reality_kernel'],
    desc: 'Reality module. Unlocks MATTER INTERACTION: manipulate phase-locked objects.',
    fx: [{ t: 'ability', key: 'matter_interaction' }] },
  { id: 'spatial_module', name: 'Spatial Fold Module', cat: 'Reality', tiers: 1, pts: [1], nan: [5], level: 1, requires: ['reality_kernel'],
    desc: 'Reality module. Unlocks SPATIAL ANOMALY: stabilise and traverse spatial portals.',
    fx: [{ t: 'ability', key: 'spatial_anomaly' }] },
];
export const UPGRADE_CATS = ['Movement', 'Senses', 'Energy', 'Protection', 'Recovery', 'Scanner', 'Neural', 'Reality'];

// ---------------------------------------------------------------- Reality abilities
export const ABILITIES = [
  { id: 'reduced_gravity', name: 'Reduced Gravity', short: 'LOW-G', cost: 25, dur: 10, cd: 18, color: '#4dd2ff', radius: 6,
    desc: 'Your gravity response drops to 35% for a short time. Leap to otherwise unreachable heights.' },
  { id: 'time_distortion', name: 'Time Distortion', short: 'TIME', cost: 30, dur: 7, cd: 22, color: '#ffd84d', radius: 15,
    desc: 'Slows designated moving machinery and hostiles within 15 m to 20% speed.' },
  { id: 'spatial_anomaly', name: 'Spatial Anomaly', short: 'FOLD', cost: 30, dur: 15, cd: 20, color: '#66ffb3', radius: 8,
    desc: 'Stabilises dormant spatial portals so they can be traversed.' },
  { id: 'dimensional_perception', name: 'Dimensional Perception', short: 'SEE', cost: 20, dur: 12, cd: 14, color: '#bf66ff', radius: 12,
    desc: 'A perception pulse that reveals hidden elements and anomalies for a short time.' },
  { id: 'matter_interaction', name: 'Matter Interaction', short: 'PHASE', cost: 35, dur: 10, cd: 25, color: '#ff66bf', radius: 6,
    desc: 'Phase your hands out of sync with normal matter to manipulate phase-locked objects.' },
];

// ---------------------------------------------------------------- Items
export const ITEMS = {
  nanites: { name: 'Nanite Shards', kind: 'resource', color: 0x1ae6ff, desc: 'Programmable matter. Spent on technology upgrades.' },
  power_cell: { name: 'Power Cell (Class-C)', kind: 'key', color: 0xffb326, desc: 'A charged power cell. Fits standard ship sockets.' },
  energy_capsule: { name: 'Energy Capsule', kind: 'consumable', color: 0x4dff99, desc: 'Restores 50 energy when used.' },
  medigel: { name: 'Medi-Gel', kind: 'consumable', color: 0xff4050, desc: 'Restores 40 health when used.' },
  phase_core: { name: 'Phase Core', kind: 'key', color: 0xb359ff, desc: 'A core vibrating out of phase with reality. It hums near Veyra’s coordinates.' },
};

// ---------------------------------------------------------------- Missions
const obj = (flag, text, hint, xp, points = 0) => ({ flag, text, hint, xp, points });
export const MISSIONS = [
  {
    id: 'wake_protocol', title: 'WAKE PROTOCOL', start: '', complete: 'mission.wake.complete',
    summary: 'You woke inside a derelict ship with no memories. BODY.OS is online. Find out where you are.',
    xp: 250, points: 2, nanites: 10,
    objectives: [
      obj('moved', 'Leave the cryo pod. Use the left joystick to move.', 'Drag on the left side of the screen.', 20),
      obj('interact.medterminal', 'Access the medical terminal.', 'Walk up to the glowing terminal and tap USE.', 30),
      obj('os.opened', 'Open BODY.OS.', 'Tap the BODY.OS button at the top right.', 20),
      obj('os.adjusted', 'Adjust a BODY.OS attribute in the Body section.', 'Open BODY.OS > Body and change any attribute.', 30),
      obj('scanned.bulkhead', 'Scan the sealed bulkhead at the end of the atrium.', 'Scanner vision lets you analyse objects. Try the VISION button.', 40),
      obj('item.power_cell', 'Find a power cell for the bulkhead.', 'The storage bay is dark, and the shelving is tall. Your body can be reconfigured.', 50),
      obj('power.bulkhead', 'Restore power to the bulkhead.', 'Install the cell in the coupling beside the door.', 50),
      obj('transmission.heard', 'Investigate the bridge comm array.', 'The bridge is beyond the bulkhead.', 40),
    ],
  },
  {
    id: 'fractured_signal', title: 'FRACTURED SIGNAL', start: 'mission.wake.complete', complete: 'mission.signal.complete',
    summary: 'The transmission woke something dormant in BODY.OS. The containment lab off the bridge holds answers.',
    xp: 300, points: 2, nanites: 20,
    objectives: [
      obj('upgrade.reality_kernel', 'Install the Reality Kernel (BODY.OS > Technology).', 'It costs 2 upgrade points.', 40),
      obj('glyph.decoded', 'Find and decode the hidden glyph in the containment lab.', 'Some things only exist in another dimension.', 50, 1),
      obj('lab.ledge', 'Reach the observation ledge in the gravity shaft.', 'The ledge is far too high for any body setting.', 50, 1),
      obj('lab.chrono', 'Pass the pulse barrier.', 'Machines obey time. You don’t have to.', 50),
      obj('item.phase_core', 'Retrieve the phase-locked core.', 'Normal hands pass straight through it.', 50),
      obj('lab.vault', 'Reach the sealed vault.', 'There is no door. There is a fold in space.', 60),
    ],
  },
];

// ---------------------------------------------------------------- Locations
const frag = (id, mem, text) => ({ id, mem, text });
export const LOCATIONS = [
  { id: 'derelict', name: 'THE DERELICT', dest: true, playable: true, desc: 'An abandoned research vessel drifting in deep space. Tutorial and hub.' },
  { id: 'veyra', name: 'VEYRA', dest: true, playable: false, desc: 'An alien planet of ancient ruins and environmental hazards.', locked: 'Navigation core offline. Planned expansion: not playable yet.' },
  { id: 'frozen_moon', name: 'THE FROZEN MOON', dest: true, playable: false, desc: 'A cold world that demands environmental adaptation.', locked: 'Coordinates corrupted. Planned expansion: not playable yet.' },
  { id: 'fractured_world', name: 'THE FRACTURED WORLD', dest: true, playable: false, desc: 'A world where gravity and space behave unpredictably.', locked: 'Signal source unknown. Planned expansion: not playable yet.' },

  { id: 'medbay', name: 'Medical Bay', xp: 25, desc: 'Cryo pods line the walls. Only yours was occupied.',
    frags: [frag('medbay.1', 5, 'Pod 7. You remember the cold, and a voice counting backwards from ten.'),
      frag('medbay.2', 8, 'The other pods were never meant for people. They were sized for something taller.')] },
  { id: 'corridor', name: 'Central Corridor', xp: 25, desc: 'The ship’s spine. A coolant line has ruptured near the atrium.',
    frags: [frag('corridor.1', 6, 'You have walked this corridor before. Many times. Running.')] },
  { id: 'engineering', name: 'Engineering', xp: 25, desc: 'Workbenches, an upgrade fabricator and a sealed reactor alcove.',
    frags: [frag('engineering.1', 6, 'Someone rebuilt the fabricator to print parts for BODY.OS. For you.'),
      frag('engineering.2', 9, 'The reactor was shut down deliberately, from the inside.')] },
  { id: 'reactor', name: 'Reactor Alcove', xp: 30, desc: 'Radiation leaks from the cracked shielding.',
    frags: [frag('reactor.1', 7, 'The radiation is not from the reactor. It is coming from the cargo you brought aboard.')] },
  { id: 'storage', name: 'Storage Bay', xp: 25, desc: 'Dark, cold cargo racks. Part of the deck has lost artificial gravity.',
    frags: [frag('storage.1', 5, 'The crates are labelled VEYRA SURVEY — DO NOT OPEN.'), frag('storage.2', 8, 'You opened one.')] },
  { id: 'atrium', name: 'Atrium', xp: 25, desc: 'A domed junction leading to the bridge bulkhead.',
    frags: [frag('atrium.1', 7, 'The maintenance drone started attacking the crew the day the signal arrived.')] },
  { id: 'bridge', name: 'The Bridge', xp: 40, desc: 'Command deck. The comm array is still receiving.',
    frags: [frag('bridge.1', 6, 'The captain’s chair faces the stars, not the controls.'), frag('bridge.2', 9, 'You were not crew. You were the cargo.')] },
  { id: 'reality_lab', name: 'Containment Lab', xp: 40, desc: 'Space bends wrong in here. Instruments disagree with each other.',
    frags: [frag('lab.1', 8, 'BODY.OS was installed here. You agreed to it. You think.')] },
  { id: 'vault', name: 'Sealed Vault', xp: 60, desc: 'A room with no doors.',
    frags: [frag('vault.1', 10, 'The vault holds a map. Veyra is not a planet. It is an address.')] },
];

// ---------------------------------------------------------------- Presets
// Strength, Speed, Jump, Endurance, Recovery, Throttle | Reaction, Concentration, Memory, Threat, Analysis
const pre = (id, name, desc, vision, ...stats) => ({ id, name, desc, vision, stats, custom: false });
export const PRESETS = [
  pre('explorer', 'EXPLORER', 'Balanced movement, enhanced scanning, moderate consumption.', 'scanner', 4, 6, 6, 5, 5, 5, 5, 4, 6, 4, 7),
  pre('survivor', 'SURVIVOR', 'Endurance and recovery for hazards. Low energy throttle.', 'normal', 4, 4, 4, 7, 7, 3, 4, 6, 5, 6, 5),
  pre('combat', 'COMBAT', 'Speed, strength and threat detection. Hungry for energy.', 'normal', 7, 7, 5, 4, 3, 7, 7, 4, 3, 8, 4),
  pre('engineer', 'ENGINEER', 'Strength and analysis for working with technology.', 'scanner', 6, 4, 4, 6, 6, 5, 5, 6, 5, 3, 7),
  pre('reality_breaker', 'REALITY BREAKER', 'Recovery and focus to fuel reality abilities.', 'dimensional', 3, 5, 6, 4, 8, 8, 6, 8, 4, 4, 4),
];
