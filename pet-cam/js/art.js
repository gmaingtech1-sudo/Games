/* Pet Cam — drawings of the animals and their things.

   Everything is drawn in local units: the pet's feet are at (0, 0), up is
   -y, and a pet is about 100 units tall (sitting or standing). Side views
   face +x; the AR view mirrors them to walk left. Fur is shaded with soft
   gradients and thin outlines so the animals read as real pets while still
   standing out against whatever the camera sees. */
window.PC = window.PC || {};
(function (PC) {
  'use strict';

  const TAU = Math.PI * 2;
  const LINE = 'rgba(28, 18, 12, 0.38)';

  /* ---------------- Colour helpers ---------------- */

  const cache = {};
  function rgb(c) {
    if (cache[c]) return cache[c];
    const n = parseInt(c.slice(1), 16);
    return (cache[c] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]);
  }

  // k > 0 lightens toward white, k < 0 darkens toward black.
  function shade(c, k) {
    const [r, g, b] = rgb(c);
    const t = k > 0 ? 255 : 0;
    const a = Math.abs(k);
    return `rgb(${Math.round(r + (t - r) * a)},${Math.round(g + (t - g) * a)},${Math.round(b + (t - b) * a)})`;
  }

  /* ---------------- Species and coats ---------------- */

  const SPECIES = {
    dog: { label: 'Dog', name: 'Buddy', h: 0.46, len: 0.62, wid: 0.24 },
    cat: { label: 'Cat', name: 'Luna', h: 0.28, len: 0.44, wid: 0.16 },
    bunny: { label: 'Bunny', name: 'Clover', h: 0.24, len: 0.32, wid: 0.17 },
  };

  // light: the lighter fur used on the parts listed in `parts`.
  const COATS = {
    dog: {
      golden: { label: 'Golden', base: '#D29A56', light: '#F0D2A0', eye: '#5A3A1F', nose: '#2E211B', ears: 'floppy', tail: 'plume', parts: ['muzzle', 'chest'] },
      black: { label: 'Black Lab', base: '#2B2724', light: '#3A3431', eye: '#6B4526', nose: '#161210', ears: 'floppy', tail: 'otter', parts: [] },
      chocolate: { label: 'Chocolate', base: '#6B4027', light: '#80543A', eye: '#8A6A2E', nose: '#3A241A', ears: 'floppy', tail: 'otter', parts: [] },
      husky: { label: 'Husky', base: '#6D7179', light: '#F4F3F0', eye: '#79C4EF', nose: '#1F1C1C', ears: 'up', tail: 'curl', parts: ['muzzle', 'chest', 'belly', 'paws', 'mask', 'tailtip'] },
      dalmatian: { label: 'Dalmatian', base: '#F4F0E9', light: '#FFFFFF', eye: '#3C2A1E', nose: '#231E1C', ears: 'floppy', tail: 'thin', parts: [], spots: '#26211F' },
      beagle: { label: 'Beagle', base: '#C8874A', light: '#F7F2E9', eye: '#4A2E18', nose: '#231A16', ears: 'long', tail: 'thin', parts: ['muzzle', 'chest', 'belly', 'paws', 'tailtip', 'blaze'], saddle: '#2D2521' },
    },
    cat: {
      orange: { label: 'Orange Tabby', base: '#E0914B', light: '#F6D5AA', eye: '#C9B23A', nose: '#D98A7E', parts: ['muzzle', 'chest'], stripes: '#B2622A' },
      gray: { label: 'Gray Tabby', base: '#8C8D92', light: '#D5D6D8', eye: '#86B84E', nose: '#C98A8A', parts: ['muzzle', 'chest'], stripes: '#55565C' },
      black: { label: 'Black', base: '#28252A', light: '#35313A', eye: '#E3BA30', nose: '#3A3336', parts: [] },
      white: { label: 'White', base: '#F3F0EB', light: '#FFFFFF', eye: '#6DB2E3', nose: '#EBA3A8', parts: [] },
      tuxedo: { label: 'Tuxedo', base: '#242226', light: '#F6F4F0', eye: '#A3C74B', nose: '#E0A0A6', parts: ['muzzle', 'chest', 'belly', 'paws'] },
      calico: { label: 'Calico', base: '#F6F1E8', light: '#FFFFFF', eye: '#C8962C', nose: '#E5A0A0', parts: [], patches: ['#DE8D3E', '#2A2628'] },
    },
    bunny: {
      white: { label: 'White', base: '#F5F3EF', light: '#FFFFFF', eye: '#3A1E24', nose: '#E8A2AA', parts: ['tailtip'] },
      brown: { label: 'Brown', base: '#9B7553', light: '#DDC9AE', eye: '#24160F', nose: '#C98B86', parts: ['belly', 'tailtip', 'muzzle'] },
      gray: { label: 'Gray', base: '#8F8C88', light: '#D6D2CD', eye: '#1E1A18', nose: '#C99090', parts: ['belly', 'tailtip'] },
      dutch: { label: 'Dutch', base: '#3B3533', light: '#FAF8F5', eye: '#1E1614', nose: '#E0A0A6', parts: ['muzzle', 'blaze', 'chest', 'belly', 'paws', 'tailtip'] },
    },
  };

  function coatOf(species, key) {
    const list = COATS[species] || COATS.dog;
    return list[key] || list[Object.keys(list)[0]];
  }

  const has = (c, part) => c.parts.indexOf(part) !== -1;
  const partColor = (c, part) => (has(c, part) ? c.light : c.base);

  /* ---------------- Drawing helpers ---------------- */

  function ell(ctx, x, y, rx, ry, rot) {
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot || 0, 0, TAU);
  }

  // Fill the current path with soft top-lit fur shading.
  function fur(ctx, color, y0, y1, outline) {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, shade(color, 0.14));
    g.addColorStop(0.55, color);
    g.addColorStop(1, shade(color, -0.2));
    ctx.fillStyle = g;
    ctx.fill();
    if (outline !== false) {
      ctx.strokeStyle = LINE;
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
  }

  function solid(ctx, color) {
    ctx.fillStyle = color;
    ctx.fill();
  }

  // A tapered limb or tail: a thick curve with an outline under it.
  function limb(ctx, pts, w, color) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      if (pts.length === 2) ctx.lineTo(pts[1][0], pts[1][1]);
      else if (pts.length === 3) ctx.quadraticCurveTo(pts[1][0], pts[1][1], pts[2][0], pts[2][1]);
      else ctx.bezierCurveTo(pts[1][0], pts[1][1], pts[2][0], pts[2][1], pts[3][0], pts[3][1]);
    };
    path();
    ctx.strokeStyle = LINE;
    ctx.lineWidth = w + 2.4;
    ctx.stroke();
    path();
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.stroke();
  }

  // Clip to an ellipse and run fn (for markings that stay inside the fur).
  function within(ctx, x, y, rx, ry, rot, fn) {
    ctx.save();
    ell(ctx, x, y, rx, ry, rot);
    ctx.clip();
    fn();
    ctx.restore();
  }

  function eyeRound(ctx, x, y, r, iris, state, look) {
    if (state === 'closed') {
      ctx.strokeStyle = 'rgba(25,15,10,0.85)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(x, y - r * 0.4, r, 0.2 * Math.PI, 0.8 * Math.PI);
      ctx.stroke();
      return;
    }
    if (state === 'happy') {
      ctx.strokeStyle = 'rgba(25,15,10,0.9)';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(x, y + r * 0.5, r * 0.95, 1.15 * Math.PI, 1.85 * Math.PI);
      ctx.stroke();
      return;
    }
    const big = state === 'wide' ? 1.15 : 1;
    const lx = (look || 0) * r * 0.35;
    ell(ctx, x, y, r * big, r * big);
    solid(ctx, iris);
    ell(ctx, x + lx, y, r * 0.58 * big, r * 0.62 * big);
    solid(ctx, '#0E0A08');
    ell(ctx, x + lx + r * 0.3, y - r * 0.35, r * 0.25, r * 0.25);
    solid(ctx, 'rgba(255,255,255,0.9)');
  }

  // Cat eye: almond iris with a slit pupil that widens when excited.
  function eyeCat(ctx, x, y, r, iris, state, look, dilate) {
    if (state === 'closed' || state === 'happy') {
      ctx.strokeStyle = 'rgba(25,15,10,0.85)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (state === 'closed') ctx.arc(x, y - r * 0.5, r, 0.2 * Math.PI, 0.8 * Math.PI);
      else ctx.arc(x, y + r * 0.6, r, 1.2 * Math.PI, 1.8 * Math.PI);
      ctx.stroke();
      return;
    }
    const big = state === 'wide' ? 1.1 : 1;
    ell(ctx, x, y, r * 1.12 * big, r * 0.9 * big);
    solid(ctx, iris);
    ctx.strokeStyle = 'rgba(20,12,8,0.7)';
    ctx.lineWidth = 0.9;
    ctx.stroke();
    const lx = (look || 0) * r * 0.3;
    ell(ctx, x + lx, y, r * (0.18 + (dilate || 0) * 0.5), r * 0.82 * big);
    solid(ctx, '#0E0A08');
    ell(ctx, x + lx + r * 0.35, y - r * 0.3, r * 0.2, r * 0.2);
    solid(ctx, 'rgba(255,255,255,0.9)');
  }

  function whiskers(ctx, x, y, dir, len) {
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 0.8;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(x, y + i * 1.6);
      ctx.quadraticCurveTo(x + dir * len * 0.5, y + i * 2.4 - 1, x + dir * len, y + i * 4);
      ctx.stroke();
    }
  }

  // Deterministic "random" spots so a dalmatian keeps its spots.
  function spots(ctx, c, x0, y0, w, h, seed, size) {
    if (!c.spots) return;
    ctx.fillStyle = c.spots;
    let s = seed * 9301 + 49297;
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    const n = Math.round(w * h / 90);
    for (let i = 0; i < n; i++) {
      ell(ctx, x0 + rnd() * w, y0 + rnd() * h, (size || 2.6) * (0.6 + rnd() * 0.7), (size || 2.6) * (0.5 + rnd() * 0.6), rnd() * 3);
      ctx.fill();
    }
  }

  function stripes(ctx, c, x0, y0, w, h, step, bend) {
    if (!c.stripes) return;
    ctx.strokeStyle = c.stripes;
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = step * 0.42;
    for (let x = x0; x < x0 + w; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.quadraticCurveTo(x + (bend || 3), y0 + h * 0.5, x - 1, y0 + h);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function patches(ctx, c, list) {
    if (!c.patches) return;
    list.forEach(([x, y, rx, ry, i]) => {
      ell(ctx, x, y, rx, ry, 0.4 * i);
      solid(ctx, c.patches[i % c.patches.length]);
    });
  }

  /* ---------------- Mouth pieces ---------------- */

  function tongue(ctx, x, y, s) {
    ell(ctx, x, y, 3.4 * s, 5 * s);
    solid(ctx, '#E86F82');
    ctx.strokeStyle = 'rgba(160,40,60,0.6)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y - 3 * s);
    ctx.lineTo(x, y + 2.5 * s);
    ctx.stroke();
  }

  /* ======================= DOG ======================= */

  function dogTail(ctx, c, x, y, o, side) {
    const wag = Math.sin(o.t * (6 + o.wag * 10)) * (0.15 + o.wag * 0.5);
    const color = c.base;
    if (c.tail === 'curl') {
      limb(ctx, [[x, y], [x - 8, y - 26 + wag * 6], [x + 18, y - 26 + wag * 6]], 8, color);
      if (has(c, 'tailtip')) limb(ctx, [[x + 10, y - 27 + wag * 6], [x + 18, y - 26 + wag * 6]], 6, c.light);
      return;
    }
    const a = (side ? -2.35 : -1.9) + wag;
    const L = c.tail === 'plume' ? 34 : 30;
    const tx = x + Math.cos(a) * L, ty = y + Math.sin(a) * L;
    const mx = x + Math.cos(a + 0.35) * L * 0.55, my = y + Math.sin(a + 0.35) * L * 0.55;
    const w = c.tail === 'plume' ? 9 : c.tail === 'otter' ? 8 : 5.5;
    limb(ctx, [[x, y], [mx, my], [tx, ty]], w, color);
    if (c.tail === 'plume') limb(ctx, [[mx, my + 2], [tx, ty + 3]], 5, c.light);
    if (has(c, 'tailtip')) limb(ctx, [[x + Math.cos(a) * L * 0.8, y + Math.sin(a) * L * 0.8], [tx, ty]], w * 0.9, c.light);
    if (c.spots) {
      ctx.save();
      ctx.fillStyle = c.spots;
      ell(ctx, mx, my, 2, 1.6);
      ctx.fill();
      ctx.restore();
    }
  }

  function dogEarSide(ctx, c, hx, hy, o) {
    const earColor = c.saddle ? shade(c.base, -0.08) : c.spots ? c.spots : shade(c.base, -0.14);
    if (c.ears === 'up') {
      const f = (o.earFlick || 0) * 0.3;
      ctx.beginPath();
      ctx.moveTo(hx - 11, hy - 8);
      ctx.lineTo(hx - 7 - f * 6, hy - 29);
      ctx.lineTo(hx + 1, hy - 11);
      ctx.closePath();
      fur(ctx, c.base, hy - 29, hy - 8);
      ctx.beginPath();
      ctx.moveTo(hx - 8.5, hy - 10);
      ctx.lineTo(hx - 6.5 - f * 5, hy - 24);
      ctx.lineTo(hx - 2, hy - 11);
      ctx.closePath();
      solid(ctx, '#E9B7AE');
      return;
    }
    const long = c.ears === 'long' ? 1.3 : 1;
    const swing = Math.sin(o.t * 9) * 0.12 * (o.moving || 0);
    ell(ctx, hx - 5, hy + 3 * long, 6.5, 13 * long, 0.28 + swing);
    fur(ctx, earColor, hy - 10, hy + 18 * long);
  }

  function dogHeadSide(ctx, c, hx, hy, o) {
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(o.headRot || 0);
    // skull
    ell(ctx, 0, 0, 15, 14);
    fur(ctx, c.base, -14, 14);
    if (c.spots) within(ctx, 0, 0, 15, 14, 0, () => spots(ctx, c, -15, -14, 30, 28, 3));
    if (c.saddle) within(ctx, 0, 0, 15, 14, 0, () => { ell(ctx, -6, -8, 12, 8); solid(ctx, shade(c.base, -0.06)); });
    if (has(c, 'mask')) within(ctx, 0, 0, 15, 14, 0, () => { ell(ctx, 8, 7, 12, 9); solid(ctx, c.light); ell(ctx, 3, -6, 3, 2); solid(ctx, c.light); });
    if (has(c, 'blaze')) within(ctx, 0, 0, 15, 14, 0, () => { ell(ctx, 10, -4, 4, 12, -0.8); solid(ctx, c.light); });
    // snout
    const open = o.mouth === 'open' || o.mouth === 'pant';
    ell(ctx, 16, 5, 13, 8, 0.05);
    fur(ctx, partColor(c, 'muzzle'), -3, 13);
    if (c.spots) within(ctx, 16, 5, 13, 8, 0.05, () => spots(ctx, c, 6, -2, 20, 12, 5, 1.6));
    // jaw / mouth
    if (open) {
      ell(ctx, 16, 12, 10, o.mouth === 'open' ? 5 : 3.5, 0.08);
      solid(ctx, '#4A1E22');
      if (o.mouth === 'pant') tongue(ctx, 18, 16, 0.9);
      ell(ctx, 15, 13.5, 9, 3, 0.05);
      fur(ctx, partColor(c, 'muzzle'), 11, 16);
    } else if (o.mouth === 'chew') {
      const k = Math.abs(Math.sin(o.t * 14));
      ell(ctx, 16, 11 + k * 1.5, 8, 2 + k * 1.5);
      fur(ctx, partColor(c, 'muzzle'), 9, 15);
    } else {
      ctx.strokeStyle = 'rgba(30,15,10,0.6)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(26, 9);
      ctx.quadraticCurveTo(20, 12, 11, 10);
      ctx.stroke();
    }
    // nose
    ell(ctx, 27.5, 2, 4, 3.4);
    solid(ctx, c.nose);
    ell(ctx, 28, 1, 1.4, 0.9);
    solid(ctx, 'rgba(255,255,255,0.35)');
    // eye and brow
    eyeRound(ctx, 5, -3, 2.9, c.eye, o.eyes, 0.6);
    dogEarSide(ctx, c, 0, 0, o);
    // carried things sit in the front of the mouth
    if (o.carry) carryItem(ctx, 20, 12, o.carry, 0.9);
    ctx.restore();
  }

  function dogSide(ctx, c, o) {
    const ph = o.phase || 0;
    const mv = o.moving || 0;
    const cr = (o.crouch || 0) * 14;
    const bob = -Math.abs(Math.sin(ph)) * 2.5 * mv + cr;
    const hip = [-34, -60 + bob], sh = [28, -62 + bob];
    const legs = [
      // [joint, phase offset, near?, back?]
      [hip, Math.PI, false, true],
      [sh, 0, false, false],
    ];
    const near = [
      [hip, 0, true, true],
      [sh, Math.PI, true, false],
    ];
    const leg = ([j, off, isNear, back]) => {
      const sw = Math.sin(ph + off) * 0.5 * mv;
      const lift = Math.max(0, Math.cos(ph + off)) * 8 * mv;
      const px = j[0] + (isNear ? 0 : 5) + Math.sin(sw) * 34;
      const py = -lift;
      const kx = (j[0] + px) / 2 + (back ? -7 : 3);
      const ky = (j[1] + py) / 2 + (back ? 2 : 0);
      const color = isNear ? c.base : shade(c.base, -0.22);
      limb(ctx, [[j[0], j[1]], [kx, ky], [px, py - 5]], back ? 13 : 11, color);
      if (has(c, 'paws')) limb(ctx, [[kx + (px - kx) * 0.55, ky + (py - ky) * 0.55], [px, py - 5]], back ? 11 : 10, isNear ? c.light : shade(c.light, -0.2));
      ell(ctx, px + 3, py - 3, 7, 3.8);
      fur(ctx, isNear ? partColor(c, 'paws') : shade(partColor(c, 'paws'), -0.22), py - 7, py);
      if (c.spots && isNear) { ctx.fillStyle = c.spots; ell(ctx, kx, ky, 2, 1.6); ctx.fill(); }
    };
    legs.forEach(leg);
    dogTail(ctx, c, -44, -68 + bob, o, true);
    // body
    ell(ctx, -3, -62 + bob, 45, 19);
    fur(ctx, c.base, -81 + bob, -43 + bob);
    ell(ctx, 26, -58 + bob, 18, 22, -0.2);
    fur(ctx, c.base, -80 + bob, -36 + bob);
    within(ctx, -3, -62 + bob, 45, 19, 0, () => {
      if (has(c, 'belly')) { ell(ctx, 0, -46 + bob, 38, 8); solid(ctx, c.light); }
      if (c.saddle) { ell(ctx, -8, -76 + bob, 34, 11); solid(ctx, c.saddle); }
      spots(ctx, c, -48, -82 + bob, 92, 40, 11);
    });
    if (has(c, 'chest')) within(ctx, 26, -58 + bob, 18, 22, -0.2, () => { ell(ctx, 36, -52 + bob, 10, 16, -0.3); solid(ctx, c.light); });
    near.forEach(leg);
    // neck and head
    const hd = o.headDown || 0;
    const hx = 50 + hd * 12, hy = -88 + bob + hd * 62;
    limb(ctx, [[30, -68 + bob], [hx - 4, hy + 4]], 20, c.base);
    if (has(c, 'chest')) limb(ctx, [[36, -62 + bob], [hx - 2, hy + 10]], 8, c.light);
    // collar
    const cx = 30 + (hx - 30) * 0.35, cy = -68 + bob + (hy + 4 - (-68 + bob)) * 0.35;
    ell(ctx, cx, cy, 2.6, 9.5, Math.atan2(hy - cy, hx - cx) + 0.2);
    solid(ctx, '#D2383A');
    ell(ctx, cx + 2, cy + 8, 2.2, 2.2);
    solid(ctx, '#F2C14E');
    dogHeadSide(ctx, c, hx, hy, Object.assign({}, o, { headRot: hd * 0.5 }));
  }

  function dogHeadFront(ctx, c, o) {
    const floppy = c.ears !== 'up';
    const long = c.ears === 'long' ? 1.3 : 1;
    const earColor = c.saddle ? shade(c.base, -0.08) : c.spots ? c.spots : shade(c.base, -0.14);
    if (!floppy) {
      [-1, 1].forEach((s) => {
        const f = s > 0 ? (o.earFlick || 0) * 4 : 0;
        ctx.beginPath();
        ctx.moveTo(s * 7, -13);
        ctx.lineTo(s * (17 + f), -36);
        ctx.lineTo(s * 21, -7);
        ctx.closePath();
        fur(ctx, c.base, -36, -7);
        ctx.beginPath();
        ctx.moveTo(s * 10, -13);
        ctx.lineTo(s * (16.5 + f), -30);
        ctx.lineTo(s * 18.5, -10);
        ctx.closePath();
        solid(ctx, '#E9B7AE');
      });
    }
    ell(ctx, 0, 0, 21, 19);
    fur(ctx, c.base, -19, 19);
    within(ctx, 0, 0, 21, 19, 0, () => {
      if (c.saddle) { ell(ctx, 0, -14, 22, 9); solid(ctx, shade(c.base, -0.05)); }
      if (has(c, 'mask')) {
        ell(ctx, 0, 10, 17, 11); solid(ctx, c.light);
        ell(ctx, -9, -8, 3.5, 2.3); solid(ctx, c.light);
        ell(ctx, 9, -8, 3.5, 2.3); solid(ctx, c.light);
      }
      if (has(c, 'blaze')) { ell(ctx, 0, -8, 3.5, 14); solid(ctx, c.light); }
      spots(ctx, c, -21, -19, 42, 38, 7, 2.2);
    });
    const open = o.mouth === 'open' || o.mouth === 'pant';
    // muzzle
    ell(ctx, 0, 9, 11.5, 9);
    fur(ctx, partColor(c, 'muzzle'), 0, 18);
    if (open) {
      ell(ctx, 0, 14, 6.5, o.mouth === 'open' ? 5 : 3.6);
      solid(ctx, '#4A1E22');
      if (o.mouth === 'pant') tongue(ctx, 0, 17.5, 1);
    } else if (o.mouth === 'chew') {
      const k = Math.abs(Math.sin(o.t * 14));
      ell(ctx, 0, 14, 4.5, 1 + k * 2.2);
      solid(ctx, '#4A1E22');
    } else {
      ctx.strokeStyle = 'rgba(30,15,10,0.65)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(0, 8);
      ctx.lineTo(0, 11.5);
      ctx.quadraticCurveTo(-3, 14, -6, 12.5);
      ctx.moveTo(0, 11.5);
      ctx.quadraticCurveTo(3, 14, 6, 12.5);
      ctx.stroke();
    }
    // nose
    ell(ctx, 0, 5, 5.2, 3.9);
    solid(ctx, c.nose);
    ell(ctx, -1.5, 3.8, 1.8, 1);
    solid(ctx, 'rgba(255,255,255,0.35)');
    // eyes
    [-1, 1].forEach((s) => eyeRound(ctx, s * 9, -4, 3.7, c.eye, o.eyes, o.gaze));
    // brows (a real dog tell: they lift when curious)
    ctx.strokeStyle = 'rgba(30,15,10,0.35)';
    ctx.lineWidth = 1.3;
    [-1, 1].forEach((s) => {
      ctx.beginPath();
      ctx.moveTo(s * 5.5, -10 - (o.tilt ? 1.5 : 0));
      ctx.quadraticCurveTo(s * 9, -12 - (o.tilt ? 2 : 0), s * 12.5, -10);
      ctx.stroke();
    });
    if (floppy) {
      [-1, 1].forEach((s) => {
        ell(ctx, s * 20, 2 * long + 2, 7.5, 14 * long, -s * 0.22);
        fur(ctx, earColor, -12, 18 * long);
      });
    }
    if (o.carry) carryItem(ctx, 0, 15, o.carry, 1);
  }

  function dogFront(ctx, c, o) {
    // tail sweeps the floor behind
    const a = Math.sin(o.t * (5 + o.wag * 12)) * (0.2 + o.wag * 0.7);
    const tx = 16 + 22 * Math.cos(a), ty = -4 - 16 * Math.abs(Math.sin(a));
    if (c.tail === 'curl') limb(ctx, [[14, -26], [34, -34], [26, -52 + a * 6]], 8, c.base);
    else limb(ctx, [[10, -8], [(10 + tx) / 2 + 4, -10], [tx + 10, ty]], c.tail === 'plume' ? 9 : 6, c.base);
    // haunches and back paws
    ell(ctx, 0, -22, 34, 22);
    fur(ctx, c.base, -44, 0);
    within(ctx, 0, -22, 34, 22, 0, () => spots(ctx, c, -34, -44, 68, 44, 13));
    [-1, 1].forEach((s) => {
      ell(ctx, s * 27, -4, 10, 5);
      fur(ctx, partColor(c, 'paws'), -9, 0);
    });
    // torso
    ell(ctx, 0, -48, 23, 29);
    fur(ctx, c.base, -77, -19);
    within(ctx, 0, -48, 23, 29, 0, () => {
      if (has(c, 'chest')) { ell(ctx, 0, -44, 12, 22); solid(ctx, c.light); }
      spots(ctx, c, -23, -77, 46, 58, 17);
    });
    // front legs
    const up = o.pawUp || 0;
    [-1, 1].forEach((s) => {
      const raised = up === 2 || (up === 1 && s > 0);
      if (raised) {
        const wave = Math.sin(o.t * 6) * 3;
        limb(ctx, [[s * 11, -50], [s * 16, -60], [s * 9, -70 + wave]], 11, c.base);
        ell(ctx, s * 8, -71 + wave, 6, 5);
        fur(ctx, partColor(c, 'paws'), -76, -66);
      } else {
        limb(ctx, [[s * 11, -52], [s * 11, -5]], 11, c.base);
        if (has(c, 'paws')) limb(ctx, [[s * 11, -20], [s * 11, -5]], 10, c.light);
        if (c.spots) { ctx.fillStyle = c.spots; ell(ctx, s * 11, -30, 2, 1.7); ctx.fill(); }
        ell(ctx, s * 11, -3.5, 7.5, 4.3);
        fur(ctx, partColor(c, 'paws'), -8, 0);
      }
    });
    // collar
    ell(ctx, 0, -70, 15, 4.5);
    solid(ctx, '#D2383A');
    ell(ctx, 0, -65.5, 2.6, 2.6);
    solid(ctx, '#F2C14E');
    ctx.save();
    ctx.translate(0, -86);
    ctx.rotate(o.tilt || 0);
    dogHeadFront(ctx, c, o);
    ctx.restore();
  }

  function dogLie(ctx, c, o) {
    const br = 1 + Math.sin(o.t * 1.6) * 0.03;
    dogTail(ctx, c, -44, -12, Object.assign({}, o, { wag: 0 }), true);
    ell(ctx, -30, -14, 17, 13 * br);
    fur(ctx, c.base, -27, 0);
    ell(ctx, -4, -18, 46, 17 * br);
    fur(ctx, c.base, -35, 0);
    within(ctx, -4, -18, 46, 17 * br, 0, () => {
      if (c.saddle) { ell(ctx, -8, -32, 36, 10); solid(ctx, c.saddle); }
      spots(ctx, c, -50, -35, 92, 34, 23);
    });
    [0, 6].forEach((d) => {
      ell(ctx, 40 + d, -5 + d * 0.2, 16, 5);
      fur(ctx, d ? partColor(c, 'paws') : shade(partColor(c, 'paws'), -0.2), -10, 0);
    });
    dogHeadSide(ctx, c, 46, -18, Object.assign({}, o, { headRot: 0.12 }));
  }

  function dogBelly(ctx, c, o) {
    const kick = Math.sin(o.t * 16) * (o.kick || 0);
    const a = Math.sin(o.t * 12) * 0.7;
    limb(ctx, [[-44, -8], [-58, -6], [-66, -8 - Math.abs(a) * 8]], 7, c.base);
    // legs in the air
    const legUp = (x, ang, near) => {
      const px = x + Math.sin(ang) * 20, py = -46 - Math.cos(ang) * 6;
      limb(ctx, [[x, -28], [x + 3, -38], [px, py]], near ? 11 : 10, near ? c.base : shade(c.base, -0.2));
      ell(ctx, px, py - 2, 6.5, 4.5, ang);
      fur(ctx, partColor(c, 'paws'), py - 7, py + 3);
    };
    legUp(-24, 0.3, false);
    legUp(26, -0.2, false);
    ell(ctx, 0, -22, 42, 17);
    fur(ctx, c.base, -39, -5);
    within(ctx, 0, -22, 42, 17, 0, () => {
      ell(ctx, 0, -32, 30, 9);
      solid(ctx, shade(has(c, 'belly') ? c.light : c.base, 0.3));
      spots(ctx, c, -42, -39, 84, 34, 31);
    });
    legUp(-30, 0.1 + kick * 0.6, true);
    legUp(22, 0.2, true);
    dogHeadSide(ctx, c, 50, -18, Object.assign({}, o, { headRot: 0.55, mouth: 'pant' }));
  }

  /* ======================= CAT ======================= */

  function catTail(ctx, c, x, y, o, up) {
    const sway = Math.sin(o.t * (1.4 + o.wag * 3)) * (5 + o.wag * 5);
    const pts = up
      ? [[x, y], [x - 20, y - 6], [x - 22 + sway * 0.3, y - 36], [x - 12 + sway, y - 56]]
      : [[x, y], [x - 22, y + 4], [x - 38, y - 4], [x - 46 + sway * 0.4, y - 18]];
    limb(ctx, pts, 6.5, c.base);
    const tip = pts[3];
    if (c.stripes) {
      ctx.fillStyle = c.stripes;
      for (let i = 1; i <= 3; i++) {
        const k = 0.45 + i * 0.15;
        const bx = bez(pts, k, 0), by = bez(pts, k, 1);
        ell(ctx, bx, by, 3.4, 2);
        ctx.fill();
      }
    }
    if (c.patches) { ell(ctx, tip[0], tip[1], 4, 4); solid(ctx, c.patches[1]); }
  }

  function bez(p, t, i) {
    const u = 1 - t;
    return u * u * u * p[0][i] + 3 * u * u * t * p[1][i] + 3 * u * t * t * p[2][i] + t * t * t * p[3][i];
  }

  function catHeadSide(ctx, c, hx, hy, o) {
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(o.headRot || 0);
    // ear
    const f = (o.earFlick || 0);
    ctx.beginPath();
    ctx.moveTo(-9, -7);
    ctx.lineTo(-4 - f * 4, -25);
    ctx.lineTo(4, -10);
    ctx.closePath();
    fur(ctx, c.base, -25, -7);
    ctx.beginPath();
    ctx.moveTo(-6.5, -9);
    ctx.lineTo(-3.8 - f * 3, -20);
    ctx.lineTo(1.5, -10.5);
    ctx.closePath();
    solid(ctx, '#EBAAA8');
    ell(ctx, 0, 0, 14, 12.5);
    fur(ctx, c.base, -12.5, 12.5);
    within(ctx, 0, 0, 14, 12.5, 0, () => {
      stripes(ctx, c, -10, -13, 14, 9, 4.5, 1);
      patches(ctx, c, [[-6, -6, 8, 6, 0]]);
    });
    ell(ctx, 10, 4, 7.5, 6);
    fur(ctx, partColor(c, 'muzzle'), -2, 10);
    // nose and mouth
    ctx.beginPath();
    ctx.moveTo(17.5, 0.5);
    ctx.lineTo(15, 0);
    ctx.lineTo(16.5, 3);
    ctx.closePath();
    solid(ctx, c.nose);
    if (o.mouth === 'open') {
      ell(ctx, 13, 7.5, 4, 3);
      solid(ctx, '#5A2228');
    } else if (o.mouth === 'chew') {
      const k = Math.abs(Math.sin(o.t * 14));
      ell(ctx, 13, 7.5, 3.4, 0.8 + k * 1.6);
      solid(ctx, '#5A2228');
    } else {
      ctx.strokeStyle = 'rgba(30,15,10,0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(16.5, 3);
      ctx.quadraticCurveTo(15, 7, 11, 6.5);
      ctx.stroke();
    }
    eyeCat(ctx, 6, -2.5, 3.4, c.eye, o.eyes, 0.7, o.dilate);
    whiskers(ctx, 13, 4, 1, 16);
    if (o.carry) carryItem(ctx, 16, 9, o.carry, 0.75);
    ctx.restore();
  }

  function catSide(ctx, c, o) {
    const ph = o.phase || 0;
    const mv = o.moving || 0;
    const cr = (o.crouch || 0) * 14;
    const bob = -Math.abs(Math.sin(ph)) * 1.6 * mv + cr;
    const hip = [-30, -44 + bob], sh = [24, -46 + bob];
    const leg = ([j, off, isNear, back]) => {
      const sw = Math.sin(ph + off) * 0.55 * mv;
      const lift = Math.max(0, Math.cos(ph + off)) * 6 * mv;
      const px = j[0] + (isNear ? 0 : 4) + Math.sin(sw) * 26 + (back ? -2 : 0);
      const py = -lift;
      const kx = (j[0] + px) / 2 + (back ? -8 - cr * 0.4 : 2 + cr * 0.3);
      const ky = (j[1] + py) / 2;
      const color = isNear ? c.base : shade(c.base, -0.22);
      limb(ctx, [[j[0], j[1]], [kx, ky], [px, py - 3.5]], back ? 10 : 8, color);
      if (has(c, 'paws')) limb(ctx, [[px - 1, py - 9], [px, py - 3.5]], 7, isNear ? c.light : shade(c.light, -0.2));
      ell(ctx, px + 2, py - 2.5, 5, 2.8);
      fur(ctx, isNear ? partColor(c, 'paws') : shade(partColor(c, 'paws'), -0.2), py - 5, py);
    };
    leg([hip, Math.PI, false, true]);
    leg([sh, 0, false, false]);
    catTail(ctx, c, -40, -52 + bob, o, true);
    ell(ctx, -3, -47 + bob, 40, 15);
    fur(ctx, c.base, -62 + bob, -32 + bob);
    ell(ctx, 22, -46 + bob, 13, 15, -0.2);
    fur(ctx, c.base, -61 + bob, -31 + bob);
    within(ctx, -3, -47 + bob, 40, 15, 0, () => {
      if (has(c, 'belly')) { ell(ctx, 0, -34 + bob, 32, 6); solid(ctx, c.light); }
      stripes(ctx, c, -40, -63 + bob, 70, 20, 8, 4);
      patches(ctx, c, [[-20, -54 + bob, 14, 9, 0], [8, -56 + bob, 10, 7, 1], [-34, -44 + bob, 8, 8, 1]]);
    });
    if (has(c, 'chest')) within(ctx, 22, -46 + bob, 13, 15, -0.2, () => { ell(ctx, 30, -40 + bob, 7, 12, -0.3); solid(ctx, c.light); });
    leg([hip, 0, true, true]);
    leg([sh, Math.PI, true, false]);
    const hd = o.headDown || 0;
    const hx = 38 + hd * 10, hy = -66 + bob + hd * 46;
    limb(ctx, [[24, -52 + bob], [hx - 3, hy + 3]], 15, c.base);
    catHeadSide(ctx, c, hx, hy, Object.assign({}, o, { headRot: hd * 0.45 }));
  }

  function catHeadFront(ctx, c, o) {
    const f = o.earFlick || 0;
    [-1, 1].forEach((s) => {
      const ff = s > 0 ? f * 4 : 0;
      ctx.beginPath();
      ctx.moveTo(s * 6, -10);
      ctx.lineTo(s * (14 + ff), -28);
      ctx.lineTo(s * 19, -4);
      ctx.closePath();
      fur(ctx, c.base, -28, -4);
      ctx.beginPath();
      ctx.moveTo(s * 8.5, -9.5);
      ctx.lineTo(s * (13.6 + ff * 0.8), -22);
      ctx.lineTo(s * 16.5, -6);
      ctx.closePath();
      solid(ctx, '#EBAAA8');
    });
    ell(ctx, 0, 0, 19, 16);
    fur(ctx, c.base, -16, 16);
    within(ctx, 0, 0, 19, 16, 0, () => {
      // the tabby "M" on the forehead
      if (c.stripes) {
        ctx.strokeStyle = c.stripes;
        ctx.globalAlpha = 0.8;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(-7, -7);
        ctx.lineTo(-4, -14);
        ctx.lineTo(0, -8);
        ctx.lineTo(4, -14);
        ctx.lineTo(7, -7);
        ctx.stroke();
        [-1, 1].forEach((s) => {
          ctx.beginPath();
          ctx.moveTo(s * 13, -1);
          ctx.lineTo(s * 19, -2);
          ctx.moveTo(s * 13, 3);
          ctx.lineTo(s * 19, 4);
          ctx.stroke();
        });
        ctx.globalAlpha = 1;
      }
      patches(ctx, c, [[-11, -8, 10, 9, 0], [12, -9, 8, 7, 1]]);
      if (has(c, 'muzzle')) { ell(ctx, 0, 8, 10, 7); solid(ctx, c.light); }
    });
    // eyes
    [-1, 1].forEach((s) => eyeCat(ctx, s * 7.5, -2, 4, c.eye, o.eyes, o.gaze, o.dilate));
    // nose, mouth
    ctx.beginPath();
    ctx.moveTo(-2.4, 3.5);
    ctx.lineTo(2.4, 3.5);
    ctx.lineTo(0, 6);
    ctx.closePath();
    solid(ctx, c.nose);
    if (o.mouth === 'open') {
      ell(ctx, 0, 10, 3.6, 3.4);
      solid(ctx, '#5A2228');
      ell(ctx, 0, 11.5, 2, 1.4);
      solid(ctx, '#E07A88');
    } else if (o.mouth === 'chew') {
      const k = Math.abs(Math.sin(o.t * 14));
      ell(ctx, 0, 9.5, 2.6, 0.6 + k * 1.6);
      solid(ctx, '#5A2228');
    } else {
      ctx.strokeStyle = 'rgba(30,15,10,0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, 6);
      ctx.lineTo(0, 7.5);
      ctx.quadraticCurveTo(-2, 9.5, -4, 8.2);
      ctx.moveTo(0, 7.5);
      ctx.quadraticCurveTo(2, 9.5, 4, 8.2);
      ctx.stroke();
    }
    whiskers(ctx, 5, 7, 1, 18);
    whiskers(ctx, -5, 7, -1, 18);
    if (o.carry) carryItem(ctx, 0, 11, o.carry, 0.8);
  }

  function catFront(ctx, c, o) {
    catTail(ctx, c, 14, -10, o, true);
    ell(ctx, 0, -18, 24, 18);
    fur(ctx, c.base, -36, 0);
    within(ctx, 0, -18, 24, 18, 0, () => {
      stripes(ctx, c, -24, -36, 48, 20, 7, 2);
      patches(ctx, c, [[-14, -22, 12, 10, 0], [16, -14, 9, 8, 1]]);
    });
    ell(ctx, 0, -42, 16, 25);
    fur(ctx, c.base, -67, -17);
    within(ctx, 0, -42, 16, 25, 0, () => {
      if (has(c, 'chest')) { ell(ctx, 0, -38, 9, 20); solid(ctx, c.light); }
      patches(ctx, c, [[9, -50, 9, 10, 0], [-10, -34, 7, 9, 1]]);
    });
    const up = o.pawUp || 0;
    [-1, 1].forEach((s) => {
      const raised = up === 2 || (up === 1 && s > 0);
      if (raised) {
        limb(ctx, [[s * 7, -44], [s * 12, -54], [s * 5, -60]], 7.5, c.base);
        ell(ctx, s * 4, -61, 4.5, 3.8);
        fur(ctx, partColor(c, 'paws'), -65, -57);
      } else {
        limb(ctx, [[s * 6.5, -44], [s * 6.5, -4]], 7.5, c.base);
        if (has(c, 'paws')) limb(ctx, [[s * 6.5, -12], [s * 6.5, -4]], 7, c.light);
        ell(ctx, s * 6.5, -3, 5.2, 3.3);
        fur(ctx, partColor(c, 'paws'), -6, 0);
      }
    });
    ctx.save();
    ctx.translate(0, -74);
    ctx.rotate(o.tilt || 0);
    catHeadFront(ctx, c, o);
    ctx.restore();
  }

  function catLie(ctx, c, o) {
    const br = 1 + Math.sin(o.t * 1.6) * 0.03;
    ell(ctx, 0, -16, 34, 16 * br);
    fur(ctx, c.base, -32, 0);
    within(ctx, 0, -16, 34, 16 * br, 0, () => {
      stripes(ctx, c, -34, -33, 60, 18, 7, 3);
      patches(ctx, c, [[-12, -22, 13, 9, 0], [10, -26, 9, 7, 1]]);
    });
    // tail wraps round the front
    limb(ctx, [[-30, -6], [-10, 2], [16, 0], [30, -6]], 6.5, c.base);
    catHeadSide(ctx, c, 24, -20, Object.assign({}, o, { headRot: 0.35 }));
  }

  /* ======================= BUNNY ======================= */

  function bunnyEarsSide(ctx, c, x, y, o, back) {
    const f = o.earFlick || 0;
    const tilt = -0.55 - (back || 0) * 0.6;
    [[-3, shade(c.base, -0.2)], [0, c.base]].forEach(([dx, col], i) => {
      ctx.save();
      ctx.translate(x + dx, y);
      ctx.rotate(tilt + i * 0.12 + (i ? f * 0.2 : 0));
      ell(ctx, 0, -20, 5.8, 21);
      fur(ctx, col, -41, 1);
      if (i) { ell(ctx, 0.5, -19, 2.8, 15); solid(ctx, '#EDB4B4'); }
      ctx.restore();
    });
  }

  function bunnyHeadSide(ctx, c, hx, hy, o) {
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(o.headRot || 0);
    bunnyEarsSide(ctx, c, -4, -9, o, o.earsBack);
    ell(ctx, 0, 0, 14, 12.5);
    fur(ctx, c.base, -12.5, 12.5);
    if (has(c, 'blaze')) within(ctx, 0, 0, 14, 12.5, 0, () => { ell(ctx, 10, -2, 6, 12, -0.4); solid(ctx, c.light); });
    ell(ctx, 9, 3, 8, 7);
    fur(ctx, partColor(c, 'muzzle'), -4, 10);
    const tw = Math.sin(o.t * 18) * 0.6;
    ell(ctx, 16, 1 + tw * 0.3, 2.4, 2);
    solid(ctx, c.nose);
    if (o.mouth === 'chew') {
      const k = Math.abs(Math.sin(o.t * 16));
      ell(ctx, 12, 8, 2.4, 0.6 + k * 1.2);
      solid(ctx, '#5A2228');
    }
    eyeRound(ctx, 4, -3, 3.3, c.eye, o.eyes, 0.5);
    whiskers(ctx, 13, 3, 1, 12);
    if (o.carry) carryItem(ctx, 14, 9, o.carry, 0.7);
    ctx.restore();
  }

  function bunnySide(ctx, c, o) {
    const hop = o.hop || 0;           // 0 on the ground … 1 mid-hop
    const cr = (o.crouch || 0) * 8;
    ctx.save();
    // stretch out mid-hop
    ctx.translate(0, cr);
    // hind foot
    ctx.save();
    ctx.translate(-16, -4);
    ctx.rotate(hop * 0.7);
    ell(ctx, -4, 0, 17, 5);
    fur(ctx, partColor(c, 'paws'), -5, 5);
    ctx.restore();
    // tail puff
    ell(ctx, -36, -30, 7, 7);
    fur(ctx, partColor(c, 'tailtip'), -37, -23);
    // haunch and chest
    ell(ctx, -10, -26, 28 + hop * 4, 23 - hop * 3, -hop * 0.2);
    fur(ctx, c.base, -49, -3);
    within(ctx, -10, -26, 28 + hop * 4, 23 - hop * 3, -hop * 0.2, () => {
      if (has(c, 'belly')) { ell(ctx, -4, -6, 20, 8); solid(ctx, c.light); }
      if (has(c, 'blaze') && c.label === 'Dutch') { ctx.fillStyle = c.light; ctx.fillRect(4, -60, 40, 70); }
    });
    ell(ctx, 13, -26, 14, 17);
    fur(ctx, c.base, -43, -9);
    within(ctx, 13, -26, 14, 17, 0, () => {
      if (has(c, 'chest')) { ctx.fillStyle = c.light; ctx.fillRect(4, -50, 30, 60); }
    });
    // front paw
    ell(ctx, 20 + hop * 6, -4 - hop * 4, 6, 3.6, hop * 0.5);
    fur(ctx, partColor(c, 'paws'), -8, 0);
    const hd = o.headDown || 0;
    bunnyHeadSide(ctx, c, 25 + hd * 6, -46 + hd * 26, Object.assign({}, o, { headRot: hd * 0.4, earsBack: hop }));
    ctx.restore();
  }

  function bunnyFront(ctx, c, o) {
    const up = o.pawUp || 0;
    const rise = up === 2 ? 14 : 0;   // bunnies stand up on their hind legs
    [-1, 1].forEach((s) => {
      ell(ctx, s * 18, -4, 11, 5);
      fur(ctx, partColor(c, 'paws'), -9, 0);
    });
    ell(ctx, 0, -24 - rise * 0.6, 25 - rise * 0.2, 23 + rise * 0.3);
    fur(ctx, c.base, -47 - rise, -1);
    within(ctx, 0, -24 - rise * 0.6, 25, 23 + rise * 0.3, 0, () => {
      if (has(c, 'belly')) { ell(ctx, 0, -16 - rise * 0.5, 14, 15); solid(ctx, c.light); }
      if (has(c, 'chest')) { ell(ctx, 0, -40 - rise, 18, 12); solid(ctx, c.light); }
    });
    [-1, 1].forEach((s) => {
      if (up === 2) {
        ell(ctx, s * 6, -40 - rise, 4.5, 4);
        fur(ctx, partColor(c, 'paws'), -45 - rise, -36 - rise);
      } else {
        ell(ctx, s * 6.5, -3, 5, 3.4);
        fur(ctx, partColor(c, 'paws'), -6, 0);
      }
    });
    ctx.save();
    ctx.translate(0, -52 - rise);
    ctx.rotate(o.tilt || 0);
    const f = o.earFlick || 0;
    [-1, 1].forEach((s) => {
      ctx.save();
      ctx.translate(s * 6.5, -10);
      ctx.rotate(s * 0.14 + (s > 0 ? f * 0.3 : 0));
      ell(ctx, 0, -20, 6, 22);
      fur(ctx, c.base, -42, 2);
      ell(ctx, 0, -19, 3, 16);
      solid(ctx, '#EDB4B4');
      ctx.restore();
    });
    ell(ctx, 0, 0, 16, 14.5);
    fur(ctx, c.base, -14.5, 14.5);
    within(ctx, 0, 0, 16, 14.5, 0, () => {
      if (has(c, 'blaze')) { ell(ctx, 0, 0, 4.5, 16); solid(ctx, c.light); }
      if (has(c, 'muzzle')) { ell(ctx, 0, 8, 9, 6); solid(ctx, c.light); }
    });
    [-1, 1].forEach((s) => {
      ell(ctx, s * 6, 6, 7, 6);
      fur(ctx, partColor(c, 'muzzle'), 0, 12);
    });
    [-1, 1].forEach((s) => eyeRound(ctx, s * 10, -3, 3.7, c.eye, o.eyes, o.gaze));
    const tw = Math.sin(o.t * 18) * 0.5;
    ctx.beginPath();
    ctx.moveTo(-2.4, 3 + tw);
    ctx.lineTo(2.4, 3 + tw);
    ctx.lineTo(0, 5.5 + tw);
    ctx.closePath();
    solid(ctx, c.nose);
    if (o.mouth === 'chew') {
      const k = Math.abs(Math.sin(o.t * 16));
      ell(ctx, 0, 10, 2.4, 0.6 + k * 1.3);
      solid(ctx, '#5A2228');
    } else {
      ctx.strokeStyle = 'rgba(30,15,10,0.5)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(0, 5.5);
      ctx.lineTo(0, 7.5);
      ctx.moveTo(-2.5, 9);
      ctx.quadraticCurveTo(0, 7, 2.5, 9);
      ctx.stroke();
    }
    whiskers(ctx, 5, 6, 1, 14);
    whiskers(ctx, -5, 6, -1, 14);
    if (o.carry) carryItem(ctx, 0, 11, o.carry, 0.7);
    ctx.restore();
  }

  function bunnyLie(ctx, c, o) {
    const br = 1 + Math.sin(o.t * 1.6) * 0.03;
    ell(ctx, -4, -14, 33, 14 * br);
    fur(ctx, c.base, -28, 0);
    ell(ctx, -36, -12, 6, 6);
    fur(ctx, partColor(c, 'tailtip'), -18, -6);
    ell(ctx, 18, -3, 14, 4);
    fur(ctx, partColor(c, 'paws'), -7, 1);
    ctx.save();
    ctx.translate(28, -14);
    // ears lie flat along the back
    [0, 1].forEach((i) => {
      ell(ctx, -20, -8 - i * 3, 20, 5, -0.1);
      fur(ctx, i ? c.base : shade(c.base, -0.2), -14, -2);
    });
    ctx.restore();
    bunnyHeadSide(ctx, c, 28, -14, Object.assign({}, o, { headRot: 0.1, earsBack: 3 }));
  }

  /* ======================= Things ======================= */

  function ball(ctx, x, y, r) {
    ell(ctx, x, y, r, r);
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    g.addColorStop(0, '#F4FF8A');
    g.addColorStop(1, '#A9C21F');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = r * 0.14;
    ctx.beginPath();
    ctx.arc(x - r * 1.25, y, r * 0.95, -0.9, 0.9);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + r * 1.25, y, r * 0.95, Math.PI - 0.9, Math.PI + 0.9);
    ctx.stroke();
  }

  // Treats: a bone biscuit, a fish treat, a carrot.
  function treat(ctx, species, x, y, r) {
    ctx.save();
    ctx.translate(x, y);
    if (species === 'cat') {
      ell(ctx, -r * 0.1, 0, r * 0.8, r * 0.42);
      fur(ctx, '#B8C4CC', -r * 0.4, r * 0.4);
      ctx.beginPath();
      ctx.moveTo(r * 0.6, 0);
      ctx.lineTo(r * 1.05, -r * 0.4);
      ctx.lineTo(r * 1.05, r * 0.4);
      ctx.closePath();
      fur(ctx, '#9FAEB8', -r * 0.4, r * 0.4);
      ell(ctx, -r * 0.5, -r * 0.08, r * 0.09, r * 0.09);
      solid(ctx, '#222');
    } else if (species === 'bunny') {
      ctx.rotate(-0.5);
      ctx.beginPath();
      ctx.moveTo(-r * 0.35, -r * 0.8);
      ctx.lineTo(r * 0.35, -r * 0.8);
      ctx.lineTo(0, r * 1.0);
      ctx.closePath();
      fur(ctx, '#F08A2E', -r, r);
      [-1, 0, 1].forEach((i) => {
        ctx.save();
        ctx.translate(i * r * 0.12, -r * 0.85);
        ctx.rotate(i * 0.4);
        ell(ctx, 0, -r * 0.3, r * 0.1, r * 0.32);
        solid(ctx, '#4CA64A');
        ctx.restore();
      });
    } else {
      ctx.rotate(-0.3);
      [-1, 1].forEach((s) => {
        ell(ctx, s * r * 0.75, -r * 0.2, r * 0.26, r * 0.26);
        ell(ctx, s * r * 0.75, r * 0.2, r * 0.26, r * 0.26);
      });
      ctx.beginPath();
      [-1, 1].forEach((s) => {
        ctx.moveTo(s * r * 0.75 + r * 0.26, -r * 0.2);
        ctx.ellipse(s * r * 0.75, -r * 0.2, r * 0.26, r * 0.26, 0, 0, TAU);
        ctx.moveTo(s * r * 0.75 + r * 0.26, r * 0.2);
        ctx.ellipse(s * r * 0.75, r * 0.2, r * 0.26, r * 0.26, 0, 0, TAU);
      });
      ctx.rect(-r * 0.75, -r * 0.2, r * 1.5, r * 0.4);
      fur(ctx, '#D9A566', -r * 0.5, r * 0.5, false);
    }
    ctx.restore();
  }

  // Finger toys: a squeaky bone for dogs, a leafy sprig for bunnies.
  // (A cat's toy is a laser dot, drawn on the floor by the AR view.)
  function toy(ctx, species, x, y, r) {
    ctx.save();
    ctx.translate(x, y);
    if (species === 'bunny') {
      ctx.strokeStyle = '#3F8A3A';
      ctx.lineWidth = r * 0.12;
      ctx.beginPath();
      ctx.moveTo(-r * 0.9, r * 0.5);
      ctx.quadraticCurveTo(0, 0, r * 0.9, -r * 0.4);
      ctx.stroke();
      [-0.6, -0.1, 0.4].forEach((k, i) => {
        ell(ctx, k * r, (i % 2 ? -1 : 1) * r * 0.3, r * 0.34, r * 0.18, i % 2 ? -0.6 : 0.6);
        solid(ctx, i % 2 ? '#6CC24A' : '#58AE3C');
      });
    } else {
      ctx.rotate(0.2);
      const col = '#E2483F';
      ctx.beginPath();
      [-1, 1].forEach((s) => {
        ctx.moveTo(s * r * 0.8 + r * 0.3, -r * 0.24);
        ctx.ellipse(s * r * 0.8, -r * 0.24, r * 0.3, r * 0.3, 0, 0, TAU);
        ctx.moveTo(s * r * 0.8 + r * 0.3, r * 0.24);
        ctx.ellipse(s * r * 0.8, r * 0.24, r * 0.3, r * 0.3, 0, 0, TAU);
      });
      ctx.rect(-r * 0.8, -r * 0.22, r * 1.6, r * 0.44);
      fur(ctx, col, -r * 0.55, r * 0.55, false);
    }
    ctx.restore();
  }

  function carryItem(ctx, x, y, what, s) {
    if (what === 'ball') ball(ctx, x, y, 9 * s);
    else if (what === 'toy') toy(ctx, 'dog', x, y, 14 * s);
  }

  /* ======================= Entry points ======================= */

  // o: { species, coat, pose: 'side'|'front'|'lie'|'belly', t, phase, moving,
  //      headDown, crouch, hop, eyes, mouth, wag, tilt, pawUp, gaze, earFlick,
  //      dilate, kick, carry }
  function drawPet(ctx, o) {
    const c = coatOf(o.species, o.coat);
    const q = Object.assign({ t: 0, wag: 0, moving: 0, eyes: 'open', mouth: 'closed' }, o);
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const sp = o.species;
    if (q.pose === 'front') (sp === 'cat' ? catFront : sp === 'bunny' ? bunnyFront : dogFront)(ctx, c, q);
    else if (q.pose === 'lie') (sp === 'cat' ? catLie : sp === 'bunny' ? bunnyLie : dogLie)(ctx, c, q);
    else if (q.pose === 'belly') (sp === 'dog' ? dogBelly : sp === 'cat' ? catLie : bunnyLie)(ctx, c, q);
    else (sp === 'cat' ? catSide : sp === 'bunny' ? bunnySide : dogSide)(ctx, c, q);
    ctx.restore();
  }

  // Just the face, for small badges.
  function drawFace(ctx, species, coat, o) {
    const c = coatOf(species, coat);
    const q = Object.assign({ t: 0, eyes: 'open', mouth: 'closed' }, o || {});
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (species === 'cat') catHeadFront(ctx, c, q);
    else if (species === 'bunny') {
      // The bunny's head, cut out of its sitting pose.
      ctx.translate(0, 58);
      ctx.beginPath();
      ctx.rect(-60, -150, 120, 114);
      ctx.clip();
      bunnyFront(ctx, c, q);
    } else dogHeadFront(ctx, c, q);
    ctx.restore();
  }

  // Bounding box of a pose in local units (for tapping the pet).
  function bounds(species, pose) {
    if (pose === 'front') return species === 'dog' ? [-36, -112, 36, 0] : species === 'cat' ? [-26, -104, 26, 0] : [-26, -116, 26, 0];
    if (pose === 'lie' || pose === 'belly') return species === 'dog' ? [-60, -50, 70, 0] : [-40, -44, 46, 0];
    return species === 'dog' ? [-58, -110, 82, 0] : species === 'cat' ? [-46, -94, 62, 0] : [-44, -100, 44, 0];
  }

  // A portrait of the pet sitting, for the adopt and welcome screens.
  function portrait(canvas, species, coat, opts) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const k = Math.min(w / 130, h / 135);
    ctx.save();
    ctx.translate(w / 2, h * 0.9);
    ctx.scale(k, k);
    ell(ctx, 0, -1, 40, 6);
    solid(ctx, 'rgba(0,0,0,0.25)');
    drawPet(ctx, Object.assign({ species, coat, pose: 'front', t: 0, eyes: 'open', mouth: 'closed' }, opts || {}));
    ctx.restore();
  }

  PC.art = {
    SPECIES,
    COATS,
    coatOf,
    shade,
    drawPet,
    drawFace,
    bounds,
    portrait,
    ball,
    treat,
    toy,
    ell,
  };
})(window.PC);
