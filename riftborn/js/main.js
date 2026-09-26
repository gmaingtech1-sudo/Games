/* Riftborn — start-up, onboarding, following your real GPS position (you
   play by walking around, like Ingress), the frame loop, and the glue
   between the map, AR encounters and battles. */
(function (RB) {
  'use strict';

  const { clamp, esc, fmtDist, TAU } = RB.util;
  const C = RB.creatures;
  const S = RB.state;
  const W = RB.world;
  const M = RB.map;
  const UI = RB.ui;
  const sfx = RB.sfx;
  const $ = (id) => document.getElementById(id);

  const DEFAULT_POS = { lat: 37.7955, lng: -122.3937 };   // until the first GPS fix
  const TOO_FAST = 11;           // m/s (~40 km/h): creatures hide, like in a car

  let mode = 'onboard';
  let ents = { rifts: [], drops: [], spawns: [] };
  const pos = { lat: DEFAULT_POS.lat, lng: DEFAULT_POS.lng };
  let gps = { watch: null, state: 'off', target: null, last: null, tooFast: false };
  let heading = null;
  let entTimer = 0, entAt = null, tickTimer = 0, hudTimer = 0, nearbyKey = '';
  let last = 0;

  /* ======================= Boot ======================= */

  function boot() {
    if (!RB.gfx.supported()) {
      $('onboard').hidden = false;
      document.querySelector('.tagline').textContent = 'Riftborn needs 3D graphics (WebGL), and this browser or device does not have it turned on.';
      $('ob-begin').hidden = true;
      return;
    }
    const save = S.load();
    RB.encounter.init();
    RB.battle.init();
    UI.setHooks({
      // Where you are, or null until the GPS has found you.
      player: () => (located() ? pos : null),
      engage,
      assault,
      changed: () => { refreshEntities(true); updateHud(); },
    });
    bindDom();
    onboarding(save);
    window.addEventListener('resize', resize);
    resize();
    requestAnimationFrame(frame);
  }

  // The 3D map is built once your faction is known.
  let mapReady = false;
  function initMap() {
    if (mapReady) return;
    mapReady = true;
    M.init($('map-screen'), {
      tap: (e) => {
        sfx.tap();
        if (e.kind === 'spawn') UI.spawnSheet(e);
        else if (e.kind === 'rift') UI.riftSheet(e);
        else UI.dropSheet(e);
      },
      tapGround: () => {
        if (!boot.hinted) {
          boot.hinted = true;
          UI.toast('Walk in real life to move. Get within 60 m of something to use it.');
        }
      },
      panned: () => { $('btn-center').classList.toggle('show', M.rotated); },
    });
  }

  function resize() {
    if (mode === 'map') M.resize();
    if (mode === 'encounter') RB.encounter.resize();
    if (mode === 'battle') RB.battle.resize();
    const bg = $('ob-bg');
    if (bg) {
      const d = Math.min(window.devicePixelRatio || 1, 2);
      bg.width = bg.clientWidth * d;
      bg.height = bg.clientHeight * d;
    }
  }

  /* ======================= Onboarding ======================= */

  const draft = { faction: null, name: '', starter: null };

  function step(name) {
    document.querySelectorAll('.ob-step').forEach((s) => { s.hidden = s.dataset.step !== name; });
    if (name === 'starter') {
      document.querySelectorAll('.starter canvas').forEach((cv) => RB.beasts.portrait(cv, cv.dataset.sp));
    }
  }

  function onboarding(save) {
    $('onboard').hidden = false;
    mode = 'onboard';
    if (save) {
      $('ob-continue').hidden = false;
      $('ob-continue').textContent = `Continue as ${save.agent.name}`;
      $('ob-begin').textContent = 'New agent';
      $('ob-begin').classList.remove('btn-main');
      $('ob-begin').classList.add('link-btn');
    }
    step('title');
  }

  function bindDom() {
    $('ob-begin').addEventListener('click', () => { sfx.unlock(); sfx.tap(); step('faction'); });
    $('ob-continue').addEventListener('click', () => { sfx.unlock(); sfx.tap(); enterMap(); });
    document.querySelectorAll('.fac').forEach((b) => b.addEventListener('click', () => {
      sfx.tap();
      draft.faction = b.dataset.f;
      document.body.dataset.faction = draft.faction;
      step('name');
      setTimeout(() => $('ob-name').focus(), 50);
    }));
    $('ob-name-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const n = $('ob-name').value.trim().replace(/\s+/g, ' ').slice(0, 16);
      if (!n) { $('ob-name').focus(); sfx.error(); return; }
      draft.name = n;
      sfx.tap();
      step('starter');
    });
    document.querySelectorAll('.starter').forEach((b) => b.addEventListener('click', () => {
      sfx.tap();
      draft.starter = b.dataset.sp;
      step('where');
    }));
    $('ob-gps').addEventListener('click', () => newAgent());
    $('gate-retry').addEventListener('click', () => { sfx.tap(); stopGPS(); startGPS(); });

    $('btn-lab').addEventListener('click', () => { sfx.tap(); UI.lab(); });
    $('btn-bag').addEventListener('click', () => { sfx.tap(); UI.bag(); });
    $('btn-scan').addEventListener('click', () => { sfx.tap(); scanPulse(); UI.scan(ents); });
    $('btn-menu').addEventListener('click', () => { sfx.tap(); UI.menu(); });
    $('btn-missions').addEventListener('click', () => { sfx.tap(); UI.missionsSheet(); });
    $('btn-profile').addEventListener('click', () => { sfx.tap(); UI.profile(); });
    $('btn-profile2').addEventListener('click', () => { sfx.tap(); UI.profile(); });
    $('btn-center').addEventListener('click', () => { sfx.tap(); M.recenter(); $('btn-center').classList.remove('show'); });
    $('btn-zoomin').addEventListener('click', () => M.zoom(0.7));
    $('btn-zoomout').addEventListener('click', () => M.zoom(1.4));
    $('sheet').addEventListener('click', (e) => { if (e.target === $('sheet')) UI.close(); });

    document.addEventListener('visibilitychange', () => {
      RB.ar.pauseCamera(document.hidden);
      if (document.hidden && S.save) S.persist(true);
    });
    window.addEventListener('pagehide', () => { if (S.save) S.persist(true); });

    RB.host.on('back', () => {
      if (UI.isOpen()) UI.close();
      else if (mode === 'encounter') RB.encounter.leave();
      else if (!$('bt-swap-sheet').hidden) $('bt-swap-sheet').hidden = true;
    });
    RB.host.on('pause', () => { RB.ar.pauseCamera(true); if (S.save) S.persist(true); });
    RB.host.on('resume', () => RB.ar.pauseCamera(false));
  }

  function newAgent() {
    sfx.unlock();
    sfx.tap();
    S.newGame(draft.name, draft.faction, draft.starter);
    S.persist(true);
    enterMap(true);
  }

  /* ======================= Map mode ======================= */

  function enterMap(fresh) {
    const save = S.save;
    document.body.dataset.faction = save.agent.faction;
    sfx.on = save.settings.sound;
    $('onboard').hidden = true;
    $('map-screen').hidden = false;
    initMap();
    mode = 'map';
    const start = save.lastPos || DEFAULT_POS;
    pos.lat = start.lat;
    pos.lng = start.lng;
    W.setOrigin(pos.lat, pos.lng);
    M.show();
    M.setPlayer({ lat: pos.lat, lng: pos.lng });
    M.recenter();
    startCompass();
    startGPS();
    S.tick();
    refreshEntities(true);
    updateHud();
    showNews();
    S.persist();
    if (fresh) {
      const sp = C.byId(draft.starter);
      setTimeout(() => UI.toast(`${esc(sp.name)} joined you. Welcome to the ${S.faction().name}, Agent ${esc(save.agent.name)}!`, 'good'), 400);
      setTimeout(() => UI.guide(), 900);
    }
  }

  function status(text, kind) {
    const el = $('gps-status');
    el.textContent = text || '';
    el.className = `gps-status ${text ? 'show' : ''} ${kind || ''}`;
  }

  /* ------------------ GPS ------------------ */

  // You only move by really moving. Until the GPS has a fix, the map waits
  // behind a notice and nothing counts as in range.
  const located = () => gps.state === 'ok';

  const GATE = {
    waiting: ['Finding your location…', 'Riftborn is played by walking around the real world. Stand outside or near a window for a better GPS signal.'],
    slow: ['Still looking for GPS…', 'Make sure location is turned on for your phone and your browser. GPS works best outdoors.'],
    denied: ['Location is turned off', 'Riftborn needs your location to put Rifts and creatures on your streets. Allow location for this site, then tap Try again.<small>iPhone: Settings → Privacy &amp; Security → Location Services → Safari Websites → While Using the App.<br>Android: tap the icon left of the address → Permissions → Location → Allow.</small>'],
    insecure: ['Open Riftborn over https', 'Phones only share your location with secure pages. Open the game from an https:// address, such as GitHub Pages.'],
    unsupported: ['No location here', 'This device or browser can’t share its location. Riftborn needs GPS, so play it on a phone.'],
  };

  function gate(kind) {
    const el = $('gps-gate');
    $('map-screen').classList.toggle('gated', !!kind);
    if (!kind) { el.hidden = true; return; }
    el.hidden = false;
    el.dataset.kind = kind;
    $('gate-title').textContent = GATE[kind][0];
    $('gate-text').innerHTML = GATE[kind][1];
    $('gate-retry').hidden = kind === 'waiting' || kind === 'insecure' || kind === 'unsupported';
  }

  function startGPS() {
    if (gps.watch != null) return;
    if (!window.isSecureContext) { gps.state = 'off'; gate('insecure'); return; }
    if (!navigator.geolocation) { gps.state = 'off'; gate('unsupported'); return; }
    gps.state = 'waiting';
    gate('waiting');
    status('');
    gps.watch = navigator.geolocation.watchPosition(onPos, onPosErr, { enableHighAccuracy: true, maximumAge: 3000, timeout: 30000 });
  }

  function stopGPS() {
    if (gps.watch != null && navigator.geolocation) navigator.geolocation.clearWatch(gps.watch);
    gps.watch = null;
    gps.state = 'off';
    gps.target = null;
    gps.tooFast = false;
  }

  function onPos(p) {
    const ll = { lat: p.coords.latitude, lng: p.coords.longitude };
    if (gps.state !== 'ok') {
      gps.state = 'ok';
      if (W.distM(W.origin, ll) > 20000) { W.setOrigin(ll.lat, ll.lng); M.reset(); }
      pos.lat = ll.lat;
      pos.lng = ll.lng;
      gate(null);
      refreshEntities(true);
    }
    if (gps.last && p.coords.accuracy < 35) {
      const d = W.distM(gps.last, ll);
      const dt = Math.max(0.5, (p.timestamp - gps.last.t) / 1000);
      const speed = p.coords.speed != null ? p.coords.speed : d / dt;
      gps.tooFast = speed > TOO_FAST;
      if (d < 150 && !gps.tooFast) walkRewards(S.walked(d));
    }
    gps.last = { lat: ll.lat, lng: ll.lng, t: p.timestamp };
    gps.target = ll;
    status(gps.tooFast ? 'Moving too fast. Creatures are hiding.' : p.coords.accuracy > 60 ? 'Weak GPS signal…' : '', gps.tooFast || p.coords.accuracy > 60 ? 'warn' : '');
  }

  function onPosErr(e) {
    if (e.code === 1) {
      stopGPS();
      gps.state = 'denied';
      gate('denied');
    } else if (gps.state !== 'ok') {
      gate('slow');
    } else {
      status('GPS signal lost. Keep walking…', 'warn');
    }
  }

  function startCompass() {
    const DOE = window.DeviceOrientationEvent;
    const listen = () => {
      const h = (e) => {
        if (e.webkitCompassHeading != null) heading = e.webkitCompassHeading;
        else if (e.absolute && e.alpha != null) heading = (360 - e.alpha) % 360;
      };
      window.addEventListener('deviceorientationabsolute', h);
      window.addEventListener('deviceorientation', h);
    };
    if (DOE && typeof DOE.requestPermission === 'function') {
      DOE.requestPermission().then((r) => { if (r === 'granted') listen(); }).catch(() => {});
    } else {
      listen();
    }
  }

  // Glide your agent towards the latest GPS fix.
  function movePlayer(dt) {
    let moving = 0, faceTo = null;
    if (gps.target) {
      const d = W.distM(pos, gps.target);
      if (d > 300) { pos.lat = gps.target.lat; pos.lng = gps.target.lng; }
      else {
        const k = 1 - Math.exp(-dt * 2.5);
        pos.lat += (gps.target.lat - pos.lat) * k;
        pos.lng += (gps.target.lng - pos.lng) * k;
        moving = d > 1 ? 1 : 0;
        if (moving) faceTo = gps.target;
      }
    }
    M.setPlayer({ lat: pos.lat, lng: pos.lng, heading, moving, faceTo });
  }

  function refreshEntities(force) {
    const center = { lat: pos.lat, lng: pos.lng };
    if (!force && entAt && W.distM(entAt, center) < 40 && entTimer < 3) return;
    entTimer = 0;
    entAt = center;
    const r = clamp(M.radiusM, 250, 1400);
    const now = Date.now();
    const a = W.around(center.lat, center.lng, r, now);
    if (gps.tooFast) a.spawns = [];
    ents = a;
    M.setEntities(ents);
  }

  function scanPulse() {
    const el = $('scan-pulse');
    el.classList.remove('go');
    void el.offsetWidth;
    el.classList.add('go');
    sfx.hack();
  }

  // Messages from the game rules: missions done, Rifts lost.
  function showNews() {
    for (const e of S.save.events.splice(0)) UI.toast(esc(e), e.startsWith('Mission') ? 'good' : 'bad');
  }

  function walkRewards(news) {
    for (const n of news) {
      if (n.kind === 'buddy') UI.toast(`🐾 Your buddy ${esc(C.byId(n.sp).name)} found 5 DNA while you walked.`, 'good');
      else { sfx.crate(); UI.toast(`🎒 1 km walked! Supply stash: 🔮 ${n.loot.orbs} · 🎯 ${n.loot.darts} · 💠 ${n.loot.shards}`, 'good'); }
    }
  }

  function updateHud() {
    const s = S.save;
    const L = S.level();
    $('hud-name').textContent = s.agent.name;
    $('hud-level').textContent = `Lv ${L.level}`;
    $('hud-xp').style.width = `${Math.round(L.frac * 100)}%`;
    $('hud-glyph').textContent = S.faction().glyph;
    $('hud-orbs').textContent = s.items.orbs;
    $('hud-darts').textContent = s.items.darts;
    $('hud-shards').textContent = s.items.shards;
    $('btn-missions').classList.toggle('ready', S.missionsReady());
    const attr = M.attribution;
    $('map-attrib').hidden = !attr;
    if ($('map-attrib').textContent !== attr) $('map-attrib').textContent = attr;
  }

  // The little tracker of the closest creatures, bottom left.
  function updateNearby() {
    const list = !located() ? [] : ents.spawns
      .filter((s) => !S.isGone(s))
      .map((s) => ({ s, d: W.distM(pos, s) }))
      .filter((x) => x.d < M.SIGHT)
      .sort((a, b) => a.d - b.d)
      .slice(0, 4);
    const key = list.map((x) => `${x.s.id}:${Math.round(x.d / 10)}`).join();
    if (key === nearbyKey) return;
    nearbyKey = key;
    const el = $('nearby');
    el.innerHTML = list.map((x, i) => `<button class="nb ${x.d <= S.RANGE ? 'in' : ''}" data-i="${i}" style="--r:${C.RARITY[C.byId(x.s.sp).rar].color}"><canvas data-sp="${x.s.sp}"></canvas><small>${x.d <= S.RANGE ? 'Here!' : fmtDist(x.d)}</small></button>`).join('');
    el.querySelectorAll('canvas').forEach((cv) => RB.beasts.portraitLater(cv, cv.dataset.sp));
    el.querySelectorAll('.nb').forEach((b) => b.addEventListener('click', () => { sfx.tap(); UI.spawnSheet(list[+b.dataset.i].s); }));
  }

  /* ======================= Encounters & battles ======================= */

  function engage(spawn) {
    if (!located() || W.distM(pos, spawn) > S.RANGE + 5) { UI.toast('Too far away now.'); return; }
    if (S.save.items.orbs <= 0 && S.save.items.darts <= 0) {
      UI.toast('You have no orbs or darts. Hack Rifts and open caches for supplies.', 'bad');
      sfx.error();
      return;
    }
    // Motion permission has to be asked straight from the tap on iOS.
    const perm = RB.ar.requestSensorPermission();
    mode = 'encounter';
    $('map-screen').hidden = true;
    RB.encounter.start(spawn, (res) => {
      mode = 'map';
      $('map-screen').hidden = false;
      M.show();
      refreshEntities(true);
      updateHud();
      if (res && res.creature) UI.toast(`${esc(C.byId(res.creature.sp).name)} was added to your Lab.`, 'good');
    }, { useCamera: S.save.settings.ar !== false, sensors: perm });
  }

  function assault(rift) {
    if (!located() || W.distM(pos, rift) > S.RANGE + 5) { UI.toast('Too far away now.'); return; }
    const st = S.riftState(rift);
    if (!st.faction || st.faction === S.save.agent.faction) return;
    mode = 'battle';
    $('map-screen').hidden = true;
    const team = S.team();
    RB.battle.start(team, st.guard, { title: rift.name, winText: `${rift.name} is knocked back to unclaimed. Claim it for the ${S.faction().name}!` }, (out) => {
      mode = 'map';
      $('map-screen').hidden = false;
      M.show();
      if (out && out.win) {
        const r = S.neutralize(rift);
        UI.toast(`Guardians defeated! DNA: ${r.dna.map((d) => `+${d.n} ${esc(C.byId(d.sp).name)}`).join(', ')}`, 'good');
        if (r.up) UI.levelUp(r.up);
        refreshEntities(true);
        UI.riftSheet(rift);
      }
      updateHud();
    });
  }

  /* ======================= Loop ======================= */

  // Swirling rift behind the title screens.
  const motes = Array.from({ length: 140 }, (_, i) => ({ a: Math.random() * TAU, r: Math.random(), s: 0.2 + Math.random() * 0.8, i }));
  let obT = 0;
  function drawOnboardBg(dt) {
    const cv = $('ob-bg');
    const c = cv.getContext('2d');
    obT += dt;
    const w = cv.width, h = cv.height;
    c.fillStyle = 'rgba(8,5,20,0.35)';
    c.fillRect(0, 0, w, h);
    const cx = w / 2, cy = h * 0.3, R = Math.max(w, h) * 0.55;
    const col = document.body.dataset.faction === 'B' ? '255,79,163' : document.body.dataset.faction === 'W' ? '46,230,197' : '180,92,255';
    for (const m of motes) {
      m.a += dt * m.s * (0.6 - m.r * 0.4);
      m.r -= dt * 0.03 * m.s;
      if (m.r < 0.02) m.r = 1;
      const rr = m.r * R;
      const x = cx + Math.cos(m.a) * rr, y = cy + Math.sin(m.a) * rr * 0.45;
      c.fillStyle = `rgba(${col},${(1 - m.r) * 0.9})`;
      c.beginPath(); c.arc(x, y, (1 - m.r) * 3 + 0.5, 0, TAU); c.fill();
    }
    const g = c.createRadialGradient(cx, cy, 2, cx, cy, R * 0.25);
    g.addColorStop(0, `rgba(255,255,255,${0.5 + Math.sin(obT * 2) * 0.1})`);
    g.addColorStop(0.3, `rgba(${col},0.35)`);
    g.addColorStop(1, `rgba(${col},0)`);
    c.fillStyle = g;
    c.beginPath(); c.ellipse(cx, cy, R * 0.12, R * 0.3, 0, 0, TAU); c.fill();
  }

  function frame(ts) {
    const dt = Math.min(0.05, last ? (ts - last) / 1000 : 0.016);
    last = ts;
    if (mode === 'onboard') {
      drawOnboardBg(dt);
    } else if (mode === 'encounter') {
      RB.encounter.update(dt);
    } else if (mode === 'battle') {
      RB.battle.update(dt);
    } else if (mode === 'map') {
      const now = Date.now();
      movePlayer(dt);
      entTimer += dt;
      if (entTimer > 1) refreshEntities(false);
      M.render(dt, now);
      UI.tick(dt);
      hudTimer += dt;
      if (hudTimer > 0.5) {
        hudTimer = 0;
        updateHud();
        updateNearby();
        showNews();
        S.save.lastPos = { lat: pos.lat, lng: pos.lng };
      }
      tickTimer += dt;
      if (tickTimer > 30) {
        tickTimer = 0;
        if (S.tick()) refreshEntities(true);
        S.persist();
      }
    }
    requestAnimationFrame(frame);
  }

  boot();
})(window.RB);
