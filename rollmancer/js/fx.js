/* Rollmancer — particles, floating numbers, rings, lightning, projectiles
   and screen shake, all drawn on the scene canvas. */
(function (RM) {
  'use strict';

  const TAU = Math.PI * 2;
  const fx = {
    parts: [],
    texts: [],
    rings: [],
    bolts: [],
    shots: [],
    shake: 0,
    flash: 0,
    flashCol: '#ffffff',
    scale: 1, // particle count multiplier (reduced motion lowers it)
  };

  fx.clear = function () {
    fx.parts.length = 0;
    fx.texts.length = 0;
    fx.rings.length = 0;
    fx.bolts.length = 0;
    fx.shots.length = 0;
    fx.shake = 0;
    fx.flash = 0;
  };

  fx.burst = function (x, y, n, o) {
    o = o || {};
    n = Math.max(1, Math.round(n * fx.scale));
    for (let i = 0; i < n; i++) {
      const a = o.angle != null ? o.angle + (Math.random() - 0.5) * (o.spread || 1) : Math.random() * TAU;
      const sp = (o.speed || 220) * (0.35 + Math.random() * 0.8);
      const cols = Array.isArray(o.color) ? o.color : [o.color || '#ffe28a'];
      fx.parts.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - (o.up || 0),
        life: (o.life || 0.7) * (0.6 + Math.random() * 0.6),
        age: 0,
        size: (o.size || 4) * (0.6 + Math.random() * 0.8),
        color: cols[Math.floor(Math.random() * cols.length)],
        g: o.gravity == null ? 380 : o.gravity,
        drag: o.drag == null ? 2.2 : o.drag,
        kind: o.kind || 'spark',
        rot: Math.random() * TAU,
        vr: (Math.random() - 0.5) * 10,
        tx: o.tx, ty: o.ty, home: o.home || 0,
      });
    }
  };

  fx.text = function (x, y, str, o) {
    o = o || {};
    fx.texts.push({
      x, y, str,
      color: o.color || '#fff',
      size: o.size || 22,
      life: o.life || 0.9,
      age: 0,
      vy: o.vy == null ? -60 : o.vy,
      stroke: o.stroke || 'rgba(10,5,20,0.85)',
      pop: o.pop == null ? 1 : o.pop,
      font: o.font || 'Lilita One',
    });
  };

  fx.ring = function (x, y, r0, r1, color, life, width) {
    fx.rings.push({ x, y, r0, r1, color, life: life || 0.5, age: 0, width: width || 6 });
  };

  fx.bolt = function (x0, y0, x1, y1, color, life) {
    const pts = [];
    const n = 9;
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      const j = i === 0 || i === n ? 0 : (Math.random() - 0.5) * 34;
      pts.push([x0 + (x1 - x0) * k + j, y0 + (y1 - y0) * k + j * 0.4]);
    }
    fx.bolts.push({ pts, color, life: life || 0.25, age: 0 });
  };

  // A glowing orb that arcs from (x0,y0) to (x1,y1) then calls onHit.
  fx.shot = function (x0, y0, x1, y1, o) {
    fx.shots.push({
      x0, y0, x1, y1, age: 0,
      dur: o.dur || 0.45,
      color: o.color || '#ffe28a',
      size: o.size || 14,
      arc: o.arc == null ? 80 : o.arc,
      onHit: o.onHit,
      x: x0, y: y0,
    });
  };

  fx.kick = function (amount) {
    fx.shake = Math.min(28, fx.shake + amount * fx.scale);
  };
  fx.flashScreen = function (col, amt) {
    fx.flashCol = col || '#fff';
    fx.flash = Math.max(fx.flash, (amt || 0.4) * fx.scale);
  };

  fx.update = function (dt) {
    for (let i = fx.parts.length - 1; i >= 0; i--) {
      const p = fx.parts[i];
      p.age += dt;
      if (p.age >= p.life) { fx.parts.splice(i, 1); continue; }
      if (p.home && p.tx != null) {
        // drift toward a target (coins flying to the gold counter)
        const k = Math.min(1, p.age / p.life);
        const pull = p.home * k * k;
        p.vx += (p.tx - p.x) * pull * dt;
        p.vy += (p.ty - p.y) * pull * dt;
      }
      p.vx *= Math.exp(-p.drag * dt);
      p.vy = p.vy * Math.exp(-p.drag * dt) + p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
    for (let i = fx.texts.length - 1; i >= 0; i--) {
      const t = fx.texts[i];
      t.age += dt;
      t.y += t.vy * dt;
      t.vy *= Math.exp(-2.5 * dt);
      if (t.age >= t.life) fx.texts.splice(i, 1);
    }
    for (let i = fx.rings.length - 1; i >= 0; i--) {
      fx.rings[i].age += dt;
      if (fx.rings[i].age >= fx.rings[i].life) fx.rings.splice(i, 1);
    }
    for (let i = fx.bolts.length - 1; i >= 0; i--) {
      fx.bolts[i].age += dt;
      if (fx.bolts[i].age >= fx.bolts[i].life) fx.bolts.splice(i, 1);
    }
    for (let i = fx.shots.length - 1; i >= 0; i--) {
      const s = fx.shots[i];
      s.age += dt;
      const k = Math.min(1, s.age / s.dur);
      const e = k * k * (3 - 2 * k);
      s.x = s.x0 + (s.x1 - s.x0) * e;
      s.y = s.y0 + (s.y1 - s.y0) * e - Math.sin(k * Math.PI) * s.arc;
      if (Math.random() < 0.9) {
        fx.parts.push({ x: s.x, y: s.y, vx: (Math.random() - 0.5) * 40, vy: (Math.random() - 0.5) * 40, life: 0.35, age: 0,
          size: s.size * 0.5, color: s.color, g: 0, drag: 3, kind: 'circle', rot: 0, vr: 0 });
      }
      if (k >= 1) {
        fx.shots.splice(i, 1);
        if (s.onHit) s.onHit(s.x1, s.y1);
      }
    }
    fx.shake = Math.max(0, fx.shake - dt * 60);
    fx.flash = Math.max(0, fx.flash - dt * 2.2);
  };

  fx.shakeOffset = function () {
    if (fx.shake <= 0.1) return [0, 0];
    return [(Math.random() - 0.5) * fx.shake, (Math.random() - 0.5) * fx.shake];
  };

  fx.draw = function (ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    fx.rings.forEach((r) => {
      const k = r.age / r.life;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * RM.easeOut(k), 0, TAU);
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = (1 - k) * 0.9;
      ctx.lineWidth = r.width * (1 - k * 0.6);
      ctx.stroke();
    });
    fx.bolts.forEach((b) => {
      const k = b.age / b.life;
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 5;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      b.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    });
    fx.parts.forEach((p) => {
      const k = p.age / p.life;
      ctx.globalAlpha = 1 - k * k;
      ctx.fillStyle = p.color;
      if (p.kind === 'spark') {
        const len = Math.min(18, Math.hypot(p.vx, p.vy) * 0.04 + p.size);
        const a = Math.atan2(p.vy, p.vx);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(a);
        ctx.fillRect(-len, -p.size * 0.35, len * 2, p.size * 0.7);
        ctx.restore();
      } else if (p.kind === 'star') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        RM.art.star(ctx, 4, p.size * 1.6, p.size * 0.5, 0);
        ctx.fill();
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 - k * 0.5), 0, TAU);
        ctx.fill();
      }
    });
    fx.shots.forEach((s) => {
      const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.size * 2.2);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.3, s.color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size * 2.2, 0, TAU);
      ctx.fill();
    });
    ctx.restore();

    // Coins are drawn solid (not additive) so they read as gold.
    fx.parts.forEach((p) => {
      if (p.kind !== 'coin') return;
      const k = p.age / p.life;
      ctx.save();
      ctx.globalAlpha = 1 - k * k * k;
      ctx.translate(p.x, p.y);
      ctx.scale(Math.abs(Math.cos(p.rot)) * 0.8 + 0.2, 1);
      ctx.beginPath();
      ctx.arc(0, 0, p.size, 0, TAU);
      ctx.fillStyle = '#ffcc3d';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#8f6205';
      ctx.stroke();
      ctx.restore();
    });

    fx.texts.forEach((t) => {
      const k = t.age / t.life;
      const pop = t.pop ? 1 + (1 - RM.easeOut(Math.min(1, t.age / 0.18))) * 0.6 * t.pop : 1;
      ctx.save();
      ctx.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      ctx.translate(t.x, t.y);
      ctx.scale(pop, pop);
      ctx.font = t.size + 'px "' + t.font + '", "Nunito", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = Math.max(3, t.size * 0.18);
      ctx.lineJoin = 'round';
      ctx.strokeStyle = t.stroke;
      ctx.strokeText(t.str, 0, 0);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, 0, 0);
      ctx.restore();
    });
  };

  fx.drawFlash = function (ctx, w, h) {
    if (fx.flash <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = Math.min(0.6, fx.flash);
    ctx.fillStyle = fx.flashCol;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  };

  RM.fx = fx;
})(window.RM);
