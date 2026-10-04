/* Frontline — the battlefield: terrain, cover, collisions, line of sight and
   the flow field that leads enemies around walls towards you.

   Every piece of cover is an axis-aligned rectangle:
     block — stops movement        tall — always stops bullets
     low   — sandbags: stops bullets, except ones fired from right behind it
   The ground is painted lazily in 512 px chunks, and craters, scorch marks and
   tank tracks are painted straight into those chunks. */
(function (FL) {
  'use strict';

  const U = FL.util;
  const CHUNK = 512;
  const GRID = 128;
  const NAV = 32;
  const LOW_SKIP = 46;

  const KINDS = {
    sandbag: { block: true, low: true },
    crate: { block: true, tall: true, hp: 60 },
    barrel: { block: true, tall: true, hp: 30, explodes: true },
    wall: { block: true, tall: true },
    concrete: { block: true, tall: true },
    building: { block: true, tall: true },
    hedge: { block: true, tall: true },
    hedgehog: { block: true },
    tree: { block: true, tall: true },
    rock: { block: true, tall: true },
    wreck: { block: true, tall: true },
    water: { block: true },
  };

  const THEMES = {
    beach: { base: '#CDB98A', speck: ['#BFA977', '#D9C79A', '#B49D6C'], tuft: null, density: 260 },
    grass: { base: '#6E7F3E', speck: ['#62733A', '#7C8C47', '#5A6935', '#86904F'], tuft: '#4F5E2C', density: 320 },
    town: { base: '#8A8270', speck: ['#7C7563', '#968E7B', '#6F6857', '#A39A86'], tuft: null, density: 280 },
    snow: { base: '#E4E9EE', speck: ['#D3DAE2', '#F2F5F8', '#C7D0DA'], tuft: '#AEB9C4', density: 220 },
    mud: { base: '#6E5F45', speck: ['#62553D', '#7A6A4E', '#584B35'], tuft: '#55602F', density: 300 },
  };

  class World {
    constructor(w, h, theme, seed) {
      this.w = w;
      this.h = h;
      this.theme = THEMES[theme] || THEMES.grass;
      this.themeName = theme;
      this.seed = seed || 1;
      this.obstacles = [];
      this.ground = [];       // big painted shapes: roads, water, fields
      this.decals = [];       // craters, scorch marks, tracks (also painted into chunks)
      this.wires = [];        // barbed wire: slows you down
      this.chunks = new Map();
      this.gcols = Math.ceil(w / GRID);
      this.grows = Math.ceil(h / GRID);
      this.grid = new Array(this.gcols * this.grows);
      for (let i = 0; i < this.grid.length; i++) this.grid[i] = [];
      this.stamp = 0;
      this.ncols = Math.ceil(w / NAV);
      this.nrows = Math.ceil(h / NAV);
      this.blocked = new Uint8Array(this.ncols * this.nrows);
      this.flow = new Int32Array(this.ncols * this.nrows);
      this.flowTarget = -1;
      this.navDirty = true;
    }

    /* ---------- Building ---------- */

    add(kind, x, y, w, h, extra) {
      const k = KINDS[kind];
      const o = {
        kind, x, y, w, h,
        block: !!k.block, tall: !!k.tall, low: !!k.low,
        hp: k.hp || 0, maxHp: k.hp || 0, explodes: !!k.explodes, dead: false, stamp: 0,
        seed: Math.floor(Math.random() * 1e6),
      };
      if (extra) Object.assign(o, extra);
      this.obstacles.push(o);
      this.index(o);
      this.navDirty = true;
      return o;
    }

    index(o) {
      const c0 = U.clamp(Math.floor(o.x / GRID), 0, this.gcols - 1);
      const c1 = U.clamp(Math.floor((o.x + o.w) / GRID), 0, this.gcols - 1);
      const r0 = U.clamp(Math.floor(o.y / GRID), 0, this.grows - 1);
      const r1 = U.clamp(Math.floor((o.y + o.h) / GRID), 0, this.grows - 1);
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this.grid[r * this.gcols + c].push(o);
    }

    remove(o) {
      o.dead = true;
      for (const cell of this.grid) {
        const i = cell.indexOf(o);
        if (i >= 0) cell.splice(i, 1);
      }
      this.navDirty = true;
    }

    // Calls fn(o) once for every obstacle touching the box.
    query(x0, y0, x1, y1, fn) {
      const c0 = U.clamp(Math.floor(Math.min(x0, x1) / GRID), 0, this.gcols - 1);
      const c1 = U.clamp(Math.floor(Math.max(x0, x1) / GRID), 0, this.gcols - 1);
      const r0 = U.clamp(Math.floor(Math.min(y0, y1) / GRID), 0, this.grows - 1);
      const r1 = U.clamp(Math.floor(Math.max(y0, y1) / GRID), 0, this.grows - 1);
      const s = ++this.stamp;
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const cell = this.grid[r * this.gcols + c];
          for (let i = 0; i < cell.length; i++) {
            const o = cell[i];
            if (o.stamp === s) continue;
            o.stamp = s;
            if (fn(o) === false) return;
          }
        }
      }
    }

    /* ---------- Collision ---------- */

    // First cover hit by the segment, as { t (0–1), o, nx, ny }, or null.
    // mode 'shot' — tall and low cover (low skipped near the shooter); 'sight' — tall only;
    // 'move' — anything that blocks movement.
    // lowSkip: distance from the start inside which low cover is ignored (a shooter
    // crouched right behind sandbags fires over them).
    segHit(x0, y0, x1, y1, mode, lowSkip) {
      const dx = x1 - x0;
      const dy = y1 - y0;
      const len = Math.hypot(dx, dy) || 1;
      let best = null;
      this.query(x0, y0, x1, y1, (o) => {
        if (mode === 'sight') { if (!o.tall) return; }
        else if (mode === 'shot') { if (!o.tall && !o.low) return; }
        else if (!o.block) return;
        // Slab test.
        let tmin = 0;
        let tmax = 1;
        let nx = 0;
        let ny = 0;
        if (Math.abs(dx) < 1e-9) {
          if (x0 < o.x || x0 > o.x + o.w) return;
        } else {
          let ta = (o.x - x0) / dx;
          let tb = (o.x + o.w - x0) / dx;
          let n = -1;
          if (ta > tb) { const t = ta; ta = tb; tb = t; n = 1; }
          if (ta > tmin) { tmin = ta; nx = n; ny = 0; }
          tmax = Math.min(tmax, tb);
          if (tmin > tmax) return;
        }
        if (Math.abs(dy) < 1e-9) {
          if (y0 < o.y || y0 > o.y + o.h) return;
        } else {
          let ta = (o.y - y0) / dy;
          let tb = (o.y + o.h - y0) / dy;
          let n = -1;
          if (ta > tb) { const t = ta; ta = tb; tb = t; n = 1; }
          if (ta > tmin) { tmin = ta; nx = 0; ny = n; }
          tmax = Math.min(tmax, tb);
          if (tmin > tmax) return;
        }
        if (mode === 'shot' && o.low && !o.tall && tmin * len < (lowSkip || 0)) return;
        if (!best || tmin < best.t) best = { t: tmin, o, nx, ny };
      });
      return best;
    }

    sight(x0, y0, x1, y1) {
      return !this.segHit(x0, y0, x1, y1, 'sight');
    }

    clearShot(x0, y0, x1, y1) {
      return !this.segHit(x0, y0, x1, y1, 'shot', LOW_SKIP);
    }

    // Slide a circle by (dx, dy), pushing it out of anything solid.
    move(e, dx, dy, r) {
      e.x += dx;
      e.y += dy;
      for (let pass = 0; pass < 2; pass++) {
        this.query(e.x - r, e.y - r, e.x + r, e.y + r, (o) => {
          if (!o.block) return;
          const cx = U.clamp(e.x, o.x, o.x + o.w);
          const cy = U.clamp(e.y, o.y, o.y + o.h);
          let ox = e.x - cx;
          let oy = e.y - cy;
          const d = Math.hypot(ox, oy);
          if (d >= r) return;
          if (d > 0.0001) {
            e.x += (ox / d) * (r - d);
            e.y += (oy / d) * (r - d);
          } else {
            // Centre is inside the box: leave by the nearest side.
            const l = e.x - o.x;
            const rr = o.x + o.w - e.x;
            const t = e.y - o.y;
            const b = o.y + o.h - e.y;
            const m = Math.min(l, rr, t, b);
            if (m === l) e.x = o.x - r;
            else if (m === rr) e.x = o.x + o.w + r;
            else if (m === t) e.y = o.y - r;
            else e.y = o.y + o.h + r;
          }
        });
      }
      e.x = U.clamp(e.x, r, this.w - r);
      e.y = U.clamp(e.y, r, this.h - r);
    }

    solidAt(x, y, r) {
      let hit = false;
      this.query(x - r, y - r, x + r, y + r, (o) => {
        if (!o.block) return;
        const cx = U.clamp(x, o.x, o.x + o.w);
        const cy = U.clamp(y, o.y, o.y + o.h);
        if (Math.hypot(x - cx, y - cy) < r) { hit = true; return false; }
      });
      return hit || x < r || y < r || x > this.w - r || y > this.h - r;
    }

    inWire(x, y) {
      for (const w of this.wires) if (x > w.x && x < w.x + w.w && y > w.y && y < w.y + w.h) return true;
      return false;
    }

    /* ---------- Flow field ---------- */

    buildNav() {
      this.blocked.fill(0);
      const pad = 12;
      for (const o of this.obstacles) {
        if (o.dead || !o.block) continue;
        const c0 = Math.max(0, Math.floor((o.x - pad) / NAV));
        const c1 = Math.min(this.ncols - 1, Math.floor((o.x + o.w + pad) / NAV));
        const r0 = Math.max(0, Math.floor((o.y - pad) / NAV));
        const r1 = Math.min(this.nrows - 1, Math.floor((o.y + o.h + pad) / NAV));
        for (let r = r0; r <= r1; r++) {
          for (let c = c0; c <= c1; c++) {
            const cx = c * NAV + NAV / 2;
            const cy = r * NAV + NAV / 2;
            if (cx > o.x - pad && cx < o.x + o.w + pad && cy > o.y - pad && cy < o.y + o.h + pad) this.blocked[r * this.ncols + c] = 1;
          }
        }
      }
      this.navDirty = false;
      this.flowTarget = -1;
      this.navV = (this.navV || 0) + 1;
    }

    // A separate field to follow somewhere other than the player (used by AFK mode).
    makeField() {
      return { flow: new Int32Array(this.ncols * this.nrows), flowTarget: -1, navV: -1 };
    }

    // Breadth-first distances from (tx, ty) to every open cell, into `field`
    // (the enemies' shared field when omitted).
    updateFlow(tx, ty, field) {
      if (this.navDirty) this.buildNav();
      const F = field || this;
      const cols = this.ncols;
      const rows = this.nrows;
      let start = U.clamp(Math.floor(ty / NAV), 0, rows - 1) * cols + U.clamp(Math.floor(tx / NAV), 0, cols - 1);
      if (start === F.flowTarget && F.navV === this.navV) return;
      F.flowTarget = start;
      F.navV = this.navV;
      const f = F.flow;
      f.fill(-1);
      const q = this._q || (this._q = new Int32Array(cols * rows));
      let head = 0;
      let tail = 0;
      f[start] = 0;
      q[tail++] = start;
      while (head < tail) {
        const i = q[head++];
        const c = i % cols;
        const d = f[i] + 1;
        const n = [c > 0 ? i - 1 : -1, c < cols - 1 ? i + 1 : -1, i - cols, i + cols];
        for (let k = 0; k < 4; k++) {
          const j = n[k];
          if (j < 0 || j >= f.length || f[j] !== -1 || this.blocked[j]) continue;
          f[j] = d;
          q[tail++] = j;
        }
      }
    }

    // Direction (angle) to walk from (x, y) to follow the flow field, or null.
    flowDir(x, y, field) {
      const cols = this.ncols;
      const c = U.clamp(Math.floor(x / NAV), 0, cols - 1);
      const r = U.clamp(Math.floor(y / NAV), 0, this.nrows - 1);
      const f = (field || this).flow;
      const here = f[r * cols + c];
      let best = here >= 0 ? here : 1e9;
      let bx = -1;
      let by = -1;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nc = c + dx;
          const nr = r + dy;
          if (nc < 0 || nr < 0 || nc >= cols || nr >= this.nrows) continue;
          const v = f[nr * cols + nc];
          if (v < 0) continue;
          // No cutting corners past a blocked cell.
          if (dx && dy && (this.blocked[r * cols + nc] || this.blocked[nr * cols + c])) continue;
          const cost = v + (dx && dy ? 0.4 : 0);
          if (cost < best) { best = cost; bx = nc; by = nr; }
        }
      }
      if (bx < 0) return null;
      return Math.atan2(by * NAV + NAV / 2 - y, bx * NAV + NAV / 2 - x);
    }

    /* ---------- Painting the ground ---------- */

    decal(d) {
      this.decals.push(d);
      if (this.decals.length > 4000) this.decals.splice(0, 500);
      const r = (d.r || 20) + 4;
      for (const [key, cv] of this.chunks) {
        const cx = (key % 1000) * CHUNK;
        const cy = Math.floor(key / 1000) * CHUNK;
        if (d.x + r < cx || d.x - r > cx + CHUNK || d.y + r < cy || d.y - r > cy + CHUNK) continue;
        const g = cv.getContext('2d');
        g.save();
        g.translate(-cx, -cy);
        paintDecal(g, d);
        g.restore();
      }
    }

    chunk(cx, cy) {
      const key = cy * 1000 + cx;
      let cv = this.chunks.get(key);
      if (cv) return cv;
      cv = document.createElement('canvas');
      cv.width = CHUNK;
      cv.height = CHUNK;
      const g = cv.getContext('2d');
      const th = this.theme;
      g.fillStyle = th.base;
      g.fillRect(0, 0, CHUNK, CHUNK);
      const rng = U.seeded(this.seed * 7919 + cx * 73856093 + cy * 19349663);
      // Mottled patches, then specks, then grass tufts.
      for (let i = 0; i < 26; i++) {
        g.fillStyle = th.speck[Math.floor(rng() * th.speck.length)];
        g.globalAlpha = 0.25;
        g.beginPath();
        g.ellipse(rng() * CHUNK, rng() * CHUNK, 30 + rng() * 70, 20 + rng() * 50, rng() * 3, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
      for (let i = 0; i < th.density; i++) {
        g.fillStyle = th.speck[Math.floor(rng() * th.speck.length)];
        const s = 1 + rng() * 2.5;
        g.fillRect(rng() * CHUNK, rng() * CHUNK, s, s);
      }
      if (th.tuft) {
        g.strokeStyle = th.tuft;
        g.lineWidth = 1.5;
        for (let i = 0; i < th.density / 6; i++) {
          const x = rng() * CHUNK;
          const y = rng() * CHUNK;
          g.beginPath();
          for (let k = 0; k < 4; k++) {
            g.moveTo(x, y);
            g.lineTo(x + (rng() - 0.5) * 9, y - 4 - rng() * 6);
          }
          g.stroke();
        }
      }
      g.save();
      g.translate(-cx * CHUNK, -cy * CHUNK);
      const x0 = cx * CHUNK;
      const y0 = cy * CHUNK;
      for (const s of this.ground) {
        if (s.bx + s.bw < x0 || s.bx > x0 + CHUNK || s.by + s.bh < y0 || s.by > y0 + CHUNK) continue;
        paintShape(g, s, rng);
      }
      for (const d of this.decals) {
        const r = (d.r || 20) + 4;
        if (d.x + r < x0 || d.x - r > x0 + CHUNK || d.y + r < y0 || d.y - r > y0 + CHUNK) continue;
        paintDecal(g, d);
      }
      g.restore();
      this.chunks.set(key, cv);
      return cv;
    }

    // Adds a ground shape and works out its bounding box.
    paint(s) {
      if (s.t === 'rect' || s.t === 'water' || s.t === 'field' || s.t === 'floor') {
        s.bx = s.x; s.by = s.y; s.bw = s.w; s.bh = s.h;
      } else if (s.t === 'road' || s.t === 'poly') {
        let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
        for (const p of s.pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
        const pad = (s.width || 0) / 2 + 4;
        s.bx = x0 - pad; s.by = y0 - pad; s.bw = x1 - x0 + pad * 2; s.bh = y1 - y0 + pad * 2;
      } else if (s.t === 'circle') {
        s.bx = s.x - s.r; s.by = s.y - s.r; s.bw = s.bh = s.r * 2;
      }
      this.ground.push(s);
    }

    drawGround(g, vx, vy, vw, vh) {
      const c0 = Math.max(0, Math.floor(vx / CHUNK));
      const c1 = Math.min(Math.ceil(this.w / CHUNK) - 1, Math.floor((vx + vw) / CHUNK));
      const r0 = Math.max(0, Math.floor(vy / CHUNK));
      const r1 = Math.min(Math.ceil(this.h / CHUNK) - 1, Math.floor((vy + vh) / CHUNK));
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) g.drawImage(this.chunk(c, r), c * CHUNK, r * CHUNK);
    }
  }

  function paintShape(g, s, rng) {
    if (s.t === 'water') {
      const grad = g.createLinearGradient(s.x, s.y, s.x, s.y + s.h);
      grad.addColorStop(0, s.c0 || '#3F6E7E');
      grad.addColorStop(1, s.c1 || '#2B5466');
      g.fillStyle = grad;
      g.fillRect(s.x, s.y, s.w, s.h);
      g.strokeStyle = 'rgba(255,255,255,0.18)';
      g.lineWidth = 2;
      for (let i = 0; i < (s.w * s.h) / 9000; i++) {
        const x = s.x + rng() * s.w;
        const y = s.y + rng() * s.h;
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo(x + 10, y - 4, x + 20, y);
        g.stroke();
      }
      if (s.foam) {
        g.fillStyle = 'rgba(255,255,255,0.35)';
        for (let x = s.x; x < s.x + s.w; x += 14) g.fillRect(x, s.y + Math.sin(x * 0.05) * 4, 16, 5);
      }
    } else if (s.t === 'rect' || s.t === 'field' || s.t === 'floor') {
      g.fillStyle = s.color;
      g.fillRect(s.x, s.y, s.w, s.h);
      if (s.t === 'field') {
        // Ploughed furrows.
        g.strokeStyle = s.line || 'rgba(0,0,0,0.12)';
        g.lineWidth = 3;
        g.beginPath();
        for (let y = s.y + 8; y < s.y + s.h; y += 14) { g.moveTo(s.x, y); g.lineTo(s.x + s.w, y); }
        g.stroke();
      } else if (s.t === 'floor' && s.planks) {
        g.strokeStyle = 'rgba(0,0,0,0.25)';
        g.lineWidth = 1.5;
        g.beginPath();
        for (let y = s.y + 10; y < s.y + s.h; y += 10) { g.moveTo(s.x, y); g.lineTo(s.x + s.w, y); }
        g.stroke();
      } else if (s.t === 'floor') {
        g.strokeStyle = 'rgba(0,0,0,0.18)';
        g.lineWidth = 1;
        g.beginPath();
        for (let x = s.x; x < s.x + s.w; x += 24) { g.moveTo(x, s.y); g.lineTo(x, s.y + s.h); }
        for (let y = s.y; y < s.y + s.h; y += 24) { g.moveTo(s.x, y); g.lineTo(s.x + s.w, y); }
        g.stroke();
        g.fillStyle = 'rgba(60,50,40,0.5)';
        for (let i = 0; i < (s.w * s.h) / 1500; i++) {
          const r = 2 + rng() * 6;
          g.beginPath();
          g.arc(s.x + rng() * s.w, s.y + rng() * s.h, r, 0, Math.PI * 2);
          g.fill();
        }
      }
      if (s.edge) {
        g.strokeStyle = s.edge;
        g.lineWidth = 3;
        g.strokeRect(s.x, s.y, s.w, s.h);
      }
    } else if (s.t === 'circle') {
      g.fillStyle = s.color;
      g.beginPath();
      g.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      g.fill();
    } else if (s.t === 'poly') {
      g.fillStyle = s.color;
      g.beginPath();
      s.pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
      g.closePath();
      g.fill();
    } else if (s.t === 'road') {
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.strokeStyle = s.edge || 'rgba(0,0,0,0.15)';
      g.lineWidth = s.width + 6;
      g.beginPath();
      s.pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
      g.stroke();
      g.strokeStyle = s.color;
      g.lineWidth = s.width;
      g.stroke();
      if (s.ruts) {
        g.strokeStyle = 'rgba(0,0,0,0.12)';
        g.lineWidth = 4;
        g.setLineDash([18, 10]);
        g.stroke();
        g.setLineDash([]);
      }
    }
  }

  function paintDecal(g, d) {
    if (d.t === 'crater') {
      const grad = g.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r);
      grad.addColorStop(0, 'rgba(30,24,18,0.75)');
      grad.addColorStop(0.6, 'rgba(50,40,30,0.5)');
      grad.addColorStop(0.85, 'rgba(90,75,55,0.35)');
      grad.addColorStop(1, 'rgba(90,75,55,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      g.fill();
    } else if (d.t === 'scorch') {
      const grad = g.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r);
      grad.addColorStop(0, 'rgba(15,12,10,0.55)');
      grad.addColorStop(1, 'rgba(15,12,10,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      g.fill();
    } else if (d.t === 'track') {
      g.save();
      g.translate(d.x, d.y);
      g.rotate(d.a);
      g.fillStyle = d.snow ? 'rgba(120,130,140,0.35)' : 'rgba(40,32,22,0.28)';
      const s = d.w || 22;
      g.fillRect(-4, -s - 4, 8, 8);
      g.fillRect(-4, s - 4, 8, 8);
      g.restore();
    } else if (d.t === 'shell') {
      g.fillStyle = '#C8A04A';
      g.fillRect(d.x, d.y, 3, 1.5);
    } else if (d.t === 'rubble') {
      g.fillStyle = d.color || 'rgba(110,100,90,0.9)';
      g.beginPath();
      g.arc(d.x, d.y, d.r * 0.3, 0, Math.PI * 2);
      g.fill();
    }
  }

  FL.World = World;
  FL.world = { KINDS, THEMES, NAV, LOW_SKIP };
})(window.FL);
