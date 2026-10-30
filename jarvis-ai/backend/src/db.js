// SQLite storage (Node's built-in node:sqlite, no native build step).
// Everything JARVIS remembers lives in this one file: DATA_DIR/jarvis.db.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  platform TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  temporary INTEGER NOT NULL DEFAULT 0,
  pending_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content_json TEXT NOT NULL,
  display_json TEXT,
  model TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_by_conversation ON messages(conversation_id, id);
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS usage (
  day TEXT PRIMARY KEY,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  web_searches INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  requests INTEGER NOT NULL DEFAULT 0
);
`;

export const MEMORY_KINDS = ['fact', 'preference', 'project', 'instruction'];

export const DEFAULT_SETTINGS = {
  assistantName: 'JARVIS',
  userName: '',
  style: 'jarvis',
  model: '',
  customInstructions: '',
  memoryEnabled: true,
  webSearchEnabled: true,
  historyEnabled: true,
};

const now = () => Date.now();
export const newId = (prefix) => `${prefix}_${crypto.randomBytes(9).toString('base64url')}`;

export function openDatabase(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return createRepository(db);
}

function createRepository(db) {
  const q = (sql) => db.prepare(sql);

  const repo = {
    raw: db,
    close: () => db.close(),

    // ---- devices -------------------------------------------------------
    createDevice({ name, platform, tokenHash }) {
      const device = { id: newId('dev'), name, platform, created_at: now(), last_seen_at: now() };
      q('INSERT INTO devices (id, name, platform, token_hash, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)').run(
        device.id, name, platform, tokenHash, device.created_at, device.last_seen_at,
      );
      return device;
    },
    findDeviceByTokenHash(tokenHash) {
      return q('SELECT id, name, platform, created_at, last_seen_at FROM devices WHERE token_hash = ?').get(tokenHash);
    },
    touchDevice(id) {
      q('UPDATE devices SET last_seen_at = ? WHERE id = ?').run(now(), id);
    },
    listDevices() {
      return q('SELECT id, name, platform, created_at, last_seen_at FROM devices ORDER BY last_seen_at DESC').all();
    },
    deleteDevice(id) {
      return q('DELETE FROM devices WHERE id = ?').run(id).changes > 0;
    },

    // ---- conversations -------------------------------------------------
    createConversation({ title, temporary }) {
      const c = { id: newId('conv'), title, temporary: temporary ? 1 : 0, created_at: now(), updated_at: now() };
      q('INSERT INTO conversations (id, title, temporary, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(
        c.id, c.title, c.temporary, c.created_at, c.updated_at,
      );
      return c;
    },
    getConversation(id) {
      return q('SELECT * FROM conversations WHERE id = ?').get(id);
    },
    listConversations() {
      return q(
        `SELECT c.id, c.title, c.created_at, c.updated_at,
                (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.display_json IS NOT NULL) AS message_count
         FROM conversations c WHERE c.temporary = 0 ORDER BY c.updated_at DESC LIMIT 500`,
      ).all();
    },
    renameConversation(id, title) {
      return q('UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?').run(title, now(), id).changes > 0;
    },
    touchConversation(id) {
      q('UPDATE conversations SET updated_at = ? WHERE id = ?').run(now(), id);
    },
    setPending(id, pending) {
      q('UPDATE conversations SET pending_json = ? WHERE id = ?').run(pending ? JSON.stringify(pending) : null, id);
    },
    getPending(id) {
      const row = q('SELECT pending_json FROM conversations WHERE id = ?').get(id);
      return row?.pending_json ? JSON.parse(row.pending_json) : null;
    },
    deleteConversation(id) {
      return q('DELETE FROM conversations WHERE id = ?').run(id).changes > 0;
    },
    deleteAllConversations() {
      return q('DELETE FROM conversations').run().changes;
    },
    // Temporary conversations (history turned off) and anything older than
    // the retention window are removed.
    purgeConversations({ temporaryOlderThanMs, retentionDays }) {
      let removed = q('DELETE FROM conversations WHERE temporary = 1 AND updated_at < ?').run(now() - temporaryOlderThanMs).changes;
      if (retentionDays > 0) {
        removed += q('DELETE FROM conversations WHERE updated_at < ?').run(now() - retentionDays * 86400000).changes;
      }
      return removed;
    },

    // ---- messages ------------------------------------------------------
    // content: the exact provider-format content, replayed unchanged on the
    // next request. display: what the apps show (null for tool plumbing).
    addMessage({ conversationId, role, content, display = null, model = null }) {
      const r = q(
        'INSERT INTO messages (conversation_id, role, content_json, display_json, model, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(conversationId, role, JSON.stringify(content), display ? JSON.stringify(display) : null, model, now());
      repo.touchConversation(conversationId);
      return Number(r.lastInsertRowid);
    },
    getApiMessages(conversationId) {
      return q('SELECT role, content_json FROM messages WHERE conversation_id = ? ORDER BY id').all(conversationId).map((r) => ({
        role: r.role,
        content: JSON.parse(r.content_json),
      }));
    },
    getDisplayMessages(conversationId) {
      return q(
        'SELECT id, role, display_json, model, created_at FROM messages WHERE conversation_id = ? AND display_json IS NOT NULL ORDER BY id',
      ).all(conversationId).map((r) => ({ id: r.id, role: r.role, model: r.model, created_at: r.created_at, ...JSON.parse(r.display_json) }));
    },

    // ---- memories ------------------------------------------------------
    listMemories() {
      return q('SELECT * FROM memories ORDER BY kind, updated_at DESC').all();
    },
    getMemory(id) {
      return q('SELECT * FROM memories WHERE id = ?').get(id);
    },
    addMemory({ kind, title = '', content, source }) {
      const m = { id: newId('mem'), kind, title, content, source, created_at: now(), updated_at: now() };
      q('INSERT INTO memories (id, kind, title, content, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
        m.id, m.kind, m.title, m.content, m.source, m.created_at, m.updated_at,
      );
      return m;
    },
    updateMemory(id, { kind, title, content }) {
      const existing = repo.getMemory(id);
      if (!existing) return null;
      const next = { ...existing, kind: kind ?? existing.kind, title: title ?? existing.title, content: content ?? existing.content, updated_at: now() };
      q('UPDATE memories SET kind = ?, title = ?, content = ?, updated_at = ? WHERE id = ?').run(next.kind, next.title, next.content, next.updated_at, id);
      return next;
    },
    deleteMemory(id) {
      return q('DELETE FROM memories WHERE id = ?').run(id).changes > 0;
    },
    deleteAllMemories() {
      return q('DELETE FROM memories').run().changes;
    },

    // ---- settings ------------------------------------------------------
    getSettings() {
      const out = { ...DEFAULT_SETTINGS };
      for (const row of q('SELECT key, value_json FROM settings').all()) {
        if (row.key in DEFAULT_SETTINGS) out[row.key] = JSON.parse(row.value_json);
      }
      return out;
    },
    saveSettings(partial) {
      const stmt = q('INSERT INTO settings (key, value_json) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json');
      for (const [key, value] of Object.entries(partial)) {
        if (key in DEFAULT_SETTINGS) stmt.run(key, JSON.stringify(value));
      }
      return repo.getSettings();
    },
    resetSettings() {
      q('DELETE FROM settings').run();
    },

    // ---- usage ---------------------------------------------------------
    addUsage({ inputTokens = 0, outputTokens = 0, webSearches = 0, costUsd = 0 }) {
      const day = new Date().toISOString().slice(0, 10);
      q(
        `INSERT INTO usage (day, input_tokens, output_tokens, web_searches, cost_usd, requests) VALUES (?, ?, ?, ?, ?, 1)
         ON CONFLICT(day) DO UPDATE SET input_tokens = input_tokens + excluded.input_tokens,
           output_tokens = output_tokens + excluded.output_tokens, web_searches = web_searches + excluded.web_searches,
           cost_usd = cost_usd + excluded.cost_usd, requests = requests + 1`,
      ).run(day, inputTokens, outputTokens, webSearches, costUsd);
    },
    getUsage(day = new Date().toISOString().slice(0, 10)) {
      return q('SELECT * FROM usage WHERE day = ?').get(day) || { day, input_tokens: 0, output_tokens: 0, web_searches: 0, cost_usd: 0, requests: 0 };
    },
    getUsageSince(dayPrefix) {
      return q('SELECT * FROM usage WHERE day >= ? ORDER BY day').all(dayPrefix);
    },

    // ---- privacy -------------------------------------------------------
    exportAll() {
      return {
        exported_at: new Date().toISOString(),
        settings: repo.getSettings(),
        memories: repo.listMemories(),
        conversations: q('SELECT * FROM conversations ORDER BY created_at').all().map((c) => ({
          id: c.id, title: c.title, created_at: c.created_at, updated_at: c.updated_at,
          messages: repo.getDisplayMessages(c.id),
        })),
        devices: repo.listDevices(),
      };
    },
    deleteEverything({ keepDevices = true } = {}) {
      db.exec('DELETE FROM conversations; DELETE FROM memories; DELETE FROM settings; DELETE FROM usage;');
      if (!keepDevices) db.exec('DELETE FROM devices;');
    },
  };
  return repo;
}
