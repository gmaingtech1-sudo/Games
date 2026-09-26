// The player's ship, drawn in its own little scene on top of the world so
// it stays sharp at any scale (the universe is huge, the ship is 30 m long).
import * as THREE from 'three';

const EXHAUST_V = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const EXHAUST_F = /* glsl */`
uniform float power;
uniform float time;
varying vec2 vUv;
void main() {
  float y = vUv.y;
  float flick = 0.85 + 0.15 * sin(time * 40.0 + y * 20.0);
  float a = pow(y, 2.2) * power * flick;
  vec3 col = mix(vec3(0.25, 0.45, 1.0), vec3(0.85, 0.95, 1.0), pow(y, 5.0));
  gl_FragColor = vec4(col * a * 2.2, 1.0);
}
`;

export class Ship {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.05, 500);
    this.group = new THREE.Group();
    this.scene.add(this.group);

    const hull = new THREE.MeshStandardMaterial({ color: 0xd9dee6, metalness: 0.55, roughness: 0.38 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a3140, metalness: 0.6, roughness: 0.5 });
    const accent = new THREE.MeshStandardMaterial({ color: 0xff7a2f, metalness: 0.3, roughness: 0.45, emissive: 0x221005 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x0c1c30, metalness: 0.9, roughness: 0.08, emissive: 0x0a2a4a, emissiveIntensity: 0.6 });

    // Fuselage: lathe profile, nose toward -Z.
    const prof = [];
    const pts = [[0, 0], [0.18, 0.25], [0.38, 0.8], [0.5, 1.5], [0.55, 2.4], [0.52, 3.2], [0.44, 3.7], [0.0, 3.72]];
    for (const [r, z] of pts) prof.push(new THREE.Vector2(r, z));
    const fus = new THREE.LatheGeometry(prof, 32);
    fus.rotateX(-Math.PI / 2);
    fus.translate(0, 0, 1.85);
    fus.scale(1, 0.72, 1);
    const body = new THREE.Mesh(fus, hull);
    this.group.add(body);

    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.32, 24, 16), glass);
    canopy.scale.set(0.95, 0.6, 2.2);
    canopy.position.set(0, 0.28, -0.35);
    this.group.add(canopy);

    // Swept wings
    const ws = new THREE.Shape();
    ws.moveTo(0, 0); ws.lineTo(2.1, 1.2); ws.lineTo(2.25, 1.75); ws.lineTo(0, 1.55); ws.lineTo(0, 0);
    const wg = new THREE.ExtrudeGeometry(ws, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2 });
    wg.rotateX(Math.PI / 2);
    for (const s of [1, -1]) {
      const w = new THREE.Mesh(wg, hull);
      w.scale.set(s, 1, 1);
      w.position.set(s * 0.35, -0.02, 0.1);
      w.rotation.z = s * -0.08;
      this.group.add(w);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.02, 0.12), accent);
      stripe.position.set(s * 1.55, 0.03, 1.35);
      stripe.rotation.y = s * -0.5;
      this.group.add(stripe);
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.7), hull);
      fin.position.set(s * 2.3, 0.18, 1.5);
      fin.rotation.x = -0.3;
      this.group.add(fin);
    }

    // Engines
    this.exhaust = [];
    const exMat = new THREE.ShaderMaterial({
      vertexShader: EXHAUST_V, fragmentShader: EXHAUST_F,
      uniforms: { power: { value: 0 }, time: { value: 0 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.exMat = exMat;
    for (const s of [1, -1]) {
      const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 1.6, 20), dark);
      pod.rotation.x = Math.PI / 2;
      pod.position.set(s * 0.75, 0.0, 2.3);
      this.group.add(pod);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.04, 8, 24), accent);
      ring.position.set(s * 0.75, 0.0, 3.1);
      this.group.add(ring);
      const cg = new THREE.CylinderGeometry(0.2, 0.02, 3.2, 16, 1, true);
      cg.translate(0, -1.6, 0);
      const cone = new THREE.Mesh(cg, exMat);
      cone.rotation.x = -Math.PI / 2;
      cone.position.set(s * 0.75, 0, 3.12);
      this.group.add(cone);
      this.exhaust.push(cone);
      const glow = new THREE.Mesh(new THREE.CircleGeometry(0.2, 20), new THREE.MeshBasicMaterial({ color: 0x9fc4ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.position.set(s * 0.75, 0, 3.12);
      this.group.add(glow);
      this.exhaust.push(glow);
    }

    // Navigation lights
    this.navLights = [];
    for (const [x, c] of [[2.25, 0x33ff66], [-2.25, 0xff3344]]) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: c }));
      l.position.set(x, 0.05, 1.75);
      this.group.add(l);
      this.navLights.push(l);
    }

    this.sun = new THREE.DirectionalLight(0xffffff, 3.2);
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.fill = new THREE.HemisphereLight(0x8fa8d8, 0x1a1410, 0.12);
    this.scene.add(this.fill);

    this.group.scale.setScalar(0.62);
    this.bank = 0; this.pitch = 0;
  }

  // sunDirView: direction to the star in camera space. lit: 0..1 (planet shadow).
  update(dt, t, opts) {
    const { aspect, fov, throttle, turnX, turnY, sunDirView, sunColor, lit } = opts;
    this.camera.aspect = aspect;
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
    this.bank += (THREE.MathUtils.clamp(-turnX * 6, -0.6, 0.6) - this.bank) * Math.min(1, dt * 4);
    this.pitch += (THREE.MathUtils.clamp(turnY * 3, -0.3, 0.3) - this.pitch) * Math.min(1, dt * 4);
    // Keep the ship a steady size on screen whatever the zoom or screen shape.
    const th = Math.tan(THREE.MathUtils.degToRad(fov) / 2);
    const frac = aspect < 1 ? 0.42 : 0.24;
    const dist = 2.9 / (2 * th * Math.min(aspect, 1.6) * frac);
    this.group.position.set(aspect > 1.3 ? -0.18 * dist * th * aspect : 0, -0.44 * dist * th, -dist);
    this.group.rotation.set(-0.02 + this.pitch, 0, this.bank);
    this.group.position.y += Math.sin(t * 1.3) * 0.01 * dist * th;
    this.sun.position.copy(sunDirView).multiplyScalar(20);
    this.sun.color.setRGB(sunColor[0], sunColor[1], sunColor[2]);
    this.sun.intensity = 3.2 * lit;
    this.exMat.uniforms.power.value = 0.25 + throttle * 1.2;
    this.exMat.uniforms.time.value = t;
    for (const e of this.exhaust) {
      if (e.geometry.type === 'CylinderGeometry') e.scale.set(1, 0.4 + throttle * 1.4, 1);
      else e.material.opacity = 0.4 + throttle * 0.6;
    }
    const blink = (t % 1.2) < 0.12;
    for (const l of this.navLights) l.visible = blink;
  }
}
