// Test helpers: an in-memory backend on a random port, and an SSE reader.

import { loadConfig } from '../src/config.js';
import { openDatabase } from '../src/db.js';
import { createProviders } from '../src/providers/index.js';
import { createApp } from '../src/app.js';

export const PASSWORD = 'correct-horse-battery-staple';
const quietLog = { info() {}, warn() {}, error() {} };

export async function startServer({ env = {}, providers: overrides = {} } = {}) {
  const config = loadConfig({
    NODE_ENV: 'test',
    JARVIS_PASSWORD: PASSWORD,
    AI_MODELS: 'mock:jarvis-mock|Mock,anthropic:claude-opus-5-5|Claude Opus 5.5',
    SERVE_WEB_UI: 'false',
    ...env,
  });
  const repo = openDatabase(':memory:');
  const providers = createProviders(config, overrides);
  const app = createApp({ config, repo, providers, log: quietLog });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    base,
    repo,
    config,
    close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(() => { repo.close(); r(); }); }),
    async pair(name = 'Test phone', platform = 'android') {
      const res = await fetch(`${base}/api/auth/pair`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: PASSWORD, deviceName: name, platform }),
      });
      if (res.status !== 201) throw new Error(`pair failed ${res.status}`);
      return (await res.json()).token;
    },
  };
}

export function api(base, token) {
  return async (method, path, body) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
  };
}

// POST /api/chat and collect the SSE events. `onEvent` may return true to abort.
export async function chat(base, token, body, { onEvent } = {}) {
  const controller = new AbortController();
  const res = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: controller.signal,
  });
  const events = [];
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for await (const chunk of res.body) {
      buffer += decoder.decode(chunk, { stream: true });
      let idx;
      while ((idx = buffer.indexOf('\n\n')) >= 0) {
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const ev = /^event: (.+)$/m.exec(raw)?.[1];
        const data = /^data: (.+)$/m.exec(raw)?.[1];
        if (!ev) continue;
        const e = { event: ev, data: JSON.parse(data) };
        events.push(e);
        if (onEvent?.(e)) controller.abort();
      }
    }
  } catch (err) {
    if (err.name !== 'AbortError') throw err;
  }
  const of = (name) => events.filter((e) => e.event === name).map((e) => e.data);
  return { status: res.status, events, of, text: of('delta').map((d) => d.text).join('') };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
