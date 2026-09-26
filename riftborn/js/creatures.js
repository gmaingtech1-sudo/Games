/* Riftborn — the creatures: species data, elements, stats, fusion recipes,
   and a vector renderer that draws every species from a handful of body
   plans (raptor, rex, horned, plated, longneck, flyer), animated.

   Drawing space: one unit is the creature's height, the ground is y = 0,
   up is -y, and the creature faces +x. The caller picks the pixel scale. */
window.RB = window.RB || {};
(function (RB) {
  'use strict';

  const { clamp, TAU } = RB.util;

  const ELEMENTS = {
    ember: { name: 'Ember', color: '#FF6A3D', icon: '🔥', move: 'Magma Burst' },
    tide: { name: 'Tide', color: '#3DB8FF', icon: '💧', move: 'Riptide' },
    gale: { name: 'Gale', color: '#7CF0C8', icon: '🌪️', move: 'Cyclone Rend' },
    stone: { name: 'Stone', color: '#E0AE68', icon: '🪨', move: 'Quake Slam' },
    volt: { name: 'Volt', color: '#FFE14D', icon: '⚡', move: 'Arc Lightning' },
    void: { name: 'Void', color: '#B45CFF', icon: '🌀', move: 'Rift Collapse' },
  };
  // Each element beats the next one around the circle. Void is wild: it hits
  // everything a bit harder and takes a bit more from everything.
  const BEATS = { ember: 'gale', gale: 'stone', stone: 'volt', volt: 'tide', tide: 'ember' };

  function advantage(atk, def) {
    if (atk === 'void' && def === 'void') return 1;
    if (atk === 'void' || def === 'void') return 1.25;
    if (BEATS[atk] === def) return 1.5;
    if (BEATS[def] === atk) return 0.67;
    return 1;
  }

  const RARITY = [
    { name: 'Common', color: '#B8C4D6', weight: 62, catch: 0.5, flee: 0.08, dna: 12, xp: 100 },
    { name: 'Rare', color: '#4DA3FF', weight: 27, catch: 0.32, flee: 0.15, dna: 10, xp: 250 },
    { name: 'Epic', color: '#C86BFF', weight: 9, catch: 0.18, flee: 0.22, dna: 8, xp: 600 },
    { name: 'Legendary', color: '#FFB020', weight: 2, catch: 0.08, flee: 0.3, dna: 6, xp: 1500 },
  ];

  // [id, name, element, rarity, plan, height m, [body, belly, accent], eye,
  //  features, [hp, atk, spd], blurb]
  const RAW = [
    ['cindertail', 'Cindertail', 'ember', 0, 'raptor', 1.4, ['#D9482B', '#FFC79A', '#5A1A12'], '#FFD23F', 'stripes feathers', [100, 24, 16], 'A quick little raptor. Its tail smoulders when it gets excited.'],
    ['mossback', 'Mossback', 'stone', 0, 'plated', 2.2, ['#6E8B3D', '#D7C98E', '#A8C45A'], '#FFF3A0', 'plates spots', [140, 18, 8], 'Moss grows on its plates. It naps in parks and nobody notices.'],
    ['zephyrix', 'Zephyrix', 'gale', 0, 'flyer', 1.6, ['#4FC7A6', '#E6FFF4', '#1F6B5A'], '#FFFFFF', 'crest', [90, 22, 20], 'Rides the wind over rooftops, squawking at pigeons.'],
    ['sparkjaw', 'Sparkjaw', 'volt', 0, 'raptor', 1.4, ['#3A3F8F', '#FFE98A', '#FFD23F'], '#FFE14D', 'stripes feathers', [95, 25, 17], 'Hangs around streetlights. Its bite tingles.'],
    ['ripplehorn', 'Ripplehorn', 'tide', 0, 'horned', 2.0, ['#2E7FB8', '#BFE6FF', '#E8F4FF'], '#FFFFFF', 'horns3 frill', [135, 20, 10], 'Its frill ripples like water when it is curious.'],
    ['pebblestomp', 'Pebblestomp', 'stone', 0, 'horned', 1.7, ['#8A7A6A', '#D8CBB8', '#F2E6D2'], '#FFD23F', 'horns1 frill spots', [130, 21, 11], 'Stubborn and sturdy. Headbutts lampposts to say hello.'],
    ['emberjaw', 'Emberjaw', 'ember', 1, 'rex', 4.0, ['#8E2A1E', '#F2B27A', '#FF7A2F'], '#FFD23F', 'stripes spikes', [170, 34, 12], 'Its roar leaves the air shimmering with heat.'],
    ['tidecrest', 'Tidecrest', 'tide', 1, 'longneck', 5.5, ['#2C6E9E', '#CFEFFF', '#7FD6FF'], '#FFFFFF', 'crest spots', [190, 26, 9], 'Gentle giant. Sings low songs that sound like waves.'],
    ['galeclaw', 'Galeclaw', 'gale', 1, 'raptor', 1.7, ['#2F8F7A', '#E9FFF6', '#B8FFE9'], '#FFFFFF', 'feathers crest stripes', [120, 30, 22], 'Hunts in gusts. You hear the wind before you see it.'],
    ['stonehorn', 'Stonehorn', 'stone', 1, 'horned', 2.5, ['#7A5C3E', '#E0C69C', '#F4E7CF'], '#FFB020', 'horns3 frill spikes', [180, 28, 9], 'Its horns are harder than granite. Very proud of them.'],
    ['voltwing', 'Voltwing', 'volt', 1, 'flyer', 2.0, ['#2B2F6B', '#FFF3B0', '#FFE14D'], '#FFE14D', 'crest stripes', [115, 32, 21], 'Leaves little lightning trails across storm clouds.'],
    ['duskmaw', 'Duskmaw', 'void', 2, 'rex', 4.4, ['#2A1840', '#9C7BC4', '#B45CFF'], '#E05CFF', 'spikes glow', [210, 40, 13], 'Only hunts at dusk. Its shadow moves before it does.'],
    ['frostspire', 'Frostspire', 'tide', 2, 'plated', 3.0, ['#BFE0F2', '#FFFFFF', '#6FC3F0'], '#3DB8FF', 'plates glow spikes', [230, 32, 10], 'Its plates are made of ice that never melts.'],
    ['thunderneck', 'Thunderneck', 'volt', 2, 'longneck', 6.5, ['#3C3A70', '#FFF1A8', '#FFE14D'], '#FFE14D', 'stripes glow', [250, 34, 8], 'When it stomps, phones nearby lose a bar of signal.'],
    ['pyrewing', 'Pyrewing', 'ember', 2, 'flyer', 2.4, ['#B2261B', '#FFD08A', '#FFB020'], '#FFE14D', 'crest glow', [150, 42, 24], 'Dives out of sunsets trailing sparks.'],
    ['riftking', 'Riftking', 'void', 3, 'rex', 5.8, ['#140C24', '#5E3F8F', '#E05CFF'], '#FF5CF0', 'spikes glow crown', [300, 52, 16], 'The first thing to come through the Rifts. It rules the other side.'],
    ['aetherwyrm', 'Aetherwyrm', 'gale', 3, 'longneck', 7.5, ['#DDF7F0', '#FFFFFF', '#7CF0C8'], '#2EE6C5', 'crest glow spots', [320, 46, 14], 'Said to hold the sky together. Seen only where many Rifts meet.'],
    ['magmaron', 'Magmaron', 'ember', 3, 'horned', 3.4, ['#3A0E0A', '#FF8A3D', '#FFD23F'], '#FFD23F', 'horns3 frill glow spikes', [290, 50, 12], 'Walks on lava like it is a warm carpet.'],
    // Hybrids: never found in the wild, made in the Lab by fusing DNA.
    ['scorchglider', 'Scorchglider', 'ember', 1, 'flyer', 2.0, ['#E05A2B', '#FFE0B8', '#3FC7A0'], '#FFD23F', 'crest stripes', [140, 34, 23], 'Cindertail × Zephyrix. Glides on its own heat.', ['cindertail', 'zephyrix']],
    ['reefwarden', 'Reefwarden', 'tide', 1, 'plated', 2.6, ['#2E8F8A', '#E0F2D0', '#9FE8FF'], '#FFFFFF', 'plates spots spikes', [200, 26, 10], 'Mossback × Ripplehorn. A walking coral reef.', ['mossback', 'ripplehorn']],
    ['stormfang', 'Stormfang', 'volt', 2, 'rex', 4.4, ['#2E2A6E', '#FFD08A', '#FFE14D'], '#FFE14D', 'stripes spikes glow', [230, 44, 15], 'Emberjaw × Sparkjaw. Thunder follows it around.', ['emberjaw', 'sparkjaw']],
    ['skyrender', 'Skyrender', 'gale', 2, 'raptor', 2.0, ['#1F5E6E', '#F0FFF8', '#FFE14D'], '#FFE14D', 'feathers crest stripes glow', [160, 42, 26], 'Galeclaw × Sparkjaw. Faster than you can blink.', ['galeclaw', 'sparkjaw']],
    ['tempestral', 'Tempestral', 'volt', 2, 'longneck', 6.5, ['#2A4F8F', '#E6F4FF', '#FFE14D'], '#FFE14D', 'crest glow stripes', [270, 38, 11], 'Tidecrest × Voltwing. Carries a storm on its back.', ['tidecrest', 'voltwing']],
    ['gravemaw', 'Gravemaw', 'void', 3, 'horned', 3.2, ['#3A2A4A', '#C9B8E0', '#B45CFF'], '#E05CFF', 'horns3 frill glow spikes', [310, 50, 12], 'Stonehorn × Duskmaw. Its frill opens onto another world.', ['stonehorn', 'duskmaw']],
  ];

  const SPECIES = RAW.map((r) => ({
    id: r[0], name: r[1], el: r[2], rar: r[3], plan: r[4], size: r[5],
    col: r[6], eye: r[7],
    feat: new Set(r[8].split(' ')),
    hp: r[9][0], atk: r[9][1], spd: r[9][2],
    blurb: r[10],
    parents: r[11] || null,
    hybrid: !!r[11],
    dark: r[6].map((c) => shade(c, -0.32)),
  }));
  const BY_ID = {};
  SPECIES.forEach((s) => { BY_ID[s.id] = s; });
  const WILD = SPECIES.filter((s) => !s.hybrid);
  const HYBRIDS = SPECIES.filter((s) => s.hybrid);

  /* ------------------ Stats ------------------ */

  const MAX_LEVEL = 30;

  function stats(c) {
    const sp = BY_ID[c.sp];
    const L = c.lvl;
    const iv = c.iv || [5, 5, 5];
    return {
      hp: Math.round((sp.hp + iv[0] * 2) * (1 + (L - 1) * 0.08)),
      atk: Math.round((sp.atk + iv[1] * 0.6) * (1 + (L - 1) * 0.07)),
      spd: Math.round(sp.spd + iv[2] * 0.3 + L / 4),
    };
  }

  function power(c) {
    const s = stats(c);
    return Math.round(s.hp * 0.8 + s.atk * 10 + s.spd * 5);
  }

  // DNA needed to go from level L to L + 1.
  function levelCost(c) {
    const sp = BY_ID[c.sp];
    return Math.round((20 + c.lvl * 12) * [1, 1.4, 1.9, 2.6][sp.rar]);
  }

  // DNA of each parent used per fusion.
  function fuseCost(parentId) {
    return [60, 100, 160, 240][BY_ID[parentId].rar];
  }

  /* ------------------ Colours ------------------ */

  const OUT = '#120A1C';

  function parse(c) {
    const n = parseInt(c.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function toHex(rgb) {
    return '#' + rgb.map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
  }
  function shade(c, k) {
    const rgb = parse(c);
    return toHex(rgb.map((v) => (k < 0 ? v * (1 + k) : v + (255 - v) * k)));
  }
  function mix(a, b, k) {
    const A = parse(a), B = parse(b);
    return toHex(A.map((v, i) => v + (B[i] - v) * k));
  }

  /* ------------------ Drawing kit ------------------ */

  // Parts are drawn in two passes: a dark silhouette slightly bigger than
  // the shape, then the colours. Parts drawn together share one outline,
  // which gives the chunky "sticker" look.
  function makeKit(ctx, ol) {
    const k = {
      ctx,
      pass: 1,
      dim: false,
      tint: 0,
      tintCol: '#FFFFFF',
      col(c) {
        if (k.dim) c = shade(c, -0.3);
        if (k.tint > 0) c = mix(c, k.tintCol, k.tint);
        return c;
      },
      finish(c) {
        if (k.pass === 0) {
          ctx.fillStyle = OUT;
          ctx.strokeStyle = OUT;
          ctx.lineWidth = ol * 2;
          ctx.fill();
          ctx.stroke();
        } else {
          ctx.fillStyle = k.col(c);
          ctx.fill();
        }
      },
      ell(cx, cy, rx, ry, rot, c) {
        ctx.beginPath();
        ctx.ellipse(cx, cy, Math.max(rx, 1e-3), Math.max(ry, 1e-3), rot || 0, 0, TAU);
        k.finish(c);
      },
      poly(pts, c, smooth) {
        ctx.beginPath();
        if (smooth && pts.length > 2) {
          // Rounded polygon through midpoints.
          const n = pts.length;
          const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
          let m = mid(pts[n - 1], pts[0]);
          ctx.moveTo(m[0], m[1]);
          for (let i = 0; i < n; i++) {
            m = mid(pts[i], pts[(i + 1) % n]);
            ctx.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]);
          }
        } else {
          ctx.moveTo(pts[0][0], pts[0][1]);
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        }
        ctx.closePath();
        k.finish(c);
      },
      // A thick jointed line, tapering from w0 to w1.
      limb(pts, w0, w1, c) {
        const n = pts.length - 1;
        for (let i = 0; i < n; i++) {
          const w = w0 + (w1 - w0) * (i / Math.max(1, n - 1));
          ctx.beginPath();
          ctx.moveTo(pts[i][0], pts[i][1]);
          ctx.lineTo(pts[i + 1][0], pts[i + 1][1]);
          ctx.lineWidth = w + (k.pass === 0 ? ol * 2 : 0);
          ctx.strokeStyle = k.pass === 0 ? OUT : k.col(c);
          ctx.stroke();
        }
      },
      // A tapered tube along a polyline (tails and necks).
      tube(pts, widths, c) {
        const L = [], R = [];
        for (let i = 0; i < pts.length; i++) {
          const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
          let nx = -(b[1] - a[1]), ny = b[0] - a[0];
          const l = Math.hypot(nx, ny) || 1;
          nx /= l; ny /= l;
          const w = widths[i] / 2;
          L.push([pts[i][0] + nx * w, pts[i][1] + ny * w]);
          R.push([pts[i][0] - nx * w, pts[i][1] - ny * w]);
        }
        k.poly(L.concat(R.reverse()), c, true);
      },
    };
    return k;
  }

  // Two-bone IK: the knee position for a leg from hip h to foot f.
  function ik(h, f, l1, l2, kneeFwd) {
    let dx = f[0] - h[0], dy = f[1] - h[1];
    let d = Math.hypot(dx, dy);
    const max = (l1 + l2) * 0.995;
    if (d > max) { f = [h[0] + dx / d * max, h[1] + dy / d * max]; dx = f[0] - h[0]; dy = f[1] - h[1]; d = max; }
    d = Math.max(d, Math.abs(l1 - l2) + 1e-3);
    const a = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
    const th = Math.atan2(dy, dx);
    const k1 = [h[0] + l1 * Math.cos(th - a), h[1] + l1 * Math.sin(th - a)];
    const k2 = [h[0] + l1 * Math.cos(th + a), h[1] + l1 * Math.sin(th + a)];
    return { knee: (k1[0] > k2[0]) === kneeFwd ? k1 : k2, foot: f };
  }

  const rot = (p, a) => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a)];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1]];

  // Points along a tail from base, `len` long, drooping and swaying.
  function tailPts(base, len, lift, sway, n) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      pts.push([base[0] - u * len, base[1] - lift * u * u + Math.sin(sway - u * 2.2) * 0.07 * u]);
    }
    return pts;
  }

  /* ------------------ Heads ------------------ */

  // Head with its jaw hinge at (x, y), pointing along `ang`.
  function head(k, x, y, ang, len, hgt, o) {
    const { ctx } = k;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    const P = (pts) => pts.map((p) => [p[0] * len, p[1] * hgt]);
    const jawA = (o.mouth || 0) * 0.55;
    const skull = o.beak
      ? P([[-0.15, -0.55], [0.3, -0.6], [0.7, -0.25], [1.25, 0.02], [0.3, 0.12], [-0.15, 0.2]])
      : P([[-0.12, -0.55], [0.35, -0.65], [0.8, -0.45], [1.0, -0.18], [1.0, 0.06], [0.2, 0.1], [-0.12, 0.16]]);
    const jaw = (o.beak
      ? P([[-0.05, 0], [1.15, 0.04], [0.3, 0.3], [-0.1, 0.22]])
      : P([[-0.05, 0], [0.95, 0.04], [0.9, 0.24], [0.1, 0.36], [-0.1, 0.24]])).map((p) => rot(p, jawA));
    if (k.pass === 1 && jawA > 0.05) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(skull[4][0], skull[4][1]);
      ctx.lineTo(jaw[1][0], jaw[1][1]);
      ctx.closePath();
      ctx.fillStyle = k.col('#5A1020');
      ctx.fill();
    }
    k.poly(jaw, o.belly, !o.beak);
    if (o.frill) {
      // Behind the skull, fanning up and back.
      k.poly(P([[0.05, -0.2], [-0.25, -1.25], [-0.75, -1.1], [-0.85, -0.35], [-0.3, 0.2]]), o.frillCol, true);
    }
    if (o.crest) {
      k.poly(P(o.beak ? [[0.1, -0.4], [-0.9, -1.2], [-0.4, -0.35]] : [[0.4, -0.55], [-0.2, -1.05], [-0.25, -0.4]]), o.crestCol, false);
    }
    k.poly(skull, o.body, !o.beak);
    if (o.horns) {
      const hc = o.hornCol;
      if (o.horns >= 3) {
        k.limb(P([[0.35, -0.55], [0.75, -1.35]]), hgt * 0.22, hgt * 0.04, hc);
      }
      k.limb(P([[0.85, -0.35], [1.1, -0.95]]), hgt * 0.2, hgt * 0.04, hc);
    }
    if (o.crown) {
      for (let i = 0; i < 4; i++) {
        const bx = -0.05 + i * 0.22;
        k.poly(P([[bx, -0.55 + i * 0.03], [bx + 0.08, -1.0 + i * 0.08], [bx + 0.16, -0.58 + i * 0.03]]), o.crownCol);
      }
    }
    if (k.pass === 1) {
      // Teeth
      if (o.teeth && !o.beak) {
        ctx.fillStyle = k.col('#FFF8E8');
        for (let i = 0; i < 5; i++) {
          const tx = (0.3 + i * 0.15) * len, ty = 0.08 * hgt;
          ctx.beginPath();
          ctx.moveTo(tx - 0.03 * len, ty);
          ctx.lineTo(tx, ty + 0.16 * hgt);
          ctx.lineTo(tx + 0.03 * len, ty);
          ctx.fill();
        }
      }
      // Eye
      const ex = (o.beak ? 0.18 : 0.32) * len, ey = -0.3 * hgt;
      const er = Math.max(hgt * 0.16, 0.012);
      const blink = o.blink ? 0.15 : 1;
      ctx.fillStyle = OUT;
      ctx.beginPath(); ctx.ellipse(ex, ey, er * 1.25, er * 1.25 * blink, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = k.col(o.eye);
      ctx.beginPath(); ctx.ellipse(ex, ey, er, er * blink, 0, 0, TAU); ctx.fill();
      if (!o.blink) {
        ctx.fillStyle = OUT;
        ctx.beginPath(); ctx.ellipse(ex + er * 0.2, ey, er * 0.3, er * 0.75, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath(); ctx.arc(ex - er * 0.3, ey - er * 0.35, er * 0.28, 0, TAU); ctx.fill();
      }
      // Nostril
      if (!o.beak) {
        ctx.fillStyle = OUT;
        ctx.beginPath(); ctx.arc(0.9 * len, -0.18 * hgt, hgt * 0.05, 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
  }

  /* ------------------ Body plans ------------------ */

  // Each plan returns { far: [fn], main: [fn], top: [fn] }. `far` parts are
  // on the other side of the body (drawn darker, first), `main` parts share
  // one outline, and `top` parts are painted over everything.
  function headOpts(sp, a, extra) {
    return Object.assign({
      body: sp.col[0], belly: sp.col[1], eye: sp.eye, mouth: a.mouth, blink: a.blink,
      crestCol: sp.col[2], frillCol: sp.col[2], hornCol: '#F4E7CF', crownCol: sp.col[2],
      crest: sp.feat.has('crest'), crown: sp.feat.has('crown'),
    }, extra || {});
  }

  function bipedLeg(k, hip, ph, walk, l1, l2, w, col, stride) {
    const fx = hip[0] + 0.03 + Math.sin(ph) * stride * walk;
    const fy = -Math.max(0, Math.cos(ph)) * 0.09 * walk;
    const toe = [fx + 0.06, fy];
    const ankle = [fx - 0.03, fy - 0.1];
    const r = ik(hip, ankle, l1, l2, true);
    k.limb([hip, r.knee, r.foot, toe], w, w * 0.45, col);
    k.limb([toe, [toe[0] + 0.07, toe[1]]], w * 0.35, w * 0.25, col);
  }

  function quadLeg(k, hip, ph, walk, l1, l2, w, col, stride, kneeFwd) {
    const fx = hip[0] + Math.sin(ph) * stride * walk;
    const fy = -Math.max(0, Math.cos(ph)) * 0.06 * walk;
    const r = ik(hip, [fx, fy], l1, l2, kneeFwd);
    k.limb([hip, r.knee, r.foot], w, w * 0.85, col);
    // Foot pad
    k.ell(r.foot[0] + 0.02, r.foot[1] - w * 0.2, w * 0.62, w * 0.32, 0, col);
  }

  function spikesAlong(k, pts, size, col, every) {
    for (let i = 1; i < pts.length - 1; i += every || 1) {
      const a = pts[i - 1], b = pts[i + 1];
      let nx = b[1] - a[1], ny = -(b[0] - a[0]);
      const l = Math.hypot(nx, ny) || 1;
      nx /= l; ny /= l;
      if (ny > 0) { nx = -nx; ny = -ny; }
      const s = size * (1 - Math.abs(i / pts.length - 0.4));
      const p = pts[i];
      k.poly([[p[0] - (b[0] - a[0]) * 0.35, p[1] - (b[1] - a[1]) * 0.35], [p[0] + nx * s, p[1] + ny * s], [p[0] + (b[0] - a[0]) * 0.35, p[1] + (b[1] - a[1]) * 0.35]], col);
    }
  }

  // Theropods: raptors and rexes.
  function planBiped(sp, a, big) {
    const walk = a.walk, ph = a.ph;
    const bob = -Math.abs(Math.cos(ph)) * 0.025 * walk + Math.sin(a.t * 2.2) * 0.008;
    const P = big
      ? { hip: [-0.1, -0.55], body: [0.02, -0.6, 0.36, 0.25, -0.25], chest: [0.26, -0.7], hinge: [0.4, -0.86], hl: 0.46, hh: 0.26, l1: 0.3, l2: 0.3, lw: 0.17, tail: [-0.28, -0.6], tl: 0.82, tw: 0.3, arm: 0.09 }
      : { hip: [-0.08, -0.58], body: [0.03, -0.63, 0.3, 0.17, -0.2], chest: [0.24, -0.68], hinge: [0.44, -0.94], hl: 0.32, hh: 0.16, l1: 0.3, l2: 0.3, lw: 0.1, tail: [-0.22, -0.62], tl: 0.82, tw: 0.17, arm: 0.15 };
    const hip = [P.hip[0], P.hip[1] + bob];
    const col = sp.col;
    const hp = [P.hinge[0] + Math.sin(a.t * 1.6) * 0.012, P.hinge[1] + bob + Math.sin(a.t * 1.3) * 0.015 - a.mouth * 0.03];
    const tp = tailPts([P.tail[0], P.tail[1] + bob], P.tl, big ? -0.06 : 0.1, a.t * 2 + ph * 0.5, 10);
    const tw = tp.map((_, i) => P.tw * (1 - i / tp.length * 0.92));
    const stride = big ? 0.2 : 0.2;
    const arm = (k, side) => {
      const sh = [P.chest[0] + 0.02, P.chest[1] + 0.08 + bob];
      const sw = Math.sin(a.t * 2 + side) * 0.2;
      const el = add(sh, rot([P.arm * 0.5, P.arm * 0.55], sw));
      const hd = add(el, rot([P.arm * 0.55, -P.arm * 0.15], sw));
      k.limb([sh, el, hd], P.lw * 0.45, P.lw * 0.25, col[0]);
      if (sp.feat.has('feathers') && !big && k.pass === 1) {
        k.ctx.fillStyle = k.col(col[2]);
        k.ctx.beginPath();
        k.ctx.moveTo(sh[0], sh[1]);
        k.ctx.lineTo(el[0] - 0.08, el[1] + 0.06);
        k.ctx.lineTo(hd[0] - 0.02, hd[1] + 0.03);
        k.ctx.closePath();
        k.ctx.fill();
      }
    };
    const neckPts = [[P.chest[0] - 0.05, P.chest[1] + bob + 0.04], [(P.chest[0] + hp[0]) / 2 + 0.02, (P.chest[1] + hp[1]) / 2 + bob * 0.5], [hp[0] + 0.03, hp[1] - 0.02]];
    return {
      far: [
        (k) => bipedLeg(k, hip, ph + Math.PI, walk, P.l1, P.l2, P.lw, col[0], stride),
        (k) => arm(k, 1.5),
      ],
      main: [
        (k) => { if (sp.feat.has('spikes')) spikesAlong(k, tp.slice(0, 8), P.tw * 0.5, col[2], 2); },
        (k) => k.tube(tp, tw, col[0]),
        (k) => {
          if (!sp.feat.has('spikes')) return;
          const [cx, cy, rx, ry] = P.body;
          const back = [];
          for (let i = 0; i <= 6; i++) { const t = Math.PI * (0.55 + i * 0.07); back.push([cx + Math.cos(t) * rx * -1, cy + bob - Math.sin(t) * ry]); }
          spikesAlong(k, back.reverse(), P.body[3] * 0.55, col[2]);
        },
        (k) => k.ell(P.body[0], P.body[1] + bob, P.body[2], P.body[3], P.body[4], col[0]),
        (k) => k.tube(neckPts, [P.hh * 1.4, P.hh * 1.05, P.hh * 0.8], col[0]),
        (k) => head(k, hp[0], hp[1], -0.05 + a.mouth * -0.25, P.hl, P.hh, headOpts(sp, a, { teeth: true })),
        (k) => bipedLeg(k, hip, ph, walk, P.l1, P.l2, P.lw * 1.08, col[0], stride),
        (k) => arm(k, 0),
      ],
      top: [
        (k) => {
          // Belly
          const [cx, cy, rx, ry, r] = P.body;
          const c = k.ctx;
          c.save();
          c.beginPath(); c.ellipse(cx, cy + bob, rx, ry, r, 0, TAU); c.clip();
          c.fillStyle = k.col(col[1]);
          c.beginPath(); c.ellipse(cx + rx * 0.25, cy + bob + ry * 0.75, rx * 0.8, ry * 0.6, r, 0, TAU); c.fill();
          c.restore();
          if (sp.feat.has('stripes')) stripes(k, cx, cy + bob, rx, ry, r, col[2], 4);
        },
      ],
      glow: [[P.body[0], P.body[1] + bob], tp[4], tp[7]],
    };
  }

  function stripes(k, cx, cy, rx, ry, r, color, n) {
    const c = k.ctx;
    c.save();
    c.beginPath(); c.ellipse(cx, cy, rx, ry, r, 0, TAU); c.clip();
    c.strokeStyle = k.col(color);
    c.lineWidth = ry * 0.22;
    for (let i = 0; i < n; i++) {
      const x = cx - rx * 0.6 + i * rx * 1.1 / n;
      c.beginPath();
      c.moveTo(x, cy - ry * 1.1);
      c.quadraticCurveTo(x + rx * 0.15, cy - ry * 0.3, x - rx * 0.02, cy + ry * 0.2);
      c.stroke();
    }
    c.restore();
  }

  function spots(k, cx, cy, rx, ry, r, color) {
    const c = k.ctx;
    c.save();
    c.beginPath(); c.ellipse(cx, cy, rx, ry, r, 0, TAU); c.clip();
    c.fillStyle = k.col(color);
    const S = [[-0.5, -0.5, 0.16], [-0.1, -0.7, 0.12], [0.3, -0.45, 0.14], [-0.3, -0.1, 0.1], [0.55, -0.75, 0.09], [0.1, -0.2, 0.08]];
    for (const s of S) { c.beginPath(); c.ellipse(cx + s[0] * rx, cy + s[1] * ry, s[2] * rx, s[2] * rx * 0.8, 0, 0, TAU); c.fill(); }
    c.restore();
  }

  function belly(k, cx, cy, rx, ry, r, color) {
    const c = k.ctx;
    c.save();
    c.beginPath(); c.ellipse(cx, cy, rx, ry, r, 0, TAU); c.clip();
    c.fillStyle = k.col(color);
    c.beginPath(); c.ellipse(cx + rx * 0.1, cy + ry * 0.8, rx * 0.85, ry * 0.55, r, 0, TAU); c.fill();
    c.restore();
  }

  // Four-legged: horned (frill and horns) and plated (plates and tail spikes).
  function planQuad(sp, a, kind) {
    const walk = a.walk, ph = a.ph;
    const bob = -Math.abs(Math.cos(ph)) * 0.015 * walk + Math.sin(a.t * 2) * 0.006;
    const col = sp.col;
    const plated = kind === 'plated';
    const B = plated ? [0, -0.5, 0.44, 0.24, 0.06] : [-0.02, -0.5, 0.46, 0.25, -0.03];
    const body = [B[0], B[1] + bob, B[2], B[3], B[4]];
    const hipB = plated ? [-0.24, -0.5 + bob] : [-0.26, -0.48 + bob];
    const hipF = plated ? [0.28, -0.4 + bob] : [0.26, -0.44 + bob];
    const lb = plated ? [0.26, 0.26] : [0.24, 0.24];
    const lf = plated ? [0.2, 0.2] : [0.22, 0.22];
    const lw = plated ? 0.15 : 0.15;
    const tail = plated
      ? tailPts([-0.38, -0.52 + bob], 0.66, 0.16, a.t * 1.6, 9)
      : tailPts([-0.42, -0.5 + bob], 0.42, -0.12, a.t * 1.6, 7);
    const tw = tail.map((_, i) => (plated ? 0.2 : 0.2) * (1 - i / tail.length * 0.9));
    const hinge = plated
      ? [0.62, -0.32 + bob + Math.sin(a.t * 1.2) * 0.01]
      : [0.52, -0.44 + bob + Math.sin(a.t * 1.2) * 0.01];
    const hOpts = plated
      ? headOpts(sp, a, { crest: false })
      : headOpts(sp, a, { beak: true, frill: sp.feat.has('frill'), frillCol: col[2] === '#F4E7CF' || col[2] === '#F2E6D2' || col[2] === '#E8F4FF' ? col[1] : col[2], horns: sp.feat.has('horns3') ? 3 : sp.feat.has('horns1') ? 1 : 0, crest: false });
    const neck = plated
      ? [[0.3, -0.48 + bob], [0.5, -0.4 + bob], [hinge[0] + 0.02, hinge[1] - 0.02]]
      : [[0.3, -0.52 + bob], [hinge[0] + 0.02, hinge[1] - 0.04]];
    const plates = (k) => {
      if (!plated) return;
      for (let i = 0; i < 7; i++) {
        const t = Math.PI * (0.15 + i * 0.115);
        const px = body[0] - Math.cos(t) * body[2] * 0.95;
        const py = body[1] - Math.sin(t) * body[3] * 0.9;
        const s = 0.1 + Math.sin(t) * 0.1;
        const nx = -Math.cos(t) * 0.5, ny = -Math.sin(t);
        k.poly([[px - 0.06, py + 0.03], [px + nx * s - 0.04, py + ny * s], [px + nx * s * 1.1 + 0.03, py + ny * s * 1.15], [px + 0.07, py + 0.03]], col[2], true);
      }
      const tip = tail[tail.length - 1], pre = tail[tail.length - 3];
      for (let i = 0; i < 2; i++) {
        const b = i === 0 ? tip : pre;
        k.limb([b, [b[0] - 0.08 - i * 0.02, b[1] - 0.16]], 0.05, 0.01, col[2]);
      }
    };
    return {
      far: [
        (k) => quadLeg(k, [hipB[0] + 0.04, hipB[1]], ph, walk, lb[0], lb[1], lw, col[0], 0.13, false),
        (k) => quadLeg(k, [hipF[0] + 0.04, hipF[1]], ph + Math.PI, walk, lf[0], lf[1], lw, col[0], 0.13, !plated),
      ],
      main: [
        (k) => { if (sp.feat.has('spikes') && !plated) spikesAlong(k, tail, 0.08, col[2], 2); },
        (k) => k.tube(tail, tw, col[0]),
        plates,
        (k) => k.ell(body[0], body[1], body[2], body[3], body[4], col[0]),
        (k) => k.tube(neck, neck.map((_, i) => 0.24 - i * 0.03), col[0]),
        (k) => head(k, hinge[0], hinge[1], plated ? 0.35 : 0.2, plated ? 0.22 : 0.36, plated ? 0.15 : 0.24, hOpts),
        (k) => quadLeg(k, hipB, ph + Math.PI, walk, lb[0], lb[1], lw * 1.1, col[0], 0.13, false),
        (k) => quadLeg(k, hipF, ph, walk, lf[0], lf[1], lw * 1.05, col[0], 0.13, !plated),
      ],
      top: [
        (k) => {
          belly(k, body[0], body[1], body[2], body[3], body[4], col[1]);
          if (sp.feat.has('spots')) spots(k, body[0], body[1], body[2], body[3], body[4], shade(col[0], 0.25));
          if (sp.feat.has('stripes')) stripes(k, body[0], body[1], body[2], body[3], body[4], col[2], 5);
        },
      ],
      glow: [[body[0], body[1]], [body[0] + 0.2, body[1] - 0.1], tail[5]],
    };
  }

  function planLongneck(sp, a) {
    const walk = a.walk, ph = a.ph * 0.8;
    const bob = -Math.abs(Math.cos(ph)) * 0.012 * walk + Math.sin(a.t * 1.6) * 0.006;
    const col = sp.col;
    const body = [0, -0.42 + bob, 0.36, 0.2, -0.05];
    const sway = Math.sin(a.t * 1.1) * 0.035;
    const headP = [0.55 + sway, -0.95 + bob + Math.cos(a.t * 1.1) * 0.015 + a.mouth * 0.02];
    const neck = [];
    for (let i = 0; i <= 6; i++) {
      const u = i / 6;
      neck.push([0.24 + (headP[0] - 0.24) * Math.sin(u * Math.PI / 2) , -0.5 + bob + (headP[1] + 0.5 - bob) * (u * u * 0.4 + u * 0.6)]);
    }
    const tail = tailPts([-0.3, -0.45 + bob], 0.78, -0.2, a.t * 1.4, 10);
    const hipB = [-0.2, -0.42 + bob], hipF = [0.2, -0.4 + bob];
    return {
      far: [
        (k) => quadLeg(k, [hipB[0] + 0.04, hipB[1]], ph, walk, 0.2, 0.21, 0.11, col[0], 0.1, false),
        (k) => quadLeg(k, [hipF[0] + 0.04, hipF[1]], ph + Math.PI, walk, 0.2, 0.21, 0.11, col[0], 0.1, true),
      ],
      main: [
        (k) => k.tube(tail, tail.map((_, i) => 0.18 * (1 - i / tail.length * 0.95)), col[0]),
        (k) => { if (sp.feat.has('crest')) spikesAlong(k, neck, 0.06, col[2]); },
        (k) => k.ell(body[0], body[1], body[2], body[3], body[4], col[0]),
        (k) => k.tube(neck, neck.map((_, i) => 0.2 - i * 0.02), col[0]),
        (k) => head(k, headP[0] - 0.02, headP[1] + 0.01, 0.15, 0.2, 0.12, headOpts(sp, a, { crest: false })),
        (k) => quadLeg(k, hipB, ph + Math.PI, walk, 0.2, 0.21, 0.12, col[0], 0.1, false),
        (k) => quadLeg(k, hipF, ph, walk, 0.2, 0.21, 0.12, col[0], 0.1, true),
      ],
      top: [
        (k) => {
          belly(k, body[0], body[1], body[2], body[3], body[4], col[1]);
          if (sp.feat.has('spots')) spots(k, body[0], body[1], body[2], body[3], body[4], col[2]);
          if (sp.feat.has('stripes')) stripes(k, body[0], body[1], body[2], body[3], body[4], col[2], 5);
        },
      ],
      glow: [[body[0], body[1]], neck[3], tail[4]],
    };
  }

  function planFlyer(sp, a) {
    const col = sp.col;
    const flap = Math.sin(a.t * (5 + a.walk * 3));
    const bob = -flap * 0.03;
    const body = [0, -0.62 + bob, 0.27, 0.13, -0.12];
    const S = [0.03, -0.66 + bob];
    const rear = [-0.22, -0.6 + bob];
    const wing = (tipDX, tipDY) => {
      const tip = [S[0] + tipDX, S[1] + tipDY];
      const elbow = [S[0] + tipDX * 0.35 + 0.16, S[1] + tipDY * 0.55 - 0.02];
      const trail = [(tip[0] + rear[0]) / 2 - 0.02, (tip[1] + rear[1]) / 2 + Math.sign(tipDY) * 0.08];
      return [S, elbow, tip, trail, rear];
    };
    const hinge = [0.34, -0.8 + bob];
    const tail = tailPts([-0.22, -0.6 + bob], 0.36, 0.05, a.t * 3, 5);
    const legs = (k) => {
      for (let i = 0; i < 2; i++) {
        const h = [-0.1 + i * 0.06, -0.54 + bob];
        k.limb([h, [h[0] - 0.02, h[1] + 0.08], [h[0] + 0.02, h[1] + 0.12]], 0.035, 0.02, col[0]);
      }
    };
    return {
      far: [(k) => k.poly(wing(-0.5, -0.55 * flap - 0.3), col[2], false)],
      main: [
        (k) => k.tube(tail, tail.map((_, i) => 0.05 * (1 - i / tail.length)), col[0]),
        (k) => { const t = tail[tail.length - 1]; k.poly([[t[0] + 0.02, t[1]], [t[0] - 0.05, t[1] - 0.05], [t[0] - 0.1, t[1]], [t[0] - 0.05, t[1] + 0.05]], col[2]); },
        legs,
        (k) => k.ell(body[0], body[1], body[2], body[3], body[4], col[0]),
        (k) => k.tube([[0.16, -0.66 + bob], [0.26, -0.76 + bob], [hinge[0] + 0.02, hinge[1] - 0.01]], [0.13, 0.1, 0.09], col[0]),
        (k) => head(k, hinge[0], hinge[1], 0.1 + a.mouth * -0.2, 0.36, 0.15, headOpts(sp, a, { beak: true })),
        (k) => k.poly(wing(-0.36, -0.7 * flap - 0.12), col[2], false),
      ],
      top: [
        (k) => {
          belly(k, body[0], body[1], body[2], body[3], body[4], col[1]);
          if (sp.feat.has('stripes')) {
            // Wing stripe
            const w = wing(-0.36, -0.7 * flap - 0.12);
            const c = k.ctx;
            c.strokeStyle = k.col(col[0]);
            c.lineWidth = 0.025;
            c.beginPath(); c.moveTo(w[1][0], w[1][1]); c.lineTo(w[3][0], w[3][1]); c.stroke();
          }
        },
      ],
      glow: [[body[0], body[1]], wing(-0.36, -0.7 * flap - 0.12)[2], hinge],
      flying: true,
    };
  }

  const PLANS = {
    raptor: (sp, a) => planBiped(sp, a, false),
    rex: (sp, a) => planBiped(sp, a, true),
    horned: (sp, a) => planQuad(sp, a, 'horned'),
    plated: (sp, a) => planQuad(sp, a, 'plated'),
    longneck: planLongneck,
    flyer: planFlyer,
  };

  /* ------------------ Public draw ------------------ */

  // o: { x, y (screen position of the ground point), h (pixels per unit),
  //      t (seconds), walk (0..1), face (1 right / -1 left), mouth (0..1),
  //      tint (0..1 flash), tintCol, alpha, shadow, aura, phase }
  function draw(ctx, id, o) {
    const sp = BY_ID[id];
    if (!sp || o.h < 2) return;
    const t = o.t || 0;
    const a = {
      t,
      walk: o.walk || 0,
      ph: (o.phase != null ? o.phase : t * 7),
      mouth: o.mouth || 0,
      blink: ((t + (o.seed || 0)) % 3.7) < 0.12,
    };
    const g = PLANS[sp.plan](sp, a);
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.scale((o.face || 1) * o.h, o.h);
    if (o.alpha != null) ctx.globalAlpha *= o.alpha;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    if (o.shadow !== false) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(-0.05, 0, g.flying ? 0.28 : 0.55, g.flying ? 0.04 : 0.07, 0, 0, TAU);
      ctx.fill();
    }
    const el = ELEMENTS[sp.el];
    if (o.aura !== false && (sp.rar >= 2 || o.aura)) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 3);
      const gr = ctx.createRadialGradient(0, -0.5, 0.05, 0, -0.5, 0.9);
      gr.addColorStop(0, el.color + (sp.rar >= 3 ? '66' : '40'));
      gr.addColorStop(1, el.color + '00');
      ctx.fillStyle = gr;
      ctx.globalAlpha *= 0.6 + pulse * 0.4;
      ctx.beginPath(); ctx.arc(0, -0.5, 0.9, 0, TAU); ctx.fill();
      ctx.globalAlpha /= 0.6 + pulse * 0.4;
    }

    const ol = 0.018 + 0.6 / Math.max(o.h, 20);   // thicker outline when small
    const k = makeKit(ctx, ol);
    k.tint = o.tint || 0;
    k.tintCol = o.tintCol || '#FFFFFF';

    // Far side, darker.
    k.dim = true;
    for (const f of g.far) { k.pass = 0; f(k); k.pass = 1; f(k); }
    k.dim = false;
    // Main silhouette, then colour.
    k.pass = 0;
    for (const f of g.main) f(k);
    k.pass = 1;
    for (const f of g.main) f(k);
    if (o.h > 18) for (const f of g.top) f(k);

    // Glowing markings for rare kinds.
    if (sp.feat.has('glow') && o.h > 14) {
      ctx.save();
      ctx.shadowColor = el.color;
      ctx.shadowBlur = 12;
      ctx.fillStyle = shade(el.color, 0.4);
      const pulse = 0.6 + 0.4 * Math.sin(t * 4);
      for (const p of g.glow) {
        ctx.globalAlpha = pulse;
        ctx.beginPath(); ctx.arc(p[0], p[1], 0.03, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
    // Floating motes for legendaries.
    if (sp.rar >= 3 && o.h > 14) {
      ctx.fillStyle = el.color;
      for (let i = 0; i < 8; i++) {
        const u = ((t * 0.3 + i / 8) % 1);
        const x = Math.sin(i * 2.4 + t) * 0.6;
        const y = -0.1 - u * 1.1;
        ctx.globalAlpha = (1 - u) * 0.9;
        ctx.beginPath(); ctx.arc(x, y, 0.025, 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
  }

  // Rough bounds of each body plan in drawing units: [x0, y0, x1, y1].
  const BOUNDS = {
    raptor: [-1.02, -1.08, 0.8, 0.02],
    rex: [-1.08, -1.08, 0.9, 0.02],
    horned: [-0.88, -0.92, 1.0, 0.02],
    plated: [-1.05, -0.9, 0.86, 0.02],
    longneck: [-1.1, -1.12, 0.8, 0.02],
    flyer: [-0.78, -1.2, 0.78, -0.42],
  };

  // Where to draw a creature so it fills a w × h box: { x, y, h }.
  function fit(id, w, h, pad, animated) {
    const plan = BY_ID[id].plan;
    // A flapping flyer sweeps its wings down to the ground line.
    const b = animated && plan === 'flyer' ? [-0.78, -1.3, 0.78, 0] : BOUNDS[plan];
    const m = pad == null ? 0.08 : pad;
    const s = Math.min(w * (1 - m * 2) / (b[2] - b[0]), h * (1 - m * 2) / (b[3] - b[1]));
    return { x: w / 2 - (b[0] + b[2]) / 2 * s, y: h / 2 - (b[1] + b[3]) / 2 * s, h: s };
  }

  // Render a still portrait into a canvas (for lists and cards).
  function portrait(canvas, id, opts) {
    const o = opts || {};
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = canvas.clientWidth || canvas.width, H = canvas.clientHeight || canvas.height;
    if (canvas.width !== Math.round(W * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
    const c = canvas.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    if (!BY_ID[id]) return;
    if (o.silhouette) c.filter = 'brightness(0) invert(1) opacity(0.22)';
    const f = fit(id, W, H);
    draw(c, id, { x: f.x, y: f.y, h: f.h, t: o.t != null ? o.t : BY_ID[id].plan === 'flyer' ? 0.06 : 0.9, walk: 0, shadow: BY_ID[id].plan !== 'flyer', aura: o.silhouette ? false : o.aura, seed: 1 });
    c.filter = 'none';
  }

  RB.creatures = {
    ELEMENTS, RARITY, SPECIES, WILD, HYBRIDS, MAX_LEVEL,
    byId: (id) => BY_ID[id],
    advantage, stats, power, levelCost, fuseCost,
    draw, portrait, fit, shade,
  };
})(window.RB);
