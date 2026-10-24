// A talking box at the bottom of the screen. Shows a dialog:
//   { name, pages: ['text', ...], choices: [{ label, onSelect }] }
// A choice's onSelect can return another dialog to show next, or null to close.

class DialogScene extends Phaser.Scene {
  constructor() {
    super('DialogScene');
  }

  init(data) {
    this.dialog = data.dialog;
    this.page = 0;
  }

  create() {
    UI.dim(this, 0.35);
    this.box = this.add.graphics();
    this.title = UI.text(this, 56, 0, this.dialog.name, 32, UI.colors.gold, { bold: true, originX: 0, title: true });
    this.body = UI.text(this, 56, 0, '', 30, UI.colors.text, { originX: 0, originY: 0, align: 'left', wrap: this.scale.width - 112, lineSpacing: 8 });
    this.buttons = [];
    this.showPage();
  }

  showPage() {
    const W = this.scale.width;
    const H = this.scale.height;
    this.buttons.forEach((b) => b.destroy());
    this.buttons = [];
    this.body.setText(this.dialog.pages[this.page]);
    const last = this.page >= this.dialog.pages.length - 1;
    const choices = last && this.dialog.choices ? this.dialog.choices : [{ label: last ? 'OK' : 'Next', onSelect: 'next' }];

    // The box grows to fit the text and the buttons, sitting at the bottom.
    const height = 100 + this.body.height + 30 + choices.length * 104;
    const top = H - 40 - height;
    this.box.clear();
    this.box.fillStyle(UI.colors.panelEdge, 0.18);
    this.box.fillRoundedRect(18, top - 6, W - 36, height + 12, 22);
    this.box.fillStyle(UI.colors.panel, 0.96);
    this.box.fillRoundedRect(24, top, W - 48, height, 18);
    this.box.lineStyle(3, UI.colors.panelEdge, 0.9);
    this.box.strokeRoundedRect(24, top, W - 48, height, 18);
    this.title.setY(top + 44);
    this.body.setY(top + 84);
    choices.forEach((choice, i) => {
      const y = top + 100 + this.body.height + 30 + 44 + i * 104;
      this.buttons.push(UI.button(this, W / 2, y, W - 120, 88, choice.label, () => this.choose(choice)));
    });
  }

  choose(choice) {
    if (choice.onSelect === 'next') {
      if (this.page < this.dialog.pages.length - 1) {
        this.page += 1;
        this.showPage();
        return;
      }
      this.close();
      return;
    }
    const next = choice.onSelect();
    if (next) {
      this.dialog = next;
      this.page = 0;
      this.scene.restart({ dialog: next });
    } else {
      this.close();
    }
  }

  close() {
    this.scene.stop();
    this.scene.get('WorldScene').closeDialog();
  }
}
