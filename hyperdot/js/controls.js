/* Hyperdot — the move pad. It grows with the dimension:
     1D  ◀ ▶
     2D  a four-way pad
     3D  the four-way pad (turned to match the camera) plus up / down
     4D  … plus ana / kata (+W / −W)
     5D  … plus +V / −V
   Each button wears its axis colour and dims when that move is blocked.
   Holding a button repeats the move. */
(function (HD) {
  'use strict';

  const ARROW = {
    right: 'M8 5l8 7-8 7',
    left: 'M16 5l-8 7 8 7',
    up: 'M5 16l7-8 7 8',
    down: 'M5 8l7 8 7-8',
  };
  const arrowSvg = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ARROW[d]}"/></svg>`;

  // A jump into the next slice: two offset squares and an arrow between.
  const sliceSvg = (plus) => `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="${plus ? 9 : 3}" width="10" height="10" rx="2"/><rect x="11" y="${plus ? 3 : 11}" width="10" height="10" rx="2" opacity="0.55"/></svg>`;

  function button(cls, html, label) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pb ' + cls;
    b.innerHTML = html;
    b.setAttribute('aria-label', label);
    return b;
  }

  /* Build the pad for an n-dimensional level inside `root`. `onMove(axis, dir)`
     is called for each step. Returns { update, remap, map, destroy }. */
  function build(root, n, onMove) {
    root.innerHTML = '';
    root.className = 'pad pad-' + n;
    const btns = [];
    let held = null;
    let timer = 0;

    // Directions the four-way pad stands for right now (camera-relative in 3D).
    const map = {
      right: { axis: 0, dir: 1 },
      left: { axis: 0, dir: -1 },
      up: { axis: 1, dir: -1 },
      down: { axis: 1, dir: 1 },
    };

    function resolve(b) {
      if (b.dataset.role) return map[b.dataset.role];
      return { axis: Number(b.dataset.axis), dir: Number(b.dataset.dir) };
    }

    function fire(b) {
      const m = resolve(b);
      if (m) onMove(m.axis, m.dir);
    }

    function stop() {
      clearTimeout(timer);
      if (held) held.classList.remove('down');
      held = null;
    }

    function attach(b) {
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        stop();
        held = b;
        b.classList.add('down');
        fire(b);
        const repeat = () => {
          if (held !== b) return;
          fire(b);
          timer = setTimeout(repeat, 150);
        };
        timer = setTimeout(repeat, 340);
      });
      for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, stop);
      b.addEventListener('click', (e) => {
        // Keyboard activation (Enter / Space on a focused button).
        if (e.detail === 0) fire(b);
      });
      btns.push(b);
    }

    if (n === 1) {
      const row = document.createElement('div');
      row.className = 'pad-line';
      for (const [role, dir] of [['left', -1], ['right', 1]]) {
        const b = button('wide', arrowSvg(role) + `<span class="pb-l">X${dir > 0 ? '+' : '−'}</span>`, `Move ${role}`);
        b.dataset.axis = 0;
        b.dataset.dir = dir;
        b.style.setProperty('--ax', HD.AXES[0].color);
        attach(b);
        row.appendChild(b);
      }
      root.appendChild(row);
    } else {
      const dpad = document.createElement('div');
      dpad.className = 'dpad';
      for (const role of ['up', 'left', 'right', 'down']) {
        const b = button('d-' + role, arrowSvg(role) + '<span class="pb-l"></span>', `Move ${role}`);
        b.dataset.role = role;
        attach(b);
        dpad.appendChild(b);
      }
      const hub = document.createElement('span');
      hub.className = 'dpad-hub';
      hub.setAttribute('aria-hidden', 'true');
      dpad.appendChild(hub);
      root.appendChild(dpad);

      for (let a = 2; a < n; a++) {
        const col = document.createElement('div');
        col.className = 'pad-col';
        col.style.setProperty('--ax', HD.AXES[a].color);
        const name = HD.AXES[a].name;
        const plus = a === 2
          ? button('col', arrowSvg('up') + '<span class="pb-l">up</span>', 'Move up (+Z)')
          : button('col', sliceSvg(true) + `<span class="pb-l">+${name}${a === 3 ? '<i>ana</i>' : ''}</span>`, a === 3 ? 'Move ana (+W)' : 'Move +V');
        const minus = a === 2
          ? button('col', arrowSvg('down') + '<span class="pb-l">down</span>', 'Move down (−Z)')
          : button('col', sliceSvg(false) + `<span class="pb-l">−${name}${a === 3 ? '<i>kata</i>' : ''}</span>`, a === 3 ? 'Move kata (−W)' : 'Move −V');
        plus.dataset.axis = a;
        plus.dataset.dir = 1;
        minus.dataset.axis = a;
        minus.dataset.dir = -1;
        for (const b of [plus, minus]) {
          b.style.setProperty('--ax', HD.AXES[a].color);
          attach(b);
          col.appendChild(b);
        }
        root.appendChild(col);
      }
    }

    function paintDpad() {
      for (const b of btns) {
        if (!b.dataset.role) continue;
        const m = map[b.dataset.role];
        const ax = HD.AXES[m.axis];
        b.style.setProperty('--ax', ax.color);
        b.querySelector('.pb-l').textContent = ax.name + (m.dir > 0 ? '+' : '−');
      }
    }

    // Turn the four-way pad to match the camera, so "up" is always away from
    // you on screen.
    function remap(cam, flat) {
      let next;
      if (flat) {
        next = { right: [0, 1], left: [0, -1], up: [1, -1], down: [1, 1] };
      } else {
        const scr = HD.view.axisScreen(cam);
        const cands = [];
        for (const a of [0, 1]) for (const d of [1, -1]) cands.push({ a, d, x: scr[a][0] * d, y: scr[a][1] * d });
        const right = cands.reduce((p, c) => (c.x > p.x ? c : p));
        const other = cands.filter((c) => c.a !== right.a);
        const up = other[0].y < other[1].y ? other[0] : other[1];
        next = { right: [right.a, right.d], left: [right.a, -right.d], up: [up.a, up.d], down: [up.a, -up.d] };
      }
      let changed = false;
      for (const k of Object.keys(next)) {
        const [axis, dir] = next[k];
        if (map[k].axis !== axis || map[k].dir !== dir) changed = true;
        map[k] = { axis, dir };
      }
      if (changed || !btns.painted) {
        btns.painted = true;
        paintDpad();
      }
    }

    // `can(axis, dir)` says whether a move is possible; `hint` is the move the
    // hint button suggested (or null).
    function update(can, hint) {
      for (const b of btns) {
        const m = resolve(b);
        b.classList.toggle('blocked', !can(m.axis, m.dir));
        b.classList.toggle('hinted', !!hint && hint.axis === m.axis && hint.dir === m.dir);
      }
    }

    // The button (if any) that stands for a move, for keyboard flashes.
    function find(axis, dir) {
      return btns.find((b) => {
        const m = resolve(b);
        return m.axis === axis && m.dir === dir;
      });
    }

    return { update, remap, map, find, destroy: stop };
  }

  HD.controls = { build };
})(window.HD = window.HD || {});
