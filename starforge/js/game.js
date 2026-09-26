/* Starforge — the flight: the game loop, your ship, collisions, pickups,
   the HUD and the end-of-run summary.

   The playfield is 360 world units wide and 600–800 tall depending on the
   screen's shape. On wide screens it sits in a column in the middle. */
(function (SF) {
  'use strict';

  const U = SF.util;
  const A = SF.audio;
  const Wp = SF.weapons;
  const E = SF.enemies;
  const ART = SF.art.ART;
  const BOX = SF.art.SHIP_BOX;
  const TAU = U.TAU;
  const W = 360;
  const $ = (id) => document.getElementById(id);

  const els = {
    screen: $('flight'), canvas: $('stage'), hud: $('hud'),
    score: $('score'), mult: $('mult'), sector: $('sector-lbl'), wave: $('wave-lbl'), coins: $('run-coins'),
    hull: $('hull-fill'), shield: $('shield-fill'), vitals: document.querySelector('.vitals'), power: $('power'),
    special: $('btn-special'), specialRing: $('special-ring'), specialIcon: $('special-icon'), specialName: $('special-name'),
    boss: $('boss'), bossName: $('boss-name'), bossFill: $('boss-fill'),
    banner: $('banner'), bannerTitle: $('banner-title'), bannerSub: $('banner-sub'), tip: $('tip'),
    pause: $('pause'), over: $('over'), overTitle: $('over-title'), overScore: $('over-score'), overBest: $('over-best'),
    overStats: $('over-stats'), overCredits: $('over-credits'),
  };
  const ctx = els.canvas.getContext('2d');
  const view = { w: 1, h: 1, dpr: 1, scale: 1, ox: 0, oy: 0, px: 0, boxed: false };
  const RING = 2 * Math.PI * 44;

  const G = {
    W, H: 700, t: 0, state: 'idle', paused: false,
    player: null, enemies: [], pb: [], eb: [], pickups: [], missiles: [], novas: [], arcs: [], hazards: [], texts: [],
    fx: new SF.Particles(900), bg: new SF.Starfield(), diff: SF.waves.difficulty(1),
    score: 0, combo: 0, comboT: 0, credits: 0, kills: 0, bosses: 0, sector: 1,
    shake: 0, flash: 0, hurtFlash: 0, warp: 0, slow: 1, vacuum: 0, killsSinceP: 0, boss: null, bossDown: false, dieT: 0,
  };
  G.director = new SF.Director(G);

  let active = false;
  let bannerTimer = 0;
  let tipTimer = 0;
  const hudCache = {};

  const input = { id: null, ax: 0, ay: 0, sx: 0, sy: 0, keys: new Set(), kb: false };

  function buzz(pattern) {
    if (!SF.profile.data.settings.vibe || !navigator.vibrate) return;
    try { navigator.vibrate(pattern); } catch (e) { /* ignore */ }
  }

  /* ---------- Setup ---------- */

  function makePlayer() {
    const ship = Object.assign({}, SF.profile.data.ship);
    const st = SF.profile.stats();
    const R = SF.art.resolve(ship);
    const h = R.hull;
    const guns = [];
    if (st.sideGuns) guns.push(...h.guns);
    if (st.wingGuns) {
      const m = h.mount;
      const wg = R.wing.gun;
      const x = m.x + wg.x * m.s;
      const y = m.y + wg.y * m.s;
      guns.push({ x, y }, { x: -x, y });
    }
    return {
      ship, st, R, guns, gun: h.gun,
      x: W / 2, y: G.H + 50, tx: W / 2, ty: G.H - 120, bank: 0, thrust: 1, entering: 1.2,
      hp: st.armor, maxHp: st.armor, sh: st.shield, maxSh: st.shield, shT: 0,
      inv: 0, hitFlash: 0, shieldFlash: 0, power: 1, cool: 0, sideCool: 0, charge: 60, alive: true,
      aegis: 0, overdrive: 0, drones: 0, droneA: 0, droneCool: 0, salvo: 0, salvoT: 0,
      beam: null, sprite: null, white: null, holoT: 0, trailT: 0,
    };
  }

  function renderPlayerSprite() {
    const p = G.player;
    if (!p || !view.px) return;
    p.sprite = SF.art.renderShip(p.R, view.px * ART, G.t);
    const w = U.canvas(p.sprite.width, p.sprite.height);
    const g = w.getContext('2d');
    g.drawImage(p.sprite, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = '#FFFFFF';
    g.fillRect(0, 0, w.width, w.height);
    p.white = w;
  }

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    view.w = w;
    view.h = h;
    view.dpr = dpr;
    G.H = Math.round(U.clamp((W * h) / w, 600, 800));
    view.scale = Math.min(w / W, h / G.H);
    view.ox = (w - W * view.scale) / 2;
    view.oy = (h - G.H * view.scale) / 2;
    view.boxed = view.ox > 2 || view.oy > 2;
    const px = view.scale * dpr;
    if (Math.abs(px - view.px) > 0.001) {
      view.px = px;
      SF.art.clearCache();
      renderPlayerSprite();
    }
    els.canvas.width = Math.round(w * dpr);
    els.canvas.height = Math.round(h * dpr);
    G.bg.resize(w, h);
    const s = els.hud.style;
    s.left = view.ox + 'px';
    s.top = view.oy + 'px';
    s.width = W * view.scale + 'px';
    s.height = G.H * view.scale + 'px';
    // Bigger screens get a bigger HUD.
    s.setProperty('--hz', U.clamp(view.scale / 1.1, 1, 1.7).toFixed(3));
    const p = G.player;
    if (p && !p.entering) {
      p.tx = p.x = U.clamp(p.x, 14, W - 14);
      p.ty = p.y = U.clamp(p.y, 50, G.H - 30);
    }
  }

  function start() {
    active = true;
    resize();
    for (const k of ['enemies', 'pb', 'eb', 'pickups', 'missiles', 'novas', 'arcs', 'hazards', 'texts']) G[k].length = 0;
    G.fx.clear();
    Object.assign(G, {
      t: 0, state: 'play', paused: false, score: 0, combo: 0, comboT: 0, credits: 0, kills: 0, bosses: 0,
      shake: 0, flash: 0, hurtFlash: 0, slow: 1, vacuum: 0, killsSinceP: 0, boss: null, bossDown: false, dieT: 0,
    });
    G.player = makePlayer();
    renderPlayerSprite();
    input.id = null;
    input.keys.clear();
    for (const k of Object.keys(hudCache)) delete hudCache[k];
    els.pause.hidden = true;
    els.over.hidden = true;
    els.boss.hidden = true;
    const sp = SF.parts.get('special', G.player.st.special);
    els.specialName.textContent = sp.name;
    const ic = els.specialIcon;
    const ig = ic.getContext('2d');
    ig.clearRect(0, 0, ic.width, ic.height);
    SF.art.drawIcon(ig, sp.id, G.player.R.energy, ic.width);
    G.director.begin(1);
    showTip();
  }

  function showTip() {
    const prof = SF.profile;
    if (prof.data.tipSeen && prof.data.totals.runs > 1) return;
    const fine = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
    els.tip.textContent = fine
      ? 'Move with the mouse or arrow keys. Your guns fire on their own. Space fires your special.'
      : 'Drag anywhere to fly. Your guns fire on their own. Tap the button when it glows for your special.';
    els.tip.hidden = false;
    clearTimeout(tipTimer);
    tipTimer = setTimeout(() => { els.tip.hidden = true; }, 5500);
    prof.data.tipSeen = true;
    prof.save();
  }

  /* ---------- Input ---------- */

  const canSteer = () => active && G.state === 'play' && !G.paused && G.player && G.player.alive && G.player.entering <= 0;

  function clampTarget(p) {
    p.tx = U.clamp(p.tx, 14, W - 14);
    p.ty = U.clamp(p.ty, 50, G.H - 30);
  }

  function mouseTo(e) {
    if (!canSteer()) return;
    const p = G.player;
    p.tx = (e.clientX - view.ox) / view.scale;
    p.ty = (e.clientY - view.oy) / view.scale;
    clampTarget(p);
  }

  els.canvas.addEventListener('pointerdown', (e) => {
    A.unlock();
    if (e.pointerType === 'mouse') {
      mouseTo(e);
      return;
    }
    if (!canSteer() || input.id !== null) return;
    const p = G.player;
    input.id = e.pointerId;
    input.ax = e.clientX;
    input.ay = e.clientY;
    input.sx = p.x;
    input.sy = p.y;
    p.tx = p.x;
    p.ty = p.y;
    try { els.canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    e.preventDefault();
  });

  els.canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') {
      mouseTo(e);
      return;
    }
    if (e.pointerId !== input.id || !canSteer()) return;
    const p = G.player;
    const k = SF.profile.data.settings.sens / view.scale;
    const rx = input.sx + (e.clientX - input.ax) * k;
    const ry = input.sy + (e.clientY - input.ay) * k;
    p.tx = rx;
    p.ty = ry;
    clampTarget(p);
    // Slide the anchor at the edges so dragging back responds straight away.
    input.sx += p.tx - rx;
    input.sy += p.ty - ry;
    e.preventDefault();
  });

  const release = (e) => {
    if (e.pointerId === input.id) input.id = null;
  };
  els.canvas.addEventListener('pointerup', release);
  els.canvas.addEventListener('pointercancel', release);

  const MOVE_KEYS = {
    ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r', ArrowUp: 'u', KeyW: 'u', ArrowDown: 'd', KeyS: 'd',
  };
  window.addEventListener('keydown', (e) => {
    if (!active) return;
    A.unlock();
    if (MOVE_KEYS[e.code]) {
      input.keys.add(MOVE_KEYS[e.code]);
      e.preventDefault();
    } else if (e.code === 'Space' || e.code === 'KeyX' || e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyE') {
      if (!e.repeat) useSpecial();
      e.preventDefault();
    } else if (e.code === 'Escape' || e.code === 'KeyP') {
      if (G.paused) resume();
      else pause();
    }
  });
  window.addEventListener('keyup', (e) => {
    if (MOVE_KEYS[e.code]) input.keys.delete(MOVE_KEYS[e.code]);
  });

  function useSpecial() {
    const p = G.player;
    if (!canSteer()) return;
    if (p.charge < 100) {
      A.play('deny');
      els.special.classList.remove('nope');
      void els.special.offsetWidth;
      els.special.classList.add('nope');
      return;
    }
    p.charge = 0;
    Wp.special(G, p);
  }

  els.special.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    A.unlock();
    useSpecial();
  });

  /* ---------- Combat ---------- */

  const comboMult = () => Math.min(5, 1 + Math.floor(G.combo / 10));

  function addCharge(v) {
    const p = G.player;
    const was = p.charge;
    p.charge = Math.min(100, p.charge + v);
    if (was < 100 && p.charge >= 100) A.play('ready');
  }

  function hitTest(e, x, y, r) {
    if (e.box) return Math.abs(x - e.x) < e.box.hw + r && Math.abs(y - e.y) < e.box.hh + r;
    const rr = e.r + r;
    return U.dist2(x, y, e.x, e.y) < rr * rr;
  }

  const SPARK = { drone: '#FF8FA3', swooper: '#FFC070', charger: '#D0A0FF', rock: '#E0D2C0', mine: '#FFE45C', sniper: '#A8DCFF' };
  const PALETTE = {
    drone: ['#FFE0E6', '#FF6A86', '#C22D45'],
    swooper: ['#FFF2A8', '#FFB040', '#F2742B'],
    charger: ['#F2D4FF', '#B07BFF', '#8A3BF0'],
    sniper: ['#E6F7FF', '#7CC8FF', '#4B3AA8'],
    mine: ['#FFF3B0', '#FFE45C', '#FF7A3D'],
    rock: ['#E8DCCB', '#B39A85', '#6B5E57'],
  };

  // Damage an enemy. `quiet` skips sparks and sound, for damage over time.
  G.hit = function (e, dmg, x, y, quiet) {
    if (!e.alive || e.dying) return;
    if (e.invuln) {
      if (!quiet) G.fx.spark(x, y, '#9AA4C8', 2, 80, 0.2);
      return;
    }
    e.hp -= dmg;
    e.flash = 0.05;
    if (!quiet) {
      G.fx.spark(x, y, SPARK[e.type] || '#FFD0A0', 2, 130, 0.25);
      A.play('hit');
    }
    if (e.hp <= 0) kill(e);
  };

  function kill(e) {
    const p = G.player;
    if (e.type === 'boss') {
      e.dying = 2.4;
      e.boomT = 0;
      e.invuln = true;
      for (const b of G.eb) G.fx.glow(b.x, b.y, 5, b.color, 0.3);
      G.eb.length = 0;
      G.hazards.length = 0;
      return;
    }
    e.alive = false;
    G.kills++;
    G.killsSinceP++;
    G.combo++;
    G.comboT = 2.6;
    G.score += e.score * comboMult();
    if (p.alive) addCharge(e.charge * p.st.charge);
    const size = e.big ? 3 : e.part ? 2 : e.type === 'rock' ? Math.max(1, e.size - 1) : 1;
    G.fx.explode(e.x, e.y, size, PALETTE[e.type]);
    A.play(e.big || e.part || (e.type === 'rock' && e.size === 3) ? 'boom' : 'pop');
    if (e.big || e.part) G.shake = Math.max(G.shake, 7);
    drops(e);
    E.onDeath(e, G);
    if (G.combo > 0 && G.combo % 25 === 0) text(e.x, e.y - 16, `${G.combo} CHAIN ×${comboMult()}`, '#FFD45C', 1.4);
  }

  function drop(kind, x, y, value) {
    const a = U.rand(-Math.PI * 0.9, -Math.PI * 0.1);
    const s = U.rand(40, 130);
    G.pickups.push({ kind, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, value: value || 1, t: 0, spin: U.rand(0, TAU) });
  }

  function drops(e) {
    const p = G.player;
    let v = e.value;
    while (v > 0) {
      const bar = v >= 5;
      drop('coin', e.x, e.y, bar ? 5 : 1);
      v -= bar ? 5 : 1;
    }
    if (e.drop === 'power' || G.killsSinceP >= 30) {
      drop('power', e.x, e.y);
      G.killsSinceP = 0;
    }
    if (p.hp < p.maxHp * 0.5 && U.chance(e.big ? 0.5 : 0.03)) drop('repair', e.x, e.y);
  }

  // Hurt the player. Returns true if the hit landed.
  G.hurt = function (amount) {
    const p = G.player;
    if (!p || !p.alive || p.entering > 0 || p.inv > 0 || p.aegis > 0 || G.state !== 'play') return false;
    p.shT = 3;
    if (p.sh > 0) {
      const a = Math.min(p.sh, amount);
      p.sh -= a;
      amount -= a;
      p.shieldFlash = 0.3;
      if (amount <= 0) {
        p.inv = 0.15;
        A.play('shieldhit');
        buzz(12);
        return true;
      }
    }
    p.hp -= amount;
    p.inv = 1.1;
    p.hitFlash = 0.25;
    G.hurtFlash = 0.35;
    G.shake = Math.max(G.shake, 9);
    G.combo = 0;
    G.comboT = 0;
    G.fx.spark(p.x, p.y, '#FF6A6A', 10, 200, 0.4);
    A.play('hurt');
    buzz(50);
    if (p.hp <= 0) die();
    return true;
  };

  function die() {
    const p = G.player;
    p.alive = false;
    p.hp = 0;
    p.beam = null;
    G.state = 'dying';
    G.dieT = 0;
    G.fx.explode(p.x, p.y, 4, ['#FFFFFF', p.R.energy, '#FFB040', '#FF5A3D']);
    G.fx.ring(p.x, p.y, 10, 180, p.R.energy, 0.8, 5);
    G.shake = 20;
    G.flash = 0.5;
    A.play('bigboom');
    A.hum(false);
    buzz([90, 50, 160]);
  }

  G.banner = function (title, sub, kind) {
    els.bannerTitle.textContent = title;
    els.bannerSub.textContent = sub || '';
    els.banner.className = 'banner ' + (kind || '');
    els.banner.hidden = false;
    void els.banner.offsetWidth;
    els.banner.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => { els.banner.hidden = true; }, 2700);
  };

  G.sectorClear = function (s) {
    const p = G.player;
    const bonus = 60 * s;
    G.credits += bonus;
    G.score += 2500 * s;
    G.banner('Sector clear', `+${bonus} credits bonus`, 'clear');
    A.play('clear');
    if (p.alive) {
      p.sh = p.maxSh;
      p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.15);
    }
  };

  G.bossKilled = function (e) {
    G.bosses++;
    G.bossDown = true;
    G.boss = null;
    G.score += e.score * G.diff.hp;
    const coins = 150 + 50 * (G.sector - 1);
    for (let i = 0; i < coins / 5; i++) drop('coin', e.x + U.rand(-30, 30), e.y + U.rand(-20, 20), 5);
    drop('power', e.x - 20, e.y);
    drop('power', e.x + 20, e.y);
    drop('repair', e.x, e.y + 10);
    G.vacuum = 4;
    A.music('flight');
    buzz([60, 40, 60, 40, 120]);
  };

  function text(x, y, str, color, life) {
    G.texts.push({ x, y, str, color, t: 0, life: life || 1.1 });
  }

  function collect(k) {
    const p = G.player;
    if (k.kind === 'coin') {
      G.credits += k.value;
      A.play('coin');
      G.fx.glow(k.x, k.y, k.value > 1 ? 12 : 8, '#FFD45C', 0.2);
    } else if (k.kind === 'power') {
      if (p.power < 5) {
        p.power++;
        text(p.x, p.y - 34, p.power === 5 ? 'MAX POWER' : 'POWER UP', '#7CFFB2');
      } else {
        G.score += 1000;
        addCharge(15);
        text(p.x, p.y - 34, '+1,000', '#7CFFB2');
      }
      A.play('power');
      G.fx.ring(p.x, p.y, 8, 46, '#7CFFB2', 0.4, 3);
      buzz(20);
    } else if (k.kind === 'repair') {
      p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.3);
      text(p.x, p.y - 34, 'HULL REPAIRED', '#5CFFB0');
      A.play('repair');
      G.fx.ring(p.x, p.y, 8, 46, '#5CFFB0', 0.4, 3);
    }
  }

  /* ---------- Update ---------- */

  function updatePlayer(p, dt) {
    p.inv = Math.max(0, p.inv - dt);
    p.hitFlash = Math.max(0, p.hitFlash - dt);
    p.shieldFlash = Math.max(0, p.shieldFlash - dt);
    if (!p.alive) return;

    if (p.entering > 0) {
      p.entering -= dt;
      const k = U.easeOut(1 - Math.max(0, p.entering) / 1.2);
      p.x = W / 2;
      p.y = U.lerp(G.H + 50, G.H - 120, k);
      p.tx = p.x;
      p.ty = p.y;
      p.thrust = 1.8;
    } else {
      let kx = 0;
      let ky = 0;
      if (input.keys.has('l')) kx -= 1;
      if (input.keys.has('r')) kx += 1;
      if (input.keys.has('u')) ky -= 1;
      if (input.keys.has('d')) ky += 1;
      if (kx || ky) {
        const n = Math.hypot(kx, ky);
        p.tx = p.x + (kx / n) * 80;
        p.ty = p.y + (ky / n) * 80;
        input.kb = true;
      } else if (input.kb) {
        p.tx = p.x;
        p.ty = p.y;
        input.kb = false;
      }
      clampTarget(p);
      const px = p.x;
      const py = p.y;
      const speed = p.st.speed * (p.overdrive > 0 ? 1.2 : 1);
      const dx = p.tx - p.x;
      const dy = p.ty - p.y;
      const d = Math.hypot(dx, dy);
      const step = speed * dt;
      if (d > step) {
        p.x += (dx / d) * step;
        p.y += (dy / d) * step;
      } else {
        p.x = p.tx;
        p.y = p.ty;
      }
      const vx = dt > 0 ? (p.x - px) / dt : 0;
      const vy = dt > 0 ? (p.y - py) / dt : 0;
      p.bank = U.approach(p.bank, U.clamp(vx / speed, -1, 1), dt * 6);
      p.thrust = U.lerp(p.thrust, 1 + U.clamp(-vy / speed, -0.5, 0.6), Math.min(1, dt * 8));
    }

    if (p.shT > 0) p.shT -= dt * p.st.regen;
    else if (p.sh < p.maxSh) p.sh = Math.min(p.maxSh, p.sh + p.maxSh * 0.13 * p.st.regen * dt);

    if (G.state === 'play') addCharge(0.8 * p.st.charge * dt);

    if (p.R.finish === 'holo' && (p.holoT -= dt) <= 0) {
      p.holoT = 0.08;
      renderPlayerSprite();
    }

    p.trailT -= dt;
    if (p.trailT <= 0) {
      p.trailT = 0.03;
      const col = p.R.engine.id === 'burner' ? '#FF8A2A' : p.R.energy;
      for (const n of p.R.hull.nozzles) {
        G.fx.glow(p.x + n.x * ART, p.y + (n.y + n.r) * ART, n.r * 0.9, col, 0.3, {
          vx: U.rand(-10, 10), vy: 150, grow: -0.6, drag: 0.5,
        });
      }
    }
  }

  function updatePlayerShots(dt) {
    const L = G.pb;
    for (let i = L.length - 1; i >= 0; i--) {
      const b = L[i];
      const sx = b.vx * dt;
      const sy = b.vy * dt;
      const steps = Math.max(1, Math.ceil(Math.hypot(sx, sy) / 16));
      b.life -= dt;
      let dead = false;
      for (let s = 0; s < steps && !dead; s++) {
        b.x += sx / steps;
        b.y += sy / steps;
        for (const e of G.enemies) {
          if (!e.alive || !e.onScreen || e.dying) continue;
          if (b.hits && b.hits.includes(e)) continue;
          if (!hitTest(e, b.x, b.y, b.r)) continue;
          G.hit(e, b.dmg, b.x, b.y);
          if (b.hits) b.hits.push(e);
          else {
            dead = true;
            break;
          }
        }
      }
      if (b.life <= 0 || b.y < -30 || b.x < -20 || b.x > W + 20) dead = true;
      if (dead) {
        L[i] = L[L.length - 1];
        L.pop();
      }
    }
  }

  function updateEnemyBullets(dt) {
    const p = G.player;
    const L = G.eb;
    const hr = p.st.hit;
    for (let i = L.length - 1; i >= 0; i--) {
      const b = L[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      let dead = b.x < -20 || b.x > W + 20 || b.y < -40 || b.y > G.H + 20;
      if (!dead && p.alive) {
        const rr = b.r * 0.8 + hr;
        if (U.dist2(b.x, b.y, p.x, p.y) < rr * rr && G.hurt(b.dmg)) dead = true;
      }
      if (dead) {
        L[i] = L[L.length - 1];
        L.pop();
      }
    }
  }

  function contacts(p) {
    if (!p.alive || p.entering > 0 || p.aegis > 0) return;
    for (const e of G.enemies) {
      if (!e.alive || !e.onScreen || e.dying) continue;
      if (!hitTest(e, p.x, p.y, p.st.hit + 4)) continue;
      if (G.hurt(e.contact) && e.type !== 'boss' && !e.part) G.hit(e, (e.big ? 80 : 60) * G.diff.hp, p.x, p.y);
    }
  }

  function updateHazards(dt) {
    const p = G.player;
    const L = G.hazards;
    for (let i = L.length - 1; i >= 0; i--) {
      const h = L[i];
      h.t += dt;
      if (h.owner && (!h.owner.alive || h.owner.dying)) {
        L.splice(i, 1);
        continue;
      }
      if (h.owner) {
        h.x = h.owner.x;
        h.y = h.owner.y;
      }
      if (h.t >= h.warn && !h.fired) {
        h.fired = true;
        A.play('laser');
        G.shake = Math.max(G.shake, 4);
      }
      if (h.fired && !h.hit && p.alive && U.rayDist(p.x, p.y, h.x, h.y, h.ang, 1400) < h.w / 2 + p.st.hit) h.hit = G.hurt(28 * G.diff.dmg);
      if (h.t > h.warn + h.fire) L.splice(i, 1);
    }
  }

  function updatePickups(dt) {
    const p = G.player;
    const mag = p.st.magnet;
    const L = G.pickups;
    for (let i = L.length - 1; i >= 0; i--) {
      const k = L[i];
      k.t += dt;
      const dx = p.x - k.x;
      const dy = p.y - k.y;
      const d = Math.hypot(dx, dy) || 1;
      const pull = p.alive && k.t > 0.25 && (G.vacuum > 0 || d < mag || (k.kind !== 'coin' && d < mag * 1.4));
      if (pull) {
        const sp = G.vacuum > 0 ? 720 : 280 + (mag - Math.min(d, mag)) * 5;
        const f = Math.min(1, dt * 10);
        k.vx = U.lerp(k.vx, (dx / d) * sp, f);
        k.vy = U.lerp(k.vy, (dy / d) * sp, f);
      } else {
        k.vx *= Math.pow(0.3, dt);
        k.vy = U.approach(k.vy, 55, 160 * dt);
      }
      k.x += k.vx * dt;
      k.y += k.vy * dt;
      if (p.alive && d < p.st.hit + 16) {
        collect(k);
        L.splice(i, 1);
      } else if (k.y > G.H + 30) {
        L.splice(i, 1);
      }
    }
    if (G.vacuum > 0) G.vacuum -= dt;
  }

  function update(dt) {
    if (G.state === 'dying') {
      G.dieT += dt;
      G.slow = G.dieT < 1 ? 0.35 : 1;
      if (G.dieT > 2.2) {
        finish(false);
        return;
      }
    }
    dt *= G.slow;
    G.t += dt;
    const p = G.player;

    G.warp = Math.max(0, G.warp - dt * 0.55);
    G.bg.warp = G.warp * G.warp;
    G.bg.update(dt, 40 * view.scale);
    if (G.state === 'play') G.director.update(dt);

    updatePlayer(p, dt);
    p.beam = null;
    if (p.alive && p.entering <= 0) Wp.fire(G, p, dt);
    A.hum(!!p.beam && !G.paused);
    Wp.update(G, p, dt);
    E.update(G, dt);
    contacts(p);
    updateEnemyBullets(dt);
    updateHazards(dt);
    updatePlayerShots(dt);
    updatePickups(dt);
    for (let i = G.texts.length - 1; i >= 0; i--) {
      const t = G.texts[i];
      t.t += dt;
      t.y -= 26 * dt;
      if (t.t > t.life) G.texts.splice(i, 1);
    }
    G.fx.update(dt);
    if (G.comboT > 0 && (G.comboT -= dt) <= 0) G.combo = 0;
    G.shake *= Math.pow(0.002, dt);
    if (G.shake < 0.2) G.shake = 0;
    G.flash = Math.max(0, G.flash - dt);
    G.hurtFlash = Math.max(0, G.hurtFlash - dt);
  }

  /* ---------- HUD ---------- */

  function setText(el, key, v) {
    if (hudCache[key] === v) return;
    hudCache[key] = v;
    el.textContent = v;
  }

  function setStyle(el, key, prop, v) {
    if (hudCache[key] === v) return;
    hudCache[key] = v;
    el.style[prop] = v;
  }

  function hud() {
    const p = G.player;
    setText(els.score, 'score', U.fmt(G.score));
    setText(els.mult, 'mult', G.combo >= 5 ? `×${comboMult()}  ·  ${G.combo} chain` : '');
    setText(els.sector, 'sector', `Sector ${G.sector}`);
    setText(els.wave, 'wave', G.director.label());
    setText(els.coins, 'coins', U.fmt(G.credits));
    setStyle(els.hull, 'hull', 'transform', `scaleX(${(Math.max(0, p.hp) / p.maxHp).toFixed(3)})`);
    setStyle(els.shield, 'shield', 'transform', `scaleX(${(p.maxSh ? p.sh / p.maxSh : 0).toFixed(3)})`);
    const low = p.alive && p.hp < p.maxHp * 0.3;
    if (hudCache.low !== low) {
      hudCache.low = low;
      els.vitals.classList.toggle('low', low);
    }
    const lvl = String(p.overdrive > 0 ? 5 : p.power);
    if (hudCache.power !== lvl) {
      hudCache.power = lvl;
      els.power.dataset.level = lvl;
    }
    setStyle(els.specialRing, 'ring', 'strokeDashoffset', (RING * (1 - p.charge / 100)).toFixed(1));
    const ready = p.charge >= 100 && p.alive;
    if (hudCache.ready !== ready) {
      hudCache.ready = ready;
      els.special.classList.toggle('ready', ready);
    }
    const b = G.boss && G.boss.alive ? G.boss : null;
    if (hudCache.boss !== b) {
      hudCache.boss = b;
      els.boss.hidden = !b;
      if (b) els.bossName.textContent = b.name;
    }
    if (b) setStyle(els.bossFill, 'bossFill', 'transform', `scaleX(${(Math.max(0, b.hp) / b.maxHp).toFixed(3)})`);
  }

  /* ---------- Drawing ---------- */

  function drawHazards(g, active) {
    for (const h of G.hazards) {
      g.save();
      g.translate(h.x, h.y);
      g.rotate(h.ang);
      if (!h.fired && !active) {
        const k = h.t / h.warn;
        g.fillStyle = U.rgba(h.color, 0.06 + 0.1 * k);
        g.fillRect(0, -h.w / 2, 1400, h.w);
        g.fillStyle = U.rgba(h.color, (0.3 + 0.5 * k) * (Math.floor(G.t * 16) % 2 ? 1 : 0.6));
        g.fillRect(0, -0.8, 1400, 1.6);
      } else if (h.fired && active) {
        const k = 1 - (h.t - h.warn) / h.fire;
        g.globalCompositeOperation = 'lighter';
        const gr = g.createLinearGradient(0, -h.w, 0, h.w);
        gr.addColorStop(0, U.rgba(h.color, 0));
        gr.addColorStop(0.35, U.rgba(h.color, 0.7 * k));
        gr.addColorStop(0.5, `rgba(255,255,255,${k})`);
        gr.addColorStop(0.65, U.rgba(h.color, 0.7 * k));
        gr.addColorStop(1, U.rgba(h.color, 0));
        g.fillStyle = gr;
        g.fillRect(0, -h.w, 1400, h.w * 2);
      }
      g.restore();
    }
  }

  function drawTelegraphs(g) {
    for (const e of G.enemies) {
      if (!e.alive) continue;
      if (e.type === 'sniper' && e.state === 'warn') {
        const k = Math.min(1, e.st / 1.1);
        const locked = e.st > 0.8;
        g.strokeStyle = locked ? `rgba(120,220,255,${Math.floor(G.t * 20) % 2 ? 0.9 : 0.4})` : `rgba(120,220,255,${0.15 + 0.35 * k})`;
        g.lineWidth = locked ? 1.6 : 1;
        g.beginPath();
        g.moveTo(e.x, e.y);
        g.lineTo(e.x + Math.cos(e.aimA) * 1000, e.y + Math.sin(e.aimA) * 1000);
        g.stroke();
      } else if (e.type === 'charger' && e.state === 'aim') {
        g.strokeStyle = `rgba(200,140,255,${0.25 + 0.25 * Math.sin(G.t * 30)})`;
        g.lineWidth = 1;
        g.setLineDash([6, 6]);
        g.beginPath();
        g.moveTo(e.x, e.y);
        g.lineTo(e.x + Math.cos(e.aimA) * 220, e.y + Math.sin(e.aimA) * 220);
        g.stroke();
        g.setLineDash([]);
      }
    }
  }

  function glowAt(g, x, y, r, color, alpha) {
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = alpha === undefined ? 1 : alpha;
    g.drawImage(U.glow(color), x - r, y - r, r * 2, r * 2);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  const CORE = { drone: '#FF6A86', swooper: '#FFD45C', charger: '#C08BFF', sniper: '#7CC8FF' };

  function drawEnemy(g, e) {
    const px = view.px;
    if (e.type === 'boss' && e.kind === 'warden') drawWardenArms(g, e);
    const spr = e.type === 'rock' ? SF.art.rockSprite(e.size, e.variant, px) : SF.art.enemySprite(e.sprite || e.type, px);
    const s = spr.box;
    if (CORE[e.type]) {
      // The engine sits at the back of the ship: local (0, -0.8r), rotated.
      const back = -e.r * 0.8;
      const ex = e.x - Math.sin(e.rot) * back;
      const ey = e.y + Math.cos(e.rot) * back;
      glowAt(g, ex, ey, e.type === 'charger' && e.state === 'aim' ? 16 : 9, CORE[e.type], 0.8);
    }
    g.save();
    g.translate(e.x, e.y);
    if (e.rot) g.rotate(e.rot);
    g.drawImage(spr.img, -s / 2, -s / 2, s, s);
    if (e.flash > 0) {
      g.globalAlpha = 0.6;
      g.drawImage(spr.flash, -s / 2, -s / 2, s, s);
    }
    g.restore();
    switch (e.type) {
      case 'gunship':
        glowAt(g, e.x, e.y + 1, 11 + Math.sin(G.t * 6) * 2, '#FF4D6A');
        break;
      case 'mine': {
        const on = e.armed ? Math.floor(G.t * 12) % 2 : Math.floor(G.t * 2.5) % 2;
        if (on) glowAt(g, e.x, e.y, e.armed ? 14 : 8, '#FF3B3B');
        break;
      }
      case 'turret':
        g.save();
        g.translate(e.x, e.y);
        g.rotate(e.aimA);
        g.fillStyle = e.flash > 0 ? '#FFFFFF' : '#2A0A1A';
        g.strokeStyle = 'rgba(5,7,20,0.8)';
        g.lineWidth = 1;
        g.beginPath();
        g.rect(2, -3, 15, 6);
        g.fill();
        g.stroke();
        g.restore();
        if (e.burst > 0) glowAt(g, e.x + Math.cos(e.aimA) * 17, e.y + Math.sin(e.aimA) * 17, 8, '#FF9A3D');
        break;
      case 'boss':
        drawBossParts(g, e);
        break;
      default:
    }
    if ((e.type === 'gunship' || e.type === 'sniper' || e.part) && e.hp < e.maxHp && !e.dying) {
      const w = Math.max(24, e.r * 1.6);
      const y = e.y + (e.type === 'gunship' ? 32 : e.r + 8);
      g.fillStyle = 'rgba(0,0,0,0.5)';
      g.fillRect(e.x - w / 2, y, w, 3);
      g.fillStyle = '#FF6A86';
      g.fillRect(e.x - w / 2, y, (w * Math.max(0, e.hp)) / e.maxHp, 3);
    }
  }

  function drawWardenArms(g, e) {
    const n = 4 + (e.phase || 0);
    for (let k = 0; k < n; k++) {
      const a = e.armRot + (k * TAU) / n;
      g.save();
      g.translate(e.x, e.y);
      g.rotate(a);
      g.fillStyle = e.flash > 0 ? '#FFFFFF' : '#A8701E';
      g.strokeStyle = 'rgba(5,7,20,0.85)';
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(16, -5);
      g.lineTo(52, -3);
      g.lineTo(60, 0);
      g.lineTo(52, 3);
      g.lineTo(16, 5);
      g.closePath();
      g.fill();
      g.stroke();
      g.restore();
      if (e.mode === 'spiral') glowAt(g, e.x + Math.cos(a) * 30, e.y + Math.sin(a) * 30, 6, '#FFE45C', 0.8);
    }
  }

  function drawBossParts(g, e) {
    const pulse = 0.8 + 0.2 * Math.sin(G.t * 5);
    if (e.kind === 'dread') {
      glowAt(g, e.x, e.y + 8, (14 + e.phase * 4) * pulse, '#FF3D5E');
    } else if (e.kind === 'hive') {
      glowAt(g, e.x, e.y, 19 * pulse, '#FF5CD6', 0.6);
      const p = G.player;
      const a = U.angleTo(e.x, e.y, p.x, p.y);
      g.fillStyle = '#1C0830';
      g.beginPath();
      g.arc(e.x + Math.cos(a) * 5, e.y + Math.sin(a) * 5, 6, 0, TAU);
      g.fill();
    } else {
      glowAt(g, e.x, e.y, (16 + e.phase * 3) * pulse, e.mode === 'laser' ? '#FF7A3D' : '#FFB23D');
    }
  }

  function drawPickups(g) {
    for (const k of G.pickups) {
      if (k.kind === 'coin') {
        const big = k.value > 1;
        const r = big ? 6.5 : 4.5;
        glowAt(g, k.x, k.y, r * 2.4, '#FFC83D', 0.55);
        const sq = Math.abs(Math.cos(k.t * 6 + k.spin));
        g.fillStyle = big ? '#FFE27A' : '#FFC83D';
        g.strokeStyle = '#8A5A00';
        g.lineWidth = 1;
        g.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = Math.PI / 6 + (i * TAU) / 6;
          g.lineTo(k.x + Math.cos(a) * r * Math.max(0.2, sq), k.y + Math.sin(a) * r);
        }
        g.closePath();
        g.fill();
        g.stroke();
      } else {
        const col = k.kind === 'power' ? '#54FF9A' : '#5CFFD0';
        glowAt(g, k.x, k.y, 18 + Math.sin(k.t * 8) * 3, col, 0.7);
        g.fillStyle = '#0B2E22';
        g.strokeStyle = col;
        g.lineWidth = 2;
        g.beginPath();
        g.arc(k.x, k.y, 8.5, 0, TAU);
        g.fill();
        g.stroke();
        g.fillStyle = '#FFFFFF';
        if (k.kind === 'power') {
          g.font = '800 10px Orbitron, system-ui, sans-serif';
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText('P', k.x, k.y + 0.5);
        } else {
          g.fillRect(k.x - 4.5, k.y - 1.5, 9, 3);
          g.fillRect(k.x - 1.5, k.y - 4.5, 3, 9);
        }
      }
    }
  }

  function drawPlayer(g, p) {
    if (!p.alive || !p.sprite) return;
    const blink = p.inv > 0.2 && Math.floor(G.t * 18) % 2 === 0;
    g.save();
    g.translate(p.x, p.y);
    g.scale(ART * (1 - Math.abs(p.bank) * 0.2), ART);
    SF.art.drawFlames(g, p.R, G.t, p.thrust);
    if (blink) g.globalAlpha = 0.35;
    g.drawImage(p.sprite, -BOX / 2, -BOX / 2, BOX, BOX);
    if (p.hitFlash > 0 && p.white) {
      g.globalAlpha = p.hitFlash / 0.25;
      g.drawImage(p.white, -BOX / 2, -BOX / 2, BOX, BOX);
    }
    g.restore();
    g.globalAlpha = 1;
    if (p.shieldFlash > 0) {
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = U.rgba(p.R.energy, p.shieldFlash / 0.3);
      g.lineWidth = 2;
      g.beginPath();
      g.arc(p.x, p.y, 28, 0, TAU);
      g.stroke();
      g.globalCompositeOperation = 'source-over';
    }
    // Your real hitbox, so you can thread between bullets.
    const hr = p.st.hit;
    glowAt(g, p.x, p.y, hr * 1.6, p.R.energy, 0.5);
    g.fillStyle = '#FFFFFF';
    g.beginPath();
    g.arc(p.x, p.y, Math.max(1.8, hr * 0.4), 0, TAU);
    g.fill();
  }

  function drawEnemyBullets(g) {
    g.globalCompositeOperation = 'lighter';
    for (const b of G.eb) {
      const r = b.r * 2.4;
      g.drawImage(U.orb(b.color), b.x - r, b.y - r, r * 2, r * 2);
    }
    g.globalCompositeOperation = 'source-over';
  }

  function drawTexts(g) {
    g.font = '800 12px Orbitron, system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const t of G.texts) {
      g.globalAlpha = Math.min(1, (t.life - t.t) * 3);
      g.fillStyle = 'rgba(0,0,0,0.6)';
      g.fillText(t.str, t.x + 1, t.y + 1);
      g.fillStyle = t.color;
      g.fillText(t.str, t.x, t.y);
    }
    g.globalAlpha = 1;
  }

  function render() {
    const g = ctx;
    const { dpr, scale, ox, oy } = view;
    const p = G.player;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    G.bg.draw(g);

    const s = SF.profile.data.settings.shake ? G.shake : 0;
    const sx = s ? U.rand(-s, s) * 0.5 : 0;
    const sy = s ? U.rand(-s, s) * 0.5 : 0;
    g.setTransform(view.px, 0, 0, view.px, (ox + sx * scale) * dpr, (oy + sy * scale) * dpr);
    g.save();
    if (view.boxed) {
      g.beginPath();
      g.rect(0, 0, W, G.H);
      g.clip();
    }
    drawHazards(g, false);
    drawTelegraphs(g);
    drawPickups(g);
    for (const e of G.enemies) if (e.alive && !e.part) drawEnemy(g, e);
    for (const e of G.enemies) if (e.alive && e.part) drawEnemy(g, e);
    Wp.drawShots(g, G, p.R.energy);
    drawPlayer(g, p);
    Wp.drawEffects(g, G, p);
    G.fx.draw(g);
    drawEnemyBullets(g);
    drawHazards(g, true);
    drawTexts(g);
    g.restore();

    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (view.boxed) {
      g.fillStyle = 'rgba(2,3,10,0.55)';
      if (ox > 0) {
        g.fillRect(0, 0, ox, view.h);
        g.fillRect(view.w - ox, 0, ox, view.h);
      }
      if (oy > 0) {
        g.fillRect(ox, 0, W * scale, oy);
        g.fillRect(ox, view.h - oy, W * scale, oy);
      }
      g.strokeStyle = 'rgba(120,150,255,0.18)';
      g.lineWidth = 1;
      g.strokeRect(ox + 0.5, oy + 0.5, W * scale - 1, G.H * scale - 1);
    }
    if (G.flash > 0) {
      g.fillStyle = `rgba(255,255,255,${Math.min(0.6, G.flash)})`;
      g.fillRect(0, 0, view.w, view.h);
    }
    if (G.hurtFlash > 0) {
      const gr = g.createRadialGradient(view.w / 2, view.h / 2, Math.min(view.w, view.h) * 0.3, view.w / 2, view.h / 2, Math.max(view.w, view.h) * 0.75);
      gr.addColorStop(0, 'rgba(255,40,60,0)');
      gr.addColorStop(1, `rgba(255,40,60,${G.hurtFlash})`);
      g.fillStyle = gr;
      g.fillRect(0, 0, view.w, view.h);
    }
  }

  /* ---------- Flow ---------- */

  function frame(dt) {
    if (!active) return;
    if (!G.paused && G.state !== 'over') update(dt);
    if (!active) return;
    render();
    if (G.state !== 'over') hud();
  }

  function pause() {
    if (!active || G.paused || (G.state !== 'play' && G.state !== 'dying')) return;
    G.paused = true;
    input.id = null;
    input.keys.clear();
    A.hum(false);
    els.pause.hidden = false;
  }

  function resume() {
    if (!G.paused) return;
    G.paused = false;
    els.pause.hidden = true;
  }

  function finish(quit) {
    if (G.state === 'over') return;
    G.state = 'over';
    G.paused = false;
    els.pause.hidden = true;
    A.hum(false);
    const run = { score: Math.floor(G.score), credits: G.credits, kills: G.kills, bosses: G.bosses, sector: G.sector };
    const best = SF.profile.record(run);
    els.overTitle.textContent = quit ? 'Run ended' : 'Ship destroyed';
    els.overScore.textContent = U.fmt(run.score);
    els.overBest.hidden = !best.score || run.score === 0;
    els.overCredits.textContent = '+' + U.fmt(run.credits);
    const rows = [
      ['Sector reached', `${run.sector} · ${SF.waves.sectorName(run.sector)}`],
      ['Enemies destroyed', U.fmt(run.kills)],
      ['Bosses defeated', U.fmt(run.bosses)],
      ['Best score', U.fmt(SF.profile.data.best.score)],
    ];
    els.overStats.innerHTML = '';
    for (const [k, v] of rows) {
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      dd.textContent = v;
      els.overStats.append(dt, dd);
    }
    els.over.hidden = false;
    A.music('hangar');
    A.play(best.score && run.score > 0 ? 'best' : 'over');
  }

  function stop() {
    active = false;
    G.state = 'idle';
    G.paused = false;
    A.hum(false);
    clearTimeout(bannerTimer);
    clearTimeout(tipTimer);
    els.banner.hidden = true;
    els.tip.hidden = true;
  }

  SF.game = {
    G, view, start, stop, frame, resize, pause, resume, finish, buzz,
    get active() { return active; },
    get running() { return active && G.state !== 'over'; },
  };
})(window.SF = window.SF || {});
