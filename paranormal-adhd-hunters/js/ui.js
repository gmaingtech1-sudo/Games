/* ParanormalADHDhunters — everything on screen that isn't the 3D world:
   the HUD, menus, journal, map, story scenes, report and settings. */
import { h, $, $$, escapeHtml, fmtTime } from './util.js';
import { icon, logo, emblem, rankBadge, achievementBadge, avatar, ghostArt, countyMap, sigil } from './art.js';
import {
  BRAND, TAGLINE, EVIDENCE, EVIDENCE_ORDER, FUTURE_EVIDENCE, GHOSTS, PLAYABLE_GHOSTS, ALL_GHOSTS, EQUIPMENT, EQUIP_ORDER,
  TOOLS, SPIRIT_QUESTIONS, LOCATIONS, CREW, CHAPTERS, CLUES, NOTEBOOK, DIFFICULTY, RANKS, xpToNext, UNIFORMS, ACHIEVEMENTS,
  LOADING_TIPS,
} from './data.js';
import { ROOMS, LAYER, layerOfY } from './house.js';

const EV_ICON = { emf: 'emf', freeze: 'freeze', voice: 'voice', photo: 'photo', moving: 'moving' };
const SLOT_KEYS = { flashlight: 'F', emf: '1', thermo: '2', spirit: '3', camera: '4' };

export function who(key, big = false) {
  const c = CREW[key];
  const col = c ? c.color : key === 'ghost' ? '#ff9bd2' : '#e9f0ff';
  const ini = c ? c.name.split(' ').map((w) => w[0]).join('') : key === 'ghost' ? '??' : 'ME';
  return `<span class="who${big ? ' lg' : ''}" style="background:${col}">${ini}</span>`;
}

/* ------------------------------------------------------------------ */
/* HUD                                                                 */
/* ------------------------------------------------------------------ */

class HUD {
  constructor(ui) {
    this.ui = ui;
    this.el = $('#hud');
    this.nerveBar = $('#nerve-bar');
    this.nerveVal = $('#nerve-val');
    this.objEl = $('#objectives');
    this.prompt = null;
    this.expanded = false;
    $('#btn-map').innerHTML = icon('map');
    $('#btn-journal').insertAdjacentHTML('afterbegin', icon('journal'));
    $('#btn-chat').innerHTML = icon('chat');
    $('#btn-pause').innerHTML = icon('pause');
    $('#btn-use .ic-wrap').innerHTML = icon('snap');
    $('#btn-interact .ic-wrap').innerHTML = icon('hand');
    const bar = $('#hotbar');
    for (const id of ['flashlight', ...TOOLS]) {
      const b = h(`button.slot${id === 'flashlight' ? '.torch' : ''}`, { type: 'button', 'aria-label': EQUIPMENT[id].name, dataset: { tool: id } });
      b.innerHTML = icon(id) + `<span class="k">${SLOT_KEYS[id]}</span>`;
      bar.append(b);
    }
    this.objEl.addEventListener('click', () => { this.expanded = !this.expanded; this.renderObjectives(); });
  }

  show(on) { this.el.hidden = !on; }

  setNerve(v) {
    const r = Math.round(v);
    if (r === this.lastNerve) return;
    this.lastNerve = r;
    this.nerveVal.textContent = r;
    this.nerveBar.style.strokeDashoffset = 113.1 * (1 - v / 100);
    this.nerveBar.style.stroke = v > 60 ? '#7fe3ff' : v > 30 ? '#b388ff' : '#ff5d7a';
  }

  setObjectives(list) { this.objectives = list; this.renderObjectives(); }

  renderObjectives() {
    const list = this.objectives || [];
    const main = list.filter((o) => !o.side && !o.optional);
    const show = this.expanded ? list : main.filter((o) => !o.done).slice(0, 2).concat(main.filter((o) => o.urgent));
    const uniq = [...new Set(show)];
    const left = list.length - uniq.length;
    this.objEl.innerHTML = `<ul>${uniq.map((o) => `<li class="${o.done ? 'done' : ''} ${o.side || o.optional ? 'side' : ''} ${o.urgent ? 'urgent' : ''}">${escapeHtml(o.text)}</li>`).join('')}</ul>${!this.expanded && left > 0 ? `<div class="more">+${left} more · tap</div>` : ''}`;
  }

  setPrompt(p) {
    const key = p ? p.label : '';
    if (key === this.prompt) return;
    this.prompt = key;
    const b = $('#btn-interact');
    $('#crosshair').classList.toggle('target', !!p);
    if (!p) { b.hidden = true; return; }
    b.hidden = false;
    $('#btn-interact .ic-wrap').innerHTML = icon(p.icon === 'van' ? 'van' : p.icon === 'lock' ? 'lock' : p.icon === 'bulb' ? 'bulb' : p.icon === 'hide' ? 'hide' : p.icon === 'page' ? 'page' : p.icon === 'door' ? 'door' : 'hand');
    $('#btn-interact b').textContent = p.label;
  }

  setUse(label) {
    if (label === this.useLabel) return;
    this.useLabel = label;
    const b = $('#btn-use');
    b.hidden = !label;
    if (label) {
      $('#btn-use b').textContent = label;
      $('#btn-use .ic-wrap').innerHTML = icon(label === 'Snap' ? 'camera' : 'ask');
    }
  }

  setTool(id) { $$('.slot', $('#hotbar')).forEach((b) => b.classList.toggle('sel', b.dataset.tool === id)); }

  setFlash(on) { $('.slot.torch').classList.toggle('on', on); }

  setReadout(txt, cls) {
    if (txt === this.rTxt && cls === this.rCls) return;
    this.rTxt = txt; this.rCls = cls;
    const r = $('#readout');
    r.textContent = txt;
    r.className = `readout ${cls || ''}`;
  }

  setEvidenceCount(n) {
    const b = $('#ev-count');
    b.hidden = !n;
    b.textContent = n;
  }

  setTeam(list) {
    const el = $('#team-list');
    if (!list || list.length < 2) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = list.map((p) => `<div class="tm ${p.me ? 'me' : ''} ${p.gone ? 'gone' : ''}">${escapeHtml(p.name)}<i><b style="width:${p.nerve == null ? 100 : p.nerve}%"></b></i></div>`).join('');
  }

  setVan(at) { $('#van-chip').hidden = !at; }

  setReady(names, total) {
    const el = $('#ready-chip');
    if (!names.length || total < 2) { el.hidden = true; return; }
    el.hidden = false;
    el.textContent = `At the van: ${names.length}/${total} · ${names.join(', ')}`;
  }
}

/* ------------------------------------------------------------------ */
/* UI                                                                  */
/* ------------------------------------------------------------------ */

export class UI {
  constructor(app) {
    this.app = app;
    this.hud = new HUD(this);
    this.sheetEl = $('#sheet');
    this.sheetBody = $('#sheet-body');
    $('#sheet-x').innerHTML = icon('close');
    this.sheetEl.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]') && this.sheetClosable) this.closeSheet();
    });
    $('#boot-logo').innerHTML = logo({ width: 320 });
    $('#menu-logo').innerHTML = logo({ width: 340 });
    $('#loading-emblem').innerHTML = emblem(110);
    $$('[data-icon]').forEach((el) => { el.outerHTML = icon(el.dataset.icon); });
    $('.fx-spook .spook-face').innerHTML = '';
    this.radioQueue = [];
    this.chatLog = [];
  }

  /* ---------- sheets ---------- */

  openSheet(title, opts = {}) {
    this.sheetEl.hidden = false;
    this.sheetEl.classList.toggle('wide', !!opts.wide);
    $('#sheet-title').innerHTML = title;
    this.sheetClosable = opts.closable !== false;
    $('#sheet-x').hidden = !this.sheetClosable;
    this.onSheetClose = opts.onClose || null;
    const tabs = $('#sheet-tabs');
    tabs.innerHTML = '';
    tabs.hidden = !opts.tabs;
    if (opts.tabs) {
      for (const [id, label] of opts.tabs) {
        const b = h('button', { type: 'button', dataset: { tab: id } }, label);
        b.addEventListener('click', () => { this.app.audio.play('ui'); $$('button', tabs).forEach((x) => x.classList.toggle('on', x === b)); opts.onTab(id); });
        tabs.append(b);
      }
      const first = opts.tab || opts.tabs[0][0];
      $$('button', tabs).forEach((x) => x.classList.toggle('on', x.dataset.tab === first));
    }
    this.sheetBody.innerHTML = '';
    this.sheetBody.scrollTop = 0;
    this.sheetOpen = opts.name || title;
    this.app.onSheet(true);
    return this.sheetBody;
  }

  closeSheet() {
    if (this.sheetEl.hidden) return;
    this.sheetEl.hidden = true;
    this.sheetOpen = null;
    const cb = this.onSheetClose;
    this.onSheetClose = null;
    this.app.onSheet(false);
    if (cb) cb();
  }

  /* ---------- boot ---------- */

  bootProgress(p, text) {
    $('#boot-fill').style.width = `${Math.round(p * 100)}%`;
    if (text) $('#boot-tip').textContent = text;
  }

  bootReady(onBegin) {
    $('#boot-tip').textContent = LOADING_TIPS[Math.floor(Math.random() * LOADING_TIPS.length)];
    const b = $('#btn-begin');
    b.hidden = false;
    b.addEventListener('click', () => onBegin(), { once: true });
  }

  hideBoot() { $('#boot').hidden = true; }

  /* ---------- loading ---------- */

  showLoading(title) {
    $('#loading').hidden = false;
    $('#loading-title').textContent = title;
    $('#loading-tip').textContent = LOADING_TIPS[Math.floor(Math.random() * LOADING_TIPS.length)];
    $('#loading-fill').style.width = '0%';
  }

  loadingProgress(p) { $('#loading-fill').style.width = `${Math.round(p * 100)}%`; }

  hideLoading() { $('#loading').hidden = true; }

  fade(on) { $('#fade').classList.toggle('on', on); }

  /* ---------- main menu ---------- */

  showMenu(on = true) {
    $('#menu').hidden = !on;
    if (on) this.refreshMenu();
  }

  refreshMenu() {
    const p = this.app.profile, d = p.d;
    const r = p.rank();
    const need = xpToNext(d.level);
    $('#menu-profile').innerHTML = `${rankBadge(r, 40)}<div><b>${escapeHtml(d.name)}</b><small>Level ${d.level} · ${r.name}</small><div class="xp"><i style="width:${(d.xp / need) * 100}%"></i></div></div>`;
    $('#menu-coins').innerHTML = `${icon('coin')}${d.coins.toLocaleString()}`;
    const ch = CHAPTERS[0];
    const next = p.nextCase();
    $('#menu-story').innerHTML = next
      ? `<small>Chapter 1 · ${ch.title}</small><b>Case ${p.d.story.caseIndex + 1}: ${next.title}</b>`
      : `<small>Chapter 1 complete</small><b>One light is lit. Seven remain.</b><br><span class="muted small">Free investigations at Wren Lane are open. Chapter 2 is coming in a future update.</span>`;
    const dailies = p.dailies();
    $('#daily-dot').hidden = dailies.every((c) => c.claimed);
  }

  /* ---------- case board ---------- */

  caseBoard(tab = 'story') {
    this.openSheet('Case Board', {
      tabs: [['story', 'Story'], ['free', 'Free investigation'], ['map', 'Locations']], tab,
      onTab: (t) => this.renderCaseBoard(t), wide: true, name: 'cases',
    });
    this.renderCaseBoard(tab);
  }

  renderCaseBoard(tab) {
    const body = this.sheetBody;
    const p = this.app.profile;
    body.innerHTML = '';
    const ch = CHAPTERS[0];
    if (tab === 'story') {
      body.append(h('p.casefile', `CHAPTER ONE · ${ch.title.toUpperCase()} · 13 WREN LANE`));
      ch.cases.forEach((c, i) => {
        const done = i < p.d.story.caseIndex, next = i === p.d.story.caseIndex, locked = i > p.d.story.caseIndex;
        const b = h(`button.case${done ? '.done' : ''}${next ? '.next' : ''}${locked ? '.locked' : ''}`, { type: 'button' });
        b.innerHTML = `<span class="num">${done ? '✓' : i + 1}</span><div><b>${c.title}</b><small>${done ? 'Solved · tap to replay' : next ? 'Your next case' : 'Solve the previous case first'}</small></div>${next ? icon('play') : ''}`;
        if (!locked) b.addEventListener('click', () => this.briefing(c, done));
        body.append(b);
      });
      if (p.storyComplete()) {
        body.append(h('div.hook', { html: `Chapter 1 complete. One light is lit, seven remain.<br><small class="muted">Chapter 2, The Marlowe Grand (Haunted Hotel), is coming in a future update.</small>` }));
      } else body.append(h('p.muted.small', 'Each story case is a full investigation, and each one has a clue to find before the story moves on.'));
      const archive = [...p.d.story.clues, ...p.d.story.notebook];
      if (archive.length) {
        body.append(h('h3', 'Case archive'));
        for (const k of archive) {
          const b = h('button.case', { type: 'button' });
          b.innerHTML = `<span class="num">${icon('page')}</span><div><b>${CLUES[k].title}</b><small>Tap to read</small></div>`;
          b.addEventListener('click', () => this.clueCard(CLUES[k], () => this.caseBoard('story')));
          body.append(b);
        }
      }
    } else if (tab === 'free') {
      const unlocked = p.d.story.caseIndex >= 1;
      body.append(h('div.card', { html: `<div class="row"><span class="num">${icon('ghost')}</span><div><b style="font-family:var(--display)">Abandoned House</b><br><span class="muted small">13 Wren Lane · a random ghost and a random ghost room every time.</span></div></div>` }));
      if (!unlocked) { body.append(h('p.muted', 'Solve Case 1, “First Night”, to unlock free investigations.')); return; }
      const found = p.d.story.notebook.length;
      if (found < NOTEBOOK.length) body.append(h('p.small.muted', `Sam Halloway’s notebook pages are hidden around the house: ${found}/${NOTEBOOK.length} found.`));
      body.append(this.diffPicker());
      if (p.d.story.caseIndex >= 2) body.append(h('p.small.muted', 'The cellar is open now. The ghost might be down there.'));
      const go = h('button.big', { type: 'button', style: { width: '100%', marginTop: '14px' } }, 'Start investigation');
      go.addEventListener('click', () => { this.closeSheet(); this.app.startCase(null); });
      body.append(go);
    } else {
      const lit = p.storyComplete() ? 1 : 0;
      const wrap = h('div', { html: countyMap({ lit, reveal: p.storyComplete() }) });
      body.append(wrap);
      const info = h('div.card', { html: '<span class="muted">Tap a location.</span>' });
      body.append(info);
      $$('.pin', wrap).forEach((pin) => pin.addEventListener('click', () => {
        const l = LOCATIONS.find((x) => x.id === pin.dataset.loc);
        info.innerHTML = `<b style="font-family:var(--display)">${l.name}</b> <span class="pill ${l.playable ? 'good' : ''}">${l.playable ? 'Open' : `Chapter ${l.chapter} · sealed`}</span><br><span class="muted small">${l.place}</span><p class="small">${l.blurb}</p>${l.playable ? '' : '<p class="small muted">This case file is sealed. It opens in a future chapter.</p>'}`;
      }));
      body.append(h('p.small.muted', p.storyComplete() ? 'The Order of the Lantern linked eight places across the county. Wren Lane was the first light.' : 'Eight places, all on the team’s list of reported hauntings. Only one case file is open so far.'));
    }
  }

  diffPicker() {
    const p = this.app.profile;
    const wrap = h('div');
    wrap.append(h('h3', 'Difficulty'));
    const row = h('div.diff');
    for (const id of Object.keys(DIFFICULTY)) {
      const d = DIFFICULTY[id];
      const ok = p.d.level >= d.level;
      const b = h(`button${p.d.diff === id ? '.on' : ''}`, { type: 'button', disabled: !ok }, [h('b', d.name), ok ? d.desc : `Unlocks at level ${d.level}`]);
      b.addEventListener('click', () => { p.d.diff = id; p.save(); $$('button', row).forEach((x) => x.classList.toggle('on', x === b)); this.app.audio.play('ui'); });
      row.append(b);
    }
    wrap.append(row);
    return wrap;
  }

  briefing(caseDef, replay = false) {
    const p = this.app.profile;
    const idx = CHAPTERS[0].cases.indexOf(caseDef);
    const body = this.openSheet(`Case ${idx + 1}: ${caseDef.title}`, { wide: true, name: 'brief', onClose: () => {} });
    body.append(h('p.casefile', `CASE FILE 00${idx + 1} · 13 WREN LANE · ${replay ? 'REPLAY' : 'OPEN'}`));
    const dlg = h('div.dialog');
    caseDef.brief.forEach(([k, t], i) => {
      const line = h('div.line', { html: `${who(k, true)}<div class="bubble"><b style="color:${CREW[k].color}">${CREW[k].name}</b>${escapeHtml(t)}</div>`, style: { animationDelay: `${i * 0.15}s` } });
      dlg.append(line);
    });
    body.append(dlg);
    body.append(h('h3', 'Your kit'));
    const lo = h('div.loadout');
    for (const id of ['flashlight', ...TOOLS]) lo.append(h('span', { html: `${icon(id)}${EQUIPMENT[id].name} <small class="muted">${EQUIPMENT[id].tiers[p.d.tiers[id] || 0].label}</small>` }));
    body.append(lo);
    body.append(this.diffPicker());
    if (this.app.net && this.app.net.isHost && this.app.net.peers() > 0) body.append(h('p.small.muted', `Your team of ${this.app.net.peers() + 1} will start together.`));
    const go = h('button.big', { type: 'button', style: { width: '100%', marginTop: '16px' } }, replay ? 'Replay case' : 'Start investigation');
    go.addEventListener('click', () => { this.closeSheet(); this.app.startCase(caseDef, { replay }); });
    body.append(go);
  }

  /* ---------- story scenes ---------- */

  story(lines, opts = {}) {
    const body = this.openSheet(opts.title || 'Radio', { wide: true, closable: false, name: 'story' });
    if (opts.kicker) body.append(h('p.casefile', opts.kicker));
    const dlg = h('div.dialog');
    body.append(dlg);
    const btn = h('button.big', { type: 'button', style: { width: '100%', marginTop: '16px' } }, 'Next');
    let i = 0;
    const step = () => {
      if (i < lines.length) {
        const [k, t] = lines[i++];
        const c = CREW[k];
        const name = c ? c.name : k === 'ghost' ? 'Unknown signal' : 'You';
        const col = c ? c.color : '#ff9bd2';
        dlg.append(h(`div.line${k === 'ghost' ? '.ghost' : ''}`, { html: `${who(k, true)}<div class="bubble"><b style="color:${col}">${name}</b>${escapeHtml(t)}</div>` }));
        if (k === 'ghost') this.app.audio.play('answer', {}); else this.app.audio.play('radio');
        body.scrollTop = body.scrollHeight;
        if (i >= lines.length) {
          if (opts.hook) dlg.append(h('div.hook', opts.hook));
          if (opts.extra) dlg.append(opts.extra);
          btn.textContent = opts.done || 'Continue';
          body.scrollTop = body.scrollHeight;
        }
      } else { this.closeSheet(); if (opts.onDone) opts.onDone(); }
    };
    btn.addEventListener('click', step);
    body.append(btn);
    step();
  }

  /* ---------- how to play ---------- */

  howToPlay() {
    const body = this.openSheet('How to play', { wide: true, name: 'help' });
    const step = (n, ic, title, text) => h('div.card', { style: { marginBottom: '8px' }, html: `<div class="gear"><span class="gi">${icon(ic)}</span><div class="txt"><b>${n}. ${title}</b><br><small class="muted">${text}</small></div></div>` });
    body.append(
      step(1, 'hand', 'Explore', 'Drag on the left side of the screen to walk, and swipe on the right side to look around. The round button uses whatever you’re looking at: doors, light switches, wardrobes, pages, the van. Switch your flashlight on with the torch button.'),
      step(2, 'thermo', 'Find the ghost room', 'The ghost room is the coldest room in the house. Hold the thermometer and walk from room to room. Odd noises and things moving give it away too.'),
      step(3, 'emf', 'Collect evidence', 'Each ghost shows three kinds of evidence. Your equipment logs them in the journal automatically:'),
    );
    body.append(h('div.ev-icons', { style: { margin: '-2px 0 10px 66px' }, html: EVIDENCE_ORDER.map((e) => `<span>${icon(EV_ICON[e])}${EVIDENCE[e].name}</span>`).join('') }));
    body.append(
      step(4, 'journal', 'Identify the ghost', 'Open the journal to see which ghosts still fit your evidence, and tap the one you think it is. How the ghost behaves is a clue too: check the Ghost guide.'),
      step(5, 'heart', 'Keep your nerve', 'Darkness and scares lower your nerve. Lit rooms steady it and resting by the van restores it. When nerves run low the ghost may surge: keep away from it or hide in a wardrobe until it calms down.'),
      step(6, 'van', 'Head back to the van', 'Tap the van to finish. The report shows if you were right, and pays out coins and XP for evidence, photos, objectives and clues.'),
    );
    body.append(h('h3', 'On a computer'));
    body.append(h('p.small.muted', 'WASD or arrow keys to walk (Shift to run). Click to look with the mouse. E to use, F flashlight, 1 to 4 equipment, Q or Space to snap or ask, J journal, M map, Esc pause.'));
    const b = h('button.big', { type: 'button', style: { width: '100%', marginTop: '10px' } }, 'Got it');
    b.addEventListener('click', () => this.closeSheet());
    body.append(b);
  }

  /* ---------- profile ---------- */

  profileSheet() {
    const body = this.openSheet('Investigator', { wide: true, name: 'profile', onClose: () => this.refreshMenu() });
    this.renderProfile(body);
  }

  renderProfile(body) {
    const p = this.app.profile, d = p.d;
    const r = p.rank(), nr = p.nextRank();
    body.innerHTML = '';
    const card = h('div.idcard');
    card.innerHTML = `${avatar(d.uniform, 86, d.name)}<div style="flex:1;min-width:0"><span class="casefile">${BRAND.toUpperCase()} · FIELD ID</span><input id="name-in" maxlength="16" value="${escapeHtml(d.name)}" aria-label="Your name"><div class="row" style="margin-top:8px">${rankBadge(r, 44)}<div><b>${r.name}</b><br><small class="muted">Level ${d.level} · ${d.xp}/${xpToNext(d.level)} XP${nr ? ` · ${nr.name} at level ${nr.level}` : ''}</small></div></div></div>`;
    body.append(card);
    $('#name-in', card).addEventListener('change', (e) => { d.name = e.target.value.trim().slice(0, 16) || 'Investigator'; p.save(); });
    body.append(h('h3', 'Uniform'));
    const uni = h('div.uniforms');
    for (const u of UNIFORMS) {
      const own = d.uniforms.includes(u.id);
      const can = d.level >= u.level;
      const b = h(`button${d.uniform === u.id ? '.on' : ''}`, { type: 'button' });
      b.innerHTML = `${avatar(u.id, 54)}<b>${u.name}</b><small class="muted">${own ? (d.uniform === u.id ? 'Wearing' : 'Wear') : can ? `${icon('coin', 'tiny')} ${u.cost}` : `Level ${u.level}`}</small>`;
      b.addEventListener('click', () => {
        if (own) { d.uniform = u.id; p.save(); this.app.audio.play('confirm'); this.app.onUniform(); }
        else if (can && p.buyUniform(u.id)) { d.uniform = u.id; p.save(); this.app.audio.play('coin'); this.app.onUniform(); }
        else { this.app.audio.play('ui'); this.toastMenu(can ? 'Not enough coins yet.' : `Reach level ${u.level} to unlock this uniform.`); return; }
        this.renderProfile(body);
      });
      uni.append(b);
    }
    body.append(uni);
    body.append(h('h3', 'Ranks'));
    const ranks = h('div.row.wrap');
    for (const x of RANKS) ranks.append(h('div', { style: { textAlign: 'center', width: '72px', opacity: d.level >= x.level ? 1 : 0.35 }, html: `${rankBadge(x, 48)}<div class="small">${x.name}</div><small class="muted">Lv ${x.level}</small>` }));
    body.append(ranks);
    body.append(h('h3', 'Stats'));
    const s = d.stats;
    const stats = [['Investigations', s.investigations], ['Correct calls', s.correct], ['Evidence found', s.evidence], ['Photos', s.photos], ['Ghost photos', s.ghostPhotos], ['Spirit answers', s.answers], ['Times spooked', s.spooks], ['Fastest solve', s.fastest ? fmtTime(s.fastest) : '—']];
    body.append(h('div.stats', { html: stats.map(([k, v]) => `<div class="stat"><b>${v}</b><small>${k}</small></div>`).join('') }));
    if (d.history.length) {
      body.append(h('h3', 'Case history'));
      body.append(h('ul.history', { html: d.history.map((x) => `<li>${x.photo ? `<img src="${x.photo}" alt="">` : `<span style="width:56px;text-align:center">${icon('page')}</span>`}<div style="flex:1"><b>${escapeHtml(x.title)}</b><br><small class="muted">${new Date(x.date).toLocaleDateString()} · ${GHOSTS[x.ghost].name} · ${DIFFICULTY[x.diff] ? DIFFICULTY[x.diff].name : ''}</small></div><span class="pill ${x.correct ? 'good' : 'warn'}">${x.correct ? 'Solved' : 'Missed'}</span></li>`).join('') }));
    }
  }

  toastMenu(text) {
    const pop = $('#modal-toast');
    pop.hidden = false;
    pop.innerHTML = `<div style="padding:6px 8px">${escapeHtml(text)}</div>`;
    clearTimeout(this.popT);
    this.popT = setTimeout(() => { pop.hidden = true; }, 2200);
  }

  /* ---------- equipment ---------- */

  equipmentSheet() {
    const body = this.openSheet('Equipment', { wide: true, name: 'equipment', onClose: () => this.refreshMenu() });
    this.renderEquipment(body);
  }

  renderEquipment(body) {
    const p = this.app.profile;
    body.innerHTML = '';
    body.append(h('div.coins', { style: { display: 'inline-flex', marginBottom: '8px' }, html: `${icon('coin')}${p.d.coins.toLocaleString()} coins` }));
    body.append(h('p.small.muted', 'Juno keeps the van stocked. Upgrades last forever and come with you on every case.'));
    const list = h('div.stack');
    for (const id of EQUIP_ORDER) {
      const e = EQUIPMENT[id];
      const card = h(`div.card${e.active ? '' : '.locked'}`);
      if (!e.active) {
        card.innerHTML = `<div class="gear"><span class="gi">${icon(id)}</span><div class="txt"><b>${e.name}</b> <span class="pill">Coming soon</span><br><small class="muted">${e.desc}</small></div></div>`;
      } else {
        const t = p.d.tiers[id] || 0;
        const cur = e.tiers[t], next = e.tiers[t + 1];
        card.innerHTML = `<div class="gear"><span class="gi">${icon(id)}</span><div class="txt"><b>${e.name}</b> <span class="pill">${cur.label}</span><div class="tiers">${e.tiers.map((_, i) => `<i class="${i <= t ? 'on' : ''}"></i>`).join('')}</div><small class="muted">${e.desc}</small><br><small>${cur.desc}</small></div></div>`;
        if (next) {
          const b = h('button.btn.primary', { type: 'button', style: { marginTop: '10px', width: '100%' }, disabled: p.d.coins < next.cost }, `Upgrade to ${next.label} · ${next.cost} coins`);
          b.addEventListener('click', () => {
            if (p.upgrade(id)) {
              this.app.audio.play('level');
              const a = t + 1 >= 2 ? p.unlock('upgrade') : null;
              if (a) { this.achievement(a); p.save(); }
              this.app.onTiers();
              this.renderEquipment(body);
            }
          });
          card.append(h('small.muted', { style: { display: 'block', marginTop: '6px' } }, `Next: ${next.desc}`), b);
        } else card.append(h('p.small', { style: { color: 'var(--gold)', margin: '8px 0 0' } }, 'Fully upgraded'));
      }
      list.append(card);
    }
    body.append(list);
  }

  /* ---------- achievements / daily ---------- */

  achievementsSheet() {
    const p = this.app.profile;
    const body = this.openSheet('Badges', { wide: true, name: 'ach' });
    const n = Object.keys(p.d.achievements).length;
    body.append(h('p.muted', `${n} of ${ACHIEVEMENTS.length} badges earned.`));
    const grid = h('div.ach-grid');
    for (const a of ACHIEVEMENTS) {
      const got = !!p.d.achievements[a.id];
      grid.append(h(`div.ach${got ? '' : '.locked'}`, { html: `${achievementBadge(a, got, 64)}<b>${a.name}</b><small>${a.desc}</small><span class="pill ${got ? 'good' : ''}">${got ? 'Earned' : `+${a.xp} XP`}</span>` }));
    }
    body.append(grid);
  }

  dailySheet() {
    const p = this.app.profile;
    const body = this.openSheet('Daily Challenges', { name: 'daily', onClose: () => this.refreshMenu() });
    body.append(h('p.muted.small', 'Three new challenges every day. Progress counts across all your investigations today.'));
    const list = h('div.stack');
    for (const c of p.dailies()) {
      list.append(h(`div.card${c.claimed ? '.on' : ''}`, { html: `<div class="daily">${icon(c.claimed ? 'check' : 'sun')}<div style="flex:1"><b>${escapeHtml(c.label)}</b><br><small class="muted">${c.coins} coins · ${c.xp} XP</small><div class="bar"><i style="width:${(Math.min(c.have, c.n) / c.n) * 100}%"></i></div></div><span class="pill ${c.claimed ? 'good' : 'gold'}">${c.claimed ? 'Done' : `${Math.min(c.have, c.n)}/${c.n}`}</span></div>` }));
    }
    body.append(list);
    body.append(h('p.small.muted', p.d.daily.bonus ? 'All three done today! Bonus collected.' : 'Finish all three for a bonus of 150 coins.'));
  }

  /* ---------- settings ---------- */

  settingsSheet() {
    const p = this.app.profile, s = p.settings;
    const body = this.openSheet('Settings', { name: 'settings' });
    const range = (key, label, min, max, step, hint) => {
      const row = h('div.set', { html: `<label>${label}${hint ? `<small>${hint}</small>` : ''}</label>` });
      const inp = h('input', { type: 'range', min, max, step, value: s[key], 'aria-label': label });
      inp.addEventListener('input', () => { s[key] = Number(inp.value); this.app.applySettings(); });
      inp.addEventListener('change', () => p.save());
      row.append(inp);
      return row;
    };
    const toggle = (key, label, hint) => {
      const row = h('div.set', { html: `<label>${label}${hint ? `<small>${hint}</small>` : ''}</label>` });
      const b = h(`button.toggle${s[key] ? '.on' : ''}`, { type: 'button', role: 'switch', 'aria-checked': String(!!s[key]), 'aria-label': label });
      b.addEventListener('click', () => { s[key] = !s[key]; b.classList.toggle('on', s[key]); b.setAttribute('aria-checked', String(s[key])); p.save(); this.app.applySettings(); this.app.audio.play('ui'); });
      row.append(b);
      return row;
    };
    body.append(h('h3', 'Sound'));
    body.append(range('master', 'Volume', 0, 1, 0.05), range('sfx', 'Effects', 0, 1, 0.05), range('amb', 'Ambience & music', 0, 1, 0.05));
    body.append(toggle('voice', 'Spirit voices', 'Spirit box answers are spoken aloud as well as shown.'));
    body.append(h('h3', 'Controls'));
    body.append(range('sens', 'Look sensitivity', 0.3, 2.2, 0.05));
    body.append(toggle('invertY', 'Invert look up/down'));
    body.append(toggle('lefty', 'Left-handed', 'Buttons on the left, joystick on the right.'));
    body.append(toggle('vibrate', 'Vibration'));
    body.append(h('h3', 'Graphics & comfort'));
    const q = h('div.set', { html: '<label>Graphics<small>Lower settings run smoother on older phones. Changes apply after a restart.</small></label>' });
    const seg = h('div.seg');
    for (const id of ['low', 'med', 'high']) {
      const b = h(`button${s.quality === id ? '.on' : ''}`, { type: 'button' }, id === 'med' ? 'Medium' : id[0].toUpperCase() + id.slice(1));
      b.addEventListener('click', () => { s.quality = id; p.save(); $$('button', seg).forEach((x) => x.classList.toggle('on', x === b)); this.toastMenu('Restart the game to apply the new graphics setting.'); });
      seg.append(b);
    }
    q.append(seg);
    body.append(q);
    body.append(toggle('reduceFlash', 'Reduce flashing', 'Calmer flickering lights and a softer camera flash.'));
    body.append(h('h3', 'About'));
    body.append(h('p.small.muted', { html: `${BRAND}: ${TAGLINE} Every picture and sound in the game is made in code. Built with <a href="https://threejs.org" style="color:var(--lilac)">three.js</a>; team play uses <a href="https://peerjs.com" style="color:var(--lilac)">PeerJS</a>.` }));
    const reset = h('button.btn.warn', { type: 'button', style: { marginTop: '10px' } }, 'Reset all progress');
    reset.addEventListener('click', () => {
      if (reset.dataset.sure) { p.reset(); this.closeSheet(); this.refreshMenu(); this.toastMenu('Progress reset.'); return; }
      reset.dataset.sure = '1';
      reset.textContent = 'Tap again to erase everything';
    });
    body.append(reset);
  }

  /* ---------- in-game: toasts, radio, effects ---------- */

  toast(text, kind = '') {
    const box = $('#toasts');
    const t = h(`div.toast${kind ? '.' + kind : ''}`, text);
    box.append(t);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => t.classList.add('out'), kind === 'ev' ? 3200 : 2600);
    setTimeout(() => t.remove(), kind === 'ev' ? 3800 : 3200);
  }

  /** Radio messages show one at a time; urgent ones jump the queue. */
  radio(key, text, urgent = false) {
    const c = CREW[key];
    const html = `${who(key)}<div><b style="color:${c ? c.color : '#fff'}">${c ? c.name : ''}</b>${escapeHtml(text)}</div>`;
    this.pushRadio({ cls: urgent ? '.urgent' : '', html, ms: Math.max(4500, text.length * 70) }, urgent);
  }

  radioGhost(text) {
    this.pushRadio({ cls: '.ghost', html: `${who('ghost')}<div><b>SPIRIT BOX</b>…${escapeHtml(text)}…</div>`, ms: 4000 }, true);
  }

  pushRadio(msg, urgent) {
    if (urgent) { this.radioQueue.unshift(msg); this.nextRadio(true); }
    else { this.radioQueue.push(msg); if (!this.radioBusy) this.nextRadio(); }
  }

  nextRadio(force) {
    const box = $('#radio');
    if (this.radioBusy && !force) return;
    clearTimeout(this.radioT);
    box.innerHTML = '';
    const msg = this.radioQueue.shift();
    if (!msg) { this.radioBusy = false; return; }
    this.radioBusy = true;
    box.append(h(`div.radio-msg${msg.cls}`, { html: msg.html }));
    this.radioT = setTimeout(() => { this.radioBusy = false; this.nextRadio(); }, msg.ms);
  }

  clearRadio() {
    this.radioQueue = [];
    clearTimeout(this.radioT);
    this.radioBusy = false;
    $('#radio').innerHTML = '';
    $('#toasts').innerHTML = '';
  }

  evidenceFound(id, by) {
    this.toast(`EVIDENCE: ${EVIDENCE[id].name}${by ? ` (found by ${by})` : ''}`, 'ev');
    const inv = this.app.inv;
    this.hud.setEvidenceCount(inv ? inv.evidence.size : 0);
    if (this.sheetOpen === 'journal') this.journalRefresh();
  }

  achievement(a) {
    const pop = $('#modal-toast');
    pop.hidden = false;
    pop.innerHTML = `${achievementBadge(a, true, 46)}<div><small>Badge earned</small><b>${a.name}</b></div>`;
    this.app.audio.play('level');
    clearTimeout(this.popT);
    this.popT = setTimeout(() => { pop.hidden = true; }, 3200);
  }

  questions(show, cb) {
    const el = $('#questions');
    if (!show || !el.hidden) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = '';
    for (const q of SPIRIT_QUESTIONS) {
      const b = h('button', { type: 'button' }, q);
      b.addEventListener('click', () => { el.hidden = true; cb(q); });
      el.append(b);
    }
  }

  photoFlash(photo) {
    const f = $('.fx-flash');
    f.classList.remove('pop');
    void f.offsetWidth;
    f.classList.add('pop');
    const msg = { ghost: 'Something is in this photo…', object: 'Got the thrown object on camera!', activity: 'Paranormal activity captured.', none: 'Nothing unusual in that one.' }[photo.kind];
    this.toast(`${msg}${photo.coins ? ` +${photo.coins} coins` : ''}`, photo.kind === 'ghost' ? 'good' : '');
  }

  spookFx(type) {
    const s = $('.fx-spook');
    $('.spook-face', s).innerHTML = ghostArt(type, true, 300).replace('class="ghost-art"', 'class="ghost-art" style="width:100%;height:100%"');
    s.classList.remove('on');
    void s.offsetWidth;
    s.classList.add('on');
    setTimeout(() => s.classList.remove('on'), 2700);
  }

  hideOverlay(on) { $('.fx-hide').classList.toggle('on', on); $('#crosshair').hidden = on; }

  surgeFx(on) { $('.fx-surge').classList.toggle('on', on); }

  vignette(t) {
    const v = $('.fx-vignette');
    const o = (0.45 + t * 0.5).toFixed(2);
    if (o !== this.vigO) { this.vigO = o; v.style.opacity = o; }
  }

  /* ---------- clues ---------- */

  clueCard(clue, onClose) {
    const body = this.openSheet(clue.notebook ? 'Notebook page' : 'Clue found', { name: 'clue', onClose });
    const paper = h('div.paper', { html: `<h4>${escapeHtml(clue.title)}</h4>${escapeHtml(clue.text)}` });
    if (/lantern|symbol|mark/i.test(clue.text)) paper.insertAdjacentHTML('beforeend', `<div style="text-align:center;margin-top:10px">${sigil(70, '#5a2a86')}</div>`);
    body.append(paper);
    const b = h('button.big', { type: 'button', style: { width: '100%', marginTop: '14px' } }, onClose ? 'Back' : 'Keep investigating');
    b.addEventListener('click', () => this.closeSheet());
    body.append(b);
  }

  /* ---------- journal ---------- */

  journal(tab = 'evidence') {
    this.journalTab = tab;
    this.openSheet('Evidence Journal', {
      tabs: [['evidence', 'Evidence'], ['guide', 'Ghost guide'], ['photos', 'Photos'], ['kit', 'Kit'], ['notes', 'Notes']], tab,
      onTab: (t) => { this.journalTab = t; this.journalRefresh(); }, name: 'journal', wide: true,
    });
    this.journalRefresh();
  }

  journalRefresh() {
    if (this.sheetOpen !== 'journal') return;
    const inv = this.app.inv;
    if (!inv) return;
    const body = this.sheetBody;
    const keep = body.scrollTop;
    body.innerHTML = '';
    const tab = this.journalTab;
    if (tab === 'evidence') {
      body.append(h('p.small.muted', 'Your equipment logs evidence automatically. Tap evidence you’re sure ISN’T here to rule it out.'));
      for (const id of EVIDENCE_ORDER) {
        const e = EVIDENCE[id];
        const found = inv.evidence.has(id), out = inv.excluded.has(id);
        const b = h(`button.ev-row${found ? '.found' : ''}${out ? '.excluded' : ''}`, { type: 'button' });
        b.innerHTML = `${icon(EV_ICON[id])}<div><b>${e.name}</b><small>${e.how}</small></div><span class="state">${found ? icon('check') : out ? icon('x') : ''}</span>`;
        b.addEventListener('click', () => { if (found) return; if (out) inv.excluded.delete(id); else inv.excluded.add(id); this.app.audio.play('ui'); this.journalRefresh(); });
        body.append(b);
      }
      for (const f of FUTURE_EVIDENCE) body.append(h('div.ev-row.future', { html: `${icon('ghost')}<div><b>${f.name}</b><small>Needs the ${f.tool}. Coming with new locations.</small></div>` }));
      body.append(h('h3', 'Which ghost is it?'));
      for (const g of PLAYABLE_GHOSTS) body.append(this.ghostCard(g, inv));
      body.append(h('h3', 'Not encountered yet'));
      body.append(h('div.row.wrap', { html: ALL_GHOSTS.filter((g) => !GHOSTS[g].playable).map((g) => `<div style="text-align:center;width:84px">${ghostArt(g, false, 56)}<div class="small muted">${GHOSTS[g].name}</div></div>`).join('') }));
    } else if (tab === 'guide') {
      for (const g of PLAYABLE_GHOSTS) {
        const d = GHOSTS[g];
        body.append(h('div.ghost-card', { html: `${ghostArt(g, true, 72)}<div class="info"><b>${d.name}</b><div class="small muted">${d.blurb}</div><ul class="tells">${d.tells.map((t) => `<li>${t}</li>`).join('')}</ul><div class="ev-icons">${d.evidence.map((e) => `<span>${icon(EV_ICON[e])}${EVIDENCE[e].short}</span>`).join('')}</div></div>` }));
      }
      body.append(h('h3', 'Tips'));
      body.append(h('ul.tells', { html: ['The ghost room is always the coldest room. Use the thermometer to find it.', 'Ghosts leave EMF energy where they do something. Check fast, it fades after about 20 seconds.', 'Spirits rarely answer the spirit box with the lights on.', 'If it starts surging, hide in a wardrobe or keep your distance until it calms down.'].map((t) => `<li>${t}</li>`).join('') }));
    } else if (tab === 'photos') {
      const list = inv.photos;
      if (!list.length) body.append(h('p.muted', 'No photos yet. Switch to the camera and tap Snap. Photos of ghosts and thrown objects earn coins.'));
      const grid = h('div.photos');
      list.forEach((ph, i) => grid.append(h(`div.polaroid${ph.kind === 'ghost' ? '.ghost' : ''}`, { style: { '--r': `${(i % 3 - 1) * 1.5}deg` }, html: `<img src="${ph.url}" alt="${escapeHtml(ph.label)}"><span>${escapeHtml(ph.label)}${inv.roster.length > 1 ? ` · ${escapeHtml(ph.by || '')}` : ''}</span>` })));
      body.append(grid);
    } else if (tab === 'kit') {
      const k = this.app.kit;
      body.append(h('p.small.muted', 'What you’re carrying tonight. Tap an item on the equipment bar to hold it. Upgrades are in Equipment on the main menu.'));
      for (const id of ['flashlight', ...TOOLS]) {
        const e = EQUIPMENT[id];
        const tier = e.tiers[k.tiers[id] || 0];
        const status = id === 'flashlight' ? (k.flash ? 'On' : 'Off') : id === 'camera' ? `${k.camera.shots}/${k.camera.max} photos left` : (k.pending || k.current) === id ? 'In your hand' : '';
        body.append(h(`div.card${(k.pending || k.current) === id || (id === 'flashlight' && k.flash) ? '.on' : ''}`, { style: { marginBottom: '8px' }, html: `<div class="gear"><span class="gi">${icon(id)}</span><div class="txt"><b>${e.name}</b> <span class="pill">${tier.label}</span> ${status ? `<span class="pill good">${status}</span>` : ''}<br><small class="muted">${e.desc}</small><br><small>${tier.desc}</small></div></div>` }));
      }
      const later = EQUIP_ORDER.filter((id) => !EQUIPMENT[id].active).map((id) => EQUIPMENT[id].name);
      body.append(h('p.small.muted', `Coming with new locations: ${later.join(', ')}.`));
    } else {
      body.append(h('h3', 'Objectives'));
      body.append(h('div', { html: inv.objectives().map((o) => `<div class="chk ${o.done ? 'yes' : 'no'}"><i>${o.done ? '✓' : ''}</i>${escapeHtml(o.text)}${o.side ? ' <span class="pill gold">bonus</span>' : ''}</div>`).join('') }));
      const clues = [...inv.cluesTaken].map((k) => inv.house.clues[k].page).filter(Boolean);
      if (clues.length) {
        body.append(h('h3', 'Found tonight'));
        for (const k of clues) body.append(h('div.paper', { style: { marginBottom: '10px' }, html: `<h4>${escapeHtml(CLUES[k].title)}</h4>${escapeHtml(CLUES[k].text)}` }));
      }
      body.append(h('h3', 'Case'));
      body.append(h('p.small.muted', `${inv.setup.title} · ${DIFFICULTY[inv.setup.diff].name} · ${fmtTime(inv.t)} on site`));
    }
    body.scrollTop = keep;
  }

  ghostCard(g, inv, opts = {}) {
    const d = GHOSTS[g];
    const ruled = [...inv.evidence].some((e) => !d.evidence.includes(e)) || d.evidence.some((e) => inv.excluded.has(e));
    const isV = inv.verdict === g;
    const card = h(`div.ghost-card${ruled ? '.out' : ''}${isV ? '.verdict' : ''}`);
    card.innerHTML = `${ghostArt(g, true, 58)}<div class="info"><b>${d.name}</b><div class="ev-icons">${d.evidence.map((e) => `<span class="${inv.evidence.has(e) ? 'hit' : inv.excluded.has(e) ? 'miss' : ''}">${icon(EV_ICON[e])}${EVIDENCE[e].short}</span>`).join('')}</div><small class="muted">${ruled ? 'Ruled out by your evidence' : d.blurb}</small></div>`;
    const b = h(`button.btn${isV ? '' : '.primary'}`, { type: 'button' }, isV ? 'Our call ✓' : 'This one');
    b.addEventListener('click', () => {
      inv.request({ t: 'verdict', ghost: g });
      this.app.audio.play('confirm');
      if (opts.onPick) opts.onPick(g);
      else setTimeout(() => this.journalRefresh(), 50);
    });
    card.append(b);
    return card;
  }

  verdictPicker(inv, forced, then) {
    const body = this.openSheet('Make your call', { wide: true, closable: !forced, name: 'verdict' });
    body.append(h('p.muted', forced ? 'Before you drive off: which ghost was in the house?' : 'You haven’t marked a ghost yet. Which one do you think it was?'));
    for (const g of PLAYABLE_GHOSTS) body.append(this.ghostCard(g, inv, { onPick: () => { this.closeSheet(); if (then) then(); } }));
  }

  /* ---------- map ---------- */

  map() {
    const inv = this.app.inv;
    if (!inv) return;
    const L0 = inv.player.layer;
    this.mapLayer = L0;
    this.openSheet('Map of 13 Wren Lane', {
      tabs: [['1', 'Upstairs'], ['0', 'Ground floor'], ['-1', 'Basement']], tab: String(L0),
      onTab: (t) => { this.mapLayer = Number(t); this.drawMap(); }, name: 'map', wide: true,
    });
    const body = this.sheetBody;
    const c = h('canvas#map-canvas', { width: 720, height: 760 });
    body.append(h('div.map-wrap', [c]));
    body.append(h('div.legend', { html: '<span><i style="background:#ffd479"></i>Lights on</span><span><i style="background:#9b6bff"></i>Ghost room</span><span><i style="background:#7fe3ff"></i>You</span><span><i style="background:#8fe3a0"></i>Team</span><span><i style="background:#ff5d7a"></i>Locked</span>' }));
    this.drawMap();
  }

  drawMap() {
    const inv = this.app.inv;
    const c = $('#map-canvas');
    if (!c || !inv) return;
    const L = this.mapLayer;
    const x = c.getContext('2d');
    const W = c.width, H = c.height;
    const showYard = L === 0;
    const k = W / 360; // the canvas is drawn at about twice its size on screen
    const S = Math.min((W - 40) / 14, (H - (showYard ? 150 : 40)) / 12);
    const ox = (W - 14 * S) / 2, oz = 20;
    const P = (px, pz) => [ox + px * S, oz + pz * S];
    x.clearRect(0, 0, W, H);
    x.fillStyle = '#070a1c'; x.fillRect(0, 0, W, H);
    const house = inv.house;
    // rooms
    for (const id in ROOMS) {
      const d = ROOMS[id];
      if (d.outside || !d.layers.includes(L)) continue;
      if ((id === 'basement' || id === 'storage') && !inv.setup.cellar && L === -1) continue;
      const room = house.rooms[id];
      const lit = house.lampLevel(room, inv.now) > 0.5;
      const ghostRoom = inv.roomFound && id === inv.setup.home;
      for (const r of d.rects) {
        const [a, b] = P(r[0], r[1]);
        x.fillStyle = ghostRoom ? 'rgba(155,107,255,.35)' : lit ? 'rgba(255,212,121,.22)' : 'rgba(40,48,96,.55)';
        x.fillRect(a, b, (r[2] - r[0]) * S, (r[3] - r[1]) * S);
      }
      const r0 = d.rects[0];
      const [cx, cy] = P((r0[0] + r0[2]) / 2, (r0[1] + r0[3]) / 2);
      x.fillStyle = ghostRoom ? '#e6dbff' : '#aab4e8';
      x.font = `700 ${Math.round(11 * k)}px Nunito, sans-serif`;
      x.textAlign = 'center';
      const name = d.name.replace('Upstairs ', '').replace('Downstairs ', '');
      if (id !== 'cellar') x.fillText(name, cx, cy);
      if (ghostRoom) { x.font = `${Math.round(20 * k)}px serif`; x.fillText('👻', cx, cy + 26 * k); }
    }
    if (L === 1) { const [a, b] = P(7.5, 6); x.fillStyle = 'rgba(0,0,0,.6)'; x.fillRect(a, b, 1.5 * S, 5 * S); }
    // stairs
    x.strokeStyle = 'rgba(170,180,232,.5)'; x.lineWidth = k;
    const stairs = L === 1 ? [[7.5, 6, 9, 11]] : L === 0 ? [[7.5, 6, 9, 11], [5, 0.9, 6.5, 4.5]] : [[5, 0.9, 6.5, 4.5]];
    for (const r of stairs) {
      for (let z = r[1]; z < r[3]; z += 0.35) { const [a, b] = P(r[0], z); x.beginPath(); x.moveTo(a, b); x.lineTo(a + (r[2] - r[0]) * S, b); x.stroke(); }
    }
    // walls
    x.strokeStyle = '#d6c6ff'; x.lineWidth = 2 * k; x.lineCap = 'round';
    const lay = LAYER[L];
    for (const w of house.walls) {
      if (w.y0 < lay.floor - 0.1 || w.y0 > lay.floor + 0.1) continue;
      x.globalAlpha = w.rail ? 0.4 : 1;
      const [a, b] = P(w.x1, w.z1), [c2, d2] = P(w.x2, w.z2);
      x.beginPath(); x.moveTo(a, b); x.lineTo(c2, d2); x.stroke();
    }
    x.globalAlpha = 1;
    // doors
    for (const id in house.doors) {
      const d = house.doors[id];
      if (d.layer !== L || d.def.open) continue;
      const df = d.def;
      x.strokeStyle = d.locked ? '#ff5d7a' : d.target > 0.5 ? 'rgba(143,227,160,.9)' : '#ffd479';
      x.lineWidth = 3 * k;
      const [a, b] = P(df.line === 'x' ? df.at : df.from + 0.1, df.line === 'x' ? df.from + 0.1 : df.at);
      const [c2, d2] = P(df.line === 'x' ? df.at : df.to - 0.1, df.line === 'x' ? df.to - 0.1 : df.at);
      x.beginPath(); x.moveTo(a, b); x.lineTo(c2, d2); x.stroke();
    }
    // yard and van
    if (showYard) {
      const [a, b] = P(-1, 12.3);
      x.strokeStyle = 'rgba(170,180,232,.3)'; x.setLineDash([6 * k, 6 * k]); x.lineWidth = k;
      x.strokeRect(a, b, 16 * S, H - b - 6 * k);
      x.setLineDash([]);
      x.fillStyle = '#aab4e8'; x.font = `700 ${Math.round(11 * k)}px Nunito`; x.textAlign = 'center';
      x.fillText('Front yard', P(7, 12)[0], b + 22 * k);
      x.fillStyle = '#b388ff'; x.font = `800 ${Math.round(12 * k)}px Nunito`;
      x.fillText('▼ VAN', P(7.6, 12)[0], H - 14 * k);
    }
    // teammates
    for (const pid in inv.remote) {
      const r = inv.remote[pid];
      if (r.gone || r.x == null || layerOfY(r.y + 0.1) !== L) continue;
      const [a, b] = P(r.x, r.z);
      x.fillStyle = '#8fe3a0'; x.beginPath(); x.arc(a, b, 6 * k, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#e9f0ff'; x.font = `700 ${Math.round(11 * k)}px Nunito`; x.fillText(inv.nameOf(Number(pid)), a, b - 10 * k);
    }
    // you
    const me = inv.player;
    if (me.layer === L || (L === 0 && me.room === 'yard')) {
      let [a, b] = P(me.pos.x, me.pos.z);
      b = Math.min(b, H - 30 * k);
      x.save(); x.translate(a, b); x.rotate(-me.yaw); x.scale(k, k);
      x.fillStyle = '#7fe3ff'; x.shadowColor = '#7fe3ff'; x.shadowBlur = 12;
      x.beginPath(); x.moveTo(0, -12); x.lineTo(8, 9); x.lineTo(0, 4); x.lineTo(-8, 9); x.closePath(); x.fill();
      x.restore();
    }
    if (L === -1 && !inv.setup.cellar) { x.fillStyle = '#aab4e8'; x.font = `700 ${Math.round(15 * k)}px Nunito`; x.textAlign = 'center'; x.fillText('The cellar is locked.', W / 2, H / 2); }
  }

  /* ---------- the van ---------- */

  vanMenu(inv) {
    const body = this.openSheet('The Van', { name: 'van' });
    body.append(h('p.muted', 'Mags, Juno and Theo are watching the monitors. Standing by the van slowly restores your nerve.'));
    const v = inv.verdict ? GHOSTS[inv.verdict].name : 'not chosen yet';
    body.append(h('div.card', { html: `<div class="row"><div style="flex:1"><b>Evidence:</b> ${inv.evidence.size}/3<br><b>Your call:</b> ${v}</div>${icon('journal')}</div>` }));
    const end = h('button.big', { type: 'button', style: { width: '100%', marginTop: '14px' } }, inv.roster.length > 1 ? 'Ready to leave' : 'End investigation');
    end.addEventListener('click', () => { this.closeSheet(); inv.wantLeave(); });
    const j = h('button.btn', { type: 'button', style: { width: '100%', marginTop: '10px' } }, 'Open journal');
    j.addEventListener('click', () => this.journal('evidence'));
    const back = h('button.btn', { type: 'button', style: { width: '100%', marginTop: '10px' } }, 'Keep investigating');
    back.addEventListener('click', () => this.closeSheet());
    body.append(end, j, back);
  }

  pauseMenu(inv) {
    const body = this.openSheet('Paused', { name: 'pause' });
    const mk = (label, cls, fn) => { const b = h(`button.btn${cls}`, { type: 'button', style: { width: '100%', marginBottom: '10px' } }, label); b.addEventListener('click', fn); body.append(b); };
    mk('Resume', '.primary', () => this.closeSheet());
    mk('Evidence journal', '', () => this.journal());
    mk('How to play', '', () => this.howToPlay());
    mk('Settings', '', () => this.settingsSheet());
    body.append(h('p.small.muted', inv.net ? 'In team mode the investigation keeps going while this menu is open.' : 'Leaving now ends the investigation without a report or rewards.'));
    mk('Leave investigation', '.warn', () => { this.closeSheet(); this.app.abandon(); });
  }

  /* ---------- team radio ---------- */

  chatLine(name, text, me) {
    this.chatLog.push({ name, text, me });
    this.chatLog = this.chatLog.slice(-40);
    if (!me) this.toast(`📻 ${name}: ${text}`);
    const log = $('.chatlog');
    if (log) this.renderChatLog(log);
  }

  renderChatLog(log) {
    log.innerHTML = this.chatLog.map((c) => `<div class="${c.me ? 'me' : ''}"><b>${escapeHtml(c.name)}:</b> ${escapeHtml(c.text)}</div>`).join('') || '<div class="muted">No messages yet.</div>';
    log.scrollTop = log.scrollHeight;
  }

  chatSheet(send) {
    const body = this.openSheet('Team Radio', { name: 'chat' });
    const log = h('div.chatlog');
    body.append(log);
    this.renderChatLog(log);
    body.append(h('h3', 'Quick calls'));
    const quick = h('div.quick');
    const room = this.app.inv && this.app.inv.player.room ? ROOMS[this.app.inv.player.room]?.name : null;
    const phrases = ['Over here!', 'Found evidence!', room ? `I'm in the ${room}` : 'Where is everyone?', 'Ghost room might be here', 'I need help!', 'It’s surging, hide!', 'Let’s regroup at the van', 'Let’s get out of here!'];
    for (const p of phrases) { const b = h('button', { type: 'button' }, p); b.addEventListener('click', () => { send(p); this.renderChatLog(log); }); quick.append(b); }
    body.append(quick);
    const row = h('div.chatin', { style: { marginTop: '12px' } });
    const inp = h('input', { type: 'text', maxlength: 120, placeholder: 'Say something…', 'aria-label': 'Message' });
    const go = h('button.btn.primary', { type: 'button' }, 'Send');
    const fire = () => { const t = inp.value.trim(); if (t) { send(t); inp.value = ''; this.renderChatLog(log); } };
    go.addEventListener('click', fire);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') fire(); });
    row.append(inp, go);
    body.append(row);
  }

  /* ---------- report ---------- */

  report(res, onDone) {
    const body = this.openSheet('Investigation Report', { wide: true, closable: false, name: 'report' });
    const g = GHOSTS[res.ev.ghost];
    body.append(h('p.casefile', `${BRAND.toUpperCase()} · ${res.setup.title.toUpperCase()} · ${fmtTime(res.time)} ON SITE`));
    const head = h('div.report-head', { html: `${ghostArt(res.ev.ghost, true, 86)}<div style="flex:1"><div class="muted small">The ghost was a</div><b style="font-family:var(--display);font-size:22px">${g.name}</b><div class="small">Your call: ${res.ev.verdict ? GHOSTS[res.ev.verdict].name : 'none'}</div></div><span class="stamp ${res.correct ? 'ok' : 'bad'}">${res.correct ? 'SOLVED' : 'MISSED'}</span>` });
    body.append(head);
    body.append(h('h3', 'Evidence'));
    body.append(h('div.ev-icons', { html: g.evidence.map((e) => `<span class="${res.evidence.includes(e) ? 'hit' : ''}">${icon(EV_ICON[e])}${EVIDENCE[e].name}${res.evidence.includes(e) ? ' ✓' : ''}</span>`).join('') }));
    body.append(h('p.small.muted', `The ghost room was the ${ROOMS[res.ev.home].name}. ${g.tells[0]}`));
    if (res.photos.length) {
      body.append(h('h3', 'Photos'));
      const grid = h('div.photos');
      res.photos.slice(0, 8).forEach((ph, i) => grid.append(h(`div.polaroid${ph.kind === 'ghost' ? '.ghost' : ''}`, { style: { '--r': `${(i % 3 - 1) * 2}deg` }, html: `<img src="${ph.url}" alt=""><span>${escapeHtml(ph.label)}</span>` })));
      body.append(grid);
    }
    body.append(h('h3', 'Objectives'));
    const obj = [
      ['Found the ghost room', res.ev.roomFound], ['Collected 3 pieces of evidence', res.evidence.length >= 3], ['Identified the ghost', res.correct],
      ...res.sides.map((s) => [s.text, s.done]),
    ];
    body.append(h('div', { html: obj.map(([t, ok]) => `<div class="chk ${ok ? 'yes' : 'no'}"><i>${ok ? '✓' : ''}</i>${escapeHtml(t)}</div>`).join('') }));
    body.append(h('h3', 'Rewards'));
    const lines = h('div.lines');
    res.lines.forEach((l, i) => {
      const neg = l.coins < 0 || l.xp < 0;
      lines.append(h(`div.ln${neg ? '.neg' : ''}`, { style: { animationDelay: `${0.4 + i * 0.12}s` }, html: `<span>${escapeHtml(l.label)}</span><span>${l.coins >= 0 ? '+' : ''}${l.coins} 🪙 · ${l.xp >= 0 ? '+' : ''}${l.xp} XP</span>` }));
    });
    body.append(lines);
    body.append(h('div.total', { style: { marginTop: '10px' }, html: `<div>${res.total.coins}<small>COINS</small></div><div>${res.total.xp}<small>XP</small></div>` }));
    const p = this.app.profile;
    const r = p.rank();
    body.append(h('div.idcard', { style: { marginTop: '12px' }, html: `${rankBadge(r, 46)}<div style="flex:1"><b>${res.levelUp ? `Level up! Level ${res.level}` : `Level ${res.level}`}</b><br><small class="muted">${r.name}${res.rankUp ? ' · NEW RANK!' : ''}</small><div class="xp" style="width:100%"><i style="width:${(p.d.xp / xpToNext(p.d.level)) * 100}%"></i></div></div>` }));
    if (res.achievements.length) {
      body.append(h('h3', 'Badges earned'));
      body.append(h('div.row.wrap', { html: res.achievements.map((a) => `<div class="ach" style="width:120px">${achievementBadge(a, true, 54)}<b>${a.name}</b></div>`).join('') }));
    }
    if (res.dailies.length) {
      body.append(h('h3', 'Daily challenges'));
      body.append(h('div', { html: res.dailies.map((d) => `<div class="chk yes"><i>✓</i>${escapeHtml(d.label)} <span class="pill gold">+${d.coins}</span></div>`).join('') }));
    }
    if (res.story && !res.story.advanced) {
      body.append(h('p.small', { style: { color: 'var(--gold)' } }, res.story.missingClue ? 'The story didn’t move on: you didn’t find this case’s clue. Try the case again.' : res.story.noEscape ? 'The story didn’t move on this time.' : ''));
    }
    const b = h('button.big', { type: 'button', style: { width: '100%', marginTop: '16px' } }, 'Continue');
    b.addEventListener('click', () => { this.closeSheet(); onDone(); });
    body.append(b);
    this.app.audio.play(res.correct ? 'level' : 'confirm');
    if (res.levelUp) setTimeout(() => this.app.audio.play('level'), 900);
  }
}
