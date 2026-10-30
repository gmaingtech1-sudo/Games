// Offline demo provider (AI_PROVIDER=mock or a "mock:" model). It does NOT
// use any AI: it returns canned, clearly labelled replies so you can try the
// apps, run the automated tests and check the voice/tool plumbing without an
// API key or any cost.

import { ProviderError } from './errors.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function lastUserBlocks(messages) {
  const last = messages[messages.length - 1];
  if (!last) return [];
  return typeof last.content === 'string' ? [{ type: 'text', text: last.content }] : last.content;
}

export function createMockProvider({ delayMs = 15 } = {}) {
  let counter = 0;
  return {
    name: 'mock',
    supportsWebSearch: false,
    async stream({ messages, tools, signal, onText }) {
      const blocks = lastUserBlocks(messages);
      const toolNames = new Set(tools.map((t) => t.name));
      const results = blocks.filter((b) => b.type === 'tool_result');
      const text = blocks.filter((b) => b.type === 'text').map((b) => b.text).join(' ').trim();
      const lower = text.toLowerCase();

      const emit = async (reply) => {
        for (const word of reply.split(/(?<= )/)) {
          if (signal?.aborted) throw new ProviderError('aborted', 'Stopped.', { status: 499 });
          onText?.(word);
          if (delayMs) await sleep(delayMs);
        }
        return reply;
      };
      const usage = { servedModel: 'jarvis-mock', inputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0, outputTokens: 0, webSearches: 0 };
      const toolUse = async (name, input) => {
        const text = await emit(`(Demo mode) Requesting ${name}.`);
        return { content: [{ type: 'text', text }, { type: 'tool_use', id: `toolu_mock_${++counter}`, name, input }], stopReason: 'tool_use', usage };
      };

      if (lower.includes('[mock-error]')) {
        throw new ProviderError('provider_unavailable', 'Simulated AI outage (demo mode).', { retryable: true, status: 503 });
      }
      if (results.length) {
        const summary = results
          .map((r) => (r.is_error ? 'failed' : 'succeeded') + ': ' + String(typeof r.content === 'string' ? r.content : JSON.stringify(r.content)).slice(0, 160))
          .join('; ');
        const reply = await emit(`(Demo mode) The tool ${summary}`);
        return { content: [{ type: 'text', text: reply }], stopReason: 'end_turn', usage };
      }
      const rememberMatch = /remember (?:that )?(.+)/i.exec(text);
      if (rememberMatch && toolNames.has('save_memory')) {
        return toolUse('save_memory', { kind: 'fact', content: rememberMatch[1].replace(/[.!]+$/, '') });
      }
      const openMatch = /\bopen (?:the )?([\w .-]+?)(?: app)?[.!]?$/i.exec(text);
      if (openMatch && toolNames.has('open_app')) return toolUse('open_app', { name: openMatch[1].trim() });
      if (/system info|my computer/.test(lower) && toolNames.has('system_info')) return toolUse('system_info', {});

      const reply = await emit(
        `(Demo mode, no AI connected) I received: "${text.slice(0, 200)}". ` +
          'Set ANTHROPIC_API_KEY on the backend and choose a Claude model to get real answers.',
      );
      return { content: [{ type: 'text', text: reply }], stopReason: 'end_turn', usage };
    },
  };
}
