/* Rollmancer — the catalogue: combos, glyphs, charms, shop items,
   trinkets, boons, monsters, curses, dice sets, Heat levels and feats.
   Text uses a tiny markup the UI turns into coloured chips:
   {p:+25 Pips} blue, {m:+4 Mult} red, {x:×2 Mult} deep red, {g:$2} gold,
   {k:keyword} highlighted. */
(function (RM) {
  'use strict';

  /* ---------------- combos ----------------
     pips/mult at level 1, plus what each extra level adds. `min` is the
     dice needed. Ordered weakest to strongest. */
  const COMBOS = [
    { id: 'high', name: 'High Die', short: 'High', pips: 5, mult: 1, lp: 10, lm: 1, min: 1, desc: 'Just your highest die.' },
    { id: 'pair', name: 'Pair', short: 'Pair', pips: 10, mult: 2, lp: 15, lm: 1, min: 2, desc: 'Two matching dice.' },
    { id: 'twopair', name: 'Two Pair', short: '2 Pair', pips: 20, mult: 2, lp: 20, lm: 1, min: 4, desc: 'Two different pairs.' },
    { id: 'three', name: 'Three of a Kind', short: 'Triple', pips: 30, mult: 3, lp: 20, lm: 2, min: 3, desc: 'Three matching dice.' },
    { id: 'smstraight', name: 'Small Straight', short: 'Sm Straight', pips: 30, mult: 3, lp: 25, lm: 2, min: 4, desc: 'Four numbers in a row, like 2-3-4-5.' },
    { id: 'fullhouse', name: 'Full House', short: 'Full House', pips: 40, mult: 4, lp: 25, lm: 2, min: 5, desc: 'Three of one number and two of another.' },
    { id: 'lgstraight', name: 'Large Straight', short: 'Lg Straight', pips: 45, mult: 4, lp: 30, lm: 3, min: 5, desc: 'Five numbers in a row, like 1-2-3-4-5.' },
    { id: 'four', name: 'Four of a Kind', short: 'Quad', pips: 60, mult: 7, lp: 30, lm: 3, min: 4, desc: 'Four matching dice.' },
    { id: 'threepair', name: 'Three Pairs', short: '3 Pairs', pips: 50, mult: 5, lp: 25, lm: 2, min: 6, desc: 'Three different pairs. Needs six dice.' },
    { id: 'grand', name: 'Grand Straight', short: 'Grand', pips: 80, mult: 8, lp: 35, lm: 3, min: 6, desc: 'Six numbers in a row. Needs six dice.' },
    { id: 'twotriple', name: 'Twin Triples', short: '2 Triples', pips: 80, mult: 9, lp: 35, lm: 3, min: 6, desc: 'Two different triples. Needs six dice.' },
    { id: 'five', name: 'Five of a Kind', short: 'Quint', pips: 120, mult: 12, lp: 40, lm: 4, min: 5, desc: 'Five matching dice. The big one.' },
    { id: 'six', name: 'Six of a Kind', short: 'Sextet', pips: 200, mult: 20, lp: 50, lm: 5, min: 6, desc: 'Six matching dice. Needs six dice.' },
  ];
  const COMBO = {};
  COMBOS.forEach((c, i) => { c.rank = i; COMBO[c.id] = c; });
  const PAIRISH = ['pair', 'twopair', 'threepair'];
  const STRAIGHTS = ['smstraight', 'lgstraight', 'grand'];

  /* ---------------- glyphs: enchantments on a die face ---------------- */
  const GLYPHS = {
    flame: { name: 'Flame', color: '#ff7a2f', dark: '#9a2d0c', text: '{p:+15 Pips} when scored' },
    storm: { name: 'Storm', color: '#4fb6ff', dark: '#14508f', text: '{m:+4 Mult} when scored' },
    prism: { name: 'Prism', color: '#c47bff', dark: '#5b2591', text: '{x:×1.5 Mult} when scored' },
    gold: { name: 'Gold', color: '#ffcc3d', dark: '#8f6205', text: '{g:+$2} when scored' },
    lucky: { name: 'Lucky', color: '#5fe08a', dark: '#16733a', text: '1 in 3: {m:+10 Mult}. 1 in 8: {g:+$8}' },
    wild: { name: 'Wild', color: '#ff6fb5', dark: '#8f1c58', text: 'Counts as {k:any number} you need' },
    echo: { name: 'Echo', color: '#7ef0e6', dark: '#13756d', text: 'This die {k:scores twice}' },
    loaded: { name: 'Loaded', color: '#b9b2a6', dark: '#4a443c', text: 'Lands face up {k:twice as often}' },
  };
  const GLYPH_IDS = Object.keys(GLYPHS);

  /* ---------------- charms ----------------
     r: rarity (1 common, 2 uncommon, 3 rare). Hooks (all optional):
       die(ctx, d, c)        a scoring die triggers (d.v value, d.g glyph)
       unscored(ctx, d, c)   once per die that isn't part of the combo
       after(ctx, c)         after every die has scored
       retrig(ctx, d, k, c)  extra triggers for the k-th scoring die
       cast(run, ctx, c)     the cast has resolved (scaling charms grow here)
       win(run, c, info)     the fight was won; may return a note string
       mods                  {casts, rerolls, dice, wild1, loop}
       cur(c, run)           the "(Currently …)" line for scaling charms
  */
  const CHARMS = [
    { id: 'blade', name: 'Whetted Blade', icon: '🗡️', r: 1, cost: 4, text: '{m:+4 Mult}',
      after(ctx) { ctx.mult(4); } },
    { id: 'candle', name: 'Candle', icon: '🕯️', r: 1, cost: 4, text: '{p:+30 Pips}',
      after(ctx) { ctx.pips(30); } },
    { id: 'sock', name: 'Odd Sock', icon: '🧦', r: 1, cost: 5, text: 'Scoring {k:odd} dice give {m:+3 Mult}',
      die(ctx, d) { if (d.v % 2 === 1) ctx.mult(3); } },
    { id: 'anchor', name: 'Even Keel', icon: '⚓', r: 1, cost: 5, text: 'Scoring {k:even} dice give {p:+12 Pips}',
      die(ctx, d) { if (d.v % 2 === 0) ctx.pips(12); } },
    { id: 'snake', name: 'Snake Eyes', icon: '🐍', r: 1, cost: 5, text: 'Scoring {k:1s} give {m:+8 Mult}',
      die(ctx, d) { if (d.v === 1) ctx.mult(8); } },
    { id: 'boxcar', name: 'Boxcars', icon: '🚃', r: 1, cost: 5, text: 'Scoring {k:6s} give {p:+20 Pips}',
      die(ctx, d) { if (d.v === 6) ctx.pips(20); } },
    { id: 'cherry', name: 'Twin Cherries', icon: '🍒', r: 1, cost: 5, text: '{m:+8 Mult} on a Pair, Two Pair or Three Pairs',
      after(ctx) { if (PAIRISH.includes(ctx.combo)) ctx.mult(8); } },
    { id: 'trident', name: 'Trident', icon: '🔱', r: 1, cost: 5, text: '{m:+12 Mult} when {k:3 or more} scoring dice match',
      after(ctx) { if (ctx.maxMatch >= 3) ctx.mult(12); } },
    { id: 'coaster', name: 'Rollercoaster', icon: '🎢', r: 1, cost: 5, text: '{p:+70 Pips} on any {k:Straight}',
      after(ctx) { if (STRAIGHTS.includes(ctx.combo)) ctx.pips(70); } },
    { id: 'flower', name: 'Wallflower', icon: '🌼', r: 1, cost: 5, text: 'Each {k:unscored} die gives {m:+3 Mult}',
      unscored(ctx) { ctx.mult(3); } },
    { id: 'frog', name: 'Leap of Faith', icon: '🐸', r: 1, cost: 4, text: '{m:+10 Mult} if you {k:didn\'t reroll} this turn',
      after(ctx) { if (!ctx.rerolledTurn) ctx.mult(10); } },
    { id: 'owl', name: 'Patient Owl', icon: '🦉', r: 1, cost: 5, text: '{m:+3 Mult} for each {k:Reroll} you have left',
      after(ctx) { if (ctx.rerollsLeft > 0) ctx.mult(3 * ctx.rerollsLeft); } },
    { id: 'piggy', name: 'Piggy Bank', icon: '🐷', r: 1, cost: 4, text: '{g:+$3} when you win a fight',
      win(run) { run.gold += 3; return '+$3'; } },
    { id: 'purse', name: 'Thrifty Purse', icon: '👛', r: 1, cost: 4, text: '{g:+$1} for each {k:Reroll} left when you win',
      win(run, c, info) { if (info.rerolls > 0) { run.gold += info.rerolls; return '+$' + info.rerolls; } return null; } },
    { id: 'tophat', name: 'High Roller', icon: '🎩', r: 1, cost: 5, text: 'Scoring {k:5s and 6s} give {m:+3 Mult}',
      die(ctx, d) { if (d.v >= 5) ctx.mult(3); } },
    { id: 'turtle', name: 'Low Roller', icon: '🐢', r: 1, cost: 5, text: '{x:×2.5 Mult} if every scoring die is {k:3 or lower}',
      after(ctx) { if (ctx.scoring.every((d) => d.v <= 3)) ctx.xmult(2.5); } },
    { id: 'ember', name: 'Ember Brand', icon: '🔥', r: 1, cost: 4, text: '{k:Flame} glyphs give {p:+20} more Pips',
      die(ctx, d) { if (d.g === 'flame') ctx.pips(20); } },
    { id: 'bolt', name: 'Storm Jar', icon: '⚡', r: 1, cost: 4, text: '{k:Storm} glyphs give {m:+4} more Mult',
      die(ctx, d) { if (d.g === 'storm') ctx.mult(4); } },
    { id: 'grin', name: 'Golden Grin', icon: '😁', r: 1, cost: 4, text: '{k:Gold} glyphs give {g:+$1} more and {m:+4 Mult}',
      die(ctx, d) { if (d.g === 'gold') { ctx.gold(1); ctx.mult(4); } } },
    { id: 'clover', name: 'Four-Leaf Clover', icon: '🍀', r: 1, cost: 5, text: '{k:Lucky} glyphs trigger {k:twice as often}' },

    { id: 'grind', name: 'Grindstone', icon: '⚙️', r: 2, cost: 6, text: 'Gains {m:+1 Mult} whenever you cast {k:3 or more} matching dice',
      state: { m: 0 }, cur: (c) => '{m:+' + c.s.m + ' Mult}',
      after(ctx, c) { if (c.s.m > 0) ctx.mult(c.s.m); },
      cast(run, ctx, c) { if (ctx.maxMatch >= 3) { c.s.m += 1; return 'grow'; } return null; } },
    { id: 'snowball', name: 'Snowball', icon: '⛄', r: 2, cost: 6, text: 'Gains {p:+5 Pips} every cast',
      state: { p: 0 }, cur: (c) => '{p:+' + c.s.p + ' Pips}',
      after(ctx, c) { if (c.s.p > 0) ctx.pips(c.s.p); },
      cast(run, ctx, c) { c.s.p += 5; return 'grow'; } },
    { id: 'hoard', name: 'Dragon\'s Hoard', icon: '💰', r: 2, cost: 6, text: '{m:+1 Mult} for every {g:$5} you have',
      cur: (c, run) => '{m:+' + Math.floor(Math.max(0, run.gold) / 5) + ' Mult}',
      after(ctx) { const n = Math.floor(Math.max(0, ctx.run.gold) / 5); if (n > 0) ctx.mult(n); } },
    { id: 'trumpet', name: 'Opening Act', icon: '🎺', r: 2, cost: 6, text: '{x:×2 Mult} on your {k:first} cast of a fight',
      after(ctx) { if (ctx.first) ctx.xmult(2); } },
    { id: 'speech', name: 'Last Word', icon: '💬', r: 2, cost: 6, text: '{x:×3 Mult} on your {k:final} cast of a fight',
      after(ctx) { if (ctx.last) ctx.xmult(3); } },
    { id: 'rabbit', name: 'Rabbit\'s Foot', icon: '🐇', r: 2, cost: 6, text: '{k:1 in 3} chance for {x:×2 Mult}',
      after(ctx) { if (ctx.luck(1 / 3)) ctx.xmult(2); } },
    { id: 'wolf', name: 'Lone Wolf', icon: '🐺', r: 2, cost: 5, text: '{x:×5 Mult} when you cast {k:High Die}',
      after(ctx) { if (ctx.combo === 'high') ctx.xmult(5); } },
    { id: 'moon', name: 'Twin Moon', icon: '🌗', r: 2, cost: 7, text: 'Your {k:first} scoring die scores {k:twice}',
      retrig(ctx, d, k) { return k === 0 ? 1 : 0; } },
    { id: 'conch', name: 'Conch Shell', icon: '🐚', r: 2, cost: 6, text: '{k:Echo} glyphs score {k:one extra time}',
      retrig(ctx, d) { return d.g === 'echo' ? 1 : 0; } },
    { id: 'lens', name: 'Prism Lens', icon: '💠', r: 2, cost: 6, text: '{k:Prism} glyphs give {x:×2 Mult} instead of ×1.5' },
    { id: 'devil', name: 'Gambler\'s Grin', icon: '😈', r: 2, cost: 5, text: 'When out of Rerolls, you can {k:reroll for} {g:$2}' },
    { id: 'flask', name: 'Alchemist\'s Flask', icon: '⚗️', r: 2, cost: 6, text: 'After each win, a random face gains a {k:random glyph}',
      win(run, c, info) { return RM.rules.alchemy(run, info.rng); } },
    { id: 'hammer', name: 'Mason\'s Hammer', icon: '🔨', r: 2, cost: 6, text: 'After each win, the {k:lowest face} of a random die gains {k:+1 pip}',
      win(run, c, info) { return RM.rules.chisel(run, info.rng); } },
    { id: 'urn', name: 'Collector\'s Urn', icon: '🏺', r: 2, cost: 6, text: '{m:+3 Mult} for each charm you have',
      cur: (c, run) => '{m:+' + 3 * run.charms.length + ' Mult}',
      after(ctx) { ctx.mult(3 * ctx.run.charms.length); } },
    { id: 'boom', name: 'Overkill', icon: '💥', r: 2, cost: 5, text: 'Earn {g:$1} for every {k:25%} of max HP you overkill by (up to {g:$5})',
      win(run, c, info) {
        const n = Math.min(5, Math.floor(info.overkill / Math.max(1, info.maxHp) / 0.25));
        if (n > 0) { run.gold += n; return '+$' + n; }
        return null;
      } },
    { id: 'skull', name: 'Dark Pact', icon: '💀', r: 2, cost: 6, text: '{x:×2 Mult}. {k:−1 Reroll} each fight',
      mods: { rerolls: -1 }, after(ctx) { ctx.xmult(2); } },
    { id: 'crown', name: 'Depth Crown', icon: '👑', r: 2, cost: 6, text: '{m:+3 Mult} for each {k:Depth} you\'ve reached',
      cur: (c, run) => '{m:+' + 3 * run.depth + ' Mult}',
      after(ctx) { ctx.mult(3 * ctx.run.depth); } },
    { id: 'spiral', name: 'Ouroboros', icon: '🌀', r: 2, cost: 6, text: 'Straights can {k:loop} from 6 back round to 1 (like 5-6-1-2)',
      mods: { loop: true } },
    { id: 'hand', name: 'Midas Touch', icon: '✋', r: 2, cost: 6, text: 'Scoring {k:6s} give {g:+$1}',
      die(ctx, d) { if (d.v === 6) ctx.gold(1); } },
    { id: 'bell', name: 'Jackpot Bell', icon: '🔔', r: 2, cost: 7, text: '{x:×2 Mult} when {k:4 or more} scoring dice match',
      after(ctx) { if (ctx.maxMatch >= 4) ctx.xmult(2); } },

    { id: 'hourglass', name: 'Hourglass', icon: '⏳', r: 3, cost: 9, text: '{k:+1 Cast} each fight', mods: { casts: 1 } },
    { id: 'spare', name: 'Spare Die', icon: '🎲', r: 3, cost: 10, text: 'Roll an {k:extra die} (a plain six-sider)', mods: { dice: 1 } },
    { id: 'eye', name: 'Glass Eye', icon: '👁️', r: 3, cost: 8, text: '{x:×3 Mult}. {k:1 in 6} chance to shatter after each fight',
      after(ctx) { ctx.xmult(3); },
      win(run, c, info) { if (info.rng.chance(1 / 6)) { c.broken = true; return 'shattered!'; } return null; } },
    { id: 'lizard', name: 'Chameleon', icon: '🦎', r: 3, cost: 8, text: 'Dice showing {k:1} count as {k:Wild}', mods: { wild1: true } },
    { id: 'star', name: 'Guardian Star', icon: '🌟', r: 3, cost: 7, text: 'When you would lose your {k:last heart}, keep it instead. Then it fades' },
    { id: 'metro', name: 'Metronome', icon: '🎵', r: 3, cost: 9, text: 'Gains {x:×0.15 Mult} every fight you win',
      state: { x: 1 }, cur: (c) => '{x:×' + RM.fmtMult(c.s.x) + ' Mult}',
      after(ctx, c) { if (c.s.x > 1) ctx.xmult(c.s.x); },
      win(run, c) { c.s.x = Math.round((c.s.x + 0.15) * 100) / 100; return '×' + RM.fmtMult(c.s.x); } },
    { id: 'orb', name: 'Void Orb', icon: '🌑', r: 3, cost: 8, text: '{x:×1.5 Mult} for each {k:empty} charm slot',
      cur: (c, run) => '{x:×' + RM.fmtMult(Math.pow(1.5, Math.max(0, run.charmSlots - run.charms.length))) + ' Mult}',
      after(ctx) {
        const n = Math.max(0, ctx.run.charmSlots - ctx.run.charms.length);
        if (n > 0) ctx.xmult(Math.pow(1.5, n));
      } },
    { id: 'book', name: 'Archmage\'s Tome', icon: '📖', r: 3, cost: 8, text: 'Every cast has a {k:1 in 3} chance to {k:level up} its combo',
      cast(run, ctx, c, rng) {
        if (rng && rng.chance(1 / 3)) { run.levels[ctx.combo] = (run.levels[ctx.combo] || 1) + 1; return 'level'; }
        return null;
      } },
  ];
  const CHARM = {};
  CHARMS.forEach((c) => { CHARM[c.id] = c; });

  /* ---------------- shop items (used the moment you buy them) ---------------- */
  // Stones go onto a die face you choose.
  const STONES = [
    { id: 'st-flame', glyph: 'flame', name: 'Flame Stone', cost: 3, w: 10 },
    { id: 'st-storm', glyph: 'storm', name: 'Storm Stone', cost: 3, w: 10 },
    { id: 'st-gold', glyph: 'gold', name: 'Gold Stone', cost: 3, w: 8 },
    { id: 'st-lucky', glyph: 'lucky', name: 'Lucky Stone', cost: 4, w: 7 },
    { id: 'st-loaded', glyph: 'loaded', name: 'Loaded Stone', cost: 3, w: 7 },
    { id: 'st-prism', glyph: 'prism', name: 'Prism Stone', cost: 5, w: 5 },
    { id: 'st-echo', glyph: 'echo', name: 'Echo Stone', cost: 5, w: 5 },
    { id: 'st-wild', glyph: 'wild', name: 'Wild Stone', cost: 6, w: 3 },
    { id: 'chisel', name: 'Chisel', cost: 2, w: 9, text: 'Carve {k:+1 pip} onto a face (up to 9)' },
    { id: 'twin', name: 'Twin Stone', cost: 4, w: 6, text: 'Copy one face of a die onto {k:another face} of the same die' },
  ];
  const STONE = {};
  STONES.forEach((s) => {
    if (s.glyph) s.text = 'Etch a {k:' + GLYPHS[s.glyph].name + '} glyph onto a face: ' + GLYPHS[s.glyph].text;
    STONE[s.id] = s;
  });

  /* ---------------- trinkets: kept on your belt and used mid-fight ---------------- */
  const TRINKETS = [
    { id: 'nudge', name: 'Nudge', icon: '☝️', cost: 3, target: 1, text: 'Turn a die up by {k:one pip} (6 becomes 1)' },
    { id: 'flip', name: 'Flip Charm', icon: '🙃', cost: 3, target: 1, text: 'Flip a die onto its {k:opposite face}' },
    { id: 'copy', name: 'Copycat', icon: '🐈', cost: 4, target: 2, text: 'Pick a die, then another die to {k:copy} its face' },
    { id: 'sand', name: 'Sand Timer', icon: '⌛', cost: 4, target: 0, text: '{k:+1 Cast} this fight' },
    { id: 'bag', name: 'Dice Bag', icon: '👝', cost: 3, target: 0, text: '{k:+2 Rerolls} this fight' },
    { id: 'scroll', name: 'Fire Scroll', icon: '📜', cost: 4, target: 0, text: 'Your next cast gets {x:×2 Mult}' },
  ];
  const TRINKET = {};
  TRINKETS.forEach((t) => { TRINKET[t.id] = t; });

  /* ---------------- boons: one pick after every boss ---------------- */
  const BOONS = [
    { id: 'reroll', name: 'Quick Hands', icon: '🤹', text: '{k:+1 Reroll} every fight', w: 10 },
    { id: 'cast', name: 'Second Breath', icon: '🌬️', text: '{k:+1 Cast} every fight', w: 5, minDepth: 2 },
    { id: 'slot', name: 'Charm Bracelet', icon: '📿', text: '{k:+1 Charm slot}', w: 7, max: 2 },
    { id: 'belt', name: 'Wide Belt', icon: '🎒', text: '{k:+1 Trinket slot}', w: 6, max: 2 },
    { id: 'cash', name: 'Treasure', icon: '💎', text: 'Gain {g:$15}', w: 10 },
    { id: 'heal', name: 'Warm Hearth', icon: '❤️', text: 'Restore {k:every heart}, and +1 max heart', w: 7 },
    { id: 'study', name: 'Deep Study', icon: '📚', text: 'Your {k:two most-cast} combos gain {k:+2 levels}', w: 9 },
    { id: 'relic', name: 'Relic Cache', icon: '🗝️', text: 'A free {k:rare charm} (if you have room)', w: 7 },
    { id: 'wild', name: 'Wild Spark', icon: '✨', text: 'Etch {k:Wild} onto a face of your choice', w: 6 },
    { id: 'die', name: 'Sixth Die', icon: '🎲', text: 'Add a {k:sixth die} to your set for good', w: 4, minDepth: 3, max: 1 },
  ];
  const BOON = {};
  BOONS.forEach((b) => { BOON[b.id] = b; });

  /* ---------------- monsters ----------------
     art: which body plan art.js draws; pal: [body, dark, accent, eye]. */
  const AREAS = [
    { name: 'Mossy Cellar', bg: ['#1d2a22', '#0e1712'], fog: '#5fae6a', torch: '#ffb25a',
      minions: ['slime', 'bat', 'shroom'], brutes: ['bigslime', 'thornshroom'] },
    { name: 'Bone Crypt', bg: ['#24202f', '#100e18'], fog: '#9b8cff', torch: '#8fd0ff',
      minions: ['skull', 'ghost', 'spider'], brutes: ['bonelord', 'widow'] },
    { name: 'Ember Forge', bg: ['#311a16', '#160a08'], fog: '#ff7a3a', torch: '#ff9a3c',
      minions: ['imp', 'golem', 'magslime'], brutes: ['slaggolem', 'pitimp'] },
    { name: 'Void Sanctum', bg: ['#1a1433', '#07051a'], fog: '#c06bff', torch: '#d07bff',
      minions: ['eye', 'mimic', 'wraith'], brutes: ['elder', 'mimicbrute'] },
  ];
  const MONSTERS = {
    slime: { name: 'Gloop', art: 'slime', pal: ['#7bd96a', '#2f7a3a', '#c9ffb0', '#1b2b1b'] },
    bat: { name: 'Flitterbat', art: 'bat', pal: ['#8a6bb8', '#3d2a5e', '#ffcf6b', '#ffe9a8'] },
    shroom: { name: 'Sporecap', art: 'shroom', pal: ['#e0584f', '#8a2229', '#fff1d6', '#2a1414'] },
    bigslime: { name: 'Grand Gloop', art: 'slime', pal: ['#3fbf9a', '#17665a', '#b4ffe8', '#0f2622'], size: 1.15, crown: false, horns: true },
    thornshroom: { name: 'Thornshroom', art: 'shroom', pal: ['#9c55d6', '#4b1e7a', '#ffd6fb', '#1e0f2a'], size: 1.15, spikes: true },

    skull: { name: 'Rattleskull', art: 'skull', pal: ['#ece4d0', '#8a7f6a', '#6be3ff', '#0b1a22'] },
    ghost: { name: 'Wisp', art: 'ghost', pal: ['#bfe9ff', '#5b8cb8', '#ffffff', '#1b2a44'] },
    spider: { name: 'Crypt Spider', art: 'spider', pal: ['#3b3352', '#17122a', '#ff4f6d', '#ff8fa0'] },
    bonelord: { name: 'Bone Lord', art: 'skull', pal: ['#f4ead2', '#8d7a55', '#ff5a5a', '#2a0b0b'], size: 1.15, horns: true },
    widow: { name: 'Gravewidow', art: 'spider', pal: ['#26213a', '#0c0918', '#c9ff4f', '#e9ff9e'], size: 1.15, spikes: true },

    imp: { name: 'Cinder Imp', art: 'imp', pal: ['#ff5f3d', '#8f1f12', '#ffd36b', '#2a0b05'] },
    golem: { name: 'Clay Golem', art: 'golem', pal: ['#b0745a', '#5a3324', '#ffb15c', '#2b140b'] },
    magslime: { name: 'Magma Gloop', art: 'slime', pal: ['#ff8a2a', '#9a2b0a', '#ffe08a', '#2b0f05'] },
    slaggolem: { name: 'Slag Golem', art: 'golem', pal: ['#5e5a66', '#26232c', '#ff6a2a', '#140f0f'], size: 1.15, horns: true },
    pitimp: { name: 'Pit Fiend', art: 'imp', pal: ['#b9283a', '#560c19', '#ffcf4f', '#1a0306'], size: 1.15, spikes: true },

    eye: { name: 'Gazer', art: 'eye', pal: ['#c55fd9', '#5c1d70', '#ffe46b', '#1a0626'] },
    mimic: { name: 'Mimic', art: 'mimic', pal: ['#9a6337', '#4a2a12', '#ffcc3d', '#ff5f7a'] },
    wraith: { name: 'Voidwraith', art: 'ghost', pal: ['#6a5cff', '#241a8a', '#e6d9ff', '#0b0726'] },
    elder: { name: 'Elder Gazer', art: 'eye', pal: ['#ff5a8a', '#7a1638', '#9affe0', '#22040f'], size: 1.15, spikes: true },
    mimicbrute: { name: 'Hoardmaw', art: 'mimic', pal: ['#5b6b8a', '#252e42', '#ffe46b', '#ff4f6d'], size: 1.15, horns: true },
  };

  /* ---------------- bosses and their curses ---------------- */
  const BOSSES = [
    { id: 'oddmaw', name: 'The Oddmaw', art: 'slime', pal: ['#b06bff', '#4b1e88', '#ffe1ff', '#1a0730'], tier: 1,
      curse: 'Odd dice score {k:no Pips}' },
    { id: 'evenhand', name: 'The Evenhand', art: 'golem', pal: ['#5aa6d6', '#1d4a6b', '#b8f0ff', '#081620'], tier: 1,
      curse: 'Even dice score {k:no Pips}' },
    { id: 'miser', name: 'The Miser King', art: 'mimic', pal: ['#d8a235', '#7a4f0c', '#fff1a8', '#ff4f6d'], tier: 1, crown: true,
      curse: 'Every Reroll costs {g:$1}' },
    { id: 'glutton', name: 'The Glutton', art: 'slime', pal: ['#ff9b3d', '#8a3e0c', '#fff0c2', '#2b1203'], tier: 1, crown: true,
      curse: 'Eats a die: you roll {k:one fewer die}' },
    { id: 'lich', name: 'The Frost Lich', art: 'skull', pal: ['#d6f4ff', '#5a90b0', '#6bd8ff', '#06202e'], tier: 2, crown: true,
      curse: 'One die {k:freezes} each turn and can\'t be rerolled' },
    { id: 'twins', name: 'The Twin Wraiths', art: 'ghost', pal: ['#ff8fd1', '#8a2a66', '#ffffff', '#2a0a20'], tier: 2, twin: true,
      curse: 'Pairs and Two Pairs deal {k:half damage}' },
    { id: 'siren', name: 'The Siren', art: 'ghost', pal: ['#5fe0c8', '#127060', '#e8fff9', '#04201a'], tier: 2, crown: true,
      curse: 'A combo you\'ve already cast this fight deals {k:no damage}' },
    { id: 'leveller', name: 'The Leveller', art: 'golem', pal: ['#9aa0ad', '#3e434f', '#ffe46b', '#14161c'], tier: 2, crown: true,
      curse: 'Every combo counts as {k:level 1}' },
    { id: 'warden', name: 'The Iron Warden', art: 'golem', pal: ['#7c8796', '#2c323d', '#6bf0ff', '#0a0f14'], tier: 3, crown: true, horns: true,
      curse: 'Shrugs off the first {k:15% of its max HP} from every cast' },
    { id: 'hydra', name: 'The Hydra', art: 'hydra', pal: ['#4fc06a', '#1a5e2c', '#ffe46b', '#0b200f'], tier: 3,
      curse: 'Heals {k:10% of its max HP} after each of your casts' },
    { id: 'gorgon', name: 'The Gorgon', art: 'eye', pal: ['#7ad65a', '#2c6b1a', '#ffd23d', '#122806'], tier: 3, snakes: true,
      curse: '{k:No Rerolls}, but {k:+2 Casts}' },
    { id: 'mimiclord', name: 'The Mimic Lord', art: 'mimic', pal: ['#7a3fbf', '#35125e', '#ffcf4f', '#ff4f8a'], tier: 3, crown: true,
      curse: 'Your {k:leftmost charm} does nothing' },
  ];
  const FINAL_BOSS = { id: 'wyrm', name: 'The Pipwyrm', art: 'dragon', pal: ['#e03a4a', '#6e0f1e', '#ffd24f', '#ffef9a'], tier: 4, crown: true,
    curse: 'Each cast, a {k:random charm} falls asleep' };
  const BOSS = {};
  BOSSES.concat([FINAL_BOSS]).forEach((b) => { BOSS[b.id] = b; });

  // Elites ("brutes") carry one of these.
  const TRAITS = [
    { id: 'armored', name: 'Armored', text: 'Takes {k:25% less} damage' },
    { id: 'swift', name: 'Swift', text: 'You get {k:one fewer Cast}' },
    { id: 'greedy', name: 'Greedy', text: 'Glyphs and charms give {k:no gold}' },
    { id: 'regen', name: 'Regenerating', text: 'Heals {k:5% of its max HP} after each cast' },
    { id: 'warded', name: 'Warded', text: 'Your {k:first cast} deals half damage' },
  ];
  const TRAIT = {};
  TRAITS.forEach((t) => { TRAIT[t.id] = t; });

  /* ---------------- HP curve ----------------
     Minion HP by Depth; brutes ×1.5, bosses ×2, the Pipwyrm ×2.5.
     Past Depth 8 (endless) it keeps climbing steeply. */
  const BASE_HP = [0, 120, 340, 900, 2200, 5000, 10500, 21000, 40000];
  function monsterHp(depth, stage, heat) {
    let base = depth < BASE_HP.length ? BASE_HP[depth] : BASE_HP[8] * Math.pow(2.6, depth - 8);
    const k = stage === 0 ? 1 : stage === 1 ? 1.5 : depth === 8 ? 2.5 : 2;
    let hp = base * k;
    if (heat >= 5) hp *= 1.5;
    else if (heat >= 1) hp *= 1.2;
    // Round to something that reads nicely.
    const mag = Math.pow(10, Math.max(1, Math.floor(Math.log10(hp)) - 1));
    return Math.round(hp / mag) * mag;
  }
  const REWARD = [3, 4, 6]; // gold for a minion, a brute, a boss

  /* ---------------- dice sets (starting loadouts) ---------------- */
  const plain = (vals) => (vals || [1, 2, 3, 4, 5, 6]).map((v) => ({ v, g: null }));
  const DICE_SETS = [
    { id: 'apprentice', name: 'Apprentice Dice', color: '#f3ead8', pip: '#2b1d3a', text: 'Five plain dice. A fair start.',
      unlock: null, make: () => ({ dice: [0, 1, 2, 3, 4].map(() => plain()) }) },
    { id: 'ember', name: 'Ember Dice', color: '#ffd9c2', pip: '#a8240e', text: 'Every die has a {k:Flame} glyph on its 6.',
      unlock: { text: 'Reach Depth 3', test: (p) => p.bestDepth >= 3 },
      make: () => ({ dice: [0, 1, 2, 3, 4].map(() => { const f = plain(); f[5].g = 'flame'; return f; }) }) },
    { id: 'gilded', name: 'Gilded Dice', color: '#ffe9a8', pip: '#7a4f0c', text: 'Every die has a {k:Gold} glyph on its 1. Start with {g:+$6}.',
      unlock: { text: 'Win 12 fights in total', test: (p) => p.fightsWon >= 12 },
      make: () => ({ gold: 6, dice: [0, 1, 2, 3, 4].map(() => { const f = plain(); f[0].g = 'gold'; return f; }) }) },
    { id: 'clover', name: 'Clover Dice', color: '#d8ffd9', pip: '#16733a', text: 'Every die has a {k:Lucky} glyph on its 3. Start with the Four-Leaf Clover.',
      unlock: { text: 'Reach Depth 5', test: (p) => p.bestDepth >= 5 },
      make: () => ({ charms: ['clover'], dice: [0, 1, 2, 3, 4].map(() => { const f = plain(); f[2].g = 'lucky'; return f; }) }) },
    { id: 'storm', name: 'Storm Dice', color: '#d6ecff', pip: '#14508f', text: 'Every die has a {k:Storm} glyph on its 2 and 5, but {k:−1 Reroll} each fight.',
      unlock: { text: 'Cast a Four of a Kind', test: (p) => !!(p.cast && (p.cast.four || p.cast.five || p.cast.six)) },
      make: () => ({ rerolls: -1, dice: [0, 1, 2, 3, 4].map(() => { const f = plain(); f[1].g = 'storm'; f[4].g = 'storm'; return f; }) }) },
    { id: 'loaded', name: 'Loaded Dice', color: '#e6e0d6', pip: '#3a332b', text: 'Faces go {k:2 to 7} instead of 1 to 6.',
      unlock: { text: 'Cast a Five of a Kind', test: (p) => !!(p.cast && (p.cast.five || p.cast.six)) },
      make: () => ({ dice: [0, 1, 2, 3, 4].map(() => plain([2, 3, 4, 5, 6, 7])) }) },
    { id: 'gambler', name: 'Gambler\'s Dice', color: '#ffd6e8', pip: '#8f1c58', text: 'Start with {k:1 heart}, {k:+1 Cast} each fight and the Rabbit\'s Foot.',
      unlock: { text: 'Win a run', test: (p) => p.wins >= 1 },
      make: () => ({ hearts: 1, casts: 1, charms: ['rabbit'], dice: [0, 1, 2, 3, 4].map(() => plain()) }) },
    { id: 'hexad', name: 'Hexad Dice', color: '#e8dcff', pip: '#4b1e88', text: 'Roll {k:six dice}, but {k:−1 Cast} each fight.',
      unlock: { text: 'Reach Depth 7', test: (p) => p.bestDepth >= 7 },
      make: () => ({ casts: -1, dice: [0, 1, 2, 3, 4, 5].map(() => plain()) }) },
    { id: 'chaos', name: 'Chaos Dice', color: '#fff', pip: '#111', text: 'Every face is a {k:random number} from 1 to 9, and every die starts with a {k:random glyph}.',
      unlock: { text: 'Win a run on Heat 2 or higher', test: (p) => (p.bestHeatWon || 0) >= 2 },
      make: (rng) => ({ dice: [0, 1, 2, 3, 4].map(() => {
        const f = plain([1, 2, 3, 4, 5, 6].map(() => rng.int(1, 9)));
        f[rng.int(0, 5)].g = rng.pick(GLYPH_IDS);
        return f;
      }) }) },
  ];
  const DICE_SET = {};
  DICE_SETS.forEach((d) => { DICE_SET[d.id] = d; });

  /* ---------------- Heat (difficulty) ---------------- */
  const HEAT = [
    'The standard run.',
    'Monsters have {k:20% more HP}.',
    '{k:−1 Reroll} each fight.',
    'Everything in the shop costs {g:$1 more}.',
    'Start with {k:2 hearts}.',
    'Monsters have {k:50% more HP} (instead of 20%).',
    'Minions get {k:traits} too.',
    'Start with {k:1 heart}.',
    '{k:−1 Cast} each fight.',
  ];

  /* ---------------- feats (achievements) ---------------- */
  const FEATS = [
    { id: 'first', name: 'First Blood', icon: '🩹', text: 'Win your first fight.', test: (p) => p.fightsWon >= 1 },
    { id: 'd3', name: 'Into the Crypt', icon: '💀', text: 'Reach Depth 3.', test: (p) => p.bestDepth >= 3 },
    { id: 'd5', name: 'Forgewalker', icon: '🔥', text: 'Reach Depth 5.', test: (p) => p.bestDepth >= 5 },
    { id: 'd7', name: 'Voidtouched', icon: '🌌', text: 'Reach Depth 7.', test: (p) => p.bestDepth >= 7 },
    { id: 'win', name: 'Rollmancer', icon: '🏆', text: 'Defeat the Pipwyrm.', test: (p) => p.wins >= 1 },
    { id: 'heat4', name: 'Feel the Heat', icon: '🌶️', text: 'Win a run on Heat 4.', test: (p) => (p.bestHeatWon || 0) >= 4 },
    { id: 'heat8', name: 'Inferno', icon: '☄️', text: 'Win a run on Heat 8.', test: (p) => (p.bestHeatWon || 0) >= 8 },
    { id: 'endless', name: 'No Bottom', icon: '🕳️', text: 'Reach Depth 10 in endless mode.', test: (p) => p.bestDepth >= 10 },
    { id: 'k1', name: 'Heavy Hitter', icon: '💪', text: 'Deal 1,000 damage in one cast.', test: (p) => p.bestCast >= 1000 },
    { id: 'k100', name: 'Hundred Grand', icon: '💯', text: 'Deal 100,000 damage in one cast.', test: (p) => p.bestCast >= 100000 },
    { id: 'm10', name: 'Spellstorm', icon: '🌪️', text: 'Deal 10 million damage in one cast.', test: (p) => p.bestCast >= 1e7 },
    { id: 'quad', name: 'Four Score', icon: '4️⃣', text: 'Cast a Four of a Kind.', test: (p) => !!(p.cast && p.cast.four) },
    { id: 'quint', name: 'Jackpot', icon: '🎰', text: 'Cast a Five of a Kind.', test: (p) => !!(p.cast && p.cast.five) },
    { id: 'lg', name: 'Straight Shooter', icon: '📏', text: 'Cast a Large Straight.', test: (p) => !!(p.cast && p.cast.lgstraight) },
    { id: 'sixer', name: 'Sixth Sense', icon: '🎲', text: 'Cast a combo that needs six dice.', test: (p) => !!(p.cast && (p.cast.threepair || p.cast.grand || p.cast.twotriple || p.cast.six)) },
    { id: 'rich', name: 'Dragon\'s Hoard', icon: '💰', text: 'Hold $50 at once.', test: (p) => p.bestGold >= 50 },
    { id: 'full', name: 'Full Bracelet', icon: '📿', text: 'Fill every charm slot.', test: (p) => !!p.flags.fullCharms },
    { id: 'one', name: 'One and Done', icon: '☝️', text: 'Defeat a boss with a single cast.', test: (p) => !!p.flags.oneShotBoss },
    { id: 'clutch', name: 'Clutch', icon: '😅', text: 'Win a fight on your very last cast with no rerolls left.', test: (p) => !!p.flags.clutch },
    { id: 'glyphs', name: 'Glyphsmith', icon: '✨', text: 'Have 10 glyphs on your dice at once.', test: (p) => !!p.flags.glyph10 },
    { id: 'daily', name: 'Daily Grind', icon: '📅', text: 'Finish a Daily Run.', test: (p) => (p.dailyDone || 0) >= 1 },
    { id: 'sets', name: 'Collector', icon: '🧰', text: 'Unlock every dice set.', test: (p) => DICE_SETS.every((d) => !d.unlock || d.unlock.test(p)) },
    { id: 'charms', name: 'Charmed Life', icon: '🍀', text: 'Discover 30 different charms.', test: (p) => Object.keys(p.seenCharms || {}).length >= 30 },
    { id: 'runs', name: 'Regular', icon: '🎟️', text: 'Play 25 runs.', test: (p) => p.runs >= 25 },
  ];

  Object.assign(RM, {
    COMBOS, COMBO, PAIRISH, STRAIGHTS, GLYPHS, GLYPH_IDS,
    CHARMS, CHARM, STONES, STONE, TRINKETS, TRINKET, BOONS, BOON,
    AREAS, MONSTERS, BOSSES, FINAL_BOSS, BOSS, TRAITS, TRAIT,
    BASE_HP, monsterHp, REWARD, DICE_SETS, DICE_SET, HEAT, FEATS,
  });
})(typeof window !== 'undefined' ? window.RM : globalThis.RM);
