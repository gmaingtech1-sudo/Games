// Runs the real Anthropic SDK against a local stand-in for the Messages API
// (no network, no cost), to check the exact HTTP request and the parsing of
// a streamed reply with a tool call.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createAnthropicProvider } from '../src/providers/anthropic.js';

function sse(events) {
  return events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
}

test('real SDK: request shape and streamed text + tool_use parsing', async () => {
  let seen;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      seen = { url: req.url, headers: req.headers, body: JSON.parse(body) };
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.end(sse([
        { type: 'message_start', message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 12, output_tokens: 1, cache_read_input_tokens: 100, cache_creation_input_tokens: 0 } } },
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Opening ' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'it.' } },
        { type: 'content_block_stop', index: 0 },
        { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'toolu_1', name: 'open_app', input: {} } },
        { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"name":' } },
        { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '"notepad"}' } },
        { type: 'content_block_stop', index: 1 },
        { type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 20 } },
        { type: 'message_stop' },
      ]));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const provider = createAnthropicProvider({ apiKey: 'sk-ant-test', baseURL: `http://127.0.0.1:${server.address().port}` });
    let text = '';
    const out = await provider.stream({
      model: 'claude-opus-5-5',
      system: 'You are JARVIS.',
      messages: [{ role: 'user', content: 'open notepad' }],
      tools: [{ name: 'open_app', description: 'Open an app', input_schema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } }],
      webSearch: true,
      webSearchMaxUses: 5,
      effort: 'medium',
      maxTokens: 32000,
      onText: (t) => { text += t; },
    });

    assert.equal(seen.url, '/v1/messages?beta=true');
    assert.equal(seen.headers['x-api-key'], 'sk-ant-test');
    assert.match(seen.headers['anthropic-beta'], /server-side-fallback-2026-07-01/);
    assert.equal(seen.body.stream, true);
    assert.equal(seen.body.model, 'claude-opus-5-5');
    assert.equal(seen.body.fallbacks, 'default');
    assert.equal(seen.body.betas, undefined, 'betas travel as a header, not in the body');
    assert.deepEqual(seen.body.output_config, { effort: 'medium' });
    assert.equal(seen.body.tools[0].eager_input_streaming, true);
    assert.equal(seen.body.tools[1].type, 'web_search_20260209');

    assert.equal(text, 'Opening it.');
    assert.equal(out.stopReason, 'tool_use');
    assert.deepEqual(out.content[1], { type: 'tool_use', id: 'toolu_1', name: 'open_app', input: { name: 'notepad' } });
    assert.equal(out.usage.cacheReadTokens, 100);
    assert.equal(out.usage.outputTokens, 20);
  } finally {
    server.close();
  }
});

test('real SDK: HTTP 401 becomes a clear provider_auth error', async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(401, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const provider = createAnthropicProvider({ apiKey: 'bad', baseURL: `http://127.0.0.1:${server.address().port}` });
    await assert.rejects(
      provider.stream({ model: 'claude-opus-5-5', system: 's', messages: [{ role: 'user', content: 'x' }], tools: [], maxTokens: 10 }),
      { code: 'provider_auth' },
    );
  } finally {
    server.close();
  }
});
