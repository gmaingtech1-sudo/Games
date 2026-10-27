/* Eight-Ball — a match in play: frames, turns and visits, the referee's
   calls, the shot clock, aiming and shooting, ball in hand, nominating after
   a foul snooker, and the computer's turns. */
(function (EB) {
  'use strict';

  const { TABLE, kind, phys, rules, ai, audio: A, render } = EB;
  const { W, L, R, D, BAULK } = TABLE;
  const $ = (id) => document.getElementById(id);
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  const SHOT_TIME = 60;
  const WARN_TIME = 30;

  const G = {
    settings: null,
    players: [],
    race: 1,
    st: null,
    balls: null,
    phase: 'idle',          // aim | ai | rolling | choose | wait | over | idle
    aim: -Math.PI / 2,
    power: 0,
    spin: { x: 0, y: 0 },
    anims: [],
    strike: null,
    showAim: false,
    onSet: null,
    snook: false,
    total: false,
    touchingBall: false,
    nominating: false,
    nominable: [],
    clock: SHOT_TIME,
    warned: false,
    paused: false,
    aiMove: null,
    ui: {},                  // hooks into main.js: frameOver, chooseColour
  };

  const els = {
    pl: [$('pl0'), $('pl1')],
    clock: $('clock'),
    clockText: $('clock-text'),
    clockRing: $('clock-ring'),
    ref: $('ref'),
    chips: $('chips'),
    power: $('power'),
    powerFill: $('power-fill'),
    powerVal: $('power-val'),
    fine: $('fine'),
    spinBtn: $('btn-spin'),
    spinDot: $('spin-dot'),
  };

  const name = (p) => G.players[p].name;
  const isAI = (p = G.st.cur) => !!G.players[p].ai;

  /* ---------- Match and frames ---------- */

  function startMatch(opts) {
    G.race = opts.race;
    G.players = [
      { name: opts.names[0], ai: null, frames: 0 },
      { name: opts.mode === 'ai' ? 'Computer' : opts.names[1], ai: opts.mode === 'ai' ? opts.level : null, frames: 0 },
    ];
    G.starter = Math.random() < 0.5 ? 0 : 1;
    G.paused = false;
    startFrame(G.starter, 1);
    say(`Coin toss: ${name(G.starter)} to break.`, 'info', 3200);
  }

  function startFrame(breaker, visits) {
    clearTimeout(G.aiTimer);
    G.balls = phys.rack();
    G.st = rules.frame(breaker, visits);
    G.anims = [];
    G.strike = null;
    G.aiMove = null;
    beginTurn();
  }

  function nextFrame() {
    G.starter = 1 - G.starter;
    startFrame(G.starter, 1);
    say(`${name(G.starter)} to break.`, 'info');
  }

  /* ---------- Turns ---------- */

  function legalSpot(x, y) {
    if (x < R || x > W - R || y <= BAULK + 0.5 || y > L - R) return false;
    for (const b of G.balls) if (b.id && b.on && (b.x - x) ** 2 + (b.y - y) ** 2 < D * D) return false;
    return true;
  }

  // Put the cue ball somewhere free behind the baulk line.
  function placeInBaulk() {
    const c = G.balls[0];
    c.on = true;
    c.vx = c.vy = 0;
    c.spun = false;
    for (let r = 0; r < 400; r += 12) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
        const x = W / 2 + Math.cos(a) * r;
        const y = BAULK + 90 + Math.sin(a) * r * 0.5;
        if (legalSpot(x, y)) { c.x = x; c.y = y; return; }
        if (!r) break;
      }
    }
  }

  function beginTurn() {
    const st = G.st;
    G.power = 0;
    G.spin = { x: 0, y: 0 };
    G.nominating = false;
    G.clock = SHOT_TIME;
    G.warned = false;
    if (st.inHand) placeInBaulk();
    refresh();
    aimAtBest();
    G.phase = isAI() ? 'ai' : 'aim';
    G.showAim = !isAI() || G.settings.guide !== 'off';
    syncSpin();
    hud();
    if (isAI()) G.aiTimer = setTimeout(aiThink, 700);
  }

  // Work out what the player is facing: the balls on, snookers, touching balls.
  function refresh() {
    const st = G.st;
    G.onSet = rules.ballsOn(st, G.balls);
    G.snook = st.afterFoul && rules.snookered(st, G.balls);
    if (!G.snook && st.nominated !== null) st.nominated = null;
    G.total = !G.snook && rules.totalSnooker(st, G.balls);
    G.touchingBall = G.balls.some((b) => b.on && b.id && phys.touching(G.balls[0], b));
    G.nominable = G.snook ? rules.nominable(st, G.balls) : [];
    chips();
  }

  // Start each turn pointing at the nearest ball the player is on.
  function aimAtBest() {
    const c = G.balls[0];
    if (G.st.breakShot) {
      const apex = G.balls.reduce((a, b) => (b.on && b.id && b.y > a.y ? b : a), { y: -1 });
      G.aim = Math.atan2(apex.y - c.y, apex.x - c.x);
      return;
    }
    let best = null;
    let bd = Infinity;
    for (const id of G.onSet) {
      const b = G.balls[id];
      const d = Math.hypot(b.x - c.x, b.y - c.y);
      if (d < bd) { bd = d; best = b; }
    }
    if (best) G.aim = Math.atan2(best.y - c.y, best.x - c.x);
  }

  function shoot() {
    if (G.phase !== 'aim' && G.phase !== 'ai') return;
    const st = G.st;
    const dir = { x: Math.cos(G.aim), y: Math.sin(G.aim) };
    const pre = rules.prepare(st, G.balls);
    G.shot = { on: pre.on, total: pre.total, touch: rules.touchFoul(st, G.balls, dir) };
    G.before = phys.clone(G.balls);
    G.ev = phys.events(true);
    G.strike = { t: performance.now(), pull: 10 + G.power * 150, x: G.balls[0].x, y: G.balls[0].y };
    phys.strike(G.balls, dir, ai.speedOf(G.power), G.spin);
    A.cue(G.power);
    G.power = 0;
    G.phase = 'rolling';
    G.showAim = false;
    G.nominating = false;
    els.chips.innerHTML = '';
    hud();
  }

  function endShot() {
    const st = G.st;
    const p = st.cur;
    const q = 1 - p;
    const r = rules.judge(st, G.before, G.shot, G.ev);
    const wasOnBlack = rules.onBlack(st, G.before, p);
    const pending = st.pending;

    if (r.rerack !== null) {
      G.phase = 'wait';
      if (r.foul) {
        A.foul();
        say(`Not a fair break. ${name(r.rerack)} re-breaks, with two visits.`, 'foul', 3200);
        G.aiTimer = setTimeout(() => startFrame(r.rerack, 2), 1800);
      } else {
        say(`Eight-ball potted on the break. Re-rack: ${name(p)} breaks again.`, 'info', 3200);
        G.aiTimer = setTimeout(() => startFrame(p, st.visits), 1800);
      }
      return;
    }

    if (!st.breakShot && rules.stalemate(st, p, G.ev.first === null) && !r.win && !r.lose) {
      G.phase = 'wait';
      say(`Stalemate: neither player has hit a ball in three turns. The frame is replayed, ${name(st.breaker)} to break.`, 'info', 4000);
      G.aiTimer = setTimeout(() => startFrame(st.breaker, 1), 2400);
      return;
    }

    rules.apply(st, r);

    if (st.over) {
      frameOver(r, p);
      return;
    }

    if (r.foul) {
      A.foul();
      if (r.foul.pass) say(`In-off on the break. ${name(q)} to play from baulk.`, 'foul');
      else say(`Foul: ${r.foul.why}. Two visits to ${name(q)}${st.inHand ? ', from baulk' : ''}.`, 'foul');
    } else if (r.choose) {
      // the colour sheet explains itself
    } else if (r.assign) {
      say(`${name(p)} is on ${rules.NAME[r.assign]}.`, 'good');
    } else if (pending && !r.assign) {
      say(`${name(p)} didn't pot ${rules.ONE[pending]}. The table is still open.`, 'info');
    } else if (!wasOnBlack && rules.onBlack(st, G.balls, p) && st.cur === p) {
      say(`${name(p)} is on the eight-ball.`, 'good');
    } else if (!r.cont && st.cur === p) {
      say(`${name(p)}: second visit.`, 'info');
    } else if (r.fair && !r.cont) {
      say(`Fair break. ${name(st.cur)} to play.`, 'info');
    } else if (st.cur !== p) {
      say(`${name(st.cur)} to play.`, 'info', 1600);
    }

    if (r.choose) {
      G.phase = 'choose';
      G.choice = r.choose;
      hud();
      if (isAI()) {
        G.aiTimer = setTimeout(() => pickColour(ai.colour(G.balls, G.choice)), 900);
      } else G.ui.chooseColour(G.choice, name(p));
      return;
    }
    beginTurn();
  }

  function pickColour(colour) {
    if (G.phase !== 'choose') return;
    const p = G.st.cur;
    const ok = rules.chooseColour(G.st, colour, G.choice);
    G.choice = null;
    if (ok) say(`${name(p)} is on ${rules.NAME[colour]}.`, 'good');
    else say(`${name(p)} names ${rules.NAME[colour]}, so must pot ${rules.ONE[colour]} with the next shot.`, 'info', 3600);
    beginTurn();
  }

  function timeFoul() {
    const st = G.st;
    const r = rules.judge(st, G.balls, { timeout: true }, phys.events(false));
    rules.apply(st, r);
    A.foul();
    say(`Time foul. Two visits to ${name(st.cur)}: play from where the cue ball lies, or from baulk.`, 'foul', 3600);
    beginTurn();
  }

  function frameOver(r, shooter) {
    const w = G.st.over.winner;
    G.players[w].frames++;
    G.phase = 'over';
    G.showAim = false;
    hud();
    const why = r.win ? `${name(w)} pots the eight-ball.` : `${name(shooter)} ${G.st.over.why}.`;
    const match = G.players[w].frames >= G.race;
    if (match || w === 0 || !isAI(w)) A.win();
    else A.foul();
    setTimeout(() => G.ui.frameOver({ winner: w, why, match }), 900);
  }

  /* ---------- The computer's turn ---------- */

  function aiThink() {
    if (G.phase !== 'ai') return;
    if (G.paused) { G.aiTimer = setTimeout(aiThink, 300); return; }
    const st = G.st;
    const level = G.players[st.cur].ai;
    if (st.inHand) {
      ai.place(st, G.balls, level, legalSpot);
      refresh();
    } else if (st.mayBaulk && G.snook) {
      placeInBaulk();
      st.inHand = true;
      ai.place(st, G.balls, level, legalSpot);
      refresh();
    }
    if (G.snook) {
      const n = ai.nominate(st, G.balls);
      if (n !== null) {
        st.nominated = n;
        G.onSet = rules.ballsOn(st, G.balls);
        say(`Foul snooker: ${name(st.cur)} nominates ${rules.ONE[kind(n)]}.`, 'info');
      }
    }
    const plan = ai.plan(st, G.balls, level);
    let to = Math.atan2(plan.dir.y, plan.dir.x);
    let from = G.aim;
    while (to - from > Math.PI) to -= Math.PI * 2;
    while (to - from < -Math.PI) to += Math.PI * 2;
    G.aiMove = { from, to, plan, t: 0 };
  }

  function aiStep(dt) {
    const m = G.aiMove;
    m.t += dt;
    const k = clamp(m.t / 0.8, 0, 1);
    G.aim = m.from + (m.to - m.from) * (k * k * (3 - 2 * k));
    G.spin = m.plan.spin;
    G.power = m.plan.power * clamp((m.t - 0.9) / 0.45, 0, 1);
    syncSpin();
    hud();
    if (m.t >= 1.5) {
      G.aim = m.to;
      G.power = m.plan.power;
      G.aiMove = null;
      shoot();
    }
  }

  /* ---------- Every frame ---------- */

  function update(dt) {
    for (const a of G.anims) a.t += dt;
    G.anims = G.anims.filter((a) => a.t < 0.3);
    if (G.paused || !G.st) return;

    if (G.phase === 'rolling') {
      let moving = true;
      // Slow phones: take the time in steps the physics can digest.
      let left = Math.min(dt, 0.05);
      while (left > 0 && moving) {
        const h = Math.min(left, 1 / 60);
        moving = phys.advance(G.balls, h, G.ev);
        left -= h;
      }
      for (const s of G.ev.sounds) {
        if (s.t === 'ball') A.ball(s.v);
        else if (s.t === 'cushion') A.cushion(s.v);
        else if (s.t === 'pocket') {
          A.pocket(s.v);
          G.anims.push({ id: s.id, x: s.x, y: s.y, pocket: s.pocket, t: 0 });
        }
      }
      G.ev.sounds.length = 0;
      if (!moving) endShot();
      return;
    }

    if (G.phase === 'ai' && G.aiMove) aiStep(dt);

    if (G.phase === 'aim' && G.settings.clock && !G.ui.sheetOpen()) {
      G.clock -= dt;
      if (!G.warned && G.clock <= WARN_TIME) {
        G.warned = true;
        A.beep();
        say('Thirty seconds.', 'info', 1800);
      }
      if (G.clock <= 0) timeFoul();
      clockHud();
    }
  }

  /* ---------- Referee calls and the HUD ---------- */

  let refTimer = 0;
  function say(text, tone = 'info', ms = 2600) {
    els.ref.textContent = text;
    els.ref.className = `ref show ${tone}`;
    clearTimeout(refTimer);
    refTimer = setTimeout(() => { els.ref.className = `ref ${tone}`; }, ms);
  }

  function hud() {
    const st = G.st;
    if (!st) return;
    G.players.forEach((pl, p) => {
      const el = els.pl[p];
      el.classList.toggle('turn', st.cur === p && G.phase !== 'over');
      el.querySelector('.nm').textContent = pl.name;
      el.querySelector('.fr').textContent = pl.frames;
      const g = st.groups[p];
      const grp = el.querySelector('.grp');
      let html = '';
      if (g) {
        const n = rules.left(G.balls, g);
        for (let i = 0; i < 7; i++) html += `<i class="b ${g}${i < n ? '' : ' gone'}"></i>`;
        if (!n) html = `<i class="b black"></i><span>On the 8</span>`;
      } else if (st.pending && st.cur === p) {
        html = `<i class="b ${st.pending}"></i><span>Must pot</span>`;
      } else html = `<span>${st.breakShot ? (st.cur === p ? 'To break' : '') : 'Open table'}</span>`;
      grp.innerHTML = html;
      const tag = el.querySelector('.tag');
      tag.textContent = st.cur === p && st.visits > 1 && G.phase !== 'over' ? 'Two visits' : '';
    });
    els.clock.hidden = !G.settings.clock || G.phase !== 'aim';
    clockHud();
    const ctl = G.phase === 'aim';
    els.power.classList.toggle('off', !ctl);
    els.fine.classList.toggle('off', !ctl);
    els.spinBtn.disabled = !ctl;
    powerHud();
  }

  let lastSec = -1;
  function clockHud() {
    const s = Math.max(0, Math.ceil(G.clock));
    if (s === lastSec) return;
    lastSec = s;
    els.clockText.textContent = s;
    els.clockRing.style.strokeDashoffset = String(100 - (s / SHOT_TIME) * 100);
    els.clock.classList.toggle('warn', s <= WARN_TIME);
  }

  function powerHud() {
    els.powerFill.style.transform = `scaleX(${G.power})`;
    els.powerVal.textContent = G.power > 0 ? `${Math.round(G.power * 100)}%` : '';
  }

  function syncSpin() {
    els.spinDot.setAttribute('cx', 12 + G.spin.x * 7);
    els.spinDot.setAttribute('cy', 12 - G.spin.y * 7);
  }

  // The context row under the table: ball in hand, nominations, snookers.
  function chips() {
    const st = G.st;
    let html = '';
    if (!isAI() && !st.over) {
      if (st.inHand) html += `<span class="chip info">${st.breakShot ? 'Break from baulk: ' : 'Ball in hand: '}drag the cue ball behind the baulk line</span>`;
      if (G.snook) {
        if (st.nominated !== null) html += `<button class="chip gold" data-act="nominate">Nominated ${rules.ONE[kind(st.nominated)]} ✕</button>`;
        else html += `<button class="chip gold${G.nominating ? ' active' : ''}" data-act="nominate">Foul snooker: ${G.nominating ? 'tap a ball' : 'nominate a ball'}</button>`;
      }
      if (!st.inHand && (st.mayBaulk || G.snook)) html += '<button class="chip" data-act="baulk">Play from baulk</button>';
      if (G.total) html += '<span class="chip info">Total snooker: just hit a ball you\'re on</span>';
      if (G.touchingBall && !st.inHand) html += '<span class="chip info">Touching ball: play away from it</span>';
    }
    els.chips.innerHTML = html;
  }

  els.chips.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || G.phase !== 'aim') return;
    A.tap();
    if (b.dataset.act === 'nominate') {
      if (G.st.nominated !== null) {
        G.st.nominated = null;
        G.onSet = rules.ballsOn(G.st, G.balls);
        G.nominating = false;
      } else G.nominating = !G.nominating;
    } else if (b.dataset.act === 'baulk') {
      G.st.inHand = true;
      G.st.mayBaulk = false;
      G.st.nominated = null;
      placeInBaulk();
      refresh();
    }
    chips();
  });

  /* ---------- Touch, mouse and keys ---------- */

  const cv = $('table');
  let drag = null;

  function worldAt(e) {
    const r = cv.getBoundingClientRect();
    return render.toWorld(e.clientX - r.left, e.clientY - r.top);
  }

  function aimAt(w) {
    const c = G.balls[0];
    if (Math.hypot(w.x - c.x, w.y - c.y) < R * 0.6) return;
    G.aim = Math.atan2(w.y - c.y, w.x - c.x);
  }

  function movedCue() {
    G.snook = G.st.afterFoul && rules.snookered(G.st, G.balls);
    if (!G.snook) G.st.nominated = null;
    refresh();
  }

  cv.addEventListener('pointerdown', (e) => {
    A.init();
    if (G.phase !== 'aim') return;
    const w = worldAt(e);
    const c = G.balls[0];
    if (G.nominating) {
      const b = G.nominable.find((o) => Math.hypot(o.x - w.x, o.y - w.y) < R * 1.8);
      G.nominating = false;
      if (b) {
        G.st.nominated = b.id;
        G.onSet = rules.ballsOn(G.st, G.balls);
        A.tap();
        say(`Nominated ${rules.ONE[kind(b.id)]}: it counts as one of yours for this shot.`, 'info', 3000);
      }
      chips();
      return;
    }
    cv.setPointerCapture(e.pointerId);
    if (G.st.inHand && Math.hypot(w.x - c.x, w.y - c.y) < R * 2.6) {
      drag = { type: 'cue', ox: c.x - w.x, oy: c.y - w.y };
    } else {
      drag = { type: 'aim' };
      aimAt(w);
    }
  });

  cv.addEventListener('pointermove', (e) => {
    if (!drag || G.phase !== 'aim') return;
    const w = worldAt(e);
    if (drag.type === 'aim') aimAt(w);
    else {
      const x = clamp(w.x + drag.ox, R, W - R);
      const y = clamp(w.y + drag.oy, BAULK + 1, L - R);
      if (legalSpot(x, y)) {
        G.balls[0].x = x;
        G.balls[0].y = y;
      }
    }
  });

  const endDrag = () => {
    if (drag && drag.type === 'cue' && G.phase === 'aim') movedCue();
    drag = null;
  };
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);

  // Fine aim: drag along the strip to turn the cue a fraction of a degree.
  let fineX = null;
  let fineOff = 0;
  els.fine.addEventListener('pointerdown', (e) => {
    A.init();
    if (G.phase !== 'aim') return;
    fineX = e.clientX;
    els.fine.setPointerCapture(e.pointerId);
  });
  els.fine.addEventListener('pointermove', (e) => {
    if (fineX === null || G.phase !== 'aim') return;
    const dx = e.clientX - fineX;
    fineX = e.clientX;
    G.aim += dx * 0.0011;
    fineOff += dx;
    els.fine.style.backgroundPositionX = `${fineOff}px`;
  });
  const endFine = () => { fineX = null; };
  els.fine.addEventListener('pointerup', endFine);
  els.fine.addEventListener('pointercancel', endFine);

  // Power: pull right along the bar, let go to shoot. Slide back to cancel.
  let powX = null;
  els.power.addEventListener('pointerdown', (e) => {
    A.init();
    if (G.phase !== 'aim') return;
    powX = e.clientX;
    G.power = 0;
    els.power.setPointerCapture(e.pointerId);
    els.power.classList.add('pulling');
  });
  els.power.addEventListener('pointermove', (e) => {
    if (powX === null || G.phase !== 'aim') return;
    const w = els.power.getBoundingClientRect().width * 0.85;
    G.power = clamp((e.clientX - powX) / w, 0, 1);
    powerHud();
  });
  els.power.addEventListener('pointerup', () => {
    if (powX === null) return;
    powX = null;
    els.power.classList.remove('pulling');
    if (G.phase === 'aim' && G.power > 0.015) shoot();
    else { G.power = 0; powerHud(); }
  });
  els.power.addEventListener('pointercancel', () => {
    powX = null;
    G.power = 0;
    els.power.classList.remove('pulling');
    powerHud();
  });

  function key(e) {
    if (G.phase !== 'aim' || G.ui.sheetOpen()) return false;
    const fine = e.shiftKey ? 0.03 : 0.003;
    switch (e.key) {
      case 'ArrowLeft': G.aim -= fine; break;
      case 'ArrowRight': G.aim += fine; break;
      case 'ArrowUp': G.power = clamp(G.power + 0.05, 0, 1); powerHud(); break;
      case 'ArrowDown': G.power = clamp(G.power - 0.05, 0, 1); powerHud(); break;
      case ' ':
      case 'Enter':
        if (G.power > 0.015) shoot();
        else say('Set the power first: drag along the power bar, or use the up arrow.', 'info');
        break;
      default: return false;
    }
    return true;
  }

  function setSpin(x, y) {
    const m = Math.hypot(x, y);
    const k = m > 0.8 ? 0.8 / m : 1;
    G.spin = { x: x * k, y: y * k };
    syncSpin();
  }

  Object.assign(G, { startMatch, nextFrame, update, shoot, pickColour, setSpin, key, hud, say, refresh });
  EB.game = G;
})(window.EB = window.EB || {});
