/* Riftborn — Rift battles. To take an enemy Rift you beat the creatures
   guarding it: your team of up to three against theirs, one at a time.
   Each turn both sides pick a move; faster creatures act first, and Guard
   always goes first. Elements matter: see RB.creatures.advantage. */
window.RB = window.RB || {};
(function (RB) {
  'use strict';

  const { clamp, rand, TAU, lerp } = RB.util;
  const C = RB.creatures;
  const sfx = RB.sfx;
  const $ = (id) => document.getElementById(id);

  const MOVES = {
    strike: { name: 'Strike', power: 1, cd: 0 },
    blast: { name: 'Blast', power: 1.75, cd: 2 },
    guard: { name: 'Guard', power: 0, cd: 2 },
  };

  let B = null;
  let canvas = null, ctx = null, dpr = 1, Wd = 1, Ht = 1;

  function fighter(c, side) {
    const st = C.stats(c);
    return { c, sp: C.byId(c.sp), side, st, hp: st.hp, max: st.hp, cd: { blast: 0, guard: 0 }, guard: false, anim: { lunge: 0, hurt: 0, faint: 0, shield: 0, mouth: 0 } };
  }

  function init() {
    canvas = $('battle-view');
    ctx = canvas.getContext('2d');
    for (const m of Object.keys(MOVES)) {
      $(`bt-${m}`).addEventListener('click', () => choose(m));
    }
    $('bt-swap').addEventListener('click', () => openSwap());
    $('bt-flee').addEventListener('click', () => { if (B && !B.busy) end(false, true); });
    $('bt-done').addEventListener('click', () => { const b = B; if (!b) return; close(); b.done(b.outcome); });
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    Wd = canvas.clientWidth;
    Ht = canvas.clientHeight;
    canvas.width = Math.round(Wd * dpr);
    canvas.height = Math.round(Ht * dpr);
  }

  // mine / theirs: arrays of creature records { sp, lvl, iv }.
  function start(mine, theirs, opts, done) {
    B = {
      me: mine.map((c) => fighter(c, 0)),
      foe: theirs.map((c) => fighter(c, 1)),
      mi: 0, fi: 0,
      t: 0, busy: false, done, opts,
      fx: [], nums: [],
      outcome: null,
    };
    $('battle-screen').hidden = false;
    $('bt-result').hidden = true;
    $('bt-title').textContent = opts.title || 'Rift battle';
    resize();
    hud();
    log(`${B.foe[0].sp.name} guards the Rift!`);
    sfx.roar();
    B.foe[0].anim.mouth = 1;
  }

  function close() {
    $('battle-screen').hidden = true;
    B = null;
  }

  const cur = (side) => (side === 0 ? B.me[B.mi] : B.foe[B.fi]);

  function hud() {
    const set = (pre, f, team, idx) => {
      $(`${pre}-name`).textContent = f.sp.name;
      $(`${pre}-lvl`).textContent = `Lv ${f.c.lvl} ${C.ELEMENTS[f.sp.el].icon}`;
      const pct = clamp(f.hp / f.max, 0, 1);
      const bar = $(`${pre}-hp`);
      bar.style.width = `${pct * 100}%`;
      bar.style.background = pct > 0.5 ? '#5CFF8A' : pct > 0.2 ? '#FFE14D' : '#FF5A5A';
      $(`${pre}-hpt`).textContent = `${Math.max(0, Math.ceil(f.hp))} / ${f.max}`;
      $(`${pre}-pips`).innerHTML = team.map((x, i) => `<i class="${x.hp <= 0 ? 'down' : i === idx ? 'cur' : ''}"></i>`).join('');
    };
    set('bt-foe', cur(1), B.foe, B.fi);
    set('bt-me', cur(0), B.me, B.mi);
    const m = cur(0);
    $('bt-blast').innerHTML = `<b>${C.ELEMENTS[m.sp.el].icon} ${C.ELEMENTS[m.sp.el].move}</b><small>${m.cd.blast ? `Ready in ${m.cd.blast}` : `${adText(m.sp.el, cur(1).sp.el)}`}</small>`;
    $('bt-strike').innerHTML = '<b>🗡️ Strike</b><small>Reliable hit</small>';
    $('bt-guard').innerHTML = `<b>🛡️ Guard</b><small>${m.cd.guard ? `Ready in ${m.cd.guard}` : 'Block + heal a bit'}</small>`;
    $('bt-blast').disabled = B.busy || m.cd.blast > 0;
    $('bt-guard').disabled = B.busy || m.cd.guard > 0;
    $('bt-strike').disabled = B.busy;
    $('bt-swap').disabled = B.busy || B.me.filter((f) => f.hp > 0).length < 2;
  }

  function adText(a, d) {
    const x = C.advantage(a, d);
    return x > 1.3 ? 'Super effective' : x > 1 ? 'Effective' : x < 1 ? 'Not very effective' : 'Big hit, cooldown 2';
  }

  function log(text) {
    $('bt-log').textContent = text;
  }

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  function aiMove(f, target) {
    const adv = C.advantage(f.sp.el, target.sp.el);
    if (f.cd.blast === 0 && (adv >= 1 || Math.random() < 0.4)) return 'blast';
    if (f.cd.guard === 0 && f.hp < f.max * 0.45 && Math.random() < 0.5) return 'guard';
    return 'strike';
  }

  async function choose(move) {
    if (!B || B.busy) return;
    const me = cur(0), foe = cur(1);
    if (MOVES[move].cd && me.cd[move] > 0) return;
    B.busy = true;
    hud();
    const theirs = aiMove(foe, me);
    const order = [[me, move, foe], [foe, theirs, me]];
    order.sort((a, b) => {
      const pa = a[1] === 'guard' ? 1 : 0, pb = b[1] === 'guard' ? 1 : 0;
      if (pa !== pb) return pb - pa;
      return b[0].st.spd - a[0].st.spd || (Math.random() - 0.5);
    });
    for (const [who, mv, target] of order) {
      if (!B) return;
      if (who.hp <= 0 || target.hp <= 0) continue;
      await act(who, mv, target);
    }
    if (!B) return;
    // End of turn: shields drop, cooldowns tick.
    for (const f of [me, foe]) {
      f.guard = false;
      for (const k of Object.keys(f.cd)) f.cd[k] = Math.max(0, f.cd[k] - 1);
    }
    await afterFaints();
    if (!B || B.outcome) return;
    B.busy = false;
    hud();
  }

  async function act(who, mv, target) {
    const M = MOVES[mv];
    if (M.cd) who.cd[mv] = M.cd + 1;
    const el = C.ELEMENTS[who.sp.el];
    if (mv === 'guard') {
      who.guard = true;
      who.anim.shield = 1;
      const heal = Math.round(who.max * 0.08);
      who.hp = Math.min(who.max, who.hp + heal);
      log(`${who.sp.name} guards!`);
      sfx.guard();
      hud();
      await wait(650);
      return;
    }
    const adv = mv === 'blast' ? C.advantage(who.sp.el, target.sp.el) : 1;
    const crit = Math.random() < 0.1;
    let dmg = who.st.atk * M.power * adv * rand(0.9, 1.1) * (crit ? 1.5 : 1);
    if (target.guard) dmg *= 0.4;
    dmg = Math.max(1, Math.round(dmg));
    log(mv === 'blast' ? `${who.sp.name} used ${el.move}!` : `${who.sp.name} strikes!`);
    who.anim.lunge = 1;
    who.anim.mouth = 1;
    if (mv === 'blast') {
      sfx.blast(who.sp.el);
      B.fx.push({ kind: 'blast', from: who.side, t: 0, dur: 0.45, color: el.color });
      await wait(450);
    } else {
      sfx.strike();
      await wait(220);
    }
    if (!B) return;
    target.hp = Math.max(0, target.hp - dmg);
    target.anim.hurt = 1;
    const p = pos(target.side);
    B.nums.push({ text: `-${dmg}${crit ? '!' : ''}`, x: p[0], y: p[1] - p[2] * 0.9, life: 1.1, color: adv > 1 ? '#FFE14D' : '#FFFFFF' });
    for (let i = 0; i < (mv === 'blast' ? 22 : 10); i++) spark(p[0], p[1] - p[2] * 0.5, mv === 'blast' ? el.color : '#FFFFFF');
    if (adv > 1.3) log('Super effective!');
    else if (adv < 1) log('Not very effective…');
    else if (target.guard) log(`${target.sp.name} blocked most of it.`);
    else if (crit) log('Critical hit!');
    hud();
    await wait(650);
  }

  async function afterFaints() {
    const foe = cur(1), me = cur(0);
    if (foe.hp <= 0) {
      foe.anim.faint = 0.001;
      sfx.faint();
      log(`${foe.sp.name} fainted!`);
      await wait(900);
      if (!B) return;
      const next = B.foe.findIndex((f) => f.hp > 0);
      if (next < 0) return end(true);
      B.fi = next;
      log(`${cur(1).sp.name} steps up!`);
      cur(1).anim.mouth = 1;
      sfx.roar();
      hud();
      await wait(500);
    }
    if (!B) return;
    if (me.hp <= 0) {
      me.anim.faint = 0.001;
      sfx.faint();
      log(`${me.sp.name} fainted!`);
      await wait(900);
      if (!B) return;
      const next = B.me.findIndex((f) => f.hp > 0);
      if (next < 0) return end(false);
      B.mi = next;
      log(`Go, ${cur(0).sp.name}!`);
      hud();
      await wait(400);
    }
  }

  function openSwap() {
    if (!B || B.busy) return;
    const list = $('bt-swap-list');
    list.innerHTML = B.me.map((f, i) => `<button class="swap-item" data-i="${i}" ${f.hp <= 0 || i === B.mi ? 'disabled' : ''}>
      <b>${RB.util.esc(f.sp.name)}</b> Lv ${f.c.lvl} ${C.ELEMENTS[f.sp.el].icon}<small>${Math.ceil(f.hp)} / ${f.max} HP</small></button>`).join('')
      + '<button class="swap-item cancel" data-i="-1">Cancel</button>';
    $('bt-swap-sheet').hidden = false;
    list.querySelectorAll('button').forEach((b) => b.addEventListener('click', async () => {
      $('bt-swap-sheet').hidden = true;
      const i = +b.dataset.i;
      if (i < 0 || !B) return;
      // Swapping uses your turn.
      B.busy = true;
      B.mi = i;
      log(`Go, ${cur(0).sp.name}!`);
      hud();
      await wait(500);
      if (!B) return;
      const foe = cur(1);
      await act(foe, aiMove(foe, cur(0)), cur(0));
      if (!B) return;
      for (const f of [cur(0), foe]) { f.guard = false; for (const k of Object.keys(f.cd)) f.cd[k] = Math.max(0, f.cd[k] - 1); }
      await afterFaints();
      if (!B || B.outcome) return;
      B.busy = false;
      hud();
    }));
  }

  function end(win, fled) {
    B.busy = true;
    B.outcome = { win, fled: !!fled };
    if (fled) { const d = B.done, o = B.outcome; close(); d(o); return; }
    if (win) sfx.win(); else sfx.lose();
    $('bt-result-title').textContent = win ? 'Victory!' : 'Defeated';
    $('bt-result-text').textContent = win
      ? (B.opts.winText || 'The guardians are down.')
      : 'Your team was knocked out. Level up your creatures with DNA and try again.';
    $('bt-result').hidden = false;
  }

  /* ------------------ Drawing ------------------ */

  // Screen spot of each side's creature: [x, groundY, heightPx].
  function pos(side) {
    const f = cur(side);
    const base = Math.min(Wd * 0.34, Ht * 0.3);
    const h = base * clamp(0.65 + Math.log2(f.sp.size) * 0.2, 0.6, 1.25);
    return side === 0 ? [Wd * 0.3, Ht * 0.7, h * 1.1] : [Wd * 0.7, Ht * 0.44, h * 0.85];
  }

  function spark(x, y, color) {
    const a = Math.random() * TAU, s = rand(80, 300);
    B.fx.push({ kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, t: 0, dur: rand(0.4, 0.8), color });
  }

  function update(dt) {
    if (!B) return;
    B.t += dt;
    for (const f of B.me.concat(B.foe)) {
      const a = f.anim;
      a.lunge = Math.max(0, a.lunge - dt * 3);
      a.hurt = Math.max(0, a.hurt - dt * 2.5);
      a.shield = Math.max(0, a.shield - dt * 0.8);
      a.mouth = Math.max(0, a.mouth - dt * 1.5);
      if (a.faint > 0) a.faint = Math.min(1, a.faint + dt * 1.6);
    }
    for (const x of B.fx) {
      x.t += dt;
      if (x.kind === 'spark') { x.x += x.vx * dt; x.y += x.vy * dt; x.vy += 500 * dt; }
    }
    B.fx = B.fx.filter((x) => x.t < x.dur);
    for (const n of B.nums) { n.life -= dt; n.y -= 40 * dt; }
    B.nums = B.nums.filter((n) => n.life > 0);
    render();
  }

  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, Ht);
    g.addColorStop(0, '#0B0620');
    g.addColorStop(0.5, '#2A1150');
    g.addColorStop(1, '#0C0818');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, Wd, Ht);
    // Swirling rift behind the enemy
    ctx.save();
    ctx.translate(Wd * 0.7, Ht * 0.26);
    for (let i = 0; i < 5; i++) {
      ctx.rotate(B.t * 0.15 + i);
      ctx.strokeStyle = `rgba(180,92,255,${0.08 + i * 0.03})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, 0, Wd * (0.18 + i * 0.05), Ht * 0.05 + i * 6, 0, 0, TAU); ctx.stroke();
    }
    ctx.restore();

    for (const side of [1, 0]) {
      const f = cur(side);
      const [x, y, h] = pos(side);
      // Platform
      ctx.fillStyle = side === 0 ? 'rgba(46,230,197,0.14)' : 'rgba(255,79,163,0.14)';
      ctx.strokeStyle = side === 0 ? 'rgba(46,230,197,0.5)' : 'rgba(255,79,163,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(x, y + 4, h * 0.75, h * 0.16, 0, 0, TAU); ctx.fill(); ctx.stroke();
      const a = f.anim;
      const dir = side === 0 ? 1 : -1;
      const lx = Math.sin(a.lunge * Math.PI) * h * 0.35 * dir;
      const shake = a.hurt > 0 ? Math.sin(B.t * 60) * 6 * a.hurt : 0;
      const fly = f.sp.plan === 'flyer' ? h * 0.25 + Math.sin(B.t * 2) * 5 : 0;
      C.draw(ctx, f.sp.id, {
        x: x + lx + shake - dir * h * 0.1, y: y - fly + a.faint * h * 0.3, h: h, t: B.t + side * 1.3,
        walk: a.lunge > 0 ? 1 : 0, face: dir, mouth: a.mouth,
        tint: a.hurt * 0.7, tintCol: '#FF4040', alpha: 1 - a.faint, shadow: f.sp.plan !== 'flyer', seed: side,
      });
      if (a.shield > 0) {
        ctx.save();
        ctx.globalAlpha = a.shield;
        ctx.strokeStyle = '#9FE8FF';
        ctx.fillStyle = 'rgba(159,232,255,0.15)';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#9FE8FF';
        ctx.shadowBlur = 16;
        ctx.beginPath(); ctx.ellipse(x, y - fly - h * 0.5, h * 0.75, h * 0.62, 0, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.restore();
      }
    }

    for (const x of B.fx) {
      if (x.kind === 'blast') {
        const a = pos(x.from), b = pos(1 - x.from);
        const k = x.t / x.dur;
        const px = lerp(a[0], b[0], k), py = lerp(a[1] - a[2] * 0.6, b[1] - b[2] * 0.5, k) - Math.sin(k * Math.PI) * 40;
        ctx.save();
        ctx.shadowColor = x.color;
        ctx.shadowBlur = 25;
        ctx.fillStyle = x.color;
        ctx.beginPath(); ctx.arc(px, py, 14 + Math.sin(k * 20) * 3, 0, TAU); ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath(); ctx.arc(px, py, 6, 0, TAU); ctx.fill();
        ctx.restore();
      } else {
        ctx.globalAlpha = 1 - x.t / x.dur;
        ctx.fillStyle = x.color;
        ctx.beginPath(); ctx.arc(x.x, x.y, 3.5, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    ctx.textAlign = 'center';
    for (const n of B.nums) {
      ctx.globalAlpha = clamp(n.life / 0.4, 0, 1);
      ctx.font = '700 28px "Chakra Petch", system-ui, sans-serif';
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(10,5,20,0.85)';
      ctx.strokeText(n.text, n.x, n.y);
      ctx.fillStyle = n.color;
      ctx.fillText(n.text, n.x, n.y);
    }
    ctx.globalAlpha = 1;
  }

  RB.battle = {
    init, start, update, resize,
    get active() { return !!B; },
  };
})(window.RB);
