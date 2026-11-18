/* Rollmancer — the DOM side: the HUD around the battle, the shop, the
   title and setup screens, and every pop-up sheet (rewards, boons,
   etching, charm details, your dice, combos, codex, settings, how to
   play, run over). Game flow lives in main.js (RM.game). */
(function (RM) {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const esc = RM.escapeHtml;
  const A = () => RM.audio;
  const G = () => RM.game;
  const P = () => RM.profile.get();

  const ui = {};
  RM.ui = ui;

  /* ---------------- rich text ---------------- */
  ui.rich = function (s) {
    return esc(s).replace(/\{([pmxgk]):([^}]*)\}/g, (all, k, t) => '<span class="' + k + '">' + t + '</span>');
  };
  const plain = (s) => String(s).replace(/\{[pmxgk]:([^}]*)\}/g, '$1');

  const RARITY = ['', 'Common', 'Uncommon', 'Rare'];

  /* ---------------- toasts ---------------- */
  ui.toast = function (icon, text) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = (icon ? '<span class="ic">' + icon + '</span>' : '') + '<span>' + ui.rich(text) + '</span>';
    $('toasts').appendChild(t);
    setTimeout(() => t.remove(), 2600);
  };
  ui.unlocks = function (list) {
    list.forEach((u, i) => setTimeout(() => {
      const pre = u.kind === 'feat' ? 'Feat: {k:' : u.kind === 'charm' ? 'New charm: {k:' : u.kind === 'skin' ? 'New dice skin: {k:' : '{k:';
      ui.toast(u.icon, pre + u.name + '}' + (u.kind === 'set' ? ' unlocked!' : ''));
      A().level();
    }, i * 900));
  };

  /* ---------------- sheets ---------------- */
  let sheetOnClose = null;
  let sheetLocked = false;
  ui.sheet = function (html, o) {
    o = o || {};
    const sh = $('sheet');
    $('sheet-body').innerHTML = html;
    sh.classList.toggle('center', !!o.center);
    sh.hidden = false;
    sheetOnClose = o.onClose || null;
    sheetLocked = !!o.locked;
    $('sheet-body').scrollTop = 0;
    sh.querySelector('.sheet-card').scrollTop = 0;
    RM.profile.host.overlay(true);
    return $('sheet-body');
  };
  ui.closeSheet = function (force) {
    const sh = $('sheet');
    if (sh.hidden) return false;
    if (sheetLocked && !force) return true;
    sh.hidden = true;
    $('sheet-body').innerHTML = '';
    const cb = sheetOnClose;
    sheetOnClose = null;
    sheetLocked = false;
    RM.profile.host.overlay(false);
    if (cb) cb();
    return true;
  };
  ui.sheetOpen = () => !$('sheet').hidden;
  $('sheet').addEventListener('pointerdown', (e) => {
    if (e.target === $('sheet') && !sheetLocked) { A().tap(); ui.closeSheet(); }
  });

  // Wire up every [data-act] button inside an element.
  function on(root, map) {
    root.querySelectorAll('[data-act]').forEach((el) => {
      const f = map[el.dataset.act];
      if (f) el.addEventListener('click', (e) => { e.stopPropagation(); f(el, e); });
    });
  }

  /* ---------------- hearts, gold, depth ---------------- */
  function heartsHtml(run) {
    let h = '';
    for (let i = 0; i < run.maxHearts; i++) h += '<i class="' + (i < run.hearts ? '' : 'empty') + '"></i>';
    return h;
  }
  ui.hearts = function (run, popLost) {
    $('hearts').innerHTML = heartsHtml(run);
    $('shop-hearts').innerHTML = heartsHtml(run);
    if (popLost) {
      const el = $('hearts').children[run.hearts];
      if (el) el.classList.add('pop');
    }
  };
  let shownGold = null;
  ui.gold = function (run) {
    [$('gold'), $('shop-gold')].forEach((el) => {
      el.querySelector('span').textContent = RM.fmt(run.gold);
      if (shownGold != null && shownGold !== run.gold) {
        el.classList.remove('bump');
        void el.offsetWidth;
        el.classList.add('bump');
      }
    });
    shownGold = run.gold;
  };
  ui.depth = function (run) {
    let nodes = '';
    const base = (run.depth - 1) * 3;
    const hist = historyByFight(run);
    for (let s = 0; s < 3; s++) {
      const h = hist[base + s];
      const cls = (h === 'W' ? 'done' : h === 'L' ? 'lost' : s === run.stage && run.phase === 'fight' ? 'cur' : '') + (s === 2 ? ' boss' : '');
      nodes += '<i class="' + cls + '"></i>';
    }
    $('depth').innerHTML = '<span>Depth ' + run.depth + '</span><span class="nodes">' + nodes + '</span>';
  };
  // history[] may hold extra entries for Pipwyrm retries; map them to fight slots.
  function historyByFight(run) {
    const out = [];
    let slot = 0;
    run.history.forEach((h, i) => {
      out[slot] = h;
      const retry = h === 'L' && slot === 23 && !run.endless;
      if (!retry) slot++;
    });
    return out;
  }

  /* ---------------- charms row ---------------- */
  function charmBadge(c, run) {
    const d = RM.CHARM[c.id];
    if (!d.cur) return '';
    const s = plain(d.cur(c, run)).split(' ')[0];
    return s === '+0' || s === '×1' ? '' : s;
  }
  ui.charmRow = function (container, run, opts) {
    opts = opts || {};
    const asleep = (run.fight && run.fight.asleep) || [];
    let h = '';
    for (let k = 0; k < run.charmSlots; k++) {
      const c = run.charms[k];
      if (!c) { h += '<div class="charm empty" aria-hidden="true"></div>'; continue; }
      const d = RM.CHARM[c.id];
      const b = charmBadge(c, run);
      h += '<button type="button" class="charm r' + d.r + (asleep.includes(k) ? ' asleep' : '') + '" data-k="' + k + '" aria-label="' + esc(d.name) + '">' + d.icon +
        (b ? '<span class="badge">' + esc(b) + '</span>' : '') + '</button>';
    }
    container.innerHTML = h;
    container.classList.toggle('compact', run.charmSlots > 5);
    container.querySelectorAll('.charm[data-k]').forEach((el) => {
      el.addEventListener('click', () => {
        if (RM.battle.busy) return;
        A().tap();
        ui.showCharm(+el.dataset.k, opts.where || 'battle');
      });
    });
  };
  ui.charmEl = (k) => $('charms').querySelector('.charm[data-k="' + k + '"]');

  /* ---------------- battle HUD ---------------- */
  ui.renderBattle = function () {
    const run = G().run;
    const f = run.fight;
    if (!f) return;
    ui.hearts(run);
    ui.gold(run);
    ui.depth(run);
    const m = f.mon;
    $('mon-name').textContent = m.name;
    let tags = '';
    if (m.boss) tags += '<div class="tag-chip curse"><b>Boss</b>' + ui.rich(RM.BOSS[m.key].curse) + '</div>';
    if (m.trait) tags += '<div class="tag-chip trait"><b>' + esc(RM.TRAIT[m.trait].name) + '</b>' + ui.rich(RM.TRAIT[m.trait].text) + '</div>';
    if (m.move) {
      const mv = RM.MOVES[m.move];
      const when = (m.mcd || 2) <= 1 ? 'after your next cast' : 'in ' + m.mcd + ' casts';
      tags += '<div class="tag-chip move' + ((m.mcd || 2) <= 1 ? ' soon' : '') + '"><b>' + mv.icon + ' ' + esc(mv.name) + '</b>' + when + ': ' + ui.rich(mv.text) + '</div>';
    }
    $('mon-tags').innerHTML = tags;
    $('hpbar').classList.toggle('boss', !!m.boss);
    ui.hp(true);
    ui.charmRow($('charms'), run);
    ui.belt();
    ui.buttons();
  };

  ui.hp = function (instant) {
    const run = G().run;
    if (!run.fight) return;
    const m = run.fight.mon;
    const k = Math.max(0, m.hp / m.max) * 100;
    const fill = $('hpbar').querySelector('.fill');
    const chip = $('hpbar').querySelector('.chip');
    if (instant) {
      fill.style.transition = chip.style.transition = 'none';
      void fill.offsetWidth;
    }
    fill.style.width = k + '%';
    chip.style.width = k + '%';
    if (instant) requestAnimationFrame(() => { fill.style.transition = chip.style.transition = ''; });
    $('hp-text').textContent = RM.fmt(m.hp) + ' / ' + RM.fmt(m.max);
  };

  ui.buttons = function () {
    const run = G().run;
    const f = run.fight;
    const busy = RM.battle.busy || !f || f.pending;
    const rc = f ? RM.rules.rerollCost(run) : { ok: false };
    const rb = $('btn-reroll');
    rb.disabled = busy || !rc.ok;
    rb.classList.toggle('pay', !!(f && f.rerolls <= 0 && RM.rules.hasCharm(run, 'devil')));
    let label = f ? String(f.rerolls) : '0';
    if (f && f.rerolls <= 0 && RM.rules.hasCharm(run, 'devil')) label = '$' + (2 + (f.mon.curse === 'miser' ? 1 : 0));
    else if (f && f.mon.curse === 'miser' && f.rerolls > 0) label = f.rerolls + ' · $1';
    rb.querySelector('.ct').textContent = label;
    const cb = $('btn-cast');
    cb.disabled = busy;
    cb.querySelector('.ct').textContent = f ? f.casts : 0;
    // Glow when the dice showing would finish the monster off.
    const lethal = !busy && f && ui.lastPreview && ui.lastPreview.dmg >= f.mon.hp && !RM.battle.rolling();
    cb.classList.toggle('lethal', !!lethal);
  };

  ui.belt = function () {
    const run = G().run;
    const el = $('belt');
    if (!run.belt.length) { el.innerHTML = ''; return; }
    el.innerHTML = run.belt.map((id, i) => {
      const t = RM.TRINKET[id];
      return '<button type="button" class="trinket' + (G().targeting && G().targeting.slot === i ? ' on' : '') + '" data-i="' + i + '"><span class="ic">' + t.icon + '</span>' + esc(t.name) + '</button>';
    }).join('');
    el.querySelectorAll('.trinket').forEach((b) => b.addEventListener('click', () => {
      if (RM.battle.busy) return;
      A().tap();
      ui.showTrinket(+b.dataset.i);
    }));
  };

  ui.prompt = function (text) {
    const el = $('prompt');
    if (!text) { el.hidden = true; return; }
    el.innerHTML = ui.rich(text);
    el.hidden = false;
  };

  /* ---------------- the readout ---------------- */
  let lastRo = { pips: null, mult: null, dmg: null };
  function setNum(el, v, kind) {
    const txt = kind === 'mult' ? RM.fmtMult(v) : RM.fmt(v);
    if (el.textContent !== txt) {
      el.textContent = txt;
      el.classList.remove('bump');
      void el.offsetWidth;
      el.classList.add('bump');
    }
  }
  // The big number spins up to its total.
  function countUp(el, to) {
    const t0 = performance.now();
    const dur = Math.min(520, 220 + Math.log10(Math.max(10, to)) * 50);
    el.classList.remove('bump');
    const tick = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      el.textContent = RM.fmt(to * e);
      if (k < 1) requestAnimationFrame(tick);
      else { el.textContent = RM.fmt(to); void el.offsetWidth; el.classList.add('bump'); }
    };
    requestAnimationFrame(tick);
  }
  // r: an evaluate() result; phase: 'preview' | 'base' | step kind | 'total'
  ui.readout = function (r, phase) {
    const combo = $('ro-combo');
    const dmgEl = $('ro-dmg');
    if (!r) {
      combo.classList.add('none');
      combo.querySelector('.nm').textContent = '…';
      combo.querySelector('.lv').textContent = '';
      $('ro-pips').textContent = '–';
      $('ro-mult').textContent = '–';
      dmgEl.textContent = '–';
      dmgEl.classList.remove('kill');
      return;
    }
    const run = G().run;
    combo.classList.remove('none');
    combo.querySelector('.nm').textContent = RM.COMBO[r.combo].name;
    combo.querySelector('.lv').textContent = 'lvl ' + r.level;
    setNum($('ro-pips'), r.pips, 'pips');
    setNum($('ro-mult'), r.mult, 'mult');
    if (phase === 'total') {
      countUp(dmgEl, r.dmg);
      const kill = run.fight && r.dmg >= run.fight.mon.hp;
      dmgEl.classList.toggle('kill', !!kill);
    } else if (phase === 'preview') {
      setNum(dmgEl, r.dmg, 'dmg');
      const kill = run.fight && r.dmg >= run.fight.mon.hp;
      dmgEl.classList.toggle('kill', !!kill);
    } else if (phase === 'base') {
      dmgEl.textContent = '?';
      dmgEl.classList.remove('kill');
    }
    let luck = $('readout').querySelector('.luck');
    if (phase === 'preview' && r.lucky) {
      if (!luck) {
        luck = document.createElement('span');
        luck.className = 'luck';
        $('readout').appendChild(luck);
      }
      luck.textContent = '+ luck';
    } else if (luck) luck.remove();
  };
  ui.preview = function () {
    const run = G().run;
    ui.lastPreview = null;
    if (!run.fight || RM.battle.rolling()) { ui.readout(null); ui.buttons(); return; }
    ui.lastPreview = RM.rules.best(run, false);
    ui.readout(ui.lastPreview, 'preview');
    ui.buttons();
  };

  /* ---------------- charm & trinket details ---------------- */
  ui.showCharm = function (k, where) {
    const run = G().run;
    const c = run.charms[k];
    if (!c) return;
    const d = RM.CHARM[c.id];
    const cur = d.cur ? '<p class="cur">Currently ' + ui.rich(d.cur(c, run)) + '</p>' : '';
    const asleep = run.fight && (run.fight.asleep || []).includes(k) ? '<p class="cur">💤 Asleep this turn</p>' : '';
    const body = ui.sheet(
      '<div class="detail-head"><div class="big-ic">' + d.icon + '</div><div><div class="rar">' + RARITY[d.r] + ' charm</div><h2>' + esc(d.name) + '</h2></div></div>' +
      '<p class="detail-desc">' + ui.rich(d.text) + '</p>' + cur + asleep +
      '<p class="muted" style="font-size:13px">Charms work left to right, so order matters for ×Mult.</p>' +
      '<div class="btns row">' +
      '<button class="btn small ghost" data-act="left" ' + (k === 0 ? 'disabled' : '') + '>◀ Move</button>' +
      '<button class="btn small ghost" data-act="right" ' + (k >= run.charms.length - 1 ? 'disabled' : '') + '>Move ▶</button>' +
      '</div><div class="btns">' +
      '<button class="btn red" data-act="sell">Sell for $' + RM.rules.sellValue(run, k) + '</button>' +
      '<button class="btn ghost" data-act="close">Close</button></div>'
    );
    on(body, {
      left: () => { RM.rules.moveCharm(run, k, -1); A().tap(); G().changed(); ui.closeSheet(); ui.showCharm(k - 1, where); },
      right: () => { RM.rules.moveCharm(run, k, 1); A().tap(); G().changed(); ui.closeSheet(); ui.showCharm(k + 1, where); },
      sell: () => {
        ui.confirm('Sell ' + d.name + '?', 'You get {g:$' + RM.rules.sellValue(run, k) + '} back.', 'Sell', () => {
          const v = RM.rules.sellCharm(run, k);
          A().sell();
          ui.toast(d.icon, 'Sold for {g:$' + v + '}');
          G().changed();
        });
      },
      close: () => ui.closeSheet(),
    });
  };

  ui.showTrinket = function (slot) {
    const run = G().run;
    const id = run.belt[slot];
    const t = RM.TRINKET[id];
    const body = ui.sheet(
      '<div class="detail-head"><div class="big-ic">' + t.icon + '</div><div><div class="rar">Trinket</div><h2>' + esc(t.name) + '</h2></div></div>' +
      '<p class="detail-desc">' + ui.rich(t.text) + '</p><p class="muted" style="font-size:13px">Used up when you use it.</p>' +
      '<div class="btns"><button class="btn gold" data-act="use">Use</button><button class="btn ghost" data-act="close">Close</button></div>'
    );
    on(body, {
      use: () => { ui.closeSheet(); G().startTrinket(slot); },
      close: () => ui.closeSheet(),
    });
  };

  ui.confirm = function (title, text, yes, fn, danger) {
    const body = ui.sheet('<h2>' + esc(title) + '</h2><p class="center muted">' + ui.rich(text) + '</p>' +
      '<div class="btns row"><button class="btn ghost" data-act="no">Cancel</button><button class="btn ' + (danger === false ? 'gold' : 'red') + '" data-act="yes">' + esc(yes) + '</button></div>', { center: true });
    on(body, { no: () => ui.closeSheet(), yes: () => { ui.closeSheet(true); fn(); } });
  };

  /* ---------------- reward / boon / run over ---------------- */
  ui.showReward = function () {
    const run = G().run;
    const res = run.result;
    let h;
    if (res.won) {
      h = '<h2 class="big-title">' + (res.boss ? 'Boss down!' : 'Victory!') + '</h2><p class="center muted">' + esc(res.name) + ' is defeated.</p><div class="reward-lines">';
      res.lines.forEach((l, i) => {
        h += '<div style="animation-delay:' + (0.08 * i) + 's"><span>' + (l.icon ? l.icon + ' ' : '') + esc(l.text) + '</span><b>+$' + l.gold + '</b></div>';
      });
      h += '<div class="total" style="animation-delay:' + (0.08 * res.lines.length) + 's"><span>Total</span><b>+$' + res.total + '</b></div></div>';
      res.notes.forEach((n) => { h += '<p class="notes">' + esc(n.text) + '</p>'; });
      res.broken.forEach((id) => { h += '<p class="notes">' + RM.CHARM[id].icon + ' ' + esc(RM.CHARM[id].name) + ' shattered!</p>'; });
    } else {
      h = '<h2 class="big-title bad">Overwhelmed</h2>';
      if (res.saved) h += '<p class="center">🌟 The Guardian Star flares and fades. You keep your last heart.</p>';
      else h += '<p class="center">You lose a heart. ' + (run.hearts === 1 ? '<span class="k">Only one left!</span>' : run.hearts + ' left.') + '</p>';
      if (res.retry) h += '<p class="center muted">The Pipwyrm still blocks the way down. Regroup in the bazaar and face it again.</p>';
      else h += '<p class="center muted">' + esc(res.name) + ' drives you deeper into the dark. No gold this time.</p>';
    }
    h += '<div class="btns"><button class="btn big gold" data-act="go">' + (res.won && res.boss && !res.final ? 'Claim a boon' : res.final && res.won ? 'Onward' : 'To the bazaar') + '</button></div>';
    const body = ui.sheet(h, { center: true, locked: true });
    on(body, { go: () => { A().tap(); ui.closeSheet(true); G().claimReward(); } });
  };

  ui.showBoon = function () {
    const run = G().run;
    const b = run.boon;
    let h = '<h2>A boon from the deep</h2><p class="center muted">Choose one gift for the rest of your run.</p><div class="boons">';
    b.choices.forEach((id, i) => {
      const d = RM.BOON[id];
      let text = d.text;
      if (id === 'relic' && b.relic) text = 'A free rare charm: {k:' + RM.CHARM[b.relic].name + '} ' + RM.CHARM[b.relic].icon;
      h += '<button class="boon" data-act="pick" data-id="' + id + '" style="animation-delay:' + (i * 0.08) + 's"><span class="ic">' + d.icon + '</span><span><b>' + esc(d.name) + '</b><span>' + ui.rich(text) + '</span></span></button>';
    });
    h += '</div>';
    const body = ui.sheet(h, { center: true, locked: true });
    on(body, {
      pick: (el) => {
        const id = el.dataset.id;
        A().level();
        if (id === 'relic' && b.relic) {
          setTimeout(() => ui.toast(RM.CHARM[b.relic].icon, RM.CHARM[b.relic].name + ': ' + RM.CHARM[b.relic].text), 300);
        }
        if (id === 'wild') {
          ui.closeSheet(true);
          ui.showEtch({ kind: 'boon', id: 'wild' });
          return;
        }
        ui.closeSheet(true);
        G().chooseBoon(id);
      },
    });
  };

  ui.showOver = function (summary) {
    const run = summary.run;
    const st = run.stats;
    const fav = Object.entries(st.casts).sort((a, b) => b[1] - a[1])[0];
    let h = '<h2 class="big-title ' + (run.won ? '' : 'bad') + '">' + (run.won ? (run.trial ? 'Trial complete!' : 'Triumph!') : 'Run over') + '</h2>';
    if (run.trial) h += '<p class="center"><span class="k">' + RM.TRIAL[run.trial].icon + ' ' + esc(RM.TRIAL[run.trial].name) + '</span>' + (run.won ? ': medal earned' : '') + '</p>';
    h += '<p class="center muted">' + esc(RM.DICE_SET[run.set].name) + (run.heat ? ' · Heat ' + run.heat : '') + (run.daily ? ' · Daily #' + RM.dailyNumber(new Date(run.daily + 'T12:00:00')) : '') + ' · Seed ' + RM.seedCode(run.seed) + '</p>';
    h += '<div class="history">' + RM.rules.historyLine(run) + '</div>';
    h += '<div class="over-stats">' +
      '<div><b>' + run.depth + '</b>Depth reached</div>' +
      '<div><b>' + st.fightsWon + '</b>Fights won</div>' +
      '<div><b>' + RM.fmt(st.bestCast) + '</b>Best cast' + (st.bestCombo ? ' (' + esc(RM.COMBO[st.bestCombo].short) + ')' : '') + '</div>' +
      '<div><b>' + RM.fmt(st.totalDmg) + '</b>Total damage</div>' +
      '<div><b>' + (fav ? esc(RM.COMBO[fav[0]].short) : '–') + '</b>Favourite combo</div>' +
      '<div><b>' + run.charms.length + '</b>Charms at the end</div></div>';
    h += '<div class="btns"><button class="btn gold" data-act="share">Share result</button>' +
      '<button class="btn big" data-act="again">' + (run.daily ? 'New run' : 'Play again') + '</button>' +
      '<button class="btn ghost" data-act="title">Title screen</button></div>';
    const body = ui.sheet(h, { center: true, locked: true });
    on(body, {
      share: () => ui.share(run),
      again: () => { ui.closeSheet(true); G().toSetup(run.daily ? null : run.set, run.daily ? null : run.heat); },
      title: () => { ui.closeSheet(true); G().toTitle(); },
    });
  };

  ui.showVictory = function () {
    const run = G().run;
    const h = '<h2 class="big-title">The Pipwyrm falls!</h2>' +
      (run.trial ? '<p class="center">' + RM.TRIAL[run.trial].icon + ' <span class="k">' + esc(RM.TRIAL[run.trial].name) + '</span> trial complete: medal earned!</p>' : '<p class="center">You are a true <span class="k">Rollmancer</span>.</p>') +
      '<p class="center muted">The run counts as a win. You can stop here, or keep descending into endless Depths where the monsters never stop getting stronger.</p>' +
      '<div class="btns"><button class="btn big gold" data-act="endless">Keep descending</button><button class="btn ghost" data-act="end">End the run</button></div>';
    const body = ui.sheet(h, { center: true, locked: true });
    on(body, {
      endless: () => { ui.closeSheet(true); G().goEndless(); },
      end: () => { ui.closeSheet(true); G().endRun(); },
    });
  };

  ui.share = function (run) {
    const st = run.stats;
    const head = run.daily ? 'Rollmancer Daily #' + RM.dailyNumber(new Date(run.daily + 'T12:00:00')) : 'Rollmancer · ' + RM.DICE_SET[run.set].name + (run.heat ? ' · Heat ' + run.heat : '');
    const text = head + '\n' + RM.rules.historyLine(run) + '\nDepth ' + run.depth + ' · ' + st.fightsWon + ' fights · best cast ' + RM.fmt(st.bestCast) + (run.daily ? '' : '\nSeed ' + RM.seedCode(run.seed));
    ui.shareText(text);
  };
  ui.shareText = function (text) {
    RM.profile.host.share(text).then((how) => {
      if (how === 'copied') ui.toast('📋', 'Result copied');
      else if (how === 'failed') ui.toast('📋', text);
    });
  };

  /* ---------------- etching a die face ---------------- */
  // job: {kind:'shop', item} | {kind:'boon', id:'wild'}
  ui.showEtch = function (job) {
    const run = G().run;
    const id = job.kind === 'shop' ? job.item.id : job.kind === 'event' ? job.stone : 'wild';
    const twin = id === 'twin';
    let pick = null; // for twin: [di, fi]
    const name = job.kind === 'boon' ? 'Wild Spark' : RM.STONE[id].name;
    const text = job.kind === 'boon' ? 'Etch {k:Wild} onto any face: it counts as whatever number you need.' : RM.STONE[id].text;
    const draw = () => {
      let h = '<h2>' + esc(name) + '</h2><p class="center muted">' + ui.rich(text) + '</p>';
      h += '<p class="center k" style="font-size:14px">' + (twin ? (pick ? 'Now tap the face to overwrite (same die).' : 'Tap the face to copy.') : 'Tap a face to etch it.') + '</p>';
      h += '<div class="dice-list" id="etch-list"></div><div class="btns"><button class="btn ghost" data-act="cancel">' + (job.kind === 'boon' ? 'Back to boons' : job.kind === 'event' ? 'Back' : 'Cancel') + '</button></div>';
      const body = ui.sheet(h, { locked: true });
      const list = body.querySelector('#etch-list');
      run.dice.forEach((faces, di) => {
        const row = document.createElement('div');
        row.className = 'die-row';
        row.innerHTML = '<span class="no">' + (di + 1) + '</span><div class="faces"></div>';
        const fw = row.querySelector('.faces');
        faces.forEach((face, fi) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'face-btn';
          const size = Math.min(44, Math.floor((Math.min(window.innerWidth, 560) - 90) / 6 / 1.18));
          b.appendChild(RM.art.faceCanvas(face, size, run.set));
          let ok;
          if (twin) ok = pick ? pick[0] === di && pick[1] !== fi : true;
          else if (id === 'wild') ok = face.g !== 'wild';
          else ok = RM.rules.stoneFits(id, face);
          b.disabled = !ok;
          if (pick && pick[0] === di && pick[1] === fi) b.classList.add('sel');
          else if (ok) b.classList.add('pick');
          b.addEventListener('click', () => {
            if (twin && !pick) { pick = [di, fi]; A().tap(); draw(); return; }
            if (job.kind === 'event') { ui.closeSheet(true); G().eventChoose(job.k, [di, fi]); return; }
            let done;
            if (job.kind === 'shop') done = RM.rules.applyStone(run, job.item, di, twin ? pick[1] : fi, twin ? fi : undefined);
            else done = RM.rules.chooseBoon(run, 'wild', di, fi) === true;
            if (!done) { A().deny(); return; }
            A().etch();
            ui.closeSheet(true);
            ui.toast('✨', 'Etched onto die ' + (di + 1));
            if (job.kind === 'boon') G().afterBoon();
            else G().changed();
          });
          fw.appendChild(b);
        });
        list.appendChild(row);
      });
      on(body, {
        cancel: () => {
          ui.closeSheet(true);
          if (job.kind === 'boon') ui.showBoon();
          if (job.kind === 'event') ui.showEvent();
        },
      });
    };
    draw();
  };

  /* ---------------- pickers (encounters, swapping) ---------------- */
  const faceSize = () => Math.min(40, Math.floor((Math.min(window.innerWidth, 560) - 110) / 6 / 1.18));
  ui.pickDie = function (title, text, cb, cancel) {
    const run = G().run;
    const body = ui.sheet('<h2>' + esc(title) + '</h2><p class="center muted">' + ui.rich(text) + '</p><div class="dice-list" id="pick-list"></div>' +
      '<div class="btns"><button class="btn ghost" data-act="cancel">Back</button></div>', { locked: true });
    const list = body.querySelector('#pick-list');
    run.dice.forEach((faces, di) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'die-row pickable';
      row.innerHTML = '<span class="no">' + (di + 1) + '</span><div class="faces"></div>';
      faces.forEach((f) => row.querySelector('.faces').appendChild(RM.art.faceCanvas(f, faceSize(), run.set)));
      row.addEventListener('click', () => { A().tap(); ui.closeSheet(true); cb(di); });
      list.appendChild(row);
    });
    on(body, { cancel: () => { ui.closeSheet(true); if (cancel) cancel(); } });
  };
  ui.pickCombo = function (title, text, cb, cancel) {
    const run = G().run;
    const nd = RM.rules.fightFaces(run, null).length;
    let h = '<h2>' + esc(title) + '</h2><p class="center muted">' + ui.rich(text) + '</p><div class="boons">';
    RM.COMBOS.filter((c) => c.min <= nd).reverse().forEach((c) => {
      const st = RM.rules.comboStats(run, c.id);
      h += '<button class="boon slim" data-act="pick" data-id="' + c.id + '"><span><b>' + esc(c.name) + ' <small class="muted">lvl ' + st.level + '</small></b><span><span class="p">' + st.pips + '</span> × <span class="m">' + st.mult + '</span> · cast ' + (run.stats.casts[c.id] || 0) + '× this run</span></span></button>';
    });
    h += '</div><div class="btns"><button class="btn ghost" data-act="cancel">Back</button></div>';
    const body = ui.sheet(h, { locked: true });
    on(body, {
      pick: (el) => { A().tap(); ui.closeSheet(true); cb(el.dataset.id); },
      cancel: () => { ui.closeSheet(true); if (cancel) cancel(); },
    });
  };
  ui.pickCharm = function (title, text, cb, cancel, price) {
    const run = G().run;
    let h = '<h2>' + esc(title) + '</h2><p class="center muted">' + ui.rich(text) + '</p><div class="boons">';
    run.charms.forEach((c, k) => {
      const d = RM.CHARM[c.id];
      const val = price ? price(k) : null;
      h += '<button class="boon slim" data-act="pick" data-k="' + k + '"' + (val === false ? ' disabled' : '') + '><span class="ic">' + d.icon + '</span><span><b>' + esc(d.name) + (val ? ' <small class="g">' + val + '</small>' : '') + '</b><span>' + ui.rich(d.text) + '</span></span></button>';
    });
    h += '</div><div class="btns"><button class="btn ghost" data-act="cancel">Back</button></div>';
    const body = ui.sheet(h, { locked: true });
    on(body, {
      pick: (el) => { A().tap(); ui.closeSheet(true); cb(+el.dataset.k); },
      cancel: () => { ui.closeSheet(true); if (cancel) cancel(); },
    });
  };

  /* ---------------- encounters ---------------- */
  ui.showEvent = function () {
    const run = G().run;
    const ev = run.event;
    if (!ev) return;
    const e = RM.EVENT[ev.id];
    if (ev.result) { ui.showEventResult(); return; }
    let h = '<div class="ev-icon">' + e.icon + '</div><h2>' + esc(e.name) + '</h2><p class="center muted ev-text">' + esc(e.text) + '</p><div class="boons">';
    RM.rules.eventOptions(run).forEach((o, i) => {
      h += '<button class="boon ev-opt" data-act="opt" data-k="' + o.k + '"' + (o.why ? ' disabled' : '') + ' style="animation-delay:' + (i * 0.07) + 's">' +
        '<span class="ic">' + (o.cost ? '<span class="cost"><i class="coin"></i>' + o.cost + '</span>' : '›') + '</span>' +
        '<span><b>' + ui.rich(o.label) + '</b><span>' + (o.why ? '<span class="why">' + esc(o.why) + '</span>' : ui.rich(o.text)) + '</span></span></button>';
    });
    h += '</div><p class="center muted" style="font-size:12.5px;margin-top:10px">You have <span class="g">$' + run.gold + '</span> · ' + run.hearts + ' / ' + run.maxHearts + ' hearts</p>';
    const body = ui.sheet(h, { center: true, locked: true });
    on(body, { opt: (el) => { A().tap(); G().eventChoose(+el.dataset.k); } });
  };
  ui.showEventResult = function () {
    const run = G().run;
    const ev = run.event;
    const e = RM.EVENT[ev.id];
    const res = ev.result;
    let h = '<div class="ev-icon">' + e.icon + '</div><h2>' + esc(e.name) + '</h2>';
    if (res.die) h += '<div class="ev-die" id="ev-die"></div>';
    if (res.charm) h += '<div class="ev-charm">' + RM.CHARM[res.charm].icon + '</div><p class="center muted" style="font-size:14px">' + ui.rich(RM.CHARM[res.charm].text) + '</p>';
    h += '<p class="center ev-result">' + ui.rich(res.text) + '</p><div class="btns"><button class="btn big gold" data-act="go">To the bazaar</button></div>';
    const body = ui.sheet(h, { center: true, locked: true });
    if (res.die) body.querySelector('#ev-die').appendChild(RM.art.faceCanvas({ v: res.die, g: null }, 56, run.set));
    ui.gold(run);
    ui.hearts(run);
    on(body, { go: () => { A().tap(); ui.closeSheet(true); G().leaveEvent(); } });
  };

  /* ---------------- a die's six faces (long-press in a fight) ---------------- */
  ui.showDieFaces = function (i) {
    const run = G().run;
    const f = run.fight;
    if (!f || !f.dice[i]) return;
    const d = f.dice[i];
    const faces = f.faces[d.src];
    const loaded = faces.filter((x) => x.g === 'loaded').length;
    const spare = d.src >= run.dice.length;
    let h = '<h2>Die ' + (i + 1) + (spare ? ' <small class="muted">(Spare Die)</small>' : '') + '</h2><p class="center muted">Its six faces. A reroll can land on any of them' +
      (loaded ? ', Loaded faces twice as often' : '') + '.</p><div class="face-grid" id="fg"></div>';
    const glyphs = [...new Set(faces.map((x) => x.g).filter(Boolean))];
    if (glyphs.length) {
      h += '<div class="grid" style="margin-top:12px">' + glyphs.map((g) => '<div class="entry"><div class="h"><span>' + esc(RM.GLYPHS[g].name) + '</span></div>' + ui.rich(RM.GLYPHS[g].text) + '</div>').join('') + '</div>';
    }
    h += '<div class="btns"><button class="btn ghost" data-act="close">Close</button></div>';
    const body = ui.sheet(h, { center: true });
    const fg = body.querySelector('#fg');
    faces.forEach((face, fi) => {
      const wrap = document.createElement('div');
      wrap.className = 'fg-face' + (fi === d.f ? ' now' : '');
      wrap.appendChild(RM.art.faceCanvas(face, 52, run.set));
      fg.appendChild(wrap);
    });
    on(body, { close: () => ui.closeSheet() });
  };

  /* ---------------- your dice / combos ---------------- */
  ui.showDice = function () {
    const run = G().run;
    let h = '<h2>Your dice</h2><p class="center muted">Every face of every die. Glyphs show in colour.</p><div class="dice-list">';
    h += '</div>';
    const extra = RM.rules.charmMods(run).dice;
    if (extra) h += '<p class="center muted" style="font-size:13px">+ ' + extra + ' plain die from Spare Die</p>';
    h += '<h3>Glyphs</h3><div class="grid" id="glyph-grid"></div><div class="btns"><button class="btn ghost" data-act="close">Close</button></div>';
    const body = ui.sheet(h);
    const list = body.querySelector('.dice-list');
    run.dice.forEach((faces, di) => {
      const row = document.createElement('div');
      row.className = 'die-row';
      row.innerHTML = '<span class="no">' + (di + 1) + '</span><div class="faces"></div>';
      const size = Math.min(44, Math.floor((Math.min(window.innerWidth, 560) - 90) / 6 / 1.18));
      faces.forEach((face) => row.querySelector('.faces').appendChild(RM.art.faceCanvas(face, size, run.set)));
      list.appendChild(row);
    });
    glyphGrid(body.querySelector('#glyph-grid'));
    on(body, { close: () => ui.closeSheet() });
  };
  function glyphGrid(el) {
    RM.GLYPH_IDS.forEach((g) => {
      const G2 = RM.GLYPHS[g];
      const d = document.createElement('div');
      d.className = 'entry';
      d.innerHTML = '<div class="h"></div>' + ui.rich(G2.text);
      const hh = d.querySelector('.h');
      hh.appendChild(RM.art.glyphCanvas(g, 24));
      hh.insertAdjacentHTML('beforeend', '<span>' + esc(G2.name) + '</span>');
      el.appendChild(d);
    });
  }

  ui.showCombos = function () {
    const run = G().run;
    const nd = run ? RM.rules.fightFaces(run, null).length : 5;
    let h = '<h2>Combos</h2><p class="center muted">Damage = <span class="p">Pips</span> × <span class="m">Mult</span>. Pips = the combo\'s base + each scoring die\'s number. Tomes level combos up.</p><table class="combo-table">';
    RM.COMBOS.slice().reverse().forEach((c) => {
      const s = run ? RM.rules.comboStats(run, c.id) : { pips: c.pips, mult: c.mult, level: 1 };
      const locked = c.min > nd;
      const times = run ? run.stats.casts[c.id] || 0 : P().cast[c.id] || 0;
      h += '<tr class="' + (locked ? 'locked' : '') + '"><td>' + esc(c.name) + ' <span class="lv">lvl ' + s.level + '</span><div class="lv">' + esc(c.desc) + '</div></td>' +
        '<td class="nums"><span class="p">' + s.pips + '</span> × <span class="m">' + s.mult + '</span></td><td class="cnt">' + times + '×</td></tr>';
    });
    h += '</table><p class="muted" style="font-size:12.5px">The last column counts your casts of each combo ' + (run ? 'this run' : 'so far') + '.</p><div class="btns"><button class="btn ghost" data-act="close">Close</button></div>';
    const body = ui.sheet(h);
    on(body, { close: () => ui.closeSheet() });
  };

  ui.showMap = function () {
    const run = G().run;
    let h = '<h2>Depth ' + run.depth + ' · ' + esc(RM.rules.areaFor(run.depth).name) + '</h2>';
    h += '<p class="center muted">' + esc(RM.DICE_SET[run.set].name) + (run.heat ? ' · Heat ' + run.heat : '') + ' · Seed ' + RM.seedCode(run.seed) + (run.endless ? ' · Endless' : '') + '</p><div class="dice-list" id="map-list"></div>';
    h += '<div class="btns"><button class="btn ghost" data-act="close">Close</button></div>';
    const body = ui.sheet(h);
    const list = body.querySelector('#map-list');
    const hist = historyByFight(run);
    run.plan.forEach((m, s) => {
      const row = document.createElement('div');
      row.className = 'die-row';
      row.style.gap = '12px';
      const res = hist[(run.depth - 1) * 3 + s];
      const label = ['Minion', 'Brute', 'Boss'][s];
      row.appendChild(RM.art.monsterCanvas(m, 64, 64));
      const info = document.createElement('div');
      info.style.flex = '1';
      info.style.fontSize = '13.5px';
      let tag = '';
      if (m.boss) tag = ui.rich(RM.BOSS[m.key].curse);
      else if (m.trait) tag = '<b>' + esc(RM.TRAIT[m.trait].name) + ':</b> ' + ui.rich(RM.TRAIT[m.trait].text);
      if (m.move) tag += (tag ? '<br>' : '') + RM.MOVES[m.move].icon + ' <b>' + esc(RM.MOVES[m.move].name) + ':</b> every 2nd cast, ' + ui.rich(RM.MOVES[m.move].text);
      info.innerHTML = '<div style="font-family:var(--display);font-size:17px">' + esc(m.name) + ' <span class="muted" style="font-family:var(--body);font-size:12px">' + label + ' · ' + RM.fmt(m.hp) + ' HP</span></div><div class="muted">' + tag + '</div>' +
        (res ? '<div style="color:' + (res === 'W' ? 'var(--good)' : 'var(--bad)') + '">' + (res === 'W' ? 'Defeated' : 'Lost a heart') + '</div>' : s === run.stage ? '<div class="k">Now</div>' : '');
      row.appendChild(info);
      list.appendChild(row);
    });
    on(body, { close: () => ui.closeSheet() });
  };

  /* ---------------- pause ---------------- */
  ui.showPause = function () {
    const h = '<h2>Paused</h2><div class="btns">' +
      '<button class="btn big gold" data-act="resume">Resume</button>' +
      '<button class="btn ghost" data-act="dice">Your dice</button>' +
      '<button class="btn ghost" data-act="combos">Combos</button>' +
      '<button class="btn ghost" data-act="howto">How to play</button>' +
      '<button class="btn ghost" data-act="settings">Settings</button>' +
      '<button class="btn ghost" data-act="title">Save &amp; quit to title</button>' +
      '<button class="btn red small" data-act="abandon">Abandon run</button></div>';
    const body = ui.sheet(h, { center: true });
    on(body, {
      resume: () => ui.closeSheet(),
      dice: () => { ui.closeSheet(); ui.showDice(); },
      combos: () => { ui.closeSheet(); ui.showCombos(); },
      howto: () => { ui.closeSheet(); ui.showHowTo(); },
      settings: () => { ui.closeSheet(); ui.showSettings(); },
      title: () => { ui.closeSheet(); G().toTitle(); },
      abandon: () => ui.confirm('Abandon this run?', 'It ends here and counts as a loss.', 'Abandon', () => G().abandon()),
    });
  };

  /* ---------------- settings ---------------- */
  ui.showSettings = function (back) {
    const s = P().settings;
    const tog = (k, label) => '<div class="set-row"><span>' + label + '</span><button type="button" class="toggle ' + (s[k] ? 'on' : '') + '" data-act="tog" data-k="' + k + '" aria-label="' + label + '"></button></div>';
    const h = '<h2>Settings</h2>' + tog('sound', 'Sound effects') + tog('music', 'Music') + tog('haptics', 'Vibration') + tog('motion', 'Screen shake &amp; flashes') + tog('tips', 'Tips for new players') +
      '<div class="set-row"><span>Dice skin</span><button type="button" class="btn small ghost" data-act="skins">' + esc(RM.SKIN[s.skin] ? RM.SKIN[s.skin].name : 'Classic') + ' ›</button></div>' +
      '<div class="set-row"><span>Animation speed</span><div class="seg">' + [1, 2, 3].map((v) => '<button type="button" data-act="speed" data-v="' + v + '" class="' + (s.speed === v ? 'on' : '') + '">' + ['1×', '2×', '3×'][v - 1] + '</button>').join('') + '</div></div>' +
      '<div class="btns"><button class="btn ghost small" data-act="reset">Reset all progress</button><button class="btn" data-act="close">Done</button></div>' +
      '<p class="center muted" style="font-size:12px;margin-top:14px">Rollmancer v' + RM.VERSION + ' · Fonts: Lilita One &amp; Nunito (SIL OFL)</p>';
    const body = ui.sheet(h, { onClose: back });
    on(body, {
      tog: (el) => {
        const k = el.dataset.k;
        s[k] = !s[k];
        el.classList.toggle('on', s[k]);
        G().applySettings();
        A().tap();
      },
      speed: (el) => {
        s.speed = +el.dataset.v;
        body.querySelectorAll('[data-act="speed"]').forEach((b) => b.classList.toggle('on', b === el));
        G().applySettings();
        A().tap();
      },
      skins: () => { ui.closeSheet(true); ui.showSkins(() => ui.showSettings(back)); },
      reset: () => ui.confirm('Reset everything?', 'This wipes your stats, unlocks, feats and any run in progress. It can\'t be undone.', 'Reset', () => G().resetAll()),
      close: () => ui.closeSheet(),
    });
  };

  /* ---------------- how to play ---------------- */
  ui.showHowTo = function () {
    const h = '<div class="howto"><h2>How to play</h2>' +
      '<ol>' +
      '<li><b class="k">Roll.</b> Each turn you roll your dice.</li>' +
      '<li><b class="k">Hold &amp; Reroll.</b> Tap dice to hold the ones you like, then <b>Reroll</b> the rest. Rerolls are shared across the whole fight, so spend them wisely.</li>' +
      '<li><b class="k">Cast.</b> Your best combo showing (Pair, Full House, Straight…) hits the monster for <span class="p">Pips</span> × <span class="m">Mult</span> damage. The panel above your dice always shows what a cast would do.</li>' +
      '<li><b class="k">Win the fight</b> before your Casts run out, or you lose a heart. Lose them all and the run is over.</li>' +
      '<li><b class="k">Shop.</b> Spend gold on <b>charms</b> (they bend the rules), <b>stones</b> (etch glyphs like Flame or Prism onto a face of a die), <b>tomes</b> (level up a combo) and <b>trinkets</b> (one-off tricks you use mid-fight).</li>' +
      '<li><b class="k">Encounters</b> wait after each minion: gamble, bargain or walk on.</li>' +
      '<li><b class="k">Bosses</b> end each Depth and each has a nasty rule. Beat one and you choose a boon.</li>' +
      '<li>Reach Depth 8 and defeat <b class="k">the Pipwyrm</b> to win. Then try harder <b>Heat</b> levels and new dice sets.</li>' +
      '</ol>' +
      '<h3>Tips</h3><p>• Press and hold a die to see all six of its faces. • A Pair of 6s has more Pips than a Pair of 2s. • Leftover Casts pay $1 each, so finishing fast pays. • Charms trigger left to right: put ×Mult charms last. • Tap any charm, monster tag or Depth to read more.</p>' +
      '<div class="btns"><button class="btn" data-act="close">Got it</button></div></div>';
    const body = ui.sheet(h);
    on(body, { close: () => ui.closeSheet() });
  };

  /* ---------------- codex ---------------- */
  ui.showCodex = function (tab) {
    tab = tab || 'charms';
    const p = P();
    const tabs = [['charms', 'Charms'], ['runs', 'Runs'], ['combos', 'Combos'], ['glyphs', 'Glyphs'], ['bosses', 'Bosses'], ['feats', 'Feats'], ['stats', 'Stats']];
    let h = '<h2>Codex</h2><div class="tabs">' + tabs.map(([k, n]) => '<button type="button" data-act="tab" data-t="' + k + '" class="' + (k === tab ? 'on' : '') + '">' + n + '</button>').join('') + '</div><div id="codex-body"></div>' +
      '<div class="btns"><button class="btn ghost" data-act="close">Close</button></div>';
    const body = ui.sheet(h);
    const cb = body.querySelector('#codex-body');
    if (tab === 'charms') {
      const seen = Object.keys(p.seenCharms).length;
      cb.innerHTML = '<p class="center muted">' + seen + ' of ' + RM.CHARMS.length + ' discovered. Charms are discovered when they turn up in the bazaar; 🔒 ones unlock as you play.</p><div class="grid">' +
        RM.CHARMS.map((c) => {
          const known = p.seenCharms[c.id];
          const locked = c.unlock && !c.unlock.test(p);
          if (locked) {
            return '<div class="entry unknown"><div class="h"><span class="ic">🔒</span><span>' + (known ? esc(c.name) : '???') + '</span></div><span class="k">' + esc(c.unlock.text) + '</span> to unlock</div>';
          }
          return '<div class="entry ' + (known ? '' : 'unknown') + '"><div class="h"><span class="ic">' + (known ? c.icon : '❔') + '</span><span>' + (known ? esc(c.name) : '???') + '</span></div>' +
            (known ? ui.rich(c.text) : '<span class="muted">' + RARITY[c.r] + '</span>') + '</div>';
        }).join('') + '</div>';
    } else if (tab === 'combos') {
      cb.innerHTML = '<table class="combo-table">' + RM.COMBOS.slice().reverse().map((c) =>
        '<tr><td>' + esc(c.name) + '<div class="lv">' + esc(c.desc) + '</div></td><td class="nums"><span class="p">' + c.pips + '</span> × <span class="m">' + c.mult + '</span><div class="lv">+' + c.lp + ' / +' + c.lm + ' a level</div></td><td class="cnt">' + (p.cast[c.id] || 0) + '×</td></tr>').join('') + '</table>';
    } else if (tab === 'glyphs') {
      cb.innerHTML = '<p class="center muted">Etch glyphs onto die faces with stones from the bazaar.</p><div class="grid"></div>';
      glyphGrid(cb.querySelector('.grid'));
    } else if (tab === 'bosses') {
      cb.innerHTML = '<div class="grid">' + RM.BOSSES.concat([RM.FINAL_BOSS]).map((b) =>
        '<div class="entry"><div class="h"><span>' + esc(b.name) + '</span></div>' + ui.rich(b.curse) + '</div>').join('') + '</div>' +
        '<h3>Brute traits</h3><div class="grid">' + RM.TRAITS.map((t) => '<div class="entry"><div class="h">' + esc(t.name) + '</div>' + ui.rich(t.text) + '</div>').join('') + '</div>';
    } else if (tab === 'runs') {
      if (!p.history.length) cb.innerHTML = '<p class="center muted">Your finished runs will appear here.</p>';
      else {
        cb.innerHTML = '<p class="center muted">Your last ' + p.history.length + ' runs. Tap one to play its seed again.</p><div class="run-list">' + p.history.map((h, i) => {
          const d = new Date(h.at);
          const tag = h.daily ? 'Daily' : h.trial ? RM.TRIAL[h.trial].icon + ' ' + RM.TRIAL[h.trial].name : esc(RM.DICE_SET[h.set].name) + (h.heat ? ' · Heat ' + h.heat : '');
          return '<button type="button" class="run-row' + (h.won ? ' won' : '') + '" data-act="replay" data-i="' + i + '">' +
            '<span class="rr-top"><b>' + (h.won ? '👑 Won' : 'Depth ' + h.depth) + '</b><span>' + tag + '</span><span class="muted">' + d.toLocaleDateString() + '</span></span>' +
            '<span class="rr-line">' + (h.line || '') + '</span>' +
            '<span class="rr-bot">' + h.fights + ' fights · best cast ' + RM.fmt(h.best) + (h.bestCombo ? ' (' + esc(RM.COMBO[h.bestCombo].short) + ')' : '') + ' · seed ' + RM.seedCode(h.seed) + '</span></button>';
        }).join('') + '</div>';
      }
    } else if (tab === 'feats') {
      const got = RM.FEATS.filter((f) => p.feats[f.id]).length;
      cb.innerHTML = '<p class="center muted">' + got + ' of ' + RM.FEATS.length + ' earned.</p><div class="grid">' + RM.FEATS.map((f) =>
        '<div class="entry ' + (p.feats[f.id] ? 'got' : 'unknown') + '"><div class="h"><span class="ic">' + f.icon + '</span><span>' + esc(f.name) + '</span></div>' + esc(f.text) + '</div>').join('') + '</div>';
    } else {
      const fav = Object.entries(p.cast).sort((a, b) => b[1] - a[1])[0];
      cb.innerHTML = '<div class="stat-list">' +
        '<span>Runs played</span><b>' + p.runs + '</b>' +
        '<span>Runs won</span><b>' + p.wins + '</b>' +
        '<span>Fights won</span><b>' + p.fightsWon + '</b>' +
        '<span>Deepest Depth</span><b>' + p.bestDepth + '</b>' +
        '<span>Best cast</span><b>' + RM.fmt(p.bestCast) + '</b>' +
        '<span>Highest Heat won</span><b>' + (p.bestHeatWon >= 0 ? p.bestHeatWon : '–') + '</b>' +
        '<span>Most gold at once</span><b>$' + RM.fmt(p.bestGold) + '</b>' +
        '<span>Favourite combo</span><b>' + (fav ? esc(RM.COMBO[fav[0]].short) : '–') + '</b>' +
        '<span>Daily runs finished</span><b>' + p.dailyDone + '</b>' +
        '<span>Trial medals</span><b>' + Object.keys(p.trials || {}).length + ' / ' + RM.TRIALS.length + '</b>' +
        '</div>';
    }
    on(body, {
      replay: (el) => {
        const h = p.history[+el.dataset.i];
        A().tap();
        ui.closeSheet(true);
        if (h.trial) { G().startTrial(h.trial, h.seed); return; }
        G().toSetup(h.daily ? null : h.set, h.daily ? null : h.heat, RM.seedCode(h.seed));
      },
      tab: (el) => { A().tap(); ui.closeSheet(true); ui.showCodex(el.dataset.t); },
      close: () => ui.closeSheet(),
    });
  };

  /* ---------------- title ---------------- */
  ui.renderTitle = function () {
    const p = P();
    $('btn-continue').hidden = !p.run;
    if (p.run) {
      const r = p.run;
      $('btn-continue').innerHTML = 'Continue run<small>' + esc(RM.DICE_SET[r.set].name) + ' · Depth ' + r.depth + (r.daily ? ' · Daily' : '') + '</small>';
    }
    const key = RM.todayKey();
    const d = p.daily[key];
    $('daily-sub').textContent = 'Daily #' + RM.dailyNumber() + (d && d.done ? ' · done ✓ ' + d.fights + ' fights' : ' · same dice for everyone today');
    const bits = [];
    if (p.runs) bits.push('Runs ' + p.runs);
    if (p.wins) bits.push('Wins ' + p.wins);
    if (p.bestDepth) bits.push('Deepest ' + p.bestDepth);
    if (p.bestCast) bits.push('Best cast ' + RM.fmt(p.bestCast));
    $('title-stats').textContent = bits.join(' · ');
    RM.battle.drawLogoDice($('logo-dice'));
  };

  /* ---------------- setup ---------------- */
  const setup = { i: 0, heat: 0 };
  ui.renderSetup = function (setId, heat) {
    const p = P();
    if (setId) setup.i = Math.max(0, RM.DICE_SETS.findIndex((s) => s.id === setId));
    else setup.i = Math.max(0, RM.DICE_SETS.findIndex((s) => s.id === p.lastSet));
    setup.heat = heat != null ? heat : p.lastHeat || 0;
    drawSetup();
  };
  function drawSetup() {
    const p = P();
    const s = RM.DICE_SETS[setup.i];
    const unlocked = RM.profile.setUnlocked(s.id);
    const card = $('set-card');
    card.classList.toggle('locked', !unlocked);
    const rng = new RM.Stream(7);
    const sample = s.make(rng).dice[0];
    const won = p.heatWon[s.id];
    card.innerHTML = '<h3>' + esc(s.name) + '</h3><div class="faces"></div><p>' + ui.rich(s.text) + '</p>' +
      (unlocked ? (won != null ? '<div class="won">✓ Won up to Heat ' + won + '</div>' : '') : '<div class="lock">🔒 ' + esc(s.unlock.text) + '</div>');
    sample.forEach((f) => card.querySelector('.faces').appendChild(RM.art.faceCanvas(f, 40, s.id)));
    $('set-dots').innerHTML = RM.DICE_SETS.map((d, i) => '<i class="' + (i === setup.i ? 'on' : RM.profile.setUnlocked(d.id) ? '' : 'lk') + '"></i>').join('');
    const max = RM.profile.maxHeat(s.id);
    setup.heat = Math.min(setup.heat, max);
    $('heat-val').textContent = setup.heat;
    $('heat-pips').innerHTML = RM.HEAT.map((t, i) => '<i class="' + (i <= setup.heat ? 'on' : i > max ? 'lk' : '') + '"></i>').join('');
    const desc = setup.heat === 0 ? RM.HEAT[0] : RM.HEAT.slice(1, setup.heat + 1).map((t) => '• ' + t).join(' ');
    let more = '';
    if (unlocked && max < 8 && setup.heat === max) more = ' <span class="muted">(Win on Heat ' + max + ' with these dice to unlock Heat ' + (max + 1) + '.)</span>';
    $('heat-desc').innerHTML = ui.rich(desc) + more;
    $('heat-down').disabled = setup.heat <= 0;
    $('heat-up').disabled = setup.heat >= max;
    $('btn-start').disabled = !unlocked;
    $('btn-start').textContent = unlocked ? 'Descend' : 'Locked';
  }
  ui.setupState = () => ({ set: RM.DICE_SETS[setup.i].id, heat: setup.heat });
  ui.setSeed = (code) => { $('seed-in').value = code || ''; };
  $('set-prev').addEventListener('click', () => { A().tap(); setup.i = (setup.i + RM.DICE_SETS.length - 1) % RM.DICE_SETS.length; drawSetup(); });
  $('set-next').addEventListener('click', () => { A().tap(); setup.i = (setup.i + 1) % RM.DICE_SETS.length; drawSetup(); });
  $('heat-down').addEventListener('click', () => { A().tap(); setup.heat = Math.max(0, setup.heat - 1); drawSetup(); });
  $('heat-up').addEventListener('click', () => { A().tap(); setup.heat += 1; drawSetup(); });
  // swipe the set card
  (function () {
    let sx = null;
    $('set-card').addEventListener('pointerdown', (e) => { sx = e.clientX; });
    $('set-card').addEventListener('pointerup', (e) => {
      if (sx == null) return;
      const dx = e.clientX - sx;
      sx = null;
      if (Math.abs(dx) > 40) (dx < 0 ? $('set-next') : $('set-prev')).click();
    });
  })();

  /* ---------------- shop ---------------- */
  const QUIPS = [
    'Fresh charms, barely cursed.',
    'Gold for power. The oldest trade there is.',
    'Etch a glyph, change your fate.',
    'You look like someone who needs more Mult.',
    'No refunds. Some sales. Mostly no refunds.',
    'The deeper you go, the better my stock.',
    'Psst. Prisms multiply. Just saying.',
    'That boss ahead? Plan for it.',
    'A tome a day keeps the Pipwyrm away.',
    'Dice are just bones that learned to gamble.',
  ];
  const TIER_COL = ['#7a8aa6', '#5b8cff', '#5b8cff', '#ff8a3c', '#ff8a3c', '#c47bff', '#c47bff', '#ff4d5e', '#ff9de2', '#ff9de2', '#ff9de2', '#ffcc3d', '#ffffff'];

  function goodIcon(g) {
    if (g.type === 'charm') return RM.CHARM[g.id].icon;
    if (g.type === 'trinket') return RM.TRINKET[g.id].icon;
    if (g.type === 'potion') return '❤️';
    if (g.type === 'tome') {
      const c = RM.COMBO[g.combo];
      return '<span class="tome" style="--tc:' + TIER_COL[c.rank] + '">' + esc(c.short.split(' ')[0]) + '</span>';
    }
    if (g.type === 'stone') {
      const s = RM.STONE[g.id];
      if (s.glyph) return '';
      return g.id === 'chisel' ? '⛏️' : '♊';
    }
    return '❔';
  }
  function goodName(g) {
    if (g.type === 'charm') return RM.CHARM[g.id].name;
    if (g.type === 'trinket') return RM.TRINKET[g.id].name;
    if (g.type === 'potion') return 'Heart Tonic';
    if (g.type === 'tome') return 'Tome: ' + RM.COMBO[g.combo].name;
    return RM.STONE[g.id].name;
  }
  function goodType(g) {
    if (g.type === 'charm') return RARITY[RM.CHARM[g.id].r];
    return { trinket: 'Trinket', potion: 'Potion', tome: 'Tome', stone: 'Stone' }[g.type];
  }
  function goodText(g, run) {
    if (g.type === 'charm') return RM.CHARM[g.id].text;
    if (g.type === 'trinket') return RM.TRINKET[g.id].text + '. Goes on your belt; use it during a fight.';
    if (g.type === 'potion') return 'Restore {k:one heart}.';
    if (g.type === 'tome') {
      const c = RM.COMBO[g.combo];
      const s = RM.rules.comboStats(run, g.combo);
      return '{k:' + c.name + '} goes up a level: {p:+' + c.lp + ' Pips} and {m:+' + c.lm + ' Mult}. Now level ' + s.level + ' ({p:' + s.pips + '} × {m:' + s.mult + '}).';
    }
    return RM.STONE[g.id].text;
  }

  function itemEl(g, run, onTap) {
    const b = document.createElement('button');
    b.type = 'button';
    const rar = g.type === 'charm' ? ' r' + RM.CHARM[g.id].r : '';
    b.className = 'item' + rar + (g.sold ? ' sold' : '') + (!g.sold && run.gold < g.cost ? ' poor' : '');
    b.innerHTML = '<span class="ic"></span><span class="nm">' + esc(goodName(g)) + '</span><span class="ty">' + esc(goodType(g)) + '</span><span class="price"><i class="coin"></i>' + g.cost + '</span>';
    const ic = b.querySelector('.ic');
    const icon = goodIcon(g);
    if (icon) ic.innerHTML = icon;
    else ic.appendChild(RM.art.glyphCanvas(RM.STONE[g.id].glyph, 40));
    b.addEventListener('click', () => { if (!g.sold) { A().tap(); onTap(); } });
    return b;
  }

  ui.renderShop = function () {
    const run = G().run;
    const s = run.shop;
    if (!s) return;
    ui.hearts(run);
    ui.gold(run);
    const sc = $('shop-charms');
    sc.innerHTML = '';
    s.charms.forEach((g) => sc.appendChild(itemEl(g, run, () => ui.showItem(g))));
    const sg = $('shop-goods');
    sg.innerHTML = '';
    s.goods.forEach((g) => sg.appendChild(itemEl(g, run, () => ui.showItem(g))));
    const rb = $('btn-reshop');
    rb.innerHTML = '↻ New stock <span class="g">&nbsp;$' + s.rerollCost + '</span>';
    rb.disabled = run.gold < s.rerollCost;
    $('slots-text').textContent = run.charms.length + ' / ' + run.charmSlots;
    ui.charmRow($('own-charms'), run, { where: 'shop' });
    // what's next
    const res = run.result;
    const next = res && res.retry ? run.plan[2] : nextFight(run);
    const nu = $('next-up');
    nu.innerHTML = '';
    nu.appendChild(RM.art.monsterCanvas(next.m, 54, 54));
    const t = document.createElement('div');
    let tag = '';
    if (next.m.boss) tag = '<span class="k">Boss:</span> ' + ui.rich(RM.BOSS[next.m.key].curse);
    else if (next.m.trait) tag = '<span class="k">' + esc(RM.TRAIT[next.m.trait].name) + ':</span> ' + ui.rich(RM.TRAIT[next.m.trait].text);
    t.innerHTML = '<div>Next: <b>' + esc(next.m.name) + '</b> · Depth ' + next.depth + ' · ' + RM.fmt(next.m.hp) + ' HP</div><div>' + tag + '</div>';
    nu.appendChild(t);
    $('btn-leave').textContent = next.m.boss ? 'Face the boss' : 'Next fight';
  };
  function nextFight(run) {
    if (run.stage < 2) return { m: run.plan[run.stage + 1], depth: run.depth };
    return { m: RM.rules.peekNextDepth(run), depth: run.depth + 1 };
  }

  ui.showItem = function (g) {
    const run = G().run;
    const can = RM.rules.canBuy(run, g);
    const swappable = g.type === 'charm' && !can.ok && run.charms.length >= run.charmSlots && run.charms.some((c, k) => RM.rules.canSwap(run, g, k));
    let icon = goodIcon(g);
    const h = '<div class="detail-head"><div class="big-ic" id="item-ic">' + icon + '</div><div><div class="rar">' + esc(goodType(g)) + '</div><h2>' + esc(goodName(g)) + '</h2></div></div>' +
      '<p class="detail-desc">' + ui.rich(goodText(g, run)) + '</p>' +
      (can.ok ? '' : '<p class="center" style="color:var(--bad)">' + esc(can.why) + '</p>') +
      '<div class="btns"><button class="btn big gold" data-act="buy" ' + (can.ok ? '' : 'disabled') + '>' + (g.type === 'stone' ? 'Buy &amp; etch' : 'Buy') + ' · $' + g.cost + '</button>' +
      (swappable ? '<button class="btn blue" data-act="swap">Swap for one of yours</button>' : '') +
      '<button class="btn ghost" data-act="close">Close</button></div>';
    const body = ui.sheet(h);
    if (!icon && g.type === 'stone') body.querySelector('#item-ic').appendChild(RM.art.glyphCanvas(RM.STONE[g.id].glyph, 50));
    on(body, {
      buy: () => {
        if (g.type === 'stone') { ui.closeSheet(true); ui.showEtch({ kind: 'shop', item: g }); return; }
        if (RM.rules.buy(run, g)) {
          A().buy();
          if (g.type === 'charm') RM.profile.noteSeen([g.id]);
          if (g.type === 'tome') A().level();
          ui.closeSheet(true);
          G().changed();
        } else A().deny();
      },
      swap: () => {
        ui.closeSheet(true);
        const d = RM.CHARM[g.id];
        ui.pickCharm('Swap which charm?', 'It sells for half its price, then {k:' + d.name + '} ' + d.icon + ' takes its place.', (k) => {
          if (RM.rules.swapCharm(run, g, k)) {
            A().buy();
            RM.profile.noteSeen([g.id]);
            G().changed();
          } else A().deny();
        }, () => ui.showItem(g), (k) => (RM.rules.canSwap(run, g, k) ? '+$' + RM.rules.sellValue(run, k) : false));
      },
      close: () => ui.closeSheet(),
    });
  };

  ui.drawMerchant = function () {
    const c = $('merchant');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = 92 * dpr;
    c.height = 92 * dpr;
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    g.translate(46, 50);
    // hooded robe
    g.beginPath();
    g.moveTo(-36, 42);
    g.quadraticCurveTo(-34, -10, -20, -30);
    g.quadraticCurveTo(0, -48, 20, -30);
    g.quadraticCurveTo(34, -10, 36, 42);
    g.closePath();
    const gr = g.createLinearGradient(0, -48, 0, 42);
    gr.addColorStop(0, '#6a3fa8');
    gr.addColorStop(1, '#2a1650');
    g.fillStyle = gr;
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = '#1a0c33';
    g.stroke();
    // hood opening
    g.beginPath();
    g.ellipse(0, -14, 16, 18, 0, 0, Math.PI * 2);
    g.fillStyle = '#0c0618';
    g.fill();
    // eyes
    g.fillStyle = '#ffd24f';
    g.shadowColor = '#ffd24f';
    g.shadowBlur = 8;
    g.beginPath(); g.ellipse(-6, -14, 3, 2, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(6, -14, 3, 2, 0, 0, Math.PI * 2); g.fill();
    g.shadowBlur = 0;
    // trim
    g.strokeStyle = '#ffcc3d';
    g.lineWidth = 2;
    g.beginPath();
    g.ellipse(0, -14, 17, 19, 0, 0.2, Math.PI - 0.2);
    g.stroke();
    // a die in its hand
    RM.art.die(g, 22, 22, 22, { v: 5, g: 'gold', glow: 0.5 });
    $('merchant-say').textContent = QUIPS[Math.floor(Math.random() * QUIPS.length)];
  };

  /* ---------------- trials ---------------- */
  ui.showTrials = function () {
    const p = P();
    let h = '<h2>Trials</h2><p class="center muted">Special runs with twisted rules, on the Apprentice Dice. Beat the Pipwyrm in one to earn its medal; medals unlock dice skins.</p><div class="boons">';
    RM.TRIALS.forEach((t, i) => {
      const done = (p.trials || {})[t.id];
      h += '<button class="boon trial' + (done ? ' done' : '') + '" data-act="go" data-id="' + t.id + '" style="animation-delay:' + i * 0.05 + 's"><span class="ic">' + t.icon + '</span>' +
        '<span><b>' + esc(t.name) + (done ? ' <small class="medal">🏅 Medal</small>' : '') + '</b><span>' + ui.rich(t.text) + '</span></span></button>';
    });
    h += '</div><div class="btns"><button class="btn ghost" data-act="close">Close</button></div>';
    const body = ui.sheet(h);
    on(body, {
      go: (el) => { A().tap(); ui.closeSheet(true); G().startTrial(el.dataset.id); },
      close: () => ui.closeSheet(),
    });
  };

  /* ---------------- dice skins ---------------- */
  ui.showSkins = function (back) {
    const p = P();
    let h = '<h2>Dice skins</h2><p class="center muted">How your dice look in every run. Unlock more by playing.</p><div class="skin-grid" id="skin-grid"></div>' +
      '<div class="btns"><button class="btn" data-act="close">Done</button></div>';
    const body = ui.sheet(h, { onClose: back });
    const grid = body.querySelector('#skin-grid');
    RM.SKINS.forEach((k) => {
      const ok = RM.profile.skinUnlocked(k.id);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'skin' + (p.settings.skin === k.id ? ' on' : '') + (ok ? '' : ' locked');
      b.appendChild(RM.art.faceCanvas({ v: 5, g: null }, 48, p.lastSet || 'apprentice', { skin: k.id }));
      b.insertAdjacentHTML('beforeend', '<b>' + esc(k.name) + '</b><span>' + (ok ? (k.text ? esc(k.text) : '&nbsp;') : '🔒 ' + esc(k.unlock[0])) + '</span>');
      b.addEventListener('click', () => {
        if (!ok) { A().deny(); return; }
        p.settings.skin = k.id;
        G().applySettings();
        A().etch();
        grid.querySelectorAll('.skin').forEach((x) => x.classList.toggle('on', x === b));
      });
      grid.appendChild(b);
    });
    on(body, { close: () => ui.closeSheet() });
  };

  /* ---------------- coach marks (first run) ---------------- */
  ui.tip = function (text, anchor, dir, onOk) {
    const t = $('tip');
    t.innerHTML = ui.rich(text) + '<button class="tip-ok" type="button">Got it</button>';
    t.className = 'tip ' + (dir || 'down');
    t.hidden = false;
    const r = RM.battle.relRect(anchor);
    const app = $('app').getBoundingClientRect();
    t.style.top = '0px';
    const th = t.offsetHeight;
    let top = dir === 'up' ? r.y + r.h + 14 : r.y - th - 14;
    top = Math.max(8, Math.min(app.height - th - 8, top));
    t.style.top = top + 'px';
    t.querySelector('.tip-ok').addEventListener('click', () => {
      A().tap();
      t.hidden = true;
      if (onOk) onOk();
    });
  };
  ui.hideTip = () => { $('tip').hidden = true; };
})(window.RM);
