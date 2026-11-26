/* Emberdeep — everything drawn: the heroes (chibi adventurers, a stone
   golem and a baby dragon), thirteen kinds of monster in each biome's
   colours, the cave backdrops and the relic icons. All of it is canvas
   paths, cached as sprites, so the game ships no images but its icons. */
(function (ED) {
  'use strict';

  const U = ED.util;
  const { TAU, shade, rgba, mix, seeded } = U;
  const INK = '#1A1224';

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    return c;
  }

  function rr(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function circle(g, x, y, r) {
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
  }
  function ellipse(g, x, y, rx, ry, rot) {
    g.beginPath();
    g.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot || 0, 0, TAU);
  }
  // Fill with a colour and a dark cartoon outline.
  function paint(g, fill, lw) {
    g.fillStyle = fill;
    g.fill();
    g.lineWidth = lw || 2;
    g.strokeStyle = INK;
    g.stroke();
  }
  function poly(g, pts) {
    g.beginPath();
    g.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.closePath();
  }

  /* ---------- Colour shifting for the deeper loops ---------- */

  function hexToHsl(hex) {
    const [r, g, b] = U.hexToRgb(hex).map((v) => v / 255);
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    const l = (mx + mn) / 2;
    if (mx !== mn) {
      const d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6;
    }
    return [h * 360, s, l];
  }
  function hslToHex(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    const f = (n) => {
      const k = (n + h * 12) % 12;
      const a = s * Math.min(l, 1 - l);
      return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    };
    return '#' + [f(0), f(8), f(4)].map((v) => Math.round(U.clamp(v, 0, 1) * 255).toString(16).padStart(2, '0')).join('');
  }
  function hue(hex, deg) {
    if (!deg) return hex;
    const [h, s, l] = hexToHsl(hex);
    return hslToHex(h + deg, s, l);
  }

  // A biome's colours on its nth trip round (0 = first). Each loop turns
  // the hue and gets a touch darker, so floor 201 is recognisably mossy,
  // but stranger.
  const SHIFTS = [0, 45, -50, 160, 100, -110];
  function palette(biome, cycle) {
    const d = SHIFTS[cycle % SHIFTS.length] + 13 * Math.floor(cycle / SHIFTS.length);
    const dk = Math.min(0.25, cycle * 0.04);
    const c = (x) => shade(hue(x, d), -dk);
    return {
      sky: [c(biome.sky[0]), c(biome.sky[1])], rock: c(biome.rock), rock2: c(biome.rock2),
      floor: c(biome.floor), glow: hue(biome.glow, d), mote: hue(biome.mote, d), deco: biome.deco, hueShift: d,
    };
  }

  /* ================= Heroes ================= */

  // Logical box for a hero sprite; feet at (HX, HY).
  const HW = 84;
  const HH = 84;
  const HX = 38;
  const HY = 78;

  function drawWeapon(g, L, x, y, ang, pose) {
    g.save();
    g.translate(x, y);
    g.rotate(ang);
    const metal = '#D8E0EC';
    switch (L.weapon) {
      case 'sword':
        rr(g, -2, -30, 6, 26, 2); paint(g, L.ghost ? '#B8FFF6' : metal, 1.6);
        poly(g, [-2, -30, 1, -36, 4, -30]); paint(g, L.ghost ? '#B8FFF6' : metal, 1.6);
        rr(g, -6, -5, 14, 4, 2); paint(g, '#E8B547', 1.6);
        rr(g, -1, -1, 4, 8, 1); paint(g, '#6B4423', 1.4);
        break;
      case 'spear':
        rr(g, -1.5, -40, 4, 52, 2); paint(g, '#B07A3A', 1.5);
        poly(g, [-4, -40, 0.5, -52, 5, -40, 0.5, -36]); paint(g, '#F5F0E0', 1.5);
        break;
      case 'mace':
        rr(g, -1.5, -20, 4, 26, 2); paint(g, '#8A5A2E', 1.5);
        circle(g, 0.5, -23, 6.5); paint(g, '#E8B547', 1.6);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU;
          circle(g, 0.5 + Math.cos(a) * 6.5, -23 + Math.sin(a) * 6.5, 1.6); paint(g, '#F5D06B', 1);
        }
        break;
      case 'staff':
        rr(g, -1.5, -36, 4, 46, 2); paint(g, '#7A4A26', 1.5);
        g.globalCompositeOperation = 'lighter';
        circle(g, 0.5, -40, pose ? 11 : 8); g.fillStyle = rgba(L.orb || '#FFFFFF', pose ? 0.5 : 0.3); g.fill();
        g.globalCompositeOperation = 'source-over';
        circle(g, 0.5, -40, 5.5); paint(g, L.orb || '#FFFFFF', 1.6);
        circle(g, -1, -42, 1.8); g.fillStyle = '#FFFFFF'; g.fill();
        break;
      case 'bow':
        g.beginPath();
        g.arc(-6, -8, 18, -1.15, 1.15);
        g.lineWidth = 5; g.strokeStyle = INK; g.stroke();
        g.lineWidth = 3; g.strokeStyle = '#A0682E'; g.stroke();
        g.beginPath();
        g.moveTo(-6 + Math.cos(-1.15) * 18, -8 + Math.sin(-1.15) * 18);
        g.lineTo(pose ? -10 : -1, -8);
        g.lineTo(-6 + Math.cos(1.15) * 18, -8 + Math.sin(1.15) * 18);
        g.lineWidth = 1; g.strokeStyle = '#F2EBDD'; g.stroke();
        if (pose) { rr(g, -12, -9.5, 26, 3, 1.5); paint(g, '#C9A26B', 1); }
        break;
      case 'daggers':
        for (const [dx, a] of [[0, 0], [-7, -0.5]]) {
          g.save();
          g.translate(dx, 0);
          g.rotate(a);
          poly(g, [-2, -2, 0, -17, 2.5, -2]); paint(g, metal, 1.4);
          rr(g, -4, -3, 9, 3, 1.5); paint(g, '#9E3D5B', 1.2);
          rr(g, -1, 0, 3, 5, 1); paint(g, '#3A3550', 1.2);
          g.restore();
        }
        break;
      case 'lute':
        ellipse(g, 0, -4, 8, 10); paint(g, '#C98A4A', 1.6);
        circle(g, 0, -5, 2.5); g.fillStyle = INK; g.fill();
        rr(g, -1.5, -26, 3.5, 18, 1.5); paint(g, '#7A4A26', 1.4);
        rr(g, -3, -29, 7, 5, 2); paint(g, '#5A3418', 1.2);
        break;
    }
    g.restore();
  }

  function drawHat(g, L, cx, hy) {
    const t = L.trim;
    switch (L.hat) {
      case 'helm': {
        g.beginPath();
        g.arc(cx, hy, 13.5, Math.PI, 0);
        g.lineTo(cx + 13.5, hy + 4);
        g.lineTo(cx - 13.5, hy + 4);
        g.closePath();
        paint(g, L.ghost ? '#5C8C98' : '#B9C4D6', 2);
        rr(g, cx + 1, hy - 1, 13, 3.5, 1.5); g.fillStyle = INK; g.fill();
        g.beginPath();
        g.moveTo(cx - 2, hy - 13);
        g.quadraticCurveTo(cx - 14, hy - 22, cx - 18, hy - 8);
        g.quadraticCurveTo(cx - 10, hy - 14, cx - 2, hy - 9);
        paint(g, L.ghost ? '#7CF5E6' : '#E0453A', 1.6);
        break;
      }
      case 'hood':
        g.beginPath();
        g.moveTo(cx - 15, hy + 8);
        g.quadraticCurveTo(cx - 17, hy - 16, cx - 2, hy - 15);
        g.quadraticCurveTo(cx + 14, hy - 14, cx + 14, hy - 2);
        g.quadraticCurveTo(cx + 6, hy - 9, cx - 4, hy - 6);
        g.quadraticCurveTo(cx - 9, hy + 2, cx - 9, hy + 10);
        g.closePath();
        paint(g, L.body, 2);
        break;
      case 'wizard':
        ellipse(g, cx, hy - 7, 19, 4.5, -0.08); paint(g, L.body, 2);
        g.beginPath();
        g.moveTo(cx - 11, hy - 8);
        g.quadraticCurveTo(cx - 4, hy - 26, cx - 12, hy - 36);
        g.quadraticCurveTo(cx + 4, hy - 28, cx + 11, hy - 9);
        g.closePath();
        paint(g, L.body, 2);
        rr(g, cx - 10, hy - 12, 21, 4, 2); paint(g, t, 1.4);
        circle(g, cx + 2, hy - 22, 2.2); g.fillStyle = t; g.fill();
        break;
      case 'veil':
        g.beginPath();
        g.moveTo(cx - 14, hy + 14);
        g.quadraticCurveTo(cx - 17, hy - 15, cx, hy - 15);
        g.quadraticCurveTo(cx + 16, hy - 15, cx + 14, hy - 3);
        g.lineTo(cx + 9, hy - 6);
        g.quadraticCurveTo(cx - 6, hy - 9, cx - 8, hy + 14);
        g.closePath();
        paint(g, '#2E2A3A', 2);
        rr(g, cx - 11, hy - 11, 24, 4, 2); paint(g, '#F1EBDD', 1.4);
        break;
      case 'mask':
        g.beginPath();
        g.moveTo(cx - 13, hy - 4);
        g.quadraticCurveTo(cx, hy - 20, cx + 13, hy - 5);
        g.lineTo(cx + 12, hy - 1);
        g.quadraticCurveTo(cx, hy - 6, cx - 13, hy + 1);
        g.closePath();
        paint(g, t, 1.6);
        poly(g, [cx - 13, hy - 2, cx - 22, hy - 6, cx - 19, hy + 1]); paint(g, t, 1.4);
        rr(g, cx - 1, hy + 4, 14, 7, 3); paint(g, '#3A3550', 1.4);
        break;
      case 'feather':
        ellipse(g, cx - 1, hy - 9, 15, 6, -0.15); paint(g, L.body, 2);
        g.beginPath();
        g.moveTo(cx - 6, hy - 12);
        g.quadraticCurveTo(cx - 22, hy - 26, cx - 12, hy - 33);
        g.quadraticCurveTo(cx - 8, hy - 22, cx - 3, hy - 13);
        paint(g, '#FFFFFF', 1.4);
        break;
      case 'horns':
        for (const s of [-1, 1]) {
          g.beginPath();
          g.moveTo(cx + s * 7, hy - 9);
          g.quadraticCurveTo(cx + s * 20, hy - 14, cx + s * 16, hy - 27);
          g.quadraticCurveTo(cx + s * 14, hy - 17, cx + s * 3, hy - 12);
          g.closePath();
          paint(g, '#E9E4F7', 1.6);
        }
        break;
      case 'antlers':
        g.lineCap = 'round';
        for (const s of [-1, 1]) {
          g.beginPath();
          g.moveTo(cx + s * 6, hy - 10);
          g.lineTo(cx + s * 13, hy - 24);
          g.moveTo(cx + s * 10, hy - 18);
          g.lineTo(cx + s * 19, hy - 21);
          g.moveTo(cx + s * 12, hy - 22);
          g.lineTo(cx + s * 9, hy - 30);
          g.lineWidth = 5.5; g.strokeStyle = INK; g.stroke();
          g.lineWidth = 3; g.strokeStyle = '#C9A26B'; g.stroke();
        }
        g.beginPath();
        g.arc(cx, hy - 6, 13, Math.PI * 1.05, Math.PI * 1.95);
        g.lineWidth = 4.5; g.strokeStyle = INK; g.stroke();
        g.lineWidth = 2.5; g.strokeStyle = '#6FBF4A'; g.stroke();
        break;
      case 'wings':
        g.beginPath();
        g.arc(cx, hy, 13.2, Math.PI, 0);
        g.closePath();
        paint(g, '#F2D28B', 2);
        for (const s of [-1, 1]) {
          g.beginPath();
          g.moveTo(cx + s * 11, hy - 7);
          g.quadraticCurveTo(cx + s * 26, hy - 18, cx + s * 22, hy - 28);
          g.quadraticCurveTo(cx + s * 18, hy - 16, cx + s * 9, hy - 12);
          g.closePath();
          paint(g, '#FFFFFF', 1.6);
        }
        break;
    }
  }

  function drawHuman(g, L, pose) {
    const cx = HX;
    const hy = HY - 44; // head centre
    const dark = shade(L.body, -0.45);

    // Shield behind the body
    if (L.shield) {
      ellipse(g, cx - 12, HY - 24, 9, 11); paint(g, '#5A78C8', 2);
      ellipse(g, cx - 12, HY - 24, 4, 5); paint(g, '#E8B547', 1.4);
    }
    // Back arm
    circle(g, cx - 9, HY - 20, 3.6); paint(g, L.skin, 1.6);
    // Legs
    rr(g, cx - 7, HY - 13, 6, 12, 2.5); paint(g, dark, 1.6);
    rr(g, cx + 1.5, HY - 13, 6, 12, 2.5); paint(g, dark, 1.6);
    rr(g, cx - 8.5, HY - 4, 8, 4.5, 2); paint(g, '#4A3022', 1.4);
    rr(g, cx + 0.5, HY - 4, 8.5, 4.5, 2); paint(g, '#4A3022', 1.4);
    // Body
    g.beginPath();
    g.moveTo(cx - 10, HY - 31);
    g.quadraticCurveTo(cx, HY - 35, cx + 10, HY - 31);
    g.lineTo(cx + 12.5, HY - 11);
    g.quadraticCurveTo(cx, HY - 8, cx - 12.5, HY - 11);
    g.closePath();
    paint(g, L.body, 2);
    rr(g, cx - 11.5, HY - 18, 23, 4, 2); paint(g, L.trim, 1.4);
    // Hair behind the head
    if (L.hat !== 'hood' && L.hat !== 'veil') {
      ellipse(g, cx - 3, hy + 1, 13, 12.5); paint(g, L.hair, 2);
    }
    // Head
    circle(g, cx, hy, 12.5); paint(g, L.skin, 2);
    // Fringe
    if (!['helm', 'hood', 'veil', 'wings'].includes(L.hat)) {
      g.beginPath();
      g.moveTo(cx - 12, hy - 1);
      g.quadraticCurveTo(cx - 10, hy - 14, cx + 2, hy - 13);
      g.quadraticCurveTo(cx + 12, hy - 12, cx + 12, hy - 4);
      g.quadraticCurveTo(cx + 4, hy - 9, cx - 1, hy - 6);
      g.quadraticCurveTo(cx - 6, hy - 3, cx - 12, hy - 1);
      g.closePath();
      paint(g, L.hair, 1.6);
    }
    // Face, looking right
    const eye = L.ghost ? '#E9FFFC' : INK;
    ellipse(g, cx + 4, hy + 1, 1.9, 2.6); g.fillStyle = eye; g.fill();
    ellipse(g, cx + 9.5, hy + 1, 1.7, 2.4); g.fillStyle = eye; g.fill();
    if (!L.ghost) {
      circle(g, cx + 4.6, hy, 0.7); g.fillStyle = '#FFFFFF'; g.fill();
      circle(g, cx + 10, hy, 0.6); g.fill();
      ellipse(g, cx + 1, hy + 6, 2.6, 1.5); g.fillStyle = 'rgba(255,110,110,0.35)'; g.fill();
      g.beginPath();
      g.arc(cx + 7.5, hy + 5.5, 2.2, 0.15 * Math.PI, 0.85 * Math.PI);
      g.lineWidth = 1.3; g.strokeStyle = INK; g.stroke();
    }
    drawHat(g, L, cx, hy);
    // Front arm and weapon
    const ax = cx + 9;
    const ay = HY - 21;
    const ang = {
      sword: pose ? 1.2 : 0.25, spear: pose ? 1.45 : 0.15, mace: pose ? 1.3 : 0.3, staff: pose ? 0.45 : 0.12,
      bow: 0, daggers: pose ? 1.4 : 0.5, lute: pose ? 0.35 : 0.2,
    }[L.weapon] || 0;
    if (L.weapon === 'bow') drawWeapon(g, L, ax + 6, ay - 2, 0, pose);
    else if (L.weapon === 'lute') drawWeapon(g, L, ax - 2, ay + 4, ang, pose);
    else drawWeapon(g, L, ax + 1, ay + 2, ang, pose);
    circle(g, ax + (pose ? 3 : 0), ay, 3.8); paint(g, L.skin, 1.6);
  }

  function drawGolem(g, L, pose) {
    const cx = HX;
    const rock = L.body;
    const glowC = L.trim;
    // Legs
    rr(g, cx - 13, HY - 14, 11, 14, 3); paint(g, shade(rock, -0.25), 2);
    rr(g, cx + 2, HY - 14, 11, 14, 3); paint(g, shade(rock, -0.25), 2);
    // Back arm
    rr(g, cx - 24, HY - 40, 12, 26, 5); paint(g, shade(rock, -0.15), 2);
    // Body
    g.beginPath();
    g.moveTo(cx - 17, HY - 44);
    g.lineTo(cx + 15, HY - 47);
    g.lineTo(cx + 19, HY - 14);
    g.lineTo(cx - 19, HY - 12);
    g.closePath();
    paint(g, rock, 2.2);
    // Cracks glowing with rune light
    g.beginPath();
    g.moveTo(cx - 6, HY - 36); g.lineTo(cx - 1, HY - 30); g.lineTo(cx - 5, HY - 23);
    g.moveTo(cx + 7, HY - 38); g.lineTo(cx + 4, HY - 28);
    g.lineWidth = 2; g.strokeStyle = glowC; g.stroke();
    // Head
    rr(g, cx - 9, HY - 62, 20, 18, 4); paint(g, shade(rock, 0.08), 2);
    rr(g, cx + 1, HY - 56, 8, 4, 1.5); g.fillStyle = glowC; g.fill();
    g.globalCompositeOperation = 'lighter';
    circle(g, cx + 5, HY - 54, 6); g.fillStyle = rgba(glowC, 0.35); g.fill();
    g.globalCompositeOperation = 'source-over';
    // Moss tuft
    ellipse(g, cx - 3, HY - 62, 7, 3); paint(g, '#6FBF4A', 1.4);
    // Front arm (fist raised when slamming)
    const fy = pose ? HY - 58 : HY - 30;
    rr(g, cx + 12, fy - 6, 12, 26, 5); paint(g, shade(rock, 0.05), 2);
    circle(g, cx + 18, fy + (pose ? -6 : 22), 8); paint(g, shade(rock, -0.05), 2);
  }

  function drawDragon(g, L, pose) {
    const cx = HX - 2;
    const b = L.body;
    const belly = L.trim;
    // Tail
    g.beginPath();
    g.moveTo(cx - 10, HY - 12);
    g.quadraticCurveTo(cx - 28, HY - 8, cx - 30, HY - 24);
    g.quadraticCurveTo(cx - 24, HY - 14, cx - 8, HY - 20);
    g.closePath();
    paint(g, b, 2);
    poly(g, [cx - 30, HY - 24, cx - 36, HY - 30, cx - 27, HY - 29]); paint(g, belly, 1.4);
    // Back wing
    g.beginPath();
    g.moveTo(cx - 2, HY - 34);
    g.quadraticCurveTo(cx - 20, HY - (pose ? 60 : 52), cx - 26, HY - (pose ? 48 : 40));
    g.quadraticCurveTo(cx - 14, HY - 40, cx - 6, HY - 26);
    g.closePath();
    paint(g, shade(b, -0.2), 1.8);
    // Legs
    rr(g, cx - 8, HY - 12, 7, 12, 3); paint(g, shade(b, -0.15), 1.6);
    rr(g, cx + 4, HY - 12, 7, 12, 3); paint(g, shade(b, -0.15), 1.6);
    // Body
    ellipse(g, cx, HY - 22, 14, 13); paint(g, b, 2);
    ellipse(g, cx + 4, HY - 20, 8, 9); paint(g, belly, 1.4);
    // Neck & head
    g.beginPath();
    g.moveTo(cx + 4, HY - 32);
    g.quadraticCurveTo(cx + 10, HY - 44, cx + 12, HY - 46);
    g.lineTo(cx + 18, HY - 40);
    g.quadraticCurveTo(cx + 14, HY - 32, cx + 10, HY - 26);
    g.closePath();
    paint(g, b, 2);
    ellipse(g, cx + 15, HY - 48, 11, 9); paint(g, b, 2);
    // Snout, open when breathing fire
    g.beginPath();
    g.moveTo(cx + 20, HY - 53);
    g.quadraticCurveTo(cx + 34, HY - 52, cx + 33, HY - 46);
    g.lineTo(cx + 22, HY - (pose ? 42 : 44));
    g.closePath();
    paint(g, b, 2);
    circle(g, cx + 30, HY - 50, 1); g.fillStyle = INK; g.fill();
    // Horns
    poly(g, [cx + 8, HY - 54, cx + 2, HY - 64, cx + 12, HY - 56]); paint(g, belly, 1.4);
    poly(g, [cx + 14, HY - 56, cx + 12, HY - 66, cx + 18, HY - 56]); paint(g, belly, 1.4);
    // Eye
    ellipse(g, cx + 18, HY - 50, 2.8, 3.4); g.fillStyle = '#FFFFFF'; g.fill(); g.lineWidth = 1.2; g.strokeStyle = INK; g.stroke();
    ellipse(g, cx + 19, HY - 50, 1.4, 2.2); g.fillStyle = INK; g.fill();
    // Front wing
    g.beginPath();
    g.moveTo(cx - 2, HY - 30);
    g.quadraticCurveTo(cx - 8, HY - (pose ? 62 : 54), cx - 18, HY - (pose ? 54 : 46));
    g.quadraticCurveTo(cx - 10, HY - 44, cx - 10, HY - 34);
    g.quadraticCurveTo(cx - 6, HY - 30, cx - 2, HY - 30);
    paint(g, b, 1.8);
  }

  const heroCache = new Map();
  // A hero sprite at `scale` device pixels per unit. pose 0 = idle, 1 = attack.
  function hero(h, pose, scale) {
    const key = h.id + '|' + pose + '|' + scale;
    let c = heroCache.get(key);
    if (c) return c;
    c = canvas(HW * scale, HH * scale);
    const g = c.getContext('2d');
    g.scale(scale, scale);
    g.lineJoin = 'round';
    g.lineCap = 'round';
    const L = h.look;
    if (L.ghost) g.globalAlpha = 0.88;
    if (L.kind === 'golem') drawGolem(g, L, pose);
    else if (L.kind === 'dragon') drawDragon(g, L, pose);
    else drawHuman(g, L, pose);
    heroCache.set(key, c);
    return c;
  }
  hero.W = HW;
  hero.H = HH;
  hero.FX = HX;
  hero.FY = HY;

  // Portrait for the hero list: head and shoulders, as an image URL.
  const portraitCache = new Map();
  function portrait(h) {
    let u = portraitCache.get(h.id);
    if (u) return u;
    const s = 2;
    const c = canvas(64 * s, 64 * s);
    const g = c.getContext('2d');
    const spr = hero(h, 0, 3);
    // crop to head and shoulders
    const box = 50;
    const sx = (HX - 23) * 3;
    const sy = (HY - 72) * 3;
    g.drawImage(spr, sx, sy, box * 3, box * 3, 0, 0, 64 * s, 64 * s);
    u = c.toDataURL();
    portraitCache.set(h.id, u);
    return u;
  }

  /* ================= Monsters ================= */

  const MW = 130;
  const MH = 130;
  // Monster drawers: (g, color, frame, rnd) in a 130×130 box, feet at y≈122.
  const M = {};

  M.slime = (g, c, f) => {
    const sq = f ? 1.06 : 0.96;
    g.save();
    g.translate(65, 122);
    g.scale(1 / sq, sq);
    g.beginPath();
    g.moveTo(-40, 0);
    g.bezierCurveTo(-46, -30, -26, -66, 0, -66);
    g.bezierCurveTo(26, -66, 46, -30, 40, 0);
    g.quadraticCurveTo(0, 8, -40, 0);
    paint(g, c, 2.5);
    ellipse(g, -14, -46, 9, 6, -0.6); g.fillStyle = rgba('#FFFFFF', 0.55); g.fill();
    g.restore();
    face(g, 65, 92, 1.1, '#FFFFFF');
  };

  M.bat = (g, c, f) => {
    const up = f ? -16 : 10;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(65 + s * 12, 70);
      g.quadraticCurveTo(65 + s * 40, 60 + up - 18, 65 + s * 60, 56 + up);
      g.quadraticCurveTo(65 + s * 52, 70 + up * 0.4, 65 + s * 46, 74 + up * 0.3);
      g.quadraticCurveTo(65 + s * 38, 70, 65 + s * 32, 80);
      g.quadraticCurveTo(65 + s * 24, 74, 65 + s * 12, 84);
      g.closePath();
      paint(g, shade(c, -0.2), 2.2);
    }
    for (const s of [-1, 1]) { poly(g, [65 + s * 6, 56, 65 + s * 18, 36, 65 + s * 20, 60]); paint(g, c, 2); }
    ellipse(g, 65, 72, 22, 20); paint(g, c, 2.5);
    ellipse(g, 65, 78, 12, 10); g.fillStyle = shade(c, 0.2); g.fill();
    for (const s of [-1, 1]) { ellipse(g, 65 + s * 8, 66, 5, 6); g.fillStyle = '#FFE45C'; g.fill(); circle(g, 65 + s * 8 + 1, 67, 2.4); g.fillStyle = INK; g.fill(); }
    poly(g, [58, 80, 61, 88, 64, 80]); g.fillStyle = '#FFFFFF'; g.fill();
    poly(g, [66, 80, 69, 88, 72, 80]); g.fill();
  };

  M.beetle = (g, c, f) => {
    g.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const x = 42 + i * 20;
      const k = (i + (f ? 1 : 0)) % 2 ? 4 : -2;
      g.beginPath(); g.moveTo(x, 104); g.lineTo(x - 8 + k, 121);
      g.lineWidth = 5; g.strokeStyle = INK; g.stroke();
      g.lineWidth = 2.5; g.strokeStyle = shade(c, -0.35); g.stroke();
    }
    ellipse(g, 98, 96, 16, 14); paint(g, shade(c, -0.35), 2.2);
    poly(g, [104, 86, 122, 62, 112, 90]); paint(g, shade(c, 0.25), 2);
    for (const s of [-1, 1]) { circle(g, 104 + s * 2, 94 + s * 5, 3.2); g.fillStyle = '#FFFFFF'; g.fill(); circle(g, 105 + s * 2, 94 + s * 5, 1.6); g.fillStyle = INK; g.fill(); }
    g.beginPath();
    g.ellipse(62, 96, 38, 30, 0, Math.PI, 0);
    g.lineTo(100, 104);
    g.quadraticCurveTo(62, 112, 24, 104);
    g.closePath();
    paint(g, c, 2.5);
    g.beginPath(); g.moveTo(62, 66); g.lineTo(62, 108); g.lineWidth = 2; g.strokeStyle = INK; g.stroke();
    ellipse(g, 46, 80, 9, 5, -0.4); g.fillStyle = rgba('#FFFFFF', 0.4); g.fill();
    for (const [x, y] of [[44, 94], [78, 88], [80, 100]]) { circle(g, x, y, 3.5); g.fillStyle = shade(c, -0.25); g.fill(); }
  };

  M.mushroom = (g, c, f) => {
    const bob = f ? 2 : 0;
    rr(g, 46, 70 + bob, 38, 52 - bob, 14); paint(g, '#F2E6CF', 2.5);
    face(g, 65, 94 + bob, 0.9, INK);
    g.beginPath();
    g.moveTo(16, 74 + bob);
    g.bezierCurveTo(14, 30 + bob, 116, 30 + bob, 114, 74 + bob);
    g.quadraticCurveTo(65, 86 + bob, 16, 74 + bob);
    paint(g, c, 2.5);
    for (const [x, y, r] of [[40, 56, 7], [66, 46, 8], [92, 58, 6], [56, 66, 4]]) { circle(g, x, y + bob, r); g.fillStyle = rgba('#FFFFFF', 0.85); g.fill(); }
    for (const s of [-1, 1]) { ellipse(g, 65 + s * 26, 104, 7, 4); paint(g, '#F2E6CF', 2); }
  };

  M.spider = (g, c, f) => {
    g.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      for (const s of [-1, 1]) {
        const k = ((i + (f ? 1 : 0)) % 2) * 5;
        const bx = 65 + s * 10;
        g.beginPath();
        g.moveTo(bx, 90);
        g.quadraticCurveTo(65 + s * (34 + i * 6), 54 + i * 8 - k, 65 + s * (40 + i * 6), 120);
        g.lineWidth = 6; g.strokeStyle = INK; g.stroke();
        g.lineWidth = 3; g.strokeStyle = shade(c, -0.25); g.stroke();
      }
    }
    ellipse(g, 65, 70, 26, 22); paint(g, c, 2.5);
    ellipse(g, 65, 96, 20, 15); paint(g, shade(c, 0.1), 2.5);
    poly(g, [58, 64, 65, 52, 72, 64, 65, 80]); g.fillStyle = shade(c, 0.35); g.fill();
    for (const [x, y, r] of [[57, 94, 4.5], [73, 94, 4.5], [50, 88, 2.5], [80, 88, 2.5], [61, 86, 2.2], [69, 86, 2.2]]) {
      circle(g, x, y, r); g.fillStyle = '#FF4D6A'; g.fill();
      circle(g, x - r * 0.3, y - r * 0.3, r * 0.35); g.fillStyle = '#FFFFFF'; g.fill();
    }
  };

  M.golem = (g, c, f, rnd, glowC) => {
    const lift = f ? 3 : 0;
    rr(g, 36, 98, 22, 24, 6); paint(g, shade(c, -0.25), 2.5);
    rr(g, 72, 98, 22, 24, 6); paint(g, shade(c, -0.25), 2.5);
    rr(g, 10, 54 - lift, 24, 44, 9); paint(g, shade(c, -0.12), 2.5);
    rr(g, 96, 54 + lift, 24, 44, 9); paint(g, shade(c, -0.12), 2.5);
    poly(g, [30, 50, 98, 46, 104, 104, 26, 106]); paint(g, c, 2.5);
    rr(g, 46, 22, 38, 30, 8); paint(g, shade(c, 0.1), 2.5);
    g.globalCompositeOperation = 'lighter';
    for (const x of [58, 74]) { circle(g, x, 37, 7); g.fillStyle = rgba(glowC, 0.45); g.fill(); }
    g.globalCompositeOperation = 'source-over';
    for (const x of [58, 74]) { rr(g, x - 4, 34, 8, 6, 2); g.fillStyle = glowC; g.fill(); }
    g.beginPath(); g.moveTo(50, 62); g.lineTo(60, 76); g.lineTo(54, 92); g.moveTo(84, 60); g.lineTo(76, 82);
    g.lineWidth = 3; g.strokeStyle = glowC; g.stroke();
    for (const [x, y] of [[40, 50], [92, 48]]) { poly(g, [x - 8, y + 2, x, y - 12, x + 8, y + 2]); paint(g, mix(c, glowC, 0.5), 2); }
  };

  M.eye = (g, c, f) => {
    g.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      const x = 40 + i * 12.5;
      const w = (f ? 1 : -1) * (i % 2 ? 6 : -6);
      g.beginPath(); g.moveTo(x, 88); g.quadraticCurveTo(x + w, 104, x - w * 0.5, 120);
      g.lineWidth = 7; g.strokeStyle = INK; g.stroke();
      g.lineWidth = 4; g.strokeStyle = shade(c, -0.25); g.stroke();
    }
    circle(g, 65, 66, 36); paint(g, '#F4EEF8', 2.5);
    for (const a of [0.4, 1.4, 2.6, 3.7, 5.1]) {
      g.beginPath(); g.moveTo(65 + Math.cos(a) * 34, 66 + Math.sin(a) * 34); g.lineTo(65 + Math.cos(a + 0.15) * 22, 66 + Math.sin(a + 0.15) * 22);
      g.lineWidth = 1.4; g.strokeStyle = '#E86A8A'; g.stroke();
    }
    const lx = f ? 4 : -3;
    circle(g, 65 + lx, 66, 17); paint(g, c, 2);
    circle(g, 65 + lx, 66, 8); g.fillStyle = INK; g.fill();
    circle(g, 60 + lx, 60, 4); g.fillStyle = '#FFFFFF'; g.fill();
    g.beginPath(); g.arc(65, 66, 36, Math.PI * 1.08, Math.PI * 1.92); g.quadraticCurveTo(65, 40, 33, 52);
    paint(g, shade(c, -0.3), 2);
  };

  M.crab = (g, c, f) => {
    g.lineCap = 'round';
    for (let i = 0; i < 3; i++) for (const s of [-1, 1]) {
      g.beginPath(); g.moveTo(65 + s * 22, 104); g.lineTo(65 + s * (34 + i * 8), 122 - ((i + (f ? 1 : 0)) % 2) * 3);
      g.lineWidth = 6; g.strokeStyle = INK; g.stroke(); g.lineWidth = 3; g.strokeStyle = shade(c, -0.2); g.stroke();
    }
    const cl = f ? -6 : 0;
    for (const s of [-1, 1]) {
      g.beginPath(); g.moveTo(65 + s * 30, 92); g.lineTo(65 + s * 46, 70 + cl);
      g.lineWidth = 8; g.strokeStyle = INK; g.stroke(); g.lineWidth = 5; g.strokeStyle = c; g.stroke();
      g.beginPath();
      g.arc(65 + s * 48, 58 + cl, 14, s > 0 ? 0.9 : 1.6, s > 0 ? 1.55 + Math.PI : 2.24 + Math.PI);
      g.closePath();
      paint(g, shade(c, 0.08), 2.2);
    }
    g.beginPath(); g.ellipse(65, 100, 40, 26, 0, Math.PI, 0); g.quadraticCurveTo(65, 116, 25, 100); paint(g, c, 2.5);
    for (const s of [-1, 1]) {
      g.beginPath(); g.moveTo(65 + s * 8, 78); g.lineTo(65 + s * 10, 64); g.lineWidth = 4; g.strokeStyle = INK; g.stroke();
      circle(g, 65 + s * 10, 62, 6); paint(g, '#FFFFFF', 2); circle(g, 65 + s * 10 + 1, 62, 2.6); g.fillStyle = INK; g.fill();
    }
    g.beginPath(); g.arc(65, 94, 7, 0.2, Math.PI - 0.2); g.lineWidth = 2; g.strokeStyle = INK; g.stroke();
  };

  M.serpent = (g, c, f) => {
    const w = f ? 4 : -4;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(14, 112);
    g.bezierCurveTo(40, 132, 70, 96 + w, 90, 112);
    g.bezierCurveTo(108, 124, 116, 94, 98, 80);
    g.bezierCurveTo(84, 70, 72, 78, 70, 62);
    g.lineWidth = 26; g.strokeStyle = INK; g.stroke();
    g.lineWidth = 21; g.strokeStyle = c; g.stroke();
    g.lineWidth = 8; g.strokeStyle = shade(c, 0.3); g.setLineDash([4, 8]); g.stroke(); g.setLineDash([]);
    ellipse(g, 66, 50, 22, 17, -0.2); paint(g, c, 2.5);
    poly(g, [56, 36, 50, 22, 64, 34]); paint(g, shade(c, -0.25), 2);
    ellipse(g, 74, 46, 5, 6); paint(g, '#FFE45C', 1.6);
    ellipse(g, 75, 46, 1.6, 4.5); g.fillStyle = INK; g.fill();
    g.beginPath(); g.moveTo(86, 56); g.lineTo(98, 58 + w * 0.5); g.lineTo(102, 54 + w * 0.5); g.moveTo(98, 58 + w * 0.5); g.lineTo(102, 62 + w * 0.5);
    g.lineWidth = 2; g.strokeStyle = '#FF4D6A'; g.stroke();
  };

  M.jelly = (g, c, f) => {
    g.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const x = 36 + i * 11.5;
      const w = (f ? 1 : -1) * (i % 2 ? 7 : -7);
      g.beginPath(); g.moveTo(x, 76); g.bezierCurveTo(x + w, 90, x - w, 104, x + w * 0.6, 120);
      g.lineWidth = 5; g.strokeStyle = rgba(INK, 0.8); g.stroke();
      g.lineWidth = 3; g.strokeStyle = rgba(c, 0.9); g.stroke();
    }
    g.globalCompositeOperation = 'lighter';
    circle(g, 65, 60, 46); g.fillStyle = rgba(c, 0.18); g.fill();
    g.globalCompositeOperation = 'source-over';
    g.beginPath(); g.moveTo(24, 78); g.bezierCurveTo(18, 24, 112, 24, 106, 78); g.quadraticCurveTo(65, 90, 24, 78);
    g.fillStyle = rgba(c, 0.78); g.fill(); g.lineWidth = 2.5; g.strokeStyle = INK; g.stroke();
    ellipse(g, 46, 46, 10, 6, -0.6); g.fillStyle = rgba('#FFFFFF', 0.5); g.fill();
    face(g, 65, 62, 0.9, INK);
  };

  M.skeleton = (g, c, f) => {
    const bone = c;
    g.lineCap = 'round';
    const bones = (pts, w) => {
      g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
      g.lineWidth = w + 3; g.strokeStyle = INK; g.stroke(); g.lineWidth = w; g.strokeStyle = bone; g.stroke();
    };
    bones([56, 96, 52, 120], 6); bones([74, 96, 78, 120], 6);
    bones([65, 52, 65, 96], 6);
    for (let i = 0; i < 3; i++) bones([50, 64 + i * 9, 80, 64 + i * 9], 4.5);
    rr(g, 50, 92, 30, 8, 4); paint(g, bone, 2);
    const sw = f ? -0.3 : 0.2;
    bones([48, 60, 38, 82], 5);
    bones([82, 60, 94, 74], 5);
    g.save(); g.translate(96, 74); g.rotate(-0.9 + sw);
    rr(g, -3, -44, 7, 40, 2); paint(g, '#8C7A6B', 1.8); rr(g, -8, -6, 17, 5, 2); paint(g, '#6B4423', 1.6);
    g.restore();
    g.beginPath(); g.arc(65, 36, 20, Math.PI * 0.85, Math.PI * 2.15); g.lineTo(76, 58); g.lineTo(54, 58); g.closePath();
    paint(g, bone, 2.5);
    for (const s of [-1, 1]) { ellipse(g, 65 + s * 8, 36, 6, 7); g.fillStyle = INK; g.fill(); circle(g, 65 + s * 8, 37, 2.2); g.fillStyle = '#7CFFE0'; g.fill(); }
    poly(g, [63, 46, 65, 42, 67, 46]); g.fillStyle = INK; g.fill();
    for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(57 + i * 5.3, 52); g.lineTo(57 + i * 5.3, 57); g.lineWidth = 1.4; g.strokeStyle = INK; g.stroke(); }
  };

  M.imp = (g, c, f) => {
    const up = f ? -8 : 4;
    for (const s of [-1, 1]) {
      g.beginPath(); g.moveTo(65 + s * 16, 64); g.quadraticCurveTo(65 + s * 44, 34 + up, 65 + s * 50, 58 + up);
      g.quadraticCurveTo(65 + s * 36, 58, 65 + s * 22, 78); g.closePath(); paint(g, shade(c, -0.3), 2.2);
    }
    g.beginPath(); g.moveTo(50, 108); g.quadraticCurveTo(26, 118, 22, 96); g.lineWidth = 6; g.strokeStyle = INK; g.stroke(); g.lineWidth = 3; g.strokeStyle = c; g.stroke();
    poly(g, [16, 98, 22, 86, 28, 96]); paint(g, c, 1.8);
    rr(g, 50, 104, 10, 16, 4); paint(g, shade(c, -0.2), 2); rr(g, 70, 104, 10, 16, 4); paint(g, shade(c, -0.2), 2);
    circle(g, 65, 78, 30); paint(g, c, 2.5);
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(65 + s * 12, 52); g.quadraticCurveTo(65 + s * 24, 40, 65 + s * 20, 26); g.quadraticCurveTo(65 + s * 16, 40, 65 + s * 4, 50); paint(g, '#3A1A14', 2); }
    for (const s of [-1, 1]) { ellipse(g, 65 + s * 10, 72, 6, 7); g.fillStyle = '#FFE45C'; g.fill(); circle(g, 65 + s * 10 + 1, 73, 2.6); g.fillStyle = INK; g.fill(); }
    g.beginPath(); g.moveTo(50, 86); g.quadraticCurveTo(65, 100, 80, 86); g.quadraticCurveTo(65, 92, 50, 86); paint(g, '#3A1A14', 1.6);
    poly(g, [56, 88, 59, 93, 61, 89]); g.fillStyle = '#FFFFFF'; g.fill(); poly(g, [69, 89, 71, 93, 74, 88]); g.fill();
  };

  M.ghost = (g, c, f) => {
    const w = f ? 5 : -5;
    g.globalCompositeOperation = 'lighter';
    circle(g, 65, 64, 50); g.fillStyle = rgba(c, 0.16); g.fill();
    g.globalCompositeOperation = 'source-over';
    g.beginPath();
    g.moveTo(26, 112);
    g.bezierCurveTo(18, 70, 22, 22, 65, 22);
    g.bezierCurveTo(108, 22, 112, 70, 104, 112);
    g.quadraticCurveTo(96, 102 + w, 90, 116);
    g.quadraticCurveTo(80, 104 - w, 72, 118);
    g.quadraticCurveTo(64, 104 + w, 56, 118);
    g.quadraticCurveTo(46, 104 - w, 40, 116);
    g.quadraticCurveTo(32, 104 + w, 26, 112);
    g.fillStyle = rgba(c, 0.86); g.fill(); g.lineWidth = 2.5; g.strokeStyle = INK; g.stroke();
    for (const s of [-1, 1]) { ellipse(g, 65 + s * 12, 58, 7, 10); g.fillStyle = INK; g.fill(); }
    ellipse(g, 65, 80, 6, 8); g.fillStyle = INK; g.fill();
    ellipse(g, 46, 42, 8, 5, -0.6); g.fillStyle = rgba('#FFFFFF', 0.5); g.fill();
  };

  function face(g, x, y, s, eye) {
    for (const k of [-1, 1]) {
      ellipse(g, x + k * 12 * s, y - 2 * s, 6 * s, 7.5 * s); g.fillStyle = eye === '#FFFFFF' ? '#FFFFFF' : INK; g.fill();
      if (eye === '#FFFFFF') { g.lineWidth = 1.6; g.strokeStyle = INK; g.stroke(); circle(g, x + k * 12 * s + 1.5 * s, y - 1 * s, 3.2 * s); g.fillStyle = INK; g.fill(); }
      circle(g, x + k * 12 * s - 1.5 * s, y - 4.5 * s, 1.6 * s); g.fillStyle = '#FFFFFF'; g.fill();
    }
    g.beginPath(); g.arc(x, y + 6 * s, 4.5 * s, 0.15 * Math.PI, 0.85 * Math.PI); g.lineWidth = 2; g.strokeStyle = INK; g.stroke();
  }

  function crown(g, x, y, s, big) {
    g.save();
    g.translate(x, y);
    g.scale(s, s);
    poly(g, [-16, 0, -18, -18, -9, -8, 0, -22, 9, -8, 18, -18, 16, 0]);
    paint(g, '#FFC94A', 2);
    rr(g, -16, -3, 32, 6, 2); paint(g, '#E8A23A', 1.6);
    for (const [cx, col] of [[-9, '#FF4D6A'], [0, '#5FB8FF'], [9, '#7CFFB2']]) { circle(g, cx, 0, 2.2); g.fillStyle = col; g.fill(); }
    if (big) { circle(g, 0, -22, 3); paint(g, '#FF4D6A', 1.4); }
    g.restore();
  }

  // Where a crown goes on each kind, in the 130 box.
  const CROWN_AT = {
    slime: [65, 58], bat: [65, 44], beetle: [62, 66], mushroom: [66, 40], spider: [65, 50], golem: [65, 22],
    eye: [65, 30], crab: [65, 74], serpent: [64, 34], jelly: [65, 36], skeleton: [65, 18], imp: [65, 44], ghost: [65, 24],
  };

  const monCache = new Map();
  // A monster sprite. kind: one of M; boss: 0 none, 1 boss, 2 guardian.
  function monster(kind, color, frame, scale, boss, glowC) {
    const key = [kind, color, frame, scale, boss, glowC].join('|');
    let c = monCache.get(key);
    if (c) return c;
    if (monCache.size > 120) monCache.clear();
    c = canvas(MW * scale, MH * scale);
    const g = c.getContext('2d');
    g.scale(scale, scale);
    g.lineJoin = 'round';
    g.lineCap = 'round';
    (M[kind] || M.slime)(g, color, frame, null, glowC || '#FFFFFF');
    if (boss) {
      const [x, y] = CROWN_AT[kind] || [65, 30];
      crown(g, x, y, boss === 2 ? 1.25 : 0.95, boss === 2);
    }
    monCache.set(key, c);
    return c;
  }
  monster.W = MW;
  monster.H = MH;
  monster.FOOT = 122;

  /* ================= Backdrops ================= */

  const GROUND = 0.7; // where the cave floor meets the wall, as a share of height

  // Three layers per biome, each one screen wide and seamless sideways:
  // far cave wall, mid-ground formations and decorations, and the floor.
  function backdrop(biome, cycle, w, h, dpr) {
    const P = palette(biome, cycle);
    const rnd = seeded(biome.id.length * 977 + cycle * 131 + 7);
    const W = Math.ceil(w * dpr);
    const H = Math.ceil(h * dpr);
    const ground = h * GROUND;

    const sky = canvas(W, H);
    let g = sky.getContext('2d');
    g.scale(dpr, dpr);
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, P.sky[1]);
    gr.addColorStop(0.55, P.sky[0]);
    gr.addColorStop(1, P.sky[1]);
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    // distant glow pockets
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const x = rnd() * w;
      const y = h * (0.25 + rnd() * 0.4);
      const r = 40 + rnd() * 90;
      const rg = g.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, rgba(P.glow, 0.13));
      rg.addColorStop(1, rgba(P.glow, 0));
      g.fillStyle = rg;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    g.globalCompositeOperation = 'source-over';
    if (P.deco === 'void') {
      for (let i = 0; i < 90; i++) {
        g.fillStyle = rgba('#FFFFFF', 0.2 + rnd() * 0.7);
        const s = rnd() < 0.1 ? 2 : 1;
        g.fillRect(rnd() * w, rnd() * h * 0.8, s, s);
      }
    }

    const far = canvas(W, H);
    g = far.getContext('2d');
    g.scale(dpr, dpr);
    // stalactites from the ceiling
    jagged(g, w, 0, h * 0.22, 14, rnd, shade(P.rock, -0.2), true);
    // far wall bumps at the bottom
    jagged(g, w, ground + 4, h * 0.3, 9, rnd, shade(P.rock, -0.15), false);

    const mid = canvas(W, H);
    g = mid.getContext('2d');
    g.scale(dpr, dpr);
    jagged(g, w, 0, h * 0.12, 8, rnd, P.rock, true);
    decorate(g, P, w, h, ground, rnd);

    const flo = canvas(W, H);
    g = flo.getContext('2d');
    g.scale(dpr, dpr);
    const fg = g.createLinearGradient(0, ground, 0, h);
    fg.addColorStop(0, shade(P.floor, 0.15));
    fg.addColorStop(0.15, P.floor);
    fg.addColorStop(1, shade(P.floor, -0.45));
    g.fillStyle = fg;
    g.fillRect(0, ground, w, h - ground);
    g.fillStyle = rgba(P.glow, 0.25);
    g.fillRect(0, ground, w, 1.5);
    for (let i = 0; i < 40; i++) {
      const x = rnd() * w;
      const y = ground + 6 + rnd() * (h - ground - 8);
      const r = 2 + rnd() * 6;
      wrapDraw(w, x, r, (xx) => {
        ellipse(g, xx, y, r * 1.6, r * 0.6);
        g.fillStyle = rgba(shade(P.floor, rnd() < 0.5 ? 0.2 : -0.3), 0.6);
        g.fill();
      });
    }
    if (P.deco === 'lava') {
      for (let i = 0; i < 5; i++) {
        const x = rnd() * w;
        const y = ground + 10 + rnd() * (h - ground - 16);
        wrapDraw(w, x, 30, (xx) => {
          g.beginPath();
          g.moveTo(xx - 26, y);
          g.quadraticCurveTo(xx - 6, y - 4, xx + 4, y + 2);
          g.quadraticCurveTo(xx + 16, y + 6, xx + 28, y);
          g.lineWidth = 3; g.strokeStyle = '#FF9B3D'; g.stroke();
          g.lineWidth = 1; g.strokeStyle = '#FFE08A'; g.stroke();
        });
      }
    }
    if (P.deco === 'ruins' || P.deco === 'pillars') {
      g.fillStyle = rgba(P.glow, 0.12);
      g.fillRect(0, ground + 10, w, h - ground);
    }
    return { sky, far, mid, floor: flo, P, ground, w, h };
  }

  // Draw something at x, and again one screen-width either side if it pokes
  // over an edge, so the layer tiles without a seam.
  function wrapDraw(w, x, r, fn) {
    fn(x);
    if (x - r < 0) fn(x + w);
    if (x + r > w) fn(x - w);
  }

  // A jagged band of rock: from the top edge down (ceiling) or a ground line up.
  function jagged(g, w, y0, depth, n, rnd, color, fromTop) {
    const pts = [];
    const step = w / n;
    for (let i = 0; i <= n; i++) {
      const x = i * step + (i > 0 && i < n ? (rnd() - 0.5) * step * 0.6 : 0);
      const d = depth * (0.35 + rnd() * 0.65);
      pts.push([x, d]);
    }
    pts[n][1] = pts[0][1];
    g.beginPath();
    if (fromTop) {
      g.moveTo(0, y0);
      for (let i = 0; i < pts.length; i++) {
        const [x, d] = pts[i];
        const nx = i < n ? pts[i + 1][0] : w;
        g.lineTo(x, y0 + d * 0.3);
        g.lineTo((x + nx) / 2, y0 + d);
      }
      g.lineTo(w, y0);
    } else {
      g.moveTo(0, y0);
      for (let i = 0; i < pts.length; i++) {
        const [x, d] = pts[i];
        const nx = i < n ? pts[i + 1][0] : w;
        g.lineTo(x, y0 - d * 0.4);
        g.quadraticCurveTo((x + nx) / 2, y0 - d, nx, y0 - d * 0.4);
      }
      g.lineTo(w, y0 + 200);
      g.lineTo(0, y0 + 200);
    }
    g.closePath();
    g.fillStyle = color;
    g.fill();
  }

  function decorate(g, P, w, h, ground, rnd) {
    const glowSpot = (x, y, r, a) => {
      g.globalCompositeOperation = 'lighter';
      const rg = g.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, rgba(P.glow, a));
      rg.addColorStop(1, rgba(P.glow, 0));
      g.fillStyle = rg;
      g.fillRect(x - r, y - r, r * 2, r * 2);
      g.globalCompositeOperation = 'source-over';
    };
    const n = 6;
    for (let i = 0; i < n; i++) {
      const x = (i + 0.2 + rnd() * 0.6) * (w / n);
      const s = 0.7 + rnd() * 0.6;
      wrapDraw(w, x, 50 * s, (xx) => {
        switch (P.deco) {
          case 'moss': {
            // hanging vines and glowing moss tufts
            g.lineCap = 'round';
            g.beginPath();
            g.moveTo(xx, h * 0.08);
            g.quadraticCurveTo(xx + 8 * s, h * 0.2, xx - 2, h * (0.25 + rnd() * 0.15));
            g.lineWidth = 2.5; g.strokeStyle = shade(P.glow, -0.45); g.stroke();
            for (let k = 0; k < 4; k++) {
              circle(g, xx + (rnd() - 0.5) * 8, h * (0.12 + k * 0.05), 2.2);
              g.fillStyle = rgba(P.glow, 0.8); g.fill();
            }
            ellipse(g, xx + 10, ground - 2, 18 * s, 7 * s); g.fillStyle = shade(P.glow, -0.5); g.fill();
            glowSpot(xx + 10, ground - 4, 26 * s, 0.18);
            break;
          }
          case 'shrooms': {
            const hgt = 30 + rnd() * 40;
            rr(g, xx - 4 * s, ground - hgt * s, 8 * s, hgt * s, 3); g.fillStyle = shade(P.rock2, 0.15); g.fill();
            g.beginPath();
            g.ellipse(xx, ground - hgt * s, 22 * s, 12 * s, 0, Math.PI, 0);
            g.fillStyle = shade(P.glow, -0.25); g.fill();
            glowSpot(xx, ground - hgt * s - 4, 34 * s, 0.25);
            for (let k = 0; k < 3; k++) { circle(g, xx + (k - 1) * 9 * s, ground - hgt * s - 5 * s, 2 * s); g.fillStyle = rgba('#FFFFFF', 0.7); g.fill(); }
            break;
          }
          case 'crystals': {
            for (let k = 0; k < 3; k++) {
              const ch = (20 + rnd() * 34) * s;
              const cx = xx + (k - 1) * 9 * s;
              const lean = (k - 1) * 0.25;
              g.save();
              g.translate(cx, ground);
              g.rotate(lean);
              poly(g, [-5 * s, 0, -5 * s, -ch * 0.8, 0, -ch, 5 * s, -ch * 0.8, 5 * s, 0]);
              g.fillStyle = rgba(P.glow, 0.55); g.fill();
              poly(g, [0, 0, 0, -ch, 5 * s, -ch * 0.8, 5 * s, 0]);
              g.fillStyle = rgba('#FFFFFF', 0.25); g.fill();
              g.restore();
            }
            glowSpot(xx, ground - 20 * s, 44 * s, 0.22);
            if (rnd() < 0.6) {
              poly(g, [xx - 6, h * 0.1, xx, h * (0.18 + rnd() * 0.08), xx + 6, h * 0.1]);
              g.fillStyle = rgba(P.glow, 0.45); g.fill();
            }
            break;
          }
          case 'pillars': {
            const ph = (60 + rnd() * 60) * s;
            rr(g, xx - 11 * s, ground - ph, 22 * s, ph, 2); g.fillStyle = shade(P.rock2, 0.1); g.fill();
            rr(g, xx - 15 * s, ground - ph - 6 * s, 30 * s, 8 * s, 2); g.fillStyle = shade(P.rock2, 0.2); g.fill();
            for (let k = 1; k < 4; k++) { g.fillStyle = rgba('#000000', 0.18); g.fillRect(xx - 6 * s + k * 3 * s, ground - ph, 1.2, ph); }
            if (rnd() < 0.5) { poly(g, [xx - 11 * s, ground - ph * 0.5, xx + 11 * s, ground - ph * 0.62, xx + 11 * s, ground - ph]); g.fillStyle = P.sky[0]; g.fill(); }
            glowSpot(xx, ground - 10, 30 * s, 0.12);
            break;
          }
          case 'lava': {
            g.beginPath();
            g.moveTo(xx - 20 * s, ground);
            g.lineTo(xx - 6 * s, ground - (50 + rnd() * 40) * s);
            g.lineTo(xx + 8 * s, ground - (30 + rnd() * 30) * s);
            g.lineTo(xx + 22 * s, ground);
            g.fillStyle = shade(P.rock2, -0.1); g.fill();
            g.beginPath();
            g.moveTo(xx - 6 * s, ground - 40 * s);
            g.lineTo(xx - 2 * s, ground - 20 * s);
            g.lineTo(xx + 4 * s, ground - 6 * s);
            g.lineWidth = 2.5; g.strokeStyle = '#FF9B3D'; g.stroke();
            glowSpot(xx, ground - 8, 40 * s, 0.25);
            break;
          }
          case 'ice': {
            for (let k = 0; k < 4; k++) {
              const ix = xx + (k - 1.5) * 10 * s;
              const il = (14 + rnd() * 36) * s;
              poly(g, [ix - 4 * s, h * 0.1, ix, h * 0.1 + il, ix + 4 * s, h * 0.1]);
              g.fillStyle = rgba('#E8F6FF', 0.55); g.fill();
            }
            ellipse(g, xx, ground - 2, 26 * s, 8 * s); g.fillStyle = rgba('#F2FAFF', 0.75); g.fill();
            glowSpot(xx, ground - 10, 30 * s, 0.15);
            break;
          }
          case 'bones': {
            g.fillStyle = rgba('#F2E6C2', 0.75);
            circle(g, xx, ground - 6 * s, 6 * s); g.fill();
            g.fillStyle = shade(P.rock, -0.3);
            circle(g, xx - 2.2 * s, ground - 7 * s, 1.6 * s); g.fill();
            circle(g, xx + 2.2 * s, ground - 7 * s, 1.6 * s); g.fill();
            g.lineCap = 'round';
            g.beginPath(); g.moveTo(xx + 10 * s, ground - 2); g.lineTo(xx + 26 * s, ground - 6 * s);
            g.lineWidth = 3 * s; g.strokeStyle = rgba('#F2E6C2', 0.65); g.stroke();
            // candles in niches
            rr(g, xx - 16 * s, h * 0.35, 12 * s, 18 * s, 6 * s); g.fillStyle = shade(P.rock, -0.4); g.fill();
            rr(g, xx - 12 * s, h * 0.35 + 8 * s, 4 * s, 8 * s, 1); g.fillStyle = '#F2EBDD'; g.fill();
            glowSpot(xx - 10 * s, h * 0.35 + 6 * s, 20 * s, 0.35);
            break;
          }
          case 'void': {
            const fy = h * (0.25 + rnd() * 0.3);
            poly(g, [xx - 16 * s, fy, xx + 14 * s, fy - 4 * s, xx + 6 * s, fy + 16 * s, xx - 4 * s, fy + 22 * s]);
            g.fillStyle = shade(P.rock2, 0.1); g.fill();
            glowSpot(xx, fy + 6, 30 * s, 0.2);
            break;
          }
        }
      });
    }
  }

  /* ================= Relic icons ================= */

  const ICON = {};
  ICON.pick = (g, c) => {
    rr(g, 29, 18, 6, 40, 3); paint(g, '#8A5A2E', 2);
    g.beginPath(); g.moveTo(10, 24); g.quadraticCurveTo(32, 6, 54, 24); g.quadraticCurveTo(32, 14, 10, 24); paint(g, c, 2.2);
  };
  ICON.boots = (g, c) => {
    g.beginPath(); g.moveTo(18, 12); g.lineTo(34, 12); g.lineTo(34, 40); g.lineTo(52, 44); g.quadraticCurveTo(56, 54, 48, 54); g.lineTo(16, 54); g.closePath(); paint(g, c, 2.2);
    rr(g, 16, 12, 20, 6, 2); paint(g, shade(c, -0.3), 1.6);
  };
  ICON.candle = (g, c) => {
    rr(g, 22, 26, 20, 28, 4); paint(g, c, 2.2);
    g.beginPath(); g.moveTo(32, 8); g.quadraticCurveTo(40, 18, 32, 24); g.quadraticCurveTo(24, 18, 32, 8); paint(g, '#FFB443', 1.8);
    ellipse(g, 32, 56, 18, 4); paint(g, '#8C8478', 1.6);
  };
  ICON.coin = (g, c) => {
    circle(g, 32, 32, 20); paint(g, c, 2.4); circle(g, 32, 32, 13); g.lineWidth = 2; g.strokeStyle = shade(c, -0.35); g.stroke();
    poly(g, [32, 22, 35, 30, 42, 30, 36, 35, 38, 42, 32, 38, 26, 42, 28, 35, 22, 30, 29, 30]); g.fillStyle = shade(c, -0.25); g.fill();
  };
  ICON.flask = (g, c) => {
    rr(g, 26, 8, 12, 16, 2); paint(g, '#D8E0EC', 2);
    g.beginPath(); g.moveTo(26, 22); g.lineTo(14, 50); g.quadraticCurveTo(12, 56, 20, 56); g.lineTo(44, 56); g.quadraticCurveTo(52, 56, 50, 50); g.lineTo(38, 22); g.closePath(); paint(g, '#D8E0EC', 2);
    g.beginPath(); g.moveTo(19, 40); g.lineTo(45, 40); g.lineTo(50, 50); g.quadraticCurveTo(52, 56, 44, 56); g.lineTo(20, 56); g.quadraticCurveTo(12, 56, 14, 50); g.closePath(); g.fillStyle = c; g.fill();
    circle(g, 28, 48, 2.5); g.fillStyle = '#FFFFFF'; g.fill();
    rr(g, 24, 4, 16, 6, 2); paint(g, '#8A5A2E', 1.6);
  };
  ICON.horn = (g, c) => {
    g.beginPath(); g.moveTo(10, 46); g.quadraticCurveTo(18, 14, 52, 10); g.lineTo(54, 22); g.quadraticCurveTo(30, 24, 22, 50); g.closePath(); paint(g, c, 2.2);
    for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(16 + i * 9, 40 - i * 9); g.lineTo(24 + i * 9, 44 - i * 10); g.lineWidth = 1.6; g.strokeStyle = shade(c, -0.35); g.stroke(); }
  };
  ICON.stone = (g, c) => {
    g.save(); g.translate(32, 34); g.rotate(-0.5);
    rr(g, -22, -9, 44, 18, 8); paint(g, c, 2.2);
    g.beginPath(); g.moveTo(-14, -2); g.lineTo(14, -2); g.lineWidth = 2; g.strokeStyle = rgba('#FFFFFF', 0.5); g.stroke();
    g.restore();
  };
  ICON.lamp = (g, c) => {
    g.beginPath(); g.arc(32, 14, 8, Math.PI, 0); g.lineWidth = 3; g.strokeStyle = INK; g.stroke();
    rr(g, 20, 16, 24, 6, 2); paint(g, '#8C8478', 1.8);
    rr(g, 22, 22, 20, 24, 5); paint(g, rgba(c, 0.9), 2);
    circle(g, 32, 34, 6); g.fillStyle = '#FFF4C2'; g.fill();
    rr(g, 18, 46, 28, 8, 3); paint(g, '#8C8478', 1.8);
  };
  ICON.dice = (g, c) => {
    rr(g, 12, 14, 30, 30, 6); paint(g, c, 2.2);
    for (const [x, y] of [[20, 22], [34, 36], [27, 29]]) { circle(g, x, y, 3); g.fillStyle = INK; g.fill(); }
    g.save(); g.translate(42, 42); g.rotate(0.4);
    rr(g, -10, -10, 20, 20, 4); paint(g, shade(c, -0.08), 2);
    circle(g, -4, -4, 2.4); g.fillStyle = INK; g.fill(); circle(g, 4, 4, 2.4); g.fill();
    g.restore();
  };
  ICON.bell = (g, c) => {
    g.beginPath(); g.moveTo(14, 46); g.quadraticCurveTo(18, 42, 18, 30); g.quadraticCurveTo(18, 12, 32, 12); g.quadraticCurveTo(46, 12, 46, 30); g.quadraticCurveTo(46, 42, 50, 46); g.closePath(); paint(g, c, 2.2);
    circle(g, 32, 50, 5); paint(g, shade(c, -0.2), 1.8);
    circle(g, 32, 9, 3.5); paint(g, shade(c, -0.2), 1.6);
  };
  ICON.fang = (g, c) => {
    g.beginPath(); g.arc(32, 8, 24, 0.35 * Math.PI, 0.65 * Math.PI); g.lineWidth = 2.5; g.strokeStyle = '#8A5A2E'; g.stroke();
    g.beginPath(); g.moveTo(24, 28); g.quadraticCurveTo(28, 52, 34, 58); g.quadraticCurveTo(38, 42, 40, 28); g.closePath(); paint(g, c, 2.2);
  };
  ICON.purse = (g, c) => {
    g.beginPath(); g.moveTo(22, 20); g.quadraticCurveTo(8, 40, 16, 52); g.quadraticCurveTo(32, 60, 48, 52); g.quadraticCurveTo(56, 40, 42, 20); g.closePath(); paint(g, c, 2.2);
    rr(g, 20, 14, 24, 8, 3); paint(g, shade(c, -0.3), 1.8);
    circle(g, 32, 40, 6); paint(g, '#FFC94A', 1.6);
  };
  ICON.quill = (g, c) => {
    g.beginPath(); g.moveTo(14, 54); g.quadraticCurveTo(20, 20, 50, 8); g.quadraticCurveTo(46, 36, 18, 50); g.closePath(); paint(g, c, 2);
    g.beginPath(); g.moveTo(12, 58); g.lineTo(44, 16); g.lineWidth = 2; g.strokeStyle = INK; g.stroke();
  };
  ICON.scale = (g, c) => {
    g.beginPath(); g.moveTo(32, 8); g.quadraticCurveTo(56, 24, 48, 44); g.quadraticCurveTo(40, 58, 32, 58); g.quadraticCurveTo(24, 58, 16, 44); g.quadraticCurveTo(8, 24, 32, 8); paint(g, c, 2.2);
    g.beginPath(); g.moveTo(32, 14); g.lineTo(32, 52); g.lineWidth = 1.6; g.strokeStyle = shade(c, -0.4); g.stroke();
    ellipse(g, 24, 28, 4, 7, 0.4); g.fillStyle = rgba('#FFFFFF', 0.4); g.fill();
  };
  ICON.hourglass = (g, c) => {
    rr(g, 14, 8, 36, 6, 2); paint(g, '#8A5A2E', 1.8); rr(g, 14, 50, 36, 6, 2); paint(g, '#8A5A2E', 1.8);
    g.beginPath(); g.moveTo(18, 14); g.lineTo(46, 14); g.quadraticCurveTo(46, 26, 34, 32); g.quadraticCurveTo(46, 38, 46, 50); g.lineTo(18, 50); g.quadraticCurveTo(18, 38, 30, 32); g.quadraticCurveTo(18, 26, 18, 14);
    g.fillStyle = rgba('#D8F0FF', 0.4); g.fill(); g.lineWidth = 2; g.strokeStyle = INK; g.stroke();
    poly(g, [22, 50, 42, 50, 32, 40]); g.fillStyle = c; g.fill();
    poly(g, [24, 20, 40, 20, 32, 28]); g.fill();
  };
  ICON.crown = (g, c) => {
    poly(g, [10, 46, 8, 18, 22, 32, 32, 12, 42, 32, 56, 18, 54, 46]); paint(g, c, 2.2);
    rr(g, 10, 44, 44, 8, 3); paint(g, shade(c, -0.2), 1.8);
    circle(g, 32, 38, 4); g.fillStyle = '#FF4D6A'; g.fill();
  };
  ICON.map = (g, c) => {
    poly(g, [8, 14, 24, 10, 40, 14, 56, 10, 56, 50, 40, 54, 24, 50, 8, 54]); paint(g, '#E8DCC0', 2);
    g.setLineDash([3, 3]); g.beginPath(); g.moveTo(14, 44); g.quadraticCurveTo(28, 20, 44, 34); g.lineWidth = 2; g.strokeStyle = '#A05A3A'; g.stroke(); g.setLineDash([]);
    poly(g, [44, 24, 46, 30, 52, 30, 47, 34, 49, 40, 44, 36, 39, 40, 41, 34, 36, 30, 42, 30]); g.fillStyle = c; g.fill();
  };
  ICON.gauntlet = (g, c) => {
    rr(g, 18, 34, 28, 22, 4); paint(g, c, 2.2);
    for (let i = 0; i < 4; i++) { rr(g, 18 + i * 7, 12 + (i === 0 || i === 3 ? 6 : 0), 6.5, 26, 3); paint(g, c, 1.8); }
    rr(g, 10, 30, 10, 14, 4); paint(g, c, 1.8);
    g.globalCompositeOperation = 'lighter'; circle(g, 32, 44, 12); g.fillStyle = rgba(c, 0.35); g.fill(); g.globalCompositeOperation = 'source-over';
  };
  ICON.idol = (g, c) => {
    rr(g, 18, 46, 28, 10, 3); paint(g, shade(c, -0.25), 2);
    rr(g, 20, 18, 24, 30, 8); paint(g, c, 2.2);
    circle(g, 32, 16, 10); paint(g, c, 2.2);
    circle(g, 28, 15, 2); g.fillStyle = INK; g.fill(); circle(g, 36, 15, 2); g.fill();
    rr(g, 26, 30, 12, 4, 2); g.fillStyle = shade(c, -0.3); g.fill();
  };
  ICON.lens = (g, c) => {
    g.beginPath(); g.moveTo(40, 40); g.lineTo(54, 56); g.lineWidth = 7; g.strokeStyle = INK; g.stroke(); g.lineWidth = 4; g.strokeStyle = '#8A5A2E'; g.stroke();
    circle(g, 28, 28, 18); paint(g, '#C9D3E8', 2.4);
    circle(g, 28, 28, 13); g.fillStyle = rgba(c, 0.7); g.fill();
    ellipse(g, 23, 22, 5, 3, -0.6); g.fillStyle = rgba('#FFFFFF', 0.7); g.fill();
  };
  ICON.heart = (g, c) => {
    g.globalCompositeOperation = 'lighter'; circle(g, 32, 34, 26); g.fillStyle = rgba(c, 0.3); g.fill(); g.globalCompositeOperation = 'source-over';
    g.beginPath(); g.moveTo(32, 54); g.bezierCurveTo(6, 38, 10, 12, 32, 22); g.bezierCurveTo(54, 12, 58, 38, 32, 54); paint(g, c, 2.4);
    g.beginPath(); g.moveTo(26, 22); g.lineTo(32, 34); g.lineTo(28, 44); g.lineWidth = 2; g.strokeStyle = '#FFE08A'; g.stroke();
  };
  ICON.eye = (g, c) => {
    g.beginPath(); g.moveTo(6, 32); g.quadraticCurveTo(32, 6, 58, 32); g.quadraticCurveTo(32, 58, 6, 32); paint(g, '#F4EEF8', 2.4);
    circle(g, 32, 32, 11); paint(g, c, 2); circle(g, 32, 32, 5); g.fillStyle = INK; g.fill();
    circle(g, 28, 28, 2.5); g.fillStyle = '#FFFFFF'; g.fill();
  };
  ICON.dream = (g, c) => {
    circle(g, 32, 26, 18); g.lineWidth = 4; g.strokeStyle = INK; g.stroke(); g.lineWidth = 2.5; g.strokeStyle = '#C9A26B'; g.stroke();
    g.beginPath();
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; g.moveTo(32, 26); g.lineTo(32 + Math.cos(a) * 17, 26 + Math.sin(a) * 17); }
    g.lineWidth = 1.2; g.strokeStyle = rgba(c, 0.9); g.stroke();
    for (const x of [20, 32, 44]) { g.beginPath(); g.moveTo(x, 42); g.lineTo(x, 50); g.lineWidth = 1.5; g.strokeStyle = INK; g.stroke(); ellipse(g, x, 54, 3.5, 6); paint(g, c, 1.4); }
  };
  ICON.sun = (g, c) => {
    g.globalCompositeOperation = 'lighter'; circle(g, 32, 32, 28); g.fillStyle = rgba(c, 0.35); g.fill(); g.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; poly(g, [32 + Math.cos(a - 0.15) * 15, 32 + Math.sin(a - 0.15) * 15, 32 + Math.cos(a) * 27, 32 + Math.sin(a) * 27, 32 + Math.cos(a + 0.15) * 15, 32 + Math.sin(a + 0.15) * 15]); paint(g, '#FFB443', 1.4); }
    circle(g, 32, 32, 15); paint(g, c, 2.2);
    circle(g, 27, 29, 2); g.fillStyle = INK; g.fill(); circle(g, 37, 29, 2); g.fill();
    g.beginPath(); g.arc(32, 34, 5, 0.2 * Math.PI, 0.8 * Math.PI); g.lineWidth = 1.6; g.strokeStyle = INK; g.stroke();
  };

  const iconCache = new Map();
  // A relic's icon as an image URL (64×64 logical, drawn at 2×).
  function relicIcon(r) {
    let u = iconCache.get(r.id);
    if (u) return u;
    const c = canvas(128, 128);
    const g = c.getContext('2d');
    g.scale(2, 2);
    g.lineJoin = 'round';
    g.lineCap = 'round';
    (ICON[r.icon] || ICON.coin)(g, r.color);
    u = c.toDataURL();
    iconCache.set(r.id, u);
    return u;
  }

  ED.art = { GROUND, canvas, rr, circle, ellipse, poly, paint, INK, hue, palette, hero, portrait, monster, backdrop, crown, relicIcon };
})(window.ED = window.ED || {});
