/* Frontline — the campaign. Each mission builds its own map with a small
   builder (cover, enemies, pickups, zones) and lists its objectives in order.

   Objective types:
     destroy — kill every enemy carrying `tag`
     clear   — kill every enemy on the map
     reach   — walk into a zone
     hold    — stay near a zone for `time` seconds while waves attack */
(function (FL) {
  'use strict';

  const U = FL.util;

  function builder(world, rng) {
    const out = { enemies: [], pickups: [], zones: {}, start: { x: world.w / 2, y: world.h - 80, a: -Math.PI / 2 }, spawns: [] };
    const B = {
      rng,
      out,
      world,
      r: (a, b) => a + rng() * (b - a),
      ground(s) { world.paint(s); },
      water(x, y, w, h, extra) {
        world.paint(Object.assign({ t: 'water', x, y, w, h }, extra || {}));
        world.add('water', x, y, w, h);
      },
      rect(kind, x, y, w, h, extra) { return world.add(kind, x, y, w, h, extra); },
      bagsH(x, y, len) { return world.add('sandbag', x, y, len, 18); },
      bagsV(x, y, len) { return world.add('sandbag', x, y, 18, len); },
      // A horseshoe of sandbags open at the back, with an MG at its heart.
      nest(x, y, facing, tag) {
        const f = { down: Math.PI / 2, up: -Math.PI / 2, left: Math.PI, right: 0 }[facing];
        if (facing === 'down') { B.bagsH(x - 44, y + 22, 88); B.bagsV(x - 44, y - 20, 42); B.bagsV(x + 26, y - 20, 42); }
        if (facing === 'up') { B.bagsH(x - 44, y - 40, 88); B.bagsV(x - 44, y - 22, 42); B.bagsV(x + 26, y - 22, 42); }
        if (facing === 'left') { B.bagsV(x - 40, y - 44, 88); B.bagsH(x - 22, y - 44, 42); B.bagsH(x - 22, y + 26, 42); }
        if (facing === 'right') { B.bagsV(x + 22, y - 44, 88); B.bagsH(x - 20, y - 44, 42); B.bagsH(x - 20, y + 26, 42); }
        B.enemy('mg', x, y, { facing: f, tag: tag || 'nest' });
      },
      // Sandbag ring with a way in at the back.
      foxhole(x, y) {
        B.bagsH(x - 34, y - 34, 68);
        B.bagsH(x - 34, y + 16, 14);
        B.bagsH(x + 20, y + 16, 14);
        B.bagsV(x - 34, y - 16, 32);
        B.bagsV(x + 16, y - 16, 32);
      },
      house(x, y, w, h, roof, extra) { return world.add('building', x, y, w, h, Object.assign({ roof }, extra || {})); },
      // Bombed-out house: four walls with doorways and holes, rubble inside.
      ruin(x, y, w, h, doors) {
        const t = 12;
        world.paint({ t: 'floor', x, y, w, h, color: '#7B6E5E' });
        const sides = { n: [x, y, w, t, true], s: [x, y + h - t, w, t, true], w: [x, y, t, h, false], e: [x + w - t, y, t, h, false] };
        for (const k of Object.keys(sides)) {
          const [sx, sy, sw, sh, horiz] = sides[k];
          const len = horiz ? sw : sh;
          const gaps = [];
          if (doors.includes(k)) gaps.push([len / 2 - 28 + B.r(-len / 6, len / 6), 56]);
          if (rng() < 0.45) gaps.push([B.r(20, len - 60), B.r(26, 44)]);
          gaps.sort((a, b) => a[0] - b[0]);
          let pos = 0;
          for (const [g0, gl] of gaps) {
            const a = Math.max(pos, g0);
            if (a - pos > 10) {
              if (horiz) world.add('wall', sx + pos, sy, a - pos, sh);
              else world.add('wall', sx, sy + pos, sw, a - pos);
            }
            pos = Math.max(pos, a + gl);
          }
          if (len - pos > 10) {
            if (horiz) world.add('wall', sx + pos, sy, len - pos, sh);
            else world.add('wall', sx, sy + pos, sw, len - pos);
          }
        }
        for (let i = 0; i < 8; i++) world.decals.push({ t: 'rubble', x: x + B.r(14, w - 14), y: y + B.r(14, h - 14), r: B.r(10, 26) });
      },
      hedge(x, y, w, h) { return world.add('hedge', x, y, w, h); },
      tree(x, y, r, extra) {
        if (world.solidAt(x, y, 16)) return null;
        return world.add('tree', x - 9, y - 9, 18, 18, Object.assign({ canopy: r || B.r(32, 46) }, extra || {}));
      },
      forest(x, y, w, h, n, extra, avoid) {
        for (let i = 0; i < n; i++) {
          const tx = x + rng() * w;
          const ty = y + rng() * h;
          if (avoid && avoid.some((a) => Math.hypot(tx - a[0], ty - a[1]) < a[2])) continue;
          B.tree(tx, ty, null, extra);
        }
      },
      crate(x, y, s, ammo) { return world.add('crate', x, y, s || 30, s || 30, { ammo: !!ammo }); },
      barrel(x, y) { return world.add('barrel', x, y, 24, 24); },
      hedgehogs(x, y, w, h, n, avoid) {
        for (let i = 0; i < n; i++) {
          const hx = x + rng() * w;
          const hy = y + rng() * h;
          if (avoid && avoid.some((a) => Math.hypot(hx - a[0], hy - a[1]) < a[2])) continue;
          if (!world.solidAt(hx, hy, 24)) world.add('hedgehog', hx - 12, hy - 12, 24, 24);
        }
      },
      wire(x, y, w, h) { world.wires.push({ x, y, w, h }); },
      crater(x, y, r) { world.decals.push({ t: 'crater', x, y, r }); },
      craters(x, y, w, h, n) { for (let i = 0; i < n; i++) B.crater(x + rng() * w, y + rng() * h, B.r(18, 46)); },
      enemy(type, x, y, opts) { out.enemies.push(Object.assign({ type, x, y }, opts || {})); },
      squad(x, y, types, opts) {
        types.forEach((t, i) => {
          const a = (i / types.length) * Math.PI * 2 + rng();
          const d = i === 0 ? 0 : 40 + rng() * 20;
          let px = x + Math.cos(a) * d;
          let py = y + Math.sin(a) * d;
          for (let k = 0; k < 8 && world.solidAt(px, py, 14); k++) {
            px = x + B.r(-80, 80);
            py = y + B.r(-80, 80);
          }
          B.enemy(t, px, py, opts);
        });
      },
      pickup(kind, x, y, extra) { out.pickups.push(Object.assign({ kind, x, y }, extra || {})); },
      start(x, y, a) { out.start = { x, y, a: a == null ? -Math.PI / 2 : a }; },
      zone(id, x, y, r, label) { out.zones[id] = { x, y, r, label }; },
      spawns(list) { out.spawns = list; },
    };
    return B;
  }

  /* ===================== Missions ===================== */

  const MISSIONS = [
    {
      id: 'm1', name: 'Omaha Beach', place: 'Normandy, France', date: '6 June 1944', theme: 'beach',
      w: 1600, h: 2600, seed: 1944, par: 270, unlock: 'thompson',
      brief: 'The ramp is down. Cross the beach under fire, get to the seawall, then knock out the three machine-gun nests on the bluff so the next wave can land. Grenades are the quickest way to silence a nest.',
      objectives: [
        { type: 'destroy', tag: 'nest', text: 'Knock out the MG nests' },
        { type: 'reach', zone: 'exit', text: 'Get to the top of the bluff' },
      ],
      build(B) {
        const W = 1600;
        B.ground({ t: 'poly', color: '#7F8A4E', pts: [[0, 0], [W, 0], [W, 1190], [1300, 1210], [900, 1180], [500, 1215], [0, 1195]] });
        B.ground({ t: 'rect', x: 0, y: 1215, w: W, h: 90, color: '#9C9586' });
        B.water(0, 2400, W, 200, { foam: true, c0: '#4F7F8A', c1: '#2D5868' });
        B.ground({ t: 'rect', x: 0, y: 2360, w: W, h: 40, color: '#B5A276' });
        // Seawall with four gaps.
        const gaps = [[190, 270], [700, 790], [1130, 1210], [1480, 1540]];
        let x = 0;
        for (const [a, b] of gaps) { B.rect('concrete', x, 1262, a - x, 26); x = b; }
        B.rect('concrete', x, 1262, W - x, 26);
        B.wire(300, 1310, 380, 34);
        B.wire(830, 1310, 280, 34);
        B.wire(1240, 1310, 220, 34);
        // Landing craft and beach obstacles.
        B.rect('wreck', 260, 2330, 70, 110, { boat: true });
        B.rect('wreck', 1220, 2320, 70, 110, { boat: true });
        const covers = [[480, 1960, 'wreck'], [1120, 1760, 'wreck'], [240, 1620, 'concrete'], [880, 2120, 'concrete'], [1380, 2040, 'concrete'], [700, 1560, 'concrete'], [1300, 1480, 'wreck'], [420, 1420, 'concrete']];
        for (const [cx, cy, k] of covers) {
          if (k === 'wreck') B.rect('wreck', cx - 38, cy - 26, 76, 52, { angle: B.r(-0.15, 0.15) });
          else B.rect('concrete', cx - 30, cy - 9, 60, 18);
        }
        B.hedgehogs(40, 1380, W - 80, 900, 46, [[800, 2300, 120]]);
        B.craters(40, 1350, W - 80, 1000, 26);
        // The bluff: trench lines, three nests, a bunker.
        B.bagsH(60, 1110, 260); B.bagsH(400, 1110, 200); B.bagsH(1000, 1110, 220); B.bagsH(1320, 1110, 220);
        B.nest(330, 1010, 'down');
        B.nest(800, 860, 'down');
        B.nest(1290, 1010, 'down');
        B.rect('concrete', 680, 520, 240, 110, { slit: true });
        B.bagsH(560, 680, 100); B.bagsH(940, 680, 100);
        B.forest(0, 0, W, 760, 26, null, [[800, 200, 160], [800, 575, 170]]);
        B.craters(60, 300, W - 120, 800, 14);
        // Defenders.
        [[150, 1085], [520, 1085], [1100, 1085], [1450, 1085]].forEach(([ex, ey]) => B.enemy('rifle', ex, ey, { facing: Math.PI / 2 }));
        B.squad(330, 930, ['rifle', 'grenadier']);
        B.squad(800, 780, ['rifle', 'smg']);
        B.squad(1290, 930, ['smg', 'grenadier']);
        B.squad(560, 640, ['rifle', 'smg', 'smg']);
        B.squad(1040, 640, ['rifle', 'rifle', 'smg']);
        B.enemy('sniper', 180, 420);
        B.enemy('sniper', 1420, 380);
        B.enemy('officer', 800, 450);
        B.squad(800, 330, ['smg', 'smg', 'grenadier']);
        // Supplies.
        B.pickup('ammo', 470, 1325); B.pickup('ammo', 1000, 1330); B.pickup('grenade', 760, 1335);
        B.pickup('medkit', 940, 1720); B.pickup('medkit', 300, 1340); B.pickup('grenade', 520, 2050);
        B.pickup('ammo', 800, 960); B.pickup('medkit', 800, 600);
        B.zone('exit', 800, 170, 120, 'Bluff top');
        B.start(800, 2310);
      },
    },

    {
      id: 'm2', name: 'Hedgerows', place: 'Bocage country, Normandy', date: '18 June 1944', theme: 'grass',
      w: 2000, h: 2000, seed: 618, par: 330, unlock: 'trench',
      brief: 'The fields inland are boxed in by earth-and-bush hedgerows taller than a man. The enemy is dug in behind them. Clear every field, one gap at a time. Watch the tree lines for snipers.',
      objectives: [{ type: 'clear', text: 'Clear the hedgerows' }],
      build(B) {
        const S = 500;
        const fields = ['#6F8040', '#7D8A47', '#6A7A3C', '#86904F', '#73843F', '#7A7F3F'];
        for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
          if (B.rng() < 0.55) B.ground({ t: 'field', x: c * S + 20, y: r * S + 20, w: S - 40, h: S - 40, color: fields[(r * 4 + c) % fields.length] });
        }
        B.ground({ t: 'road', pts: [[760, 2000], [760, 1500], [740, 1260], [400, 1240], [0, 1250]], width: 46, color: '#9C8A66', ruts: true });
        B.ground({ t: 'road', pts: [[740, 1260], [1260, 1250], [1500, 1240], [2000, 1260]], width: 46, color: '#9C8A66', ruts: true });
        B.ground({ t: 'road', pts: [[1260, 1250], [1260, 600], [1300, 300]], width: 40, color: '#9C8A66', ruts: true });
        // Hedges: one gap per side of every field, plus wherever a road goes through.
        const T = 28;
        const roadGapsV = { 1: [1250], 2: [1250], 3: [1250] };
        const roadGapsH = { 3: [760], 2: [1260], 1: [1260] };
        for (let i = 1; i < 4; i++) {
          for (let seg = 0; seg < 4; seg++) {
            const a = seg * S;
            const b = a + S;
            // Vertical hedge at x = i*S.
            const gv = [a + 60 + B.rng() * (S - 180)];
            (roadGapsV[i] || []).forEach((g) => { if (g > a && g < b) gv.push(g - 40); });
            segHedge(B, i * S - T / 2, a, b, gv, true, T);
            const gh = [a + 60 + B.rng() * (S - 180)];
            (roadGapsH[i] || []).forEach((g) => { if (g > a && g < b) gh.push(g - 40); });
            segHedge(B, i * S - T / 2, a, b, gh, false, T);
          }
        }
        // Farm.
        B.house(1340, 260, 170, 100, '#7E4433');
        B.house(1560, 400, 100, 110, '#6E5B45');
        B.house(160, 1080, 130, 90, '#7E4433');
        B.crate(1300, 420); B.crate(1334, 420); B.crate(1520, 330, 26); B.barrel(1600, 560);
        B.crate(330, 1210); B.barrel(300, 1060);
        // Orchards and lone trees along the hedges.
        for (let x = 1560; x < 1960; x += 80) for (let y = 1560; y < 1960; y += 80) B.tree(x + B.r(-10, 10), y + B.r(-10, 10), 30, { leaf: '#4C6A2E' });
        B.forest(20, 20, 460, 460, 10);
        B.forest(1520, 20, 460, 300, 8);
        for (let i = 0; i < 26; i++) {
          const along = B.rng() * 2000;
          const line = (1 + Math.floor(B.rng() * 3)) * S;
          const off = (B.rng() < 0.5 ? -1 : 1) * 30;
          if (B.rng() < 0.5) B.tree(line + off, along, B.r(28, 40));
          else B.tree(along, line + off, B.r(28, 40));
        }
        B.craters(0, 0, 2000, 2000, 12);
        // Defenders.
        B.squad(250, 1700, ['rifle', 'smg']);
        B.squad(1250, 1750, ['rifle', 'rifle', 'grenadier']);
        B.squad(1700, 1350, ['smg', 'smg']);
        B.squad(250, 1300, ['rifle', 'grenadier']);
        B.squad(750, 1000, ['smg', 'rifle']);
        B.nest(1240, 1100, 'down');
        B.squad(1700, 800, ['rifle', 'smg', 'grenadier']);
        B.squad(300, 700, ['smg', 'smg', 'rifle']);
        B.squad(800, 300, ['rifle', 'rifle']);
        B.squad(1420, 470, ['officer', 'smg', 'smg']);
        B.enemy('sniper', 1760, 160);
        B.enemy('sniper', 180, 220);
        B.pickup('ammo', 900, 1700); B.pickup('medkit', 260, 1500); B.pickup('grenade', 1100, 1300);
        B.pickup('ammo', 400, 900); B.pickup('medkit', 1650, 1100); B.pickup('ammo', 1100, 620); B.pickup('grenade', 600, 450);
        B.start(760, 1920);
      },
    },

    {
      id: 'm3', name: 'Carentan', place: 'Carentan, Normandy', date: '12 June 1944', theme: 'town',
      w: 1800, h: 2400, seed: 612, par: 330, unlock: 'bar',
      brief: 'Fight up the high street, house to house, to the church square. Once you hold the square the enemy will counter-attack from every side street. Hold it until our armour rolls in.',
      objectives: [
        { type: 'reach', zone: 'square', text: 'Reach the church square' },
        {
          type: 'hold', zone: 'square', time: 75, radius: 330, text: 'Hold the square',
          waves: { every: [6, 9], squads: [['rifle', 'smg'], ['smg', 'smg', 'grenadier'], ['rifle', 'rifle', 'officer'], ['smg', 'rifle', 'grenadier']], tanks: [] },
        },
      ],
      build(B) {
        const road = '#7A7468';
        B.ground({ t: 'rect', x: 0, y: 1900, w: 1800, h: 500, color: '#727A48' });
        B.ground({ t: 'rect', x: 840, y: 0, w: 120, h: 2400, color: road });
        for (const y of [1800, 1300, 800]) B.ground({ t: 'rect', x: 0, y: y - 45, w: 1800, h: 90, color: road });
        B.ground({ t: 'rect', x: 640, y: 360, w: 520, h: 330, color: '#8F877A', edge: '#6E675C' });
        B.house(790, 90, 220, 250, '#5E5A55', { steeple: true });
        // City blocks either side of the high street.
        const rows = [[1360, 1740], [860, 1240]];
        for (const [y0, y1] of rows) {
          for (const [x0, x1] of [[60, 820], [980, 1740]]) {
            let x = x0;
            while (x < x1 - 120) {
              const w = Math.min(x1 - x, 150 + Math.floor(B.rng() * 110));
              const h1 = 130 + Math.floor(B.rng() * 60);
              if (B.rng() < 0.6) B.ruin(x, y0, w, h1, ['s', 'n', B.rng() < 0.5 ? 'e' : 'w']);
              else B.house(x, y0, w, h1, B.rng() < 0.5 ? '#8A4B38' : '#6F5545');
              const h2 = 120 + Math.floor(B.rng() * 60);
              if (B.rng() < 0.6) B.ruin(x, y1 - h2, w, h2, ['n', 's']);
              else B.house(x, y1 - h2, w, h2, B.rng() < 0.5 ? '#8A4B38' : '#6F5545');
              x += w + 34;
            }
          }
        }
        // North blocks flank the square.
        B.ruin(80, 360, 240, 200, ['e', 's']); B.house(360, 380, 200, 150, '#8A4B38');
        B.ruin(1240, 360, 220, 200, ['w', 's']); B.house(1500, 380, 220, 150, '#6F5545');
        B.house(80, 80, 300, 160, '#8A4B38'); B.ruin(1420, 80, 300, 190, ['s', 'w']);
        B.ruin(420, 70, 260, 200, ['s', 'e']); B.house(1100, 80, 250, 150, '#6F5545');
        // Barricades, wrecks and junk on the streets.
        B.rect('wreck', 874, 1548, 52, 76, { angle: 0.12 });
        B.bagsH(760, 1200, 120); B.bagsH(960, 1200, 80);
        B.nest(900, 1140, 'down');
        B.bagsH(780, 760, 100); B.bagsH(940, 760, 90);
        B.crate(600, 1780); B.crate(632, 1785); B.barrel(1080, 1820); B.crate(1300, 1280); B.barrel(500, 1310);
        B.crate(1500, 790); B.crate(1532, 790); B.barrel(280, 800); B.barrel(1180, 1770); B.crate(700, 600); B.crate(1080, 620, 26);
        B.forest(0, 1960, 1800, 420, 22, null, [[900, 2300, 140]]);
        B.craters(0, 0, 1800, 2400, 18);
        // Defenders.
        B.squad(500, 1840, ['rifle', 'smg']);
        B.squad(1300, 1850, ['rifle', 'grenadier']);
        B.squad(900, 1420, ['smg', 'smg']);
        B.squad(300, 1300, ['rifle', 'smg']);
        B.squad(1500, 1300, ['smg', 'grenadier', 'rifle']);
        B.squad(560, 820, ['rifle', 'smg']);
        B.squad(1260, 810, ['smg', 'smg', 'rifle']);
        B.squad(900, 640, ['officer', 'smg']);
        B.enemy('sniper', 210, 460);
        B.enemy('sniper', 1340, 440);
        B.pickup('ammo', 900, 1900); B.pickup('medkit', 1080, 1700); B.pickup('grenade', 720, 1300);
        B.pickup('ammo', 1100, 1300); B.pickup('medkit', 700, 800); B.pickup('ammo', 760, 520); B.pickup('ammo', 1040, 520); B.pickup('grenade', 900, 640);
        B.zone('square', 900, 520, 130, 'Church square');
        B.spawns([[60, 800], [1740, 800], [60, 300], [1740, 300], [600, 30], [1200, 30], [60, 1300], [1740, 1300]]);
        B.start(900, 2320);
      },
    },

    {
      id: 'm4', name: 'The Bridge', place: 'The Waal, Netherlands', date: '20 September 1944', theme: 'grass',
      w: 2000, h: 2400, seed: 920, par: 360, unlock: 'bazooka',
      brief: 'Two panzers are guarding the last bridge over the river. Grab the bazooka from the supply dump, destroy both tanks, then fight across the bridge to the far bank. Rifle bullets barely scratch a tank.',
      objectives: [
        { type: 'destroy', tag: 'tank', text: 'Destroy the panzers' },
        { type: 'reach', zone: 'exit', text: 'Cross the bridge' },
      ],
      build(B) {
        B.water(0, 1050, 920, 250, { c0: '#4D7480', c1: '#3A6070' });
        B.water(1080, 1050, 920, 250, { c0: '#4D7480', c1: '#3A6070' });
        B.ground({ t: 'rect', x: 0, y: 1030, w: 2000, h: 20, color: '#6E6A55' });
        B.ground({ t: 'rect', x: 0, y: 1300, w: 2000, h: 20, color: '#6E6A55' });
        B.ground({ t: 'floor', x: 920, y: 1020, w: 160, h: 310, color: '#7D6A50', planks: true });
        B.rect('wall', 920, 1030, 10, 290, { color: '#5E5348' });
        B.rect('wall', 1070, 1030, 10, 290, { color: '#5E5348' });
        B.ground({ t: 'road', pts: [[1000, 2400], [1000, 1320]], width: 70, color: '#8E8471' });
        B.ground({ t: 'road', pts: [[1000, 1030], [1000, 0]], width: 70, color: '#8E8471' });
        B.ground({ t: 'road', pts: [[0, 600], [2000, 600]], width: 60, color: '#8E8471' });
        // South bank: woods and the supply dump.
        B.forest(0, 1340, 2000, 1060, 70, null, [[1000, 2250, 200], [1000, 1700, 60], [700, 1650, 200], [1000, 1400, 120]]);
        B.crate(1080, 2210, 30, true); B.crate(1112, 2210, 30, true); B.crate(1080, 2242, 30, true);
        B.bagsH(1060, 2170, 90);
        B.pickup('weapon', 1050, 2290, { weapon: 'bazooka' });
        B.pickup('ammo', 1130, 2290); B.pickup('grenade', 920, 2280);
        // First panzer, out in the meadow.
        B.ground({ t: 'field', x: 360, y: 1460, w: 700, h: 400, color: '#7C8A47' });
        B.enemy('tank', 700, 1640, { tag: 'tank', facing: Math.PI / 2 });
        B.squad(560, 1560, ['rifle', 'smg']);
        B.squad(1300, 1700, ['rifle', 'grenadier', 'smg']);
        B.squad(1000, 1420, ['smg', 'smg']);
        B.bagsH(880, 1360, 90); B.bagsH(1030, 1360, 90);
        // North bank: a village, a nest covering the bridge, the second panzer.
        B.nest(860, 930, 'down');
        B.bagsH(1060, 950, 100);
        B.enemy('tank', 1200, 780, { tag: 'tank', facing: Math.PI / 2 });
        B.house(200, 700, 180, 110, '#8A4B38'); B.ruin(460, 690, 180, 140, ['s', 'e']); B.house(1350, 680, 160, 120, '#6F5545');
        B.ruin(1580, 680, 200, 150, ['s', 'w']); B.house(300, 380, 200, 120, '#6F5545'); B.house(1500, 360, 170, 140, '#8A4B38');
        B.ruin(640, 330, 200, 160, ['s', 'n']); B.ruin(1150, 320, 180, 170, ['s', 'w']);
        B.crate(780, 700); B.barrel(1160, 640); B.crate(1700, 900); B.crate(240, 900);
        B.forest(0, 0, 2000, 300, 18, null, [[1000, 150, 180]]);
        B.squad(700, 860, ['rifle', 'smg', 'grenadier']);
        B.squad(1400, 900, ['rifle', 'rifle']);
        B.squad(1000, 560, ['officer', 'smg', 'smg']);
        B.squad(500, 560, ['rifle', 'smg']);
        B.squad(1600, 560, ['smg', 'grenadier']);
        B.enemy('sniper', 380, 240);
        B.enemy('sniper', 1640, 230);
        B.pickup('ammo', 1000, 1380); B.pickup('medkit', 1040, 1360);
        B.pickup('ammo', 700, 760); B.pickup('medkit', 1300, 560); B.pickup('ammo', 1000, 420);
        B.craters(0, 1340, 2000, 1000, 16);
        B.craters(0, 0, 2000, 1000, 12);
        B.zone('exit', 1000, 140, 120, 'Far bank');
        B.start(1000, 2320);
      },
    },

    {
      id: 'm5', name: 'Bastogne', place: 'The Ardennes, Belgium', date: '24 December 1944', theme: 'snow',
      w: 2000, h: 2000, seed: 1224, par: 300, unlock: null,
      resupply: { x: 1000, y: 1330, every: 22 },
      brief: 'You are surrounded in the frozen woods. Hold the foxhole line while they throw everything at it. When their heavy tank shows up, it is you or it. There is a bazooka and rockets in the foxholes.',
      objectives: [
        {
          type: 'hold', zone: 'line', time: 110, radius: 300, text: 'Hold the line',
          waves: { every: [5, 8], squads: [['rifle', 'smg'], ['smg', 'smg', 'grenadier'], ['rifle', 'rifle', 'smg'], ['officer', 'smg', 'smg']], tanks: [{ at: 35, type: 'tank' }, { at: 80, type: 'tank' }] },
        },
        { type: 'destroy', tag: 'tiger', text: 'Destroy the Tiger', spawn: { type: 'tiger', x: 1000, y: 60, tag: 'tiger' } },
      ],
      build(B) {
        B.ground({ t: 'road', pts: [[1000, 0], [980, 700], [1020, 1300], [1000, 2000]], width: 70, color: '#C7CDD3', edge: 'rgba(120,130,140,0.25)', ruts: true });
        B.ground({ t: 'circle', x: 1000, y: 1330, r: 320, color: '#E9EDF1' });
        B.foxhole(860, 1260);
        B.foxhole(1140, 1260);
        B.foxhole(1000, 1150);
        B.bagsH(760, 1400, 120); B.bagsH(1120, 1400, 120);
        B.pickup('weapon', 1000, 1400, { weapon: 'bazooka' });
        B.pickup('ammo', 860, 1260); B.pickup('ammo', 1140, 1260); B.pickup('grenade', 1000, 1150); B.pickup('medkit', 1000, 1480);
        B.crate(950, 1460, 28, true); B.crate(1024, 1460, 28, true);
        for (let i = 0; i < 220; i++) {
          const x = B.rng() * 2000;
          const y = B.rng() * 2000;
          if (Math.hypot(x - 1000, y - 1330) < 340 || Math.abs(x - (1000 + (y < 700 ? -20 : 0))) < 60) continue;
          B.tree(x, y, B.r(30, 44), { pine: true });
        }
        for (let i = 0; i < 14; i++) {
          const x = B.r(60, 1940);
          const y = B.r(60, 1940);
          if (Math.hypot(x - 1000, y - 1330) > 380) B.rect('rock', x, y, B.r(30, 60), B.r(24, 44));
        }
        B.craters(600, 900, 800, 800, 16);
        B.zone('line', 1000, 1300, 110, 'The line');
        B.spawns([[1000, 40], [300, 40], [1700, 40], [40, 700], [1960, 700], [40, 1200], [1960, 1200], [400, 1960], [1600, 1960]]);
        B.squad(700, 700, ['rifle', 'smg']);
        B.squad(1350, 750, ['rifle', 'grenadier']);
        B.start(1000, 1330);
      },
    },
  ];

  function segHedge(B, fixed, a, b, gaps, vertical, T) {
    gaps.sort((p, q) => p - q);
    let pos = a;
    for (const g of gaps) {
      if (g - pos > 10) {
        if (vertical) B.hedge(fixed, pos, T, g - pos);
        else B.hedge(pos, fixed, g - pos, T);
      }
      pos = Math.max(pos, g + 80);
    }
    if (b - pos > 10) {
      if (vertical) B.hedge(fixed, pos, T, b - pos);
      else B.hedge(pos, fixed, b - pos, T);
    }
  }

  // Survival: a ruined crossroads and endless waves.
  const SURVIVAL = {
    id: 'survival', name: 'Last Stand', place: 'A crossroads somewhere in France', date: 'Endless', theme: 'town',
    w: 2000, h: 2000, seed: 77, survival: true,
    brief: 'Hold the crossroads for as long as you can. Every wave is bigger than the last, and every fifth brings armour. Supplies drop between waves.',
    objectives: [{ type: 'survive', text: 'Survive' }],
    build(B) {
      const road = '#7A7468';
      B.ground({ t: 'rect', x: 920, y: 0, w: 160, h: 2000, color: road });
      B.ground({ t: 'rect', x: 0, y: 920, w: 2000, h: 160, color: road });
      B.ground({ t: 'circle', x: 1000, y: 1000, r: 200, color: '#8C8476' });
      B.foxhole(1000, 1000);
      B.bagsH(780, 820, 100); B.bagsH(1120, 1160, 100); B.bagsV(820, 1100, 80); B.bagsV(1160, 780, 80);
      const quads = [[120, 120], [1180, 120], [120, 1180], [1180, 1180]];
      for (const [qx, qy] of quads) {
        B.ruin(qx + 60, qy + 60, 260, 200, ['s', 'e', 'n']);
        B.ruin(qx + 400, qy + 400, 220, 220, ['w', 'n']);
        B.house(qx + 420, qy + 60, 200, 150, B.rng() < 0.5 ? '#8A4B38' : '#6F5545');
        B.crate(qx + 120, qy + 420); B.crate(qx + 152, qy + 420); B.barrel(qx + 300, qy + 520);
        B.forest(qx, qy, 680, 680, 6);
      }
      B.rect('wreck', 974, 548, 52, 76, { angle: -0.1 });
      B.rect('wreck', 1400, 970, 76, 52, { angle: 0.1 });
      B.craters(200, 200, 1600, 1600, 26);
      B.pickup('ammo', 1000, 1000); B.pickup('grenade', 1040, 1040);
      B.spawns([[1000, 30], [1000, 1970], [30, 1000], [1970, 1000], [60, 60], [1940, 60], [60, 1940], [1940, 1940]]);
      B.start(1000, 1060);
    },
  };

  // Outpost: an open field to fortify around your HQ (see base.js).
  const OUTPOST = {
    id: 'outpost', name: 'Outpost', place: 'Open country, Normandy', date: 'Endless', theme: 'grass',
    w: 2400, h: 2400, seed: 4242, base: true,
    brief: 'Command has given you a field HQ and a pile of sandbags. Spend supplies on walls, wire, tank traps, machine guns, mortars and anti-tank guns, then hold the HQ against wave after wave. Kills and supply crates earn more. If they can\'t find a way round your walls, they will blast through them.',
    objectives: [{ type: 'base', text: 'Hold the outpost' }],
    build(B) {
      const road = '#9C8A66';
      B.ground({ t: 'road', pts: [[1200, 0], [1180, 700], [1200, 1150]], width: 50, color: road, ruts: true });
      B.ground({ t: 'road', pts: [[1200, 1250], [1230, 1800], [1200, 2400]], width: 50, color: road, ruts: true });
      B.ground({ t: 'road', pts: [[0, 1220], [700, 1180], [1140, 1200]], width: 46, color: road, ruts: true });
      B.ground({ t: 'road', pts: [[1260, 1200], [1800, 1240], [2400, 1200]], width: 46, color: road, ruts: true });
      B.ground({ t: 'circle', x: 1200, y: 1200, r: 260, color: '#7E8A4A' });
      for (const [fx, fy] of [[300, 300], [1700, 260], [260, 1700], [1720, 1720]]) B.ground({ t: 'field', x: fx, y: fy, w: 420, h: 380, color: '#86904F' });
      B.house(1140, 1150, 120, 100, '#5A6234', { hq: true });
      const avoid = [[1200, 1200, 520]];
      B.forest(0, 0, 2400, 2400, 70, null, avoid);
      for (let i = 0; i < 12; i++) {
        const x = B.r(80, 2320);
        const y = B.r(80, 2320);
        if (Math.hypot(x - 1200, y - 1200) > 560) B.rect('rock', x, y, B.r(30, 60), B.r(24, 44));
      }
      B.ruin(1900, 600, 220, 180, ['s', 'w']);
      B.ruin(300, 1950, 200, 160, ['n', 'e']);
      B.house(380, 560, 160, 100, '#8A4B38');
      B.rect('wreck', 1860, 1500, 76, 52, { angle: 0.1 });
      B.craters(0, 0, 2400, 2400, 26);
      B.pickup('supply', 1000, 1000); B.pickup('supply', 1420, 1380); B.pickup('ammo', 1270, 1290);
      B.spawns([[1200, 40], [1200, 2360], [40, 1200], [2360, 1200], [80, 80], [2320, 80], [80, 2320], [2320, 2320]]);
      B.start(1200, 1276, Math.PI / 2);
    },
  };

  FL.missions = {
    MISSIONS, SURVIVAL, OUTPOST, builder,
    byId: (id) => (id === 'survival' ? SURVIVAL : id === 'outpost' ? OUTPOST : MISSIONS.find((m) => m.id === id)),
  };
})(window.FL);
