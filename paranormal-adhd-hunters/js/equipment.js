/* ParanormalADHDhunters — the kit you hold: EMF meter, thermometer, spirit box
   and camera, plus the chest flashlight. The held models are drawn in their own
   pass on top of the world so they never poke through walls. */
import * as THREE from 'three';
import { EQUIPMENT, TOOLS } from './data.js';
import { clamp, damp } from './util.js';
import { glowTexture } from './textures.js';

function matcapTexture() {
  const s = 128, c = document.createElement('canvas');
  c.width = c.height = s;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(s * 0.38, s * 0.32, s * 0.04, s * 0.5, s * 0.5, s * 0.62);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, '#a8a8b8'); g.addColorStop(0.75, '#4a4a58'); g.addColorStop(1, '#16161e');
  x.fillStyle = g; x.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Kit {
  constructor(renderer, audio, settings) {
    this.renderer = renderer;
    this.audio = audio;
    this.settings = settings;
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(55, 1, 0.01, 5);
    this.scene.add(this.cam);
    this.matcap = matcapTexture();
    this.mats = new Map();
    this.current = 'emf';
    this.flash = false;
    this.tiers = { flashlight: 0, emf: 0, thermo: 0, spirit: 0, camera: 0 };
    this.swap = 0;
    this.pending = null;
    this.sway = { x: 0, y: 0 };
    this.emf = { level: 0, shown: 0, beepT: 0 };
    this.thermo = { shown: 12, next: 0, value: null };
    this.spirit = { text: '', until: 0, freq: 88.1, next: 0, hint: '' };
    this.camera = { shots: 6, max: 6, cool: 0 };
    this.screensT = 0;
    this.visible = true;
    this.arm = new THREE.Group();
    this.cam.add(this.arm);
    this.buildArm('#1b2350');
    this.models = {
      emf: this.buildEMF(),
      thermo: this.buildThermo(),
      spirit: this.buildSpirit(),
      camera: this.buildCamera(),
    };
    for (const k in this.models) { this.hand.add(this.models[k]); this.models[k].visible = k === this.current; }
    this.static = null;
  }

  M(color) {
    if (!this.mats.has(color)) this.mats.set(color, new THREE.MeshMatcapMaterial({ matcap: this.matcap, color: new THREE.Color(color) }));
    return this.mats.get(color);
  }

  box(g, w, h, d, color, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof color === 'string' ? this.M(color) : color);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  }

  buildArm(jacket) {
    this.sleeveMat = new THREE.MeshMatcapMaterial({ matcap: this.matcap, color: new THREE.Color(jacket) });
    this.trimMat = new THREE.MeshMatcapMaterial({ matcap: this.matcap, color: new THREE.Color('#8a5cf6') });
    // the hand sits where the device is held; the sleeve runs off-screen from there
    this.hand = new THREE.Group();
    this.hand.position.set(0.15, -0.155, -0.36);
    this.hand.rotation.set(0.42, -0.2, 0.05);
    this.arm.add(this.hand);
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.05, 0.42, 12), this.sleeveMat);
    sleeve.position.set(0.04, -0.2, 0.13);
    sleeve.rotation.set(-1.0, 0, 0.35);
    this.hand.add(sleeve);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 12), this.trimMat);
    cuff.position.set(0.012, -0.085, 0.045);
    cuff.rotation.copy(sleeve.rotation);
    this.hand.add(cuff);
    const skin = this.M('#c89a7c');
    const palm = this.box(this.hand, 0.06, 0.05, 0.03, skin, 0, -0.07, -0.005);
    palm.rotation.x = -0.2;
    for (let i = 0; i < 3; i++) this.box(this.hand, 0.014, 0.012, 0.035, skin, -0.022 + i * 0.022, -0.055, 0.018);
  }

  setUniform(jacket, trim) {
    this.sleeveMat.color.set(jacket);
    if (trim) this.trimMat.color.set(trim);
  }

  screen(w, h, cw = 128, ch = 64) {
    const c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
    return { c, x: c.getContext('2d'), tex, mesh };
  }

  buildEMF() {
    const g = new THREE.Group();
    this.box(g, 0.066, 0.14, 0.026, '#2c2f3a', 0, 0, 0);
    this.box(g, 0.058, 0.03, 0.004, '#121318', 0, 0.045, 0.014);
    this.box(g, 0.04, 0.012, 0.003, '#8a5cf6', 0, 0.012, 0.014);
    this.box(g, 0.012, 0.012, 0.004, '#d8d8e0', 0, -0.03, 0.014);
    const colors = ['#2bff6a', '#9bff2b', '#ffe12b', '#ff8a2b', '#ff2b4a'];
    this.leds = colors.map((col, i) => {
      const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(0.18) });
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.007, 0.004), m);
      led.position.set(-0.022 + i * 0.011, 0.045, 0.017);
      g.add(led);
      return { m, on: new THREE.Color(col), off: new THREE.Color(col).multiplyScalar(0.16) };
    });
    this.emfGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('255,255,255'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    this.emfGlow.scale.set(0.09, 0.05, 1);
    this.emfGlow.position.set(0, 0.046, 0.025);
    g.add(this.emfGlow);
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.03, 8), this.M('#1a1a20'));
    ant.position.set(0.02, 0.083, 0);
    g.add(ant);
    return g;
  }

  buildThermo() {
    const g = new THREE.Group();
    this.box(g, 0.064, 0.105, 0.03, '#d9dde6', 0, 0, 0);
    this.box(g, 0.064, 0.02, 0.03, '#7fe3ff', 0, 0.058, 0);
    this.thermoScreen = this.screen(0.052, 0.034, 128, 84);
    this.thermoScreen.mesh.position.set(0, 0.022, 0.0155);
    g.add(this.thermoScreen.mesh);
    this.box(g, 0.012, 0.012, 0.004, '#8a5cf6', -0.014, -0.025, 0.016);
    this.box(g, 0.012, 0.012, 0.004, '#3a3a48', 0.014, -0.025, 0.016);
    const probe = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.05, 6), this.M('#9aa3a8'));
    probe.position.set(0, 0.09, 0);
    g.add(probe);
    return g;
  }

  buildSpirit() {
    const g = new THREE.Group();
    this.box(g, 0.085, 0.13, 0.03, '#5a1e2e', 0, 0, 0);
    this.spiritScreen = this.screen(0.07, 0.035, 160, 80);
    this.spiritScreen.mesh.position.set(0, 0.035, 0.0155);
    g.add(this.spiritScreen.mesh);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 5; j++) {
      const d = new THREE.Mesh(new THREE.CircleGeometry(0.003, 6), this.M('#111'));
      d.position.set(-0.024 + j * 0.012, -0.015 - i * 0.011, 0.0155);
      g.add(d);
    }
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0035, 0.16, 6), this.M('#b8bcc8'));
    ant.position.set(-0.03, 0.13, -0.004);
    ant.rotation.z = 0.25;
    g.add(ant);
    return g;
  }

  buildCamera() {
    const g = new THREE.Group();
    this.box(g, 0.12, 0.072, 0.04, '#1a1b22', 0, 0, 0);
    this.box(g, 0.03, 0.015, 0.03, '#2a2b33', -0.035, 0.043, 0);
    this.camScreen = this.screen(0.075, 0.045, 160, 96);
    this.camScreen.mesh.position.set(-0.008, 0, 0.0205);
    g.add(this.camScreen.mesh);
    const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.006, 10), this.M('#c83a3a'));
    btn.position.set(0.04, 0.038, 0);
    g.add(btn);
    this.flashLamp = new THREE.MeshBasicMaterial({ color: 0x777777 });
    this.box(g, 0.022, 0.012, 0.004, this.flashLamp, 0.035, 0.022, -0.021);
    g.rotation.y = 0.15;
    return g;
  }

  setTiers(t) {
    Object.assign(this.tiers, t);
    const cam = EQUIPMENT.camera.tiers[this.tiers.camera];
    this.camera.max = cam.shots;
  }

  tier(id) { return EQUIPMENT[id].tiers[this.tiers[id] || 0]; }

  reset() {
    this.camera.shots = this.camera.max;
    this.camera.cool = 0;
    this.spirit.until = 0;
    this.spirit.hint = '';
    this.thermo.next = 0;
    this.emf.beepT = 0;
    this.screensT = 0;
    this.emf.level = this.emf.shown = 0;
    this.thermo.value = null;
    this.spirit.text = '';
    this.flash = false;
    this.select('emf', true);
  }

  select(id, instant = false) {
    if (!TOOLS.includes(id)) return;
    if (id === this.current && !instant) return;
    if (instant) {
      this.current = id;
      for (const k in this.models) this.models[k].visible = k === id;
      this.swap = 0; this.pending = null;
    } else {
      this.pending = id;
      this.swap = Math.max(this.swap, 0.001);
      this.audio.play('click');
    }
    if (this.static) this.static.set(id === 'spirit' ? 1 : 0);
  }

  startStatic() {
    if (!this.static) this.static = this.audio.staticLoop();
    this.static.set(this.current === 'spirit' ? 1 : 0);
  }

  stopStatic() {
    if (this.static) { this.static.stop(); this.static = null; }
  }

  /** ctx gives readings: emfAt(range), tempAt(), spiritAllowed() */
  update(dt, now, ctx) {
    // swapping animation: drop the hand, change device, raise it
    let drop = 0;
    if (this.pending || this.swap > 0) {
      this.swap += dt;
      if (this.pending && this.swap > 0.16) {
        this.current = this.pending;
        this.pending = null;
        for (const k in this.models) this.models[k].visible = k === this.current;
      }
      drop = this.swap < 0.16 ? this.swap / 0.16 : Math.max(0, 1 - (this.swap - 0.16) / 0.2);
      if (!this.pending && this.swap > 0.36) this.swap = 0;
    }
    const moving = ctx.moving || 0;
    const tt = now * (moving > 0.2 ? 7 : 1.4);
    const amp = moving > 0.2 ? 0.006 : 0.0025;
    this.sway.x = damp(this.sway.x, (ctx.lookDX || 0) * -0.25, 8, dt);
    this.sway.y = damp(this.sway.y, (ctx.lookDY || 0) * 0.25, 8, dt);
    this.arm.position.set(Math.sin(tt) * amp + clamp(this.sway.x, -0.03, 0.03), -Math.abs(Math.cos(tt)) * amp - drop * 0.28 + clamp(this.sway.y, -0.03, 0.03), 0);
    this.arm.visible = this.visible;

    if (this.current === 'emf') this.updateEMF(dt, now, ctx);
    else { this.emf.shown = 0; }
    if (this.current === 'thermo') this.updateThermo(now, ctx);
    if (this.current === 'spirit') this.updateSpirit(now, ctx);
    if (this.current === 'camera') this.updateCamera(dt, now);
    if (this.static) this.static.set(this.current === 'spirit' ? (now < this.spirit.until ? 2.2 : 1) : 0);
  }

  updateEMF(dt, now, ctx) {
    const range = this.tier('emf').range;
    const lvl = Math.max(1, ctx.emfAt(range));
    this.emf.level = lvl;
    // the needle jitters a little before settling
    if (lvl !== this.emf.shown) this.emf.shown = lvl > this.emf.shown ? Math.min(lvl, this.emf.shown + 1) : lvl;
    for (let i = 0; i < 5; i++) {
      const on = i < this.emf.shown;
      const led = this.leds[i];
      led.m.color.copy(on ? led.on : led.off);
      if (on && this.emf.shown >= 4 && Math.sin(now * 40 + i) > 0.6) led.m.color.multiplyScalar(0.6);
    }
    this.emfGlow.material.opacity = this.emf.shown >= 2 ? 0.25 + this.emf.shown * 0.1 : 0;
    this.emfGlow.material.color.copy(this.leds[Math.max(0, this.emf.shown - 1)].on);
    if (this.emf.shown >= 2) {
      const gap = [0, 0, 1.0, 0.5, 0.25, 0.12][this.emf.shown];
      if (now >= this.emf.beepT) { this.audio.play('emf', { level: this.emf.shown }); this.emf.beepT = now + gap; }
    }
  }

  updateThermo(now, ctx) {
    const t = this.tier('thermo');
    if (now >= this.thermo.next) {
      const real = ctx.tempAt();
      const noise = (Math.random() - 0.5) * 2 * t.noise;
      // slower thermometers lag behind the real value
      const v = this.thermo.value == null ? real : this.thermo.value + (real - this.thermo.value) * (t.rate < 0.5 ? 0.9 : 0.6);
      this.thermo.value = v;
      this.thermo.shown = Math.round((v + noise) * 10) / 10;
      this.thermo.next = now + t.rate;
      this.audio.play('beep', { freq: 2200 });
      this.drawThermo();
    }
  }

  drawThermo() {
    const { x, c, tex } = this.thermoScreen;
    const v = this.thermo.shown;
    const cold = v < 0;
    x.fillStyle = cold ? '#04202a' : '#0a1a10';
    x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = cold ? '#7fe3ff' : '#8dffb0';
    x.font = 'bold 44px ui-monospace, Menlo, monospace';
    x.textAlign = 'center';
    x.fillText(`${v.toFixed(1)}`, c.width / 2 - 8, 52);
    x.font = 'bold 20px ui-monospace, monospace';
    x.fillText('°C', c.width - 18, 30);
    x.font = 'bold 14px ui-monospace, monospace';
    x.fillText(cold ? '❄ FREEZING' : 'TEMP', c.width / 2, 76);
    tex.needsUpdate = true;
  }

  updateSpirit(now, ctx) {
    if (now < this.screensT) return;
    this.screensT = now + 0.09;
    const { x, c, tex } = this.spiritScreen;
    const answering = now < this.spirit.until;
    if (!answering) {
      this.spirit.freq += 0.2 + Math.random() * 0.4;
      if (this.spirit.freq > 107.9) this.spirit.freq = 87.5;
    }
    x.fillStyle = answering ? '#2a0612' : '#140a10';
    x.fillRect(0, 0, c.width, c.height);
    x.textAlign = 'center';
    if (answering) {
      x.fillStyle = '#ff9bd2';
      x.font = `bold ${this.spirit.text.length > 8 ? 22 : 30}px ui-monospace, monospace`;
      x.fillText(this.spirit.text, c.width / 2, 50);
    } else {
      x.fillStyle = '#ff6a8a';
      x.font = 'bold 30px ui-monospace, monospace';
      x.fillText(this.spirit.freq.toFixed(1), c.width / 2 - 10, 40);
      x.font = 'bold 14px ui-monospace, monospace';
      x.fillText('FM', c.width - 22, 24);
      x.fillStyle = '#c86a8a';
      x.font = '13px ui-monospace, monospace';
      x.fillText(this.spirit.hint || 'SWEEPING…', c.width / 2, 66);
    }
    for (let i = 0; i < 18; i++) {
      const hgt = Math.random() * (answering ? 14 : 6);
      x.fillStyle = 'rgba(255,120,160,0.5)';
      x.fillRect(6 + i * 8.4, 78 - hgt, 5, hgt);
    }
    tex.needsUpdate = true;
  }

  showAnswer(text, now) {
    this.spirit.text = text;
    this.spirit.until = now + 3.2;
    this.screensT = 0;
  }

  updateCamera(dt, now) {
    if (now < this.screensT) return;
    this.screensT = now + 0.25;
    const { x, c, tex } = this.camScreen;
    x.fillStyle = '#05070c';
    x.fillRect(0, 0, c.width, c.height);
    x.strokeStyle = '#7fe3ff'; x.lineWidth = 2;
    x.strokeRect(10, 10, c.width - 20, c.height - 20);
    x.fillStyle = '#e9f0ff';
    x.font = 'bold 26px ui-monospace, monospace';
    x.textAlign = 'center';
    x.fillText(`${this.camera.shots}/${this.camera.max}`, c.width / 2, 58);
    x.font = '13px ui-monospace, monospace';
    x.fillStyle = this.camera.shots ? '#b388ff' : '#ff6a8a';
    x.fillText(this.camera.shots ? 'READY' : 'NO FILM', c.width / 2, 80);
    if (Math.sin(now * 4) > 0) { x.fillStyle = '#ff2b4a'; x.beginPath(); x.arc(22, 22, 5, 0, 7); x.fill(); }
    tex.needsUpdate = true;
  }

  flashPop(now) {
    this.flashLamp.color.setHex(0xffffff);
    setTimeout(() => this.flashLamp.color.setHex(0x777777), 160);
    this.screensT = 0;
  }

  resize(aspect) {
    this.cam.aspect = aspect;
    // keep the device the same size on screen in portrait
    this.cam.fov = aspect < 1 ? 55 / Math.max(0.55, aspect) : 55;
    this.cam.fov = Math.min(this.cam.fov, 88);
    this.cam.updateProjectionMatrix();
    // keep the device tucked into the corner whatever the screen shape
    if (aspect < 0.8) { this.hand.position.set(0.09, -0.19, -0.5); this.hand.scale.setScalar(0.82); }
    else if (aspect > 1.4) { this.hand.position.set(0.2, -0.155, -0.36); this.hand.scale.setScalar(1); }
    else { this.hand.position.set(0.15, -0.16, -0.4); this.hand.scale.setScalar(0.95); }
  }

  render() {
    if (!this.visible) return;
    const r = this.renderer;
    const ac = r.autoClear;
    r.autoClear = false;
    r.clearDepth();
    r.render(this.scene, this.cam);
    r.autoClear = ac;
  }
}
