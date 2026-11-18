/* Rollmancer — game flow: screens, the run's life cycle, player actions
   (hold, reroll, cast, trinkets, shop, boons), saving, first-run tips and
   the Android back button. */
(function (RM) {
  'use strict';

  RM.VERSION = '1.2.0';
  const $ = (id) => document.getElementById(id);
  const R = RM.rules;
  const ui = RM.ui;
  const B = RM.battle;
  const A = RM.audio;
  const P = () => RM.profile.get();

  const G = {
    run: null,
    screen: null,
    targeting: null,
  };
  RM.game = G;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function haptic(ms) {
    if (P().settings.haptics) RM.profile.host.haptic(ms);
  }

  /* ---------------- screens ---------------- */
  function show(name) {
    ['title', 'setup', 'battle', 'shop'].forEach((s) => { $(s).hidden = s !== name; });
    G.screen = name;
    ui.hideTip();
    if (name === 'battle') B.setMode('battle');
    else if (name === 'shop') B.setMode('shop');
    else B.setMode('title');
  }

  function save() {
    if (G.run && G.run.phase !== 'over') P().run = G.run;
    RM.profile.save();
  }
  G.save = save;

  G.toTitle = function () {
    ui.closeSheet(true);
    if (G.run && G.run.phase !== 'over') P().run = G.run;
    G.run = null;
    RM.profile.save(true);
    B.area = RM.AREAS[(Math.random() * 4) | 0];
    B.pickTitleMonster();
    show('title');
    ui.renderTitle();
    A.playMusic(0, false);
  };

  G.toSetup = function (set, heat, seedCode) {
    if (P().run) {
      ui.confirm('Start a new run?', 'Your run in progress will be abandoned.', 'New run', () => {
        abandonSaved();
        G.toSetup(set, heat, seedCode);
      });
      return;
    }
    G.run = null;
    show('setup');
    ui.renderSetup(set, heat);
    ui.setSeed(seedCode || '');
  };

  G.startTrial = function (id, seed) {
    if (P().run) {
      ui.confirm('Start the ' + RM.TRIAL[id].name + ' trial?', 'Your run in progress will be abandoned.', 'Start trial', () => {
        abandonSaved();
        G.startTrial(id, seed);
      });
      return;
    }
    G.startRun({ set: 'apprentice', heat: 0, trial: id, seed: seed == null ? null : seed });
  };

  function abandonSaved() {
    const r = P().run;
    if (!r) return;
    r.phase = 'over';
    RM.profile.finishRun(r, 'abandon');
  }

  /* ---------------- starting and resuming ---------------- */
  G.startRun = function (opts) {
    const p = P();
    p.runs += 1;
    if (!opts.daily && !opts.trial) {
      p.lastSet = opts.set;
      p.lastHeat = opts.heat;
    }
    // The Daily Run uses every charm so it's the same for everyone; other
    // runs only offer the charms you've unlocked.
    if (!opts.daily && !opts.pool) opts = Object.assign({}, opts, { pool: RM.profile.unlockedCharms() });
    G.run = R.newRun(opts);
    RM.profile.noteSeen(G.run.charms.map((c) => c.id));
    p.run = G.run;
    RM.profile.save(true);
    route();
  };

  G.startDaily = function () {
    const key = RM.todayKey();
    const p = P();
    if (p.run && p.run.daily === key) { G.continueRun(); return; }
    const go = (ranked) => {
      const seed = RM.hashStr('rollmancer-daily-' + key);
      const set = RM.DICE_SETS[seed % RM.DICE_SETS.length].id;
      G.startRun({ seed, set, heat: 1, daily: ranked ? key : null });
    };
    const begin = () => {
      const d = p.daily[key];
      if (d && d.done) {
        const body = ui.sheet('<h2>Daily #' + RM.dailyNumber() + '</h2><p class="center">Today\'s result</p><div class="history">' + (d.line || '') + '</div>' +
          '<p class="center muted">' + d.fights + ' fights won · Depth ' + d.depth + ' · best cast ' + RM.fmt(d.best) + '</p>' +
          '<p class="center muted" style="font-size:13px">A new Daily arrives at midnight. You can replay today\'s for practice; only your first run counts.</p>' +
          '<div class="btns"><button class="btn gold" data-act="share">Share result</button><button class="btn" data-act="again">Practice run</button><button class="btn ghost" data-act="close">Close</button></div>', { center: true });
        body.querySelector('[data-act="share"]').onclick = () => {
          const text = 'Rollmancer Daily #' + RM.dailyNumber() + '\n' + (d.line || '') + '\nDepth ' + d.depth + ' · ' + d.fights + ' fights · best cast ' + RM.fmt(d.best);
          ui.shareText(text);
        };
        body.querySelector('[data-act="again"]').onclick = () => { ui.closeSheet(true); go(false); };
        body.querySelector('[data-act="close"]').onclick = () => ui.closeSheet();
        return;
      }
      const seed = RM.hashStr('rollmancer-daily-' + key);
      const set = RM.DICE_SETS[seed % RM.DICE_SETS.length];
      const body = ui.sheet('<h2>Daily #' + RM.dailyNumber() + '</h2><p class="center">Everyone gets the same dice, monsters and shops today.</p>' +
        '<p class="center"><span class="k">' + RM.escapeHtml(set.name) + '</span> · Heat 1</p><p class="center muted">' + ui.rich(set.text) + '</p>' +
        '<p class="center muted" style="font-size:13px">Your first run of the day is the one that counts.</p>' +
        '<div class="btns"><button class="btn big gold" data-act="go">Begin</button><button class="btn ghost" data-act="close">Not now</button></div>', { center: true });
      body.querySelector('[data-act="go"]').onclick = () => { ui.closeSheet(true); go(true); };
      body.querySelector('[data-act="close"]').onclick = () => ui.closeSheet();
    };
    if (p.run) {
      ui.confirm('Start the Daily?', 'Your run in progress will be abandoned.', 'Start Daily', () => { abandonSaved(); begin(); });
    } else begin();
  };

  G.continueRun = function () {
    const r = P().run;
    if (!r) return;
    G.run = r;
    route();
  };

  // Shows whatever the run is in the middle of.
  function route() {
    const run = G.run;
    ui.closeSheet(true);
    switch (run.phase) {
      case 'fight':
        if (run.fight && run.fight.pending) {
          // Closed mid-cast: settle it now.
          const res = R.afterCast(run);
          save();
          if (res && res.phase !== 'fight') { route(); return; }
        }
        enterBattle(true);
        break;
      case 'reward':
        show(null);
        ui.showReward();
        break;
      case 'boon':
        show(null);
        ui.showBoon();
        break;
      case 'event':
        show(null);
        ui.showEvent();
        break;
      case 'shop':
        enterShop();
        break;
      case 'victory':
        show(null);
        ui.showVictory();
        break;
      default:
        G.endRun();
    }
  }

  /* ---------------- battle ---------------- */
  function enterBattle(fresh) {
    const run = G.run;
    show('battle');
    B.area = R.areaFor(run.depth);
    B.setMonster(run.fight.mon, true);
    ui.renderBattle();
    ui.readout(null);
    requestAnimationFrame(() => {
      B.layout();
      B.syncDice(run, true);
      afterRoll();
    });
    const areaIdx = RM.AREAS.indexOf(B.area);
    A.playMusic(areaIdx, run.fight.mon.boss);
    if (run.fight.mon.boss && fresh) setTimeout(() => B.bossIntro(), 300);
    save();
  }

  // Wait for the dice to land, then show the preview (and tips).
  async function afterRoll() {
    G.rollingWait = true;
    let n = 0;
    while (B.rolling() && n++ < 100) await sleep(40);
    G.rollingWait = false;
    if (!G.run || !G.run.fight) return;
    ui.preview();
    ui.buttons();
    coach();
  }

  G.tapDie = function (i) {
    const run = G.run;
    if (!run || !run.fight || B.busy || B.rolling()) return;
    B.lookX = B.dice[i] ? B.dice[i].x : null;
    if (G.targeting) { pickTarget(i); return; }
    if (i === run.fight.frozen) { A.deny(); haptic(20); ui.toast('🧊', 'That die is frozen this turn'); return; }
    if (R.toggleHold(run, i)) {
      A.hold(run.fight.dice[i].held);
      haptic(8);
      B.syncDice(run, false);
      ui.buttons();
      save();
    }
  };

  G.reroll = function () {
    const run = G.run;
    if (!run || B.busy || B.rolling() || G.targeting) return;
    const changed = R.reroll(run);
    if (!changed) { A.deny(); return; }
    haptic(12);
    ui.gold(run);
    B.syncDice(run, true, changed);
    ui.readout(null);
    ui.buttons();
    save();
    afterRoll();
  };

  G.cast = async function () {
    const run = G.run;
    if (!run || !run.fight || B.busy || B.rolling() || G.targeting) return;
    ui.hideTip();
    B.busy = true;
    ui.buttons();
    haptic(18);
    const r = R.cast(run);
    RM.profile.noteCast(r);
    save();
    // un-hold everything visually; the dice stay where they are for the show
    B.dice.forEach((d) => { d.held = false; });
    try {
      await B.playCast(run, r, ui);
    } catch (e) { /* never let an animation hiccup freeze the game */ }
    ui.gold(run);
    ui.charmRow($('charms'), run);
    const res = R.afterCast(run);
    save();
    if (res.phase === 'fight') {
      B.busy = false;
      ui.renderBattle();
      B.syncDice(run, true);
      ui.readout(null);
      afterRoll();
      return;
    }
    if (run.result && run.result.won) {
      B.killMonster();
      B.coinsTo($('gold'), run.result.total);
      haptic(30);
      RM.profile.noteFightWon();
      RM.profile.noteRun(run);
      await sleep(1100);
      A.win();
      ui.gold(run);
      ui.unlocks(RM.profile.checkUnlocks());
      RM.profile.save();
      B.busy = false;
      ui.showReward();
    } else {
      B.lunge();
      A.heart();
      haptic(60);
      await sleep(500);
      ui.hearts(run, true);
      await sleep(700);
      A.lose();
      B.busy = false;
      if (run.phase === 'over') G.endRun();
      else ui.showReward();
    }
  };

  /* ---------------- trinkets ---------------- */
  G.startTrinket = function (slot) {
    const run = G.run;
    const id = run.belt[slot];
    const t = RM.TRINKET[id];
    if (!t || B.busy || !run.fight) return;
    if (!t.target) {
      if (R.useTrinket(run, slot)) {
        A.trinket();
        haptic(14);
        ui.toast(t.icon, t.name + ' used');
        ui.renderBattle();
        ui.preview();
        save();
      }
      return;
    }
    G.targeting = { slot, picks: [], need: t.target };
    B.dice.forEach((d) => { d.target = true; });
    ui.prompt(t.target === 2 ? 'Tap the die to {k:copy from}' : 'Tap a die to use {k:' + t.name + '} on');
    ui.belt();
  };
  function pickTarget(i) {
    const run = G.run;
    const T = G.targeting;
    if (T.need === 2 && T.picks.length === 1 && T.picks[0] === i) return;
    T.picks.push(i);
    A.tap();
    if (T.picks.length < T.need) {
      ui.prompt('Now tap the die to {k:change}');
      return;
    }
    const t = RM.TRINKET[run.belt[T.slot]];
    const ok = R.useTrinket(run, T.slot, T.picks[0], T.picks[1]);
    cancelTargeting();
    if (ok) {
      A.trinket();
      haptic(14);
      const d = B.dice[T.need === 2 ? T.picks[1] : T.picks[0]];
      if (d) {
        d.pop = 1;
        RM.fx.burst(d.x, d.y, 14, { color: ['#ffe39a', '#ffffff'], speed: 160, life: 0.5, kind: 'star', gravity: 0 });
      }
      B.syncDice(run, false);
      ui.renderBattle();
      ui.preview();
      ui.toast(t.icon, t.name + ' used');
      save();
    } else A.deny();
  }
  function cancelTargeting() {
    G.targeting = null;
    B.dice.forEach((d) => { d.target = false; });
    ui.prompt(null);
    if (G.run && G.run.fight) ui.belt();
  }

  /* ---------------- after a fight ---------------- */
  G.claimReward = function () {
    const run = G.run;
    R.claimReward(run);
    save();
    if (run.phase === 'boon') { show(null); ui.showBoon(); }
    else if (run.phase === 'event') { show(null); A.whoosh(); ui.showEvent(); }
    else if (run.phase === 'victory') {
      RM.profile.recordWin(run);
      ui.unlocks(RM.profile.checkUnlocks());
      A.win();
      show(null);
      ui.showVictory();
    } else enterShop();
  };

  G.chooseBoon = function (id) {
    const run = G.run;
    const r = R.chooseBoon(run, id);
    if (r === 'etch') { ui.showEtch({ kind: 'boon', id }); return; }
    if (id === 'relic') RM.profile.noteSeen(run.charms.map((c) => c.id));
    G.afterBoon();
  };
  G.afterBoon = function () {
    save();
    enterShop();
  };

  /* ---------------- encounters ---------------- */
  G.eventChoose = function (k, arg) {
    const run = G.run;
    const res = R.chooseEvent(run, k, arg);
    if (!res) { A.deny(); ui.showEvent(); return; }
    if (res.need) {
      const back = () => ui.showEvent();
      const opt = R.eventOptions(run)[k];
      if (res.need === 'die') ui.pickDie('Pick a die', opt.text, (di) => G.eventChoose(k, di), back);
      else if (res.need === 'combo') ui.pickCombo('Pick a combo', opt.text, (id) => G.eventChoose(k, id), back);
      else if (res.need === 'charm') ui.pickCharm('Pick a charm', opt.text, (ck) => G.eventChoose(k, ck), back, (ck) => '$' + RM.CHARM[run.charms[ck].id].cost);
      else ui.showEtch({ kind: 'event', stone: res.stone, k });
      return;
    }
    if (res.charm) { RM.profile.noteSeen([res.charm]); A.level(); }
    else if (res.die) A.clack(0);
    else A.etch();
    haptic(14);
    save();
    ui.showEventResult();
  };
  G.leaveEvent = function () {
    R.leaveEvent(G.run);
    save();
    enterShop();
  };

  G.goEndless = function () {
    R.goEndless(G.run);
    save();
    show(null);
    ui.showBoon();
  };

  function enterShop() {
    show('shop');
    ui.renderShop();
    ui.drawMerchant();
    A.playMusic(1, false);
    RM.profile.noteSeen(G.run.shop.charms.map((c) => c.id));
    save();
    coach();
  }

  G.leaveShop = function () {
    const run = G.run;
    R.leaveShop(run);
    save();
    enterBattle(true);
  };

  G.endRun = function () {
    const run = G.run;
    if (!run) return;
    run.phase = 'over';
    RM.profile.finishRun(run, run.won ? 'won' : 'lost');
    ui.unlocks(RM.profile.checkUnlocks());
    RM.profile.save(true);
    if (G.screen !== 'battle') show(null);
    ui.showOver({ run });
  };

  G.abandon = function () {
    if (!G.run) return;
    G.endRun();
  };

  // Something in the run changed outside a fight action: redraw and save.
  G.changed = function () {
    const run = G.run;
    if (!run) return;
    if (G.screen === 'shop') ui.renderShop();
    else if (G.screen === 'battle' && run.fight) {
      ui.renderBattle();
      B.syncDice(run, false);
      ui.preview();
    }
    ui.gold(run);
    save();
  };

  /* ---------------- settings ---------------- */
  G.applySettings = function () {
    const s = P().settings;
    A.setOpts({ sound: s.sound, music: s.music });
    RM.fx.scale = s.motion ? 1 : 0.3;
    RM.art.skin = RM.profile.skinUnlocked(s.skin) ? s.skin : 'classic';
    RM.profile.save();
  };
  G.resetAll = function () {
    try { localStorage.clear(); } catch (e) { /* ignore */ }
    RM.profile.host.write('');
    location.reload();
  };

  /* ---------------- first-run coach marks ---------------- */
  const TIPS = [
    { when: 'battle', el: 'tray', dir: 'down', text: 'These are your dice. {k:Tap a die to hold it}: held dice stay put when you reroll.' },
    { when: 'battle', el: 'btn-reroll', dir: 'down', text: '{k:Reroll} throws every die you didn\'t hold. Rerolls are shared across the whole fight.' },
    { when: 'battle', el: 'readout', dir: 'down', text: 'This shows what a Cast would do right now: your best combo, {p:Pips} × {m:Mult} = damage.' },
    { when: 'battle', el: 'btn-cast', dir: 'down', text: 'Tap {k:Cast} to attack. Bring the monster down before your Casts run out!' },
    { when: 'shop', el: 'shop-charms', dir: 'up', text: '{k:Charms} bend the rules for the rest of the run. {k:Stones} etch glyphs onto your dice, and {k:tomes} level up a combo.' },
    { when: 'boss', el: 'mon-tags', dir: 'up', text: 'Each {k:boss} has a rule that works against you. Plan around it!' },
  ];
  function coach() {
    const p = P();
    if (!p.settings.tips) return;
    let k = p.tutorial || 0;
    if (k >= TIPS.length) return;
    let tip = TIPS[k];
    if (tip.when === 'boss') {
      if (!(G.screen === 'battle' && G.run.fight && G.run.fight.mon.boss)) return;
    } else if (tip.when !== G.screen) return;
    if (B.busy) return;
    const el = $(tip.el);
    if (!el || el.offsetParent === null) return;
    ui.tip(tip.text, el, tip.dir, () => {
      p.tutorial = k + 1;
      RM.profile.save();
      const next = TIPS[k + 1];
      if (next && next.when === tip.when) setTimeout(coach, 150);
    });
  }

  /* ---------------- Android back button & lifecycle ---------------- */
  RM.onBack = function () {
    if (!$('tip').hidden) { ui.hideTip(); return true; }
    if (G.targeting) { cancelTargeting(); return true; }
    if (ui.sheetOpen()) { ui.closeSheet(); return true; }
    if (G.screen === 'battle') { if (!B.busy) ui.showPause(); return true; }
    if (G.screen === 'setup') { G.toTitle(); return true; }
    if (G.screen === 'shop') { ui.showPause(); return true; }
    return false;
  };
  RM.onPause = function () {
    RM.profile.save(true);
    A.stopMusic();
  };
  RM.onResume = function () {
    if (!G.run) A.playMusic(0, false);
    else if (G.screen === 'battle' && G.run.fight) A.playMusic(RM.AREAS.indexOf(B.area), G.run.fight.mon.boss);
    else A.playMusic(1, false);
  };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) RM.onPause();
    else RM.onResume();
  });

  /* ---------------- boot ---------------- */
  function boot() {
    RM.profile.load();
    G.applySettings();
    B.init();
    B.onTap = (i) => G.tapDie(i);
    B.onLongPress = (i) => {
      if (!G.run || !G.run.fight || G.targeting) return;
      haptic(10);
      A.tap();
      ui.showDieFaces(i);
    };
    B.pickTitleMonster();

    const unlock = () => {
      A.unlock();
      if (!G.musicStarted) {
        G.musicStarted = true;
        RM.onResume();
      }
    };
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });

    const click = (id, fn) => $(id).addEventListener('click', () => { A.tap(); fn(); });
    click('btn-continue', () => G.continueRun());
    click('btn-new', () => G.toSetup());
    click('btn-daily', () => G.startDaily());
    click('btn-codex', () => ui.showCodex());
    click('btn-trials', () => ui.showTrials());
    click('btn-howto', () => ui.showHowTo());
    click('btn-settings', () => ui.showSettings());
    document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => { A.tap(); G.toTitle(); }));
    click('btn-start', () => {
      const s = ui.setupState();
      const code = $('seed-in').value.trim();
      let seed = null;
      if (code) {
        seed = RM.parseSeedCode(code);
        if (seed == null) { ui.toast('⚠️', 'That seed should look like {k:K7Q-2MX}'); return; }
      }
      $('seed-in').value = '';
      G.startRun({ set: s.set, heat: s.heat, seed });
    });
    $('btn-reroll').addEventListener('click', () => G.reroll());
    $('btn-cast').addEventListener('click', () => G.cast());
    click('btn-pause', () => { if (!B.busy) ui.showPause(); });
    click('depth', () => { if (!B.busy) ui.showMap(); });
    click('btn-leave', () => G.leaveShop());
    click('btn-reshop', () => {
      if (R.rerollShop(G.run)) { A.buy(); RM.profile.noteSeen(G.run.shop.charms.map((c) => c.id)); ui.renderShop(); save(); } else A.deny();
    });
    click('btn-dice', () => ui.showDice());
    click('btn-combos', () => ui.showCombos());
    $('mon-tags').addEventListener('click', () => {
      const f = G.run && G.run.fight;
      if (!f) return;
      ui.showMap();
    });

    // Keyboard (desktop): 1–6 hold, R reroll, Space/Enter cast, Esc menu.
    window.addEventListener('keydown', (e) => {
      if (e.target && e.target.tagName === 'INPUT') return;
      if (e.key === 'Escape') { if (!RM.onBack()) G.toTitle(); return; }
      if (G.screen !== 'battle' || ui.sheetOpen()) return;
      if (/^[1-7]$/.test(e.key)) G.tapDie(+e.key - 1);
      else if (e.key === 'r' || e.key === 'R') G.reroll();
      else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); G.cast(); }
    });

    show('title');
    ui.renderTitle();

    if ('serviceWorker' in navigator && location.protocol === 'https:' && !RM.profile.host.native) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  boot();
})(window.RM);
