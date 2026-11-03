// BODY.OS — gameplay systems. All state lives in G.data; these functions are the only
// code allowed to change it. They emit events the UI and world react to.
import { G, events, notify, vibrate, writeSave } from './core.js';
import { STATS, UPGRADES, ABILITIES, ITEMS, MISSIONS, LOCATIONS, PRESETS, VISION } from './data.js';
import * as R from './rules.js';
import { sfx } from './audio.js';

const idx = (id) => (typeof id === 'number' ? id : STATS.findIndex((s) => s.id === id));
export const loc = (id) => LOCATIONS.find((l) => l.id === id);
export const upgradeDef = (id) => UPGRADES.find((u) => u.id === id);
export const abilityDef = (id) => ABILITIES.find((a) => a.id === id);
export const itemName = (id) => (ITEMS[id] ? ITEMS[id].name : id);

// World registries, filled by the world builder for the current location.
export const world = { zones: [], flagZones: [], interactables: [], threats: [], timed: [], targets: [] };
export function resetWorld() { for (const k of Object.keys(world)) world[k] = []; }

// =============================================================== Flags & log
export function hasFlag(f) { return !!f && G.flagSet.has(f); }
export function setFlag(f) {
  if (!f || !G.data || G.flagSet.has(f)) return;
  G.flagSet.add(f);
  G.data.story.flags.push(f);
  events.emit('flag', f);
  Missions.onFlag(f);
}
export function log(text) {
  if (!G.data) return;
  const l = G.data.story.log;
  l.push(new Date().toTimeString().slice(0, 5) + '  ' + text);
  while (l.length > 40) l.shift();
}
export function save(showNotice) {
  if (!G.data) return false;
  if (G.player) {
    const p = G.player.safePos;
    G.data.story.pos = { x: p.x, y: p.y, z: p.z, yaw: G.player.yaw };
  }
  Vitals.writeToSave();
  const ok = writeSave(G.data);
  if (showNotice) notify(ok ? 'Progress saved.' : 'Save failed.', ok ? 'success' : 'danger');
  return ok;
}

// =============================================================== Progression
export const Progression = {
  get level() { return G.data.progress.level; },
  get xp() { return G.data.progress.xp; },
  get points() { return G.data.progress.points; },
  get toNext() { return R.xpForLevel(G.data.progress.level); },
  addXp(n, reason) {
    if (n <= 0) return;
    const p = G.data.progress;
    p.xp += n;
    notify('+' + n + ' XP  ' + reason, 'reward');
    while (p.level < R.MAX_LEVEL && p.xp >= R.xpForLevel(p.level)) {
      p.xp -= R.xpForLevel(p.level);
      p.level++; p.points++;
      sfx('levelUp');
      notify('LEVEL ' + p.level + ' REACHED  +1 upgrade point', 'success');
      log('Reached level ' + p.level + '.');
    }
    events.emit('progression');
  },
  addPoints(n) { G.data.progress.points = Math.max(0, G.data.progress.points + n); events.emit('progression'); },
  spend(n) { if (n > G.data.progress.points) return false; G.data.progress.points -= n; events.emit('progression'); return true; },
  discovered(id) { return G.data.progress.discovered.includes(id); },
  discover(id) {
    const l = loc(id);
    if (!l || this.discovered(id)) return;
    G.data.progress.discovered.push(id);
    sfx('discovery');
    notify('LOCATION DISCOVERED: ' + l.name);
    log('Discovered ' + l.name + '.');
    setFlag('location.' + id);
    this.addXp(l.xp || 0, 'exploration');
    this.revealFragments();
  },
  /** Recovers memory fragments the current Memory attribute can reach. Runs on discovery
   *  and whenever Memory changes, so experimenting with Memory is rewarded. */
  revealFragments() {
    const memory = Body.get('memory');
    let found = 0;
    for (const id of G.data.progress.discovered) {
      const l = loc(id);
      if (!l || !l.frags) continue;
      for (const f of l.frags) {
        if (G.data.progress.fragments.includes(f.id) || memory < f.mem) continue;
        G.data.progress.fragments.push(f.id);
        found++;
        notify('MEMORY RECOVERED (' + l.name + '): ' + f.text, 'story');
      }
    }
    if (found) { sfx('memory'); this.addXp(15 * found, 'memory recovered'); }
  },
};

// =============================================================== Inventory
export const Inventory = {
  count(id) { return G.data.inventory[id] || 0; },
  add(id, n, quiet) {
    if (n <= 0) return;
    G.data.inventory[id] = Math.min(9999, this.count(id) + n);
    if (!quiet) notify('+' + n + ' ' + itemName(id), 'reward');
    setFlag('item.' + id);
    events.emit('inventory');
  },
  remove(id, n) {
    if (this.count(id) < n) return false;
    G.data.inventory[id] -= n;
    if (G.data.inventory[id] <= 0) delete G.data.inventory[id];
    events.emit('inventory');
    return true;
  },
  use(id) {
    if (this.count(id) <= 0) return false;
    if (id === 'energy_capsule') {
      if (Vitals.energy >= Vitals.maxEnergy - 0.5) { notify('Energy already full.'); return false; }
      Vitals.addEnergy(50);
    } else if (id === 'medigel') {
      if (Vitals.health >= Vitals.maxHealth - 0.5) { notify('Health already full.'); return false; }
      Vitals.heal(40);
    } else { notify('That item can’t be used directly.'); return false; }
    this.remove(id, 1);
    sfx('recharge');
    notify('Used ' + itemName(id) + '.', 'success');
    return true;
  },
};

// =============================================================== Upgrades
let totals = {}, capBonus = [], visions = new Set(), abilities = new Set();
export const Upgrades = {
  tier(id) { return G.data.upgrades[id] || 0; },
  total(t) { return totals[t] || 0; },
  capBonus(i) { return capBonus[i] || 0; },
  visionUnlocked(k) { return visions.has(k); },
  abilityUnlocked(id) { return abilities.has(id); },
  recompute() {
    totals = {}; capBonus = STATS.map(() => 0); visions = new Set(); abilities = new Set();
    for (const [id, tier] of Object.entries(G.data.upgrades)) {
      const def = upgradeDef(id);
      if (!def || tier <= 0) continue;
      for (const fx of def.fx) {
        if (fx.t === 'cap') capBonus[idx(fx.stat)] += fx.v * tier;
        else if (fx.t === 'vision') visions.add(fx.key);
        else if (fx.t === 'ability') abilities.add(fx.key);
        else totals[fx.t] = (totals[fx.t] || 0) + fx.v * tier;
      }
    }
  },
  cost(def, tier) {
    const at = (a) => a[Math.min(Math.max(tier - 1, 0), a.length - 1)] || 0;
    return { pts: at(def.pts), nan: at(def.nan) };
  },
  /** { state: 'installed'|'locked'|'afford'|'available', reason } */
  evaluate(def) {
    const tier = this.tier(def.id);
    if (tier >= def.tiers) return { state: 'installed', reason: 'Fully installed' };
    if (Progression.level < def.level) return { state: 'locked', reason: 'Requires level ' + def.level };
    for (const r of def.requires || []) if (this.tier(r) <= 0) return { state: 'locked', reason: 'Requires ' + upgradeDef(r).name };
    for (const f of def.flags || []) if (!hasFlag(f)) return { state: 'locked', reason: def.hint || 'Locked' };
    const c = this.cost(def, tier + 1);
    if (Progression.points < c.pts) return { state: 'afford', reason: 'Needs ' + c.pts + ' upgrade point' + (c.pts === 1 ? '' : 's') };
    if (Inventory.count('nanites') < c.nan) return { state: 'afford', reason: 'Needs ' + c.nan + ' nanites' };
    return { state: 'available', reason: '' };
  },
  install(id) {
    const def = upgradeDef(id);
    const ev = this.evaluate(def);
    if (ev.state !== 'available') { sfx('denied'); notify(def.name + ': ' + ev.reason, 'warning'); return false; }
    const tier = this.tier(id) + 1;
    const c = this.cost(def, tier);
    Progression.spend(c.pts);
    if (c.nan) Inventory.remove('nanites', c.nan);
    G.data.upgrades[id] = tier;
    this.recompute();
    sfx('upgrade'); vibrate('success');
    notify('INSTALLED: ' + def.name + (def.tiers > 1 ? ' (tier ' + tier + ')' : ''), 'success');
    log('Installed ' + def.name + ' tier ' + tier + '.');
    setFlag('upgrade.' + id);
    Reality.autoAssign();
    Vitals.clampToMax();
    Body.revalidate(false);
    events.emit('stats'); events.emit('abilities'); events.emit('vision');
    save(false);
    return true;
  },
  /** System Restore: uninstall everything, refund all points and nanites (prevents soft-locks). */
  refundAll() {
    let pts = 0, nan = 0;
    for (const [id, t] of Object.entries(G.data.upgrades)) {
      const def = upgradeDef(id);
      if (!def) continue;
      for (let i = 1; i <= t; i++) { const c = this.cost(def, i); pts += c.pts; nan += c.nan; }
    }
    G.data.upgrades = {};
    this.recompute();
    Progression.addPoints(pts);
    if (nan) Inventory.add('nanites', nan, true);
    Reality.cancelAll();
    Body.revalidate(true);
    Vision.validate();
    Vitals.clampToMax();
    sfx('reality');
    notify('System Restore complete. Refunded ' + pts + ' points and ' + nan + ' nanites.');
    log('System Restore: upgrades refunded.');
    events.emit('stats'); events.emit('abilities'); events.emit('vision');
    save(false);
  },
};

// =============================================================== Body / brain attributes
export const Body = {
  get(id) { return G.data.stats[idx(id)]; },
  cap(id) { return R.clamp(R.BASE_CAP + Upgrades.capBonus(idx(id)), R.MIN, R.MAX); },
  budget(pool) { return pool === 'body' ? R.BASE_BODY_BUDGET + Upgrades.total('bodyBudget') : pool === 'brain' ? R.BASE_BRAIN_BUDGET + Upgrades.total('brainBudget') : 0; },
  used(pool) { return R.poolTotal(G.data.stats, pool); },
  free(pool) { return this.budget(pool) - this.used(pool); },
  maxSettable(id) {
    const i = idx(id), pool = STATS[i].pool;
    return pool === 'none' ? this.cap(i) : Math.min(this.cap(i), this.get(i) + Math.max(0, this.free(pool)));
  },
  /** Returns null on success or a reason string. */
  trySet(id, value) {
    const i = idx(id);
    value = R.clamp(Math.round(value), R.MIN, R.MAX);
    const old = this.get(i);
    if (value === old) return null;
    if (value > this.cap(i)) return STATS[i].name + ' is capped at ' + this.cap(i) + '. Technology upgrades can raise the cap.';
    const pool = STATS[i].pool;
    if (pool !== 'none' && value > old && this.used(pool) - old + value > this.budget(pool))
      return (pool === 'body' ? 'Bio' : 'Neural') + '-allocation full (' + this.used(pool) + '/' + this.budget(pool) + '). Lower another attribute first.';
    G.data.stats[i] = value;
    setFlag('os.adjusted');
    events.emit('stats');
    if (STATS[i].id === 'memory') Progression.revealFragments();
    return null;
  },
  /** Applies a full set (preset). Validated against current caps/budgets; returns true if adapted. */
  applyAll(values) {
    const oldMem = this.get('memory');
    const r = R.sanitize(values, (i) => this.cap(i), this.budget('body'), this.budget('brain'));
    G.data.stats = r.values;
    setFlag('os.adjusted');
    events.emit('stats');
    if (this.get('memory') !== oldMem) Progression.revealFragments();
    return r.changed;
  },
  revalidate(showNotice) {
    const r = R.sanitize(G.data.stats, (i) => this.cap(i), this.budget('body'), this.budget('brain'));
    G.data.stats = r.values;
    if (r.changed && showNotice) notify('Configuration adapted to current hardware limits.', 'warning');
    if (r.changed) events.emit('stats');
  },
  reset() { this.applyAll(R.defaults()); notify('Configuration recalibrated to balanced defaults.'); },

  get moveSpeed() { return R.moveSpeed(this.get('speed'), this.get('throttle')); },
  get jumpHeight() { return R.jumpHeight(this.get('jump'), this.get('throttle')); },
  get consumption() { return R.throttleCons(this.get('throttle')); },
  get endurance() { return R.enduranceDrain(this.get('endurance')); },
  get threatRadius() { return R.threatRadius(this.get('threat')); },
  get threatDirection() { return R.threatDirection(this.get('threat')); },
  get calWindow() { return R.calibrationWindow(this.get('reaction')); },
  get calSpeed() { return R.calibrationSpeed(this.get('reaction')); },
  get interference() { return R.interferenceChance(this.get('concentration')); },
  get analysis() { return R.analysisMult(this.get('analysis')); },

  describe(id, v) {
    const t = this.get('throttle');
    switch (STATS[idx(id)].id) {
      case 'strength': return 'Push objects up to mass class ' + v + '.';
      case 'speed': return 'Move speed ' + R.moveSpeed(v, t).toFixed(1) + ' m/s. Movement drain x' + (v / 5).toFixed(2) + '.';
      case 'jump': return 'Jump height ' + R.jumpHeight(v, t).toFixed(2) + ' m (normal gravity).';
      case 'endurance': return 'Sustained drain x' + R.enduranceDrain(v).toFixed(2) + ' (movement, vision).';
      case 'recovery': return 'Energy regen ' + (R.energyRegen(v) * Vitals.regenMult).toFixed(2) + '/s, health regen ' + R.healthRegen(v).toFixed(1) + '/s.';
      case 'throttle': return 'Performance x' + R.throttlePerf(v).toFixed(2) + ', consumption x' + R.throttleCons(v).toFixed(2) + '.';
      case 'reaction': return 'Calibration window ' + Math.round(R.calibrationWindow(v) * 100) + '%, marker speed ' + R.calibrationSpeed(v).toFixed(2) + '.';
      case 'concentration': return 'Interference disrupts scans ' + Math.round(R.interferenceChance(v) * 100) + '% of the time.';
      case 'memory': return 'Recovers memory fragments rated ' + v + ' or lower.';
      case 'threat': return 'Detect hostiles within ' + Math.round(R.threatRadius(v)) + ' m' + (R.threatDirection(v) ? ', with direction.' : '. 7+ shows direction.');
      case 'analysis': return 'Scan time and energy x' + R.analysisMult(v).toFixed(2) + '.';
    }
    return '';
  },
};

// =============================================================== Vitals (health, energy, suit)
export const LOW = 0.2, CRITICAL = 0.06;
export const Vitals = {
  health: 100, energy: 100, suit: 100, moving: false,
  breakdown: { regen: 0, passive: 0, overclock: 0, movement: 0, vision: 0, environment: 0, drain: 0, net: 0 },
  regenDelay: 0, healthDelay: 0, lowWarned: false, critWarned: false, raise: 0,
  init() {
    const v = G.data.vitals;
    this.health = R.clamp(v.health, 1, this.maxHealth);
    this.energy = R.clamp(v.energy, 0, this.maxEnergy);
    this.suit = R.clamp(v.suit, 0, this.maxSuit);
    this.lowWarned = this.critWarned = false;
  },
  get maxHealth() { return 100 + Upgrades.total('maxHealth'); },
  get maxEnergy() { return 100 + Upgrades.total('maxEnergy'); },
  get maxSuit() { return 100 + Upgrades.total('suit'); },
  get regenMult() { return 1 + Upgrades.total('regen'); },
  get fraction() { return this.energy / this.maxEnergy; },
  get low() { return this.fraction < LOW; },
  get critical() { return this.fraction < CRITICAL; },
  get speedMult() { return this.critical ? 0.75 : 1; },
  tick(dt) {
    const cons = Body.consumption, end = Body.endurance, b = this.breakdown;
    b.passive = 0.25 * cons;
    b.overclock = R.overclockDrain(G.data.stats) * cons;
    b.movement = this.moving ? 0.35 * (Body.get('speed') / 5) * end * cons : 0;
    b.vision = Vision.drain * end * cons;
    b.environment = Environment.extraDrain;
    b.regen = this.regenDelay > 0 ? 0 : R.energyRegen(Body.get('recovery')) * this.regenMult;
    b.drain = b.passive + b.overclock + b.movement + b.vision + b.environment;
    b.net = b.regen - b.drain;
    if (this.regenDelay > 0) this.regenDelay -= dt;
    this.energy = R.clamp(this.energy + b.net * dt, 0, this.maxEnergy);
    if (this.healthDelay > 0) this.healthDelay -= dt;
    else if (this.health < this.maxHealth && !Environment.damaging)
      this.health = Math.min(this.maxHealth, this.health + R.healthRegen(Body.get('recovery')) * this.regenMult * dt);

    const f = this.fraction;
    if (!this.lowWarned && f < LOW) { this.lowWarned = true; sfx('lowEnergy'); notify('LOW ENERGY. Expensive modes and abilities are restricted. Find a recharge station.', 'warning'); }
    else if (this.lowWarned && f > LOW + 0.08) this.lowWarned = false;
    if (!this.critWarned && f < CRITICAL) { this.critWarned = true; sfx('lowEnergy'); vibrate('heavy'); notify('CRITICAL ENERGY. Low power mode: movement reduced.', 'danger'); }
    else if (this.critWarned && f > CRITICAL + 0.05) this.critWarned = false;

    this.raise -= dt;
    if (this.raise <= 0) { this.raise = 0.1; events.emit('vitals'); }
  },
  canSpend(n) { return this.energy >= n; },
  trySpend(n) { if (this.energy < n) return false; this.energy -= n; this.regenDelay = 1.5; events.emit('vitals'); return true; },
  addEnergy(n) { this.energy = R.clamp(this.energy + n, 0, this.maxEnergy); events.emit('vitals'); },
  refill() { this.energy = this.maxEnergy; this.suit = this.maxSuit; this.health = Math.min(this.maxHealth, this.health + 25); events.emit('vitals'); },
  heal(n) { this.health = R.clamp(this.health + n, 0, this.maxHealth); events.emit('vitals'); },
  damage(n, source) {
    if (n <= 0 || !G.inGame) return;
    this.health -= n;
    this.healthDelay = 4;
    events.emit('damage');
    events.emit('vitals');
    if (this.health <= 0) {
      this.health = 0;
      log('Collapsed: ' + source + '.');
      events.emit('collapse');
    }
  },
  drainSuit(n) { this.suit = Math.max(0, this.suit - n); },
  chargeSuit(n) { this.suit = Math.min(this.maxSuit, this.suit + n); },
  revive() { this.health = this.maxHealth; this.energy = Math.max(this.energy, this.maxEnergy * 0.5); this.suit = this.maxSuit; this.healthDelay = 0; events.emit('vitals'); },
  clampToMax() { this.health = Math.min(this.health, this.maxHealth); this.energy = Math.min(this.energy, this.maxEnergy); this.suit = Math.min(this.suit, this.maxSuit); events.emit('vitals'); },
  writeToSave() { G.data.vitals = { health: Math.max(1, this.health), energy: this.energy, suit: this.suit }; },
};

// =============================================================== Vision
export const visionInfo = (id) => VISION.find((v) => v.id === id) || VISION[0];
export const Vision = {
  current: 'normal', revealed: false,
  init() { this.current = this.unlocked(G.data.vision) ? G.data.vision : 'normal'; this.revealed = false; },
  get info() { return visionInfo(this.current); },
  get drain() { return this.info.drain * (1 - R.clamp(Upgrades.total('visionDrain'), 0, 0.6)); },
  get scanRange() { return 14 * (1 + Upgrades.total('scanRange')); },
  unlocked(id) { const v = visionInfo(id); return v.id === id && (!v.unlock || Upgrades.visionUnlocked(v.unlock)); },
  canActivate(id) {
    const v = visionInfo(id);
    if (!this.unlocked(id)) return v.name + ' requires a technology upgrade.';
    if (id !== 'normal' && Vitals.fraction < Math.max(v.min, 0.01)) return 'Not enough energy for ' + v.name + '.';
    return null;
  },
  set(id, feedback = true) {
    const why = this.canActivate(id);
    if (why) { if (feedback) { sfx('denied'); notify(why, 'warning'); } return false; }
    if (id === this.current) return true;
    this.current = id;
    G.data.vision = id;
    if (feedback) { sfx(id === 'scanner' ? 'scan' : 'vision'); notify('VISION: ' + this.info.name); }
    setFlag('vision.' + id);
    this.update();
    return true;
  },
  cycle() {
    const i = VISION.findIndex((v) => v.id === this.current);
    for (let k = 1; k <= VISION.length; k++) {
      const n = VISION[(i + k) % VISION.length];
      if (this.unlocked(n.id) && !this.canActivate(n.id)) { this.set(n.id); return; }
    }
  },
  validate() { if (!this.unlocked(this.current)) this.set('normal', false); },
  tick() {
    const v = this.info;
    if (this.current !== 'normal' && Vitals.fraction < Math.max(v.min, 0.005)) {
      this.set('normal', false); sfx('denied'); notify(v.name + ' offline: insufficient energy.', 'warning');
    }
    const rev = this.current === 'dimensional' || Reality.dimensional;
    if (rev !== this.revealed) this.update();
  },
  update() {
    this.revealed = this.current === 'dimensional' || Reality.dimensional;
    events.emit('vision');
  },
};

// =============================================================== Environment
export const SHIP = { name: 'Ship standard', temp: 19, atmo: 0, rad: 0, gravity: 1 };
export const coldSeverity = (c) => (c.temp < -120 ? 3 : c.temp < -60 ? 2 : c.temp < -15 ? 1 : 0);
export const toxicSeverity = (c) => c.atmo | 0; // 0 safe, 1 thin, 2 toxic
export const atmoName = (a) => ['Breathable', 'Thin', 'Toxic'][a | 0];
const hazardous = (c) => coldSeverity(c) > 0 || toxicSeverity(c) > 0 || c.rad > 0;

export const Environment = {
  cond: SHIP, zone: null, extraDrain: 0, speedMult: 1, damaging: false,
  cold: 0, toxic: 0, radD: 0, poll: 0, warn: 0,
  get protCold() { return 1 + Upgrades.total('protCold'); },
  get protToxic() { return Upgrades.total('protToxic'); },
  get protRad() { return Upgrades.total('protRad'); },
  get deficit() { return this.cold > 0 || this.toxic > 0 || this.radD > 0; },
  get hazardous() { return hazardous(this.cond); },
  reset() { this.cond = SHIP; this.zone = null; this.damaging = false; },
  tick(dt, playerPos) {
    this.poll -= dt;
    if (this.poll <= 0 && playerPos) {
      this.poll = 0.2;
      let best = null;
      for (const z of world.zones)
        if (Math.abs(playerPos.x - z.cx) <= z.sx / 2 && Math.abs(playerPos.y + 0.9 - z.cy) <= z.sy / 2 && Math.abs(playerPos.z - z.cz) <= z.sz / 2 &&
          (!best || (z.priority || 0) > (best.priority || 0))) best = z;
      if (best !== this.zone) { this.zone = best; this.cond = best ? best.cond : SHIP; this.entered(); }
    }
    const c = this.cond;
    this.cold = Math.max(0, coldSeverity(c) - this.protCold);
    this.toxic = Math.max(0, toxicSeverity(c) - this.protToxic);
    this.radD = Math.max(0, c.rad - this.protRad);
    this.extraDrain = coldSeverity(c) * 0.35 + this.cold * 0.8;
    this.speedMult = this.cold > 0 ? 0.8 : 1;
    const def = this.cold + this.toxic + this.radD;
    this.damaging = false;
    if (def > 0) {
      if (Vitals.suit > 0) Vitals.drainSuit(def * 7 * dt);
      else { this.damaging = true; Vitals.damage((this.toxic * 5 + this.radD * 6 + this.cold * 2) * dt, c.name); }
    } else Vitals.chargeSuit((hazardous(c) ? 1.5 : 6) * dt);
    this.warn -= dt;
    if (this.damaging && this.warn <= 0) { this.warn = 4; sfx('hazard'); vibrate('heavy'); notify('SUIT DEPLETED. Taking environmental damage. Leave the area.', 'danger'); }
  },
  entered() {
    const c = this.cond;
    if (this.zone) {
      const parts = [];
      if (coldSeverity(c)) parts.push('EXTREME COLD ' + c.temp + '°C (protection ' + this.protCold + '/' + coldSeverity(c) + ')');
      if (toxicSeverity(c)) parts.push((c.atmo === 2 ? 'TOXIC' : 'THIN') + ' ATMOSPHERE (protection ' + this.protToxic + '/' + toxicSeverity(c) + ')');
      if (c.rad) parts.push('RADIATION ' + c.rad + ' (protection ' + this.protRad + '/' + c.rad + ')');
      if (parts.length) {
        const short = coldSeverity(c) > this.protCold || toxicSeverity(c) > this.protToxic || c.rad > this.protRad;
        sfx('hazard'); notify(parts.join('  '), short ? 'danger' : 'warning');
      }
      if (Math.abs(c.gravity - 1) > 0.05) notify('GRAVITY ANOMALY: ' + c.gravity.toFixed(1) + ' g');
      setFlag('hazard.entered');
    }
    events.emit('environment');
  },
};

// =============================================================== Reality abilities
// Each ability is a modular effect with begin/end hooks. They only affect objects
// designed for them (timed machines, portals, phase-locked objects, hidden things)
// and the player's own gravity response: no free-form world editing.
const EFFECTS = {
  reduced_gravity: { begin: (s) => { s.gravityMult = 0.35; }, end: (s) => { s.gravityMult = 1; } },
  time_distortion: { begin: (s) => { s.timeScale = 0.2; }, end: (s) => { s.timeScale = 1; } },
  spatial_anomaly: { begin: (s) => { s.spatial = true; }, end: (s) => { s.spatial = false; } },
  dimensional_perception: { begin: (s) => { s.dimensional = true; }, end: (s) => { s.dimensional = false; } },
  matter_interaction: { begin: (s) => { s.matter = true; }, end: (s) => { s.matter = false; } },
};
export const Reality = {
  list: [], gravityMult: 1, timeScale: 1, spatial: false, dimensional: false, matter: false,
  init() {
    this.list = ABILITIES.map((def) => ({ def, active: 0, cooldown: 0 }));
    this.gravityMult = 1; this.timeScale = 1; this.spatial = this.dimensional = this.matter = false;
  },
  get(id) { return this.list.find((r) => r.def.id === id); },
  unlocked(id) { return Upgrades.abilityUnlocked(id); },
  get anyUnlocked() { return this.list.some((r) => this.unlocked(r.def.id)); },
  autoAssign() {
    const slots = G.data.slots;
    for (const r of this.list) {
      if (!this.unlocked(r.def.id) || slots.includes(r.def.id)) continue;
      const free = slots.indexOf('');
      if (free < 0) return;
      slots[free] = r.def.id;
    }
  },
  canActivate(id) {
    const r = this.get(id);
    if (!r) return 'Unknown ability.';
    if (!this.unlocked(id)) return r.def.name + ' is locked. Install its reality module.';
    if (r.active > 0) return r.def.name + ' is already active.';
    if (r.cooldown > 0) return r.def.name + ' recharging (' + Math.ceil(r.cooldown) + 's).';
    if (Vitals.low) return 'Energy too low for reality manipulation (needs 20%+).';
    if (!Vitals.canSpend(r.def.cost)) return 'Needs ' + r.def.cost + ' energy.';
    return null;
  },
  activate(id) {
    const why = this.canActivate(id);
    if (why) { sfx('denied'); notify(why, 'warning'); return false; }
    const r = this.get(id);
    Vitals.trySpend(r.def.cost);
    r.active = r.def.dur;
    EFFECTS[id].begin(this);
    sfx('reality'); vibrate('medium');
    events.emit('realityFx', r.def);
    notify(r.def.name.toUpperCase() + ' ENGAGED (' + r.def.dur + 's)');
    setFlag('ability.' + id);
    log('Used ' + r.def.name + '.');
    events.emit('abilities');
    Vision.tick();
    return true;
  },
  tick(dt) {
    for (const r of this.list) {
      if (r.active > 0) {
        r.active -= dt;
        if (r.active <= 0) {
          r.active = 0; r.cooldown = r.def.cd;
          EFFECTS[r.def.id].end(this);
          notify(r.def.name + ' ended.');
          events.emit('abilities');
        }
      } else if (r.cooldown > 0) {
        r.cooldown -= dt;
        if (r.cooldown <= 0) { r.cooldown = 0; events.emit('abilities'); }
      }
    }
  },
  cancelAll() {
    for (const r of this.list) { if (r.active > 0) EFFECTS[r.def.id].end(this); r.active = 0; }
    events.emit('abilities');
  },
  /** Local time scale for a designated machine at (x, z): slowed within the effect radius. */
  timeScaleAt(x, z) {
    if (this.timeScale >= 1 || !G.player) return 1;
    const p = G.player.pos, rad = abilityDef('time_distortion').radius;
    return (p.x - x) ** 2 + (p.z - z) ** 2 <= rad * rad ? this.timeScale : 1;
  },
};

// =============================================================== Missions
export const Missions = {
  objTime: 0, hint: false,
  get active() { return MISSIONS.find((m) => m.id === G.data.story.active) || null; },
  state(id) { const s = G.data.story.missions; return s[id] || (s[id] = { obj: 0, done: false }); },
  done(id) { const s = G.data.story.missions[id]; return !!(s && s.done); },
  get objective() {
    const m = this.active;
    if (!m) return null;
    const st = this.state(m.id);
    return st.done || st.obj >= m.objectives.length ? null : m.objectives[st.obj];
  },
  begin() {
    if (!this.active || this.done(G.data.story.active)) this.startNext();
    this.catchUp();
    events.emit('mission');
  },
  startNext() {
    for (const m of MISSIONS) {
      if (this.done(m.id) || (m.start && !hasFlag(m.start))) continue;
      const isNew = G.data.story.active !== m.id;
      G.data.story.active = m.id;
      this.state(m.id);
      this.objTime = 0; this.hint = false;
      if (isNew) { notify('NEW MISSION: ' + m.title, 'story'); log('Mission started: ' + m.title + '.'); }
      return;
    }
    G.data.story.active = '';
  },
  onFlag(f) {
    if (!G.data) return;
    const o = this.objective;
    if (o && o.flag === f) { this.completeObjective(); return; }
    if (!this.active) { this.startNext(); this.catchUp(); events.emit('mission'); }
  },
  catchUp() {
    for (let g = 0; g < 32; g++) { const o = this.objective; if (!o || !hasFlag(o.flag)) break; this.completeObjective(); }
  },
  completeObjective() {
    const m = this.active, st = this.state(m.id), o = m.objectives[st.obj];
    st.obj++;
    this.objTime = 0; this.hint = false;
    sfx('objective');
    notify('OBJECTIVE COMPLETE: ' + o.text, 'success');
    Progression.addXp(o.xp, 'objective');
    if (o.points) { Progression.addPoints(o.points); notify('+' + o.points + ' upgrade point', 'reward'); }
    if (st.obj >= m.objectives.length) { this.completeMission(m, st); return; }
    events.emit('mission');
    save(false);
    this.catchUp();
  },
  completeMission(m, st) {
    st.done = true;
    sfx('mission'); vibrate('success');
    notify('MISSION COMPLETE: ' + m.title, 'success');
    log('Mission complete: ' + m.title + '.');
    Progression.addXp(m.xp, 'mission');
    if (m.points) Progression.addPoints(m.points);
    if (m.nanites) Inventory.add('nanites', m.nanites);
    events.emit('missionComplete', m);
    G.data.story.active = '';
    if (m.complete) setFlag(m.complete);
    if (!this.active) this.startNext();
    this.catchUp();
    events.emit('mission');
    save(false);
  },
  tick(dt) {
    if (!this.objective || this.hint) return;
    this.objTime += dt;
    if (this.objTime > 75) {
      this.hint = true;
      const o = this.objective;
      if (o.hint) notify('HINT: ' + o.hint);
      events.emit('mission');
    }
  },
};

// =============================================================== Presets
export const Presets = {
  init() {
    for (const p of PRESETS) if (!G.data.presets.find((x) => x.id === p.id)) G.data.presets.push({ ...p, stats: p.stats.slice() });
  },
  get all() { return G.data.presets; },
  load(id) {
    const p = this.all.find((x) => x.id === id);
    if (!p) return;
    const adapted = Body.applyAll(p.stats.slice());
    const report = [];
    if (adapted) STATS.forEach((s, i) => { if (G.data.stats[i] < p.stats[i]) report.push(s.name + ' ' + p.stats[i] + '→' + G.data.stats[i]); });
    if (Vision.unlocked(p.vision)) Vision.set(p.vision, false); else report.push(visionInfo(p.vision).name + ' locked');
    sfx('upgrade');
    log('Loaded preset ' + p.name + '.');
    notify('Preset ' + p.name + ' loaded.' + (report.length ? ' Restricted by current hardware: ' + report.join(', ') : ''), report.length ? 'warning' : 'success');
  },
  saveCurrent(id) {
    const p = this.all.find((x) => x.id === id);
    if (!p) return;
    p.stats = G.data.stats.slice(); p.vision = Vision.current; p.custom = true;
    sfx('confirm'); notify('Current configuration saved to ' + p.name + '.', 'success');
    save(false);
  },
  reset(id) {
    const i = this.all.findIndex((x) => x.id === id), def = PRESETS.find((x) => x.id === id);
    if (i < 0 || !def) return;
    this.all[i] = { ...def, stats: def.stats.slice() };
    notify(def.name + ' restored to factory values.');
    save(false);
  },
};

// =============================================================== Threat detection
export const Threats = {
  nearest: null, distance: 0, dirX: 0, dirZ: 0, was: false,
  poll(p) {
    this.nearest = null;
    if (!p) return;
    const r = Body.threatRadius;
    let best = r * r;
    for (const t of world.threats) {
      const d = (t.pos.x - p.x) ** 2 + (t.pos.z - p.z) ** 2 + (t.pos.y - p.y - 1) ** 2;
      if (d < best) { best = d; this.nearest = t; }
    }
    if (this.nearest) {
      const dx = this.nearest.pos.x - p.x, dz = this.nearest.pos.z - p.z;
      this.distance = Math.sqrt(best);
      const l = Math.hypot(dx, dz) || 1;
      this.dirX = dx / l; this.dirZ = dz / l;
      if (!this.was) { sfx('threat'); notify('THREAT DETECTED: ' + this.nearest.threatName, 'danger'); setFlag('threat.detected'); }
    }
    this.was = !!this.nearest;
  },
};

// =============================================================== Session
export function startSession(data) {
  G.data = data;
  G.flagSet = new Set(data.story.flags);
  Upgrades.recompute();
  Body.revalidate(false);
  Vitals.init();
  Environment.reset();
  Reality.init();
  Vision.init();
  Presets.init();
  Missions.objTime = 0; Missions.hint = false;
}

export function tickSystems(dt, playerPos) {
  G.data.playTime += dt;
  Environment.tick(dt, playerPos);
  Reality.tick(dt);
  Vision.tick(dt);
  Vitals.tick(dt);
  Missions.tick(dt);
}
