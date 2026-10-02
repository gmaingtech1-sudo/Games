/* ParanormalADHDhunters — the investigator: walking, stairs, collisions,
   footsteps, head bob and hiding in wardrobes. */
import { clamp, damp, wrapAngle } from './util.js';
import { layerOfY, ROOMS } from './house.js';

const EYE = 1.62;
const RADIUS = 0.3;

export class Player {
  constructor(camera, house, audio) {
    this.camera = camera;
    this.house = house;
    this.audio = audio;
    this.pos = { x: 0, y: 0, z: 0 };
    this.vel = { x: 0, z: 0 };
    this.yaw = 0;
    this.pitch = 0;
    this.vy = 0;
    this.bob = 0;
    this.stepAcc = 0;
    this.hidden = null;
    this.frozen = false;
    this.speedMul = 1;
    this.moving = 0;
    this.room = null;
  }

  place(x, y, z, yaw = 0) {
    this.pos.x = x; this.pos.y = y; this.pos.z = z;
    this.yaw = yaw; this.pitch = 0;
    this.vel.x = this.vel.z = 0;
    this.vy = 0;
    this.hidden = null;
    this.updateCamera(0);
  }

  get layer() { return layerOfY(this.pos.y + 0.1); }

  forward() { return { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) }; }

  surface() {
    const r = this.house.roomAt(this.pos.x, this.pos.y + 0.1, this.pos.z);
    if (!r || r === 'yard') return Math.abs(this.pos.x - 6.5) < 0.7 && this.pos.z < 23.2 ? 'concrete' : 'grass';
    const f = ROOMS[r].floor || 'planks';
    if (f.startsWith('carpet')) return 'carpet';
    if (f === 'checker' || f === 'bathFloor') return 'tile';
    if (f === 'concrete') return 'concrete';
    return 'wood';
  }

  hide(spot) {
    this.hidden = spot;
    this.preHide = { ...this.pos };
    this.pos.x = spot.x; this.pos.z = spot.z; this.pos.y = spot.y;
    this.yaw = spot.yaw; this.pitch = 0;
    this.vel.x = this.vel.z = 0;
  }

  unhide() {
    const s = this.hidden;
    if (!s) return;
    this.hidden = null;
    this.pos.x = s.out.x; this.pos.z = s.out.z;
    this.yaw = s.yaw;
    this.house.collide(this.pos, RADIUS);
  }

  update(dt, input) {
    const look = input.takeLook();
    if (this.hidden) {
      // a narrow view through the gap in the doors
      this.yaw = this.hidden.yaw + clamp(wrapAngle(this.yaw - look.dx - this.hidden.yaw), -0.35, 0.35);
      this.pitch = clamp(this.pitch - look.dy, -0.3, 0.3);
      this.updateCamera(dt);
      return;
    }
    this.yaw = wrapAngle(this.yaw - look.dx);
    this.pitch = clamp(this.pitch - look.dy, -1.35, 1.35);
    const ax = this.frozen ? { x: 0, y: 0, run: false } : input.axes();
    const f = this.forward();
    const r = { x: -f.z, z: f.x };
    const mag = Math.min(1, Math.hypot(ax.x, ax.y));
    const speed = (ax.run ? 3.1 : 2.05) * this.speedMul;
    const tx = (f.x * ax.y + r.x * ax.x) * speed;
    const tz = (f.z * ax.y + r.z * ax.x) * speed;
    this.vel.x = damp(this.vel.x, tx, 12, dt);
    this.vel.z = damp(this.vel.z, tz, 12, dt);

    const old = { ...this.pos };
    const h = this.house;
    // move each axis on its own so you slide along walls
    for (const axis of ['x', 'z']) {
      const nx = axis === 'x' ? this.pos.x + this.vel.x * dt : this.pos.x;
      const nz = axis === 'z' ? this.pos.z + this.vel.z * dt : this.pos.z;
      const g = h.heightAt(nx, nz, this.pos.y);
      if (g === -Infinity || g > this.pos.y + 0.5) continue;
      this.pos.x = nx; this.pos.z = nz;
    }
    h.collide(this.pos, RADIUS);
    let g = h.heightAt(this.pos.x, this.pos.z, this.pos.y);
    if (g === -Infinity) { this.pos.x = old.x; this.pos.z = old.z; g = h.heightAt(this.pos.x, this.pos.z, this.pos.y); }
    if (g !== -Infinity) {
      if (g >= this.pos.y - 0.6) { this.pos.y = g; this.vy = 0; } // walk up or down stairs
      else { this.vy -= 9.8 * dt; this.pos.y = Math.max(g, this.pos.y + this.vy * dt); if (this.pos.y === g) this.vy = 0; }
    }
    const moved = Math.hypot(this.pos.x - old.x, this.pos.z - old.z);
    this.moving = dt > 0 ? moved / dt : 0;
    if (moved > 0.0005) {
      this.bob += moved * 5.2;
      this.stepAcc += moved;
      const stride = ax.run ? 0.85 : 0.68;
      if (this.stepAcc > stride) {
        this.stepAcc = 0;
        this.audio.play('step', { surface: this.surface(), vol: 0.28 + 0.12 * mag });
      }
    }
    this.room = h.roomAt(this.pos.x, this.pos.y + 0.1, this.pos.z);
    this.updateCamera(dt);
  }

  updateCamera() {
    const c = this.camera;
    const bob = this.hidden ? 0 : Math.sin(this.bob) * 0.03 * Math.min(1, this.moving / 1.5);
    c.position.set(this.pos.x, this.pos.y + (this.hidden ? 1.52 : EYE) + bob, this.pos.z);
    c.rotation.set(this.pitch, this.yaw, Math.sin(this.bob * 0.5) * 0.004 * Math.min(1, this.moving / 1.5));
  }

  eye() { return { x: this.pos.x, y: this.pos.y + EYE, z: this.pos.z }; }
}
