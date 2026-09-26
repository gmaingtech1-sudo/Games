/* Riftborn — the map screen: a dark street map of where you really are
   (or a neon grid when offline), with Rifts, their links and control
   fields, supply caches, wild creatures, and you. Drag to pan, pinch or
   scroll to zoom, tap something to interact. */
window.RB = window.RB || {};
(function (RB) {
  'use strict';

  const { clamp, TAU } = RB.util;
  const W = RB.world;
  const S = RB.state;
  const C = RB.creatures;

  const TILE_URL = (s, z, x, y) => `https://${s}.basemaps.cartocdn.com/dark_all/${z}/${x}/${y}@2x.png`;
  const MIN_MPP = 0.25, MAX_MPP = 6;
  const SIGHT = 300;          // creatures further than this aren't shown

  let canvas = null, ctx = null, dpr = 1, Wd = 1, Ht = 1;
  const view = { lat: 0, lng: 0, mpp: 0.9, follow: true };
  const player = { lat: 0, lng: 0, heading: null, walkTo: null, moving: 0 };
  let ents = { rifts: [], drops: [], spawns: [] };
  let handlers = { tap: null, tapGround: null, panned: null };
  let t = 0;

  /* ------------------ Setup ------------------ */

  function init(el, h) {
    canvas = el;
    ctx = canvas.getContext('2d');
    handlers = Object.assign(handlers, h);
    bindInput();
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    Wd = canvas.clientWidth;
    Ht = canvas.clientHeight;
    canvas.width = Math.round(Wd * dpr);
    canvas.height = Math.round(Ht * dpr);
  }

  function setPlayer(p) {
    Object.assign(player, p);
    if (view.follow) { view.lat = player.lat; view.lng = player.lng; }
  }

  function recenter() {
    view.follow = true;
    view.lat = player.lat;
    view.lng = player.lng;
  }

  function setEntities(e) { ents = e; }

  /* ------------------ Projection ------------------ */

  function toScreen(lat, lng) {
    const p = W.toXY(lat, lng), c = W.toXY(view.lat, view.lng);
    return [Wd / 2 + (p[0] - c[0]) / view.mpp, Ht * 0.55 - (p[1] - c[1]) / view.mpp];
  }

  function fromScreen(sx, sy) {
    const c = W.toXY(view.lat, view.lng);
    return W.toLL(c[0] + (sx - Wd / 2) * view.mpp, c[1] - (sy - Ht * 0.55) * view.mpp);
  }

  /* ------------------ Tiles ------------------ */

  const tiles = new Map();
  let tilesFailed = 0;

  function tile(z, x, y) {
    const key = `${z}/${x}/${y}`;
    let tl = tiles.get(key);
    if (tl) return tl;
    tl = { img: new Image(), ok: false };
    tl.img.crossOrigin = 'anonymous';
    tl.img.onload = () => { tl.ok = true; tilesFailed = 0; };
    tl.img.onerror = () => { tilesFailed++; };
    tl.img.src = TILE_URL('abcd'[(x + y) % 4], z, x, y);
    tiles.set(key, tl);
    if (tiles.size > 400) tiles.delete(tiles.keys().next().value);
    return tl;
  }

  const lng2x = (lng, z) => (lng + 180) / 360 * Math.pow(2, z);
  const lat2y = (lat, z) => (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, z);
  const x2lng = (x, z) => x / Math.pow(2, z) * 360 - 180;
  const y2lat = (y, z) => { const n = Math.PI - 2 * Math.PI * y / Math.pow(2, z); return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))); };

  function drawTiles() {
    const cosLat = Math.cos(view.lat * Math.PI / 180);
    const z = clamp(Math.round(Math.log2(156543.03 * cosLat / view.mpp)), 3, 19);
    const tl = fromScreen(0, 0), br = fromScreen(Wd, Ht);
    const x0 = Math.floor(lng2x(tl.lng, z)), x1 = Math.floor(lng2x(br.lng, z));
    const y0 = Math.floor(lat2y(tl.lat, z)), y1 = Math.floor(lat2y(br.lat, z));
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 60) return false;
    let drew = 0;
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const a = toScreen(y2lat(y, z), x2lng(x, z));
        const b = toScreen(y2lat(y + 1, z), x2lng(x + 1, z));
        const tl2 = tile(z, x, y);
        if (tl2.ok) {
          ctx.drawImage(tl2.img, a[0], a[1], b[0] - a[0] + 0.6, b[1] - a[1] + 0.6);
          drew++;
        } else {
          // Use a lower zoom tile as a placeholder while this one loads.
          const pz = z - 2, px = x >> 2, py = y >> 2;
          const pt = tiles.get(`${pz}/${px}/${py}`);
          if (pt && pt.ok) {
            const pa = toScreen(y2lat(py, pz), x2lng(px, pz));
            const pb = toScreen(y2lat(py + 1, pz), x2lng(px + 1, pz));
            ctx.save();
            ctx.beginPath(); ctx.rect(a[0], a[1], b[0] - a[0], b[1] - a[1]); ctx.clip();
            ctx.drawImage(pt.img, pa[0], pa[1], pb[0] - pa[0], pb[1] - pa[1]);
            ctx.restore();
          }
        }
      }
    }
    // Keep a coarser layer warm for placeholders.
    if (z - 2 >= 3) {
      for (let x = x0 >> 2; x <= x1 >> 2; x++) for (let y = y0 >> 2; y <= y1 >> 2; y++) tile(z - 2, x, y);
    }
    return drew > 0;
  }

  function drawGrid() {
    // Neon grid every 50 m, brighter every 250 m.
    const c = W.toXY(view.lat, view.lng);
    const x0 = c[0] - Wd / 2 * view.mpp, x1 = c[0] + Wd / 2 * view.mpp;
    const y0 = c[1] - Ht * 0.45 * view.mpp, y1 = c[1] + Ht * 0.55 * view.mpp;
    const step = view.mpp > 3 ? 250 : 50;
    ctx.lineWidth = 1;
    for (let gx = Math.floor(x0 / step) * step; gx <= x1; gx += step) {
      const sx = Wd / 2 + (gx - c[0]) / view.mpp;
      ctx.strokeStyle = Math.round(gx) % 250 === 0 ? 'rgba(150,110,255,0.28)' : 'rgba(150,110,255,0.1)';
      ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, Ht); ctx.stroke();
    }
    for (let gy = Math.floor(y0 / step) * step; gy <= y1; gy += step) {
      const sy = Ht * 0.55 - (gy - c[1]) / view.mpp;
      ctx.strokeStyle = Math.round(gy) % 250 === 0 ? 'rgba(150,110,255,0.28)' : 'rgba(150,110,255,0.1)';
      ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(Wd, sy); ctx.stroke();
    }
  }

  /* ------------------ Drawing ------------------ */

  function glowLine(a, b, color, width) {
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    ctx.restore();
    // Energy pulses travelling along the link.
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.floor(len / 90));
    ctx.fillStyle = '#FFFFFF';
    for (let i = 0; i < n; i++) {
      const u = ((t * 0.25 + i / n) % 1);
      ctx.globalAlpha = Math.sin(u * Math.PI) * 0.9;
      ctx.beginPath(); ctx.arc(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, 2, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawFieldsAndLinks() {
    const col = S.faction().color;
    for (const f of S.save.fields) {
      const p = f.ll.map((ll) => toScreen(ll[0], ll[1]));
      ctx.fillStyle = col + '2E';
      ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]); ctx.lineTo(p[1][0], p[1][1]); ctx.lineTo(p[2][0], p[2][1]); ctx.closePath(); ctx.fill();
    }
    for (const l of S.save.links) glowLine(toScreen(l.al[0], l.al[1]), toScreen(l.bl[0], l.bl[1]), col, 2.2);
  }

  function inRange(e) {
    return W.distM(player, e) <= S.RANGE;
  }

  function drawRift(r, now) {
    const [x, y] = toScreen(r.lat, r.lng);
    if (x < -60 || y < -60 || x > Wd + 60 || y > Ht + 60) return;
    const st = S.riftState(r, now);
    const col = S.riftColor(st);
    const size = clamp(24 / Math.sqrt(view.mpp), 16, 34);
    const near = inRange(r);
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.4 + r.lat * 1e4);
    // Beam of light
    const beam = ctx.createLinearGradient(x, y - size * 3.2, x, y);
    beam.addColorStop(0, col + '00');
    beam.addColorStop(1, col + (near ? '99' : '55'));
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(x - size * 0.35, y);
    ctx.lineTo(x - size * 0.12, y - size * 3.2);
    ctx.lineTo(x + size * 0.12, y - size * 3.2);
    ctx.lineTo(x + size * 0.35, y);
    ctx.fill();
    // Ground ring
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, 0.55);
    ctx.strokeStyle = col;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = col;
    ctx.shadowBlur = 12;
    ctx.globalAlpha = 0.6 + pulse * 0.4;
    ctx.beginPath(); ctx.arc(0, 0, size * (0.9 + pulse * 0.12), 0, TAU); ctx.stroke();
    ctx.restore();
    // The tear itself: a spinning crystal.
    ctx.save();
    ctx.translate(x, y - size * 0.95 - Math.sin(t * 2 + r.lng * 1e4) * 3);
    ctx.shadowColor = col;
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#140B22';
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    const sq = Math.cos(t * 1.5 + r.lat * 1e3);
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.7);
    ctx.lineTo(size * 0.42 * sq, 0);
    ctx.lineTo(0, size * 0.7);
    ctx.lineTo(-size * 0.42 * sq, 0);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.4 + pulse * 0.5;
    ctx.beginPath(); ctx.ellipse(0, 0, Math.abs(size * 0.18 * sq) + 1, size * 0.35, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
    // Level badge
    if (st.faction && size > 18) {
      ctx.font = `700 ${Math.round(size * 0.42)}px "Chakra Petch", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const bx = x + size * 0.7, by = y - size * 1.5;
      ctx.fillStyle = '#0D0818';
      ctx.beginPath(); ctx.arc(bx, by, size * 0.34, 0, TAU); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(st.mine ? '★' : `${st.level}`, bx, by + 1);
    }
    if (near && S.hackReady(r, now) === 0) {
      ctx.strokeStyle = '#FFFFFF';
      ctx.globalAlpha = 0.5 + pulse * 0.5;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 5]);
      ctx.beginPath(); ctx.arc(x, y - size * 0.95, size * 1.05, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
    r._s = [x, y - size * 0.9, size * 1.2];
  }

  function drawDrop(d, now) {
    const [x, y] = toScreen(d.lat, d.lng);
    if (x < -40 || y < -40 || x > Wd + 40 || y > Ht + 40) return;
    const ready = S.dropReady(d, now) === 0;
    const size = clamp(15 / Math.sqrt(view.mpp), 10, 22);
    const hover = Math.sin(t * 2.5 + d.lat * 1e4) * 3;
    const col = ready ? '#FFB020' : '#6A6385';
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(x, y, size * 0.8, size * 0.3, 0, 0, TAU); ctx.fill();
    ctx.save();
    ctx.translate(x, y - size * 1.3 + hover);
    if (ready) { ctx.shadowColor = col; ctx.shadowBlur = 14; }
    // Isometric crate
    ctx.fillStyle = ready ? '#C97B12' : '#4A4460';
    ctx.strokeStyle = '#120A1C';
    ctx.lineWidth = 1.5;
    const s = size * 0.8;
    ctx.beginPath(); ctx.moveTo(0, -s * 0.5); ctx.lineTo(s, 0); ctx.lineTo(0, s * 0.5); ctx.lineTo(-s, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = ready ? '#8A520A' : '#342F45';
    ctx.beginPath(); ctx.moveTo(-s, 0); ctx.lineTo(0, s * 0.5); ctx.lineTo(0, s * 1.4); ctx.lineTo(-s, s * 0.9); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = ready ? '#A8660E' : '#3E3852';
    ctx.beginPath(); ctx.moveTo(s, 0); ctx.lineTo(0, s * 0.5); ctx.lineTo(0, s * 1.4); ctx.lineTo(s, s * 0.9); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = col;
    ctx.fillRect(-s * 0.15, -s * 0.3, s * 0.3, s * 0.6);
    ctx.restore();
    d._s = [x, y - size, size * 1.3];
  }

  function drawSpawn(sp, now) {
    const [x, y] = toScreen(sp.lat, sp.lng);
    if (x < -60 || y < -60 || x > Wd + 60 || y > Ht + 60) return;
    const spec = C.byId(sp.sp);
    const h = clamp(30 / Math.sqrt(view.mpp) * (0.75 + Math.min(spec.size, 6) * 0.08), 18, 52);
    const rc = C.RARITY[spec.rar].color;
    const near = inRange(sp);
    // Rarity ring on the ground.
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, 0.4);
    ctx.strokeStyle = rc;
    ctx.globalAlpha = near ? 0.95 : 0.55;
    ctx.lineWidth = spec.rar >= 2 ? 3 : 2;
    ctx.beginPath(); ctx.arc(0, 0, h * 0.55, 0, TAU); ctx.stroke();
    ctx.restore();
    // Idle wander: pace back and forth a little.
    const ph = t * 0.5 + sp.seed;
    const dx = Math.sin(ph) * h * 0.25;
    const face = Math.cos(ph) >= 0 ? 1 : -1;
    const fly = spec.plan === 'flyer';
    C.draw(ctx, sp.sp, {
      x: x + dx, y: y - (fly ? h * 0.35 + Math.sin(t * 2 + sp.seed) * 4 : 0), h,
      t: t + sp.seed, walk: 0.6, phase: (t + sp.seed) * 5, face, seed: sp.seed,
      alpha: near ? 1 : 0.8, shadow: !fly, aura: spec.rar >= 2 ? undefined : false,
    });
    sp._s = [x + dx, y - h * 0.5, h * 0.7];
  }

  function drawPlayer() {
    const [x, y] = toScreen(player.lat, player.lng);
    const col = S.faction().color;
    const r = S.RANGE / view.mpp;
    // Reach circle
    ctx.fillStyle = col + '14';
    ctx.strokeStyle = col + '88';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.stroke();
    // Scan pulse
    const u = (t * 0.45) % 1;
    ctx.strokeStyle = col;
    ctx.globalAlpha = (1 - u) * 0.5;
    ctx.beginPath(); ctx.arc(x, y, r * (0.2 + u * 1.6), 0, TAU); ctx.stroke();
    ctx.globalAlpha = 1;
    // Walk target
    if (player.walkTo) {
      const w = toScreen(player.walkTo.lat, player.walkTo.lng);
      ctx.setLineDash([3, 6]);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(w[0], w[1]); ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = '#FFFFFF';
      ctx.beginPath(); ctx.arc(w[0], w[1], 6 + Math.sin(t * 6) * 1.5, 0, TAU); ctx.stroke();
    }
    // Avatar: a hovering agent marker
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.ellipse(0, 0, 11, 4, 0, 0, TAU); ctx.fill();
    const bob = Math.sin(t * 3) * 2 + (player.moving ? Math.abs(Math.sin(t * 9)) * -3 : 0);
    ctx.translate(0, -16 + bob);
    if (player.heading != null) {
      ctx.save();
      ctx.rotate(player.heading * Math.PI / 180);
      const g = ctx.createLinearGradient(0, 0, 0, -60);
      g.addColorStop(0, col + '66');
      g.addColorStop(1, col + '00');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-24, -60); ctx.lineTo(24, -60); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.shadowColor = col;
    ctx.shadowBlur = 14;
    ctx.fillStyle = '#120A1C';
    ctx.strokeStyle = col;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 11, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = col;
    ctx.font = '700 13px "Chakra Petch", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(S.faction().glyph, 0, 1);
    ctx.restore();
  }

  function render(dt, now) {
    t += dt;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bg = ctx.createRadialGradient(Wd / 2, Ht * 0.55, 10, Wd / 2, Ht * 0.55, Math.max(Wd, Ht));
    bg.addColorStop(0, '#1C1236');
    bg.addColorStop(1, '#07050F');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, Wd, Ht);
    let street = false;
    if (S.save.settings.map === 'streets' && tilesFailed < 12 && navigator.onLine !== false) street = drawTiles();
    if (street) {
      ctx.fillStyle = 'rgba(40, 10, 70, 0.28)';
      ctx.fillRect(0, 0, Wd, Ht);
    } else {
      drawGrid();
    }
    drawFieldsAndLinks();
    drawPlayer();
    const all = [];
    for (const d of ents.drops) all.push([d, drawDrop]);
    for (const r of ents.rifts) all.push([r, drawRift]);
    for (const s of ents.spawns) { s._s = null; if (!S.isGone(s) && W.distM(player, s) < SIGHT) all.push([s, drawSpawn]); }
    all.sort((a, b) => b[0].lat - a[0].lat);
    for (const [e, fn] of all) { e._s = null; fn(e, now); }
    // Faint vignette
    const v = ctx.createRadialGradient(Wd / 2, Ht / 2, Math.min(Wd, Ht) * 0.35, Wd / 2, Ht / 2, Math.max(Wd, Ht) * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(5,2,15,0.65)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, Wd, Ht);
  }

  /* ------------------ Input ------------------ */

  function hitTest(x, y) {
    let best = null, bd = Infinity;
    const consider = (e, bias) => {
      if (!e._s) return;
      const d = Math.hypot(x - e._s[0], y - e._s[1]) - bias;
      if (d < e._s[2] + 10 && d < bd) { best = e; bd = d; }
    };
    for (const s of ents.spawns) if (!S.isGone(s)) consider(s, 6);
    for (const r of ents.rifts) consider(r, 0);
    for (const d of ents.drops) consider(d, 0);
    return best;
  }

  function bindInput() {
    const pts = new Map();
    let start = null, moved = false, pinch = null;
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 1) { start = { x: e.clientX, y: e.clientY, t: performance.now(), lat: view.lat, lng: view.lng }; moved = false; }
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), mpp: view.mpp };
        moved = true;
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 2 && pinch) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        view.mpp = clamp(pinch.mpp * pinch.d / Math.max(d, 1), MIN_MPP, MAX_MPP);
        return;
      }
      if (pts.size === 1 && start) {
        const dx = e.clientX - start.x, dy = e.clientY - start.y;
        if (!moved && Math.hypot(dx, dy) > 10) moved = true;
        if (moved) {
          const c = W.toXY(start.lat, start.lng);
          const ll = W.toLL(c[0] - dx * view.mpp, c[1] + dy * view.mpp);
          view.lat = ll.lat;
          view.lng = ll.lng;
          if (view.follow) { view.follow = false; if (handlers.panned) handlers.panned(); }
        }
      }
    });
    const end = (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (pts.size === 0 && start && !moved && e.type === 'pointerup' && performance.now() - start.t < 500) {
        const r = canvas.getBoundingClientRect();
        const x = e.clientX - r.left, y = e.clientY - r.top;
        const hit = hitTest(x, y);
        if (hit) handlers.tap && handlers.tap(hit);
        else handlers.tapGround && handlers.tapGround(fromScreen(x, y));
      }
      if (pts.size === 0) start = null;
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      view.mpp = clamp(view.mpp * Math.exp(e.deltaY * 0.0015), MIN_MPP, MAX_MPP);
    }, { passive: false });
  }

  RB.map = {
    view, player,
    SIGHT, init, resize, render, setPlayer, setEntities, recenter,
    zoom(f) { view.mpp = clamp(view.mpp * f, MIN_MPP, MAX_MPP); },
    toScreen, fromScreen,
    get radiusM() { return Math.hypot(Wd, Ht) * 0.6 * view.mpp; },
  };
})(window.RB);
