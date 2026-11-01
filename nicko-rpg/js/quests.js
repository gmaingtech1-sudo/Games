// Quest journal. Quests are data; progress is tracked from game events
// (kills, exploration, bosses, level-ups, equipping) and inventory counts.
// A quest's reward can only be claimed once: status goes
// active -> complete -> claimed and never back. Daily quests reset per day.

import { baselineStats } from './enemies.js';
import { countItem, removeById } from './inventory.js';
import { getItem, RARITIES } from './items.js';
import { todayKey } from './utils.js';

const Q = [];
function quest(def) { Q.push({ minLevel: 1, requires: null, ...def }); }

/* ---------------- Main story ---------------- */
quest({ id: 'm1', kind: 'main', name: 'A Hero Awakens', desc: 'The elder of Emberhollow asks you to clear the paths of the Whispering Woods.',
  objective: { type: 'kill', dungeon: 'whisperingWoods', count: 3, label: 'Defeat enemies in the Whispering Woods' },
  reward: { xp: 60, gold: 40, items: [{ id: 'smallHealthPotion', qty: 3 }] } });
quest({ id: 'm2', kind: 'main', name: 'Goblin Trouble', requires: 'm1', desc: 'Goblins have been raiding caravans. Thin their numbers.',
  objective: { type: 'kill', enemy: ['goblin', 'goblinShaman'], count: 4, label: 'Defeat goblins' },
  reward: { xp: 160, gold: 80, items: [{ id: 'manaPotion', qty: 2 }] } });
quest({ id: 'm3', kind: 'main', name: 'The Goblin King', requires: 'm2', desc: 'The raids are ordered by a self-crowned king deep in the Goblin Caves. End his reign.',
  objective: { type: 'boss', boss: 'goblinKing', label: 'Defeat the Goblin King (level 5)' },
  reward: { xp: 450, gold: 200, items: [{ id: 'largeHealthPotion', qty: 1 }] } });
quest({ id: 'm4', kind: 'main', name: 'Into the Crypt', requires: 'm3', desc: 'Among the king\'s treasure was a map to the Forgotten Crypt. Explore the ancient dungeon.',
  objective: { type: 'explore', dungeon: 'forgottenCrypt', count: 8, label: 'Explore the Forgotten Crypt' },
  reward: { xp: 800, gold: 300, items: [{ id: 'largeHealthPotion', qty: 2 }] } });
quest({ id: 'm5', kind: 'main', name: 'The Bone Reaper', requires: 'm4', desc: 'Something in the crypt is harvesting souls. Put it to rest.',
  objective: { type: 'boss', boss: 'boneReaper', label: 'Defeat the Bone Reaper (level 10)' },
  reward: { xp: 1600, gold: 500, items: [{ id: 'greaterManaPotion', qty: 2 }] } });
quest({ id: 'm6', kind: 'main', name: 'Silk and Venom', requires: 'm5', desc: 'The Reaper served a darker power. Its trail leads into the Spider Nest.',
  objective: { type: 'boss', boss: 'spiderQueen', label: 'Defeat the Spider Queen (level 15)' },
  reward: { xp: 3200, gold: 900, items: [{ id: 'regenTonic', qty: 2 }] } });
quest({ id: 'm7', kind: 'main', name: 'The Black Fortress', requires: 'm6', desc: 'A cursed army stirs in the old fortress. Its Warlord must fall.',
  objective: { type: 'boss', boss: 'cursedWarlord', label: 'Defeat the Cursed Warlord (level 20)' },
  reward: { xp: 5200, gold: 1500, items: [{ id: 'elixir', qty: 1 }] } });
quest({ id: 'm8', kind: 'main', name: 'Ice and Shadow', requires: 'm7', desc: 'The curse flows from beneath the Frozen Caverns, where a sorcerer has opened a rift.',
  objective: { type: 'boss', boss: 'shadowSorcerer', label: 'Defeat the Shadow Sorcerer (level 25)' },
  reward: { xp: 8500, gold: 2500, items: [{ id: 'elixir', qty: 1 }] } });
quest({ id: 'm9', kind: 'main', name: 'Dragonfall', requires: 'm8', desc: 'The sorcerer\'s rift woke the Ancient Dragon. Face it in its lair.',
  objective: { type: 'boss', boss: 'ancientDragon', label: 'Defeat the Ancient Dragon (level 30)' },
  reward: { xp: 12500, gold: 4000, items: [{ id: 'elixir', qty: 2 }] } });
quest({ id: 'm10', kind: 'main', name: 'Beyond the Veil', requires: 'm9', desc: 'With the dragon slain, the way into the Shadow Realm lies open. Its Herald awaits.',
  objective: { type: 'boss', boss: 'voidHerald', label: 'Defeat the Void Herald (level 35)' },
  reward: { xp: 17000, gold: 6000, items: [{ id: 'elixir', qty: 2 }] } });
quest({ id: 'm11', kind: 'main', name: 'The Undying Crown', requires: 'm10', desc: 'The Herald spoke of an emperor who cheated death in the Necropolis of Ash.',
  objective: { type: 'boss', boss: 'lichEmperor', label: 'Defeat the Lich Emperor (level 40)' },
  reward: { xp: 23000, gold: 8000, items: [{ id: 'elixir', qty: 2 }] } });
quest({ id: 'm12', kind: 'main', name: 'Depths of the Abyss', requires: 'm11', desc: 'A beast guards the road to the Abyssal Throne.',
  objective: { type: 'boss', boss: 'abyssalBehemoth', label: 'Defeat the Abyssal Behemoth (level 45)' },
  reward: { xp: 30000, gold: 11000, items: [{ id: 'elixir', qty: 3 }] } });
quest({ id: 'm13', kind: 'main', name: 'The Eternal Tyrant', requires: 'm12', desc: 'End it. Defeat the Eternal Tyrant and free the world.',
  objective: { type: 'boss', boss: 'eternalTyrant', label: 'Defeat the Eternal Tyrant (level 50)' },
  reward: { xp: 0, gold: 25000, items: [{ id: 'elixir', qty: 5 }] } });

/* ---------------- Side quests ---------------- */
quest({ id: 's_slimes', kind: 'side', name: 'Slime Cleanup', desc: 'The farmers want the slimes out of their wells.',
  objective: { type: 'kill', enemy: ['slime'], count: 5, label: 'Defeat slimes' }, reward: { xp: 60, gold: 35 } });
quest({ id: 's_pelts', kind: 'side', name: 'Pelts for the Tanner', minLevel: 2, desc: 'Hilda the tanner needs wolf pelts before winter. Bring her ten.',
  objective: { type: 'collect', item: 'wolfPelt', count: 10, label: 'Collect wolf pelts' }, reward: { xp: 250, gold: 160, items: [{ id: 'leatherBoots', qty: 1 }] } });
quest({ id: 's_traveller', kind: 'side', name: 'The Lost Traveller', minLevel: 3, desc: 'Edda the traveller never arrived. Search the Whispering Woods and the Goblin Caves for her.',
  objective: { type: 'find', item: 'travellerLocket', label: 'Find the lost traveller' }, reward: { xp: 300, gold: 150, items: [{ id: 'ringOfVigor', qty: 1 }] } });
quest({ id: 'moonsteel', kind: 'side', name: 'The Moonsteel Blade', minLevel: 8, desc: 'The blacksmith tells of a magical sword shattered in the Forgotten Crypt. Its undead guardians carry the shards.',
  objective: { type: 'collect', item: 'moonsteelShard', count: 3, label: 'Recover moonsteel shards' }, reward: { xp: 900, gold: 200, items: [{ id: 'moonsteelBlade', qty: 1 }] } });
quest({ id: 's_wraiths', kind: 'side', name: 'Banish the Wraiths', minLevel: 8, desc: 'The chapel priest begs you to banish the wraiths beneath it. Magic works best.',
  objective: { type: 'kill', enemy: ['wraith'], count: 6, label: 'Defeat wraiths' }, reward: { xp: 1000, gold: 400 } });
quest({ id: 's_bones', kind: 'side', name: 'Bone Collector', minLevel: 8, desc: 'An alchemist pays well for bone fragments. Do not ask why.',
  objective: { type: 'collect', item: 'boneFragment', count: 12, label: 'Collect bone fragments' }, reward: { xp: 800, gold: 450, items: [{ id: 'regenTonic', qty: 1 }] } });
quest({ id: 's_gear', kind: 'side', name: 'Master of Arms', minLevel: 10, desc: 'Prove yourself by wielding gear of epic quality or better.',
  objective: { type: 'equipRarity', rarity: 'epic', label: 'Equip an Epic (or better) item' }, reward: { xp: 1200, gold: 600 } });
quest({ id: 's_level10', kind: 'side', name: 'Seasoned Adventurer', minLevel: 1, desc: 'The guild will recognise you once you reach level 10.',
  objective: { type: 'level', level: 10, label: 'Reach level 10' }, reward: { xp: 0, gold: 500, items: [{ id: 'largeHealthPotion', qty: 3 }] } });
quest({ id: 's_spiders', kind: 'side', name: 'Spider Extermination', minLevel: 12, desc: 'The spiders are spreading toward the farms. Burn them back.',
  objective: { type: 'kill', enemy: ['giantSpider'], count: 8, label: 'Defeat giant spiders' }, reward: { xp: 1600, gold: 650 } });
quest({ id: 's_orcs', kind: 'side', name: 'Orc Menace', minLevel: 17, desc: 'Orc warbands march under the Warlord\'s banner. Break them.',
  objective: { type: 'kill', enemy: ['orcWarrior'], count: 10, label: 'Defeat orc warriors' }, reward: { xp: 3600, gold: 1300 } });
quest({ id: 's_frost', kind: 'side', name: 'Shards of Winter', minLevel: 22, desc: 'The court enchanter needs frost crystals for a ward.',
  objective: { type: 'collect', item: 'frostCrystal', count: 8, label: 'Collect frost crystals' }, reward: { xp: 4800, gold: 1500, items: [{ id: 'frostCrown', qty: 1 }] } });
quest({ id: 's_trolls', kind: 'side', name: 'Troll Hunter', minLevel: 22, desc: 'Trolls are blocking the mountain passes.',
  objective: { type: 'kill', enemy: ['troll', 'frostTroll'], count: 5, label: 'Defeat trolls' }, reward: { xp: 5000, gold: 1600 } });
quest({ id: 's_level25', kind: 'side', name: 'Veteran of Emberhollow', minLevel: 1, desc: 'Reach level 25 to earn the town\'s highest honour.',
  objective: { type: 'level', level: 25, label: 'Reach level 25' }, reward: { xp: 0, gold: 4000, items: [{ id: 'elixir', qty: 1 }] } });
quest({ id: 's_drakes', kind: 'side', name: 'Drake Slayer', minLevel: 28, desc: 'Young drakes are hatching in the volcano. Thin them out.',
  objective: { type: 'kill', enemy: ['dragon'], count: 6, label: 'Defeat drakes' }, reward: { xp: 11000, gold: 4000, items: [{ id: 'dragonboneHelm', qty: 1 }] } });

/* ---------------- Daily (repeatable) ---------------- */
quest({ id: 'd_hunt', kind: 'daily', name: 'Daily Hunt', desc: 'The bounty board always wants more monsters slain.',
  objective: { type: 'kill', count: 8, label: 'Defeat any enemies' }, reward: { scaled: { xp: 3, gold: 4 } } });
quest({ id: 'd_explore', kind: 'daily', name: 'Daily Expedition', desc: 'Scout the wilds and report back.',
  objective: { type: 'explore', count: 10, label: 'Explore any location' }, reward: { scaled: { xp: 2.5, gold: 3 } } });
quest({ id: 'd_elite', kind: 'daily', name: 'Elite Bounty', desc: 'Hunt down a dangerous elite monster.',
  objective: { type: 'kill', elite: true, count: 1, label: 'Defeat an elite enemy' }, reward: { scaled: { xp: 3, gold: 5 } } });

export const QUESTS = Object.freeze(Q);
export function getQuest(id) { return QUESTS.find((q) => q.id === id) || null; }

function questStore(state, q) {
  if (q.kind === 'daily') return state.daily.quests;
  return state.quests;
}
export function questEntry(state, q) {
  return questStore(state, q)[q.id] || null;
}

function isUnlocked(state, q) {
  if (state.player.level < q.minLevel) return false;
  if (q.requires && state.quests[q.requires]?.status !== 'claimed') return false;
  return true;
}

export function resolveReward(state, q) {
  if (!q.reward.scaled) return q.reward;
  const b = baselineStats(state.player.level);
  return { xp: Math.round(b.xp * q.reward.scaled.xp), gold: Math.round(b.gold * q.reward.scaled.gold), items: [] };
}

/** Progress value for display and completion checks. */
export function questProgress(state, q) {
  const entry = questEntry(state, q);
  const o = q.objective;
  switch (o.type) {
    case 'collect': return Math.min(o.count, countItem(state, o.item));
    case 'find': return countItem(state, o.item) > 0 ? 1 : 0;
    case 'boss': return state.bosses.defeated[o.boss] ? 1 : 0;
    case 'level': return state.player.level >= o.level ? 1 : 0;
    default: return Math.min(o.count || 1, entry?.progress || 0);
  }
}
export function questTarget(q) {
  return ['find', 'boss', 'level', 'equipRarity'].includes(q.objective.type) ? 1 : q.objective.count;
}

/** Reset daily quests on a new calendar day. */
export function ensureDaily(state, now = new Date()) {
  const key = todayKey(now);
  if (state.daily.date !== key) {
    state.daily = { date: key, quests: {} };
  }
}

/**
 * Activate newly available quests and mark quests complete when their
 * objective is met. Returns the list of quests that just became complete.
 */
export function refreshQuests(state) {
  ensureDaily(state);
  const completed = [];
  for (const q of QUESTS) {
    const store = questStore(state, q);
    let entry = store[q.id];
    if (!entry) {
      if (!isUnlocked(state, q)) continue;
      entry = store[q.id] = { status: 'active', progress: 0 };
    }
    if (entry.status === 'active' && questProgress(state, q) >= questTarget(q)) {
      entry.status = 'complete';
      completed.push(q);
    } else if (entry.status === 'complete' && q.objective.type === 'collect' && countItem(state, q.objective.item) < q.objective.count) {
      // Items were used or sold before turning in: back to active.
      entry.status = 'active';
    }
  }
  return completed;
}

function matchesKill(o, ev) {
  if (ev.type !== 'kill') return false;
  if (o.enemy && !o.enemy.includes(ev.enemy)) return false;
  if (o.dungeon && o.dungeon !== ev.dungeon) return false;
  if (o.elite && !ev.elite) return false;
  return true;
}

/** Feed a game event to all active quests. Returns quests that completed. */
export function questEvent(state, ev) {
  ensureDaily(state);
  for (const q of QUESTS) {
    const entry = questEntry(state, q);
    if (!entry || entry.status !== 'active') continue;
    const o = q.objective;
    if (o.type === 'kill' && matchesKill(o, ev)) entry.progress = Math.min(o.count, (entry.progress || 0) + 1);
    if (o.type === 'explore' && ev.type === 'explore' && (!o.dungeon || o.dungeon === ev.dungeon)) entry.progress = Math.min(o.count, (entry.progress || 0) + 1);
    if (o.type === 'equipRarity' && ev.type === 'equip' && RARITIES[ev.rarity]?.order >= RARITIES[o.rarity].order) entry.progress = 1;
  }
  return refreshQuests(state);
}

/** Set of quest ids currently active (used by loot tables for quest drops). */
export function activeQuestIds(state) {
  const s = new Set();
  for (const q of QUESTS) if (questEntry(state, q)?.status === 'active') s.add(q.id);
  return s;
}

/**
 * Claim a completed quest's reward. Returns { ok, reward } — the caller
 * applies xp (for level-up handling) and items. Claimed quests can never pay out again.
 */
export function claimQuest(state, id) {
  const q = getQuest(id);
  if (!q) return { ok: false, reason: 'Unknown quest.' };
  refreshQuests(state);
  const entry = questEntry(state, q);
  if (!entry) return { ok: false, reason: 'Quest not available.' };
  if (entry.status === 'claimed') return { ok: false, reason: 'Reward already claimed.' };
  if (entry.status !== 'complete') return { ok: false, reason: 'Quest is not complete yet.' };
  const o = q.objective;
  if (o.type === 'collect' && !removeById(state, o.item, o.count)) return { ok: false, reason: 'You no longer have the items.' };
  if (o.type === 'find') removeById(state, o.item, countItem(state, o.item));
  entry.status = 'claimed';
  return { ok: true, quest: q, reward: resolveReward(state, q) };
}

/**
 * How many of an item active quests still need. Selling below this would
 * break quest progress. Quest items are always fully reserved.
 */
export function questReservedCount(state, itemId) {
  const def = getItem(itemId);
  if (def?.type === 'quest') return Infinity;
  let need = 0;
  for (const q of QUESTS) {
    const e = questEntry(state, q);
    if (e && (e.status === 'active' || e.status === 'complete') && q.objective.type === 'collect' && q.objective.item === itemId) need += q.objective.count;
  }
  return need;
}
