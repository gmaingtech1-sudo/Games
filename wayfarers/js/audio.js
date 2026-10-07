/* Wayfarers — little synthesised sound effects (WebAudio, no audio files). */
(function (WF) {
  'use strict';

  let ctx = null;
  let out = null;
  let noise = null;
  let on = true;
  const last = {};

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch (e) { return null; }
    out = ctx.createGain();
    out.gain.value = 0.5;
    out.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }

  // Browsers only allow sound after a tap; call this from any input handler.
  function unlock() {
    const c = ensure();
    if (c && c.state === 'suspended') c.resume();
  }

  function tone(freq, dur, type, vol, when, slideTo) {
    const t = ctx.currentTime + (when || 0);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function hiss(dur, vol, freq, when) {
    const t = ctx.currentTime + (when || 0);
    const s = ctx.createBufferSource();
    s.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(out);
    s.start(t);
    s.stop(t + dur + 0.02);
  }

  // Skips a sound if the same one played very recently, so big fights don't roar.
  function ok(name, gap) {
    const now = performance.now();
    if (last[name] && now - last[name] < gap) return false;
    last[name] = now;
    return true;
  }

  const SOUNDS = {
    hit: () => ok('hit', 70) && hiss(0.08, 0.25, 1400 + Math.random() * 600),
    crit: () => ok('crit', 90) && (hiss(0.12, 0.35, 2400), tone(880, 0.12, 'square', 0.06)),
    hurt: () => ok('hurt', 110) && tone(180, 0.12, 'sawtooth', 0.06, 0, 110),
    shoot: () => ok('shoot', 80) && tone(700 + Math.random() * 200, 0.08, 'triangle', 0.08, 0, 300),
    cast: () => ok('cast', 120) && [660, 880, 1320].forEach((f, i) => tone(f, 0.18, 'triangle', 0.09, i * 0.05)),
    blast: () => ok('blast', 150) && (hiss(0.4, 0.4, 500), tone(120, 0.35, 'sine', 0.2, 0, 50)),
    heal: () => ok('heal', 200) && [523, 659, 784].forEach((f, i) => tone(f, 0.25, 'sine', 0.07, i * 0.06)),
    kill: () => ok('kill', 60) && tone(1200, 0.07, 'square', 0.04, 0, 1800),
    coin: () => ok('coin', 50) && (tone(1320, 0.06, 'square', 0.04), tone(1760, 0.1, 'square', 0.04, 0.05)),
    win: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, 'triangle', 0.1, i * 0.08)),
    boss: () => [392, 523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.3, 'triangle', 0.11, i * 0.09)),
    lose: () => [392, 330, 262].forEach((f, i) => tone(f, 0.3, 'sawtooth', 0.06, i * 0.14)),
    level: () => ok('level', 60) && [784, 1046].forEach((f, i) => tone(f, 0.12, 'square', 0.05, i * 0.05)),
    buy: () => [660, 990].forEach((f, i) => tone(f, 0.12, 'triangle', 0.08, i * 0.06)),
    summon: () => [523, 659, 784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.35, 'sine', 0.07, i * 0.07)),
    legendary: () => [784, 988, 1175, 1568, 1976, 2349].forEach((f, i) => tone(f, 0.45, 'triangle', 0.08, i * 0.08)),
    tap: () => tone(900, 0.04, 'sine', 0.05),
    error: () => tone(200, 0.15, 'square', 0.05, 0, 150),
  };

  function play(name) {
    if (!on || !ctx || ctx.state !== 'running') return;
    const fn = SOUNDS[name];
    if (fn) fn();
  }

  WF.audio = {
    unlock, play,
    get on() { return on; },
    set on(v) { on = !!v; },
  };
})(window.WF = window.WF || {});
