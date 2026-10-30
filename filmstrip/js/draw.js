/* Filmstrip — drawing one frame of the video onto the canvas: a scene's
   photo, clip or title card, its words, its slow zoom or pan, and the
   transition from the scene before it. Nothing here keeps time; it is handed
   a time and draws what the video looks like then. */
(function (FS) {
  'use strict';

  const FONT = '"Bricolage Grotesque", "Arial Black", system-ui, sans-serif';
  const TRANS = 0.6; // seconds a transition takes

  const THEMES = [
    { id: 'ink', name: 'Night', a: '#17141f', b: '#2d2741', fg: '#ffffff' },
    { id: 'sunset', name: 'Sunset', a: '#ff8a5b', b: '#c2185b', fg: '#ffffff' },
    { id: 'ocean', name: 'Ocean', a: '#2a8cf0', b: '#0b2a55', fg: '#ffffff' },
    { id: 'forest', name: 'Forest', a: '#3d8b5f', b: '#123222', fg: '#ffffff' },
    { id: 'lemon', name: 'Lemon', a: '#fff1a8', b: '#ffc94d', fg: '#2a1f00' },
    { id: 'paper', name: 'Paper', a: '#fbf7ef', b: '#e9dfcc', fg: '#1d1a16' },
  ];
  const theme = (id) => THEMES.find((t) => t.id === id) || THEMES[0];

  const TEXT_SIZE = { S: 0.055, M: 0.075, L: 0.1 };

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const ease = (k) => k * k * (3 - 2 * k);

  // Draw a picture so it fills the frame (cover) or fits inside it (contain),
  // optionally zoomed by `scale` and shifted by `ox` (a fraction of the width).
  function place(ctx, src, sw, sh, W, H, fit, scale, ox) {
    if (!sw || !sh) return;
    const r = fit === 'contain' ? Math.min(W / sw, H / sh) : Math.max(W / sw, H / sh);
    const w = sw * r * scale;
    const h = sh * r * scale;
    ctx.drawImage(src, (W - w) / 2 + ox * W, (H - h) / 2, w, h);
  }

  function wrap(ctx, text, maxW) {
    const lines = [];
    for (const para of String(text).split('\n')) {
      const words = para.split(/\s+/).filter(Boolean);
      if (!words.length) {
        lines.push('');
        continue;
      }
      let line = words[0];
      for (let i = 1; i < words.length; i++) {
        const next = line + ' ' + words[i];
        if (ctx.measureText(next).width <= maxW) line = next;
        else {
          lines.push(line);
          line = words[i];
        }
      }
      lines.push(line);
    }
    while (lines.length && !lines[lines.length - 1]) lines.pop();
    return lines;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Words on screen. `look` is 'plain' (title cards), 'shadow' or 'box'.
  function drawText(ctx, sc, W, H, fg, look) {
    const m = Math.min(W, H);
    let size = (TEXT_SIZE[sc.size] || TEXT_SIZE.M) * m;
    const maxW = W * 0.84;
    let lines;
    for (;;) {
      ctx.font = `800 ${size}px ${FONT}`;
      lines = wrap(ctx, sc.text, maxW);
      if (lines.length * size * 1.2 <= H * 0.8 || size < 12) break;
      size *= 0.9;
    }
    if (!lines.length) return;
    const lh = size * 1.2;
    const block = lines.length * lh;
    const pos = sc.textPos || 'bottom';
    const y0 = pos === 'top' ? H * 0.09 : pos === 'middle' ? (H - block) / 2 : H * 0.91 - block;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    lines.forEach((ln, i) => {
      if (!ln) return;
      const y = y0 + i * lh + lh / 2;
      if (look === 'box') {
        const w = ctx.measureText(ln).width + size * 0.7;
        ctx.fillStyle = 'rgba(0,0,0,0.62)';
        roundRect(ctx, (W - w) / 2, y - lh / 2, w, lh, size * 0.22);
        ctx.fill();
      } else if (look === 'shadow') {
        ctx.shadowColor = 'rgba(0,0,0,0.7)';
        ctx.shadowBlur = size * 0.3;
        ctx.shadowOffsetY = size * 0.05;
      }
      ctx.fillStyle = fg;
      ctx.fillText(ln, W / 2, y);
    });
    ctx.restore();
  }

  // One scene, `local` seconds into it. `src` is its <img> or <video>.
  function drawScene(ctx, sc, local, W, H, src) {
    const len = FS.sceneLen(sc);
    const p = len > 0 ? clamp(local / len, 0, 1) : 0;
    ctx.save();
    if (sc.type === 'title') {
      const th = theme(sc.theme);
      const g = ctx.createLinearGradient(0, 0, W * 0.4, H);
      g.addColorStop(0, th.a);
      g.addColorStop(1, th.b);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      if (sc.text) {
        // The words drift up a touch and fade in.
        const k = ease(clamp(local / 0.7, 0, 1));
        ctx.globalAlpha *= k;
        ctx.translate(0, (1 - k) * H * 0.02);
        drawText(ctx, sc, W, H, th.fg, 'plain');
      }
      ctx.restore();
      return;
    }

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    if (src) {
      let scale = 1;
      let ox = 0;
      if (sc.type === 'photo') {
        const e = ease(p);
        if (sc.effect === 'zoom-in') scale = 1 + 0.18 * e;
        else if (sc.effect === 'zoom-out') scale = 1.18 - 0.18 * e;
        else if (sc.effect === 'pan') {
          scale = 1.16;
          ox = 0.06 - 0.12 * e;
        }
      }
      const sw = src.videoWidth || src.naturalWidth;
      const sh = src.videoHeight || src.naturalHeight;
      const ready = src.tagName === 'VIDEO' ? src.readyState >= 2 : src.complete;
      if (ready) place(ctx, src, sw, sh, W, H, sc.fit, scale, ox);
    }
    if (sc.text && sc.text.trim()) drawText(ctx, sc, W, H, '#ffffff', sc.look || 'shadow');
    ctx.restore();
  }

  // The whole frame at time t. `getSrc(scene)` returns its <img>/<video>.
  function drawFrame(ctx, tl, t, W, H, getSrc) {
    ctx.globalAlpha = 1;
    if (!tl.scenes.length) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      return;
    }
    const i = FS.indexAt(tl, t);
    const sc = tl.scenes[i];
    const local = t - tl.starts[i];
    const T = Math.min(TRANS, FS.sceneLen(sc) / 2);
    const tr = sc.transition || 'cut';

    if (tr === 'cut' || local >= T) {
      drawScene(ctx, sc, local, W, H, getSrc(sc));
      return;
    }

    const k = ease(clamp(local / T, 0, 1));
    if (i === 0) {
      // Nothing before the first scene, so every transition comes in from black.
      drawScene(ctx, sc, local, W, H, getSrc(sc));
      ctx.fillStyle = `rgba(0,0,0,${1 - k})`;
      ctx.fillRect(0, 0, W, H);
      return;
    }

    const prev = tl.scenes[i - 1];
    const drawPrev = () => drawScene(ctx, prev, FS.sceneLen(prev), W, H, getSrc(prev));
    const drawCur = () => drawScene(ctx, sc, local, W, H, getSrc(sc));
    ctx.save();
    if (tr === 'fade') {
      drawPrev();
      ctx.globalAlpha = k;
      drawCur();
    } else if (tr === 'slide') {
      ctx.save();
      ctx.translate(-W * k, 0);
      drawPrev();
      ctx.restore();
      ctx.translate(W * (1 - k), 0);
      drawCur();
    } else if (tr === 'zoom') {
      drawPrev();
      ctx.globalAlpha = k;
      const s = 1.3 - 0.3 * k;
      ctx.translate(W / 2, H / 2);
      ctx.scale(s, s);
      ctx.translate(-W / 2, -H / 2);
      drawCur();
    } else if (tr === 'dip') {
      if (k < 0.5) drawPrev();
      else drawCur();
      ctx.fillStyle = `rgba(0,0,0,${1 - Math.abs(k - 0.5) * 2})`;
      ctx.fillRect(0, 0, W, H);
    } else {
      drawCur();
    }
    ctx.restore();
  }

  FS.draw = { THEMES, theme, TRANS, FONT, drawFrame };
})(window.FS = window.FS || {});
