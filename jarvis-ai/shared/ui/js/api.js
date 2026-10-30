// Backend client: JSON calls and the streaming chat (Server-Sent Events over
// fetch, so it can carry the Authorization header and be aborted).

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'error', retryable = false } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

const PRIVATE_HOST = /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|\[::1\]|[\w-]+\.local)$/i;

// Normalises a server address. Plain http:// is accepted only for addresses
// on your own network (for testing); anything on the internet must be https.
export function normaliseServerUrl(input) {
  let s = String(input || '').trim();
  if (!s) throw new ApiError('Enter the server address.');
  if (!/^https?:\/\//i.test(s)) s = (PRIVATE_HOST.test(s.split(/[/:]/)[0]) ? 'http://' : 'https://') + s;
  let url;
  try { url = new URL(s); } catch { throw new ApiError('That is not a valid address.'); }
  if (url.protocol === 'http:' && !PRIVATE_HOST.test(url.hostname)) {
    throw new ApiError('Use https:// for a server on the internet. Plain http:// is only allowed for addresses on your own network.');
  }
  return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, '')}`;
}

export function isInsecure(url) {
  return url.startsWith('http://');
}

function networkError(err, base) {
  if (err.name === 'AbortError') return new ApiError('Stopped.', { code: 'aborted' });
  return new ApiError(`Can't reach the JARVIS server at ${base}. Check your internet connection and that the server is running.`, { code: 'offline', retryable: true });
}

export function createApi({ getBase, getToken, onUnauthorized }) {
  async function request(method, path, body, { auth = true, timeoutMs = 20000 } = {}) {
    const base = getBase();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
      res = await fetch(`${base}${path}`, {
        method,
        headers: {
          ...(auth ? { authorization: `Bearer ${getToken()}` } : {}),
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      throw err.name === 'AbortError' ? new ApiError('The server took too long to answer.', { code: 'timeout', retryable: true }) : networkError(err, base);
    } finally {
      clearTimeout(timer);
    }
    let data = null;
    const text = await res.text();
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (!res.ok) {
      if (res.status === 401 && auth) onUnauthorized?.(data?.error?.message);
      throw new ApiError(data?.error?.message || `Server error ${res.status}`, { status: res.status, code: data?.error?.code || 'http_error', retryable: res.status >= 500 });
    }
    return data;
  }

  return {
    request,
    health: () => request('GET', '/api/health', undefined, { auth: false, timeoutMs: 8000 }),
    pair: (base, password, deviceName, platform) =>
      fetch(`${base}/api/auth/pair`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password, deviceName, platform }),
      }).then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new ApiError(data?.error?.message || `Server error ${res.status}`, { status: res.status, code: data?.error?.code });
        return data;
      }, (err) => { throw networkError(err, base); }),

    // Streams a chat turn. Calls onEvent(name, data) for each SSE event.
    async chat(body, { signal, onEvent }) {
      const base = getBase();
      let res;
      try {
        res = await fetch(`${base}/api/chat`, {
          method: 'POST',
          headers: { authorization: `Bearer ${getToken()}`, 'content-type': 'application/json', accept: 'text/event-stream' },
          body: JSON.stringify(body),
          signal,
        });
      } catch (err) {
        throw networkError(err, base);
      }
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        if (res.status === 401) onUnauthorized?.(data?.error?.message);
        throw new ApiError(data?.error?.message || `Server error ${res.status}`, { status: res.status, code: data?.error?.code });
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
          let idx;
          while ((idx = buffer.indexOf('\n\n')) >= 0) {
            const raw = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            let event = 'message';
            let data = '';
            for (const line of raw.split('\n')) {
              if (line.startsWith('event:')) event = line.slice(6).trim();
              else if (line.startsWith('data:')) data += line.slice(5).trim();
            }
            if (!data) continue;
            let parsed;
            try { parsed = JSON.parse(data); } catch { continue; }
            onEvent(event, parsed);
          }
        }
      } catch (err) {
        if (err.name === 'AbortError') throw new ApiError('Stopped.', { code: 'aborted' });
        throw new ApiError('The connection dropped while JARVIS was answering.', { code: 'stream_broken', retryable: true });
      }
    },
  };
}
