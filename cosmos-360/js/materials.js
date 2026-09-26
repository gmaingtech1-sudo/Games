// Shaders used to draw bodies in the scene.
//
// Planets are shaded in their own rotation frame (units of their radius),
// with the camera and sun directions passed in from the CPU. That keeps the
// maths precise even when a planet is billions of kilometres from the origin.
import * as THREE from 'three';
import { NOISE } from './glsl.js';

const LOGV = '#include <common>\n#include <logdepthbuf_pars_vertex>\n';
const LOGF = '#include <common>\n#include <logdepthbuf_pars_fragment>\n';
const OUT = '#include <tonemapping_fragment>\n#include <colorspace_fragment>\n';
const SST = /* glsl */`
float sst(float e0, float e1, float x) { float t = clamp((x - e0) / (e1 - e0), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
`;

// ───────────────────────────── planet surface ─────────────────────────────
const PLANET_V = LOGV + /* glsl */`
uniform float oblate;
varying vec2 vUv;
varying vec3 vP;
varying vec3 vN;
void main() {
  vUv = uv;
  vP = position * vec3(1.0, oblate, 1.0);
  vN = normalize(normal * vec3(1.0, 1.0 / oblate, 1.0));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}
`;

const PLANET_F = LOGF + NOISE + /* glsl */`
uniform sampler2D map;
uniform sampler2D normalMap;
uniform sampler2D aux;
uniform sampler2D ringTex;
uniform vec3 camPos;
uniform vec3 sunDir;
uniform vec3 sunCol;
uniform vec3 sun2Dir;
uniform vec3 sun2Col;
uniform vec3 atmoCol;
uniform vec3 sunsetCol;
uniform float haze;
uniform float cloudShift;
uniform float ringIn;
uniform float ringOut;
uniform float ambientK;
uniform float emissiveK;
uniform float detail;
varying vec2 vUv;
varying vec3 vP;
varying vec3 vN;

float diffuse(vec3 N, vec3 Ng, vec3 L, vec3 V) {
#if defined(AIRLESS)
  float mu0 = max(dot(N, L), 0.0);
  float mu = max(dot(Ng, V), 0.0);
  float ls = 2.0 * mu0 / (mu0 + mu + 0.02);
  return mix(mu0, ls, 0.6) * sst(-0.03, 0.05, dot(Ng, L));
#elif defined(GAS)
  float mu0 = max(dot(N, L), 0.0);
  float mu = max(dot(Ng, V), 0.02);
  return pow(mu0, 1.15) * pow(mu, 0.15);
#else
  return clamp((dot(N, L) + 0.04) / 1.04, 0.0, 1.0) * sst(-0.06, 0.08, dot(Ng, L));
#endif
}

void main() {
  #include <logdepthbuf_fragment>
  vec3 Ng = normalize(vN);
  vec3 V = normalize(camPos - vP);
  vec4 tex = texture2D(map, vUv);
  vec3 albedo = pow(tex.rgb, vec3(2.2));
  vec3 east = vec3(Ng.z, 0.0, -Ng.x);
  east = dot(east, east) < 1e-8 ? vec3(0.0, 0.0, -1.0) : normalize(east);
  vec3 north = cross(Ng, east);
  vec3 N = Ng;
#ifdef NORMALMAP
  vec3 tn = texture2D(normalMap, vUv).xyz * 2.0 - 1.0;
  N = normalize(tn.x * east + tn.y * north + tn.z * Ng);
#endif
#ifdef DETAIL
  if (detail > 0.001) {
    vec3 q = vP * 160.0;
    float fq = max(length(fwidth(q)), 1e-6);
    float dn = snoise(q) * 0.5 + snoise(q * 4.1) * 0.3 * sst(0.5, 0.2, fq * 4.1) + snoise(q * 16.3) * 0.2 * sst(0.5, 0.2, fq * 16.3);
    float bright = 0.0;
    float fp = max(length(fwidth(vP)), 1e-7);
    float lim = 0.075 / fp;
    float w1 = sst(lim, lim * 0.5, 240.0), w2 = sst(lim, lim * 0.5, 900.0);
    float hc = 0.0;
    if (w1 > 0.0) hc += craterField(vP, 240.0, 0.5, 11.0, bright) / 240.0 * 0.25 * w1;
    if (w2 > 0.0) hc += craterField(vP, 900.0, 0.6, 12.0, bright) / 900.0 * 0.25 * w2;
    bright *= w1;
    albedo *= 1.0 + (dn * 0.2 + bright * 0.25) * detail;
    vec3 sx = dFdx(vP), sy = dFdy(vP);
    vec3 r1 = cross(sy, N), r2 = cross(N, sx);
    float det = dot(sx, r1);
    vec2 dh = vec2(dFdx(hc), dFdy(hc)) * detail * 1.2;
    vec3 grad = sign(det) * (dh.x * r1 + dh.y * r2);
    N = normalize(abs(det) * N - grad);
  }
#endif
  vec3 L = sunDir;
  float NdL = dot(Ng, L);
  float shadow = 1.0;
#ifdef RINGS
  if (abs(L.y) > 1e-4) {
    float t = -vP.y / L.y;
    if (t > 0.0) {
      vec2 q = vP.xz + L.xz * t;
      float u = (length(q) - ringIn) / (ringOut - ringIn);
      if (u > 0.0 && u < 1.0) shadow *= 1.0 - texture2D(ringTex, vec2(u, 0.5)).a * 0.9;
    }
  }
#endif
  float dif = diffuse(N, Ng, L, V) * shadow;
  vec3 lightCol = sunCol;
#ifdef ATMO
  lightCol *= mix(sunsetCol, vec3(1.0), sst(-0.05, 0.35, NdL));
#endif
  vec3 col;
  vec3 emit = vec3(0.0);
#ifdef CLOUDS
  vec2 cuv = vUv + vec2(cloudShift, 0.0);
  float cloud = texture2D(aux, cuv).r;
  vec2 off = vec2(dot(L, east), dot(L, north)) * vec2(0.0022, 0.0044);
  float cs = texture2D(aux, cuv + off).r;
  col = albedo * (1.0 - 0.5 * cs) * dif;
  #ifdef OCEAN
    vec3 H = normalize(L + V);
    float nh = max(dot(Ng, H), 0.0);
    float spec = (pow(nh, 110.0) * 2.2 + pow(nh, 16.0) * 0.1) * tex.a * (1.0 - cloud) * sst(0.0, 0.1, NdL) * shadow;
    col += vec3(1.0, 0.93, 0.82) * spec;
  #endif
  float cdif = clamp((NdL + 0.06) / 1.06, 0.0, 1.0) * shadow;
  col = mix(col, vec3(0.92) * cdif, cloud);
  #ifdef NIGHTLIGHTS
    float lights = texture2D(aux, vUv).g;
    float night = sst(0.1, -0.2, NdL);
    emit += vec3(1.0, 0.68, 0.34) * pow(lights, 1.2) * night * (1.0 - 0.75 * cloud) * 2.2;
  #endif
#else
  col = albedo * dif;
#endif
  col *= lightCol;
#ifdef SUN2
  col += albedo * diffuse(N, Ng, sun2Dir, V) * sun2Col;
#endif
#ifdef ATMO
  float mu = max(dot(Ng, V), 0.0);
  float hz = haze * pow(1.0 - mu, 2.2);
  float lit = sst(-0.25, 0.45, NdL);
  col = col * (1.0 - hz * 0.55) + atmoCol * hz * lit * sunCol;
#endif
#ifdef EMISSIVE
  emit += albedo * emissiveK;
#endif
  col += albedo * ambientK;
  gl_FragColor = vec4(col + emit, 1.0);
  ${OUT}
}
`;

export function planetMaterial(body, tex, ringTex) {
  const defines = {};
  if (body.airless) defines.AIRLESS = 1;
  if (body.gas) defines.GAS = 1;
  if (tex.normal) defines.NORMALMAP = 1;
  if (tex.aux) defines.CLOUDS = 1;
  if (body.ocean && tex.aux) defines.OCEAN = 1;
  if (body.night) defines.NIGHTLIGHTS = 1;
  if (body.atmo) defines.ATMO = 1;
  if (body.rings) defines.RINGS = 1;
  if (body.twoSuns) defines.SUN2 = 1;
  if (!body.gas && body.style !== 'venus' && (body.airless || tex.normal)) defines.DETAIL = 1;
  const a = body.atmo || { color: [1, 1, 1], sunset: [1, 1, 1], haze: 0 };
  return new THREE.ShaderMaterial({
    vertexShader: PLANET_V,
    fragmentShader: PLANET_F,
    defines,
    uniforms: {
      map: { value: tex.map.texture },
      normalMap: { value: tex.normal ? tex.normal.texture : null },
      aux: { value: tex.aux ? tex.aux.texture : null },
      ringTex: { value: ringTex || null },
      camPos: { value: new THREE.Vector3() },
      sunDir: { value: new THREE.Vector3(1, 0, 0) },
      sunCol: { value: new THREE.Color(1, 1, 1) },
      sun2Dir: { value: new THREE.Vector3(1, 0, 0) },
      sun2Col: { value: new THREE.Color(0, 0, 0) },
      atmoCol: { value: new THREE.Color(...a.color) },
      sunsetCol: { value: new THREE.Color(...a.sunset) },
      haze: { value: a.haze || 0 },
      cloudShift: { value: 0 },
      ringIn: { value: body.rings ? body.rings.inner : 0 },
      ringOut: { value: body.rings ? body.rings.outer : 1 },
      oblate: { value: body.oblate || 1 },
      ambientK: { value: 0.0015 },
      emissiveK: { value: 0 },
      detail: { value: 0 },
    },
  });
}

// ───────────────────────────── atmosphere shell ─────────────────────────────
const ATMO_V = LOGV + /* glsl */`
uniform float oblate;
varying vec3 vP;
void main() {
  vP = position * vec3(1.0, oblate, 1.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}
`;
const ATMO_F = LOGF + SST + /* glsl */`
uniform vec3 camPos;
uniform vec3 sunDir;
uniform vec3 sunCol;
uniform vec3 atmoCol;
uniform vec3 sunsetCol;
uniform float Ra;
uniform float density;
uniform float hScale;
varying vec3 vP;
void main() {
  #include <logdepthbuf_fragment>
  vec3 ro = camPos;
  vec3 rd = normalize(vP - camPos);
  float b = dot(ro, rd);
  float c = dot(ro, ro) - Ra * Ra;
  float disc = b * b - c;
  if (disc <= 0.0) discard;
  float s = sqrt(disc);
  float t0 = max(-b - s, 0.0);
  float t1 = -b + s;
  float dp = b * b - (dot(ro, ro) - 1.0);
  if (dp > 0.0) {
    float tp = -b - sqrt(dp);
    if (tp > 0.0) t1 = min(t1, tp);
  }
  if (t1 <= t0) discard;
  float H = (Ra - 1.0) * hScale;
  vec3 sum = vec3(0.0);
  float dt = (t1 - t0) / 10.0;
  for (int i = 0; i < 10; i++) {
    vec3 p = ro + rd * (t0 + dt * (float(i) + 0.5));
    float r = length(p);
    float dens = exp(-max(r - 1.0, 0.0) / H);
    float mu = dot(p / r, sunDir);
    float lit = sst(-0.2, 0.1, mu);
    vec3 tint = mix(sunsetCol, atmoCol, sst(-0.05, 0.3, mu));
    sum += dens * lit * tint;
  }
  sum *= dt * density / (Ra - 1.0);
  float cosT = dot(rd, sunDir);
  float phase = 0.75 * (1.0 + cosT * cosT) + 0.5 * pow(max(cosT, 0.0), 10.0);
  vec3 col = sum * phase * sunCol;
  gl_FragColor = vec4(col, 1.0);
  ${OUT}
}
`;
export function atmosphereMaterial(body) {
  const a = body.atmo;
  return new THREE.ShaderMaterial({
    vertexShader: ATMO_V, fragmentShader: ATMO_F,
    uniforms: {
      camPos: { value: new THREE.Vector3() },
      sunDir: { value: new THREE.Vector3(1, 0, 0) },
      sunCol: { value: new THREE.Color(1, 1, 1) },
      atmoCol: { value: new THREE.Color(...a.color) },
      sunsetCol: { value: new THREE.Color(...a.sunset) },
      Ra: { value: 1 + a.height },
      density: { value: a.density * 0.16 },
      hScale: { value: 0.3 },
      oblate: { value: body.oblate || 1 },
    },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}

// ───────────────────────────── rings ─────────────────────────────
const RING_V = LOGV + /* glsl */`
varying vec3 vP;
void main() {
  vP = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}
`;
const RING_F = LOGF + SST + /* glsl */`
uniform sampler2D ringTex;
uniform float ringIn;
uniform float ringOut;
uniform vec3 camPos;
uniform vec3 sunDir;
uniform vec3 sunCol;
uniform float oblate;
uniform float gain;
varying vec3 vP;
void main() {
  #include <logdepthbuf_fragment>
  float r = length(vP.xz);
  float u = (r - ringIn) / (ringOut - ringIn);
  if (u < 0.0 || u > 1.0) discard;
  vec4 rt = texture2D(ringTex, vec2(u, 0.5));
  float op = rt.a;
  if (op < 0.002) discard;
  vec3 alb = pow(rt.rgb, vec3(2.2));
  vec3 p = vec3(vP.x, 0.0, vP.z);
  vec3 L = sunDir;
  vec3 Ls = normalize(vec3(L.x, L.y / oblate, L.z));
  float b = dot(p, Ls);
  float disc = b * b - (dot(p, p) - 1.0);
  float shadow = 1.0;
  if (b < 0.0) shadow = 1.0 - sst(-0.02, 0.02, disc);
  bool litSide = (L.y > 0.0) == (camPos.y > 0.0);
  vec3 V = normalize(camPos - p);
  float fwd = pow(max(dot(-V, L), 0.0), 8.0);
  float elev = abs(L.y);
  vec3 col;
  if (litSide) col = alb * (0.6 + 0.5 * sqrt(elev)) * (1.0 + fwd);
  else col = alb * (0.35 + 1.6 * fwd) * (1.0 - op * 0.7) * 1.2;
  col *= sunCol * shadow * gain;
  gl_FragColor = vec4(col, op);
  ${OUT}
}
`;
export function ringMaterial(body, ringTex, gain = 1) {
  return new THREE.ShaderMaterial({
    vertexShader: RING_V, fragmentShader: RING_F,
    uniforms: {
      ringTex: { value: ringTex }, ringIn: { value: body.rings.inner }, ringOut: { value: body.rings.outer },
      camPos: { value: new THREE.Vector3() }, sunDir: { value: new THREE.Vector3(1, 0, 0) },
      sunCol: { value: new THREE.Color(1, 1, 1) }, oblate: { value: body.oblate || 1 }, gain: { value: gain },
    },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
}

// Radial ring profiles → 1D texture (RGB colour, A opacity).
export function ringTexture(profile) {
  const W = 4096;
  const data = new Uint8Array(W * 4);
  const put = (i, c, a) => {
    data[i * 4] = Math.round(Math.min(1, c[0]) * 255);
    data[i * 4 + 1] = Math.round(Math.min(1, c[1]) * 255);
    data[i * 4 + 2] = Math.round(Math.min(1, c[2]) * 255);
    data[i * 4 + 3] = Math.round(Math.max(0, Math.min(1, a)) * 255);
  };
  let s = 12345;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const fine = new Float32Array(W);
  for (let i = 0, v = 0; i < W; i++) { v = v * 0.7 + (rnd() - 0.5) * 0.6; fine[i] = v; }
  const bump = (x, c, w) => Math.exp(-(((x - c) / w) ** 2));
  if (profile === 'saturn') {
    const inner = 1.11, outer = 2.33;
    for (let i = 0; i < W; i++) {
      const r = inner + (i + 0.5) / W * (outer - inner);
      let a = 0, c = [0.8, 0.72, 0.6];
      const f = fine[i];
      if (r < 1.236) { a = 0.03 + 0.02 * f; c = [0.55, 0.5, 0.46]; }                       // D ring
      else if (r < 1.527) { a = 0.1 + 0.08 * (r - 1.24) / 0.29 + 0.05 * f; c = [0.52, 0.47, 0.43]; } // C ring
      else if (r < 1.951) {                                                               // B ring
        const t = (r - 1.527) / 0.424;
        a = 0.62 + 0.3 * Math.sin(t * Math.PI) + 0.08 * f; c = [0.84, 0.75, 0.6];
        c = c.map((v) => v * (0.92 + 0.12 * Math.sin(t * 40 + f)));
      } else if (r < 2.027) { a = 0.05 + 0.04 * f + 0.25 * bump(r, 1.99, 0.004); c = [0.5, 0.46, 0.42]; } // Cassini Division
      else if (r < 2.269) {                                                               // A ring
        a = 0.5 + 0.08 * f - 0.06 * (r - 2.027) / 0.24; c = [0.78, 0.72, 0.62];
        a *= 1 - 0.95 * bump(r, 2.214, 0.0028);   // Encke gap
        a *= 1 - 0.9 * bump(r, 2.265, 0.0009);    // Keeler gap
      } else { a = 0.4 * bump(r, 2.326, 0.0022); c = [0.8, 0.76, 0.7]; }                  // F ring
      put(i, c, a);
    }
  } else if (profile === 'uranus') {
    const inner = 1.6, outer = 2.02;
    const rings = [[1.637, 0.002, 0.25], [1.652, 0.002, 0.25], [1.666, 0.002, 0.3], [1.750, 0.002, 0.3], [1.786, 0.002, 0.35], [1.834, 0.002, 0.3], [1.863, 0.002, 0.35], [1.900, 0.002, 0.35], [2.001, 0.004, 0.7]];
    for (let i = 0; i < W; i++) {
      const r = inner + (i + 0.5) / W * (outer - inner);
      let a = 0.01;
      for (const [c, w, o] of rings) a += o * bump(r, c, w);
      put(i, [0.32, 0.32, 0.33], a);
    }
  } else if (profile === 'neptune') {
    const inner = 1.65, outer = 2.56;
    for (let i = 0; i < W; i++) {
      const r = inner + (i + 0.5) / W * (outer - inner);
      const a = 0.12 * bump(r, 1.69, 0.006) + 0.12 * bump(r, 2.15, 0.004) + 0.03 * (r > 2.15 && r < 2.3 ? 1 : 0) + 0.14 * bump(r, 2.54, 0.004);
      put(i, [0.45, 0.42, 0.4], a);
    }
  } else if (profile === 'jupiter') {
    const inner = 1.72, outer = 1.81;
    for (let i = 0; i < W; i++) {
      const r = inner + (i + 0.5) / W * (outer - inner);
      put(i, [0.7, 0.6, 0.5], 0.03 * (1 - Math.abs(r - 1.77) / 0.05) + 0.01 * fine[i]);
    }
  }
  const tex = new THREE.DataTexture(data, W, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

// ───────────────────────────── stars ─────────────────────────────
const STAR_V = LOGV + /* glsl */`
varying vec3 vP;
void main() {
  vP = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}
`;
const STAR_F = LOGF + NOISE + /* glsl */`
uniform float time;
uniform vec3 color;
uniform vec3 camPos;
uniform float intensity;
uniform float spotAmt;
uniform float flare;
varying vec3 vP;
void main() {
  #include <logdepthbuf_fragment>
  vec3 n = normalize(vP);
  vec3 V = normalize(camPos - vP);
  float mu = max(dot(n, V), 0.0);
  float gran = snoise(n * 90.0 + vec3(time * 0.04)) * 0.5 + snoise(n * 210.0 - vec3(time * 0.07)) * 0.3;
  float sup = fbm(n * 8.0 + vec3(time * 0.004), 4);
  float lat = asin(clamp(n.y, -1.0, 1.0));
  float spots = sst(0.5, 0.58, fbm(n * 5.0 + vec3(13.1), 4)) * sst(0.75, 0.2, abs(lat)) * spotAmt;
  float pen = sst(0.42, 0.5, fbm(n * 5.0 + vec3(13.1), 4)) * sst(0.75, 0.2, abs(lat)) * spotAmt;
  float limb = 0.3 + 0.7 * pow(mu, 0.6);
  vec3 warm = mix(color, color * vec3(1.0, 0.66, 0.34), 0.85);
  vec3 c = warm * intensity * (1.0 + 0.36 * gran + 0.16 * sup) * limb;
  c *= mix(vec3(1.0, 0.45, 0.2), vec3(1.0), pow(mu, 0.35));
  c *= 1.0 - pen * 0.45 - spots * 0.5;
  c *= 1.0 + 0.3 * sst(0.25, 0.55, sup) * (1.0 - mu);
  c *= 1.0 + flare * 1.5;
  gl_FragColor = vec4(c, 1.0);
  ${OUT}
}
`;
export function starMaterial(color, spotAmt = 1) {
  return new THREE.ShaderMaterial({
    vertexShader: STAR_V, fragmentShader: STAR_F,
    uniforms: {
      time: { value: 0 }, color: { value: new THREE.Color(...color) }, camPos: { value: new THREE.Vector3(0, 0, 10) },
      intensity: { value: 1.15 }, spotAmt: { value: spotAmt }, flare: { value: 0 },
    },
  });
}

// Screen-facing glow quad. 'size' is its half-width in world units.
const GLOW_V = LOGV + /* glsl */`
uniform float size;
varying vec2 vC;
void main() {
  vC = position.xy;
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  mv.xy += position.xy * size;
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}
`;
const GLOW_F = LOGF + NOISE + /* glsl */`
uniform vec3 color;
uniform float coreFrac;
uniform float glare;
uniform float corona;
uniform float time;
varying vec2 vC;
void main() {
  #include <logdepthbuf_fragment>
  float r = length(vC);
  if (r > 1.0) discard;
  float rs = max(r / coreFrac, 1.0);
  float ang = atan(vC.y, vC.x);
  float streak = 0.75 + 0.5 * snoise(vec3(cos(ang) * 2.5, sin(ang) * 2.5, time * 0.01 + rs * 0.15));
  float cor = corona * pow(rs, -4.0) * streak * sst(0.9, 1.0, r / coreFrac) * 0.07;
  float gl = glare * (exp(-r * 7.0) * 0.35 + exp(-r * 28.0) * 1.3 + exp(-r * 120.0) * 3.0);
  float fade = 1.0 - sst(0.55, 1.0, r);
  vec3 warm = color * vec3(1.0, 0.8, 0.6);
  gl_FragColor = vec4((warm * cor + color * gl) * fade, 1.0);
  ${OUT}
}
`;
export function glowMaterial(color) {
  return new THREE.ShaderMaterial({
    vertexShader: GLOW_V, fragmentShader: GLOW_F,
    uniforms: {
      color: { value: new THREE.Color(...color) }, size: { value: 1 }, coreFrac: { value: 0.2 },
      glare: { value: 1 }, corona: { value: 1 }, time: { value: 0 },
    },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}

// ───────────────────────────── far-away body dots ─────────────────────────────
const DOT_V = LOGV + /* glsl */`
attribute float size;
attribute vec3 color;
varying vec3 vCol;
void main() {
  vCol = color;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = size;
  #include <logdepthbuf_vertex>
}
`;
const DOT_F = LOGF + /* glsl */`
varying vec3 vCol;
void main() {
  #include <logdepthbuf_fragment>
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c) * 2.0;
  if (r > 1.0) discard;
  float a = exp(-r * r * 5.0) + 0.15 * exp(-r * 2.0);
  gl_FragColor = vec4(vCol * a, 1.0);
  ${OUT}
}
`;
export function dotsMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: DOT_V, fragmentShader: DOT_F,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}

// ───────────────────────────── asteroid & Kuiper belts ─────────────────────────────
const BELT_V = LOGV + /* glsl */`
attribute vec4 orb;
attribute vec3 axP;
attribute vec3 axQ;
uniform float days;
uniform float pxSize;
varying float vB;
void main() {
  float e = orb.y;
  float M = mod(orb.z + orb.w * days, 6.2831853);
  float E = M + e * sin(M);
  E = E - (E - e * sin(E) - M) / (1.0 - e * cos(E));
  E = E - (E - e * sin(E) - M) / (1.0 - e * cos(E));
  vec3 pos = orb.x * (cos(E) - e) * axP + orb.x * sqrt(1.0 - e * e) * sin(E) * axQ;
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = pxSize;
  vB = fract(orb.z * 13.7) * 0.6 + 0.4;
  #include <logdepthbuf_vertex>
}
`;
const BELT_F = LOGF + /* glsl */`
uniform vec3 tint;
uniform float bright;
varying float vB;
void main() {
  #include <logdepthbuf_fragment>
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c) * 2.0;
  if (r > 1.0) discard;
  gl_FragColor = vec4(tint * bright * vB * exp(-r * r * 3.0), 1.0);
  ${OUT}
}
`;
export function beltMaterial(tint, bright) {
  return new THREE.ShaderMaterial({
    vertexShader: BELT_V, fragmentShader: BELT_F,
    uniforms: { days: { value: 0 }, pxSize: { value: 1.5 }, tint: { value: new THREE.Color(...tint) }, bright: { value: bright } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}

// ───────────────────────────── comet tails ─────────────────────────────
const TAIL_V = LOGV + /* glsl */`
uniform vec3 axisV;
uniform vec3 bendV;
uniform float len;
uniform float width;
varying vec2 vT;
void main() {
  vT = vec2(position.x, position.y);
  vec4 c = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vec3 toCam = normalize(-c.xyz);
  vec3 side = cross(axisV, toCam);
  side = dot(side, side) < 1e-8 ? vec3(1.0, 0.0, 0.0) : normalize(side);
  float y = position.y;
  vec3 p = c.xyz + axisV * (y * len) + bendV * (y * y * len) + side * position.x * width * (0.12 + y * 1.4);
  gl_Position = projectionMatrix * vec4(p, 1.0);
  #include <logdepthbuf_vertex>
}
`;
const TAIL_F = LOGF + SST + /* glsl */`
uniform vec3 color;
uniform float strength;
varying vec2 vT;
void main() {
  #include <logdepthbuf_fragment>
  float y = vT.y;
  float along = pow(1.0 - y, 2.4) * sst(0.0, 0.02, y);
  float across = exp(-pow(vT.x * 2.0, 2.0) * 4.5);
  float streak = 0.75 + 0.25 * sin(vT.x * 37.0 + y * 13.0) * sin(vT.x * 71.0 - y * 7.0);
  float a = along * across * streak;
  gl_FragColor = vec4(color * a * strength * 0.45, 1.0);
  ${OUT}
}
`;
export function tailMaterial(color) {
  return new THREE.ShaderMaterial({
    vertexShader: TAIL_V, fragmentShader: TAIL_F,
    uniforms: {
      axisV: { value: new THREE.Vector3(0, 1, 0) }, bendV: { value: new THREE.Vector3() }, len: { value: 1 }, width: { value: 1 },
      color: { value: new THREE.Color(...color) }, strength: { value: 0 },
    },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

// ───────────────────────────── orbit lines ─────────────────────────────
// Fades out the part of the path close to the camera so it doesn't streak.
const ORBIT_V = LOGV + /* glsl */`
varying vec3 vMv;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vMv = mv.xyz;
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}
`;
const ORBIT_F = LOGF + SST + /* glsl */`
uniform vec3 color;
uniform float opacity;
uniform float fadeNear;
varying vec3 vMv;
void main() {
  #include <logdepthbuf_fragment>
  float a = opacity * sst(fadeNear * 0.15, fadeNear, length(vMv));
  gl_FragColor = vec4(color, a);
  ${OUT}
}
`;
export function orbitMaterial(color, opacity, fadeNear) {
  return new THREE.ShaderMaterial({
    vertexShader: ORBIT_V, fragmentShader: ORBIT_F,
    uniforms: { color: { value: new THREE.Color(color) }, opacity: { value: opacity }, fadeNear: { value: fadeNear } },
    transparent: true, depthWrite: false,
  });
}
