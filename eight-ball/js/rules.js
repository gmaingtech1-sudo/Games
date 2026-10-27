/* Eight-Ball — the referee. Implements the World Eightball Pool Federation
   rules: the fair break, deciding colours, legal shots, standard and
   non-standard fouls with two visits, foul snookers with a nominated ball,
   touching balls, total snookers, loss-of-frame fouls and stalemates.
   judge() looks at what happened in a shot and apply() moves the frame on,
   so the computer can use the same referee to weigh up shots it tries out. */
(function (EB) {
  'use strict';

  const { kind, phys } = EB;
  const COLOURS = ['red', 'yellow'];
  const other = (c) => (c === 'red' ? 'yellow' : 'red');
  const NAME = { red: 'Reds', yellow: 'Yellows', black: 'the eight-ball' };
  const ONE = { red: 'a red', yellow: 'a yellow', black: 'the eight-ball' };

  function frame(breaker, visits = 1) {
    return {
      cur: breaker,
      breaker,
      visits,                    // visits left in this turn, counting the one being played
      groups: [null, null],      // 'red' | 'yellow' once colours are decided
      pending: null,             // colour named after the break but not yet potted
      breakShot: true,
      inHand: true,              // cue ball to be played from baulk
      mayBaulk: false,           // may choose to play from baulk instead (time foul, foul snooker)
      afterFoul: false,          // first shot of the first visit after a foul
      nominated: null,           // ball nominated after a foul snooker
      noHit: [],                 // players whose recent shots missed every ball (stalemate)
      over: null,
    };
  }

  const left = (balls, colour) => balls.filter((b) => b.on && kind(b.id) === colour).length;
  const onBlack = (st, balls, p) => !!st.groups[p] && left(balls, st.groups[p]) === 0;

  // The balls the player is "on": the ones the cue ball must hit first.
  function ballsOn(st, balls, withNominated = true) {
    const ids = new Set();
    const g = st.groups[st.cur];
    for (const b of balls) {
      if (!b.on || b.id === 0) continue;
      const k = kind(b.id);
      if (st.breakShot) ids.add(b.id);
      else if (st.pending) { if (k === st.pending) ids.add(b.id); }
      else if (!g) { if (k !== 'black') ids.add(b.id); }
      else if (k === g) ids.add(b.id);
    }
    if (!ids.size && !st.breakShot) ids.add(8);
    if (withNominated && st.nominated !== null) ids.add(st.nominated);
    return ids;
  }

  // Balls the player may nominate after a foul snooker: the opponent's
  // colours, or the eight-ball if they're not on it yet.
  function nominable(st, balls) {
    const own = ballsOn(st, balls, false);
    const g = st.groups[st.cur];
    return balls.filter((b) => b.on && b.id !== 0 && !own.has(b.id) && (kind(b.id) === 'black' || (g && kind(b.id) === other(g))));
  }

  // Total snooker: no part of any ball "on" can be hit in a straight line.
  function totalSnooker(st, balls) {
    if (st.breakShot) return false;
    const ks = [-0.96, -0.72, -0.48, -0.24, 0, 0.24, 0.48, 0.72, 0.96];
    for (const id of ballsOn(st, balls)) {
      if (phys.sightLines(balls, balls[id], () => false, ks).some(Boolean)) return false;
    }
    return true;
  }

  // Snookered: the finest cut on both sides of every one of the player's own
  // balls is blocked. Their own colour never counts as an obstruction, and a
  // touching ball can't be snookered.
  function snookered(st, balls) {
    if (st.breakShot) return false;
    const own = ballsOn(st, balls, false);
    for (const id of own) {
      const t = balls[id];
      if (phys.touching(balls[0], t)) return false;
      if (phys.sightLines(balls, t, (b) => own.has(b.id), [-0.97, 0.97]).every(Boolean)) return false;
    }
    return true;
  }

  // Did this shot play into a ball the cue ball was touching? The player must
  // play away at more than 90°. If several touch, playing away from one of
  // the player's own lets them play into the others.
  function touchFoul(st, balls, dir) {
    const c = balls[0];
    const touch = balls.filter((b) => b.on && b.id !== 0 && phys.touching(c, b));
    if (!touch.length) return false;
    const into = (b) => (b.x - c.x) * dir.x + (b.y - c.y) * dir.y > 0;
    const on = ballsOn(st, balls);
    if (touch.some((b) => on.has(b.id) && !into(b))) return false;
    return touch.some(into);
  }

  // Everything the referee needs to know before the cue ball is struck.
  function prepare(st, balls) {
    return { on: ballsOn(st, balls), total: totalSnooker(st, balls) };
  }

  /* ---------- Judging a shot ---------- */

  function judge(st, before, shot, ev) {
    const p = st.cur;
    const potted = ev.potted.filter((id) => id !== 0);
    const pot8 = potted.includes(8);
    const potCol = { red: 0, yellow: 0 };
    for (const id of potted) if (id !== 8) potCol[kind(id)]++;
    const r = { foul: null, lose: null, win: false, rerack: null, cont: false, assign: null, choose: null, inHand: ev.cue, mayBaulk: false };

    if (shot.timeout) {
      r.foul = { std: false, why: 'ran out of time' };
      r.mayBaulk = true;
      return r;
    }

    if (st.breakShot) {
      if (pot8) {
        r.rerack = p;
        return r;
      }
      const fair = potCol.red + potCol.yellow > 0 || ev.cushionBalls.size >= 4;
      if (!fair) {
        r.foul = { std: false, why: 'not a fair break' };
        r.rerack = 1 - p;
        return r;
      }
      if (ev.cue) {
        r.foul = { std: false, why: 'in-off on the break', pass: true };
        return r;
      }
      const cs = COLOURS.filter((c) => potCol[c]);
      if (cs.length) {
        r.cont = true;
        r.choose = { afterBreak: true, potted: cs };
      }
      r.fair = true;
      return r;
    }

    const on = shot.on;
    const why = [];
    if (shot.touch) why.push('played into a touching ball');
    if (ev.first === null) why.push('missed every ball');
    else if (!on.has(ev.first)) why.push(`hit ${ONE[kind(ev.first)]} first`);
    if (ev.cue) why.push('in-off');
    const g = st.groups[p];
    if (g && potted.some((id) => kind(id) === other(g) && id !== st.nominated)) why.push(`potted ${ONE[other(g)]}`);
    const potOn = potted.some((id) => on.has(id));
    if (ev.first !== null && on.has(ev.first) && !potOn && !ev.cushionAfter && !shot.total) why.push('no ball reached a cushion');

    if (pot8) {
      if (why.length) r.lose = `potted the eight-ball on a foul (${why[0]})`;
      else if (!onBlack(st, before, p)) {
        r.lose = st.nominated === 8 ? 'potted the nominated eight-ball' : 'potted the eight-ball before clearing their colours';
      } else r.win = true;
      return r;
    }

    if (why.length) {
      r.foul = { std: true, why: why[0] };
      return r;
    }

    if (st.pending) {
      r.assign = potCol[st.pending] ? st.pending : null;
      r.unpend = true;
    } else if (!g) {
      const cs = COLOURS.filter((c) => potCol[c]);
      if (cs.length === 1) r.assign = cs[0];
      else if (cs.length === 2) r.choose = { afterBreak: false, potted: cs };
    }
    r.cont = potOn;
    return r;
  }

  // Move the frame on after judge(). Re-racks are left to the caller.
  function apply(st, r) {
    const p = st.cur;
    const q = 1 - p;
    st.nominated = null;
    st.mayBaulk = false;
    if (r.win) { st.over = { winner: p }; return; }
    if (r.lose) { st.over = { winner: q, why: r.lose }; return; }
    st.breakShot = false;
    if (r.foul) {
      st.pending = null;
      st.cur = q;
      st.visits = r.foul.pass ? 1 : 2;
      st.inHand = r.inHand;
      st.mayBaulk = r.mayBaulk;
      st.afterFoul = !r.foul.pass;
      return;
    }
    st.afterFoul = false;
    st.inHand = false;
    if (r.unpend) st.pending = null;
    if (r.assign) {
      st.groups[p] = r.assign;
      st.groups[q] = other(r.assign);
    }
    if (r.cont) return;
    if (st.visits > 1) {
      st.visits--;
      return;
    }
    st.cur = q;
    st.visits = 1;
  }

  // The player names a colour. After the break, naming one they didn't pot
  // means they must pot it with the next shot to be on it.
  function chooseColour(st, colour, choice) {
    if (choice.afterBreak && !choice.potted.includes(colour)) {
      st.pending = colour;
      return false;
    }
    st.groups[st.cur] = colour;
    st.groups[1 - st.cur] = other(colour);
    return true;
  }

  // Stalemate: both players have had three turns in a row without the cue
  // ball touching another ball.
  function stalemate(st, p, missed) {
    if (!missed) { st.noHit = []; return false; }
    st.noHit.push(p);
    const run = st.noHit;
    return run.filter((x) => x === 0).length >= 3 && run.filter((x) => x === 1).length >= 3;
  }

  EB.rules = {
    COLOURS, NAME, ONE, other, frame, left, onBlack, ballsOn, nominable,
    totalSnooker, snookered, touchFoul, prepare, judge, apply, chooseColour, stalemate,
  };
})(window.EB = window.EB || {});
