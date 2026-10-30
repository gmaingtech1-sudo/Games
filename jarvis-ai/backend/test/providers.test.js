import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAnthropicProvider, sanitizeFallbackContent } from '../src/providers/anthropic.js';
import { createOpenAICompatibleProvider, toChatMessages } from '../src/providers/openai-compatible.js';
import { collectSources, validateClientTools } from '../src/chat.js';
import { buildSystemPrompt } from '../src/personas.js';
import { loadConfig, parseModels, ConfigError } from '../src/config.js';
import { DEFAULT_SETTINGS } from '../src/db.js';

// A stand-in for the Anthropic SDK client that records the request.
function fakeAnthropicClient(message) {
  const calls = [];
  return {
    calls,
    beta: {
      messages: {
        stream(params, options) {
          calls.push({ params, options });
          const handlers = {};
          return {
            on(name, fn) { handlers[name] = fn; return this; },
            async finalMessage() {
              for (const b of message.content) if (b.type === 'text') handlers.text?.(b.text);
              return message;
            },
          };
        },
      },
    },
  };
}

const okMessage = { model: 'claude-opus-5-5', content: [{ type: 'text', text: 'Hello' }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 2 } };

test('Anthropic request: caching, effort, fallbacks, search tool and eager tool streaming', async () => {
  const client = fakeAnthropicClient(okMessage);
  const provider = createAnthropicProvider({ client });
  let streamed = '';
  const tool = { name: 'open_app', description: 'x', input_schema: { type: 'object', properties: {} } };
  const out = await provider.stream({
    model: 'claude-opus-5-5', system: 'SYS', messages: [{ role: 'user', content: 'hi' }], tools: [tool],
    webSearch: true, webSearchMaxUses: 3, effort: 'medium', maxTokens: 1000, onText: (t) => { streamed += t; },
  });
  const p = client.calls[0].params;
  assert.deepEqual(p.system, [{ type: 'text', text: 'SYS', cache_control: { type: 'ephemeral' } }]);
  assert.deepEqual(p.cache_control, { type: 'ephemeral' });
  assert.deepEqual(p.output_config, { effort: 'medium' });
  assert.equal(p.fallbacks, 'default');
  assert.deepEqual(p.betas, ['server-side-fallback-2026-07-01']);
  assert.equal(p.tools[0].eager_input_streaming, true);
  assert.deepEqual(p.tools[1], { type: 'web_search_20260209', name: 'web_search', max_uses: 3 });
  assert.equal('temperature' in p, false);
  assert.equal('thinking' in p, false, 'Opus 5.5 runs adaptive thinking by default');
  assert.equal(streamed, 'Hello');
  assert.equal(out.stopReason, 'end_turn');
  assert.equal(out.usage.inputTokens, 10);
});

test('Haiku gets no fallbacks and the basic search tool', async () => {
  const client = fakeAnthropicClient(okMessage);
  await createAnthropicProvider({ client }).stream({
    model: 'claude-haiku-5-5', system: 'S', messages: [], tools: [], webSearch: true, webSearchMaxUses: 2, effort: 'low', maxTokens: 10,
  });
  const p = client.calls[0].params;
  assert.equal(p.fallbacks, undefined);
  assert.equal(p.betas, undefined);
  assert.equal(p.tools[0].type, 'web_search_20250305');
});

test('refusals are reported with their category', async () => {
  const client = fakeAnthropicClient({ ...okMessage, content: [], stop_reason: 'refusal', stop_details: { category: 'cyber', explanation: 'x' } });
  const out = await createAnthropicProvider({ client }).stream({ model: 'claude-opus-5-5', system: 'S', messages: [], tools: [], maxTokens: 10 });
  assert.equal(out.stopReason, 'refusal');
  assert.equal(out.refusal.category, 'cyber');
});

test('content before a mid-output fallback is cleaned before it is stored', () => {
  const content = [
    { type: 'thinking', thinking: '', signature: 's' },
    { type: 'text', text: 'Partial ' },
    { type: 'tool_use', id: 't1', name: 'x', input: {} },
    { type: 'server_tool_use', id: 's1', name: 'web_search', input: {} },
    { type: 'fallback', from: { model: 'a' }, to: { model: 'b' } },
    { type: 'thinking', thinking: '', signature: 's2' },
    { type: 'text', text: 'rest' },
  ];
  assert.deepEqual(sanitizeFallbackContent(content).map((b) => b.type), ['text', 'thinking', 'text']);
  const noFallback = [{ type: 'thinking' }, { type: 'text', text: 'x' }];
  assert.equal(sanitizeFallbackContent(noFallback), noFallback);
});

test('sources come from search results and citations only, never invented', () => {
  const sources = collectSources([
    { type: 'server_tool_use', id: 's1', name: 'web_search', input: { query: 'q' } },
    { type: 'web_search_tool_result', tool_use_id: 's1', content: [
      { type: 'web_search_result', url: 'https://a.example/1', title: 'A', page_age: '2 days' },
      { type: 'web_search_result', url: 'https://b.example/2', title: 'B' },
      { type: 'web_search_result', url: 'javascript:alert(1)', title: 'bad' },
    ] },
    { type: 'text', text: 'Claim', citations: [{ type: 'web_search_result_location', url: 'https://b.example/2', title: 'B', cited_text: 'Claim' }] },
  ]);
  assert.deepEqual(sources.map((s) => s.url), ['https://b.example/2', 'https://a.example/1']);
  assert.equal(sources[0].cited, true);
  assert.deepEqual(collectSources([{ type: 'web_search_tool_result', content: { type: 'web_search_tool_result_error', error_code: 'max_uses_exceeded' } }]), []);
});

test('OpenAI-compatible: message conversion and streamed tool calls', async () => {
  const converted = toChatMessages('SYS', [
    { role: 'user', content: 'open notepad' },
    { role: 'assistant', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: 'ok' }, { type: 'tool_use', id: 'c1', name: 'open_app', input: { name: 'notepad' } }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'c1', content: 'done' }, { type: 'text', text: 'thanks' }] },
  ]);
  assert.deepEqual(converted, [
    { role: 'system', content: 'SYS' },
    { role: 'user', content: 'open notepad' },
    { role: 'assistant', content: 'ok', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'open_app', arguments: '{"name":"notepad"}' } }] },
    { role: 'tool', tool_call_id: 'c1', content: 'done' },
    { role: 'user', content: 'thanks' },
  ]);

  const sse = [
    { choices: [{ delta: { content: 'Opening' } }] },
    { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_9', function: { name: 'open_app', arguments: '{"na' } }] } }] },
    { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'me":"calc"}' } }] }, finish_reason: 'tool_calls' }] },
    { choices: [], usage: { prompt_tokens: 5, completion_tokens: 7 } },
  ].map((d) => `data: ${JSON.stringify(d)}\n\n`).join('') + 'data: [DONE]\n\n';
  let sent;
  const fetchImpl = async (url, init) => {
    sent = { url, body: JSON.parse(init.body), auth: init.headers.authorization };
    return new Response(sse, { status: 200 });
  };
  const provider = createOpenAICompatibleProvider({ apiKey: 'k', baseURL: 'https://llm.example/v1', fetchImpl });
  let text = '';
  const out = await provider.stream({ model: 'm', system: 'S', messages: [{ role: 'user', content: 'x' }], tools: [{ name: 'open_app', description: 'd', input_schema: { type: 'object' } }], maxTokens: 50, onText: (t) => { text += t; } });
  assert.equal(sent.url, 'https://llm.example/v1/chat/completions');
  assert.equal(sent.auth, 'Bearer k');
  assert.equal(sent.body.tools[0].function.name, 'open_app');
  assert.equal(text, 'Opening');
  assert.equal(out.stopReason, 'tool_use');
  assert.deepEqual(out.content[1], { type: 'tool_use', id: 'call_9', name: 'open_app', input: { name: 'calc' } });
  assert.equal(out.usage.outputTokens, 7);
});

test('OpenAI-compatible: HTTP errors map to clear messages', async () => {
  const provider = createOpenAICompatibleProvider({ apiKey: 'k', baseURL: 'https://x', fetchImpl: async () => new Response('nope', { status: 401 }) });
  await assert.rejects(provider.stream({ model: 'm', system: 's', messages: [], tools: [], maxTokens: 5 }), { code: 'provider_auth' });
  const down = createOpenAICompatibleProvider({ apiKey: 'k', baseURL: 'https://x', fetchImpl: async () => { throw new Error('ECONNREFUSED'); } });
  await assert.rejects(down.stream({ model: 'm', system: 's', messages: [], tools: [], maxTokens: 5 }), { code: 'provider_unreachable', retryable: true });
});

test('system prompt reflects settings, memories and tools deterministically', () => {
  const args = {
    settings: { ...DEFAULT_SETTINGS, userName: 'Luke', style: 'unity', customInstructions: 'Use British spelling.' },
    memories: [{ id: 'mem_1', kind: 'project', title: 'Rift', content: 'Top-down shooter' }],
    platform: 'windows',
    clientToolNames: ['open_app'],
    webSearch: true,
    today: '2026-10-30',
  };
  const a = buildSystemPrompt(args);
  assert.equal(a, buildSystemPrompt(args), 'same input, same prompt (cache-friendly)');
  for (const needle of ['Luke', 'Unity developer', '[mem_1] Rift: Top-down shooter', 'open_app', 'British spelling', 'search the web', '2026-10-30']) {
    assert.ok(a.includes(needle), needle);
  }
  const off = buildSystemPrompt({ ...args, settings: { ...args.settings, memoryEnabled: false }, webSearch: false, clientToolNames: [] });
  assert.ok(off.includes('Memory is OFF') && !off.includes('mem_1') && off.includes('Web search is off'));
});

test('client tool definitions are validated', () => {
  assert.deepEqual(validateClientTools(undefined), []);
  assert.throws(() => validateClientTools([{ name: 'bad name', description: 'x', input_schema: { type: 'object' } }]));
  assert.throws(() => validateClientTools([{ name: 'ok', description: 'x', input_schema: { type: 'string' } }]));
  assert.throws(() => validateClientTools(new Array(41).fill({ name: 'a', description: 'b', input_schema: { type: 'object' } })));
});

test('configuration validation', () => {
  assert.throws(() => loadConfig({ JARVIS_PASSWORD: 'short', ANTHROPIC_API_KEY: 'k' }), ConfigError);
  assert.throws(() => loadConfig({ JARVIS_PASSWORD: 'a-long-enough-password' }), /ANTHROPIC_API_KEY/);
  assert.throws(() => loadConfig({ NODE_ENV: 'test', AI_MODELS: 'nomodel' }), ConfigError);
  assert.throws(() => loadConfig({ NODE_ENV: 'test', DEFAULT_MODEL: 'x:y' }), /DEFAULT_MODEL/);
  const c = loadConfig({ JARVIS_PASSWORD: 'a-long-enough-password', ANTHROPIC_API_KEY: 'sk-test' });
  assert.equal(c.defaultModel, 'anthropic:claude-opus-5-5');
  assert.equal(c.models.length, 3);
  const mock = loadConfig({ JARVIS_PASSWORD: 'a-long-enough-password', AI_PROVIDER: 'mock' });
  assert.equal(mock.defaultModel, 'mock:jarvis-mock');
  assert.deepEqual(parseModels('openai:gpt-x|GPT X'), [{ id: 'openai:gpt-x', provider: 'openai', model: 'gpt-x', label: 'GPT X' }]);
});
