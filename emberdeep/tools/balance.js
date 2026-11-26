#!/usr/bin/env node
/* Emberdeep — balance check. Plays the game in Node with a simple player
   and prints how deep each run gets and how long it takes, so you can see
   what a change to econ.js or data.js does to the pacing.

     node tools/balance.js                 an active player (taps, buys, rekindles)
     node tools/balance.js --afk           checks in every few hours, otherwise away
     node tools/balance.js --runs 30       more runs
*/
'use strict';

const path = require('path');
const ROOT = path.join(__dirname, '..', 'js');
for (const f of ['core', 'data', 'econ', 'state', 'sim']) require(path.join(ROOT, f + '.js'));
const ED = globalThis.ED;
const { econ: E, state: ST, sim, data: D, util: U } = ED;

const args = process.argv.slice(2);
const flag = (k) => args.includes(k);
const opt = (k, d) => {
  const i = args.indexOf(k);
  return i >= 0 ? Number(args[i + 1]) : d;
};
const AFK = flag('--afk');
const RUNS = opt('--runs', 16);
const TAPS = AFK ? 0 : opt('--taps', 4);
const CHECKIN = opt('--checkin', 4) * 3600; // AFK player: seconds between visits
const STALL = opt('--stall', 300);         // rekindle after this long without a new floor
const MAXRUN = opt('--maxrun', 3 * 3600);

let seed = 12345;
const rng = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

// An attentive player: always buys the best-value thing they can afford,
// counting the torch for the taps they make.
function buyer(S, rate) {
  for (let i = 0; i < 300; i++) {
    const st = ST.stats(S);
    const best = E.bestBuy(S, st, Infinity, TAPS);
    if (!best) return;
    let pick = best;
    if (best.cost > S.gold) {
      if (rate > 0 && (best.cost - S.gold) / rate < 15) return;
      pick = E.bestBuy(S, st, S.gold, TAPS);
      if (!pick) return;
    }
    const ok = pick.kind === 'torch' ? ST.buyTorch(S, pick.n) : ST.buyHero(S, pick.id, pick.n);
    if (!ok) return;
  }
}

// Spend embers: the Quartermaster first, then whatever's cheapest of the
// talents a sensible player would want.
const WANT = ['quarter', 'blades', 'greed', 'slayer', 'patience', 'lift', 'vigil', 'dream', 'harvest', 'focus', 'ruin', 'short', 'swift', 'leap', 'sense'];
function spendEmbers(S) {
  for (let i = 0; i < 10000; i++) {
    let best = null;
    for (const id of WANT) {
      const t = D.talent(id);
      const lv = S.talents[id] || 0;
      if (lv >= t.max) continue;
      const c = E.talentCost(t, lv);
      if (c > S.embers) continue;
      if (id === 'quarter') { best = { id, c: -1 }; break; }
      if (!best || c < best.c) best = { id, c };
    }
    if (!best || !ST.buyTalent(S, best.id)) return;
  }
}

const S = ST.defaults(0);
S.settings.autoBoss = true;
let clock = 0;
const hhmm = (s) => U.duration(s);

console.log(`${AFK ? 'AFK' : 'Active'} player, ${TAPS} taps/s${AFK ? `, visits every ${CHECKIN / 3600}h` : ''}`);
console.log('run  length     total      deepest  embers  (total)  relics  heroes  levels');
for (let run = 1; run <= RUNS; run++) {
  let runT = 0;
  let lastBest = S.bestFloorRun;
  let lastNew = 0;
  const step = AFK ? 600 : 10;
  if (AFK && run === 1) {
    // Everyone plays a little at the start: ten minutes of tapping and buying.
    for (let i = 0; i < 60; i++) sim.run(S, 10, { taps: 4, rng, now: clock * 1000, buyer });
    runT += 600;
    clock += 600;
  }
  for (;;) {
    sim.run(S, step, {
      afk: AFK, taps: TAPS, rng, now: clock * 1000,
      buyer: AFK && !ST.stats(S).autoBuy ? null : buyer,
    });
    runT += step;
    clock += step;
    if (AFK && runT % CHECKIN < step) buyer(S, 0);
    if (S.bestFloorRun > lastBest) { lastBest = S.bestFloorRun; lastNew = runT; }
    const gain = ST.rekindleGain(S);
    if (gain > 0 && (runT - lastNew > (AFK ? CHECKIN : STALL) || runT > MAXRUN)) break;
    if (runT > 48 * 3600) break;
  }
  const gain = ST.rekindleGain(S);
  const relics = Object.values(S.relics).reduce((a, b) => a + b, 0);
  console.log(
    String(run).padStart(3),
    hhmm(runT).padStart(9),
    hhmm(clock).padStart(9),
    String(S.bestFloorRun).padStart(9),
    String(gain).padStart(7),
    `(${S.embersTotal + gain})`.padStart(8),
    String(relics).padStart(7),
    String(ST.hiredCount(S)).padStart(7),
    String(ST.totalLevels(S)).padStart(7),
    ` dps ${U.fmt(ST.stats(S).party)} hp ${U.fmt(E.mobHP(S.bestFloorRun))}`,
  );
  ST.rekindle(S, clock * 1000);
  spendEmbers(S);
}
