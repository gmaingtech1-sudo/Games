/* Hyperdot — the N-dimensional grid. Turns a level's text map into a flat
   array of cells and answers "what is next to this cell along that axis?".

   A map is nested by dimension:
     1D  'a string'                                   one row of cells
     2D  ['row', 'row', ...]                          rows, top to bottom (+Y is down the page)
     3D  [[rows of floor 0], [rows of floor 1], ...]  floors, bottom to top (+Z is up)
     4D  [[3D slice w=0], [3D slice w=1], ...]
     5D  [[4D block v=0], [4D block v=1], ...]

   Cells, in the map:
     .  empty          #  wall           @  start        X  exit
     *  shard          a b c  keys       A B C  doors (open with the key of the same letter)
     o  crate          _  plate          =  gate (open while every plate is held down)
*/
(function (HD) {
  'use strict';

  const SHARD = 0;
  const KEY = 1;

  // Key and door colours, by letter.
  const KEY_COLORS = ['#FF5FB0', '#2FE3CF', '#E8ECFF'];
  const KEY_NAMES = ['pink', 'teal', 'silver'];

  function shapeOf(m) {
    if (typeof m === 'string') return [m.length];
    if (!Array.isArray(m) || !m.length) throw new Error('A map must be a string or a non-empty array');
    const inner = shapeOf(m[0]);
    return inner.concat([m.length]);
  }

  function flatten(m, shape, out) {
    if (typeof m === 'string') {
      if (m.length !== shape[0]) throw new Error(`Row "${m}" should be ${shape[0]} cells long`);
      out.push(m);
      return;
    }
    if (m.length !== shape[shape.length - 1]) throw new Error('Slices of different sizes');
    const inner = shape.slice(0, -1);
    for (const sub of m) flatten(sub, inner, out);
  }

  // Build the playable level from its definition.
  function compile(def) {
    const dims = shapeOf(def.map);
    const parts = [];
    flatten(def.map, dims, parts);
    const text = parts.join('');
    const n = dims.length;
    const size = text.length;
    const strides = [];
    let s = 1;
    for (let k = 0; k < n; k++) {
      strides.push(s);
      s *= dims[k];
    }

    const L = {
      def,
      dims,
      n,
      size,
      strides,
      wall: new Uint8Array(size),
      itemAt: new Int16Array(size).fill(-1),
      doorAt: new Int16Array(size).fill(-1),
      plateAt: new Uint8Array(size),
      gateAt: new Uint8Array(size),
      items: [],
      doors: [],
      plates: [],
      gates: [],
      crates0: [],
      start: -1,
      exit: -1,
      shardMask: 0,
      shardCount: 0,
    };

    for (let i = 0; i < size; i++) {
      const ch = text[i];
      switch (ch) {
        case '.': break;
        case '#': L.wall[i] = 1; break;
        case '@': L.start = i; break;
        case 'X': L.exit = i; break;
        case '*':
          L.itemAt[i] = L.items.length;
          L.shardMask |= 1 << L.items.length;
          L.shardCount++;
          L.items.push({ cell: i, kind: SHARD, color: 0 });
          break;
        case 'a': case 'b': case 'c':
          L.itemAt[i] = L.items.length;
          L.items.push({ cell: i, kind: KEY, color: ch.charCodeAt(0) - 97 });
          break;
        case 'A': case 'B': case 'C':
          L.doorAt[i] = L.doors.length;
          L.doors.push({ cell: i, color: ch.charCodeAt(0) - 65 });
          break;
        case 'o': L.crates0.push(i); break;
        case '_': L.plateAt[i] = 1; L.plates.push(i); break;
        case '=': L.gateAt[i] = 1; L.gates.push(i); break;
        default: throw new Error(`Unknown cell "${ch}"`);
      }
    }
    if (L.start < 0) throw new Error('No start (@)');
    if (L.exit < 0) throw new Error('No exit (X)');
    if (L.items.length > 30 || L.doors.length > 30) throw new Error('Too many items or doors');
    return L;
  }

  function coords(L, i) {
    const c = new Array(L.n);
    for (let k = 0; k < L.n; k++) {
      c[k] = i % L.dims[k];
      i = Math.floor(i / L.dims[k]);
    }
    return c;
  }

  function index(L, c) {
    let i = 0;
    for (let k = 0; k < L.n; k++) i += c[k] * L.strides[k];
    return i;
  }

  // The cell one step along `axis` (dir = +1 or -1), or -1 off the edge.
  function step(L, i, axis, dir) {
    if (axis >= L.n) return -1;
    const c = Math.floor(i / L.strides[axis]) % L.dims[axis];
    const nc = c + dir;
    if (nc < 0 || nc >= L.dims[axis]) return -1;
    return i + dir * L.strides[axis];
  }

  // Which slice of the hidden axes (Z for the panels in 3D, W and V beyond)
  // a cell sits in.
  function coord(L, i, axis) {
    if (axis >= L.n) return 0;
    return Math.floor(i / L.strides[axis]) % L.dims[axis];
  }

  HD.grid = { compile, coords, index, step, coord, SHARD, KEY, KEY_COLORS, KEY_NAMES };
})(window.HD = window.HD || {});
