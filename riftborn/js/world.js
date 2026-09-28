/* Riftborn — the world. Everything on the map is generated from the real
   latitude and longitude, so the same street corner always has the same
   Rift, for everyone, with no server.

   The globe is cut into cells about 120 m across. Each cell can hold:
   - a Rift (fixed; like an Ingress portal): owned by a faction or neutral.
     About half the cells have one, and every 2×2 block of cells has at
     least one, so there's always a Rift within a couple of hundred meters;
   - a Supply Cache (fixed; like a PokéStop or supply drop);
   - creatures (they change every 10 minutes, staggered per cell).
   Creature kinds are biased by a coarse "biome" element, the time of day
   and the real weather (RB.weather). */
window.RB = window.RB || {};
(function (RB) {
  'use strict';

  const { rng, hash, pick, weighted, randInt } = RB.util;
  const C = RB.creatures;

  const CELL = 0.0011;          // cell size in degrees of latitude (~122 m)
  const SPAWN_MS = 10 * 60e3;   // creature rotation
  const M_LAT = 110574;         // meters per degree of latitude
  const M_LNG = 111320;         // meters per degree of longitude at the equator
  const DEG = Math.PI / 180;

  /* ------------------ Geography ------------------ */

  const origin = { lat: 0, lng: 0, cos: 1 };

  function setOrigin(lat, lng) {
    origin.lat = lat;
    origin.lng = lng;
    origin.cos = Math.cos(lat * DEG);
  }

  // Local flat coordinates in meters: x east, y north.
  const toXY = (lat, lng) => [(lng - origin.lng) * M_LNG * origin.cos, (lat - origin.lat) * M_LAT];
  const toLL = (x, y) => ({ lat: origin.lat + y / M_LAT, lng: origin.lng + x / (M_LNG * origin.cos) });

  function distM(a, b) {
    const R = 6371000;
    const dLat = (b.lat - a.lat) * DEG, dLng = (b.lng - a.lng) * DEG;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  }

  function cellOf(lat, lng) {
    const j = Math.floor(lat / CELL);
    const lngSize = CELL / Math.max(0.15, Math.cos((j + 0.5) * CELL * DEG));
    const i = Math.floor(lng / lngSize);
    return { j, i, lngSize };
  }

  /* ------------------ Names ------------------ */

  const PRE = ['Ash', 'Ember', 'Hollow', 'Glass', 'Iron', 'Moss', 'Star', 'Thorn', 'Echo', 'Frost', 'Veil', 'Storm', 'Cinder', 'Amber', 'Obsidian', 'Silver', 'Dusk', 'Dawn', 'Bramble', 'Wyrm', 'Salt', 'Lumen', 'Grim', 'Sable'];
  const SUF = ['gate', 'spire', 'well', 'scar', 'hollow', 'shrine', 'cairn', 'reach', 'fall', 'maw', 'crown', 'wake', 'loom', 'rest', 'vault', 'deep'];
  const FORM = ['The {A}{b}', '{A}{b} Rift', '{A}{b} Breach', 'Rift of {A}{b}', '{A}{b} Anomaly', 'The {A} Tear'];

  function riftName(r) {
    return pick(FORM, r).replace('{A}', pick(PRE, r)).replace('{b}', pick(SUF, r));
  }

  const CACHE_NAMES = ['Field Cache', 'Supply Drop', 'Warden Crate', 'Salvage Pod', 'Expedition Cache', 'Dropped Kit'];

  /* ------------------ Cells ------------------ */

  const cache = new Map();   // "j:i" → static cell contents

  function biomeOf(j, i) {
    const els = Object.keys(C.ELEMENTS).filter((e) => e !== 'void');
    return els[hash(`biome:${Math.floor(j / 8)}:${Math.floor(i / 8)}`) % els.length];
  }

  // Rifts: a cell rolls for one, and a 2x2 block of cells that rolled
  // none gets one anyway, in a cell picked by its coordinates.
  const RIFT_CHANCE = 0.46;
  const rolledRift = (j, i) => rng(`cell:${j}:${i}`)() < RIFT_CHANCE;
  function hasRift(j, i) {
    if (rolledRift(j, i)) return true;
    const bj = Math.floor(j / 2) * 2, bi = Math.floor(i / 2) * 2;
    const block = [[bj, bi], [bj, bi + 1], [bj + 1, bi], [bj + 1, bi + 1]];
    if (block.some(([a, b]) => rolledRift(a, b))) return false;
    const pick = block[hash(`block:${bj}:${bi}`) % 4];
    return pick[0] === j && pick[1] === i;
  }

  function staticCell(j, i, lngSize) {
    const key = `${j}:${i}`;
    let cell = cache.get(key);
    if (cell) return cell;
    const r = rng(`cell:${key}`);
    const lat0 = j * CELL, lng0 = i * lngSize;
    const at = () => ({ lat: lat0 + (0.12 + r() * 0.76) * CELL, lng: lng0 + (0.12 + r() * 0.76) * lngSize });
    cell = { key, j, i, lngSize, biome: biomeOf(j, i), rift: null, drop: null, offset: Math.floor(r() * SPAWN_MS) };

    r();   // the Rift roll (see hasRift)
    if (hasRift(j, i)) {
      const p = at();
      // Who holds it: Wardens, Primals or Breachers, the Hollow (machines
      // nobody plays), or nobody. (The rolls keep the same pattern as
      // before there were four teams, so Rifts keep their names.)
      const a = r(), b = a < 0.42 ? 0 : r();
      const faction = a < 0.27 ? 'W' : a < 0.42 ? 'P' : b < 0.45 ? 'B' : b < 0.62 ? 'P' : b < 0.78 ? 'H' : null;
      const held = a < 0.42 || b < 0.72;
      let level = held ? weighted([1, 2, 3, 4, 5, 6, 7, 8], (l) => 9 - l, r) : 0;
      if (faction && !level) level = 1 + (hash(`hl:${key}`) % 5);
      cell.rift = {
        kind: 'rift',
        id: `r${key}`,
        lat: p.lat, lng: p.lng,
        name: riftName(r),
        base: { faction, level, seed: Math.floor(r() * 1e9) },
      };
    }
    if (r() < 0.2) {
      const p = at();
      cell.drop = { kind: 'drop', id: `d${key}`, lat: p.lat, lng: p.lng, name: pick(CACHE_NAMES, r) };
    }
    cache.set(key, cell);
    if (cache.size > 4000) cache.delete(cache.keys().next().value);
    return cell;
  }

  function speciesWeight(sp, biome, night, boost) {
    let w = C.RARITY[sp.rar].weight / C.WILD.filter((s) => s.rar === sp.rar).length;
    if (sp.el === boost) w *= 2.5;
    if (sp.el === biome) w *= 3;
    if (night && sp.el === 'void') w *= 3;
    if (!night && sp.el === 'void') w *= 0.6;
    return w;
  }

  // Creatures in a cell right now.
  function spawnsIn(cell, now) {
    const win = Math.floor((now + cell.offset) / SPAWN_MS);
    const r = rng(`spawn:${cell.key}:${win}`);
    const x = r();
    const n = x < 0.6 ? 0 : x < 0.92 ? 1 : 2;
    const hour = new Date(now).getHours();
    const night = hour >= 20 || hour < 5;
    const boost = RB.weather ? RB.weather.boost : null;
    const out = [];
    for (let k = 0; k < n; k++) {
      const sp = weighted(C.WILD, (s) => speciesWeight(s, cell.biome, night, boost), r);
      out.push({
        kind: 'spawn',
        id: `s${cell.key}:${win}:${k}`,
        sp: sp.id,
        lat: cell.j * CELL + (0.08 + r() * 0.84) * CELL,
        lng: cell.i * cell.lngSize + (0.08 + r() * 0.84) * cell.lngSize,
        lvlRoll: r(),
        ivs: [randInt(0, 10, r), randInt(0, 10, r), randInt(0, 10, r)],
        expires: (win + 1) * SPAWN_MS - cell.offset,
        seed: r() * 100,
        boost: sp.el === boost,   // drawn out by the weather: stronger, more XP
      });
    }
    return out;
  }

  // Everything within `radius` meters of (lat, lng).
  function around(lat, lng, radius, now) {
    const dLat = radius / M_LAT;
    const c0 = cellOf(lat - dLat, lng), c1 = cellOf(lat + dLat, lng);
    const out = { rifts: [], drops: [], spawns: [], cells: [] };
    for (let j = c0.j; j <= c1.j; j++) {
      const lngSize = CELL / Math.max(0.15, Math.cos((j + 0.5) * CELL * DEG));
      const dLng = radius / (M_LNG * Math.max(0.15, Math.cos(lat * DEG)));
      const i0 = Math.floor((lng - dLng) / lngSize), i1 = Math.floor((lng + dLng) / lngSize);
      for (let i = i0; i <= i1; i++) {
        const cell = staticCell(j, i, lngSize);
        out.cells.push(cell);
        if (cell.rift) out.rifts.push(cell.rift);
        if (cell.drop) out.drops.push(cell.drop);
        for (const s of spawnsIn(cell, now)) out.spawns.push(s);
      }
    }
    return out;
  }

  // Find a Rift by id (it regenerates its cell if needed).
  function riftById(id) {
    const m = /^r(-?\d+):(-?\d+)$/.exec(id);
    if (!m) return null;
    const j = +m[1], i = +m[2];
    const lngSize = CELL / Math.max(0.15, Math.cos((j + 0.5) * CELL * DEG));
    return staticCell(j, i, lngSize).rift;
  }

  /* ------------------ Rift guardians ------------------ */

  // The creatures defending an enemy Rift, seeded by the Rift and its level.
  // hollow: the Hollow's machines corrupt Void and Volt creatures.
  function guardians(rift, level, seedExtra, hollow) {
    const r = rng(`guard:${rift.id}:${level}:${seedExtra || 0}`);
    const n = level <= 2 ? 1 : level <= 5 ? 2 : 3;
    const maxRar = level >= 8 ? 3 : level >= 5 ? 2 : level >= 2 ? 1 : 0;
    let pool = C.WILD.filter((s) => s.rar <= maxRar);
    if (hollow) pool = C.WILD.filter((s) => (s.el === 'void' || s.el === 'volt') && s.rar <= Math.max(1, maxRar));
    const team = [];
    for (let k = 0; k < n; k++) {
      const sp = weighted(pool, (s) => 4 - s.rar, r);
      team.push({ sp: sp.id, lvl: Math.max(1, level * 3 - 2 + randInt(-1, 2, r)), iv: [randInt(0, 10, r), randInt(0, 10, r), randInt(0, 10, r)] });
    }
    return team;
  }

  /* ------------------ Geometry for links and fields ------------------ */

  // Do segments ab and cd cross (sharing an endpoint doesn't count)?
  function crosses(a, b, c, d) {
    const same = (p, q) => Math.abs(p[0] - q[0]) < 1e-6 && Math.abs(p[1] - q[1]) < 1e-6;
    if (same(a, c) || same(a, d) || same(b, c) || same(b, d)) return false;
    const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
    return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
  }

  function triArea(a, b, c) {
    return Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
  }

  RB.world = {
    CELL, SPAWN_MS,
    origin, setOrigin, toXY, toLL, distM,
    around, riftById, guardians, biomeOf, cellOf,
    crosses, triArea,
  };
})(window.RB);
