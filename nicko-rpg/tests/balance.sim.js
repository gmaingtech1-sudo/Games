// Balance simulation: a simple scripted player fights typical encounters and bosses.
import { newGame, makeCombat, rollEncounter, finishCombat } from '../js/gameState.js';
import { ITEMS, isEquipment, canClassUse, EQUIP_SLOTS, getItem } from '../js/items.js';
import { computeStats, skillPointsForLevel } from '../js/character.js';
import { SKILL_NODES, canUnlock, unlockSkill } from '../js/skillTree.js';
import { getAbility, manaCost } from '../js/abilities.js';
import { DUNGEONS } from '../js/dungeons.js';
import { createBossUnit, BOSSES } from '../js/bosses.js';
import { addItem } from '../js/inventory.js';
import { makeRng } from '../js/utils.js';

function setup(classId, level, rng, branchPref, withBossLoot = false) {
  const s = newGame('Sim', classId);
  const p = s.player;
  p.level = level;
  let pts = 0; for (let l = 2; l <= level; l++) pts += skillPointsForLevel(l);
  p.skillPoints = pts;
  // learn skills round-robin by tier
  const nodes = Object.values(SKILL_NODES).filter((n) => n.classId === classId).sort((a, b) => a.tier - b.tier || (a.branch === branchPref ? -1 : 1));
  let progress = true;
  while (progress) { progress = false; for (const n of nodes) if (canUnlock(p, n.id).ok) { unlockSkill(p, n.id); progress = true; } }
  // gear: best non-boss item per slot with level <= player level (rarity up to rare from shop, plus a 30% chance of epic)
  for (const slot of EQUIP_SLOTS) {
    const pool = Object.values(ITEMS).filter((d) => isEquipment(d) && d.slot === slot && !d.bossOnly && d.level <= level && canClassUse(d, classId) && ['common', 'uncommon', 'rare'].includes(d.rarity) && d.shop);
    pool.sort((a, b) => b.level - a.level);
    if (pool[0]) p.equipment[slot] = { uid: 'g' + slot, id: pool[0].id, qty: 1, plus: Math.min(3, Math.floor(level / 10)) };
  }
  if (withBossLoot) {
    for (const b of Object.values(BOSSES)) {
      if (b.level >= level) continue;
      for (const id of b.reward.items) {
        const d = getItem(id);
        if (!isEquipment(d) || !canClassUse(d, classId) || d.level > level) continue;
        const cur = p.equipment[d.slot] && getItem(p.equipment[d.slot].id);
        if (!cur || cur.level * (1 + ['common','uncommon','rare','epic','legendary','mythic'].indexOf(cur.rarity) * 0.15) < d.level * (1 + ['common','uncommon','rare','epic','legendary','mythic'].indexOf(d.rarity) * 0.15)) p.equipment[d.slot] = { uid: 'b' + id, id, qty: 1, plus: 1 };
      }
    }
  }
  const st = computeStats(p); p.hp = st.maxHp; p.mp = st.maxMp;
  s.inventory = [];
  addItem(s, level >= 8 ? 'largeHealthPotion' : 'smallHealthPotion', 3);
  addItem(s, 'manaPotion', 2);
  return s;
}

function policy(c) {
  const p = c.p, e = c.e;
  if (e.charging) return { type: 'defend' };
  if (p.hp / p.maxHp < 0.3) {
    const pot = c.hooks && null;
  }
  return null;
}

function play(s, combat, rng) {
  let guard = 0;
  while (!combat.over && guard++ < 400) {
    const p = combat.p;
    let action = null;
    if (combat.e.charging) action = { type: 'defend' };
    else if (p.hp / p.maxHp < 0.32) {
      const pot = s.inventory.find((x) => getItem(x.id).effect?.healPct);
      if (pot) action = { type: 'item', uid: pot.uid };
    }
    if (!action) {
      const heals = p.abilities.map(getAbility).filter((a) => a.kind === 'heal' && combat.abilityState(a.id).usable);
      if (p.hp / p.maxHp < 0.5 && heals[0]) action = { type: 'ability', id: heals[0].id };
    }
    if (!action) {
      // pick usable attack ability with highest mult*hits, buffs early
      const usable = p.abilities.map(getAbility).filter((a) => combat.abilityState(a.id).usable);
      const buff = usable.find((a) => a.kind === 'buff' && !a.self.some((x) => p.effects.some((e) => e.id === x.id)) && !(a.effects||[]).some((x) => combat.e.effects.some((e) => e.id === x.id)));
      const atk = usable.filter((a) => a.kind === 'attack').sort((a, b) => b.mult * b.hits - a.mult * a.hits)[0];
      if (buff && rng() < 0.5) action = { type: 'ability', id: buff.id };
      else if (atk) action = { type: 'ability', id: atk.id };
      else if (p.mp < p.maxMp * 0.15) {
        const mpot = s.inventory.find((x) => getItem(x.id).effect?.manaPct);
        action = mpot && rng() < 0.5 ? { type: 'item', uid: mpot.uid } : { type: 'attack' };
      } else action = { type: 'attack' };
    }
    const r = combat.act(action);
    if (!r.ok) combat.act({ type: 'attack' });
  }
  return { won: combat.phase === 'victory', turns: combat.turn, hpLeft: combat.p.hp / combat.p.maxHp };
}

const classes = ['warrior', 'mage', 'rogue', 'ranger'];
const rng = makeRng(42);
console.log('--- Regular encounters (fresh hero, 3 potions) ---');
for (const L of [1, 3, 6, 10, 15, 20, 25, 30, 35, 40, 45, 50]) {
  const d = [...DUNGEONS].reverse().find((x) => x.minLevel <= L) ;
  const row = [];
  for (const c of classes) {
    let wins = 0, turns = 0, hp = 0; const N = 60;
    for (let i = 0; i < N; i++) {
      const s = setup(c, L, rng);
      const enemy = rollEncounter(s, d, rng);
      enemy.elite = false;
      const combat = makeCombat(s, enemy, { rng });
      const r = play(s, combat, rng);
      wins += r.won; turns += r.turns; hp += r.hpLeft;
    }
    row.push(`${c.slice(0, 4)} ${Math.round(wins / N * 100)}% t${(turns / N).toFixed(1)} hp${Math.round(hp / N * 100)}%`);
  }
  console.log(`L${L} ${d.id.padEnd(16)}`, row.join(' | '));
}
console.log('--- Bosses at their level (shop gear + earlier boss loot, 3 potions) ---');
for (const id of Object.keys(BOSSES)) {
  const b = BOSSES[id];
  const row = [];
  for (const c of classes) {
    let wins = 0, turns = 0; const N = 40;
    for (let i = 0; i < N; i++) {
      const s = setup(c, b.level, rng, undefined, true);
      const combat = makeCombat(s, createBossUnit(id, { rng }), { rng, mode: 'boss' });
      const r = play(s, combat, rng);
      wins += r.won; turns += r.turns;
    }
    row.push(`${c.slice(0, 4)} ${Math.round(wins / N * 100)}% t${(turns / N).toFixed(1)}`);
  }
  console.log(`${id.padEnd(16)} L${b.level}`, row.join(' | '));
}
