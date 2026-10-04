/* Frontline — every sound is synthesised with WebAudio: gunshots are shaped
   noise bursts, explosions are filtered rumbles, the Garand "ping" is a pair
   of ringing sine waves. No audio files. */
(function (FL) {
  'use strict';

  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let enabled = true;
  const lastPlayed = {};

  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.6;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    master.connect(comp).connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  function unlock() {
    init();
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  function noise(t, dur, vol, type, freq, q, attack) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q || 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + (attack || 0.003));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
    return f;
  }

  function tone(t, dur, vol, type, f0, f1, attack) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + (attack || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  const SOUNDS = {
    rifle(t, v) {
      noise(t, 0.32, 0.9 * v, 'lowpass', 2600);
      noise(t, 0.08, 0.5 * v, 'highpass', 3000);
      tone(t, 0.18, 0.6 * v, 'sine', 140, 40);
    },
    bolt(t, v) {
      noise(t, 0.4, 1.0 * v, 'lowpass', 2200);
      tone(t, 0.25, 0.7 * v, 'sine', 120, 35);
      noise(t + 0.45, 0.05, 0.15 * v, 'bandpass', 2500, 4);
      noise(t + 0.62, 0.05, 0.15 * v, 'bandpass', 1800, 4);
    },
    smg(t, v) {
      noise(t, 0.12, 0.7 * v, 'lowpass', 3200);
      tone(t, 0.08, 0.35 * v, 'sine', 180, 60);
    },
    pistol(t, v) {
      noise(t, 0.14, 0.6 * v, 'lowpass', 3800);
      tone(t, 0.09, 0.3 * v, 'square', 220, 70);
    },
    shotgun(t, v) {
      noise(t, 0.5, 1.0 * v, 'lowpass', 1600);
      noise(t, 0.12, 0.6 * v, 'highpass', 2000);
      tone(t, 0.3, 0.8 * v, 'sine', 100, 30);
    },
    bar(t, v) {
      noise(t, 0.2, 0.85 * v, 'lowpass', 2400);
      tone(t, 0.12, 0.45 * v, 'sine', 130, 45);
    },
    mg(t, v) {
      noise(t, 0.1, 0.55 * v, 'lowpass', 2000);
      tone(t, 0.06, 0.25 * v, 'sine', 150, 60);
    },
    rocket(t, v) {
      noise(t, 0.7, 0.7 * v, 'bandpass', 900, 1.2, 0.03);
      noise(t, 0.15, 0.6 * v, 'lowpass', 1200);
    },
    cannon(t, v) {
      noise(t, 0.9, 1.0 * v, 'lowpass', 900);
      tone(t, 0.6, 1.0 * v, 'sine', 90, 25);
    },
    boom(t, v) {
      noise(t, 1.4, 1.0 * v, 'lowpass', 700, 0.5, 0.01);
      noise(t, 0.25, 0.7 * v, 'lowpass', 3000);
      tone(t, 0.9, 1.0 * v, 'sine', 70, 22);
    },
    rumble(t, v) {
      noise(t, 2.2, 0.35 * v, 'lowpass', 220, 0.5, 0.25);
    },
    whistle(t, v) {
      tone(t, 1.1, 0.12 * v, 'sine', 1900, 500, 0.15);
    },
    ping(t, v) {
      tone(t, 0.6, 0.25 * v, 'sine', 2650, 2600);
      tone(t, 0.45, 0.12 * v, 'sine', 4100, 4050);
    },
    reload(t, v) {
      noise(t, 0.05, 0.3 * v, 'bandpass', 2400, 5);
      noise(t + 0.12, 0.06, 0.35 * v, 'bandpass', 1500, 5);
    },
    shell(t, v) {
      noise(t, 0.06, 0.3 * v, 'bandpass', 1900, 5);
    },
    empty(t, v) {
      noise(t, 0.03, 0.3 * v, 'bandpass', 3200, 6);
    },
    hit(t, v) {
      noise(t, 0.08, 0.4 * v, 'lowpass', 900);
    },
    clang(t, v) {
      tone(t, 0.2, 0.18 * v, 'triangle', 1400, 1100);
      noise(t, 0.05, 0.25 * v, 'highpass', 4000);
    },
    hurt(t, v) {
      tone(t, 0.25, 0.3 * v, 'sawtooth', 220, 90);
      noise(t, 0.12, 0.4 * v, 'lowpass', 800);
    },
    pickup(t, v) {
      tone(t, 0.08, 0.2 * v, 'square', 660);
      tone(t + 0.07, 0.12, 0.2 * v, 'square', 990);
    },
    throw(t, v) {
      noise(t, 0.2, 0.25 * v, 'bandpass', 600, 1, 0.05);
    },
    bounce(t, v) {
      noise(t, 0.05, 0.25 * v, 'bandpass', 1200, 3);
    },
    click(t, v) {
      tone(t, 0.05, 0.18 * v, 'square', 880);
    },
    radio(t, v) {
      noise(t, 0.3, 0.2 * v, 'bandpass', 1800, 3);
      tone(t + 0.05, 0.08, 0.12 * v, 'square', 1200);
      tone(t + 0.18, 0.08, 0.12 * v, 'square', 1200);
    },
    win(t, v) {
      const n = [392, 523, 659, 784];
      n.forEach((f, i) => tone(t + i * 0.16, 0.5, 0.2 * v, 'triangle', f));
    },
    lose(t, v) {
      const n = [392, 330, 262];
      n.forEach((f, i) => tone(t + i * 0.25, 0.6, 0.2 * v, 'triangle', f));
    },
    objective(t, v) {
      tone(t, 0.15, 0.2 * v, 'triangle', 523);
      tone(t + 0.15, 0.3, 0.2 * v, 'triangle', 784);
    },
  };

  // vol 0–1. Rapid repeats of the same sound are thinned so a firefight
  // doesn't turn into a wall of noise.
  function play(name, vol) {
    if (!enabled || !ctx || vol === 0) return;
    const now = ctx.currentTime;
    const gap = name === 'smg' || name === 'mg' || name === 'bar' ? 0.03 : 0.015;
    if (lastPlayed[name] && now - lastPlayed[name] < gap) return;
    lastPlayed[name] = now;
    const fn = SOUNDS[name];
    if (fn) fn(now, vol == null ? 1 : Math.min(1, vol));
  }

  FL.audio = {
    unlock,
    play,
    setEnabled(v) { enabled = v; },
  };
})(window.FL);
