// Starts Phaser. The game is 720 units wide; its height follows the phone's
// shape so it fills a portrait screen, within CONFIG.minHeight..maxHeight.

(function () {
  Settings.load();

  const width = CONFIG.gameWidth;
  const ratio = window.innerHeight / Math.max(1, window.innerWidth);
  const height = Math.round(Math.min(CONFIG.maxHeight, Math.max(CONFIG.minHeight, width * ratio)));

  window.game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#070b1f',
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width,
      height,
    },
    physics: {
      default: 'arcade',
      arcade: { debug: false },
    },
    input: {
      activePointers: 3, // joystick and a button at the same time
    },
    render: {
      antialias: true,
      roundPixels: true,
    },
    disableContextMenu: true,
    scene: [
      BootScene, MenuScene, WorldScene, HudScene, BattleScene, DialogScene, PauseScene,
      InventoryScene, SkillsScene, QuestsScene, CharacterScene, SettingsScene,
    ],
  });

  // Save when the phone switches away from the game or it is closed.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) Bus.emit('app-hidden');
  });
  window.addEventListener('pagehide', () => Bus.emit('app-hidden'));

  // Offline support and "Add to Home screen".
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
