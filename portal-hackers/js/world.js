/* Portal Hackers: Nexus — the world. Everything the compass detects is
   generated from real latitude and longitude, so the same street corner
   always has the same portal, for everyone, with no server.

   The globe is cut into cells about 120 m across. Each cell can hold:
   - a portal (fixed): Common, Rare, Epic, Legendary or Nexus, held by a team
     or neutral (a few change hands each day);
   - energy cells (they reappear every 10 minutes);
   and every 4 × 4 block of cells can hide a Nexus signal for an hour. */
window.PH = window.PH || {};
(function (PH) {
  'use strict';

  const { rng, hash, pick, weighted } = PH.util;

  const CELL = 0.0011;          // degrees of latitude (~122 m)
  const ENERGY_MS = 10 * 60e3;
  const SIGNAL_MS = 60 * 60e3;
  const SIGNAL_BLOCK = 4;
  const M_LAT = 110574;
  const M_LNG = 111320;
  const DEG = Math.PI / 180;
  const DAY = 86400e3;

  /* ------------------ Geography ------------------ */

  function distM(a, b) {
    const R = 6371000;
    const dLat = (b.lat - a.lat) * DEG, dLng = (b.lng - a.lng) * DEG;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  }

  // Bearing from a to b in degrees clockwise from north.
  function bearing(a, b) {
    const y = Math.sin((b.lng - a.lng) * DEG) * Math.cos(b.lat * DEG);
    const x = Math.cos(a.lat * DEG) * Math.sin(b.lat * DEG) - Math.sin(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.cos((b.lng - a.lng) * DEG);
    return (Math.atan2(y, x) / DEG + 360) % 360;
  }

  // Flat offset in meters (x east, y north) of b from a.
  function offset(a, b) {
    return [(b.lng - a.lng) * M_LNG * Math.cos(a.lat * DEG), (b.lat - a.lat) * M_LAT];
  }

  function move(a, dx, dy) {
    return { lat: a.lat + dy / M_LAT, lng: a.lng + dx / (M_LNG * Math.max(0.15, Math.cos(a.lat * DEG))) };
  }

  const lngSizeAt = (j) => CELL / Math.max(0.15, Math.cos((j + 0.5) * CELL * DEG));

  /* ------------------ Names ------------------ */

  const PRE = ['Arc', 'Neon', 'Echo', 'Helix', 'Ion', 'Vector', 'Cipher', 'Prism', 'Quasar', 'Flux', 'Static', 'Chrome', 'Vapor', 'Photon', 'Rune', 'Zenith', 'Orbit', 'Nova', 'Glitch', 'Pulse', 'Signal', 'Lattice', 'Spectra', 'Hex'];
  const SUF = ['Gate', 'Node', 'Relay', 'Spire', 'Array', 'Beacon', 'Core', 'Hub', 'Arch', 'Well', 'Mast', 'Vault', 'Junction', 'Anchor', 'Lens', 'Shrine'];
  const NEXUS_NAMES = ['The Singularity', 'Nexus Prime', 'The Event Horizon', 'Heart of the Nexus', 'The Convergence', 'The Null Gate'];

  function portalName(r, rarity) {
    if (rarity === 'nexus') return pick(NEXUS_NAMES, r);
    return `${pick(PRE, r)} ${pick(SUF, r)}`;
  }

  /* ------------------ Cells ------------------ */

  const cache = new Map();

  function staticCell(j, i) {
    const key = `${j}:${i}`;
    let cell = cache.get(key);
    if (cell) return cell;
    const lngSize = lngSizeAt(j);
    const r = rng(`cell:${key}`);
    const lat0 = j * CELL, lng0 = i * lngSize;
    const at = () => ({ lat: lat0 + (0.12 + r() * 0.76) * CELL, lng: lng0 + (0.12 + r() * 0.76) * lngSize });
    cell = { key, j, i, lngSize, portal: null, offset: Math.floor(r() * ENERGY_MS) };

    const nexus = hash(`nexus:${key}`) % 90 === 0;
    if (nexus || r() < 0.36) {
      const p = at();
      const rarity = nexus ? 'nexus' : weighted(['common', 'rare', 'epic', 'legendary'], (x) => ({ common: 60, rare: 25, epic: 11, legendary: 4 }[x]), r);
      cell.portal = {
        kind: 'portal', id: `p${key}`, lat: p.lat, lng: p.lng, rarity,
        name: portalName(r, rarity),
        seed: Math.floor(r() * 1e9),
      };
    }
    cache.set(key, cell);
    if (cache.size > 5000) cache.delete(cache.keys().next().value);
    return cell;
  }

  // Which team holds an untouched portal today. Most keep their owner; a few
  // change hands each day so the war keeps moving.
  function baseOwner(portal, now) {
    if (portal.rarity === 'nexus') return null;
    const r0 = rng(`own:${portal.id}`);
    let owner = r0() < 0.34 ? null : pick(['N', 'P', 'E'], r0);
    const r1 = rng(`own:${portal.id}:${Math.floor(now / DAY)}`);
    if (r1() < 0.12) owner = r1() < 0.3 ? null : pick(['N', 'P', 'E'], r1);
    return owner;
  }

  function energyIn(cell, now) {
    const win = Math.floor((now + cell.offset) / ENERGY_MS);
    const r = rng(`energy:${cell.key}:${win}`);
    const n = r() < 0.55 ? 1 : r() < 0.4 ? 2 : 0;
    const out = [];
    for (let k = 0; k < n; k++) {
      out.push({
        kind: 'energy', id: `e${cell.key}:${win}:${k}`,
        lat: cell.j * CELL + (0.08 + r() * 0.84) * CELL,
        lng: cell.i * cell.lngSize + (0.08 + r() * 0.84) * cell.lngSize,
      });
    }
    return out;
  }

  function signalIn(bj, bi, now) {
    const win = Math.floor(now / SIGNAL_MS);
    const r = rng(`signal:${bj}:${bi}:${win}`);
    if (r() > 0.32) return null;
    const lat = (bj * SIGNAL_BLOCK + r() * SIGNAL_BLOCK) * CELL;
    const j = Math.floor(lat / CELL);
    const lng = (bi * SIGNAL_BLOCK + r() * SIGNAL_BLOCK) * lngSizeAt(j);
    return { kind: 'signal', id: `n${bj}:${bi}:${win}`, lat, lng, expires: (win + 1) * SIGNAL_MS };
  }

  // Everything within `radius` meters of `pos`.
  function around(pos, radius, now) {
    const dLat = radius / M_LAT;
    const j0 = Math.floor((pos.lat - dLat) / CELL), j1 = Math.floor((pos.lat + dLat) / CELL);
    const dLng = radius / (M_LNG * Math.max(0.15, Math.cos(pos.lat * DEG)));
    const out = { portals: [], energy: [], signals: [] };
    const blocks = new Set();
    for (let j = j0; j <= j1; j++) {
      const lngSize = lngSizeAt(j);
      const i0 = Math.floor((pos.lng - dLng) / lngSize), i1 = Math.floor((pos.lng + dLng) / lngSize);
      for (let i = i0; i <= i1; i++) {
        const cell = staticCell(j, i);
        if (cell.portal) out.portals.push(cell.portal);
        for (const e of energyIn(cell, now)) out.energy.push(e);
        blocks.add(`${Math.floor(j / SIGNAL_BLOCK)}:${Math.floor(i / SIGNAL_BLOCK)}`);
      }
    }
    for (const b of blocks) {
      const [bj, bi] = b.split(':').map(Number);
      const s = signalIn(bj, bi, now);
      if (s) out.signals.push(s);
    }
    for (const list of [out.portals, out.energy, out.signals]) {
      for (const it of list) it.dist = distM(pos, it);
    }
    out.portals = out.portals.filter((p) => p.dist <= radius);
    out.energy = out.energy.filter((p) => p.dist <= radius);
    out.signals = out.signals.filter((p) => p.dist <= radius);
    return out;
  }

  function portalById(id) {
    const m = /^p(-?\d+):(-?\d+)$/.exec(id);
    if (!m) return null;
    return staticCell(+m[1], +m[2]).portal;
  }

  /* ------------------ Geometry ------------------ */

  // Do segments ab and cd cross (sharing an endpoint doesn't count)?
  function crosses(a, b, c, d) {
    const same = (p, q) => Math.abs(p[0] - q[0]) < 1e-6 && Math.abs(p[1] - q[1]) < 1e-6;
    if (same(a, c) || same(a, d) || same(b, c) || same(b, d)) return false;
    const o = (p, q, s) => Math.sign((q[0] - p[0]) * (s[1] - p[1]) - (q[1] - p[1]) * (s[0] - p[0]));
    return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
  }

  /* ------------------ Other players' links and fields ------------------ */

  // Every block of 12 × 12 cells (about 1.5 km) gets a few links and control
  // fields per team each day, between portals that team holds that day, so
  // the map shows a living war. They're seeded, the same for everyone, and
  // never cross each other. Whoever draws them should drop any whose
  // portals have since changed hands (for example, captured by you).
  const NET_BLOCK = 12;
  const netCache = new Map();

  function networksIn(bj, bi, now) {
    const day = Math.floor(now / DAY);
    const key = `${bj}:${bi}:${day}`;
    if (netCache.has(key)) return netCache.get(key);
    const byTeam = { N: [], P: [], E: [] };
    for (let j = bj * NET_BLOCK; j < (bj + 1) * NET_BLOCK; j++) {
      for (let i = bi * NET_BLOCK; i < (bi + 1) * NET_BLOCK; i++) {
        const p = staticCell(j, i).portal;
        if (!p || p.rarity === 'nexus') continue;
        const o = baseOwner(p, now);
        if (o) byTeam[o].push(p);
      }
    }
    const r = rng(`net:${key}`);
    const all = [].concat(byTeam.N, byTeam.P, byTeam.E);
    const origin = all[0] || { lat: 0, lng: 0 };
    const xy = (p) => offset(origin, p);
    const segs = [];   // [A, B] in meters, every team
    const links = [], fields = [];
    const has = (a, b) => links.some((l) => (l.a === a.id && l.b === b.id) || (l.a === b.id && l.b === a.id));
    const free = (a, b) => has(a, b) || !segs.some(([c, d]) => crosses(xy(a), xy(b), c, d));
    const addLink = (a, b, team) => {
      if (has(a, b)) return;
      links.push({ a: a.id, b: b.id, team });
      segs.push([xy(a), xy(b)]);
    };
    for (const team of ['N', 'P', 'E']) {
      const list = byTeam[team];
      if (list.length < 2) continue;
      const tries = r() < 0.8 ? 1 + Math.floor(r() * 3) : 0;
      for (let t = 0; t < tries; t++) {
        const a = pick(list, r), b = pick(list, r), c = pick(list, r);
        if (a === b) continue;
        if (c === a || c === b || r() < 0.25) {
          // A lone link.
          if (free(a, b)) addLink(a, b, team);
          continue;
        }
        if (!free(a, b) || !free(b, c) || !free(c, a)) continue;
        addLink(a, b, team); addLink(b, c, team); addLink(c, a, team);
        const A = xy(a), B = xy(b), C = xy(c);
        const area = Math.abs((B[0] - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (B[1] - A[1])) / 2;
        fields.push({ a: a.id, b: b.id, c: c.id, team, cp: Math.max(10, Math.round(area / 1000)) });
      }
    }
    const out = { links, fields };
    netCache.set(key, out);
    if (netCache.size > 400) netCache.delete(netCache.keys().next().value);
    return out;
  }

  // Everyone's links and fields within `radius` meters of `pos`.
  function networks(pos, radius, now) {
    const dLat = radius / M_LAT;
    const dLng = radius / (M_LNG * Math.max(0.15, Math.cos(pos.lat * DEG)));
    const j0 = Math.floor((pos.lat - dLat) / CELL / NET_BLOCK), j1 = Math.floor((pos.lat + dLat) / CELL / NET_BLOCK);
    const out = { links: [], fields: [] };
    for (let bj = j0; bj <= j1; bj++) {
      const lngSize = lngSizeAt(bj * NET_BLOCK + NET_BLOCK / 2);
      const i0 = Math.floor((pos.lng - dLng) / lngSize / NET_BLOCK), i1 = Math.floor((pos.lng + dLng) / lngSize / NET_BLOCK);
      for (let bi = i0; bi <= i1; bi++) {
        const n = networksIn(bj, bi, now);
        out.links.push(...n.links);
        out.fields.push(...n.fields);
      }
    }
    return out;
  }

  PH.world = { CELL, distM, bearing, offset, move, around, portalById, baseOwner, crosses, networks };
})(window.PH);
