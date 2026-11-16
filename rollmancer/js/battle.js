/* Rollmancer — the scene canvas: the dungeon, the monster, your dice and
   every effect, plus the two big animations (dice rolling in, and the
   cast: dice scoring one by one, charms firing, spells flying, the hit).
   The HUD around it is DOM, handled by ui.js. */
(function (RM) {
  'use strict';

  const TAU = Math.PI * 2;
  const fx = RM.fx;
  const A = () => RM.audio;

  const B = {
    canvas: null, ctx: null, W: 0, H: 0, dpr: 1,
    mode: 'title',
    t: 0,
    busy: false,
    dice: [],
    mon: null,
    stage: null, tray: null,
    area: RM.AREAS[0],
    titleDice: [],
    onTap: null,
  };
  RM.battle = B;

  const speed = () => {
    const s = RM.profile.get().settings.speed;
    return s === 3 ? 3 : s === 2 ? 1.8 : 1;
  };
  const wait = (sec) => new Promise((res) => setTimeout(res, (sec * 1000) / speed()));

  /* ---------------- setup & layout ---------------- */
  B.init = function () {
    B.canvas = document.getElementById('scene');
    B.ctx = B.canvas.getContext('2d');
    B.top = document.getElementById('fxtop');
    B.tctx = B.top.getContext('2d');
    B.resize();
    window.addEventListener('resize', () => B.resize());
    // The HUD changes height (trinkets appear, charm rows grow): keep the
    // dice and the monster lined up with their boxes.
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(() => B.layout());
      ro.observe(document.getElementById('stage'));
      ro.observe(document.getElementById('tray'));
    }
    const tray = document.getElementById('tray');
    // Tap a die to hold it; press and hold to see all six of its faces.
    const hit = (e) => {
      const app = document.getElementById('app').getBoundingClientRect();
      const x = e.clientX - app.left;
      const y = e.clientY - app.top;
      let best = -1;
      let bd = Infinity;
      B.dice.forEach((d, i) => {
        const dd = Math.hypot(d.x - x, d.y - d.lift - y);
        if (dd < bd) { bd = dd; best = i; }
      });
      return best >= 0 && bd < B.dieSize * 0.9 ? best : -1;
    };
    let press = null;
    tray.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const i = hit(e);
      if (i < 0) return;
      press = { i, x: e.clientX, y: e.clientY, long: false };
      B.dice[i].press = 1;
      const me = press;
      press.timer = setTimeout(() => {
        if (press !== me) return;
        me.long = true;
        if (B.dice[i]) B.dice[i].press = 0;
        if (B.onLongPress) B.onLongPress(i);
      }, 430);
    });
    const end = (e, cancel) => {
      if (!press) return;
      const p = press;
      press = null;
      clearTimeout(p.timer);
      if (B.dice[p.i]) B.dice[p.i].press = 0;
      if (cancel || p.long) return;
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 24) return;
      if (B.onTap) B.onTap(p.i);
    };
    tray.addEventListener('pointerup', (e) => end(e, false));
    tray.addEventListener('pointercancel', (e) => end(e, true));
    tray.addEventListener('pointerleave', (e) => end(e, true));
    tray.addEventListener('contextmenu', (e) => e.preventDefault());
    let last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      B.frame(dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  };

  B.resize = function () {
    const app = document.getElementById('app');
    const r = app.getBoundingClientRect();
    B.dpr = Math.min(2, window.devicePixelRatio || 1);
    B.W = r.width;
    B.H = r.height;
    B.canvas.width = B.top.width = Math.round(B.W * B.dpr);
    B.canvas.height = B.top.height = Math.round(B.H * B.dpr);
    B.layout();
  };

  function relRect(el) {
    const app = document.getElementById('app').getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { x: r.left - app.left, y: r.top - app.top, w: r.width, h: r.height };
  }
  B.relRect = relRect;

  B.layout = function () {
    if (B.mode !== 'battle') return;
    const st = document.getElementById('stage');
    const tr = document.getElementById('tray');
    if (!st.offsetParent && st.offsetHeight === 0) return;
    B.stage = relRect(st);
    B.tray = relRect(tr);
    const n = B.dice.length || 5;
    const pad = 14;
    const gapK = 0.2;
    const byW = (B.tray.w - pad * 2) / (n + (n - 1) * gapK);
    B.dieSize = Math.max(34, Math.min(B.tray.h * 0.66, byW, 86));
    const gap = B.dieSize * gapK;
    const total = n * B.dieSize + (n - 1) * gap;
    const x0 = B.tray.x + (B.tray.w - total) / 2 + B.dieSize / 2;
    B.dice.forEach((d, i) => {
      d.tx = x0 + i * (B.dieSize + gap);
      d.ty = B.tray.y + B.tray.h * 0.56;
      if (!d.anim) { d.x = d.tx; d.y = d.ty; }
    });
    if (B.mon) {
      const sw = B.stage.w;
      const sh = B.stage.h;
      B.mon.x = B.stage.x + sw / 2;
      B.mon.y = B.stage.y + sh - 34;
      const fit = Math.min(sw * 0.62, (sh - 70) * 0.95);
      B.mon.scale = Math.max(0.35, fit / 210) / Math.max(1, (B.mon.m.size || 1) * 0.92);
    }
  };

  B.setMode = function (mode) {
    B.mode = mode;
    if (mode !== 'battle') {
      B.dice = [];
    }
    fx.clear();
    requestAnimationFrame(() => B.layout());
  };

  /* ---------------- monster ---------------- */
  B.setMonster = function (m, entering) {
    B.mon = {
      m, x: 0, y: 0, scale: 1,
      st: { hurt: 0, flash: 0, blink: 0, lx: 0, ly: 0.3, squash: 0, alpha: 1 },
      blinkAt: 1 + Math.random() * 3,
      enter: entering ? 0 : 1,
      dying: 0, dead: false, lunge: 0, knock: 0,
    };
    B.layout();
  };

  /* ---------------- dice ---------------- */
  function dieState(fd, setId) {
    return {
      v: fd.v, g: fd.g, held: fd.held, set: setId,
      x: 0, y: 0, tx: 0, ty: 0, lift: 0, rot: 0, sx: 1, sy: 1, glow: 0, dim: 0, pop: 0,
      anim: null, frozen: false,
    };
  }

  // Sync the drawn dice with the fight (new turn → everything tumbles in).
  B.syncDice = function (run, tumble, which) {
    const f = run.fight;
    if (!f) { B.dice = []; return; }
    if (B.dice.length !== f.dice.length) {
      B.dice = f.dice.map((fd) => dieState(fd, run.set));
      B.layout();
    }
    B.dice.forEach((d, i) => {
      const fd = f.dice[i];
      d.v = fd.v;
      d.g = fd.g;
      d.held = fd.held;
      d.frozen = i === f.frozen;
      d.set = run.set;
      d.wild = RM.rules.charmMods(run).wild1 && fd.v === 1;
      d.faces = f.faces[fd.src];
    });
    if (tumble) {
      const list = which || B.dice.map((d, i) => i);
      const fresh = !which;
      list.forEach((i, k) => {
        const d = B.dice[i];
        const delay = k * 0.06 + Math.random() * 0.05;
        d.anim = {
          t: -delay, dur: 0.55 + Math.random() * 0.15, fresh,
          sx: fresh ? d.tx + (Math.random() - 0.5) * B.dieSize * 3 : d.x,
          sy: fresh ? B.tray.y + B.tray.h + B.dieSize * (1 + Math.random()) : d.y,
          spin: (Math.random() < 0.5 ? -1 : 1) * (TAU + Math.random() * TAU),
          flick: 0, landed: false,
        };
        if (fresh) { d.x = d.anim.sx; d.y = d.anim.sy; }
      });
      A().rattle();
    }
  };

  B.rolling = function () {
    return B.dice.some((d) => d.anim);
  };

  /* ---------------- per-frame ---------------- */
  B.frame = function (dt) {
    // Hit-stop: a knockout plays in slow motion for a moment.
    if (B.slow > 0) {
      B.slow -= dt;
      dt *= 0.22;
    }
    B.t += dt;
    const ctx = B.ctx;
    ctx.setTransform(B.dpr, 0, 0, B.dpr, 0, 0);
    fx.update(dt);
    const [sx, sy] = fx.shakeOffset();
    ctx.save();
    ctx.translate(sx, sy);
    if (B.mode === 'battle') drawBattle(ctx, dt);
    else drawTitle(ctx, dt);
    ctx.restore();
    // Effects go on a canvas above the HUD, so numbers and spells fly over it.
    const t = B.tctx;
    t.setTransform(B.dpr, 0, 0, B.dpr, 0, 0);
    t.clearRect(0, 0, B.W, B.H);
    t.save();
    t.translate(sx, sy);
    fx.draw(t);
    fx.drawBanners(t);
    t.restore();
    fx.drawFlash(t, B.W, B.H);
  };

  B.pickTitleMonster = function () {
    const keys = Object.keys(RM.MONSTERS).filter((k) => !RM.MONSTERS[k].size);
    const k = keys[Math.floor(Math.random() * keys.length)];
    B.titleMon = Object.assign({ key: k }, RM.MONSTERS[k]);
    B.titleSt = { blink: 0, lx: 0, ly: -0.6, blinkAt: 2 };
  };
  function drawTitle(ctx, dt) {
    const area = B.mode === 'shop' ? RM.AREAS[1] : B.area;
    RM.art.backdrop(ctx, B.W, B.H, area, B.t, B.H * 0.62);
    ctx.fillStyle = 'rgba(8,4,16,0.35)';
    ctx.fillRect(0, 0, B.W, B.H);
    // A monster peeks up from the bottom of the title screen.
    if (B.mode === 'title' && B.titleMon && !document.getElementById('title').hidden) {
      const st = B.titleSt;
      st.blinkAt -= dt;
      if (st.blinkAt <= 0) { st.blink = Math.min(1, st.blink + dt * 14); if (st.blink >= 1) st.blinkAt = 1.5 + Math.random() * 3; }
      else st.blink = Math.max(0, st.blink - dt * 10);
      st.lx = Math.sin(B.t * 0.7) * 0.6;
      const sc = Math.min(B.W * 0.5, B.H * 0.26) / 190;
      const rise = Math.min(1, B.t * 0.8);
      RM.art.monster(ctx, B.titleMon, B.W / 2, B.H + 130 * sc - RM.easeOut(rise) * 40 * sc + Math.sin(B.t * 1.6) * 3, sc, B.t, st);
    }
    // drifting motes
    if (!B.motes) {
      B.motes = [];
      for (let i = 0; i < 40; i++) B.motes.push({ x: Math.random(), y: Math.random(), s: 1 + Math.random() * 2.5, v: 0.01 + Math.random() * 0.03 });
    }
    ctx.fillStyle = RM.art.rgba(area.fog, 0.45);
    B.motes.forEach((m) => {
      m.y -= m.v * dt;
      if (m.y < -0.05) { m.y = 1.05; m.x = Math.random(); }
      ctx.beginPath();
      ctx.arc(m.x * B.W + Math.sin(B.t + m.y * 10) * 10, m.y * B.H, m.s, 0, TAU);
      ctx.fill();
    });
  }

  function drawBattle(ctx, dt) {
    if (!B.stage) B.layout();
    const horizon = B.stage ? B.stage.y + B.stage.h - 40 : B.H * 0.45;
    RM.art.backdrop(ctx, B.W, B.H, B.area, B.t, horizon);
    // floor glow under the dice
    if (B.tray) {
      const g = ctx.createRadialGradient(B.W / 2, B.tray.y + B.tray.h / 2, 10, B.W / 2, B.tray.y + B.tray.h / 2, B.W * 0.6);
      g.addColorStop(0, 'rgba(120,80,200,0.18)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, B.tray.y - 40, B.W, B.tray.h + 80);
    }
    drawMonster(ctx, dt);
    drawDice(ctx, dt);
  }

  function drawMonster(ctx, dt) {
    const M = B.mon;
    if (!M || M.dead) return;
    const st = M.st;
    // blinking
    M.blinkAt -= dt;
    if (M.blinkAt <= 0) {
      st.blink = Math.min(1, st.blink + dt * 14);
      if (st.blink >= 1) { M.blinkAt = 1.5 + Math.random() * 3.5; }
    } else st.blink = Math.max(0, st.blink - dt * 10);
    st.hurt = Math.max(0, st.hurt - dt * 2.2);
    st.flash = Math.max(0, st.flash - dt * 5);
    st.squash = st.squash * Math.exp(-dt * 8);
    M.knock = M.knock * Math.exp(-dt * 7);
    // look at the die you last touched, or down at the tray
    const tx = B.lookX != null ? RM.clamp((B.lookX - M.x) / (B.W * 0.4), -1, 1) : Math.sin(B.t * 0.5) * 0.3;
    st.lx = RM.lerp(st.lx, tx, Math.min(1, dt * 4));
    st.ly = RM.lerp(st.ly, 0.45, Math.min(1, dt * 4));
    if (M.enter < 1) M.enter = Math.min(1, M.enter + dt * 1.6);
    let y = M.y;
    let sc = M.scale;
    let alpha = 1;
    if (M.enter < 1) {
      const k = RM.easeOut(M.enter);
      y -= (1 - k) * 60;
      alpha = k;
      if (M.enter > 0.98 && !M.landed) { M.landed = true; st.squash = 0.18; }
    }
    if (M.dying > 0) {
      M.dying = Math.min(1, M.dying + dt * 1.8);
      sc *= 1 + M.dying * 0.25;
      alpha = 1 - RM.easeIn(M.dying);
      st.flash = 1;
      if (M.dying >= 1) M.dead = true;
    }
    if (M.lunge > 0) {
      M.lunge = Math.max(0, M.lunge - dt * 1.6);
      const k = Math.sin((1 - M.lunge) * Math.PI);
      sc *= 1 + k * 0.45;
      y += k * 40;
    }
    st.alpha = alpha;
    // aura for bosses
    if (M.m.boss) {
      ctx.save();
      const g = ctx.createRadialGradient(M.x, y - 100 * sc, 10, M.x, y - 100 * sc, 170 * sc);
      g.addColorStop(0, RM.art.rgba(M.m.pal[2], 0.22 + Math.sin(B.t * 2) * 0.06));
      g.addColorStop(1, RM.art.rgba(M.m.pal[2], 0));
      ctx.fillStyle = g;
      ctx.globalAlpha = alpha;
      ctx.fillRect(M.x - 200 * sc, y - 280 * sc, 400 * sc, 320 * sc);
      ctx.restore();
    }
    // Low on HP: it trembles and sweats.
    let tremble = 0;
    const frac = M.m.max ? M.m.hp / M.m.max : 1;
    if (frac > 0 && frac < 0.3 && !M.dying) {
      tremble = Math.sin(B.t * 45) * 1.6;
      M.sweatAt = (M.sweatAt || 0) - dt;
      if (M.sweatAt <= 0) {
        M.sweatAt = 0.5 + Math.random() * 0.5;
        const side = Math.random() < 0.5 ? -1 : 1;
        fx.burst(M.x + side * 55 * sc, y - 170 * sc * (M.m.size || 1), 1, { color: '#9ad8ff', speed: 60, angle: -Math.PI / 2 + side * 0.9, spread: 0.3, gravity: 420, size: 4, kind: 'circle', life: 0.7 });
      }
    }
    RM.art.monster(ctx, M.m, M.x + M.knock * 0.4 + tremble, y - M.knock * 0.3, sc, B.t, st);
  }

  function drawDice(ctx, dt) {
    const s = B.dieSize || 60;
    B.dice.forEach((d, i) => {
      // tumbling in
      if (d.anim) {
        const a = d.anim;
        a.t += dt * speed();
        if (a.t >= 0) {
          const k = Math.min(1, a.t / a.dur);
          const e = RM.easeOut(k);
          d.x = RM.lerp(a.sx, d.tx, e);
          if (a.fresh) d.y = RM.lerp(a.sy, d.ty, RM.easeBack(k));
          else d.y = d.ty - Math.sin(k * Math.PI) * s * 0.9;
          d.rot = a.spin * (1 - e);
          a.flick -= dt;
          if (k < 0.82 && a.flick <= 0 && d.faces) {
            a.flick = 0.06;
            const f = d.faces[Math.floor(Math.random() * d.faces.length)];
            d.showV = f.v;
            d.showG = f.g;
          }
          if (k >= 0.82) { d.showV = null; d.showG = undefined; }
          if (k >= 1) {
            d.anim = null;
            d.rot = 0;
            d.x = d.tx;
            d.y = d.ty;
            d.sy = 0.82;
            d.sx = 1.12;
            A().clack(i);
            fx.burst(d.x, d.y + s * 0.45, 5, { color: 'rgba(255,255,255,0.5)', speed: 90, life: 0.3, gravity: 0, size: 2.5, kind: 'circle' });
          }
        }
      }
      d.sx = RM.lerp(d.sx, 1, Math.min(1, dt * 12));
      d.sy = RM.lerp(d.sy, 1, Math.min(1, dt * 12));
      const wantLift = d.held ? s * 0.16 : 0;
      d.lift = RM.lerp(d.lift, wantLift + (d.scoreLift || 0), Math.min(1, dt * 14));
      d.pop = Math.max(0, d.pop - dt * 4);
      // shadow
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(d.x, d.ty + s * 0.56, s * 0.48 * (1 - d.lift / (s * 2)), s * 0.1, 0, 0, TAU);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fill();
      ctx.restore();
      const scale = (1 + d.pop * 0.28) * (d.press ? 0.92 : 1);
      const glow = Math.max(d.glow, d.held ? 0.55 : 0);
      RM.art.die(ctx, d.x, d.y, s * scale, {
        v: d.showV != null ? d.showV : d.v,
        g: d.showV != null ? d.showG : d.g,
        wild: d.showV == null && d.wild,
        held: d.held, frozen: d.frozen, dim: d.dim, glow,
        glowColor: d.held && !d.glowColor ? '#ffd24f' : d.glowColor,
        rot: d.rot, sx: d.sx, sy: d.sy, lift: d.lift, set: d.set,
      });
      if (d.held && !d.anim) {
        // a little "held" tab under the die
        ctx.save();
        ctx.fillStyle = '#ffd24f';
        ctx.font = '900 ' + Math.round(s * 0.18) + 'px Nunito, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('HELD', d.x, d.ty + s * 0.82);
        ctx.restore();
      }
      if (d.frozen && !d.anim) {
        ctx.save();
        ctx.fillStyle = '#9ad8ff';
        ctx.font = '900 ' + Math.round(s * 0.18) + 'px Nunito, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('FROZEN', d.x, d.ty + s * 0.82);
        ctx.restore();
      }
      if (d.target) {
        ctx.save();
        ctx.strokeStyle = '#ffe39a';
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 5]);
        ctx.lineDashOffset = -B.t * 30;
        RM.art.rr(ctx, d.x - s * 0.62, d.y - d.lift - s * 0.62, s * 1.24, s * 1.32, s * 0.26);
        ctx.stroke();
        ctx.restore();
      }
    });
  }

  /* ---------------- effects the UI can trigger ---------------- */
  B.monsterCenter = function () {
    const M = B.mon;
    if (!M) return { x: B.W / 2, y: B.H * 0.3 };
    return { x: M.x, y: M.y - 95 * M.scale * (M.m.size || 1) };
  };

  B.bossIntro = function () {
    A().boss();
    fx.kick(10);
    fx.flashScreen('#3a0a2a', 0.5);
  };

  B.hurtMonster = function (frac) {
    const M = B.mon;
    if (!M) return;
    M.st.hurt = 1;
    M.st.flash = 0.9;
    M.st.squash = -0.12;
    M.knock = 26 + frac * 40;
  };

  B.killMonster = function () {
    const M = B.mon;
    if (!M) return;
    M.dying = 0.01;
    const c = B.monsterCenter();
    const p = M.m.pal;
    fx.burst(c.x, c.y, 60, { color: [p[0], p[2], '#ffffff'], speed: 420, life: 1.1, size: 6, kind: 'circle', gravity: 200 });
    fx.burst(c.x, c.y, 30, { color: ['#ffe28a', '#ffffff'], speed: 520, life: 0.8, size: 4, kind: 'star', gravity: 0 });
    fx.ring(c.x, c.y, 20, 220, '#ffffff', 0.6, 10);
    fx.kick(16);
    A().kill();
  };

  B.coinsTo = function (el, n) {
    const c = B.monsterCenter();
    const r = relRect(el);
    fx.burst(c.x, c.y, Math.min(24, 4 + n * 2), {
      kind: 'coin', color: '#ffcc3d', speed: 320, life: 1.1, size: 7, gravity: 0, drag: 1.5, tx: r.x + 18, ty: r.y + r.h / 2, home: 60,
    });
    [650, 760, 860, 950].forEach((ms) => setTimeout(() => A().gold(), ms));
  };

  B.lunge = function () {
    if (!B.mon) return;
    B.mon.lunge = 1;
    fx.kick(18);
    fx.flashScreen('#ff2040', 0.45);
  };

  B.dieAt = function (i) {
    const d = B.dice[i];
    if (!d) return null;
    return { x: d.x, y: d.y - d.lift, s: B.dieSize };
  };

  /* ---------------- the cast ----------------
     Plays the scoring of result `r` step by step, then the spell, then the
     hit. Calls ui hooks for the readout and charms on the way. */
  const COMBO_COL = {
    high: '#cfd6e6', pair: '#6fc3ff', twopair: '#6fe0ff', three: '#ffae4f', smstraight: '#5fe0c8',
    fullhouse: '#c47bff', lgstraight: '#3ff0b0', four: '#ff5a6a', threepair: '#ff9de2', grand: '#7dffea',
    twotriple: '#ff7a2f', five: '#ffd24f', six: '#ffffff',
  };

  B.playCast = async function (run, r, ui) {
    const sp = speed();
    const scoring = new Set(r.idx);
    A().cast();
    const def = RM.COMBO[r.combo];
    const big = def.rank >= 7;
    fx.banner(def.name.toUpperCase() + '!', COMBO_COL[r.combo] || '#ffe28a', B.W / 2, B.stage.y + B.stage.h * 0.62,
      Math.min(B.W / (def.name.length * 0.62 + 1), 26 + def.rank * 2.2), big ? 1.6 : 1.15);
    if (big) { fx.kick(8); fx.flashScreen(COMBO_COL[r.combo], 0.25); }
    B.dice.forEach((d, i) => {
      if (scoring.has(i)) { d.scoreLift = B.dieSize * 0.22; d.glowColor = '#ffffff'; d.glow = 0.7; }
      else d.dim = 1;
    });
    ui.readout(r, 'base');
    await wait(0.28);
    let k = 0;
    let tickN = 0;
    let multN = 0;
    for (const step of r.steps) {
      if (step.kind === 'base') continue;
      const delay = Math.max(0.085, 0.3 * Math.pow(0.9, k));
      k++;
      const src = step.src;
      let at = null;
      if (src.t === 'die' || src.t === 'glyph') {
        const d = B.dice[src.i];
        if (d) {
          d.pop = 1;
          at = { x: d.x, y: d.y - d.lift - B.dieSize * 0.75 };
          if (src.t === 'glyph' && src.g) {
            const G = RM.GLYPHS[src.g];
            fx.burst(d.x, d.y - d.lift, 12, { color: [G.color, '#ffffff'], speed: 200, life: 0.5, size: 3.5, kind: 'star', gravity: 0 });
          }
          if (src.again) fx.text(d.x, d.y - d.lift + B.dieSize * 0.1, 'Again!', { color: '#7ef0e6', size: 15, life: 0.6 });
        }
      } else if (src.t === 'charm') {
        const el = ui.charmEl(src.k);
        if (el) {
          el.classList.remove('fire');
          void el.offsetWidth;
          el.classList.add('fire');
          const rr = relRect(el);
          at = { x: rr.x + rr.w / 2, y: rr.y - 6 };
        }
        if (src.i != null && B.dice[src.i]) B.dice[src.i].pop = 0.6;
      } else {
        const ro = relRect(document.getElementById('readout'));
        at = { x: ro.x + ro.w / 2, y: ro.y - 4 };
      }
      let label = '';
      let col = '#fff';
      switch (step.kind) {
        case 'pips': label = '+' + RM.fmt(step.amt); col = '#5cb8ff'; A().tick(tickN++); break;
        case 'mult': label = '+' + RM.fmtMult(step.amt) + ' Mult'; col = '#ff6070'; A().mult(multN++); break;
        case 'xmult': label = '×' + RM.fmtMult(step.amt) + ' Mult'; col = '#ff3d85'; A().xmult(); fx.kick(4); break;
        case 'gold': label = '+$' + step.amt; col = '#ffcc3d'; A().gold(); break;
        case 'nopips': label = 'No Pips'; col = '#9a8fb0'; A().nope(); break;
        default: break;
      }
      if (at) fx.text(at.x, at.y, label, { color: col, size: step.kind === 'xmult' ? 22 : 19, life: 0.8, vy: -50 });
      ui.readout(Object.assign({}, r, { pips: step.pips, mult: step.mult }), step.kind);
      await wait(delay);
    }
    // the total
    ui.readout(r, 'total');
    if (r.notes.length) {
      const ro = relRect(document.getElementById('readout'));
      fx.text(ro.x + ro.w / 2, ro.y + ro.h + 8, r.notes.join(' · '), { color: '#ffb3c0', size: 15, life: 1.2, vy: -20, font: 'Nunito' });
    }
    fx.flashScreen('#ffffff', Math.min(0.35, 0.08 + Math.log10(Math.max(10, r.dmg)) * 0.04));
    await wait(0.34);

    // the spell: one orb per scoring die
    const target = B.monsterCenter();
    const color = COMBO_COL[r.combo] || '#ffe28a';
    const size = 8 + Math.min(16, Math.log10(Math.max(10, r.dmg)) * 2.5);
    const order = r.idx.slice();
    A().whoosh();
    await new Promise((resolve) => {
      let left = order.length;
      order.forEach((i, n) => {
        const d = B.dice[i];
        setTimeout(() => {
          fx.shot(d.x, d.y - d.lift, target.x + (Math.random() - 0.5) * 30, target.y + (Math.random() - 0.5) * 30, {
            color, size, dur: 0.38 / Math.sqrt(sp), arc: 60 + Math.random() * 60,
            onHit: (x, y) => {
              fx.burst(x, y, 10, { color: [color, '#ffffff'], speed: 260, life: 0.45, size: 3.5, gravity: 0 });
              left--;
              if (left === 0) resolve();
            },
          });
          d.scoreLift = 0;
          d.glow = 0;
        }, (n * 70) / sp);
      });
      if (!order.length) resolve();
    });

    // the hit
    const frac = Math.min(1, r.dmg / Math.max(1, run.fight ? run.fight.mon.max : 1));
    const power = Math.min(1, 0.35 + frac);
    A().impact(power);
    if (r.dmg > 0) A().squeal();
    B.hurtMonster(frac);
    if (r.outcome === 'win') {
      B.slow = 0.32;
      const over = r.overkill >= (run.fight ? run.fight.mon.max : 1) * 0.5;
      setTimeout(() => fx.banner(over ? 'OVERKILL!' : 'K.O.!', over ? '#ff5a6a' : '#ffe28a', B.W / 2, target.y - 10, over ? 40 : 48, 1.2), 120);
    }
    fx.kick(6 + 18 * power);
    fx.ring(target.x, target.y, 10, 90 + 140 * power, color, 0.5, 8);
    fx.burst(target.x, target.y, 24 + Math.round(30 * power), { color: [color, '#ffffff', '#ffe28a'], speed: 380 + 300 * power, life: 0.7, size: 4.5 });
    if (r.combo === 'five' || r.combo === 'six' || r.combo === 'four' || r.combo === 'grand' || r.combo === 'twotriple') {
      for (let j = 0; j < 4; j++) fx.bolt(target.x + (Math.random() - 0.5) * 60, 0, target.x + (Math.random() - 0.5) * 50, target.y, color, 0.35);
    }
    const dmgSize = Math.round(30 + Math.min(34, Math.log10(Math.max(10, r.dmg)) * 6));
    fx.text(target.x, target.y - 40, r.dmg > 0 ? RM.fmt(r.dmg) : 'Blocked!', { color: r.dmg > 0 ? '#ffffff' : '#9a8fb0', size: dmgSize, life: 1.2, vy: -70, stroke: '#3a0a1a' });
    ui.hp();
    B.dice.forEach((d) => { d.dim = 0; d.glowColor = null; });
    await wait(0.45);
    if (r.heal > 0) {
      A().heal();
      fx.text(target.x + 40, target.y, '+' + RM.fmt(r.heal), { color: '#5fe08a', size: 24, life: 1, vy: -40 });
      fx.burst(target.x, target.y, 14, { color: '#5fe08a', speed: 120, life: 0.8, size: 3, gravity: -60, kind: 'star' });
      await wait(0.5);
    }
    if (r.grew && r.grew.length) {
      r.grew.forEach((g) => {
        const el = ui.charmEl(g.k);
        if (!el) return;
        el.classList.remove('fire');
        void el.offsetWidth;
        el.classList.add('fire');
        const rr = relRect(el);
        fx.text(rr.x + rr.w / 2, rr.y - 4, g.what === 'level' ? 'Level up!' : 'Upgraded!', { color: '#ffe39a', size: 15, life: 0.9 });
        if (g.what === 'level') A().level();
      });
      await wait(0.4);
    }
  };

  /* ---------------- the title logo: three dice bouncing ---------------- */
  B.drawLogoDice = function (canvas) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth || 220;
    const h = canvas.clientHeight || 120;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const g = canvas.getContext('2d');
    const faces = [{ v: 6, g: 'flame' }, { v: 6, g: null }, { v: 6, g: 'prism' }];
    let start = performance.now();
    const draw = (now) => {
      if (!canvas.isConnected || canvas.offsetParent === null) { canvas._raf = requestAnimationFrame(draw); return; }
      const t = (now - start) / 1000;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      faces.forEach((f, i) => {
        const ph = t * 2.2 + i * 0.9;
        const bounce = Math.abs(Math.sin(ph)) * 16;
        const x = w / 2 + (i - 1) * 64;
        const y = h * 0.6 - bounce;
        g.beginPath();
        g.ellipse(x, h * 0.6 + 30, 24 - bounce * 0.5, 5, 0, 0, TAU);
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.fill();
        RM.art.die(g, x, y, 52, { v: f.v, g: f.g, rot: Math.sin(ph) * 0.15 * (i - 1 || 0.5), glow: 0.25 + 0.25 * Math.sin(ph * 2), glowColor: '#b38cff' });
      });
      canvas._raf = requestAnimationFrame(draw);
    };
    if (canvas._raf) cancelAnimationFrame(canvas._raf);
    canvas._raf = requestAnimationFrame(draw);
  };
})(window.RM);
