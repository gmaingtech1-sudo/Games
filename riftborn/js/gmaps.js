/* Riftborn — Google Maps street tiles, through Google's Map Tiles API.

   With a key (set in Menu → Google Maps, or baked into config.js for the
   Android build), the 3D map lays Google's roadmap tiles on the ground in a
   day style or a night style. Each style needs a session from
   createSession; tiles are then fetched by z/x/y. Google's copyright line
   for the area in view comes from the viewport endpoint and is shown in the
   corner, as Google requires.

   Without a key, or if Google refuses it, the map uses the free CARTO
   tiles instead. */
window.RB = window.RB || {};
(function (RB) {
  'use strict';

  const API = 'https://tile.googleapis.com';

  // Game look: keep streets, parks and water; drop shop and transit labels
  // so creatures and Rifts stand out, like Pokémon GO.
  const CLEAN = [
    { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
    { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
    { featureType: 'transit', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  ];
  const STYLES = {
    day: CLEAN.concat([
      { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#CFE3B8' }] },
      { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#9ED08A' }] },
      { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#7CC4F0' }] },
      { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
      { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#FFE3A0' }] },
    ]),
    // Ingress-style scanner: black, faint teal roads, no labels at all.
    scanner: [
      { elementType: 'labels', stylers: [{ visibility: 'off' }] },
      { featureType: 'poi', stylers: [{ visibility: 'off' }] },
      { featureType: 'transit', stylers: [{ visibility: 'off' }] },
      { featureType: 'administrative', elementType: 'geometry', stylers: [{ visibility: 'off' }] },
      { elementType: 'geometry', stylers: [{ color: '#050809' }] },
      { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#0A1113' }] },
      { featureType: 'poi.park', elementType: 'geometry', stylers: [{ visibility: 'on' }, { color: '#07130F' }] },
      { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1E3A3A' }] },
      { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#27504D' }] },
      { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#2F6660' }] },
      { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#021018' }] },
    ],
    night: CLEAN.concat([
      { elementType: 'geometry', stylers: [{ color: '#1C1733' }] },
      { elementType: 'labels.text.fill', stylers: [{ color: '#8E86B8' }] },
      { elementType: 'labels.text.stroke', stylers: [{ color: '#120E22' }] },
      { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#1E2E2A' }] },
      { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#3A3160' }] },
      { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#5A4486' }] },
      { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0C1830' }] },
    ]),
  };

  const sessions = {};     // style → { token, expires } or { pending }
  let status = { state: 'off', text: '' };
  let failures = 0;
  let copyright = '';
  let lastViewport = '';

  function key() {
    const s = RB.state && RB.state.save;
    const mine = s && s.settings && s.settings.googleKey;
    return (mine || (window.RB_CONFIG && window.RB_CONFIG.googleMapsKey) || '').trim();
  }

  // Google is in use when there's a key and it hasn't been refused.
  const active = () => !!key() && status.state !== 'error' && failures < 12;

  async function createSession(style) {
    const k = key();
    const m = /^[a-z]{2,3}(-[A-Za-z]{2})?/.exec(navigator.language || '');
    const lang = m ? m[0] : 'en-US';
    const res = await fetch(`${API}/v1/createSession?key=${encodeURIComponent(k)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mapType: 'roadmap',
        language: lang,
        region: (lang.split('-')[1] || 'US').toUpperCase(),
        scale: 'scaleFactor2x',
        highDpi: true,
        styles: STYLES[style],
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.session) {
      const msg = (body.error && body.error.message) || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return { token: body.session, expires: Number(body.expiry || 0) * 1000 || Date.now() + 12 * 3600e3 };
  }

  // A tile URL, or null while the session is being set up.
  function tileUrl(style, z, x, y) {
    const s = sessions[style];
    if (s && s.token && s.expires > Date.now() + 60e3) {
      return `${API}/v1/2dtiles/${z}/${x}/${y}?session=${s.token}&key=${encodeURIComponent(key())}`;
    }
    if (!s || !s.pending) {
      sessions[style] = { pending: true };
      status = { state: 'loading', text: 'Connecting to Google Maps…' };
      createSession(style).then((got) => {
        sessions[style] = got;
        status = { state: 'ok', text: 'Google Maps is on.' };
        failures = 0;
      }).catch((e) => {
        sessions[style] = null;
        status = { state: 'error', text: `Google refused the key: ${e.message}` };
      });
    }
    return null;
  }

  function tileLoaded() { failures = 0; }
  function tileFailed() { failures++; if (failures >= 12) status = { state: 'error', text: 'Google Maps tiles are not loading. Using the free map for now.' }; }

  // Google's copyright line for what's on screen (checked now and then).
  function updateCopyright(style, zoom, bounds) {
    const s = sessions[style];
    if (!s || !s.token) return;
    const q = `${zoom}/${bounds.north.toFixed(3)}/${bounds.south.toFixed(3)}/${bounds.east.toFixed(3)}/${bounds.west.toFixed(3)}`;
    if (q === lastViewport) return;
    lastViewport = q;
    const url = `${API}/tile/v1/viewport?session=${s.token}&key=${encodeURIComponent(key())}&zoom=${zoom}` +
      `&north=${bounds.north}&south=${bounds.south}&east=${bounds.east}&west=${bounds.west}`;
    fetch(url).then((r) => r.json()).then((b) => { if (b && b.copyright) copyright = b.copyright; }).catch(() => {});
  }

  // Forget sessions (after the key changes).
  function reset() {
    for (const k of Object.keys(sessions)) delete sessions[k];
    status = { state: key() ? 'loading' : 'off', text: key() ? 'Connecting to Google Maps…' : '' };
    failures = 0;
    copyright = '';
    lastViewport = '';
  }

  RB.gmaps = {
    key, active, tileUrl, tileLoaded, tileFailed, updateCopyright, reset,
    get status() { return status; },
    get copyright() { return copyright; },
  };
})(window.RB);
