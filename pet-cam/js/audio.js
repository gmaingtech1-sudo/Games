/* Pet Cam — synthesized sound effects and haptics. Everything is generated
   with WebAudio, so the game ships with no audio files. */
window.PC = window.PC || {};
(function (PC) {
  'use strict';

  let ctx = null;
  let master = null;
  let on = true;

  function ensure() {
    if (!on) return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { return null; }
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  function tone(o) {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime + (o.delay || 0);
    const dur = o.dur || 0.15;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol || 0.2, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  function noise(o) {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime + (o.delay || 0);
    const dur = o.dur || 0.1;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const filt = c.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = o.freq || 1500;
    const g = c.createGain();
    g.gain.value = o.vol || 0.3;
    src.connect(filt);
    filt.connect(g);
    g.connect(master);
    src.start(t);
  }

  // A voice with a pitch contour: points are [time, frequency] pairs,
  // shaped by a band-pass "mouth" so it sounds more like an animal.
  function voice(o) {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime + (o.delay || 0);
    const pts = o.pts;
    const dur = pts[pts.length - 1][0];
    const osc = c.createOscillator();
    osc.type = o.type || 'sawtooth';
    osc.frequency.setValueAtTime(pts[0][1], t);
    for (let i = 1; i < pts.length; i++) osc.frequency.linearRampToValueAtTime(pts[i][1], t + pts[i][0]);
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = o.q || 2;
    f.frequency.setValueAtTime(o.formant || 1200, t);
    if (o.formant2) f.frequency.linearRampToValueAtTime(o.formant2, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol || 0.3, t + 0.03);
    g.gain.setValueAtTime(o.vol || 0.3, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(f);
    f.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  function buzz(pattern) {
    if (on) PC.host.haptic(pattern);
  }

  PC.sfx = {
    get on() { return on; },
    set on(v) { on = !!v; },
    unlock: ensure,

    pop() { tone({ f: 300, f2: 900, dur: 0.14, type: 'triangle', vol: 0.25 }); buzz(12); },
    giggle() {
      [0, 0.08, 0.16].forEach((d, i) => tone({ f: 700 + i * 140, f2: 900 + i * 160, dur: 0.07, delay: d, type: 'triangle', vol: 0.16 }));
      buzz(8);
    },
    purr() { tone({ f: 520 + Math.random() * 120, f2: 780, dur: 0.12, type: 'sine', vol: 0.12 }); },
    happy() {
      [523, 659, 784, 1047].forEach((f, i) => tone({ f, dur: 0.12, delay: i * 0.07, type: 'triangle', vol: 0.15 }));
      buzz([10, 40, 10]);
    },
    munch() { noise({ dur: 0.07, freq: 900, vol: 0.35 }); },
    throw() { noise({ dur: 0.18, freq: 2400, vol: 0.2 }); tone({ f: 400, f2: 1200, dur: 0.18, type: 'sine', vol: 0.08 }); buzz(10); },
    bounce() { tone({ f: 180, f2: 110, dur: 0.08, type: 'sine', vol: 0.25 }); },
    toss() { tone({ f: 600, f2: 300, dur: 0.2, type: 'triangle', vol: 0.12 }); },
    call() { tone({ f: 880, f2: 1320, dur: 0.12, type: 'square', vol: 0.06 }); tone({ f: 880, f2: 1320, dur: 0.12, delay: 0.16, type: 'square', vol: 0.06 }); },
    sleepy() { tone({ f: 500, f2: 250, dur: 0.5, type: 'sine', vol: 0.12 }); },
    wake() { tone({ f: 300, f2: 700, dur: 0.25, type: 'triangle', vol: 0.14 }); },
    shutter() { noise({ dur: 0.05, freq: 3000, vol: 0.4 }); noise({ dur: 0.06, freq: 1800, vol: 0.3, delay: 0.07 }); buzz(20); },
    levelUp() {
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone({ f, dur: 0.18, delay: i * 0.09, type: 'triangle', vol: 0.16 }));
      buzz([20, 60, 20, 60, 40]);
    },
    tap() { tone({ f: 660, dur: 0.05, type: 'triangle', vol: 0.1 }); buzz(5); },

    // Animal voices
    bark() {
      [0, 0.2].forEach((d, i) => {
        if (i && Math.random() < 0.4) return;
        voice({ delay: d, pts: [[0, 240], [0.04, 420], [0.13, 190]], formant: 900, formant2: 500, q: 1.4, vol: 0.5 });
        noise({ delay: d, dur: 0.1, freq: 800, vol: 0.25 });
      });
      buzz(15);
    },
    meow() {
      const p = 480 + Math.random() * 160;
      voice({ pts: [[0, p], [0.12, p * 1.45], [0.32, p * 1.2], [0.5, p * 0.8]], formant: 900, formant2: 1800, q: 3, vol: 0.4, type: 'sawtooth' });
      buzz(8);
    },
    purr() {
      // a low rumble pulsing about 25 times a second
      const c = ensure();
      if (!c) return;
      const t = c.currentTime;
      const osc = c.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 26;
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 180;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.35, t + 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      osc.connect(f);
      f.connect(g);
      g.connect(master);
      osc.start(t);
      osc.stop(t + 0.55);
      buzz(4);
    },
    hiss() { noise({ dur: 0.45, freq: 4500, vol: 0.35 }); buzz(30); },
    squeak() { tone({ f: 1400 + Math.random() * 300, f2: 2100, dur: 0.09, type: 'square', vol: 0.07 }); tone({ f: 2000, f2: 1300, dur: 0.08, delay: 0.09, type: 'square', vol: 0.06 }); },
    thump() { tone({ f: 120, f2: 60, dur: 0.12, type: 'sine', vol: 0.4 }); buzz(10); },
    pounce() { noise({ dur: 0.15, freq: 1800, vol: 0.2 }); buzz(12); },
  };
})(window.PC);
