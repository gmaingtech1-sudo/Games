/* Hyperdot — the play screen. Owns the current level and its history,
   turns taps, swipes, drags, pad presses and keys into moves, animates them,
   and draws the view: the main scene plus, from 3D up, the panels that show
   every slice (floors in 3D, W slices in 4D, a W × V grid in 5D). */
(function (HD) {
  'use strict';

  const U = HD.util;
  const G = HD.grid;
  const R = HD.rules;
  const V = HD.view;
  const A = HD.audio;
  const P = HD.progress;
  const { clamp, lerp, easeOut, easeInOut, rgba } = U;
  const $ = (id) => document.getElementById(id);

  const els = {
    screen: $('game'), stage: $('g-stage'), canvas: $('g-canvas'), back: $('g-back'),
    world: $('g-world'), name: $('g-name'), moves: $('g-moves'), par: $('g-par'),
    status: $('g-status'), tip: $('g-tip'), peek: $('g-peek'), pad: $('pad'),
    undo: $('g-undo'), restart: $('g-restart'), hint: $('g-hint'), help: $('g-help'), view: $('g-view'),
  };
  const g = els.canvas.getContext('2d');

  const CAM0 = { yaw: -0.62, pitch: 0.9 };

  let L = null;
  let def = null;
  let ctx = null; // { mode: 'campaign', level } or { mode: 'endless', n, seed }
  let s = null;
  let hist = [];
  let hinted = false;
  let won = false;
  let running = false;
  let flat = true;
  let pad = null;
  let t = 0;
  let W = 0;
  let H = 0;
  let dpr = 1;

  const cam = { yaw: CAM0.yaw, pitch: CAM0.pitch };
  const camVel = { yaw: 0, pitch: 0 };
  let camGoal = null;

  let anim = null; // the move being animated
  let bump = null;
  let fxItem = null;
  let fxDoor = null;
  let gateK = 0;
  let peek = null; // hidden coords of a slice you're looking into
  let hint = null; // { axis, dir }
  let hintCache = null;
  let toldOnce = {};
  let lastProj = null;
  let sparks = [];
  let winT = -1;

  // Screen regions, worked out on resize.
  let viewBox = { x: 0, y: 0, w: 0, h: 0 };
  let panels = [];
  let scale = 40;

  /* ---------- Starting ---------- */

  function start(levelDef, c) {
    def = levelDef;
    ctx = c;
    L = G.compile(def);
    flat = L.n <= 2;
    s = R.initial(L);
    hist = [];
    hinted = false;
    won = false;
    running = true;
    anim = null;
    bump = null;
    fxItem = null;
    fxDoor = null;
    peek = null;
    hint = null;
    hintCache = null;
    sparks = [];
    winT = -1;
    toldOnce = {};
    gateK = R.platesHeld(L, s) ? 1 : 0;
    if (!flat && !c.keepCam) {
      cam.yaw = CAM0.yaw;
      cam.pitch = CAM0.pitch;
    }
    camVel.yaw = camVel.pitch = 0;
    camGoal = null;

    const w = HD.levels.WORLDS[L.n - 1];
    if (c.mode === 'campaign') {
      els.world.textContent = `${L.n}D · ${w.name} · ${def.id}`;
      els.name.textContent = def.name;
    } else {
      els.world.textContent = `${L.n}D · Endless`;
      els.name.textContent = `Puzzle ${P.data.endless[L.n] + 1}`;
    }
    els.par.textContent = def.par;
    els.view.hidden = flat;

    pad = HD.controls.build(els.pad, L.n, (a, d) => move(a, d));
    pad.remap(cam, flat);

    els.tip.textContent = def.tip || '';
    els.tip.hidden = !def.tip;

    els.screen.hidden = false;
    resize();
    refresh();
  }

  function stop() {
    running = false;
    if (pad) pad.destroy();
  }

  /* ---------- Moving ---------- */

  const hiddenOf = (cell) => {
    const out = [];
    for (let k = 3; k < L.n; k++) out.push(G.coord(L, cell, k));
    return out;
  };

  function finishAnim() {
    if (!anim) return;
    const a = anim;
    anim = null;
    if (a.win) celebrate();
  }

  function move(axis, dir) {
    if (!running || won || !L) return;
    finishAnim();
    A.unlock();
    if (peek) setPeek(null);
    const r = R.move(L, s, axis, dir);
    if (!r.ok) {
      bump = { axis, dir, k: 0 };
      A.play('bump');
      vibe(12);
      explainBlock(r);
      return;
    }
    const prev = s;
    hist.push(prev);
    s = r.state;
    // Following a hint shows the next step straight away.
    const followed = hint && hint.axis === axis && hint.dir === dir && hintCache && hintCache.path;
    if (followed && hintCache.path.length > 1) {
      hintCache = { moves: hintCache.moves - 1, path: hintCache.path.slice(1) };
      hint = { axis: hintCache.path[0][0], dir: hintCache.path[0][1] };
    } else {
      hint = null;
      hintCache = null;
    }

    const fromXYZ = V.xyz(L, prev.pos);
    const toXYZ = V.xyz(L, s.pos);
    const slice = axis >= 3;
    anim = {
      k: 0,
      dur: slice ? 0.32 : 0.12,
      axis,
      dir,
      slice,
      prev,
      from: fromXYZ,
      to: toXYZ,
      pushed: r.pushed,
      crateFrom: r.pushed >= 0 ? V.xyz(L, prev.crates[r.pushed]) : null,
      crateTo: r.pushed >= 0 ? V.xyz(L, s.crates[r.pushed]) : null,
      win: r.win,
    };

    if (slice) A.play('slice', axis, dir);
    else A.play('move', axis, dir);
    for (const e of r.events) {
      if (e === 'shard' || e === 'key') {
        fxItem = { cell: s.pos, k: 0 };
        burst(s.pos, e === 'shard' ? V.COL.shard : G.KEY_COLORS[L.items[L.itemAt[s.pos]].color]);
      }
      if (e === 'door') fxDoor = { cell: s.pos, k: 0 };
      if (e !== 'shard' || !r.events.includes('exit-open')) A.play(e);
      if (e === 'exit-open') A.play('shard');
    }
    if (r.events.includes('push')) vibe(8);
    if (s.pos === L.exit && !r.win && L.shardCount) {
      say('exit', `The exit opens once every shard is collected (${R.shardsLeft(L, s)} left).`);
    }
    refresh();
  }

  function explainBlock(r) {
    if (r.why === 'door') {
      const c = L.doors[r.door].color;
      say('door' + c, `This door needs a ${G.KEY_NAMES[c]} key.`);
    } else if (r.why === 'gate') {
      say('gate', L.plates.length > 1 ? 'Gates open while every plate is held down.' : 'Gates open while the plate is held down.');
    } else if (r.why === 'crate') {
      say('crate', 'That crate can’t move: something is behind it.');
    }
  }

  function say(key, msg) {
    if (toldOnce[key]) return;
    toldOnce[key] = true;
    HD.ui.toast(msg);
  }

  function undo() {
    if (!running || won || !hist.length) {
      A.play('deny');
      return;
    }
    finishAnim();
    s = hist.pop();
    hint = null;
    hintCache = null;
    A.play('undo');
    refresh();
  }

  function restart() {
    if (!running) return;
    if (!hist.length && !won) return;
    finishAnim();
    s = R.initial(L);
    hist = [];
    hinted = false;
    won = false;
    winT = -1;
    hint = null;
    hintCache = null;
    A.play('undo');
    HD.ui.hideWin();
    refresh();
  }

  function showHint() {
    if (!running || won) return;
    finishAnim();
    const sol = hintCache || HD.solver.solve(L, s, 400000);
    hintCache = sol;
    if (sol.moves < 0) {
      A.play('deny');
      HD.ui.toast(sol.capped ? 'This one is too big to hint from here. Try undoing a few moves.' : 'No way to win from here. Undo or restart.');
      return;
    }
    const [axis, dir] = sol.path[0];
    hint = { axis, dir };
    if (!hinted) HD.ui.toast('Hint: follow the glowing move. Runs that use a hint earn one star.');
    hinted = true;
    A.play('hint');
    refresh();
  }

  function celebrate() {
    won = true;
    winT = 0;
    A.play('win');
    vibe([20, 40, 30]);
    burst(L.exit, V.COL.exit, 26);
    const moves = hist.length;
    const stars = P.starsFor(moves, def.par, hinted);
    let best = false;
    if (ctx.mode === 'campaign') {
      const had = P.result(def.id);
      best = P.record(def.id, moves, stars) && !!had;
      P.data.last = def.id;
      P.save();
    } else {
      P.data.endless[L.n]++;
      P.save();
    }
    setTimeout(() => {
      if (running && won) HD.ui.showWin({ moves, par: def.par, stars, best, hinted, ctx });
    }, 750);
  }

  function vibe(p) {
    if (!P.data.settings.vibe) return;
    try {
      if (HD.native) HD.native.vibrate(JSON.stringify([].concat(p)));
      else if (navigator.vibrate) navigator.vibrate(p);
    } catch (e) { /* ignore */ }
  }

  /* ---------- HUD ---------- */

  function can(axis, dir) {
    if (axis >= L.n) return false;
    return R.move(L, s, axis, dir).ok;
  }

  function refresh() {
    els.moves.textContent = hist.length;
    els.moves.classList.toggle('over', hist.length > def.par);
    els.undo.disabled = !hist.length;
    // Shards, keys and where you are along the hidden axes.
    let html = '';
    if (L.shardCount) {
      const got = L.shardCount - R.shardsLeft(L, s);
      html += `<span class="chip shard${got === L.shardCount ? ' full' : ''}"><i class="ico-shard"></i>${got}/${L.shardCount}</span>`;
    }
    for (let c = 0; c < 3; c++) {
      const k = R.keysHeld(L, s, c);
      if (k > 0) html += `<span class="chip key" style="--kc:${G.KEY_COLORS[c]}"><i class="ico-key"></i>${k > 1 ? '×' + k : ''}</span>`;
    }
    if (L.plates.length) {
      const on = L.plates.filter((p) => s.pos === p || s.crates.indexOf(p) >= 0).length;
      html += `<span class="chip plate${on === L.plates.length ? ' full' : ''}"><i class="ico-plate"></i>${on}/${L.plates.length}</span>`;
    }
    for (let a = 2; a < L.n; a++) {
      const c = G.coord(L, s.pos, a);
      const ax = HD.AXES[a];
      html += `<span class="chip coord" style="--ax:${ax.color}">${a === 2 ? 'floor' : ax.name.toLowerCase()} <b>${c + 1}</b><small>/${L.dims[a]}</small></span>`;
    }
    els.status.innerHTML = html;
    if (pad) pad.update(can, hint);
  }

  /* ---------- Layout ---------- */

  function resize() {
    if (!L) return;
    const r = els.stage.getBoundingClientRect();
    W = Math.max(50, r.width);
    H = Math.max(50, r.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    els.canvas.width = Math.round(W * dpr);
    els.canvas.height = Math.round(H * dpr);
    els.canvas.style.width = W + 'px';
    els.canvas.style.height = H + 'px';

    panels = [];
    viewBox = { x: 0, y: 0, w: W, h: H };
    if (L.n >= 3) {
      // Panels: floors in 3D, W slices in 4D, a W × V grid in 5D. They go
      // above the view on tall screens and beside it on wide ones.
      const sideways = W > H * 1.2;
      const count = L.n === 3 ? L.dims[2] : L.dims[3];
      let cols = L.n === 5 ? L.dims[3] : sideways ? 1 : count;
      let rows = L.n === 5 ? L.dims[4] : sideways ? count : 1;
      const gap = 6;
      const pad = 8;
      const label = L.n === 5 ? 18 : 0;
      const cap = L.n === 3 ? 120 : 140;
      let pw;
      if (sideways) {
        const maxW = W * (L.n === 5 ? 0.42 : 0.26);
        pw = Math.min((maxW - pad - label - gap * (cols - 1)) / cols, (H - pad * 2 - gap * (rows - 1)) / rows, cap);
      } else {
        const maxH = H * (L.n === 5 ? 0.42 : 0.24);
        pw = Math.min((W - pad * 2 - label - gap * (cols - 1)) / cols, (maxH - gap * (rows - 1)) / rows, cap);
      }
      const ph = pw;
      const gridW = cols * pw + (cols - 1) * gap + label;
      const gridH = rows * ph + (rows - 1) * gap;
      const x0 = (sideways ? pad : (W - gridW) / 2) + label;
      const y0 = sideways ? (H - gridH) / 2 : pad;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          let hidden = [];
          let layer = -1;
          // Floors and W slices run along the strip; in a column the top
          // floor goes at the top.
          const k = sideways ? r : c;
          if (L.n === 3) layer = sideways ? count - 1 - k : k;
          else if (L.n === 4) hidden = [k];
          else hidden = [c, r];
          panels.push({ x: x0 + c * (pw + gap), y: y0 + r * (ph + gap), w: pw, h: ph, hidden, layer });
        }
      }
      if (sideways) viewBox = { x: x0 + gridW - label + pad, y: 0, w: W - (x0 + gridW - label + pad), h: H };
      else viewBox = { x: 0, y: y0 + gridH + 6, w: W, h: H - (y0 + gridH + 6) };
    }
    scale = V.fit(L, { w: viewBox.w - 24, h: viewBox.h - 20 }, flat, L.n === 1 ? 72 : flat ? 84 : 96);
  }

  /* ---------- Peeking into another slice ---------- */

  function setPeek(hidden) {
    const mine = hiddenOf(s.pos);
    if (hidden && hidden.every((v, i) => v === mine[i])) hidden = null;
    peek = hidden;
    if (peek) {
      const names = peek.map((v, i) => `${HD.AXES[3 + i].name.toLowerCase()}${v + 1}`).join(' ');
      els.peek.innerHTML = `Looking into slice <b>${names}</b> · tap to come back`;
      els.peek.hidden = false;
    } else {
      els.peek.hidden = true;
    }
  }

  // The cell with your X, Y, Z in another slice: where a jump would land.
  function sameSpot(hidden) {
    const c = G.coords(L, s.pos);
    for (let i = 0; i < hidden.length; i++) c[3 + i] = hidden[i];
    return G.index(L, c);
  }

  /* ---------- Effects ---------- */

  function burst(cell, color, count) {
    if (!lastProj || !L) return;
    const pos = V.xyz(L, cell);
    const hereHidden = hiddenOf(cell);
    const mine = peek || hiddenOf(s.pos);
    if (hereHidden.some((v, i) => v !== mine[i])) return;
    const q = lastProj(pos[0], pos[1], pos[2]);
    const n = count || 14;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * U.TAU;
      const sp = 40 + Math.random() * 120;
      sparks.push({ x: q.x, y: q.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30, life: 0, max: 0.5 + Math.random() * 0.4, color });
    }
  }

  /* ---------- Drawing ---------- */

  function sceneParams(state, hidden, box, alpha, extra) {
    return Object.assign({
      L, s: state, box, cam, t, scale, hidden, layer: -1, alpha,
      fxItem, fxDoor, fxGate: L.gates.length ? gateK : undefined,
    }, extra || {});
  }

  function drawMain() {
    const box = { x: viewBox.x, y: viewBox.y, w: viewBox.w, h: viewBox.h };
    const mine = hiddenOf(s.pos);
    const extra = {};
    let pp = null;
    if (anim && !anim.slice) {
      const k = easeOut(anim.k);
      pp = anim.from.map((v, i) => lerp(v, anim.to[i], k));
      extra.playerPos = pp;
      if (anim.pushed >= 0 && anim.crateTo && anim.axis < 3) {
        extra.cratePos = [];
        extra.cratePos[anim.pushed] = anim.crateFrom.map((v, i) => lerp(v, anim.crateTo[i], k));
      }
    }
    if (bump) {
      const k = bump.k;
      extra.bump = { axis: bump.axis < 3 ? bump.axis : 0, dir: bump.dir, amt: bump.axis < 3 ? Math.sin(k * Math.PI) * 0.16 : 0 };
      if (bump.axis >= 3) extra.playerScale = 1 - Math.sin(k * Math.PI) * 0.18;
    }
    if (won && winT >= 0) {
      const k = clamp(winT / 0.5, 0, 1);
      extra.playerScale = 1 - easeInOut(k) * 0.9;
    }

    // Lit neighbours: every in-view move you can make.
    const hints = [];
    if (!won && !peek) {
      for (let a = 0; a < Math.min(3, L.n); a++) {
        for (const d of [-1, 1]) {
          const cell = G.step(L, s.pos, a, d);
          if (cell < 0) continue;
          const strong = hint && hint.axis === a && hint.dir === d;
          if (strong || (!flat && can(a, d))) hints.push({ axis: a, dir: d, cell, strong });
        }
      }
    }
    extra.hints = hints;

    const draw = flat ? V.drawFlat : V.draw3D;
    if (anim && anim.slice) {
      // Slide the old slice out and the new one in: W moves sideways, V up and down.
      const k = easeInOut(anim.k);
      const horiz = anim.axis === 3;
      const D = horiz ? box.w * 0.55 : box.h * 0.5;
      const oldHidden = hiddenOf(anim.prev.pos);
      const ob = Object.assign({}, box, horiz ? { ox: -anim.dir * k * D } : { oy: -anim.dir * k * D });
      const nb = Object.assign({}, box, horiz ? { ox: anim.dir * (1 - k) * D } : { oy: anim.dir * (1 - k) * D });
      draw(g, sceneParams(anim.prev, oldHidden, ob, 1 - k, { fxItem: null, fxDoor: null }));
      lastProj = draw(g, sceneParams(s, mine, nb, k, extra));
    } else {
      const hidden = peek || mine;
      if (peek) extra.ghost = sameSpot(peek);
      lastProj = draw(g, sceneParams(s, hidden, box, 1, extra));
    }

    if (!flat || L.n === 2) {
      V.drawGizmo(g, cam, box.x + 30, box.y + box.h - 30, 18, L.n, flat);
    }
  }

  function drawPanels() {
    if (!panels.length) return;
    const mine = hiddenOf(s.pos);
    const myZ = G.coord(L, s.pos, 2);
    for (const p of panels) {
      const here = L.n === 3 ? p.layer === myZ : p.hidden.every((v, i) => v === mine[i]);
      const peeked = peek && p.hidden.every((v, i) => v === peek[i]);
      const color = L.n === 3 ? HD.AXES[2].color : L.n === 4 ? HD.AXES[3].color : HD.AXES[here ? 3 : 4].color;
      V.sprites.roundRect(g, p.x, p.y, p.w, p.h, 10);
      g.fillStyle = here ? 'rgba(20,26,64,0.95)' : 'rgba(11,15,40,0.85)';
      g.fill();
      g.lineWidth = here ? 2 : 1;
      g.strokeStyle = here ? color : peeked ? rgba(color, 0.9) : 'rgba(80,94,160,0.45)';
      if (peeked) g.setLineDash([5, 4]);
      g.stroke();
      g.setLineDash([]);
      const box = { x: p.x + 4, y: p.y + 4, w: p.w - 8, h: p.h - 8 };
      const st = anim && anim.slice && anim.k < 0.5 ? anim.prev : s;
      if (L.n === 3) {
        const sc = V.fit(L, { w: box.w - 4, h: box.h - 14 }, true, 30);
        V.drawFlat(g, { L, s: st, box: Object.assign({}, box, { oy: 5 }), t, scale: sc, hidden: [], layer: p.layer, mini: true, alpha: 1 });
      } else {
        const sc = V.fit(L, box, false, 40);
        const ghost = peek ? -1 : sameSpot(p.hidden);
        V.draw3D(g, { L, s: st, box, cam, t, scale: sc, hidden: p.hidden, layer: -1, mini: true, alpha: here ? 1 : 0.85, ghost: here ? -1 : ghost });
      }
      // Label.
      g.font = '600 10px "Space Grotesk", system-ui, sans-serif';
      g.textAlign = 'left';
      g.textBaseline = 'top';
      g.fillStyle = here ? '#FFFFFF' : 'rgba(170,180,230,0.8)';
      const label = L.n === 3 ? `floor ${p.layer + 1}` : L.n === 4 ? `w${p.hidden[0] + 1}` : `w${p.hidden[0] + 1} v${p.hidden[1] + 1}`;
      g.fillText(label, p.x + 7, p.y + 5);
    }
    if (L.n === 5) {
      // Axis labels for the grid.
      const first = panels[0];
      g.font = '700 11px "Space Grotesk", system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = HD.AXES[4].color;
      g.save();
      const rowsH = panels[panels.length - 1].y + panels[panels.length - 1].h - first.y;
      g.translate(first.x - 11, first.y + rowsH / 2);
      g.rotate(-Math.PI / 2);
      g.fillText('V →', 0, 0);
      g.restore();
    }
  }

  function frame(dt) {
    if (!running || !L) return;
    t += dt;
    if (anim) {
      anim.k += dt / anim.dur;
      if (anim.k >= 1) finishAnim();
    }
    if (bump) {
      bump.k += dt / 0.16;
      if (bump.k >= 1) bump = null;
    }
    if (fxItem) {
      fxItem.k += dt / 0.45;
      if (fxItem.k >= 1) fxItem = null;
    }
    if (fxDoor) {
      fxDoor.k += dt / 0.35;
      if (fxDoor.k >= 1) fxDoor = null;
    }
    const gateGoal = R.platesHeld(L, s) ? 1 : 0;
    gateK = U.lerp(gateK, gateGoal, Math.min(1, dt * 14));
    if (Math.abs(gateK - gateGoal) < 0.01) gateK = gateGoal;
    if (winT >= 0) winT += dt;

    // Camera drift and snapping.
    if (!flat) {
      if (camGoal) {
        const k = Math.min(1, dt * 9);
        cam.yaw = lerp(cam.yaw, camGoal.yaw, k);
        cam.pitch = lerp(cam.pitch, camGoal.pitch, k);
        if (Math.abs(cam.yaw - camGoal.yaw) < 0.002 && Math.abs(cam.pitch - camGoal.pitch) < 0.002) camGoal = null;
      } else if (!drag.active) {
        cam.yaw += camVel.yaw * dt;
        cam.pitch = clamp(cam.pitch + camVel.pitch * dt, 0.2, 1.5);
        const f = Math.pow(0.04, dt);
        camVel.yaw *= f;
        camVel.pitch *= f;
      }
      pad.remap(cam, false);
    }

    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    drawPanels();
    g.save();
    g.beginPath();
    g.rect(viewBox.x, viewBox.y, viewBox.w, viewBox.h);
    g.clip();
    drawMain();
    g.restore();

    // Sparks.
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i];
      p.life += dt;
      if (p.life >= p.max) {
        sparks.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 160 * dt;
      p.vx *= 0.96;
      const a = 1 - p.life / p.max;
      g.fillStyle = rgba(p.color, a);
      g.beginPath();
      g.arc(p.x, p.y, 1.5 + a * 2, 0, U.TAU);
      g.fill();
    }
  }

  /* ---------- Touch, mouse and keyboard ---------- */

  const drag = { active: false, id: -1, x0: 0, y0: 0, x: 0, y: 0, moved: false, tLast: 0, vx: 0, vy: 0, region: '' };

  function regionAt(x, y) {
    for (const p of panels) if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) return p;
    return null;
  }

  els.canvas.addEventListener('pointerdown', (e) => {
    if (!running) return;
    A.unlock();
    const r = els.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    drag.active = true;
    drag.id = e.pointerId;
    drag.x0 = drag.x = x;
    drag.y0 = drag.y = y;
    drag.moved = false;
    drag.tLast = performance.now();
    drag.vx = drag.vy = 0;
    drag.panel = regionAt(x, y);
    camGoal = null;
    camVel.yaw = camVel.pitch = 0;
    try { els.canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  });

  els.canvas.addEventListener('pointermove', (e) => {
    if (!drag.active || e.pointerId !== drag.id) return;
    const r = els.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const dx = x - drag.x;
    const dy = y - drag.y;
    if (Math.hypot(x - drag.x0, y - drag.y0) > 7) drag.moved = true;
    const now = performance.now();
    const dtm = Math.max(1, now - drag.tLast) / 1000;
    drag.tLast = now;
    if (drag.moved && !flat) {
      cam.yaw += dx * 0.009;
      cam.pitch = clamp(cam.pitch + dy * 0.007, 0.2, 1.5);
      drag.vx = lerp(drag.vx, (dx * 0.009) / dtm, 0.5);
      drag.vy = lerp(drag.vy, (dy * 0.007) / dtm, 0.5);
    }
    drag.x = x;
    drag.y = y;
  });

  function endDrag(e) {
    if (!drag.active || e.pointerId !== drag.id) return;
    drag.active = false;
    const dx = drag.x - drag.x0;
    const dy = drag.y - drag.y0;
    if (!drag.moved) {
      tap(drag.x0, drag.y0);
      return;
    }
    if (flat) {
      // A swipe on the flat board is a move.
      if (Math.hypot(dx, dy) < 22) return;
      if (Math.abs(dx) > Math.abs(dy)) move(0, dx > 0 ? 1 : -1);
      else if (L.n >= 2) move(1, dy > 0 ? 1 : -1);
    } else if (performance.now() - drag.tLast < 80) {
      camVel.yaw = clamp(drag.vx, -6, 6);
      camVel.pitch = clamp(drag.vy, -4, 4);
    }
  }
  els.canvas.addEventListener('pointerup', endDrag);
  els.canvas.addEventListener('pointercancel', (e) => {
    if (e.pointerId === drag.id) drag.active = false;
  });

  function tap(x, y) {
    if (won) return;
    const p = regionAt(x, y);
    if (p) {
      if (L.n >= 4) {
        A.play('click');
        setPeek(peek && p.hidden.every((v, i) => v === peek[i]) ? null : p.hidden);
      }
      return;
    }
    if (peek) {
      setPeek(null);
      return;
    }
    if (!lastProj) return;
    if (flat) {
      // Tap towards where you want to go.
      const pos = V.xyz(L, s.pos);
      const q = lastProj(pos[0], pos[1], pos[2]);
      const dx = x - q.x;
      const dy = y - q.y;
      if (Math.hypot(dx, dy) < scale * 0.35) return;
      if (L.n === 1 || Math.abs(dx) > Math.abs(dy)) move(0, dx > 0 ? 1 : -1);
      else move(1, dy > 0 ? 1 : -1);
      return;
    }
    const cands = [];
    for (let a = 0; a < 3; a++) {
      for (const d of [-1, 1]) {
        const cell = G.step(L, s.pos, a, d);
        if (cell >= 0) cands.push({ axis: a, dir: d, cell });
      }
    }
    const hit = V.pick(lastProj, L, s, x, y, false, cands.filter((c) => can(c.axis, c.dir)));
    if (hit) move(hit.axis, hit.dir);
  }

  if (window.ResizeObserver) {
    new ResizeObserver(() => {
      if (running) resize();
    }).observe(els.stage);
  }

  els.peek.addEventListener('click', () => setPeek(null));
  els.tip.addEventListener('click', () => {
    els.tip.hidden = true;
    resize();
  });
  els.undo.addEventListener('click', undo);
  els.restart.addEventListener('click', restart);
  els.hint.addEventListener('click', showHint);
  els.view.addEventListener('click', () => {
    A.play('click');
    camGoal = { yaw: CAM0.yaw + Math.round((cam.yaw - CAM0.yaw) / U.TAU) * U.TAU, pitch: CAM0.pitch };
  });

  // Turn the camera by a quarter turn (keyboard Q / E).
  function turn(dir) {
    if (flat) return;
    const base = camGoal ? camGoal.yaw : cam.yaw;
    camGoal = { yaw: base + dir * (Math.PI / 4), pitch: cam.pitch };
  }

  const KEYS = {
    r: [2, 1], f: [2, -1],
    t: [3, 1], g: [3, -1],
    y: [4, 1], h: [4, -1],
  };

  function key(e) {
    if (!running || e.ctrlKey && e.key.toLowerCase() !== 'z' || e.metaKey || e.altKey) return false;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    let role = null;
    if (k === 'ArrowRight' || k === 'd') role = 'right';
    else if (k === 'ArrowLeft' || k === 'a') role = 'left';
    else if (k === 'ArrowUp' || k === 'w') role = 'up';
    else if (k === 'ArrowDown' || k === 's') role = 'down';
    if (role) {
      if (L.n === 1 && (role === 'up' || role === 'down')) return true;
      const m = pad.map[role];
      flash(m.axis, m.dir);
      move(m.axis, m.dir);
      return true;
    }
    if (KEYS[k]) {
      const [a, d] = KEYS[k];
      if (a < L.n) {
        flash(a, d);
        move(a, d);
      }
      return true;
    }
    if (k === 'q') turn(-1);
    else if (k === 'e') turn(1);
    else if (k === 'u' || k === 'z' || k === 'Backspace') undo();
    else if (k === 'x') restart();
    else if (k === '/' || k === '?') showHint();
    else return false;
    return true;
  }

  function flash(axis, dir) {
    const b = pad && pad.find(axis, dir);
    if (!b) return;
    b.classList.add('down');
    setTimeout(() => b.classList.remove('down'), 120);
  }

  HD.game = {
    start, stop, frame, resize, key, restart, undo, move,
    get running() { return running; },
    get level() { return def; },
    get context() { return ctx; },
  };
})(window.HD = window.HD || {});
