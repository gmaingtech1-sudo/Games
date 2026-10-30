// Reads and validates configuration from environment variables.
// Secrets (AI provider keys, the pairing password) live only here, on the
// server. They are never sent to the apps.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

// Approximate USD prices per million tokens, used only for the spending
// estimate and the optional daily budget. Check the provider's pricing page
// for current numbers and override with MODEL_PRICES if they change.
const DEFAULT_PRICES = {
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
};

const DEFAULT_MODELS =
  'anthropic:claude-opus-5-5|Claude Opus 5.5 (most capable),' +
  'anthropic:claude-sonnet-5-5|Claude Sonnet 5.5 (faster and cheaper),' +
  'anthropic:claude-haiku-5-5|Claude Haiku 5.5 (fastest and cheapest)';

export class ConfigError extends Error {}

function bool(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function num(value, fallback) {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new ConfigError(`Expected a number, got "${value}"`);
  return n;
}

// "provider:model-id|Label,provider:model-id|Label"
export function parseModels(spec) {
  return spec
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const [idPart, label] = entry.split('|');
      const colon = idPart.indexOf(':');
      if (colon < 1) throw new ConfigError(`AI_MODELS entry "${entry}" must look like provider:model-id|Label`);
      const provider = idPart.slice(0, colon).trim();
      const model = idPart.slice(colon + 1).trim();
      return { id: `${provider}:${model}`, provider, model, label: (label || model).trim() };
    });
}

export function loadConfig(env = process.env) {
  const isTest = env.NODE_ENV === 'test';
  const models = parseModels(env.AI_MODELS || (env.AI_PROVIDER === 'mock' ? 'mock:jarvis-mock|Offline demo (mock - no AI)' : DEFAULT_MODELS));
  const defaultModel = env.DEFAULT_MODEL || models[0]?.id;
  if (!models.some((m) => m.id === defaultModel)) {
    throw new ConfigError(`DEFAULT_MODEL "${defaultModel}" is not in AI_MODELS`);
  }

  let prices = { ...DEFAULT_PRICES };
  if (env.MODEL_PRICES) {
    try {
      prices = { ...prices, ...JSON.parse(env.MODEL_PRICES) };
    } catch {
      throw new ConfigError('MODEL_PRICES must be JSON like {"model-id":{"input":4,"output":20}}');
    }
  }

  const password = env.JARVIS_PASSWORD || '';
  if (!isTest && password.length < 12) {
    throw new ConfigError(
      'Set JARVIS_PASSWORD to a long secret (12+ characters). The apps use it once to pair; see .env.example.',
    );
  }

  const providersInUse = new Set(models.map((m) => m.provider));
  if (providersInUse.has('anthropic') && !env.ANTHROPIC_API_KEY && !isTest) {
    throw new ConfigError('AI_MODELS uses Anthropic models but ANTHROPIC_API_KEY is not set.');
  }
  if (providersInUse.has('openai') && !env.OPENAI_API_KEY && !env.OPENAI_BASE_URL && !isTest) {
    throw new ConfigError('AI_MODELS uses openai: models but neither OPENAI_API_KEY nor OPENAI_BASE_URL is set.');
  }

  return {
    isTest,
    port: num(env.PORT, 8787),
    host: env.HOST || '0.0.0.0',
    dataDir: env.DATA_DIR || path.resolve(here, '..', 'data'),
    trustProxy: bool(env.TRUST_PROXY, false),
    password,
    corsOrigins: (env.CORS_ORIGINS || 'https://appassets.androidplatform.net,https://jarvis.app.local')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    serveWebUi: bool(env.SERVE_WEB_UI, true),
    webUiDir: env.WEB_UI_DIR || path.resolve(here, '..', '..', 'shared', 'ui'),
    models,
    defaultModel,
    prices,
    effort: env.AI_EFFORT || 'medium',
    maxOutputTokens: num(env.MAX_OUTPUT_TOKENS, 32000),
    maxToolRounds: num(env.MAX_TOOL_ROUNDS, 8),
    webSearchAvailable: bool(env.WEB_SEARCH_ENABLED, true),
    webSearchMaxUses: num(env.WEB_SEARCH_MAX_USES, 5),
    webSearchPrice: num(env.WEB_SEARCH_PRICE_USD, 0.01),
    dailyBudgetUsd: num(env.DAILY_BUDGET_USD, 0),
    historyRetentionDays: num(env.HISTORY_RETENTION_DAYS, 0),
    anthropic: {
      apiKey: env.ANTHROPIC_API_KEY || '',
      baseURL: env.ANTHROPIC_BASE_URL || undefined,
    },
    openai: {
      apiKey: env.OPENAI_API_KEY || '',
      baseURL: (env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
    },
  };
}
