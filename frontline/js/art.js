/* Frontline — drawing: soldiers, tanks, MG nests, cover, pickups and grenades,
   all seen from straight above and drawn in code. */
(function (FL) {
  'use strict';

  const TAU = Math.PI * 2;

  const SIDES = {
    us: { body: '#5E6B3A', dark: '#454F2A', helmet: '#56633A', rim: '#3F4A28', skin: '#D9A77E', pack: '#7A6A45' },
    axis: { body: '#6B6F68', dark: '#4E524C', helmet: '#555A54', rim: '#3D413C', skin: '#D6A47C', pack: '#5C4E3A' },
    snow: { body: '#D9DEE2', dark: '#A9B0B6', helmet: '#E8ECEF', rim: '#B9C0C6', skin: '#D6A47C', pack: '#8A8F93' },
  };

  function ellipse(g, x, y, rx, ry, rot) {
    g.beginPath();
    g.ellipse(x, y, rx, ry, rot || 0, 0, TAU);
  }

  /* A soldier facing `a`. pose: { walk (phase), gun ('rifle'|'smg'|'pistol'|'shotgun'|'bar'|'bazooka'|'none'), flash, side, scale, dead, hurt } */
  function soldier(g, x, y, a, p) {
    const c = SIDES[p.side] || SIDES.us;
    const s = p.scale || 1;
    g.save();
    g.translate(x, y);
    // Shadow.
    g.fillStyle = 'rgba(0,0,0,0.25)';
    ellipse(g, 3 * s, 4 * s, 13 * s, 11 * s);
    g.fill();
    g.rotate(a);
    g.scale(s, s);

    if (p.dead) {
      // Lying flat, arms out.
      g.fillStyle = c.dark;
      g.fillRect(-22, -5, 14, 4);
      g.fillRect(-22, 1, 14, 4);
      g.fillStyle = c.body;
      ellipse(g, -2, 0, 11, 9);
      g.fill();
      g.fillStyle = c.skin;
      g.beginPath(); g.arc(4, -12, 3, 0, TAU); g.arc(5, 12, 3, 0, TAU); g.fill();
      g.fillStyle = c.helmet;
      g.beginPath(); g.arc(13, 2, 6.5, 0, TAU); g.fill();
      g.restore();
      return;
    }

    const step = Math.sin(p.walk || 0) * 5;
    // Legs/boots poking out as he walks.
    g.fillStyle = '#2E2A22';
    ellipse(g, step, -5, 5, 3.2); g.fill();
    ellipse(g, -step, 5, 5, 3.2); g.fill();
    // Pack.
    g.fillStyle = c.pack;
    g.fillRect(-12, -7, 7, 14);
    // Body / shoulders.
    g.fillStyle = p.hurt > 0 ? '#C9A08A' : c.body;
    ellipse(g, 0, 0, 8, 12);
    g.fill();
    g.strokeStyle = c.dark;
    g.lineWidth = 1.2;
    g.stroke();

    // Gun and arms.
    const gun = p.gun || 'rifle';
    const L = { rifle: 26, smg: 19, pistol: 14, shotgun: 23, bar: 28, bazooka: 30, mg: 24, none: 0 }[gun];
    if (gun === 'bazooka') {
      g.fillStyle = '#4C5530';
      g.fillRect(-12, 4, L + 6, 6);
      g.fillStyle = '#2C2F1E';
      g.fillRect(L - 8, 3, 4, 8);
    } else if (gun === 'pistol') {
      g.fillStyle = '#26241F';
      g.fillRect(10, -1.5, L - 6, 3.5);
    } else if (gun !== 'none') {
      // Stock and barrel.
      g.fillStyle = gun === 'smg' ? '#3A3226' : '#6B4A2B';
      g.fillRect(-2, -1, 14, 4.5);
      g.fillStyle = '#23211D';
      g.fillRect(8, -0.5, L - 6, gun === 'bar' ? 4.5 : 3.2);
      if (gun === 'smg') { g.fillRect(10, 2, 3, 6); }
      if (gun === 'bar') { g.fillRect(12, 3, 3, 6); }
    }
    // Arms reaching to the gun.
    g.strokeStyle = c.body;
    g.lineWidth = 4.5;
    g.lineCap = 'round';
    g.beginPath();
    if (gun === 'pistol') {
      g.moveTo(0, -7); g.lineTo(10, -1);
      g.moveTo(0, 7); g.lineTo(10, 1);
    } else if (gun === 'bazooka') {
      g.moveTo(-1, -8); g.lineTo(4, 3);
      g.moveTo(-1, 8); g.lineTo(12, 7);
    } else if (gun !== 'none') {
      g.moveTo(-1, -8); g.lineTo(6, 0);
      g.moveTo(0, 8); g.lineTo(14, 1);
    }
    g.stroke();
    g.fillStyle = c.skin;
    if (gun !== 'none') {
      g.beginPath();
      if (gun === 'pistol') g.arc(10, 0, 2.6, 0, TAU);
      else if (gun === 'bazooka') { g.arc(4, 4, 2.4, 0, TAU); g.arc(12, 8, 2.4, 0, TAU); }
      else { g.arc(6, 0.5, 2.4, 0, TAU); g.arc(14, 1.5, 2.4, 0, TAU); }
      g.fill();
    }

    // Muzzle flash.
    if (p.flash > 0) {
      const fx = L + (gun === 'bazooka' ? -2 : 2);
      g.fillStyle = 'rgba(255,220,120,0.95)';
      g.beginPath();
      g.moveTo(fx, -4); g.lineTo(fx + 14, 0); g.lineTo(fx, 4); g.lineTo(fx + 4, 0);
      g.fill();
      g.fillStyle = 'rgba(255,255,230,0.9)';
      g.beginPath(); g.arc(fx + 2, 0.5, 3.5, 0, TAU); g.fill();
      if (gun === 'bazooka') {
        g.fillStyle = 'rgba(255,200,120,0.8)';
        g.beginPath(); g.arc(-16, 7, 7, 0, TAU); g.fill();
      }
    }

    // Helmet.
    g.fillStyle = c.rim;
    g.beginPath(); g.arc(1, 0, p.side === 'axis' ? 8.6 : 8, 0, TAU); g.fill();
    g.fillStyle = c.helmet;
    g.beginPath(); g.arc(1.5, 0, 6.4, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.beginPath(); g.arc(3, -2, 2.5, 0, TAU); g.fill();
    if (p.officer) {
      g.fillStyle = '#B8A15A';
      g.fillRect(-3, -1, 5, 2);
    }
    if (p.medic) {
      g.fillStyle = '#FFFFFF'; g.beginPath(); g.arc(1.5, 0, 3, 0, TAU); g.fill();
      g.fillStyle = '#C0392B'; g.fillRect(0.5, -2, 2, 4); g.fillRect(-0.5, -1, 4, 2);
    }
    g.restore();
  }

  /* Tank: hull angle `a`, turret angle `ta`. */
  function tank(g, x, y, a, ta, p) {
    const big = p.big;
    const L = big ? 44 : 38;
    const W = big ? 28 : 24;
    const body = p.snow ? '#C9CEC9' : big ? '#7A7356' : '#686D63';
    const dark = p.snow ? '#9EA39E' : big ? '#57513B' : '#4A4E46';
    g.save();
    g.translate(x, y);
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.save(); g.rotate(a); g.fillRect(-L + 6, -W - 2 + 6, L * 2, W * 2 + 4); g.restore();
    g.rotate(a);
    // Tracks.
    g.fillStyle = '#2B2A26';
    g.fillRect(-L, -W - 2, L * 2, 11);
    g.fillRect(-L, W - 9, L * 2, 11);
    g.fillStyle = '#45433C';
    const ph = (p.tread || 0) % 8;
    for (let i = -L + ph; i < L; i += 8) {
      g.fillRect(i, -W - 2, 3, 11);
      g.fillRect(i, W - 9, 3, 11);
    }
    // Hull.
    g.fillStyle = body;
    g.fillRect(-L + 4, -W + 6, L * 2 - 6, W * 2 - 12);
    g.strokeStyle = dark;
    g.lineWidth = 2;
    g.strokeRect(-L + 4, -W + 6, L * 2 - 6, W * 2 - 12);
    g.fillStyle = dark;
    g.fillRect(-L + 6, -8, 8, 16); // engine deck
    g.fillRect(-L + 18, -8, 3, 16);
    // Cross insignia replaced with a plain stencilled number.
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.font = 'bold 9px sans-serif';
    g.textAlign = 'center';
    g.fillText(p.num || '7', -L + 30, W - 10);
    if (p.hurt > 0) {
      g.fillStyle = 'rgba(255,255,255,' + Math.min(0.5, p.hurt * 3) + ')';
      g.fillRect(-L, -W - 2, L * 2, W * 2 + 4);
    }
    g.restore();

    // Turret.
    g.save();
    g.translate(x, y);
    g.rotate(ta);
    const R = big ? 17 : 14;
    const barrel = big ? 48 : 40;
    const recoil = p.recoil > 0 ? p.recoil * 10 : 0;
    g.fillStyle = '#2F302B';
    g.fillRect(R - 4 - recoil, -3.5, barrel, 7);
    g.fillStyle = dark;
    g.fillRect(R - 4 + barrel - 8 - recoil, -5, 9, 10);
    g.fillStyle = body;
    g.beginPath();
    g.moveTo(-R - 4, -R + 3);
    g.lineTo(R - 2, -R + 1);
    g.lineTo(R + 3, -R + 6);
    g.lineTo(R + 3, R - 6);
    g.lineTo(R - 2, R - 1);
    g.lineTo(-R - 4, R - 3);
    g.closePath();
    g.fill();
    g.strokeStyle = dark;
    g.lineWidth = 2;
    g.stroke();
    g.fillStyle = dark;
    g.beginPath(); g.arc(-4, -5, 4.5, 0, TAU); g.fill();
    g.fillStyle = body;
    g.beginPath(); g.arc(-4, -5, 2.8, 0, TAU); g.fill();
    if (p.flash > 0) {
      g.fillStyle = 'rgba(255,220,130,0.95)';
      g.beginPath(); g.arc(R + barrel - recoil, 0, 12, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,230,1)';
      g.beginPath(); g.arc(R + barrel - recoil, 0, 6, 0, TAU); g.fill();
    }
    g.restore();
  }

  function wreck(g, x, y, a, big) {
    g.save();
    g.translate(x, y);
    g.rotate(a);
    const L = big ? 44 : 38;
    const W = big ? 28 : 24;
    g.fillStyle = '#1F1D1A';
    g.fillRect(-L, -W - 2, L * 2, W * 2 + 4);
    g.fillStyle = '#34312B';
    g.fillRect(-L + 6, -W + 6, L * 2 - 12, W * 2 - 12);
    g.fillStyle = '#26231F';
    g.beginPath(); g.arc(4, 0, big ? 16 : 13, 0, TAU); g.fill();
    g.fillRect(10, -3, big ? 40 : 34, 6);
    g.restore();
  }

  /* ---------- Cover ---------- */

  function bags(g, o) {
    const horiz = o.w >= o.h;
    const len = horiz ? o.w : o.h;
    const thick = horiz ? o.h : o.w;
    g.fillStyle = '#5E5238';
    g.fillRect(o.x + 2, o.y + 3, o.w, o.h);
    const n = Math.max(1, Math.round(len / 18));
    const bl = len / n;
    const rows = thick > 22 ? 2 : 1;
    for (let r = 0; r < rows; r++) {
      for (let i = 0; i < n; i++) {
        const off = r % 2 ? bl / 2 : 0;
        let bx = horiz ? o.x + i * bl + off : o.x + (r * thick) / rows;
        let by = horiz ? o.y + (r * thick) / rows : o.y + i * bl + off;
        let bw = horiz ? Math.min(bl, o.x + o.w - bx) : thick / rows;
        let bh = horiz ? thick / rows : Math.min(bl, o.y + o.h - by);
        if (bw <= 2 || bh <= 2) continue;
        g.fillStyle = (i + r) % 3 === 0 ? '#B39D6E' : (i + r) % 3 === 1 ? '#A8925F' : '#BCA676';
        roundRect(g, bx + 0.5, by + 0.5, bw - 1, bh - 1, 5);
        g.fill();
        g.strokeStyle = 'rgba(70,58,35,0.6)';
        g.lineWidth = 1;
        g.stroke();
      }
    }
  }

  function roundRect(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function cover(g, o, theme) {
    switch (o.kind) {
      case 'sandbag': bags(g, o); break;
      case 'crate': {
        g.fillStyle = 'rgba(0,0,0,0.25)';
        g.fillRect(o.x + 4, o.y + 5, o.w, o.h);
        g.fillStyle = o.ammo ? '#5A6236' : '#8C6A3E';
        g.fillRect(o.x, o.y, o.w, o.h);
        g.strokeStyle = o.ammo ? '#3C4224' : '#5E4526';
        g.lineWidth = 2;
        g.strokeRect(o.x + 1, o.y + 1, o.w - 2, o.h - 2);
        g.beginPath();
        g.moveTo(o.x + 2, o.y + 2); g.lineTo(o.x + o.w - 2, o.y + o.h - 2);
        g.moveTo(o.x + o.w - 2, o.y + 2); g.lineTo(o.x + 2, o.y + o.h - 2);
        g.stroke();
        if (o.hp < o.maxHp) {
          g.fillStyle = 'rgba(0,0,0,' + (0.4 * (1 - o.hp / o.maxHp)) + ')';
          g.fillRect(o.x, o.y, o.w, o.h);
        }
        break;
      }
      case 'barrel': {
        const cx = o.x + o.w / 2;
        const cy = o.y + o.h / 2;
        g.fillStyle = 'rgba(0,0,0,0.25)';
        g.beginPath(); g.arc(cx + 3, cy + 4, o.w / 2, 0, TAU); g.fill();
        g.fillStyle = '#8E2E22';
        g.beginPath(); g.arc(cx, cy, o.w / 2, 0, TAU); g.fill();
        g.strokeStyle = '#5C1D15';
        g.lineWidth = 2;
        g.beginPath(); g.arc(cx, cy, o.w / 2 - 3, 0, TAU); g.stroke();
        g.fillStyle = '#C9C2B0';
        g.beginPath(); g.arc(cx + 3, cy - 3, 2.5, 0, TAU); g.fill();
        break;
      }
      case 'emplacement': {
        // A ring of sandbags around a gun.
        const cx = o.x + o.w / 2;
        const cy = o.y + o.h / 2;
        const R = o.w / 2;
        g.fillStyle = 'rgba(0,0,0,0.25)';
        g.beginPath(); g.arc(cx + 3, cy + 4, R, 0, TAU); g.fill();
        g.fillStyle = '#6E6248';
        g.beginPath(); g.arc(cx, cy, R - 6, 0, TAU); g.fill();
        const n = 10;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU;
          g.save();
          g.translate(cx + Math.cos(a) * (R - 5), cy + Math.sin(a) * (R - 5));
          g.rotate(a + Math.PI / 2);
          g.fillStyle = i % 2 ? '#B39D6E' : '#A8925F';
          roundRect(g, -7, -5, 14, 10, 4);
          g.fill();
          g.strokeStyle = 'rgba(70,58,35,0.6)';
          g.lineWidth = 1;
          g.stroke();
          g.restore();
        }
        break;
      }
      case 'tent': {
        g.fillStyle = 'rgba(0,0,0,0.3)';
        g.fillRect(o.x + 5, o.y + 6, o.w, o.h);
        g.fillStyle = '#7D8452';
        g.fillRect(o.x, o.y, o.w, o.h);
        g.fillStyle = '#687044';
        if (o.w >= o.h) g.fillRect(o.x, o.y + o.h / 2, o.w, o.h / 2);
        else g.fillRect(o.x + o.w / 2, o.y, o.w / 2, o.h);
        g.strokeStyle = '#4E5432';
        g.lineWidth = 2;
        g.strokeRect(o.x + 1, o.y + 1, o.w - 2, o.h - 2);
        const cx = o.x + o.w / 2;
        const cy = o.y + o.h / 2;
        g.fillStyle = '#F2EEE2';
        g.beginPath(); g.arc(cx, cy, 10, 0, TAU); g.fill();
        g.fillStyle = '#C0392B';
        g.fillRect(cx - 2.5, cy - 7, 5, 14);
        g.fillRect(cx - 7, cy - 2.5, 14, 5);
        break;
      }
      case 'depot': {
        g.fillStyle = 'rgba(0,0,0,0.3)';
        g.fillRect(o.x + 4, o.y + 5, o.w, o.h);
        const s = o.w / 2;
        for (let i = 0; i < 4; i++) {
          const bx = o.x + (i % 2) * s;
          const by = o.y + Math.floor(i / 2) * (o.h / 2);
          g.fillStyle = i % 3 ? '#5A6236' : '#4E5530';
          g.fillRect(bx + 1, by + 1, s - 2, o.h / 2 - 2);
          g.fillStyle = '#C9A44A';
          g.fillRect(bx + 5, by + o.h / 4 - 2, s - 10, 4);
        }
        g.strokeStyle = '#2E3420';
        g.lineWidth = 2;
        g.strokeRect(o.x + 1, o.y + 1, o.w - 2, o.h - 2);
        break;
      }
      case 'wall': {
        g.fillStyle = 'rgba(0,0,0,0.3)';
        g.fillRect(o.x + 4, o.y + 5, o.w, o.h);
        g.fillStyle = o.color || '#9C8E7A';
        g.fillRect(o.x, o.y, o.w, o.h);
        g.strokeStyle = 'rgba(60,50,40,0.45)';
        g.lineWidth = 1;
        g.beginPath();
        const horiz = o.w >= o.h;
        if (horiz) for (let x = o.x + 10; x < o.x + o.w; x += 12) { g.moveTo(x, o.y); g.lineTo(x, o.y + o.h); }
        else for (let y = o.y + 10; y < o.y + o.h; y += 12) { g.moveTo(o.x, y); g.lineTo(o.x + o.w, y); }
        g.stroke();
        g.strokeStyle = 'rgba(255,255,255,0.15)';
        g.strokeRect(o.x + 0.5, o.y + 0.5, o.w - 1, o.h - 1);
        break;
      }
      case 'concrete': {
        g.fillStyle = 'rgba(0,0,0,0.3)';
        g.fillRect(o.x + 5, o.y + 6, o.w, o.h);
        g.fillStyle = '#A7A49B';
        g.fillRect(o.x, o.y, o.w, o.h);
        g.fillStyle = '#8F8C83';
        g.fillRect(o.x, o.y + o.h - 4, o.w, 4);
        g.strokeStyle = 'rgba(60,60,55,0.4)';
        g.beginPath();
        for (let x = o.x + 40; x < o.x + o.w; x += 40) { g.moveTo(x, o.y); g.lineTo(x, o.y + o.h); }
        for (let y = o.y + 40; y < o.y + o.h; y += 40) { g.moveTo(o.x, y); g.lineTo(o.x + o.w, y); }
        g.stroke();
        if (o.slit) {
          g.fillStyle = '#1B1A18';
          g.fillRect(o.x + o.w * 0.25, o.y + o.h - 8, o.w * 0.5, 6);
        }
        break;
      }
      case 'building': {
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.fillRect(o.x + 8, o.y + 10, o.w, o.h);
        const roof = o.roof || '#8A4B38';
        g.fillStyle = roof;
        g.fillRect(o.x, o.y, o.w, o.h);
        // Tiles and a ridge down the long side.
        g.strokeStyle = 'rgba(0,0,0,0.18)';
        g.lineWidth = 1;
        g.beginPath();
        const horiz = o.w >= o.h;
        if (horiz) {
          for (let y = o.y + 8; y < o.y + o.h; y += 8) { g.moveTo(o.x, y); g.lineTo(o.x + o.w, y); }
        } else {
          for (let x = o.x + 8; x < o.x + o.w; x += 8) { g.moveTo(x, o.y); g.lineTo(x, o.y + o.h); }
        }
        g.stroke();
        g.fillStyle = 'rgba(0,0,0,0.2)';
        if (horiz) g.fillRect(o.x, o.y + o.h / 2, o.w, o.h / 2);
        else g.fillRect(o.x + o.w / 2, o.y, o.w / 2, o.h);
        g.fillStyle = 'rgba(255,255,255,0.15)';
        if (horiz) g.fillRect(o.x, o.y + o.h / 2 - 2, o.w, 3);
        else g.fillRect(o.x + o.w / 2 - 2, o.y, 3, o.h);
        if (theme === 'snow') {
          g.fillStyle = 'rgba(245,248,252,0.75)';
          if (horiz) g.fillRect(o.x, o.y, o.w, o.h / 2 - 2);
          else g.fillRect(o.x, o.y, o.w / 2 - 2, o.h);
        }
        if (o.steeple) {
          const cx = o.x + o.w / 2;
          const cy = o.y + o.h * 0.2;
          g.fillStyle = '#6E6A63';
          g.fillRect(cx - 22, cy - 22, 44, 44);
          g.fillStyle = '#4D4A45';
          g.beginPath(); g.moveTo(cx - 22, cy - 22); g.lineTo(cx, cy); g.lineTo(cx + 22, cy - 22); g.fill();
          g.fillStyle = '#5A5751';
          g.beginPath(); g.moveTo(cx - 22, cy + 22); g.lineTo(cx, cy); g.lineTo(cx + 22, cy + 22); g.fill();
        }
        g.strokeStyle = 'rgba(0,0,0,0.35)';
        g.lineWidth = 2;
        g.strokeRect(o.x + 1, o.y + 1, o.w - 2, o.h - 2);
        break;
      }
      case 'hedge': {
        g.fillStyle = 'rgba(0,0,0,0.28)';
        g.fillRect(o.x + 5, o.y + 7, o.w, o.h);
        g.fillStyle = '#34461F';
        roundRect(g, o.x, o.y, o.w, o.h, 10);
        g.fill();
        const horiz = o.w >= o.h;
        const len = horiz ? o.w : o.h;
        g.fillStyle = '#44592A';
        for (let i = 8; i < len; i += 14) {
          const px = horiz ? o.x + i : o.x + o.w / 2 + Math.sin(i + o.seed) * 4;
          const py = horiz ? o.y + o.h / 2 + Math.sin(i + o.seed) * 4 : o.y + i;
          g.beginPath(); g.arc(px, py, (horiz ? o.h : o.w) * 0.42, 0, TAU); g.fill();
        }
        g.fillStyle = '#56703A';
        for (let i = 12; i < len; i += 22) {
          const px = horiz ? o.x + i : o.x + o.w / 2 - 3;
          const py = horiz ? o.y + o.h / 2 - 3 : o.y + i;
          g.beginPath(); g.arc(px, py, (horiz ? o.h : o.w) * 0.22, 0, TAU); g.fill();
        }
        break;
      }
      case 'hedgehog': {
        const cx = o.x + o.w / 2;
        const cy = o.y + o.h / 2;
        g.save();
        g.translate(cx, cy);
        g.rotate((o.seed % 100) / 30);
        g.strokeStyle = 'rgba(0,0,0,0.3)';
        g.lineWidth = 6;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(-12 + 3, -12 + 4); g.lineTo(12 + 3, 12 + 4);
        g.moveTo(12 + 3, -12 + 4); g.lineTo(-12 + 3, 12 + 4);
        g.stroke();
        g.strokeStyle = '#3B3935';
        g.lineWidth = 5;
        g.beginPath();
        g.moveTo(-13, -13); g.lineTo(13, 13);
        g.moveTo(13, -13); g.lineTo(-13, 13);
        g.moveTo(0, -16); g.lineTo(0, 16);
        g.stroke();
        g.strokeStyle = '#5A5650';
        g.lineWidth = 2;
        g.stroke();
        g.restore();
        break;
      }
      case 'tree': {
        // The trunk; the canopy is drawn above everyone.
        g.fillStyle = '#4A3826';
        g.beginPath(); g.arc(o.x + o.w / 2, o.y + o.h / 2, o.w / 2, 0, TAU); g.fill();
        break;
      }
      case 'rock': {
        g.fillStyle = 'rgba(0,0,0,0.25)';
        roundRect(g, o.x + 4, o.y + 5, o.w, o.h, 10); g.fill();
        g.fillStyle = theme === 'snow' ? '#9AA2AA' : '#8A867C';
        roundRect(g, o.x, o.y, o.w, o.h, 10); g.fill();
        g.fillStyle = theme === 'snow' ? '#EEF2F5' : '#A39E93';
        roundRect(g, o.x + 4, o.y + 3, o.w * 0.6, o.h * 0.5, 8); g.fill();
        break;
      }
      case 'wreck': {
        if (o.boat) {
          g.fillStyle = 'rgba(0,0,0,0.3)';
          g.fillRect(o.x + 5, o.y + 6, o.w, o.h);
          g.fillStyle = '#5C6A5E';
          g.fillRect(o.x, o.y, o.w, o.h);
          g.fillStyle = '#46524A';
          g.fillRect(o.x + 6, o.y + 6, o.w - 12, o.h - 12);
          g.fillStyle = '#3A4A3E';
          g.fillRect(o.x, o.y, o.w, 10);
        } else {
          wreck(g, o.x + o.w / 2, o.y + o.h / 2, (o.w >= o.h ? 0 : Math.PI / 2) + (o.angle || 0), false);
        }
        break;
      }
      default: break;
    }
  }

  function canopy(g, o, theme, alpha) {
    const cx = o.x + o.w / 2;
    const cy = o.y + o.h / 2;
    const r = o.canopy || 40;
    g.save();
    g.globalAlpha = alpha;
    if (theme === 'snow' || o.pine) {
      // Pine: layered stars, dusted with snow.
      g.fillStyle = 'rgba(0,0,0,0.22)';
      g.beginPath(); g.arc(cx + 8, cy + 10, r, 0, TAU); g.fill();
      const layers = [[1, '#1F3A2A'], [0.72, '#2A4B36'], [0.42, '#355C42']];
      for (const [k, col] of layers) {
        g.fillStyle = col;
        star(g, cx, cy, r * k, r * k * 0.62, 9, o.seed);
        g.fill();
      }
      if (theme === 'snow') {
        g.fillStyle = 'rgba(240,245,250,0.85)';
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * TAU + o.seed;
          g.beginPath(); g.arc(cx + Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.55, r * 0.14, 0, TAU); g.fill();
        }
        g.beginPath(); g.arc(cx, cy, r * 0.18, 0, TAU); g.fill();
      }
    } else {
      g.fillStyle = 'rgba(0,0,0,0.22)';
      g.beginPath(); g.arc(cx + 8, cy + 10, r, 0, TAU); g.fill();
      const blobs = 7;
      g.fillStyle = o.leaf || '#3E5A2A';
      g.beginPath();
      for (let i = 0; i < blobs; i++) {
        const a = (i / blobs) * TAU + o.seed;
        g.moveTo(cx + Math.cos(a) * r * 0.5 + r * 0.5, cy + Math.sin(a) * r * 0.5);
        g.arc(cx + Math.cos(a) * r * 0.5, cy + Math.sin(a) * r * 0.5, r * 0.5, 0, TAU);
      }
      g.arc(cx, cy, r * 0.6, 0, TAU);
      g.fill();
      g.fillStyle = 'rgba(255,255,200,0.1)';
      g.beginPath(); g.arc(cx - r * 0.25, cy - r * 0.25, r * 0.45, 0, TAU); g.fill();
    }
    g.restore();
  }

  function star(g, cx, cy, r1, r2, n, rot) {
    g.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const r = i % 2 ? r2 : r1;
      const a = (i / (n * 2)) * TAU + rot;
      if (i) g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      else g.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    g.closePath();
  }

  function wire(g, w) {
    g.strokeStyle = 'rgba(60,58,52,0.85)';
    g.lineWidth = 1.2;
    g.beginPath();
    for (let row = 0; row < 3; row++) {
      const y = w.y + 6 + (row * (w.h - 12)) / 2;
      g.moveTo(w.x, y);
      for (let x = w.x; x < w.x + w.w; x += 8) g.lineTo(x + 4, y + (((x / 8) | 0) % 2 ? 4 : -4));
    }
    g.stroke();
    g.fillStyle = '#4A3826';
    for (let x = w.x + 4; x < w.x + w.w; x += 40) { g.fillRect(x, w.y + 2, 4, w.h - 4); }
  }

  /* ---------- Pickups ---------- */

  function pickup(g, p, t) {
    const bob = Math.sin(t * 4 + p.x) * 1.5;
    g.save();
    g.translate(p.x, p.y + bob);
    // Soft halo so pickups are easy to spot on a busy map.
    g.fillStyle = p.kind === 'medkit' ? 'rgba(255,90,90,0.18)' : 'rgba(255,230,140,0.18)';
    g.beginPath(); g.arc(0, 0, 20 + Math.sin(t * 5) * 2, 0, TAU); g.fill();
    if (p.kind === 'ammo') {
      g.fillStyle = '#4B5530';
      g.fillRect(-11, -8, 22, 16);
      g.fillStyle = '#C9A44A';
      for (let i = 0; i < 4; i++) g.fillRect(-8 + i * 5, -5, 3, 10);
      g.strokeStyle = '#2E3420';
      g.lineWidth = 1.5;
      g.strokeRect(-11, -8, 22, 16);
    } else if (p.kind === 'medkit') {
      g.fillStyle = '#EDE6D6';
      g.fillRect(-10, -8, 20, 16);
      g.fillStyle = '#C0392B';
      g.fillRect(-2.5, -6, 5, 12);
      g.fillRect(-6, -2.5, 12, 5);
    } else if (p.kind === 'supply') {
      g.fillStyle = '#8C6A3E';
      g.fillRect(-12, -10, 24, 20);
      g.strokeStyle = '#5E4526';
      g.lineWidth = 2;
      g.strokeRect(-12, -10, 24, 20);
      g.beginPath(); g.moveTo(-12, -3); g.lineTo(12, -3); g.moveTo(-12, 4); g.lineTo(12, 4); g.stroke();
      g.fillStyle = '#F2E9C9';
      g.font = 'bold 10px sans-serif';
      g.textAlign = 'center';
      g.fillText('★', 0, 4);
    } else if (p.kind === 'grenade') {
      grenadeIcon(g, 0, 0, 1.2);
      grenadeIcon(g, 8, 4, 1.0);
    } else if (p.kind === 'weapon') {
      g.rotate(0.5);
      g.fillStyle = '#6B4A2B';
      g.fillRect(-14, -2, 14, 4.5);
      g.fillStyle = '#23211D';
      g.fillRect(-2, -1.5, 18, 3.4);
      g.fillStyle = '#FFE08A';
      g.font = 'bold 9px sans-serif';
      g.rotate(-0.5);
      g.textAlign = 'center';
      g.fillText(FL.data.WEAPONS[p.weapon].name, 0, -14);
    }
    g.restore();
  }

  function grenadeIcon(g, x, y, s) {
    g.save();
    g.translate(x, y);
    g.scale(s, s);
    g.fillStyle = '#4C5530';
    g.beginPath(); g.ellipse(0, 0, 5, 6, 0, 0, TAU); g.fill();
    g.strokeStyle = '#2E3420';
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(-5, 0); g.lineTo(5, 0); g.moveTo(0, -6); g.lineTo(0, 6); g.stroke();
    g.fillStyle = '#8A8A80';
    g.fillRect(-2, -9, 4, 3);
    g.restore();
  }

  function stickGrenade(g, x, y, a) {
    g.save();
    g.translate(x, y);
    g.rotate(a);
    g.fillStyle = '#7A5A36';
    g.fillRect(-9, -1.5, 12, 3);
    g.fillStyle = '#4E524C';
    g.fillRect(3, -4, 7, 8);
    g.restore();
  }

  FL.art = { soldier, tank, wreck, cover, canopy, wire, pickup, grenadeIcon, stickGrenade, roundRect, SIDES };
})(window.FL);
