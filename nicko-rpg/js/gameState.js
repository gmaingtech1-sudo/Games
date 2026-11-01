// The game state and the high-level operations that tie the systems together:
// new game, exploring, starting fights, applying combat results, reviving.
// No DOM access here, so all of it can be unit tested.

import { createPlayer, computeStats, gainXp, clampVitals, CLASSES } from './character.js';
import { addItem, findEntry, removeItem, countItem } from './inventory.js';
import { getItem } from './items.js';
import { refreshQuests, questEvent, activeQuestIds, claimQuest, ensureDaily } from './quests.js';
import { getDungeon, dungeonStatus, encounterLevel, DUNGEONS } from './dungeons.js';
import { getEnemyTemplate, createEnemyUnit, baselineStats } from './enemies.js';
import { createBossUnit, bossStatus, getBoss } from './bosses.js';
import { rollEnemyLoot, rollBossLoot } from './loot.js';
import { Combat, buildPlayerUnit } from './combat.js';
import { knownAbilityIds } from './skillTree.js';
import { makeRng, todayKey, createEmitter } from './utils.js';

export const SAVE_VERSION = 2;
export const events = createEmitter();

export function defaultState() {
  return {
    version: SAVE_VERSION,
    createdAt: Date.now(),
    playTime: 0,
    player: null,
    inventory: [],
    quests: {},
    daily: { date: todayKey(), quests: {} },
    bosses: { defeated: {}, attempts: {} },
    dungeons: { explored: {}, unlocked: ['whisperingWoods'] },
    stats: { kills: 0, deaths: 0, goldEarned: 0, bossKills: 0, elitesKilled: 0, explores: 0 },
  };
}

export function newGame(name, classId) {
  if (!CLASSES[classId]) throw new Error('Choose a class');
  const s = defaultState();
  s.player = createPlayer(name, classId);
  addItem(s, 'smallHealthPotion', 3);
  addItem(s, 'manaPotion', 1);
  refreshQuests(s);
  updateUnlocks(s);
  return s;
}

/** Recompute which locations are open and remember them in the save. */
export function updateUnlocks(state) {
  const before = new Set(state.dungeons.unlocked);
  state.dungeons.unlocked = DUNGEONS.filter((d) => dungeonStatus(state, d).unlocked).map((d) => d.id);
  return state.dungeons.unlocked.filter((id) => !before.has(id));
}

/* ---------------- Exploration ---------------- */

/**
 * Explore a location once. Returns an outcome:
 *  { type: 'fight', enemy } | 'treasure' | 'trap' | 'shrine' | 'traveller'
 */
export function explore(state, dungeonId, rng = makeRng()) {
  const d = getDungeon(dungeonId);
  if (!d) return { type: 'error', message: 'Unknown location.' };
  if (!dungeonStatus(state, d).unlocked) return { type: 'error', message: 'That location is still locked.' };
  const p = state.player;
  if (p.hp <= 0) return { type: 'error', message: 'You are too wounded to explore.' };
  state.dungeons.explored[d.id] = (state.dungeons.explored[d.id] || 0) + 1;
  state.stats.explores += 1;
  const completed = questEvent(state, { type: 'explore', dungeon: d.id });
  const out = { completed };

  const travellerHere = ['whisperingWoods', 'goblinCaves'].includes(d.id) && activeQuestIds(state).has('s_traveller') && countItem(state, 'travellerLocket') === 0;
  const roll = rng();
  if (travellerHere && roll < 0.2) {
    addItem(state, 'travellerLocket', 1);
    return { ...out, type: 'traveller', completed: [...completed, ...refreshQuests(state)],
      text: 'You find Edda the traveller hiding in a hollow, her ankle twisted. She presses a silver locket into your hand: "Take this to my family in Emberhollow, please."' };
  }
  if (roll < 0.72) {
    return { ...out, type: 'fight', enemy: rollEncounter(state, d, rng) };
  }
  const s = computeStats(p);
  if (roll < 0.84) {
    const b = baselineStats(encounterLevel(d, p.level, rng));
    const gold = Math.round(b.gold * (1 + rng() * 1.5));
    p.gold += gold;
    state.stats.goldEarned += gold;
    const items = [];
    if (rng() < 0.5) {
      const id = rng.pick(d.treasure);
      const def = getItem(id);
      if (def && (def.type === 'potion' || def.level <= p.level + 3)) { addItem(state, id, 1); items.push(id); }
    }
    return { ...out, type: 'treasure', gold, items, completed: [...completed, ...refreshQuests(state)], text: 'You discover a hidden cache!' };
  }
  if (roll < 0.92) {
    const dmg = Math.max(1, Math.min(p.hp - 1, Math.round(s.maxHp * (0.06 + rng() * 0.06))));
    p.hp = Math.max(1, p.hp - dmg);
    return { ...out, type: 'trap', dmg, text: rng.pick(['A hidden blade swings from the wall!', 'The floor gives way beneath you!', 'Poisoned darts hiss from the shadows!', 'A boulder tumbles down the slope!']) };
  }
  const hp = Math.round(s.maxHp * 0.3), mp = Math.round(s.maxMp * 0.3);
  const beforeHp = p.hp, beforeMp = p.mp;
  p.hp = Math.min(s.maxHp, p.hp + hp);
  p.mp = Math.min(s.maxMp, p.mp + mp);
  return { ...out, type: 'shrine', hp: p.hp - beforeHp, mp: p.mp - beforeMp, text: 'You find an ancient shrine. Its warm light soothes your wounds.' };
}

export function rollEncounter(state, d, rng) {
  const pick = rng.weighted(d.encounters.map((e) => ({ ...e, w: e.w })));
  const tpl = getEnemyTemplate(pick.enemy);
  const level = encounterLevel(d, state.player.level, rng);
  const elite = rng() < (state.player.level >= 5 ? 0.08 : 0.02);
  return createEnemyUnit(tpl, level, { rng, elite });
}

/* ---------------- Combat setup and results ---------------- */

export function makeCombat(state, enemy, { mode = 'normal', dungeonId = null, rng = makeRng() } = {}) {
  const p = state.player;
  const stats = computeStats(p);
  const unit = buildPlayerUnit(p, stats, knownAbilityIds(p));
  let hooks;
  if (mode === 'test') {
    // Developer test fights use a sandboxed potion bag, never the real inventory.
    const bag = { smallHealthPotion: 5, manaPotion: 5, antidote: 3 };
    hooks = {
      sandbox: bag,
      peekItem: (id) => (bag[id] > 0 ? getItem(id) : null),
      consumeItem: (id) => (bag[id] > 0 ? (bag[id]--, getItem(id)) : null),
    };
  } else {
    hooks = {
      peekItem: (uid) => { const e = findEntry(state, uid); return e ? getItem(e.id) : null; },
      consumeItem: (uid) => { const e = findEntry(state, uid); const def = e && getItem(e.id); if (!def || def.type !== 'potion') return null; removeItem(state, uid, 1); return def; },
    };
  }
  const combat = new Combat({ player: unit, enemy, rng, mode, canFlee: mode !== 'boss', hooks });
  combat.ctx = { dungeonId, mode, rewarded: false };
  if (enemy.isBoss && mode !== 'test') state.bosses.attempts[enemy.bossId] = (state.bosses.attempts[enemy.bossId] || 0) + 1;
  return combat;
}

export function startBossFight(state, bossId, rng = makeRng()) {
  const st = bossStatus(state, bossId);
  if (!st.available) return { ok: false, reason: st.reasons.join(', ') };
  const unit = createBossUnit(bossId, { rng });
  return { ok: true, combat: makeCombat(state, unit, { mode: 'boss', dungeonId: getBoss(bossId).dungeon, rng }) };
}

/** XP is reduced for enemies far below the player's level (no farming exploits). */
export function xpFactor(playerLevel, enemyLevel) {
  const diff = playerLevel - enemyLevel;
  if (diff <= 2) return 1;
  return Math.max(0.1, 1 - 0.2 * (diff - 2));
}

/**
 * Apply the outcome of a finished fight to the game state exactly once.
 * Returns a summary for the victory/defeat screen.
 */
export function finishCombat(state, combat, rng = makeRng()) {
  if (!combat.over) return { ok: false, reason: 'Combat is still running.' };
  if (combat.ctx.rewarded) return { ok: false, reason: 'Already resolved.' };
  combat.ctx.rewarded = true;
  const p = state.player;
  const e = combat.e;
  const summary = { result: combat.phase, xp: 0, gold: 0, items: [], converted: 0, levelUps: [], completed: [], unlocked: [], firstKill: false, boss: e.isBoss ? e.bossId : null, test: combat.ctx.mode === 'test' };

  if (combat.ctx.mode === 'test') return summary; // test fights never touch progression

  p.hp = combat.p.hp;
  p.mp = combat.p.mp;

  if (combat.phase === 'victory') {
    let xp, gold, drops;
    if (e.isBoss) {
      const first = !state.bosses.defeated[e.bossId];
      summary.firstKill = first;
      xp = first ? e.xpReward : e.rematchXp;
      gold = first ? e.goldReward : e.rematchGold;
      drops = rollBossLoot(e.bossId, rng, { firstKill: first, classId: p.classId });
      state.bosses.defeated[e.bossId] = true;
      state.stats.bossKills += 1;
    } else {
      xp = Math.round(e.xpReward * xpFactor(p.level, e.level));
      gold = Math.round(e.goldReward * (0.85 + rng() * 0.3));
      drops = rollEnemyLoot(e, rng, { classId: p.classId, activeQuests: activeQuestIds(state) });
      state.stats.kills += 1;
      if (e.elite) state.stats.elitesKilled += 1;
    }
    p.gold += gold;
    state.stats.goldEarned += gold;
    summary.gold = gold;
    summary.xp = xp;
    for (const d of drops) {
      const r = addItem(state, d.id, d.qty);
      summary.items.push({ ...d, added: r.added });
      summary.converted += r.converted;
    }
    summary.levelUps = gainXp(p, xp);
    const ev = e.isBoss ? { type: 'boss', boss: e.bossId } : { type: 'kill', enemy: e.templateId, dungeon: combat.ctx.dungeonId, elite: e.elite };
    summary.completed = questEvent(state, ev);
    if (summary.levelUps.length) summary.completed.push(...questEvent(state, { type: 'level' }));
    summary.unlocked = updateUnlocks(state);
  } else if (combat.phase === 'defeat') {
    state.stats.deaths += 1;
    p.hp = 0;
  }
  clampVitals(p);
  if (p.hp <= 0 && combat.phase === 'defeat') p.hp = 0;
  return summary;
}

/** After a defeat: wake up in town with half health, losing 10% of gold. */
export function revive(state) {
  const p = state.player;
  const s = computeStats(p);
  const lost = Math.floor(p.gold * 0.1);
  p.gold -= lost;
  p.hp = Math.max(1, Math.round(s.maxHp * 0.5));
  p.mp = Math.round(s.maxMp * 0.5);
  return { lost };
}

/** Claim a quest and apply its rewards (xp, gold, items). */
export function claimQuestReward(state, id) {
  const res = claimQuest(state, id);
  if (!res.ok) return res;
  const r = res.reward;
  const p = state.player;
  p.gold += r.gold || 0;
  state.stats.goldEarned += r.gold || 0;
  const items = [];
  for (const it of r.items || []) { addItem(state, it.id, it.qty); items.push(it); }
  const levelUps = gainXp(p, r.xp || 0);
  const completed = levelUps.length ? questEvent(state, { type: 'level' }) : refreshQuests(state);
  const unlocked = updateUnlocks(state);
  return { ok: true, quest: res.quest, xp: r.xp || 0, gold: r.gold || 0, items, levelUps, completed, unlocked };
}

export function tickPlayTime(state, seconds) {
  state.playTime = Math.max(0, (state.playTime || 0) + seconds);
  ensureDaily(state);
}
