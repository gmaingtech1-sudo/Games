/* Starforge — sound effects and music, all synthesised with WebAudio, so the
   game ships with no audio files. */
(function (SF) {
  'use strict';

  let ctx = null;
  let master = null;
  let sfxBus = null;
  let musicBus = null;
  let soundOn = true;
  let musicOn = true;
  let noiseBuf = null;
  const last = {};

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
      master.gain.value = 0.7;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      master.connect(comp);
      comp.connect(ctx.destination);
      sfxBus = ctx.createGain();
      sfxBus.gain.value = soundOn ? 0.9 : 0;
      sfxBus.connect(master);
      musicBus = ctx.createGain();
      musicBus.gain.value = 0;
      musicBus.connect(master);
      const len = ctx.sampleRate;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  function tone(o, bus) {
    const c = ctx;
    const t = (o.at || c.currentTime) + (o.delay || 0);
    const dur = o.dur || 0.15;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f || 440, t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + dur);
    if (o.detune) osc.detune.value = o.detune;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol || 0.2, t + (o.attack || 0.005));
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
    out.connect(bus || sfxBus);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  function noise(o, bus) {
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
    const g = c.createGain();
    g.gain.setValueAtTime(o.vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(bus || sfxBus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  const arp = (notes, step, o) => notes.forEach((f, i) => tone(Object.assign({ f, dur: step * 1.8, delay: i * step }, o)));

  // Minimum time between repeats, so rapid fire doesn't turn into a wall of noise.
  const GAP = { pulse: 0.075, scatter: 0.12, arc: 0.1, hit: 0.045, coin: 0.035, pop: 0.03, shieldhit: 0.08, deflect: 0.05 };
  let coinStreak = 0;
  let coinT = 0;

  const sfx = {
    click: () => tone({ f: 900, dur: 0.035, vol: 0.08, type: 'triangle' }),
    tab: () => tone({ f: 640, f2: 820, dur: 0.05, vol: 0.08, type: 'triangle' }),
    equip: () => {
      tone({ f: 420, f2: 840, dur: 0.1, vol: 0.12, type: 'square', lp: 2400 });
      noise({ dur: 0.08, freq: 3000, q: 2, vol: 0.08, delay: 0.06 });
    },
    buy: () => arp([660, 880, 1175, 1568], 0.06, { vol: 0.1, type: 'square', lp: 3000 }),
    deny: () => {
      tone({ f: 220, dur: 0.09, vol: 0.12, type: 'square', lp: 1200 });
      tone({ f: 170, dur: 0.14, delay: 0.1, vol: 0.12, type: 'square', lp: 1200 });
    },
    launch: () => {
      noise({ dur: 1.1, freq: 300, freq2: 2400, q: 0.8, vol: 0.3 });
      tone({ f: 80, f2: 320, dur: 1, vol: 0.18, type: 'sawtooth', lp: 900 });
    },
    pulse: () => tone({ f: 1300 + Math.random() * 80, f2: 520, dur: 0.06, vol: 0.035, type: 'square', lp: 2600 }),
    scatter: () => noise({ dur: 0.1, freq: 1800, freq2: 500, q: 0.7, vol: 0.12 }),
    rail: () => {
      tone({ f: 2400, f2: 180, dur: 0.22, vol: 0.09, type: 'sawtooth', lp: 4000 });
      noise({ dur: 0.18, freq: 5000, freq2: 800, q: 0.6, vol: 0.1 });
    },
    arc: () => noise({ dur: 0.08, freq: 4200, q: 3, vol: 0.12 }),
    side: () => tone({ f: 900, f2: 420, dur: 0.05, vol: 0.025, type: 'square', lp: 2000 }),
    hit: () => tone({ f: 260 + Math.random() * 60, f2: 150, dur: 0.04, vol: 0.05, type: 'square', lp: 1500 }),
    pop: () => {
      noise({ dur: 0.22, freq: 900, freq2: 200, q: 0.7, vol: 0.3 });
      tone({ f: 160, f2: 50, dur: 0.18, vol: 0.14 });
    },
    boom: () => {
      noise({ dur: 0.6, freq: 700, freq2: 90, q: 0.6, vol: 0.45 });
      tone({ f: 110, f2: 32, dur: 0.5, vol: 0.28 });
    },
    bigboom: () => {
      noise({ dur: 1.6, freq: 500, freq2: 50, q: 0.5, vol: 0.6 });
      tone({ f: 70, f2: 22, dur: 1.4, vol: 0.4 });
      noise({ dur: 0.3, freq: 3000, freq2: 600, q: 0.8, vol: 0.25, delay: 0.05 });
    },
    hurt: () => {
      noise({ dur: 0.3, freq: 600, freq2: 150, q: 0.9, vol: 0.4 });
      tone({ f: 190, f2: 60, dur: 0.3, vol: 0.2, type: 'sawtooth', lp: 900 });
    },
    shieldhit: () => tone({ f: 1500, f2: 600, dur: 0.14, vol: 0.08, type: 'sine' }),
    shieldup: () => arp([523, 784, 1047], 0.05, { vol: 0.06, type: 'sine' }),
    deflect: () => tone({ f: 2200, f2: 1400, dur: 0.05, vol: 0.04, type: 'triangle' }),
    coin: () => {
      const now = ctx.currentTime;
      coinStreak = now - coinT < 0.5 ? Math.min(coinStreak + 1, 14) : 0;
      coinT = now;
      const f = 1046 * Math.pow(2, coinStreak / 24);
      tone({ f, dur: 0.05, vol: 0.05, type: 'square', lp: 5000 });
      tone({ f: f * 1.5, dur: 0.1, delay: 0.045, vol: 0.05, type: 'square', lp: 5000 });
    },
    power: () => arp([523, 659, 784, 1047, 1319], 0.055, { vol: 0.1, type: 'square', lp: 3500 }),
    repair: () => arp([392, 523, 659, 784], 0.07, { vol: 0.1, type: 'triangle' }),
    ready: () => arp([784, 1175], 0.07, { vol: 0.08, type: 'triangle' }),
    nova: () => {
      tone({ f: 60, f2: 400, dur: 0.15, vol: 0.3, type: 'sawtooth', lp: 800 });
      noise({ dur: 1.2, freq: 2000, freq2: 120, q: 0.5, vol: 0.5, delay: 0.1 });
      tone({ f: 90, f2: 30, dur: 1, vol: 0.35, delay: 0.1 });
    },
    seekers: () => {
      for (let i = 0; i < 6; i++) noise({ dur: 0.25, freq: 700, freq2: 2600, q: 1, vol: 0.12, delay: i * 0.14 });
    },
    missile: () => noise({ dur: 0.25, freq: 900, freq2: 2600, q: 1.2, vol: 0.06 }),
    aegis: () => {
      tone({ f: 200, f2: 800, dur: 0.5, vol: 0.14, type: 'triangle' });
      arp([523, 659, 784, 1047], 0.08, { vol: 0.08, delay: 0.2 });
    },
    overdrive: () => {
      tone({ f: 110, f2: 880, dur: 0.7, vol: 0.16, type: 'sawtooth', lp: 1800 });
      tone({ f: 165, f2: 1320, dur: 0.7, vol: 0.1, type: 'square', lp: 1800 });
    },
    drones: () => arp([880, 1175, 880, 1175], 0.07, { vol: 0.08, type: 'square', lp: 3000 }),
    warning: () => {
      for (let i = 0; i < 3; i++) tone({ f: 520, f2: 380, dur: 0.38, vol: 0.14, type: 'sawtooth', lp: 1600, delay: i * 0.5 });
    },
    laserwarn: () => tone({ f: 900, f2: 1800, dur: 0.6, vol: 0.05, type: 'sine' }),
    laser: () => {
      tone({ f: 180, f2: 90, dur: 0.6, vol: 0.18, type: 'sawtooth', lp: 1400 });
      noise({ dur: 0.5, freq: 1500, q: 0.6, vol: 0.18 });
    },
    sector: () => arp([392, 523, 659, 784], 0.1, { vol: 0.08, type: 'triangle' }),
    clear: () => arp([523, 659, 784, 1047, 784, 1047, 1319, 1568], 0.08, { vol: 0.1, type: 'square', lp: 3200 }),
    over: () => arp([659, 523, 440, 330, 262], 0.16, { vol: 0.11, type: 'triangle' }),
    best: () => arp([784, 988, 1175, 1568, 1976], 0.08, { vol: 0.1, type: 'square', lp: 4000 }),
  };

  /* ---------- Beam hum (a looping sound while the Plasma Beam fires) ---------- */

  let hum = null;
  function setHum(on) {
    if (on && !hum && soundOn && ctx && ctx.state === 'running') {
      const o1 = ctx.createOscillator();
      const o2 = ctx.createOscillator();
      const g = ctx.createGain();
      const f = ctx.createBiquadFilter();
      o1.type = 'sawtooth';
      o1.frequency.value = 110;
      o2.type = 'square';
      o2.frequency.value = 221;
      f.type = 'lowpass';
      f.frequency.value = 900;
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 0.08);
      o1.connect(f);
      o2.connect(f);
      f.connect(g);
      g.connect(sfxBus);
      o1.start();
      o2.start();
      hum = { o1, o2, g };
    } else if (!on && hum) {
      const h = hum;
      hum = null;
      const t = ctx.currentTime;
      h.g.gain.cancelScheduledValues(t);
      h.g.gain.setValueAtTime(h.g.gain.value, t);
      h.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
      h.o1.stop(t + 0.1);
      h.o2.stop(t + 0.1);
    }
  }

  /* ---------- Music: a small step sequencer ---------- */

  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
  const SONGS = {
    // Chords are [root, third, fifth] as MIDI notes; one chord per bar.
    hangar: { bpm: 84, chords: [[45, 48, 52], [41, 45, 48], [48, 52, 55], [43, 47, 50]], drums: false, pad: true, arpEvery: 2 },
    flight: { bpm: 118, chords: [[45, 48, 52], [41, 45, 48], [48, 52, 55], [43, 47, 50]], drums: true, pad: false, arpEvery: 1 },
    boss: { bpm: 132, chords: [[50, 53, 57], [46, 50, 53], [43, 46, 50], [45, 49, 52]], drums: true, pad: false, arpEvery: 1, hard: true },
  };
  const BASS = [1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1];
  const BASS_HARD = [1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 0, 1, 1];
  const ARP = [0, 1, 2, 3, 2, 1, 0, 2, 0, 1, 2, 3, 2, 3, 1, 2];

  let song = null;
  let songName = null;
  let step = 0;
  let nextAt = 0;
  let timer = null;

  function scheduleStep(s, at) {
    const bar = Math.floor(step / 16) % s.chords.length;
    const i = step % 16;
    const ch = s.chords[bar];
    const dur16 = 60 / s.bpm / 4;
    if (s.pad && i === 0) {
      for (const n of ch) tone({ at, f: midi(n + 12), dur: dur16 * 16, vol: 0.03, attack: 0.6, type: 'triangle' }, musicBus);
    }
    if ((s.hard ? BASS_HARD : BASS)[i] && (!s.pad || i % 4 === 0)) {
      const oct = i % 8 === 6 ? 12 : 0;
      tone({ at, f: midi(ch[0] - 12 + oct), dur: dur16 * (s.pad ? 3.5 : 0.9), vol: s.pad ? 0.06 : 0.085, type: 'sawtooth', lp: s.hard ? 900 : 600 }, musicBus);
    }
    if (i % s.arpEvery === 0) {
      const a = ARP[i];
      const n = a === 3 ? ch[0] + 12 : ch[a];
      tone({ at, f: midi(n + 24), dur: dur16 * 1.4, vol: s.pad ? 0.018 : 0.022, type: 'square', lp: s.pad ? 1800 : 2600 }, musicBus);
    }
    if (s.drums) {
      if (i % 4 === 0) tone({ at, f: 150, f2: 42, dur: 0.16, vol: 0.2 }, musicBus);
      if (i % 4 === 2) noise({ at, dur: 0.04, freq: 8000, filter: 'highpass', q: 0.7, vol: 0.05 }, musicBus);
      if (s.hard && (i === 4 || i === 12)) noise({ at, dur: 0.14, freq: 1800, q: 0.6, vol: 0.12 }, musicBus);
    }
  }

  function tick() {
    if (!ctx || !song) return;
    if (nextAt < ctx.currentTime - 0.2) nextAt = ctx.currentTime + 0.05;
    while (nextAt < ctx.currentTime + 0.12) {
      scheduleStep(song, nextAt);
      nextAt += 60 / song.bpm / 4;
      step++;
    }
  }

  function playSong(name) {
    songName = name;
    if (!ctx) return;
    const want = musicOn && name ? SONGS[name] : null;
    if (want === song) return;
    const t = ctx.currentTime;
    musicBus.gain.cancelScheduledValues(t);
    musicBus.gain.setValueAtTime(musicBus.gain.value, t);
    if (!want) {
      musicBus.gain.linearRampToValueAtTime(0, t + 0.3);
      song = null;
      clearInterval(timer);
      timer = null;
      return;
    }
    musicBus.gain.linearRampToValueAtTime(0.9, t + 0.6);
    const fresh = !song;
    song = want;
    if (fresh) {
      step = 0;
      nextAt = t + 0.05;
    } else {
      step = Math.ceil(step / 16) * 16; // change songs on a bar line
    }
    if (!timer) timer = setInterval(tick, 25);
  }

  SF.audio = {
    unlock() {
      if (ensure() && songName && !song) playSong(songName);
    },
    play(name) {
      if (!soundOn || !ctx || ctx.state !== 'running' || !sfx[name]) return;
      const now = ctx.currentTime;
      if (GAP[name] && now - (last[name] || 0) < GAP[name]) return;
      last[name] = now;
      try { sfx[name](); } catch (e) { /* audio is optional */ }
    },
    hum(on) {
      try { setHum(on); } catch (e) { hum = null; }
    },
    music(name) {
      playSong(name);
    },
    setSound(on) {
      soundOn = !!on;
      if (sfxBus) sfxBus.gain.value = soundOn ? 0.9 : 0;
      if (!soundOn) setHum(false);
    },
    setMusic(on) {
      musicOn = !!on;
      playSong(songName);
    },
    suspend(off) {
      if (!ctx) return;
      if (off) {
        setHum(false);
        ctx.suspend().catch(() => {});
      } else {
        ctx.resume().catch(() => {});
      }
    },
  };
})(window.SF = window.SF || {});
