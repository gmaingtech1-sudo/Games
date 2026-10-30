// The central holographic core, drawn on a <canvas>.
//
// Battery: the frame rate is capped (lower when idle and in "battery saver"),
// drawing stops completely while the app is hidden, and no per-frame blur
// filters are used. "prefers-reduced-motion" freezes the rotation.

const TAU = Math.PI * 2;

export function createVisualizer(canvas) {
  const ctx = canvas.getContext('2d');
  let w = 0, h = 0, dpr = 1;
  let state = 'idle';
  let level = 0;          // 0..1 microphone or speech level
  let targetLevel = 0;
  let effects = 'full';
  let rgb = [56, 220, 255];
  let raf = 0;
  let last = 0;
  let t = 0;
  let spin = 0;
  let energy = 0.2;       // smoothed activity
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const bars = new Float32Array(72);

  function readColor() {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--accent-rgb').trim();
    const parts = v.split(',').map((x) => Number(x.trim()));
    if (parts.length === 3 && parts.every(Number.isFinite)) rgb = parts;
  }
  const col = (a) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, effects === 'saver' ? 1.25 : 2);
    w = Math.max(1, rect.width);
    h = Math.max(1, rect.height);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function fpsCap() {
    if (reduced?.matches) return 0; // render on change only
    const active = state !== 'idle' && state !== 'offline';
    if (effects === 'saver') return active ? 30 : 12;
    if (effects === 'balanced') return active ? 45 : 24;
    return active ? 60 : 30;
  }

  function ring(r, width, alpha, dash, offset) {
    ctx.beginPath();
    ctx.lineWidth = width;
    ctx.strokeStyle = col(alpha);
    ctx.setLineDash(dash || []);
    ctx.lineDashOffset = offset || 0;
    ctx.arc(0, 0, r, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function arcs(r, width, count, sweep, rot, alpha) {
    ctx.lineWidth = width;
    ctx.strokeStyle = col(alpha);
    for (let i = 0; i < count; i++) {
      const a = rot + (i * TAU) / count;
      ctx.beginPath();
      ctx.arc(0, 0, r, a, a + sweep);
      ctx.stroke();
    }
  }

  function draw() {
    const roomy = h > 200;
    const R = Math.min(w * 0.42, h * (roomy ? 0.36 : 0.44));
    const offline = state === 'offline';
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2, h / 2 - (roomy ? h * 0.07 : 0));
    if (offline) ctx.globalAlpha = 0.45;

    // Outer glow (a cheap radial gradient instead of shadowBlur).
    const glow = ctx.createRadialGradient(0, 0, R * 0.1, 0, 0, R * 1.15);
    glow.addColorStop(0, col(0.16 + energy * 0.22));
    glow.addColorStop(0.45, col(0.05 + energy * 0.06));
    glow.addColorStop(1, col(0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, R * 1.15, 0, TAU);
    ctx.fill();

    // Tick ring.
    ctx.save();
    ctx.rotate(spin * 0.15);
    ctx.strokeStyle = col(0.45);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 120; i++) {
      const a = (i * TAU) / 120;
      const long = i % 10 === 0;
      const r1 = R * (long ? 0.9 : 0.93);
      ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
      ctx.lineTo(Math.cos(a) * R * 0.96, Math.sin(a) * R * 0.96);
    }
    ctx.stroke();
    ctx.restore();

    ring(R, 1.2, 0.35);
    ring(R * 1.04, 1, 0.18, [2, 7], -spin * 20);

    // Segmented rotating arcs.
    arcs(R * 0.82, 3, 3, 0.9, spin * 0.6, 0.65);
    arcs(R * 0.74, 1.5, 6, 0.35, -spin * 0.9, 0.45);
    if (state === 'thinking') {
      arcs(R * 0.66, 4, 2, 0.5, spin * 3.2, 0.8);
      for (let i = 0; i < 3; i++) {
        const a = spin * 2.4 + (i * TAU) / 3;
        ctx.fillStyle = col(0.95);
        ctx.beginPath();
        ctx.arc(Math.cos(a) * R * 0.66, Math.sin(a) * R * 0.66, 3.2, 0, TAU);
        ctx.fill();
      }
    } else {
      arcs(R * 0.66, 1, 4, 1.2, spin * 0.25, 0.25);
    }

    // Radial level bars (listening / speaking).
    const barsOn = state === 'listening' || state === 'speaking';
    ctx.lineWidth = Math.max(1.5, R * 0.018);
    ctx.lineCap = 'round';
    for (let i = 0; i < bars.length; i++) {
      const a = (i * TAU) / bars.length - Math.PI / 2;
      const wave = barsOn ? (0.35 + 0.65 * Math.abs(Math.sin(t * 5.3 + i * 0.7) * Math.sin(t * 2.1 + i * 0.23))) * (0.25 + level) : 0.06;
      bars[i] += (wave - bars[i]) * 0.25;
      const len = R * (0.05 + bars[i] * 0.22);
      const r0 = R * 0.38;
      ctx.strokeStyle = col(0.35 + bars[i] * 0.6);
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
      ctx.lineTo(Math.cos(a) * (r0 + len), Math.sin(a) * (r0 + len));
      ctx.stroke();
    }

    // Core.
    const pulse = 1 + Math.sin(t * (state === 'idle' ? 1.6 : 3.5)) * 0.03 + level * 0.18;
    const coreR = R * 0.3 * pulse;
    const core = ctx.createRadialGradient(0, 0, 0, 0, 0, coreR);
    core.addColorStop(0, 'rgba(255,255,255,0.95)');
    core.addColorStop(0.25, col(0.85));
    core.addColorStop(0.7, col(0.22));
    core.addColorStop(1, col(0));
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(0, 0, coreR, 0, TAU);
    ctx.fill();
    ring(R * 0.3, 1.5, 0.7);
    ring(R * 0.34, 1, 0.3, [10, 6], spin * 30);

    // Hexagon inner frame.
    ctx.save();
    ctx.rotate(-spin * 0.3);
    ctx.strokeStyle = col(0.3);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) {
      const a = (i * TAU) / 6;
      const x = Math.cos(a) * R * 0.52, y = Math.sin(a) * R * 0.52;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
    ctx.restore();

    if (offline) {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(255,85,119,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.9, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  function frame(now) {
    raf = 0;
    if (document.hidden) return;
    const cap = fpsCap();
    const minDelta = cap ? 1000 / cap : Infinity;
    const dt = Math.min(0.1, (now - last) / 1000 || 0.016);
    if (now - last >= minDelta - 1) {
      last = now;
      const speed = { idle: 0.25, listening: 0.6, thinking: 1.6, speaking: 0.8, offline: 0.05 }[state] ?? 0.3;
      t += dt;
      spin += dt * speed;
      level += (targetLevel - level) * 0.2;
      if (state !== 'listening' && state !== 'speaking') targetLevel *= 0.9;
      const targetEnergy = { idle: 0.15, listening: 0.55, thinking: 0.5, speaking: 0.7, offline: 0 }[state] ?? 0.2;
      energy += (targetEnergy + level * 0.4 - energy) * 0.08;
      draw();
    }
    if (cap) raf = requestAnimationFrame(frame);
  }

  function kick() {
    if (!raf && !document.hidden) raf = requestAnimationFrame(frame);
  }

  new ResizeObserver(resize).observe(canvas);
  document.addEventListener('visibilitychange', () => (document.hidden ? cancelAnimationFrame(raf) || (raf = 0) : kick()));
  reduced?.addEventListener?.('change', kick);
  readColor();
  resize();
  kick();

  return {
    setState(s) { state = s; kick(); if (fpsCap() === 0) draw(); },
    setLevel(v) { targetLevel = Math.max(0, Math.min(1, v)); },
    setEffects(e) { effects = e; resize(); kick(); },
    refreshColors() { readColor(); draw(); },
  };
}
