/* ParanormalADHDhunters — team mode for up to four investigators.
   One phone hosts and gets a five-letter code; up to three friends join with
   it. PeerJS finds the other phones through its free public server, then they
   talk directly over WebRTC. The host's phone runs the ghost; everyone else
   sends what they do and receives what happens.

   For testing on one computer, add ?net=local to the address: tabs in the same
   browser then talk to each other through a BroadcastChannel instead. */
import { Emitter } from './util.js';

const PREFIX = 'paranormaladhdhunters-v1-';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LEN = 5;
export const MAX_TEAM = 4;

function makeCode() {
  const r = new Uint32Array(CODE_LEN);
  crypto.getRandomValues(r);
  let c = '';
  for (let i = 0; i < CODE_LEN; i++) c += ALPHABET[r[i] % ALPHABET.length];
  return c;
}

export function cleanCode(text) {
  return String(text || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LEN);
}

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

/* ------------------------------------------------------------------ */
/* Transports. Each gives the host a set of links and a guest one link. */
/* A link is {send(msg), close(), on(type, fn)} with 'open','data','close'. */
/* ------------------------------------------------------------------ */

class PeerTransport {
  static supported() { return typeof window.Peer === 'function' && typeof window.RTCPeerConnection === 'function'; }

  host(code, onLink, onReady, onError) {
    this.peer = new window.Peer(PREFIX + code, serverOptions());
    this.peer.on('open', () => onReady());
    this.peer.on('connection', (c) => onLink(wrapPeer(c)));
    this.peer.on('error', (e) => onError(e && e.type ? e.type : String(e)));
    this.peer.on('disconnected', () => { try { this.peer.reconnect(); } catch (e) { /* ignore */ } });
  }

  join(code, onLink, onError) {
    this.peer = new window.Peer(serverOptions());
    this.peer.on('open', () => onLink(wrapPeer(this.peer.connect(PREFIX + code, { reliable: true, serialization: 'json' }))));
    this.peer.on('error', (e) => onError(e && e.type ? e.type : String(e)));
  }

  close() { try { if (this.peer) this.peer.destroy(); } catch (e) { /* ignore */ } this.peer = null; }
}

function wrapPeer(c) {
  const em = new Emitter();
  c.on('open', () => em.emit('open'));
  c.on('data', (m) => em.emit('data', m));
  c.on('close', () => em.emit('close'));
  c.on('error', () => em.emit('close'));
  return { send: (m) => { try { c.send(m); } catch (e) { /* ignore */ } }, close: () => { try { c.close(); } catch (e) { /* ignore */ } }, on: (t, f) => em.on(t, f) };
}

/** Same-browser transport for testing: BroadcastChannel between tabs. */
class LocalTransport {
  static supported() { return typeof BroadcastChannel === 'function'; }

  host(code, onLink, onReady) {
    this.ch = new BroadcastChannel('pah-' + code);
    this.links = {};
    this.ch.onmessage = (e) => {
      const m = e.data;
      if (!m || m.to !== 'host') return;
      if (m.kind === 'connect') {
        const em = new Emitter();
        const id = m.from;
        const link = { send: (msg) => this.ch.postMessage({ to: id, kind: 'data', msg }), close: () => this.ch.postMessage({ to: id, kind: 'close' }), on: (t, f) => em.on(t, f), em };
        this.links[id] = link;
        onLink(link);
        this.ch.postMessage({ to: id, kind: 'accept' });
        setTimeout(() => em.emit('open'), 0);
      } else if (this.links[m.from]) {
        if (m.kind === 'data') this.links[m.from].em.emit('data', m.msg);
        if (m.kind === 'close') { this.links[m.from].em.emit('close'); delete this.links[m.from]; }
      }
    };
    setTimeout(onReady, 50);
  }

  join(code, onLink, onError) {
    this.ch = new BroadcastChannel('pah-' + code);
    const id = 'g' + Math.random().toString(36).slice(2, 9);
    const em = new Emitter();
    let ok = false;
    this.ch.onmessage = (e) => {
      const m = e.data;
      if (!m || m.to !== id) return;
      if (m.kind === 'accept') { ok = true; em.emit('open'); }
      if (m.kind === 'data') em.emit('data', m.msg);
      if (m.kind === 'close') em.emit('close');
    };
    onLink({ send: (msg) => this.ch.postMessage({ to: 'host', from: id, kind: 'data', msg }), close: () => this.ch.postMessage({ to: 'host', from: id, kind: 'close' }), on: (t, f) => em.on(t, f) });
    this.ch.postMessage({ to: 'host', from: id, kind: 'connect' });
    setTimeout(() => { if (!ok) onError('peer-unavailable'); }, 3000);
  }

  close() { try { if (this.ch) this.ch.close(); } catch (e) { /* ignore */ } this.ch = null; }
}

/* ------------------------------------------------------------------ */

export class Net extends Emitter {
  constructor() {
    super();
    this.local = new URLSearchParams(location.search).get('net') === 'local';
    this.state = 'off';
    this.isHost = false;
    this.code = '';
    this.localPid = 0;
    this.roster = [];
    this.links = {}; // host: pid -> link
    this.link = null; // guest: link to host
    this.lastHeard = {};
    this.timer = 0;
  }

  supported() { return this.local ? LocalTransport.supported() : PeerTransport.supported(); }

  transport() { return this.local ? new LocalTransport() : new PeerTransport(); }

  setState(s) { this.state = s; this.emit('state', s); }

  peers() { return this.isHost ? Object.keys(this.links).length : 0; }

  messageFor(type) {
    switch (type) {
      case 'peer-unavailable': return `No one is hosting ${this.code}. Check the code and try again.`;
      case 'full': return 'That team already has four investigators.';
      case 'started': return 'That team is already in an investigation. Ask them to come back to the menu first.';
      case 'timeout': return 'Couldn’t reach the team. Try again, ideally on the same Wi-Fi.';
      case 'browser-incompatible': return 'This device can’t do online play.';
      case 'network': case 'server-error': case 'socket-error': case 'socket-closed': return 'Couldn’t reach the team server. Check your internet connection.';
      case 'webrtc': return 'Couldn’t connect. Try being on the same Wi-Fi.';
      default: return 'Something went wrong. Please try again.';
    }
  }

  fail(type) {
    const msg = this.messageFor(type);
    this.leave(true);
    this.emit('error', msg);
  }

  /* ---------- hosting ---------- */

  host(me, attempt = 0) {
    if (!this.supported()) { this.emit('error', this.messageFor('browser-incompatible')); return; }
    this.leave(true);
    this.isHost = true;
    this.localPid = 0;
    this.me = me;
    this.roster = [{ pid: 0, ...me }];
    this.nextPid = 1;
    this.inGame = false;
    this.code = makeCode();
    this.setState('starting');
    this.t = this.transport();
    this.t.host(this.code, (link) => this.acceptGuest(link), () => {
      this.setState('lobby');
      this.emit('roster', this.roster);
      this.startPing();
    }, (err) => {
      if (err === 'unavailable-id' && attempt < 4) { this.host(me, attempt + 1); return; }
      if (this.state === 'lobby' && this.peers()) return;
      this.fail(err);
    });
  }

  acceptGuest(link) {
    let pid = null;
    link.on('data', (m) => {
      if (!m || typeof m !== 'object') return;
      if (m.k === 'hello') {
        if (Object.keys(this.links).length >= MAX_TEAM - 1) { link.send({ k: 'deny', why: 'full' }); setTimeout(() => link.close(), 300); return; }
        if (this.inGame) { link.send({ k: 'deny', why: 'started' }); setTimeout(() => link.close(), 300); return; }
        pid = this.nextPid++;
        this.links[pid] = link;
        this.lastHeard[pid] = Date.now();
        this.roster.push({ pid, name: String(m.name || 'Investigator').slice(0, 16), uniform: m.uniform, level: m.level | 0 });
        link.send({ k: 'welcome', pid, roster: this.roster, code: this.code });
        this.broadcast({ k: 'roster', roster: this.roster });
        this.emit('roster', this.roster);
        this.emit('joined', pid);
        return;
      }
      if (pid == null) return;
      this.lastHeard[pid] = Date.now();
      if (m.k === 'ping') return;
      if (m.k === 'bye') { this.dropGuest(pid); return; }
      if (m.k === 'lobbychat') { this.broadcast({ k: 'lobbychat', pid, text: String(m.text || '').slice(0, 120) }); this.emit('lobbychat', { pid, text: m.text }); return; }
      this.emit('message', m, pid);
    });
    link.on('close', () => { if (pid != null) this.dropGuest(pid); });
  }

  dropGuest(pid) {
    if (!this.links[pid]) return;
    try { this.links[pid].close(); } catch (e) { /* ignore */ }
    delete this.links[pid];
    delete this.lastHeard[pid];
    this.roster = this.roster.filter((p) => p.pid !== pid);
    this.broadcast({ k: 'roster', roster: this.roster });
    this.emit('roster', this.roster);
    this.emit('left', pid);
  }

  /* ---------- joining ---------- */

  join(text, me) {
    if (!this.supported()) { this.emit('error', this.messageFor('browser-incompatible')); return; }
    const want = cleanCode(text);
    if (want.length !== CODE_LEN) { this.emit('error', `Team codes have ${CODE_LEN} letters and numbers.`); return; }
    this.leave(true);
    this.isHost = false;
    this.code = want;
    this.me = me;
    this.setState('joining');
    this.t = this.transport();
    const timeout = setTimeout(() => { if (this.state === 'joining') this.fail('timeout'); }, 16000);
    this.t.join(want, (link) => {
      this.link = link;
      link.on('open', () => link.send({ k: 'hello', ...me, v: 1 }));
      link.on('data', (m) => {
        if (!m || typeof m !== 'object') return;
        this.lastHeard.host = Date.now();
        if (m.k === 'ping') return;
        if (m.k === 'deny') { clearTimeout(timeout); this.fail(m.why); return; }
        if (m.k === 'welcome') {
          clearTimeout(timeout);
          this.localPid = m.pid;
          this.roster = m.roster;
          this.setState('lobby');
          this.emit('roster', this.roster);
          this.startPing();
          return;
        }
        if (m.k === 'roster') { this.roster = m.roster; this.emit('roster', this.roster); return; }
        if (m.k === 'lobbychat') { this.emit('lobbychat', m); return; }
        if (m.k === 'closed') { this.leave(true); this.emit('error', 'The host closed the team.'); return; }
        this.emit('message', m, 0);
      });
      link.on('close', () => { if (this.state !== 'off') { this.leave(true); this.emit('error', 'Lost connection to the host.'); } });
    }, (err) => { clearTimeout(timeout); if (this.state === 'joining') this.fail(err); });
  }

  /* ---------- sending ---------- */

  broadcast(m) { if (this.isHost) for (const pid in this.links) this.links[pid].send(m); }

  send(m) { if (!this.isHost && this.link) this.link.send(m); }

  lobbyChat(text) {
    if (this.isHost) { this.broadcast({ k: 'lobbychat', pid: 0, text }); this.emit('lobbychat', { pid: 0, text }); }
    else this.send({ k: 'lobbychat', text });
  }

  nameOf(pid) { const p = this.roster.find((x) => x.pid === pid); return p ? p.name : 'Investigator'; }

  startPing() {
    clearInterval(this.timer);
    this.timer = setInterval(() => {
      const now = Date.now();
      if (this.isHost) {
        this.broadcast({ k: 'ping' });
        for (const pid in this.lastHeard) if (now - this.lastHeard[pid] > 20000) this.dropGuest(Number(pid));
      } else if (this.link) {
        this.send({ k: 'ping' });
        if (this.lastHeard.host && now - this.lastHeard.host > 20000) { this.leave(true); this.emit('error', 'Lost connection to the host.'); }
      }
    }, 4000);
  }

  leave(quiet = false) {
    clearInterval(this.timer);
    if (this.isHost) { this.broadcast({ k: 'closed' }); for (const pid in this.links) { try { this.links[pid].close(); } catch (e) { /* ignore */ } } }
    else if (this.link) { this.send({ k: 'bye' }); try { this.link.close(); } catch (e) { /* ignore */ } }
    if (this.t) setTimeout(((t) => () => t.close())(this.t), 300);
    this.t = null;
    this.links = {};
    this.link = null;
    this.lastHeard = {};
    this.roster = [];
    this.isHost = false;
    this.inGame = false;
    if (this.state !== 'off') this.setState('off');
    if (!quiet) this.emit('roster', []);
  }

  active() { return this.state === 'lobby'; }
}
