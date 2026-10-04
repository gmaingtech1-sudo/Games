/* Frontline — controls.
   Touch: two floating thumbsticks. Put a thumb down anywhere on the left half
   to walk, anywhere on the right half to aim; pushing the right stick fires.
   Keyboard and mouse: WASD to move, mouse to aim, click to fire. */
(function (FL) {
  'use strict';

  const STICK_R = 56;

  const input = {
    move: { x: 0, y: 0 },
    aimAngle: -Math.PI / 2,
    aimActive: false,     // a stick or the mouse is pointing somewhere
    firing: false,
    touch: false,         // last input came from a touchscreen
    mouse: { x: 0, y: 0, down: false, inside: false },
    sticks: { left: null, right: null },
    actions: new Set(),
    grenadeTarget: null,  // screen point for a right-click throw
    enabled: false,
  };

  const keys = new Set();
  let layer = null;
  let canvas = null;

  function bind(touchLayer, stage) {
    layer = touchLayer;
    canvas = stage;

    layer.addEventListener('touchstart', onTouchStart, { passive: false });
    layer.addEventListener('touchmove', onTouchMove, { passive: false });
    layer.addEventListener('touchend', onTouchEnd, { passive: false });
    layer.addEventListener('touchcancel', onTouchEnd, { passive: false });

    layer.addEventListener('mousemove', (e) => {
      input.touch = false;
      input.mouse.x = e.clientX;
      input.mouse.y = e.clientY;
      input.mouse.inside = true;
    });
    layer.addEventListener('mouseleave', () => { input.mouse.inside = false; });
    layer.addEventListener('mousedown', (e) => {
      if (input.touch) return;
      input.mouse.x = e.clientX;
      input.mouse.y = e.clientY;
      if (e.button === 0) input.mouse.down = true;
      if (e.button === 2) {
        input.grenadeTarget = { x: e.clientX, y: e.clientY };
        input.actions.add('grenade');
      }
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) input.mouse.down = false; });
    layer.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('keydown', (e) => {
      if (!input.enabled) return;
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
      if (keys.has(k)) return;
      keys.add(k);
      input.touch = false;
      if (k === 'r') input.actions.add('reload');
      if (k === 'g') input.actions.add('grenade');
      if (k === 'q' || k === 'tab') { input.actions.add('swap'); e.preventDefault(); }
      if (k === '1') input.actions.add('slot0');
      if (k === '2') input.actions.add('slot1');
      if (k === 'e') input.actions.add('take');
      if (k === 'f') input.actions.add('artillery');
      if (k === 'k') input.actions.add('afk');
      if (k === 'escape' || k === 'p') input.actions.add('pause');
    });
    window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => { keys.clear(); input.mouse.down = false; });
  }

  function onTouchStart(e) {
    e.preventDefault();
    input.touch = true;
    const w = layer.clientWidth;
    for (const t of e.changedTouches) {
      const side = t.clientX < w * 0.45 ? 'left' : 'right';
      if (input.sticks[side]) continue;
      input.sticks[side] = { id: t.identifier, ox: t.clientX, oy: t.clientY, x: t.clientX, y: t.clientY };
    }
  }

  function onTouchMove(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      for (const side of ['left', 'right']) {
        const s = input.sticks[side];
        if (!s || s.id !== t.identifier) continue;
        s.x = t.clientX;
        s.y = t.clientY;
        // Drag the base along so the stick never "runs out".
        const dx = s.x - s.ox;
        const dy = s.y - s.oy;
        const d = Math.hypot(dx, dy);
        if (d > STICK_R * 1.4) {
          s.ox = s.x - (dx / d) * STICK_R * 1.4;
          s.oy = s.y - (dy / d) * STICK_R * 1.4;
        }
      }
    }
  }

  function onTouchEnd(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      for (const side of ['left', 'right']) {
        const s = input.sticks[side];
        if (s && s.id === t.identifier) input.sticks[side] = null;
      }
    }
  }

  // Called once per frame. playerScreen: where the player is drawn, in CSS px.
  function update(playerScreen) {
    let mx = 0;
    let my = 0;
    if (keys.has('a') || keys.has('arrowleft')) mx -= 1;
    if (keys.has('d') || keys.has('arrowright')) mx += 1;
    if (keys.has('w') || keys.has('arrowup')) my -= 1;
    if (keys.has('s') || keys.has('arrowdown')) my += 1;
    const l = input.sticks.left;
    if (l) {
      mx = (l.x - l.ox) / STICK_R;
      my = (l.y - l.oy) / STICK_R;
    }
    const m = Math.hypot(mx, my);
    if (m > 1) { mx /= m; my /= m; }
    if (l && m < 0.12) { mx = 0; my = 0; }
    input.move.x = mx;
    input.move.y = my;

    const r = input.sticks.right;
    if (r) {
      const dx = r.x - r.ox;
      const dy = r.y - r.oy;
      const d = Math.hypot(dx, dy);
      if (d > 8) {
        input.aimAngle = Math.atan2(dy, dx);
        input.aimActive = true;
      }
      input.firing = d > STICK_R * 0.35;
    } else if (input.touch) {
      input.firing = false;
      // Not aiming: face where you walk.
      if (m > 0.2) input.aimAngle = Math.atan2(my, mx);
      input.aimActive = false;
    } else {
      if (input.mouse.inside || input.mouse.down) {
        input.aimAngle = Math.atan2(input.mouse.y - playerScreen.y, input.mouse.x - playerScreen.x);
        input.aimActive = true;
      }
      input.firing = input.mouse.down || keys.has(' ');
    }
  }

  function reset() {
    input.sticks.left = null;
    input.sticks.right = null;
    input.mouse.down = false;
    input.firing = false;
    input.actions.clear();
    keys.clear();
  }

  input.bind = bind;
  input.update = update;
  input.reset = reset;
  input.STICK_R = STICK_R;
  FL.input = input;
})(window.FL);
