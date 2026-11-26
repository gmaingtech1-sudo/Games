/* Emberdeep — the fast-forward. Plays the save for `seconds` without
   drawing anything: the same monsters, bosses, waits, gold and relic drops
   as the live battle, just worked out in jumps. Used for time away, the
   Hourglass skill, Time Flasks and tools/balance.js. */
(function (ED) {
  'use strict';

  const E = ED.econ;
  const ST = ED.state;

  // o: { afk: apply AFK bonuses, now: wall-clock ms the stretch starts at,
  //      taps: taps per second (for the balance tool), rng,
  //      buyer: function(S, goldRate) called every few seconds instead of the Quartermaster,
  //      challenge: function(S, st, dps) → true to walk down to the boss again }
  function run(S, seconds, o) {
    o = o || {};
    const rng = o.rng || Math.random;
    const wall0 = o.now || Date.now();
    const sum = {
      sec: seconds, floorFrom: S.floor, floorTo: S.floor, best: S.bestFloorRun,
      gold: 0, kills: 0, bosses: 0, fails: 0, relics: [], moon: 0, levels: 0,
    };
    const gold0 = S.stats.goldTotal;
    const kills0 = S.stats.kills;
    const bosses0 = S.stats.bosses;
    const levels0 = ST.totalLevels(S);
    const moon0 = S.moon;
    const quarter = () => S.talents.quarter > 0 && S.settings.autoBuy;

    let t = 0;
    let nextBuy = 0;
    let guard = 0;
    while (t < seconds - 1e-9 && guard++ < 2e6) {
      const wall = wall0 + t * 1000;
      const buffs = { hero: 1, gold: S.buffs.banner > wall ? 2 : 1 };
      const st = ST.stats(S, buffs);
      const afk = o.afk ? st.afkMult : 1;
      const heroDps = (st.party + st.autoTaps * st.tapAvg) * afk;
      const dps = heroDps + (o.taps || 0) * st.tapAvg * afk;
      const goldMult = st.goldMult * afk;
      const dt = seconds - t;

      if (t >= nextBuy) {
        nextBuy = t + 5;
        const rate = estRate(S, st, dps, goldMult);
        if (o.buyer) o.buyer(S, rate);
        else if (quarter()) ST.autoBuy(S, rate, 20, buffs);
        const st2 = ST.stats(S, buffs);
        if (S.farming && (o.challenge ? o.challenge(S, st2, heroDps) : (S.settings.autoBoss && ST.canBeatBoss(S, st2, heroDps)))) {
          ST.challenge(S, st2);
        }
        if (st2 !== st) continue; // something was bought: recompute
      }

      if (S.wait > 0) {
        const w = Math.min(S.wait, dt, Math.max(1e-6, nextBuy - t));
        S.wait -= w;
        t += w;
        continue;
      }
      if (!(dps > 0)) {
        // Nobody to fight with. Time passes; nothing happens.
        t = Math.min(seconds, Math.max(nextBuy, t + 1e-6));
        continue;
      }

      if (E.isBoss(S.floor) && !S.farming) {
        if (S.bossT == null) S.bossT = st.bossTime;
        const rate = dps * st.bossMult / E.bossHP(S.floor); // share of its health per second
        const tk = S.hpFrac / rate;
        const step = Math.min(dt, nextBuy - t);
        if (tk <= S.bossT) {
          if (tk > step) { S.hpFrac -= rate * step; S.bossT -= step; t += step; continue; }
          t += tk;
          const r = ST.killBoss(S, st, goldMult, rng);
          for (const x of r.relics) sum.relics.push(x);
        } else {
          if (S.bossT > step) { S.hpFrac -= rate * step; S.bossT -= step; t += step; continue; }
          t += S.bossT;
          ST.failBoss(S, st);
          sum.fails += 1;
        }
        continue;
      }

      const kt = E.mobHP(S.floor) / dps; // seconds to beat one monster here
      const gap = E.T.mobGap * st.gapMult;
      const first = S.hpFrac * kt;
      const step = Math.max(1e-6, Math.min(dt, nextBuy - t));
      if (first > step) { S.hpFrac -= step / kt; t += step; continue; }
      t += first;

      if (S.farming) {
        // Beat this one, then whole monsters in bulk until the next check.
        ST.killMob(S, st, goldMult, rng);
        const per = kt + gap;
        const room = Math.min(seconds, nextBuy) - t;
        const n = Math.floor(room / per);
        if (n > 0) {
          ST.earn(S, E.mobGold(S.floor) * goldMult * n);
          S.stats.kills += n;
          t += n * per;
        }
        continue;
      }
      ST.killMob(S, st, goldMult, rng);
    }

    sum.floorTo = S.floor;
    sum.best = S.bestFloorRun;
    sum.gold = S.stats.goldTotal - gold0;
    sum.kills = S.stats.kills - kills0;
    sum.bosses = S.stats.bosses - bosses0;
    sum.levels = ST.totalLevels(S) - levels0;
    sum.moon = S.moon - moon0;
    return sum;
  }

  // Gold a second at the current floor, for the Quartermaster's patience.
  function estRate(S, st, dps, goldMult) {
    if (!(dps > 0)) return 0;
    const kt = E.mobHP(S.floor) / dps;
    return E.mobGold(S.floor) * goldMult / (kt + E.T.mobGap * st.gapMult);
  }

  ED.sim = { run, estRate };
})(typeof window !== 'undefined' ? (window.ED = window.ED || {}) : (globalThis.ED = globalThis.ED || {}));
