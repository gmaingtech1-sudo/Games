/* Hyperdot — app controller: the title screen, worlds, levels and Endless
   lists, the world intros, the win card, settings, help, toasts and the
   main loop. */
(function (HD) {
  'use strict';

  const A = HD.audio;
  const P = HD.progress;
  const LV = HD.levels;
  const W = LV.WORLDS;
  const $ = (id) => document.getElementById(id);

  const SCREENS = ['title', 'worlds', 'levels', 'endless', 'game'];
  let screen = 'title';
  let world = W[0];
  let sheet = null;
  let overlay = null;
  let introThen = null;
  let introWorld = null;
  let toastTimer = 0;
  let resetArmed = 0;
  let winInfo = null;
  let t = 0;

  const els = {
    titleArt: $('title-art'), titleDim: $('title-dim'), play: $('btn-play'), playLabel: $('play-label'), playSub: $('play-sub'),
    titleStars: $('title-stars'), worldsBtn: $('btn-worlds'), endlessBtn: $('btn-endless'), settingsBtn: $('btn-settings'),
    worldList: $('world-list'), worldsStars: $('worlds-stars'),
    levelsTitle: $('levels-title'), levelsStars: $('levels-stars'), levelsArt: $('levels-art'), levelsDim: $('levels-dim'),
    levelsSub: $('levels-sub'), levelsIntro: $('levels-intro'), levelGrid: $('level-grid'),
    endlessList: $('endless-list'),
    gBack: $('g-back'), gHelp: $('g-help'),
    intro: $('intro'), introArt: $('intro-art'), introDim: $('intro-dim'), introName: $('intro-name'),
    introL1: $('intro-l1'), introL2: $('intro-l2'), introAxes: $('intro-axes'), introGo: $('intro-go'),
    win: $('win'), winTitle: $('win-title'), winStars: $('win-stars'), winLine: $('win-line'), winNote: $('win-note'),
    winRetry: $('win-retry'), winNext: $('win-next'), winList: $('win-list'),
    scrim: $('scrim'), settings: $('sheet-settings'), settingsClose: $('settings-close'), reset: $('btn-reset'),
    howto: $('btn-howto'), help: $('sheet-help'), helpClose: $('help-close'), legend: $('legend'),
    toast: $('toast'),
  };

  /* ---------- Canvas helpers ---------- */

  function fitCanvas(c) {
    const r = c.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const w = Math.max(1, Math.round(r.width * dpr));
    const h = Math.max(1, Math.round(r.height * dpr));
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, r.width, r.height);
    return { g, w: r.width, h: r.height };
  }

  /* ---------- Screens ---------- */

  function show(name) {
    screen = name;
    for (const s of SCREENS) $(s).hidden = s !== name;
    if (name !== 'game') HD.game.stop();
    if (name === 'title') buildTitle();
    if (name === 'worlds') buildWorlds();
    if (name === 'levels') buildLevels();
    if (name === 'endless') buildEndless();
    if (name !== 'game') A.music(0);
  }

  for (const b of document.querySelectorAll('[data-back]')) {
    b.addEventListener('click', () => {
      A.play('click');
      show(b.dataset.back);
    });
  }

  /* ---------- Title ---------- */

  function buildTitle() {
    const next = P.nextUp();
    const any = Object.keys(P.data.levels).length > 0;
    els.playLabel.textContent = any ? 'Continue' : 'Play';
    els.playSub.textContent = `${next.world.n}D · ${next.name}`;
    els.titleStars.textContent = any ? `★ ${P.stars()} of ${P.maxStars()}` : '';
  }

  els.play.addEventListener('click', () => {
    A.unlock();
    A.play('click');
    playLevel(P.nextUp());
  });
  els.worldsBtn.addEventListener('click', () => {
    A.unlock();
    A.play('click');
    show('worlds');
  });
  els.endlessBtn.addEventListener('click', () => {
    A.unlock();
    A.play('click');
    show('endless');
  });

  function drawTitle() {
    const { g, w, h } = fitCanvas(els.titleArt);
    // Climb through the dimensions, 0D to 5D and round again, starting on
    // the tesseract.
    const per = 4.2;
    const cyc = t / per;
    const n = (Math.floor(cyc) + 4) % 6;
    const k = cyc - Math.floor(cyc);
    const fadeIn = Math.min(1, k * 4);
    const fadeOut = Math.min(1, (1 - k) * 5);
    const size = Math.min(w, h * 0.55);
    const cy = h * 0.36;
    HD.art.ncube(g, n, { x: w / 2, y: cy, size, t: t * 0.8, alpha: Math.min(fadeIn, fadeOut), runner: true, id: 'title' });
    const label = n + 'D';
    if (els.titleDim.textContent !== label) {
      els.titleDim.textContent = label;
      els.titleDim.style.color = n ? HD.AXES[n - 1].color : '#7DF9FF';
    }
    els.titleDim.style.opacity = Math.min(fadeIn, fadeOut);
  }

  /* ---------- Worlds ---------- */

  function buildWorlds() {
    els.worldsStars.textContent = `★ ${P.stars()}/${P.maxStars()}`;
    els.worldList.innerHTML = '';
    for (const w of W) {
      const open = P.worldOpen(w);
      const done = w.levels.filter((lv) => P.done(lv.id)).length;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'world-card' + (open ? '' : ' locked');
      b.style.setProperty('--ax', HD.AXES[w.n - 1].color);
      b.innerHTML = `
        <canvas class="world-art" data-n="${w.n}" aria-hidden="true"></canvas>
        <span class="world-info">
          <span class="world-dim">${w.n}D</span>
          <b>${w.name}</b>
          <small>${open ? w.sub : `Finish ${W[w.n - 2].name} to open`}</small>
          <span class="world-bar"><i style="width:${(done / w.levels.length) * 100}%"></i></span>
        </span>
        <span class="world-stars">${open ? `★ ${P.stars(w)}<small>/${P.maxStars(w)}</small>` : lockSvg()}</span>`;
      b.setAttribute('aria-label', `${w.n}D, ${w.name}. ${open ? `${done} of ${w.levels.length} levels done` : 'Locked'}`);
      b.addEventListener('click', () => {
        if (!open) {
          A.play('deny');
          toast(`Finish ${W[w.n - 2].name} to open ${w.name}.`);
          return;
        }
        A.play('click');
        world = w;
        show('levels');
      });
      els.worldList.appendChild(b);
    }
  }

  const lockSvg = () => '<svg class="lock" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';

  function drawWorlds() {
    for (const c of els.worldList.querySelectorAll('canvas')) {
      const { g, w, h } = fitCanvas(c);
      const n = Number(c.dataset.n);
      const locked = c.closest('.locked');
      HD.art.ncube(g, n, { x: w / 2, y: h / 2, size: Math.min(w, h), t: t * 0.7 + n, alpha: locked ? 0.35 : 1, lw: 1.4, runner: !locked, id: 'w' + n });
    }
  }

  /* ---------- Levels ---------- */

  function buildLevels() {
    const w = world;
    els.levelsTitle.textContent = w.name;
    els.levelsStars.textContent = `★ ${P.stars(w)}/${P.maxStars(w)}`;
    els.levelsDim.textContent = w.n + 'D';
    els.levelsDim.style.color = HD.AXES[w.n - 1].color;
    els.levelsSub.textContent = w.intro[0];
    els.levelGrid.innerHTML = '';
    for (const lv of w.levels) {
      const open = P.unlocked(lv);
      const r = P.result(lv.id);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'level-tile' + (open ? '' : ' locked') + (r ? ' done' : '');
      b.style.setProperty('--ax', HD.AXES[w.n - 1].color);
      const stars = r ? r.stars : 0;
      b.innerHTML = `
        <span class="lt-num">${lv.index + 1}</span>
        <span class="lt-name">${lv.name}</span>
        <span class="lt-stars">${open ? [0, 1, 2].map((i) => `<i class="${i < stars ? 'on' : ''}"></i>`).join('') : lockSvg()}</span>
        <span class="lt-best">${r ? `best ${r.best} · par ${lv.par}` : open ? `par ${lv.par}` : ''}</span>`;
      b.setAttribute('aria-label', `Level ${lv.index + 1}, ${lv.name}. ${open ? (r ? `${stars} stars, best ${r.best} moves` : 'Not solved yet') : 'Locked'}`);
      b.addEventListener('click', () => {
        if (!open) {
          A.play('deny');
          toast('Solve the level before this one first.');
          return;
        }
        A.play('click');
        playLevel(lv);
      });
      els.levelGrid.appendChild(b);
    }
  }

  els.levelsIntro.addEventListener('click', () => {
    A.play('click');
    showIntro(world, null);
  });

  function drawLevelsArt() {
    const { g, w, h } = fitCanvas(els.levelsArt);
    HD.art.ncube(g, world.n, { x: w / 2, y: h / 2, size: Math.min(w, h), t: t * 0.7, runner: true, id: 'levels' });
  }

  /* ---------- Endless ---------- */

  function buildEndless() {
    els.endlessList.innerHTML = '';
    for (const w of W) {
      const open = P.worldDone(w);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'endless-row' + (open ? '' : ' locked');
      b.style.setProperty('--ax', HD.AXES[w.n - 1].color);
      const solved = P.data.endless[w.n];
      b.innerHTML = `<span class="world-dim">${w.n}D</span><span class="er-text"><b>${open ? 'Endless ' + w.n + 'D' : w.name}</b><small>${open ? `${solved} solved` : `Finish ${w.name} to open`}</small></span>${open ? '<svg class="go" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>' : lockSvg()}`;
      b.addEventListener('click', () => {
        if (!open) {
          A.play('deny');
          toast(`Finish every level of ${w.name} to open Endless ${w.n}D.`);
          return;
        }
        A.play('click');
        playEndless(w.n);
      });
      els.endlessList.appendChild(b);
    }
  }

  /* ---------- Playing ---------- */

  function playLevel(lv) {
    world = lv.world;
    if (!P.data.seen['w' + lv.world.n]) {
      showIntro(lv.world, () => begin(lv));
      return;
    }
    begin(lv);
  }

  function begin(lv) {
    hideWin();
    show('game');
    HD.game.start(lv, { mode: 'campaign', level: lv });
    A.music(lv.world.n);
  }

  function playEndless(n, keepCam) {
    const solved = P.data.endless[n];
    const target = 14 + Math.min(solved, 10) * 2;
    let made = null;
    for (let i = 0; i < 6 && !made; i++) made = HD.gen.generate(n, (Date.now() + i * 7919 + Math.floor(Math.random() * 1e9)) >>> 0, { target });
    if (!made) {
      toast('Couldn’t make a puzzle. Try again.');
      return;
    }
    hideWin();
    show('game');
    HD.game.start({ id: 'E' + n, name: 'Endless', par: made.par, map: made.def.map }, { mode: 'endless', n, keepCam });
    A.music(n);
  }

  els.gBack.addEventListener('click', () => {
    A.play('click');
    leaveGame();
  });

  function leaveGame() {
    const c = HD.game.context;
    hideWin();
    if (c && c.mode === 'endless') show('endless');
    else show('levels');
  }

  /* ---------- World intro ---------- */

  function showIntro(w, then) {
    introWorld = w;
    introThen = then;
    els.introDim.textContent = w.n + 'D';
    els.introDim.style.color = HD.AXES[w.n - 1].color;
    els.introName.textContent = w.name;
    els.introL1.textContent = w.intro[0];
    els.introL2.textContent = w.intro[1];
    els.introAxes.innerHTML = HD.AXES.slice(0, w.n).map((a, i) => `<span class="${i === w.n - 1 ? 'new' : ''}" style="--ax:${a.color}">${a.name}${i === w.n - 1 ? '<small>new</small>' : ''}</span>`).join('');
    els.introGo.textContent = then ? 'Begin' : 'Close';
    openOverlay(els.intro);
  }

  els.introGo.addEventListener('click', () => {
    A.unlock();
    A.play('click');
    P.data.seen['w' + introWorld.n] = true;
    P.save();
    closeOverlay();
    const then = introThen;
    introThen = null;
    if (then) then();
  });

  function drawIntro() {
    const { g, w, h } = fitCanvas(els.introArt);
    HD.art.ncube(g, introWorld.n, { x: w / 2, y: h / 2, size: Math.min(w, h), t: t * 0.8, runner: true, id: 'intro' });
  }

  /* ---------- Win card ---------- */

  function showWin(info) {
    winInfo = info;
    const { moves, par, stars, best, hinted, ctx } = info;
    els.winTitle.textContent = stars === 3 ? 'Perfect' : 'Solved';
    els.winLine.innerHTML = `<b>${moves}</b> moves · par ${par}`;
    let note = '';
    let nextLabel = 'Next';
    if (ctx.mode === 'campaign') {
      const lv = ctx.level;
      const w = lv.world;
      const last = lv.index === w.levels.length - 1;
      if (last && w.n === 5) {
        note = 'You’ve been through all five dimensions. Every Endless mode is open.';
        nextLabel = 'Finish';
      } else if (last) {
        note = `${w.name} done. Endless ${w.n}D is open, and ${W[w.n].name} awaits.`;
        nextLabel = `On to ${w.n + 1}D`;
      } else if (hinted) note = 'Solved with a hint. Try it without for more stars.';
      else if (best) note = 'New best!';
      else if (stars < 3) note = `Par is ${par}. Can you match it?`;
    } else {
      note = hinted ? 'Solved with a hint.' : stars === 3 ? 'Spot on par.' : `Par was ${par}.`;
      nextLabel = 'New puzzle';
      els.winList.textContent = 'Endless menu';
    }
    if (ctx.mode === 'campaign') els.winList.textContent = 'All levels';
    els.winNote.textContent = note;
    els.winNext.textContent = nextLabel;
    const icons = els.winStars.querySelectorAll('i');
    icons.forEach((el) => el.classList.remove('on'));
    openOverlay(els.win, true);
    icons.forEach((el, i) => {
      if (i < stars) {
        setTimeout(() => {
          el.classList.add('on');
          A.play('star', i);
        }, 250 + i * 220);
      }
    });
  }

  function hideWin() {
    if (overlay === els.win) closeOverlay();
    els.win.hidden = true;
  }

  els.winRetry.addEventListener('click', () => {
    A.play('click');
    hideWin();
    HD.game.restart();
  });

  els.winNext.addEventListener('click', () => {
    A.play('click');
    goNext();
  });

  function goNext() {
    if (!winInfo) return;
    const ctx = winInfo.ctx;
    hideWin();
    if (ctx.mode === 'endless') {
      playEndless(ctx.n, true);
      return;
    }
    const next = LV.next(ctx.level);
    if (!next) {
      show('worlds');
      toast('That’s every level. Endless mode has more for every dimension.');
      return;
    }
    playLevel(next);
  }

  els.winList.addEventListener('click', () => {
    A.play('click');
    leaveGame();
  });

  /* ---------- Overlays and sheets ---------- */

  function openOverlay(el) {
    closeOverlay();
    overlay = el;
    el.hidden = false;
  }

  function closeOverlay() {
    if (!overlay) return;
    overlay.hidden = true;
    overlay = null;
  }

  function openSheet(el) {
    closeSheet();
    sheet = el;
    els.scrim.hidden = false;
    el.hidden = false;
  }

  function closeSheet() {
    if (!sheet) return;
    sheet.hidden = true;
    sheet = null;
    els.scrim.hidden = true;
    resetArmed = 0;
    els.reset.textContent = 'Reset progress';
  }

  els.scrim.addEventListener('click', closeSheet);
  els.settingsBtn.addEventListener('click', () => {
    A.unlock();
    A.play('click');
    applySettings();
    openSheet(els.settings);
  });
  els.settingsClose.addEventListener('click', () => {
    A.play('click');
    closeSheet();
  });
  els.howto.addEventListener('click', () => {
    A.play('click');
    openSheet(els.help);
  });
  els.gHelp.addEventListener('click', () => {
    A.play('click');
    openSheet(els.help);
  });
  els.helpClose.addEventListener('click', () => {
    A.play('click');
    closeSheet();
  });

  els.reset.addEventListener('click', () => {
    const now = Date.now();
    if (now - resetArmed > 3000) {
      resetArmed = now;
      els.reset.textContent = 'Tap again to erase all progress';
      A.play('deny');
      return;
    }
    P.reset();
    closeSheet();
    show('title');
    toast('Progress reset. Back to the line.');
  });

  function applySettings() {
    const s = P.data.settings;
    A.setSound(s.sound);
    A.setMusic(s.music);
    for (const el of document.querySelectorAll('[data-setting]')) el.checked = !!s[el.dataset.setting];
  }

  document.addEventListener('change', (e) => {
    const k = e.target.dataset && e.target.dataset.setting;
    if (!k) return;
    P.data.settings[k] = e.target.checked;
    P.save();
    applySettings();
    A.play('click');
  });

  // The legend in the help sheet, drawn with the game's own sprites.
  function buildLegend() {
    const S = HD.view.sprites;
    const items = [
      ['dot', 'You, the dot.'],
      ['shard', 'Shard. Collect them all to open the exit.'],
      ['exit', 'Exit. Dashed while shards are left, bright once it opens.'],
      ['key', 'Key. Opens one door of the same colour.'],
      ['door', 'Door. Walk into it holding the right key.'],
      ['crate', 'Crate. Walk into it to push it, if the space beyond is free.'],
      ['plate', 'Plate. Holds the gates open while you or a crate stands on it.'],
      ['gate', 'Gate. Open only while every plate is held down.'],
    ];
    els.legend.innerHTML = '';
    for (const [kind, text] of items) {
      const li = document.createElement('li');
      const c = document.createElement('canvas');
      c.width = c.height = 80;
      c.className = 'legend-icon';
      const g = c.getContext('2d');
      g.scale(2, 2);
      const x = 20;
      const y = 20;
      const C = HD.view.COL;
      if (kind === 'dot') S.drawPlayer(g, x, y, 9, 0, 1, false);
      if (kind === 'shard') S.drawShard(g, x, y, 10, 0.3, true);
      if (kind === 'exit') {
        S.drawExit(g, x - 1, y, 10, 0, true, true);
      }
      if (kind === 'key') S.drawKey(g, x, y, 11, HD.grid.KEY_COLORS[0], 0, true);
      if (kind === 'door') {
        S.roundRect(g, 6, 6, 28, 28, 6);
        g.fillStyle = HD.util.shade(HD.grid.KEY_COLORS[0], -0.35);
        g.fill();
        g.strokeStyle = HD.grid.KEY_COLORS[0];
        g.lineWidth = 2;
        g.stroke();
        S.drawKeyhole(g, x, y, 11, HD.util.shade(HD.grid.KEY_COLORS[0], 0.6));
      }
      if (kind === 'crate') {
        S.roundRect(g, 8, 8, 24, 24, 4);
        g.fillStyle = C.crate;
        g.fill();
        g.strokeStyle = HD.util.shade(C.crate, -0.5);
        g.lineWidth = 2;
        g.stroke();
        g.beginPath();
        g.moveTo(12, 12);
        g.lineTo(28, 28);
        g.moveTo(28, 12);
        g.lineTo(12, 28);
        g.stroke();
      }
      if (kind === 'plate') {
        g.strokeStyle = C.gate;
        g.lineWidth = 2.4;
        g.beginPath();
        for (const [ax, ay, dx, dy] of [[7, 7, 1, 1], [33, 7, -1, 1], [33, 33, -1, -1], [7, 33, 1, -1]]) {
          g.moveTo(ax + dx * 8, ay);
          g.lineTo(ax, ay);
          g.lineTo(ax, ay + dy * 8);
        }
        g.stroke();
      }
      if (kind === 'gate') {
        g.save();
        S.roundRect(g, 6, 6, 28, 28, 5);
        g.clip();
        g.fillStyle = HD.util.rgba(C.gate, 0.22);
        g.fillRect(0, 0, 40, 40);
        g.strokeStyle = HD.util.rgba(C.gate, 0.85);
        g.lineWidth = 3;
        g.beginPath();
        for (let q = -1; q <= 3; q++) {
          g.moveTo(q * 12, 40);
          g.lineTo(q * 12 + 20, 0);
        }
        g.stroke();
        g.restore();
      }
      const span = document.createElement('span');
      span.textContent = text;
      li.appendChild(c);
      li.appendChild(span);
      els.legend.appendChild(li);
    }
  }

  function toast(msg) {
    els.toast.textContent = msg;
    if (screen === 'game') {
      const r = $('g-stage').getBoundingClientRect();
      els.toast.style.top = Math.max(60, r.bottom - 70) + 'px';
    } else {
      els.toast.style.top = '';
    }
    els.toast.hidden = false;
    els.toast.classList.remove('show');
    void els.toast.offsetWidth;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { els.toast.hidden = true; }, 3200);
  }

  /* ---------- Keyboard ---------- */

  // Step back one place. Returns false on the title screen with nothing
  // open, where the Android app closes instead.
  function back() {
    if (sheet) closeSheet();
    else if (overlay === els.intro) {
      introThen = null;
      closeOverlay();
    } else if (overlay === els.win || screen === 'game') leaveGame();
    else if (screen === 'levels') show('worlds');
    else if (screen !== 'title') show('title');
    else return false;
    A.play('click');
    return true;
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      back();
      e.preventDefault();
      return;
    }
    if (sheet) return;
    if (overlay === els.intro) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        els.introGo.click();
      }
      return;
    }
    if (overlay === els.win) {
      if (e.key === 'Enter' || e.key === 'n') {
        e.preventDefault();
        goNext();
      } else if (e.key.toLowerCase() === 'x' || e.key.toLowerCase() === 'r') {
        e.preventDefault();
        els.winRetry.click();
      }
      return;
    }
    if (screen === 'game' && HD.game.key(e)) e.preventDefault();
  });

  document.addEventListener('pointerdown', () => A.unlock(), { capture: true });

  document.addEventListener('visibilitychange', () => A.suspend(document.hidden));

  window.addEventListener('resize', () => {
    if (screen === 'game') HD.game.resize();
  });

  /* ---------- Loop ---------- */

  let last = 0;
  function loop(now) {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    t += dt;
    try {
      if (screen === 'game') HD.game.frame(dt);
      else if (screen === 'title') drawTitle();
      else if (screen === 'worlds') drawWorlds();
      else if (screen === 'levels') drawLevelsArt();
      if (overlay === els.intro) drawIntro();
    } catch (err) {
      console.error(err);
    }
    requestAnimationFrame(loop);
  }

  function registerSW() {
    if (HD.native || !('serviceWorker' in navigator) || window.top !== window) return;
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is optional */ });
  }

  HD.ui = { toast, showWin, hideWin, show, back };

  applySettings();
  buildLegend();
  show('title');
  requestAnimationFrame(loop);
  registerSW();
})(window.HD = window.HD || {});
