/* Starforge — the director: sectors, the waves in each one, and the boss at
   the end. Every sector has six waves and a boss, and each sector is tougher
   than the last. */
(function (SF) {
  'use strict';

  const U = SF.util;
  const A = SF.audio;
  const E = SF.enemies;
  const WAVES = 6;
  const NAMES = ['Outer Rim', 'Cinder Belt', 'Violet Reach', 'Ghost Nebula', 'Solar Forge', 'Iron Maw', 'Abyss Gate', 'Last Light'];
  const BOSS_ORDER = ['dread', 'hive', 'warden'];

  function difficulty(s) {
    return {
      s,
      hp: 1 + 0.45 * (s - 1),
      fire: Math.min(2.4, 1 + 0.2 * (s - 1)),
      bs: Math.min(1.6, 1 + 0.08 * (s - 1)),
      dmg: 1 + 0.15 * (s - 1),
    };
  }

  const sectorName = (s) => NAMES[(s - 1) % NAMES.length];

  /* ---------- Wave templates: each returns [[seconds, spawn()], ...] ---------- */

  const T = {
    line(G, s) {
      const ev = [];
      const n = Math.min(8, 5 + Math.floor((s - 1) / 2));
      const rows = s >= 3 ? 2 : 1;
      for (let r = 0; r < rows; r++) {
        for (let i = 0; i < n; i++) {
          const hx = 40 + (280 * i) / (n - 1);
          ev.push([r * 0.8 + i * 0.1, () => E.spawn(G, 'drone', {
            x: hx, y: -20,
            form: { sx: hx, sy: -20, hx, hy: 80 + r * 46, enter: 1.3, stay: 10 + r * 2, amp: 20, sw: 1.1, ph: i * 0.6 },
          })]);
        }
      }
      return ev;
    },

    vee(G, s) {
      const ev = [];
      const groups = s >= 3 ? 2 : 1;
      for (let g = 0; g < groups; g++) {
        const cx = g === 0 ? U.rand(110, 250) : U.rand(100, 260);
        for (let i = 0; i < 7; i++) {
          const o = i - 3;
          ev.push([g * 2.6 + Math.abs(o) * 0.22, () => E.spawn(G, 'swooper', {
            x: cx + o * 28, y: -24, path: { kind: 'line', vx: -o * 4, vy: 125 },
            shots: s >= 2 ? 1 : 0, fireT: U.rand(0.8, 1.6),
          })]);
        }
      }
      return ev;
    },

    arcs(G, s) {
      const ev = [];
      const H = G.H;
      const n = 6 + Math.min(3, s - 1);
      const pts = (flip) => {
        const f = (x) => (flip ? G.W - x : x);
        return [f(-30), 70, f(140), H * 0.75, f(230), H * 0.75, f(G.W + 40), 60];
      };
      for (let i = 0; i < n; i++) {
        for (const flip of [false, true]) {
          ev.push([(flip ? 1.8 : 0) + i * 0.26, () => E.spawn(G, 'swooper', {
            x: flip ? G.W + 30 : -30, y: 70, path: { kind: 'bezier', pts: pts(flip), dur: 4.4 },
            shots: s >= 2 ? 1 : 0, fireT: U.rand(1, 2.5),
          })]);
        }
      }
      return ev;
    },

    snake(G, s) {
      const ev = [];
      const n = 9 + Math.min(3, s - 1);
      const cx = U.rand(130, 230);
      for (let i = 0; i < n; i++) {
        ev.push([i * 0.3, () => E.spawn(G, 'swooper', {
          x: cx, y: -20, path: { kind: 'snake', x: cx, amp: 110, freq: 2, ph: 0, y0: -20, vy: 95 },
          shots: s >= 3 && i % 3 === 0 ? 1 : 0, fireT: U.rand(1, 2),
        })]);
      }
      return ev;
    },

    chargers(G, s) {
      const ev = [];
      const n = Math.min(6, 3 + Math.floor(s / 2));
      for (let i = 0; i < n; i++) {
        ev.push([i * 0.7, () => E.spawn(G, 'charger', { x: U.rand(40, G.W - 40), y: -24, hy: U.rand(70, 160) })]);
      }
      if (s >= 2) {
        for (let i = 0; i < 4; i++) {
          const hx = 70 + i * 73;
          ev.push([1.5 + i * 0.1, () => E.spawn(G, 'drone', { x: hx, y: -20, form: { sx: hx, sy: -20, hx, hy: 60, enter: 1.2, stay: 9, amp: 16, sw: 1, ph: i } })]);
        }
      }
      return ev;
    },

    gunship(G, s) {
      const ev = [];
      if (s < 3) {
        ev.push([0, () => E.spawn(G, 'gunship', { x: G.W / 2, y: -40, hy: 120 })]);
      } else {
        ev.push([0, () => E.spawn(G, 'gunship', { x: 110, y: -40, hy: 110 })]);
        ev.push([1.2, () => E.spawn(G, 'gunship', { x: 250, y: -40, hy: 160 })]);
      }
      if (s >= 2) {
        for (let i = 0; i < 4; i++) {
          const hx = 50 + i * 87;
          ev.push([2 + i * 0.12, () => E.spawn(G, 'drone', { x: hx, y: -20, form: { sx: hx, sy: -20, hx, hy: 55, enter: 1.2, stay: 11, amp: 14, sw: 1, ph: i } })]);
        }
      }
      return ev;
    },

    rocks(G, s) {
      const ev = [];
      const n = 6 + Math.min(6, s);
      for (let i = 0; i < n; i++) {
        ev.push([i * 0.75 + U.rand(0, 0.4), () => E.spawn(G, 'rock', {
          size: U.chance(0.6) ? 3 : 2, x: U.rand(30, G.W - 30), y: -30, vx: U.rand(-25, 25) || 5, vy: U.rand(45, 85),
        })]);
      }
      return ev;
    },

    mines(G, s) {
      const ev = [];
      const n = 6 + Math.min(4, s - 1);
      for (let i = 0; i < n; i++) ev.push([i * 0.8, () => E.spawn(G, 'mine', { x: U.rand(30, G.W - 30), y: -20 })]);
      for (let i = 0; i < 5; i++) {
        const hx = 50 + i * 65;
        ev.push([3 + i * 0.1, () => E.spawn(G, 'drone', { x: hx, y: -20, form: { sx: hx, sy: -20, hx, hy: 70, enter: 1.2, stay: 9, amp: 18, sw: 1.2, ph: i } })]);
      }
      return ev;
    },

    snipers(G, s) {
      const ev = [
        [0, () => E.spawn(G, 'sniper', { x: 60, y: -30, hx: 60, hy: 72 })],
        [0.5, () => E.spawn(G, 'sniper', { x: G.W - 60, y: -30, hx: G.W - 60, hy: 72 })],
      ];
      return ev.concat(T.arcs(G, s).filter((_, i) => i % 2 === 0).map(([t, f]) => [t + 2.5, f]));
    },

    swarm(G, s) {
      return T.line(G, s).concat(T.arcs(G, s).map(([t, f]) => [t + 3, f]));
    },
  };

  const POOL = [
    { id: 'line', min: 1, w: 3 },
    { id: 'vee', min: 1, w: 3 },
    { id: 'arcs', min: 1, w: 3 },
    { id: 'snake', min: 1, w: 2 },
    { id: 'chargers', min: 1, w: 2 },
    { id: 'rocks', min: 1, w: 2 },
    { id: 'mines', min: 2, w: 2 },
    { id: 'swarm', min: 2, w: 2 },
    { id: 'snipers', min: 3, w: 2 },
  ];

  function plan(s) {
    const out = [];
    let last = null;
    for (let i = 0; i < WAVES; i++) {
      let id;
      if (i === 3) id = 'gunship';
      else if (s === 1 && i === 0) id = 'line';
      else {
        const opts = POOL.filter((o) => o.min <= s && o.id !== last);
        let x = Math.random() * opts.reduce((a, o) => a + o.w, 0);
        id = opts[opts.length - 1].id;
        for (const o of opts) {
          x -= o.w;
          if (x <= 0) {
            id = o.id;
            break;
          }
        }
      }
      out.push(id);
      last = id;
    }
    return out;
  }

  class Director {
    constructor(G) {
      this.G = G;
      this.sector = 0;
      this.wave = 0;
      this.phase = 'idle';
      this.timer = 0;
      this.events = [];
      this.waveT = 0;
    }

    begin(sector) {
      const G = this.G;
      this.sector = sector;
      G.sector = sector;
      G.diff = difficulty(sector);
      this.plan = plan(sector);
      this.wave = -1;
      this.phase = 'intro';
      this.timer = 2.8;
      G.bg.setTheme(sector - 1);
      G.warp = 1;
      G.banner(`Sector ${sector}`, sectorName(sector), 'sector');
      A.music('flight');
      A.play('sector');
    }

    nextWave() {
      const G = this.G;
      this.wave++;
      this.phase = 'wave';
      this.waveT = 0;
      this.events = T[this.plan[this.wave]](G, this.sector).sort((a, b) => a[0] - b[0]);
    }

    alive() {
      let n = 0;
      for (const e of this.G.enemies) if (e.alive) n++;
      return n;
    }

    label() {
      if (this.phase === 'bosswarn' || this.phase === 'boss') return 'Boss';
      if (this.phase === 'clear') return 'Clear';
      return `Wave ${Math.max(1, this.wave + 1)}/${WAVES}`;
    }

    update(dt) {
      const G = this.G;
      switch (this.phase) {
        case 'intro':
          this.timer -= dt;
          if (this.timer <= 0) this.nextWave();
          break;
        case 'wave':
          this.waveT += dt;
          while (this.events.length && this.events[0][0] <= this.waveT) this.events.shift()[1]();
          if (!this.events.length && (this.alive() === 0 || this.waveT > 32)) {
            this.phase = 'gap';
            this.timer = 1.1;
          }
          break;
        case 'gap':
          this.timer -= dt;
          if (this.timer <= 0) {
            if (this.wave + 1 < WAVES) this.nextWave();
            else {
              this.phase = 'bosswarn';
              this.timer = 2.6;
              G.banner('Warning', 'Boss approaching', 'warn');
              A.play('warning');
              A.music('boss');
            }
          }
          break;
        case 'bosswarn':
          this.timer -= dt;
          if (this.timer <= 0 && this.alive() === 0) {
            this.phase = 'boss';
            G.bossDown = false;
            const kind = BOSS_ORDER[(this.sector - 1) % BOSS_ORDER.length];
            G.boss = E.spawn(G, 'boss', { kind, hp: 5000 * G.diff.hp });
          }
          break;
        case 'boss':
          if (G.bossDown) {
            this.phase = 'clear';
            this.timer = 4.2;
            G.sectorClear(this.sector);
          }
          break;
        case 'clear':
          this.timer -= dt;
          if (this.timer <= 0) this.begin(this.sector + 1);
          break;
        default:
      }
    }
  }

  SF.Director = Director;
  SF.waves = { difficulty, sectorName, WAVES, T, plan };
})(window.SF = window.SF || {});
