/* Pet Cam — the pet itself: what kind it is, its needs (food, fun, energy),
   friendship levels, saving, and how it's drawn.

   Drawings use local units: the pet's feet are at (0, 0), up is -y, and a
   pet is about 100 units tall. The AR view scales that to its real size. */
window.PC = window.PC || {};
(function (PC) {
  'use strict';

  const TAU = Math.PI * 2;
  const INK = '#2B2140';

  const SPECIES = {
    mochi: { label: 'Mochi' },
    kitty: { label: 'Kitty' },
    bunny: { label: 'Bunny' },
    pup: { label: 'Pup' },
  };

  const COLORS = {
    peach: { label: 'Peach', body: '#FFC7B0', shade: '#F29E80', belly: '#FFE6DA' },
    berry: { label: 'Berry', body: '#FFB3CF', shade: '#EE82A9', belly: '#FFDCE9' },
    mint: { label: 'Mint', body: '#BDEFD3', shade: '#80D1A7', belly: '#E4FAEE' },
    sky: { label: 'Sky', body: '#C4DEFF', shade: '#8DB5EE', belly: '#E6F0FF' },
    lilac: { label: 'Lilac', body: '#DCCBFF', shade: '#AE92EC', belly: '#F0E8FF' },
    lemon: { label: 'Lemon', body: '#FFEBA3', shade: '#EDC75E', belly: '#FFF6D6' },
    cocoa: { label: 'Cocoa', body: '#E3C1A0', shade: '#BD8F67', belly: '#F5E3D0' },
  };

  // Needs change this much per real hour (meters go 0–100).
  const AWAKE_RATE = { food: -9, fun: -11, energy: -6 };
  const SLEEP_RATE = { food: -4, fun: -2, energy: 40 };
  const FLOOR = 5;  // needs never drop all the way to zero
  const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

  /* ======================= Model ======================= */

  function create(opts) {
    return {
      v: 1,
      name: opts.name || 'Mochi',
      species: SPECIES[opts.species] ? opts.species : 'mochi',
      color: COLORS[opts.color] ? opts.color : 'berry',
      born: Date.now(),
      last: Date.now(),
      stats: { food: 75, fun: 70, energy: 90 },
      asleep: false,
      xp: 0,
      photos: 0,
      fetches: 0,
      treats: 0,
      sound: true,
    };
  }

  function revive(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== 1 || !raw.name) return null;
    const base = create(raw);
    const s = Object.assign(base, raw);
    s.stats = Object.assign(base.stats, raw.stats || {});
    if (!SPECIES[s.species]) s.species = 'mochi';
    if (!COLORS[s.color]) s.color = 'berry';
    return s;
  }

  function load() {
    try { return revive(JSON.parse(PC.host.loadSave())); } catch (e) { return null; }
  }

  function save(s) {
    s.last = Date.now();
    PC.host.writeSave(JSON.stringify(s));
  }

  function clear() {
    PC.host.clearSave();
  }

  // Advance needs by `hours` (also used to catch up after the app was closed).
  function tick(s, hours) {
    const rate = s.asleep ? SLEEP_RATE : AWAKE_RATE;
    for (const k in rate) {
      const v = s.stats[k] + rate[k] * hours;
      s.stats[k] = rate[k] < 0 ? clamp(Math.min(s.stats[k], Math.max(FLOOR, v))) : clamp(v);
    }
    if (s.asleep && s.stats.energy >= 100) s.asleep = false;
  }

  function catchUp(s) {
    const hours = Math.min(72, Math.max(0, (Date.now() - s.last) / 3600000));
    if (hours > 0) tick(s, hours);
  }

  function bump(s, k, n) {
    s.stats[k] = clamp(s.stats[k] + n);
  }

  // Friendship level from XP: each level needs a bit more than the last.
  function level(s) {
    let lv = 1, need = 30, xp = s.xp;
    while (xp >= need) { xp -= need; lv++; need = Math.round(need * 1.35); }
    return { level: lv, into: xp, need };
  }

  // Returns true if this XP made the pet level up.
  function addXP(s, n) {
    const before = level(s).level;
    s.xp += n;
    return level(s).level > before;
  }

  // What the pet wants most right now, if anything.
  function wish(s) {
    if (s.asleep) return null;
    const { food, fun, energy } = s.stats;
    const low = [['food', food], ['energy', energy], ['fun', fun]].filter(([, v]) => v < 30);
    if (!low.length) return null;
    low.sort((a, b) => a[1] - b[1]);
    return low[0][0];
  }

  /* ======================= Drawing ======================= */

  function blob(ctx, w, h) {
    const hw = w / 2;
    ctx.beginPath();
    ctx.moveTo(-hw * 0.82, 0);
    ctx.bezierCurveTo(-hw * 1.1, -h * 0.06, -hw * 1.06, -h * 0.74, -hw * 0.56, -h * 0.95);
    ctx.bezierCurveTo(-hw * 0.26, -h * 1.05, hw * 0.26, -h * 1.05, hw * 0.56, -h * 0.95);
    ctx.bezierCurveTo(hw * 1.06, -h * 0.74, hw * 1.1, -h * 0.06, hw * 0.82, 0);
    ctx.quadraticCurveTo(0, h * 0.07, -hw * 0.82, 0);
    ctx.closePath();
  }

  function ellipse(ctx, x, y, rx, ry, rot, fill, stroke) {
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot || 0, 0, TAU);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = INK; ctx.lineWidth = stroke; ctx.stroke(); }
  }

  function heart(ctx, x, y, r, color) {
    ctx.beginPath();
    ctx.moveTo(x, y + r * 0.9);
    ctx.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.7, y - r * 1.4, x, y - r * 0.5);
    ctx.bezierCurveTo(x + r * 0.7, y - r * 1.4, x + r * 1.6, y - r * 0.2, x, y + r * 0.9);
    ctx.fillStyle = color || '#FF5D8F';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = r * 0.28;
    ctx.stroke();
  }

  function ball(ctx, x, y, r) {
    ellipse(ctx, x, y, r, r, 0, '#D7F24B', r * 0.22);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = r * 0.18;
    ctx.beginPath();
    ctx.arc(x - r * 1.25, y, r * 0.95, -0.9, 0.9);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + r * 1.25, y, r * 0.95, Math.PI - 0.9, Math.PI + 0.9);
    ctx.stroke();
  }

  function cookie(ctx, x, y, r) {
    ellipse(ctx, x, y, r, r * 0.9, 0, '#E6A861', r * 0.2);
    ctx.fillStyle = '#6B3F22';
    [[-0.4, -0.3], [0.35, -0.2], [-0.1, 0.35], [0.4, 0.35], [-0.5, 0.2]].forEach(([a, b]) => {
      ctx.beginPath();
      ctx.arc(x + a * r, y + b * r, r * 0.13, 0, TAU);
      ctx.fill();
    });
  }

  function earsBehind(ctx, species, c, o) {
    const wig = Math.sin(o.t * 9) * 0.08 * (o.wiggle || 0);
    if (species === 'kitty') {
      [-1, 1].forEach((s) => {
        ctx.save();
        ctx.translate(s * 28, -80);
        ctx.rotate(s * (0.28 + wig));
        ctx.beginPath();
        ctx.moveTo(-15, 8);
        ctx.lineTo(0, -24);
        ctx.lineTo(15, 8);
        ctx.closePath();
        ctx.fillStyle = c.body;
        ctx.fill();
        ctx.strokeStyle = INK;
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-7, 4);
        ctx.lineTo(0, -12);
        ctx.lineTo(7, 4);
        ctx.closePath();
        ctx.fillStyle = '#FF9FBF';
        ctx.fill();
        ctx.restore();
      });
    } else if (species === 'bunny') {
      [-1, 1].forEach((s) => {
        ctx.save();
        ctx.translate(s * 18, -82);
        ctx.rotate(s * (0.16 + wig) + (o.droop || 0) * s * 0.9);
        ellipse(ctx, 0, -30, 11, 32, 0, c.body, 4);
        ellipse(ctx, 0, -28, 5, 22, 0, '#FF9FBF');
        ctx.restore();
      });
    }
  }

  function decorFront(ctx, species, c, o) {
    if (species === 'pup') {
      [-1, 1].forEach((s) => {
        ctx.save();
        ctx.translate(s * 40, -74);
        ctx.rotate(s * (0.35 + Math.sin(o.t * 8) * 0.06 * (o.wiggle || 0)));
        ellipse(ctx, 0, 16, 11, 22, 0, c.shade, 4);
        ctx.restore();
      });
    } else if (species === 'mochi') {
      ctx.save();
      ctx.translate(0, -91);
      ctx.rotate(Math.sin(o.t * 3) * 0.12 + (o.wiggle || 0) * Math.sin(o.t * 12) * 0.15);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, 2);
      ctx.quadraticCurveTo(2, -8, 0, -14);
      ctx.stroke();
      ellipse(ctx, -9, -16, 10, 5.5, 0.45, '#7ED957', 3.5);
      ellipse(ctx, 9, -16, 10, 5.5, -0.45, '#7ED957', 3.5);
      ctx.restore();
    }
  }

  function face(ctx, species, o) {
    const gx = (o.gaze || 0) * 7;
    const ey = -48;
    ctx.strokeStyle = INK;
    ctx.fillStyle = INK;
    ctx.lineCap = 'round';
    ctx.lineWidth = 4.5;
    [-1, 1].forEach((s) => {
      const x = s * 18 + gx;
      if (o.eyes === 'happy') {
        ctx.beginPath();
        ctx.arc(x, ey + 3, 6.5, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
      } else if (o.eyes === 'closed') {
        ctx.beginPath();
        ctx.arc(x, ey - 1, 6.5, Math.PI * 0.15, Math.PI * 0.85);
        ctx.stroke();
      } else {
        const big = o.eyes === 'wide' ? 1.25 : 1;
        ellipse(ctx, x, ey, 6.2 * big, 8 * big, 0, INK);
        ellipse(ctx, x + 2, ey - 3.2, 2.4 * big, 2.4 * big, 0, '#FFFFFF');
      }
    });
    // Blush
    ctx.globalAlpha = 0.55;
    ellipse(ctx, -31 + gx * 0.5, -34, 9, 5.5, 0, '#FF6F9A');
    ellipse(ctx, 31 + gx * 0.5, -34, 9, 5.5, 0, '#FF6F9A');
    ctx.globalAlpha = 1;

    const mx = gx * 0.8, my = -34;
    if (species === 'pup') ellipse(ctx, mx, my - 6, 5, 3.5, 0, INK);
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = INK;
    const m = o.mouth || 'smile';
    if (m === 'open') {
      ctx.beginPath();
      ctx.moveTo(mx - 7, my);
      ctx.quadraticCurveTo(mx, my + 14, mx + 7, my);
      ctx.closePath();
      ctx.fillStyle = '#C8406A';
      ctx.fill();
      ctx.stroke();
    } else if (m === 'chew') {
      const k = Math.abs(Math.sin(o.t * 14));
      ellipse(ctx, mx, my + 2, 5, 1.5 + k * 4, 0, '#C8406A', 3);
    } else if (m === 'o') {
      ellipse(ctx, mx, my + 2, 3.5, 4, 0, '#C8406A', 3);
    } else if (m === 'flat') {
      ctx.beginPath();
      ctx.moveTo(mx - 5, my + 2);
      ctx.lineTo(mx + 5, my + 2);
      ctx.stroke();
    } else if (species === 'kitty' || species === 'bunny') {
      ctx.beginPath();
      ctx.arc(mx - 4, my, 4, 0.1 * Math.PI, 0.9 * Math.PI);
      ctx.arc(mx + 4, my, 4, 0.1 * Math.PI, 0.9 * Math.PI);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(mx, my - 1, 6, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    }
    if (species === 'kitty') {
      ctx.lineWidth = 2.5;
      [-1, 1].forEach((s) => {
        ctx.beginPath();
        ctx.moveTo(mx + s * 40, my - 6);
        ctx.lineTo(mx + s * 54, my - 9);
        ctx.moveTo(mx + s * 40, my);
        ctx.lineTo(mx + s * 54, my + 1);
        ctx.stroke();
      });
    }
  }

  // o: { t, species, color, squash, lift, gaze, eyes, mouth, step, wiggle, carry, droop }
  function draw(ctx, o) {
    const c = COLORS[o.color] || COLORS.berry;
    const species = o.species;
    const sq = o.squash || 0;
    const lift = o.lift || 0;
    const step = o.step || 0;

    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // Feet stay on the ground while the body hops.
    [-1, 1].forEach((s) => {
      const lf = Math.max(0, Math.sin(step + (s > 0 ? Math.PI : 0))) * 8;
      ellipse(ctx, s * 22, -4 - lf - lift * 0.3, 12, 7, 0, c.shade, 4);
    });

    ctx.translate(0, -lift);
    ctx.scale(1 + sq * 0.5, 1 - sq);
    earsBehind(ctx, species, c, o);

    blob(ctx, 100, 90);
    ctx.fillStyle = c.body;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 5;
    ctx.stroke();

    // Belly and shine
    ctx.save();
    blob(ctx, 100, 90);
    ctx.clip();
    ellipse(ctx, 0, -8, 34, 20, 0, c.belly);
    ctx.globalAlpha = 0.7;
    ellipse(ctx, -28, -70, 5, 9, 0.6, '#FFFFFF');
    ctx.restore();

    decorFront(ctx, species, c, o);
    face(ctx, species, o);
    if (o.carry === 'ball') ball(ctx, (o.gaze || 0) * 6, -26, 11);
    ctx.restore();
  }

  // A small static portrait, used on the adopt and welcome screens.
  function portrait(canvas, species, color, opts) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const k = Math.min(w / 150, h / 150);
    ctx.save();
    ctx.translate(w / 2, h * 0.86);
    ctx.scale(k, k);
    ellipse(ctx, 0, 0, 48, 9, 0, 'rgba(0,0,0,0.25)');
    draw(ctx, Object.assign({ t: 0, species, color, eyes: 'open', mouth: 'smile' }, opts || {}));
    ctx.restore();
  }

  PC.pet = {
    INK,
    SPECIES,
    COLORS,
    create,
    load,
    save,
    clear,
    tick,
    catchUp,
    bump,
    level,
    addXP,
    wish,
    draw,
    portrait,
    heart,
    ball,
    cookie,
    ellipse,
  };
})(window.PC);
