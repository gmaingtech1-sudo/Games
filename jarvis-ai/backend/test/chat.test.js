import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, api, chat } from './helpers.js';
import { createMockProvider } from '../src/providers/mock.js';
import { ProviderError } from '../src/providers/errors.js';

const OPEN_APP = {
  name: 'open_app',
  description: 'Open an approved application',
  input_schema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
};

describe('chat over SSE (mock provider)', () => {
  let srv, token, call;
  before(async () => {
    srv = await startServer();
    token = await srv.pair('Desk', 'windows');
    call = api(srv.base, token);
  });
  after(() => srv.close());

  test('streams a reply and stores the conversation', async () => {
    const r = await chat(srv.base, token, { message: 'Hello there', model: 'mock:jarvis-mock' });
    assert.equal(r.status, 200);
    const [conv] = r.of('conversation');
    assert.ok(conv.id);
    assert.equal(conv.title, 'Hello there');
    assert.ok(r.of('status').some((s) => s.state === 'thinking'));
    assert.match(r.text, /Demo mode/);
    assert.equal(r.of('done')[0].stopReason, 'end_turn');

    const list = await call('GET', '/api/conversations');
    assert.equal(list.body.conversations[0].id, conv.id);
    const detail = await call('GET', `/api/conversations/${conv.id}`);
    assert.deepEqual(detail.body.messages.map((m) => m.role), ['user', 'assistant']);
    assert.equal(detail.body.messages[0].text, 'Hello there');

    const second = await chat(srv.base, token, { conversationId: conv.id, message: 'Again', model: 'mock:jarvis-mock' });
    assert.equal(second.of('conversation')[0].id, conv.id);
    assert.equal((await call('GET', `/api/conversations/${conv.id}`)).body.messages.length, 4);
  });

  test('the model can save a memory, and the app is told about it', async () => {
    const r = await chat(srv.base, token, { message: 'Please remember that my favourite engine is Unity.', model: 'mock:jarvis-mock' });
    const [mem] = r.of('memory');
    assert.equal(mem.action, 'saved');
    assert.equal(mem.memory.content, 'my favourite engine is Unity');
    assert.equal(mem.memory.source, 'assistant');
    assert.ok(r.of('done').length, 'turn continues after the server-side tool');
    const memories = (await call('GET', '/api/memories')).body.memories;
    assert.ok(memories.some((m) => m.content === 'my favourite engine is Unity'));
  });

  test('memory tools are not offered when memory is off', async () => {
    await call('PUT', '/api/settings', { memoryEnabled: false });
    const before = (await call('GET', '/api/memories')).body.memories.length;
    const r = await chat(srv.base, token, { message: 'remember that I hate broccoli', model: 'mock:jarvis-mock' });
    assert.equal(r.of('memory').length, 0);
    assert.equal((await call('GET', '/api/memories')).body.memories.length, before);
    await call('PUT', '/api/settings', { memoryEnabled: true });
  });

  test('client tools: request goes to the app, results continue the turn', async () => {
    const first = await chat(srv.base, token, { message: 'open notepad', clientTools: [OPEN_APP], model: 'mock:jarvis-mock' });
    const [req] = first.of('tool_request');
    assert.equal(req.calls[0].name, 'open_app');
    assert.deepEqual(req.calls[0].input, { name: 'notepad' });
    assert.equal(first.of('done')[0].stopReason, 'tool_use');
    const convId = first.of('conversation')[0].id;

    const second = await chat(srv.base, token, {
      conversationId: convId,
      toolResults: [{ id: req.calls[0].id, content: 'Opened Notepad', isError: false }],
      clientTools: [OPEN_APP],
      model: 'mock:jarvis-mock',
    });
    assert.match(second.text, /succeeded: Opened Notepad/);
    assert.equal(second.of('done')[0].stopReason, 'end_turn');

    const again = await chat(srv.base, token, { conversationId: convId, toolResults: [], model: 'mock:jarvis-mock' });
    assert.equal(again.of('error')[0].code, 'no_pending_tools');
  });

  test('a new message while a tool is waiting cancels the tool call cleanly', async () => {
    const first = await chat(srv.base, token, { message: 'open calculator', clientTools: [OPEN_APP], model: 'mock:jarvis-mock' });
    const convId = first.of('conversation')[0].id;
    const callId = first.of('tool_request')[0].calls[0].id;
    await chat(srv.base, token, { conversationId: convId, message: 'never mind', model: 'mock:jarvis-mock' });
    const apiMessages = srv.repo.getApiMessages(convId);
    const cancelTurn = apiMessages.find((m) => m.role === 'user' && m.content.some((b) => b.type === 'tool_result' && b.tool_use_id === callId));
    assert.ok(cancelTurn, 'tool_use got a matching tool_result');
    assert.ok(cancelTurn.content.some((b) => b.type === 'text' && b.text === 'never mind'), 'in the same user turn');
  });

  test('unknown client tools and bad input are rejected', async () => {
    const r = await chat(srv.base, token, { message: 'hi', clientTools: [{ name: 'save_memory', description: 'x', input_schema: { type: 'object' } }] });
    assert.equal(r.of('error')[0].code, 'bad_request');
    const empty = await chat(srv.base, token, {});
    assert.equal(empty.of('error')[0].code, 'bad_request');
    const missing = await chat(srv.base, token, { conversationId: 'conv_missing', message: 'hi' });
    assert.equal(missing.of('error')[0].code, 'not_found');
  });

  test('attachments are passed to the model and listed for display', async () => {
    const r = await chat(srv.base, token, { message: 'Review this', attachments: [{ name: 'Player.cs', text: 'class Player {}' }], model: 'mock:jarvis-mock' });
    const convId = r.of('conversation')[0].id;
    const [userMsg] = srv.repo.getApiMessages(convId);
    assert.match(userMsg.content[0].text, /<attachment name="Player.cs">\nclass Player \{\}/);
    const shown = (await call('GET', `/api/conversations/${convId}`)).body.messages[0];
    assert.deepEqual(shown.attachments, ['Player.cs']);
  });

  test('with history off, conversations are temporary and hidden from the list', async () => {
    await call('PUT', '/api/settings', { historyEnabled: false });
    const r = await chat(srv.base, token, { message: 'secret chat', model: 'mock:jarvis-mock' });
    assert.equal(r.of('conversation')[0].temporary, true);
    const ids = (await call('GET', '/api/conversations')).body.conversations.map((c) => c.id);
    assert.ok(!ids.includes(r.of('conversation')[0].id));
    srv.repo.raw.prepare('UPDATE conversations SET updated_at = 0 WHERE temporary = 1').run();
    assert.ok(srv.repo.purgeConversations({ temporaryOlderThanMs: 3600000, retentionDays: 0 }) >= 1);
    await call('PUT', '/api/settings', { historyEnabled: true });
  });

  test('delete one conversation, then clear all', async () => {
    const r = await chat(srv.base, token, { message: 'to delete', model: 'mock:jarvis-mock' });
    const id = r.of('conversation')[0].id;
    assert.equal((await call('DELETE', `/api/conversations/${id}`)).status, 200);
    assert.equal((await call('GET', `/api/conversations/${id}`)).status, 404);
    assert.equal(srv.repo.getApiMessages(id).length, 0, 'messages are deleted too');
    await call('DELETE', '/api/conversations');
    assert.equal((await call('GET', '/api/conversations')).body.conversations.length, 0);
  });
});

test('AI outages reach the app as a clear, retryable error', async () => {
  const srv = await startServer();
  try {
    const token = await srv.pair();
    const r = await chat(srv.base, token, { message: 'hi [mock-error]', model: 'mock:jarvis-mock' });
    const [err] = r.of('error');
    assert.equal(err.code, 'provider_unavailable');
    assert.equal(err.retryable, true);
  } finally {
    await srv.close();
  }
});

test('stopping mid-reply aborts the provider and keeps the partial text', async () => {
  let aborted = false;
  const slow = createMockProvider({ delayMs: 30 });
  const wrapped = {
    ...slow,
    async stream(args) {
      args.signal.addEventListener('abort', () => { aborted = true; });
      return slow.stream(args);
    },
  };
  const srv = await startServer({ providers: { mock: wrapped } });
  try {
    const token = await srv.pair();
    let deltas = 0;
    const r = await chat(srv.base, token, { message: 'tell me a long story', model: 'mock:jarvis-mock' }, { onEvent: (e) => e.event === 'delta' && ++deltas === 3 });
    const convId = r.of('conversation')[0].id;
    for (let i = 0; i < 50 && !aborted; i++) await new Promise((res) => setTimeout(res, 20));
    assert.ok(aborted, 'provider saw the abort');
    await new Promise((res) => setTimeout(res, 50));
    const msgs = srv.repo.getDisplayMessages(convId);
    assert.equal(msgs.at(-1).role, 'assistant');
    assert.equal(msgs.at(-1).interrupted, true);
  } finally {
    await srv.close();
  }
});

test('daily budget blocks new requests once reached', async () => {
  const srv = await startServer({ env: { DAILY_BUDGET_USD: '0.50' } });
  try {
    const token = await srv.pair();
    srv.repo.addUsage({ costUsd: 0.6 });
    const r = await chat(srv.base, token, { message: 'hi', model: 'mock:jarvis-mock' });
    assert.equal(r.of('error')[0].code, 'budget_exceeded');
    const usage = await api(srv.base, token)('GET', '/api/usage');
    assert.equal(usage.body.dailyBudgetUsd, 0.5);
    assert.ok(usage.body.today.cost_usd >= 0.6);
  } finally {
    await srv.close();
  }
});

test('usage and cost are recorded per request', async () => {
  const fake = {
    name: 'anthropic',
    supportsWebSearch: true,
    async stream({ onText }) {
      onText('Hi');
      return {
        content: [{ type: 'text', text: 'Hi' }],
        stopReason: 'end_turn',
        usage: { servedModel: 'claude-opus-5-5', inputTokens: 1000, cacheWriteTokens: 0, cacheReadTokens: 0, outputTokens: 1000, webSearches: 2 },
      };
    },
  };
  const srv = await startServer({ providers: { anthropic: fake } });
  try {
    const token = await srv.pair();
    const r = await chat(srv.base, token, { message: 'hi', model: 'anthropic:claude-opus-5-5' });
    // 1000 * $4/M + 1000 * $20/M + 2 searches * $0.01
    assert.equal(r.of('done')[0].usage.costUsd, 0.044);
    assert.equal(srv.repo.getUsage().web_searches, 2);
  } finally {
    await srv.close();
  }
});

test('provider errors other than outages', async () => {
  const failing = { name: 'anthropic', supportsWebSearch: false, async stream() { throw new ProviderError('provider_auth', 'bad key'); } };
  const srv = await startServer({ providers: { anthropic: failing } });
  try {
    const token = await srv.pair();
    const r = await chat(srv.base, token, { message: 'hi', model: 'anthropic:claude-opus-5-5' });
    assert.deepEqual(r.of('error')[0], { code: 'provider_auth', message: 'bad key', retryable: false });
  } finally {
    await srv.close();
  }
});
