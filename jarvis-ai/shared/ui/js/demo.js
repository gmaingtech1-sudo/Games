// Offline demo: a pretend backend that runs inside the app, so you can try
// the interface, voice input and spoken replies before you have a server.
// It uses NO AI. Every reply says so. Nothing leaves the device.

const sleep = (ms, signal) => new Promise((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); reject(Object.assign(new Error('Stopped.'), { code: 'aborted', name: 'AbortError' })); });
});

export function createDemoApi() {
  const state = {
    settings: { assistantName: 'JARVIS', userName: '', style: 'jarvis', model: 'demo', customInstructions: '', memoryEnabled: true, webSearchEnabled: false, historyEnabled: true },
    memories: [],
    conversations: new Map(),
  };
  let n = 1;

  const routes = {
    'GET /api/health': () => ({ ok: true, name: 'JARVIS offline demo', version: 'demo' }),
    'GET /api/config': () => ({
      version: 'demo',
      models: [{ id: 'demo', label: 'Offline demo (no AI)', provider: 'demo', webSearch: false }],
      defaultModel: 'demo',
      styles: [{ id: 'jarvis', label: 'JARVIS (default)' }, { id: 'concise', label: 'Concise' }, { id: 'unity', label: 'Unity game dev' }],
      memoryKinds: ['fact', 'preference', 'project', 'instruction'],
      features: { webSearch: false },
    }),
    'GET /api/settings': () => ({ settings: state.settings }),
    'PUT /api/settings': (b) => { Object.assign(state.settings, b); return { settings: state.settings }; },
    'GET /api/memories': () => ({ memories: state.memories }),
    'POST /api/memories': (b) => { const m = { id: `mem_demo${n++}`, source: 'user', created_at: Date.now(), updated_at: Date.now(), title: '', ...b }; state.memories.push(m); return { memory: m }; },
    'DELETE /api/memories': () => { state.memories = []; return { ok: true }; },
    'GET /api/conversations': () => ({ conversations: [...state.conversations.values()].map(({ id, title, updated_at, messages }) => ({ id, title, updated_at, message_count: messages.length })).reverse() }),
    'DELETE /api/conversations': () => { state.conversations.clear(); return { ok: true }; },
    'GET /api/usage': () => ({ today: { cost_usd: 0, requests: 0 }, month: { cost_usd: 0, requests: 0 }, note: 'Demo mode is free.' }),
    'GET /api/devices': () => ({ devices: [{ id: 'demo', name: 'This device (demo)', platform: 'demo', last_seen_at: Date.now() }], currentId: 'demo' }),
    'GET /api/auth/me': () => ({ device: { id: 'demo', name: 'Demo' } }),
  };

  return {
    demo: true,
    async health() { return routes['GET /api/health'](); },
    async request(method, path, body) {
      const key = `${method} ${path}`;
      if (routes[key]) return routes[key](body);
      let m;
      if ((m = /^(PUT|DELETE) \/api\/memories\/(.+)$/.exec(key))) {
        const i = state.memories.findIndex((x) => x.id === m[2]);
        if (i < 0) throw Object.assign(new Error('Memory not found'), { code: 'not_found' });
        if (m[1] === 'DELETE') { state.memories.splice(i, 1); return { ok: true }; }
        state.memories[i] = { ...state.memories[i], ...body, updated_at: Date.now() };
        return { memory: state.memories[i] };
      }
      if ((m = /^(GET|DELETE) \/api\/conversations\/(.+)$/.exec(key))) {
        const c = state.conversations.get(m[2]);
        if (!c) throw Object.assign(new Error('Conversation not found'), { code: 'not_found' });
        if (m[1] === 'DELETE') { state.conversations.delete(m[2]); return { ok: true }; }
        return { conversation: c, messages: c.messages };
      }
      throw Object.assign(new Error('Not available in the offline demo. Connect a JARVIS server for this.'), { code: 'demo' });
    },
    async chat(body, { signal, onEvent }) {
      let c = body.conversationId && state.conversations.get(body.conversationId);
      if (!c) {
        c = { id: `conv_demo${n++}`, title: (body.message || 'Demo').slice(0, 60), messages: [], updated_at: Date.now() };
        state.conversations.set(c.id, c);
      }
      onEvent('conversation', { id: c.id, title: c.title });
      onEvent('status', { state: 'thinking' });
      c.messages.push({ role: 'user', text: body.message || '', attachments: (body.attachments || []).map((a) => a.name) });
      await sleep(500, signal);
      const text = body.message || '';
      let reply;
      const remember = /remember (?:that )?(.+)/i.exec(text);
      if (remember && state.settings.memoryEnabled) {
        const memory = { id: `mem_demo${n++}`, kind: 'fact', title: '', content: remember[1], source: 'assistant', created_at: Date.now(), updated_at: Date.now() };
        state.memories.push(memory);
        onEvent('memory', { action: 'saved', memory });
        reply = `Noted. In the real app I would remember that "${remember[1]}". This is the offline demo, so it is only kept until you close the app.`;
      } else {
        reply =
          `This is the **offline demo**: no AI is connected, so I can't really answer yet. You said: "${text.slice(0, 160)}".\n\n` +
          'What you can test here:\n- the microphone button and speech recognition\n- spoken replies (turn on **Voice replies**)\n- the interface, settings and memory screens\n\n' +
          'To get real answers, set up the JARVIS server (see the README) and connect to it in **Settings > Connection**.';
      }
      let shown = '';
      for (const word of reply.split(/(?<= )/)) {
        await sleep(28, signal);
        shown += word;
        onEvent('delta', { text: word });
      }
      c.messages.push({ role: 'assistant', text: shown });
      c.updated_at = Date.now();
      onEvent('done', { stopReason: 'end_turn', usage: { costUsd: 0 } });
    },
  };
}
