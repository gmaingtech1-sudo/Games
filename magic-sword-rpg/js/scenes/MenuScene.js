// The main menu: Play, Inventory, Skills, Quests, Character, Settings.

class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene');
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;
    UI.backdrop(this);
    Sound.music('menu');

    UI.text(this, W / 2, H * 0.1, 'MAGIC SWORD', 84, '#e6f4ff', { title: true, bold: true, stroke: '#1d3f9a', strokeThickness: 10 });
    UI.text(this, W / 2, H * 0.1 + 70, 'A tale of the world of Embers', 28, UI.colors.blue, { title: true });

    // The glowing sword
    const swordY = (H * 0.1 + 100 + H * 0.41 - 30) / 2; // between the title and the save line
    const glow = this.add.image(W / 2, swordY, 'spark').setScale(9).setAlpha(0.35).setBlendMode('ADD');
    this.tweens.add({ targets: glow, alpha: 0.6, scale: 10, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    const sword = this.add.image(W / 2, swordY, 'sword_magic_sword').setScale(1.6);
    this.tweens.add({ targets: sword, y: swordY - 12, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    const d = State.data;
    const info = State.hasSave()
      ? d.name + '  ·  Level ' + d.level + '  ·  ' + d.gold + ' gold'
      : 'A new adventure awaits';
    UI.text(this, W / 2, H * 0.41, info, 28, UI.colors.gold);

    const playY = H * 0.41 + 100;
    UI.button(this, W / 2, playY, 540, 120, State.data.started ? 'Play  (continue)' : 'Play', () => this.play(), { size: 44 });

    const open = (key) => () => {
      this.scene.launch(key, { from: 'MenuScene' });
      this.scene.sleep();
    };
    // Spread the buttons out on taller phones.
    const gap = Phaser.Math.Clamp((H - 110 - playY) / 3.6, 125, 165);
    const rowY = playY + gap + 25;
    UI.button(this, W / 2 - 160, rowY, 300, 104, 'Inventory', open('InventoryScene'));
    UI.button(this, W / 2 + 160, rowY, 300, 104, 'Skills', open('SkillsScene'));
    UI.button(this, W / 2 - 160, rowY + gap, 300, 104, 'Quests', open('QuestsScene'));
    UI.button(this, W / 2 + 160, rowY + gap, 300, 104, 'Character', open('CharacterScene'));
    UI.button(this, W / 2, rowY + gap * 2, 620, 104, 'Settings', open('SettingsScene'));

    UI.text(this, W / 2, H - 40, 'Version ' + CONFIG.version + '  ·  progress saves on this phone', 22, UI.colors.dim);

    // Coming back from a panel: refresh the save line and buttons.
    if (!this.hooked) {
      this.hooked = true;
      this.events.on('wake', () => this.scene.restart());
    }
  }

  play() {
    if (State.data.started) {
      this.scene.start('WorldScene');
      return;
    }
    this.showIntro();
  }

  showIntro() {
    const W = this.scale.width;
    const H = this.scale.height;
    const pages = [
      'The world of Embers was once full of warm light.',
      'Now King Thalorion the Eternal is spreading his gloom across the land, and strange creatures creep out of the shadows.',
      "In the village of Ashbrook, young Leo Smith has inherited his grandfather's sword. Grandfather always said it held ancient magic.",
      'But for now, the magic sleeps. Leo straps on an iron blade, takes a deep breath, and steps outside.',
    ];
    let page = 0;
    const layer = this.add.container(0, 0);
    layer.add(UI.dim(this, 0.85));
    const top = H * 0.2;
    const bottom = top + Math.max(560, H * 0.5);
    layer.add(UI.panel(this, 40, top, W - 80, bottom - top));
    const portrait = this.add.image(W / 2, top + 100, 'leo');
    const text = UI.text(this, W / 2, top + 290, pages[0], 32, UI.colors.text, { wrap: W - 160, lineSpacing: 10 });
    const next = UI.button(this, W / 2 + 140, bottom - 80, 240, 96, 'Next', () => {
      page += 1;
      if (page >= pages.length) return this.begin();
      text.setText(pages[page]);
      if (page === pages.length - 1) next.setLabel('Begin');
    });
    const skip = UI.button(this, W / 2 - 140, bottom - 80, 240, 96, 'Skip', () => this.begin(), { color: 0x2a3150, topColor: 0x3a4570 });
    layer.add([portrait, text, next, skip]);
  }

  begin() {
    State.data.started = true;
    State.save();
    this.scene.start('WorldScene');
  }
}
