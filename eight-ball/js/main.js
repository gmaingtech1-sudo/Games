/* Eight-Ball — app controller: the menu, settings, the rules page, the
   sheets (colour choice, spin, pause, frame over) and the main loop. */
(function (EB) {
  'use strict';

  const { game: G, audio: A } = EB;
  const $ = (id) => document.getElementById(id);
  const KEY = 'eightball.v1';

  /* ---------- Saved settings and record ---------- */

  const defaults = () => ({
    mode: 'ai', level: 'medium', race: 2,
    names: ['Player 1', 'Player 2'],
    guide: 'long', clock: true, sound: true, table3d: true, view: 'player', quality: 'auto', hinted: false,
    record: { easy: [0, 0], medium: [0, 0], hard: [0, 0] },
    tour: null, trophies: { easy: 0, medium: 0, hard: 0 },
  });
  let save = defaults();
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s) save = { ...save, ...s, record: { ...save.record, ...(s.record || {}) }, trophies: { ...save.trophies, ...(s.trophies || {}) } };
  } catch (e) { /* storage may be blocked */ }
  const persist = () => {
    try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* ignore */ }
  };
  G.settings = save;

  /* ---------- Screens and sheets ---------- */

  let screen = 'menu';
  let back = 'menu';
  let sheet = null;
  let sheetBack = null;

  function show(id) {
    for (const s of ['menu', 'game', 'rules', 'tour']) $(s).hidden = s !== id;
    screen = id;
    if (id === 'game') requestAnimationFrame(() => EB.render.resize());
  }

  function open(id) {
    if (sheet) $(sheet).hidden = true;
    sheet = id;
    $(id).hidden = false;
    $('scrim').hidden = false;
  }

  function close() {
    if (sheet) $(sheet).hidden = true;
    sheet = null;
    $('scrim').hidden = true;
    if (sheetBack) {
      const s = sheetBack;
      sheetBack = null;
      open(s);
    } else if (screen === 'game') G.paused = false;
  }

  G.ui.sheetOpen = () => !!sheet || screen !== 'game';

  /* ---------- Menu ---------- */

  function seg(id, value, onPick) {
    const el = $(id);
    const mark = (v) => {
      for (const b of el.querySelectorAll('button')) {
        b.classList.toggle('on', b.dataset.v === String(v));
        b.setAttribute('aria-checked', b.dataset.v === String(v));
        b.setAttribute('role', 'radio');
      }
    };
    mark(value);
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      A.init();
      A.tap();
      mark(b.dataset.v);
      onPick(b.dataset.v);
      persist();
    });
  }

  seg('seg-mode', save.mode, (v) => { save.mode = v; menuState(); });
  seg('seg-level', save.level, (v) => { save.level = v; menuState(); });
  seg('seg-race', save.race, (v) => { save.race = +v; });
  seg('seg-guide', save.guide, (v) => { save.guide = v; });
  // Auto starts on High and drops to Fast if the phone can't keep up.
  let autoFast = false;
  const applyQuality = () => {
    if (EB.render3d && ready3d) EB.render3d.setQuality(save.quality === 'fast' || (save.quality === 'auto' && autoFast) ? 'fast' : 'high');
  };
  seg('seg-quality', save.quality, (v) => { save.quality = v; autoFast = false; applyQuality(); });

  function menuState() {
    const t = save.tour;
    $('btn-tour-text').textContent = t && t.champion === null && t.out === null ? 'Continue the tournament' : 'Tournament';
    $('diff-row').hidden = save.mode !== 'ai';
    const r = save.record[save.level];
    $('record').textContent = save.mode === 'ai' && (r[0] || r[1])
      ? `Matches against the ${save.level} computer: won ${r[0]}, lost ${r[1]}`
      : '';
  }
  menuState();

  $('btn-play').addEventListener('click', () => {
    A.init();
    A.tap();
    show('game');
    requestAnimationFrame(() => {
      EB.render.resize();
      G.startMatch({ mode: save.mode, level: save.level, race: save.race, names: save.names });
      if (!save.hinted && EB.render === EB.render3d && EB.render3d.view === 'player') {
        save.hinted = true;
        persist();
        setTimeout(() => G.say(EB.render3d.VIEW_NAMES.player + ' The camera button changes the view.', 'info', 5000), 3400);
      }
    });
  });

  $('btn-rules').addEventListener('click', () => { back = 'menu'; show('rules'); });
  $('rules-back').addEventListener('click', () => {
    show(back);
    if (back === 'game') open('sheet-pause');
  });
  $('btn-settings').addEventListener('click', () => { openSettings(); });

  /* ---------- Settings ---------- */

  function openSettings() {
    $('set-name0').value = save.names[0];
    $('set-name1').value = save.names[1];
    $('set-clock').checked = save.clock;
    $('set-sound').checked = save.sound;
    $('set-3d').checked = save.table3d && can3d;
    $('set-3d').disabled = !can3d;
    open('sheet-settings');
  }

  function saveSettings() {
    save.names = [0, 1].map((i) => $(`set-name${i}`).value.trim().slice(0, 14) || `Player ${i + 1}`);
    save.clock = $('set-clock').checked;
    save.sound = $('set-sound').checked;
    A.setSound(save.sound);
    if (can3d && save.table3d !== $('set-3d').checked) {
      save.table3d = $('set-3d').checked;
      pickTable();
    }
    persist();
    if (G.st) G.hud();
  }
  A.setSound(save.sound);

  $('settings-done').addEventListener('click', () => { saveSettings(); close(); });

  /* ---------- In the game ---------- */

  $('btn-pause').addEventListener('click', () => {
    G.paused = true;
    const [a, b] = G.players;
    $('pause-score').textContent = `${a.name} ${a.frames} – ${b.frames} ${b.name} · first to ${G.race}`;
    open('sheet-pause');
  });
  $('btn-resume').addEventListener('click', close);
  $('btn-pause-rules').addEventListener('click', () => {
    $('sheet-pause').hidden = true;
    sheet = null;
    $('scrim').hidden = true;
    back = 'game';
    show('rules');
  });
  $('btn-pause-settings').addEventListener('click', () => {
    sheetBack = 'sheet-pause';
    openSettings();
  });
  $('btn-quit').addEventListener('click', () => {
    close();
    quit();
  });

  function quit() {
    G.phase = 'idle';
    G.paused = true;
    if (tourMatch) {
      // Walking out of a tournament match: it'll be played again from 0–0.
      tourMatch = false;
      showTour();
      return;
    }
    show('menu');
    menuState();
  }

  /* ---------- The tournament ---------- */

  const LEVEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
  const ROUND_OF = ['the quarter-final', 'the semi-final', 'the final'];
  let tourMatch = false;
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function showTour() {
    const T = EB.tour;
    const t = save.tour;
    show('tour');
    $('tour-field').textContent = `An eight-player knockout at the ${LEVEL[t.field].toLowerCase()} level. Quarter-finals and semi-finals are first to 2 frames, the final is first to 3.`;
    const n = T.next(t);
    let status = '';
    let actions = '';
    if (n) {
      status = `<b>${n.round}</b><span>You play <b>${esc(n.opp.name)}</b> (${LEVEL[n.opp.level]}), first to ${n.race} frames.</span>`;
      actions = `<button class="btn primary" type="button" data-act="play">Play the ${n.round.toLowerCase()}</button>
        <button class="btn ghost" type="button" data-act="quit">Give up the tournament</button>`;
    } else if (t.champion === 0) {
      status = `<span class="trophy" aria-hidden="true">🏆</span><b>You won the Eight-Ball Open!</b>`;
      actions = '<button class="btn primary" type="button" data-act="new">New tournament</button>';
    } else {
      status = `<b>Knocked out in ${ROUND_OF[t.out]}</b><span>The Open was won by ${esc(t.players[t.champion].name)}.</span>`;
      actions = '<button class="btn primary" type="button" data-act="new">New tournament</button>';
    }
    $('tour-status').innerHTML = status;
    $('tour-actions').innerHTML = actions;
    // The draw.
    let html = '';
    t.rounds.forEach((ms, r) => {
      html += `<div class="round"><h3>${T.ROUNDS[r]}<small>first to ${T.RACE[r]}</small></h3>`;
      const count = [4, 2, 1][r];
      for (let i = 0; i < count; i++) {
        const m = ms[i];
        const row = (who, score) => {
          if (who === undefined) return '<div class="seat tbc">To be decided</div>';
          const p = t.players[who];
          const won = m && m.w === who;
          const lost = m && m.w !== null && !won;
          return `<div class="seat${who === 0 ? ' you' : ''}${won ? ' won' : ''}${lost ? ' lost' : ''}">
            <span class="who">${esc(p.name)}${p.level ? `<em>${LEVEL[p.level]}</em>` : '<em>You</em>'}</span>
            <span class="sc">${m && m.w !== null ? score : ''}</span></div>`;
        };
        html += `<div class="match">${row(m && m.a, m && m.s[0])}${row(m && m.b, m && m.s[1])}</div>`;
      }
      html += '</div>';
    });
    if (t.champion !== null) html += `<div class="round champ"><h3>Champion</h3><div class="match"><div class="seat won${t.champion === 0 ? ' you' : ''}"><span class="who">🏆 ${esc(t.players[t.champion].name)}</span></div></div></div>`;
    $('bracket').innerHTML = html;
    const tr = save.trophies;
    const total = tr.easy + tr.medium + tr.hard;
    $('tour-trophies').textContent = total ? `Your trophies: ${['easy', 'medium', 'hard'].filter((k) => tr[k]).map((k) => `${tr[k]} ${LEVEL[k].toLowerCase()}`).join(', ')}.` : '';
  }

  function newTour() {
    save.tour = EB.tour.create(save.level, save.names[0]);
    persist();
    showTour();
  }

  $('btn-tour').addEventListener('click', () => {
    A.init();
    A.tap();
    if (!save.tour) newTour();
    else showTour();
  });
  $('tour-back').addEventListener('click', () => { show('menu'); menuState(); });

  let quitArmed = 0;
  $('tour-actions').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    A.tap();
    const act = b.dataset.act;
    if (act === 'new') newTour();
    else if (act === 'quit') {
      // Ask twice: giving up can't be undone.
      if (Date.now() - quitArmed > 3000) {
        quitArmed = Date.now();
        b.textContent = 'Tap again to give up';
        return;
      }
      save.tour = null;
      persist();
      show('menu');
      menuState();
    } else if (act === 'play') {
      const n = EB.tour.next(save.tour);
      tourMatch = true;
      show('game');
      requestAnimationFrame(() => {
        EB.render.resize();
        G.startMatch({ mode: 'ai', level: n.opp.level, race: n.race, names: save.names, oppName: n.opp.name });
        G.say(`${n.round}: first to ${n.race}. ${G.players[G.starter].name} to break.`, 'info', 3400);
      });
    }
  });

  $('btn-spin').addEventListener('click', () => {
    if (G.phase !== 'aim') return;
    A.tap();
    markSpin();
    open('sheet-spin');
  });

  const spinBall = $('spin-ball');
  function markSpin() {
    $('spin-mark').style.left = `${50 + G.spin.x * 50}%`;
    $('spin-mark').style.top = `${50 - G.spin.y * 50}%`;
  }
  function spinAt(e) {
    const r = spinBall.getBoundingClientRect();
    G.setSpin(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
    markSpin();
  }
  let spinning = false;
  spinBall.addEventListener('pointerdown', (e) => { spinning = true; spinBall.setPointerCapture(e.pointerId); spinAt(e); });
  spinBall.addEventListener('pointermove', (e) => { if (spinning) spinAt(e); });
  spinBall.addEventListener('pointerup', () => { spinning = false; });
  $('spin-centre').addEventListener('click', () => { G.setSpin(0, 0); markSpin(); });
  $('spin-done').addEventListener('click', close);

  G.ui.chooseColour = (choice, who) => {
    $('colour-title').textContent = `${who}: choose your colour`;
    const potted = choice.potted.map((c) => (c === 'red' ? 'a red' : 'a yellow')).join(' and ');
    $('colour-text').textContent = choice.afterBreak
      ? `You potted ${potted} on the break. Pick a colour you potted and it's yours; pick the other and you must pot one with your next shot.`
      : 'You potted both colours. Pick the colour you want to be on.';
    open('sheet-colour');
  };
  $('sheet-colour').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-c]');
    if (!b) return;
    A.tap();
    close();
    G.pickColour(b.dataset.c);
  });

  G.ui.frameOver = ({ winner, why, match }) => {
    const pl = G.players;
    const w = pl[winner];
    $('over-title').textContent = match ? `${w.name} wins the match!` : `${w.name} wins the frame`;
    $('over-why').textContent = why;
    $('over-score').innerHTML = `<span>${pl[0].name}</span><b>${pl[0].frames} – ${pl[1].frames}</b><span>${pl[1].name}</span>`;
    $('btn-next').textContent = match ? (tourMatch ? 'Back to the draw' : 'Play again') : 'Next frame';
    $('btn-next').dataset.match = match ? (tourMatch ? 'tour' : '1') : '';
    $('btn-menu').hidden = match && tourMatch;
    $('btn-menu').textContent = tourMatch ? 'Leave (replay this match later)' : 'Menu';
    if (match && pl[1].ai) {
      save.record[pl[1].ai][winner === 0 ? 0 : 1]++;
      persist();
    }
    open('sheet-over');
  };
  $('btn-next').addEventListener('click', () => {
    const again = $('btn-next').dataset.match;
    close();
    if (again === 'tour') {
      const [me, them] = G.players;
      const t = save.tour;
      EB.tour.result(t, me.frames, them.frames);
      if (t.champion === 0) save.trophies[t.field]++;
      persist();
      tourMatch = false;
      G.phase = 'idle';
      G.paused = true;
      showTour();
    } else if (again) G.startMatch({ mode: save.mode, level: save.level, race: save.race, names: save.names });
    else G.nextFrame();
  });
  $('btn-menu').addEventListener('click', () => {
    close();
    quit();
  });

  $('scrim').addEventListener('click', () => {
    if (sheet === 'sheet-spin') close();
    else if (sheet === 'sheet-pause') close();
    else if (sheet === 'sheet-settings') { saveSettings(); close(); }
  });

  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'Escape') {
      if (sheet && sheet !== 'sheet-colour' && sheet !== 'sheet-over') {
        if (sheet === 'sheet-settings') saveSettings();
        close();
      } else if (!sheet && screen === 'game' && G.phase !== 'idle') $('btn-pause').click();
      else if (screen === 'rules') $('rules-back').click();
      return;
    }
    if (screen === 'game' && !sheet && G.key(e)) e.preventDefault();
  });

  window.addEventListener('resize', () => EB.render.resize());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === 'game' && !sheet && G.phase !== 'idle' && G.phase !== 'over') $('btn-pause').click();
  });

  /* ---------- Main loop ---------- */

  /* ---------- Which table: 3D, or flat if the phone can't do WebGL ---------- */

  const can3d = !!(EB.render3d && EB.render3d.supported());
  let ready3d = false;

  function pickTable() {
    const use3d = can3d && save.table3d;
    if (use3d && !ready3d) {
      try {
        EB.render3d.init($('table3d'));
        EB.render3d.setView(save.view);
        ready3d = true;
        applyQuality();
        EB.render3d.watchSpeed(() => {
          if (save.quality !== 'auto' || autoFast) return;
          autoFast = true;
          applyQuality();
          G.say('Graphics switched to Fast to keep things smooth. You can change this in Settings.', 'info', 3600);
        });
      } catch (e) {
        save.table3d = false;
      }
    }
    const three = use3d && ready3d;
    EB.render = three ? EB.render3d : EB.render2d;
    $('table3d').hidden = !three;
    $('table').hidden = three;
    $('btn-view').hidden = !three;
    document.querySelector('.table-wrap').classList.toggle('three', three);
    if (screen === 'game') requestAnimationFrame(() => EB.render.resize());
  }

  EB.render2d.init($('table'));
  pickTable();

  $('btn-view').addEventListener('click', () => {
    if (EB.render !== EB.render3d) return;
    A.tap();
    G.say(EB.render3d.cycleView(), 'info', 3200);
    save.view = EB.render3d.view;
    persist();
  });

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (screen === 'game') {
      G.update(dt);
      EB.render.draw(G, now);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // The Android app (../eight-ball-android) calls these for its back button
  // and when it's switched away. back() answers false when there's nothing
  // left to close, so the app can step aside.
  EB.app = {
    back() {
      if (sheet === 'sheet-colour') return true;
      if (sheet === 'sheet-over') { $($('btn-menu').hidden ? 'btn-next' : 'btn-menu').click(); return true; }
      if (sheet) {
        if (sheet === 'sheet-settings') saveSettings();
        close();
        return true;
      }
      if (screen === 'rules') { $('rules-back').click(); return true; }
      if (screen === 'tour') { $('tour-back').click(); return true; }
      if (screen === 'game') {
        if (G.phase !== 'idle') $('btn-pause').click();
        return true;
      }
      return false;
    },
    pause() {
      if (screen === 'game' && !sheet && G.phase !== 'idle' && G.phase !== 'over') $('btn-pause').click();
    },
  };

  // The Android app serves the game from inside the APK, so it needs no service worker.
  if ('serviceWorker' in navigator && location.protocol === 'https:' && !window.AndroidHost) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})(window.EB = window.EB || {});
