#!/usr/bin/env node
/* Rollmancer fuzzer: plays runs making random (but legal) choices for
   everything — holds, rerolls, trinkets, shop buys, stones, selling,
   reordering, boons, endless mode — on every dice set and Heat, and checks
   the run stays consistent and JSON-saveable. node tools/fuzz.js [runs] */
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
const N = +(process.argv[2] || 300);

let seedR = 12345;
const rnd = () => { seedR = (seedR * 1103515245 + 12345) % 2147483648; return seedR / 2147483648; };
const pick = (a) => a[Math.floor(rnd() * a.length)];

function check(run, where) {
  const s = JSON.stringify(run);
  const back = JSON.parse(s);
  if (back.gold !== run.gold) throw new Error('save mismatch ' + where);
  if (!isFinite(run.gold)) throw new Error('gold NaN ' + where);
  if (run.hearts > run.maxHearts) throw new Error('hearts over max ' + where);
  if (run.charms.length > run.charmSlots) throw new Error('too many charms ' + where);
  if (run.belt.length > run.beltSlots) throw new Error('belt overflow ' + where);
  run.dice.forEach((faces) => faces.forEach((f) => {
    if (!(f.v >= 1 && f.v <= 9)) throw new Error('bad face ' + f.v + ' ' + where);
  }));
  if (run.fight) {
    const f = run.fight;
    if (f.dice.length !== f.faces.length) throw new Error('dice/faces mismatch ' + where);
    f.dice.forEach((d) => { if (!(d.v >= 1 && d.v <= 9)) throw new Error('bad die ' + d.v + ' ' + where); });
  }
}

let wins = 0, maxDepth = 0, steps = 0, endless = 0;
const t0 = Date.now();
for (let n = 0; n < N; n++) {
  const set = pick(RM.DICE_SETS).id;
  const heat = Math.floor(rnd() * 9);
  // A rich run: give it gold so the shop paths all get exercised.
  const run = R.newRun({ seed: 777 + n * 31, set, heat });
  let guard = 0;
  while (guard++ < 3000) {
    steps++;
    check(run, run.phase);
    if (run.phase === 'fight') {
      const f = run.fight;
      // Every fourth run is in "god mode", to reach victory and endless.
      if (n % 4 === 0 && f.mon.hp > 1) f.mon.hp = 1;
      if (f.pending) { R.afterCast(run); continue; }
      const roll = rnd();
      if (run.belt.length && roll < 0.15) {
        const slot = Math.floor(rnd() * run.belt.length);
        const t = RM.TRINKET[run.belt[slot]];
        const a = Math.floor(rnd() * f.dice.length);
        let b = Math.floor(rnd() * f.dice.length);
        if (b === a) b = (a + 1) % f.dice.length;
        R.useTrinket(run, slot, t.target ? a : undefined, t.target === 2 ? b : undefined);
        continue;
      }
      if (roll < 0.5) { R.toggleHold(run, Math.floor(rnd() * f.dice.length)); continue; }
      if (roll < 0.75 && R.rerollCost(run).ok) { R.reroll(run); continue; }
      const prev = R.best(run, false);
      const r = R.cast(run);
      if (!r || !isFinite(r.dmg) || r.dmg < 0) throw new Error('bad cast ' + JSON.stringify(r && r.dmg));
      if (prev.combo !== r.combo) throw new Error('preview/cast combo mismatch ' + prev.combo + ' ' + r.combo);
      R.afterCast(run);
    } else if (run.phase === 'reward') {
      R.claimReward(run);
    } else if (run.phase === 'boon') {
      const id = pick(run.boon.choices);
      const res = R.chooseBoon(run, id);
      if (res === 'etch') R.chooseBoon(run, id, Math.floor(rnd() * run.dice.length), Math.floor(rnd() * 6));
    } else if (run.phase === 'shop') {
      run.gold += 6; // fuzz bonus so we can afford things
      for (let k = 0; k < 6; k++) {
        const s = run.shop;
        const all = s.charms.concat(s.goods);
        const it = pick(all);
        if (it.type === 'stone') {
          const di = Math.floor(rnd() * run.dice.length);
          R.applyStone(run, it, di, Math.floor(rnd() * 6), Math.floor(rnd() * 6));
        } else R.buy(run, it);
        if (rnd() < 0.15 && run.charms.length) R.sellCharm(run, Math.floor(rnd() * run.charms.length));
        if (rnd() < 0.2 && run.charms.length > 1) R.moveCharm(run, Math.floor(rnd() * run.charms.length), rnd() < 0.5 ? -1 : 1);
        if (rnd() < 0.1) R.rerollShop(run);
      }
      R.leaveShop(run);
    } else if (run.phase === 'victory') {
      wins++;
      endless++;
      R.goEndless(run);
    } else break; // over
    if (run.depth > 12) break;
  }
  maxDepth = Math.max(maxDepth, run.depth);
}
console.log('fuzzed', N, 'runs,', steps, 'steps in', ((Date.now() - t0) / 1000).toFixed(1) + 's; wins', wins, 'endless', endless, 'max depth', maxDepth, '— OK');
