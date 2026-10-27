/* Eight-Ball — the table in 3D, drawn with three.js (lib/three.min.js).

   One unit is a millimetre, as in the physics. The physics' x runs across
   the table and y down it; here X = x, Z = y and Y is up, with the bed of
   the table at Y = 0. Everything is built from the same shapes the physics
   uses (the cushions, jaws and pocket cuts), so what you see is what the
   balls bounce off.

   A pub lamp hangs over the table with three shades. Each is a spotlight
   that casts shadows, and the lamp is also the reflection you see in the
   glossy balls. The camera can stand behind the cue ball like a player,
   look over the whole table, or look straight down. */
(function (EB) {
  'use strict';

  const T = window.THREE;
  const { TABLE, kind, phys } = EB;
  const { W, L, R, D, J, BAULK, SPOT, pockets, cushions } = TABLE;

  const RAIL = 104;
  const RAIL_TOP = 44;
  const CUSH_TOP = 38;
  const SLATE = 26;
  const FLOOR = -760;
  const LAMP_Y = 900;
  const LAMP_Z = [L * 0.2, L * 0.5, L * 0.8];
  const CUE_LEN = 1450;
  const VIEWS = ['player', 'overhead', 'top'];
  const VIEW_NAMES = {
    player: 'Player view: drag sideways to aim, pull down to draw the cue back and let go to strike.',
    overhead: 'Overhead view: touch where you want to aim.',
    top: 'Top view: touch where you want to aim.',
  };

  const COL = { red: 0xB0101E, yellow: 0xE8AE08, black: 0x0B0B0D, cue: 0xF1ECDD };

  let canvas = null;
  let renderer = null;
  let scene = null;
  let camera = null;
  let cw = 1;
  let ch = 1;
  let land = false;
  let view = 'player';
  let lastNow = 0;
  let snap = true;
  const camPos = new T.Vector3();
  const camLook = new T.Vector3();
  const balls = [];
  const contact = [];
  let cue = null;
  let lamp = null;
  let quality = 'high';
  const spots = [];
  let slowCheck = { n: 0, sum: 0 };
  let onSlow = null;
  const fx = {};

  /* ---------- Small helpers ---------- */

  const v3 = (x, y, z) => new T.Vector3(x, y, z);

  function seeded(seed) {
    let s = seed;
    return () => ((s = (s * 16807) % 2147483647) / 2147483647);
  }

  // A flat outline in table coordinates ([x, y] points) as a three.js Shape.
  // y is negated so that, laid flat by slab(), it lands at Z = y.
  function shape(pts) {
    const s = new T.Shape();
    pts.forEach(([x, y], i) => (i ? s.lineTo(x, -y) : s.moveTo(x, -y)));
    s.closePath();
    return s;
  }

  // Extrude an outline into a solid from `bottom` to `top`.
  function slab(pts, bottom, top, mats) {
    const g = new T.ExtrudeGeometry(shape(pts), { depth: top - bottom, bevelEnabled: false, curveSegments: 1 });
    g.rotateX(-Math.PI / 2);
    g.translate(0, bottom, 0);
    const m = new T.Mesh(g, mats);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  // A slab with its edges rounded over by r, keeping the outline exactly
  // where it is at mid-height (so a cushion's nose stays where the balls
  // bounce off it).
  function rounded(src, bottom, top, r, mats) {
    const g = new T.ExtrudeGeometry(src, {
      depth: top - bottom - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: r,
      bevelOffset: -r, bevelSegments: 4, curveSegments: 1,
    });
    g.rotateX(-Math.PI / 2);
    g.translate(0, bottom + r, 0);
    const m = new T.Mesh(g, mats);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  function flat(pts, y, mat) {
    const g = new T.ShapeGeometry(shape(pts));
    g.rotateX(-Math.PI / 2);
    g.translate(0, y, 0);
    const m = new T.Mesh(g, mat);
    m.receiveShadow = true;
    return m;
  }

  function circlePts(cx, cy, r, n = 48) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    return out;
  }

  function canvasTex(w, h, paint, repeat) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    paint(c.getContext('2d'), w, h);
    const t = new T.CanvasTexture(c);
    t.colorSpace = T.SRGBColorSpace;
    if (repeat) {
      t.wrapS = t.wrapT = T.RepeatWrapping;
      t.repeat.set(repeat[0], repeat[1]);
    }
    t.anisotropy = 4;
    return t;
  }

  /* ---------- Textures ---------- */

  // Worsted cloth: an even, fine weave.
  function clothTexture() {
    return canvasTex(256, 256, (c, w, h) => {
      const img = c.createImageData(w, h);
      const rnd = seeded(11);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = 222 + rnd() * 33;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      c.putImageData(img, 0, 0);
    }, [1 / 90, 1 / 90]);
  }

  // Hardwood with the grain running along u.
  function woodTexture(seed) {
    return canvasTex(1024, 256, (c, w, h) => {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#5A2A12');
      g.addColorStop(0.5, '#6E3618');
      g.addColorStop(1, '#5A2A12');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      const rnd = seeded(seed);
      for (let k = 0; k < 140; k++) {
        const base = rnd() * h;
        const amp = 1 + rnd() * 5;
        const fq = 0.004 + rnd() * 0.012;
        const ph = rnd() * 6;
        c.strokeStyle = rnd() < 0.7 ? `rgba(35,12,3,${0.1 + rnd() * 0.25})` : `rgba(170,95,50,${0.08 + rnd() * 0.15})`;
        c.lineWidth = 0.6 + rnd() * 2.6;
        c.beginPath();
        for (let x = 0; x <= w; x += 16) {
          const y = base + Math.sin(x * fq + ph) * amp + Math.sin(x * fq * 3.3 + ph) * amp * 0.3;
          x ? c.lineTo(x, y) : c.moveTo(x, y);
        }
        c.stroke();
      }
    }, [1 / 1000, 1 / 240]);
  }

  // A ball's surface, wrapped round the sphere (longitude across, latitude
  // down). Markings sit on the equator, where the wrap doesn't stretch them.
  function ballTexture(id) {
    const t = kind(id);
    return canvasTex(512, 256, (c, w, h) => {
      const hex = '#' + COL[t].toString(16).padStart(6, '0');
      c.fillStyle = hex;
      c.fillRect(0, 0, w, h);
      const px = h / Math.PI;           // pixels per radian
      if (t === 'black') {
        for (const lon of [0.25, 0.75]) {
          const x = lon * w;
          c.fillStyle = '#F4F0E4';
          c.beginPath();
          c.ellipse(x, h / 2, 0.47 * px, 0.47 * px, 0, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = '#111';
          c.font = `700 ${0.62 * px}px Arial, Helvetica, sans-serif`;
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.fillText('8', x, h / 2 + 2);
        }
      } else if (t === 'cue') {
        c.fillStyle = '#C9182B';
        for (const [lon, lat] of [[0, 0], [0.5, 0], [0.25, 0.9], [0.75, -0.9]]) {
          c.beginPath();
          c.arc(lon * w, h / 2 - lat * px, 0.13 * px, 0, Math.PI * 2);
          c.fill();
          if (lon === 0) { c.beginPath(); c.arc(w, h / 2, 0.13 * px, 0, Math.PI * 2); c.fill(); }
        }
      }
    });
  }

  // A one-piece pub cue, tip at the top of the texture: chalk, leather,
  // a brass ferrule, an ash shaft, ebony splice points and butt.
  function cueTexture() {
    return canvasTex(64, 2048, (c, w, h) => {
      const at = (mm) => (mm / CUE_LEN) * h;
      const band = (a, b, fill) => { c.fillStyle = fill; c.fillRect(0, at(a), w, at(b) - at(a)); };
      band(0, 4, '#3F6FB0');
      band(4, 11, '#5A3A22');
      band(11, 26, '#E2C36E');
      band(26, 1000, '#DDB679');
      const rnd = seeded(31);
      for (let i = 0; i < 60; i++) {
        const x = rnd() * w;
        const y0 = at(26 + rnd() * 900);
        c.strokeStyle = `rgba(110,65,25,${0.15 + rnd() * 0.3})`;
        c.lineWidth = 0.5 + rnd();
        c.beginPath();
        c.moveTo(x, y0);
        c.lineTo(x + (rnd() - 0.5) * 3, y0 + at(80 + rnd() * 200));
        c.stroke();
      }
      band(1000, 1425, '#1D1410');
      c.fillStyle = '#1D1410';
      for (let k = 0; k < 4; k++) {
        const cx = (k + 0.5) * (w / 4);
        c.beginPath();
        c.moveTo(cx - w / 8, at(1000));
        c.lineTo(cx, at(820));
        c.lineTo(cx + w / 8, at(1000));
        c.fill();
      }
      band(1110, 1116, '#C9B48A');
      band(1425, CUE_LEN, '#0A0A0A');
    });
  }

  /* ---------- Building the room ---------- */

  function build() {
    scene = new T.Scene();
    scene.background = new T.Color(0x0B0E0C);
    scene.fog = new T.Fog(0x0B0E0C, 4000, 12000);

    const cloth = clothTexture();
    const weave = clothTexture();
    weave.colorSpace = T.NoColorSpace;
    weave.repeat.set(1 / 40, 1 / 40);
    const clothMat = new T.MeshPhysicalMaterial({
      color: 0x146A3E, map: cloth, roughness: 0.9, metalness: 0,
      bumpMap: weave, bumpScale: 0.6,
      sheen: 1, sheenColor: new T.Color(0x5FC48C), sheenRoughness: 0.6,
    });
    const slateMat = new T.MeshStandardMaterial({ color: 0x0E3020, roughness: 1 });
    const blackMat = new T.MeshBasicMaterial({ color: 0x000000 });

    // The bed: the slate, cut back in an arc at each pocket.
    scene.add(slab(bedOutline(), -SLATE, 0, [clothMat, slateMat]));
    // Below the pockets, the dark.
    const pit = new T.Mesh(new T.PlaneGeometry(W + 2 * RAIL, L + 2 * RAIL), blackMat);
    pit.rotation.x = -Math.PI / 2;
    pit.position.set(W / 2, -SLATE - 2, L / 2);
    scene.add(pit);

    // The baulk line and the spot, chalked on.
    const chalk = new T.MeshBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.35, depthWrite: false });
    scene.add(flat([[0, BAULK - 0.9], [W, BAULK - 0.9], [W, BAULK + 0.9], [0, BAULK + 0.9]], 0.3, chalk));
    scene.add(flat(circlePts(SPOT.x, SPOT.y, 3.5, 16), 0.3, new T.MeshBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.55 })));

    // Cushions: rubber under the same cloth.
    for (const cu of cushions) scene.add(rounded(shape(cu.pts), 0, CUSH_TOP, 6, clothMat));

    // Rails: one frame of hardwood with the pockets cut right through it,
    // the grain running along each side and turning at the mitres.
    const darkWood = new T.MeshStandardMaterial({ color: 0x2E1408, roughness: 0.55 });
    const grain = woodTexture(7);
    grain.repeat.set(1, 1);
    const wood = new T.MeshPhysicalMaterial({
      map: grain, roughness: 0.45, bumpMap: grain, bumpScale: 0.4,
      clearcoat: 0.9, clearcoatRoughness: 0.12,
    });
    const frame = new T.Shape();
    railOuter().forEach(([x, y], i) => (i ? frame.lineTo(x, -y) : frame.moveTo(x, -y)));
    const hole = new T.Path();
    railInner().forEach(([x, y], i) => (i ? hole.lineTo(x, -y) : hole.moveTo(x, -y)));
    frame.holes.push(hole);
    const rails = rounded(frame, -40, RAIL_TOP, 7, [wood, wood]);
    grainUVs(rails.geometry);
    rails.castShadow = rails.receiveShadow = true;
    scene.add(rails);

    // A rolled leather lip round each pocket, where it cuts the rail.
    const leather = new T.MeshPhysicalMaterial({ color: 0x24160E, roughness: 0.55, clearcoat: 0.4, clearcoatRoughness: 0.4 });
    for (const p of pockets) {
      const pts = [];
      const rr = p.r + 2;
      const outside = (a) => {
        const x = p.x + Math.cos(a) * rr;
        const y = p.y + Math.sin(a) * rr;
        return !(x > -J && x < W + J && y > -J && y < L + J);
      };
      // Start from an angle inside the cushion line and go round once.
      let a0 = 0;
      while (outside(a0) && a0 < Math.PI * 2) a0 += 0.05;
      for (let i = 0; i <= 180; i++) {
        const a = a0 + (i / 180) * Math.PI * 2;
        if (outside(a)) pts.push(v3(p.x + Math.cos(a) * rr, RAIL_TOP - 1, p.y + Math.sin(a) * rr));
      }
      if (pts.length < 4) continue;
      const lip = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts), pts.length * 2, 5, 10, false), leather);
      lip.castShadow = true;
      lip.receiveShadow = true;
      scene.add(lip);
    }
    const chalkCube = new T.Mesh(new T.BoxGeometry(22, 20, 22), [
      ...Array(2).fill(new T.MeshStandardMaterial({ color: 0x2F64B2, roughness: 0.95 })),
      new T.MeshStandardMaterial({ color: 0x1E4A8E, roughness: 1 }),
      ...Array(3).fill(new T.MeshStandardMaterial({ color: 0x2F64B2, roughness: 0.95 })),
    ]);
    chalkCube.position.set(W + (J + RAIL) / 2 + 6, RAIL_TOP + 10, L - 290);
    chalkCube.rotation.y = 0.5;
    chalkCube.castShadow = true;
    scene.add(chalkCube);

    // Pearl sights on the rails.
    const pearl = new T.MeshStandardMaterial({ color: 0xF2F0EA, roughness: 0.2, metalness: 0.1 });
    const sight = (x, y) => scene.add(flat([[x, y - 7], [x + 4.5, y], [x, y + 7], [x - 4.5, y]], RAIL_TOP + 0.2, pearl));
    const m = (J + RAIL) / 2;
    for (let k = 1; k < 8; k++) if (k !== 4) { sight(-m, L * k / 8); sight(W + m, L * k / 8); }
    for (let k = 1; k < 4; k++) { sight(W * k / 4, -m); sight(W * k / 4, L + m); }

    // The body of the table and its legs, standing on a wooden floor.
    const body = new T.Mesh(new T.BoxGeometry(W + 2 * RAIL - 30, 210, L + 2 * RAIL - 30), darkWood);
    body.position.set(W / 2, -40 - 105, L / 2);
    body.castShadow = body.receiveShadow = true;
    scene.add(body);
    for (const [x, z] of [[-RAIL + 70, -RAIL + 70], [W + RAIL - 70, -RAIL + 70], [-RAIL + 70, L + RAIL - 70], [W + RAIL - 70, L + RAIL - 70]]) {
      const leg = new T.Mesh(new T.BoxGeometry(110, -250 - FLOOR, 110), darkWood);
      leg.position.set(x, (FLOOR - 250) / 2, z);
      leg.castShadow = true;
      scene.add(leg);
    }
    const boards = canvasTex(512, 512, (c, w, h) => {
      const rnd = seeded(3);
      for (let i = 0; i < 8; i++) {
        c.fillStyle = `hsl(25, 35%, ${12 + rnd() * 6}%)`;
        c.fillRect(0, i * (h / 8), w, h / 8);
        c.fillStyle = 'rgba(0,0,0,0.5)';
        c.fillRect(0, i * (h / 8), w, 2);
      }
    }, [1 / 1100, 1 / 1100]);
    const floor = new T.Mesh(new T.PlaneGeometry(12000, 12000), new T.MeshStandardMaterial({ map: boards, roughness: 0.6 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(W / 2, FLOOR, L / 2);
    floor.receiveShadow = true;
    scene.add(floor);

    walls();
    lights();

    // The balls, each with a soft contact shadow where it sits on the cloth.
    const sphere = new T.SphereGeometry(R, 48, 32);
    const blob = canvasTex(64, 64, (c, w) => {
      const g = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      g.addColorStop(0, 'rgba(0,0,0,0.75)');
      g.addColorStop(0.35, 'rgba(0,0,0,0.45)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, w, w);
    });
    const blobMat = new T.MeshBasicMaterial({ map: blob, transparent: true, depthWrite: false });
    const blobGeo = new T.PlaneGeometry(R * 2.1, R * 2.1);
    blobGeo.rotateX(-Math.PI / 2);
    for (let id = 0; id < 16; id++) {
      const mat = new T.MeshPhysicalMaterial({
        map: ballTexture(id), roughness: 0.18, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.2,
      });
      const mesh = new T.Mesh(sphere, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      balls[id] = mesh;
      const sh = new T.Mesh(blobGeo, blobMat);
      sh.renderOrder = 1;
      scene.add(sh);
      contact[id] = sh;
    }

    // The cue: a tapered rod, 9.4 mm at the tip to 29 mm at the butt, with
    // its tip at the origin and the butt down −Y.
    const cg = new T.CylinderGeometry(4.7, 14.5, CUE_LEN, 24, 1);
    cg.translate(0, -CUE_LEN / 2, 0);
    cue = new T.Mesh(cg, new T.MeshStandardMaterial({ map: cueTexture(), roughness: 0.35 }));
    cue.castShadow = true;
    scene.add(cue);

    // Aiming aids, drawn just above the cloth.
    const line = (color, dashed) => {
      const mat = dashed
        ? new T.LineDashedMaterial({ color, dashSize: 12, gapSize: 10, transparent: true, opacity: 0.6 })
        : new T.LineBasicMaterial({ color, transparent: true, opacity: 0.8 });
      const l = new T.Line(new T.BufferGeometry().setFromPoints([v3(0, 0, 0), v3(0, 0, 1)]), mat);
      l.frustumCulled = false;
      scene.add(l);
      return l;
    };
    fx.aim = line(0xFFFFFF);
    fx.obj = line(0xFFFFFF);
    fx.tan = line(0xFFFFFF, true);
    fx.ghost = new T.Mesh(sphere, new T.MeshBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.22, depthWrite: false }));
    scene.add(fx.ghost);
    fx.rings = [];
    fx.baulk = flat([[0, BAULK], [W, BAULK], [W, L], [0, L]], 0.5, new T.MeshBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.06, depthWrite: false }));
    scene.add(fx.baulk);
  }

  // The room: wood panelling to dado height, dark green paint above.
  function walls() {
    const tex = canvasTex(1024, 1024, (c, w, h) => {
      const dado = h * 0.62;
      c.fillStyle = '#1C2A22';
      c.fillRect(0, 0, w, dado);
      const rnd = seeded(5);
      for (let i = 0; i < 1800; i++) {
        c.fillStyle = `rgba(255,255,255,${rnd() * 0.025})`;
        c.fillRect(rnd() * w, rnd() * dado, 3, 3);
      }
      for (let i = 0; i < 8; i++) {
        const x = i * (w / 8);
        c.fillStyle = i % 2 ? '#3A1C0D' : '#41200F';
        c.fillRect(x, dado, w / 8, h - dado);
        c.fillStyle = 'rgba(0,0,0,0.45)';
        c.fillRect(x, dado, 3, h - dado);
        c.strokeStyle = 'rgba(0,0,0,0.35)';
        c.lineWidth = 3;
        c.strokeRect(x + 18, dado + 40, w / 8 - 36, h - dado - 80);
      }
      c.fillStyle = '#5A2D14';
      c.fillRect(0, dado - 14, w, 22);
      c.fillStyle = 'rgba(255,220,180,0.15)';
      c.fillRect(0, dado - 14, w, 4);
    });
    tex.wrapS = T.RepeatWrapping;
    const hgt = 2700;
    const mat = new T.MeshStandardMaterial({ map: tex, roughness: 0.85, emissive: 0xFFFFFF, emissiveIntensity: 0.12 });
    const xs = [-2300, W + 2300];
    const zs = [-2700, L + 2700];
    const wall = (len, x, z, rot) => {
      const m = mat.clone();
      m.map = tex.clone();
      m.map.repeat.set(len / 2200, 1);
      m.map.needsUpdate = true;
      m.emissiveMap = m.map;
      const p = new T.Mesh(new T.PlaneGeometry(len, hgt), m);
      p.position.set(x, FLOOR + hgt / 2, z);
      p.rotation.y = rot;
      p.receiveShadow = true;
      scene.add(p);
    };
    const lx = xs[1] - xs[0];
    const lz = zs[1] - zs[0];
    wall(lx, (xs[0] + xs[1]) / 2, zs[0], 0);
    wall(lx, (xs[0] + xs[1]) / 2, zs[1], Math.PI);
    wall(lz, xs[0], (zs[0] + zs[1]) / 2, Math.PI / 2);
    wall(lz, xs[1], (zs[0] + zs[1]) / 2, -Math.PI / 2);

    // Wall lights, a dartboard on the far wall and a couple of pictures.
    const lit = (x, y, z, rot) => {
      const g = new T.Mesh(new T.CircleGeometry(60, 24), new T.MeshBasicMaterial({ color: 0xFFD9A0 }));
      g.position.set(x, y, z);
      g.rotation.y = rot;
      scene.add(g);
      const pl = new T.PointLight(0xFFC98A, 0.5, 2600, 0);
      pl.position.set(x + Math.sin(rot) * 150, y, z + Math.cos(rot) * 150);
      scene.add(pl);
    };
    lit(W / 2 - 900, FLOOR + 1900, zs[0] + 2, 0);
    lit(W / 2 + 900, FLOOR + 1900, zs[0] + 2, 0);
    lit(xs[0] + 2, FLOOR + 1900, L / 2, Math.PI / 2);
    lit(xs[1] - 2, FLOOR + 1900, L / 2, -Math.PI / 2);
    const board = canvasTex(512, 512, (c, w) => {
      const r = w / 2;
      c.translate(r, r);
      c.fillStyle = '#111';
      c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill();
      const ring = (r0, r1, cols) => {
        for (let i = 0; i < 20; i++) {
          const a0 = ((i - 0.5) / 20) * Math.PI * 2 - Math.PI / 2;
          const a1 = ((i + 0.5) / 20) * Math.PI * 2 - Math.PI / 2;
          c.fillStyle = cols[i % 2];
          c.beginPath(); c.arc(0, 0, r1, a0, a1); c.arc(0, 0, r0, a1, a0, true); c.fill();
        }
      };
      ring(r * 0.62, r * 0.8, ['#1A1A1A', '#EADFC4']);
      ring(r * 0.58, r * 0.62, ['#B3202A', '#1F7A3A']);
      ring(r * 0.4, r * 0.58, ['#1A1A1A', '#EADFC4']);
      ring(r * 0.36, r * 0.4, ['#B3202A', '#1F7A3A']);
      ring(r * 0.08, r * 0.36, ['#1A1A1A', '#EADFC4']);
      c.fillStyle = '#1F7A3A'; c.beginPath(); c.arc(0, 0, r * 0.08, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#B3202A'; c.beginPath(); c.arc(0, 0, r * 0.035, 0, Math.PI * 2); c.fill();
    });
    const dart = new T.Mesh(new T.CircleGeometry(225, 48), new T.MeshStandardMaterial({ map: board, roughness: 0.9 }));
    dart.position.set(W / 2, FLOOR + 1730, zs[0] + 4);
    scene.add(dart);
    const frame = (x, z, rot, w, h, hue) => {
      const pic = canvasTex(256, 192, (c, cw2, ch2) => {
        const g = c.createLinearGradient(0, 0, 0, ch2);
        g.addColorStop(0, `hsl(${hue}, 30%, 45%)`);
        g.addColorStop(0.6, `hsl(${hue + 20}, 25%, 30%)`);
        g.addColorStop(1, `hsl(${hue + 40}, 30%, 18%)`);
        c.fillStyle = g;
        c.fillRect(0, 0, cw2, ch2);
        c.fillStyle = 'rgba(0,0,0,0.35)';
        c.beginPath(); c.moveTo(0, ch2 * 0.7); c.quadraticCurveTo(cw2 * 0.4, ch2 * 0.45, cw2, ch2 * 0.65); c.lineTo(cw2, ch2); c.lineTo(0, ch2); c.fill();
      });
      const g = new T.Group();
      const back = new T.Mesh(new T.PlaneGeometry(w + 60, h + 60), new T.MeshStandardMaterial({ color: 0x8A6A2A, roughness: 0.4, metalness: 0.4 }));
      const front = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshStandardMaterial({ map: pic, roughness: 0.8 }));
      front.position.z = 1;
      g.add(back, front);
      g.position.set(x, FLOOR + 1650, z);
      g.rotation.y = rot;
      scene.add(g);
    };
    frame(xs[0] + 4, L * 0.25, Math.PI / 2, 700, 500, 200);
    frame(xs[1] - 4, L * 0.75, -Math.PI / 2, 700, 500, 30);
  }

  // The bed's outline: the rectangle inside the cushions, with each pocket's
  // drop arc cut out of it.
  function bedOutline() {
    const pts = [];
    const edge = [[0, 0], [W, 0], [W, L], [0, L], [0, 0]];
    for (let e = 0; e < 4; e++) {
      const [ax, ay] = edge[e];
      const [bx, by] = edge[e + 1];
      const len = Math.hypot(bx - ax, by - ay);
      const n = Math.ceil(len / 4);
      for (let i = 0; i < n; i++) {
        let x = ax + ((bx - ax) * i) / n;
        let y = ay + ((by - ay) * i) / n;
        for (const p of pockets) {
          const dx = x - p.dx;
          const dy = y - p.dy;
          const d = Math.hypot(dx, dy);
          if (d < p.dr) { x = p.dx + (dx / d) * p.dr; y = p.dy + (dy / d) * p.dr; }
        }
        pts.push([x, y]);
      }
    }
    return pts;
  }

  // The rail's outer edge, with rounded corners.
  function railOuter() {
    const o = RAIL;
    const rc = 34;
    const pts = [];
    const corners = [[-o + rc, -o + rc, Math.PI], [W + o - rc, -o + rc, Math.PI * 1.5], [W + o - rc, L + o - rc, 0], [-o + rc, L + o - rc, Math.PI * 0.5]];
    for (const [cx, cy, a0] of corners) {
      for (let i = 0; i <= 8; i++) {
        const a = a0 + (Math.PI / 2) * (i / 8);
        pts.push([cx + Math.cos(a) * rc, cy + Math.sin(a) * rc]);
      }
    }
    return pts;
  }

  // The rail's inner edge: the cushion line, bulging out round each pocket
  // hole so the hole goes right through the wood.
  function railInner() {
    const pts = [];
    const edge = [[-J, -J], [W + J, -J], [W + J, L + J], [-J, L + J], [-J, -J]];
    const inHole = (x, y) => pockets.find((p) => Math.hypot(x - p.x, y - p.y) < p.r);
    for (let e = 0; e < 4; e++) {
      const [ax, ay] = edge[e];
      const [bx, by] = edge[e + 1];
      const n = Math.ceil(Math.hypot(bx - ax, by - ay) / 1.5);
      let prevIn = true;
      for (let i = 0; i < n; i++) {
        const x = ax + ((bx - ax) * i) / n;
        const y = ay + ((by - ay) * i) / n;
        const p = inHole(x, y);
        if (p) {
          const d = Math.hypot(x - p.x, y - p.y) || 1;
          pts.push([p.x + ((x - p.x) / d) * p.r, p.y + ((y - p.y) / d) * p.r]);
        } else if (prevIn || i === 0) {
          pts.push([x, y]);
        } else {
          // Straight runs only need their ends.
          const nx = ax + ((bx - ax) * (i + 1)) / n;
          const ny = ay + ((by - ay) * (i + 1)) / n;
          if (i === n - 1 || inHole(nx, ny)) pts.push([x, y]);
        }
        prevIn = !!p;
      }
    }
    // Drop points that land on top of each other.
    return pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 0.3);
  }

  // Grain along the length of each side of the frame (top face only).
  function grainUVs(g) {
    const pos = g.attributes.position;
    const uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) < RAIL_TOP - 8) continue;
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const ox = Math.max(-x, x - W, 0);
      const oz = Math.max(-z, z - L, 0);
      if (ox > oz) uv.setXY(i, z / 1000, x / 240);
      else uv.setXY(i, x / 1000, z / 240);
    }
    uv.needsUpdate = true;
  }

  function lights() {
    scene.add(new T.HemisphereLight(0xFFF2DD, 0x1A120C, 0.2));
    // The lamp: a long shade with three bulbs.
    const shadeMat = new T.MeshStandardMaterial({ color: 0x1D3B2A, roughness: 0.4, metalness: 0.3 });
    lamp = new T.Group();
    scene.add(lamp);
    const shade = new T.Mesh(new T.BoxGeometry(300, 70, L * 0.82), shadeMat);
    shade.position.set(W / 2, LAMP_Y + 60, L / 2);
    lamp.add(shade);
    for (const z of [L * 0.12, L * 0.88]) {
      const chain = new T.Mesh(new T.CylinderGeometry(3, 3, 1400, 6), shadeMat);
      chain.position.set(W / 2, LAMP_Y + 95 + 700, z);
      lamp.add(chain);
    }
    const bulb = new T.MeshBasicMaterial({ color: 0xFFF3DA });
    for (const z of LAMP_Z) {
      const glow = new T.Mesh(new T.CircleGeometry(80, 32), bulb);
      glow.rotation.x = Math.PI / 2;
      glow.position.set(W / 2, LAMP_Y + 24, z);
      lamp.add(glow);
      // Real fall-off: brightest straight under each shade.
      const s = new T.SpotLight(0xFFEFD6, 1.25e6, 0, 0.92, 0.7, 2);
      s.position.set(W / 2, LAMP_Y, z);
      s.target.position.set(W / 2, 0, z);
      s.castShadow = true;
      s.shadow.mapSize.set(2048, 2048);
      s.shadow.camera.near = 300;
      s.shadow.camera.far = 2400;
      s.shadow.bias = -0.0004;
      s.shadow.normalBias = 0.5;
      scene.add(s);
      scene.add(s.target);
      spots.push(s);
    }
    // What the glossy balls reflect: a dark room with the lamp overhead.
    const env = new T.Scene();
    env.background = new T.Color(0x0C0E0D);
    const room = new T.Mesh(new T.BoxGeometry(8000, 4000, 8000), new T.MeshBasicMaterial({ color: 0x191714, side: T.BackSide }));
    room.position.y = 1500;
    env.add(room);
    for (const z of LAMP_Z) {
      const light = new T.Mesh(new T.PlaneGeometry(240, 260), new T.MeshBasicMaterial({ color: 0xFFFFFF, side: T.DoubleSide }));
      light.rotation.x = Math.PI / 2;
      light.position.set(0, LAMP_Y, z - L / 2);
      env.add(light);
    }
    const green = new T.Mesh(new T.PlaneGeometry(W, L), new T.MeshBasicMaterial({ color: 0x0F4A2C, side: T.DoubleSide }));
    green.rotation.x = -Math.PI / 2;
    green.position.y = -10;
    env.add(green);
    const pm = new T.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(env, 0, 10, 20000).texture;
    pm.dispose();
  }

  /* ---------- Setting up ---------- */

  function supported() {
    if (!T) return false;
    try {
      const c = document.createElement('canvas');
      return !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch (e) {
      return false;
    }
  }

  function init(cv) {
    canvas = cv;
    renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = T.SRGBColorSpace;
    camera = new T.PerspectiveCamera(45, 1, 10, 20000);
    build();
    resize();
  }

  function resize() {
    if (!renderer) return;
    const r = canvas.getBoundingClientRect();
    cw = Math.max(1, r.width);
    ch = Math.max(1, r.height);
    land = cw > ch * 1.08;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'fast' ? 1.1 : 1.75));
    renderer.setSize(cw, ch, false);
    camera.aspect = cw / ch;
    camera.updateProjectionMatrix();
    snap = true;
    lastSig = '';
  }

  // High: soft shadows from all three shades, sharp on high-density screens.
  // Fast: no shadows and fewer pixels, for phones that struggle.
  function setQuality(q) {
    quality = q === 'fast' ? 'fast' : 'high';
    if (!renderer) return;
    const shadows = quality === 'high';
    renderer.shadowMap.enabled = shadows;
    for (const s of spots) s.castShadow = shadows;
    scene.traverse((o) => {
      if (!o.material) return;
      for (const m of [].concat(o.material)) m.needsUpdate = true;
    });
    resize();
  }

  // Called with no arguments when frames take too long while the balls run.
  function watchSpeed(fn) {
    onSlow = fn;
  }

  function cycleView() {
    view = VIEWS[(VIEWS.indexOf(view) + 1) % VIEWS.length];
    return VIEW_NAMES[view];
  }

  function setView(v) {
    if (VIEWS.includes(v)) view = v;
  }

  /* ---------- The camera ---------- */

  // How far back to stand to fit a w × h box in view, looking straight at it.
  function fitDistance(w, h, fov) {
    const t = Math.tan((fov * Math.PI) / 360);
    return Math.max(h / 2 / t, w / 2 / (t * camera.aspect));
  }

  function aimCamera(G, dt) {
    const c = G.balls[0];
    const st = G.st;
    let v = view;
    // Placing the cue ball is done standing over the table.
    if (v === 'player' && st && st.inHand && G.phase === 'aim') v = 'overhead';
    let fov = 45;
    let up = v3(0, 1, 0);
    const pos = v3(0, 0, 0);
    const look = v3(0, 0, 0);
    if (v === 'top') {
      fov = 32;
      const d = land ? fitDistance(L + 2 * RAIL + 40, W + 2 * RAIL + 40, fov) : fitDistance(W + 2 * RAIL + 40, L + 2 * RAIL + 40, fov);
      pos.set(W / 2, d, L / 2 + 0.01);
      look.set(W / 2, 0, L / 2);
      up = land ? v3(-1, 0, 0) : v3(0, 0, -1);
    } else if (v === 'overhead' || !c || (!c.on && G.phase !== 'rolling')) {
      fov = 40;
      const el = 0.95;
      if (land) {
        const d = fitDistance(L + 2 * RAIL, (W + 2 * RAIL) * 1.5, fov) * 0.92;
        pos.set(W / 2 + Math.cos(el) * d, Math.sin(el) * d, L / 2);
      } else {
        const d = fitDistance(W + 2 * RAIL, (L + 2 * RAIL) * 0.95, fov) * 0.98;
        pos.set(W / 2, Math.sin(el) * d, L / 2 + Math.cos(el) * d);
      }
      look.set(W / 2, -60, L / 2);
    } else {
      // Down on the shot, behind the cue ball, like a player; while the balls
      // run, the player stands up to watch.
      const watching = G.phase === 'rolling' || G.phase === 'wait' || G.phase === 'over';
      const from = watching && G.strike ? G.strike : c;
      const dx = Math.cos(G.aim);
      const dy = Math.sin(G.aim);
      const back = watching ? 1250 : 720;
      const height = watching ? 1050 : 330;
      const ahead = watching ? 650 : 700;
      pos.set(from.x - dx * back, height, from.y - dy * back);
      look.set(from.x + dx * ahead, watching ? -80 : -90, from.y + dy * ahead);
      fov = watching ? 50 : 52;
    }
    const k = snap ? 1 : 1 - Math.exp(-dt * 5);
    camPos.lerp(pos, k);
    camLook.lerp(look, k);
    camera.up.lerp(up, k).normalize();
    camera.fov += (fov - camera.fov) * k;
    camera.updateProjectionMatrix();
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    // From above the lamp, it would only be in the way.
    lamp.visible = camPos.y < LAMP_Y - 20;
    snap = false;
  }

  /* ---------- Each frame ---------- */

  function placeBall(mesh, b, x, y, z) {
    mesh.position.set(x, z, y);
    const [w, qx, qy, qz] = b.q;
    mesh.quaternion.set(qx, -qz, qy, w);
  }

  function setLine(l, a, b) {
    const p = l.geometry.attributes.position;
    p.setXYZ(0, a.x, a.y, a.z);
    p.setXYZ(1, b.x, b.y, b.z);
    p.needsUpdate = true;
    l.geometry.computeBoundingSphere();
    if (l.material.isLineDashedMaterial) l.computeLineDistances();
    l.visible = true;
  }

  function ringMesh(i) {
    if (!fx.rings[i]) {
      const pts = [];
      for (let k = 0; k <= 48; k++) pts.push(v3(Math.cos((k / 48) * Math.PI * 2), 0, Math.sin((k / 48) * Math.PI * 2)));
      const l = new T.Line(new T.BufferGeometry().setFromPoints(pts), new T.LineDashedMaterial({ color: 0xFFFFFF, dashSize: 0.25, gapSize: 0.18, transparent: true }));
      l.computeLineDistances();
      l.frustumCulled = false;
      scene.add(l);
      fx.rings[i] = l;
    }
    return fx.rings[i];
  }

  function guides(G) {
    fx.aim.visible = fx.obj.visible = fx.tan.visible = fx.ghost.visible = false;
    if (!G.showAim || G.settings.guide === 'none') return;
    const bs = G.balls;
    const c = bs[0];
    const dx = Math.cos(G.aim);
    const dy = Math.sin(G.aim);
    const hit = phys.firstHit(bs, c.x, c.y, dx, dy, (b) => b.id === 0);
    const wt = phys.wallDist(c.x, c.y, dx, dy);
    const y = 0.8;
    const from = v3(c.x + dx * R, y, c.y + dy * R);
    if (hit && hit.t <= wt) {
      const gx = c.x + dx * hit.t;
      const gy = c.y + dy * hit.t;
      const good = !G.onSet || G.onSet.has(hit.b.id);
      const col = good ? 0xFFFFFF : 0xFF4040;
      fx.aim.material.color.setHex(col);
      fx.ghost.material.color.setHex(col);
      setLine(fx.aim, from, v3(gx, y, gy));
      fx.ghost.position.set(gx, R, gy);
      fx.ghost.visible = true;
      if (good && G.settings.guide !== 'off') {
        const b = hit.b;
        const nx = (b.x - gx) / D;
        const ny = (b.y - gy) / D;
        const cos = Math.max(0, dx * nx + dy * ny);
        const len = (G.settings.guide === 'long' ? 420 : 140) * (0.35 + 0.65 * cos);
        setLine(fx.obj, v3(b.x + nx * R, y, b.y + ny * R), v3(b.x + nx * (R + len), y, b.y + ny * (R + len)));
        if (G.settings.guide === 'long') {
          let tx = dx - nx * (dx * nx + dy * ny);
          let ty = dy - ny * (dx * nx + dy * ny);
          const tl = Math.hypot(tx, ty);
          if (tl > 0.02) {
            tx /= tl; ty /= tl;
            setLine(fx.tan, v3(gx, y, gy), v3(gx + tx * 200 * tl, y, gy + ty * 200 * tl));
          }
        }
      }
    } else {
      fx.aim.material.color.setHex(0xFFFFFF);
      setLine(fx.aim, from, v3(c.x + dx * wt, y, c.y + dy * wt));
    }
  }

  function placeCue(G, pull, opacity, from) {
    const c = from || G.balls[0];
    const dx = Math.cos(G.aim);
    const dy = Math.sin(G.aim);
    const lat = G.spin.x * R * 0.55;
    const lift = G.spin.y * R * 0.55;
    // The butt is raised a little to clear the rail.
    const tilt = 0.09;
    const dir = v3(dx * Math.cos(tilt), -Math.sin(tilt), dy * Math.cos(tilt));
    const back = Math.sqrt(Math.max(0, R * R - lat * lat - lift * lift)) + 3 + pull;
    cue.position.set(c.x - dir.x * back - dy * lat, R + lift - dir.y * back, c.y - dir.z * back + dx * lat);
    cue.quaternion.setFromUnitVectors(v3(0, 1, 0), dir);
    cue.material.transparent = opacity < 1;
    cue.material.opacity = opacity;
    cue.visible = opacity > 0.01;
  }

  function draw(G, now) {
    if (!renderer) return;
    const dt = Math.min(0.1, (now - (lastNow || now)) / 1000);
    lastNow = now;
    if (!G.balls) {
      renderer.render(scene, camera);
      return;
    }
    const st = G.st;
    const pulse = 0.5 + 0.5 * Math.sin(now / 220);

    G.balls.forEach((b, id) => {
      const m = balls[id];
      m.visible = b.on;
      if (b.on) placeBall(m, b, b.x, b.y, R);
      contact[id].visible = b.on;
      if (b.on) contact[id].position.set(b.x, 0.25, b.y);
    });
    // Balls dropping: on into the pocket and down.
    for (const a of G.anims) {
      const b = G.balls[a.id];
      const p = pockets[a.pocket];
      const k = Math.min(1, a.t / 0.4);
      const m = balls[a.id];
      m.visible = true;
      placeBall(m, b, a.x + (p.x - a.x) * k * 0.6, a.y + (p.y - a.y) * k * 0.6, R - k * k * 140);
    }

    guides(G);

    // Rings: ball in hand, the nominated ball, and balls that can be nominated.
    let ri = 0;
    const ring = (x, y, r, color, opacity) => {
      const l = ringMesh(ri++);
      l.position.set(x, 1, y);
      l.scale.setScalar(r);
      l.material.color.setHex(color);
      l.material.opacity = opacity;
      l.visible = true;
    };
    const human = G.phase === 'aim';
    if (human && st.inHand) ring(G.balls[0].x, G.balls[0].y, R * (1.55 + pulse * 0.2), 0xFFFFFF, 0.85);
    if (st.nominated !== null && G.balls[st.nominated].on) ring(G.balls[st.nominated].x, G.balls[st.nominated].y, R * 1.35, 0xFFD54A, 1);
    if (G.nominating) for (const b of G.nominable) ring(b.x, b.y, R * (1.3 + pulse * 0.25), 0xFFD54A, 0.9);
    for (let i = ri; i < fx.rings.length; i++) fx.rings[i].visible = false;
    fx.baulk.visible = human && st.inHand;
    fx.baulk.material.opacity = 0.04 + pulse * 0.04;

    // The cue.
    if (G.phase === 'stroke' && G.stroke) {
      const k = Math.min(1, G.stroke.t / G.stroke.dur);
      placeCue(G, G.stroke.pull * (1 - k * k), 1);
    } else if (G.showAim) {
      placeCue(G, 10 + G.power * 150, 1);
    } else if (G.strike) {
      const t = (now - G.strike.t) / 1000;
      const k = Math.min(1, t / 0.6);
      const through = -Math.min(1, t / 0.08) * (8 + G.strike.power * 40);
      if (k < 1) placeCue(G, through - Math.max(0, t - 0.3) * 600, 1 - Math.max(0, (k - 0.5) * 2), G.strike);
      else cue.visible = false;
    } else cue.visible = false;

    aimCamera(G, dt);
    // Only draw when something has changed: saves the phone's battery while
    // you stand over a shot.
    const sig = frameSig(G);
    if (sig === lastSig) return;
    lastSig = sig;
    renderer.render(scene, camera);
    // Keep an eye on the frame rate while the balls are running.
    if (G.phase === 'rolling' && quality === 'high' && onSlow) {
      slowCheck.n++;
      slowCheck.sum += dt;
      if (slowCheck.sum >= 1.5 && slowCheck.n >= 12) {
        if (slowCheck.sum / slowCheck.n > 0.045) onSlow();
        slowCheck = { n: 0, sum: 0 };
      }
    }
  }

  let lastSig = '';
  function frameSig(G) {
    const r = (v) => Math.round(v * 10);
    let s = `${r(camPos.x)},${r(camPos.y)},${r(camPos.z)},${r(camLook.x)},${r(camLook.z)},${r(camera.fov)},${cw}x${ch}|`;
    for (const m of balls) s += m.visible ? `${r(m.position.x)},${r(m.position.y)},${r(m.position.z)},${r(m.quaternion.x * 100)},${r(m.quaternion.y * 100)};` : '-;';
    s += cue.visible ? `${r(cue.position.x)},${r(cue.position.y)},${r(cue.position.z)},${r(cue.material.opacity)}` : 'nocue';
    s += `|${r(G.aim * 1000)},${G.settings.guide},${G.onSet ? G.onSet.size : 0}`;
    for (const l of fx.rings) s += l.visible ? `${r(l.position.x)},${r(l.scale.x)},${l.material.color.getHex()};` : '-';
    if (fx.baulk.visible) s += r(fx.baulk.material.opacity * 100);
    return s;
  }

  /* ---------- Touch ---------- */

  // The point on the table under a screen position (at ball-centre height),
  // or null if it's off in the room somewhere.
  function toWorld(sx, sy) {
    const ndc = new T.Vector2((sx / cw) * 2 - 1, -((sy / ch) * 2 - 1));
    const ray = new T.Raycaster();
    ray.setFromCamera(ndc, camera);
    const o = ray.ray.origin;
    const d = ray.ray.direction;
    if (d.y >= -1e-4) return null;
    const t = (R - o.y) / d.y;
    return { x: o.x + d.x * t, y: o.z + d.z * t };
  }

  function toScreen(x, y) {
    const p = v3(x, R, y).project(camera);
    return { x: ((p.x + 1) / 2) * cw, y: ((1 - p.y) / 2) * ch };
  }

  // In the player's view the camera turns with the cue, so dragging turns
  // the aim; elsewhere you point at where you want to aim.
  function aimStyle(G) {
    return view === 'player' && !(G.st && G.st.inHand) ? 'drag' : 'point';
  }

  EB.render3d = { supported, init, resize, draw, toWorld, toScreen, aimStyle, cycleView, setView, setQuality, watchSpeed, get view() { return view; }, VIEW_NAMES };
})(window.EB = window.EB || {});
