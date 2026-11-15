/* Coin Empire — an idle money tycoon.
   Tap the coin for cash, buy businesses, hire managers to run them while you're
   away, buy upgrades, catch golden coins, and cash in for investors (prestige). */
(function () {
  'use strict';
  const host = window.CE.host;
  const $ = (id) => document.getElementById(id);

  /* ---------------- data ---------------- */

  // cost: first unit, growth: price multiplier per unit, rev: profit per cycle per unit, time: seconds per cycle
  const BIZ = [
    { id: 'lemon',  name: 'Lemonade Stand', icon: '🍋', cost: 5,      growth: 1.07, rev: 1.5,    time: 0.8,  mgr: 1500 },
    { id: 'truck',  name: 'Taco Truck',     icon: '🌮', cost: 70,     growth: 1.15, rev: 25,     time: 2.5,  mgr: 20e3 },
    { id: 'coffee', name: 'Coffee Shop',    icon: '☕', cost: 900,    growth: 1.14, rev: 260,    time: 5,    mgr: 150e3 },
    { id: 'bakery', name: 'Bakery',         icon: '🥐', cost: 11e3,   growth: 1.13, rev: 2600,   time: 10,   mgr: 800e3 },
    { id: 'gym',    name: 'Gym',            icon: '🏋️', cost: 140e3,  growth: 1.12, rev: 30e3,   time: 20,   mgr: 5e6 },
    { id: 'studio', name: 'Game Studio',    icon: '🎮', cost: 1.8e6,  growth: 1.11, rev: 380e3,  time: 45,   mgr: 40e6 },
    { id: 'hotel',  name: 'Hotel',          icon: '🏨', cost: 25e6,   growth: 1.10, rev: 5e6,    time: 100,  mgr: 400e6 },
    { id: 'air',    name: 'Airline',        icon: '✈️', cost: 350e6,  growth: 1.09, rev: 70e6,   time: 240,  mgr: 4e9 },
    { id: 'bank',   name: 'Bank',           icon: '🏦', cost: 5e9,    growth: 1.08, rev: 1.1e9,  time: 600,  mgr: 50e9 },
    { id: 'space',  name: 'Space Mining',   icon: '🚀', cost: 80e9,   growth: 1.07, rev: 25e9,   time: 1500, mgr: 800e9 },
  ];
  const MGR_NAMES = ['Lily', 'Tomás', 'Bea', 'Pierre', 'Max', 'Kai', 'Rosa', 'Amelia', 'Victor', 'Nova'];
  const MILESTONES = [10, 25, 50, 100, 150, 200, 250, 300, 400, 500, 600, 700, 800, 900, 1000];

  const UPG = [];
  [50, 2500, 100e3, 5e6, 500e6, 50e9, 5e12, 500e12].forEach((cost, i) =>
    UPG.push({ id: 'tap' + i, icon: '👆', name: ['Strong Finger', 'Iron Finger', 'Golden Finger', 'Diamond Finger', 'Rocket Finger', 'Laser Finger', 'Cosmic Finger', 'Infinity Finger'][i], desc: 'Tap value ×3', cost, kind: 'tap', x: 3 }));
  [[20e3, 0.02], [20e6, 0.03], [20e9, 0.05]].forEach(([cost, pct], i) =>
    UPG.push({ id: 'smart' + i, icon: '🧠', name: ['Smart Taps', 'Genius Taps', 'Mastermind Taps'][i], desc: `Each tap also earns ${pct * 100}% of your income/sec`, cost, kind: 'smart', x: pct }));
  BIZ.forEach((b, bi) => {
    [500, 2e5, 1e8, 5e10].forEach((m, k) =>
      UPG.push({ id: b.id + 'x' + k, icon: b.icon, name: `${b.name} ${['Makeover', 'Franchise', 'Monopoly', 'Galaxy Brand'][k]}`, desc: `${b.name} profit ×3`, cost: b.cost * m, kind: 'biz', i: bi, x: 3 }));
  });
  [1e6, 1e9, 1e12, 1e15, 1e18].forEach((cost, i) =>
    UPG.push({ id: 'all' + i, icon: '📈', name: ['Marketing Blitz', 'TV Ads', 'Worldwide Fame', 'Stock Split', 'Universe Domination'][i], desc: 'All profits ×2', cost, kind: 'all', x: 2 }));
  UPG.sort((a, b) => a.cost - b.cost);

  // Vodka: each shot adds a level of drunk (max 5). Taps earn ×(1 + level),
  // but the screen sways and some taps miss. A shot at level 5 = pass out.
  const MOODS = [
    { face: '😐', name: 'Sober',   sway: 0,   blur: 0,   dbl: 0,  dur: 3,   hue: 0,  miss: 0 },
    { face: '🙂', name: 'Tipsy',   sway: 1,   blur: 0,   dbl: 2,  dur: 4,   hue: 0,  miss: 0 },
    { face: '😊', name: 'Buzzed',  sway: 2,   blur: 0,   dbl: 4,  dur: 3.2, hue: 8,  miss: 0.05 },
    { face: '🥴', name: 'Drunk',   sway: 3.5, blur: 0.3, dbl: 6,  dur: 2.6, hue: 18, miss: 0.12 },
    { face: '😵‍💫', name: 'Wasted',  sway: 5,   blur: 0.7, dbl: 9,  dur: 2.2, hue: 30, miss: 0.2 },
    { face: '🤪', name: 'Smashed', sway: 7,   blur: 1.1, dbl: 12, dur: 1.8, hue: 45, miss: 0.3 },
  ];
  const SOBER_UP = 20;        // seconds per drunk level
  const HANGOVER = 30000;     // ms

  const STAR_BONUS = 0.1;          // +10% profit per investor
  const OFFLINE_CAP = 12 * 3600;   // seconds
  const SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc', 'Ud', 'Dd', 'Td', 'Qad', 'Qid', 'Sxd', 'Spd', 'Ocd', 'Nod', 'Vg'];

  /* ---------------- state ---------------- */

  function fresh(keep) {
    return {
      v: 1,
      money: 0,
      runEarned: 0,
      allTime: keep ? keep.allTime : 0,
      stars: keep ? keep.stars : 0,
      resets: keep ? keep.resets : 0,
      taps: keep ? keep.taps : 0,
      goldens: keep ? keep.goldens : 0,
      biz: BIZ.map((b, i) => ({ n: i === 0 ? 1 : 0, mgr: false, t: 0, run: false })),
      upg: {},
      boostUntil: 0,
      last: Date.now(),
      sound: keep ? keep.sound : true,
      vibe: keep ? keep.vibe : true,
      mode: keep ? keep.mode : '1',
      wobble: keep ? keep.wobble : true,
      shots: keep ? keep.shots : 0,
      drunk: 0,
      hangoverUntil: 0,
    };
  }

  let S = fresh();
  try {
    const raw = host.load();
    if (raw) {
      const d = JSON.parse(raw);
      if (d && d.v === 1) {
        S = Object.assign(fresh(), d);
        S.biz = BIZ.map((b, i) => Object.assign({ n: 0, mgr: false, t: 0, run: false }, d.biz && d.biz[i]));
      }
    }
  } catch (e) { /* start fresh */ }

  function save() {
    S.last = Date.now();
    host.write(JSON.stringify(S));
  }

  /* ---------------- numbers ---------------- */

  function fmt(x) {
    if (!isFinite(x)) return '∞';
    if (x < 1000) {
      if (x >= 100) return String(Math.floor(x));
      const s = x.toFixed(2);
      return s.endsWith('.00') ? s.slice(0, -3) : s;
    }
    let e = Math.floor(Math.log10(x) / 3);
    let v = x / Math.pow(10, e * 3);
    let s = v.toFixed(v < 10 ? 2 : v < 100 ? 1 : 0);
    if (parseFloat(s) >= 1000) { e++; v /= 1000; s = v.toFixed(2); }
    if (e >= SUFFIX.length) return x.toExponential(2).replace('+', '');
    return s + SUFFIX[e];
  }
  const money = (x) => '$' + fmt(x);

  function fmtTime(s) {
    if (s < 10) return s.toFixed(1) + 's';
    if (s < 60) return Math.ceil(s) + 's';
    if (s < 3600) return Math.floor(s / 60) + 'm ' + Math.floor(s % 60) + 's';
    return Math.floor(s / 3600) + 'h ' + Math.floor((s % 3600) / 60) + 'm';
  }

  /* ---------------- economy ---------------- */

  const boosted = () => Date.now() < S.boostUntil;
  const starMult = () => 1 + STAR_BONUS * S.stars;

  function milestonesHit(n) { let k = 0; for (const m of MILESTONES) if (n >= m) k++; return k; }
  function nextMilestone(n) { for (const m of MILESTONES) if (n < m) return m; return null; }
  function prevMilestone(n) { let p = 0; for (const m of MILESTONES) if (n >= m) p = m; return p; }

  function allMult() {
    let m = starMult();
    for (const u of UPG) if (S.upg[u.id] && u.kind === 'all') m *= u.x;
    return m;
  }
  function bizMult(i) {
    let m = Math.pow(2, milestonesHit(S.biz[i].n));
    for (const u of UPG) if (S.upg[u.id] && u.kind === 'biz' && u.i === i) m *= u.x;
    return m;
  }
  function profit(i, withBoost = true) {
    const st = S.biz[i];
    return BIZ[i].rev * st.n * bizMult(i) * allMult() * (withBoost && boosted() ? 7 : 1);
  }
  function incomePerSec(withBoost = true, managedOnly = true) {
    let sum = 0;
    S.biz.forEach((st, i) => { if (st.n > 0 && (st.mgr || !managedOnly)) sum += profit(i, withBoost) / BIZ[i].time; });
    return sum;
  }
  const drunkLevel = () => Math.min(5, Math.ceil(S.drunk - 1e-6));
  const hungover = () => Date.now() < S.hangoverUntil;
  function drunkMult() { return hungover() ? 0.25 : 1 + drunkLevel(); }
  function tapValue(withDrunk = true) {
    let v = 1;
    let pct = 0;
    for (const u of UPG) if (S.upg[u.id]) { if (u.kind === 'tap') v *= u.x; if (u.kind === 'smart') pct += u.x; }
    v = v * starMult() + pct * incomePerSec(false);
    return v * (boosted() ? 7 : 1) * (withDrunk ? drunkMult() : 1);
  }
  function vodkaCost() { return Math.max(25, incomePerSec(false, false) * 15, tapValue(false) * 25); }

  function costFor(i, k) {
    const b = BIZ[i], n = S.biz[i].n;
    const r = b.growth;
    return b.cost * Math.pow(r, n) * (Math.pow(r, k) - 1) / (r - 1);
  }
  function maxAffordable(i) {
    const b = BIZ[i], n = S.biz[i].n, r = b.growth;
    const base = b.cost * Math.pow(r, n);
    const k = Math.floor(Math.log(S.money * (r - 1) / base + 1) / Math.log(r));
    return Math.max(0, k);
  }
  function buyAmount(i) {
    if (S.mode === 'max') return Math.max(1, maxAffordable(i));
    return parseInt(S.mode, 10);
  }

  function earn(x) { S.money += x; S.runEarned += x; S.allTime += x; }

  // Total investors you'd have after cashing in now.
  function starsTotal() { return Math.floor(10 * Math.sqrt(S.allTime / 1e9)); }
  function starsPending() { return Math.max(0, starsTotal() - S.stars); }

  // Advance the simulation by dt seconds. Returns money earned.
  function advance(dt) {
    let got = 0;
    if (S.drunk > 0) S.drunk = Math.max(0, S.drunk - dt / SOBER_UP);
    S.biz.forEach((st, i) => {
      if (st.n <= 0) return;
      if (st.mgr) st.run = true;
      if (!st.run) return;
      const T = BIZ[i].time;
      st.t += dt;
      if (st.t >= T) {
        if (st.mgr) {
          const cycles = Math.floor(st.t / T);
          st.t -= cycles * T;
          got += cycles * profit(i);
        } else {
          st.t = 0; st.run = false;
          got += profit(i);
        }
      }
    });
    if (got > 0) earn(got);
    return got;
  }

  /* ---------------- audio & haptics ---------------- */

  let ac = null;
  function audio() {
    if (!S.sound) return null;
    if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }
  function tone(freq, dur, type = 'sine', vol = 0.12, delay = 0) {
    const a = audio(); if (!a) return;
    const t = a.currentTime + delay;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  const sfx = {
    tap: () => tone(900 + Math.random() * 160, 0.07, 'triangle', 0.08),
    buy: () => { tone(660, 0.08, 'square', 0.05); tone(990, 0.12, 'square', 0.05, 0.07); },
    cash: () => { tone(1320, 0.06, 'triangle', 0.06); tone(1760, 0.1, 'triangle', 0.06, 0.05); },
    glug: () => [420, 360, 300, 250].forEach((f, k) => tone(f, 0.09, 'sine', 0.1, k * 0.08)),
    hic: () => { tone(700, 0.04, 'square', 0.04); tone(1100, 0.06, 'triangle', 0.06, 0.04); },
    passout: () => [400, 320, 240, 160, 90].forEach((f, k) => tone(f, 0.25, 'sawtooth', 0.05, k * 0.15)),
    gold: () => [523, 659, 784, 1047, 1319].forEach((f, k) => tone(f, 0.18, 'triangle', 0.09, k * 0.07)),
    no: () => tone(180, 0.15, 'sawtooth', 0.05),
  };
  const buzz = (ms) => { if (S.vibe) host.haptic(ms); };

  /* ---------------- effects ---------------- */

  const appEl = $('app'), fx = $('fx');
  function floatText(text, x, y, color, cls) {
    const el = document.createElement('div');
    el.className = 'float' + (cls ? ' ' + cls : ''); el.textContent = text;
    el.style.left = x + 'px'; el.style.top = (y - 20) + 'px';
    if (color) el.style.color = color;
    fx.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }
  function sparks(x, y, n = 6) {
    for (let k = 0; k < n; k++) {
      const el = document.createElement('div');
      el.className = 'spark';
      const a = Math.random() * Math.PI * 2, d = 40 + Math.random() * 50;
      el.style.left = (x - 5) + 'px'; el.style.top = (y - 5) + 'px';
      el.style.setProperty('--dx', Math.cos(a) * d + 'px');
      el.style.setProperty('--dy', Math.sin(a) * d + 'px');
      fx.appendChild(el);
      setTimeout(() => el.remove(), 600);
    }
  }
  function localPoint(e) {
    const r = appEl.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function centerOf(el) {
    const r = el.getBoundingClientRect(), a = appEl.getBoundingClientRect();
    return { x: r.left - a.left + r.width / 2, y: r.top - a.top + r.height / 2 };
  }

  let toastTimer = 0;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg; t.classList.remove('hidden');
    t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), 2200);
  }

  /* ---------------- modal ---------------- */

  let modalOpen = false, tab = 'biz';
  function syncOverlay() { host.overlay(modalOpen || tab !== 'biz'); }
  function openModal(html, wire) {
    $('modalCard').innerHTML = html;
    $('modal').classList.remove('hidden');
    modalOpen = true; syncOverlay();
    if (wire) wire($('modalCard'));
  }
  function closeModal() {
    $('modal').classList.add('hidden');
    modalOpen = false; syncOverlay();
  }
  $('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });

  /* ---------------- tapping ---------------- */

  const coin = $('coin');
  coin.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const p = localPoint(e);
    coin.classList.add('hit'); setTimeout(() => coin.classList.remove('hit'), 70);
    if (!hungover() && Math.random() < MOODS[drunkLevel()].miss) {
      floatText(['missed!', 'whoops', 'oops!', 'huh?'][Math.floor(Math.random() * 4)], p.x + (Math.random() * 60 - 30), p.y, null, 'miss');
      tone(240, 0.06, 'sine', 0.05);
      return;
    }
    const v = tapValue();
    earn(v); S.taps++;
    floatText('+' + money(v), p.x + (Math.random() * 30 - 15), p.y, boosted() ? '#fde047' : null);
    if (S.taps % 5 === 0) sparks(p.x, p.y, 4);
    sfx.tap(); buzz(8);
  });
  coin.addEventListener('contextmenu', (e) => e.preventDefault());

  /* ---------------- businesses panel ---------------- */

  const bizEls = [];
  function buildBiz() {
    const p = $('panel-biz');
    p.innerHTML = '';
    BIZ.forEach((b, i) => {
      const row = document.createElement('div');
      row.className = 'biz';
      row.innerHTML = `
        <div class="biz-icon">${b.icon}<span class="lvl">0</span></div>
        <div class="biz-main">
          <div class="biz-name"><span>${b.name}</span><small class="mgrTag"></small></div>
          <div class="bar"><i></i><span></span></div>
          <div class="biz-sub"><span class="tleft"></span><span class="next"></span></div>
          <div class="milestone"><i></i></div>
        </div>
        <button class="buy"><span class="bq">Buy ×1</span><b class="bc">$0</b></button>`;
      p.appendChild(row);
      const el = {
        row, icon: row.querySelector('.biz-icon'), lvl: row.querySelector('.lvl'),
        tag: row.querySelector('.mgrTag'), bar: row.querySelector('.bar'), fill: row.querySelector('.bar i'),
        barText: row.querySelector('.bar span'), tleft: row.querySelector('.tleft'), next: row.querySelector('.next'),
        ms: row.querySelector('.milestone i'), buy: row.querySelector('.buy'), bq: row.querySelector('.bq'), bc: row.querySelector('.bc'),
      };
      bizEls.push(el);
      el.buy.addEventListener('click', (e) => { e.stopPropagation(); buyBiz(i); });
      row.addEventListener('click', () => runBiz(i));
    });
  }

  function runBiz(i) {
    const st = S.biz[i];
    if (st.n <= 0 || st.run) return;
    st.run = true; st.t = 0;
    tone(520, 0.06, 'triangle', 0.06); buzz(6);
  }

  function buyBiz(i) {
    const k = buyAmount(i);
    const c = costFor(i, k);
    if (S.money < c) { sfx.no(); return; }
    const before = milestonesHit(S.biz[i].n);
    S.money -= c;
    S.biz[i].n += k;
    sfx.buy(); buzz(14);
    const p = centerOf(bizEls[i].buy);
    sparks(p.x, p.y, 5);
    const after = milestonesHit(S.biz[i].n);
    if (S.biz[i].n === k) toast(`${BIZ[i].icon} ${BIZ[i].name} opened! Tap it to make money.`);
    else if (after > before) toast(`${BIZ[i].icon} ${BIZ[i].name} profit ×${Math.pow(2, after - before)}!`);
    refreshShops();
  }

  /* ---------------- managers panel ---------------- */

  function buildMgr() {
    const p = $('panel-mgr');
    let html = '<p class="hint">Managers run a business for you, non-stop — even while the app is closed.</p>';
    BIZ.forEach((b, i) => {
      const st = S.biz[i];
      html += `<div class="row ${st.mgr ? 'done' : ''}" data-i="${i}">
        <div class="ico">${st.mgr ? '🧑‍💼' : b.icon}</div>
        <div class="txt"><b>${MGR_NAMES[i]}</b><small>Runs your ${b.name}${st.n ? '' : ' (buy one first)'}</small></div>
        ${st.mgr ? '<div class="buy"><b>Hired ✓</b></div>' : `<button class="buy" data-mgr="${i}"><span>Hire</span><b>${money(b.mgr)}</b></button>`}
      </div>`;
    });
    p.innerHTML = html;
    p.querySelectorAll('[data-mgr]').forEach((btn) => btn.addEventListener('click', () => hire(+btn.dataset.mgr)));
  }
  function hire(i) {
    const b = BIZ[i];
    if (S.biz[i].mgr || S.money < b.mgr || S.biz[i].n <= 0) { sfx.no(); if (S.biz[i].n <= 0) toast(`Buy a ${b.name} first`); return; }
    S.money -= b.mgr; S.biz[i].mgr = true; S.biz[i].run = true;
    sfx.cash(); buzz([0, 20, 60, 20]);
    toast(`${MGR_NAMES[i]} now runs your ${b.name}!`);
    refreshShops();
  }

  /* ---------------- upgrades panel ---------------- */

  function buildUpg() {
    const p = $('panel-upg');
    const open = UPG.filter((u) => !S.upg[u.id]).slice(0, 15);
    const bought = UPG.length - UPG.filter((u) => !S.upg[u.id]).length;
    let html = `<p class="hint">Upgrades multiply your profits. Bought ${bought} of ${UPG.length}.</p>`;
    open.forEach((u) => {
      html += `<div class="row"><div class="ico">${u.icon}</div>
        <div class="txt"><b>${u.name}</b><small>${u.desc}</small></div>
        <button class="buy" data-upg="${u.id}"><span>Buy</span><b>${money(u.cost)}</b></button></div>`;
    });
    if (!open.length) html += '<p class="hint">You bought every upgrade. Legend!</p>';
    p.innerHTML = html;
    p.querySelectorAll('[data-upg]').forEach((btn) => btn.addEventListener('click', () => buyUpg(btn.dataset.upg)));
  }
  function buyUpg(id) {
    const u = UPG.find((x) => x.id === id);
    if (!u || S.upg[id] || S.money < u.cost) { sfx.no(); return; }
    S.money -= u.cost; S.upg[id] = true;
    sfx.cash(); buzz([0, 20, 60, 20]);
    toast(`${u.icon} ${u.name}: ${u.desc}`);
    refreshShops();
  }

  /* ---------------- investors panel ---------------- */

  function buildInv() {
    const p = $('panel-inv');
    const pend = starsPending();
    p.innerHTML = `
      <div class="inv-card">
        <div>Your investors</div>
        <div class="inv-big">⭐ ${fmt(S.stars)}</div>
        <p>Each investor gives <b>+${STAR_BONUS * 100}%</b> profit on everything.<br>Current bonus: <b>×${fmt(starMult())}</b></p>
      </div>
      <div class="inv-card">
        <div>Investors waiting to join</div>
        <div class="inv-big" id="invPending">+${fmt(pend)}</div>
        <p>Sell your empire to bring them in. You'll start over with $0 and one lemonade stand, but keep your investors forever.</p>
        <p id="invNext"></p>
        <button class="big-btn" id="resetBtn" ${pend > 0 ? '' : 'disabled'}>Sell empire for +${fmt(pend)} ⭐</button>
      </div>
      <div class="stats">
        <div>Earned this run<b id="stRun">${money(S.runEarned)}</b></div>
        <div>Earned all-time<b id="stAll">${money(S.allTime)}</b></div>
        <div>Coin taps<b id="stTaps">${fmt(S.taps)}</b></div>
        <div>Golden coins<b>${fmt(S.goldens)}</b></div>
        <div>Times sold<b>${S.resets}</b></div>
        <div>Vodka shots<b>${fmt(S.shots)}</b></div>
        <div>Businesses owned<b>${fmt(S.biz.reduce((a, b) => a + b.n, 0))}</b></div>
      </div>`;
    $('resetBtn').addEventListener('click', confirmReset);
  }
  function confirmReset() {
    const pend = starsPending();
    if (pend <= 0) return;
    openModal(`<div class="emoji">🤝</div><h2>Sell your empire?</h2>
      <p>You'll gain <b>+${fmt(pend)} investors</b> (total ⭐ ${fmt(S.stars + pend)}, profit ×${fmt(1 + STAR_BONUS * (S.stars + pend))}).</p>
      <p>Your money, businesses, managers and upgrades reset.</p>
      <button class="big-btn" id="doReset">Sell it!</button>
      <button class="danger" id="noReset" style="color:var(--muted)">Not yet</button>`, (c) => {
      c.querySelector('#doReset').onclick = () => {
        const total = starsTotal();
        S = fresh(Object.assign({}, S, { stars: total, resets: S.resets + 1 }));
        save(); closeModal(); buildAll(); switchTab('biz');
        sfx.gold(); buzz([0, 30, 80, 30, 80, 30]);
        toast(`⭐ ${fmt(total)} investors are backing you!`);
      };
      c.querySelector('#noReset').onclick = closeModal;
    });
  }

  /* ---------------- vodka ---------------- */

  const appClass = appEl.classList;
  $('vodkaBtn').addEventListener('click', () => {
    if (hungover()) { sfx.no(); toast('🤢 Too hungover to drink. Give it a moment...'); return; }
    const c = vodkaCost();
    if (S.money < c) { sfx.no(); toast(`🍸 A shot costs ${money(c)}`); return; }
    S.money -= c; S.shots++;
    if (S.drunk > 4.5) { passOut(); return; }
    S.drunk = Math.min(5, drunkLevel() + 1);
    const m = MOODS[drunkLevel()];
    sfx.glug(); buzz(24);
    const pt = centerOf($('vodkaBtn'));
    floatText('🍸 glug!', pt.x, pt.y, '#7cc4ff');
    toast(drunkLevel() === 5
      ? `${m.face} ${m.name}! Taps ×6 — one more and you'll pass out!`
      : `${m.face} ${m.name}! Taps now earn ×${1 + drunkLevel()}`);
    applyMood();
  });

  function passOut() {
    S.drunk = 0;
    S.hangoverUntil = Date.now() + HANGOVER;
    sfx.passout(); buzz(400);
    const black = document.createElement('div');
    black.id = 'passout'; appEl.appendChild(black);
    setTimeout(() => black.remove(), 1700);
    toast('😵 You passed out! Hangover: taps ×¼ for 30s');
    applyMood();
  }

  let moodKey = '';
  function applyMood() {
    const lvl = drunkLevel(), sick = hungover();
    const m = MOODS[lvl];
    const key = lvl + '|' + sick + '|' + S.wobble;
    if (key !== moodKey) {
      moodKey = key;
      appClass.toggle('drunk', lvl > 0 && !sick && S.wobble);
      appClass.toggle('hangover', sick);
      const st = appEl.style;
      st.setProperty('--sway', m.sway); st.setProperty('--blur', m.blur);
      st.setProperty('--dbl', m.dbl); st.setProperty('--hue', m.hue);
      st.setProperty('--sway-dur', m.dur + 's');
      document.querySelectorAll('#moodPips i').forEach((pip, k) => { pip.classList.toggle('on', k < lvl); pip.classList.toggle('hot', lvl >= 4); });
    }
    $('moodFace').textContent = sick ? '🤢' : m.face;
    $('moodLabel').textContent = sick ? 'Hangover' : m.name;
    $('moodMult').textContent = sick ? `${Math.ceil((S.hangoverUntil - Date.now()) / 1000)}s · taps ×¼` : `taps ×${1 + lvl}`;
    const vb = $('vodkaBtn');
    $('vodkaCost').textContent = money(vodkaCost());
    vb.classList.toggle('can', !sick && S.money >= vodkaCost());
    vb.classList.toggle('sick', sick);
  }

  function hiccups(dt) {
    const lvl = drunkLevel();
    if (lvl < 2 || hungover() || modalOpen) return;
    if (Math.random() < dt * 0.06 * lvl) {
      const pt = centerOf(coin);
      floatText('hic!', pt.x + (Math.random() * 120 - 60), pt.y - 40, null, 'hic');
      sfx.hic(); buzz(6);
    }
  }

  /* ---------------- golden coin ---------------- */

  const golden = $('golden');
  let goldenNext = performance.now() + 30000 + Math.random() * 30000;
  let goldenGone = 0;
  function spawnGolden() {
    const r = appEl.getBoundingClientRect();
    golden.style.left = (20 + Math.random() * (r.width - 100)) + 'px';
    golden.style.top = (140 + Math.random() * (r.height - 260)) + 'px';
    golden.classList.remove('hidden');
    goldenGone = performance.now() + 9000;
  }
  golden.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    golden.classList.add('hidden');
    S.goldens++;
    const p = localPoint(e);
    sparks(p.x, p.y, 14); sfx.gold(); buzz([0, 25, 50, 25, 50, 25]);
    if (Math.random() < 0.45) {
      S.boostUntil = Date.now() + 20000;
      toast('🔥 Gold rush! Everything earns ×7 for 20s');
    } else {
      const amt = Math.max(incomePerSec(false, false) * 90, tapValue() * 60, 50);
      earn(amt);
      floatText('+' + money(amt), p.x, p.y, '#fde047');
      toast(`🪙 Lucky find: ${money(amt)}!`);
    }
    goldenNext = performance.now() + 45000 + Math.random() * 60000;
  });

  /* ---------------- tabs & buy mode ---------------- */

  function switchTab(t) {
    tab = t;
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === t));
    document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.id === 'panel-' + t));
    $('buyModeRow').classList.toggle('hidden', t !== 'biz');
    if (t === 'mgr') buildMgr();
    if (t === 'upg') buildUpg();
    if (t === 'inv') buildInv();
    syncOverlay();
  }
  document.querySelectorAll('#tabs button').forEach((b) => b.addEventListener('click', () => { switchTab(b.dataset.tab); buzz(5); }));

  function setMode(m) {
    S.mode = m;
    document.querySelectorAll('#buyModeRow .mode').forEach((b) => b.classList.toggle('active', b.dataset.mode === m));
  }
  document.querySelectorAll('#buyModeRow .mode').forEach((b) => b.addEventListener('click', () => { setMode(b.dataset.mode); buzz(5); }));

  function refreshShops() {
    if (tab === 'mgr') buildMgr();
    if (tab === 'upg') buildUpg();
    if (tab === 'inv') buildInv();
    updateText();
  }

  /* ---------------- settings ---------------- */

  $('settingsBtn').addEventListener('click', () => {
    openModal(`<h2>Settings</h2>
      <div class="opt"><span>🔊 Sound</span><button class="toggle ${S.sound ? 'on' : ''}" id="tSound"></button></div>
      <div class="opt"><span>📳 Vibration</span><button class="toggle ${S.vibe ? 'on' : ''}" id="tVibe"></button></div>
      <div class="opt"><span>🥴 Drunk wobble</span><button class="toggle ${S.wobble ? 'on' : ''}" id="tWobble"></button></div>
      <p style="margin-top:14px">Tap the coin, buy businesses, hire managers so they run on their own, catch the 🪙 golden coins, and down a 🍸 vodka for bigger taps (but don't overdo it). When you've earned a lot, sell your empire for investors.</p>
      <button class="big-btn gold" id="closeSet">Done</button>
      <button class="danger" id="wipe">Delete all progress</button>`, (c) => {
      c.querySelector('#tSound').onclick = (e) => { S.sound = !S.sound; e.target.classList.toggle('on', S.sound); };
      c.querySelector('#tWobble').onclick = (e) => { S.wobble = !S.wobble; e.target.classList.toggle('on', S.wobble); applyMood(); };
      c.querySelector('#tVibe').onclick = (e) => { S.vibe = !S.vibe; e.target.classList.toggle('on', S.vibe); buzz(20); };
      c.querySelector('#closeSet').onclick = () => { save(); closeModal(); };
      c.querySelector('#wipe').onclick = () => {
        if (!confirm('Delete everything, including investors? This cannot be undone.')) return;
        host.clear(); S = fresh(); save(); closeModal(); buildAll(); switchTab('biz');
      };
    });
  });

  /* ---------------- render loop ---------------- */

  function updateText() {
    $('money').textContent = money(S.money);
    $('rate').textContent = money(incomePerSec()) + ' / sec';
    $('starsVal').textContent = fmt(S.stars);
    $('tapVal').textContent = money(tapValue());
    applyMood();

    S.biz.forEach((st, i) => {
      const el = bizEls[i], b = BIZ[i];
      const k = buyAmount(i), c = costFor(i, k);
      const can = S.money >= c;
      el.row.classList.toggle('locked', st.n === 0);
      el.row.classList.toggle('affordable', st.n === 0 && can);
      el.lvl.textContent = st.n;
      el.bq.textContent = st.n === 0 ? 'Unlock' : 'Buy ×' + k;
      el.bc.textContent = money(c);
      el.buy.classList.toggle('can', can);
      el.tag.textContent = st.mgr ? '🧑‍💼 ' + MGR_NAMES[i] : '';
      if (st.n === 0) {
        el.barText.textContent = 'Earns ' + money(b.rev * bizMult(i) * allMult()) + ' / ' + fmtTime(b.time);
        el.tleft.textContent = ''; el.next.textContent = '';
      } else {
        el.barText.textContent = money(profit(i));
        const left = st.run ? Math.max(0, b.time - st.t) : b.time;
        el.tleft.textContent = st.mgr ? '⏱ ' + fmtTime(left) : st.run ? '⏱ ' + fmtTime(left) : '👆 Tap to run · ' + fmtTime(b.time);
        const nm = nextMilestone(st.n);
        el.next.textContent = nm ? `×2 profit at ${nm}` : 'Max milestones!';
      }
      const nm = nextMilestone(st.n), pm = prevMilestone(st.n);
      el.ms.style.transform = `scaleX(${nm ? (st.n - pm) / (nm - pm) : 1})`;
    });

    $('mgrDot').classList.toggle('hidden', !S.biz.some((st, i) => st.n > 0 && !st.mgr && S.money >= BIZ[i].mgr));
    $('upgDot').classList.toggle('hidden', !UPG.some((u) => !S.upg[u.id] && S.money >= u.cost));
    const pend = starsPending();
    $('invDot').classList.toggle('hidden', !(pend >= Math.max(1, S.stars)));

    if (tab === 'mgr') $('panel-mgr').querySelectorAll('[data-mgr]').forEach((btn) => btn.classList.toggle('can', S.money >= BIZ[+btn.dataset.mgr].mgr && S.biz[+btn.dataset.mgr].n > 0));
    if (tab === 'upg') $('panel-upg').querySelectorAll('[data-upg]').forEach((btn) => btn.classList.toggle('can', S.money >= UPG.find((u) => u.id === btn.dataset.upg).cost));
    if (tab === 'inv') {
      const ip = $('invPending'); if (ip) ip.textContent = '+' + fmt(pend);
      const rb = $('resetBtn'); if (rb) { rb.disabled = pend <= 0; rb.textContent = `Sell empire for +${fmt(pend)} ⭐`; }
      const nx = $('invNext');
      if (nx) { const need = Math.pow((starsTotal() + 1) / 10, 2) * 1e9; nx.textContent = `Next investor at ${money(need)} earned all-time.`; }
      const r = $('stRun'); if (r) r.textContent = money(S.runEarned);
      const a = $('stAll'); if (a) a.textContent = money(S.allTime);
      const tp = $('stTaps'); if (tp) tp.textContent = fmt(S.taps);
    }
  }

  function updateBars() {
    S.biz.forEach((st, i) => {
      const el = bizEls[i], T = BIZ[i].time;
      const fast = st.mgr && T < 0.35;
      el.bar.classList.toggle('full', fast);
      el.fill.style.transform = `scaleX(${fast ? 1 : st.n && st.run ? Math.min(1, st.t / T) : 0})`;
      el.icon.classList.toggle('ready', st.n > 0 && !st.run && !st.mgr);
    });
    const left = S.boostUntil - Date.now();
    const bb = $('boostBar');
    if (left > 0) {
      bb.classList.remove('hidden');
      $('boostText').textContent = `🔥 Gold rush ×7 · ${Math.ceil(left / 1000)}s`;
      $('boostFill').style.transform = `scaleX(${left / 20000})`;
    } else bb.classList.add('hidden');
  }

  function welcomeBack(secs, got) {
    if (got <= 0 || secs < 60 || modalOpen) return;
    openModal(`<div class="emoji">💼</div><h2>Welcome back!</h2>
      <p>Your managers kept working for ${fmtTime(secs)}${secs >= OFFLINE_CAP ? ' (the most they can do)' : ''}.</p>
      <div class="amount">+${money(got)}</div>
      <button class="big-btn gold" id="wbOk">Collect</button>`, (c) => {
      c.querySelector('#wbOk').onclick = () => { closeModal(); sfx.cash(); buzz([0, 20, 60, 20]); };
    });
  }

  // Catch up for time spent away. The gold rush doesn't apply to it.
  function catchUp(secs) {
    if (secs <= 0) return 0;
    const capped = Math.min(secs, OFFLINE_CAP);
    const saveBoost = S.boostUntil;
    if (secs > 5) S.boostUntil = 0;
    const got = advance(capped);
    if (secs > 5) S.boostUntil = saveBoost;
    return got;
  }

  // Time is measured on the wall clock, so a long gap (app paused, phone
  // asleep, tab hidden) is caught up here exactly once.
  let lastWall = Date.now(), lastText = 0, lastSave = performance.now();
  function frame(now) {
    const wall = Date.now();
    const dt = Math.max(0, (wall - lastWall) / 1000);
    lastWall = wall;
    if (dt > 5) {
      const got = catchUp(dt);
      welcomeBack(dt, got);
    } else {
      advance(dt);
    }
    updateBars();
    if (dt <= 5) hiccups(dt);
    if (now - lastText > 100) { updateText(); lastText = now; }
    if (now - lastSave > 5000) { save(); lastSave = now; }
    if (golden.classList.contains('hidden')) { if (now > goldenNext && !modalOpen) spawnGolden(); }
    else if (now > goldenGone) { golden.classList.add('hidden'); goldenNext = now + 40000 + Math.random() * 50000; }
    requestAnimationFrame(frame);
  }

  /* ---------------- host lifecycle ---------------- */

  host.on('pause', () => save());
  host.on('back', () => {
    if (modalOpen) closeModal();
    else if (tab !== 'biz') switchTab('biz');
  });

  /* ---------------- start ---------------- */

  function buildAll() {
    bizEls.length = 0;
    buildBiz(); setMode(S.mode);
    updateText(); updateBars();
  }

  buildAll();
  const away = (Date.now() - S.last) / 1000;
  const gotAway = catchUp(away);
  if (gotAway > 0) welcomeBack(away, gotAway);
  else if (S.allTime === 0) {
    openModal(`<div class="emoji">💰</div><h2>Coin Empire</h2>
      <p>Tap the big coin to earn cash. Buy businesses, tap them to make profit, then hire managers so they run by themselves — even while you're away.</p>
      <p>Grow from a lemonade stand to space mining!</p>
      <button class="big-btn gold" id="go">Let's get rich</button>`, (c) => { c.querySelector('#go').onclick = () => { closeModal(); audio(); }; });
  }
  save();
  requestAnimationFrame(frame);
})();
