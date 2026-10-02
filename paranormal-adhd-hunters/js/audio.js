/* ParanormalADHDhunters — every sound is synthesised with WebAudio: footsteps,
   creaks, slams, giggles, the music box, the spirit box and the ambience.
   Sounds in the world are positioned in 3D and muffled through walls. */
import { host } from './host.js';

const MUSIC_BOX = [76, 81, 83, 84, 83, 81, 76, 77, 81, 84, 83, 80, 76, 74, 76, 81];

export class Audio {
  constructor() {
    this.ctx = null;
    this.ok = false;
    this.vol = { master: 0.9, sfx: 1, amb: 0.8 };
    this.loops = new Set();
    this.listener = { x: 0, y: 0, z: 0 };
    this.occluder = null; // (pos) => boolean, true when a wall is in the way
    this.speechOK = typeof window !== 'undefined' && 'speechSynthesis' in window;
    this.voiceOn = true;
  }

  /** Must run inside a user gesture the first time. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { this.ctx = new AC(); } catch (e) { return; }
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = this.vol.master;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp).connect(c.destination);
    this.sfx = c.createGain(); this.sfx.gain.value = this.vol.sfx; this.sfx.connect(this.master);
    this.amb = c.createGain(); this.amb.gain.value = this.vol.amb; this.amb.connect(this.master);
    this.reverb = c.createConvolver();
    this.reverb.buffer = this.impulse(2.4, 2.6);
    this.revGain = c.createGain(); this.revGain.gain.value = 0.55;
    this.reverb.connect(this.revGain).connect(this.sfx);
    this.noise = this.makeNoise(2, 'white');
    this.brown = this.makeNoise(4, 'brown');
    this.ok = true;
    if (c.state === 'suspended') c.resume().catch(() => {});
    // speech voices load lazily on some browsers
    if (this.speechOK) try { speechSynthesis.getVoices(); } catch (e) { /* ignore */ }
  }

  setVolumes(v) {
    Object.assign(this.vol, v);
    if (!this.ok) return;
    this.master.gain.value = this.vol.master;
    this.sfx.gain.value = this.vol.sfx;
    this.amb.gain.value = this.vol.amb;
  }

  get now() { return this.ctx ? this.ctx.currentTime : 0; }

  /** Silence everything while the game is in the background. */
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {}); }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); }

  makeNoise(sec, kind) {
    const c = this.ctx, n = Math.floor(c.sampleRate * sec);
    const b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    return b;
  }

  impulse(sec, decay) {
    const c = this.ctx, n = Math.floor(c.sampleRate * sec);
    const b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
    }
    return b;
  }

  setListener(pos, fwd, up = { x: 0, y: 1, z: 0 }) {
    this.listener = pos;
    if (!this.ok) return;
    const L = this.ctx.listener, t = this.now;
    if (L.positionX) {
      L.positionX.setTargetAtTime(pos.x, t, 0.02); L.positionY.setTargetAtTime(pos.y, t, 0.02); L.positionZ.setTargetAtTime(pos.z, t, 0.02);
      L.forwardX.setTargetAtTime(fwd.x, t, 0.02); L.forwardY.setTargetAtTime(fwd.y, t, 0.02); L.forwardZ.setTargetAtTime(fwd.z, t, 0.02);
      L.upX.value = up.x; L.upY.value = up.y; L.upZ.value = up.z;
    } else {
      L.setPosition(pos.x, pos.y, pos.z);
      L.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
    }
  }

  /** Output node for a sound: positioned (with wall muffling) or flat. */
  out(opts = {}) {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.value = opts.vol == null ? 1 : opts.vol;
    let head = g;
    if (opts.pos) {
      const p = c.createPanner();
      p.panningModel = 'equalpower';
      p.distanceModel = 'inverse';
      p.refDistance = opts.ref || 1.4;
      p.rolloffFactor = opts.roll || 1.3;
      p.maxDistance = 40;
      if (p.positionX) { p.positionX.value = opts.pos.x; p.positionY.value = opts.pos.y; p.positionZ.value = opts.pos.z; }
      else p.setPosition(opts.pos.x, opts.pos.y, opts.pos.z);
      g.connect(p);
      head = p;
      if (this.occluder && this.occluder(opts.pos)) {
        const lp = c.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 650;
        const og = c.createGain(); og.gain.value = 0.55;
        p.connect(lp).connect(og);
        head = og;
      }
    }
    head.connect(opts.bus || this.sfx);
    if (opts.wet !== 0) {
      const s = c.createGain();
      s.gain.value = opts.wet == null ? 0.35 : opts.wet;
      head.connect(s).connect(this.reverb);
    }
    return g;
  }

  env(param, t, a, peak, d, end = 0.0001) {
    param.setValueAtTime(0.0001, t);
    param.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    param.exponentialRampToValueAtTime(Math.max(end, 0.0001), t + a + d);
  }

  osc(type, freq, t, dur, dest, gainPeak = 0.3, attack = 0.005) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    const g = c.createGain();
    this.env(g.gain, t, attack, gainPeak, dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + attack + dur + 0.05);
    return o;
  }

  noiseBurst(t, dur, dest, { type = 'bandpass', freq = 1000, q = 1, peak = 0.4, attack = 0.003, brown = false, freqEnd } = {}) {
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = brown ? this.brown : this.noise;
    s.loop = true;
    const f = c.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = c.createGain();
    this.env(g.gain, t, attack, peak, dur);
    s.connect(f).connect(g).connect(dest);
    s.start(t, Math.random() * 1.5);
    s.stop(t + attack + dur + 0.05);
    return s;
  }

  /* ---------------------------------------------------------------- */
  /* One-shot sounds                                                   */
  /* ---------------------------------------------------------------- */

  play(name, opts = {}) {
    if (!this.ok) return;
    const fn = this['s_' + name];
    if (!fn) return;
    try { fn.call(this, this.now + (opts.delay || 0), opts); } catch (e) { /* never let sound break the game */ }
  }

  s_step(t, o) {
    const d = this.out({ ...o, wet: o.pos ? 0.2 : 0.15, vol: o.vol == null ? 0.5 : o.vol });
    const surf = o.surface || 'wood';
    if (surf === 'grass') this.noiseBurst(t, 0.12, d, { freq: 2200, q: 0.6, peak: 0.25 });
    else if (surf === 'carpet') this.noiseBurst(t, 0.08, d, { type: 'lowpass', freq: 420, peak: 0.5 });
    else if (surf === 'tile') { this.noiseBurst(t, 0.05, d, { type: 'highpass', freq: 1800, peak: 0.3 }); this.osc('sine', 110, t, 0.05, d, 0.2); }
    else if (surf === 'concrete') this.noiseBurst(t, 0.06, d, { freq: 1100, q: 0.8, peak: 0.45 });
    else {
      this.noiseBurst(t, 0.07, d, { freq: 650, q: 0.9, peak: 0.5 });
      this.osc('sine', 85, t, 0.08, d, 0.35);
      if (Math.random() < 0.12) this.s_creak(t + 0.02, { ...o, vol: 0.12, short: true });
    }
  }

  s_creak(t, o) {
    const c = this.ctx;
    const d = this.out({ ...o, vol: o.vol == null ? 0.35 : o.vol });
    const dur = o.short ? 0.35 : 0.7 + Math.random() * 0.6;
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    const base = 140 + Math.random() * 90;
    osc.frequency.setValueAtTime(base, t);
    osc.frequency.linearRampToValueAtTime(base * (0.75 + Math.random() * 0.6), t + dur);
    const lfo = c.createOscillator();
    lfo.frequency.value = 18 + Math.random() * 14;
    const lg = c.createGain(); lg.gain.value = base * 0.12;
    lfo.connect(lg).connect(osc.frequency);
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900 + Math.random() * 500; f.Q.value = 6;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.08);
    g.gain.setValueAtTime(0.5, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(f).connect(g).connect(d);
    osc.start(t); lfo.start(t);
    osc.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
  }

  s_slam(t, o) {
    const d = this.out({ ...o, vol: 1, wet: 0.6, ref: 2.5 });
    this.noiseBurst(t, 0.35, d, { type: 'lowpass', freq: 1400, peak: 0.9 });
    this.osc('sine', 62, t, 0.45, d, 0.9);
    this.osc('triangle', 120, t, 0.12, d, 0.4);
  }

  s_door(t, o) {
    this.s_creak(t, { ...o, vol: 0.25 });
    const d = this.out({ ...o, vol: 0.4 });
    this.noiseBurst(t, 0.04, d, { type: 'highpass', freq: 2500, peak: 0.3 });
  }

  s_locked(t, o) {
    const d = this.out({ ...o, vol: 0.5 });
    for (let i = 0; i < 3; i++) {
      this.noiseBurst(t + i * 0.09, 0.05, d, { freq: 1800, q: 2, peak: 0.4 });
      this.osc('square', 300, t + i * 0.09, 0.03, d, 0.05);
    }
  }

  s_click(t, o) {
    const d = this.out({ ...o, vol: 0.5, wet: 0.1 });
    this.noiseBurst(t, 0.02, d, { type: 'highpass', freq: 3000, peak: 0.6 });
    this.osc('sine', 1800, t, 0.015, d, 0.15);
  }

  s_buzz(t, o) {
    const d = this.out({ ...o, vol: 0.22, wet: 0.1 });
    const c = this.ctx;
    const osc = c.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 100;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 3;
    const g = c.createGain();
    const dur = o.dur || 1.2;
    g.gain.setValueAtTime(0.0001, t);
    for (let i = 0; i < dur * 12; i++) g.gain.setValueAtTime(Math.random() < 0.5 ? 0.3 : 0.02, t + i / 12);
    g.gain.setValueAtTime(0.0001, t + dur);
    osc.connect(f).connect(g).connect(d);
    osc.start(t); osc.stop(t + dur + 0.05);
  }

  s_whoosh(t, o) {
    const d = this.out({ ...o, vol: 0.5 });
    this.noiseBurst(t, 0.35, d, { freq: 300, freqEnd: 1600, q: 1.5, peak: 0.6, attack: 0.05 });
  }

  s_land(t, o) {
    const d = this.out({ ...o, vol: Math.min(1, 0.35 + (o.hard || 0) * 0.2) });
    const k = o.kind || 'book';
    if (k === 'plate' || k === 'cup' || k === 'vase' || k === 'bottle' || k === 'jar' || k === 'frame') {
      for (let i = 0; i < 5; i++) this.osc('sine', 1800 + Math.random() * 2600, t + i * 0.025 + Math.random() * 0.02, 0.18, d, 0.12);
      this.noiseBurst(t, 0.12, d, { type: 'highpass', freq: 2600, peak: 0.4 });
    } else if (k === 'pan') {
      this.osc('triangle', 520, t, 0.6, d, 0.3); this.osc('triangle', 1310, t, 0.4, d, 0.15);
    } else if (k === 'ball' || k === 'teddy') {
      this.osc('sine', 160, t, 0.1, d, 0.35);
    } else {
      this.noiseBurst(t, 0.08, d, { type: 'lowpass', freq: 900, peak: 0.6 });
      this.osc('sine', 110, t, 0.12, d, 0.5);
    }
  }

  s_knock(t, o) {
    const d = this.out({ ...o, vol: 0.9, wet: 0.5 });
    const n = o.n || 3;
    for (let i = 0; i < n; i++) {
      const tt = t + i * (0.22 + Math.random() * 0.05);
      this.noiseBurst(tt, 0.06, d, { type: 'lowpass', freq: 700, peak: 0.8 });
      this.osc('sine', 95, tt, 0.1, d, 0.7);
    }
  }

  s_giggle(t, o) {
    const c = this.ctx;
    const d = this.out({ ...o, vol: 0.55, wet: 0.7 });
    const n = 5 + Math.floor(Math.random() * 3);
    const base = 480 + Math.random() * 120;
    for (let i = 0; i < n; i++) {
      const tt = t + i * 0.11;
      const osc = c.createOscillator();
      osc.type = 'sawtooth';
      const f0 = base * (1.05 - i * 0.03);
      osc.frequency.setValueAtTime(f0 * 1.15, tt);
      osc.frequency.exponentialRampToValueAtTime(f0 * 0.85, tt + 0.08);
      const f1 = c.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 700; f1.Q.value = 5;
      const f2 = c.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 2300; f2.Q.value = 7;
      const g = c.createGain();
      this.env(g.gain, tt, 0.01, 0.6, 0.075);
      osc.connect(f1).connect(g);
      osc.connect(f2).connect(g);
      g.connect(d);
      osc.start(tt); osc.stop(tt + 0.12);
      this.noiseBurst(tt, 0.05, d, { freq: 3000, q: 2, peak: 0.08 });
    }
  }

  s_hum(t, o) {
    const c = this.ctx;
    const d = this.out({ ...o, vol: 0.3, wet: 0.8 });
    const notes = MUSIC_BOX.slice(0, 6);
    notes.forEach((m, i) => {
      const tt = t + i * 0.45;
      const f = 440 * Math.pow(2, (m - 12 - 69) / 12);
      const osc = c.createOscillator(); osc.type = 'triangle'; osc.frequency.value = f;
      const vib = c.createOscillator(); vib.frequency.value = 5.5;
      const vg = c.createGain(); vg.gain.value = f * 0.012;
      vib.connect(vg).connect(osc.frequency);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, tt);
      g.gain.exponentialRampToValueAtTime(0.35, tt + 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.5);
      osc.connect(g).connect(d);
      osc.start(tt); vib.start(tt); osc.stop(tt + 0.55); vib.stop(tt + 0.55);
    });
  }

  s_music(t, o) {
    const d = this.out({ ...o, vol: 0.45, wet: 0.6 });
    const len = o.short ? 8 : MUSIC_BOX.length;
    for (let i = 0; i < len; i++) {
      const m = MUSIC_BOX[i];
      const tt = t + i * 0.32 + (i > len - 4 ? (i - len + 4) * 0.12 : 0); // winds down at the end
      const f = 440 * Math.pow(2, (m - 69) / 12);
      this.osc('sine', f, tt, 1.1, d, 0.3, 0.003);
      this.osc('triangle', f * 2.01, tt, 0.5, d, 0.08, 0.003);
    }
  }

  s_toy(t, o) {
    const c = this.ctx;
    const d = this.out({ ...o, vol: 0.5, wet: 0.4 });
    for (let i = 0; i < 2; i++) {
      const tt = t + i * 0.25;
      const osc = c.createOscillator(); osc.type = 'square';
      osc.frequency.setValueAtTime(900, tt);
      osc.frequency.exponentialRampToValueAtTime(1500, tt + 0.12);
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 4;
      const g = c.createGain(); this.env(g.gain, tt, 0.01, 0.3, 0.14);
      osc.connect(f).connect(g).connect(d);
      osc.start(tt); osc.stop(tt + 0.2);
    }
  }

  s_run(t, o) {
    for (let i = 0; i < 9; i++) this.s_step(t + i * 0.16, { ...o, vol: 0.45, surface: o.surface || 'wood' });
    if (Math.random() < 0.5) this.s_giggle(t + 1.1, o);
  }

  s_steps(t, o) {
    for (let i = 0; i < 3; i++) this.s_step(t + i * 0.7, { ...o, vol: 0.55, surface: o.surface || 'wood' });
  }

  s_whisper(t, o) {
    const c = this.ctx;
    const d = this.out({ ...o, vol: 0.5, wet: 0.7 });
    const dur = 1.6 + Math.random();
    const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 8;
    const f2 = c.createBiquadFilter(); f2.type = 'bandpass'; f2.Q.value = 6;
    for (let i = 0; i < dur * 8; i++) {
      f.frequency.setValueAtTime(900 + Math.random() * 1600, t + i / 8);
      f2.frequency.setValueAtTime(2200 + Math.random() * 1800, t + i / 8);
    }
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    for (let i = 0; i < dur * 6; i++) g.gain.linearRampToValueAtTime(Math.random() < 0.7 ? 0.5 : 0.05, t + i / 6 + 0.08);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g); s.connect(f2).connect(g);
    g.connect(d);
    s.start(t); s.stop(t + dur + 0.1);
  }

  s_breath(t, o) {
    const d = this.out({ vol: 0.25, wet: 0.1 });
    this.noiseBurst(t, 0.6, d, { freq: 900, q: 0.7, peak: 0.25, attack: 0.25 });
    this.noiseBurst(t + 0.9, 0.8, d, { freq: 700, q: 0.7, peak: 0.2, attack: 0.1 });
  }

  s_emf(t, o) {
    const d = this.out({ vol: 0.18, wet: 0 });
    const lvl = o.level || 1;
    this.osc('square', 620 + lvl * 160, t, 0.05, d, 0.5);
  }

  s_beep(t, o) {
    const d = this.out({ vol: 0.15, wet: 0 });
    this.osc('sine', o.freq || 1800, t, 0.06, d, 0.5);
  }

  s_shutter(t) {
    const d = this.out({ vol: 0.6, wet: 0.1 });
    this.noiseBurst(t, 0.03, d, { type: 'highpass', freq: 2000, peak: 0.7 });
    this.noiseBurst(t + 0.07, 0.04, d, { type: 'highpass', freq: 1500, peak: 0.5 });
    const c = this.ctx;
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(2200, t + 0.1); o.frequency.exponentialRampToValueAtTime(6200, t + 0.8);
    const g = c.createGain(); this.env(g.gain, t + 0.1, 0.05, 0.04, 0.7);
    o.connect(g).connect(d); o.start(t + 0.1); o.stop(t + 0.9);
  }

  s_radio(t) {
    const d = this.out({ vol: 0.25, wet: 0 });
    this.osc('square', 1250, t, 0.05, d, 0.3);
    this.osc('square', 1650, t + 0.08, 0.05, d, 0.3);
    this.noiseBurst(t + 0.14, 0.18, d, { freq: 2500, q: 0.6, peak: 0.12 });
  }

  s_evidence(t) {
    const d = this.out({ vol: 0.45, wet: 0.5 });
    [72, 76, 79, 84].forEach((m, i) => this.osc('sine', 440 * Math.pow(2, (m - 69) / 12), t + i * 0.08, 0.9, d, 0.25));
    [96, 100].forEach((m, i) => this.osc('triangle', 440 * Math.pow(2, (m - 69) / 12), t + 0.3 + i * 0.06, 0.4, d, 0.05));
  }

  s_page(t) {
    const d = this.out({ vol: 0.4, wet: 0.2 });
    this.noiseBurst(t, 0.18, d, { freq: 3500, q: 0.5, peak: 0.3, attack: 0.04 });
    [67, 71, 74].forEach((m, i) => this.osc('sine', 440 * Math.pow(2, (m - 69) / 12), t + 0.1 + i * 0.1, 0.7, d, 0.15));
  }

  s_ui(t) {
    const d = this.out({ vol: 0.18, wet: 0 });
    this.osc('sine', 900, t, 0.05, d, 0.4);
  }

  s_confirm(t) {
    const d = this.out({ vol: 0.22, wet: 0.2 });
    this.osc('sine', 660, t, 0.1, d, 0.4);
    this.osc('sine', 990, t + 0.08, 0.16, d, 0.4);
  }

  s_coin(t) {
    const d = this.out({ vol: 0.2, wet: 0.2 });
    this.osc('square', 1320, t, 0.06, d, 0.25);
    this.osc('square', 1760, t + 0.06, 0.12, d, 0.25);
  }

  s_level(t) {
    const d = this.out({ vol: 0.4, wet: 0.5 });
    [60, 64, 67, 72, 76, 79, 84].forEach((m, i) => this.osc('triangle', 440 * Math.pow(2, (m - 69) / 12), t + i * 0.07, 0.6, d, 0.2));
  }

  s_sting(t) {
    // a jolt when something shows itself
    const d = this.out({ vol: 0.55, wet: 0.7 });
    [48, 49, 55, 61].forEach((m) => this.osc('sawtooth', 440 * Math.pow(2, (m - 69) / 12), t, 1.4, d, 0.12, 0.02));
    this.noiseBurst(t, 0.6, d, { freq: 3000, freqEnd: 600, q: 0.8, peak: 0.25, attack: 0.02 });
  }

  s_spook(t) {
    const d = this.out({ vol: 0.85, wet: 0.8 });
    [40, 41, 47, 52, 53].forEach((m) => this.osc('sawtooth', 440 * Math.pow(2, (m - 69) / 12), t, 2.2, d, 0.16, 0.01));
    this.noiseBurst(t, 1.2, d, { freq: 4000, freqEnd: 300, q: 0.6, peak: 0.6, attack: 0.01 });
    this.osc('sine', 45, t, 1.5, d, 0.8);
  }

  s_surge(t) {
    const d = this.out({ vol: 0.6, wet: 0.6 });
    const c = this.ctx;
    const o = c.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(30, t); o.frequency.exponentialRampToValueAtTime(90, t + 2.5);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(200, t); f.frequency.exponentialRampToValueAtTime(1600, t + 2.5);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.6, t + 2.3); g.gain.exponentialRampToValueAtTime(0.0001, t + 3);
    o.connect(f).connect(g).connect(d);
    o.start(t); o.stop(t + 3.1);
    this.noiseBurst(t, 2.8, d, { freq: 400, freqEnd: 3000, q: 0.7, peak: 0.35, attack: 2.2 });
  }

  s_answer(t, o) {
    const d = this.out({ vol: 0.6, wet: 0.5 });
    this.noiseBurst(t, 0.9, d, { freq: 1600, q: 1.2, peak: 0.35 });
    const c = this.ctx;
    // a formant smear under the words, in case speech synthesis is unavailable
    const osc = c.createOscillator(); osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(o.pitch || 95, t);
    osc.frequency.linearRampToValueAtTime((o.pitch || 95) * 0.8, t + 0.8);
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(600, t); f.frequency.linearRampToValueAtTime(1100, t + 0.4); f.frequency.linearRampToValueAtTime(500, t + 0.8); f.Q.value = 6;
    const g = c.createGain(); this.env(g.gain, t, 0.05, 0.5, 0.8);
    osc.connect(f).connect(g).connect(d);
    osc.start(t); osc.stop(t + 1);
  }

  s_owl(t, o) {
    const d = this.out({ ...o, vol: 0.25, wet: 0.6, bus: this.amb });
    const c = this.ctx;
    for (const [dt, len] of [[0, 0.35], [0.55, 0.2], [0.8, 0.5]]) {
      const osc = c.createOscillator(); osc.type = 'sine';
      osc.frequency.setValueAtTime(420, t + dt); osc.frequency.linearRampToValueAtTime(380, t + dt + len);
      const g = c.createGain(); this.env(g.gain, t + dt, 0.06, 0.4, len);
      osc.connect(g).connect(d); osc.start(t + dt); osc.stop(t + dt + len + 0.1);
    }
  }

  s_tick(t, o) {
    const d = this.out({ ...o, vol: 0.14, wet: 0.2, ref: 1 });
    this.noiseBurst(t, 0.015, d, { freq: o.tock ? 1800 : 2600, q: 5, peak: 0.7 });
  }

  speak(text, opts = {}) {
    if (!this.voiceOn) return;
    const words = text.toLowerCase().replace(/[^a-z' ?]/g, ' ');
    const pitch = opts.pitch == null ? 0.1 : opts.pitch;
    const rate = opts.rate || 0.62;
    if (host.speak(words, pitch, rate)) return; // the Android app speaks with the phone's own voice
    if (!this.speechOK) return;
    try {
      const u = new SpeechSynthesisUtterance(words);
      u.pitch = pitch;
      u.rate = rate;
      u.volume = 0.9;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch (e) { /* ignore */ }
  }

  /* ---------------------------------------------------------------- */
  /* Loops                                                             */
  /* ---------------------------------------------------------------- */

  /** Wind, a low drone and the house settling. inside: 0..1 */
  startAmbience() {
    if (!this.ok || this.ambNodes) return;
    const c = this.ctx;
    const wind = c.createBufferSource(); wind.buffer = this.brown; wind.loop = true;
    const wf = c.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 500;
    const wg = c.createGain(); wg.gain.value = 0.25;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.07;
    const lg = c.createGain(); lg.gain.value = 0.15;
    lfo.connect(lg).connect(wg.gain);
    wind.connect(wf).connect(wg).connect(this.amb);
    wind.start(); lfo.start();
    const drone = c.createGain(); drone.gain.value = 0.0;
    for (const f of [55, 55.4, 82.4, 110.3]) {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = c.createGain(); g.gain.value = 0.05;
      o.connect(g).connect(drone); o.start();
    }
    drone.connect(this.amb);
    this.ambNodes = { wind, wf, wg, drone };
  }

  setAmbience({ inside = 0, tension = 0 } = {}) {
    if (!this.ambNodes) return;
    const t = this.now;
    this.ambNodes.wf.frequency.setTargetAtTime(inside ? 260 : 600, t, 0.5);
    this.ambNodes.wg.gain.setTargetAtTime(inside ? 0.12 : 0.28, t, 0.5);
    this.ambNodes.drone.gain.setTargetAtTime(0.25 + tension * 0.9, t, 1.5);
  }

  /** Continuous spirit box static. Returns {set(level), stop()}. */
  staticLoop() {
    if (!this.ok) return { set() {}, stop() {} };
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 1.5;
    const g = c.createGain(); g.gain.value = 0;
    s.connect(f).connect(g).connect(this.sfx);
    s.start();
    let alive = true;
    const sweep = setInterval(() => {
      if (!alive) return;
      const t = this.now;
      f.frequency.setValueAtTime(700 + Math.random() * 2600, t);
    }, 90);
    return {
      set: (v) => { if (alive) g.gain.setTargetAtTime(v * 0.16, this.now, 0.05); },
      stop: () => { alive = false; clearInterval(sweep); try { g.gain.setTargetAtTime(0, this.now, 0.05); s.stop(this.now + 0.3); } catch (e) { /* ignore */ } },
    };
  }

  /** Heartbeat that speeds up with fear. Returns {set(rate 0..1), stop()}. */
  heartbeat() {
    if (!this.ok) return { set() {}, stop() {} };
    let rate = 0, alive = true, next = this.now;
    const tick = () => {
      if (!alive) return;
      const t = this.now;
      if (rate > 0.05 && t >= next - 0.05) {
        const d = this.out({ vol: 0.3 + rate * 0.5, wet: 0 });
        this.osc('sine', 58, next, 0.12, d, 0.9);
        this.osc('sine', 52, next + 0.22, 0.15, d, 0.7);
        next += 1.05 - rate * 0.5;
      } else if (rate <= 0.05) next = t + 0.2;
      this.hbTimer = setTimeout(tick, 60);
    };
    tick();
    return { set: (r) => { rate = r; }, stop: () => { alive = false; clearTimeout(this.hbTimer); } };
  }

  /** Gentle menu music: slow chords and the music box tune. */
  startMenuMusic() {
    if (!this.ok || this.menuTimer) return;
    const chords = [[57, 60, 64], [53, 57, 60], [50, 53, 57], [52, 56, 59]];
    let i = 0;
    const bus = this.ctx.createGain(); bus.gain.value = 0.5; bus.connect(this.amb);
    this.menuBus = bus;
    const step = () => {
      const t = this.now + 0.05;
      const ch = chords[i % chords.length];
      ch.forEach((m) => {
        const o = this.ctx.createOscillator(); o.type = 'triangle';
        o.frequency.value = 440 * Math.pow(2, (m - 12 - 69) / 12);
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06, t + 1.5); g.gain.exponentialRampToValueAtTime(0.0001, t + 5.8);
        o.connect(g).connect(bus); o.start(t); o.stop(t + 6);
      });
      if (i % 4 === 1) {
        const d = this.ctx.createGain(); d.gain.value = 0.5; d.connect(bus);
        const wet = this.ctx.createGain(); wet.gain.value = 0.5; d.connect(wet).connect(this.reverb);
        for (let k = 0; k < 8; k++) this.osc('sine', 440 * Math.pow(2, (MUSIC_BOX[k] - 69) / 12), t + 0.6 + k * 0.4, 1.2, d, 0.12);
      }
      i++;
    };
    step();
    this.menuTimer = setInterval(step, 6000);
  }

  stopMenuMusic() {
    clearInterval(this.menuTimer);
    this.menuTimer = null;
    if (this.menuBus) { const b = this.menuBus; b.gain.setTargetAtTime(0, this.now, 0.4); setTimeout(() => b.disconnect(), 2000); this.menuBus = null; }
  }
}
