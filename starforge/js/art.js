/* Starforge — drawing: the player's ship built from its parts and paint, the
   enemy ships, bosses and rocks, and the icons for weapons and specials.

   Everything static is drawn once into an offscreen sprite; only flames,
   glows and moving bits are drawn every frame. */
(function (SF) {
  'use strict';

  const U = SF.util;
  const P = SF.parts;
  const TAU = U.TAU;
  const OUTLINE = 'rgba(5,7,20,0.82)';
  const SHIP_BOX = 88; // art units across a ship sprite
  const ART = 0.72; // art units → world units in flight

  const paths = new Map();
  function path(d) {
    let p = paths.get(d);
    if (!p) {
      p = new Path2D(d);
      paths.set(d, p);
    }
    return p;
  }

  // Turn a ship (a set of ids) into the parts and colours to draw.
  function resolve(ship) {
    return {
      ship,
      hull: P.get('hull', ship.hull),
      wing: P.get('wings', ship.wings),
      engine: P.get('engine', ship.engine),
      body: ship.finish === 'gold' ? '#DDAA38' : P.color(ship.body).hex,
      accent: P.color(ship.accent).hex,
      energy: P.energy(ship.energy).hex,
      decal: ship.decal,
      finish: ship.finish,
    };
  }

  function mirrored(g, fn) {
    for (const side of [1, -1]) {
      g.save();
      g.scale(side, 1);
      fn(side);
      g.restore();
    }
  }

  function starShape(g, x, y, r) {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * 0.45 : r;
      g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.closePath();
    g.fill();
  }

  function tri(g, ax, ay, bx, by, cx, cy) {
    g.beginPath();
    g.moveTo(ax, ay);
    g.lineTo(bx, by);
    g.lineTo(cx, cy);
    g.closePath();
    g.fill();
  }

  function flamesShape(g, y, w) {
    g.beginPath();
    g.moveTo(-w, y - 6);
    g.quadraticCurveTo(0, y - 16, w, y - 6);
    g.lineTo(w * 0.86, y + 10);
    g.quadraticCurveTo(w * 0.64, y + 2, w * 0.5, y + 9);
    g.quadraticCurveTo(w * 0.3, y + 21, w * 0.14, y + 6);
    g.quadraticCurveTo(0, y + 17, -w * 0.14, y + 6);
    g.quadraticCurveTo(-w * 0.3, y + 21, -w * 0.5, y + 9);
    g.quadraticCurveTo(-w * 0.64, y + 2, -w * 0.86, y + 10);
    g.closePath();
    g.fill();
  }

  // Paint the decal inside the current clip. `where` is 'hull' or 'wing'
  // (wing space is the right wing's own space, mirrored for the left).
  function decal(g, R, where) {
    const d = R.decal;
    const hot = U.mix(R.accent, '#FFFFFF', 0.45);
    g.fillStyle = R.accent;
    if (where === 'hull') {
      const top = R.hull.gun.y;
      switch (d) {
        case 'stripe':
          g.fillRect(-2.3, -50, 4.6, 100);
          break;
        case 'twin':
          g.fillRect(-5.4, -50, 2.2, 100);
          g.fillRect(3.2, -50, 2.2, 100);
          break;
        case 'chevron':
          for (let y = top + 11; y < 22; y += 10.5) {
            g.beginPath();
            g.moveTo(-15, y + 7.5);
            g.lineTo(0, y);
            g.lineTo(15, y + 7.5);
            g.lineTo(15, y + 11);
            g.lineTo(0, y + 3.5);
            g.lineTo(-15, y + 11);
            g.closePath();
            g.fill();
          }
          break;
        case 'flames':
          flamesShape(g, top + 12, 16);
          g.fillStyle = hot;
          flamesShape(g, top + 10, 9);
          break;
        case 'tiger':
          for (let y = top + 12; y < 24; y += 8.5) {
            tri(g, -18, y, -2.5, y + 2.8, -18, y + 5.2);
            tri(g, 18, y, 2.5, y + 2.8, 18, y + 5.2);
          }
          break;
        case 'checker':
          for (let y = -50, i = 0; y < 30; y += 3.5, i++) g.fillRect(i % 2 ? -3.5 : 0, y, 3.5, 3.5);
          break;
        case 'star':
          starShape(g, 0, R.hull.cockpit.y + R.hull.cockpit.ry + 8, 4.2);
          break;
        default:
      }
    } else {
      switch (d) {
        case 'flames':
          g.save();
          g.rotate(-Math.PI / 2);
          g.translate(-4, 2);
          flamesShape(g, 6, 7);
          g.restore();
          break;
        case 'tiger':
          for (let x = 3; x < 32; x += 6.5) tri(g, x, 26, x + 2.2, -4, x + 4.4, 26);
          break;
        case 'checker':
          for (let y = -20, j = 0; y < 22; y += 3.5, j++) {
            for (let x = 0, i = 0; x < 36; x += 3.5, i++) if ((i + j) % 2) g.fillRect(x, y, 3.5, 3.5);
          }
          break;
        case 'star':
          if (R.wing.star) starShape(g, R.wing.star.x, R.wing.star.y, 3.6);
          break;
        case 'chevron':
          if (R.wing.star) {
            const s = R.wing.star;
            g.beginPath();
            g.moveTo(s.x - 5, s.y + 3);
            g.lineTo(s.x, s.y - 2);
            g.lineTo(s.x + 5, s.y + 3);
            g.lineTo(s.x + 5, s.y + 5.5);
            g.lineTo(s.x, s.y + 0.5);
            g.lineTo(s.x - 5, s.y + 5.5);
            g.closePath();
            g.fill();
          }
          break;
        default:
      }
    }
  }

  function drawHalo(g, R) {
    const m = R.hull.mount;
    const cy = m.y + 1;
    const rad = 23 + m.x * 0.4;
    mirrored(g, () => {
      g.fillStyle = U.shade(R.body, -0.25);
      g.beginPath();
      g.rect(m.x - 2, cy - 2.2, rad - m.x + 2, 4.4);
      g.fill();
      g.lineWidth = 0.9;
      g.strokeStyle = OUTLINE;
      g.stroke();
    });
    const ring = (a0, a1) => {
      g.beginPath();
      g.ellipse(0, cy, rad, rad * 0.92, 0, a0, a1);
    };
    ring(0, TAU);
    g.lineWidth = 7.4;
    g.strokeStyle = OUTLINE;
    g.stroke();
    g.lineWidth = 5.4;
    g.strokeStyle = U.shade(R.body, -0.1);
    g.stroke();
    g.strokeStyle = R.accent;
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + (k * Math.PI) / 2;
      ring(a - 0.24, a + 0.24);
      g.stroke();
    }
    g.lineWidth = 1.3;
    g.strokeStyle = R.energy;
    g.beginPath();
    g.ellipse(0, cy, rad - 1.3, rad * 0.92 - 1.3, 0, 0, TAU);
    g.stroke();
  }

  function drawWings(g, R) {
    const m = R.hull.mount;
    const w = R.wing;
    if (w.halo) {
      drawHalo(g, R);
      return;
    }
    const wp = path(w.path);
    mirrored(g, () => {
      g.translate(m.x, m.y);
      g.scale(m.s, m.s);
      g.fillStyle = U.shade(R.body, -0.1);
      g.fill(wp);
      g.save();
      g.clip(wp);
      g.fillStyle = R.accent;
      g.fillRect(w.tipX, -40, 60, 80);
      decal(g, R, 'wing');
      g.restore();
      if (w.edge) {
        g.strokeStyle = R.energy;
        g.lineWidth = 1.4;
        g.stroke(path(w.edge));
      }
      g.lineWidth = 1.1 / m.s;
      g.strokeStyle = OUTLINE;
      g.stroke(wp);
      if (w.pod) {
        const p = w.pod;
        g.fillStyle = U.shade(R.body, -0.4);
        U.roundRect(g, p.x, p.y, p.w, p.h, p.w / 2);
        g.fill();
        g.stroke();
        g.fillStyle = R.energy;
        g.beginPath();
        g.arc(p.x + p.w / 2, p.y + 2, 1.3, 0, TAU);
        g.fill();
      }
    });
  }

  function drawHull(g, R) {
    const h = R.hull;
    if (h.extra) {
      const ep = path(h.extra);
      mirrored(g, () => {
        g.fillStyle = U.shade(R.body, -0.22);
        g.fill(ep);
        g.lineWidth = 1;
        g.strokeStyle = OUTLINE;
        g.stroke(ep);
      });
    }
    const bp = path(h.body);
    g.fillStyle = R.body;
    g.fill(bp);
    g.save();
    g.clip(bp);
    g.fillStyle = R.accent;
    g.fillRect(-30, h.gun.y - 5, 60, 8.5); // nose cap
    decal(g, R, 'hull');
    g.lineWidth = 0.7;
    g.strokeStyle = 'rgba(0,0,0,0.3)';
    g.stroke(path(h.panels));
    g.restore();
    g.lineWidth = 1.2;
    g.strokeStyle = OUTLINE;
    g.stroke(bp);
  }

  function linear(g, x0, y0, x1, y1, stops) {
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    for (const [k, c] of stops) gr.addColorStop(k, c);
    return gr;
  }

  // Lighting and the paint finish, laid over everything painted so far.
  function drawFinish(g, R, time) {
    const W = 'rgba(255,255,255,';
    const K = 'rgba(8,10,28,';
    const matte = linear(g, -30, 0, 30, 0, [[0, W + '0.22)'], [0.45, W + '0)'], [1, K + '0.34)']]);
    let fills;
    switch (R.finish) {
      case 'metal':
        fills = [linear(g, -34, -24, 34, 24, [[0, W + '0.5)'], [0.3, W + '0.08)'], [0.5, K + '0.06)'], [0.62, W + '0.18)'], [1, K + '0.46)']])];
        break;
      case 'chrome':
        fills = [linear(g, -26, -36, 26, 36, [[0, W + '0.75)'], [0.2, W + '0.1)'], [0.36, K + '0.5)'], [0.5, W + '0.6)'], [0.66, K + '0.35)'], [0.82, W + '0.35)'], [1, K + '0.55)']])];
        break;
      case 'gold':
        fills = [linear(g, -26, -36, 26, 36, [
          [0, 'rgba(255,250,210,0.7)'], [0.22, 'rgba(255,230,140,0.1)'], [0.38, 'rgba(110,60,0,0.45)'],
          [0.52, 'rgba(255,245,190,0.55)'], [0.7, 'rgba(120,70,0,0.35)'], [0.85, 'rgba(255,236,160,0.3)'], [1, 'rgba(90,50,0,0.5)'],
        ])];
        break;
      case 'holo': {
        const off = (time * 0.25) % 1;
        const stops = [];
        for (let i = 0; i <= 6; i++) stops.push([i / 6, `hsla(${Math.round(((i / 6 + off) % 1) * 360)},100%,62%,0.55)`]);
        fills = [linear(g, -40, -40, 40, 40, stops), matte];
        break;
      }
      default:
        fills = [matte];
    }
    g.save();
    g.globalCompositeOperation = 'source-atop';
    for (const f of fills) {
      g.fillStyle = f;
      g.fillRect(-50, -50, 100, 100);
    }
    g.restore();
  }

  function drawNozzles(g, R) {
    const e = R.engine.id;
    const glowCol = e === 'burner' ? '#FF9A3A' : R.energy;
    g.lineWidth = 0.9;
    g.strokeStyle = OUTLINE;
    for (const n of R.hull.nozzles) {
      const y = n.y - n.r * 0.35;
      g.fillStyle = '#1B1F30';
      g.beginPath();
      if (e === 'burner') {
        g.moveTo(n.x - n.r * 0.75, y - n.r * 0.7);
        g.lineTo(n.x + n.r * 0.75, y - n.r * 0.7);
        g.lineTo(n.x + n.r * 1.15, y + n.r * 1.1);
        g.lineTo(n.x - n.r * 1.15, y + n.r * 1.1);
        g.closePath();
      } else {
        g.arc(n.x, y, n.r, 0, TAU);
      }
      g.fill();
      g.stroke();
      g.fillStyle = glowCol;
      g.beginPath();
      g.arc(n.x, y + (e === 'burner' ? n.r * 0.35 : 0), n.r * 0.55, 0, TAU);
      g.fill();
      if (e === 'fusion') {
        g.strokeStyle = R.accent;
        g.lineWidth = 1.1;
        g.beginPath();
        g.arc(n.x, y, n.r * 0.82, 0, TAU);
        g.stroke();
        g.strokeStyle = OUTLINE;
        g.lineWidth = 0.9;
      } else if (e === 'quantum') {
        g.strokeStyle = U.mix(R.energy, '#FFFFFF', 0.5);
        g.lineWidth = 0.8;
        const r = n.r * 1.3;
        g.beginPath();
        g.moveTo(n.x, y - r);
        g.lineTo(n.x + r, y);
        g.lineTo(n.x, y + r);
        g.lineTo(n.x - r, y);
        g.closePath();
        g.stroke();
        g.strokeStyle = OUTLINE;
        g.lineWidth = 0.9;
      }
    }
  }

  function drawCockpit(g, R) {
    const c = R.hull.cockpit;
    const gr = g.createLinearGradient(0, c.y - c.ry, 0, c.y + c.ry);
    gr.addColorStop(0, U.mix(R.energy, '#FFFFFF', 0.55));
    gr.addColorStop(0.35, U.mix(R.energy, '#0A1030', 0.4));
    gr.addColorStop(1, '#060A1C');
    g.fillStyle = gr;
    g.beginPath();
    g.ellipse(c.x, c.y, c.rx, c.ry, 0, 0, TAU);
    g.fill();
    g.lineWidth = 1;
    g.strokeStyle = OUTLINE;
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.beginPath();
    g.ellipse(c.x - c.rx * 0.35, c.y - c.ry * 0.35, c.rx * 0.28, c.ry * 0.3, 0, 0, TAU);
    g.fill();
  }

  // The whole ship as a sprite. `px` is canvas pixels per art unit. Takes a
  // ship (ids) or one already resolved by resolve().
  function renderShip(ship, px, time) {
    const R = ship.ship ? ship : resolve(ship);
    const size = Math.ceil(SHIP_BOX * px);
    const c = U.canvas(size, size);
    const g = c.getContext('2d');
    g.translate(size / 2, size / 2);
    g.scale(px, px);
    g.lineJoin = 'round';
    g.lineCap = 'round';
    drawWings(g, R);
    drawHull(g, R);
    drawFinish(g, R, time || 0);
    drawNozzles(g, R);
    drawCockpit(g, R);
    return c;
  }

  // Engine flames, in the ship's art space. `power` stretches them.
  function drawFlames(g, R, t, power) {
    const e = R.engine.id;
    const col = e === 'burner' ? '#FF7A22' : R.energy;
    const core = e === 'burner' ? '#FFE7A0' : U.mix(R.energy, '#FFFFFF', 0.7);
    const prev = g.globalCompositeOperation;
    g.globalCompositeOperation = 'lighter';
    const nz = R.hull.nozzles;
    for (let i = 0; i < nz.length; i++) {
      const n = nz[i];
      const flick = 0.82 + 0.12 * Math.sin(t * 43 + i * 1.7) + Math.random() * 0.12;
      const len = n.r * (e === 'burner' ? 8.5 : e === 'quantum' ? 6.5 : 6) * power * flick;
      const w = n.r * (e === 'burner' ? 3.4 : 2.8);
      const y = n.y - n.r * 0.3;
      g.drawImage(U.flame(col), n.x - w / 2, y - len * 0.08, w, len);
      g.drawImage(U.flame(core), n.x - w * 0.22, y - len * 0.05, w * 0.44, len * 0.5);
      if (e === 'fusion') {
        const k = (t * 2.5 + i * 0.3) % 1;
        g.globalAlpha = 1 - k;
        g.strokeStyle = col;
        g.lineWidth = 0.8;
        g.beginPath();
        g.ellipse(n.x, y + len * (0.15 + k * 0.45), n.r * (0.6 + k * 0.5), n.r * 0.3, 0, 0, TAU);
        g.stroke();
        g.globalAlpha = 1;
      } else if (e === 'quantum' && Math.random() < 0.6) {
        const s = 1.2 + Math.random() * 1.6;
        g.drawImage(U.glow('#FFFFFF'), n.x + U.rand(-2.5, 2.5) - s, y + U.rand(0.2, 0.9) * len - s, s * 2, s * 2);
      }
    }
    g.globalCompositeOperation = prev;
  }

  /* ---------- Enemies ---------- */

  function shaded(g, p, color) {
    g.fillStyle = color;
    g.fill(p);
    g.save();
    g.clip(p);
    g.fillStyle = linear(g, -30, -30, 30, 30, [[0, 'rgba(255,255,255,0.28)'], [0.5, 'rgba(255,255,255,0)'], [1, 'rgba(0,0,0,0.4)']]);
    g.fillRect(-100, -100, 200, 200);
    g.restore();
    g.lineWidth = 1.2;
    g.strokeStyle = OUTLINE;
    g.stroke(p);
  }

  function dot(g, x, y, r, color) {
    g.fillStyle = color;
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
  }

  function circlePath(x, y, r) {
    const p = new Path2D();
    p.arc(x, y, r, 0, TAU);
    return p;
  }

  // Enemy art faces down (+y), in world units.
  const ENEMY = {
    drone: {
      box: 30,
      draw(g) {
        shaded(g, path('M0,13 L6,2 L13,-9 L5,-6 L0,-11 L-5,-6 L-13,-9 L-6,2 Z'), '#C22D45');
        g.fillStyle = '#6E1024';
        g.fill(path('M0,9 L3,0 L0,-8 L-3,0 Z'));
        dot(g, 0, 1.5, 2.4, '#FFD0DA');
      },
    },
    swooper: {
      box: 40,
      draw(g) {
        shaded(g, path('M0,12 C9,7 14,-1 17,-11 C10,-6 5,-6 0,-3 C-5,-6 -10,-6 -17,-11 C-14,-1 -9,7 0,12 Z'), '#F2742B');
        g.fillStyle = '#7A2A0C';
        g.fill(path('M0,8 C3,5 5,1 6,-3 C3,-2 1,-1 0,0 C-1,-1 -3,-2 -6,-3 C-5,1 -3,5 0,8 Z'));
        dot(g, 0, 3, 2.2, '#FFF2A8');
      },
    },
    charger: {
      box: 36,
      draw(g) {
        shaded(g, path('M0,17 L7,1 L15,-10 L6,-7 L0,-15 L-6,-7 L-15,-10 L-7,1 Z'), '#8A3BF0');
        g.fillStyle = '#3C1470';
        g.fill(path('M0,12 L3.5,0 L0,-9 L-3.5,0 Z'));
        dot(g, 0, 2, 2.6, '#F2D4FF');
      },
    },
    gunship: {
      box: 76,
      draw(g) {
        g.lineWidth = 1.2;
        g.strokeStyle = OUTLINE;
        for (const sx of [-1, 1]) {
          g.fillStyle = '#2A0E1A';
          g.beginPath();
          g.rect(sx * 16 - 2.5, 10, 5, 17);
          g.fill();
          g.stroke();
        }
        shaded(g, path('M0,26 L12,20 L28,8 L34,-6 L24,-16 L10,-22 L-10,-22 L-24,-16 L-34,-6 L-28,8 L-12,20 Z'), '#7A2344');
        g.strokeStyle = 'rgba(0,0,0,0.35)';
        g.lineWidth = 1;
        g.stroke(path('M-28,8 L28,8 M-24,-16 L-12,4 M24,-16 L12,4 M0,-22 L0,-8'));
        g.fillStyle = '#4A1128';
        g.fill(path('M0,16 L10,8 L12,-6 L0,-14 L-12,-6 L-10,8 Z'));
        dot(g, 0, 1, 5.5, '#2A0612');
        g.fillStyle = '#FFB0C0';
        g.fillRect(-12, -24, 4, 3);
        g.fillRect(8, -24, 4, 3);
      },
    },
    sniper: {
      box: 44,
      draw(g) {
        g.fillStyle = '#20183F';
        g.beginPath();
        g.rect(-1.6, 6, 3.2, 22);
        g.fill();
        g.lineWidth = 1;
        g.strokeStyle = OUTLINE;
        g.stroke();
        shaded(g, path('M0,22 L3,8 L11,-6 L7,-18 L0,-13 L-7,-18 L-11,-6 L-3,8 Z'), '#4B3AA8');
        g.fillStyle = '#231A5C';
        g.fill(path('M0,10 L4,-4 L0,-10 L-4,-4 Z'));
        dot(g, 0, -2, 2.4, '#C9F0FF');
      },
    },
    mine: {
      box: 32,
      draw(g) {
        g.fillStyle = '#2B2F40';
        g.strokeStyle = OUTLINE;
        g.lineWidth = 1;
        for (let i = 0; i < 8; i++) {
          const a = (i * TAU) / 8;
          const ca = Math.cos(a);
          const sa = Math.sin(a);
          g.beginPath();
          g.moveTo(ca * 14 , sa * 14);
          g.lineTo(ca * 7 - sa * 3, sa * 7 + ca * 3);
          g.lineTo(ca * 7 + sa * 3, sa * 7 - ca * 3);
          g.closePath();
          g.fill();
          g.stroke();
        }
        shaded(g, circlePath(0, 0, 9.5), '#4A5068');
        dot(g, 0, 0, 5, '#22263A');
      },
    },
    turret: {
      box: 30,
      draw(g) {
        shaded(g, circlePath(0, 0, 11), '#5C1D38');
        dot(g, 0, 0, 6.5, '#2E0C1C');
      },
    },
    dread: {
      box: 190,
      draw(g) {
        shaded(g, path('M0,44 L20,40 L46,28 L80,14 L88,-2 L74,-16 L42,-26 L18,-38 L-18,-38 L-42,-26 L-74,-16 L-88,-2 L-80,14 L-46,28 L-20,40 Z'), '#6B1F3D');
        g.strokeStyle = 'rgba(0,0,0,0.35)';
        g.lineWidth = 1.2;
        g.stroke(path('M-80,14 L80,14 M-74,-16 L-40,6 M74,-16 L40,6 M-18,-38 L-10,-10 M18,-38 L10,-10 M0,-10 L0,44 M-46,28 L-30,14 M46,28 L30,14'));
        g.fillStyle = '#43102A';
        g.fill(path('M0,34 L30,22 L36,0 L20,-18 L-20,-18 L-36,0 L-30,22 Z'));
        g.strokeStyle = OUTLINE;
        g.lineWidth = 1;
        g.stroke(path('M0,34 L30,22 L36,0 L20,-18 L-20,-18 L-36,0 L-30,22 Z'));
        for (const sx of [-1, 1]) dot(g, sx * 52, 6, 14, '#2A0A1A');
        dot(g, 0, 8, 13, '#1E0612');
        g.fillStyle = '#FF9AB0';
        for (const x of [-30, -12, 8, 26]) g.fillRect(x, -39, 4, 3);
      },
    },
    hive: {
      box: 124,
      draw(g) {
        const p = new Path2D();
        for (let i = 0; i <= 72; i++) {
          const a = (i / 72) * TAU;
          const r = 48 + 5 * Math.sin(a * 6) + 1.6 * Math.sin(a * 13);
          if (i === 0) p.moveTo(Math.cos(a) * r, Math.sin(a) * r);
          else p.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        p.closePath();
        shaded(g, p, '#3A1458');
        g.save();
        g.clip(p);
        g.strokeStyle = '#6B2A9A';
        g.lineWidth = 2;
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * TAU + 0.5;
          g.beginPath();
          g.moveTo(Math.cos(a) * 16, Math.sin(a) * 16);
          g.quadraticCurveTo(Math.cos(a + 0.4) * 30, Math.sin(a + 0.4) * 30, Math.cos(a) * 50, Math.sin(a) * 50);
          g.stroke();
        }
        g.restore();
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * TAU;
          const x = Math.cos(a) * 37;
          const y = Math.sin(a) * 37;
          dot(g, x, y, 7.5, '#5A1E86');
          dot(g, x, y, 3.8, '#1C0830');
        }
        dot(g, 0, 0, 17, '#1C0830');
      },
    },
    warden: {
      box: 100,
      draw(g) {
        shaded(g, path('M0,40 L30,0 L0,-40 L-30,0 Z'), '#8A5516');
        g.fillStyle = '#3A2206';
        g.fill(path('M0,25 L18,0 L0,-25 L-18,0 Z'));
        g.strokeStyle = 'rgba(0,0,0,0.35)';
        g.lineWidth = 1;
        g.stroke(path('M0,40 L0,25 M30,0 L18,0 M0,-40 L0,-25 M-30,0 L-18,0'));
        dot(g, 0, 0, 10, '#1E1204');
      },
    },
  };

  // Sprites are cached per pixel scale, with a white copy for hit flashes.
  const spriteCache = new Map();
  function enemySprite(kind, px) {
    const key = kind + '|' + px;
    let s = spriteCache.get(key);
    if (s) return s;
    const def = ENEMY[kind];
    const size = Math.ceil(def.box * px);
    const img = U.canvas(size, size);
    const g = img.getContext('2d');
    g.translate(size / 2, size / 2);
    g.scale(px, px);
    g.lineJoin = 'round';
    def.draw(g);
    s = { img, flash: whiteCopy(img), box: def.box };
    spriteCache.set(key, s);
    return s;
  }

  function whiteCopy(img) {
    const c = U.canvas(img.width, img.height);
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = '#FFFFFF';
    g.fillRect(0, 0, c.width, c.height);
    return c;
  }

  const ROCK_R = [0, 9, 16, 26];
  function rockSprite(size, variant, px) {
    const key = 'rock' + size + '|' + variant + '|' + px;
    let s = spriteCache.get(key);
    if (s) return s;
    const r = ROCK_R[size];
    const box = r * 2 + 8;
    const n = Math.ceil(box * px);
    const img = U.canvas(n, n);
    const g = img.getContext('2d');
    g.translate(n / 2, n / 2);
    g.scale(px, px);
    const rnd = U.seeded(size * 97 + variant * 13 + 5);
    const p = new Path2D();
    const pts = 9 + size * 2;
    for (let i = 0; i < pts; i++) {
      const a = (i / pts) * TAU;
      const rr = r * (0.78 + rnd() * 0.3);
      if (i === 0) p.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else p.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    p.closePath();
    const tint = ['#8F8278', '#7C7A86', '#8A7466'][variant % 3];
    g.fillStyle = tint;
    g.fill(p);
    g.save();
    g.clip(p);
    const gr = g.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r * 1.1);
    gr.addColorStop(0, 'rgba(255,255,255,0.25)');
    gr.addColorStop(0.6, 'rgba(0,0,0,0.05)');
    gr.addColorStop(1, 'rgba(0,0,0,0.5)');
    g.fillStyle = gr;
    g.fillRect(-r * 2, -r * 2, r * 4, r * 4);
    for (let k = 0; k < 1 + size; k++) {
      const a = rnd() * TAU;
      const d = rnd() * r * 0.55;
      const cr = r * (0.14 + rnd() * 0.14);
      const x = Math.cos(a) * d;
      const y = Math.sin(a) * d;
      g.fillStyle = 'rgba(0,0,0,0.28)';
      g.beginPath();
      g.arc(x, y, cr, 0, TAU);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.beginPath();
      g.arc(x + cr * 0.25, y + cr * 0.25, cr * 0.75, 0, TAU);
      g.fill();
    }
    g.restore();
    g.lineWidth = 1.2;
    g.strokeStyle = OUTLINE;
    g.stroke(p);
    s = { img, flash: whiteCopy(img), box };
    spriteCache.set(key, s);
    return s;
  }

  function clearCache() {
    spriteCache.clear();
  }

  /* ---------- Icons (weapons, specials) in a 64×64 box ---------- */

  function lightning(g, x0, y0, x1, y1, jag, col, width) {
    const segs = 6;
    g.beginPath();
    g.moveTo(x0, y0);
    const nx = -(y1 - y0);
    const ny = x1 - x0;
    const nl = Math.hypot(nx, ny) || 1;
    for (let i = 1; i < segs; i++) {
      const k = i / segs;
      const o = (Math.random() * 2 - 1) * jag;
      g.lineTo(x0 + (x1 - x0) * k + (nx / nl) * o, y0 + (y1 - y0) * k + (ny / nl) * o);
    }
    g.lineTo(x1, y1);
    g.strokeStyle = col;
    g.lineWidth = width * 2.6;
    g.globalAlpha = 0.35;
    g.stroke();
    g.globalAlpha = 1;
    g.strokeStyle = '#FFFFFF';
    g.lineWidth = width;
    g.stroke();
  }

  const ICONS = {
    pulse(g, c) {
      [[20, 14], [32, 6], [44, 14]].forEach(([x, y]) => g.drawImage(U.bolt(c), x - 6, y, 12, 40));
    },
    scatter(g, c) {
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI / 2 + (i - 3) * 0.2;
        const d = 22 + (i % 2) * 8;
        const x = 32 + Math.cos(a) * d;
        const y = 58 + Math.sin(a) * d;
        g.drawImage(U.orb(c), x - 7, y - 7, 14, 14);
      }
    },
    rail(g, c) {
      g.drawImage(U.glow(c), 12, 0, 40, 64);
      g.drawImage(U.bolt(c), 24, 2, 16, 60);
      g.strokeStyle = c;
      g.lineWidth = 2;
      for (const y of [22, 38]) {
        g.beginPath();
        g.ellipse(32, y, 12, 3.5, 0, 0, TAU);
        g.stroke();
      }
    },
    beam(g, c) {
      const gr = g.createLinearGradient(18, 0, 46, 0);
      gr.addColorStop(0, U.rgba(c, 0));
      gr.addColorStop(0.3, U.rgba(c, 0.8));
      gr.addColorStop(0.5, '#FFFFFF');
      gr.addColorStop(0.7, U.rgba(c, 0.8));
      gr.addColorStop(1, U.rgba(c, 0));
      g.fillStyle = gr;
      g.fillRect(18, 0, 28, 58);
      g.drawImage(U.glow(c), 14, 40, 36, 24);
    },
    arc(g, c) {
      lightning(g, 32, 58, 16, 18, 5, c, 2);
      lightning(g, 16, 18, 48, 10, 5, c, 2);
      for (const [x, y] of [[16, 18], [48, 10]]) g.drawImage(U.glow(c), x - 9, y - 9, 18, 18);
    },
    nova(g, c) {
      g.strokeStyle = c;
      for (const [r, a] of [[26, 0.35], [18, 0.7], [10, 1]]) {
        g.globalAlpha = a;
        g.lineWidth = 3;
        g.beginPath();
        g.arc(32, 32, r, 0, TAU);
        g.stroke();
      }
      g.globalAlpha = 1;
      g.drawImage(U.glow('#FFFFFF'), 20, 20, 24, 24);
    },
    seekers(g, c) {
      g.strokeStyle = U.rgba(c, 0.8);
      g.lineWidth = 2.5;
      g.lineCap = 'round';
      for (const [x0, cx, x1] of [[18, 4, 22], [32, 32, 32], [46, 60, 42]]) {
        g.beginPath();
        g.moveTo(x0, 60);
        g.quadraticCurveTo(cx, 36, x1, 12);
        g.stroke();
        g.drawImage(U.glow('#FFFFFF'), x1 - 7, 5, 14, 14);
      }
    },
    aegis(g, c) {
      const hex = new Path2D();
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 6 + (i * TAU) / 6;
        hex.lineTo(32 + Math.cos(a) * 25, 32 + Math.sin(a) * 25);
      }
      hex.closePath();
      g.fillStyle = U.rgba(c, 0.25);
      g.fill(hex);
      g.strokeStyle = c;
      g.lineWidth = 3;
      g.stroke(hex);
      g.drawImage(U.glow(c), 14, 14, 36, 36);
    },
    overdrive(g, c) {
      g.fillStyle = c;
      for (const y of [8, 26]) {
        g.beginPath();
        g.moveTo(12, y + 20);
        g.lineTo(32, y);
        g.lineTo(52, y + 20);
        g.lineTo(52, y + 30);
        g.lineTo(32, y + 10);
        g.lineTo(12, y + 30);
        g.closePath();
        g.fill();
      }
      g.drawImage(U.glow('#FFFFFF'), 20, 4, 24, 24);
    },
    drones(g, c) {
      g.strokeStyle = U.rgba(c, 0.5);
      g.lineWidth = 2;
      g.setLineDash([4, 4]);
      g.beginPath();
      g.arc(32, 34, 22, 0, TAU);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = '#DDE4F5';
      g.beginPath();
      g.moveTo(32, 22);
      g.lineTo(39, 42);
      g.lineTo(25, 42);
      g.closePath();
      g.fill();
      for (const [x, y] of [[10, 34], [54, 34]]) {
        g.drawImage(U.glow(c), x - 10, y - 10, 20, 20);
        dot(g, x, y, 4, '#FFFFFF');
      }
    },
  };

  // Draw an icon into a 2D context scaled so the icon fills `size` pixels.
  function drawIcon(g, id, color, size) {
    const f = ICONS[id];
    if (!f) return;
    g.save();
    g.scale(size / 64, size / 64);
    g.globalCompositeOperation = 'lighter';
    f(g, color);
    g.restore();
  }

  SF.art = {
    SHIP_BOX, ART, resolve, renderShip, drawFlames,
    enemySprite, rockSprite, ROCK_R, clearCache, drawIcon, lightning,
    ENEMY,
  };
})(window.SF = window.SF || {});
