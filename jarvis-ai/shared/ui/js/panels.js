// Settings, History and Memory drawers.

import { $, h, icon, toast, formatTime, confirmDialog } from './dom.js';

const drawer = $('#drawer');
const scrim = $('#scrim');
const body = $('#drawerBody');
let lastFocus = null;

function openDrawer(title) {
  lastFocus = document.activeElement;
  $('#drawerTitle').textContent = title;
  body.replaceChildren();
  drawer.hidden = false;
  scrim.hidden = false;
  $('#btnDrawerClose').focus();
}

export function closeDrawer() {
  drawer.hidden = true;
  scrim.hidden = true;
  lastFocus?.focus?.();
}
$('#btnDrawerClose').addEventListener('click', closeDrawer);
scrim.addEventListener('click', closeDrawer);

// ---- form helpers -----------------------------------------------------------
const section = (title, ...children) => h('div.section', h('h3', title), ...children);

function toggle(label, desc, checked, onchange, { disabled } = {}) {
  const input = h('input', { type: 'checkbox', checked, disabled, onchange: (e) => onchange(e.target.checked, e.target) });
  return h('label.toggle-row', h('span', label, desc ? h('span.desc', desc) : null), h('span.switch', input, h('span')));
}

function field(label, control, hint) {
  return h('label.field', h('span', label), control, hint ? h('small', hint) : null);
}

function select(options, value, onchange) {
  return h('select', { onchange: (e) => onchange(e.target.value) }, options.map(([v, l]) => h('option', { value: v, selected: v === value }, l)));
}

function slider(min, max, step, value, onchange, fmt) {
  const out = h('span.muted.tiny', fmt(value));
  const input = h('input', { type: 'range', min, max, step, value, oninput: (e) => { out.textContent = fmt(Number(e.target.value)); }, onchange: (e) => onchange(Number(e.target.value)) });
  return h('div.row', input, out);
}

async function saveServerSettings(ctx, patch) {
  try {
    const { settings } = await ctx.api.request('PUT', '/api/settings', patch);
    ctx.state.settings = settings;
    ctx.applyServerSettings();
    toast('Saved', { kind: 'ok', ms: 1500 });
  } catch (err) {
    toast(err.message, { kind: 'error' });
  }
}

// ---- Settings -------------------------------------------------------------------------
export async function openSettings(ctx, focus) {
  openDrawer('SETTINGS');
  const { state, platform } = ctx;
  const p = state.prefs;
  const s = state.settings;
  const connected = Boolean(ctx.api && state.online);
  const sections = {};

  // Assistant (stored on the server, shared by all your devices)
  if (connected && s) {
    const name = h('input', { type: 'text', value: s.assistantName, maxlength: 40 });
    const userName = h('input', { type: 'text', value: s.userName, maxlength: 60, placeholder: 'Optional' });
    const instructions = h('textarea', { maxlength: 8000, placeholder: 'e.g. I am learning Unity. Use British spelling. Keep answers short unless I ask for detail.' }, s.customInstructions);
    sections.assistant = section('ASSISTANT',
      field('Assistant name', name),
      field('Your name', userName),
      field('Conversation style', select(state.config.styles.map((x) => [x.id, x.label]), s.style, (v) => saveServerSettings(ctx, { style: v }))),
      field('AI model', select([['', `Default (${state.config.models.find((m) => m.id === state.config.defaultModel)?.label || 'server default'})`], ...state.config.models.map((m) => [m.id, m.label])], s.model, (v) => saveServerSettings(ctx, { model: v })),
        'More capable models give better answers but cost more per message. See the README for prices.'),
      field('Custom instructions', instructions, 'Sent with every conversation.'),
      h('button.btn.btn-primary', { type: 'button', onclick: () => saveServerSettings(ctx, { assistantName: name.value.trim() || 'JARVIS', userName: userName.value.trim(), customInstructions: instructions.value }) }, 'Save'),
    );
  } else {
    sections.assistant = section('ASSISTANT', h('p.note', 'Connect to your JARVIS server to change the assistant\'s name, style, model and instructions.'));
  }

  // Voice (this device only)
  const voiceSection = section('VOICE');
  if (platform.can('tts') || platform.can('stt')) {
    let voices = [];
    try { voices = await platform.call('tts.voices'); } catch { voices = []; }
    const lang = (p.language || 'en').slice(0, 2);
    voices.sort((a, b) => Number(b.lang?.startsWith(lang)) - Number(a.lang?.startsWith(lang)) || a.name.localeCompare(b.name));
    voiceSection.append(
      toggle('Speak replies aloud', 'Replies are read out sentence by sentence as they arrive.', p.voiceReplies, (v) => ctx.savePrefs({ voiceReplies: v })),
      toggle('Hands-free conversation', 'After answering a spoken question, JARVIS listens again automatically.', p.handsFree, (v) => ctx.savePrefs({ handsFree: v })),
      field('Language', select([['en-GB', 'English (UK)'], ['en-US', 'English (US)'], ['en-AU', 'English (Australia)'], ['en-IN', 'English (India)'], ['fr-FR', 'Français'], ['de-DE', 'Deutsch'], ['es-ES', 'Español'], ['it-IT', 'Italiano'], ['pt-PT', 'Português'], ['nl-NL', 'Nederlands'], ['pl-PL', 'Polski']], p.language, (v) => ctx.savePrefs({ language: v })),
        'Used for speech recognition. Ask JARVIS to reply in the same language.'),
      platform.can('tts') ? field('Voice', select([['', 'System default'], ...voices.map((v) => [v.id, `${v.name}${v.lang ? ` (${v.lang})` : ''}`])], p.voice, (v) => ctx.savePrefs({ voice: v }))) : null,
      platform.can('tts') ? field('Speech speed', slider(0.5, 2, 0.05, p.rate, (v) => ctx.savePrefs({ rate: v }), (v) => `${v.toFixed(2)}×`)) : null,
      platform.can('tts') && platform.name !== 'windows' ? field('Pitch', slider(0.5, 1.6, 0.05, p.pitch, (v) => ctx.savePrefs({ pitch: v }), (v) => v.toFixed(2))) : null,
      platform.can('tts') ? field('Volume', slider(0, 1, 0.05, p.volume, (v) => ctx.savePrefs({ volume: v }), (v) => `${Math.round(v * 100)}%`)) : null,
      platform.can('tts') ? h('button.btn', { type: 'button', onclick: () => { ctx.voice.stopSpeaking(); ctx.voice.speak(`Hello${s?.userName ? ` ${s.userName}` : ''}. ${s?.assistantName || 'JARVIS'} online and ready.`); } }, 'Test voice') : null,
    );
  } else {
    voiceSection.append(h('p.note', 'Speech is not available here. In a browser, Chrome or Edge support voice input.'));
  }
  sections.voice = voiceSection;

  // Wake word
  const wakeDesc = {
    windows: 'Listens offline for the wake word using Windows speech recognition while the JARVIS app is running (also when minimised). The microphone stays on; nothing is sent anywhere until the wake word is heard. Uses a little CPU.',
    android: 'Listens for the wake word only while JARVIS is open on screen. It stops when you switch apps or the screen turns off, and it is not background "always listening". Keeping the microphone on uses noticeably more battery, and some phones play a short beep each time listening restarts.',
    web: 'Listens for the wake word while this tab is visible. Speech recognition in browsers usually sends audio to the browser maker\'s speech service.',
  }[platform.name];
  const phrase = h('input', { type: 'text', value: p.wakePhrase, maxlength: 30 });
  sections.wake = section('WAKE WORD',
    platform.can('stt')
      ? [
          toggle('Listen for wake word', wakeDesc, p.wakeWord, async (v, input) => {
            ctx.savePrefs({ wakeWord: v });
            try {
              if (v) { await ctx.voice.startWake(); toast(`Say "${ctx.state.prefs.wakePhrase}" to start talking.`); } else ctx.voice.stopWake();
            } catch (err) {
              input.checked = false;
              ctx.savePrefs({ wakeWord: false });
              toast(err.message, { kind: 'error' });
            }
          }),
          field('Wake word', phrase, 'A distinctive name works best, e.g. "Jarvis" or "Computer".'),
          h('button.btn.btn-small', { type: 'button', onclick: async () => {
            ctx.savePrefs({ wakePhrase: phrase.value.trim() || 'Jarvis' });
            if (ctx.voice.wakeActive) { ctx.voice.stopWake(); await ctx.voice.startWake().catch((e) => toast(e.message, { kind: 'error' })); }
            toast('Wake word saved');
          } }, 'Save wake word'),
        ]
      : h('p.note', 'Not available: this device has no speech recognition.'),
  );

  // Microphone
  if (platform.can('permissions')) {
    let perm = { microphone: 'unknown' };
    try { perm = await platform.call('app.permission', { name: 'microphone' }); } catch { /* ignore */ }
    const statusText = { granted: 'Allowed', denied: 'Blocked', prompt: 'Not asked yet', unknown: 'Unknown' }[perm.microphone] || perm.microphone;
    sections.mic = section('MICROPHONE',
      h('p.note', 'JARVIS only uses the microphone while the microphone button is lit, or while wake-word listening is on. Speech recognition is done by your phone/PC\'s own speech service; JARVIS sends only the recognised text to your server.'),
      h('div.row', h('span', 'Status: ', h('strong', { class: perm.microphone === 'granted' ? 'status-ok' : 'status-warn' }, statusText)),
        h('button.btn.btn-small', { type: 'button', onclick: async () => {
          try {
            const r = await platform.call('app.requestPermission', { name: 'microphone' });
            toast(r.microphone === 'granted' ? 'Microphone allowed' : 'Microphone still blocked. Open system settings to allow it.', { kind: r.microphone === 'granted' ? 'ok' : 'error' });
            openSettings(ctx, 'mic');
          } catch (err) { toast(err.message, { kind: 'error' }); }
        } }, perm.microphone === 'granted' ? 'Check again' : 'Allow microphone'),
        h('button.btn.btn-small', { type: 'button', onclick: () => platform.call('app.openSystemSettings', { page: 'microphone' }).catch((e) => toast(e.message, { kind: 'error' })) }, 'System settings')),
    );
  }

  // Memory & privacy
  if (connected && s) {
    sections.privacy = section('MEMORY & PRIVACY',
      toggle('Memory', 'JARVIS may save useful facts, preferences and projects for future conversations. You are told every time, and can view, edit or delete them.', s.memoryEnabled, (v) => saveServerSettings(ctx, { memoryEnabled: v })),
      toggle('Save conversation history', 'When off, new conversations are temporary: hidden from History and deleted from the server an hour after the last message.', s.historyEnabled, (v) => saveServerSettings(ctx, { historyEnabled: v })),
      toggle('Web search', state.config.features.webSearch ? 'Lets JARVIS look things up online (Claude models only). Each search costs about 1 cent.' : 'Disabled on the server.', s.webSearchEnabled, (v) => saveServerSettings(ctx, { webSearchEnabled: v }), { disabled: !state.config.features.webSearch }),
      h('p.note', 'Your conversations, memories and settings are stored only in your own server\'s database. Messages are sent to the AI provider to generate replies (see the provider\'s data policy). Nothing is used for advertising.'),
      h('div.btn-row',
        h('button.btn', { type: 'button', onclick: () => openMemory(ctx) }, 'View memories'),
        h('button.btn', { type: 'button', onclick: () => exportData(ctx) }, 'Export my data'),
        h('button.btn.btn-danger', { type: 'button', onclick: () => deleteAllData(ctx) }, 'Delete all data')),
    );
  }

  // Appearance
  sections.appearance = section('APPEARANCE',
    field('Theme', select([['arc', 'Arc cyan'], ['deep', 'Deep blue'], ['emerald', 'Emerald'], ['amber', 'Amber']], p.theme, (v) => ctx.savePrefs({ theme: v }))),
    field('Effects', select([['full', 'Full'], ['balanced', 'Balanced'], ['saver', 'Battery saver']], p.effects, (v) => ctx.savePrefs({ effects: v })),
      'Battery saver lowers the animation frame rate and turns off the scanning lines and glass blur.'),
    toggle('Interface sounds', null, p.sounds, (v) => ctx.savePrefs({ sounds: v })),
    platform.name !== 'android' ? toggle('Enter sends the message', 'Shift+Enter adds a new line.', p.sendOnEnter, (v) => ctx.savePrefs({ sendOnEnter: v })) : null,
  );

  // PC tools (Windows app)
  if (platform.can('pcTools')) sections.tools = await toolsSection(ctx);

  // Connection
  sections.connection = await connectionSection(ctx);

  // About
  sections.about = section('ABOUT',
    h('dl.kv',
      h('dt', 'App'), h('dd', `JARVIS AI · ${platform.name} ${platform.info?.version || ''}`),
      h('dt', 'Server'), h('dd', state.config?.version ? `v${state.config.version}` : '—'),
      h('dt', 'Voice input'), h('dd', platform.can('stt') ? 'Available' : 'Not available'),
      h('dt', 'Voice output'), h('dd', platform.can('tts') ? 'Available' : 'Not available')),
    h('p.note', 'An original interface inspired by film AI assistants. Not affiliated with or endorsed by any film studio.'),
  );

  body.append(...['assistant', 'voice', 'wake', 'mic', 'privacy', 'appearance', 'tools', 'connection', 'about'].map((k) => sections[k]).filter(Boolean));
  if (focus && sections[focus]) sections[focus].scrollIntoView({ block: 'start' });
}

async function connectionSection(ctx) {
  const { state } = ctx;
  const sec = section('CONNECTION');
  if (state.prefs.demo) {
    sec.append(h('p.note', 'You are in the offline demo. No AI is connected.'), h('button.btn.btn-primary', { type: 'button', onclick: () => { closeDrawer(); ctx.showPairModal(); } }, 'Connect to a server'));
    return sec;
  }
  if (!ctx.api) {
    sec.append(h('p.note', 'Not connected.'), h('button.btn.btn-primary', { type: 'button', onclick: () => { closeDrawer(); ctx.showPairModal(); } }, 'Connect'));
    return sec;
  }
  sec.append(h('dl.kv',
    h('dt', 'Server'), h('dd', state.prefs.serverUrl),
    h('dt', 'Status'), h('dd', { class: state.online ? 'status-ok' : 'status-bad' }, state.online ? 'Connected' : 'Offline'),
    h('dt', 'This device'), h('dd', state.prefs.deviceName || '—')));
  if (state.online) {
    try {
      const usage = await ctx.api.request('GET', '/api/usage');
      const budget = usage.dailyBudgetUsd ? ` of $${usage.dailyBudgetUsd.toFixed(2)} daily limit` : '';
      sec.append(h('p.note', `Estimated AI cost: today $${usage.today.cost_usd.toFixed(3)}${budget}, this month $${usage.month.cost_usd.toFixed(2)}. ${usage.note}`));
    } catch { /* optional */ }
    try {
      const { devices, currentId } = await ctx.api.request('GET', '/api/devices');
      sec.append(h('h3', { style: { marginTop: '12px' } }, 'PAIRED DEVICES'), h('ul.list', devices.map((d) => h(`li.list-item${d.id === currentId ? '.current' : ''}`,
        h('div.row', h('div', h('div.title', d.name, d.id === currentId ? ' (this device)' : ''), h('div.meta', `${d.platform} · last used ${formatTime(d.last_seen_at)}`)),
          d.id !== currentId ? h('button.btn.btn-small.btn-danger', { type: 'button', onclick: async () => {
            if (!(await confirmDialog(`Revoke "${d.name}"? It will have to pair again.`, { confirmLabel: 'Revoke', danger: true }))) return;
            try { await ctx.api.request('DELETE', `/api/devices/${d.id}`); toast('Device revoked'); openSettings(ctx, 'connection'); } catch (err) { toast(err.message, { kind: 'error' }); }
          } }, 'Revoke') : null)))));
    } catch { /* optional */ }
  }
  sec.append(h('div.btn-row', { style: { marginTop: '10px' } },
    h('button.btn', { type: 'button', onclick: () => { ctx.connect(); toast('Reconnecting…'); } }, 'Reconnect'),
    h('button.btn.btn-danger', { type: 'button', onclick: async () => { if (await confirmDialog('Unpair this device from the server?', { confirmLabel: 'Unpair', danger: true })) ctx.unpair(); } }, 'Unpair this device')));
  return sec;
}

async function toolsSection(ctx) {
  const { platform } = ctx;
  const sec = section('PC TOOLS');
  let cfg;
  try { cfg = await platform.call('tools.getConfig'); } catch (err) { sec.append(h('p.note', err.message)); return sec; }
  const refresh = () => openSettings(ctx, 'tools');
  const run = (method, params, okMsg) => platform.call(method, params).then(() => { if (okMsg) toast(okMsg, { kind: 'ok' }); ctx.loadClientTools(); refresh(); }).catch((err) => toast(err.message, { kind: 'error' }));
  const cmdName = h('input.inline-input', { type: 'text', placeholder: 'Name, e.g. Run tests', maxlength: 40 });
  const cmdLine = h('input.inline-input', { type: 'text', placeholder: 'Command, e.g. npm test', maxlength: 300 });
  const cmdCwd = h('select.inline-input', cfg.folders.map((f) => h('option', { value: f }, f)));

  sec.append(
    toggle('Let JARVIS use PC tools', 'Open apps, folders and websites, search and read files in approved folders, create notes, run your approved commands. Every action asks you first.', ctx.state.prefs.pcTools, (v) => { ctx.savePrefs({ pcTools: v }); ctx.loadClientTools(); }),
    h('p.note', `Emergency stop: ${cfg.hotkey} (works even when JARVIS is in the background) or the red button below. It cancels approvals, stops speech and kills commands JARVIS started.`),
    h('button.btn.btn-danger', { type: 'button', onclick: () => platform.call('tools.emergencyStop') }, icon('i-power'), ' Emergency stop'),

    h('h3', { style: { marginTop: '16px' } }, 'APPROVED FOLDERS'),
    h('p.note', 'JARVIS can only search, read and (with your OK and a backup) write files inside these folders. Add your Unity projects here.'),
    h('ul.list', cfg.folders.map((f) => h('li.list-item', h('div.row', h('span.title', f), h('button.btn.btn-small', { type: 'button', onclick: () => run('tools.removeFolder', { path: f }) }, 'Remove'))))),
    h('button.btn', { type: 'button', onclick: () => run('tools.addFolder', {}, 'Folder approved') }, 'Add folder…'),

    h('h3', { style: { marginTop: '16px' } }, 'APPROVED APPS'),
    h('ul.list', cfg.apps.map((a) => h('li.list-item', h('div.row', h('div', h('div.title', a.name), h('div.meta', a.path)), a.builtin ? h('span.tiny.muted', 'built-in') : h('button.btn.btn-small', { type: 'button', onclick: () => run('tools.removeApp', { name: a.name }) }, 'Remove'))))),
    h('button.btn', { type: 'button', onclick: () => run('tools.addApp', {}, 'App approved') }, 'Add app…'),

    h('h3', { style: { marginTop: '16px' } }, 'APPROVED COMMANDS'),
    h('p.note', 'JARVIS can run only these exact commands, in the folder you choose, after you confirm. It can never run other commands.'),
    h('ul.list', cfg.commands.map((c) => h('li.list-item', h('div.row', h('div', h('div.title', c.name), h('div.meta', h('code', c.command), ` in ${c.cwd}`)), h('button.btn.btn-small', { type: 'button', onclick: () => run('tools.removeCommand', { name: c.name }) }, 'Remove'))))),
    cfg.folders.length
      ? h('div', { style: { display: 'grid', gap: '6px' } }, cmdName, cmdLine, cmdCwd, h('button.btn', { type: 'button', onclick: () => run('tools.addCommand', { name: cmdName.value.trim(), command: cmdLine.value.trim(), cwd: cmdCwd.value }, 'Command approved') }, 'Add command'))
      : h('p.note', 'Approve a folder first; commands run inside an approved folder.'),

    h('h3', { style: { marginTop: '16px' } }, 'NOTES & LOG'),
    h('dl.kv', h('dt', 'Notes folder'), h('dd', cfg.notesFolder), h('dt', 'Backups'), h('dd', cfg.backupFolder), h('dt', 'Action log'), h('dd', cfg.logPath)),
    h('button.btn', { type: 'button', onclick: async () => {
      const log = await platform.call('tools.log', { lines: 200 }).catch((e) => e.message);
      body.querySelector('#actionLog')?.remove();
      sec.append(h('pre.log', { id: 'actionLog' }, log || '(empty)'));
    } }, 'Show action log'),
  );
  return sec;
}

async function exportData(ctx) {
  try {
    const data = await ctx.api.request('GET', '/api/export');
    const json = JSON.stringify(data, null, 2);
    const name = `jarvis-export-${new Date().toISOString().slice(0, 10)}.json`;
    if (ctx.platform.name !== 'web') {
      await ctx.platform.call('file.save', { name, text: json });
    } else {
      const a = h('a', { href: URL.createObjectURL(new Blob([json], { type: 'application/json' })), download: name });
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }
    toast('Export saved', { kind: 'ok' });
  } catch (err) {
    toast(err.message, { kind: 'error' });
  }
}

async function deleteAllData(ctx) {
  const ok = await confirmDialog('Erase ALL conversations, memories, settings and usage records from your server? This cannot be undone. Paired devices stay paired.', { confirmLabel: 'Erase everything', danger: true, typed: 'DELETE' });
  if (!ok) return;
  try {
    await ctx.api.request('POST', '/api/delete-all-data', { confirm: 'DELETE' });
    const { settings } = await ctx.api.request('GET', '/api/settings');
    ctx.state.settings = settings;
    ctx.applyServerSettings();
    ctx.newConversation();
    toast('All data erased', { kind: 'ok' });
    openSettings(ctx, 'privacy');
  } catch (err) {
    toast(err.message, { kind: 'error' });
  }
}

// ---- History -----------------------------------------------------------------------------
export async function openHistory(ctx) {
  openDrawer('HISTORY');
  if (!ctx.api) return body.append(h('p.note', 'Connect to a server to see your conversation history.'));
  body.append(h('p.note', 'Loading…'));
  try {
    const { conversations } = await ctx.api.request('GET', '/api/conversations');
    body.replaceChildren();
    if (ctx.state.settings && !ctx.state.settings.historyEnabled) body.append(h('p.note', 'History saving is off, so new conversations are temporary and not listed here.'));
    if (!conversations.length) body.append(h('p.note', 'No saved conversations yet.'));
    body.append(h('ul.list', conversations.map((c) => h(`li.list-item.clickable${c.id === ctx.state.conversationId ? '.current' : ''}`, { onclick: () => ctx.openConversation(c.id) },
      h('div.row',
        h('div', h('div.title', c.title), h('div.meta', `${formatTime(c.updated_at)} · ${c.message_count} messages`)),
        h('button.icon-btn', { type: 'button', 'aria-label': `Delete ${c.title}`, title: 'Delete', onclick: async (e) => {
          e.stopPropagation();
          if (!(await confirmDialog(`Delete "${c.title}"?`, { confirmLabel: 'Delete', danger: true }))) return;
          try {
            await ctx.api.request('DELETE', `/api/conversations/${encodeURIComponent(c.id)}`);
            if (c.id === ctx.state.conversationId) ctx.newConversation();
            openHistory(ctx);
          } catch (err) { toast(err.message, { kind: 'error' }); }
        } }, icon('i-trash')))))));
    if (conversations.length) {
      body.append(h('button.btn.btn-danger', { type: 'button', style: { marginTop: '8px' }, onclick: async () => {
        if (!(await confirmDialog('Delete all conversation history? Memories are kept.', { confirmLabel: 'Delete all', danger: true }))) return;
        try { await ctx.api.request('DELETE', '/api/conversations'); ctx.newConversation(); openHistory(ctx); toast('History cleared'); } catch (err) { toast(err.message, { kind: 'error' }); }
      } }, 'Clear all history'));
    }
  } catch (err) {
    body.replaceChildren(h('p.note', err.message));
  }
}

// ---- Memory ----------------------------------------------------------------------------------
const KIND_LABELS = { fact: 'About you', preference: 'Preferences', project: 'Projects', instruction: 'Instructions' };

export async function openMemory(ctx) {
  openDrawer('MEMORY');
  if (!ctx.api) return body.append(h('p.note', 'Connect to a server to manage memories.'));
  let memories;
  try {
    ({ memories } = await ctx.api.request('GET', '/api/memories'));
  } catch (err) {
    return body.append(h('p.note', err.message));
  }
  const s = ctx.state.settings;
  body.append(h('p.note', s?.memoryEnabled
    ? 'JARVIS sees these in every conversation. It tells you whenever it saves one. Edit or delete anything here.'
    : 'Memory is turned off in Settings, so JARVIS does not see or save memories right now.'));

  const kind = h('select.inline-input', Object.entries(KIND_LABELS).map(([k, l]) => h('option', { value: k }, l)));
  const title = h('input.inline-input', { type: 'text', placeholder: 'Title (optional, e.g. a project name)', maxlength: 120 });
  const content = h('textarea.inline-input', { rows: 3, placeholder: 'What should JARVIS remember?', maxlength: 4000 });
  body.append(section('ADD A MEMORY', h('div', { style: { display: 'grid', gap: '6px' } }, kind, title, content,
    h('button.btn.btn-primary', { type: 'button', onclick: async () => {
      if (!content.value.trim()) return content.focus();
      try { await ctx.api.request('POST', '/api/memories', { kind: kind.value, title: title.value.trim(), content: content.value.trim() }); openMemory(ctx); } catch (err) { toast(err.message, { kind: 'error' }); }
    } }, 'Save memory'))));

  for (const [k, label] of Object.entries(KIND_LABELS)) {
    const items = memories.filter((m) => m.kind === k);
    if (!items.length) continue;
    body.append(section(label.toUpperCase(), h('ul.list', items.map((m) => memoryItem(ctx, m)))));
  }
  if (memories.length) {
    body.append(h('button.btn.btn-danger', { type: 'button', onclick: async () => {
      if (!(await confirmDialog('Delete all memories?', { confirmLabel: 'Delete all', danger: true }))) return;
      try { await ctx.api.request('DELETE', '/api/memories'); openMemory(ctx); toast('Memories deleted'); } catch (err) { toast(err.message, { kind: 'error' }); }
    } }, 'Delete all memories'));
  } else {
    body.append(h('p.note', 'No memories yet. Say "remember that…" in a conversation, or add one above.'));
  }
}

function memoryItem(ctx, m) {
  const view = h('div', m.title ? h('div.title', m.title) : null, h('div', m.content), h('div.meta', `${m.source === 'assistant' ? 'Saved by JARVIS' : 'Added by you'} · ${formatTime(m.updated_at)}`));
  const li = h('li.list-item', h('div.row', view, h('div.row',
    h('button.btn.btn-small', { type: 'button', onclick: () => edit() }, 'Edit'),
    h('button.icon-btn', { type: 'button', 'aria-label': 'Delete memory', onclick: async () => {
      try { await ctx.api.request('DELETE', `/api/memories/${encodeURIComponent(m.id)}`); li.remove(); } catch (err) { toast(err.message, { kind: 'error' }); }
    } }, icon('i-trash')))));
  function edit() {
    const t = h('input.inline-input', { type: 'text', value: m.title, placeholder: 'Title', maxlength: 120 });
    const c = h('textarea.inline-input', { rows: 3, maxlength: 4000 }, m.content);
    li.replaceChildren(h('div', { style: { display: 'grid', gap: '6px' } }, t, c, h('div.btn-row',
      h('button.btn.btn-primary.btn-small', { type: 'button', onclick: async () => {
        try { await ctx.api.request('PUT', `/api/memories/${encodeURIComponent(m.id)}`, { title: t.value.trim(), content: c.value }); openMemory(ctx); } catch (err) { toast(err.message, { kind: 'error' }); }
      } }, 'Save'),
      h('button.btn.btn-small', { type: 'button', onclick: () => openMemory(ctx) }, 'Cancel'))));
    c.focus();
  }
  return li;
}
