/* Rollmancer — your save: settings, lifetime stats, unlocks, feats, daily
   results and the run in progress. In a browser it lives in localStorage;
   inside the Android app, window.AndroidHost stores it natively. */
(function (RM) {
  'use strict';

  const KEY = 'rollmancer-save-v1';

  /* ---------------- platform bridge ---------------- */
  const bridge = window.AndroidHost || null;
  const host = {
    native: !!bridge,
    load() {
      try {
        if (bridge) return bridge.loadSave() || null;
        return localStorage.getItem(KEY);
      } catch (e) { return null; }
    },
    write(json) {
      try {
        if (bridge) bridge.writeSave(json);
        else localStorage.setItem(KEY, json);
      } catch (e) { /* storage may be blocked (private mode) */ }
    },
    haptic(ms) {
      try {
        if (bridge && bridge.haptic) bridge.haptic(ms <= 8 ? 'tick' : ms <= 20 ? 'click' : 'heavy');
        else if (navigator.vibrate) navigator.vibrate(ms);
      } catch (e) { /* ignore */ }
    },
    // Share a line of text: the native share sheet in the app, the Web
    // Share API or the clipboard in a browser.
    share(text) {
      try {
        if (bridge && bridge.share) { bridge.share(text); return Promise.resolve('shared'); }
      } catch (e) { /* fall through */ }
      if (navigator.share) return navigator.share({ text }).then(() => 'shared', () => 'cancelled');
      if (navigator.clipboard) return navigator.clipboard.writeText(text).then(() => 'copied', () => 'failed');
      return Promise.resolve('failed');
    },
    overlay(open) {
      try { if (bridge && bridge.setOverlay) bridge.setOverlay(!!open); } catch (e) { /* ignore */ }
    },
  };

  function defaults() {
    return {
      v: 1,
      settings: { sound: true, music: true, haptics: true, speed: 1, motion: true, tips: true },
      runs: 0,
      wins: 0,
      fightsWon: 0,
      bestDepth: 0,
      bestCast: 0,
      bestCastCombo: null,
      bestGold: 0,
      bestHeatWon: -1,
      heatWon: {}, // per dice set: highest Heat won
      cast: {}, // lifetime casts per combo
      seenCharms: {},
      feats: {},
      flags: {},
      daily: {}, // date → {fights, depth, best, line, done}
      dailyDone: 0,
      setsWon: {},
      tutorial: 0,
      lastSet: 'apprentice',
      lastHeat: 0,
      run: null,
    };
  }

  let P = null;

  function load() {
    const raw = host.load();
    let p = null;
    try { p = raw ? JSON.parse(raw) : null; } catch (e) { p = null; }
    P = Object.assign(defaults(), p || {});
    P.settings = Object.assign(defaults().settings, (p && p.settings) || {});
    return P;
  }

  let saveTimer = null;
  function save(now) {
    if (!P) return;
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    const go = () => host.write(JSON.stringify(P));
    if (now) go();
    else saveTimer = setTimeout(go, 120);
  }

  /* ---------------- unlocks & feats ---------------- */
  function setUnlocked(id) {
    const s = RM.DICE_SET[id];
    return !s.unlock || s.unlock.test(P);
  }
  function maxHeat(setId) {
    const w = P.heatWon[setId];
    return Math.min(8, w == null ? 0 : w + 1);
  }

  // Checks every feat and set unlock; returns the newly earned ones.
  function checkUnlocks() {
    const out = [];
    RM.FEATS.forEach((f) => {
      if (!P.feats[f.id] && f.test(P)) {
        P.feats[f.id] = Date.now();
        out.push({ kind: 'feat', name: f.name, icon: f.icon, text: f.text });
      }
    });
    RM.DICE_SETS.forEach((s) => {
      if (!s.unlock) return;
      const k = 'set:' + s.id;
      if (!P.flags[k] && s.unlock.test(P)) {
        P.flags[k] = 1;
        out.push({ kind: 'set', name: s.name, icon: '🎲', text: 'New dice set unlocked' });
      }
    });
    return out;
  }

  /* ---------------- recording a run as it goes ---------------- */
  function noteCast(r) {
    P.cast[r.combo] = (P.cast[r.combo] || 0) + 1;
    if (r.dmg > P.bestCast) { P.bestCast = r.dmg; P.bestCastCombo = r.combo; }
  }
  function noteRun(run) {
    P.bestDepth = Math.max(P.bestDepth, run.depth);
    P.bestGold = Math.max(P.bestGold, run.gold, run.stats.maxGold || 0);
    run.charms.forEach((c) => { P.seenCharms[c.id] = 1; });
    if (run.charms.length >= run.charmSlots) P.flags.fullCharms = 1;
    if (run.stats.bossOneShot) P.flags.oneShotBoss = 1;
    if (run.stats.clutch) P.flags.clutch = 1;
    if (RM.rules.glyphCount(run) >= 10) P.flags.glyph10 = 1;
  }
  function noteSeen(ids) {
    ids.forEach((id) => { P.seenCharms[id] = 1; });
  }
  function noteFightWon() {
    P.fightsWon += 1;
  }
  // Beat the Pipwyrm: counted once, the moment it happens.
  function recordWin(run) {
    if (run.winRecorded) return;
    run.winRecorded = true;
    P.wins += 1;
    if (!run.daily) {
      const prev = P.heatWon[run.set];
      if (prev == null || run.heat > prev) P.heatWon[run.set] = run.heat;
      P.bestHeatWon = Math.max(P.bestHeatWon, run.heat);
    }
    P.setsWon[run.set] = 1;
    save();
  }
  // The run ended (lost, quit, or stopped after winning).
  function finishRun(run, how) {
    noteRun(run);
    if (run.daily) {
      const d = P.daily[run.daily] || {};
      const fights = run.stats.fightsWon;
      if (!d.done || fights > d.fights || (fights === d.fights && run.stats.bestCast > d.best)) {
        Object.assign(d, { fights, depth: run.depth, best: run.stats.bestCast, line: RM.rules.historyLine(run), won: run.won });
      }
      if (!d.done) P.dailyDone += 1;
      d.done = true;
      P.daily[run.daily] = d;
    }
    P.run = null;
    save(true);
    return how;
  }

  RM.profile = {
    host, load, save, get: () => P, setUnlocked, maxHeat, checkUnlocks,
    noteCast, noteRun, noteSeen, noteFightWon, recordWin, finishRun,
  };
})(window.RM);
