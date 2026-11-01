// Status effect definitions and the rules for applying and ticking them.
// Every effect has a duration (turns) and a strength (power). Effects tick at
// the start of the affected unit's turn.

export const EFFECTS = {
  poison:   { name: 'Poison',     kind: 'debuff', color: '#7bd448', glyph: '☠', dot: 'poison',
              desc: (p) => `Takes ${p} poison damage each turn.` },
  burn:     { name: 'Burn',       kind: 'debuff', color: '#ff7a2e', glyph: '🔥', dot: 'fire',
              desc: (p) => `Takes ${p} fire damage each turn and has 15% less defence.` },
  bleed:    { name: 'Bleed',      kind: 'debuff', color: '#e0334a', glyph: '✚', dot: 'physical',
              desc: (p) => `Takes ${p} damage each turn. Ignores defence.` },
  freeze:   { name: 'Freeze',     kind: 'debuff', color: '#7fd7ff', glyph: '❄', cc: true,
              desc: () => 'Speed halved and a 40% chance to lose each turn.' },
  stun:     { name: 'Stun',       kind: 'debuff', color: '#ffe066', glyph: '✦', cc: true,
              desc: () => 'Loses the next turn.' },
  weakness: { name: 'Weakness',   kind: 'debuff', color: '#a08cff', glyph: '▼',
              desc: (p) => `Attack reduced by ${Math.round(p * 100)}%.` },
  marked:   { name: 'Marked',     kind: 'debuff', color: '#ff5d8f', glyph: '◎',
              desc: (p) => `Takes ${Math.round(p * 100)}% more damage.` },
  regen:    { name: 'Regeneration', kind: 'buff', color: '#4fe08a', glyph: '✿',
              desc: (p) => `Heals ${Math.round(p * 100)}% of max health each turn.` },
  defUp:    { name: 'Defence Boost', kind: 'buff', color: '#5aa9ff', glyph: '⛨',
              desc: (p) => `Defence increased by ${Math.round(p * 100)}%.` },
  atkUp:    { name: 'Strength',   kind: 'buff', color: '#ff9d3b', glyph: '▲',
              desc: (p) => `Attack increased by ${Math.round(p * 100)}%.` },
  guard:    { name: 'Guard',      kind: 'buff', color: '#9fb6d6', glyph: '⛊',
              desc: (p) => `Incoming damage reduced by ${Math.round(p * 100)}%.` },
  shield:   { name: 'Arcane Shield', kind: 'buff', color: '#c38bff', glyph: '◈',
              desc: (p) => `Absorbs the next ${p} damage.` },
  evasion:  { name: 'Evasion',    kind: 'buff', color: '#c0c0ff', glyph: '≋',
              desc: (p) => `+${Math.round(p * 100)}% chance to dodge attacks.` },
  focus:    { name: 'Focus',      kind: 'buff', color: '#ffd166', glyph: '✧',
              desc: (p) => `+${p}% critical hit chance.` },
  berserk:  { name: 'Berserk',    kind: 'buff', color: '#ff3b3b', glyph: '✹',
              desc: (p) => `Attack +${Math.round(p * 100)}%, defence -30%.` },
  enraged:  { name: 'Enraged',    kind: 'buff', color: '#ff2a2a', glyph: '♨',
              desc: (p) => `Attack increased by ${Math.round(p * 100)}%.` },
  ccImmune: { name: 'Unstoppable', kind: 'buff', color: '#e8e8e8', glyph: '◆', hidden: false,
              desc: () => 'Immune to stun and freeze.' },
};

export const DEBUFFS = Object.keys(EFFECTS).filter((k) => EFFECTS[k].kind === 'debuff');

export function hasEffect(unit, id) {
  return unit.effects.some((e) => e.id === id && e.turns > 0);
}

export function effectPower(unit, id) {
  let p = 0;
  for (const e of unit.effects) if (e.id === id && e.turns > 0) p = Math.max(p, e.power);
  return p;
}

/**
 * Try to apply an effect. Rules (all testable):
 *  - Units can be immune to an effect id (e.g. skeletons vs poison and bleed).
 *  - Crowd control (stun/freeze) fails on units with ccImmune; bosses gain
 *    ccImmune for 3 turns after any crowd control lands, so they can't be locked down.
 *  - Re-applying refreshes the duration and keeps the stronger power.
 *  - Shields stack their absorb amount (capped at 2x the new value).
 */
export function applyEffect(unit, { id, turns, power = 0 }, rng = Math.random) {
  const def = EFFECTS[id];
  if (!def || turns <= 0) return { applied: false, reason: 'invalid' };
  if (unit.hp <= 0) return { applied: false, reason: 'dead' };
  if ((unit.immune || []).includes(id)) return { applied: false, reason: 'immune' };
  if (def.cc && hasEffect(unit, 'ccImmune')) return { applied: false, reason: 'immune' };
  if (def.cc && unit.ccResist && rng() < unit.ccResist) return { applied: false, reason: 'resisted' };
  turns = Math.max(1, Math.round(turns));
  power = Math.max(0, power);
  const existing = unit.effects.find((e) => e.id === id);
  if (existing) {
    existing.turns = Math.max(existing.turns, turns);
    existing.power = id === 'shield' ? Math.min(existing.power + power, power * 2) : Math.max(existing.power, power);
  } else {
    unit.effects.push({ id, turns, power });
  }
  if (def.cc && unit.isBoss) {
    const imm = unit.effects.find((e) => e.id === 'ccImmune');
    if (imm) imm.turns = Math.max(imm.turns, turns + 3);
    else unit.effects.push({ id: 'ccImmune', turns: turns + 3, power: 0 });
  }
  return { applied: true };
}

export function removeEffects(unit, ids) {
  const before = unit.effects.length;
  unit.effects = unit.effects.filter((e) => !ids.includes(e.id));
  return before - unit.effects.length;
}

/** Stat multiplier from active effects. */
export function statMultiplier(unit, stat) {
  let m = 1;
  if (stat === 'atk') {
    m += effectPower(unit, 'atkUp') + effectPower(unit, 'berserk') + effectPower(unit, 'enraged');
    m -= effectPower(unit, 'weakness');
  } else if (stat === 'def') {
    m += effectPower(unit, 'defUp');
    if (hasEffect(unit, 'berserk')) m -= 0.3;
    if (hasEffect(unit, 'burn')) m -= 0.15;
  } else if (stat === 'spd') {
    if (hasEffect(unit, 'freeze')) m -= 0.5;
  }
  return Math.max(0.1, m);
}

/**
 * Start-of-turn processing for one unit. Returns { events, skip } where skip
 * is true when stun/freeze costs the unit its turn. Durations tick down here.
 */
export function tickStartOfTurn(unit, rng = Math.random) {
  const events = [];
  let skip = false;
  for (const e of unit.effects) {
    if (e.turns <= 0 || unit.hp <= 0) continue;
    const def = EFFECTS[e.id];
    if (def.dot) {
      let dmg = Math.max(1, Math.round(e.power));
      if (def.dot !== 'physical' && unit.res) dmg = Math.max(1, Math.round(dmg * (1 - Math.min(60, unit.res) / 100)));
      unit.hp = Math.max(0, unit.hp - dmg);
      events.push({ type: 'dot', effect: e.id, amount: dmg, text: `${unit.name} suffers ${dmg} ${def.name.toLowerCase()} damage.` });
    } else if (e.id === 'regen') {
      const heal = Math.max(1, Math.round(unit.maxHp * e.power));
      const before = unit.hp;
      unit.hp = Math.min(unit.maxHp, unit.hp + heal);
      if (unit.hp > before) events.push({ type: 'heal', effect: 'regen', amount: unit.hp - before, text: `${unit.name} regenerates ${unit.hp - before} health.` });
    }
  }
  if (unit.hp > 0) {
    if (hasEffect(unit, 'stun')) {
      skip = true;
      events.push({ type: 'skip', text: `${unit.name} is stunned and cannot act!` });
    } else if (hasEffect(unit, 'freeze') && rng() < 0.4) {
      skip = true;
      events.push({ type: 'skip', text: `${unit.name} is frozen solid and loses the turn!` });
    }
  }
  // Durations tick down. Shields, guard and evasion last until they expire or break.
  for (const e of unit.effects) e.turns -= 1;
  unit.effects = unit.effects.filter((e) => e.turns > 0 && !(e.id === 'shield' && e.power <= 0));
  return { events, skip };
}
