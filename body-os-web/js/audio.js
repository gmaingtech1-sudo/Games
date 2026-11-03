// BODY.OS — procedural sci-fi audio (WebAudio). Every sound is synthesised, so there
// are no audio files to go missing. A slow evolving drone plays as music.
import { G } from './core.js';

let ctx = null, master = null, sfxBus = null, musicBus = null, drone = null, wantMusic = null;
const last = {};

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain(); master.connect(ctx.destination);
  sfxBus = ctx.createGain(); sfxBus.connect(master);
  musicBus = ctx.createGain(); musicBus.connect(master);
  applyVolumes();
  return ctx;
}

// The AudioContext is only created on the first touch (browsers and WebViews require a gesture).
export function unlockAudio() {
  const c = ensure();
  if (!c) return;
  const go = () => { if (wantMusic !== null && !drone) startMusic(wantMusic); };
  if (c.state === 'suspended') c.resume().then(go).catch(() => {}); else go();
}
export function suspendAudio() { if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {}); }
export function resumeAudio() { if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}); }

export function applyVolumes() {
  if (!ctx || !G.settings) return;
  master.gain.value = G.settings.master;
  sfxBus.gain.value = G.settings.sfx;
  musicBus.gain.value = G.settings.music * 0.35;
}

function tone(type, f0, f1, dur, vol, delay = 0) {
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(sfxBus);
  o.start(t); o.stop(t + dur + 0.05);
}

let noiseBuf = null;
function noise(dur, vol, cutoff = 1800, delay = 0) {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; f.type = 'lowpass'; f.frequency.value = cutoff;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(sfxBus);
  s.start(t); s.stop(t + dur + 0.05);
}

const chord = (notes, step, type, vol, dur) => notes.forEach((n, i) => tone(type, n, n, dur, vol, i * step));

const SOUNDS = {
  click: () => tone('sine', 1400, 1800, 0.05, 0.12),
  back: () => tone('sine', 1100, 700, 0.07, 0.12),
  osOpen: () => chord([440, 660, 880], 0.06, 'triangle', 0.12, 0.35),
  osClose: () => chord([880, 660, 440], 0.05, 'triangle', 0.1, 0.25),
  confirm: () => chord([660, 990], 0.07, 'sine', 0.12, 0.2),
  denied: () => tone('square', 220, 160, 0.2, 0.06),
  upgrade: () => chord([523, 659, 784, 1047], 0.1, 'triangle', 0.14, 0.6),
  levelUp: () => chord([392, 523, 659, 784, 1047], 0.08, 'square', 0.06, 0.5),
  scan: () => tone('sine', 300, 2400, 0.5, 0.1),
  scanDone: () => chord([1200, 1600], 0.08, 'sine', 0.12, 0.25),
  vision: () => tone('triangle', 500, 1500, 0.25, 0.1),
  lowEnergy: () => chord([440, 330, 440, 330], 0.14, 'square', 0.05, 0.13),
  hazard: () => chord([880, 660, 880, 660], 0.16, 'sawtooth', 0.04, 0.15),
  objective: () => chord([784, 1175], 0.12, 'triangle', 0.14, 0.4),
  mission: () => chord([392, 494, 587, 784, 988], 0.15, 'triangle', 0.14, 1.0),
  reality: () => { tone('sawtooth', 80, 900, 1.0, 0.08); tone('sine', 83, 450, 1.0, 0.1); },
  jump: () => tone('triangle', 300, 600, 0.12, 0.07),
  land: () => noise(0.1, 0.12, 600),
  pickup: () => chord([988, 1319, 1568], 0.05, 'sine', 0.12, 0.25),
  door: () => { noise(0.6, 0.12, 400); tone('sine', 120, 60, 0.6, 0.1); },
  damage: () => { noise(0.25, 0.3, 2500); tone('square', 160, 60, 0.2, 0.06); },
  recharge: () => tone('sawtooth', 200, 1200, 1.0, 0.06),
  calibrate: () => tone('square', 2000, 2000, 0.04, 0.06),
  success: () => chord([659, 880, 1319], 0.08, 'triangle', 0.14, 0.5),
  transmission: () => noise(1.2, 0.08, 3000),
  discovery: () => chord([523, 784, 1047], 0.12, 'sine', 0.12, 0.6),
  memory: () => chord([330, 415, 494, 659], 0.2, 'sine', 0.1, 1.0),
  threat: () => chord([196, 185, 196], 0.15, 'sawtooth', 0.06, 0.2),
  interference: () => noise(0.3, 0.15, 5000),
  step: () => noise(0.05, 0.05, 900),
};

export function sfx(name) {
  if (!ctx || ctx.state !== 'running') return;
  const now = performance.now();
  if (last[name] && now - last[name] < 50) return;
  last[name] = now;
  const fn = SOUNDS[name];
  if (fn) try { fn(); } catch (e) { /* audio is optional */ }
}

export function startMusic(menu) {
  wantMusic = menu;
  stopMusic();
  if (!ctx || ctx.state !== 'running') return;
  const base = menu ? 55 : 41.2;
  const nodes = [];
  const lfo = ctx.createOscillator(), lfoGain = ctx.createGain();
  lfo.frequency.value = 0.07; lfoGain.gain.value = 0.25; lfo.connect(lfoGain);
  [[1, 0.35], [1.5, 0.18], [2, 0.16], [3, 0.07], [4.02, 0.04]].forEach(([m, a], i) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = base * m;
    g.gain.value = a * 0.5;
    if (i === 2) lfoGain.connect(g.gain);
    o.connect(g); g.connect(musicBus); o.start();
    nodes.push(o);
  });
  lfo.start(); nodes.push(lfo);
  drone = nodes;
}
export function stopMusic() {
  if (drone) for (const n of drone) try { n.stop(); } catch (e) { /* ignore */ }
  drone = null;
}
