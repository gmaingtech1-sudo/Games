// Placeholder art, drawn with simple shapes when the game starts.
// No image files are needed. To use real artwork later, load your images in
// BootScene with the same names (for example 'leo' or 'slime').

const Art = {
  make(scene) {
    this.tiles(scene);
    this.person(scene, 'leo', LOOKS.leo, false);
    this.person(scene, 'leo_step', LOOKS.leo, true);
    this.person(scene, 'npc_elder', LOOKS.elder, false);
    this.person(scene, 'npc_merchant', LOOKS.merchant, false);
    this.person(scene, 'npc_mira', LOOKS.mira, false);
    this.slime(scene, 'slime', '#8a5cff', '#5a2fd0');
    this.canvas(scene, 'chest', 64, 56, (c) => this.drawChest(c, false));
    this.canvas(scene, 'chest_open', 64, 56, (c) => this.drawChest(c, true));
    this.canvas(scene, 'well', 96, 104, (c) => this.drawWell(c));
    this.canvas(scene, 'sign', 56, 64, (c) => this.drawSign(c));
    this.canvas(scene, 'pendant', 48, 48, (c) => this.drawPendant(c));
    this.canvas(scene, 'potion', 48, 56, (c) => this.drawPotion(c));
    this.canvas(scene, 'coin', 32, 32, (c) => this.drawCoin(c));
    this.canvas(scene, 'spark', 32, 32, (c) => this.drawSpark(c));
    this.canvas(scene, 'shadow', 64, 20, (c) => {
      c.fillStyle = 'rgba(0,0,0,0.28)';
      ellipse(c, 32, 10, 30, 8);
      c.fill();
    });
    for (const id in WEAPONS) this.canvas(scene, 'sword_' + id, 40, 120, (c) => this.drawSword(c, WEAPONS[id]));
    this.canvas(scene, 'night', 360, 800, (c) => this.drawNight(c));
  },

  canvas(scene, key, w, h, draw) {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    const tex = scene.textures.createCanvas(key, w, h);
    const c = tex.getContext();
    draw(c, w, h);
    tex.refresh();
    return tex;
  },

  // ---- Map tiles ----------------------------------------------------------
  // Tiles are drawn 48x48 with a 1px copied border around each one, which
  // stops thin lines showing between tiles when the camera moves.

  tiles(scene) {
    const T = CONFIG.tileSize;
    const order = ['grass', 'flowers', 'path', 'water', 'tree', 'roof', 'wall', 'door', 'fence', 'bridge', 'meadow', 'bramble'];
    const tile = document.createElement('canvas');
    tile.width = T;
    tile.height = T;
    const tc = tile.getContext('2d');
    this.canvas(scene, 'tiles', order.length * (T + 2), T + 2, (c) => {
      order.forEach((name, i) => {
        tc.clearRect(0, 0, T, T);
        TILE_PAINTERS[name](tc, T, i);
        const x = i * (T + 2) + 1;
        c.drawImage(tile, x, 1);
        c.drawImage(tile, 0, 0, T, 1, x, 0, T, 1);
        c.drawImage(tile, 0, T - 1, T, 1, x, T + 1, T, 1);
        c.drawImage(tile, 0, 0, 1, T, x - 1, 1, 1, T);
        c.drawImage(tile, T - 1, 0, 1, T, x + T, 1, 1, T);
      });
    });
  },

  // ---- People -------------------------------------------------------------

  person(scene, key, look, step) {
    this.canvas(scene, key, 96, 120, (c) => {
      // legs
      const legShift = step ? 4 : 0;
      c.fillStyle = look.pants;
      roundRect(c, 34 - legShift, 82, 12, 26, 4);
      c.fill();
      roundRect(c, 50 + legShift, 82, 12, 26, 4);
      c.fill();
      c.fillStyle = look.boots;
      roundRect(c, 32 - legShift, 102, 16, 10, 4);
      c.fill();
      roundRect(c, 48 + legShift, 102, 16, 10, 4);
      c.fill();
      // cape or robe behind
      if (look.cape) {
        c.fillStyle = look.cape;
        c.beginPath();
        c.moveTo(28, 54);
        c.lineTo(68, 54);
        c.lineTo(74, 96);
        c.lineTo(22, 96);
        c.closePath();
        c.fill();
      }
      // body
      c.fillStyle = look.tunic;
      roundRect(c, 28, 52, 40, look.robe ? 56 : 38, 10);
      c.fill();
      if (look.trim) {
        c.fillStyle = look.trim;
        c.fillRect(46, 54, 4, look.robe ? 52 : 34);
      }
      if (look.belt) {
        c.fillStyle = look.belt;
        c.fillRect(28, 80, 40, 6);
        c.fillStyle = '#ffd86b';
        c.fillRect(45, 80, 6, 6);
      }
      // arms
      c.fillStyle = look.tunic;
      roundRect(c, 18, 56, 12, 28, 6);
      c.fill();
      roundRect(c, 66, 56, 12, 28, 6);
      c.fill();
      c.fillStyle = look.skin;
      circle(c, 24, 86, 6);
      c.fill();
      circle(c, 72, 86, 6);
      c.fill();
      // sword hilt over the shoulder
      if (look.sword) {
        c.save();
        c.translate(70, 46);
        c.rotate(0.6);
        c.fillStyle = '#6b4a2b';
        c.fillRect(-3, -18, 6, 16);
        c.fillStyle = '#c9a43c';
        c.fillRect(-10, -3, 20, 5);
        c.shadowColor = '#5fb8ff';
        c.shadowBlur = 8;
        c.fillStyle = '#7cc8ff';
        circle(c, 0, -20, 4);
        c.fill();
        c.restore();
      }
      if (look.staff) {
        c.fillStyle = '#7a5230';
        c.fillRect(78, 30, 5, 80);
        c.shadowColor = '#7cc8ff';
        c.shadowBlur = 10;
        c.fillStyle = '#9fe0ff';
        circle(c, 80, 28, 7);
        c.fill();
        c.shadowBlur = 0;
      }
      // head
      c.fillStyle = look.skin;
      circle(c, 48, 36, 20);
      c.fill();
      // hair
      look.hair(c);
      // face
      c.fillStyle = '#1b1b2b';
      circle(c, 41, 39, 2.8);
      c.fill();
      circle(c, 55, 39, 2.8);
      c.fill();
      c.fillStyle = '#ffffff';
      circle(c, 42, 38, 1);
      c.fill();
      circle(c, 56, 38, 1);
      c.fill();
      c.strokeStyle = '#8a4a3a';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(48, 45, 4, 0.2, Math.PI - 0.2);
      c.stroke();
      if (look.beard) look.beard(c);
      if (look.hat) look.hat(c);
    });
  },

  slime(scene, key, light, dark) {
    this.canvas(scene, key, 120, 100, (c) => {
      c.fillStyle = 'rgba(0,0,0,0.25)';
      ellipse(c, 60, 90, 46, 8);
      c.fill();
      const g = c.createRadialGradient(48, 40, 6, 60, 60, 60);
      g.addColorStop(0, light);
      g.addColorStop(1, dark);
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(12, 86);
      c.quadraticCurveTo(6, 40, 40, 22);
      c.quadraticCurveTo(60, 4, 80, 22);
      c.quadraticCurveTo(114, 40, 108, 86);
      c.quadraticCurveTo(60, 96, 12, 86);
      c.fill();
      c.fillStyle = 'rgba(255,255,255,0.35)';
      ellipse(c, 40, 34, 10, 6);
      c.fill();
      // angry eyes
      c.fillStyle = '#ffffff';
      ellipse(c, 45, 56, 9, 11);
      c.fill();
      ellipse(c, 75, 56, 9, 11);
      c.fill();
      c.fillStyle = '#1a1030';
      circle(c, 47, 59, 5);
      c.fill();
      circle(c, 73, 59, 5);
      c.fill();
      c.strokeStyle = '#1a1030';
      c.lineWidth = 4;
      c.beginPath();
      c.moveTo(34, 42);
      c.lineTo(54, 48);
      c.moveTo(86, 42);
      c.lineTo(66, 48);
      c.stroke();
      c.beginPath();
      c.arc(60, 80, 7, Math.PI + 0.4, -0.4);
      c.stroke();
    });
  },

  // ---- Objects ------------------------------------------------------------

  drawChest(c, open) {
    c.fillStyle = 'rgba(0,0,0,0.25)';
    ellipse(c, 32, 50, 28, 5);
    c.fill();
    c.fillStyle = '#8a5a2b';
    roundRect(c, 6, 24, 52, 26, 4);
    c.fill();
    c.fillStyle = '#d9a640';
    c.fillRect(6, 34, 52, 4);
    c.fillRect(28, 24, 8, 26);
    if (open) {
      c.fillStyle = '#5e3c1c';
      roundRect(c, 6, 6, 52, 20, 6);
      c.fill();
      c.shadowColor = '#ffe27a';
      c.shadowBlur = 12;
      c.fillStyle = '#ffe9a0';
      c.fillRect(10, 22, 44, 5);
      c.shadowBlur = 0;
    } else {
      c.fillStyle = '#a06a33';
      roundRect(c, 4, 12, 56, 16, 7);
      c.fill();
      c.fillStyle = '#d9a640';
      c.fillRect(28, 12, 8, 16);
      c.fillStyle = '#3a2410';
      c.fillRect(30, 30, 4, 6);
    }
  },

  drawWell(c) {
    c.fillStyle = 'rgba(0,0,0,0.25)';
    ellipse(c, 48, 94, 40, 8);
    c.fill();
    c.fillStyle = '#6b4a2b';
    c.fillRect(14, 20, 6, 60);
    c.fillRect(76, 20, 6, 60);
    c.fillStyle = '#b5473a';
    c.beginPath();
    c.moveTo(4, 26);
    c.lineTo(48, 4);
    c.lineTo(92, 26);
    c.closePath();
    c.fill();
    c.fillStyle = '#8f8f9f';
    ellipse(c, 48, 76, 38, 18);
    c.fill();
    c.fillStyle = '#6f6f80';
    c.fillRect(10, 76, 76, 14);
    ellipse(c, 48, 90, 38, 8);
    c.fill();
    c.shadowColor = '#5fb8ff';
    c.shadowBlur = 14;
    c.fillStyle = '#6fc8ff';
    ellipse(c, 48, 74, 28, 11);
    c.fill();
    c.shadowBlur = 0;
  },

  drawSign(c) {
    c.fillStyle = '#6b4a2b';
    c.fillRect(25, 24, 6, 38);
    c.fillStyle = '#b07a42';
    roundRect(c, 4, 6, 48, 28, 4);
    c.fill();
    c.strokeStyle = '#6b4a2b';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(12, 15);
    c.lineTo(44, 15);
    c.moveTo(12, 24);
    c.lineTo(38, 24);
    c.stroke();
  },

  drawPendant(c) {
    c.strokeStyle = '#d9e2ef';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(24, 16, 12, Math.PI * 0.1, Math.PI * 0.9, true);
    c.stroke();
    c.shadowColor = '#5fb8ff';
    c.shadowBlur = 12;
    c.fillStyle = '#3f8cff';
    c.beginPath();
    c.moveTo(24, 22);
    c.lineTo(34, 32);
    c.lineTo(24, 44);
    c.lineTo(14, 32);
    c.closePath();
    c.fill();
    c.shadowBlur = 0;
    c.fillStyle = 'rgba(255,255,255,0.7)';
    circle(c, 21, 30, 3);
    c.fill();
  },

  drawPotion(c) {
    c.fillStyle = '#c9a46a';
    c.fillRect(19, 2, 10, 8);
    c.fillStyle = 'rgba(220,235,255,0.6)';
    c.fillRect(17, 10, 14, 10);
    const g = c.createRadialGradient(20, 32, 2, 24, 36, 20);
    g.addColorStop(0, '#ff9aa8');
    g.addColorStop(1, '#d0284a');
    c.fillStyle = g;
    circle(c, 24, 36, 17);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.6)';
    circle(c, 17, 30, 4);
    c.fill();
  },

  drawCoin(c) {
    c.fillStyle = '#b8860b';
    circle(c, 16, 16, 14);
    c.fill();
    c.fillStyle = '#ffd86b';
    circle(c, 16, 16, 11);
    c.fill();
    c.fillStyle = '#b8860b';
    c.fillRect(14, 9, 4, 14);
  },

  drawSpark(c) {
    const g = c.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(140,210,255,0.9)');
    g.addColorStop(1, 'rgba(60,120,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 32, 32);
  },

  drawSword(c, weapon) {
    if (weapon.glow) {
      c.shadowColor = weapon.glow;
      c.shadowBlur = 12;
    }
    c.fillStyle = weapon.blade;
    c.beginPath();
    c.moveTo(20, 4);
    c.lineTo(27, 16);
    c.lineTo(27, 84);
    c.lineTo(13, 84);
    c.lineTo(13, 16);
    c.closePath();
    c.fill();
    c.shadowBlur = 0;
    c.fillStyle = 'rgba(255,255,255,0.5)';
    c.fillRect(19, 14, 2, 68);
    c.fillStyle = '#c9a43c';
    roundRect(c, 4, 84, 32, 7, 3);
    c.fill();
    c.fillStyle = '#6b4a2b';
    c.fillRect(16, 91, 8, 18);
    c.fillStyle = weapon.glow || '#c9a43c';
    circle(c, 20, 112, 5);
    c.fill();
  },

  drawNight(c) {
    const g = c.createLinearGradient(0, 0, 0, 800);
    g.addColorStop(0, '#050816');
    g.addColorStop(0.55, '#0d1a4a');
    g.addColorStop(1, '#1b2f7a');
    c.fillStyle = g;
    c.fillRect(0, 0, 360, 800);
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 120; i++) {
      c.fillStyle = 'rgba(200,225,255,' + (0.3 + rnd() * 0.7).toFixed(2) + ')';
      c.fillRect(rnd() * 360, rnd() * 520, rnd() < 0.15 ? 2 : 1, rnd() < 0.15 ? 2 : 1);
    }
    // distant hills and a castle on the horizon
    c.fillStyle = '#0a1238';
    c.beginPath();
    c.moveTo(0, 640);
    c.quadraticCurveTo(90, 560, 180, 620);
    c.quadraticCurveTo(270, 570, 360, 610);
    c.lineTo(360, 800);
    c.lineTo(0, 800);
    c.fill();
    c.fillStyle = '#070d2a';
    c.fillRect(250, 540, 12, 50);
    c.fillRect(270, 520, 14, 70);
    c.fillRect(292, 548, 12, 42);
    c.fillRect(250, 570, 54, 30);
    c.fillStyle = '#ff6a3d';
    c.fillRect(275, 532, 4, 5);
  },
};

// ---- Looks of the people --------------------------------------------------

const LOOKS = {
  leo: {
    skin: '#f2c9a0', tunic: '#e9e2cf', trim: '#2e6fd8', cape: '#1d3f9a', belt: '#5a3a1e',
    pants: '#34345a', boots: '#4a2e18', sword: true,
    // dark blue hair
    hair(c) {
      c.fillStyle = '#1b2a6b';
      c.beginPath();
      c.arc(48, 32, 22, Math.PI, 0);
      c.lineTo(70, 40);
      c.lineTo(62, 30);
      c.lineTo(56, 36);
      c.lineTo(50, 27);
      c.lineTo(42, 35);
      c.lineTo(36, 28);
      c.lineTo(26, 40);
      c.closePath();
      c.fill();
      c.fillStyle = '#3d5bd6';
      c.beginPath();
      c.arc(42, 22, 8, Math.PI * 1.1, Math.PI * 1.8);
      c.lineWidth = 3;
      c.strokeStyle = '#3d5bd6';
      c.stroke();
    },
  },
  elder: {
    skin: '#e8c3a0', tunic: '#5b3b8c', trim: '#c9a43c', robe: true, pants: '#3b2a5c', boots: '#3b2a5c', staff: true,
    hair(c) {
      c.fillStyle = '#eeeeee';
      c.beginPath();
      c.arc(48, 32, 21, Math.PI, 0);
      c.lineTo(69, 46);
      c.lineTo(62, 34);
      c.lineTo(34, 34);
      c.lineTo(27, 46);
      c.closePath();
      c.fill();
    },
    beard(c) {
      c.fillStyle = '#eeeeee';
      c.beginPath();
      c.moveTo(34, 44);
      c.quadraticCurveTo(48, 76, 62, 44);
      c.quadraticCurveTo(48, 52, 34, 44);
      c.fill();
    },
  },
  merchant: {
    skin: '#d9a77a', tunic: '#3f8f4f', trim: '#e9e2cf', belt: '#5a3a1e', pants: '#5a4a3a', boots: '#3a2a1a',
    hair(c) {
      c.fillStyle = '#5a3a1e';
      c.beginPath();
      c.arc(48, 32, 21, Math.PI, 0);
      c.closePath();
      c.fill();
    },
    hat(c) {
      c.fillStyle = '#8a5a2b';
      ellipse(c, 48, 20, 28, 6);
      c.fill();
      roundRect(c, 34, 4, 28, 16, 6);
      c.fill();
    },
  },
  mira: {
    skin: '#f0c8a8', tunic: '#e07a3a', trim: '#ffe0b0', robe: true, pants: '#a04a2a', boots: '#5a2e18',
    hair(c) {
      c.fillStyle = '#a0402a';
      c.beginPath();
      c.arc(48, 32, 22, Math.PI, 0);
      c.lineTo(72, 62);
      c.lineTo(62, 62);
      c.lineTo(62, 32);
      c.lineTo(34, 32);
      c.lineTo(34, 62);
      c.lineTo(24, 62);
      c.closePath();
      c.fill();
    },
  },
};

// ---- Tile painters --------------------------------------------------------

function speckle(c, T, seed, colors, count, size) {
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < count; i++) {
    c.fillStyle = colors[i % colors.length];
    c.fillRect(Math.floor(rnd() * (T - size)), Math.floor(rnd() * (T - size)), size, size);
  }
}

const TILE_PAINTERS = {
  grass(c, T, i) {
    c.fillStyle = '#5cb85c';
    c.fillRect(0, 0, T, T);
    speckle(c, T, i + 1, ['#6fcf6a', '#4fa64f'], 18, 3);
  },
  flowers(c, T, i) {
    TILE_PAINTERS.grass(c, T, i);
    const spots = [[10, 12, '#ff8ab3'], [32, 8, '#fff07a'], [22, 30, '#ffffff'], [38, 36, '#ff8ab3'], [8, 38, '#9fd0ff']];
    for (const [x, y, col] of spots) {
      c.fillStyle = col;
      circle(c, x, y, 3);
      c.fill();
      c.fillStyle = '#ffd34d';
      c.fillRect(x - 1, y - 1, 2, 2);
    }
  },
  path(c, T, i) {
    c.fillStyle = '#d6b27a';
    c.fillRect(0, 0, T, T);
    speckle(c, T, i + 3, ['#c49a5e', '#e4c595', '#b88c52'], 14, 4);
  },
  water(c, T) {
    c.fillStyle = '#2f7fd1';
    c.fillRect(0, 0, T, T);
    c.strokeStyle = '#6fb6ff';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(6, 14);
    c.quadraticCurveTo(12, 10, 18, 14);
    c.moveTo(26, 32);
    c.quadraticCurveTo(32, 28, 38, 32);
    c.stroke();
  },
  tree(c, T, i) {
    TILE_PAINTERS.grass(c, T, i);
    c.fillStyle = 'rgba(0,0,0,0.25)';
    ellipse(c, 24, 42, 18, 5);
    c.fill();
    c.fillStyle = '#7a5230';
    c.fillRect(20, 28, 8, 16);
    c.fillStyle = '#2e7d32';
    circle(c, 24, 20, 17);
    c.fill();
    c.fillStyle = '#3f9a44';
    circle(c, 18, 15, 9);
    c.fill();
    c.fillStyle = '#58b65c';
    circle(c, 16, 12, 4);
    c.fill();
  },
  roof(c, T) {
    c.fillStyle = '#b5473a';
    c.fillRect(0, 0, T, T);
    c.fillStyle = '#93362c';
    for (let y = 0; y < T; y += 12) {
      c.fillRect(0, y + 10, T, 2);
      for (let x = (y / 12) % 2 ? 0 : 12; x < T; x += 24) c.fillRect(x, y, 2, 12);
    }
  },
  wall(c, T) {
    c.fillStyle = '#ead6aa';
    c.fillRect(0, 0, T, T);
    c.fillStyle = '#7a5230';
    c.fillRect(0, 0, T, 4);
    c.fillRect(0, T - 4, T, 4);
    c.fillRect(0, 0, 4, T);
    c.fillStyle = '#4a3220';
    c.fillRect(14, 12, 20, 18);
    c.fillStyle = '#8fd3ff';
    c.fillRect(16, 14, 16, 14);
    c.fillStyle = '#4a3220';
    c.fillRect(23, 14, 2, 14);
  },
  door(c, T) {
    TILE_PAINTERS.wall(c, T);
    c.fillStyle = '#ead6aa';
    c.fillRect(10, 8, 28, 40);
    c.fillStyle = '#6b3f1f';
    roundRect(c, 12, 10, 24, 38, 10);
    c.fill();
    c.fillStyle = '#ffd86b';
    circle(c, 30, 30, 2);
    c.fill();
  },
  fence(c, T, i) {
    TILE_PAINTERS.grass(c, T, i);
    c.fillStyle = '#a0703c';
    c.fillRect(0, 16, T, 5);
    c.fillRect(0, 30, T, 5);
    c.fillStyle = '#7a5230';
    c.fillRect(6, 8, 7, 34);
    c.fillRect(34, 8, 7, 34);
  },
  bridge(c, T) {
    c.fillStyle = '#2f7fd1';
    c.fillRect(0, 0, T, T);
    c.fillStyle = '#a0703c';
    c.fillRect(0, 0, T, T);
    c.fillStyle = '#7a5230';
    for (let y = 0; y < T; y += 8) c.fillRect(0, y, T, 2);
  },
  meadow(c, T, i) {
    c.fillStyle = '#479e4a';
    c.fillRect(0, 0, T, T);
    speckle(c, T, i + 5, ['#5bb35b', '#3a8a3d'], 16, 3);
    c.strokeStyle = '#2f7a33';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(10, 40);
    c.lineTo(12, 32);
    c.moveTo(14, 40);
    c.lineTo(17, 33);
    c.moveTo(34, 22);
    c.lineTo(36, 14);
    c.stroke();
  },
  bramble(c, T, i) {
    TILE_PAINTERS.meadow(c, T, i);
    c.fillStyle = '#3a2350';
    circle(c, 16, 26, 14);
    c.fill();
    circle(c, 32, 24, 14);
    c.fill();
    c.strokeStyle = '#6a3d8a';
    c.lineWidth = 2;
    c.beginPath();
    for (let k = 0; k < 6; k++) {
      c.moveTo(8 + k * 6, 14);
      c.lineTo(12 + k * 6, 38);
    }
    c.stroke();
  },
};

// ---- Drawing helpers ------------------------------------------------------

function circle(c, x, y, r) {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
}

function ellipse(c, x, y, rx, ry) {
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
