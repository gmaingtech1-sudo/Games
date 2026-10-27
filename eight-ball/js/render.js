/* Eight-Ball — drawing. The table stands long-ways on a portrait screen and
   turns on its side (baulk to the left) on a landscape one. The cloth, rails
   and pockets are baked once per resize; balls, guides and the cue are drawn
   every frame on top. */
(function (EB) {
  'use strict';

  const { TABLE, kind, phys } = EB;
  const { W, L, R, D, BAULK, SPOT, pockets, cushions } = TABLE;
  const PAD = 82;
  const RAIL = 78;

  const COL = {
    red: '#D3232E',
    yellow: '#F4C21B',
    black: '#141518',
    cue: '#F6F2E6',
    cloth: '#1E7449',
    cushion: '#155B37',
    wood: ['#5A2E14', '#7A421E', '#4A240F'],
  };

  let cv = null;
  let ctx = null;
  let bg = null;
  let dpr = 1;
  let cw = 0;
  let ch = 0;
  const view = { s: 1, a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, land: false, up: { x: 0, y: -1 }, left: { x: -1, y: 0 } };

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
      view.up = { x: 0, y: -1 };
      view.left = { x: -1, y: 0 };
    } else {
      const s = Math.min(cw / (L + 2 * PAD), ch / (W + 2 * PAD));
      Object.assign(view, { s, a: 0, b: s, c: -s, d: 0, e: cw / 2 + s * L / 2, f: ch / 2 - s * W / 2 });
      view.up = { x: -1, y: 0 };
      view.left = { x: 0, y: 1 };
    }
    bake();
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

  /* ---------- The table ---------- */

  function bake() {
    const c = bg.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, bg.width, bg.height);
    worldTransform(c);

    // Shadow under the table, then the wooden rails.
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.55)';
    c.shadowBlur = 40 * view.s * dpr;
    c.fillStyle = COL.wood[2];
    c.beginPath();
    c.roundRect(-RAIL, -RAIL, W + 2 * RAIL, L + 2 * RAIL, 34);
    c.fill();
    c.restore();
    const wood = c.createLinearGradient(-RAIL, 0, W + RAIL, 0);
    wood.addColorStop(0, COL.wood[0]);
    wood.addColorStop(0.5, COL.wood[1]);
    wood.addColorStop(1, COL.wood[0]);
    c.fillStyle = wood;
    c.beginPath();
    c.roundRect(-RAIL + 4, -RAIL + 4, W + 2 * RAIL - 8, L + 2 * RAIL - 8, 30);
    c.fill();
    // Grain.
    c.strokeStyle = 'rgba(0,0,0,0.12)';
    c.lineWidth = 1.2;
    for (let i = 0; i < 26; i++) {
      const o = -RAIL + 8 + i * 6 + (i % 3);
      c.beginPath();
      c.moveTo(o, -RAIL + 20); c.lineTo(o, L + RAIL - 20);
      c.moveTo(W - o, -RAIL + 20); c.lineTo(W - o, L + RAIL - 20);
      c.stroke();
    }
    // Sights along the rails.
    c.fillStyle = '#E9DFC6';
    const sight = (x, y) => { c.beginPath(); c.arc(x, y, 5, 0, Math.PI * 2); c.fill(); };
    for (let k = 1; k < 8; k++) if (k !== 4) { sight(-58, L * k / 8); sight(W + 58, L * k / 8); }
    for (let k = 1; k < 4; k++) { sight(W * k / 4, -58); sight(W * k / 4, L + 58); }

    // Pockets.
    for (const p of pockets) {
      const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
      g.addColorStop(0, '#000');
      g.addColorStop(0.75, '#08090A');
      g.addColorStop(1, '#2A2420');
      c.fillStyle = g;
      c.beginPath();
      c.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      c.fill();
    }

    // Cloth, with a soft light in the middle and a little nap.
    const cloth = c.createRadialGradient(W / 2, L / 2, 50, W / 2, L / 2, L * 0.62);
    cloth.addColorStop(0, '#24854F');
    cloth.addColorStop(1, '#185E3A');
    c.fillStyle = cloth;
    c.fillRect(0, 0, W, L);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 4200; i++) {
      c.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.05)';
      c.fillRect(rnd() * W, rnd() * L, 2.5, 2.5);
    }

    // Baulk line and spot.
    c.strokeStyle = 'rgba(255,255,255,0.32)';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(0, BAULK); c.lineTo(W, BAULK);
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.45)';
    c.beginPath();
    c.arc(SPOT.x, SPOT.y, 3.5, 0, Math.PI * 2);
    c.fill();

    // Cushions, with a highlight along the nose.
    for (const cu of cushions) {
      c.fillStyle = COL.cushion;
      poly(c, cu);
      c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.13)';
      c.lineWidth = 2.5;
      c.beginPath();
      c.moveTo(cu[0][0], cu[0][1]); c.lineTo(cu[1][0], cu[1][1]);
      c.stroke();
      c.strokeStyle = 'rgba(0,0,0,0.35)';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(cu[1][0], cu[1][1]); c.lineTo(cu[2][0], cu[2][1]);
      c.moveTo(cu[3][0], cu[3][1]); c.lineTo(cu[0][0], cu[0][1]);
      c.stroke();
    }
  }

  /* ---------- Balls ---------- */

  function shadow(x, y) {
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath();
    ctx.arc(x - view.up.x * R * 0.28 - view.left.x * R * 0.12, y - view.up.y * R * 0.28 - view.left.y * R * 0.12, R * 1.02, 0, Math.PI * 2);
    ctx.fill();
  }

  function ballArt(id, x, y, k = 1, alpha = 1) {
    const r = R * k;
    const t = kind(id);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = COL[t];
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    if (t === 'black') {
      ctx.fillStyle = '#F6F2E6';
      ctx.beginPath();
      ctx.arc(x, y, r * 0.48, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.translate(x, y);
      if (view.land) ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = '#141518';
      ctx.font = `700 ${r * 0.72}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('8', 0, r * 0.04);
      ctx.restore();
    }
    const hx = x + (view.up.x * 0.42 + view.left.x * 0.3) * r;
    const hy = y + (view.up.y * 0.42 + view.left.y * 0.3) * r;
    const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, r * 1.75);
    g.addColorStop(0, 'rgba(255,255,255,0.7)');
    g.addColorStop(0.12, 'rgba(255,255,255,0.18)');
    g.addColorStop(0.45, 'rgba(255,255,255,0)');
    g.addColorStop(0.8, 'rgba(0,0,0,0.22)');
    g.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
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
    ctx.lineWidth = px * 1.6;
    ctx.lineCap = 'round';
    if (hit && hit.t <= wt) {
      const gx = c.x + dx * hit.t;
      const gy = c.y + dy * hit.t;
      const good = !on || on.has(hit.b.id);
      const col = good ? 'rgba(255,255,255,0.85)' : 'rgba(255,90,90,0.95)';
      ctx.strokeStyle = col;
      ctx.beginPath();
      ctx.moveTo(c.x + dx * R, c.y + dy * R);
      ctx.lineTo(gx, gy);
      ctx.stroke();
      ring(gx, gy, R, col, px * 1.6);
      if (!good) {
        // A cross through the ghost ball: this would be a foul.
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
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
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
            ctx.strokeStyle = 'rgba(255,255,255,0.35)';
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
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath();
      ctx.moveTo(c.x + dx * R, c.y + dy * R);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ring(ex, ey, R, 'rgba(255,255,255,0.5)', px * 1.4);
      if (mode === 'long') {
        let rx = dx;
        let ry = dy;
        if (ex <= R + 0.5 || ex >= W - R - 0.5) rx = -rx;
        if (ey <= R + 0.5 || ey >= L - R - 0.5) ry = -ry;
        const t2 = Math.min(260, phys.wallDist(ex, ey, rx, ry));
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.setLineDash([px * 5, px * 5]);
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex + rx * t2, ey + ry * t2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  function cue(G, pull, alpha, from) {
    const c = from || G.balls[0];
    const dx = Math.cos(G.aim);
    const dy = Math.sin(G.aim);
    const rx = -dy;
    const ry = dx;
    const lat = G.spin.x * R * 0.55;
    const tip = R + 6 + pull;
    const tx = c.x - dx * tip + rx * lat;
    const ty = c.y - dy * tip + ry * lat;
    const seg = (from, to, w0, w1, fill) => {
      const ax = tx - dx * from;
      const ay = ty - dy * from;
      const bx = tx - dx * to;
      const by = ty - dy * to;
      ctx.fillStyle = fill;
      poly(ctx, [[ax + rx * w0, ay + ry * w0], [bx + rx * w1, by + ry * w1], [bx - rx * w1, by - ry * w1], [ax - rx * w0, ay - ry * w0]]);
      ctx.fill();
    };
    const wAt = (d) => 3.6 + (d / 1450) * 5.4;
    ctx.globalAlpha = alpha * 0.35;
    ctx.save();
    ctx.translate(-view.up.x * 14 - view.left.x * 8, -view.up.y * 14 - view.left.y * 8);
    seg(0, 1450, wAt(0), wAt(1450), '#000');
    ctx.restore();
    ctx.globalAlpha = alpha;
    seg(0, 4, 3.4, 3.5, '#3E6FB0');               // chalked tip
    seg(4, 18, 3.5, wAt(18), '#F1EAD8');          // ferrule
    seg(18, 980, wAt(18), wAt(980), '#D9B57E');   // maple shaft
    seg(980, 1010, wAt(980), wAt(1010), '#1C1C1C');
    seg(1010, 1400, wAt(1010), wAt(1400), '#5B2A16'); // butt
    seg(1400, 1450, wAt(1400), wAt(1450), '#1C1C1C');
    ctx.globalAlpha = 1;
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
      ctx.fillStyle = `rgba(255,255,255,${0.04 + pulse * 0.03})`;
      ctx.fillRect(0, BAULK, W, L - BAULK);
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = px * 2;
      ctx.beginPath();
      ctx.moveTo(0, BAULK); ctx.lineTo(W, BAULK);
      ctx.stroke();
    }

    for (const b of balls) if (b.on) shadow(b.x, b.y);
    if (G.showAim) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W, L);
      ctx.clip();
      guide(G, px);
      ctx.restore();
    }

    for (const b of balls) if (b.on) ballArt(b.id, b.x, b.y);

    // Balls dropping into pockets.
    for (const a of G.anims) {
      const k = Math.min(1, a.t / 0.28);
      const p = pockets[a.pocket];
      ballArt(a.id, a.x + (p.x - a.x) * k, a.y + (p.y - a.y) * k, 1 - k * 0.35, 1 - k * 0.9);
    }

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

    if (G.showAim) cue(G, 10 + G.power * 150, 1);
    else if (G.strike) {
      const k = Math.min(1, (now - G.strike.t) / 260);
      if (k < 1) cue(G, Math.max(0, 1 - k * 4) * G.strike.pull, 1 - k, G.strike);
    }
  }

  EB.render = { init, resize, draw, toWorld, toScreen, view, COL };
})(window.EB = window.EB || {});
