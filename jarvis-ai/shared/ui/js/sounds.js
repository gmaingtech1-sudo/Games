// Interface sounds, synthesised with Web Audio (no sound files). Short and quiet.

let ctx = null;
let enabled = true;

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function tone({ from, to, ms, type = 'sine', gain = 0.05, delay = 0 }) {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + delay / 1000;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t0);
  osc.frequency.exponentialRampToValueAtTime(to, t0 + ms / 1000);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + ms / 1000 + 0.02);
}

const SOUNDS = {
  listen: () => { tone({ from: 520, to: 880, ms: 110 }); tone({ from: 880, to: 1320, ms: 90, delay: 90, gain: 0.035 }); },
  listenEnd: () => tone({ from: 900, to: 480, ms: 120, gain: 0.04 }),
  send: () => tone({ from: 700, to: 1100, ms: 70, type: 'triangle', gain: 0.03 }),
  reply: () => { tone({ from: 1200, to: 1500, ms: 60, gain: 0.025 }); tone({ from: 1500, to: 1800, ms: 60, delay: 70, gain: 0.02 }); },
  error: () => { tone({ from: 300, to: 200, ms: 160, type: 'square', gain: 0.025 }); tone({ from: 220, to: 160, ms: 180, type: 'square', gain: 0.02, delay: 150 }); },
  boot: () => [440, 660, 990].forEach((f, i) => tone({ from: f, to: f * 1.5, ms: 140, delay: i * 110, gain: 0.03 })),
};

export const sounds = {
  setEnabled(v) { enabled = v; },
  play(name) {
    if (!enabled) return;
    try { SOUNDS[name]?.(); } catch { /* audio not available */ }
  },
};
