// The chat turn: stores the user's message, streams the AI reply over
// Server-Sent Events, runs server-side tools (memory) and hands client-side
// tools (PC actions on the Windows app) back to the app, which asks the user
// before running them and then posts the results to continue the turn.

import { buildSystemPrompt } from './personas.js';
import { MEMORY_KINDS } from './db.js';
import { ProviderError } from './providers/errors.js';

const SERVER_TOOLS = [
  {
    name: 'save_memory',
    description:
      'Save a durable memory about the user so it is available in future conversations. Use for preferences, ongoing projects, standing instructions and important facts the user shares. The user sees every save and can edit or delete it.',
    input_schema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: MEMORY_KINDS, description: 'fact | preference | project | instruction' },
        title: { type: 'string', description: 'Short label, e.g. a project name. Optional.' },
        content: { type: 'string', description: 'The information to remember, written as a short standalone sentence.' },
      },
      required: ['kind', 'content'],
      additionalProperties: false,
    },
  },
  {
    name: 'forget_memory',
    description: 'Delete a saved memory by its id (shown in brackets in the memory list) when the user asks you to forget it.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
];
const SERVER_TOOL_NAMES = new Set(SERVER_TOOLS.map((t) => t.name));
const TOOL_NAME = /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/;

export class ChatInputError extends Error {
  constructor(message, status = 400, code = 'bad_request') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function validateClientTools(tools) {
  if (tools === undefined) return [];
  if (!Array.isArray(tools) || tools.length > 40) throw new ChatInputError('clientTools must be an array of at most 40 tools');
  return tools.map((t) => {
    if (!t || typeof t !== 'object' || !TOOL_NAME.test(t.name || '') || SERVER_TOOL_NAMES.has(t.name)) {
      throw new ChatInputError(`Invalid client tool name: ${t?.name}`);
    }
    if (typeof t.description !== 'string' || t.description.length > 2000) throw new ChatInputError(`Tool ${t.name} needs a description`);
    if (!t.input_schema || t.input_schema.type !== 'object') throw new ChatInputError(`Tool ${t.name} needs an object input_schema`);
    return { name: t.name, description: t.description, input_schema: t.input_schema };
  });
}

function validateMemoryInput(name, input) {
  if (!input || typeof input !== 'object') return 'Input must be an object';
  if (name === 'save_memory') {
    if (!MEMORY_KINDS.includes(input.kind)) return `kind must be one of ${MEMORY_KINDS.join(', ')}`;
    if (typeof input.content !== 'string' || !input.content.trim()) return 'content is required';
    if (input.content.length > 2000) return 'content is too long (2000 characters max)';
    if (input.title !== undefined && typeof input.title !== 'string') return 'title must be a string';
  }
  if (name === 'forget_memory' && typeof input.id !== 'string') return 'id is required';
  return null;
}

export function estimateCost(config, model, usage) {
  const p = config.prices[usage.servedModel] || config.prices[model] || { input: 0, output: 0 };
  const inputEquivalent = usage.inputTokens + usage.cacheWriteTokens * 1.25 + usage.cacheReadTokens * 0.1;
  return (inputEquivalent * p.input + usage.outputTokens * p.output) / 1e6 + usage.webSearches * config.webSearchPrice;
}

export function collectSources(content) {
  const seen = new Map();
  for (const block of content) {
    if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
      for (const r of block.content) if (r.url && !seen.has(r.url)) seen.set(r.url, { url: r.url, title: r.title || r.url, page_age: r.page_age || null, cited: false });
    }
  }
  for (const block of content) {
    if (block.type !== 'text' || !Array.isArray(block.citations)) continue;
    for (const c of block.citations) {
      if (!c.url) continue;
      const entry = seen.get(c.url) || { url: c.url, title: c.title || c.url, page_age: null, cited: false };
      entry.cited = true;
      seen.set(c.url, entry);
    }
  }
  return [...seen.values()].filter((s) => /^https?:\/\//i.test(s.url)).sort((a, b) => Number(b.cited) - Number(a.cited)).slice(0, 12);
}

function textOf(content) {
  return content.filter((b) => b.type === 'text').map((b) => b.text).join('');
}

function formatUserContent(message, attachments) {
  const blocks = [];
  for (const a of attachments) {
    blocks.push({ type: 'text', text: `<attachment name="${a.name.replace(/"/g, "'")}">\n${a.text}\n</attachment>` });
  }
  if (message) blocks.push({ type: 'text', text: message });
  return blocks;
}

function validateAttachments(attachments) {
  if (attachments === undefined) return [];
  if (!Array.isArray(attachments) || attachments.length > 10) throw new ChatInputError('At most 10 attachments');
  let total = 0;
  return attachments.map((a) => {
    if (typeof a?.name !== 'string' || typeof a?.text !== 'string') throw new ChatInputError('Attachments need a name and text');
    total += a.text.length;
    if (total > 600000) throw new ChatInputError('Attachments are too large (about 600,000 characters in total max). Attach fewer or smaller files.', 413);
    return { name: a.name.slice(0, 200), text: a.text };
  });
}

// Runs one chat request. `send(event, data)` writes an SSE event.
export async function runChat({ config, repo, providers, body, send, signal, platform }) {
  const settings = repo.getSettings();
  const modelId = body.model || settings.model || config.defaultModel;
  const modelEntry = config.models.find((m) => m.id === modelId) || config.models.find((m) => m.id === config.defaultModel);
  const provider = providers[modelEntry.provider];
  if (!provider) throw new ChatInputError(`Provider "${modelEntry.provider}" is not configured on the server`, 500, 'provider_missing');

  const clientTools = validateClientTools(body.clientTools);
  const attachments = validateAttachments(body.attachments);
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (message.length > 100000) throw new ChatInputError('Message is too long (100,000 characters max)', 413);
  const toolResults = body.toolResults;
  if (!message && !attachments.length && !Array.isArray(toolResults)) throw new ChatInputError('Send a message or toolResults');

  if (config.dailyBudgetUsd > 0) {
    const spent = repo.getUsage().cost_usd;
    if (spent >= config.dailyBudgetUsd) {
      throw new ChatInputError(
        `Today's AI budget ($${config.dailyBudgetUsd.toFixed(2)}) has been reached ($${spent.toFixed(2)} used). It resets at midnight UTC, or raise DAILY_BUDGET_USD on the server.`,
        429, 'budget_exceeded',
      );
    }
  }

  // ---- conversation and the new user turn -----------------------------
  let conversation = body.conversationId ? repo.getConversation(body.conversationId) : null;
  if (body.conversationId && !conversation) throw new ChatInputError('Conversation not found (it may have been deleted)', 404, 'not_found');
  if (!conversation) {
    if (!message && !attachments.length) throw new ChatInputError('A new conversation needs a message');
    const title = (message || attachments[0].name).replace(/\s+/g, ' ').slice(0, 60);
    conversation = repo.createConversation({ title, temporary: !settings.historyEnabled });
  }
  send('conversation', { id: conversation.id, title: conversation.title, temporary: Boolean(conversation.temporary) });

  const pending = repo.getPending(conversation.id);
  if (Array.isArray(toolResults)) {
    if (!pending) throw new ChatInputError('There is no tool request waiting for results in this conversation', 409, 'no_pending_tools');
    const byId = new Map(toolResults.map((r) => [r?.id, r]));
    const clientResults = pending.clientCallIds.map((id) => {
      const r = byId.get(id);
      if (!r) return { type: 'tool_result', tool_use_id: id, is_error: true, content: 'No result: the user cancelled or the app did not run this tool.' };
      return { type: 'tool_result', tool_use_id: id, is_error: Boolean(r.isError), content: String(r.content ?? '').slice(0, 200000) };
    });
    repo.addMessage({ conversationId: conversation.id, role: 'user', content: [...pending.serverResults, ...clientResults, ...formatUserContent(message, attachments)] });
    repo.setPending(conversation.id, null);
  } else {
    // A new message while tools were waiting means the user moved on: close
    // the open tool calls as cancelled, in the same user turn.
    const cancelled = pending
      ? [...pending.serverResults, ...pending.clientCallIds.map((id) => ({ type: 'tool_result', tool_use_id: id, is_error: true, content: 'Cancelled: the user sent a new message instead.' }))]
      : [];
    if (pending) repo.setPending(conversation.id, null);
    repo.addMessage({
      conversationId: conversation.id,
      role: 'user',
      content: [...cancelled, ...formatUserContent(message, attachments)],
      display: { text: message, attachments: attachments.map((a) => a.name) },
    });
  }

  // ---- model rounds ---------------------------------------------------
  const webSearch = Boolean(config.webSearchAvailable && settings.webSearchEnabled && provider.supportsWebSearch);
  const tools = [...(settings.memoryEnabled ? SERVER_TOOLS : []), ...clientTools];
  const totals = { inputTokens: 0, outputTokens: 0, webSearches: 0, costUsd: 0 };
  let partial = '';
  let stopReason = 'end_turn';

  try {
    for (let round = 0; round < config.maxToolRounds; round++) {
      const system = buildSystemPrompt({
        settings,
        memories: settings.memoryEnabled ? repo.listMemories() : [],
        platform,
        clientToolNames: clientTools.map((t) => t.name),
        webSearch,
        today: new Date().toISOString().slice(0, 10),
      });
      send('status', { state: 'thinking' });
      partial = '';
      const result = await provider.stream({
        model: modelEntry.model,
        system,
        messages: repo.getApiMessages(conversation.id),
        tools,
        webSearch,
        webSearchMaxUses: config.webSearchMaxUses,
        effort: config.effort,
        maxTokens: config.maxOutputTokens,
        signal,
        onText: (delta) => {
          partial += delta;
          send('delta', { text: delta });
        },
        onActivity: (state) => send('status', { state }),
      });

      const cost = estimateCost(config, modelEntry.model, result.usage);
      repo.addUsage({ inputTokens: result.usage.inputTokens + result.usage.cacheReadTokens + result.usage.cacheWriteTokens, outputTokens: result.usage.outputTokens, webSearches: result.usage.webSearches, costUsd: cost });
      totals.inputTokens += result.usage.inputTokens + result.usage.cacheReadTokens + result.usage.cacheWriteTokens;
      totals.outputTokens += result.usage.outputTokens;
      totals.webSearches += result.usage.webSearches;
      totals.costUsd += cost;

      const sources = collectSources(result.content);
      if (sources.length) send('sources', { items: sources });
      const text = textOf(result.content);
      if (result.content.length) {
        repo.addMessage({
          conversationId: conversation.id,
          role: 'assistant',
          content: result.content,
          display: text ? { text, sources } : null,
          model: modelEntry.id,
        });
      }
      partial = '';
      stopReason = result.stopReason;

      if (stopReason === 'pause_turn') continue;
      if (stopReason === 'refusal') {
        send('notice', {
          code: 'refused',
          message: 'The AI declined to answer this request. Try rephrasing it, or ask something else.',
          category: result.refusal?.category ?? null,
        });
        break;
      }

      const toolUses = result.content.filter((b) => b.type === 'tool_use');
      if (stopReason === 'max_tokens') {
        if (toolUses.length) {
          repo.addMessage({
            conversationId: conversation.id,
            role: 'user',
            content: toolUses.map((t) => ({ type: 'tool_result', tool_use_id: t.id, is_error: true, content: 'Not run: the request was cut off before the tool input was complete.' })),
          });
        }
        send('notice', { code: 'truncated', message: 'The reply hit the length limit and was cut short. Ask JARVIS to continue.' });
        break;
      }
      if (stopReason !== 'tool_use' || !toolUses.length) break;

      const serverResults = [];
      const clientCalls = [];
      const clientToolNames = new Set(clientTools.map((t) => t.name));
      for (const call of toolUses) {
        if (SERVER_TOOL_NAMES.has(call.name)) {
          const problem = validateMemoryInput(call.name, call.input);
          if (problem) {
            serverResults.push({ type: 'tool_result', tool_use_id: call.id, is_error: true, content: JSON.stringify({ INVALID_INPUT: problem }) });
          } else if (call.name === 'save_memory') {
            const memory = repo.addMemory({ kind: call.input.kind, title: (call.input.title || '').slice(0, 120), content: call.input.content.trim(), source: 'assistant' });
            send('memory', { action: 'saved', memory });
            serverResults.push({ type: 'tool_result', tool_use_id: call.id, content: `Saved as ${memory.id}.` });
          } else {
            const existing = repo.getMemory(call.input.id);
            if (existing && repo.deleteMemory(call.input.id)) {
              send('memory', { action: 'deleted', memory: existing });
              serverResults.push({ type: 'tool_result', tool_use_id: call.id, content: 'Deleted.' });
            } else {
              serverResults.push({ type: 'tool_result', tool_use_id: call.id, is_error: true, content: 'No memory with that id.' });
            }
          }
        } else if (clientToolNames.has(call.name)) {
          clientCalls.push({ id: call.id, name: call.name, input: call.input });
        } else {
          serverResults.push({ type: 'tool_result', tool_use_id: call.id, is_error: true, content: `Tool ${call.name} is not available on this device.` });
        }
      }

      if (clientCalls.length) {
        repo.setPending(conversation.id, { serverResults, clientCallIds: clientCalls.map((c) => c.id) });
        send('tool_request', { calls: clientCalls });
        break;
      }
      repo.addMessage({ conversationId: conversation.id, role: 'user', content: serverResults });
      if (round === config.maxToolRounds - 1) {
        send('notice', { code: 'tool_limit', message: 'Stopped after too many tool steps in one turn.' });
      }
    }
  } catch (err) {
    // Keep what was already said, so the conversation still makes sense.
    if (partial.trim()) {
      repo.addMessage({
        conversationId: conversation.id,
        role: 'assistant',
        content: [{ type: 'text', text: `${partial}\n\n[interrupted]` }],
        display: { text: partial, interrupted: true },
        model: modelEntry.id,
      });
    }
    throw err;
  }

  send('done', {
    stopReason,
    model: modelEntry.id,
    usage: { ...totals, costUsd: Number(totals.costUsd.toFixed(6)) },
  });
}

export { ProviderError };
