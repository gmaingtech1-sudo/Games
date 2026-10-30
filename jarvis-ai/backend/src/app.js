// The HTTP API. Every route except /api/health and /api/auth/pair needs a
// paired device token (Authorization: Bearer jv_...). See docs/API.md.

import fs from 'node:fs';
import express from 'express';
import { createRateLimiter, newToken, requireDevice, safeEqual, sha256 } from './auth.js';
import { runChat, ChatInputError } from './chat.js';
import { DEFAULT_SETTINGS, MEMORY_KINDS } from './db.js';
import { STYLES } from './personas.js';
import { ProviderError } from './providers/errors.js';

export const VERSION = '1.0.0';
const PLATFORMS = new Set(['android', 'windows', 'web']);

function httpError(res, status, code, message, extra = {}) {
  return res.status(status).json({ error: { code, message, ...extra } });
}

function cleanString(v, max) {
  return typeof v === 'string' ? v.slice(0, max) : undefined;
}

export function createApp({ config, repo, providers, log = console }) {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);

  // Security headers.
  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    if (req.secure) res.set('Strict-Transport-Security', 'max-age=31536000');
    next();
  });

  // CORS: only the apps' own origins (and same-origin browser use).
  app.use('/api', (req, res, next) => {
    const origin = req.get('origin');
    if (origin && config.corsOrigins.includes(origin)) {
      res.set({
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Headers': 'authorization, content-type',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Max-Age': '600',
        Vary: 'Origin',
      });
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  app.use('/api', express.json({ limit: '3mb' }));

  // ---- public ----------------------------------------------------------
  app.get('/api/health', (req, res) => {
    res.set('Cache-Control', 'no-store').json({ ok: true, name: 'JARVIS AI backend', version: VERSION });
  });

  const pairLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 8 });
  app.post('/api/auth/pair', (req, res) => {
    const ip = req.ip || 'unknown';
    const limit = pairLimiter.check(ip);
    if (!limit.allowed) {
      res.set('Retry-After', String(limit.retryAfterSec));
      return httpError(res, 429, 'too_many_attempts', `Too many pairing attempts. Try again in ${Math.ceil(limit.retryAfterSec / 60)} minutes.`);
    }
    const { password, deviceName, platform } = req.body || {};
    if (typeof password !== 'string' || !config.password || !safeEqual(password, config.password)) {
      log.warn?.(`[auth] failed pairing attempt from ${ip}`);
      return httpError(res, 401, 'wrong_password', 'Wrong password.');
    }
    pairLimiter.reset(ip);
    const token = newToken();
    const device = repo.createDevice({
      name: cleanString(deviceName, 80)?.trim() || 'Unnamed device',
      platform: PLATFORMS.has(platform) ? platform : 'web',
      tokenHash: sha256(token),
    });
    log.info?.(`[auth] paired device ${device.id} (${device.name}, ${device.platform})`);
    res.status(201).json({ token, device });
  });

  // ---- everything below needs a paired device --------------------------
  const auth = requireDevice(repo);
  app.use('/api', auth);

  app.get('/api/auth/me', (req, res) => res.json({ device: req.device }));
  app.post('/api/auth/unpair', (req, res) => {
    repo.deleteDevice(req.device.id);
    res.json({ ok: true });
  });
  app.get('/api/devices', (req, res) => res.json({ devices: repo.listDevices(), currentId: req.device.id }));
  app.delete('/api/devices/:id', (req, res) => {
    if (!repo.deleteDevice(req.params.id)) return httpError(res, 404, 'not_found', 'Device not found');
    res.json({ ok: true });
  });

  app.get('/api/config', (req, res) => {
    res.json({
      version: VERSION,
      models: config.models.map(({ id, label, provider }) => ({ id, label, provider, webSearch: Boolean(providers[provider]?.supportsWebSearch) })),
      defaultModel: config.defaultModel,
      styles: Object.entries(STYLES).map(([id, s]) => ({ id, label: s.label, description: s.description })),
      memoryKinds: MEMORY_KINDS,
      features: { webSearch: config.webSearchAvailable, dailyBudgetUsd: config.dailyBudgetUsd || null },
    });
  });

  // ---- settings --------------------------------------------------------
  app.get('/api/settings', (req, res) => res.json({ settings: repo.getSettings() }));
  app.put('/api/settings', (req, res) => {
    const input = req.body || {};
    const next = {};
    for (const [key, def] of Object.entries(DEFAULT_SETTINGS)) {
      if (!(key in input)) continue;
      const v = input[key];
      if (typeof def === 'boolean') {
        if (typeof v !== 'boolean') return httpError(res, 400, 'bad_request', `${key} must be true or false`);
        next[key] = v;
      } else {
        if (typeof v !== 'string') return httpError(res, 400, 'bad_request', `${key} must be text`);
        next[key] = v.slice(0, key === 'customInstructions' ? 8000 : 120);
      }
    }
    if (next.style && !STYLES[next.style]) return httpError(res, 400, 'bad_request', 'Unknown style');
    if (next.model && !config.models.some((m) => m.id === next.model)) return httpError(res, 400, 'bad_request', 'Unknown model');
    res.json({ settings: repo.saveSettings(next) });
  });

  // ---- usage -----------------------------------------------------------
  app.get('/api/usage', (req, res) => {
    const month = new Date().toISOString().slice(0, 8) + '01';
    const days = repo.getUsageSince(month);
    res.json({
      today: repo.getUsage(),
      month: days.reduce((acc, d) => ({ cost_usd: acc.cost_usd + d.cost_usd, requests: acc.requests + d.requests }), { cost_usd: 0, requests: 0 }),
      dailyBudgetUsd: config.dailyBudgetUsd || null,
      note: 'Estimated from token counts and list prices. Your provider\'s billing page is the source of truth.',
    });
  });

  // ---- conversations ---------------------------------------------------
  app.get('/api/conversations', (req, res) => res.json({ conversations: repo.listConversations() }));
  app.get('/api/conversations/:id', (req, res) => {
    const c = repo.getConversation(req.params.id);
    if (!c) return httpError(res, 404, 'not_found', 'Conversation not found');
    res.json({ conversation: { id: c.id, title: c.title, created_at: c.created_at, updated_at: c.updated_at }, messages: repo.getDisplayMessages(c.id) });
  });
  app.patch('/api/conversations/:id', (req, res) => {
    const title = cleanString(req.body?.title, 120)?.trim();
    if (!title) return httpError(res, 400, 'bad_request', 'title is required');
    if (!repo.renameConversation(req.params.id, title)) return httpError(res, 404, 'not_found', 'Conversation not found');
    res.json({ ok: true });
  });
  app.delete('/api/conversations/:id', (req, res) => {
    if (!repo.deleteConversation(req.params.id)) return httpError(res, 404, 'not_found', 'Conversation not found');
    res.json({ ok: true });
  });
  app.delete('/api/conversations', (req, res) => res.json({ ok: true, deleted: repo.deleteAllConversations() }));

  // ---- memories --------------------------------------------------------
  const memoryInput = (body, partial) => {
    const out = {};
    if (body.kind !== undefined || !partial) {
      if (!MEMORY_KINDS.includes(body.kind)) return { error: `kind must be one of ${MEMORY_KINDS.join(', ')}` };
      out.kind = body.kind;
    }
    if (body.title !== undefined) {
      if (typeof body.title !== 'string') return { error: 'title must be text' };
      out.title = body.title.slice(0, 120);
    }
    if (body.content !== undefined || !partial) {
      if (typeof body.content !== 'string' || !body.content.trim()) return { error: 'content is required' };
      out.content = body.content.trim().slice(0, 4000);
    }
    return { value: out };
  };
  app.get('/api/memories', (req, res) => res.json({ memories: repo.listMemories() }));
  app.post('/api/memories', (req, res) => {
    const { value, error } = memoryInput(req.body || {}, false);
    if (error) return httpError(res, 400, 'bad_request', error);
    res.status(201).json({ memory: repo.addMemory({ ...value, source: 'user' }) });
  });
  app.put('/api/memories/:id', (req, res) => {
    const { value, error } = memoryInput(req.body || {}, true);
    if (error) return httpError(res, 400, 'bad_request', error);
    const memory = repo.updateMemory(req.params.id, value);
    if (!memory) return httpError(res, 404, 'not_found', 'Memory not found');
    res.json({ memory });
  });
  app.delete('/api/memories/:id', (req, res) => {
    if (!repo.deleteMemory(req.params.id)) return httpError(res, 404, 'not_found', 'Memory not found');
    res.json({ ok: true });
  });
  app.delete('/api/memories', (req, res) => res.json({ ok: true, deleted: repo.deleteAllMemories() }));

  // ---- privacy ---------------------------------------------------------
  app.get('/api/export', (req, res) => {
    res.set('Content-Disposition', `attachment; filename="jarvis-export-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json(repo.exportAll());
  });
  app.post('/api/delete-all-data', (req, res) => {
    if (req.body?.confirm !== 'DELETE') return httpError(res, 400, 'confirm_required', 'Send {"confirm":"DELETE"} to erase all data.');
    repo.deleteEverything({ keepDevices: req.body.keepDevices !== false });
    log.info?.(`[privacy] all data erased by device ${req.device.id}`);
    res.json({ ok: true });
  });

  // ---- chat (Server-Sent Events) ---------------------------------------
  app.post('/api/chat', async (req, res) => {
    const controller = new AbortController();
    let open = true;
    res.on('close', () => {
      open = false;
      if (!res.writableFinished) controller.abort();
    });
    res.status(200).set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
      Connection: 'keep-alive',
    });
    res.flushHeaders();
    const send = (event, data) => {
      if (open) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    const heartbeat = setInterval(() => open && res.write(': keep-alive\n\n'), 15000);

    try {
      await runChat({ config, repo, providers, body: req.body || {}, send, signal: controller.signal, platform: req.device.platform });
    } catch (err) {
      if (err instanceof ChatInputError) {
        send('error', { code: err.code, message: err.message, retryable: false });
      } else if (err instanceof ProviderError) {
        if (err.code !== 'aborted') log.warn?.(`[chat] provider error ${err.code}: ${err.message}`);
        send('error', { code: err.code, message: err.message, retryable: err.retryable });
      } else {
        log.error?.('[chat] unexpected error', err);
        send('error', { code: 'server_error', message: 'Something went wrong on the JARVIS server. Check the server log.', retryable: true });
      }
    } finally {
      clearInterval(heartbeat);
      if (open) res.end();
    }
  });

  app.use('/api', (req, res) => httpError(res, 404, 'not_found', 'No such API route'));

  // Optional: the same web UI the apps use, for a browser on any device.
  if (config.serveWebUi && fs.existsSync(config.webUiDir)) {
    app.use(express.static(config.webUiDir, { index: 'index.html', maxAge: '1h' }));
  }

  // Malformed JSON and other errors.
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (err.type === 'entity.parse.failed') return httpError(res, 400, 'bad_json', 'Request body is not valid JSON');
    if (err.type === 'entity.too.large') return httpError(res, 413, 'too_large', 'Request is too large');
    log.error?.('[http] unexpected error', err);
    httpError(res, 500, 'server_error', 'Internal server error');
  });

  return app;
}
