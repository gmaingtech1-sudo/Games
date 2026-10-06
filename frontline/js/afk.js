/* Frontline — AFK mode. While it's on, your soldier fights by himself: he
   follows the objective around walls, shoots whatever he has a clear shot at,
   grenades nests and tanks, swaps to the bazooka for armour, dodges grenades
   and tank shells, falls back to heal, and picks up ammo and medkits.
   Touch a stick or press a key and you're back in control for that moment. */
(function (FL) {
  'use strict';

  const U = FL.util;
  const D = FL.data;
  const { clamp, rand, dist, angleTo, angleDiff } = U;
  const GRENADE_R = 115;

  const S = {
    field: null,
    world: null,
    flowT: 0,
    seeT: 0,
    target: null,
    clear: false,
    grenT: 2,
    stuckT: 0,
    jinkT: 0,
    jinkA: 0,
    lastX: 0,
    lastY: 0,
    strafe: 1,
    strafeT: 0,
  };

  function reset() {
    S.field = null;
    S.world = null;
    S.target = null;
  }

  function nearest(list, x, y, maxD) {
    let best = null;
    let bd = maxD || Infinity;
    for (const o of list) {
      const d = dist(x, y, o.x, o.y);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  // Where the mission wants us to go next.
  function goal(G) {
    const o = G.mission.objectives[G.objIndex];
    if (!o) return null;
    const p = G.player;
    if (o.type === 'reach' || o.type === 'hold') return G.zones[o.zone];
    const alive = G.enemies.filter((e) => !e.dead && (o.type !== 'destroy' || e.tag === o.tag));
    if (o.type === 'survive' && !alive.length) return { x: 1000, y: 1000 };
    if (o.type === 'base' && !alive.length) return { x: G.base.hqX, y: G.base.hq.y + G.base.hq.h + 30 };
    return nearest(alive, p.x, p.y);
  }

  function control(G, input, dt) {
    const p = G.player;
    const W = G.world;
    if (p.dead || G.ended) {
      input.move.x = 0;
      input.move.y = 0;
      input.firing = false;
      return;
    }
    if (S.world !== W) {
      S.world = W;
      S.field = W.makeField();
      S.flowT = 0;
    }
    const o = G.mission.objectives[G.objIndex];
    const wNow = p.weapons[p.cur];
    const prim = p.weapons[0];
    const sec = p.weapons[1];
    const hasRockets = sec.id === 'bazooka' && sec.mag + sec.reserve > 0;

    /* ---- Pick a target ---- */
    S.seeT -= dt;
    if (S.seeT <= 0 || (S.target && S.target.dead)) {
      S.seeT = 0.15;
      S.target = null;
      S.clear = false;
      let best = Infinity;
      for (const e of G.enemies) {
        if (e.dead || !e.canSee) continue;
        const d = dist(p.x, p.y, e.x, e.y);
        if (d > 760) continue;
        const clear = W.clearShot(p.x, p.y, e.x, e.y);
        // Prefer things we can actually hit, then whatever's closest or most dangerous.
        let score = d - (clear ? 400 : 0) - (e.tele > 0 || e.cannonTele > 0 ? 250 : 0);
        if (e.def.tank && !hasRockets) score += 300;
        if (score < best) { best = score; S.target = e; S.clear = clear; }
      }
    }
    const t = S.target;
    const td = t ? dist(p.x, p.y, t.x, t.y) : Infinity;

    /* ---- Weapon choice ---- */
    let want = 0;
    if (t && (t.def.tank || (t.def.static && td < 500)) && hasRockets) want = 1;
    if (prim.mag + (prim.reserve === Infinity ? 1 : prim.reserve) <= 0) want = 1;
    if (p.cur !== want) input.actions.add(want ? 'slot1' : 'slot0');

    /* ---- Aim & fire ---- */
    input.firing = false;
    if (t) {
      const sp = D.WEAPONS[wNow.id].speed || 1000;
      const lead = td / sp;
      const ex = t.x + (t.def.tank ? 0 : (t.x - (t.px != null ? t.px : t.x)) / Math.max(dt, 1e-3) * lead * 0.5);
      const ey = t.y + (t.def.tank ? 0 : (t.y - (t.py != null ? t.py : t.y)) / Math.max(dt, 1e-3) * lead * 0.5);
      input.aimAngle = angleTo(p.x, p.y, ex, ey);
      const W0 = D.WEAPONS[wNow.id];
      const inRange = td < W0.range * (W0.rocket ? 1 : 0.95);
      if (S.clear && inRange && Math.abs(angleDiff(p.a, input.aimAngle)) < 0.15) {
        // Don't blow ourselves up with a rocket at point-blank range.
        if (!(W0.rocket && td < 140)) input.firing = true;
      }
    }
    for (const e of G.enemies) { e.px = e.x; e.py = e.y; }

    // Reload in the lulls.
    if (!t && wNow.mag < D.WEAPONS[wNow.id].mag * 0.6 && wNow.reserve > 0) input.actions.add('reload');

    /* ---- Grenades & artillery ---- */
    S.grenT -= dt;
    if (S.grenT <= 0 && p.grenades > 0 && t && td > 110 && td < 380) {
      let crowd = 0;
      for (const e of G.enemies) if (!e.dead && dist(e.x, e.y, t.x, t.y) < 110) crowd++;
      const worth = t.def.static || t.def.tank || crowd >= 3 || (!S.clear && t.canSee);
      if (worth && Math.abs(angleDiff(p.a, angleTo(p.x, p.y, t.x, t.y))) < 0.25) {
        input.actions.add('grenade');
        S.grenT = rand(3.5, 6);
      }
    }
    if (p.art >= 1) {
      const seen = G.enemies.filter((e) => !e.dead && e.canSee && dist(p.x, p.y, e.x, e.y) > 340);
      if (seen.length >= 3 || seen.some((e) => e.def.tank)) input.actions.add('artillery');
    }

    /* ---- Pick up weapons worth having ---- */
    if (G.nearWeapon) {
      const k = D.WEAPONS[G.nearWeapon.weapon];
      if ((G.nearWeapon.weapon === 'bazooka' && sec.id !== 'bazooka') ||
        (k.slot === 'primary' && prim.mag + prim.reserve < D.WEAPONS[prim.id].mag)) input.actions.add('take');
    }

    /* ---- Where to walk ---- */
    let mx = 0;
    let my = 0;
    let dest = null;
    let urgent = null;

    // 1. Get away from grenades and incoming tank shells.
    for (const gr of G.grenades) {
      const d = dist(gr.x, gr.y, p.x, p.y);
      if (gr.owner !== 'p' || gr.z < 10) {
        if (d < GRENADE_R + 30 && gr.fuse < 2.4) urgent = angleTo(gr.x, gr.y, p.x, p.y);
      }
    }
    for (const e of G.enemies) {
      if (e.dead || !(e.cannonTele > 0) || !e.teleTarget) continue;
      const d = dist(e.teleTarget.x, e.teleTarget.y, p.x, p.y);
      if (d < e.def.cannon.splash + 30) {
        // Sidestep across the line of fire.
        const a = angleTo(e.x, e.y, p.x, p.y);
        urgent = a + (Math.PI / 2) * S.strafe;
      }
    }

    // Stay out of our own artillery.
    for (const s of G.strikes) {
      if (dist(s.x, s.y, p.x, p.y) < 190) urgent = angleTo(s.x, s.y, p.x, p.y);
    }

    // 2. Hurt: fall back from whoever's shooting, towards a medkit if there's one about.
    const medkits = G.pickups.filter((k) => k.kind === 'medkit');
    const ammo = G.pickups.filter((k) => k.kind === 'ammo' || (k.kind === 'grenade' && p.grenades < 3));
    // A machine gun or tank with a line on us: don't push on while hurt.
    const heavy = G.enemies.find((e) => !e.dead && (e.def.static || e.def.tank) && e.canHit && dist(e.x, e.y, p.x, p.y) < e.def.range);
    if (!urgent && heavy && p.hp < 65) urgent = angleTo(heavy.x, heavy.y, p.x, p.y);
    if (!urgent && p.hp < 40) {
      const mk = nearest(medkits, p.x, p.y, 450);
      if (mk) dest = mk;
      else if (t) urgent = angleTo(t.x, t.y, p.x, p.y);
    }

    // 3. Running low and nothing close by: fetch supplies.
    if (!urgent && !dest && (!t || td > 260)) {
      const low = p.weapons.some((w) => w.reserve !== Infinity && w.reserve < D.WEAPONS[w.id].reserve * 0.3) || p.grenades < 2;
      if (p.hp < 70) dest = nearest(medkits, p.x, p.y, 380);
      if (!dest && low) dest = nearest(ammo, p.x, p.y, 450);
      if (!dest && G.nearWeapon == null) {
        const gun = G.pickups.find((k) => k.kind === 'weapon' && k.weapon === 'bazooka' && sec.id !== 'bazooka');
        if (gun && dist(gun.x, gun.y, p.x, p.y) < 700) dest = gun;
      }
    }

    // 4. Otherwise, the objective — but hold ground in a close firefight.
    let holdStill = false;
    if (!urgent && !dest) {
      const g = goal(G);
      if (g) {
        const gd = dist(p.x, p.y, g.x, g.y);
        if (o && o.type === 'hold') {
          if (gd > 60) dest = g;
          else holdStill = true;
        } else if (o && (o.type === 'reach')) {
          dest = g;
        } else {
          dest = g;
          // Close enough to the enemy we're hunting and able to hit it: stop and shoot.
          const keep = g.def && g.def.tank ? (hasRockets ? 220 : 320) : 170;
          if (g === t && S.clear && gd < keep + 120) holdStill = true;
          if (g.def && g.def.tank && !hasRockets && gd < keep) urgent = angleTo(g.x, g.y, p.x, p.y);
        }
        // Anyone we can hit gets dealt with before we move on.
        const W0 = D.WEAPONS[wNow.id];
        if (t && S.clear && td < W0.range * 0.85 && !(t.def.tank && !hasRockets)) holdStill = true;
      }
    }

    if (urgent != null) {
      mx = Math.cos(urgent);
      my = Math.sin(urgent);
    } else if (holdStill) {
      // Shuffle side to side so we're harder to hit.
      S.strafeT -= dt;
      if (S.strafeT <= 0) { S.strafeT = rand(0.6, 1.6); S.strafe = U.chance(0.25) ? 0 : U.chance(0.5) ? 1 : -1; }
      if (t && S.strafe) {
        const a = angleTo(p.x, p.y, t.x, t.y) + (Math.PI / 2) * S.strafe;
        mx = Math.cos(a) * 0.6;
        my = Math.sin(a) * 0.6;
      }
    } else if (dest) {
      S.flowT -= dt;
      if (S.flowT <= 0 || S.dest !== dest) {
        S.flowT = 0.3;
        S.dest = dest;
        W.updateFlow(dest.x, dest.y, S.field);
      }
      let a = dist(p.x, p.y, dest.x, dest.y) < 40 ? angleTo(p.x, p.y, dest.x, dest.y) : W.flowDir(p.x, p.y, S.field);
      if (a == null) a = angleTo(p.x, p.y, dest.x, dest.y);
      mx = Math.cos(a);
      my = Math.sin(a);
    }

    // Unstick: if we've been pushing without moving, jink sideways for a moment.
    const moved = dist(p.x, p.y, S.lastX, S.lastY);
    S.lastX = p.x;
    S.lastY = p.y;
    if ((mx || my) && moved < 0.4) S.stuckT += dt; else S.stuckT = Math.max(0, S.stuckT - dt);
    if (S.stuckT > 0.8) { S.stuckT = 0; S.jinkT = 0.6; S.jinkA = Math.atan2(my, mx) + (U.chance(0.5) ? 1.6 : -1.6); }
    if (S.jinkT > 0) {
      S.jinkT -= dt;
      mx = Math.cos(S.jinkA);
      my = Math.sin(S.jinkA);
    }

    input.move.x = clamp(mx, -1, 1);
    input.move.y = clamp(my, -1, 1);
    if (!t && (mx || my)) input.aimAngle = Math.atan2(my, mx);
  }

  FL.afk = { control, reset };
})(window.FL);
