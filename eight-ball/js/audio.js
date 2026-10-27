/* Eight-Ball — sounds, synthesised with WebAudio to be close to a real
   table: the sharp clack of resin balls (a few ringing partials over a
   click), the muffled thump of the rubber cushions, the leather tip, the
   rumble of balls rolling on the cloth, and a potted ball dropping and
   running down the return channel to the others. */
(function (EB) {
  'use strict';

  let ctx = null;
  let master = null;
  let room = null;
  let noise = null;
  let rollGain = null;
  let rollFilter = null;
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
    master.gain.value = on ? 0.9 : 0;
    master.connect(ctx.destination);

    const len = ctx.sampleRate * 2;
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // A little room: a short, dark echo so sounds don't feel pasted on.
    room = ctx.createGain();
    room.gain.value = 0.16;
    const delay = ctx.createDelay(0.2);
    delay.delayTime.value = 0.045;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const damp = ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 2200;
    room.connect(delay);
    delay.connect(damp).connect(fb).connect(delay);
    damp.connect(master);

    // Rolling: a steady, low rumble whose loudness follows the balls' speed.
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    rollFilter = ctx.createBiquadFilter();
    rollFilter.type = 'lowpass';
    rollFilter.frequency.value = 220;
    rollFilter.Q.value = 0.7;
    rollGain = ctx.createGain();
    rollGain.gain.value = 0;
    src.connect(rollFilter).connect(rollGain).connect(master);
    src.start();
  }

  function setSound(v) {
    on = v;
    if (master) master.gain.value = v ? 0.9 : 0;
  }

  const out = (node, wet = 1) => {
    node.connect(master);
    if (wet) node.connect(room);
  };

  function burst(freq, q, vol, dur, type = 'bandpass', at = 0) {
    if (!ctx || !on || vol <= 0) return;
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g);
    out(g);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.02);
  }

  function ring(freq, vol, dur, at = 0, slide = 1) {
    if (!ctx || !on || vol <= 0) return;
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(freq, t);
    if (slide !== 1) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.0015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    out(g);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  // Collisions come in bursts (the break!); don't stack dozens at once.
  let last = 0;
  let count = 0;
  function gate() {
    const now = performance.now();
    if (now - last > 25) { last = now; count = 0; }
    return ++count <= 5;
  }

  const lvl = (v, full) => Math.min(1, Math.pow(v / full, 0.75));
  const jitter = (f) => f * (0.96 + Math.random() * 0.08);

  // A buzz from the phone's vibration motor, in the Android app only.
  function buzz(style) {
    if (!window.AndroidHost) return;
    try { window.AndroidHost.haptic(style); } catch (e) { /* ignore */ }
  }

  const sfx = {
    // Resin on resin: a hard click with a short, bright ring.
    ball(v) {
      if (v < 15 || !gate()) return;
      const k = lvl(v, 4000);
      burst(jitter(5200), 1.4, 0.12 + k * 0.7, 0.012, 'highpass');
      ring(jitter(3150), 0.05 + k * 0.32, 0.035 + k * 0.03);
      ring(jitter(4650), 0.03 + k * 0.18, 0.025);
      ring(jitter(7300), 0.02 + k * 0.1, 0.015);
    },
    // Rubber under cloth: a dull thump, a little louder for a hard hit.
    cushion(v) {
      if (v < 20 || !gate()) return;
      const k = lvl(v, 3500);
      ring(jitter(115), 0.1 + k * 0.45, 0.09, 0, 0.7);
      burst(420, 0.8, 0.05 + k * 0.3, 0.06, 'lowpass');
    },
    // The ball drops onto the pocket's rubber, then rolls down the channel
    // and knocks into the balls already in the tray.
    pocket(v, id) {
      buzz('light');
      const k = lvl(v, 2500);
      burst(900, 2, 0.12 + k * 0.2, 0.03);               // rattle on the jaw
      ring(95, 0.35 + k * 0.25, 0.16, 0.03, 0.75);       // thud into the drop
      burst(160, 0.9, 0.25, 0.12, 'lowpass', 0.04);
      // Down the return channel.
      if (!ctx || !on) return;
      const t = ctx.currentTime + 0.2;
      const src = ctx.createBufferSource();
      src.buffer = noise;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.setValueAtTime(380, t);
      f.frequency.linearRampToValueAtTime(260, t + 1.1);
      f.Q.value = 3;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.16, t + 0.15);
      g.gain.linearRampToValueAtTime(0.1, t + 0.9);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.15);
      src.connect(f).connect(g);
      out(g, 0);
      src.start(t, Math.random());
      src.stop(t + 1.2);
      if (id !== 0) {
        const at = 1.3 + Math.random() * 0.15;
        burst(4800, 1.2, 0.18, 0.01, 'highpass', at);
        ring(jitter(2900), 0.12, 0.04, at);
        ring(jitter(4200), 0.06, 0.03, at);
      }
    },
    // A leather tip: a soft knock with a woody body.
    cue(p) {
      burst(1500, 1.5, 0.1 + p * 0.45, 0.025);
      ring(620, 0.06 + p * 0.22, 0.05, 0, 0.8);
      ring(230, 0.05 + p * 0.15, 0.06);
    },
    roll(total) {
      if (!rollGain) return;
      const k = Math.min(1, Math.sqrt(total / 9000));
      const t = ctx.currentTime;
      rollGain.gain.setTargetAtTime(k * 0.22, t, 0.06);
      rollFilter.frequency.setTargetAtTime(160 + k * 260, t, 0.1);
    },
    beep() { ring(880, 0.1, 0.18); ring(1320, 0.04, 0.12); },
    foul() {
      buzz('medium');
      ring(330, 0.12, 0.3, 0, 0.7);
      ring(220, 0.08, 0.35, 0.05, 0.8);
    },
    win() {
      buzz('heavy');
      [523, 659, 784, 1047].forEach((f, i) => { ring(f, 0.12, 0.35, i * 0.12); ring(f * 2, 0.03, 0.25, i * 0.12); });
    },
    tap() { ring(1400, 0.04, 0.03); },
  };

  EB.audio = { init, setSound, ...sfx };
})(window.EB = window.EB || {});
