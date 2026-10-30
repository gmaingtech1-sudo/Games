// Device pairing and authentication.
//
// An app pairs once with the server password (JARVIS_PASSWORD) and receives
// a random device token. Only a SHA-256 hash of the token is stored, so a
// copy of the database can't be used to log in. Tokens can be revoked one by
// one from Settings > Devices.

import crypto from 'node:crypto';

export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

export function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function newToken() {
  return `jv_${crypto.randomBytes(32).toString('base64url')}`;
}

// Fixed-window limiter, kept in memory: enough for a personal server.
export function createRateLimiter({ windowMs, max }) {
  const hits = new Map();
  return {
    check(key) {
      const t = Date.now();
      let entry = hits.get(key);
      if (!entry || t - entry.start > windowMs) {
        entry = { start: t, count: 0 };
        hits.set(key, entry);
      }
      entry.count += 1;
      if (hits.size > 10000) {
        for (const [k, v] of hits) if (t - v.start > windowMs) hits.delete(k);
      }
      return { allowed: entry.count <= max, retryAfterSec: Math.ceil((entry.start + windowMs - t) / 1000) };
    },
    reset(key) {
      hits.delete(key);
    },
  };
}

export function requireDevice(repo) {
  return (req, res, next) => {
    const header = req.get('authorization') || '';
    const match = /^Bearer\s+(\S+)$/i.exec(header);
    if (!match) return res.status(401).json({ error: { code: 'unauthorized', message: 'Pair this device first (Settings > Connection).' } });
    const device = repo.findDeviceByTokenHash(sha256(match[1]));
    if (!device) return res.status(401).json({ error: { code: 'unauthorized', message: 'This device is not paired or was revoked. Pair it again.' } });
    if (Date.now() - device.last_seen_at > 60000) repo.touchDevice(device.id);
    req.device = device;
    next();
  };
}
