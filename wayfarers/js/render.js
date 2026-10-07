/* Wayfarers — the battle scene, all drawn in code: scrolling lands, chibi
   heroes, monsters and bosses, arrows and spells, floating damage. Also
   draws the hero portraits used by the menus. */
(function (WF) {
  'use strict';

  const D = WF.data;
  const { fmt, clamp } = WF.util;
  const TAU = Math.PI * 2;

  let W = 0;
  let H = 0;
  let dpr = 1;
  let scroll = 0;
  let shake = 0;
  const fx = []; // particles, texts, projectiles, rings
  let flash = null;

  /* ---------- Layout ---------- */

  const groundTop = () => H * 0.6;
  const laneSpan = () => H * 0.26;
  const baseScale = () => Math.min(H * 0.235 / 40, W * 0.17 / 40);

  function pos(u) {
    const depth = (u.lane + 1) / 2; // 0 far … 1 near
    return {
      x: u.x * W,
      y: groundTop() + H * 0.06 + depth * laneSpan(),
      s: baseScale() * (0.88 + depth * 0.18) * (u.boss ? 1.75 : 1),
    };
  }

  function resize(canvas) {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }

  /* ---------- Small drawing helpers ---------- */

  function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255;
    let g = (n >> 8) & 255;
    let b = n & 255;
    if (k < 0) { r *= 1 + k; g *= 1 + k; b *= 1 + k; } else { r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; }
    return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
  }

  function seeded(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // A ridge line repeated every `period` pixels, so it can scroll forever.
  const ridgeCache = new Map();
  function ridge(seed, n, rough) {
    const key = seed + ':' + n;
    let pts = ridgeCache.get(key);
    if (!pts) {
      const r = seeded(seed);
      pts = [];
      for (let i = 0; i < n; i++) pts.push(0.5 + (r() - 0.5) * rough + Math.sin((i / n) * TAU * 2) * 0.15);
      pts.push(pts[0]);
      ridgeCache.set(key, pts);
    }
    return pts;
  }

  function drawRidge(ctx, seed, color, baseY, amp, period, offset, n, rough, smooth) {
    const pts = ridge(seed, n, rough);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, H);
    const start = -((offset % period) + period) % period;
    for (let x0 = start - period; x0 < W + period; x0 += period) {
      for (let i = 0; i <= n; i++) {
        const x = x0 + (i / n) * period;
        const y = baseY - pts[i] * amp;
        if (smooth && i > 0) {
          const px = x0 + ((i - 0.5) / n) * period;
          ctx.quadraticCurveTo(px, baseY - pts[i - 1] * amp, x, y);
        } else ctx.lineTo(x, y);
      }
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
  }

  /* ---------- The land ---------- */

  function drawLand(ctx, stage, t) {
    const land = D.landOf(stage);
    const li = (D.chapterOf(stage) - 1) % D.LANDS.length;
    const loop = Math.floor((D.chapterOf(stage) - 1) / D.LANDS.length);
    const gt = groundTop();

    const sky = ctx.createLinearGradient(0, 0, 0, gt);
    sky.addColorStop(0, land.sky[0]);
    sky.addColorStop(1, land.sky[1]);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, gt + 2);

    const night = li >= 4;
    if (night) {
      const r = seeded(77 + li);
      for (let i = 0; i < 60; i++) {
        const tw = 0.5 + 0.5 * Math.sin(t * 2 + i);
        ctx.fillStyle = 'rgba(255,255,255,' + (0.25 + 0.5 * tw) * r() + ')';
        ctx.fillRect(r() * W, r() * gt * 0.8, 1.5, 1.5);
      }
    }
    // Sun, moon or a red ember sun.
    const sunX = W * 0.78;
    const sunY = gt * 0.3;
    const sunR = Math.min(W, H) * 0.07;
    const sunCol = li === 4 ? '#FF8A4C' : night ? '#F4F1E1' : li === 2 ? '#FFF2B8' : '#FFF8DA';
    const glow = ctx.createRadialGradient(sunX, sunY, sunR * 0.5, sunX, sunY, sunR * 3.2);
    glow.addColorStop(0, sunCol + 'AA');
    glow.addColorStop(1, sunCol + '00');
    ctx.fillStyle = glow;
    ctx.fillRect(sunX - sunR * 3.2, sunY - sunR * 3.2, sunR * 6.4, sunR * 6.4);
    ctx.fillStyle = sunCol;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR, 0, TAU);
    ctx.fill();

    // Clouds drift on their own as well as with the walk.
    if (li !== 4) {
      ctx.fillStyle = night ? 'rgba(160,150,220,0.18)' : 'rgba(255,255,255,0.75)';
      const r = seeded(5 + li);
      for (let i = 0; i < 5; i++) {
        const cw = W * (0.12 + r() * 0.12);
        const span = W + cw * 2;
        const cx = ((r() * span - (scroll * 0.06 + t * 6 * (0.5 + r()))) % span + span) % span - cw;
        const cy = gt * (0.12 + r() * 0.35);
        ctx.beginPath();
        ctx.ellipse(cx, cy, cw * 0.5, cw * 0.16, 0, 0, TAU);
        ctx.ellipse(cx - cw * 0.18, cy - cw * 0.08, cw * 0.22, cw * 0.15, 0, 0, TAU);
        ctx.ellipse(cx + cw * 0.12, cy - cw * 0.1, cw * 0.26, cw * 0.18, 0, 0, TAU);
        ctx.fill();
      }
    }

    const jag = li === 3 || li === 4;
    drawRidge(ctx, 11 + li, land.far, gt + 4, gt * 0.5, W * 1.3, scroll * 0.15, jag ? 9 : 7, jag ? 0.9 : 0.5, !jag);
    if (li === 3) {
      // Snow caps: the same ridge, clipped high up, in white.
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W, gt - gt * 0.32);
      ctx.clip();
      drawRidge(ctx, 11 + li, '#FFFFFF', gt + 4, gt * 0.5, W * 1.3, scroll * 0.15, 9, 0.9, false);
      ctx.restore();
    }
    drawRidge(ctx, 31 + li, land.near, gt + 4, gt * 0.24, W * 0.9, scroll * 0.4, 6, 0.6, true);

    // Trees, cacti, crystals or tombstones on the near hills.
    drawProps(ctx, li, gt, scroll * 0.4);

    // Ground and road.
    ctx.fillStyle = land.ground;
    ctx.fillRect(0, gt, W, H - gt);
    const roadTop = gt + H * 0.06;
    const roadH = laneSpan() + H * 0.04;
    ctx.fillStyle = land.dirt;
    ctx.globalAlpha = 0.55;
    rrect(ctx, -10, roadTop - H * 0.02, W + 20, roadH, 12);
    ctx.fill();
    ctx.globalAlpha = 1;
    // Pebbles and tufts that scroll with the walk.
    const r = seeded(91 + li);
    const period = W * 1.2;
    for (let i = 0; i < 26; i++) {
      const gx = r() * period;
      const gy = gt + r() * (H - gt);
      const x = ((gx - scroll) % period + period) % period - W * 0.1;
      const k = (gy - gt) / (H - gt);
      if (r() < 0.5) {
        ctx.fillStyle = shade(land.ground, -0.25);
        ctx.beginPath();
        ctx.moveTo(x, gy);
        ctx.lineTo(x + 3 + k * 3, gy - 6 - k * 6);
        ctx.lineTo(x + 6 + k * 4, gy);
        ctx.moveTo(x + 4, gy);
        ctx.lineTo(x + 8 + k * 4, gy - 5 - k * 5);
        ctx.lineTo(x + 10 + k * 5, gy);
        ctx.fill();
      } else {
        ctx.fillStyle = shade(land.dirt, -0.2);
        ctx.beginPath();
        ctx.ellipse(x, gy, 2 + k * 3, 1 + k * 1.5, 0, 0, TAU);
        ctx.fill();
      }
    }

    if (loop > 0) {
      // Each time round the lands, the world grows darker.
      ctx.fillStyle = 'rgba(30,0,40,' + Math.min(0.35, loop * 0.12) + ')';
      ctx.fillRect(0, 0, W, H);
    }
  }

  function drawProps(ctx, li, gt, off) {
    const r = seeded(200 + li);
    const period = W * 0.9;
    for (let i = 0; i < 7; i++) {
      const px = r() * period;
      const x = ((px - off) % period + period) % period - 20;
      const y = gt + 2 - r() * 6;
      const s = (0.7 + r() * 0.6) * H / 300;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(s, s);
      if (li === 0 || li === 1) {
        const dark = li === 1;
        ctx.fillStyle = dark ? '#3B2A1C' : '#6B4A2E';
        ctx.fillRect(-2, -14, 4, 14);
        ctx.fillStyle = dark ? '#1E3B28' : '#3F8F45';
        ctx.beginPath();
        if (dark) { ctx.moveTo(-11, -10); ctx.lineTo(0, -40); ctx.lineTo(11, -10); }
        else { ctx.arc(0, -22, 11, 0, TAU); ctx.arc(-7, -16, 7, 0, TAU); ctx.arc(7, -16, 7, 0, TAU); }
        ctx.fill();
      } else if (li === 2) {
        ctx.fillStyle = '#5E8C4A';
        rrect(ctx, -3, -26, 6, 26, 3); ctx.fill();
        rrect(ctx, -10, -18, 4, 10, 2); ctx.fill();
        rrect(ctx, -10, -11, 8, 4, 2); ctx.fill();
        rrect(ctx, 6, -22, 4, 10, 2); ctx.fill();
        rrect(ctx, 2, -15, 8, 4, 2); ctx.fill();
      } else if (li === 3) {
        ctx.fillStyle = '#56789A';
        ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(0, -30); ctx.lineTo(9, 0); ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath(); ctx.moveTo(-5, -14); ctx.lineTo(0, -30); ctx.lineTo(5, -14); ctx.fill();
      } else if (li === 4) {
        ctx.fillStyle = '#FF6A2B';
        ctx.globalAlpha = 0.85;
        ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(-1, -18); ctx.lineTo(3, -6); ctx.lineTo(6, -22); ctx.lineTo(8, 0); ctx.fill();
      } else {
        ctx.fillStyle = '#4B4470';
        rrect(ctx, -6, -16, 12, 16, 5); ctx.fill();
        ctx.fillStyle = '#2E2850';
        ctx.fillRect(-1, -13, 2, 8); ctx.fillRect(-3.5, -11, 7, 2);
      }
      ctx.restore();
    }
  }

  /* ---------- Heroes ---------- */

  // Draws a hero facing right with feet at (0, 0), about 40 units tall.
  function drawHeroBody(ctx, def, a, t, seed) {
    const role = def.role;
    const walk = a.walk || 0;
    const bob = walk ? Math.abs(Math.sin(walk)) * -2 : Math.sin(t * 2.2 + seed) * 0.6;
    const lunge = a.lunge ? Math.sin(Math.PI * a.lunge) : 0;

    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 11, 3.2, 0, 0, TAU);
    ctx.fill();

    ctx.save();
    ctx.translate(0, bob);

    // Legs.
    const step = walk ? Math.sin(walk) * 3 : 0;
    ctx.fillStyle = shade(def.color, -0.55);
    rrect(ctx, -5 + step, -8, 4, 8, 1.5); ctx.fill();
    rrect(ctx, 1 - step, -8, 4, 8, 1.5); ctx.fill();

    // Cape for tanks and warriors.
    if (role === 'tank' || role === 'warrior') {
      ctx.fillStyle = shade(def.color, -0.35);
      ctx.beginPath();
      ctx.moveTo(-5, -20);
      ctx.quadraticCurveTo(-12 - lunge * 3, -12, -9 - Math.sin(t * 3 + seed) * 1.5, -6);
      ctx.lineTo(-3, -8);
      ctx.fill();
    }

    // Body.
    ctx.fillStyle = def.color;
    rrect(ctx, -7, -21, 14, 14, 5);
    ctx.fill();
    ctx.fillStyle = shade(def.color, 0.25);
    rrect(ctx, -5, -20, 5, 6, 2.5);
    ctx.fill();
    ctx.fillStyle = shade(def.color, -0.45);
    ctx.fillRect(-7, -11, 14, 2.4);
    ctx.fillStyle = '#F2D06B';
    ctx.fillRect(-1.3, -11.2, 2.6, 2.8);

    // Head.
    ctx.fillStyle = def.skin;
    ctx.beginPath();
    ctx.arc(0, -28.5, 8.5, 0, TAU);
    ctx.fill();
    // Hair: a cap over the back of the head with a fringe.
    ctx.fillStyle = def.hair;
    ctx.beginPath();
    ctx.arc(-0.5, -29.5, 9, Math.PI * 0.95, Math.PI * 2.05);
    ctx.quadraticCurveTo(6, -27, 3, -31);
    ctx.quadraticCurveTo(-1, -27, -8.5, -26);
    ctx.fill();
    if (role === 'mage' || role === 'healer') {
      // A pointy hat for spellcasters.
      ctx.fillStyle = role === 'healer' ? '#3E7D46' : shade(def.color, -0.2);
      ctx.beginPath();
      ctx.moveTo(-10, -33);
      ctx.lineTo(10, -33);
      ctx.lineTo(-2 + Math.sin(t * 2 + seed), -48);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(-11, -34.5, 22, 3);
    } else if (role === 'tank') {
      ctx.fillStyle = '#B8C2D0';
      ctx.beginPath();
      ctx.arc(0, -30, 9.3, Math.PI, TAU);
      ctx.fill();
      ctx.fillStyle = '#8E99AB';
      ctx.fillRect(-1, -40, 2, 6);
    } else if (role === 'rogue') {
      ctx.fillStyle = shade(def.color, -0.2);
      ctx.beginPath();
      ctx.arc(0, -29, 9.5, Math.PI * 0.85, Math.PI * 2.15);
      ctx.fill();
      ctx.fillRect(-1, -26.5, 9, 3.5); // mask
    }
    // Eyes and cheeks.
    if (a.hit > 0.5) {
      ctx.strokeStyle = '#2A1E1E';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(1.5, -29); ctx.lineTo(4, -27);
      ctx.moveTo(4, -29); ctx.lineTo(1.5, -27);
      ctx.stroke();
    } else {
      const blink = Math.sin(t * 1.3 + seed * 3) > 0.985 ? 0.3 : 1;
      ctx.fillStyle = role === 'rogue' ? '#F7F3E8' : '#2A1E1E';
      ctx.beginPath();
      ctx.ellipse(2.5, -28, 1.3, 1.8 * blink, 0, 0, TAU);
      ctx.ellipse(6.4, -28, 1.2, 1.7 * blink, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,120,120,0.35)';
      ctx.beginPath();
      ctx.arc(1.2, -24.5, 1.7, 0, TAU);
      ctx.arc(7.2, -24.5, 1.4, 0, TAU);
      ctx.fill();
    }

    // Weapon.
    ctx.save();
    if (role === 'tank') {
      ctx.translate(6 + lunge * 4, -15);
      ctx.fillStyle = '#C7D0DC';
      ctx.beginPath();
      ctx.moveTo(-1, -8); ctx.lineTo(7, -8); ctx.lineTo(7, 1); ctx.quadraticCurveTo(3, 8, 3, 8); ctx.quadraticCurveTo(-1, 6, -1, 1);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = def.color;
      ctx.fillRect(2, -6, 2, 10);
      ctx.fillRect(-0.5, -3, 7, 2);
    } else if (role === 'warrior') {
      ctx.translate(6, -14);
      ctx.rotate(-0.9 + lunge * 2.2);
      ctx.fillStyle = '#6B4A2E';
      ctx.fillRect(-1.2, -2, 2.4, 6);
      ctx.fillStyle = '#E3C46A';
      ctx.fillRect(-4, -3, 8, 2);
      ctx.fillStyle = '#E6ECF5';
      ctx.beginPath();
      ctx.moveTo(-1.8, -3); ctx.lineTo(1.8, -3); ctx.lineTo(1.4, -20); ctx.lineTo(0, -23); ctx.lineTo(-1.4, -20);
      ctx.fill();
    } else if (role === 'rogue') {
      for (const [dx, rot] of [[6, -0.4 + lunge * 1.8], [-4, 0.3 - lunge]]) {
        ctx.save();
        ctx.translate(dx, -13);
        ctx.rotate(rot);
        ctx.fillStyle = '#3A2A1E';
        ctx.fillRect(-1, -1, 2, 4);
        ctx.fillStyle = '#DDE4EE';
        ctx.beginPath();
        ctx.moveTo(-1.3, -1); ctx.lineTo(1.3, -1); ctx.lineTo(0, -10);
        ctx.fill();
        ctx.restore();
      }
    } else if (role === 'archer') {
      ctx.translate(8, -16);
      ctx.strokeStyle = '#7A4F2A';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(-4, 0, 10, -1.15, 1.15);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 0.7;
      const pull = a.cast > 0 ? 0 : (a.draw || 0);
      ctx.beginPath();
      ctx.moveTo(-4 + 10 * Math.cos(-1.15), 10 * Math.sin(-1.15));
      ctx.lineTo(-pull * 4, 0);
      ctx.lineTo(-4 + 10 * Math.cos(1.15), 10 * Math.sin(1.15));
      ctx.stroke();
    } else {
      // Staff with a glowing orb.
      ctx.translate(8, -12);
      ctx.rotate(0.15 - (a.cast || 0) * 0.6);
      ctx.fillStyle = '#6B4A2E';
      ctx.fillRect(-1, -18, 2, 26);
      const orb = role === 'healer' ? '#8CFF9E' : def.hair === '#F7F7FF' ? '#9FD0FF' : shade(def.color, 0.35);
      const pulse = 3 + Math.sin(t * 4 + seed) * 0.5 + (a.cast || 0) * 3;
      const g = ctx.createRadialGradient(0, -20, 0, 0, -20, pulse * 2.4);
      g.addColorStop(0, '#FFFFFF');
      g.addColorStop(0.35, orb);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, -20, pulse * 2.4, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    ctx.restore();
  }

  /* ---------- Monsters ---------- */

  // Draws a monster facing left with feet at (0, 0).
  function drawFoe(ctx, def, a, t, seed, loop) {
    const c = def.color;
    const dark = shade(c, -0.35);
    const lunge = a.lunge ? Math.sin(Math.PI * a.lunge) : 0;
    const eye = loop > 0 ? '#FF4040' : '#1E1414';
    const breathe = Math.sin(t * 3 + seed);
    const walk = a.walk || 0;

    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(0, 0, def.shape === 'beast' ? 15 : 12, 3.4, 0, 0, TAU);
    ctx.fill();

    ctx.save();
    ctx.translate(-lunge * 6, 0);

    const eyes = (x, y, r) => {
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.arc(x + r * 2.6, y, r * 0.9, 0, TAU);
      ctx.fill();
      ctx.fillStyle = eye;
      ctx.beginPath();
      ctx.arc(x - r * 0.3, y + r * 0.1, r * 0.55, 0, TAU);
      ctx.arc(x + r * 2.3, y + r * 0.1, r * 0.5, 0, TAU);
      ctx.fill();
      // Angry brows.
      ctx.strokeStyle = shade(c, -0.6);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x - r, y - r * 1.4); ctx.lineTo(x + r * 0.8, y - r * 0.9);
      ctx.moveTo(x + r * 3.4, y - r * 1.4); ctx.lineTo(x + r * 1.9, y - r * 0.9);
      ctx.stroke();
    };

    let topY = -24;
    switch (def.shape) {
      case 'blob': {
        const sq = 1 + breathe * 0.06;
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.moveTo(-13 * sq, 0);
        ctx.bezierCurveTo(-14 * sq, -20 / sq, 14 * sq, -20 / sq, 13 * sq, 0);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.beginPath();
        ctx.ellipse(-4, -11 / sq, 3, 2, -0.5, 0, TAU);
        ctx.fill();
        eyes(-6, -8 / sq, 2.2);
        topY = -16 / sq;
        break;
      }
      case 'beast': {
        const st = walk ? Math.sin(walk) * 2.5 : 0;
        ctx.fillStyle = dark;
        for (const lx of [-9, -4, 4, 9]) ctx.fillRect(lx - 1.5 + (lx < 0 ? st : -st), -7, 3, 7);
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.ellipse(1, -12 + breathe * 0.5, 13, 7.5, 0, 0, TAU);
        ctx.fill();
        // Tail.
        ctx.strokeStyle = c;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(13, -13);
        ctx.quadraticCurveTo(19, -18 + Math.sin(t * 6 + seed) * 3, 17, -24);
        ctx.stroke();
        // Head.
        ctx.beginPath();
        ctx.arc(-12, -16, 6.5, 0, TAU);
        ctx.fill();
        ctx.fillStyle = shade(c, 0.2);
        ctx.beginPath();
        ctx.ellipse(-17, -14, 3.5, 2.6, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = dark;
        ctx.beginPath();
        ctx.moveTo(-12, -21); ctx.lineTo(-9, -27); ctx.lineTo(-7, -20);
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath(); ctx.moveTo(-18, -12); ctx.lineTo(-17, -9); ctx.lineTo(-16, -12); ctx.fill();
        ctx.fillStyle = eye;
        ctx.beginPath();
        ctx.arc(-14, -18, 1.4, 0, TAU);
        ctx.fill();
        topY = -26;
        break;
      }
      case 'flyer': {
        const hover = -16 + Math.sin(t * 3 + seed) * 2.5;
        const flap = Math.sin(t * 18 + seed);
        ctx.translate(0, hover);
        ctx.fillStyle = shade(c, -0.15);
        ctx.beginPath();
        ctx.moveTo(0, -3); ctx.quadraticCurveTo(8, -14 * flap - 4, 16, -8 * flap); ctx.lineTo(2, 2);
        ctx.moveTo(0, -3); ctx.quadraticCurveTo(-8, -14 * flap - 4, -14, -8 * flap); ctx.lineTo(-2, 2);
        ctx.fill();
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.ellipse(0, 0, 8, 7, 0, 0, TAU);
        ctx.fill();
        if (def.name === 'Giant Bee') {
          ctx.fillStyle = '#2A2118';
          ctx.fillRect(1, -6, 2.2, 12);
          ctx.fillRect(5, -5, 2, 10);
        }
        ctx.fillStyle = '#E8A33A';
        ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(-12, 1.5); ctx.lineTo(-8, 2.5); ctx.fill();
        eyes(-5, -2, 1.8);
        topY = -12;
        break;
      }
      case 'shroom': {
        ctx.fillStyle = '#F1E4C8';
        rrect(ctx, -6, -12, 12, 12, 4); ctx.fill();
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.ellipse(0, -13 + breathe * 0.4, 14, 9, 0, Math.PI, TAU);
        ctx.fill();
        ctx.fillStyle = '#FFF4E4';
        for (const [sx, sy, r] of [[-6, -17, 2.2], [3, -19, 2.6], [8, -14, 1.8]]) { ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU); ctx.fill(); }
        eyes(-4, -7, 1.6);
        topY = -22;
        break;
      }
      case 'ghost': {
        const hover = -6 + Math.sin(t * 2 + seed) * 2;
        ctx.translate(0, hover);
        ctx.globalAlpha *= 0.9;
        const g = ctx.createRadialGradient(0, -12, 2, 0, -12, 22);
        g.addColorStop(0, c);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(0, -12, 22, 0, TAU); ctx.fill();
        ctx.fillStyle = shade(c, 0.3);
        ctx.beginPath();
        ctx.moveTo(-10, -4);
        ctx.bezierCurveTo(-12, -30, 12, -30, 10, -4);
        for (let i = 0; i <= 4; i++) ctx.lineTo(10 - i * 5, (i % 2 ? 0 : -4) + Math.sin(t * 6 + i) * 1.5);
        ctx.fill();
        ctx.fillStyle = '#1E1430';
        ctx.beginPath();
        ctx.ellipse(-5, -15, 2, 3, 0, 0, TAU);
        ctx.ellipse(1, -15, 1.8, 2.8, 0, 0, TAU);
        ctx.ellipse(-2, -9, 2, 1.4 + Math.abs(breathe), 0, 0, TAU);
        ctx.fill();
        topY = -26;
        break;
      }
      case 'golem': {
        ctx.fillStyle = dark;
        rrect(ctx, -9, -8, 6, 8, 2); ctx.fill();
        rrect(ctx, 3, -8, 6, 8, 2); ctx.fill();
        ctx.fillStyle = c;
        rrect(ctx, -12, -28 + breathe * 0.6, 24, 22, 6); ctx.fill();
        ctx.fillStyle = shade(c, -0.2);
        rrect(ctx, -17 - lunge * 4, -24, 7, 15, 3); ctx.fill();
        rrect(ctx, 10, -24, 7, 15, 3); ctx.fill();
        if (def.name === 'Magma Golem' || def.name === 'The Infernal') {
          ctx.strokeStyle = '#FF9A3C';
          ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.moveTo(-6, -24); ctx.lineTo(-2, -16); ctx.lineTo(-6, -10); ctx.moveTo(4, -22); ctx.lineTo(7, -14); ctx.stroke();
        }
        if (def.name === 'Old Treant') {
          ctx.fillStyle = '#3F8F45';
          ctx.beginPath(); ctx.arc(-6, -30, 8, 0, TAU); ctx.arc(5, -32, 9, 0, TAU); ctx.fill();
        }
        eyes(-7, -21, 2);
        topY = -32;
        break;
      }
      default: { // imp: a little humanoid
        const st = walk ? Math.sin(walk) * 2.5 : 0;
        ctx.fillStyle = dark;
        rrect(ctx, -4 + st, -7, 3.5, 7, 1.5); ctx.fill();
        rrect(ctx, 1 - st, -7, 3.5, 7, 1.5); ctx.fill();
        ctx.fillStyle = c;
        rrect(ctx, -6, -18, 12, 12, 4); ctx.fill();
        ctx.beginPath();
        ctx.arc(0, -23 + breathe * 0.4, 7.5, 0, TAU);
        ctx.fill();
        if (def.name === 'Mummy') {
          ctx.strokeStyle = shade(c, -0.25);
          ctx.lineWidth = 1;
          for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(-7, -27 + i * 4); ctx.lineTo(7, -25 + i * 4); ctx.stroke(); }
        } else if (def.name === 'Skeleton') {
          ctx.fillStyle = '#2A2A2A';
          ctx.fillRect(-3, -15, 6, 1.2); ctx.fillRect(-3, -12, 6, 1.2);
        } else if (def.name !== 'Sand Pharaoh') {
          // Horns or pointy ears.
          ctx.fillStyle = def.name === 'Goblin' ? c : '#3A1C1A';
          ctx.beginPath();
          ctx.moveTo(-5, -28); ctx.lineTo(-9, -35); ctx.lineTo(-2, -29);
          ctx.moveTo(4, -29); ctx.lineTo(8, -36); ctx.lineTo(6, -27);
          ctx.fill();
        }
        // Club.
        ctx.save();
        ctx.translate(-6, -13);
        ctx.rotate(0.5 - lunge * 1.8);
        ctx.fillStyle = '#6B4A2E';
        ctx.fillRect(-1.2, -14, 2.4, 14);
        ctx.beginPath();
        ctx.ellipse(0, -15, 3, 4.5, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
        eyes(-5, -24, 1.8);
        topY = -32;
      }
    }

    if (def.crown) {
      ctx.fillStyle = '#FFD24A';
      ctx.strokeStyle = '#B8861B';
      ctx.lineWidth = 0.8;
      const y = topY - 1;
      ctx.save();
      if (def.shape === 'beast') ctx.translate(-12, 4);
      ctx.beginPath();
      ctx.moveTo(-6, y); ctx.lineTo(-7, y - 7); ctx.lineTo(-3.5, y - 4); ctx.lineTo(0, y - 9); ctx.lineTo(3.5, y - 4); ctx.lineTo(7, y - 7); ctx.lineTo(6, y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#FF4D6A';
      ctx.beginPath(); ctx.arc(0, y - 3, 1.3, 0, TAU); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
    return topY;
  }

  /* ---------- Units on the field ---------- */

  function drawUnit(ctx, u, t) {
    const p = pos(u);
    const a = u.anim;
    if (a.die >= 1) return;
    ctx.save();
    const hitShake = a.hit > 0 ? Math.sin(a.hit * 30) * a.hit * 2 : 0;
    ctx.translate(p.x + hitShake * (u.side === 'hero' ? -1 : 1), p.y);
    if (u.side === 'hero' && a.lunge) ctx.translate(Math.sin(Math.PI * a.lunge) * W * 0.03, 0);
    if (u.side === 'foe' && a.lunge && u.def.shape !== 'flyer' && u.def.shape !== 'ghost') ctx.translate(-Math.sin(Math.PI * a.lunge) * W * 0.03, 0);
    if (a.die > 0) {
      ctx.globalAlpha = 1 - a.die;
      ctx.translate(0, -a.die * 10);
      ctx.rotate((u.side === 'hero' ? -1 : 1) * a.die * 0.9);
    }
    ctx.scale(p.s, p.s);
    let top = -40;
    if (u.side === 'hero') drawHeroBody(ctx, u.def, a, t, u.uid);
    else top = drawFoe(ctx, u.def, a, t, u.uid, u.loop) - 4;
    if (a.hit > 0.6) {
      // A quick white flash on impact.
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255,255,255,' + (a.hit - 0.6) + ')';
      ctx.beginPath();
      ctx.ellipse(0, top / 2, 14, -top / 2 + 2, 0, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    if (u.shield > 0 && u.alive) {
      const g = ctx.createRadialGradient(0, -20, 6, 0, -20, 24);
      g.addColorStop(0, 'rgba(120,200,255,0)');
      g.addColorStop(0.8, 'rgba(120,200,255,0.18)');
      g.addColorStop(1, 'rgba(180,230,255,0.55)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, -20, 24, 0, TAU);
      ctx.fill();
    }
    if (u.stun > 0 && u.alive) {
      ctx.fillStyle = '#FFE066';
      for (let i = 0; i < 3; i++) {
        const ang = t * 5 + (i * TAU) / 3;
        star(ctx, Math.cos(ang) * 9, top - 4 + Math.sin(ang) * 2.5, 2.4);
      }
    }
    ctx.restore();

    // Bars stay crisp, so they're drawn without the unit's scale.
    if (u.alive && (u.side === 'hero' || u.hp < u.maxHp || u.boss)) {
      const bw = (u.boss ? 54 : 30) * baseScale() / 1.6;
      const by = p.y + top * p.s - 8;
      const bx = p.x - bw / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      rrect(ctx, bx - 1, by - 1, bw + 2, 6, 2);
      ctx.fill();
      const k = clamp(u.hp / u.maxHp, 0, 1);
      ctx.fillStyle = u.side === 'hero' ? (k > 0.35 ? '#5BE37A' : '#FFB038') : '#FF4D5E';
      ctx.fillRect(bx, by, bw * k, 4);
      if (u.shield > 0) {
        ctx.fillStyle = '#9FD8FF';
        ctx.fillRect(bx, by, bw * clamp(u.shield / u.maxHp, 0, 1), 1.5);
      }
      if (u.side === 'hero') {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(bx, by + 5, bw, 2.5);
        ctx.fillStyle = u.energy >= 100 ? '#FFFFFF' : '#FFD54A';
        ctx.fillRect(bx, by + 5, bw * u.energy / 100, 2.5);
      }
    }
  }

  function star(ctx, x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const rr = i % 2 ? r * 0.45 : r;
      const ang = -Math.PI / 2 + (i * Math.PI) / 5;
      ctx.lineTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr);
    }
    ctx.closePath();
    ctx.fill();
  }

  /* ---------- Effects ---------- */

  function unitCenter(u) {
    const p = pos(u);
    return { x: p.x, y: p.y - 20 * p.s, s: p.s };
  }

  function addText(x, y, text, color, size, rise) {
    fx.push({ kind: 'text', x, y, text, color, size, life: 0, max: 0.9, vy: -(rise || 40), vx: (Math.random() - 0.5) * 20 });
  }

  function burst(x, y, color, n, speed, size) {
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * TAU;
      const sp = speed * (0.4 + Math.random() * 0.8);
      fx.push({ kind: 'spark', x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - speed * 0.3, color, size: size * (0.6 + Math.random() * 0.7), life: 0, max: 0.45 + Math.random() * 0.35, g: 220 });
    }
  }

  const SHOT_COLORS = { archer: '#F4E3B5', mage: '#FF9A4C', healer: '#8CFF9E', heal: '#8CFF9E', foe: '#C77DFF', skill: '#FFFFFF' };

  function onEvent(e) {
    if (e.kind === 'dmg') {
      const c = unitCenter(e.unit);
      const s = baseScale();
      if (e.unit.side === 'foe') {
        addText(c.x, c.y - 14 * c.s, fmt(e.amount) + (e.crit ? '!' : ''), e.crit ? '#FFE066' : '#FFFFFF', (e.crit ? 17 : 12.5) * s / 1.6 + 4);
        burst(c.x, c.y, e.crit ? '#FFE066' : '#FFFFFF', e.crit ? 8 : 4, 120, 2.2);
      } else {
        addText(c.x, c.y - 14 * c.s, e.blocked ? 'block' : '-' + fmt(e.amount), e.blocked ? '#9FD8FF' : '#FF6B6B', 11 * s / 1.6 + 4);
        burst(c.x, c.y, '#FF8080', 3, 90, 2);
      }
    } else if (e.kind === 'heal') {
      const c = unitCenter(e.unit);
      addText(c.x, c.y - 14 * c.s, '+' + fmt(e.amount), '#7DFF9A', 11 * baseScale() / 1.6 + 4);
    } else if (e.kind === 'death') {
      const c = unitCenter(e.unit);
      burst(c.x, c.y, e.unit.side === 'foe' ? e.unit.def.color : '#FFFFFF', e.unit.boss ? 40 : 16, e.unit.boss ? 260 : 160, 3);
      if (e.unit.side === 'foe') {
        for (let i = 0; i < (e.unit.boss ? 14 : 4); i++) {
          fx.push({ kind: 'coin', x: c.x, y: c.y, vx: (Math.random() - 0.5) * 140, vy: -120 - Math.random() * 120, life: 0, max: 0.9 + Math.random() * 0.3, g: 420, floor: pos(e.unit).y });
        }
        if (e.unit.boss) { shake = 0.5; flash = { color: '#FFFFFF', life: 0, max: 0.35 }; }
      }
    } else if (e.kind === 'shot') {
      const a = unitCenter(e.from);
      const b = unitCenter(e.to);
      fx.push({ kind: 'shot', ax: a.x + (e.from.side === 'hero' ? 10 : -10), ay: a.y - 4, bx: b.x, by: b.y, style: e.style, life: 0, max: e.style === 'skill' ? 0.18 : 0.22, color: SHOT_COLORS[e.style] || '#FFFFFF' });
    } else if (e.kind === 'cast') {
      const c = unitCenter(e.unit);
      fx.push({ kind: 'ring', x: c.x, y: c.y, r0: 6, r1: 40 * c.s, color: '#FFE066', life: 0, max: 0.4, w: 3 });
      addText(c.x, c.y - 36 * c.s, e.skill.name, '#FFE9A8', 12 * baseScale() / 1.6 + 3, 22);
    } else if (e.kind === 'blast') {
      if (e.style === 'aoe') {
        flash = { color: e.color || '#FF8A3C', life: 0, max: 0.25 };
        shake = Math.max(shake, 0.25);
      } else if (e.style === 'stun') {
        flash = { color: '#BFD7FF', life: 0, max: 0.3 };
        for (let i = 0; i < 14; i++) {
          fx.push({ kind: 'fall', x: W * (0.55 + Math.random() * 0.42), y: -10 - Math.random() * H * 0.4, vy: H * 1.6, life: 0, max: 0.6, floor: groundTop() + H * 0.2 * Math.random() + H * 0.1 });
        }
      }
      e.targets = e.side;
      fx.push({ kind: 'blast', side: e.side, style: e.style, life: 0, max: 0.6 });
    }
  }

  // Rings and sparkles on every unit of one side, for party-wide skills.
  function blastOn(ctx, b, f) {
    const units = (f.side === 'hero' ? b.heroes : b.foes).filter((u) => u.alive || u.anim.die < 1);
    const k = f.life / f.max;
    const colors = { aoe: '#FF8A3C', stun: '#BFD7FF', heal: '#7DFF9A', shield: '#8FD3FF', rally: '#FFB347' };
    const col = colors[f.style] || '#FFFFFF';
    for (const u of units) {
      const c = unitCenter(u);
      ctx.strokeStyle = col;
      ctx.globalAlpha = 1 - k;
      ctx.lineWidth = 3 * (1 - k) + 1;
      ctx.beginPath();
      ctx.ellipse(c.x, pos(u).y, 8 + k * 26 * c.s / 1.5, (8 + k * 26 * c.s / 1.5) * 0.35, 0, 0, TAU);
      ctx.stroke();
      if (f.style === 'heal' || f.style === 'rally') {
        ctx.fillStyle = col;
        for (let i = 0; i < 4; i++) {
          const px = c.x + Math.sin(i * 2.1 + u.uid) * 12;
          const py = pos(u).y - k * 50 * c.s / 1.5 - i * 6;
          star(ctx, px, py, 2.5);
        }
      }
      if (f.style === 'aoe') {
        const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, 30 * c.s);
        g.addColorStop(0, 'rgba(255,240,200,' + (1 - k) + ')');
        g.addColorStop(0.4, 'rgba(255,140,60,' + (0.8 * (1 - k)) + ')');
        g.addColorStop(1, 'rgba(255,80,40,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(c.x, c.y, 30 * c.s * (0.5 + k), 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawFx(ctx, b, dt) {
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i];
      f.life += dt;
      if (f.life >= f.max) { fx.splice(i, 1); continue; }
      const k = f.life / f.max;
      if (f.kind === 'text') {
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        f.vy *= 0.94;
        ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
        ctx.font = '800 ' + Math.round(f.size * (k < 0.15 ? 0.7 + k * 2 : 1)) + 'px "Baloo 2", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(30,20,40,0.85)';
        ctx.strokeText(f.text, f.x, f.y);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, f.x, f.y);
        ctx.globalAlpha = 1;
      } else if (f.kind === 'spark') {
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        f.vy += f.g * dt;
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = f.color;
        ctx.fillRect(f.x - f.size / 2, f.y - f.size / 2, f.size, f.size);
        ctx.globalAlpha = 1;
      } else if (f.kind === 'coin') {
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        f.vy += f.g * dt;
        if (f.y > f.floor) { f.y = f.floor; f.vy *= -0.4; f.vx *= 0.6; }
        ctx.globalAlpha = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25;
        const w = Math.abs(Math.cos(f.life * 14)) * 4 + 1;
        ctx.fillStyle = '#FFD24A';
        ctx.beginPath();
        ctx.ellipse(f.x, f.y, w, 5, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#B8861B';
        ctx.fillRect(f.x - 0.5, f.y - 2.5, 1, 5);
        ctx.globalAlpha = 1;
      } else if (f.kind === 'shot') {
        const x = f.ax + (f.bx - f.ax) * k;
        const arc = f.style === 'archer' ? Math.sin(Math.PI * k) * -18 : 0;
        const y = f.ay + (f.by - f.ay) * k + arc;
        if (f.style === 'archer') {
          const ang = Math.atan2(f.by - f.ay + Math.cos(Math.PI * k) * -18 * Math.PI, f.bx - f.ax);
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(ang);
          ctx.strokeStyle = '#7A4F2A';
          ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(5, 0); ctx.stroke();
          ctx.fillStyle = '#DDE4EE';
          ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(4, -2.5); ctx.lineTo(4, 2.5); ctx.fill();
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(-10, -2, 3, 4);
          ctx.restore();
        } else {
          const r = f.style === 'skill' ? 7 : 5;
          const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2);
          g.addColorStop(0, '#FFFFFF');
          g.addColorStop(0.4, f.color);
          g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(x, y, r * 2.2, 0, TAU);
          ctx.fill();
          if (f.style === 'skill') {
            ctx.strokeStyle = 'rgba(255,255,255,0.6)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(f.ax + (f.bx - f.ax) * Math.max(0, k - 0.4), f.ay + (f.by - f.ay) * Math.max(0, k - 0.4));
            ctx.lineTo(x, y);
            ctx.stroke();
          }
        }
        if (f.life + dt >= f.max) burst(f.bx, f.by, f.color, 5, 100, 2);
      } else if (f.kind === 'ring') {
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = f.color;
        ctx.lineWidth = f.w * (1 - k) + 0.5;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r0 + (f.r1 - f.r0) * k, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (f.kind === 'fall') {
        f.y += f.vy * dt;
        const done = f.y >= f.floor;
        if (done) { burst(f.x, f.floor, '#FFE9A8', 6, 120, 2.5); f.life = f.max; }
        ctx.fillStyle = '#FFF3C4';
        ctx.strokeStyle = 'rgba(255,240,200,0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(f.x - 8, f.y - 30); ctx.lineTo(f.x, f.y); ctx.stroke();
        star(ctx, f.x, f.y, 5);
      } else if (f.kind === 'blast') {
        blastOn(ctx, b, f);
      }
    }
  }

  /* ---------- Frame ---------- */

  function frame(ctx, b, dt, t) {
    if (b && (b.phase === 'enter' || b.phase === 'won')) scroll += dt * W * (b.phase === 'won' ? 0.25 : 0.32);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.save();
    if (shake > 0) {
      shake = Math.max(0, shake - dt);
      ctx.translate((Math.random() - 0.5) * shake * 14, (Math.random() - 0.5) * shake * 14);
    }
    drawLand(ctx, b ? b.stage : 1, t);
    if (b) {
      const units = b.heroes.concat(b.foes).sort((p, q) => p.lane - q.lane);
      for (const u of units) drawUnit(ctx, u, t);
      drawFx(ctx, b, dt);
    }
    ctx.restore();
    if (flash) {
      flash.life += dt;
      const k = flash.life / flash.max;
      if (k >= 1) flash = null;
      else {
        ctx.globalAlpha = 0.35 * (1 - k);
        ctx.fillStyle = flash.color;
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 1;
      }
    }
  }

  function clearFx() {
    fx.length = 0;
  }

  /* ---------- Portraits for the menus ---------- */

  function portrait(canvas, id, opts) {
    const def = D.HERO[id];
    const size = canvas.clientWidth || 64;
    const r = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(size * r);
    canvas.height = Math.round(size * r);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(r, 0, 0, r, 0, 0);
    ctx.clearRect(0, 0, size, size);
    const rar = D.RARITY[def.rarity];
    const g = ctx.createRadialGradient(size / 2, size * 0.45, 2, size / 2, size / 2, size * 0.7);
    g.addColorStop(0, shade(rar.color, 0.35));
    g.addColorStop(1, shade(rar.color, -0.45));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    ctx.save();
    const s = size / 52;
    ctx.translate(size * 0.47, size * 0.95);
    ctx.scale(s, s);
    if (opts && opts.locked) ctx.globalAlpha = 0.25;
    drawHeroBody(ctx, def, { walk: 0, lunge: 0, hit: 0, cast: 0 }, 0, 1);
    ctx.restore();
  }

  WF.render = { resize, frame, onEvent, clearFx, portrait, get size() { return { W, H }; } };
})(window.WF = window.WF || {});
