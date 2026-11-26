'use strict';
/* Job Interview Simulator: a slapstick job interview at Synergex Solutions Ltd.
   Every question has a couple of sensible answers and a couple of less sensible ones. */

// ---------- Data ----------

const CHARS = [
  {
    name: 'Gary Pemberton', title: 'Regional Manager', hp: 80, plate: 'G. PEMBERTON',
    skin: '#f2c29b', hair: 'combover', hairColor: '#5a3b22', shirt: '#cfe0f5', jacket: null, tie: '#c0392b',
    glasses: 'square', o: 'him', p: 'his',
    intro: "Hi! Gary Pemberton, Regional Manager. Take a seat. Let's see if you're Synergex material.",
    hits: [
      "OW! Okay. I'll put that down as 'strong communication skills'.",
      "That's... that's going in my notes.",
      "HR is going to hear about this!",
      "Moving on. Moving ON.",
      "I have a wife! Well, I had a wife. Ow!",
      "Is this how they do interviews now?!",
    ],
    impressed: [
      "Honestly? That's the go-getter attitude we need round here.",
      "Ow. But wow. You really take initiative.",
    ],
    ko: "...you're... overqualified...",
  },
  {
    name: 'Karen Whitlock', title: 'Head of HR', hp: 100, plate: 'K. WHITLOCK',
    skin: '#e8b48f', hair: 'bun', hairColor: '#d9b44a', shirt: '#ffffff', jacket: '#7d3c98', tie: null,
    glasses: 'cat', lipstick: '#c2185b', pearls: true, o: 'her', p: 'her',
    intro: "I heard screaming. I'm Karen, Head of HR. I'll be continuing this interview. Calmly.",
    hits: [
      "This is a formal written warning!",
      "I'm writing you up and you don't even WORK here!",
      "That is a violation of at least four policies.",
      "I need to speak to... myself. I'm the manager.",
      "My lanyard! You bent my lanyard!",
      "We have a zero-tolerance policy! ZERO!",
    ],
    impressed: [
      "Assertive. Very assertive. I'm putting 'leadership potential'.",
      "Fine. That shows... conflict resolution skills.",
    ],
    ko: "I'm... filing... a complaint...",
  },
  {
    name: 'Sterling Vance III', title: 'CEO', hp: 120, plate: 'S. VANCE III',
    skin: '#f0c8a8', hair: 'bald', hairColor: '#d5d5d5', shirt: '#ffffff', jacket: '#232323', tie: '#d4ac0d',
    mustache: true, monocle: true, o: 'him', p: 'his',
    intro: "Nobody beats up my staff except ME. I'm the CEO. Sit down and impress me.",
    hits: [
      "Do you have ANY idea what this suit cost?",
      "I've fired people for less. I've fired people for nothing!",
      "My lawyers will hear about this. All forty of them.",
      "You'll never work in this town again! Probably!",
      "My monocle! That was my grandfather's!",
      "Unacceptable! ...Mildly impressive. But unacceptable!",
    ],
    impressed: [
      "Ruthless. I like that. Reminds me of me.",
      "That's the killer instinct this company was built on!",
    ],
    ko: "Tell... the board... no... raises...",
  },
];

const ACTIONS = {
  gun:     { label: '🔫 Get my gun out and shoot {o}.', dmg: 40, word: 'BANG!' },
  punch:   { label: '👊 Punch {o} in the face.', dmg: 25, word: 'POW!' },
  slap:    { label: '✋ Slap {o} across the desk.', dmg: 15, word: 'SLAP!' },
  coffee:  { label: '☕ Throw my hot coffee at {o}.', dmg: 20, word: 'SPLASH!' },
  stapler: { label: '📎 Lob the stapler at {p} head.', dmg: 20, word: 'BONK!' },
  desk:    { label: '(╯°□°)╯ Flip the desk on {o}.', dmg: 35, word: 'CRASH!' },
  chair:   { label: '🪑 Smash a chair over {p} head.', dmg: 30, word: 'WHAM!' },
};

const WEAPON_LINES = {
  gun: ["Did you just SHOOT me?!", "That's a bullet. In me. In an INTERVIEW.", "You brought a GUN to a job interview?!"],
  punch: ["My face! I need that for Zoom calls!", "Ow! My nose! My beautiful nose!"],
  slap: ["Did you just... slap me?", "That stings. Emotionally too."],
  coffee: ["AAAH! HOT! HOT! HOT!", "Is this... decaf? MONSTER!"],
  stapler: ["Ow! That stapler is company property!", "BONK? Did you just say bonk?"],
  desk: ["My desk! I had my lunch in there!", "Nobody flips the desk at Synergex!"],
  chair: ["That chair was ergonomic!", "Ow! That's coming out of your first paycheck!"],
};

// Talk answers: [text, hire change, reply]. Some questions offer their own violent answers: v: [[weapon, text]].
const QUESTIONS = [
  { q: "So, tell me a bit about yourself.", a: [
    ["I'm a hard worker and a real team player.", 8, "Wow. Never heard that one before. Great."],
    ["I once ate forty chicken nuggets in one sitting.", 2, "...That's genuinely impressive, actually."],
    ["I'd rather not, to be honest.", -10, "Okay. Mysterious. Not in a good way."]] },
  { q: "Where do you see yourself in five years?", a: [
    ["Growing with this company.", 10, "Love it. Very corporate. Very good."],
    ["In your chair.", -4, "Ha. Ha ha. That's not funny."],
    ["Honestly? Asleep.", -8, "Relatable. Still a no."]],
    v: [['gun', "🔫 Somewhere you aren't. *gets gun out*"]] },
  { q: "What would you say is your biggest weakness?", a: [
    ["I work too hard.", 5, "Ah, the classic. Noted."],
    ["Kryptonite.", 0, "...Are you Superman? Is that on your CV?"],
    ["Job interviews, clearly.", 2, "At least you're honest."]] },
  { q: "A customer is screaming at you. What do you do in this situation?", a: [
    ["Stay calm, listen and help them.", 14, "Textbook! That's what we like to hear."],
    ["Scream back, but louder.", -10, "That's... not in the handbook."]],
    v: [['gun', "🔫 Get my gun out and shoot {o}. Problem solved."]] },
  { q: "Your coworker keeps stealing your lunch from the fridge. What do you do?", a: [
    ["Label my food clearly and have a chat.", 8, "Mature. Sensible. Boring, but good."],
    ["Fill my sandwiches with ghost peppers.", -2, "...I'll be eating out for a while."]],
    v: [['punch', "👊 Show you exactly what I'd do. *punches {o}*"]] },
  { q: "Why do you want to work here?", a: [
    ["I'm passionate about synergy.", 10, "Synergy! Finally, someone who gets it."],
    ["My mum said I have to.", -6, "Tell your mum we said hi."],
    ["The free biscuits.", 0, "The biscuits ARE good. Fair."]] },
  { q: "How do you handle stress at work?", a: [
    ["Deep breaths and a good to-do list.", 10, "Very healthy. Very employable."],
    ["I don't. I just sort of vibrate.", -3, "I can see that, yeah."]],
    v: [['desk', "(╯°□°)╯ Like this. *flips the desk*"]] },
  { q: "The printer jams the night before a huge deadline. What do you do?", a: [
    ["Fix it, or find another printer fast.", 10, "Problem-solver. Love it."],
    ["Take it out to a field. Old school.", 0, "Ah, I've seen that film."]] },
  { q: "What would your last boss say about you?", a: [
    ["That I'm reliable and always on time.", 8, "We'll call them. Maybe."],
    ["Nothing. Legally he's not allowed to.", -10, "...Why not?"]] },
  { q: "How many tennis balls would fit in this room?", a: [
    ["About four thousand.", 6, "Confident. I like it."],
    ["Depends how hard I throw them.", -4, "Please don't throw anything."]],
    v: [['stapler', "📎 I don't know, but here's a stapler. *throws it*"]] },
  { q: "Would you be willing to work weekends for no extra pay?", a: [
    ["Of course! Happy to help!", 14, "Excellent. You'll fit right in. Sucker."],
    ["Absolutely not.", -10, "Hmm. Not a team player then."]],
    v: [['punch', "👊 Ask me that again. Go on. *punches {o}*"]] },
  { q: "We like to think of ourselves as one big family here.", a: [
    ["That's lovely to hear.", 6, "It is lovely. Mandatory, but lovely."],
    ["So... dysfunctional, then?", -4, "We don't use that word here."]] },
  { q: "What kind of salary are you expecting?", a: [
    ["Whatever is fair for the role.", 6, "Great, minimum wage it is!"],
    ["One billion. Cash. In a briefcase.", -6, "I'll have to run that by finance."]],
    v: [['gun', "🔫 Let my gun do the negotiating."]] },
  { q: "Do you have any questions for me?", a: [
    ["What does a typical day look like?", 10, "Great question! Meetings. Then meetings about meetings."],
    ["Is that your real hair?", -10, "I... how DARE you."]] },
  { q: "Describe yourself in three words.", a: [
    ["Driven. Focused. Loyal.", 10, "Three words! Perfect counting too."],
    ["Bad at counting.", 0, "That's three. Wait. Is it?"]] },
  { q: "Your manager makes a terrible decision. What do you do?", a: [
    ["Raise it with them respectfully.", 10, "Exactly. Then we ignore you. Respectfully."],
    ["Start a rumour about them.", -6, "That's how I got THIS job, but still, no."]],
    v: [['chair', "🪑 This. *picks up a chair*"]] },
  { q: "Sell me this pen.", a: [
    ["This pen will change your life.", 6, "Ooh. Tell me more, pen person."],
    ["No.", -6, "...Fair, honestly. It's a rubbish pen."]],
    v: [['stapler', "📎 Here, have a stapler instead. *throws it*"]] },
  { q: "We've had a complaint that you've been rude in this interview. How do you respond?", a: [
    ["I sincerely apologise.", 10, "Apology accepted. Gold star."],
    ["Who complained? Name names.", -6, "I can't tell you that. It was me."]],
    v: [['coffee', "☕ Respond with my coffee. *throws it*"]] },
  { q: "How do you feel about working in an open-plan office?", a: [
    ["Love it! Great for collaboration.", 8, "Collaboration! Buzzword bingo, you win."],
    ["I'll need noise-cancelling headphones and a moat.", -2, "The moat is not in the budget."]] },
  { q: "Your team misses a target. Whose fault is it?", a: [
    ["We win together and lose together.", 10, "Beautiful. I'm going to put that on a mug."],
    ["Whoever's standing closest to me.", -6, "That's... me. I'm closest."]],
    v: [['slap', "✋ Yours. *slaps {o}*"]] },
];

const HIT_ORDER = ['gun', 'punch', 'coffee', 'desk', 'chair', 'stapler', 'slap'];
const MAX_Q = 12;

// ---------- Canvas & helpers ----------

const cvs = document.getElementById('scene');
const g = cvs.getContext('2d');
const VW = 400, VH = 400;
let view = { s: 1, ox: 0, oy: 0, w: 0, h: 0, dpr: 1 };

function resize() {
  const r = cvs.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  cvs.width = Math.round(r.width * dpr);
  cvs.height = Math.round(r.height * dpr);
  const s = Math.min(r.width / VW, r.height / VH);
  view = { s, ox: (r.width - VW * s) / 2, oy: r.height - VH * s, w: r.width, h: r.height, dpr };
}
window.addEventListener('resize', resize);

const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = t => 1 - Math.pow(1 - t, 3);
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

function rr(x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function ell(x, y, rx, ry, rot) { g.beginPath(); g.ellipse(x, y, rx, ry, rot || 0, 0, Math.PI * 2); }
function circ(x, y, r) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); }
function star(x, y, r1, r2, n) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? r2 : r1, a = -Math.PI / 2 + i * Math.PI / n;
    g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  g.closePath();
}
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => clamp(Math.round(v * f), 0, 255));
  return 'rgb(' + c.join(',') + ')';
}

// ---------- Sound ----------

const audio = { ctx: null, muted: false, noise: null };
function ac() {
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
const SFX = {
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
function buzz(ms) {
  try {
    if (window.AndroidHost && AndroidHost.vibrate) AndroidHost.vibrate(ms);
    else if (navigator.vibrate) navigator.vibrate(ms);
  } catch (e) { /* no vibration */ }
}

// ---------- State ----------

let person, game, desk, fx, anim = null, ui = { state: 'title' }, lastTap = 0;

function newPerson(i, entering) {
  const def = CHARS[i];
  return {
    i, def, hp: def.hp, ko: false, koT: 0,
    dx: entering ? 360 : 0, dy: 0, rot: 0, vx: 0, vy: 0, vr: 0,
    enterT: entering ? 0 : 1, exitT: 0,
    expr: 'neutral', exprT: 0, blinkT: rand(1, 4), lookX: 0,
    marks: { blackEye: false, bruise: false, punches: 0, slap: 0, bandaids: [], coffee: [], bump: 0, toupeeLost: false,
      broken: false, toothGone: false, tieCut: false, messy: false, smoke: 0, steam: 0 },
  };
}

function resetGame() {
  game = { q: 0, hire: 50, chaos: 0, kos: 0, streak: 0, used: new Set(),
    stats: { hits: 0, shots: 0, coffee: 0, slaps: 0, flips: 0, talk: 0 } };
  person = newPerson(0, false);
  desk = { lift: 0, t: -1, items: true };
  fx = { parts: [], words: [], shake: 0, flash: 0, feetT: 0, oldPerson: null };
  anim = null;
}

// ---------- Drawing ----------

function drawRoom(t) {
  // Wall
  g.fillStyle = '#d8ccb0'; g.fillRect(-400, -400, 1200, 900);
  g.fillStyle = '#cbbd9d'; g.fillRect(-400, 230, 1200, 8);
  // Window with a city
  g.fillStyle = '#5a4a36'; rr(22, 40, 128, 138, 6); g.fill();
  g.fillStyle = '#8fd0ff'; g.fillRect(30, 48, 112, 122);
  g.fillStyle = '#fff';
  const cx = 30 + ((t * 6) % 150) - 20;
  ell(cx, 72, 18, 7); g.fill(); ell(cx + 14, 66, 12, 8); g.fill();
  g.save(); g.beginPath(); g.rect(30, 48, 112, 122); g.clip();
  g.fillStyle = '#6b7fa3';
  [[30, 120, 22], [55, 95, 18], [76, 110, 20], [99, 85, 22], [124, 115, 20]].forEach(([x, y, w]) => g.fillRect(x, y, w, 60));
  g.fillStyle = '#ffe78a';
  for (let x = 34; x < 142; x += 9) for (let y = 100; y < 168; y += 11) if ((x * 7 + y * 3) % 5 < 2) g.fillRect(x, y, 3, 4);
  g.restore();
  g.fillStyle = '#5a4a36'; g.fillRect(84, 48, 4, 122); g.fillRect(30, 107, 112, 4);
  // Motivational poster
  g.fillStyle = '#222'; g.fillRect(262, 46, 104, 110);
  g.fillStyle = '#ff9a5a'; g.fillRect(268, 52, 92, 70);
  g.fillStyle = '#5b3a8c'; g.beginPath(); g.moveTo(268, 122); g.lineTo(300, 78); g.lineTo(322, 100); g.lineTo(338, 84); g.lineTo(360, 122); g.fill();
  g.fillStyle = '#fff'; g.font = '900 15px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText('SYNERGY', 314, 141);
  g.font = '600 6px system-ui, sans-serif'; g.fillText('TEAMWORK MAKES THE DREAM WORK', 314, 150);
  // Clock
  g.fillStyle = '#fff'; circ(200, 46, 18); g.fill(); g.lineWidth = 3; g.strokeStyle = '#333'; g.stroke();
  g.lineWidth = 2; g.beginPath(); g.moveTo(200, 46); g.lineTo(200 + Math.cos(t * 0.5) * 12, 46 + Math.sin(t * 0.5) * 12);
  g.moveTo(200, 46); g.lineTo(207, 40); g.stroke();
  // Plant
  g.fillStyle = '#b5651d'; g.beginPath(); g.moveTo(360, 300); g.lineTo(392, 300); g.lineTo(386, 340); g.lineTo(366, 340); g.fill();
  g.fillStyle = '#3c8d3c';
  for (let k = 0; k < 6; k++) { ell(376 + Math.sin(k * 1.7 + t) * 2, 296 - k * 12, 9, 22, (k % 2 ? 0.5 : -0.5)); g.fill(); }
}

function drawHead(p) {
  const c = p.def, m = p.marks, e = p.expr;
  // ears
  g.fillStyle = c.skin; circ(-44, 2, 10); g.fill(); circ(44, 2, 10); g.fill();
  if (c.pearls) { g.fillStyle = '#ffd54f'; circ(-45, 15, 4); g.fill(); circ(45, 15, 4); g.fill(); }
  // back hair (bun)
  if (c.hair === 'bun') {
    g.fillStyle = c.hairColor; circ(0, -54, 20); g.fill();
    g.strokeStyle = '#ffeb3b'; g.lineWidth = 3; g.beginPath(); g.moveTo(-22, -68); g.lineTo(20, -44); g.stroke();
  }
  // face
  g.fillStyle = c.skin; ell(0, 0, 44, 50); g.fill();
  g.lineWidth = 3; g.strokeStyle = '#2b1b10'; g.stroke();

  // hair
  g.fillStyle = c.hairColor;
  if (c.hair === 'combover') {
    if (!m.toupeeLost) {
      g.beginPath(); g.moveTo(-46, -6); g.quadraticCurveTo(-48, -52, -6, -52); g.quadraticCurveTo(40, -54, 46, -10);
      g.quadraticCurveTo(30, -36, -36, -24); g.closePath(); g.fill();
      g.strokeStyle = shade(c.hairColor, 0.7); g.lineWidth = 1.5;
      for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(-34 + k * 8, -28 - k * 3); g.quadraticCurveTo(0, -44 - k * 2, 38, -16 - k * 3); g.stroke(); }
    } else {
      g.fillStyle = 'rgba(255,255,255,.45)'; ell(-12, -36, 14, 6, -0.3); g.fill();
      g.strokeStyle = c.hairColor; g.lineWidth = 2;
      [[-4, -50], [2, -51], [8, -50]].forEach(([x, y], k) => { g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 6, y - 14, x + 2 + k * 3, y - 20); g.stroke(); });
      g.fillStyle = c.hairColor; ell(-42, -8, 6, 14); g.fill(); ell(42, -8, 6, 14); g.fill();
    }
  } else if (c.hair === 'bun') {
    g.beginPath(); g.moveTo(-46, 4); g.quadraticCurveTo(-50, -56, 0, -52); g.quadraticCurveTo(50, -56, 46, 4);
    g.quadraticCurveTo(40, -30, 6, -34); g.quadraticCurveTo(-36, -34, -46, 4); g.fill();
    if (m.messy) {
      g.strokeStyle = c.hairColor; g.lineWidth = 3;
      for (let k = 0; k < 7; k++) { const a = -Math.PI + k * 0.5; g.beginPath(); g.moveTo(Math.cos(a) * 44, Math.sin(a) * 48 - 4); g.lineTo(Math.cos(a) * 64, Math.sin(a) * 66 - 6); g.stroke(); }
    }
  } else {
    g.fillStyle = 'rgba(255,255,255,.5)'; ell(-14, -34, 15, 7, -0.3); g.fill();
    g.fillStyle = c.hairColor; ell(-41, -6, 8, 16); g.fill(); ell(41, -6, 8, 16); g.fill();
  }
  // bump(s) from the stapler / chair
  for (let k = 0; k < m.bump; k++) {
    const bx = [10, -20, 26][k % 3], by = [-50, -46, -40][k % 3];
    g.fillStyle = shade(c.skin, 0.92); circ(bx, by, 11 + k); g.fill(); g.strokeStyle = '#2b1b10'; g.lineWidth = 2; g.stroke();
    g.fillStyle = 'rgba(255,255,255,.6)'; circ(bx - 3, by - 4, 3); g.fill();
  }

  // black eye and bruise
  if (m.blackEye) { g.fillStyle = 'rgba(90,40,140,.65)'; ell(-17, -6, 15, 13); g.fill(); }
  if (m.bruise) { g.fillStyle = 'rgba(110,60,150,.45)'; ell(26, 16, 9, 7); g.fill(); }
  if (m.slap) {
    g.fillStyle = 'rgba(230,60,70,.45)';
    ell(-24, 18, 10, 9); g.fill();
    for (let k = 0; k < 4; k++) { ell(-36 + k * 6, 4 - (k === 0 ? -4 : 0), 2.6, 7, 0.2); g.fill(); }
  }

  // eyes
  const blink = p.blinkT < 0.12 && e !== 'ko' && e !== 'shocked';
  for (const s of [-1, 1]) {
    const x = s * 17, y = -6;
    g.strokeStyle = '#1b1b1b'; g.lineWidth = 3; g.fillStyle = '#fff';
    if (e === 'ko') {
      g.beginPath(); g.moveTo(x - 7, y - 7); g.lineTo(x + 7, y + 7); g.moveTo(x + 7, y - 7); g.lineTo(x - 7, y + 7); g.stroke();
    } else if (e === 'hurt') {
      g.beginPath(); g.moveTo(x - 8 * s, y - 6); g.lineTo(x + 6 * s, y); g.lineTo(x - 8 * s, y + 6); g.stroke();
    } else if (e === 'happy') {
      g.beginPath(); g.arc(x, y + 3, 7, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
    } else if (blink) {
      g.beginPath(); g.moveTo(x - 8, y); g.lineTo(x + 8, y); g.stroke();
    } else {
      const big = e === 'shocked' ? 12 : 9;
      ell(x, y, big - 1, big); g.fill(); g.lineWidth = 2; g.stroke();
      g.fillStyle = '#1b1b1b'; circ(x + p.lookX * 3, y + 1, e === 'shocked' ? 3 : 4.5); g.fill();
      if (e === 'smug') { g.fillStyle = c.skin; g.fillRect(x - 10, y - 11, 20, 10); g.strokeStyle = '#1b1b1b'; g.beginPath(); g.moveTo(x - 9, y - 1); g.lineTo(x + 9, y - 1); g.stroke(); }
    }
    // brows
    g.strokeStyle = c.hair === 'bald' ? '#999' : shade(c.hairColor, 0.6); g.lineWidth = 4;
    g.beginPath();
    if (e === 'angry') { g.moveTo(x - 10 * s, y - 20); g.lineTo(x + 8 * s, y - 13); }
    else if (e === 'shocked' || e === 'hurt') { g.moveTo(x - 9, y - 22); g.quadraticCurveTo(x, y - 28, x + 9, y - 22); }
    else { g.moveTo(x - 9, y - 18); g.lineTo(x + 9, y - 18); }
    g.stroke();
  }

  // glasses / monocle
  g.strokeStyle = '#111'; g.lineWidth = 2.5;
  if (c.glasses) {
    g.save();
    if (m.broken) g.rotate(0.12);
    for (const s of [-1, 1]) {
      const x = s * 17;
      if (c.glasses === 'cat') {
        g.beginPath(); g.moveTo(x - 13, y0(-14)); g.lineTo(x + 13, y0(-12)); g.lineTo(x + 11, y0(4)); g.lineTo(x - 11, y0(4)); g.closePath();
        if (s < 0) { g.moveTo(x - 13, y0(-14)); g.lineTo(x - 18, y0(-20)); } else { g.moveTo(x + 13, y0(-12)); g.lineTo(x + 18, y0(-20)); }
        g.stroke();
      } else { rr(x - 13, -16, 26, 20, 4); g.stroke(); }
    }
    g.beginPath(); g.moveTo(-4, -7); g.lineTo(4, -7); g.stroke();
    if (m.broken) {
      g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.beginPath();
      g.moveTo(10, -14); g.lineTo(17, -6); g.lineTo(13, 0); g.moveTo(17, -6); g.lineTo(26, -10); g.moveTo(17, -6); g.lineTo(22, 2); g.stroke();
    }
    g.restore();
  }
  if (c.monocle && !m.broken) {
    g.strokeStyle = '#d4ac0d'; g.lineWidth = 3; circ(17, -6, 13); g.stroke();
    g.lineWidth = 1.5; g.beginPath(); g.moveTo(28, 2); g.quadraticCurveTo(40, 40, 30, 70); g.stroke();
  }

  // nose
  g.fillStyle = m.punches >= 2 ? '#e0524a' : shade(c.skin, 0.88);
  ell(0, 8, m.punches >= 2 ? 9 : 7, m.punches >= 2 ? 8 : 6); g.fill();
  g.strokeStyle = '#2b1b10'; g.lineWidth = 1.5; g.stroke();
  if (c.mustache) {
    g.fillStyle = c.hairColor; g.beginPath();
    g.moveTo(0, 15); g.quadraticCurveTo(-14, 10, -28, 22); g.quadraticCurveTo(-14, 22, 0, 19);
    g.quadraticCurveTo(14, 22, 28, 22); g.quadraticCurveTo(14, 10, 0, 15); g.fill();
  }

  // mouth
  g.strokeStyle = '#2b1b10'; g.lineWidth = 3; g.fillStyle = '#7a1c1c';
  const my = c.mustache ? 30 : 26;
  g.beginPath();
  if (e === 'happy') { g.moveTo(-14, my - 3); g.quadraticCurveTo(0, my + 16, 14, my - 3); g.closePath(); g.fill(); g.stroke(); teeth(my - 2, 26); }
  else if (e === 'smug') { g.moveTo(-10, my + 2); g.quadraticCurveTo(4, my + 4, 14, my - 4); g.stroke(); }
  else if (e === 'shocked') { ell(0, my + 3, 8, 10); g.fill(); g.stroke(); }
  else if (e === 'hurt') { ell(0, my + 3, 13, 8); g.fill(); g.stroke(); teeth(my - 3, 22); }
  else if (e === 'ko') {
    ell(0, my + 2, 10, 6); g.fill(); g.stroke();
    g.fillStyle = '#ff7b8a'; ell(5, my + 10, 6, 8); g.fill(); g.lineWidth = 2; g.stroke();
  } else if (e === 'angry') { g.moveTo(-12, my + 5); g.quadraticCurveTo(0, my - 6, 12, my + 5); g.stroke(); }
  else { g.moveTo(-10, my + 1); g.lineTo(10, my + 1); g.stroke(); }
  if (c.lipstick && (e === 'neutral' || e === 'smug' || e === 'angry')) { g.strokeStyle = c.lipstick; g.lineWidth = 3; g.stroke(); }

  function teeth(y, w) {
    g.fillStyle = '#fff'; g.fillRect(-w / 2 + 2, y, w - 4, 4);
    if (m.toothGone) { g.fillStyle = '#7a1c1c'; g.fillRect(-3, y, 5, 4); }
  }
  function y0(v) { return v; }

  // band-aids
  for (const b of m.bandaids) if (b.head) bandaid(b.x, b.y, b.r);
}

function bandaid(x, y, r) {
  g.save(); g.translate(x, y);
  for (const a of [r, r + Math.PI / 2]) {
    g.save(); g.rotate(a);
    g.fillStyle = '#f1c27d'; rr(-14, -4.5, 28, 9, 4); g.fill(); g.strokeStyle = '#a0784a'; g.lineWidth = 1.2; g.stroke();
    g.fillStyle = '#e3a868'; g.fillRect(-4, -4, 8, 8);
    g.restore();
  }
  g.restore();
}

function drawPersonBody(p) {
  const c = p.def, m = p.marks;
  // chair back
  g.fillStyle = '#2d2d3a'; rr(-82, -218, 164, 230, 24); g.fill();
  g.fillStyle = '#3a3a4a'; rr(-70, -206, 140, 200, 18); g.fill();
  // neck
  g.fillStyle = shade(c.skin, 0.9); g.fillRect(-15, -112, 30, 24);
  // torso
  const torso = () => { g.beginPath(); g.moveTo(-60, -98); g.quadraticCurveTo(-90, -92, -92, -60); g.lineTo(-98, 12); g.lineTo(98, 12); g.lineTo(92, -60); g.quadraticCurveTo(90, -92, 60, -98); g.closePath(); };
  g.fillStyle = c.jacket || c.shirt; torso(); g.fill(); g.strokeStyle = '#1b1b1b'; g.lineWidth = 3; g.stroke();
  if (c.jacket) {
    g.fillStyle = c.shirt; g.beginPath(); g.moveTo(-28, -98); g.lineTo(0, -20); g.lineTo(28, -98); g.closePath(); g.fill();
    g.strokeStyle = shade(c.jacket, 0.6); g.lineWidth = 2; g.beginPath(); g.moveTo(-28, -98); g.lineTo(-12, -40); g.moveTo(28, -98); g.lineTo(12, -40); g.stroke();
  } else {
    g.fillStyle = shade(c.shirt, 0.9); g.beginPath(); g.moveTo(-16, -98); g.lineTo(0, -82); g.lineTo(-4, -76); g.lineTo(-22, -92); g.fill();
    g.beginPath(); g.moveTo(16, -98); g.lineTo(0, -82); g.lineTo(4, -76); g.lineTo(22, -92); g.fill();
  }
  if (c.tie) {
    g.fillStyle = c.tie; g.beginPath(); g.moveTo(-7, -92); g.lineTo(7, -92); g.lineTo(5, -82); g.lineTo(-5, -82); g.fill();
    const end = m.tieCut ? -62 : -26;
    g.beginPath(); g.moveTo(-5, -82); g.lineTo(5, -82); g.lineTo(11, end); g.lineTo(0, end + (m.tieCut ? 0 : 10)); g.lineTo(-11, end); g.closePath(); g.fill();
    g.strokeStyle = '#1b1b1b'; g.lineWidth = 1.5; g.stroke();
  }
  if (c.pearls) {
    g.fillStyle = '#fafafa'; g.strokeStyle = '#bbb'; g.lineWidth = 1;
    for (let k = 0; k <= 10; k++) { const a = Math.PI * (0.15 + 0.07 * k); circ(Math.cos(a) * 26, -104 + Math.sin(a) * 26, 3.4); g.fill(); g.stroke(); }
  }
  // coffee stains
  g.fillStyle = 'rgba(110,62,25,.75)';
  for (const s of m.coffee) { ell(s.x, s.y, s.r, s.r * 0.8, s.a); g.fill(); }
  for (const b of m.bandaids) if (!b.head) bandaid(b.x, b.y, b.r);
  // head
  g.save(); g.translate(0, -152); g.rotate(p.rot * 0.4); drawHead(p); g.restore();
}

function drawHands(p) {
  const c = p.def;
  for (const s of [-1, 1]) {
    g.fillStyle = c.jacket || c.shirt; g.strokeStyle = '#1b1b1b'; g.lineWidth = 3;
    rr(s * 80 - 22, -14, 44, 22, 10); g.fill(); g.stroke();
    g.fillStyle = c.skin; ell(s * 58, -2, 14, 11); g.fill(); g.stroke();
  }
}

function drawDesk() {
  g.save();
  const l = desk.lift;
  g.translate(200, 300 - l * 150); g.rotate(-l * 0.5); g.translate(-200, -300);
  // top
  g.fillStyle = '#6d4426'; g.fillRect(-10, 292, 420, 16);
  g.fillStyle = '#7f512e'; g.fillRect(0, 308, 400, 110);
  g.strokeStyle = '#5a361d'; g.lineWidth = 3;
  rr(24, 322, 160, 70, 6); g.stroke(); rr(216, 322, 160, 70, 6); g.stroke();
  g.fillStyle = '#d4ac0d'; rr(92, 352, 24, 6, 3); g.fill(); rr(284, 352, 24, 6, 3); g.fill();
  if (desk.items && l < 0.05) {
    // papers
    g.fillStyle = '#fff'; g.save(); g.translate(70, 286); g.rotate(-0.08); g.fillRect(-26, -6, 52, 10); g.fillStyle = '#eee'; g.fillRect(-24, -10, 50, 6); g.restore();
    // stapler
    g.fillStyle = '#c0392b'; rr(118, 278, 34, 12, 5); g.fill(); g.fillStyle = '#333'; g.fillRect(118, 288, 36, 4);
    // nameplate
    g.fillStyle = '#2b2b2b'; g.beginPath(); g.moveTo(150, 296); g.lineTo(160, 272); g.lineTo(240, 272); g.lineTo(250, 296); g.fill();
    g.fillStyle = '#d4ac0d'; g.font = '800 10px system-ui, sans-serif'; g.textAlign = 'center';
    g.fillText(person.def.plate, 200, 288);
    // mug
    g.fillStyle = '#fff'; rr(292, 262, 26, 30, 4); g.fill(); g.strokeStyle = '#333'; g.lineWidth = 2; g.stroke();
    g.beginPath(); g.arc(320, 277, 7, -1.2, 1.2); g.stroke();
    g.fillStyle = '#333'; g.font = '800 6px system-ui, sans-serif'; g.fillText("#1 BOSS", 305, 280);
  }
  g.restore();
}

function drawFeet(t, alpha) {
  g.save(); g.globalAlpha = alpha;
  for (const s of [-1, 1]) {
    const x = 200 + s * 26, wob = Math.sin(t * 9 + s) * 0.15;
    g.save(); g.translate(x, 296); g.rotate(s * 0.25 + wob);
    g.fillStyle = '#222'; g.fillRect(-8, -40, 16, 40);
    g.fillStyle = '#fff'; g.fillRect(-8, -46, 16, 10);
    g.fillStyle = '#111'; rr(-12 + s * 4, -66, 24 + 4, 22, 8); g.fill();
    g.restore();
  }
  g.restore();
}

function drawKOStars(t, x, y) {
  for (let k = 0; k < 4; k++) {
    const a = t * 3 + k * Math.PI / 2;
    g.fillStyle = '#ffd400'; g.strokeStyle = '#b8860b'; g.lineWidth = 1.5;
    star(x + Math.cos(a) * 40, y + Math.sin(a) * 10, 9, 4, 5); g.fill(); g.stroke();
  }
}

function drawParts(dt) {
  for (let i = fx.parts.length - 1; i >= 0; i--) {
    const q = fx.parts[i];
    q.life -= dt; if (q.life <= 0) { fx.parts.splice(i, 1); continue; }
    q.vy += (q.grav === undefined ? 600 : q.grav) * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.rot += q.vr * dt;
    const a = clamp(q.life / q.max * 2, 0, 1);
    g.save(); g.globalAlpha = a; g.translate(q.x, q.y); g.rotate(q.rot);
    switch (q.type) {
      case 'star': g.fillStyle = '#ffd400'; star(0, 0, q.size, q.size * 0.45, 5); g.fill(); break;
      case 'paper': g.fillStyle = '#fff'; g.fillRect(-9, -12, 18, 24); g.fillStyle = '#9ab'; g.fillRect(-6, -7, 12, 2); g.fillRect(-6, -2, 12, 2); break;
      case 'drop': g.fillStyle = '#6e3e19'; circ(0, 0, q.size); g.fill(); break;
      case 'chunk': g.fillStyle = '#5b3b22'; g.fillRect(-q.size, -3, q.size * 2, 6); break;
      case 'smoke': { const r = q.size + (q.max - q.life) * 30; g.fillStyle = 'rgba(200,200,200,.6)'; circ(0, 0, r); g.fill(); break; }
      case 'tooth': g.fillStyle = '#fff'; rr(-4, -5, 8, 10, 3); g.fill(); g.strokeStyle = '#999'; g.lineWidth = 1; g.stroke(); break;
      case 'toupee': {
        g.fillStyle = q.color; ell(0, 0, 34, 12); g.fill();
        g.strokeStyle = shade(q.color, 0.7); g.lineWidth = 1.5;
        for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(-28, k * 3); g.quadraticCurveTo(0, k * 3 - 6, 28, k * 3); g.stroke(); }
        break;
      }
      case 'shard': g.fillStyle = 'rgba(200,230,255,.9)'; g.beginPath(); g.moveTo(0, -5); g.lineTo(5, 4); g.lineTo(-4, 3); g.fill(); break;
      case 'item': drawItem(q.item); break;
    }
    g.restore();
  }
}

function drawItem(kind) {
  if (kind === 'mug') { g.fillStyle = '#fff'; rr(-12, -14, 24, 28, 4); g.fill(); g.strokeStyle = '#333'; g.lineWidth = 2; g.stroke(); g.beginPath(); g.arc(13, 0, 6, -1.2, 1.2); g.stroke(); }
  else if (kind === 'stapler') { g.fillStyle = '#c0392b'; rr(-18, -7, 36, 12, 5); g.fill(); g.fillStyle = '#333'; g.fillRect(-18, 4, 38, 4); }
  else if (kind === 'plate') { g.fillStyle = '#2b2b2b'; g.fillRect(-40, -10, 80, 20); g.fillStyle = '#d4ac0d'; g.fillRect(-30, -2, 60, 4); }
  else if (kind === 'monocle') { g.strokeStyle = '#d4ac0d'; g.lineWidth = 3; circ(0, 0, 12); g.stroke(); }
  else if (kind === 'glasses') { g.strokeStyle = '#111'; g.lineWidth = 2.5; rr(-30, -9, 24, 18, 4); g.stroke(); rr(6, -9, 24, 18, 4); g.stroke(); }
}

function drawWords(dt) {
  for (let i = fx.words.length - 1; i >= 0; i--) {
    const w = fx.words[i];
    w.life -= dt; if (w.life <= 0) { fx.words.splice(i, 1); continue; }
    const age = w.max - w.life, pop = age < 0.12 ? age / 0.12 * 1.25 : 1.25 - Math.min(0.25, (age - 0.12) * 2);
    g.save(); g.globalAlpha = clamp(w.life / 0.25, 0, 1); g.translate(w.x, w.y - age * w.rise); g.rotate(w.rot); g.scale(pop, pop);
    if (w.burst) {
      g.fillStyle = w.bg || '#ffd400'; g.strokeStyle = '#111'; g.lineWidth = 3;
      star(0, 0, w.size * 2.3, w.size * 1.5, 12); g.fill(); g.stroke();
    }
    g.font = '900 ' + w.size + 'px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = w.burst ? 6 : 5; g.strokeStyle = '#111'; g.strokeText(w.text, 0, 0);
    g.fillStyle = w.color; g.fillText(w.text, 0, 0);
    g.restore();
  }
}

function word(text, x, y, opt) {
  opt = opt || {};
  fx.words.push({ text, x, y, life: opt.life || 1.1, max: opt.life || 1.1, size: opt.size || 30, color: opt.color || '#e8202a',
    burst: !!opt.burst, rot: opt.rot !== undefined ? opt.rot : rand(-0.25, 0.25), rise: opt.rise || 20, bg: opt.bg });
}
function burst(type, x, y, n, spread, opt) {
  opt = opt || {};
  for (let k = 0; k < n; k++) {
    const a = opt.dir !== undefined ? opt.dir + rand(-1, 1) * (opt.cone || 1) : rand(0, Math.PI * 2);
    const sp = rand(0.4, 1) * spread;
    fx.parts.push({ type, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (opt.up || 0), rot: rand(0, 6), vr: rand(-10, 10),
      life: opt.life || rand(0.6, 1.1), max: opt.life || 1, size: opt.size || rand(4, 8), grav: opt.grav, color: opt.color, item: opt.item });
  }
}

// ---------- Foreground action animations ----------

function drawAnim(a) {
  const f = clamp(a.t / a.dur, 0, 1);
  const hx = 200 + person.dx * 0.3, hy = 150;
  if (a.type === 'punch') {
    const k = f < 0.45 ? easeOut(f / 0.45) : 1 - easeOut((f - 0.45) / 0.55);
    const x = lerp(250, hx + 8, k), y = lerp(500, hy + 10, k), r = lerp(80, 40, k);
    g.fillStyle = '#2f4f7f'; g.strokeStyle = '#111'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(x - r * 0.7, y + r * 0.5); g.lineTo(x + r * 0.7, y + r * 0.5); g.lineTo(x + r * 1.3, 470); g.lineTo(x - r * 0.4, 470); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#f0b48a'; ell(x, y, r, r * 0.9); g.fill(); g.stroke();
    g.lineWidth = 3; for (let k2 = -1; k2 <= 1; k2++) { g.beginPath(); g.moveTo(x + k2 * r * 0.35, y - r * 0.8); g.lineTo(x + k2 * r * 0.35, y - r * 0.2); g.stroke(); }
  } else if (a.type === 'slap') {
    const k = f < 0.4 ? easeOut(f / 0.4) : 1;
    const x = lerp(470, hx - 40, k), y = lerp(200, hy + 18, k) + (f > 0.4 ? (f - 0.4) * 300 : 0);
    g.save(); g.globalAlpha = f > 0.7 ? 1 - (f - 0.7) / 0.3 : 1; g.translate(x, y); g.rotate(-0.4);
    g.fillStyle = '#f0b48a'; g.strokeStyle = '#111'; g.lineWidth = 3;
    ell(0, 0, 30, 36); g.fill(); g.stroke();
    for (let k2 = 0; k2 < 4; k2++) { ell(-22 + k2 * 14, -40, 6, 18); g.fill(); g.stroke(); }
    ell(34, 4, 16, 7, -0.6); g.fill(); g.stroke();
    g.restore();
    if (f < 0.4) { g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 3; for (let k2 = 0; k2 < 3; k2++) { g.beginPath(); g.moveTo(x + 40, y - 20 + k2 * 18); g.lineTo(x + 90, y - 20 + k2 * 18); g.stroke(); } }
  } else if (a.type === 'gun') {
    let rise = f < 0.25 ? easeOut(f / 0.25) : f > 0.8 ? 1 - (f - 0.8) / 0.2 : 1;
    let recoil = (f > 0.38 && f < 0.55) ? Math.sin((f - 0.38) / 0.17 * Math.PI) : 0;
    const x = 300 + recoil * 10, y = lerp(520, 345, rise) + recoil * 16;
    g.save(); g.translate(x, y); g.rotate(-0.35 - recoil * 0.3);
    g.fillStyle = '#2f4f7f'; g.strokeStyle = '#111'; g.lineWidth = 4; g.fillRect(-10, 30, 60, 200); g.strokeRect(-10, 30, 60, 200);
    g.fillStyle = '#f0b48a'; ell(18, 30, 34, 30); g.fill(); g.stroke();
    g.fillStyle = '#3b3b3b'; g.fillRect(-4, -78, 26, 90); g.strokeRect(-4, -78, 26, 90);
    g.fillStyle = '#555'; g.fillRect(0, -78, 18, 60);
    g.fillStyle = '#6d4426'; rr(-2, 2, 30, 46, 6); g.fill(); g.stroke();
    if (f > 0.38 && f < 0.48) {
      g.fillStyle = '#fff3a0'; star(9, -96, 46, 18, 10); g.fill();
      g.fillStyle = '#ff9a1f'; star(9, -96, 26, 10, 8); g.fill();
    }
    g.restore();
  } else if (a.type === 'coffee' || a.type === 'stapler') {
    if (f < 0.55) {
      const k = f / 0.55;
      const x = lerp(220, hx, k), y = lerp(470, hy, k) - Math.sin(k * Math.PI) * 80, s = lerp(2.2, 1, k);
      g.save(); g.translate(x, y); g.scale(s, s); g.rotate(k * 9);
      drawItem(a.type === 'coffee' ? 'mug' : 'stapler');
      if (a.type === 'coffee') { g.fillStyle = '#6e3e19'; ell(0, -16, 12, 5); g.fill(); }
      g.restore();
    }
  } else if (a.type === 'chair') {
    const k = f < 0.42 ? easeOut(f / 0.42) : 1;
    if (f < 0.5) {
      g.save(); g.translate(-60, 520); g.rotate(lerp(-1.6, 0.15, k));
      g.translate(0, -420);
      g.fillStyle = '#8b5a2b'; g.strokeStyle = '#111'; g.lineWidth = 4;
      g.fillRect(-60, 0, 120, 18); g.strokeRect(-60, 0, 120, 18);
      g.fillRect(-60, -70, 16, 70); g.fillRect(44, -70, 16, 70); g.strokeRect(-60, -70, 16, 70); g.strokeRect(44, -70, 16, 70);
      g.fillRect(-60, -80, 120, 18); g.strokeRect(-60, -80, 120, 18);
      g.fillRect(-56, 18, 12, 80); g.fillRect(44, 18, 12, 80); g.strokeRect(-56, 18, 12, 80); g.strokeRect(44, 18, 12, 80);
      g.restore();
    }
  }
}

// ---------- Main loop ----------

let lastT = performance.now(), clock = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now; clock += dt;
  update(dt);
  render(dt);
  requestAnimationFrame(frame);
}

function update(dt) {
  const p = person;
  p.blinkT -= dt; if (p.blinkT < -0.0) p.blinkT = rand(2, 5);
  p.lookX = Math.sin(clock * 0.7) * 0.6;
  if (p.exprT > 0) { p.exprT -= dt; if (p.exprT <= 0 && !p.ko) p.expr = baseExpr(); }

  if (p.enterT < 1) {
    p.enterT = Math.min(1, p.enterT + dt / 1.1);
    p.dx = 360 * (1 - easeOut(p.enterT)); p.dy = -Math.abs(Math.sin(p.enterT * 14)) * 10 * (1 - p.enterT);
  } else if (p.ko) {
    p.koT = Math.min(1, p.koT + dt / 0.7);
    const e = easeOut(p.koT);
    p.rot = -0.6 * e; p.dy = 170 * e; p.dx = 0;
  } else {
    p.vx += (-p.dx * 70 - p.vx * 9) * dt; p.dx += p.vx * dt;
    p.vy += (-p.dy * 70 - p.vy * 9) * dt; p.dy += p.vy * dt;
    p.vr += (-p.rot * 70 - p.vr * 8) * dt; p.rot += p.vr * dt;
  }
  if (fx.oldPerson) { fx.feetT -= dt; if (fx.feetT <= 0) fx.oldPerson = null; }

  if (desk.t >= 0) {
    desk.t += dt;
    const f = desk.t / 1.1;
    desk.lift = f < 0.3 ? easeOut(f / 0.3) : f < 1 ? Math.max(0, 1 - easeOut((f - 0.3) / 0.7)) * (1 + Math.sin(f * 20) * 0.03) : 0;
    if (f >= 1) { desk.t = -1; desk.lift = 0; }
  }

  // smoke + steam trickles
  if (p.marks.smoke > 0) { p.marks.smoke -= dt; if (Math.random() < 0.3) burst('smoke', 200 + p.dx + rand(-20, 20), 120 + p.dy, 1, 20, { grav: -60, life: 1, size: 6 }); }
  if (p.marks.steam > 0) { p.marks.steam -= dt; if (Math.random() < 0.25) burst('smoke', 200 + p.dx + rand(-40, 40), 150 + p.dy, 1, 15, { grav: -80, life: 0.8, size: 4 }); }

  if (anim) {
    const before = anim.t;
    anim.t += dt;
    if (!anim.hit && anim.t >= anim.dur * anim.impact) { anim.hit = true; anim.onImpact(); }
    if (anim.t >= anim.dur && before < anim.dur) { const done = anim.onDone; anim = null; if (done) done(); }
  }
  fx.shake = Math.max(0, fx.shake - dt * 30);
  fx.flash = Math.max(0, fx.flash - dt * 4);
}

function baseExpr() {
  if (ui.state === 'title') return 'smug';
  const f = person.hp / person.def.hp;
  if (f < 0.35) return 'hurt';
  if (f < 0.75) return 'angry';
  return 'neutral';
}

function render(dt) {
  g.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  g.fillStyle = '#d8ccb0'; g.fillRect(0, 0, view.w, view.h);
  const sx = fx.shake ? rand(-fx.shake, fx.shake) : 0, sy = fx.shake ? rand(-fx.shake, fx.shake) : 0;
  g.translate(view.ox + sx * view.s, view.oy + sy * view.s); g.scale(view.s, view.s);

  drawRoom(clock);
  const p = person;
  if (!p.ko || p.koT < 1) {
    g.save(); g.translate(200 + p.dx, 300 + p.dy); g.rotate(p.rot); drawPersonBody(p); g.restore();
  }
  drawDesk();
  if (!p.ko && p.enterT >= 1 && desk.lift < 0.05) { g.save(); g.translate(200 + p.dx, 300 + p.dy); g.rotate(p.rot * 0.5); drawHands(p); g.restore(); }
  if (p.ko && p.koT >= 0.6) { drawFeet(clock, 1); drawKOStars(clock, 200, 262); }
  if (fx.oldPerson) drawFeet(clock, clamp(fx.feetT / 0.4, 0, 1));

  drawParts(dt);
  if (anim) drawAnim(anim);
  drawWords(dt);
  if (fx.flash > 0) { g.setTransform(view.dpr, 0, 0, view.dpr, 0, 0); g.fillStyle = 'rgba(255,255,255,' + fx.flash * 0.7 + ')'; g.fillRect(0, 0, view.w, view.h); }
}

// ---------- Hits ----------

function impulse(vx, vy, vr) { person.vx += vx; person.vy += vy; person.vr += vr; }
function setExpr(e, t) { person.expr = e; person.exprT = t || 1.4; }

function applyHit(w, mult) {
  const p = person, m = p.marks, hx = 200 + p.dx, hy = 150 + p.dy;
  const dmg = Math.round(ACTIONS[w].dmg * mult);
  p.hp = Math.max(0, p.hp - dmg);
  game.stats.hits++;
  setExpr('hurt', 1.6);
  word(ACTIONS[w].word, hx + rand(-30, 30), hy - 40, { burst: true, size: 30 });
  word('-' + dmg, hx + 60, hy + 10, { size: 20, color: '#fff', life: 0.9, rot: 0, rise: 40 });
  fx.shake = 8; buzz(w === 'gun' || w === 'desk' ? 120 : 60);
  SFX[w]();
  switch (w) {
    case 'gun':
      game.stats.shots++; fx.flash = 1; fx.shake = 14;
      impulse(-120, -80, -9);
      m.bandaids.push(Math.random() < 0.6
        ? { head: true, x: rand(-24, 24), y: rand(-34, -18), r: rand(-0.6, 0.6) }
        : { head: false, x: rand(-50, 50), y: rand(-70, -20), r: rand(-0.6, 0.6) });
      m.smoke = 1.5; burst('star', hx, hy, 8, 260); burst('smoke', hx, hy, 6, 60, { grav: -40, life: 1.2, size: 10 });
      if (!m.broken && (p.def.glasses || p.def.monocle) && Math.random() < 0.6) { m.broken = true; burst('shard', hx + 17, hy - 6, 8, 200); if (p.def.monocle) burst('item', hx + 17, hy - 6, 1, 250, { item: 'monocle', up: 200, life: 1.5 }); }
      break;
    case 'punch':
      m.punches++; impulse(0, 0, Math.random() < 0.5 ? -7 : 7); impulse(rand(-60, 60), -40, 0);
      if (!m.blackEye) m.blackEye = true; else if (!m.bruise) m.bruise = true; else if (!m.toothGone) { m.toothGone = true; burst('tooth', hx, hy + 30, 1, 260, { up: 250, life: 1.5 }); }
      if (m.punches >= 2 && p.def.glasses && !m.broken) { m.broken = true; burst('shard', hx + 17, hy - 6, 6, 200); }
      burst('star', hx, hy, 10, 280);
      break;
    case 'slap':
      m.slap++; game.stats.slaps++; impulse(-180, 0, -8);
      burst('star', hx - 30, hy + 15, 5, 180);
      break;
    case 'coffee':
      game.stats.coffee++; impulse(0, -40, rand(-4, 4));
      for (let k = 0; k < 3; k++) m.coffee.push({ x: rand(-60, 60), y: rand(-85, -10), r: rand(8, 16), a: rand(0, 3) });
      m.steam = 3; burst('drop', hx, hy, 26, 330, { up: 120 });
      burst('item', hx, hy, 1, 120, { item: 'mug', up: 300, life: 1.4 });
      break;
    case 'stapler':
      m.bump = Math.min(3, m.bump + 1); impulse(0, 50, rand(-5, 5));
      burst('star', hx, hy - 50, 8, 200); burst('item', hx, hy - 50, 1, 150, { item: 'stapler', up: 400, life: 1.4 });
      break;
    case 'desk':
      game.stats.flips++; m.tieCut = true; impulse(-60, 60, -10); fx.shake = 16;
      desk.t = 0; desk.items = false;
      burst('paper', 200, 280, 14, 380, { up: 300, life: 1.6, grav: 400 });
      burst('item', 305, 270, 1, 200, { item: 'mug', up: 300, life: 1.4 });
      burst('item', 135, 284, 1, 200, { item: 'stapler', up: 300, life: 1.4 });
      burst('item', 200, 284, 1, 160, { item: 'plate', up: 350, life: 1.4 });
      break;
    case 'chair':
      m.bump = Math.min(3, m.bump + 1); m.bandaids.push({ head: true, x: rand(-20, 20), y: -40, r: rand(-0.5, 0.5) });
      impulse(80, 80, 8); fx.shake = 12;
      burst('chunk', hx, hy - 30, 14, 360, { up: 200, life: 1.3, size: 12 });
      burst('star', hx, hy - 40, 8, 220);
      break;
  }
  if (p.def.hair === 'combover' && !m.toupeeLost && p.hp / p.def.hp < 0.55) {
    m.toupeeLost = true; burst('toupee', hx, hy - 40, 1, 180, { up: 420, life: 1.8, color: p.def.hairColor });
    word('TOUPEE!', hx, hy - 90, { size: 18, color: '#ffd400', life: 1.4 });
  }
  if (p.def.hair === 'bun' && p.hp / p.def.hp < 0.6) m.messy = true;
  renderHud();
}

// ---------- UI ----------

const $ = id => document.getElementById(id);
const elWho = $('who'), elLine = $('line'), elAns = $('answers');
let typer = null;

function say(who, text, isYou) {
  elWho.textContent = who; elWho.className = isYou ? 'you' : '';
  clearInterval(typer);
  let i = 0;
  elLine.textContent = '';
  typer = setInterval(() => {
    i += 2; elLine.textContent = text.slice(0, i);
    if (i >= text.length) clearInterval(typer);
  }, 28);
  elLine.dataset.full = text;
}
$('speech').addEventListener('click', () => { clearInterval(typer); if (elLine.dataset.full) elLine.textContent = elLine.dataset.full; });

function fmt(s) { return s.replace(/\{o\}/g, person.def.o).replace(/\{p\}/g, person.def.p); }

function renderHud() {
  const p = person;
  $('hud-name').textContent = p.def.name;
  $('hud-title').textContent = p.def.title;
  $('hp-fill').style.width = (p.hp / p.def.hp * 100) + '%';
  $('hire-fill').style.width = game.hire + '%';
  $('hire-num').textContent = Math.round(game.hire) + '%';
  $('hud-q').textContent = 'Q ' + Math.min(game.q + 1, MAX_Q) + '/' + MAX_Q;
  $('hud-chaos').textContent = 'Chaos ' + game.chaos;
}

function setButtons(list) {
  elAns.innerHTML = '';
  for (const b of list) {
    const el = document.createElement('button');
    el.textContent = b.text; el.className = b.cls || '';
    el.addEventListener('click', () => { SFX.click(); lockButtons(); b.fn(); });
    elAns.appendChild(el);
  }
}
function lockButtons() { for (const b of elAns.querySelectorAll('button')) b.disabled = true; }
function nextButton(label, fn) { setButtons([{ text: label, cls: 'next', fn }]); }

function changeHire(d) {
  game.hire = clamp(game.hire + d, 0, 100);
  if (d) word((d > 0 ? '+' : '') + d + '% HIRE', 200, 70, { size: 18, color: d > 0 ? '#2ecc71' : '#ff5a5a', life: 1.2, rot: 0, rise: 30 });
  renderHud();
}

function askNext() {
  if (game.q >= MAX_Q) return endGame();
  ui.state = 'asking';
  desk.items = true;
  let pool = QUESTIONS.map((_, i) => i).filter(i => !game.used.has(i));
  if (!pool.length) { game.used.clear(); pool = QUESTIONS.map((_, i) => i); }
  const qi = pick(pool); game.used.add(qi);
  const Q = QUESTIONS[qi];
  renderHud();
  person.expr = baseExpr();
  say(person.def.name, Q.q);

  const talk = shuffle(Q.a.slice()).slice(0, 2).map(a => ({ text: a[0], fn: () => answerTalk(a) }));
  const acts = [];
  if (Q.v) for (const [w, t] of Q.v) acts.push({ w, text: fmt(t) });
  let others = shuffle(HIT_ORDER.filter(w => !acts.some(a => a.w === w)));
  // The gun is the headline act, so it turns up more often than the rest.
  if (others.includes('gun') && Math.random() < 0.55) others = ['gun'].concat(others.filter(w => w !== 'gun'));
  while (acts.length < 2) { const w = others.shift(); acts.push({ w, text: fmt(ACTIONS[w].label) }); }
  const actBtns = acts.slice(0, 2).map(a => ({ text: a.text, cls: 'act' + (a.w === 'gun' ? ' gun' : ''), fn: () => answerAct(a.w, a.text) }));
  setButtons(shuffle(talk.concat(actBtns)));
}

function answerTalk(a) {
  game.stats.talk++; game.streak = 0;
  say('You', a[0], true);
  setTimeout(() => {
    const d = a[1];
    setExpr(d >= 8 ? 'happy' : d < 0 ? 'angry' : 'smug', 2.5);
    say(person.def.name, a[2]);
    changeHire(d);
    d > 0 ? SFX.good() : d < 0 ? SFX.bad() : 0;
    game.q++;
    nextButton(game.q >= MAX_Q ? 'See the result ▶' : 'Next question ▶', askNext);
  }, 900);
}

function answerAct(w, text) {
  ui.state = 'busy';
  game.streak++;
  const mult = 1 + Math.min(game.streak - 1, 4) * 0.15;
  say('You', text.replace(/^\S+\s/, ''), true);
  setExpr('shocked', 3);
  const dur = { gun: 1.3, punch: 0.6, slap: 0.55, coffee: 0.9, stapler: 0.8, desk: 0.5, chair: 0.8 }[w];
  const impact = { gun: 0.4, punch: 0.45, slap: 0.4, coffee: 0.55, stapler: 0.55, desk: 0.1, chair: 0.42 }[w];
  if (w !== 'gun' && w !== 'desk') setTimeout(SFX.whoosh, 30);
  anim = { type: w, t: -0.35, dur, impact, hit: false,
    onImpact() {
      applyHit(w, mult);
      const pts = Math.round(ACTIONS[w].dmg * mult);
      game.chaos += pts;
      if (game.streak >= 2) word('RAMPAGE x' + game.streak, 200, 40, { size: 20, color: '#ff8c1a', life: 1.3, rot: 0 });
      renderHud();
    },
    onDone() { setTimeout(() => afterHit(w), 450); } };
}

function afterHit(w) {
  const p = person;
  game.q++;
  if (p.hp <= 0) return knockOut();
  let line, d;
  if (Math.random() < 0.18) { line = pick(p.def.impressed); d = 10; setExpr('smug', 2.5); }
  else { line = Math.random() < 0.5 ? pick(WEAPON_LINES[w]) : pick(p.def.hits); d = -8; setExpr('angry', 2.5); }
  say(p.def.name, line);
  changeHire(d);
  nextButton(game.q >= MAX_Q ? 'See the result ▶' : 'Next question ▶', askNext);
}

function knockOut() {
  const p = person;
  p.ko = true; p.koT = 0; p.expr = 'ko'; p.exprT = 0;
  game.kos++; game.chaos += 50;
  SFX.ko(); buzz(200);
  word('K.O.!', 200, 150, { burst: true, size: 44, color: '#fff', bg: '#e8202a', life: 1.8, rot: -0.1 });
  say(p.def.name, p.def.ko);
  renderHud();
  setTimeout(() => {
    if (game.kos >= CHARS.length) { nextButton('See the result ▶', endGame); return; }
    nextButton('Uh oh. Someone\'s coming... ▶', nextInterviewer);
  }, 1200);
}

function nextInterviewer() {
  fx.oldPerson = person; fx.feetT = 0.5;
  person = newPerson(game.kos, true);
  desk.items = true;
  SFX.ding();
  renderHud();
  setTimeout(() => {
    setExpr('angry', 3);
    say(person.def.name, person.def.intro);
    nextButton(game.q >= MAX_Q ? 'See the result ▶' : 'Continue the interview ▶', askNext);
  }, 1100);
}

const RANKS = [[0, 'Unemployed'], [150, 'Intern'], [300, 'Middle Manager'], [500, 'Corporate Menace'], [700, 'Hostile Takeover Specialist']];

function endGame() {
  ui.state = 'ended';
  const s = game.stats, h = Math.round(game.hire);
  let stamp, cls, text;
  if (game.kos >= CHARS.length) {
    stamp = 'HOSTILE TAKEOVER'; cls = 'boss'; SFX.cheer();
    text = "With the entire management chain unconscious behind one desk, you are technically the CEO now. Your first act: casual Friday, every day.";
  } else if (h >= 70) {
    stamp = game.chaos > 0 ? 'HIRED... SOMEHOW' : 'HIRED!'; cls = ''; SFX.cheer();
    text = game.chaos > 0
      ? person.def.name.split(' ')[0] + ", holding an ice pack: \"We love a self-starter. You start Monday. Please leave the gun at home.\""
      : "A flawless, polite interview. You start Monday. Somewhere, deep down, you wonder what might have been.";
  } else if (game.chaos >= 100) {
    stamp = 'ESCORTED OUT'; cls = 'bad'; SFX.boo();
    text = "Two security guards walk you to the lift. On the way out you take a free biscuit. You've earned it.";
  } else if (h >= 40) {
    stamp = "WE'LL BE IN TOUCH"; cls = 'meh'; SFX.boo();
    text = "\"We'll be in touch.\" They will not be in touch.";
  } else {
    stamp = 'REJECTED'; cls = 'bad'; SFX.boo();
    text = "\"Thanks for coming in. We've decided to go with someone who answered the questions.\"";
  }
  const score = game.chaos + h * 2 + game.kos * 100;
  let best = 0; try { best = +localStorage.getItem('jis-best') || 0; if (score > best) localStorage.setItem('jis-best', score); } catch (e) { /* no storage */ }
  const rank = RANKS.filter(r => score >= r[0]).pop()[1];
  $('end-stamp').textContent = stamp; $('end-stamp').className = 'stamp ' + cls;
  $('end-text').textContent = text;
  $('end-stats').innerHTML = [
    ['Hire chance', h + '%'], ['Knockouts', game.kos], ['Hits landed', s.hits], ['Shots fired', s.shots],
    ['Coffees thrown', s.coffee], ['Desks flipped', s.flips], ['Slaps', s.slaps], ['Polite answers', s.talk],
  ].map(([k, v]) => '<div>' + k + '<b>' + v + '</b></div>').join('');
  $('end-score').innerHTML = 'Score ' + score + (score > best ? ' — NEW BEST!' : '') + '<small>Rank: ' + rank + '</small>';
  $('title-card').classList.add('hidden'); $('end-card').classList.remove('hidden'); $('overlay').classList.remove('hidden');
}

function startGame() {
  ac();
  resetGame();
  ui.state = 'intro';
  $('overlay').classList.add('hidden');
  renderHud();
  setExpr('happy', 2);
  say(person.def.name, person.def.intro);
  nextButton('Sit down ▶', askNext);
}

// Tap the interviewer for a quick cheap slap.
cvs.addEventListener('pointerdown', ev => {
  if (ui.state !== 'asking' || anim || person.ko || person.enterT < 1) return;
  const r = cvs.getBoundingClientRect();
  const x = (ev.clientX - r.left - view.ox) / view.s, y = (ev.clientY - r.top - view.oy) / view.s;
  const hx = 200 + person.dx, hy = 150 + person.dy;
  const onHead = Math.hypot(x - hx, (y - hy) * 0.9) < 60, onBody = Math.abs(x - hx) < 95 && y > 200 && y < 300;
  if (!onHead && !onBody) return;
  const now = performance.now(); if (now - lastTap < 220) return; lastTap = now;
  ac();
  person.hp = Math.max(1, person.hp - 3); game.chaos += 3; game.stats.slaps++; game.stats.hits++;
  person.marks.slap++;
  game.hire = clamp(game.hire - 1, 0, 100);
  impulse(x < hx ? 140 : -140, 0, x < hx ? 6 : -6);
  setExpr('hurt', 0.6); SFX.slap(); buzz(25);
  burst('star', x, y, 4, 160);
  word(pick(['SLAP!', 'THWAP!', 'SMACK!', 'OI!']), x, y - 20, { size: 20, life: 0.7 });
  if (Math.random() < 0.3) word(pick(['Stop that!', 'Please!', 'OW!', 'Seriously?!', 'Rude!']), hx, hy - 75, { size: 14, color: '#fff', life: 1, rot: 0 });
  renderHud();
});

$('start').addEventListener('click', startGame);
$('again').addEventListener('click', startGame);
$('mute').addEventListener('click', () => {
  audio.muted = !audio.muted; $('mute').textContent = audio.muted ? '🔇' : '🔊';
  try { localStorage.setItem('jis-muted', audio.muted ? '1' : ''); } catch (e) { /* no storage */ }
});
document.addEventListener('visibilitychange', () => {
  if (!audio.ctx) return;
  if (document.hidden) audio.ctx.suspend(); else audio.ctx.resume();
});

// ---------- Boot ----------

try {
  audio.muted = localStorage.getItem('jis-muted') === '1'; $('mute').textContent = audio.muted ? '🔇' : '🔊';
  const best = +localStorage.getItem('jis-best') || 0;
  if (best) $('best').textContent = 'Best score: ' + best;
} catch (e) { /* no storage */ }
resetGame();
person.expr = 'smug';
renderHud();
say('Gary Pemberton', 'Next candidate, please!');
resize();
requestAnimationFrame(frame);
