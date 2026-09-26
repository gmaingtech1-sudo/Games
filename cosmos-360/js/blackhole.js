// Sagittarius A*: a Schwarzschild black hole drawn by tracing light rays
// through curved space, with a Doppler-beamed accretion disc and the sky
// behind it gravitationally lensed.
import * as THREE from 'three';
import { NOISE } from './glsl.js';

export const BH_BOUND = 400;   // traced region, in Schwarzschild radii
export const DISK_IN = 3.0;    // innermost stable orbit
export const DISK_OUT = 16.0;

const V = /* glsl */`
varying vec3 vP;
void main() {
  vP = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const F = NOISE + /* glsl */`
uniform vec3 camPos;
uniform samplerCube sky;
uniform float skyGain;
uniform float time;
uniform float gain;
uniform int steps;
varying vec3 vP;

const float RB = ${BH_BOUND.toFixed(1)};
const float DIN = ${DISK_IN.toFixed(1)};
const float DOUT = ${DISK_OUT.toFixed(1)};

vec3 disk(vec3 c, vec3 vdir, out float a) {
  float rc = length(c.xz);
  float ang = atan(c.z, c.x);
  float beta = min(sqrt(0.5 / (rc - 1.0)), 0.95);
  vec3 vel = normalize(vec3(-c.z, 0.0, c.x));
  float gamma = 1.0 / sqrt(1.0 - beta * beta);
  float D = 1.0 / (gamma * (1.0 - beta * dot(vel, -vdir)));
  float g = D * sqrt(max(1.0 - 1.0 / rc, 0.02));
  float omega = beta / rc * 1.4;
  float T = 7.0;
  float n = 0.0;
  for (int k = 0; k < 2; k++) {
    float ph = fract(time / T + float(k) * 0.5);
    float th = ang - omega * ph * T;
    vec3 q = vec3(cos(th) * rc * 0.28, sin(th) * rc * 0.28, rc * 1.6 + float(k) * 7.3);
    float s = fbm(q, 4) + 0.5 * fbm(vec3(q.xy * 3.0, rc * 4.0), 3);
    n += s * (1.0 - abs(2.0 * ph - 1.0));
  }
  float rings = 0.8 + 0.2 * sin(rc * 7.0 + n * 3.0);
  float dens = sst(DIN, DIN + 0.5, rc) * sst(DOUT, DOUT * 0.45, rc) * clamp(0.45 + 0.75 * n, 0.0, 1.2) * rings;
  float x = 3.0 / rc;
  float Tp = pow(x, 0.75) * pow(max(1.0 - sqrt(x), 0.0) + 0.03, 0.25) * 1.9;
  vec3 bb = blackbody(clamp(4200.0 * Tp * g, 1200.0, 30000.0));
  bb /= max(max(bb.r, bb.g), bb.b);
  float I = dens * pow(g, 3.0) * Tp * Tp * Tp * Tp * 7.0 * gain;
  a = clamp(dens * 1.3, 0.0, 1.0);
  return bb * I;
}

void main() {
  vec3 ro = camPos;
  vec3 rd = normalize(vP - camPos);
  vec3 p = ro;
  if (length(ro) > RB) {
    float b = dot(ro, rd);
    float c = dot(ro, ro) - RB * RB;
    float disc = b * b - c;
    if (disc < 0.0) { gl_FragColor = vec4(textureCube(sky, rd).rgb * skyGain, 1.0); return; }
    p = ro + rd * max(-b - sqrt(disc), 0.0);
  }
  vec3 v = rd;
  vec3 hv = cross(p, v);
  float h2 = dot(hv, hv);
  vec3 col = vec3(0.0);
  float alpha = 0.0;
  bool captured = false;
  for (int i = 0; i < 400; i++) {
    if (i >= steps) break;
    float r = length(p);
    if (r < 1.0) { captured = true; break; }
    float dt = clamp(0.1 * (r - 0.95), 0.012, 60.0);
    vec3 acc = -1.5 * h2 * p / pow(r, 5.0);
    vec3 vh = v + acc * (0.5 * dt);
    vec3 pn = p + vh * dt;
    float rn = length(pn);
    vec3 an = -1.5 * h2 * pn / pow(max(rn, 0.5), 5.0);
    v = vh + an * (0.5 * dt);
    if (p.y * pn.y < 0.0) {
      float t = p.y / (p.y - pn.y);
      vec3 c = mix(p, pn, t);
      float rc = length(c.xz);
      if (rc > DIN && rc < DOUT) {
        float a2;
        vec3 e = disk(c, normalize(v), a2);
        col += (1.0 - alpha) * e;
        alpha += (1.0 - alpha) * a2;
      }
    }
    p = pn;
    if (alpha > 0.995) break;
    if (length(p) > RB && dot(p, v) > 0.0) break;
  }
  vec3 bg = vec3(0.0);
  if (!captured) {
    vec3 dir = normalize(v);
    dir = normalize(mix(dir, rd, sst(0.55 * RB, 0.95 * RB, sqrt(h2))));
    bg = textureCube(sky, dir).rgb * skyGain;
  }
  gl_FragColor = vec4(col + (1.0 - alpha) * bg, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function blackHoleMesh(skyTex, quality) {
  const mat = new THREE.ShaderMaterial({
    vertexShader: V, fragmentShader: F,
    uniforms: {
      camPos: { value: new THREE.Vector3() }, sky: { value: skyTex }, skyGain: { value: 1 },
      time: { value: 0 }, gain: { value: 1.6 }, steps: { value: quality === 'low' ? 110 : quality === 'high' ? 240 : 160 },
    },
    side: THREE.BackSide, depthTest: false, depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(BH_BOUND, 64, 32), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  return mesh;
}
