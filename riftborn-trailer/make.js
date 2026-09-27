// Renders the Riftborn trailer to riftborn-trailer.mp4.
//
//   node make.js                 the whole trailer
//   node make.js preview 3 9 17  just those seconds, as preview-*.jpg
//
// Needs Playwright (with Chromium) and ffmpeg. Serves the repository on
// localhost, draws every frame with trailer.html (window.frame), mixes a
// soundtrack from scratch (soundtrack.js) and encodes an H.264 MP4.
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const soundtrack = require('./soundtrack');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'riftborn-trailer.mp4');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml', '.css': 'text/css' };

function serve() {
  const server = http.createServer((req, res) => {
    const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

(async () => {
  const preview = process.argv[2] === 'preview';
  const server = await serve();
  const url = `http://127.0.0.1:${server.address().port}/riftborn-trailer/trailer.html`;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 720, height: 1280 } });
  page.on('pageerror', (e) => console.log('page error:', e.message));
  await page.goto(url);
  await page.evaluate(() => document.fonts.ready);
  const { FPS, frames } = await page.evaluate(() => window.TRAILER);
  const dir = path.join(__dirname, preview ? '.' : 'frames');
  fs.mkdirSync(dir, { recursive: true });
  const want = preview ? process.argv.slice(3).map((s) => Math.round(+s * FPS)) : null;
  const last = preview ? Math.max(...want) : frames - 1;
  const t0 = Date.now();
  for (let i = 0; i <= last; i++) {
    const draw = !preview || want.includes(i);
    await page.evaluate(([f, d]) => window.frame(f, d), [i, draw]);
    if (!draw) continue;
    const name = preview ? `preview-${(i / FPS).toFixed(1)}s.jpg` : `f${String(i).padStart(4, '0')}.jpg`;
    await page.screenshot({ path: path.join(dir, name), type: 'jpeg', quality: 92, timeout: 300000 });
    if (!preview && i % 48 === 0) console.log(`frame ${i}/${frames} (${Math.round((Date.now() - t0) / 1000)} s)`);
  }
  await browser.close();
  server.close();
  if (preview) return;

  const wav = path.join(__dirname, 'soundtrack.wav');
  fs.writeFileSync(wav, soundtrack.render(frames / FPS));
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(dir, 'f%04d.jpg'), '-i', wav,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    '-c:a', 'aac', '-b:a', '160k', '-shortest', OUT]);
  fs.rmSync(dir, { recursive: true });
  fs.rmSync(wav);
  console.log(`Wrote ${OUT} (${Math.round(fs.statSync(OUT).size / 1024)} KB)`);
})();
