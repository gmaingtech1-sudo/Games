/* Portal Hackers: Nexus — the Sci-Fi Compass. A radar centred on you: a
   rotating bezel (it turns with your phone when the compass sensor is on),
   range rings, a sweep, and every portal, energy cell and Nexus signal at
   its real bearing and distance. Tap a blip to open it, or (in tap-to-walk
   mode) tap empty space to walk there. */
window.PH = window.PH || {};
(function (PH) {
  'use strict';

  const { TAU } = PH.util;
  const W = PH.world;
  const D = PH.data;

  const DEG = Math.PI / 180;
  let canvas = null, ctx = null, dpr = 1, size = 1;
  let handlers = { tap: null, ground: null };
  let last = null;      // last frame, for hit-testing taps
  let hits = [];

  function init(el, h) {
    canvas = el;
    ctx = canvas.getContext('2d');
    handlers = Object.assign(handlers, h);
    canvas.addEventListener('pointerup', onTap);
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    size = canvas.clientWidth;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
  }

  const R = () => size / 2 - 22;      // radar radius in CSS px

  // Screen position of `ll` seen from `pos`.
  function project(f, ll) {
    const [dx, dy] = W.offset(f.pos, ll);
    const rot = -f.rot * DEG;
    const x = dx * Math.cos(rot) - dy * Math.sin(rot);
    const y = dx * Math.sin(rot) + dy * Math.cos(rot);
    const k = R() / f.range;
    return [size / 2 + x * k, size / 2 - y * k, Math.hypot(dx, dy)];
  }

  function unproject(f, sx, sy) {
    const k = f.range / R();
    const x = (sx - size / 2) * k, y = -(sy - size / 2) * k;
    const rot = f.rot * DEG;
    const dx = x * Math.cos(rot) - y * Math.sin(rot);
    const dy = x * Math.sin(rot) + y * Math.cos(rot);
    return W.move(f.pos, dx, dy);
  }

  function onTap(e) {
    if (!last) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    let best = null, bd = 26;
    for (const h of hits) {
      const d = Math.hypot(h.x - sx, h.y - sy);
      if (d < bd) { bd = d; best = h; }
    }
    if (best) { if (handlers.tap) handlers.tap(best.ent); return; }
    if (Math.hypot(sx - size / 2, sy - size / 2) > R()) return;
    if (handlers.ground) handlers.ground(unproject(last, sx, sy));
  }

  /* ------------------ Shapes ------------------ */

  function poly(x, y, r, n, a0) {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * TAU;
      ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
  }

  function star(x, y, r, n) {
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = -Math.PI / 2 + (i / (n * 2)) * TAU;
      const rr = i % 2 ? r * 0.45 : r;
      ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
  }

  function portalShape(rarity, x, y, r) {
    if (rarity === 'common') { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); }
    else if (rarity === 'rare') poly(x, y, r * 1.15, 4, -Math.PI / 2);
    else if (rarity === 'epic') poly(x, y, r * 1.12, 6, 0);
    else if (rarity === 'legendary') star(x, y, r * 1.35, 5);
    else { ctx.beginPath(); ctx.arc(x, y, r * 1.2, 0, TAU); }
  }

  /* ------------------ Draw ------------------ */

  function skinColors(f) {
    const sk = D.SKINS[f.skin] || D.SKINS.basic;
    if (!sk.animated) return sk.colors;
    const h = (f.t * 40) % 360;
    return [`hsl(${h} 100% 70%)`, `hsl(${(h + 120) % 360} 100% 55%)`, `hsl(${(h + 240) % 360} 100% 70%)`];
  }

  function draw(f) {
    last = f;
    hits = [];
    const [ring, glow, sweep] = skinColors(f);
    const c = size / 2, rad = R();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    // Face.
    const g = ctx.createRadialGradient(c, c, rad * 0.1, c, c, rad);
    g.addColorStop(0, 'rgba(10, 30, 60, 0.95)');
    g.addColorStop(1, 'rgba(4, 10, 24, 0.98)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(c, c, rad, 0, TAU); ctx.fill();

    // Grid lines.
    ctx.save();
    ctx.beginPath(); ctx.arc(c, c, rad, 0, TAU); ctx.clip();
    ctx.strokeStyle = 'rgba(95, 227, 255, 0.06)';
    ctx.lineWidth = 1;
    const step = rad / 6;
    for (let k = -6; k <= 6; k++) {
      ctx.beginPath(); ctx.moveTo(c + k * step, c - rad); ctx.lineTo(c + k * step, c + rad); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(c - rad, c + k * step); ctx.lineTo(c + rad, c + k * step); ctx.stroke();
    }

    // Range rings.
    ctx.strokeStyle = 'rgba(160, 220, 255, 0.14)';
    for (let k = 1; k <= 3; k++) { ctx.beginPath(); ctx.arc(c, c, (rad * k) / 4, 0, TAU); ctx.stroke(); }

    // Scanner range.
    const sr = (f.scan / f.range) * rad;
    if (sr < rad * 1.05) {
      ctx.strokeStyle = ring;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(c, c, sr, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 0.06;
      ctx.fillStyle = ring;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    // Reach.
    const ir = (D.RANGE.interact / f.range) * rad;
    ctx.setLineDash([4, 5]);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(c, c, ir, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);

    // Sweep.
    const sa = (f.t * 1.6) % TAU;
    const sw = ctx.createConicGradient ? ctx.createConicGradient(sa - 0.9, c, c) : null;
    if (sw) {
      sw.addColorStop(0, 'rgba(0,0,0,0)');
      sw.addColorStop(0.14, hexA(sweep, 0.22));
      sw.addColorStop(0.1433, hexA(sweep, 0.5));
      sw.addColorStop(0.145, 'rgba(0,0,0,0)');
      ctx.fillStyle = sw;
      ctx.beginPath(); ctx.arc(c, c, rad, 0, TAU); ctx.fill();
    }

    // Links.
    for (const l of f.links) {
      const a = project(f, l.a), b = project(f, l.b);
      ctx.strokeStyle = hexA(f.teamColor, 0.75);
      ctx.lineWidth = 2;
      ctx.shadowColor = f.teamColor;
      ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      ctx.shadowBlur = 0;
    }
    // Pending link.
    if (f.linkFrom) {
      const a = project(f, f.linkFrom);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.arc(a[0], a[1], (f.linkRange / f.range) * rad, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
    }

    // Energy cells.
    for (const e of f.energy) {
      const [x, y, d] = project(f, e);
      if (d > f.range) continue;
      const pulse = 0.6 + 0.4 * Math.sin(f.t * 4 + x);
      ctx.fillStyle = `rgba(255, 230, 90, ${0.55 + 0.4 * pulse})`;
      ctx.shadowColor = '#FFE65A';
      ctx.shadowBlur = 8;
      poly(x, y, 4.5, 4, Math.PI / 4);
      ctx.fill();
      ctx.shadowBlur = 0;
      hits.push({ x, y, ent: e });
    }

    // Nexus signals.
    for (const s of f.signals) {
      const [x, y, d] = project(f, s);
      if (d > f.range) continue;
      for (let k = 0; k < 3; k++) {
        const ph = ((f.t * 0.7 + k / 3) % 1);
        ctx.strokeStyle = `rgba(190, 120, 255, ${0.8 * (1 - ph)})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, 4 + ph * 18, 0, TAU); ctx.stroke();
      }
      ctx.fillStyle = '#E0C2FF';
      ctx.beginPath(); ctx.arc(x, y, 3.5, 0, TAU); ctx.fill();
      hits.push({ x, y, ent: s });
    }

    // Portals.
    for (const p of f.portals) {
      const [x, y, d] = project(f, p);
      if (d > f.range * 1.02) continue;
      const Rr = D.RARITY[p.rarity];
      const small = f.territory ? 0.65 : 1;
      const r = (p.rarity === 'nexus' ? 9 : 7) * small;
      if (!p.known && !f.territory) {
        const pulse = 0.4 + 0.3 * Math.sin(f.t * 3 + x * 0.1);
        ctx.fillStyle = `rgba(200, 220, 255, ${pulse})`;
        ctx.font = '700 13px "Chakra Petch", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('?', x, y);
        hits.push({ x, y, ent: p });
        continue;
      }
      const col = p.owner ? D.TEAMS[p.owner].color : '#C9D3E6';
      if (p.mine && f.portalFx) {
        const a = f.t * 2 + x;
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath(); ctx.arc(x + Math.cos(a) * (r + 6), y + Math.sin(a) * (r + 6), 1.8, 0, TAU); ctx.fill();
      }
      if (p.rarity === 'nexus') {
        const gg = ctx.createRadialGradient(x, y, 1, x, y, r * 2.4);
        gg.addColorStop(0, '#000');
        gg.addColorStop(0.45, '#000');
        gg.addColorStop(0.55, 'rgba(233, 228, 255, 0.9)');
        gg.addColorStop(1, 'rgba(180, 92, 255, 0)');
        ctx.fillStyle = gg;
        ctx.beginPath(); ctx.arc(x, y, r * 2.4, 0, TAU); ctx.fill();
      }
      ctx.shadowColor = col;
      ctx.shadowBlur = 10;
      ctx.fillStyle = hexA(col, p.owner ? 0.9 : 0.5);
      portalShape(p.rarity, x, y, r);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 2;
      ctx.strokeStyle = Rr.color;
      portalShape(p.rarity, x, y, r);
      ctx.stroke();
      if (p.mine) {
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(x, y, 2, 0, TAU); ctx.fill();
      }
      if (p.defending) {
        ctx.strokeStyle = hexA('#FFFFFF', 0.6 + 0.4 * Math.sin(f.t * 5));
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, r + 7, 0, TAU); ctx.stroke();
      }
      if (p.breached) {
        ctx.strokeStyle = '#FF5A6E';
        ctx.setLineDash([2, 3]);
        ctx.beginPath(); ctx.arc(x, y, r + 5, 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
      }
      if (p.ready && !f.territory) {
        ctx.strokeStyle = hexA(ring, 0.5 + 0.5 * Math.sin(f.t * 4));
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x, y, r + 11, 0, TAU); ctx.stroke();
      }
      hits.push({ x, y, ent: p });
    }

    // Walk target.
    if (f.walkTo) {
      const [x, y] = project(f, f.walkTo);
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x - 5, y - 5); ctx.lineTo(x + 5, y + 5); ctx.moveTo(x + 5, y - 5); ctx.lineTo(x - 5, y + 5); ctx.stroke();
    }
    ctx.restore();

    // Bezel.
    ctx.lineWidth = 3;
    ctx.strokeStyle = ring;
    ctx.shadowColor = glow;
    ctx.shadowBlur = 16;
    ctx.beginPath(); ctx.arc(c, c, rad, 0, TAU); ctx.stroke();
    ctx.shadowBlur = 0;
    if (f.frame) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#FFD23F';
      ctx.beginPath(); ctx.arc(c, c, rad + 17, 0, TAU); ctx.stroke();
    }
    for (let a = 0; a < 360; a += 5) {
      const ang = (a + f.rot - 90) * DEG;
      const big = a % 45 === 0;
      const r0 = rad + 3, r1 = rad + (big ? 11 : a % 15 === 0 ? 7 : 4);
      ctx.strokeStyle = big ? ring : 'rgba(180, 220, 255, 0.45)';
      ctx.lineWidth = big ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(ang) * r0, c + Math.sin(ang) * r0);
      ctx.lineTo(c + Math.cos(ang) * r1, c + Math.sin(ang) * r1);
      ctx.stroke();
    }
    ctx.font = '700 12px "Audiowide", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const [lab, a] of [['N', 0], ['E', 90], ['S', 180], ['W', 270]]) {
      const ang = (a + f.rot - 90) * DEG;
      const rr = rad - 13;
      ctx.fillStyle = lab === 'N' ? '#FF5A6E' : 'rgba(220, 240, 255, 0.85)';
      ctx.fillText(lab, c + Math.cos(ang) * rr, c + Math.sin(ang) * rr);
    }

    // Range label.
    ctx.fillStyle = 'rgba(200, 225, 255, 0.6)';
    ctx.font = '600 10px "Chakra Petch", sans-serif';
    ctx.fillText(f.range >= 1000 ? `${(f.range / 1000).toFixed(1)} km` : `${Math.round(f.range)} m`, c, c + rad - 28);

    // You.
    ctx.save();
    ctx.translate(c, c);
    const myAng = f.heading != null ? (f.heading + f.rot) * DEG : 0;
    ctx.rotate(myAng);
    ctx.fillStyle = f.teamColor;
    ctx.shadowColor = f.teamColor;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.moveTo(0, -12); ctx.lineTo(8, 9); ctx.lineTo(0, 4); ctx.lineTo(-8, 9);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.shadowBlur = 0;
  }

  function hexA(col, a) {
    if (col[0] !== '#') return col.replace(/\)$/, ` / ${a})`);
    const n = parseInt(col.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }

  PH.compass = { init, resize, draw };
})(window.PH);
