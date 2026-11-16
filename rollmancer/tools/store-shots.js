#!/usr/bin/env node
/* Makes the store listing images from the real game:
     store/raw/*.png       1080×1920 gameplay screenshots
     store/screens/*.png   the same, framed with a caption (Play Store / itch.io)
     store/feature.png     1024×500 feature graphic (Play Store)
     store/icon-512.png    512×512 icon
   Serve the game first:  (cd rollmancer && python3 -m http.server 8123)
   then:                  node rollmancer/tools/store-shots.js */
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'store');
const URL = process.env.URL || 'http://localhost:8123/index.html';
fs.mkdirSync(path.join(OUT, 'raw'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'screens'), { recursive: true });

// Puts a run into a showcase state: a boss, five charms, glyph-covered dice.
const SETUP = () => {
  const s = RM.profile.get().settings;
  s.tips = false;
  s.speed = 1;
  RM.profile.get().tutorial = 99;
  document.getElementById('toasts').style.display = 'none';
  const R = RM.rules;
  const run = R.newRun({ seed: 4242, set: 'apprentice', heat: 0 });
  run.depth = 6;
  run.stage = 2;
  run.gold = 23;
  run.hearts = 2;
  run.history = 'WWWWWWWWWWWWWLW'.split('');
  run.charms = ['blade', 'grind', 'lens', 'metro', 'speech'].map((id) => R.makeCharm(id));
  run.charms[1].s.m = 9;
  run.charms[3].s.x = 1.9;
  run.levels.fullhouse = 4;
  run.levels.three = 3;
  const g = [['prism', 'flame'], ['storm', 'gold'], ['prism', 'echo'], ['flame', 'lucky'], ['wild', 'storm']];
  run.dice.forEach((faces, i) => { faces[4].g = g[i][0]; faces[1].g = g[i][1]; });
  run.belt = ['scroll', 'nudge'];
  const b = RM.BOSS.hydra;
  run.plan[2] = { key: 'hydra', name: b.name, art: b.art, pal: b.pal, boss: true, curse: 'hydra', size: 1.15, hp: 21000 };
  R.startFight(run);
  run.fight.mon.hp = 13650;
  // a Full House: 5 5 5 2 2 with glyphs showing
  const want = [[4, 5], [4, 5], [4, 5], [1, 2], [1, 2]];
  run.fight.dice.forEach((d, i) => {
    const fi = want[i][0];
    d.f = fi;
    d.v = run.dice[i][fi].v;
    d.g = run.dice[i][fi].g;
    d.held = i < 3;
  });
  run.fight.dice[4].v = 2; // the wild face counts as a 2 here
  RM.profile.get().run = run;
  return run;
};

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, hasTouch: true });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  const shot = (name) => p.screenshot({ path: path.join(OUT, 'raw', name + '.png') });

  await p.goto(URL);
  await p.evaluate(() => { localStorage.clear(); });
  await p.reload();
  await p.waitForTimeout(700);
  await p.evaluate(() => { const pr = RM.profile.get(); pr.runs = 0; RM.ui.renderTitle(); });
  await p.waitForTimeout(500);
  await shot('1-title');

  // the boss fight
  await p.evaluate(SETUP);
  await p.evaluate(() => RM.game.continueRun());
  await p.waitForTimeout(1600);
  await p.evaluate(() => {
    const run = RM.game.run;
    const want = [[4, 5], [4, 5], [4, 5], [1, 2], [1, 2]];
    run.fight.dice.forEach((d, i) => {
      const fi = want[i][0];
      d.f = fi; d.v = run.dice[i][fi].v; d.g = run.dice[i][fi].g; d.held = i < 3;
    });
    run.fight.dice[4].v = 2;
    RM.battle.syncDice(run, false);
    RM.ui.renderBattle();
    RM.ui.preview();
  });
  await p.waitForTimeout(600);
  await shot('2-boss');

  // mid-cast
  await p.click('#btn-cast');
  await p.waitForTimeout(2300);
  await shot('3-cast');
  await p.waitForTimeout(1700);
  await shot('4-hit');
  await p.waitForTimeout(2500);

  // the bazaar
  await p.evaluate(() => {
    const run = RM.game.run;
    RM.ui.closeSheet(true);
    run.fight = null;
    run.result = null;
    run.gold = 31;
    run.depth = 4;
    run.stage = 1;
    RM.rules.enterShop(run);
    run.shop.charms = [{ type: 'charm', id: 'bell', cost: 7 }, { type: 'charm', id: 'eye', cost: 8 }, { type: 'charm', id: 'snowball', cost: 6 }];
    run.shop.goods = [{ type: 'stone', id: 'st-prism', cost: 5 }, { type: 'tome', id: 'tome-fullhouse', combo: 'fullhouse', cost: 4 }, { type: 'trinket', id: 'copy', cost: 4 }];
    RM.game.continueRun();
  });
  await p.waitForTimeout(900);
  await shot('5-shop');

  // etching a glyph
  await p.evaluate(() => {
    const run = RM.game.run;
    RM.ui.showEtch({ kind: 'shop', item: run.shop.goods[0] });
  });
  await p.waitForTimeout(700);
  await shot('6-etch');

  // a boon
  await p.evaluate(() => {
    const run = RM.game.run;
    RM.ui.closeSheet(true);
    run.phase = 'boon';
    run.boon = { choices: ['cast', 'relic', 'study'], relic: 'metro' };
    RM.game.continueRun();
  });
  await p.waitForTimeout(1600);
  await shot('7-boon');

  // the win screen
  await p.evaluate(() => {
    const run = RM.game.run;
    RM.ui.closeSheet(true);
    run.history = 'WWWWWWWWWWWWWLWWWWWWWWWW'.split('');
    run.won = true;
    run.winAt = 24;
    run.depth = 8;
    run.phase = 'over';
    Object.assign(run.stats, { fightsWon: 23, bestCast: 1284310, bestCombo: 'five', totalDmg: 4920115, casts: { fullhouse: 19, three: 14, pair: 9 } });
    RM.ui.showOver({ run });
  });
  await p.waitForTimeout(900);
  await shot('8-win');

  // framed versions with captions
  const CAPS = {
    '1-title': ['Roll your dice.', 'Cast your spells.'],
    '2-boss': ['Hold. Reroll. Cast.', 'Every combo is a spell'],
    '3-cast': ['Chain huge combos', 'Pips × Mult = damage'],
    '4-hit': ['Smash 12 bosses', 'each with a nasty twist'],
    '5-shop': ['48 rule-bending charms', 'Build a new engine every run'],
    '6-etch': ['Etch glyphs onto your dice', 'Flame, Storm, Prism, Wild…'],
    '7-boon': ['Choose your boons', 'Every run plays differently'],
    '8-win': ['Beat the Pipwyrm', 'then turn up the Heat'],
  };
  const fp = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  // Load a page from the game's server first so the fonts resolve.
  await fp.goto(URL.replace('index.html', 'tools/feature.html'));
  const fontUrl = '../fonts/lilita-one.woff2';
  const nunUrl = '../fonts/nunito-900.woff2';
  for (const [name, [a, c]] of Object.entries(CAPS)) {
    const img = 'data:image/png;base64,' + fs.readFileSync(path.join(OUT, 'raw', name + '.png')).toString('base64');
    await fp.setContent(`<html><head><style>
      @font-face { font-family: L; src: url('${fontUrl}'); }
      @font-face { font-family: N; src: url('${nunUrl}'); font-weight: 900; }
      body { margin: 0; width: 1080px; height: 1920px; overflow: hidden; background: radial-gradient(120% 70% at 50% 0%, #4a2a8a, #160d2a 60%, #0b0616); font-family: L; color: #fff; text-align: center; }
      h1 { margin: 80px 0 0; font-size: 92px; font-weight: 400; line-height: 1; text-shadow: 0 6px 0 #3b1f86, 0 12px 30px rgba(140, 80, 255, 0.5); }
      h2 { margin: 22px 0 0; font-family: N; font-weight: 900; font-size: 46px; color: #ffcc3d; }
      .ph { position: absolute; left: 50%; top: 330px; transform: translateX(-50%); width: 800px; height: 1422px; border-radius: 56px; overflow: hidden; box-shadow: 0 0 0 14px #0b0616, 0 0 0 18px rgba(255,255,255,0.12), 0 40px 90px rgba(0,0,0,0.6); }
      .ph img { width: 100%; height: 100%; display: block; }
    </style></head><body><h1>${a}</h1><h2>${c}</h2><div class="ph"><img src="${img}"></div></body></html>`);
    await fp.evaluate(() => document.fonts.ready);
    await fp.waitForTimeout(300);
    await fp.screenshot({ path: path.join(OUT, 'screens', name + '.png') });
  }

  // the feature graphic: logo, dice and a line-up of monsters
  const gp = await b.newPage({ viewport: { width: 1024, height: 500 } });
  await gp.goto(URL.replace('index.html', 'tools/feature.html'));
  await gp.waitForTimeout(900);
  await gp.screenshot({ path: path.join(OUT, 'feature.png') });
  fs.copyFileSync(path.join(ROOT, 'icons', 'icon-512.png'), path.join(OUT, 'icon-512.png'));

  console.log(errs.join('\n') || 'store images done');
  await b.close();
})();
