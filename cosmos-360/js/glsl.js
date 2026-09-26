// Shared GLSL snippets: noise, crater fields and star colours.

export const NOISE = /* glsl */`
vec3 nz_mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 nz_mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 nz_permute(vec4 x) { return nz_mod289(((x * 34.0) + 1.0) * x); }
vec4 nz_taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

// Ashima Arts 3D simplex noise, range about [-1, 1].
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = nz_mod289(i);
  vec4 p = nz_permute(nz_permute(nz_permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = nz_taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

// smoothstep that also works with reversed edges (the built-in is undefined then).
float sst(float e0, float e1, float x) {
  float t = clamp((x - e0) / (e1 - e0), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

float fbm(vec3 p, int oct) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 10; i++) {
    if (i >= oct) break;
    s += a * snoise(p);
    p = p * 2.03 + vec3(17.1, 3.7, 9.2);
    a *= 0.5;
  }
  return s;
}

float ridged(vec3 p, int oct) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 10; i++) {
    if (i >= oct) break;
    float n = 1.0 - abs(snoise(p));
    s += a * n * n;
    p = p * 2.07 + vec3(5.3, 11.9, 2.1);
    a *= 0.5;
  }
  return s;
}

vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

// Height profile of a single crater, x = distance from centre / radius.
float craterProfile(float x) {
  if (x < 1.0) return (x * x - 1.0) + 0.3 * sst(0.75, 1.0, x);
  return 0.3 * exp(-(x - 1.0) * (x - 1.0) * 14.0);
}

// A field of craters at one size. Adds fresh-ejecta brightness to 'bright'.
float craterField(vec3 p, float freq, float density, float sd, inout float bright) {
  vec3 q = p * freq;
  vec3 id = floor(q);
  vec3 f = fract(q);
  float h = 0.0;
  for (int k = 0; k < 27; k++) {
    vec3 g = vec3(float(k % 3) - 1.0, float((k / 3) % 3) - 1.0, float(k / 9) - 1.0);
    vec3 cell = id + g;
    vec3 rnd = hash33(cell + sd * 17.0);
    if (rnd.x > density) continue;
    vec3 c = g + hash33(cell * 1.7 + sd * 5.0 + 3.1) - f;
    float rad = 0.22 + 0.4 * rnd.y * rnd.y;
    float x = length(c) / rad;
    if (x > 2.5) continue;
    h += craterProfile(x) * rad;
    float fresh = sst(0.82, 1.0, rnd.z);
    bright += fresh * exp(-pow((x - 1.0) / 0.6, 2.0)) * 0.6;
  }
  return h;
}

// Approximate colour of a black body, returned in linear RGB.
vec3 blackbody(float T) {
  float t = T / 100.0;
  vec3 c;
  c.r = t <= 66.0 ? 1.0 : clamp(1.292936186 * pow(t - 60.0, -0.1332047592), 0.0, 1.0);
  c.g = t <= 66.0 ? clamp(0.3900815788 * log(t) - 0.6318414438, 0.0, 1.0)
                  : clamp(1.129890861 * pow(t - 60.0, -0.0755148492), 0.0, 1.0);
  c.b = t >= 66.0 ? 1.0 : (t <= 19.0 ? 0.0 : clamp(0.5432067891 * log(t - 10.0) - 1.19625409, 0.0, 1.0));
  return pow(c, vec3(2.2));
}
`;

// JS twin of the GLSL blackbody function (returns linear RGB 0..1).
export function blackbody(T) {
  const t = T / 100;
  const cl = (v) => Math.min(1, Math.max(0, v));
  const r = t <= 66 ? 1 : cl(1.292936186 * Math.pow(t - 60, -0.1332047592));
  const g = t <= 66 ? cl(0.3900815788 * Math.log(t) - 0.6318414438) : cl(1.129890861 * Math.pow(t - 60, -0.0755148492));
  const b = t >= 66 ? 1 : (t <= 19 ? 0 : cl(0.5432067891 * Math.log(t - 10) - 1.19625409));
  return [Math.pow(r, 2.2), Math.pow(g, 2.2), Math.pow(b, 2.2)];
}

// Small JS value noise used for ring textures and irregular moon shapes.
function hash3(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
export function vnoise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const s = (t) => t * t * (3 - 2 * t);
  const u = s(xf), v = s(yf), w = s(zf);
  const L = (a, b, t) => a + (b - a) * t;
  const c000 = hash3(xi, yi, zi), c100 = hash3(xi + 1, yi, zi);
  const c010 = hash3(xi, yi + 1, zi), c110 = hash3(xi + 1, yi + 1, zi);
  const c001 = hash3(xi, yi, zi + 1), c101 = hash3(xi + 1, yi, zi + 1);
  const c011 = hash3(xi, yi + 1, zi + 1), c111 = hash3(xi + 1, yi + 1, zi + 1);
  return L(L(L(c000, c100, u), L(c010, c110, u), v), L(L(c001, c101, u), L(c011, c111, u), v), w) * 2 - 1;
}
export function vfbm3(x, y, z, oct = 4) {
  let a = 0.5, s = 0;
  for (let i = 0; i < oct; i++) {
    s += a * vnoise3(x, y, z);
    x = x * 2.03 + 7.1; y = y * 2.03 + 3.3; z = z * 2.03 + 1.7;
    a *= 0.5;
  }
  return s;
}

// Deterministic PRNG.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
