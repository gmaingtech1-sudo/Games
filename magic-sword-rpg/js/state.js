// The hero's progress and the rules that change it: XP, levels, gold, items,
// swords, skills and quests. Everything here works on plain data (State.data),
// which is what gets saved. The screens only call these functions, so the same
// rules could later run on a server for multiplayer.

const Store = {
  get(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  },
  set(key, value) {
    try { localStorage.setItem(key, value); return true; } catch (e) { return false; }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch (e) { /* storage unavailable */ }
  },
};

const Settings = {
  data: null,
  defaults() {
    return { sound: true, music: true, volume: 0.7, controls: 'joystick' };
  },
  load() {
    let saved = null;
    try { saved = JSON.parse(Store.get(CONFIG.settingsKey)); } catch (e) { saved = null; }
    this.data = Object.assign(this.defaults(), saved || {});
  },
  save() {
    Store.set(CONFIG.settingsKey, JSON.stringify(this.data));
  },
};

const State = {
  data: null,

  defaultData() {
    const p = CONFIG.player;
    return {
      version: 1,
      // A unique id for this hero. Not used yet; it's here for future online play.
      id: 'hero-' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36),
      name: 'Leo Smith',
      started: false,
      level: 1,
      xp: 0,
      hp: p.startHp,
      mp: p.startMp,
      gold: p.startGold,
      skillPoints: p.startSkillPoints,
      skills: [],
      inventory: { potion: p.startPotions },
      weapons: [p.startWeapon],
      equipped: p.startWeapon,
      quests: {},          // { questId: { status: 'active' | 'done', progress: n } }
      openedChests: [],
      defeated: {},        // { enemyId: count }
      pos: null,           // where Leo stands in the world, in pixels
      savedAt: 0,
    };
  },

  // ---- Saving -------------------------------------------------------------

  hasSave() {
    return !!Store.get(CONFIG.saveKey);
  },

  load() {
    let saved = null;
    try { saved = JSON.parse(Store.get(CONFIG.saveKey)); } catch (e) { saved = null; }
    const d = this.defaultData();
    if (saved && typeof saved === 'object') {
      Object.assign(d, saved);
      d.inventory = Object.assign({}, saved.inventory || {});
      d.quests = Object.assign({}, saved.quests || {});
      d.defeated = Object.assign({}, saved.defeated || {});
      d.skills = (saved.skills || []).filter((id) => SKILLS[id]);
      d.weapons = (saved.weapons || []).filter((id) => WEAPONS[id]);
      d.openedChests = saved.openedChests || [];
    }
    if (!d.weapons.length) d.weapons = [CONFIG.player.startWeapon];
    if (!d.weapons.includes(d.equipped)) d.equipped = d.weapons[0];
    this.data = d;
    const st = this.stats();
    // A save made mid-defeat, or one from before a balance change: fix it up.
    if (!(d.hp > 0)) d.hp = st.maxHp;
    d.hp = Math.min(d.hp, st.maxHp);
    d.mp = Math.max(0, Math.min(d.mp, st.maxMp));
    return !!saved;
  },

  save() {
    this.data.savedAt = Date.now();
    return Store.set(CONFIG.saveKey, JSON.stringify(this.data));
  },

  // Deletes the save and starts a fresh hero.
  reset() {
    Store.remove(CONFIG.saveKey);
    this.data = this.defaultData();
  },

  // ---- Stats --------------------------------------------------------------

  skillEffects() {
    const fx = {
      attackBonus: 0, critChance: 0, magicBonus: 0, magicBurn: null,
      magicSlowChance: 0, magicCostReduce: 0, maxHpBonus: 0, damageReduction: 0,
    };
    for (const id of this.data.skills) {
      const effect = SKILLS[id].effect;
      for (const key in effect) {
        if (typeof effect[key] === 'number') fx[key] += effect[key];
        else fx[key] = effect[key];
      }
    }
    return fx;
  },

  stats() {
    const d = this.data;
    const p = CONFIG.player;
    const fx = this.skillEffects();
    const weapon = WEAPONS[d.equipped];
    const lv = d.level - 1;
    return {
      maxHp: p.startHp + lv * p.hpPerLevel + fx.maxHpBonus,
      maxMp: p.startMp + lv * p.mpPerLevel,
      weapon,
      attack: weapon.damage + lv * p.attackPerLevel + fx.attackBonus,
      magic: CONFIG.magic.baseDamage + lv * CONFIG.magic.damagePerLevel + fx.magicBonus,
      magicCost: Math.max(1, CONFIG.magic.cost - fx.magicCostReduce),
      critChance: fx.critChance,
      damageReduction: fx.damageReduction,
      magicSlowChance: fx.magicSlowChance,
      magicBurn: fx.magicBurn,
    };
  },

  xpToNext(level) {
    const lv = level || this.data.level;
    return Math.round(CONFIG.xp.firstLevel * Math.pow(CONFIG.xp.growth, lv - 1));
  },

  // Adds XP and levels up as many times as it pays for. Returns the new levels.
  addXp(amount) {
    const d = this.data;
    const levels = [];
    d.xp += amount;
    while (d.xp >= this.xpToNext()) {
      d.xp -= this.xpToNext();
      d.level += 1;
      d.skillPoints += CONFIG.player.skillPointsPerLevel;
      levels.push(d.level);
    }
    if (levels.length) this.restore();
    return levels;
  },

  // Full health and magic.
  restore() {
    const st = this.stats();
    this.data.hp = st.maxHp;
    this.data.mp = st.maxMp;
  },

  heal(amount) {
    const before = this.data.hp;
    this.data.hp = Math.min(this.stats().maxHp, this.data.hp + amount);
    return this.data.hp - before;
  },

  addGold(amount) {
    this.data.gold = Math.max(0, this.data.gold + amount);
  },

  // ---- Items and swords ---------------------------------------------------

  itemCount(id) {
    return this.data.inventory[id] || 0;
  },

  addItem(id, count) {
    this.data.inventory[id] = this.itemCount(id) + (count || 1);
  },

  removeItem(id, count) {
    const left = this.itemCount(id) - (count || 1);
    if (left > 0) this.data.inventory[id] = left;
    else delete this.data.inventory[id];
  },

  // Drinks a potion outside battle. Returns the health restored, or 0.
  usePotion() {
    if (this.itemCount('potion') < 1 || this.data.hp >= this.stats().maxHp) return 0;
    this.removeItem('potion');
    return this.heal(CONFIG.potion.heal);
  },

  buyPotion() {
    if (this.data.gold < CONFIG.potion.price) return false;
    this.addGold(-CONFIG.potion.price);
    this.addItem('potion');
    return true;
  },

  giveWeapon(id) {
    if (!this.data.weapons.includes(id)) this.data.weapons.push(id);
  },

  equip(id) {
    if (this.data.weapons.includes(id)) this.data.equipped = id;
  },

  // ---- Skills -------------------------------------------------------------

  // Returns null if the skill can be learned, or the reason it can't.
  whyCantLearn(id) {
    const skill = SKILLS[id];
    const d = this.data;
    if (d.skills.includes(id)) return 'Already learned.';
    if (skill.requires && !d.skills.includes(skill.requires)) return 'Learn ' + SKILLS[skill.requires].name + ' first.';
    if (skill.minLevel && d.level < skill.minLevel) return 'Needs level ' + skill.minLevel + '.';
    if (d.skillPoints < 1) return 'No skill points. Level up to earn more.';
    return null;
  },

  learnSkill(id) {
    if (this.whyCantLearn(id)) return false;
    const d = this.data;
    d.skills.push(id);
    d.skillPoints -= 1;
    const hpBonus = SKILLS[id].effect.maxHpBonus;
    if (hpBonus) d.hp += hpBonus;
    return true;
  },

  // ---- Quests -------------------------------------------------------------

  // 'new', 'active', 'ready' (goal done, not handed in) or 'done'.
  questStatus(id) {
    const q = this.data.quests[id];
    if (!q) return 'new';
    if (q.status === 'done') return 'done';
    const p = this.questProgress(id);
    return p.have >= p.need ? 'ready' : 'active';
  },

  questProgress(id) {
    const goal = QUESTS[id].goal;
    const q = this.data.quests[id] || { progress: 0 };
    if (goal.type === 'defeat') return { have: Math.min(q.progress || 0, goal.count), need: goal.count };
    return { have: this.itemCount(goal.item) > 0 ? 1 : 0, need: 1 };
  },

  startQuest(id) {
    if (!this.data.quests[id]) this.data.quests[id] = { status: 'active', progress: 0 };
  },

  // Called after a battle is won. Returns the quests that just became ready.
  recordDefeat(enemyId) {
    const d = this.data;
    d.defeated[enemyId] = (d.defeated[enemyId] || 0) + 1;
    const ready = [];
    for (const id in d.quests) {
      const goal = QUESTS[id].goal;
      if (d.quests[id].status !== 'active' || goal.type !== 'defeat' || goal.enemy !== enemyId) continue;
      const was = this.questStatus(id);
      d.quests[id].progress = (d.quests[id].progress || 0) + 1;
      if (was !== 'ready' && this.questStatus(id) === 'ready') ready.push(id);
    }
    return ready;
  },

  // Hands in a ready quest and pays its reward. Returns what was given.
  completeQuest(id) {
    if (this.questStatus(id) !== 'ready') return null;
    const quest = QUESTS[id];
    const reward = quest.reward;
    if (quest.goal.type === 'collect') this.removeItem(quest.goal.item);
    this.data.quests[id].status = 'done';
    if (reward.gold) this.addGold(reward.gold);
    for (const item in reward.items || {}) this.addItem(item, reward.items[item]);
    if (reward.weapon) this.giveWeapon(reward.weapon);
    const levels = reward.xp ? this.addXp(reward.xp) : [];
    return { reward, levels };
  },

  completedQuests() {
    return Object.keys(this.data.quests).filter((id) => this.data.quests[id].status === 'done');
  },

  // ---- Chests -------------------------------------------------------------

  isChestOpen(id) {
    return this.data.openedChests.includes(id);
  },

  openChest(chest) {
    if (this.isChestOpen(chest.id)) return null;
    this.data.openedChests.push(chest.id);
    const c = chest.contents;
    if (c.gold) this.addGold(c.gold);
    for (const item in c.items || {}) this.addItem(item, c.items[item]);
    return c;
  },
};

// Turns a reward like { gold: 40, items: { potion: 2 } } into "40 gold, 2 Healing Potions".
function describeLoot(loot) {
  const parts = [];
  if (loot.gold) parts.push(loot.gold + ' gold');
  for (const id in loot.items || {}) {
    const n = loot.items[id];
    parts.push(n + ' ' + ITEMS[id].name + (n > 1 ? 's' : ''));
  }
  if (loot.weapon) parts.push(WEAPONS[loot.weapon].name);
  if (loot.xp) parts.push(loot.xp + ' XP');
  return parts.join(', ');
}
