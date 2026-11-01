// Original synthesized sound effects and ambient music using the Web Audio API.
// No audio files are needed. Every call is wrapped so audio problems can never
// break gameplay; the game is fully playable muted.

let ctx = null, master = null, sfxGain = null, musicGain = null;
let settings = { musicVolume: 0.4, sfxVolume: 0.7, muted: false };
let musicTimer = null, musicMood = null, step = 0;

function ensure() {
  if (ctx) return ctx;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    sfxGain = ctx.createGain();
    musicGain = ctx.createGain();
    sfxGain.connect(master);
    musicGain.connect(master);
    master.connect(ctx.destination);
    applyVolumes();
  } catch { ctx = null; }
  return ctx;
}

function applyVolumes() {
  if (!ctx) return;
  const m = settings.muted ? 0 : 1;
  master.gain.value = m;
  sfxGain.gain.value = settings.sfxVolume * 0.6;
  musicGain.gain.value = settings.musicVolume * 0.25;
}

export function configureAudio(s) {
  settings = { ...settings, ...s };
  try { applyVolumes(); } catch { /* ignore */ }
  if (settings.muted || settings.musicVolume <= 0) stopMusic(true);
  else if (musicMood && !musicTimer) playMusic(musicMood);
}

/** Call from a user gesture to unlock audio on mobile browsers. */
export function unlockAudio() {
  try {
    ensure();
    if (ctx && ctx.state === 'suspended') ctx.resume();
  } catch { /* ignore */ }
}

function tone({ type = 'sine', f = 440, f2 = null, t = 0.15, v = 0.5, delay = 0, dest = null }) {
  const c = ensure();
  if (!c) return;
  const now = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, now);
  if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), now + t);
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(v, now + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, now + t);
  o.connect(g);
  g.connect(dest || sfxGain);
  o.start(now);
  o.stop(now + t + 0.05);
}

function noise({ t = 0.2, v = 0.4, delay = 0, filter = 1200 }) {
  const c = ensure();
  if (!c) return;
  const now = c.currentTime + delay;
  const len = Math.floor(c.sampleRate * t);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = 'lowpass';
  bp.frequency.value = filter;
  const g = c.createGain();
  g.gain.value = v;
  src.connect(bp); bp.connect(g); g.connect(sfxGain);
  src.start(now);
}

const SFX = {
  click: () => tone({ type: 'triangle', f: 660, t: 0.05, v: 0.2 }),
  hit: () => { noise({ t: 0.12, v: 0.5, filter: 1800 }); tone({ type: 'square', f: 180, f2: 80, t: 0.1, v: 0.25 }); },
  crit: () => { noise({ t: 0.18, v: 0.6, filter: 3000 }); tone({ type: 'sawtooth', f: 400, f2: 120, t: 0.2, v: 0.3 }); tone({ type: 'triangle', f: 990, t: 0.12, v: 0.2, delay: 0.05 }); },
  hurt: () => { tone({ type: 'sawtooth', f: 220, f2: 70, t: 0.22, v: 0.35 }); noise({ t: 0.15, v: 0.3, filter: 700 }); },
  miss: () => tone({ type: 'sine', f: 900, f2: 300, t: 0.18, v: 0.15 }),
  spell: () => { tone({ type: 'sine', f: 300, f2: 1200, t: 0.3, v: 0.3 }); tone({ type: 'triangle', f: 600, f2: 1800, t: 0.25, v: 0.15, delay: 0.05 }); },
  fire: () => { noise({ t: 0.35, v: 0.5, filter: 900 }); tone({ type: 'sawtooth', f: 120, f2: 60, t: 0.3, v: 0.2 }); },
  ice: () => { tone({ type: 'triangle', f: 1600, f2: 2400, t: 0.2, v: 0.2 }); tone({ type: 'sine', f: 2200, t: 0.3, v: 0.12, delay: 0.08 }); },
  heal: () => [523, 659, 784].forEach((f, i) => tone({ type: 'sine', f, t: 0.3, v: 0.2, delay: i * 0.07 })),
  potion: () => { tone({ type: 'sine', f: 400, f2: 700, t: 0.12, v: 0.25 }); tone({ type: 'sine', f: 500, f2: 900, t: 0.12, v: 0.2, delay: 0.12 }); },
  buff: () => [392, 523, 659].forEach((f, i) => tone({ type: 'triangle', f, t: 0.18, v: 0.18, delay: i * 0.05 })),
  telegraph: () => { tone({ type: 'sawtooth', f: 90, f2: 160, t: 0.6, v: 0.3 }); tone({ type: 'square', f: 45, t: 0.6, v: 0.15 }); },
  levelup: () => [523, 659, 784, 1046, 1318].forEach((f, i) => tone({ type: 'triangle', f, t: 0.35, v: 0.25, delay: i * 0.09 })),
  loot: () => [880, 1175, 1568].forEach((f, i) => tone({ type: 'sine', f, t: 0.18, v: 0.2, delay: i * 0.06 })),
  rare: () => [659, 880, 1175, 1568, 2093].forEach((f, i) => tone({ type: 'triangle', f, t: 0.3, v: 0.22, delay: i * 0.07 })),
  buy: () => { tone({ type: 'square', f: 1200, t: 0.06, v: 0.12 }); tone({ type: 'square', f: 1600, t: 0.08, v: 0.12, delay: 0.07 }); },
  error: () => tone({ type: 'square', f: 140, t: 0.15, v: 0.2 }),
  boss: () => { tone({ type: 'sawtooth', f: 55, f2: 40, t: 1.4, v: 0.4 }); tone({ type: 'sawtooth', f: 82, f2: 60, t: 1.4, v: 0.25, delay: 0.1 }); noise({ t: 1, v: 0.25, filter: 300 }); },
  victory: () => [523, 659, 784, 659, 784, 1046].forEach((f, i) => tone({ type: 'triangle', f, t: 0.3, v: 0.25, delay: i * 0.12 })),
  defeat: () => [392, 349, 311, 262].forEach((f, i) => tone({ type: 'sine', f, t: 0.5, v: 0.25, delay: i * 0.25 })),
  phase: () => { tone({ type: 'sawtooth', f: 110, f2: 220, t: 0.5, v: 0.3 }); noise({ t: 0.4, v: 0.3, filter: 500 }); },
};

export function sfx(name) {
  if (settings.muted || settings.sfxVolume <= 0) return;
  try { if (SFX[name]) SFX[name](); } catch { /* audio must never break the game */ }
}

/* ---- Ambient music: a slow generative loop in a minor key ---- */
const MOODS = {
  menu: { root: 146.8, scale: [0, 3, 5, 7, 10, 12], tempo: 700 },
  town: { root: 164.8, scale: [0, 2, 3, 7, 8, 12], tempo: 620 },
  combat: { root: 110, scale: [0, 3, 5, 6, 7, 10], tempo: 300 },
  boss: { root: 98, scale: [0, 1, 3, 6, 7, 10], tempo: 240 },
};

export function playMusic(mood) {
  musicMood = mood;
  if (settings.muted || settings.musicVolume <= 0) return;
  try {
    if (!ensure()) return;
    stopMusic(true);
    const m = MOODS[mood] || MOODS.menu;
    step = 0;
    musicTimer = setInterval(() => {
      try {
        if (!ctx || ctx.state !== 'running') return;
        const s = m.scale;
        const note = m.root * Math.pow(2, s[(step * 3 + (step >> 2)) % s.length] / 12) * (step % 8 === 0 ? 0.5 : 1);
        tone({ type: 'triangle', f: note * 2, t: m.tempo / 600, v: 0.18, dest: musicGain });
        if (step % 4 === 0) tone({ type: 'sine', f: m.root / 2, t: (m.tempo * 4) / 1000, v: 0.3, dest: musicGain });
        step++;
      } catch { /* ignore */ }
    }, m.tempo);
  } catch { /* ignore */ }
}

/** Restart the last mood (e.g. when the Android app returns to the foreground). */
export function resumeMusic() {
  if (musicMood && !musicTimer) playMusic(musicMood);
}

export function stopMusic(keepMood = false) {
  if (musicTimer) clearInterval(musicTimer);
  musicTimer = null;
  if (!keepMood) musicMood = null;
}
