// Touch, mouse, keyboard and device-orientation input.
import * as THREE from 'three';

export class Input {
  constructor(el, handlers) {
    this.el = el;
    this.h = handlers;
    this.pointers = new Map();
    this.keys = new Set();
    this.lastTap = 0;
    this.pinch = null;
    this.gyro = { enabled: false, has: false, q: new THREE.Quaternion(), alpha: 0, beta: 0, gamma: 0, screen: 0 };

    el.addEventListener('pointerdown', (e) => this.down(e));
    el.addEventListener('pointermove', (e) => this.move(e));
    el.addEventListener('pointerup', (e) => this.up(e));
    el.addEventListener('pointercancel', (e) => this.up(e, true));
    el.addEventListener('wheel', (e) => { e.preventDefault(); this.h.onPinch?.(Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      this.keys.add(e.code);
      this.h.onKey?.(e.code, e);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  down(e) {
    this.el.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: 0 });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x) };
    }
    this.h.onDown?.();
  }

  move(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    p.moved += Math.abs(dx) + Math.abs(dy);
    if (this.pointers.size === 1) {
      this.h.onLook?.(dx, dy, e.pointerType);
    } else if (this.pointers.size === 2 && this.pinch) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      if (this.pinch.d > 0) this.h.onPinch?.(d / this.pinch.d);
      let da = ang - this.pinch.ang;
      if (da > Math.PI) da -= Math.PI * 2;
      if (da < -Math.PI) da += Math.PI * 2;
      this.h.onRoll?.(da);
      this.pinch.d = d; this.pinch.ang = ang;
    }
  }

  up(e, cancel) {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    if (!p || cancel) return;
    const dt = performance.now() - p.t;
    if (p.moved < 10 && dt < 350 && this.pointers.size === 0) {
      const now = performance.now();
      if (now - this.lastTap < 300) { this.h.onDoubleTap?.(e.clientX, e.clientY); this.lastTap = 0; }
      else { this.h.onTap?.(e.clientX, e.clientY); this.lastTap = now; }
    }
    if (this.pointers.size === 0) this.h.onUp?.();
  }

  get dragging() { return this.pointers.size > 0; }

  // ─────────── device orientation (360° look) ───────────
  async enableGyro() {
    const DOE = window.DeviceOrientationEvent;
    if (!DOE) return false;
    if (typeof DOE.requestPermission === 'function') {
      try { if ((await DOE.requestPermission()) !== 'granted') return false; } catch { return false; }
    }
    if (!this.onOrient) {
      this.onOrient = (e) => {
        if (e.alpha === null && e.beta === null) return;
        this.gyro.alpha = e.alpha || 0; this.gyro.beta = e.beta || 0; this.gyro.gamma = e.gamma || 0;
        this.gyro.has = true;
      };
      this.onScreen = () => { this.gyro.screen = (screen.orientation && screen.orientation.angle) || window.orientation || 0; };
      window.addEventListener('deviceorientation', this.onOrient);
      window.addEventListener('orientationchange', this.onScreen);
      screen.orientation?.addEventListener?.('change', this.onScreen);
      this.onScreen();
    }
    this.gyro.enabled = true;
    return true;
  }
  disableGyro() { this.gyro.enabled = false; }

  // Phone orientation as a camera quaternion (the camera looks out of the back of the phone).
  deviceQuaternion(out) {
    const g = this.gyro;
    const euler = new THREE.Euler(g.beta * Math.PI / 180, g.alpha * Math.PI / 180, -g.gamma * Math.PI / 180, 'YXZ');
    out.setFromEuler(euler);
    out.multiply(new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)));
    out.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -g.screen * Math.PI / 180));
    return out;
  }
}
