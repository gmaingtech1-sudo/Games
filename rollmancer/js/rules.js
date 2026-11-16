/* Rollmancer — the rules. Everything here is pure game logic on a plain,
   JSON-saveable `run` object, with no drawing or DOM, so it also runs in
   Node for the balance simulator (tools/sim.js).

   A run: Depths 1–8, each with three fights (minion, brute, boss). In a
   fight you roll your dice, hold the ones you like, reroll the rest, and
   Cast: the best combo showing deals Pips × Mult damage. Out of Casts
   before the monster drops → you lose a heart. Between fights: the shop.
   After each boss: a boon. Beat the Pipwyrm at Depth 8 to win; then it's
   endless. */
(function (RM) {
  'use strict';

  const { COMBOS, COMBO, GLYPHS, GLYPH_IDS, CHARM, CHARMS, STONES, STONE, TRINKET, TRINKETS,
    BOONS, BOON, AREAS, MONSTERS, BOSSES, FINAL_BOSS, BOSS, TRAITS, TRAIT, DICE_SET, DICE_SETS,
    monsterHp, REWARD } = RM;
  const Stream = RM.Stream;

  const GLYPH_RANK = { prism: 9, echo: 8, storm: 7, flame: 6, lucky: 5, gold: 4, wild: 3, loaded: 1 };
  const glyphRank = (g) => (g ? GLYPH_RANK[g] || 0 : 0);

  /* ---------------- run setup ---------------- */
  function newRun(opts) {
    opts = opts || {};
    const seed = opts.seed != null ? opts.seed >>> 0 : RM.newSeed();
    const setId = opts.set && DICE_SET[opts.set] ? opts.set : 'apprentice';
    const heat = RM.clamp(opts.heat | 0, 0, 8);
    const setRng = new Stream(RM.hashStr(seed + ':set'));
    const made = DICE_SET[setId].make(setRng);
    const hearts = made.hearts || (heat >= 7 ? 1 : heat >= 4 ? 2 : 3);
    const run = {
      v: 1,
      seed,
      daily: opts.daily || null,
      set: setId,
      heat,
      depth: 1,
      stage: 0,
      hearts,
      maxHearts: hearts,
      gold: 4 + (made.gold || 0),
      dice: made.dice,
      charms: [],
      charmSlots: 5,
      belt: [],
      beltSlots: 2,
      levels: {},
      bonus: { casts: made.casts || 0, rerolls: made.rerolls || 0 },
      boonCount: {},
      usedBosses: [],
      plan: null,
      fight: null,
      shop: null,
      boon: null,
      result: null,
      phase: 'fight',
      won: false,
      endless: false,
      history: [],
      rng: { roll: { s: RM.hashStr(seed + ':roll') }, luck: { s: RM.hashStr(seed + ':luck') } },
      stats: { casts: {}, bestCast: 0, bestCombo: null, totalDmg: 0, fightsWon: 0, maxGold: 0, bossOneShot: false, clutch: false },
      started: Date.now(),
    };
    COMBOS.forEach((c) => { run.levels[c.id] = 1; });
    (made.charms || []).forEach((id) => run.charms.push(makeCharm(id)));
    planDepth(run);
    startFight(run);
    return run;
  }

  function makeCharm(id) {
    const def = CHARM[id];
    return { id, s: def.state ? RM.deepCopy(def.state) : {} };
  }

  const rollRng = (run) => new Stream(run.rng.roll);
  const luckRng = (run) => new Stream(run.rng.luck);
  // Shops and monsters come from streams keyed to where you are, so a
  // Daily Run offers everyone the same stock at the same stop.
  const placeRng = (run, what) => new Stream(RM.hashStr(run.seed + ':' + what + ':' + run.depth + ':' + run.stage));

  // Two Depths per area; endless Depths cycle back through them.
  function areaFor(depth) {
    return AREAS[Math.floor((depth - 1) / 2) % AREAS.length];
  }

  /* ---------------- planning a Depth: its three monsters ---------------- */
  // The three monsters of a Depth. Deterministic from the seed and Depth
  // (and which bosses were already met), so it can also be peeked at.
  function makePlan(run, depth, usedBosses) {
    const rng = new Stream(RM.hashStr(run.seed + ':plan:' + depth));
    const area = areaFor(depth);
    const plan = [];
    plan.push(monsterFrom(run, rng.pick(area.minions), 0, rng, depth));
    plan.push(monsterFrom(run, rng.pick(area.brutes), 1, rng, depth));
    let boss;
    if (depth === 8) boss = FINAL_BOSS;
    else {
      const tier = depth <= 2 ? 1 : depth <= 4 ? 2 : depth <= 6 ? 3 : 9;
      let pool = BOSSES.filter((b) => (tier === 9 ? true : b.tier === tier) && !usedBosses.includes(b.id));
      if (!pool.length) pool = BOSSES.filter((b) => !usedBosses.includes(b.id));
      if (!pool.length) { usedBosses.length = 0; pool = BOSSES.slice(); }
      boss = rng.pick(pool);
      usedBosses.push(boss.id);
    }
    plan.push({
      key: boss.id, name: boss.name, art: boss.art, pal: boss.pal, boss: true, curse: boss.id,
      size: boss.art === 'dragon' ? 1.2 : 1.15, crown: !!boss.crown, horns: !!boss.horns, twin: !!boss.twin, snakes: !!boss.snakes,
      hp: monsterHp(depth, 2, run.heat),
    });
    return plan;
  }
  function planDepth(run) {
    run.plan = makePlan(run, run.depth, run.usedBosses);
  }
  // The first monster of the next Depth, without changing the run.
  function peekNextDepth(run) {
    return makePlan(run, run.depth + 1, run.usedBosses.slice())[0];
  }

  function monsterFrom(run, key, stage, rng, depth) {
    const m = MONSTERS[key];
    let trait = null;
    if (stage === 1 || (stage === 0 && run.heat >= 6)) trait = rng.pick(TRAITS).id;
    return {
      key, name: m.name, art: m.art, pal: m.pal, boss: false, curse: null, trait,
      size: m.size || 1, crown: !!m.crown, horns: !!m.horns, spikes: !!m.spikes,
      hp: monsterHp(depth, stage, run.heat),
    };
  }

  /* ---------------- derived numbers ---------------- */
  function charmMods(run) {
    const m = { casts: 0, rerolls: 0, dice: 0, wild1: false, loop: false };
    run.charms.forEach((c) => {
      const d = CHARM[c.id];
      if (!d.mods) return;
      m.casts += d.mods.casts || 0;
      m.rerolls += d.mods.rerolls || 0;
      m.dice += d.mods.dice || 0;
      if (d.mods.wild1) m.wild1 = true;
      if (d.mods.loop) m.loop = true;
    });
    return m;
  }
  const hasCharm = (run, id) => run.charms.some((c) => c.id === id);

  function castsFor(run, mon) {
    const m = charmMods(run);
    let n = 4 + run.bonus.casts + m.casts - (run.heat >= 8 ? 1 : 0);
    if (mon && mon.trait === 'swift') n -= 1;
    if (mon && mon.curse === 'gorgon') n += 2;
    return Math.max(1, n);
  }
  function rerollsFor(run, mon) {
    if (mon && mon.curse === 'gorgon') return 0;
    const m = charmMods(run);
    return Math.max(0, 3 + run.bonus.rerolls + m.rerolls - (run.heat >= 2 ? 1 : 0));
  }
  // The face lists you'll roll this fight: your dice, the Spare Die, minus
  // whatever the Glutton ate.
  function fightFaces(run, mon) {
    const list = run.dice.map((faces) => faces);
    const m = charmMods(run);
    for (let i = 0; i < m.dice; i++) list.push([1, 2, 3, 4, 5, 6].map((v) => ({ v, g: null })));
    if (mon && mon.curse === 'glutton' && list.length > 1) list.pop();
    return list;
  }
  const priceBump = (run) => (run.heat >= 3 ? 1 : 0);

  /* ---------------- fights ---------------- */
  function startFight(run) {
    const mon = RM.deepCopy(run.plan[run.stage]);
    mon.max = mon.hp;
    run.fight = {
      mon,
      casts: castsFor(run, mon),
      rerolls: rerollsFor(run, mon),
      castNo: 0,
      dice: [],
      faces: fightFaces(run, mon),
      rerolledTurn: false,
      frozen: -1,
      asleep: [],
      scroll: 0,
      used: [],
      last: null,
      pending: false,
    };
    run.phase = 'fight';
    newTurn(run);
  }

  function rollFace(faces, rng) {
    return rng.weighted(faces.map((f, i) => i), (i) => (faces[i].g === 'loaded' ? 2 : 1));
  }

  function newTurn(run) {
    const f = run.fight;
    const rng = rollRng(run);
    f.dice = f.faces.map((faces, src) => {
      const fi = rollFace(faces, rng);
      return { src, f: fi, v: faces[fi].v, g: faces[fi].g, held: false, roll: 1 };
    });
    f.rerolledTurn = false;
    f.pending = false;
    f.frozen = f.mon.curse === 'lich' ? rng.int(0, f.dice.length - 1) : -1;
    f.asleep = [];
    if (f.mon.curse === 'mimiclord' && run.charms.length) f.asleep.push(0);
    if (f.mon.curse === 'wyrm' && run.charms.length) f.asleep.push(rng.int(0, run.charms.length - 1));
  }

  function toggleHold(run, i) {
    const f = run.fight;
    if (!f || f.pending || i < 0 || i >= f.dice.length || i === f.frozen) return false;
    f.dice[i].held = !f.dice[i].held;
    return true;
  }

  // What a reroll would cost right now: {ok, free, gold, why}.
  function rerollCost(run) {
    const f = run.fight;
    if (!f || f.pending) return { ok: false, why: 'busy' };
    const loose = f.dice.filter((d, i) => !d.held && i !== f.frozen).length;
    if (!loose) return { ok: false, why: 'held' };
    const miser = f.mon.curse === 'miser' ? 1 : 0;
    if (f.rerolls > 0) {
      if (run.gold < miser) return { ok: false, why: 'gold' };
      return { ok: true, free: true, gold: miser };
    }
    if (hasCharm(run, 'devil')) {
      const g = 2 + miser;
      if (run.gold < g) return { ok: false, why: 'gold', gold: g };
      return { ok: true, free: false, gold: g };
    }
    return { ok: false, why: 'none' };
  }

  function reroll(run) {
    const c = rerollCost(run);
    if (!c.ok) return null;
    const f = run.fight;
    if (c.free) f.rerolls -= 1;
    run.gold -= c.gold;
    const rng = rollRng(run);
    const changed = [];
    f.dice.forEach((d, i) => {
      if (d.held || i === f.frozen) return;
      const faces = f.faces[d.src];
      const fi = rollFace(faces, rng);
      d.f = fi;
      d.v = faces[fi].v;
      d.g = faces[fi].g;
      d.roll += 1;
      changed.push(i);
    });
    f.rerolledTurn = true;
    return changed;
  }

  /* ---------------- finding combos ---------------- */
  // All the combos the values make, each with the dice it scores.
  // vals: resolved number per die; prefer: rank used to pick between equal dice.
  function detect(vals, prefer, loop) {
    const n = vals.length;
    const by = new Map();
    vals.forEach((v, i) => {
      if (!by.has(v)) by.set(v, []);
      by.get(v).push(i);
    });
    // Best-glyph dice first, so a Pair of 5s scores the enchanted 5s.
    by.forEach((arr) => arr.sort((a, b) => prefer[b] - prefer[a] || a - b));
    const groups = [...by.entries()].sort((a, b) => b[0] - a[0]);
    const out = [];
    const take = (v, k) => by.get(v).slice(0, k);

    // High Die: one candidate per distinct value.
    groups.forEach(([v]) => out.push({ c: 'high', idx: take(v, 1) }));
    const ge = (k) => groups.filter(([, a]) => a.length >= k).map(([v]) => v);
    const g2 = ge(2), g3 = ge(3);
    g2.forEach((v) => out.push({ c: 'pair', idx: take(v, 2) }));
    for (let a = 0; a < g2.length; a++) {
      for (let b = a + 1; b < g2.length; b++) out.push({ c: 'twopair', idx: take(g2[a], 2).concat(take(g2[b], 2)) });
    }
    g3.forEach((v) => out.push({ c: 'three', idx: take(v, 3) }));
    ge(4).forEach((v) => out.push({ c: 'four', idx: take(v, 4) }));
    ge(5).forEach((v) => out.push({ c: 'five', idx: take(v, 5) }));
    ge(6).forEach((v) => out.push({ c: 'six', idx: take(v, 6) }));
    g3.forEach((a) => g2.forEach((b) => {
      if (a !== b) out.push({ c: 'fullhouse', idx: take(a, 3).concat(take(b, 2)) });
    }));
    if (n >= 6) {
      for (let a = 0; a < g2.length; a++) {
        for (let b = a + 1; b < g2.length; b++) {
          for (let c = b + 1; c < g2.length; c++) {
            out.push({ c: 'threepair', idx: take(g2[a], 2).concat(take(g2[b], 2), take(g2[c], 2)) });
          }
        }
      }
      for (let a = 0; a < g3.length; a++) {
        for (let b = a + 1; b < g3.length; b++) out.push({ c: 'twotriple', idx: take(g3[a], 3).concat(take(g3[b], 3)) });
      }
    }
    // Straights: walk runs of distinct values (6 → 1 too, with Ouroboros).
    if (n >= 4) {
      const has = new Set(by.keys());
      const succ = (v) => {
        const s = [];
        if (has.has(v + 1)) s.push(v + 1);
        if (loop && v === 6 && has.has(1)) s.push(1);
        return s;
      };
      const seen = new Set();
      const walk = (path) => {
        const L = path.length;
        if (L >= 4) {
          const key = path.join(',');
          if (!seen.has(key)) {
            seen.add(key);
            const c = L === 4 ? 'smstraight' : L === 5 ? 'lgstraight' : 'grand';
            out.push({ c, idx: path.map((v) => by.get(v)[0]) });
          }
        }
        if (L >= 6) return;
        succ(path[L - 1]).forEach((nx) => { if (!path.includes(nx)) walk(path.concat(nx)); });
      };
      has.forEach((v) => walk([v]));
    }
    return out;
  }

  // Which dice are wild right now.
  function wildMask(run, dice) {
    const w1 = charmMods(run).wild1;
    return dice.map((d) => d.g === 'wild' || (w1 && d.v === 1));
  }

  // Every way to fill the wild dice (as a multiset, since wilds are alike).
  function wildFills(count, maxV) {
    const out = [];
    const rec = (start, acc) => {
      if (acc.length === count) { out.push(acc.slice()); return; }
      for (let v = start; v <= maxV; v++) { acc.push(v); rec(v, acc); acc.pop(); }
    };
    rec(1, []);
    return out;
  }

  /* ---------------- scoring ----------------
     evaluate() runs one combo through the whole pipeline and records each
     step (for the animation) on the way. `live` rolls the dice on luck
     effects; previews treat luck as not firing. */
  function evaluate(run, cand, vals, live) {
    const f = run.fight;
    const mon = f.mon;
    const dice = f.dice;
    const comboDef = COMBO[cand.c];
    const level = mon.curse === 'leveller' ? 1 : run.levels[cand.c] || 1;
    const steps = [];
    let pips = comboDef.pips + (level - 1) * comboDef.lp;
    let mult = comboDef.mult + (level - 1) * comboDef.lm;
    let gold = 0;
    let lucky = false;
    const rng = live ? luckRng(run) : null;
    const greedy = mon.trait === 'greedy';
    const asleep = f.asleep || [];
    const charms = run.charms.map((c, k) => ({ c, k, d: CHARM[c.id], on: !asleep.includes(k) }));
    const clover = charms.some((x) => x.on && x.c.id === 'clover');
    const lens = charms.some((x) => x.on && x.c.id === 'lens');
    const scoringSet = new Set(cand.idx);
    const order = cand.idx.slice().sort((a, b) => a - b);
    let src = { t: 'combo' };
    const push = (kind, amt) => steps.push({ kind, amt, src, pips, mult });

    steps.push({ kind: 'base', src, pips, mult, level });

    const scoring = order.map((i) => ({ i, v: vals[i], g: dice[i].g }));
    let matchMax = 0;
    const cnt = {};
    scoring.forEach((d) => { cnt[d.v] = (cnt[d.v] || 0) + 1; matchMax = Math.max(matchMax, cnt[d.v]); });

    const ctx = {
      run, fight: f, combo: cand.c, scoring, maxMatch: matchMax,
      first: f.castNo === 0, last: f.casts === 1,
      rerolledTurn: f.rerolledTurn, rerollsLeft: f.rerolls,
      pips(n) { pips += n; push('pips', n); },
      mult(n) { mult += n; push('mult', n); },
      xmult(n) { mult *= n; push('xmult', n); },
      gold(n) { if (greedy) return; gold += n; push('gold', n); },
      luck(p) {
        lucky = true;
        return live ? rng.chance(p) : false;
      },
    };

    scoring.forEach((d, k) => {
      let triggers = 1 + (d.g === 'echo' ? 1 : 0);
      charms.forEach((x) => { if (x.on && x.d.retrig) triggers += x.d.retrig(ctx, d, k, x.c) || 0; });
      for (let t = 0; t < triggers; t++) {
        src = { t: 'die', i: d.i, again: t > 0 };
        const odd = d.v % 2 === 1;
        if ((mon.curse === 'oddmaw' && odd) || (mon.curse === 'evenhand' && !odd)) push('nopips', 0);
        else { pips += d.v; push('pips', d.v); }
        src = { t: 'glyph', i: d.i, g: d.g };
        switch (d.g) {
          case 'flame': ctx.pips(15); break;
          case 'storm': ctx.mult(4); break;
          case 'prism': ctx.xmult(lens ? 2 : 1.5); break;
          case 'gold': ctx.gold(2); break;
          case 'lucky':
            if (ctx.luck(clover ? 2 / 3 : 1 / 3)) ctx.mult(10);
            if (ctx.luck(clover ? 1 / 4 : 1 / 8)) ctx.gold(8);
            break;
          default: break;
        }
        charms.forEach((x) => {
          if (!x.on || !x.d.die) return;
          src = { t: 'charm', k: x.k, i: d.i };
          x.d.die(ctx, d, x.c);
        });
      }
    });
    dice.forEach((dd, i) => {
      if (scoringSet.has(i)) return;
      const d = { i, v: vals[i], g: dd.g };
      charms.forEach((x) => {
        if (!x.on || !x.d.unscored) return;
        src = { t: 'charm', k: x.k, i };
        x.d.unscored(ctx, d, x.c);
      });
    });
    charms.forEach((x) => {
      if (!x.on || !x.d.after) return;
      src = { t: 'charm', k: x.k };
      x.d.after(ctx, x.c);
    });
    if (f.scroll) {
      src = { t: 'scroll' };
      ctx.xmult(2);
    }

    const raw = Math.floor(pips * mult);
    let dmg = raw;
    const notes = [];
    if (mon.curse === 'twins' && (cand.c === 'pair' || cand.c === 'twopair')) { dmg = Math.floor(dmg / 2); notes.push('halved'); }
    if (mon.curse === 'siren' && f.used.includes(cand.c)) { dmg = 0; notes.push('already cast'); }
    if (mon.trait === 'armored') { dmg = Math.floor(dmg * 0.75); notes.push('armor'); }
    if (mon.trait === 'warded' && f.castNo === 0) { dmg = Math.floor(dmg / 2); notes.push('warded'); }
    if (mon.curse === 'warden') {
      const block = Math.floor(mon.max * 0.15);
      dmg = Math.max(0, dmg - block);
      notes.push('blocked ' + RM.fmt(block));
    }
    return { combo: cand.c, idx: order, vals, pips, mult, raw, dmg, gold, steps, lucky, notes, level, maxMatch: matchMax };
  }

  // The best cast the dice showing allow (highest damage, then rarer combo).
  function best(run, live) {
    const f = run.fight;
    const dice = f.dice;
    const wild = wildMask(run, dice);
    const prefer = dice.map((d) => glyphRank(d.g));
    const loop = charmMods(run).loop;
    const fixed = dice.map((d, i) => (wild[i] ? null : d.v));
    const wildIdx = [];
    wild.forEach((w, i) => { if (w) wildIdx.push(i); });
    let maxV = 6;
    f.faces.forEach((faces) => faces.forEach((fc) => { if (fc.v > maxV) maxV = fc.v; }));
    maxV = Math.min(9, maxV);
    const fills = wildIdx.length ? wildFills(wildIdx.length, maxV) : [[]];
    let top = null;
    const seen = new Set();
    for (const fill of fills) {
      const vals = fixed.slice();
      wildIdx.forEach((i, k) => { vals[i] = fill[k]; });
      for (const cand of detect(vals, prefer, loop)) {
        const key = cand.c + ':' + cand.idx.slice().sort((a, b) => a - b).map((i) => i + '=' + vals[i]).join(',');
        if (seen.has(key)) continue;
        seen.add(key);
        const r = evaluate(run, cand, vals, false);
        if (!top || r.dmg > top.r.dmg || (r.dmg === top.r.dmg && COMBO[r.combo].rank > COMBO[top.r.combo].rank)) {
          top = { r, cand, vals };
        }
      }
    }
    if (!top) return null;
    if (live) return evaluate(run, top.cand, top.vals, true);
    return top.r;
  }

  /* ---------------- casting ---------------- */
  function cast(run) {
    const f = run.fight;
    if (!f || f.pending || run.phase !== 'fight') return null;
    const r = best(run, true);
    const mon = f.mon;
    const before = mon.hp;
    mon.hp = Math.max(0, mon.hp - r.dmg);
    const overkill = r.dmg - before;
    run.gold += r.gold;
    f.casts -= 1;
    f.castNo += 1;
    f.scroll = 0;
    f.used.push(r.combo);
    f.last = r;
    f.pending = true;

    // Run-wide stats.
    const st = run.stats;
    st.casts[r.combo] = (st.casts[r.combo] || 0) + 1;
    st.totalDmg += r.dmg;
    if (r.dmg > st.bestCast) { st.bestCast = r.dmg; st.bestCombo = r.combo; }

    // Scaling charms.
    const grew = [];
    const lrng = luckRng(run);
    run.charms.forEach((c, k) => {
      const d = CHARM[c.id];
      if (d.cast && !(f.asleep || []).includes(k)) {
        const g = d.cast(run, r, c, lrng);
        if (g) grew.push({ k, what: g });
      }
    });
    r.grew = grew;

    let heal = 0;
    if (mon.hp > 0) {
      if (mon.curse === 'hydra') heal = Math.floor(mon.max * 0.10);
      if (mon.trait === 'regen') heal = Math.floor(mon.max * 0.05);
      mon.hp = Math.min(mon.max, mon.hp + heal);
    }
    r.heal = heal;
    r.killed = mon.hp <= 0;
    r.overkill = Math.max(0, overkill);
    r.hpAfter = mon.hp;
    if (r.killed) {
      if (mon.boss && f.castNo === 1) st.bossOneShot = true;
      if (f.casts === 0 && f.rerolls === 0) st.clutch = true;
      r.outcome = 'win';
    } else if (f.casts <= 0) {
      r.outcome = 'lose';
    } else {
      r.outcome = 'next';
    }
    st.maxGold = Math.max(st.maxGold, run.gold);
    return r;
  }

  // After the cast animation: roll a new turn, or settle the fight.
  function afterCast(run) {
    const f = run.fight;
    if (!f || !f.pending) return null;
    const r = f.last;
    if (r.outcome === 'win') return winFight(run, r);
    if (r.outcome === 'lose') return loseFight(run);
    newTurn(run);
    return { phase: 'fight' };
  }

  function winFight(run, r) {
    const f = run.fight;
    const mon = f.mon;
    const lines = [];
    const base = REWARD[run.stage];
    run.gold += base;
    lines.push({ text: mon.boss ? 'Boss defeated' : mon.trait ? 'Brute defeated' : 'Monster defeated', gold: base });
    if (f.casts > 0) {
      run.gold += f.casts;
      lines.push({ text: f.casts + ' Cast' + (f.casts > 1 ? 's' : '') + ' left', gold: f.casts });
    }
    const info = { rerolls: f.rerolls, overkill: r.overkill, maxHp: mon.max, rng: luckRng(run) };
    const notes = [];
    run.charms.forEach((c) => {
      const d = CHARM[c.id];
      if (!d.win) return;
      const before = run.gold;
      const note = d.win(run, c, info);
      if (note) {
        const g = run.gold - before;
        if (g > 0) lines.push({ text: d.name, gold: g, icon: d.icon });
        else notes.push({ id: c.id, text: d.name + ': ' + note });
      }
    });
    const broken = run.charms.filter((c) => c.broken).map((c) => c.id);
    run.charms = run.charms.filter((c) => !c.broken);
    run.stats.fightsWon += 1;
    run.stats.maxGold = Math.max(run.stats.maxGold, run.gold);
    run.history.push('W');
    const wasFinal = mon.boss && run.depth === 8 && !run.endless;
    run.result = { won: true, lines, notes, broken, boss: mon.boss, name: mon.name, final: wasFinal, total: lines.reduce((a, l) => a + l.gold, 0) };
    run.fight = null;
    run.phase = 'reward';
    if (wasFinal) { run.won = true; run.winAt = run.history.length; }
    return { phase: 'reward' };
  }

  function loseFight(run) {
    const mon = run.fight.mon;
    run.hearts -= 1;
    let saved = false;
    if (run.hearts <= 0) {
      const k = run.charms.findIndex((c) => c.id === 'star');
      if (k >= 0) {
        run.charms.splice(k, 1);
        run.hearts = 1;
        saved = true;
      }
    }
    run.history.push('L');
    const final = mon.boss && run.depth === 8 && !run.endless;
    run.result = { won: false, lines: [], notes: [], broken: [], boss: mon.boss, name: mon.name, saved, final, retry: final, total: 0 };
    run.fight = null;
    if (run.hearts <= 0) {
      run.phase = 'over';
      run.died = true;
      return { phase: 'over' };
    }
    run.phase = 'reward';
    return { phase: 'reward' };
  }

  // From the reward card: a boss gives a boon first, everything goes to the shop.
  function claimReward(run) {
    if (run.phase !== 'reward') return;
    const res = run.result;
    if (res.won && res.boss && !res.final) {
      makeBoons(run);
      run.phase = 'boon';
      return;
    }
    if (res.final && res.won) {
      run.phase = 'victory';
      return;
    }
    enterShop(run);
  }

  function goEndless(run) {
    run.endless = true;
    makeBoons(run);
    run.phase = 'boon';
  }

  /* ---------------- shop ---------------- */
  function charmPool(run, exclude) {
    const owned = new Set(run.charms.map((c) => c.id).concat(exclude || []));
    return CHARMS.filter((c) => !owned.has(c.id));
  }
  function rollCharm(run, rng, exclude, rarity) {
    const pool = charmPool(run, exclude);
    if (!pool.length) return null;
    let r = rarity;
    if (!r) {
      const x = rng.next();
      r = x < 0.08 ? 3 : x < 0.38 ? 2 : 1;
    }
    let sub = pool.filter((c) => c.r === r);
    if (!sub.length) sub = pool;
    return rng.pick(sub).id;
  }

  function rollGood(run, rng, taken) {
    const x = rng.next();
    const hurt = run.hearts < run.maxHearts;
    if (hurt && x < 0.07) return { type: 'potion', id: 'tonic', cost: 6 };
    if (x < 0.5) {
      const s = rng.weighted(STONES.filter((s) => !taken.includes(s.id)), (s) => s.w);
      return { type: 'stone', id: s.id, cost: s.cost };
    }
    if (x < 0.8) {
      const nd = fightFaces(run, null).length;
      const pool = COMBOS.filter((c) => c.min <= nd && !taken.includes('tome-' + c.id));
      const c = rng.weighted(pool, (c) => (c.id === 'high' ? 1 : c.min >= 6 ? 3 : 6));
      return { type: 'tome', id: 'tome-' + c.id, combo: c.id, cost: c.rank <= 3 ? 3 : c.rank <= 7 ? 4 : 5 };
    }
    const pool = TRINKETS.filter((t) => !taken.includes(t.id));
    const t = rng.pick(pool);
    return { type: 'trinket', id: t.id, cost: t.cost };
  }

  function stockShop(run, rng) {
    const shop = run.shop;
    const charmIds = [];
    shop.charms = [];
    for (let i = 0; i < shop.charmSlots; i++) {
      const id = rollCharm(run, rng, charmIds);
      if (!id) break;
      charmIds.push(id);
      shop.charms.push({ type: 'charm', id, cost: CHARM[id].cost + priceBump(run), sold: false });
    }
    shop.goods = [];
    const taken = [];
    for (let i = 0; i < 3; i++) {
      const g = rollGood(run, rng, taken);
      taken.push(g.id);
      g.cost += priceBump(run);
      g.sold = false;
      shop.goods.push(g);
    }
  }

  function enterShop(run) {
    run.shop = { rerolls: 0, rerollCost: 2, charmSlots: 2 + (run.depth >= 4 ? 1 : 0), charms: [], goods: [] };
    run.phase = 'shop';
    stockShop(run, placeRng(run, 'shop'));
  }

  function rerollShop(run) {
    const s = run.shop;
    if (!s || run.gold < s.rerollCost) return false;
    run.gold -= s.rerollCost;
    s.rerolls += 1;
    s.rerollCost += 1;
    stockShop(run, new Stream(RM.hashStr(run.seed + ':reshop:' + run.depth + ':' + run.stage + ':' + s.rerolls)));
    return true;
  }

  // Can this shop item be bought right now? {ok, why}
  function canBuy(run, item) {
    if (!item || item.sold) return { ok: false, why: 'Sold' };
    if (run.gold < item.cost) return { ok: false, why: 'Not enough gold' };
    if (item.type === 'charm' && run.charms.length >= run.charmSlots) return { ok: false, why: 'Charm slots full' };
    if (item.type === 'trinket' && run.belt.length >= run.beltSlots) return { ok: false, why: 'Belt full' };
    if (item.type === 'potion' && run.hearts >= run.maxHearts) return { ok: false, why: 'Hearts full' };
    return { ok: true };
  }

  // Buys anything that doesn't need a die face picked. Stones go through
  // applyStone() instead, which charges only once you've chosen the face.
  function buy(run, item) {
    const c = canBuy(run, item);
    if (!c.ok || item.type === 'stone') return false;
    run.gold -= item.cost;
    item.sold = true;
    if (item.type === 'charm') run.charms.push(makeCharm(item.id));
    else if (item.type === 'trinket') run.belt.push(item.id);
    else if (item.type === 'tome') run.levels[item.combo] = (run.levels[item.combo] || 1) + 1;
    else if (item.type === 'potion') run.hearts = Math.min(run.maxHearts, run.hearts + 1);
    return true;
  }

  function sellValue(run, k) {
    const c = run.charms[k];
    return c ? Math.max(1, Math.floor(CHARM[c.id].cost / 2)) : 0;
  }
  function sellCharm(run, k) {
    if (k < 0 || k >= run.charms.length) return 0;
    const v = sellValue(run, k);
    run.charms.splice(k, 1);
    run.gold += v;
    return v;
  }
  function moveCharm(run, k, dir) {
    const j = k + dir;
    if (k < 0 || j < 0 || k >= run.charms.length || j >= run.charms.length) return false;
    const t = run.charms[k];
    run.charms[k] = run.charms[j];
    run.charms[j] = t;
    return true;
  }

  // Does stone `id` do anything to this face? (no point chiselling a 9)
  function stoneFits(id, face) {
    if (id === 'chisel') return face.v < 9;
    const s = STONE[id];
    if (s && s.glyph) return face.g !== s.glyph;
    return true;
  }

  // Applies a stone (or the Wild boon) to die `di` face `fi` (twin: from fi to fj).
  function etch(run, id, di, fi, fj) {
    const faces = run.dice[di];
    if (!faces || !faces[fi]) return false;
    if (id === 'chisel') {
      if (faces[fi].v >= 9) return false;
      faces[fi].v += 1;
    } else if (id === 'twin') {
      if (fj == null || fj === fi || !faces[fj]) return false;
      faces[fj] = { v: faces[fi].v, g: faces[fi].g };
    } else if (id === 'wild') {
      faces[fi].g = 'wild';
    } else {
      const s = STONE[id];
      if (!s || !s.glyph) return false;
      faces[fi].g = s.glyph;
    }
    return true;
  }
  function applyStone(run, item, di, fi, fj) {
    const c = canBuy(run, item);
    if (!c.ok || item.type !== 'stone') return false;
    if (!etch(run, item.id, di, fi, fj)) return false;
    run.gold -= item.cost;
    item.sold = true;
    return true;
  }

  // Charm effects that edit your dice after a win.
  function alchemy(run, rng) {
    const spots = [];
    run.dice.forEach((faces, di) => faces.forEach((f, fi) => { if (!f.g) spots.push([di, fi]); }));
    if (!spots.length) return null;
    const [di, fi] = rng.pick(spots);
    const g = rng.pick(['flame', 'flame', 'storm', 'storm', 'gold', 'lucky', 'loaded', 'prism', 'echo']);
    run.dice[di][fi].g = g;
    return 'die ' + (di + 1) + ' gained ' + GLYPHS[g].name;
  }
  function chisel(run, rng) {
    const di = rng.int(0, run.dice.length - 1);
    const faces = run.dice[di];
    let lo = 0;
    faces.forEach((f, i) => { if (f.v < faces[lo].v) lo = i; });
    if (faces[lo].v >= 9) return null;
    faces[lo].v += 1;
    return 'die ' + (di + 1) + ': a ' + (faces[lo].v - 1) + ' became a ' + faces[lo].v;
  }

  function leaveShop(run) {
    run.shop = null;
    advance(run);
  }

  function advance(run) {
    const res = run.result;
    run.result = null;
    if (res && res.retry) {
      // The Pipwyrm has to be beaten: go again, same Depth, full HP.
      startFight(run);
      return;
    }
    run.stage += 1;
    if (run.stage > 2) {
      run.stage = 0;
      run.depth += 1;
      planDepth(run);
    }
    startFight(run);
  }

  /* ---------------- boons ---------------- */
  function makeBoons(run) {
    const rng = placeRng(run, 'boon');
    const pool = BOONS.filter((b) => {
      if (b.minDepth && run.depth < b.minDepth) return false;
      if (b.max && (run.boonCount[b.id] || 0) >= b.max) return false;
      if (b.id === 'relic' && run.charms.length >= run.charmSlots) return false;
      if (b.id === 'die' && run.dice.length >= 6) return false;
      return true;
    });
    const picks = [];
    while (picks.length < 3 && pool.length) {
      const b = rng.weighted(pool, (x) => x.w);
      picks.push(b.id);
      pool.splice(pool.indexOf(b), 1);
    }
    run.boon = { choices: picks, relic: rollCharm(run, rng, [], 3) };
  }

  // Returns 'etch' when the boon needs a face picked first (Wild Spark).
  function chooseBoon(run, id, di, fi) {
    if (!run.boon || !run.boon.choices.includes(id)) return false;
    switch (id) {
      case 'reroll': run.bonus.rerolls += 1; break;
      case 'cast': run.bonus.casts += 1; break;
      case 'slot': run.charmSlots += 1; break;
      case 'belt': run.beltSlots += 1; break;
      case 'cash': run.gold += 15; break;
      case 'heal': run.maxHearts += 1; run.hearts = run.maxHearts; break;
      case 'study': {
        const top = Object.entries(run.stats.casts).sort((a, b) => b[1] - a[1]).slice(0, 2).map((e) => e[0]);
        if (!top.length) top.push('pair');
        if (top.length < 2) top.push(top[0] === 'pair' ? 'three' : 'pair');
        top.forEach((c) => { run.levels[c] = (run.levels[c] || 1) + 2; });
        run.boon.studied = top;
        break;
      }
      case 'relic':
        if (run.boon.relic && run.charms.length < run.charmSlots) run.charms.push(makeCharm(run.boon.relic));
        break;
      case 'wild':
        if (di == null) return 'etch';
        if (!etch(run, 'wild', di, fi)) return false;
        break;
      case 'die':
        run.dice.push([1, 2, 3, 4, 5, 6].map((v) => ({ v, g: null })));
        break;
      default: return false;
    }
    run.boonCount[id] = (run.boonCount[id] || 0) + 1;
    run.boon = null;
    enterShop(run);
    return true;
  }

  /* ---------------- trinkets ---------------- */
  function useTrinket(run, slot, a, b) {
    const f = run.fight;
    const id = run.belt[slot];
    if (!f || f.pending || !id) return false;
    const t = TRINKET[id];
    if (t.target && a == null) return false;
    const die = (i) => f.dice[i];
    switch (id) {
      case 'nudge': {
        const d = die(a);
        if (!d) return false;
        d.v = d.v >= 9 ? 1 : d.v + 1;
        break;
      }
      case 'flip': {
        const d = die(a);
        if (!d) return false;
        const faces = f.faces[d.src];
        const opp = 5 - d.f;
        d.f = opp;
        d.v = faces[opp].v;
        d.g = faces[opp].g;
        break;
      }
      case 'copy': {
        const s = die(a);
        const d = die(b);
        if (!s || !d || a === b) return false;
        d.v = s.v;
        d.g = s.g;
        break;
      }
      case 'sand': f.casts += 1; break;
      case 'bag': f.rerolls += 2; break;
      case 'scroll': f.scroll = 1; break;
      default: return false;
    }
    run.belt.splice(slot, 1);
    return true;
  }

  /* ---------------- odds and ends ---------------- */
  function glyphCount(run) {
    let n = 0;
    run.dice.forEach((faces) => faces.forEach((f) => { if (f.g) n++; }));
    return n;
  }
  function comboStats(run, id) {
    const c = COMBO[id];
    const l = run.levels[id] || 1;
    return { pips: c.pips + (l - 1) * c.lp, mult: c.mult + (l - 1) * c.lm, level: l };
  }
  // Short result for sharing: a square per fight, grouped by Depth, a
  // crown where the Pipwyrm fell and a skull if the run ended in defeat.
  function historyLine(run) {
    let out = '';
    run.history.forEach((h, i) => {
      out += h === 'W' ? '🟩' : '🟥';
      if (run.winAt === i + 1) out += '👑';
      if (i % 3 === 2) out += ' ';
    });
    if (run.died) out += '💀';
    return out.trim();
  }

  RM.rules = {
    newRun, startFight, newTurn, toggleHold, rerollCost, reroll, best, cast, afterCast,
    claimReward, goEndless, enterShop, rerollShop, canBuy, buy, sellValue, sellCharm, moveCharm,
    stoneFits, applyStone, etch, alchemy, chisel, leaveShop, makeBoons, chooseBoon, useTrinket,
    castsFor, rerollsFor, fightFaces, charmMods, hasCharm, areaFor, glyphCount, comboStats,
    historyLine, detect, evaluate, makeCharm, peekNextDepth,
  };
})(typeof window !== 'undefined' ? window.RM : globalThis.RM);
