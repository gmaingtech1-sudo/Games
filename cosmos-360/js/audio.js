// Synthesised sound: a low ambient drone, engine rumble, and UI blips.
// (Space is silent, of course. This is the ship's hum.)
export class Sound {
  constructor() {
    this.ctx = null;
    this.on = true;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = this.on ? 0.55 : 0;
    this.master.connect(ctx.destination);

    // Brown noise buffer shared by the drone and the engine.
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }

    // Ambient pad
    const pad = ctx.createGain(); pad.gain.value = 0.0; pad.connect(this.master);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.connect(pad);
    for (const [f, t] of [[55, 'sine'], [82.4, 'sine'], [110.3, 'triangle'], [164.8, 'sine']]) {
      const o = ctx.createOscillator(); o.type = t; o.frequency.value = f;
      const g = ctx.createGain(); g.gain.value = t === 'triangle' ? 0.05 : 0.08;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.05 + Math.random() * 0.08;
      const lg = ctx.createGain(); lg.gain.value = 0.04;
      lfo.connect(lg); lg.connect(g.gain); lfo.start();
      o.connect(g); g.connect(lp); o.start();
    }
    pad.gain.setTargetAtTime(0.5, ctx.currentTime, 3);
    const hiss = ctx.createBufferSource(); hiss.buffer = buf; hiss.loop = true;
    const hf = ctx.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 180;
    const hg = ctx.createGain(); hg.gain.value = 0.05;
    hiss.connect(hf); hf.connect(hg); hg.connect(this.master); hiss.start();

    // Engine
    const eng = ctx.createBufferSource(); eng.buffer = buf; eng.loop = true;
    this.engF = ctx.createBiquadFilter(); this.engF.type = 'bandpass'; this.engF.frequency.value = 90; this.engF.Q.value = 0.8;
    this.engG = ctx.createGain(); this.engG.gain.value = 0;
    eng.connect(this.engF); this.engF.connect(this.engG); this.engG.connect(this.master); eng.start();
    this.whine = ctx.createOscillator(); this.whine.type = 'sawtooth'; this.whine.frequency.value = 60;
    const wf = ctx.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 300;
    this.whineG = ctx.createGain(); this.whineG.gain.value = 0;
    this.whine.connect(wf); wf.connect(this.whineG); this.whineG.connect(this.master); this.whine.start();
  }

  setEnabled(on) {
    this.on = on;
    if (this.master) this.master.gain.setTargetAtTime(on ? 0.55 : 0, this.ctx.currentTime, 0.2);
  }

  // level 0..1 throttle, warp 0..1 hyperspeed
  engine(level, warp) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.engG.gain.setTargetAtTime(0.03 + level * 0.25 + warp * 0.25, t, 0.2);
    this.engF.frequency.setTargetAtTime(70 + level * 140 + warp * 500, t, 0.3);
    this.whineG.gain.setTargetAtTime(warp * 0.06, t, 0.3);
    this.whine.frequency.setTargetAtTime(50 + warp * 180, t, 0.4);
  }

  blip(kind) {
    if (!this.ctx || !this.on) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const tone = (f, start, dur, type = 'sine', vol = 0.12, f2) => {
      const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t + start);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + start + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t + start);
      g.gain.linearRampToValueAtTime(vol, t + start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + start + dur);
      o.connect(g); g.connect(this.master); o.start(t + start); o.stop(t + start + dur + 0.05);
    };
    if (kind === 'tap') tone(880, 0, 0.08, 'sine', 0.05);
    else if (kind === 'select') { tone(660, 0, 0.1, 'sine', 0.07); tone(990, 0.06, 0.12, 'sine', 0.06); }
    else if (kind === 'scan') { for (let i = 0; i < 4; i++) tone(520 + i * 180, i * 0.12, 0.1, 'triangle', 0.06); }
    else if (kind === 'discover') { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.5, 'sine', 0.08)); }
    else if (kind === 'warp') tone(90, 0, 1.6, 'sawtooth', 0.07, 900);
    else if (kind === 'arrive') tone(700, 0, 0.6, 'sine', 0.07, 350);
    else if (kind === 'jump') { tone(60, 0, 2.5, 'sawtooth', 0.09, 1600); tone(120, 0.2, 2.2, 'square', 0.03, 2400); }
    else if (kind === 'error') tone(200, 0, 0.18, 'square', 0.05, 150);
  }
}
