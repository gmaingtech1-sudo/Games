/* Eight-Ball — sounds, synthesised with WebAudio: the click of balls, the
   thud of cushions, the cue tip, balls dropping and the referee's beep. */
(function (EB) {
  'use strict';

  let ctx = null;
  let master = null;
  let noise = null;
  let on = true;

  function init() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = on ? 0.8 : 0;
    master.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  function setSound(v) {
    on = v;
    if (master) master.gain.value = v ? 0.8 : 0;
  }

  function burst(freq, q, vol, dur, type = 'bandpass') {
    if (!ctx || !on) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  function tone(freq, vol, dur, type = 'sine', slide = 0) {
    if (!ctx || !on) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  // Collisions come in bursts; don't stack dozens in the same instant.
  let last = 0;
  let count = 0;
  function gate() {
    const now = performance.now();
    if (now - last > 30) { last = now; count = 0; }
    return ++count <= 4;
  }

  const lvl = (v, full) => Math.min(1, v / full);

  const sfx = {
    ball(v) {
      if (!gate()) return;
      const k = lvl(v, 3500);
      burst(3200 + k * 1500, 6, 0.04 + k * 0.5, 0.05);
      tone(1900 + k * 600, 0.02 + k * 0.12, 0.04, 'triangle');
    },
    cushion(v) {
      if (!gate()) return;
      const k = lvl(v, 3000);
      burst(260, 1.2, 0.05 + k * 0.45, 0.12, 'lowpass');
    },
    pocket(v) {
      const k = lvl(v, 2500);
      burst(180, 1, 0.3 + k * 0.3, 0.22, 'lowpass');
      setTimeout(() => burst(900, 4, 0.15, 0.08), 90);
      setTimeout(() => burst(600, 4, 0.1, 0.1), 170);
    },
    cue(p) {
      burst(2400, 3, 0.15 + p * 0.5, 0.05);
      tone(700, 0.05 + p * 0.1, 0.05, 'triangle');
    },
    beep() { tone(880, 0.12, 0.18, 'square'); },
    foul() { tone(330, 0.12, 0.3, 'sawtooth', 0.7); },
    win() {
      [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.12, 0.3, 'triangle'), i * 120));
    },
    tap() { tone(1200, 0.04, 0.04, 'triangle'); },
  };

  EB.audio = { init, setSound, ...sfx };
})(window.EB = window.EB || {});
