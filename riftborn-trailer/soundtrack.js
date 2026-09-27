// The trailer's soundtrack, synthesized from scratch in sync with the
// scenes in trailer.js: a dark drone, drums, rift whooshes, dinosaur roars,
// thunder, a capture chime, a riser and a final hit. render(seconds)
// returns a 16-bit stereo WAV file.
const RATE = 44100;

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// A biquad band-pass (resonant) filter.
function bandpass(freq, q) {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0, b0, b1, b2, a1, a2;
  const set = (f) => {
    const w = 2 * Math.PI * f / RATE, al = Math.sin(w) / (2 * q);
    const a0 = 1 + al;
    b0 = al / a0; b1 = 0; b2 = -al / a0; a1 = -2 * Math.cos(w) / a0; a2 = (1 - al) / a0;
  };
  set(freq);
  const f = (x) => { const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
  f.set = set;
  return f;
}

function lowpass(freq) {
  let y = 0;
  const k = 1 - Math.exp(-2 * Math.PI * freq / RATE);
  return (x) => (y += (x - y) * k);
}

function render(seconds) {
  const n = Math.round(seconds * RATE);
  const L = new Float32Array(n), R = new Float32Array(n);
  const add = (t0, dur, fn, pan = 0, gain = 1) => {
    const i0 = Math.max(0, Math.round(t0 * RATE)), i1 = Math.min(n, Math.round((t0 + dur) * RATE));
    for (let i = i0; i < i1; i++) {
      const v = fn((i - i0) / RATE, i / RATE) * gain;
      L[i] += v * (1 - pan) ; R[i] += v * (1 + pan);
    }
  };
  const noise = rng(7);

  // Drone: detuned saws through a slowly opening filter, chord changes by scene.
  const chords = [[0, 73.42], [10, 58.27], [20, 65.41], [26, 55.0], [31, 73.42]];
  for (const side of [-0.4, 0.4]) {
    const lp = { y: 0 };   // a low-pass whose cutoff moves
    const ph = [0, 0, 0];
    add(0, seconds, (t, T) => {
      const root = chords.filter((c) => T >= c[0]).pop()[1];
      const freqs = [root, root * 1.5 * (1 + side * 0.004), root * 2 * (1 - side * 0.003)];
      let s = 0;
      freqs.forEach((f, k) => { ph[k] = (ph[k] + f / RATE) % 1; s += (ph[k] * 2 - 1) * [0.5, 0.25, 0.2][k]; });
      const open = 250 + 900 * Math.min(1, T / 34) + 300 * Math.sin(T * 0.7);
      const env = Math.min(1, T / 3) * (T > 35.4 ? Math.max(0, 1 - (T - 35.4) * 2) : 1);
      return lpFilter(lp, s, open) * 0.16 * env;
    }, side);
  }
  function lpFilter(state, x, f) {
    state.y += (x - state.y) * (1 - Math.exp(-2 * Math.PI * f / RATE));
    return state.y;
  }

  // Drum hits: a pitched-down sine thump with a noise attack.
  const boom = (at, gain, pitch = 60, len = 1.2) => add(at, len, (t) => {
    const f = pitch * (1 + 2.5 * Math.exp(-t * 18));
    return (Math.sin(2 * Math.PI * f * t) * Math.exp(-t * (3.5 / len)) + (noise() * 2 - 1) * Math.exp(-t * 40) * 0.4) * gain;
  });
  // Big hits on the cuts.
  for (const at of [5, 10, 15, 20, 26, 31]) boom(at, 0.9, 52, 1.6);
  // A driving beat from the map scene on (120 bpm), stronger in the battle.
  for (let T = 10; T < 35.5; T += 0.5) {
    const strong = T >= 20 && T < 26;
    boom(T, strong ? 0.55 : 0.3, strong ? 70 : 80, 0.5);
    if (strong) boom(T + 0.25, 0.25, 90, 0.3);
    const hat = bandpass(8000, 1.2);
    add(T + 0.25, 0.08, (t) => hat(noise() * 2 - 1) * Math.exp(-t * 60) * 0.35, 0.3);
  }

  // Whooshes (a noise sweep).
  const whoosh = (at, dur, f0, f1, gain, pan = 0) => {
    const bp = bandpass(f0, 2.5);
    add(at, dur, (t) => { bp.set(f0 + (f1 - f0) * (t / dur)); return bp(noise() * 2 - 1) * Math.sin(Math.PI * t / dur) * gain; }, pan);
  };
  whoosh(0.3, 2.2, 200, 1800, 0.9);        // the Rift ignites
  whoosh(4.5, 1.4, 300, 900, 0.7);         // the tear opens
  whoosh(15.8, 1.4, 400, 2600, 0.6, 0.3);  // orb thrown
  whoosh(33.3, 2.2, 150, 5000, 0.8);       // riser into the logo
  for (const at of [21.33, 22.73, 24.13]) { whoosh(at - 0.3, 0.4, 600, 2400, 0.5); boom(at, 0.8, 45, 0.8); }

  // Roars: a growling saw with vibrato through resonant noise.
  const roar = (at, dur, base, gain) => {
    const bp1 = bandpass(base * 3, 3), bp2 = bandpass(base * 6, 4);
    let ph = 0;
    add(at, dur, (t) => {
      const env = Math.sin(Math.PI * Math.min(1, t / dur)) ** 0.6 * Math.min(1, t * 12);
      const f = base * (1 + 0.25 * Math.sin(t * 2.5) + 0.05 * Math.sin(t * 31));
      ph = (ph + f / RATE) % 1;
      const growl = (ph * 2 - 1) * (0.6 + 0.4 * Math.sin(t * 47));
      const breath = noise() * 2 - 1;
      return (bp1(growl + breath * 0.8) * 1.2 + bp2(breath) * 0.5 + growl * 0.15) * env * gain;
    });
  };
  roar(8.2, 1.5, 62, 1.1);
  roar(15.6, 1.0, 85, 0.6);
  roar(28.0, 1.7, 46, 1.4);
  roar(21.0, 0.6, 80, 0.4);
  roar(22.4, 0.6, 70, 0.4);

  // Thunder: a crack, then a long low rumble.
  for (const at of [27.2, 29.1]) {
    const lp = lowpass(180);
    add(at, 3, (t) => ((noise() * 2 - 1) * Math.exp(-t * 30) * 0.9 + lp(noise() * 2 - 1) * 3 * Math.exp(-t * 1.2) * (0.7 + 0.3 * Math.sin(t * 9))), 0, 0.8);
  }

  // Link zaps and the control field chord.
  for (const [k, at] of [10.9, 11.45, 12.0].entries()) {
    add(at, 0.35, (t) => Math.sin(2 * Math.PI * (880 + k * 220) * t * (1 + t)) * Math.exp(-t * 9) * 0.25, k - 1);
  }
  for (const f of [293.7, 369.99, 440, 587.3]) add(12.5, 2.2, (t) => Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 1.6) * 0.09 * Math.min(1, t * 20));

  // Capture: three clicks as the orb wobbles, then a bright chime.
  for (const at of [18.1, 18.55, 19.0]) add(at, 0.06, (t) => (noise() * 2 - 1) * Math.exp(-t * 90) * 0.5);
  [587.3, 739.99, 880, 1174.7].forEach((f, k) => add(19.25 + k * 0.07, 1.6, (t) => Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 2.2) * 0.14 * Math.min(1, t * 60), (k - 1.5) * 0.3));

  // The final hit and a shimmering tail under the logo.
  boom(35.5, 1.2, 40, 3.5);
  add(35.5, 4.5, (t) => (noise() * 2 - 1) * Math.exp(-t * 1.5) * 0.08, 0);
  [146.83, 220, 293.66, 440].forEach((f, k) => add(35.6, 4.3, (t) => Math.sin(2 * Math.PI * f * t + Math.sin(t * 3 + k)) * Math.exp(-t * 0.6) * 0.08 * Math.min(1, t * 3), (k - 1.5) * 0.4));

  // Master: gentle limiting, fade out at the end.
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(RATE, 24); buf.writeUInt32LE(RATE * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  const g = 0.9 / Math.max(peak * 0.7, 1e-6);
  for (let i = 0; i < n; i++) {
    const T = i / RATE;
    const fade = Math.min(1, T * 2, (seconds - T) * 1.5);
    const s = (x) => Math.round(Math.tanh(x * g) * fade * 32000);
    buf.writeInt16LE(s(L[i]), 44 + i * 4);
    buf.writeInt16LE(s(R[i]), 46 + i * 4);
  }
  return buf;
}

module.exports = { render };
