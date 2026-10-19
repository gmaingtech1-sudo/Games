// Player progress: saving, levels, and applying mission results.
import {
  ACHIEVEMENTS, FACTION_BONUS, MISSIONS, PORTALS, RANKS, REPLAY_XP,
} from './data.js';

const SAVE_KEY = 'riftworld.save.v1';

export function newPlayer() {
  return {
    name: 'Traveller',
    faction: null,
    xp: 0,
    completed: {},             // missionId -> times won
    inventory: { chrono_cell: 1 },
    achievements: [],
    visited: [],               // portal ids
    stats: { runs: 0, wins: 0, perfect: 0, factionWins: 0, nodes: 0, shards: 0 },
  };
}

export function loadPlayer() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return newPlayer();
    const saved = JSON.parse(raw);
    const fresh = newPlayer();
    return { ...fresh, ...saved, stats: { ...fresh.stats, ...saved.stats } };
  } catch {
    return newPlayer();
  }
}

export function savePlayer(player) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(player));
  } catch {
    // Storage can be blocked (private mode). The game still works, it just won't remember.
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // ignore
  }
}

// Total XP needed to reach a level: L2 = 100, L3 = 300, L4 = 600, L5 = 1000...
export const xpForLevel = (level) => 50 * (level - 1) * level;

export function levelInfo(xp) {
  let level = 1;
  while (xp >= xpForLevel(level + 1)) level++;
  const start = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return {
    level,
    rank: RANKS[Math.min(level - 1, RANKS.length - 1)],
    into: xp - start,
    needed: next - start,
    progress: (xp - start) / (next - start),
  };
}

export const portalById = (id) => PORTALS.find((p) => p.id === id);
export const missionById = (id) => MISSIONS.find((m) => m.id === id);
export const missionsAt = (portalId) => MISSIONS.filter((m) => m.portal === portalId);

// Adds newly earned achievements to the player and returns their ids.
export function unlockAchievements(player) {
  const level = levelInfo(player.xp).level;
  const fresh = ACHIEVEMENTS.filter(
    (a) => !player.achievements.includes(a.id) && a.check(player, level),
  ).map((a) => a.id);
  player.achievements.push(...fresh);
  return fresh;
}

function addItems(player, items) {
  for (const [id, qty] of Object.entries(items)) {
    if (qty > 0) player.inventory[id] = (player.inventory[id] || 0) + qty;
  }
}

// run = { won, nodes, shards, anomalies }
// Returns the updated player and a summary for the results screen.
export function applyRun(player, mission, run) {
  const p = structuredClone(player);
  const portal = portalById(mission.portal);
  p.stats.runs++;
  p.stats.nodes += run.nodes;
  p.stats.shards += run.shards;

  // Shards you caught are yours even if the mission fails.
  const items = run.shards > 0 ? { aether_shard: run.shards } : {};
  const summary = { won: run.won, xp: 0, items, levelUp: null, achievements: [], firstClear: false, factionBonus: false };

  if (run.won) {
    const firstClear = !p.completed[mission.id];
    const factionBonus = !!portal.faction && portal.faction === p.faction;
    let xp = firstClear ? mission.xp : Math.round(mission.xp * REPLAY_XP);
    if (factionBonus) xp = Math.round(xp * (1 + FACTION_BONUS));

    p.completed[mission.id] = (p.completed[mission.id] || 0) + 1;
    p.stats.wins++;
    if (run.anomalies === 0) p.stats.perfect++;
    if (factionBonus) p.stats.factionWins++;

    const before = levelInfo(p.xp).level;
    p.xp += xp;
    const after = levelInfo(p.xp).level;

    if (firstClear) {
      for (const [id, qty] of Object.entries(mission.rewards)) items[id] = (items[id] || 0) + qty;
    }
    Object.assign(summary, { xp, firstClear, factionBonus, levelUp: after > before ? after : null });
  }

  addItems(p, items);
  summary.achievements = unlockAchievements(p);
  return { player: p, summary };
}
