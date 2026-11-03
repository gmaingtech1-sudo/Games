// BODY.OS — third-person player: axis-separated AABB collision with step-up, gravity and
// jumping driven by BODY.OS stats, crate pushing, a procedural avatar and an orbiting
// camera that pulls in front of walls instead of clipping through them.
import * as THREE from 'three';
import { G, notify } from './core.js';
import { Body, Vitals, Environment, Reality, setFlag, hasFlag } from './systems.js';
import { W, M, lit, mesh, box, raycast, visionTarget } from './world.js';
import { input } from './input.js';
import { sfx } from './audio.js';

const RADIUS = 0.35, HEIGHT = 1.8, STEP = 0.36, BASE_G = 20, COYOTE = 0.12, BUFFER = 0.15, EPS = 0.001;

export function createPlayer(x, y, z, yaw) {
  const p = {
    pos: new THREE.Vector3(x, y, z), vel: new THREE.Vector3(), vy: 0, yaw, grounded: false, coyote: 0,
    safePos: new THREE.Vector3(x, y, z), spawn: new THREE.Vector3(x, y, z), step: 0, pushCool: 0,
    camYaw: yaw, camPitch: 0.24, camDist: 4.2, pivot: new THREE.Vector3(x, y + 1.55, z),
    avatar: buildAvatar(), cycle: 0,
  };
  W.root.add(p.avatar.root);
  p.teleport = (nx, ny, nz, nyaw) => {
    p.pos.set(nx, ny, nz); p.vel.set(0, 0, 0); p.vy = 0; p.yaw = nyaw; p.camYaw = nyaw;
    p.safePos.copy(p.pos); p.pivot.set(nx, ny + 1.55, nz); p.camDist = 4.2;
  };
  p.knockback = (kx, ky, kz) => { p.vel.set(kx, 0, kz); p.vy = Math.max(p.vy, ky); p.grounded = false; };
  p.update = (dt) => updatePlayer(p, dt);
  p.updateCamera = (dt) => updateCamera(p, dt);
  return p;
}

// ---------------------------------------------------------------- Collision
function overlaps(x, y, z, c) {
  return x - RADIUS < c.x1 && x + RADIUS > c.x0 && y + EPS < c.y1 && y + HEIGHT > c.y0 && z - RADIUS < c.z1 && z + RADIUS > c.z0;
}
function firstHit(x, y, z) {
  for (const c of W.colliders) if (c.on && overlaps(x, y, z, c)) return c;
  return null;
}

/** Moves along one horizontal axis, stepping up low ledges and stopping at walls. */
function moveAxis(p, axis, d) {
  if (d === 0) return null;
  const nx = axis === 'x' ? p.pos.x + d : p.pos.x, nz = axis === 'z' ? p.pos.z + d : p.pos.z;
  const c = firstHit(nx, p.pos.y, nz);
  if (!c) { p.pos.x = nx; p.pos.z = nz; return null; }
  // Step up onto low obstacles (stairs, thresholds) while grounded.
  const rise = c.y1 - p.pos.y;
  if (p.grounded && rise > 0 && rise <= STEP && !firstHit(nx, c.y1 + EPS, nz)) { p.pos.set(nx, c.y1 + EPS, nz); return null; }
  if (axis === 'x') p.pos.x = d > 0 ? c.x0 - RADIUS - EPS : c.x1 + RADIUS + EPS;
  else p.pos.z = d > 0 ? c.z0 - RADIUS - EPS : c.z1 + RADIUS + EPS;
  // If resolving put us inside something else (corners), stay where we were.
  if (firstHit(p.pos.x, p.pos.y, p.pos.z)) { if (axis === 'x') p.pos.x = nx - d; else p.pos.z = nz - d; }
  return c;
}

function moveVertical(p, d) {
  const ny = p.pos.y + d;
  let landed = false;
  for (const c of W.colliders) {
    if (!c.on || !overlaps(p.pos.x, ny, p.pos.z, c)) continue;
    if (d <= 0 && p.pos.y >= c.y1 - 0.05) { p.pos.y = c.y1; landed = true; p.vy = 0; return true; }
    if (d > 0) { p.pos.y = c.y0 - HEIGHT - EPS; p.vy = 0; return false; }
  }
  p.pos.y = ny;
  return landed;
}

// ---------------------------------------------------------------- Movement
function updatePlayer(p, dt) {
  // Camera-relative input. forward = (sin yaw, cos yaw); right = (-cos yaw, sin yaw).
  const m = input.move;
  const fx = Math.sin(p.camYaw), fz = Math.cos(p.camYaw);
  let wx = fx * m.y - fz * m.x, wz = fz * m.y + fx * m.x;
  const mag = Math.min(1, Math.hypot(wx, wz));
  if (mag > 0.001) { const l = Math.hypot(wx, wz); wx /= l; wz /= l; }
  const speed = Body.moveSpeed * Vitals.speedMult * Environment.speedMult;
  const accel = p.grounded ? 12 : 4, k = 1 - Math.exp(-accel * dt);
  p.vel.x += (wx * speed * mag - p.vel.x) * k;
  p.vel.z += (wz * speed * mag - p.vel.z) * k;

  const gravity = BASE_G * Math.max(0.05, Environment.cond.gravity) * Reality.gravityMult;
  if (p.grounded) { p.coyote = COYOTE; if (p.vy < 0) p.vy = -2; } else p.coyote -= dt;
  if (input.consumeJump(BUFFER) && p.coyote > 0) {
    // BODY.OS jump height is defined at standard gravity, so low gravity (zones or the
    // Reduced Gravity ability) naturally lets you jump higher.
    p.vy = Math.sqrt(2 * BASE_G * Body.jumpHeight);
    p.coyote = 0; p.grounded = false;
    input.clearJump();
    Vitals.addEnergy(-0.4 * Body.consumption);
    sfx('jump');
    setFlag('jumped');
  }
  p.vy = Math.max(p.vy - gravity * dt, -40);

  const drift = Environment.cond.drift || [0, 0];
  const dx = (p.vel.x + drift[0]) * dt, dz = (p.vel.z + drift[1]) * dt, dy = p.vy * dt;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz), Math.abs(dy)) / 0.15));
  const wasGrounded = p.grounded;
  let grounded = false, hit = null;
  for (let i = 0; i < steps; i++) {
    hit = moveAxis(p, 'x', dx / steps) || hit;
    hit = moveAxis(p, 'z', dz / steps) || hit;
    grounded = moveVertical(p, dy / steps) || grounded;
  }
  // Stick to the ground when walking off tiny edges.
  if (!grounded && wasGrounded && p.vy <= 0) {
    const save = p.pos.y;
    if (!moveVertical(p, -0.12)) p.pos.y = save; else grounded = true;
  }
  if (grounded && !wasGrounded && dy < -0.05) sfx('land');
  p.grounded = grounded;

  // Pushing crates (Strength vs mass class).
  if (p.pushCool > 0) p.pushCool -= dt;
  if (hit && hit.crate && mag > 0.1) {
    const why = hit.crate.push(wx, wz, Math.hypot(p.vel.x, p.vel.z) + 1, dt);
    if (why && p.pushCool <= 0) { p.pushCool = 3; notify(why, 'warning'); }
  }

  const planar = Math.hypot(p.vel.x, p.vel.z);
  if (planar > 0.2) {
    const target = Math.atan2(p.vel.x, p.vel.z);
    let d = target - p.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    p.yaw += Math.sign(d) * Math.min(Math.abs(d), 12 * dt);
  }
  Vitals.moving = planar > 0.5 && mag > 0.05;
  if (p.grounded && !Environment.damaging) p.safePos.copy(p.pos);
  if (!hasFlag('moved') && p.pos.distanceToSquared(p.spawn) > 9) setFlag('moved');
  if (p.grounded && planar > 0.5) { p.step += planar * dt; if (p.step > 2.1) { p.step = 0; sfx('step'); } }
  if (p.pos.y < -15) { p.teleport(p.safePos.x, p.safePos.y + 0.2, p.safePos.z, p.yaw); Vitals.damage(10, 'fall'); }
  animateAvatar(p, planar, dt);
}

// ---------------------------------------------------------------- Camera
function updateCamera(p, dt) {
  const look = input.consumeLook();
  const sens = 0.0045 * (G.settings ? G.settings.camSens : 1);
  p.camYaw -= look.x * sens;
  p.camPitch += (G.settings && G.settings.invert ? -1 : 1) * look.y * sens;
  p.camPitch = Math.max(-0.6, Math.min(1.1, p.camPitch));
  const k = 1 - Math.exp(-18 * dt);
  p.pivot.x += (p.pos.x - p.pivot.x) * k;
  p.pivot.y += (p.pos.y + 1.55 - p.pivot.y) * k;
  p.pivot.z += (p.pos.z - p.pivot.z) * k;
  const cp = Math.cos(p.camPitch), sp = Math.sin(p.camPitch);
  // Direction from pivot to camera (behind and above), with a small shoulder offset to the right.
  const fx = Math.sin(p.camYaw), fz = Math.cos(p.camYaw);
  let dx = -fx * cp - fz * 0.08, dy = sp, dz = -fz * cp + fx * 0.08;
  const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
  const allowed = Math.max(0.5, raycast(p.pivot.x, p.pivot.y, p.pivot.z, dx, dy, dz, 4.2, 0.22) - 0.08);
  p.camDist = allowed < p.camDist ? allowed : Math.min(allowed, p.camDist + 5 * dt);
  const cam = W.camera;
  cam.position.set(p.pivot.x + dx * p.camDist, p.pivot.y + dy * p.camDist, p.pivot.z + dz * p.camDist);
  cam.lookAt(p.pivot.x, p.pivot.y, p.pivot.z);
}

// ---------------------------------------------------------------- Avatar
function buildAvatar() {
  const root = new THREE.Group();
  const suit = lit('suit', 0x33383f), plate = lit('plate', 0xbfc8d4);
  const visor = lit('visor', 0x0d4d66, { emissive: 0x1ae6ff, ei: 1.4 });
  const coreMat = M.cyan.clone();
  const hips = new THREE.Group(); hips.position.y = 0.95; root.add(hips);
  const torso = mesh(hips, 'capsule', 0, 0.38, 0, 0.52, 0.32, 0.34, suit);
  mesh(torso, 'sphere', 0, 0.3, 0.32, 0.8, 0.7, 0.35, plate);
  box(torso, 0, 0.15, -0.55, 0.7, 0.9, 0.4, suit, { collide: false, env: false });
  mesh(torso, 'sphere', 0, 0.2, -0.78, 0.3, 0.3, 0.12, coreMat);
  const head = mesh(hips, 'sphere', 0, 0.92, 0, 0.36, 0.38, 0.38, plate);
  box(head, 0, 0.05, 0.38, 0.8, 0.35, 0.3, visor, { collide: false, env: false });
  const limb = (x, y, len, w) => {
    const pv = new THREE.Group(); pv.position.set(x, y, 0); hips.add(pv);
    mesh(pv, 'capsule', 0, -len / 2, 0, w, len / 2.2, w, suit);
    return pv;
  };
  const a = { root, hips, torso, coreMat, armL: limb(-0.34, 0.68, 0.62, 0.13), armR: limb(0.34, 0.68, 0.62, 0.13), legL: limb(-0.13, 0, 0.9, 0.17), legR: limb(0.13, 0, 0.9, 0.17) };
  visionTarget(root, { env: false, heat: 0.75 });
  return a;
}

function animateAvatar(p, speed, dt) {
  const a = p.avatar, amt = Math.min(1, speed / 5);
  if (p.grounded) p.cycle += dt * (4 + speed * 1.4);
  const sw = p.grounded ? Math.sin(p.cycle) * 0.66 * amt : 0.3;
  a.legL.rotation.x = sw; a.legR.rotation.x = p.grounded ? -sw : -0.2;
  a.armL.rotation.x = -sw * 0.8; a.armR.rotation.x = sw * 0.8;
  a.armL.rotation.z = p.grounded ? 0.1 : 0.5; a.armR.rotation.z = p.grounded ? -0.1 : -0.5;
  a.hips.position.y = 0.95 + (p.grounded ? Math.abs(Math.sin(p.cycle)) * 0.05 * amt : 0);
  a.torso.rotation.x = amt * 0.14;
  a.root.position.copy(p.pos);
  a.root.rotation.y = p.yaw;
  const e = Vitals.fraction;
  a.coreMat.emissive.set(e < 0.2 ? 0xffb326 : 0x1ae6ff);
  a.coreMat.emissiveIntensity = 0.5 + 1.2 * e;
}
