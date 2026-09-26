/* Pocket Mochi — online playdates between two phones.
   PeerJS finds the other phone through its free public server, then the two
   talk directly over WebRTC. One player hosts and gets a five-letter code;
   the other joins with it. Only small game messages are ever sent. */
(function (PM) {
  'use strict';

  const PREFIX = 'pocketmochi-v1-';
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const CODE_LEN = 5;

  let peer = null;
  let conn = null;
  let role = null;        // 'host' | 'guest'
  let code = '';
  let state = 'off';      // off | starting | hosting | joining | connected
  let lastHeard = 0;
  let pingTimer = 0;
  let joinTimer = 0;
  let profile = null;
  const listeners = {};

  function emit(type, data) {
    (listeners[type] || []).forEach((fn) => {
      try { fn(data); } catch (e) { /* keep going */ }
    });
  }

  function setState(next) {
    state = next;
    emit('state', state);
  }

  // Tests can point the game at a local PeerServer:
  // ?peerhost=localhost&peerport=9000&peerpath=/pm&peersecure=0
  function serverOptions() {
    const q = new URLSearchParams(location.search);
    const o = { debug: 0 };
    if (q.get('peerhost')) {
      o.host = q.get('peerhost');
      o.port = Number(q.get('peerport')) || 9000;
      o.path = q.get('peerpath') || '/';
      o.secure = q.get('peersecure') === '1';
    }
    return o;
  }

  function makeCode() {
    let c = '';
    const r = new Uint32Array(CODE_LEN);
    (window.crypto || window.msCrypto).getRandomValues(r);
    for (let i = 0; i < CODE_LEN; i++) c += ALPHABET[r[i] % ALPHABET.length];
    return c;
  }

  function cleanCode(text) {
    return String(text || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LEN);
  }

  function supported() {
    return typeof window.Peer === 'function' && typeof window.RTCPeerConnection === 'function';
  }

  function messageFor(err) {
    const type = (err && err.type) || String(err || '');
    switch (type) {
      case 'peer-unavailable': return `No one is hosting ${code}. Check the code and try again.`;
      case 'busy': return 'That friend is already on a playdate.';
      case 'timeout': return 'Couldn’t reach your friend. Try again, ideally on the same Wi-Fi.';
      case 'browser-incompatible': return 'This device can’t do online play.';
      case 'network':
      case 'server-error':
      case 'socket-error':
      case 'socket-closed':
        return 'Couldn’t reach the playdate server. Check your internet connection.';
      case 'webrtc': return 'Couldn’t connect to your friend. Try being on the same Wi-Fi.';
      default: return 'Something went wrong. Please try again.';
    }
  }

  function fail(err) {
    const msg = messageFor(err);
    teardown();
    setState('off');
    emit('error', msg);
  }

  function teardown() {
    clearInterval(pingTimer);
    clearTimeout(joinTimer);
    pingTimer = 0;
    joinTimer = 0;
    const c = conn;
    const p = peer;
    conn = null;
    peer = null;
    role = null;
    try { if (c) c.close(); } catch (e) { /* ignore */ }
    try { if (p) p.destroy(); } catch (e) { /* ignore */ }
  }

  function host(me) {
    if (!supported()) { emit('error', messageFor('browser-incompatible')); return; }
    teardown();
    profile = me;
    role = 'host';
    setState('starting');
    openHost(0);
  }

  function openHost(attempt) {
    code = makeCode();
    const p = new window.Peer(PREFIX + code, serverOptions());
    peer = p;
    p.on('open', () => {
      if (peer !== p) return;
      setState('hosting');
      emit('code', code);
    });
    p.on('connection', (c) => {
      if (conn) {
        // already busy with someone: tell them politely
        c.on('open', () => {
          try { c.send({ t: 'busy' }); } catch (e) { /* ignore */ }
          setTimeout(() => { try { c.close(); } catch (e) { /* ignore */ } }, 400);
        });
        return;
      }
      attach(c);
    });
    p.on('error', (err) => {
      if (peer !== p) return;
      if (err && err.type === 'unavailable-id' && attempt < 4) {
        try { p.destroy(); } catch (e) { /* ignore */ }
        openHost(attempt + 1);
        return;
      }
      if (state === 'connected') return; // the direct link can outlive the server
      fail(err);
    });
    p.on('disconnected', () => {
      // lost the signalling server; keep hosting if we can
      if (peer === p && state === 'hosting') {
        try { p.reconnect(); } catch (e) { /* ignore */ }
      }
    });
  }

  function join(text, me) {
    if (!supported()) { emit('error', messageFor('browser-incompatible')); return; }
    const want = cleanCode(text);
    if (want.length !== CODE_LEN) { emit('error', `Codes have ${CODE_LEN} letters and numbers.`); return; }
    teardown();
    profile = me;
    role = 'guest';
    code = want;
    setState('joining');
    const p = new window.Peer(serverOptions());
    peer = p;
    p.on('open', () => {
      if (peer !== p) return;
      attach(p.connect(PREFIX + code, { reliable: true, serialization: 'json' }));
    });
    p.on('error', (err) => {
      if (peer !== p || state === 'connected') return;
      fail(err);
    });
    joinTimer = setTimeout(() => { if (state === 'joining') fail('timeout'); }, 15000);
  }

  function attach(c) {
    conn = c;
    c.on('open', () => {
      if (conn !== c) return;
      clearTimeout(joinTimer);
      lastHeard = Date.now();
      setState('connected');
      send(Object.assign({ t: 'hello', v: 1 }, profile));
      clearInterval(pingTimer);
      pingTimer = setInterval(() => {
        send({ t: 'ping' });
        if (Date.now() - lastHeard > 16000) dropped('timeout');
      }, 4000);
    });
    c.on('data', (m) => {
      if (conn !== c || !m || typeof m !== 'object' || typeof m.t !== 'string') return;
      lastHeard = Date.now();
      if (m.t === 'ping') return;
      if (m.t === 'busy') { fail('busy'); return; }
      if (m.t === 'bye') { dropped('left'); return; }
      emit('message', m);
    });
    c.on('close', () => { if (conn === c) dropped('closed'); });
    c.on('error', () => { if (conn === c) dropped('error'); });
  }

  // The friend left or the link broke.
  function dropped(why) {
    const was = state;
    teardown();
    setState('off');
    if (was === 'connected') emit('closed', why);
    else emit('error', messageFor('timeout'));
  }

  function send(m) {
    if (!conn || !conn.open) return false;
    try {
      conn.send(m);
      return true;
    } catch (e) {
      return false;
    }
  }

  function leave() {
    if (state === 'connected') send({ t: 'bye' });
    // give the goodbye a moment to go out
    const c = conn;
    const p = peer;
    conn = null;
    peer = null;
    clearInterval(pingTimer);
    clearTimeout(joinTimer);
    setTimeout(() => {
      try { if (c) c.close(); } catch (e) { /* ignore */ }
      try { if (p) p.destroy(); } catch (e) { /* ignore */ }
    }, 250);
    role = null;
    setState('off');
  }

  PM.online = {
    CODE_LEN,
    supported,
    host,
    join,
    leave,
    send,
    cleanCode,
    get state() { return state; },
    get code() { return code; },
    get role() { return role; },
    on(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
  };
})(window.PM = window.PM || {});
