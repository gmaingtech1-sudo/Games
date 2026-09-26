/* Starforge — enemy ships, rocks, mines and bosses: how they move, shoot and
   break apart. Enemies face down; angles are ordinary maths angles, so
   Math.PI / 2 points straight down the screen. */
(function (SF) {
  'use strict';

  const U = SF.util;
  const A = SF.audio;
  const TAU = U.TAU;
  const DOWN = Math.PI / 2;

  const BUL = {
    red: '#FF4D6A', orange: '#FF9A3D', pink: '#FF5CD6', violet: '#B07BFF', yellow: '#FFE45C', cyan: '#5CE1FF',
  };

  /* ---------- Bullets ---------- */

  function shoot(G, x, y, ang, speed, o) {
    if (G.eb.length > 450) return;
    o = o || {};
    const sp = speed * G.diff.bs;
    G.eb.push({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, r: o.r || 4.5, color: o.color || BUL.red, dmg: (o.dmg || 12) * G.diff.dmg });
  }

  function fan(G, x, y, center, n, spread, speed, o) {
    for (let i = 0; i < n; i++) shoot(G, x, y, center + (n === 1 ? 0 : (i / (n - 1) - 0.5) * spread), speed, o);
  }

  function ring(G, x, y, n, off, speed, o) {
    for (let i = 0; i < n; i++) shoot(G, x, y, off + (i * TAU) / n, speed, o);
  }

  const aim = (G, e, ox, oy) => U.angleTo(e.x + (ox || 0), e.y + (oy || 0), G.player.x, G.player.y);

  /* ---------- Movement ---------- */

  // Fly in to a home spot, hover and sway, then leave downwards.
  function formation(e, dt) {
    const f = e.form;
    if (e.t < f.enter) {
      const k = U.easeOut(e.t / f.enter);
      e.x = U.lerp(f.sx, f.hx, k);
      e.y = U.lerp(f.sy, f.hy, k);
    } else if (e.t < f.enter + f.stay) {
      const tt = e.t - f.enter;
      const ramp = Math.min(1, tt);
      e.x = f.hx + Math.sin(tt * f.sw + f.ph) * f.amp * ramp;
      e.y = f.hy + Math.sin(tt * 1.6 + f.ph) * 4 * ramp;
    } else {
      e.leaving = true;
      e.vy = Math.min((e.vy || 0) + 260 * dt, 320);
      e.y += e.vy * dt;
    }
  }

  // Follow a path: a cubic Bézier, a snake (sine) or a straight line.
  function followPath(e, dt) {
    const p = e.path;
    const px = e.x;
    const py = e.y;
    if (p.kind === 'bezier') {
      const k = e.t / p.dur;
      if (k >= 1) {
        e.gone = true;
        return;
      }
      const q = p.pts;
      e.x = U.cubic(q[0], q[2], q[4], q[6], k);
      e.y = U.cubic(q[1], q[3], q[5], q[7], k);
    } else if (p.kind === 'snake') {
      e.x = p.x + Math.sin(e.t * p.freq + p.ph) * p.amp;
      e.y = p.y0 + p.vy * e.t;
    } else {
      e.x += p.vx * dt;
      e.y += p.vy * dt;
    }
    if (dt > 0) {
      e.vx = (e.x - px) / dt;
      e.vy = (e.y - py) / dt;
      if (e.vx || e.vy) e.rot = Math.atan2(e.vy, e.vx) - DOWN;
    }
  }

  /* ---------- Enemy types ---------- */

  const TYPES = {
    drone: {
      hp: 20, r: 11, value: 1, score: 50, charge: 2,
      update(e, dt, G) {
        if (e.form) formation(e, dt);
        else followPath(e, dt);
        e.fireT -= dt * G.diff.fire;
        if (e.fireT <= 0) {
          e.fireT = U.rand(2.1, 3.6);
          if (e.y > 20 && e.y < G.H * 0.55 && !e.leaving) shoot(G, e.x, e.y + 8, aim(G, e), 165);
        }
      },
    },

    swooper: {
      hp: 24, r: 12, value: 2, score: 80, charge: 2.5,
      update(e, dt, G) {
        followPath(e, dt);
        if (e.shots > 0) {
          e.fireT -= dt * G.diff.fire;
          if (e.fireT <= 0 && e.y > 30 && e.y < G.H * 0.5) {
            e.shots--;
            e.fireT = 1.4;
            shoot(G, e.x, e.y, aim(G, e), 160, { color: BUL.orange });
          }
        }
      },
    },

    charger: {
      hp: 36, r: 13, value: 3, score: 120, charge: 3,
      init(e) {
        e.state = 'in';
        e.sx = e.x;
        e.sy = e.y;
        e.hy = e.hy || U.rand(70, 150);
        e.spd = 0;
      },
      update(e, dt, G) {
        if (e.state === 'in') {
          const k = e.t / 1;
          e.y = U.lerp(e.sy, e.hy, U.easeOut(k));
          if (k >= 1) {
            e.state = 'aim';
            e.st = 0;
          }
        } else if (e.state === 'aim') {
          e.st += dt;
          e.aimA = aim(G, e);
          e.rot = e.aimA - DOWN;
          if (e.st > 0.95 / Math.sqrt(G.diff.fire)) {
            e.state = 'dash';
            if (G.diff.s >= 3) fan(G, e.x, e.y, e.aimA, 3, 0.9, 150, { color: BUL.violet });
          }
        } else {
          e.spd = Math.min(560, e.spd + 1100 * dt);
          e.x += Math.cos(e.aimA) * e.spd * dt;
          e.y += Math.sin(e.aimA) * e.spd * dt;
        }
      },
    },

    gunship: {
      hp: 300, r: 27, value: 14, score: 600, charge: 12, big: true, drop: 'power',
      init(e) {
        e.form = { sx: e.x, sy: -40, hx: e.x, hy: e.hy || 115, enter: 2.2, stay: 16, amp: 40, sw: 0.6, ph: 0 };
        e.pat = 0;
        e.fireT = 1.4;
        e.burst = 0;
        e.burstT = 0;
      },
      update(e, dt, G) {
        formation(e, dt);
        if (e.t < e.form.enter || e.leaving) return;
        e.fireT -= dt * G.diff.fire;
        if (e.fireT <= 0) {
          const s = G.diff.s;
          const pat = e.pat % 3;
          if (pat === 0) fan(G, e.x, e.y + 22, aim(G, e, 0, 22), s >= 3 ? 7 : 5, 0.75, 150);
          else if (pat === 1) ring(G, e.x, e.y, 12 + Math.min(8, s * 2), e.t, 115, { color: BUL.pink, r: 5 });
          else e.burst = 3;
          e.pat++;
          e.fireT = 1.9;
        }
        if (e.burst > 0) {
          e.burstT -= dt;
          if (e.burstT <= 0) {
            e.burstT = 0.14;
            e.burst--;
            for (const sx of [-16, 16]) shoot(G, e.x + sx, e.y + 26, aim(G, e, sx, 26), 210, { color: BUL.orange });
          }
        }
      },
    },

    sniper: {
      hp: 90, r: 15, value: 5, score: 300, charge: 6,
      init(e) {
        e.form = { sx: e.x, sy: -30, hx: e.hx || e.x, hy: e.hy || 70, enter: 1.6, stay: 14, amp: 12, sw: 0.8, ph: 0 };
        e.state = 'idle';
        e.fireT = 1.2;
        e.aimA = DOWN;
      },
      update(e, dt, G) {
        formation(e, dt);
        if (e.t < e.form.enter || e.leaving) {
          e.state = 'idle';
          e.rot = 0;
          return;
        }
        if (e.state === 'idle') {
          e.rot = U.lerp(e.rot, 0, Math.min(1, dt * 4));
          e.fireT -= dt * G.diff.fire;
          if (e.fireT <= 0) {
            e.state = 'warn';
            e.st = 0;
            A.play('laserwarn');
          }
        } else if (e.state === 'warn') {
          e.st += dt;
          if (e.st < 0.8) e.aimA = aim(G, e);
          e.rot = e.aimA - DOWN;
          if (e.st > 1.1) {
            e.state = 'fire';
            e.shots = 5;
            e.shotT = 0;
          }
        } else {
          e.shotT -= dt;
          if (e.shotT <= 0) {
            e.shotT = 0.06;
            e.shots--;
            shoot(G, e.x + Math.cos(e.aimA) * 22, e.y + Math.sin(e.aimA) * 22, e.aimA, 400, { color: BUL.cyan, r: 4 });
            if (e.shots <= 0) {
              e.state = 'idle';
              e.fireT = 2.6;
            }
          }
        }
      },
    },

    mine: {
      hp: 30, r: 12, value: 2, score: 100, charge: 2,
      init(e) {
        e.vy = e.vy || U.rand(38, 55);
        e.armed = false;
        e.fuse = 0;
      },
      update(e, dt, G) {
        const p = G.player;
        e.y += e.vy * dt;
        e.x += (p.x - e.x) * 0.12 * dt;
        e.rot += dt * 0.8;
        if (!e.armed && p.alive && U.dist2(e.x, e.y, p.x, p.y) < 62 * 62) {
          e.armed = true;
          e.fuse = 0.7;
        }
        if (e.armed) {
          e.fuse -= dt;
          if (e.fuse <= 0) {
            // It blows up on its own: no reward, and it hurts if you're close.
            e.alive = false;
            G.fx.explode(e.x, e.y, 2, ['#FFF3B0', '#FFE45C', '#FF7A3D']);
            A.play('boom');
            if (U.dist2(e.x, e.y, p.x, p.y) < 44 * 44) G.hurt(22 * G.diff.dmg);
            burst(e, G);
          }
        }
      },
      death(e, G) {
        if (G.diff.s >= 2) burst(e, G);
      },
    },

    rock: {
      hp: 70, r: 26, value: 3, score: 100, charge: 3,
      init(e, G) {
        const s = e.size || 3;
        e.size = s;
        e.r = SF.art.ROCK_R[s];
        e.hp = [0, 12, 30, 70][s] * G.diff.hp;
        e.value = [0, 0, 1, 3][s];
        e.score = [0, 20, 50, 100][s];
        e.charge = s;
        e.variant = U.randInt(0, 2);
        e.spin = U.rand(-1.2, 1.2);
        if (e.vx === undefined || e.vx === 0) e.vx = U.rand(-25, 25);
        if (!e.vy) e.vy = U.rand(45, 85);
        e.contact = 10 + s * 6;
      },
      update(e, dt, G) {
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.rot += e.spin * dt;
        if ((e.x < e.r && e.vx < 0) || (e.x > G.W - e.r && e.vx > 0)) e.vx = -e.vx;
      },
      death(e, G) {
        if (e.size <= 1) return;
        for (const s of [-1, 1]) {
          spawn(G, 'rock', {
            size: e.size - 1, x: e.x + s * e.r * 0.3, y: e.y,
            vx: e.vx + s * U.rand(30, 70), vy: Math.max(30, e.vy * 0.8 + U.rand(-10, 30)), onScreen: true,
          });
        }
      },
    },

    turret: {
      hp: 520, r: 13, value: 10, score: 500, charge: 8, part: true,
      init(e) {
        e.fireT = U.rand(1, 2);
        e.aimA = DOWN;
        e.burst = 0;
        e.burstT = 0;
      },
      update(e, dt, G) {
        const b = e.parent;
        if (!b.alive || b.dying) {
          e.alive = false;
          G.fx.explode(e.x, e.y, 2);
          return;
        }
        e.x = b.x + e.dx;
        e.y = b.y + e.dy;
        e.onScreen = b.onScreen;
        e.invuln = b.invuln;
        e.aimA = aim(G, e);
        if (b.invuln) return;
        e.fireT -= dt * G.diff.fire;
        if (e.fireT <= 0) {
          e.fireT = 2.2;
          e.burst = 3;
        }
        if (e.burst > 0) {
          e.burstT -= dt;
          if (e.burstT <= 0) {
            e.burstT = 0.12;
            e.burst--;
            shoot(G, e.x + Math.cos(e.aimA) * 14, e.y + Math.sin(e.aimA) * 14, e.aimA, 190, { color: BUL.orange });
          }
        }
      },
    },

    boss: {
      hp: 5000, r: 40, value: 0, score: 5000, charge: 30, big: true,
      init(e, G) {
        const B = BOSSES[e.kind];
        e.name = B.name;
        e.sprite = e.kind;
        e.x = G.W / 2;
        e.y = -110;
        e.hy = B.hy;
        e.invuln = true;
        e.entering = true;
        e.ft = 0;
        e.spin = 0;
        e.a = 1.5;
        e.b = 0;
        e.bt = 0;
        e.c = 2;
        e.dir = 1;
        e.phase = 0;
        B.init(e, G);
      },
      update(e, dt, G) {
        const B = BOSSES[e.kind];
        if (e.dying) {
          bossDying(e, dt, G);
          return;
        }
        if (e.entering) {
          const k = e.t / 3.2;
          e.y = U.lerp(-110, e.hy, U.easeOut(k));
          if (k >= 1) {
            e.entering = false;
            e.invuln = false;
          }
          return;
        }
        e.ft += dt;
        const ratio = e.hp / e.maxHp;
        const ph = ratio > 0.6 ? 0 : ratio > 0.28 ? 1 : 2;
        if (ph > e.phase) {
          e.phase = ph;
          G.fx.ring(e.x, e.y, 20, 140, '#FFFFFF', 0.5, 4);
          G.shake = Math.max(G.shake, 6);
          A.play('boom');
        }
        B.update(e, dt, G, ph);
      },
    },
  };

  function burst(e, G) {
    const n = 8 + 2 * Math.min(3, G.diff.s - 1);
    ring(G, e.x, e.y, n, U.rand(0, TAU), 110, { color: BUL.yellow });
  }

  /* ---------- Bosses ---------- */

  const BOSSES = {
    dread: {
      name: 'Dreadnought', hy: 110,
      init(e, G) {
        e.box = { hw: 84, hh: 30 };
        e.r = 60;
        for (const sx of [-1, 1]) spawn(G, 'turret', { parent: e, dx: sx * 52, dy: 6, x: e.x + sx * 52, y: e.y });
      },
      update(e, dt, G, ph) {
        e.x = G.W / 2 + Math.sin(e.ft * 0.45) * 60;
        e.y = e.hy + Math.sin(e.ft * 0.9) * 6;
        e.a -= dt * G.diff.fire;
        if (e.a <= 0) {
          e.a = 2.6 - ph * 0.45;
          fan(G, e.x, e.y + 40, aim(G, e, 0, 40), 7 + ph * 2, 1.1 + ph * 0.2, 140, { r: 5 });
        }
        if (ph >= 1) {
          e.b += dt;
          if (e.b % 4.2 < 2.4) {
            e.bt -= dt;
            if (e.bt <= 0) {
              e.bt = 0.1;
              e.spin += 0.26;
              for (const k of [0, Math.PI]) shoot(G, e.x, e.y + 8, e.spin + k, 130, { color: BUL.pink });
            }
          }
        }
        if (ph >= 2) {
          e.c -= dt;
          if (e.c <= 0) {
            e.c = 2.8;
            ring(G, e.x, e.y + 8, 22, U.rand(0, TAU), 105, { color: BUL.violet, r: 5 });
          }
        }
      },
    },

    hive: {
      name: 'Hive Queen', hy: 125,
      init(e) {
        e.r = 48;
        e.b = 3;
      },
      update(e, dt, G, ph) {
        e.x = G.W / 2 + Math.sin(e.ft * 0.55) * 90;
        e.y = e.hy + Math.sin(e.ft * 1.1) * 22;
        e.a -= dt * G.diff.fire;
        if (e.a <= 0) {
          e.a = 1.8 - ph * 0.25;
          e.volley = (e.volley || 0) + 1;
          ring(G, e.x, e.y, 12 + ph * 3, e.spin, 110 + ph * 10, { color: BUL.pink });
          if (ph === 2 && e.volley % 2) ring(G, e.x, e.y, 10, e.spin + 0.3, 75, { color: BUL.violet });
          e.spin += 0.2;
        }
        e.b -= dt;
        if (e.b <= 0) {
          e.b = 7 - ph * 1.5;
          let drones = 0;
          for (const o of G.enemies) if (o.alive && o.type === 'drone') drones++;
          for (let k = 0; k < 3 && drones < 7; k++, drones++) {
            const a = ((k * 2 + 1) / 6) * TAU;
            const sx = e.x + Math.cos(a) * 37;
            const sy = e.y + Math.sin(a) * 37;
            spawn(G, 'drone', {
              x: sx, y: sy, onScreen: true, value: 0, charge: 1,
              form: { sx, sy, hx: U.rand(40, G.W - 40), hy: U.rand(190, 270), enter: 1.1, stay: 8, amp: 24, sw: 1.3, ph: k },
            });
          }
          G.fx.ring(e.x, e.y, 10, 60, BUL.pink, 0.4, 3);
        }
        if (ph >= 1) {
          e.c -= dt * G.diff.fire;
          if (e.c <= 0) {
            e.c = 2.4;
            fan(G, e.x, e.y + 30, aim(G, e, 0, 30), 5, 0.5, 190, { color: BUL.orange });
          }
        }
      },
    },

    warden: {
      name: 'The Warden', hy: 135,
      init(e) {
        e.r = 38;
        e.mode = 'rest';
        e.mt = 1.2;
        e.next = 'spiral';
        e.armRot = 0;
      },
      update(e, dt, G, ph) {
        e.x = G.W / 2 + Math.sin(e.ft * 0.35) * 90;
        e.y = e.hy + Math.sin(e.ft * 0.8) * 8;
        e.armRot += dt * (0.9 + ph * 0.45) * e.dir;
        e.mt -= dt;
        if (e.mode === 'spiral') {
          e.bt -= dt;
          if (e.bt <= 0) {
            e.bt = 0.11 - ph * 0.02;
            const n = 4 + ph;
            for (let k = 0; k < n; k++) {
              const a = e.armRot + (k * TAU) / n;
              shoot(G, e.x + Math.cos(a) * 30, e.y + Math.sin(a) * 30, a, 120, { color: BUL.yellow });
            }
          }
        }
        if (e.mt > 0) return;
        if (e.mode === 'spiral' || e.mode === 'laser') {
          e.next = e.mode === 'spiral' ? 'laser' : 'spiral';
          e.mode = 'rest';
          e.mt = 0.8;
          if (e.next === 'laser') e.dir = -e.dir;
        } else {
          e.mode = e.next;
          if (e.mode === 'spiral') {
            e.mt = 3.2;
            e.bt = 0;
          } else {
            e.mt = 1.9;
            const base = aim(G, e);
            const offs = ph === 0 ? [0] : ph === 1 ? [-0.28, 0.28] : [-0.42, 0, 0.42];
            for (const o of offs) G.hazards.push({ owner: e, x: e.x, y: e.y, ang: base + o, w: 16, warn: 1.1, fire: 0.6, t: 0, color: '#FFB23D', hit: false, fired: false });
            A.play('laserwarn');
          }
        }
      },
    },
  };

  function bossDying(e, dt, G) {
    e.dying -= dt;
    e.boomT -= dt;
    const w = e.box ? e.box.hw : e.r;
    if (e.boomT <= 0) {
      e.boomT = 0.11;
      G.fx.explode(e.x + U.rand(-w, w) * 0.8, e.y + U.rand(-e.r, e.r) * 0.5, U.pick([1, 2, 2]), ['#FFFFFF', '#FFB040', '#FF4D6A']);
      A.play('pop');
      G.shake = Math.max(G.shake, 5);
    }
    if (e.dying <= 0) {
      e.alive = false;
      G.fx.explode(e.x, e.y, 4, ['#FFFFFF', '#FFE45C', '#FF7A3D', '#FF4D6A']);
      G.fx.ring(e.x, e.y, 20, 260, '#FFFFFF', 0.8, 6);
      G.shake = 18;
      G.flash = 0.6;
      A.play('bigboom');
      G.bossKilled(e);
    }
  }

  /* ---------- Spawning ---------- */

  function spawn(G, type, props) {
    const T = TYPES[type];
    const e = Object.assign({
      type, x: G.W / 2, y: -30, vx: 0, vy: 0, t: 0, rot: 0, flash: 0,
      alive: true, onScreen: false, leaving: false, gone: false,
      hp: T.hp * G.diff.hp, r: T.r, value: T.value, score: T.score, charge: T.charge,
      big: !!T.big, drop: T.drop || null, part: !!T.part, contact: (T.big ? 32 : 24) * G.diff.dmg,
      fireT: U.rand(1.2, 2.4),
    }, props);
    if (T.init) T.init(e, G);
    e.maxHp = e.hp;
    G.enemies.push(e);
    return e;
  }

  function update(G, dt) {
    const L = G.enemies;
    for (let i = 0; i < L.length; i++) {
      const e = L[i];
      if (!e.alive) continue;
      e.t += dt;
      if (e.flash > 0) e.flash -= dt;
      TYPES[e.type].update(e, dt, G);
      if (!e.alive) continue;
      const m = e.box ? e.box.hw : e.r;
      const inside = e.y > -m * 0.8 && e.y < G.H + m && e.x > -m && e.x < G.W + m;
      if (inside) e.onScreen = true;
      else if ((e.onScreen || e.y > G.H) && e.type !== 'boss' && !e.part) e.gone = true;
      if (e.gone) e.alive = false;
    }
    for (let i = L.length - 1; i >= 0; i--) if (!L[i].alive) L.splice(i, 1);
  }

  function onDeath(e, G) {
    const T = TYPES[e.type];
    if (T.death) T.death(e, G);
  }

  SF.enemies = { spawn, update, onDeath, shoot, BUL, BOSSES, TYPES };
})(window.SF = window.SF || {});
