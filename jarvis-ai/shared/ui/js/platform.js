// Platform bridge. The same UI runs in three hosts:
//   android  - Android WebView, native bridge object window.JarvisAndroid
//   windows  - WebView2 in the Windows app, window.chrome.webview
//   web      - any browser (uses Web Speech API where the browser has it)
//
// Native hosts speak one JSON protocol:
//   UI -> host:  {"id": 7, "method": "tts.speak", "params": {...}}
//   host -> UI:  {"id": 7, "result": ...} | {"id": 7, "error": {"message": "..."}}
//                {"event": "stt.final", "data": {...}}

const listeners = new Map();
const pending = new Map();
let nextId = 1;

function emit(event, data) {
  for (const fn of listeners.get(event) || []) {
    try { fn(data); } catch (err) { console.error(`[platform] ${event} handler failed`, err); }
  }
}

function receive(raw) {
  let msg;
  try { msg = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return; }
  if (msg.event) return emit(msg.event, msg.data);
  const p = pending.get(msg.id);
  if (!p) return;
  pending.delete(msg.id);
  if (msg.error) p.reject(Object.assign(new Error(msg.error.message || 'Native call failed'), { code: msg.error.code }));
  else p.resolve(msg.result);
}

function nativeTransport() {
  if (window.JarvisAndroid?.postMessage) {
    window.JarvisBridge = { receive };
    return { name: 'android', post: (s) => window.JarvisAndroid.postMessage(s) };
  }
  if (window.chrome?.webview?.postMessage) {
    window.chrome.webview.addEventListener('message', (e) => receive(e.data));
    return { name: 'windows', post: (s) => window.chrome.webview.postMessage(s) };
  }
  return null;
}

function makeNative(transport) {
  const call = (method, params = {}, timeoutMs = 0) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      transport.post(JSON.stringify({ id, method, params }));
      if (timeoutMs) {
        setTimeout(() => {
          if (pending.delete(id)) reject(Object.assign(new Error(`${method} timed out`), { code: 'timeout' }));
        }, timeoutMs);
      }
    });
  return { name: transport.name, call };
}

// ---- browser fallback ------------------------------------------------------
function makeWeb() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognizer = null;
  let utterances = 0;
  const synth = window.speechSynthesis;

  const handlers = {
    'host.info': async () => ({
      platform: 'web',
      version: 'web',
      capabilities: { stt: Boolean(Recognition), tts: Boolean(synth), wakeWord: false, pcTools: false, files: true, secureStorage: false, permissions: false },
    }),
    'storage.get': async ({ key }) => { try { return localStorage.getItem(`jarvis.secure.${key}`); } catch { return null; } },
    'storage.set': async ({ key, value }) => { try { localStorage.setItem(`jarvis.secure.${key}`, value); } catch { /* private mode */ } return true; },
    'storage.remove': async ({ key }) => { try { localStorage.removeItem(`jarvis.secure.${key}`); } catch { /* ignore */ } return true; },
    'stt.start': async ({ lang }) => {
      if (!Recognition) throw Object.assign(new Error('This browser has no speech recognition. Try Chrome or Edge, or type instead.'), { code: 'unsupported' });
      recognizer?.abort();
      recognizer = new Recognition();
      recognizer.lang = lang || 'en-GB';
      recognizer.interimResults = true;
      recognizer.continuous = false;
      recognizer.onresult = (e) => {
        let text = '';
        let final = false;
        for (let i = 0; i < e.results.length; i++) {
          text += e.results[i][0].transcript;
          if (e.results[i].isFinal) final = true;
        }
        emit(final ? 'stt.final' : 'stt.partial', { text });
      };
      recognizer.onerror = (e) => emit('stt.error', { code: e.error === 'not-allowed' ? 'permission_denied' : e.error, message: e.error });
      recognizer.onend = () => emit('stt.end', {});
      recognizer.onstart = () => emit('stt.ready', {});
      recognizer.start();
      return true;
    },
    'stt.stop': async () => { recognizer?.stop(); return true; },
    'stt.cancel': async () => { recognizer?.abort(); return true; },
    'tts.voices': async () => (synth ? synth.getVoices().map((v) => ({ id: v.voiceURI, name: v.name, lang: v.lang })) : []),
    'tts.speak': async ({ text, rate, pitch, volume, voice, id }) => {
      if (!synth) throw new Error('Speech output is not available in this browser.');
      const u = new SpeechSynthesisUtterance(text);
      u.rate = rate ?? 1;
      u.pitch = pitch ?? 1;
      u.volume = volume ?? 1;
      const v = synth.getVoices().find((x) => x.voiceURI === voice);
      if (v) { u.voice = v; u.lang = v.lang; }
      utterances++;
      u.onstart = () => emit('tts.start', { id });
      u.onboundary = () => emit('tts.boundary', { id });
      u.onend = () => { utterances--; emit('tts.done', { id }); };
      u.onerror = (e) => { utterances--; emit('tts.done', { id, error: e.error }); };
      synth.speak(u);
      return true;
    },
    'tts.stop': async () => { synth?.cancel(); return true; },
    'file.pick': async () => null, // the UI uses an <input type=file> in browsers
    'app.openExternal': async ({ url }) => { window.open(url, '_blank', 'noopener'); return true; },
    'app.permission': async () => ({ microphone: 'prompt' }),
  };
  return {
    name: 'web',
    call: async (method, params = {}) => {
      const h = handlers[method];
      if (!h) throw Object.assign(new Error(`${method} is not available in the browser version`), { code: 'unsupported' });
      return h(params);
    },
  };
}

const transport = nativeTransport();
const impl = transport ? makeNative(transport) : makeWeb();

export const platform = {
  name: impl.name,
  call: impl.call,
  on(event, fn) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(fn);
    return () => listeners.get(event).delete(fn);
  },
  info: null,
  async init() {
    try {
      this.info = await impl.call('host.info', {}, 5000);
    } catch {
      this.info = { platform: impl.name, version: '?', capabilities: {} };
    }
    return this.info;
  },
  can(capability) {
    return Boolean(this.info?.capabilities?.[capability]);
  },
};
