// Entry point: `npm start`. Reads configuration from the environment (or a
// .env file passed with --env-file), opens the database and starts the API.

import path from 'node:path';
import { loadConfig, ConfigError } from './config.js';
import { openDatabase } from './db.js';
import { createProviders } from './providers/index.js';
import { createApp, VERSION } from './app.js';

let config;
try {
  config = loadConfig();
} catch (err) {
  if (err instanceof ConfigError) {
    console.error(`\nJARVIS backend configuration error:\n  ${err.message}\n`);
    process.exit(1);
  }
  throw err;
}

const repo = openDatabase(path.join(config.dataDir, 'jarvis.db'));
const providers = createProviders(config);
const app = createApp({ config, repo, providers });

const purge = () => {
  const removed = repo.purgeConversations({ temporaryOlderThanMs: 60 * 60 * 1000, retentionDays: config.historyRetentionDays });
  if (removed) console.info(`[privacy] removed ${removed} expired conversation(s)`);
};
purge();
const purgeTimer = setInterval(purge, 10 * 60 * 1000);

const server = app.listen(config.port, config.host, () => {
  console.info(`JARVIS AI backend ${VERSION} listening on http://${config.host}:${config.port}`);
  console.info(`  models: ${config.models.map((m) => m.id).join(', ')} (default ${config.defaultModel})`);
  console.info(`  data:   ${config.dataDir}`);
  if (config.dailyBudgetUsd) console.info(`  daily budget: $${config.dailyBudgetUsd}`);
});
// Long AI replies stream for minutes; don't cut them off.
server.requestTimeout = 0;
server.headersTimeout = 60000;

function shutdown(signal) {
  console.info(`${signal} received, shutting down`);
  clearInterval(purgeTimer);
  server.close(() => {
    repo.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
