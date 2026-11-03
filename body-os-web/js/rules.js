// BODY.OS — balancing rules (fictional game mechanics). Pure functions, no state.
//  - Every attribute is 1..10 but capped (8) until upgrades raise the cap.
//  - Body and brain attributes each share an allocation budget: raising one
//    means lowering another until upgrades expand the budget.
//  - Body attributes above the balanced value 5 add "overclock" energy drain.
//  - Energy Consumption is a trade-off dial: more performance, more drain.
import { STATS } from './data.js';

export const MIN = 1, MAX = 10, BASE_CAP = 8, BALANCED = 5;
export const BASE_BODY_BUDGET = 26, BASE_BRAIN_BUDGET = 26;
export const COUNT = STATS.length;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const defaults = () => STATS.map(() => BALANCED);

export function poolTotal(values, pool) {
  let s = 0;
  for (let i = 0; i < COUNT; i++) if (STATS[i].pool === pool) s += values[i] | 0;
  return s;
}

/** Repairs any value array (corrupted save, preset) so it obeys length, range, caps and budgets.
 *  Over-budget pools lose points from their highest attributes first. Returns { values, changed }. */
export function sanitize(input, capOf, bodyBudget, brainBudget) {
  let changed = false;
  let v = Array.isArray(input) ? input.slice(0, COUNT) : null;
  if (!v) { v = defaults(); changed = true; }
  if (v.length !== COUNT || (Array.isArray(input) && input.length !== COUNT)) changed = true;
  while (v.length < COUNT) v.push(BALANCED);
  for (let i = 0; i < COUNT; i++) {
    let x = Number.isFinite(+v[i]) ? Math.round(+v[i]) : BALANCED;
    const c = clamp(x, MIN, clamp(capOf(i), MIN, MAX));
    if (c !== v[i]) changed = true;
    v[i] = c;
  }
  const fit = (pool, budget) => {
    let guard = 200;
    while (poolTotal(v, pool) > budget && guard-- > 0) {
      let best = -1;
      for (let i = 0; i < COUNT; i++) if (STATS[i].pool === pool && v[i] > MIN && (best < 0 || v[i] > v[best])) best = i;
      if (best < 0) break;
      v[best]--; changed = true;
    }
  };
  fit('body', bodyBudget);
  fit('brain', brainBudget);
  return { values: v, changed };
}

// ---------------------------------------------------------------- Derived values
export const throttlePerf = (t) => 0.90 + 0.02 * t;      // 0.92 .. 1.10
export const throttleCons = (t) => 0.5 + 0.1 * t;        // 0.6 .. 1.5
export const enduranceDrain = (e) => 1.30 - 0.06 * e;    // 1.24 .. 0.70
export const moveSpeed = (s, t) => (2.6 + 0.48 * s) * throttlePerf(t);
export const jumpHeight = (j, t) => (0.55 + 0.2 * j) * throttlePerf(t);
export const energyRegen = (r) => 0.4 + 0.12 * r;
export const healthRegen = (r) => 0.3 + 0.1 * r;
export const calibrationWindow = (r) => 0.08 + 0.025 * r;
export const calibrationSpeed = (r) => 1.6 - 0.08 * r;
export const interferenceChance = (c) => clamp(0.70 - 0.07 * c, 0, 1);
export const threatRadius = (t) => 6 + 2.5 * t;
export const threatDirection = (t) => t >= 7;
export const analysisMult = (a) => 1.4 - 0.08 * a;

export function overclockDrain(values) {
  let over = 0;
  for (let i = 0; i < COUNT; i++) if (STATS[i].pool === 'body' && values[i] > BALANCED) over += values[i] - BALANCED;
  return over * 0.06;
}

export const xpForLevel = (level) => 100 + 50 * (level - 1);
export const MAX_LEVEL = 30;
