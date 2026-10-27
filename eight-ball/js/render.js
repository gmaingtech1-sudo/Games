/* Eight-Ball — drawing, looking straight down on a pub table lit by a row
   of lamps. The table stands long-ways on a portrait screen and turns on
   its side (baulk to the left) on a landscape one.

   The lamps do the realism: they light pools on the cloth, put a highlight
   on each ball where a real one would shine, and cast a soft shadow from
   each ball and the cue. Balls are shaded spheres whose markings (the 8,
   the spots on the cue ball) turn as they roll and spin. The cloth, rails
   and pockets are baked once per resize; everything else is drawn every
   frame on top. */
(function (EB) {
  'use strict';

  const { TABLE, kind, phys } = EB;
  const { W, L, R, D, J, BAULK, SPOT, pockets, cushions } = TABLE;
  const PAD = 108;
  const RAIL = 104;
  const CUE_LEN = 1450;

  // A long pub lamp over the table: three shades along its length, this high.
  const LAMP_H = 850;
  const LAMPS = [L * 0.2, L * 0.5, L * 0.8].map((y) => ({ x: W / 2, y }));

  const COL = {
    red: '#C11425',
    yellow: '#F0B80C',
    black: '#101114',
    cue: '#F2EEE2',
    cloth: '#1C6E45',
  };

  let cv = null;
  let ctx = null;
  let bg = null;
  let shade = null;
  let cueImg = null;
  let cueShadow = null;
  let dpr = 1;
  let cw = 0;
  let ch = 0;
  const view = { s: 1, a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, land: false };

  function init(canvas) {
    cv = canvas;
    ctx = cv.getContext('2d');
    bg = document.createElement('canvas');
    resize();
  }

  function resize() {
    const r = cv.getBoundingClientRect();
    cw = Math.max(1, r.width);
    ch = Math.max(1, r.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    cv.width = bg.width = Math.round(cw * dpr);
    cv.height = bg.height = Math.round(ch * dpr);
    view.land = cw > ch * 1.08;
    if (!view.land) {
      const s = Math.min(cw / (W + 2 * PAD), ch / (L + 2 * PAD));
      Object.assign(view, { s, a: s, b: 0, c: 0, d: s, e: cw / 2 - s * W / 2, f: ch / 2 - s * L / 2 });
    } else {
      const s = Math.min(cw / (L + 2 * PAD), ch / (W + 2 * PAD));
      Object.assign(view, { s, a: 0, b: s, c: -s, d: 0, e: cw / 2 + s * L / 2, f: ch / 2 - s * W / 2 });
    }
    bake();
    shade = ballShade(Math.ceil(D * view.s * dpr * 1.1) + 2);
    makeCue();
  }

  function toWorld(sx, sy) {
    const s = view.s;
    return view.land ? { x: (sy - view.f) / s, y: (view.e - sx) / s } : { x: (sx - view.e) / s, y: (sy - view.f) / s };
  }

  function toScreen(x, y) {
    return { x: view.a * x + view.c * y + view.e, y: view.b * x + view.d * y + view.f };
  }

  function worldTransform(c) {
    c.setTransform(view.a * dpr, view.b * dpr, view.c * dpr, view.d * dpr, view.e * dpr, view.f * dpr);
  }

  function poly(c, pts) {
    c.beginPath();
    pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath();
  }

  // Seeded random numbers, so the wood and cloth look the same every bake.
  function seeded(seed) {
    let s = seed;
    return () => ((s = (s * 16807) % 2147483647) / 2147483647);
  }

  /* ---------- The table ---------- */

  function bake() {
    const c = bg.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, bg.width, bg.height);
    worldTransform(c);

    // The table's shadow on the floor.
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.6)';
    c.shadowBlur = 50 * view.s * dpr;
    c.fillStyle = '#1A0C05';
    c.beginPath();
    c.roundRect(-RAIL, -RAIL, W + 2 * RAIL, L + 2 * RAIL, 30);
    c.fill();
    c.restore();

    rails(c);
    // The holes are cut through the rail and the slate: first the leather
    // pocket lining set into the wood, then the bed, cut back in an arc
    // where each pocket falls away, then the cushions over the top.
    c.save();
    c.beginPath();
    c.roundRect(-RAIL + 3, -RAIL + 3, W + 2 * RAIL - 6, L + 2 * RAIL - 6, 30);
    c.clip();
    for (const p of pockets) lining(c, p);
    c.restore();
    cloth(c);
    // Inside the cushion line: the throat between the jaws and the bed cut
    // away from nose to nose fall into the dark.
    c.save();
    c.beginPath();
    c.rect(-J, -J, W + 2 * J, L + 2 * J);
    c.clip();
    for (const p of pockets) drop(c, p);
    c.restore();
    for (const cu of cushions) cushion(c, cu);

    // The baulk line, chalked on, and the spot.
    c.strokeStyle = 'rgba(255,255,255,0.3)';
    c.lineWidth = 1.6;
    c.beginPath();
    c.moveTo(0, BAULK); c.lineTo(W, BAULK);
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.55)';
    c.beginPath();
    c.arc(SPOT.x, SPOT.y, 3.2, 0, Math.PI * 2);
    c.fill();
  }

  // Four varnished hardwood rails, mitred at the corners, with the grain
  // running along each one and the lamps reflected in the varnish.
  function rails(c) {
    const o = RAIL;
    const pieces = [
      { pts: [[-o, -o], [W + o, -o], [W + J, -J], [-J, -J]], along: 'x', inner: -J, outer: -o },
      { pts: [[-o, L + o], [W + o, L + o], [W + J, L + J], [-J, L + J]], along: 'x', inner: L + J, outer: L + o },
      { pts: [[-o, -o], [-J, -J], [-J, L + J], [-o, L + o]], along: 'y', inner: -J, outer: -o },
      { pts: [[W + o, -o], [W + J, -J], [W + J, L + J], [W + o, L + o]], along: 'y', inner: W + J, outer: W + o },
    ];
    pieces.forEach((pc, i) => {
      c.save();
      poly(c, pc.pts);
      c.clip();
      const g = pc.along === 'x' ? c.createLinearGradient(0, pc.outer, 0, pc.inner) : c.createLinearGradient(pc.outer, 0, pc.inner, 0);
      g.addColorStop(0, '#3E1C0B');
      g.addColorStop(0.35, '#6B3518');
      g.addColorStop(0.8, '#7C4220');
      g.addColorStop(1, '#4A2210');
      c.fillStyle = g;
      c.fillRect(-o, -o, W + 2 * o, L + 2 * o);
      // Grain: long wavy streaks.
      const rnd = seeded(101 + i * 977);
      const len = pc.along === 'x' ? W + 2 * o : L + 2 * o;
      const lo = Math.min(pc.inner, pc.outer);
      const hi = Math.max(pc.inner, pc.outer);
      for (let k = 0; k < 70; k++) {
        const base = lo + rnd() * (hi - lo);
        const amp = 1 + rnd() * 3;
        const freq = 0.004 + rnd() * 0.01;
        const ph = rnd() * 6;
        c.strokeStyle = rnd() < 0.7 ? `rgba(30,10,2,${0.08 + rnd() * 0.16})` : `rgba(160,90,45,${0.06 + rnd() * 0.1})`;
        c.lineWidth = 0.6 + rnd() * 2.2;
        c.beginPath();
        for (let t = -o; t <= len; t += 20) {
          const off = base + Math.sin(t * freq + ph) * amp + Math.sin(t * freq * 3.1 + ph * 2) * amp * 0.3;
          if (pc.along === 'x') (t === -o ? c.moveTo(t, off) : c.lineTo(t, off));
          else (t === -o ? c.moveTo(off, t) : c.lineTo(off, t));
        }
        c.stroke();
      }
      // The lamps' reflections in the varnish.
      for (const lp of LAMPS) {
        const rx = pc.along === 'y' ? (pc.inner + pc.outer) / 2 : lp.x;
        const ry = pc.along === 'y' ? lp.y : (pc.inner + pc.outer) / 2;
        if (pc.along === 'x' && lp !== LAMPS[i === 0 ? 0 : 2]) continue;
        const gl = c.createRadialGradient(rx, ry, 0, rx, ry, 170);
        gl.addColorStop(0, 'rgba(255,236,200,0.2)');
        gl.addColorStop(1, 'rgba(255,236,200,0)');
        c.fillStyle = gl;
        c.fillRect(rx - 170, ry - 170, 340, 340);
      }
      c.restore();
      // The mitre joints.
      c.strokeStyle = 'rgba(20,6,0,0.6)';
      c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(pc.pts[0][0], pc.pts[0][1]);
      c.lineTo(pc.pts[pc.along === 'x' ? 3 : 1][0], pc.pts[pc.along === 'x' ? 3 : 1][1]);
      c.stroke();
    });
    // A rounded outer edge.
    c.strokeStyle = 'rgba(0,0,0,0.55)';
    c.lineWidth = 3;
    c.beginPath();
    c.roundRect(-o + 1.5, -o + 1.5, W + 2 * o - 3, L + 2 * o - 3, 28);
    c.stroke();
    c.strokeStyle = 'rgba(255,210,160,0.12)';
    c.lineWidth = 1.5;
    c.beginPath();
    c.roundRect(-o + 5, -o + 5, W + 2 * o - 10, L + 2 * o - 10, 25);
    c.stroke();
    // Mother-of-pearl sights.
    const sight = (x, y) => {
      const g = c.createLinearGradient(x - 5, y - 5, x + 5, y + 5);
      g.addColorStop(0, '#FFFFFF');
      g.addColorStop(0.5, '#D9E2E8');
      g.addColorStop(1, '#BFB6A6');
      c.fillStyle = g;
      poly(c, [[x, y - 6], [x + 4, y], [x, y + 6], [x - 4, y]]);
      c.fill();
    };
    const m = (J + o) / 2;
    for (let k = 1; k < 8; k++) if (k !== 4) { sight(-m, L * k / 8); sight(W + m, L * k / 8); }
    for (let k = 1; k < 4; k++) { sight(W * k / 4, -m); sight(W * k / 4, L + m); }
  }

  // The pocket where it's set into the rail: a leather-lined cup with a
  // rolled lip, dark inside.
  function lining(c, p) {
    const rim = p.r + 9;
    const lip = c.createRadialGradient(p.x, p.y, p.r - 2, p.x, p.y, rim);
    lip.addColorStop(0, '#0E0907');
    lip.addColorStop(0.45, '#3A2418');
    lip.addColorStop(0.7, '#5A3A26');
    lip.addColorStop(1, '#24150D');
    c.fillStyle = lip;
    c.beginPath();
    c.arc(p.x, p.y, rim, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.6)';
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(p.x, p.y, rim, 0, Math.PI * 2);
    c.stroke();
    hole(c, p);
  }

  function hole(c, p) {
    const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
    g.addColorStop(0, '#000');
    g.addColorStop(0.75, '#030303');
    g.addColorStop(0.93, '#0D0B0A');
    g.addColorStop(1, '#1A1512');
    c.fillStyle = g;
    c.beginPath();
    c.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    c.fill();
  }

  // Where the bed falls away into a pocket: the cloth folds over the edge
  // of the slate, catching a little light, then drops into the dark.
  function drop(c, p) {
    c.fillStyle = '#040303';
    c.beginPath();
    c.arc(p.dx, p.dy, p.dr, 0, Math.PI * 2);
    c.fill();
    hole(c, p);
    c.save();
    c.beginPath();
    c.rect(0, 0, W, L);
    c.clip();
    c.beginPath();
    c.arc(p.dx, p.dy, p.dr + 3.5, 0, Math.PI * 2);
    c.lineWidth = 7;
    c.strokeStyle = 'rgba(12,45,28,0.9)';
    c.stroke();
    c.beginPath();
    c.arc(p.dx, p.dy, p.dr + 1, 0, Math.PI * 2);
    c.lineWidth = 2;
    c.strokeStyle = 'rgba(90,170,120,0.55)';
    c.stroke();
    c.restore();
  }

  // Worsted cloth: a fine, even weave, brighter in pools under each lamp
  // and a shade darker towards the cushions.
  function cloth(c) {
    c.fillStyle = '#165A38';
    c.fillRect(0, 0, W, L);
    for (const lp of LAMPS) {
      const g = c.createRadialGradient(lp.x, lp.y, 0, lp.x, lp.y, 620);
      g.addColorStop(0, 'rgba(70,170,105,0.55)');
      g.addColorStop(0.5, 'rgba(50,145,90,0.25)');
      g.addColorStop(1, 'rgba(40,120,75,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, W, L);
    }
    // The weave.
    const tile = document.createElement('canvas');
    tile.width = tile.height = 96;
    const tc = tile.getContext('2d');
    const img = tc.createImageData(96, 96);
    const rnd = seeded(7);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = rnd();
      const light = v > 0.5;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = light ? 255 : 0;
      img.data[i + 3] = Math.round(Math.abs(v - 0.5) * 34);
    }
    tc.putImageData(img, 0, 0);
    const pat = c.createPattern(tile, 'repeat');
    if (pat.setTransform) pat.setTransform(new DOMMatrix().scale(1.6));
    c.fillStyle = pat;
    c.fillRect(0, 0, W, L);
    // Darker towards the cushions.
    const edge = (x0, y0, x1, y1) => {
      const g = c.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, 'rgba(0,0,0,0.28)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, W, L);
    };
    edge(0, 0, 0, 140); edge(0, L, 0, L - 140); edge(0, 0, 110, 0); edge(W, 0, W - 110, 0);
  }

  // A cushion: rubber under the same cloth as the bed, its rounded nose
  // catching the light and throwing a thin shadow onto the bed.
  function cushion(c, cu) {
    const [f0, f1] = cu.face;
    const [b0, b1] = cu.back;
    const mx = (f0[0] + f1[0]) / 2;
    const my = (f0[1] + f1[1]) / 2;
    // Square to the face, towards the rail.
    let fx = f1[1] - f0[1];
    let fy = f0[0] - f1[0];
    const fl = Math.hypot(fx, fy);
    fx /= fl; fy /= fl;
    if (fx * ((b0[0] + b1[0]) / 2 - mx) + fy * ((b0[1] + b1[1]) / 2 - my) < 0) { fx = -fx; fy = -fy; }
    const bx = mx + fx * J;
    const by = my + fy * J;
    const g = c.createLinearGradient(mx, my, bx, by);
    g.addColorStop(0, '#2A8656');
    g.addColorStop(0.18, '#1D6E44');
    g.addColorStop(0.7, '#175C38');
    g.addColorStop(1, '#0E3F26');
    c.fillStyle = g;
    poly(c, cu.pts);
    c.fill();
    const nl = Math.hypot(bx - mx, by - my);
    const nx = (bx - mx) / nl;
    const ny = (by - my) / nl;
    // Shadow on the bed along the face, and the lit top of the nose.
    c.save();
    c.beginPath();
    c.rect(0, 0, W, L);
    c.clip();
    const sh = c.createLinearGradient(mx, my, mx - nx * 10, my - ny * 10);
    sh.addColorStop(0, 'rgba(0,0,0,0.32)');
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = sh;
    poly(c, [[f0[0], f0[1]], [f1[0], f1[1]], [f1[0] - nx * 10, f1[1] - ny * 10], [f0[0] - nx * 10, f0[1] - ny * 10]]);
    c.fill();
    c.restore();
    c.strokeStyle = 'rgba(170,240,195,0.2)';
    c.lineWidth = 2.2;
    c.beginPath();
    const pts = cu.pts;
    const nose = pts.length - 2;     // the face and the rounded noses, not the jaws' backs
    for (let i = 0; i < nose; i++) {
      const [x, y] = pts[i];
      const inner = (x - mx) * nx + (y - my) * ny;
      if (inner > 9) continue;       // only the playing edge, not down the jaws
      (i === 0 || (pts[i - 1][0] - mx) * nx + (pts[i - 1][1] - my) * ny > 9) ? c.moveTo(x + nx * 2, y + ny * 2) : c.lineTo(x + nx * 2, y + ny * 2);
    }
    c.stroke();
    // Where the cushion meets the rail.
    c.strokeStyle = 'rgba(0,0,0,0.45)';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(b0[0], b0[1]); c.lineTo(b1[0], b1[1]);
    c.stroke();
  }

  /* ---------- Balls ---------- */

  // The shading every ball shares: light from above, falling off to a dark
  // rim, with a little green bounced up from the cloth.
  function ballShade(px) {
    const s = document.createElement('canvas');
    s.width = s.height = px;
    const c = s.getContext('2d');
    const r = px / 2;
    const g = c.createRadialGradient(r, r, 0, r, r, r);
    g.addColorStop(0, 'rgba(255,255,255,0.1)');
    g.addColorStop(0.45, 'rgba(0,0,0,0)');
    g.addColorStop(0.8, 'rgba(0,0,0,0.25)');
    g.addColorStop(0.94, 'rgba(0,10,4,0.55)');
    g.addColorStop(1, 'rgba(0,30,12,0.7)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(r, r, r, 0, Math.PI * 2);
    c.fill();
    return s;
  }

  // Rotate v by quaternion q = [w, x, y, z].
  function rot(q, v) {
    const [w, x, y, z] = q;
    const tx = 2 * (y * v[2] - z * v[1]);
    const ty = 2 * (z * v[0] - x * v[2]);
    const tz = 2 * (x * v[1] - y * v[0]);
    return [
      v[0] + w * tx + (y * tz - z * ty),
      v[1] + w * ty + (z * tx - x * tz),
      v[2] + w * tz + (x * ty - y * tx),
    ];
  }

  // Markings in the ball's own frame: a normal s and two axes across it
  // (e1 × e2 = −s, so text reads the right way round from outside).
  const EIGHT = [
    { s: [0, 0, -1], e1: [1, 0, 0], e2: [0, 1, 0] },
    { s: [0, 0, 1], e1: [1, 0, 0], e2: [0, -1, 0] },
  ];
  const DOTS = [
    { s: [0, 0, -1], e1: [1, 0, 0], e2: [0, 1, 0] },
    { s: [0, 0, 1], e1: [1, 0, 0], e2: [0, -1, 0] },
    { s: [1, 0, 0], e1: [0, 1, 0], e2: [0, 0, 1] },
  ];

  // Draw something printed on the ball: maps the disc's flat (p, q) onto
  // the sphere's surface as seen from above.
  function decal(b, x, y, r, k, m, paint) {
    const s = rot(b.q, m.s);
    if (s[2] > 0.2) return;          // round the far side
    const e1 = rot(b.q, m.e1);
    const e2 = rot(b.q, m.e2);
    const lift = Math.sqrt(Math.max(0, 1 - (r / R) ** 2)) * R * k;
    ctx.save();
    ctx.transform(e1[0] * k, e1[1] * k, e2[0] * k, e2[1] * k, x + s[0] * lift, y + s[1] * lift);
    paint();
    ctx.restore();
  }

  function ballArt(b, x, y, k = 1, dark = 0) {
    const r = R * k;
    const t = kind(b.id);
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = COL[t];
    ctx.fill();
    ctx.clip();
    if (t === 'black') {
      for (const m of EIGHT) {
        decal(b, x, y, R * 0.45, k, m, () => {
          ctx.fillStyle = '#F4F0E4';
          ctx.beginPath();
          ctx.arc(0, 0, R * 0.45, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#111';
          ctx.font = `700 ${R * 0.62}px Arial, Helvetica, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('8', 0, R * 0.04);
        });
      }
    } else if (t === 'cue') {
      for (const m of DOTS) {
        decal(b, x, y, R * 0.14, k, m, () => {
          ctx.fillStyle = '#C9182B';
          ctx.beginPath();
          ctx.arc(0, 0, R * 0.14, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    }
    ctx.drawImage(shade, x - r, y - r, r * 2, r * 2);
    // A highlight for each lamp, where its reflection would sit on a
    // sphere seen from straight above: halfway between "up" and the lamp.
    for (const lp of LAMPS) {
      let lx = lp.x - x;
      let ly = lp.y - y;
      let lz = LAMP_H;
      const ll = Math.hypot(lx, ly, lz);
      lx /= ll; ly /= ll; lz /= ll;
      const hl = Math.hypot(lx, ly, lz + 1);
      const hx = lx / hl;
      const hy = ly / hl;
      const near = Math.max(0, 1 - Math.hypot(lp.x - x, lp.y - y) / 1300);
      if (near <= 0) continue;
      const px = x + hx * r;
      const py = y + hy * r;
      const g = ctx.createRadialGradient(px, py, 0, px, py, r * 0.42);
      g.addColorStop(0, `rgba(255,252,240,${0.95 * near})`);
      g.addColorStop(0.25, `rgba(255,250,235,${0.5 * near})`);
      g.addColorStop(1, 'rgba(255,250,235,0)');
      ctx.fillStyle = g;
      ctx.fillRect(px - r, py - r, r * 2, r * 2);
    }
    if (dark) {
      ctx.fillStyle = `rgba(0,0,0,${dark})`;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.restore();
  }

  // Soft shadows: one from each lamp, falling away from it, and a dark
  // contact shadow right under the ball.
  function shadow(x, y) {
    for (const lp of LAMPS) {
      const dx = x - lp.x;
      const dy = y - lp.y;
      const k = R / (LAMP_H - R);
      const sx = x + dx * k * 1.6;
      const sy = y + dy * k * 1.6;
      const near = Math.max(0.15, 1 - Math.hypot(dx, dy) / 1400);
      const g = ctx.createRadialGradient(sx, sy, R * 0.3, sx, sy, R * 1.25);
      g.addColorStop(0, `rgba(0,0,0,${0.28 * near})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(sx, sy, R * 1.25, 0, Math.PI * 2);
      ctx.fill();
    }
    const g = ctx.createRadialGradient(x, y, 0, x, y, R * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0.45)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, R * 0.75, 0, Math.PI * 2);
    ctx.fill();
  }

  function ring(x, y, r, color, width, dash) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash || []);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /* ---------- The cue ---------- */

  // A one-piece pub cue drawn lying along +x from its tip: blue chalk on a
  // leather tip, a brass ferrule, an ash shaft, ebony splice points and butt.
  function makeCue() {
    const k = Math.max(0.4, view.s * dpr);
    const w = Math.ceil(CUE_LEN * k);
    const hgt = Math.ceil(30 * k);
    cueImg = document.createElement('canvas');
    cueImg.width = w;
    cueImg.height = hgt;
    const c = cueImg.getContext('2d');
    c.scale(k, k);
    const half = (d) => 4.7 + (d / CUE_LEN) * 9.8;   // 9.4 mm tip to 29 mm butt
    const mid = 15;
    const outline = (from, to) => {
      c.beginPath();
      c.moveTo(from, mid - half(from));
      c.lineTo(to, mid - half(to));
      c.lineTo(to, mid + half(to));
      c.lineTo(from, mid + half(from));
      c.closePath();
    };
    const band = (from, to, fill) => { outline(from, to); c.fillStyle = fill; c.fill(); };
    band(0, 3, '#4E7DB8');
    band(3, 11, '#5A3A22');
    const brass = c.createLinearGradient(0, mid - 6, 0, mid + 6);
    brass.addColorStop(0, '#8C6A22'); brass.addColorStop(0.35, '#F3D98A'); brass.addColorStop(1, '#6E5218');
    band(11, 26, brass);
    band(26, 1000, '#DDB679');
    // Ash grain.
    c.save();
    outline(26, 1000);
    c.clip();
    const rnd = seeded(31);
    for (let i = 0; i < 46; i++) {
      const y = mid + (rnd() - 0.5) * 22;
      const x0 = 26 + rnd() * 900;
      c.strokeStyle = `rgba(110,65,25,${0.15 + rnd() * 0.3})`;
      c.lineWidth = 0.3 + rnd() * 0.8;
      c.beginPath();
      c.moveTo(x0, y);
      c.bezierCurveTo(x0 + 80, y + (rnd() - 0.5) * 2, x0 + 160, y + (rnd() - 0.5) * 2, x0 + 120 + rnd() * 260, y);
      c.stroke();
    }
    c.restore();
    // Ebony butt with splice points reaching into the shaft.
    band(1000, 1425, '#1D1410');
    c.fillStyle = '#1D1410';
    for (const off of [-1, 0, 1]) {
      c.beginPath();
      c.moveTo(1000, mid + off * half(1000) - (off ? 0 : half(1000)) * 0.6);
      c.lineTo(820, mid + off * half(820) * 0.85);
      c.lineTo(1000, mid + off * half(1000) + (off ? 0 : half(1000)) * 0.6);
      c.closePath();
      c.fill();
    }
    band(1110, 1116, '#C9B48A');
    band(1425, CUE_LEN, '#0A0A0A');
    // Round it: dark edges, a highlight along the top.
    c.save();
    outline(0, CUE_LEN);
    c.clip();
    const g = c.createLinearGradient(0, mid - 15, 0, mid + 15);
    g.addColorStop(0, 'rgba(0,0,0,0.55)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.28)');
    g.addColorStop(0.42, 'rgba(255,255,255,0.05)');
    g.addColorStop(0.75, 'rgba(0,0,0,0.2)');
    g.addColorStop(1, 'rgba(0,0,0,0.6)');
    c.fillStyle = g;
    c.fillRect(0, 0, CUE_LEN, 30);
    c.restore();

    // Its shadow: the same shape in black.
    cueShadow = document.createElement('canvas');
    cueShadow.width = w;
    cueShadow.height = hgt;
    const sc = cueShadow.getContext('2d');
    sc.drawImage(cueImg, 0, 0);
    sc.globalCompositeOperation = 'source-in';
    sc.fillStyle = '#000';
    sc.fillRect(0, 0, w, hgt);
  }

  function cue(G, pull, alpha, from) {
    const c = from || G.balls[0];
    const dx = Math.cos(G.aim);
    const dy = Math.sin(G.aim);
    const lat = G.spin.x * R * 0.55;
    const lift = G.spin.y * R * 0.55;
    const tip = Math.sqrt(Math.max(0, R * R - lat * lat - lift * lift)) + 3 + pull;
    const tx = c.x - dx * tip - dy * lat;
    const ty = c.y - dy * tip + dx * lat;
    const ang = Math.atan2(-dy, -dx);
    // The cue rides a hand's height above the cloth, so its shadow falls
    // further out than a ball's.
    const lp = LAMPS.reduce((a, b) => (Math.abs(b.y - ty) < Math.abs(a.y - ty) ? b : a));
    const sdx = tx - lp.x;
    const sdy = ty - lp.y;
    const sl = Math.hypot(sdx, sdy) || 1;
    ctx.save();
    ctx.globalAlpha = alpha * 0.32;
    ctx.translate(tx + (sdx / sl) * 26, ty + (sdy / sl) * 26);
    ctx.rotate(ang);
    ctx.drawImage(cueShadow, 0, -15, CUE_LEN, 30);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(tx, ty);
    ctx.rotate(ang);
    ctx.drawImage(cueImg, 0, -15, CUE_LEN, 30);
    ctx.restore();
  }

  /* ---------- Aiming ---------- */

  function guide(G, px) {
    const balls = G.balls;
    const c = balls[0];
    const dx = Math.cos(G.aim);
    const dy = Math.sin(G.aim);
    const mode = G.settings.guide;
    const hit = phys.firstHit(balls, c.x, c.y, dx, dy, (b) => b.id === 0);
    const wt = phys.wallDist(c.x, c.y, dx, dy);
    const on = G.onSet;
    ctx.lineWidth = px * 1.4;
    ctx.lineCap = 'round';
    if (hit && hit.t <= wt) {
      const gx = c.x + dx * hit.t;
      const gy = c.y + dy * hit.t;
      const good = !on || on.has(hit.b.id);
      const col = good ? 'rgba(255,255,255,0.7)' : 'rgba(255,90,90,0.95)';
      ctx.strokeStyle = col;
      ctx.beginPath();
      ctx.moveTo(c.x + dx * R, c.y + dy * R);
      ctx.lineTo(gx, gy);
      ctx.stroke();
      ring(gx, gy, R, col, px * 1.4);
      if (!good) {
        const k = R * 0.5;
        ctx.strokeStyle = col;
        ctx.beginPath();
        ctx.moveTo(gx - k, gy - k); ctx.lineTo(gx + k, gy + k);
        ctx.moveTo(gx + k, gy - k); ctx.lineTo(gx - k, gy + k);
        ctx.stroke();
      }
      if (mode !== 'off' && good) {
        const b = hit.b;
        const nx = (b.x - gx) / D;
        const ny = (b.y - gy) / D;
        const cos = Math.max(0, dx * nx + dy * ny);
        const len = (mode === 'long' ? 420 : 140) * (0.35 + 0.65 * cos);
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath();
        ctx.moveTo(b.x + nx * R, b.y + ny * R);
        ctx.lineTo(b.x + nx * (R + len), b.y + ny * (R + len));
        ctx.stroke();
        if (mode === 'long') {
          let tx = dx - nx * (dx * nx + dy * ny);
          let ty = dy - ny * (dx * nx + dy * ny);
          const tl = Math.hypot(tx, ty);
          if (tl > 0.02) {
            tx /= tl; ty /= tl;
            const l2 = 200 * tl;
            ctx.strokeStyle = 'rgba(255,255,255,0.3)';
            ctx.setLineDash([px * 5, px * 5]);
            ctx.beginPath();
            ctx.moveTo(gx, gy);
            ctx.lineTo(gx + tx * l2, gy + ty * l2);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }
      }
    } else {
      const ex = c.x + dx * wt;
      const ey = c.y + dy * wt;
      ctx.strokeStyle = 'rgba(255,255,255,0.65)';
      ctx.beginPath();
      ctx.moveTo(c.x + dx * R, c.y + dy * R);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ring(ex, ey, R, 'rgba(255,255,255,0.45)', px * 1.3);
      if (mode === 'long') {
        let rx = dx;
        let ry = dy;
        if (ex <= R + 0.5 || ex >= W - R - 0.5) rx = -rx;
        if (ey <= R + 0.5 || ey >= L - R - 0.5) ry = -ry;
        const t2 = Math.min(260, phys.wallDist(ex, ey, rx, ry));
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.setLineDash([px * 5, px * 5]);
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex + rx * t2, ey + ry * t2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  /* ---------- A frame ---------- */

  function draw(G, now) {
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(bg, 0, 0);
    if (!G.balls) return;
    worldTransform(ctx);
    const px = 1 / view.s;      // one screen pixel, in mm
    const balls = G.balls;
    const st = G.st;
    const human = G.phase === 'aim';
    const pulse = 0.5 + 0.5 * Math.sin(now / 220);

    if (human && st.inHand) {
      ctx.fillStyle = `rgba(255,255,255,${0.03 + pulse * 0.03})`;
      ctx.fillRect(0, BAULK, W, L - BAULK);
      ctx.strokeStyle = 'rgba(255,255,255,0.65)';
      ctx.lineWidth = px * 2;
      ctx.beginPath();
      ctx.moveTo(0, BAULK); ctx.lineTo(W, BAULK);
      ctx.stroke();
    }

    for (const b of balls) if (b.on) shadow(b.x, b.y);
    if (G.showAim && G.settings.guide !== 'none') {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W, L);
      ctx.clip();
      guide(G, px);
      ctx.restore();
    }

    // Balls dropping: they carry on a little way, then fall away into the dark.
    for (const a of G.anims) {
      const k = Math.min(1, a.t / 0.4);
      const p = pockets[a.pocket];
      const sp = Math.hypot(a.vx, a.vy) || 1;
      const run = Math.min(30, sp * 0.02) * Math.min(1, k * 3);
      const ax = a.x + (a.vx / sp) * run;
      const ay = a.y + (a.vy / sp) * run;
      const x = ax + (p.x - ax) * k * 0.5;
      const y = ay + (p.y - ay) * k * 0.5;
      ctx.save();
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r - 3, 0, Math.PI * 2);
      ctx.rect(0, 0, W, L);
      ctx.clip();
      ballArt(balls[a.id], x, y, 1 - k * 0.3, Math.min(0.95, k * 1.2));
      ctx.restore();
    }

    for (const b of balls) if (b.on) ballArt(b, b.x, b.y);

    if (human && st.inHand) {
      const c = balls[0];
      ring(c.x, c.y, R * (1.55 + pulse * 0.2), 'rgba(255,255,255,0.75)', px * 2, [px * 6, px * 5]);
    }
    if (st.nominated !== null && balls[st.nominated].on) {
      const b = balls[st.nominated];
      ring(b.x, b.y, R * 1.35, '#FFD54A', px * 2.5);
    }
    if (G.nominating) {
      for (const b of G.nominable) ring(b.x, b.y, R * (1.3 + pulse * 0.25), 'rgba(255,213,74,0.9)', px * 2, [px * 5, px * 4]);
    }

    if (G.phase === 'stroke' && G.stroke) {
      const k = Math.min(1, G.stroke.t / G.stroke.dur);
      cue(G, G.stroke.pull * (1 - k * k), 1);
    } else if (G.showAim) {
      cue(G, 10 + G.power * 150, 1);
    } else if (G.strike) {
      // Follow through, then the player stands up and the cue leaves the table.
      const t = (now - G.strike.t) / 1000;
      const k = Math.min(1, t / 0.5);
      if (k < 1) {
        const through = -Math.min(1, t / 0.08) * (8 + G.strike.power * 40);
        cue(G, through - Math.max(0, t - 0.25) * 600, 1 - Math.max(0, (k - 0.5) * 2), G.strike);
      }
    }
  }

  EB.render = { init, resize, draw, toWorld, toScreen, view, COL };
})(window.EB = window.EB || {});
