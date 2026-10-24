// Turn-based battle: Leo picks Attack, Magic, Potion or Run, then the enemy
// takes its turn. Ends in victory (XP and gold), escape, or defeat.

class BattleScene extends Phaser.Scene {
  constructor() {
    super('BattleScene');
  }

  init(data) {
    const def = ENEMIES[data.enemyId];
    this.enemyId = data.enemyId;
    this.enemy = { def, hp: def.hp, maxHp: def.hp, slowed: false, burn: null };
    this.busy = false;   // true while a turn is playing out: buttons don't work
    this.over = false;   // true once the battle is won, lost or escaped
    this.defeated = false;
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;
    Sound.music('battle');
    this.drawBackground(W, H);

    // Enemy
    UI.panel(this, 24, 24, W - 48, 110);
    UI.text(this, 56, 58, this.enemy.def.name, 32, '#ffffff', { bold: true, originX: 0, title: true });
    this.enemyBar = UI.bar(this, 56, 86, W - 112, 30, 0xe0483c, { prefix: 'HP ' });
    this.statusText = UI.text(this, W - 56, 58, '', 24, UI.colors.blue, { originX: 1, bold: true });
    const groundY = 134 + (H - 134 - 560) * 0.42;
    this.enemyHome = { x: W * 0.68, y: groundY };
    this.add.image(this.enemyHome.x, groundY + 70, 'shadow').setScale(3.2, 2);
    this.enemySprite = this.add.image(this.enemyHome.x, groundY, this.enemy.def.texture).setScale(1.7);
    this.tweens.add({ targets: this.enemySprite, scaleY: 1.55, scaleX: 1.8, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // Leo
    const heroY = H - 610;
    this.heroHome = { x: W * 0.28, y: heroY };
    this.add.image(this.heroHome.x, heroY + 84, 'shadow').setScale(2.4, 2);
    this.heroSprite = this.add.image(this.heroHome.x, heroY, 'leo').setScale(1.5);

    // Leo's panel
    const panelY = H - 500;
    UI.panel(this, 24, panelY, W - 48, 118);
    UI.text(this, 56, panelY + 28, State.data.name + '  ·  Lv ' + State.data.level, 26, '#ffffff', { bold: true, originX: 0 });
    this.weaponText = UI.text(this, W - 56, panelY + 28, '', 22, UI.colors.dim, { originX: 1 });
    this.heroHp = UI.bar(this, 56, panelY + 50, W - 112, 30, 0x3ccf5a, { prefix: 'HP ' });
    this.heroMp = UI.bar(this, 56, panelY + 86, W - 112, 24, 0x3f8cff, { prefix: 'MP ' });

    // Message box
    const msgY = H - 366;
    UI.panel(this, 24, msgY, W - 48, 100, { alpha: 0.9 });
    this.message = UI.text(this, W / 2, msgY + 50, '', 28, UI.colors.text, { wrap: W - 100 });

    // Buttons
    const bw = (W - 72) / 2;
    const row1 = H - 200;
    const row2 = H - 80;
    this.btnAttack = UI.button(this, 24 + bw / 2, row1, bw, 104, 'Attack', () => this.act('attack'), { size: 34 });
    this.btnMagic = UI.button(this, W - 24 - bw / 2, row1, bw, 104, 'Magic', () => this.act('magic'), { size: 30, color: 0x3b2a8c, topColor: 0x5b45c9 });
    this.btnPotion = UI.button(this, 24 + bw / 2, row2, bw, 104, 'Potion', () => this.act('potion'), { size: 30, color: 0x7a1f3a, topColor: 0xa83255 });
    this.btnRun = UI.button(this, W - 24 - bw / 2, row2, bw, 104, 'Run', () => this.act('run'), { size: 30, color: 0x2a3150, topColor: 0x3a4570 });

    this.fx = this.add.particles(0, 0, 'spark', {
      speed: { min: 60, max: 220 }, lifespan: 600, scale: { start: 1, end: 0 }, blendMode: 'ADD', emitting: false,
    });
    this.fx.setDepth(500);

    this.say('A wild ' + this.enemy.def.name + ' appears!');
    this.refresh();
    this.cameras.main.fadeIn(300);
  }

  drawBackground(W, H) {
    const g = this.add.graphics();
    g.fillStyle(0x6fc3ff, 1);
    g.fillRect(0, 0, W, H);
    g.fillStyle(0x9bd8ff, 1);
    g.fillRect(0, H * 0.18, W, H * 0.14);
    g.fillStyle(0x3e8e41, 1);
    g.fillEllipse(W * 0.2, H * 0.36, W * 0.9, H * 0.16);
    g.fillEllipse(W * 0.85, H * 0.34, W * 0.8, H * 0.14);
    g.fillStyle(0x56b35a, 1);
    g.fillRect(0, H * 0.36, W, H);
    g.fillStyle(0x479e4a, 1);
    for (let i = 0; i < 40; i++) g.fillRect((i * 97) % W, H * 0.38 + ((i * 53) % Math.floor(H * 0.5)), 6, 14);
    // dark gloom around the edges: Thalorion's magic
    g.fillStyle(0x2a1a5a, 0.18);
    g.fillRect(0, 0, W, 20);
  }

  // ---- Display ------------------------------------------------------------

  say(text) {
    this.message.setText(text);
  }

  refresh() {
    const d = State.data;
    const st = State.stats();
    this.enemyBar.set(this.enemy.hp, this.enemy.maxHp);
    this.heroHp.set(d.hp, st.maxHp);
    this.heroMp.set(d.mp, st.maxMp);
    this.weaponText.setText(st.weapon.name + ' (' + st.attack + ')');
    const status = [];
    if (this.enemy.slowed) status.push('Slowed');
    if (this.enemy.burn) status.push('Burning');
    this.statusText.setText(status.join(' · '));

    const potions = State.itemCount('potion');
    this.btnMagic.setLabel('Magic\n' + st.magicCost + ' MP');
    this.btnPotion.setLabel('Potion  ×' + potions);
    const canAct = !this.busy && !this.over && d.hp > 0;
    this.btnAttack.setEnabled(canAct);
    this.btnMagic.setEnabled(canAct && d.mp >= st.magicCost);
    this.btnPotion.setEnabled(canAct && potions > 0 && d.hp < st.maxHp);
    this.btnRun.setEnabled(canAct);
  }

  roll(base) {
    const spread = CONFIG.battle.damageSpread;
    return Math.max(1, Math.round(base * Phaser.Math.FloatBetween(1 - spread, 1 + spread)));
  }

  later(ms, fn) {
    this.time.delayedCall(ms, fn);
  }

  // ---- Leo's turn ---------------------------------------------------------

  act(action) {
    // No actions while a turn is playing out, after the battle, or while defeated.
    if (this.busy || this.over || State.data.hp <= 0) return;
    const st = State.stats();
    if (action === 'magic' && State.data.mp < st.magicCost) return;
    if (action === 'potion' && State.itemCount('potion') < 1) return;
    this.busy = true;
    this.refresh();

    if (action === 'attack') this.attack(st);
    else if (action === 'magic') this.castMagic(st);
    else if (action === 'potion') this.drinkPotion();
    else if (action === 'run') this.tryRun();
  }

  attack(st) {
    const weapon = st.weapon;
    const ability = weapon.ability;
    let damage = st.attack;
    if (ability && ability.type === 'awaken') damage += State.data.level * ability.bonusPerLevel;
    damage = this.roll(damage);
    const crit = Math.random() < st.critChance;
    if (crit) damage *= 2;
    let text = (crit ? 'Critical hit! ' : '') + 'Leo strikes with ' + weapon.name + ' for ' + damage + '.';

    // Sword abilities
    let extra = 0;
    if (ability && ability.type === 'awaken') {
      const chance = Math.min(ability.maxDoubleChance, State.data.level * ability.doubleChancePerLevel);
      if (Math.random() < chance) {
        extra = this.roll(st.attack);
        text += ' Ancient Echo strikes again for ' + extra + '!';
      }
    }
    if (ability && ability.type === 'slow' && Math.random() < ability.chance) {
      this.enemy.slowed = true;
      text += ' Frost slows the enemy!';
    }
    if (ability && ability.type === 'burn' && Math.random() < ability.chance) {
      this.enemy.burn = { damage: ability.damage, turns: ability.turns };
      text += ' The enemy catches fire!';
    }

    this.lunge(this.heroSprite, this.heroHome, 1, () => {
      Sound.play('hit');
      this.hitEnemy(damage + extra, crit ? '#ffd86b' : '#ffffff');
      this.say(text);
      this.afterHeroTurn();
    });
  }

  castMagic(st) {
    State.data.mp -= st.magicCost;
    const damage = this.roll(st.magic);
    let text = 'Leo calls on the old magic: ' + damage + ' damage!';
    if (st.magicSlowChance && Math.random() < st.magicSlowChance) {
      this.enemy.slowed = true;
      text += ' Frost slows the enemy!';
    }
    if (st.magicBurn) {
      this.enemy.burn = { damage: st.magicBurn.damage, turns: st.magicBurn.turns };
      text += ' It catches fire!';
    }
    Sound.play('magic');
    this.heroSprite.setTint(0x9fd8ff);
    const bolt = this.add.image(this.heroHome.x, this.heroHome.y, 'spark').setScale(3).setBlendMode('ADD').setDepth(400);
    this.tweens.add({
      targets: bolt, x: this.enemyHome.x, y: this.enemyHome.y, duration: 350, ease: 'Quad.easeIn',
      onComplete: () => {
        bolt.destroy();
        this.heroSprite.clearTint();
        this.fx.explode(30, this.enemyHome.x, this.enemyHome.y);
        this.hitEnemy(damage, '#9fd8ff');
        this.say(text);
        this.afterHeroTurn();
      },
    });
  }

  drinkPotion() {
    State.removeItem('potion');
    const healed = State.heal(CONFIG.potion.heal);
    Sound.play('heal');
    this.fx.explode(20, this.heroHome.x, this.heroHome.y);
    UI.floatText(this, this.heroHome.x, this.heroHome.y - 80, '+' + healed, UI.colors.good);
    this.say('Leo drinks a potion and recovers ' + healed + ' health.');
    this.refresh();
    this.later(900, () => this.enemyTurn());
  }

  tryRun() {
    if (Math.random() < CONFIG.battle.runChance) {
      this.say('Leo got away safely!');
      this.over = true;
      this.refresh();
      this.tweens.add({ targets: this.heroSprite, x: -100, duration: 500, ease: 'Quad.easeIn' });
      this.later(900, () => this.finish('fled'));
    } else {
      this.say("Leo tries to run, but can't get away!");
      this.later(900, () => this.enemyTurn());
    }
  }

  hitEnemy(damage, color) {
    this.enemy.hp = Math.max(0, this.enemy.hp - damage);
    UI.floatText(this, this.enemyHome.x, this.enemyHome.y - 90, '-' + damage, color);
    this.enemySprite.setTintFill(0xffffff);
    this.later(90, () => this.enemySprite.clearTint());
    this.cameras.main.shake(120, 0.006);
    this.refresh();
  }

  afterHeroTurn() {
    if (this.enemy.hp <= 0) {
      this.later(700, () => this.victory());
      return;
    }
    this.later(1000, () => this.enemyTurn());
  }

  // ---- The enemy's turn ---------------------------------------------------

  enemyTurn() {
    if (this.over) return;
    const e = this.enemy;

    // Burning hurts at the start of its turn.
    if (e.burn) {
      const dmg = e.burn.damage;
      e.burn.turns -= 1;
      if (e.burn.turns <= 0) e.burn = null;
      this.hitEnemy(dmg, '#ff9a4d');
      this.say(e.def.name + ' burns for ' + dmg + '.');
      if (e.hp <= 0) {
        this.later(700, () => this.victory());
        return;
      }
      this.later(900, () => this.enemyAttack());
      return;
    }
    this.enemyAttack();
  }

  enemyAttack() {
    const e = this.enemy;
    if (e.slowed) {
      e.slowed = false;
      this.say(e.def.name + ' is slowed by frost and loses its turn!');
      this.endRound();
      return;
    }
    this.lunge(this.enemySprite, this.enemyHome, -1, () => {
      if (Math.random() < CONFIG.battle.enemyMissChance) {
        this.say(e.def.name + ' attacks, but misses!');
        this.endRound();
        return;
      }
      const st = State.stats();
      const raw = Phaser.Math.Between(e.def.attack[0], e.def.attack[1]);
      const damage = Math.max(1, Math.round(raw * (1 - st.damageReduction)));
      State.data.hp = Math.max(0, State.data.hp - damage);
      Sound.play('hurt');
      UI.floatText(this, this.heroHome.x, this.heroHome.y - 90, '-' + damage, UI.colors.bad);
      this.heroSprite.setTintFill(0xff6060);
      this.later(110, () => this.heroSprite.clearTint());
      this.cameras.main.shake(150, 0.01);
      this.say(e.def.name + ' hits Leo for ' + damage + '.');
      if (State.data.hp <= 0) {
        this.over = true;
        this.refresh();
        this.later(900, () => this.defeat());
        return;
      }
      this.endRound();
    });
  }

  endRound() {
    this.busy = false;
    this.refresh();
  }

  // Jump at the other side and back. onHit runs once, at the far point.
  // (onYoyo fires once per moving property, so it is guarded.)
  lunge(sprite, home, dir, onHit) {
    let hit = false;
    this.tweens.add({
      targets: sprite, x: home.x + dir * 90, y: home.y - dir * 60, duration: 160, ease: 'Quad.easeOut', yoyo: true,
      onYoyo: () => {
        if (hit) return;
        hit = true;
        onHit();
      },
    });
  }

  // ---- Endings ------------------------------------------------------------

  victory() {
    if (this.over) return;
    this.over = true;
    this.busy = false;
    this.refresh();
    const def = this.enemy.def;
    this.tweens.killTweensOf(this.enemySprite);
    this.tweens.add({ targets: this.enemySprite, alpha: 0, scaleY: 0.2, duration: 400 });
    this.fx.explode(40, this.enemyHome.x, this.enemyHome.y);

    const gold = Phaser.Math.Between(def.gold[0], def.gold[1]);
    State.addGold(gold);
    const levels = State.addXp(def.xp);
    const readyQuests = State.recordDefeat(this.enemyId);
    State.save();
    Sound.play(levels.length ? 'levelup' : 'victory');

    const lines = ['+' + def.xp + ' XP', '+' + gold + ' gold'];
    if (levels.length) {
      lines.push('');
      lines.push('LEVEL UP! Leo is now level ' + State.data.level);
      lines.push('Max health +' + CONFIG.player.hpPerLevel * levels.length + ', +' + levels.length + ' skill point' + (levels.length > 1 ? 's' : ''));
    }
    for (const q of this.activeQuestLines(readyQuests)) lines.push(q);
    this.showResult('Victory!', UI.colors.gold, lines, 'Continue', () => this.finish('victory'));
  }

  activeQuestLines(readyQuests) {
    const lines = [];
    for (const id in State.data.quests) {
      const goal = QUESTS[id].goal;
      if (goal.type !== 'defeat' || goal.enemy !== this.enemyId) continue;
      const status = State.questStatus(id);
      if (readyQuests.includes(id)) {
        lines.push('');
        lines.push(QUESTS[id].name + ': done! Return to ' + (id === 'slime_trouble' ? 'Elder Maren' : 'the quest giver') + '.');
      } else if (status === 'active') {
        const p = State.questProgress(id);
        lines.push('');
        lines.push(QUESTS[id].name + ': ' + p.have + ' / ' + p.need);
      }
    }
    return lines;
  }

  defeat() {
    if (this.defeated) return;
    this.defeated = true;
    Sound.play('defeat');
    this.tweens.add({ targets: this.heroSprite, angle: -90, y: this.heroHome.y + 40, alpha: 0.6, duration: 600 });
    const lost = Math.floor(State.data.gold * CONFIG.battle.defeatGoldLoss);
    State.addGold(-lost);
    State.restore();
    State.data.pos = null;
    State.save();
    const lines = [
      'Leo was defeated...',
      '',
      'He wakes up back in Ashbrook,',
      'fully healed.',
      lost > 0 ? 'Lost ' + lost + ' gold.' : '',
    ];
    this.showResult('Defeated', UI.colors.bad, lines, 'Return to Ashbrook', () => this.finish('defeat'));
  }

  showResult(title, color, lines, buttonLabel, onDone) {
    const W = this.scale.width;
    const H = this.scale.height;
    UI.dim(this, 0.6).setDepth(2000);
    const body = UI.text(this, W / 2, 0, lines.join('\n'), 30, UI.colors.text, { wrap: W - 140, lineSpacing: 8 }).setDepth(2002);
    const h = body.height + 300;
    const top = (H - h) / 2;
    UI.panel(this, 40, top, W - 80, h).setDepth(2001);
    UI.text(this, W / 2, top + 60, title, 56, color, { bold: true, title: true, stroke: '#000000' }).setDepth(2002);
    body.setY(top + 110 + body.height / 2);
    UI.button(this, W / 2, top + h - 80, 440, 100, buttonLabel, onDone, { size: 32 }).setDepth(2003);
  }

  finish(result) {
    const world = this.scene.get('WorldScene');
    this.scene.stop();
    world.onBattleEnd(result);
  }
}
