/* Hyperdot — n-cube art: a point, a line, a square, a cube, a tesseract and a
   penteract, turning slowly in their own dimensions and drawn with each edge
   in the colour of its axis. A little dot runs along the edges. Used on the
   title screen, the world cards and the world intros. */
(function (HD) {
  'use strict';

  const { TAU, rgba } = HD.util;

  const cache = new Map();
  function shape(n) {
    let s = cache.get(n);
    if (s) return s;
    const verts = [];
    for (let i = 0; i < 1 << n; i++) {
      const v = [];
      for (let k = 0; k < n; k++) v.push((i >> k) & 1 ? 1 : -1);
      verts.push(v);
    }
    const edges = [];
    const adj = verts.map(() => []);
    for (let i = 0; i < verts.length; i++) {
      for (let k = 0; k < n; k++) {
        const j = i ^ (1 << k);
        if (j > i) edges.push([i, j, k]);
        adj[i].push(j);
      }
    }
    s = { n, verts, edges, adj };
    cache.set(n, s);
    return s;
  }

  // Planes each shape turns in, and how fast. The extra dimensions turn
  // against the visible ones, which is what makes a tesseract seem to turn
  // inside out.
  const SPIN = {
    1: [[0, 1, 0.35]],
    2: [[0, 1, 0.25]],
    3: [[0, 1, 0.35]],
    4: [[0, 1, 0.2], [0, 3, 0.4], [2, 3, 0.15]],
    5: [[0, 1, 0.18], [0, 3, 0.33], [1, 4, 0.27], [3, 4, 0.1]],
  };

  function rotate(p, a, b, ang) {
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const x = p[a];
    const y = p[b];
    p[a] = x * c - y * s;
    p[b] = x * s + y * c;
  }

  // Project an n-D point down to 3D (perspective, one dimension at a time),
  // then onto the screen with a fixed tilt.
  function project(v, n, t) {
    const p = v.slice();
    while (p.length < 3) p.push(0);
    for (const [a, b, w] of SPIN[n] || []) rotate(p, a, b, t * w + a * 0.7);
    // Each step's eye distance is set from the biggest the shape can be at
    // that point, so a corner can never reach the eye and blow up.
    let reach = Math.sqrt(n);
    for (let d = p.length - 1; d >= 3; d--) {
      const eye = 2.2 * reach;
      const f = eye / (eye - p[d]);
      for (let k = 0; k < d; k++) p[k] *= f;
      reach *= eye / (eye - reach);
    }
    // Tilt so 3D shapes are seen from a little above.
    if (n >= 3) {
      rotate(p, 1, 2, -0.55);
      rotate(p, 0, 1, 0.35);
    }
    const f = n < 3 ? 1 : 5 / (5 - p[1] * 0.7);
    return { x: p[0] * f, y: -p[2] * f + (n < 3 ? p[1] * f : 0), d: n < 3 ? 0 : p[1] };
  }

  const runners = new Map();

  /* Draw an n-cube. `o` = { x, y, size, t, alpha, lw, runner (bool), id } */
  function ncube(g, n, o) {
    const size = o.size;
    const alpha = o.alpha === undefined ? 1 : o.alpha;
    const t = o.t;
    if (n === 0) {
      HD.view.sprites.drawGlow(g, '#7DF9FF', o.x, o.y, size * 0.2, 0.9 * alpha);
      g.fillStyle = rgba('#FFFFFF', alpha);
      g.beginPath();
      g.arc(o.x, o.y, size * 0.035, 0, TAU);
      g.fill();
      return;
    }
    const s = shape(n);
    // Sized so every shape stays inside a `size` square as it turns.
    const sc = size * [0, 0.44, 0.33, 0.26, 0.2, 0.17][n];
    const pts = s.verts.map((v) => {
      const p = project(v, n, t);
      return { x: o.x + p.x * sc, y: o.y + p.y * sc, d: p.d };
    });
    const lw = o.lw || Math.max(1.2, size / 70);
    const order = s.edges.map((e) => ({ e, d: (pts[e[0]].d + pts[e[1]].d) / 2 })).sort((a, b) => b.d - a.d);
    g.lineCap = 'round';
    for (const { e, d } of order) {
      const a = pts[e[0]];
      const b = pts[e[1]];
      const near = Math.max(0.3, Math.min(1, 0.65 - d * 0.35));
      g.strokeStyle = rgba(HD.AXES[e[2]].color, alpha * near);
      g.lineWidth = lw * (0.7 + near * 0.6);
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.stroke();
    }
    g.fillStyle = rgba('#E8ECFF', 0.85 * alpha);
    for (const p of pts) {
      g.beginPath();
      g.arc(p.x, p.y, lw * 0.9, 0, TAU);
      g.fill();
    }

    if (o.runner) {
      const id = o.id || n;
      let r = runners.get(id);
      if (!r || r.n !== n) {
        r = { n, from: 0, to: s.adj[0][0], k: 0, prev: -1, last: t };
        runners.set(id, r);
      }
      const dt = Math.min(0.1, Math.max(0, t - r.last));
      r.last = t;
      r.k += dt * 1.6;
      while (r.k >= 1) {
        r.k -= 1;
        const opts = s.adj[r.to].filter((j) => j !== r.from);
        const nextV = opts.length ? opts[Math.floor(Math.random() * opts.length)] : r.from;
        r.prev = r.from;
        r.from = r.to;
        r.to = nextV;
      }
      const a = pts[r.from];
      const b = pts[r.to];
      const k = r.k < 0.5 ? 2 * r.k * r.k : 1 - Math.pow(-2 * r.k + 2, 2) / 2;
      const x = a.x + (b.x - a.x) * k;
      const y = a.y + (b.y - a.y) * k;
      HD.view.sprites.drawPlayer(g, x, y, Math.max(3, size * 0.035), t, alpha, true);
    }
  }

  HD.art = { ncube };
})(window.HD = window.HD || {});
