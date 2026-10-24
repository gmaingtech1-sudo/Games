// Shared interface pieces: buttons, panels, bars, the magical background.

// Messages between screens (for example, the HUD's action button).
const Bus = new Phaser.Events.EventEmitter();

// Which way the on-screen joystick or D-pad is pushed, from -1 to 1.
const Controls = { x: 0, y: 0 };

const UI = {
  font: '"Trebuchet MS", "Segoe UI", Roboto, sans-serif',
  titleFont: 'Georgia, "Times New Roman", serif',
  colors: {
    text: '#eaf2ff',
    dim: '#9fb0d8',
    gold: '#ffd86b',
    good: '#8ce08a',
    bad: '#ff7a7a',
    blue: '#7cc8ff',
    panel: 0x0d1638,
    panelEdge: 0x5fb8ff,
    button: 0x1d3f9a,
    buttonTop: 0x2f62d6,
    buttonEdge: 0x8fd3ff,
    disabled: 0x2a3150,
  },

  text(scene, x, y, str, size, color, opts) {
    const o = opts || {};
    const style = {
      fontFamily: o.title ? UI.titleFont : UI.font,
      fontSize: (size || 28) + 'px',
      color: color || UI.colors.text,
      align: o.align || 'center',
      fontStyle: o.bold ? 'bold' : 'normal',
      lineSpacing: o.lineSpacing || 6,
    };
    if (o.wrap) style.wordWrap = { width: o.wrap, useAdvancedWrap: true };
    if (o.stroke) {
      style.stroke = o.stroke;
      style.strokeThickness = o.strokeThickness || 6;
    }
    const t = scene.add.text(x, y, str, style);
    t.setOrigin(o.originX !== undefined ? o.originX : 0.5, o.originY !== undefined ? o.originY : 0.5);
    return t;
  },

  // A rounded panel with a glowing blue edge.
  panel(scene, x, y, w, h, opts) {
    const o = opts || {};
    const g = scene.add.graphics();
    g.fillStyle(o.glow || UI.colors.panelEdge, 0.18);
    g.fillRoundedRect(x - 6, y - 6, w + 12, h + 12, 22);
    g.fillStyle(o.color || UI.colors.panel, o.alpha !== undefined ? o.alpha : 0.94);
    g.fillRoundedRect(x, y, w, h, 18);
    g.lineStyle(3, o.edge || UI.colors.panelEdge, 0.9);
    g.strokeRoundedRect(x, y, w, h, 18);
    return g;
  },

  // A big touch-friendly button. Fires onClick when the finger lifts.
  button(scene, x, y, w, h, label, onClick, opts) {
    const o = opts || {};
    const c = scene.add.container(x, y);
    const bg = scene.add.graphics();
    const txt = UI.text(scene, 0, 0, label, o.size || 30, UI.colors.text, { bold: true, wrap: w - 20 });
    const zone = scene.add.zone(0, 0, w, h).setInteractive({ useHandCursor: true });
    c.add([bg, txt, zone]);
    c.enabled = true;
    c.pressed = false;
    c.label = txt;

    const draw = () => {
      bg.clear();
      const base = c.enabled ? (o.color || UI.colors.button) : UI.colors.disabled;
      const top = c.enabled ? (o.topColor || UI.colors.buttonTop) : UI.colors.disabled;
      if (c.enabled) {
        bg.fillStyle(o.edge || UI.colors.buttonEdge, c.pressed ? 0.35 : 0.18);
        bg.fillRoundedRect(-w / 2 - 5, -h / 2 - 5, w + 10, h + 10, 20);
      }
      bg.fillStyle(base, 1);
      bg.fillRoundedRect(-w / 2, -h / 2, w, h, 16);
      bg.fillStyle(top, c.pressed ? 0.6 : 1);
      bg.fillRoundedRect(-w / 2 + 4, -h / 2 + 4, w - 8, h / 2 - 2, { tl: 12, tr: 12, bl: 4, br: 4 });
      bg.lineStyle(3, c.enabled ? (o.edge || UI.colors.buttonEdge) : 0x4a5378, 1);
      bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 16);
      txt.setColor(c.enabled ? UI.colors.text : '#7d88aa');
      c.setScale(c.pressed ? 0.96 : 1);
    };

    zone.on('pointerdown', () => {
      if (!c.enabled) return;
      c.pressed = true;
      draw();
    });
    zone.on('pointerout', () => {
      c.pressed = false;
      draw();
    });
    zone.on('pointerup', () => {
      if (!c.pressed) return;
      c.pressed = false;
      draw();
      if (!c.enabled) return;
      Sound.play('click');
      onClick();
    });

    c.setEnabled = (on) => {
      c.enabled = !!on;
      c.pressed = false;
      draw();
      return c;
    };
    c.setLabel = (s) => {
      txt.setText(s);
      return c;
    };
    draw();
    return c;
  },

  // A health/magic/XP bar. Call bar.set(value, max).
  bar(scene, x, y, w, h, color, opts) {
    const o = opts || {};
    const g = scene.add.graphics();
    const label = o.label === false ? null : UI.text(scene, x + w / 2, y + h / 2, '', o.size || Math.max(16, h - 8), '#ffffff', { bold: true, stroke: '#000000', strokeThickness: 4 });
    const bar = { g, label, value: -1, max: -1 };
    bar.set = (value, max) => {
      if (value === bar.value && max === bar.max) return;
      bar.value = value;
      bar.max = max;
      const f = Math.max(0, Math.min(1, value / max));
      g.clear();
      g.fillStyle(0x000000, 0.55);
      g.fillRoundedRect(x, y, w, h, h / 2);
      if (f > 0) {
        g.fillStyle(color, 1);
        g.fillRoundedRect(x, y, Math.max(h, w * f), h, h / 2);
        g.fillStyle(0xffffff, 0.25);
        g.fillRoundedRect(x + 3, y + 2, Math.max(h, w * f) - 6, h / 3, h / 6);
      }
      g.lineStyle(2, 0xffffff, 0.35);
      g.strokeRoundedRect(x, y, w, h, h / 2);
      if (label) label.setText((o.prefix || '') + Math.max(0, Math.round(value)) + ' / ' + max);
    };
    bar.setDepth = (d) => {
      g.setDepth(d);
      if (label) label.setDepth(d + 1);
    };
    return bar;
  },

  // Night sky with floating blue sparks: the magical background for menus.
  backdrop(scene) {
    const W = scene.scale.width;
    const H = scene.scale.height;
    scene.add.image(W / 2, H / 2, 'night').setDisplaySize(W, H);
    UI.sparkles(scene, W, H);
  },

  sparkles(scene, W, H) {
    return scene.add.particles(0, 0, 'spark', {
      x: { min: 0, max: W },
      y: { min: H * 0.2, max: H },
      lifespan: 4000,
      speedY: { min: -40, max: -15 },
      speedX: { min: -10, max: 10 },
      scale: { start: 0.7, end: 0 },
      alpha: { start: 0.9, end: 0 },
      frequency: 160,
      blendMode: 'ADD',
    });
  },

  // A darkened screen behind a pop-up. Blocks taps on what's underneath.
  dim(scene, alpha) {
    const W = scene.scale.width;
    const H = scene.scale.height;
    return scene.add.rectangle(W / 2, H / 2, W, H, 0x020414, alpha === undefined ? 0.7 : alpha).setInteractive();
  },

  // Words that float up and fade, for damage numbers and rewards.
  floatText(scene, x, y, str, color, size) {
    const t = UI.text(scene, x, y, str, size || 40, color || '#ffffff', { bold: true, stroke: '#000000', strokeThickness: 6 });
    t.setDepth(1000);
    scene.tweens.add({ targets: t, y: y - 80, alpha: 0, duration: 1100, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
    return t;
  },
};
