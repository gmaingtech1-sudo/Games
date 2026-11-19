#!/usr/bin/env node
/* Hyperdot — level checker. Loads the game's own rules and solver, then for
   every campaign level proves it can be won and works out its par (the fewest
   moves). Run it after changing a map:

     node tools/check-levels.js

   It exits with an error if a level can't be won or its `par` in
   js/levels.js is wrong, and prints the par it should have. It also tries a
   batch of Endless puzzles in every dimension to check the generator. */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

global.window = global;
const js = path.join(__dirname, '..', 'js');
for (const f of ['core', 'grid', 'rules', 'solver', 'gen', 'levels']) {
  vm.runInThisContext(fs.readFileSync(path.join(js, f + '.js'), 'utf8'), { filename: f + '.js' });
}
const HD = global.HD;

let bad = 0;
console.log('Level              Size            Par   Moves  States   ms');
for (const w of HD.levels.WORLDS) {
  for (const lv of w.levels) {
    let L;
    try {
      L = HD.grid.compile(lv);
    } catch (e) {
      console.log(`${lv.id.padEnd(5)} ${lv.name.padEnd(13)} MAP ERROR: ${e.message}`);
      bad++;
      continue;
    }
    if (L.n !== w.n) {
      console.log(`${lv.id.padEnd(5)} ${lv.name.padEnd(13)} is ${L.n}D but sits in the ${w.n}D world`);
      bad++;
    }
    const t0 = Date.now();
    const sol = HD.solver.solve(L, HD.rules.initial(L));
    const ms = Date.now() - t0;
    let note = '';
    if (sol.moves < 0) {
      note = sol.capped ? '  TOO BIG TO SOLVE' : '  CAN NOT BE WON';
      bad++;
    } else if (sol.moves !== lv.par) {
      note = `  par should be ${sol.moves}`;
      bad++;
    }
    console.log(`${lv.id.padEnd(5)} ${lv.name.padEnd(13)} ${L.dims.join('×').padEnd(15)} ${String(lv.par).padStart(3)}  ${String(sol.moves).padStart(5)}  ${String(sol.explored).padStart(6)}  ${String(ms).padStart(3)}${note}`);
  }
}

console.log('\nEndless generator, 20 seeds per dimension:');
for (let n = 1; n <= 5; n++) {
  let ok = 0;
  let pars = 0;
  const t0 = Date.now();
  for (let seed = 1; seed <= 20; seed++) {
    const g = HD.gen.generate(n, seed * 2654435761);
    if (!g) continue;
    const L = HD.grid.compile(g.def);
    const sol = HD.solver.solve(L, HD.rules.initial(L));
    if (sol.moves === g.par) ok++;
    pars += g.par;
  }
  console.log(`  ${n}D: ${ok}/20 made, average par ${ok ? Math.round(pars / ok) : '-'}, ${Math.round((Date.now() - t0) / 20)} ms each`);
  if (ok < 18) bad++;
}

if (bad) {
  console.log(`\n${bad} problem${bad > 1 ? 's' : ''} found.`);
  process.exit(1);
}
console.log('\nAll levels can be won and every par is right.');
