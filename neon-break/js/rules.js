// Neon Break: 8-ball rules and the CPU player.
'use strict';
var NB = window.NB || (window.NB = {});

(function () {
  var P = NB.phys, R = P.R;

  function groupOf(n) { return n === 0 ? 'cue' : n === 8 ? 'eight' : n < 8 ? 'solids' : 'stripes'; }
  function other(g) { return g === 'solids' ? 'stripes' : 'solids'; }

  // Numbers of a group's balls still on the table.
  function remaining(st, group) {
    var out = [];
    for (var i = 1; i < st.balls.length; i++) {
      var b = st.balls[i];
      if (b.on && groupOf(b.n) === group) out.push(b.n);
    }
    return out;
  }

  // Which balls may the current player legally hit first?
  function legalTargets(game, st) {
    var me = game.players[game.turn];
    if (game.open || !me.group) {
      return st.balls.filter(function (b) { return b.on && b.n !== 0 && b.n !== 8; });
    }
    var mine = st.balls.filter(function (b) { return b.on && groupOf(b.n) === me.group; });
    if (mine.length) return mine;
    return st.balls.filter(function (b) { return b.on && b.n === 8; });
  }

  // Decide what a finished shot means. Doesn't change anything.
  // stAfter is the table after the shot; ev is from NB.phys.strike/step.
  function judge(game, stAfter, ev) {
    var me = game.players[game.turn];
    var sunk = ev.sunk;
    var cueSunk = sunk.indexOf(0) >= 0, eightSunk = sunk.indexOf(8) >= 0;
    var objSunk = sunk.filter(function (n) { return n !== 0 && n !== 8; });
    var r = { foul: null, keepTurn: false, assign: null, winner: -1, respot8: false, objSunk: objSunk, cueSunk: cueSunk, msg: '' };
    var group = game.open ? null : me.group;
    var onEight = false;
    if (group) {
      var left = remaining(stAfter, group).length;
      var sunkMine = objSunk.filter(function (n) { return groupOf(n) === group; }).length;
      onEight = left + sunkMine === 0;
    }

    if (cueSunk) r.foul = 'Scratch!';
    else if (ev.first < 0) r.foul = 'Missed everything';
    else if (!game.breakShot) {
      if (!group) {
        if (ev.first === 8) r.foul = 'Hit the 8 first';
      } else if (onEight) {
        if (ev.first !== 8) r.foul = 'Hit the 8 first, you’re on it';
      } else if (groupOf(ev.first) !== group) {
        r.foul = ev.first === 8 ? 'Hit the 8 first' : 'Hit the wrong group';
      }
      if (!r.foul && ev.rails === 0 && sunk.length === 0) r.foul = 'No cushion after contact';
    }

    if (eightSunk) {
      if (game.breakShot) {
        r.respot8 = true;
      } else if (onEight && !r.foul) {
        r.winner = game.turn;
        r.msg = 'Sank the 8!';
        return r;
      } else {
        r.winner = 1 - game.turn;
        r.msg = onEight ? 'Fouled on the 8' : 'Sank the 8 too early';
        return r;
      }
    }

    if (r.foul) return r;

    if (game.breakShot) {
      r.keepTurn = objSunk.length > 0;
    } else if (!group) {
      if (objSunk.length) {
        r.assign = groupOf(objSunk[0]);
        r.keepTurn = true;
      }
    } else {
      r.keepTurn = objSunk.some(function (n) { return groupOf(n) === group; });
    }
    return r;
  }

  // ---- CPU ---------------------------------------------------------------

  var LEVELS = {
    easy:   { picks: 4,  powers: [1],            spins: [0],          noise: 0.03,   pnoise: 0.18, samples: 1, positional: 0.2, mistake: 0.25 },
    medium: { picks: 9,  powers: [1, 1.35, 0.75], spins: [0],          noise: 0.013,  pnoise: 0.09, samples: 1, positional: 0.7, mistake: 0.06 },
    hard:   { picks: 12, powers: [1, 1.35, 0.75], spins: [0, 0.7, -0.7], noise: 0.0058, pnoise: 0.05, samples: 3, positional: 1,   mistake: 0 }
  };

  // Every direct pot available from where the cue ball sits.
  function potShots(st, targets, cueX, cueY) {
    var out = [], cue = st.balls[0];
    cueX = cueX == null ? cue.x : cueX; cueY = cueY == null ? cue.y : cueY;
    for (var i = 0; i < targets.length; i++) {
      var t = targets[i];
      for (var p = 0; p < P.aimPoints.length; p++) {
        var ap = P.aimPoints[p];
        var ux = ap.x - t.x, uy = ap.y - t.y, d2 = Math.sqrt(ux * ux + uy * uy);
        if (d2 < 1) continue;
        ux /= d2; uy /= d2;
        if ((p === 2 || p === 3) && Math.abs(ux) < 0.4) continue; // side pockets need a square-ish approach
        var gx = t.x - ux * 2 * R, gy = t.y - uy * 2 * R;
        if (gx < R - 1 || gx > P.W - R + 1 || gy < R - 1 || gy > P.H - R + 1) continue;
        var vx = gx - cueX, vy = gy - cueY, d1 = Math.sqrt(vx * vx + vy * vy);
        if (d1 < 1) continue;
        vx /= d1; vy /= d1;
        var cos = vx * ux + vy * uy;
        if (cos < 0.18) continue;
        if (!P.pathClear(st, cueX, cueY, gx, gy, cue, t)) continue;
        if (!P.pathClear(st, t.x, t.y, ap.x, ap.y, t, cue)) continue;
        var score = cos * cos / (1 + (d1 + d2 * 1.5) / 900);
        var power = Math.min(0.95, Math.max(0.2, 0.17 + (d1 + d2 * (1.4 + (1 - cos) * 2)) / 2100));
        out.push({ ball: t.n, pocket: p, angle: Math.atan2(vy, vx), power: power, score: score, gx: gx, gy: gy, ux: ux, uy: uy });
      }
    }
    out.sort(function (a, b) { return b.score - a.score; });
    return out;
  }

  // How good is the table for whoever shoots next at `group`?
  function tableValue(game, st, playerIndex, groupAfter) {
    var g = groupAfter;
    var targets;
    if (!g) targets = st.balls.filter(function (b) { return b.on && b.n !== 0 && b.n !== 8; });
    else {
      targets = st.balls.filter(function (b) { return b.on && groupOf(b.n) === g; });
      if (!targets.length) targets = st.balls.filter(function (b) { return b.on && b.n === 8; });
    }
    var shots = potShots(st, targets);
    var seen = {}, count = 0;
    for (var i = 0; i < shots.length && count < 3; i++) if (!seen[shots[i].ball]) { seen[shots[i].ball] = 1; count++; }
    return { best: shots.length ? shots[0].score : 0, count: count };
  }

  function scoreOutcome(game, st, ev, lv) {
    var r = judge(game, st, ev);
    var me = game.players[game.turn];
    if (r.winner === game.turn) return 100000;
    if (r.winner >= 0) return -100000;
    var s = 0;
    var myGroup = r.assign || (game.open ? null : me.group);
    var oppGroup = myGroup ? other(myGroup) : null;
    if (r.foul) {
      var opp = tableValue(game, st, 1 - game.turn, oppGroup);
      return -600 - opp.best * 300;
    }
    if (r.keepTurn) {
      s += 500 + 40 * r.objSunk.filter(function (n) { return !myGroup || groupOf(n) === myGroup; }).length;
      var mine = tableValue(game, st, game.turn, myGroup);
      s += lv.positional * (mine.best * 320 + mine.count * 30);
      if (mine.count === 0) s -= lv.positional * 120;
    } else {
      var o = tableValue(game, st, 1 - game.turn, oppGroup);
      s -= o.best * 260 + o.count * 25;
    }
    if (oppGroup) s -= 25 * r.objSunk.filter(function (n) { return groupOf(n) === oppGroup; }).length;
    return s;
  }

  // Build the list of shots to try for the current cue ball spot.
  function candidates(game, st, lv) {
    var targets = legalTargets(game, st);
    var shots = potShots(st, targets).slice(0, lv.picks);
    var list = [];
    shots.forEach(function (sh) {
      lv.powers.forEach(function (pm) {
        lv.spins.forEach(function (sp) {
          list.push({ angle: sh.angle, power: Math.min(1, sh.power * pm), spin: sp, side: 0, geo: sh.score });
        });
      });
    });
    // Safeties / kicks: hit each legal ball full and thin at a couple of speeds.
    var cue = st.balls[0];
    targets.forEach(function (t) {
      var a = Math.atan2(t.y - cue.y, t.x - cue.x);
      var d = Math.sqrt((t.x - cue.x) * (t.x - cue.x) + (t.y - cue.y) * (t.y - cue.y));
      var thin = Math.asin(Math.min(1, 1.6 * R / Math.max(d, 2 * R)));
      [0, thin * 0.6, -thin * 0.6].forEach(function (off) {
        [0.3, 0.55].forEach(function (pw) { list.push({ angle: a + off, power: pw, spin: 0, side: 0, geo: 0 }); });
      });
    });
    return list;
  }

  // Ask the CPU for a shot. Calls done({angle, power, spin, side, place}) asynchronously,
  // spreading the work over several ticks so the screen stays smooth.
  function think(game, st, level, done) {
    var lv = LEVELS[level] || LEVELS.medium;
    var cue = st.balls[0];

    if (game.breakShot && !game.ballInHand) {
      setTimeout(function () { done(breakShot(st)); }, 0);
      return;
    }

    var places = [null];
    if (game.ballInHand) places = placements(game, st, lv);

    var jobs = [];
    places.forEach(function (pl) {
      var base = P.cloneState(st);
      if (pl) { base.balls[0].x = pl.x; base.balls[0].y = pl.y; base.balls[0].on = true; }
      if (game.breakShot && pl) {
        jobs.push({ base: base, place: pl, c: breakShot(base) });
        return;
      }
      candidates(game, base, lv).forEach(function (c) { jobs.push({ base: base, place: pl, c: c, pri: c.geo + (pl && pl.score ? pl.score * 0.5 : 0) }); });
    });
    // Most promising first, so running out of time still leaves a good choice.
    jobs.sort(function (a, b) { return (b.pri || 0) - (a.pri || 0); });
    var started = Date.now(), BUDGET = 1600;

    var best = null, i = 0;
    function evalJob(job) {
      var total = 0;
      for (var k = 0; k < lv.samples; k++) {
        var s = P.cloneState(job.base);
        var jitter = lv.samples > 1 ? (k - 1) * lv.noise * 1.2 : 0;
        var ev = P.simulate(s, job.c.angle + jitter, job.c.power, job.c.spin, job.c.side);
        total += scoreOutcome(game, s, ev, lv);
      }
      return total / lv.samples;
    }
    var scored = [];
    function chunk() {
      var t0 = Date.now();
      while (i < jobs.length && Date.now() - t0 < 12) {
        var j = jobs[i++];
        j.score = game.breakShot ? 0 : evalJob(j);
        scored.push(j);
      }
      if (i < jobs.length && Date.now() - started < BUDGET) { setTimeout(chunk, 0); return; }
      scored.sort(function (a, b) { return b.score - a.score; });
      best = scored[0];
      // Easier CPUs sometimes go for a worse shot.
      if (lv.mistake && scored.length > 2 && Math.random() < lv.mistake) best = scored[1 + Math.floor(Math.random() * Math.min(4, scored.length - 1))];
      if (!best) best = { c: { angle: Math.random() * Math.PI * 2, power: 0.5, spin: 0, side: 0 }, place: places[0] };
      var c = best.c;
      done({
        angle: c.angle + gauss() * lv.noise,
        power: Math.max(0.05, Math.min(1, c.power * (1 + gauss() * lv.pnoise))),
        spin: c.spin, side: c.side, place: best.place
      });
    }
    setTimeout(chunk, 0);
  }

  function breakShot(st) {
    var cue = st.balls[0];
    var apex = null, by = -1;
    st.balls.forEach(function (b) { if (b.on && b.n !== 0 && b.y > by) { by = b.y; apex = b; } });
    var tx = apex ? apex.x + (Math.random() - 0.5) * 4 : P.W / 2, ty = apex ? apex.y : P.FOOT.y;
    return { angle: Math.atan2(ty - cue.y, tx - cue.x), power: 0.97 + Math.random() * 0.03, spin: 0, side: 0 };
  }

  // Ball in hand: try putting the cue ball behind good pots.
  function placements(game, st, lv) {
    var kitchen = game.ballInHand === 'kitchen';
    var targets = legalTargets(game, st);
    var out = [], cue = st.balls[0];
    if (game.breakShot) {
      for (var k = 0; k < 3; k++) {
        var x = P.W / 2 + (k - 1) * 70;
        if (P.canPlace(st, x, P.H * 0.8, true)) out.push({ x: x, y: P.H * 0.8 });
      }
      return out.length ? out : [{ x: P.W / 2, y: P.H * 0.8 }];
    }
    var ideas = [];
    var saved = { x: cue.x, y: cue.y, on: cue.on };
    cue.on = false; // so it doesn't block its own paths
    targets.forEach(function (t) {
      P.aimPoints.forEach(function (ap, p) {
        var ux = ap.x - t.x, uy = ap.y - t.y, d = Math.sqrt(ux * ux + uy * uy);
        if (d < 1) return;
        ux /= d; uy /= d;
        if ((p === 2 || p === 3) && Math.abs(ux) < 0.4) return;
        var gx = t.x - ux * 2 * R, gy = t.y - uy * 2 * R;
        [70, 130, 200].forEach(function (back) {
          [0, 0.25, -0.25].forEach(function (rot) {
            var c = Math.cos(rot), s = Math.sin(rot);
            var bx = ux * c - uy * s, by = ux * s + uy * c;
            var x = gx - bx * back, y = gy - by * back;
            if (!P.canPlace(st, x, y, kitchen)) return;
            if (!P.pathClear(st, x, y, gx, gy, null, t)) return;
            if (!P.pathClear(st, t.x, t.y, ap.x, ap.y, t, null)) return;
            var cos = bx * ux + by * uy;
            ideas.push({ x: x, y: y, score: cos / (1 + (back + d * 1.5) / 900) });
          });
        });
      });
    });
    cue.x = saved.x; cue.y = saved.y; cue.on = saved.on;
    ideas.sort(function (a, b) { return b.score - a.score; });
    for (var i = 0; i < ideas.length && out.length < Math.max(3, Math.round(lv.picks / 2)); i++) out.push(ideas[i]);
    if (!out.length) {
      for (var tries = 0; tries < 200 && out.length < 3; tries++) {
        var rx = P.R + Math.random() * (P.W - 2 * P.R), ry = kitchen ? P.HEAD_Y + 20 + Math.random() * (P.H - P.HEAD_Y - 40) : P.R + Math.random() * (P.H - 2 * P.R);
        if (P.canPlace(st, rx, ry, kitchen)) out.push({ x: rx, y: ry });
      }
    }
    return out;
  }

  function gauss() {
    var u = 1 - Math.random(), v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  NB.rules = { groupOf: groupOf, other: other, remaining: remaining, legalTargets: legalTargets, judge: judge, think: think, potShots: potShots };
})();
