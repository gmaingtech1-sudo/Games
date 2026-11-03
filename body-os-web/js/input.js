// BODY.OS — input aggregation. Touch controls (floating joystick, camera drag area,
// buttons) write here; the player and camera read from here. Keyboard/mouse also work
// on desktop for testing, but the game never needs a physical keyboard.
import { G } from './core.js';

const keys = new Set();
let look = { x: 0, y: 0 }, jumpAt = -1, interact = false;

export const input = {
  move: { x: 0, y: 0 },
  joy: { x: 0, y: 0 },
  addLook(dx, dy) { if (!G.blocked) { look.x += dx; look.y += dy; } },
  consumeLook() { const l = look; look = { x: 0, y: 0 }; return G.blocked ? { x: 0, y: 0 } : l; },
  queueJump() { if (!G.blocked) jumpAt = performance.now(); },
  consumeJump(buffer) { if (jumpAt < 0) return false; if (performance.now() - jumpAt > buffer * 1000) { jumpAt = -1; return false; } return true; },
  clearJump() { jumpAt = -1; },
  queueInteract() { if (!G.blocked) interact = true; },
  consumeInteract() { const v = interact; interact = false; return v && !G.blocked; },
  reset() { this.joy.x = this.joy.y = 0; this.move.x = this.move.y = 0; look = { x: 0, y: 0 }; jumpAt = -1; interact = false; keys.clear(); joystick.release(); },
  poll() {
    let x = this.joy.x, y = this.joy.y;
    if (keys.has('KeyW') || keys.has('ArrowUp')) y += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) y -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    this.move.x = G.blocked ? 0 : x; this.move.y = G.blocked ? 0 : y;
  },
  onKey: null,
};

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys.add(e.code);
  if (input.onKey) input.onKey(e.code);
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => input.reset());

// ---------------------------------------------------------------- Floating joystick
export const joystick = {
  zone: null, base: null, knob: null, id: null, ox: 0, oy: 0, radius: 70,
  attach(zone, base, knob) {
    this.zone = zone; this.base = base; this.knob = knob;
    zone.addEventListener('pointerdown', (e) => {
      if (this.id !== null || G.blocked) return;
      this.id = e.pointerId;
      try { zone.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      const r = zone.getBoundingClientRect();
      this.ox = e.clientX; this.oy = e.clientY;
      base.style.left = (e.clientX - r.left) + 'px'; base.style.top = (e.clientY - r.top) + 'px';
      base.classList.add('active');
      this.drag(e);
    });
    zone.addEventListener('pointermove', (e) => { if (e.pointerId === this.id) this.drag(e); });
    const end = (e) => { if (e.pointerId === this.id) this.release(); };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  },
  drag(e) {
    let dx = e.clientX - this.ox, dy = e.clientY - this.oy;
    const l = Math.hypot(dx, dy), max = this.radius;
    if (l > max) { dx = dx / l * max; dy = dy / l * max; }
    this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    let vx = dx / max, vy = -dy / max;
    const m = Math.hypot(vx, vy), dead = 0.12, sens = G.settings ? G.settings.joySens : 1;
    if (m < dead) { vx = vy = 0; } else {
      const k = Math.min(1, Math.pow((m - dead) / (1 - dead), 1 / sens));
      vx = vx / m * k; vy = vy / m * k;
    }
    input.joy.x = vx; input.joy.y = vy;
  },
  release() {
    this.id = null;
    input.joy.x = input.joy.y = 0;
    if (this.knob) this.knob.style.transform = 'translate(-50%, -50%)';
    if (this.base) { this.base.classList.remove('active'); this.base.style.left = ''; this.base.style.top = ''; }
  },
};

/** Drag anywhere on the element to orbit the camera (each finger tracked separately). */
export function attachLook(el) {
  let id = null, lx = 0, ly = 0;
  el.addEventListener('pointerdown', (e) => {
    if (id !== null) return;
    id = e.pointerId; lx = e.clientX; ly = e.clientY;
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  });
  el.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return;
    // Normalise by screen height so sensitivity feels the same on every phone.
    const s = 720 / Math.max(1, window.innerHeight);
    input.addLook((e.clientX - lx) * s, (e.clientY - ly) * s);
    lx = e.clientX; ly = e.clientY;
  });
  const end = (e) => { if (e.pointerId === id) id = null; };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

/** Buttons fire on press (not release) for responsive mobile controls. */
export function pressButton(el, fn) {
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.classList.add('down'); fn(); });
  const up = () => el.classList.remove('down');
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('pointerleave', up);
}
