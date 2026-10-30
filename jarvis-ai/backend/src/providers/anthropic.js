// Claude via the official Anthropic SDK. Conversation content is stored in
// this provider's own block format and replayed unchanged, which keeps
// thinking blocks valid and prompt caching effective.

import Anthropic from '@anthropic-ai/sdk';
import { ProviderError } from './errors.js';

// Models that accept server-side refusal fallbacks (`fallbacks: "default"`).
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-opus-5', 'claude-fable-5-1']);
// Models that support the dynamic-filtering web search tool version.
const NEW_SEARCH = /^claude-(opus-5|opus-4-[678]|sonnet-5|sonnet-4-6|fable-5)/;
// Models that take output_config.effort.
const EFFORT = /^claude-(opus|sonnet|haiku-5|fable)/;

// After a mid-output fallback, the blocks the declined model produced before
// the last `fallback` marker must not be echoed back (except text and paired
// server-tool blocks). See the refusal fallback docs.
export function sanitizeFallbackContent(content) {
  const last = content.map((b) => b.type).lastIndexOf('fallback');
  if (last < 0) return content;
  const before = content.slice(0, last);
  const resultIds = new Set(before.filter((b) => b.type?.endsWith('_tool_result')).map((b) => b.tool_use_id));
  const keep = before.filter((b) => {
    if (b.type === 'text') return true;
    if (b.type === 'server_tool_use') return resultIds.has(b.id);
    if (b.type?.endsWith('_tool_result')) return true;
    return false;
  });
  return [...keep, ...content.slice(last + 1)];
}

function mapError(err) {
  if (err instanceof Anthropic.APIUserAbortError) return new ProviderError('aborted', 'Stopped.', { status: 499 });
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new ProviderError('provider_auth', 'The AI provider rejected the server\'s API key. Check ANTHROPIC_API_KEY on the backend.', { status: 502 });
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new ProviderError('rate_limited', 'The AI service is rate limiting requests. Wait a moment and try again.', { retryable: true, status: 429 });
  }
  if (err instanceof Anthropic.BadRequestError) {
    return new ProviderError('bad_request', `The AI service rejected the request: ${err.message}`, { status: 400 });
  }
  if (err instanceof Anthropic.NotFoundError) {
    return new ProviderError('model_not_found', 'That AI model is not available to this API key. Pick another model in Settings.', { status: 400 });
  }
  if (err instanceof Anthropic.InternalServerError) {
    return new ProviderError('provider_unavailable', 'The AI service is temporarily overloaded or unavailable. Try again shortly.', { retryable: true, status: 503 });
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new ProviderError('provider_unreachable', 'The backend could not reach the AI service. Check the server\'s internet connection.', { retryable: true, status: 503 });
  }
  if (err instanceof Anthropic.APIError) {
    return new ProviderError('provider_error', `AI service error (${err.status}): ${err.message}`, { retryable: (err.status ?? 500) >= 500, status: 502 });
  }
  return null;
}

export function createAnthropicProvider({ apiKey, baseURL, client } = {}) {
  const anthropic = client || new Anthropic({ apiKey, baseURL, maxRetries: 2 });

  return {
    name: 'anthropic',
    supportsWebSearch: true,
    async stream({ model, system, messages, tools, webSearch, webSearchMaxUses, effort, maxTokens, signal, onText, onActivity }) {
      const toolDefs = tools.map((t) => ({ ...t, eager_input_streaming: true }));
      if (webSearch) {
        toolDefs.push({ type: NEW_SEARCH.test(model) ? 'web_search_20260209' : 'web_search_20250305', name: 'web_search', max_uses: webSearchMaxUses });
      }
      const params = {
        model,
        max_tokens: maxTokens,
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        messages,
        cache_control: { type: 'ephemeral' },
        ...(toolDefs.length ? { tools: toolDefs } : {}),
        ...(EFFORT.test(model) && effort ? { output_config: { effort } } : {}),
        ...(FALLBACK_MODELS.has(model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {}),
      };

      // An unparseable streamed tool input rejects finalMessage(); re-issue
      // that turn a couple of times before giving up. API errors are not retried here.
      for (let attempt = 0; ; attempt++) {
        let message;
        try {
          const stream = anthropic.beta.messages.stream(params, { signal });
          stream.on('text', (delta) => onText?.(delta));
          stream.on('streamEvent', (event) => {
            if (event.type === 'content_block_start' && event.content_block.type === 'server_tool_use') onActivity?.('searching');
          });
          message = await stream.finalMessage();
        } catch (err) {
          const mapped = mapError(err);
          if (mapped) throw mapped;
          if (signal?.aborted) throw new ProviderError('aborted', 'Stopped.', { status: 499 });
          if (attempt < 2) continue;
          throw new ProviderError('provider_error', `Could not read the AI response: ${err.message}`, { retryable: true });
        }

        const u = message.usage || {};
        const usage = {
          servedModel: message.model || model,
          inputTokens: u.input_tokens || 0,
          cacheWriteTokens: u.cache_creation_input_tokens || 0,
          cacheReadTokens: u.cache_read_input_tokens || 0,
          outputTokens: u.output_tokens || 0,
          webSearches: u.server_tool_use?.web_search_requests || 0,
        };
        const result = { content: sanitizeFallbackContent(message.content), stopReason: message.stop_reason, usage };
        if (message.stop_reason === 'refusal') {
          result.refusal = { category: message.stop_details?.category ?? null, explanation: message.stop_details?.explanation ?? null };
        }
        return result;
      }
    },
  };
}
