/* Emberdeep — sound effects and music, all synthesised with WebAudio, so
   the game ships no audio files. The music is a slow generative loop: a
   soft pad and a plucked melody in each biome's own mode. */
(function (ED) {
  'use strict';

  let ctx = null;
  let master = null;
  let sfxBus = null;
  let musicBus = null;
  let verb = null;
  let soundOn = true;
  let musicOn = true;
  let noiseBuf = null;
  let suspended = false;
  const last = {};

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { return null; }
      master = ctx.createGain();
      master.gain.value = 0.75;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.ratio.value = 4;
      master.connect(comp);
      comp.connect(ctx.destination);
      sfxBus = ctx.createGain();
      sfxBus.gain.value = soundOn ? 0.8 : 0;
      sfxBus.connect(master);
      musicBus = ctx.createGain();
      musicBus.gain.value = 0;
      musicBus.connect(master);
      // A cheap cave echo for the music: two feedback delays.
      verb = ctx.createGain();
      verb.gain.value = 0.35;
      for (const [t, fb] of [[0.31, 0.35], [0.47, 0.3]]) {
        const d = ctx.createDelay(1);
        d.delayTime.value = t;
        const f = ctx.createGain();
        f.gain.value = fb;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 1800;
        verb.connect(d);
        d.connect(lp);
        lp.connect(f);
        f.connect(d);
        lp.connect(musicBus);
      }
      const len = ctx.sampleRate;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended' && !suspended) ctx.resume().catch(() => {});
    return ctx;
  }

  function tone(o, bus) {
    const c = ctx;
    const t = (o.at || c.currentTime) + (o.delay || 0);
    const dur = o.dur || 0.15;
    const osc = c.createOscillator();
    const gn = c.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f || 440, t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + dur);
    if (o.detune) osc.detune.value = o.detune;
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(o.vol || 0.2, t + (o.attack || 0.005));
    gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let out = gn;
    if (o.lp) {
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.lp;
      gn.connect(f);
      out = f;
    }
    osc.connect(gn);
    out.connect(bus || sfxBus);
    if (o.send) out.connect(o.send);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  function noise(o) {
    const c = ctx;
    const t = (o.at || c.currentTime) + (o.delay || 0);
    const dur = o.dur || 0.1;
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    const filt = c.createBiquadFilter();
    filt.type = o.filter || 'bandpass';
    filt.frequency.setValueAtTime(o.freq || 1200, t);
    if (o.freq2) filt.frequency.exponentialRampToValueAtTime(o.freq2, t + dur);
    filt.Q.value = o.q || 1;
    const gn = c.createGain();
    gn.gain.setValueAtTime(o.vol || 0.2, t);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt);
    filt.connect(gn);
    gn.connect(sfxBus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  const arp = (notes, step, o) => notes.forEach((f, i) => tone(Object.assign({ f, dur: step * 1.8, delay: i * step }, o)));

  // Minimum seconds between repeats, so a busy fight doesn't turn to mush.
  const GAP = {
    tap: 0.04, tick: 0.06, crit: 0.06, kill: 0.05, slash: 0.07, arrow: 0.08, fire: 0.1, smite: 0.12, throw: 0.08,
    slam: 0.15, note: 0.12, void: 0.1, thorn: 0.12, breath: 0.2, spear: 0.1, floor: 0.3,
  };

  const sfx = {
    click: () => tone({ f: 880, dur: 0.04, vol: 0.07, type: 'triangle' }),
    tab: () => tone({ f: 620, f2: 820, dur: 0.06, vol: 0.07, type: 'triangle' }),
    buy: () => arp([660, 990], 0.05, { vol: 0.09, type: 'triangle' }),
    levelup: () => arp([523, 659, 784, 1047], 0.06, { vol: 0.1, type: 'triangle' }),
    deny: () => tone({ f: 200, f2: 150, dur: 0.14, vol: 0.1, type: 'square', lp: 900 }),
    tap: () => {
      noise({ dur: 0.05, freq: 2400 + Math.random() * 600, q: 1.5, vol: 0.12 });
      tone({ f: 300 + Math.random() * 40, f2: 120, dur: 0.06, vol: 0.12, type: 'triangle' });
    },
    tick: () => noise({ dur: 0.04, freq: 3000, q: 2, vol: 0.06 }),
    crit: () => {
      noise({ dur: 0.12, freq: 1800, freq2: 600, q: 1, vol: 0.18 });
      tone({ f: 180, f2: 60, dur: 0.18, vol: 0.2, type: 'square', lp: 700 });
      tone({ f: 1400, f2: 2100, dur: 0.1, vol: 0.05, type: 'triangle', delay: 0.02 });
    },
    kill: () => {
      tone({ f: 1320 + Math.random() * 60, dur: 0.08, vol: 0.06, type: 'triangle' });
      tone({ f: 1760 + Math.random() * 60, dur: 0.12, vol: 0.05, type: 'triangle', delay: 0.05 });
      noise({ dur: 0.15, freq: 500, freq2: 200, q: 0.7, vol: 0.08 });
    },
    floor: () => arp([392, 523], 0.07, { vol: 0.05, type: 'triangle' }),
    boss: () => {
      tone({ f: 82, dur: 0.9, vol: 0.22, type: 'sawtooth', lp: 400, attack: 0.05 });
      tone({ f: 87, dur: 0.9, vol: 0.18, type: 'sawtooth', lp: 400, attack: 0.05 });
      noise({ dur: 0.8, freq: 200, freq2: 90, q: 0.6, vol: 0.18 });
    },
    bossKill: () => {
      noise({ dur: 0.6, freq: 700, freq2: 80, q: 0.6, vol: 0.28 });
      tone({ f: 120, f2: 40, dur: 0.5, vol: 0.25, type: 'square', lp: 600 });
      arp([523, 659, 784, 1047, 1319], 0.07, { vol: 0.08, type: 'triangle', delay: 0.15 });
    },
    fail: () => arp([392, 349, 311, 262], 0.11, { vol: 0.08, type: 'triangle' }),
    slash: () => noise({ dur: 0.09, freq: 3200, freq2: 900, q: 1.2, vol: 0.12 }),
    arrow: () => noise({ dur: 0.12, freq: 2600, freq2: 4200, q: 3, vol: 0.06 }),
    fire: () => {
      noise({ dur: 0.35, freq: 600, freq2: 1800, q: 0.7, vol: 0.09 });
      tone({ f: 160, f2: 90, dur: 0.3, vol: 0.06, type: 'sawtooth', lp: 500 });
    },
    smite: () => {
      tone({ f: 1047, dur: 0.5, vol: 0.05, type: 'sine', attack: 0.02 });
      tone({ f: 1568, dur: 0.5, vol: 0.04, type: 'sine', attack: 0.02, delay: 0.03 });
      noise({ dur: 0.2, freq: 5000, q: 1, vol: 0.05 });
    },
    throw: () => noise({ dur: 0.08, freq: 3800, freq2: 2400, q: 2, vol: 0.06 }),
    slam: () => {
      tone({ f: 70, f2: 35, dur: 0.35, vol: 0.3, type: 'sine' });
      noise({ dur: 0.3, freq: 300, freq2: 80, q: 0.6, vol: 0.2 });
    },
    note: () => tone({ f: [523, 587, 659, 784, 880][Math.floor(Math.random() * 5)], dur: 0.3, vol: 0.06, type: 'triangle' }),
    void: () => tone({ f: 220, f2: 110, dur: 0.4, vol: 0.07, type: 'sawtooth', lp: 900, detune: 15 }),
    thorn: () => noise({ dur: 0.18, freq: 900, freq2: 2600, q: 2, vol: 0.1 }),
    breath: () => noise({ dur: 0.5, freq: 400, freq2: 1500, q: 0.5, vol: 0.14 }),
    spear: () => {
      noise({ dur: 0.14, freq: 4000, freq2: 1500, q: 2, vol: 0.08 });
      tone({ f: 1760, f2: 880, dur: 0.15, vol: 0.04, type: 'triangle' });
    },
    boom: () => {
      noise({ dur: 0.9, freq: 900, freq2: 60, q: 0.5, vol: 0.35 });
      tone({ f: 90, f2: 30, dur: 0.8, vol: 0.3, type: 'sine' });
    },
    wisp: () => arp([1568, 2093, 2637], 0.08, { vol: 0.035, type: 'sine' }),
    catch: () => arp([784, 1047, 1319, 1568, 2093], 0.045, { vol: 0.07, type: 'sine' }),
    relic: () => {
      arp([523, 659, 784, 1047, 1319, 1568], 0.07, { vol: 0.08, type: 'triangle' });
      noise({ dur: 0.6, freq: 6000, q: 0.8, vol: 0.05, delay: 0.3 });
    },
    chest: () => {
      tone({ f: 140, f2: 90, dur: 0.2, vol: 0.15, type: 'square', lp: 500 });
      noise({ dur: 0.25, freq: 1200, q: 1, vol: 0.1, delay: 0.05 });
    },
    skill: () => {
      tone({ f: 392, f2: 784, dur: 0.25, vol: 0.08, type: 'sawtooth', lp: 2000 });
      noise({ dur: 0.3, freq: 1500, freq2: 4000, q: 1, vol: 0.06 });
    },
    gold: () => arp([1319, 1568, 1976, 2637], 0.05, { vol: 0.06, type: 'triangle' }),
    claim: () => arp([659, 880, 1175], 0.07, { vol: 0.08, type: 'triangle' }),
    rekindle: () => {
      noise({ dur: 2, freq: 200, freq2: 3000, q: 0.6, vol: 0.2 });
      arp([262, 392, 523, 659, 784, 1047], 0.18, { vol: 0.09, type: 'triangle' });
    },
    warp: () => {
      tone({ f: 200, f2: 1600, dur: 0.8, vol: 0.08, type: 'sine' });
      tone({ f: 1600, f2: 200, dur: 0.8, vol: 0.05, type: 'sine', delay: 0.1 });
    },
  };

  function play(name) {
    if (!soundOn || !ensure() || suspended) return;
    const fn = sfx[name];
    if (!fn) return;
    const now = ctx.currentTime;
    if (GAP[name] && last[name] && now - last[name] < GAP[name]) return;
    last[name] = now;
    try { fn(); } catch (e) { /* ignore audio hiccups */ }
  }

  /* ---------- Music ---------- */

  const BASE = 146.83; // D3
  let mode = [0, 3, 7, 10];
  let timer = null;
  let nextBar = 0;
  let bar = 0;
  let melody = 0;
  const rnd = Math.random;

  const hz = (semi) => BASE * Math.pow(2, semi / 12);

  // Seven-note scale built from a biome's four-note colour.
  function scale() {
    const s = new Set([0, 7]);
    for (const m of mode) s.add(m % 12);
    const fill = [2, 5, 9, 8, 1, 11];
    for (const f of fill) { if (s.size >= 7) break; s.add(f); }
    return [...s].sort((a, b) => a - b);
  }

  function schedule() {
    if (!ctx || !musicOn || suspended) return;
    const spb = 60 / 64; // a slow pulse
    while (nextBar < ctx.currentTime + 1.5) {
      const t = nextBar;
      const roots = [0, mode[1] > 4 ? 5 : 8, mode[2] || 7, mode[3] || 10];
      const root = roots[bar % 4];
      // Pad: root, fifth and the mode's third, low and soft.
      for (const [semi, vol] of [[root - 12, 0.05], [root - 5, 0.035], [root + (mode[1] || 3), 0.03]]) {
        for (const det of [-6, 6]) {
          tone({ at: t, f: hz(semi), dur: spb * 4.2, vol, type: 'triangle', attack: 1.2, lp: 700, detune: det }, musicBus);
        }
      }
      // A few plucked notes from the scale, echoing off the cave walls.
      const sc = scale();
      const n = 2 + Math.floor(rnd() * 3);
      for (let i = 0; i < n; i++) {
        melody = (melody + (rnd() < 0.5 ? 1 : rnd() < 0.5 ? -1 : 2) + sc.length) % sc.length;
        const oct = rnd() < 0.3 ? 24 : 12;
        tone({ at: t + Math.floor(rnd() * 8) * spb / 2, f: hz(sc[melody] + oct), dur: 1.4, vol: 0.045, type: 'sine', attack: 0.01, send: verb }, musicBus);
      }
      nextBar += spb * 4;
      bar += 1;
    }
  }

  function startMusic() {
    if (!ensure()) return;
    if (!timer) {
      nextBar = ctx.currentTime + 0.1;
      timer = setInterval(schedule, 400);
    }
    musicBus.gain.cancelScheduledValues(ctx.currentTime);
    musicBus.gain.setTargetAtTime(musicOn ? 0.9 : 0, ctx.currentTime, 0.8);
  }

  function setMode(m) {
    if (m && m.join() !== mode.join()) {
      mode = m.slice();
      melody = 0;
    }
  }

  function setSound(on) {
    soundOn = !!on;
    if (sfxBus) sfxBus.gain.value = soundOn ? 0.8 : 0;
  }
  function setMusic(on) {
    musicOn = !!on;
    if (!ctx) return;
    if (musicOn) startMusic();
    else musicBus.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
  }

  function unlock() {
    if (!ensure()) return;
    if (musicOn) startMusic();
  }

  function suspend(on) {
    suspended = !!on;
    if (!ctx) return;
    if (on) ctx.suspend().catch(() => {});
    else {
      ctx.resume().catch(() => {});
      nextBar = Math.max(nextBar, ctx.currentTime + 0.1);
    }
  }

  ED.audio = { play, unlock, setSound, setMusic, setMode, suspend };
})(window.ED = window.ED || {});
