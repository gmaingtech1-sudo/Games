// Paints planet surfaces on the GPU into equirectangular textures.
//
// Each body gets a colour map (RGB + height or water mask in alpha), and
// optionally a normal map (tangent space: east, north, up) and an aux map
// (R = clouds, G = city lights). Textures are rendered in strips across
// several frames so slow phones never stall.
import * as THREE from 'three';
import { NOISE } from './glsl.js';
import { BANDS } from './data.js';

const STYLE_ID = { rocky: 1, earth: 2, mars: 4, venus: 5, gas: 6, io: 7, europa: 8, titan: 9, triton: 11, pluto: 12, eyeball: 13, iceworld: 15 };

const VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform float seed;
uniform vec3 c1, c2, c3, c4;
uniform vec4 prm;
uniform float texW;
uniform sampler2D landMask;
uniform sampler2D bandTex;
${NOISE}

const float PI_ = 3.14159265359;
vec3 dirLL(float latD, float lonD) {
  float la = radians(latD), lo = radians(lonD);
  return vec3(cos(la) * cos(lo), sin(la), -cos(la) * sin(lo));
}
float angDist(vec3 a, vec3 b) { return acos(clamp(dot(a, b), -1.0, 1.0)); }
// Normalised distance inside a lat/lon ellipse (< 1 inside).
float ell(float lat, float lon, float cLat, float cLon, float rLat, float rLon) {
  float dl = mod(lon - cLon + 540.0, 360.0) - 180.0;
  vec2 q = vec2(dl / rLon, (lat - cLat) / rLat);
  return length(q);
}
float inEll(float lat, float lon, float cLat, float cLon, float rLat, float rLon, float n) {
  return 1.0 - sst(0.7, 1.15, ell(lat, lon, cLat, cLon, rLat, rLon) + n);
}
// Crater at a fixed spot: returns height, adds rays.
float namedCrater(vec3 d, float latD, float lonD, float radRad, float depth) {
  float x = angDist(d, dirLL(latD, lonD)) / radRad;
  return craterProfile(x) * depth;
}
float rays(vec3 d, float latD, float lonD, float radRad, float reach, float sd) {
  vec3 c = dirLL(latD, lonD);
  float td = angDist(d, c);
  vec3 t1 = normalize(cross(c, abs(c.y) > 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0)));
  vec3 t2 = cross(c, t1);
  float az = atan(dot(d, t2), dot(d, t1));
  float r1 = max(snoise(vec3(cos(az) * 7.0, sin(az) * 7.0, sd)), 0.0);
  float r2 = max(snoise(vec3(cos(az) * 19.0, sin(az) * 19.0, sd + 3.0)), 0.0);
  float s = pow(r1, 1.5) + pow(r2, 2.0) * 0.8;
  return s * exp(-td / reach) * sst(radRad * 0.9, radRad * 1.6, td) + exp(-pow(td / (radRad * 1.3), 2.0)) * 0.6;
}

// Standard crater stack for airless bodies. Returns relief, adds brightness.
float craterStack(vec3 p, float dens, inout float bright) {
  // Drop crater sizes the texture can't hold (they alias into blocky noise).
  float lim = texW * 0.028;
  float cr = 0.0;
  float f = 2.5, amp = 0.30, dm = 0.22;
  for (int i = 0; i < 6; i++) {
    float w = sst(lim, lim * 0.5, f);
    if (w > 0.0) cr += craterField(p, f, dm * dens, float(i) + 1.0, bright) * amp * w;
    f *= 2.0; amp *= 0.53;
    dm = min(dm + 0.11, 0.65);
  }
  return cr;
}

// ─────────────────────────────── styles ───────────────────────────────
// Each style fills 'col' (sRGB) and 'h' (height 0..1; used for normals).

void styleRocky(vec3 d, float lat, float lon, out vec3 col, out float h) {
  vec3 p = d + seed * vec3(3.1, 1.7, 2.3);
  float n = fbm(p * 1.8, 6);
  float n2 = fbm(p * 11.0, 5);
  col = mix(c1, c2, sst(-0.45, 0.55, n) * prm.y);
  col *= 0.92 + 0.16 * n2;
  h = 0.5 + 0.05 * n + 0.02 * n2;
  float bright = 0.0;
  float dens = prm.x;
  float mare = 0.0;
#ifdef F_MOON
  float nb = fbm(p * 5.0, 5) * 0.4 + fbm(p * 14.0, 3) * 0.12;
  mare = max(mare, inEll(lat, lon, 18.0, -56.0, 34.0, 26.0, nb));   // Oceanus Procellarum
  mare = max(mare, inEll(lat, lon, 0.0, -36.0, 14.0, 18.0, nb));    // Procellarum south / Insularum
  mare = max(mare, inEll(lat, lon, 34.0, -15.0, 18.0, 22.0, nb));   // Imbrium
  mare = max(mare, inEll(lat, lon, 28.0, 17.5, 11.0, 12.0, nb));    // Serenitatis
  mare = max(mare, inEll(lat, lon, 8.0, 30.0, 13.0, 15.0, nb));     // Tranquillitatis
  mare = max(mare, inEll(lat, lon, 17.0, 59.0, 8.0, 9.5, nb));      // Crisium
  mare = max(mare, inEll(lat, lon, -6.0, 50.0, 13.0, 9.0, nb));     // Fecunditatis
  mare = max(mare, inEll(lat, lon, -15.2, 35.3, 5.5, 5.5, nb));     // Nectaris
  mare = max(mare, inEll(lat, lon, -20.0, -17.0, 11.0, 12.0, nb));   // Nubium
  mare = max(mare, inEll(lat, lon, -24.4, -38.6, 6.5, 6.5, nb));    // Humorum
  mare = max(mare, inEll(lat, lon, 56.0, 1.4, 3.5, 40.0, nb) * 0.8); // Frigoris
  mare = max(mare, inEll(lat, lon, 13.3, 3.6, 5.0, 7.0, nb));       // Vaporum
  mare = max(mare, inEll(lat, lon, -10.0, -23.0, 7.0, 8.0, nb));    // Cognitum
  mare = max(mare, inEll(lat, lon, 27.3, 147.9, 2.5, 3.0, nb));     // Moscoviense (far side)
  mare = max(mare, inEll(lat, lon, -1.0, 87.0, 3.0, 3.0, nb));      // Smythii
  mare = max(mare, inEll(lat, lon, -19.4, -94.7, 2.5, 2.5, nb));    // Orientale centre
  float mareTone = 0.85 + 0.3 * fbm(p * 7.0 + 2.0, 4);
  col = mix(col, c4 * mareTone * (0.9 + 0.2 * n2), mare * 0.92);
#endif
  float cr = craterStack(p, dens, bright) * (1.0 - 0.75 * mare);
  h += cr * 0.5 - mare * 0.03;
  col *= 1.0 + cr * 0.45;
  col = mix(col, c3, clamp(bright, 0.0, 1.0) * prm.z);
#ifdef F_MOON
  float ty = rays(d, -43.3, -11.2, 0.025, 0.4, 1.0);
  float co = rays(d, 9.6, -20.1, 0.027, 0.18, 4.0);
  float ke = rays(d, 8.1, -38.0, 0.009, 0.1, 7.0);
  col = mix(col, c3, clamp(ty * 0.4 + co * 0.35 + ke * 0.3, 0.0, 0.6));
  h += namedCrater(d, -43.3, -11.2, 0.025, 0.04) + namedCrater(d, 9.6, -20.1, 0.027, 0.04);
  // Orientale's rings
  float od = angDist(d, dirLL(-19.4, -94.7));
  h += 0.03 * exp(-pow((od - 0.27) / 0.02, 2.0)) + 0.02 * exp(-pow((od - 0.36) / 0.02, 2.0));
#endif
#ifdef F_MERCURY
  float cd = angDist(d, dirLL(30.5, 170.2));
  float cal = 1.0 - sst(0.5, 0.66, cd + fbm(p * 5.0, 3) * 0.05);
  col = mix(col, c1 * vec3(1.08, 1.04, 0.98), cal * 0.5);
  h += 0.03 * exp(-pow((cd - 0.64) / 0.03, 2.0)) - cal * 0.02;
  col = mix(col, c3, clamp(rays(d, -57.0, -48.0, 0.012, 0.3, 2.0) * 0.6, 0.0, 0.7));
#endif
#ifdef F_MIMAS
  float hd = angDist(d, dirLL(1.7, -111.8));
  h += craterProfile(hd / 0.36) * 0.28 + 0.2 * exp(-pow(hd / 0.05, 2.0));
  col *= 1.0 - 0.12 * (1.0 - sst(0.2, 0.36, hd));
#endif
#ifdef F_IAPETUS
  float dk = 1.0 - sst(0.85, 1.05, ell(lat, lon, 0.0, -90.0, 55.0, 95.0) + fbm(p * 3.0, 5) * 0.25);
  col = mix(col, c4 * (0.8 + 0.4 * n2), dk);
  float rl = mod(lon + 540.0, 360.0) - 180.0;
  h += 0.12 * exp(-pow(lat / 1.4, 2.0)) * sst(-175.0, -150.0, rl) * sst(-10.0, -30.0, rl);
#endif
#ifdef F_CHARON
  col = mix(col, c4, sst(58.0, 80.0, lat + fbm(p * 4.0, 4) * 10.0));
  float belt = pow(1.0 - abs(snoise(vec3(d.x * 3.0, d.y * 14.0, d.z * 3.0) + seed)), 18.0) * sst(40.0, 5.0, abs(lat - 5.0));
  col *= 1.0 - belt * 0.4; h -= belt * 0.05;
#endif
#ifdef F_CERES
  float oc = angDist(d, dirLL(19.8, -120.7));
  h += craterProfile(oc / 0.098) * 0.05;
  col = mix(col, vec3(1.0, 0.99, 0.96), exp(-pow(oc / 0.012, 2.0)) + 0.6 * exp(-pow(angDist(d, dirLL(20.5, -118.5)) / 0.008, 2.0)));
#endif
#ifdef F_CALLISTO
  float vd = angDist(d, dirLL(14.7, -56.0));
  col = mix(col, c3 * 0.8, (1.0 - sst(0.08, 0.16, vd)) * 0.6);
  col *= 1.0 + 0.12 * (0.5 + 0.5 * cos(vd * 70.0)) * exp(-vd / 0.4) * sst(0.1, 0.2, vd);
#endif
#ifdef F_GANYMEDE
  float dark = sst(0.05, 0.3, fbm(p * 1.3 + 4.0, 5));
  dark = max(dark, inEll(lat, lon, 35.0, -145.0, 22.0, 35.0, fbm(p * 3.0, 3) * 0.2));
  vec3 gp = d * 22.0 + vec3(fbm(p * 3.0, 3), fbm(p * 3.0 + 9.0, 3), 0.0) * 1.5;
  float grooves = pow(1.0 - abs(snoise(gp)), 10.0) * (1.0 - dark);
  col = mix(c1 * (0.95 + 0.1 * n2), c2 * (0.9 + 0.2 * n2), dark);
  col *= 1.0 - grooves * 0.15;
  col *= 1.0 + cr * 0.45;
  col = mix(col, c3, clamp(bright, 0.0, 1.0) * prm.z);
  col = mix(col, vec3(0.86, 0.87, 0.9), sst(45.0, 70.0, abs(lat)) * 0.55);
  h += grooves * 0.02;
#endif
#ifdef F_ENCELADUS
  float colat = 90.0 + lat;
  if (colat < 32.0) {
    vec2 pp = vec2(cos(radians(lon)), sin(radians(lon))) * colat;
    float y = pp.x * sin(0.6) + pp.y * cos(0.6);
    float xx = pp.x * cos(0.6) - pp.y * sin(0.6);
    float st = 0.0;
    for (int i = 0; i < 4; i++) {
      float off = (float(i) - 1.5) * 7.0 + 1.5 * sin(xx * 0.12 + float(i));
      st += exp(-pow((y - off) / 0.7, 2.0)) * sst(20.0, 12.0, abs(xx));
    }
    col = mix(col, c4, clamp(st, 0.0, 1.0) * 0.85);
    h -= st * 0.03;
  }
  float gr = pow(1.0 - abs(snoise(d * vec3(9.0, 24.0, 9.0) + seed)), 14.0);
  col *= 1.0 - gr * 0.06;
#endif
#ifdef F_PHOBOS
  float sd = angDist(d, dirLL(-1.0, -49.0));
  h += craterProfile(sd / 0.42) * 0.25;
  float gro = pow(1.0 - abs(snoise(vec3(d.x * 2.0, d.y * 26.0, d.z * 2.0))), 12.0);
  col *= 1.0 - gro * 0.25; h -= gro * 0.02;
#endif
#ifdef F_MIRANDA
  float cor = sst(0.1, 0.4, fbm(p * 1.4 + 2.0, 3));
  float bands = 0.5 + 0.5 * sin(dot(d, normalize(vec3(0.3, 1.0, 0.2))) * 70.0 + fbm(p * 2.0, 3) * 6.0);
  col = mix(col, mix(c2, c3, bands), cor * 0.8);
  h += cor * bands * 0.03;
  float vr = exp(-pow((angDist(d, dirLL(-18.0, -20.0)) - 0.35) / 0.01, 2.0));
  col = mix(col, c3, vr * 0.8); h += vr * 0.06;
#endif
#ifdef F_TITANIA
  float can = pow(1.0 - abs(snoise(d * 5.0 + seed)), 30.0);
  col *= 1.0 - can * 0.35; h -= can * 0.05;
#endif
#ifdef F_COMET
  h += fbm(p * 3.0, 4) * 0.1;
#endif
#ifdef F_EXOROCK
  float lav = pow(1.0 - abs(snoise(p * 6.0)), 14.0);
  col *= 1.0 - lav * 0.25;
#endif
}

vec3 earthLand(vec3 d, float lat, float lon) {
  float alat = abs(lat);
  float n = fbm(d * 7.0 + 3.0, 5);
  float n2 = fbm(d * 30.0 + 11.0, 4);
  vec3 rain = vec3(0.06, 0.14, 0.05);
  vec3 forest = vec3(0.10, 0.18, 0.07);
  vec3 grass = vec3(0.30, 0.34, 0.16);
  vec3 savanna = vec3(0.46, 0.43, 0.25);
  vec3 desert = vec3(0.80, 0.68, 0.48);
  vec3 redDesert = vec3(0.72, 0.46, 0.27);
  vec3 tundra = vec3(0.37, 0.35, 0.28);
  vec3 boreal = vec3(0.07, 0.13, 0.08);
  vec3 ice = vec3(0.93, 0.95, 0.98);

  vec3 c = alat < 12.0 ? mix(rain, forest, sst(6.0, 12.0, alat))
         : alat < 25.0 ? mix(forest, savanna, sst(12.0, 22.0, alat))
         : alat < 40.0 ? mix(savanna, grass, sst(25.0, 38.0, alat))
         : alat < 56.0 ? mix(grass, forest, sst(42.0, 55.0, alat))
         : alat < 68.0 ? mix(boreal, tundra, sst(60.0, 68.0, alat))
         : tundra;
  c = mix(c, c * 1.25, n * 0.5);
  float dn = n * 0.25;
  float des = 0.0;
  des = max(des, inEll(lat, lon, 23.0, 9.0, 9.0, 27.0, dn));      // Sahara
  des = max(des, inEll(lat, lon, 23.0, 47.0, 8.5, 11.0, dn));     // Arabia
  des = max(des, inEll(lat, lon, 29.5, 60.0, 5.0, 9.0, dn) * 0.8);// Iran
  des = max(des, inEll(lat, lon, 26.5, 71.0, 3.5, 4.5, dn) * 0.8);// Thar
  des = max(des, inEll(lat, lon, 39.0, 83.0, 3.0, 7.0, dn));      // Taklamakan
  des = max(des, inEll(lat, lon, 43.0, 103.0, 4.5, 11.0, dn) * 0.8); // Gobi
  des = max(des, inEll(lat, lon, 46.0, 62.0, 5.0, 14.0, dn) * 0.45); // Kazakh steppe
  des = max(des, inEll(lat, lon, -23.0, 19.5, 6.0, 7.0, dn) * 0.75); // Kalahari
  des = max(des, inEll(lat, lon, 8.0, 46.0, 5.0, 6.0, dn) * 0.6);    // Horn of Africa
  des = max(des, inEll(lat, lon, -24.0, -69.5, 7.0, 2.0, dn));       // Atacama
  des = max(des, inEll(lat, lon, -45.0, -68.0, 6.0, 3.0, dn) * 0.55);// Patagonia
  des = max(des, inEll(lat, lon, 32.0, -112.0, 5.5, 7.0, dn) * 0.75); // Sonoran / Mojave
  des = max(des, inEll(lat, lon, 40.0, -116.0, 4.0, 4.0, dn) * 0.55);  // Great Basin
  float aus = inEll(lat, lon, -25.0, 132.0, 9.0, 14.0, dn);
  c = mix(c, mix(desert, desert * vec3(1.02, 0.95, 0.9), n2 * 0.5 + 0.5), des);
  c = mix(c, redDesert * (0.9 + 0.2 * n2), aus);
  float rf = 0.0;
  rf = max(rf, inEll(lat, lon, -4.0, -62.0, 9.0, 14.0, dn));
  rf = max(rf, inEll(lat, lon, 0.0, 21.0, 5.0, 9.0, dn));
  rf = max(rf, inEll(lat, lon, 0.0, 112.0, 8.0, 18.0, dn));
  c = mix(c, rain, rf * 0.8);
  c = mix(c, vec3(0.42, 0.38, 0.3), inEll(lat, lon, 33.0, 87.0, 5.0, 12.0, dn) * 0.7); // Tibet
  float snow = inEll(lat, lon, 29.0, 84.0, 1.6, 7.0, dn * 2.0) * 0.8;
  float icy = sst(-60.0, -64.0, lat) + inEll(lat, lon, 72.0, -41.0, 12.0, 22.0, dn * 0.5) + sst(76.0, 82.0, lat) * 0.8;
  c = mix(c, ice, clamp(max(icy, snow), 0.0, 1.0));
  c *= 0.9 + 0.2 * n2;
  return c;
}

void styleEarth(vec2 uv, vec3 d, float lat, float lon, out vec3 col, out float water) {
  vec2 j = vec2(fbm(d * 40.0, 3), fbm(d * 40.0 + 5.0, 3)) * vec2(0.0009, 0.0012);
  float land = texture2D(landMask, uv + j).r;
  float near = 0.0;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.785398;
    near += texture2D(landMask, uv + vec2(cos(a) * 0.006, sin(a) * 0.009)).r;
  }
  near = clamp(near / 8.0 * 2.5, 0.0, 1.0);
  vec3 deep = vec3(0.012, 0.045, 0.13);
  vec3 shelf = vec3(0.04, 0.17, 0.27);
  vec3 ocean = mix(deep, shelf, near * 0.7) * (0.92 + 0.12 * fbm(d * 9.0, 3));
  float seaIce = sst(77.0, 84.0, lat + fbm(d * 8.0, 4) * 5.0) + sst(-66.0, -71.0, lat + fbm(d * 8.0, 4) * 4.0);
  ocean = mix(ocean, vec3(0.85, 0.88, 0.92), clamp(seaIce, 0.0, 1.0));
  vec3 lc = earthLand(d, lat, lon);
  float m = sst(0.35, 0.65, land);
  col = mix(ocean, lc, m);
  water = (1.0 - m) * (1.0 - clamp(seaIce, 0.0, 1.0));
}

float cyclone(vec3 d, float latD, float lonD, float size, float sd) {
  vec3 c = dirLL(latD, lonD);
  float td = angDist(d, c);
  if (td > size * 2.5) return 0.0;
  vec3 t1 = normalize(cross(c, vec3(0.0, 1.0, 0.0)));
  vec3 t2 = cross(c, t1);
  float az = atan(dot(d, t2), dot(d, t1));
  float r = td / size;
  float spin = sign(latD);
  float arm = 0.5 + 0.5 * sin(az * 2.0 * spin + log(r + 0.05) * 5.0 + sd);
  float body = exp(-r * 1.1) * sst(0.03, 0.12, r);
  return clamp(arm * body * 1.6, 0.0, 1.0);
}

vec2 earthAux(vec2 uv, vec3 d, float lat, float lon) {
  float alat = abs(lat);
  vec3 p = d * vec3(2.2, 3.4, 2.2);
  vec3 q = vec3(fbm(p + 1.3, 4), fbm(p + 7.1, 4), fbm(p + 3.7, 4));
  float c = fbm(p * 1.6 + q * 1.9 + seed, 7) * 0.5 + 0.5;
  float fine = fbm(d * 40.0 + q * 3.0, 4) * 0.5 + 0.5;
  float itcz = exp(-pow((lat - 5.0) / 7.0, 2.0));
  float subtrop = exp(-pow((alat - 24.0) / 8.0, 2.0));
  float storm = exp(-pow((alat - 55.0) / 11.0, 2.0));
  float polar = sst(70.0, 85.0, alat);
  float cover = 0.42 + 0.25 * itcz - 0.2 * subtrop + 0.22 * storm + 0.1 * polar;
  float cl = sst(1.0 - cover - 0.08, 1.0 - cover + 0.22, c * 0.85 + fine * 0.15);
  cl = max(cl, cyclone(d, 18.0, -62.0, 0.07, 1.0));
  cl = max(cl, cyclone(d, -16.0, 76.0, 0.06, 2.0));
  cl = max(cl, cyclone(d, 52.0, -28.0, 0.13, 3.0) * 0.9);
  cl = max(cl, cyclone(d, -50.0, 150.0, 0.14, 4.0) * 0.9);
  cl = max(cl, cyclone(d, 21.0, 135.0, 0.06, 5.0));
  cl *= 0.9 + 0.1 * fine;

  float land = texture2D(landMask, uv).r;
  float pop = 0.05;
  pop = max(pop, inEll(lat, lon, 49.0, 10.0, 8.0, 18.0, 0.0) * 0.9);   // Europe
  pop = max(pop, inEll(lat, lon, 53.0, 0.0, 4.0, 6.0, 0.0));           // Britain
  pop = max(pop, inEll(lat, lon, 55.0, 38.0, 4.0, 10.0, 0.0) * 0.6);   // Moscow
  pop = max(pop, inEll(lat, lon, 38.0, -85.0, 8.0, 12.0, 0.0) * 0.9);  // Eastern US
  pop = max(pop, inEll(lat, lon, 35.0, -118.0, 4.0, 5.0, 0.0) * 0.8);  // California
  pop = max(pop, inEll(lat, lon, 20.0, 78.0, 10.0, 9.0, 0.0));         // India
  pop = max(pop, inEll(lat, lon, 31.0, 115.0, 9.0, 9.0, 0.0));         // East China
  pop = max(pop, inEll(lat, lon, 36.0, 137.0, 3.0, 5.0, 0.0));         // Japan
  pop = max(pop, inEll(lat, lon, 37.0, 127.5, 1.5, 1.5, 0.0));         // Korea
  pop = max(pop, inEll(lat, lon, 28.0, 31.0, 4.0, 0.8, 0.0));          // Nile
  pop = max(pop, inEll(lat, lon, 7.0, 5.0, 3.0, 4.0, 0.0) * 0.7);      // Nigeria
  pop = max(pop, inEll(lat, lon, -23.0, -45.0, 4.0, 5.0, 0.0) * 0.8);  // Sao Paulo / Rio
  pop = max(pop, inEll(lat, lon, 19.5, -99.0, 2.0, 2.0, 0.0));         // Mexico City
  pop = max(pop, inEll(lat, lon, -7.0, 110.0, 1.2, 5.0, 0.0));         // Java
  pop = max(pop, inEll(lat, lon, -34.0, 151.0, 1.0, 1.0, 0.0) * 0.7);  // Sydney
  pop = max(pop, inEll(lat, lon, -37.8, 145.0, 1.0, 1.0, 0.0) * 0.6);  // Melbourne
  pop = max(pop, inEll(lat, lon, 25.0, 55.0, 1.5, 2.0, 0.0) * 0.8);    // Gulf
  pop = max(pop, inEll(lat, lon, -26.0, 28.0, 2.0, 2.0, 0.0) * 0.6);   // Johannesburg
  pop *= 1.0 - inEll(lat, lon, 23.0, 9.0, 9.0, 27.0, 0.0) * 0.9;
  pop *= 1.0 - inEll(lat, lon, -25.0, 132.0, 9.0, 14.0, 0.0) * 0.95;
  pop *= sst(72.0, 60.0, alat);
  float clusters = sst(0.05, 0.55, fbm(d * 90.0 + 2.0, 4));
  float towns = pow(max(snoise(d * 380.0), 0.0), 5.0) * 1.5 + pow(max(snoise(d * 160.0 + 7.0), 0.0), 6.0) * 1.2;
  float cities = clusters * 0.9 * pop + towns * sqrt(pop);
  float lights = clamp(cities * sst(0.6, 0.9, land), 0.0, 1.0);
  return vec2(cl, lights);
}

void styleMars(vec3 d, float lat, float lon, out vec3 col, out float h) {
  vec3 p = d + seed;
  float n = fbm(p * 2.2, 6);
  float n2 = fbm(p * 12.0, 5);
  vec3 ochre = vec3(0.74, 0.44, 0.27);
  vec3 dust = vec3(0.84, 0.58, 0.39);
  vec3 dark = vec3(0.36, 0.23, 0.16);
  col = mix(ochre, dust, sst(-0.3, 0.6, n));
  float dn = fbm(p * 4.0, 4) * 0.3;
  float dk = 0.0;
  dk = max(dk, inEll(lat, lon, 9.0, 70.0, 10.0, 7.0, dn));        // Syrtis Major
  dk = max(dk, inEll(lat, lon, 46.0, -30.0, 9.0, 20.0, dn) * 0.85);// Acidalium
  dk = max(dk, inEll(lat, lon, -25.0, -40.0, 9.0, 26.0, dn) * 0.8); // Erythraeum
  dk = max(dk, inEll(lat, lon, -3.0, 2.0, 4.0, 14.0, dn) * 0.85);   // Meridiani
  dk = max(dk, inEll(lat, lon, -22.0, 145.0, 8.0, 26.0, dn) * 0.8); // Cimmerium
  dk = max(dk, inEll(lat, lon, -14.0, 105.0, 7.0, 15.0, dn) * 0.75);// Tyrrhenum
  dk = max(dk, inEll(lat, lon, -30.0, 5.0, 8.0, 18.0, dn) * 0.6);   // Pandorae Fretum
  dk = max(dk, inEll(lat, lon, 35.0, 170.0, 6.0, 14.0, dn) * 0.45);
  col = mix(col, dark * (0.85 + 0.3 * n2), dk * 0.85);
  float hellas = inEll(lat, lon, -42.0, 70.0, 11.0, 16.0, dn * 0.5);
  float argyre = inEll(lat, lon, -50.0, -43.0, 6.0, 9.0, dn * 0.5);
  col = mix(col, dust * 1.08, max(hellas, argyre) * 0.7);
  h = 0.5 + 0.04 * n - hellas * 0.12 - argyre * 0.06;
  float bright = 0.0;
  float highlands = sst(10.0, -20.0, lat + n * 15.0);
  h += craterStack(p, 0.35 + 0.6 * highlands, bright) * 0.45;
  // Tharsis volcanoes
  float om = angDist(d, dirLL(18.65, -133.8));
  h += 0.35 * exp(-pow(om / 0.1, 2.0)) - 0.05 * exp(-pow(om / 0.012, 2.0)) + 0.03 * exp(-pow((om - 0.11) / 0.01, 2.0));
  h += 0.22 * exp(-pow(angDist(d, dirLL(-8.3, -120.1)) / 0.06, 2.0));
  h += 0.22 * exp(-pow(angDist(d, dirLL(0.8, -113.4)) / 0.055, 2.0));
  h += 0.22 * exp(-pow(angDist(d, dirLL(11.8, -104.5)) / 0.055, 2.0));
  h += 0.12 * exp(-pow(angDist(d, dirLL(3.0, -112.0)) / 0.3, 2.0));
  col = mix(col, dust * 1.1, exp(-pow(om / 0.08, 2.0)) * 0.4);
  // Valles Marineris
  float vl = clamp((lon + 95.0) / 50.0, 0.0, 1.0);
  float vlat = mix(-7.0, -10.0, vl) + 1.5 * sin(vl * 9.0);
  float vm = exp(-pow((lat - vlat) / (1.2 + 1.5 * sin(vl * 3.14)), 2.0)) * step(-97.0, lon) * step(lon, -40.0);
  vm *= 0.6 + 0.4 * sst(-0.2, 0.4, fbm(p * 20.0, 3));
  col = mix(col, dark * 0.9, vm * 0.75);
  h -= vm * 0.18;
  // Polar caps
  float north = sst(79.0, 82.0, lat + fbm(p * 6.0, 4) * 4.0);
  float trough = 0.5 + 0.5 * sin(atan(d.z, d.x) * 1.0 + (90.0 - lat) * 0.9);
  north *= 0.75 + 0.25 * trough;
  float south = sst(-82.0, -85.0, lat + fbm(p * 6.0, 4) * 3.0 + 1.5 * cos(radians(lon + 40.0)));
  col = mix(col, vec3(0.94, 0.93, 0.9), clamp(north + south, 0.0, 1.0));
  col *= 0.9 + 0.2 * n2;
}

void styleVenus(vec3 d, float lat, float lon, out vec3 col, out float h) {
  vec3 p = d * vec3(1.6, 4.2, 1.6) + seed;
  vec3 q = vec3(fbm(p + 1.0, 4), fbm(p + 5.0, 4), fbm(p + 9.0, 4));
  float y = lat + 14.0 * cos(radians(lon)) * cos(radians(lat)) + q.x * 10.0;
  float stripes = 0.5 + 0.5 * sin(y * 0.18 + q.y * 3.0);
  float swirl = fbm(p * 1.5 + q * 2.0, 6) * 0.5 + 0.5;
  col = mix(c2, c1, sst(0.2, 0.8, swirl * 0.7 + stripes * 0.3));
  col = mix(col, c3, sst(55.0, 80.0, abs(lat)) * 0.4);
  h = 0.5;
}

void styleGas(vec3 d, float lat, float lon, out vec3 col, out float h) {
  float S = prm.x;
  vec3 q = vec3(d.x, d.y * S, d.z);
  vec3 w1 = vec3(fbm(q * 2.0 + seed, 4), fbm(q * 2.0 + seed + 5.2, 4), fbm(q * 2.0 + seed + 9.1, 4));
  vec3 w2 = vec3(fbm(q * 4.0 + w1 * 1.6 + 1.7, 4), fbm(q * 4.0 + w1 * 1.6 + 8.3, 4), 0.0);
  float ripple = fbm(vec3(d.x * 6.0, d.y * 36.0, d.z * 6.0) + w2 * 0.8 + seed, 4);
  float lat2 = lat + w2.x * prm.y + ripple * prm.z;
  col = texture2D(bandTex, vec2(0.5, clamp(lat2 / 180.0 + 0.5, 0.001, 0.999))).rgb;
  float det = fbm(vec3(d.x * 12.0, d.y * 50.0, d.z * 12.0) + w1 * 3.0, 5);
  col *= 1.0 + det * 0.1 * prm.w;
  h = 0.5;
#ifdef F_JUPITER
  // Great Red Spot
  float dl = mod(lon - 42.0 + 540.0, 360.0) - 180.0;
  vec2 e = vec2(dl / 11.5, (lat + 22.4) / 6.8);
  float r = length(e);
  if (r < 2.2) {
    float ang = atan(e.y, e.x);
    float tw = (1.0 - sst(0.0, 1.5, r)) * 5.0;
    vec2 e2 = r * vec2(cos(ang + tw), sin(ang + tw));
    float inner = fbm(vec3(e2 * 2.5, seed), 4);
    vec3 grs = mix(vec3(0.74, 0.36, 0.22), vec3(0.88, 0.6, 0.44), 0.5 + 0.5 * inner);
    grs = mix(grs, vec3(0.8, 0.5, 0.35), sst(0.3, 0.0, r) * 0.5);
    float m = 1.0 - sst(0.82, 1.02, r + inner * 0.06);
    col = mix(col, grs, m);
    col = mix(col, vec3(0.94, 0.9, 0.82), exp(-pow((r - 1.18) / 0.16, 2.0)) * 0.55);
  }
  // Oval BA and white ovals
  float ba = ell(lat, lon, -33.0, 5.0, 2.6, 4.5);
  col = mix(col, vec3(0.9, 0.72, 0.6), (1.0 - sst(0.7, 1.0, ba)) * 0.85);
  for (int i = 0; i < 6; i++) {
    float o = ell(lat, lon, -41.0 + mod(float(i), 2.0) * 1.2, float(i) * 61.0 - 150.0, 1.4, 2.4);
    col = mix(col, vec3(0.95, 0.93, 0.88), (1.0 - sst(0.6, 1.0, o)) * 0.8);
  }
  for (int i = 0; i < 5; i++) {
    float o = ell(lat, lon, 16.5, float(i) * 73.0 - 120.0, 1.2, 3.4);
    col = mix(col, vec3(0.42, 0.26, 0.18), (1.0 - sst(0.6, 1.0, o)) * 0.75);
  }
  // Blue-grey festoons on the edge of the north equatorial belt
  float fe = pow(max(snoise(vec3(d.x * 9.0, lat * 0.4, d.z * 9.0)), 0.0), 2.0) * exp(-pow((lat - 7.5) / 1.8, 2.0));
  col = mix(col, vec3(0.42, 0.44, 0.5), clamp(fe * 1.5, 0.0, 0.7));
#endif
#ifdef F_SATURN
  float colat = 90.0 - lat;
  if (colat < 24.0) {
    float th = radians(lon);
    float sector = mod(th + 3.14159 / 6.0, 3.14159 / 3.0) - 3.14159 / 6.0;
    float hexR = 14.5 * 0.866 / cos(sector);
    float inside = 1.0 - sst(hexR - 0.8, hexR + 0.8, colat + ripple * 0.6);
    col = mix(col, vec3(0.42, 0.5, 0.56), inside * 0.65);
    col = mix(col, vec3(0.62, 0.62, 0.58), exp(-pow((colat - hexR) / 0.9, 2.0)) * 0.5);
    col = mix(col, vec3(0.3, 0.34, 0.38), exp(-colat * colat / 10.0) * 0.8);
  }
  col = mix(col, col * vec3(0.95, 0.97, 1.05), sst(30.0, 60.0, lat) * 0.4);
#endif
#ifdef F_NEPTUNE
  float gds = ell(lat, lon, -20.0, 25.0, 5.0, 11.0);
  col = mix(col, vec3(0.1, 0.16, 0.45), (1.0 - sst(0.6, 1.0, gds + ripple * 0.1)) * 0.85);
  float wc = pow(max(snoise(vec3(d.x * 4.0, d.y * 30.0, d.z * 4.0) + seed), 0.0), 3.0);
  float band = exp(-pow((lat + 26.0) / 4.0, 2.0)) + exp(-pow((lat - 32.0) / 6.0, 2.0)) * 0.7 + exp(-pow((lat + 70.0) / 4.0, 2.0)) * 0.6;
  col = mix(col, vec3(0.92, 0.95, 1.0), clamp(wc * band * 2.5, 0.0, 0.9));
  col = mix(col, vec3(0.9, 0.93, 1.0), (1.0 - sst(0.5, 1.0, ell(lat, lon, -24.5, 30.0, 1.2, 5.0))) * 0.7);
#endif
#ifdef F_URANUS
  col = mix(col, vec3(0.8, 0.93, 0.95), sst(55.0, 80.0, lat) * 0.5);
  float wc2 = pow(max(snoise(vec3(d.x * 5.0, d.y * 30.0, d.z * 5.0) + seed), 0.0), 4.0) * exp(-pow((lat - 30.0) / 10.0, 2.0));
  col = mix(col, vec3(0.9, 0.97, 0.98), clamp(wc2 * 1.5, 0.0, 0.5));
#endif
}

void styleIo(vec3 d, float lat, float lon, out vec3 col, out float h) {
  vec3 p = d + seed;
  float n = fbm(p * 3.0, 6);
  float n2 = fbm(p * 9.0 + 3.0, 5);
  col = mix(vec3(0.92, 0.85, 0.45), vec3(0.86, 0.58, 0.28), sst(-0.1, 0.55, n));
  col = mix(col, vec3(0.96, 0.95, 0.86), sst(0.3, 0.7, n2) * 0.75);
  col = mix(col, vec3(0.55, 0.52, 0.3), sst(0.45, 0.8, fbm(p * 5.0 + 9.0, 4)) * 0.5);
  col = mix(col, vec3(0.5, 0.32, 0.2), sst(40.0, 72.0, abs(lat) + n * 10.0) * 0.75);
  h = 0.5 + 0.03 * n;
  // Volcanic centres
  vec3 q = d * 9.0 + seed;
  vec3 id = floor(q), f = fract(q);
  for (int k = 0; k < 27; k++) {
    vec3 g = vec3(float(k % 3) - 1.0, float((k / 3) % 3) - 1.0, float(k / 9) - 1.0);
    vec3 rnd = hash33(id + g);
    if (rnd.x > 0.55) continue;
    float dist = length(g + hash33((id + g) * 1.3 + 2.0) - f);
    float sz = 0.08 + 0.12 * rnd.y;
    col = mix(col, vec3(0.08, 0.06, 0.05), (1.0 - sst(sz * 0.6, sz, dist)) * 0.9);
    col = mix(col, vec3(0.75, 0.32, 0.15), exp(-pow((dist - sz * 2.2) / (sz * 0.8), 2.0)) * 0.35 * rnd.z);
    h -= (1.0 - sst(sz * 0.6, sz, dist)) * 0.02;
  }
  float pd = angDist(d, dirLL(-19.0, 105.0));
  col = mix(col, vec3(0.72, 0.28, 0.14), exp(-pow((pd - 0.3) / 0.07, 2.0)) * 0.7);
  col = mix(col, vec3(0.1, 0.07, 0.05), 1.0 - sst(0.02, 0.035, pd));
  float lk = angDist(d, dirLL(13.0, 51.0));
  col = mix(col, vec3(0.1, 0.08, 0.06), exp(-pow((lk - 0.05) / 0.015, 2.0)) * 0.9);
}

void styleEuropa(vec3 d, float lat, float lon, out vec3 col, out float h) {
  vec3 p = d + seed;
  float n = fbm(p * 2.5, 5);
  col = mix(vec3(0.88, 0.85, 0.78), vec3(0.8, 0.84, 0.88), sst(-0.3, 0.5, n));
  float chaos = sst(0.15, 0.6, fbm(p * 3.5, 5) + 0.35 * cos(radians(lon - 90.0)));
  col = mix(col, vec3(0.62, 0.47, 0.34), chaos * 0.55);
  h = 0.5;
  float lines = 0.0;
  for (int i = 0; i < 36; i++) {
    vec3 r = hash33(vec3(float(i), seed, 3.0)) * 2.0 - 1.0;
    vec3 nrm = normalize(r + vec3(0.0001));
    vec3 a = normalize(cross(nrm, hash33(vec3(float(i), 7.0, seed)) * 2.0 - 1.0 + vec3(0.001)));
    float w = 0.0025 + 0.004 * hash13(vec3(float(i), 2.0, 5.0));
    float dd = abs(dot(d, nrm));
    float arc = sst(0.2, 0.5, dot(d, a) + 0.3 * snoise(d * 3.0 + float(i)));
    float l = (1.0 - sst(w * 0.4, w, dd)) * arc;
    float dbl = exp(-pow((dd - w * 1.4) / (w * 0.35), 2.0)) * arc;
    lines += l * 0.8 + dbl * 0.35;
  }
  float fineL = pow(1.0 - abs(snoise(p * 18.0)), 30.0) + pow(1.0 - abs(snoise(p * 34.0 + 4.0)), 40.0);
  lines += fineL * 0.5;
  col = mix(col, vec3(0.5, 0.33, 0.22), clamp(lines, 0.0, 1.0) * 0.7);
  h += lines * 0.02;
  col *= 0.94 + 0.12 * fbm(p * 20.0, 3);
}

void styleTitan(vec3 d, float lat, float lon, out vec3 col, out float h) {
  vec3 p = d + seed;
  float n = fbm(p * 2.0, 5);
  vec3 surf = mix(vec3(0.78, 0.56, 0.3), vec3(0.5, 0.36, 0.22), sst(0.0, 0.5, n) * sst(35.0, 5.0, abs(lat)));
  surf = mix(surf, vec3(0.25, 0.2, 0.16), sst(0.35, 0.6, fbm(p * 6.0, 4)) * sst(62.0, 72.0, lat));
  vec3 haze = mix(vec3(0.83, 0.6, 0.3), vec3(0.72, 0.5, 0.26), sst(40.0, 80.0, lat));
  col = mix(surf, haze, 0.78);
  h = 0.5;
}

void styleTriton(vec3 d, float lat, float lon, out vec3 col, out float h) {
  vec3 p = d + seed;
  float n = fbm(p * 3.0, 5);
  vec3 cant = vec3(0.62, 0.62, 0.56);
  vec3 q = d * 14.0 + seed;
  vec3 id = floor(q), f = fract(q);
  float md = 9.0;
  for (int k = 0; k < 27; k++) {
    vec3 g = vec3(float(k % 3) - 1.0, float((k / 3) % 3) - 1.0, float(k / 9) - 1.0);
    md = min(md, length(g + hash33(id + g) - f));
  }
  cant *= 0.85 + 0.3 * sst(0.1, 0.6, md);
  vec3 cap = vec3(0.86, 0.76, 0.7) * (0.92 + 0.12 * n);
  float capM = sst(-5.0, -18.0, lat + n * 10.0);
  col = mix(cant, cap, capM);
  float plumes = pow(max(snoise(vec3(d.x * 10.0 + d.y * 6.0, d.y * 18.0, d.z * 10.0) + seed), 0.0), 3.0) * capM;
  col = mix(col, vec3(0.3, 0.24, 0.22), clamp(plumes * 2.0, 0.0, 0.7));
  h = 0.5 + (1.0 - capM) * sst(0.1, 0.6, md) * 0.04;
}

void stylePluto(vec3 d, float lat, float lon, out vec3 col, out float h) {
  vec3 p = d + seed;
  float n = fbm(p * 2.5, 6);
  float n2 = fbm(p * 12.0, 4);
  col = mix(vec3(0.74, 0.6, 0.47), vec3(0.62, 0.46, 0.34), sst(-0.3, 0.5, n));
  float dn = fbm(p * 4.0, 4) * 0.3;
  float cth = inEll(lat, lon, -8.0, 100.0, 18.0, 55.0, dn);
  float cth2 = inEll(lat, lon, -5.0, 290.0 - 360.0, 12.0, 40.0, dn) * 0.8;
  col = mix(col, vec3(0.26, 0.13, 0.08) * (0.85 + 0.3 * n2), max(cth, cth2));
  col = mix(col, vec3(0.64, 0.58, 0.54), sst(55.0, 75.0, lat + n * 8.0) * 0.7);
  float sp = inEll(lat, lon, 25.0, 175.0, 16.0, 18.0, dn * 0.6);
  float east = inEll(lat, lon, 2.0, -148.0, 20.0, 22.0, dn);
  vec3 q = d * 40.0;
  vec3 id = floor(q), f = fract(q);
  float f1 = 9.0, f2 = 9.0;
  for (int k = 0; k < 27; k++) {
    vec3 g = vec3(float(k % 3) - 1.0, float((k / 3) % 3) - 1.0, float(k / 9) - 1.0);
    float dd = length(g + hash33(id + g) - f);
    if (dd < f1) { f2 = f1; f1 = dd; } else if (dd < f2) f2 = dd;
  }
  float cellEdge = 1.0 - sst(0.0, 0.12, f2 - f1);
  col = mix(col, vec3(0.93, 0.9, 0.84), east * 0.8);
  col = mix(col, vec3(0.96, 0.94, 0.9) * (1.0 - cellEdge * 0.12), sp);
  float bright = 0.0;
  h = 0.5 + n * 0.04 + craterStack(p, 0.55 * (1.0 - sp), bright) * 0.4 - sp * 0.06 + cellEdge * sp * 0.01;
}

void styleEyeball(vec3 d, float lat, float lon, out vec3 col, out float water) {
  vec3 p = d + seed;
  float n = fbm(p * 3.0, 6);
  float dist = degrees(angDist(d, vec3(1.0, 0.0, 0.0))) + n * 12.0;
  float R = prm.x;
  vec3 ocean = mix(c1 * 1.8, c1, sst(R - 12.0, R - 30.0, dist));
  vec3 land = c2 * (0.8 + 0.4 * fbm(p * 8.0, 4));
  vec3 iceC = mix(c3, c4, sst(90.0, 150.0, dist)) * (0.9 + 0.15 * fbm(p * 10.0, 4));
  float cracks = pow(1.0 - abs(snoise(p * 9.0)), 16.0) * sst(R + 10.0, R + 30.0, dist);
  iceC *= 1.0 - cracks * 0.3;
  float landM = sst(0.1, 0.4, fbm(p * 2.0 + 5.0, 5)) * sst(R + 30.0, R, dist);
  float oceanM = 1.0 - sst(R - 2.0, R + 2.0, dist);
  col = mix(iceC, land, landM * (1.0 - oceanM));
  col = mix(col, ocean, oceanM * (1.0 - landM * 0.7));
  water = oceanM * (1.0 - landM * 0.7);
}

vec2 eyeballAux(vec3 d, float lat, float lon) {
  vec3 p = d * vec3(2.5, 3.0, 2.5) + seed;
  vec3 q = vec3(fbm(p + 1.0, 4), fbm(p + 4.0, 4), fbm(p + 8.0, 4));
  float c = fbm(p * 1.4 + q * 2.0, 6) * 0.5 + 0.5;
  float sub = degrees(angDist(d, vec3(1.0, 0.0, 0.0)));
  float cover = 0.25 + 0.4 * exp(-pow(sub / 45.0, 2.0)) + 0.1 * sst(70.0, 120.0, sub);
  return vec2(sst(1.0 - cover - 0.1, 1.0 - cover + 0.25, c), 0.0);
}

void styleIce(vec3 d, float lat, float lon, out vec3 col, out float h) {
  vec3 p = d + seed;
  float n = fbm(p * 2.5, 6);
  col = mix(c1, c2, sst(-0.2, 0.6, n));
  float cr = pow(1.0 - abs(snoise(p * 6.0)), 20.0) + pow(1.0 - abs(snoise(p * 14.0 + 3.0)), 30.0) * 0.6;
  col = mix(col, c3, clamp(cr, 0.0, 1.0) * 0.6);
  h = 0.5 + n * 0.03 - cr * 0.03;
  if (prm.x > 0.0) {
    float sub = degrees(angDist(d, vec3(1.0, 0.0, 0.0))) + n * 8.0;
    float oc = 1.0 - sst(prm.x - 2.0, prm.x + 2.0, sub);
    col = mix(col, vec3(0.05, 0.14, 0.26), oc);
  }
}

void shade(vec2 uv, vec3 d, out vec4 outc) {
  float lat = degrees(asin(clamp(d.y, -1.0, 1.0)));
  float lon = degrees(atan(-d.z, d.x));
  vec3 col = vec3(0.5); float h = 0.5;
#if STYLE == 1
  styleRocky(d, lat, lon, col, h);
#elif STYLE == 2
  styleEarth(uv, d, lat, lon, col, h);
#elif STYLE == 4
  styleMars(d, lat, lon, col, h);
#elif STYLE == 5
  styleVenus(d, lat, lon, col, h);
#elif STYLE == 6
  styleGas(d, lat, lon, col, h);
#elif STYLE == 7
  styleIo(d, lat, lon, col, h);
#elif STYLE == 8
  styleEuropa(d, lat, lon, col, h);
#elif STYLE == 9
  styleTitan(d, lat, lon, col, h);
#elif STYLE == 11
  styleTriton(d, lat, lon, col, h);
#elif STYLE == 12
  stylePluto(d, lat, lon, col, h);
#elif STYLE == 13
  styleEyeball(d, lat, lon, col, h);
#elif STYLE == 15
  styleIce(d, lat, lon, col, h);
#endif
  outc = vec4(clamp(col, 0.0, 1.0), clamp(h, 0.0, 1.0));
}

float heightAt(vec3 d) {
  vec4 c; shade(vec2(0.0), d, c); return c.a;
}

void main() {
  float lonD = (vUv.x - 0.5) * 360.0;
  float latD = (vUv.y - 0.5) * 180.0;
  vec3 d = dirLL(latD, lonD);
#if defined(PASS_NORMAL)
  vec3 east = vec3(d.z, 0.0, -d.x);
  east = length(east) < 1e-4 ? vec3(0.0, 0.0, -1.0) : normalize(east);
  vec3 north = cross(d, east);
  float eps = 6.2831853 / texW;
  float h0 = heightAt(d);
  float he = heightAt(normalize(d + east * eps));
  float hn = heightAt(normalize(d + north * eps));
  float k = prm.w * 1.0 / eps;
  vec3 n = normalize(vec3(-(he - h0) * k, -(hn - h0) * k, 1.0));
  gl_FragColor = vec4(n * 0.5 + 0.5, 1.0);
#elif defined(PASS_AUX)
  float lat = latD, lon = lonD;
  #if STYLE == 2
    gl_FragColor = vec4(earthAux(vUv, d, lat, lon), 0.0, 1.0);
  #else
    gl_FragColor = vec4(eyeballAux(d, lat, lon), 0.0, 1.0);
  #endif
#else
  vec4 c; shade(vUv, d, c);
  gl_FragColor = c;
#endif
}
`;

function bandTexture(stops, seed) {
  const H = 1024;
  const data = new Uint8Array(H * 4);
  let s = seed * 9301 + 49297;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  let jitter = 0;
  for (let i = 0; i < H; i++) {
    const lat = -90 + (i + 0.5) / H * 180;
    let j = 0;
    while (j < stops.length - 2 && stops[j + 1][0] < lat) j++;
    const [la, ca] = stops[j], [lb, cb] = stops[j + 1];
    let t = Math.min(1, Math.max(0, (lat - la) / (lb - la)));
    t = t * t * (3 - 2 * t);
    if (i % 3 === 0) jitter = (rnd() - 0.5) * 0.06;
    for (let c = 0; c < 3; c++) {
      const v = ca[c] + (cb[c] - ca[c]) * t;
      data[i * 4 + c] = Math.max(0, Math.min(255, Math.round((v * (1 + jitter)) * 255)));
    }
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, 1, H, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

export class Baker {
  constructor(renderer, landMask) {
    this.renderer = renderer;
    this.landMask = landMask;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    this.materials = new Map();
    this.jobs = [];
  }

  material(tex, pass) {
    const key = `${tex.style}|${tex.feature || ''}|${pass}`;
    let m = this.materials.get(key);
    if (!m) {
      const defines = { STYLE: STYLE_ID[tex.style] };
      if (tex.feature) defines['F_' + tex.feature] = 1;
      if (pass === 'normal') defines.PASS_NORMAL = 1;
      if (pass === 'aux') defines.PASS_AUX = 1;
      m = new THREE.ShaderMaterial({
        vertexShader: VERT, fragmentShader: FRAG, defines,
        uniforms: {
          seed: { value: 0 }, c1: { value: new THREE.Color() }, c2: { value: new THREE.Color() },
          c3: { value: new THREE.Color() }, c4: { value: new THREE.Color() }, prm: { value: new THREE.Vector4() },
          texW: { value: 1024 }, landMask: { value: this.landMask }, bandTex: { value: null },
        },
        depthTest: false, depthWrite: false,
      });
      this.materials.set(key, m);
    }
    return m;
  }

  // Queue the textures for one body. Returns { map, normal, aux } render targets.
  prepare(body, scale = 1) {
    const tex = body.tex;
    const out = {};
    const mk = (w, mip = true) => {
      w = Math.max(128, Math.round(w * scale));
      const rt = new THREE.WebGLRenderTarget(w, w / 2, {
        type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: false,
        generateMipmaps: mip, minFilter: mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter, magFilter: THREE.LinearFilter,
        wrapS: THREE.RepeatWrapping, wrapT: THREE.ClampToEdgeWrapping,
      });
      rt.texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
      return rt;
    };
    const bands = tex.bands ? bandTexture(BANDS[tex.bands], tex.seed || 1) : null;
    const setup = (m, w) => {
      const u = m.uniforms;
      u.seed.value = tex.seed || 0;
      const col = (c, arr) => c.setRGB(...(arr || [0.5, 0.5, 0.5]));
      col(u.c1.value, tex.c1); col(u.c2.value, tex.c2); col(u.c3.value, tex.c3); col(u.c4.value, tex.c4);
      u.prm.value.set(...(tex.prm || [1, 1, 1, 0]));
      u.texW.value = w;
      u.bandTex.value = bands;
    };
    out.map = mk(tex.size || 1024);
    this.jobs.push({ rt: out.map, mat: this.material(tex, 'color'), setup, w: out.map.width });
    if (tex.normal) {
      out.normal = mk(tex.normal);
      const bump = tex.bump ?? 1;
      this.jobs.push({
        rt: out.normal, mat: this.material(tex, 'normal'), w: out.normal.width,
        setup: (m, w) => { setup(m, w); m.uniforms.prm.value.w = bump * 0.55 * Math.min(1, Math.sqrt(w / 1024)); },
      });
    }
    if (tex.aux) {
      out.aux = mk(tex.aux);
      this.jobs.push({ rt: out.aux, mat: this.material(tex, 'aux'), setup, w: out.aux.width });
    }
    out.dispose = () => { out.map.dispose(); out.normal?.dispose(); out.aux?.dispose(); bands?.dispose(); };
    return out;
  }

  // Compile every queued shader up front so the first frame doesn't hitch.
  get pending() { return this.jobs.length; }

  // Render queued strips until 'budgetMs' is spent. Returns true when done.
  step(budgetMs = 12) {
    const r = this.renderer;
    const t0 = performance.now();
    const prevTarget = r.getRenderTarget();
    const prevAuto = r.autoClear;
    r.autoClear = false;
    while (this.jobs.length) {
      const job = this.jobs[0];
      const strips = Math.max(1, Math.round(job.rt.height / 128));
      job.strip = job.strip || 0;
      if (job.strip === 0) job.setup(job.mat, job.w);
      this.quad.material = job.mat;
      const h = job.rt.height;
      const y0 = Math.floor(job.strip * h / strips), y1 = Math.floor((job.strip + 1) * h / strips);
      job.rt.scissor.set(0, y0, job.rt.width, y1 - y0);
      job.rt.scissorTest = true;
      r.setRenderTarget(job.rt);
      r.render(this.scene, this.camera);
      job.rt.scissorTest = false;
      job.strip++;
      if (job.strip >= strips) this.jobs.shift();
      if (performance.now() - t0 > budgetMs) break;
    }
    r.setRenderTarget(prevTarget);
    r.autoClear = prevAuto;
    return this.jobs.length === 0;
  }
}
