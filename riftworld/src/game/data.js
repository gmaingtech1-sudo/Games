// All of RiftWorld's content lives here: factions, portals, missions,
// items and achievements. Change the numbers to tune the game.

export const FACTIONS = {
  vanguard: {
    id: 'vanguard',
    name: 'Vanguard',
    color: '#3da5ff',
    motto: 'Hold the line between worlds.',
    about: 'Disciplined guardians who seal unstable rifts before they swallow cities.',
  },
  riftborn: {
    id: 'riftborn',
    name: 'Riftborn',
    color: '#b45cff',
    motto: 'Chaos is a doorway.',
    about: 'Wanderers changed by the rifts. They ride portal storms that would tear others apart.',
  },
  nexus: {
    id: 'nexus',
    name: 'Nexus',
    color: '#3dffa0',
    motto: 'Every portal is a pattern.',
    about: 'Engineers and hackers decoding the portal network, one signal at a time.',
  },
};

export const NEUTRAL_COLOR = '#ffcc66';

// x and y are percentages of the map area.
export const PORTALS = [
  {
    id: 'halo',
    name: 'Halo Gate',
    region: 'Shattered Coast',
    faction: null,
    level: 1,
    x: 50, y: 78,
    lore: 'The first portal ever found. Calm, bright and perfect for new travellers.',
  },
  {
    id: 'azure',
    name: 'Azure Bastion',
    region: 'Frostline Ridge',
    faction: 'vanguard',
    level: 1,
    x: 22, y: 55,
    lore: 'A Vanguard fortress built around a portal that keeps trying to open wider.',
  },
  {
    id: 'violet',
    name: 'Violet Maw',
    region: 'Storm Wastes',
    faction: 'riftborn',
    level: 1,
    x: 78, y: 52,
    lore: 'A howling purple tear in the sky. The Riftborn call it home.',
  },
  {
    id: 'verdant',
    name: 'Verdant Core',
    region: 'Circuit Jungle',
    faction: 'nexus',
    level: 1,
    x: 55, y: 34,
    lore: 'A portal wrapped in living circuitry, humming with Nexus code.',
  },
  {
    id: 'echo',
    name: 'Echo Spire',
    region: 'Glass Canyon',
    faction: null,
    level: 2,
    x: 24, y: 22,
    lore: 'Every sound here repeats a second late. Something on the other side is listening.',
  },
  {
    id: 'singularity',
    name: 'The Singularity',
    region: 'The Null Zone',
    faction: null,
    level: 3,
    x: 74, y: 13,
    lore: 'Where all portals lead in the end. Only experienced travellers return.',
  },
];

// Mission goals:
//   nodes        - tap this many glowing rift nodes
//   shards       - catch this many gold aether shards
//   maxAnomalies - touch more red anomalies than this and the mission fails
// time is in seconds, pace is milliseconds between spawns (lower = harder).
export const MISSIONS = [
  {
    id: 'halo-1', portal: 'halo',
    title: 'Calibrate the Gate',
    brief: 'The Halo Gate is flickering. Tap the glowing nodes to tune it.',
    time: 25, pace: 800,
    goals: { nodes: 6 },
    xp: 50, rewards: { rift_crystal: 1 },
  },
  {
    id: 'halo-2', portal: 'halo',
    title: 'Shard Sweep',
    brief: 'Aether shards are spilling out of the gate. Catch them before they fade.',
    time: 25, pace: 750,
    goals: { nodes: 4, shards: 3 },
    xp: 60, rewards: { chrono_cell: 1 },
  },
  {
    id: 'azure-1', portal: 'azure',
    title: 'Seal the Breach',
    brief: 'Vanguard sensors report a breach. Lock it down and keep your hands off the red anomalies.',
    time: 25, pace: 700,
    goals: { nodes: 10 }, maxAnomalies: 2,
    xp: 80, rewards: { vanguard_sigil: 1 },
  },
  {
    id: 'violet-1', portal: 'violet',
    title: 'Ride the Storm',
    brief: 'The Violet Maw is raging. Nodes appear and vanish fast. Keep up.',
    time: 22, pace: 550,
    goals: { nodes: 12, shards: 2 },
    xp: 90, rewards: { riftborn_sigil: 1 },
  },
  {
    id: 'verdant-1', portal: 'verdant',
    title: 'Decode the Lattice',
    brief: 'Nexus engineers need clean readings. Precision matters more than speed.',
    time: 28, pace: 700,
    goals: { nodes: 8, shards: 4 }, maxAnomalies: 1,
    xp: 90, rewards: { nexus_sigil: 1 },
  },
  {
    id: 'echo-1', portal: 'echo',
    title: 'Echo Hunt',
    brief: 'Signals bounce around the canyon. Catch every echo before it repeats.',
    time: 30, pace: 550,
    goals: { nodes: 14, shards: 3 }, maxAnomalies: 3,
    xp: 140, rewards: { rift_crystal: 2, chrono_cell: 1 },
  },
  {
    id: 'singularity-1', portal: 'singularity',
    title: 'Heart of the Rift',
    brief: 'Stabilise the source of every portal. One mistake too many and it collapses.',
    time: 35, pace: 480,
    goals: { nodes: 18, shards: 5 }, maxAnomalies: 2,
    xp: 250, rewards: { singularity_core: 1 },
  },
];

export const ITEMS = {
  aether_shard: {
    name: 'Aether Shard', rarity: 'Common', color: '#ffcc66', shape: 'diamond',
    about: 'Raw portal energy. You catch these during missions.',
  },
  rift_crystal: {
    name: 'Rift Crystal', rarity: 'Rare', color: '#7ff7ff', shape: 'hex',
    about: 'A crystal grown inside a portal. It hums when you hold it.',
  },
  chrono_cell: {
    name: 'Chrono Cell', rarity: 'Rare', color: '#ff8adf', shape: 'circle',
    about: 'Bends time a little. Use one in a mission briefing for +5 seconds.',
    usable: true,
  },
  vanguard_sigil: {
    name: 'Vanguard Sigil', rarity: 'Epic', color: FACTIONS.vanguard.color, shape: 'shield',
    about: 'Awarded for sealing the breach at Azure Bastion.',
  },
  riftborn_sigil: {
    name: 'Riftborn Sigil', rarity: 'Epic', color: FACTIONS.riftborn.color, shape: 'shield',
    about: 'Awarded for riding the storm at the Violet Maw.',
  },
  nexus_sigil: {
    name: 'Nexus Sigil', rarity: 'Epic', color: FACTIONS.nexus.color, shape: 'shield',
    about: 'Awarded for decoding the lattice at the Verdant Core.',
  },
  singularity_core: {
    name: 'Singularity Core', rarity: 'Legendary', color: '#ffffff', shape: 'ring',
    about: 'A tiny, stable piece of the place where all portals meet.',
  },
};

// XP a mission gives when you replay it after the first clear.
export const REPLAY_XP = 0.5;
// Extra XP for missions at your own faction's portal.
export const FACTION_BONUS = 0.25;
// Seconds a Chrono Cell adds.
export const CHRONO_SECONDS = 5;

const itemCount = (p) => Object.values(p.inventory).reduce((a, b) => a + b, 0);

export const ACHIEVEMENTS = [
  { id: 'first_jump', name: 'First Jump', about: 'Complete your first mission.', check: (p) => p.stats.wins >= 1 },
  { id: 'hopper', name: 'Portal Hopper', about: 'Visit every portal on the map.', check: (p) => p.visited.length >= PORTALS.length },
  { id: 'loyal', name: 'True Colours', about: "Win 3 missions at your faction's portal.", check: (p) => p.stats.factionWins >= 3 },
  { id: 'flawless', name: 'Flawless', about: 'Win a mission without touching an anomaly.', check: (p) => p.stats.perfect >= 1 },
  { id: 'hoarder', name: 'Hoarder', about: 'Hold 15 items at once.', check: (p) => itemCount(p) >= 15 },
  { id: 'pathfinder', name: 'Pathfinder', about: 'Reach level 3.', check: (p, level) => level >= 3 },
  { id: 'heart', name: 'Heart of the Rift', about: 'Clear the mission at The Singularity.', check: (p) => !!p.completed['singularity-1'] },
];

export const RANKS = ['Drifter', 'Scout', 'Pathfinder', 'Riftwalker', 'Gatekeeper', 'Worldshaper'];
