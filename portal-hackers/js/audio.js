/* Portal Hackers: Nexus — synthesized sound effects and vibration. Every
   sound is made with WebAudio, so the game ships no audio files. */
window.PH = window.PH || {};
(function (PH) {
  'use strict';

  let ctx = null, master = null, on = true;

  function ensure() {
    if (!on) return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { return null; }
      master = ctx.createGain();
      master.gain.value = 0.4;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  function tone(f, dur, o) {
    o = o || {};
    const c = ensure();
    if (!c) return;
    const t = c.currentTime + (o.delay || 0);
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(f, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol || 0.18, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  function buzz(pattern) {
    if (!on || !navigator.vibrate) return;
    try { navigator.vibrate(pattern); } catch (e) { /* ignore */ }
  }

  PH.audio = {
    set enabled(v) { on = !!v; },
    unlock: ensure,
    tap: () => tone(880, 0.05, { type: 'square', vol: 0.05 }),
    ping: () => { tone(1320, 0.12, { vol: 0.08 }); tone(1760, 0.18, { delay: 0.06, vol: 0.06 }); },
    discover: () => { [660, 880, 1320].forEach((f, i) => tone(f, 0.14, { delay: i * 0.07, type: 'triangle', vol: 0.12 })); buzz(20); },
    energy: () => { tone(520, 0.12, { to: 1040, type: 'triangle', vol: 0.1 }); buzz(8); },
    node: (i) => tone(440 * Math.pow(2, (i % 8) / 8), 0.09, { type: 'square', vol: 0.06 }),
    miss: () => { tone(160, 0.18, { type: 'sawtooth', vol: 0.1 }); buzz(40); },
    hackWin: () => { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.16, { delay: i * 0.08, type: 'triangle', vol: 0.12 })); buzz([20, 40, 20]); },
    hackFail: () => { tone(300, 0.4, { to: 90, type: 'sawtooth', vol: 0.12 }); buzz(120); },
    capture: () => { [392, 523, 659, 784].forEach((f, i) => tone(f, 0.22, { delay: i * 0.06, type: 'sawtooth', vol: 0.07 })); buzz([30, 30, 60]); },
    link: () => { tone(300, 0.35, { to: 1200, type: 'sine', vol: 0.12 }); buzz(25); },
    levelUp: () => { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.3, { delay: i * 0.1, type: 'triangle', vol: 0.12 })); buzz([40, 60, 40, 60, 80]); },
    signal: () => { for (let i = 0; i < 4; i++) tone(200 + i * 220, 0.5, { delay: i * 0.12, vol: 0.08 }); buzz([20, 30, 20]); },
    bad: () => tone(220, 0.2, { type: 'square', vol: 0.06 }),
  };
})(window.PH);
