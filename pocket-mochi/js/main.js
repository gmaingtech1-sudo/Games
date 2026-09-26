/* Pocket Mochi — app controller: touch input, UI, saving and the main loop. */
(function (PM) {
  'use strict';

  const M = PM.model;
  const A = PM.audio;
  const $ = (id) => document.getElementById(id);
  const NAMES = ['Mochi', 'Daifuku', 'Pudding', 'Boba', 'Noodle', 'Peach', 'Sesame', 'Kiwi', 'Dumpling',
    'Tofu', 'Sprout', 'Biscuit', 'Yuzu', 'Taro', 'Pebble', 'Marshy', 'Bean', 'Gumdrop', 'Nori', 'Puff'];

  const els = {
    room: $('room'), canvas: $('stage'), name: $('pet-name'), stage: $('pet-stage'),
    coins: $('coin-count'), coinsBox: document.querySelector('.topbar .coins'),
    banner: $('banner'), bannerText: $('banner-text'), bannerBtn: $('banner-btn'),
    heal: $('btn-heal'), toast: $('toast'), tray: $('tray'), trayItems: $('tray-items'),
    hud: $('game-hud'), hudScore: $('hud-score'), hudLives: $('hud-lives'), tip: $('game-tip'),
    over: $('gameover'), dock: document.querySelector('.dock'),
    feed: $('act-feed'), play: $('act-play'), wash: $('act-wash'), sleep: $('act-sleep'),
    sleepLabel: $('sleep-label'), shop: $('act-shop'),
    scrim: $('scrim'), shopSheet: $('sheet-shop'), settingsSheet: $('sheet-settings'),
    shopGrid: $('shop-grid'), shopCoins: $('shop-coins'),
    adopt: $('adopt'), preview: $('preview'),
  };
  const meters = Array.from(document.querySelectorAll('.meter')).map((el) => ({
    el, key: el.dataset.stat, fill: el.querySelector('.fill'), label: el.textContent.trim(),
  }));

  const ctx = els.canvas.getContext('2d');
  const pet = new PM.PetView();
  const fx = new PM.Particles();
  const game = new PM.StarCatch();

  let s = null;             // the saved pet
  let mode = 'home';        // home | wash | game | gameover
  let W = 1;
  let H = 1;
  let dpr = 1;
  let bg = null;
  let layout = { floorY: 0, groundY: 0 };
  let ground = null;        // where the pet stands; rises onto the snack tray when it is open
  let night = isNight();
  let pointer = null;       // finger on the canvas
  let drag = null;          // snack being dragged from the tray
  let fly = null;           // snack flying to the pet after a tap
  let eating = null;
  let washGain = 0;
  let strokeAcc = 0;
  let tapTimes = [];
  let lookClear = 0;
  let lastFrame = 0;
  let overDelay = 0;
  let toastTimer = 0;
  let resetArmed = 0;
  let shopTab = 'food';
  const timers = { save: 0, ui: 0, stink: 0, z: 0, purr: 0, bubble: 0, night: 0, idle: 0 };
  const icons = { food: {}, hat: {} };

  /* ---------------- storage ---------------- */

  // PM.host decides where saves live: localStorage in a browser, the app's
  // own storage inside the Android app.
  function load() {
    try {
      const raw = PM.host.loadSave();
      return raw ? M.revive(JSON.parse(raw)) : null;
    } catch (e) {
      return null;
    }
  }

  function save() {
    if (s) PM.host.writeSave(JSON.stringify(s));
  }

  function wipe() {
    PM.host.clearSave();
  }

  /* ---------------- helpers ---------------- */

  function isNight() {
    const h = new Date().getHours();
    return h >= 19 || h < 6;
  }

  function toRoom(e) {
    const r = els.room.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function petSize() { return Math.min(W * 0.46, H * 0.4, 230); }

  function toast(msg, ms) {
    els.toast.textContent = msg;
    els.toast.hidden = false;
    els.toast.style.animation = 'none';
    void els.toast.offsetWidth;
    els.toast.style.animation = '';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { els.toast.hidden = true; }, ms || 2400);
  }

  function hint(key, msg, ms) {
    if (!s || s.hints[key]) return false;
    s.hints[key] = 1;
    toast(msg, ms || 3200);
    return true;
  }

  function bumpCoins() {
    els.coinsBox.classList.remove('bump');
    void els.coinsBox.offsetWidth;
    els.coinsBox.classList.add('bump');
  }

  function gainXP(n) {
    const up = M.addXP(s, n);
    if (up) {
      A.play('levelup');
      A.buzz([30, 50, 30]);
      fx.confetti(pet.geo.x, pet.geo.top, 50);
      pet.hop(300);
      toast(`${s.name} grew into a ${up.label}! +20 coins`, 3200);
      bumpCoins();
    }
  }

  function poopPos(p) {
    let hsh = 0;
    for (let i = 0; i < p.id.length; i++) hsh = (hsh * 31 + p.id.charCodeAt(i)) | 0;
    const size = Math.max(26, Math.min(44, W * 0.085));
    return { x: p.x * W, y: layout.groundY + 4 + (Math.abs(hsh) % 3) * 6, size };
  }

  /* ---------------- canvas setup ---------------- */

  function resize() {
    const r = els.room.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width));
    H = Math.max(1, Math.round(r.height));
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    els.canvas.width = Math.round(W * dpr);
    els.canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildBackground();
    ground = null;
    if (game.running || mode === 'gameover') game.resize(W, H);
  }

  function buildBackground() {
    bg = document.createElement('canvas');
    bg.width = els.canvas.width;
    bg.height = els.canvas.height;
    const g = bg.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    layout = PM.art.drawRoom(g, W, H, night);
  }

  /* ---------------- UI ---------------- */

  function updateUI() {
    PM.host.setOverlay(!els.scrim.hidden || !els.tray.hidden || (!!s && mode !== 'home'));
    if (!s) return;
    els.name.textContent = s.name;
    els.stage.textContent = s.hatched ? `${M.stage(s).label} · Day ${M.ageDays(s)}` : 'Egg · ready to hatch';
    els.coins.textContent = s.coins;
    for (const m of meters) {
      const v = Math.round(s.stats[m.key]);
      m.fill.style.width = `${v}%`;
      m.el.classList.toggle('low', s.hatched && v < 25);
      m.el.setAttribute('aria-label', `${m.label} ${v}%`);
    }
    const sleeping = s.asleep;
    els.sleep.classList.toggle('waking', sleeping);
    els.sleepLabel.textContent = sleeping ? 'Wake' : 'Sleep';
    const blocked = !s.hatched || sleeping;
    [els.feed, els.play, els.wash].forEach((b) => b.classList.toggle('dim', blocked));
    els.sleep.classList.toggle('dim', !s.hatched);
    els.feed.classList.toggle('on', !els.tray.hidden);
    els.wash.classList.toggle('on', mode === 'wash');
    const showHeal = s.hatched && s.sick && mode === 'home';
    els.heal.hidden = !showHeal;
    els.room.classList.toggle('has-heal', showHeal);
    els.room.classList.toggle('has-banner', !els.banner.hidden);
    els.room.classList.toggle('playing', mode === 'game' || mode === 'gameover');
    const locked = mode === 'game' || mode === 'gameover';
    els.dock.style.pointerEvents = locked ? 'none' : '';
    els.dock.style.opacity = locked ? '0.45' : '';
  }

  /* ---------------- snack tray + feeding ---------------- */

  function renderTray() {
    els.trayItems.innerHTML = '';
    const types = Object.keys(PM.FOODS).filter((k) => s.inv[k] > 0);
    if (!types.length) {
      const empty = document.createElement('div');
      empty.className = 'tray-empty';
      empty.textContent = 'No snacks left.';
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip-btn';
      b.textContent = 'Go to shop';
      b.addEventListener('click', () => { closeTray(); openShop('food'); });
      empty.appendChild(b);
      els.trayItems.appendChild(empty);
      return;
    }
    for (const type of types) {
      const el = document.createElement('div');
      el.className = 'snack';
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
      el.setAttribute('aria-label', `${PM.FOODS[type].name}, ${s.inv[type]} left. Tap to feed.`);
      el.innerHTML = `<img alt="" src="${icons.food[type]}"><span>${PM.FOODS[type].name}</span><span class="count">${s.inv[type]}</span>`;
      el.addEventListener('pointerdown', (e) => snackDown(e, type, el));
      el.addEventListener('pointermove', snackMove);
      el.addEventListener('pointerup', snackUp);
      el.addEventListener('pointercancel', snackUp);
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const r = el.getBoundingClientRect();
          const room = els.room.getBoundingClientRect();
          launchSnack(type, r.left + r.width / 2 - room.left, r.top - room.top);
        }
      });
      els.trayItems.appendChild(el);
    }
  }

  function openTray() {
    exitWash(false);
    renderTray();
    els.tray.hidden = false;
    els.tray.querySelector('#tray-title').textContent = `Drag a snack onto ${s.name}`;
    hint('feed', 'Drag a snack to the mouth, or just tap it.');
    pet.hop(320);
    updateUI();
  }

  function closeTray() {
    if (!els.tray.hidden) pet.hop(200);
    els.tray.hidden = true;
    drag = null;
    if (s) updateUI();
  }

  function snackDown(e, type, el) {
    if (drag || eating || fly) return;
    e.preventDefault();
    A.unlock();
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    const p = toRoom(e);
    drag = { type, el, id: e.pointerId, x: p.x, y: p.y, lx: p.x, ly: p.y, moved: 0, t0: performance.now() };
    el.classList.add('dragging');
    A.play('click');
  }

  function snackMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const p = toRoom(e);
    drag.moved += Math.hypot(p.x - drag.lx, p.y - drag.ly);
    drag.lx = drag.x = p.x;
    drag.ly = drag.y = p.y;
  }

  function snackUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    d.el.classList.remove('dragging');
    pet.lookAt = null;
    if (e.type === 'pointercancel') return;
    const quickTap = d.moved < 12 && performance.now() - d.t0 < 450;
    if (quickTap) {
      launchSnack(d.type, d.x, d.y);
      return;
    }
    const held = heldFoodPos(d);
    if (nearMouth(held.x, held.y)) tryFeed(d.type);
    else fx.poof(held.x, held.y);
  }

  // The snack is drawn a little above the finger so it stays visible.
  function heldFoodPos(d) { return { x: d.x, y: d.y - 34 }; }

  function nearMouth(x, y) {
    if (!s.hatched) return false;
    const g = pet.geo;
    return Math.hypot(x - g.x, y - g.mouthY) < g.w * 0.6 || pet.hit(x, y, 16);
  }

  function launchSnack(type, x, y) {
    if (!canFeed()) return;
    fly = { type, x0: x, y0: y, t: 0 };
  }

  function canFeed() {
    if (!s.hatched) { toast('Tap the egg to hatch it first.'); return false; }
    if (s.asleep) { toast(`Shh... ${s.name} is sleeping.`); return false; }
    if (eating) return false;
    return true;
  }

  function tryFeed(type) {
    if (!canFeed()) return;
    const r = M.feed(s, type);
    if (r === 'full') {
      pet.setExpr('no', 1);
      pet.shakeHead(0.6);
      A.play('no');
      toast(`${s.name} is full!`);
      return;
    }
    if (r !== 'ok') return;
    eating = { type, t: 0, bites: 0 };
    pet.setExpr('eat', 1.4);
    renderTray();
    updateUI();
  }

  function updateEating(dt) {
    if (!eating) return;
    eating.t += dt;
    const biteAt = [0.2, 0.6, 1.0];
    if (eating.bites < 3 && eating.t >= biteAt[eating.bites]) {
      eating.bites += 1;
      A.play('chomp');
      A.buzz(12);
      pet.squish(1.4);
      const crumb = { apple: '#FF5A5F', onigiri: '#FFFFFF', fish: '#7CC0F5', dango: '#FF9FC4', cupcake: '#FFB3D3' }[eating.type];
      fx.crumbs(pet.geo.x, pet.geo.mouthY, 5, crumb);
    }
    if (eating.t >= 1.4) {
      const f = PM.FOODS[eating.type];
      eating = null;
      A.play('yum');
      pet.setExpr('yum', 1.1);
      pet.hop(200);
      fx.hearts(pet.geo.x, pet.geo.top, 2);
      gainXP(f.xp);
      save();
      updateUI();
      if (s.stats.hunger >= 96) toast(`${s.name} is nice and full.`);
    }
  }

  /* ---------------- washing ---------------- */

  function enterWash() {
    closeTray();
    mode = 'wash';
    washGain = 0;
    els.bannerText.textContent = `Scrub ${s.name} with your finger`;
    els.bannerBtn.textContent = 'Rinse';
    els.banner.hidden = false;
    els.room.classList.add('wash');
    pet.targetX = null;
    updateUI();
  }

  function exitWash(rinse) {
    if (mode !== 'wash') return;
    mode = 'home';
    els.banner.hidden = true;
    els.room.classList.remove('wash');
    if (rinse && washGain > 30) {
      A.play('splash');
      fx.drops(W, H, 46);
      pet.rinse();
      pet.setExpr('surprise', 0.6);
      setTimeout(() => {
        if (!s) return;
        fx.sparkles(pet.geo.x, pet.geo.cy, 14, pet.geo.w);
        A.play('sparkle');
        pet.setExpr('yum', 1.2);
        pet.hop(220);
      }, 650);
      gainXP(6);
      save();
    } else {
      pet.rinse();
    }
    updateUI();
  }

  function scrub(p, dist) {
    washGain += dist;
    s.stats.clean = M.clamp(s.stats.clean + dist * 0.07);
    timers.bubble += dist;
    if (timers.bubble > 18) {
      timers.bubble = 0;
      const local = pet.toLocal(p.x, p.y);
      pet.addFoam(Math.max(-0.45, Math.min(0.45, local.x)), Math.max(-0.95, Math.min(-0.05, local.y)));
      if (Math.random() < 0.35) fx.bubbles(p.x, p.y, 1);
      A.play('bubble');
    }
    pet.setExpr('giggle', 0.35);
    pet.sqV -= 0.15;
  }

  /* ---------------- petting & tapping ---------------- */

  function stroke(p, dist) {
    strokeAcc += dist;
    pet.setExpr('love', 0.45);
    pet.sqV -= dist * 0.004;
    while (strokeAcc >= 45) {
      strokeAcc -= 45;
      s.stats.fun = M.clamp(s.stats.fun + 1.2);
      gainXP(0.25);
      fx.hearts(p.x, p.y - 12, 1);
    }
    if (timers.purr <= 0) {
      timers.purr = 0.55;
      A.play('purr');
      A.buzz(6);
      if (Math.random() < 0.5) fx.note(pet.geo.x + pet.geo.w * 0.4, pet.geo.top + 10);
    }
  }

  function tapPet() {
    if (s.asleep) {
      pet.squish(1.2);
      A.play('tap');
      toast(`Zzz... tap Wake to wake ${s.name} up.`);
      return;
    }
    const now = performance.now();
    tapTimes = tapTimes.filter((t) => now - t < 2000);
    tapTimes.push(now);
    if (tapTimes.length >= 6) {
      tapTimes = [];
      pet.setExpr('dizzy', 1.4);
      pet.shakeHead(0.5);
      A.play('no');
      s.stats.fun = M.clamp(s.stats.fun - 2);
      toast(`Too many pokes! ${s.name} is dizzy.`);
      return;
    }
    pet.hop(230);
    pet.setExpr('giggle', 0.7);
    A.play('giggle');
    A.buzz(8);
    s.stats.fun = M.clamp(s.stats.fun + 0.6);
    fx.hearts(pet.geo.x, pet.geo.top, 1);
  }

  function tapEgg() {
    s.eggTaps += 1;
    pet.wobbleEgg();
    A.play('crack');
    A.buzz(15);
    if (s.eggTaps >= 5) hatch();
    save();
  }

  function hatch() {
    const now = Date.now();
    s.hatched = true;
    s.born = now;
    s.last = now;
    const cy = layout.groundY - petSize() * 0.3;
    fx.shell(pet.x, cy, 14);
    fx.confetti(pet.x, cy, 46);
    A.play('hatch');
    A.buzz([30, 40, 30]);
    pet.scale = null;
    pet.sq = 0.7;
    pet.hop(320);
    pet.setExpr('surprise', 1.1);
    toast(`Say hi to ${s.name}!`, 2600);
    setTimeout(() => {
      if (s && mode === 'home') hint('stroke', `Stroke ${s.name} with your finger to pet it.`);
    }, 2900);
    save();
    updateUI();
  }

  function handleTap(p) {
    if (!s.hatched) {
      if (pet.hit(p.x, p.y, 30)) tapEgg();
      else toast('Tap the egg to help it hatch!');
      return;
    }
    for (const poop of s.poops) {
      const pp = poopPos(poop);
      if (Math.hypot(p.x - pp.x, p.y - (pp.y - pp.size * 0.4)) < pp.size * 0.85) {
        M.cleanPoop(s, poop.id);
        fx.sparkles(pp.x, pp.y - pp.size * 0.4, 10, pp.size);
        A.play('sparkle');
        A.buzz(10);
        gainXP(2);
        save();
        updateUI();
        return;
      }
    }
    if (pet.hit(p.x, p.y, 8)) {
      tapPet();
      return;
    }
    // Tap the floor and your pet hops over to that spot.
    if (!s.asleep && !s.sick && p.y > layout.floorY) {
      pet.targetX = p.x;
      pet.wander = 5;
    }
  }

  /* ---------------- canvas input ---------------- */

  function onDown(e) {
    if (!s) return;
    A.unlock();
    const p = toRoom(e);
    if (mode === 'game') {
      game.pointer(p.x);
      pointer = { id: e.pointerId };
      try { els.canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      return;
    }
    if (mode === 'gameover' || pointer) return;
    try { els.canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    pointer = { id: e.pointerId, x: p.x, y: p.y, t0: performance.now(), moved: 0, onPet: s.hatched && pet.hit(p.x, p.y, 10) };
    pet.lookAt = p;
    lookClear = 0;
    if (mode === 'wash' && pet.hit(p.x, p.y)) scrub(p, 0);
  }

  function onMove(e) {
    if (!s) return;
    const p = toRoom(e);
    if (mode === 'game') {
      if (pointer || e.pointerType === 'mouse') game.pointer(p.x);
      return;
    }
    if (!pointer || e.pointerId !== pointer.id) {
      if (e.pointerType === 'mouse' && !drag) { pet.lookAt = p; lookClear = 1.5; }
      return;
    }
    const d = Math.hypot(p.x - pointer.x, p.y - pointer.y);
    pointer.moved += d;
    pointer.x = p.x;
    pointer.y = p.y;
    pet.lookAt = p;
    if (mode === 'wash') {
      if (pet.hit(p.x, p.y, 6)) scrub(p, d);
    } else if (s.hatched && !s.asleep && pointer.onPet && pet.hit(p.x, p.y, 16)) {
      stroke(p, d);
    }
  }

  function onUp(e) {
    if (!s) return;
    if (mode === 'game') { pointer = null; return; }
    if (!pointer || e.pointerId !== pointer.id) return;
    const p = toRoom(e);
    const quick = pointer.moved < 12 && performance.now() - pointer.t0 < 400;
    const wasWash = mode === 'wash';
    pointer = null;
    lookClear = 1.2;
    if (e.type === 'pointerup' && quick && !wasWash) handleTap(p);
    if (wasWash && quick && !pet.hit(p.x, p.y)) hint('wash', `Rub your finger over ${s.name} to scrub.`);
  }

  /* ---------------- buttons ---------------- */

  function needsPet() {
    if (!s.hatched) { toast('Tap the egg to hatch it first.'); return true; }
    return false;
  }

  function onFeed() {
    A.play('click');
    if (needsPet()) return;
    if (!els.tray.hidden) { closeTray(); return; }
    if (s.asleep) { toast(`Shh... ${s.name} is sleeping.`); return; }
    openTray();
  }

  function onWash() {
    A.play('click');
    if (needsPet()) return;
    if (mode === 'wash') { exitWash(true); return; }
    if (s.asleep) { toast(`Shh... ${s.name} is sleeping.`); return; }
    enterWash();
  }

  function onSleep() {
    if (needsPet()) return;
    A.play('lights');
    if (s.asleep) {
      s.asleep = false;
      if (s.stats.energy < 50) {
        pet.setExpr('grumpy', 2.2);
        toast(`${s.name} is still sleepy...`);
      } else {
        pet.setExpr('happy', 1);
        pet.hop(240);
        toast(`Good morning, ${s.name}!`);
      }
    } else {
      closeTray();
      exitWash(false);
      s.asleep = true;
      A.play('yawn');
      pet.setExpr('yawn', 1.3);
      pet.targetX = null;
      toast(`Good night, ${s.name}. Energy refills while asleep.`);
    }
    save();
    updateUI();
  }

  function onHeal() {
    M.medicine(s);
    A.play('medicine');
    pet.setExpr('yuck', 1.3);
    pet.shakeHead(0.4);
    setTimeout(() => { if (s) { fx.sparkles(pet.geo.x, pet.geo.cy, 12, pet.geo.w); pet.setExpr('happy', 1); } }, 1300);
    toast(`${s.name} feels better!`);
    gainXP(3);
    save();
    updateUI();
  }

  /* ---------------- mini-game ---------------- */

  function renderLives() {
    const heart = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z"/></svg>';
    els.hudLives.innerHTML = [0, 1, 2].map(() => heart).join('');
    els.hudLives.setAttribute('aria-label', `${game.lives} lives`);
    Array.from(els.hudLives.children).forEach((c, i) => c.classList.toggle('lost', i >= game.lives));
  }

  function startGame() {
    A.play('click');
    if (needsPet()) return;
    if (s.asleep) { toast(`Shh... ${s.name} is sleeping.`); return; }
    if (s.sick) { toast(`${s.name} feels sick. Give medicine first.`); return; }
    if (s.stats.energy < 12) { toast(`${s.name} is too tired to play. Try a nap.`); return; }
    closeTray();
    exitWash(false);
    els.over.hidden = true;
    mode = 'game';
    game.start(W, H);
    renderLives();
    els.hudScore.textContent = '0';
    els.hud.hidden = false;
    els.tip.hidden = false;
    setTimeout(() => { els.tip.hidden = true; }, 2600);
    overDelay = 0;
    updateUI();
  }

  function endGame() {
    mode = 'gameover';
    game.running = false;
    pointer = null;
    els.tip.hidden = true;
    els.hud.hidden = true;
    const score = game.score;
    const coins = game.coins * 2 + Math.floor(score / 3);
    const newBest = score > s.best && score >= 5;
    s.best = Math.max(s.best, score);
    s.coins += coins;
    s.stats.fun = M.clamp(s.stats.fun + Math.min(32, 6 + score * 1.2));
    s.stats.energy = M.clamp(s.stats.energy - (6 + Math.min(10, game.t / 8)));
    s.stats.hunger = M.clamp(s.stats.hunger - 5);
    $('go-title').textContent = newBest ? 'New best!' : score >= 10 ? 'Nice catch!' : 'Good try!';
    $('go-score').textContent = score;
    $('go-best').textContent = s.best;
    $('go-coins').textContent = `+${coins}`;
    $('go-note').textContent = coins > 0 ? `${s.name} had fun and you earned ${coins} coins.` : 'Catch stars and coins to earn money for the shop.';
    els.over.hidden = false;
    A.play(newBest ? 'levelup' : 'gameover');
    if (coins > 0) bumpCoins();
    gainXP(4 + Math.min(30, score * 0.6));
    save();
    updateUI();
  }

  function leaveGame() {
    A.play('click');
    mode = 'home';
    pointer = null;
    els.over.hidden = true;
    els.hud.hidden = true;
    els.tip.hidden = true;
    pet.setExpr('happy', 1.2);
    pet.hop(220);
    updateUI();
  }

  /* ---------------- sheets: shop & settings ---------------- */

  function openSheet(el) {
    closeSheets();
    els.scrim.hidden = false;
    el.hidden = false;
    const focusable = el.querySelector('button');
    if (focusable) focusable.focus({ preventScroll: true });
    updateUI();
  }

  function closeSheets() {
    els.scrim.hidden = true;
    els.shopSheet.hidden = true;
    els.settingsSheet.hidden = true;
    disarmReset();
    updateUI();
  }

  // Android back button: close whatever is on top instead of leaving the app.
  function handleBack() {
    if (!els.scrim.hidden) closeSheets();
    else if (mode === 'game') endGame();
    else if (mode === 'gameover') leaveGame();
    else if (mode === 'wash') exitWash(true);
    else if (!els.tray.hidden) closeTray();
    updateUI();
  }

  function openShop(tab) {
    if (tab) shopTab = tab;
    renderShop();
    openSheet(els.shopSheet);
  }

  function renderShop() {
    els.shopCoins.textContent = s.coins;
    ['food', 'hats'].forEach((t) => $(`tab-${t}`).setAttribute('aria-selected', String(t === shopTab)));
    els.shopGrid.innerHTML = '';
    const coinDot = '<span class="coin-dot" aria-hidden="true"></span>';
    if (shopTab === 'food') {
      for (const [k, f] of Object.entries(PM.FOODS)) {
        const effects = [`+${f.food} food`];
        if (f.fun >= 10) effects.push(`+${f.fun} fun`);
        const item = document.createElement('div');
        item.className = 'item';
        const poor = s.coins < f.price;
        item.innerHTML = `<img alt="" src="${icons.food[k]}"><div class="item-name">${f.name}</div>` +
          `<div class="item-meta">${effects.join(', ')} · have ${s.inv[k] || 0}</div>` +
          `<button type="button" class="buy${poor ? ' poor' : ''}" aria-label="Buy ${f.name} for ${f.price} coins">${coinDot}${f.price}</button>`;
        item.querySelector('.buy').addEventListener('click', () => buyFood(k, item));
        els.shopGrid.appendChild(item);
      }
    } else {
      for (const [k, h] of Object.entries(PM.HATS)) {
        const owned = s.hats.includes(k);
        const wearing = s.hat === k;
        const poor = !owned && s.coins < h.price;
        const item = document.createElement('div');
        item.className = 'item';
        let btn;
        if (!owned) btn = `<button type="button" class="buy${poor ? ' poor' : ''}" aria-label="Buy ${h.name} for ${h.price} coins">${coinDot}${h.price}</button>`;
        else if (wearing) btn = '<button type="button" class="buy wearing">Take off</button>';
        else btn = '<button type="button" class="buy alt">Wear</button>';
        item.innerHTML = `<img alt="" src="${icons.hat[k]}"><div class="item-name">${h.name}</div>` +
          `<div class="item-meta">${wearing ? 'Wearing now' : owned ? 'Yours' : ''}</div>${btn}`;
        item.querySelector('.buy').addEventListener('click', () => hatAction(k, item));
        els.shopGrid.appendChild(item);
      }
    }
  }

  function notEnough(item, price) {
    A.play('no');
    const meta = item.querySelector('.item-meta');
    meta.textContent = `Need ${price - s.coins} more coins`;
  }

  function buyFood(k, item) {
    const f = PM.FOODS[k];
    if (!M.buyFood(s, k)) { notEnough(item, f.price); return; }
    A.play('coin');
    A.buzz(10);
    save();
    renderShop();
    updateUI();
    if (!els.tray.hidden) renderTray();
  }

  function hatAction(k, item) {
    const h = PM.HATS[k];
    if (!s.hats.includes(k)) {
      if (!M.buyHat(s, k)) { notEnough(item, h.price); return; }
      A.play('coin');
      A.buzz(10);
    } else {
      s.hat = s.hat === k ? null : k;
      A.play('click');
    }
    if (s.hat) {
      fx.sparkles(pet.geo.x, pet.geo.top, 10, pet.geo.w * 0.5);
      pet.setExpr('yum', 1);
    }
    save();
    renderShop();
    updateUI();
  }

  function disarmReset() {
    resetArmed = 0;
    const b = $('btn-reset');
    b.classList.remove('armed');
    b.textContent = 'Start over with a new egg';
    $('reset-note').hidden = true;
  }

  function onReset() {
    const b = $('btn-reset');
    if (!resetArmed) {
      resetArmed = Date.now();
      b.classList.add('armed');
      b.textContent = 'Tap again to start over';
      $('reset-note').hidden = false;
      A.play('no');
      return;
    }
    if (Date.now() - resetArmed > 6000) { disarmReset(); onReset(); return; }
    wipe();
    s = null;
    closeSheets();
    closeTray();
    mode = 'home';
    els.over.hidden = true;
    els.hud.hidden = true;
    els.banner.hidden = true;
    showAdopt();
  }

  /* ---------------- model tick & events ---------------- */

  function tickModel() {
    const now = Date.now();
    const hours = (now - s.last) / 3.6e6;
    s.last = now;
    if (hours <= 0) return;
    const away = hours > 0.08;
    const ev = M.simulate(s, hours);
    if (away) {
      const mins = Math.round(hours * 60);
      const span = mins < 60 ? `${mins} min` : `${Math.round(hours)} h`;
      let msg = `Welcome back! You were away ${span}.`;
      if (ev.includes('sick')) msg = `${s.name} got sick while you were away. Give medicine!`;
      else if (ev.includes('poop')) msg = `Welcome back! ${s.name} made a mess while you were away.`;
      else if (ev.includes('woke')) msg = `${s.name} woke up rested while you were away.`;
      toast(msg, 3600);
      save();
      updateUI();
      return;
    }
    if (!ev.length) return;
    if (ev.includes('sick')) { toast(`${s.name} feels sick. Give medicine!`, 3200); A.play('sad'); }
    if (ev.includes('poop')) {
      const p = s.poops[s.poops.length - 1];
      if (p) { const pp = poopPos(p); fx.poof(pp.x, pp.y - 10); }
      hint('poop', 'Uh oh! Tap the poop to clean it up.');
    }
    if (ev.includes('woke')) { toast(`${s.name} woke up feeling rested!`); pet.hop(240); }
    if (ev.includes('fell-asleep')) toast(`${s.name} was so tired it fell asleep.`);
    save();
    updateUI();
  }

  function dailyGift() {
    const today = new Date().toDateString();
    if (s.gift === today) return;
    s.gift = today;
    if (!s.hatched) return;
    s.coins += 10;
    setTimeout(() => { toast('Daily gift: +10 coins!', 2800); bumpCoins(); A.play('coin'); }, 600);
    save();
  }

  /* ---------------- drawing ---------------- */

  function drawSponge(x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.25);
    PM.art.roundRect(ctx, -26, -17, 52, 34, 10);
    ctx.fillStyle = '#FFE27A';
    ctx.fill();
    PM.art.outline(ctx, 3);
    PM.art.roundRect(ctx, -26, 5, 52, 12, 6);
    ctx.fillStyle = '#6FC47C';
    ctx.fill();
    PM.art.outline(ctx, 3);
    ctx.fillStyle = '#E2B43A';
    [[-14, -7, 3.5], [0, -2, 3], [12, -9, 3], [16, 0, 2.5], [-6, -11, 2]].forEach(([dx, dy, r]) => {
      ctx.beginPath();
      ctx.arc(dx, dy, r, 0, PM.art.TAU);
      ctx.fill();
    });
    ctx.restore();
  }

  function drawHome() {
    ctx.drawImage(bg, 0, 0, W, H);
    for (const p of s.poops) {
      const pp = poopPos(p);
      PM.art.drawPoop(ctx, pp.x, pp.y, pp.size);
    }
    const mood = M.mood(s);
    pet.draw(ctx, {
      species: s.species, color: s.color, hat: s.hat, size: petSize(), groundY: ground === null ? layout.groundY : ground,
      clean: s.stats.clean, sick: s.sick, mood, taps: s.eggTaps,
    });
    if (eating) {
      const g = pet.geo;
      const k = 1 - eating.bites * 0.3;
      if (k > 0.05) PM.art.drawFood(ctx, eating.type, g.x, g.mouthY + g.h * 0.08, petSize() * 0.3 * k);
    }
    const busy = eating || fly || drag || mode === 'wash' || (pointer && pointer.onPet);
    if (!busy && s.hatched) pet.drawThought(ctx, M.need(s), pet.t);
    if (fly) {
      const k = Math.min(1, fly.t / 0.38);
      const e = 1 - (1 - k) * (1 - k);
      const x = fly.x0 + (pet.geo.x - fly.x0) * e;
      const y = fly.y0 + (pet.geo.mouthY - fly.y0) * e - Math.sin(k * Math.PI) * 60;
      PM.art.drawFood(ctx, fly.type, x, y, Math.max(40, petSize() * 0.3), k * 6);
    }
    if (drag) {
      const hp = heldFoodPos(drag);
      PM.art.drawFood(ctx, drag.type, hp.x, hp.y, Math.max(46, petSize() * 0.32), Math.sin(pet.t * 8) * 0.12);
    }
    if (mode === 'wash' && pointer) drawSponge(pointer.x, pointer.y);
    if (s.asleep) {
      ctx.fillStyle = 'rgba(14, 16, 44, 0.62)';
      ctx.fillRect(0, 0, W, H);
    }
    fx.draw(ctx);
  }

  function updateHome(dt) {
    let target = layout.groundY;
    if (!els.tray.hidden) target = Math.min(target, els.tray.offsetTop - 4);
    ground = ground === null ? target : ground + (target - ground) * Math.min(1, dt * 9);
    const mood = M.mood(s);
    const busy = !!(eating || drag || fly || mode === 'wash' || (pointer && pointer.onPet));
    pet.update(dt, {
      W, size: petSize(), stageScale: s.hatched ? M.stage(s).scale : 1,
      canWander: s.hatched && !s.asleep && !s.sick && mood !== 'tired' && !busy,
    });

    if (drag) {
      const hp = heldFoodPos(drag);
      pet.lookAt = hp;
      if (s.hatched && !s.asleep && Math.hypot(hp.x - pet.geo.x, hp.y - pet.geo.mouthY) < pet.geo.w * 1.4) {
        pet.setExpr('open', 0.15);
      }
    } else if (lookClear > 0) {
      lookClear -= dt;
      if (lookClear <= 0 && !pointer) pet.lookAt = null;
    }

    if (fly) {
      fly.t += dt;
      pet.lookAt = { x: fly.x0, y: fly.y0 };
      pet.setExpr('open', 0.15);
      if (fly.t >= 0.38) {
        const type = fly.type;
        fly = null;
        pet.lookAt = null;
        tryFeed(type);
      }
    }
    updateEating(dt);
    fx.update(dt);

    timers.purr -= dt;
    timers.z -= dt;
    timers.stink -= dt;
    timers.idle -= dt;
    if (s.asleep && timers.z <= 0) {
      timers.z = 1.1;
      fx.zzz(pet.geo.x + pet.geo.w * 0.3, pet.geo.top + 6);
    }
    if (timers.stink <= 0) {
      timers.stink = 0.45;
      if (s.hatched && s.stats.clean < 25) fx.stink(pet.geo.x + (Math.random() - 0.5) * pet.geo.w * 0.8, pet.geo.top + 10);
      if (s.poops.length && Math.random() < 0.6) {
        const pp = poopPos(s.poops[Math.floor(Math.random() * s.poops.length)]);
        fx.stink(pp.x + (Math.random() - 0.5) * pp.size * 0.5, pp.y - pp.size * 0.9);
      }
    }
    if (timers.idle <= 0) {
      timers.idle = 4 + Math.random() * 5;
      if (!busy && s.hatched && !s.asleep) {
        if (mood === 'tired') { pet.setExpr('yawn', 1.2); }
        else if (mood === 'happy' && Math.random() < 0.5) { pet.hop(260); fx.note(pet.geo.x, pet.geo.top); }
        else if (mood === 'sad' && Math.random() < 0.5) { pet.squish(1); }
      }
    }
  }

  function frame(ts) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (ts - lastFrame) / 1000));
    lastFrame = ts;
    if (!s || els.adopt.hidden === false) return;

    tickModel();

    timers.night -= dt;
    if (timers.night <= 0) {
      timers.night = 30;
      const n = isNight();
      if (n !== night) { night = n; buildBackground(); }
    }

    if (mode === 'game' || mode === 'gameover') {
      const r = game.update(dt);
      if (r === 'over') overDelay = 0.9;
      if (overDelay > 0) {
        overDelay -= dt;
        if (overDelay <= 0 && mode === 'game') endGame();
      }
      if (mode === 'game') {
        els.hudScore.textContent = game.score;
        if (els.hudLives.querySelectorAll('.lost').length !== 3 - game.lives) renderLives();
      }
      game.draw(ctx, s);
    } else {
      updateHome(dt);
      drawHome();
    }

    timers.save -= dt;
    if (timers.save <= 0) { timers.save = 5; save(); }
    timers.ui -= dt;
    if (timers.ui <= 0) { timers.ui = 0.5; updateUI(); }
  }

  /* ---------------- adopt screen ---------------- */

  const adoptPick = { species: 'mochi', color: 'pink' };
  const previewPet = new PM.PetView();
  let previewRAF = 0;
  let previewLast = 0;

  function buildAdopt() {
    const sp = $('pick-species');
    sp.innerHTML = '';
    for (const [k, label] of Object.entries(PM.SPECIES)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = label;
      b.setAttribute('aria-pressed', String(k === adoptPick.species));
      b.addEventListener('click', () => {
        adoptPick.species = k;
        Array.from(sp.children).forEach((c) => c.setAttribute('aria-pressed', String(c === b)));
        previewPet.hop(240);
        previewPet.setExpr('giggle', 0.6);
        A.play('tap');
      });
      sp.appendChild(b);
    }
    const sw = $('pick-color');
    sw.innerHTML = '';
    for (const [k, c] of Object.entries(PM.PET_COLORS)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch';
      b.style.setProperty('--sw', c.body);
      b.setAttribute('aria-label', c.label);
      b.title = c.label;
      b.setAttribute('aria-pressed', String(k === adoptPick.color));
      b.addEventListener('click', () => {
        adoptPick.color = k;
        Array.from(sw.children).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        previewPet.hop(200);
        previewPet.setExpr('yum', 0.6);
        A.play('tap');
      });
      sw.appendChild(b);
    }
  }

  function drawPreview(ts) {
    previewRAF = requestAnimationFrame(drawPreview);
    const c = els.preview;
    const r = c.getBoundingClientRect();
    const pw = Math.max(1, Math.round(r.width));
    const ph = Math.max(1, Math.round(r.height));
    const pd = Math.min(window.devicePixelRatio || 1, 2.5);
    if (c.width !== Math.round(pw * pd) || c.height !== Math.round(ph * pd)) {
      c.width = Math.round(pw * pd);
      c.height = Math.round(ph * pd);
    }
    const g = c.getContext('2d');
    g.setTransform(pd, 0, 0, pd, 0, 0);
    const dt = Math.min(0.05, Math.max(0, (ts - previewLast) / 1000));
    previewLast = ts;
    const size = Math.min(ph * 0.62, pw * 0.4);
    const ground = ph * 0.86;
    previewPet.x = pw / 2;
    previewPet.update(dt, { W: pw, size, stageScale: 1, canWander: false });
    g.fillStyle = '#BFE6DA';
    g.fillRect(0, 0, pw, ph);
    g.fillStyle = '#F2B36A';
    g.fillRect(0, ph * 0.72, pw, ph * 0.28);
    g.fillStyle = '#FFFDF8';
    g.fillRect(0, ph * 0.72 - 6, pw, 8);
    g.beginPath();
    g.ellipse(pw / 2, ground, size * 0.8, ph * 0.08, 0, 0, PM.art.TAU);
    g.fillStyle = '#FF8FBF';
    g.fill();
    PM.art.outline(g, 3);
    previewPet.draw(g, {
      species: adoptPick.species, color: adoptPick.color, hat: null, size, groundY: ground,
      clean: 100, sick: false, mood: 'happy',
    });
    if (Math.random() < dt * 0.4) previewPet.hop(200);
  }

  function showAdopt() {
    buildAdopt();
    $('pet-name-input').value = NAMES[Math.floor(Math.random() * 6)];
    els.adopt.hidden = false;
    cancelAnimationFrame(previewRAF);
    previewRAF = requestAnimationFrame(drawPreview);
  }

  function adopt() {
    A.unlock();
    const name = $('pet-name-input').value.replace(/\s+/g, ' ').trim().slice(0, 12) || 'Mochi';
    s = M.create({ name, species: adoptPick.species, color: adoptPick.color });
    s.gift = new Date().toDateString();
    s.settings.sound = $('set-sound').checked;
    s.settings.vibe = $('set-vibe').checked;
    save();
    cancelAnimationFrame(previewRAF);
    els.adopt.hidden = true;
    startSession();
    A.play('hatch');
    toast('Tap the egg to help it hatch!', 3000);
  }

  /* ---------------- boot ---------------- */

  function startSession() {
    mode = 'home';
    pet.x = null;
    pet.scale = null;
    pet.foam = [];
    fx.list = [];
    A.setSound(s.settings.sound);
    A.setVibe(s.settings.vibe);
    $('set-sound').checked = s.settings.sound;
    $('set-vibe').checked = s.settings.vibe;
    resize();
    dailyGift();
    updateUI();
  }

  function wire() {
    const c = els.canvas;
    c.addEventListener('pointerdown', onDown);
    c.addEventListener('pointermove', onMove);
    c.addEventListener('pointerup', onUp);
    c.addEventListener('pointercancel', onUp);
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });

    els.feed.addEventListener('click', onFeed);
    els.play.addEventListener('click', startGame);
    els.wash.addEventListener('click', onWash);
    els.sleep.addEventListener('click', onSleep);
    els.shop.addEventListener('click', () => { A.play('click'); if (s) openShop(); });
    $('btn-settings').addEventListener('click', () => { A.play('click'); if (s) openSheet(els.settingsSheet); });
    $('tray-close').addEventListener('click', () => { A.play('click'); closeTray(); });
    els.bannerBtn.addEventListener('click', () => exitWash(true));
    els.heal.addEventListener('click', onHeal);
    $('hud-quit').addEventListener('click', () => { if (mode === 'game') endGame(); });
    $('go-again').addEventListener('click', startGame);
    $('go-home').addEventListener('click', leaveGame);

    els.scrim.addEventListener('click', closeSheets);
    document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => { A.play('click'); closeSheets(); }));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeSheets(); if (!els.tray.hidden) closeTray(); } });
    document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
      A.play('click');
      shopTab = t.dataset.tab;
      renderShop();
    }));

    $('set-sound').addEventListener('change', (e) => {
      if (!s) return;
      s.settings.sound = e.target.checked;
      A.setSound(s.settings.sound);
      A.play('click');
      save();
    });
    $('set-vibe').addEventListener('change', (e) => {
      if (!s) return;
      s.settings.vibe = e.target.checked;
      A.setVibe(s.settings.vibe);
      A.buzz(20);
      save();
    });
    $('btn-reset').addEventListener('click', onReset);

    $('btn-random-name').addEventListener('click', () => {
      const input = $('pet-name-input');
      let n = input.value;
      while (n === input.value) n = NAMES[Math.floor(Math.random() * NAMES.length)];
      input.value = n;
      A.play('tap');
    });
    $('pet-name-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.target.blur(); } });
    $('btn-adopt').addEventListener('click', adopt);
    els.preview.addEventListener('pointerdown', () => {
      A.unlock();
      previewPet.hop(260);
      previewPet.setExpr('giggle', 0.7);
      A.play('giggle');
    });

    window.addEventListener('resize', () => { if (s) resize(); });
    if (window.ResizeObserver) new ResizeObserver(() => { if (s) resize(); }).observe(els.room);
    document.addEventListener('visibilitychange', () => {
      if (!s) return;
      if (document.hidden) save();
      else { lastFrame = performance.now(); tickModel(); dailyGift(); }
    });
    window.addEventListener('pagehide', save);

    // iOS only lets sound start from certain gestures, so try on each of them.
    ['touchend', 'click', 'keydown'].forEach((ev) => document.addEventListener(ev, () => A.unlock(), { passive: true }));

    PM.host.on('back', handleBack);
    PM.host.on('pause', save);
    PM.host.on('resume', () => {
      if (!s) return;
      lastFrame = performance.now();
      tickModel();
      dailyGift();
    });
  }

  function registerServiceWorker() {
    if (PM.host.native || !('serviceWorker' in navigator) || window.top !== window) return;
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is optional */ });
  }

  function boot() {
    for (const k of Object.keys(PM.FOODS)) icons.food[k] = PM.art.foodIcon(k, 56);
    for (const k of Object.keys(PM.HATS)) icons.hat[k] = PM.art.hatIcon(k, 60);
    wire();
    s = load();
    if (s) startSession();
    else showAdopt();
    requestAnimationFrame((ts) => { lastFrame = ts; frame(ts); });
    registerServiceWorker();
  }

  boot();
})(window.PM = window.PM || {});
