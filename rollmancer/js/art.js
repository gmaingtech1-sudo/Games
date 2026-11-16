/* Rollmancer — everything drawn: dice, glyph symbols, the monsters, the
   dungeon backdrops. All of it is canvas paths and gradients; there are
   no image files apart from the app icons. Monsters are drawn in a
   200 × 200 box centred on (0, 0), feet at y = 90. */
(function (RM) {
  'use strict';

  const TAU = Math.PI * 2;
  const art = {};

  /* ---------------- colour helpers ---------------- */
  function hexToRgb(h) {
    h = h.replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mix(a, b, k) {
    const x = hexToRgb(a);
    const y = hexToRgb(b);
    const r = x.map((v, i) => Math.round(v + (y[i] - v) * k));
    return '#' + r.map((v) => v.toString(16).padStart(2, '0')).join('');
  }
  function rgba(h, a) {
    const c = hexToRgb(h);
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  }
  art.mix = mix;
  art.rgba = rgba;

  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  art.rr = rr;

  /* ---------------- glyph symbols ---------------- */
  function flamePath(ctx, s) {
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.bezierCurveTo(s * 0.55, -s * 0.35, s * 0.75, s * 0.1, s * 0.55, s * 0.55);
    ctx.bezierCurveTo(s * 0.4, s * 0.95, -s * 0.4, s * 0.95, -s * 0.55, s * 0.55);
    ctx.bezierCurveTo(-s * 0.75, s * 0.15, -s * 0.35, -s * 0.15, -s * 0.12, -s * 0.45);
    ctx.bezierCurveTo(-s * 0.05, -s * 0.2, s * 0.1, -s * 0.55, 0, -s);
    ctx.closePath();
  }
  function star(ctx, n, r1, r2, rot) {
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const r = i % 2 ? r2 : r1;
      const a = rot + (i * Math.PI) / n;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
  }
  art.star = star;

  // A glyph symbol centred on (x, y), radius s.
  art.glyph = function (ctx, g, x, y, s, alpha) {
    const G = RM.GLYPHS[g];
    if (!G) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.fillStyle = G.color;
    ctx.strokeStyle = G.dark;
    ctx.lineWidth = Math.max(1, s * 0.16);
    ctx.lineJoin = 'round';
    switch (g) {
      case 'flame':
        flamePath(ctx, s);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#ffe08a';
        ctx.save();
        ctx.translate(0, s * 0.3);
        flamePath(ctx, s * 0.45);
        ctx.fill();
        ctx.restore();
        break;
      case 'storm':
        ctx.beginPath();
        ctx.moveTo(s * 0.25, -s);
        ctx.lineTo(-s * 0.55, s * 0.12);
        ctx.lineTo(-s * 0.02, s * 0.12);
        ctx.lineTo(-s * 0.3, s);
        ctx.lineTo(s * 0.6, -s * 0.2);
        ctx.lineTo(s * 0.06, -s * 0.2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
      case 'prism':
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.lineTo(s * 0.8, -s * 0.2);
        ctx.lineTo(0, s);
        ctx.lineTo(-s * 0.8, -s * 0.2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.lineTo(s * 0.8, -s * 0.2);
        ctx.lineTo(0, -s * 0.05);
        ctx.lineTo(-s * 0.8, -s * 0.2);
        ctx.closePath();
        ctx.fill();
        break;
      case 'gold':
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.85, 0, TAU);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = G.dark;
        ctx.font = '900 ' + Math.round(s * 1.15) + 'px Nunito, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('$', 0, s * 0.06);
        break;
      case 'lucky':
        for (let i = 0; i < 4; i++) {
          ctx.save();
          ctx.rotate((i * TAU) / 4 + Math.PI / 4);
          ctx.beginPath();
          ctx.ellipse(0, -s * 0.45, s * 0.36, s * 0.48, 0, 0, TAU);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.18, 0, TAU);
        ctx.fillStyle = G.dark;
        ctx.fill();
        break;
      case 'wild':
        star(ctx, 5, s, s * 0.45, -Math.PI / 2);
        ctx.fill();
        ctx.stroke();
        break;
      case 'echo':
        ctx.lineWidth = Math.max(1.5, s * 0.22);
        ctx.strokeStyle = G.color;
        for (let i = 0; i < 3; i++) {
          ctx.globalAlpha = (alpha == null ? 1 : alpha) * (1 - i * 0.28);
          ctx.beginPath();
          ctx.arc(-s * 0.35, 0, s * (0.35 + i * 0.32), -0.9, 0.9);
          ctx.stroke();
        }
        ctx.globalAlpha = alpha == null ? 1 : alpha;
        ctx.beginPath();
        ctx.arc(-s * 0.35, 0, s * 0.18, 0, TAU);
        ctx.fill();
        break;
      case 'loaded':
        ctx.beginPath();
        ctx.moveTo(-s * 0.35, -s * 0.45);
        ctx.lineTo(s * 0.35, -s * 0.45);
        ctx.lineTo(s * 0.8, s * 0.8);
        ctx.lineTo(-s * 0.8, s * 0.8);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, -s * 0.62, s * 0.24, 0, TAU);
        ctx.stroke();
        break;
      default: break;
    }
    ctx.restore();
  };

  /* ---------------- dice ---------------- */
  const PIPS = {
    1: [[0, 0]],
    2: [[-1, -1], [1, 1]],
    3: [[-1, -1], [0, 0], [1, 1]],
    4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
    5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
    6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
    7: [[-1, -1], [1, -1], [-1, 0], [0, 0], [1, 0], [-1, 1], [1, 1]],
    8: [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]],
    9: [[-1, -1], [0, -1], [1, -1], [-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1], [1, 1]],
  };

  function setColors(setId) {
    const s = RM.DICE_SET[setId] || RM.DICE_SET.apprentice;
    return { body: s.color, pip: s.pip };
  }
  art.setColors = setColors;

  /* Draws a die centred on (x, y), `size` px across.
     o: { v, g, held, frozen, dim, glow (0..1), rot, sx, sy, lift, set, wild, asleep } */
  art.die = function (ctx, x, y, size, o) {
    const cols = setColors(o.set);
    const G = o.g ? RM.GLYPHS[o.g] : null;
    const s = size;
    const r = s * 0.2;
    const depth = s * 0.09;
    ctx.save();
    ctx.translate(x, y - (o.lift || 0));
    if (o.rot) ctx.rotate(o.rot);
    ctx.scale(o.sx || 1, o.sy || 1);
    // glow
    if (o.glow > 0) {
      ctx.save();
      ctx.shadowColor = o.glowColor || (G ? G.color : '#ffe28a');
      ctx.shadowBlur = s * 0.45 * o.glow;
      ctx.fillStyle = o.glowColor || (G ? G.color : '#ffe28a');
      ctx.globalAlpha = 0.9 * o.glow;
      rr(ctx, -s / 2 - 2, -s / 2 - 2, s + 4, s + 4 + depth, r * 1.1);
      ctx.fill();
      ctx.restore();
    }
    // body: a darker base for thickness, then the face
    const body = G ? mix(cols.body, G.color, 0.3) : cols.body;
    ctx.fillStyle = mix(body, '#000000', 0.42);
    rr(ctx, -s / 2, -s / 2 + depth, s, s, r);
    ctx.fill();
    const grad = ctx.createLinearGradient(0, -s / 2, 0, s / 2);
    grad.addColorStop(0, mix(body, '#ffffff', G ? 0.35 : 0.55));
    grad.addColorStop(0.5, body);
    grad.addColorStop(1, mix(body, '#000000', 0.12));
    ctx.fillStyle = grad;
    rr(ctx, -s / 2, -s / 2, s, s, r);
    ctx.fill();
    // rim
    ctx.lineWidth = Math.max(1, s * 0.035);
    ctx.strokeStyle = G ? G.dark : 'rgba(60,40,70,0.55)';
    ctx.stroke();
    // top sheen
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    rr(ctx, -s / 2 + s * 0.08, -s / 2 + s * 0.06, s - s * 0.16, s * 0.2, r * 0.6);
    ctx.fill();

    // glyph watermark behind the pips
    if (G) art.glyph(ctx, o.g, s * 0.29, -s * 0.29, s * 0.15, 0.95);

    // pips
    const v = o.v;
    const layout = PIPS[Math.max(1, Math.min(9, v))] || PIPS[1];
    const spread = v >= 8 ? s * 0.27 : s * 0.26;
    const pr = v >= 7 ? s * 0.075 : v === 1 ? s * 0.12 : s * 0.088;
    const pipCol = G ? G.dark : cols.pip;
    if (o.g === 'wild' || o.wild) {
      // A wild face shows a big star and its number.
      art.glyph(ctx, 'wild', 0, s * 0.02, s * 0.3, 1);
      ctx.fillStyle = '#fff';
      ctx.font = '900 ' + Math.round(s * 0.24) + 'px Nunito, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(v, 0, s * 0.05);
    } else {
      layout.forEach(([px, py]) => {
        ctx.beginPath();
        ctx.arc(px * spread, py * spread + s * 0.02, pr, 0, TAU);
        ctx.fillStyle = pipCol;
        ctx.fill();
        // inner shine on each pip
        ctx.beginPath();
        ctx.arc(px * spread - pr * 0.3, py * spread + s * 0.02 - pr * 0.3, pr * 0.32, 0, TAU);
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        ctx.fill();
      });
    }
    if (o.frozen) {
      ctx.fillStyle = 'rgba(160,220,255,0.45)';
      rr(ctx, -s / 2, -s / 2, s, s + depth, r);
      ctx.fill();
      ctx.strokeStyle = 'rgba(230,250,255,0.9)';
      ctx.lineWidth = Math.max(1, s * 0.03);
      ctx.beginPath();
      ctx.moveTo(-s * 0.3, -s * 0.42); ctx.lineTo(-s * 0.1, -s * 0.1); ctx.lineTo(-s * 0.25, s * 0.2);
      ctx.moveTo(s * 0.35, -s * 0.2); ctx.lineTo(s * 0.12, s * 0.05); ctx.lineTo(s * 0.3, s * 0.38);
      ctx.stroke();
    }
    if (o.dim) {
      ctx.fillStyle = 'rgba(10,6,20,' + 0.5 * o.dim + ')';
      rr(ctx, -s / 2, -s / 2, s, s + depth, r);
      ctx.fill();
    }
    ctx.restore();
  };

  /* ---------------- monster parts ---------------- */
  function outline(ctx, col, w) {
    ctx.lineWidth = w;
    ctx.strokeStyle = col;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
  }
  function bodyGrad(ctx, pal, x, y, r) {
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.45, r * 0.1, x, y, r * 1.15);
    g.addColorStop(0, mix(pal[0], '#ffffff', 0.35));
    g.addColorStop(0.55, pal[0]);
    g.addColorStop(1, pal[1]);
    return g;
  }
  // An eye: white, iris, pupil looking at (lx, ly) ∈ [-1, 1], blink 0..1 shut.
  function eye(ctx, x, y, r, st, o) {
    o = o || {};
    const shut = st.blink || 0;
    ctx.save();
    ctx.translate(x, y);
    if (shut > 0.85) {
      ctx.beginPath();
      ctx.moveTo(-r, 0);
      ctx.quadraticCurveTo(0, r * 0.5, r, 0);
      outline(ctx, o.line || '#1b1020', Math.max(2, r * 0.22));
      ctx.restore();
      return;
    }
    ctx.scale(1, 1 - shut * 0.9);
    ctx.beginPath();
    ctx.ellipse(0, 0, r, r * (o.tall || 1.05), 0, 0, TAU);
    ctx.fillStyle = o.white || '#ffffff';
    ctx.fill();
    outline(ctx, o.line || '#1b1020', Math.max(1.5, r * 0.16));
    const lx = (st.lx || 0) * r * 0.32;
    const ly = (st.ly || 0) * r * 0.28 + r * 0.08;
    ctx.beginPath();
    ctx.arc(lx, ly, r * (o.iris || 0.62), 0, TAU);
    ctx.fillStyle = o.irisCol || '#2a1a3a';
    ctx.fill();
    if (o.slit) {
      ctx.beginPath();
      ctx.ellipse(lx, ly, r * 0.14, r * 0.5, 0, 0, TAU);
      ctx.fillStyle = '#120712';
      ctx.fill();
    } else if (o.irisCol) {
      ctx.beginPath();
      ctx.arc(lx, ly, r * 0.3, 0, TAU);
      ctx.fillStyle = '#120712';
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(lx - r * 0.22, ly - r * 0.24, r * 0.2, 0, TAU);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fill();
    ctx.restore();
  }
  function glowEye(ctx, x, y, r, col, st) {
    const shut = st.blink || 0;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, 1 - shut * 0.85);
    ctx.shadowColor = col;
    ctx.shadowBlur = r * 2.2;
    ctx.beginPath();
    ctx.arc((st.lx || 0) * r * 0.3, (st.ly || 0) * r * 0.25, r, 0, TAU);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc((st.lx || 0) * r * 0.3 - r * 0.3, (st.ly || 0) * r * 0.25 - r * 0.3, r * 0.35, 0, TAU);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fill();
    ctx.restore();
  }
  function crown(ctx, x, y, w, col) {
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.moveTo(-w / 2, 0);
    ctx.lineTo(-w / 2, -w * 0.42);
    ctx.lineTo(-w * 0.25, -w * 0.18);
    ctx.lineTo(0, -w * 0.55);
    ctx.lineTo(w * 0.25, -w * 0.18);
    ctx.lineTo(w / 2, -w * 0.42);
    ctx.lineTo(w / 2, 0);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, -w * 0.55, 0, 0);
    g.addColorStop(0, '#fff1a8');
    g.addColorStop(1, col || '#e0a21c');
    ctx.fillStyle = g;
    ctx.fill();
    outline(ctx, '#6b3f05', w * 0.06);
    [[-w / 2, -w * 0.42], [0, -w * 0.55], [w / 2, -w * 0.42]].forEach(([gx, gy]) => {
      ctx.beginPath();
      ctx.arc(gx, gy, w * 0.07, 0, TAU);
      ctx.fillStyle = '#ff4f6d';
      ctx.fill();
    });
    ctx.fillStyle = '#5be0ff';
    ctx.beginPath();
    ctx.arc(0, -w * 0.12, w * 0.08, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  function horns(ctx, x, y, w, col, line) {
    [-1, 1].forEach((sx) => {
      ctx.beginPath();
      ctx.moveTo(x + sx * w * 0.32, y);
      ctx.quadraticCurveTo(x + sx * w * 0.75, y - w * 0.1, x + sx * w * 0.62, y - w * 0.62);
      ctx.quadraticCurveTo(x + sx * w * 0.48, y - w * 0.2, x + sx * w * 0.08, y - w * 0.02);
      ctx.closePath();
      ctx.fillStyle = col || '#f1e6cf';
      ctx.fill();
      outline(ctx, line || '#3a2a1a', 3);
    });
  }
  function shadow(ctx, w, alpha, y) {
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, y == null ? 92 : y, w, w * 0.16, 0, 0, TAU);
    ctx.fillStyle = 'rgba(0,0,0,' + (alpha == null ? 0.35 : alpha) + ')';
    ctx.fill();
    ctx.restore();
  }
  function teeth(ctx, x0, x1, y, h, n, down, col) {
    const w = (x1 - x0) / n;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = x0 + i * w;
      ctx.moveTo(a, y);
      ctx.lineTo(a + w / 2, y + (down ? h : -h));
      ctx.lineTo(a + w, y);
    }
    ctx.fillStyle = col || '#fffaf0';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(40,20,20,0.6)';
    ctx.stroke();
  }

  /* ---------------- the monsters ---------------- */
  const BODY = {};

  BODY.slime = function (ctx, m, t, st) {
    const p = m.pal;
    const wob = Math.sin(t * 3.2) * 0.05 + (st.squash || 0);
    const w = 1 + wob;
    const h = 1 - wob * 0.9;
    shadow(ctx, 88 * w);
    ctx.save();
    ctx.translate(0, 90);
    ctx.scale(w, h);
    ctx.translate(0, -90);
    ctx.beginPath();
    ctx.moveTo(-86, 88);
    ctx.bezierCurveTo(-98, 20, -62, -68, 0, -72);
    ctx.bezierCurveTo(62, -68, 98, 20, 86, 88);
    ctx.quadraticCurveTo(0, 98, -86, 88);
    ctx.closePath();
    ctx.fillStyle = bodyGrad(ctx, p, 0, 10, 95);
    ctx.globalAlpha = 0.96;
    ctx.fill();
    ctx.globalAlpha = 1;
    outline(ctx, p[1], 5);
    // drips
    ctx.fillStyle = p[0];
    [[-52, 86, 9], [18, 90, 7], [60, 84, 6]].forEach(([dx, dy, r]) => {
      ctx.beginPath();
      ctx.ellipse(dx, dy + Math.sin(t * 2 + dx) * 2, r, r * 1.3, 0, 0, TAU);
      ctx.fill();
    });
    // shine
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.ellipse(-42, -32, 16, 24, -0.5, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-22, -52, 6, 0, TAU);
    ctx.fill();
    // bubbles inside
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    [[38, 40, 8], [-30, 55, 5], [55, 0, 5]].forEach(([bx, by, br], i) => {
      ctx.beginPath();
      ctx.arc(bx, by - ((t * 12 + i * 30) % 40), br, 0, TAU);
      ctx.stroke();
    });
    const big = m.key === 'oddmaw' || m.key === 'glutton';
    eye(ctx, -30, big ? -22 : -8, big ? 15 : 17, st, { line: p[3] });
    eye(ctx, 30, big ? -22 : -8, big ? 15 : 17, st, { line: p[3] });
    if (big) {
      const open = 18 + Math.sin(t * 2.4) * 6 + (st.hurt || 0) * 10;
      ctx.beginPath();
      ctx.ellipse(0, 30, 44, open, 0, 0, TAU);
      ctx.fillStyle = '#2a0a1a';
      ctx.fill();
      outline(ctx, p[3], 4);
      teeth(ctx, -40, 40, 30 - open + 4, 12, 7, true);
      teeth(ctx, -36, 36, 30 + open - 4, 10, 6, false);
      ctx.beginPath();
      ctx.ellipse(0, 30 + open * 0.55, 20, 8, 0, 0, TAU);
      ctx.fillStyle = '#ff6f8f';
      ctx.fill();
    } else {
      ctx.beginPath();
      if (st.hurt > 0.2) ctx.ellipse(0, 24, 10, 12, 0, 0, TAU);
      else ctx.arc(0, 16, 14, 0.2, Math.PI - 0.2);
      outline(ctx, p[3], 4);
      if (st.hurt > 0.2) { ctx.fillStyle = p[3]; ctx.fill(); }
      // blush
      ctx.fillStyle = 'rgba(255,120,140,0.35)';
      ctx.beginPath(); ctx.ellipse(-50, 14, 10, 6, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(50, 14, 10, 6, 0, 0, TAU); ctx.fill();
    }
    if (m.horns) horns(ctx, 0, -62, 70, p[2], p[1]);
    ctx.restore();
    if (m.crown) crown(ctx, 0, -66 * h + 4, 58, null);
  };

  BODY.bat = function (ctx, m, t, st) {
    const p = m.pal;
    const flap = Math.sin(t * 9);
    const bob = Math.sin(t * 4.5) * 8;
    shadow(ctx, 50, 0.22);
    ctx.save();
    ctx.translate(0, -10 + bob);
    [-1, 1].forEach((sx) => {
      ctx.save();
      ctx.scale(sx, 1);
      ctx.rotate(-0.15 + flap * 0.35);
      ctx.beginPath();
      ctx.moveTo(20, -10);
      ctx.quadraticCurveTo(70, -70, 118, -36);
      ctx.quadraticCurveTo(104, -14, 110, 8);
      ctx.quadraticCurveTo(92, -2, 84, 18);
      ctx.quadraticCurveTo(68, 2, 56, 24);
      ctx.quadraticCurveTo(44, 8, 24, 22);
      ctx.closePath();
      ctx.fillStyle = mix(p[1], p[0], 0.4);
      ctx.fill();
      outline(ctx, p[1], 4);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(26, -6); ctx.lineTo(110, 6);
      ctx.moveTo(26, -6); ctx.lineTo(84, 16);
      ctx.moveTo(26, -6); ctx.lineTo(56, 22);
      ctx.stroke();
      ctx.restore();
    });
    // ears
    [-1, 1].forEach((sx) => {
      ctx.beginPath();
      ctx.moveTo(sx * 14, -36);
      ctx.lineTo(sx * 34, -76);
      ctx.lineTo(sx * 40, -28);
      ctx.closePath();
      ctx.fillStyle = p[0];
      ctx.fill();
      outline(ctx, p[1], 4);
      ctx.beginPath();
      ctx.moveTo(sx * 22, -38);
      ctx.lineTo(sx * 33, -64);
      ctx.lineTo(sx * 35, -36);
      ctx.fillStyle = '#ff9fb8';
      ctx.fill();
    });
    ctx.beginPath();
    ctx.arc(0, 0, 46, 0, TAU);
    ctx.fillStyle = bodyGrad(ctx, p, 0, 0, 46);
    ctx.fill();
    outline(ctx, p[1], 5);
    // belly fluff
    ctx.beginPath();
    ctx.ellipse(0, 18, 26, 22, 0, 0, TAU);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fill();
    eye(ctx, -17, -8, 14, st, { irisCol: p[2], iris: 0.7, line: p[1] });
    eye(ctx, 17, -8, 14, st, { irisCol: p[2], iris: 0.7, line: p[1] });
    ctx.beginPath();
    ctx.arc(0, 12, 12, 0.15, Math.PI - 0.15);
    outline(ctx, p[1], 3.5);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(-8, 20); ctx.lineTo(-4, 31); ctx.lineTo(-1, 21); ctx.fill();
    ctx.beginPath(); ctx.moveTo(8, 20); ctx.lineTo(4, 31); ctx.lineTo(1, 21); ctx.fill();
    // feet
    ctx.strokeStyle = p[1];
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-12, 44); ctx.lineTo(-14, 56); ctx.moveTo(12, 44); ctx.lineTo(14, 56); ctx.stroke();
    ctx.restore();
  };

  BODY.shroom = function (ctx, m, t, st) {
    const p = m.pal;
    const sway = Math.sin(t * 2) * 0.05;
    shadow(ctx, 62);
    ctx.save();
    ctx.translate(0, 90);
    ctx.rotate(sway * 0.3);
    ctx.scale(1 + (st.squash || 0), 1 - (st.squash || 0));
    ctx.translate(0, -90);
    // stem
    ctx.beginPath();
    ctx.moveTo(-40, 88);
    ctx.quadraticCurveTo(-50, 20, -36, -10);
    ctx.lineTo(36, -10);
    ctx.quadraticCurveTo(50, 20, 40, 88);
    ctx.quadraticCurveTo(0, 96, -40, 88);
    const sg = ctx.createLinearGradient(-40, 0, 40, 0);
    sg.addColorStop(0, mix(p[2], '#000000', 0.15));
    sg.addColorStop(0.4, p[2]);
    sg.addColorStop(1, mix(p[2], '#000000', 0.25));
    ctx.fillStyle = sg;
    ctx.fill();
    outline(ctx, p[3], 4);
    eye(ctx, -16, 28, 11, st, { line: p[3] });
    eye(ctx, 16, 28, 11, st, { line: p[3] });
    ctx.beginPath();
    if (st.hurt > 0.2) ctx.ellipse(0, 56, 7, 9, 0, 0, TAU);
    else ctx.arc(0, 48, 9, 0.2, Math.PI - 0.2);
    outline(ctx, p[3], 3.5);
    // cap
    ctx.save();
    ctx.translate(0, -12);
    ctx.rotate(sway);
    ctx.beginPath();
    ctx.moveTo(-96, 6);
    ctx.bezierCurveTo(-100, -70, -40, -96, 0, -96);
    ctx.bezierCurveTo(40, -96, 100, -70, 96, 6);
    ctx.quadraticCurveTo(0, 26, -96, 6);
    ctx.closePath();
    ctx.fillStyle = bodyGrad(ctx, p, -10, -50, 100);
    ctx.fill();
    outline(ctx, p[1], 5);
    if (m.spikes) {
      for (let i = 0; i < 7; i++) {
        const a = Math.PI + 0.25 + (i / 6) * (Math.PI - 0.5);
        const cx = Math.cos(a) * 92;
        const cy = Math.sin(a) * 88 - 10;
        ctx.beginPath();
        ctx.moveTo(cx - 7, cy + 6);
        ctx.lineTo(cx + Math.cos(a) * 18, cy + Math.sin(a) * 18);
        ctx.lineTo(cx + 7, cy + 6);
        ctx.fillStyle = p[1];
        ctx.fill();
      }
    }
    ctx.fillStyle = p[2];
    [[-52, -40, 14], [-8, -68, 12], [40, -46, 16], [70, -14, 9], [-78, -10, 8], [8, -30, 9]].forEach(([sx, sy, r]) => {
      ctx.beginPath();
      ctx.ellipse(sx, sy, r, r * 0.85, 0, 0, TAU);
      ctx.fill();
    });
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.ellipse(-46, -66, 20, 9, -0.5, 0, TAU);
    ctx.fill();
    ctx.restore();
    ctx.restore();
  };

  BODY.skull = function (ctx, m, t, st) {
    const p = m.pal;
    const bob = Math.sin(t * 2.2) * 7;
    const jaw = Math.max(0, Math.sin(t * 5)) * 6 + (st.hurt || 0) * 12;
    shadow(ctx, 56, 0.25);
    ctx.save();
    ctx.translate(0, -12 + bob);
    ctx.rotate(Math.sin(t * 1.3) * 0.06);
    if (m.horns) horns(ctx, 0, -50, 120, '#3a2a2a', '#120a0a');
    // jaw
    ctx.save();
    ctx.translate(0, jaw);
    ctx.beginPath();
    ctx.moveTo(-46, 34);
    ctx.lineTo(-40, 66);
    ctx.quadraticCurveTo(0, 82, 40, 66);
    ctx.lineTo(46, 34);
    ctx.closePath();
    ctx.fillStyle = mix(p[0], p[1], 0.25);
    ctx.fill();
    outline(ctx, p[1], 4);
    teeth(ctx, -34, 34, 38, 10, 6, true, '#fffaf0');
    ctx.restore();
    // cranium
    ctx.beginPath();
    ctx.moveTo(-70, 0);
    ctx.bezierCurveTo(-76, -82, 76, -82, 70, 0);
    ctx.bezierCurveTo(68, 28, 52, 30, 48, 44);
    ctx.lineTo(-48, 44);
    ctx.bezierCurveTo(-52, 30, -68, 28, -70, 0);
    ctx.closePath();
    ctx.fillStyle = bodyGrad(ctx, p, -10, -30, 90);
    ctx.fill();
    outline(ctx, p[1], 5);
    teeth(ctx, -36, 36, 44, 10, 6, false, '#fffaf0');
    // sockets
    [-1, 1].forEach((sx) => {
      ctx.beginPath();
      ctx.ellipse(sx * 28, -4, 20, 22, sx * 0.2, 0, TAU);
      ctx.fillStyle = '#140c14';
      ctx.fill();
      glowEye(ctx, sx * 28, -2, 7, p[2], st);
    });
    ctx.beginPath();
    ctx.moveTo(0, 14);
    ctx.lineTo(-8, 28);
    ctx.lineTo(8, 28);
    ctx.closePath();
    ctx.fillStyle = '#140c14';
    ctx.fill();
    // cracks
    ctx.strokeStyle = p[1];
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(30, -56); ctx.lineTo(22, -40); ctx.lineTo(30, -32);
    ctx.stroke();
    if (m.key === 'lich') {
      // frost
      ctx.fillStyle = 'rgba(200,240,255,0.7)';
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        const x = -50 + i * 20;
        ctx.moveTo(x - 6, 44);
        ctx.lineTo(x, 60 + (i % 2) * 8);
        ctx.lineTo(x + 6, 44);
        ctx.fill();
      }
    }
    if (m.crown) crown(ctx, 0, -58, 60, m.key === 'lich' ? '#8fd8ff' : null);
    ctx.restore();
  };

  function ghostShape(ctx, m, t, st, x, y, sc, flip) {
    const p = m.pal;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(sc * (flip ? -1 : 1), sc);
    ctx.beginPath();
    ctx.moveTo(-62, 10);
    ctx.bezierCurveTo(-66, -90, 66, -90, 62, 10);
    const n = 5;
    for (let i = 0; i <= n; i++) {
      const xx = 62 - (i * 124) / n;
      const yy = 70 + Math.sin(t * 4 + i * 1.3) * 9 + (i % 2 ? 12 : 0);
      ctx.lineTo(xx, yy);
    }
    ctx.closePath();
    const g = ctx.createLinearGradient(0, -80, 0, 80);
    g.addColorStop(0, mix(p[0], '#ffffff', 0.4));
    g.addColorStop(0.7, p[0]);
    g.addColorStop(1, rgba(p[0], 0.1));
    ctx.fillStyle = g;
    ctx.globalAlpha = 0.9;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath();
    ctx.ellipse(-30, -40, 14, 22, -0.4, 0, TAU);
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.moveTo(-62, 10);
    ctx.bezierCurveTo(-66, -90, 66, -90, 62, 10);
    outline(ctx, p[1], 4);
    // arms
    ctx.beginPath();
    ctx.moveTo(-60, 0);
    ctx.quadraticCurveTo(-90, 10 + Math.sin(t * 3) * 10, -80, 34);
    ctx.moveTo(60, 0);
    ctx.quadraticCurveTo(90, 10 + Math.cos(t * 3) * 10, 80, 34);
    outline(ctx, rgba(p[0], 0.9), 12);
    // face
    [-1, 1].forEach((sx) => {
      ctx.beginPath();
      ctx.ellipse(sx * 22 + (st.lx || 0) * 4, -18 + (st.blink > 0.8 ? 4 : 0), 10, st.blink > 0.8 ? 2 : 15, 0, 0, TAU);
      ctx.fillStyle = p[3];
      ctx.fill();
      ctx.beginPath();
      ctx.arc(sx * 22 - 3, -24, 3.5, 0, TAU);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fill();
    });
    ctx.beginPath();
    ctx.ellipse(0, 18, 11, 9 + Math.sin(t * 3) * 3 + (st.hurt || 0) * 6, 0, 0, TAU);
    ctx.fillStyle = p[3];
    ctx.fill();
    if (m.key === 'siren') {
      // flowing hair
      ctx.strokeStyle = mix(p[0], p[1], 0.5);
      ctx.lineWidth = 6;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 18, -64);
        ctx.quadraticCurveTo(i * 30 + Math.sin(t * 2 + i) * 10, -30, i * 40, 0 + Math.cos(t * 2 + i) * 6);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  BODY.ghost = function (ctx, m, t, st) {
    const bob = Math.sin(t * 2) * 10;
    shadow(ctx, 50, 0.18);
    if (m.twin) {
      ghostShape(ctx, m, t, st, -52, -16 + bob, 0.72, false);
      ghostShape(ctx, m, t + 1.7, st, 52, -16 - bob, 0.72, true);
    } else {
      ghostShape(ctx, m, t, st, 0, -16 + bob, 1, false);
    }
    if (m.crown) crown(ctx, 0, -86 + bob, 52, null);
  };

  BODY.spider = function (ctx, m, t, st) {
    const p = m.pal;
    const bob = Math.sin(t * 3) * 4;
    shadow(ctx, 96);
    ctx.save();
    ctx.translate(0, bob);
    // thread
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -300);
    ctx.lineTo(0, -60);
    ctx.stroke();
    // legs
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 4; i++) {
        const ph = t * 6 + i * 1.4 + (side > 0 ? 0.7 : 0);
        const baseA = -0.5 + i * 0.38;
        const kx = side * (60 + i * 8);
        const ky = -40 + i * 18 + Math.sin(ph) * 6;
        const fx = side * (92 + i * 6);
        const fy = 86 - (i === 0 ? 24 : 0) + Math.max(0, Math.sin(ph)) * -8;
        ctx.beginPath();
        ctx.moveTo(side * 20, -4 + i * 8 + baseA);
        ctx.quadraticCurveTo(kx, ky - 30, kx, ky);
        ctx.lineTo(fx, fy);
        outline(ctx, p[1], 9);
        ctx.beginPath();
        ctx.moveTo(side * 20, -4 + i * 8);
        ctx.quadraticCurveTo(kx, ky - 30, kx, ky);
        ctx.lineTo(fx, fy);
        outline(ctx, p[0], 4.5);
      }
    }
    // abdomen
    ctx.beginPath();
    ctx.ellipse(0, -30, 56, 46, 0, 0, TAU);
    ctx.fillStyle = bodyGrad(ctx, p, 0, -40, 56);
    ctx.fill();
    outline(ctx, p[1], 5);
    // markings
    ctx.fillStyle = p[2];
    ctx.beginPath();
    ctx.moveTo(0, -60); ctx.lineTo(12, -42); ctx.lineTo(0, -26); ctx.lineTo(-12, -42);
    ctx.closePath();
    ctx.fill();
    if (m.spikes) {
      ctx.fillStyle = p[1];
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI + 0.4 + i * 0.58;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 50 - 6, Math.sin(a) * 40 - 30);
        ctx.lineTo(Math.cos(a) * 72, Math.sin(a) * 60 - 30);
        ctx.lineTo(Math.cos(a) * 50 + 6, Math.sin(a) * 40 - 30);
        ctx.fill();
      }
    }
    // head
    ctx.beginPath();
    ctx.ellipse(0, 26, 40, 32, 0, 0, TAU);
    ctx.fillStyle = bodyGrad(ctx, p, 0, 20, 40);
    ctx.fill();
    outline(ctx, p[1], 5);
    // eyes: two big, four small
    eye(ctx, -14, 20, 11, st, { irisCol: p[2], line: p[1], iris: 0.7 });
    eye(ctx, 14, 20, 11, st, { irisCol: p[2], line: p[1], iris: 0.7 });
    [[-28, 8, 5], [28, 8, 5], [-6, 4, 4], [6, 4, 4]].forEach(([x, y, r]) => glowEye(ctx, x, y, r, p[3], st));
    // fangs
    ctx.fillStyle = '#f6efe0';
    const fang = 4 + (st.hurt || 0) * 6 + Math.sin(t * 5) * 2;
    [-1, 1].forEach((sx) => {
      ctx.beginPath();
      ctx.moveTo(sx * 10, 48);
      ctx.quadraticCurveTo(sx * 16, 58 + fang, sx * 6, 64 + fang);
      ctx.lineTo(sx * 4, 50);
      ctx.fill();
    });
    ctx.restore();
  };

  BODY.imp = function (ctx, m, t, st) {
    const p = m.pal;
    const bob = Math.sin(t * 5) * 6;
    const flap = Math.sin(t * 12);
    shadow(ctx, 54, 0.25);
    ctx.save();
    ctx.translate(0, -10 + bob);
    // tail
    ctx.beginPath();
    ctx.moveTo(30, 40);
    ctx.bezierCurveTo(80, 70, 90 + Math.sin(t * 3) * 10, 10, 70, -6);
    outline(ctx, p[1], 6);
    ctx.save();
    ctx.translate(70 + Math.sin(t * 3) * 3, -10);
    ctx.rotate(-0.8);
    ctx.beginPath();
    ctx.moveTo(0, -14); ctx.lineTo(10, 4); ctx.lineTo(0, 0); ctx.lineTo(-10, 4);
    ctx.closePath();
    ctx.fillStyle = p[1];
    ctx.fill();
    ctx.restore();
    // wings
    [-1, 1].forEach((sx) => {
      ctx.save();
      ctx.scale(sx, 1);
      ctx.rotate(flap * 0.25);
      ctx.beginPath();
      ctx.moveTo(30, -14);
      ctx.lineTo(86, -50);
      ctx.lineTo(80, -10);
      ctx.lineTo(66, -18);
      ctx.lineTo(62, 4);
      ctx.lineTo(46, -4);
      ctx.lineTo(36, 14);
      ctx.closePath();
      ctx.fillStyle = mix(p[1], '#000000', 0.2);
      ctx.fill();
      outline(ctx, p[1], 3);
      ctx.restore();
    });
    // body
    ctx.beginPath();
    ctx.ellipse(0, 10, 52, 56, 0, 0, TAU);
    ctx.fillStyle = bodyGrad(ctx, p, 0, 0, 60);
    ctx.fill();
    outline(ctx, p[1], 5);
    horns(ctx, 0, -38, 80, p[2], p[1]);
    // belly
    ctx.beginPath();
    ctx.ellipse(0, 32, 30, 24, 0, 0, TAU);
    ctx.fillStyle = 'rgba(255,220,150,0.25)';
    ctx.fill();
    // brows + eyes
    eye(ctx, -19, -6, 13, st, { irisCol: p[2], slit: true, line: p[1], iris: 0.75 });
    eye(ctx, 19, -6, 13, st, { irisCol: p[2], slit: true, line: p[1], iris: 0.75 });
    ctx.beginPath();
    ctx.moveTo(-34, -24); ctx.lineTo(-8, -16);
    ctx.moveTo(34, -24); ctx.lineTo(8, -16);
    outline(ctx, p[1], 5);
    // grin
    ctx.beginPath();
    ctx.moveTo(-26, 18);
    ctx.quadraticCurveTo(0, 42 + (st.hurt || 0) * 6, 26, 18);
    ctx.closePath();
    ctx.fillStyle = '#2a0505';
    ctx.fill();
    outline(ctx, p[1], 3);
    teeth(ctx, -22, 22, 19, 7, 6, true);
    // arms + feet
    ctx.beginPath();
    ctx.moveTo(-48, 14); ctx.lineTo(-64, 34 + Math.sin(t * 5) * 4);
    ctx.moveTo(48, 14); ctx.lineTo(64, 34 - Math.sin(t * 5) * 4);
    ctx.moveTo(-18, 62); ctx.lineTo(-22, 80);
    ctx.moveTo(18, 62); ctx.lineTo(22, 80);
    outline(ctx, p[1], 8);
    if (m.spikes) {
      ctx.fillStyle = p[2];
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 14 - 5, -50 + Math.abs(i) * 6);
        ctx.lineTo(i * 14, -64 + Math.abs(i) * 6);
        ctx.lineTo(i * 14 + 5, -50 + Math.abs(i) * 6);
        ctx.fill();
      }
    }
    ctx.restore();
  };

  BODY.golem = function (ctx, m, t, st) {
    const p = m.pal;
    const breathe = Math.sin(t * 1.6) * 3;
    shadow(ctx, 92);
    const block = (x, y, w, h, r, rot) => {
      ctx.save();
      ctx.translate(x, y);
      if (rot) ctx.rotate(rot);
      rr(ctx, -w / 2, -h / 2, w, h, r);
      const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
      g.addColorStop(0, mix(p[0], '#ffffff', 0.2));
      g.addColorStop(1, p[1]);
      ctx.fillStyle = g;
      ctx.fill();
      outline(ctx, mix(p[1], '#000000', 0.4), 4);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      rr(ctx, -w / 2 + 5, -h / 2 + 4, w - 10, h * 0.22, r * 0.5);
      ctx.fill();
      ctx.restore();
    };
    const bigHands = m.key === 'evenhand';
    // legs
    block(-30, 72, 36, 36, 8);
    block(30, 72, 36, 36, 8);
    // arms
    const swing = Math.sin(t * 1.6) * 0.08;
    block(-80, 10 + breathe, 34, 70, 10, 0.12 + swing);
    block(80, 10 + breathe, 34, 70, 10, -0.12 - swing);
    block(-88, 58 + breathe, bigHands ? 64 : 44, bigHands ? 50 : 38, 12, 0.1);
    block(88, 58 + breathe, bigHands ? 64 : 44, bigHands ? 50 : 38, 12, -0.1);
    // torso
    block(0, 22 + breathe * 0.5, 120, 92, 18);
    // runes
    ctx.save();
    ctx.shadowColor = p[2];
    ctx.shadowBlur = 14;
    ctx.strokeStyle = p[2];
    ctx.lineWidth = 4;
    ctx.globalAlpha = 0.6 + Math.sin(t * 3) * 0.3;
    ctx.beginPath();
    ctx.moveTo(-20, 10); ctx.lineTo(0, 40); ctx.lineTo(20, 10);
    ctx.moveTo(0, 40); ctx.lineTo(0, 56);
    ctx.stroke();
    ctx.restore();
    // cracks
    ctx.strokeStyle = mix(p[1], '#000000', 0.4);
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-50, -6); ctx.lineTo(-38, 8); ctx.lineTo(-44, 22);
    ctx.moveTo(44, 40); ctx.lineTo(32, 52);
    ctx.stroke();
    // head
    if (m.horns) horns(ctx, 0, -48 + breathe, 100, '#d9d2c6', '#2a2620');
    block(0, -46 + breathe, 78, 64, 14);
    // brow + eyes
    ctx.fillStyle = mix(p[1], '#000000', 0.35);
    rr(ctx, -34, -64 + breathe, 68, 14, 5);
    ctx.fill();
    glowEye(ctx, -16, -44 + breathe, 7, p[2], st);
    glowEye(ctx, 16, -44 + breathe, 7, p[2], st);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    rr(ctx, -16, -26 + breathe, 32, 6 + (st.hurt || 0) * 8, 3);
    ctx.fill();
    if (m.crown) crown(ctx, 0, -78 + breathe, 54, null);
  };

  BODY.eye = function (ctx, m, t, st) {
    const p = m.pal;
    const bob = Math.sin(t * 1.8) * 8;
    shadow(ctx, 60, 0.2);
    ctx.save();
    ctx.translate(0, -18 + bob);
    // tentacles
    for (let i = 0; i < 6; i++) {
      const x0 = -40 + i * 16;
      ctx.beginPath();
      ctx.moveTo(x0, 40);
      const ph = t * 3 + i;
      ctx.bezierCurveTo(x0 + Math.sin(ph) * 20, 70, x0 - Math.sin(ph + 1) * 26, 90, x0 + Math.sin(ph + 2) * 16, 112);
      outline(ctx, p[1], 12);
      ctx.beginPath();
      ctx.moveTo(x0, 40);
      ctx.bezierCurveTo(x0 + Math.sin(ph) * 20, 70, x0 - Math.sin(ph + 1) * 26, 90, x0 + Math.sin(ph + 2) * 16, 112);
      outline(ctx, p[0], 7);
    }
    if (m.snakes) {
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI + 0.3 + (i / 6) * (Math.PI - 0.6);
        const ph = t * 3 + i * 0.9;
        const x0 = Math.cos(a) * 60;
        const y0 = Math.sin(a) * 60;
        const x1 = Math.cos(a) * 100 + Math.sin(ph) * 10;
        const y1 = Math.sin(a) * 100 + Math.cos(ph) * 8;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo((x0 + x1) / 2 + Math.sin(ph) * 16, (y0 + y1) / 2, x1, y1);
        outline(ctx, mix(p[0], '#000000', 0.2), 9);
        ctx.beginPath();
        ctx.ellipse(x1, y1, 9, 7, a, 0, TAU);
        ctx.fillStyle = p[0];
        ctx.fill();
        outline(ctx, p[1], 2);
        ctx.fillStyle = '#ffe46b';
        ctx.beginPath();
        ctx.arc(x1 + Math.cos(a + 0.5) * 4, y1 + Math.sin(a + 0.5) * 4, 2, 0, TAU);
        ctx.fill();
      }
    }
    if (m.spikes) {
      ctx.fillStyle = p[1];
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU + t * 0.3;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a - 0.12) * 62, Math.sin(a - 0.12) * 62);
        ctx.lineTo(Math.cos(a) * 84, Math.sin(a) * 84);
        ctx.lineTo(Math.cos(a + 0.12) * 62, Math.sin(a + 0.12) * 62);
        ctx.fill();
      }
    }
    // body sphere
    ctx.beginPath();
    ctx.arc(0, 0, 66, 0, TAU);
    ctx.fillStyle = bodyGrad(ctx, p, 0, 0, 66);
    ctx.fill();
    outline(ctx, p[1], 5);
    // the eye
    const shut = st.blink || 0;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, 0, 48, 42 * (1 - shut * 0.95), 0, 0, TAU);
    ctx.fillStyle = '#fff8f0';
    ctx.fill();
    ctx.clip();
    // veins
    ctx.strokeStyle = 'rgba(220,60,80,0.45)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.3;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 48, Math.sin(a) * 42);
      ctx.quadraticCurveTo(Math.cos(a + 0.2) * 34, Math.sin(a + 0.2) * 30, Math.cos(a) * 26, Math.sin(a) * 22);
      ctx.stroke();
    }
    const lx = (st.lx || 0) * 14;
    const ly = (st.ly || 0) * 10 + 4;
    ctx.beginPath();
    ctx.arc(lx, ly, 25, 0, TAU);
    const ig = ctx.createRadialGradient(lx, ly, 4, lx, ly, 25);
    ig.addColorStop(0, mix(p[2], '#ffffff', 0.3));
    ig.addColorStop(1, mix(p[2], '#000000', 0.3));
    ctx.fillStyle = ig;
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(lx, ly, 7, 18 - (st.hurt || 0) * 8, 0, 0, TAU);
    ctx.fillStyle = '#120712';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(lx - 8, ly - 9, 6, 0, TAU);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.ellipse(0, 0, 48, 42 * (1 - shut * 0.95), 0, 0, TAU);
    outline(ctx, p[1], 4);
    // lid
    ctx.beginPath();
    ctx.ellipse(0, -2, 52, 46, 0, Math.PI + 0.25, -0.25);
    outline(ctx, p[1], 5);
    ctx.restore();
  };

  BODY.mimic = function (ctx, m, t, st) {
    const p = m.pal;
    const open = 0.32 + Math.sin(t * 2.6) * 0.12 + (st.hurt || 0) * 0.25;
    const hop = Math.abs(Math.sin(t * 2.6)) * -6;
    shadow(ctx, 92);
    ctx.save();
    ctx.translate(0, hop);
    const W = 160, H = 74;
    // box
    rr(ctx, -W / 2, 12, W, H, 10);
    const g = ctx.createLinearGradient(0, 12, 0, 12 + H);
    g.addColorStop(0, mix(p[0], '#ffffff', 0.12));
    g.addColorStop(1, p[1]);
    ctx.fillStyle = g;
    ctx.fill();
    outline(ctx, mix(p[1], '#000000', 0.45), 5);
    // planks
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-W / 2 + 6, 46); ctx.lineTo(W / 2 - 6, 46);
    ctx.stroke();
    // bands
    ctx.fillStyle = p[2];
    [-W / 2 + 18, W / 2 - 30].forEach((bx) => {
      ctx.fillRect(bx, 12, 12, H);
    });
    // lock
    rr(ctx, -12, 22, 24, 26, 5);
    ctx.fillStyle = p[2];
    ctx.fill();
    outline(ctx, mix(p[2], '#000000', 0.5), 3);
    ctx.fillStyle = '#2a1a05';
    ctx.beginPath(); ctx.arc(0, 32, 4, 0, TAU); ctx.fill();
    ctx.fillRect(-2, 32, 4, 9);
    // inside mouth
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-W / 2 + 6, 14);
    ctx.lineTo(W / 2 - 6, 14);
    ctx.lineTo(W / 2 - 10, 14 - Math.sin(open) * 90);
    ctx.lineTo(-W / 2 + 10, 14 - Math.sin(open) * 90);
    ctx.closePath();
    ctx.fillStyle = '#1a0610';
    ctx.fill();
    // tongue
    ctx.beginPath();
    ctx.moveTo(-26, 14);
    ctx.quadraticCurveTo(-10, 44 + Math.sin(t * 3) * 6, 10, 56 + Math.sin(t * 3) * 8);
    ctx.quadraticCurveTo(30, 40, 22, 14);
    ctx.closePath();
    ctx.fillStyle = p[3];
    ctx.fill();
    outline(ctx, mix(p[3], '#000000', 0.4), 3);
    // eyes in the dark
    glowEye(ctx, -26, 14 - Math.sin(open) * 44, 6, '#ffe46b', st);
    glowEye(ctx, 26, 14 - Math.sin(open) * 44, 6, '#ffe46b', st);
    teeth(ctx, -W / 2 + 10, W / 2 - 10, 14, 12, 9, false);
    ctx.restore();
    // lid
    ctx.save();
    ctx.translate(0, 14);
    ctx.scale(1, Math.cos(open));
    ctx.translate(0, -14);
    ctx.beginPath();
    ctx.moveTo(-W / 2, 14);
    ctx.lineTo(-W / 2, -22);
    ctx.quadraticCurveTo(0, -60, W / 2, -22);
    ctx.lineTo(W / 2, 14);
    ctx.closePath();
    ctx.restore();
    ctx.save();
    const lidY = 14 - Math.sin(open) * 90;
    ctx.translate(0, lidY);
    ctx.beginPath();
    ctx.moveTo(-W / 2, 0);
    ctx.lineTo(-W / 2, -26);
    ctx.quadraticCurveTo(0, -62, W / 2, -26);
    ctx.lineTo(W / 2, 0);
    ctx.closePath();
    const lg = ctx.createLinearGradient(0, -60, 0, 0);
    lg.addColorStop(0, mix(p[0], '#ffffff', 0.25));
    lg.addColorStop(1, p[0]);
    ctx.fillStyle = lg;
    ctx.fill();
    outline(ctx, mix(p[1], '#000000', 0.45), 5);
    ctx.fillStyle = p[2];
    [-W / 2 + 18, W / 2 - 30].forEach((bx) => ctx.fillRect(bx, -40, 12, 40));
    teeth(ctx, -W / 2 + 10, W / 2 - 10, 0, 12, 9, true);
    if (m.crown) crown(ctx, 0, -46, 56, null);
    if (m.horns) horns(ctx, 0, -40, 110, '#e8e0d0', '#2a2620');
    ctx.restore();
    ctx.restore();
  };

  // A dragon head, for the Pipwyrm and the Hydra's necks. Faces down-front.
  function dragonHead(ctx, p, t, st, sc, big) {
    ctx.save();
    ctx.scale(sc, sc);
    const jaw = 8 + Math.max(0, Math.sin(t * 2.2)) * 10 + (st.hurt || 0) * 16;
    // horns
    [-1, 1].forEach((sx) => {
      ctx.beginPath();
      ctx.moveTo(sx * 30, -40);
      ctx.bezierCurveTo(sx * 70, -70, sx * 80, -110, sx * 58, -140);
      ctx.bezierCurveTo(sx * 60, -100, sx * 46, -76, sx * 14, -54);
      ctx.closePath();
      ctx.fillStyle = '#f3e6c8';
      ctx.fill();
      outline(ctx, '#3a2a1a', 4);
    });
    // frills
    ctx.fillStyle = p[2];
    [-1, 1].forEach((sx) => {
      ctx.beginPath();
      ctx.moveTo(sx * 46, -24);
      ctx.lineTo(sx * 92, -36);
      ctx.lineTo(sx * 70, -10);
      ctx.lineTo(sx * 98, 4);
      ctx.lineTo(sx * 56, 12);
      ctx.closePath();
      ctx.fill();
      outline(ctx, p[1], 3);
    });
    // lower jaw
    ctx.save();
    ctx.translate(0, jaw);
    ctx.beginPath();
    ctx.moveTo(-40, 20);
    ctx.quadraticCurveTo(-36, 62, 0, 70);
    ctx.quadraticCurveTo(36, 62, 40, 20);
    ctx.closePath();
    ctx.fillStyle = mix(p[0], p[1], 0.4);
    ctx.fill();
    outline(ctx, p[1], 4);
    teeth(ctx, -32, 32, 24, 11, 6, false);
    ctx.restore();
    // mouth dark
    ctx.beginPath();
    ctx.moveTo(-38, 22);
    ctx.quadraticCurveTo(0, 30 + jaw, 38, 22);
    ctx.lineTo(38, 20 + jaw);
    ctx.lineTo(-38, 20 + jaw);
    ctx.closePath();
    ctx.fillStyle = '#2a0508';
    ctx.fill();
    if (big) {
      // fire glow in the throat
      ctx.save();
      ctx.globalAlpha = 0.5 + Math.sin(t * 6) * 0.2;
      ctx.fillStyle = '#ff9a3c';
      ctx.beginPath();
      ctx.ellipse(0, 26 + jaw * 0.6, 18, 6 + jaw * 0.3, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    // skull
    ctx.beginPath();
    ctx.moveTo(-56, -20);
    ctx.bezierCurveTo(-60, -70, 60, -70, 56, -20);
    ctx.bezierCurveTo(54, 0, 46, 10, 40, 24);
    ctx.quadraticCurveTo(0, 36, -40, 24);
    ctx.bezierCurveTo(-46, 10, -54, 0, -56, -20);
    ctx.closePath();
    ctx.fillStyle = bodyGrad(ctx, p, 0, -30, 70);
    ctx.fill();
    outline(ctx, p[1], 5);
    teeth(ctx, -34, 34, 24, 10, 6, true);
    // scales like dice pips
    ctx.fillStyle = rgba(p[3], 0.85);
    [[-20, -44], [0, -50], [20, -44], [-10, -34], [10, -34]].forEach(([x, y]) => {
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, TAU);
      ctx.fill();
    });
    // nostrils
    ctx.fillStyle = '#2a0508';
    ctx.beginPath(); ctx.ellipse(-10, 10, 4, 3, 0.3, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(10, 10, 4, 3, -0.3, 0, TAU); ctx.fill();
    // eyes
    [-1, 1].forEach((sx) => {
      ctx.save();
      ctx.translate(sx * 26, -18);
      ctx.rotate(sx * 0.25);
      ctx.beginPath();
      ctx.ellipse(0, 0, 13, 9 * (1 - (st.blink || 0) * 0.9), 0, 0, TAU);
      ctx.fillStyle = p[3];
      ctx.shadowColor = p[3];
      ctx.shadowBlur = 16;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.ellipse((st.lx || 0) * 3, 0, 2.5, 7 * (1 - (st.blink || 0) * 0.9), 0, 0, TAU);
      ctx.fillStyle = '#1a0505';
      ctx.fill();
      ctx.restore();
    });
    // brows
    ctx.beginPath();
    ctx.moveTo(-44, -34); ctx.lineTo(-12, -26);
    ctx.moveTo(44, -34); ctx.lineTo(12, -26);
    outline(ctx, p[1], 6);
    ctx.restore();
  }

  BODY.dragon = function (ctx, m, t, st) {
    const p = m.pal;
    const sway = Math.sin(t * 1.2);
    shadow(ctx, 110);
    // The wyrm is tall: shrink it into the same box as everyone else.
    ctx.save();
    ctx.translate(0, 34);
    ctx.scale(0.74, 0.74);
    // wings behind
    [-1, 1].forEach((sx) => {
      ctx.save();
      ctx.scale(sx, 1);
      ctx.translate(30, 10);
      ctx.rotate(-0.2 + Math.sin(t * 1.8) * 0.12);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(70, -110);
      ctx.lineTo(120, -60);
      ctx.quadraticCurveTo(104, -40, 118, -10);
      ctx.quadraticCurveTo(96, -20, 90, 10);
      ctx.quadraticCurveTo(70, -6, 60, 24);
      ctx.closePath();
      ctx.fillStyle = mix(p[1], '#000000', 0.25);
      ctx.fill();
      outline(ctx, p[1], 4);
      ctx.strokeStyle = rgba(p[2], 0.5);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(4, 0); ctx.lineTo(118, -12);
      ctx.moveTo(4, 0); ctx.lineTo(90, 8);
      ctx.moveTo(4, 0); ctx.lineTo(70, -108);
      ctx.stroke();
      ctx.restore();
    });
    // coiled neck/body
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-70, 92);
    ctx.bezierCurveTo(-90, 30, 60, 50, 40, 0);
    ctx.bezierCurveTo(30, -20, sway * 10, -30, sway * 8, -40);
    ctx.lineWidth = 58;
    ctx.strokeStyle = p[1];
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.lineWidth = 48;
    ctx.strokeStyle = p[0];
    ctx.stroke();
    // belly plates
    ctx.lineWidth = 16;
    ctx.strokeStyle = rgba(p[3], 0.55);
    ctx.setLineDash([10, 8]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    ctx.save();
    ctx.translate(sway * 8, -62);
    ctx.rotate(sway * 0.06);
    dragonHead(ctx, p, t, st, 0.95, true);
    ctx.restore();
    if (m.crown) crown(ctx, sway * 8, -114, 50, null);
    ctx.restore();
  };

  BODY.hydra = function (ctx, m, t, st) {
    const p = m.pal;
    shadow(ctx, 100);
    // body mound
    ctx.beginPath();
    ctx.ellipse(0, 68, 90, 34, 0, 0, TAU);
    ctx.fillStyle = bodyGrad(ctx, p, 0, 60, 90);
    ctx.fill();
    outline(ctx, p[1], 5);
    const heads = [[-62, -10, -0.35, 1.1], [62, -10, 0.35, 0.6], [0, -60, 0, 0]];
    heads.forEach(([hx, hy, rot, ph], i) => {
      const s = Math.sin(t * 1.6 + ph);
      const x = hx + s * 8;
      const y = hy + Math.cos(t * 1.6 + ph) * 6;
      ctx.beginPath();
      ctx.moveTo(hx * 0.4, 56);
      ctx.quadraticCurveTo(hx * 0.9, 40, x, y + 20);
      ctx.lineWidth = 30;
      ctx.strokeStyle = p[1];
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.lineWidth = 22;
      ctx.strokeStyle = p[0];
      ctx.stroke();
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot + s * 0.08);
      dragonHead(ctx, p, t + i, st, i === 2 ? 0.6 : 0.5, i === 2);
      ctx.restore();
    });
  };

  /* Draws monster `m` with its feet at (x, y). st: { hurt, blink, lx, ly,
     squash, flash, alpha, dying } */
  art.monster = function (ctx, m, x, y, scale, t, st) {
    const fn = BODY[m.art] || BODY.slime;
    const s = scale * (m.size || 1);
    if (st.flash > 0.02) {
      // The white hit flash: draw the monster alone on a scratch canvas,
      // whiten just its pixels, then stamp it into the scene.
      const k = (ctx.getTransform ? ctx.getTransform().a : 1) || 1;
      const size = Math.max(1, Math.ceil(440 * s * k));
      if (!flashCan) flashCan = document.createElement('canvas');
      if (flashCan.width !== size || flashCan.height !== size) { flashCan.width = size; flashCan.height = size; }
      const g = flashCan.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalAlpha = 1;
      g.clearRect(0, 0, size, size);
      g.setTransform(s * k, 0, 0, s * k, 220 * s * k, 280 * s * k);
      fn(g, m, t, st);
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = 'rgba(255,255,255,' + Math.min(1, st.flash) + ')';
      g.fillRect(0, 0, size, size);
      g.globalCompositeOperation = 'source-over';
      ctx.save();
      if (st.alpha != null) ctx.globalAlpha = st.alpha;
      ctx.drawImage(flashCan, x - 220 * s, y - 90 * s - 280 * s, 440 * s, 440 * s);
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.translate(0, -90);
    if (st.alpha != null) ctx.globalAlpha = st.alpha;
    fn(ctx, m, t, st);
    ctx.restore();
  };
  let flashCan = null;

  /* ---------------- dungeon backdrop ----------------
     The wall is baked once per area and size into an offscreen canvas;
     torches and dust are drawn live on top. */
  const bgCache = {};
  art.backdrop = function (ctx, w, h, area, t, horizon) {
    const key = area.name + ':' + w + 'x' + h + ':' + Math.round(horizon);
    let c = bgCache[key];
    if (!c) {
      for (const k in bgCache) delete bgCache[k];
      c = document.createElement('canvas');
      c.width = Math.ceil(w);
      c.height = Math.ceil(h);
      const g = c.getContext('2d');
      const grd = g.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, area.bg[0]);
      grd.addColorStop(0.62, area.bg[1]);
      grd.addColorStop(1, '#050308');
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);
      // bricks on the back wall
      const bh = Math.max(16, Math.round(w / 16));
      const bw = bh * 2.1;
      const rng = new RM.Stream(RM.hashStr(area.name));
      for (let row = 0; row * bh < horizon; row++) {
        const off = row % 2 ? bw / 2 : 0;
        for (let x = -bw; x < w + bw; x += bw) {
          const shade = rng.next() * 0.07;
          g.fillStyle = 'rgba(255,255,255,' + (0.025 + shade) + ')';
          rr(g, x + off + 2, row * bh + 2, bw - 4, bh - 4, 3);
          g.fill();
          if (rng.next() < 0.06) {
            g.fillStyle = RM.art.rgba(area.fog, 0.18);
            g.beginPath();
            g.ellipse(x + off + bw / 2, row * bh + bh - 3, bw * 0.4, 4, 0, 0, TAU);
            g.fill();
          }
        }
      }
      // floor
      const fg = g.createLinearGradient(0, horizon, 0, h);
      fg.addColorStop(0, 'rgba(0,0,0,0.35)');
      fg.addColorStop(1, 'rgba(0,0,0,0.85)');
      g.fillStyle = fg;
      g.fillRect(0, horizon, w, h - horizon);
      g.strokeStyle = 'rgba(255,255,255,0.05)';
      g.lineWidth = 1;
      for (let i = -8; i <= 8; i++) {
        g.beginPath();
        g.moveTo(w / 2 + i * w * 0.08, horizon);
        g.lineTo(w / 2 + i * w * 0.4, h);
        g.stroke();
      }
      for (let k = 1; k < 7; k++) {
        const yy = horizon + (h - horizon) * Math.pow(k / 7, 1.7);
        g.beginPath();
        g.moveTo(0, yy);
        g.lineTo(w, yy);
        g.stroke();
      }
      // vignette
      const vg = g.createRadialGradient(w / 2, horizon * 0.8, Math.min(w, h) * 0.2, w / 2, horizon, Math.max(w, h) * 0.8);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.65)');
      g.fillStyle = vg;
      g.fillRect(0, 0, w, h);
      bgCache[key] = c;
    }
    ctx.drawImage(c, 0, 0, w, h);
    // torches
    const tx = [w * 0.1, w * 0.9];
    const ty = horizon * 0.42;
    tx.forEach((x, i) => {
      const fl = 1 + Math.sin(t * 13 + i * 3) * 0.08 + Math.sin(t * 7.3 + i) * 0.06;
      const gl = ctx.createRadialGradient(x, ty, 2, x, ty, w * 0.35 * fl);
      gl.addColorStop(0, RM.art.rgba(area.torch, 0.32));
      gl.addColorStop(1, RM.art.rgba(area.torch, 0));
      ctx.fillStyle = gl;
      ctx.fillRect(x - w * 0.4, ty - w * 0.4, w * 0.8, w * 0.8);
      const s = Math.max(8, w * 0.028);
      ctx.fillStyle = '#3a2a22';
      ctx.fillRect(x - s * 0.35, ty + s * 0.4, s * 0.7, s * 2.2);
      ctx.save();
      ctx.translate(x, ty);
      ctx.scale(fl, fl * (1 + Math.sin(t * 17 + i) * 0.1));
      ctx.fillStyle = area.torch;
      flamePath(ctx, s);
      ctx.fill();
      ctx.fillStyle = '#fff3c4';
      ctx.translate(0, s * 0.35);
      flamePath(ctx, s * 0.45);
      ctx.fill();
      ctx.restore();
    });
  };

  /* ---------------- small canvases for the DOM ---------------- */
  // Renders a die face to a canvas element (for the shop, dice view, codex).
  art.faceCanvas = function (face, size, setId, opts) {
    const c = document.createElement('canvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = c.height = Math.round(size * dpr * 1.18);
    c.style.width = c.style.height = Math.round(size * 1.18) + 'px';
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    art.die(g, size * 0.59, size * 0.55, size, Object.assign({ v: face.v, g: face.g, set: setId }, opts || {}));
    return c;
  };
  art.glyphCanvas = function (g, size) {
    const c = document.createElement('canvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = c.height = Math.round(size * dpr);
    c.style.width = c.style.height = size + 'px';
    const x = c.getContext('2d');
    x.scale(dpr, dpr);
    art.glyph(x, g, size / 2, size / 2, size * 0.4, 1);
    return c;
  };
  art.monsterCanvas = function (m, w, h, t) {
    const c = document.createElement('canvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    c.style.width = w + 'px';
    c.style.height = h + 'px';
    const x = c.getContext('2d');
    x.scale(dpr, dpr);
    const sc = Math.min(w, h) / 270;
    art.monster(x, m, w / 2, h * 0.92, sc, t || 0.6, { blink: 0, lx: 0, ly: 0.2 });
    return c;
  };

  RM.art = art;
})(window.RM);
