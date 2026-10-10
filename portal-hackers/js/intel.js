/* Portal Hackers: Nexus — the Intel map. Every portal comes from the same
   seeded world as the game, so this map shows exactly what players find on
   the street: who holds each portal, its level and rarity. If you're logged
   into the game on this device, the map also shows your own portals, links
   and control fields, and your keys. It only reads your save; it never
   changes it. */
(function (PH) {
  'use strict';

  const D = PH.data, W = PH.world, S = PH.state, SC = PH.score;
  const { esc, fmt, fmtDist } = PH.util;
  const $ = (id) => document.getElementById(id);
  const MIN_ZOOM = 14;
  const MIN_NET_ZOOM = 13;
  const q = new URLSearchParams(location.search);
  if (q.get('embed')) document.body.classList.add('embed');

  /* ------------------ Your save, read-only ------------------ */

  let me = null;
  try {
    const acc = PH.accounts.current();
    if (acc) {
      S.useAccount(acc.id);
      const s = S.load();
      if (s) { S.start(s); me = S.save; }
    }
  } catch (e) { me = null; }
  $('who').textContent = me ? `Agent ${me.name} · ${D.TEAMS[me.team].name}` : 'World map · log into the game on this device to see your links';

  const ownerOf = (p) => (me ? S.ownerOf(p) : W.baseOwner(p, Date.now()));
  const uplinksOf = (p) => (me ? S.uplinksOf(p) : null);

  /* ------------------ Map ------------------ */

  const start = (() => {
    if (q.get('lat') && q.get('lng')) return [Number(q.get('lat')), Number(q.get('lng'))];
    if (me && me.home) return [me.home.lat, me.home.lng];
    return [51.5079, -0.1281];
  })();

  const map = L.map('map', { zoomControl: false, attributionControl: true, minZoom: 3, maxZoom: 19, worldCopyJump: true }).setView(start, 16);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd', maxZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
  }).addTo(map);

  const fieldLayer = L.layerGroup().addTo(map);
  const linkLayer = L.layerGroup().addTo(map);
  const portalLayer = L.layerGroup().addTo(map);

  /* ------------------ Filters ------------------ */

  const show = { common: true, rare: true, epic: true, legendary: true, nexus: true, N: true, P: true, E: true, neutral: true, links: true };
  const FILTERS = [
    ['common', '🔵 Common'], ['rare', '🟣 Rare'], ['epic', '🟠 Epic'], ['legendary', '🟡 Legendary'], ['nexus', '⚫ Nexus'],
    ['N', '✦ NOVA'], ['P', '◈ PULSAR'], ['E', '◐ ECLIPSE'], ['neutral', 'Neutral'],
    ['links', '🔺 Links & fields'],
  ];
  function drawFilters() {
    $('filters').innerHTML = FILTERS.map(([k, label]) => `<button type="button" data-f="${k}" class="${show[k] ? '' : 'off'}" aria-pressed="${show[k]}">${label}</button>`).join('');
  }
  $('filters').addEventListener('click', (e) => {
    const b = e.target.closest('[data-f]');
    if (!b) return;
    show[b.dataset.f] = !show[b.dataset.f];
    drawFilters();
    redraw();
  });
  drawFilters();
  $('filters-btn').addEventListener('click', () => {
    const top = document.querySelector('.top');
    top.classList.toggle('open');
    $('filters-btn').setAttribute('aria-expanded', top.classList.contains('open'));
  });

  /* ------------------ Portals ------------------ */

  const SIZE = { common: 5, rare: 6, epic: 7, legendary: 8, nexus: 10 };
  const teamColor = (o) => (o ? D.TEAMS[o].color : '#8A94A8');

  function popup(p) {
    const R = D.RARITY[p.rarity];
    const o = ownerOf(p);
    const ups = uplinksOf(p);
    const rec = me && me.portals[p.id];
    const keys = me ? S.keyCount(p.id) : 0;
    const lvl = me ? S.level() : 1;
    return `<b class="pn" style="color:${R.color}">${esc(p.name)}</b>
      ${R.icon} ${R.name} portal · ${R.diff}<br>
      Held by <b style="color:${teamColor(o)}">${o ? D.TEAMS[o].name : 'Neutral'}</b>${o && ups != null ? ` · L${ups} (${ups}/8 Uplinks)` : ''}${rec && rec.mine && o === me.team ? ' · <b>yours</b>' : ''}<br>
      Worth ${fmt(R.xp[0])}–${fmt(R.xp[1])} XP${keys ? ` · 🔑 ×${keys}` : ''}<br>
      ${me && lvl < R.level ? `<small>You can capture it from Level ${R.level}</small><br>` : ''}
      ${me && me.home ? `<small>${fmtDist(W.distM(me.home, p))} from your last position</small><br>` : ''}
      <small>${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}</small>`;
  }

  function redraw() {
    portalLayer.clearLayers();
    linkLayer.clearLayers();
    fieldLayer.clearLayers();
    const z = map.getZoom();
    const netCount = { N: 0, P: 0, E: 0 };
    // Everyone else's links and fields, drawn under yours. A link or field
    // only stands while its team still holds all of its portals.
    if (show.links && z >= MIN_NET_ZOOM) {
      const bounds0 = map.getBounds(), c0 = bounds0.getCenter();
      const r0 = Math.min(8000, W.distM({ lat: c0.lat, lng: c0.lng }, { lat: bounds0.getNorth(), lng: bounds0.getEast() }) * 1.1);
      // Logged in: the same standing networks the game sees (yours win any
      // crossing). Logged out: everything standing in the seeded world.
      const net = me ? S.worldNetworks({ lat: c0.lat, lng: c0.lng }, r0) : W.networks({ lat: c0.lat, lng: c0.lng }, r0, Date.now());
      const holds = (team, ...ids) => me || ids.every((id) => { const p = W.portalById(id); return p && ownerOf(p) === team; });
      for (const f of net.fields) {
        if (!show[f.team] || !holds(f.team, f.a, f.b, f.c)) continue;
        const a = W.portalById(f.a), b = W.portalById(f.b), c = W.portalById(f.c);
        const col = D.TEAMS[f.team].color;
        L.polygon([[a.lat, a.lng], [b.lat, b.lng], [c.lat, c.lng]], { color: col, weight: 0, fillColor: col, fillOpacity: 0.13 })
          .bindTooltip(`${D.TEAMS[f.team].name} control field · ${fmt(f.cp)} CP`, { sticky: true }).addTo(fieldLayer);
        netCount[f.team]++;
      }
      for (const l of net.links) {
        if (!show[l.team] || !holds(l.team, l.a, l.b)) continue;
        const a = W.portalById(l.a), b = W.portalById(l.b);
        L.polyline([[a.lat, a.lng], [b.lat, b.lng]], { color: D.TEAMS[l.team].color, weight: 1.5, opacity: 0.75 }).addTo(linkLayer);
      }
    }
    // Your fields and links, on top and a little brighter.
    if (me && show.links) {
      const col = D.TEAMS[me.team].color;
      for (const f of me.fields) {
        const a = W.portalById(f.a), b = W.portalById(f.b), c = W.portalById(f.c);
        if (!a || !b || !c) continue;
        L.polygon([[a.lat, a.lng], [b.lat, b.lng], [c.lat, c.lng]], { color: col, weight: 0, fillColor: col, fillOpacity: 0.22 })
          .bindTooltip(`Your control field · ${fmt(f.cp || 10)} CP`, { sticky: true }).addTo(fieldLayer);
        netCount[me.team]++;
      }
      for (const l of me.links) {
        const a = W.portalById(l.a), b = W.portalById(l.b);
        if (!a || !b) continue;
        L.polyline([[a.lat, a.lng], [b.lat, b.lng]], { color: col, weight: 2.5, opacity: 1 }).addTo(linkLayer);
      }
    }
    const fieldText = show.links && z >= MIN_NET_ZOOM ? ` · fields 🔺 ✦ ${netCount.N} · ◈ ${netCount.P} · ◐ ${netCount.E}` : '';
    if (z < MIN_ZOOM) {
      $('status').textContent = `Zoom in to see portals${fieldText}`;
      return;
    }
    const bounds = map.getBounds();
    const c = bounds.getCenter();
    const radius = Math.min(6000, W.distM({ lat: c.lat, lng: c.lng }, { lat: bounds.getNorth(), lng: bounds.getEast() }) * 1.05);
    const found = W.around({ lat: c.lat, lng: c.lng }, radius, Date.now()).portals;
    let n = 0;
    const count = { N: 0, P: 0, E: 0, neutral: 0 };
    for (const p of found) {
      if (!bounds.contains([p.lat, p.lng])) continue;
      const o = ownerOf(p);
      count[o || 'neutral']++;
      if (!show[p.rarity] || !show[o || 'neutral']) continue;
      const nexus = p.rarity === 'nexus';
      L.circleMarker([p.lat, p.lng], {
        radius: SIZE[p.rarity] + (z >= 17 ? 2 : 0),
        color: nexus ? '#E9E4FF' : D.RARITY[p.rarity].color,
        weight: 2,
        fillColor: nexus ? '#000' : teamColor(o),
        fillOpacity: o || nexus ? 0.9 : 0.55,
      }).bindPopup(() => popup(p)).addTo(portalLayer);
      n++;
    }
    $('status').textContent = `${n} portal${n === 1 ? '' : 's'} · ✦ ${count.N} · ◈ ${count.P} · ◐ ${count.E} · ${count.neutral} neutral${fieldText}`;
  }

  map.on('moveend', redraw);
  redraw();

  /* ------------------ My location ------------------ */

  $('me').addEventListener('click', () => {
    if (!navigator.geolocation) { if (me && me.home) map.setView([me.home.lat, me.home.lng], 16); return; }
    $('status').textContent = 'Finding you…';
    navigator.geolocation.getCurrentPosition((pos) => {
      map.setView([pos.coords.latitude, pos.coords.longitude], 16);
      L.circleMarker([pos.coords.latitude, pos.coords.longitude], { radius: 7, color: '#fff', weight: 2, fillColor: '#35E0FF', fillOpacity: 1 }).addTo(map);
    }, () => {
      if (me && me.home) map.setView([me.home.lat, me.home.lng], 16);
      $('status').textContent = 'Location is off; showing your last position';
    }, { timeout: 10000, maximumAge: 60000 });
  });

  /* ------------------ World standings ------------------ */

  function standings() {
    const now = Date.now();
    return me ? S.worldStandings(now) : SC.standings(now, null);
  }

  function drawScore() {
    const st = standings();
    const total = SC.TEAMS.reduce((x, t) => x + st.avg[t], 0) || 1;
    $('score').innerHTML = `<span><b>${D.TEAMS[st.leader].name}</b> leads cycle ${st.cycle.index + 1}</span>
      <span class="bar">${st.order.map((t) => `<i style="width:${(st.avg[t] / total) * 100}%;background:${SC.CHART[t]}"></i>`).join('')}</span><span>›</span>`;
    if ($('side').classList.contains('on')) {
      $('side-body').innerHTML = PH.worldchart.render(st, { myTeam: me && me.team, agents: me ? S.topAgents(now()) : SC.topAgents(Date.now(), null) });
    }
  }
  const now = () => Date.now();
  $('score').addEventListener('click', () => { $('side').classList.add('on'); drawScore(); });
  $('side-x').addEventListener('click', () => $('side').classList.remove('on'));
  drawScore();
  setInterval(drawScore, 30000);
})(window.PH);
