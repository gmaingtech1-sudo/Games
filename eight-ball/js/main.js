/* Eight-Ball — app controller: the menu, settings, the rules page, the
   sheets (colour choice, spin, pause, frame over) and the main loop. */
(function (EB) {
  'use strict';

  const { game: G, render, audio: A } = EB;
  const $ = (id) => document.getElementById(id);
  const KEY = 'eightball.v1';

  /* ---------- Saved settings and record ---------- */

  const defaults = () => ({
    mode: 'ai', level: 'medium', race: 2,
    names: ['Player 1', 'Player 2'],
    guide: 'long', clock: true, sound: true,
    record: { easy: [0, 0], medium: [0, 0], hard: [0, 0] },
  });
  let save = defaults();
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s) save = { ...save, ...s, record: { ...save.record, ...(s.record || {}) } };
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
    for (const s of ['menu', 'game', 'rules']) $(s).hidden = s !== id;
    screen = id;
    if (id === 'game') requestAnimationFrame(() => render.resize());
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

  function menuState() {
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
      render.resize();
      G.startMatch({ mode: save.mode, level: save.level, race: save.race, names: save.names });
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
    open('sheet-settings');
  }

  function saveSettings() {
    save.names = [0, 1].map((i) => $(`set-name${i}`).value.trim().slice(0, 14) || `Player ${i + 1}`);
    save.clock = $('set-clock').checked;
    save.sound = $('set-sound').checked;
    A.setSound(save.sound);
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
    show('menu');
    menuState();
  }

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
    $('btn-next').textContent = match ? 'Play again' : 'Next frame';
    $('btn-next').dataset.match = match ? '1' : '';
    if (match && pl[1].ai) {
      save.record[pl[1].ai][winner === 0 ? 0 : 1]++;
      persist();
    }
    open('sheet-over');
  };
  $('btn-next').addEventListener('click', () => {
    const again = $('btn-next').dataset.match;
    close();
    if (again) G.startMatch({ mode: save.mode, level: save.level, race: save.race, names: save.names });
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

  window.addEventListener('resize', () => render.resize());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === 'game' && !sheet && G.phase !== 'idle' && G.phase !== 'over') $('btn-pause').click();
  });

  /* ---------- Main loop ---------- */

  render.init($('table'));
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (screen === 'game') {
      G.update(dt);
      render.draw(G, now);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})(window.EB = window.EB || {});
