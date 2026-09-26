/* Pocket Mochi — "Star Catch": drag to slide your pet left and right, catch
   falling stars and coins, dodge the storm clouds. Three hearts per round. */
(function (PM) {
  'use strict';

  const { TAU, outline, starPath, heartPath } = PM.art;

  class StarCatch {
    constructor() {
      this.pet = new PM.PetView();
      this.fx = new PM.Particles();
      this.running = false;
      this.W = 1;
      this.H = 1;
    }

    start(W, H) {
      this.W = W;
      this.H = H;
      this.items = [];
      this.score = 0;
      this.coins = 0;
      this.lives = 3;
      this.t = 0;
      this.spawn = 0.7;
      this.inv = 0;
      this.shakeT = 0;
      this.pet.x = W / 2;
      this.pet.scale = 1;
      this.targetX = W / 2;
      this.fx.list = [];
      this.running = true;
    }

    resize(W, H) {
      const kx = W / this.W;
      this.pet.x *= kx;
      this.targetX *= kx;
      if (this.items) this.items.forEach((it) => { it.x *= kx; it.y *= H / this.H; });
      this.W = W;
      this.H = H;
    }

    pointer(x) { this.targetX = x; }

    groundY() { return this.H * 0.88; }

    petSize() { return Math.min(this.W * 0.3, this.H * 0.22, 150); }

    spawnItem() {
      const bad = Math.min(0.4, 0.16 + this.t * 0.006);
      const r = Math.random();
      let kind = 'star';
      if (r < bad) kind = 'cloud';
      else if (r < bad + 0.1) kind = 'coin';
      else if (r < bad + 0.13 && this.lives < 3) kind = 'heart';
      const rad = kind === 'cloud' ? 24 : 17;
      this.items.push({
        kind, r: rad,
        x: rad + Math.random() * (this.W - rad * 2),
        y: -rad,
        vy: (150 + Math.random() * 70) * (1 + this.t / 45),
        sway: Math.random() * TAU,
        rot: Math.random() * TAU,
      });
    }

    // Returns 'over' on the frame the round ends.
    update(dt) {
      if (!this.running) {
        // Round is over: keep the pet and effects animating behind the results card.
        this.pet.update(dt, { W: this.W, size: this.petSize(), canWander: false, stageScale: 1 });
        this.fx.update(dt);
        return null;
      }
      this.t += dt;
      this.spawn -= dt;
      if (this.spawn <= 0) {
        this.spawnItem();
        this.spawn = Math.max(0.3, 0.85 - this.t * 0.014) * (0.7 + Math.random() * 0.6);
      }

      const size = this.petSize();
      const prevX = this.pet.x;
      this.pet.x += (this.targetX - this.pet.x) * Math.min(1, dt * 14);
      if (Math.abs(this.pet.x - prevX) > 0.5) this.pet.facing = Math.sign(this.pet.x - prevX);
      this.pet.lookAt = null;
      this.pet.update(dt, { W: this.W, size, canWander: false, stageScale: 1 });

      const g = this.pet.geo;
      let result = null;
      for (let i = this.items.length - 1; i >= 0; i--) {
        const it = this.items[i];
        it.y += it.vy * dt;
        it.sway += dt * 3;
        it.x += Math.sin(it.sway) * 22 * dt;
        it.rot += dt * 2.5;
        const dx = (it.x - g.x) / (g.w * 0.5 + it.r * 0.6);
        const dy = (it.y - g.cy) / (g.h * 0.5 + it.r * 0.6);
        if (dx * dx + dy * dy < 1) {
          this.items.splice(i, 1);
          if (this.collect(it)) result = 'over';
          continue;
        }
        if (it.y - it.r > this.H) this.items.splice(i, 1);
      }
      if (this.inv > 0) this.inv -= dt;
      if (this.shakeT > 0) this.shakeT -= dt;
      this.fx.update(dt);
      if (result) this.running = false;
      return result;
    }

    collect(it) {
      const A = PM.audio;
      switch (it.kind) {
        case 'star':
          this.score += 1;
          A.play('star');
          this.fx.sparkles(it.x, it.y, 6, 20);
          this.pet.setExpr('giggle', 0.35);
          this.pet.squish(1.5);
          break;
        case 'coin':
          this.score += 1;
          this.coins += 1;
          A.play('coin');
          this.fx.sparkles(it.x, it.y, 8, 24);
          this.pet.setExpr('yum', 0.4);
          break;
        case 'heart':
          this.lives = Math.min(3, this.lives + 1);
          A.play('yum');
          this.fx.hearts(it.x, it.y, 3);
          this.pet.setExpr('love', 0.5);
          break;
        case 'cloud':
          if (this.inv > 0) break;
          this.lives -= 1;
          this.inv = 1.1;
          this.shakeT = 0.3;
          A.play('hurt');
          A.buzz(90);
          this.fx.poof(it.x, it.y);
          this.pet.setExpr('hurt', 0.7);
          this.pet.squish(4);
          if (this.lives <= 0) {
            this.pet.setExpr('dizzy', 5);
            return true;
          }
          break;
        default:
          break;
      }
      return false;
    }

    drawBackground(ctx) {
      const { W, H } = this;
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#7FCBFF');
      sky.addColorStop(1, '#E3F5FF');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      [[0.2, 0.18, 0.09], [0.28, 0.2, 0.07], [0.72, 0.32, 0.08], [0.8, 0.3, 0.06], [0.5, 0.52, 0.05]].forEach(([fx, fy, fr]) => {
        ctx.beginPath();
        ctx.arc(W * fx + Math.sin(this.t * 0.2 + fx * 9) * 8, H * fy, W * fr, 0, TAU);
        ctx.fill();
      });
      const gy = this.groundY();
      ctx.beginPath();
      ctx.moveTo(0, gy - 30);
      ctx.quadraticCurveTo(W * 0.3, gy - 80, W * 0.62, gy - 26);
      ctx.quadraticCurveTo(W * 0.85, gy - 60, W, gy - 34);
      ctx.lineTo(W, H);
      ctx.lineTo(0, H);
      ctx.closePath();
      ctx.fillStyle = '#6FC47C';
      ctx.fill();
      outline(ctx, 3);
      ctx.beginPath();
      ctx.moveTo(0, gy - 6);
      ctx.quadraticCurveTo(W * 0.5, gy - 24, W, gy - 4);
      ctx.lineTo(W, H);
      ctx.lineTo(0, H);
      ctx.closePath();
      ctx.fillStyle = '#8CD47E';
      ctx.fill();
      outline(ctx, 3);
    }

    drawItem(ctx, it) {
      ctx.save();
      ctx.translate(it.x, it.y);
      switch (it.kind) {
        case 'star':
          ctx.rotate(Math.sin(it.rot) * 0.3);
          starPath(ctx, 0, 0, it.r);
          ctx.fillStyle = '#FFC53D';
          ctx.fill();
          outline(ctx, 3);
          ctx.fillStyle = PM.INK;
          ctx.beginPath();
          ctx.arc(-it.r * 0.2, -it.r * 0.05, it.r * 0.08, 0, TAU);
          ctx.arc(it.r * 0.2, -it.r * 0.05, it.r * 0.08, 0, TAU);
          ctx.fill();
          break;
        case 'coin': {
          const sx = Math.max(0.2, Math.abs(Math.cos(it.rot)));
          ctx.scale(sx, 1);
          ctx.beginPath();
          ctx.arc(0, 0, it.r * 0.9, 0, TAU);
          ctx.fillStyle = '#FFC53D';
          ctx.fill();
          outline(ctx, 3);
          ctx.beginPath();
          ctx.arc(0, 0, it.r * 0.55, 0, TAU);
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = '#E09A10';
          ctx.stroke();
          break;
        }
        case 'heart':
          heartPath(ctx, 0, 0, it.r * 1.9);
          ctx.fillStyle = '#FF5DA2';
          ctx.fill();
          outline(ctx, 3);
          break;
        case 'cloud': {
          const r = it.r;
          ctx.beginPath();
          ctx.moveTo(-r * 0.6, r * 0.55);
          ctx.lineTo(-r * 0.2, r * 0.55);
          ctx.lineTo(-r * 0.35, r * 1.05);
          ctx.lineTo(r * 0.2, r * 0.45);
          ctx.fillStyle = '#FFE27A';
          ctx.fill();
          outline(ctx, 2.5);
          // Stroke every puff thick, then fill them all on top so only the
          // outer edge of the cloud keeps an outline.
          const puffs = [[-r * 0.5, r * 0.1, r * 0.5], [r * 0.5, r * 0.1, r * 0.48], [0, -r * 0.2, r * 0.62]];
          ctx.beginPath();
          puffs.forEach(([cx, cy, cr]) => { ctx.moveTo(cx + cr, cy); ctx.arc(cx, cy, cr, 0, TAU); });
          ctx.lineWidth = 6;
          ctx.strokeStyle = PM.INK;
          ctx.stroke();
          ctx.fillStyle = '#6E7396';
          ctx.fill();
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(-r * 0.32, -r * 0.18);
          ctx.lineTo(-r * 0.12, -r * 0.08);
          ctx.moveTo(r * 0.32, -r * 0.18);
          ctx.lineTo(r * 0.12, -r * 0.08);
          ctx.stroke();
          break;
        }
        default:
          break;
      }
      ctx.restore();
    }

    draw(ctx, s) {
      ctx.save();
      if (this.shakeT > 0) ctx.translate((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 6);
      this.drawBackground(ctx);
      for (const it of this.items) this.drawItem(ctx, it);
      ctx.save();
      if (this.inv > 0 && Math.floor(this.inv * 12) % 2 === 0) ctx.globalAlpha = 0.45;
      this.pet.draw(ctx, {
        species: s.species, color: s.color, hat: s.hat, size: this.petSize(),
        groundY: this.groundY(), clean: 100, sick: false, mood: 'happy',
      });
      ctx.restore();
      this.fx.draw(ctx);
      ctx.restore();
    }
  }

  /* ---------------- Bubble Pop ----------------
     Your pet blows bubbles; tap them before they float away. Quick pops in a
     row build a combo (up to x5). Rainbow bubbles are worth 5 and a coin;
     storm bubbles cost 3 seconds. 30 seconds per round. */

  class BubblePop {
    constructor() {
      this.pet = new PM.PetView();
      this.fx = new PM.Particles();
      this.running = false;
      this.W = 1;
      this.H = 1;
      this.bubbles = [];
      this.texts = [];
    }

    start(W, H) {
      this.W = W;
      this.H = H;
      this.bubbles = [];
      this.texts = [];
      this.score = 0;
      this.coins = 0;
      this.popped = 0;
      this.t = 0;
      this.time = 30;
      this.spawn = 0.2;
      this.combo = 1;
      this.comboT = 0;
      this.shakeT = 0;
      this.pet.x = W / 2;
      this.pet.scale = 1;
      this.fx.list = [];
      this.running = true;
    }

    resize(W, H) {
      const kx = W / this.W;
      const ky = H / this.H;
      this.bubbles.forEach((b) => { b.x *= kx; b.y *= ky; });
      this.pet.x *= kx;
      this.W = W;
      this.H = H;
    }

    groundY() { return this.H * 0.9; }

    petSize() { return Math.min(this.W * 0.28, this.H * 0.2, 140); }

    spawnBubble() {
      const roll = Math.random();
      const stormChance = 0.12 + Math.min(0.12, this.t * 0.005);
      const kind = roll < 0.08 ? 'rainbow' : roll < 0.08 + stormChance ? 'storm' : 'plain';
      const r = kind === 'plain' ? 17 + Math.random() * 17 : 22;
      // most bubbles come out of the pet's mouth area, the rest from anywhere
      const fromPet = Math.random() < 0.45;
      const x = fromPet ? this.pet.x + (Math.random() - 0.5) * 60 : r + Math.random() * (this.W - r * 2);
      this.bubbles.push({
        kind, r, x: Math.max(r, Math.min(this.W - r, x)),
        y: fromPet ? this.groundY() - this.petSize() * 0.6 : this.H + r,
        vy: -(55 + Math.random() * 50) * (1 + this.t / 35),
        sway: Math.random() * TAU,
      });
      if (fromPet) this.pet.setExpr('open', 0.25);
    }

    pointer(x, y, type) {
      if (!this.running || type !== 'down') return;
      for (let i = this.bubbles.length - 1; i >= 0; i--) {
        const b = this.bubbles[i];
        if (Math.hypot(x - b.x, y - b.y) <= b.r + 12) {
          this.pop(i);
          return;
        }
      }
      this.combo = 1; // a miss breaks the combo
      this.comboT = 0;
    }

    pop(i) {
      const b = this.bubbles.splice(i, 1)[0];
      const A = PM.audio;
      if (b.kind === 'storm') {
        this.time = Math.max(0, this.time - 3);
        this.combo = 1;
        this.comboT = 0;
        this.shakeT = 0.3;
        A.play('hurt');
        A.buzz(60);
        this.fx.poof(b.x, b.y);
        this.pet.setExpr('hurt', 0.6);
        this.texts.push({ x: b.x, y: b.y, text: '-3s', color: '#F0433A', t: 0 });
        return;
      }
      this.combo = this.comboT > 0 ? Math.min(5, this.combo + 1) : 1;
      this.comboT = 0.75;
      const pts = (b.kind === 'rainbow' ? 5 : 1) * this.combo;
      this.score += pts;
      this.popped += 1;
      if (b.kind === 'rainbow') {
        this.coins += 1;
        A.play('coin');
        this.pet.setExpr('love', 0.6);
        this.fx.sparkles(b.x, b.y, 10, b.r);
      } else {
        A.play('bubble');
        this.pet.setExpr('giggle', 0.3);
        this.fx.sparkles(b.x, b.y, 4, b.r);
      }
      A.buzz(6);
      const label = this.combo > 1 ? `+${pts} x${this.combo}` : `+${pts}`;
      this.texts.push({ x: b.x, y: b.y, text: label, color: b.kind === 'rainbow' ? '#FF5DA2' : PM.INK, t: 0 });
    }

    // Returns 'over' on the frame the round ends.
    update(dt) {
      this.pet.update(dt, { W: this.W, size: this.petSize(), canWander: false, stageScale: 1 });
      this.fx.update(dt);
      this.texts.forEach((t) => { t.t += dt; t.y -= 40 * dt; });
      this.texts = this.texts.filter((t) => t.t < 0.8);
      if (!this.running) return null;
      this.t += dt;
      this.time -= dt;
      if (this.shakeT > 0) this.shakeT -= dt;
      if (this.comboT > 0) {
        this.comboT -= dt;
        if (this.comboT <= 0) this.combo = 1;
      }
      this.spawn -= dt;
      if (this.spawn <= 0) {
        this.spawnBubble();
        this.spawn = Math.max(0.16, 0.48 - this.t * 0.008) * (0.6 + Math.random() * 0.8);
      }
      for (let i = this.bubbles.length - 1; i >= 0; i--) {
        const b = this.bubbles[i];
        b.sway += dt * 2;
        b.x += Math.sin(b.sway) * 20 * dt;
        b.y += b.vy * dt;
        if (b.y + b.r < -8) this.bubbles.splice(i, 1);
      }
      const last = this.bubbles[this.bubbles.length - 1];
      this.pet.lookAt = last ? { x: last.x, y: last.y } : null;
      if (this.time <= 0) {
        this.time = 0;
        this.running = false;
        this.pet.lookAt = null;
        this.pet.setExpr('yum', 4);
        return 'over';
      }
      return null;
    }

    drawBackground(ctx) {
      const { W, H } = this;
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#A8DFFF');
      g.addColorStop(1, '#E6F6FF');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      [[0.15, 0.2, 0.12], [0.85, 0.35, 0.09], [0.3, 0.6, 0.07], [0.7, 0.12, 0.05]].forEach(([fx, fy, fr]) => {
        ctx.beginPath();
        ctx.arc(W * fx, H * fy + Math.sin(this.t * 0.5 + fx * 7) * 6, W * fr, 0, TAU);
        ctx.fill();
      });
      // a bank of foam along the bottom
      const gy = this.groundY();
      ctx.beginPath();
      ctx.moveTo(0, H);
      ctx.lineTo(0, gy - 8);
      for (let x = 0; x <= W + 30; x += 30) {
        ctx.arc(x, gy - 4 + Math.sin(x * 0.3) * 4, 18, Math.PI, 0);
      }
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      outline(ctx, 3);
    }

    drawBubble(ctx, b) {
      ctx.save();
      ctx.translate(b.x, b.y);
      if (b.kind === 'storm') {
        ctx.beginPath();
        ctx.arc(0, 0, b.r, 0, TAU);
        ctx.fillStyle = '#6E7396';
        ctx.fill();
        outline(ctx, 3);
        ctx.strokeStyle = PM.INK;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(-b.r * 0.45, -b.r * 0.25);
        ctx.lineTo(-b.r * 0.15, -b.r * 0.1);
        ctx.moveTo(b.r * 0.45, -b.r * 0.25);
        ctx.lineTo(b.r * 0.15, -b.r * 0.1);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-b.r * 0.1, b.r * 0.15);
        ctx.lineTo(b.r * 0.12, b.r * 0.15);
        ctx.lineTo(-b.r * 0.05, b.r * 0.45);
        ctx.lineTo(b.r * 0.2, b.r * 0.35);
        ctx.strokeStyle = '#FFE27A';
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, b.r, 0, TAU);
        if (b.kind === 'rainbow') {
          const g = ctx.createLinearGradient(-b.r, -b.r, b.r, b.r);
          ['#FF8FB1', '#FFE27A', '#9FE7A6', '#8FCBFF', '#C3A6FF'].forEach((c, i) => g.addColorStop(i / 4, c));
          ctx.fillStyle = g;
          ctx.globalAlpha = 0.75;
          ctx.fill();
          ctx.globalAlpha = 1;
          outline(ctx, 3);
        } else {
          ctx.fillStyle = 'rgba(235,248,255,0.55)';
          ctx.fill();
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = '#4FA8DC';
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.ellipse(-b.r * 0.38, -b.r * 0.4, b.r * 0.22, b.r * 0.13, -0.6, 0, TAU);
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fill();
      }
      ctx.restore();
    }

    draw(ctx, s) {
      ctx.save();
      if (this.shakeT > 0) ctx.translate((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 6);
      this.drawBackground(ctx);
      this.pet.draw(ctx, {
        species: s.species, color: s.color, hat: s.hat, size: this.petSize(),
        groundY: this.groundY(), clean: 100, sick: false, mood: 'happy',
      });
      for (const b of this.bubbles) this.drawBubble(ctx, b);
      this.fx.draw(ctx);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const t of this.texts) {
        ctx.globalAlpha = t.t < 0.5 ? 1 : Math.max(0, 1 - (t.t - 0.5) / 0.3);
        ctx.font = `${t.text.length > 3 ? 18 : 20}px ${PM.FONT_DISPLAY}`;
        ctx.lineWidth = 5;
        ctx.strokeStyle = '#FFFFFF';
        ctx.strokeText(t.text, t.x, t.y);
        ctx.fillStyle = t.color;
        ctx.fillText(t.text, t.x, t.y);
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }
  }

  PM.StarCatch = StarCatch;
  PM.BubblePop = BubblePop;
})(window.PM = window.PM || {});
