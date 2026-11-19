/* Nested Arcade — a game inside a game inside a game.

   Layer 1, the Arcade, is drawn as vector shapes straight onto the screen.
   Layer 2, Star Hopper, runs on its own 160×200 pixel canvas, and the Arcade
   draws that canvas onto the screen of its cabinet. Layer 3, Pip Dash, runs
   on a 40×32 LCD canvas, and Star Hopper draws that onto the screen of the
   handheld its astronaut is holding. The camera zooms between them: going
   "into" a game is just the camera flying into the parent's screen.

   Time runs slower the deeper you are (×1, ×¼, ×1/16), against a clock that
   closes the arcade at midnight. */
(() => {
  'use strict';

  // ---------- layout of the nesting ----------
  const W1 = 360, H1 = 640, FLOOR = 330;          // the arcade, in world units
  const P2 = { x: 118, y: 92, w: 124, h: 155 };   // Star Hopper's screen, inside the arcade
  const W2 = 160, H2 = 200;                       // Star Hopper's pixels
  const P3 = { x: 40, y: 40, w: 80, h: 64 };      // the handheld's LCD, inside Star Hopper
  const W3 = 40, H3 = 32;                         // Pip Dash's pixels
  const NIGHT = 240;                              // minutes from 8 PM to midnight
  const RATE = [0, 1, 0.25, 1 / 16];              // game minutes per real second, by depth
  const RATE_LABEL = ['', 'time ×1', 'time ×¼', 'time ×1/16'];
  const TICKET_DIV = 10;                          // Star Hopper points per ticket

  const PRIZES = [
    { id: 'socks', ico: '🧦', name: 'Lucky Socks', cost: 25, desc: 'Coins turn up on the carpet twice as often.' },
    { id: 'magnet', ico: '🧲', name: 'Coin Magnet', cost: 30, desc: 'Nearby coins fly into your pocket.' },
    { id: 'battery', ico: '🔋', name: 'Fresh Batteries', cost: 50, desc: 'Pip Dash: an extra heart and a gentler start.' },
    { id: 'life', ico: '⛑️', name: 'Spare Helmet', cost: 60, desc: 'Star Hopper: one more life every game.' },
    { id: 'gold', ico: '💾', name: 'The Golden Cartridge', cost: 350, desc: 'The grand prize. Nobody knows what game is on it.' },
  ];

  // ---------- small helpers ----------
  const $ = (id) => document.getElementById(id);
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

  // ---------- save ----------
  const SAVE_KEY = 'nested-arcade-v1';
  let best = { wins: 0, fastest: null, hi2: 0, hi3: 0, nights: 0 };
  try { best = Object.assign(best, JSON.parse(localStorage.getItem(SAVE_KEY)) || {}); } catch (e) { /* fresh */ }
  const saveBest = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(best)); } catch (e) { /* blocked */ } };

  // ---------- host bridge (Android app or plain browser) ----------
  const host = window.AndroidHost || null;
  function buzz(ms) {
    try {
      if (host && host.haptic) host.haptic(ms);
      else if (navigator.vibrate) navigator.vibrate(ms);
    } catch (e) { /* no motor */ }
  }

  // ---------- sound: each layer has its own voice ----------
  let AC = null, muted = false;
  try { muted = localStorage.getItem(SAVE_KEY + '-muted') === '1'; } catch (e) { /* */ }
  function audio() {
    if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; } }
    if (AC.state === 'suspended') AC.resume();
  }
  function tone(f, d, type, vol, f2, delay) {
    if (!AC || muted) return;
    const t = AC.currentTime + (delay || 0);
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
    g.gain.setValueAtTime(vol || 0.04, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(AC.destination);
    o.start(t); o.stop(t + d + 0.03);
  }
  const sfx = {
    coin: () => { tone(988, 0.06, 'triangle', 0.08); tone(1319, 0.14, 'triangle', 0.08, 0, 0.06); },
    clunk: () => { tone(180, 0.12, 'triangle', 0.12, 90); tone(1200, 0.05, 'square', 0.03, 0, 0.1); },
    nom: () => tone(220, 0.12, 'sawtooth', 0.03, 110),
    zoomIn: () => tone(200, 0.8, 'sine', 0.06, 1400),
    zoomOut: () => tone(1400, 0.8, 'sine', 0.05, 200),
    hop: () => tone(330, 0.09, 'square', 0.025, 660),
    star: () => { tone(880, 0.05, 'square', 0.03); tone(1760, 0.08, 'square', 0.03, 0, 0.05); },
    hurt: () => tone(300, 0.35, 'sawtooth', 0.05, 60),
    rocket: () => tone(120, 0.6, 'sawtooth', 0.04, 900),
    over: () => { [440, 349, 294, 220].forEach((f, i) => tone(f, 0.18, 'square', 0.035, 0, i * 0.17)); },
    pip: () => tone(2093, 0.04, 'square', 0.02),
    beep: () => tone(1568, 0.025, 'square', 0.015),
    bonk: () => tone(392, 0.15, 'square', 0.03, 196),
    ticket: (i) => tone(1800 + (i % 3) * 120, 0.02, 'square', 0.012, 0, i * 0.035),
    buy: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.12, 'triangle', 0.06, 0, i * 0.08)); },
    fanfare: () => { [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, 0.22, 'triangle', 0.07, 0, i * 0.13)); },
    closing: () => { [784, 659, 523, 392].forEach((f, i) => tone(f, 0.4, 'sine', 0.06, 0, i * 0.35)); },
  };

  // ---------- 3×5 pixel font for the inner games ----------
  const FONT = {};
  (`A010101111101101B110101110101110C011100100100011D110101101101110E111100110100111F111100110100100` +
   `G011100101101011H101101111101101I111010010010111J001001001101010K101101110101101L100100100100111` +
   `M101111111101101N110101101101101O010101101101010P110101110100100Q010101101110011R110101110101101` +
   `S011100010001110T111010010010010U101101101101111V101101101101010W101101111111101X101101010101101` +
   `Y101101010010010Z1110010101001110111101101101111101011001001011121100010101001113110001010001110` +
   `41011011110010015111100110001110601110011110111171110010100100108111101111101111911110111100111 ` +
   `000000000000000!010010010000010?110001010000010.000000000000010:000010000010000-000000111000000` +
   `+000010111010000/001001010100100x000101010101000'010010000000000`).replace(/(.)([01]{15})/g, (m, ch, bits) => { FONT[ch] = bits; return ''; });

  function ptext(g, s, x, y, col, sc, align) {
    sc = sc || 1; s = String(s).toUpperCase();
    const w = s.length * 4 * sc - sc;
    if (align === 'c') x = Math.round(x - w / 2); else if (align === 'r') x = x - w;
    g.fillStyle = col;
    for (let i = 0; i < s.length; i++) {
      const gl = FONT[s[i]];
      if (!gl) continue;
      for (let b = 0; b < 15; b++) if (gl[b] === '1') g.fillRect(x + i * 4 * sc + (b % 3) * sc, y + ((b / 3) | 0) * sc, sc, sc);
    }
  }
  function spr(g, rows, x, y, pal, flip) {
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      for (let c = 0; c < row.length; c++) {
        const ch = row[flip ? row.length - 1 - c : c];
        if (ch !== '.') { g.fillStyle = pal[ch]; g.fillRect(x + c, y + r, 1, 1); }
      }
    }
  }

  // ---------- canvases ----------
  const cv = $('c'), ctx = cv.getContext('2d');
  const c2 = document.createElement('canvas'); c2.width = W2; c2.height = H2;
  const x2 = c2.getContext('2d');
  const c3 = document.createElement('canvas'); c3.width = W3; c3.height = H3;
  const x3 = c3.getContext('2d');
  let SW = 0, SH = 0, DPR = 1, TOP = 70, BOT = 12;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 3);
    SW = window.innerWidth; SH = window.innerHeight;
    cv.width = Math.round(SW * DPR); cv.height = Math.round(SH * DPR);
    cv.style.width = SW + 'px'; cv.style.height = SH + 'px';
    const hb = $('hud').getBoundingClientRect();
    TOP = Math.max(56, hb.bottom + 6 || 70);
  }
  window.addEventListener('resize', resize);

  // ---------- game state ----------
  const G = {
    mode: 'title',           // title | play | ending | over
    clock: 0, coins: 3, tickets: 0, shownTix: 0, earned: 0, runs: 0, handhelds: 0,
    owned: {}, depth: 1, view: 1, trans: null, paused: false, shop: false,
    warned: false, endT: 0,
  };

  // ======================================================================
  // LAYER 3 — PIP DASH, on the handheld's LCD
  // ======================================================================
  const LCD = ['#a9c64e', '#83a23c', '#3f5c27', '#1d3117'];
  const L3 = {
    state: 'off', t: 0,
    start() {
      this.state = 'title'; this.t = 0; this.lane = 2; this.pips = 0; this.objs = [];
      this.hearts = 2 + (G.owned.battery ? 1 : 0);
      this.speed = G.owned.battery ? 9 : 11; this.spawnT = 0.6; this.hit = 0; this.playT = 0;
      x3.fillStyle = LCD[0]; x3.fillRect(0, 0, W3, H3);
    },
    tap(dir) {
      if (this.state !== 'play' || G.paused || G.trans) return;
      const n = clamp(this.lane + dir, 0, 4);
      if (n !== this.lane) { this.lane = n; sfx.beep(); buzz(4); }
    },
    end() {
      if (this.state === 'over' || this.state === 'off' || this.state === 'done') return;
      this.state = 'over'; this.t = 0;
      best.hi3 = Math.max(best.hi3, this.pips); saveBest();
      sfx.over();
    },
    update(dt) {
      this.t += dt;
      if (this.state === 'title') { if (this.t > 1.5) { this.state = 'play'; this.t = 0; } return; }
      if (this.state === 'over') { if (this.t > 1.7) { this.state = 'done'; Game.l3Over(this.pips); } return; }
      if (this.state !== 'play') return;
      this.playT += dt;
      this.speed += dt * 0.55;
      this.hit = Math.max(0, this.hit - dt);
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        this.spawnT = Math.max(0.42, 1.25 - this.playT * 0.018) * rand(0.8, 1.2);
        const lanes = [0, 1, 2, 3, 4].sort(() => Math.random() - 0.5);
        const blocks = this.playT > 25 && Math.random() < 0.4 ? 2 : 1;
        for (let i = 0; i < blocks; i++) this.objs.push({ lane: lanes[i], y: 2, k: 'b' });
        if (Math.random() < 0.5) this.objs.push({ lane: lanes[blocks], y: Math.random() < 0.5 ? 2 : -4, k: 'p' });
      }
      for (const o of this.objs) o.y += this.speed * dt;
      for (const o of this.objs) {
        if (o.dead || o.lane !== this.lane) continue;
        if (o.k === 'b' && o.y + 3 >= 27 && o.y <= 30) {
          o.dead = true; this.hearts--; this.hit = 0.7; sfx.bonk(); buzz(30);
          if (this.hearts <= 0) { this.end(); return; }
        } else if (o.k === 'p' && o.y + 2 >= 27 && o.y <= 30) {
          o.dead = true; this.pips++; sfx.pip(); buzz(3);
        }
      }
      this.objs = this.objs.filter((o) => !o.dead && o.y < H3 + 2);
    },
    render() {
      const g = x3;
      // Slow LCD pixels: fade the last frame instead of wiping it.
      g.globalAlpha = 0.55; g.fillStyle = LCD[0]; g.fillRect(0, 0, W3, H3); g.globalAlpha = 1;
      const blink = (this.t * 4 | 0) % 2 === 0;
      if (this.state === 'title' || this.state === 'off') {
        ptext(g, 'PIP', 20, 7, LCD[3], 1, 'c');
        ptext(g, 'DASH', 20, 14, LCD[3], 1, 'c');
        if (blink) ptext(g, 'READY', 20, 23, LCD[2], 1, 'c');
        return;
      }
      // HUD
      ptext(g, String(this.pips), 1, 0, LCD[3]);
      for (let i = 0; i < this.hearts; i++) {
        const hx = W3 - 4 - i * 4;
        g.fillStyle = LCD[3]; g.fillRect(hx, 1, 1, 1); g.fillRect(hx + 2, 1, 1, 1); g.fillRect(hx, 2, 3, 1); g.fillRect(hx + 1, 3, 1, 1);
      }
      g.fillStyle = LCD[1]; g.fillRect(0, 5, W3, 1);
      for (let l = 1; l < 5; l++) for (let y = 8; y < H3; y += 4) g.fillRect(l * 8, y, 1, 1);
      for (const o of this.objs) {
        const x = o.lane * 8;
        if (o.y < 6) continue;
        if (o.k === 'b') { g.fillStyle = LCD[3]; g.fillRect(x + 1, o.y, 6, 3); g.fillStyle = LCD[2]; g.fillRect(x + 2, o.y + 1, 4, 1); }
        else if (blink || o.y > 22) { g.fillStyle = LCD[2]; g.fillRect(x + 3, o.y, 2, 2); }
      }
      if (!(this.hit > 0 && blink)) {
        const x = this.lane * 8 + 2;
        g.fillStyle = LCD[3];
        g.fillRect(x + 1, 27, 2, 1); g.fillRect(x, 28, 4, 1); g.fillRect(x, 29, 1, 1); g.fillRect(x + 3, 29, 1, 1);
      }
      if (this.state === 'over' || this.state === 'done') {
        g.fillStyle = LCD[0]; g.fillRect(4, 10, 32, 14);
        g.fillStyle = LCD[3]; g.fillRect(4, 10, 32, 1); g.fillRect(4, 23, 32, 1);
        ptext(g, 'OVER', 20, 12, LCD[3], 1, 'c');
        ptext(g, this.pips + ' PIPS', 20, 18, LCD[2], 1, 'c');
      }
    },
  };

  // ======================================================================
  // LAYER 2 — STAR HOPPER, in the arcade cabinet
  // ======================================================================
  const ASTRO = ['..www..', '.wcccw.', '.wcccw.', '..www..', '.wwwww.', 'w.www.w', '..www..', '..w.w..', '.ww.ww.'];
  const ASTRO_PAL = { w: '#f4f4ff', c: '#4fd8ff' };
  const UFO = ['...ggg...', '..gcccg..', 'mmmmmmmmm', '.m.m.m.m.'];
  const UFO_PAL = { g: '#9df58a', c: '#d7ffcf', m: '#b04cff' };
  const SKY = []; for (let i = 0; i < 46; i++) SKY.push({ x: rand(0, W2), y: rand(0, H2), f: rand(0.05, 0.35), c: Math.random() < 0.2 ? '#ffd76a' : '#8d8ad6' });

  const L2 = {
    state: 'attract', t: 0, paused: false, handT: 0,
    start() {
      this.state = 'play'; this.paused = false; this.t = 0;
      this.lives = 3 + (G.owned.life ? 1 : 0); this.bonus = 0; this.score = 0;
      this.px = 80; this.py = 180; this.vx = 0; this.vy = -240; this.camY = 0; this.startY = 180; this.height = 0;
      this.plats = [{ x: 80, y: 190, w: 40, k: 'n' }]; this.stars = []; this.ufos = []; this.items = []; this.parts = []; this.pops = [];
      this.inv = 0; this.rocket = 0; this.nextHand = 280; this.ufoT = 6; this.face = 1;
      this.topY = 190;
      while (this.topY > -60) { this.topY -= rand(22, 32); this.addPlat(this.topY); }
    },
    addPlat(y) {
      const h = this.startY - y, d = clamp(h / 4000, 0, 1);
      const r = Math.random();
      const k = h < 150 ? 'n' : r < 0.08 + 0.3 * d ? 'm' : r < 0.12 + 0.45 * d ? 'c' : 'n';
      const p = { x: rand(14, W2 - 14), y, w: k === 'n' ? 24 - 6 * d : 22, k, vx: k === 'm' ? (Math.random() < 0.5 ? -1 : 1) * rand(20, 30 + 25 * d) : 0 };
      this.plats.push(p);
      if (h > this.nextHand && k !== 'c') {
        this.items.push({ x: p.x, y: y - 11, t: 0 });
        this.nextHand = h + rand(650, 900);
      } else if (Math.random() < 0.33) {
        this.stars.push({ x: p.x + rand(-6, 6), y: y - rand(10, 22), t: rand(0, 6) });
      }
    },
    gap() {
      const d = clamp(this.height / 4000, 0, 1);
      return rand(22 + 12 * d, 38 + 19 * d);
    },
    hurt(fell) {
      this.lives--; sfx.hurt(); buzz(60);
      for (let i = 0; i < 14; i++) this.parts.push({ x: this.px, y: this.py - 4, vx: rand(-60, 60), vy: rand(-80, 20), t: 0.7, c: '#f4f4ff' });
      if (this.lives <= 0) {
        this.state = 'over'; this.t = 0; this.score = this.calcScore();
        best.hi2 = Math.max(best.hi2, this.score); saveBest();
        sfx.over();
        return;
      }
      this.inv = 2;
      if (fell) {
        const y = this.camY + H2 - 18;
        this.plats.push({ x: clamp(this.px, 18, W2 - 18), y, w: 34, k: 'r' });
        this.py = y; this.vy = -330;
      } else {
        this.vy = Math.min(this.vy, -120);
      }
    },
    calcScore() { return Math.floor(this.height / 5) + this.bonus; },
    pop(x, y, text, col) { this.pops.push({ x, y, text, col: col || '#ffd76a', t: 0.9 }); },
    collectHandheld(it) {
      it.dead = true;
      this.state = 'raise'; this.handT = 0;
      G.handhelds++;
      tone(660, 0.1, 'square', 0.04); tone(990, 0.15, 'square', 0.04, 0, 0.1); buzz(20);
    },
    returnFromHandheld(pips) {
      this.state = 'lower'; this.handT = 1;
      this.pendingPips = pips;
    },
    finishLower() {
      const pips = this.pendingPips || 0;
      this.state = 'play';
      this.bonus += pips * 5;
      this.rocket = pips > 0 ? Math.min(6, 0.8 + pips * 0.35) : 0;
      this.inv = Math.max(this.inv, 1);
      if (this.rocket) { sfx.rocket(); this.pop(this.px, this.py - 14, 'ROCKET!', '#ff9a3c'); }
      else this.pop(this.px, this.py - 14, 'NO PIPS', '#8d8ad6');
    },
    dir: 0,
    update(dt) {
      this.t += dt;
      const live = G.depth === 2 && !G.trans && !this.paused && !G.paused && G.mode === 'play';
      if (this.state === 'attract') return;
      if (!live) return;
      if (this.state === 'over') { if (this.t > 2.6) { this.state = 'attract'; this.t = 0; Game.l2Over(this.score); } return; }
      if (this.state === 'raise') { this.handT = Math.min(1, this.handT + dt * 2.6); if (this.handT >= 1) { this.state = 'hand'; Game.enterL3(); } return; }
      if (this.state === 'lower') { this.handT = Math.max(0, this.handT - dt * 3); if (this.handT <= 0) this.finishLower(); return; }
      if (this.state !== 'play') return;

      const dir = this.dir;
      if (dir) this.face = dir;
      this.vx += (dir * 96 - this.vx) * Math.min(1, dt * 10);
      this.px += this.vx * dt;
      if (this.px < -4) this.px += W2 + 8; else if (this.px > W2 + 4) this.px -= W2 + 8;
      const prevY = this.py;
      if (this.rocket > 0) {
        this.rocket -= dt; this.vy = -260;
        for (let i = 0; i < 2; i++) this.parts.push({ x: this.px + rand(-2, 2), y: this.py + 1, vx: rand(-15, 15), vy: rand(40, 90), t: 0.35, c: Math.random() < 0.5 ? '#ff9a3c' : '#ffe26a' });
        if (this.rocket <= 0) this.vy = -200;
      } else {
        this.vy += 430 * dt;
      }
      this.py += this.vy * dt;
      if (this.vy > 0 && this.rocket <= 0) {
        for (const p of this.plats) {
          if (p.gone) continue;
          if (prevY <= p.y && this.py >= p.y && Math.abs(this.px - p.x) < p.w / 2 + 3) {
            this.py = p.y; this.vy = -236; sfx.hop();
            if (p.k === 'c' || p.k === 'r') {
              p.gone = true;
              for (let i = 0; i < 6; i++) this.parts.push({ x: p.x + rand(-9, 9), y: p.y, vx: rand(-20, 20), vy: rand(0, 40), t: 0.6, c: p.k === 'c' ? '#b07a4a' : '#ffffff' });
            }
            break;
          }
        }
      }
      for (const p of this.plats) {
        if (p.k !== 'm') continue;
        p.x += p.vx * dt;
        if (p.x < 12 || p.x > W2 - 12) { p.vx = -p.vx; p.x = clamp(p.x, 12, W2 - 12); }
      }
      if (this.py - this.camY < 86) this.camY = this.py - 86;
      this.height = Math.max(this.height, this.startY - this.py);
      while (this.topY > this.camY - 30) { this.topY -= this.gap(); this.addPlat(this.topY); }
      const cut = this.camY + H2 + 30;
      this.plats = this.plats.filter((p) => p.y < cut);
      this.stars = this.stars.filter((s) => s.y < cut && !s.dead);
      this.items = this.items.filter((s) => s.y < cut && !s.dead);
      this.ufos = this.ufos.filter((u) => u.y < cut && u.x > -30 && u.x < W2 + 30);

      for (const s of this.stars) {
        s.t += dt;
        if (dist(s.x, s.y, this.px, this.py - 4) < 8) { s.dead = true; this.bonus += 10; sfx.star(); this.pop(s.x, s.y, '+10'); }
      }
      for (const it of this.items) {
        it.t += dt;
        if (dist(it.x, it.y, this.px, this.py - 4) < 10) { this.collectHandheld(it); return; }
      }
      if (this.height > 450) {
        this.ufoT -= dt;
        if (this.ufoT <= 0) {
          const d = clamp(this.height / 4000, 0, 1);
          this.ufoT = rand(6, 10) - d * 3;
          const left = Math.random() < 0.5;
          this.ufos.push({ x: left ? -12 : W2 + 12, y: this.camY + rand(18, 80), vx: (left ? 1 : -1) * (rand(24, 36) + d * 22), t: 0 });
        }
      }
      for (const u of this.ufos) {
        u.t += dt; u.x += u.vx * dt; u.y += Math.sin(u.t * 3) * 10 * dt;
        if (this.inv <= 0 && this.rocket <= 0 && dist(u.x, u.y, this.px, this.py - 4) < 8) { this.hurt(false); if (this.state !== 'play') return; }
      }
      this.inv = Math.max(0, this.inv - dt);
      if (this.py - this.camY > H2 + 12) { this.hurt(true); if (this.state !== 'play') return; }
      this.score = this.calcScore();

      for (const p of this.parts) { p.t -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 120 * dt; }
      this.parts = this.parts.filter((p) => p.t > 0);
      for (const p of this.pops) { p.t -= dt; p.y -= 14 * dt; }
      this.pops = this.pops.filter((p) => p.t > 0);
    },
    drawPlat(g, p, sy) {
      const x = Math.round(p.x - p.w / 2), y = Math.round(sy), w = Math.round(p.w);
      const cols = { n: ['#3be07a', '#1f8f4c'], m: ['#5fb7ff', '#2a62b8'], c: ['#c98d55', '#7a4e2a'], r: ['#ffffff', '#9a9ad0'] }[p.k];
      if (p.k === 'r' && (this.t * 6 | 0) % 2) return;
      g.fillStyle = cols[1]; g.fillRect(x, y, w, 4);
      g.fillStyle = cols[0]; g.fillRect(x, y, w, 2);
      if (p.k === 'c') { g.fillStyle = '#4a2c14'; g.fillRect(x + 6, y + 1, 1, 3); g.fillRect(x + w - 8, y, 1, 3); }
    },
    drawHandheld(g, x, y, small) {
      if (small) {
        g.fillStyle = '#d9d4cc'; g.fillRect(x - 3, y - 4, 7, 9);
        g.fillStyle = '#a9c64e'; g.fillRect(x - 2, y - 3, 5, 3);
        g.fillStyle = '#333'; g.fillRect(x - 2, y + 2, 1, 1); g.fillStyle = '#c0304a'; g.fillRect(x + 2, y + 1, 1, 1);
        return;
      }
    },
    render() {
      const g = x2;
      g.fillStyle = '#0c0a24'; g.fillRect(0, 0, W2, H2);
      const camY = this.state === 'attract' ? -this.t * 12 : this.camY;
      for (const s of SKY) {
        const y = ((s.y - camY * s.f) % H2 + H2) % H2;
        g.fillStyle = s.c; g.fillRect(s.x | 0, y | 0, 1, 1);
      }
      if (this.state === 'attract') { this.renderAttract(g); return; }

      for (const p of this.plats) if (!p.gone) this.drawPlat(g, p, p.y - this.camY);
      for (const s of this.stars) {
        const x = Math.round(s.x), y = Math.round(s.y - this.camY), tw = (s.t * 5 | 0) % 4 === 0;
        g.fillStyle = '#ffd76a'; g.fillRect(x - 1, y, 3, 1); g.fillRect(x, y - 1, 1, 3);
        if (tw) { g.fillStyle = '#fff6c8'; g.fillRect(x - 2, y, 1, 1); g.fillRect(x + 2, y, 1, 1); g.fillRect(x, y - 2, 1, 1); g.fillRect(x, y + 2, 1, 1); }
      }
      for (const it of this.items) {
        const y = Math.round(it.y - this.camY + Math.sin(it.t * 3) * 2);
        g.fillStyle = (it.t * 4 | 0) % 2 ? '#fff' : '#ffd76a';
        g.fillRect(it.x - 6, y - 6, 1, 1); g.fillRect(it.x + 6, y + 4, 1, 1); g.fillRect(it.x + 5, y - 7, 1, 1);
        this.drawHandheld(g, Math.round(it.x), y, true);
      }
      for (const u of this.ufos) spr(g, UFO, Math.round(u.x - 4), Math.round(u.y - this.camY - 2), UFO_PAL);
      for (const p of this.parts) { g.fillStyle = p.c; g.fillRect(p.x | 0, (p.y - this.camY) | 0, 1, 1); }
      if (this.state !== 'over' && !(this.inv > 0 && (this.t * 12 | 0) % 2)) {
        spr(g, ASTRO, Math.round(this.px - 3), Math.round(this.py - this.camY - 9), ASTRO_PAL, this.face < 0);
      }
      for (const p of this.pops) ptext(g, p.text, Math.round(p.x), Math.round(p.y - this.camY), p.col, 1, 'c');

      // HUD
      ptext(g, String(this.state === 'over' ? this.score : this.calcScore()), 3, 3, '#ffffff');
      for (let i = 0; i < this.lives; i++) {
        const hx = W2 - 8 - i * 7;
        g.fillStyle = '#f4f4ff'; g.fillRect(hx, 3, 5, 5); g.fillStyle = '#4fd8ff'; g.fillRect(hx + 1, 4, 3, 2);
      }
      if (this.rocket > 0) { g.fillStyle = '#ff9a3c'; g.fillRect(3, 10, Math.round(this.rocket * 8), 2); }
      if (this.t < 2.5 && this.state === 'play' && this.height < 60) {
        ptext(g, 'HOLD LEFT OR RIGHT', 80, 120, '#8d8ad6', 1, 'c');
        ptext(g, 'FIND THE HANDHELD', 80, 128, '#8d8ad6', 1, 'c');
      }
      if (this.state === 'over') {
        g.fillStyle = '#0c0a24e0'; g.fillRect(20, 66, 120, 62);
        ptext(g, 'GAME OVER', 80, 72, '#ff5f7e', 2, 'c');
        ptext(g, 'SCORE ' + this.score, 80, 92, '#ffffff', 1, 'c');
        ptext(g, 'TICKETS +' + Math.floor(this.score / TICKET_DIV), 80, 102, '#ffd76a', 1, 'c');
        if (this.score >= best.hi2 && this.score > 0) ptext(g, 'NEW HI SCORE!', 80, 114, '#4fd8ff', 1, 'c');
      }
      if (this.paused && this.state === 'play') {
        g.fillStyle = '#0c0a24c8'; g.fillRect(0, 0, W2, H2);
        ptext(g, 'PAUSED', 80, 84, '#ffffff', 2, 'c');
        if ((this.t * 2 | 0) % 2) ptext(g, 'STEP BACK UP', 80, 104, '#ffd76a', 1, 'c');
      }
      if (this.state === 'raise' || this.state === 'hand' || this.state === 'lower') this.renderDevice(g);
    },
    renderAttract(g) {
      ptext(g, 'STAR', 80, 22, '#ffd76a', 3, 'c');
      ptext(g, 'HOPPER', 80, 42, '#ff5fa2', 3, 'c');
      const ph = (this.t % 1.1) / 1.1;
      const y = 150 - Math.sin(ph * Math.PI) * 52;
      g.fillStyle = '#1f8f4c'; g.fillRect(64, 152, 32, 4); g.fillStyle = '#3be07a'; g.fillRect(64, 152, 32, 2);
      g.fillStyle = '#2a62b8'; g.fillRect(26 + Math.sin(this.t) * 10, 118, 22, 4);
      g.fillStyle = '#7a4e2a'; g.fillRect(112, 96, 22, 4);
      spr(g, ASTRO, 77, Math.round(y - 9), ASTRO_PAL, Math.sin(this.t * 0.7) < 0);
      spr(g, UFO, Math.round(((this.t * 20) % 220) - 30), 72, UFO_PAL);
      if ((this.t * 1.6 | 0) % 2 === 0) ptext(g, 'INSERT COIN', 80, 170, '#ffffff', 1, 'c');
      ptext(g, 'HI ' + best.hi2, 80, 184, '#8d8ad6', 1, 'c');
    },
    // The handheld the astronaut holds up to their visor: its LCD is P3.
    renderDevice(g) {
      const k = this.state === 'hand' ? 1 : ease(this.handT);
      const oy = Math.round((1 - k) * 190);
      g.save(); g.translate(0, oy);
      g.fillStyle = '#0c0a24a0'; g.fillRect(0, -oy, W2, H2);
      g.fillStyle = '#8f8a82'; g.fillRect(27, 29, 106, 172);
      g.fillStyle = '#d9d4cc'; g.fillRect(28, 28, 104, 172);
      g.fillStyle = '#ebe7e0'; g.fillRect(28, 28, 104, 3);
      g.fillStyle = '#4b4a5a'; g.fillRect(34, 34, 92, 82);
      g.fillStyle = '#c0304a'; g.fillRect(37, 37, 2, 2);
      ptext(g, 'POCKET PIXEL', 80, 108, '#9a98b0', 1, 'c');
      g.drawImage(c3, P3.x, P3.y, P3.w, P3.h);
      ptext(g, 'PIP DASH', 80, 122, '#5b5a6e', 1, 'c');
      // d-pad, buttons, speaker
      g.fillStyle = '#2b2a35'; g.fillRect(42, 146, 18, 6); g.fillRect(48, 140, 6, 18);
      g.fillStyle = '#9b2245'; g.fillRect(100, 146, 9, 9); g.fillRect(113, 140, 9, 9);
      g.fillStyle = '#7d7a74'; g.fillRect(64, 168, 10, 3); g.fillRect(84, 168, 10, 3);
      for (let i = 0; i < 4; i++) g.fillRect(104 + i * 5, 176, 2, 14);
      // gloves holding it
      g.fillStyle = '#f4f4ff'; g.fillRect(18, 150, 14, 22); g.fillRect(128, 150, 14, 22);
      g.fillStyle = '#c9c9e6'; g.fillRect(18, 168, 14, 4); g.fillRect(128, 168, 14, 4);
      g.restore();
    },
  };

  // ======================================================================
  // LAYER 1 — THE ARCADE
  // ======================================================================
  const CONFETTI = []; for (let i = 0; i < 110; i++) CONFETTI.push({ x: rand(0, W1), y: rand(FLOOR + 6, H1), r: rand(2, 5), a: rand(0, 6.3), c: ['#ff5fa2', '#6fe3ff', '#ffd54a', '#7cf0a0', '#b07bff'][i % 5], k: i % 3 });
  const L1 = {
    reset() {
      this.px = 180; this.py = 430; this.face = 1; this.walk = 0; this.moving = false;
      this.coins = [{ x: 90, y: 470, t: 0 }, { x: 280, y: 400, t: 1 }];
      this.spawnT = 3; this.bot = { x: 300, y: 500, a: 3, t: 0, eat: 0 };
      this.parts = []; this.floats = []; this.joy = null; this.t = 0; this.cheer = 0;
    },
    near() {
      if (this.py < 392 && Math.abs(this.px - 180) < 52) return 'cab';
      if (this.py > 500) return 'counter';
      return null;
    },
    float(x, y, text, col) { this.floats.push({ x, y, text, col: col || '#ffd54a', t: 1.2 }); },
    tickets(n) {
      for (let i = 0; i < Math.min(n, 40); i++) {
        this.parts.push({ x: 180 + rand(-4, 4), y: 318, vx: rand(-70, 70), vy: rand(-140, -40), t: rand(1.6, 2.6), floor: rand(340, 372), rot: rand(0, 6), vr: rand(-8, 8) });
      }
      for (let i = 0; i < Math.min(n, 24); i++) sfx.ticket(i);
    },
    update(dt, active) {
      this.t += dt;
      for (const c of this.coins) c.t += dt;
      for (const p of this.parts) {
        p.t -= dt;
        if (p.y < p.floor || p.vy < 0) { p.vy += 420 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; }
        else { p.y = p.floor; p.vx = 0; p.vr = 0; }
      }
      this.parts = this.parts.filter((p) => p.t > 0);
      for (const f of this.floats) { f.t -= dt; f.y -= 22 * dt; }
      this.floats = this.floats.filter((f) => f.t > 0);
      this.cheer = Math.max(0, this.cheer - dt);
      if (!active) { this.moving = false; return; }

      let ix = 0, iy = 0;
      if (keys.left) ix -= 1; if (keys.right) ix += 1; if (keys.up) iy -= 1; if (keys.down) iy += 1;
      if (this.joy && this.joy.on) { ix = this.joy.dx / 46; iy = this.joy.dy / 46; }
      const len = Math.hypot(ix, iy);
      if (len > 1) { ix /= len; iy /= len; }
      this.moving = len > 0.12;
      if (this.moving) {
        this.px = clamp(this.px + ix * 135 * dt, 22, W1 - 22);
        this.py = clamp(this.py + iy * 135 * dt, 352, 528);
        if (Math.abs(ix) > 0.1) this.face = ix > 0 ? 1 : -1;
        this.walk += dt * 10 * Math.min(1, len);
      }
      // keep clear of the robot
      const bd = dist(this.px, this.py, this.bot.x, this.bot.y);
      if (bd < 22 && bd > 0) { const k = (22 - bd) / bd; this.bot.x -= (this.px - this.bot.x) * k; this.bot.y -= (this.py - this.bot.y) * k; }

      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        this.spawnT = (G.owned.socks ? 3 : 6) * rand(0.7, 1.3);
        if (this.coins.length < 5) this.coins.push({ x: rand(30, W1 - 30), y: rand(362, 520), t: 0 });
      }
      for (const c of this.coins) {
        const d = dist(c.x, c.y, this.px, this.py - 10);
        if (G.owned.magnet && d < 80 && d > 1) { c.x += (this.px - c.x) / d * 170 * dt; c.y += (this.py - 10 - c.y) / d * 170 * dt; }
        if (d < 20) { c.dead = true; G.coins++; sfx.coin(); buzz(8); this.float(c.x, c.y - 14, '+1 coin'); }
      }
      // the robot vacuum goes after coins too
      const b = this.bot;
      b.t += dt; b.eat = Math.max(0, b.eat - dt);
      let target = null, td = 1e9;
      for (const c of this.coins) { if (c.dead) continue; const d = dist(c.x, c.y, b.x, b.y); if (d < td) { td = d; target = c; } }
      if (target) b.a += (((Math.atan2(target.y - b.y, target.x - b.x) - b.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * Math.min(1, dt * 2);
      else b.a += Math.sin(b.t * 0.7) * dt;
      b.x += Math.cos(b.a) * 34 * dt; b.y += Math.sin(b.a) * 34 * dt;
      if (b.x < 24 || b.x > W1 - 24) { b.a = Math.PI - b.a; b.x = clamp(b.x, 24, W1 - 24); }
      if (b.y < 356 || b.y > 528) { b.a = -b.a; b.y = clamp(b.y, 356, 528); }
      for (const c of this.coins) if (!c.dead && dist(c.x, c.y, b.x, b.y) < 14) { c.dead = true; b.eat = 0.6; sfx.nom(); this.float(c.x, c.y - 10, 'nom', '#b9b4d8'); }
      this.coins = this.coins.filter((c) => !c.dead);
    },

    // ---- drawing, in arcade units (the camera transform is already set) ----
    draw(g) {
      const late = G.clock > NIGHT - 25;
      // back wall
      let gr = g.createLinearGradient(0, 0, 0, FLOOR);
      gr.addColorStop(0, '#140e2c'); gr.addColorStop(1, '#2b1a52');
      g.fillStyle = gr; g.fillRect(0, 0, W1, FLOOR);
      g.fillStyle = '#ffffff08'; for (let x = 0; x < W1; x += 24) g.fillRect(x, 0, 1, FLOOR);
      // floor
      gr = g.createLinearGradient(0, FLOOR, 0, H1);
      gr.addColorStop(0, '#22164a'); gr.addColorStop(1, '#170f33');
      g.fillStyle = gr; g.fillRect(0, FLOOR, W1, H1 - FLOOR);
      for (const c of CONFETTI) {
        g.fillStyle = c.c + '55';
        if (c.k === 0) { g.beginPath(); g.arc(c.x, c.y, c.r * 0.6, 0, 7); g.fill(); }
        else if (c.k === 1) { g.save(); g.translate(c.x, c.y); g.rotate(c.a); g.fillRect(-c.r, -1, c.r * 2, 2); g.restore(); }
        else { g.beginPath(); g.moveTo(c.x, c.y - c.r * 0.7); g.lineTo(c.x + c.r * 0.7, c.y + c.r * 0.5); g.lineTo(c.x - c.r * 0.7, c.y + c.r * 0.5); g.fill(); }
      }
      g.fillStyle = '#ff5fa2'; g.fillRect(0, FLOOR - 2, W1, 2);
      g.fillStyle = '#ff5fa233'; g.fillRect(0, FLOOR, W1, 10);

      this.drawNeon(g);
      this.drawSideCabs(g);
      this.drawMainCab(g);
      this.drawCounter(g);

      // tickets on the floor, coins, then the robot and player sorted by depth
      for (const p of this.parts) {
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.globalAlpha = Math.min(1, p.t * 2);
        g.fillStyle = '#ff4f6d'; g.fillRect(-4, -2.5, 8, 5); g.fillStyle = '#ffd0d8'; g.fillRect(-1, -2.5, 1, 5);
        g.restore();
      }
      g.globalAlpha = 1;
      for (const c of this.coins) this.drawCoin(g, c.x, c.y + Math.sin(c.t * 3) * 2, c.t);
      const actors = [{ y: this.bot.y, f: () => this.drawBot(g) }, { y: this.py, f: () => this.drawPlayer(g) }].sort((a, b) => a.y - b.y);
      actors.forEach((a) => a.f());

      // a hint over whatever you can use
      if (G.mode === 'play' && G.depth === 1 && !G.trans) {
        const n = this.near(), by = Math.sin(this.t * 5) * 3;
        if (n === 'cab') this.arrow(g, 180, 18 + by, '#ffd54a');
        if (n === 'counter') this.arrow(g, 180, 548 + by, '#7cf0c0');
      }
      for (const f of this.floats) {
        g.globalAlpha = Math.min(1, f.t * 2); g.fillStyle = f.col; g.font = '800 12px system-ui, sans-serif'; g.textAlign = 'center';
        g.fillText(f.text, f.x, f.y);
      }
      g.globalAlpha = 1;
      if (late && Math.random() < 0.04 + (G.clock - (NIGHT - 25)) * 0.004) { g.fillStyle = '#000000aa'; g.fillRect(0, 0, W1, H1); }
    },
    arrow(g, x, y, col) {
      g.fillStyle = col;
      g.beginPath(); g.moveTo(x - 9, y); g.lineTo(x + 9, y); g.lineTo(x, y + 10); g.closePath(); g.fill();
    },
    drawNeon(g) {
      g.save();
      g.textAlign = 'center'; g.font = '900 17px system-ui, sans-serif';
      const flick = (this.t * 7 | 0) % 37 === 0 ? 0.35 : 1;
      g.shadowColor = '#ff5fa2'; g.shadowBlur = 10; g.fillStyle = `rgba(255,140,190,${flick})`;
      g.fillText('NESTED', 54, 62);
      g.shadowColor = '#6fe3ff'; g.fillStyle = '#bff4ff'; g.fillText('ARCADE', 54, 82);
      g.restore();
      // wall clock showing the real game time
      const cx = 306, cy = 66;
      g.fillStyle = '#efeaff'; g.beginPath(); g.arc(cx, cy, 22, 0, 7); g.fill();
      g.strokeStyle = '#3a2d6b'; g.lineWidth = 3; g.stroke();
      g.fillStyle = '#3a2d6b'; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.fillRect(cx + Math.cos(a) * 17 - 1, cy + Math.sin(a) * 17 - 1, 2, 2); }
      const mins = 20 * 60 + G.clock, ha = ((mins / 60) % 12) / 12 * Math.PI * 2 - Math.PI / 2, ma = (mins % 60) / 60 * Math.PI * 2 - Math.PI / 2;
      g.lineCap = 'round';
      g.strokeStyle = '#1a1033'; g.lineWidth = 3; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(ha) * 10, cy + Math.sin(ha) * 10); g.stroke();
      g.strokeStyle = '#ff5fa2'; g.lineWidth = 2; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(ma) * 15, cy + Math.sin(ma) * 15); g.stroke();
      g.font = '700 7px system-ui, sans-serif'; g.fillStyle = '#8f83c4'; g.textAlign = 'center'; g.fillText('CLOSES 12', cx, 100);
    },
    drawSideCabs(g) {
      // left: out of order
      rr(g, 14, 128, 82, 202, 8, '#3b1f4f'); rr(g, 20, 134, 70, 22, 4, '#1a0f26');
      g.fillStyle = '#8a6aa0'; g.font = '800 10px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText('TURBO YAK', 55, 149);
      rr(g, 22, 164, 66, 70, 4, '#06040c');
      g.save(); g.beginPath(); g.rect(22, 164, 66, 70); g.clip();
      g.translate(55, 199); g.rotate(-0.5); g.fillStyle = '#ffd54a'; g.fillRect(-50, -7, 100, 14);
      g.fillStyle = '#1a1033'; g.font = '900 8px system-ui, sans-serif'; g.fillText('OUT OF ORDER', 0, 3); g.restore();
      rr(g, 18, 242, 74, 30, 4, '#2a173a');
      g.fillStyle = '#c0304a'; g.beginPath(); g.arc(40, 257, 5, 0, 7); g.fill(); g.fillStyle = '#3a8fd0'; g.beginPath(); g.arc(64, 257, 5, 0, 7); g.fill();
      // right: coming soon, with a pulsing test pattern
      rr(g, 264, 128, 82, 202, 8, '#163a46'); rr(g, 270, 134, 70, 22, 4, '#0a1d24');
      g.fillStyle = '#6fb8c8'; g.font = '800 10px system-ui, sans-serif'; g.fillText('???', 305, 149);
      rr(g, 272, 164, 66, 70, 4, '#06040c');
      const bars = ['#ff5f7e', '#ffd54a', '#7cf0a0', '#6fe3ff', '#b07bff'];
      for (let i = 0; i < 5; i++) { g.fillStyle = bars[(i + (this.t * 2 | 0)) % 5] + '99'; g.fillRect(275 + i * 12, 170, 11, 44); }
      g.fillStyle = '#fff'; g.font = '800 8px system-ui, sans-serif'; g.fillText('COMING SOON', 305, 226);
      rr(g, 268, 242, 74, 30, 4, '#0f2a33');
    },
    drawMainCab(g) {
      // body
      rr(g, 98, 30, 164, 300, 10, '#1c2566');
      rr(g, 102, 30, 156, 300, 8, '#2a3a96');
      g.fillStyle = '#ff5fa2'; g.fillRect(102, 40, 4, 280); g.fillRect(254, 40, 4, 280);
      // marquee
      rr(g, 108, 36, 144, 44, 6, '#0d0b26');
      g.save(); g.textAlign = 'center'; g.font = '900 20px system-ui, sans-serif';
      g.shadowColor = '#ffd54a'; g.shadowBlur = 8; g.fillStyle = '#ffe27a'; g.fillText('STAR HOPPER', 180, 65); g.restore();
      // screen + bezel
      rr(g, P2.x - 8, P2.y - 6, P2.w + 16, P2.h + 12, 8, '#05040c');
      g.imageSmoothingEnabled = false;
      g.drawImage(c2, P2.x, P2.y, P2.w, P2.h);
      // CRT scanlines and a little glare
      const k = P2.h / H2;
      g.fillStyle = `rgba(0,0,0,${0.14 * clamp(2.6 - G.view, 0, 1)})`;
      if (G.view < 2.6) for (let y = 0; y < H2; y += 1) g.fillRect(P2.x, P2.y + y * k + k * 0.62, P2.w, k * 0.38);
      gr2(g);
      // control panel
      g.fillStyle = '#151c50'; g.beginPath(); g.moveTo(100, 262); g.lineTo(260, 262); g.lineTo(268, 296); g.lineTo(92, 296); g.closePath(); g.fill();
      g.fillStyle = '#222'; g.beginPath(); g.arc(135, 278, 6, 0, 7); g.fill();
      g.fillStyle = '#d0304a'; g.beginPath(); g.arc(135, 272, 5, 0, 7); g.fill();
      g.fillStyle = '#ffd54a'; g.beginPath(); g.arc(205, 279, 6, 0, 7); g.fill();
      g.fillStyle = '#6fe3ff'; g.beginPath(); g.arc(225, 275, 6, 0, 7); g.fill();
      // coin door
      rr(g, 160, 300, 40, 26, 4, '#10163f');
      const glow = 0.5 + 0.5 * Math.sin(this.t * 4);
      g.fillStyle = `rgba(255,150,60,${0.5 + glow * 0.5})`; g.fillRect(176, 305, 3, 9);
      g.fillStyle = '#ff4f6d'; g.fillRect(170, 318, 20, 4);
      g.fillStyle = '#8f83c4'; g.font = '700 5px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText('25¢', 188, 312);
      function gr2(gg) {
        const gl = gg.createLinearGradient(P2.x, P2.y, P2.x + P2.w, P2.y + P2.h);
        gl.addColorStop(0, '#ffffff18'); gl.addColorStop(0.35, '#ffffff00'); gl.addColorStop(1, '#ffffff06');
        gg.fillStyle = gl; gg.fillRect(P2.x, P2.y, P2.w, P2.h);
      }
    },
    drawCounter(g) {
      rr(g, 26, 556, 308, 76, 10, '#5a2a3e');
      rr(g, 26, 556, 308, 18, 8, '#8c3d5c');
      g.fillStyle = '#ffffff22'; g.fillRect(34, 560, 292, 3);
      g.fillStyle = '#ffd0e0'; g.font = '900 13px system-ui, sans-serif'; g.textAlign = 'center';
      g.fillText('★ PRIZES ★', 180, 602);
      // prizes on top
      const items = [['🧦', 62], ['🧲', 104], ['🔋', 256], ['⛑️', 298]];
      g.font = '18px system-ui, sans-serif';
      for (const [e, x] of items) g.fillText(e, x, 572);
      if (!G.owned.gold) {
        const s = 1 + Math.sin(this.t * 3) * 0.06;
        g.save(); g.translate(180, 560); g.scale(s, s);
        g.shadowColor = '#ffd54a'; g.shadowBlur = 16;
        rr(g, -16, -20, 32, 26, 3, '#f2bd2c'); g.shadowBlur = 0;
        rr(g, -12, -16, 24, 12, 2, '#ffe9a0'); g.fillStyle = '#b07d10'; g.fillRect(-12, 1, 24, 3);
        g.fillStyle = '#7a5208'; g.font = '900 6px system-ui, sans-serif'; g.fillText('???', 0, -8);
        g.restore();
        g.fillStyle = '#ffe27a'; g.font = '800 8px system-ui, sans-serif'; g.fillText('350 TICKETS', 180, 620);
      }
    },
    drawCoin(g, x, y, t) {
      const w = Math.abs(Math.cos(t * 2.4)) * 7 + 1.5;
      g.fillStyle = '#00000044'; g.beginPath(); g.ellipse(x, y + 9, 7, 2.5, 0, 0, 7); g.fill();
      g.fillStyle = '#c98a12'; g.beginPath(); g.ellipse(x, y, w, 8, 0, 0, 7); g.fill();
      g.fillStyle = '#f7c53a'; g.beginPath(); g.ellipse(x, y, Math.max(0.5, w - 1.8), 6.4, 0, 0, 7); g.fill();
      g.fillStyle = '#fff6b0'; g.fillRect(x - w * 0.4, y - 4, Math.max(0.8, w * 0.3), 3);
    },
    drawBot(g) {
      const b = this.bot;
      g.fillStyle = '#00000055'; g.beginPath(); g.ellipse(b.x, b.y + 4, 15, 5, 0, 0, 7); g.fill();
      g.fillStyle = '#5c5a78'; g.beginPath(); g.ellipse(b.x, b.y, 14, 9, 0, 0, 7); g.fill();
      g.fillStyle = '#8a88a8'; g.beginPath(); g.ellipse(b.x, b.y - 3, 12, 7, 0, 0, 7); g.fill();
      g.fillStyle = (this.t * 2 | 0) % 2 ? '#7cf0a0' : '#2f6b4a'; g.beginPath(); g.arc(b.x + Math.cos(b.a) * 6, b.y - 4 + Math.sin(b.a) * 3, 2, 0, 7); g.fill();
      if (b.eat > 0) { g.fillStyle = '#ffd54a'; g.font = '800 8px system-ui'; g.textAlign = 'center'; g.fillText('♪', b.x + 12, b.y - 12); }
    },
    drawPlayer(g) {
      const x = this.px, y = this.py, bob = this.moving ? Math.abs(Math.sin(this.walk)) * 2 : 0, f = this.face;
      const jump = this.cheer > 0 ? Math.abs(Math.sin(this.cheer * 9)) * 10 : 0;
      g.fillStyle = '#00000055'; g.beginPath(); g.ellipse(x, y + 1, 11, 4, 0, 0, 7); g.fill();
      g.save(); g.translate(x, y - bob - jump);
      const leg = this.moving ? Math.sin(this.walk) * 3 : 0;
      g.fillStyle = '#2b3060'; g.fillRect(-6, -10, 4, 10 + leg * 0.3); g.fillRect(2, -10, 4, 10 - leg * 0.3);
      g.fillStyle = '#f7f7ff'; g.fillRect(-7, -1 + leg * 0.3, 6, 3); g.fillRect(1, -1 - leg * 0.3, 6, 3);
      rr(g, -9, -27, 18, 19, 5, '#ff8a3c');
      g.fillStyle = '#e46a22'; g.fillRect(-9, -13, 18, 3);
      g.fillStyle = '#ffd9b8'; g.beginPath(); g.arc(0, -35, 9, 0, 7); g.fill();
      g.fillStyle = '#2f6bff'; g.beginPath(); g.arc(0, -37, 9, Math.PI, 0); g.fill(); g.fillRect(f > 0 ? 0 : -13, -38, 13, 3);
      g.fillStyle = '#1a1033'; g.fillRect(f * 3 - 1, -35, 2, 3); g.fillRect(f * 3 + (f > 0 ? -6 : 4), -35, 2, 3);
      if (this.cheer > 0) { g.fillStyle = '#ff8a3c'; g.fillRect(-14, -36, 5, 4); g.fillRect(9, -36, 5, 4); }
      g.restore();
    },
  };
  function rr(g, x, y, w, h, r, fill) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
    g.fillStyle = fill; g.fill();
  }

  // ---------- the big handheld you find yourself inside, for the ending ----------
  function drawOuterHandheld(g, a) {
    rr(g, -64, -86, W1 + 128, H1 + 400, 46, '#bdb7ad');
    rr(g, -60, -90, W1 + 120, H1 + 400, 44, '#d9d4cc');
    rr(g, -34, -56, W1 + 68, H1 + 92, 22, '#4b4a5a');
    g.fillStyle = '#c0304a'; g.beginPath(); g.arc(-18, -38, 5, 0, 7); g.fill();
    g.fillStyle = '#9a98b0'; g.font = 'italic 900 22px system-ui, sans-serif'; g.textAlign = 'center';
    g.fillText('POCKET PIXEL', W1 / 2, H1 + 72);
    g.fillStyle = '#2b2a35'; g.fillRect(10, H1 + 140, 96, 32); g.fillRect(42, H1 + 108, 32, 96);
    g.fillStyle = '#9b2245'; g.beginPath(); g.arc(250, H1 + 170, 24, 0, 7); g.fill(); g.beginPath(); g.arc(320, H1 + 130, 24, 0, 7); g.fill();
    g.fillStyle = '#7d7a74'; rr(g, 120, H1 + 240, 50, 14, 7, '#7d7a74'); rr(g, 190, H1 + 240, 50, 14, 7, '#7d7a74');
    g.globalAlpha = a;
  }

  // ======================================================================
  // CAMERA — flies between the layers
  // ======================================================================
  function rectFor(d) {
    if (d === 0) return { x: -76, y: -100, w: W1 + 152, h: H1 + 420 };
    if (d === 1) return { x: 0, y: 0, w: W1, h: H1 };
    if (d === 2) return { x: P2.x - 10, y: P2.y - 8, w: P2.w + 20, h: P2.h + 16 };
    const k = P2.w / W2;
    // the handheld from just above its screen down to its buttons
    return { x: P2.x + (P3.x - 13) * k, y: P2.y + (P3.y - 9) * k, w: (P3.w + 26) * k, h: 128 * k };
  }
  function camFor(d) {
    const r = rectFor(d), ah = SH - TOP - BOT;
    const s = Math.min(SW / r.w, ah / r.h);
    return { s, cx: r.x + r.w / 2, cy: r.y + r.h / 2 };
  }
  function camera() {
    const v = G.view, a = Math.floor(v), b = Math.min(3, a + 1), f = v - a;
    const A = camFor(a);
    if (f < 1e-4) return A;
    const B = camFor(b);
    const s = Math.exp(lerp(Math.log(A.s), Math.log(B.s), f));
    // Zoom about the one point that sits still between the two views.
    if (Math.abs(B.s - A.s) < 1e-6) return { s, cx: lerp(A.cx, B.cx, f), cy: lerp(A.cy, B.cy, f) };
    const qx = (B.cx * B.s - A.cx * A.s) / (B.s - A.s), qy = (B.cy * B.s - A.cy * A.s) / (B.s - A.s);
    return { s, cx: qx - (qx - A.cx) * A.s / s, cy: qy - (qy - A.cy) * A.s / s };
  }
  function goDepth(to, done, dur) {
    G.trans = { from: G.view, to, t: 0, dur: dur || 0.9, done };
    if (to > G.view) sfx.zoomIn(); else sfx.zoomOut();
    syncUI();
  }

  // ======================================================================
  // GAME FLOW
  // ======================================================================
  const Game = {
    enterL3() { L3.start(); goDepth(3, () => { G.depth = 3; syncUI(); }); },
    l3Over(pips) { goDepth(2, () => { G.depth = 2; L2.returnFromHandheld(pips); syncUI(); }); },
    l2Over(score) {
      const tix = Math.floor(score / TICKET_DIV);
      goDepth(1, () => {
        G.depth = 1; G.tickets += tix; G.earned += tix; L1.tickets(tix); L1.cheer = tix > 0 ? 0.6 : 0;
        if (tix > 0) L1.float(180, 345, '+' + tix + ' tickets', '#ff8aa0');
        syncUI();
      });
    },
  };

  function newNight() {
    Object.assign(G, { mode: 'play', clock: 0, coins: 3, tickets: 0, shownTix: 0, earned: 0, runs: 0, handhelds: 0, owned: {}, depth: 1, view: 1, trans: null, paused: false, shop: false, warned: false, endT: 0 });
    L1.reset(); L2.state = 'attract'; L2.paused = false; L3.state = 'off';
    hide('title'); hide('result'); hide('pause'); hide('shop'); show('hud'); resize();
    toast('8 PM. The arcade closes at midnight.');
    syncUI();
  }

  function act() {
    if (G.mode !== 'play' || G.trans || G.depth !== 1 || G.paused || G.shop) return;
    const n = L1.near();
    if (n === 'cab') {
      if (L2.paused) { goDepth(2, () => { G.depth = 2; L2.paused = false; syncUI(); }); return; }
      if (G.coins < 1) { toast('You need a coin. Look on the carpet!'); sfx.bonk(); return; }
      G.coins--; G.runs++; sfx.clunk(); buzz(15);
      L2.start();
      goDepth(2, () => { G.depth = 2; L2.t = 0; syncUI(); });
    } else if (n === 'counter') openShop();
  }
  function stepOut() {
    if (G.mode !== 'play' || G.trans || G.paused) return;
    if (G.depth === 3) { L3.end(); return; }
    if (G.depth === 2) {
      if (L2.state !== 'play') return;
      L2.paused = true; goDepth(1, () => { G.depth = 1; syncUI(); });
    }
  }

  function closingTime() {
    G.mode = 'over'; G.shop = false; hide('shop');
    sfx.closing();
    best.nights++; saveBest();
    const finish = () => { G.depth = 1; syncUI(); showResult(false); };
    L3.state = 'off'; L2.state = 'attract'; L2.paused = false;
    if (G.trans || G.view > 1.01) goDepth(1, finish, 1.4); else finish();
    syncUI();
  }

  function fmtClock(m) {
    const t = 20 * 60 + Math.min(m, NIGHT), h = Math.floor(t / 60) % 24, mm = Math.floor(t % 60);
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return h12 + ':' + String(mm).padStart(2, '0') + (h >= 12 && h < 24 ? ' PM' : ' AM');
  }

  // ---------- shop ----------
  function openShop() {
    G.shop = true; renderShop(); show('shop'); syncUI();
  }
  function closeShop() { G.shop = false; hide('shop'); syncUI(); }
  function renderShop() {
    $('shopTix').textContent = G.tickets;
    $('prizes').innerHTML = PRIZES.map((p) => {
      const own = !!G.owned[p.id];
      const btn = own ? '<button class="own" disabled>Got it</button>'
        : `<button data-buy="${p.id}" ${G.tickets < p.cost ? 'disabled' : ''}>${p.cost} 🎟</button>`;
      return `<div class="prize ${p.id === 'gold' ? 'gold' : ''}"><div class="ico">${p.ico}</div><div class="txt"><b>${p.name}</b><small>${p.desc}</small></div>${btn}</div>`;
    }).join('');
  }
  $('prizes').addEventListener('click', (e) => {
    const id = e.target && e.target.getAttribute('data-buy');
    if (!id) return;
    const p = PRIZES.find((q) => q.id === id);
    if (!p || G.owned[id] || G.tickets < p.cost) return;
    G.tickets -= p.cost; G.shownTix = G.tickets; G.owned[id] = true; sfx.buy(); buzz(20);
    if (id === 'gold') { closeShop(); win(); return; }
    toast(p.name + '! ' + p.desc);
    renderShop(); syncUI();
  });

  function win() {
    G.mode = 'ending'; G.endT = 0; L1.cheer = 2;
    best.wins++; best.fastest = best.fastest == null ? G.clock : Math.min(best.fastest, G.clock); saveBest();
    sfx.fanfare();
    toast('The Golden Cartridge! You blow on the contacts and slide it in…');
    syncUI();
  }

  // ---------- results ----------
  function showResult(won) {
    $('resTitle').textContent = won ? 'Games all the way down' : 'Closing time!';
    const rows = [
      ['Games of Star Hopper', G.runs], ['Handhelds found', G.handhelds], ['Tickets won', G.earned],
      ['Star Hopper high score', best.hi2], ['Pip Dash best', best.hi3 + ' pips'],
    ];
    if (won) rows.unshift(['Won at', fmtClock(G.clock)]);
    const stats = '<div class="stats">' + rows.map((r) => `<div><span>${r[0]}</span><b>${r[1]}</b></div>`).join('') + '</div>';
    const msg = won
      ? '<p>The Golden Cartridge clicks into place and the screen flickers on. It\'s an arcade. There\'s a Star Hopper cabinet in it, and a kid in an orange hoodie standing in front of it.</p><p>It\'s you. You were inside the handheld all along.</p>'
      : `<p>The lights flicker off and the robot vacuum herds you to the door. You had <b>${G.tickets}</b> tickets — the Golden Cartridge costs 350. Tomorrow, go deeper: time runs slower in there.</p>`;
    $('resBody').innerHTML = msg + stats;
    $('againBtn').textContent = won ? 'Play again' : 'Come back tomorrow';
    show('result');
  }

  // ---------- UI ----------
  function show(id) { $(id).classList.remove('hidden'); }
  function hide(id) { $(id).classList.add('hidden'); }
  let toastT = 0;
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); }

  const ui = {};
  function setText(id, v) { if (ui[id] !== v) { ui[id] = v; $(id).textContent = v; } }
  function syncUI() {
    const playing = G.mode === 'play' && !G.paused;
    const d = Math.round(G.view);
    document.querySelectorAll('#crumbs span').forEach((s) => {
      const sd = +s.dataset.d;
      s.className = sd === G.depth ? 'on' : sd < G.depth ? 'past' : '';
    });
    const act = $('act');
    const n = G.depth === 1 && !G.trans && playing && !G.shop ? L1.near() : null;
    if (n === 'cab') {
      act.classList.remove('hidden', 'shop');
      if (L2.paused) { act.textContent = '▶ Back into Star Hopper'; act.classList.remove('dim'); }
      else if (G.coins > 0) { act.textContent = 'Insert coin & play'; act.classList.remove('dim'); }
      else { act.textContent = 'No coins — find one'; act.classList.add('dim'); }
    } else if (n === 'counter') {
      act.classList.remove('hidden', 'dim'); act.classList.add('shop'); act.textContent = 'Prize counter';
    } else act.classList.add('hidden');
    const canOut = playing && !G.trans && ((G.depth === 2 && L2.state === 'play') || (G.depth === 3 && L3.state === 'play'));
    $('out').classList.toggle('hidden', !canOut);
    $('out').textContent = G.depth === 3 ? '⤴ Put the handheld down' : '⤴ Step away from the cabinet';
    setText('rate', RATE_LABEL[Math.max(1, d)] || '');
    try {
      if (host && host.setCanGoBack) host.setCanGoBack(G.mode === 'play' && (!G.paused || G.shop || G.depth > 1));
    } catch (e) { /* old bridge */ }
  }
  let lastNear = null;
  function updateHUD() {
    setText('clock', fmtClock(G.clock));
    $('hud').querySelector('.clock').classList.toggle('late', G.clock > NIGHT - 30);
    setText('coins', String(G.coins));
    if (G.shownTix < G.tickets) G.shownTix = Math.min(G.tickets, G.shownTix + Math.max(1, Math.ceil((G.tickets - G.shownTix) / 12)));
    else G.shownTix = G.tickets;
    setText('tix', String(G.shownTix));
    const n = [G.mode, G.depth, !!G.trans, G.paused, G.shop, G.depth === 1 && L1.near(), G.coins, L2.paused, L2.state, L3.state].join('|');
    if (n !== lastNear) { lastNear = n; syncUI(); }
  }

  function pause(on) {
    if (G.mode !== 'play') return;
    G.paused = on;
    $('pause').classList.toggle('hidden', !on);
    $('muteBtn').textContent = 'Sound: ' + (muted ? 'off' : 'on');
    syncUI();
  }

  // ======================================================================
  // INPUT
  // ======================================================================
  const keys = { left: false, right: false, up: false, down: false };
  const touches = new Map();
  function l2Dir() {
    let d = 0;
    for (const t of touches.values()) d += t.x < SW / 2 ? -1 : 1;
    if (keys.left) d -= 1; if (keys.right) d += 1;
    return clamp(d, -1, 1);
  }
  cv.addEventListener('pointerdown', (e) => {
    audio();
    if (G.mode !== 'play' || G.paused || G.trans || G.shop) return;
    cv.setPointerCapture && cv.setPointerCapture(e.pointerId);
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
    if (G.depth === 1 && !L1.joy) L1.joy = { id: e.pointerId, ox: e.clientX, oy: e.clientY, dx: 0, dy: 0, on: true };
    if (G.depth === 3) L3.tap(e.clientX < SW / 2 ? -1 : 1);
  });
  cv.addEventListener('pointermove', (e) => {
    const t = touches.get(e.pointerId);
    if (!t) return;
    t.x = e.clientX; t.y = e.clientY;
    const j = L1.joy;
    if (j && j.id === e.pointerId) {
      let dx = e.clientX - j.ox, dy = e.clientY - j.oy;
      const l = Math.hypot(dx, dy), R = 46;
      if (l > R) { j.ox += dx * (1 - R / l); j.oy += dy * (1 - R / l); dx = e.clientX - j.ox; dy = e.clientY - j.oy; }
      j.dx = dx; j.dy = dy;
    }
  });
  const endPtr = (e) => {
    touches.delete(e.pointerId);
    if (L1.joy && L1.joy.id === e.pointerId) L1.joy = null;
  };
  cv.addEventListener('pointerup', endPtr);
  cv.addEventListener('pointercancel', endPtr);

  const KEYMAP = { ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right', ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down' };
  window.addEventListener('keydown', (e) => {
    audio();
    const k = KEYMAP[e.key];
    if (k) {
      if (!keys[k] && G.depth === 3 && (k === 'left' || k === 'right')) L3.tap(k === 'left' ? -1 : 1);
      keys[k] = true; e.preventDefault();
    } else if (e.key === ' ' || e.key === 'Enter') {
      if (G.mode === 'title') newNight(); else act();
      e.preventDefault();
    } else if (e.key === 'Escape' || e.key === 'Backspace') back();
    else if (e.key === 'p' || e.key === 'P') pause(!G.paused);
  });
  window.addEventListener('keyup', (e) => { const k = KEYMAP[e.key]; if (k) keys[k] = false; });

  function back() {
    if (G.shop) { closeShop(); return; }
    if (G.paused) { pause(false); return; }
    if (G.mode !== 'play') return;
    if (G.depth > 1) { stepOut(); return; }
    pause(true);
  }
  // The Android app calls this for its back button.
  window.NestedArcade = { back, pause: () => { if (G.mode === 'play' && !G.paused) pause(true); } };

  document.addEventListener('visibilitychange', () => { if (document.hidden && G.mode === 'play' && !G.paused) pause(true); });

  $('playBtn').addEventListener('click', () => { audio(); newNight(); });
  $('act').addEventListener('click', () => { audio(); act(); });
  $('out').addEventListener('click', () => { audio(); stepOut(); });
  $('pauseBtn').addEventListener('click', () => { audio(); if (G.mode === 'play') pause(!G.paused); });
  $('resumeBtn').addEventListener('click', () => pause(false));
  $('muteBtn').addEventListener('click', () => {
    muted = !muted; try { localStorage.setItem(SAVE_KEY + '-muted', muted ? '1' : '0'); } catch (e) { /* */ }
    $('muteBtn').textContent = 'Sound: ' + (muted ? 'off' : 'on');
  });
  $('quitBtn').addEventListener('click', () => { G.paused = false; hide('pause'); toTitle(); });
  $('shopClose').addEventListener('click', closeShop);
  $('againBtn').addEventListener('click', () => { hide('result'); toTitle(); });

  function toTitle() {
    G.mode = 'title'; G.view = 1; G.depth = 1; G.trans = null; G.shop = false; G.clock = 0;
    L1.reset(); L2.state = 'attract'; L2.paused = false; L3.state = 'off';
    hide('hud'); hide('shop'); hide('result'); show('title'); refreshBest(); syncUI();
  }
  function refreshBest() {
    const bits = [];
    if (best.wins) bits.push(`Golden Cartridges: ${best.wins}` + (best.fastest != null ? ` (fastest by ${fmtClock(best.fastest)})` : ''));
    if (best.hi2) bits.push(`Star Hopper hi ${best.hi2}`);
    if (best.hi3) bits.push(`Pip Dash best ${best.hi3}`);
    $('bestLine').textContent = bits.join(' · ');
  }

  // ======================================================================
  // MAIN LOOP
  // ======================================================================
  function update(dt) {
    if (G.paused) return;
    if (G.trans) {
      const tr = G.trans;
      tr.t += dt / tr.dur;
      G.view = lerp(tr.from, tr.to, ease(Math.min(1, tr.t)));
      if (tr.t >= 1) { G.view = tr.to; G.trans = null; if (tr.done) tr.done(); }
    }
    if (G.mode === 'play') {
      G.clock += dt * RATE[Math.max(1, Math.round(G.view))];
      if (!G.warned && G.clock > NIGHT - 30) { G.warned = true; toast('30 minutes until closing!'); }
      if (G.clock >= NIGHT) { G.clock = NIGHT; closingTime(); }
    }
    if (G.mode === 'ending') {
      G.endT += dt;
      if (G.endT > 1.6 && G.endT - dt <= 1.6) goDepth(0, () => setTimeout(() => showResult(true), 1800), 4);
    }
    L1.update(dt, G.mode === 'play' && G.depth === 1 && !G.trans && !G.shop);
    L2.dir = l2Dir();
    L2.update(dt);
    if (G.depth === 3 && !G.trans && G.mode === 'play') L3.update(dt);
    else L3.t += dt;
  }

  function render() {
    // Inner games first, so each parent can draw its child's latest frame.
    if (L2.state === 'raise' || L2.state === 'hand' || L2.state === 'lower') L3.render();
    L2.render();

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0b0816'; ctx.fillRect(0, 0, cv.width, cv.height);
    const cam = camera(), ah = SH - TOP - BOT;
    const ox = SW / 2 - cam.cx * cam.s, oy = TOP + ah / 2 - cam.cy * cam.s;
    ctx.setTransform(DPR * cam.s, 0, 0, DPR * cam.s, DPR * ox, DPR * oy);
    ctx.imageSmoothingEnabled = false;
    const outer = G.view < 1;
    if (outer) drawOuterHandheld(ctx, 1);
    L1.draw(ctx);
    if (outer) {
      // Seen from outside, the arcade turns into LCD pixels.
      ctx.globalAlpha = clamp((1 - G.view) * 1.6, 0, 1);
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = '#a9c64e'; ctx.fillRect(0, 0, W1, H1);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = clamp((1 - G.view) * 0.5, 0, 0.35);
      ctx.fillStyle = '#a9c64e'; ctx.fillRect(0, 0, W1, H1);
      ctx.globalAlpha = 1;
    }

    // the floating joystick
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const j = L1.joy;
    if (j && G.depth === 1 && G.mode === 'play') {
      ctx.globalAlpha = 0.35; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(j.ox, j.oy, 46, 0, 7); ctx.stroke();
      ctx.globalAlpha = 0.5; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(j.ox + j.dx, j.oy + j.dy, 18, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    render();
    if (G.mode !== 'title') updateHUD();
    requestAnimationFrame(frame);
  }

  resize(); L1.reset(); refreshBest(); syncUI();
  requestAnimationFrame(frame);
  // for testing in a browser console
  window.__nested = { G, L1, L2, L3, Game };
})();
