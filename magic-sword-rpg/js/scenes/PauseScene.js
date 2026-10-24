// The pause menu, opened with the ❚❚ button while exploring.

class PauseScene extends Phaser.Scene {
  constructor() {
    super('PauseScene');
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;
    UI.dim(this, 0.75);
    const items = [
      ['Resume', () => this.resume()],
      ['Inventory', () => this.open('InventoryScene')],
      ['Skills', () => this.open('SkillsScene')],
      ['Quests', () => this.open('QuestsScene')],
      ['Character', () => this.open('CharacterScene')],
      [this.soundLabel(), () => this.toggleSound()],
      ['Settings', () => this.open('SettingsScene')],
      ['Save & Main Menu', () => this.quit()],
    ];
    const gap = 104;
    const height = 130 + items.length * gap;
    const top = Math.max(20, (H - height) / 2);
    UI.panel(this, 60, top, W - 120, height);
    UI.text(this, W / 2, top + 60, 'Paused', 52, '#e6f4ff', { title: true, bold: true, stroke: '#1d3f9a' });
    items.forEach(([label, fn], i) => {
      const btn = UI.button(this, W / 2, top + 150 + i * gap, W - 200, 88, label, fn, { size: 30 });
      if (i === 5) this.soundBtn = btn;
    });

    if (!this.hooked) {
      this.hooked = true;
      // Back from a panel: Settings may have changed the sound.
      this.events.on('wake', () => this.soundBtn.setLabel(this.soundLabel()));
    }
  }

  soundLabel() {
    const s = Settings.data;
    return 'Sound: ' + (s.sound || s.music ? 'On' : 'Off');
  }

  toggleSound() {
    const s = Settings.data;
    const on = !(s.sound || s.music);
    s.sound = on;
    s.music = on;
    Settings.save();
    Sound.applySettings();
    this.soundBtn.setLabel(this.soundLabel());
  }

  open(key) {
    this.scene.launch(key, { from: 'PauseScene' });
    this.scene.sleep();
  }

  resume() {
    this.scene.stop();
    this.scene.get('WorldScene').closePause();
  }

  quit() {
    this.scene.get('WorldScene').save();
    this.scene.stop('HudScene');
    this.scene.stop('WorldScene');
    this.scene.start('MenuScene');
  }
}
