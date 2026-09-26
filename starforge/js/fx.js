/* Starforge — effects: particles (sparks, fireballs, shockwave rings, smoke,
   debris) and the scrolling space backdrop (stars, nebula, a far planet). */
(function (SF) {
  'use strict';

  const U = SF.util;
  const TAU = U.TAU;
  const FIRE = ['#FFF3B0', '#FFB040', '#FF5A3D'];

  class Particles {
    constructor(cap) {
      this.list = [];
      this.cap = cap || 900;
      this.scale = 1; // lower on "low" graphics
    }

    add(p) {
      if (this.list.length >= this.cap) return null;
      p.max = p.life;
      this.list.push(p);
      return p;
    }

    clear() {
      this.list.length = 0;
    }

    spark(x, y, color, n, speed, life) {
      n = Math.max(1, Math.round(n * this.scale));
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU;
        const s = speed * (0.3 + Math.random() * 0.7);
        this.add({ kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: (life || 0.35) * (0.6 + Math.random() * 0.6), color, w: 1.4, drag: 0.08 });
      }
    }

    // A directional spray, e.g. sparks bouncing off a hull.
    spray(x, y, ang, spread, color, n, speed) {
      n = Math.max(1, Math.round(n * this.scale));
      for (let i = 0; i < n; i++) {
        const a = ang + (Math.random() - 0.5) * spread;
        const s = speed * (0.4 + Math.random() * 0.6);
        this.add({ kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.2 + Math.random() * 0.15, color, w: 1.2, drag: 0.05 });
      }
    }

    glow(x, y, size, color, life, o) {
      return this.add(Object.assign({ kind: 'glow', x, y, vx: 0, vy: 0, size, color, life, grow: 0.6, drag: 0.2 }, o));
    }

    ring(x, y, r0, r1, color, life, w) {
      return this.add({ kind: 'ring', x, y, r0, r1, color, life, w: w || 3 });
    }

    // size: 1 small, 2 medium, 3 large, 4 huge.
    explode(x, y, size, palette) {
      const pal = palette || FIRE;
      const k = this.scale;
      this.glow(x, y, 14 * size, '#FFFFFF', 0.14, { grow: 0.4 });
      const balls = Math.round((2 + size * 3) * k);
      for (let i = 0; i < balls; i++) {
        const a = Math.random() * TAU;
        const d = Math.random() * 6 * size;
        const s = (20 + Math.random() * 50) * size;
        this.glow(x + Math.cos(a) * d, y + Math.sin(a) * d, (6 + Math.random() * 6) * size, pal[i % pal.length], 0.35 + Math.random() * 0.35, {
          vx: Math.cos(a) * s, vy: Math.sin(a) * s, grow: 1.2, drag: 0.02,
        });
      }
      this.spark(x, y, pal[0], 6 + size * 7, 110 + size * 70, 0.45);
      this.spark(x, y, pal[1], 3 + size * 4, 80 + size * 60, 0.6);
      this.ring(x, y, 4 * size, 26 * size, pal[1], 0.35 + size * 0.06, 1.5 + size);
      if (size >= 2) {
        const n = Math.round(size * 3 * k);
        for (let i = 0; i < n; i++) {
          const a = Math.random() * TAU;
          const s = 40 + Math.random() * 90 * size;
          this.add({ kind: 'debris', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, rot: Math.random() * TAU, spin: U.rand(-9, 9), size: U.rand(1.5, 3) * (size > 2 ? 1.4 : 1), color: '#3A3F55', life: 0.8 + Math.random() * 0.6, drag: 0.3 });
        }
        for (let i = 0; i < size; i++) {
          this.add({ kind: 'smoke', x: x + U.rand(-8, 8) * size, y: y + U.rand(-8, 8) * size, vx: U.rand(-15, 15), vy: U.rand(-15, 15), size: 10 * size, life: 0.9 + Math.random() * 0.6, grow: 1.3, drag: 0.3 });
        }
      }
    }

    update(dt) {
      const L = this.list;
      for (let i = L.length - 1; i >= 0; i--) {
        const p = L[i];
        p.life -= dt;
        if (p.life <= 0) {
          L[i] = L[L.length - 1];
          L.pop();
          continue;
        }
        if (p.vx !== undefined) {
          if (p.drag !== undefined) {
            const f = Math.pow(p.drag, dt);
            p.vx *= f;
            p.vy *= f;
          }
          p.x += p.vx * dt;
          p.y += p.vy * dt;
        }
        if (p.spin) p.rot += p.spin * dt;
      }
    }

    draw(g) {
      const L = this.list;
      // Smoke and debris block light, so they go first with normal blending.
      for (let i = 0; i < L.length; i++) {
        const p = L[i];
        const k = p.life / p.max;
        if (p.kind === 'smoke') {
          const s = p.size * (1 + p.grow * (1 - k));
          g.globalAlpha = 0.28 * k;
          g.drawImage(U.glow('#5A5F78'), p.x - s, p.y - s, s * 2, s * 2);
        } else if (p.kind === 'debris') {
          g.globalAlpha = Math.min(1, k * 2);
          g.save();
          g.translate(p.x, p.y);
          g.rotate(p.rot);
          g.fillStyle = p.color;
          g.fillRect(-p.size, -p.size * 0.6, p.size * 2, p.size * 1.2);
          g.restore();
        }
      }
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < L.length; i++) {
        const p = L[i];
        const k = p.life / p.max;
        switch (p.kind) {
          case 'spark':
            g.globalAlpha = k;
            g.strokeStyle = p.color;
            g.lineWidth = p.w;
            g.beginPath();
            g.moveTo(p.x, p.y);
            g.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035);
            g.stroke();
            break;
          case 'glow': {
            const s = p.size * (1 + p.grow * (1 - k));
            g.globalAlpha = k;
            g.drawImage(U.glow(p.color), p.x - s, p.y - s, s * 2, s * 2);
            break;
          }
          case 'ring': {
            const r = U.lerp(p.r1, p.r0, k * k);
            g.globalAlpha = k;
            g.strokeStyle = p.color;
            g.lineWidth = p.w * k + 0.5;
            g.beginPath();
            g.arc(p.x, p.y, r, 0, TAU);
            g.stroke();
            break;
          }
          default:
        }
      }
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }
  }

  /* ---------- Backdrop ---------- */

  const THEMES = [
    ['#2B1B6B', '#0E4C7A'],
    ['#6B1B3A', '#3A1B6B'],
    ['#0E5A5A', '#1B2B6B'],
    ['#6B3A12', '#5A1B4C'],
    ['#1B5A2B', '#123A6B'],
    ['#4C1B6B', '#6B1B1B'],
  ];
  const STAR_TINTS = ['#FFFFFF', '#CFE0FF', '#FFE9C9', '#BFD4FF', '#FFFFFF'];

  class Starfield {
    constructor() {
      this.w = 1;
      this.h = 1;
      this.stars = [];
      this.scroll = 0;
      this.warp = 0;
      this.nebula = null;
      this.planet = null;
      this.planetWait = 4;
      this.theme = -1;
      this.setTheme(0);
    }

    resize(w, h) {
      if (w === this.w && h === this.h && this.stars.length) return;
      this.w = w;
      this.h = h;
      const n = Math.min(260, Math.round((w * h) / 2600));
      this.stars = [];
      for (let i = 0; i < n; i++) {
        const z = Math.random();
        this.stars.push({
          x: Math.random() * w, y: Math.random() * h,
          z: 0.15 + z * 0.85,
          s: z > 0.93 ? 2 : z > 0.6 ? 1.4 : 1,
          c: U.pick(STAR_TINTS),
          tw: Math.random() * TAU,
        });
      }
      if (this.planet) this.planet.x = Math.min(this.planet.x, w - 20);
    }

    setTheme(i) {
      i = ((i % THEMES.length) + THEMES.length) % THEMES.length;
      if (i === this.theme) return;
      this.theme = i;
      const [a, b] = THEMES[i];
      // A small, seamless-vertically nebula texture, blurred by upscaling.
      const c = U.canvas(160, 320);
      const g = c.getContext('2d');
      const rnd = U.seeded(i * 7919 + 17);
      for (let k = 0; k < 16; k++) {
        const x = rnd() * 160;
        const y = rnd() * 320;
        const r = 30 + rnd() * 70;
        const col = k % 3 === 2 ? '#0A0C24' : k % 2 ? a : b;
        for (const oy of [-320, 0, 320]) {
          const gr = g.createRadialGradient(x, y + oy, 0, x, y + oy, r);
          gr.addColorStop(0, U.rgba(col, 0.32 + rnd() * 0.12));
          gr.addColorStop(1, U.rgba(col, 0));
          g.fillStyle = gr;
          g.fillRect(0, 0, 160, 320);
        }
      }
      this.nebula = c;
      this.planetWait = 3;
      this.planet = null;
    }

    makePlanet() {
      const r = U.rand(26, 70);
      const hue = U.rand(0, 360);
      const size = Math.ceil(r * 2 + 40);
      const c = U.canvas(size * 2, size * 2);
      const g = c.getContext('2d');
      g.scale(2, 2);
      const cx = size / 2;
      const ringed = Math.random() < 0.4;
      const tilt = U.rand(-0.5, 0.5);
      const drawRing = (front) => {
        g.save();
        g.translate(cx, cx);
        g.rotate(tilt);
        g.beginPath();
        if (front) g.ellipse(0, 0, r * 1.7, r * 0.42, 0, 0, Math.PI);
        else g.ellipse(0, 0, r * 1.7, r * 0.42, 0, Math.PI, TAU);
        g.strokeStyle = `hsla(${hue + 30},40%,70%,0.45)`;
        g.lineWidth = r * 0.18;
        g.stroke();
        g.restore();
      };
      if (ringed) drawRing(false);
      g.save();
      g.beginPath();
      g.arc(cx, cx, r, 0, TAU);
      g.clip();
      g.fillStyle = `hsl(${hue},45%,42%)`;
      g.fillRect(0, 0, size, size);
      for (let k = 0; k < 7; k++) {
        g.fillStyle = `hsla(${hue + U.rand(-20, 20)},${U.rand(30, 60)}%,${U.rand(30, 60)}%,0.35)`;
        g.fillRect(0, cx - r + (k / 7) * 2 * r + U.rand(-3, 3), size, U.rand(2, r * 0.25));
      }
      const sh = g.createRadialGradient(cx - r * 0.45, cx - r * 0.45, r * 0.1, cx, cx, r * 1.05);
      sh.addColorStop(0, 'rgba(255,255,255,0.18)');
      sh.addColorStop(0.55, 'rgba(0,0,0,0.1)');
      sh.addColorStop(1, 'rgba(0,0,8,0.85)');
      g.fillStyle = sh;
      g.fillRect(0, 0, size, size);
      g.restore();
      g.beginPath();
      g.arc(cx, cx, r + 1.5, 0, TAU);
      g.strokeStyle = `hsla(${hue},80%,75%,0.25)`;
      g.lineWidth = 2;
      g.stroke();
      if (ringed) drawRing(true);
      this.planet = { img: c, size, x: U.rand(0.1, 0.9) * this.w, y: -size, speed: U.rand(5, 10) };
    }

    // `speed` is how fast we're flying, in screen pixels per second for the nearest stars.
    update(dt, speed) {
      const v = speed * (1 + this.warp * 14);
      this.scroll += v * dt;
      for (const s of this.stars) {
        s.y += v * s.z * dt;
        if (s.y > this.h + 20) {
          s.y -= this.h + 30;
          s.x = Math.random() * this.w;
        }
        s.tw += dt * 2;
      }
      if (this.planet) {
        this.planet.y += this.planet.speed * dt * (1 + this.warp * 20);
        if (this.planet.y > this.h + 10) {
          this.planet = null;
          this.planetWait = U.rand(25, 45);
        }
      } else if ((this.planetWait -= dt) <= 0) {
        this.makePlanet();
      }
    }

    // Drawn in CSS pixels.
    draw(g) {
      const { w, h } = this;
      g.fillStyle = '#04050E';
      g.fillRect(0, 0, w, h);
      if (this.nebula) {
        const tw = Math.max(w, h * 0.5);
        const th = tw * 2;
        let y = ((this.scroll * 0.08) % th) - th;
        const x = (w - tw) / 2;
        for (; y < h; y += th) g.drawImage(this.nebula, x, y, tw, th);
      }
      if (this.planet) {
        const p = this.planet;
        g.drawImage(p.img, p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      const stretch = this.warp;
      for (const s of this.stars) {
        const a = 0.35 + 0.65 * s.z * (0.75 + 0.25 * Math.sin(s.tw));
        g.globalAlpha = a;
        g.fillStyle = s.c;
        if (stretch > 0.02) {
          const len = 2 + stretch * 90 * s.z;
          g.fillRect(s.x, s.y - len, s.s * 0.9, len);
        } else {
          g.fillRect(s.x, s.y, s.s, s.s);
        }
      }
      g.globalAlpha = 1;
    }
  }

  SF.Particles = Particles;
  SF.Starfield = Starfield;
  SF.FIRE = FIRE;
})(window.SF = window.SF || {});
