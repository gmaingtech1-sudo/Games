/* ParanormalADHDhunters — the app: boot, menus, starting cases, the main loop,
   the report and story scenes, settings and the team lobby. */
import { Engine } from './engine.js';
import { Audio } from './audio.js';
import { House } from './house.js';
import { setTextureQuality, TEXTURE_NAMES, T } from './textures.js';
import { Kit } from './equipment.js';
import { Player } from './player.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { Profile } from './profile.js';
import { Investigation, makeSetup } from './game.js';
import { Avatars } from './avatars.js';
import { Net, cleanCode, MAX_TEAM } from './net.js';
import { PROLOGUE, TOOLS } from './data.js';
import { h, $, $$, nextFrame, wait, escapeHtml } from './util.js';
import { avatar, countyMap } from './art.js';

class App {
  constructor() {
    this.profile = new Profile();
    this.audio = new Audio();
    this.inv = null;
    this.net = null;
    this.paused = false;
    this.mode = 'boot';
    this.last = performance.now();
    this.menuT = 0;
  }

  async boot() {
    const s = this.profile.settings;
    this.ui = new UI(this);
    this.applySettings();
    const fonts = document.fonts ? Promise.race([document.fonts.ready, wait(2500)]) : wait(10);
    this.ui.bootProgress(0.05, 'Waking up the house…');
    await fonts;
    await nextFrame();
    this.engine = new Engine($('#scene'), s);
    setTextureQuality(s.quality, this.engine.renderer);
    this.ui.bootProgress(0.12, 'Painting the wallpaper…');
    // paint textures a few at a time so the progress bar keeps moving
    for (let i = 0; i < TEXTURE_NAMES.length; i++) {
      T(TEXTURE_NAMES[i]);
      if (i % 8 === 7) { this.ui.bootProgress(0.12 + (i / TEXTURE_NAMES.length) * 0.4); await nextFrame(); }
    }
    this.ui.bootProgress(0.55, 'Building 13 Wren Lane…');
    await nextFrame();
    this.house = new House(this.engine.scene, { quality: s.quality }).build();
    this.ui.bootProgress(0.8, 'Charging the equipment…');
    await nextFrame();
    this.kit = new Kit(this.engine.renderer, this.audio, s);
    this.kit.setTiers(this.profile.d.tiers);
    this.onUniform();
    this.player = new Player(this.engine.camera, this.house, this.audio);
    this.input = new Input($('#touch'), $('#stick'), s);
    this.wireControls();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.menuView();
    this.engine.renderer.compile(this.engine.scene, this.engine.camera);
    // draw the moonlight's shadow once, then stop the house casting it
    this.engine.render();
    this.house.afterShadowBake();
    this.ui.bootProgress(1, 'Ready.');
    this.loop();
    this.ui.bootReady(() => this.begin());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.inv && !this.net && !this.ui.sheetOpen && this.mode === 'game') this.ui.pauseMenu(this.inv);
    });
    window.__pah = this; // handy for testing from the console
    this.makeSetup = makeSetup;
  }

  begin() {
    this.audio.unlock();
    this.applySettings();
    this.ui.hideBoot();
    this.ui.showMenu(true);
    this.mode = 'menu';
    this.audio.startAmbience();
    this.audio.setAmbience({ inside: 0, tension: 0 });
    this.audio.startMenuMusic();
    if (!this.profile.d.story.prologue) {
      this.ui.story(PROLOGUE, {
        title: 'Welcome to the team', kicker: 'PARANORMALADHDHUNTERS · NEW RECRUIT', done: 'Let’s go',
        onDone: () => { this.profile.d.story.prologue = true; this.profile.save(); this.ui.refreshMenu(); },
      });
    }
  }

  resize() {
    this.engine.resize();
    this.kit.resize(window.innerWidth / window.innerHeight);
  }

  applySettings() {
    const s = this.profile.settings;
    this.audio.setVolumes({ master: s.master, sfx: s.sfx, amb: s.amb });
    this.audio.voiceOn = s.voice;
    document.body.classList.toggle('lefty', !!s.lefty);
    document.body.classList.toggle('reduce-flash', !!s.reduceFlash);
    if (this.house) this.house.reduceFlashing = !!s.reduceFlash;
  }

  onUniform() {
    const u = this.profile.uniform();
    if (this.kit) this.kit.setUniform(u.jacket, u.trim);
    if (this.net && this.net.active()) this.net.me = this.me();
  }

  onTiers() { this.kit.setTiers(this.profile.d.tiers); }

  me() {
    const d = this.profile.d;
    return { name: d.name, uniform: d.uniform, level: d.level };
  }

  /* ---------- controls ---------- */

  wireControls() {
    const act = (fn) => (e) => { e.preventDefault(); e.stopPropagation(); this.audio.unlock(); if (this.inv && !this.ui.sheetOpen) fn(this.inv); };
    $('#btn-interact').addEventListener('pointerdown', act((inv) => inv.interact()));
    $('#btn-use').addEventListener('pointerdown', act((inv) => inv.use()));
    $$('#hotbar .slot').forEach((b) => b.addEventListener('pointerdown', act((inv) => {
      if (b.dataset.tool === 'flashlight') inv.toggleFlash(); else inv.selectTool(b.dataset.tool);
    })));
    $('#btn-map').addEventListener('click', () => { if (this.inv) this.ui.map(); });
    $('#btn-journal').addEventListener('click', () => { if (this.inv) this.ui.journal(); });
    $('#btn-pause').addEventListener('click', () => { if (this.inv) this.ui.pauseMenu(this.inv); });
    $('#btn-chat').addEventListener('click', () => { if (this.inv) this.ui.chatSheet((t) => this.inv.request({ t: 'chat', text: t })); });
    $('#btn-van').addEventListener('click', () => { if (this.inv) this.ui.vanMenu(this.inv); });
    $('#nerve').addEventListener('click', () => { if (this.inv) this.ui.toast(`Nerve ${Math.round(this.inv.nerve)}%. Darkness and scares lower it; rest by the van to recover.`); });
    const i = this.input;
    i.on('interact', () => this.inv && this.inv.interact());
    i.on('use', () => this.inv && this.inv.use());
    i.on('flash', () => this.inv && this.inv.toggleFlash());
    TOOLS.forEach((t, k) => i.on(`slot${k + 1}`, () => this.inv && this.inv.selectTool(t)));
    i.on('journal', () => this.inv && this.ui.journal());
    i.on('map', () => this.inv && this.ui.map());
    i.on('pause', () => this.inv && this.ui.pauseMenu(this.inv));
    i.on('chat', () => this.inv && this.net && this.ui.chatSheet((t) => this.inv.request({ t: 'chat', text: t })));
    i.on('escape', () => { if (this.ui.sheetOpen && this.ui.sheetClosable) this.ui.closeSheet(); });

    // main menu
    $('#btn-investigate').addEventListener('click', () => { this.audio.unlock(); this.audio.play('ui'); this.ui.caseBoard(); });
    $('#menu-profile').addEventListener('click', () => { this.audio.play('ui'); this.ui.profileSheet(); });
    $('#btn-help').addEventListener('click', () => { this.audio.unlock(); this.audio.play('ui'); this.ui.howToPlay(); });
    $$('.menu-grid button').forEach((b) => b.addEventListener('click', () => {
      this.audio.play('ui');
      const k = b.dataset.open;
      if (k === 'team') this.teamSheet();
      if (k === 'profile') this.ui.profileSheet();
      if (k === 'equipment') this.ui.equipmentSheet();
      if (k === 'achievements') this.ui.achievementsSheet();
      if (k === 'daily') this.ui.dailySheet();
      if (k === 'settings') this.ui.settingsSheet();
    }));
  }

  onSheet(open) {
    if (!this.inv) return;
    this.input.setEnabled(!open && !this.inv.over);
    if (!this.net) this.paused = open;
    if (open) this.ui.questions(false);
  }

  /* ---------- the menu backdrop: the house from the street ---------- */

  menuView() {
    const h = this.house;
    for (const id in h.rooms) if (!h.rooms[id].outside) h.setLight(id, false);
    h.setLight('nursery', true);
    h.setLight('hall', true);
    for (const id in h.doors) if (!h.doors[id].def.open) h.setDoor(id, false, true);
    for (const k in h.clues) h.clues[k].group.visible = false;
    h.blackout = false;
    h.setVisibleFor(0, 'yard');
    this.engine.torch.intensity = 0;
    this.engine.scene.fog.density = 0.04;
    this.kit.visible = false;
  }

  updateMenu(dt) {
    this.menuT += dt;
    const t = this.menuT;
    const cam = this.engine.camera;
    const a = Math.sin(t * 0.05) * 0.18;
    cam.position.set(12.8 + Math.sin(t * 0.07) * 1.2, 1.8 + Math.sin(t * 0.11) * 0.15, 28 + Math.cos(t * 0.05) * 0.6);
    cam.lookAt(6.2 + a * 4, 3.6, 10);
    // the light in Ellie's room upstairs isn't quite right
    const h = this.house;
    if (Math.random() < dt * 0.15) h.flicker('nursery', 0.8 + Math.random(), t);
    if (Math.random() < dt * 0.03) h.setLight('hall', !h.rooms.hall.on);
    h.update(dt, t, cam.position, {});
  }

  /* ---------- the loop ---------- */

  loop() {
    requestAnimationFrame(() => this.loop());
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.mode === 'menu' || this.mode === 'boot' || this.mode === 'report') this.updateMenu(dt);
    else if (this.mode === 'game' && this.inv && !this.paused) this.inv.update(dt);
    this.engine.render();
    if (this.mode === 'game') this.kit.render();
  }

  /* ---------- starting an investigation ---------- */

  async startCase(caseDef, opts = {}) {
    const p = this.profile;
    const team = this.net && this.net.isHost && this.net.peers() > 0;
    const setup = makeSetup({
      caseDef, diff: p.d.diff, team,
      cellarOpen: p.d.story.caseIndex >= 2,
      notebook: p.d.story.notebook,
    });
    if (opts.replay) setup.replay = true;
    if (team) {
      this.net.inGame = true;
      const roster = this.net.roster.slice();
      this.net.broadcast({ k: 'start', setup, roster });
      await this.launch(setup, { net: this.net, localPid: 0, roster });
    } else await this.launch(setup, {});
  }

  async launch(setup, opts) {
    this.ui.closeSheet();
    this.audio.stopMenuMusic();
    this.ui.showLoading(setup.finale ? 'Back to Wren Lane. The cellar is open…' : 'Driving to 13 Wren Lane…');
    this.ui.fade(false);
    await nextFrame();
    this.ui.loadingProgress(0.2);
    if (this.inv) { this.inv.dispose(); this.inv = null; }
    if (this.avatars) { this.avatars.clear(); }
    if (opts.net && !this.avatars) this.avatars = new Avatars(this.engine.scene, MAX_TEAM - 1);
    this.engine.scene.fog.density = 0.055;
    this.kit.setTiers(this.profile.d.tiers);
    const inv = new Investigation(this, setup, opts);
    this.inv = inv;
    this.ui.loadingProgress(0.5);
    await nextFrame();
    // compile the ghost's look now, so the first scare doesn't stutter
    inv.ghostVis.group.visible = true;
    this.engine.renderer.compile(this.engine.scene, this.engine.camera);
    inv.ghostVis.group.visible = false;
    this.ui.loadingProgress(0.85);
    await wait(500);
    this.ui.loadingProgress(1);
    await wait(250);
    this.ui.hideLoading();
    this.ui.showMenu(false);
    $('#btn-chat').hidden = !opts.net;
    this.ui.hud.setEvidenceCount(0);
    this.ui.hud.setReady([], 1);
    this.ui.hud.setVan(false);
    this.ui.clearRadio();
    this.mode = 'game';
    this.paused = false;
    this.input.setEnabled(true);
    inv.begin();
  }

  /** The investigation is over: report, story, then back to the menu. */
  onInvestigationEnd(inv, res) {
    this.input.setEnabled(false);
    this.ui.hud.show(false);
    this.ui.questions(false);
    this.mode = 'report';
    this.ui.fade(true);
    setTimeout(() => {
      this.menuView();
      this.ui.fade(false);
      this.ui.report(res, () => this.afterReport(res));
    }, 700);
  }

  afterReport(res) {
    const done = () => {
      if (this.inv) { this.inv.dispose(); this.inv = null; }
      if (this.avatars) this.avatars.clear();
      if (this.net) this.net.inGame = false;
      this.mode = 'menu';
      this.ui.showMenu(true);
      this.audio.startMenuMusic();
      if (this.net && this.net.active()) this.teamSheet();
    };
    const st = res.story;
    if (st && st.advanced) {
      const c = st.caseDef;
      const extra = c.finale ? h('div.chapter-end', { html: `${countyMap({ lit: 1, reveal: true })}<p class="casefile">END OF CHAPTER ONE</p>` }) : null;
      this.ui.story(c.debrief, { title: c.finale ? 'Chapter 1 · The End' : 'Debrief', kicker: `CASE CLOSED · ${c.title.toUpperCase()}`, hook: c.hook, extra, done: c.finale ? 'To be continued…' : 'Back to base', onDone: done });
    } else done();
  }

  abandon() {
    if (!this.inv) return;
    if (this.net && this.net.active()) {
      // leaving a team game drops you from the team
      this.net.leave();
    }
    this.inv.over = true;
    this.inv.dispose();
    this.inv = null;
    if (this.avatars) this.avatars.clear();
    this.input.setEnabled(false);
    this.ui.hud.show(false);
    this.ui.surgeFx(false);
    this.ui.hideOverlay(false);
    this.menuView();
    this.mode = 'menu';
    this.ui.showMenu(true);
    this.audio.startMenuMusic();
  }

  /* ---------- team mode ---------- */

  async ensureNet() {
    if (this.net) return this.net;
    if (!new URLSearchParams(location.search).get('net') && typeof window.Peer !== 'function') {
      await new Promise((res) => {
        const s = document.createElement('script');
        s.src = 'vendor/peerjs.min.js';
        s.onload = res; s.onerror = res;
        document.head.append(s);
      });
    }
    const net = new Net();
    this.net = net;
    net.on('roster', () => { if (this.ui.sheetOpen === 'team') this.renderTeam(); });
    net.on('state', () => { if (this.ui.sheetOpen === 'team') this.renderTeam(); });
    net.on('error', (msg) => {
      this.teamError = msg;
      if (this.inv && this.inv.net) {
        // lost the team mid-investigation
        this.ui.toast(msg, 'warn');
        this.abandon();
      }
      if (this.ui.sheetOpen === 'team' || this.mode === 'menu') this.teamSheet();
    });
    net.on('lobbychat', (m) => {
      this.ui.chatLine(net.nameOf(m.pid), m.text, m.pid === net.localPid);
      if (this.ui.sheetOpen === 'team') this.renderTeam();
    });
    net.on('left', (pid) => { if (this.inv) this.inv.playerLeft(pid); });
    net.on('message', (m, from) => this.onNetMessage(m, from));
    return net;
  }

  onNetMessage(m, from) {
    const net = this.net;
    if (net.isHost) {
      if (!this.inv) return;
      if (m.k === 'act') this.inv.handle(m.a, from);
      else if (m.k === 'ps') this.inv.onPlayerState(from, m.s);
    } else {
      if (m.k === 'start') {
        if (this.inv) return;
        this.launch(m.setup, { net, localPid: net.localPid, roster: m.roster });
        return;
      }
      if (!this.inv) return;
      if (m.k === 'ev') this.inv.apply(m.ev);
      else if (m.k === 'gs') {
        this.inv.onGhostState(m.g);
        for (const pid in m.p) this.inv.onPlayerState(Number(pid), m.p[pid]);
      }
    }
  }

  async teamSheet() {
    const net = await this.ensureNet();
    if (!net) return;
    this.ui.openSheet('Team Up', { name: 'team', wide: true });
    this.renderTeam();
  }

  renderTeam() {
    const net = this.net;
    const body = this.ui.sheetBody;
    body.innerHTML = '';
    if (net.state === 'off') {
      body.append(h('p', 'Investigate together with up to four investigators. One phone hosts; friends join with the code. Everyone needs an internet connection; being on the same Wi-Fi helps.'));
      if (this.teamError) { body.append(h('p.small', { style: { color: 'var(--warn)' } }, this.teamError)); this.teamError = null; }
      const host = h('button.big', { type: 'button', style: { width: '100%' } }, 'Host a team');
      host.addEventListener('click', () => { this.audio.play('ui'); net.host(this.me()); this.renderTeam(); });
      body.append(host);
      body.append(h('h3', 'Join a team'));
      const inp = h('input.codein', { type: 'text', maxlength: 5, placeholder: 'CODE', 'aria-label': 'Team code', autocomplete: 'off', autocapitalize: 'characters' });
      inp.addEventListener('input', () => { inp.value = cleanCode(inp.value); });
      const join = h('button.btn.primary', { type: 'button', style: { width: '100%', marginTop: '10px' } }, 'Join');
      const go = () => { this.audio.play('ui'); net.join(inp.value, this.me()); this.renderTeam(); };
      join.addEventListener('click', go);
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
      body.append(inp, join);
      body.append(h('h3', 'In a team you can'));
      body.append(h('ul.tells', { html: ['Talk over the team radio (quick calls or typed messages)', 'Share evidence: anything one of you finds goes in everyone’s journal', 'See each other’s photos', 'Split up to search different rooms', 'Complete objectives together, and escape together: the case ends when everyone is back at the van'].map((t) => `<li>${t}</li>`).join('') }));
      return;
    }
    if (net.state === 'starting' || net.state === 'joining') {
      body.append(h('p.muted', net.state === 'starting' ? 'Setting up your team…' : `Joining ${net.code}…`));
      const cancel = h('button.btn', { type: 'button' }, 'Cancel');
      cancel.addEventListener('click', () => { net.leave(); this.renderTeam(); });
      body.append(cancel);
      return;
    }
    // lobby
    body.append(h('p.muted.small', net.isHost ? 'Share this code with up to three friends:' : 'You’re in the team. The host picks the case.'));
    body.append(h('div.code', net.code));
    const roster = h('div.roster');
    for (let i = 0; i < MAX_TEAM; i++) {
      const p = net.roster[i];
      if (p) roster.append(h('div.slot4', { html: `${avatar(p.uniform, 44)}<div><b>${escapeHtml(p.name)}</b><small>Level ${p.level || 1}${p.pid === 0 ? ' · Host' : ''}${p.pid === net.localPid ? ' · You' : ''}</small></div>` }));
      else roster.append(h('div.slot4.empty', 'Waiting for an investigator…'));
    }
    body.append(roster);
    body.append(h('h3', 'Team radio'));
    const log = h('div.chatlog');
    body.append(log);
    this.ui.renderChatLog(log);
    const row = h('div.chatin', { style: { marginTop: '8px' } });
    const inp = h('input', { type: 'text', maxlength: 120, placeholder: 'Say hi…', 'aria-label': 'Message' });
    const send = h('button.btn.primary', { type: 'button' }, 'Send');
    const fire = () => { const t = inp.value.trim(); if (t) { net.lobbyChat(t); inp.value = ''; } };
    send.addEventListener('click', fire);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') fire(); });
    row.append(inp, send);
    body.append(row);
    if (net.isHost) {
      const go = h('button.big', { type: 'button', style: { width: '100%', marginTop: '16px' } }, net.peers() ? `Choose a case for ${net.roster.length} investigators` : 'Choose a case');
      go.addEventListener('click', () => this.ui.caseBoard());
      body.append(go);
    } else body.append(h('p.small.muted', { style: { marginTop: '14px' } }, 'Waiting for the host to start an investigation…'));
    const leave = h('button.btn.warn', { type: 'button', style: { width: '100%', marginTop: '10px' } }, net.isHost ? 'Close team' : 'Leave team');
    leave.addEventListener('click', () => { net.leave(); this.renderTeam(); });
    body.append(leave);
  }
}

const app = new App();
app.boot().catch((e) => {
  console.error(e);
  const tip = document.getElementById('boot-tip');
  if (tip) tip.textContent = 'Something went wrong while loading. Please reload the page.';
});
