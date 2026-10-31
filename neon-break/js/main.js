// Neon Break: drawing, controls, sound, game flow and menus.
'use strict';
(function () {
  var P = NB.phys, RU = NB.rules, W = P.W, H = P.H, R = P.R;
  var RAIL = 38;
  var host = window.AndroidHost || null;
  var $ = function (id) { return document.getElementById(id); };

  // ---- Shop items --------------------------------------------------------
  var FELTS = [
    { id: 'emerald', name: 'Emerald', price: 0, felt: '#0f8a5f', mid: '#18b57d', cush: '#0a5d41', rail: '#2b1a10', rail2: '#4a2c18', glow: '#3ff6ff' },
    { id: 'midnight', name: 'Midnight', price: 200, felt: '#1640a8', mid: '#2e68ff', cush: '#0e2b78', rail: '#10132a', rail2: '#262c55', glow: '#ff3fbf' },
    { id: 'crimson', name: 'Crimson', price: 350, felt: '#9b1030', mid: '#d8204a', cush: '#660a1e', rail: '#1a0b10', rail2: '#3a1622', glow: '#ffe14a' },
    { id: 'haze', name: 'Purple Haze', price: 500, felt: '#5216a0', mid: '#8236e6', cush: '#350c6c', rail: '#130a22', rail2: '#2b1848', glow: '#3ff6ff' },
    { id: 'grid', name: 'Neon Grid', price: 900, felt: '#0d0a2a', mid: '#1d165a', cush: '#07051a', rail: '#05040f', rail2: '#141033', glow: '#ff3fbf', pattern: 'grid' },
    { id: 'galaxy', name: 'Galaxy', price: 1600, felt: '#0e0828', mid: '#2e1868', cush: '#08051a', rail: '#07041a', rail2: '#1b1240', glow: '#b98bff', pattern: 'stars' }
  ];
  var CUES = [
    { id: 'classic', name: 'Classic Maple', price: 0, shaft: '#ecc98e', butt: '#5b2c12', band: '#111111', glow: null, guide: '#ffffff' },
    { id: 'bubble', name: 'Bubblegum', price: 150, shaft: '#ffd6f0', butt: '#ff3fbf', band: '#ffffff', glow: '#ff3fbf', guide: '#ff9ad9' },
    { id: 'ice', name: 'Ice Blade', price: 300, shaft: '#e2fbff', butt: '#22c8ff', band: '#ffffff', glow: '#3ff6ff', guide: '#9ff8ff' },
    { id: 'toxic', name: 'Toxic', price: 500, shaft: '#e9ffdc', butt: '#2bdc78', band: '#0b0820', glow: '#4dff9a', guide: '#a6ffc9' },
    { id: 'gold', name: 'Golden Break', price: 900, shaft: '#fff3b8', butt: '#d9a400', band: '#5a3d00', glow: '#ffe14a', guide: '#ffe98a' },
    { id: 'laser', name: 'Laser', price: 1400, shaft: '#1a1a24', butt: '#0b0b12', band: '#ff2a4a', glow: '#ff2a4a', guide: '#ff6b81' },
    { id: 'rainbow', name: 'Rainbow', price: 2400, shaft: '#ffffff', butt: '#ff3fbf', band: '#ffffff', glow: 'rainbow', guide: 'rainbow' }
  ];
  var CPU_COINS = { easy: 40, medium: 90, hard: 180 };
  var CPU_NAMES = { easy: 'Rookie', medium: 'Hustler', hard: 'Shark' };

  // ---- Save --------------------------------------------------------------
  var SAVE_KEY = 'neon-break-v1';
  var save = {
    coins: 50, cues: ['classic'], felts: ['emerald'], cue: 'classic', felt: 'emerald',
    sound: true, vibe: true,
    stats: { easy: [0, 0], medium: [0, 0], hard: [0, 0], blitzBest: 0, twoPlayer: 0 }
  };
  (function load() {
    var raw = null;
    try { raw = host && host.load ? host.load() : null; } catch (e) { raw = null; }
    if (!raw) { try { raw = localStorage.getItem(SAVE_KEY); } catch (e) { raw = null; } }
    if (!raw) return;
    try {
      var d = JSON.parse(raw);
      for (var k in d) if (Object.prototype.hasOwnProperty.call(save, k)) save[k] = d[k];
      ['easy', 'medium', 'hard'].forEach(function (l) { if (!save.stats[l]) save.stats[l] = [0, 0]; });
    } catch (e) { /* keep defaults */ }
  })();
  function persist() {
    var s = JSON.stringify(save);
    try { localStorage.setItem(SAVE_KEY, s); } catch (e) { /* storage blocked */ }
    try { if (host && host.save) host.save(s); } catch (e) { /* ignore */ }
  }
  function felt() { return FELTS.filter(function (f) { return f.id === save.felt; })[0] || FELTS[0]; }
  function cueItem() { return CUES.filter(function (c) { return c.id === save.cue; })[0] || CUES[0]; }

  // ---- Sound -------------------------------------------------------------
  var actx = null, noiseBuf = null, master = null, soundsThisFrame = 0;
  function audio() {
    if (!save.sound) return null;
    if (!actx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      actx = new AC();
      master = actx.createGain(); master.gain.value = 0.8; master.connect(actx.destination);
      noiseBuf = actx.createBuffer(1, actx.sampleRate * 0.5, actx.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }
  function tone(freq, dur, vol, type, when, slideTo) {
    var a = audio(); if (!a) return;
    var t = a.currentTime + (when || 0);
    var o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, freq, q, when) {
    var a = audio(); if (!a) return;
    var t = a.currentTime + (when || 0);
    var s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    s.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q || 1;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random() * 0.3); s.stop(t + dur + 0.02);
  }
  var sfx = {
    clack: function (v) { if (soundsThisFrame++ > 6) return; tone(2300 + Math.random() * 900, 0.045, 0.5 * v, 'sine'); noise(0.02, 0.35 * v, 4200, 2); },
    rail: function (v) { if (soundsThisFrame++ > 6) return; tone(150, 0.1, 0.4 * v, 'triangle', 0, 90); noise(0.04, 0.15 * v, 600, 1); },
    pocket: function () { tone(120, 0.22, 0.5, 'sine', 0, 55); [0.05, 0.11, 0.16].forEach(function (w, i) { tone(1400 - i * 300, 0.03, 0.15, 'square', w); }); },
    cue: function (p) { noise(0.06, 0.25 + 0.5 * p, 1400, 1.5); tone(600 + 400 * p, 0.05, 0.25, 'triangle'); },
    blip: function () { tone(880, 0.06, 0.15, 'square'); },
    tick: function () { tone(1500 + Math.random() * 100, 0.015, 0.06, 'square'); },
    foul: function () { tone(220, 0.25, 0.25, 'sawtooth', 0, 110); },
    combo: function (m) { tone(660 * Math.pow(1.12, m), 0.12, 0.2, 'square'); tone(990 * Math.pow(1.12, m), 0.16, 0.15, 'square', 0.06); },
    win: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.25, 0.22, 'square', i * 0.11); }); },
    lose: function () { [392, 330, 262].forEach(function (f, i) { tone(f, 0.3, 0.2, 'triangle', i * 0.16); }); }
  };
  function buzz(ms) {
    if (!save.vibe) return;
    try {
      if (host && host.vibrate) host.vibrate(ms);
      else if (navigator.vibrate) navigator.vibrate(ms);
    } catch (e) { /* no motor */ }
  }

  // ---- Canvas and layout ---------------------------------------------------
  var cv = $('table'), ctx = cv.getContext('2d');
  var dpr = 1, cssW = 0, cssH = 0, sc = 1, offX = 0, offY = 0, clipTop = 0, clipBot = 0;
  var tableImg = document.createElement('canvas');
  var inGame = false;

  function layout() {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    cssW = window.innerWidth; cssH = window.innerHeight;
    cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
    var top = 8, bottom = 8;
    if (inGame) {
      top = $('hud').getBoundingClientRect().bottom + 8;
      bottom = cssH - $('controls').getBoundingClientRect().top + 8;
    }
    var aw = cssW - 12, ah = cssH - top - bottom;
    clipTop = inGame ? top - 4 : 0; clipBot = inGame ? cssH - bottom + 4 : cssH;
    sc = Math.min(aw / (W + 2 * RAIL), ah / (H + 2 * RAIL));
    offX = (cssW - (W + 2 * RAIL) * sc) / 2 + RAIL * sc;
    offY = top + (ah - (H + 2 * RAIL) * sc) / 2 + RAIL * sc;
    drawTableImage();
    spriteSize = 0; // force ball sprites to redraw at the new size
  }

  function drawTableImage() {
    var f = felt();
    var tw = (W + 2 * RAIL) * sc, th = (H + 2 * RAIL) * sc;
    tableImg.width = Math.ceil(tw * dpr) + 40; tableImg.height = Math.ceil(th * dpr) + 40;
    var c = tableImg.getContext('2d');
    c.setTransform(dpr * sc, 0, 0, dpr * sc, 20 + RAIL * sc * dpr, 20 + RAIL * sc * dpr);
    // Rails with a neon tube around them.
    c.save();
    c.shadowColor = f.glow; c.shadowBlur = 22 * dpr;
    roundRect(c, -RAIL, -RAIL, W + 2 * RAIL, H + 2 * RAIL, 26);
    var g = c.createLinearGradient(-RAIL, 0, W + RAIL, 0);
    g.addColorStop(0, f.rail2); g.addColorStop(0.5, f.rail); g.addColorStop(1, f.rail2);
    c.fillStyle = g; c.fill();
    c.restore();
    c.lineWidth = 3; c.strokeStyle = f.glow; c.globalAlpha = 0.9;
    roundRect(c, -RAIL + 2, -RAIL + 2, W + 2 * RAIL - 4, H + 2 * RAIL - 4, 24); c.stroke();
    c.globalAlpha = 1;
    // Cushion rubber.
    c.fillStyle = f.cush;
    c.fillRect(-15, -15, W + 30, H + 30);
    // Playing surface (follows the cushion noses into the pocket mouths).
    var Mm = P.M, S = P.S;
    var pts = [[Mm - 13, -20], [Mm, 0], [W - Mm, 0], [W - Mm + 13, -20], [W + 20, Mm - 13], [W, Mm], [W, H / 2 - S], [W + 18, H / 2 - S + 6],
      [W + 18, H / 2 + S - 6], [W, H / 2 + S], [W, H - Mm], [W + 20, H - Mm + 13], [W - Mm + 13, H + 20], [W - Mm, H], [Mm, H], [Mm - 13, H + 20],
      [-20, H - Mm + 13], [0, H - Mm], [0, H / 2 + S], [-18, H / 2 + S - 6], [-18, H / 2 - S + 6], [0, H / 2 - S], [0, Mm], [-20, Mm - 13]];
    c.beginPath();
    pts.forEach(function (p, i) { if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); });
    c.closePath();
    var rg = c.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, H * 0.62);
    rg.addColorStop(0, f.mid); rg.addColorStop(1, f.felt);
    c.fillStyle = rg; c.fill();
    c.save(); c.clip();
    if (f.pattern === 'grid') {
      c.strokeStyle = 'rgba(255, 63, 191, 0.22)'; c.lineWidth = 1.2;
      for (var x = 0; x <= W; x += 50) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
      for (var y = 0; y <= H; y += 50) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
    } else if (f.pattern === 'stars') {
      var seed = 7;
      var rnd = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      for (var i = 0; i < 260; i++) {
        c.fillStyle = 'rgba(255,255,255,' + (0.15 + rnd() * 0.6) + ')';
        c.beginPath(); c.arc(rnd() * W, rnd() * H, rnd() * 1.6 + 0.3, 0, 7); c.fill();
      }
      var neb = c.createRadialGradient(W * 0.3, H * 0.35, 10, W * 0.3, H * 0.35, 260);
      neb.addColorStop(0, 'rgba(255, 63, 191, 0.25)'); neb.addColorStop(1, 'rgba(255, 63, 191, 0)');
      c.fillStyle = neb; c.fillRect(0, 0, W, H);
      neb = c.createRadialGradient(W * 0.7, H * 0.7, 10, W * 0.7, H * 0.7, 280);
      neb.addColorStop(0, 'rgba(63, 246, 255, 0.2)'); neb.addColorStop(1, 'rgba(63, 246, 255, 0)');
      c.fillStyle = neb; c.fillRect(0, 0, W, H);
    }
    // Head string and spots.
    c.strokeStyle = 'rgba(255,255,255,0.13)'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(0, P.HEAD_Y); c.lineTo(W, P.HEAD_Y); c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.3)';
    c.beginPath(); c.arc(P.FOOT.x, P.FOOT.y, 3, 0, 7); c.fill();
    c.beginPath(); c.arc(W / 2, P.HEAD_Y, 2.5, 0, 7); c.fill();
    c.restore();
    // Cushion nose highlight.
    c.strokeStyle = 'rgba(255,255,255,0.08)'; c.lineWidth = 2;
    P.segs.forEach(function (s) { c.beginPath(); c.moveTo(s[0], s[1]); c.lineTo(s[2], s[3]); c.stroke(); });
    // Pockets.
    P.pockets.forEach(function (p, i) {
      var r = i === 2 || i === 3 ? 22 : 25;
      var px = p.x + (i === 2 ? -4 : i === 3 ? 4 : 0), py = p.y;
      c.fillStyle = '#000';
      c.beginPath(); c.arc(px, py, r + 4, 0, 7); c.fillStyle = 'rgba(0,0,0,0.5)'; c.fill();
      var pg = c.createRadialGradient(px, py, 2, px, py, r);
      pg.addColorStop(0, '#000'); pg.addColorStop(0.75, '#05030c'); pg.addColorStop(1, '#1d1530');
      c.fillStyle = pg; c.beginPath(); c.arc(px, py, r, 0, 7); c.fill();
      c.strokeStyle = f.glow; c.globalAlpha = 0.35; c.lineWidth = 2; c.stroke(); c.globalAlpha = 1;
    });
    // Diamonds.
    c.fillStyle = 'rgba(255,255,255,0.55)';
    for (var k = 1; k < 4; k++) { diamond(c, (W * k) / 4, -RAIL / 2 - 4); diamond(c, (W * k) / 4, H + RAIL / 2 + 4); }
    for (k = 1; k < 8; k++) { if (k === 4) continue; diamond(c, -RAIL / 2 - 4, (H * k) / 8); diamond(c, W + RAIL / 2 + 4, (H * k) / 8); }
  }
  function diamond(c, x, y) { c.beginPath(); c.moveTo(x, y - 4); c.lineTo(x + 3, y); c.lineTo(x, y + 4); c.lineTo(x - 3, y); c.closePath(); c.fill(); }
  function roundRect(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }

  // ---- Balls: rendered per pixel so they really roll -----------------------
  var COLORS = { 1: [255, 205, 0], 2: [30, 84, 255], 3: [240, 32, 40], 4: [130, 40, 220], 5: [255, 120, 0], 6: [0, 170, 85], 7: [150, 22, 44], 8: [18, 18, 22] };
  function ballRGB(n) { return n === 0 ? [250, 248, 240] : COLORS[n > 8 ? n - 8 : n]; }
  function ballCss(n) { var c = ballRGB(n); return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')'; }
  var spriteSize = 0;
  var LX = -0.42, LY = -0.62, LZ = 0.66; // light direction
  (function () { var l = Math.sqrt(LX * LX + LY * LY + LZ * LZ); LX /= l; LY /= l; LZ /= l; })();
  var HX = LX, HY = LY, HZ = LZ + 1;
  (function () { var l = Math.sqrt(HX * HX + HY * HY + HZ * HZ); HX /= l; HY /= l; HZ /= l; })();

  function randomRot(tilt) {
    var m = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    m = rotate(m, 0, 0, 1, Math.random() * Math.PI * 2);
    var a = Math.random() * Math.PI * 2;
    return rotate(m, Math.cos(a), Math.sin(a), 0, (Math.random() - 0.5) * tilt);
  }
  // m is row-major, maps the ball's own axes to screen axes. Rotate about unit axis (x,y,z).
  function rotate(m, x, y, z, ang) {
    var c = Math.cos(ang), s = Math.sin(ang), t = 1 - c;
    var r = [t * x * x + c, t * x * y - s * z, t * x * z + s * y,
      t * x * y + s * z, t * y * y + c, t * y * z - s * x,
      t * x * z - s * y, t * y * z + s * x, t * z * z + c];
    var o = new Array(9);
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) o[i * 3 + j] = r[i * 3] * m[j] + r[i * 3 + 1] * m[3 + j] + r[i * 3 + 2] * m[6 + j];
    return o;
  }
  function orthonormalize(m) {
    var ax = [m[0], m[3], m[6]], ay = [m[1], m[4], m[7]];
    var l = Math.hypot(ax[0], ax[1], ax[2]); ax = ax.map(function (v) { return v / l; });
    var d = ax[0] * ay[0] + ax[1] * ay[1] + ax[2] * ay[2];
    ay = [ay[0] - d * ax[0], ay[1] - d * ax[1], ay[2] - d * ax[2]];
    l = Math.hypot(ay[0], ay[1], ay[2]); ay = ay.map(function (v) { return v / l; });
    var az = [ax[1] * ay[2] - ax[2] * ay[1], ax[2] * ay[0] - ax[0] * ay[2], ax[0] * ay[1] - ax[1] * ay[0]];
    return [ax[0], ay[0], az[0], ax[1], ay[1], az[1], ax[2], ay[2], az[2]];
  }

  function sprite(b) {
    var size = Math.max(8, Math.round(2 * R * sc * dpr));
    if (!b.spr || b.spr.size !== size) {
      var c = document.createElement('canvas'); c.width = c.height = size;
      b.spr = { cv: c, ctx: c.getContext('2d'), size: size, dirty: true, img: null };
      b.spr.img = b.spr.ctx.createImageData(size, size);
    }
    if (!b.rot) b.rot = randomRot(b.n === 0 ? 3 : 0.7);
    if (b.spr.dirty) paintBall(b);
    return b.spr.cv;
  }

  function paintBall(b) {
    var s = b.spr, size = s.size, data = s.img.data, m = b.rot, half = size / 2;
    var base = ballRGB(b.n), stripe = b.n > 8, cue = b.n === 0;
    var m0 = m[0], m1 = m[1], m2 = m[2], m3 = m[3], m4 = m[4], m5 = m[5], m6 = m[6], m7 = m[7], m8 = m[8];
    var idx = 0;
    for (var py = 0; py < size; py++) {
      var ny = (py + 0.5 - half) / half;
      for (var px = 0; px < size; px++, idx += 4) {
        var nx = (px + 0.5 - half) / half;
        var r2 = nx * nx + ny * ny;
        if (r2 >= 1) { data[idx + 3] = 0; continue; }
        var nz = Math.sqrt(1 - r2);
        // Screen normal -> the ball's own coordinates (transpose of m).
        var ly = m1 * nx + m4 * ny + m7 * nz;
        var lz = m2 * nx + m5 * ny + m8 * nz;
        var cr, cg, cb;
        if (cue) {
          var lx = m0 * nx + m3 * ny + m6 * nz;
          if ((lz > 0.965 || lz < -0.965) || (lx > 0.97 || lx < -0.97)) { cr = 230; cg = 40; cb = 60; }
          else { cr = base[0]; cg = base[1]; cb = base[2]; }
        } else if (lz > 0.86 || lz < -0.86) { cr = 252; cg = 250; cb = 242; }
        else if (stripe && (ly > 0.58 || ly < -0.58)) { cr = 250; cg = 248; cb = 240; }
        else { cr = base[0]; cg = base[1]; cb = base[2]; }
        var diff = nx * LX + ny * LY + nz * LZ; if (diff < 0) diff = 0;
        var sh = 0.32 + 0.78 * diff;
        var sp = nx * HX + ny * HY + nz * HZ; sp = sp > 0 ? Math.pow(sp, 46) : 0;
        var rim = 1 - 0.25 * Math.pow(r2, 3);
        var spec = sp * 255 * 0.95;
        cr = cr * sh * rim + spec; cg = cg * sh * rim + spec; cb = cb * sh * rim + spec;
        data[idx] = cr > 255 ? 255 : cr; data[idx + 1] = cg > 255 ? 255 : cg; data[idx + 2] = cb > 255 ? 255 : cb;
        var edge = (1 - Math.sqrt(r2)) * half * 1.4;
        data[idx + 3] = edge >= 1 ? 255 : edge * 255;
      }
    }
    s.ctx.putImageData(s.img, 0, 0);
    // The number, drawn where the ball's number spot faces us.
    if (!cue) {
      var az = m8, sgn = az >= 0 ? 1 : -1;
      if (az * sgn > 0.32) {
        var cx = half + m2 * sgn * half * 0.98, cy = half + m5 * sgn * half * 0.98;
        var c = s.ctx;
        c.save();
        c.translate(cx, cy);
        c.rotate(Math.atan2(m3, m0));
        var squash = Math.max(0.25, az * sgn);
        c.scale(1, squash);
        c.globalAlpha = Math.min(1, (az * sgn - 0.32) * 4);
        c.fillStyle = '#16131c';
        c.font = '900 ' + Math.round(size * 0.36) + 'px system-ui, sans-serif';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(String(b.n), 0, size * 0.02);
        c.restore();
      }
    }
    s.dirty = false;
  }

  // Roll a ball's texture to match how far it moved.
  function rollBall(b) {
    if (b.lx == null) { b.lx = b.x; b.ly = b.y; return; }
    var dx = b.x - b.lx, dy = b.y - b.ly, d = Math.sqrt(dx * dx + dy * dy);
    b.lx = b.x; b.ly = b.y;
    if (d < 0.05 || d > 200) return;
    if (!b.rot) b.rot = randomRot(0.7);
    b.rot = rotate(b.rot, -dy / d, dx / d, 0, d / R);
    if ((b.rc = (b.rc || 0) + 1) % 30 === 0) b.rot = orthonormalize(b.rot);
    if (b.spr) b.spr.dirty = true;
  }

  // ---- Game state ------------------------------------------------------------
  var G = null;           // the current match
  var demo = null;        // the table that plays itself behind the menu
  var paused = false;
  var popups = [], particles = [], sinking = [];
  var shake = 0;

  function newMatch(mode, level) {
    var rand = Math.random;
    var g = {
      mode: mode, level: level || null, clock: 0, acc: 0,
      st: P.newState(mode === 'blitz' ? P.rackRandom(rand) : P.rack8(rand)),
      phase: 'aim', ev: null, angle: -Math.PI / 2, power: 0, spin: 0, side: 0,
      anim: null, dragCue: false, aiming: false, overShown: false
    };
    g.st.balls.forEach(function (b) { b.lx = b.x; b.ly = b.y; });
    if (mode === 'blitz') {
      g.blitz = { time: 90, score: 0, streak: 0, mult: 1, racks: 0, best: save.stats.blitzBest, ended: false };
      g.game = { players: [{ name: 'You', group: null, cpu: null }], turn: 0, open: true, breakShot: true, ballInHand: 'kitchen' };
    } else {
      g.game = {
        players: [
          { name: mode === 'cpu' ? 'You' : 'Player 1', group: null, cpu: null },
          { name: mode === 'cpu' ? 'CPU · ' + CPU_NAMES[level] : 'Player 2', group: null, cpu: mode === 'cpu' ? level : null }
        ],
        turn: 0, open: true, breakShot: true, ballInHand: 'kitchen'
      };
    }
    aimAtRack(g);
    return g;
  }
  function aimAtRack(g) {
    var cue = g.st.balls[0];
    g.angle = Math.atan2(P.FOOT.y - cue.y, P.FOOT.x - cue.x);
  }

  function startMatch(mode, level) {
    hideAll();
    inGame = true; paused = false;
    $('hud').classList.remove('hidden');
    $('controls').classList.remove('hidden');
    $('blitzHud').classList.toggle('hidden', mode !== 'blitz');
    $('hud').classList.toggle('blitz', mode === 'blitz');
    $('p0').classList.toggle('hidden', mode === 'blitz');
    $('p1').classList.toggle('hidden', mode === 'blitz');
    G = newMatch(mode, level);
    popups = []; particles = []; sinking = [];
    G.spin = 0; G.side = 0; drawSpinMini();
    layout();
    updateHud();
    if (mode === 'blitz') banner('GO!');
    else banner(mode === 'cpu' ? 'BREAK!' : 'PLAYER 1 BREAKS');
    sfx.blip();
    beginTurn();
  }

  function isCpuTurn() { return G && G.mode === 'cpu' && G.game.players[G.game.turn].cpu; }

  function beginTurn() {
    var game = G.game, cue = G.st.balls[0];
    if (game.ballInHand && !cue.on) {
      P.spotBall(G.st, cue, W / 2, H * 0.8);
      cue.lx = cue.x; cue.ly = cue.y;
    }
    G.phase = 'aim';
    G.power = 0; setPowerUi(0);
    updateHud();
    if (isCpuTurn()) cpuTurn();
    else setControls(true);
  }

  function setControls(on) { $('controls').classList.toggle('off', !on); }

  function cpuTurn() {
    setControls(false);
    G.phase = 'cpu';
    var g = G;
    setInfo('CPU THINKING…');
    wait(0.55, function () {
      RU.think(g.game, g.st, g.level, function (shot) {
        if (G !== g) return;
        var steps = [];
        var cue = g.st.balls[0];
        if (shot.place) steps.push(function (next) {
          anim(0.5, cue.x, cue.y, function (t, fx, fy) {
            cue.x = fx + (shot.place.x - fx) * ease(t); cue.y = fy + (shot.place.y - fy) * ease(t);
            cue.lx = cue.x; cue.ly = cue.y;
          }, next);
        });
        steps.push(function (next) {
          var from = g.angle, diff = Math.atan2(Math.sin(shot.angle - from), Math.cos(shot.angle - from));
          anim(0.75, from, diff, function (t, a0, dd) { g.angle = a0 + dd * ease(t); }, next);
        });
        steps.push(function (next) { g.spin = shot.spin; g.side = shot.side; wait(0.2, next); });
        steps.push(function (next) {
          anim(0.45, 0, shot.power, function (t, p0, p1) { g.power = p1 * ease(t); }, function () { wait(0.12, next); });
        });
        steps.push(function () { g.angle = shot.angle; shoot(shot.power); });
        (function run(i) { if (i < steps.length && G === g) steps[i](function () { run(i + 1); }); })(0);
      });
    });
  }
  function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  // Animations and waits run on game time, so pausing freezes them.
  var timers = [];
  function wait(sec, fn) { timers.push({ at: (G ? G.clock : 0) + sec, fn: fn, g: G }); }
  function anim(dur, a, b, upd, done) {
    var g = G, t0 = g.clock;
    timers.push({ every: true, g: g, fn: function () {
      var t = Math.min(1, (g.clock - t0) / dur);
      upd(t, a, b);
      if (t >= 1) { done(); return true; }
      return false;
    } });
  }
  function runTimers() {
    var keep = [];
    var list = timers; timers = [];
    list.forEach(function (tm) {
      if (tm.g !== G) return;
      if (tm.every) { if (!tm.fn()) keep.push(tm); }
      else if (G.clock >= tm.at) tm.fn();
      else keep.push(tm);
    });
    timers = keep.concat(timers);
  }

  function shoot(power) {
    if (!G || (G.phase !== 'aim' && G.phase !== 'cpu')) return;
    audio();
    var cue = G.st.balls[0];
    if (!cue.on) return;
    G.game.ballInHand = null;
    G.ev = P.strike(G.st, G.angle, power, G.spin, G.side);
    G.ev.contacts = [];
    G.shotPower = power;
    G.phase = 'rolling';
    G.power = 0; setPowerUi(0);
    setControls(false);
    setInfo('');
    sfx.cue(power);
    buzz(Math.round(8 + power * 22));
    if (G.game.breakShot && power > 0.8) shake = 7;
  }

  function physicsTick(dt) {
    G.acc += dt;
    var n = 0;
    while (G.acc >= P.DT && n < 40) {
      P.step(G.st, G.ev, true);
      G.acc -= P.DT; n++;
      if (!P.anyMoving(G.st)) { G.acc = 0; break; }
    }
    handleContacts(G.ev, true);
    G.st.balls.forEach(rollBall);
    if (!P.anyMoving(G.st)) endShot();
  }

  function handleContacts(ev, audible) {
    var list = ev.contacts; ev.contacts = [];
    list.forEach(function (c) {
      if (c.kind === 'ball') { if (audible && c.speed > 30) sfx.clack(Math.min(1, c.speed / 2200)); if (audible && c.speed > 1500) buzz(12); }
      else if (c.kind === 'rail') { if (audible && c.speed > 60) sfx.rail(Math.min(1, c.speed / 2400)); }
      else if (c.kind === 'pocket') {
        var p = P.pockets[c.pocket];
        var st = G ? G.st : demo.st;
        var ball = st.balls.filter(function (o) { return o.n === c.n; })[0];
        if (ball) sinking.push({ b: ball, x: ball.x, y: ball.y, px: p.x, py: p.y, t: 0 });
        if (audible) { sfx.pocket(); buzz(25); }
        burst(p.x, p.y, ballCss(c.n), audible ? 22 : 10);
      }
    });
  }

  function burst(x, y, color, count) {
    var f = felt();
    for (var i = 0; i < count; i++) {
      var a = Math.random() * Math.PI * 2, s = 60 + Math.random() * 260;
      particles.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + Math.random() * 0.5, max: 1, color: i % 2 ? color : f.glow, r: 1.5 + Math.random() * 3 });
    }
  }
  function popup(text, x, y, color, big) { popups.push({ text: text, x: x, y: y, t: 0, color: color || '#ffe14a', big: !!big }); }

  function endShot() {
    G.phase = 'judging';
    if (G.mode === 'blitz') return endBlitzShot();
    var game = G.game, st = G.st, ev = G.ev;
    var r = RU.judge(game, st, ev);
    var me = game.players[game.turn], meIdx = game.turn;
    if (r.respot8) {
      var eight = st.balls.filter(function (b) { return b.n === 8; })[0];
      P.spotBall(st, eight, P.FOOT.x, P.FOOT.y);
      eight.lx = eight.x; eight.ly = eight.y;
      toast('The 8 is back on its spot');
    }
    if (r.winner >= 0) return finishMatch(r.winner, r.msg);
    if (r.assign) {
      game.open = false;
      me.group = r.assign;
      game.players[1 - meIdx].group = RU.other(r.assign);
      var who = G.mode === 'cpu' ? (meIdx === 0 ? 'YOU’RE' : 'CPU IS') : (meIdx === 0 ? 'P1 IS' : 'P2 IS');
      banner(who + ' ' + r.assign.toUpperCase());
    }
    var myGroup = me.group;
    var good = r.objSunk.filter(function (n) { return !myGroup || RU.groupOf(n) === myGroup; }).length;
    if (good && !r.foul) popup(good > 1 ? 'DOUBLE!' : ['NICE!', 'SWEET!', 'CLEAN!'][Math.floor(Math.random() * 3)], W / 2, H / 2 - 40, '#4dff9a');
    var wasBreak = game.breakShot;
    game.breakShot = false;
    if (r.foul) {
      sfx.foul(); buzz(60);
      game.turn = 1 - game.turn;
      game.ballInHand = wasBreak && r.cueSunk ? 'kitchen' : 'anywhere';
      var next = game.players[game.turn];
      toast(r.foul + ' — ' + (next.cpu ? 'CPU has' : G.mode === 'cpu' ? 'you have' : next.name + ' has') + ' ball in hand', true);
    } else if (!r.keepTurn) {
      game.turn = 1 - game.turn;
    } else if (r.objSunk.length > 1) {
      sfx.combo(r.objSunk.length);
    }
    if (G.mode === '2p' && game.turn !== meIdx) banner(game.players[game.turn].name.toUpperCase());
    wait(r.assign ? 0.9 : 0.35, beginTurn);
  }

  function endBlitzShot() {
    var bz = G.blitz, st = G.st, ev = G.ev;
    var objs = ev.sunk.filter(function (n) { return n !== 0; });
    if (ev.sunk.indexOf(0) >= 0) {
      bz.time = Math.max(0, bz.time - 5);
      bz.streak = 0; bz.mult = 1;
      sfx.foul(); buzz(60);
      popup('-5s', W / 2, H * 0.8, '#ff3fbf', true);
      toast('Scratch! −5 seconds', true);
      G.game.ballInHand = 'kitchen';
    }
    if (objs.length) {
      bz.streak++;
      bz.mult = Math.min(5, bz.streak);
      var pts = 0;
      objs.forEach(function (n) { pts += n === 8 ? 3 : 1; });
      if (objs.length > 1) pts += objs.length - 1;
      pts *= bz.mult;
      bz.score += pts;
      bz.time += 2 * objs.length;
      popup('+' + pts + (bz.mult > 1 ? '  x' + bz.mult : ''), W / 2, H / 2, bz.mult > 2 ? '#ff3fbf' : '#ffe14a', true);
      if (bz.mult > 1) sfx.combo(bz.mult);
    } else if (ev.sunk.indexOf(0) < 0) {
      if (bz.streak > 1) toast('Combo lost');
      bz.streak = 0; bz.mult = 1;
    }
    var left = st.balls.filter(function (b) { return b.on && b.n !== 0; }).length;
    if (left === 0) {
      bz.racks++;
      bz.score += 10 * bz.racks;
      bz.time += 10;
      banner('RACK CLEARED! +' + 10 * bz.racks);
      sfx.win();
      rerack();
    }
    updateHud();
    if (bz.time <= 0) return finishBlitz();
    G.game.breakShot = false;
    wait(0.2, beginTurn);
  }

  function rerack() {
    var cue = G.st.balls[0];
    var fresh = P.rackRandom(Math.random);
    G.st.balls = [cue].concat(fresh);
    fresh.forEach(function (b) { b.lx = b.x; b.ly = b.y; });
    if (cue.on && cue.y < P.HEAD_Y) { cue.on = false; }
    G.game.ballInHand = 'kitchen';
    burst(P.FOOT.x, P.FOOT.y - 40, '#ffe14a', 40);
  }

  function finishMatch(winner, msg) {
    G.phase = 'over';
    var game = G.game, coins = 0, title, sub;
    if (G.mode === 'cpu') {
      var won = winner === 0;
      save.stats[G.level][won ? 0 : 1]++;
      coins = won ? CPU_COINS[G.level] : 10;
      title = won ? 'YOU WIN!' : 'CPU WINS';
      sub = (msg || '') + (won ? '' : ' Better luck next rack.');
      if (won) { sfx.win(); banner('YOU WIN!'); } else { sfx.lose(); banner('CPU WINS'); }
    } else {
      save.stats.twoPlayer++;
      coins = 15;
      title = game.players[winner].name.toUpperCase() + ' WINS!';
      sub = msg || '';
      sfx.win(); banner(title);
    }
    buzz(120);
    save.coins += coins; persist();
    for (var i = 0; i < 4; i++) burst(Math.random() * W, Math.random() * H, '#ffe14a', 30);
    wait(1.6, function () { showOver(title, sub, coins); });
  }

  function finishBlitz() {
    var bz = G.blitz;
    if (bz.ended) return;
    bz.ended = true;
    G.phase = 'over';
    var best = bz.score > save.stats.blitzBest;
    if (best) save.stats.blitzBest = bz.score;
    var coins = bz.score;
    save.coins += coins; persist();
    sfx.win(); banner('TIME!');
    wait(1.4, function () { showOver(best && bz.score > 0 ? 'NEW BEST!' : 'TIME UP', 'You scored ' + bz.score + (bz.racks ? ' and cleared ' + bz.racks + (bz.racks > 1 ? ' racks' : ' rack') : '') + '. Best: ' + save.stats.blitzBest, coins); });
  }

  function showOver(title, sub, coins) {
    $('overTitle').textContent = title;
    $('overSub').textContent = sub;
    $('overCoins').innerHTML = '<span class="coin"></span>+' + coins;
    $('overMenu').classList.remove('hidden');
    setControls(false);
  }

  // ---- HUD -------------------------------------------------------------
  function updateHud() {
    if (!G) return;
    if (G.mode === 'blitz') {
      $('bScore').textContent = G.blitz.score;
      $('bMult').textContent = 'x' + G.blitz.mult;
      return;
    }
    var game = G.game;
    [0, 1].forEach(function (i) {
      var p = game.players[i], el = $('p' + i);
      el.querySelector('.pname').textContent = p.name;
      el.classList.toggle('turn', game.turn === i);
      var box = el.querySelector('.pballs');
      if (!p.group) { box.innerHTML = '<span class="grp">' + (game.breakShot ? 'BREAK' : 'OPEN TABLE') + '</span>'; return; }
      var html = '', nums = p.group === 'solids' ? [1, 2, 3, 4, 5, 6, 7] : [9, 10, 11, 12, 13, 14, 15];
      var on = {}; G.st.balls.forEach(function (b) { if (b.on) on[b.n] = 1; });
      var allGone = true;
      nums.forEach(function (n) {
        if (on[n]) allGone = false;
        var bg = p.group === 'solids' ? ballCss(n) : 'linear-gradient(#fff 0 25%, ' + ballCss(n) + ' 25% 75%, #fff 75%)';
        html += '<i class="' + (on[n] ? '' : 'gone') + '" style="background:' + bg + '"></i>';
      });
      if (allGone) html = '<span class="grp">ON THE 8 →</span><i style="background:#111;box-shadow:0 0 6px #fff"></i>';
      box.innerHTML = html;
    });
    if (G.phase === 'aim') {
      var me = game.players[game.turn];
      if (game.ballInHand) setInfo(me.cpu ? '' : (game.ballInHand === 'kitchen' ? 'PLACE BEHIND THE LINE' : 'BALL IN HAND'));
      else setInfo(game.breakShot ? 'BREAK' : '');
    }
  }
  function setInfo(t) { $('hudInfo').textContent = t; }
  var toastTimer = 0;
  function toast(text, bad) {
    var t = $('toast'); t.textContent = text; t.classList.toggle('bad', !!bad); t.classList.toggle('low', !inGame); t.classList.remove('hidden');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.add('hidden'); }, 2400);
  }
  function banner(text) {
    var b = $('banner'); b.classList.add('hidden'); void b.offsetWidth;
    b.textContent = text; b.classList.remove('hidden');
  }

  // ---- Controls ------------------------------------------------------------
  function toTable(e) {
    return { x: (e.clientX - offX) / sc, y: (e.clientY - offY) / sc };
  }
  function humanCanAct() { return G && !paused && G.phase === 'aim' && !isCpuTurn(); }

  cv.addEventListener('pointerdown', function (e) {
    audio();
    if (!humanCanAct()) return;
    var p = toTable(e), cue = G.st.balls[0];
    cv.setPointerCapture(e.pointerId);
    if (G.game.ballInHand && Math.hypot(p.x - cue.x, p.y - cue.y) < R * 3.4) {
      G.dragCue = true; G.dragOff = { x: cue.x - p.x, y: cue.y - p.y };
    } else {
      G.aiming = true; aimAt(p);
    }
  });
  cv.addEventListener('pointermove', function (e) {
    if (!G || !humanCanAct()) return;
    var p = toTable(e);
    if (G.dragCue) moveCue(p.x + G.dragOff.x, p.y + G.dragOff.y);
    else if (G.aiming) aimAt(p);
  });
  function endCanvasDrag() { if (G) { G.dragCue = false; G.aiming = false; } }
  cv.addEventListener('pointerup', endCanvasDrag);
  cv.addEventListener('pointercancel', endCanvasDrag);

  function aimAt(p) {
    var cue = G.st.balls[0];
    if (Math.hypot(p.x - cue.x, p.y - cue.y) < R * 1.2) return;
    G.angle = Math.atan2(p.y - cue.y, p.x - cue.x);
  }
  function moveCue(x, y) {
    var cue = G.st.balls[0], kitchen = G.game.ballInHand === 'kitchen';
    x = Math.max(R, Math.min(W - R, x));
    y = Math.max(kitchen ? P.HEAD_Y + R * 0.3 : R, Math.min(H - R, y));
    if (P.canPlace(G.st, x, y, kitchen)) {
      cue.x = x; cue.y = y; cue.lx = x; cue.ly = y; cue.on = true;
    } else {
      // Slide toward the target in small steps to get as close as possible.
      for (var k = 1; k <= 8; k++) {
        var tx = cue.x + (x - cue.x) * (1 - k / 8), ty = cue.y + (y - cue.y) * (1 - k / 8);
        if (P.canPlace(G.st, tx, ty, kitchen)) { cue.x = tx; cue.y = ty; cue.lx = tx; cue.ly = ty; break; }
      }
    }
  }

  // Fine aim strip.
  (function () {
    var el = $('fine'), last = null, ribs = $('fineRibs'), off = 0;
    el.addEventListener('pointerdown', function (e) { if (!humanCanAct()) return; audio(); el.setPointerCapture(e.pointerId); last = e.clientX; });
    el.addEventListener('pointermove', function (e) {
      if (last == null || !humanCanAct()) return;
      var dx = e.clientX - last; last = e.clientX;
      G.angle += dx * 0.0016;
      off += dx; ribs.style.backgroundPosition = off + 'px 0';
      if (Math.abs(off % 12) < Math.abs(dx) + 0.01) sfx.tick();
    });
    var end = function () { last = null; };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  })();

  // Power bar: drag right, let go to shoot.
  (function () {
    var el = $('power'), x0 = null, lastStep = 0;
    el.addEventListener('pointerdown', function (e) {
      if (!humanCanAct()) return;
      audio(); el.setPointerCapture(e.pointerId);
      x0 = e.clientX; G.power = 0; lastStep = 0;
    });
    el.addEventListener('pointermove', function (e) {
      if (x0 == null || !humanCanAct()) return;
      var w = el.getBoundingClientRect().width;
      var startRoom = Math.max(w * 0.55, w - (x0 - el.getBoundingClientRect().left) - 10);
      G.power = Math.max(0, Math.min(1, (e.clientX - x0) / startRoom));
      setPowerUi(G.power);
      var step = Math.floor(G.power * 10);
      if (step !== lastStep) { lastStep = step; sfx.tick(); if (step % 5 === 0) buzz(5); }
    });
    el.addEventListener('pointerup', function () {
      if (x0 == null) return;
      x0 = null;
      if (!humanCanAct()) return;
      if (G.power > 0.03) shoot(G.power);
      else { G.power = 0; setPowerUi(0); }
    });
    el.addEventListener('pointercancel', function () { x0 = null; if (G) { G.power = 0; setPowerUi(0); } });
  })();
  function setPowerUi(p) {
    $('powerFill').style.width = (p * 100).toFixed(1) + '%';
    $('powerLabel').textContent = p > 0.01 ? Math.round(p * 100) + '%' : 'DRAG → TO SHOOT';
  }

  // Spin.
  function drawSpinBall(c, size, sx, sy) {
    var x = c.getContext('2d'), r = size / 2 - 4;
    x.clearRect(0, 0, size, size);
    var g = x.createRadialGradient(size * 0.38, size * 0.35, r * 0.1, size / 2, size / 2, r);
    g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#bdb8c8');
    x.fillStyle = g; x.beginPath(); x.arc(size / 2, size / 2, r, 0, 7); x.fill();
    x.strokeStyle = 'rgba(0,0,0,0.15)'; x.lineWidth = Math.max(1, size / 110);
    x.beginPath(); x.moveTo(size / 2, 4); x.lineTo(size / 2, size - 4); x.moveTo(4, size / 2); x.lineTo(size - 4, size / 2); x.stroke();
    x.beginPath(); x.arc(size / 2, size / 2, r * 0.5, 0, 7); x.stroke();
    x.fillStyle = '#ff2a4a'; x.shadowColor = '#ff2a4a'; x.shadowBlur = size / 12;
    x.beginPath(); x.arc(size / 2 + sx * r, size / 2 + sy * r, Math.max(4, size / 11), 0, 7); x.fill();
    x.shadowBlur = 0;
  }
  function drawSpinMini() { var s = G ? G : { side: 0, spin: 0 }; drawSpinBall($('spinMini'), 88, s.side * 0.8, -s.spin * 0.8); }
  function drawSpinBig() { drawSpinBall($('spinBig'), 440, G.side * 0.8, -G.spin * 0.8); }
  $('spinBtn').addEventListener('click', function () {
    if (!humanCanAct()) return;
    sfx.blip(); $('spinPick').classList.remove('hidden'); drawSpinBig();
  });
  (function () {
    var el = $('spinBig'), down = false;
    function set(e) {
      var r = el.getBoundingClientRect();
      var x = ((e.clientX - r.left) / r.width - 0.5) * 2 / 0.8 / ((r.width / 2 - r.width / 110) / (r.width / 2));
      var y = ((e.clientY - r.top) / r.height - 0.5) * 2 / 0.8;
      var l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
      G.side = x; G.spin = -y; drawSpinBig(); drawSpinMini();
    }
    el.addEventListener('pointerdown', function (e) { down = true; el.setPointerCapture(e.pointerId); set(e); });
    el.addEventListener('pointermove', function (e) { if (down) set(e); });
    el.addEventListener('pointerup', function () { down = false; });
  })();
  $('spinReset').addEventListener('click', function () { G.spin = 0; G.side = 0; drawSpinBig(); drawSpinMini(); });
  $('spinDone').addEventListener('click', function () { $('spinPick').classList.add('hidden'); });

  // ---- Drawing -------------------------------------------------------------
  function drawFrame(dt) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    var sx = 0, sy = 0;
    if (shake > 0.1) { sx = (Math.random() - 0.5) * shake; sy = (Math.random() - 0.5) * shake; shake *= Math.pow(0.02, dt); }
    ctx.drawImage(tableImg, (offX - RAIL * sc + sx) * dpr - 20, (offY - RAIL * sc + sy) * dpr - 20);
    ctx.setTransform(dpr * sc, 0, 0, dpr * sc, (offX + sx) * dpr, (offY + sy) * dpr);
    var g = G || demo;
    if (!g) return;
    var st = g.st;

    // Ball-in-hand zone.
    if (G && G.phase === 'aim' && G.game.ballInHand && !isCpuTurn()) {
      var pulse = 0.5 + 0.5 * Math.sin(G.clock * 5);
      if (G.game.ballInHand === 'kitchen') {
        ctx.fillStyle = 'rgba(63, 246, 255, ' + (0.05 + 0.04 * pulse) + ')';
        ctx.fillRect(0, P.HEAD_Y, W, H - P.HEAD_Y);
      }
    }

    // Sinking balls.
    sinking = sinking.filter(function (s) { s.t += dt; return s.t < 0.22; });
    sinking.forEach(function (s) {
      var k = s.t / 0.22, x = s.x + (s.px - s.x) * k, y = s.y + (s.py - s.y) * k, r = R * (1 - k * 0.6);
      ctx.globalAlpha = 1 - k;
      ctx.drawImage(sprite(s.b), x - r, y - r, 2 * r, 2 * r);
      ctx.globalAlpha = 1;
    });

    // Shadows, then balls.
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    st.balls.forEach(function (b) { if (!b.on) return; ctx.beginPath(); ctx.ellipse(b.x + 3, b.y + 4.5, R * 1.02, R * 0.92, 0, 0, 7); ctx.fill(); });
    st.balls.forEach(function (b) { if (b.on) ctx.drawImage(sprite(b), b.x - R, b.y - R, 2 * R, 2 * R); });

    if (G && (G.phase === 'aim' || G.phase === 'cpu')) drawAim();

    // Particles and popups.
    particles = particles.filter(function (p) { p.life -= dt; return p.life > 0; });
    particles.forEach(function (p) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= Math.pow(0.1, dt); p.vy *= Math.pow(0.1, dt);
      ctx.globalAlpha = Math.min(1, p.life * 2);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
    });
    ctx.globalAlpha = 1;
    popups = popups.filter(function (p) { p.t += dt; return p.t < 1.2; });
    popups.forEach(function (p) {
      var k = p.t / 1.2;
      ctx.globalAlpha = 1 - k * k;
      ctx.font = '900 italic ' + (p.big ? 46 : 30) + 'px system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowColor = p.color; ctx.shadowBlur = 18;
      ctx.fillStyle = '#fff';
      ctx.fillText(p.text, p.x, p.y - k * 70);
      ctx.shadowBlur = 0;
    });
    ctx.globalAlpha = 1;
  }

  function rainbow(t, off) { return 'hsl(' + Math.round(((t * 90 + (off || 0)) % 360)) + ', 100%, 65%)'; }

  function drawAim() {
    var st = G.st, cue = st.balls[0], ci = cueItem();
    if (!cue.on) return;
    var a = G.angle, dx = Math.cos(a), dy = Math.sin(a);
    var guideCol = ci.guide === 'rainbow' ? rainbow(G.clock) : ci.guide;
    var human = !isCpuTurn();

    // Ball in hand: glowing ring and arrows.
    if (G.game.ballInHand && human) {
      var pulse = 0.5 + 0.5 * Math.sin(G.clock * 6);
      ctx.strokeStyle = 'rgba(63, 246, 255, ' + (0.5 + 0.5 * pulse) + ')';
      ctx.lineWidth = 2.5; ctx.shadowColor = '#3ff6ff'; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(cue.x, cue.y, R + 6 + pulse * 3, 0, 7); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(63,246,255,0.8)';
      [[0, -1], [0, 1], [-1, 0], [1, 0]].forEach(function (d) {
        var bx = cue.x + d[0] * (R + 20), by = cue.y + d[1] * (R + 20);
        ctx.beginPath();
        ctx.moveTo(bx + d[0] * 6, by + d[1] * 6);
        ctx.lineTo(bx - d[1] * 5, by + d[0] * 5); ctx.lineTo(bx + d[1] * 5, by - d[0] * 5); ctx.closePath(); ctx.fill();
      });
    }

    if (human && !G.dragCue) {
      var ray = P.aimRay(st, a);
      var legal = true;
      if (ray.ball) {
        var targets = RU.legalTargets(G.game, st);
        if (G.mode !== 'blitz' && !G.game.breakShot) legal = targets.indexOf(ray.ball) >= 0;
      }
      ctx.save();
      ctx.strokeStyle = guideCol; ctx.globalAlpha = 0.75; ctx.lineWidth = 2;
      ctx.shadowColor = guideCol; ctx.shadowBlur = 8;
      ctx.setLineDash([10, 8]); ctx.lineDashOffset = -G.clock * 30;
      ctx.beginPath(); ctx.moveTo(cue.x + dx * R, cue.y + dy * R); ctx.lineTo(ray.x, ray.y); ctx.stroke();
      ctx.setLineDash([]);
      // Ghost ball.
      ctx.globalAlpha = 0.9; ctx.lineWidth = 2;
      ctx.strokeStyle = legal ? guideCol : '#ff3f6a';
      ctx.beginPath(); ctx.arc(ray.x, ray.y, R, 0, 7); ctx.stroke();
      if (!legal) {
        ctx.beginPath(); ctx.moveTo(ray.x - 6, ray.y - 6); ctx.lineTo(ray.x + 6, ray.y + 6); ctx.moveTo(ray.x + 6, ray.y - 6); ctx.lineTo(ray.x - 6, ray.y + 6); ctx.stroke();
      }
      if (ray.ball && legal) {
        var len = 40 + 160 * ray.cut;
        ctx.globalAlpha = 0.85; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(ray.ball.x, ray.ball.y); ctx.lineTo(ray.ball.x + ray.objDir.x * len, ray.ball.y + ray.objDir.y * len); ctx.stroke();
        if (ray.cueDir) {
          ctx.globalAlpha = 0.45; ctx.lineWidth = 2;
          var cl = 30 + 70 * (1 - ray.cut);
          ctx.beginPath(); ctx.moveTo(ray.x, ray.y); ctx.lineTo(ray.x + ray.cueDir.x * cl, ray.y + ray.cueDir.y * cl); ctx.stroke();
        }
      } else if (ray.bounce) {
        ctx.globalAlpha = 0.4; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(ray.x, ray.y); ctx.lineTo(ray.x + ray.bounce.x * 60, ray.y + ray.bounce.y * 60); ctx.stroke();
      }
      ctx.restore();
    }

    // The cue stick.
    var pull = 8 + G.power * 110;
    var tipX = cue.x - dx * (R + pull), tipY = cue.y - dy * (R + pull);
    var L = 560, px = -dy, py = dx;
    var buttX = tipX - dx * L, buttY = tipY - dy * L;
    function quad(d0, d1, w0, w1) {
      var x0 = tipX - dx * d0, y0 = tipY - dy * d0, x1 = tipX - dx * d1, y1 = tipY - dy * d1;
      ctx.beginPath();
      ctx.moveTo(x0 + px * w0, y0 + py * w0); ctx.lineTo(x1 + px * w1, y1 + py * w1);
      ctx.lineTo(x1 - px * w1, y1 - py * w1); ctx.lineTo(x0 - px * w0, y0 - py * w0); ctx.closePath(); ctx.fill();
    }
    var wAt = function (d) { return 2.6 + (d / L) * 4.4; };
    ctx.save();
    ctx.beginPath(); ctx.rect(-RAIL * 3, (clipTop - offY) / sc, W + RAIL * 6, (clipBot - clipTop) / sc); ctx.clip();
    // shadow
    ctx.globalAlpha = 0.3; ctx.fillStyle = '#000';
    ctx.translate(6, 9); quad(0, L, wAt(0), wAt(L)); ctx.translate(-6, -9);
    ctx.globalAlpha = 1;
    var glow = ci.glow === 'rainbow' ? rainbow(G.clock, 180) : ci.glow;
    if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 14; }
    ctx.fillStyle = ci.shaft; quad(0, L * 0.62, wAt(0), wAt(L * 0.62));
    ctx.shadowBlur = 0;
    ctx.fillStyle = ci.glow === 'rainbow' ? rainbow(G.clock) : ci.butt; quad(L * 0.62, L, wAt(L * 0.62), wAt(L));
    ctx.fillStyle = ci.band; quad(L * 0.6, L * 0.635, wAt(L * 0.6), wAt(L * 0.635));
    ctx.fillStyle = '#f5f3ea'; quad(0, 9, wAt(0), wAt(9));       // ferrule
    ctx.fillStyle = '#3b7bd8'; quad(0, 2.5, wAt(0), wAt(2.5));    // chalked tip
    // highlight down the shaft
    ctx.globalAlpha = 0.35; ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(tipX + px * 1, tipY + py * 1); ctx.lineTo(buttX + px * 3, buttY + py * 3); ctx.lineTo(buttX + px * 1.5, buttY + py * 1.5); ctx.lineTo(tipX, tipY); ctx.fill();
    ctx.restore();
  }

  // ---- Main loop -----------------------------------------------------------
  var lastT = 0;
  function frame(t) {
    var dt = Math.min(0.05, (t - lastT) / 1000 || 0);
    lastT = t;
    soundsThisFrame = 0;
    if (G && !paused) {
      G.clock += dt;
      runTimers();
      if (G.phase === 'rolling') physicsTick(dt);
      if (G.mode === 'blitz' && !G.blitz.ended && (G.phase === 'aim' || G.phase === 'rolling')) {
        G.blitz.time -= dt;
        if (G.blitz.time <= 0) {
          G.blitz.time = 0;
          if (G.phase === 'aim') finishBlitz();
        }
        var tEl = $('bTime');
        var shown = Math.ceil(G.blitz.time);
        if (tEl.textContent !== String(shown)) {
          tEl.textContent = shown;
          $('bTimeWrap').classList.toggle('low', G.blitz.time <= 10);
          if (G.blitz.time <= 10 && G.blitz.time > 0) sfx.tick();
        }
      }
    } else if (!G && demo) {
      demoTick(dt);
    }
    if (!paused || !G) drawFrame(paused ? 0 : dt);
    requestAnimationFrame(frame);
  }

  // The table behind the menu plays itself, quietly.
  function newDemo() {
    demo = { st: P.newState(P.rack8(Math.random)), ev: null, acc: 0, wait: 1.2 };
    demo.st.balls.forEach(function (b) { b.lx = b.x; b.ly = b.y; });
  }
  function demoTick(dt) {
    var d = demo;
    if (d.ev && P.anyMoving(d.st)) {
      d.acc += dt;
      while (d.acc >= P.DT) { P.step(d.st, d.ev, true); d.acc -= P.DT; }
      handleContacts(d.ev, false);
      d.st.balls.forEach(rollBall);
      return;
    }
    d.wait -= dt;
    if (d.wait > 0) return;
    var left = d.st.balls.filter(function (b) { return b.on && b.n !== 0; });
    var cue = d.st.balls[0];
    if (left.length < 3) { newDemo(); return; }
    if (!cue.on) { P.spotBall(d.st, cue, W / 2, H * 0.8); cue.lx = cue.x; cue.ly = cue.y; }
    var shots = RU.potShots(d.st, left);
    var shot = shots.length ? shots[Math.floor(Math.random() * Math.min(3, shots.length))] : null;
    var first = !d.ev;
    var ang = first ? Math.atan2(P.FOOT.y - cue.y, P.FOOT.x - cue.x) : shot ? shot.angle : Math.random() * 7;
    d.ev = P.strike(d.st, ang, first ? 0.95 : shot ? shot.power : 0.5, 0, 0);
    d.ev.contacts = [];
    d.wait = 1.4;
  }

  // ---- Menus -----------------------------------------------------------------
  function hideAll() {
    document.querySelectorAll('.screen, .overlay').forEach(function (el) { el.classList.add('hidden'); });
  }
  function showScreen(id) {
    hideAll();
    if (id === 'menu') refreshMenu();
    if (id === 'shop') renderShop();
    $(id).classList.remove('hidden');
  }
  function leaveGame() {
    G = null; timers = []; inGame = false; paused = false;
    $('hud').classList.add('hidden'); $('controls').classList.add('hidden'); $('banner').classList.add('hidden'); $('toast').classList.add('hidden');
    popups = []; particles = []; sinking = [];
    newDemo();
    layout();
    showScreen('menu');
  }
  function refreshMenu() {
    document.querySelectorAll('.coinCount').forEach(function (el) { el.textContent = save.coins; });
    $('soundBtn').textContent = 'Sound: ' + (save.sound ? 'on' : 'off');
    $('vibeBtn').textContent = 'Buzz: ' + (save.vibe ? 'on' : 'off');
    var s = save.stats;
    $('stats').innerHTML = 'Wins vs Rookie ' + s.easy[0] + ' · Hustler ' + s.medium[0] + ' · Shark ' + s.hard[0] + '<br>Blitz best ' + s.blitzBest;
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    audio();
    if (b.dataset.go) {
      sfx.blip();
      var go = b.dataset.go;
      if (go === 'cpu') showScreen('cpuMenu');
      else if (go === '2p') startMatch('2p');
      else if (go === 'blitz') startMatch('blitz');
      else showScreen(go);
    } else if (b.dataset.level) {
      sfx.blip(); startMatch('cpu', b.dataset.level);
    } else if (b.dataset.tab) {
      shopTab = b.dataset.tab; renderShop(); sfx.blip();
    }
  });
  $('soundBtn').addEventListener('click', function () { save.sound = !save.sound; persist(); refreshMenu(); if (save.sound) sfx.blip(); });
  $('vibeBtn').addEventListener('click', function () { save.vibe = !save.vibe; persist(); refreshMenu(); buzz(30); });
  $('pauseBtn').addEventListener('click', function () { pause(); });
  $('resumeBtn').addEventListener('click', function () { resume(); });
  $('restartBtn').addEventListener('click', function () { var m = G.mode, l = G.level; timers = []; startMatch(m, l); });
  $('quitBtn').addEventListener('click', function () { leaveGame(); });
  $('againBtn').addEventListener('click', function () { var m = G.mode, l = G.level; timers = []; startMatch(m, l); });
  $('overMenuBtn').addEventListener('click', function () { leaveGame(); });

  function pause() {
    if (!G || paused || G.phase === 'over') return;
    paused = true; sfx.blip();
    $('pauseMenu').classList.remove('hidden');
  }
  function resume() {
    paused = false; lastT = performance.now();
    $('pauseMenu').classList.add('hidden');
  }

  // Shop.
  var shopTab = 'cues';
  function renderShop() {
    document.querySelectorAll('.tabs button').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === shopTab); });
    document.querySelectorAll('.coinCount').forEach(function (el) { el.textContent = save.coins; });
    var list = $('shopList'); list.innerHTML = '';
    var items = shopTab === 'cues' ? CUES : FELTS;
    var owned = shopTab === 'cues' ? save.cues : save.felts;
    var current = shopTab === 'cues' ? save.cue : save.felt;
    items.forEach(function (it) {
      var row = document.createElement('div'); row.className = 'item';
      var c = document.createElement('canvas'); c.width = 192; c.height = 80;
      if (shopTab === 'cues') previewCue(c, it); else previewFelt(c, it);
      var nm = document.createElement('div'); nm.className = 'nm';
      nm.innerHTML = it.name + '<small>' + (it.price ? it.price + ' coins' : 'Free') + '</small>';
      var btn = document.createElement('button');
      var have = owned.indexOf(it.id) >= 0;
      if (current === it.id) { btn.textContent = 'Equipped'; btn.className = 'equipped'; }
      else if (have) { btn.textContent = 'Use'; }
      else { btn.textContent = 'Buy ' + it.price; btn.className = 'buy' + (save.coins < it.price ? ' cant' : ''); }
      btn.addEventListener('click', function () {
        if (current === it.id) return;
        if (!have) {
          if (save.coins < it.price) { toastMenu('Not enough coins yet'); sfx.foul(); return; }
          save.coins -= it.price; owned.push(it.id); sfx.win(); buzz(40);
        } else sfx.blip();
        if (shopTab === 'cues') save.cue = it.id; else { save.felt = it.id; drawTableImage(); }
        persist(); renderShop();
      });
      row.appendChild(c); row.appendChild(nm); row.appendChild(btn);
      list.appendChild(row);
    });
  }
  function toastMenu(t) { toast(t, true); }
  function previewFelt(c, f) {
    var x = c.getContext('2d');
    x.fillStyle = f.rail2; roundRect(x, 2, 2, 188, 76, 12); x.fill();
    x.strokeStyle = f.glow; x.lineWidth = 3; x.shadowColor = f.glow; x.shadowBlur = 8; x.stroke(); x.shadowBlur = 0;
    var g = x.createRadialGradient(96, 40, 5, 96, 40, 90); g.addColorStop(0, f.mid); g.addColorStop(1, f.felt);
    x.fillStyle = g; x.fillRect(14, 14, 164, 52);
    if (f.pattern === 'grid') { x.strokeStyle = 'rgba(255,63,191,0.35)'; x.lineWidth = 1; for (var i = 14; i < 178; i += 14) { x.beginPath(); x.moveTo(i, 14); x.lineTo(i, 66); x.stroke(); } for (i = 14; i < 66; i += 14) { x.beginPath(); x.moveTo(14, i); x.lineTo(178, i); x.stroke(); } }
    if (f.pattern === 'stars') { x.fillStyle = '#fff'; for (i = 0; i < 40; i++) x.fillRect(14 + Math.random() * 164, 14 + Math.random() * 52, 1.2, 1.2); }
    [[14, 14], [96, 12], [178, 14], [14, 66], [96, 68], [178, 66]].forEach(function (p) { x.fillStyle = '#000'; x.beginPath(); x.arc(p[0], p[1], 6, 0, 7); x.fill(); });
  }
  function previewCue(c, it) {
    var x = c.getContext('2d');
    x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(0, 0, 192, 80);
    var glow = it.glow === 'rainbow' ? '#ff3fbf' : it.glow;
    if (glow) { x.shadowColor = glow; x.shadowBlur = 10; }
    x.fillStyle = it.shaft; x.beginPath(); x.moveTo(12, 38); x.lineTo(118, 36); x.lineTo(118, 44); x.lineTo(12, 42); x.fill();
    if (it.glow === 'rainbow') { var g = x.createLinearGradient(118, 0, 184, 0); ['#ff3fbf', '#ffe14a', '#4dff9a', '#3ff6ff'].forEach(function (cc, i) { g.addColorStop(i / 3, cc); }); x.fillStyle = g; }
    else x.fillStyle = it.butt;
    x.beginPath(); x.moveTo(118, 36); x.lineTo(184, 34); x.lineTo(184, 46); x.lineTo(118, 44); x.fill();
    x.shadowBlur = 0;
    x.fillStyle = it.band; x.fillRect(116, 35.5, 4, 9);
    x.fillStyle = '#3b7bd8'; x.fillRect(10, 38, 3, 4);
  }

  // ---- Host hooks (Android back button, app switching) ---------------------
  NB.back = function () {
    if (!$('spinPick').classList.contains('hidden')) { $('spinPick').classList.add('hidden'); return true; }
    if (G) {
      if (!$('overMenu').classList.contains('hidden')) { leaveGame(); return true; }
      if (paused) { resume(); return true; }
      pause(); return true;
    }
    if (!$('menu').classList.contains('hidden')) return false;
    showScreen('menu'); return true;
  };
  NB.onPause = function () { pause(); if (actx && actx.state === 'running') actx.suspend(); persist(); };
  NB.onResume = function () { lastT = performance.now(); };
  document.addEventListener('visibilitychange', function () { if (document.hidden) NB.onPause(); else NB.onResume(); });
  window.addEventListener('resize', layout);

  // Start.
  newDemo();
  layout();
  showScreen('menu');
  requestAnimationFrame(function (t) { lastT = t; frame(t); });

  // For quick checks from the console.
  NB._debug = { get G() { return G; }, save: save, startMatch: startMatch };
})();
