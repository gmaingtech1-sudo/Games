/* Portal Hackers: Nexus — start-up, onboarding, GPS or tap-to-walk, the
   compass sensor, and the game loop: scanning for portals, picking up energy
   cells, locking onto Nexus signals, and drawing the compass. */
window.PH = window.PH || {};
(function (PH) {
  'use strict';

  const D = PH.data;
  const S = PH.state;
  const W = PH.world;
  const A = PH.audio;
  const UI = PH.ui;
  const C = PH.compass;
  const { esc } = PH.util;
  const $ = (id) => document.getElementById(id);

  const WALK_SPEED = 6;           // m/s in tap-to-walk mode (a brisk jog)
  const TOO_FAST = 11;            // m/s (~40 km/h): no scanning while driving
  const DEFAULT_HOME = { lat: 51.5079, lng: -0.1281 };   // Trafalgar Square

  const game = {
    pos: { lat: DEFAULT_HOME.lat, lng: DEFAULT_HOME.lng },
    nearby: { portals: [], energy: [], signals: [] },
    linkFrom: null,
    walkTo: null,
    setWalk(ll) { game.walkTo = ll; },
    setWalkMode,
  };
  PH.game = game;

  let heading = null;
  let rangeMode = 0;              // 0 near, 1 wide, 2 territory map
  const gps = { watch: null, state: 'off', target: null, last: null, tooFast: false };
  let lastRefresh = { t: 0, lat: 0, lng: 0 };
  let lastSlow = 0, lastAttack = 0;

  /* ------------------ Onboarding ------------------ */

  function step(name) {
    document.querySelectorAll('.ob-step').forEach((el) => { el.hidden = el.dataset.step !== name; });
  }

  let pickTeam = null;

  function onboarding() {
    const existing = S.load();
    if (existing) {
      $('ob-continue').hidden = false;
      $('ob-continue').textContent = `Continue as ${existing.prestige ? `[P${existing.prestige}] ` : ''}${existing.name}`;
      $('ob-begin').textContent = 'New hacker';
      $('ob-begin').classList.remove('btn-main');
    }
    $('ob-continue').addEventListener('click', () => { A.unlock(); begin(existing); });
    $('ob-begin').addEventListener('click', () => {
      A.unlock();
      if (existing && !confirm('Start a new hacker? Your current one will be deleted.')) return;
      step('team');
    });
    $('ob-teams').innerHTML = Object.values(D.TEAMS).map((t) => `<button class="team-btn" data-t="${t.id}" type="button" style="--tc:${t.color}">
      <span class="team-glyph">${t.glyph}</span><span><b>${t.name}</b><small>${esc(t.motto)}</small></span></button>`).join('');
    $('ob-teams').addEventListener('click', (e) => {
      const b = e.target.closest('[data-t]');
      if (!b) return;
      A.tap();
      pickTeam = b.dataset.t;
      step('name');
      setTimeout(() => $('ob-name').focus(), 50);
    });
    $('ob-name-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = $('ob-name').value.trim().replace(/\s+/g, ' ') || 'NovaPlayer';
      S.reset();
      const s = S.fresh(name.slice(0, 16), pickTeam);
      S.start(s);
      S.persist(true);
      step('move');
    });
    $('ob-gps').addEventListener('click', () => { S.save.settings.walk = 'gps'; S.persist(); begin(S.save); });
    $('ob-tap').addEventListener('click', () => { S.save.settings.walk = 'tap'; S.persist(); begin(S.save); });
  }

  function begin(save) {
    S.start(save);
    A.enabled = save.settings.sound;
    document.body.dataset.team = save.team;
    document.body.style.setProperty('--team', D.TEAMS[save.team].color);
    $('onboard').hidden = true;
    $('game').hidden = false;
    C.resize();
    if (save.home) { game.pos.lat = save.home.lat; game.pos.lng = save.home.lng; }
    setWalkMode(save.settings.walk, true);
    startHeading();
    S.tick(Date.now());
    S.simulateAttacks(Date.now());
    refresh(true);
    UI.hud();
    requestAnimationFrame(loop);
    if (save.stats.hacked === 0 && save.stats.discovered === 0) {
      setTimeout(() => UI.toast('Welcome, SCOUT. Walk towards the <b>?</b> blips on your compass to discover portals.'), 800);
    }
  }

  /* ------------------ Moving ------------------ */

  function status(text, kind) {
    const el = $('gps-status');
    el.textContent = text || '';
    el.className = `gps-status ${text ? 'show' : ''} ${kind || ''}`;
  }

  function setWalkMode(mode, first) {
    S.save.settings.walk = mode;
    S.persist();
    if (mode === 'gps') {
      game.walkTo = null;
      startGPS();
    } else {
      stopGPS();
      if (!S.save.home) {
        // Start near where you really are, if the phone will say.
        if (navigator.geolocation && first) {
          navigator.geolocation.getCurrentPosition((p) => {
            if (S.save.home) return;
            game.pos.lat = p.coords.latitude;
            game.pos.lng = p.coords.longitude;
            S.save.home = { lat: game.pos.lat, lng: game.pos.lng };
            refresh(true);
          }, () => {}, { timeout: 8000, maximumAge: 600000 });
        }
      }
      status('Tap the compass to walk');
      setTimeout(() => { if (S.save.settings.walk === 'tap') status(''); }, 4000);
    }
  }

  function startGPS() {
    if (gps.watch != null) return;
    if (!navigator.geolocation) { gpsUnavailable('This device has no location. Switched to tap-to-walk.'); return; }
    gps.state = 'waiting';
    status('Finding your location…');
    gps.watch = navigator.geolocation.watchPosition(onPos, onPosErr, { enableHighAccuracy: true, maximumAge: 3000, timeout: 30000 });
  }

  function stopGPS() {
    if (gps.watch != null && navigator.geolocation) navigator.geolocation.clearWatch(gps.watch);
    gps.watch = null;
    gps.state = 'off';
    gps.target = null;
    gps.tooFast = false;
  }

  function gpsUnavailable(text) {
    stopGPS();
    S.save.settings.walk = 'tap';
    S.persist();
    UI.toast(esc(text), 'bad');
    status('Tap the compass to walk');
  }

  function onPos(p) {
    const ll = { lat: p.coords.latitude, lng: p.coords.longitude };
    if (gps.state !== 'ok') {
      gps.state = 'ok';
      game.pos.lat = ll.lat;
      game.pos.lng = ll.lng;
      refresh(true);
    }
    if (gps.last && p.coords.accuracy < 35) {
      const d = W.distM(gps.last, ll);
      const dt = Math.max(0.5, (p.timestamp - gps.last.t) / 1000);
      const speed = p.coords.speed != null ? p.coords.speed : d / dt;
      gps.tooFast = speed > TOO_FAST;
      if (d < 150 && !gps.tooFast) S.save.stats.meters += d;
    }
    gps.last = { lat: ll.lat, lng: ll.lng, t: p.timestamp };
    gps.target = ll;
    status(gps.tooFast ? 'Moving too fast. The scanner is paused.' : p.coords.accuracy > 60 ? 'Weak GPS signal…' : '', gps.tooFast || p.coords.accuracy > 60 ? 'warn' : '');
  }

  function onPosErr(e) {
    if (e.code === 1) gpsUnavailable('Location is blocked, so you tap the compass to walk instead. You can allow location in your browser settings.');
    else if (gps.state !== 'ok') status('Still looking for GPS… (or switch to tap-to-walk in the menu)', 'warn');
  }

  function startHeading() {
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
      // iOS asks on a tap.
      const ask = () => {
        document.removeEventListener('click', ask);
        DOE.requestPermission().then((r) => { if (r === 'granted') listen(); }).catch(() => {});
      };
      document.addEventListener('click', ask);
    } else {
      listen();
    }
  }

  function movePlayer(dt) {
    const pos = game.pos;
    if (S.save.settings.walk === 'tap' && game.walkTo) {
      const d = W.distM(pos, game.walkTo);
      const stepM = Math.min(d, WALK_SPEED * dt);
      if (d < 0.5) game.walkTo = null;
      else {
        const k = stepM / d;
        pos.lat += (game.walkTo.lat - pos.lat) * k;
        pos.lng += (game.walkTo.lng - pos.lng) * k;
        S.save.stats.meters += stepM;
      }
      S.save.home = { lat: pos.lat, lng: pos.lng };
    } else if (gps.target) {
      const d = W.distM(pos, gps.target);
      if (d > 300) { pos.lat = gps.target.lat; pos.lng = gps.target.lng; }
      else {
        const k = 1 - Math.exp(-dt * 2.5);
        pos.lat += (gps.target.lat - pos.lat) * k;
        pos.lng += (gps.target.lng - pos.lng) * k;
      }
    }
  }

  /* ------------------ The world around you ------------------ */

  function radarRange() {
    if (rangeMode === 2) return 1000;
    const base = Math.max(150, S.scanRange() * 1.6);
    return rangeMode === 1 ? base * 2 : base;
  }

  function refresh(force) {
    const now = Date.now();
    const moved = W.distM(lastRefresh, game.pos);
    if (!force && now - lastRefresh.t < 1500 && moved < 8) return;
    lastRefresh = { t: now, lat: game.pos.lat, lng: game.pos.lng };
    const sigR = S.has('quantum') ? S.signalRange() : 0;
    const r = Math.max(radarRange(), S.linkRange(), sigR) + 20;
    const a = W.around(game.pos, r, now);
    game.nearby = {
      portals: a.portals.filter((p) => S.visible(p)),
      energy: a.energy.filter((e) => !S.save.energyTaken[e.id]),
      signals: sigR ? a.signals.filter((sg) => sg.dist <= sigR && !S.save.signals[sg.id]) : [],
    };
  }

  // Discover what's in range, collect energy cells and Nexus signals.
  function scanTick() {
    if (gps.tooFast || PH.hack.running) return;
    const pos = game.pos;
    const sr = S.scanRange();
    for (const p of game.nearby.portals) {
      if (!S.discovered(p) && W.distM(pos, p) <= sr) S.discover(p);
    }
    // Energy cells wait on the compass until you have room for them.
    for (const e of game.nearby.energy) {
      if (S.save.energy < S.maxEnergy() && !S.save.energyTaken[e.id] && W.distM(pos, e) <= D.RANGE.interact) {
        const got = S.takeEnergy(e);
        A.energy();
        UI.toast(`🔋 +${got} energy`);
      }
    }
    for (const sg of game.nearby.signals) {
      if (!S.save.signals[sg.id] && W.distM(pos, sg) <= D.RANGE.interact) S.discoverSignal(sg);
    }
    game.nearby.energy = game.nearby.energy.filter((e) => !S.save.energyTaken[e.id]);
    game.nearby.signals = game.nearby.signals.filter((sg) => !S.save.signals[sg.id]);
  }

  /* ------------------ Input ------------------ */

  function onCompassTap(ent) {
    A.tap();
    if (ent.kind === 'portal') UI.portalSheet(ent.id);
    else if (ent.kind === 'energy') UI.energySheet(ent);
    else if (ent.kind === 'signal') UI.signalSheet(ent);
  }

  function onGroundTap(ll) {
    if (S.save.settings.walk !== 'tap') return;
    game.walkTo = ll;
  }

  function bind() {
    C.init($('compass'), { tap: onCompassTap, ground: onGroundTap });
    $('btn-scan').addEventListener('click', () => {
      A.ping();
      $('btn-scan').classList.remove('pulse');
      void $('btn-scan').offsetWidth;
      $('btn-scan').classList.add('pulse');
      refresh(true);
      UI.scanSheet();
    });
    $('btn-range').addEventListener('click', () => { A.tap(); rangeMode = rangeMode === 0 ? 1 : 0; refresh(true); });
    $('btn-territory').addEventListener('click', () => {
      A.tap();
      rangeMode = rangeMode === 2 ? 0 : 2;
      $('btn-territory').classList.toggle('on', rangeMode === 2);
      if (rangeMode === 2) UI.toast('🗺️ Territory map: who holds every portal within 1 km');
      refresh(true);
    });
    $('btn-rotate').addEventListener('click', () => {
      A.tap();
      S.save.settings.rotate = !S.save.settings.rotate;
      S.persist();
      UI.toast(S.save.settings.rotate ? (heading == null ? '🧭 No compass sensor found: north stays up' : '🧭 The compass turns with your phone') : '🧭 North stays up');
    });
    window.addEventListener('resize', () => C.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') S.persist(true);
      else { S.tick(Date.now()); S.simulateAttacks(Date.now()); refresh(true); }
    });
  }

  /* ------------------ Loop ------------------ */

  let lastT = 0;
  function loop(t) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.1, (t - lastT) / 1000 || 0);
    lastT = t;
    movePlayer(dt);
    refresh(false);
    const now = Date.now();
    const s = S.save;

    if (s.defense) {
      const dp = W.portalById(s.defense.id);
      S.tickDefense(dt, dp ? W.distM(game.pos, dp) : Infinity);
    }

    if (now - lastSlow > 500) {
      lastSlow = now;
      S.tick(now);
      scanTick();
      UI.hud();
    }
    if (now - lastAttack > 60e3) {
      lastAttack = now;
      S.simulateAttacks(now);
    }

    const range = radarRange();
    const team = s.team;
    const portals = game.nearby.portals.map((p) => {
      const r = s.portals[p.id] || {};
      const owner = S.ownerOf(p, now);
      const dist = W.distM(game.pos, p);
      return {
        kind: 'portal', id: p.id, lat: p.lat, lng: p.lng, rarity: p.rarity,
        known: S.discovered(p), owner,
        mine: !!(r.mine && owner === team),
        breached: r.breach > now,
        defending: s.defense && s.defense.id === p.id,
        ready: S.discovered(p) && dist <= D.RANGE.interact && !(r.hackAt > now),
      };
    });
    const links = [];
    for (const l of s.links) {
      const a = W.portalById(l.a), b = W.portalById(l.b);
      if (a && b && (W.distM(game.pos, a) < range * 1.5 || W.distM(game.pos, b) < range * 1.5)) links.push({ a, b });
    }
    C.draw({
      t: t / 1000,
      pos: game.pos,
      heading,
      follow: s.settings.rotate && heading != null,
      range,
      scan: S.scanRange(),
      territory: rangeMode === 2,
      portals,
      energy: rangeMode === 2 ? [] : game.nearby.energy,
      signals: rangeMode === 2 ? [] : game.nearby.signals,
      links,
      linkFrom: game.linkFrom,
      linkRange: S.linkRange(),
      walkTo: game.walkTo,
      teamColor: D.TEAMS[team].color,
      skin: s.skin,
      frame: s.frame,
      portalFx: s.portalFx,
    });
  }

  /* ------------------ Start ------------------ */

  S.on(UI.onEvent);
  UI.bind();
  bind();
  onboarding();
})(window.PH);
