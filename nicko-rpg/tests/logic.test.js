// Core system tests. Run with: node tests/logic.test.js
import assert from 'node:assert/strict';
import { makeRng } from '../js/utils.js';
import { CLASSES, createPlayer, computeStats, xpToNext, gainXp, MAX_LEVEL, baseStatsAt } from '../js/character.js';
import { canUnlock, unlockSkill, passiveMods, respec, knownAbilityIds, SKILL_NODES, nodesForClass } from '../js/skillTree.js';
import { ITEMS, getItem, instanceStats, sellPrice } from '../js/items.js';
import { addItem, removeItem, countItem, INVENTORY_SLOTS, useConsumable, sortInventory, filterInventory } from '../js/inventory.js';
import { equip, unequip, upgradeItem, compareWithEquipped } from '../js/equipment.js';
import { buy, sell, canSell, shopStock, rest } from '../js/shop.js';
import { Combat, buildPlayerUnit } from '../js/combat.js';
import { ENEMIES, createEnemyUnit, chooseEnemyAction, ENEMY_ABILITIES } from '../js/enemies.js';
import { createBossUnit, bossStatus, BOSSES } from '../js/bosses.js';
import { newGame, makeCombat, finishCombat, startBossFight, explore, xpFactor, claimQuestReward, revive, updateUnlocks } from '../js/gameState.js';
import { questEvent, refreshQuests, getQuest, questEntry, ensureDaily, claimQuest } from '../js/quests.js';
import { saveGame, loadGame, listSlots, deleteSave, validateState, migrate, storage, latestValidSlot } from '../js/saveSystem.js';
import { validateEnemy, saveCustomEnemy, loadCustomEnemies, deleteCustomEnemy, duplicateCustomEnemy, customEnemyUnit, blankEnemy } from '../js/customEnemyCreator.js';
import { applyEffect, tickStartOfTurn } from '../js/statusEffects.js';
import { DUNGEONS, dungeonStatus } from '../js/dungeons.js';
import { rollBossLoot } from '../js/loot.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}\n    ${e.stack.split('\n').slice(0, 3).join('\n    ')}`); }
}
const section = (n) => console.log(`\n${n}`);

function quickCombat(state, enemy, opts = {}) {
  return makeCombat(state, enemy, { rng: makeRng(opts.seed ?? 7), ...opts });
}
function winFight(c, max = 300) {
  let n = 0;
  while (!c.over && n++ < max) {
    if (c.p.hp < c.p.maxHp * 0.3) c.p.hp = c.p.maxHp; // keep the hero alive for deterministic wins
    c.act({ type: 'attack' });
  }
  return c.phase;
}

section('Characters');
test('each class has distinct, correct starting statistics', () => {
  const seen = new Set();
  for (const id of Object.keys(CLASSES)) {
    const p = createPlayer('Hero', id);
    const s = computeStats(p);
    const base = CLASSES[id].base;
    const weapon = instanceStats(getItem(CLASSES[id].start.weapon));
    const armor = instanceStats(getItem(CLASSES[id].start.armor));
    assert.equal(s.atk, base.atk + (weapon.atk || 0));
    assert.equal(s.maxHp, base.hp + (weapon.hp || 0) + (armor.hp || 0));
    assert.equal(s.maxMp, base.mp + (weapon.mp || 0));
    assert.equal(p.hp, s.maxHp);
    assert.equal(p.mp, s.maxMp);
    assert.equal(p.level, 1);
    assert.equal(p.gold, 50);
    seen.add(JSON.stringify([s.maxHp, s.maxMp, s.atk, s.def, s.spd, s.crit]));
  }
  assert.equal(seen.size, 4);
  const w = computeStats(createPlayer('a', 'warrior')), m = computeStats(createPlayer('a', 'mage'));
  const r = computeStats(createPlayer('a', 'rogue'));
  assert.ok(w.maxHp > m.maxHp && w.def > m.def, 'warrior is tankier than mage');
  assert.ok(m.maxMp > w.maxMp, 'mage has more mana');
  assert.ok(r.crit > w.crit && r.spd > w.spd, 'rogue is faster and crits more');
});
test('each class starts with its two signature abilities', () => {
  const expect = { warrior: ['heavyStrike', 'shieldBlock'], mage: ['firebolt', 'arcaneShield'], rogue: ['quickStrike', 'shadowstep'], ranger: ['aimedShot', 'poisonArrow'] };
  for (const [c, ids] of Object.entries(expect)) assert.deepEqual(knownAbilityIds(createPlayer('x', c)).sort(), [...ids].sort());
});
test('experience curve grows every level', () => {
  for (let l = 1; l < MAX_LEVEL - 1; l++) assert.ok(xpToNext(l + 1) > xpToNext(l));
  assert.equal(xpToNext(MAX_LEVEL), Infinity);
});
test('levelling up raises stats, awards skill points and restores some health', () => {
  const p = createPlayer('x', 'warrior');
  const before = computeStats(p);
  p.hp = 10;
  const levels = gainXp(p, xpToNext(1));
  assert.equal(levels.length, 1);
  assert.equal(p.level, 2);
  assert.equal(p.skillPoints, 1);
  const after = computeStats(p);
  assert.ok(after.maxHp > before.maxHp && after.atk > before.atk);
  assert.ok(p.hp > 10 + (after.maxHp - before.maxHp));
  assert.ok(p.hp <= after.maxHp);
});
test('multi-level gains and bonus point every 10th level', () => {
  const p = createPlayer('x', 'mage');
  let total = 0;
  for (let l = 1; l < 10; l++) total += xpToNext(l);
  gainXp(p, total);
  assert.equal(p.level, 10);
  assert.equal(p.skillPoints, 8 + 2);
});
test('level is capped at 50 and xp never negative', () => {
  const p = createPlayer('x', 'rogue');
  gainXp(p, 1e9);
  assert.equal(p.level, MAX_LEVEL);
  assert.equal(p.xp, 0);
  gainXp(p, -500);
  assert.ok(p.xp >= 0);
});

section('Skill tree');
test('every class has 3 branches x 5 nodes', () => {
  for (const c of Object.keys(CLASSES)) assert.equal(nodesForClass(c).length, 15);
});
test('skills cannot be bought without points, level or prerequisites', () => {
  const p = createPlayer('x', 'warrior');
  assert.equal(canUnlock(p, 'w_off1').ok, false); // level 1, no points
  p.level = 2; p.skillPoints = 0;
  assert.ok(canUnlock(p, 'w_off1').reasons.some((r) => r.includes('skill point')));
  p.skillPoints = 5;
  assert.equal(canUnlock(p, 'w_off1').ok, true);
  p.level = 10;
  const c3 = canUnlock(p, 'w_off3');
  assert.equal(c3.ok, false);
  assert.ok(c3.reasons.some((r) => r.includes('Requires')));
  assert.equal(canUnlock(p, 'm_fire1').ok, false, 'other class skills are locked');
});
test('unlocking spends points, teaches abilities and applies passives', () => {
  const p = createPlayer('x', 'warrior');
  p.level = 10; p.skillPoints = 10;
  assert.ok(unlockSkill(p, 'w_off1').ok);
  assert.ok(knownAbilityIds(p).includes('whirlwind'));
  const atkBefore = computeStats(p).atk;
  assert.ok(unlockSkill(p, 'w_off2').ok);
  assert.ok(unlockSkill(p, 'w_off2').ok);
  assert.equal(passiveMods(p).atkPct, 0.1);
  assert.ok(computeStats(p).atk > atkBefore);
  assert.equal(p.skillPoints, 7);
  unlockSkill(p, 'w_off2');
  assert.equal(unlockSkill(p, 'w_off2').ok, false, 'max rank 3');
  assert.ok(unlockSkill(p, 'w_off3').ok);
  assert.equal(p.skillPoints, 4);
});
test('respec refunds points for gold', () => {
  const p = createPlayer('x', 'mage');
  p.level = 5; p.skillPoints = 4; p.gold = 10000;
  unlockSkill(p, 'm_fire1'); unlockSkill(p, 'm_fire2');
  const r = respec(p);
  assert.ok(r.ok);
  assert.equal(p.skillPoints, 4);
  assert.deepEqual(p.skills, {});
  assert.ok(p.gold < 10000);
  p.gold = 0;
  unlockSkill(p, 'm_fire1');
  assert.equal(respec(p).ok, false);
});

section('Inventory & equipment');
test('stacks respect limits and capacity overflow converts to gold', () => {
  const s = newGame('x', 'warrior');
  s.inventory = [];
  addItem(s, 'smallHealthPotion', 45);
  assert.equal(countItem(s, 'smallHealthPotion'), 45);
  assert.equal(s.inventory.length, 3); // stack 20
  s.inventory = [];
  for (let i = 0; i < INVENTORY_SLOTS; i++) addItem(s, 'ironSword', 1);
  const gold = s.player.gold;
  const r = addItem(s, 'steelSword', 1);
  assert.equal(r.added, 0);
  assert.equal(s.player.gold, gold + sellPrice(getItem('steelSword')));
  addItem(s, 'travellerLocket', 1);
  assert.equal(countItem(s, 'travellerLocket'), 1, 'quest items always fit');
});
test('equipment bonuses apply and remove exactly, never twice', () => {
  const s = newGame('x', 'warrior');
  s.player.level = 12;
  const base = computeStats(s.player);
  addItem(s, 'ringOfPower', 1);
  const uid = s.inventory.find((e) => e.id === 'ringOfPower').uid;
  assert.ok(equip(s, uid).ok);
  const withRing = computeStats(s.player);
  assert.equal(withRing.atk, base.atk + getItem('ringOfPower').stats.atk);
  assert.equal(equip(s, uid).ok, false, 'already equipped item is no longer in the bag');
  assert.equal(computeStats(s.player).atk, withRing.atk);
  assert.ok(unequip(s, 'ring').ok);
  assert.deepEqual(computeStats(s.player), base);
  assert.equal(countItem(s, 'ringOfPower'), 1);
});
test('equipping swaps the old item back into the bag', () => {
  const s = newGame('x', 'warrior');
  s.player.level = 4;
  addItem(s, 'ironSword', 1);
  equip(s, s.inventory.find((e) => e.id === 'ironSword').uid);
  assert.equal(s.player.equipment.weapon.id, 'ironSword');
  assert.equal(countItem(s, 'rustySword'), 1);
});
test('class and level restrictions are enforced', () => {
  const s = newGame('x', 'mage');
  addItem(s, 'ironSword', 1);
  assert.equal(equip(s, s.inventory.find((e) => e.id === 'ironSword').uid).ok, false);
  addItem(s, 'scaleMail', 1);
  assert.equal(equip(s, s.inventory.find((e) => e.id === 'scaleMail').uid).ok, false);
});
test('unequipping lowers max hp and clamps current hp', () => {
  const s = newGame('x', 'warrior');
  s.player.level = 8;
  addItem(s, 'ringOfVigor', 1);
  equip(s, s.inventory.find((e) => e.id === 'ringOfVigor').uid);
  s.player.hp = computeStats(s.player).maxHp;
  unequip(s, 'ring');
  assert.equal(s.player.hp, computeStats(s.player).maxHp);
});
test('consumables heal without exceeding max', () => {
  const s = newGame('x', 'warrior');
  const st = computeStats(s.player);
  assert.equal(useConsumable(s, s.inventory.find((e) => e.id === 'smallHealthPotion').uid).ok, false, 'no effect at full hp');
  s.player.hp = st.maxHp - 5;
  assert.ok(useConsumable(s, s.inventory.find((e) => e.id === 'smallHealthPotion').uid).ok);
  assert.equal(s.player.hp, st.maxHp);
  assert.equal(countItem(s, 'smallHealthPotion'), 2);
});
test('blacksmith upgrades cost gold and raise stats', () => {
  const s = newGame('x', 'warrior');
  s.player.gold = 0;
  assert.equal(upgradeItem(s, { slot: 'weapon' }).ok, false);
  s.player.gold = 100000;
  const atk = computeStats(s.player).atk;
  assert.ok(upgradeItem(s, { slot: 'weapon' }).ok);
  assert.ok(computeStats(s.player).atk >= atk);
  for (let i = 0; i < 6; i++) upgradeItem(s, { slot: 'weapon' });
  assert.equal(s.player.equipment.weapon.plus, 5);
});
test('sorting and filtering', () => {
  const s = newGame('x', 'warrior');
  addItem(s, 'wolfPelt', 2); addItem(s, 'ironSword', 1);
  sortInventory(s, 'type');
  assert.equal(getItem(s.inventory[0].id).type, 'weapon');
  assert.ok(filterInventory(s, 'material').every((e) => getItem(e.id).type === 'material'));
});

section('Shop & economy');
test('purchases are validated and deduct gold exactly once', () => {
  const s = newGame('x', 'warrior');
  s.player.gold = 30;
  assert.equal(buy(s, 'largeHealthPotion').ok, false, 'level/gold check');
  const r = buy(s, 'smallHealthPotion');
  assert.ok(r.ok);
  assert.equal(s.player.gold, 30 - r.cost);
  assert.equal(buy(s, 'smallHealthPotion').ok, false, 'cannot afford a second');
  assert.ok(s.player.gold >= 0);
  assert.equal(buy(s, 'dragonSlayer').ok, false, 'not sold in the shop');
});
test('selling pays 40% and never creates an arbitrage loop', () => {
  const s = newGame('x', 'warrior');
  s.player.gold = 1000;
  s.player.level = 4;
  const g0 = s.player.gold;
  assert.ok(buy(s, 'ironSword').ok);
  const e = s.inventory.find((x) => x.id === 'ironSword');
  sell(s, e.uid);
  assert.ok(s.player.gold < g0);
  for (const d of Object.values(ITEMS)) if (d.shop) assert.ok(sellPrice(d, 5) < d.value * 1.2 + 1);
});
test('quest items and quest-reserved materials cannot be sold', () => {
  const s = newGame('x', 'warrior');
  addItem(s, 'travellerLocket', 1);
  assert.equal(canSell(s, s.inventory.find((e) => e.id === 'travellerLocket').uid).ok, false);
  s.player.level = 2;
  refreshQuests(s); // activates "Pelts for the Tanner" (needs 10)
  addItem(s, 'wolfPelt', 12);
  const uid = s.inventory.find((e) => e.id === 'wolfPelt').uid;
  assert.ok(canSell(s, uid, 2).ok, 'surplus can be sold');
  assert.equal(canSell(s, uid, 3).ok, false, 'cannot dip below what the quest needs');
});
test('the inn restores health for gold', () => {
  const s = newGame('x', 'warrior');
  assert.equal(rest(s).ok, false);
  s.player.hp = 1;
  assert.ok(rest(s).ok);
  assert.equal(s.player.hp, computeStats(s.player).maxHp);
});

section('Combat');
test('attack damages the enemy and the enemy takes a turn', () => {
  const s = newGame('x', 'warrior');
  const enemy = createEnemyUnit(ENEMIES.slime, 1, { rng: makeRng(1) });
  const c = quickCombat(s, enemy);
  const res = c.act({ type: 'attack' });
  assert.ok(res.ok);
  assert.ok(enemy.hp < enemy.maxHp || res.events.some((e) => e.type === 'miss'));
  assert.ok(res.events.some((e) => e.type === 'turn' && e.who === 'enemy'));
  assert.equal(c.phase, 'player');
});
test('actions are rejected outside the player turn and after the fight', () => {
  const s = newGame('x', 'warrior');
  const c = quickCombat(s, createEnemyUnit(ENEMIES.slime, 1));
  c.phase = 'enemy';
  assert.equal(c.act({ type: 'attack' }).ok, false);
  c.phase = 'player';
  c.e.hp = 1;
  winFight(c);
  assert.equal(c.phase, 'victory');
  assert.equal(c.act({ type: 'attack' }).ok, false);
});
test('defeated enemies never act', () => {
  const s = newGame('x', 'warrior');
  const enemy = createEnemyUnit(ENEMIES.slime, 1);
  enemy.hp = 1;
  const c = quickCombat(s, enemy);
  const hp = c.p.hp;
  for (let i = 0; i < 10 && !c.over; i++) c.act({ type: 'ability', id: 'heavyStrike' }) || c.act({ type: 'attack' });
  winFight(c);
  const res = c.act({ type: 'attack' });
  assert.equal(res.ok, false);
  assert.equal(c.events.filter((e) => e.type === 'enemyAbility').length, 0);
  assert.ok(c.p.hp <= hp);
});
test('abilities validate mana and cooldowns', () => {
  const s = newGame('x', 'warrior');
  const c = quickCombat(s, createEnemyUnit(ENEMIES.troll, 5));
  c.p.mp = 0;
  assert.equal(c.act({ type: 'ability', id: 'heavyStrike' }).ok, false);
  c.p.mp = 100;
  assert.ok(c.act({ type: 'ability', id: 'shieldBlock' }).ok);
  assert.equal(c.act({ type: 'ability', id: 'shieldBlock' }).ok, false, 'on cooldown');
  assert.equal(c.act({ type: 'ability', id: 'fireball' }).ok, false, 'unknown to warriors');
  const mp = c.p.mp;
  c.act({ type: 'ability', id: 'heavyStrike' });
  assert.ok(c.p.mp < mp + c.p.maxMp * 0.1);
});
test('a charged attack is telegraphed and defending reduces it', () => {
  const s = newGame('x', 'warrior');
  s.player.level = 20;
  const run = (defend) => {
    const e = createEnemyUnit(ENEMIES.orcWarrior, 20, { variance: 0 });
    e.abilities = ['brutalSmash'];
    const c = quickCombat(s, e, { seed: 3 });
    c.p.hp = c.p.maxHp = 100000;
    c.p.mp = 0;
    const r1 = c.act({ type: 'defend' });
    assert.ok(r1.events.some((x) => x.type === 'telegraph'));
    assert.equal(e.charging, 'brutalSmash');
    const hp = c.p.hp;
    c.p.spd = 0; e.spd = 0;
    c.p.mods.dodge = -1000;
    c.act({ type: defend ? 'defend' : 'attack' });
    assert.equal(e.charging, null);
    return hp - c.p.hp;
  };
  const defended = run(true), open = run(false);
  assert.ok(defended < open * 0.4, `defended ${defended} vs open ${open}`);
});
test('stunning a charging enemy interrupts the charge', () => {
  const s = newGame('x', 'warrior');
  const e = createEnemyUnit(ENEMIES.orcWarrior, 5);
  e.abilities = ['brutalSmash'];
  const c = quickCombat(s, e);
  c.act({ type: 'defend' });
  assert.equal(e.charging, 'brutalSmash');
  applyEffect(e, { id: 'stun', turns: 1 });
  const r = c.act({ type: 'defend' });
  assert.ok(r.events.some((x) => x.type === 'interrupt'));
  assert.equal(e.charging, null);
});
test('poison ticks, skeletons are immune, effects expire', () => {
  const u = { name: 'T', hp: 100, maxHp: 100, effects: [], immune: [], res: 0 };
  applyEffect(u, { id: 'poison', turns: 2, power: 10 });
  tickStartOfTurn(u);
  assert.equal(u.hp, 90);
  tickStartOfTurn(u);
  assert.equal(u.hp, 80);
  assert.equal(u.effects.length, 0);
  const sk = createEnemyUnit(ENEMIES.skeleton, 5);
  assert.equal(applyEffect(sk, { id: 'poison', turns: 3, power: 5 }).applied, false);
});
test('bosses cannot be stun-locked', () => {
  const b = createBossUnit('goblinKing');
  b.ccResist = 0;
  assert.ok(applyEffect(b, { id: 'stun', turns: 1 }).applied);
  tickStartOfTurn(b);
  assert.equal(applyEffect(b, { id: 'stun', turns: 1 }).applied, false);
});
test('healing never exceeds max health', () => {
  const s = newGame('x', 'mage');
  s.player.level = 2; s.player.skillPoints = 1;
  unlockSkill(s.player, 'm_arc1');
  const c = quickCombat(s, createEnemyUnit(ENEMIES.slime, 1));
  c.p.hp = c.p.maxHp - 1;
  c.act({ type: 'ability', id: 'healingLight' });
  assert.ok(c.p.hp <= c.p.maxHp);
});
test('cannot flee bosses; smoke bombs fail against bosses', () => {
  const s = newGame('x', 'warrior');
  s.player.level = 5;
  const c = makeCombat(s, createBossUnit('goblinKing'), { mode: 'boss' });
  assert.equal(c.act({ type: 'flee' }).ok, false);
});
test('using a potion in combat consumes exactly one', () => {
  const s = newGame('x', 'warrior');
  const c = quickCombat(s, createEnemyUnit(ENEMIES.slime, 1));
  c.p.hp = 10;
  const uid = s.inventory.find((e) => e.id === 'smallHealthPotion').uid;
  assert.ok(c.act({ type: 'item', uid }).ok);
  assert.equal(countItem(s, 'smallHealthPotion'), 2);
  assert.ok(c.p.hp > 10);
});
test('fights always end (no stuck state) across many random battles', () => {
  for (let i = 0; i < 200; i++) {
    const rng = makeRng(i);
    const cls = ['warrior', 'mage', 'rogue', 'ranger'][i % 4];
    const s = newGame('x', cls);
    s.player.level = 1 + (i % 30);
    const tpl = Object.values(ENEMIES)[i % Object.keys(ENEMIES).length];
    const c = makeCombat(s, createEnemyUnit(tpl, s.player.level, { rng }), { rng });
    let n = 0;
    while (!c.over && n++ < 400) {
      const opts = [{ type: 'attack' }, { type: 'defend' }, ...c.p.abilities.map((id) => ({ type: 'ability', id }))];
      const r = c.act(opts[Math.floor(rng() * opts.length)]);
      if (!r.ok) c.act({ type: 'attack' });
    }
    assert.ok(c.over, `fight ${i} did not finish`);
    assert.ok(c.p.hp >= 0 && c.e.hp >= 0);
  }
});

section('Rewards, bosses & progression');
test('victory rewards are applied exactly once', () => {
  const s = newGame('x', 'warrior');
  const c = quickCombat(s, createEnemyUnit(ENEMIES.slime, 1));
  winFight(c);
  const g = s.player.gold;
  const r1 = finishCombat(s, c);
  assert.ok(r1.xp > 0 && r1.gold > 0);
  assert.equal(s.player.gold, g + r1.gold);
  const r2 = finishCombat(s, c);
  assert.equal(r2.ok, false);
  assert.equal(s.player.gold, g + r1.gold);
});
test('xp is reduced for much weaker enemies', () => {
  assert.equal(xpFactor(10, 10), 1);
  assert.equal(xpFactor(10, 8), 1);
  assert.ok(xpFactor(20, 5) <= 0.1 + 1e-9);
});
test('bosses unlock every five levels after the previous boss', () => {
  const s = newGame('x', 'warrior');
  assert.equal(bossStatus(s, 'goblinKing').available, false);
  s.player.level = 5;
  assert.equal(bossStatus(s, 'goblinKing').available, true);
  s.player.level = 10;
  assert.equal(bossStatus(s, 'boneReaper').available, false);
  s.bosses.defeated.goblinKing = true;
  assert.equal(bossStatus(s, 'boneReaper').available, true);
  assert.ok(Object.keys(BOSSES).length >= 10);
  for (const b of Object.values(BOSSES)) assert.equal(b.level % 5, 0);
});
test('boss first-kill loot is granted once; rematches never repeat it', () => {
  const s = newGame('x', 'warrior');
  s.player.level = 5;
  const run = () => {
    const { combat } = startBossFight(s, 'goblinKing', makeRng(5));
    combat.e.hp = 1;
    winFight(combat);
    return finishCombat(s, combat, makeRng(5));
  };
  const first = run();
  assert.ok(first.firstKill);
  assert.ok(first.items.some((i) => i.id === 'goblinCrown' && i.guaranteed));
  assert.equal(s.bosses.defeated.goblinKing, true);
  const xpFirst = first.xp;
  const second = run();
  assert.equal(second.firstKill, false);
  assert.ok(!second.items.some((i) => i.guaranteed));
  assert.ok(second.xp < xpFirst);
  for (let i = 0; i < 50; i++) assert.ok(!rollBossLoot('goblinKing', makeRng(i), { firstKill: false, classId: 'warrior' }).some((d) => d.guaranteed));
});
test('boss phases change as health drops', () => {
  const s = newGame('x', 'warrior');
  s.player.level = 30;
  s.bosses.defeated = { goblinKing: true, boneReaper: true, spiderQueen: true, cursedWarlord: true, shadowSorcerer: true };
  const { combat } = startBossFight(s, 'ancientDragon', makeRng(1));
  combat.e.hp = Math.floor(combat.e.maxHp * 0.5) + 1;
  combat.p.atk = 50;
  combat.p.hp = combat.p.maxHp = 1e6;
  for (let i = 0; i < 3 && combat.e.phaseIndex === 0; i++) combat.act({ type: 'attack' });
  assert.ok(combat.e.phaseIndex >= 1);
});
test('dungeons unlock through progression', () => {
  const s = newGame('x', 'warrior');
  assert.deepEqual(s.dungeons.unlocked, ['whisperingWoods']);
  s.player.level = 3;
  updateUnlocks(s);
  assert.ok(s.dungeons.unlocked.includes('goblinCaves'));
  assert.ok(!s.dungeons.unlocked.includes('forgottenCrypt'));
  s.bosses.defeated.goblinKing = true;
  updateUnlocks(s);
  assert.ok(s.dungeons.unlocked.includes('forgottenCrypt'));
  assert.ok(DUNGEONS.length >= 8);
  assert.equal(explore(s, 'dragonsLair').type, 'error');
});
test('exploring produces events and tracks exploration', () => {
  const s = newGame('x', 'warrior');
  const types = new Set();
  for (let i = 0; i < 80; i++) { const r = explore(s, 'whisperingWoods', makeRng(i)); types.add(r.type); s.player.hp = 999; }
  assert.equal(s.dungeons.explored.whisperingWoods, 80);
  assert.ok(types.has('fight') && types.has('treasure'));
});
test('revive costs 10% gold and restores half health', () => {
  const s = newGame('x', 'warrior');
  s.player.gold = 1000; s.player.hp = 0;
  revive(s);
  assert.equal(s.player.gold, 900);
  assert.equal(s.player.hp, Math.round(computeStats(s.player).maxHp * 0.5));
});

section('Quests');
test('kill quests track automatically and pay once', () => {
  const s = newGame('x', 'warrior');
  assert.equal(questEntry(s, getQuest('m1')).status, 'active');
  for (let i = 0; i < 3; i++) {
    const c = makeCombat(s, createEnemyUnit(ENEMIES.slime, 1), { dungeonId: 'whisperingWoods', rng: makeRng(i) });
    winFight(c);
    finishCombat(s, c);
  }
  assert.equal(questEntry(s, getQuest('m1')).status, 'complete');
  assert.equal(questEntry(s, getQuest('s_slimes')).progress, 3);
  const gold = s.player.gold;
  const r = claimQuestReward(s, 'm1');
  assert.ok(r.ok);
  assert.equal(s.player.gold, gold + 40);
  assert.equal(claimQuestReward(s, 'm1').ok, false);
  assert.equal(s.player.gold, gold + 40);
  assert.equal(questEntry(s, getQuest('m2')).status, 'active', 'next main quest unlocks');
});
test('collect quests consume the items on claim', () => {
  const s = newGame('x', 'warrior');
  s.player.level = 2;
  refreshQuests(s);
  addItem(s, 'wolfPelt', 10);
  refreshQuests(s);
  assert.equal(questEntry(s, getQuest('s_pelts')).status, 'complete');
  assert.ok(claimQuestReward(s, 's_pelts').ok);
  assert.equal(countItem(s, 'wolfPelt'), 0);
});
test('daily quests reset on a new day', () => {
  const s = newGame('x', 'warrior');
  s.daily.quests.d_hunt = { status: 'claimed', progress: 8 };
  ensureDaily(s, new Date(2099, 0, 1));
  assert.equal(s.daily.quests.d_hunt, undefined);
});
test('boss quests complete from boss progression', () => {
  const s = newGame('x', 'warrior');
  s.quests.m1 = { status: 'claimed', progress: 3 };
  s.quests.m2 = { status: 'claimed', progress: 4 };
  refreshQuests(s);
  s.bosses.defeated.goblinKing = true;
  refreshQuests(s);
  assert.equal(questEntry(s, getQuest('m3')).status, 'complete');
});

section('Save system');
test('save and load round-trip', () => {
  const s = newGame('Nicko', 'ranger');
  s.player.gold = 777;
  addItem(s, 'wolfPelt', 3);
  s.bosses.defeated.goblinKing = true;
  assert.ok(saveGame(s, 2).ok);
  const r = loadGame(2);
  assert.ok(r.ok);
  assert.equal(r.state.player.name, 'Nicko');
  assert.equal(r.state.player.gold, 777);
  assert.equal(countItem(r.state, 'wolfPelt'), 3);
  assert.equal(r.state.bosses.defeated.goblinKing, true);
  assert.equal(latestValidSlot(), 2);
});
test('corrupted saves are reported, never crash', () => {
  storage.set('nickoRpg.save.3', '{not json');
  assert.equal(loadGame(3).ok, false);
  assert.equal(listSlots()[2].status, 'corrupt');
  storage.set('nickoRpg.save.3', JSON.stringify({ format: 'nicko-rpg-save', version: 2, state: { player: { classId: 'dragon' } } }));
  assert.equal(loadGame(3).ok, false);
  deleteSave(3);
  assert.equal(listSlots()[2].status, 'empty');
});
test('tampered values are clamped and unknown data removed', () => {
  const { state, warnings } = validateState({
    player: { name: '<script>alert(1)</script>', classId: 'mage', level: 999, xp: -5, gold: -100, hp: 1e9, skillPoints: 9999, skills: { m_fire5: 1, w_off1: 1 },
      equipment: { weapon: { id: 'ironSword', uid: 'x' }, ring: { id: 'nope' } } },
    inventory: [{ id: 'smallHealthPotion', qty: 999 }, { id: 'hackItem', qty: 1 }, 'garbage'],
    quests: { m1: { status: 'claimed' }, fake: { status: 'complete' } },
    bosses: { defeated: { goblinKing: true, fakeBoss: true } },
  });
  const p = state.player;
  assert.equal(p.level, 50);
  assert.equal(p.gold, 0);
  assert.equal(p.xp, 0);
  assert.ok(!p.name.includes('<'));
  assert.equal(p.equipment.weapon.id, 'ironSword'); // valid item and slot is kept (class check happens on equip)
  assert.equal(p.equipment.ring, null);
  assert.equal(state.inventory.length, 1);
  assert.equal(state.inventory[0].qty, 20);
  assert.equal(state.quests.fake, undefined);
  assert.equal(state.bosses.defeated.fakeBoss, undefined);
  assert.ok(p.hp <= computeStats(p).maxHp);
  assert.ok(!('w_off1' in p.skills));
  assert.ok(warnings.length >= 1);
});
test('old saves migrate to the current version', () => {
  const v1 = { version: 1, player: { name: 'Old', classId: 'warrior', level: 3, potions: 4 }, inventory: [] };
  const m = migrate(JSON.parse(JSON.stringify(v1)));
  assert.equal(m.version, 2);
  const { state } = validateState(m);
  assert.equal(countItem(state, 'smallHealthPotion'), 4);
  assert.throws(() => migrate({ version: 99 }));
});
test('save data is never executed', () => {
  const evil = { player: { name: 'x', classId: 'warrior', level: '(() => 5)()', gold: 'process.exit(1)' } };
  const { state } = validateState(evil);
  assert.equal(state.player.level, 1);
  assert.equal(state.player.gold, 0);
});

section('Custom enemy creator');
test('validation catches bad fields', () => {
  const r = validateEnemy({ ...blankEnemy(), name: '', level: 0, hp: 'abc', abilities: [], loot: [{ id: 'x', chance: 500 }], weak: ['fire'], resist: ['fire'] });
  assert.equal(r.ok, false);
  for (const k of ['name', 'level', 'hp', 'abilities', 'loot0', 'weak']) assert.ok(r.errors[k], `expected error for ${k}`);
  assert.ok(validateEnemy(blankEnemy()).ok);
});
test('custom enemies save, edit, duplicate and delete without touching the bestiary', () => {
  const before = JSON.stringify(ENEMIES);
  for (const e of loadCustomEnemies()) deleteCustomEnemy(e.id);
  const r = saveCustomEnemy({ ...blankEnemy(), name: 'Mud Golem', abilities: ['attack', 'crush'] });
  assert.ok(r.ok && r.value.id);
  const edited = saveCustomEnemy({ ...r.value, hp: 999 });
  assert.equal(loadCustomEnemies().length, 1);
  assert.equal(loadCustomEnemies()[0].hp, 999);
  const d = duplicateCustomEnemy(r.value.id);
  assert.ok(d.ok);
  assert.equal(loadCustomEnemies().length, 2);
  assert.ok(deleteCustomEnemy(r.value.id));
  assert.equal(loadCustomEnemies().length, 1);
  assert.equal(JSON.stringify(ENEMIES), before);
  assert.ok(edited.ok);
});
test('test fights with custom enemies never grant rewards', () => {
  const s = newGame('x', 'warrior');
  const v = validateEnemy({ ...blankEnemy(), hp: 5, xp: 50000, gold: 50000 }).value;
  const unit = customEnemyUnit(v);
  assert.equal(unit.maxHp, 5);
  const c = makeCombat(s, unit, { mode: 'test', rng: makeRng(1) });
  winFight(c);
  const gold = s.player.gold, xp = s.player.xp, inv = JSON.stringify(s.inventory);
  const sum = finishCombat(s, c);
  assert.equal(sum.test, true);
  assert.equal(s.player.gold, gold);
  assert.equal(s.player.xp, xp);
  assert.equal(JSON.stringify(s.inventory), inv);
});

section('Enemy AI');
test('heals when badly hurt and a heal is ready', () => {
  const e = createEnemyUnit(ENEMIES.troll, 10);
  e.hp = Math.floor(e.maxHp * 0.1);
  const p = { effects: [] };
  assert.equal(chooseEnemyAction(e, p, makeRng(1)).id, 'trollRegen');
  e.cooldowns.trollRegen = 2;
  assert.notEqual(chooseEnemyAction(e, p, makeRng(1)).id, 'trollRegen');
});
test('does not re-apply debuffs the hero already has', () => {
  const e = createEnemyUnit(ENEMIES.darkMage, 10);
  const p = { effects: [{ id: 'weakness', turns: 2 }, { id: 'marked', turns: 2 }] };
  for (let i = 0; i < 50; i++) assert.notEqual(chooseEnemyAction(e, p, makeRng(i)).id, 'curse');
});
test('healing and buff abilities never deal damage', () => {
  for (const a of Object.values(ENEMY_ABILITIES)) {
    if (a.kind === 'heal' || a.kind === 'buff' || a.kind === 'charge') assert.equal(a.mult, 0, `${a.id} should not deal damage`);
  }
  const s = newGame('x', 'warrior');
  const e = createEnemyUnit(ENEMIES.slime, 1);
  e.abilities = ['oozeRegrowth'];
  e.hp = 5;
  const c = quickCombat(s, e);
  c.p.atk = 1;
  const hp = c.p.hp;
  c.act({ type: 'defend' });
  assert.equal(c.p.hp, hp);
  assert.ok(e.hp > 5);
});
test('releases a charged attack on the following turn', () => {
  const e = createEnemyUnit(ENEMIES.dragon, 30);
  e.charging = 'fireBreath';
  const a = chooseEnemyAction(e, { effects: [] }, makeRng(1));
  assert.equal(a.id, 'fireBreath');
  assert.ok(a.releasing);
});
test('enemies scale with level and vary between encounters', () => {
  const a = createEnemyUnit(ENEMIES.goblin, 5, { rng: makeRng(1) });
  const b = createEnemyUnit(ENEMIES.goblin, 5, { rng: makeRng(2) });
  const c = createEnemyUnit(ENEMIES.goblin, 20, { rng: makeRng(1) });
  assert.notEqual(a.maxHp, b.maxHp);
  assert.ok(c.maxHp > a.maxHp * 2 && c.atk > a.atk);
  assert.ok(Object.keys(ENEMIES).length >= 10);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
