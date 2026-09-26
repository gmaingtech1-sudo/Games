/* Riftborn — the "AR" part of an encounter: the camera feed, where the phone
   is pointing, and the maths that maps between the real ground and the
   screen. Adapted from Pet Cam.

   The world is measured in meters around the player: x points east, y north,
   z up, the floor is z = 0 and the phone is held EYE meters above it. The
   phone's motion sensors (deviceorientation) give its rotation, so things
   placed on the floor stay put as you turn and tilt the phone. Walking around
   isn't tracked, only turning, which is enough to circle a creature.

   Without motion sensors (a laptop, or permission denied) you look around by
   dragging instead. Without a camera, a glowing rift plain is drawn instead. */
window.RB = window.RB || {};
(function (RB) {
  'use strict';

  const EYE = 1.4;                      // phone height above the ground (m)
  const LONG_FOV = 66 * Math.PI / 180;  // camera field of view across its long side
  const DEG = Math.PI / 180;

  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

  const view = {
    // Camera basis in world coordinates.
    right: [1, 0, 0],
    up: [0, 0, 1],
    fwd: [0, 1, 0],
    w: 1, h: 1, cx: 0.5, cy: 0.5, f: 500,
    mode: 'touch',        // 'sensor' | 'touch'
    camera: false,        // a live camera feed is showing
    yaw: 0,               // touch-mode look direction
    pitch: -10 * DEG,
  };

  let video = null;
  let stream = null;
  let sensorTarget = null;   // latest basis from the sensors, eased toward each frame
  let sensorSeen = false;

  /* ------------------ Camera ------------------ */

  async function startCamera(el) {
    video = el;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return { ok: false, reason: window.isSecureContext ? 'unsupported' : 'insecure' };
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
    } catch (e) {
      return { ok: false, reason: e && e.name === 'NotAllowedError' ? 'denied' : 'unavailable' };
    }
    video.srcObject = stream;
    video.hidden = false;
    await new Promise((res) => {
      if (video.readyState >= 1) res();
      else video.addEventListener('loadedmetadata', res, { once: true });
    });
    try { await video.play(); } catch (e) { /* autoplay is allowed for muted video; ignore */ }
    view.camera = true;
    resize(view.w, view.h);
    return { ok: true };
  }

  function stopCamera() {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    view.camera = false;
    if (video) { video.srcObject = null; video.hidden = true; }
  }

  // Turns the camera off while the app is in the background (so the
  // "camera in use" light goes out) and back on when it returns.
  let resumeCamera = false;
  function pauseCamera(paused) {
    if (paused && stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
      resumeCamera = true;
    } else if (!paused && resumeCamera && video) {
      resumeCamera = false;
      startCamera(video);
    }
  }

  /* ------------------ Motion sensors ------------------ */

  // iOS needs this called straight from a tap. Elsewhere it's a no-op.
  function requestSensorPermission() {
    const DOE = window.DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === 'function') {
      return DOE.requestPermission().catch(() => 'denied');
    }
    return Promise.resolve('granted');
  }

  function screenAngle() {
    const o = screen.orientation;
    if (o && typeof o.angle === 'number') return o.angle * DEG;
    return (window.orientation || 0) * DEG;
  }

  function onOrientation(e) {
    if (e.alpha == null || e.beta == null || e.gamma == null) return;
    sensorSeen = true;
    const a = e.alpha * DEG, b = e.beta * DEG, g = e.gamma * DEG;
    const ca = Math.cos(a), sa = Math.sin(a);
    const cb = Math.cos(b), sb = Math.sin(b);
    const cg = Math.cos(g), sg = Math.sin(g);
    // Device → world rotation, R = Rz(alpha) · Rx(beta) · Ry(gamma) (W3C spec).
    const R = [
      [ca * cg - sa * sb * sg, -sa * cb, ca * sg + sa * sb * cg],
      [sa * cg + ca * sb * sg, ca * cb, sa * sg - ca * sb * cg],
      [-cb * sg, sb, cb * cg],
    ];
    const apply = (v) => [dot(R[0], v), dot(R[1], v), dot(R[2], v)];
    // Screen axes in the device frame, accounting for landscape.
    const o = screenAngle();
    const co = Math.cos(o), so = Math.sin(o);
    sensorTarget = {
      right: apply([co, -so, 0]),
      up: apply([so, co, 0]),
      fwd: apply([0, 0, -1]),   // the rear camera looks out of the back
    };
  }

  // Resolves to true if the sensors start reporting within a moment.
  function startSensors() {
    window.addEventListener('deviceorientation', onOrientation);
    return new Promise((res) => {
      if (sensorSeen) { res(true); return; }
      let n = 0;
      const iv = setInterval(() => {
        if (sensorSeen || ++n > 12) {
          clearInterval(iv);
          view.mode = sensorSeen ? 'sensor' : 'touch';
          if (!sensorSeen) window.removeEventListener('deviceorientation', onOrientation);
          res(sensorSeen);
        }
      }, 100);
    });
  }

  // Touch look-around: drag to turn (dx, dy in pixels).
  function drag(dx, dy) {
    if (view.mode !== 'touch') return;
    view.yaw -= dx / view.f;
    view.pitch = Math.max(-80 * DEG, Math.min(45 * DEG, view.pitch + dy / view.f));
  }

  // Called once per frame: ease the camera basis toward its latest reading.
  function update(dt) {
    if (view.mode === 'sensor' && sensorTarget) {
      const k = 1 - Math.exp(-dt * 22);  // light smoothing, hides sensor jitter
      const right = norm(mix(view.right, sensorTarget.right, k));
      let up = mix(view.up, sensorTarget.up, k);
      up = norm([up[0] - right[0] * dot(up, right), up[1] - right[1] * dot(up, right), up[2] - right[2] * dot(up, right)]);
      view.right = right;
      view.up = up;
      view.fwd = cross(up, right);
    } else if (view.mode === 'touch') {
      const cy = Math.cos(view.yaw), sy = Math.sin(view.yaw);
      const cp = Math.cos(view.pitch), sp = Math.sin(view.pitch);
      view.fwd = [sy * cp, cy * cp, sp];
      view.right = [cy, -sy, 0];
      view.up = cross(view.right, view.fwd);
    }
  }

  function resize(w, h) {
    view.w = w;
    view.h = h;
    view.cx = w / 2;
    view.cy = h / 2;
    // The feed is scaled to cover the screen (object-fit: cover), so the
    // screen's focal length is the camera's, times that scale.
    let long = Math.max(w, h);
    if (view.camera && video && video.videoWidth) {
      const vw = video.videoWidth, vh = video.videoHeight;
      const scale = Math.max(w / vw, h / vh);
      long = Math.max(vw, vh) * scale;
    }
    view.f = (long / 2) / Math.tan(LONG_FOV / 2);
  }

  /* ------------------ Projection ------------------ */

  // World point [x, y, z] → screen { x, y, depth }, or null if behind you.
  function project(p) {
    const v = [p[0], p[1], p[2] - EYE];
    const depth = dot(v, view.fwd);
    if (depth < 0.08) return null;
    return {
      x: view.cx + view.f * dot(v, view.right) / depth,
      y: view.cy - view.f * dot(v, view.up) / depth,
      depth,
    };
  }

  // Direction of a world point on screen, even if it's behind you. For the
  // "the creature is over there" arrow.
  function screenDirection(p) {
    const v = [p[0], p[1], p[2] - EYE];
    return { x: dot(v, view.right), y: -dot(v, view.up), depth: dot(v, view.fwd) };
  }

  // Screen point → the floor spot under it, [x, y], or null if it's above
  // the horizon.
  function floorAt(sx, sy) {
    const dx = (sx - view.cx) / view.f;
    const dy = (sy - view.cy) / view.f;
    const d = [
      view.fwd[0] + dx * view.right[0] - dy * view.up[0],
      view.fwd[1] + dx * view.right[1] - dy * view.up[1],
      view.fwd[2] + dx * view.right[2] - dy * view.up[2],
    ];
    if (d[2] > -0.04) return null;
    const t = -EYE / d[2];
    return [d[0] * t, d[1] * t];
  }

  // Horizontal direction you're facing (unit [x, y]). Falls back to the
  // phone's top edge when it's pointing straight down.
  function heading() {
    let h = [view.fwd[0], view.fwd[1]];
    if (Math.hypot(h[0], h[1]) < 0.2) h = [view.up[0], view.up[1]];
    const l = Math.hypot(h[0], h[1]) || 1;
    return [h[0] / l, h[1] / l];
  }

  // A floor spot `dist` meters in front of you.
  function spotAhead(dist, side) {
    const h = heading();
    const s = side || 0;
    return [h[0] * dist + h[1] * s, h[1] * dist - h[0] * s];
  }

  /* ------------------ Rift plain (no camera) ------------------ */

  function drawBackdrop(ctx, t) {
    const { w, h } = view;
    const far = spotAhead(400);
    const hz = project([far[0], far[1], 0]);
    const horizonY = hz ? hz.y : (view.fwd[2] > 0 ? h * 2 : -1e4);
    const sky = ctx.createLinearGradient(0, horizonY - h, 0, horizonY);
    sky.addColorStop(0, '#07061A');
    sky.addColorStop(0.7, '#281446');
    sky.addColorStop(1, '#5A2A6E');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    // A few fixed stars, placed on a big sphere so they turn with you.
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    for (let i = 0; i < 90; i++) {
      const a = (i * 137.5) * DEG, e = ((i * 53) % 70 + 5) * DEG;
      const s = project([Math.cos(a) * Math.cos(e) * 300, Math.sin(a) * Math.cos(e) * 300, Math.sin(e) * 300 + EYE]);
      if (s && s.y < horizonY) ctx.fillRect(s.x, s.y, 1.6, 1.6);
    }
    const ground = ctx.createLinearGradient(0, Math.max(0, horizonY), 0, h);
    ground.addColorStop(0, '#1A0F2E');
    ground.addColorStop(1, '#0C0818');
    ctx.fillStyle = ground;
    ctx.fillRect(0, Math.max(0, horizonY), w, h);

    // Glowing ground grid, 2 m squares.
    ctx.strokeStyle = 'rgba(160, 110, 255, 0.28)';
    ctx.lineWidth = 1.2;
    const R = 30;
    const line = (a, b) => {
      ctx.beginPath();
      let pen = false;
      for (let i = 0; i <= 40; i++) {
        const k = i / 40;
        const s = project([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, 0]);
        if (!s) { pen = false; continue; }
        if (pen) ctx.lineTo(s.x, s.y); else ctx.moveTo(s.x, s.y);
        pen = true;
      }
      ctx.stroke();
    };
    for (let i = -R; i <= R; i += 2) {
      line([i, -R], [i, R]);
      line([-R, i], [R, i]);
    }
  }

  RB.ar = {
    EYE,
    view,
    startCamera,
    stopCamera,
    pauseCamera,
    requestSensorPermission,
    startSensors,
    drag,
    update,
    resize,
    project,
    screenDirection,
    floorAt,
    heading,
    spotAhead,
    drawBackdrop,
    get video() { return video; },
  };
})(window.RB);
