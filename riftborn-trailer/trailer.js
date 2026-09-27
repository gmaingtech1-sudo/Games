/* Riftborn trailer: 40 seconds of in-game 3D, rendered one frame at a
   time by make.js (window.frame(i) draws frame i at 24 fps), so it looks
   the same however slow the computer is. Every scene uses the game's own
   creatures, Rifts, rocks and orbs. */
(function () {
  'use strict';

  const T = window.THREE;
  const G = RB.gfx;
  const P = RB.props;
  const B = RB.beasts;
  const C = RB.creatures;
  const W = 720, H = 1280, FPS = 24;
  const $ = (id) => document.getElementById(id);
  const V = (x, y, z) => new T.Vector3(x, y, z);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const ease = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  const rng = RB.util.rng('trailer');

  const renderer = G.makeRenderer({ preserveDrawingBuffer: true, antialias: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFShadowMap;
  $('gl').appendChild(renderer.domElement);
  const ENV = G.environment(renderer);

  /* ======================= Helpers ======================= */

  function stage(opts) {
    const scene = new T.Scene();
    scene.environment = ENV;
    scene.environmentIntensity = opts.env == null ? 0.8 : opts.env;
    if (opts.sky) scene.background = G.gradient(opts.sky);
    if (opts.fog) scene.fog = new T.Fog(opts.fog[0], opts.fog[1], opts.fog[2]);
    const hemi = new T.HemisphereLight(opts.hemi[0], opts.hemi[1], opts.hemi[2]);
    const sun = new T.DirectionalLight(opts.sun[0], opts.sun[1]);
    sun.position.copy(opts.sunPos || V(30, 60, 40));
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const e = opts.shadow || 40;
    Object.assign(sun.shadow.camera, { left: -e, right: e, top: e, bottom: -e, near: 1, far: 300 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    scene.add(hemi, sun, sun.target);
    const camera = new T.PerspectiveCamera(opts.fov || 50, W / H, 0.1, 3000);
    return { scene, camera, hemi, sun, parts: [] };
  }

  function canvasTex(w, h, draw, repeat) {
    const c = G.canvas(w, h);
    draw(c.getContext('2d'), w, h);
    const t = G.texture(c);
    if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    t.anisotropy = 8;
    return t;
  }

  function noiseFill(g, w, h, n, dark, light) {
    for (let i = 0; i < n; i++) {
      g.fillStyle = rng() < 0.5 ? dark : light;
      g.fillRect(rng() * w, rng() * h, 1 + rng() * 3, 1 + rng() * 3);
    }
  }

  function plane(w, h, mat, y) {
    const m = new T.Mesh(new T.PlaneGeometry(w, h), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.y = y || 0;
    m.receiveShadow = true;
    return m;
  }

  // A creature, scaled up by k, with its own materials (for tints).
  function beast(id, k) {
    const inst = B.instance(id, { own: true });
    inst.root.scale.multiplyScalar(k || 1);
    return inst;
  }

  // Night city: buildings with lit windows on both sides of a street.
  function city(st, opts) {
    const win = canvasTex(128, 256, (g, w, h) => {
      g.fillStyle = '#12151C';
      g.fillRect(0, 0, w, h);
      for (let y = 6; y < h; y += 16) {
        for (let x = 6; x < w; x += 16) {
          const lit = rng() < 0.32;
          g.fillStyle = lit ? (rng() < 0.7 ? '#FFC870' : '#BFE2FF') : '#1E232C';
          g.fillRect(x, y, 9, 10);
        }
      }
    }, [2, 3]);
    const mat = new T.MeshStandardMaterial({ map: win, emissiveMap: win, emissive: '#FFFFFF', emissiveIntensity: 0.85, roughness: 0.75 });
    const geo = new T.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    const N = 80;
    const mesh = new T.InstancedMesh(geo, mat, N);
    const m4 = new T.Matrix4();
    let k = 0;
    for (const side of [-1, 1]) {
      for (let z = 40; z > -520 && k < N; z -= 14 + rng() * 8) {
        const w = 10 + rng() * 10, d = 10 + rng() * 8, h = 14 + rng() * 55;
        m4.compose(V(side * (opts.street / 2 + 5 + w / 2 + rng() * 4), 0, z), new T.Quaternion(), V(w, h, d));
        mesh.setMatrixAt(k++, m4);
      }
    }
    mesh.count = k;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    st.scene.add(mesh);
    // Asphalt with lane markings, and pavements.
    const road = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#1C1D22';
      g.fillRect(0, 0, w, h);
      noiseFill(g, w, h, 5000, 'rgba(0,0,0,0.35)', 'rgba(255,255,255,0.05)');
      g.fillStyle = '#C8A640';
      g.fillRect(w / 2 - 3, 0, 6, h * 0.55);
      g.fillStyle = 'rgba(230,230,230,0.7)';
      g.fillRect(8, 0, 4, h);
      g.fillRect(w - 12, 0, 4, h);
    }, [1, 40]);
    st.scene.add(plane(opts.street, 1000, new T.MeshStandardMaterial({ map: road, roughness: 0.55, metalness: 0.1 }), 0));
    const pave = canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = '#34353A';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(0,0,0,0.4)';
      for (let i = 0; i < w; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); }
    }, [30, 300]);
    st.scene.add(plane(400, 1000, new T.MeshStandardMaterial({ map: pave, roughness: 0.8 }), -0.05));
    // Streetlights
    for (let z = 20; z > -300; z -= 36) {
      for (const side of [-1, 1]) {
        const lamp = G.sprite('#FFD9A0', 5, 0.8);
        lamp.position.set(side * (opts.street / 2 + 1), 8, z);
        st.scene.add(lamp);
      }
    }
  }

  // Sparks: short-lived glowing points. burst(pos, color, n, speed)
  function sparks(st) {
    const N = 400;
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    g.setAttribute('color', new T.BufferAttribute(col, 3));
    const pts = new T.Points(g, new T.PointsMaterial({ map: G.glow(), size: 1.2, vertexColors: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false }));
    pts.frustumCulled = false;
    st.scene.add(pts);
    const live = [];
    let next = 0;
    return {
      pts,
      burst(at, color, n, speed, size) {
        const c = new T.Color(color);
        for (let i = 0; i < n; i++) {
          const d = V(rng() - 0.5, rng() - 0.3, rng() - 0.5).normalize().multiplyScalar(speed * (0.4 + rng() * 0.8));
          live[next] = { p: at.clone(), v: d, life: 0.6 + rng() * 0.6, c };
          next = (next + 1) % N;
        }
        if (size) pts.material.size = size;
      },
      update(dt) {
        for (let i = 0; i < N; i++) {
          const s = live[i];
          if (!s || s.life <= 0) { pos.set([0, -999, 0], i * 3); continue; }
          s.life -= dt;
          s.v.y -= 9 * dt;
          s.p.addScaledVector(s.v, dt);
          pos.set([s.p.x, s.p.y, s.p.z], i * 3);
          const f = clamp(s.life, 0, 1);
          col.set([s.c.r * f, s.c.g * f, s.c.b * f], i * 3);
        }
        g.attributes.position.needsUpdate = true;
        g.attributes.color.needsUpdate = true;
      },
    };
  }

  function rain(st, speed) {
    const N = 2200, pos = new Float32Array(N * 6);
    for (let i = 0; i < N; i++) {
      const x = (rng() - 0.5) * 120, y = rng() * 60, z = (rng() - 0.5) * 120;
      pos.set([x, y, z, x + 0.15, y + 2.2, z], i * 6);
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    const m = new T.LineSegments(g, new T.LineBasicMaterial({ color: '#AFC8FF', transparent: true, opacity: 0.45, depthWrite: false }));
    m.frustumCulled = false;
    st.scene.add(m);
    return (dt) => {
      const p = g.attributes.position.array;
      for (let i = 0; i < p.length; i += 6) {
        let y = p[i + 1] - speed * dt;
        if (y < 0) y += 60;
        const d = y - p[i + 1];
        p[i + 1] += d; p[i + 4] += d;
      }
      g.attributes.position.needsUpdate = true;
    };
  }

  // A swirl of rift energy (points spiralling in).
  function vortex(st, color, R, n) {
    const pos = new Float32Array(n * 3);
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    const pts = new T.Points(g, new T.PointsMaterial({ map: G.glow(), color, size: 0.9, transparent: true, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false }));
    pts.frustumCulled = false;
    const motes = Array.from({ length: n }, () => ({ a: rng() * 6.28, r: rng(), s: 0.3 + rng() * 0.9, y: (rng() - 0.5) }));
    st.scene.add(pts);
    return {
      pts,
      update(dt, k) {
        motes.forEach((m, i) => {
          m.a += dt * m.s * 1.6;
          m.r -= dt * 0.12 * m.s;
          if (m.r < 0.03) m.r = 1;
          const rr = m.r * R * (k == null ? 1 : k);
          pos.set([Math.cos(m.a) * rr, m.y * rr * 0.5, Math.sin(m.a) * rr], i * 3);
        });
        g.attributes.position.needsUpdate = true;
      },
    };
  }

  function stoneFloor(repeat) {
    return canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#3E3A44';
      g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 64) {
        for (let x = -((y / 64) % 2) * 40; x < w; x += 80) {
          const s = 58 + Math.floor(rng() * 26);
          g.fillStyle = `rgb(${s},${s - 5},${s + 6})`;
          g.fillRect(x + 3, y + 3, 74, 58);
        }
      }
      noiseFill(g, w, h, 3000, 'rgba(0,0,0,0.2)', 'rgba(255,255,255,0.05)');
    }, [repeat, repeat]);
  }

  /* ======================= Scenes ======================= */

  const scenes = [];

  // 0-10 s: night street. A Rift ignites, then Emberjaw steps out of a tear.
  scenes.push({
    t0: 0, t1: 10,
    build() {
      const st = stage({ sky: [[0, '#05030E'], [0.6, '#1A0E30'], [1, '#3A1C58']], fog: ['#1C1030', 30, 260], hemi: ['#6E62B8', '#140E1C', 0.7], sun: ['#B8A8FF', 0.9], sunPos: V(-40, 60, 30), shadow: 45 });
      city(st, { street: 26 });
      const rift = P.rift();
      rift.set({ faction: 'B', level: 6 }, '#B45CFF', false);
      rift.root.position.set(0, 0, -150);
      rift.root.scale.setScalar(1.6);
      st.scene.add(rift.root);
      const riftLight = new T.PointLight('#B45CFF', 0, 160, 1.4);
      riftLight.position.set(0, 16, -150);
      st.scene.add(riftLight);
      const vx = vortex(st, '#D08CFF', 26, 500);
      vx.pts.position.set(0, 16, -150);
      const tear = G.sprite('#E6B8FF', 1, 0);
      tear.position.set(0, 3.2, -46);
      st.scene.add(tear);
      const tearCore = G.sprite('#FFFFFF', 1, 0);
      tearCore.position.copy(tear.position);
      st.scene.add(tearCore);
      const rex = beast('emberjaw', 1.15);
      rex.root.position.set(0, 0, -47);
      rex.root.visible = false;
      st.scene.add(rex.root);
      const sp = sparks(st);
      Object.assign(st, { rift, riftLight, vx, tear, tearCore, rex, sp });
      return st;
    },
    update(st, t, dt) {
      const cam = st.camera;
      st.rift.update(dt);
      st.sp.update(dt);
      // The Rift ignites.
      const ign = ease((t - 0.6) / 1.4);
      st.riftLight.intensity = 60 * ign * (1 + Math.sin(t * 9) * 0.1);
      st.vx.update(dt, 0.2 + ign * 0.8);
      st.vx.pts.material.opacity = ign;
      st.rift.root.scale.setScalar(1.6 * (0.3 + 0.7 * ign));
      if (t > 0.6 && t < 0.7) st.sp.burst(V(0, 18, -150), '#E0B0FF', 160, 30, 2.4);
      // The tear opens, and the creature walks out.
      const open = ease((t - 4.6) / 0.8) * (1 - ease((t - 7.4) / 0.6));
      st.tear.scale.set(9 * open + 0.01, 15 * open + 0.01, 1);
      st.tear.material.opacity = open * 0.9;
      st.tearCore.scale.set(2.5 * open + 0.01, 11 * open + 0.01, 1);
      st.tearCore.material.opacity = open;
      if (t > 4.9 && t < 5.0) st.sp.burst(V(0, 4, -46), '#E6B8FF', 120, 10, 0.7);
      const rex = st.rex;
      rex.root.visible = t > 5.2;
      const walking = t > 5.2 && t < 8.1;
      if (walking) rex.root.position.z += 3.3 * dt;
      const roar = t > 8.2 && t < 9.6 ? Math.sin(clamp((t - 8.2) / 1.4, 0, 1) * Math.PI) : 0;
      rex.update(dt, { speed: walking ? 3.3 : 0, mouth: roar, look: 0 });
      rex.setOpacity(clamp((t - 5.2) / 0.5, 0, 1));
      // Camera: a slow push down the street, then low and close on the creature.
      if (t < 5) {
        const k = ease(t / 5);
        cam.position.set(0, 3 + k * 1.5, 30 - k * 25);
        cam.lookAt(0, 12 - k * 6, -150);
      } else {
        const k = ease((t - 5) / 5);
        const shake = roar * 0.12;
        cam.position.set(4 - k * 2 + Math.sin(t * 40) * shake, 1.3 + Math.sin(t * 33) * shake, -24 + k * 3);
        cam.lookAt(0, 3.4 + roar * 0.6, rex.root.position.z);
      }
      cam.fov = t < 5 ? 55 : 48;
      cam.updateProjectionMatrix();
    },
  });

  // 10-15 s: over the scanner map, Rifts get linked into a control field.
  scenes.push({
    t0: 10, t1: 15,
    build() {
      const st = stage({ sky: [[0, '#000000'], [0.7, '#020708'], [1, '#08191B']], fog: ['#061416', 260, 900], hemi: ['#6FA8A4', '#050A0A', 1.1], sun: ['#CFE8FF', 1.2], shadow: 200 });
      const map = canvasTex(1024, 1024, (g, w, h) => {
        g.fillStyle = '#040909';
        g.fillRect(0, 0, w, h);
        g.strokeStyle = '#1E4A48';
        for (let i = 0; i < 26; i++) {
          g.lineWidth = rng() < 0.3 ? 9 : 4;
          const horiz = rng() < 0.5, p = rng() * w;
          g.beginPath();
          if (horiz) { g.moveTo(0, p); g.bezierCurveTo(w * 0.3, p + (rng() - 0.5) * 120, w * 0.7, p + (rng() - 0.5) * 120, w, p + (rng() - 0.5) * 80); }
          else { g.moveTo(p, 0); g.bezierCurveTo(p + (rng() - 0.5) * 120, h * 0.3, p + (rng() - 0.5) * 120, h * 0.7, p + (rng() - 0.5) * 80, h); }
          g.stroke();
        }
        g.fillStyle = '#07130F';
        for (let i = 0; i < 6; i++) { g.beginPath(); g.ellipse(rng() * w, rng() * h, 40 + rng() * 60, 30 + rng() * 40, rng(), 0, 6.28); g.fill(); }
      }, [2, 2]);
      st.scene.add(plane(1400, 1400, new T.MeshBasicMaterial({ map, color: '#9FFFF0' }), 0));
      const xm = vortex(st, '#B8F6FF', 1, 1);
      xm.pts.visible = false;
      const spots = [[-90, -40, 'W'], [80, -70, 'W'], [10, 90, 'W'], [-170, 110, 'B'], [190, 60, 'B'], [-40, -210, 'B'], [160, -200, 'W']];
      st.rifts = spots.map(([x, z, f], i) => {
        const r = P.rift();
        r.set({ faction: f, level: 3 + (i % 5) }, f === 'W' ? '#2EE6C5' : '#FF4FA3', i === 0);
        r.root.position.set(x, 0, z);
        st.scene.add(r.root);
        return r;
      });
      const tri = spots.slice(0, 3).map(([x, z]) => V(x, 3, z));
      st.links = [[0, 1], [1, 2], [2, 0]].map(([a, b]) => {
        const g = new T.BufferGeometry().setFromPoints([tri[a], tri[a]]);
        const line = new T.Line(g, new T.LineBasicMaterial({ color: '#7FFFF0', transparent: true, opacity: 0.95, toneMapped: false }));
        st.scene.add(line);
        const beam = new T.Mesh(new T.CylinderGeometry(1.1, 1.1, 1, 8, 1, true), G.additive('#2EE6C5', G.beam(), 0.55));
        st.scene.add(beam);
        return { a: tri[a], b: tri[b], g, beam };
      });
      const fg = new T.BufferGeometry().setFromPoints(tri.map((p) => V(p.x, 1, p.z)));
      st.field = new T.Mesh(fg, G.additive('#2EE6C5', null, 0));
      st.scene.add(st.field);
      st.agent = P.avatar('#2EE6C5');
      st.agent.root.scale.setScalar(5);
      st.agent.root.position.set(0, 0, 0);
      st.scene.add(st.agent.root);
      st.sp = sparks(st);
      return st;
    },
    update(st, t, dt) {
      for (const r of st.rifts) r.update(dt);
      st.agent.update(dt, 1);
      st.agent.root.rotation.y = -0.5;
      st.sp.update(dt);
      st.links.forEach((l, i) => {
        const k = ease((t - 0.7 - i * 0.55) / 0.5);
        const end = l.a.clone().lerp(l.b, k);
        l.g.setFromPoints([l.a, end]);
        const mid = l.a.clone().lerp(end, 0.5);
        l.beam.position.copy(mid);
        l.beam.scale.set(1, Math.max(0.01, l.a.distanceTo(end)), 1);
        l.beam.quaternion.setFromUnitVectors(V(0, 1, 0), end.clone().sub(l.a).normalize().lengthSq() ? end.clone().sub(l.a).normalize() : V(0, 1, 0));
        l.beam.visible = k > 0.01;
        if (k > 0.98 && !l.hit) { l.hit = true; st.sp.burst(l.b.clone().setY(12), '#9FFFF0', 70, 25, 3); }
      });
      const f = ease((t - 2.5) / 0.8);
      st.field.material.opacity = f * (0.22 + Math.sin(t * 5) * 0.04);
      if (t > 2.5 && !st.boom) { st.boom = true; st.sp.burst(V(0, 20, 0), '#2EE6C5', 300, 60, 4); }
      const a = -0.6 + t * 0.14;
      const d = 250 - t * 20;
      st.camera.position.set(Math.sin(a) * d, 170 - t * 10, Math.cos(a) * d);
      st.camera.lookAt(0, 0, -10);
    },
  });

  // 15-20 s: catching a Stonehorn in AR, in a park.
  scenes.push({
    t0: 15, t1: 20,
    build() {
      const st = stage({ sky: [[0, '#5C9BE0'], [0.55, '#A9CFF0'], [1, '#E4EEF0']], fog: ['#CFE0EA', 40, 160], hemi: ['#DCEBFF', '#4A5A34', 1.2], sun: ['#FFF1DC', 2.6], sunPos: V(20, 40, 25), shadow: 20, env: 1 });
      const grass = canvasTex(256, 256, (g, w, h) => {
        g.fillStyle = '#4E7A34';
        g.fillRect(0, 0, w, h);
        for (let i = 0; i < 9000; i++) {
          const v = rng();
          g.fillStyle = v < 0.4 ? 'rgba(30,60,20,0.5)' : v < 0.8 ? 'rgba(120,160,70,0.45)' : 'rgba(170,150,90,0.4)';
          g.fillRect(rng() * w, rng() * h, 1, 2 + rng() * 3);
        }
      }, [40, 40]);
      st.scene.add(plane(400, 400, new T.MeshStandardMaterial({ map: grass, roughness: 0.95 }), 0));
      // Trees: trunks and layered, lumpy crowns.
      const leaf = new T.MeshStandardMaterial({ color: '#3E6A2E', roughness: 0.9 });
      const bark = new T.MeshStandardMaterial({ color: '#4A3828', roughness: 0.95 });
      for (let i = 0; i < 26; i++) {
        const a = rng() * 6.28, d = 30 + rng() * 60;
        const x = Math.cos(a) * d, z = -Math.abs(Math.sin(a)) * d - 10;
        const tr = new T.Group();
        const trunk = new T.Mesh(new T.CylinderGeometry(0.35, 0.5, 5, 8), bark);
        trunk.position.y = 2.5;
        tr.add(trunk);
        for (let k = 0; k < 5; k++) {
          const cr = new T.Mesh(new T.IcosahedronGeometry(2.4 + rng() * 1.2, 2), leaf);
          cr.position.set((rng() - 0.5) * 2.5, 5.5 + rng() * 2.5, (rng() - 0.5) * 2.5);
          cr.castShadow = true;
          tr.add(cr);
        }
        trunk.castShadow = true;
        tr.position.set(x, 0, z);
        tr.scale.setScalar(0.9 + rng() * 0.8);
        st.scene.add(tr);
      }
      const rk = P.rock(1);
      rk.position.set(-6, 0.3, -6);
      rk.scale.set(1.2, 0.8, 1);
      st.scene.add(rk);
      st.beast = beast('stonehorn', 1);
      st.beast.root.position.set(0, 0, -4);
      st.beast.root.rotation.y = 0.5;
      st.scene.add(st.beast.root);
      st.orb = P.orb('#2EE6C5');
      st.orb.scale.setScalar(0.18);
      st.scene.add(st.orb);
      st.sp = sparks(st);
      return st;
    },
    update(st, t, dt) {
      const b = st.beast, o = st.orb;
      st.sp.update(dt);
      const hitT = 2.2, flyT = 1.4;
      const roar = t > 0.6 && t < 1.6 ? Math.sin((t - 0.6) * Math.PI) : 0;
      if (t < hitT + 0.05) b.update(dt, { speed: 0, mouth: roar, look: Math.sin(t) * 0.3 });
      // The orb arcs from your hand to the creature.
      const from = V(0.3, 0.9, 7), to = V(0, 1.4, -3.2);
      if (t < hitT - flyT) { o.visible = false; }
      else if (t < hitT) {
        o.visible = true;
        const k = (t - (hitT - flyT)) / flyT;
        o.position.copy(from.clone().lerp(to, k)).add(V(0, Math.sin(k * Math.PI) * 2.2, 0));
        o.rotation.x += dt * 12;
      } else {
        // Sucked in, the orb drops and wobbles, then clicks shut.
        const k = t - hitT;
        b.setTint('#FFFFFF', clamp(1 - k * 2, 0, 1) * 1.5);
        b.root.scale.setScalar(C.byId('stonehorn').size * clamp(1 - k / 0.5, 0.001, 1));
        if (k > 0.5) {
          const fall = clamp((k - 0.5) / 0.35, 0, 1);
          o.position.set(0, 1.4 - fall * 1.22, -3.2);
          o.rotation.set(0, 0, k > 0.85 && k < 2.2 ? Math.sin((k - 0.85) * 14) * 0.5 * (1 - (k - 0.85) / 1.4) : 0);
        }
        if (k > 0 && !st.hit) { st.hit = true; st.sp.burst(to, '#FFFFFF', 120, 6, 0.35); }
        if (k > 2.25 && !st.caught) { st.caught = true; st.sp.burst(V(0, 0.4, -3.2), '#7CF0C8', 200, 5, 0.3); }
      }
      st.camera.position.set(Math.sin(t * 0.7) * 0.25, 1.55 + Math.sin(t * 1.3) * 0.03, 8.5);
      st.camera.lookAt(0, 1.3, -3);
      st.camera.fov = 58;
      st.camera.updateProjectionMatrix();
    },
  });

  // 20-26 s: an arena battle under the Rift.
  scenes.push({
    t0: 20, t1: 26,
    build() {
      const st = stage({ sky: [[0, '#07061A'], [0.55, '#281446'], [1, '#5A2A6E']], fog: ['#2A1646', 40, 140], hemi: ['#B8A8FF', '#2A2030', 1.1], sun: ['#FFE8D0', 2.4], sunPos: V(12, 30, 18), shadow: 20 });
      st.scene.add(plane(200, 200, new T.MeshStandardMaterial({ map: stoneFloor(30), roughness: 0.9 }), 0));
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * 6.28 + rng() * 0.3, d = 20 + rng() * 6;
        const r = P.rock(i);
        r.position.set(Math.cos(a) * d, 1, Math.sin(a) * d);
        r.scale.set(3 + rng() * 2, 2 + rng() * 5, 3 + rng() * 2);
        r.rotation.y = rng() * 6;
        st.scene.add(r);
      }
      const ring = new T.Mesh(new T.PlaneGeometry(22, 22), G.additive('#B45CFF', G.ring(), 0.8));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.05;
      st.scene.add(ring);
      const portal = new T.Mesh(new T.RingGeometry(20, 34, 64), G.additive('#C88CFF', G.ring(), 0.35));
      portal.position.set(0, 40, -60);
      st.scene.add(portal);
      st.portal = portal;
      st.a = beast('sailfin', 0.9);
      st.a.root.position.set(-3.6, 0, 2.2);
      st.a.root.rotation.y = 2.3;
      st.b = beast('stormcrown', 1.1);
      st.b.root.position.set(3.6, 0, -2.2);
      st.b.root.rotation.y = -0.85;
      st.scene.add(st.a.root, st.b.root);
      st.sp = sparks(st);
      st.home = { a: st.a.root.position.clone(), b: st.b.root.position.clone() };
      return st;
    },
    update(st, t, dt) {
      st.sp.update(dt);
      st.portal.rotation.z += dt * 0.3;
      const lunge = (who, at, hitColor, other, fx) => {
        const k = t - at;
        const home = st.home[who];
        const dir = st.home[who === 'a' ? 'b' : 'a'].clone().sub(home).setY(0).normalize();
        const push = k > 0 && k < 0.7 ? Math.sin(k / 0.7 * Math.PI) * 3.2 : 0;
        st[who].root.position.copy(home).addScaledVector(dir, push);
        if (k > 0.33 && k < 0.33 + dt * 1.01) {
          const at3 = st[other].root.position.clone().add(V(0, 2.5, 0));
          st.sp.burst(at3, hitColor, fx || 90, 12, 0.8);
          st.hitAt = t;
          st.hitWho = other;
          st.hitColor = hitColor;
        }
        return k > 0 && k < 0.7;
      };
      const aAtk = lunge('a', 1.0, '#9FE8FF', 'b') || lunge('a', 3.8, '#3DB8FF', 'b', 260);
      const bAtk = lunge('b', 2.4, '#FFE14D', 'a', 160);
      st.a.update(dt, { speed: aAtk ? 3 : 0, mouth: aAtk ? 0.8 : 0, look: 0 });
      st.b.update(dt, { speed: bAtk ? 3 : 0, mouth: bAtk ? 0.8 : 0, look: 0 });
      for (const w of ['a', 'b']) st[w].setTint(st.hitColor || '#FFFFFF', st.hitWho === w ? clamp(1 - (t - st.hitAt) * 3, 0, 1) : 0);
      const shake = st.hitAt != null ? clamp(1 - (t - st.hitAt) * 4, 0, 1) * 0.25 : 0;
      const a = 0.35 + t * 0.07;
      st.camera.position.set(Math.sin(a) * 24 + Math.sin(t * 50) * shake, 6 + Math.cos(t * 43) * shake, Math.cos(a) * 24);
      st.camera.lookAt(0, 3.4, 0);
      st.camera.fov = 50;
      st.camera.updateProjectionMatrix();
    },
  });

  // 26-31 s: a huge Apex in a thunderstorm.
  scenes.push({
    t0: 26, t1: 31,
    build() {
      const st = stage({ sky: [[0, '#040308'], [0.6, '#15101E'], [1, '#2A1A2A']], fog: ['#1A1420', 30, 180], hemi: ['#6A6090', '#100C14', 0.7], sun: ['#C8C0FF', 0.7], sunPos: V(-20, 50, 20), shadow: 40 });
      st.scene.add(plane(600, 600, new T.MeshStandardMaterial({ map: stoneFloor(60), color: '#6A6470', roughness: 0.35, metalness: 0.2 }), 0));
      const rift = P.rift();
      rift.set({ faction: 'B', level: 8 }, '#FF4FA3', false);
      rift.root.position.set(-26, 0, -40);
      st.scene.add(rift.root);
      st.rift = rift;
      const ring = P.ringMarker('#FF3B5C', 20, 1);
      ring.position.y = 0.1;
      st.scene.add(ring);
      st.ringM = ring;
      st.apex = beast('solarch', 2.4);
      st.apex.root.rotation.y = 1.25;
      st.scene.add(st.apex.root);
      const glow = new T.PointLight('#FF6A3D', 40, 60, 1.5);
      glow.position.set(0, 12, 0);
      st.scene.add(glow);
      st.rain = rain(st, 60);
      st.sp = sparks(st);
      return st;
    },
    update(st, t, dt) {
      st.rain(dt);
      st.rift.update(dt);
      st.sp.update(dt);
      st.ringM.rotation.z += dt * 0.5;
      const roar = t > 2.0 && t < 3.6 ? Math.sin((t - 2.0) / 1.6 * Math.PI) : 0;
      st.apex.update(dt, { speed: 0, mouth: roar, look: -0.2 });
      // Lightning
      let flash = 0;
      for (const at of [1.2, 3.1, 3.3]) if (t > at && t < at + 0.18) flash = Math.sin((t - at) / 0.18 * Math.PI) * (Math.sin(t * 90) > 0 ? 1 : 0.4);
      st.hemi.intensity = 0.7 + flash * 6;
      st.flash = flash;
      const k = ease(t / 5);
      const shake = roar * 0.2;
      st.camera.position.set(16 - k * 3 + Math.sin(t * 40) * shake, 2.2 + Math.cos(t * 37) * shake, 36 - k * 8);
      st.camera.lookAt(2, 8.5 + roar, 0);
      st.camera.fov = 55;
      st.camera.updateProjectionMatrix();
    },
  });

  // 31-35.5 s: the lineup.
  scenes.push({
    t0: 31, t1: 35.5,
    build() {
      const st = stage({ sky: [[0, '#0A0616'], [0.7, '#1E1236'], [1, '#2E1A48']], fog: ['#140C24', 40, 130], hemi: ['#C8B8FF', '#2A2030', 1.0], sun: ['#FFF0E0', 2.6], sunPos: V(14, 30, 24), shadow: 40 });
      st.scene.environmentIntensity = 0.45;
      st.scene.add(plane(300, 300, new T.MeshStandardMaterial({ color: '#110B1A', roughness: 0.55, metalness: 0, envMapIntensity: 0.25 }), 0));
      const cast = [['tidecrest', 0.8], ['boulderback', 1], ['sailfin', 0.85], ['hornblower', 1.1], ['kindlepup', 1.4], ['galeclaw', 1.3], ['thistlehorn', 1.3]];
      st.cast = cast.map(([id, k], i) => {
        const b = beast(id, k);
        b.root.position.set((i % 2 ? 1 : -1) * 3.6, 0, -i * 7);
        b.root.rotation.y = (i % 2 ? -0.5 : 0.5);
        st.scene.add(b.root);
        const spot = new T.Mesh(new T.CircleGeometry(3.2, 40), G.additive(C.RARITY[C.byId(id).rar].color, G.glow(), 0.35));
        spot.rotation.x = -Math.PI / 2;
        spot.position.set(b.root.position.x, 0.02, b.root.position.z);
        st.scene.add(spot);
        return b;
      });
      return st;
    },
    update(st, t, dt) {
      st.cast.forEach((b, i) => b.update(dt, { speed: 0, mouth: Math.max(0, Math.sin(t * 1.3 + i * 1.7) - 0.85) * 5, look: Math.sin(t * 0.6 + i) * 0.4 }));
      const k = ease(t / 4.5);
      st.camera.position.set(Math.sin(k * 2) * 2, 3, 9 - k * 14);
      st.camera.lookAt(0, 2.6, -12 - k * 14);
      st.camera.fov = 55;
      st.camera.updateProjectionMatrix();
    },
  });

  // 35.5-40 s: the logo over a spinning rift.
  scenes.push({
    t0: 35.5, t1: 40,
    build() {
      const st = stage({ sky: [[0, '#04020A'], [1, '#12081E']], hemi: ['#FFFFFF', '#000000', 0.2], sun: ['#FFFFFF', 0.1] });
      st.vx = vortex(st, '#B45CFF', 60, 1400);
      st.vx.pts.material.size = 1.4;
      st.vx2 = vortex(st, '#2EE6C5', 40, 500);
      st.vx.pts.rotation.x = st.vx2.pts.rotation.x = 1.25;
      const core = G.sprite('#E8D0FF', 30, 0.8);
      st.scene.add(core);
      st.core = core;
      return st;
    },
    update(st, t, dt) {
      st.vx.update(dt * 1.4, 1);
      st.vx2.update(dt * 2, 1);
      st.core.material.opacity = 0.6 + Math.sin(t * 3) * 0.15;
      st.camera.position.set(0, 0, 120 - t * 6);
      st.camera.lookAt(0, 0, 0);
    },
  });

  /* ======================= Captions & overlays ======================= */

  const CAPS = [
    [1.4, 4.7, '', 'THE RIFTS<br>ARE OPEN'],
    [5.8, 9.7, 'Prehistoric creatures', 'ON YOUR<br>REAL STREETS'],
    [10.5, 12.6, 'Like Ingress', 'CLAIM RIFTS.<br>LINK THEM.'],
    [12.8, 14.8, 'Wardens vs Breachers', 'CONTROL<br>YOUR CITY'],
    [15.3, 17.4, 'Like Pokémon GO', 'CATCH THEM<br>IN AR'],
    [20.4, 22.9, 'Like Jurassic World Alive', 'BATTLE<br>FOR DNA'],
    [23.2, 25.8, 'Arena · Bronze to Legend', 'CLIMB THE<br>ARENA'],
    [26.5, 30.7, 'Once a day · triple health', 'HUNT THE<br>APEX'],
    [31.4, 35.2, 'Eggs · Hybrids · Real weather', '42 CREATURES'],
  ];

  function overlays(t) {
    let cap = null;
    for (const c of CAPS) if (t >= c[0] && t < c[1]) cap = c;
    const el = $('cap');
    if (cap) {
      const k = Math.min(ease((t - cap[0]) / 0.35), ease((cap[1] - t) / 0.35));
      el.style.opacity = k;
      el.style.transform = `translateY(${(1 - k) * 30}px) scale(${1 + (1 - k) * 0.06})`;
      if ($('line').innerHTML !== cap[3]) { $('line').innerHTML = cap[3]; $('kicker').textContent = cap[2]; }
    } else el.style.opacity = 0;
    // AR HUD and "Caught!"
    $('hud').style.opacity = t > 15.1 && t < 19.9 ? Math.min(1, (t - 15.1) * 4, (19.9 - t) * 4) : 0;
    const ck = t - 19.25;
    $('caught').style.opacity = ck > 0 && ck < 0.7 ? Math.min(1, ck * 6) : 0;
    $('caught').style.transform = `scale(${1 + Math.max(0, 0.3 - ck) })`;
    // Logo
    const lk = ease((t - 36) / 0.8) * (1 - ease((t - 39.4) / 0.5));
    $('logo').style.opacity = lk;
    $('logo').style.transform = `scale(${0.94 + lk * 0.06})`;
    // Cuts: a quick dip to black between scenes, and a fade in and out.
    let fade = 0;
    for (const s of scenes) fade = Math.max(fade, 1 - clamp(Math.abs(t - s.t0) / 0.22, 0, 1));
    fade = Math.max(fade, 1 - clamp(t / 0.6, 0, 1), clamp((t - 39.5) / 0.5, 0, 1));
    $('fade').style.opacity = fade;
  }

  /* ======================= Frames ======================= */

  let cur = null, curScene = null;
  window.TRAILER = { FPS, frames: Math.round(40 * FPS), W, H };
  // Frame i; draw = false only moves the action on (for previews).
  window.frame = function (i, draw = true) {
    const t = i / FPS, dt = 1 / FPS;
    const sc = scenes.find((s) => t >= s.t0 && t < s.t1) || scenes[scenes.length - 1];
    if (sc !== curScene) { curScene = sc; cur = sc.build(); }
    sc.update(cur, t - sc.t0, dt);
    if (!draw) return t;
    renderer.toneMappingExposure = 1.05;
    renderer.render(cur.scene, cur.camera);
    overlays(t);
    $('flash').style.opacity = cur.flash ? cur.flash * 0.6 : 0;
    return t;
  };
})();
