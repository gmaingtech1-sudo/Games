// Provider registry. To add another AI provider, write a module with the
// same stream() contract as anthropic.js and register it here.

import { createAnthropicProvider } from './anthropic.js';
import { createOpenAICompatibleProvider } from './openai-compatible.js';
import { createMockProvider } from './mock.js';

export function createProviders(config, overrides = {}) {
  const providers = {
    mock: createMockProvider({ delayMs: config.isTest ? 0 : 25 }),
  };
  if (config.anthropic.apiKey || config.isTest) providers.anthropic = createAnthropicProvider(config.anthropic);
  if (config.openai.apiKey || config.openai.baseURL) providers.openai = createOpenAICompatibleProvider(config.openai);
  return { ...providers, ...overrides };
}
