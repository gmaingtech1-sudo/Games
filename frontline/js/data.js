/* Frontline — the arsenal and the enemy roster. Mission maps live in missions.js. */
(function (FL) {
  'use strict';

  // rate: seconds between shots. spread: radians either side. range: px before a bullet drops.
  const WEAPONS = {
    garand: {
      name: 'M1 Garand', slot: 'primary', mag: 8, reserve: 72, rate: 0.2, dmg: 62, spread: 0.018,
      speed: 1500, range: 780, reload: 1.7, auto: false, pierce: 1, sound: 'rifle', ping: true, kick: 5,
      desc: 'Semi-automatic rifle. Hard-hitting and accurate; pings when the clip is empty.',
    },
    thompson: {
      name: 'Thompson', slot: 'primary', mag: 30, reserve: 210, rate: 0.085, dmg: 24, spread: 0.075,
      speed: 1100, range: 520, reload: 2.1, auto: true, sound: 'smg', kick: 2,
      desc: 'Submachine gun. A storm of bullets up close.', unlock: 'm1',
    },
    trench: {
      name: 'Trench Gun', slot: 'primary', mag: 6, reserve: 42, rate: 0.75, dmg: 17, pellets: 8, spread: 0.24,
      speed: 1000, range: 340, reload: 0.45, shellReload: true, sound: 'shotgun', kick: 9,
      desc: 'Pump shotgun. Clears a room in one blast. Reloads a shell at a time.', unlock: 'm2',
    },
    bar: {
      name: 'B.A.R.', slot: 'primary', mag: 20, reserve: 160, rate: 0.13, dmg: 42, spread: 0.05,
      speed: 1300, range: 700, reload: 2.5, auto: true, sound: 'bar', kick: 4, move: 0.88, pierce: 1,
      desc: 'Browning Automatic Rifle. Heavy, slows you a little, chews through anything.', unlock: 'm3',
    },
    mp40: {
      name: 'MP 40', slot: 'primary', mag: 32, reserve: 128, rate: 0.11, dmg: 21, spread: 0.08,
      speed: 1050, range: 480, reload: 2.2, auto: true, sound: 'smg', kick: 2, pickupOnly: true,
      desc: 'Captured submachine gun.',
    },
    kar98: {
      name: 'Kar98k', slot: 'primary', mag: 5, reserve: 40, rate: 1.0, dmg: 120, spread: 0.006,
      speed: 1800, range: 950, reload: 2.4, auto: false, pierce: 2, sound: 'bolt', kick: 8, pickupOnly: true,
      desc: 'Captured bolt-action rifle. One shot, one kill.',
    },
    pistol: {
      name: 'M1911', slot: 'secondary', mag: 7, reserve: Infinity, rate: 0.18, dmg: 30, spread: 0.04,
      speed: 1000, range: 480, reload: 1.2, auto: false, sound: 'pistol', kick: 3,
      desc: 'Sidearm with endless spare magazines.',
    },
    bazooka: {
      name: 'Bazooka', slot: 'secondary', mag: 1, reserve: 6, rate: 0.6, dmg: 460, splash: 100,
      speed: 560, range: 950, reload: 2.3, auto: false, rocket: true, sound: 'rocket', kick: 10, move: 0.92,
      desc: 'Anti-tank rocket launcher. The only real answer to armour.', unlock: 'm4',
    },
  };

  const PRIMARIES = ['garand', 'thompson', 'trench', 'bar'];
  const SECONDARIES = ['pistol', 'bazooka'];

  /* Enemies. keep: the distance band they like to fight from.
     shot: what each bullet does. burst: bullets per trigger pull. cd: seconds between trigger pulls. */
  const ENEMIES = {
    rifle: {
      name: 'Rifleman', hp: 60, speed: 72, r: 11, range: 560, keep: [230, 470], score: 100,
      shot: { dmg: 12, speed: 800, spread: 0.06 }, burst: 1, burstGap: 0, cd: [1.8, 2.8], sound: 'bolt',
      drop: { kar98: 0.07 }, aim: 0.7,
    },
    smg: {
      name: 'Assault trooper', hp: 60, speed: 104, r: 11, range: 390, keep: [90, 250], score: 120,
      shot: { dmg: 6, speed: 720, spread: 0.13 }, burst: 5, burstGap: 0.1, cd: [1.4, 2.1], sound: 'smg',
      drop: { mp40: 0.1 }, aim: 0.55,
    },
    grenadier: {
      name: 'Grenadier', hp: 70, speed: 82, r: 11, range: 500, keep: [200, 420], score: 150,
      shot: { dmg: 11, speed: 800, spread: 0.07 }, burst: 1, burstGap: 0, cd: [2.0, 3.0], sound: 'bolt',
      grenade: [5, 8], aim: 0.7,
    },
    sniper: {
      name: 'Sniper', hp: 50, speed: 55, r: 11, range: 980, keep: [480, 900], score: 250,
      shot: { dmg: 42, speed: 1700, spread: 0.008 }, burst: 1, burstGap: 0, cd: [3.2, 4.2], sound: 'bolt',
      telegraph: 1.3, drop: { kar98: 0.4 }, aim: 0.2,
    },
    officer: {
      name: 'Officer', hp: 130, speed: 88, r: 12, range: 430, keep: [150, 320], score: 300,
      shot: { dmg: 8, speed: 850, spread: 0.06 }, burst: 2, burstGap: 0.18, cd: [1.2, 1.8], sound: 'pistol',
      drop: { mp40: 0.3 }, aim: 0.5, medkit: 0.6,
    },
    mg: {
      name: 'MG nest', hp: 220, speed: 0, r: 16, range: 640, keep: [0, 9999], score: 400, static: true,
      shot: { dmg: 6, speed: 820, spread: 0.1 }, burst: 12, burstGap: 0.08, cd: [1.6, 2.2], sound: 'mg',
      arc: 1.25, aim: 0.6, bulletArmor: 0.6,
    },
    tank: {
      name: 'Panzer', hp: 1300, speed: 40, r: 30, range: 720, keep: [260, 520], score: 1500, tank: true,
      shot: { dmg: 4, speed: 800, spread: 0.1 }, burst: 6, burstGap: 0.09, cd: [1.8, 2.6], sound: 'mg',
      cannon: { cd: [4.5, 5.8], telegraph: 1.1, dmg: 60, splash: 95 }, bulletArmor: 0.1, aim: 0.6,
    },
    tiger: {
      name: 'Tiger', hp: 2400, speed: 30, r: 36, range: 820, keep: [280, 600], score: 5000, tank: true, big: true,
      shot: { dmg: 5, speed: 800, spread: 0.1 }, burst: 8, burstGap: 0.08, cd: [1.6, 2.2], sound: 'mg',
      cannon: { cd: [3.6, 4.6], telegraph: 1.0, dmg: 70, splash: 110 }, bulletArmor: 0.08, aim: 0.6,
    },
  };

  const RANKS = [
    [0, 'Private'], [25, 'Private First Class'], [75, 'Corporal'], [150, 'Sergeant'],
    [275, 'Staff Sergeant'], [450, 'Lieutenant'], [700, 'Captain'], [1000, 'Major'], [1500, 'Colonel'],
  ];

  function rankFor(kills) {
    let r = RANKS[0];
    let next = null;
    for (let i = 0; i < RANKS.length; i++) {
      if (kills >= RANKS[i][0]) { r = RANKS[i]; next = RANKS[i + 1] || null; }
    }
    return { name: r[1], next: next ? { name: next[1], at: next[0] } : null };
  }

  const DIFFICULTY = {
    recruit: { name: 'Recruit', dmg: 0.55, aim: 0.75, hp: 0.85 },
    regular: { name: 'Regular', dmg: 1.0, aim: 1.0, hp: 1.0 },
    veteran: { name: 'Veteran', dmg: 1.5, aim: 1.25, hp: 1.15 },
  };

  FL.data = { WEAPONS, PRIMARIES, SECONDARIES, ENEMIES, RANKS, rankFor, DIFFICULTY };
})(window.FL);
