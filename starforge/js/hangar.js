/* Starforge — the hangar: build and paint your starfighter, try parts on
   before you buy them, buy upgrades, and launch. */
(function (SF) {
  'use strict';

  const U = SF.util;
  const P = SF.parts;
  const A = SF.audio;
  const Wp = SF.weapons;
  const ART = SF.art.ART;
  const BOX = SF.art.SHIP_BOX;
  const prof = SF.profile;
  const $ = (id) => document.getElementById(id);

  const els = {
    screen: $('hangar'), credits: $('credits'), creditsBox: $('credits-box'),
    preview: $('preview'), name: $('ship-name-text'), nameBtn: $('ship-name'), records: $('records'),
    tabs: $('tabs'), panel: $('panel'), detail: $('detail'), dName: $('d-name'), dDesc: $('d-desc'), dBtn: $('d-btn'),
  };
  const STAT_KEYS = ['armor', 'shield', 'speed', 'fire', 'special'];
  const statEls = {};
  for (const k of STAT_KEYS) {
    const row = document.querySelector(`.stat[data-k="${k}"]`);
    statEls[k] = { cur: row.querySelector('.cur'), delta: row.querySelector('.delta'), val: row.querySelector('.val') };
  }

  const TAB_SLOT = { hull: 'hull', wings: 'wings', engine: 'engine', weapon: 'weapon', special: 'special' };
  const UPG_ICON = {
    armor: '<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/>',
    shield: '<path d="M4 13a8 8 0 0 1 16 0M7.5 13a4.5 4.5 0 0 1 9 0"/><circle cx="12" cy="13" r="1.2"/>',
    damage: '<circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v5M12 16.5v5M2.5 12h5M16.5 12h5"/>',
    thrust: '<path d="M12 3l5 8h-3.5v4h-3v-4H7z"/><path d="M9 18l3 3.5 3-3.5"/>',
    charge: '<path d="M13 2 5 13h6l-1 9 8-11h-6z"/>',
    magnet: '<path d="M6 4v8a6 6 0 0 0 12 0V4M6 8.5h4M14 8.5h4"/>',
  };
  const CREDIT = '<span class="cr" aria-hidden="true"></span>';

  let tab = 'hull';
  let focus = null; // { slot, id }: a part being tried on
  let visible = true;

  const pv = {
    g: els.preview.getContext('2d'), w: 0, h: 0, dpr: 1, k: 1,
    bg: new SF.Starfield(), fx: new SF.Particles(300),
    sprite: null, R: null, key: '', holoT: 0, t: 0,
    shots: [], arcs: [], cool: 0, sideCool: 0, cx: 0, cy: 0,
  };

  /* ---------- Helpers ---------- */

  function previewShip() {
    const s = Object.assign({}, prof.data.ship);
    if (focus) s[focus.slot] = focus.id;
    return s;
  }

  function priceTag(price) {
    return `${CREDIT}${U.fmt(price)}`;
  }

  function miniShip(canvas, ship, flames) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const css = canvas.clientWidth || 64;
    canvas.width = Math.round(css * dpr);
    canvas.height = Math.round(css * dpr);
    const g = canvas.getContext('2d');
    const px = (canvas.width / BOX) * 1.02;
    const R = SF.art.resolve(ship);
    const spr = SF.art.renderShip(R, px, 0.3);
    if (flames) {
      g.save();
      g.translate(canvas.width / 2, canvas.height / 2);
      g.scale(px, px);
      SF.art.drawFlames(g, R, 0.2, 1);
      g.restore();
    }
    g.drawImage(spr, (canvas.width - spr.width) / 2, (canvas.height - spr.height) / 2);
  }

  function miniIcon(canvas, id, color) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const css = canvas.clientWidth || 64;
    canvas.width = Math.round(css * dpr);
    canvas.height = Math.round(css * dpr);
    SF.art.drawIcon(canvas.getContext('2d'), id, color, canvas.width);
  }

  function toast(msg) {
    if (SF.ui) SF.ui.toast(msg);
  }

  function shakeCredits() {
    els.creditsBox.classList.remove('shake');
    void els.creditsBox.offsetWidth;
    els.creditsBox.classList.add('shake');
  }

  function celebrate() {
    const cx = pv.cx;
    const cy = pv.cy;
    const col = pv.R ? pv.R.energy : '#3DF2FF';
    pv.fx.ring(cx, cy, 10, Math.min(pv.w, pv.h) * 0.45, col, 0.6, 4);
    pv.fx.spark(cx, cy, '#FFD45C', 26, 240, 0.7);
    pv.fx.spark(cx, cy, col, 18, 200, 0.6);
  }

  /* ---------- Top bar, stats and records ---------- */

  function renderTop() {
    els.credits.textContent = U.fmt(prof.data.credits);
    els.name.textContent = prof.data.ship.name;
    const b = prof.data.best;
    els.records.textContent = prof.data.totals.runs
      ? `Best ${U.fmt(b.score)}  ·  Sector ${b.sector}`
      : 'Build your ship, then launch';
  }

  function renderStats() {
    const cur = prof.stats();
    const next = P.stats(previewShip(), prof.data.upgrades);
    const vals = {
      armor: (s) => String(s.armor),
      shield: (s) => String(s.shield),
      speed: (s) => String(Math.round(s.speed)),
      fire: (s) => String(Math.round(s.bars.fire * 100)),
      special: (s) => Math.round(s.charge * 100) + '%',
    };
    for (const k of STAT_KEYS) {
      const a = cur.bars[k];
      const b = next.bars[k];
      const e = statEls[k];
      e.cur.style.width = (Math.min(a, b) * 100).toFixed(1) + '%';
      e.delta.style.left = (Math.min(a, b) * 100).toFixed(1) + '%';
      e.delta.style.width = (Math.abs(b - a) * 100).toFixed(1) + '%';
      e.delta.className = 'delta ' + (b > a + 0.001 ? 'up' : b < a - 0.001 ? 'down' : '');
      e.val.textContent = vals[k](next);
      e.val.className = 'val ' + (b > a + 0.001 ? 'up' : b < a - 0.001 ? 'down' : '');
    }
  }

  /* ---------- Panel ---------- */

  function card(slot, item) {
    const ship = prof.data.ship;
    const owned = prof.owns(slot, item.id);
    const equipped = ship[slot] === item.id;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'card';
    b.dataset.slot = slot;
    b.dataset.id = item.id;
    if (equipped) b.classList.add('equipped');
    if (focus && focus.slot === slot && focus.id === item.id) b.classList.add('focus');
    if (!owned && prof.data.credits < item.price) b.classList.add('poor');
    const tag = equipped ? 'Equipped' : !owned ? priceTag(item.price) : P.priced(slot) ? 'Owned' : '&nbsp;';
    b.innerHTML = `<canvas class="c-art" aria-hidden="true"></canvas><span class="c-name">${item.name}</span><span class="c-tag">${tag}</span>`;
    b.setAttribute('aria-label', `${item.name}, ${equipped ? 'equipped' : owned ? 'owned' : item.price + ' credits'}`);
    return b;
  }

  function paintCardArt(b) {
    const slot = b.dataset.slot;
    const id = b.dataset.id;
    const c = b.querySelector('canvas');
    const ship = Object.assign({}, prof.data.ship, { [slot]: id });
    if (slot === 'weapon' || slot === 'special') miniIcon(c, id, P.energy(ship.energy).hex);
    else miniShip(c, ship, slot === 'engine');
  }

  function swatches(slot, list, label) {
    const wrap = document.createElement('section');
    wrap.className = 'paint-group';
    wrap.innerHTML = `<h3>${label}</h3>`;
    const row = document.createElement('div');
    row.className = 'swatches';
    for (const c of list) {
      const s = document.createElement('button');
      s.type = 'button';
      s.className = 'swatch' + (slot === 'energy' ? ' energy' : '');
      s.dataset.slot = slot;
      s.dataset.id = c.id;
      s.style.setProperty('--c', c.hex);
      s.title = c.name;
      s.setAttribute('aria-label', `${label}: ${c.name}`);
      if (prof.data.ship[slot] === c.id) s.classList.add('on');
      row.append(s);
    }
    wrap.append(row);
    return wrap;
  }

  function cardGroup(slot, list, label) {
    const wrap = document.createElement('section');
    wrap.className = 'paint-group';
    wrap.innerHTML = `<h3>${label}</h3>`;
    const row = document.createElement('div');
    row.className = 'cards small';
    for (const item of list) row.append(card(slot, Object.assign({ price: 0 }, item)));
    wrap.append(row);
    return wrap;
  }

  function upgrades() {
    const wrap = document.createElement('div');
    wrap.className = 'upgrades';
    for (const u of P.UPGRADES) {
      const lv = prof.data.upgrades[u.id];
      const cost = prof.upgradeCost(u.id);
      const row = document.createElement('div');
      row.className = 'upg';
      let pips = '';
      for (let i = 0; i < P.UPGRADE_MAX; i++) pips += `<i class="${i < lv ? 'on' : ''}"></i>`;
      row.innerHTML = `
        <div class="u-ico"><svg viewBox="0 0 24 24" aria-hidden="true">${UPG_ICON[u.id]}</svg></div>
        <div class="u-text"><div class="u-name">${u.name}</div><div class="u-desc">${u.desc}</div><div class="pips" aria-label="Level ${lv} of ${P.UPGRADE_MAX}">${pips}</div></div>`;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'u-btn';
      btn.dataset.upgrade = u.id;
      if (cost === null) {
        btn.textContent = 'Max';
        btn.disabled = true;
      } else {
        btn.innerHTML = priceTag(cost);
        if (prof.data.credits < cost) btn.classList.add('poor');
        btn.setAttribute('aria-label', `Upgrade ${u.name} for ${cost} credits`);
      }
      row.append(btn);
      wrap.append(row);
    }
    return wrap;
  }

  function renderPanel() {
    const panel = els.panel;
    const scroll = panel.scrollTop;
    const scrollX = panel.querySelector('.cards') ? panel.querySelector('.cards').scrollLeft : 0;
    panel.innerHTML = '';
    panel.dataset.tab = tab;
    if (TAB_SLOT[tab]) {
      const row = document.createElement('div');
      row.className = 'cards';
      for (const item of P.list(TAB_SLOT[tab])) row.append(card(TAB_SLOT[tab], item));
      panel.append(row);
    } else if (tab === 'paint') {
      panel.append(
        swatches('body', P.COLORS, 'Body'),
        swatches('accent', P.COLORS, 'Trim'),
        swatches('energy', P.ENERGY, 'Energy (engines, cockpit and shots)'),
        cardGroup('decal', P.DECALS, 'Decal'),
        cardGroup('finish', P.FINISHES, 'Finish'),
      );
    } else {
      panel.append(upgrades());
    }
    for (const b of panel.querySelectorAll('.card')) paintCardArt(b);
    panel.scrollTop = scroll;
    const cards = panel.querySelector('.cards');
    if (cards) cards.scrollLeft = scrollX;
    for (const t of els.tabs.querySelectorAll('button')) {
      const on = t.dataset.tab === tab;
      t.classList.toggle('on', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    }
  }

  function renderDetail() {
    const d = els.detail;
    const btn = els.dBtn;
    btn.hidden = false;
    btn.disabled = false;
    btn.className = 'd-btn';
    if (tab === 'upgrades') {
      els.dName.textContent = 'Upgrades';
      els.dDesc.textContent = 'Upgrades stay with you whichever parts you fit. Each level costs more than the last.';
      btn.hidden = true;
      return;
    }
    let slot = TAB_SLOT[tab];
    let id = slot ? prof.data.ship[slot] : null;
    if (focus) {
      slot = focus.slot;
      id = focus.id;
    }
    if (!slot || !P.priced(slot)) {
      els.dName.textContent = 'Paint shop';
      els.dDesc.textContent = 'Colours and decals are free, so try as many as you like. Finishes cost credits.';
      btn.hidden = true;
      return;
    }
    const item = P.get(slot, id);
    els.dName.textContent = item.name;
    els.dDesc.textContent = item.desc;
    const owned = prof.owns(slot, id);
    const equipped = prof.data.ship[slot] === id;
    d.dataset.slot = slot;
    d.dataset.id = id;
    if (equipped) {
      btn.textContent = 'Equipped';
      btn.disabled = true;
    } else if (owned) {
      btn.textContent = 'Equip';
    } else {
      btn.innerHTML = `Buy ${priceTag(item.price)}`;
      btn.classList.add('buy');
      if (prof.data.credits < item.price) btn.classList.add('poor');
    }
  }

  function refresh() {
    renderTop();
    renderStats();
    renderPanel();
    renderDetail();
  }

  /* ---------- Actions ---------- */

  function pickPart(slot, id) {
    if (prof.owns(slot, id)) {
      const changed = prof.data.ship[slot] !== id;
      prof.equip(slot, id);
      focus = null;
      A.play(changed ? 'equip' : 'click');
    } else {
      focus = { slot, id };
      A.play('click');
    }
    refresh();
  }

  function buyFocused() {
    const slot = els.detail.dataset.slot;
    const id = els.detail.dataset.id;
    if (!slot || !id) return;
    const item = P.get(slot, id);
    const res = prof.buy(slot, id);
    if (res === 'poor') {
      A.play('deny');
      shakeCredits();
      toast(`You need ${U.fmt(item.price - prof.data.credits)} more credits. Fly a run to earn some!`);
      return;
    }
    focus = null;
    if (res === 'ok') {
      A.play('buy');
      celebrate();
      toast(`${item.name} bought and fitted`);
    } else {
      A.play('equip');
    }
    refresh();
  }

  els.tabs.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]');
    if (!b || b.dataset.tab === tab) return;
    tab = b.dataset.tab;
    focus = null;
    els.panel.scrollTop = 0;
    A.play('tab');
    refresh();
  });

  els.panel.addEventListener('click', (e) => {
    const up = e.target.closest('[data-upgrade]');
    if (up) {
      const u = P.UPGRADES.find((x) => x.id === up.dataset.upgrade);
      const res = prof.upgrade(u.id);
      if (res === 'ok') {
        A.play('buy');
        celebrate();
        toast(`${u.name} upgraded to level ${prof.data.upgrades[u.id]}`);
      } else if (res === 'poor') {
        A.play('deny');
        shakeCredits();
        toast(`You need ${U.fmt(prof.upgradeCost(u.id) - prof.data.credits)} more credits`);
      }
      refresh();
      return;
    }
    const sw = e.target.closest('.swatch');
    if (sw) {
      prof.equip(sw.dataset.slot, sw.dataset.id);
      A.play('click');
      refresh();
      return;
    }
    const c = e.target.closest('.card');
    if (c) pickPart(c.dataset.slot, c.dataset.id);
  });

  els.dBtn.addEventListener('click', buyFocused);

  /* ---------- The live preview ---------- */

  function resizePreview() {
    const c = els.preview;
    const w = c.clientWidth;
    const h = c.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (w === pv.w && h === pv.h && dpr === pv.dpr) return;
    pv.w = w;
    pv.h = h;
    pv.dpr = dpr;
    c.width = Math.max(1, Math.round(w * dpr));
    c.height = Math.max(1, Math.round(h * dpr));
    pv.bg.resize(w, h);
    pv.key = '';
  }

  // Test-fire the weapon you're looking at, so you can see what it does.
  function demoFire(dt, st) {
    const lvl = 3;
    const gun = pv.R.hull.gun;
    const gx = gun.x * ART;
    const gy = gun.y * ART;
    pv.cool -= dt * st.rate;
    pv.beam = null;
    const bolt = (x, y, ang, speed, kind, o) => pv.shots.push(Object.assign({ x, y, ang, vx: Math.sin(ang) * speed, vy: -Math.cos(ang) * speed, kind, life: 1.2, len: 16, w: 6 }, o));
    switch (st.weapon) {
      case 'scatter':
        if (pv.cool <= 0) {
          pv.cool += 0.3;
          for (let i = 0; i < 7; i++) bolt(gx, gy, (i / 6 - 0.5) * 0.57, 520, 'pellet', { life: 0.5 });
        }
        break;
      case 'rail':
        if (pv.cool <= 0) {
          pv.cool += 0.6;
          bolt(gx, gy, 0, 900, 'slug', { len: 46, w: 11 });
          for (const s of [-1, 1]) bolt(gx + s * 10, gy + 8, 0, 900, 'slug', { len: 32, w: 8 });
        }
        break;
      case 'beam':
        pv.beam = { w: 5 + 2.6 * lvl };
        break;
      case 'arc':
        if (pv.cool <= 0) {
          pv.cool += 0.4;
          const pts = [[gx, gy]];
          let x = gx;
          let y = gy;
          for (let i = 0; i < 3; i++) {
            x = U.clamp(x + U.rand(-50, 50), -90, 90);
            y = y - U.rand(28, 46);
            pts.push([x, y]);
          }
          pv.arcs.push({ pts, t: 0.14, max: 0.14 });
        }
        break;
      default:
        if (pv.cool <= 0) {
          pv.cool += 0.13;
          for (const [ox, a] of Wp.PULSE[lvl - 1]) bolt(gx + ox, gy + Math.abs(ox) * 0.5, a, 620, 'bolt', { len: 18, w: 7 });
        }
    }
    if (pv.cool < -0.2) pv.cool = 0;
    const guns = [];
    const h = pv.R.hull;
    if (h.sideGuns) guns.push(...h.guns);
    if (pv.R.wing.gun) {
      const m = h.mount;
      const x = m.x + pv.R.wing.gun.x * m.s;
      const y = m.y + pv.R.wing.gun.y * m.s;
      guns.push({ x, y }, { x: -x, y });
    }
    if (guns.length) {
      pv.sideCool -= dt * st.rate;
      if (pv.sideCool <= 0) {
        pv.sideCool += 0.3;
        for (const g of guns) bolt(g.x * ART, g.y * ART, 0, 600, 'mini', { len: 12, w: 5 });
      }
    }
  }

  function frame(dt) {
    if (!visible) return;
    resizePreview();
    if (!pv.w || !pv.h) return;
    pv.t += dt;
    const g = pv.g;
    const ship = previewShip();
    // World units → CSS pixels, so the ship fills a good part of the window.
    pv.k = Math.min(pv.h * 0.42, pv.w * 0.42) / 42;
    const px = pv.k * ART * pv.dpr;
    const key = JSON.stringify(ship) + '|' + px.toFixed(3);
    pv.holoT -= dt;
    if (key !== pv.key || (ship.finish === 'holo' && pv.holoT <= 0)) {
      pv.R = SF.art.resolve(ship);
      pv.sprite = SF.art.renderShip(pv.R, px, pv.t);
      pv.key = key;
      pv.holoT = 0.06;
    }
    const st = P.stats(ship, prof.data.upgrades);

    pv.bg.update(dt, 30);
    pv.fx.update(dt);
    demoFire(dt, st);
    for (let i = pv.shots.length - 1; i >= 0; i--) {
      const s = pv.shots[i];
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
      if (s.life <= 0 || s.y < -pv.cy / pv.k - 30) pv.shots.splice(i, 1);
    }
    for (let i = pv.arcs.length - 1; i >= 0; i--) if ((pv.arcs[i].t -= dt) <= 0) pv.arcs.splice(i, 1);

    g.setTransform(pv.dpr, 0, 0, pv.dpr, 0, 0);
    pv.bg.draw(g);
    pv.fx.draw(g);

    const bank = Math.sin(pv.t * 0.8) * 0.35;
    pv.cx = pv.w / 2 + Math.sin(pv.t * 0.8) * pv.w * 0.05;
    pv.cy = pv.h * 0.62 + Math.sin(pv.t * 1.5) * 4;
    g.save();
    g.translate(pv.cx, pv.cy);
    g.scale(pv.k, pv.k);

    const col = pv.R.energy;
    g.globalCompositeOperation = 'lighter';
    const boltImg = U.bolt(col);
    for (const s of pv.shots) {
      g.globalAlpha = Math.min(1, s.life * 3);
      if (s.kind === 'pellet') g.drawImage(U.orb(col), s.x - 6, s.y - 6, 12, 12);
      else {
        g.save();
        g.translate(s.x, s.y);
        g.rotate(s.ang);
        if (s.kind === 'slug') g.drawImage(U.glow(col), -s.w * 1.4, -s.len * 0.6, s.w * 2.8, s.len * 1.2);
        g.drawImage(boltImg, -s.w / 2, -s.len / 2, s.w, s.len);
        g.restore();
      }
    }
    g.globalAlpha = 1;
    if (pv.beam) {
      const gy = pv.R.hull.gun.y * ART;
      const top = -pv.cy / pv.k;
      const w = pv.beam.w * (1 + Math.sin(pv.t * 50) * 0.12);
      const gr = g.createLinearGradient(-w * 1.6, 0, w * 1.6, 0);
      gr.addColorStop(0, U.rgba(col, 0));
      gr.addColorStop(0.5, U.rgba(col, 0.9));
      gr.addColorStop(1, U.rgba(col, 0));
      g.fillStyle = gr;
      g.fillRect(-w * 1.6, top, w * 3.2, gy - top);
      g.fillStyle = 'rgba(255,255,255,0.9)';
      g.fillRect(-w * 0.18, top, w * 0.36, gy - top);
      g.drawImage(U.glow(col), -w * 1.5, gy - w * 1.5, w * 3, w * 3);
    }
    for (const a of pv.arcs) {
      g.globalAlpha = a.t / a.max;
      for (let i = 1; i < a.pts.length; i++) {
        SF.art.lightning(g, a.pts[i - 1][0], a.pts[i - 1][1], a.pts[i][0], a.pts[i][1], 7, col, 1.6);
        g.drawImage(U.glow(col), a.pts[i][0] - 10, a.pts[i][1] - 10, 20, 20);
      }
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';

    g.scale(ART * (1 - Math.abs(bank) * 0.2), ART);
    SF.art.drawFlames(g, pv.R, pv.t, 1.1 + Math.sin(pv.t * 3) * 0.1);
    g.drawImage(pv.sprite, -BOX / 2, -BOX / 2, BOX, BOX);
    g.restore();
  }

  /* ---------- Name ---------- */

  els.nameBtn.addEventListener('click', () => {
    A.play('click');
    if (SF.ui) SF.ui.editName();
  });

  SF.hangar = {
    refresh,
    frame,
    show() {
      visible = true;
      focus = null;
      els.screen.hidden = false;
      pv.key = '';
      pv.w = 0;
      refresh();
    },
    hide() {
      visible = false;
      els.screen.hidden = true;
    },
    get visible() { return visible; },
  };
})(window.SF = window.SF || {});
