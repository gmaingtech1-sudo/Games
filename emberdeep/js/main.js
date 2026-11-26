/* Emberdeep — the controller. Owns the save, runs the main loop, catches
   up on time away, and carries out everything the player asks for: buying,
   skills, rekindling, wisps, daily rewards and the moonstone shop. */
(function (ED) {
  'use strict';

  const U = ED.util;
  const D = ED.data;
  const E = ED.econ;
  const ST = ED.state;
  const A = ED.audio;
  const bus = ED.bus;

  const AWAY_MIN = 20;        // seconds away before we fast-forward
  const SUMMARY_MIN = 90;     // seconds away before we show what happened

  const game = {
    S: ST.load(Date.now()),
    buyMode: '1',
  };
  ED.game = game;

  /* ---------- Helpers ---------- */

  game.haptic = (pattern) => {
    if (!game.S.settings.vibe || !navigator.vibrate) return;
    try { navigator.vibrate(pattern); } catch (e) { /* ignore */ }
  };

  game.stats = () => ST.stats(game.S, ST.buffMult(game.S, Date.now()));

  // Gold a second from your heroes alone at the current floor.
  game.idleRate = () => {
    const S = game.S;
    const st = game.stats();
    const dps = st.party + st.autoTaps * st.tapAvg;
    return ED.sim.estRate(S, st, dps, st.goldMult);
  };

  // What gold actually came in, averaged over the last fifteen seconds.
  const ring = [];
  let ringT = 0;
  game.goldRate = () => {
    if (ring.length < 2) return game.idleRate();
    const a = ring[0];
    const b = ring[ring.length - 1];
    const dt = (b.t - a.t) / 1000;
    return dt > 0 ? Math.max(0, (b.g - a.g) / dt) : 0;
  };
  function sampleGold(now) {
    if (now - ringT < 1000) return;
    ringT = now;
    ring.push({ t: now, g: game.S.stats.goldTotal });
    while (ring.length > 16) ring.shift();
  }
  function resetRate() {
    ring.length = 0;
  }

  /* ---------- Buying ---------- */

  // How many levels the current buy mode means for a hero at level L.
  game.levelsFor = (h, L) => {
    const m = game.buyMode;
    if (!L) return 1;
    if (m === 'next') return E.nextMilestone(L) - L;
    if (m === 'max') return Math.max(1, E.heroAfford(h, L, game.S.gold));
    return Number(m);
  };
  game.torchLevelsFor = (L) => {
    const m = game.buyMode;
    if (m === 'next') return 25 - (L % 25);
    if (m === 'max') return Math.max(1, E.torchAfford(L, game.S.gold));
    return Number(m);
  };

  game.buyHero = (id) => {
    const S = game.S;
    const h = D.hero(id);
    const L = S.heroes[id] || 0;
    const n = game.levelsFor(h, L);
    if (!ST.buyHero(S, id, n)) {
      A.play('deny');
      return false;
    }
    const to = L + n;
    if (!L) {
      A.play('levelup');
      ED.battle.placeHeroes();
      ED.ui.toast(`${h.name} the ${h.cls} joins the party!`, 'hero');
    } else {
      const crossed = Math.floor(to / 25) > Math.floor(L / 25) || (L < 10 && to >= 10);
      A.play(crossed ? 'levelup' : 'buy');
      for (const p of h.perks) {
        if (L < p.lv && to >= p.lv) ED.ui.toast(`${h.name} learned ${ED.ui.perkText(p)}`, 'perk');
      }
    }
    game.haptic(8);
    return true;
  };

  game.buyTorch = () => {
    const S = game.S;
    const n = game.torchLevelsFor(S.torch);
    if (!ST.buyTorch(S, n)) {
      A.play('deny');
      return false;
    }
    A.play(Math.floor((S.torch) / 25) > Math.floor((S.torch - n) / 25) ? 'levelup' : 'buy');
    game.haptic(8);
    return true;
  };

  game.buyTalent = (id) => {
    if (!ST.buyTalent(game.S, id)) {
      A.play('deny');
      return false;
    }
    A.play('levelup');
    game.haptic(10);
    if (id === 'quarter') ED.ui.toast('The Quartermaster will level your heroes from now on.', 'perk');
    return true;
  };

  /* ---------- Skills ---------- */

  game.skillState = (sk, now) => {
    const S = game.S;
    const rec = S.skills[sk.id] || { ready: 0, until: 0 };
    return {
      unlocked: ST.skillUnlocked(S, sk),
      ready: now >= rec.ready,
      cdLeft: Math.max(0, (rec.ready - now) / 1000),
      cdTotal: rec.cast ? Math.max(1, (rec.ready - rec.cast) / 1000) : sk.cd,
      activeLeft: Math.max(0, (rec.until - now) / 1000),
    };
  };

  game.cast = (id, auto) => {
    const S = game.S;
    const sk = D.skill(id);
    const now = Date.now();
    const ss = game.skillState(sk, now);
    if (!ss.unlocked || !ss.ready) {
      if (!auto) A.play('deny');
      return false;
    }
    const st = game.stats();
    const dur = sk.dur * st.durMult * 1000;
    S.skills[id] = { cast: now, ready: now + sk.cd * st.cdMult * 1000, until: now + dur };
    if (sk.dur) S.buffs[id] = now + dur;
    A.play('skill');
    game.haptic(15);
    ED.battle.skillFx(id);
    if (id === 'glass') {
      A.play('warp');
      game.away(st.glassSec, 'glass');
    } else if (!auto) {
      ED.ui.toast(`${sk.name}! ${sk.short}${sk.dur ? ` for ${Math.round(sk.dur * st.durMult)}s` : ''}`, 'skill');
    }
    return true;
  };

  /* ---------- Wisps ---------- */

  game.wispReward = () => {
    const S = game.S;
    const now = Date.now();
    const r = Math.random();
    if (r < 0.55) {
      const gold = Math.max(E.mobGold(S.floor) * 12, game.idleRate() * 120) * (1 + Math.random());
      ST.earn(S, gold);
      A.play('gold');
      return { kind: 'gold', text: `+${U.fmt(gold)} gold` };
    }
    if (r < 0.75) {
      S.buffs.wisp = now + 30000;
      return { kind: 'buff', text: 'Wisp-light! Heroes ×3 damage for 30s' };
    }
    if (r < 0.9) {
      let any = false;
      for (const sk of D.SKILLS) {
        const rec = S.skills[sk.id];
        if (rec && rec.ready > now && sk.id !== 'glass') {
          rec.ready = now;
          any = true;
        }
      }
      if (any) return { kind: 'skills', text: 'Your skills are ready again!' };
    }
    const moon = 4 + Math.floor(Math.random() * 9);
    S.moon += moon;
    return { kind: 'moon', text: `+${moon} moonstones` };
  };

  /* ---------- Time away ---------- */

  // Fast-forward `sec` seconds (capped at how long your heroes keep going
  // without you) and show what happened. why: 'away' | 'glass' | 'flask' | 'daily'
  game.away = (sec, why) => {
    const S = game.S;
    const st = ST.stats(S);
    const capped = why === 'away' && sec > st.offlineCap;
    const use = why === 'away' ? Math.min(sec, st.offlineCap) : sec;
    if (use <= 0) return null;
    const from = { floor: S.floor, best: S.bestFloorRun, gold: S.gold, levels: ST.totalLevels(S) };
    const t0 = performance.now();
    const sum = ED.sim.run(S, use, { afk: true, now: why === 'away' ? S.lastSeen : Date.now() });
    sum.ms = performance.now() - t0;
    sum.why = why;
    sum.away = sec;
    sum.capped = capped;
    sum.cap = st.offlineCap;
    sum.from = from;
    if (why === 'away') S.stats.afkSec += use;
    S.lastSeen = Date.now();
    resetRate();
    ED.battle.reset();
    ED.ui.refresh();
    if (why !== 'away' || sec >= SUMMARY_MIN) ED.ui.showAway(sum);
    save();
    return sum;
  };

  /* ---------- Rekindling ---------- */

  game.rekindle = () => {
    const S = game.S;
    const gain = ST.rekindle(S, Date.now());
    if (!gain) return 0;
    A.play('rekindle');
    game.haptic([30, 60, 30, 60, 60]);
    resetRate();
    ED.battle.reset();
    ED.ui.flare();
    ED.ui.refresh();
    save();
    return gain;
  };

  game.challenge = () => {
    const S = game.S;
    if (!S.farming) return;
    ST.challenge(S, ST.stats(S));
    A.play('click');
  };

  /* ---------- Daily reward & shop ---------- */

  game.dailyReady = () => game.S.daily.last !== U.dayKey(Date.now());

  game.claimDaily = () => {
    const S = game.S;
    if (!game.dailyReady()) return null;
    const d = D.DAILY[S.daily.step % D.DAILY.length];
    S.daily.last = U.dayKey(Date.now());
    S.daily.step += 1;
    A.play('claim');
    return grant(d.kind, d.n, 'daily');
  };

  function grant(kind, n, why) {
    const S = game.S;
    switch (kind) {
      case 'moon':
        S.moon += n;
        ED.ui.toast(`+${n} moonstones`, 'moon');
        return true;
      case 'gold': {
        const gold = Math.max(E.mobGold(S.floor) * 20, game.idleRate() * 60 * n);
        ST.earn(S, gold);
        A.play('gold');
        ED.ui.toast(`+${U.fmt(gold)} gold`, 'gold');
        return true;
      }
      case 'time':
        game.away(n, why);
        return true;
      case 'chest': {
        const r = ST.grantRelic(S);
        ED.ui.showRelics([r], why);
        return true;
      }
    }
    return false;
  }

  game.shop = (id) => {
    const S = game.S;
    const item = D.SHOP.find((x) => x.id === id);
    if (!item || S.moon < item.cost) {
      A.play('deny');
      return false;
    }
    const now = Date.now();
    if (id === 'refresh' && !D.SKILLS.some((sk) => S.skills[sk.id] && S.skills[sk.id].ready > now)) {
      ED.ui.toast('Your skills are all ready already.');
      return false;
    }
    S.moon -= item.cost;
    if (id === 'chest') grant('chest', 1, 'shop');
    else if (id === 'flask') game.away(7200, 'flask');
    else if (id === 'banner') {
      S.buffs.banner = Math.max(now, S.buffs.banner || 0) + 3600 * 1000;
      A.play('gold');
      ED.ui.toast('Gilded Banner raised: double gold for an hour.', 'gold');
    } else if (id === 'refresh') {
      for (const sk of D.SKILLS) if (S.skills[sk.id]) S.skills[sk.id].ready = now;
      A.play('skill');
      ED.ui.toast('Every skill is ready.', 'skill');
    }
    save();
    return true;
  };

  game.claimFeat = (id) => {
    const moon = ST.claimFeat(game.S, id);
    if (moon) {
      A.play('claim');
      game.haptic(10);
    }
    return moon;
  };

  /* ---------- Saving ---------- */

  function save() {
    game.S.lastSeen = Date.now();
    ST.save(game.S);
  }
  game.save = save;

  game.replace = (S2) => {
    game.S = S2;
    ST.invalidate();
    applySettings();
    resetRate();
    ED.battle.reset();
    ED.ui.refresh();
    save();
  };

  game.wipe = () => {
    ST.wipe();
    game.replace(ST.defaults(Date.now()));
  };

  function applySettings() {
    const s = game.S.settings;
    U.setNotation(s.notation);
    A.setSound(s.sound);
    A.setMusic(s.music);
  }
  game.applySettings = applySettings;

  /* ---------- Ticking ---------- */

  let tickT = 0;
  let lastBiome = '';
  // Once a second: the Quartermaster, auto-challenge, auto-cast skills.
  function tick(now) {
    const S = game.S;
    S.stats.playSec += 1;
    const st = ST.stats(S);
    if (st.autoBuy && S.settings.autoBuy) {
      const hired = ST.hiredCount(S);
      const bought = ST.autoBuy(S, game.idleRate(), 20);
      if (bought) {
        if (ST.hiredCount(S) > hired) ED.battle.placeHeroes();
        ED.ui.dirty();
      }
    }
    if (S.farming && S.settings.autoBoss) {
      const dps = st.party + st.autoTaps * st.tapAvg;
      if (ST.canBeatBoss(S, st, dps)) game.challenge();
    }
    if (st.autoCast) {
      let n = 0;
      for (const sk of D.SKILLS) {
        if (n >= st.autoCast) break;
        n += 1;
        if (sk.id === 'glass') continue; // the Hourglass is always your call
        const ss = game.skillState(sk, now);
        if (ss.unlocked && ss.ready && ED.battle.monster()) game.cast(sk.id, true);
      }
    }
    const { biome } = E.biomeOf(S.floor);
    if (biome.id !== lastBiome) {
      lastBiome = biome.id;
      A.setMode(biome.music);
    }
  }

  let last = 0;
  let saveT = 0;
  let hiddenAt = 0;
  function loop(t) {
    const now = Date.now();
    let dt = last ? (t - last) / 1000 : 1 / 60;
    last = t;
    // A long stall without a visibility change (a phone napping, a
    // suspended tab): treat it as time away.
    if (dt > 5) {
      game.away(dt, 'away');
      dt = 0;
    }
    dt = Math.min(dt, 0.1);
    try {
      ED.battle.frame(dt);
      if (now - tickT >= 1000) {
        tickT = now;
        tick(now);
      }
      sampleGold(now);
      ED.ui.frame(now);
      if (now - saveT > 5000) {
        saveT = now;
        save();
      }
    } catch (err) {
      console.error(err);
    }
    requestAnimationFrame(loop);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      save();
      A.suspend(true);
    } else {
      A.suspend(false);
      const sec = hiddenAt ? (Date.now() - hiddenAt) / 1000 : 0;
      hiddenAt = 0;
      last = 0;
      if (sec > AWAY_MIN) game.away(sec, 'away');
    }
  });
  window.addEventListener('pagehide', save);
  window.addEventListener('resize', () => ED.battle.resize());
  document.addEventListener('pointerdown', () => A.unlock(), { capture: true });

  function registerSW() {
    if (!('serviceWorker' in navigator) || window.top !== window) return;
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is optional */ });
  }

  /* ---------- Boot ---------- */

  applySettings();
  ED.battle.init(document.getElementById('scene'));
  ED.ui.init();
  const now = Date.now();
  const awaySec = (now - game.S.lastSeen) / 1000;
  if (game.S.stats.playSec > 0 && awaySec > AWAY_MIN) game.away(awaySec, 'away');
  else if (!game.S.stats.playSec) ED.ui.welcome();
  save();
  requestAnimationFrame(loop);
  registerSW();
})(window.ED = window.ED || {});
