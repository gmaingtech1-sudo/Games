/* Starforge — the parts catalogue (hulls, wings, engines, weapons, specials,
   paint) and how a loadout adds up to a ship's stats.

   Ship shapes are SVG path strings in "art units": the ship points up (-y),
   and the whole thing fits in a box about 84 units across. Wing and extra
   paths describe the right-hand side only; the left side is a mirror image. */
(function (SF) {
  'use strict';

  const U = SF.util;

  const BASE_SPEED = 400; // world units per second (the playfield is 360 wide)

  const HULLS = [
    {
      id: 'sparrow', name: 'Sparrow', price: 0,
      desc: 'A trusty all-rounder. Easy to fly and hard to break.',
      armor: 100, shield: 40, speed: 1, dmg: 1, hit: 6,
      body: 'M0,-32 C4,-26 7,-16 8,-4 L10,12 L8,22 L-8,22 L-10,12 L-8,-4 C-7,-16 -4,-26 0,-32 Z',
      panels: 'M-8.4,-2 L8.4,-2 M-9.6,12 L9.6,12 M0,-2 L0,22',
      cockpit: { x: 0, y: -13, rx: 3.6, ry: 8 },
      nozzles: [{ x: -4.5, y: 22, r: 3.2 }, { x: 4.5, y: 22, r: 3.2 }],
      mount: { x: 7.5, y: 2, s: 1 },
      gun: { x: 0, y: -32 },
    },
    {
      id: 'dart', name: 'Dart', price: 600,
      desc: 'A needle-thin interceptor. Blazing fast with a tiny hitbox, but it can’t take many hits.',
      armor: 70, shield: 35, speed: 1.22, dmg: 1, hit: 4.5,
      body: 'M0,-38 L3.5,-22 L5,-6 L6,10 L5,22 L-5,22 L-6,10 L-5,-6 L-3.5,-22 Z',
      extra: 'M3.3,-21 L10,-14 L10,-11 L4.4,-13 Z',
      panels: 'M-5.2,4 L5.2,4 M0,10 L0,22 M-3.8,-18 L3.8,-18',
      cockpit: { x: 0, y: -7, rx: 2.8, ry: 7 },
      nozzles: [{ x: 0, y: 22, r: 4.2 }],
      mount: { x: 5, y: 6, s: 0.9 },
      gun: { x: 0, y: -38 },
    },
    {
      id: 'manta', name: 'Manta', price: 1200,
      desc: 'A wide ray with built-in side cannons that fire alongside your main gun.',
      armor: 115, shield: 45, speed: 0.95, dmg: 1, hit: 7.5, sideGuns: true,
      body: 'M0,-26 C8,-25 18,-14 22,0 C24,8 20,16 12,21 L7,23 L-7,23 L-12,21 C-20,16 -24,8 -22,0 C-18,-14 -8,-25 0,-26 Z',
      extra: 'M17.6,-15 L21.4,-15 L21.4,2 L17.6,2 Z',
      panels: 'M-15,6 Q0,12 15,6 M0,12 L0,23 M-10,-12 Q0,-4 10,-12',
      cockpit: { x: 0, y: -10, rx: 5, ry: 7 },
      nozzles: [{ x: -7, y: 23, r: 3.2 }, { x: 0, y: 24, r: 3.4 }, { x: 7, y: 23, r: 3.2 }],
      mount: { x: 19, y: 8, s: 0.75 },
      gun: { x: 0, y: -26 },
      guns: [{ x: -19.5, y: -15 }, { x: 19.5, y: -15 }],
    },
    {
      id: 'bastion', name: 'Bastion', price: 1800,
      desc: 'A flying fortress. Thick armour and a bigger shield, but slow to move.',
      armor: 170, shield: 60, speed: 0.82, dmg: 1, hit: 8.5,
      body: 'M-6,-30 L6,-30 L12,-20 L14,-4 L17,14 L13,25 L-13,25 L-17,14 L-14,-4 L-12,-20 Z',
      extra: 'M13.8,-2 L20,2 L20,14 L16.4,14 Z',
      panels: 'M-12,-20 L12,-20 M-14,-4 L14,-4 M-16.6,12 L16.6,12 M0,-4 L0,25',
      cockpit: { x: 0, y: -14, rx: 5, ry: 6 },
      nozzles: [{ x: -8, y: 25, r: 4.2 }, { x: 8, y: 25, r: 4.2 }],
      mount: { x: 15, y: 4, s: 1.05 },
      gun: { x: 0, y: -30 },
    },
    {
      id: 'wraith', name: 'Wraith', price: 2600,
      desc: 'A stealth-faceted strike craft. Every shot it fires hits 20% harder.',
      armor: 90, shield: 40, speed: 1.1, dmg: 1.2, hit: 5.5,
      body: 'M0,-36 L6,-14 L12,8 L7,20 L0,15 L-7,20 L-12,8 L-6,-14 Z',
      panels: 'M0,-36 L0,15 M6,-14 L0,-2 L-6,-14 M12,8 L0,4 L-12,8',
      cockpit: { x: 0, y: -16, rx: 2.6, ry: 7 },
      nozzles: [{ x: -5, y: 18.5, r: 2.8 }, { x: 5, y: 18.5, r: 2.8 }],
      mount: { x: 10, y: 6, s: 0.95 },
      gun: { x: 0, y: -36 },
    },
  ];

  const WINGS = [
    {
      id: 'swept', name: 'Swept', price: 0,
      desc: 'Classic swept wings. No frills.',
      path: 'M0,-8 L22,8 L24,15 L0,11 Z', tipX: 19, star: { x: 11, y: 7 },
    },
    {
      id: 'delta', name: 'Delta', price: 400,
      desc: 'Big armoured triangles. +25 armour, a little slower.',
      path: 'M0,-18 L27,15 L25,19 L0,15 Z', tipX: 21, star: { x: 10, y: 8 },
      armor: 25, speed: -0.04,
    },
    {
      id: 'forward', name: 'Forward-swept', price: 500,
      desc: 'Twitchy and quick. +10% speed.',
      path: 'M0,4 L18,-13 L22,-11 L8,16 L0,16 Z', tipX: 16, star: { x: 8, y: 5 },
      speed: 0.1,
    },
    {
      id: 'twin', name: 'Twin Pods', price: 900,
      desc: 'Gun pods on the wingtips fire extra shots.',
      path: 'M0,-7 L17,-3 L17,1 L0,1 Z M0,6 L15,12 L15,15 L0,13 Z', tipX: 12, star: { x: 8, y: -2 },
      pod: { x: 16, y: -7, w: 4.6, h: 16 }, gun: { x: 18.3, y: -8 },
    },
    {
      id: 'blades', name: 'Blades', price: 1100,
      desc: 'Razor fins with capacitor edges. +15% fire rate.',
      path: 'M0,-3 L32,10 L33,13 L0,8 Z', tipX: 27, star: { x: 12, y: 6 },
      edge: 'M0,-3 L32,10', rate: 0.15,
    },
    {
      id: 'halo', name: 'Halo Ring', price: 1500,
      desc: 'A shield emitter ring. +30 shield, and the shield recharges faster.',
      halo: true, tipX: 99, star: null,
      shield: 30, regen: 0.3,
    },
  ];

  const ENGINES = [
    { id: 'ion', name: 'Ion Drive', price: 0, desc: 'Steady, clean and reliable.' },
    { id: 'burner', name: 'Afterburner', price: 500, desc: 'Roaring chemical flames. +15% speed.', speed: 0.15 },
    { id: 'fusion', name: 'Fusion Core', price: 900, desc: 'Feeds power to the shields. +25 shield, and it recharges 40% faster.', shield: 25, regen: 0.4 },
    { id: 'quantum', name: 'Quantum Coil', price: 1400, desc: 'Bends time a little. Your special charges 35% faster.', charge: 0.35 },
  ];

  const WEAPONS = [
    { id: 'pulse', name: 'Pulse Blaster', price: 0, power: 0.42, desc: 'Rapid energy bolts. Power-ups add more streams, up to five.' },
    { id: 'scatter', name: 'Scatter Cannon', price: 700, power: 0.5, desc: 'A shotgun blast of pellets. Brutal up close, weak far away.' },
    { id: 'rail', name: 'Railgun', price: 1300, power: 0.5, desc: 'Slow, heavy slugs that punch straight through every ship in a line.' },
    { id: 'beam', name: 'Plasma Beam', price: 1800, power: 0.56, desc: 'A steady beam that melts whatever it touches. Grows wider as you power up.' },
    { id: 'arc', name: 'Arc Caster', price: 2200, power: 0.52, desc: 'Lightning that finds the nearest enemy and jumps from ship to ship. Short range.' },
  ];

  const SPECIALS = [
    { id: 'nova', name: 'Nova Bomb', price: 0, rate: 1, desc: 'A shockwave that wipes enemy bullets off the screen and hurts every enemy.' },
    { id: 'seekers', name: 'Seeker Swarm', price: 600, rate: 1.1, desc: 'Fires fourteen homing missiles that hunt enemies down.' },
    { id: 'aegis', name: 'Aegis Shield', price: 1000, rate: 0.95, desc: 'Six seconds of invincibility. Bullets burst on the bubble, and ramming hurts them.' },
    { id: 'overdrive', name: 'Overdrive', price: 1400, rate: 1, desc: 'For seven seconds your guns fire twice as fast at full power.' },
    { id: 'drones', name: 'Wing Drones', price: 1900, rate: 0.95, desc: 'Two drones fly with you for fifteen seconds and shoot at anything nearby.' },
  ];

  const COLORS = [
    { id: 'snow', name: 'Snow', hex: '#E9EEF5' },
    { id: 'steel', name: 'Steel', hex: '#8C97A8' },
    { id: 'gunmetal', name: 'Gunmetal', hex: '#4A5263' },
    { id: 'night', name: 'Night', hex: '#27305A' },
    { id: 'crimson', name: 'Crimson', hex: '#D8323F' },
    { id: 'ember', name: 'Ember', hex: '#FF6B2C' },
    { id: 'solar', name: 'Solar', hex: '#FFC530' },
    { id: 'lime', name: 'Lime', hex: '#8CE03C' },
    { id: 'jade', name: 'Jade', hex: '#19B98A' },
    { id: 'ocean', name: 'Ocean', hex: '#2F7CF6' },
    { id: 'violet', name: 'Violet', hex: '#7B4DFF' },
    { id: 'rose', name: 'Rose', hex: '#F0479E' },
  ];

  // Energy colour: engine flames, cockpit glass and your shots.
  const ENERGY = [
    { id: 'cyan', name: 'Cyan', hex: '#3DF2FF' },
    { id: 'azure', name: 'Azure', hex: '#4D9BFF' },
    { id: 'mint', name: 'Mint', hex: '#54FFA0' },
    { id: 'lemon', name: 'Lemon', hex: '#FFF05A' },
    { id: 'amber', name: 'Amber', hex: '#FFA63D' },
    { id: 'red', name: 'Red', hex: '#FF4D5A' },
    { id: 'pink', name: 'Pink', hex: '#FF5CD6' },
    { id: 'purple', name: 'Purple', hex: '#B07BFF' },
    { id: 'white', name: 'White', hex: '#F4F7FF' },
  ];

  const DECALS = [
    { id: 'none', name: 'Clean' },
    { id: 'stripe', name: 'Racing stripe' },
    { id: 'twin', name: 'Twin stripes' },
    { id: 'chevron', name: 'Chevrons' },
    { id: 'flames', name: 'Flames' },
    { id: 'tiger', name: 'Tiger' },
    { id: 'checker', name: 'Checker' },
    { id: 'star', name: 'Stars' },
  ];

  const FINISHES = [
    { id: 'matte', name: 'Matte', price: 0, desc: 'Clean factory paint.' },
    { id: 'metal', name: 'Metallic', price: 250, desc: 'A glossy metallic sheen.' },
    { id: 'chrome', name: 'Chrome', price: 700, desc: 'Mirror-polished bands of light.' },
    { id: 'gold', name: 'Gold', price: 1500, desc: 'Solid gold plating. Replaces the body colour.' },
    { id: 'holo', name: 'Holo', price: 2500, desc: 'Shifting rainbow holo foil over your paint.' },
  ];

  const UPGRADES = [
    { id: 'armor', name: 'Armour plating', desc: '+12% hull armour per level' },
    { id: 'shield', name: 'Shield capacitor', desc: '+15 shield per level' },
    { id: 'damage', name: 'Weapon tuning', desc: '+10% damage per level' },
    { id: 'thrust', name: 'Thrusters', desc: '+5% speed per level' },
    { id: 'charge', name: 'Special charger', desc: '+12% special charge rate per level' },
    { id: 'magnet', name: 'Tractor beam', desc: 'Pulls in credits from further away' },
  ];
  const UPGRADE_COST = [150, 300, 550, 900, 1400];
  const UPGRADE_MAX = UPGRADE_COST.length;

  const SLOTS = {
    hull: HULLS, wings: WINGS, engine: ENGINES, weapon: WEAPONS, special: SPECIALS,
    finish: FINISHES, body: COLORS, accent: COLORS, energy: ENERGY, decal: DECALS,
  };
  // Slots whose items cost credits; the rest are free paint.
  const PRICED = ['hull', 'wings', 'engine', 'weapon', 'special', 'finish'];

  const index = {};
  for (const [slot, list] of Object.entries(SLOTS)) {
    index[slot] = {};
    for (const item of list) index[slot][item.id] = item;
  }

  function get(slot, id) {
    const m = index[slot];
    return (m && m[id]) || SLOTS[slot][0];
  }

  const has = (slot, id) => !!(index[slot] && index[slot][id]);

  // Everything the flight needs to know about a ship, from its parts and upgrades.
  function stats(ship, up) {
    up = up || {};
    const h = get('hull', ship.hull);
    const w = get('wings', ship.wings);
    const e = get('engine', ship.engine);
    const wp = get('weapon', ship.weapon);
    const sp = get('special', ship.special);
    const lv = (k) => U.clamp(up[k] || 0, 0, UPGRADE_MAX);
    const armor = Math.round((h.armor + (w.armor || 0)) * (1 + 0.12 * lv('armor')));
    const shield = Math.round(h.shield + (w.shield || 0) + (e.shield || 0) + 15 * lv('shield'));
    const speed = BASE_SPEED * h.speed * (1 + (w.speed || 0) + (e.speed || 0) + 0.05 * lv('thrust'));
    const dmg = h.dmg * (1 + 0.1 * lv('damage'));
    const rate = 1 + (w.rate || 0);
    const regen = 1 + (w.regen || 0) + (e.regen || 0);
    const charge = (1 + (e.charge || 0) + 0.12 * lv('charge')) * sp.rate;
    const magnet = 70 + 26 * lv('magnet');
    const extraGuns = (h.sideGuns ? 1 : 0) + (w.gun ? 1 : 0);
    return {
      armor, shield, speed, dmg, rate, regen, charge, magnet,
      hit: h.hit, sideGuns: !!h.sideGuns, wingGuns: !!w.gun,
      weapon: wp.id, special: sp.id,
      // 0..1 ratings for the hangar's stat bars.
      bars: {
        armor: U.clamp(armor / 260, 0.04, 1),
        shield: U.clamp(shield / 190, 0.04, 1),
        speed: U.clamp((speed - 250) / 330, 0.04, 1),
        fire: U.clamp(wp.power * dmg * rate + extraGuns * 0.1, 0.04, 1),
        special: U.clamp((charge - 0.6) / 1.4, 0.04, 1),
      },
    };
  }

  SF.parts = {
    HULLS, WINGS, ENGINES, WEAPONS, SPECIALS, COLORS, ENERGY, DECALS, FINISHES,
    UPGRADES, UPGRADE_COST, UPGRADE_MAX, SLOTS, PRICED, BASE_SPEED,
    get, has, stats,
    list: (slot) => SLOTS[slot],
    color: (id) => get('body', id),
    energy: (id) => get('energy', id),
    priced: (slot) => PRICED.includes(slot),
  };
})(window.SF = window.SF || {});
