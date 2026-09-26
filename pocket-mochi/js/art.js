/* Pocket Mochi — drawing helpers: shapes, snacks, hats, poop and particles.
   Everything is drawn with canvas paths in a flat "sticker" style: solid ink
   outlines around bright fills. */
(function (PM) {
  'use strict';

  const INK = '#22243D';
  const TAU = Math.PI * 2;

  const PET_COLORS = {
    pink:  { body: '#FFB3CF', dark: '#E57FA8', belly: '#FFDCE9', label: 'Strawberry' },
    mint:  { body: '#9FE7CA', dark: '#55B891', belly: '#D5F7E9', label: 'Matcha' },
    lemon: { body: '#FFE27A', dark: '#E2B43A', belly: '#FFF3C4', label: 'Yuzu' },
    lilac: { body: '#CDB9FF', dark: '#937BE0', belly: '#EAE1FF', label: 'Taro' },
    sky:   { body: '#A3D8FF', dark: '#5FA5DD', belly: '#D9EFFF', label: 'Soda' },
  };

  const SPECIES = {
    mochi: 'Mochi',
    kitty: 'Kitty',
    bunny: 'Bunny',
    pup: 'Pup',
  };

  // Snacks: food = how much it fills the food meter, fun/clean are side effects.
  // level = the pet level that unlocks it in the shop.
  const FOODS = {
    apple:    { name: 'Apple',     price: 3,  food: 16, fun: 2,  clean: 0,  xp: 3, level: 1 },
    onigiri:  { name: 'Onigiri',   price: 5,  food: 28, fun: 3,  clean: 0,  xp: 4, level: 1 },
    fish:     { name: 'Fish',      price: 8,  food: 40, fun: 5,  clean: -2, xp: 5, level: 1 },
    dango:    { name: 'Dango',     price: 7,  food: 20, fun: 14, clean: 0,  xp: 5, level: 1 },
    cupcake:  { name: 'Cupcake',   price: 10, food: 18, fun: 22, clean: -6, xp: 6, level: 1 },
    pizza:    { name: 'Pizza',     price: 12, food: 45, fun: 10, clean: -4, xp: 7, level: 4 },
    icecream: { name: 'Ice cream', price: 9,  food: 14, fun: 28, clean: -6, xp: 6, level: 8 },
  };

  const HATS = {
    party:      { name: 'Party hat',  price: 25, level: 1 },
    flower:     { name: 'Daisy',      price: 20, level: 1 },
    bow:        { name: 'Big bow',    price: 30, level: 1 },
    beanie:     { name: 'Beanie',     price: 35, level: 1 },
    shades:     { name: 'Sunglasses', price: 40, level: 1 },
    crown:      { name: 'Crown',      price: 60, level: 1 },
    chef:       { name: 'Chef hat',   price: 45, level: 6 },
    wizard:     { name: 'Wizard hat', price: 70, level: 10 },
    headphones: { name: 'Headphones', price: 80, level: 14 },
  };

  function outline(ctx, w) {
    ctx.lineWidth = w;
    ctx.strokeStyle = INK;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function heartPath(ctx, x, y, s) {
    // centered on (x, y), s = full height
    const t = y - s * 0.5;
    ctx.beginPath();
    ctx.moveTo(x, t + s * 0.3);
    ctx.bezierCurveTo(x, t, x - s * 0.5, t, x - s * 0.5, t + s * 0.32);
    ctx.bezierCurveTo(x - s * 0.5, t + s * 0.62, x - s * 0.1, t + s * 0.78, x, t + s);
    ctx.bezierCurveTo(x + s * 0.1, t + s * 0.78, x + s * 0.5, t + s * 0.62, x + s * 0.5, t + s * 0.32);
    ctx.bezierCurveTo(x + s * 0.5, t, x, t, x, t + s * 0.3);
    ctx.closePath();
  }

  function starPath(ctx, x, y, r, inner) {
    inner = inner || 0.48;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * inner : r;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
  }

  function sparklePath(ctx, x, y, r) {
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.quadraticCurveTo(x, y, x, y + r);
    ctx.quadraticCurveTo(x, y, x - r, y);
    ctx.quadraticCurveTo(x, y, x, y - r);
    ctx.closePath();
  }

  /* ---------- Snacks (drawn centered on x, y; s = overall size) ---------- */

  const foodDraw = {
    apple(ctx, s) {
      const lw = s * 0.06;
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.28);
      ctx.bezierCurveTo(s * 0.2, -s * 0.44, s * 0.48, -s * 0.3, s * 0.42, s * 0.05);
      ctx.bezierCurveTo(s * 0.38, s * 0.34, s * 0.18, s * 0.46, 0, s * 0.38);
      ctx.bezierCurveTo(-s * 0.18, s * 0.46, -s * 0.38, s * 0.34, -s * 0.42, s * 0.05);
      ctx.bezierCurveTo(-s * 0.48, -s * 0.3, -s * 0.2, -s * 0.44, 0, -s * 0.28);
      ctx.fillStyle = '#FF5A5F';
      ctx.fill();
      outline(ctx, lw);
      ctx.beginPath();
      ctx.ellipse(-s * 0.2, -s * 0.12, s * 0.07, s * 0.11, 0.5, 0, TAU);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.26);
      ctx.quadraticCurveTo(s * 0.02, -s * 0.4, s * 0.08, -s * 0.48);
      outline(ctx, lw);
      ctx.beginPath();
      ctx.ellipse(s * 0.18, -s * 0.4, s * 0.13, s * 0.07, -0.5, 0, TAU);
      ctx.fillStyle = '#6CCB5F';
      ctx.fill();
      outline(ctx, lw * 0.8);
    },
    onigiri(ctx, s) {
      const lw = s * 0.06;
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.42);
      ctx.quadraticCurveTo(s * 0.12, -s * 0.42, s * 0.44, s * 0.2);
      ctx.quadraticCurveTo(s * 0.5, s * 0.38, s * 0.3, s * 0.38);
      ctx.lineTo(-s * 0.3, s * 0.38);
      ctx.quadraticCurveTo(-s * 0.5, s * 0.38, -s * 0.44, s * 0.2);
      ctx.quadraticCurveTo(-s * 0.12, -s * 0.42, 0, -s * 0.42);
      ctx.closePath();
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      outline(ctx, lw);
      roundRect(ctx, -s * 0.17, s * 0.08, s * 0.34, s * 0.3, s * 0.03);
      ctx.fillStyle = '#2E4A3A';
      ctx.fill();
      outline(ctx, lw * 0.8);
      ctx.fillStyle = INK;
      [[-0.14, -0.08], [0.1, -0.16], [0.18, 0.0], [-0.05, -0.22]].forEach(([dx, dy]) => {
        ctx.beginPath();
        ctx.ellipse(dx * s, dy * s, s * 0.018, s * 0.03, 0.4, 0, TAU);
        ctx.fill();
      });
    },
    fish(ctx, s) {
      const lw = s * 0.06;
      ctx.beginPath();
      ctx.moveTo(s * 0.26, 0);
      ctx.lineTo(s * 0.48, -s * 0.2);
      ctx.lineTo(s * 0.48, s * 0.2);
      ctx.closePath();
      ctx.fillStyle = '#4F9DE0';
      ctx.fill();
      outline(ctx, lw);
      ctx.beginPath();
      ctx.ellipse(-s * 0.04, 0, s * 0.36, s * 0.22, 0, 0, TAU);
      ctx.fillStyle = '#7CC0F5';
      ctx.fill();
      outline(ctx, lw);
      ctx.beginPath();
      ctx.ellipse(-s * 0.04, s * 0.07, s * 0.26, s * 0.08, 0, 0, TAU);
      ctx.fillStyle = '#D4ECFF';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(-s * 0.22, -s * 0.05, s * 0.045, 0, TAU);
      ctx.fillStyle = INK;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-s * 0.04, -s * 0.14);
      ctx.quadraticCurveTo(s * 0.04, -s * 0.02, -s * 0.04, s * 0.1);
      outline(ctx, lw * 0.7);
    },
    dango(ctx, s) {
      const lw = s * 0.06;
      ctx.beginPath();
      ctx.moveTo(0, s * 0.48);
      ctx.lineTo(0, -s * 0.48);
      ctx.lineWidth = s * 0.07;
      ctx.strokeStyle = '#C98B4F';
      ctx.stroke();
      const balls = [['#8CD47E', 0.26], ['#FFFFFF', 0.0], ['#FF9FC4', -0.26]];
      balls.forEach(([c, dy]) => {
        ctx.beginPath();
        ctx.arc(0, dy * s, s * 0.15, 0, TAU);
        ctx.fillStyle = c;
        ctx.fill();
        outline(ctx, lw);
      });
    },
    cupcake(ctx, s) {
      const lw = s * 0.06;
      ctx.beginPath();
      ctx.moveTo(-s * 0.3, 0);
      ctx.lineTo(s * 0.3, 0);
      ctx.lineTo(s * 0.22, s * 0.42);
      ctx.lineTo(-s * 0.22, s * 0.42);
      ctx.closePath();
      ctx.fillStyle = '#6BC3F0';
      ctx.fill();
      outline(ctx, lw);
      ctx.beginPath();
      for (let i = -2; i <= 2; i++) {
        ctx.moveTo(i * s * 0.1, s * 0.04);
        ctx.lineTo(i * s * 0.08, s * 0.38);
      }
      ctx.lineWidth = lw * 0.6;
      ctx.strokeStyle = 'rgba(34,36,61,0.45)';
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-s * 0.36, s * 0.02);
      ctx.bezierCurveTo(-s * 0.44, -s * 0.2, -s * 0.2, -s * 0.36, 0, -s * 0.3);
      ctx.bezierCurveTo(s * 0.2, -s * 0.36, s * 0.44, -s * 0.2, s * 0.36, s * 0.02);
      ctx.closePath();
      ctx.fillStyle = '#FFB3D3';
      ctx.fill();
      outline(ctx, lw);
      ctx.beginPath();
      ctx.arc(0, -s * 0.36, s * 0.08, 0, TAU);
      ctx.fillStyle = '#FF4F6A';
      ctx.fill();
      outline(ctx, lw * 0.8);
      const sprinkles = ['#FFE27A', '#9FE7CA', '#FFFFFF', '#A3D8FF'];
      [[-0.2, -0.1], [0.12, -0.18], [0.22, -0.05], [-0.05, -0.14]].forEach(([dx, dy], i) => {
        ctx.save();
        ctx.translate(dx * s, dy * s);
        ctx.rotate(i * 1.3);
        roundRect(ctx, -s * 0.035, -s * 0.012, s * 0.07, s * 0.024, s * 0.012);
        ctx.fillStyle = sprinkles[i];
        ctx.fill();
        ctx.restore();
      });
    },
  };

  foodDraw.pizza = function (ctx, s) {
    const lw = s * 0.06;
    ctx.beginPath();
    ctx.moveTo(-s * 0.38, -s * 0.26);
    ctx.quadraticCurveTo(0, -s * 0.4, s * 0.38, -s * 0.26);
    ctx.lineTo(0, s * 0.46);
    ctx.closePath();
    ctx.fillStyle = '#FFD166';
    ctx.fill();
    outline(ctx, lw);
    ctx.beginPath();
    ctx.moveTo(-s * 0.42, -s * 0.3);
    ctx.quadraticCurveTo(0, -s * 0.48, s * 0.42, -s * 0.3);
    ctx.lineTo(s * 0.36, -s * 0.18);
    ctx.quadraticCurveTo(0, -s * 0.32, -s * 0.36, -s * 0.18);
    ctx.closePath();
    ctx.fillStyle = '#E0964A';
    ctx.fill();
    outline(ctx, lw);
    [[-0.12, -0.08], [0.13, -0.05], [0.01, 0.16]].forEach(([dx, dy]) => {
      ctx.beginPath();
      ctx.arc(dx * s, dy * s, s * 0.075, 0, TAU);
      ctx.fillStyle = '#E0564F';
      ctx.fill();
      outline(ctx, lw * 0.6);
    });
    ctx.beginPath();
    ctx.ellipse(-s * 0.02, s * 0.02, s * 0.03, s * 0.05, 0, 0, TAU);
    ctx.fillStyle = '#8CD47E';
    ctx.fill();
  };

  foodDraw.icecream = function (ctx, s) {
    const lw = s * 0.06;
    ctx.beginPath();
    ctx.moveTo(-s * 0.21, -s * 0.02);
    ctx.lineTo(s * 0.21, -s * 0.02);
    ctx.lineTo(0, s * 0.48);
    ctx.closePath();
    ctx.fillStyle = '#F2B36A';
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = 'rgba(34,36,61,0.35)';
    ctx.lineWidth = lw * 0.6;
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(i * s * 0.1 - s * 0.2, -s * 0.02);
      ctx.lineTo(i * s * 0.1 + s * 0.2, s * 0.5);
      ctx.moveTo(i * s * 0.1 + s * 0.2, -s * 0.02);
      ctx.lineTo(i * s * 0.1 - s * 0.2, s * 0.5);
      ctx.stroke();
    }
    ctx.restore();
    ctx.beginPath();
    ctx.moveTo(-s * 0.21, -s * 0.02);
    ctx.lineTo(s * 0.21, -s * 0.02);
    ctx.lineTo(0, s * 0.48);
    ctx.closePath();
    outline(ctx, lw);
    [['#FFB3CF', -0.08, 0.2], ['#9FE7CA', -0.3, 0.17]].forEach(([c, dy, r]) => {
      ctx.beginPath();
      ctx.arc(0, dy * s, r * s, 0, TAU);
      ctx.fillStyle = c;
      ctx.fill();
      outline(ctx, lw);
    });
    ctx.beginPath();
    ctx.arc(s * 0.02, -s * 0.5, s * 0.06, 0, TAU);
    ctx.fillStyle = '#FF4F6A';
    ctx.fill();
    outline(ctx, lw * 0.8);
  };

  function drawFood(ctx, type, x, y, s, rot) {
    const fn = foodDraw[type];
    if (!fn) return;
    ctx.save();
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    fn(ctx, s);
    ctx.restore();
  }

  /* ---------- Hats (origin = top-center of the head, w = body width) ---------- */

  const hatDraw = {
    party(ctx, w) {
      const lw = w * 0.025;
      ctx.save();
      ctx.rotate(0.18);
      ctx.beginPath();
      ctx.moveTo(-w * 0.16, w * 0.05);
      ctx.lineTo(0, -w * 0.36);
      ctx.lineTo(w * 0.16, w * 0.05);
      ctx.closePath();
      ctx.fillStyle = '#6BC3F0';
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = '#FFE27A';
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(-w * 0.3, -w * 0.3 + i * w * 0.12);
        ctx.lineTo(w * 0.3, -w * 0.22 + i * w * 0.12);
        ctx.lineTo(w * 0.3, -w * 0.18 + i * w * 0.12);
        ctx.lineTo(-w * 0.3, -w * 0.26 + i * w * 0.12);
        ctx.fill();
      }
      ctx.restore();
      ctx.beginPath();
      ctx.moveTo(-w * 0.16, w * 0.05);
      ctx.lineTo(0, -w * 0.36);
      ctx.lineTo(w * 0.16, w * 0.05);
      ctx.closePath();
      outline(ctx, lw);
      ctx.beginPath();
      ctx.arc(0, -w * 0.38, w * 0.05, 0, TAU);
      ctx.fillStyle = '#FF5DA2';
      ctx.fill();
      outline(ctx, lw);
      ctx.restore();
    },
    crown(ctx, w) {
      const lw = w * 0.025;
      const cw = w * 0.36;
      const ch = w * 0.2;
      ctx.beginPath();
      ctx.moveTo(-cw / 2, w * 0.04);
      ctx.lineTo(-cw / 2, -ch);
      ctx.lineTo(-cw / 4, -ch * 0.45);
      ctx.lineTo(0, -ch * 1.15);
      ctx.lineTo(cw / 4, -ch * 0.45);
      ctx.lineTo(cw / 2, -ch);
      ctx.lineTo(cw / 2, w * 0.04);
      ctx.closePath();
      ctx.fillStyle = '#FFC53D';
      ctx.fill();
      outline(ctx, lw);
      [[-cw / 4, '#FF5DA2'], [0, '#6BC3F0'], [cw / 4, '#9FE7CA']].forEach(([x, c]) => {
        ctx.beginPath();
        ctx.arc(x, -w * 0.03, w * 0.03, 0, TAU);
        ctx.fillStyle = c;
        ctx.fill();
        outline(ctx, lw * 0.7);
      });
    },
    bow(ctx, w) {
      const lw = w * 0.025;
      ctx.save();
      ctx.translate(w * 0.16, w * 0.02);
      ctx.rotate(0.2);
      [-1, 1].forEach((d) => {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(d * w * 0.08, -w * 0.16, d * w * 0.24, -w * 0.12, d * w * 0.2, 0);
        ctx.bezierCurveTo(d * w * 0.24, w * 0.12, d * w * 0.08, w * 0.16, 0, 0);
        ctx.fillStyle = '#FF5DA2';
        ctx.fill();
        outline(ctx, lw);
      });
      ctx.beginPath();
      ctx.arc(0, 0, w * 0.045, 0, TAU);
      ctx.fillStyle = '#FF8FBF';
      ctx.fill();
      outline(ctx, lw);
      ctx.restore();
    },
    flower(ctx, w) {
      const lw = w * 0.022;
      ctx.save();
      ctx.translate(-w * 0.14, w * 0.0);
      ctx.beginPath();
      ctx.moveTo(0, w * 0.05);
      ctx.quadraticCurveTo(w * 0.03, -w * 0.06, 0, -w * 0.12);
      ctx.lineWidth = w * 0.03;
      ctx.strokeStyle = '#4DAA57';
      ctx.stroke();
      ctx.translate(0, -w * 0.15);
      for (let i = 0; i < 6; i++) {
        ctx.save();
        ctx.rotate((i / 6) * TAU);
        ctx.beginPath();
        ctx.ellipse(0, -w * 0.07, w * 0.04, w * 0.065, 0, 0, TAU);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
        outline(ctx, lw);
        ctx.restore();
      }
      ctx.beginPath();
      ctx.arc(0, 0, w * 0.045, 0, TAU);
      ctx.fillStyle = '#FFC53D';
      ctx.fill();
      outline(ctx, lw);
      ctx.restore();
    },
    beanie(ctx, w) {
      const lw = w * 0.025;
      ctx.beginPath();
      ctx.moveTo(-w * 0.3, w * 0.08);
      ctx.bezierCurveTo(-w * 0.3, -w * 0.26, w * 0.3, -w * 0.26, w * 0.3, w * 0.08);
      ctx.closePath();
      ctx.fillStyle = '#FF7A45';
      ctx.fill();
      outline(ctx, lw);
      ctx.beginPath();
      for (let i = -2; i <= 2; i++) {
        ctx.moveTo(i * w * 0.1, w * 0.0);
        ctx.lineTo(i * w * 0.08, -w * 0.14);
      }
      ctx.lineWidth = lw * 0.7;
      ctx.strokeStyle = 'rgba(34,36,61,0.35)';
      ctx.stroke();
      roundRect(ctx, -w * 0.33, w * 0.0, w * 0.66, w * 0.1, w * 0.05);
      ctx.fillStyle = '#FFE27A';
      ctx.fill();
      outline(ctx, lw);
      ctx.beginPath();
      ctx.arc(0, -w * 0.2, w * 0.07, 0, TAU);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      outline(ctx, lw);
    },
  };

  hatDraw.chef = function (ctx, w) {
    const lw = w * 0.025;
    // stroke every puff thick, then fill on top so only the outer edge keeps a line
    const puffs = [[-0.13, -0.17, 0.12], [0, -0.24, 0.15], [0.13, -0.17, 0.12]];
    ctx.beginPath();
    puffs.forEach(([x, y, r]) => { ctx.moveTo((x + r) * w, y * w); ctx.arc(x * w, y * w, r * w, 0, TAU); });
    ctx.lineWidth = lw * 2;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    roundRect(ctx, -w * 0.21, -w * 0.12, w * 0.42, w * 0.16, w * 0.03);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    outline(ctx, lw);
    ctx.beginPath();
    ctx.moveTo(-w * 0.1, -w * 0.1);
    ctx.lineTo(-w * 0.1, w * 0.02);
    ctx.moveTo(w * 0.1, -w * 0.1);
    ctx.lineTo(w * 0.1, w * 0.02);
    ctx.lineWidth = lw * 0.7;
    ctx.strokeStyle = 'rgba(34,36,61,0.3)';
    ctx.stroke();
  };

  hatDraw.wizard = function (ctx, w) {
    const lw = w * 0.025;
    ctx.beginPath();
    ctx.ellipse(0, w * 0.02, w * 0.32, w * 0.07, 0, 0, TAU);
    ctx.fillStyle = '#6B4FC4';
    ctx.fill();
    outline(ctx, lw);
    ctx.beginPath();
    ctx.moveTo(-w * 0.18, w * 0.01);
    ctx.quadraticCurveTo(-w * 0.08, -w * 0.3, w * 0.12, -w * 0.5);
    ctx.quadraticCurveTo(w * 0.06, -w * 0.25, w * 0.18, w * 0.01);
    ctx.closePath();
    ctx.fillStyle = '#8A6CE0';
    ctx.fill();
    outline(ctx, lw);
    [[-0.04, -0.12, 0.05], [0.07, -0.28, 0.035], [0.09, -0.04, 0.03]].forEach(([x, y, r]) => {
      starPath(ctx, x * w, y * w, r * w);
      ctx.fillStyle = '#FFE27A';
      ctx.fill();
    });
  };

  hatDraw.headphones = function (ctx, w) {
    const lw = w * 0.025;
    // band over the head, cups over the ears
    ctx.beginPath();
    ctx.arc(0, w * 0.34, w * 0.44, Math.PI * 1.08, Math.PI * 1.92);
    ctx.lineCap = 'round';
    ctx.lineWidth = w * 0.07 + lw * 2;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.lineWidth = w * 0.07;
    ctx.strokeStyle = '#FF5DA2';
    ctx.stroke();
    [-1, 1].forEach((d) => {
      roundRect(ctx, d * w * 0.46 - w * 0.07, w * 0.22, w * 0.14, w * 0.24, w * 0.06);
      ctx.fillStyle = '#2E3160';
      ctx.fill();
      outline(ctx, lw);
      roundRect(ctx, d * w * 0.46 - w * 0.035, w * 0.26, w * 0.07, w * 0.16, w * 0.03);
      ctx.fillStyle = '#FF8FBF';
      ctx.fill();
    });
  };

  function drawHat(ctx, type, w) {
    if (hatDraw[type]) hatDraw[type](ctx, w);
  }

  // Sunglasses sit on the face instead of the head.
  function drawShades(ctx, w, eyeY) {
    const lw = w * 0.022;
    ctx.save();
    ctx.translate(0, eyeY);
    [-1, 1].forEach((d) => {
      roundRect(ctx, d * w * 0.19 - w * 0.12, -w * 0.07, w * 0.24, w * 0.14, w * 0.05);
      ctx.fillStyle = '#1B1D36';
      ctx.fill();
      outline(ctx, lw);
      ctx.beginPath();
      ctx.moveTo(d * w * 0.19 - w * 0.06, -w * 0.035);
      ctx.lineTo(d * w * 0.19 - w * 0.01, -w * 0.035);
      ctx.lineWidth = lw * 0.9;
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.stroke();
    });
    ctx.beginPath();
    ctx.moveTo(-w * 0.07, -w * 0.02);
    ctx.quadraticCurveTo(0, -w * 0.05, w * 0.07, -w * 0.02);
    outline(ctx, lw);
    ctx.restore();
  }

  function drawPoop(ctx, x, y, s) {
    const lw = Math.max(2, s * 0.07);
    ctx.save();
    ctx.translate(x, y);
    const tiers = [[0, -0.14, 0.44, 0.17], [0, -0.38, 0.32, 0.14], [0.02, -0.58, 0.18, 0.12]];
    tiers.forEach(([dx, dy, rx, ry]) => {
      ctx.beginPath();
      ctx.ellipse(dx * s, dy * s, rx * s, ry * s, 0, 0, TAU);
      ctx.fillStyle = '#9A6A45';
      ctx.fill();
      outline(ctx, lw);
    });
    ctx.beginPath();
    ctx.moveTo(0.02 * s, -0.66 * s);
    ctx.quadraticCurveTo(0.12 * s, -0.8 * s, 0.04 * s, -0.84 * s);
    outline(ctx, lw);
    ctx.beginPath();
    ctx.ellipse(-0.14 * s, -0.42 * s, 0.05 * s, 0.03 * s, -0.3, 0, TAU);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fill();
    ctx.restore();
  }

  /* ---------- Small icons used in thought bubbles ---------- */

  function drawNeedIcon(ctx, need, x, y, s, t) {
    ctx.save();
    ctx.translate(x, y);
    const lw = s * 0.08;
    switch (need) {
      case 'hunger':
        foodDraw.onigiri(ctx, s);
        break;
      case 'fun':
        starPath(ctx, 0, 0, s * 0.45);
        ctx.fillStyle = '#FFC53D';
        ctx.fill();
        outline(ctx, lw);
        break;
      case 'energy':
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.38, 0.6, TAU - 0.6);
        ctx.arc(s * 0.2, -s * 0.05, s * 0.3, TAU - 1.2, 1.2, true);
        ctx.closePath();
        ctx.fillStyle = '#FFE27A';
        ctx.fill();
        outline(ctx, lw);
        ctx.fillStyle = INK;
        ctx.font = `800 ${s * 0.32}px ${PM.FONT_DISPLAY}`;
        ctx.fillText('z', s * 0.2, -s * 0.2 + Math.sin(t * 3) * s * 0.04);
        break;
      case 'clean':
        [[-0.12, 0.08, 0.26], [0.2, -0.16, 0.16], [0.24, 0.2, 0.1]].forEach(([dx, dy, r]) => {
          ctx.beginPath();
          ctx.arc(dx * s, dy * s, r * s, 0, TAU);
          ctx.fillStyle = '#E4F6FF';
          ctx.fill();
          outline(ctx, lw * 0.8);
        });
        break;
      case 'sick':
        ctx.rotate(-0.6);
        roundRect(ctx, -s * 0.4, -s * 0.16, s * 0.8, s * 0.32, s * 0.16);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
        ctx.save();
        ctx.clip();
        ctx.fillStyle = '#FF5A5F';
        ctx.fillRect(-s * 0.4, -s * 0.2, s * 0.4, s * 0.4);
        ctx.restore();
        roundRect(ctx, -s * 0.4, -s * 0.16, s * 0.8, s * 0.32, s * 0.16);
        outline(ctx, lw);
        break;
      case 'poop':
        drawPoop(ctx, 0, s * 0.35, s * 0.8);
        break;
      default:
        break;
    }
    ctx.restore();
  }

  /* ---------- Particles ---------- */

  class Particles {
    constructor() { this.list = []; }

    add(p) {
      if (this.list.length > 260) this.list.shift();
      this.list.push(Object.assign({ vx: 0, vy: 0, g: 0, life: 1, age: 0, size: 10, rot: 0, vr: 0, drag: 0 }, p));
    }

    hearts(x, y, n) {
      for (let i = 0; i < n; i++) {
        this.add({ kind: 'heart', x: x + (Math.random() - 0.5) * 30, y, vx: (Math.random() - 0.5) * 50,
          vy: -60 - Math.random() * 60, life: 1.1, size: 14 + Math.random() * 8 });
      }
    }

    sparkles(x, y, n, spread) {
      spread = spread || 40;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU;
        const sp = 40 + Math.random() * 90;
        this.add({ kind: 'sparkle', x: x + Math.cos(a) * spread * 0.3, y: y + Math.sin(a) * spread * 0.3,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 3, life: 0.7, size: 6 + Math.random() * 7,
          color: Math.random() < 0.5 ? '#FFC53D' : '#FFFFFF' });
      }
    }

    confetti(x, y, n) {
      const colors = ['#FF5DA2', '#FFC53D', '#6BC3F0', '#9FE7CA', '#CDB9FF'];
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
        const sp = 180 + Math.random() * 260;
        this.add({ kind: 'confetti', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 420, drag: 1.2,
          life: 1.8, size: 6 + Math.random() * 5, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 12,
          color: colors[i % colors.length] });
      }
    }

    crumbs(x, y, n, color) {
      for (let i = 0; i < n; i++) {
        this.add({ kind: 'crumb', x, y, vx: (Math.random() - 0.5) * 160, vy: -40 - Math.random() * 120,
          g: 600, life: 0.6, size: 3 + Math.random() * 3, color: color || '#FFFFFF' });
      }
    }

    bubbles(x, y, n) {
      for (let i = 0; i < n; i++) {
        this.add({ kind: 'bubble', x: x + (Math.random() - 0.5) * 40, y: y + (Math.random() - 0.5) * 20,
          vx: (Math.random() - 0.5) * 30, vy: -30 - Math.random() * 50, life: 1 + Math.random() * 0.6,
          size: 5 + Math.random() * 9 });
      }
    }

    zzz(x, y) {
      this.add({ kind: 'z', x, y, vx: 14 + Math.random() * 10, vy: -26, life: 2.2, size: 14 + Math.random() * 8 });
    }

    note(x, y) {
      this.add({ kind: 'note', x, y, vx: (Math.random() - 0.5) * 30, vy: -50, life: 1.2, size: 18 });
    }

    // Water falling from y across x0..x1 (the shower).
    drops(x0, x1, y, n) {
      for (let i = 0; i < n; i++) {
        this.add({ kind: 'drop', x: x0 + Math.random() * (x1 - x0), y: y + Math.random() * 8, vy: 120 + Math.random() * 520,
          g: 900, life: 0.9, size: 9 + Math.random() * 6 });
      }
    }

    stink(x, y) {
      this.add({ kind: 'stink', x, y, vy: -30, life: 1.6, size: 16, phase: Math.random() * TAU });
    }

    poof(x, y) {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        this.add({ kind: 'puff', x, y, vx: Math.cos(a) * 70, vy: Math.sin(a) * 70, drag: 4, life: 0.5, size: 10 });
      }
    }

    shell(x, y, n) {
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6;
        const sp = 140 + Math.random() * 180;
        this.add({ kind: 'shell', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 700, life: 1.2,
          size: 10 + Math.random() * 10, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 10 });
      }
    }

    update(dt) {
      const L = this.list;
      for (let i = L.length - 1; i >= 0; i--) {
        const p = L[i];
        p.age += dt;
        if (p.age >= p.life) { L.splice(i, 1); continue; }
        if (p.drag) {
          const k = Math.exp(-p.drag * dt);
          p.vx *= k;
          p.vy *= k;
        }
        p.vy += p.g * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
      }
    }

    draw(ctx) {
      for (const p of this.list) {
        const k = p.age / p.life;
        const fade = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
        ctx.save();
        ctx.globalAlpha = Math.max(0, fade);
        ctx.translate(p.x, p.y);
        switch (p.kind) {
          case 'heart': {
            const s = p.size * (0.6 + Math.min(1, p.age * 5) * 0.4);
            ctx.translate(Math.sin(p.age * 6) * 4, 0);
            heartPath(ctx, 0, 0, s);
            ctx.fillStyle = '#FF5DA2';
            ctx.fill();
            outline(ctx, 2);
            break;
          }
          case 'sparkle':
            sparklePath(ctx, 0, 0, p.size * (1 - k * 0.5));
            ctx.fillStyle = p.color;
            ctx.fill();
            break;
          case 'confetti':
            ctx.rotate(p.rot);
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
            break;
          case 'crumb':
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(0, 0, p.size, 0, TAU);
            ctx.fill();
            outline(ctx, 1.5);
            break;
          case 'bubble':
            ctx.beginPath();
            ctx.arc(0, 0, p.size, 0, TAU);
            ctx.fillStyle = 'rgba(235,248,255,0.55)';
            ctx.fill();
            ctx.lineWidth = 1.8;
            ctx.strokeStyle = '#6BC3F0';
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(-p.size * 0.35, -p.size * 0.35, p.size * 0.22, 0, TAU);
            ctx.fillStyle = '#FFFFFF';
            ctx.fill();
            break;
          case 'z':
            ctx.font = `${p.size}px ${PM.FONT_DISPLAY}`;
            ctx.fillStyle = '#FFFDF8';
            ctx.strokeStyle = INK;
            ctx.lineWidth = 3;
            ctx.strokeText('z', 0, 0);
            ctx.fillText('z', 0, 0);
            break;
          case 'note':
            ctx.fillStyle = '#FF5DA2';
            ctx.font = `800 ${p.size}px ${PM.FONT_BODY}`;
            ctx.fillText('♪', 0, 0);
            break;
          case 'drop':
            ctx.beginPath();
            ctx.moveTo(0, -p.size);
            ctx.quadraticCurveTo(p.size * 0.45, 0, 0, p.size * 0.3);
            ctx.quadraticCurveTo(-p.size * 0.45, 0, 0, -p.size);
            ctx.fillStyle = '#6BC3F0';
            ctx.fill();
            break;
          case 'stink':
            ctx.beginPath();
            for (let i = 0; i <= 12; i++) {
              const yy = -i * 2.2;
              const xx = Math.sin(p.phase + i * 0.7 + p.age * 5) * 4;
              if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
            }
            ctx.lineWidth = 2.5;
            ctx.strokeStyle = '#7FAE4A';
            ctx.stroke();
            break;
          case 'puff':
            ctx.beginPath();
            ctx.arc(0, 0, p.size * (1 - k * 0.6), 0, TAU);
            ctx.fillStyle = '#FFFFFF';
            ctx.fill();
            break;
          case 'shell':
            ctx.rotate(p.rot);
            ctx.beginPath();
            ctx.moveTo(-p.size / 2, 0);
            ctx.lineTo(-p.size / 4, -p.size / 2);
            ctx.lineTo(0, -p.size * 0.1);
            ctx.lineTo(p.size / 4, -p.size / 2);
            ctx.lineTo(p.size / 2, 0);
            ctx.quadraticCurveTo(0, p.size * 0.5, -p.size / 2, 0);
            ctx.fillStyle = '#FFF8EE';
            ctx.fill();
            outline(ctx, 2);
            break;
          default:
            break;
        }
        ctx.restore();
      }
    }
  }

  /* ---------- Icon images for the HTML tray and shop ---------- */

  function iconURL(draw, size) {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const c = document.createElement('canvas');
    c.width = c.height = Math.round(size * dpr);
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    draw(g, size);
    return c.toDataURL();
  }

  PM.INK = INK;
  PM.FONT_DISPLAY = '"Mochiy Pop One", "Arial Rounded MT Bold", "Trebuchet MS", system-ui, sans-serif';
  PM.FONT_BODY = '"M PLUS Rounded 1c", "Nunito", system-ui, -apple-system, "Segoe UI", sans-serif';
  PM.PET_COLORS = PET_COLORS;
  PM.SPECIES = SPECIES;
  PM.FOODS = FOODS;
  PM.HATS = HATS;
  PM.Particles = Particles;
  PM.art = {
    TAU, outline, roundRect, heartPath, starPath, sparklePath,
    drawFood, drawHat, drawShades, drawPoop, drawNeedIcon,
    foodIcon: (type, size) => iconURL((g, s) => drawFood(g, type, s / 2, s / 2, s * 0.86), size),
    hatIcon: (type, size) => iconURL((g, s) => {
      // [width, x, y] framing per hat so each one sits centered in its tile
      const frame = {
        party: [1.5, 0.5, 0.78], crown: [2.0, 0.5, 0.69], bow: [1.8, 0.21, 0.46],
        chef: [1.8, 0.5, 0.74], wizard: [1.45, 0.47, 0.8], headphones: [0.9, 0.5, 0.26],
        flower: [2.2, 0.81, 0.76], beanie: [1.4, 0.5, 0.62], shades: [1.3, 0.5, 0.5],
      }[type] || [1.5, 0.5, 0.6];
      g.translate(s * frame[1], s * frame[2]);
      if (type === 'shades') drawShades(g, s * frame[0], 0);
      else drawHat(g, type, s * frame[0]);
    }, size),
  };
})(window.PM = window.PM || {});
