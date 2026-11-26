// Synthesised sound effects (Web Audio) and vibration.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const audio = { ctx: null, muted: false, noise: null };
export function ac() {
  if (!audio.ctx) {
    try { audio.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
    const len = audio.ctx.sampleRate;
    audio.noise = audio.ctx.createBuffer(1, len, audio.ctx.sampleRate);
    const d = audio.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  if (audio.ctx.state === 'suspended') audio.ctx.resume();
  return audio.ctx;
}
function noise(dur, freq, type, vol, delay, freqEnd) {
  const c = ac(); if (!c || audio.muted) return;
  const t = c.currentTime + (delay || 0);
  const src = c.createBufferSource(); src.buffer = audio.noise;
  const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t);
  if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  const gn = c.createGain(); gn.gain.setValueAtTime(vol, t); gn.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(gn); gn.connect(c.destination);
  src.start(t); src.stop(t + dur + 0.05);
}
function tone(f0, f1, dur, type, vol, delay) {
  const c = ac(); if (!c || audio.muted) return;
  const t = c.currentTime + (delay || 0);
  const o = c.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
  const gn = c.createGain(); gn.gain.setValueAtTime(vol, t); gn.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(gn); gn.connect(c.destination); o.start(t); o.stop(t + dur + 0.05);
}
export const SFX = {
  punch() { noise(0.18, 700, 'lowpass', 1); tone(170, 45, 0.18, 'sine', 0.9); },
  slap() { noise(0.12, 2200, 'highpass', 0.8); noise(0.06, 5000, 'highpass', 0.4); },
  gun() { noise(0.05, 7000, 'highpass', 0.8); noise(0.5, 2500, 'lowpass', 1, 0, 200); tone(140, 30, 0.35, 'sine', 1); },
  coffee() { noise(0.6, 1300, 'bandpass', 0.7, 0, 400); tone(900, 1300, 0.15, 'sine', 0.15, 0.1); },
  stapler() { tone(800, 220, 0.2, 'triangle', 0.6); tone(1600, 600, 0.12, 'sine', 0.3); },
  desk() { noise(0.9, 1500, 'lowpass', 1, 0, 150); tone(90, 35, 0.5, 'sawtooth', 0.35); noise(0.3, 3000, 'bandpass', 0.5, 0.25); },
  chair() { noise(0.4, 1800, 'lowpass', 1); tone(260, 80, 0.2, 'square', 0.25); noise(0.25, 4000, 'bandpass', 0.4, 0.1); },
  whoosh() { noise(0.25, 500, 'bandpass', 0.35, 0, 2500); },
  click() { tone(520, 520, 0.04, 'square', 0.12); },
  good() { tone(660, 660, 0.09, 'sine', 0.3); tone(990, 990, 0.14, 'sine', 0.3, 0.09); },
  bad() { tone(240, 150, 0.25, 'square', 0.15); },
  ko() { tone(1400, 140, 1.0, 'sine', 0.35); tone(300, 300, 0.08, 'square', 0.15, 1.05); tone(200, 200, 0.2, 'square', 0.15, 1.15); },
  ding() { tone(1320, 1320, 0.5, 'sine', 0.25); },
  cheer() { [523, 659, 784, 1046].forEach((f, i) => tone(f, f, 0.18, 'triangle', 0.25, i * 0.12)); },
  boo() { [392, 370, 349, 262].forEach((f, i) => tone(f, f * 0.98, 0.3, 'sawtooth', 0.12, i * 0.28)); },
};
export function buzz(ms) {
  try {
    if (window.AndroidHost && AndroidHost.vibrate) AndroidHost.vibrate(ms);
    else if (navigator.vibrate) navigator.vibrate(ms);
  } catch (e) { /* no vibration */ }
}

