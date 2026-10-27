/* Eight-Ball — the computer player. It looks for pots (clear paths from the
   cue ball to a ball and from that ball to a pocket), tries each one out at
   a few speeds and spins with the real physics, asks the referee what would
   happen, and also weighs up safeties. Then it plays its pick with a
   human-sized wobble that depends on the skill level. */
(function (EB) {
  'use strict';

  const { TABLE, kind, phys, rules } = EB;
  const { W, L, R, D, pockets } = TABLE;

  const LEVELS = {
    easy: { aim: 0.024, pow: 0.15, lines: 4, mults: [1.2], spins: [0], safeties: [0], pick: 3 },
    medium: { aim: 0.011, pow: 0.07, lines: 6, mults: [1, 1.5], spins: [0, -0.5], safeties: [-0.6, 0, 0.6], pick: 1 },
    hard: { aim: 0.004, pow: 0.03, lines: 9, mults: [0.9, 1.3, 1.8], spins: [0, -0.6, 0.5], safeties: [-0.85, -0.45, 0, 0.45, 0.85], pick: 1 },
  };

  const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());

  // Shot speed for a power from 0 to 1, and back.
  const speedOf = (p) => 80 + 6700 * Math.pow(p, 1.7);
  const powerOf = (v) => Math.min(1, Math.pow(Math.max(0, v - 80) / 6700, 1 / 1.7));

  // Every open pot for the balls in `on`, best first. q is a rough 0–1 ease.
  function potLines(balls, on) {
    const c = balls[0];
    const out = [];
    for (const id of on) {
      const b = balls[id];
      if (!b.on) continue;
      for (const P of pockets) {
        let px = P.ax - b.x;
        let py = P.ay - b.y;
        const dBP = Math.hypot(px, py);
        px /= dBP;
        py /= dBP;
        if (P.mid && Math.abs(px) < 0.4) continue;       // too shallow for a middle pocket
        const gx = b.x - px * D;
        const gy = b.y - py * D;
        if (gx < R - 2 || gx > W - R + 2 || gy < R - 2 || gy > L - R + 2) continue;
        let dx = gx - c.x;
        let dy = gy - c.y;
        const dCG = Math.hypot(dx, dy);
        if (dCG < 1) continue;
        dx /= dCG;
        dy /= dCG;
        const cos = dx * px + dy * py;
        if (cos < 0.22) continue;
        const h1 = phys.firstHit(balls, c.x, c.y, dx, dy, (o) => o.id === 0);
        if (!h1 || h1.b !== b) continue;
        const h2 = phys.firstHit(balls, b.x, b.y, px, py, (o) => o.id === 0 || o === b);
        if (h2 && h2.t < dBP - R) continue;
        const q = cos * cos / (1 + dCG / 900 + dBP / 650);
        out.push({ id, dx, dy, cos, dCG, dBP, q });
      }
    }
    return out.sort((a, b) => b.q - a.q);
  }

  const bestQ = (balls, on) => {
    const l = potLines(balls, on);
    return l.length ? l[0].q : 0;
  };

  // Roughly how hard to hit a pot so the object ball reaches the pocket.
  function potSpeed(ln) {
    const vObj = Math.sqrt(2 * 650 * (ln.dBP + 120));
    return Math.sqrt((vObj / Math.max(0.3, ln.cos)) ** 2 + 2 * 650 * ln.dCG) * 1.05;
  }

  // Try a shot out and score what happens.
  function evaluate(st, balls, pre, shot) {
    const sim = phys.clone(balls);
    const info = { on: pre.on, total: pre.total, touch: rules.touchFoul(st, balls, shot.dir) };
    phys.strike(sim, shot.dir, shot.speed, shot.spin);
    const ev = phys.events(false);
    phys.simulate(sim, ev, 20);
    const r = rules.judge(st, balls, info, ev);
    if (r.win) return 1000;
    if (r.lose) return -1000;
    if (r.foul) return -400 - ev.potted.length;
    const next = { ...st, groups: st.groups.slice() };
    rules.apply(next, r);
    if (r.choose) next.groups[next.cur] = null;
    const on2 = rules.ballsOn(next, sim, false);
    const q = bestQ(sim, on2);
    if (next.cur === st.cur) return (r.cont ? 300 : 120) + q * 250 + ev.potted.length * 10;
    return 40 - q * 300;
  }

  function plan(st, balls, level) {
    const lv = LEVELS[level] || LEVELS.medium;
    if (st.breakShot) {
      const apex = balls.reduce((a, b) => (b.on && b.id && b.y > a.y ? b : a), { y: -1 });
      const ang = Math.atan2(apex.y - balls[0].y, apex.x - balls[0].x) + gauss() * 0.006;
      return { dir: { x: Math.cos(ang), y: Math.sin(ang) }, power: 0.93 + Math.random() * 0.07, spin: { x: 0, y: 0 } };
    }
    const pre = rules.prepare(st, balls);
    const cands = [];
    for (const ln of potLines(balls, pre.on).slice(0, lv.lines)) {
      const v = potSpeed(ln);
      for (const m of lv.mults) {
        for (const s of lv.spins) cands.push({ dir: { x: ln.dx, y: ln.dy }, speed: Math.min(6700, v * m), spin: { x: 0, y: s } });
      }
    }
    // Safeties: thin, half and full contacts on each ball on, at gentle speeds.
    const c = balls[0];
    for (const id of pre.on) {
      const b = balls[id];
      const dist = Math.hypot(b.x - c.x, b.y - c.y);
      const base = Math.atan2(b.y - c.y, b.x - c.x);
      const a = Math.asin(Math.min(1, D / Math.max(dist, D)));
      for (const k of lv.safeties) {
        const ang = base + a * k * 0.95;
        for (const v of [700 + dist * 0.6, 1300 + dist * 0.8]) {
          cands.push({ dir: { x: Math.cos(ang), y: Math.sin(ang) }, speed: v, spin: { x: 0, y: 0 } });
        }
      }
    }
    if (!cands.length) {
      const ang = Math.random() * Math.PI * 2;
      cands.push({ dir: { x: Math.cos(ang), y: Math.sin(ang) }, speed: 1500, spin: { x: 0, y: 0 } });
    }
    for (const cd of cands) cd.score = evaluate(st, balls, pre, cd) + Math.random() * 4;
    cands.sort((a, b) => b.score - a.score);
    const top = cands.slice(0, Math.min(lv.pick, cands.length)).filter((cd) => cd.score > cands[0].score - 200);
    const pick = top[Math.floor(Math.random() * top.length)];
    const ang = Math.atan2(pick.dir.y, pick.dir.x) + gauss() * lv.aim;
    const speed = pick.speed * (1 + gauss() * lv.pow);
    return { dir: { x: Math.cos(ang), y: Math.sin(ang) }, power: Math.max(0.03, powerOf(speed)), spin: pick.spin };
  }

  // Ball in hand: pick a spot in baulk that leaves the easiest pot.
  function place(st, balls, level, legal) {
    const c = balls[0];
    if (st.breakShot) {
      c.x = W / 2 + (Math.random() - 0.5) * 160;
      c.y = TABLE.BAULK + 60;
      return;
    }
    const on = rules.ballsOn(st, balls);
    let best = null;
    let bq = -1;
    for (let x = R + 20; x <= W - R - 20; x += 70) {
      for (let y = TABLE.BAULK + 15; y <= L - R - 10; y += 55) {
        if (!legal(x, y)) continue;
        c.x = x;
        c.y = y;
        const q = bestQ(balls, on) + (level === 'easy' ? Math.random() * 0.3 : Math.random() * 0.02);
        if (q > bq) { bq = q; best = { x, y }; }
      }
    }
    if (best) { c.x = best.x; c.y = best.y; }
  }

  // Foul snooker: nominate the opponent's ball that gives the best pot, if any.
  function nominate(st, balls) {
    let best = null;
    let bq = 0;
    for (const b of rules.nominable(st, balls)) {
      if (b.id === 8 && !rules.onBlack(st, balls, st.cur)) continue;
      const q = bestQ(balls, [b.id]) + (phys.sightLines(balls, b, () => false, [0])[0] ? 0.05 : 0);
      if (q > bq) { bq = q; best = b.id; }
    }
    return best;
  }

  // Which colour to take: the one with the easiest pot (after the break,
  // one that was actually potted, so the choice is safe).
  function colour(balls, choice) {
    const opts = choice.potted;
    let best = opts[0];
    let bq = -1;
    for (const c of opts) {
      const ids = balls.filter((b) => b.on && kind(b.id) === c).map((b) => b.id);
      const q = bestQ(balls, ids) - rules.left(balls, c) * 0.02;
      if (q > bq) { bq = q; best = c; }
    }
    return best;
  }

  EB.ai = { plan, place, nominate, colour, speedOf, powerOf };
})(window.EB = window.EB || {});
