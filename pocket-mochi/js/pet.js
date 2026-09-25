/* Pocket Mochi — the pet: care model (stats, growth, poop, sickness) and the
   animated view that draws it. */
(function (PM) {
  'use strict';

  const { TAU, outline } = PM.art;
  const INK = PM.INK;

  const STAT_KEYS = ['hunger', 'fun', 'energy', 'clean'];
  // Meter change per real hour. "hunger" is how full the pet is.
  const AWAKE_RATE = { hunger: -12, fun: -14, energy: -8, clean: -6 };
  const SLEEP_RATE = { hunger: -5, fun: -2, energy: 45, clean: -2 };
  const STAGES = [
    { key: 'baby', label: 'Baby', xp: 0, scale: 0.64 },
    { key: 'kid', label: 'Kid', xp: 120, scale: 0.82 },
    { key: 'adult', label: 'Grown-up', xp: 400, scale: 1 },
  ];
  const MAX_POOPS = 4;
  const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

  /* ======================= Model ======================= */

  function create(opts) {
    const now = Date.now();
    return {
      v: 1,
      name: opts.name,
      species: opts.species,
      color: opts.color,
      born: now,
      last: now,
      hatched: false,
      eggTaps: 0,
      stats: { hunger: 70, fun: 70, energy: 85, clean: 90 },
      health: 100,
      sick: false,
      asleep: false,
      xp: 0,
      coins: 30,
      poops: [],
      digest: 0,
      digestT: 0,
      inv: { apple: 3, onigiri: 2, dango: 1 },
      hats: [],
      hat: null,
      best: 0,
      gift: '',
      hints: {},
      settings: { sound: true, vibe: true },
    };
  }

  // Accept a saved object only if it looks like ours; fill in anything missing.
  function revive(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== 1 || !raw.name) return null;
    const base = create({ name: raw.name, species: raw.species, color: raw.color });
    const s = Object.assign(base, raw);
    s.stats = Object.assign(base.stats, raw.stats || {});
    s.settings = Object.assign({ sound: true, vibe: true }, raw.settings || {});
    s.inv = Object.assign({}, raw.inv || {});
    s.hats = Array.isArray(raw.hats) ? raw.hats : [];
    s.poops = Array.isArray(raw.poops) ? raw.poops : [];
    s.hints = raw.hints || {};
    if (!PM.PET_COLORS[s.color]) s.color = 'pink';
    if (!PM.SPECIES[s.species]) s.species = 'mochi';
    return s;
  }

  function stageIndex(s) {
    let i = 0;
    STAGES.forEach((st, k) => { if (s.xp >= st.xp) i = k; });
    return i;
  }

  function stage(s) {
    return STAGES[stageIndex(s)];
  }

  function ageDays(s) {
    return Math.floor((Date.now() - s.born) / 86400000) + 1;
  }

  function pickPoopX(s) {
    let best = 0.5;
    for (let tries = 0; tries < 12; tries++) {
      const x = 0.14 + Math.random() * 0.72;
      if (s.poops.every((p) => Math.abs(p.x - x) > 0.12)) return x;
      best = x;
    }
    return best;
  }

  function step(s, h, ev) {
    const r = s.asleep ? SLEEP_RATE : AWAKE_RATE;
    const sickMul = s.sick ? 1.3 : 1;
    for (const k of STAT_KEYS) {
      let d = r[k] * h;
      if (d < 0) d *= sickMul;
      s.stats[k] = clamp(s.stats[k] + d);
    }
    if (s.poops.length) s.stats.clean = clamp(s.stats.clean - s.poops.length * 4 * h);

    // Food turns into poop a little while after eating.
    if (s.digest > 0) {
      s.digestT += h;
      if (s.digest >= 40 && s.digestT >= 0.35 && s.poops.length < MAX_POOPS) {
        s.digest -= 40;
        s.digestT = 0;
        s.poops.push({ id: Math.random().toString(36).slice(2), x: pickPoopX(s) });
        ev.push('poop');
      }
    }

    // Neglect wears down health; good care restores it.
    let hurt = 0;
    for (const k of STAT_KEYS) if (s.stats[k] < 15) hurt += 7;
    if (s.poops.length >= 3) hurt += 6;
    s.health = clamp(s.health + (hurt ? -hurt : 5) * h);
    if (!s.sick && s.health < 35) {
      s.sick = true;
      ev.push('sick');
    }

    if (s.asleep && s.stats.energy >= 100) {
      s.asleep = false;
      ev.push('woke');
    } else if (!s.asleep && s.stats.energy <= 0) {
      s.asleep = true;
      ev.push('fell-asleep');
    }
  }

  // Advance the pet by real elapsed time. Long gaps (the app was closed) are
  // simulated in one-minute steps and capped at three days.
  function simulate(s, hours) {
    const ev = [];
    if (!s.hatched || !(hours > 0)) return ev;
    let left = Math.min(hours, 72);
    const chunk = 1 / 60;
    while (left > 0) {
      const h = Math.min(chunk, left);
      step(s, h, ev);
      left -= h;
    }
    return ev;
  }

  function addXP(s, n) {
    const before = stageIndex(s);
    s.xp += n;
    const after = stageIndex(s);
    if (after > before) {
      s.coins += 20;
      return STAGES[after];
    }
    return null;
  }

  function mood(s) {
    if (!s.hatched) return 'egg';
    if (s.asleep) return 'sleep';
    if (s.sick) return 'sick';
    const st = s.stats;
    const min = Math.min(st.hunger, st.fun, st.energy, st.clean);
    if (min < 20) return 'sad';
    if (st.energy < 30) return 'tired';
    if (min > 60) return 'happy';
    return 'ok';
  }

  // The most pressing thing the pet wants, shown in a thought bubble.
  function need(s) {
    if (!s.hatched || s.asleep) return null;
    if (s.sick) return 'sick';
    const st = s.stats;
    const order = [['hunger', st.hunger], ['energy', st.energy], ['clean', st.clean], ['fun', st.fun]]
      .filter(([, v]) => v < 35)
      .sort((a, b) => a[1] - b[1]);
    if (order.length) return order[0][0];
    if (s.poops.length >= 2) return 'poop';
    return null;
  }

  const model = {
    STAT_KEYS, STAGES, create, revive, stage, stageIndex, ageDays, simulate, addXP, mood, need, clamp,

    feed(s, type) {
      const f = PM.FOODS[type];
      if (!f || !(s.inv[type] > 0)) return 'none';
      if (s.stats.hunger >= 96) return 'full';
      s.inv[type] -= 1;
      s.stats.hunger = clamp(s.stats.hunger + f.food);
      s.stats.fun = clamp(s.stats.fun + f.fun);
      s.stats.clean = clamp(s.stats.clean + f.clean);
      s.digest += f.food;
      return 'ok';
    },

    medicine(s) {
      s.sick = false;
      s.health = Math.max(s.health, 75);
      s.stats.fun = clamp(s.stats.fun - 4);
    },

    cleanPoop(s, id) {
      const i = s.poops.findIndex((p) => p.id === id);
      if (i < 0) return false;
      s.poops.splice(i, 1);
      s.stats.clean = clamp(s.stats.clean + 3);
      return true;
    },

    buyFood(s, type) {
      const f = PM.FOODS[type];
      if (!f || s.coins < f.price) return false;
      s.coins -= f.price;
      s.inv[type] = (s.inv[type] || 0) + 1;
      return true;
    },

    buyHat(s, type) {
      const h = PM.HATS[type];
      if (!h || s.hats.includes(type) || s.coins < h.price) return false;
      s.coins -= h.price;
      s.hats.push(type);
      s.hat = type;
      return true;
    },
  };

  /* ======================= View ======================= */

  function bodyPath(ctx, w, h) {
    ctx.beginPath();
    ctx.moveTo(-w * 0.5, -h * 0.35);
    ctx.bezierCurveTo(-w * 0.5, -h * 1.2, w * 0.5, -h * 1.2, w * 0.5, -h * 0.35);
    ctx.bezierCurveTo(w * 0.54, -h * 0.02, w * 0.36, 0, 0, 0);
    ctx.bezierCurveTo(-w * 0.36, 0, -w * 0.54, -h * 0.02, -w * 0.5, -h * 0.35);
    ctx.closePath();
  }

  // Which eyes + mouth each expression uses.
  const FACES = {
    happy: ['open', 'smile'],
    ok: ['open', 'small'],
    sad: ['sad', 'frown'],
    tired: ['half', 'o'],
    sick: ['half', 'wobble'],
    sleep: ['closed', 'o'],
    giggle: ['happy', 'grin'],
    love: ['happy', 'smile'],
    eat: ['happy', 'chew'],
    open: ['wide', 'open'],
    yum: ['happy', 'grin'],
    no: ['squint', 'flat'],
    dizzy: ['spiral', 'wobble'],
    yuck: ['squint', 'tongue'],
    grumpy: ['grumpy', 'frown'],
    hurt: ['squint', 'o'],
    surprise: ['wide', 'o'],
    yawn: ['closed', 'open'],
  };

  const DIRT = [[-0.24, -0.28, 0.05], [0.2, -0.72, 0.04], [0.3, -0.22, 0.035], [-0.1, -0.84, 0.03], [0.05, -0.16, 0.03]];

  class PetView {
    constructor() {
      this.x = null;
      this.targetX = null;
      this.vx = 0;
      this.jump = 0;
      this.jumpV = 0;
      this.sq = 1;
      this.sqV = 0;
      this.t = Math.random() * 10;
      this.blink = 0;
      this.nextBlink = 1.5;
      this.look = { x: 0, y: 0 };
      this.lookAt = null;
      this.expr = null;
      this.exprUntil = 0;
      this.shake = 0;
      this.wander = 2.5;
      this.facing = 1;
      this.foam = [];
      this.foamFade = 1;
      this.egg = 0;
      this.eggV = 0;
      this.scale = null;
      // Last drawn geometry, used for hit tests and effects.
      this.geo = { x: 0, cy: 0, top: 0, w: 1, h: 1, mouthY: 0, groundY: 0 };
    }

    setExpr(name, dur) {
      this.expr = name;
      this.exprUntil = this.t + dur;
    }

    currentExpr(fallback) {
      return this.expr && this.t < this.exprUntil ? this.expr : fallback;
    }

    squish(v) { this.sqV -= v; }

    hop(v) {
      if (this.jump > 0) return;
      this.jumpV = v || 260;
      this.sqV += 2.5;
    }

    shakeHead(d) { this.shake = d || 0.5; }

    wobbleEgg() { this.eggV += (Math.random() < 0.5 ? -1 : 1) * 7; }

    update(dt, env) {
      // env: { W, groundY, size, busy, canWander, stageScale }
      this.t += dt;
      if (this.x === null) this.x = env.W / 2;
      if (this.scale === null) this.scale = env.stageScale;
      this.scale += (env.stageScale - this.scale) * Math.min(1, dt * 3);

      // squash and stretch spring
      const a = (1 - this.sq) * 190 - this.sqV * 11;
      this.sqV += a * dt;
      this.sq = Math.max(0.62, Math.min(1.35, this.sq + this.sqV * dt));

      // hopping
      if (this.jump > 0 || this.jumpV > 0) {
        this.jumpV -= 1500 * dt;
        this.jump += this.jumpV * dt;
        this.x += this.vx * dt;
        if (this.jump <= 0) {
          this.jump = 0;
          this.jumpV = 0;
          this.vx = 0;
          this.squish(3.2);
        }
      }

      // wander around the room with little hops
      if (env.canWander) {
        this.wander -= dt;
        if (this.wander <= 0) {
          this.targetX = env.W * (0.3 + Math.random() * 0.4);
          this.wander = 3 + Math.random() * 5;
        }
      } else {
        this.targetX = null;
      }
      if (this.targetX !== null && this.jump === 0) {
        const d = this.targetX - this.x;
        if (Math.abs(d) > 6) {
          this.facing = Math.sign(d);
          this.vx = Math.sign(d) * Math.min(110, Math.abs(d) * 3);
          this.hop(170);
        } else {
          this.targetX = null;
        }
      }
      const margin = env.size * 0.5;
      this.x = Math.max(margin, Math.min(env.W - margin, this.x));

      // blinking
      this.nextBlink -= dt;
      if (this.nextBlink <= 0) {
        this.blink = 0.13;
        this.nextBlink = 2 + Math.random() * 3.5;
      }
      if (this.blink > 0) this.blink -= dt;
      if (this.shake > 0) this.shake -= dt;

      // eyes follow the finger (or whatever lookAt points at)
      let tx = this.facing * 0.25;
      let ty = 0.1;
      if (this.lookAt) {
        tx = Math.max(-1, Math.min(1, (this.lookAt.x - this.geo.x) / (this.geo.w * 1.2)));
        ty = Math.max(-1, Math.min(1, (this.lookAt.y - this.geo.cy) / (this.geo.h * 1.2)));
      }
      const k = Math.min(1, dt * 10);
      this.look.x += (tx - this.look.x) * k;
      this.look.y += (ty - this.look.y) * k;

      // egg wobble spring
      this.eggV += (-this.egg * 120 - this.eggV * 6) * dt;
      this.egg += this.eggV * dt;

      if (this.foamFade < 1) {
        this.foamFade -= dt * 1.2;
        if (this.foamFade <= 0) {
          this.foam = [];
          this.foamFade = 1;
        }
      }
    }

    addFoam(localX, localY) {
      // local coordinates are fractions of body width/height from the feet
      if (this.foam.length > 46) this.foam.shift();
      this.foam.push({ x: localX, y: localY, r: 0.05 + Math.random() * 0.06 });
    }

    rinse() { if (this.foam.length) this.foamFade = 0.999; }

    // Convert a world point into body-relative fractions.
    toLocal(px, py) {
      const g = this.geo;
      return { x: (px - g.x) / g.w, y: (py - g.groundY + this.jump) / g.h };
    }

    hit(px, py, pad) {
      const g = this.geo;
      const dx = (px - g.x) / (g.w * 0.55 + (pad || 0));
      const dy = (py - g.cy) / (g.h * 0.58 + (pad || 0));
      return dx * dx + dy * dy <= 1;
    }

    drawEgg(ctx, p) {
      const w = p.size * 0.5;
      const h = w * 1.28;
      const col = PM.PET_COLORS[p.color] || PM.PET_COLORS.pink;
      const lw = Math.max(2.5, w * 0.045);
      this.geo = { x: this.x, cy: p.groundY - h / 2, top: p.groundY - h, w, h, mouthY: p.groundY - h / 2, groundY: p.groundY };

      ctx.beginPath();
      ctx.ellipse(this.x, p.groundY + 2, w * 0.5, w * 0.1, 0, 0, TAU);
      ctx.fillStyle = 'rgba(34,36,61,0.18)';
      ctx.fill();

      ctx.save();
      ctx.translate(this.x, p.groundY);
      ctx.rotate(this.egg * 0.12 + Math.sin(this.t * 2) * 0.02);
      const eggPath = () => {
        ctx.beginPath();
        ctx.moveTo(0, -h);
        ctx.bezierCurveTo(w * 0.62, -h, w * 0.62, 0, 0, 0);
        ctx.bezierCurveTo(-w * 0.62, 0, -w * 0.62, -h, 0, -h);
        ctx.closePath();
      };
      eggPath();
      ctx.fillStyle = '#FFF8EE';
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = col.body;
      [[-0.2, -0.3, 0.14], [0.22, -0.55, 0.12], [-0.08, -0.72, 0.08], [0.18, -0.18, 0.1], [-0.3, -0.62, 0.09]].forEach(([dx, dy, r]) => {
        ctx.beginPath();
        ctx.arc(dx * w, dy * h, r * w * 1.4, 0, TAU);
        ctx.fill();
      });
      ctx.restore();
      eggPath();
      outline(ctx, lw);
      ctx.beginPath();
      ctx.ellipse(-w * 0.2, -h * 0.7, w * 0.07, w * 0.13, 0.4, 0, TAU);
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fill();

      // cracks grow with each tap
      const cracks = [
        [[-0.05, -0.98], [0.04, -0.86], [-0.06, -0.78], [0.05, -0.7]],
        [[0.3, -0.62], [0.2, -0.56], [0.26, -0.48], [0.14, -0.42]],
        [[-0.34, -0.5], [-0.22, -0.46], [-0.28, -0.38], [-0.16, -0.32]],
        [[0.05, -0.7], [0.14, -0.62], [0.06, -0.54], [0.16, -0.46]],
      ];
      ctx.lineWidth = lw * 0.8;
      ctx.strokeStyle = INK;
      for (let i = 0; i < Math.min(p.taps, cracks.length); i++) {
        ctx.beginPath();
        cracks[i].forEach(([cx, cy], j) => {
          if (j === 0) ctx.moveTo(cx * w, cy * h); else ctx.lineTo(cx * w, cy * h);
        });
        ctx.stroke();
      }
      ctx.restore();
    }

    draw(ctx, p) {
      // p: { species, color, hat, size, groundY, clean, mood, t }
      if (p.mood === 'egg') { this.drawEgg(ctx, p); return; }
      const w = p.size * this.scale;
      const h = w * 0.86;
      const col = PM.PET_COLORS[p.color] || PM.PET_COLORS.pink;
      const lw = Math.max(2.5, w * 0.03);
      const expr = this.currentExpr(p.mood);
      const face = FACES[expr] || FACES.ok;
      const sleeping = expr === 'sleep';

      const breathe = sleeping ? Math.sin(this.t * 1.6) * 0.04 : Math.sin(this.t * 2.6) * 0.018;
      const sy = this.sq * (1 + breathe) * (sleeping ? 0.93 : 1);
      const sx = 1 + (1 - sy) * 0.85;
      const shakeX = this.shake > 0 ? Math.sin(this.shake * 42) * w * 0.05 : 0;
      const baseY = p.groundY - this.jump;

      this.geo = {
        x: this.x, cy: baseY - h * 0.5 * sy, top: baseY - h * sy, w: w * sx, h: h * sy,
        mouthY: baseY - h * 0.41 * sy, groundY: p.groundY,
      };

      // shadow on the floor
      const sk = 1 / (1 + this.jump / 90);
      ctx.beginPath();
      ctx.ellipse(this.x, p.groundY + 2, w * 0.44 * sk, w * 0.075 * sk, 0, 0, TAU);
      ctx.fillStyle = 'rgba(34,36,61,0.2)';
      ctx.fill();

      ctx.save();
      ctx.translate(this.x + shakeX, baseY);
      ctx.scale(sx, sy);
      if (this.jump > 0) ctx.rotate(this.vx * 0.0012);

      this.drawBackParts(ctx, p.species, w, h, col, lw);

      // feet
      const step = this.jump > 0 ? 0.03 * h : 0;
      [-1, 1].forEach((d) => {
        ctx.beginPath();
        ctx.ellipse(d * w * 0.2, -h * 0.02 + (d > 0 ? step : -step), w * 0.1, h * 0.06, 0, 0, TAU);
        ctx.fillStyle = col.dark;
        ctx.fill();
        outline(ctx, lw);
      });

      // body
      bodyPath(ctx, w, h);
      ctx.fillStyle = col.body;
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.beginPath();
      ctx.ellipse(0, -h * 0.18, w * 0.34, h * 0.26, 0, 0, TAU);
      ctx.fillStyle = col.belly;
      ctx.fill();
      // dirt
      const dirt = Math.max(0, Math.min(0.85, (50 - p.clean) / 40));
      if (dirt > 0) {
        ctx.fillStyle = `rgba(122,82,52,${dirt})`;
        DIRT.forEach(([dx, dy, r]) => {
          ctx.beginPath();
          ctx.ellipse(dx * w, dy * h, r * w * 1.3, r * w, 0.4, 0, TAU);
          ctx.fill();
        });
      }
      if (expr === 'sick' || p.sick) {
        ctx.fillStyle = 'rgba(126,190,80,0.28)';
        ctx.fillRect(-w, -h * 1.2, w * 2, h * 1.3);
      }
      ctx.restore();
      bodyPath(ctx, w, h);
      outline(ctx, lw);
      ctx.beginPath();
      ctx.ellipse(-w * 0.26, -h * 0.78, w * 0.06, w * 0.1, 0.7, 0, TAU);
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fill();

      this.drawFace(ctx, face, expr, w, h, lw);
      this.drawFrontParts(ctx, p.species, w, h, col, lw);

      // soap foam
      if (this.foam.length) {
        ctx.save();
        ctx.globalAlpha = this.foamFade;
        for (const f of this.foam) {
          ctx.beginPath();
          ctx.arc(f.x * w, f.y * h, f.r * w, 0, TAU);
          ctx.fillStyle = '#FFFFFF';
          ctx.fill();
          ctx.lineWidth = Math.max(1.5, lw * 0.6);
          ctx.strokeStyle = '#8FD0F5';
          ctx.stroke();
        }
        ctx.restore();
      }

      if (p.hat === 'shades') PM.art.drawShades(ctx, w, -h * 0.55);
      else if (p.hat) {
        ctx.save();
        ctx.translate(0, -h * 0.95);
        PM.art.drawHat(ctx, p.hat, w);
        ctx.restore();
      }
      if (expr === 'sick' || p.sick) {
        ctx.beginPath();
        ctx.moveTo(w * 0.36, -h * 0.78);
        ctx.quadraticCurveTo(w * 0.42, -h * 0.64, w * 0.36, -h * 0.6);
        ctx.quadraticCurveTo(w * 0.3, -h * 0.64, w * 0.36, -h * 0.78);
        ctx.fillStyle = '#8FD0F5';
        ctx.fill();
        outline(ctx, lw * 0.7);
      }
      ctx.restore();
    }

    drawBackParts(ctx, species, w, h, col, lw) {
      if (species === 'kitty') {
        // tail
        const wag = Math.sin(this.t * 3) * 0.08;
        ctx.save();
        ctx.translate(w * 0.38, -h * 0.2);
        ctx.rotate(wag);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(w * 0.3, -h * 0.05, w * 0.22, -h * 0.5, w * 0.34, -h * 0.55);
        ctx.lineCap = 'round';
        ctx.lineWidth = w * 0.11 + lw * 2;
        ctx.strokeStyle = INK;
        ctx.stroke();
        ctx.lineWidth = w * 0.11;
        ctx.strokeStyle = col.body;
        ctx.stroke();
        ctx.restore();
        [-1, 1].forEach((d) => {
          ctx.beginPath();
          ctx.moveTo(d * w * 0.4, -h * 0.66);
          ctx.lineTo(d * w * 0.34, -h * 1.12);
          ctx.lineTo(d * w * 0.08, -h * 0.9);
          ctx.closePath();
          ctx.fillStyle = col.body;
          ctx.fill();
          outline(ctx, lw);
          ctx.beginPath();
          ctx.moveTo(d * w * 0.33, -h * 0.8);
          ctx.lineTo(d * w * 0.31, -h * 1.02);
          ctx.lineTo(d * w * 0.17, -h * 0.9);
          ctx.closePath();
          ctx.fillStyle = '#FF9FC4';
          ctx.fill();
        });
      } else if (species === 'bunny') {
        [-1, 1].forEach((d) => {
          const sway = Math.sin(this.t * 2 + d) * 0.06;
          ctx.save();
          ctx.translate(d * w * 0.16, -h * 0.86);
          ctx.rotate(d * 0.18 + sway);
          ctx.beginPath();
          ctx.ellipse(0, -h * 0.32, w * 0.1, h * 0.34, 0, 0, TAU);
          ctx.fillStyle = col.body;
          ctx.fill();
          outline(ctx, lw);
          ctx.beginPath();
          ctx.ellipse(0, -h * 0.3, w * 0.045, h * 0.24, 0, 0, TAU);
          ctx.fillStyle = '#FF9FC4';
          ctx.fill();
          ctx.restore();
        });
      }
    }

    drawFrontParts(ctx, species, w, h, col, lw) {
      if (species === 'pup') {
        [-1, 1].forEach((d) => {
          const flop = Math.sin(this.t * 2.2 + d) * 0.05;
          ctx.save();
          ctx.translate(d * w * 0.43, -h * 0.8);
          ctx.rotate(-d * (0.22 + flop));
          ctx.beginPath();
          ctx.ellipse(0, h * 0.2, w * 0.1, h * 0.24, 0, 0, TAU);
          ctx.fillStyle = col.dark;
          ctx.fill();
          outline(ctx, lw);
          ctx.restore();
        });
      } else if (species === 'mochi') {
        ctx.save();
        ctx.translate(0, -h * 0.97);
        ctx.rotate(Math.sin(this.t * 2) * 0.08);
        ctx.beginPath();
        ctx.moveTo(0, h * 0.02);
        ctx.quadraticCurveTo(w * 0.02, -h * 0.08, 0, -h * 0.14);
        outline(ctx, lw);
        [-1, 1].forEach((d) => {
          ctx.beginPath();
          ctx.ellipse(d * w * 0.07, -h * 0.16, w * 0.075, w * 0.04, d * -0.5, 0, TAU);
          ctx.fillStyle = '#7ED957';
          ctx.fill();
          outline(ctx, lw * 0.8);
        });
        ctx.restore();
      }
    }

    drawFace(ctx, face, expr, w, h, lw) {
      const [eyes, mouth] = face;
      const ey = -h * 0.55;
      const ex = w * 0.19;
      const lx = this.look.x * w * 0.035;
      const ly = this.look.y * w * 0.028;
      const erx = w * 0.062;
      const ery = w * 0.08;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // cheeks
      const blush = expr === 'love' || expr === 'giggle' || expr === 'yum' ? 0.75 : 0.45;
      [-1, 1].forEach((d) => {
        ctx.beginPath();
        ctx.ellipse(d * w * 0.31 + lx * 0.4, -h * 0.4, w * 0.075, w * 0.045, 0, 0, TAU);
        ctx.fillStyle = `rgba(255,105,150,${blush})`;
        ctx.fill();
      });

      ctx.fillStyle = INK;
      ctx.strokeStyle = INK;
      ctx.lineWidth = Math.max(2.5, w * 0.032);
      const blinking = this.blink > 0 && (eyes === 'open' || eyes === 'sad' || eyes === 'wide');

      [-1, 1].forEach((d) => {
        const cx = d * ex + lx;
        const cy = ey + ly;
        if (blinking) {
          ctx.beginPath();
          ctx.moveTo(cx - erx, cy);
          ctx.lineTo(cx + erx, cy);
          ctx.stroke();
          return;
        }
        switch (eyes) {
          case 'open':
          case 'sad':
          case 'wide': {
            const k = eyes === 'wide' ? 1.25 : 1;
            ctx.beginPath();
            ctx.ellipse(cx, cy, erx * k, ery * k, 0, 0, TAU);
            ctx.fill();
            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.arc(cx + erx * 0.35, cy - ery * 0.4, erx * 0.42 * k, 0, TAU);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(cx - erx * 0.35, cy + ery * 0.42, erx * 0.2 * k, 0, TAU);
            ctx.fill();
            ctx.fillStyle = INK;
            if (eyes === 'sad') {
              // inner end (toward the middle of the face) raised
              ctx.beginPath();
              ctx.moveTo(cx - d * erx * 1.1, cy - ery * 2.1);
              ctx.lineTo(cx + d * erx * 1.0, cy - ery * 1.55);
              ctx.stroke();
            }
            break;
          }
          case 'happy':
            ctx.beginPath();
            ctx.arc(cx, cy + ery * 0.35, erx * 1.05, Math.PI * 1.15, Math.PI * 1.85);
            ctx.stroke();
            break;
          case 'closed':
            ctx.beginPath();
            ctx.arc(cx, cy - ery * 0.3, erx * 1.05, Math.PI * 0.15, Math.PI * 0.85);
            ctx.stroke();
            break;
          case 'half':
          case 'grumpy':
            ctx.beginPath();
            ctx.ellipse(cx, cy, erx, ery, 0, 0, Math.PI);
            ctx.closePath();
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(cx - erx * 1.2, cy);
            ctx.lineTo(cx + erx * 1.2, cy);
            if (eyes === 'grumpy') {
              ctx.moveTo(cx - d * erx * 1.1, cy - ery * 0.8);
              ctx.lineTo(cx + d * erx * 1.1, cy - ery * 1.55);
            }
            ctx.stroke();
            break;
          case 'squint':
            ctx.beginPath();
            ctx.moveTo(cx - d * erx, cy - ery * 0.7);
            ctx.lineTo(cx + d * erx * 0.8, cy);
            ctx.lineTo(cx - d * erx, cy + ery * 0.7);
            ctx.stroke();
            break;
          case 'spiral': {
            ctx.beginPath();
            for (let i = 0; i < 26; i++) {
              const a = i * 0.55 + this.t * 8 * d;
              const r = (i / 26) * erx * 1.2;
              const px = cx + Math.cos(a) * r;
              const py = cy + Math.sin(a) * r;
              if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.lineWidth = Math.max(2, w * 0.022);
            ctx.stroke();
            ctx.lineWidth = Math.max(2.5, w * 0.032);
            break;
          }
          default:
            break;
        }
      });

      // mouth
      const mx = lx * 0.6;
      const my = -h * 0.4 + ly * 0.5;
      const m = w * 0.06;
      ctx.fillStyle = INK;
      switch (mouth) {
        case 'smile':
          ctx.beginPath();
          ctx.arc(mx, my - m * 0.55, m, Math.PI * 0.2, Math.PI * 0.8);
          ctx.stroke();
          break;
        case 'small':
          ctx.beginPath();
          ctx.arc(mx, my - m * 0.5, m * 0.6, Math.PI * 0.25, Math.PI * 0.75);
          ctx.stroke();
          break;
        case 'grin':
        case 'open': {
          ctx.beginPath();
          if (mouth === 'grin') {
            ctx.moveTo(mx - m * 1.05, my - m * 0.3);
            ctx.quadraticCurveTo(mx, my + m * 1.7, mx + m * 1.05, my - m * 0.3);
            ctx.closePath();
          } else {
            ctx.ellipse(mx, my + m * 0.1, m * 0.8, m * 0.95, 0, 0, TAU);
          }
          ctx.fill();
          ctx.save();
          ctx.clip();
          ctx.beginPath();
          ctx.ellipse(mx, my + m * 0.9, m * 0.7, m * 0.5, 0, 0, TAU);
          ctx.fillStyle = '#FF7FA6';
          ctx.fill();
          ctx.restore();
          break;
        }
        case 'frown':
          ctx.beginPath();
          ctx.arc(mx, my + m * 0.75, m * 0.85, Math.PI * 1.2, Math.PI * 1.8);
          ctx.stroke();
          break;
        case 'o':
          ctx.beginPath();
          ctx.ellipse(mx, my, m * 0.36, m * 0.44, 0, 0, TAU);
          ctx.fill();
          break;
        case 'flat':
          ctx.beginPath();
          ctx.moveTo(mx - m * 0.6, my);
          ctx.lineTo(mx + m * 0.6, my);
          ctx.stroke();
          break;
        case 'chew': {
          const open = Math.sin(this.t * 22) > 0;
          ctx.beginPath();
          if (open) {
            ctx.ellipse(mx, my, m * 0.6, m * 0.5, 0, 0, TAU);
            ctx.fill();
          } else {
            ctx.arc(mx, my - m * 0.4, m * 0.7, Math.PI * 0.2, Math.PI * 0.8);
            ctx.stroke();
          }
          break;
        }
        case 'wobble':
          ctx.beginPath();
          for (let i = 0; i <= 8; i++) {
            const px = mx - m + (i / 8) * m * 2;
            const py = my + Math.sin(i * 1.6) * m * 0.22;
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.stroke();
          break;
        case 'tongue':
          ctx.beginPath();
          ctx.moveTo(mx - m * 0.8, my);
          ctx.lineTo(mx + m * 0.8, my);
          ctx.stroke();
          ctx.beginPath();
          ctx.ellipse(mx + m * 0.25, my + m * 0.45, m * 0.35, m * 0.45, 0, 0, Math.PI);
          ctx.fillStyle = '#FF7FA6';
          ctx.fill();
          outline(ctx, Math.max(1.5, w * 0.018));
          break;
        default:
          break;
      }
    }

    drawThought(ctx, need, t) {
      if (!need) return;
      const g = this.geo;
      const r = Math.max(22, g.w * 0.19);
      const side = g.x > ctx.canvas.clientWidth * 0.55 ? -1 : 1;
      const bx = g.x + side * g.w * 0.62;
      const by = g.top - r * 0.4 + Math.sin(t * 2) * 3;
      const dots = [[0.35, 0.95, 0.12], [0.18, 0.6, 0.2]];
      dots.forEach(([fx, fy, fr]) => {
        ctx.beginPath();
        ctx.arc(g.x + side * g.w * fx, by + r * fy + r * 0.5, r * fr, 0, TAU);
        ctx.fillStyle = '#FFFDF8';
        ctx.fill();
        outline(ctx, 2.5);
      });
      ctx.beginPath();
      ctx.ellipse(bx, by, r * 1.15, r, 0, 0, TAU);
      ctx.fillStyle = '#FFFDF8';
      ctx.fill();
      outline(ctx, 3);
      PM.art.drawNeedIcon(ctx, need, bx, by, r * 1.15, t);
    }
  }

  PM.model = model;
  PM.PetView = PetView;
})(window.PM = window.PM || {});
