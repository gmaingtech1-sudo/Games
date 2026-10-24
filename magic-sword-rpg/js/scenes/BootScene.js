// Runs first: draws the placeholder art, loads the save, then opens the menu.

class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create() {
    Art.make(this);
    State.load();
    this.scene.start('MenuScene');
  }
}
