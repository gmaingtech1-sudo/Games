/* Portal Hackers: Nexus — team chat. Every team has one chat room, shared
   by everyone on that team who's online, anywhere.

   There's no chat server. PeerJS's free public server only introduces
   phones to each other; messages then go directly between phones over
   WebRTC. The first teammate to open the room becomes its hub under a
   well-known ID (one per team) and relays messages to everyone else; it
   also hands newcomers the last 50 messages and the list of who's online.
   If the hub leaves, the others race to take its place.

   Anyone who picks the same team can join its room, and nothing is stored
   anywhere but on the phones in the room. */
window.PH = window.PH || {};
(function (PH) {
  'use strict';

  const PREFIX = 'portalhackers-v1-team-';
  const HISTORY = 50;
  const MAX_TEXT = 200;
  const COLORS = /^(#[0-9A-Fa-f]{6}|team)$/;

  let peer = null;
  let hubConn = null;                 // client → hub
  const clients = new Map();          // hub: peer id → { conn, profile, times }
  let isHub = false;
  let team = null;
  let me = null;                      // () → my public profile
  let state = 'off';                  // off | connecting | online | offline
  let retryTimer = 0;
  let tries = 0;
  let history = [];
  const roster = new Map();           // peer id → profile
  const seen = new Set();
  let lastSent = 0;
  let lastHeard = 0;                  // client: last word from the hub
  let beat = 0;
  const BEAT_MS = 4000;               // the hub pings everyone this often
  const LOST_MS = 13000;              // no word for this long = gone
  const listeners = {};

  function emit(type, data) {
    (listeners[type] || []).forEach((fn) => { try { fn(data); } catch (e) { /* keep going */ } });
  }
  function setState(s) { state = s; emit('state', s); }

  // Tests can point the game at a local PeerServer:
  // ?peerhost=localhost&peerport=9000&peerpath=/ph&peersecure=0
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

  const supported = () => typeof window.Peer === 'function' && typeof window.RTCPeerConnection === 'function';
  const hubId = () => `${PREFIX}${team.toLowerCase()}`;

  /* ------------------ Messages from strangers: check everything ------------------ */

  const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');

  function cleanProfile(p) {
    if (!p || typeof p !== 'object') return null;
    const name = str(p.name, 16).trim();
    if (!name) return null;
    return {
      name,
      avatar: str(p.avatar, 8) || '🙂',
      color: COLORS.test(p.color) ? p.color : 'team',
      title: str(p.title, 28),
      level: Math.max(1, Math.min(50, Number(p.level) | 0)),
      prestige: Math.max(0, Math.min(99, Number(p.prestige) | 0)),
    };
  }

  function cleanMsg(m) {
    if (!m || typeof m !== 'object') return null;
    const text = str(m.text, MAX_TEXT).trim();
    const from = cleanProfile(m.from);
    if (!text || !from) return null;
    return {
      id: str(m.id, 32) || Math.random().toString(36).slice(2),
      at: Math.min(Date.now() + 60e3, Number(m.at) || Date.now()),
      kind: m.kind === 'activity' ? 'activity' : 'msg',
      text, from,
    };
  }

  function remember(m) {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    history.push(m);
    history.sort((a, b) => a.at - b.at);
    if (history.length > HISTORY * 2) history = history.slice(-HISTORY * 2);
    emit('message', m);
    return true;
  }

  /* ------------------ Connecting ------------------ */

  function teardown() {
    clearTimeout(retryTimer);
    if (hubConn) { try { hubConn.close(); } catch (e) { /* ignore */ } }
    hubConn = null;
    for (const c of clients.values()) { try { c.conn.close(); } catch (e) { /* ignore */ } }
    clients.clear();
    if (peer) { try { peer.destroy(); } catch (e) { /* ignore */ } }
    peer = null;
    isHub = false;
    roster.clear();
  }

  function retry(delay) {
    clearTimeout(retryTimer);
    tries++;
    if (tries > 6) { setState('offline'); return; }
    retryTimer = setTimeout(join, delay != null ? delay : 400 + Math.random() * 1200);
  }

  // Try the team's hub; if nobody is hosting, become the hub.
  function join() {
    teardown();
    if (!team) return;
    setState('connecting');
    const p = new Peer(undefined, serverOptions());
    peer = p;
    p.on('open', () => {
      if (peer !== p) return;
      const c = p.connect(hubId(), { reliable: true });
      hubConn = c;
      c.on('open', () => {
        tries = 0;
        lastHeard = Date.now();
        c.send({ t: 'hello', profile: me() });
        setState('online');
      });
      c.on('data', onFromHub);
      c.on('close', () => { if (hubConn === c) { hubConn = null; roster.clear(); emit('roster'); retry(); } });
      c.on('error', () => {});
    });
    p.on('error', (err) => {
      if (peer !== p) return;
      if (err && err.type === 'peer-unavailable') becomeHub();
      else retry(2000 + Math.random() * 2000);
    });
  }

  function becomeHub() {
    teardown();
    const p = new Peer(hubId(), serverOptions());
    peer = p;
    p.on('open', () => {
      if (peer !== p) return;
      isHub = true;
      tries = 0;
      roster.clear();
      roster.set('me', me());
      setState('online');
      emit('roster');
    });
    p.on('connection', (c) => {
      c.on('data', (d) => { const cl = clients.get(c.peer); if (cl) cl.last = Date.now(); onAtHub(c, d); });
      c.on('close', () => {
        clients.delete(c.peer);
        roster.delete(c.peer);
        broadcastRoster();
      });
      c.on('error', () => {});
    });
    p.on('disconnected', () => { if (peer === p) { try { p.reconnect(); } catch (e) { retry(); } } });
    p.on('error', (err) => {
      if (peer !== p) return;
      // Someone else got there first: join them.
      if (err && err.type === 'unavailable-id') retry(200 + Math.random() * 600);
      else if (!isHub) retry(2000 + Math.random() * 2000);
    });
  }

  /* ------------------ Hub ------------------ */

  function broadcast(data, except) {
    for (const [id, c] of clients) if (id !== except && c.conn.open) { try { c.conn.send(data); } catch (e) { /* ignore */ } }
  }

  function rosterList() { return Array.from(roster.values()); }

  function broadcastRoster() {
    roster.set('me', me());
    broadcast({ t: 'roster', roster: rosterList() });
    emit('roster');
  }

  function onAtHub(c, d) {
    if (!d || typeof d !== 'object') return;
    if (d.t === 'hello') {
      const prof = cleanProfile(d.profile);
      if (!prof) return;
      clients.set(c.peer, { conn: c, times: [], last: Date.now() });
      roster.set(c.peer, prof);
      c.send({ t: 'welcome', history: history.slice(-HISTORY) });
      broadcastRoster();
    } else if (d.t === 'msg') {
      const cl = clients.get(c.peer);
      if (!cl) return;
      // At most 5 messages in 5 seconds from anyone.
      const now = Date.now();
      cl.times = cl.times.filter((t) => now - t < 5000);
      if (cl.times.length >= 5) return;
      cl.times.push(now);
      const m = cleanMsg(d.m);
      if (!m) return;
      if (remember(m)) broadcast({ t: 'msg', m }, c.peer);
    }
  }

  /* ------------------ Client ------------------ */

  function onFromHub(d) {
    if (!d || typeof d !== 'object') return;
    lastHeard = Date.now();
    if (d.t === 'ping') { if (hubConn && hubConn.open) hubConn.send({ t: 'pong' }); return; }
    if (d.t === 'welcome' && Array.isArray(d.history)) {
      for (const raw of d.history.slice(-HISTORY)) {
        const m = cleanMsg(raw);
        if (m) remember(m);
      }
    } else if (d.t === 'roster' && Array.isArray(d.roster)) {
      roster.clear();
      d.roster.slice(0, 200).forEach((p, i) => {
        const prof = cleanProfile(p);
        if (prof) roster.set(String(i), prof);
      });
      emit('roster');
    } else if (d.t === 'msg') {
      const m = cleanMsg(d.m);
      if (m) remember(m);
    }
  }

  // Heartbeat: the hub pings, clients answer. A client that hasn't heard
  // from the hub in a while assumes it's gone and takes over; the hub drops
  // clients that have gone quiet.
  function heartbeat() {
    if (state !== 'online') return;
    const now = Date.now();
    if (isHub) {
      let changed = false;
      for (const [id, c] of clients) {
        if (now - c.last > LOST_MS * 1.5) {
          try { c.conn.close(); } catch (e) { /* ignore */ }
          clients.delete(id);
          roster.delete(id);
          changed = true;
        }
      }
      broadcast({ t: 'ping' });
      if (changed) broadcastRoster();
    } else if (now - lastHeard > LOST_MS) {
      roster.clear();
      emit('roster');
      tries = 0;
      retry(Math.random() * 1500);
    }
  }

  /* ------------------ API ------------------ */

  // Join `teamId`'s room. `profile` is a function returning your public profile.
  function start(teamId, profile, saved) {
    me = profile;
    if (team === teamId && state !== 'off' && state !== 'offline') return;
    team = teamId;
    history = [];
    seen.clear();
    for (const raw of saved || []) {
      const m = cleanMsg(raw);
      if (m && !seen.has(m.id)) { seen.add(m.id); history.push(m); }
    }
    if (!supported()) { setState('offline'); return; }
    tries = 0;
    clearInterval(beat);
    beat = setInterval(heartbeat, BEAT_MS);
    join();
  }

  function stop() {
    clearInterval(beat);
    teardown();
    team = null;
    setState('off');
  }

  function reconnect() {
    if (!team || !supported()) return;
    tries = 0;
    join();
  }

  // Send a message (or an activity post) to the room. Returns an error or null.
  function send(text, kind) {
    const now = Date.now();
    if (kind !== 'activity' && now - lastSent < 1200) return 'Slow down a little';
    const m = cleanMsg({ id: `${now.toString(36)}${Math.random().toString(36).slice(2, 8)}`, at: now, kind, text, from: me() });
    if (!m) return 'Type a message first';
    if (kind !== 'activity') lastSent = now;
    remember(m);
    if (state !== 'online') return kind === 'activity' ? null : 'Not connected. Your message will only show here.';
    if (isHub) broadcast({ t: 'msg', m });
    else if (hubConn && hubConn.open) hubConn.send({ t: 'msg', m });
    return null;
  }

  function updateProfile() {
    if (state !== 'online') return;
    if (isHub) broadcastRoster();
    else if (hubConn && hubConn.open) hubConn.send({ t: 'hello', profile: me() });
  }

  PH.chat = {
    start, stop, send, reconnect, updateProfile,
    on(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    get state() { return state; },
    get history() { return history.slice(-HISTORY * 2); },
    get roster() { return rosterList(); },
    get isHub() { return isHub; },
    supported,
  };
})(window.PH);
