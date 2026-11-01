// Shared UI application state and cross-screen helpers.

import { loadSettings } from '../settings.js';
import { saveGame } from '../saveSystem.js';
import { getItem, RARITIES } from '../items.js';
import { itemIconSvg } from '../art.js';
import { sfx } from '../audio.js';
import { toast, banner } from './dom.js';

export const app = {
  state: null,      // current game state (null on the menus)
  slot: null,       // save slot in use
  settings: loadSettings(),
  tab: 'town',
  dungeonId: null,
  renderers: {},    // tab name -> render function
  returnTo: null,   // where Settings/Save screens go back to
  exploreLog: [],
};

export function registerTab(name, fn) { app.renderers[name] = fn; }

let rerender = () => {};
export function setRerender(fn) { rerender = fn; }
/** Re-render the current in-game tab and HUD. */
export function refresh() { rerender(); }

export function autosave() {
  if (app.state && app.slot && app.settings.autosave) saveGame(app.state, app.slot);
}

export function manualSave() {
  if (!app.state || !app.slot) return { ok: false, reason: 'No game in progress.' };
  return saveGame(app.state, app.slot);
}

/** Announce level-ups, completed quests, unlocks and loot from any summary object. */
export function announce(summary) {
  if (!summary) return;
  for (const it of summary.items || []) {
    const def = getItem(it.id);
    if (!def) continue;
    const rare = RARITIES[def.rarity].order >= 2;
    toast(`${it.guaranteed ? 'Boss reward: ' : it.bonus ? 'Bonus loot: ' : 'Found '}${def.name}${it.qty > 1 ? ` x${it.qty}` : ''}`, { type: rare ? 'gold' : '', icon: itemIconSvg(def) });
    if (rare) sfx('rare');
  }
  if (summary.converted) toast(`Inventory full: extra loot sold for ${summary.converted} gold.`, { type: 'gold' });
  for (const lv of summary.levelUps || []) {
    banner(`Level ${lv.level}!`, `+${lv.gains.maxHp} health · +${lv.gains.atk} attack · +${lv.skillPoints} skill point${lv.skillPoints > 1 ? 's' : ''}`);
    sfx('levelup');
  }
  for (const q of summary.completed || []) toast(`Quest complete: ${q.name}. Claim your reward in the journal!`, { type: 'gold', timeout: 3600 });
  for (const id of summary.unlocked || []) toast(`New location unlocked!`, { type: 'good' });
}
