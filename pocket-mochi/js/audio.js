/* Pocket Mochi — synthesized sound effects and haptics.
   Everything is generated with WebAudio so the game ships with no audio files. */
(function (PM) {
  'use strict';

  let ctx = null;
  let master = null;
  let soundOn = true;
  let vibeOn = true;

  function ensure() {
    if (!soundOn) return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try {
        ctx = new AC();
      } catch (e) {
        return null;
      }
      master = ctx.createGain();
      master.gain.value = 0.55;
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
    osc.frequency.setValueAtTime(o.f || 440, t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol || 0.2, t + (o.attack || 0.01));
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
    filt.type = o.filter || 'bandpass';
    filt.frequency.value = o.freq || 1200;
    filt.Q.value = o.q || 1;
    const g = c.createGain();
    g.gain.value = o.vol || 0.2;
    src.connect(filt);
    filt.connect(g);
    g.connect(master);
    src.start(t);
  }

  function arp(notes, step, o) {
    notes.forEach((f, i) => tone(Object.assign({ f, dur: step * 1.6, delay: i * step }, o)));
  }

  // Plays [frequency, beats] pairs one after another.
  function tune(notes, beat, o) {
    let at = 0;
    notes.forEach(([f, b]) => {
      tone(Object.assign({ f, dur: Math.max(0.12, b * beat * 0.95), delay: at }, o));
      at += b * beat;
    });
  }

  const G4 = 392;
  const A4 = 440;
  const B4 = 494;
  const C5 = 523;
  const D5 = 587;

  const sfx = {
    click: () => tone({ f: 520, dur: 0.04, vol: 0.12, type: 'triangle' }),
    tap: () => tone({ f: 620, f2: 900, dur: 0.09, vol: 0.18, type: 'triangle' }),
    giggle: () => [0, 0.08, 0.16].forEach((d, i) =>
      tone({ f: 720 + i * 160, f2: 980 + i * 160, dur: 0.07, delay: d, vol: 0.16, type: 'triangle' })),
    purr: () => {
      for (let i = 0; i < 3; i++) tone({ f: 120, f2: 150, dur: 0.07, delay: i * 0.08, vol: 0.12, type: 'triangle' });
    },
    chomp: () => {
      noise({ dur: 0.07, freq: 900, q: 2, vol: 0.45 });
      tone({ f: 180, f2: 90, dur: 0.08, vol: 0.18, type: 'square' });
    },
    yum: () => arp([660, 880, 1320], 0.07, { vol: 0.14, type: 'triangle' }),
    bubble: () => tone({ f: 400 + Math.random() * 500, f2: 1400, dur: 0.06, vol: 0.12 }),
    splash: () => noise({ dur: 0.6, freq: 2600, q: 0.6, vol: 0.25 }),
    coin: () => {
      tone({ f: 988, dur: 0.07, vol: 0.1, type: 'square' });
      tone({ f: 1319, dur: 0.22, delay: 0.07, vol: 0.1, type: 'square' });
    },
    star: () => tone({ f: 880, f2: 1760, dur: 0.12, vol: 0.14, type: 'triangle' }),
    hurt: () => tone({ f: 320, f2: 110, dur: 0.3, vol: 0.14, type: 'sawtooth' }),
    sad: () => {
      tone({ f: 440, f2: 330, dur: 0.25, vol: 0.14, type: 'triangle' });
      tone({ f: 370, f2: 260, dur: 0.35, delay: 0.25, vol: 0.14, type: 'triangle' });
    },
    no: () => {
      tone({ f: 300, dur: 0.1, vol: 0.14, type: 'square' });
      tone({ f: 240, dur: 0.14, delay: 0.13, vol: 0.14, type: 'square' });
    },
    yawn: () => tone({ f: 420, f2: 180, dur: 0.7, vol: 0.12, attack: 0.2 }),
    sparkle: () => arp([1320, 1760, 2093], 0.05, { vol: 0.08 }),
    crack: () => noise({ dur: 0.05, freq: 3000, q: 3, vol: 0.4 }),
    hatch: () => arp([523, 659, 784, 1047, 1319], 0.09, { vol: 0.15, type: 'triangle' }),
    levelup: () => arp([523, 659, 784, 1047, 784, 1047, 1319], 0.08, { vol: 0.14, type: 'square' }),
    medicine: () => {
      tone({ f: 500, f2: 250, dur: 0.2, vol: 0.12, type: 'triangle' });
      arp([784, 988, 1175], 0.07, { vol: 0.1, delay: 0.25 });
    },
    lights: () => tone({ f: 200, dur: 0.05, vol: 0.2, type: 'square' }),
    gameover: () => arp([784, 659, 523, 392], 0.12, { vol: 0.14, type: 'triangle' }),
    swoosh: () => noise({ dur: 0.22, freq: 900, q: 0.8, vol: 0.18 }),
    boing: () => tone({ f: 220, f2: 560, dur: 0.16, vol: 0.16, type: 'triangle' }),
    thump: () => tone({ f: 150, f2: 80, dur: 0.09, vol: 0.18 }),
    birthday: () => tune([[G4, 0.75], [G4, 0.25], [A4, 1], [G4, 1], [C5, 1], [B4, 2],
      [G4, 0.75], [G4, 0.25], [A4, 1], [G4, 1], [D5, 1], [C5, 2]], 0.26, { vol: 0.13, type: 'triangle' }),
    puff: () => noise({ dur: 0.25, freq: 700, q: 0.5, vol: 0.3, filter: 'lowpass' }),
    pop: () => {
      noise({ dur: 0.08, freq: 1800, q: 1.5, vol: 0.35 });
      tone({ f: 600, f2: 1200, dur: 0.1, vol: 0.12, type: 'triangle' });
    },
    ding: () => {
      tone({ f: 1175, dur: 0.18, vol: 0.12 });
      tone({ f: 1568, dur: 0.3, delay: 0.1, vol: 0.1 });
    },
    squeak: () => {
      tone({ f: 1400, f2: 2100, dur: 0.07, vol: 0.12, type: 'triangle' });
      tone({ f: 2000, f2: 1300, dur: 0.09, delay: 0.07, vol: 0.12, type: 'triangle' });
    },
  };

  PM.audio = {
    play(name) {
      if (!soundOn || !sfx[name]) return;
      try { sfx[name](); } catch (e) { /* audio is optional */ }
    },
    unlock() { ensure(); },
    setSound(on) { soundOn = !!on; if (on) ensure(); },
    setVibe(on) { vibeOn = !!on; },
    buzz(pattern) {
      if (vibeOn) PM.host.haptic(pattern);
    },
  };
})(window.PM = window.PM || {});
