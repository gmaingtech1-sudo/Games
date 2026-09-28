/* Starforge — your guns and specials: firing patterns, the plasma beam, arc
   lightning, homing missiles, the nova shockwave, the aegis bubble and wing
   drones. Player shots point up; angle 0 is straight ahead. */
(function (SF) {
  'use strict';

  const U = SF.util;
  const A = SF.audio;
  const ART = SF.art.ART;
  const TAU = U.TAU;

  // Pulse Blaster streams per power level: [x offset, angle].
  const PULSE = [
    [[0, 0]],
    [[-5, 0], [5, 0]],
    [[-8, 0], [0, 0], [8, 0]],
    [[-9, -0.05], [-3, 0], [3, 0], [9, 0.05]],
    [[-11, -0.11], [-5, -0.03], [0, 0], [5, 0.03], [11, 0.11]],
  ];

  function shot(G, x, y, ang, speed, o) {
    G.pb.push({
      x, y, ang,
      vx: Math.sin(ang) * speed, vy: -Math.cos(ang) * speed,
      dmg: o.dmg, r: o.r || 4, kind: o.kind, life: o.life || 1.6,
      hits: o.pierce ? [] : null, len: o.len || 16, w: o.w || 6,
    });
  }

  function muzzle(G, x, y, color, size) {
    G.fx.glow(x, y, size || 7, color, 0.06, { grow: 0.2 });
  }

  function targetable(e) {
    return e.alive && e.onScreen && !e.invuln && !e.dying;
  }

  function nearest(G, x, y, range, skip) {
    let best = null;
    let bd = range * range;
    for (const e of G.enemies) {
      if (!targetable(e) || (skip && skip.has(e))) continue;
      const d = U.dist2(x, y, e.x, e.y);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  function level(p) {
    return p.overdrive > 0 ? 5 : p.power;
  }

  /* ---------- Primary fire ---------- */

  function fire(G, p, dt) {
    const st = p.st;
    const lvl = level(p);
    const rate = st.rate * (p.overdrive > 0 ? 2 : 1);
    const dmg = st.dmg;
    const col = p.R.energy;
    const gx = p.x + p.gun.x * ART;
    const gy = p.y + p.gun.y * ART;
    p.cool -= dt * rate;
    switch (st.weapon) {
      case 'scatter':
        if (p.cool <= 0) {
          p.cool += 0.22;
          const n = 1 + lvl * 2;
          const spread = 0.18 + lvl * 0.13;
          for (let i = 0; i < n; i++) {
            const a = (i / (n - 1) - 0.5) * spread + U.rand(-0.03, 0.03);
            shot(G, gx, gy, a, U.rand(620, 720), { dmg: 8.5 * dmg, kind: 'pellet', r: 4.5, life: 0.55 });
          }
          muzzle(G, gx, gy, col, 10);
          A.play('scatter');
        }
        break;
      case 'rail':
        if (p.cool <= 0) {
          p.cool += 0.55;
          const d = (60 + 20 * (lvl - 1)) * dmg;
          shot(G, gx, gy, 0, 1500, { dmg: d, kind: 'slug', pierce: true, r: 6, len: 46, w: 11 });
          if (lvl >= 3) {
            for (const s of [-1, 1]) {
              shot(G, gx + s * 10, gy + 8, lvl >= 5 ? s * 0.05 : 0, 1500, { dmg: d * 0.5, kind: 'slug', pierce: true, r: 5, len: 32, w: 8 });
            }
          }
          muzzle(G, gx, gy, col, 14);
          G.shake = Math.max(G.shake, 1.5);
          A.play('rail');
        }
        break;
      case 'beam':
        beam(G, p, dt, lvl);
        break;
      case 'arc':
        if (p.cool <= 0) {
          p.cool += 0.3;
          zap(G, gx, gy, 1 + lvl, (26 + 4 * (lvl - 1)) * dmg);
        }
        break;
      default:
        if (p.cool <= 0) {
          p.cool += 0.12;
          for (const [ox, a] of PULSE[lvl - 1]) {
            shot(G, gx + ox, gy + Math.abs(ox) * 0.5, a, 820, { dmg: 10 * dmg, kind: 'bolt', r: 4, len: 18, w: 7 });
          }
          muzzle(G, gx, gy, col, 6);
          A.play('pulse');
        }
    }
    if (p.cool < -0.1) p.cool = 0;

    // Built-in side cannons (Manta) and wingtip pods (Twin Pods).
    if (p.guns.length) {
      p.sideCool -= dt * rate;
      if (p.sideCool <= 0) {
        p.sideCool = Math.max(0, p.sideCool + 0.3);
        for (const g of p.guns) {
          shot(G, p.x + g.x * ART, p.y + g.y * ART, 0, 760, { dmg: 6 * dmg, kind: 'mini', r: 3, len: 12, w: 5 });
        }
        A.play('side');
      }
    }
  }

  function beam(G, p, dt, lvl) {
    const w = 5 + 2.6 * lvl;
    const dps = (95 + 40 * (lvl - 1)) * p.st.dmg * p.st.rate * (p.overdrive > 0 ? 1.5 : 1);
    const x = p.x;
    const y0 = p.y + p.gun.y * ART;
    let hit = null;
    let top = -30;
    for (const e of G.enemies) {
      if (!e.alive || !e.onScreen || e.dying || e.y > y0) continue;
      const hw = e.box ? e.box.hw : e.r;
      if (Math.abs(e.x - x) > hw + w * 0.5) continue;
      const bottom = Math.min(y0, e.box ? e.y + e.box.hh : e.y + e.r * 0.6);
      // The closest ship to you blocks the beam.
      if (bottom > top) {
        top = bottom;
        hit = e;
      }
    }
    p.beam = { x, y0, y1: hit ? top : -30, w, hit: !!hit };
    if (hit) {
      G.hit(hit, dps * dt, x, top, true);
      if (Math.random() < 0.5) G.fx.spray(x, top, -Math.PI / 2, 2.4, p.R.energy, 1, 220);
    }
  }

  function zap(G, x, y, jumps, dmg) {
    const first = nearest(G, x, y, 250);
    if (!first) {
      G.arcs.push({ pts: [[x, y], [x + U.rand(-14, 14), y - U.rand(40, 70)]], t: 0.08, max: 0.08 });
      return;
    }
    const used = new Set();
    const pts = [[x, y]];
    let cur = first;
    let d = dmg;
    while (cur && jumps-- > 0) {
      used.add(cur);
      pts.push([cur.x, cur.y]);
      G.hit(cur, d, cur.x, cur.y);
      d *= 0.85;
      cur = nearest(G, cur.x, cur.y, 130, used);
    }
    G.arcs.push({ pts, t: 0.13, max: 0.13 });
    A.play('arc');
  }

  /* ---------- Specials ---------- */

  function special(G, p) {
    const col = p.R.energy;
    switch (p.st.special) {
      case 'seekers':
        p.salvo = 14;
        p.salvoT = 0;
        A.play('seekers');
        break;
      case 'aegis':
        p.aegis = 6;
        G.fx.ring(p.x, p.y, 10, 40, col, 0.4, 4);
        A.play('aegis');
        break;
      case 'overdrive':
        p.overdrive = 7;
        G.fx.ring(p.x, p.y, 10, 60, col, 0.5, 5);
        A.play('overdrive');
        break;
      case 'drones':
        p.drones = 15;
        p.droneA = 0;
        A.play('drones');
        break;
      default:
        G.novas.push({ x: p.x, y: p.y, r: 12, done: new Set() });
        G.fx.glow(p.x, p.y, 70, col, 0.35, { grow: 1.5 });
        G.shake = Math.max(G.shake, 12);
        A.play('nova');
    }
    SF.game.buzz([30, 30, 60]);
  }

  function launchMissile(G, p, side) {
    const sx = p.x + side * 12;
    const sy = p.y + 4;
    G.missiles.push({
      x: sx, y: sy, vx: side * U.rand(120, 200), vy: U.rand(-60, 40),
      speed: 200, life: 3.2, target: null, trail: 0,
      dmg: 42 * G.diff.hp * p.st.dmg,
    });
  }

  // Everything special that moves on its own, every frame.
  function update(G, p, dt) {
    const hpScale = G.diff.hp;

    // Missiles
    if (p.salvo > 0 && p.alive) {
      p.salvoT -= dt;
      while (p.salvoT <= 0 && p.salvo > 0) {
        p.salvoT += 0.065;
        launchMissile(G, p, p.salvo % 2 ? 1 : -1);
        p.salvo--;
      }
    }
    for (let i = G.missiles.length - 1; i >= 0; i--) {
      const m = G.missiles[i];
      m.life -= dt;
      if (!m.target || !targetable(m.target)) m.target = nearest(G, m.x, m.y, 900);
      m.speed = Math.min(640, m.speed + 900 * dt);
      let ang = Math.atan2(m.vy, m.vx);
      const want = m.target ? U.angleTo(m.x, m.y, m.target.x, m.target.y) : -Math.PI / 2;
      ang += U.clamp(U.angleDiff(ang, want), -7 * dt, 7 * dt);
      m.vx = Math.cos(ang) * m.speed;
      m.vy = Math.sin(ang) * m.speed;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.trail -= dt;
      if (m.trail <= 0) {
        m.trail = 0.02;
        G.fx.glow(m.x - m.vx * 0.02, m.y - m.vy * 0.02, 4, p.R.energy, 0.25, { grow: -0.5 });
      }
      let boom = m.life <= 0 || m.y < -40 || m.y > G.H + 40 || m.x < -40 || m.x > G.W + 40;
      const t = m.target;
      if (!boom && t && targetable(t)) {
        const rr = (t.box ? Math.max(t.box.hw * 0.6, t.box.hh) : t.r) + 5;
        if (U.dist2(m.x, m.y, t.x, t.y) < rr * rr) {
          G.hit(t, m.dmg, m.x, m.y);
          G.fx.explode(m.x, m.y, 1, ['#FFFFFF', p.R.energy, '#FFB040']);
          A.play('pop');
          boom = true;
        }
      }
      if (boom) G.missiles.splice(i, 1);
    }

    // Nova shockwaves
    for (let i = G.novas.length - 1; i >= 0; i--) {
      const n = G.novas[i];
      n.r += 900 * dt;
      const r2 = n.r * n.r;
      for (let j = G.eb.length - 1; j >= 0; j--) {
        const b = G.eb[j];
        if (U.dist2(b.x, b.y, n.x, n.y) < r2) {
          G.fx.glow(b.x, b.y, 5, b.color, 0.25);
          G.eb[j] = G.eb[G.eb.length - 1];
          G.eb.pop();
          G.score += 5;
        }
      }
      for (const e of G.enemies) {
        if (!e.alive || n.done.has(e) || !e.onScreen) continue;
        if (U.dist2(e.x, e.y, n.x, n.y) < (n.r + e.r) * (n.r + e.r)) {
          n.done.add(e);
          G.hit(e, 170 * hpScale * p.st.dmg, e.x, e.y);
        }
      }
      if (n.r > 1000) G.novas.splice(i, 1);
    }

    // Aegis bubble
    if (p.aegis > 0) {
      p.aegis -= dt;
      const R = 36;
      for (let j = G.eb.length - 1; j >= 0; j--) {
        const b = G.eb[j];
        if (U.dist2(b.x, b.y, p.x, p.y) < (R + b.r) * (R + b.r)) {
          G.fx.spray(b.x, b.y, U.angleTo(p.x, p.y, b.x, b.y), 1.2, p.R.energy, 3, 160);
          G.eb[j] = G.eb[G.eb.length - 1];
          G.eb.pop();
          A.play('deflect');
        }
      }
      for (const e of G.enemies) {
        if (!targetable(e)) continue;
        const rr = R + (e.box ? e.box.hh : e.r);
        if (U.dist2(e.x, e.y, p.x, p.y) < rr * rr) G.hit(e, 140 * hpScale * dt, e.x, e.y, true);
      }
    }

    if (p.overdrive > 0) p.overdrive -= dt;

    // Wing drones
    if (p.drones > 0) {
      p.drones -= dt;
      p.droneA += dt * 3;
      p.droneCool -= dt;
      if (p.droneCool <= 0 && p.alive) {
        p.droneCool = 0.24;
        for (const d of dronePos(p)) {
          const t = nearest(G, d.x, d.y, 320);
          if (!t) continue;
          const a = Math.atan2(t.x - d.x, -(t.y - d.y));
          shot(G, d.x, d.y, a, 780, { dmg: 10 * Math.sqrt(hpScale) * p.st.dmg, kind: 'mini', r: 3, len: 12, w: 5 });
        }
      }
    }

    for (let i = G.arcs.length - 1; i >= 0; i--) {
      G.arcs[i].t -= dt;
      if (G.arcs[i].t <= 0) G.arcs.splice(i, 1);
    }
  }

  function dronePos(p) {
    const out = [];
    for (let k = 0; k < 2; k++) {
      const a = p.droneA + k * Math.PI;
      out.push({ x: p.x + Math.cos(a) * 34, y: p.y + 6 + Math.sin(a) * 16 });
    }
    return out;
  }

  /* ---------- Drawing ---------- */

  function drawShots(g, G, col) {
    g.globalCompositeOperation = 'lighter';
    const boltImg = U.bolt(col);
    const orbImg = U.orb(col);
    for (const b of G.pb) {
      if (b.kind === 'pellet') {
        g.drawImage(orbImg, b.x - 6, b.y - 6, 12, 12);
      } else if (b.ang) {
        g.save();
        g.translate(b.x, b.y);
        g.rotate(b.ang);
        g.drawImage(boltImg, -b.w / 2, -b.len / 2, b.w, b.len);
        g.restore();
      } else {
        if (b.kind === 'slug') g.drawImage(U.glow(col), b.x - b.w * 1.4, b.y - b.len * 0.6, b.w * 2.8, b.len * 1.2);
        g.drawImage(boltImg, b.x - b.w / 2, b.y - b.len / 2, b.w, b.len);
      }
    }
    g.globalCompositeOperation = 'source-over';
  }

  function drawEffects(g, G, p) {
    const col = p.R.energy;
    g.globalCompositeOperation = 'lighter';

    // Plasma beam
    if (p.beam && p.alive) {
      const b = p.beam;
      const len = b.y0 - b.y1;
      const wob = 1 + Math.sin(G.t * 50) * 0.12;
      const w = b.w * wob;
      const gr = g.createLinearGradient(b.x - w * 1.6, 0, b.x + w * 1.6, 0);
      gr.addColorStop(0, U.rgba(col, 0));
      gr.addColorStop(0.3, U.rgba(col, 0.55));
      gr.addColorStop(0.5, U.rgba(col, 0.9));
      gr.addColorStop(0.7, U.rgba(col, 0.55));
      gr.addColorStop(1, U.rgba(col, 0));
      g.fillStyle = gr;
      g.fillRect(b.x - w * 1.6, b.y1, w * 3.2, len);
      g.fillStyle = 'rgba(255,255,255,0.9)';
      g.fillRect(b.x - w * 0.18, b.y1, w * 0.36, len);
      g.drawImage(U.glow(col), b.x - w * 1.5, b.y0 - w * 1.5, w * 3, w * 3);
      if (b.hit) g.drawImage(U.glow('#FFFFFF'), b.x - w * 1.8, b.y1 - w * 1.8, w * 3.6, w * 3.6);
    }

    // Arc lightning
    for (const a of G.arcs) {
      g.globalAlpha = a.t / a.max;
      for (let i = 1; i < a.pts.length; i++) {
        const [x0, y0] = a.pts[i - 1];
        const [x1, y1] = a.pts[i];
        SF.art.lightning(g, x0, y0, x1, y1, 7, col, 1.6);
        g.drawImage(U.glow(col), x1 - 10, y1 - 10, 20, 20);
      }
    }
    g.globalAlpha = 1;

    // Nova rings
    for (const n of G.novas) {
      const k = Math.max(0, 1 - n.r / 1000);
      g.strokeStyle = U.rgba(col, 0.8 * k);
      g.lineWidth = 10 * k + 2;
      g.beginPath();
      g.arc(n.x, n.y, n.r, 0, TAU);
      g.stroke();
      g.strokeStyle = `rgba(255,255,255,${0.7 * k})`;
      g.lineWidth = 2;
      g.stroke();
    }

    // Missiles
    for (const m of G.missiles) {
      const a = Math.atan2(m.vy, m.vx);
      g.drawImage(U.glow(col), m.x - 7, m.y - 7, 14, 14);
      g.save();
      g.translate(m.x, m.y);
      g.rotate(a);
      g.fillStyle = '#FFFFFF';
      g.fillRect(-4, -1.3, 8, 2.6);
      g.restore();
    }

    // Aegis bubble
    if (p.aegis > 0 && p.alive) {
      const fade = Math.min(1, p.aegis / 1) * (p.aegis < 1.5 && Math.floor(G.t * 12) % 2 ? 0.4 : 1);
      g.globalAlpha = fade;
      g.drawImage(U.glow(col), p.x - 50, p.y - 50, 100, 100);
      g.strokeStyle = U.rgba(col, 0.9);
      g.lineWidth = 2;
      g.beginPath();
      for (let i = 0; i <= 6; i++) {
        const ang = G.t * 0.8 + (i * TAU) / 6;
        const x = p.x + Math.cos(ang) * 37;
        const y = p.y + Math.sin(ang) * 37;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
      g.globalAlpha = 1;
    }

    // Overdrive aura
    if (p.overdrive > 0 && p.alive) {
      g.globalAlpha = 0.35 + 0.25 * Math.sin(G.t * 20);
      g.drawImage(U.glow(col), p.x - 34, p.y - 34, 68, 68);
      g.globalAlpha = 1;
    }
    g.globalCompositeOperation = 'source-over';

    // Wing drones
    if (p.drones > 0 && p.alive) {
      const blink = p.drones < 2 && Math.floor(G.t * 12) % 2;
      for (const d of dronePos(p)) {
        if (blink) continue;
        g.globalCompositeOperation = 'lighter';
        g.drawImage(U.glow(col), d.x - 9, d.y - 9, 18, 18);
        g.globalCompositeOperation = 'source-over';
        g.fillStyle = '#DDE4F5';
        g.strokeStyle = 'rgba(5,7,20,0.8)';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(d.x, d.y - 6);
        g.lineTo(d.x + 5, d.y + 4);
        g.lineTo(d.x, d.y + 2);
        g.lineTo(d.x - 5, d.y + 4);
        g.closePath();
        g.fill();
        g.stroke();
      }
    }
  }

  SF.weapons = { fire, special, update, drawShots, drawEffects, PULSE };
})(window.SF = window.SF || {});
