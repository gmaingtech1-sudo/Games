/* Rollmancer — sound effects and music, synthesised with WebAudio. There
   are no audio files. The context starts on the first tap (browsers
   require a gesture). */
(function (RM) {
  'use strict';

  let ac = null;
  let master, sfx, mus, noiseBuf, verb;
  const opts = { sound: true, music: true };

  function init() {
    if (ac) return ac;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = 0.9;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    master.connect(comp);
    comp.connect(ac.destination);
    sfx = ac.createGain();
    sfx.gain.value = opts.sound ? 0.8 : 0;
    sfx.connect(master);
    mus = ac.createGain();
    mus.gain.value = opts.music ? 0.32 : 0;
    // A cheap "room": a feedback delay, shared by music and some effects.
    verb = ac.createGain();
    verb.gain.value = 0.28;
    const d = ac.createDelay(1);
    d.delayTime.value = 0.19;
    const fb = ac.createGain();
    fb.gain.value = 0.38;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2200;
    verb.connect(d);
    d.connect(lp);
    lp.connect(fb);
    fb.connect(d);
    lp.connect(master);
    mus.connect(master);
    mus.connect(verb);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const ch = noiseBuf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    return ac;
  }

  function unlock() {
    if (!init()) return;
    if (ac.state === 'suspended') ac.resume();
  }

  function setOpts(o) {
    Object.assign(opts, o);
    if (!ac) return;
    sfx.gain.setTargetAtTime(opts.sound ? 0.8 : 0, ac.currentTime, 0.05);
    mus.gain.setTargetAtTime(opts.music ? 0.32 : 0, ac.currentTime, 0.2);
  }

  const now = () => ac.currentTime;
  const ok = () => ac && opts.sound && ac.state === 'running';

  function tone(freq, dur, o) {
    o = o || {};
    const t = now() + (o.delay || 0);
    const osc = ac.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + dur);
    const g = ac.createGain();
    const v = o.vol == null ? 0.3 : o.vol;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + (o.attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(o.bus || sfx);
    if (o.wet) g.connect(verb);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  function noise(dur, o) {
    o = o || {};
    const t = now() + (o.delay || 0);
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    src.playbackRate.value = o.rate || 1;
    const f = ac.createBiquadFilter();
    f.type = o.filter || 'bandpass';
    f.frequency.setValueAtTime(o.freq || 2000, t);
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    f.Q.value = o.q || 1;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol || 0.3, t + (o.attack || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(o.bus || sfx);
    if (o.wet) g.connect(verb);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  // Pentatonic steps so rising sequences always sound pleasant.
  const PENTA = [0, 2, 4, 7, 9];
  const step = (base, k) => base * Math.pow(2, (PENTA[k % 5] + 12 * Math.floor(k / 5)) / 12);

  const S = {
    tap() { if (!ok()) return; tone(660, 0.06, { type: 'triangle', vol: 0.12 }); },
    hold(on) {
      if (!ok()) return;
      tone(on ? 520 : 400, 0.08, { type: 'triangle', vol: 0.16, to: on ? 780 : 300 });
    },
    deny() { if (!ok()) return; tone(150, 0.16, { type: 'square', vol: 0.08, to: 110 }); },
    rattle() {
      if (!ok()) return;
      for (let i = 0; i < 7; i++) noise(0.04, { delay: i * 0.035 + Math.random() * 0.02, freq: 2600 + Math.random() * 1800, q: 3, vol: 0.18 });
    },
    clack(i) {
      if (!ok()) return;
      const d = (i || 0) * 0.01;
      noise(0.05, { delay: d, freq: 3000 + Math.random() * 1200, q: 4, vol: 0.32 });
      tone(180 + Math.random() * 40, 0.07, { delay: d, vol: 0.22, to: 90 });
    },
    tick(k) {
      if (!ok()) return;
      tone(step(392, k), 0.12, { type: 'triangle', vol: 0.2, wet: true });
    },
    mult(k) {
      if (!ok()) return;
      const f = step(523, k + 2);
      tone(f, 0.22, { type: 'sine', vol: 0.22, wet: true });
      tone(f * 2, 0.18, { type: 'triangle', vol: 0.07 });
    },
    xmult() {
      if (!ok()) return;
      tone(110, 0.5, { type: 'sine', vol: 0.45, to: 55 });
      noise(0.35, { freq: 400, to: 80, q: 0.8, vol: 0.25, filter: 'lowpass' });
      tone(880, 0.5, { type: 'triangle', vol: 0.1, wet: true, delay: 0.03 });
      tone(1320, 0.45, { type: 'sine', vol: 0.08, wet: true, delay: 0.06 });
    },
    gold() {
      if (!ok()) return;
      tone(1568, 0.1, { type: 'square', vol: 0.06 });
      tone(2093, 0.22, { type: 'square', vol: 0.06, delay: 0.06, wet: true });
    },
    nope() { if (!ok()) return; tone(300, 0.14, { type: 'sawtooth', vol: 0.06, to: 160 }); },
    cast() {
      if (!ok()) return;
      noise(0.45, { freq: 300, to: 4000, q: 1.5, vol: 0.22, filter: 'bandpass' });
      tone(220, 0.4, { type: 'sawtooth', vol: 0.06, to: 880 });
    },
    impact(power) {
      if (!ok()) return;
      const p = Math.max(0.3, Math.min(1, power || 0.5));
      tone(90, 0.35 + p * 0.3, { vol: 0.35 + p * 0.3, to: 40 });
      noise(0.25 + p * 0.3, { freq: 1200, to: 120, q: 0.7, vol: 0.25 + p * 0.25, filter: 'lowpass' });
      if (p > 0.7) tone(55, 0.8, { type: 'triangle', vol: 0.3, to: 30 });
    },
    squeal() {
      if (!ok()) return;
      tone(600 + Math.random() * 200, 0.18, { type: 'sawtooth', vol: 0.06, to: 300 });
    },
    heal() {
      if (!ok()) return;
      [0, 1, 2].forEach((k) => tone(step(330, k * 2), 0.25, { delay: k * 0.07, type: 'sine', vol: 0.12, wet: true }));
    },
    kill() {
      if (!ok()) return;
      noise(0.7, { freq: 900, to: 60, q: 0.6, vol: 0.4, filter: 'lowpass' });
      tone(70, 0.8, { vol: 0.4, to: 30 });
      [0, 1, 2, 3, 4, 5].forEach((k) => tone(step(523, k), 0.3, { delay: 0.2 + k * 0.06, type: 'triangle', vol: 0.12, wet: true }));
    },
    win() {
      if (!ok()) return;
      [0, 2, 4, 7].forEach((n, k) => {
        tone(392 * Math.pow(2, n / 12), 0.5, { delay: k * 0.11, type: 'triangle', vol: 0.18, wet: true });
        tone(196 * Math.pow(2, n / 12), 0.5, { delay: k * 0.11, type: 'sine', vol: 0.12 });
      });
    },
    lose() {
      if (!ok()) return;
      [0, -3, -7, -12].forEach((n, k) => tone(330 * Math.pow(2, n / 12), 0.5, { delay: k * 0.18, type: 'triangle', vol: 0.15, wet: true }));
    },
    heart() {
      if (!ok()) return;
      noise(0.12, { freq: 2500, q: 2, vol: 0.3 });
      tone(200, 0.4, { type: 'square', vol: 0.08, to: 70 });
    },
    buy() {
      if (!ok()) return;
      tone(988, 0.08, { type: 'square', vol: 0.07 });
      tone(1319, 0.25, { type: 'square', vol: 0.07, delay: 0.07, wet: true });
      noise(0.1, { freq: 6000, q: 2, vol: 0.08, delay: 0.05 });
    },
    sell() {
      if (!ok()) return;
      tone(1319, 0.08, { type: 'square', vol: 0.06 });
      tone(988, 0.2, { type: 'square', vol: 0.06, delay: 0.07 });
    },
    etch() {
      if (!ok()) return;
      [0, 1, 2, 3, 4].forEach((k) => tone(step(784, k), 0.35, { delay: k * 0.045, type: 'sine', vol: 0.1, wet: true }));
      noise(0.3, { freq: 7000, q: 3, vol: 0.05 });
    },
    level() {
      if (!ok()) return;
      [0, 2, 4, 5, 7].forEach((k, i) => tone(step(440, k), 0.25, { delay: i * 0.06, type: 'triangle', vol: 0.14, wet: true }));
    },
    whoosh() {
      if (!ok()) return;
      noise(0.3, { freq: 600, to: 2400, q: 0.8, vol: 0.12 });
    },
    trinket() {
      if (!ok()) return;
      tone(700, 0.2, { type: 'triangle', vol: 0.14, to: 1400, wet: true });
    },
    boss() {
      if (!ok()) return;
      tone(55, 1.4, { type: 'sawtooth', vol: 0.12, to: 50 });
      tone(82, 1.4, { type: 'sawtooth', vol: 0.08, to: 78 });
      noise(1.2, { freq: 200, q: 0.5, vol: 0.15, filter: 'lowpass' });
    },
  };

  /* ---------------- music ----------------
     A slow minor-key loop per area: a soft pad on each chord, a plucked
     arpeggio over it and, for bosses, a pulsing bass. Scheduled a little
     ahead on a timer so it never stutters. */
  const SCALES = [
    { root: 220.0, prog: [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [-5, -2, 2]] },
    { root: 196.0, prog: [[0, 3, 7], [1, 5, 8], [-2, 2, 5], [-4, 0, 3]] },
    { root: 174.6, prog: [[0, 3, 7], [-2, 2, 5], [-4, 0, 3], [-5, -1, 2]] },
    { root: 185.0, prog: [[0, 3, 6], [-1, 3, 6], [-3, 0, 4], [-4, -1, 3]] },
  ];
  const music = { on: false, area: 0, boss: false, next: 0, beat: 0, timer: null, intensity: 0 };

  function note(freq, t, dur, type, vol, bus) {
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.4, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = type === 'sawtooth' ? 900 : 2400;
    o.connect(f);
    f.connect(g);
    g.connect(bus || mus);
    o.start(t);
    o.stop(t + dur + 0.1);
  }
  function pluck(freq, t, vol) {
    const o = ac.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    o.connect(g);
    g.connect(mus);
    o.start(t);
    o.stop(t + 0.7);
  }

  function schedule() {
    if (!ac || !music.on) return;
    const sc = SCALES[music.area % SCALES.length];
    const bpm = music.boss ? 104 : 76;
    const beatLen = 60 / bpm / 2; // eighth notes
    while (music.next < ac.currentTime + 0.4) {
      const t = music.next;
      const b = music.beat;
      const bar = Math.floor(b / 8) % sc.prog.length;
      const chord = sc.prog[bar];
      const f = (n) => sc.root * Math.pow(2, n / 12);
      if (b % 8 === 0) {
        chord.forEach((n) => note(f(n) / 2, t, beatLen * 8.5, 'sine', 0.07));
        note(f(chord[0]) / 4, t, beatLen * 8, 'triangle', 0.09);
      }
      // arpeggio: skip some notes so it breathes
      const pattern = music.boss ? [0, 1, 2, 1, 0, 2, 1, 2] : [0, -1, 1, -1, 2, -1, 1, -1];
      const k = pattern[b % 8];
      if (k >= 0) pluck(f(chord[k]) * (b % 16 >= 8 ? 2 : 1), t, music.boss ? 0.07 : 0.055);
      if (music.boss && b % 2 === 0) note(f(chord[0]) / 4, t, beatLen * 0.9, 'sawtooth', 0.06);
      music.beat += 1;
      music.next += beatLen;
    }
  }

  function playMusic(area, boss) {
    if (!init()) return;
    const changed = music.area !== area || music.boss !== !!boss;
    music.area = area;
    music.boss = !!boss;
    if (!music.on) {
      music.on = true;
      music.next = ac.currentTime + 0.1;
      music.beat = 0;
      music.timer = setInterval(schedule, 120);
    } else if (changed) {
      music.beat = 0;
    }
  }
  function stopMusic() {
    music.on = false;
    if (music.timer) clearInterval(music.timer);
    music.timer = null;
  }

  RM.audio = Object.assign({ unlock, setOpts, playMusic, stopMusic }, S);
})(window.RM);
