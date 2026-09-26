/* Pocket Mochi — the house. Five rooms drawn in the same sticker style.
   Each room has a static background (main.js caches it), live details drawn
   every frame (the kitchen clock, the arcade screen), and an optional
   foreground drawn over the pet (the bathtub's front, the blanket at night).
   draw() returns the room's layout: where the floor is, where the pet stands,
   and the props you can tap. */
(function (PM) {
  'use strict';

  const { TAU, outline, roundRect, heartPath, starPath, sparklePath } = PM.art;
  const INK = PM.INK;
  const PAPER = '#FFFDF8';

  const ROOMS = [
    { id: 'living', name: 'Living room' },
    { id: 'kitchen', name: 'Kitchen' },
    { id: 'bathroom', name: 'Bathroom' },
    { id: 'bedroom', name: 'Bedroom' },
    { id: 'playroom', name: 'Playroom' },
  ];

  /* ---------- shared pieces ---------- */

  function wallDots(ctx, W, bottom, color, gap, r) {
    ctx.fillStyle = color;
    for (let y = 14, row = 0; y < bottom - 6; y += gap, row++) {
      for (let x = (row % 2) * (gap / 2) + 8; x < W; x += gap) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
      }
    }
  }

  function baseboard(ctx, W, floorY) {
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, floorY - 8, W, 10);
    ctx.beginPath();
    ctx.moveTo(0, floorY + 2);
    ctx.lineTo(W, floorY + 2);
    outline(ctx, 3);
  }

  function planks(ctx, W, H, floorY, fill, line) {
    ctx.fillStyle = fill;
    ctx.fillRect(0, floorY, W, H - floorY);
    ctx.strokeStyle = line;
    ctx.lineWidth = 2;
    for (let i = 1; i < 6; i++) {
      const y = floorY + (H - floorY) * (i / 6) ** 0.8;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
  }

  function checker(ctx, x0, y0, x1, y1, size, colors) {
    for (let y = y0, r = 0; y < y1; y += size, r++) {
      for (let x = x0, c = 0; x < x1; x += size, c++) {
        ctx.fillStyle = colors[(r + c) % colors.length];
        ctx.fillRect(x, y, size + 0.5, size + 0.5);
      }
    }
  }

  function rug(ctx, cx, cy, rx, ry, fill, stitch) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU);
    ctx.fillStyle = fill;
    ctx.fill();
    outline(ctx, 3);
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * 0.75, ry * 0.64, 0, 0, TAU);
    ctx.setLineDash([6, 7]);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = stitch;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawWindow(ctx, wx, wy, ww, wh, night) {
    roundRect(ctx, wx, wy, ww, wh, 14);
    const sky = ctx.createLinearGradient(0, wy, 0, wy + wh);
    sky.addColorStop(0, night ? '#1A1F4E' : '#7FCBFF');
    sky.addColorStop(1, night ? '#3A3F86' : '#D8F1FF');
    ctx.fillStyle = sky;
    ctx.fill();
    ctx.save();
    roundRect(ctx, wx, wy, ww, wh, 14);
    ctx.clip();
    if (night) {
      ctx.fillStyle = '#FFF4C2';
      ctx.beginPath();
      ctx.arc(wx + ww * 0.7, wy + wh * 0.32, wh * 0.16, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#1F2458';
      ctx.beginPath();
      ctx.arc(wx + ww * 0.76, wy + wh * 0.27, wh * 0.14, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      [[0.18, 0.2], [0.32, 0.55], [0.5, 0.18], [0.14, 0.72], [0.86, 0.7], [0.58, 0.8]].forEach(([fx, fy]) => {
        sparklePath(ctx, wx + ww * fx, wy + wh * fy, 4);
        ctx.fill();
      });
    } else {
      ctx.fillStyle = '#FFD84D';
      ctx.beginPath();
      ctx.arc(wx + ww * 0.74, wy + wh * 0.3, wh * 0.14, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      const cx = wx + ww * 0.3;
      const cy = wy + wh * 0.62;
      [[0, 0, 0.14], [0.13, -0.05, 0.12], [0.26, 0.01, 0.1], [-0.12, 0.03, 0.09]].forEach(([dx, dy, r]) => {
        ctx.beginPath();
        ctx.arc(cx + dx * ww, cy + dy * ww, r * ww, 0, TAU);
        ctx.fill();
      });
    }
    ctx.restore();
    ctx.fillStyle = PAPER;
    ctx.fillRect(wx + ww / 2 - 3, wy, 6, wh);
    ctx.fillRect(wx, wy + wh / 2 - 3, ww, 6);
    roundRect(ctx, wx, wy, ww, wh, 14);
    ctx.lineWidth = 7;
    ctx.strokeStyle = PAPER;
    ctx.stroke();
    roundRect(ctx, wx - 3.5, wy - 3.5, ww + 7, wh + 7, 17);
    outline(ctx, 3);
    roundRect(ctx, wx - 10, wy + wh + 2, ww + 20, 10, 5);
    ctx.fillStyle = PAPER;
    ctx.fill();
    outline(ctx, 3);
  }

  function cloud(ctx, x, y, s) {
    const puffs = [[-0.5, 0.1, 0.45], [0.45, 0.12, 0.42], [0, -0.15, 0.58]];
    ctx.beginPath();
    puffs.forEach(([dx, dy, r]) => {
      ctx.moveTo(x + dx * s + r * s, y + dy * s);
      ctx.arc(x + dx * s, y + dy * s, r * s, 0, TAU);
    });
    ctx.lineWidth = 6;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
  }

  /* ---------- living room ---------- */

  function living(ctx, W, H, night) {
    const floorY = Math.round(H * 0.62);
    ctx.fillStyle = '#BFE6DA';
    ctx.fillRect(0, 0, W, floorY);
    wallDots(ctx, W, floorY, '#D2EFE6', 26, 3.2);

    drawWindow(ctx, W * 0.07, H * 0.08, Math.min(W * 0.38, 170), Math.min(H * 0.24, 150), night);

    // framed doodle
    const fw = Math.min(W * 0.22, 96);
    const fh = fw * 1.2;
    ctx.save();
    ctx.translate(W * 0.88 - fw / 2, H * 0.1 + fh / 2);
    ctx.rotate(0.05);
    roundRect(ctx, -fw / 2, -fh / 2, fw, fh, 6);
    ctx.fillStyle = '#FFC53D';
    ctx.fill();
    outline(ctx, 3);
    roundRect(ctx, -fw / 2 + 8, -fh / 2 + 8, fw - 16, fh - 16, 3);
    ctx.fillStyle = PAPER;
    ctx.fill();
    outline(ctx, 2);
    heartPath(ctx, 0, 0, fw * 0.4);
    ctx.fillStyle = '#FF5DA2';
    ctx.fill();
    outline(ctx, 2.5);
    ctx.restore();

    planks(ctx, W, H, floorY, '#F2B36A', '#DE9A52');
    baseboard(ctx, W, floorY);
    const groundY = H * 0.8;
    rug(ctx, W / 2, groundY, W * 0.4, H * 0.07, '#FF8FBF', '#FFD0E4');

    // plant
    const px = W * 0.1;
    const py = floorY + 22;
    [[-0.5, 44], [0.1, 52], [0.6, 40]].forEach(([a, len]) => {
      ctx.save();
      ctx.translate(px, py - 30);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.ellipse(0, -len / 2, 10, len / 2, 0, 0, TAU);
      ctx.fillStyle = '#5CC07A';
      ctx.fill();
      outline(ctx, 2.5);
      ctx.beginPath();
      ctx.moveTo(0, -4);
      ctx.lineTo(0, -len + 8);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#3E9A5C';
      ctx.stroke();
      ctx.restore();
    });
    ctx.beginPath();
    ctx.moveTo(px - 22, py - 34);
    ctx.lineTo(px + 22, py - 34);
    ctx.lineTo(px + 16, py);
    ctx.lineTo(px - 16, py);
    ctx.closePath();
    ctx.fillStyle = '#FF7A45';
    ctx.fill();
    outline(ctx, 3);

    return { floorY, groundY, poopY: groundY + 4, zone: [0.3, 0.7] };
  }

  /* ---------- kitchen ---------- */

  function kitchen(ctx, W, H, night) {
    const floorY = Math.round(H * 0.62);
    ctx.fillStyle = '#FFE9AE';
    ctx.fillRect(0, 0, W, floorY);
    ctx.fillStyle = '#FFF1CB';
    for (let x = 6; x < W; x += 30) ctx.fillRect(x, 0, 13, floorY);

    checker(ctx, 0, floorY, W, H, Math.max(26, W / 9), ['#FFF7E6', '#9ED8CE']);
    baseboard(ctx, W, floorY);

    const counterX = W * 0.6;
    const counterTop = H * 0.47;
    const cabBottom = floorY + H * 0.05;

    // window with a little valance, above the counter
    const ww = Math.min(W * 0.3, 130);
    const wh = Math.min(H * 0.16, 96);
    const wx = counterX + (W - counterX - ww) / 2;
    const wy = H * 0.09;
    drawWindow(ctx, wx, wy, ww, wh, night);
    roundRect(ctx, wx - 10, wy - 14, ww + 20, 16, 6);
    ctx.fillStyle = '#FF8FBF';
    ctx.fill();
    outline(ctx, 2.5);

    // tiled backsplash
    const bsTop = H * 0.32;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(counterX, bsTop, W - counterX, counterTop - bsTop);
    ctx.strokeStyle = '#CFE8F5';
    ctx.lineWidth = 2;
    for (let x = counterX; x < W; x += 16) { ctx.beginPath(); ctx.moveTo(x, bsTop); ctx.lineTo(x, counterTop); ctx.stroke(); }
    for (let y = bsTop; y < counterTop; y += 16) { ctx.beginPath(); ctx.moveTo(counterX, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.beginPath();
    ctx.moveTo(counterX, bsTop);
    ctx.lineTo(W, bsTop);
    outline(ctx, 2.5);

    // cabinets and counter
    roundRect(ctx, counterX, counterTop, W - counterX + 12, cabBottom - counterTop, 6);
    ctx.fillStyle = '#9AD0EC';
    ctx.fill();
    outline(ctx, 3);
    const doorW = (W - counterX - 18) / 2;
    for (let i = 0; i < 2; i++) {
      const dx = counterX + 6 + i * (doorW + 6);
      roundRect(ctx, dx, counterTop + 12, doorW, cabBottom - counterTop - 22, 5);
      ctx.fillStyle = '#B7DEF2';
      ctx.fill();
      outline(ctx, 2.5);
      ctx.beginPath();
      ctx.arc(dx + (i ? 8 : doorW - 8), counterTop + (cabBottom - counterTop) * 0.4, 3.5, 0, TAU);
      ctx.fillStyle = INK;
      ctx.fill();
    }
    roundRect(ctx, counterX - 6, counterTop - 10, W - counterX + 20, 14, 5);
    ctx.fillStyle = '#F2B36A';
    ctx.fill();
    outline(ctx, 3);

    // pot and fruit bowl on the counter
    const pot = { x: counterX + (W - counterX) * 0.3, y: counterTop - 10 };
    roundRect(ctx, pot.x - 22, pot.y - 30, 44, 30, 8);
    ctx.fillStyle = '#E0564F';
    ctx.fill();
    outline(ctx, 3);
    roundRect(ctx, pot.x - 26, pot.y - 34, 52, 8, 4);
    ctx.fillStyle = '#F07A72';
    ctx.fill();
    outline(ctx, 2.5);
    ctx.beginPath();
    ctx.arc(pot.x, pot.y - 38, 4, 0, TAU);
    ctx.fillStyle = INK;
    ctx.fill();
    const bowl = { x: counterX + (W - counterX) * 0.74, y: counterTop - 10 };
    [['#FF5A5F', -9, -12], ['#FFB347', 5, -14], ['#8CD47E', -1, -20]].forEach(([c, dx, dy]) => {
      ctx.beginPath();
      ctx.arc(bowl.x + dx, bowl.y + dy, 8, 0, TAU);
      ctx.fillStyle = c;
      ctx.fill();
      outline(ctx, 2);
    });
    ctx.beginPath();
    ctx.ellipse(bowl.x, bowl.y - 10, 20, 12, 0, 0, Math.PI);
    ctx.closePath();
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    outline(ctx, 2.5);

    // fridge
    const fr = { x: W * 0.05, y: H * 0.15, w: Math.min(W * 0.27, 120) };
    fr.h = cabBottom - fr.y;
    roundRect(ctx, fr.x, fr.y, fr.w, fr.h, 14);
    ctx.fillStyle = '#E8F6FF';
    ctx.fill();
    outline(ctx, 3);
    ctx.beginPath();
    ctx.moveTo(fr.x, fr.y + fr.h * 0.36);
    ctx.lineTo(fr.x + fr.w, fr.y + fr.h * 0.36);
    outline(ctx, 3);
    roundRect(ctx, fr.x + fr.w - 16, fr.y + fr.h * 0.14, 7, fr.h * 0.14, 3.5);
    ctx.fillStyle = '#B7C4D8';
    ctx.fill();
    outline(ctx, 2);
    roundRect(ctx, fr.x + fr.w - 16, fr.y + fr.h * 0.44, 7, fr.h * 0.18, 3.5);
    ctx.fill();
    outline(ctx, 2);
    heartPath(ctx, fr.x + fr.w * 0.3, fr.y + fr.h * 0.18, 18);
    ctx.fillStyle = '#FF5DA2';
    ctx.fill();
    outline(ctx, 2);
    starPath(ctx, fr.x + fr.w * 0.52, fr.y + fr.h * 0.55, 10);
    ctx.fillStyle = '#FFC53D';
    ctx.fill();
    outline(ctx, 2);
    ctx.save();
    ctx.translate(fr.x + fr.w * 0.28, fr.y + fr.h * 0.68);
    ctx.rotate(-0.08);
    roundRect(ctx, -14, -12, 28, 28, 3);
    ctx.fillStyle = PAPER;
    ctx.fill();
    outline(ctx, 2);
    ctx.strokeStyle = '#9EA3D6';
    ctx.lineWidth = 2;
    [-3, 3, 9].forEach((y) => { ctx.beginPath(); ctx.moveTo(-8, y); ctx.lineTo(8, y); ctx.stroke(); });
    ctx.restore();

    // wall clock (hands are drawn live)
    const clock = { x: (fr.x + fr.w + counterX) / 2, y: H * 0.16, r: Math.min(W, H) * 0.07 };
    ctx.beginPath();
    ctx.arc(clock.x, clock.y, clock.r + 5, 0, TAU);
    ctx.fillStyle = '#FF8A3D';
    ctx.fill();
    outline(ctx, 3);
    ctx.beginPath();
    ctx.arc(clock.x, clock.y, clock.r, 0, TAU);
    ctx.fillStyle = PAPER;
    ctx.fill();
    outline(ctx, 2);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      const r0 = clock.r * (i % 3 ? 0.8 : 0.7);
      ctx.beginPath();
      ctx.moveTo(clock.x + Math.cos(a) * r0, clock.y + Math.sin(a) * r0);
      ctx.lineTo(clock.x + Math.cos(a) * clock.r * 0.9, clock.y + Math.sin(a) * clock.r * 0.9);
      ctx.lineWidth = 2;
      ctx.strokeStyle = INK;
      ctx.stroke();
    }

    const groundY = H * 0.82;
    rug(ctx, W * 0.46, groundY, W * 0.3, H * 0.05, '#FFB347', '#FFD9A0');

    return { floorY, groundY, poopY: H * 0.72, zone: [0.34, 0.62], fridge: fr, clock, pot };
  }

  function kitchenLive(ctx, L, t) {
    const { clock, pot } = L;
    const now = new Date();
    const min = now.getMinutes() + now.getSeconds() / 60;
    const hr = (now.getHours() % 12) + min / 60;
    [[hr / 12, 0.5, 3.5], [min / 60, 0.75, 2.5]].forEach(([f, len, w]) => {
      const a = f * TAU - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(clock.x, clock.y);
      ctx.lineTo(clock.x + Math.cos(a) * clock.r * len, clock.y + Math.sin(a) * clock.r * len);
      ctx.lineWidth = w;
      ctx.lineCap = 'round';
      ctx.strokeStyle = INK;
      ctx.stroke();
    });
    ctx.beginPath();
    ctx.arc(clock.x, clock.y, 3, 0, TAU);
    ctx.fillStyle = '#FF5DA2';
    ctx.fill();

    // steam from the pot
    ctx.save();
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const phase = (t * 0.6 + i / 3) % 1;
      ctx.globalAlpha = Math.sin(phase * Math.PI) * 0.8;
      ctx.beginPath();
      for (let k = 0; k <= 8; k++) {
        const y = pot.y - 44 - phase * 22 - k * 3;
        const x = pot.x - 10 + i * 10 + Math.sin(k * 0.9 + t * 4 + i) * 3;
        if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = '#9FB3CC';
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ---------- bathroom ---------- */

  function bathroom(ctx, W, H) {
    const floorY = Math.round(H * 0.6);
    ctx.fillStyle = '#CFEFFF';
    ctx.fillRect(0, 0, W, floorY);
    ctx.strokeStyle = '#EAF9FF';
    ctx.lineWidth = 2;
    for (let x = 0; x < W; x += 26) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, floorY); ctx.stroke(); }
    for (let y = 0; y < floorY; y += 26) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    checker(ctx, 0, floorY, W, H, Math.max(20, W / 12), ['#E9F7FB', '#B7E3EE']);
    baseboard(ctx, W, floorY);

    const tub = { x0: W * 0.08, x1: W * 0.72, rimY: H * 0.66, bottom: H * 0.87, ry: Math.max(8, H * 0.03) };
    tub.cx = (tub.x0 + tub.x1) / 2;
    tub.rx = (tub.x1 - tub.x0) / 2;

    // towel rack
    const bx0 = W * 0.04;
    const bx1 = W * 0.22;
    const by = H * 0.24;
    roundRect(ctx, bx0 + 6, by + 3, bx1 - bx0 - 12, H * 0.17, 6);
    ctx.fillStyle = '#FF8FBF';
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(bx0 + 6, by + H * 0.13, bx1 - bx0 - 12, 5);
    roundRect(ctx, bx0 + 6, by + 3, bx1 - bx0 - 12, H * 0.17, 6);
    outline(ctx, 3);
    roundRect(ctx, bx0, by - 3, bx1 - bx0, 7, 3.5);
    ctx.fillStyle = '#D5DCEB';
    ctx.fill();
    outline(ctx, 2.5);

    // round mirror
    const mr = Math.min(W, H) * 0.085;
    const mx = W * 0.44;
    const my = H * 0.17;
    ctx.beginPath();
    ctx.arc(mx, my, mr + 6, 0, TAU);
    ctx.fillStyle = '#FFC53D';
    ctx.fill();
    outline(ctx, 3);
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, TAU);
    ctx.fillStyle = '#E8F8FF';
    ctx.fill();
    outline(ctx, 2);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(mx - mr * 0.5, my - mr * 0.1);
    ctx.lineTo(mx - mr * 0.1, my - mr * 0.5);
    ctx.stroke();

    // shower
    const shower = { x: tub.x1 - tub.rx * 0.45, y: H * 0.3 };
    ctx.beginPath();
    ctx.moveTo(shower.x, 0);
    ctx.lineTo(shower.x, shower.y - 12);
    ctx.lineWidth = 9;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#D5DCEB';
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(shower.x - 22, shower.y);
    ctx.lineTo(shower.x + 22, shower.y);
    ctx.lineTo(shower.x + 12, shower.y - 14);
    ctx.lineTo(shower.x - 12, shower.y - 14);
    ctx.closePath();
    ctx.fillStyle = '#D5DCEB';
    ctx.fill();
    outline(ctx, 3);

    // toilet
    const tx = W * 0.79;
    const tw = W * 0.18;
    const floorFront = floorY + H * 0.1;
    roundRect(ctx, tx + tw * 0.08, H * 0.4, tw * 0.84, H * 0.12, 8);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    outline(ctx, 3);
    ctx.beginPath();
    ctx.arc(tx + tw * 0.5, H * 0.43, 4, 0, TAU);
    ctx.fillStyle = '#D5DCEB';
    ctx.fill();
    outline(ctx, 2);
    ctx.beginPath();
    ctx.moveTo(tx + tw * 0.22, H * 0.585);
    ctx.lineTo(tx + tw * 0.78, H * 0.585);
    ctx.lineTo(tx + tw * 0.68, floorFront);
    ctx.lineTo(tx + tw * 0.32, floorFront);
    ctx.closePath();
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    outline(ctx, 3);
    roundRect(ctx, tx, H * 0.53, tw, H * 0.06, 10);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    outline(ctx, 3);
    roundRect(ctx, tx + 4, H * 0.53, tw - 8, H * 0.022, 6);
    ctx.fillStyle = '#9FE7CA';
    ctx.fill();
    outline(ctx, 2);

    // the tub's back and water; the front is drawn over the pet
    ctx.beginPath();
    ctx.ellipse(tub.cx, tub.rimY, tub.rx, tub.ry, 0, 0, TAU);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    outline(ctx, 3);
    ctx.beginPath();
    ctx.ellipse(tub.cx, tub.rimY + 1, tub.rx - 8, tub.ry - 3, 0, 0, TAU);
    ctx.fillStyle = '#9FDCF5';
    ctx.fill();
    // shampoo bottles on the back rim
    [['#FF8FBF', 0.1, 26], ['#9FE7CA', 0.2, 20]].forEach(([c, f, h]) => {
      const x = tub.x0 + tub.rx * 2 * f;
      roundRect(ctx, x - 8, tub.rimY - tub.ry * 0.5 - h, 16, h, 5);
      ctx.fillStyle = c;
      ctx.fill();
      outline(ctx, 2.5);
      roundRect(ctx, x - 4, tub.rimY - tub.ry * 0.5 - h - 7, 8, 8, 2);
      ctx.fillStyle = PAPER;
      ctx.fill();
      outline(ctx, 2);
    });

    const duck = { x: tub.x1 - tub.rx * 0.22, y: tub.rimY + tub.ry * 0.2, r: Math.max(14, W * 0.04) };
    return { floorY, groundY: H * 0.8, poopY: H * 0.955, zone: [tub.cx / W, tub.cx / W], tub, shower, duck };
  }

  function drawDuck(ctx, x, y, r) {
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.ellipse(0, 0, r, r * 0.68, 0, 0, TAU);
    ctx.fillStyle = '#FFE27A';
    ctx.fill();
    outline(ctx, 2.5);
    ctx.beginPath();
    ctx.arc(-r * 0.62, -r * 0.72, r * 0.5, 0, TAU);
    ctx.fill();
    outline(ctx, 2.5);
    ctx.beginPath();
    ctx.moveTo(-r * 1.05, -r * 0.78);
    ctx.lineTo(-r * 1.5, -r * 0.62);
    ctx.lineTo(-r * 1.05, -r * 0.5);
    ctx.closePath();
    ctx.fillStyle = '#FF8A3D';
    ctx.fill();
    outline(ctx, 2);
    ctx.beginPath();
    ctx.arc(-r * 0.72, -r * 0.85, r * 0.09, 0, TAU);
    ctx.fillStyle = INK;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(r * 0.1, -r * 0.05);
    ctx.quadraticCurveTo(r * 0.45, -r * 0.35, r * 0.7, -r * 0.05);
    outline(ctx, 2);
    ctx.restore();
  }

  function bathroomFront(ctx, L, info) {
    const { tub } = L;
    const { x0, x1, cx, rx, ry, rimY, bottom } = tub;
    // feet
    [x0 + 34, x1 - 34].forEach((x) => {
      ctx.beginPath();
      ctx.ellipse(x, bottom + 4, 10, 7, 0, 0, TAU);
      ctx.fillStyle = '#FFC53D';
      ctx.fill();
      outline(ctx, 2.5);
    });
    // bubbles floating on the water, around the pet
    for (let i = 0; i < 9; i++) {
      const bx = x0 + 18 + (i / 8) * (rx * 2 - 36);
      if (Math.abs(bx - info.petX) < info.petW * 0.42) continue; // keep the face clear
      const by = rimY - 2 + Math.sin(info.t * 2 + i * 1.7) * 2;
      const r = 7 + ((i * 5) % 7);
      ctx.beginPath();
      ctx.arc(bx, by, r, 0, TAU);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#8FD0F5';
      ctx.stroke();
    }
    // front of the tub
    ctx.beginPath();
    ctx.moveTo(x0, rimY);
    ctx.lineTo(x0 + 6, bottom - 26);
    ctx.quadraticCurveTo(x0 + 12, bottom, x0 + 38, bottom);
    ctx.lineTo(x1 - 38, bottom);
    ctx.quadraticCurveTo(x1 - 12, bottom, x1 - 6, bottom - 26);
    ctx.lineTo(x1, rimY);
    ctx.ellipse(cx, rimY, rx, ry, 0, 0, Math.PI, false);
    ctx.closePath();
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = '#FFB3CF';
    ctx.fillRect(x0, rimY + ry + 12, rx * 2, 10);
    ctx.restore();
    outline(ctx, 3);
    drawDuck(ctx, L.duck.x, L.duck.y - Math.abs(Math.sin(info.t * 1.6)) * 2 - (info.duckHop || 0), L.duck.r);
  }

  /* ---------- bedroom ---------- */

  function bedroom(ctx, W, H, night) {
    const floorY = Math.round(H * 0.6);
    ctx.fillStyle = '#DCD1F7';
    ctx.fillRect(0, 0, W, floorY);
    ctx.fillStyle = '#ECE6FF';
    for (let y = 18, row = 0; y < floorY - 8; y += 30, row++) {
      for (let x = (row % 2) * 15 + 10; x < W; x += 30) {
        sparklePath(ctx, x, y, 4);
        ctx.fill();
      }
    }
    ctx.fillStyle = '#EBC4B4';
    ctx.fillRect(0, floorY, W, H - floorY);
    baseboard(ctx, W, floorY);

    const ww = Math.min(W * 0.3, 130);
    drawWindow(ctx, W * 0.93 - ww, H * 0.07, ww, Math.min(H * 0.19, 105), night);

    // star garland over the bed
    const gx0 = W * 0.05;
    const gx1 = W * 0.55;
    const gy = H * 0.08;
    const sag = H * 0.1;
    ctx.beginPath();
    ctx.moveTo(gx0, gy);
    ctx.quadraticCurveTo((gx0 + gx1) / 2, gy + sag, gx1, gy);
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK;
    ctx.stroke();
    for (let i = 1; i <= 5; i++) {
      const f = i / 6;
      const x = (1 - f) * (1 - f) * gx0 + 2 * (1 - f) * f * ((gx0 + gx1) / 2) + f * f * gx1;
      const y = (1 - f) * (1 - f) * gy + 2 * (1 - f) * f * (gy + sag) + f * f * gy;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + 12);
      ctx.stroke();
      starPath(ctx, x, y + 20, 8);
      ctx.fillStyle = i % 2 ? '#FFE27A' : '#FFB3CF';
      ctx.fill();
      outline(ctx, 2);
    }

    // nightstand with the lamp
    const nx0 = W * 0.66;
    const nx1 = W * 0.86;
    const nTop = H * 0.56;
    roundRect(ctx, nx0, nTop, nx1 - nx0, H * 0.15, 6);
    ctx.fillStyle = '#C98B5A';
    ctx.fill();
    outline(ctx, 3);
    roundRect(ctx, nx0 + 6, nTop + H * 0.03, nx1 - nx0 - 12, H * 0.05, 4);
    ctx.fillStyle = '#DDA06E';
    ctx.fill();
    outline(ctx, 2);
    ctx.beginPath();
    ctx.arc((nx0 + nx1) / 2, nTop + H * 0.055, 3, 0, TAU);
    ctx.fillStyle = INK;
    ctx.fill();
    const lamp = { x: (nx0 + nx1) / 2, base: nTop, top: H * 0.38, mid: H * 0.465, half: W * 0.065 };
    lamp.y = (lamp.top + lamp.mid) / 2;
    lamp.r = Math.max(34, W * 0.1);
    ctx.beginPath();
    ctx.ellipse(lamp.x, lamp.base - 3, 14, 5, 0, 0, TAU);
    ctx.fillStyle = '#FF8FBF';
    ctx.fill();
    outline(ctx, 2.5);
    ctx.beginPath();
    ctx.moveTo(lamp.x, lamp.base - 5);
    ctx.lineTo(lamp.x, lamp.mid);
    outline(ctx, 4);
    drawLampShade(ctx, lamp, '#FFE27A');

    // bed
    const x0 = W * 0.03;
    const x1 = W * 0.62;
    const matTop = H * 0.64;
    const matX0 = x0 + W * 0.05;
    const matX1 = x1 - W * 0.045;
    roundRect(ctx, x0, H * 0.42, W * 0.055, H * 0.35, 10);
    ctx.fillStyle = '#8FB8F0';
    ctx.fill();
    outline(ctx, 3);
    roundRect(ctx, x1 - W * 0.045, H * 0.57, W * 0.045, H * 0.2, 8);
    ctx.fill();
    outline(ctx, 3);
    roundRect(ctx, matX0, H * 0.715, matX1 - matX0, H * 0.05, 6);
    ctx.fillStyle = '#C98B5A';
    ctx.fill();
    outline(ctx, 3);
    roundRect(ctx, matX0, matTop, matX1 - matX0, H * 0.078, 8);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    outline(ctx, 3);
    ctx.beginPath();
    ctx.ellipse(x0 + W * 0.13, matTop - H * 0.012, W * 0.07, H * 0.028, -0.05, 0, TAU);
    ctx.fillStyle = PAPER;
    ctx.fill();
    outline(ctx, 3);
    const quilt = { x0: x0 + W * 0.21, x1: matX1 - 4 };
    patchwork(ctx, quilt.x0, matTop - H * 0.012, quilt.x1 - quilt.x0, H * 0.1);

    const groundY = H * 0.88;
    rug(ctx, W * 0.55, groundY, W * 0.32, H * 0.05, '#B9A3F0', '#DCD0FF');

    const bed = { x: (quilt.x0 + quilt.x1) / 2, y: matTop, matX0, matX1, quilt };
    return { floorY, groundY, poopY: groundY + 6, zone: [0.3, 0.72], bed, lamp };
  }

  function drawLampShade(ctx, lamp, fill) {
    ctx.beginPath();
    ctx.moveTo(lamp.x - lamp.half * 0.55, lamp.top);
    ctx.lineTo(lamp.x + lamp.half * 0.55, lamp.top);
    ctx.lineTo(lamp.x + lamp.half, lamp.mid);
    ctx.lineTo(lamp.x - lamp.half, lamp.mid);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    outline(ctx, 3);
  }

  function patchwork(ctx, x, y, w, h) {
    const colors = ['#FFB3CF', '#FFE27A', '#9FE7CA', '#CDB9FF'];
    roundRect(ctx, x, y, w, h, 8);
    ctx.save();
    ctx.clip();
    const cols = Math.max(3, Math.round(w / 34));
    const cw = w / cols;
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < cols; c++) {
        ctx.fillStyle = colors[(r + c) % colors.length];
        ctx.fillRect(x + c * cw, y + r * (h / 2.4), cw + 0.5, h / 2.4 + 0.5);
      }
    }
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1.5;
    for (let c = 1; c < cols; c++) {
      ctx.beginPath();
      ctx.moveTo(x + c * cw, y);
      ctx.lineTo(x + c * cw, y + h);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
    roundRect(ctx, x, y, w, h, 8);
    outline(ctx, 3);
  }

  function bedroomFront(ctx, L, info) {
    if (!info.asleep) return;
    // tuck the sleeping pet in
    const { bed } = L;
    const w = Math.min(bed.matX1 - bed.matX0 - 8, Math.max(info.petW * 1.25, bed.quilt.x1 - bed.quilt.x0));
    const x = Math.max(bed.matX0 + 4, Math.min(bed.matX1 - 4 - w, info.petX - w / 2));
    // Measured from the mattress, so it's already in place while the pet hops in.
    const top = Math.min(info.petGround, bed.y) - info.petH * 0.38;
    const bottom = L.H * 0.735;
    patchwork(ctx, x, top, w, bottom - top);
    roundRect(ctx, x, top, w, 10, 5);
    ctx.fillStyle = PAPER;
    ctx.fill();
    outline(ctx, 2.5);
  }

  function bedroomNight(ctx, L) {
    const { lamp } = L;
    const g = ctx.createRadialGradient(lamp.x, lamp.mid, 4, lamp.x, lamp.mid, L.W * 0.45);
    g.addColorStop(0, 'rgba(255, 226, 122, 0.35)');
    g.addColorStop(1, 'rgba(255, 226, 122, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, L.W, L.H);
    drawLampShade(ctx, lamp, '#FFF1A8');
  }

  /* ---------- playroom ---------- */

  function playroom(ctx, W, H) {
    const floorY = Math.round(H * 0.62);
    ctx.fillStyle = '#C6E6FF';
    ctx.fillRect(0, 0, W, floorY);

    // rainbow mural
    const rcx = W * 0.47;
    const rcy = floorY + 2;
    const R = Math.min(W * 0.36, H * 0.42);
    const band = R * 0.09;
    ['#FF8FB1', '#FFB86B', '#FFE27A', '#9FE7A6', '#8FCBFF', '#C3A6FF'].forEach((c, i) => {
      ctx.beginPath();
      ctx.arc(rcx, rcy, R - band * (i + 0.5), Math.PI, TAU);
      ctx.lineWidth = band + 0.5;
      ctx.strokeStyle = c;
      ctx.stroke();
    });
    [R, R - band * 6].forEach((r) => {
      ctx.beginPath();
      ctx.arc(rcx, rcy, r, Math.PI, TAU);
      outline(ctx, 2.5);
    });
    cloud(ctx, W * 0.14, H * 0.14, Math.min(W, H) * 0.06);
    cloud(ctx, W * 0.84, H * 0.1, Math.min(W, H) * 0.05);

    // puzzle play mat
    const size = W / 7;
    checker(ctx, 0, floorY, W, H, size, ['#FFC2D8', '#FFE9A0', '#BDEFD8', '#DCD0FF']);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    for (let x = size; x < W; x += size) { ctx.beginPath(); ctx.moveTo(x, floorY); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = floorY + size; y < H; y += size) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    baseboard(ctx, W, floorY);

    // toy box
    const bx0 = W * 0.03;
    const bx1 = W * 0.27;
    const bTop = H * 0.56;
    const bBottom = floorY + H * 0.1;
    ctx.save();
    ctx.translate(bx0 + 20, bTop - 16);
    ctx.rotate(-0.2);
    roundRect(ctx, -14, -14, 28, 28, 4);
    ctx.fillStyle = '#FFE27A';
    ctx.fill();
    outline(ctx, 2.5);
    ctx.fillStyle = INK;
    ctx.font = `800 17px ${PM.FONT_BODY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('A', 0, 1);
    ctx.restore();
    ctx.beginPath();
    ctx.moveTo(bx0 + (bx1 - bx0) * 0.62, bTop + 4);
    ctx.lineTo(bx0 + (bx1 - bx0) * 0.78, bTop - 40);
    outline(ctx, 4);
    starPath(ctx, bx0 + (bx1 - bx0) * 0.79, bTop - 46, 12);
    ctx.fillStyle = '#FFC53D';
    ctx.fill();
    outline(ctx, 2.5);
    roundRect(ctx, bx0, bTop, bx1 - bx0, bBottom - bTop, 8);
    ctx.fillStyle = '#FF8A3D';
    ctx.fill();
    outline(ctx, 3);
    roundRect(ctx, bx0 - 4, bTop - 4, bx1 - bx0 + 8, 12, 5);
    ctx.fillStyle = '#FFB86B';
    ctx.fill();
    outline(ctx, 2.5);
    heartPath(ctx, (bx0 + bx1) / 2, (bTop + bBottom) / 2 + 3, 20);
    ctx.fillStyle = '#FF5DA2';
    ctx.fill();
    outline(ctx, 2);

    // arcade machine
    const ax0 = W * 0.72;
    const aw = W * 0.25;
    const aTop = H * 0.2;
    const aBottom = floorY + H * 0.11;
    roundRect(ctx, ax0, aTop, aw, aBottom - aTop, 10);
    ctx.fillStyle = '#FF5DA2';
    ctx.fill();
    outline(ctx, 3);
    roundRect(ctx, ax0 + 6, aTop + 6, aw - 12, H * 0.055, 6);
    ctx.fillStyle = '#FFE27A';
    ctx.fill();
    outline(ctx, 2.5);
    ctx.fillStyle = INK;
    ctx.font = `${Math.max(11, Math.min(aw * 0.2, H * 0.032))}px ${PM.FONT_DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('STAR', ax0 + aw / 2, aTop + 6 + H * 0.0285);
    const screen = { x: ax0 + 9, y: aTop + H * 0.085, w: aw - 18, h: H * 0.16 };
    roundRect(ctx, screen.x - 3, screen.y - 3, screen.w + 6, screen.h + 6, 8);
    ctx.fillStyle = INK;
    ctx.fill();
    const panelY = aTop + H * 0.265;
    roundRect(ctx, ax0 - 4, panelY, aw + 8, H * 0.05, 6);
    ctx.fillStyle = '#FF8FBF';
    ctx.fill();
    outline(ctx, 2.5);
    ctx.beginPath();
    ctx.moveTo(ax0 + aw * 0.28, panelY + 6);
    ctx.lineTo(ax0 + aw * 0.28, panelY - 10);
    outline(ctx, 3);
    ctx.beginPath();
    ctx.arc(ax0 + aw * 0.28, panelY - 12, 6, 0, TAU);
    ctx.fillStyle = '#F0433A';
    ctx.fill();
    outline(ctx, 2);
    [['#FFE27A', 0.6], ['#9FE7CA', 0.8]].forEach(([c, f]) => {
      ctx.beginPath();
      ctx.arc(ax0 + aw * f, panelY + H * 0.025, 5, 0, TAU);
      ctx.fillStyle = c;
      ctx.fill();
      outline(ctx, 2);
    });
    roundRect(ctx, ax0 + aw * 0.34, panelY + H * 0.09, aw * 0.32, H * 0.06, 5);
    ctx.fillStyle = '#E0468A';
    ctx.fill();
    outline(ctx, 2.5);
    ctx.beginPath();
    ctx.moveTo(ax0 + aw * 0.5, panelY + H * 0.105);
    ctx.lineTo(ax0 + aw * 0.5, panelY + H * 0.135);
    outline(ctx, 2.5);

    const groundY = H * 0.84;
    const arcade = { x: ax0, y: aTop, w: aw, h: aBottom - aTop, screen };
    return { floorY, groundY, poopY: groundY + 6, zone: [0.3, 0.66], arcade };
  }

  function playroomLive(ctx, L, t) {
    const sc = L.arcade.screen;
    ctx.save();
    roundRect(ctx, sc.x, sc.y, sc.w, sc.h, 5);
    ctx.fillStyle = '#1A1F4E';
    ctx.fill();
    ctx.clip();
    for (let i = 0; i < 3; i++) {
      const y = sc.y + ((t * 26 + i * 37) % (sc.h + 20)) - 10;
      const x = sc.x + sc.w * (0.22 + 0.28 * i);
      starPath(ctx, x, y, 6);
      ctx.fillStyle = '#FFC53D';
      ctx.fill();
    }
    if (Math.floor(t * 2) % 2 === 0) {
      ctx.fillStyle = '#FFFFFF';
      ctx.font = `${Math.max(9, sc.w * 0.16)}px ${PM.FONT_DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('PLAY', sc.x + sc.w / 2, sc.y + sc.h * 0.8);
    }
    ctx.restore();
  }

  function drawBall(ctx, x, y, r, rot) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.save();
    ctx.clip();
    ['#FF5DA2', '#FFE27A', '#5DB4F0'].forEach((c, i) => {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, r, (i * 2 * TAU) / 6, ((i * 2 + 1) * TAU) / 6);
      ctx.closePath();
      ctx.fillStyle = c;
      ctx.fill();
    });
    ctx.restore();
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    outline(ctx, 3);
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.2, 0, TAU);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    outline(ctx, 2);
    ctx.restore();
    ctx.beginPath();
    ctx.ellipse(x - r * 0.38, y - r * 0.42, r * 0.2, r * 0.12, -0.6, 0, TAU);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fill();
  }

  /* ---------- public ---------- */

  const DRAW = { living, kitchen, bathroom, bedroom, playroom };

  PM.ROOMS = ROOMS;
  PM.rooms = {
    list: ROOMS,
    ids: ROOMS.map((r) => r.id),
    has: (id) => Object.prototype.hasOwnProperty.call(DRAW, id),
    name: (id) => (ROOMS.find((r) => r.id === id) || ROOMS[0]).name,

    // Draws the room's static background and returns its layout.
    draw(id, ctx, W, H, night) {
      const layout = (DRAW[id] || living)(ctx, W, H, night);
      layout.W = W;
      layout.H = H;
      return layout;
    },

    // Things that change every frame, drawn behind the pet.
    drawLive(id, ctx, L, t) {
      if (id === 'kitchen') kitchenLive(ctx, L, t);
      else if (id === 'playroom') playroomLive(ctx, L, t);
    },

    // Drawn over the pet. info: { asleep, petX, petGround, petW, petH, t, duckHop }
    drawFront(id, ctx, L, info) {
      if (id === 'bathroom') bathroomFront(ctx, L, info);
      else if (id === 'bedroom') bedroomFront(ctx, L, info);
    },

    // Drawn after the lights-off overlay.
    drawNight(id, ctx, L) {
      if (id === 'bedroom') bedroomNight(ctx, L);
    },

    // Which tappable prop (if any) is at x, y.
    hitProp(id, L, x, y) {
      const inBox = (b) => b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
      const near = (p, r) => p && Math.hypot(x - p.x, y - p.y) <= r;
      if (id === 'kitchen' && inBox(L.fridge)) return 'fridge';
      if (id === 'bathroom' && near(L.duck, L.duck.r * 1.9)) return 'duck';
      if (id === 'bathroom' && near(L.shower, 36)) return 'shower';
      if (id === 'bedroom' && near(L.lamp, L.lamp.r)) return 'lamp';
      if (id === 'playroom' && inBox(L.arcade)) return 'arcade';
      return null;
    },

    drawBall,
  };
})(window.PM = window.PM || {});
