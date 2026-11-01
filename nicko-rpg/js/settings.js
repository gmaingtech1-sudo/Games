// Player settings, stored separately from save slots.

import { storage } from './saveSystem.js';
import { clamp, num } from './utils.js';

const KEY = 'nickoRpg.settings';

export const DEFAULT_SETTINGS = {
  musicVolume: 0.4,
  sfxVolume: 0.7,
  muted: false,
  animation: 'normal', // off | low | normal | high
  combatText: true,    // floating damage numbers
  reducedMotion: false,
  uiScale: 1,          // 0.85 - 1.3
  combatSpeed: 'normal', // slow | normal | fast
  autosave: true,
  devTools: false,
};

export function loadSettings() {
  const out = { ...DEFAULT_SETTINGS };
  try {
    const raw = JSON.parse(storage.get(KEY) || '{}');
    if (raw && typeof raw === 'object') {
      out.musicVolume = clamp(num(raw.musicVolume, out.musicVolume), 0, 1);
      out.sfxVolume = clamp(num(raw.sfxVolume, out.sfxVolume), 0, 1);
      out.muted = raw.muted === true;
      out.animation = ['off', 'low', 'normal', 'high'].includes(raw.animation) ? raw.animation : out.animation;
      out.combatText = raw.combatText !== false;
      out.reducedMotion = raw.reducedMotion === true;
      out.uiScale = clamp(num(raw.uiScale, 1), 0.85, 1.3);
      out.combatSpeed = ['slow', 'normal', 'fast'].includes(raw.combatSpeed) ? raw.combatSpeed : out.combatSpeed;
      out.autosave = raw.autosave !== false;
      out.devTools = raw.devTools === true;
    }
  } catch { /* corrupt settings: use defaults */ }
  return out;
}

export function saveSettings(s) {
  storage.set(KEY, JSON.stringify(s));
}

/** Milliseconds between combat events for the chosen speed. */
export function eventDelay(s) {
  return { slow: 520, normal: 340, fast: 160 }[s.combatSpeed] ?? 340;
}
