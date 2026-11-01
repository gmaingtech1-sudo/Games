// Developer tool: the custom enemy creator. Lives outside normal progression:
// custom enemies are stored separately and test fights never give rewards.

import { app } from './app.js';
import { $, esc, delegate, showScreen, toast, confirmDialog, modal } from './dom.js';
import { blankEnemy, validateEnemy, saveCustomEnemy, loadCustomEnemies, deleteCustomEnemy, duplicateCustomEnemy, customEnemyUnit, SHAPES, ELEMENT_OPTIONS, ALLOWED_ABILITIES, LIMITS } from '../customEnemyCreator.js';
import { ENEMY_ABILITIES, BEHAVIOURS, baselineStats } from '../enemies.js';
import { ITEMS } from '../items.js';
import { CLASSES, MAX_LEVEL, computeStats } from '../character.js';
import { enemySvg } from '../art.js';
import { newGame } from '../gameState.js';
import { deepClone } from '../utils.js';
import { startTestFight } from './combatView.js';
import { renderMenu } from './menuView.js';
import { sfx } from '../audio.js';

let draft = blankEnemy();
let errors = {};

export function renderCreator() {
  const root = document.createElement('div');
  $('#screen-creator').replaceChildren(root);
  if (!app.settings.devTools) {
    root.innerHTML = `<div class="wrap-narrow panel"><h2>Developer tools are off</h2><p>Enable them in Settings to use the Enemy Creator.</p><button class="btn" data-action="back">Back</button></div>`;
    delegate(root, { back });
    return;
  }
  const saved = loadCustomEnemies();
  const itemOpts = Object.values(ITEMS).filter((i) => i.type !== 'quest').sort((a, b) => a.name.localeCompare(b.name));
  const f = (key, label, type = 'number', extra = '') => `<div class="field${errors[key] ? ' invalid' : ''}"><label for="ce-${key}">${label}</label>
    <input type="${type}" id="ce-${key}" data-f="${key}" value="${esc(draft[key])}" ${type === 'number' ? `min="${LIMITS[key]?.[0] ?? 0}" max="${LIMITS[key]?.[1] ?? ''}" step="1" inputmode="numeric"` : 'maxlength="24"'} ${extra}>
    <div class="field-error">${esc(errors[key] || '')}</div></div>`;
  root.innerHTML = `<div class="wrap">
    <div class="screen-head"><button class="btn small ghost" data-action="back">← Back</button><h2>🧪 Enemy Creator</h2><span class="tag purple">Developer tool</span></div>
    <p class="small muted">Design custom monsters, save them locally and test them in combat. Custom enemies never change the built-in bestiary, and test fights never give rewards.</p>
    <div class="creator-layout">
      <div>
        <div class="panel">
          <h3 class="panel-title">${draft.id ? 'Edit enemy' : 'New enemy'}</h3>
          <div class="form-grid">
            <div class="full">${f('name', 'Name', 'text')}</div>
            <div class="field full${errors.desc ? ' invalid' : ''}"><label for="ce-desc">Description</label><textarea id="ce-desc" data-f="desc" maxlength="160">${esc(draft.desc)}</textarea><div class="field-error">${esc(errors.desc || '')}</div></div>
            ${f('level', 'Level')}${f('hp', 'Health')}${f('atk', 'Attack')}${f('def', 'Defence')}${f('spd', 'Speed')}${f('xp', 'Experience reward')}${f('gold', 'Gold reward')}
            <div class="field"><label for="ce-behaviour">Behaviour</label><select id="ce-behaviour" data-f="behaviour">${Object.entries(BEHAVIOURS).map(([k, b]) => `<option value="${k}" ${draft.behaviour === k ? 'selected' : ''}>${b.name}</option>`).join('')}</select><div class="tiny muted">${esc(BEHAVIOURS[draft.behaviour]?.desc || '')}</div></div>
            <div class="full"><button class="btn small ghost" data-action="autostats">Fill balanced stats for this level</button></div>
          </div>
        </div>
        <div class="panel">
          <h3 class="panel-title">Abilities <span class="tiny muted">(1–6)</span></h3>
          <div class="checks">${ALLOWED_ABILITIES.map((id) => `<label class="check"><input type="checkbox" data-list="abilities" value="${id}" ${draft.abilities.includes(id) ? 'checked' : ''}>${esc(ENEMY_ABILITIES[id].name)}</label>`).join('')}</div>
          <div class="field-error">${esc(errors.abilities || '')}</div>
          <h3 class="panel-title" style="margin-top:12px">Weaknesses</h3>
          <div class="checks">${ELEMENT_OPTIONS.map((e) => `<label class="check"><input type="checkbox" data-list="weak" value="${e}" ${draft.weak.includes(e) ? 'checked' : ''}>${e}</label>`).join('')}</div>
          <h3 class="panel-title" style="margin-top:12px">Resistances</h3>
          <div class="checks">${ELEMENT_OPTIONS.map((e) => `<label class="check"><input type="checkbox" data-list="resist" value="${e}" ${draft.resist.includes(e) ? 'checked' : ''}>${e}</label>`).join('')}</div>
          <div class="field-error">${esc(errors.weak || '')}</div>
        </div>
        <div class="panel">
          <h3 class="panel-title">Loot table</h3>
          <div class="stack">${draft.loot.map((l, i) => `<div class="row field${errors['loot' + i] ? ' invalid' : ''}">
            <select class="select" data-loot="${i}" data-k="id" style="flex:1;min-width:0">${itemOpts.map((it) => `<option value="${it.id}" ${l.id === it.id ? 'selected' : ''}>${esc(it.name)}</option>`).join('')}</select>
            <input type="number" data-loot="${i}" data-k="chance" value="${esc(l.chance)}" min="1" max="100" style="width:80px" aria-label="Drop chance percent"> %
            <button class="btn small ghost" data-action="rmloot" data-i="${i}" aria-label="Remove">✕</button>
            <div class="field-error" style="width:100%">${esc(errors['loot' + i] || '')}</div></div>`).join('') || '<p class="small muted">No drops.</p>'}</div>
          <div class="field-error">${esc(errors.loot || '')}</div>
          <button class="btn small" data-action="addloot" ${draft.loot.length >= 5 ? 'disabled' : ''}>+ Add drop</button>
          <p class="tiny muted">Loot only drops in test fights as a preview; it is never added to your inventory.</p>
        </div>
        <div class="panel">
          <h3 class="panel-title">Appearance</h3>
          <div class="form-grid">
            <div class="field"><label for="ce-shape">Shape</label><select id="ce-shape" data-look="shape">${SHAPES.map((sh) => `<option value="${sh}" ${draft.look.shape === sh ? 'selected' : ''}>${sh}</option>`).join('')}</select></div>
            <div class="field"><label for="ce-scale">Size</label><input type="range" id="ce-scale" data-look="scale" min="0.6" max="1.4" step="0.05" value="${draft.look.scale}" style="width:100%"></div>
            <div class="field"><label for="ce-color">Body colour</label><input type="color" id="ce-color" data-look="color" value="${esc(draft.look.color)}"></div>
            <div class="field"><label for="ce-accent">Eye / glow colour</label><input type="color" id="ce-accent" data-look="accent" value="${esc(draft.look.accent)}"></div>
            <label class="check full"><input type="checkbox" data-look="aura" ${draft.look.aura ? 'checked' : ''}> Magical aura</label>
          </div>
        </div>
        <div class="row" style="margin:14px 0"><button class="btn primary" data-action="save">💾 Save enemy</button><button class="btn magic" data-action="test">⚔ Test in combat</button><button class="btn ghost" data-action="new">New</button></div>
      </div>
      <div>
        <div class="panel preview" id="ce-preview"></div>
        <div class="panel"><h3 class="panel-title">Saved enemies (${saved.length})</h3>
          <div class="stack">${saved.map((e) => `<div class="card"><div class="row between"><b>${esc(e.name)}</b><span class="tiny muted">Lv ${e.level}</span></div>
            <div class="row" style="margin-top:6px;gap:6px"><button class="btn small" data-action="edit" data-id="${e.id}">Edit</button><button class="btn small" data-action="dup" data-id="${e.id}">Duplicate</button><button class="btn small magic" data-action="testsaved" data-id="${e.id}">Test</button><button class="btn small danger" data-action="del" data-id="${e.id}">Delete</button></div></div>`).join('') || '<p class="small muted">None yet.</p>'}</div></div>
      </div>
    </div></div>`;
  renderPreview();
  root.addEventListener('input', (e) => onInput(e, root));
  root.addEventListener('change', (e) => onInput(e, root));
  delegate(root, {
    back,
    autostats: () => {
      const lv = Math.max(1, Math.min(60, Math.round(Number(draft.level) || 1)));
      const b = baselineStats(lv);
      Object.assign(draft, { level: lv, hp: Math.round(b.hp), atk: Math.round(b.atk), def: Math.round(b.def), spd: Math.round(b.spd), xp: b.xp, gold: b.gold });
      renderCreator();
    },
    addloot: () => { if (draft.loot.length < 5) draft.loot.push({ id: 'smallHealthPotion', chance: 25 }); renderCreator(); },
    rmloot: (el) => { draft.loot.splice(+el.dataset.i, 1); renderCreator(); },
    save: () => {
      const r = saveCustomEnemy(draft);
      errors = r.errors || {};
      if (!r.ok) { toast('Please fix the highlighted fields.', { type: 'bad' }); sfx('error'); renderCreator(); return; }
      draft = { ...r.value, look: { ...r.value.look }, loot: r.value.loot.map((l) => ({ ...l })) };
      sfx('buy');
      toast(`Saved ${r.value.name}.`, { type: 'good' });
      renderCreator();
    },
    test: () => {
      const r = validateEnemy(draft);
      errors = r.errors;
      if (!r.ok) { toast('Fix the highlighted fields before testing.', { type: 'bad' }); renderCreator(); return; }
      runTest(r.value);
    },
    testsaved: (el) => { const e = loadCustomEnemies().find((x) => x.id === el.dataset.id); if (e) runTest(e); },
    new: () => { draft = blankEnemy(); errors = {}; renderCreator(); },
    edit: (el) => {
      const e = loadCustomEnemies().find((x) => x.id === el.dataset.id);
      if (e) { draft = deepClone(e); errors = {}; renderCreator(); window.scrollTo(0, 0); }
    },
    dup: (el) => { const r = duplicateCustomEnemy(el.dataset.id); toast(r.ok ? `Created ${r.value.name}.` : 'Could not duplicate.', { type: r.ok ? 'good' : 'bad' }); renderCreator(); },
    del: async (el) => {
      const e = loadCustomEnemies().find((x) => x.id === el.dataset.id);
      if (!e || !(await confirmDialog('Delete enemy?', `Delete ${e.name}? This cannot be undone.`, { ok: 'Delete', danger: true }))) return;
      deleteCustomEnemy(e.id);
      if (draft.id === e.id) draft = blankEnemy();
      renderCreator();
    },
  });
}

function onInput(e, root) {
  const el = e.target;
  if (el.dataset.f) draft[el.dataset.f] = el.type === 'number' ? el.value : el.value;
  else if (el.dataset.list) {
    const list = new Set(draft[el.dataset.list]);
    if (el.checked) list.add(el.value); else list.delete(el.value);
    draft[el.dataset.list] = [...list];
  } else if (el.dataset.look) {
    draft.look[el.dataset.look] = el.type === 'checkbox' ? el.checked : el.type === 'range' ? Number(el.value) : el.value;
  } else if (el.dataset.loot !== undefined) {
    const l = draft.loot[+el.dataset.loot];
    if (l) l[el.dataset.k] = el.dataset.k === 'chance' ? el.value : el.value;
  } else return;
  if (el.dataset.f === 'behaviour' && e.type === 'change') { renderCreator(); return; }
  renderPreview();
}

function renderPreview() {
  const box = $('#ce-preview');
  if (!box) return;
  const v = validateEnemy(draft);
  const d = v.value;
  box.innerHTML = `<div class="tiny muted">Preview</div>${enemySvg(d.look, { id: 'preview', label: d.name })}
    <h3>${esc(d.name || '???')} <span class="tiny muted">Lv ${esc(d.level)}</span></h3>
    <p class="small muted">${esc(d.desc)}</p>
    <dl class="stat-table small"><dt>Health</dt><dd>${esc(d.hp)}</dd><dt>Attack</dt><dd>${esc(d.atk)}</dd><dt>Defence</dt><dd>${esc(d.def)}</dd><dt>Speed</dt><dd>${esc(d.spd)}</dd><dt>XP / Gold</dt><dd>${esc(d.xp)} / ${esc(d.gold)}</dd><dt>Behaviour</dt><dd>${esc(BEHAVIOURS[d.behaviour].name)}</dd></dl>
    <div class="row" style="justify-content:center;gap:4px;margin-top:6px">${d.weak.map((w) => `<span class="tag weak">Weak: ${w}</span>`).join('')}${d.resist.map((w) => `<span class="tag resist">Resists: ${w}</span>`).join('')}</div>
    <div class="tiny" style="margin-top:6px">${d.abilities.map((a) => esc(ENEMY_ABILITIES[a].name)).join(' · ')}</div>
    <div class="tiny ${v.ok ? 'good' : 'bad'}" style="margin-top:6px">${v.ok ? '✓ Valid' : `${Object.keys(v.errors).length} problem(s) to fix`}</div>`;
}

async function runTest(enemyDef) {
  let state;
  if (app.state) {
    state = deepClone(app.state); // a copy: the real save is never touched
  } else {
    const pick = { cls: 'warrior', lvl: Math.max(1, Math.min(MAX_LEVEL, Number(enemyDef.level) || 1)) };
    const buttons = [{ label: 'Cancel', value: null }, { label: 'Fight', value: 'go', cls: 'primary' }];
    buttons.onMount = (back) => back.addEventListener('input', () => {
      pick.cls = back.querySelector('#th-class').value;
      pick.lvl = Number(back.querySelector('#th-level').value);
    });
    const v = await modal({
      title: 'Test hero',
      body: `<p class="small">No game is loaded. Choose a temporary hero for the test.</p>
        <div class="form-grid"><div class="field"><label for="th-class">Class</label><select id="th-class">${Object.values(CLASSES).map((c) => `<option value="${c.id}" ${c.id === 'warrior' ? 'selected' : ''}>${c.name}</option>`).join('')}</select></div>
        <div class="field"><label for="th-level">Level</label><input type="number" id="th-level" min="1" max="${MAX_LEVEL}" value="${Math.max(1, Math.min(MAX_LEVEL, Number(enemyDef.level) || 1))}"></div></div>`,
      buttons,
    });
    if (v !== 'go') return;
    const cls = CLASSES[pick.cls] ? pick.cls : 'warrior';
    const lvl = Math.max(1, Math.min(MAX_LEVEL, Math.round(Number(pick.lvl) || 1)));
    state = newGame('Test Hero', cls);
    state.player.level = lvl;
    const st = computeStats(state.player);
    state.player.hp = st.maxHp;
    state.player.mp = st.maxMp;
  }
  const st = computeStats(state.player);
  state.player.hp = st.maxHp; // tests start at full strength
  state.player.mp = st.maxMp;
  startTestFight(state, customEnemyUnit(enemyDef), () => { showScreen('creator'); renderCreator(); });
}

function back() {
  if (app.returnTo === 'game' && app.state) import('./gameView.js').then((m) => m.enterGame(app.tab));
  else { renderMenu(); showScreen('menu'); }
}
