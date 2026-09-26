/* Riftborn — shared 3D plumbing on top of three.js: one WebGL renderer that
   moves between the map, the AR view and the battle arena, image-based
   lighting for realistic shading, and small generated textures (glows,
   light beams, text labels). */
window.RB = window.RB || {};
(function (RB) {
  'use strict';

  const T = window.THREE;
  let renderer = null;
  const envs = new WeakMap();
  const cache = {};

  function supported() {
    if (!T) return false;
    try {
      const c = document.createElement('canvas');
      return !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch (e) {
      return false;
    }
  }

  function makeRenderer(opts) {
    const r = new T.WebGLRenderer(Object.assign({ antialias: true, alpha: true, powerPreference: 'high-performance' }, opts || {}));
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.outputColorSpace = T.SRGBColorSpace;
    r.toneMapping = T.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    return r;
  }

  // The main renderer. Its canvas is moved into whichever screen is active.
  function main() {
    if (!renderer) {
      renderer = makeRenderer();
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = T.PCFShadowMap;
      renderer.domElement.className = 'gl';
    }
    return renderer;
  }

  function attach(container) {
    const r = main();
    if (r.domElement.parentNode !== container) container.insertBefore(r.domElement, container.firstChild);
    fit();
    return r;
  }

  function fit() {
    const el = renderer && renderer.domElement.parentNode;
    if (!el) return;
    const w = el.clientWidth, h = el.clientHeight;
    const cur = renderer.getSize(new T.Vector2());
    if (cur.x !== w || cur.y !== h) renderer.setSize(w, h);
  }

  /* ------------------ Textures ------------------ */

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  function texture(c, srgb) {
    const t = new T.CanvasTexture(c);
    if (srgb !== false) t.colorSpace = T.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }

  // Soft round glow for sprites and particles.
  function glow() {
    if (cache.glow) return cache.glow;
    const c = canvas(128, 128), g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    return (cache.glow = texture(c));
  }

  // Vertical fade for light beams (bright at the bottom).
  function beam() {
    if (cache.beam) return cache.beam;
    const c = canvas(8, 256), g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 256, 0, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0.95)');
    gr.addColorStop(0.2, 'rgba(255,255,255,0.45)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 8, 256);
    return (cache.beam = texture(c));
  }

  // A glowing ring for ground markers.
  function ring() {
    if (cache.ring) return cache.ring;
    const c = canvas(256, 256), g = c.getContext('2d');
    const gr = g.createRadialGradient(128, 128, 60, 128, 128, 128);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.72, 'rgba(255,255,255,0.08)');
    gr.addColorStop(0.9, 'rgba(255,255,255,1)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 256);
    return (cache.ring = texture(c));
  }

  // A label sprite (Rift levels and the like).
  function label(text, color, size) {
    const c = canvas(128, 128), g = c.getContext('2d');
    g.fillStyle = 'rgba(10,6,20,0.85)';
    g.beginPath(); g.arc(64, 64, 54, 0, Math.PI * 2); g.fill();
    g.lineWidth = 8;
    g.strokeStyle = color;
    g.stroke();
    g.fillStyle = '#FFFFFF';
    g.font = `700 ${size || 64}px "Chakra Petch", system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 64, 68);
    const s = new T.Sprite(new T.SpriteMaterial({ map: texture(c), depthTest: false, transparent: true }));
    s.renderOrder = 10;
    return s;
  }

  function additive(color, map, opacity) {
    return new T.MeshBasicMaterial({
      color, map: map || null, transparent: true, opacity: opacity == null ? 1 : opacity,
      blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, toneMapped: false,
    });
  }

  function sprite(color, scale, opacity) {
    const s = new T.Sprite(new T.SpriteMaterial({ map: glow(), color, transparent: true, opacity: opacity == null ? 1 : opacity, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false }));
    s.scale.setScalar(scale);
    return s;
  }

  // A vertical gradient for scene backgrounds: [[stop, color], ...].
  function gradient(stops) {
    const c = canvas(4, 256), g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 256);
    for (const [k, col] of stops) gr.addColorStop(k, col);
    g.fillStyle = gr;
    g.fillRect(0, 0, 4, 256);
    return texture(c);
  }

  /* ------------------ Lighting ------------------ */

  // Image-based lighting from a generated sky, so skin and crystals pick up
  // soft reflections instead of looking flat.
  function environment(r) {
    if (envs.has(r)) return envs.get(r);
    const c = canvas(256, 128), g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, '#9FC6FF');
    gr.addColorStop(0.48, '#F2EEE6');
    gr.addColorStop(0.52, '#8C8577');
    gr.addColorStop(1, '#3B362F');
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 128);
    const sun = g.createRadialGradient(70, 30, 0, 70, 30, 30);
    sun.addColorStop(0, 'rgba(255,255,240,1)');
    sun.addColorStop(1, 'rgba(255,255,240,0)');
    g.fillStyle = sun;
    g.fillRect(0, 0, 256, 128);
    const tex = texture(c);
    tex.mapping = T.EquirectangularReflectionMapping;
    const pm = new T.PMREMGenerator(r);
    const env = pm.fromEquirectangular(tex).texture;
    tex.dispose();
    pm.dispose();
    envs.set(r, env);
    return env;
  }

  RB.gfx = {
    T,
    supported, makeRenderer, main, attach, fit,
    canvas, texture, glow, beam, ring, label, additive, sprite, gradient, environment,
  };
})(window.RB);
