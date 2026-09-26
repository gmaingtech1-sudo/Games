/* Riftborn — synthesized sound effects and haptics. Everything is generated
   with WebAudio, so the game ships with no audio files. */
window.RB = window.RB || {};
(function (RB) {
  'use strict';

  let ctx = null;
  let master = null;
  let on = true;

  function ensure() {
    if (!on) return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { return null; }
      master = ctx.createGain();
      master.gain.value = 0.45;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  function tone(o) {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime + (o.delay || 0);
    const dur = o.dur || 0.15;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol || 0.2, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  function noise(o) {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime + (o.delay || 0);
    const dur = o.dur || 0.1;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const filt = c.createBiquadFilter();
    filt.type = o.filter || 'bandpass';
    filt.frequency.value = o.freq || 1500;
    const g = c.createGain();
    g.gain.value = o.vol || 0.3;
    src.connect(filt);
    filt.connect(g);
    g.connect(master);
    src.start(t);
  }

  const buzz = (p) => { if (on) RB.host.haptic(p); };
  const arp = (notes, step, type, vol, dur) =>
    notes.forEach((f, i) => tone({ f, dur: dur || 0.14, delay: i * step, type: type || 'triangle', vol: vol || 0.14 }));

  RB.sfx = {
    get on() { return on; },
    set on(v) { on = !!v; },
    unlock: ensure,

    tap() { tone({ f: 740, dur: 0.05, type: 'triangle', vol: 0.08 }); buzz(5); },
    error() { tone({ f: 220, f2: 160, dur: 0.18, type: 'square', vol: 0.06 }); buzz(30); },
    hack() {
      arp([392, 587, 784, 1175], 0.05, 'square', 0.05, 0.08);
      noise({ dur: 0.25, freq: 3000, vol: 0.12, delay: 0.1 });
      buzz([10, 30, 10]);
    },
    collect() { arp([880, 1320], 0.06, 'triangle', 0.12, 0.1); buzz(10); },
    crate() { noise({ dur: 0.12, freq: 600, vol: 0.4 }); arp([523, 784, 1047], 0.07); buzz(20); },
    dart() { noise({ dur: 0.1, freq: 4200, vol: 0.25 }); tone({ f: 1400, f2: 600, dur: 0.12, type: 'sawtooth', vol: 0.04 }); buzz(8); },
    hit(big) { tone({ f: big ? 1320 : 990, f2: big ? 1760 : 1320, dur: 0.12, type: 'triangle', vol: 0.16 }); buzz(big ? 25 : 14); },
    miss() { tone({ f: 300, f2: 200, dur: 0.12, type: 'sine', vol: 0.1 }); },
    throw() { noise({ dur: 0.2, freq: 2400, vol: 0.2 }); tone({ f: 400, f2: 1200, dur: 0.18, type: 'sine', vol: 0.08 }); buzz(10); },
    absorb() { tone({ f: 200, f2: 1600, dur: 0.35, type: 'sawtooth', vol: 0.07 }); noise({ dur: 0.3, freq: 5000, vol: 0.12 }); buzz(30); },
    wobble() { tone({ f: 260, f2: 200, dur: 0.1, type: 'triangle', vol: 0.18 }); buzz(18); },
    caught() { arp([523, 659, 784, 1047, 1319], 0.08, 'triangle', 0.15, 0.2); buzz([20, 50, 20, 50, 60]); },
    breakout() { noise({ dur: 0.25, freq: 900, vol: 0.4 }); tone({ f: 500, f2: 150, dur: 0.3, type: 'sawtooth', vol: 0.06 }); buzz(40); },
    roar() {
      noise({ dur: 0.7, freq: 260, vol: 0.5, filter: 'lowpass' });
      tone({ f: 110, f2: 70, dur: 0.7, type: 'sawtooth', vol: 0.09 });
      buzz(60);
    },
    flee() { tone({ f: 600, f2: 120, dur: 0.5, type: 'sine', vol: 0.12 }); },
    strike() { noise({ dur: 0.12, freq: 700, vol: 0.45 }); buzz(20); },
    blast(el) {
      const f = { ember: 300, tide: 500, gale: 900, stone: 140, volt: 1200, void: 90 }[el] || 400;
      tone({ f: f * 2, f2: f, dur: 0.35, type: 'sawtooth', vol: 0.08 });
      noise({ dur: 0.35, freq: f * 3, vol: 0.3 });
      buzz(35);
    },
    guard() { tone({ f: 440, f2: 660, dur: 0.25, type: 'sine', vol: 0.12 }); },
    faint() { tone({ f: 400, f2: 80, dur: 0.6, type: 'triangle', vol: 0.14 }); },
    win() { arp([523, 659, 784, 1047, 784, 1047, 1319], 0.1, 'square', 0.06, 0.18); buzz([30, 60, 30, 60, 90]); },
    lose() { arp([392, 330, 262, 196], 0.16, 'triangle', 0.12, 0.3); },
    claim() { arp([262, 392, 523, 784, 1047], 0.07, 'sawtooth', 0.05, 0.25); buzz([20, 40, 60]); },
    link() { tone({ f: 300, f2: 2400, dur: 0.5, type: 'sine', vol: 0.12 }); noise({ dur: 0.4, freq: 6000, vol: 0.1 }); buzz(30); },
    field() { arp([262, 330, 392, 523, 659, 784, 1047], 0.06, 'triangle', 0.14, 0.4); buzz([30, 30, 30, 30, 120]); },
    levelUp() { arp([523, 659, 784, 1047, 1319, 1568], 0.09, 'triangle', 0.16, 0.2); buzz([20, 60, 20, 60, 40]); },
    spawn() { tone({ f: 1200, f2: 1800, dur: 0.08, type: 'sine', vol: 0.05 }); },
  };
})(window.RB);
