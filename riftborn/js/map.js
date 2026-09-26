/* Riftborn — the map, in 3D. A camera hovers behind your agent and looks
   out across your real streets (map tiles laid on the ground) towards a
   hazy horizon, like Pokémon GO. Rifts rise as crystal towers with light
   beams, links and control fields glow on the ground, supply crates blink,
   and creatures walk around their spawn points. The sky and light follow
   the time of day. Drag to turn the view, pinch or scroll to zoom, tap
   things to interact. */
window.RB = window.RB || {};
(function (RB) {
  'use strict';

  const T = window.THREE;
  const G = RB.gfx;
  const W = RB.world;
  const S = RB.state;
  const C = RB.creatures;
  const P = RB.props;
  const { clamp } = RB.util;

  const SIGHT = 300;              // creatures further than this aren't shown
  const MIN_D = 55, MAX_D = 320;  // camera distance range (m)
  const PITCH = 0.56;             // camera angle below the horizon (rad)
  const AGENT_SCALE = 5;          // the map isn't to scale: props are big
  const TILE_URL = {
    day: (s, z, x, y) => `https://${s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/${z}/${x}/${y}@2x.png`,
    night: (s, z, x, y) => `https://${s}.basemaps.cartocdn.com/dark_nolabels/${z}/${x}/${y}@2x.png`,
    scanner: (s, z, x, y) => `https://${s}.basemaps.cartocdn.com/dark_nolabels/${z}/${x}/${y}@2x.png`,
  };

  let container = null, renderer = null, scene = null, camera = null;
  let handlers = {};
  const cam = { yaw: 0, dist: 95, target: new T.Vector3() };
  const player = { lat: 0, lng: 0, heading: null, faceTo: null, moving: 0 };
  let ents = { rifts: [], drops: [], spawns: [] };
  let t = 0;
  let sun, hemi, shadowCatcher, ground, groundMat;
  let agent, rangeRing, rangeFill, pulseRing, motes;
  let style = '';
  const live = { rifts: new Map(), drops: new Map(), spawns: new Map() };
  const picks = [];
  let links = null, fields = null, linkKey = '';

  const toV = (lat, lng, h) => { const p = W.toXY(lat, lng); return new T.Vector3(p[0], h || 0, -p[1]); };
  const toLL = (v) => W.toLL(v.x, -v.z);

  /* ======================= Setup ======================= */

  function init(el, h) {
    container = el;
    handlers = Object.assign(handlers, h);
    renderer = G.main();
    scene = new T.Scene();
    camera = new T.PerspectiveCamera(52, 1, 1, 4000);
    scene.environment = G.environment(renderer);

    hemi = new T.HemisphereLight('#CFE3FF', '#5A6B4A', 1.1);
    sun = new T.DirectionalLight('#FFF1DC', 2.4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const sc = sun.shadow.camera;
    sc.left = -90; sc.right = 90; sc.top = 90; sc.bottom = -90; sc.near = 10; sc.far = 500;
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.05;
    scene.add(hemi, sun, sun.target);

    // Ground under the map tiles (and instead of them offline).
    groundMat = new T.MeshLambertMaterial({ color: '#FFFFFF' });
    ground = new T.Mesh(new T.PlaneGeometry(6000, 6000), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.2;
    scene.add(ground);
    shadowCatcher = new T.Mesh(new T.PlaneGeometry(400, 400), new T.ShadowMaterial({ opacity: 0.32 }));
    shadowCatcher.rotation.x = -Math.PI / 2;
    shadowCatcher.position.y = 0.15;
    shadowCatcher.receiveShadow = true;
    shadowCatcher.renderOrder = 1;
    scene.add(shadowCatcher);

    // You
    agent = P.avatar(S.faction().color);
    agent.root.scale.setScalar(AGENT_SCALE);
    scene.add(agent.root);
    rangeRing = P.ringMarker(S.faction().color, S.RANGE * 1.1, 0.7);
    rangeRing.position.y = 0.4;
    scene.add(rangeRing);
    rangeFill = new T.Mesh(new T.CircleGeometry(S.RANGE, 64), G.additive(S.faction().color, null, 0.06));
    rangeFill.rotation.x = -Math.PI / 2;
    rangeFill.position.y = 0.35;
    scene.add(rangeFill);
    pulseRing = P.ringMarker(S.faction().color, 10, 0.8);
    pulseRing.position.y = 0.45;
    scene.add(pulseRing);

    // Floating rift energy around you.
    const N = 260;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 360; pos[i * 3 + 1] = Math.random() * 30; pos[i * 3 + 2] = (Math.random() - 0.5) * 360; }
    const mg = new T.BufferGeometry();
    mg.setAttribute('position', new T.BufferAttribute(pos, 3));
    motes = new T.Points(mg, new T.PointsMaterial({ map: G.glow(), size: 2.2, color: '#C9A8FF', transparent: true, opacity: 0.7, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false }));
    scene.add(motes);
    buildXM();

    bindInput();
  }

  function show() {
    G.attach(container);
    resize();
  }

  function resize() {
    G.fit();
    const el = renderer.domElement;
    camera.aspect = el.clientWidth / Math.max(1, el.clientHeight);
    camera.updateProjectionMatrix();
  }

  /* ======================= Time of day ======================= */

  function mapStyle() {
    const m = S.save.settings.map;
    if (m === 'grid' || m === 'scanner') return m;
    if (m === 'day' || m === 'night') return m;
    const h = new Date().getHours() + new Date().getMinutes() / 60;
    return h >= 6.5 && h < 19.5 ? 'day' : 'night';
  }

  function applyStyle(st) {
    style = st;
    if (st === 'scanner') { applyScanner(); return; }
    motes.material.color.set('#C9A8FF');
    motes.material.size = 2.2;
    xm.visible = false;
    const night = st !== 'day';
    const horizon = night ? '#241838' : '#CFE4F2';
    scene.background = G.gradient(night
      ? [[0, '#05040C'], [0.55, '#140E28'], [1, horizon]]
      : [[0, '#3E86D8'], [0.6, '#8EC0EC'], [1, horizon]]);
    scene.fog = new T.Fog(horizon, 280, 900);
    hemi.color.set(night ? '#6E62B8' : '#CFE3FF');
    hemi.groundColor.set(night ? '#1A1426' : '#5A6B4A');
    hemi.intensity = night ? 0.9 : 1.1;
    sun.color.set(night ? '#9FB0FF' : '#FFF1DC');
    sun.intensity = night ? 0.9 : 2.4;
    groundMat.map = groundTexture(st);
    groundMat.needsUpdate = true;
    motes.material.opacity = night ? 0.85 : 0.35;
    for (const tl of tiles.values()) disposeTile(tl);
    tiles.clear();
  }

  // The Ingress-style scanner: a near-black world with faint teal streets,
  // no labels, a dark horizon and glowing XM on the ground.
  function applyScanner() {
    scene.background = G.gradient([[0, '#000000'], [0.7, '#020708'], [1, '#08191B']]);
    scene.fog = new T.Fog('#061416', 280, 900);
    hemi.color.set('#6FA8A4');
    hemi.groundColor.set('#050A0A');
    hemi.intensity = 0.95;
    sun.color.set('#CFE8FF');
    sun.intensity = 1.1;
    groundMat.map = groundTexture('scanner');
    groundMat.needsUpdate = true;
    motes.material.color.set('#9FF4FF');
    motes.material.opacity = 0.75;
    motes.material.size = 1.6;
    xm.visible = true;
    for (const tl of tiles.values()) disposeTile(tl);
    tiles.clear();
  }

  // XM: little glowing globs scattered on the ground around you, the same
  // in the same place every time.
  let xm = null;
  function buildXM() {
    const N = 900;
    const pos = new Float32Array(N * 3);
    const r = RB.util.rng('xm');
    for (let i = 0; i < N; i++) pos.set([(r() - 0.5) * 600, 0.6 + r() * 0.6, (r() - 0.5) * 600], i * 3);
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    xm = new T.Points(g, new T.PointsMaterial({ map: G.glow(), size: 4.5, color: '#B8F6FF', transparent: true, opacity: 0.8, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false }));
    xm.visible = false;
    scene.add(xm);
  }

  // Offline ground: grass by day, dark rift soil at night, or the grid.
  const groundTex = {};
  function groundTexture(st) {
    if (groundTex[st]) return groundTex[st];
    const c = G.canvas(512, 512), g = c.getContext('2d');
    if (st === 'scanner') {
      // Black with a faint teal survey grid, for when tiles can't load.
      g.fillStyle = '#030607';
      g.fillRect(0, 0, 512, 512);
      g.strokeStyle = 'rgba(80,200,190,0.22)';
      g.lineWidth = 2;
      g.strokeRect(0, 0, 512, 512);
      const tx = G.texture(c);
      tx.wrapS = tx.wrapT = T.RepeatWrapping;
      tx.repeat.set(6000 / 50, 6000 / 50);
      tx.anisotropy = renderer.capabilities.getMaxAnisotropy();
      return (groundTex[st] = tx);
    }
    const base = st === 'day' ? '#7FA55C' : st === 'night' ? '#1C1830' : '#120C24';
    g.fillStyle = base;
    g.fillRect(0, 0, 512, 512);
    const r = RB.util.rng(`ground:${st}`);
    for (let i = 0; i < 2600; i++) {
      const x = r() * 512, y = r() * 512, rad = 2 + r() * 10;
      g.fillStyle = st === 'day' ? (r() < 0.5 ? 'rgba(40,70,20,0.18)' : 'rgba(200,220,120,0.12)') : (r() < 0.5 ? 'rgba(0,0,0,0.2)' : 'rgba(120,90,200,0.08)');
      g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
    }
    g.strokeStyle = st === 'day' ? 'rgba(255,255,255,0.12)' : 'rgba(160,110,255,0.35)';
    g.lineWidth = st === 'grid' ? 3 : 1.5;
    g.strokeRect(0, 0, 512, 512);
    const tx = G.texture(c);
    tx.wrapS = tx.wrapT = T.RepeatWrapping;
    tx.repeat.set(6000 / 50, 6000 / 50);
    tx.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return (groundTex[st] = tx);
  }

  /* ======================= Map tiles ======================= */

  const tiles = new Map();
  let tilesFailed = 0;
  let provider = 'carto';
  let tileTimer = 0;
  const loader = new T.TextureLoader();
  loader.setCrossOrigin('anonymous');

  const lng2x = (lng, z) => (lng + 180) / 360 * Math.pow(2, z);
  const lat2y = (lat, z) => (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, z);
  const x2lng = (x, z) => x / Math.pow(2, z) * 360 - 180;
  const y2lat = (y, z) => { const n = Math.PI - 2 * Math.PI * y / Math.pow(2, z); return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))); };

  function disposeTile(tl) {
    scene.remove(tl.mesh);
    tl.mesh.geometry.dispose();
    tl.mesh.material.dispose();
    if (tl.tex) tl.tex.dispose();
  }

  function updateTiles() {
    const google = RB.gmaps.active();
    if (style === 'grid' || (!google && tilesFailed > 10) || navigator.onLine === false) {
      if (tiles.size) { for (const tl of tiles.values()) disposeTile(tl); tiles.clear(); }
      return;
    }
    const z = cam.dist < 150 ? 17 : 16;
    const c = toLL(cam.target);
    const reach = 700;
    const dLat = reach / 110574, dLng = reach / (111320 * Math.cos(c.lat * Math.PI / 180));
    const x0 = Math.floor(lng2x(c.lng - dLng, z)), x1 = Math.floor(lng2x(c.lng + dLng, z));
    const y0 = Math.floor(lat2y(c.lat + dLat, z)), y1 = Math.floor(lat2y(c.lat - dLat, z));
    // Google Maps when there's a working key, the free CARTO map otherwise.
    provider = google ? 'google' : 'carto';
    if (google) RB.gmaps.updateCopyright(style, z, { north: c.lat + dLat, south: c.lat - dLat, east: c.lng + dLng, west: c.lng - dLng });
    const want = new Set();
    const list = [];
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const a = toV(y2lat(y, z), x2lng(x, z)), b = toV(y2lat(y + 1, z), x2lng(x + 1, z));
        const mid = a.clone().add(b).multiplyScalar(0.5);
        list.push({ key: `${provider}/${style}/${z}/${x}/${y}`, x, y, a, b, d: mid.distanceTo(cam.target) });
      }
    }
    list.sort((p, q) => p.d - q.d);
    for (const it of list.slice(0, 48)) {
      want.add(it.key);
      if (tiles.has(it.key)) continue;
      const url = google ? RB.gmaps.tileUrl(style, z, it.x, it.y) : TILE_URL[style]('abcd'[(it.x + it.y) % 4], z, it.x, it.y);
      if (!url) continue;   // Google session still starting
      const tint = style === 'day' ? '#F4FFF0' : style === 'scanner' && !google ? '#8FFFEA' : '#FFFFFF';
      const mat = new T.MeshBasicMaterial({ color: tint, transparent: true, opacity: 0, toneMapped: false });
      const mesh = new T.Mesh(new T.PlaneGeometry(1, 1), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.scale.set(it.b.x - it.a.x, it.b.z - it.a.z, 1);
      mesh.position.set((it.a.x + it.b.x) / 2, 0, (it.a.z + it.b.z) / 2);
      const tl = { mesh, tex: null };
      tiles.set(it.key, tl);
      loader.load(url, (tex) => {
        if (tiles.get(it.key) !== tl) { tex.dispose(); return; }
        tex.colorSpace = T.SRGBColorSpace;
        tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
        tl.tex = tex;
        mat.map = tex;
        mat.needsUpdate = true;
        scene.add(mesh);
        tilesFailed = 0;
        if (google) RB.gmaps.tileLoaded();
      }, undefined, () => { if (google) RB.gmaps.tileFailed(); else tilesFailed++; });
    }
    // Drop tiles out of reach, but keep the old provider's tiles until the
    // new ones cover the ground.
    const covered = [...want].every((k) => tiles.has(k) && tiles.get(k).tex);
    for (const [k, tl] of tiles) if (!want.has(k) && (k.startsWith(provider) || covered)) { disposeTile(tl); tiles.delete(k); }
  }

  /* ======================= Entities ======================= */

  function setPlayer(p) { Object.assign(player, p); }

  // The world origin moved: rebuild everything placed in local meters.
  function reset() {
    const none = new Set();
    prune(live.rifts, none); prune(live.drops, none); prune(live.spawns, none);
    for (const tl of tiles.values()) disposeTile(tl);
    tiles.clear();
    linkKey = '';
    cam.target.set(0, 0, 0);
  }
  function recenter() { cam.yaw = 0; }

  function setEntities(e) {
    ents = e;
    const now = Date.now();
    const seen = new Set();
    for (const r of e.rifts) {
      seen.add(r.id);
      let o = live.rifts.get(r.id);
      if (!o) {
        o = P.rift();
        o.root.position.copy(toV(r.lat, r.lng));
        o.pick.userData.ent = r;
        scene.add(o.root);
        picks.push(o.pick);
        live.rifts.set(r.id, o);
      }
      const st = S.riftState(r, now);
      o.set(st, S.riftColor(st), W.distM(player, r) <= S.RANGE && S.hackReady(r, now) === 0);
    }
    prune(live.rifts, seen);
    seen.clear();
    for (const d of e.drops) {
      seen.add(d.id);
      let o = live.drops.get(d.id);
      if (!o) {
        o = P.crate();
        o.root.scale.setScalar(1.5);
        o.root.position.copy(toV(d.lat, d.lng));
        o.root.rotation.y = (d.lat * 1e5) % 6;
        o.pick.userData.ent = d;
        scene.add(o.root);
        picks.push(o.pick);
        live.drops.set(d.id, o);
      }
      o.set(S.dropReady(d, now) === 0);
    }
    prune(live.drops, seen);
    syncSpawns();
    syncLinks();
  }

  function prune(map, seen) {
    for (const [id, o] of map) {
      if (seen.has(id)) continue;
      scene.remove(o.root);
      const i = picks.indexOf(o.pick);
      if (i >= 0) picks.splice(i, 1);
      if (o.dispose) o.dispose();
      map.delete(id);
    }
  }

  // Creatures within sight get a live 3D model that wanders near its spot.
  function syncSpawns() {
    const seen = new Set();
    for (const s of ents.spawns) {
      if (S.isGone(s) || W.distM(player, s) > SIGHT) continue;
      seen.add(s.id);
      if (live.spawns.has(s.id)) continue;
      const sp = C.byId(s.sp);
      const inst = RB.beasts.instance(s.sp, {});
      const scale = clamp(sp.size * 3.6, 7, 22);
      inst.root.scale.setScalar(scale);
      const fly = sp.plan === 'flyer';
      const root = new T.Group();
      root.position.copy(toV(s.lat, s.lng));
      root.add(inst.root);
      const ring = P.ringMarker(C.RARITY[sp.rar].color, scale * 0.55, 0.9);
      ring.position.y = 0.3;
      root.add(ring);
      if (sp.rar >= 2) {
        const aura = G.sprite(C.ELEMENTS[sp.el].color, 1.6, 0.35);
        aura.position.y = 0.55;
        inst.root.add(aura);
      }
      const pick = new T.Mesh(new T.SphereGeometry(Math.max(6, scale * 0.6), 8, 6), new T.MeshBasicMaterial({ visible: false }));
      pick.position.y = fly ? scale * 1.1 : scale * 0.5;
      pick.userData.ent = s;
      root.add(pick);
      picks.push(pick);
      scene.add(root);
      live.spawns.set(s.id, { root, inst, ring, pick, fly, scale, pos: new T.Vector3(), target: null, wait: Math.random() * 3, dir: Math.random() * 6, dispose: () => inst.dispose() });
    }
    prune(live.spawns, seen);
  }

  function updateSpawn(o, dt) {
    const lp = o.pos;
    if (o.fly) {
      o.dir += dt * 0.35;
      const r = 12;
      lp.set(Math.cos(o.dir) * r, o.scale * 0.8 + Math.sin(t * 1.3 + o.scale) * 1.5, Math.sin(o.dir) * r);
      o.inst.root.position.copy(lp);
      o.inst.root.rotation.y = Math.atan2(-Math.sin(o.dir), Math.cos(o.dir));
      o.inst.update(dt, { flap: 0.3 });
      o.ring.position.set(lp.x, 0.3, lp.z);
      o.pick.position.set(lp.x, lp.y + o.scale * 0.5, lp.z);
      return;
    }
    let speed = 0;
    if (!o.target) {
      o.wait -= dt;
      if (o.wait <= 0) {
        const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 9;
        o.target = new T.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
      }
    } else {
      const d = o.target.clone().sub(lp);
      d.y = 0;
      const len = d.length();
      speed = Math.min(2.2, 0.6 + o.scale * 0.12);
      if (len < 0.3) { o.target = null; o.wait = 2 + Math.random() * 5; speed = 0; }
      else {
        lp.addScaledVector(d, Math.min(1, speed * dt / len));
        const want = Math.atan2(d.x, d.z);
        const diff = ((want - o.inst.root.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        o.inst.root.rotation.y += diff * Math.min(1, dt * 4);
      }
    }
    o.inst.root.position.copy(lp);
    o.ring.position.set(lp.x, 0.3, lp.z);
    o.pick.position.set(lp.x, o.scale * 0.5, lp.z);
    o.inst.update(dt, { speed });
  }

  function syncLinks() {
    const key = S.save.links.map((l) => l.a + l.b).join() + '|' + S.save.fields.length + '|' + S.faction().color;
    if (key === linkKey) return;
    linkKey = key;
    for (const g of [links, fields]) if (g) { scene.remove(g); g.traverse((m) => { if (m.geometry) m.geometry.dispose(); }); }
    const col = S.faction().color;
    links = new T.Group();
    fields = new T.Group();
    const lm = G.additive(col, null, 0.85);
    const gm = G.additive(col, null, 0.2);
    for (const l of S.save.links) {
      const a = toV(l.al[0], l.al[1], 3), b = toV(l.bl[0], l.bl[1], 3);
      const len = a.distanceTo(b);
      const m = new T.Mesh(new T.BoxGeometry(1.2, 1.2, len), lm);
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.lookAt(b);
      links.add(m);
      const glow = new T.Mesh(new T.BoxGeometry(5, 0.2, len), gm);
      glow.position.copy(m.position).setY(0.6);
      glow.quaternion.copy(m.quaternion);
      links.add(glow);
    }
    const fm = G.additive(col, null, 0.2);
    for (const f of S.save.fields) {
      const g = new T.BufferGeometry();
      const v = f.ll.map((ll) => toV(ll[0], ll[1], 0.6));
      g.setAttribute('position', new T.Float32BufferAttribute([v[0].x, v[0].y, v[0].z, v[1].x, v[1].y, v[1].z, v[2].x, v[2].y, v[2].z], 3));
      fields.add(new T.Mesh(g, fm));
    }
    scene.add(links, fields);
  }

  /* ======================= Frame ======================= */

  function render(dt) {
    t += dt;
    const want = mapStyle();
    if (want !== style) applyStyle(want);
    // The camera trails you.
    const me = toV(player.lat, player.lng);
    cam.target.lerp(me, cam.target.lengthSq() === 0 ? 1 : 1 - Math.exp(-dt * 6));
    const horiz = Math.cos(PITCH) * cam.dist, up = Math.sin(PITCH) * cam.dist;
    camera.position.set(cam.target.x - Math.sin(cam.yaw) * horiz, up, cam.target.z + Math.cos(cam.yaw) * horiz);
    camera.lookAt(cam.target.x, AGENT_SCALE * 0.9, cam.target.z);
    scene.fog.near = cam.dist * 2.2;
    scene.fog.far = cam.dist * 6.5;

    agent.root.position.copy(me);
    let face = null;
    // Face the way you're walking, or your compass heading when standing.
    if (player.faceTo) { const w = toV(player.faceTo.lat, player.faceTo.lng); face = Math.atan2(w.x - me.x, w.z - me.z); }
    else if (player.heading != null) face = Math.PI - player.heading * Math.PI / 180;
    if (face != null) {
      const diff = ((face - agent.root.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      agent.root.rotation.y += diff * Math.min(1, dt * 6);
    }
    agent.update(dt, player.moving ? 1.6 : 0);
    rangeRing.position.set(me.x, 0.4, me.z);
    rangeFill.position.set(me.x, 0.35, me.z);
    const u = (t * 0.45) % 1;
    pulseRing.position.set(me.x, 0.45, me.z);
    pulseRing.scale.setScalar(1 + u * 5.5);
    pulseRing.material.opacity = (1 - u) * 0.35;

    // Light and shadows centred on you.
    sun.position.set(me.x + 120, 220, me.z + 60);
    sun.target.position.copy(me);
    shadowCatcher.position.set(me.x, 0.15, me.z);
    ground.position.set(me.x - (me.x % 50), -0.2, me.z - (me.z % 50));
    motes.position.set(me.x, 0, me.z);
    if (xm.visible) {
      // Keep the XM field centred on you in 100 m steps so it doesn't slide.
      xm.position.set(me.x - (me.x % 100), 0, me.z - (me.z % 100));
      xm.material.opacity = 0.6 + Math.sin(t * 2) * 0.2;
    }
    motes.rotation.y += dt * 0.02;

    for (const o of live.rifts.values()) o.update(dt);
    for (const o of live.drops.values()) o.update(dt);
    for (const o of live.spawns.values()) updateSpawn(o, dt);

    tileTimer -= dt;
    if (tileTimer <= 0) { tileTimer = 0.5; updateTiles(); }
    renderer.toneMappingExposure = style === 'day' || style === 'scanner' ? 1.0 : 1.15;
    for (const tl of tiles.values()) if (tl.tex && tl.mesh.material.opacity < 1) tl.mesh.material.opacity = Math.min(1, tl.mesh.material.opacity + dt * 3);
    renderer.render(scene, camera);
  }

  /* ======================= Input ======================= */

  const ray = new T.Raycaster();
  const plane = new T.Plane(new T.Vector3(0, 1, 0), 0);

  function pickAt(x, y) {
    const el = renderer.domElement;
    const r = el.getBoundingClientRect();
    const ndc = new T.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(picks, false);
    if (hits.length) return { ent: hits[0].object.userData.ent };
    const p = new T.Vector3();
    if (ray.ray.intersectPlane(plane, p)) return { ground: toLL(p) };
    return null;
  }

  function bindInput() {
    const el = G.main().domElement;
    const pts = new Map();
    let start = null, moved = false, pinch = null;
    const active = () => el.parentNode === container;
    el.addEventListener('pointerdown', (e) => {
      if (!active()) return;
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* the pointer already ended */ }
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 1) { start = { x: e.clientX, y: e.clientY, t: performance.now(), yaw: cam.yaw }; moved = false; }
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), dist: cam.dist, ang: Math.atan2(b[1] - a[1], b[0] - a[0]), yaw: cam.yaw };
        moved = true;
      }
    });
    el.addEventListener('pointermove', (e) => {
      if (!active() || !pts.has(e.pointerId)) return;
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 2 && pinch) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        cam.dist = clamp(pinch.dist * pinch.d / Math.max(d, 1), MIN_D, MAX_D);
        cam.yaw = pinch.yaw - (Math.atan2(b[1] - a[1], b[0] - a[0]) - pinch.ang);
        return;
      }
      if (pts.size === 1 && start) {
        const dx = e.clientX - start.x, dy = e.clientY - start.y;
        if (!moved && Math.hypot(dx, dy) > 10) moved = true;
        if (moved) {
          // Drag sideways to swing the camera around you, like Pokémon GO.
          const lower = start.y - el.getBoundingClientRect().top > el.clientHeight * 0.5 ? -1 : 1;
          cam.yaw = start.yaw + dx * 0.006 * lower;
          if (handlers.panned) handlers.panned();
        }
      }
    });
    const end = (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (pts.size === 0 && start && !moved && e.type === 'pointerup' && performance.now() - start.t < 500) {
        const hit = pickAt(e.clientX, e.clientY);
        if (hit && hit.ent) handlers.tap && handlers.tap(hit.ent);
        else if (hit && hit.ground) handlers.tapGround && handlers.tapGround(hit.ground);
      }
      if (pts.size === 0) start = null;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('wheel', (e) => {
      if (!active()) return;
      e.preventDefault();
      cam.dist = clamp(cam.dist * Math.exp(e.deltaY * 0.0012), MIN_D, MAX_D);
    }, { passive: false });
  }

  RB.map = {
    SIGHT, player, cam,
    init, show, resize, render, setPlayer, setEntities, recenter, reset,
    zoom(f) { cam.dist = clamp(cam.dist * f, MIN_D, MAX_D); },
    get view() { const c = toLL(cam.target); return { lat: c.lat, lng: c.lng, far: cam.dist > 240 }; },
    get radiusM() { return clamp(cam.dist * 6, 400, 1400); },
    get attribution() {
      if (style === 'grid' || !tiles.size) return '';
      if (provider === 'google') return `Google · ${RB.gmaps.copyright || 'Map data ©Google'}`;
      return '© OpenStreetMap contributors © CARTO';
    },
    get rotated() { return Math.abs(Math.sin(cam.yaw / 2)) > 0.03; },
  };
})(window.RB);
