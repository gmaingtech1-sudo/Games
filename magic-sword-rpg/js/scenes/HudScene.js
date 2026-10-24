// The on-screen display while exploring: health, magic, XP, gold, the quest
// tracker, the pause button, the joystick (or D-pad) and the action button.

class HudScene extends Phaser.Scene {
  constructor() {
    super('HudScene');
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;
    this.toasts = [];
    this.toastBusy = false;

    // ---- Top bar ----
    UI.panel(this, 12, 12, W - 24, 150, { alpha: 0.85 });
    this.levelText = UI.text(this, 70, 62, '', 26, UI.colors.gold, { bold: true });
    UI.text(this, 70, 100, 'LEVEL', 16, UI.colors.dim, { bold: true });
    this.hpBar = UI.bar(this, 130, 30, 330, 34, 0x3ccf5a, { prefix: 'HP ' });
    this.mpBar = UI.bar(this, 130, 72, 330, 28, 0x3f8cff, { prefix: 'MP ' });
    this.xpBar = UI.bar(this, 130, 110, 330, 24, 0xe0b23c, { prefix: 'XP ' });
    this.add.image(500, 50, 'coin');
    this.goldText = UI.text(this, 524, 50, '', 28, UI.colors.gold, { bold: true, originX: 0 });
    this.questText = UI.text(this, 30, 190, '', 24, UI.colors.text, { originX: 0, bold: true, stroke: '#000000', strokeThickness: 5 });

    // Pause button
    const pause = UI.button(this, W - 70, 70, 96, 96, '', () => Bus.emit('pause'));
    const icon = this.add.graphics();
    icon.fillStyle(0xffffff, 1);
    icon.fillRoundedRect(-18, -22, 12, 44, 3);
    icon.fillRoundedRect(6, -22, 12, 44, 3);
    pause.add(icon);

    // ---- Movement controls and action button ----
    this.controlsLayer = null;
    this.joyPointer = null;
    this.dpadHeld = {};
    this.buildControls();
    this.input.on('pointermove', (p) => this.onPointerMove(p));
    this.input.on('pointerup', (p) => this.onPointerUp(p));
    this.input.on('gameout', () => this.resetControls());

    this.actionX = W - 150;
    this.actionY = H - 200;
    this.actionBtn = this.add.graphics();
    this.actionLabel = UI.text(this, this.actionX, this.actionY, '', 30, '#ffffff', { bold: true });
    const actionZone = this.add.zone(this.actionX, this.actionY, 180, 180).setInteractive();
    actionZone.on('pointerdown', () => {
      this.actionPressed = true;
      Sound.play('click');
      Bus.emit('action');
    });
    actionZone.on('pointerup', () => (this.actionPressed = false));
    actionZone.on('pointerout', () => (this.actionPressed = false));
    this.lastAction = null;

    Bus.on('toast', this.toast, this);
    this.events.once('shutdown', () => Bus.off('toast', this.toast, this));
    if (!this.hooked) {
      this.hooked = true;
      // Coming back from a dialog, battle or menu: let go of the joystick and
      // pick up any change of controls in Settings.
      const refresh = () => {
        this.resetControls();
        if (this.controlMode !== Settings.data.controls) this.buildControls();
      };
      this.events.on('resume', refresh);
      this.events.on('wake', refresh);
    }
  }

  // ---- Joystick or D-pad --------------------------------------------------

  buildControls() {
    if (this.controlsLayer) this.controlsLayer.destroy();
    this.resetControls();
    this.controlMode = Settings.data.controls;
    this.controlsLayer = this.add.container(0, 0);
    if (this.controlMode === 'dpad') this.buildDpad();
    else this.buildJoystick();
  }

  buildJoystick() {
    const H = this.scale.height;
    const cx = 160;
    const cy = H - 200;
    const R = 105;
    this.joy = { cx, cy, R };
    const base = this.add.graphics();
    base.fillStyle(UI.colors.panelEdge, 0.12);
    base.fillCircle(cx, cy, R + 14);
    base.fillStyle(0x0d1638, 0.6);
    base.fillCircle(cx, cy, R);
    base.lineStyle(4, UI.colors.panelEdge, 0.8);
    base.strokeCircle(cx, cy, R);
    this.thumb = this.add.circle(cx, cy, 46, 0x2f62d6, 0.95).setStrokeStyle(4, 0x8fd3ff);
    const zone = this.add.zone(cx, cy, R * 2.8, R * 2.8).setInteractive();
    zone.on('pointerdown', (p) => {
      this.joyPointer = p.id;
      this.moveJoystick(p);
    });
    this.controlsLayer.add([base, this.thumb, zone]);
  }

  moveJoystick(p) {
    const { cx, cy, R } = this.joy;
    let dx = p.x - cx;
    let dy = p.y - cy;
    const len = Math.hypot(dx, dy);
    if (len > R) {
      dx = (dx / len) * R;
      dy = (dy / len) * R;
    }
    this.thumb.setPosition(cx + dx, cy + dy);
    const f = Math.hypot(dx, dy) / R;
    // A small dead zone in the middle stops Leo drifting.
    Controls.x = f < 0.2 ? 0 : dx / R;
    Controls.y = f < 0.2 ? 0 : dy / R;
  }

  buildDpad() {
    const H = this.scale.height;
    const cx = 170;
    const cy = H - 200;
    const S = 100;
    const dirs = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    const arrows = { up: '▲', down: '▼', left: '◀', right: '▶' };
    for (const dir in dirs) {
      const [dx, dy] = dirs[dir];
      const x = cx + dx * (S + 4);
      const y = cy + dy * (S + 4);
      const g = this.add.graphics();
      const draw = (on) => {
        g.clear();
        g.fillStyle(on ? 0x2f62d6 : 0x1d3f9a, 0.9);
        g.fillRoundedRect(x - S / 2, y - S / 2, S, S, 16);
        g.lineStyle(3, 0x8fd3ff, 1);
        g.strokeRoundedRect(x - S / 2, y - S / 2, S, S, 16);
      };
      draw(false);
      const label = UI.text(this, x, y, arrows[dir], 36, '#ffffff');
      const zone = this.add.zone(x, y, S + 8, S + 8).setInteractive();
      zone.on('pointerdown', (p) => {
        this.dpadHeld[dir] = p.id;
        draw(true);
        this.updateDpad();
      });
      zone.on('pointerout', (p) => {
        if (this.dpadHeld[dir] === p.id) {
          delete this.dpadHeld[dir];
          draw(false);
          this.updateDpad();
        }
      });
      zone.dirName = dir;
      zone.redraw = draw;
      this.controlsLayer.add([g, label, zone]);
    }
  }

  updateDpad() {
    const h = this.dpadHeld;
    Controls.x = (h.right !== undefined ? 1 : 0) - (h.left !== undefined ? 1 : 0);
    Controls.y = (h.down !== undefined ? 1 : 0) - (h.up !== undefined ? 1 : 0);
  }

  onPointerMove(p) {
    if (this.controlMode === 'joystick' && p.id === this.joyPointer && p.isDown) this.moveJoystick(p);
  }

  onPointerUp(p) {
    if (p.id === this.joyPointer) {
      this.joyPointer = null;
      if (this.thumb) this.thumb.setPosition(this.joy.cx, this.joy.cy);
      Controls.x = 0;
      Controls.y = 0;
    }
    let changed = false;
    for (const dir in this.dpadHeld) {
      if (this.dpadHeld[dir] === p.id) {
        delete this.dpadHeld[dir];
        changed = true;
      }
    }
    if (changed) {
      if (this.controlsLayer) this.controlsLayer.each((o) => o.redraw && o.redraw(this.dpadHeld[o.dirName] !== undefined));
      this.updateDpad();
    }
  }

  resetControls() {
    Controls.x = 0;
    Controls.y = 0;
    this.joyPointer = null;
    if (this.thumb && this.joy) this.thumb.setPosition(this.joy.cx, this.joy.cy);
    this.dpadHeld = {};
    if (this.controlsLayer) this.controlsLayer.each((o) => o.redraw && o.redraw(false));
  }

  // ---- Every frame --------------------------------------------------------

  update() {
    const d = State.data;
    const st = State.stats();
    this.levelText.setText(String(d.level));
    this.hpBar.set(d.hp, st.maxHp);
    this.mpBar.set(d.mp, st.maxMp);
    this.xpBar.set(d.xp, State.xpToNext());
    this.goldText.setText(String(d.gold));

    const active = Object.keys(QUESTS).find((id) => ['active', 'ready'].includes(State.questStatus(id)));
    if (active) {
      const p = State.questProgress(active);
      this.questText.setText(State.questStatus(active) === 'ready' ? 'Quest: ' + QUESTS[active].name + ' (hand it in!)' : 'Quest: ' + QUESTS[active].name + '  ' + p.have + '/' + p.need);
    } else {
      this.questText.setText('');
    }

    const world = this.scene.get('WorldScene');
    const target = world && world.target;
    const label = target ? target.label() : 'Action';
    const key = label + (target ? '1' : '0') + (this.actionPressed ? 'p' : '');
    if (key !== this.lastAction) {
      this.lastAction = key;
      const g = this.actionBtn;
      g.clear();
      g.fillStyle(UI.colors.panelEdge, target ? 0.25 : 0.08);
      g.fillCircle(this.actionX, this.actionY, 96);
      g.fillStyle(target ? (this.actionPressed ? 0x2f62d6 : 0x1d3f9a) : 0x2a3150, 0.95);
      g.fillCircle(this.actionX, this.actionY, 82);
      g.lineStyle(4, target ? 0x8fd3ff : 0x4a5378, 1);
      g.strokeCircle(this.actionX, this.actionY, 82);
      this.actionLabel.setText(label);
      this.actionLabel.setColor(target ? '#ffffff' : '#7d88aa');
    }
  }

  // ---- Little messages at the top of the screen ---------------------------

  toast(message) {
    this.toasts.push(message);
    if (!this.toastBusy) this.nextToast();
  }

  nextToast() {
    const message = this.toasts.shift();
    if (!message) {
      this.toastBusy = false;
      return;
    }
    this.toastBusy = true;
    const W = this.scale.width;
    const t = UI.text(this, W / 2, 270, message, 28, '#ffffff', { bold: true, wrap: W - 120 });
    const bg = this.add.graphics();
    bg.fillStyle(0x0d1638, 0.92);
    bg.fillRoundedRect(W / 2 - t.width / 2 - 24, 270 - t.height / 2 - 14, t.width + 48, t.height + 28, 16);
    bg.lineStyle(3, 0x5fb8ff, 1);
    bg.strokeRoundedRect(W / 2 - t.width / 2 - 24, 270 - t.height / 2 - 14, t.width + 48, t.height + 28, 16);
    t.setDepth(1);
    this.tweens.add({
      targets: [t, bg], alpha: 0, delay: 1800, duration: 400,
      onComplete: () => {
        t.destroy();
        bg.destroy();
        this.nextToast();
      },
    });
  }
}
