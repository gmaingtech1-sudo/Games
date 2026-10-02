/* ParanormalADHDhunters — one investigation, from arriving at the van to the
   report. Everything that changes the shared world goes through emit()
   (run by the solo player or the team host) and apply() (run by everyone),
   so solo and team play behave the same. */
import * as THREE from 'three';
import { GHOSTS, DIFFICULTY, SIDE_OBJECTIVES, TUTORIAL, CLUES, CHAPTERS, PLAYABLE_GHOSTS, NOTEBOOK } from './data.js';
import { GhostBrain, GhostVisual } from './ghost.js';
import { ROOMS, SPAWN, VAN_SPOT } from './house.js';
import { rng, clamp, vibrate } from './util.js';
import { glowTexture } from './textures.js';

/** Decide everything random about an investigation up front, so a team shares it. */
export function makeSetup({ caseDef = null, diff = 'amateur', seed = (Math.random() * 1e9) | 0, team = false, cellarOpen = false, notebook = [] }) {
  const r = rng(seed);
  const ghost = r.pick(PLAYABLE_GHOSTS);
  const cellar = caseDef ? !!caseDef.finale : cellarOpen;
  const rooms = Object.keys(ROOMS).filter((id) => ROOMS[id].ghost === true || (ROOMS[id].ghost === 'basement' && cellar));
  let home = r.pick(rooms);
  if (caseDef && caseDef.tutorial) home = r.pick(['living', 'dining', 'kitchen', 'master', 'nursery', 'study']);
  const side = r.shuffle(Object.keys(SIDE_OBJECTIVES)).slice(0, 2);
  let page = null, pageSpot = null;
  if (!caseDef) {
    page = NOTEBOOK.find((p) => !notebook.includes(p)) || null;
    if (page) {
      const spots = ['n1', 'n2', 'n4', 'n5', 'n6'].concat(cellar ? ['n3'] : []);
      pageSpot = r.pick(spots);
    }
  }
  return {
    caseId: caseDef ? caseDef.id : 'free', title: caseDef ? caseDef.title : 'Free Investigation',
    ghost, home, diff, seed, side, clue: caseDef ? caseDef.clue : null, page, pageSpot,
    cellar, finale: !!(caseDef && caseDef.finale), tutorial: !!(caseDef && caseDef.tutorial), team,
  };
}

const V = new THREE.Vector3();

export class Investigation {
  constructor(app, setup, opts = {}) {
    this.app = app;
    this.setup = setup;
    this.house = app.house;
    this.engine = app.engine;
    this.kit = app.kit;
    this.player = app.player;
    this.audio = app.audio;
    this.ui = app.ui;
    this.profile = app.profile;
    this.net = opts.net || null;
    this.authority = !this.net || this.net.isHost;
    this.localPid = opts.localPid || 0;
    this.roster = opts.roster || [{ pid: 0, name: this.profile.d.name }];
    this.allRoster = this.roster.slice();
    this.diff = DIFFICULTY[setup.diff] || DIFFICULTY.amateur;
    this.ghostDef = GHOSTS[setup.ghost];
    this.t = 0;
    this.now = 0;
    this.over = false;
    this.paused = false;

    // shared (team) state
    this.evidence = new Set();
    this.roomFound = false;
    this.verdict = null;
    this.photos = [];
    this.cluesTaken = new Set();
    this.surge = null;
    this.escape = 0;
    this.frontLockedUntil = 0;
    this.ready = new Set();

    // local state
    this.nerve = 100;
    this.spooks = 0;
    this.myPhotos = [];
    this.excluded = new Set();
    this.side = {};
    this.stats = { events: 0, answers: 0, lights: 0, hides: 0, activityPhotos: 0, ghostPhotos: 0 };
    this.tips = new Set();
    this.emfSources = [];
    this.torchFlickerUntil = 0;
    this.lastEvent = -10;
    this.sawManifest = false;
    this.hidingDuringSurge = false;
    this.askCool = 0;
    this.breathT = 0;
    this.inside = false;
    this.wasInside = false;
    this.beats = new Set();
    this.netT = 0;
    this.remote = {};

    this.ghostState = null;
    this.ghostVis = new GhostVisual(this.engine.scene, setup.ghost);
    if (this.authority) this.brain = new GhostBrain(this, setup.ghost, setup.home, setup.seed ^ 0x5eed, setup.diff);

    this.baseTemp = {};
    const r = rng(setup.seed ^ 0x7e3);
    for (const id in ROOMS) this.baseTemp[id] = ROOMS[id].outside ? 8.5 : 11 + r() * 3.5;
    this.homeTarget = this.ghostDef.evidence.includes('freeze') ? -3.2 - r() * 1.5 : 4.4 + r() * 1.4;

    this.breath = [];
    this.heart = this.audio.heartbeat();
    this.resetWorld();
  }

  /* ------------------------------------------------------------------ */
  /* Setup                                                               */
  /* ------------------------------------------------------------------ */

  resetWorld() {
    const h = this.house;
    const r = rng(this.setup.seed ^ 0xd00);
    for (const id in h.doors) {
      const d = h.doors[id];
      if (d.def.open) continue;
      d.locked = d.def.lock === 'always' || (d.def.lock === 'cellar' && !this.setup.cellar);
      const open = id === 'front' ? 0 : id === 'cellar' ? (this.setup.cellar ? 1 : 0) : r() < 0.55 ? 1 : 0;
      h.setDoor(id, open, true);
      if (d.padlock) d.padlock.visible = !this.setup.cellar;
    }
    for (const id in h.rooms) if (!h.rooms[id].outside) { h.setLight(id, false); h.rooms[id].flickUntil = 0; }
    h.blackout = false;
    h.resetThrowables();
    for (const a of h.anims) { if (a.kind === 'pendulum') a.stopped = false; if (a.kind === 'rock') a.amp = 0; }
    for (const k in h.clues) h.clues[k].group.visible = false;
    if (this.setup.clue) this.showClue(this.setup.clue, this.setup.clue);
    if (this.setup.page && this.setup.pageSpot) this.showClue(this.setup.pageSpot, this.setup.page);
    this.player.place(SPAWN.x, SPAWN.y, SPAWN.z, SPAWN.yaw);
    this.kit.reset();
    this.kit.visible = true;
    this.engine.torch.intensity = 0;
    if (this.brain) this.ghostState = this.brain.state();
    else this.ghostState = { ...this.house.roomCenter(this.setup.home), room: this.setup.home, surge: false };
    this.ghostVis.pos.set(this.ghostState.x, this.ghostState.y, this.ghostState.z);
  }

  showClue(spotKey, clueKey) {
    const c = this.house.clues[spotKey];
    if (!c) return;
    c.group.visible = true;
    c.page = clueKey;
  }

  begin() {
    this.audio.startAmbience();
    this.kit.startStatic();
    this.ui.hud.show(true);
    this.refreshObjectives();
    this.ui.hud.setTool(this.kit.current);
    this.ui.hud.setFlash(this.kit.flash);
    if (this.setup.tutorial) setTimeout(() => this.tip('start'), 1500);
    else setTimeout(() => this.radio('mags', this.setup.finale ? 'The cellar door is open. Investigate first, then get down there and find what the Order was hiding.' : 'We’re set up in the van. Find the ghost room, collect evidence, and stay safe.'), 1500);
  }

  /* ------------------------------------------------------------------ */
  /* Shared world: emit (authority) / apply (everyone) / request          */
  /* ------------------------------------------------------------------ */

  emit(ev) {
    if (!this.authority || this.over) return;
    this.apply(ev);
    if (this.net) this.net.broadcast({ k: 'ev', ev });
  }

  request(a) {
    if (this.over) return;
    if (this.authority) this.handle(a, this.localPid);
    else this.net.send({ k: 'act', a });
  }

  handle(a, pid) {
    const h = this.house;
    switch (a.t) {
      case 'door': {
        const d = h.doors[a.id];
        if (!d) return;
        // the front door jams during a surge; in the finale it jams for a few seconds, then lets you out
        const frontLocked = a.id === 'front' && (this.escape ? this.escape === 1 : !!this.surge);
        if (d.locked || frontLocked) { this.emit({ t: 'locked', id: a.id, pid }); return; }
        this.emit({ t: 'door', id: a.id, open: a.open ? 1 : 0, by: pid });
        break;
      }
      case 'light': {
        if (this.house.blackout) { this.emit({ t: 'dead', pid, room: a.room }); return; }
        this.emit({ t: 'light', room: a.room, on: !!a.on, by: pid });
        break;
      }
      case 'ask': {
        const g = this.brain;
        const room = h.roomAt(a.x, a.y + 0.1, a.z);
        const bright = room && h.rooms[room] && h.rooms[room].on;
        const near = room === g.room || Math.hypot(a.x - g.pos.x, a.z - g.pos.z) < 5;
        const can = this.ghostDef.evidence.includes('voice');
        if (bright) { this.emit({ t: 'noans', pid, why: 'bright' }); return; }
        if (can && near && Math.random() < (a.chance || 0.4)) {
          const words = this.ghostDef.words;
          let text = words[Math.floor(Math.random() * words.length)];
          if (/old/i.test(a.q) && this.setup.ghost === 'child') text = 'EIGHT';
          if (/where/i.test(a.q)) text = Math.random() < 0.5 ? 'HERE' : text;
          this.emit({ t: 'ans', pid, text });
          if (!this.evidence.has('voice')) this.emit({ t: 'evid', id: 'voice', pid });
        } else this.emit({ t: 'noans', pid, why: 'none' });
        break;
      }
      case 'evid':
        if (!this.evidence.has(a.id) && this.ghostDef.evidence.includes(a.id)) this.emit({ t: 'evid', id: a.id, pid });
        break;
      case 'room':
        if (!this.roomFound) this.emit({ t: 'room', room: this.setup.home, pid });
        break;
      case 'photo':
        this.emit({ t: 'photo', pid, url: a.url, kind: a.kind, label: a.label });
        break;
      case 'clue': {
        if (this.cluesTaken.has(a.id)) return;
        this.emit({ t: 'clue', id: a.id, page: a.page, pid });
        if (a.page === 'map') this.startEscape();
        break;
      }
      case 'verdict':
        this.emit({ t: 'verdict', ghost: a.ghost, pid });
        if (this.waitingVerdict) { this.waitingVerdict = false; this.checkEnd(); }
        break;
      case 'chat':
        this.emit({ t: 'chat', pid, text: String(a.text || '').slice(0, 120) });
        break;
      case 'leave':
        this.ready.add(pid);
        this.emit({ t: 'ready', list: [...this.ready] });
        this.checkEnd();
        break;
      case 'unready':
        if (this.ready.delete(pid)) this.emit({ t: 'ready', list: [...this.ready] });
        break;
      default:
    }
  }

  apply(ev) {
    const h = this.house, now = this.now;
    const me = this.player;
    switch (ev.t) {
      case 'door': {
        const d = h.doors[ev.id];
        if (!d) return;
        h.setDoor(ev.id, ev.open);
        d.slam = !!ev.slam;
        const p = { x: d.center.x, y: d.center.y + 1.2, z: d.center.z };
        this.audio.play(ev.slam ? 'slam' : ev.creak ? 'creak' : 'door', { pos: p });
        if (ev.slam || ev.creak) this.witness(p, ev.slam ? 3 : 1.5, 8);
        if (ev.slam && this.near(p, 6)) vibrate(60);
        break;
      }
      case 'locked': {
        if (ev.pid !== this.localPid) return;
        const d = h.doors[ev.id];
        this.audio.play('locked', { pos: { x: d.center.x, y: d.center.y + 1, z: d.center.z } });
        if (ev.id === 'cellar') this.ui.toast('The cellar door is padlocked. A chalk mark is drawn on it, upside down.');
        else if (ev.id === 'back') this.ui.toast('The back door is rusted shut.');
        else if (ev.id === 'front') this.ui.toast(this.escape ? 'It won’t open!' : 'The door won’t budge while it’s surging!');
        break;
      }
      case 'dead': if (ev.pid === this.localPid) { this.audio.play('click', { pos: h.rooms[ev.room].sw }); this.ui.toast('Nothing. The power’s out.'); } break;
      case 'light': {
        const room = h.rooms[ev.room];
        if (!room) return;
        h.setLight(ev.room, ev.on);
        if (room.sw) this.audio.play('click', { pos: room.sw });
        if (ev.ghost) {
          this.witness(room.sw, 2, 7, ev.room);
          if (ev.on && me.room === ev.room) this.ui.toast('The lights just switched on by themselves…');
          if (!ev.on && me.room === ev.room) this.ui.toast('The lights went out…');
        }
        break;
      }
      case 'flicker': {
        h.flicker(ev.room, ev.dur, now);
        const l = h.rooms[ev.room] && h.rooms[ev.room].lamps[0];
        if (l) { this.audio.play('buzz', { pos: l, dur: ev.dur }); this.witness(l, 2, 7, ev.room); }
        break;
      }
      case 'torch':
        if (ev.pid === this.localPid) { this.torchFlickerUntil = now + ev.dur; this.scare(2); this.event(); if (this.kit.flash) this.ui.toast('Your flashlight is flickering…'); }
        break;
      case 'throw': {
        const t = h.throwables[ev.id];
        if (!t) return;
        t.obj.position.set(ev.x, ev.y, ev.z);
        h.launch(ev.id, ev.v, ev.s);
        t.movedAt = now;
        t.watch = 1.2;
        this.audio.play('whoosh', { pos: { x: ev.x, y: ev.y, z: ev.z } });
        break;
      }
      case 'emf':
        this.emfSources.push({ x: ev.x, y: ev.y, z: ev.z, lvl: ev.lvl, until: now + 20, born: now });
        break;
      case 'sound': {
        const pos = { x: ev.x, y: ev.y, z: ev.z };
        this.audio.play(ev.k, { pos, n: ev.n, surface: ev.surface });
        this.witness(pos, ev.k === 'knock' ? 2 : 1.5, ev.k === 'music' ? 12 : 9);
        break;
      }
      case 'manifest':
        this.ghostState = { ...this.ghostState, x: ev.x, y: ev.y, z: ev.z };
        this.ghostVis.pos.set(ev.x, ev.y, ev.z);
        this.ghostVis.manifest(now, ev.dur);
        this.sawManifest = false;
        break;
      case 'rock':
        for (const a of h.anims) if (a.kind === 'rock' && a.room === ev.room) a.amp = 0.14;
        break;
      case 'surge': this.onSurge(ev); break;
      case 'spook':
        if (ev.pid === this.localPid) this.spook();
        else this.ui.toast(`${this.nameOf(ev.pid)} got spooked!`, 'warn');
        break;
      case 'evid': {
        if (this.evidence.has(ev.id)) return;
        this.evidence.add(ev.id);
        this.audio.play('evidence');
        this.ui.evidenceFound(ev.id, ev.pid === this.localPid ? null : this.nameOf(ev.pid));
        this.refreshObjectives();
        if (this.evidence.size === 1) this.tip('evidence');
        if (this.evidence.size >= 3) this.tip('three');
        break;
      }
      case 'room':
        if (this.roomFound) return;
        this.roomFound = true;
        this.ui.toast(`Ghost room found: ${ROOMS[ev.room].name}`, 'good');
        this.audio.play('confirm');
        this.refreshObjectives();
        this.tip('ghostroom');
        break;
      case 'ans': {
        const from = this.remotePos(ev.pid);
        if (ev.pid === this.localPid) {
          this.kit.showAnswer(ev.text, now);
          this.stats.answers++;
          this.audio.play('answer', {});
          this.audio.speak(ev.text, { pitch: this.setup.ghost === 'child' ? 1.6 : 0.1, rate: this.setup.ghost === 'child' ? 0.85 : 0.6 });
          this.ui.radioGhost(ev.text);
          this.scare(3);
          this.event();
        } else {
          if (from) this.audio.play('answer', { pos: from });
          this.ui.toast(`${this.nameOf(ev.pid)}’s spirit box: “${ev.text}”`);
        }
        break;
      }
      case 'noans':
        if (ev.pid === this.localPid) {
          this.kit.spirit.hint = ev.why === 'bright' ? 'TOO BRIGHT' : 'NO RESPONSE';
          if (ev.why === 'bright') this.ui.toast('Spirits rarely answer with the lights on.');
          setTimeout(() => { this.kit.spirit.hint = ''; }, 2500);
        }
        break;
      case 'photo':
        this.photos.push({ pid: ev.pid, url: ev.url, kind: ev.kind, label: ev.label, by: this.nameOf(ev.pid) });
        if (ev.pid !== this.localPid && ev.kind === 'ghost') this.ui.toast(`${this.nameOf(ev.pid)} caught something on camera!`, 'good');
        break;
      case 'clue': {
        this.cluesTaken.add(ev.id);
        for (const k in h.clues) if (h.clues[k].page === ev.page) h.clues[k].group.visible = false;
        this.audio.play('page');
        if (ev.pid === this.localPid) this.ui.clueCard(CLUES[ev.page]);
        else this.ui.toast(`${this.nameOf(ev.pid)} found ${CLUES[ev.page].title}`, 'good');
        this.refreshObjectives();
        break;
      }
      case 'verdict':
        this.verdict = ev.ghost;
        this.refreshObjectives();
        this.ui.journalRefresh();
        if (ev.pid !== this.localPid) this.ui.toast(`${this.nameOf(ev.pid)} marked it as a ${GHOSTS[ev.ghost].name}`);
        else this.tip('verdict');
        break;
      case 'chat':
        this.ui.chatLine(this.nameOf(ev.pid), ev.text, ev.pid === this.localPid);
        if (ev.pid !== this.localPid) this.audio.play('radio');
        break;
      case 'ready':
        this.ready = new Set(ev.list);
        this.ui.hud.setReady(ev.list.map((p) => this.nameOf(p)), this.roster.length);
        break;
      case 'escape': this.onEscape(ev); break;
      case 'danger':
        this.danger = true;
        this.radio('mags', 'The readings are off the charts. It’s getting dangerous in there. Wrap it up and get everyone back to the van!', true);
        vibrate([60, 40, 60]);
        this.refreshObjectives();
        break;
      case 'callNow':
        if (!this.verdict) this.ui.verdictPicker(this, true);
        break;
      case 'end': this.finish(ev); break;
      default:
    }
  }

  /* ------------------------------------------------------------------ */
  /* Players                                                             */
  /* ------------------------------------------------------------------ */

  nameOf(pid) {
    const p = this.roster.find((x) => x.pid === pid);
    return p ? p.name : 'Teammate';
  }

  remotePos(pid) {
    const r = this.remote[pid];
    return r ? { x: r.x, y: r.y + 1.3, z: r.z } : null;
  }

  localInfo() {
    const p = this.player;
    const room = p.room;
    const inside = !!room && room !== 'yard';
    const lit = inside && this.house.lampLevel(this.house.rooms[room], this.now) > 0.5;
    return { pid: this.localPid, pos: { ...p.pos }, eye: p.eye(), yaw: p.yaw, room, inside, hidden: !!p.hidden, nerve: this.nerve, torch: this.kit.flash, lit };
  }

  /** Everyone the ghost can bother: you plus your teammates. */
  livePlayers() {
    const list = [this.localInfo()];
    for (const pid in this.remote) {
      const r = this.remote[pid];
      if (!r || r.gone) continue;
      const pos = { x: r.x, y: r.y, z: r.z };
      const room = this.house.roomAt(r.x, r.y + 0.1, r.z);
      const inside = !!room && room !== 'yard';
      list.push({ pid: Number(pid), pos, eye: { x: r.x, y: r.y + 1.6, z: r.z }, yaw: r.yaw, room, inside, hidden: !!r.hidden, nerve: r.nerve == null ? 100 : r.nerve, torch: !!r.torch, lit: inside && this.house.lampLevel(this.house.rooms[room], this.now) > 0.5 });
    }
    return list;
  }

  /* ------------------------------------------------------------------ */
  /* Per frame                                                           */
  /* ------------------------------------------------------------------ */

  update(dt) {
    if (this.over) return;
    this.t += dt;
    this.now += dt;
    const now = this.now;
    const input = this.app.input;
    const me = this.player;
    const lookBefore = { dx: input.lookDX, dy: input.lookDY };
    if (!this.spooking) me.update(dt, input);
    else input.takeLook();

    // the ghost
    if (this.authority) {
      this.brain.update(dt, this.t);
      this.ghostState = this.brain.state();
    }
    const cam = this.engine.camera;
    const vis = this.ghostVis.update(dt, now, this.ghostState, cam.position, this.profile.settings.reduceFlash);
    if (vis > 0.3) this.checkSighting();

    // the house
    this.house.reduceFlashing = this.profile.settings.reduceFlash;
    this.house.update(dt, now, cam.position, {
      onLand: (t, first) => { if (first || !t.flying) this.audio.play('land', { pos: t.obj.position, kind: t.kind, hard: first ? 1 : 0 }); },
      sigilGlow: this.escape ? 0.85 : 0.22,
    });
    this.house.setVisibleFor(me.layer, me.room);
    this.watchThrows(dt);

    // torch
    const ft = this.kit.tier('flashlight');
    const torch = this.engine.torch;
    let ti = this.kit.flash && !me.hidden ? ft.power : 0;
    if (ti && (now < this.torchFlickerUntil || (this.surge && this.near(this.ghostState, 8)))) ti *= (Math.sin(now * 41) * Math.sin(now * 17) > 0 ? 1 : this.profile.settings.reduceFlash ? 0.5 : 0.08);
    torch.intensity = ti;
    torch.distance = ft.range;
    torch.angle = ft.angle;
    this.engine.flash.intensity = Math.max(0, this.engine.flash.intensity - dt * 160);
    this.engine.aura.intensity = me.hidden ? 0.05 : 0.25;

    // equipment
    this.emfSources = this.emfSources.filter((s) => s.until > now);
    this.kit.update(dt, now, {
      moving: me.moving, lookDX: lookBefore.dx * 0.002, lookDY: lookBefore.dy * 0.002,
      emfAt: (range) => this.emfAt(me.eye(), range),
      tempAt: () => this.tempAt(me.pos),
    });
    this.askCool = Math.max(0, this.askCool - dt);
    this.updateReadout();
    this.detectEvidence();

    // nerve, breath, fear
    this.updateNerve(dt);
    this.updateBreath(dt);
    const tension = clamp((100 - this.nerve) / 100 + (this.surge ? 0.6 : 0), 0, 1);
    this.audio.setAmbience({ inside: me.room && me.room !== 'yard' ? 1 : 0, tension });
    this.heart.set(this.surge && me.room !== 'yard' ? 0.8 : this.nerve < 30 ? (30 - this.nerve) / 40 : 0);
    this.ui.hud.setNerve(this.nerve);
    this.ui.vignette(tension, this.surge ? 1 : 0);

    // interaction prompt
    this.target = me.hidden ? { type: 'unhide' } : this.pickTarget();
    this.ui.hud.setPrompt(this.promptFor(this.target));

    // where am I
    this.inside = !!me.room && me.room !== 'yard';
    if (this.inside && !this.wasInside) this.onEnterHouse();
    this.wasInside = this.inside;
    this.checkTips(dt);
    this.checkBeats();
    this.updateVan(dt);

    // audio listener
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    this.audio.occluder = (p) => !this.house.los(me.eye(), p);
    this.audio.setListener(cam.position, fwd);

    // team sync
    if (this.net) this.netTick(dt);
    if (this.app.avatars) this.app.avatars.update(dt, now, this.remote, cam);
  }

  /* ---------- readings ---------- */

  emfAt(p, range) {
    let lvl = 0;
    for (const s of this.emfSources) {
      if (Math.abs(s.y - p.y) > 2.2) continue;
      const d = Math.hypot(s.x - p.x, s.y - p.y, s.z - p.z);
      if (d < range) lvl = Math.max(lvl, s.lvl);
    }
    const g = this.ghostState;
    if (g && Math.abs(g.y + 1 - p.y) < 2 && Math.hypot(g.x - p.x, g.z - p.z) < 1.5) lvl = Math.max(lvl, 2);
    return lvl;
  }

  roomTemp(room) {
    if (!room) return 8.5;
    const base = this.baseTemp[room] == null ? 12 : this.baseTemp[room];
    if (room === this.setup.home) return base + (this.homeTarget - base) * clamp(this.t / 75, 0, 1) ** 0.8;
    if (this.ghostState && room === this.ghostState.room) return base - 2.5;
    return base;
  }

  tempAt(p) {
    const room = this.house.roomAt(p.x, p.y + 0.1, p.z);
    let v = this.roomTemp(room);
    const g = this.ghostState;
    if (g && Math.hypot(g.x - p.x, g.z - p.z) < 2 && Math.abs(g.y - p.y) < 1.5) v -= 1.2;
    return v;
  }

  updateReadout() {
    const k = this.kit;
    let txt = '', cls = '';
    if (k.current === 'emf') { txt = `EMF ${k.emf.shown}`; cls = k.emf.shown >= 5 ? 'hot' : k.emf.shown >= 3 ? 'warm' : ''; }
    else if (k.current === 'thermo') { const v = k.thermo.shown; txt = k.thermo.value == null ? '— °C' : `${v.toFixed(1)} °C`; cls = v < 0 ? 'cold' : v < 6 ? 'cool' : ''; }
    else if (k.current === 'spirit') { txt = this.now < k.spirit.until ? `“${k.spirit.text}”` : k.spirit.hint || (this.askCool > 0 ? 'Listening…' : 'Ask a question'); cls = this.now < k.spirit.until ? 'hot' : ''; }
    else if (k.current === 'camera') { txt = `${k.camera.shots} photo${k.camera.shots === 1 ? '' : 's'} left`; cls = k.camera.shots ? '' : 'hot'; }
    this.ui.hud.setReadout(txt, cls);
    this.ui.hud.setUse(k.current === 'camera' ? 'Snap' : k.current === 'spirit' ? 'Ask' : null);
  }

  /* ---------- evidence you gather yourself ---------- */

  claim(id) {
    if (this.evidence.has(id) || !this.ghostDef.evidence.includes(id)) return;
    if (this.claimed && this.claimed[id] && this.now - this.claimed[id] < 3) return;
    (this.claimed || (this.claimed = {}))[id] = this.now;
    this.request({ t: 'evid', id });
  }

  detectEvidence() {
    const k = this.kit;
    const me = this.player;
    if (k.current === 'emf' && k.emf.shown >= 5) this.claim('emf');
    if (k.current === 'emf' && k.emf.shown >= 2) { this.side.emf2 = true; this.tip('emf'); }
    if (k.current === 'thermo' && k.thermo.value != null) {
      if (k.thermo.shown < 0) this.claim('freeze');
      if (k.thermo.shown < 6) this.side.cold = true;
      if (k.thermo.shown < 8) this.tip('cold');
    }
    // finding the ghost room
    if (!this.roomFound && me.room === this.setup.home) {
      const cold = k.current === 'thermo' && k.thermo.value != null && k.thermo.shown < 8;
      const emf = k.current === 'emf' && k.emf.shown >= 3;
      if (cold || emf || (this.lastEventRoom === this.setup.home && this.now - this.lastEvent < 6)) this.request({ t: 'room' });
    }
  }

  near(p, d) {
    if (!p) return false;
    const e = this.player.pos;
    return Math.hypot(p.x - e.x, p.z - e.z) < d && Math.abs((p.y || 0) - e.y) < 2.5;
  }

  /** Something happened near you: count it, and let it rattle your nerves. */
  witness(p, nerveHit, range, room) {
    if (!p) return;
    const me = this.player;
    const d = Math.hypot(p.x - me.pos.x, p.z - me.pos.z);
    const sameFloor = Math.abs(p.y - (me.pos.y + 1)) < 2.6;
    if ((d < range && sameFloor) || (room && room === me.room)) {
      if (d < 6 || room === me.room) this.scare(nerveHit);
      this.event(room || this.house.roomAt(p.x, p.y - 0.5, p.z));
    }
  }

  event(room) {
    if (this.now - this.lastEvent > 2) this.stats.events++;
    this.lastEvent = this.now;
    this.lastEventRoom = room || this.player.room;
    this.side.event = true;
  }

  watchThrows(dt) {
    const me = this.player;
    const eye = me.eye();
    const f = me.forward();
    for (const t of this.house.throwables) {
      if (!t.watch) continue;
      t.watch -= dt;
      if (t.watch <= 0) { t.watch = 0; continue; }
      const p = t.obj.position;
      const d = Math.hypot(p.x - eye.x, p.z - eye.z);
      if (d > 10 || Math.abs(p.y - eye.y) > 2.5) continue;
      const dot = ((p.x - eye.x) * f.x + (p.z - eye.z) * f.z) / Math.max(0.01, d);
      if (dot > 0.45 && this.house.los(eye, p)) {
        t.watch = 0;
        this.claim('moving');
        this.scare(3);
        this.event(t.room);
        if (!this.ghostDef.evidence.includes('moving')) continue;
        this.ui.toast('You saw something get thrown!', 'warn');
      } else if (d < 6) {
        this.event(t.room);
      }
    }
  }

  checkSighting() {
    if (this.sawManifest) return;
    const me = this.player;
    const c = this.ghostVis.center();
    const eye = me.eye();
    const d = Math.hypot(c.x - eye.x, c.z - eye.z);
    if (d > 14) return;
    const f = me.forward();
    const dot = ((c.x - eye.x) * f.x + (c.z - eye.z) * f.z) / Math.max(0.01, d);
    if (dot < 0.55 || !this.house.los(eye, c)) return;
    this.sawManifest = true;
    this.audio.play('sting');
    this.lastScare = -9;
    this.scare(this.surge ? 2 : 6);
    this.event(this.ghostState.room);
    vibrate(80);
  }

  /* ---------- nerve ---------- */

  addNerve(n) {
    this.nerve = clamp(this.nerve + n, 0, 100);
  }

  /** A scare: limited to one every couple of seconds so a busy ghost can't drain you instantly. */
  scare(n) {
    if (this.now - (this.lastScare || -9) < 2.5) return;
    this.lastScare = this.now;
    this.addNerve(-n * (this.diff === undefined ? 1 : Math.min(1.3, this.diff.drain)));
  }

  updateNerve(dt) {
    const me = this.player;
    const inside = me.room && me.room !== 'yard';
    let d = 0;
    if (inside) {
      const lvl = this.house.lampLevel(this.house.rooms[me.room], this.now);
      if (lvl < 0.5) d -= 0.1 * this.diff.drain;
      else if (!this.surge) d += 0.12; // a lit room steadies you
      if (me.room === this.setup.home) d -= 0.05 * this.diff.drain;
      if (this.surge) d -= 0.35;
      if (me.hidden) d *= 0.5;
    } else if (this.atVan) d += 1.4;
    this.addNerve(d * dt);
    if (this.nerve < 70) this.tip('nerve');
  }

  updateBreath(dt) {
    const me = this.player;
    const cold = this.tempAt(me.pos) < 0.5 && !me.hidden;
    this.breathT -= dt;
    if (cold && this.breathT <= 0) {
      this.breathT = 2.6 + Math.random();
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('220,230,255'), color: 0xdde6ff, transparent: true, opacity: 0.0, depthWrite: false }));
      const cam = this.engine.camera;
      const f = new THREE.Vector3(0, -0.12, -0.45).applyQuaternion(cam.quaternion).add(cam.position);
      s.position.copy(f);
      s.scale.set(0.2, 0.2, 1);
      s.userData = { life: 0, vel: new THREE.Vector3(0, 0.12, -0.25).applyQuaternion(cam.quaternion) };
      this.engine.scene.add(s);
      this.breath.push(s);
    }
    for (let i = this.breath.length - 1; i >= 0; i--) {
      const s = this.breath[i];
      s.userData.life += dt;
      const l = s.userData.life;
      s.position.addScaledVector(s.userData.vel, dt);
      s.scale.setScalar(0.2 + l * 0.35);
      s.material.opacity = Math.sin(Math.min(1, l / 1.6) * Math.PI) * 0.22;
      if (l > 1.6) { this.engine.scene.remove(s); s.material.dispose(); this.breath.splice(i, 1); }
    }
  }

  /* ---------- tapping things ---------- */

  pickTarget() {
    const cam = this.engine.camera;
    const ray = this.ray || (this.ray = new THREE.Raycaster());
    ray.setFromCamera({ x: 0, y: 0 }, cam);
    ray.far = 2.4;
    const hits = ray.intersectObjects(this.house.interact, false);
    const eye = this.player.eye();
    for (const h of hits) {
      const it = h.object.userData.interact;
      if (!it) continue;
      if (it.type === 'clue') {
        const c = this.house.clues[it.id];
        if (!c.group.visible) continue;
      }
      // nothing through walls: check just short of what was hit
      const k = 0.15 / Math.max(0.15, h.distance);
      const p = { x: h.point.x + (eye.x - h.point.x) * k, y: h.point.y, z: h.point.z + (eye.z - h.point.z) * k };
      if (!this.house.los(eye, p)) continue;
      return it;
    }
    return this.nearbyTarget(eye);
  }

  /** On a phone it's fiddly to aim exactly at a light switch or a page, so
      anything small that's close and roughly in front of you counts too. */
  nearbyTarget(eye) {
    if (!this.smallTargets) {
      this.smallTargets = this.house.interact
        .filter((m) => m.userData.interact && ['switch', 'clue', 'hide'].includes(m.userData.interact.type))
        .map((m) => ({ it: m.userData.interact, pos: m.getWorldPosition(new THREE.Vector3()) }));
    }
    const f = this.player.forward();
    const pitch = this.player.pitch;
    let best = null, bs = -1;
    for (const t of this.smallTargets) {
      if (t.it.type === 'clue' && !this.house.clues[t.it.id].group.visible) continue;
      const dx = t.pos.x - eye.x, dz = t.pos.z - eye.z, dy = t.pos.y - eye.y;
      const d = Math.hypot(dx, dz);
      if (d > 1.6 || Math.abs(dy) > 1.8) continue;
      const dot = (dx * f.x + dz * f.z) / Math.max(0.05, d);
      if (dot < 0.6) continue;
      // looking roughly toward it vertically too (pages lie on tables)
      const want = Math.atan2(dy, Math.max(0.2, d));
      if (Math.abs(want - pitch) > 0.75) continue;
      const k = 0.12 / Math.max(0.12, d);
      if (!this.house.los(eye, { x: t.pos.x - dx * k, y: t.pos.y, z: t.pos.z - dz * k })) continue;
      const score = dot - d * 0.2;
      if (score > bs) { bs = score; best = t.it; }
    }
    return best;
  }

  promptFor(t) {
    if (!t) return null;
    const h = this.house;
    switch (t.type) {
      case 'door': {
        const d = h.doors[t.id];
        if (d.locked) return { label: 'Locked', icon: 'lock' };
        return { label: d.target > 0.5 ? 'Close door' : 'Open door', icon: 'door' };
      }
      case 'switch': return { label: h.rooms[t.id].on ? 'Lights off' : 'Lights on', icon: 'bulb' };
      case 'hide': return { label: 'Hide', icon: 'hide' };
      case 'unhide': return { label: 'Leave hiding spot', icon: 'hide' };
      case 'clue': { const c = h.clues[t.id]; return { label: CLUES[c.page] && CLUES[c.page].notebook ? 'Pick up page' : 'Examine', icon: 'page' }; }
      case 'van': return { label: 'The van', icon: 'van' };
      default: return null;
    }
  }

  interact() {
    const t = this.target;
    if (!t || this.spooking || this.over) return;
    const h = this.house, me = this.player;
    switch (t.type) {
      case 'door': this.request({ t: 'door', id: t.id, open: h.doors[t.id].target < 0.5 }); break;
      case 'switch': {
        const on = !h.rooms[t.id].on;
        if (on) this.stats.lights++;
        this.request({ t: 'light', room: t.id, on });
        break;
      }
      case 'hide': {
        const spot = h.hides.find((s) => s.id === t.id);
        if (!spot) return;
        this.torchWasOn = this.kit.flash;
        this.kit.flash = false;
        me.hide(spot);
        this.kit.visible = false;
        this.ui.hideOverlay(true);
        this.audio.play('door', { pos: { x: spot.x, y: spot.y + 1, z: spot.z }, vol: 0.2 });
        if (this.surge) { this.hidingDuringSurge = true; this.stats.hides++; }
        break;
      }
      case 'unhide':
        me.unhide();
        this.kit.visible = true;
        this.kit.flash = !!this.torchWasOn;
        this.ui.hud.setFlash(this.kit.flash);
        this.ui.hideOverlay(false);
        this.audio.play('door', { pos: me.eye(), vol: 0.2 });
        break;
      case 'clue': {
        const c = h.clues[t.id];
        if (!c.page) return;
        this.request({ t: 'clue', id: t.id, page: c.page });
        break;
      }
      case 'van': this.ui.vanMenu(this); break;
      default:
    }
  }

  toggleFlash() {
    if (this.player.hidden) return;
    this.kit.flash = !this.kit.flash;
    this.audio.play('click');
    this.ui.hud.setFlash(this.kit.flash);
  }

  selectTool(id) {
    this.kit.select(id);
    this.ui.hud.setTool(id);
    this.ui.questions(false);
  }

  use() {
    const k = this.kit;
    if (this.player.hidden || this.spooking) return;
    const tool = k.pending || k.current;
    if (tool === 'camera') this.snap();
    else if (tool === 'spirit') this.ui.questions(true, (q) => this.ask(q));
  }

  ask(q) {
    if (this.askCool > 0) return;
    const tier = this.kit.tier('spirit');
    this.askCool = tier.cooldown;
    const me = this.player;
    this.ui.toast(`You: “${q}”`);
    if (me.room === this.setup.home) this.side.spirit = true;
    setTimeout(() => this.request({ t: 'ask', q, x: me.pos.x, y: me.pos.y, z: me.pos.z, chance: tier.chance }), 900 + Math.random() * 900);
  }

  /* ---------- photos ---------- */

  inFrame(p) {
    V.set(p.x, p.y, p.z).project(this.engine.camera);
    return V.z < 1 && Math.abs(V.x) < 0.8 && Math.abs(V.y) < 0.85;
  }

  photoSubject() {
    const eye = this.player.eye();
    const range = this.kit.tier('camera').range;
    const c = this.ghostVis.center();
    const dGhost = Math.hypot(c.x - eye.x, c.y - eye.y, c.z - eye.z);
    if (dGhost < range && this.inFrame(c) && this.house.los(eye, c)) {
      const shows = this.ghostDef.evidence.includes('photo');
      if (shows) return { kind: 'ghost', label: 'Ghost photograph', reveal: true };
      if (this.ghostVis.opacity > 0.3) return { kind: 'activity', label: 'Paranormal activity' };
    }
    for (const t of this.house.throwables) {
      if (this.now - t.movedAt > 25) continue;
      const p = t.obj.position;
      if (Math.hypot(p.x - eye.x, p.y - eye.y, p.z - eye.z) < 7 && this.inFrame(p) && this.house.los(eye, p)) return { kind: 'object', label: 'Thrown object' };
    }
    for (const s of this.emfSources) {
      if (this.now - s.born > 15 || s.lvl < 3) continue;
      if (Math.hypot(s.x - eye.x, s.y - eye.y, s.z - eye.z) < 6 && this.inFrame(s) && this.house.los(eye, s)) return { kind: 'activity', label: 'Paranormal activity' };
    }
    return { kind: 'none', label: 'Nothing unusual' };
  }

  snap() {
    const k = this.kit;
    if (k.camera.cool > this.now) return;
    if (k.camera.shots <= 0) { this.ui.toast('Out of photos.'); return; }
    k.camera.shots--;
    k.camera.cool = this.now + 0.8;
    k.flashPop(this.now);
    this.audio.play('shutter');
    const subj = this.photoSubject();
    const eng = this.engine;
    // render the shot with the flash, and with the spirit revealed if the camera can see it
    eng.flash.intensity = 40;
    if (subj.reveal) { this.ghostVis.photo = true; this.ghostVis.update(0, this.now, this.ghostState, eng.camera.position, false); }
    eng.render();
    const url = this.capture(subj);
    this.ghostVis.photo = false;
    this.ghostVis.update(0, this.now, this.ghostState, eng.camera.position, false);
    eng.flash.intensity = 22;
    const coins = { ghost: 40, object: 20, activity: 12, none: 0 }[subj.kind];
    const photo = { url, thumb: this.thumb, kind: subj.kind, label: subj.label, coins };
    this.myPhotos.push(photo);
    if (subj.kind !== 'none') { this.side.photo = true; this.stats.activityPhotos++; }
    if (subj.kind === 'ghost') { this.stats.ghostPhotos++; this.claim('photo'); }
    this.ui.photoFlash(photo);
    this.request({ t: 'photo', url: this.thumb, kind: subj.kind, label: subj.label });
  }

  capture(subj) {
    const src = this.engine.renderer.domElement;
    const W = 320, H = 240;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');
    const sw = src.width, sh = src.height;
    const aspect = W / H;
    let cw = sw, ch = sw / aspect;
    if (ch > sh) { ch = sh; cw = sh * aspect; }
    x.drawImage(src, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, W, H);
    // a little grain and a vignette, like a real compact camera at night
    const img = x.getImageData(0, 0, W, H), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 22; d[i] += n; d[i + 1] += n; d[i + 2] += n * 1.2; }
    x.putImageData(img, 0, 0);
    const g = x.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.7);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.65)');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    const mins = 60 + Math.floor(this.t / 10);
    const clock = `${String(Math.floor(mins / 60) % 12 || 12).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')} AM`;
    x.font = 'bold 13px ui-monospace, Menlo, monospace';
    x.fillStyle = '#ffb35c';
    x.fillText(`13 WREN LN  ${clock}`, 10, H - 12);
    const url = c.toDataURL('image/jpeg', 0.72);
    const t = document.createElement('canvas');
    t.width = 200; t.height = 150;
    t.getContext('2d').drawImage(c, 0, 0, 200, 150);
    this.thumb = t.toDataURL('image/jpeg', 0.6);
    return url;
  }

  /* ---------- surges, spooks and escaping ---------- */

  onSurge(ev) {
    const h = this.house;
    if (ev.on) {
      this.surge = { until: this.now + (ev.dur || 20) + 2.6, escape: !!ev.escape };
      for (const id in h.rooms) if (!h.rooms[id].outside) h.flicker(id, 2.8, this.now);
      this.audio.play('surge');
      vibrate([80, 60, 120]);
      this.ui.surgeFx(true);
      if (!ev.escape) {
        if (!this.tip('surge')) this.radio('mags', 'It’s surging! Get away from it, or hide!', true);
      }
      this.hidingDuringSurge = !!this.player.hidden;
    } else {
      this.surge = null;
      this.ui.surgeFx(false);
      if (this.hidingDuringSurge && this.player.hidden) {
        this.side.hid = true;
        const a = this.profile.unlock('hider');
        if (a) this.ui.achievement(a);
      }
      this.hidingDuringSurge = false;
      if (this.player.room && this.player.room !== 'yard') this.ui.toast('It’s calming down…');
    }
  }

  spook() {
    if (this.spooking) return;
    this.spooking = true;
    this.spooks++;
    const me = this.player;
    if (me.hidden) { me.unhide(); this.ui.hideOverlay(false); }
    me.frozen = true;
    this.kit.visible = false;
    this.audio.play('spook');
    vibrate([200, 80, 300]);
    this.ui.spookFx(this.setup.ghost);
    const a = this.profile.unlock('spooked');
    setTimeout(() => {
      me.place(SPAWN.x + (Math.random() - 0.5), 0, SPAWN.z - 0.6, 0);
      this.nerve = Math.max(this.nerve, 45);
      me.frozen = false;
      this.kit.visible = true;
      this.spooking = false;
      if (a) this.ui.achievement(a);
      this.radio('mags', this.escape ? 'We’ve got you, you’re at the van! Stay put!' : 'We pulled you out. Catch your breath by the van, then get back in there.');
    }, 2600);
  }

  startEscape() {
    if (this.escape) return;
    this.frontLockedUntil = this.t + 7;
    this.emit({ t: 'escape', phase: 1 });
    // every door slams, then the ghost comes looking
    for (const id in this.house.doors) {
      const d = this.house.doors[id];
      if (d.def.open || d.def.ext || id === 'cellar' || id === 'storage') continue;
      if (d.target > 0.5) this.brain.queue.push({ at: Math.random() * 1.5, fn: () => this.emit({ t: 'door', id, open: 0, slam: true }) });
    }
    this.brain.escape = true;
    if (this.brain.surge) this.brain.surge = null;
    this.brain.startSurge(this.t, { endless: true, warm: 5 });
    this.brain.queue.push({ at: 7, fn: () => this.emit({ t: 'escape', phase: 2 }) });
  }

  onEscape(ev) {
    const h = this.house;
    if (ev.phase === 1) {
      this.escape = 1;
      h.blackout = true;
      this.audio.play('surge');
      this.audio.play('slam', { pos: this.player.eye() });
      vibrate([200, 100, 200]);
      this.radio('mags', 'Something’s happening, the whole house just spiked! GET OUT! Back to the van, NOW!', true);
      setTimeout(() => this.radio('juno', 'The front door is jammed! Hang on…', true), 3500);
      this.refreshObjectives();
    } else if (ev.phase === 2) {
      this.escape = 2;
      this.audio.play('click', { pos: { x: 6.5, y: 1, z: 12 } });
      this.radio('juno', 'It’s open! The front door’s open! RUN!', true);
      this.refreshObjectives();
    }
  }

  /* ---------- the van ---------- */

  updateVan(dt) {
    const p = this.player.pos;
    if (this.inside) this.beenInside = true;
    // only offer to finish once you've actually been in the house
    const at = Math.hypot(p.x - VAN_SPOT.x, p.z - VAN_SPOT.z) < VAN_SPOT.r && p.z > 22 && (this.beenInside || this.t > 90);
    if (at !== this.atVan) {
      this.atVan = at;
      this.ui.hud.setVan(at);
      if (!at && this.ready.has(this.localPid)) this.request({ t: 'unready' });
    }
    if (this.escape && at && !this.escapedLocal) {
      this.escapedLocal = true;
      this.request({ t: 'leave' });
    }
  }

  wantLeave() {
    if (!this.verdict && !this.escape) { this.ui.verdictPicker(this, false, () => this.request({ t: 'leave' })); return; }
    this.request({ t: 'leave' });
    if (this.net && this.ready.size < this.roster.length) this.ui.toast('Waiting for the rest of the team to get back to the van…');
  }

  checkEnd() {
    if (!this.authority || this.over) return;
    const everyone = this.roster.filter((p) => !this.remote[p.pid] || !this.remote[p.pid].gone).map((p) => p.pid);
    if (!everyone.every((pid) => this.ready.has(pid))) return;
    if (!this.verdict) {
      this.emit({ t: 'callNow' });
      this.waitingVerdict = true;
      return;
    }
    this.emit({ t: 'end', ghost: this.setup.ghost, verdict: this.verdict, evidence: [...this.evidence], escaped: this.escape > 0, roomFound: this.roomFound, clues: [...this.cluesTaken], time: this.t, home: this.setup.home });
  }

  /* ---------- tips, story beats, radio ---------- */

  radio(who, text, urgent = false) {
    this.audio.play('radio');
    this.ui.radio(who, text, urgent);
  }

  tip(key) {
    if (!this.setup.tutorial && key !== 'surge') return false;
    if (this.tips.has(key)) return false;
    this.tips.add(key);
    const [who, text] = TUTORIAL[key];
    this.radio(who, text);
    return true;
  }

  checkTips(dt) {
    if (!this.setup.tutorial) return;
    if (this.inside && !this.kit.flash) {
      this.darkT = (this.darkT || 0) + dt;
      if (this.darkT > 1.2) this.tip('dark');
    }
    if (this.inside && this.tips.has('dark') && !this.tips.has('inside')) {
      this.insideT = (this.insideT || 0) + dt;
      if (this.insideT > 5) this.tip('inside');
    }
  }

  onEnterHouse() {
    if (this.setup.tutorial && this.kit.flash && !this.tips.has('dark')) this.tips.add('dark');
  }

  checkBeats() {
    const room = this.player.room;
    const once = (key, who, text) => { if (!this.beats.has(key)) { this.beats.add(key); this.radio(who, text); } };
    if (this.setup.caseId === 'c2' && room === 'study') once('study', 'theo', 'Arthur’s study. If he left anything behind, it’ll be on that desk.');
    if (this.setup.caseId === 'c1' && room === 'nursery') once('nursery', 'theo', 'This was Ellie’s room. Look around, kids leave things behind.');
    if (this.setup.finale) {
      if (room === 'cellar') once('cellar', 'mags', 'You’re on the cellar stairs. Careful. Nobody’s been down there since 1987.');
      if (room === 'storage') once('storage', 'theo', 'That mark on the floor, it’s the lantern. Eight candles… is one of them lit?');
    }
  }

  /* ---------- objectives ---------- */

  objectives() {
    const list = [];
    list.push({ id: 'room', text: 'Find the ghost room', done: this.roomFound });
    list.push({ id: 'evidence', text: `Collect evidence (${Math.min(3, this.evidence.size)}/3)`, done: this.evidence.size >= 3 });
    list.push({ id: 'verdict', text: this.verdict ? `Identify the ghost: ${GHOSTS[this.verdict].name}` : 'Identify the ghost in your journal', done: !!this.verdict });
    if (this.setup.clue) {
      const label = { drawing: 'Search Ellie’s bedroom', letter: 'Search Arthur’s study', map: 'Find what the Order hid in the basement' }[this.setup.clue];
      list.push({ id: 'clue', text: label, done: this.clueTaken(this.setup.clue) });
    }
    if (this.setup.page) list.push({ id: 'page', text: 'Optional: find a lost notebook page', done: this.clueTaken(this.setup.page), optional: true });
    if (this.escape) list.push({ id: 'van', text: 'ESCAPE to the van!', done: false, urgent: true });
    else if (this.danger) list.push({ id: 'van', text: 'Too dangerous! Get back to the van', done: false, urgent: true });
    else list.push({ id: 'van', text: 'Return to the van to finish', done: false });
    for (const id of this.setup.side) list.push({ id, text: SIDE_OBJECTIVES[id].text, done: this.sideDone(id), side: true });
    return list;
  }

  clueTaken(page) {
    for (const k of this.cluesTaken) if (this.house.clues[k] && this.house.clues[k].page === page) return true;
    return false;
  }

  sideDone(id) {
    if (id === 'nerve') return this.nerve > 40;
    if (id === 'nospook') return this.spooks === 0;
    return !!this.side[id];
  }

  refreshObjectives() { this.ui.hud.setObjectives(this.objectives()); }

  /* ---------- team sync ---------- */

  netTick(dt) {
    this.netT -= dt;
    if (this.netT > 0) return;
    this.netT = 0.1;
    const me = this.player;
    const st = { x: +me.pos.x.toFixed(2), y: +me.pos.y.toFixed(2), z: +me.pos.z.toFixed(2), yaw: +me.yaw.toFixed(2), pitch: +me.pitch.toFixed(2), torch: this.kit.flash ? 1 : 0, tool: this.kit.current, hidden: me.hidden ? 1 : 0, nerve: Math.round(this.nerve) };
    if (this.authority) {
      // the host relays everyone's position so each phone sees the whole team
      const g = this.ghostState;
      const all = { [this.localPid]: st };
      for (const pid in this.remote) {
        const r = this.remote[pid];
        if (r.gone || r.x == null) continue;
        all[pid] = { x: r.x, y: r.y, z: r.z, yaw: r.yaw, pitch: r.pitch, torch: r.torch, tool: r.tool, hidden: r.hidden, nerve: r.nerve };
      }
      this.net.broadcast({ k: 'gs', g: { x: +g.x.toFixed(2), y: +g.y.toFixed(2), z: +g.z.toFixed(2), room: g.room, surge: g.surge ? 1 : 0 }, p: all });
    } else this.net.send({ k: 'ps', s: st });
    this.ui.hud.setTeam(this.roster.map((p) => ({ name: p.name, nerve: p.pid === this.localPid ? this.nerve : (this.remote[p.pid] ? this.remote[p.pid].nerve : null), me: p.pid === this.localPid, gone: this.remote[p.pid] && this.remote[p.pid].gone })));
  }

  onPlayerState(pid, s) {
    pid = Number(pid);
    if (pid === this.localPid) return;
    const r = this.remote[pid] || (this.remote[pid] = { info: this.allRoster.find((p) => p.pid === pid) || {} });
    if (r.gone) return;
    Object.assign(r, s, { seen: this.now });
  }

  onGhostState(g) {
    this.ghostState = { ...this.ghostState, ...g, surge: !!g.surge };
  }

  playerLeft(pid) {
    if (this.remote[pid]) this.remote[pid].gone = true;
    this.roster = this.roster.filter((p) => p.pid !== pid);
    this.ready.delete(pid);
    this.ui.toast(`${this.nameOfGone(pid)} left the investigation.`);
    if (this.authority) this.checkEnd();
  }

  nameOfGone(pid) { const p = this.allRoster.find((x) => x.pid === pid); return p ? p.name : 'A teammate'; }

  /* ---------- finishing ---------- */

  finish(ev) {
    if (this.over) return;
    this.over = true;
    this.kit.stopStatic();
    this.heart.stop();
    this.ui.surgeFx(false);
    this.ui.hideOverlay(false);
    for (const s of this.breath) this.engine.scene.remove(s);
    const result = this.score(ev);
    this.app.onInvestigationEnd(this, result);
  }

  score(ev) {
    const p = this.profile;
    const correct = ev.verdict === ev.ghost;
    const evidence = ev.evidence || [];
    const mult = this.diff.mult;
    const lines = [];
    let coins = 0, xp = 0;
    const add = (label, c, x) => { lines.push({ label, coins: c, xp: x }); coins += c; xp += x; };
    add('Investigation complete', 60, 60);
    if (correct) add(`Correct identification: ${GHOSTS[ev.ghost].name}`, 120, 140);
    else add(ev.verdict ? `Wrong call (it was a ${GHOSTS[ev.ghost].name})` : 'No ghost identified', 0, 0);
    if (evidence.length) add(`Evidence found ×${evidence.length}`, 15 * evidence.length, 20 * evidence.length);
    if (ev.roomFound) add('Ghost room found', 20, 20);
    const sides = this.setup.side.filter((id) => this.sideDone(id));
    for (const id of sides) add(SIDE_OBJECTIVES[id].text, SIDE_OBJECTIVES[id].reward, SIDE_OBJECTIVES[id].reward);
    const counted = this.myPhotos.filter((ph) => ph.coins > 0).slice(0, 6);
    const photoCoins = counted.reduce((s, ph) => s + ph.coins, 0);
    if (photoCoins) add(`Photos ×${counted.length}`, photoCoins, Math.round(photoCoins / 2));
    const clueFound = this.setup.clue && this.clueTaken(this.setup.clue);
    const pageFound = this.setup.page && this.clueTaken(this.setup.page);
    if (clueFound) add(`Clue: ${CLUES[this.setup.clue].title}`, 50, 60);
    if (pageFound) add(`Found ${CLUES[this.setup.page].title}`, 40, 50);
    if (this.setup.finale && ev.escaped) add('Escaped Wren Lane', 100, 120);
    if (this.net && this.roster.length > 1) add(`Team bonus (${this.roster.length} investigators)`, Math.round(coins * 0.1 * (this.roster.length - 1)), Math.round(xp * 0.1 * (this.roster.length - 1)));
    let total = { coins, xp };
    if (mult !== 1) { lines.push({ label: `${this.diff.name} ×${mult}`, coins: Math.round(coins * (mult - 1)), xp: Math.round(xp * (mult - 1)) }); total = { coins: Math.round(coins * mult), xp: Math.round(xp * mult) }; }
    if (this.spooks) {
      const k = Math.max(0.5, 1 - 0.2 * this.spooks);
      lines.push({ label: `Spooked ×${this.spooks}`, coins: -Math.round(total.coins * (1 - k)), xp: -Math.round(total.xp * (1 - k)) });
      total = { coins: Math.round(total.coins * k), xp: Math.round(total.xp * k) };
    }

    // story progress
    let story = null;
    const caseDef = CHAPTERS[0].cases.find((c) => c.id === this.setup.caseId);
    const next = p.nextCase();
    if (caseDef && next && next.id === caseDef.id && clueFound && (!caseDef.finale || ev.escaped)) {
      p.d.story.caseIndex++;
      story = { caseDef, advanced: true };
      total.coins += 100; total.xp += 150;
      lines.push({ label: `Story: ${caseDef.title} solved`, coins: 100, xp: 150 });
      if (caseDef.finale) p.d.story.chapterDone = true;
    } else if (caseDef) story = { caseDef, advanced: false, missingClue: !clueFound, noEscape: caseDef.finale && !ev.escaped };
    if (clueFound && !p.d.story.clues.includes(this.setup.clue)) p.d.story.clues.push(this.setup.clue);
    if (pageFound && !p.d.story.notebook.includes(this.setup.page)) p.d.story.notebook.push(this.setup.page);

    p.addCoins(total.coins);
    const levelsBefore = p.d.level;
    const rankBefore = p.rank().name;
    p.addXP(total.xp);

    // lifetime stats
    const s = p.d.stats;
    s.investigations++;
    if (correct) { s.correct++; s.byGhost[ev.ghost] = (s.byGhost[ev.ghost] || 0) + 1; if (!s.fastest || ev.time < s.fastest) s.fastest = Math.round(ev.time); } else s.wrong++;
    s.evidence += evidence.length;
    s.photos += this.myPhotos.length;
    s.ghostPhotos += this.stats.ghostPhotos;
    s.spooks += this.spooks;
    s.answers += this.stats.answers;
    s.hides += this.stats.hides;
    s.lights += this.stats.lights;
    s.events += this.stats.events;
    if (this.net && this.roster.length > 1) s.team++;

    // achievements
    const got = [];
    const un = (id) => { const a = p.unlock(id); if (a) got.push(a); };
    un('first_case');
    if (correct) { un('correct'); un(ev.ghost); if (ev.time < 300) un('speed'); if (this.setup.diff === 'professional') un('pro'); }
    if (this.stats.ghostPhotos) un('photo');
    if (evidence.length >= 3) un('all_evidence');
    if (this.nerve > 75) un('calm');
    if (['drawing', 'letter', 'map'].every((c) => p.d.story.clues.includes(c))) un('clues');
    if (p.d.story.chapterDone) un('chapter1');
    if (NOTEBOOK.every((c) => p.d.story.notebook.includes(c))) un('notebook');
    if (this.net && this.roster.length > 1) un('team');
    if (s.investigations >= 10) un('veteran');
    if (p.d.level >= 5) un('rank');
    if (Object.values(p.d.tiers).some((t) => t >= 2)) un('upgrade');

    // dailies
    const dailies = p.bumpDaily({
      activityPhotos: this.stats.activityPhotos, evidence: evidence.length, correct: correct ? 1 : 0, answers: this.stats.answers,
      calmFinish: this.nerve > 50 ? 1 : 0, cleanFinish: this.spooks ? 0 : 1, lights: this.stats.lights, hides: this.stats.hides, events: this.stats.events,
    });
    if (dailies.some((d) => d.id === 'all')) un('daily');

    const best = this.myPhotos.find((ph) => ph.kind === 'ghost') || this.myPhotos.find((ph) => ph.kind !== 'none') || null;
    p.d.history.unshift({ date: Date.now(), title: this.setup.title, ghost: ev.ghost, verdict: ev.verdict, correct, coins: total.coins, xp: total.xp, diff: this.setup.diff, photo: best ? best.thumb : null });
    p.d.history = p.d.history.slice(0, 12);
    p.save();

    return {
      ev, correct, evidence, lines, total, story, achievements: got, dailies,
      levelUp: p.d.level > levelsBefore, level: p.d.level, rankUp: p.rank().name !== rankBefore ? p.rank() : null,
      photos: this.photos.length ? this.photos : this.myPhotos, myPhotos: this.myPhotos, spooks: this.spooks, nerve: Math.round(this.nerve),
      sides: this.setup.side.map((id) => ({ text: SIDE_OBJECTIVES[id].text, done: this.sideDone(id) })),
      setup: this.setup, time: ev.time, team: this.roster.map((r) => r.name),
    };
  }

  dispose() {
    this.ghostVis.dispose();
    this.kit.stopStatic();
    this.heart.stop();
    for (const s of this.breath) this.engine.scene.remove(s);
  }
}

