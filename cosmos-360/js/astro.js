// Orbital mechanics and coordinate frames.
//
// Scene frame: three.js Y is ecliptic north. Ecliptic (x, y, z) maps to
// scene (x, z, -y), so the ecliptic plane is the scene's XZ plane.
import * as THREE from 'three';

export const DEG = Math.PI / 180;
export const J2000 = Date.UTC(2000, 0, 1, 12, 0, 0);
export const OBLIQUITY = 23.4392911 * DEG;

export const daysSinceJ2000 = (ms) => (ms - J2000) / 86400000;

export function eqToEcl(v) {
  const c = Math.cos(OBLIQUITY), s = Math.sin(OBLIQUITY);
  return [v[0], c * v[1] + s * v[2], -s * v[1] + c * v[2]];
}
export function eclToScene(v, out = new THREE.Vector3()) {
  return out.set(v[0], v[2], -v[1]);
}
export function raDecToEq(raDeg, decDeg) {
  const ra = raDeg * DEG, de = decDeg * DEG;
  return [Math.cos(de) * Math.cos(ra), Math.cos(de) * Math.sin(ra), Math.sin(de)];
}
export function raDecToScene(raDeg, decDeg, out = new THREE.Vector3()) {
  return eclToScene(eqToEcl(raDecToEq(raDeg, decDeg)), out);
}

// Matrix that turns a scene direction into galactic (x → galactic centre,
// y → l = 90°, z → north galactic pole).
export function sceneToGalactic() {
  const G = [
    [-0.0548755604, -0.8734370902, -0.4838350155],
    [0.4941094279, -0.4448296300, 0.7469822445],
    [-0.8676661490, -0.1980763734, 0.4559837762],
  ];
  const c = Math.cos(OBLIQUITY), s = Math.sin(OBLIQUITY);
  // scene → ecliptic: (x, y, z)_ecl = (X, -Z, Y)
  // ecliptic → equatorial: y_eq = c*y - s*z ; z_eq = s*y + c*z
  const m = new THREE.Matrix3();
  const cols = [];
  for (const e of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
    const ecl = [e[0], -e[2], e[1]];
    const eq = [ecl[0], c * ecl[1] - s * ecl[2], s * ecl[1] + c * ecl[2]];
    cols.push(G.map((row) => row[0] * eq[0] + row[1] * eq[1] + row[2] * eq[2]));
  }
  m.set(
    cols[0][0], cols[1][0], cols[2][0],
    cols[0][1], cols[1][1], cols[2][1],
    cols[0][2], cols[1][2], cols[2][2],
  );
  return m;
}

export function solveKepler(M, e) {
  M = ((M % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
  let E = e < 0.8 ? M : Math.PI * Math.sign(M || 1);
  for (let i = 0; i < 40; i++) {
    const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-12) break;
  }
  return E;
}

// Position in an orbit's reference frame (x, y in the reference plane,
// z to its north), from classical elements in degrees.
export function orbitFramePos(a, e, iDeg, nodeDeg, periDeg, Mrad) {
  const E = solveKepler(Mrad, e);
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const i = iDeg * DEG, O = nodeDeg * DEG, w = periDeg * DEG;
  const cO = Math.cos(O), sO = Math.sin(O), ci = Math.cos(i), si = Math.sin(i), cw = Math.cos(w), sw = Math.sin(w);
  return [
    (cw * cO - sw * sO * ci) * xp + (-sw * cO - cw * sO * ci) * yp,
    (cw * sO + sw * cO * ci) * xp + (-sw * sO + cw * cO * ci) * yp,
    (sw * si) * xp + (cw * si) * yp,
  ];
}

// Low-precision geocentric Moon (ecliptic, km). Good to about a degree.
export function moonEcliptic(d) {
  const L = (218.316 + 13.176396 * d) * DEG;
  const M = (134.963 + 13.064993 * d) * DEG;
  const F = (93.272 + 13.229350 * d) * DEG;
  const lon = L + 6.289 * DEG * Math.sin(M);
  const lat = 5.128 * DEG * Math.sin(F);
  const r = 385001 - 20905 * Math.cos(M);
  return [r * Math.cos(lat) * Math.cos(lon), r * Math.cos(lat) * Math.sin(lon), r * Math.sin(lat)];
}

// IAU-style body orientation. Returns a quaternion whose local +Y is the
// north pole and local +X is the prime meridian.
const _P = new THREE.Vector3(), _Q = new THREE.Vector3(), _PQ = new THREE.Vector3();
const _X = new THREE.Vector3(), _Z = new THREE.Vector3(), _M = new THREE.Matrix4();
export function poleVector(raDeg, decDeg, out = new THREE.Vector3()) {
  return raDecToScene(raDeg, decDeg, out);
}
export function orientation(pole, Wdeg, nodeRa, out = new THREE.Quaternion()) {
  _P.copy(pole).normalize();
  raDecToScene(nodeRa + 90, 0, _Q);
  _Q.addScaledVector(_P, -_Q.dot(_P)).normalize();
  _PQ.crossVectors(_P, _Q);
  const W = Wdeg * DEG;
  _X.copy(_Q).multiplyScalar(Math.cos(W)).addScaledVector(_PQ, Math.sin(W)).normalize();
  _Z.crossVectors(_X, _P);
  _M.makeBasis(_X, _P, _Z);
  return out.setFromRotationMatrix(_M);
}
// Orientation for a tidally locked body: local +X faces 'toward'.
export function lockedOrientation(pole, toward, out = new THREE.Quaternion()) {
  _P.copy(pole).normalize();
  _X.copy(toward).addScaledVector(_P, -toward.dot(_P));
  if (_X.lengthSq() < 1e-12) _X.set(1, 0, 0);
  _X.normalize();
  _Z.crossVectors(_X, _P);
  _M.makeBasis(_X, _P, _Z);
  return out.setFromRotationMatrix(_M);
}

// Basis of a body's equatorial plane: node N, B = P × N, pole P.
export function equatorBasis(pole) {
  const P = pole.clone().normalize();
  const N = new THREE.Vector3(0, 1, 0).cross(P);
  if (N.lengthSq() < 1e-10) N.set(1, 0, 0);
  N.normalize();
  const B = new THREE.Vector3().crossVectors(P, N);
  return { N, B, P };
}

export function formatDate(ms) {
  const d = new Date(ms);
  if (isNaN(d.getTime())) return '—';
  const y = d.getUTCFullYear();
  const pad = (n) => String(n).padStart(2, '0');
  return `${y}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}
