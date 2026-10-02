/* ParanormalADHDhunters — controls. On phones the left side of the screen is
   a floating joystick and the right side is swipe-to-look. On computers it's
   WASD + mouse. */

export class Input {
  constructor(layer, stick, settings) {
    this.layer = layer;
    this.stickEl = stick;
    this.knob = stick.querySelector('.knob');
    this.settings = settings;
    this.move = { x: 0, y: 0 };
    this.lookDX = 0;
    this.lookDY = 0;
    this.keys = new Set();
    this.enabled = false;
    this.stickId = null;
    this.lookId = null;
    this.actions = {};
    this.locked = false;
    this.R = 56;

    layer.addEventListener('pointerdown', (e) => this.down(e));
    window.addEventListener('pointermove', (e) => this.moveEv(e), { passive: false });
    window.addEventListener('pointerup', (e) => this.up(e));
    window.addEventListener('pointercancel', (e) => this.up(e));
    window.addEventListener('keydown', (e) => this.key(e, true));
    window.addEventListener('keyup', (e) => this.key(e, false));
    window.addEventListener('blur', () => { this.keys.clear(); this.release(); });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === layer;
      if (!this.locked && this.enabled && this.actions.unlock) this.actions.unlock();
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked || !this.enabled) return;
      this.lookDX += e.movementX * 0.9;
      this.lookDY += e.movementY * 0.9;
    });
  }

  on(name, fn) { this.actions[name] = fn; }

  setEnabled(v) {
    this.enabled = v;
    if (!v) { this.release(); if (this.locked) document.exitPointerLock?.(); }
  }

  release() {
    this.stickId = null;
    this.lookId = null;
    this.move.x = this.move.y = 0;
    this.stickEl.classList.remove('on');
  }

  down(e) {
    if (!this.enabled) return;
    const w = window.innerWidth;
    const left = this.settings.lefty ? e.clientX > w * 0.58 : e.clientX < w * 0.42;
    if (e.pointerType === 'mouse') {
      // desktop: click to capture the mouse for looking around
      if (!this.locked && this.layer.requestPointerLock) {
        try { const p = this.layer.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (err) { /* ignore */ }
      }
      this.lookId = e.pointerId;
      this.lastX = e.clientX; this.lastY = e.clientY;
      return;
    }
    e.preventDefault();
    if (left && this.stickId === null) {
      this.stickId = e.pointerId;
      this.sx = e.clientX; this.sy = e.clientY;
      this.stickEl.style.left = `${e.clientX}px`;
      this.stickEl.style.top = `${e.clientY}px`;
      this.stickEl.classList.add('on');
      this.knob.style.transform = 'translate(-50%,-50%)';
    } else if (this.lookId === null) {
      this.lookId = e.pointerId;
      this.lastX = e.clientX; this.lastY = e.clientY;
    }
  }

  moveEv(e) {
    if (!this.enabled) return;
    if (e.pointerId === this.stickId) {
      e.preventDefault();
      let dx = e.clientX - this.sx, dy = e.clientY - this.sy;
      const d = Math.hypot(dx, dy);
      if (d > this.R) {
        // drag the base along so the stick never "runs out"
        const k = (d - this.R) / d;
        this.sx += dx * k; this.sy += dy * k;
        dx = e.clientX - this.sx; dy = e.clientY - this.sy;
        this.stickEl.style.left = `${this.sx}px`;
        this.stickEl.style.top = `${this.sy}px`;
      }
      this.move.x = dx / this.R;
      this.move.y = -dy / this.R;
      this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    } else if (e.pointerId === this.lookId && !this.locked) {
      if (e.pointerType === 'mouse' && !(e.buttons & 1)) return;
      this.lookDX += e.clientX - this.lastX;
      this.lookDY += e.clientY - this.lastY;
      this.lastX = e.clientX; this.lastY = e.clientY;
    }
  }

  up(e) {
    if (e.pointerId === this.stickId) {
      this.stickId = null;
      this.move.x = this.move.y = 0;
      this.stickEl.classList.remove('on');
    }
    if (e.pointerId === this.lookId) this.lookId = null;
  }

  key(e, isDown) {
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (isDown) {
      if (!this.keys.has(k) && this.enabled) {
        const map = { e: 'interact', f: 'flash', q: 'use', ' ': 'use', '1': 'slot1', '2': 'slot2', '3': 'slot3', '4': 'slot4', j: 'journal', m: 'map', t: 'chat', Escape: 'pause', Tab: 'journal' };
        if (map[k] && this.actions[map[k]]) { e.preventDefault(); this.actions[map[k]](); }
      } else if (!this.enabled && k === 'Escape' && this.actions.escape) this.actions.escape();
      this.keys.add(k);
    } else this.keys.delete(k);
  }

  /** Movement from keys and stick combined. */
  axes() {
    let x = this.move.x, y = this.move.y;
    if (this.keys.has('w') || this.keys.has('ArrowUp')) y += 1;
    if (this.keys.has('s') || this.keys.has('ArrowDown')) y -= 1;
    if (this.keys.has('a') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('d') || this.keys.has('ArrowRight')) x += 1;
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    return { x, y, run: this.keys.has('Shift') };
  }

  takeLook() {
    const s = this.settings;
    const sens = (s.sens || 1) * (this.locked ? 0.0024 : 0.0052);
    const dx = this.lookDX * sens, dy = this.lookDY * sens * (s.invertY ? -1 : 1);
    this.lookDX = this.lookDY = 0;
    return { dx, dy };
  }
}
