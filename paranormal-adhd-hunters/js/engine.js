/* ParanormalADHDhunters — renderer, scene, camera and the global lights. */
import * as THREE from 'three';

export class Engine {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.settings = settings;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: settings.quality !== 'low', powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = settings.quality !== 'low';
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x04050b);
    this.scene.fog = new THREE.FogExp2(0x070914, 0.055);
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.04, 260);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    // faint sky light so nothing is ever completely black
    this.hemi = new THREE.HemisphereLight(0x34407a, 0x0a0a14, 0.4);
    this.scene.add(this.hemi);
    // moonlight; its shadow is drawn once because nothing it lights moves
    this.moon = new THREE.DirectionalLight(0x8494ff, 0.75);
    this.moon.position.set(-30, 42, 62);
    this.moon.target.position.set(7, 0, 12);
    this.scene.add(this.moon, this.moon.target);
    if (this.renderer.shadowMap.enabled) {
      this.moon.castShadow = true;
      this.moon.shadow.mapSize.set(2048, 2048);
      this.moon.shadow.bias = -0.0008;
      this.moon.shadow.normalBias = 0.04;
      Object.assign(this.moon.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 160 });
      this.moon.shadow.camera.updateProjectionMatrix();
      this.moon.shadow.autoUpdate = false;
      this.moon.shadow.needsUpdate = true;
    } else {
      // without shadows the moon would shine through walls, so lean on the sky light instead
      this.moon.intensity = 0;
      this.hemi.intensity = 0.42;
    }

    // the investigator's chest torch
    this.torch = new THREE.SpotLight(0xfff0d8, 0, 14, 0.45, 0.55, 1.4);
    this.torch.position.set(0.12, -0.28, 0.05);
    this.torch.target.position.set(0, -0.05, -1);
    this.camera.add(this.torch, this.torch.target);
    if (this.renderer.shadowMap.enabled) {
      this.torch.castShadow = true;
      const s = settings.quality === 'high' ? 1024 : 512;
      this.torch.shadow.mapSize.set(s, s);
      this.torch.shadow.bias = -0.0006;
      this.torch.shadow.normalBias = 0.02;
      this.torch.shadow.camera.near = 0.2;
      this.torch.shadow.camera.far = 16;
    }
    // a soft glow right around you, so the near floor is readable with the torch off
    this.aura = new THREE.PointLight(0x8a9cff, 0.25, 2.6, 2);
    this.aura.position.set(0, -0.3, 0);
    this.camera.add(this.aura);

    this.flash = new THREE.PointLight(0xe8f0ff, 0, 12, 1.5);
    this.camera.add(this.flash);

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  pixelRatio() {
    const dpr = window.devicePixelRatio || 1;
    const q = this.settings.quality;
    return q === 'low' ? Math.min(dpr, 1) * 0.85 : q === 'high' ? Math.min(dpr, 2) : Math.min(dpr, 1.5);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setPixelRatio(this.pixelRatio());
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // keep a comfortable horizontal view in portrait without going fish-eye
    const hfov = 78 * Math.PI / 180;
    let vfov = 2 * Math.atan(Math.tan(hfov / 2) / this.camera.aspect) * 180 / Math.PI;
    vfov = Math.max(58, Math.min(vfov, 92));
    this.camera.fov = vfov;
    this.camera.updateProjectionMatrix();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
