// End-to-end tests of the shared UI in headless Chromium against the real
// backend (mock AI provider). A fake "native host" implements the same
// bridge protocol as the Android and Windows apps, so voice and PC-tool
// flows are exercised too.
//
// Run: node --test tests/ui.test.mjs   (needs Playwright + Chromium installed)

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../backend/src/config.js';
import { openDatabase } from '../backend/src/db.js';
import { createProviders } from '../backend/src/providers/index.js';
import { createApp } from '../backend/src/app.js';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const PASSWORD = 'ui-test-password-123';

let server, base, browser, repo;

before(async () => {
  const config = loadConfig({
    NODE_ENV: 'test', JARVIS_PASSWORD: PASSWORD, AI_PROVIDER: 'mock',
    WEB_UI_DIR: path.resolve(here, '../shared/ui'),
  });
  repo = openDatabase(':memory:');
  const app = createApp({ config, repo, providers: createProviders(config), log: { info() {}, warn() {}, error() {} } });
  server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  server?.closeAllConnections?.();
  await new Promise((r) => server.close(r));
});

// A stand-in for the Windows app's WebView2 host.
function fakeWindowsHost() {
  window.__calls = [];
  const listeners = [];
  const reply = (msg) => setTimeout(() => listeners.forEach((fn) => fn({ data: JSON.stringify(msg) })), 0);
  window.__emit = (event, data) => reply({ event, data });
  const store = {};
  window.chrome = {
    webview: {
      addEventListener: (type, fn) => listeners.push(fn),
      postMessage(raw) {
        const { id, method, params } = JSON.parse(raw);
        window.__calls.push({ method, params });
        const ok = (result) => reply({ id, result });
        switch (method) {
          case 'host.info': return ok({ platform: 'windows', version: 'test', capabilities: { stt: true, tts: true, wakeWord: true, pcTools: true, files: true, secureStorage: true, permissions: true } });
          case 'storage.get': return ok(store[params.key] ?? null);
          case 'storage.set': store[params.key] = params.value; return ok(true);
          case 'storage.remove': delete store[params.key]; return ok(true);
          case 'tts.voices': return ok([{ id: 'v1', name: 'Test Voice', lang: 'en-GB' }]);
          case 'tts.speak': ok(true); window.__emit('tts.start', { id: params.id }); return setTimeout(() => window.__emit('tts.done', { id: params.id }), 30);
          case 'stt.start': ok(true); return setTimeout(() => { window.__emit('stt.partial', { text: 'hello' }); window.__emit('stt.final', { text: 'hello from my voice' }); }, 50);
          case 'tools.list': return ok([{ name: 'open_app', description: 'Open an approved app', input_schema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } }]);
          case 'tools.execute':
            if (window.__holdTools) { window.__pendingToolReply = () => ok({ content: 'late', isError: false }); return undefined; }
            return ok({ content: `Opened ${params.call.input.name}`, isError: false });
          case 'tools.cancel': return ok(true);
          case 'app.permission': return ok({ microphone: 'granted' });
          default: return ok(null);
        }
      },
    },
  };
}

async function newPage({ viewport = { width: 1200, height: 800 }, host } = {}) {
  const page = await browser.newPage({ viewport });
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) page.errors.push(m.text()); });
  if (host) await page.addInitScript(host);
  await page.goto(base);
  return page;
}

async function pairPage(page) {
  await page.waitForSelector('#pairModal:not([hidden])');
  await page.fill('#pairUrl', base);
  await page.fill('#pairPassword', PASSWORD);
  await page.click('#pairSubmit');
  await page.waitForSelector('#connDot[data-conn="online"]');
}

async function sendAndWait(page, text) {
  const before = await page.locator('.msg.assistant').count();
  await page.fill('#input', text);
  await page.click('#btnSend');
  await page.waitForFunction((n) => document.querySelectorAll('.msg.assistant:not(.streaming)').length > n && !document.querySelector('.msg.assistant.streaming'), before);
}

test('pairing: wrong password shows a clear error, right one connects', async () => {
  const page = await newPage();
  await page.waitForSelector('#pairModal:not([hidden])');
  await page.fill('#pairPassword', 'wrong');
  await page.click('#pairSubmit');
  await page.waitForSelector('#pairError:not([hidden])');
  assert.match(await page.textContent('#pairError'), /Wrong password/);
  await page.fill('#pairPassword', PASSWORD);
  await page.click('#pairSubmit');
  await page.waitForSelector('#connDot[data-conn="online"]');
  assert.equal(await page.textContent('#statusChip'), 'IDLE');
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('chat streams a reply, renders Markdown safely and keeps history', async () => {
  const page = await newPage();
  await pairPage(page);
  await sendAndWait(page, 'Show **bold** and <img src=x onerror="window.__xss=1"> please');
  const bubble = page.locator('.msg.assistant .bubble').last();
  assert.match(await bubble.innerText(), /Demo mode/);
  assert.equal(await bubble.locator('strong').first().textContent(), 'bold');
  assert.equal(await page.locator('.msg img').count(), 0, 'no HTML injected');
  assert.equal(await page.evaluate(() => window.__xss), undefined);
  // History drawer lists and reopens it.
  await page.click('#btnNew');
  assert.equal(await page.locator('.msg').count(), 0);
  await page.click('#btnHistory');
  await page.locator('.drawer .list-item.clickable').first().click();
  await page.waitForSelector('.msg.user');
  assert.match(await page.locator('.msg.user .bubble').first().innerText(), /Show \*\*bold\*\*/);
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('memory: saved by the assistant with Undo, editable in the Memory drawer', async () => {
  const page = await newPage();
  await pairPage(page);
  await sendAndWait(page, 'remember that my game is called Rift Runner');
  await page.waitForSelector('.event-card.ok');
  assert.match(await page.locator('.event-card.ok').innerText(), /my game is called Rift Runner/);
  await page.click('#btnMemory');
  await page.waitForSelector('.drawer .list-item');
  assert.match(await page.locator('.drawer').innerText(), /my game is called Rift Runner/);
  // Edit it.
  await page.locator('.drawer .list-item button', { hasText: 'Edit' }).first().click();
  await page.locator('.drawer .list-item textarea').fill('My game is Rift Runner 2');
  await page.locator('.drawer .list-item button', { hasText: 'Save' }).click();
  await page.waitForFunction(() => document.querySelector('.drawer').innerText.includes('Rift Runner 2'));
  const mems = repo.listMemories();
  assert.ok(mems.some((m) => m.content === 'My game is Rift Runner 2'));
  // Delete it.
  await page.locator('.drawer .list-item [aria-label="Delete memory"]').first().click();
  await page.waitForFunction(() => !document.querySelector('.drawer').innerText.includes('Rift Runner 2'));
  assert.equal(repo.listMemories().filter((m) => m.content.includes('Rift')).length, 0);
  await page.close();
});

test('settings: renaming the assistant updates the interface', async () => {
  const page = await newPage();
  await pairPage(page);
  await page.click('#btnSettings');
  const name = page.locator('.drawer label.field', { hasText: 'Assistant name' }).locator('input');
  await name.fill('Friday');
  await page.locator('.drawer button', { hasText: /^Save$/ }).first().click();
  await page.waitForFunction(() => document.querySelector('#brandName').textContent === 'FRIDAY');
  await page.locator('.drawer label.field', { hasText: 'Assistant name' }).locator('input').fill('JARVIS');
  await page.locator('.drawer button', { hasText: /^Save$/ }).first().click();
  await page.waitForFunction(() => document.querySelector('#brandName').textContent === 'JARVIS');
  await page.close();
});

test('native host: voice input sends the message and replies are spoken', async () => {
  const page = await newPage({ host: fakeWindowsHost });
  await pairPage(page);
  await page.click('#btnVoiceReplies');
  await page.click('#btnMic');
  await page.waitForFunction(() => [...document.querySelectorAll('.msg.user .bubble')].some((b) => b.textContent === 'hello from my voice'));
  await page.waitForFunction(() => document.querySelector('.msg.assistant:not(.streaming)'));
  await page.waitForFunction(() => window.__calls.some((c) => c.method === 'tts.speak'));
  const spoken = await page.evaluate(() => window.__calls.filter((c) => c.method === 'tts.speak').map((c) => c.params.text).join(' '));
  assert.match(spoken, /Demo mode/);
  assert.doesNotMatch(spoken, /[*`#]/, 'markup is stripped before speaking');
  const token = await page.evaluate(() => window.__calls.find((c) => c.method === 'storage.set')?.params);
  assert.equal(token.key, 'token', 'the device token goes to the native secure store');
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('native host: PC tool request is executed by the host and the turn continues', async () => {
  const page = await newPage({ host: fakeWindowsHost });
  await pairPage(page);
  await page.fill('#input', 'open notepad');
  await page.click('#btnSend');
  await page.waitForFunction(() => document.body.innerText.includes('ACTION DONE'));
  await page.waitForFunction(() => document.body.innerText.includes('succeeded: Opened notepad'));
  const exec = await page.evaluate(() => window.__calls.find((c) => c.method === 'tools.execute').params.call);
  assert.equal(exec.name, 'open_app');
  assert.deepEqual(exec.input, { name: 'notepad' });
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('native host: emergency stop while waiting for approval cancels the action', async () => {
  const page = await newPage({ host: fakeWindowsHost });
  await pairPage(page);
  await page.evaluate(() => { window.__holdTools = true; });
  await page.fill('#input', 'open calculator');
  await page.click('#btnSend');
  await page.waitForFunction(() => document.body.innerText.includes('Waiting for your approval'));
  await page.evaluate(() => { window.__emit('emergency.stop', {}); window.__pendingToolReply(); });
  await page.waitForFunction(() => document.body.innerText.includes('Remaining actions were cancelled'));
  await page.waitForTimeout(300);
  const followUps = await page.evaluate(() => document.querySelectorAll('.msg.assistant').length);
  assert.equal(followUps, 1, 'no further AI turn after the stop');
  assert.equal(await page.textContent('#statusChip'), 'IDLE');
  await page.close();
});

test('offline: a server that goes away is reported, not hidden', async () => {
  const page = await newPage();
  await pairPage(page);
  await page.route('**/api/chat', (route) => route.abort('connectionrefused'));
  await page.route('**/api/health', (route) => route.abort('connectionrefused'));
  await page.fill('#input', 'are you there?');
  await page.click('#btnSend');
  await page.waitForSelector('.event-card.error');
  assert.match(await page.locator('.event-card.error').innerText(), /Can't reach the JARVIS server/);
  await page.waitForFunction(() => document.querySelector('#statusChip').textContent === 'OFFLINE');
  assert.equal(await page.locator('.event-card.error button', { hasText: 'Retry' }).count(), 1);
  await page.close();
});

test('offline demo works without a server and says it is not AI', async () => {
  const page = await newPage();
  await page.waitForSelector('#pairModal:not([hidden])');
  await page.click('#pairDemo');
  await page.waitForSelector('#connDot[data-conn="demo"]');
  await sendAndWait(page, 'hi');
  assert.match(await page.locator('.msg.assistant .bubble').last().innerText(), /offline demo/i);
  await page.close();
});

test('phone layout: no horizontal scrolling and the controls fit', async () => {
  const page = await newPage({ viewport: { width: 360, height: 740 } });
  await pairPage(page);
  await sendAndWait(page, 'A message with a very long unbroken word: ' + 'x'.repeat(200));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 0, `page overflows horizontally by ${overflow}px`);
  for (const sel of ['#btnMic', '#btnSend', '#btnSettings', '#input']) {
    const box = await page.locator(sel).boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= 360, `${sel} is on screen`);
  }
  assert.deepEqual(page.errors, []);
  await page.close();
});
