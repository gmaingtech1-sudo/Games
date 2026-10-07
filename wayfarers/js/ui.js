/* Wayfarers — the menus under the battle: AFK chest, heroes, summoning, camp
   upgrades, rebirth and quests, plus sheets, pop-ups and toasts.
   Pages are built when you open them or do something; a light refresh keeps
   numbers and "can I afford it?" states current without rebuilding. */
(function (WF) {
  'use strict';

  const D = WF.data;
  const ST = WF.state;
  const { fmt, fmtTime } = WF.util;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  let hooks = {};
  let tab = 'battle';
  let lvlMode = 1; // 1, 10 or Infinity
  let sheetAct = null;
  let toastTimer = 0;

  const S = () => ST.S;
  const ico = (k) => '<i class="ico-' + k + '" aria-hidden="true"></i>';
  const stars = (n, max) => '<span class="stars" aria-label="' + n + ' stars">' + '★'.repeat(n) + '<s>' + '★'.repeat((max || D.MAX_STARS) - n) + '</s></span>';
  const pct = (x) => Math.round(x * 100) + '%';

  function skillText(s) {
    switch (s.type) {
      case 'nuke': return 'Strikes the target for ' + pct(s.k) + ' attack.';
      case 'aoe': return 'Blasts every foe for ' + pct(s.k) + ' attack.';
      case 'heal': return 'Heals the whole party for ' + pct(s.k) + ' attack.';
      case 'shield': return 'Shields the whole party for ' + pct(s.k) + ' of its own max health.';
      case 'stun': return 'Hits every foe for ' + pct(s.k) + ' attack and stuns them for ' + s.t + 's.';
      case 'rally': return 'The whole party deals ' + pct(s.k) + ' more damage for ' + s.t + 's.';
      default: return '';
    }
  }

  const ROLE_TIPS = {
    tank: 'Stands at the front and draws most of the hits.',
    warrior: 'Fights at the front and hits hard.',
    rogue: 'Darts in quickly and finishes off the weakest foe.',
    archer: 'Shoots from the back row.',
    mage: 'Casts slow but heavy bolts from the back row.',
    healer: 'Heals the most hurt ally, or attacks when everyone is well.',
  };

  /* ---------- Pages ---------- */

  function buildBattle() {
    const s = S();
    const pushing = s.autoPush;
    const nextBoss = D.STAGES_PER_CHAPTER - ((s.stage - 1) % D.STAGES_PER_CHAPTER) - 1;
    return `
      <div class="card chest-card">
        <div class="chest" id="chest-art" aria-hidden="true"><i class="lid"></i><i class="box"></i><i class="lock"></i><i class="shine"></i></div>
        <div class="chest-info">
          <h3>AFK loot</h3>
          <div class="loot">
            <span>${ico('gold')}<b data-bind="chest-gold">0</b></span>
            <span>${ico('gem')}<b data-bind="chest-gems">0</b></span>
          </div>
          <div class="bar"><i data-bind-w="chest-fill"></i></div>
          <small><span data-bind="chest-time">0s</span> of 12h · <span data-bind="afk-rate">0</span> gold/min</small>
        </div>
        <button class="btn gold" type="button" data-act="claim" data-need="chest">Claim</button>
      </div>

      <div class="row2">
        <button class="card mini" type="button" data-act="fast">
          <span class="mini-ico">${svg('bolt')}</span>
          <span><b>Fast rewards</b><small>2 hours of loot, now</small></span>
          <em data-bind="fast-cost">Free</em>
        </button>
        <button class="card mini ${pushing ? 'on' : ''}" type="button" data-act="push" aria-pressed="${pushing}">
          <span class="mini-ico">${svg('flag')}</span>
          <span><b>Auto-push</b><small>${pushing ? 'Moving on after each win' : 'Farming stage ' + D.stageLabel(s.stage)}</small></span>
          <em class="switch" aria-hidden="true"><i></i></em>
        </button>
      </div>

      ${pushing ? '' : `
      <div class="card retreat">
        <p><b>Your party fell back.</b> They'll farm ${D.stageLabel(s.stage)} for gold until you're ready. Level up your heroes, then try again.</p>
        <button class="btn" type="button" data-act="challenge">Challenge ${D.stageLabel(s.best + 1)}</button>
      </div>`}

      <div class="card stats-card">
        <div><small>Best stage</small><b>${s.best ? D.stageLabel(s.best) : '–'}</b></div>
        <div><small>Party power</small><b data-bind="power">0</b></div>
        <div><small>${D.isBoss(s.stage) ? 'Now' : 'Boss in'}</small><b>${D.isBoss(s.stage) ? 'Boss!' : nextBoss + (nextBoss === 1 ? ' stage' : ' stages')}</b></div>
      </div>

      <div class="party-strip">
        ${s.party.map((id) => `
          <button type="button" class="pp" data-act="hero" data-id="${id}" aria-label="${D.HERO[id].name}">
            <canvas data-portrait="${id}"></canvas><b>Lv ${s.heroes[id].level}</b>
          </button>`).join('')}
        ${Array.from({ length: D.PARTY_SIZE - s.party.length }, () => '<button type="button" class="pp empty" data-act="tab" data-tab="heroes" aria-label="Empty party slot">+</button>').join('')}
      </div>
      <p class="hint">Your heroes keep fighting even when the game is closed. Come back to claim up to 12 hours of loot.</p>`;
  }

  function lvlLabel(id) {
    const plan = ST.levelPlan(id, lvlMode);
    return { html: `<span>Lv +${plan.n}</span><small>${ico('gold')}${fmt(plan.cost)}</small>`, cost: plan.cost };
  }

  function buildHeroes() {
    const s = S();
    const ownedIds = D.HEROES.filter((h) => s.heroes[h.id]).map((h) => h.id)
      .sort((a, b) => (s.party.includes(b) - s.party.includes(a)) || ST.power(b) - ST.power(a));
    const locked = D.HEROES.filter((h) => !s.heroes[h.id]);
    const mode = (m, label) => `<button type="button" class="${lvlMode === m ? 'on' : ''}" data-act="lvlmode" data-mode="${m}">${label}</button>`;
    return `
      <div class="page-head">
        <h2>Heroes <small>Party ${s.party.length}/${D.PARTY_SIZE}</small></h2>
        <div class="seg" role="group" aria-label="Levels per tap">${mode(1, '×1')}${mode(10, '×10')}${mode(Infinity, 'Max')}</div>
      </div>
      <div class="hero-list">
        ${ownedIds.map((id) => {
          const h = s.heroes[id];
          const def = D.HERO[id];
          const l = lvlLabel(id);
          const inParty = s.party.includes(id);
          return `
          <div class="hero-card ${inParty ? 'in' : ''}" data-act="hero" data-id="${id}" role="button" tabindex="0" style="--rar:${D.RARITY[def.rarity].color}">
            <canvas data-portrait="${id}"></canvas>
            <div class="hc-info">
              <b>${def.name}${ST.canAscend(id) ? ' <em class="up">▲</em>' : ''}</b>
              ${stars(h.stars)}
              <small>${D.ROLE[def.role].name} · Lv ${h.level} · <span data-bind="pow-${id}">${fmt(ST.power(id))}</span></small>
            </div>
            ${inParty ? '<i class="tag">Party</i>' : ''}
            <button class="btn lvl" type="button" data-act="lvl" data-id="${id}" data-cost="${l.cost}">${l.html}</button>
          </div>`;
        }).join('')}
      </div>
      ${locked.length ? `
        <h3 class="sub">Not found yet</h3>
        <div class="locked-grid">
          ${locked.map((def) => `
            <button type="button" class="locked" data-act="hero" data-id="${def.id}" style="--rar:${D.RARITY[def.rarity].color}">
              <canvas data-portrait="${def.id}" data-locked="1"></canvas><span>${def.name}</span>
            </button>`).join('')}
        </div>` : ''}`;
  }

  function buildSummon() {
    const total = Object.values(D.RARITY).reduce((a, r) => a + r.weight, 0);
    return `
      <div class="altar" aria-hidden="true"><i class="ring r1"></i><i class="ring r2"></i><i class="orb"></i><i class="beam"></i></div>
      <div class="summon-btns">
        <button class="btn free" type="button" data-act="summon" data-kind="free"><b>Free summon</b><small data-bind="free-in">Ready</small></button>
        <button class="btn" type="button" data-act="summon" data-kind="one" data-gems="${D.SUMMON_GEMS}"><b>Summon ×1</b><small>${ico('gem')}${D.SUMMON_GEMS}</small></button>
        <button class="btn gold" type="button" data-act="summon" data-kind="ten" data-gems="${D.SUMMON10_GEMS}"><b>Summon ×10</b><small>${ico('gem')}${D.SUMMON10_GEMS} · Epic+ guaranteed</small></button>
      </div>
      <div class="card rates">
        <h3>Chances</h3>
        ${Object.entries(D.RARITY).map(([k, r]) => `<div class="rate" style="--rar:${r.color}"><b>${r.name}</b><span>${Math.round((r.weight / total) * 100)}%</span><small>${D.HEROES.filter((h) => h.rarity === k).map((h) => h.name).join(', ')}</small></div>`).join('')}
        <p class="hint">Summoning a hero you already have gives you a copy. Copies let a hero <b>ascend</b> to more stars, and each star makes them 45% stronger.</p>
      </div>`;
  }

  function buildCamp() {
    const s = S();
    const b = ST.bonus();
    const souls = D.soulsFor(s.best);
    return `
      <div class="page-head"><h2>Camp <small>Upgrades for the whole party</small></h2></div>
      <div class="camp-list">
        ${D.CAMP.map((c) => {
          const lvl = ST.campLvl(c.id);
          const maxed = c.max && lvl >= c.max;
          const cost = D.campCost(c.id, lvl);
          return `
          <div class="card camp">
            <span class="camp-ico">${svg(c.icon)}</span>
            <div><b>${c.name} <small>Lv ${lvl}${c.max ? '/' + c.max : ''}</small></b><small>${c.desc}</small><em>Now: +${Math.round(lvl * c.per * 100)}%</em></div>
            <button class="btn" type="button" data-act="camp" data-id="${c.id}" ${maxed ? 'disabled' : `data-cost="${cost}"`}>${maxed ? 'Max' : ico('gold') + fmt(cost)}</button>
          </div>`;
        }).join('')}
      </div>

      <div class="card shrine">
        <div class="shrine-head">
          <span class="soul-big" aria-hidden="true"></span>
          <div>
            <h3>Rebirth Shrine</h3>
            <small>${s.souls} soul stones · +${Math.round(s.souls * D.SOUL_BONUS * 100)}% attack, health and gold</small>
          </div>
        </div>
        <p>Start your journey again from stage 1-1, stronger than before. Your heroes return to level 1, and gold and camp upgrades are lost. You keep every hero, their stars, your gems and quests, and earn soul stones based on how far you got.</p>
        ${souls > 0
          ? `<button class="btn soul" type="button" data-act="rebirth">Rebirth for +${souls} soul stones</button>`
          : `<button class="btn soul" type="button" disabled>Reach stage ${D.stageLabel(D.REBIRTH_AT)} to rebirth</button>`}
      </div>
      <p class="hint">Attack ×${b.atk.toFixed(2)} · Health ×${b.hp.toFixed(2)} · Gold ×${b.gold.toFixed(2)} · AFK ×${b.afk.toFixed(2)}</p>`;
  }

  function buildQuests() {
    const s = S();
    return `
      <div class="page-head"><h2>Quests <small>Earn gems for milestones</small></h2></div>
      <div class="quest-list">
        ${D.QUESTS.map((q) => {
          const st = ST.questState(q);
          if (st.done) return `<div class="card quest done"><div><b>${q.label(q.tiers[q.tiers.length - 1])}</b><small>All done!</small></div><span class="check">✓</span></div>`;
          return `
          <div class="card quest ${st.ready ? 'ready' : ''}">
            <div>
              <b>${st.label}</b>
              <div class="bar"><i data-bind-w="q-${q.id}"></i></div>
              <small data-bind="qt-${q.id}"></small>
            </div>
            <button class="btn ${st.ready ? 'gold' : ''}" type="button" data-act="quest" data-id="${q.id}" ${st.ready ? '' : 'disabled'}>${ico('gem')}${st.gems}</button>
          </div>`;
        }).join('')}
      </div>
      <div class="card stats-card">
        <div><small>Foes defeated</small><b>${fmt(s.stats.kills)}</b></div>
        <div><small>Bosses</small><b>${fmt(s.stats.bosses)}</b></div>
        <div><small>Best ever</small><b>${s.bestEver ? D.stageLabel(s.bestEver) : '–'}</b></div>
      </div>`;
  }

  const BUILDERS = { battle: buildBattle, heroes: buildHeroes, summon: buildSummon, camp: buildCamp, quests: buildQuests };

  function drawPortraits(root) {
    for (const c of $$('canvas[data-portrait]', root)) WF.render.portrait(c, c.dataset.portrait, { locked: !!c.dataset.locked });
  }

  function rebuild() {
    const page = $('#page-' + tab);
    const scrollTop = page.scrollTop;
    page.innerHTML = BUILDERS[tab]();
    page.scrollTop = scrollTop;
    drawPortraits(page);
    refresh();
  }

  function show(name) {
    tab = name;
    for (const p of $$('.page')) p.hidden = p.id !== 'page-' + name;
    for (const t of $$('.tab')) t.classList.toggle('on', t.dataset.tab === name);
    $('#page-' + name).scrollTop = 0;
    rebuild();
  }

  /* ---------- Light refresh ---------- */

  function binds(now) {
    const s = S();
    const r = D.afkRate(s.best, ST.bonus());
    const fast = ST.fastRewardCost(now);
    const free = ST.freeSummonIn(now);
    const v = {
      'chest-gold': fmt(s.chest.gold),
      'chest-gems': fmt(s.chest.gems),
      'chest-time': fmtTime(s.chest.secs),
      'afk-rate': fmt(r.gold * 60),
      'fast-cost': fast === 0 ? 'Free' : fast + ' gems',
      power: fmt(ST.partyPower()),
      'free-in': free > 0 ? 'in ' + fmtTime(free) : 'Ready!',
    };
    for (const q of D.QUESTS) {
      const st = ST.questState(q);
      if (st.done) continue;
      v['qt-' + q.id] = q.id === 'stage'
        ? (st.have ? D.stageLabel(Math.min(st.have, st.target)) : '–') + ' / ' + D.stageLabel(st.target)
        : fmt(Math.min(st.have, st.target)) + ' / ' + fmt(st.target);
    }
    return v;
  }

  function widths() {
    const s = S();
    const w = { 'chest-fill': s.chest.secs / D.AFK_CAP };
    for (const q of D.QUESTS) {
      const st = ST.questState(q);
      if (!st.done) w['q-' + q.id] = Math.min(1, st.have / st.target);
    }
    return w;
  }

  function refresh() {
    const s = S();
    const now = Date.now();
    $('#r-gold').textContent = fmt(s.gold);
    $('#r-gems').textContent = fmt(s.gems);
    $('#res-souls').hidden = s.souls <= 0;
    $('#r-souls').textContent = fmt(s.souls);

    const page = $('#page-' + tab);
    const v = binds(now);
    for (const el of $$('[data-bind]', page)) {
      const key = el.dataset.bind;
      if (key.startsWith('pow-')) el.textContent = fmt(ST.power(key.slice(4)));
      else if (key in v) el.textContent = v[key];
    }
    const w = widths();
    for (const el of $$('[data-bind-w]', page)) el.style.width = ((w[el.dataset.bindW] || 0) * 100).toFixed(1) + '%';
    for (const el of $$('[data-act="lvl"]', page)) {
      const l = lvlLabel(el.dataset.id);
      if (el.dataset.cost !== String(l.cost)) { el.dataset.cost = l.cost; el.innerHTML = l.html; }
    }
    for (const el of $$('[data-cost]', page)) el.disabled = s.gold < Number(el.dataset.cost);
    for (const el of $$('[data-gems]', page)) el.disabled = s.gems < Number(el.dataset.gems);
    const freeBtn = $('[data-kind="free"]', page);
    if (freeBtn) freeBtn.disabled = ST.freeSummonIn(now) > 0;
    const claim = $('[data-need="chest"]', page);
    if (claim) claim.disabled = s.chest.gold < 1 && s.chest.gems < 1;
    const fastBtn = $('[data-act="fast"]', page);
    if (fastBtn) fastBtn.disabled = s.gems < ST.fastRewardCost(now);
    const chest = $('#chest-art', page);
    if (chest) chest.classList.toggle('full', s.chest.secs >= 3600);

    badges(now);
  }

  function badges(now) {
    const s = S();
    const set = (id, n) => {
      const el = $('#badge-' + id);
      el.hidden = !n;
      el.textContent = n === true ? '!' : n;
    };
    set('battle', s.chest.secs >= 3600 || ST.fastRewardCost(now) === 0 ? true : 0);
    set('heroes', s.party.some((id) => ST.canAscend(id) || D.levelCost(s.heroes[id].level) <= s.gold) ? true : 0);
    set('summon', ST.freeSummonIn(now) <= 0 || s.gems >= D.SUMMON_GEMS ? true : 0);
    set('camp', D.CAMP.some((c) => ST.campCanBuy(c.id)) || D.soulsFor(s.best) >= Math.max(5, s.souls * 0.5) ? true : 0);
    set('quests', ST.questsReady());
  }

  /* ---------- Sheets ---------- */

  function openSheet(html, onAct, cls) {
    const sheet = $('#sheet');
    sheet.className = 'sheet ' + (cls || '');
    sheet.innerHTML = '<div class="grip" aria-hidden="true"></div>' + html;
    sheet.hidden = false;
    $('#veil').hidden = false;
    sheetAct = onAct || null;
    drawPortraits(sheet);
    requestAnimationFrame(() => sheet.classList.add('up'));
  }

  function closeSheet() {
    const sheet = $('#sheet');
    sheet.classList.remove('up');
    sheet.hidden = true;
    $('#veil').hidden = true;
    sheetAct = null;
  }

  const sheetOpen = () => !$('#sheet').hidden;

  function confirmSheet(title, text, ok, onOk) {
    openSheet(`
      <h2>${title}</h2><p>${text}</p>
      <div class="sheet-btns"><button class="btn ghost" type="button" data-act="close">Cancel</button><button class="btn soul" type="button" data-act="ok">${ok}</button></div>`,
    (act) => { if (act === 'ok') { closeSheet(); onOk(); } });
  }

  function heroSheet(id) {
    const s = S();
    const def = D.HERO[id];
    const h = s.heroes[id];
    const role = D.ROLE[def.role];
    const rar = D.RARITY[def.rarity];
    if (!h) {
      openSheet(`
        <div class="hs-top" style="--rar:${rar.color}">
          <canvas class="big" data-portrait="${id}" data-locked="1"></canvas>
          <div><h2>${def.name}</h2><small>${def.title}</small><p class="rar">${rar.name} ${role.name}</p></div>
        </div>
        <p>${ROLE_TIPS[def.role]}</p>
        <p><b>${def.skill.name}:</b> ${skillText(def.skill)}</p>
        <p class="hint">Not found yet. Summon at the altar for a chance to recruit ${def.name}.</p>
        <div class="sheet-btns"><button class="btn" type="button" data-act="goto-summon">Go to the altar</button></div>`,
      (act) => { if (act === 'goto-summon') { closeSheet(); show('summon'); } });
      return;
    }
    const f = ST.heroFull(id);
    const inParty = s.party.includes(id);
    const need = D.ascendCost(h.stars);
    const plan = ST.levelPlan(id, lvlMode);
    openSheet(`
      <div class="hs-top" style="--rar:${rar.color}">
        <canvas class="big" data-portrait="${id}"></canvas>
        <div>
          <h2>${def.name}</h2><small>${def.title}</small>
          <p class="rar">${rar.name} ${role.name}</p>
          ${stars(h.stars)}
        </div>
      </div>
      <div class="hs-stats">
        <div><small>Level</small><b>${h.level}</b></div>
        <div><small>Attack</small><b>${fmt(f.atk)}</b></div>
        <div><small>Health</small><b>${fmt(f.hp)}</b></div>
        <div><small>Speed</small><b>${(1 / f.interval).toFixed(2)}/s</b></div>
      </div>
      <p>${ROLE_TIPS[def.role]}</p>
      <p><b>${def.skill.name}:</b> ${skillText(def.skill)}</p>
      <div class="ascend">
        <div><b>Ascend</b><small>${h.stars >= D.MAX_STARS ? 'Fully ascended!' : 'Copies ' + h.copies + '/' + need + ' → ' + (h.stars + 1) + ' stars, +45% stats'}</small></div>
        <button class="btn soul" type="button" data-act="ascend" ${ST.canAscend(id) ? '' : 'disabled'}>Ascend</button>
      </div>
      <div class="sheet-btns">
        <button class="btn ghost" type="button" data-act="party">${inParty ? 'Leave party' : 'Join party'}</button>
        <button class="btn gold" type="button" data-act="lvl" ${S().gold < plan.cost ? 'disabled' : ''}>Lv +${plan.n} · ${ico('gold')}${fmt(plan.cost)}</button>
      </div>`,
    (act) => {
      if (act === 'lvl') doLevel(id);
      else if (act === 'party') doParty(id);
      else if (act === 'ascend') {
        if (ST.ascend(id)) {
          WF.audio.play('legendary');
          toast(def.name + ' ascended to ' + S().heroes[id].stars + ' stars!');
          hooks.partyChanged();
        }
      }
      if (sheetOpen()) heroSheet(id);
      rebuild();
    });
  }

  function summonSheet(results, kind) {
    const best = results.some((r) => D.HERO[r.id].rarity === 'legendary');
    openSheet(`
      <h2>${results.length > 1 ? 'Your summons' : 'Summoned!'}</h2>
      <div class="summon-grid ${results.length === 1 ? 'one' : ''}">
        ${results.map((r, i) => {
          const def = D.HERO[r.id];
          const rar = D.RARITY[def.rarity];
          return `<div class="sr ${def.rarity}" style="--rar:${rar.color};--d:${i * 0.09}s">
            <canvas data-portrait="${r.id}"></canvas>
            <b>${def.name}</b><small>${r.isNew ? '<em>NEW</em>' : '+1 copy'}</small>
          </div>`;
        }).join('')}
      </div>
      <div class="sheet-btns">
        <button class="btn ghost" type="button" data-act="close">Done</button>
        ${kind !== 'free' ? `<button class="btn gold" type="button" data-act="again" ${S().gems < (kind === 'ten' ? D.SUMMON10_GEMS : D.SUMMON_GEMS) ? 'disabled' : ''}>Again · ${ico('gem')}${kind === 'ten' ? D.SUMMON10_GEMS : D.SUMMON_GEMS}</button>` : ''}
      </div>`,
    (act) => { if (act === 'again') doSummon(kind); }, 'summon-sheet');
    WF.audio.play(best ? 'legendary' : 'summon');
  }

  function welcome(away, gained) {
    openSheet(`
      <div class="welcome">
        <div class="chest full big" aria-hidden="true"><i class="lid"></i><i class="box"></i><i class="lock"></i><i class="shine"></i></div>
        <h2>Welcome back!</h2>
        <p>You were away for <b>${fmtTime(away)}</b>${away > D.AFK_CAP ? ' (the chest holds up to 12 hours)' : ''}. Your heroes kept fighting and filled the AFK chest with:</p>
        <div class="loot big">
          <span>${ico('gold')}<b>${fmt(gained.gold)}</b></span>
          <span>${ico('gem')}<b>${fmt(gained.gems)}</b></span>
        </div>
      </div>
      <div class="sheet-btns"><button class="btn gold" type="button" data-act="claim">Claim it all</button></div>`,
    (act) => { if (act === 'claim') { closeSheet(); doClaim(); } });
  }

  function settingsSheet() {
    const s = S();
    openSheet(`
      <h2>Settings</h2>
      <button class="card mini ${s.sound ? 'on' : ''}" type="button" data-act="sound" aria-pressed="${s.sound}">
        <span class="mini-ico">${svg('sound')}</span><span><b>Sound effects</b></span><em class="switch" aria-hidden="true"><i></i></em>
      </button>
      <h3 class="sub">How to play</h3>
      <ul class="howto">
        <li>Your party fights on its own. Every foe drops gold; spend it on <b>hero levels</b> and <b>camp upgrades</b>.</li>
        <li>Every 10th stage is a <b>boss</b>. Beat a stage within ${D.STAGE_TIME} seconds or your party falls back to farm; tap <b>Challenge</b> when you're stronger.</li>
        <li>The <b>AFK chest</b> fills even when the game is closed, for up to 12 hours. The further you've got, the more it collects.</li>
        <li>Spend gems at the <b>altar</b> to find new heroes. Up to ${D.PARTY_SIZE} can join the party; tanks and warriors stand at the front.</li>
        <li>Stuck? <b>Rebirth</b> at the camp's shrine for soul stones that make everyone permanently stronger.</li>
      </ul>
      <div class="sheet-btns"><button class="btn ghost danger" type="button" data-act="reset">Erase progress</button><button class="btn" type="button" data-act="close">Close</button></div>`,
    (act) => {
      if (act === 'sound') {
        s.sound = !s.sound;
        WF.audio.on = s.sound;
        settingsSheet();
      } else if (act === 'reset') {
        confirmSheet('Erase progress?', 'This deletes your heroes, gems and everything else on this device. It can\'t be undone.', 'Erase', () => hooks.reset());
      }
    });
  }

  /* ---------- Actions ---------- */

  function doLevel(id) {
    const n = ST.levelUp(id, lvlMode);
    if (n) {
      WF.audio.play('level');
      hooks.statsChanged();
    } else WF.audio.play('error');
  }

  function doParty(id) {
    const r = ST.toggleParty(id);
    if (r === 'full') { toast('The party is full. Tap a member to swap them out.'); WF.audio.play('error'); return; }
    if (r === 'last') { toast('Someone has to go adventuring!'); WF.audio.play('error'); return; }
    WF.audio.play('tap');
    hooks.partyChanged();
  }

  function doClaim() {
    const got = ST.claimChest();
    if (!got) return;
    WF.audio.play('coin');
    WF.audio.play('win');
    toast('Claimed ' + fmt(got.gold) + ' gold' + (got.gems ? ' and ' + got.gems + ' gems' : '') + '!');
    hooks.save();
    rebuild();
  }

  function doSummon(kind) {
    const res = ST.summon(kind, Date.now());
    if (!res) { WF.audio.play('error'); toast('Not enough gems.'); return; }
    hooks.save();
    if (res.some((r) => r.isNew)) hooks.partyChanged();
    summonSheet(res, kind);
    rebuild();
  }

  const ACTS = {
    tab: (el) => show(el.dataset.tab),
    claim: () => doClaim(),
    fast: () => {
      const got = ST.fastReward(Date.now());
      if (!got) { WF.audio.play('error'); return; }
      WF.audio.play('coin');
      toast('Fast rewards: +' + fmt(got.gold) + ' gold');
      hooks.save();
    },
    push: () => {
      const s = S();
      if (s.autoPush) {
        s.autoPush = false;
        s.stage = Math.max(1, s.best);
        toast('Auto-push off: your party will farm ' + D.stageLabel(s.stage) + '.');
      } else {
        ST.challenge();
        toast('Onward to ' + D.stageLabel(s.stage) + '!');
      }
      WF.audio.play('tap');
      hooks.restartBattle();
      rebuild();
    },
    challenge: () => {
      ST.challenge();
      WF.audio.play('tap');
      hooks.restartBattle();
      rebuild();
    },
    hero: (el) => { WF.audio.play('tap'); heroSheet(el.dataset.id); },
    lvl: (el) => { doLevel(el.dataset.id); rebuild(); },
    lvlmode: (el) => { lvlMode = Number(el.dataset.mode); rebuild(); },
    summon: (el) => doSummon(el.dataset.kind),
    camp: (el) => {
      if (ST.campBuy(el.dataset.id)) {
        WF.audio.play('buy');
        hooks.statsChanged();
        rebuild();
      }
    },
    rebirth: () => {
      const souls = D.soulsFor(S().best);
      confirmSheet('Rebirth?', `Your journey starts again from 1-1. Heroes go back to level 1, and gold and camp upgrades reset. You keep your heroes, stars and gems, and gain <b>${souls} soul stones</b> (+${souls * D.SOUL_BONUS * 100}% attack, health and gold).`, 'Rebirth', () => {
        const got = ST.rebirth();
        WF.audio.play('legendary');
        toast('Reborn! +' + got + ' soul stones.');
        hooks.restartBattle();
        hooks.save();
        rebuild();
      });
    },
    quest: (el) => {
      const g = ST.claimQuest(el.dataset.id);
      if (g) { WF.audio.play('buy'); toast('+' + g + ' gems'); hooks.save(); rebuild(); }
    },
    settings: () => settingsSheet(),
    close: () => closeSheet(),
  };

  function onClick(e) {
    WF.audio.unlock();
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const act = el.dataset.act;
    if (el.closest('#sheet') && act !== 'close') {
      if (sheetAct) sheetAct(act, el);
      return;
    }
    if (ACTS[act]) ACTS[act](el);
  }

  /* ---------- Toasts ---------- */

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  /* ---------- Battle HUD ---------- */

  function hud(b) {
    const s = S();
    if (!b) return;
    $('#stage-label').textContent = D.stageLabel(b.stage);
    $('#land-name').textContent = D.landOf(b.stage).name;
    $('#boss-tag').hidden = !b.boss;
    $('#farm-tag').hidden = s.autoPush;
    const k = b.phase === 'fight' ? Math.max(0, b.time / D.STAGE_TIME) : b.phase === 'enter' ? 1 : Math.max(0, b.time / D.STAGE_TIME);
    const bar = $('#timer-bar');
    bar.style.width = (k * 100).toFixed(1) + '%';
    bar.classList.toggle('low', k < 0.25);
    $('#btn-speed').textContent = '×' + s.speed;
  }

  /* ---------- Icons ---------- */

  const SVG = {
    sword: '<path d="M14.5 3.5l6 6-9 9-3-3zM8.5 15.5l-5 5M5 14l5 5"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
    drum: '<ellipse cx="12" cy="7" rx="8" ry="3"/><path d="M4 7v9c0 1.7 3.6 3 8 3s8-1.3 8-3V7M6 9l3 9M18 9l-3 9M3 2l5 4M21 2l-5 4"/>',
    coin: '<circle cx="12" cy="12" r="8"/><path d="M12 7v10M9.5 9.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    book: '<path d="M4 4h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4zM20 4h-6a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6z"/>',
    bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
    sound: '<path d="M4 9h4l5-4v14l-5-4H4zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>',
  };
  const svg = (k) => '<svg viewBox="0 0 24 24" aria-hidden="true">' + (SVG[k] || '') + '</svg>';

  /* ---------- Setup ---------- */

  function init(h) {
    hooks = h;
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && sheetOpen()) closeSheet();
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role="button"][data-act]')) { e.preventDefault(); onClick(e); }
    });
    $('#veil').addEventListener('click', closeSheet);
    $('#btn-settings').addEventListener('click', () => { WF.audio.play('tap'); settingsSheet(); });
    $$('.tab').forEach((t) => t.addEventListener('click', () => { WF.audio.play('tap'); }));
    show('battle');
  }

  WF.ui = { init, show, rebuild, refresh, hud, toast, welcome, closeSheet, sheetOpen, get tab() { return tab; } };
})(window.WF = window.WF || {});
