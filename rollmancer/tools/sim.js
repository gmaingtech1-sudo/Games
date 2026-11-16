#!/usr/bin/env node
/* Rollmancer balance simulator: a simple bot plays many runs with the real
   rules and reports how deep it gets. The bot is deliberately ordinary (it
   holds the obvious dice and buys what it can afford), so a thoughtful
   player should do clearly better.

   node tools/sim.js [runs=300] [set=apprentice] [heat=0] */
'use strict';
const path = require('path');
const fs = require('fs');
const vm = require('vm');

globalThis.RM = {};
for (const f of ['core.js', 'data.js', 'rules.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), { filename: f });
}
const RM = globalThis.RM;
const R = RM.rules;

const RUNS = +(process.argv[2] || 300);
const SET = process.argv[3] || 'apprentice';
const HEAT = +(process.argv[4] || 0);

// Which dice to keep: the dice of the strongest "building" pattern showing.
function chooseHolds(run) {
  const f = run.fight;
  const b = R.best(run, false);
  const counts = {};
  f.dice.forEach((d) => { counts[d.v] = (counts[d.v] || 0) + 1; });
  const vals = Object.keys(counts).map(Number);
  // Longest run of distinct values.
  const set = new Set(vals);
  let bestRun = [];
  for (const v of vals) {
    const r = [v];
    while (set.has(r[r.length - 1] + 1)) r.push(r[r.length - 1] + 1);
    if (r.length > bestRun.length) bestRun = r;
  }
  const top = Math.max(...Object.values(counts));
  const hold = new Array(f.dice.length).fill(false);
  if (bestRun.length >= 4 && top < 3) {
    bestRun.forEach((v) => { hold[f.dice.findIndex((d, i) => d.v === v && !hold[i])] = true; });
  } else if (top >= 2) {
    // Keep every die in the largest group(s) (two pair → keep both pairs).
    const groups = Object.entries(counts).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1] || b[0] - a[0]);
    const keep = groups.slice(0, top >= 3 ? 1 : 2).map(([v]) => +v);
    if (top >= 3 && groups.length > 1) keep.push(+groups[1][0]); // full house
    f.dice.forEach((d, i) => { if (keep.includes(d.v)) hold[i] = true; });
  } else if (bestRun.length >= 3) {
    bestRun.forEach((v) => { hold[f.dice.findIndex((d, i) => d.v === v && !hold[i])] = true; });
  } else {
    // nothing: keep the highest die
    let hi = 0;
    f.dice.forEach((d, i) => { if (d.v > f.dice[hi].v) hi = i; });
    hold[hi] = true;
  }
  return { hold, best: b };
}

function playFight(run) {
  let guard = 0;
  while (run.phase === 'fight' && guard++ < 200) {
    const f = run.fight;
    const b = R.best(run, false);
    // Kill now if we can.
    if (b.dmg >= f.mon.hp || f.rerolls <= 0 || b.combo === 'five' || b.combo === 'six') {
      // use trinkets that just add resources
      R.cast(run);
      R.afterCast(run);
      continue;
    }
    // Budget rerolls across the remaining casts.
    const perTurn = Math.ceil(f.rerolls / Math.max(1, f.casts));
    let used = 0;
    while (used < perTurn && R.rerollCost(run).ok) {
      const { hold } = chooseHolds(run);
      f.dice.forEach((d, i) => { d.held = hold[i]; });
      if (!R.reroll(run)) break;
      used++;
      const nb = R.best(run, false);
      if (nb.dmg >= f.mon.hp) break;
    }
    f.dice.forEach((d) => { d.held = false; });
    R.cast(run);
    R.afterCast(run);
  }
}

function shop(run) {
  const s = run.shop;
  // Charms first (rarest first), then tomes for our favourite combo, then stones.
  const fav = Object.entries(run.stats.casts).sort((a, b) => b[1] - a[1]).map((e) => e[0]);
  const items = s.charms.slice().sort((a, b) => RM.CHARM[b.id].r - RM.CHARM[a.id].r);
  for (const it of items) {
    if (R.canBuy(run, it).ok) R.buy(run, it);
  }
  for (const g of s.goods) {
    if (!R.canBuy(run, g).ok) continue;
    if (g.type === 'tome' && fav.slice(0, 3).includes(g.combo)) R.buy(run, g);
    else if (g.type === 'potion') R.buy(run, g);
    else if (g.type === 'stone' && ['st-flame', 'st-storm', 'st-prism', 'st-echo'].includes(g.id)) {
      // put it on a blank high face
      let done = false;
      for (let di = 0; di < run.dice.length && !done; di++) {
        for (let fi = 5; fi >= 0 && !done; fi--) {
          if (!run.dice[di][fi].g) done = R.applyStone(run, g, di, fi);
        }
      }
    }
  }
  R.leaveShop(run);
}

function boon(run) {
  const pref = ['cast', 'reroll', 'slot', 'relic', 'study', 'die', 'cash', 'heal', 'belt', 'wild'];
  const ch = run.boon.choices.slice().sort((a, b) => pref.indexOf(a) - pref.indexOf(b));
  let r = R.chooseBoon(run, ch[0]);
  if (r === 'etch') R.chooseBoon(run, ch[0], 0, 5);
}

function playRun(seed) {
  const run = R.newRun({ seed, set: SET, heat: HEAT });
  let guard = 0;
  while (guard++ < 400) {
    if (run.phase === 'fight') playFight(run);
    else if (run.phase === 'reward') R.claimReward(run);
    else if (run.phase === 'shop') shop(run);
    else if (run.phase === 'boon') boon(run);
    else break;
  }
  return run;
}

const depthHist = {};
let wins = 0;
const lostAt = {};
let bestCast = 0;
const combos = {};
const t0 = Date.now();
for (let i = 0; i < RUNS; i++) {
  const run = playRun(1000 + i * 7919);
  const d = run.won ? 'WIN' : run.depth;
  depthHist[d] = (depthHist[d] || 0) + 1;
  if (run.won) wins++;
  bestCast = Math.max(bestCast, run.stats.bestCast);
  for (const [k, v] of Object.entries(run.stats.casts)) combos[k] = (combos[k] || 0) + v;
  // which fights cost hearts
  let idx = 0;
  run.history.forEach((h) => {
    if (h === 'L') { const k = 'd' + (Math.floor(idx / 3) + 1) + ['m', 'b', 'B'][idx % 3]; lostAt[k] = (lostAt[k] || 0) + 1; }
    idx++;
  });
}
console.log('set', SET, 'heat', HEAT, 'runs', RUNS, 'in', ((Date.now() - t0) / 1000).toFixed(1) + 's');
console.log('ended at depth:', depthHist);
console.log('win rate:', (100 * wins / RUNS).toFixed(1) + '%');
console.log('hearts lost at:', Object.entries(lostAt).sort().map(([k, v]) => k + ':' + v).join(' '));
console.log('best cast:', RM.fmt(bestCast));
const tot = Object.values(combos).reduce((a, b) => a + b, 0);
console.log('combo mix:', Object.entries(combos).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + (100 * v / tot).toFixed(1) + '%').join(', '));
