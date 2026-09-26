// DOM side of the game: HUD, labels, sheets and the 2D overlay.
import { BODIES, SYSTEMS, KIND_LABEL } from './data.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function fmtKm(km) {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 1e6) return `${Math.round(km).toLocaleString('en-US')} km`;
  const au = km / 149597870.7;
  if (au < 0.05) return `${(km / 1e6).toFixed(2)} million km`;
  const ly = km / 9460730472580.8;
  if (ly < 0.05) return `${au < 10 ? au.toFixed(2) : au.toFixed(1)} AU`;
  return `${ly < 100 ? ly.toFixed(2) : Math.round(ly).toLocaleString('en-US')} light-years`;
}
export function fmtSpeed(kms) {
  const c = kms / 299792.458;
  if (c >= 0.1) return `${c < 10 ? c.toFixed(2) : c < 1000 ? c.toFixed(1) : Math.round(c).toLocaleString('en-US')} × light speed`;
  if (kms < 1) return `${Math.round(kms * 1000)} m/s`;
  return `${Math.round(kms).toLocaleString('en-US')} km/s`;
}

function swatch(def) {
  const c = def.color || '#ccc';
  return `background: radial-gradient(circle at 35% 35%, #fff 0%, ${c} 30%, ${c} 55%, #000 100%)`;
}

export class UI {
  constructor(h) {
    this.h = h;
    this.labelPool = new Map();
    this.labelsEl = $('labels');
    this.sheet = $('sheet');
    this.sheetBody = $('sheet-body');
    this.sheetKind = null;
    this.toastTimer = 0;

    $('act-go').onclick = () => h.onGo();
    $('act-orbit').onclick = () => h.onOrbit();
    $('act-scan').onclick = () => h.onScan();
    $('card-info').onclick = () => h.onInfo();
    $('btn-map').onclick = () => h.onOpen('map');
    $('btn-log').onclick = () => h.onOpen('log');
    $('btn-settings').onclick = () => h.onOpen('settings');
    $('btn-targets').onclick = () => h.onOpen('targets');
    $('btn-time').onclick = () => h.onOpen('time');
    $('btn-gyro').onclick = () => h.onGyro();
    $('btn-view').onclick = () => h.onView();
    $('btn-photo').onclick = () => h.onPhoto();
    this.sheet.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) this.closeSheet();
      const act = e.target.closest('[data-act]');
      if (act) h.onAction(act.dataset.act, act.dataset);
    });
    window.addEventListener('keydown', (e) => { if (e.code === 'Escape') this.closeSheet(); });

    // Throttle slider
    const thr = $('throttle');
    const setFromY = (y) => {
      const r = thr.querySelector('.thr-track').getBoundingClientRect();
      const v = Math.min(1, Math.max(0, (r.bottom - y) / r.height));
      h.onThrottle(v);
    };
    thr.addEventListener('pointerdown', (e) => { thr.setPointerCapture(e.pointerId); this.thrDrag = true; setFromY(e.clientY); e.stopPropagation(); });
    thr.addEventListener('pointermove', (e) => { if (this.thrDrag) setFromY(e.clientY); });
    thr.addEventListener('pointerup', () => { this.thrDrag = false; });
    thr.addEventListener('pointercancel', () => { this.thrDrag = false; });
    thr.addEventListener('keydown', (e) => {
      if (e.code === 'ArrowUp') h.onThrottle(Math.min(1, this.thrV + 0.1));
      if (e.code === 'ArrowDown') h.onThrottle(Math.max(0, this.thrV - 0.1));
    });
  }

  showHUD(on) { $('hud').hidden = !on; }

  toast(msg, kind = '', ms = 2600) {
    const t = $('toast');
    t.textContent = msg;
    t.className = `toast show ${kind}`;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { t.className = 'toast'; }, ms);
  }

  setReadout(main, sub, warn) {
    if (main !== this._ro1) { $('ro-main').textContent = main; this._ro1 = main; }
    if (sub !== this._ro2) { $('ro-sub').textContent = sub; this._ro2 = sub; }
    $('ro-sub').classList.toggle('warn', !!warn);
  }

  setThrottle(v, show) {
    this.thrV = v;
    $('thr-fill').style.height = `${v * 100}%`;
    $('thr-knob').style.bottom = `${v * 100}%`;
    $('throttle').setAttribute('aria-valuenow', String(Math.round(v * 100)));
    $('throttle').hidden = !show;
  }

  setDate(date, warp) {
    if (date !== this._date) { $('date').textContent = date; this._date = date; }
    if (warp !== this._warp) { $('warp').textContent = warp; this._warp = warp; }
  }
  setSystem(name) { $('sys-name').textContent = name; }
  setGyro(on) { $('btn-gyro').setAttribute('aria-pressed', on ? 'true' : 'false'); }
  setLogCount(n) { $('log-count').textContent = String(n); }

  setCard(body, st) {
    const card = $('card');
    if (!body) { card.hidden = true; return; }
    card.hidden = false;
    $('card-dot').style.color = body.def.color;
    const name = body.def.name;
    if (this._cardName !== name) { $('card-name').textContent = name; this._cardName = name; }
    if (this._cardSub !== st.sub) { $('card-sub').textContent = st.sub; this._cardSub = st.sub; }
    const go = $('act-go');
    go.querySelector('span').textContent = st.goLabel;
    go.disabled = !!st.goDisabled;
    const orb = $('act-orbit');
    orb.querySelector('span').textContent = st.orbitOn ? 'Leave' : 'Orbit';
    orb.classList.toggle('on', st.orbitOn);
    const sc = $('act-scan');
    sc.querySelector('span').textContent = st.scanLabel;
    sc.classList.toggle('done', st.found);
    const bar = $('card').querySelector('.scan-bar');
    bar.classList.toggle('on', st.scanProgress > 0);
    $('scan-fill').style.width = `${st.scanProgress * 100}%`;
  }

  // ───────────── labels ─────────────
  updateLabels(items) {
    const seen = new Set();
    for (const it of items) {
      seen.add(it.key);
      let el = this.labelPool.get(it.key);
      if (!el) {
        el = document.createElement('div');
        this.labelsEl.appendChild(el);
        this.labelPool.set(it.key, el);
      }
      const html = it.sub ? `${esc(it.text)}<small>${esc(it.sub)}</small>` : esc(it.text);
      if (el._html !== html) { el.innerHTML = html; el._html = html; }
      const cls = `lbl ${it.cls || ''}`;
      if (el._cls !== cls) { el.className = cls; el._cls = cls; }
      el.style.transform = `translate(${Math.round(it.x)}px, ${Math.round(it.y)}px) translate(-50%, 0)`;
    }
    for (const [k, el] of this.labelPool) {
      if (!seen.has(k)) { el.remove(); this.labelPool.delete(k); }
    }
  }

  // ───────────── loading ─────────────
  showLoading(title, sub = '') {
    $('loading').hidden = false;
    $('load-title').textContent = title;
    $('load-sub').textContent = sub;
    $('load-fill').style.width = '0%';
  }
  setLoading(f, sub) {
    $('load-fill').style.width = `${Math.round(f * 100)}%`;
    if (sub !== undefined) $('load-sub').textContent = sub;
  }
  hideLoading() { $('loading').hidden = true; }
  fade(on, white = false) {
    const f = $('fade');
    f.classList.toggle('white', white);
    f.classList.toggle('on', on);
  }

  // ───────────── sheets ─────────────
  openSheet(kind, title, html) {
    this.sheetKind = kind;
    $('sheet-title').textContent = title;
    this.sheetBody.innerHTML = html;
    this.sheet.hidden = false;
    this.sheetBody.scrollTop = 0;
  }
  closeSheet() {
    if (this.sheet.hidden) return;
    this.sheet.hidden = true;
    this.sheetKind = null;
    this.h.onSheetClosed?.();
  }
  get sheetOpen() { return !this.sheet.hidden; }

  openInfo(def, found, opts) {
    const kind = def.info.type || KIND_LABEL[def.kind];
    const sys = SYSTEMS.find((s) => s.id === def.sys);
    let html = `<div class="info-top"><div class="planet-swatch" style="${swatch(def)}"></div><div><b>${esc(def.name)}</b><small>${esc(kind)} · ${esc(sys.name)}</small><br>`;
    html += found ? '<span class="pill good">Scanned ✓</span>' : '<span class="pill warn">Not scanned yet</span>';
    if (def.candidate) html += ' <span class="pill warn">Unconfirmed</span>';
    html += '</div></div>';
    if (found) {
      html += '<table class="stats">' + def.info.stats.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('') + '</table>';
      html += '<h3>Did you know</h3><ul class="facts">' + def.info.facts.map((f) => `<li>${esc(f)}</li>`).join('') + '</ul>';
    } else {
      html += `<p class="locked">Fly within scanning range and tap <b>Scan</b> to read this world's data.</p>`;
      html += '<table class="stats">' + def.info.stats.slice(0, 1).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('') + '</table>';
    }
    html += '<div class="row-btns">';
    if (opts.canTarget) html += `<button class="btn primary" type="button" data-act="target" data-id="${def.id}">Set as target</button>`;
    if (opts.canGo) html += `<button class="btn primary" type="button" data-act="go" data-id="${def.id}">Fly there</button>`;
    if (opts.jump) html += `<button class="btn primary" type="button" data-act="jump" data-sys="${def.sys}">Jump to ${esc(sys.name)}</button>`;
    html += '</div>';
    this.openSheet('info', def.name, html);
  }

  openLog(found, stats) {
    const total = BODIES.length;
    const n = found.size;
    let html = `<p><b>${n}</b> of ${total} worlds scanned</p><div class="progress"><i style="width:${(n / total) * 100}%"></i></div>`;
    html += `<p class="about">Distance flown: ${fmtKm(stats.traveledKm)} · Top speed: ${fmtSpeed(stats.maxSpeed)} · Jumps: ${stats.jumps}</p>`;
    for (const sys of SYSTEMS) {
      const list = BODIES.filter((b) => b.sys === sys.id);
      const k = list.filter((b) => found.has(b.id)).length;
      html += `<h3>${esc(sys.name)} · ${k}/${list.length}</h3><div class="log-grid">`;
      for (const b of list) {
        const f = found.has(b.id);
        html += `<button class="log-item ${f ? '' : 'locked'}" type="button" data-act="log" data-id="${b.id}">
          <i class="dot" style="color:${b.color}"></i><span><b>${f ? esc(b.name) : esc(b.name)}</b><small>${esc(KIND_LABEL[b.kind])}${f ? ' · ✓' : ''}</small></span></button>`;
      }
      html += '</div>';
    }
    this.openSheet('log', 'Logbook', html);
  }

  openMap(currentId, found) {
    let html = '<p class="about">Distances from the Sun. A jump takes a few seconds in hyperspace. (Real light would take years.)</p>';
    for (const s of SYSTEMS) {
      const list = BODIES.filter((b) => b.sys === s.id);
      const k = list.filter((b) => found.has(b.id)).length;
      const here = s.id === currentId;
      const dist = s.ly ? `${s.ly < 100 ? s.ly.toFixed(2) : s.ly.toLocaleString('en-US')} ly` : 'Home';
      html += `<div class="sys-card ${here ? 'here' : ''}"><header><b>${esc(s.name)}</b><small>${dist}</small></header>
        <div class="meta">${esc(s.star)} · ${k}/${list.length} scanned</div><p>${esc(s.blurb)}</p>
        ${here ? '<span class="pill good">You are here</span>' : `<button class="btn primary" type="button" data-act="jump" data-sys="${s.id}">Jump</button>`}</div>`;
    }
    this.openSheet('map', 'Star map', html);
  }

  openTargets(rows, selId) {
    let html = '<div class="nav-list">';
    for (const r of rows) {
      html += `<button class="nav-item ${r.child ? 'child' : ''} ${r.id === selId ? 'sel' : ''}" type="button" data-act="target" data-id="${r.id}">
        <i class="dot" style="color:${r.color}"></i><span><b>${esc(r.name)}${r.found ? ' <small>✓</small>' : ''}</b><small>${esc(r.kind)}</small></span><em>${esc(r.dist)}</em></button>`;
    }
    html += '</div>';
    this.openSheet('targets', 'Navigation', html);
  }

  openTime(warps, idx, date) {
    let html = `<p>Simulation date: <b>${esc(date)}</b></p><p class="about">Planets and moons move on their real orbits. Speed up time to watch them go around.</p><div class="time-grid">`;
    warps.forEach(([, label], i) => {
      html += `<button class="btn" type="button" data-act="warp" data-i="${i}" aria-pressed="${i === idx}">${esc(label)}</button>`;
    });
    html += '</div><div class="row-btns"><button class="btn primary" type="button" data-act="now">Back to now</button></div>';
    this.openSheet('time', 'Time', html);
  }

  openSettings(s) {
    const tog = (key, label, sub) => `<div class="setting"><span>${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ''}</span>
      <button class="toggle" type="button" role="switch" aria-checked="${!!s[key]}" data-act="toggle" data-key="${key}" aria-label="${esc(label)}"></button></div>`;
    const q = (v, l) => `<button type="button" data-act="quality" data-v="${v}" aria-pressed="${s.quality === v}">${l}</button>`;
    let html = '';
    html += tog('labels', 'Labels', 'Names next to planets, moons and stars');
    html += tog('orbits', 'Orbit lines', 'The paths planets and moons follow');
    html += tog('dots', 'Highlight distant worlds', 'Draw far-off planets as bright dots');
    html += tog('lines', 'Constellations', 'Join up the famous star patterns');
    html += tog('sound', 'Sound');
    html += tog('invert', 'Invert drag', 'Drag moves the view instead of the sky');
    html += `<div class="setting"><span>Graphics<small>Lower is faster on older phones</small></span><div class="seg">${q('low', 'Low')}${q('medium', 'Med')}${q('high', 'High')}</div></div>`;
    html += `<h3>About</h3><p class="about">Sizes and distances are real: one screen unit is 1,062 km, and the planets sit where they really are today, worked out from their orbits. Surfaces are painted by the game from real maps and data, so details are approximate. Exoplanet surfaces are educated guesses.</p>
      <p class="about">Controls: drag to look, pinch to zoom, twist two fingers to roll. Keyboard: WASD / arrows, Q E roll, Space fly to target, F scan, O orbit, C camera, T time, Tab next target.</p>`;
    html += `<div class="row-btns"><button class="btn danger" type="button" data-act="reset">Reset logbook</button></div>`;
    this.openSheet('settings', 'Settings', html);
  }

  openPhoto(url, name) {
    const share = navigator.canShare ? '<button class="btn" type="button" data-act="share">Share</button>' : '';
    const html = `<img class="photo" src="${url}" alt="Photo of space"><div class="row-btns"><a class="btn primary" href="${url}" download="${esc(name)}">Save photo</a>${share}</div>`;
    this.openSheet('photo', 'Photo', html);
  }
}

// ───────────────────────────── overlay canvas ─────────────────────────────
export class Overlay {
  constructor(canvas) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.streaks = Array.from({ length: 90 }, () => ({ a: Math.random() * Math.PI * 2, r: Math.random(), s: 0.5 + Math.random() }));
  }
  resize(w, h, dpr) {
    this.c.width = Math.round(w * dpr); this.c.height = Math.round(h * dpr);
    this.w = w; this.h = h; this.dpr = dpr;
  }

  draw(st) {
    const { ctx, w, h } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2;

    // Lens flares
    for (const f of st.flares) {
      const I = f.intensity;
      if (I <= 0.01) continue;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const dx = cx - f.x, dy = cy - f.y;
      const ghosts = [[0.35, 18, 'rgba(120,170,255,'], [0.55, 8, 'rgba(255,200,120,'], [0.8, 34, 'rgba(90,255,180,'], [1.15, 14, 'rgba(255,120,160,'], [1.45, 52, 'rgba(120,150,255,'], [1.8, 22, 'rgba(255,220,150,']];
      for (const [k, r, col] of ghosts) {
        const gx = f.x + dx * k, gy = f.y + dy * k;
        const rad = r * (w / 800 + 0.5);
        const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, rad);
        g.addColorStop(0, col + (0.1 * I).toFixed(3) + ')');
        g.addColorStop(0.7, col + (0.05 * I).toFixed(3) + ')');
        g.addColorStop(1, col + '0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(gx, gy, rad, 0, Math.PI * 2); ctx.fill();
      }
      const sw = w * 0.45 * I;
      const lg = ctx.createLinearGradient(f.x - sw, f.y, f.x + sw, f.y);
      lg.addColorStop(0, 'rgba(140,180,255,0)');
      lg.addColorStop(0.5, `rgba(190,215,255,${(0.35 * I).toFixed(3)})`);
      lg.addColorStop(1, 'rgba(140,180,255,0)');
      ctx.fillStyle = lg;
      ctx.fillRect(f.x - sw, f.y - 1.2, sw * 2, 2.4);
      ctx.restore();
    }

    // Warp streaks
    if (st.warp > 0.02) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const R = Math.hypot(w, h) / 2;
      for (const s of this.streaks) {
        s.r += st.dt * s.s * (0.6 + st.warp * 2.2);
        if (s.r > 1) { s.r = Math.random() * 0.2; s.a = Math.random() * Math.PI * 2; }
        const r0 = s.r * R, r1 = r0 + R * 0.05 * st.warp * s.s * (0.3 + s.r * 2);
        const a = st.warp * Math.min(1, s.r * 3) * 0.55;
        ctx.strokeStyle = `rgba(190,215,255,${a.toFixed(3)})`;
        ctx.lineWidth = 1 + s.r * 1.5;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(s.a) * r0, cy + Math.sin(s.a) * r0);
        ctx.lineTo(cx + Math.cos(s.a) * r1, cy + Math.sin(s.a) * r1);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Target brackets / off-screen arrow
    const t = st.target;
    if (t) {
      ctx.strokeStyle = t.found ? 'rgba(111,240,180,0.9)' : 'rgba(111,184,255,0.9)';
      ctx.fillStyle = ctx.strokeStyle;
      ctx.lineWidth = 1.6;
      if (t.onScreen) {
        const r = Math.max(t.r + 8, 16);
        const L = Math.min(10, r * 0.5);
        if (t.r < Math.min(w, h) * 0.4) {
          ctx.beginPath();
          for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
            const x = t.x + sx * r, y = t.y + sy * r;
            ctx.moveTo(x, y - sy * L); ctx.lineTo(x, y); ctx.lineTo(x - sx * L, y);
          }
          ctx.stroke();
        }
      } else {
        const m = 36;
        let ax = t.dirX, ay = t.dirY;
        const len = Math.hypot(ax, ay) || 1;
        ax /= len; ay /= len;
        const k = Math.min((w / 2 - m) / Math.abs(ax || 1e-6), (h / 2 - m - 40) / Math.abs(ay || 1e-6));
        const x = cx + ax * k, y = cy + ay * k;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.atan2(ay, ax));
        ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-6, -9); ctx.lineTo(-2, 0); ctx.lineTo(-6, 9); ctx.closePath(); ctx.fill();
        ctx.restore();
        ctx.font = '600 11px "Exo 2", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(t.name, x - ax * 30, y - ay * 30 + 4);
      }
      if (st.scan > 0 && t.onScreen) {
        const r = Math.max(t.r + 14, 26);
        ctx.save();
        ctx.strokeStyle = 'rgba(111,240,180,0.85)';
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(t.x, t.y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * st.scan); ctx.stroke();
        const p = (st.time * 1.4) % 1;
        ctx.strokeStyle = `rgba(111,240,180,${(0.6 * (1 - p)).toFixed(3)})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(t.x, t.y, r + p * 40, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
    }

    // Cockpit reticle
    if (st.reticle) {
      ctx.strokeStyle = 'rgba(200,225,255,0.55)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(cx - 18, cy); ctx.lineTo(cx - 6, cy); ctx.moveTo(cx + 6, cy); ctx.lineTo(cx + 18, cy);
      ctx.moveTo(cx, cy - 18); ctx.lineTo(cx, cy - 6); ctx.moveTo(cx, cy + 6); ctx.lineTo(cx, cy + 18);
      ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, 1.5, 0, Math.PI * 2); ctx.fillStyle = 'rgba(200,225,255,0.7)'; ctx.fill();
    }

    // Hyperspace tunnel
    if (st.hyper > 0) {
      ctx.save();
      ctx.fillStyle = `rgba(0,0,0,${Math.min(1, st.hyper * 1.2).toFixed(3)})`;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      const R = Math.hypot(w, h) / 2;
      for (const s of this.streaks) {
        s.r += st.dt * s.s * 1.8 * st.hyper;
        if (s.r > 1) { s.r = Math.random() * 0.1; s.a = Math.random() * Math.PI * 2; }
        const r0 = s.r * R, r1 = r0 + R * 0.25 * s.r * st.hyper;
        const hue = 200 + s.s * 40;
        ctx.strokeStyle = `hsla(${hue},90%,75%,${(0.7 * st.hyper * Math.min(1, s.r * 4)).toFixed(3)})`;
        ctx.lineWidth = 1 + s.r * 2.5;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(s.a) * r0, cy + Math.sin(s.a) * r0);
        ctx.lineTo(cx + Math.cos(s.a) * r1, cy + Math.sin(s.a) * r1);
        ctx.stroke();
      }
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.35);
      g.addColorStop(0, `rgba(170,210,255,${(0.35 * st.hyper).toFixed(3)})`);
      g.addColorStop(1, 'rgba(170,210,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }
}
