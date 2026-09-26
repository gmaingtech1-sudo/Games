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
    roomButtons: Array.from(document.querySelectorAll('.dock .act')),
    prev: $('room-prev'), next: $('room-next'), roomAction: $('room-action'), shop: $('btn-shop'),
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
  let mode = 'home';        // home | game | gameover
  let W = 1;
  let H = 1;
  let dpr = 1;
  const bgCache = {};       // room id -> { canvas, layout }
  let layout = { floorY: 0, groundY: 0, poopY: 0, zone: [0.3, 0.7] };
  let shownRoom = null;     // the room the screen is currently set up for
  let trans = null;         // slide between rooms: { snap, dir, t }
  let ball = null;          // the playroom ball
  let duckHop = 0;
  let duckV = 0;
  let ground = null;        // where the pet stands: the floor, the tub, the bed, or on top of the snack tray
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
    return { x: p.x * W, y: layout.poopY + (Math.abs(hsh) % 3) * 6, size };
  }

  function poopsHere() {
    return s.poops.filter((p) => p.room === s.room);
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
    resetBackgrounds();
    ground = null;
    if (ball) {
      ball.x = Math.min(ball.x, W - ball.r);
      ball.y = Math.min(ball.y, layout.groundY - ball.r + 4);
    }
    if (game.running || mode === 'gameover') game.resize(W, H);
  }

  // Each room's static picture is drawn once and reused every frame.
  function roomBg(id) {
    let c = bgCache[id];
    if (!c) {
      const canvas = document.createElement('canvas');
      canvas.width = els.canvas.width;
      canvas.height = els.canvas.height;
      const g = canvas.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      c = bgCache[id] = { canvas, layout: PM.rooms.draw(id, g, W, H, night) };
    }
    return c;
  }

  // Throw the pictures away after a resize, or when day turns to night.
  function resetBackgrounds() {
    Object.keys(bgCache).forEach((k) => delete bgCache[k]);
    if (s) layout = roomBg(s.room).layout;
  }

  /* ---------------- UI ---------------- */

  // True when Android's back button should close something instead of leaving.
  function overlayOpen() {
    if (!els.scrim.hidden || !els.tray.hidden) return true;
    return !!s && (mode !== 'home' || (s.room !== 'living' && !s.asleep));
  }

  function updateUI() {
    PM.host.setOverlay(overlayOpen());
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
    // the house map
    const inGame = mode !== 'home';
    const stuck = inGame || !s.hatched || s.asleep;
    const ids = PM.rooms.ids;
    const i = ids.indexOf(s.room);
    els.roomButtons.forEach((b) => {
      const id = b.dataset.room;
      const here = id === s.room;
      b.classList.toggle('on', here);
      b.classList.toggle('dim', stuck && !here);
      b.classList.toggle('has-poop', s.poops.some((p) => p.room === id));
      b.setAttribute('aria-label', `${PM.rooms.name(id)}${here ? ' (you are here)' : ''}`);
    });
    els.prev.hidden = stuck || i <= 0;
    els.next.hidden = stuck || i >= ids.length - 1;
    if (i > 0) els.prev.setAttribute('aria-label', `Go to the ${PM.rooms.name(ids[i - 1]).toLowerCase()}`);
    if (i < ids.length - 1) els.next.setAttribute('aria-label', `Go to the ${PM.rooms.name(ids[i + 1]).toLowerCase()}`);

    // each room's own button
    let action = null;
    if (!inGame && s.hatched) {
      if (s.room === 'kitchen' && els.tray.hidden && !s.asleep) action = 'Open the fridge';
      else if (s.room === 'bedroom') action = s.asleep ? 'Wake up' : 'Lights off';
      else if (s.room === 'playroom') action = 'Play Star Catch';
    }
    els.roomAction.hidden = !action;
    if (action && els.roomAction.textContent !== action) els.roomAction.textContent = action;
    els.roomAction.classList.toggle('warm', s.asleep);

    const bathing = !inGame && s.hatched && s.room === 'bathroom';
    els.banner.hidden = !bathing;
    els.room.classList.toggle('wash', bathing);
    const showHeal = s.hatched && s.sick && !inGame;
    els.heal.hidden = !showHeal;
    els.room.classList.toggle('has-heal', showHeal);
    els.room.classList.toggle('has-banner', bathing);
    els.room.classList.toggle('playing', inGame);
    els.dock.style.pointerEvents = inGame ? 'none' : '';
    els.dock.style.opacity = inGame ? '0.45' : '';
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

  /* ---------------- bathroom ---------------- */

  // The shower rinses the foam off; a proper scrub first earns XP and sparkles.
  function rinse() {
    const L = layout;
    A.play('splash');
    fx.drops(L.tub.cx - L.tub.rx * 0.55, L.shower.x + 24, L.shower.y + 6, 50);
    pet.setExpr('surprise', 0.6);
    const scrubbed = washGain > 30;
    washGain = 0;
    setTimeout(() => {
      if (!s) return;
      pet.rinse();
      if (!scrubbed) return;
      fx.sparkles(pet.geo.x, pet.geo.cy, 14, pet.geo.w);
      A.play('sparkle');
      pet.setExpr('yum', 1.2);
      pet.hop(220);
    }, 450);
    if (scrubbed) {
      gainXP(6);
      save();
    } else if (!pet.foam.length) {
      toast(`Scrub ${s.name} with your finger first, then rinse.`);
    }
  }

  // Leaving the bathroom mid-wash rinses quietly.
  function finishBath() {
    if (washGain > 30) gainXP(6);
    washGain = 0;
    pet.rinse();
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
      toast(`Zzz... tap the lamp or Wake up to wake ${s.name}.`);
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
    setTimeout(() => {
      if (s && mode === 'home') hint('house', 'Tap the rooms at the bottom, or swipe, to explore the house.', 3600);
    }, 7000);
    save();
    updateUI();
  }

  function handleTap(p) {
    if (!s.hatched) {
      if (pet.hit(p.x, p.y, 30)) tapEgg();
      else toast('Tap the egg to help it hatch!');
      return;
    }
    for (const poop of poopsHere()) {
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
    const prop = PM.rooms.hitProp(s.room, layout, p.x, p.y);
    if (prop) {
      useProp(prop);
      return;
    }
    // Tap the floor and your pet hops over to that spot.
    if (!s.asleep && !s.sick && s.room !== 'bathroom' && p.y > layout.floorY) {
      pet.targetX = Math.max(W * 0.12, Math.min(W * 0.88, p.x));
      pet.wander = 5;
    }
  }

  function useProp(prop) {
    switch (prop) {
      case 'fridge':
        A.play('click');
        if (els.tray.hidden && !s.asleep) openTray();
        break;
      case 'lamp':
        onSleep();
        break;
      case 'arcade':
        startGame();
        break;
      case 'shower':
        rinse();
        break;
      case 'duck':
        duckV = 300;
        A.play('squeak');
        A.buzz(8);
        pet.setExpr('giggle', 0.6);
        s.stats.fun = M.clamp(s.stats.fun + 0.5);
        break;
      default:
        break;
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
    if (mode === 'gameover' || pointer || trans) return;
    try { els.canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    const onBall = !!ball && s.room === 'playroom' && Math.hypot(p.x - ball.x, p.y - ball.y) < ball.r + 18;
    pointer = {
      id: e.pointerId, x: p.x, y: p.y, sx: p.x, sy: p.y, t0: performance.now(), moved: 0,
      onBall, onPet: !onBall && s.hatched && pet.hit(p.x, p.y, 10),
    };
    if (onBall) {
      ball.held = { vx: 0, vy: 0, t: performance.now() };
      ball.vx = 0;
      ball.vy = 0;
      return;
    }
    pet.lookAt = p;
    lookClear = 0;
    if (s.room === 'bathroom' && s.hatched && pet.hit(p.x, p.y)) scrub(p, 0);
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
    if (pointer.onBall && ball && ball.held) {
      // carry the ball, remembering how fast the finger moves for the throw
      const now = performance.now();
      const secs = Math.max(0.008, (now - ball.held.t) / 1000);
      ball.held.vx = ball.held.vx * 0.4 + ((p.x - pointer.x) / secs) * 0.6;
      ball.held.vy = ball.held.vy * 0.4 + ((p.y - pointer.y) / secs) * 0.6;
      ball.held.t = now;
      ball.x = Math.max(ball.r, Math.min(W - ball.r, p.x));
      ball.y = Math.max(ball.r, Math.min(layout.groundY - ball.r + 4, p.y));
    }
    pointer.moved += d;
    pointer.x = p.x;
    pointer.y = p.y;
    if (pointer.onBall) return;
    pet.lookAt = p;
    if (s.room === 'bathroom') {
      if (s.hatched && pet.hit(p.x, p.y, 6)) {
        scrub(p, d);
        pointer.acted = true;
      }
    } else if (s.hatched && !s.asleep && pointer.onPet && pet.hit(p.x, p.y, 16)) {
      stroke(p, d);
      pointer.acted = true;
    }
  }

  function onUp(e) {
    if (!s) return;
    if (mode === 'game') { pointer = null; return; }
    if (!pointer || e.pointerId !== pointer.id) return;
    const p = toRoom(e);
    const P = pointer;
    pointer = null;
    lookClear = 1.2;
    const elapsed = performance.now() - P.t0;
    const quick = P.moved < 12 && elapsed < 400;
    if (P.onBall) {
      if (ball) throwBall(e.type === 'pointerup' && quick);
      return;
    }
    if (e.type !== 'pointerup') return;
    // A quick sideways swipe that didn't pet or scrub moves to the next room.
    const dx = p.x - P.sx;
    const dy = p.y - P.sy;
    if (!P.onPet && !P.acted && Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5 && elapsed < 700) {
      stepRoom(dx < 0 ? 1 : -1);
      return;
    }
    if (quick) handleTap(p);
  }

  /* ---------------- the playroom ball ---------------- */

  function ensureBall() {
    if (ball) return;
    const r = Math.max(14, Math.min(24, W * 0.05));
    ball = { x: W * 0.62, y: layout.groundY - r + 4, vx: 0, vy: 0, r, rot: 0, held: null, cd: 0 };
  }

  function throwBall(tapped) {
    const h = ball.held || { vx: 0, vy: 0 };
    ball.held = null;
    const cap = 1700;
    if (tapped) {
      ball.vx = (Math.random() - 0.5) * 360;
      ball.vy = -560;
    } else {
      ball.vx = Math.max(-cap, Math.min(cap, h.vx));
      ball.vy = Math.max(-cap, Math.min(cap, h.vy));
    }
    A.play('boing');
  }

  function updateBall(dt, busy, mood) {
    const b = ball;
    const floor = layout.groundY - b.r + 4;
    b.cd -= dt;
    if (!b.held) {
      b.vy += 1500 * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.y >= floor) {
        b.y = floor;
        if (b.vy > 140) {
          if (b.vy > 320) A.play('thump');
          b.vy = -b.vy * 0.6;
        } else {
          b.vy = 0;
        }
        b.vx *= Math.exp(-2.2 * dt);
        if (Math.abs(b.vx) < 4) b.vx = 0;
      }
      if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx) * 0.7; }
      if (b.x > W - b.r) { b.x = W - b.r; b.vx = -Math.abs(b.vx) * 0.7; }
      if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy) * 0.5; }
      b.rot += (b.vx * dt) / b.r;
    }
    if (!s.hatched || s.asleep) return;

    // bonk: the ball bounces off the pet
    const g = pet.geo;
    const ax = g.w * 0.5 + b.r * 0.8;
    const ay = g.h * 0.5 + b.r * 0.8;
    const dx = (b.x - g.x) / ax;
    const dy = (b.y - g.cy) / ay;
    const d = Math.hypot(dx, dy);
    if (!b.held && d < 1) {
      const nx = dx / (d || 1);
      const ny = dy / (d || 1);
      b.x = Math.max(b.r, Math.min(W - b.r, g.x + nx * ax));
      b.y = Math.min(floor, g.cy + ny * ay);
      b.vx = nx * 320 + pet.vx * 0.5 + (Math.random() - 0.5) * 80;
      b.vy = Math.min(-b.vy * 0.3, -420 - Math.random() * 180);
      if (b.cd <= 0) {
        b.cd = 0.4;
        A.play('boing');
        A.buzz(8);
        pet.setExpr('giggle', 0.5);
        pet.squish(1.2);
        s.stats.fun = M.clamp(s.stats.fun + 1.5);
        gainXP(0.3);
        fx.sparkles(b.x, b.y, 5, b.r);
      }
    }

    // watch the ball, and chase it once it settles
    if (!pointer || pointer.onBall) pet.lookAt = { x: b.x, y: b.y };
    const reach = petSize() * 0.3;
    const chase = !busy && !b.held && !s.sick && mood !== 'tired' && pet.jump === 0 &&
      b.y >= floor - 2 && Math.abs(b.vx) < 90 && b.x > reach && b.x < W - reach;
    if (chase) {
      const gap = b.x - pet.x;
      if (Math.abs(gap) > g.w * 0.45) {
        pet.targetX = b.x - Math.sign(gap) * g.w * 0.3;
        pet.wander = 2.5;
      } else if (b.cd <= 0 && Math.random() < dt * 2.5) {
        pet.vx = Math.sign(gap || 1) * 60;
        pet.hop(300);
      }
    }
  }

  /* ---------------- buttons ---------------- */

  function needsPet() {
    if (!s.hatched) { toast('Tap the egg to hatch it first.'); return true; }
    return false;
  }

  function onSleep() {
    if (needsPet() || s.room !== 'bedroom') return;
    A.play('lights');
    if (s.asleep) {
      s.asleep = false;
      pet.hop(280); // hops out of bed
      if (s.stats.energy < 50) {
        pet.setExpr('grumpy', 2.2);
        toast(`${s.name} is still sleepy...`);
      } else {
        pet.setExpr('happy', 1);
        pet.hop(240);
        toast(`Good morning, ${s.name}!`);
      }
    } else {
      s.asleep = true;
      A.play('yawn');
      pet.setExpr('yawn', 1.3);
      pet.targetX = null;
      pet.hop(300); // hops into bed
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

  /* ---------------- rooms ---------------- */

  function goRoom(id) {
    if (!s || id === s.room || mode !== 'home' || trans) return;
    if (!s.hatched) {
      toast('Hatch the egg first, then explore the house!');
      A.play('no');
      return;
    }
    if (s.asleep) {
      toast(`Shh... ${s.name} is sleeping. Tap Wake up first.`);
      A.play('no');
      return;
    }
    // Keep a picture of the room we're leaving so the new one can slide in.
    const snap = document.createElement('canvas');
    snap.width = els.canvas.width;
    snap.height = els.canvas.height;
    snap.getContext('2d').drawImage(els.canvas, 0, 0);
    const ids = PM.rooms.ids;
    trans = { snap, dir: ids.indexOf(id) > ids.indexOf(s.room) ? 1 : -1, t: 0 };
    s.room = id;
    A.play('swoosh');
    syncRoom();
    save();
  }

  function stepRoom(dir) {
    const ids = PM.rooms.ids;
    const next = ids[ids.indexOf(s.room) + dir];
    if (next) goRoom(next);
  }

  // Set the screen up for s.room: after moving, loading a save, or when the
  // pet dozes off by itself and goes to bed.
  function syncRoom() {
    if (shownRoom === s.room) return;
    const from = shownRoom;
    shownRoom = s.room;
    if (from === 'kitchen') closeTray();
    if (from === 'bathroom') finishBath();
    fly = null;
    fx.list = [];
    layout = roomBg(s.room).layout;
    pet.x = W * (layout.zone[0] + layout.zone[1]) / 2;
    pet.targetX = null;
    pet.jump = 0;
    pet.jumpV = 0;
    pet.vx = 0;
    pet.lookAt = null;
    ground = null;
    enterRoom(s.room, from !== null);
    updateUI();
  }

  function enterRoom(id, arrived) {
    if (!s.hatched) return;
    if (id === 'kitchen' && !s.asleep) openTray();
    if (id === 'bathroom') {
      washGain = 0;
      els.bannerText.textContent = `Scrub ${s.name} with your finger`;
      hint('wash', `Rub your finger over ${s.name} to scrub, then tap Rinse.`);
    }
    if (id === 'bedroom' && !s.asleep) hint('bed', `Tap the lamp to put ${s.name} to bed.`);
    if (id === 'playroom') {
      ensureBall();
      hint('ball', `Flick the ball and ${s.name} will chase it. The arcade plays Star Catch.`, 3800);
    }
    if (arrived && (id === 'living' || id === 'playroom' || (id === 'bedroom' && !s.asleep))) pet.hop(240);
  }

  function onRoomAction() {
    if (!s) return;
    if (s.room === 'kitchen') {
      A.play('click');
      openTray();
    } else if (s.room === 'bedroom') {
      onSleep();
    } else if (s.room === 'playroom') {
      startGame();
    }
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

  // Android back button: close whatever is on top, then head back to the
  // living room, and only then leave the app.
  function handleBack() {
    if (!els.scrim.hidden) closeSheets();
    else if (mode === 'game') endGame();
    else if (mode === 'gameover') leaveGame();
    else if (!els.tray.hidden) closeTray();
    else if (s && s.room !== 'living' && !s.asleep) goRoom('living');
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
    shownRoom = null;
    trans = null;
    ball = null;
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
      syncRoom();
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
    if (ev.includes('fell-asleep')) {
      closeTray();
      toast(`${s.name} got so sleepy it went to bed.`);
    }
    syncRoom();
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

  function currentGround() {
    return ground === null ? layout.groundY : ground;
  }

  function drawScene() {
    const L = layout;
    const g0 = currentGround();
    ctx.drawImage(roomBg(s.room).canvas, 0, 0, W, H);
    PM.rooms.drawLive(s.room, ctx, L, pet.t);

    // Poop behind the pet's feet is drawn first, poop in front of it last.
    const poops = poopsHere().map(poopPos);
    poops.filter((pp) => pp.y < g0).forEach((pp) => PM.art.drawPoop(ctx, pp.x, pp.y, pp.size));
    const showBall = ball && s.room === 'playroom';
    if (showBall) {
      const lift = Math.max(0, L.groundY - (ball.y + ball.r));
      const k = 1 / (1 + lift / 80);
      ctx.beginPath();
      ctx.ellipse(ball.x, L.groundY + 3, ball.r * 0.9 * k, ball.r * 0.28 * k, 0, 0, PM.art.TAU);
      ctx.fillStyle = 'rgba(34,36,61,0.2)';
      ctx.fill();
    }

    pet.draw(ctx, {
      species: s.species, color: s.color, hat: s.hat, size: petSize(), groundY: g0,
      clean: s.stats.clean, sick: s.sick, mood: M.mood(s), taps: s.eggTaps,
    });
    if (eating) {
      const g = pet.geo;
      const k = 1 - eating.bites * 0.3;
      if (k > 0.05) PM.art.drawFood(ctx, eating.type, g.x, g.mouthY + g.h * 0.08, petSize() * 0.3 * k);
    }
    PM.rooms.drawFront(s.room, ctx, L, {
      asleep: s.asleep, petX: pet.geo.x, petGround: g0, petW: pet.geo.w, petH: pet.geo.h, t: pet.t, duckHop,
    });
    poops.filter((pp) => pp.y >= g0).forEach((pp) => PM.art.drawPoop(ctx, pp.x, pp.y, pp.size));
    if (showBall) PM.rooms.drawBall(ctx, ball.x, ball.y, ball.r, ball.rot);

    const busy = eating || fly || drag || s.room === 'bathroom' || (pointer && pointer.onPet);
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
    if (s.room === 'bathroom' && s.hatched && pointer && !pointer.onBall) drawSponge(pointer.x, pointer.y);
    if (s.asleep) {
      ctx.fillStyle = 'rgba(14, 16, 44, 0.62)';
      ctx.fillRect(0, 0, W, H);
      PM.rooms.drawNight(s.room, ctx, L);
    }
    fx.draw(ctx);
  }

  // Rooms slide sideways when you move between them.
  function drawHome(dt) {
    if (!trans) {
      drawScene();
      return;
    }
    trans.t = Math.min(1, trans.t + dt / 0.34);
    const t = trans.t;
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    ctx.save();
    ctx.translate(W * (1 - e) * trans.dir, 0);
    drawScene();
    ctx.restore();
    ctx.drawImage(trans.snap, -W * e * trans.dir, 0, W, H);
    if (t >= 1) trans = null;
  }

  // Where the pet should stand in this room right now.
  function groundTarget() {
    if (s.room === 'bedroom' && s.asleep) return layout.bed.y;
    if (s.room === 'bathroom' && s.hatched) {
      const tub = layout.tub;
      const h = petSize() * (pet.scale || M.stage(s).scale) * 0.86;
      return Math.min(tub.bottom - 8, tub.rimY + tub.ry + h * 0.2);
    }
    let g = layout.groundY;
    if (!els.tray.hidden) g = Math.min(g, els.tray.offsetTop - 4);
    return g;
  }

  function updateHome(dt) {
    const target = groundTarget();
    ground = ground === null ? target : ground + (target - ground) * Math.min(1, dt * 9);
    const mood = M.mood(s);
    const busy = !!(eating || drag || fly || (pointer && pointer.onPet));
    const bathing = s.room === 'bathroom' && s.hatched;
    const inBed = s.room === 'bedroom' && s.asleep;
    // In the tub and in bed the pet stays put.
    if (bathing) pet.x += (layout.tub.cx - pet.x) * Math.min(1, dt * 6);
    if (inBed) pet.x += (layout.bed.x - pet.x) * Math.min(1, dt * 6);
    pet.update(dt, {
      W, size: petSize(), stageScale: s.hatched ? M.stage(s).scale : 1, zone: layout.zone,
      canWander: s.hatched && !s.asleep && !s.sick && mood !== 'tired' && !busy && !bathing,
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
    if (ball && s.room === 'playroom') updateBall(dt, busy, mood);
    duckV -= 1500 * dt;
    duckHop = Math.max(0, duckHop + duckV * dt);
    if (duckHop === 0 && duckV < 0) duckV = 0;
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
      const here = poopsHere();
      if (here.length && Math.random() < 0.6) {
        const pp = poopPos(here[Math.floor(Math.random() * here.length)]);
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
      if (n !== night) { night = n; resetBackgrounds(); }
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
      drawHome(dt);
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
    shownRoom = null;
    trans = null;
    ball = null;
    resize();
    syncRoom();
    dailyGift();
    updateUI();
    // Pets from before the house get told about it once.
    if (s.hatched && !s.hints.house) {
      setTimeout(() => {
        if (s && mode === 'home') hint('house', `${s.name} has a whole house now! Tap the rooms below or swipe to explore.`, 4200);
      }, 3200);
    }
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

    els.roomButtons.forEach((b) => b.addEventListener('click', () => {
      A.play('click');
      if (!s) return;
      if (b.dataset.room !== s.room) goRoom(b.dataset.room);
      else if (s.room === 'kitchen' && els.tray.hidden && s.hatched && !s.asleep) openTray();
    }));
    els.prev.addEventListener('click', () => { A.play('click'); stepRoom(-1); });
    els.next.addEventListener('click', () => { A.play('click'); stepRoom(1); });
    els.roomAction.addEventListener('click', onRoomAction);
    els.shop.addEventListener('click', () => { A.play('click'); if (s) openShop(); });
    $('btn-settings').addEventListener('click', () => { A.play('click'); if (s) openSheet(els.settingsSheet); });
    $('tray-close').addEventListener('click', () => { A.play('click'); closeTray(); });
    els.bannerBtn.addEventListener('click', rinse);
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
