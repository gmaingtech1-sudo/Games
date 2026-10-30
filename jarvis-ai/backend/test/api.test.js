import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, api, PASSWORD } from './helpers.js';

describe('auth and pairing', () => {
  let srv;
  before(async () => { srv = await startServer(); });
  after(() => srv.close());

  test('health is public and leaks nothing sensitive', async () => {
    const r = await api(srv.base)('GET', '/api/health');
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.body).sort(), ['name', 'ok', 'version']);
  });

  test('protected routes need a device token', async () => {
    for (const path of ['/api/config', '/api/settings', '/api/memories', '/api/conversations', '/api/export']) {
      const r = await api(srv.base)('GET', path);
      assert.equal(r.status, 401, path);
    }
    const bad = await api(srv.base, 'jv_not-a-real-token')('GET', '/api/config');
    assert.equal(bad.status, 401);
  });

  test('wrong password is rejected, right one returns a working token', async () => {
    const wrong = await api(srv.base)('POST', '/api/auth/pair', { password: 'nope', deviceName: 'x' });
    assert.equal(wrong.status, 401);
    const token = await srv.pair('My phone', 'android');
    assert.match(token, /^jv_/);
    const me = await api(srv.base, token)('GET', '/api/auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.body.device.name, 'My phone');
    assert.equal(me.body.device.platform, 'android');
  });

  test('tokens are stored hashed, not in plain text', async () => {
    const token = await srv.pair();
    const rows = srv.repo.raw.prepare('SELECT token_hash FROM devices').all();
    assert.ok(rows.every((r) => r.token_hash !== token && /^[0-9a-f]{64}$/.test(r.token_hash)));
  });

  test('a device can be revoked', async () => {
    const a = await srv.pair('A');
    const b = await srv.pair('B');
    const list = await api(srv.base, a)('GET', '/api/devices');
    const idB = list.body.devices.find((d) => d.name === 'B').id;
    assert.equal((await api(srv.base, a)('DELETE', `/api/devices/${idB}`)).status, 200);
    assert.equal((await api(srv.base, b)('GET', '/api/config')).status, 401);
    assert.equal((await api(srv.base, a)('POST', '/api/auth/unpair')).status, 200);
    assert.equal((await api(srv.base, a)('GET', '/api/config')).status, 401);
  });
});

test('pairing is rate limited', async () => {
  const srv = await startServer();
  try {
    const call = api(srv.base);
    let last;
    for (let i = 0; i < 9; i++) last = await call('POST', '/api/auth/pair', { password: 'guess' + i });
    assert.equal(last.status, 429);
    const blocked = await call('POST', '/api/auth/pair', { password: PASSWORD });
    assert.equal(blocked.status, 429, 'even the right password waits out the window');
  } finally {
    await srv.close();
  }
});

describe('settings, memories, conversations, privacy', () => {
  let srv, call;
  before(async () => {
    srv = await startServer();
    call = api(srv.base, await srv.pair());
  });
  after(() => srv.close());

  test('config lists models and styles but no secrets', async () => {
    const r = await call('GET', '/api/config');
    assert.equal(r.status, 200);
    assert.ok(r.body.models.some((m) => m.id === 'anthropic:claude-opus-5-5'));
    assert.ok(r.body.styles.some((s) => s.id === 'unity'));
    assert.doesNotMatch(JSON.stringify(r.body), /api_?key|password/i);
  });

  test('settings round-trip and validation', async () => {
    const def = await call('GET', '/api/settings');
    assert.equal(def.body.settings.assistantName, 'JARVIS');
    const r = await call('PUT', '/api/settings', { assistantName: 'FRIDAY', style: 'unity', memoryEnabled: false, bogus: 1 });
    assert.equal(r.status, 200);
    assert.equal(r.body.settings.assistantName, 'FRIDAY');
    assert.equal(r.body.settings.memoryEnabled, false);
    assert.equal(r.body.settings.bogus, undefined);
    assert.equal((await call('PUT', '/api/settings', { style: 'nope' })).status, 400);
    assert.equal((await call('PUT', '/api/settings', { model: 'evil:model' })).status, 400);
    assert.equal((await call('PUT', '/api/settings', { memoryEnabled: 'yes' })).status, 400);
    await call('PUT', '/api/settings', { assistantName: 'JARVIS', style: 'jarvis', memoryEnabled: true });
  });

  test('memories: create, edit, delete, clear', async () => {
    const created = await call('POST', '/api/memories', { kind: 'project', title: 'Space game', content: 'A Unity 2D shooter' });
    assert.equal(created.status, 201);
    assert.equal(created.body.memory.source, 'user');
    assert.equal((await call('POST', '/api/memories', { kind: 'secret', content: 'x' })).status, 400);
    assert.equal((await call('POST', '/api/memories', { kind: 'fact', content: '   ' })).status, 400);
    const id = created.body.memory.id;
    const edited = await call('PUT', `/api/memories/${id}`, { content: 'A Unity 3D shooter' });
    assert.equal(edited.body.memory.content, 'A Unity 3D shooter');
    assert.equal(edited.body.memory.title, 'Space game');
    await call('POST', '/api/memories', { kind: 'fact', content: 'Likes cats' });
    assert.equal((await call('GET', '/api/memories')).body.memories.length, 2);
    assert.equal((await call('DELETE', `/api/memories/${id}`)).status, 200);
    assert.equal((await call('DELETE', `/api/memories/${id}`)).status, 404);
    assert.equal((await call('DELETE', '/api/memories')).body.deleted, 1);
  });

  test('export and delete-all-data', async () => {
    await call('POST', '/api/memories', { kind: 'fact', content: 'Lives in Leeds' });
    const exp = await call('GET', '/api/export');
    assert.equal(exp.status, 200);
    assert.equal(exp.body.memories[0].content, 'Lives in Leeds');
    assert.match(exp.headers.get('content-disposition'), /attachment/);
    assert.equal((await call('POST', '/api/delete-all-data', {})).status, 400, 'needs explicit confirmation');
    assert.equal((await call('POST', '/api/delete-all-data', { confirm: 'DELETE' })).status, 200);
    assert.equal((await call('GET', '/api/memories')).body.memories.length, 0);
    assert.equal((await call('GET', '/api/config')).status, 200, 'device stays paired');
  });

  test('bad JSON gives a clear 400', async () => {
    const res = await fetch(`${srv.base}/api/auth/pair`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{oops' });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.code, 'bad_json');
  });
});

test('CORS only allows the apps\' origins', async () => {
  const srv = await startServer();
  try {
    const ok = await fetch(`${srv.base}/api/health`, { headers: { origin: 'https://appassets.androidplatform.net' } });
    assert.equal(ok.headers.get('access-control-allow-origin'), 'https://appassets.androidplatform.net');
    const evil = await fetch(`${srv.base}/api/health`, { headers: { origin: 'https://evil.example' } });
    assert.equal(evil.headers.get('access-control-allow-origin'), null);
    const pre = await fetch(`${srv.base}/api/chat`, { method: 'OPTIONS', headers: { origin: 'https://jarvis.app.local' } });
    assert.equal(pre.status, 204);
  } finally {
    await srv.close();
  }
});
