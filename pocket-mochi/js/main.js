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
    prev: $('room-prev'), next: $('room-next'), roomAction: $('room-action'), shop: $('btn-coins'),
    goalsBtn: $('btn-goals'), goalsBadge: $('goals-badge'), goalsSheet: $('sheet-goals'),
    goalsList: $('goals-list'), goalsBonus: $('goals-bonus'),
    level: $('pet-level'), lvRing: $('lv-ring'), xpArc: $('xp-arc'),
    friendsBtn: $('btn-friends'), friendsDot: $('friends-dot'), friendsSheet: $('sheet-friends'),
    playbar: $('playbar'), invite: $('duel-invite'),
    hudVs: $('hud-vs'), hudVsLabel: $('hud-vs-label'), hudVsScore: $('hud-vs-score'),
    login: $('login'), loginDays: $('login-days'), loginSub: $('login-sub'), loginCollect: $('login-collect'),
    stickersBadge: $('stickers-badge'),
    arcade: $('arcade'), hudLabel: $('hud-label'), hudTime: $('hud-time'),
    scrim: $('scrim'), shopSheet: $('sheet-shop'), settingsSheet: $('sheet-settings'),
    shopGrid: $('shop-grid'), shopCoins: $('shop-coins'),
    adopt: $('adopt'), preview: $('preview'), memorial: $('memorial'),
  };
  const meters = Array.from(document.querySelectorAll('.meter')).map((el) => ({
    el, key: el.dataset.stat, fill: el.querySelector('.fill'), label: el.textContent.trim(),
  }));

  const ctx = els.canvas.getContext('2d');
  const pet = new PM.PetView();
  const fx = new PM.Particles();
  const games = { stars: new PM.StarCatch(), bubbles: new PM.BubblePop(), match: new PM.MemoryMatch(), walk: new PM.WalkGame() };
  // stars, bubbles, match and walk are solo; duo is two players on this phone; online is a duel with a friend
  const GAME_OF = { stars: 'stars', bubbles: 'bubbles', match: 'match', walk: 'walk', duo: 'bubbles', online: 'bubbles' };
  let gameKind = 'stars';   // which arcade game is being played
  let game = games[GAME_OF[gameKind]];
  const GAME_INFO = {
    stars: { label: 'Stars', tip: 'Slide your finger to move.<br>Catch stars and coins, dodge storm clouds!' },
    bubbles: { label: 'Score', tip: 'Tap bubbles to pop them. Pop fast for combos!<br>Rainbows are worth more; storm bubbles cost time.' },
    match: { label: 'Score', tip: 'Flip two cards to find a matching pair.<br>Quick matches build a bigger combo; a miss resets it.' },
    walk: { label: 'Found', tip: 'Slide to move down the path.<br>Scoop up coins and treats — say hi if a friend passes by!' },
    duo: { label: 'P1', tip: 'Player 1 taps the left half, player 2 the right.<br>Same bubbles on both sides. Storm bubbles cost 5 points!' },
    online: { label: 'You', tip: 'Duel! Pop more bubbles than your friend in 30 seconds.' },
  };
  const NEED_ROOM = { hunger: 'kitchen', thirst: 'kitchen', clean: 'bathroom', energy: 'bedroom', fun: 'playroom' };
  // What a reminder says while you're away, keyed by M.timeToNeed()'s `need`.
  const NEED_NOTICE = {
    hunger: (n) => ({ title: `${n} is hungry`, body: `${n} is hungry! Time for a snack.` }),
    thirst: (n) => ({ title: `${n} is thirsty`, body: `${n} is thirsty! Time for a drink.` }),
    fun: (n) => ({ title: `${n} is bored`, body: `${n} is bored. Come play for a bit!` }),
    clean: (n) => ({ title: `${n} needs a bath`, body: `${n} could use a bubble bath.` }),
    energy: (n) => ({ title: `${n} is sleepy`, body: `${n} is getting sleepy. A nap would help.` }),
    wake: (n) => ({ title: `${n} is awake`, body: `${n} woke up rested and ready to play!` }),
    sick: (n) => ({ title: `${n} feels sick`, body: `${n} feels sick and needs medicine.` }),
    critical: (n) => ({ title: `${n} needs you now`, body: `${n} is in real trouble — please come back and help!` }),
  };

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
  const icons = { food: {}, drink: {}, hat: {}, outfit: {}, wall: {}, sticker: {}, stickerLocked: '' };
  const toastQueue = [];
  let goalsTab = 'goals';
  let settingsDirty = false; // the birthday changed: check for a party once settings close
  let friend = null;        // the pet visiting on a playdate
  let duel = null;          // an online Bubble Pop duel in progress
  let lastEmote = 0;
  let lastPoke = 0;
  let pokeToast = 0;
  let giftsIn = 0;
  let deathKeep = null;      // coins/collection carried over into the next pet, after one dies

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

  // Messages queue up, since a level-up and a finished goal often land together.
  // News jumps ahead of waiting tips (from hint). Whatever is on screen gets
  // shortened once something is waiting, so news never lags far behind.
  const SHORT = { tip: 1400, news: 1900 };

  function toast(msg, ms, hintKey) {
    if (toastQueue.some((t) => t.msg === msg)) return;
    const item = { msg, ms: ms || 2400, hint: hintKey || null };
    if (!item.hint) {
      const firstTip = toastQueue.findIndex((t, i) => i > 0 && t.hint);
      toastQueue.splice(firstTip > 0 ? firstTip : toastQueue.length, 0, item);
    } else {
      toastQueue.push(item);
    }
    const cur = toastQueue[0];
    if (cur !== item && !cur.cut && (cur.hint || !item.hint)) {
      cur.cut = true;
      clearTimeout(toastTimer);
      const keep = cur.hint ? SHORT.tip : SHORT.news;
      toastTimer = setTimeout(nextToast, Math.max(250, Math.min(cur.ms, keep) - (performance.now() - cur.shownAt)));
    }
    // Keep the queue short: drop the oldest waiting tip, or else the oldest waiting message.
    while (toastQueue.length > 4) {
      const tip = toastQueue.findIndex((t, i) => i > 0 && t.hint);
      toastQueue.splice(tip > 0 ? tip : 1, 1);
    }
    if (toastQueue.length === 1) showToast();
  }

  function nextToast() {
    toastQueue.shift();
    showToast();
  }

  function showToast() {
    const t = toastQueue[0];
    clearTimeout(toastTimer);
    if (!t) {
      els.toast.hidden = true;
      return;
    }
    t.shownAt = performance.now();
    if (t.hint && s) s.hints[t.hint] = 1; // a tip only counts as seen once shown
    if (toastQueue.length > 1 && !t.cut) {
      t.cut = true;
      t.ms = Math.min(t.ms, t.hint ? SHORT.tip : SHORT.news);
    }
    els.toast.textContent = t.msg;
    els.toast.hidden = false;
    els.toast.style.animation = 'none';
    void els.toast.offsetWidth;
    els.toast.style.animation = '';
    toastTimer = setTimeout(nextToast, t.ms);
  }

  function hint(key, msg, ms) {
    if (!s || s.hints[key]) return false;
    toast(msg, ms || 3200, key);
    return true;
  }

  const own = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
  const pick = (list) => list[Math.floor(Math.random() * list.length)];

  // Things the pet says in its speech bubble.
  const LINES = {
    tap: ['Hee hee!', 'That tickles!', 'Boop!', 'Hi!'],
    pet: ['I love you!', 'So nice...', 'More pets please!'],
    yum: ['Yummy!', 'Delicious!', 'Mmm!'],
    clean: ['Squeaky clean!', 'So fresh!'],
    bop: ['Wheee!', 'Again!', 'Got it!'],
    hunger: ['I\u2019m hungry...', 'Snack time?'],
    thirst: ['I\u2019m thirsty...', 'Can I have a drink?'],
    fun: ['Let\u2019s play!', 'I\u2019m bored...'],
    energy: ['So sleepy...', 'Nap time?'],
    clean_need: ['I feel icky...', 'Bath time?'],
    sick: ['I don\u2019t feel well...'],
    poop: ['Eww, stinky!'],
  };
  const NEED_LINE = { hunger: 'hunger', thirst: 'thirst', fun: 'fun', energy: 'energy', clean: 'clean_need', sick: 'sick', poop: 'poop' };

  function speak(key, dur) {
    if (!s || !s.hatched || s.asleep || !LINES[key]) return;
    pet.say(pick(LINES[key]), dur || 1.8);
  }

  function ordinal(n) {
    const v = n % 100;
    const suf = ['th', 'st', 'nd', 'rd'];
    return n + (suf[(v - 20) % 10] || suf[v] || suf[0]);
  }

  function bumpCoins() {
    els.coinsBox.classList.remove('bump');
    void els.coinsBox.offsetWidth;
    els.coinsBox.classList.add('bump');
  }

  function gainXP(n) {
    const up = M.addXP(s, n);
    if (!up) return;
    A.play('levelup');
    A.buzz([30, 50, 30]);
    fx.confetti(pet.geo.x, pet.geo.top, 50);
    pet.hop(300);
    let msg = up.grew
      ? `${s.name} grew into a ${up.grew.label}! Level ${up.level}, +${up.coins} coins.`
      : `Level ${up.level}! +${up.coins} coins.`;
    if (up.unlocks.length) msg += ` New in the shop: ${up.unlocks.join(', ')}.`;
    toast(msg, 4200);
    if (!s.asleep) pet.say(up.grew ? 'Look how big I am!' : `Level ${up.level}!`, 2.2);
    bumpCoins();
    sendHello();
    updateUI();
  }

  // Awards stickers that were just earned. Several at once (an older save) get one message.
  function checkStickers() {
    const got = M.checkStickers(s);
    if (!got.length) return;
    s.stickerBadge = true;
    A.play('sparkle');
    bumpCoins();
    if (got.length === 1) toast(`New sticker: ${got[0].name}! +${M.STICKER_COINS} coins`, 3000);
    else toast(`${got.length} new stickers! +${got.length * M.STICKER_COINS} coins. See them in Goals.`, 3600);
    save();
    updateUI();
  }

  // Counts progress toward today's goals, and cheers when one is finished.
  function track(id, amount) {
    const done = M.track(s, id, amount);
    if (!done.length) return;
    A.play('sparkle');
    toast(`Goal done: ${M.goalText(done[0], s.name)}. Claim it in Goals!`, 3200);
    updateUI();
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
      c = bgCache[id] = { canvas, layout: PM.rooms.draw(id, g, W, H, night, M.wallOf(s, id)) };
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
    if (!els.scrim.hidden || !els.tray.hidden || !els.arcade.hidden || !els.invite.hidden) return true;
    return !!s && (mode !== 'home' || (s.room !== 'living' && !s.asleep));
  }

  function updateUI() {
    PM.host.setOverlay(overlayOpen());
    if (!s) return;
    els.name.textContent = s.name;
    els.stage.textContent = s.hatched ? `${M.stage(s).label} · Day ${M.ageDays(s)}` : 'Egg · ready to hatch';
    els.coins.textContent = s.coins;
    els.shop.setAttribute('aria-label', `Shop. You have ${s.coins} coins.`);
    const li = M.levelInfo(s);
    els.level.textContent = li.level;
    els.xpArc.setAttribute('stroke-dasharray', `${Math.round(li.frac * 100)} 100`);
    els.xpArc.style.opacity = li.frac >= 0.01 ? '' : '0'; // no stray dot at 0 XP
    els.lvRing.setAttribute('aria-valuenow', String(Math.round(li.frac * 100)));
    els.lvRing.setAttribute('aria-label', `Level ${li.level}. ${li.toNext} XP to the next level.`);
    els.goalsBadge.hidden = !(M.goalsReady(s) || s.stickerBadge || M.weeklyReady(s));
    els.friendsDot.hidden = !friend;
    els.friendsBtn.setAttribute('aria-label', friend ? `Playdate with ${friend.name}` : 'Play with friends');
    for (const m of meters) {
      const v = Math.round(s.stats[m.key]);
      m.fill.setAttribute('stroke-dasharray', `${v} 100`);
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
      b.classList.toggle('party', id === 'living' && partyWaiting());
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
      else if (s.room === 'playroom') action = 'Arcade';
      else if (s.room === 'garden') action = 'Take a walk';
    }
    if (!els.arcade.hidden) action = null;
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
    const playdate = !!friend && !inGame && s.hatched;
    els.playbar.hidden = !playdate;
    els.room.classList.toggle('has-friend', playdate);
    els.dock.style.pointerEvents = inGame ? 'none' : '';
    els.dock.style.opacity = inGame ? '0.45' : '';
  }

  /* ---------------- snack tray + feeding ---------------- */

  // A snack or a drink; both live in the same tray and the same inventory.
  const itemOf = (type) => PM.FOODS[type] || PM.DRINKS[type];
  const isDrink = (type) => !!PM.DRINKS[type];
  const trayIcon = (type) => (isDrink(type) ? icons.drink[type] : icons.food[type]);
  const drawItem = (type, x, y, size, rot) => (isDrink(type) ? PM.art.drawDrink : PM.art.drawFood)(ctx, type, x, y, size, rot);

  function renderTray() {
    els.trayItems.innerHTML = '';
    const types = Object.keys(PM.FOODS).concat(Object.keys(PM.DRINKS)).filter((k) => s.inv[k] > 0);
    if (!types.length) {
      const empty = document.createElement('div');
      empty.className = 'tray-empty';
      empty.textContent = 'No snacks or drinks left.';
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
      el.setAttribute('aria-label', `${itemOf(type).name}, ${s.inv[type]} left. Tap to ${isDrink(type) ? 'give' : 'feed'}.`);
      el.innerHTML = `<img alt="" src="${trayIcon(type)}"><span>${itemOf(type).name}</span><span class="count">${s.inv[type]}</span>`;
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
    const drink = isDrink(type);
    const r = drink ? M.drink(s, type) : M.feed(s, type);
    if (r === 'full') {
      pet.setExpr('no', 1);
      pet.shakeHead(0.6);
      A.play('no');
      pet.say(drink ? 'I\u2019m not thirsty!' : 'I\u2019m full!', 1.6);
      toast(`${s.name} is ${drink ? 'not thirsty' : 'full'}!`);
      return;
    }
    if (r !== 'ok') return;
    eating = { type, drink, t: 0, bites: 0 };
    pet.setExpr('eat', 1.4);
    renderTray();
    updateUI();
  }

  const CRUMB_COLOR = {
    apple: '#FF5A5F', onigiri: '#FFFFFF', fish: '#7CC0F5', dango: '#FF9FC4', cupcake: '#FFB3D3',
    pizza: '#FFC53D', icecream: '#FFB3CF', cake: '#FFE6B8',
    water: '#A3D8FF', juice: '#FFA94D', soda: '#F0433A', milkshake: '#FFB3CF',
  };

  function updateEating(dt) {
    if (!eating) return;
    eating.t += dt;
    const biteAt = eating.drink ? [0.25, 0.75] : [0.2, 0.6, 1.0];
    if (eating.bites < biteAt.length && eating.t >= biteAt[eating.bites]) {
      eating.bites += 1;
      A.play(eating.drink ? 'bubble' : 'chomp');
      A.buzz(12);
      pet.squish(1.4);
      fx.crumbs(pet.geo.x, pet.geo.mouthY, 5, CRUMB_COLOR[eating.type]);
    }
    if (eating.t >= 1.4) {
      const item = itemOf(eating.type);
      const type = eating.type;
      const drink = eating.drink;
      eating = null;
      if (drink) { s.counts.drank += 1; } else { s.counts.fed += 1; }
      if (type === 'cake') pet.say('Best cake ever!', 2);
      else if (Math.random() < 0.45) speak('yum');
      A.play('yum');
      pet.setExpr('yum', 1.1);
      pet.hop(200);
      fx.hearts(pet.geo.x, pet.geo.top, 2);
      gainXP(item.xp);
      track(drink ? 'drink' : 'feed');
      save();
      updateUI();
      if (drink ? s.stats.thirst >= 96 : s.stats.hunger >= 96) toast(`${s.name} is nice and ${drink ? 'quenched' : 'full'}.`);
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
      s.counts.baths += 1;
      setTimeout(() => speak('clean'), 500);
      gainXP(6);
      track('bath');
      save();
    } else if (!pet.foam.length) {
      toast(`Scrub ${s.name} with your finger first, then rinse.`);
    }
  }

  // Leaving the bathroom mid-wash rinses quietly.
  function finishBath() {
    if (washGain > 30) {
      s.counts.baths += 1;
      gainXP(6);
    }
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
      track('pet');
      s.counts.hearts += 1;
      if (s.counts.hearts % 15 === 0) speak('pet');
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
    if (Math.random() < 0.35) speak('tap', 1.4);
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
    setTimeout(() => { if (s) pet.say('Hello, world!', 2.2); }, 900);
    // the first daily reward comes once the welcome tips are done
    timers.night = 30;
    setTimeout(() => { if (s && mode === 'home') dailyCheck(); }, 11000);
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
    const th = pet.thought;
    if (th && Math.hypot(p.x - th.x, p.y - th.y) < th.r) {
      followNeed(th.need);
      return;
    }
    if (s.party && s.room === 'living') {
      const hit = PM.rooms.partyHit(layout, s.party, p.x, p.y);
      if (hit) {
        if (hit.kind === 'cake') blowCandle(hit.i);
        else openPresent();
        return;
      }
    }
    if (friendHere() && friend.view.hit(p.x, p.y, 10)) {
      pokeFriend();
      return;
    }
    for (const poop of poopsHere()) {
      const pp = poopPos(poop);
      if (Math.hypot(p.x - pp.x, p.y - (pp.y - pp.size * 0.4)) < pp.size * 0.85) {
        M.cleanPoop(s, poop.id);
        s.counts.poops += 1;
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
        openArcade();
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
      case 'butterfly':
        A.play('sparkle');
        A.buzz(8);
        fx.sparkles(layout.butterfly.x, layout.butterfly.y, 6, 18);
        pet.setExpr('giggle', 0.6);
        pet.hop(160);
        s.stats.fun = M.clamp(s.stats.fun + 0.5);
        layout.butterfly.x = layout.zone[0] * W + Math.random() * (layout.zone[1] - layout.zone[0]) * W;
        layout.butterfly.y = layout.floorY * 0.35 + Math.random() * layout.floorY * 0.25;
        break;
      case 'can':
        A.play('splash');
        A.buzz(8);
        fx.drops(layout.wcan.x - 10, layout.wcan.x + 10, layout.wcan.y - 6, 14);
        pet.setExpr('yum', 0.5);
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
      game.pointer(p.x, p.y, 'down');
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
      if (pointer || e.pointerType === 'mouse') game.pointer(p.x, p.y, 'move');
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
        track('ball');
        if (Math.random() < 0.2) speak('bop', 1.2);
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
        pet.say('Five more minutes...', 2);
        toast(`${s.name} is still sleepy...`);
      } else {
        pet.setExpr('happy', 1);
        pet.hop(240);
        pet.say('Good morning!', 1.8);
        toast(`Good morning, ${s.name}!`);
      }
    } else {
      s.asleep = true;
      track('sleep');
      A.play('yawn');
      pet.setExpr('yawn', 1.3);
      pet.targetX = null;
      pet.hop(300); // hops into bed
      pet.say('Night night...', 1.4);
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
    setTimeout(() => {
      if (!s) return;
      fx.sparkles(pet.geo.x, pet.geo.cy, 12, pet.geo.w);
      pet.setExpr('happy', 1);
      pet.say('I feel better!', 1.8);
    }, 1300);
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
    if (friend) {
      pet.x = W * 0.28;
      friend.view.x = W * 0.74;
      friend.view.targetX = null;
    }
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
      hint('ball', `Flick the ball and ${s.name} will chase it. The arcade has two games.`, 3800);
    }
    if (id === 'garden') hint('garden', `Tap the butterfly or the watering can, or take ${s.name} for a walk!`, 3800);
    if (arrived && (id === 'living' || id === 'playroom' || id === 'garden' || (id === 'bedroom' && !s.asleep))) pet.hop(240);
  }

  function onRoomAction() {
    if (!s) return;
    if (s.room === 'kitchen') {
      A.play('click');
      openTray();
    } else if (s.room === 'bedroom') {
      onSleep();
    } else if (s.room === 'playroom') {
      openArcade();
    } else if (s.room === 'garden') {
      startGame('walk');
    }
  }

  // Take the player to whatever the pet is asking for (thought bubble or a meter).
  function followNeed(need) {
    if (!s || !s.hatched || mode !== 'home') return;
    A.play('tap');
    if (need === 'sick') {
      if (s.sick) onHeal();
      return;
    }
    if (need === 'poop') {
      const p = s.poops.find((x) => x.room !== s.room);
      if (p && !poopsHere().length) goRoom(p.room);
      toast('Tap the poop to clean it up.');
      return;
    }
    const room = NEED_ROOM[need];
    if (!room) return;
    if (room !== s.room) {
      goRoom(room);
      return;
    }
    if (room === 'kitchen' && els.tray.hidden) openTray();
    else if (room === 'bathroom') toast(`Scrub ${s.name} with your finger, then tap Rinse.`);
    else if (room === 'bedroom' && !s.asleep) toast(`Tap the lamp to put ${s.name} to bed.`);
    else if (room === 'playroom') openArcade();
  }

  /* ---------------- mini-game ---------------- */

  function renderLives() {
    const heart = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z"/></svg>';
    els.hudLives.innerHTML = [0, 1, 2].map(() => heart).join('');
    els.hudLives.setAttribute('aria-label', `${game.lives} lives`);
    Array.from(els.hudLives.children).forEach((c, i) => c.classList.toggle('lost', i >= game.lives));
  }

  function renderTime() {
    const t = Math.ceil(game.time);
    els.hudTime.textContent = `0:${String(t).padStart(2, '0')}`;
    els.hudTime.classList.toggle('low', t <= 5);
  }

  function openArcade() {
    A.play('click');
    if (needsPet()) return;
    closeTray();
    $('best-stars').textContent = `Best ${s.best}`;
    $('best-bubbles').textContent = `Best ${s.bestBubbles}`;
    $('best-match').textContent = `Best ${s.bestMatch}`;
    els.arcade.hidden = false;
    updateUI();
  }

  function closeArcade() {
    els.arcade.hidden = true;
    updateUI();
  }

  // opts.seed: the shared bubbles of an online duel
  function startGame(kind, opts) {
    A.play('click');
    if (needsPet()) return;
    // a duel the friend already agreed to always starts
    if (kind !== 'online') {
      if (s.asleep) { toast(`Shh... ${s.name} is sleeping.`); return; }
      if (s.sick) { toast(`${s.name} feels sick. Give medicine first.`); return; }
      if (s.stats.energy < 12) { toast(`${s.name} is too tired to play. Try a nap.`); return; }
    }
    if (GAME_OF[kind]) gameKind = kind;
    game = games[GAME_OF[gameKind]];
    closeTray();
    closeSheets();
    els.arcade.hidden = true;
    els.over.hidden = true;
    els.invite.hidden = true;
    mode = 'game';
    game.start(W, H, { seed: opts && opts.seed, duo: gameKind === 'duo' });
    const info = GAME_INFO[gameKind];
    const vs = gameKind === 'duo' || gameKind === 'online';
    els.hudLabel.textContent = info.label;
    els.hudLives.hidden = gameKind !== 'stars';
    els.hudTime.hidden = gameKind === 'stars';
    els.hudVs.hidden = !vs;
    els.hudVsLabel.textContent = gameKind === 'duo' ? 'P2' : duel ? duel.name : 'Friend';
    els.hudVsScore.textContent = '0';
    if (gameKind === 'stars') renderLives();
    else renderTime();
    els.hudScore.textContent = '0';
    els.tip.innerHTML = info.tip;
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
    $('go-best-label').textContent = 'Best';
    $('go-again').textContent = 'Play again';
    if (gameKind === 'duo') { endDuo(); return; }
    if (gameKind === 'online') { endOnline(); return; }
    if (gameKind === 'match') { endMatch(); return; }
    if (gameKind === 'walk') { endWalk(); return; }
    const stars = gameKind === 'stars';
    const score = game.score;
    const coins = game.coins * 2 + Math.floor(score / (stars ? 3 : 6));
    const bestKey = stars ? 'best' : 'bestBubbles';
    const newBest = score > s[bestKey] && score >= 5;
    s[bestKey] = Math.max(s[bestKey], score);
    s.coins += coins;
    s.stats.fun = M.clamp(s.stats.fun + Math.min(32, 6 + score * (stars ? 1.2 : 0.5)));
    s.stats.energy = M.clamp(s.stats.energy - (6 + Math.min(10, game.t / 8)));
    s.stats.hunger = M.clamp(s.stats.hunger - 5);
    const great = score >= (stars ? 10 : 30);
    $('go-title').textContent = newBest ? 'New best!' : great ? (stars ? 'Nice catch!' : 'Pop star!') : 'Good try!';
    $('go-score-label').textContent = stars ? 'Stars' : 'Score';
    $('go-score').textContent = score;
    $('go-best').textContent = s[bestKey];
    $('go-coins').textContent = `+${coins}`;
    $('go-note').textContent = coins > 0
      ? `${s.name} had fun and you earned ${coins} coins.`
      : stars ? 'Catch stars and coins to earn money for the shop.' : 'Pop bubbles fast for combos. Rainbow bubbles give coins.';
    els.over.hidden = false;
    A.play(newBest ? 'levelup' : 'gameover');
    if (coins > 0) bumpCoins();
    track(stars ? 'stars' : 'bubbles', stars ? score : game.popped);
    track('arcade');
    gainXP(4 + Math.min(30, score * (stars ? 0.6 : 0.3)));
    save();
    updateUI();
  }

  // Two players on one phone: whoever scored more wins; the pet just cheers.
  function endDuo() {
    const [a, b] = game.scores;
    const coins = game.coins * 2 + Math.floor((a + b) / 12);
    s.coins += coins;
    s.stats.fun = M.clamp(s.stats.fun + 20);
    s.stats.energy = M.clamp(s.stats.energy - 6);
    s.stats.hunger = M.clamp(s.stats.hunger - 4);
    $('go-title').textContent = a > b ? 'Player 1 wins!' : b > a ? 'Player 2 wins!' : 'It\u2019s a tie!';
    $('go-score-label').textContent = 'P1';
    $('go-score').textContent = a;
    $('go-best-label').textContent = 'P2';
    $('go-best').textContent = b;
    $('go-coins').textContent = `+${coins}`;
    $('go-note').textContent = `${s.name} loved cheering you both on!`;
    els.over.hidden = false;
    A.play('levelup');
    if (coins > 0) bumpCoins();
    track('bubbles', game.popped);
    track('arcade');
    gainXP(6 + Math.min(20, (a + b) * 0.15));
    save();
    updateUI();
  }

  // Memory Match: won means every pair was found before time ran out.
  function endMatch() {
    const score = game.score;
    const coins = game.coins * 2 + Math.floor(score / 10);
    const newBest = score > s.bestMatch && score >= 20;
    s.bestMatch = Math.max(s.bestMatch, score);
    s.coins += coins;
    s.stats.fun = M.clamp(s.stats.fun + Math.min(28, 8 + score * 0.4));
    s.stats.energy = M.clamp(s.stats.energy - 5);
    s.stats.hunger = M.clamp(s.stats.hunger - 4);
    $('go-title').textContent = newBest ? 'New best!' : game.won ? 'All matched!' : 'Time’s up!';
    $('go-score-label').textContent = 'Score';
    $('go-score').textContent = score;
    $('go-best-label').textContent = 'Best';
    $('go-best').textContent = s.bestMatch;
    $('go-coins').textContent = `+${coins}`;
    $('go-note').textContent = game.won
      ? `Found all ${game.matches} pairs in ${game.moves} moves. ${coins > 0 ? `+${coins} coins.` : ''}`
      : `Found ${game.matches} pairs before time ran out. Quick matches build a bigger combo.`;
    els.over.hidden = false;
    A.play(newBest ? 'levelup' : game.won ? 'sparkle' : 'gameover');
    if (coins > 0) bumpCoins();
    if (game.won) {
      s.counts.matchWins += 1;
      track('match');
    }
    track('arcade');
    gainXP(4 + Math.min(24, score * 0.25));
    save();
    updateUI();
  }

  function endWalk() {
    const coins = game.coins + game.friends * 3;
    s.coins += coins;
    for (let i = 0; i < game.treats; i++) {
      const pool = Object.keys(PM.FOODS).filter((k) => !PM.FOODS[k].special && M.isUnlocked(s, PM.FOODS[k]));
      const pick = pool[Math.floor(Math.random() * pool.length)];
      if (pick) s.inv[pick] = (s.inv[pick] || 0) + 1;
    }
    s.stats.fun = M.clamp(s.stats.fun + Math.min(30, 10 + game.score * 1.5));
    s.stats.energy = M.clamp(s.stats.energy - 10);
    s.stats.hunger = M.clamp(s.stats.hunger - 6);
    s.stats.thirst = M.clamp(s.stats.thirst - 6);
    s.counts.walks += 1;
    $('go-title').textContent = game.friends > 0 ? 'A friend said hi!' : 'Nice walk!';
    $('go-score-label').textContent = 'Found';
    $('go-score').textContent = game.score;
    $('go-best-label').textContent = 'Treats';
    $('go-best').textContent = game.treats;
    $('go-coins').textContent = `+${coins}`;
    $('go-note').textContent = game.treats > 0
      ? `${s.name} came home with ${game.treats} treat${game.treats === 1 ? '' : 's'}${coins > 0 ? ` and ${coins} coins.` : '.'}`
      : `A nice stroll with ${s.name}.${coins > 0 ? ` +${coins} coins.` : ''}`;
    els.over.hidden = false;
    A.play(game.friends > 0 ? 'ding' : 'sparkle');
    if (coins > 0) bumpCoins();
    track('walk');
    gainXP(4 + Math.min(20, game.score * 1.2));
    save();
    updateUI();
  }

  function leaveGame() {
    A.play('click');
    if (duel && duel.state !== 'waiting') duel = null;
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
    els.scrim.hidden = els.login.hidden; // the daily reward card stays until collected
    els.shopSheet.hidden = true;
    els.settingsSheet.hidden = true;
    els.goalsSheet.hidden = true;
    els.friendsSheet.hidden = true;
    disarmReset();
    if (settingsDirty) {
      settingsDirty = false;
      setTimeout(partyCheck, 300);
    }
    updateUI();
  }

  function onScrim() {
    if (!els.login.hidden) collectLogin();
    else closeSheets();
  }

  // Android back button: close whatever is on top, then head back to the
  // living room, and only then leave the app.
  function handleBack() {
    if (!els.scrim.hidden) onScrim();
    else if (!els.invite.hidden) answerDuel(false);
    else if (mode === 'game') endGame();
    else if (mode === 'gameover') leaveGame();
    else if (!els.arcade.hidden) closeArcade();
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
    ['food', 'hats', 'outfits', 'decor'].forEach((t) => $(`tab-${t}`).setAttribute('aria-selected', String(t === shopTab)));
    els.shopGrid.innerHTML = '';
    const coinDot = '<span class="coin-dot" aria-hidden="true"></span>';
    const priceBtn = (item) => `<button type="button" class="buy${s.coins < item.price ? ' poor' : ''}" ` +
      `aria-label="Buy ${item.name} for ${item.price} coins">${coinDot}${item.price}</button>`;
    const lockBtn = (item) => `<button type="button" class="buy locked" aria-label="${item.name} unlocks at level ${item.level}">Lv ${item.level}</button>`;
    const add = (icon, item, meta, btn, onBuy) => {
      const el = document.createElement('div');
      const locked = !M.isUnlocked(s, item);
      el.className = `item${locked ? ' is-locked' : ''}`;
      el.innerHTML = `<img alt="" src="${icon}"><div class="item-name">${item.name}</div>` +
        `<div class="item-meta">${locked ? `Unlocks at level ${item.level}` : meta}</div>${locked ? lockBtn(item) : btn}`;
      el.querySelector('.buy').addEventListener('click', () => (locked ? lockedMsg(el, item) : onBuy(el)));
      els.shopGrid.appendChild(el);
    };
    let foot = 'Earn coins in the arcade, from daily goals, and by leveling up.';
    if (shopTab === 'food') {
      for (const [k, f] of Object.entries(PM.FOODS)) {
        if (f.special) continue;
        const effects = [`+${f.food} food`];
        if (f.fun >= 10) effects.push(`+${f.fun} fun`);
        add(icons.food[k], f, `${effects.join(', ')} · have ${s.inv[k] || 0}`, priceBtn(f), (el) => buyFood(k, el));
      }
      for (const [k, d] of Object.entries(PM.DRINKS)) {
        const effects = [`+${d.drink} thirst`];
        if (d.fun >= 10) effects.push(`+${d.fun} fun`);
        add(icons.drink[k], d, `${effects.join(', ')} · have ${s.inv[k] || 0}`, priceBtn(d), (el) => buyDrink(k, el));
      }
    } else if (shopTab === 'hats') {
      for (const [k, h] of Object.entries(PM.HATS)) {
        const owned = s.hats.includes(k);
        if (h.special && !owned) continue;
        const wearing = s.hat === k;
        let btn = priceBtn(h);
        if (wearing) btn = '<button type="button" class="buy wearing">Take off</button>';
        else if (owned) btn = '<button type="button" class="buy alt">Wear</button>';
        add(icons.hat[k], h, wearing ? 'Wearing now' : owned ? (h.special ? 'A birthday present' : 'Yours') : '', btn, (el) => hatAction(k, el));
      }
    } else if (shopTab === 'outfits') {
      for (const [k, o] of Object.entries(PM.OUTFITS)) {
        const owned = s.outfits.includes(k);
        const wearing = s.outfit === k;
        let btn = priceBtn(o);
        if (wearing) btn = '<button type="button" class="buy wearing">Take off</button>';
        else if (owned) btn = '<button type="button" class="buy alt">Wear</button>';
        add(icons.outfit[k], o, wearing ? 'Wearing now' : owned ? 'Yours' : '', btn, (el) => outfitAction(k, el));
      }
    } else {
      const here = M.wallOf(s, s.room);
      foot = `Wallpaper goes up in the ${PM.rooms.name(s.room).toLowerCase()}. Visit another room to decorate it.`;
      for (const [k, w] of Object.entries(PM.WALLS)) {
        const owned = s.walls.includes(k);
        let btn = priceBtn(w);
        if (here === k) btn = '<button type="button" class="buy wearing">In use</button>';
        else if (owned) btn = '<button type="button" class="buy alt">Use here</button>';
        add(icons.wall[k], w, here === k ? 'Up in this room' : owned ? 'Yours' : '', btn, (el) => wallAction(k, el));
      }
    }
    $('shop-foot').textContent = foot;
  }

  function notEnough(item, price) {
    A.play('no');
    const meta = item.querySelector('.item-meta');
    meta.textContent = `Need ${price - s.coins} more coins`;
  }

  function lockedMsg(el, item) {
    A.play('no');
    el.querySelector('.item-meta').textContent = `Reach level ${item.level} to unlock`;
  }

  function buyFood(k, item) {
    const f = PM.FOODS[k];
    if (!M.buyFood(s, k)) { notEnough(item, f.price); return; }
    A.play('coin');
    A.buzz(10);
    track('shop');
    save();
    renderShop();
    updateUI();
    if (!els.tray.hidden) renderTray();
  }

  function buyDrink(k, item) {
    const d = PM.DRINKS[k];
    if (!M.buyDrink(s, k)) { notEnough(item, d.price); return; }
    A.play('coin');
    A.buzz(10);
    track('shop');
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
      track('shop');
    } else {
      s.hat = s.hat === k ? null : k;
      A.play('click');
    }
    if (s.hat) {
      fx.sparkles(pet.geo.x, pet.geo.top, 10, pet.geo.w * 0.5);
      pet.setExpr('yum', 1);
    }
    sendHello();
    save();
    renderShop();
    updateUI();
  }

  function outfitAction(k, item) {
    const o = PM.OUTFITS[k];
    if (!s.outfits.includes(k)) {
      if (!M.buyOutfit(s, k)) { notEnough(item, o.price); return; }
      A.play('coin');
      A.buzz(10);
      track('shop');
    } else {
      s.outfit = s.outfit === k ? null : k;
      A.play('click');
    }
    if (s.outfit) {
      fx.sparkles(pet.geo.x, pet.geo.cy, 10, pet.geo.w * 0.5);
      pet.setExpr('yum', 1);
    }
    sendHello();
    save();
    renderShop();
    updateUI();
  }

  // Buying a wallpaper puts it up in the room you're in; owned ones can go anywhere.
  function wallAction(k, item) {
    const w = PM.WALLS[k];
    if (!s.walls.includes(k)) {
      if (!M.buyWall(s, k)) { notEnough(item, w.price); return; }
      A.play('coin');
      A.buzz(10);
      track('shop');
    } else {
      A.play('click');
    }
    M.setWall(s, s.room, k);
    delete bgCache[s.room];
    layout = roomBg(s.room).layout;
    fx.sparkles(W / 2, H * 0.3, 16, W * 0.4);
    save();
    renderShop();
    updateUI();
  }

  /* ---------------- daily goals ---------------- */

  function openGoals() {
    A.play('click');
    if (!s) return;
    M.ensureGoals(s);
    M.ensureWeekly(s);
    goalsTab = M.weeklyReady(s) ? 'weekly' : (s.stickerBadge && !M.goalsReady(s) ? 'stickers' : 'goals');
    renderGoalsSheet();
    openSheet(els.goalsSheet);
  }

  const GOALS_TITLE = { goals: 'Today\u2019s goals', weekly: 'This week\u2019s quest', stickers: 'Sticker album' };

  function renderGoalsSheet() {
    ['goals', 'weekly', 'stickers'].forEach((k) => $(`gtab-${k}`).setAttribute('aria-selected', String(k === goalsTab)));
    $('goals-pane').hidden = goalsTab !== 'goals';
    $('weekly-pane').hidden = goalsTab !== 'weekly';
    $('stickers-pane').hidden = goalsTab !== 'stickers';
    $('goals-title').textContent = GOALS_TITLE[goalsTab];
    if (goalsTab === 'goals') renderGoals();
    else if (goalsTab === 'weekly') renderWeekly();
    else {
      renderStickers();
      s.stickerBadge = false;
    }
    els.stickersBadge.hidden = !s.stickerBadge;
    $('weekly-badge').hidden = !M.weeklyReady(s);
    updateUI();
  }

  // Days left until the weekly quest resets (it always turns over Monday).
  function daysLeftInWeek() {
    const day = new Date().getDay(); // 0 = Sunday
    return day === 0 ? 1 : 8 - day;
  }

  function renderWeekly() {
    const g = s.weekly;
    const el = $('weekly-goal');
    if (!g) { el.innerHTML = '<p class="sheet-foot">Come back tomorrow for this week\u2019s quest.</p>'; return; }
    const ready = g.have >= g.n && !g.claimed;
    const R = M.WEEKLY_REWARD;
    const days = daysLeftInWeek();
    const action = g.claimed ? '<span class="done-tag">Claimed</span>'
      : ready ? '<button type="button" class="btn primary">Claim</button>' : '<span></span>';
    el.className = `goal weekly${g.claimed ? ' claimed' : ''}`;
    el.innerHTML = `<div><div class="goal-text"></div><div class="goal-meta">${Math.floor(g.have)} / ${g.n} · +${R.coins} coins, +${R.xp} XP · ${days} day${days === 1 ? '' : 's'} left</div></div>` +
      `${action}<div class="goal-bar"><div style="width:${Math.round((Math.min(g.have, g.n) / g.n) * 100)}%"></div></div>`;
    el.querySelector('.goal-text').textContent = M.weeklyText(s);
    const b = el.querySelector('button');
    if (b) b.addEventListener('click', claimWeeklyQuest);
  }

  function claimWeeklyQuest() {
    const r = M.claimWeekly(s);
    if (!r) return;
    A.play('levelup');
    A.buzz([20, 40, 20, 40, 20]);
    bumpCoins();
    fx.confetti(W / 2, H * 0.3, 40);
    s.counts.weeklyDone += 1;
    gainXP(r.xp);
    toast(`Weekly quest done! +${r.coins} coins, +${r.xp} XP.`, 3400);
    save();
    renderWeekly();
    updateUI();
  }

  function stickerImg(k) {
    if (!icons.sticker[k.id]) icons.sticker[k.id] = PM.art.stickerIcon(k.icon, 64, false);
    return icons.sticker[k.id];
  }

  function renderStickers() {
    const grid = $('stickers-grid');
    grid.innerHTML = '';
    $('stickers-count').textContent = `${s.stickers.length} of ${M.STICKERS.length} collected`;
    M.STICKERS.forEach((k) => {
      const got = s.stickers.includes(k.id);
      const el = document.createElement('div');
      el.className = `sticker${got ? ' got' : ''}`;
      el.innerHTML = `<img alt="" src="${got ? stickerImg(k) : icons.stickerLocked}"><span class="st-name"></span><span class="st-desc"></span>`;
      el.querySelector('.st-name').textContent = k.name;
      el.querySelector('.st-desc').textContent = got ? 'Collected!' : k.desc;
      el.setAttribute('aria-label', `${k.name}: ${got ? 'collected' : k.desc}`);
      grid.appendChild(el);
    });
  }

  function renderGoals() {
    const R = M.GOAL_REWARD;
    els.goalsList.innerHTML = '';
    s.goals.list.forEach((g, i) => {
      const ready = g.have >= g.n;
      const el = document.createElement('div');
      el.className = `goal${g.claimed ? ' claimed' : ''}`;
      const action = g.claimed ? '<span class="done-tag">Claimed</span>'
        : ready ? '<button type="button" class="btn primary">Claim</button>' : '<span></span>';
      el.innerHTML = `<div><div class="goal-text"></div><div class="goal-meta">${Math.floor(g.have)} / ${g.n} · +${R.coins} coins, +${R.xp} XP</div></div>` +
        `${action}<div class="goal-bar"><div style="width:${Math.round((g.have / g.n) * 100)}%"></div></div>`;
      el.querySelector('.goal-text').textContent = M.goalText(g, s.name);
      const b = el.querySelector('button');
      if (b) b.addEventListener('click', () => claimGoal(i));
      els.goalsList.appendChild(el);
    });
    els.goalsBonus.textContent = s.goals.bonus
      ? `Daily bonus collected: +${M.GOAL_BONUS} coins`
      : `Finish all three for a +${M.GOAL_BONUS} coin bonus`;
  }

  function claimGoal(i) {
    const r = M.claimGoal(s, i);
    if (!r) return;
    A.play('coin');
    A.buzz([20, 40, 20]);
    bumpCoins();
    gainXP(r.xp);
    if (r.bonus) {
      A.play('levelup');
      toast(`All three goals done! Bonus +${r.bonus} coins.`, 3200);
    }
    save();
    renderGoals();
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
    if (friend || PM.online.state !== 'off') leavePlaydate();
    PM.host.notify.cancel();
    wipe();
    s = null;
    closeSheets();
    closeTray();
    mode = 'home';
    shownRoom = null;
    trans = null;
    ball = null;
    els.arcade.hidden = true;
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
    if (ev.includes('died')) {
      syncRoom();
      save();
      updateUI();
      showMemorial();
      return;
    }
    if (away) {
      const mins = Math.round(hours * 60);
      const span = mins < 60 ? `${mins} min` : `${Math.round(hours)} h`;
      let msg = `Welcome back! You were away ${span}.`;
      if (ev.includes('sick')) msg = `${s.name} got sick while you were away. Give medicine!`;
      else if (ev.includes('poop')) msg = `Welcome back! ${s.name} made a mess while you were away.`;
      else if (ev.includes('woke')) msg = `${s.name} woke up rested while you were away.`;
      toast(msg, 3600);
      if (s.hatched && !s.asleep && hours > 0.25) {
        setTimeout(() => { if (s) pet.say(s.owner.name ? `Hi, ${s.owner.name}! I missed you!` : 'Hi! I missed you!', 2.4); }, 600);
      }
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

  // Runs on start, every half minute and when the app comes back: a new day
  // brings new goals, a daily reward, and maybe a birthday.
  function dailyCheck() {
    if (!s) return;
    if (M.ensureGoals(s) && s.hatched) {
      setTimeout(() => {
        if (s) hint('goals', 'New: daily goals! Tap the checklist at the top to see them.', 3600);
      }, 1800);
      updateUI();
    }
    if (M.ensureWeekly(s) && s.hatched) {
      setTimeout(() => {
        if (s) hint('weekly', 'New this week: a bigger quest for a bigger prize. See it under the Week tab.', 3800);
      }, 2600);
      updateUI();
    }
    if (!s.hatched) return;
    if (!showLogin()) partyCheck();
  }

  /* ---------------- daily login reward ---------------- */

  function showLogin() {
    if (!s || !s.hatched || !M.loginDay(s) || !els.login.hidden) return false;
    if (mode !== 'home' || !els.scrim.hidden || !els.adopt.hidden || trans) return false;
    renderLogin();
    els.scrim.hidden = false;
    els.login.hidden = false;
    A.play('ding');
    els.loginCollect.focus({ preventScroll: true });
    updateUI();
    return true;
  }

  function renderLogin() {
    const day = M.loginDay(s);
    els.loginDays.innerHTML = '';
    M.LOGIN_REWARDS.forEach((r, i) => {
      const n = i + 1;
      const li = document.createElement('li');
      li.className = `day${n < day ? ' got' : n === day ? ' today' : ''}${n === 7 ? ' big' : ''}`;
      const snack = r.snack ? `<span class="day-snack"><img alt="" src="${icons.food[r.snack]}">x${r.n}</span>` : '';
      li.innerHTML = `<span class="day-n">${n === 7 ? 'Day 7!' : `Day ${n}`}</span>` +
        `<span class="day-coins"><span class="coin-dot" aria-hidden="true"></span>${r.coins}</span>${snack}`;
      const what = `${r.coins} coins${r.snack ? ` and ${r.n} ${PM.FOODS[r.snack].name}` : ''}`;
      li.setAttribute('aria-label', `Day ${n}: ${what}${n < day ? ', collected' : n === day ? ', today' : ''}`);
      els.loginDays.appendChild(li);
    });
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    let sub = `Day ${day} in a row. Keep it up!`;
    if (day === 1) {
      if (s.login.streak > 0 && s.login.last !== yesterday) sub = 'Your streak started over. Come back tomorrow to keep it going!';
      else if (s.login.streak === 7) sub = 'A new week of gifts begins!';
      else sub = 'Come back every day for bigger gifts!';
    } else if (day === 7) {
      sub = 'Seven days in a row! Here\u2019s the big one.';
    }
    els.loginSub.textContent = sub;
  }

  function collectLogin() {
    if (els.login.hidden) return;
    const r = M.collectLogin(s);
    els.login.hidden = true;
    els.scrim.hidden = true;
    if (r) {
      A.play('coin');
      A.buzz([20, 40, 20]);
      bumpCoins();
      fx.confetti(W / 2, H * 0.35, 40);
      const f = r.snack ? PM.FOODS[r.snack].name.toLowerCase() : '';
      const snack = r.snack ? ` and ${r.n} ${f}${r.n > 1 ? 's' : ''}` : '';
      toast(`Day ${r.day} reward: +${r.coins} coins${snack}!`, 3000);
      if (!s.asleep) {
        pet.hop(260);
        pet.setExpr('yum', 1);
        pet.say(r.day === 7 ? 'A whole week! Wow!' : 'See you tomorrow!', 2.2);
      }
      if (!els.tray.hidden) renderTray();
      save();
    }
    updateUI();
    setTimeout(partyCheck, 500);
  }

  /* ---------------- birthday parties ---------------- */

  function partyWaiting() {
    return !!s.party && (!s.party.done || !s.party.opened);
  }

  // Starts today's party if it's a birthday (once per day).
  function partyCheck() {
    if (!s || !s.hatched || mode !== 'home' || !els.scrim.hidden) return;
    const p = M.startParty(s);
    if (!p) return;
    save();
    A.play('birthday');
    if (s.room !== 'living' && !s.asleep) goRoom('living');
    const who = s.owner.name ? `, ${s.owner.name}` : '';
    if (p.kind === 'owner') {
      toast(`Happy birthday${who}! ${s.name} threw you a party in the living room.`, 4400);
    } else {
      const age = p.years ? `${ordinal(p.years)} birthday` : `${p.months}-month birthday`;
      toast(`It\u2019s ${s.name}\u2019s ${age}! There\u2019s a party in the living room.`, 4400);
    }
    fx.confetti(W / 2, H * 0.3, 60);
    if (!s.asleep) {
      pet.hop(300);
      pet.say(p.kind === 'owner' ? `Happy birthday${who}!` : 'It\u2019s my birthday!', 3);
    }
    setTimeout(() => {
      if (s && s.party && mode === 'home') hint('party', 'Tap the cake to blow out the candles, then open the present!', 4200);
    }, 4000);
    updateUI();
  }

  function blowCandle(i) {
    const P = s.party;
    if (i < 0) {
      pet.say(P.done ? 'Best party ever!' : 'Yay!', 1.6);
      return;
    }
    P.blown[i] = true;
    const flame = PM.rooms.partyCandles(layout, P)[i];
    fx.smoke(flame.x, flame.y);
    A.play('puff');
    A.buzz(10);
    pet.lookAt = { x: flame.x, y: flame.y };
    lookClear = 1;
    pet.setExpr('surprise', 0.5);
    if (P.blown.every(Boolean)) {
      P.done = true;
      s.inv.cake = (s.inv.cake || 0) + 2;
      s.counts.parties += 1;
      const c = PM.rooms.partyLayout(layout).cake;
      fx.confetti(c.x + c.w / 2, c.y, 60);
      setTimeout(() => A.play('birthday'), 300);
      pet.hop(320);
      pet.setExpr('love', 2);
      pet.say('Yay! Make a wish!', 2.6);
      toast('Happy birthday! Two slices of cake went into the fridge.', 3600);
      gainXP(10);
    }
    save();
    updateUI();
  }

  function openPresent() {
    const P = s.party;
    if (P.opened) {
      pet.say('Thank you!', 1.6);
      return;
    }
    P.opened = true;
    const pr = PM.rooms.partyLayout(layout).present;
    fx.confetti(pr.x, pr.y - pr.s, 50);
    fx.sparkles(pr.x, pr.y - pr.s * 0.6, 14, pr.s);
    A.play('pop');
    A.buzz([20, 30, 20]);
    const coins = P.kind === 'owner' ? 50 : 30;
    s.coins += coins;
    bumpCoins();
    const newHat = !s.hats.includes('balloon');
    if (newHat) {
      s.hats.push('balloon');
      s.hat = 'balloon';
      sendHello();
    }
    const extra = newHat ? ' and a balloon hat' : '';
    toast(P.kind === 'owner'
      ? `${s.name} got you a present! +${coins} coins${extra}.`
      : `A present! +${coins} coins${extra}.`, 3400);
    pet.hop(260);
    pet.setExpr('yum', 1.2);
    pet.say(P.kind === 'owner' ? 'I picked it myself!' : 'For me? Yay!', 2.2);
    save();
    updateUI();
  }

  /* ---------------- settings: about you ---------------- */

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  function buildBirthdayPicker() {
    $('owner-month').innerHTML = '<option value="">Month</option>' +
      MONTHS.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('');
    fillDays(31);
  }

  function fillDays(max) {
    const d = $('owner-day');
    const keep = d.value;
    d.innerHTML = '<option value="">Day</option>' +
      Array.from({ length: max }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('');
    d.value = Number(keep) <= max ? keep : String(max);
  }

  function openSettings() {
    A.play('click');
    if (!s) return;
    $('owner-name').value = s.owner.name || '';
    const [mm, dd] = s.owner.bday ? s.owner.bday.split('-').map(Number) : [0, 0];
    $('owner-month').value = mm ? String(mm) : '';
    fillDays(mm ? MONTH_DAYS[mm - 1] : 31);
    $('owner-day').value = dd ? String(dd) : '';
    let note = 'Your pet throws you a party on your birthday.';
    if (s.hatched) note += ` ${s.name}\u2019s own birthday is on the ${ordinal(new Date(s.born).getDate())} of every month.`;
    $('bday-note').textContent = note;
    syncNotifyToggle();
    openSheet(els.settingsSheet);
  }

  function saveOwner() {
    if (!s) return;
    s.owner.name = $('owner-name').value.replace(/\s+/g, ' ').trim().slice(0, 12);
    const m = Number($('owner-month').value);
    if (m) fillDays(MONTH_DAYS[m - 1]);
    const d = Number($('owner-day').value);
    const bday = m && d ? `${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : '';
    if (bday !== s.owner.bday) settingsDirty = true;
    s.owner.bday = bday;
    sendHello();
    save();
  }

  /* ---------------- reminders while you're away ---------------- */

  // Called whenever the app is backgrounded: works out roughly when the pet
  // will next want something and asks the host to schedule a reminder for
  // then. Cleared again as soon as you come back (see onForeground).
  function scheduleNeedNotice() {
    if (!s || !s.hatched || s.dead || !s.settings.notify) { PM.host.notify.cancel(); return; }
    const t = M.timeToNeed(s);
    if (!t) { PM.host.notify.cancel(); return; }
    const minutes = Math.max(1, Math.round(t.hours * 60));
    const notice = (NEED_NOTICE[t.need] || NEED_NOTICE.hunger)(s.name);
    let body = notice.body;
    // An occasional nudge to visit a friend, folded into a normal (non-urgent) reminder.
    if (t.need !== 'critical' && t.need !== 'sick') {
      const sinceVisit = (Date.now() - (s.lastPlaydate || s.born)) / 86400000;
      if (sinceVisit >= 3 && Math.random() < 0.3) body += ` It's been a while — invite a friend over?`;
    }
    PM.host.notify.schedule(minutes, notice.title, body);
  }

  function onBackground() {
    if (!s) return;
    save();
    scheduleNeedNotice();
  }

  function onForeground() {
    if (!s) return;
    PM.host.notify.cancel();
    lastFrame = performance.now();
    tickModel();
    dailyCheck();
  }

  // The checkbox reflects what the OS will actually deliver, not just what
  // was last asked for — a permission can be revoked outside the game.
  function syncNotifyToggle() {
    const el = $('set-notify');
    if (!el) return;
    if (s && s.settings.notify && PM.host.notify.permission() === 'denied') s.settings.notify = false;
    el.checked = !!(s && s.settings.notify);
  }

  function onNotifyPermission(granted) {
    if (!s) return;
    s.settings.notify = granted;
    syncNotifyToggle();
    if (!granted) toast('Notifications are off for Pocket Mochi. Turn them on in your phone’s settings to use this.', 3800);
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
    pet.thought = null;
    const g0 = currentGround();
    ctx.drawImage(roomBg(s.room).canvas, 0, 0, W, H);
    PM.rooms.drawLive(s.room, ctx, L, pet.t);
    if (s.party && s.room === 'living') PM.rooms.drawParty(ctx, L, s.party, pet.t);
    const visitor = friendHere();
    if (visitor) drawFriend();

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
      if (k > 0.05) drawItem(eating.type, g.x, g.mouthY + g.h * 0.08, petSize() * 0.3 * k);
    }
    PM.rooms.drawFront(s.room, ctx, L, {
      asleep: s.asleep, petX: pet.geo.x, petGround: g0, petW: pet.geo.w, petH: pet.geo.h, t: pet.t, duckHop,
    });
    poops.filter((pp) => pp.y >= g0).forEach((pp) => PM.art.drawPoop(ctx, pp.x, pp.y, pp.size));
    if (showBall) PM.rooms.drawBall(ctx, ball.x, ball.y, ball.r, ball.rot);

    const busy = eating || fly || drag || s.room === 'bathroom' || (pointer && pointer.onPet);
    if (!busy && s.hatched && !pet.speaking()) pet.drawThought(ctx, M.need(s), pet.t);
    if (fly) {
      const k = Math.min(1, fly.t / 0.38);
      const e = 1 - (1 - k) * (1 - k);
      const x = fly.x0 + (pet.geo.x - fly.x0) * e;
      const y = fly.y0 + (pet.geo.mouthY - fly.y0) * e - Math.sin(k * Math.PI) * 60;
      drawItem(fly.type, x, y, Math.max(40, petSize() * 0.3), k * 6);
    }
    if (drag) {
      const hp = heldFoodPos(drag);
      drawItem(drag.type, hp.x, hp.y, Math.max(46, petSize() * 0.32), Math.sin(pet.t * 8) * 0.12);
    }
    if (s.room === 'bathroom' && s.hatched && pointer && !pointer.onBall) drawSponge(pointer.x, pointer.y);
    if (s.asleep) {
      ctx.fillStyle = 'rgba(14, 16, 44, 0.62)';
      ctx.fillRect(0, 0, W, H);
      PM.rooms.drawNight(s.room, ctx, L);
    }
    fx.draw(ctx);
    if (!s.asleep) pet.drawSpeech(ctx, W);
    if (visitor) friend.view.drawSpeech(ctx, W);
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
    let zone = layout.zone;
    if (friendHere()) zone = [0.18, 0.34];
    else if (s.party && s.room === 'living') zone = [0.36, 0.64];
    pet.update(dt, {
      W, size: petSize(), stageScale: s.hatched ? M.stage(s).scale : 1, zone,
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
    if (friend) updateFriend(dt);
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
      if (!busy && s.hatched && !s.asleep && !pet.speaking() && Math.random() < 0.3) {
        const need = M.need(s);
        if (need) speak(NEED_LINE[need], 2);
      }
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
    if (!s || els.adopt.hidden === false || els.memorial.hidden === false) return;

    tickModel();

    timers.night -= dt;
    if (timers.night <= 0) {
      timers.night = 30;
      const n = isNight();
      if (n !== night) { night = n; resetBackgrounds(); }
      dailyCheck(); // new day: new goals, a reward, maybe a party
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
        if (gameKind === 'stars') {
          if (els.hudLives.querySelectorAll('.lost').length !== 3 - game.lives) renderLives();
        } else {
          renderTime();
        }
        if (gameKind === 'duo') els.hudVsScore.textContent = game.scores[1];
        if (gameKind === 'online' && duel) {
          els.hudVsScore.textContent = duel.theirs;
          duel.sendT -= dt;
          if (duel.sendT <= 0) {
            duel.sendT = 0.4;
            PM.online.send({ t: 'duel', a: 'score', s: game.score });
          }
        }
      }
      game.draw(ctx, s);
    } else {
      updateHome(dt);
      drawHome(dt);
    }

    timers.save -= dt;
    if (timers.save <= 0) { timers.save = 5; save(); }
    timers.ui -= dt;
    if (timers.ui <= 0) {
      timers.ui = 0.5;
      if (mode === 'home' && els.login.hidden) checkStickers();
      updateUI();
    }
  }

  /* ---------------- playdates (online) ---------------- */

  const EMOTES = {
    wave: { line: 'Hi there!' },
    heart: { line: 'Love you!' },
    dance: { line: 'Let\u2019s dance!' },
  };

  // The friend's pet visits every room except the bathroom, and not at bedtime.
  function friendHere() {
    return !!friend && mode === 'home' && s.hatched && s.room !== 'bathroom' && !s.asleep;
  }

  function myProfile() {
    return {
      name: s.name, species: s.species, color: s.color, hat: s.hat, outfit: s.outfit,
      level: M.levelOf(s.xp), stage: M.stageIndex(s), owner: s.owner.name || '',
    };
  }

  function sendHello() {
    if (friend) PM.online.send(Object.assign({ t: 'hello', v: 1 }, myProfile()));
  }

  // Only trust what we can check: names are cut short, everything else must be a known value.
  function cleanProfile(m) {
    const str = (v) => String(v || '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 12);
    return {
      name: str(m.name) || 'Friend',
      owner: str(m.owner),
      species: own(PM.SPECIES, m.species) ? m.species : 'mochi',
      color: own(PM.PET_COLORS, m.color) ? m.color : 'pink',
      hat: own(PM.HATS, m.hat) ? m.hat : null,
      outfit: own(PM.OUTFITS, m.outfit) ? m.outfit : null,
      level: Math.max(1, Math.min(999, Math.floor(Number(m.level)) || 1)),
      stage: Math.max(0, Math.min(M.STAGES.length - 1, Math.floor(Number(m.stage)) || 0)),
    };
  }

  function petAvatar(p) {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const g = c.getContext('2d');
    g.scale(2, 2);
    const v = new PM.PetView();
    v.x = 32;
    v.update(0, { W: 64, size: 42, stageScale: 1, canWander: false });
    v.draw(g, { species: p.species, color: p.color, hat: p.hat, outfit: p.outfit, size: 42, groundY: 58, clean: 100, sick: false, mood: 'happy' });
    return c.toDataURL();
  }

  function onFriendMessage(m) {
    if (m.t === 'hello') { friendArrives(m); return; }
    if (!friend) return;
    if (m.t === 'emote' && own(EMOTES, m.e)) {
      showEmote(friend.view, m.e);
      friend.view.say(EMOTES[m.e].line, 2);
    } else if (m.t === 'poke') {
      gotPoked();
    } else if (m.t === 'gift') {
      gotGift(m.snack);
    } else if (m.t === 'duel') {
      onDuelMessage(m);
    }
  }

  function friendArrives(m) {
    const p = cleanProfile(m);
    const first = !friend;
    friend = Object.assign(friend || { view: new PM.PetView() }, p);
    friend.avatar = petAvatar(p);
    if (first) {
      giftsIn = 0;
      friend.view.x = W * 0.9;
      friend.view.targetX = W * 0.74;
      friend.view.wander = 3;
      if (s.hatched && !s.asleep && s.room !== 'bathroom') {
        pet.targetX = W * 0.28; // make room
        pet.wander = 4;
      }
      A.play('ding');
      A.buzz([20, 40, 20]);
      toast(`${p.name} came over to play!`, 3000);
      setTimeout(() => { if (friend) friend.view.say(`Hi, ${s.name}!`, 2.2); }, 700);
      setTimeout(() => { if (friend && s.hatched && !s.asleep) pet.say(`Hi, ${friend.name}!`, 2.2); }, 2000);
      setTimeout(() => {
        if (friend) hint('friend', `Tap ${friend.name} to poke. The buttons on the right send waves, hearts and snacks.`, 4200);
      }, 3400);
      s.counts.playdates += 1;
      s.lastPlaydate = Date.now();
      closeSheets();
      save();
    }
    renderFriends();
    updateUI();
  }

  function friendLeft(why) {
    const name = friend ? friend.name : 'Your friend';
    friend = null;
    els.invite.hidden = true;
    if (duel) {
      if (duel.state === 'playing') duel.left = true;
      else if (duel.state === 'waiting') { duel.left = true; showDuelResult(); }
      else duel = null;
    }
    A.play('sad');
    toast(why === 'left' ? `${name} went home. Come back soon!` : `Lost the connection to ${name}.`, 3200);
    renderFriends();
    updateUI();
  }

  function leavePlaydate() {
    A.play('click');
    const had = !!friend;
    PM.online.leave();
    friend = null;
    duel = null;
    els.invite.hidden = true;
    if (had) toast('Playdate over. See you next time!');
    renderFriends();
    updateUI();
  }

  function updateFriend(dt) {
    const v = friend.view;
    v.update(dt, {
      W, size: petSize() * 0.88, stageScale: M.STAGES[friend.stage].scale, zone: [0.66, 0.84],
      canWander: friendHere() && !v.dancing,
    });
    if (friendHere() && !pointer) v.lookAt = { x: pet.geo.x, y: pet.geo.cy };
  }

  function drawFriend() {
    const v = friend.view;
    v.draw(ctx, {
      species: friend.species, color: friend.color, hat: friend.hat, outfit: friend.outfit, size: petSize() * 0.88,
      groundY: layout.groundY, clean: 100, sick: false, mood: 'happy',
    });
    const label = friend.name;
    ctx.save();
    ctx.font = `800 12px ${PM.FONT_BODY}`;
    const w = ctx.measureText(label).width + 18;
    const y = layout.groundY + 10;
    PM.art.roundRect(ctx, v.geo.x - w / 2, y, w, 21, 10.5);
    ctx.fillStyle = 'rgba(34,36,61,0.8)';
    ctx.fill();
    ctx.fillStyle = '#FFFDF8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, v.geo.x, y + 11);
    ctx.restore();
  }

  // An emote plays on one of the pets: yours (sent) or your friend's (received).
  function showEmote(view, e) {
    const g = view.geo;
    if (e === 'heart') {
      fx.hearts(g.x, g.top, 4);
      view.setExpr('love', 1.2);
      view.hop(200);
    } else if (e === 'wave') {
      view.hop(250);
      view.setExpr('happy', 1);
      fx.note(g.x + g.w * 0.3, g.top);
    } else if (e === 'dance') {
      view.dancing = true;
      view.setExpr('giggle', 1.8);
      [0, 420, 840].forEach((ms, i) => setTimeout(() => {
        view.facing = i % 2 ? -1 : 1;
        view.vx = (i % 2 ? -1 : 1) * 50;
        view.hop(260);
        fx.note(view.geo.x, view.geo.top);
        if (i === 2) setTimeout(() => { view.dancing = false; }, 500);
      }, ms));
    }
    A.play(e === 'heart' ? 'sparkle' : 'boing');
  }

  function sendEmote(e) {
    if (!friend || !s.hatched) return;
    const now = performance.now();
    if (now - lastEmote < 600) return;
    lastEmote = now;
    PM.online.send({ t: 'emote', e });
    if (!s.asleep && s.room !== 'bathroom') {
      showEmote(pet, e);
      pet.say(EMOTES[e].line, 1.8);
    } else {
      A.play('tap');
    }
  }

  function pokeFriend() {
    const now = performance.now();
    if (now - lastPoke < 700) return;
    lastPoke = now;
    const v = friend.view;
    v.hop(260);
    v.setExpr('giggle', 0.8);
    A.play('giggle');
    A.buzz(8);
    PM.online.send({ t: 'poke' });
  }

  function gotPoked() {
    A.play('boing');
    if (s.hatched && !s.asleep) {
      pet.hop(240);
      pet.setExpr('giggle', 0.8);
      if (Math.random() < 0.4) pet.say('Hey! Hee hee!', 1.4);
    }
    const now = performance.now();
    if (now - pokeToast > 8000) {
      pokeToast = now;
      toast(`${friend.name} poked ${s.name}!`, 1800);
    }
  }

  function giftSnack(k) {
    if (!friend || !(s.inv[k] > 0)) return;
    s.inv[k] -= 1;
    PM.online.send({ t: 'gift', snack: k });
    A.play('coin');
    closeSheets();
    toast(`You sent ${friend.name} a ${PM.FOODS[k].name.toLowerCase()}!`);
    if (friendHere()) {
      friend.view.hop(260);
      friend.view.setExpr('yum', 1.2);
      fx.hearts(friend.view.geo.x, friend.view.geo.top, 2);
    }
    if (!els.tray.hidden) renderTray();
    save();
  }

  function gotGift(k) {
    if (!own(PM.FOODS, k) || giftsIn >= 30) return;
    giftsIn += 1;
    s.inv[k] = (s.inv[k] || 0) + 1;
    A.play('coin');
    toast(`${friend.name} sent you a ${PM.FOODS[k].name.toLowerCase()}!`, 2600);
    if (s.hatched && !s.asleep) pet.say('Thank you!', 1.6);
    if (!els.tray.hidden) renderTray();
    save();
  }

  /* friends sheet */

  function openFriends() {
    A.play('click');
    if (!s || needsPet()) return;
    $('fr-error').hidden = true;
    renderFriends();
    openSheet(els.friendsSheet);
  }

  function renderFriends() {
    const st = PM.online.state;
    const on = !!friend;
    const waiting = !on && st !== 'off';
    $('fr-off').hidden = on || waiting;
    $('fr-wait').hidden = !waiting;
    $('fr-on').hidden = !on;
    if (waiting) {
      const joining = PM.online.role === 'guest';
      $('fr-label').textContent = joining ? 'Joining playdate' : 'Your playdate code';
      $('fr-mycode').textContent = st === 'starting' ? '\u00b7\u00b7\u00b7\u00b7\u00b7' : PM.online.code;
      $('fr-status').textContent = st === 'starting' ? 'Getting a code...'
        : joining ? 'Knocking on your friend\u2019s door...'
          : st === 'connected' ? 'Saying hello...' : 'Read this code to your friend. Waiting for them to join...';
    }
    if (on) {
      $('fr-avatar').src = friend.avatar;
      $('fr-name').textContent = friend.name;
      $('fr-sub').textContent = `Level ${friend.level}${friend.owner ? ` \u00b7 ${friend.owner}\u2019s pet` : ''}`;
      const box = $('fr-snacks');
      box.innerHTML = '';
      const have = Object.keys(PM.FOODS).filter((k) => s.inv[k] > 0);
      if (!have.length) {
        box.innerHTML = '<p class="fr-none">No snacks to share. Buy some in the shop.</p>';
      }
      have.forEach((k) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'fr-snack';
        b.setAttribute('aria-label', `Send a ${PM.FOODS[k].name}. You have ${s.inv[k]}.`);
        b.innerHTML = `<img alt="" src="${icons.food[k]}"><span class="count">${s.inv[k]}</span>`;
        b.addEventListener('click', () => giftSnack(k));
        box.appendChild(b);
      });
      $('fr-duel').disabled = !!duel && duel.state !== 'done';
      $('fr-duel').textContent = duel && duel.state === 'inviting' ? 'Waiting for an answer...' : 'Bubble Pop duel';
    }
  }

  function friendError(msg) {
    A.play('no');
    const el = $('fr-error');
    el.textContent = msg;
    el.hidden = false;
    renderFriends();
    if (els.friendsSheet.hidden) toast(msg, 3400);
  }

  /* online Bubble Pop duel */

  function inviteDuel() {
    if (!friend || (duel && duel.state !== 'done')) return;
    if (s.asleep) { toast(`Wake ${s.name} up first.`); return; }
    duel = { state: 'inviting', name: friend.name };
    PM.online.send({ t: 'duel', a: 'invite' });
    A.play('click');
    closeSheets();
    toast(`Challenge sent! Waiting for ${friend.name}...`, 3000);
    const mine = duel;
    setTimeout(() => {
      if (duel === mine && duel.state === 'inviting') {
        duel = null;
        toast('No answer. Try again in a bit.');
        renderFriends();
      }
    }, 20000);
  }

  function answerDuel(yes) {
    els.invite.hidden = true;
    A.play('click');
    if (!duel || duel.state !== 'invited') { updateUI(); return; }
    if (yes) {
      duel.state = 'accepted';
      PM.online.send({ t: 'duel', a: 'accept' });
      const mine = duel;
      setTimeout(() => {
        if (duel === mine && duel.state === 'accepted') {
          duel = null;
          toast('The duel didn\u2019t start. Try again in a bit.');
          renderFriends();
        }
      }, 6000);
    } else {
      duel = null;
      PM.online.send({ t: 'duel', a: 'decline' });
    }
    updateUI();
  }

  function onDuelMessage(m) {
    switch (m.a) {
      case 'invite': {
        const free = (mode === 'home' || mode === 'gameover') && !s.asleep && els.scrim.hidden;
        if (duel && duel.state === 'inviting') {
          // both asked at once: the host starts it
          if (PM.online.role === 'host') beginDuel();
          return;
        }
        if (!free || (duel && duel.state !== 'done')) { PM.online.send({ t: 'duel', a: 'busy' }); return; }
        duel = { state: 'invited', name: friend.name };
        const asked = duel;
        setTimeout(() => {
          // the inviter stops waiting after 20 seconds, so the card goes too
          if (duel === asked && duel.state === 'invited') {
            duel = null;
            els.invite.hidden = true;
            updateUI();
          }
        }, 19000);
        $('invite-text').textContent = `${friend.name} wants a Bubble Pop duel! Whoever pops more in 30 seconds wins.`;
        closeTray();
        els.arcade.hidden = true;
        els.invite.hidden = false;
        A.play('ding');
        A.buzz([20, 40, 20]);
        updateUI();
        break;
      }
      case 'accept':
        if (duel && duel.state === 'inviting') beginDuel();
        break;
      case 'decline':
      case 'busy':
        if (duel && duel.state === 'inviting') {
          duel = null;
          toast(m.a === 'busy' ? `${friend.name} is busy right now.` : `${friend.name} said not now.`);
          renderFriends();
        }
        break;
      case 'start':
        if (duel && (duel.state === 'accepted' || duel.state === 'inviting')) playDuel(Number(m.seed) >>> 0);
        break;
      case 'score':
        if (duel) duel.theirs = Math.max(0, Math.min(99999, Math.floor(Number(m.s)) || 0));
        break;
      case 'end':
        if (duel) {
          duel.theirs = Math.max(0, Math.min(99999, Math.floor(Number(m.s)) || 0));
          duel.theirFinal = duel.theirs;
          if (duel.state === 'waiting') showDuelResult();
        }
        break;
      default:
        break;
    }
  }

  // The host picks the bubbles (a seed) and both phones start together.
  function beginDuel() {
    const seed = (Math.floor(Math.random() * 0x7fffffff) + 1) >>> 0;
    PM.online.send({ t: 'duel', a: 'start', seed });
    playDuel(seed);
  }

  function playDuel(seed) {
    duel = {
      state: 'playing', name: friend ? friend.name : duel.name, seed,
      theirs: 0, theirFinal: null, mine: 0, sendT: 0, coins: 0, left: false, timer: 0,
    };
    mode = 'home';
    startGame('online', { seed });
    if (mode !== 'game') duel = null;
  }

  function endOnline() {
    const score = game.score;
    const coins = game.coins * 2 + Math.floor(score / 6);
    s.coins += coins;
    s.stats.fun = M.clamp(s.stats.fun + Math.min(28, 6 + score * 0.5));
    s.stats.energy = M.clamp(s.stats.energy - 6);
    s.stats.hunger = M.clamp(s.stats.hunger - 4);
    if (!duel) duel = { name: 'Friend', theirs: 0, theirFinal: null, left: true };
    duel.state = 'waiting';
    duel.mine = score;
    duel.coins = coins;
    PM.online.send({ t: 'duel', a: 'end', s: score });
    $('go-title').textContent = 'Time!';
    $('go-score-label').textContent = 'You';
    $('go-score').textContent = score;
    $('go-best-label').textContent = duel.name;
    $('go-best').textContent = '...';
    $('go-coins').textContent = `+${coins}`;
    $('go-note').textContent = `Waiting for ${duel.name}'s score...`;
    $('go-again').textContent = 'Rematch';
    els.over.hidden = false;
    if (coins > 0) bumpCoins();
    track('bubbles', game.popped);
    track('arcade');
    gainXP(4 + Math.min(30, score * 0.3));
    if (duel.theirFinal !== null || duel.left || !friend) showDuelResult();
    else duel.timer = setTimeout(showDuelResult, 5000);
    save();
    updateUI();
  }

  function showDuelResult() {
    if (!duel || duel.state !== 'waiting') return;
    clearTimeout(duel.timer);
    duel.state = 'done';
    const them = duel.theirs;
    const won = duel.mine > them;
    const tie = duel.mine === them;
    const bonus = won ? 20 : tie ? 5 : 0;
    s.coins += bonus;
    if (won) {
      s.counts.duelsWon += 1;
      A.play('levelup');
      game.fx.confetti(W / 2, H * 0.3, 60);
    } else {
      A.play(tie ? 'coin' : 'gameover');
    }
    if (bonus) bumpCoins();
    $('go-title').textContent = won ? 'You win!' : tie ? 'It\u2019s a tie!' : `${duel.name} wins!`;
    $('go-best').textContent = them;
    $('go-coins').textContent = `+${duel.coins + bonus}`;
    let note = won ? `Champion! +${bonus} bonus coins.` : tie ? 'Neck and neck! +5 bonus coins.' : 'So close! Try a rematch.';
    if (duel.left) note += ` ${duel.name} left the playdate.`;
    $('go-note').textContent = note;
    $('go-again').textContent = friend ? 'Rematch' : 'Play again';
    if (mode !== 'gameover') {
      // already left the results screen: just say who won
      toast(`${$('go-title').textContent} ${note}`, 3400);
      duel = null;
    }
    save();
    updateUI();
  }

  function playAgain() {
    if (gameKind !== 'online') { startGame(gameKind); return; }
    if (!friend) { startGame('bubbles'); return; }
    leaveGame();
    duel = null;
    inviteDuel();
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
    if (deathKeep) { Object.assign(s, deathKeep); deathKeep = null; }
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

  // The pet died of neglect: a gentle stop before a new one arrives. Coins,
  // stickers and everything else collected stay — only the pet itself is new.
  function showMemorial() {
    if (!s) return;
    PM.host.notify.cancel();
    if (friend || PM.online.state !== 'off') leavePlaydate();
    closeSheets();
    closeTray();
    mode = 'home';
    els.arcade.hidden = true;
    els.over.hidden = true;
    els.hud.hidden = true;
    els.banner.hidden = true;
    const days = Math.max(1, Math.round((Date.now() - s.born) / 86400000));
    $('mem-name').textContent = s.name;
    $('mem-days').textContent = `${days} day${days === 1 ? '' : 's'}`;
    els.memorial.hidden = false;
  }

  function continueAfterDeath() {
    if (!s) return;
    deathKeep = {
      coins: s.coins, xp: s.xp, hats: s.hats.slice(), outfits: s.outfits.slice(),
      walls: s.walls.slice(), stickers: s.stickers.slice(), login: s.login,
      owner: s.owner, counts: s.counts, weekly: s.weekly, settings: s.settings,
    };
    wipe();
    s = null;
    els.memorial.hidden = true;
    showAdopt();
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
    syncNotifyToggle();
    shownRoom = null;
    trans = null;
    ball = null;
    resize();
    syncRoom();
    updateUI();
    setTimeout(() => { if (s) dailyCheck(); }, 700);
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
    $('btn-settings').addEventListener('click', openSettings);
    $('tray-close').addEventListener('click', () => { A.play('click'); closeTray(); });
    els.bannerBtn.addEventListener('click', rinse);
    els.heal.addEventListener('click', onHeal);
    $('hud-quit').addEventListener('click', () => { if (mode === 'game') endGame(); });
    $('go-again').addEventListener('click', playAgain);
    $('play-stars').addEventListener('click', () => startGame('stars'));
    $('play-bubbles').addEventListener('click', () => startGame('bubbles'));
    $('play-match').addEventListener('click', () => startGame('match'));
    $('play-duo').addEventListener('click', () => startGame('duo'));
    $('arcade-close').addEventListener('click', () => { A.play('click'); closeArcade(); });
    els.goalsBtn.addEventListener('click', openGoals);
    document.querySelectorAll('.gtab').forEach((b) => b.addEventListener('click', () => {
      A.play('click');
      goalsTab = b.dataset.gtab;
      renderGoalsSheet();
    }));
    els.loginCollect.addEventListener('click', collectLogin);

    // playdates
    els.friendsBtn.addEventListener('click', openFriends);
    $('fr-host').addEventListener('click', () => {
      A.play('click');
      $('fr-error').hidden = true;
      PM.online.host(myProfile());
      renderFriends();
    });
    const join = () => {
      A.play('click');
      $('fr-error').hidden = true;
      $('fr-code').blur();
      PM.online.join($('fr-code').value, myProfile());
      renderFriends();
    };
    $('fr-join').addEventListener('click', join);
    $('fr-code').addEventListener('input', (e) => {
      const v = PM.online.cleanCode(e.target.value);
      if (v !== e.target.value) e.target.value = v;
    });
    $('fr-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });
    $('fr-cancel').addEventListener('click', leavePlaydate);
    $('fr-leave').addEventListener('click', leavePlaydate);
    $('fr-duel').addEventListener('click', inviteDuel);
    $('emote-wave').addEventListener('click', () => sendEmote('wave'));
    $('emote-heart').addEventListener('click', () => sendEmote('heart'));
    $('emote-dance').addEventListener('click', () => sendEmote('dance'));
    $('emote-gift').addEventListener('click', openFriends);
    $('invite-yes').addEventListener('click', () => answerDuel(true));
    $('invite-no').addEventListener('click', () => answerDuel(false));
    PM.online.on('state', () => { renderFriends(); updateUI(); });
    PM.online.on('code', renderFriends);
    PM.online.on('error', friendError);
    PM.online.on('closed', friendLeft);
    PM.online.on('message', onFriendMessage);

    // about you
    buildBirthdayPicker();
    $('owner-name').addEventListener('change', saveOwner);
    $('owner-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });
    $('owner-month').addEventListener('change', saveOwner);
    $('owner-day').addEventListener('change', saveOwner);
    // each need meter leads to the room that fills it
    meters.forEach((m) => {
      m.el.setAttribute('role', 'button');
      m.el.tabIndex = 0;
      m.el.addEventListener('click', () => followNeed(m.key));
      m.el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); followNeed(m.key); }
      });
    });
    $('go-home').addEventListener('click', leaveGame);

    els.scrim.addEventListener('click', onScrim);
    document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => { A.play('click'); closeSheets(); }));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { onScrim(); if (!els.tray.hidden) closeTray(); } });
    document.querySelectorAll('.tab[data-tab]').forEach((t) => t.addEventListener('click', () => {
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
    $('set-notify').addEventListener('change', (e) => {
      if (!s) return;
      if (!e.target.checked) {
        s.settings.notify = false;
        PM.host.notify.cancel();
        save();
        return;
      }
      A.play('click');
      e.target.checked = false; // stays off until permission actually comes back
      const r = PM.host.notify.request();
      // Android answers later via the 'notifyPermission' message; a browser
      // resolves this promise directly.
      if (r && typeof r.then === 'function') r.then((perm) => onNotifyPermission(perm === 'granted'));
    });
    PM.host.on('notifyPermission', (m) => onNotifyPermission(!!m.granted));
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
    $('btn-memorial-continue').addEventListener('click', () => { A.play('click'); continueAfterDeath(); });
    els.preview.addEventListener('pointerdown', () => {
      A.unlock();
      previewPet.hop(260);
      previewPet.setExpr('giggle', 0.7);
      A.play('giggle');
    });

    window.addEventListener('resize', () => { if (s) resize(); });
    if (window.ResizeObserver) new ResizeObserver(() => { if (s) resize(); }).observe(els.room);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) onBackground(); else onForeground();
    });
    window.addEventListener('pagehide', () => { if (s) save(); });

    // iOS only lets sound start from certain gestures, so try on each of them.
    ['touchend', 'click', 'keydown'].forEach((ev) => document.addEventListener(ev, () => A.unlock(), { passive: true }));

    PM.host.on('back', handleBack);
    PM.host.on('pause', onBackground);
    PM.host.on('resume', onForeground);
  }

  function registerServiceWorker() {
    if (PM.host.native || !('serviceWorker' in navigator) || window.top !== window) return;
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is optional */ });
  }

  function boot() {
    for (const k of Object.keys(PM.FOODS)) icons.food[k] = PM.art.foodIcon(k, 56);
    for (const k of Object.keys(PM.DRINKS)) icons.drink[k] = PM.art.drinkIcon(k, 56);
    for (const k of Object.keys(PM.HATS)) icons.hat[k] = PM.art.hatIcon(k, 60);
    for (const k of Object.keys(PM.OUTFITS)) icons.outfit[k] = PM.art.outfitIcon(k, 60);
    for (const k of Object.keys(PM.WALLS)) icons.wall[k] = PM.rooms.wallIcon(k, 60);
    icons.stickerLocked = PM.art.stickerIcon('egg', 64, true);
    wire();
    s = load();
    if (s && s.dead) showMemorial();
    else if (s) startSession();
    else showAdopt();
    requestAnimationFrame((ts) => { lastFrame = ts; frame(ts); });
    registerServiceWorker();
    // For automated tests: open the page with ?debug to reach the game state.
    if (/[?&]debug\b/.test(location.search)) {
      PM.debug = {
        get s() { return s; }, get game() { return game; }, get layout() { return layout; },
        get friend() { return friend; }, get duel() { return duel; }, pet, goRoom, dailyCheck, partyCheck,
        onBackground, onForeground, scheduleNeedNotice, tickModel, showMemorial, continueAfterDeath, save,
      };
    }
  }

  boot();
})(window.PM = window.PM || {});
