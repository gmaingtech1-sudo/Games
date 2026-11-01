// Turn-based combat engine. Pure game logic: no DOM. The UI calls act() with
// the player's chosen action and receives a list of events to animate.
//
// Turn order: player acts -> (enemy alive?) enemy turn -> player turn starts
// (cooldowns, mana regen, status ticks). Stuns can make a side lose its turn.
// act() is rejected unless it is the player's turn, so double clicks and
// actions after the fight has ended do nothing.

import { getAbility, manaCost } from './abilities.js';
import { ENEMY_ABILITIES, chooseEnemyAction } from './enemies.js';
import { applyEffect, tickStartOfTurn, statMultiplier, effectPower, hasEffect, removeEffects, DEBUFFS, EFFECTS } from './statusEffects.js';
import { getItem } from './items.js';
import { clamp, makeRng } from './utils.js';
import { CLASSES } from './character.js';

const DOTS = ['poison', 'burn', 'bleed'];

/** Build the player's combat unit from saved state and derived stats. */
export function buildPlayerUnit(player, stats, abilityIds) {
  const weapon = player.equipment?.weapon ? getItem(player.equipment.weapon.id) : null;
  return {
    side: 'player', name: player.name, level: player.level, classId: player.classId,
    maxHp: stats.maxHp, hp: clamp(player.hp, 0, stats.maxHp), maxMp: stats.maxMp, mp: clamp(player.mp, 0, stats.maxMp),
    atk: stats.atk, def: stats.def, spd: stats.spd, crit: stats.crit, critDmg: stats.critDmg, res: stats.res,
    mods: stats.mods || {}, abilities: [...abilityIds], effects: [], weak: [], resist: [], immune: [], tags: [],
    basicMult: CLASSES[player.classId]?.basicMult || 1,
    mpRegen: CLASSES[player.classId]?.mpRegen ?? 0.04,
    bonusVs: weapon?.bonusVs || null,
  };
}

export class Combat {
  constructor({ player, enemy, rng, canFlee = true, mode = 'normal', hooks = {} }) {
    this.p = player;
    this.e = enemy;
    this.rng = rng || makeRng();
    this.canFlee = canFlee && !enemy.isBoss;
    this.mode = mode; // 'normal' | 'boss' | 'test'
    this.hooks = hooks;
    this.phase = 'player';
    this.turn = 1;
    this.cooldowns = {};
    this.defending = false;
    this.events = [];
    this.stats = { damageDealt: 0, damageTaken: 0, crits: 0 };
    this.maxTurns = 250;
  }

  get over() { return ['victory', 'defeat', 'fled'].includes(this.phase); }

  /* ---------------- Queries for the UI ---------------- */

  abilityState(id) {
    const a = getAbility(id);
    if (!a) return { usable: false, reason: 'Unknown ability' };
    const cost = manaCost(a, this.p.level);
    const cd = this.cooldowns[id] || 0;
    if (this.phase !== 'player') return { usable: false, reason: 'Not your turn', cost, cd };
    if (cd > 0) return { usable: false, reason: `Cooldown: ${cd} turn${cd > 1 ? 's' : ''}`, cost, cd };
    if (this.p.mp < cost) return { usable: false, reason: `Needs ${cost} mana`, cost, cd };
    return { usable: true, cost, cd };
  }

  /* ---------------- Player actions ---------------- */

  /**
   * action: { type: 'attack' } | { type: 'ability', id } | { type: 'item', uid }
   *       | { type: 'defend' } | { type: 'flee' }
   * Returns { ok, error?, events }.
   */
  act(action) {
    if (this.phase !== 'player') return { ok: false, error: this.over ? 'The battle is over.' : 'Wait for your turn.', events: [] };
    const err = this.validate(action);
    if (err) return { ok: false, error: err, events: [] };
    this.events = [];
    this.phase = 'resolving';
    try {
      this.performPlayerAction(action);
      if (!this.over) this.afterPlayerAction();
    } catch (err) {
      // Never leave the fight stuck: report and hand the turn back.
      console.error('combat error', err);
      if (!this.over) this.phase = 'player';
      this.log('Something strange happened. The fight continues.', 'info');
    }
    return { ok: true, events: this.events };
  }

  validate(action) {
    if (!action || typeof action !== 'object') return 'Invalid action.';
    switch (action.type) {
      case 'attack': case 'defend': return null;
      case 'flee': return this.canFlee ? null : (this.e.isBoss ? 'You cannot flee from a boss!' : 'You cannot flee from this fight.');
      case 'ability': {
        if (!this.p.abilities.includes(action.id)) return 'You have not learned that ability.';
        const st = this.abilityState(action.id);
        return st.usable ? null : st.reason;
      }
      case 'item': {
        const def = this.hooks.peekItem ? this.hooks.peekItem(action.uid) : null;
        if (!def) return 'You do not have that item.';
        if (def.type !== 'potion') return 'That item cannot be used in combat.';
        if (def.effect.flee && !this.canFlee) return 'Smoke will not save you from a boss!';
        return null;
      }
      default: return 'Unknown action.';
    }
  }

  performPlayerAction(action) {
    const p = this.p, e = this.e;
    switch (action.type) {
      case 'attack':
        this.log(`${p.name} attacks!`, 'player');
        this.strike(p, e, { name: 'Attack', mult: p.basicMult, element: 'physical' });
        break;
      case 'defend':
        this.defending = true;
        {
          const mp = Math.round(p.maxMp * 0.1);
          const before = p.mp;
          p.mp = Math.min(p.maxMp, p.mp + mp);
          this.log(`${p.name} braces for the next attack${p.mp > before ? ` and recovers ${p.mp - before} mana` : ''}.`, 'player');
          if (e.charging) this.log('You are ready for the incoming blow!', 'good');
          this.push({ type: 'defend', target: 'player' });
        }
        break;
      case 'flee': {
        const chance = clamp(0.5 + (p.spd - e.spd) * 0.03, 0.2, 0.9);
        if (this.rng() < chance) {
          this.log(`${p.name} escapes!`, 'player');
          this.phase = 'fled';
          this.push({ type: 'end', result: 'fled' });
        } else {
          this.log(`${p.name} tries to flee but ${e.name} blocks the way!`, 'bad');
        }
        break;
      }
      case 'item': this.useItem(action.uid); break;
      case 'ability': this.useAbility(getAbility(action.id)); break;
    }
    if (!this.over && e.hp <= 0) this.victory();
  }

  useItem(uid) {
    const p = this.p;
    const def = this.hooks.consumeItem ? this.hooks.consumeItem(uid) : null;
    if (!def) { this.log('The item fizzles uselessly.', 'bad'); return; }
    this.log(`${p.name} uses ${def.name}.`, 'player');
    this.push({ type: 'item', id: def.id });
    const fx = def.effect || {};
    if (fx.healPct || fx.healMin) this.heal(p, Math.max(fx.healMin || 0, Math.round(p.maxHp * (fx.healPct || 0))), false);
    if (fx.manaPct || fx.manaMin) {
      const before = p.mp;
      p.mp = Math.min(p.maxMp, p.mp + Math.max(fx.manaMin || 0, Math.round(p.maxMp * (fx.manaPct || 0))));
      this.push({ type: 'mana', target: 'player', amount: p.mp - before });
      this.log(`Restored ${p.mp - before} mana.`, 'good');
    }
    if (fx.cure) {
      const n = removeEffects(p, fx.cure);
      this.log(n ? 'Harmful effects are cured.' : 'There was nothing to cure.', n ? 'good' : 'info');
      this.push({ type: 'sync' });
    }
    if (fx.status) this.addEffect(p, p, { ...fx.status });
    if (fx.flee) {
      this.log('A cloud of smoke covers your escape!', 'player');
      this.phase = 'fled';
      this.push({ type: 'end', result: 'fled' });
    }
  }

  useAbility(a) {
    const p = this.p, e = this.e;
    const cost = manaCost(a, p.level);
    p.mp -= cost;
    if (a.cd) this.cooldowns[a.id] = a.cd + 1;
    this.log(`${p.name} uses ${a.name}!`, 'player');
    this.push({ type: 'ability', id: a.id, element: a.element, kind: a.kind, target: a.kind === 'attack' ? 'enemy' : 'player' });
    if (a.kind === 'attack') {
      let mult = a.mult;
      if (a.dotBonus) {
        const dots = e.effects.filter((x) => DOTS.includes(x.id)).length;
        if (dots) { mult *= 1 + a.dotBonus * dots; this.log(`${dots} lingering wound${dots > 1 ? 's' : ''} make${dots > 1 ? '' : 's'} the strike deadlier!`, 'info'); }
      }
      let landed = false;
      for (let i = 0; i < a.hits && e.hp > 0; i++) {
        const r = this.strike(p, e, { ...a, mult });
        if (!r.dodged) landed = true;
      }
      if (landed && e.hp > 0) for (const fx of a.effects) this.tryEffect(p, e, fx);
    } else {
      if (a.heal) this.heal(p, Math.round(p.maxHp * a.heal.pct * (1 + (p.mods.healPct || 0))), true);
      if (a.cleanse) {
        const n = removeEffects(p, DEBUFFS);
        if (n) this.log('Harmful effects are washed away.', 'good');
      }
      for (const fx of a.effects) this.tryEffect(p, e, fx);
    }
    for (const fx of a.self) this.addEffect(p, p, fx);
  }

  /* ---------------- Enemy turn ---------------- */

  afterPlayerAction() {
    let guard = 0;
    do {
      this.enemyTurn();
      if (this.over) return;
      const skip = this.startPlayerTurn();
      if (this.over) return;
      if (!skip) break;
    } while (++guard < 10);
    this.turn += 1;
    if (this.turn > this.maxTurns) {
      this.log(`${this.e.name} grows bored and retreats into the dark.`, 'info');
      this.phase = 'fled';
      this.push({ type: 'end', result: 'fled' });
      return;
    }
    this.phase = 'player';
    this.push({ type: 'turn', who: 'player' });
  }

  enemyTurn() {
    const e = this.e, p = this.p;
    this.phase = 'enemy';
    this.push({ type: 'turn', who: 'enemy' });
    const wasCharging = e.charging;
    const tick = tickStartOfTurn(e, this.rng);
    for (const ev of tick.events) this.push({ ...ev, target: 'enemy', cls: ev.type === 'heal' ? 'enemy' : 'good' });
    if (e.hp <= 0) { this.victory(); return; }
    this.checkPhase();
    for (const k of Object.keys(e.cooldowns)) if (e.cooldowns[k] > 0) e.cooldowns[k] -= 1;
    if (tick.skip) {
      if (wasCharging) {
        e.charging = null;
        this.log(`${e.name}'s ${ENEMY_ABILITIES[wasCharging].name} is interrupted!`, 'good');
        this.push({ type: 'interrupt' });
      }
      return;
    }
    const ab = chooseEnemyAction(e, p, this.rng);
    if (ab.kind === 'charge' && !ab.releasing) {
      e.charging = ab.id;
      e.cooldowns[ab.id] = (ab.cd || 0) + 1;
      this.log(`${e.name} ${ab.telegraph}`, 'warn');
      this.push({ type: 'telegraph', id: ab.id, name: ab.name });
      return;
    }
    if (ab.releasing) {
      e.charging = null;
      this.executeEnemyAbility({ ...ab.release, id: ab.id, charged: true });
    } else {
      if (ab.cd) e.cooldowns[ab.id] = ab.cd + 1;
      this.executeEnemyAbility(ab);
    }
    if (p.hp <= 0) this.defeat();
  }

  executeEnemyAbility(ab) {
    const e = this.e, p = this.p;
    const kind = ab.kind || 'attack';
    const verb = ab.verb ? `${e.name} ${ab.verb}!` : (ab.id === 'attack' ? `${e.name} attacks!` : `${e.name} uses ${ab.name}!`);
    this.log(verb, ab.charged ? 'danger' : 'enemy');
    this.push({ type: 'enemyAbility', id: ab.id, element: ab.element, charged: !!ab.charged });
    const blocked = ab.charged && this.defending;
    if (blocked) this.log('Your guard holds against the worst of it!', 'good');
    if (ab.mult > 0) {
      let landed = false;
      for (let i = 0; i < (ab.hits || 1) && p.hp > 0; i++) {
        let mult = ab.mult;
        if (ab.execute && p.hp / p.maxHp < ab.execute) mult *= 1.5;
        const r = this.strike(e, p, { ...ab, mult });
        if (!r.dodged) landed = true;
        if (!r.dodged && ab.drain && r.dmg > 0) this.heal(e, Math.round(r.dmg * ab.drain), false);
      }
      if (landed && ab.manaBurn && p.maxMp > 0) {
        const burn = Math.min(p.mp, Math.round(p.maxMp * ab.manaBurn));
        p.mp -= burn;
        if (burn) { this.log(`${p.name} loses ${burn} mana!`, 'bad'); this.push({ type: 'mana', target: 'player', amount: -burn }); }
      }
      if (landed && !blocked && p.hp > 0) for (const fx of ab.effects || []) this.tryEffect(e, p, fx);
    } else if (kind === 'debuff') {
      if (!blocked) for (const fx of ab.effects || []) this.tryEffect(e, p, fx);
    }
    if (kind === 'heal' && ab.heal) this.heal(e, Math.round(e.maxHp * ab.heal.pct), true);
    if (ab.shield) this.addEffect(e, e, { id: 'shield', turns: 4, power: Math.round(e.maxHp * ab.shield.pctMaxHp) });
    for (const fx of ab.self || []) this.addEffect(e, e, fx);
  }

  /** Start of the player's turn. Returns true if the player loses the turn. */
  startPlayerTurn() {
    const p = this.p;
    this.defending = false;
    for (const k of Object.keys(this.cooldowns)) if (this.cooldowns[k] > 0) this.cooldowns[k] -= 1;
    const regen = Math.round(p.maxMp * ((p.mpRegen ?? 0.04) + (p.mods.mpRegen || 0)));
    p.mp = Math.min(p.maxMp, p.mp + regen);
    const tick = tickStartOfTurn(p, this.rng);
    for (const ev of tick.events) this.push({ ...ev, target: 'player', cls: ev.type === 'heal' ? 'good' : 'bad' });
    this.push({ type: 'sync' });
    if (p.hp <= 0) { this.defeat(); return true; }
    return tick.skip;
  }

  /* ---------------- Shared mechanics ---------------- */

  /**
   * One hit from attacker to defender. Damage formula:
   *   raw  = attack x multiplier
   *   base = raw^2 / (raw + defence)      (defence matters, never reaches zero)
   *   x 0.9-1.1 variance, x crit damage, x element weakness (1.5) / resist (0.5),
   *   x (1 - elemental resist) for non-physical, x marked, x guard / defending.
   */
  strike(att, def, opts) {
    const r = this.calcDamage(att, def, opts);
    const target = def.side;
    if (r.dodged) {
      this.log(`${def.name} dodges ${opts.name === 'Attack' ? 'the attack' : opts.name}!`, 'info');
      this.push({ type: 'miss', target });
      return r;
    }
    let dmg = r.dmg;
    // Shields absorb first.
    const sh = def.effects.find((x) => x.id === 'shield');
    let absorbed = 0;
    if (sh && sh.power > 0) {
      absorbed = Math.min(sh.power, dmg);
      sh.power -= absorbed;
      dmg -= absorbed;
      if (sh.power <= 0) { def.effects = def.effects.filter((x) => x !== sh); this.log(`${def.name}'s shield shatters!`, 'info'); }
    }
    def.hp = Math.max(0, def.hp - dmg);
    r.dmg = dmg;
    if (att.side === 'player') { this.stats.damageDealt += dmg; if (r.crit) this.stats.crits += 1; }
    else this.stats.damageTaken += dmg;
    const tags = [];
    if (r.crit) tags.push('CRITICAL!');
    if (r.weak) tags.push("It's super effective!");
    if (r.resisted) tags.push('It is resisted.');
    const absorbTxt = absorbed ? ` (${absorbed} absorbed)` : '';
    this.log(`${opts.name === 'Attack' ? '' : opts.name + ' '}hits ${def.name} for ${dmg} damage${absorbTxt}. ${tags.join(' ')}`.trim(), att.side === 'player' ? (r.crit ? 'crit' : 'hit') : 'hurt');
    this.push({ type: 'damage', target, amount: dmg, absorbed, crit: r.crit, weak: r.weak, resisted: r.resisted, element: opts.element || 'physical' });
    // Lifesteal passive.
    if (att.side === 'player' && dmg > 0) {
      const ls = (att.mods.lifesteal || 0) + (opts.drain || 0);
      if (ls > 0) this.heal(att, Math.round(dmg * ls), false);
    }
    if (def.isBoss) this.checkPhase();
    return r;
  }

  calcDamage(att, def, opts) {
    const rng = this.rng;
    const element = opts.element || 'physical';
    if (!opts.accurate) {
      let dodge = clamp(3 + (def.spd * statMultiplier(def, 'spd') - att.spd * statMultiplier(att, 'spd')) * 0.8, 0, 20);
      dodge += effectPower(def, 'evasion') * 100 + (def.mods?.dodge || 0);
      if (rng() * 100 < Math.min(75, dodge)) return { dmg: 0, dodged: true };
    }
    const atk = att.atk * statMultiplier(att, 'atk');
    const defence = def.def * statMultiplier(def, 'def') * (1 - clamp(opts.ignoreDef || 0, 0, 1));
    const raw = Math.max(1, atk * (opts.mult || 1));
    let dmg = (raw * raw) / (raw + defence);
    dmg *= 0.9 + rng() * 0.2;
    const critChance = att.crit + effectPower(att, 'focus') + (opts.critBonus || 0);
    const crit = rng() * 100 < Math.min(95, critChance);
    if (crit) dmg *= att.critDmg / 100;
    const weak = def.weak.includes(element);
    const resisted = def.resist.includes(element);
    if (weak) dmg *= 1.5;
    if (resisted) dmg *= 0.5;
    if (element !== 'physical') {
      dmg *= 1 - clamp(def.res || 0, 0, 60) / 100;
      dmg *= 1 + (att.mods?.elemPct || 0);
    }
    if (att.bonusVs && def.tags.includes(att.bonusVs.tag)) dmg *= att.bonusVs.mult;
    dmg *= 1 + effectPower(def, 'marked');
    dmg *= 1 - effectPower(def, 'guard');
    if (def.side === 'player' && this.defending) dmg *= opts.charged ? 0.25 : 0.5;
    return { dmg: Math.max(1, Math.round(dmg)), crit, weak, resisted, dodged: false };
  }

  tryEffect(src, target, fx) {
    if (target.hp <= 0) return;
    if (fx.chance !== undefined && this.rng() >= fx.chance) return;
    this.addEffect(src, target, fx);
  }

  addEffect(src, target, fx) {
    let power = fx.power ?? 0;
    if (fx.scale) {
      power = src.atk * statMultiplier(src, 'atk') * fx.scale;
      if (DOTS.includes(fx.id)) power *= 1 + (src.mods?.dotPct || 0);
      power = Math.max(1, Math.round(power));
    }
    const res = applyEffect(target, { id: fx.id, turns: fx.turns, power }, this.rng);
    const name = EFFECTS[fx.id].name;
    if (res.applied) {
      this.log(`${target.name} ${target === src ? 'gains' : 'is afflicted with'} ${name}.`, EFFECTS[fx.id].kind === 'buff' ? (target.side === 'player' ? 'good' : 'enemy') : (target.side === 'player' ? 'bad' : 'good'));
      this.push({ type: 'effect', target: target.side, id: fx.id });
    } else if (res.reason === 'immune' || res.reason === 'resisted') {
      this.log(`${target.name} ${res.reason === 'immune' ? 'is immune to' : 'resists'} ${name}.`, 'info');
    }
  }

  heal(unit, amount, announce) {
    const before = unit.hp;
    unit.hp = Math.min(unit.maxHp, unit.hp + Math.max(0, amount));
    const got = unit.hp - before;
    if (got > 0 || announce) {
      this.log(`${unit.name} recovers ${got} health.`, unit.side === 'player' ? 'good' : 'enemy');
      this.push({ type: 'heal', target: unit.side, amount: got });
    }
  }

  checkPhase() {
    const e = this.e;
    if (!e.isBoss || !e.phases || e.hp <= 0) return;
    while (e.phaseIndex + 1 < e.phases.length && e.hp / e.maxHp <= e.phases[e.phaseIndex + 1].at) {
      e.phaseIndex += 1;
      const ph = e.phases[e.phaseIndex];
      e.phaseAbilities = ph.abilities;
      this.log(`— Phase ${e.phaseIndex + 1}: ${ph.name} —`, 'phase');
      if (ph.text) this.log(ph.text, 'danger');
      this.push({ type: 'phase', index: e.phaseIndex, name: ph.name });
      for (const fx of ph.self || []) applyEffect(e, fx, this.rng);
      if (ph.shield) applyEffect(e, { id: 'shield', turns: 5, power: Math.round(e.maxHp * ph.shield) }, this.rng);
    }
  }

  victory() {
    if (this.over) return;
    this.phase = 'victory';
    this.e.charging = null;
    this.log(`${this.e.name} is defeated!`, 'victory');
    this.push({ type: 'end', result: 'victory' });
  }

  defeat() {
    if (this.over) return;
    this.phase = 'defeat';
    this.log(`${this.p.name} has fallen...`, 'danger');
    this.push({ type: 'end', result: 'defeat' });
  }

  /* ---------------- Event helpers ---------------- */

  log(text, cls = 'info') { this.push({ type: 'log', text, cls }); }

  push(ev) {
    ev.snap = {
      p: { hp: this.p.hp, maxHp: this.p.maxHp, mp: this.p.mp, maxMp: this.p.maxMp, effects: this.p.effects.map((x) => ({ ...x })) },
      e: { hp: this.e.hp, maxHp: this.e.maxHp, effects: this.e.effects.map((x) => ({ ...x })), charging: this.e.charging, phaseIndex: this.e.phaseIndex || 0 },
    };
    this.events.push(ev);
  }
}

export { hasEffect };
