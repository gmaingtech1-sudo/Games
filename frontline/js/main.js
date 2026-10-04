/* Frontline — app controller: the menu, briefings, settings, the debrief and
   the main loop. */
(function (FL) {
  'use strict';

  const A = FL.audio;
  const D = FL.data;
  const M = FL.missions;
  const save = FL.save;
  const $ = (id) => document.getElementById(id);

  let current = null;     // mission being briefed or played
  let loadout = null;
  let sheet = null;
  let resetArmed = 0;
  let toastT = 0;

  save.load();
  FL.game.init();

  /* ---------- Screens ---------- */

  function show(id) {
    for (const s of ['menu', 'brief', 'game']) $(s).hidden = s !== id;
    document.body.dataset.screen = id;
  }

  function unlocked(weaponId) {
    const w = D.WEAPONS[weaponId];
    return !w.unlock || (save.data.missions[w.unlock] && save.data.missions[w.unlock].done);
  }

  function missionOpen(i) {
    return i === 0 || !!(save.data.missions[M.MISSIONS[i - 1].id] && save.data.missions[M.MISSIONS[i - 1].id].done);
  }

  /* ---------- Menu ---------- */

  function renderMenu() {
    const r = D.rankFor(save.data.kills);
    $('rank-name').textContent = r.name;
    $('rank-sub').textContent = save.data.kills.toLocaleString('en-US') + ' enemies down' + (r.next ? ' · ' + r.next.name + ' at ' + r.next.at : '');
    const prevAt = D.RANKS.filter((x) => x[0] <= save.data.kills).pop()[0];
    $('rank-fill').style.width = r.next ? (((save.data.kills - prevAt) / (r.next.at - prevAt)) * 100).toFixed(0) + '%' : '100%';
    const idx = D.RANKS.findIndex((x) => x[1] === r.name);
    $('rank-chev').innerHTML = '<i></i>'.repeat(Math.min(3, idx)) + (idx >= 4 ? '<b></b>'.repeat(Math.min(3, idx - 3)) : '');

    const list = $('mission-list');
    list.innerHTML = '';
    M.MISSIONS.forEach((m, i) => {
      const rec = save.data.missions[m.id];
      const open = missionOpen(i);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'mission' + (open ? '' : ' locked') + (rec && rec.done ? ' done' : '');
      b.disabled = !open;
      const stars = rec ? rec.stars : 0;
      b.innerHTML =
        '<span class="m-num">' + (i + 1) + '</span>' +
        '<span class="m-info"><span class="m-name">' + m.name + '</span>' +
        '<span class="m-place">' + m.date + ' · ' + m.place + '</span></span>' +
        '<span class="m-stars" aria-label="' + stars + ' of 3 stars">' + [0, 1, 2].map((k) => '<i class="' + (k < stars ? 'on' : '') + '">★</i>').join('') + '</span>';
      if (!open) b.innerHTML += '<span class="lock" aria-hidden="true">🔒</span>';
      b.addEventListener('click', () => { A.play('click'); brief(m); });
      list.appendChild(b);
    });
    $('survival-best').textContent = save.data.survivalBest ? 'Best: wave ' + save.data.survivalBest : '';
  }

  /* ---------- Briefing ---------- */

  function brief(m) {
    current = m;
    loadout = Object.assign({}, save.data.loadout);
    if (!unlocked(loadout.primary)) loadout.primary = 'garand';
    if (!unlocked(loadout.secondary)) loadout.secondary = 'pistol';
    $('b-date').textContent = m.date;
    $('b-name').textContent = m.name;
    $('b-place').textContent = m.place;
    $('b-text').textContent = m.brief;
    const ol = $('b-objs');
    ol.innerHTML = '';
    for (const o of m.objectives) {
      const li = document.createElement('li');
      li.textContent = o.text + (o.type === 'hold' ? ' (' + o.time + ' s)' : '');
      ol.appendChild(li);
    }
    renderLoadout();
    show('brief');
    $('brief').scrollTop = 0;
  }

  function chip(label, on, locked, fn, title) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip' + (on ? ' on' : '') + (locked ? ' locked' : '');
    b.textContent = label;
    b.disabled = !!locked;
    if (title) b.title = title;
    b.addEventListener('click', () => { A.play('click'); fn(); });
    return b;
  }

  function lockText(w) {
    const m = M.byId(w.unlock);
    return 'Complete ' + (m ? m.name : 'the campaign') + ' to unlock';
  }

  function renderLoadout() {
    const pr = $('lo-primary');
    const se = $('lo-secondary');
    const df = $('lo-diff');
    pr.innerHTML = '';
    se.innerHTML = '';
    df.innerHTML = '';
    for (const id of D.PRIMARIES) {
      const w = D.WEAPONS[id];
      pr.appendChild(chip(w.name, loadout.primary === id, !unlocked(id), () => { loadout.primary = id; renderLoadout(); }, unlocked(id) ? w.desc : lockText(w)));
    }
    for (const id of D.SECONDARIES) {
      const w = D.WEAPONS[id];
      se.appendChild(chip(w.name, loadout.secondary === id, !unlocked(id), () => { loadout.secondary = id; renderLoadout(); }, unlocked(id) ? w.desc : lockText(w)));
    }
    renderDiff(df);
    const p = D.WEAPONS[loadout.primary];
    const s = D.WEAPONS[loadout.secondary];
    const nextLock = D.PRIMARIES.concat(D.SECONDARIES).map((id) => D.WEAPONS[id]).find((w) => w.unlock && !unlocked(Object.keys(D.WEAPONS).find((k) => D.WEAPONS[k] === w)));
    $('lo-desc').innerHTML = '<b>' + p.name + ':</b> ' + p.desc + '<br><b>' + s.name + ':</b> ' + s.desc +
      (nextLock ? '<br><span class="muted">' + nextLock.name + ': ' + lockText(nextLock).toLowerCase() + '.</span>' : '');
  }

  function renderDiff(el) {
    el.innerHTML = '';
    for (const k of Object.keys(D.DIFFICULTY)) {
      el.appendChild(chip(D.DIFFICULTY[k].name, save.data.settings.difficulty === k, false, () => {
        save.data.settings.difficulty = k;
        save.write();
        renderDiff(el);
        if (el.id !== 'set-diff') renderDiff($('set-diff'));
      }));
    }
  }

  function deploy() {
    save.data.loadout = Object.assign({}, loadout);
    save.write();
    play(current);
  }

  function play(m) {
    current = m;
    show('game');
    $('debrief').hidden = true;
    $('pause').hidden = true;
    A.unlock();
    FL.game.start(m, save.data.loadout, onEnd);
  }

  /* ---------- Debrief ---------- */

  function onEnd(r) {
    const m = current;
    save.data.kills += r.kills;
    let stars = 0;
    let unlockMsg = '';
    if (m.survival) {
      if (r.wave > save.data.survivalBest) save.data.survivalBest = r.wave;
    } else if (r.win) {
      stars = 1 + (r.time <= m.par ? 1 : 0) + (r.accuracy >= 0.35 ? 1 : 0);
      const rec = save.data.missions[m.id] || { done: false, stars: 0, bestTime: null };
      if (!rec.done && m.unlock) unlockMsg = 'New weapon: ' + D.WEAPONS[m.unlock].name + '. ' + D.WEAPONS[m.unlock].desc;
      rec.done = true;
      rec.stars = Math.max(rec.stars, stars);
      rec.bestTime = rec.bestTime == null ? r.time : Math.min(rec.bestTime, r.time);
      save.data.missions[m.id] = rec;
    }
    save.write();

    $('d-title').textContent = m.survival ? 'Overrun at wave ' + r.wave : r.win ? 'Mission complete' : 'Killed in action';
    const st = $('d-stars');
    st.hidden = !!m.survival || !r.win;
    st.innerHTML = [0, 1, 2].map((k) => '<i class="' + (k < stars ? 'on' : '') + '">★</i>').join('');
    const rows = [
      ['Time', FL.util.fmtTime(r.time) + (m.par && r.win ? '  (par ' + FL.util.fmtTime(m.par) + ')' : '')],
      ['Enemies down', r.kills],
      ['Accuracy', Math.round(r.accuracy * 100) + '%'],
      ['Score', r.score.toLocaleString('en-US')],
    ];
    if (m.survival) rows.unshift(['Waves survived', Math.max(0, r.wave - 1) + (r.wave >= save.data.survivalBest ? '  (best!)' : '')]);
    if (!m.survival && r.win) rows.push(['Stars', 'Complete ★ · Under par ' + (r.time <= m.par ? '★' : '☆') + ' · 35% accuracy ' + (r.accuracy >= 0.35 ? '★' : '☆')]);
    $('d-stats').innerHTML = rows.map((x) => '<tr><th>' + x[0] + '</th><td>' + x[1] + '</td></tr>').join('');
    $('d-unlock').hidden = !unlockMsg;
    $('d-unlock').textContent = unlockMsg;
    const idx = M.MISSIONS.indexOf(m);
    const next = r.win && idx >= 0 ? M.MISSIONS[idx + 1] : null;
    $('btn-next').hidden = !next;
    $('btn-next').textContent = next ? 'Next: ' + next.name : '';
    $('btn-retry').textContent = m.survival ? 'Play again' : r.win ? 'Replay' : 'Try again';
    $('debrief').hidden = false;
  }

  /* ---------- Pause ---------- */

  function pause() {
    if (!FL.game.active || !$('debrief').hidden) return;
    FL.game.pause(true);
    $('pause').hidden = false;
  }

  function resume() {
    $('pause').hidden = true;
    FL.game.pause(false);
  }

  function quit() {
    FL.game.stop();
    $('pause').hidden = true;
    $('debrief').hidden = true;
    renderMenu();
    show('menu');
  }

  /* ---------- Settings ---------- */

  function applySettings() {
    const s = save.data.settings;
    A.setEnabled(s.sound);
    for (const el of document.querySelectorAll('[data-setting]')) el.checked = !!s[el.dataset.setting];
  }

  document.addEventListener('change', (e) => {
    const k = e.target.dataset && e.target.dataset.setting;
    if (!k) return;
    save.data.settings[k] = e.target.checked;
    save.write();
    applySettings();
    A.play('click');
  });

  function openSheet(id) {
    sheet = $(id);
    sheet.hidden = false;
    $('scrim').hidden = false;
    if (id === 'sheet-settings') renderDiff($('set-diff'));
  }

  function closeSheet() {
    if (!sheet) return;
    sheet.hidden = true;
    $('scrim').hidden = true;
    sheet = null;
    resetArmed = 0;
    $('btn-reset').textContent = 'Reset progress';
  }

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    toastT = 2.5;
  }

  /* ---------- Wiring ---------- */

  $('btn-settings').addEventListener('click', () => { A.unlock(); A.play('click'); openSheet('sheet-settings'); });
  $('btn-help').addEventListener('click', () => { A.unlock(); A.play('click'); openSheet('sheet-help'); });
  $('scrim').addEventListener('click', closeSheet);
  for (const b of document.querySelectorAll('.sheet-close')) b.addEventListener('click', () => { A.play('click'); closeSheet(); });
  $('btn-reset').addEventListener('click', () => {
    if (Date.now() - resetArmed > 3000) {
      resetArmed = Date.now();
      $('btn-reset').textContent = 'Tap again to wipe everything';
      return;
    }
    save.reset();
    applySettings();
    renderMenu();
    closeSheet();
    toast('Progress reset');
  });
  $('btn-survival').addEventListener('click', () => { A.unlock(); A.play('click'); brief(M.SURVIVAL); });
  $('btn-back').addEventListener('click', () => { A.play('click'); renderMenu(); show('menu'); });
  $('btn-deploy').addEventListener('click', () => { A.unlock(); A.play('click'); deploy(); });
  $('btn-pause').addEventListener('click', () => { A.play('click'); pause(); });
  $('btn-resume').addEventListener('click', () => { A.play('click'); resume(); });
  $('btn-restart').addEventListener('click', () => { A.play('click'); FL.game.stop(); play(current); });
  $('btn-quit').addEventListener('click', () => { A.play('click'); quit(); });
  $('btn-menu').addEventListener('click', () => { A.play('click'); quit(); });
  $('btn-retry').addEventListener('click', () => { A.play('click'); FL.game.stop(); play(current); });
  $('btn-next').addEventListener('click', () => {
    A.play('click');
    const idx = M.MISSIONS.indexOf(current);
    FL.game.stop();
    brief(M.MISSIONS[idx + 1]);
  });
  document.addEventListener('pointerdown', () => A.unlock(), { once: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  window.addEventListener('keydown', (e) => {
    if ((e.key === 'Escape' || e.key === 'p') && !$('pause').hidden) resume();
    else if (e.key === 'Escape' && sheet) closeSheet();
  });

  FL.app = { pause };

  /* ---------- Main loop ---------- */

  let lastT = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - lastT) / 1000);
    lastT = now;
    if (FL.game.active) {
      if (!FL.game.paused) FL.game.update(dt);
      if (FL.game.active) FL.game.render();
    }
    if (toastT > 0) {
      toastT -= dt;
      if (toastT <= 0) $('toast').hidden = true;
    }
    requestAnimationFrame(frame);
  }

  applySettings();
  renderMenu();
  show('menu');
  requestAnimationFrame(frame);

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})(window.FL);
