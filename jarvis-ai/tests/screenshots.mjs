// Takes screenshots of the UI (desktop + phone) against a running backend in mock mode.
// Usage: node tests/screenshots.mjs http://127.0.0.1:8787 ./shots   (password: demo-password-123)
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const base = process.argv[2]; const out = process.argv[3];
const browser = await chromium.launch();
for (const [name, vp] of [['desktop', { width: 1280, height: 800 }], ['phone', { width: 390, height: 844 }]]) {
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(base);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/${name}-1-pair.png` });
  await page.fill('#pairPassword', 'demo-password-123');
  await page.click('#pairSubmit');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/${name}-2-home.png` });
  await page.fill('#input', 'Write a **test** reply please');
  await page.click('#btnSend');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/${name}-3-streaming.png` });
  await page.waitForSelector('.msg.assistant:not(.streaming)', { timeout: 10000 });
  await page.screenshot({ path: `${out}/${name}-4-reply.png` });
  await page.click('#btnSettings');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/${name}-5-settings.png` });
  console.log(name, 'errors:', JSON.stringify(errors));
  await page.close();
}
await browser.close();
