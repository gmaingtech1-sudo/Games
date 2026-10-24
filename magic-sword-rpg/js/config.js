// Magic Sword RPG — game balance.
// Every number that decides how the game plays lives here, so you can
// change the game without touching the code. Save the file and reload.

const CONFIG = {
  version: '1.0',

  // Where the save and the settings are kept on the phone.
  saveKey: 'magicSwordRpg.save.v1',
  settingsKey: 'magicSwordRpg.settings.v1',

  // Screen: the game is drawn 720 units wide and stretched to fit the phone.
  gameWidth: 720,
  minHeight: 1100,
  maxHeight: 1600,
  tileSize: 48,

  player: {
    startHp: 80,          // health at level 1
    startMp: 30,          // magic points at level 1
    hpPerLevel: 15,       // extra max health for every level
    mpPerLevel: 5,        // extra max magic for every level
    attackPerLevel: 2,    // added to the sword's damage for every level after 1
    speed: 200,           // walking speed
    startGold: 20,
    startPotions: 2,
    startWeapon: 'iron_sword',
    startSkillPoints: 1,
    skillPointsPerLevel: 1,
  },

  magic: {
    cost: 10,             // magic points per spell
    baseDamage: 14,
    damagePerLevel: 3,
  },

  // XP needed: 100 for level 2, then each level needs `growth` times more.
  xp: {
    firstLevel: 100,
    growth: 1.5,
  },

  battle: {
    damageSpread: 0.15,   // damage varies by up to ±15%
    enemyMissChance: 0.1,
    runChance: 0.7,
    defeatGoldLoss: 0.1,  // lose 10% of your gold when defeated
  },

  potion: {
    heal: 40,
    price: 15,
  },

  world: {
    slimeCount: 4,          // slimes in the meadow at once
    enemyRespawnMs: 20000,  // a defeated slime comes back after 20 seconds
    safeAfterBattleMs: 2500,
    interactRange: 80,
    cameraZoom: 1.2,        // bigger number = closer view
  },
};
