// Any OpenAI-compatible Chat Completions API (OpenAI, OpenRouter, Groq,
// Together, a local Ollama or LM Studio server...). Set OPENAI_BASE_URL and
// OPENAI_API_KEY, and list models as "openai:model-name|Label" in AI_MODELS.
//
// Conversations are stored in one block format (text / tool_use /
// tool_result). This module converts to and from the Chat Completions format,
// so you can switch providers mid-conversation. Web search is not available
// through this provider.

import { ProviderError } from './errors.js';

export function toChatMessages(system, messages) {
  const out = [{ role: 'system', content: system }];
  for (const m of messages) {
    const blocks = typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content;
    if (m.role === 'assistant') {
      const text = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('');
      const calls = blocks.filter((b) => b.type === 'tool_use').map((b) => ({
        id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) },
      }));
      out.push({ role: 'assistant', content: text || null, ...(calls.length ? { tool_calls: calls } : {}) });
    } else {
      const results = blocks.filter((b) => b.type === 'tool_result');
      for (const r of results) {
        const content = typeof r.content === 'string' ? r.content : (r.content || []).map((c) => c.text || '').join('');
        out.push({ role: 'tool', tool_call_id: r.tool_use_id, content: r.is_error ? `ERROR: ${content}` : content });
      }
      const text = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
      if (text) out.push({ role: 'user', content: text });
    }
  }
  return out;
}

export function createOpenAICompatibleProvider({ apiKey, baseURL, fetchImpl = fetch }) {
  return {
    name: 'openai',
    supportsWebSearch: false,
    async stream({ model, system, messages, tools, maxTokens, signal, onText }) {
      const body = {
        model,
        stream: true,
        stream_options: { include_usage: true },
        max_tokens: maxTokens,
        messages: toChatMessages(system, messages),
        ...(tools.length
          ? { tools: tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } })) }
          : {}),
      };

      let res;
      try {
        res = await fetchImpl(`${baseURL}/chat/completions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
          body: JSON.stringify(body),
          signal,
        });
      } catch (err) {
        if (signal?.aborted) throw new ProviderError('aborted', 'Stopped.', { status: 499 });
        throw new ProviderError('provider_unreachable', `The backend could not reach ${baseURL}: ${err.message}`, { retryable: true, status: 503 });
      }
      if (!res.ok) {
        const detail = (await res.text().catch(() => '')).slice(0, 300);
        if (res.status === 401 || res.status === 403) throw new ProviderError('provider_auth', 'The AI provider rejected the server\'s API key (OPENAI_API_KEY).');
        if (res.status === 429) throw new ProviderError('rate_limited', 'The AI service is rate limiting requests. Try again shortly.', { retryable: true, status: 429 });
        if (res.status === 404) throw new ProviderError('model_not_found', `Model "${model}" was not found at ${baseURL}.`, { status: 400 });
        throw new ProviderError('provider_error', `AI service error (${res.status}): ${detail}`, { retryable: res.status >= 500 });
      }

      let text = '';
      let finish = null;
      const calls = new Map();
      const usage = { servedModel: model, inputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0, outputTokens: 0, webSearches: 0 };
      const decoder = new TextDecoder();
      let buffer = '';
      try {
        for await (const chunk of res.body) {
          buffer += decoder.decode(chunk, { stream: true });
          let nl;
          while ((nl = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (!line.startsWith('data:')) continue;
            const data = line.slice(5).trim();
            if (data === '[DONE]') continue;
            let json;
            try { json = JSON.parse(data); } catch { continue; }
            if (json.usage) {
              usage.inputTokens = json.usage.prompt_tokens || 0;
              usage.outputTokens = json.usage.completion_tokens || 0;
            }
            const choice = json.choices?.[0];
            if (!choice) continue;
            if (choice.finish_reason) finish = choice.finish_reason;
            const delta = choice.delta || {};
            if (delta.content) {
              text += delta.content;
              onText?.(delta.content);
            }
            for (const tc of delta.tool_calls || []) {
              const entry = calls.get(tc.index) || { id: tc.id, name: '', args: '' };
              if (tc.id) entry.id = tc.id;
              if (tc.function?.name) entry.name += tc.function.name;
              if (tc.function?.arguments) entry.args += tc.function.arguments;
              calls.set(tc.index, entry);
            }
          }
        }
      } catch (err) {
        if (signal?.aborted) throw new ProviderError('aborted', 'Stopped.', { status: 499 });
        throw new ProviderError('provider_error', `The AI response stream broke off: ${err.message}`, { retryable: true });
      }

      const content = [];
      if (text) content.push({ type: 'text', text });
      for (const c of calls.values()) {
        let input = {};
        try { input = c.args ? JSON.parse(c.args) : {}; } catch { input = { __invalid_json: c.args }; }
        content.push({ type: 'tool_use', id: c.id || `call_${content.length}`, name: c.name, input });
      }
      const stopReason = calls.size ? 'tool_use' : finish === 'length' ? 'max_tokens' : finish === 'content_filter' ? 'refusal' : 'end_turn';
      return { content, stopReason, usage, ...(stopReason === 'refusal' ? { refusal: { category: 'content_filter', explanation: null } } : {}) };
    },
  };
}
