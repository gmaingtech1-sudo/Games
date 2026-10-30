// JARVIS AI main controller: connection, chat streaming, voice and status.

import { platform } from './platform.js';
import { createApi, normaliseServerUrl, isInsecure, ApiError } from './api.js';
import { createDemoApi } from './demo.js';
import { createVisualizer } from './visualizer.js';
import { createVoice } from './voice.js';
import { renderMarkdown, createSentenceSplitter, toSpeakable } from './markdown.js';
import { sounds } from './sounds.js';
import { $, h, icon, toast, copyText, formatTime } from './dom.js';
import { openSettings, openHistory, openMemory, closeDrawer } from './panels.js';

const PREFS_KEY = 'jarvis.prefs';
const DEFAULT_PREFS = {
  serverUrl: '',
  deviceName: '',
  demo: false,
  voiceReplies: false,
  handsFree: false,
  wakeWord: false,
  wakePhrase: 'Jarvis',
  voice: '',
  rate: 1,
  pitch: 1,
  volume: 1,
  language: 'en-GB',
  theme: 'arc',
  effects: 'full',
  sounds: true,
  sendOnEnter: true,
  pcTools: true,
};

function loadPrefs() {
  try { return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') }; } catch { return { ...DEFAULT_PREFS }; }
}

const state = {
  prefs: loadPrefs(),
  token: null,
  api: null,
  config: null,
  settings: null,
  online: false,
  conversationId: null,
  busy: false,
  controller: null,
  attachments: [],
  clientTools: [],
  lastInputWasVoice: false,
  retryTimer: 0,
  retryDelay: 5000,
};

const el = {
  app: $('#app'), status: $('#statusChip'), conn: $('#connDot'), brand: $('#brandName'),
  coreState: $('#coreState'), coreHint: $('#coreHint'), messages: $('#messages'), empty: $('#empty'),
  input: $('#input'), mic: $('#btnMic'), send: $('#btnSend'), stop: $('#btnStop'), attach: $('#btnAttach'),
  fileInput: $('#fileInput'), attachList: $('#attachments'), banner: $('#banner'), style: $('#styleSelect'),
  voiceReplies: $('#btnVoiceReplies'), handsFree: $('#btnHandsFree'), stopSpeaking: $('#btnStopSpeaking'),
};

let viz;
let voice;

// ---- preferences ------------------------------------------------------------
function savePrefs(patch) {
  Object.assign(state.prefs, patch);
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(state.prefs)); } catch { /* storage unavailable */ }
  applyPrefs();
}

function applyPrefs() {
  const p = state.prefs;
  document.documentElement.dataset.theme = p.theme;
  document.documentElement.dataset.effects = p.effects;
  viz?.setEffects(p.effects);
  viz?.refreshColors();
  sounds.setEnabled(p.sounds);
  el.voiceReplies.setAttribute('aria-pressed', String(p.voiceReplies));
  el.handsFree.setAttribute('aria-pressed', String(p.handsFree));
  el.voiceReplies.hidden = !platform.can('tts');
  el.handsFree.hidden = !platform.can('stt');
  el.mic.hidden = !platform.can('stt');
}

// ---- status -----------------------------------------------------------------
const STATUS_TEXT = {
  idle: ['IDLE', 'STANDING BY'],
  listening: ['LISTENING', 'LISTENING'],
  thinking: ['THINKING', 'PROCESSING'],
  speaking: ['SPEAKING', 'SPEAKING'],
  offline: ['OFFLINE', 'OFFLINE'],
};
let hintOverride = '';

function updateStatus() {
  let s = 'idle';
  if (!state.online) s = 'offline';
  if (voice?.listening) s = 'listening';
  else if (voice?.speaking) s = 'speaking';
  else if (state.busy) s = 'thinking';
  el.status.dataset.state = s;
  el.status.textContent = STATUS_TEXT[s][0];
  el.coreState.textContent = STATUS_TEXT[s][1];
  el.mic.classList.toggle('listening', s === 'listening');
  el.mic.setAttribute('aria-label', s === 'listening' ? 'Stop listening' : 'Start voice input');
  el.stopSpeaking.hidden = !voice?.speaking;
  el.send.hidden = state.busy;
  el.stop.hidden = !state.busy;
  let hint = hintOverride;
  if (!hint) {
    if (s === 'offline') hint = state.api ? 'Server unreachable. Retrying…' : 'Not connected';
    else if (s === 'listening') hint = 'Speak now…';
    else if (s === 'idle') hint = voice?.wakeActive ? `Say "${state.prefs.wakePhrase}" or tap the microphone` : platform.can('stt') ? 'Tap the microphone or type a message' : 'Type a message';
    else hint = '';
  }
  el.coreHint.textContent = hint;
  viz?.setState(s);
}

function setConnection(conn) {
  el.conn.dataset.conn = conn;
  el.conn.title = { online: 'Connected', offline: 'Offline', demo: 'Offline demo', unknown: 'Not connected' }[conn];
  state.online = conn === 'online' || conn === 'demo';
  updateStatus();
}

function showBanner(message, { kind = 'error', action, actionLabel } = {}) {
  el.banner.replaceChildren(...[h('span', message), action ? h('button.btn.btn-small', { type: 'button', onclick: action }, actionLabel) : null].filter(Boolean));
  el.banner.className = `banner ${kind === 'info' ? 'info' : ''}`;
  el.banner.hidden = false;
}
const hideBanner = () => { el.banner.hidden = true; };

// ---- connection ---------------------------------------------------------------
function makeApi() {
  if (state.prefs.demo) return createDemoApi();
  if (!state.prefs.serverUrl || !state.token) return null;
  return createApi({
    getBase: () => state.prefs.serverUrl,
    getToken: () => state.token,
    onUnauthorized: (msg) => {
      setConnection('offline');
      showPairModal(msg || 'This device needs to be paired again.');
    },
  });
}

async function connect() {
  clearTimeout(state.retryTimer);
  state.api = makeApi();
  if (!state.api) {
    setConnection('unknown');
    showPairModal();
    return;
  }
  try {
    await state.api.health();
    const [config, { settings }] = await Promise.all([state.api.request('GET', '/api/config'), state.api.request('GET', '/api/settings')]);
    state.config = config;
    state.settings = settings;
    state.retryDelay = 5000;
    hideBanner();
    setConnection(state.api.demo ? 'demo' : 'online');
    if (state.api.demo) showBanner('Offline demo: no AI is connected. Replies are canned.', { kind: 'info', action: () => openSettings(ctx, 'connection'), actionLabel: 'Connect a server' });
    else if (isInsecure(state.prefs.serverUrl)) showBanner('Connected over plain http on your local network. Use an https server address before using JARVIS away from home.', { kind: 'info' });
    applyServerSettings();
    await loadClientTools();
  } catch (err) {
    if (err.status === 401) return;
    setConnection('offline');
    showBanner(err.message, { action: () => { state.retryDelay = 5000; connect(); }, actionLabel: 'Retry now' });
    state.retryTimer = setTimeout(connect, state.retryDelay);
    state.retryDelay = Math.min(state.retryDelay * 2, 60000);
  }
}

function applyServerSettings() {
  const s = state.settings || {};
  const name = (s.assistantName || 'JARVIS').toUpperCase();
  el.brand.textContent = name;
  document.title = `${s.assistantName || 'JARVIS'} AI`;
  el.input.placeholder = `Message ${s.assistantName || 'JARVIS'}…`;
  el.style.replaceChildren(...(state.config?.styles || []).map((st) => h('option', { value: st.id, selected: st.id === s.style }, st.label)));
}

async function loadClientTools() {
  state.clientTools = [];
  if (!platform.can('pcTools') || !state.prefs.pcTools || state.api?.demo) return;
  try {
    state.clientTools = await platform.call('tools.list');
  } catch (err) {
    console.warn('tools.list failed', err);
  }
}

// ---- pairing modal ------------------------------------------------------------------
function showPairModal(message) {
  const modal = $('#pairModal');
  $('#pairUrl').value = state.prefs.serverUrl || (location.protocol.startsWith('http') && platform.name === 'web' ? location.origin : '');
  $('#pairDevice').value = state.prefs.deviceName || defaultDeviceName();
  $('#pairPassword').value = '';
  const err = $('#pairError');
  err.hidden = !message;
  err.textContent = message || '';
  modal.hidden = false;
  setTimeout(() => ($('#pairUrl').value ? $('#pairPassword') : $('#pairUrl')).focus(), 50);
}

function defaultDeviceName() {
  return { android: 'Android phone', windows: 'Windows PC', web: 'Web browser' }[platform.name] || 'My device';
}

async function pair(event) {
  event.preventDefault();
  const err = $('#pairError');
  const btn = $('#pairSubmit');
  err.hidden = true;
  let base;
  try {
    base = normaliseServerUrl($('#pairUrl').value);
  } catch (e) {
    err.textContent = e.message;
    err.hidden = false;
    return;
  }
  btn.disabled = true;
  btn.textContent = 'Connecting…';
  try {
    const deviceName = $('#pairDevice').value.trim() || defaultDeviceName();
    const res = await createApi({ getBase: () => base, getToken: () => '' }).pair(base, $('#pairPassword').value, deviceName, platform.name);
    await platform.call('storage.set', { key: 'token', value: res.token });
    state.token = res.token;
    savePrefs({ serverUrl: base, deviceName, demo: false });
    $('#pairModal').hidden = true;
    sounds.play('boot');
    toast(`Paired as "${deviceName}".`, { kind: 'ok' });
    await connect();
  } catch (e) {
    err.textContent = e.code === 'wrong_password' ? 'Wrong password. Use the JARVIS_PASSWORD value from the server.' : e.message;
    err.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Connect';
  }
}

async function unpair() {
  try { if (state.api && !state.api.demo) await state.api.request('POST', '/api/auth/unpair'); } catch { /* server may be gone */ }
  await platform.call('storage.remove', { key: 'token' }).catch(() => {});
  state.token = null;
  savePrefs({ demo: false });
  newConversation();
  closeDrawer();
  await connect();
}

function startDemo() {
  savePrefs({ demo: true });
  $('#pairModal').hidden = true;
  connect();
}

// ---- messages -------------------------------------------------------------------------
function refreshEmpty() {
  const has = el.messages.children.length > 0;
  el.empty.hidden = has;
  el.app.classList.toggle('has-messages', has);
}

function scrollToEnd(force) {
  const m = el.messages;
  if (force || m.scrollHeight - m.scrollTop - m.clientHeight < 140) m.scrollTop = m.scrollHeight;
}

function addUserMessage(text, attachments = []) {
  const node = h('div.msg.user',
    h('div.who', 'YOU'),
    h('div.bubble', text || ''),
    attachments.length ? h('div.meta.tiny.muted', `Attached: ${attachments.join(', ')}`) : null);
  el.messages.append(node);
  refreshEmpty();
  scrollToEnd(true);
  return node;
}

function assistantName() {
  return (state.settings?.assistantName || 'JARVIS').toUpperCase();
}

function addAssistantMessage(text = '', { streaming = false, sources = [], time } = {}) {
  const bubble = h('div.bubble');
  const actions = h('div.msg-actions',
    h('button.icon-btn', { type: 'button', title: 'Copy', 'aria-label': 'Copy reply', onclick: () => copyText(node._text).then(() => toast('Copied')) }, icon('i-copy')),
    platform.can('tts') ? h('button.icon-btn', { type: 'button', title: 'Read aloud', 'aria-label': 'Read aloud', onclick: () => { voice.stopSpeaking(); voice.speak(toSpeakable(node._text)); } }, icon('i-speaker')) : null);
  const node = h(`div.msg.assistant${streaming ? '.streaming' : ''}`, h('div.who', time ? `${assistantName()} · ${formatTime(time)}` : assistantName()), bubble, actions);
  node._text = text;
  node._bubble = bubble;
  if (text) bubble.innerHTML = renderMarkdown(text);
  if (sources.length) addSources(node, sources);
  actions.hidden = streaming;
  el.messages.append(node);
  refreshEmpty();
  scrollToEnd(true);
  return node;
}

function addSources(node, sources) {
  node.querySelector('.sources')?.remove();
  const list = h('ol', sources.map((s) => {
    let domain = '';
    try { domain = new URL(s.url).hostname.replace(/^www\./, ''); } catch { /* ignore */ }
    return h('li', h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer', onclick: (e) => openLink(e, s.url) }, s.title || s.url), ' ', h('span.domain', domain), s.cited ? h('span.badge', 'cited') : null, s.page_age ? h('span.domain', ` · ${s.page_age}`) : null);
  }));
  node._bubble.after(h('div.sources', h('h4', 'SOURCES'), list, h('div.tiny.muted', 'Check important facts in the sources; web results can be incomplete or out of date.')));
}

function openLink(e, url) {
  if (platform.name === 'web') return;
  e.preventDefault();
  platform.call('app.openExternal', { url }).catch(() => window.open(url, '_blank'));
}

function addCard(kind, label, content, extra) {
  const node = h(`div.event-card.${kind}`, h('span.label', label), h('div', content), h('span.spacer'), extra || null);
  el.messages.append(node);
  refreshEmpty();
  scrollToEnd();
  return node;
}

function newConversation() {
  if (state.busy) stopResponse();
  state.conversationId = null;
  el.messages.replaceChildren();
  refreshEmpty();
  el.input.focus();
}

async function openConversation(id) {
  try {
    const { conversation, messages } = await state.api.request('GET', `/api/conversations/${encodeURIComponent(id)}`);
    if (state.busy) stopResponse();
    state.conversationId = conversation.id;
    el.messages.replaceChildren();
    for (const m of messages) {
      if (m.role === 'user') addUserMessage(m.text, m.attachments || []);
      else addAssistantMessage(m.text + (m.interrupted ? '\n\n*(interrupted)*' : ''), { sources: m.sources || [], time: m.created_at });
    }
    refreshEmpty();
    scrollToEnd(true);
    closeDrawer();
  } catch (err) {
    toast(err.message, { kind: 'error' });
  }
}

// ---- sending ---------------------------------------------------------------------------
function setBusy(b) {
  state.busy = b;
  updateStatus();
}

function stopResponse() {
  if (state.toolsRunning) {
    stoppedTools = true;
    platform.call('tools.cancel').catch(() => {});
  }
  state.controller?.abort();
  voice.stopSpeaking();
}

async function send(text, { fromVoice = false } = {}) {
  text = (text ?? el.input.value).trim();
  if (state.busy || (!text && !state.attachments.length)) return;
  if (!state.api) return showPairModal();
  state.lastInputWasVoice = fromVoice;
  const attachments = state.attachments;
  state.attachments = [];
  renderAttachments();
  el.input.value = '';
  autoGrow();
  addUserMessage(text, attachments.map((a) => a.name));
  sounds.play('send');
  await runTurn({ conversationId: state.conversationId, message: text, attachments, clientTools: state.clientTools.length ? state.clientTools : undefined, model: state.settings?.model || undefined });
}

async function runTurn(body) {
  const node = addAssistantMessage('', { streaming: true });
  const speakOn = state.prefs.voiceReplies && platform.can('tts');
  const splitter = createSentenceSplitter((sentence) => voice.speak(sentence));
  let text = '';
  let rendered = 0;
  let renderQueued = false;
  let toolCalls = null;
  let failed = null;
  const render = () => {
    renderQueued = false;
    if (rendered === text.length) return;
    rendered = text.length;
    node._text = text;
    node._bubble.innerHTML = renderMarkdown(text);
    scrollToEnd();
  };

  state.controller = new AbortController();
  setBusy(true);
  try {
    await state.api.chat(body, {
      signal: state.controller.signal,
      onEvent(event, data) {
        switch (event) {
          case 'conversation':
            state.conversationId = data.id;
            break;
          case 'status':
            hintOverride = data.state === 'searching' ? 'Searching the web…' : text ? '' : 'Thinking…';
            updateStatus();
            break;
          case 'delta':
            if (!text) { hintOverride = ''; updateStatus(); }
            text += data.text;
            if (speakOn) splitter.add(data.text);
            if (!renderQueued) { renderQueued = true; requestAnimationFrame(render); }
            break;
          case 'sources':
            addSources(node, data.items);
            break;
          case 'memory':
            if (data.action === 'saved') {
              addCard('ok', 'MEMORY SAVED', data.memory.content, h('button.btn.btn-small', { type: 'button', onclick: async (e) => {
                try {
                  await state.api.request('DELETE', `/api/memories/${encodeURIComponent(data.memory.id)}`);
                  e.target.closest('.event-card').querySelector('.label').textContent = 'MEMORY REMOVED';
                  e.target.remove();
                } catch (err) { toast(err.message, { kind: 'error' }); }
              } }, 'Undo'));
            } else {
              addCard('warn', 'MEMORY DELETED', data.memory.content);
            }
            break;
          case 'notice':
            addCard('warn', data.code === 'refused' ? 'DECLINED' : 'NOTICE', data.message);
            break;
          case 'tool_request':
            toolCalls = data.calls;
            break;
          case 'error':
            failed = data;
            break;
          default:
            break;
        }
      },
    });
  } catch (err) {
    failed = err instanceof ApiError ? { code: err.code, message: err.message, retryable: err.retryable } : { code: 'error', message: String(err.message || err), retryable: true };
  } finally {
    state.controller = null;
    render();
    node.classList.remove('streaming');
    node.querySelector('.msg-actions').hidden = !text;
    if (!text) node.remove();
    if (speakOn) splitter.flush();
    hintOverride = '';
    setBusy(false);
  }

  if (failed) {
    if (failed.code === 'aborted') {
      if (text) node._bubble.append(h('div.tiny.muted', '(stopped)'));
      return;
    }
    sounds.play('error');
    if (failed.code === 'offline' || failed.code === 'stream_broken') setConnection('offline');
    const retry = failed.retryable && body.message !== undefined
      ? h('button.btn.btn-small', { type: 'button', onclick: (e) => { e.target.closest('.event-card').remove(); runTurn(body); } }, 'Retry')
      : null;
    addCard('error', 'ERROR', failed.message, retry);
    if (failed.code === 'offline') connect();
    return;
  }
  if (toolCalls) return handleToolCalls(toolCalls);
  if (text) sounds.play('reply');
  maybeListenAgain();
}

function maybeListenAgain() {
  if (!state.prefs.handsFree || !state.lastInputWasVoice || !platform.can('stt')) {
    voice.resumeWake();
    return;
  }
  const go = () => setTimeout(() => { if (!state.busy && !voice.speaking) voice.listen(); }, 350);
  if (voice.speaking) pendingAfterSpeech = go;
  else go();
}
let pendingAfterSpeech = null;

async function handleToolCalls(calls) {
  const results = [];
  stoppedTools = false;
  state.toolsRunning = true;
  setBusy(true);
  for (const call of calls) {
    const card = addCard('warn', 'ACTION REQUESTED', h('div', h('strong', call.name), ' ', h('code', JSON.stringify(call.input))), h('span.tiny.muted', 'Waiting for your approval…'));
    try {
      const result = await platform.call('tools.execute', { call });
      results.push({ id: call.id, content: result.content, isError: Boolean(result.isError) });
      card.className = `event-card ${result.isError ? 'error' : 'ok'}`;
      card.querySelector('.label').textContent = result.declined ? 'DECLINED BY YOU' : result.isError ? 'ACTION FAILED' : 'ACTION DONE';
      card.lastElementChild.textContent = String(result.summary || result.content).slice(0, 300);
    } catch (err) {
      results.push({ id: call.id, content: `The app could not run this tool: ${err.message}`, isError: true });
      card.className = 'event-card error';
      card.querySelector('.label').textContent = 'ACTION FAILED';
      card.lastElementChild.textContent = err.message;
    }
    if (stoppedTools) break;
  }
  state.toolsRunning = false;
  setBusy(false);
  if (stoppedTools) {
    // Don't continue the AI turn. The server closes the unanswered tool
    // calls as cancelled when the next message is sent.
    stoppedTools = false;
    addCard('error', 'STOPPED', 'Stopped. Remaining actions were cancelled and nothing else will run.');
    return;
  }
  await runTurn({ conversationId: state.conversationId, toolResults: results, clientTools: state.clientTools, model: state.settings?.model || undefined });
}
let stoppedTools = false;

// ---- attachments --------------------------------------------------------------------------
const MAX_FILE_CHARS = 300000;

function renderAttachments() {
  el.attachList.hidden = !state.attachments.length;
  el.attachList.replaceChildren(...state.attachments.map((a, i) => h('span.attach-item', a.name, h('button', { type: 'button', 'aria-label': `Remove ${a.name}`, onclick: () => { state.attachments.splice(i, 1); renderAttachments(); } }, '×'))));
}

function addAttachment(name, text) {
  if (text.includes('\u0000')) return toast(`${name} looks like a binary file. Attach text or code files.`, { kind: 'error' });
  if (text.length > MAX_FILE_CHARS) return toast(`${name} is too large to attach (over ${MAX_FILE_CHARS.toLocaleString()} characters).`, { kind: 'error' });
  state.attachments.push({ name, text });
  renderAttachments();
}

async function pickFile() {
  if (platform.name !== 'web' && platform.can('files')) {
    try {
      const file = await platform.call('file.pick', {});
      if (file) addAttachment(file.name, file.text);
    } catch (err) {
      toast(err.message, { kind: 'error' });
    }
    return;
  }
  el.fileInput.click();
}

el.fileInput.addEventListener('change', async () => {
  for (const f of el.fileInput.files) {
    if (f.size > MAX_FILE_CHARS * 4) { toast(`${f.name} is too large to attach.`, { kind: 'error' }); continue; }
    addAttachment(f.name, await f.text());
  }
  el.fileInput.value = '';
});

// ---- input ----------------------------------------------------------------------------------
function autoGrow() {
  el.input.style.height = 'auto';
  el.input.style.height = `${Math.min(el.input.scrollHeight, 180)}px`;
}

el.input.addEventListener('input', autoGrow);
el.input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && state.prefs.sendOnEnter && !e.isComposing && platform.name !== 'android') {
    e.preventDefault();
    send();
  }
});
el.send.addEventListener('click', () => send());
el.stop.addEventListener('click', stopResponse);
el.attach.addEventListener('click', pickFile);
el.mic.addEventListener('click', async () => {
  if (voice.listening) return voice.stopListening();
  if (state.busy) stopResponse();
  sounds.play('listen');
  await voice.listen();
});
el.stopSpeaking.addEventListener('click', () => voice.stopSpeaking());
el.voiceReplies.addEventListener('click', () => {
  savePrefs({ voiceReplies: !state.prefs.voiceReplies });
  if (!state.prefs.voiceReplies) voice.stopSpeaking();
  toast(state.prefs.voiceReplies ? 'Replies will be spoken aloud.' : 'Voice replies off.');
});
el.handsFree.addEventListener('click', () => {
  savePrefs({ handsFree: !state.prefs.handsFree, ...(!state.prefs.handsFree ? { voiceReplies: true } : {}) });
  toast(state.prefs.handsFree ? 'Hands-free: after a spoken question, JARVIS answers aloud and listens again.' : 'Hands-free off.');
});
el.style.addEventListener('change', async () => {
  try {
    const { settings } = await state.api.request('PUT', '/api/settings', { style: el.style.value });
    state.settings = settings;
    toast(`Style: ${el.style.selectedOptions[0].textContent}`);
  } catch (err) { toast(err.message, { kind: 'error' }); }
});
document.querySelectorAll('.suggest').forEach((b) => b.addEventListener('click', () => send(b.dataset.prompt)));
el.messages.addEventListener('click', (e) => {
  const btn = e.target.closest('.code-copy');
  if (!btn) return;
  copyText(btn.closest('.codeblock').querySelector('code').textContent).then(() => { btn.textContent = 'Copied'; setTimeout(() => (btn.textContent = 'Copy'), 1500); });
});
$('#btnNew').addEventListener('click', newConversation);
$('#btnHistory').addEventListener('click', () => openHistory(ctx));
$('#btnMemory').addEventListener('click', () => openMemory(ctx));
$('#btnSettings').addEventListener('click', () => openSettings(ctx));
$('#pairForm').addEventListener('submit', pair);
$('#pairDemo').addEventListener('click', startDemo);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!$('#drawer').hidden) closeDrawer();
    else if (voice.speaking) voice.stopSpeaking();
    else if (state.busy) stopResponse();
  }
});

// Shared with panels.js.
const ctx = {
  state, platform, savePrefs, applyPrefs, connect, unpair, openConversation, newConversation, applyServerSettings, loadClientTools,
  get api() { return state.api; },
  get voice() { return voice; },
  showPairModal, toast,
};

// ---- start-up -----------------------------------------------------------------------------------
async function main() {
  await platform.init();
  viz = createVisualizer($('#viz'));
  voice = createVoice({
    platform,
    prefs: () => state.prefs,
    on: {
      state: updateStatus,
      ready: () => {},
      partial: (text) => { el.input.value = text; autoGrow(); },
      final: (text) => {
        sounds.play('listenEnd');
        el.input.value = text;
        if (text.trim()) send(text, { fromVoice: true });
      },
      nothingHeard: () => { hintOverride = "I didn't catch that."; updateStatus(); setTimeout(() => { hintOverride = ''; updateStatus(); voice.resumeWake(); }, 2200); },
      ended: () => voice.resumeWake(),
      level: (v) => viz.setLevel(v),
      error: (err) => {
        sounds.play('error');
        const msg = err.code === 'permission_denied'
          ? 'Microphone permission is off. Allow it in Settings > Microphone (or your phone/PC privacy settings) to talk to JARVIS.'
          : `Voice error: ${err.message || err.code}`;
        toast(msg, { kind: 'error', ms: 6000 });
      },
      speechDone: () => { if (pendingAfterSpeech) { const f = pendingAfterSpeech; pendingAfterSpeech = null; f(); } else voice.resumeWake(); },
      wake: (rest) => {
        sounds.play('listen');
        if (rest) send(rest, { fromVoice: true });
        else voice.listen();
      },
      isBusy: () => state.busy,
    },
  });
  platform.on('emergency.stop', () => {
    if (state.toolsRunning) stoppedTools = true;
    state.controller?.abort();
    voice.stopSpeaking();
    toast('Emergency stop: everything was stopped.', { kind: 'error', ms: 6000 });
  });
  platform.on('app.resume', () => { if (!state.online && state.api) connect(); });
  window.addEventListener('online', () => { if (!state.online) connect(); });

  applyPrefs();
  updateStatus();
  refreshEmpty();
  if (platform.name !== 'android') el.input.focus();

  try { state.token = await platform.call('storage.get', { key: 'token' }); } catch { state.token = null; }
  await connect();
  if (state.prefs.wakeWord && platform.can('stt')) voice.startWake().then(updateStatus).catch((err) => toast(err.message, { kind: 'error' }));
}

main();
