/* Riftborn — 3D props: your agent, Rift towers, supply crates, Rift Orbs
   and ground markers. Built from primitives, lit like everything else. */
window.RB = window.RB || {};
(function (RB) {
  'use strict';

  const T = window.THREE;
  const G = RB.gfx;
  const V = (x, y, z) => new T.Vector3(x, y, z);
  const std = (o) => new T.MeshStandardMaterial(Object.assign({ roughness: 0.6, metalness: 0, envMapIntensity: 0.8 }, o));
  const shadowy = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };

  /* ------------------ Agent ------------------ */

  // A field agent in a faction jacket with a glowing pack. About 1.8 units
  // tall; faces +z.
  function avatar(color) {
    const root = new T.Group();
    const skin = std({ color: '#C98E6A', roughness: 0.7 });
    const jacket = std({ color: new T.Color(color).multiplyScalar(0.55), roughness: 0.55 });
    const trim = std({ color, emissive: new T.Color(color), emissiveIntensity: 1.4, roughness: 0.3 });
    const pants = std({ color: '#262434', roughness: 0.8 });
    const boots = std({ color: '#141218', roughness: 0.5 });
    const hair = std({ color: '#2A1E18', roughness: 0.9 });
    const pack = std({ color: '#1E1C28', roughness: 0.4, metalness: 0.4 });
    const cap = (r, l, m) => shadowy(new T.Mesh(new T.CapsuleGeometry(r, l, 4, 12), m));

    const hips = new T.Group();
    hips.position.y = 0.95;
    root.add(hips);
    const torso = cap(0.19, 0.42, jacket);
    torso.position.y = 0.36;
    torso.scale.set(1, 1, 0.75);
    hips.add(torso);
    const stripe = new T.Mesh(new T.TorusGeometry(0.195, 0.018, 6, 24), trim);
    stripe.rotation.x = Math.PI / 2;
    stripe.position.y = 0.2;
    stripe.scale.set(1, 0.75, 1);
    torso.add(stripe);
    const head = shadowy(new T.Mesh(new T.SphereGeometry(0.13, 20, 16), skin));
    head.position.y = 0.8;
    hips.add(head);
    const hairM = shadowy(new T.Mesh(new T.SphereGeometry(0.137, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hair));
    hairM.rotation.x = -0.35;
    head.add(hairM);
    const visor = new T.Mesh(new T.BoxGeometry(0.2, 0.035, 0.05), trim);
    visor.position.set(0, 0.02, 0.12);
    head.add(visor);
    const bag = shadowy(new T.Mesh(new T.BoxGeometry(0.28, 0.34, 0.14), pack));
    bag.position.set(0, 0.42, -0.2);
    hips.add(bag);
    const core = new T.Mesh(new T.SphereGeometry(0.06, 16, 12), trim);
    core.position.set(0, 0.02, -0.075);
    bag.add(core);
    const glow = G.sprite(color, 0.5, 0.8);
    glow.position.copy(core.position);
    bag.add(glow);

    const limb = (x, y, upper, lower, mat, footMat) => {
      const top = new T.Group();
      top.position.set(x, y, 0);
      const a = cap(upper[0], upper[1], mat);
      a.position.y = -upper[1] / 2 - upper[0] * 0.5;
      top.add(a);
      const knee = new T.Group();
      knee.position.y = -upper[1] - upper[0];
      top.add(knee);
      const b = cap(lower[0], lower[1], mat);
      b.position.y = -lower[1] / 2 - lower[0] * 0.5;
      knee.add(b);
      if (footMat) {
        const foot = shadowy(new T.Mesh(new T.BoxGeometry(0.11, 0.08, 0.24), footMat));
        foot.position.set(0, -lower[1] - lower[0] - 0.02, 0.05);
        knee.add(foot);
      } else {
        const hand = shadowy(new T.Mesh(new T.SphereGeometry(0.05, 10, 8), skin));
        hand.position.y = -lower[1] - lower[0] * 1.2;
        knee.add(hand);
      }
      return { top, knee };
    };
    const legL = limb(0.1, 0, [0.075, 0.34], [0.065, 0.36], pants, boots);
    const legR = limb(-0.1, 0, [0.075, 0.34], [0.065, 0.36], pants, boots);
    const armL = limb(0.25, 0.6, [0.055, 0.24], [0.05, 0.22], jacket);
    const armR = limb(-0.25, 0.6, [0.055, 0.24], [0.05, 0.22], jacket);
    hips.add(legL.top, legR.top, armL.top, armR.top);

    let ph = 0, t = 0;
    function update(dt, speed) {
      t += dt;
      const wk = Math.min(1, speed / 1.2);
      ph += dt * (2 + speed * 3.2);
      const s = Math.sin(ph) * wk;
      legL.top.rotation.x = s * 0.6;
      legR.top.rotation.x = -s * 0.6;
      legL.knee.rotation.x = Math.max(0, -Math.cos(ph)) * 0.9 * wk;
      legR.knee.rotation.x = Math.max(0, Math.cos(ph)) * 0.9 * wk;
      armL.top.rotation.x = -s * 0.5;
      armR.top.rotation.x = s * 0.5;
      armL.top.rotation.z = 0.08;
      armR.top.rotation.z = -0.08;
      armL.knee.rotation.x = -0.3 - wk * 0.3;
      armR.knee.rotation.x = -0.3 - wk * 0.3;
      hips.position.y = 0.95 + Math.abs(Math.cos(ph)) * 0.04 * wk + Math.sin(t * 2) * 0.006;
      torso.rotation.y = s * 0.12;
      glow.material.opacity = 0.6 + Math.sin(t * 3) * 0.25;
    }
    update(0, 0);
    return { root, update };
  }

  /* ------------------ Rocks ------------------ */

  // Smooth 3D value noise (for natural-looking rock).
  const seeds = {};
  function noise3(x, y, z, seed) {
    const sn = seeds[seed] || (seeds[seed] = RB.util.hash(seed) | 0);
    const h = (i, j, k) => {
      let n = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(k, 1274126177) ^ sn;
      n = Math.imul(n ^ (n >>> 13), 1274126177);
      return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
    };
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const f = (t) => t * t * (3 - 2 * t);
    const u = f(x - xi), v = f(y - yi), w = f(z - zi);
    const L = (a, b, t) => a + (b - a) * t;
    return L(
      L(L(h(xi, yi, zi), h(xi + 1, yi, zi), u), L(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), v),
      L(L(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), L(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u), v), w);
  }

  // Weathered granite: speckled grey with darker streaks.
  function stoneTexture() {
    const c = G.canvas(512, 256), g = c.getContext('2d');
    g.fillStyle = '#6E6A66';
    g.fillRect(0, 0, 512, 256);
    const r = RB.util.rng('granite');
    for (let i = 0; i < 9000; i++) {
      const v = r();
      g.fillStyle = v < 0.45 ? 'rgba(30,28,26,0.35)' : v < 0.8 ? 'rgba(210,205,196,0.3)' : 'rgba(120,96,70,0.3)';
      g.fillRect(r() * 512, r() * 256, 1 + r() * 2.5, 1 + r() * 2.5);
    }
    for (let i = 0; i < 26; i++) {
      g.strokeStyle = `rgba(20,18,16,${0.12 + r() * 0.15})`;
      g.lineWidth = 1 + r() * 2;
      let x = r() * 512, y = r() * 256;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 8; k++) { x += (r() - 0.5) * 50; y += (r() - 0.3) * 30; g.lineTo(x, y); }
      g.stroke();
    }
    const t = G.texture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    return t;
  }

  let stone = null;
  const rockGeos = [];
  // Boulders: a finely divided sphere pushed in and out by layered noise,
  // with darker crevices and lichen patches painted into its colours.
  function rockGeometry(i) {
    const k = i % 4;
    if (rockGeos[k]) return rockGeos[k];
    const g = new T.IcosahedronGeometry(1, 4);
    const p = g.attributes.position;
    const r = RB.util.rng(`rock${k}`);
    const bumps = Array.from({ length: 6 }, () => [V(r() - 0.5, r() - 0.5, r() - 0.5).normalize(), (r() - 0.4) * 0.5]);
    const v = new T.Vector3();
    const cols = new Float32Array(p.count * 3);
    for (let j = 0; j < p.count; j++) {
      v.fromBufferAttribute(p, j);
      const n = v.clone().normalize();
      let s = 1;
      for (const [d, a] of bumps) s += a * Math.max(0, n.dot(d)) ** 2;
      const big = noise3(n.x * 2.2 + k * 7, n.y * 2.2, n.z * 2.2, 'rk');
      const mid = noise3(n.x * 6 + k * 3, n.y * 6, n.z * 6, 'rm');
      const fine = noise3(n.x * 16, n.y * 16 + k, n.z * 16, 'rf');
      s += (big - 0.5) * 0.35 + (mid - 0.5) * 0.12 + (fine - 0.5) * 0.04;
      // Flat facets where it has split, like real boulders.
      s = Math.min(s, 1.12 - Math.abs(n.dot(bumps[0][0])) * 0.1);
      v.copy(n).multiplyScalar(s);
      if (v.y < -0.3) v.y = -0.3 + (v.y + 0.3) * 0.3;
      p.setXYZ(j, v.x, v.y, v.z);
      // Crevices darker; a little green-grey lichen on top.
      const cav = 0.55 + 0.45 * Math.min(1, Math.max(0, (mid - 0.25) * 1.6));
      const lichen = n.y > 0.3 && noise3(n.x * 9, n.y * 9, n.z * 9 + k, 'li') > 0.62 ? 1 : 0;
      cols.set(lichen ? [0.62 * cav, 0.68 * cav, 0.5 * cav] : [cav, cav * 0.98, cav * 0.95], j * 3);
    }
    g.setAttribute('color', new T.BufferAttribute(cols, 3));
    g.computeVertexNormals();
    return (rockGeos[k] = g);
  }

  function rock(i) {
    if (!stone) stone = std({ map: stoneTexture(), vertexColors: true, roughness: 0.92, envMapIntensity: 0.6 });
    return shadowy(new T.Mesh(rockGeometry(i), stone));
  }

  /* ------------------ Rift ------------------ */

  // A Rift tower: a floating crystal over a ring of standing stones, a beam
  // of light, and resonator shards that orbit it (one per level).
  function rift() {
    const root = new T.Group();
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * Math.PI * 2;
      const rk = rock(i);
      rk.position.set(Math.cos(a) * 4.2, 1.4, Math.sin(a) * 4.2);
      rk.scale.set(1, 2.4 + (i % 3) * 0.7, 1);
      rk.rotation.set(0.15 * Math.cos(a), a, 0.15 * Math.sin(a));
      root.add(rk);
    }
    const crystalMat = std({ color: '#FFFFFF', emissive: new T.Color('#FFFFFF'), emissiveIntensity: 1, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.92 });
    const crystal = shadowy(new T.Mesh(new T.OctahedronGeometry(1, 0), crystalMat));
    crystal.scale.set(1.8, 4.6, 1.8);
    crystal.position.y = 10;
    root.add(crystal);
    const inner = G.sprite('#FFFFFF', 9, 0.8);
    inner.position.y = 10;
    root.add(inner);
    const beamMat = G.additive('#FFFFFF', G.beam(), 0.5);
    const beamM = new T.Mesh(new T.CylinderGeometry(0.35, 1.1, 90, 16, 1, true), beamMat);
    beamM.position.y = 45;
    root.add(beamM);
    const ringMat = G.additive('#FFFFFF', G.ring(), 0.9);
    const ringM = new T.Mesh(new T.PlaneGeometry(16, 16), ringMat);
    ringM.rotation.x = -Math.PI / 2;
    ringM.position.y = 0.25;
    root.add(ringM);
    const shardMat = std({ color: '#FFFFFF', emissive: new T.Color('#FFFFFF'), emissiveIntensity: 1.2, roughness: 0.2 });
    const shards = [];
    for (let i = 0; i < 8; i++) {
      const sh = new T.Mesh(new T.OctahedronGeometry(0.6, 0), shardMat);
      sh.scale.y = 1.8;
      root.add(sh);
      shards.push(sh);
    }
    const readyMat = G.additive('#FFFFFF', G.ring(), 0.8);
    const ready = new T.Mesh(new T.PlaneGeometry(22, 22), readyMat);
    ready.rotation.x = -Math.PI / 2;
    ready.position.y = 0.3;
    root.add(ready);
    let lbl = null, lblKey = '';
    const pick = new T.Mesh(new T.CylinderGeometry(7, 7, 22, 8), new T.MeshBasicMaterial({ visible: false }));
    pick.position.y = 10;
    root.add(pick);

    let level = 0, t = Math.random() * 10;
    function set(st, color, isReady) {
      const col = new T.Color(color);
      crystalMat.color.copy(col);
      crystalMat.emissive.copy(col);
      crystalMat.emissiveIntensity = st.faction ? 1.1 : 0.25;
      inner.material.color.copy(col);
      inner.visible = !!st.faction;
      beamMat.color.copy(col);
      beamM.visible = !!st.faction;
      ringMat.color.copy(col);
      shardMat.color.copy(col);
      shardMat.emissive.copy(col);
      level = st.faction ? st.level : 0;
      shards.forEach((s, i) => { s.visible = i < level; });
      ready.visible = !!isReady;
      const key = st.faction ? `${st.mine ? '★' : st.level}|${color}` : '';
      if (key !== lblKey) {
        if (lbl) { root.remove(lbl); lbl.material.map.dispose(); lbl.material.dispose(); lbl = null; }
        if (key) {
          lbl = G.label(st.mine ? '★' : String(st.level), color, 64);
          lbl.scale.setScalar(5);
          lbl.position.set(0, 18, 0);
          root.add(lbl);
        }
        lblKey = key;
      }
    }
    function update(dt) {
      t += dt;
      crystal.rotation.y += dt * 0.6;
      crystal.position.y = 10 + Math.sin(t * 1.4) * 0.6;
      inner.position.y = crystal.position.y;
      inner.material.opacity = 0.55 + Math.sin(t * 2.2) * 0.2;
      ringM.scale.setScalar(1 + Math.sin(t * 2) * 0.05);
      shards.forEach((s, i) => {
        const a = t * 0.5 + i / Math.max(1, level) * Math.PI * 2;
        s.position.set(Math.cos(a) * 6.5, 6 + Math.sin(t * 2 + i) * 0.5, Math.sin(a) * 6.5);
        s.rotation.y += dt;
      });
      ready.rotation.z -= dt * 0.8;
      readyMat.opacity = 0.45 + Math.sin(t * 4) * 0.3;
    }
    return { root, pick, set, update };
  }

  /* ------------------ Supply crate ------------------ */

  let crateTex = null;
  function crateTexture() {
    if (crateTex) return crateTex;
    const c = G.canvas(256, 256), g = c.getContext('2d');
    g.fillStyle = '#9A6A2A';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.05)'; g.fillRect(0, i * 32, 256, 32); }
    g.strokeStyle = '#4A3212';
    g.lineWidth = 14;
    g.strokeRect(7, 7, 242, 242);
    g.fillStyle = '#FFB020';
    g.fillRect(0, 108, 256, 40);
    g.fillStyle = '#1A1208';
    g.font = '700 30px "Chakra Petch", system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText('RIFT SUPPLY', 128, 138);
    crateTex = G.texture(c);
    return crateTex;
  }

  function crate() {
    const root = new T.Group();
    const mat = std({ map: crateTexture(), roughness: 0.7 });
    const box = shadowy(new T.Mesh(new T.BoxGeometry(3.2, 2.4, 3.2), mat));
    box.position.y = 1.2;
    root.add(box);
    const lid = shadowy(new T.Mesh(new T.BoxGeometry(3.4, 0.35, 3.4), std({ color: '#5A3A14', roughness: 0.6, metalness: 0.3 })));
    const lidPivot = new T.Group();
    lidPivot.position.set(0, 2.4, -1.7);
    lid.position.set(0, 0.17, 1.7);
    lidPivot.add(lid);
    root.add(lidPivot);
    const antenna = new T.Mesh(new T.CylinderGeometry(0.08, 0.08, 2.2, 6), std({ color: '#333' }));
    antenna.position.set(1.2, 3.4, 1.2);
    root.add(antenna);
    const bulbMat = std({ color: '#FFB020', emissive: new T.Color('#FFB020'), emissiveIntensity: 2 });
    const bulb = new T.Mesh(new T.SphereGeometry(0.25, 12, 8), bulbMat);
    bulb.position.set(1.2, 4.6, 1.2);
    root.add(bulb);
    const halo = G.sprite('#FFB020', 5, 0.8);
    halo.position.copy(bulb.position);
    root.add(halo);
    const pick = new T.Mesh(new T.CylinderGeometry(4.5, 4.5, 7, 8), new T.MeshBasicMaterial({ visible: false }));
    pick.position.y = 3;
    root.add(pick);
    let ready = true, t = Math.random() * 10;
    function set(r) {
      ready = r;
      mat.color.set(r ? '#FFFFFF' : '#6A6470');
      bulb.visible = halo.visible = r;
    }
    function update(dt) {
      t += dt;
      lidPivot.rotation.x += ((ready ? 0 : -1.1) - lidPivot.rotation.x) * Math.min(1, dt * 4);
      halo.material.opacity = 0.5 + Math.sin(t * 5) * 0.35;
    }
    return { root, pick, set, update };
  }

  /* ------------------ Orb ------------------ */

  // A Rift Orb, radius 1: a glowing faction hemisphere over a dark one.
  function orb(color) {
    const root = new T.Group();
    const top = new T.Mesh(new T.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), std({ color, emissive: new T.Color(color), emissiveIntensity: 0.6, roughness: 0.2, metalness: 0.3 }));
    const bottom = new T.Mesh(new T.SphereGeometry(1, 28, 14, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), std({ color: '#1C1830', roughness: 0.3, metalness: 0.6 }));
    const band = new T.Mesh(new T.TorusGeometry(1, 0.09, 8, 36), std({ color: '#0C0A14', roughness: 0.4 }));
    band.rotation.x = Math.PI / 2;
    const button = new T.Mesh(new T.CylinderGeometry(0.28, 0.28, 0.2, 20), std({ color: '#FFFFFF', emissive: new T.Color(color), emissiveIntensity: 0.8 }));
    button.rotation.x = Math.PI / 2;
    button.position.z = 0.95;
    [top, bottom, band, button].forEach((m) => { m.castShadow = true; root.add(m); });
    return root;
  }

  /* ------------------ Markers ------------------ */

  function ringMarker(color, radius, opacity) {
    const m = new T.Mesh(new T.PlaneGeometry(radius * 2, radius * 2), G.additive(color, G.ring(), opacity == null ? 0.9 : opacity));
    m.rotation.x = -Math.PI / 2;
    return m;
  }

  RB.props = { avatar, rift, crate, orb, rock, ringMarker, std };
})(window.RB);
