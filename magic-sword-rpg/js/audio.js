// Sound effects and music, made by the browser (WebAudio) — no sound files.
// Phones only allow sound after the first tap, so it starts then.

const Sound = {
  ctx: null,
  master: null,
  sfxBus: null,
  musicBus: null,
  track: null,        // the music that should be playing
  timer: null,
  step: 0,
  nextTime: 0,

  // Each effect is a list of notes: [frequency, start (s), length (s)].
  effects: {
    click: { wave: 'square', vol: 0.12, notes: [[660, 0, 0.05]] },
    hit: { wave: 'sawtooth', vol: 0.22, slide: 0.4, notes: [[220, 0, 0.12]], noise: 0.08 },
    hurt: { wave: 'square', vol: 0.18, slide: 0.5, notes: [[180, 0, 0.18]], noise: 0.1 },
    magic: { wave: 'triangle', vol: 0.22, notes: [[660, 0, 0.1], [880, 0.07, 0.1], [1175, 0.14, 0.12], [1568, 0.21, 0.2]] },
    heal: { wave: 'sine', vol: 0.25, notes: [[523, 0, 0.12], [659, 0.1, 0.12], [784, 0.2, 0.25]] },
    chest: { wave: 'triangle', vol: 0.25, notes: [[784, 0, 0.1], [988, 0.09, 0.1], [1175, 0.18, 0.1], [1568, 0.27, 0.3]] },
    levelup: { wave: 'triangle', vol: 0.28, notes: [[523, 0, 0.12], [659, 0.12, 0.12], [784, 0.24, 0.12], [1046, 0.36, 0.4]] },
    victory: { wave: 'square', vol: 0.12, notes: [[523, 0, 0.12], [659, 0.13, 0.12], [784, 0.26, 0.12], [1046, 0.39, 0.35]] },
    defeat: { wave: 'triangle', vol: 0.25, notes: [[392, 0, 0.3], [330, 0.3, 0.3], [262, 0.6, 0.3], [196, 0.9, 0.6]] },
    error: { wave: 'square', vol: 0.1, notes: [[200, 0, 0.08], [150, 0.09, 0.12]] },
    encounter: { wave: 'square', vol: 0.12, notes: [[330, 0, 0.07], [440, 0.07, 0.07], [330, 0.14, 0.07], [660, 0.21, 0.15]] },
  },

  // Music: one note per step; 0 is a rest. Numbers are MIDI notes (60 = middle C).
  tracks: {
    menu: { tempo: 0.32, wave: 'triangle', vol: 0.07,
      notes: [62, 0, 69, 0, 67, 0, 65, 64, 62, 0, 57, 0, 60, 62, 64, 0, 65, 0, 64, 62, 60, 0, 57, 0, 62, 0, 0, 0, 0, 0, 0, 0],
      bass: [38, 0, 0, 0, 38, 0, 0, 0, 34, 0, 0, 0, 34, 0, 0, 0, 36, 0, 0, 0, 36, 0, 0, 0, 38, 0, 0, 0, 33, 0, 0, 0] },
    village: { tempo: 0.24, wave: 'triangle', vol: 0.06,
      notes: [72, 76, 79, 76, 74, 0, 72, 0, 69, 72, 76, 72, 74, 0, 0, 0, 72, 76, 79, 84, 81, 0, 79, 0, 77, 76, 74, 76, 72, 0, 0, 0],
      bass: [48, 0, 0, 0, 55, 0, 0, 0, 45, 0, 0, 0, 50, 0, 0, 0, 48, 0, 0, 0, 53, 0, 0, 0, 50, 0, 0, 0, 48, 0, 0, 0] },
    battle: { tempo: 0.15, wave: 'square', vol: 0.045,
      notes: [64, 0, 64, 67, 0, 64, 71, 0, 69, 0, 67, 0, 64, 0, 62, 0, 64, 0, 64, 67, 0, 64, 72, 0, 71, 0, 69, 0, 71, 0, 0, 0],
      bass: [40, 40, 0, 40, 40, 0, 40, 0, 36, 36, 0, 36, 38, 0, 38, 0, 40, 40, 0, 40, 40, 0, 40, 0, 36, 0, 38, 0, 40, 0, 40, 0] },
  },

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.connect(this.master);
      this.musicBus = this.ctx.createGain();
      this.musicBus.connect(this.master);
      this.applySettings();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (this.track && !this.timer) this.startScheduler();
  },

  applySettings() {
    if (!this.ctx) return;
    const s = Settings.data;
    this.master.gain.value = s.volume;
    this.sfxBus.gain.value = s.sound ? 1 : 0;
    this.musicBus.gain.value = s.music ? 1 : 0;
  },

  tone(freq, start, length, wave, vol, bus, slide) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, start);
    if (slide) osc.frequency.exponentialRampToValueAtTime(freq * slide, start + length);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(vol, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
    osc.connect(gain);
    gain.connect(bus);
    osc.start(start);
    osc.stop(start + length + 0.02);
  },

  noise(start, length, vol) {
    const ctx = this.ctx;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * length), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.buffer = buffer;
    src.connect(gain);
    gain.connect(this.sfxBus);
    src.start(start);
  },

  play(name) {
    if (!this.ctx || !Settings.data.sound) return;
    const fx = this.effects[name];
    if (!fx) return;
    const t = this.ctx.currentTime + 0.01;
    for (const [freq, start, length] of fx.notes) this.tone(freq, t + start, length, fx.wave, fx.vol, this.sfxBus, fx.slide);
    if (fx.noise) this.noise(t, fx.noise, fx.vol);
  },

  // Starts a music track (or keeps it going if it's already on).
  music(name) {
    if (this.track === name) return;
    this.track = name;
    this.step = 0;
    if (this.ctx) {
      this.nextTime = this.ctx.currentTime + 0.1;
      if (!this.timer) this.startScheduler();
    }
  },

  startScheduler() {
    this.nextTime = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 100);
  },

  schedule() {
    const tr = this.tracks[this.track];
    if (!tr || !this.ctx || this.ctx.state !== 'running') return;
    // Don't build up a backlog of notes if the phone paused the game.
    if (this.nextTime < this.ctx.currentTime) this.nextTime = this.ctx.currentTime + 0.05;
    while (this.nextTime < this.ctx.currentTime + 0.3) {
      const i = this.step % tr.notes.length;
      const note = tr.notes[i];
      const bass = tr.bass[i % tr.bass.length];
      if (note) this.tone(midi(note), this.nextTime, tr.tempo * 0.9, tr.wave, tr.vol, this.musicBus);
      if (bass) this.tone(midi(bass), this.nextTime, tr.tempo * 1.8, 'sine', tr.vol * 1.6, this.musicBus);
      this.nextTime += tr.tempo;
      this.step += 1;
    }
  },
};

function midi(n) {
  return 440 * Math.pow(2, (n - 69) / 12);
}

['pointerdown', 'touchend', 'keydown'].forEach((type) => {
  window.addEventListener(type, () => Sound.unlock(), { passive: true });
});

document.addEventListener('visibilitychange', () => {
  if (!Sound.ctx) return;
  if (document.hidden) Sound.ctx.suspend();
  else Sound.ctx.resume();
});
