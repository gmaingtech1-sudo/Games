/* ParanormalADHDhunters — the ghosts. GhostVisual draws whichever spirit is in
   the house; GhostBrain (run only by the solo player or the team's host)
   decides where it goes and what it does. */
import * as THREE from 'three';
import { GHOSTS, DIFFICULTY } from './data.js';
import { ROOMS, layerOfY } from './house.js';
import { rng, weighted, clamp, damp } from './util.js';
import { glowTexture } from './textures.js';

/* ------------------------------------------------------------------ */
/* Looks                                                               */
/* ------------------------------------------------------------------ */

const vert = `
  uniform float uTime;
  uniform float uHeight;
  varying vec3 vN;
  varying vec3 vV;
  varying float vY;
  void main() {
    vec3 p = position;
    float k = 1.0 - clamp(p.y / uHeight, 0.0, 1.0);
    p.x += sin(p.y * 7.0 + uTime * 3.1) * 0.035 * k;
    p.z += cos(p.y * 5.0 + uTime * 2.3) * 0.035 * k;
    vY = position.y / uHeight;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;
const frag = `
  uniform float uTime;
  uniform float uOpacity;
  uniform vec3 uCore;
  uniform vec3 uRim;
  uniform float uCoreAlpha;
  varying vec3 vN;
  varying vec3 vV;
  varying float vY;
  float h(float n) { return fract(sin(n) * 43758.5453); }
  void main() {
    float fr = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
    float tail = smoothstep(0.0, 0.35, vY);
    float shimmer = 0.85 + 0.15 * sin(vY * 40.0 - uTime * 6.0);
    vec3 col = mix(uCore, uRim, fr);
    float a = (uCoreAlpha + fr * (1.0 - uCoreAlpha)) * tail * shimmer * uOpacity;
    gl_FragColor = vec4(col, a);
  }`;

function ghostMaterial(core, rim, coreAlpha, additive, height) {
  return new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: frag,
    uniforms: {
      uTime: { value: 0 }, uOpacity: { value: 0 }, uHeight: { value: height },
      uCore: { value: new THREE.Color(core) }, uRim: { value: new THREE.Color(rim) }, uCoreAlpha: { value: coreAlpha },
    },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

export class GhostVisual {
  constructor(scene, type) {
    this.type = type;
    this.def = GHOSTS[type];
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    this.pos = new THREE.Vector3();
    this.manifestUntil = 0;
    this.manifestStart = 0;
    this.photo = false;
    this.opacity = 0;
    this.build();
  }

  build() {
    const t = this.type;
    const H = this.def.height;
    if (t === 'shadow') {
      this.mat = ghostMaterial('#020206', '#6a4cff', 0.92, false, H);
      const prof = [[0.0, 0], [0.36, 0], [0.34, 0.35], [0.29, 0.9], [0.25, 1.3], [0.27, 1.5], [0.2, 1.62], [0.0, 1.66]];
      this.body = new THREE.Mesh(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 18), this.mat);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), this.mat);
      head.scale.set(1, 1.2, 1);
      head.position.y = 1.82;
      this.group.add(this.body, head);
      for (const s of [-1, 1]) {
        const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.75, 4, 8), this.mat);
        arm.position.set(s * 0.3, 1.1, 0.02);
        arm.rotation.z = s * 0.12;
        this.group.add(arm);
      }
      this.eyes = this.makeEyes(0xc8d4ff, 1.84, 0.06, 0.15);
    } else if (t === 'child') {
      this.mat = ghostMaterial('#9fe8ff', '#e6fbff', 0.22, true, H);
      const prof = [[0.0, 0], [0.27, 0.02], [0.24, 0.18], [0.16, 0.46], [0.12, 0.62], [0.1, 0.74], [0.0, 0.78]];
      this.body = new THREE.Mesh(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 18), this.mat);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), this.mat);
      head.position.y = 0.92;
      const hair = new THREE.Mesh(new THREE.SphereGeometry(0.145, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), this.mat);
      hair.position.y = 0.94;
      hair.rotation.x = 0.25;
      this.group.add(this.body, head, hair);
      for (const s of [-1, 1]) {
        const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.3, 4, 8), this.mat);
        arm.position.set(s * 0.14, 0.58, 0);
        arm.rotation.z = s * 0.25;
        this.group.add(arm);
      }
      this.eyes = this.makeEyes(0x0a1a2a, 0.93, 0.045, 0.12, false);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('160,230,255'), color: 0x9fe8ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5 }));
      glow.scale.set(1.6, 1.8, 1);
      glow.position.y = 0.6;
      this.glow = glow;
      this.group.add(glow);
    } else {
      // the poltergeist is a churning knot of dust and debris
      this.mat = ghostMaterial('#2a0a06', '#ff8a59', 0.4, true, H);
      const n = 140;
      const geo = new THREE.BufferGeometry();
      const p = new Float32Array(n * 3);
      this.seeds = [];
      for (let i = 0; i < n; i++) this.seeds.push([Math.random() * 6.28, 0.15 + Math.random() * 0.45, Math.random() * 1.7, 0.6 + Math.random() * 1.6]);
      geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
      this.points = new THREE.Points(geo, new THREE.PointsMaterial({ map: glowTexture('255,160,110'), color: 0xff9a6a, size: 0.12, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
      this.group.add(this.points);
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.35, 14, 10), this.mat);
      core.scale.set(1, 2.2, 1);
      core.position.y = 0.9;
      this.group.add(core);
      this.eyes = this.makeEyes(0xffd0a0, 1.45, 0.07, 0.25);
    }
    this.group.traverse((o) => { o.renderOrder = 5; o.frustumCulled = false; });
  }

  makeEyes(color, y, sep, z, glow = true) {
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending });
    const g = new THREE.Group();
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), m);
      e.position.set(s * sep, y, z);
      e.scale.set(1, 0.6, 1);
      g.add(e);
    }
    this.group.add(g);
    this.eyeMat = m;
    return g;
  }

  manifest(now, dur) {
    this.manifestStart = now;
    this.manifestUntil = now + dur;
  }

  /** state: {x,y,z,surge,escape}. Returns how visible it is right now (0..1). */
  update(dt, now, state, camPos, reduceFlash) {
    if (!state) return 0;
    const target = new THREE.Vector3(state.x, state.y, state.z);
    if (this.pos.distanceTo(target) > 2.5) this.pos.copy(target);
    else this.pos.lerp(target, 1 - Math.exp(-12 * dt));
    this.group.position.copy(this.pos);
    this.group.rotation.y = Math.atan2(camPos.x - this.pos.x, camPos.z - this.pos.z);
    let o = 0;
    if (now < this.manifestUntil) {
      const k = (now - this.manifestStart) / Math.max(0.01, this.manifestUntil - this.manifestStart);
      o = Math.sin(Math.min(1, k) * Math.PI) * 1.4;
      if (!reduceFlash && Math.sin(now * 37) > 0.75) o *= 0.4;
    }
    if (state.surge) {
      const f = reduceFlash ? 0.75 : (Math.sin(now * 23) * Math.sin(now * 7.3) > -0.2 ? 1 : 0.15);
      o = Math.max(o, (this.type === 'shadow' ? 0.85 : 0.75) * f);
    }
    if (this.photo) o = 1;
    o = clamp(o, 0, 1);
    this.opacity = damp(this.opacity, o, 30, dt);
    if (this.photo) this.opacity = o;
    this.group.visible = this.opacity > 0.01;
    this.mat.uniforms.uTime.value = now;
    // the camera sees spirits more clearly than eyes do
    this.mat.uniforms.uOpacity.value = this.photo ? (this.type === 'child' ? 1.6 : 1.2) : this.opacity;
    this.eyeMat.opacity = this.opacity;
    if (this.glow) this.glow.material.opacity = this.photo ? 0.9 : this.opacity * 0.5;
    if (this.points) {
      this.points.material.opacity = this.opacity;
      const p = this.points.geometry.attributes.position;
      for (let i = 0; i < this.seeds.length; i++) {
        const [a, r, y, sp] = this.seeds[i];
        const ang = a + now * sp;
        p.setXYZ(i, Math.cos(ang) * r * (1 + y * 0.3), y + Math.sin(now * 2 + a) * 0.08, Math.sin(ang) * r * (1 + y * 0.3));
      }
      p.needsUpdate = true;
    }
    return this.opacity;
  }

  /** Point used for photos and sightings. */
  center() {
    return { x: this.pos.x, y: this.pos.y + this.def.height * 0.55, z: this.pos.z };
  }

  dispose() {
    this.group.parent && this.group.parent.remove(this.group);
  }
}

/* ------------------------------------------------------------------ */
/* Behaviour (authority only)                                          */
/* ------------------------------------------------------------------ */

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const dist3 = (a, b) => Math.hypot(a.x - b.x, (a.y || 0) - (b.y || 0), a.z - b.z);

export class GhostBrain {
  constructor(inv, type, home, seed, diff) {
    this.inv = inv;
    this.house = inv.house;
    this.type = type;
    this.def = GHOSTS[type];
    this.home = home;
    this.diff = DIFFICULTY[diff] || DIFFICULTY.amateur;
    this.r = rng(seed);
    this.pos = this.house.randomPoint(home, this.r) || this.house.roomCenter(home);
    this.room = home;
    this.path = [];
    this.wait = 3;
    this.speed = 0.8 * this.def.pace;
    this.activity = 0.3;
    this.eventT = 6 + this.r() * 5;
    this.mode = 'wander';
    this.follow = null;
    this.surge = null;
    this.lastSurgeEnd = 0;
    this.surgeCheck = 0;
    this.surges = 0;
    this.queue = [];
    this.escape = false;
    this.neighbours = this.findNeighbours(home);
  }

  findNeighbours(room) {
    const set = new Set();
    for (const n of this.house.nav) if (n.rooms.includes(room)) n.rooms.forEach((r) => set.add(r));
    set.delete(room);
    return [...set].filter((r) => ROOMS[r] && this.validRoom(r));
  }

  validRoom(r) {
    const d = ROOMS[r];
    if (!d || d.outside || r === 'cellar') return false;
    if (d.ghost === 'basement' && !this.inv.setup.cellar) return false;
    if (r === 'storage' || r === 'basement') return !!this.inv.setup.cellar;
    return true;
  }

  state() {
    return { x: this.pos.x, y: this.pos.y, z: this.pos.z, room: this.room, surge: !!this.surge, mode: this.mode };
  }

  /* ---------- movement ---------- */

  goTo(roomId, point, speed) {
    const q = point || this.house.randomPoint(roomId, this.r);
    if (!q) return;
    this.path = this.house.route(this.pos, this.room, q, roomId);
    this.speed = speed || 0.8 * this.def.pace;
  }

  step(dt) {
    if (!this.path.length) return true;
    const t = this.path[0];
    const dx = t.x - this.pos.x, dy = t.y - this.pos.y, dz = t.z - this.pos.z;
    const d = Math.hypot(dx, dy, dz);
    const s = this.speed * dt;
    if (d <= s) {
      this.pos.x = t.x; this.pos.y = t.y; this.pos.z = t.z;
      this.path.shift();
    } else {
      this.pos.x += (dx / d) * s; this.pos.y += (dy / d) * s; this.pos.z += (dz / d) * s;
    }
    const r = this.house.roomAt(this.pos.x, this.pos.y + 0.1, this.pos.z);
    if (r && r !== 'yard') this.room = r;
    return !this.path.length;
  }

  wander(dt) {
    if (this.path.length) { this.step(dt); return; }
    this.wait -= dt;
    if (this.wait > 0) return;
    const roam = this.type === 'child' ? 0.45 : this.type === 'poltergeist' ? 0.3 : 0.25;
    let target = this.home;
    const x = this.r();
    if (x < roam && this.neighbours.length) target = this.r.pick(this.neighbours);
    else if (x < roam + 0.06) {
      const all = Object.keys(ROOMS).filter((r) => this.validRoom(r) && ROOMS[r].ghost);
      target = this.r.pick(all);
    }
    if (this.room !== this.home && target !== this.home && this.r() < 0.6) target = this.home; // drift back home
    this.goTo(target);
    this.wait = 2 + this.r() * 5;
  }

  /* ---------- the main loop ---------- */

  update(dt, t) {
    const players = this.inv.livePlayers();
    const inside = players.filter((p) => p.inside && !p.hidden);
    const avgNerve = players.length ? players.reduce((s, p) => s + p.nerve, 0) / players.length : 100;
    const near = inside.some((p) => p.room === this.room);
    const want = clamp(0.3 + Math.min(0.3, t / 700) + (1 - avgNerve / 100) * 0.35 + (near ? 0.1 : 0), 0, 1);
    this.activity = damp(this.activity, want, 0.2, dt);

    // queued follow-ups (multi-throws, delayed slams)
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const q = this.queue[i];
      q.at -= dt;
      if (q.at <= 0) { this.queue.splice(i, 1); q.fn(); }
    }

    if (this.surge) { this.updateSurge(dt, t, players); return; }

    if (this.mode === 'follow') this.updateFollow(dt, t, players);
    else this.wander(dt);

    const rate = (0.55 + this.activity) * this.diff.activity * (inside.length ? 1 : 0.35);
    this.eventT -= dt * rate;
    if (this.eventT <= 0) {
      this.doEvent(players, t);
      this.eventT = 7 + this.r() * 9;
    }

    this.surgeCheck -= dt;
    if (this.surgeCheck <= 0) {
      this.surgeCheck = 6;
      const since = t - this.lastSurgeEnd;
      const ready = t > this.diff.surgeAfter && since > (this.inv.danger ? 40 : 75);
      const nervy = avgNerve < this.diff.surgeNerve || t > this.diff.surgeAfter + 300;
      if (ready && nervy && inside.length && this.r() < 0.32) this.startSurge(t);
    }
  }

  /* ---------- events ---------- */

  emf(x, y, z) {
    const lvl = this.def.evidence.includes('emf') && this.r() < 0.42 ? 5 : this.r.int(2, 4);
    this.inv.emit({ t: 'emf', x, y, z, lvl });
  }

  sound(k, extra = {}) {
    const p = { x: this.pos.x, y: this.pos.y + (this.type === 'child' ? 0.8 : 1.3), z: this.pos.z };
    this.inv.emit({ t: 'sound', k, ...p, ...extra });
  }

  nearestPlayer(players, maxD = 99, filter = () => true) {
    let best = null, bd = maxD;
    for (const p of players) {
      if (!p.inside || p.hidden || !filter(p)) continue;
      if (layerOfY(p.pos.y + 0.1) !== layerOfY(this.pos.y + 0.1) && Math.abs(p.pos.y - this.pos.y) > 1.5) continue;
      const d = dist(p.pos, this.pos);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  nearestDoor(maxD) {
    let best = null, bd = maxD;
    for (const id in this.house.doors) {
      const d = this.house.doors[id];
      if (d.def.open || d.def.ext || d.locked) continue;
      if (Math.abs(d.center.y - this.pos.y) > 1.5) continue;
      const dd = dist(d.center, this.pos);
      if (dd < bd) { bd = dd; best = d; }
    }
    return best;
  }

  doEvent(players, t) {
    const acts = { ...this.def.acts };
    const lit = this.house.rooms[this.room] && this.house.rooms[this.room].on;
    if (acts.lightsOff && !lit) acts.lightsOff = 0;
    if (acts.lightsOn && lit) acts.lightsOn = 0;
    if (acts.flicker && !lit) acts.flicker *= 0.4;
    for (let tries = 0; tries < 4; tries++) {
      const k = weighted(acts, this.r);
      if (!k) return;
      if (this.act(k, players, t)) return;
      acts[k] = 0;
    }
  }

  act(k, players, t) {
    const h = this.house;
    switch (k) {
      case 'manifest': {
        // it shouldn't show itself too often, or it stops being scary
        if (t - (this.lastSeen || -99) < 14) return false;
        const spot = this.peekSpot(players);
        if (!spot) return false;
        this.lastSeen = t;
        this.pos = { ...spot };
        this.path = [];
        this.wait = 2.5;
        const dur = this.type === 'child' ? 1.2 + this.r() * 0.8 : 1.6 + this.r() * 1.2;
        this.inv.emit({ t: 'manifest', x: spot.x, y: spot.y, z: spot.z, dur });
        this.emf(spot.x, spot.y + 1, spot.z);
        return true;
      }
      case 'flicker': {
        let room = this.room;
        const p = this.nearestPlayer(players, 7);
        if (!h.rooms[room].on && p && p.room && h.rooms[p.room] && h.rooms[p.room].on) room = p.room;
        if (!h.rooms[room] || !h.rooms[room].lamps.length) return false;
        const l = h.rooms[room].lamps[0];
        this.inv.emit({ t: 'flicker', room, dur: 2.2 + this.r() * 1.5 });
        this.emf(l.x, l.y, l.z);
        return true;
      }
      case 'torch': {
        const p = this.nearestPlayer(players, 6.5, (q) => q.torch);
        if (!p) return false;
        this.inv.emit({ t: 'torch', pid: p.pid, dur: 1.5 + this.r() * 1.5 });
        this.emf(this.pos.x, this.pos.y + 1.2, this.pos.z);
        return true;
      }
      case 'follow': {
        if (t - (this.lastFollow || -99) < 45) return false;
        const p = this.nearestPlayer(players, 14, (q) => !q.lit);
        if (!p || this.mode === 'follow') return false;
        this.lastFollow = t;
        this.mode = 'follow';
        this.follow = { pid: p.pid, until: t + 12 + this.r() * 6, repath: 0, stepT: 1.5 };
        return true;
      }
      case 'steps': {
        if (!this.nearestPlayer(players, 10)) return false;
        this.sound('steps', { surface: this.surfaceAt() });
        return true;
      }
      case 'creak': {
        const d = this.nearestDoor(4.5);
        if (!d) { this.sound('creak'); return true; }
        this.inv.emit({ t: 'door', id: d.id, open: d.target < 0.5 ? 1 : 0, creak: true });
        this.emf(d.center.x, d.center.y + 1.1, d.center.z);
        return true;
      }
      case 'whisper': {
        if (!this.nearestPlayer(players, 7)) return false;
        this.sound('whisper');
        return true;
      }
      case 'lightsOff': case 'lightsOn': case 'lightsToggle': {
        const room = h.rooms[this.room];
        if (!room || !room.sw) return false;
        const on = k === 'lightsOn' ? true : k === 'lightsOff' ? false : !room.on;
        if (on === room.on) return false;
        this.inv.emit({ t: 'light', room: this.room, on, ghost: true });
        this.emf(room.sw.x, room.sw.y, room.sw.z);
        return true;
      }
      case 'throw': return this.throwOne(players);
      case 'multiThrow': {
        if (!this.throwOne(players)) return false;
        const n = this.r.int(1, 3);
        for (let i = 0; i < n; i++) this.queue.push({ at: 0.3 + i * 0.35, fn: () => this.throwOne(players) });
        return true;
      }
      case 'slam': {
        const d = this.nearestDoor(5.5);
        if (!d) return false;
        if (d.target > 0.5) this.inv.emit({ t: 'door', id: d.id, open: 0, slam: true });
        else {
          this.inv.emit({ t: 'door', id: d.id, open: 1, creak: true });
          this.queue.push({ at: 1.6, fn: () => this.inv.emit({ t: 'door', id: d.id, open: 0, slam: true }) });
        }
        this.emf(d.center.x, d.center.y + 1.1, d.center.z);
        return true;
      }
      case 'knock': {
        this.sound('knock', { n: this.r.int(2, 4) });
        this.emf(this.pos.x, this.pos.y + 1, this.pos.z);
        return true;
      }
      case 'giggle': { this.sound('giggle'); return true; }
      case 'hum': { this.sound('hum'); return true; }
      case 'run': {
        const target = this.neighbours.length && this.r() < 0.6 ? this.r.pick(this.neighbours) : this.room;
        this.goTo(target, null, 2.8);
        this.sound('run', { surface: this.surfaceAt() });
        return true;
      }
      case 'music': {
        const mb = h.musicBox;
        if (!mb || (this.room !== 'nursery' && this.home !== 'nursery')) return this.act('toy', players, t);
        this.inv.emit({ t: 'sound', k: 'music', x: mb.x, y: mb.y, z: mb.z });
        this.emf(mb.x, mb.y, mb.z);
        return true;
      }
      case 'toy': {
        this.sound('toy');
        this.inv.emit({ t: 'rock', room: this.room });
        this.emf(this.pos.x, this.pos.y + 0.6, this.pos.z);
        return true;
      }
      default: return false;
    }
  }

  surfaceAt() {
    const r = this.room;
    const f = (ROOMS[r] && ROOMS[r].floor) || 'planks';
    return f.startsWith('carpet') ? 'carpet' : f === 'checker' || f === 'bathFloor' ? 'tile' : f === 'concrete' ? 'concrete' : 'wood';
  }

  throwOne(players) {
    const h = this.house;
    const opts = h.throwables.filter((o) => !o.flying && o.room === this.room && dist(o.obj.position, this.pos) < 4.5);
    if (!opts.length) {
      // look for something to throw in the room
      const any = h.throwables.filter((o) => !o.flying && o.room === this.room);
      if (!any.length) return false;
      const o = this.r.pick(any);
      this.pos.x = o.obj.position.x + (this.r() - 0.5);
      this.pos.z = o.obj.position.z + (this.r() - 0.5);
      opts.push(o);
    }
    const o = this.r.pick(opts);
    const p = this.nearestPlayer(players, 8);
    let ang = this.r() * Math.PI * 2;
    if (p && this.r() < 0.7) ang = Math.atan2(p.pos.z - o.obj.position.z, p.pos.x - o.obj.position.x) + (this.r() - 0.5) * 1.2;
    const sp = 2.5 + this.r() * 2.5;
    const v = [Math.cos(ang) * sp, 1.6 + this.r() * 1.8, Math.sin(ang) * sp];
    const s = [(this.r() - 0.5) * 16, (this.r() - 0.5) * 16, (this.r() - 0.5) * 16];
    const op = o.obj.position;
    this.inv.emit({ t: 'throw', id: o.id, x: op.x, y: op.y, z: op.z, v, s });
    this.emf(op.x, op.y, op.z);
    return true;
  }

  /** A spot in or at the edge of the ghost's room where a player will see it. */
  peekSpot(players) {
    const h = this.house;
    const cands = [{ ...this.pos }];
    for (const n of h.nav) if (n.rooms.includes(this.room) && !n.stair) cands.push({ x: n.x, y: n.y, z: n.z });
    for (let i = 0; i < 6; i++) { const p = h.randomPoint(this.room, this.r, 0.5); if (p) cands.push(p); }
    let best = null, bs = -1e9;
    const H = this.def.height * 0.6;
    for (const p of players) {
      if (!p.inside || p.hidden) continue;
      for (const c of cands) {
        const d = dist(c, p.pos);
        if (d < 2.4 || d > 10) continue;
        if (Math.abs(c.y - p.pos.y) > 1.2) continue;
        if (!h.los(p.eye, { x: c.x, y: c.y + H, z: c.z })) continue;
        // prefer spots in front of the player
        const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
        const dot = ((c.x - p.pos.x) * fx + (c.z - p.pos.z) * fz) / d;
        const s = -Math.abs(d - 5) + dot * 3 + this.r();
        if (s > bs) { bs = s; best = c; }
      }
    }
    return best;
  }

  updateFollow(dt, t, players) {
    const f = this.follow;
    const p = players.find((q) => q.pid === f.pid);
    if (!p || !p.inside || p.hidden || t > f.until) { this.mode = 'wander'; this.follow = null; this.goTo(this.home); return; }
    f.repath -= dt;
    if (f.repath <= 0) {
      f.repath = 1;
      const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
      const goal = { x: p.pos.x - fx * 3.2, y: p.pos.y, z: p.pos.z - fz * 3.2 };
      const gr = this.house.roomAt(goal.x, goal.y + 0.1, goal.z);
      if (gr && gr !== 'yard') this.goTo(gr, goal, 1.5);
      else this.goTo(p.room || this.room, { x: p.pos.x, y: p.pos.y, z: p.pos.z }, 1.5);
      // stop a little short
      if (this.path.length && dist(this.path[this.path.length - 1], p.pos) < 2.2) this.path.pop();
    }
    this.step(dt);
    f.stepT -= dt;
    if (f.stepT <= 0) {
      f.stepT = 2.2 + this.r() * 1.5;
      if (dist(this.pos, p.pos) < 7) this.sound('steps', { surface: this.surfaceAt() });
    }
    // caught looking: a glimpse, then it's gone
    const d = dist(this.pos, p.pos);
    if (d < 7) {
      const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
      const dot = ((this.pos.x - p.pos.x) * fx + (this.pos.z - p.pos.z) * fz) / Math.max(0.01, d);
      if (dot > 0.75 && this.house.los(p.eye, { x: this.pos.x, y: this.pos.y + 1.2, z: this.pos.z })) {
        this.lastSeen = t;
        this.inv.emit({ t: 'manifest', x: this.pos.x, y: this.pos.y, z: this.pos.z, dur: 0.45 });
        this.emf(this.pos.x, this.pos.y + 1, this.pos.z);
        this.mode = 'wander';
        this.follow = null;
        this.queue.push({ at: 0.5, fn: () => { const q = this.house.randomPoint(this.home, this.r); if (q) { this.pos = q; this.room = this.home; this.path = []; } } });
      }
    }
  }

  /* ---------- surges ---------- */

  startSurge(t, opts = {}) {
    const dur = opts.dur || this.diff.surgeLen;
    this.surge = { start: t, warm: opts.warm == null ? 2.6 : opts.warm, end: opts.endless ? Infinity : t + 2.6 + dur, target: null, last: null, repath: 0, lostT: 0 };
    this.surges++;
    this.mode = 'surge';
    this.path = [];
    this.follow = null;
    this.inv.emit({ t: 'surge', on: true, dur, escape: !!opts.endless });
  }

  endSurge(t) {
    this.surge = null;
    this.lastSurgeEnd = t;
    this.mode = 'wander';
    this.path = [];
    this.wait = 2;
    this.inv.emit({ t: 'surge', on: false });
    // after a few surges the house gets properly dangerous
    if (this.surges >= 3 && !this.inv.danger && !this.escape) this.inv.emit({ t: 'danger' });
  }

  updateSurge(dt, t, players) {
    const s = this.surge;
    if (t < s.start + s.warm) return;
    if (t > s.end) { this.endSurge(t); return; }
    const mul = this.diff === DIFFICULTY.professional ? 1.12 : this.diff === DIFFICULTY.amateur ? 0.9 : 1;
    const speed = (this.escape ? 1.3 : this.def.surgeSpeed) * mul;
    // who can it sense?
    let seen = null, sd = 1e9;
    const eye = { x: this.pos.x, y: this.pos.y + 1.0, z: this.pos.z };
    for (const p of players) {
      if (!p.inside || p.hidden) continue;
      const d = dist3(p.pos, this.pos);
      if (d > 16) continue;
      if (d < 3 || this.house.los(eye, p.eye)) { if (d < sd) { sd = d; seen = p; } }
    }
    if (seen) { s.last = { x: seen.pos.x, y: seen.pos.y, z: seen.pos.z, room: seen.room }; s.target = seen.pid; s.lostT = 0; }
    s.repath -= dt;
    if (s.repath <= 0) {
      s.repath = 0.45;
      if (s.last && s.last.room) {
        this.goTo(s.last.room, { x: s.last.x, y: s.last.y, z: s.last.z }, speed);
      } else if (!this.path.length) {
        const opts = [this.room, ...this.findNeighbours(this.room)];
        this.goTo(this.r.pick(opts), null, speed * 0.8);
      }
    }
    this.step(dt);
    if (s.last && !this.path.length && !seen) {
      s.lostT += dt;
      if (s.lostT > 1.5) s.last = null;
    }
    // catch
    for (const p of players) {
      if (!p.inside || p.hidden) continue;
      if (dist(p.pos, this.pos) < 0.85 && Math.abs(p.pos.y - this.pos.y) < 1.3) {
        this.inv.emit({ t: 'spook', pid: p.pid });
        if (!this.escape) { this.endSurge(t); return; }
        s.last = null;
        const q = this.house.randomPoint(this.home, this.r);
        if (q) { this.pos = q; this.room = this.home; this.path = []; }
      }
    }
  }
}
