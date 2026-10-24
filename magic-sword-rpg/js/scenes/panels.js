// Full-screen panels opened from the main menu or the pause menu:
// Inventory, Skills, Quests, Character and Settings.
// Each one has a Back button that returns to wherever it was opened from.

class PanelScene extends Phaser.Scene {
  init(data) {
    this.from = (data && data.from) || 'MenuScene';
    this.panelData = data || {};
  }

  frame(title) {
    const W = this.scale.width;
    const H = this.scale.height;
    UI.backdrop(this);
    this.add.rectangle(W / 2, H / 2, W, H, 0x020414, 0.35).setInteractive();
    UI.text(this, W / 2, 70, title, 56, '#e6f4ff', { title: true, bold: true, stroke: '#1d3f9a', strokeThickness: 8 });
    UI.button(this, W / 2, H - 80, 400, 100, 'Back', () => this.close(), { size: 34 });
  }

  // Redraws the panel after something changed.
  redraw(extra) {
    this.scene.restart(Object.assign({ from: this.from }, extra || {}));
  }

  close() {
    this.scene.stop();
    this.scene.wake(this.from);
  }

  // A heading with a thin line under it.
  heading(y, label) {
    const W = this.scale.width;
    UI.text(this, 40, y, label, 30, UI.colors.blue, { bold: true, originX: 0, title: true });
    const g = this.add.graphics();
    g.lineStyle(2, UI.colors.panelEdge, 0.5);
    g.lineBetween(40, y + 26, W - 40, y + 26);
  }
}

// ---- Inventory ------------------------------------------------------------

class InventoryScene extends PanelScene {
  constructor() {
    super('InventoryScene');
  }

  create() {
    const W = this.scale.width;
    const d = State.data;
    const st = State.stats();
    this.frame('Inventory');

    this.add.image(W / 2 - 60, 140, 'coin').setScale(1.2);
    UI.text(this, W / 2 - 34, 140, d.gold + ' gold', 32, UI.colors.gold, { bold: true, originX: 0 });

    let y = 200;
    this.heading(y, 'Items');
    y += 70;
    const items = Object.keys(d.inventory).filter((id) => ITEMS[id] && d.inventory[id] > 0);
    if (!items.length) {
      UI.text(this, W / 2, y + 10, 'Your bag is empty.', 26, UI.colors.dim);
      y += 70;
    }
    for (const id of items) {
      const item = ITEMS[id];
      UI.panel(this, 30, y - 10, W - 60, 110, { alpha: 0.8 });
      this.add.image(84, y + 45, item.icon).setScale(1.1);
      UI.text(this, 130, y + 25, item.name + '  ×' + d.inventory[id], 28, '#ffffff', { bold: true, originX: 0 });
      UI.text(this, 130, y + 62, item.description, 22, UI.colors.dim, { originX: 0, align: 'left', wrap: 360 });
      if (item.usable) {
        const full = d.hp >= st.maxHp;
        UI.button(this, W - 120, y + 45, 160, 76, full ? 'Full HP' : 'Use', () => {
          const healed = State.usePotion();
          if (healed) {
            Sound.play('heal');
            State.save();
          }
          this.redraw();
        }, { size: 26 }).setEnabled(!full);
      }
      y += 128;
    }

    y += 10;
    this.heading(y, 'Swords');
    y += 70;
    for (const id of d.weapons) {
      const w = WEAPONS[id];
      const equipped = d.equipped === id;
      UI.panel(this, 30, y - 10, W - 60, 156, { alpha: 0.8, edge: equipped ? 0xffd86b : UI.colors.panelEdge });
      this.add.image(80, y + 68, 'sword_' + id).setScale(0.9).setAngle(30);
      UI.text(this, 130, y + 20, w.name, 28, '#ffffff', { bold: true, originX: 0 });
      UI.text(this, 130, y + 54, 'Damage ' + w.damage, 24, UI.colors.gold, { originX: 0 });
      UI.text(this, 130, y + 74, w.ability ? w.ability.text : w.description, 20, UI.colors.dim, { originX: 0, originY: 0, align: 'left', wrap: 360, lineSpacing: 2 });
      UI.button(this, W - 120, y + 68, 160, 76, equipped ? 'Equipped' : 'Equip', () => {
        State.equip(id);
        State.save();
        this.redraw();
      }, { size: 26 }).setEnabled(!equipped);
      y += 174;
    }
  }
}

// ---- Skills ---------------------------------------------------------------

class SkillsScene extends PanelScene {
  constructor() {
    super('SkillsScene');
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;
    const d = State.data;
    this.frame('Skills');
    this.selected = this.panelData.selected || 'sword_1';

    UI.text(this, W / 2, 140, 'Skill points: ' + d.skillPoints, 32, d.skillPoints > 0 ? UI.colors.gold : UI.colors.dim, { bold: true });
    UI.text(this, W / 2, 182, 'You earn a point every time you level up.', 22, UI.colors.dim);

    const colW = (W - 40) / 4;
    const cardW = colW - 14;
    const cardH = 170;
    const lines = this.add.graphics();
    SKILL_BRANCHES.forEach((branch, col) => {
      const x = 20 + colW * col + colW / 2;
      UI.text(this, x, 240, branch.name, 28, '#' + branch.color.toString(16).padStart(6, '0'), { bold: true, title: true });
      lines.lineStyle(4, branch.color, 0.6);
      lines.lineBetween(x, 280 + cardH, x, 320 + cardH);
      const skills = Object.keys(SKILLS).filter((id) => SKILLS[id].branch === branch.id).sort((a, b) => SKILLS[a].tier - SKILLS[b].tier);
      skills.forEach((id, row) => this.card(id, x, 280 + cardH / 2 + row * (cardH + 40), cardW, cardH, branch.color));
    });

    // Details of the selected skill
    const skill = SKILLS[this.selected];
    const top = 280 + 2 * (cardH + 40) + 10;
    const boxH = Math.max(220, H - 140 - top - 20);
    UI.panel(this, 30, top, W - 60, boxH);
    UI.text(this, 60, top + 40, skill.name, 32, '#ffffff', { bold: true, originX: 0, title: true });
    UI.text(this, 60, top + 80, skill.text, 26, UI.colors.text, { originX: 0, originY: 0, align: 'left', wrap: W - 120 });
    const reason = State.whyCantLearn(this.selected);
    const learned = d.skills.includes(this.selected);
    UI.text(this, 60, top + boxH - 50, learned ? 'Learned' : reason || 'Costs 1 skill point.', 24, learned ? UI.colors.good : reason ? UI.colors.bad : UI.colors.gold, { originX: 0, wrap: 300, align: 'left' });
    UI.button(this, W - 150, top + boxH - 56, 200, 84, learned ? 'Learned' : 'Learn', () => {
      if (State.learnSkill(this.selected)) {
        Sound.play('levelup');
        State.save();
      }
      this.redraw({ selected: this.selected });
    }, { size: 28 }).setEnabled(!reason);
  }

  card(id, x, y, w, h, color) {
    const skill = SKILLS[id];
    const d = State.data;
    const learned = d.skills.includes(id);
    const available = !State.whyCantLearn(id);
    const selected = this.selected === id;
    let status = 'Can learn';
    if (learned) status = '✔ Learned';
    else if (skill.minLevel && d.level < skill.minLevel) status = 'Level ' + skill.minLevel;
    else if (skill.requires && !d.skills.includes(skill.requires)) status = 'Locked';
    else if (!available) status = 'Need 1 point';
    const g = this.add.graphics();
    g.fillStyle(learned ? 0x1f4a7a : available ? 0x1d2f6a : 0x141a33, 0.95);
    g.fillRoundedRect(x - w / 2, y - h / 2, w, h, 14);
    g.lineStyle(selected ? 5 : 2, selected ? 0xffd86b : color, learned || available || selected ? 1 : 0.4);
    g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 14);
    UI.text(this, x, y - 30, skill.name, 22, learned || available ? '#ffffff' : '#7d88aa', { bold: true, wrap: w - 12 });
    UI.text(this, x, y + 40, status, 20,
      learned ? UI.colors.good : available ? UI.colors.gold : UI.colors.dim);
    this.add.zone(x, y, w, h).setInteractive().on('pointerup', () => {
      Sound.play('click');
      this.redraw({ selected: id });
    });
  }
}

// ---- Quests ---------------------------------------------------------------

class QuestsScene extends PanelScene {
  constructor() {
    super('QuestsScene');
  }

  create() {
    const W = this.scale.width;
    this.frame('Quests');
    let y = 140;
    const labels = {
      active: ['In progress', UI.colors.blue],
      ready: ['Ready to hand in!', UI.colors.gold],
      done: ['Complete', UI.colors.good],
    };
    const known = Object.keys(QUESTS).filter((id) => State.questStatus(id) !== 'new');
    const rumours = Object.keys(QUESTS).filter((id) => State.questStatus(id) === 'new');

    if (!known.length) {
      UI.text(this, W / 2, y + 30, 'No quests yet.', 30, UI.colors.dim);
      y += 80;
    }
    // Unfinished quests first.
    known.sort((a, b) => (State.questStatus(a) === 'done') - (State.questStatus(b) === 'done'));
    for (const id of known) {
      const q = QUESTS[id];
      const status = State.questStatus(id);
      const p = State.questProgress(id);
      const desc = UI.text(this, 60, y + 70, q.description, 22, UI.colors.text, { originX: 0, originY: 0, align: 'left', wrap: W - 120 });
      const h = 70 + desc.height + 70;
      UI.panel(this, 30, y, W - 60, h, { alpha: 0.85, edge: status === 'done' ? 0x8ce08a : status === 'ready' ? 0xffd86b : UI.colors.panelEdge });
      desc.setDepth(1);
      UI.text(this, 60, y + 36, q.name, 30, '#ffffff', { bold: true, originX: 0, title: true }).setDepth(1);
      UI.text(this, W - 60, y + 36, labels[status][0], 22, labels[status][1], { bold: true, originX: 1 }).setDepth(1);
      const progress = q.goal.type === 'defeat' ? 'Defeated: ' + p.have + ' / ' + p.need : p.have ? 'Found!' : 'Not found yet';
      UI.text(this, 60, y + h - 34, (status === 'done' ? '' : progress + '   ·   ') + 'Reward: ' + describeLoot(q.reward), 20, UI.colors.gold, { originX: 0, align: 'left', wrap: W - 120 }).setDepth(1);
      y += h + 20;
    }

    if (rumours.length) {
      y += 10;
      this.heading(y, 'Rumours');
      y += 60;
      for (const id of rumours) {
        UI.text(this, 60, y, '•  ' + QUESTS[id].hint, 24, UI.colors.dim, { originX: 0, align: 'left', wrap: W - 120 });
        y += 50;
      }
    }
  }
}

// ---- Character ------------------------------------------------------------

class CharacterScene extends PanelScene {
  constructor() {
    super('CharacterScene');
  }

  create() {
    const W = this.scale.width;
    const d = State.data;
    const st = State.stats();
    this.frame('Character');

    const glow = this.add.image(150, 290, 'spark').setScale(7).setAlpha(0.4).setBlendMode('ADD');
    this.tweens.add({ targets: glow, alpha: 0.7, duration: 1200, yoyo: true, repeat: -1 });
    this.add.image(150, 290, 'leo').setScale(1.6);
    UI.text(this, 290, 180, d.name, 40, '#ffffff', { bold: true, originX: 0, title: true });
    UI.text(this, 290, 228, 'Level ' + d.level + ' hero of Ashbrook', 26, UI.colors.gold, { originX: 0 });
    UI.text(this, 290, 268, 'Dark blue hair, a brave heart.', 22, UI.colors.dim, { originX: 0 });
    UI.text(this, 290, 312, 'XP to next level', 20, UI.colors.dim, { originX: 0 });
    UI.bar(this, 290, 330, W - 330, 30, 0xe0b23c).set(d.xp, State.xpToNext());

    const rows = [
      ['Health', d.hp + ' / ' + st.maxHp],
      ['Magic', d.mp + ' / ' + st.maxMp],
      ['Sword', st.weapon.name],
      ['Attack', String(st.attack)],
      ['Spell damage', st.magic + '  (costs ' + st.magicCost + ' MP)'],
      ['Gold', String(d.gold)],
      ['Skill points', String(d.skillPoints)],
      ['Skills learned', String(d.skills.length)],
      ['Quests completed', String(State.completedQuests().length)],
      ['Monsters defeated', String(Object.values(d.defeated).reduce((a, b) => a + b, 0))],
    ];
    let y = 430;
    UI.panel(this, 30, y - 30, W - 60, rows.length * 52 + 30, { alpha: 0.85 });
    for (const [label, value] of rows) {
      UI.text(this, 60, y, label, 26, UI.colors.dim, { originX: 0 });
      UI.text(this, W - 60, y, value, 26, '#ffffff', { originX: 1, bold: true });
      y += 52;
    }
    UI.text(this, W / 2, y + 40, "Grandfather's Magic Sword still sleeps. Its power will wake later in Leo's journey.", 22, UI.colors.blue, { wrap: W - 100 });
  }
}

// ---- Settings -------------------------------------------------------------

class SettingsScene extends PanelScene {
  constructor() {
    super('SettingsScene');
  }

  create() {
    const W = this.scale.width;
    const s = Settings.data;
    this.frame('Settings');

    const change = (fn) => () => {
      fn();
      Settings.save();
      Sound.applySettings();
      this.redraw();
    };
    let y = 190;
    const row = (label, value, fn) => {
      UI.text(this, 50, y, label, 30, '#ffffff', { originX: 0, bold: true });
      UI.button(this, W - 150, y, 220, 88, value, change(fn), { size: 28 });
      y += 120;
    };
    row('Sound effects', s.sound ? 'On' : 'Off', () => (s.sound = !s.sound));
    row('Music', s.music ? 'On' : 'Off', () => (s.music = !s.music));

    UI.text(this, 50, y, 'Volume', 30, '#ffffff', { originX: 0, bold: true });
    UI.button(this, W - 290, y, 88, 88, '−', change(() => (s.volume = Math.max(0, Math.round((s.volume - 0.1) * 10) / 10))), { size: 40 });
    UI.text(this, W - 192, y, Math.round(s.volume * 100) + '%', 30, UI.colors.gold, { bold: true });
    UI.button(this, W - 50 - 44, y, 88, 88, '+', change(() => (s.volume = Math.min(1, Math.round((s.volume + 0.1) * 10) / 10))), { size: 40 });
    y += 120;

    row('Controls', s.controls === 'dpad' ? 'D-pad' : 'Joystick', () => (s.controls = s.controls === 'dpad' ? 'joystick' : 'dpad'));

    y += 20;
    UI.button(this, W / 2, y, W - 120, 96, 'Start a new game', () => this.confirmReset(), { size: 30, color: 0x7a1f3a, topColor: 0xa83255, edge: 0xff9aa8 });
    y += 90;
    UI.text(this, W / 2, y, 'This deletes your saved hero.', 22, UI.colors.dim);
  }

  confirmReset() {
    const W = this.scale.width;
    const H = this.scale.height;
    const layer = this.add.container(0, 0);
    layer.add(UI.dim(this, 0.8));
    layer.add(UI.panel(this, 50, H / 2 - 220, W - 100, 440));
    layer.add(UI.text(this, W / 2, H / 2 - 150, 'Start over?', 44, '#ffffff', { bold: true, title: true }));
    layer.add(UI.text(this, W / 2, H / 2 - 70, 'Your level, gold, items, skills and quests will be lost.', 26, UI.colors.text, { wrap: W - 180 }));
    layer.add(UI.button(this, W / 2, H / 2 + 40, W - 180, 92, 'Yes, start a new game', () => this.reset(), { size: 28, color: 0x7a1f3a, topColor: 0xa83255 }));
    layer.add(UI.button(this, W / 2, H / 2 + 150, W - 180, 92, 'Cancel', () => layer.destroy(), { size: 28 }));
  }

  reset() {
    State.reset();
    // Close everything and go back to the main menu.
    for (const key of ['PauseScene', 'HudScene', 'WorldScene', 'MenuScene']) this.scene.stop(key);
    this.scene.start('MenuScene');
  }
}
