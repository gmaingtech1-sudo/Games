// The sky: a Milky Way painted into a cube map (aligned to the real galactic
// plane), real bright stars as points, constellation lines, and the other
// star systems you can jump to, placed where they really are.
import * as THREE from 'three';
import { NOISE, blackbody, mulberry32 } from './glsl.js';
import { STARS, CONSTELLATIONS, SYSTEMS } from './data.js';
import { raDecToScene, sceneToGalactic } from './astro.js';

export const SKY_R = 1e8;
const SUN_RGB = blackbody(5772);

const SKY_V = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const SKY_F = NOISE + /* glsl */`
uniform mat3 toGal;
uniform float texelAng;
uniform float gain;
varying vec3 vDir;

vec3 galDir(float l, float b) { return vec3(cos(b) * cos(l), cos(b) * sin(l), sin(b)); }
float blob(vec3 g, float l, float b, float r) {
  float d = acos(clamp(dot(g, galDir(radians(l), radians(b))), -1.0, 1.0));
  return exp(-pow(d / radians(r), 2.0));
}

vec3 starLayer(vec3 d, float scale, float prob, float bright) {
  vec3 p = d * scale;
  vec3 id = floor(p), f = fract(p);
  vec3 acc = vec3(0.0);
  float sz = max(texelAng * scale * 0.75, 0.05);
  for (int k = 0; k < 27; k++) {
    vec3 g = vec3(float(k % 3) - 1.0, float((k / 3) % 3) - 1.0, float(k / 9) - 1.0);
    vec3 rnd = hash33(id + g);
    if (rnd.x > prob) continue;
    vec3 sp = g + hash33(id + g + 7.0) - f;
    vec3 perp = sp - d * dot(sp, d);
    float dist = length(perp);
    float I = exp(-dist * dist / (sz * sz)) * bright * pow(rnd.z, 4.0);
    vec3 c = blackbody(2800.0 + 9000.0 * rnd.y * rnd.y);
    acc += c / max(max(c.r, c.g), c.b) * I;
  }
  return acc;
}

vec3 milkyWay(vec3 d, vec3 g) {
  float l = atan(g.y, g.x);
  float b = asin(clamp(g.z, -1.0, 1.0));
  float cen = exp(-l * l / (2.0 * 0.95 * 0.95));
  float bulge = exp(-(l * l + pow(b * 1.5, 2.0)) / (2.0 * 0.16 * 0.16));
  float width = 0.07 + 0.07 * cen;
  float disk = exp(-abs(b) / width) * (0.28 + 0.72 * cen) + exp(-abs(b) / (width * 3.5)) * 0.12;
  float n1 = fbm(d * 5.0, 6);
  float n2 = fbm(d * 16.0 + 4.0, 5);
  float clump = sst(-0.5, 0.7, n1) * 0.8 + 0.2 + 0.25 * n2;
  float dn = fbm(d * 8.0 + 11.0, 7);
  float lane = exp(-pow((b - 0.005 * sin(l * 3.0)) / (0.026 + 0.02 * cen), 2.0));
  float dust = sst(-0.15, 0.45, dn) * lane;
  float rift = sst(-0.75, -0.45, l) * sst(1.5, 1.2, l) * exp(-pow((b - 0.012) / 0.055, 2.0)) * sst(-0.3, 0.4, dn + 0.3);
  float ext = clamp(1.0 - 0.8 * dust - 0.8 * rift, 0.04, 1.0);
  float I = (disk * clump + bulge * 1.2) * ext;
  vec3 col = mix(vec3(0.6, 0.68, 0.95), vec3(1.0, 0.8, 0.58), clamp(cen * 0.7 + bulge, 0.0, 1.0)) * I;
  float hii = pow(max(fbm(d * 22.0 + 30.0, 4), 0.0), 3.0) * exp(-pow(b / 0.05, 2.0)) * 3.0;
  col += vec3(1.0, 0.33, 0.42) * hii * 0.3 * ext;
  col += vec3(1.0, 0.4, 0.5) * blob(g, 209.0, -19.4, 1.0) * 0.5;      // Orion Nebula
  col += vec3(1.0, 0.45, 0.42) * blob(g, 287.6, -0.6, 1.5) * 0.6;     // Carina Nebula
  col += vec3(1.0, 0.4, 0.5) * blob(g, 6.0, -1.2, 0.7) * 0.45;        // Lagoon Nebula
  col += vec3(1.0, 0.45, 0.55) * blob(g, 196.0, -10.0, 9.0) * 0.06;   // Barnard's Loop glow
  col += vec3(0.85, 0.87, 0.97) * blob(g, 280.5, -32.9, 3.4) * (0.6 + 0.5 * n2) * 0.55; // Large Magellanic Cloud
  col += vec3(0.85, 0.87, 0.97) * blob(g, 302.8, -44.3, 1.7) * (0.6 + 0.5 * n2) * 0.45; // Small Magellanic Cloud
  col += vec3(0.95, 0.9, 0.85) * (blob(g, 121.2, -21.6, 0.9) * 0.4 + blob(g, 121.2, -21.6, 2.2) * 0.07); // Andromeda
  col += starLayer(d, 260.0, 0.32, 0.06);
  return col;
}

vec3 coreSky(vec3 d, vec3 g) {
  float b = asin(clamp(g.z, -1.0, 1.0));
  float n1 = fbm(d * 4.0, 6);
  float dn = fbm(d * 7.0 + 3.0, 7);
  float band = exp(-abs(b) / 0.3) * 0.9 + exp(-abs(b) / 0.07) * 1.3 + 0.3;
  float dust = sst(-0.1, 0.5, dn) * exp(-pow(b / 0.14, 2.0));
  float fil = pow(1.0 - abs(snoise(d * 6.0 + dn)), 9.0) * exp(-pow(b / 0.35, 2.0));
  float I = band * (0.65 + 0.55 * n1) * (1.0 - 0.75 * dust);
  vec3 col = mix(vec3(1.0, 0.62, 0.36), vec3(1.0, 0.82, 0.62), sst(0.0, 0.6, n1)) * I * 0.12;
  col += vec3(1.0, 0.3, 0.28) * fil * 0.06;
  float dens = 0.4 + 0.6 * exp(-abs(b) / 0.3);
  col += starLayer(d, 220.0, 0.4 * dens, 0.45);
  col += starLayer(d, 100.0, 0.25 * dens, 1.0);
  col += starLayer(d, 45.0, 0.12, 2.2);
  return col;
}

void main() {
  vec3 d = normalize(vDir);
  vec3 g = toGal * d;
#ifdef CORE
  vec3 col = coreSky(d, g);
#else
  vec3 col = milkyWay(d, g);
#endif
  col *= gain;
  col += (hash13(d * 4000.0) - 0.5) / 255.0;
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
`;

const STAR_V = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
attribute float mag;
attribute vec3 color;
uniform float gain;
uniform float px;
varying vec3 vCol;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float flux = pow(10.0, -0.4 * (mag - 2.0)) * gain;
  float size = clamp(2.0 + 2.4 * sqrt(flux), 2.0, 16.0);
  gl_PointSize = size * px;
  vCol = color * clamp(flux, 0.015, 4.0);
  #include <logdepthbuf_vertex>
}
`;
const STAR_F = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
varying vec3 vCol;
void main() {
  #include <logdepthbuf_fragment>
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c) * 2.0;
  if (r > 1.0) discard;
  float core = exp(-r * r * 16.0);
  float halo = exp(-r * 4.5) * 0.14;
  gl_FragColor = vec4(vCol * (core + halo) * 1.7, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

function bvToRGB(bv) {
  const T = 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
  const c = blackbody(T);
  const n = [c[0] / SUN_RGB[0], c[1] / SUN_RGB[1], c[2] / SUN_RGB[2]];
  const m = Math.max(...n);
  return n.map((v) => v / m);
}

// Scene-space position of a star system, in light-years from the Sun.
export function systemPos(sys) {
  if (!sys.ly) return new THREE.Vector3();
  return raDecToScene(sys.ra, sys.dec).multiplyScalar(sys.ly);
}

export class Sky {
  constructor(renderer) {
    this.renderer = renderer;
    this.group = new THREE.Group();
    this.group.renderOrder = -10;
    this.toGal = sceneToGalactic();
    this.cubeRT = null;
    this.markers = [];
  }

  build(sys, quality) {
    this.dispose();
    const size = quality === 'low' ? 512 : 1024;
    const core = sys.sky === 'core';
    const rt = new THREE.WebGLCubeRenderTarget(size, { type: THREE.UnsignedByteType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.ShaderMaterial({
      vertexShader: SKY_V, fragmentShader: SKY_F, side: THREE.BackSide, depthTest: false, depthWrite: false,
      defines: core ? { CORE: 1 } : {},
      uniforms: { toGal: { value: this.toGal }, texelAng: { value: (Math.PI / 2) / size }, gain: { value: core ? 0.5 : 0.075 } },
    });
    const scene = new THREE.Scene();
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(100, 64, 32), mat);
    scene.add(sphere);
    const cam = new THREE.CubeCamera(1, 1000, rt);
    cam.update(this.renderer, scene);
    sphere.geometry.dispose(); mat.dispose();
    this.cubeRT = rt;
    this.texture = rt.texture;

    // Point stars
    this.markers = [];
    this.constellationNames = [];
    if (!core) this.buildStars(sys, quality);
    // Other systems, placed where they really are.
    const here = systemPos(sys);
    for (const other of SYSTEMS) {
      if (other.id === sys.id) continue;
      const v = systemPos(other).sub(here);
      const ly = v.length();
      this.markers.push({ sys: other, dir: v.normalize(), ly });
    }
    return this.texture;
  }

  buildStars(sys, quality) {
    const here = systemPos(sys);
    const pos = [], col = [], mag = [];
    const byName = {};
    const add = (dir, m, rgb) => {
      pos.push(dir.x * SKY_R, dir.y * SKY_R, dir.z * SKY_R);
      mag.push(m); col.push(...rgb);
    };
    const v = new THREE.Vector3();
    for (const [name, ra, dec, m, bv] of STARS) {
      raDecToScene(ra * 15, dec, v);
      byName[name] = v.clone();
      add(v, m, bvToRGB(bv));
    }
    // Other systems as stars, with the brightness you'd really see from here.
    for (const other of SYSTEMS) {
      if (other.id === sys.id || other.absMag > 30) continue;
      const d = systemPos(other).sub(here);
      const pc = d.length() / 3.2616;
      const m = other.absMag + 5 * Math.log10(pc / 10);
      if (m > 7.5) continue;
      const bv = other.id === 'sol' ? 0.65 : other.id === 'alphacen' ? 0.71 : 1.8;
      add(d.normalize(), m, bvToRGB(bv));
    }
    // Faint background stars, crowded toward the galactic plane.
    const rnd = mulberry32(20260926);
    const n = quality === 'low' ? 4500 : quality === 'high' ? 11000 : 8000;
    const fromGal = this.toGal.clone().transpose();
    const g = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      let b;
      if (rnd() < 0.55) b = (rnd() < 0.5 ? -1 : 1) * -Math.log(1 - rnd() * 0.999) * 0.2;
      else b = Math.asin(rnd() * 2 - 1);
      b = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, b));
      const l = rnd() * Math.PI * 2;
      g.set(Math.cos(b) * Math.cos(l), Math.cos(b) * Math.sin(l), Math.sin(b)).applyMatrix3(fromGal);
      const lo = Math.pow(10, 0.5 * 3.2), hi = Math.pow(10, 0.5 * 7.4);
      const m = Math.log10(lo + rnd() * (hi - lo)) / 0.5;
      const t = rnd();
      const bv = t < 0.1 ? -0.2 + rnd() * 0.2 : t < 0.35 ? rnd() * 0.5 : t < 0.93 ? 0.55 + rnd() * 0.7 : 1.35 + rnd() * 0.5;
      add(g, m, bvToRGB(bv));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute('mag', new THREE.Float32BufferAttribute(mag, 1));
    this.starMat = new THREE.ShaderMaterial({
      vertexShader: STAR_V, fragmentShader: STAR_F,
      uniforms: { gain: { value: 1 }, px: { value: 1 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, this.starMat);
    this.points.frustumCulled = false;
    this.points.renderOrder = -10;
    this.group.add(this.points);

    // Constellation lines (only make sense near the Sun).
    const lp = [];
    if (sys.ly < 5) {
      for (const [, segs] of CONSTELLATIONS) {
        for (const [a, b] of segs) {
          if (!byName[a] || !byName[b]) continue;
          const A = byName[a].clone().multiplyScalar(SKY_R * 0.999), B = byName[b].clone().multiplyScalar(SKY_R * 0.999);
          lp.push(A.x, A.y, A.z, B.x, B.y, B.z);
        }
      }
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    this.lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x5f86c8, transparent: true, opacity: 0.32, depthWrite: false }));
    this.lines.frustumCulled = false;
    this.lines.renderOrder = -9;
    this.group.add(this.lines);
    this.constellationNames = [];
    if (sys.ly < 5) {
      for (const [name, segs] of CONSTELLATIONS) {
        const c = new THREE.Vector3();
        let k = 0;
        for (const [a, b] of segs) { if (byName[a]) { c.add(byName[a]); k++; } if (byName[b]) { c.add(byName[b]); k++; } }
        if (k) this.constellationNames.push({ name, dir: c.normalize() });
      }
    }
  }

  update(camera, fovDeg, dpr, showLines) {
    this.group.position.copy(camera.position);
    if (this.starMat) {
      const zoom = 65 / fovDeg;
      this.starMat.uniforms.gain.value = Math.min(40, zoom * zoom);
      this.starMat.uniforms.px.value = dpr;
    }
    if (this.lines) this.lines.visible = showLines;
  }

  dispose() {
    if (this.points) { this.points.geometry.dispose(); this.starMat.dispose(); this.group.remove(this.points); this.points = null; this.starMat = null; }
    if (this.lines) { this.lines.geometry.dispose(); this.lines.material.dispose(); this.group.remove(this.lines); this.lines = null; }
    if (this.cubeRT) { this.cubeRT.dispose(); this.cubeRT = null; }
  }
}
