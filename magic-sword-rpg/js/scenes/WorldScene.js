// The world you walk around in: Ashbrook village and Gloom Meadow.

class WorldScene extends Phaser.Scene {
  constructor() {
    super('WorldScene');
  }

  create() {
    const T = CONFIG.tileSize;
    this.locked = false;      // true while a battle, dialog or the pause menu is open
    this.safeUntil = 0;       // slimes can't start a battle before this time
    this.target = null;       // the closest thing Leo can talk to or use
    this.stepTimer = 0;

    // ---- Map ----
    const data = WORLD.map.map((row) => Array.from(row, (ch) => WORLD.tiles[ch].index));
    const map = this.make.tilemap({ data, tileWidth: T, tileHeight: T });
    const tileset = map.addTilesetImage('tiles', 'tiles', T, T, 1, 2);
    this.layer = map.createLayer(0, tileset, 0, 0);
    const solid = Object.values(WORLD.tiles).filter((t) => t.solid).map((t) => t.index);
    this.layer.setCollision(solid);
    this.worldW = map.widthInPixels;
    this.worldH = map.heightInPixels;
    this.physics.world.setBounds(0, 0, this.worldW, this.worldH);

    this.blockers = this.physics.add.staticGroup();
    this.interactables = [];
    this.createObjects();

    // ---- Leo ----
    const start = State.data.pos || this.tileCenter(WORLD.start);
    this.player = this.physics.add.sprite(start.x, start.y, 'leo').setScale(0.5);
    this.player.body.setSize(44, 26).setOffset(26, 90);
    this.player.setCollideWorldBounds(true);
    this.physics.add.collider(this.player, this.layer);
    this.physics.add.collider(this.player, this.blockers);

    // ---- Slimes ----
    this.enemies = this.physics.add.group();
    this.physics.add.collider(this.enemies, this.layer);
    this.physics.add.collider(this.enemies, this.blockers);
    this.physics.add.overlap(this.player, this.enemies, (p, enemy) => this.startBattle(enemy));
    for (let i = 0; i < CONFIG.world.slimeCount; i++) this.spawnEnemy(true);

    // ---- Camera ----
    // The camera can look a little past the top and bottom of the map, so the
    // HUD and the joystick never hide anything you need to reach.
    const cam = this.cameras.main;
    const zoom = CONFIG.world.cameraZoom;
    cam.setZoom(zoom);
    cam.setBounds(0, -200 / zoom, this.worldW, this.worldH + 560 / zoom);
    cam.startFollow(this.player, true, 0.15, 0.15);
    cam.setBackgroundColor('#1f4f24');
    cam.fadeIn(400);

    // ---- Keyboard (for testing on a computer) ----
    this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,ENTER,ESC');
    this.keys.SPACE.on('down', () => this.doAction());
    this.keys.ENTER.on('down', () => this.doAction());
    this.keys.ESC.on('down', () => this.openPause());

    // ---- HUD and events ----
    Controls.x = 0;
    Controls.y = 0;
    this.scene.launch('HudScene');
    Bus.on('action', this.doAction, this);
    Bus.on('pause', this.openPause, this);
    Bus.on('app-hidden', this.onAppHidden, this);
    this.events.once('shutdown', () => {
      Bus.off('action', this.doAction, this);
      Bus.off('pause', this.openPause, this);
      Bus.off('app-hidden', this.onAppHidden, this);
    });

    // Save Leo's position every few seconds.
    this.time.addEvent({ delay: 5000, loop: true, callback: () => this.save() });

    Sound.music('village');
    this.refreshMarkers();
  }

  tileCenter(p) {
    const T = CONFIG.tileSize;
    return { x: (p.x + 0.5) * T, y: (p.y + 0.5) * T };
  }

  // An invisible wall under a person or object, so Leo bumps into it.
  addBlocker(x, y, w, h) {
    const z = this.add.zone(x, y, w, h);
    this.physics.add.existing(z, true);
    this.blockers.add(z);
  }

  addInteractable(obj) {
    this.interactables.push(obj);
    return obj;
  }

  createObjects() {
    // People
    this.npcs = {};
    for (const npc of WORLD.npcs) {
      const p = this.tileCenter(npc);
      const sprite = this.add.image(p.x, p.y - 12, npc.texture).setScale(0.5).setDepth(p.y);
      const label = UI.text(this, p.x, p.y - 58, npc.name, 18, '#ffffff', { bold: true, stroke: '#000000', strokeThickness: 4 }).setDepth(5000);
      const marker = UI.text(this, p.x, p.y - 88, '!', 40, UI.colors.gold, { bold: true, stroke: '#000000', strokeThickness: 6 }).setDepth(5001);
      this.tweens.add({ targets: marker, y: p.y - 96, duration: 600, yoyo: true, repeat: -1 });
      this.addBlocker(p.x, p.y + 8, 34, 24);
      this.npcs[npc.id] = { npc, sprite, label, marker };
      this.addInteractable({ x: p.x, y: p.y, label: () => 'Talk', use: () => this.talk(npc.id) });
    }

    // The healing well
    const w = this.tileCenter(WORLD.well);
    this.add.image(w.x, w.y - 16, 'well').setScale(0.75).setDepth(w.y);
    this.addBlocker(w.x, w.y + 4, 60, 30);
    this.addInteractable({ x: w.x, y: w.y, label: () => 'Drink', use: () => this.useWell() });

    // Signs
    for (const sign of WORLD.signs) {
      const p = this.tileCenter(sign);
      this.add.image(p.x, p.y - 8, 'sign').setScale(0.8).setDepth(p.y);
      this.addBlocker(p.x, p.y + 6, 30, 20);
      this.addInteractable({ x: p.x, y: p.y, label: () => 'Read', use: () => this.openDialog({ name: 'Sign', pages: [sign.text] }) });
    }

    // Treasure chests
    for (const chest of WORLD.chests) {
      const p = this.tileCenter(chest);
      const img = this.add.image(p.x, p.y, State.isChestOpen(chest.id) ? 'chest_open' : 'chest').setScale(0.8).setDepth(p.y);
      this.addBlocker(p.x, p.y + 6, 44, 24);
      this.addInteractable({
        x: p.x, y: p.y,
        label: () => (State.isChestOpen(chest.id) ? 'Look' : 'Open'),
        use: () => this.openChest(chest, img),
      });
    }

    // Mira's pendant (only there while her quest is active)
    const pp = this.tileCenter(WORLD.pendant);
    this.pendant = this.add.image(pp.x, pp.y, 'pendant').setScale(0.8).setDepth(pp.y);
    this.pendantGlow = this.add.image(pp.x, pp.y, 'spark').setScale(2.2).setBlendMode('ADD').setDepth(pp.y - 1);
    this.tweens.add({ targets: this.pendantGlow, alpha: 0.3, duration: 700, yoyo: true, repeat: -1 });
    this.addInteractable({
      x: pp.x, y: pp.y,
      active: () => this.pendantAvailable(),
      label: () => 'Pick up',
      use: () => this.pickUpPendant(),
    });
  }

  pendantAvailable() {
    return State.questStatus('lost_pendant') === 'active' && State.itemCount('pendant') === 0;
  }

  // ---- Every frame --------------------------------------------------------

  update(time, delta) {
    const p = this.player;
    if (this.locked) {
      p.setVelocity(0, 0);
      return;
    }

    let vx = Controls.x;
    let vy = Controls.y;
    const k = this.keys;
    if (k.LEFT.isDown || k.A.isDown) vx = -1;
    if (k.RIGHT.isDown || k.D.isDown) vx = 1;
    if (k.UP.isDown || k.W.isDown) vy = -1;
    if (k.DOWN.isDown || k.S.isDown) vy = 1;
    const len = Math.hypot(vx, vy);
    if (len > 1) {
      vx /= len;
      vy /= len;
    }
    p.setVelocity(vx * CONFIG.player.speed, vy * CONFIG.player.speed);

    // Walking animation: swap between two pictures.
    const moving = len > 0.1;
    if (moving) {
      if (vx < -0.1) p.setFlipX(true);
      else if (vx > 0.1) p.setFlipX(false);
      this.stepTimer += delta;
      if (this.stepTimer > 150) {
        this.stepTimer = 0;
        p.setTexture(p.texture.key === 'leo' ? 'leo_step' : 'leo');
      }
    } else if (p.texture.key !== 'leo') {
      p.setTexture('leo');
    }
    p.setDepth(p.y);

    // Blink for a moment after a battle, while slimes can't touch Leo.
    const now = this.game.loop.time;
    p.setAlpha(now < this.safeUntil ? (Math.floor(now / 120) % 2 ? 0.4 : 1) : 1);

    this.updateEnemies(now);

    // Find the closest thing Leo can use.
    let best = null;
    let bestDist = CONFIG.world.interactRange;
    for (const obj of this.interactables) {
      if (obj.active && !obj.active()) continue;
      const dist = Phaser.Math.Distance.Between(p.x, p.y, obj.x, obj.y);
      if (dist < bestDist) {
        best = obj;
        bestDist = dist;
      }
    }
    this.target = best;

    const showPendant = this.pendantAvailable();
    this.pendant.setVisible(showPendant);
    this.pendantGlow.setVisible(showPendant);
  }

  // ---- Enemies ------------------------------------------------------------

  spawnEnemy(anywhere) {
    const zone = WORLD.enemyZone;
    const T = CONFIG.tileSize;
    for (let tries = 0; tries < 50; tries++) {
      const tx = Phaser.Math.Between(1, WORLD.map[0].length - 2);
      const ty = Phaser.Math.Between(zone.top, zone.bottom);
      if (WORLD.tiles[WORLD.map[ty][tx]].solid) continue;
      const x = (tx + 0.5) * T;
      const y = (ty + 0.5) * T;
      if (this.player && Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) < (anywhere ? 200 : 350)) continue;
      const enemy = this.enemies.create(x, y, ENEMIES[zone.enemy].texture).setScale(0.45);
      enemy.enemyId = zone.enemy;
      enemy.body.setSize(80, 50).setOffset(20, 44);
      enemy.setBounce(1);
      enemy.nextMove = 0;
      this.tweens.add({ targets: enemy, scaleY: 0.4, scaleX: 0.5, duration: 400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: Phaser.Math.Between(0, 400) });
      return enemy;
    }
    return null;
  }

  updateEnemies(now) {
    const p = this.player;
    for (const e of this.enemies.getChildren()) {
      e.setDepth(e.y);
      if (now < e.nextMove) continue;
      e.nextMove = now + Phaser.Math.Between(800, 1800);
      const dist = Phaser.Math.Distance.Between(e.x, e.y, p.x, p.y);
      if (dist < 220 && now > this.safeUntil) {
        // Creep towards Leo
        const a = Phaser.Math.Angle.Between(e.x, e.y, p.x, p.y);
        e.setVelocity(Math.cos(a) * 70, Math.sin(a) * 70);
      } else if (Math.random() < 0.35) {
        e.setVelocity(0, 0);
      } else {
        const a = Math.random() * Math.PI * 2;
        e.setVelocity(Math.cos(a) * 45, Math.sin(a) * 45);
      }
      // Stay in the meadow.
      const top = (WORLD.enemyZone.top) * CONFIG.tileSize;
      if (e.y < top) e.setVelocityY(Math.abs(e.body.velocity.y) || 40);
    }
  }

  startBattle(enemy) {
    if (this.locked || this.game.loop.time < this.safeUntil) return;
    this.lock();
    this.battleEnemy = enemy;
    enemy.setVelocity(0, 0);
    Sound.play('encounter');
    this.cameras.main.flash(250, 120, 180, 255);
    this.time.delayedCall(300, () => {
      this.scene.pause();
      this.scene.sleep('HudScene');
      this.scene.launch('BattleScene', { enemyId: enemy.enemyId });
    });
  }

  // Called by BattleScene when the battle is over.
  onBattleEnd(result) {
    this.scene.resume();
    this.scene.wake('HudScene');
    Sound.music('village');
    const enemy = this.battleEnemy;
    this.battleEnemy = null;
    this.safeUntil = this.game.loop.time + CONFIG.world.safeAfterBattleMs;
    if (result === 'victory' && enemy) {
      enemy.destroy();
      this.time.delayedCall(CONFIG.world.enemyRespawnMs, () => this.spawnEnemy(false));
    } else if (result === 'defeat') {
      const start = this.tileCenter(WORLD.start);
      this.player.setPosition(start.x, start.y);
      this.cameras.main.fadeIn(600);
    }
    this.unlock();
    this.refreshMarkers();
    this.save();
  }

  // ---- Using things -------------------------------------------------------

  doAction() {
    if (this.locked) return;
    if (!this.target) {
      Bus.emit('toast', 'Walk up to someone or something, then tap this.');
      return;
    }
    this.target.use();
  }

  useWell() {
    const st = State.stats();
    const d = State.data;
    if (d.hp >= st.maxHp && d.mp >= st.maxMp) {
      this.openDialog({ name: 'Healing Well', pages: ['The water glows a soft blue. You already feel fine.'] });
      return;
    }
    State.restore();
    State.save();
    Sound.play('heal');
    this.add.particles(this.player.x, this.player.y, 'spark', {
      speed: { min: 40, max: 140 }, lifespan: 700, scale: { start: 0.8, end: 0 }, blendMode: 'ADD', emitting: false,
    }).explode(24);
    this.openDialog({ name: 'Healing Well', pages: ['You drink the glowing water. Health and magic fully restored!'] });
  }

  openChest(chest, img) {
    const loot = State.openChest(chest);
    if (!loot) {
      this.openDialog({ name: 'Chest', pages: ['The chest is empty.'] });
      return;
    }
    img.setTexture('chest_open');
    State.save();
    Sound.play('chest');
    UI.floatText(this, img.x, img.y - 30, 'Treasure!', UI.colors.gold, 30);
    this.openDialog({ name: 'Treasure Chest', pages: ['You found ' + describeLoot(loot) + '!'] });
  }

  pickUpPendant() {
    State.addItem('pendant');
    State.save();
    Sound.play('chest');
    this.refreshMarkers();
    this.openDialog({ name: "Mira's Pendant", pages: ['A silver pendant with a blue stone, half hidden in the grass. This must be Mira\'s!'] });
  }

  // ---- People -------------------------------------------------------------

  talk(id) {
    if (id === 'elder') this.openDialog(this.elderDialog());
    else if (id === 'merchant') this.openDialog(this.merchantDialog());
    else if (id === 'mira') this.openDialog(this.miraDialog());
  }

  // Shows a quest's reward, and any level up, after handing it in.
  rewardDialog(name, questId, thanks) {
    const result = State.completeQuest(questId);
    State.save();
    Sound.play(result.levels.length ? 'levelup' : 'chest');
    const pages = [thanks, 'Quest complete: ' + QUESTS[questId].name + '!\nYou got ' + describeLoot(result.reward) + '.'];
    if (result.levels.length) pages.push('Level up! Leo is now level ' + State.data.level + '. Health and magic restored, and you earned a skill point.');
    this.refreshMarkers();
    return { name, pages };
  }

  elderDialog() {
    const name = 'Elder Maren';
    const status = State.questStatus('slime_trouble');
    if (status === 'new') {
      return {
        name,
        pages: [
          'Leo! I was sorry to hear about your grandfather. He left you his sword, I know. The magic in it sleeps, but one day it will wake for you.',
          "King Thalorion's gloom has reached even Ashbrook. Slimes made of it are crawling out of the meadow south of the river.",
          'Would you defeat 3 Gloom Slimes for us? Until your sword wakes, that iron blade will have to do.',
        ],
        choices: [
          { label: 'I will help!', onSelect: () => {
            State.startQuest('slime_trouble');
            State.save();
            this.refreshMarkers();
            Bus.emit('toast', 'New quest: Slime Trouble');
            return { name, pages: ['Thank you. Cross the bridge to the south. If you get hurt, drink from the well here in the village.'] };
          } },
          { label: 'Not yet', onSelect: () => null },
        ],
      };
    }
    if (status === 'active') {
      const p = State.questProgress('slime_trouble');
      return { name, pages: ['You have defeated ' + p.have + ' of ' + p.need + ' slimes. The meadow is south, across the bridge.'] };
    }
    if (status === 'ready') {
      return this.rewardDialog(name, 'slime_trouble', 'You did it! The meadow is safer already. Take this sword, Frostbite. Its cold bite can slow a monster down. Equip it from your Inventory.');
    }
    return { name, pages: ['Thalorion grows stronger in the Enchanted Forest beyond the brambles. When the path opens, be ready, Leo.'] };
  }

  merchantDialog() {
    const name = 'Bram the Merchant';
    const price = CONFIG.potion.price;
    return {
      name,
      pages: ['Healing Potions! ' + price + ' gold each. You have ' + State.data.gold + ' gold and ' + State.itemCount('potion') + ' potions.'],
      choices: [
        { label: 'Buy a potion (' + price + ' gold)', onSelect: () => {
          if (!State.buyPotion()) {
            Sound.play('error');
            return { name, pages: ["You don't have enough gold. Slimes in the meadow drop some!"] };
          }
          State.save();
          Sound.play('chest');
          return this.merchantDialog();
        } },
        { label: 'Goodbye', onSelect: () => null },
      ],
    };
  }

  miraDialog() {
    const name = 'Mira';
    const status = State.questStatus('lost_pendant');
    if (status === 'new') {
      return {
        name,
        pages: ["Oh, Leo... I lost my mother's pendant in the meadow, somewhere near the pond. The slimes scare me too much to go back."],
        choices: [
          { label: "I'll find it", onSelect: () => {
            State.startQuest('lost_pendant');
            State.save();
            this.refreshMarkers();
            Bus.emit('toast', 'New quest: The Lost Pendant');
            return { name, pages: ['Thank you! It is silver, with a blue stone. Look by the pond in the meadow.'] };
          } },
          { label: 'Sorry, not now', onSelect: () => null },
        ],
      };
    }
    if (status === 'active') return { name, pages: ['It is silver, with a blue stone. Look by the pond in the meadow.'] };
    if (status === 'ready') return this.rewardDialog(name, 'lost_pendant', "My pendant! Thank you, Leo. Please take these, they're all I have.");
    return { name, pages: ['I wear it every day now. Thank you again, Leo!'] };
  }

  // The "!" above people who have a quest for you, or are waiting for one.
  refreshMarkers() {
    const show = {
      elder: ['new', 'ready'].includes(State.questStatus('slime_trouble')),
      mira: ['new', 'ready'].includes(State.questStatus('lost_pendant')),
      merchant: false,
    };
    for (const id in this.npcs) this.npcs[id].marker.setVisible(!!show[id]);
  }

  // ---- Pop-ups (dialog and pause) -----------------------------------------

  lock() {
    this.locked = true;
    Controls.x = 0;
    Controls.y = 0;
    this.player.setVelocity(0, 0);
  }

  unlock() {
    this.locked = false;
  }

  openDialog(dialog) {
    this.lock();
    this.scene.pause();
    this.scene.pause('HudScene');
    this.scene.launch('DialogScene', { dialog });
  }

  // Called by DialogScene when it closes.
  closeDialog() {
    this.scene.resume();
    this.scene.resume('HudScene');
    this.unlock();
    this.refreshMarkers();
  }

  openPause() {
    if (this.locked) return;
    this.lock();
    this.save();
    this.scene.pause();
    this.scene.pause('HudScene');
    this.scene.launch('PauseScene');
  }

  // Called by PauseScene when you tap Resume.
  closePause() {
    this.scene.resume();
    this.scene.resume('HudScene');
    this.unlock();
  }

  onAppHidden() {
    this.save();
    if (!this.locked && this.scene.isActive()) this.openPause();
  }

  save() {
    if (!this.player) return;
    State.data.pos = { x: Math.round(this.player.x), y: Math.round(this.player.y) };
    State.save();
  }
}
