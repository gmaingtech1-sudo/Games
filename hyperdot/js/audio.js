/* Hyperdot — sound, all synthesised with WebAudio, so the game ships with no
   audio files. Every axis has its own note, so a route through five
   dimensions plays a little tune. The music is a slow generative drift of
   soft notes that gets higher and wider with each dimension. */
(function (HD) {
  'use strict';

  let ctx = null;
  let master = null;
  let sfx = null;
  let musicBus = null;
  let echo = null;
  let noise = null;
  let soundOn = true;
  let musicOn = true;
  let musicTimer = 0;
  let musicWorld = 0;
  let suspended = false;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try {
        ctx = new AC();
      } catch (e) {
        return null;
      }
      master = ctx.createGain();
      master.gain.value = 0.75;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.ratio.value = 4;
      master.connect(comp);
      comp.connect(ctx.destination);
      sfx = ctx.createGain();
      sfx.gain.value = soundOn ? 0.8 : 0;
      sfx.connect(master);
      musicBus = ctx.createGain();
      musicBus.gain.value = musicOn ? 0.22 : 0;
      musicBus.connect(master);
      // A soft feedback echo, for the music and the sparkles.
      echo = ctx.createDelay(1.5);
      echo.delayTime.value = 0.42;
      const fb = ctx.createGain();
      fb.gain.value = 0.38;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2400;
      echo.connect(lp);
      lp.connect(fb);
      fb.connect(echo);
      const wet = ctx.createGain();
      wet.gain.value = 0.5;
      lp.connect(wet);
      wet.connect(master);
      const len = ctx.sampleRate;
      noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended' && !suspended) ctx.resume().catch(() => {});
    return ctx;
  }

  function tone(o) {
    const c = ctx;
    const t = c.currentTime + (o.delay || 0);
    const dur = o.dur || 0.15;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol || 0.2, t + (o.attack || 0.006));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let out = g;
    if (o.lp) {
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.lp;
      g.connect(f);
      out = f;
    }
    osc.connect(g);
    out.connect(o.bus || sfx);
    if (o.echo) out.connect(echo);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  function hiss(o) {
    const c = ctx;
    const t = c.currentTime + (o.delay || 0);
    const src = c.createBufferSource();
    src.buffer = noise;
    const f = c.createBiquadFilter();
    f.type = o.ftype || 'bandpass';
    f.frequency.setValueAtTime(o.f || 800, t);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);
    f.Q.value = o.q || 1;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol || 0.1, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(f);
    f.connect(g);
    g.connect(sfx);
    src.start(t, Math.random() * 0.5);
    src.stop(t + o.dur + 0.05);
  }

  // One note per axis: C, E, G, B, D — a stacked chord as the dimensions grow.
  const AXIS_NOTE = [523.25, 659.25, 783.99, 987.77, 1174.66];
  const PENTA = [0, 2, 4, 7, 9];
  const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

  const SOUNDS = {
    move(axis, dir) {
      const f = AXIS_NOTE[axis] * (dir > 0 ? 1 : 0.89);
      tone({ f, dur: 0.12, vol: 0.12, type: 'triangle' });
      tone({ f: f * 2, dur: 0.06, vol: 0.03, type: 'sine' });
    },
    slice(axis, dir) {
      const f = AXIS_NOTE[axis] * (dir > 0 ? 1 : 0.89);
      tone({ f: f * 0.5, f2: f, dur: 0.26, vol: 0.1, type: 'sine', echo: true });
      tone({ f: f * 1.5, dur: 0.2, vol: 0.04, type: 'triangle', delay: 0.05, echo: true });
      hiss({ f: 600, f2: 3000, dur: 0.24, vol: 0.05, q: 0.8 });
    },
    bump() {
      tone({ f: 150, f2: 90, dur: 0.1, vol: 0.16, type: 'square', lp: 500 });
    },
    push() {
      tone({ f: 110, f2: 70, dur: 0.14, vol: 0.18, type: 'triangle' });
      hiss({ f: 400, dur: 0.12, vol: 0.06, q: 2 });
    },
    shard() {
      [0, 4, 7, 12].forEach((s, i) => tone({ f: midi(84 + s), dur: 0.22, vol: 0.07, delay: i * 0.045, type: 'sine', echo: true }));
    },
    key() {
      tone({ f: 1567, dur: 0.1, vol: 0.07, type: 'triangle' });
      tone({ f: 2093, dur: 0.16, vol: 0.06, type: 'triangle', delay: 0.07, echo: true });
    },
    door() {
      tone({ f: 220, f2: 330, dur: 0.18, vol: 0.14, type: 'square', lp: 900 });
      tone({ f: 660, dur: 0.12, vol: 0.06, type: 'triangle', delay: 0.12 });
    },
    'gate-open'() {
      tone({ f: 300, f2: 900, dur: 0.22, vol: 0.08, type: 'sawtooth', lp: 1600 });
    },
    'gate-close'() {
      tone({ f: 800, f2: 260, dur: 0.22, vol: 0.08, type: 'sawtooth', lp: 1400 });
    },
    'exit-open'() {
      [0, 7, 12, 16].forEach((s, i) => tone({ f: midi(72 + s), dur: 0.5, vol: 0.06, delay: i * 0.08, type: 'sine', echo: true }));
    },
    win() {
      [0, 4, 7, 11, 14, 19].forEach((s, i) => tone({ f: midi(67 + s), dur: 0.7, vol: 0.07, delay: i * 0.07, type: 'triangle', echo: true }));
      tone({ f: midi(43), dur: 1.4, vol: 0.12, type: 'sine', delay: 0.05 });
    },
    star(i) {
      tone({ f: midi(79 + [0, 4, 7][i]), dur: 0.35, vol: 0.08, type: 'triangle', echo: true });
    },
    undo() {
      tone({ f: 700, f2: 450, dur: 0.09, vol: 0.06, type: 'sine' });
    },
    click() {
      tone({ f: 900, dur: 0.04, vol: 0.05, type: 'sine' });
    },
    deny() {
      tone({ f: 200, dur: 0.12, vol: 0.08, type: 'square', lp: 700 });
    },
    hint() {
      tone({ f: 880, dur: 0.15, vol: 0.06, type: 'sine', echo: true });
      tone({ f: 1320, dur: 0.2, vol: 0.05, type: 'sine', delay: 0.08, echo: true });
    },
  };

  function play(name, a, b) {
    if (!soundOn || !ensure()) return;
    const fn = SOUNDS[name];
    if (fn) {
      try {
        fn(a, b);
      } catch (e) { /* ignore audio glitches */ }
    }
  }

  /* ---------- Music ---------- */

  function musicStep() {
    if (!ctx || !musicOn || suspended) return;
    const n = musicWorld || 1;
    const root = 50 + n * 2;
    const spread = 1 + n;
    const deg = PENTA[Math.floor(Math.random() * PENTA.length)];
    const oct = 12 * Math.floor(Math.random() * Math.min(3, spread));
    tone({ f: midi(root + deg + oct), dur: 2.6, vol: 0.05, attack: 0.6, type: 'sine', bus: musicBus, echo: true });
    if (Math.random() < 0.35) tone({ f: midi(root - 12 + PENTA[Math.floor(Math.random() * 3)]), dur: 4, vol: 0.05, attack: 1.2, type: 'triangle', bus: musicBus, lp: 600 });
  }

  function music(world) {
    musicWorld = world;
    clearInterval(musicTimer);
    musicTimer = setInterval(musicStep, 1700);
  }

  HD.audio = {
    play,
    unlock() { ensure(); },
    music,
    setSound(on) {
      soundOn = !!on;
      if (sfx) sfx.gain.value = soundOn ? 0.8 : 0;
    },
    setMusic(on) {
      musicOn = !!on;
      if (musicBus) musicBus.gain.value = musicOn ? 0.22 : 0;
    },
    suspend(yes) {
      suspended = yes;
      if (!ctx) return;
      if (yes) ctx.suspend().catch(() => {});
      else ctx.resume().catch(() => {});
    },
  };
})(window.HD = window.HD || {});
