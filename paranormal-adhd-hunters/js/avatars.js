/* ParanormalADHDhunters — your teammates, as you see them in team mode:
   uniformed investigators with headlamps and name tags. */
import * as THREE from 'three';
import { UNIFORMS } from './data.js';
import { damp, wrapAngle } from './util.js';
import { glowTexture } from './textures.js';

function nameTag(text, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(11,16,48,0.75)';
  x.beginPath();
  if (x.roundRect) x.roundRect(8, 10, 240, 44, 22); else x.rect(8, 10, 240, 44); // older Safari
  x.fill();
  x.strokeStyle = color; x.lineWidth = 3; x.stroke();
  x.fillStyle = '#e9f0ff';
  x.font = '600 26px Nunito, sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text.slice(0, 16), 128, 33);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false }));
  s.scale.set(0.9, 0.225, 1);
  s.renderOrder = 10;
  return s;
}

export class Avatars {
  constructor(scene, slots = 3) {
    this.scene = scene;
    this.list = {};
    // fixed pool of headlamps so the light count never changes mid-game
    this.lamps = [];
    for (let i = 0; i < slots; i++) {
      const l = new THREE.SpotLight(0xfff0d8, 0, 12, 0.45, 0.6, 1.5);
      scene.add(l, l.target);
      this.lamps.push({ light: l, used: false });
    }
  }

  ensure(pid, info) {
    if (this.list[pid]) return this.list[pid];
    const u = UNIFORMS.find((x) => x.id === info.uniform) || UNIFORMS[0];
    const g = new THREE.Group();
    const jacket = new THREE.MeshLambertMaterial({ color: u.jacket });
    const trim = new THREE.MeshLambertMaterial({ color: u.trim, emissive: new THREE.Color(u.trim).multiplyScalar(0.25) });
    const skin = new THREE.MeshLambertMaterial({ color: 0xc89a7c });
    const dark = new THREE.MeshLambertMaterial({ color: 0x15161e });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.55, 4, 10), jacket);
    body.position.y = 1.12;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.225, 0.225, 0.06, 12), trim);
    band.position.y = 1.0;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10), skin);
    head.position.y = 1.62;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.155, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), jacket);
    cap.position.y = 1.64;
    const lampMat = new THREE.MeshBasicMaterial({ color: 0x333333 });
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.04, 8), lampMat);
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(0, 1.72, -0.15);
    const legs = [];
    for (const s of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(s * 0.1, 0.78, 0);
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.55, 4, 8), dark);
      m.position.y = -0.38;
      leg.add(m);
      g.add(leg);
      legs.push(leg);
    }
    const arms = [];
    for (const s of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(s * 0.27, 1.38, 0);
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.45, 4, 8), jacket);
      m.position.y = -0.27;
      arm.add(m);
      g.add(arm);
      arms.push(arm);
    }
    g.add(body, band, head, cap, lamp);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    const tag = nameTag(info.name || 'Investigator', u.trim);
    tag.position.y = 2.05;
    g.add(tag);
    // a faint beam so you can see where they're looking
    const beamMat = new THREE.MeshBasicMaterial({ map: glowTexture('255,240,210'), color: 0xfff0d8, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(new THREE.ConeGeometry(0.9, 5, 16, 1, true), beamMat);
    beam.rotation.x = -Math.PI / 2;
    beam.position.set(0, 1.72, -2.6);
    g.add(beam);
    this.scene.add(g);
    const slot = this.lamps.find((l) => !l.used) || null;
    if (slot) slot.used = true;
    const a = { g, legs, arms, lampMat, beam, beamMat, slot, x: 0, y: 0, z: 0, yaw: 0, phase: 0, info };
    this.list[pid] = a;
    return a;
  }

  remove(pid) {
    const a = this.list[pid];
    if (!a) return;
    this.scene.remove(a.g);
    if (a.slot) { a.slot.used = false; a.slot.light.intensity = 0; }
    delete this.list[pid];
  }

  clear() { for (const pid in this.list) this.remove(pid); }

  update(dt, now, remote, cam) {
    for (const pid in remote) {
      const r = remote[pid];
      if (r.gone) { this.remove(pid); continue; }
      if (r.x == null) continue;
      const a = this.ensure(pid, r.info || {});
      const first = a.x === 0 && a.z === 0;
      const px = a.x, pz = a.z;
      a.x = first ? r.x : damp(a.x, r.x, 10, dt);
      a.y = first ? r.y : damp(a.y, r.y, 10, dt);
      a.z = first ? r.z : damp(a.z, r.z, 10, dt);
      a.yaw = a.yaw + wrapAngle(r.yaw - a.yaw) * (1 - Math.exp(-10 * dt));
      const speed = Math.hypot(a.x - px, a.z - pz) / Math.max(dt, 1e-3);
      a.phase += speed * dt * 4.5;
      const swing = Math.sin(a.phase) * Math.min(0.6, speed * 0.35);
      a.legs[0].rotation.x = swing; a.legs[1].rotation.x = -swing;
      a.arms[0].rotation.x = -swing * 0.7; a.arms[1].rotation.x = swing * 0.7 - (r.tool === 'camera' ? 1.2 : 0.6);
      a.g.position.set(a.x, a.y, a.z);
      a.g.rotation.y = a.yaw;
      a.g.visible = !r.hidden;
      const on = !!r.torch && !r.hidden;
      a.lampMat.color.setHex(on ? 0xfff6d8 : 0x333333);
      a.beamMat.opacity = on ? 0.05 : 0;
      if (a.slot) {
        const l = a.slot.light;
        l.intensity = on ? 22 : 0;
        const fx = -Math.sin(a.yaw), fz = -Math.cos(a.yaw);
        l.position.set(a.x + fx * 0.2, a.y + 1.7, a.z + fz * 0.2);
        l.target.position.set(a.x + fx * 4, a.y + 1.7 - Math.sin(r.pitch || 0) * 4 - 0.4, a.z + fz * 4);
      }
    }
    for (const pid in this.list) if (!remote[pid]) this.remove(pid);
  }
}
