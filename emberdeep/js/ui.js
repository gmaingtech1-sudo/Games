/* Emberdeep — everything outside the battle canvas: the top bar, the HUD
   over the fight, the skill buttons, the five tabs (Heroes, Relics, Hearth,
   Feats, Shop), and the cards that pop up: time away, relics found,
   rekindling, the welcome and the ending. */
(function (ED) {
  'use strict';

  const U = ED.util;
  const D = ED.data;
  const E = ED.econ;
  const ST = ED.state;
  const A = ED.audio;
  const bus = ED.bus;
  const { fmt, pct } = { fmt: U.fmt, pct: D.pct };
  const $ = (id) => document.getElementById(id);
  const game = () => ED.game;
  const S = () => ED.game.S;

  let tab = 'heroes';
  let isDirty = true;
  let nextUpdate = 0;
  let modalOpen = false;
  let modalQueue = [];

  const el = {};
  const ids = [
    'gold', 'gold-rate', 'moon', 'embers', 'floor', 'biome', 'pips', 'boss-timer', 'boss-time', 'boss-time-bar',
    'btn-challenge', 'mon-name', 'hp-fill', 'hp-txt', 'hud-mon', 'banner', 'tap-hint', 'skills', 'party-dps', 'tap-dmg',
    'buy-amt', 'qm', 'qm-toggle', 'hero-list', 'relic-grid', 'relic-sum', 'rekindle', 'talents', 'feat-list', 'daily',
    'shop-list', 'stats', 'tabs', 'scrim', 'modal', 'sheet-settings', 'toasts', 'flare', 'panel',
    'btn-settings', 'settings-close', 'set-notation', 'btn-export', 'btn-import', 'save-code', 'btn-reset',
  ];

  // Prices round up, so you never see one you can't quite afford.
  const cost = (v) => (v < 1000 ? String(Math.ceil(v)) : fmt(v));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const coin = '<i class="coin" aria-hidden="true"></i>';
  const gem = '<i class="gem" aria-hidden="true"></i>';
  const flame = '<i class="flame" aria-hidden="true"></i>';

  /* ---------- Text ---------- */

  function fxText(fx, v) {
    switch (fx) {
      case 'gold': return `+${pct(v)} gold`;
      case 'heroDps': return `+${pct(v)} hero damage`;
      case 'tap': return `+${pct(v)} tap damage`;
      case 'crit': return `+${pct(v, 1)} critical chance`;
      case 'offlineH': return `Heroes keep delving ${U.fmt(v)}h longer while you're away`;
      case 'bossTime': return `+${U.fmt(v)}s to beat each boss`;
      case 'chest': return `+${pct(v, 1)} chest chance`;
      case 'critDmg': return `+×${U.fmt(v)} critical damage`;
      case 'wisp': return `Wisps appear ${pct(v)} more often`;
      case 'boss': return `+${pct(v)} damage to bosses`;
      case 'skillDur': return `Skills last ${pct(v)} longer`;
      case 'cdr': return `Skills recharge ${pct(v)} faster`;
      case 'ember': return `+${pct(v)} embers when you rekindle`;
      case 'leap': return `${pct(v, 1)} chance to drop straight past a floor`;
      case 'autoTap': return `Your torch strikes ${U.fmt(v)} time${v === 1 ? '' : 's'} a second by itself`;
      case 'tapShare': return `Taps deal +${pct(v, 1)} of party DPS`;
      case 'allDmg': return `+${pct(v)} to all damage`;
      case 'afk': return `+${pct(v)} damage and gold while you're away`;
      case 'party': return `+${pct(v)} party damage`;
      default: return '';
    }
  }
  function perkText(p) {
    const k = Object.keys(p).find((x) => x !== 'lv');
    return fxText(k, p[k]);
  }

  /* ---------- Top bar & HUD ---------- */

  const last = {};
  function setText(node, key, text) {
    if (last[key] === text) return;
    last[key] = text;
    node.textContent = text;
  }

  function hudFrame(now) {
    const s = S();
    const st = game().stats();
    setText(el.gold, 'gold', s.gold < 1000 ? String(Math.floor(s.gold)) : fmt(s.gold));
    setText(el['gold-rate'], 'rate', '+' + fmt(game().goldRate()) + '/s');
    setText(el.moon, 'moon', U.count(s.moon));
    setText(el.embers, 'embers', fmt(s.embers));

    const f = s.floor;
    const { biome, cycle } = E.biomeOf(f);
    setText(el.floor, 'floor', U.count(f));
    setText(el.biome, 'biome', biome.name + (cycle ? ' ' + ED.battle.roman(cycle + 1) : ''));

    const mon = ED.battle.monster();
    const boss = E.isBoss(f) && !s.farming;
    if (boss) {
      el.pips.hidden = true;
      el['boss-timer'].hidden = false;
      const t = s.bossT == null ? st.bossTime : Math.max(0, s.bossT);
      setText(el['boss-time'], 'bt', t.toFixed(1) + 's');
      el['boss-time-bar'].style.transform = `scaleX(${U.clamp(t / st.bossTime, 0, 1)})`;
      el['boss-timer'].classList.toggle('low', t < 8);
    } else {
      el.pips.hidden = false;
      el['boss-timer'].hidden = true;
      const key = s.farming ? 'farm' : st.mobs + '|' + s.mobKills;
      if (last.pips !== key) {
        last.pips = key;
        if (s.farming) el.pips.innerHTML = '<span class="farm">Farming · boss is too strong</span>';
        else {
          let h = '';
          for (let i = 0; i < st.mobs; i++) h += `<i class="${i < s.mobKills ? 'done' : ''}"></i>`;
          h += `<i class="bosspip${E.isBoss(f + 1) ? '' : ' off'}"></i>`;
          el.pips.innerHTML = h;
        }
      }
    }
    el['btn-challenge'].hidden = !s.farming;

    if (mon && !mon.dying) {
      el['hud-mon'].classList.remove('gone');
      el['hud-mon'].classList.toggle('boss', !!mon.boss);
      setText(el['mon-name'], 'mon', mon.name);
      const frac = U.clamp(s.hpFrac, 0, 1);
      el['hp-fill'].style.transform = `scaleX(${frac})`;
      setText(el['hp-txt'], 'hp', fmt(Math.max(0, frac * mon.maxHp)) + ' / ' + fmt(mon.maxHp));
    } else {
      el['hud-mon'].classList.add('gone');
    }
    el['tap-hint'].hidden = !(s.stats.taps < 6 && s.stats.playSec < 120 && !modalOpen);
  }

  /* ---------- Skills ---------- */

  const SKILL_ICON = {
    cry: '<path d="M4 10v4h3l5 4V6L7 10z"/><path d="M16 8a5 5 0 010 8M18.5 5.5a9 9 0 010 13"/>',
    midas: '<circle cx="12" cy="12" r="7"/><path d="M12 8v8M9.5 10.5c0-1.4 5-1.4 5 0s-5 1.6-5 3 5 1.4 5 0"/>',
    flurry: '<path d="M5 19L15 9M9 19L19 9M13 19l6-6M4 14l6-6M4 9l3-3"/>',
    star: '<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>',
    glass: '<path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9"/>',
  };
  const skillEls = {};

  function buildSkills() {
    el.skills.innerHTML = '';
    for (const sk of D.SKILLS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'skill';
      b.style.setProperty('--c', sk.color);
      b.innerHTML = `<span class="ring"></span><svg viewBox="0 0 24 24" aria-hidden="true">${SKILL_ICON[sk.id]}</svg><span class="cd"></span><span class="lock"><svg viewBox="0 0 24 24"><rect x="6" y="11" width="12" height="9" rx="2"/><path d="M9 11V8a3 3 0 016 0v3"/></svg><small>${sk.floor}</small></span>`;
      b.setAttribute('aria-label', `${sk.name}: ${sk.desc}`);
      b.addEventListener('click', () => {
        const ss = game().skillState(sk, Date.now());
        if (!ss.unlocked) {
          toast(`${sk.name} unlocks on floor ${sk.floor}. ${sk.desc}`);
          A.play('deny');
          return;
        }
        if (!ss.ready) {
          toast(`${sk.name} is recharging (${U.clock(ss.cdLeft)}).`);
          A.play('deny');
          return;
        }
        if (sk.id === 'glass') {
          confirmHourglass(sk);
          return;
        }
        game().cast(sk.id);
      });
      el.skills.appendChild(b);
      skillEls[sk.id] = b;
    }
  }

  function confirmHourglass(sk) {
    const st = game().stats();
    modal({
      cls: 'glass',
      html: `<div class="m-icon glass-ico"><svg viewBox="0 0 24 24">${SKILL_ICON.glass}</svg></div>
        <h2>Turn the Hourglass?</h2>
        <p>Your heroes live through <b>${U.duration(st.glassSec)}</b> of delving in an instant — every monster, boss and coin, as if you'd been away. Then it needs ${U.duration(sk.cd * st.cdMult)} to refill.</p>`,
      buttons: [{ text: 'Not yet', ghost: true }, { text: 'Turn it', cls: 'green', fn: () => game().cast('glass') }],
    });
  }

  function skillsFrame(now) {
    for (const sk of D.SKILLS) {
      const b = skillEls[sk.id];
      if (!b) continue;
      const ss = game().skillState(sk, now);
      const state = !ss.unlocked ? 'locked' : ss.activeLeft > 0 ? 'active' : ss.ready ? 'ready' : 'cooling';
      if (b.dataset.state !== state) b.dataset.state = state;
      let p = 0;
      let label = '';
      if (state === 'active') {
        p = ss.activeLeft / Math.max(1, sk.dur * game().stats().durMult);
        label = Math.ceil(ss.activeLeft) + 's';
      } else if (state === 'cooling') {
        p = 1 - ss.cdLeft / ss.cdTotal;
        label = U.clock(ss.cdLeft);
      }
      b.style.setProperty('--p', p.toFixed(3));
      const cd = b.querySelector('.cd');
      if (cd.textContent !== label) cd.textContent = label;
    }
  }

  /* ---------- Tabs ---------- */

  function setTab(t) {
    tab = t;
    for (const b of el.tabs.querySelectorAll('[data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === t));
    for (const p of document.querySelectorAll('.page')) p.hidden = p.dataset.page !== t;
    el.panel.scrollTop = 0;
    if (t === 'relics') S().seenHint.relicsSeen = ST.relicKinds(S()) + '|' + Object.values(S().relics).reduce((a, b) => a + b, 0);
    isDirty = true;
  }

  function badges() {
    const s = S();
    const set = (t, n) => {
      const b = el.tabs.querySelector(`[data-tab="${t}"] .badge`);
      const show = n > 0;
      if (b.hidden !== !show) b.hidden = !show;
      const txt = n > 1 ? String(Math.min(n, 99)) : '';
      if (b.textContent !== txt) b.textContent = txt;
    };
    set('feats', ST.featsReady(s));
    set('shop', game().dailyReady() ? 1 : 0);
    const relicKey = ST.relicKinds(s) + '|' + Object.values(s.relics).reduce((a, b) => a + b, 0);
    set('relics', tab !== 'relics' && s.seenHint.relicsSeen !== undefined && s.seenHint.relicsSeen !== relicKey && relicKey !== '0|0' ? 1 : 0);
    const gain = ST.rekindleGain(s);
    const canTalent = D.TALENTS.some((t) => (s.talents[t.id] || 0) < t.max && E.talentCost(t, s.talents[t.id] || 0) <= s.embers);
    set('hearth', (gain > 0 && s.stats.rekindles === 0) || canTalent ? 1 : 0);
    // A new hero you can afford to hire.
    const next = D.HEROES.find((h) => !(s.heroes[h.id] > 0));
    set('heroes', tab !== 'heroes' && next && s.gold >= next.cost ? 1 : 0);
  }

  /* ---------- Heroes ---------- */

  let heroKey = '';
  const heroEls = {};

  function visibleHeroes() {
    const s = S();
    const out = [];
    let shownLocked = 0;
    for (const h of D.HEROES) {
      const lv = s.heroes[h.id] || 0;
      if (lv > 0) out.push({ h, mode: 'hired' });
      else if (shownLocked === 0) { out.push({ h, mode: 'next' }); shownLocked++; }
      else if (shownLocked === 1) { out.push({ h, mode: 'teaser' }); shownLocked++; }
    }
    return out;
  }

  function buildHeroes() {
    const list = visibleHeroes();
    const key = list.map((x) => x.h.id + x.mode).join(',');
    if (key === heroKey) return;
    heroKey = key;
    const box = el['hero-list'];
    box.innerHTML = '';
    // The torch, always first.
    const torch = document.createElement('div');
    torch.className = 'card hero-card torch-card';
    torch.innerHTML = `
      <div class="portrait torch-art" aria-hidden="true"><svg viewBox="0 0 48 48"><path class="tf" d="M24 6c5 6 9 9 9 15a9 9 0 01-18 0c0-4 2-6 4-9 0 3 1 5 3 6-1-4 0-8 2-12z"/><path class="tf2" d="M24 16c3 4 5 6 5 9a5 5 0 01-10 0c0-3 2-5 5-9z"/><path class="th" d="M19 31h10l-2 14h-6z"/></svg></div>
      <div class="info">
        <div class="name-row"><b>Your Torch</b><span class="lv" data-k="lv"></span></div>
        <div class="dps-row"><span data-k="dps"></span></div>
        <div class="ms"><i data-k="bar"></i><span data-k="ms"></span></div>
      </div>
      <button class="buy" type="button"><span class="buy-n" data-k="n"></span><span class="buy-c">${coin}<span data-k="c"></span></span></button>`;
    torch.querySelector('.buy').addEventListener('click', () => { if (game().buyTorch()) updateHeroes(true); });
    box.appendChild(torch);
    heroEls.torch = torch;
    for (const { h, mode } of list) {
      const c = document.createElement('div');
      c.className = 'card hero-card ' + mode;
      c.dataset.id = h.id;
      if (mode === 'teaser') {
        c.innerHTML = `<img class="portrait shadow" src="${ED.art.portrait(h)}" alt=""><div class="info"><div class="name-row"><b>???</b></div><div class="blurb">Someone else is waiting deeper down. Hire ${esc(list.find((x) => x.mode === 'next').h.name)} first.</div></div>`;
      } else {
        c.innerHTML = `
          <img class="portrait" src="${ED.art.portrait(h)}" alt="">
          <div class="info">
            <div class="name-row"><b>${esc(h.name)}</b><span class="cls">${esc(h.cls)}</span><span class="lv" data-k="lv"></span></div>
            ${mode === 'next' ? `<div class="blurb">${esc(h.blurb)}</div>` : ''}
            <div class="dps-row"><span data-k="dps"></span><span class="share" data-k="share"></span></div>
            <div class="ms"><i data-k="bar"></i><span data-k="ms"></span></div>
            <div class="perk" data-k="perk"></div>
          </div>
          <button class="buy" type="button"><span class="buy-n" data-k="n"></span><span class="buy-c">${coin}<span data-k="c"></span></span></button>`;
        c.querySelector('.buy').addEventListener('click', () => {
          if (game().buyHero(h.id)) {
            buildHeroes();
            updateHeroes(true);
          }
        });
      }
      box.appendChild(c);
      heroEls[h.id] = c;
    }
  }

  function q(card, k) {
    card._q = card._q || {};
    return card._q[k] || (card._q[k] = card.querySelector(`[data-k="${k}"]`));
  }
  function put(card, k, text) {
    const n = q(card, k);
    if (n && n.textContent !== text) n.textContent = text;
  }

  function updateHeroes() {
    buildHeroes();
    const s = S();
    const st = game().stats();
    setText(el['party-dps'], 'pdps', fmt(st.party));
    setText(el['tap-dmg'], 'tdmg', fmt(st.tap));
    el.qm.hidden = !st.autoBuy;
    el['qm-toggle'].checked = !!s.settings.autoBuy;

    // torch
    const t = heroEls.torch;
    const TL = s.torch;
    const tn = game().torchLevelsFor(TL);
    const tc = E.torchCost(TL, tn);
    put(t, 'lv', 'Lv ' + TL);
    put(t, 'dps', `${fmt(st.tap)} per tap · ${pct(st.critChance, 1)} crit ×${fmt(st.critMult)}`);
    const tnext = (Math.floor(TL / 25) + 1) * 25;
    q(t, 'bar').style.transform = `scaleX(${(TL % 25) / 25})`;
    put(t, 'ms', `×2 tap damage at Lv ${tnext}`);
    put(t, 'n', '+' + tn);
    put(t, 'c', cost(tc));
    t.classList.toggle('afford', s.gold >= tc);

    for (const h of D.HEROES) {
      const c = heroEls[h.id];
      if (!c || c.classList.contains('teaser') || !c.isConnected) continue;
      const L = s.heroes[h.id] || 0;
      const n = game().levelsFor(h, L);
      const price = E.heroCost(h, L, n);
      put(c, 'lv', L ? 'Lv ' + U.count(L) : '');
      const dps = st.heroDps[h.id] || 0;
      if (L) {
        put(c, 'dps', fmt(dps) + ' DPS');
        put(c, 'share', st.party > 0 ? Math.round((dps / st.party) * 100) + '%' : '');
      } else {
        const per = E.heroBase(h, 1) * st.heroMult;
        put(c, 'dps', `+${fmt(per)} DPS when hired`);
        put(c, 'share', '');
      }
      const nm = E.nextMilestone(L);
      const prev = L < 10 ? 0 : L < 25 ? 10 : Math.floor(L / 25) * 25;
      q(c, 'bar').style.transform = `scaleX(${U.clamp((L - prev) / Math.max(1, nm - prev), 0, 1)})`;
      put(c, 'ms', `×${nm % 200 === 0 ? 8 : 2} damage at Lv ${U.count(nm)}`);
      const perk = h.perks.find((p) => L < p.lv);
      put(c, 'perk', perk ? `Lv ${perk.lv}: ${perkText(perk)}` : 'Every perk learned');
      put(c, 'n', L ? '+' + U.count(n) : 'Hire');
      put(c, 'c', cost(price));
      c.classList.toggle('afford', s.gold >= price);
    }
  }

  /* ---------- Relics ---------- */

  function buildRelics() {
    const s = S();
    const st = game().stats();
    const kinds = ST.relicKinds(s);
    const levels = Object.values(s.relics).reduce((a, b) => a + b, 0);
    el['relic-sum'].innerHTML = `
      <div class="pill"><b>${kinds}</b>/${D.RELICS.length} found</div>
      <div class="pill"><b>${levels}</b> levels</div>
      <div class="pill"><b>${pct(st.chest)}</b> chest chance per Guardian</div>
      <div class="pill">Next new Guardian: <b>floor ${U.count(s.bestGuardian + D.FLOORS_PER_BIOME)}</b></div>
      <button class="btn small moon-btn" type="button" id="btn-buy-chest">Open a chest · ${gem}120</button>`;
    $('btn-buy-chest').addEventListener('click', () => {
      if (game().shop('chest')) buildRelics();
    });
    const grid = el['relic-grid'];
    grid.innerHTML = '';
    const order = ['common', 'rare', 'epic', 'legendary'];
    for (const r of [...D.RELICS].sort((a, b) => order.indexOf(a.rarity) - order.indexOf(b.rarity))) {
      const lv = s.relics[r.id] || 0;
      const rar = D.RARITY[r.rarity];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'relic' + (lv ? '' : ' unknown');
      b.style.setProperty('--rc', rar.color);
      b.innerHTML = lv
        ? `<img src="${ED.art.relicIcon(r)}" alt=""><span class="rlv">${lv >= D.RELIC_MAX ? 'MAX' : 'Lv ' + lv}</span>`
        : '<span class="q">?</span>';
      b.setAttribute('aria-label', lv ? `${r.name}, level ${lv}` : `Undiscovered ${rar.name} relic`);
      b.addEventListener('click', () => showRelicInfo(r));
      grid.appendChild(b);
    }
  }

  function showRelicInfo(r) {
    const lv = S().relics[r.id] || 0;
    const rar = D.RARITY[r.rarity];
    if (!lv) {
      modal({ html: `<div class="relic-big unknown" style="--rc:${rar.color}"><span class="q">?</span></div><h2>Undiscovered</h2><p class="rar" style="color:${rar.color}">${rar.name} relic</p><p>Still somewhere in the deep. Guardians might be carrying it.</p>`, buttons: [{ text: 'OK' }] });
      return;
    }
    modal({
      html: `<div class="relic-big" style="--rc:${rar.color}"><img src="${ED.art.relicIcon(r)}" alt=""></div>
        <h2>${esc(r.name)}</h2>
        <p class="rar" style="color:${rar.color}">${rar.name} · Level ${lv}${lv >= D.RELIC_MAX ? ' (max)' : ` of ${D.RELIC_MAX}`}</p>
        <p class="fx-now">${fxText(r.fx, r.per * lv)}</p>
        <p class="muted">${lv < D.RELIC_MAX ? `Each level: ${fxText(r.fx, r.per)}` : 'Fully grown. More copies turn into moonstones.'}</p>`,
      buttons: [{ text: 'OK' }],
    });
  }

  function showRelics(list, why) {
    if (!list || !list.length) return;
    A.play('chest');
    setTimeout(() => A.play('relic'), 250);
    const head = why === 'guardian' ? 'The Guardian dropped a chest!' : why === 'daily' ? 'Today\'s chest' : why === 'shop' ? 'You open the chest…' : 'A relic chest!';
    const items = list.map((x) => {
      const r = D.relic(x.id);
      const rar = D.RARITY[r.rarity];
      const what = x.moon ? `Already at its peak: +${x.moon} moonstones` : x.isNew ? 'New relic!' : `Level ${x.level - 1} → ${x.level}`;
      return `<div class="found" style="--rc:${rar.color}">
          <div class="relic-big pop"><img src="${ED.art.relicIcon(r)}" alt=""></div>
          <h3>${esc(r.name)}</h3>
          <p class="rar" style="color:${rar.color}">${rar.name}</p>
          <p class="what ${x.isNew ? 'new' : ''}">${what}</p>
          <p class="fx-now">${fxText(r.fx, r.per * Math.max(1, x.level))}</p>
        </div>`;
    }).join('');
    modal({ cls: 'relic-modal', html: `<h2>${head}</h2>${items}`, buttons: [{ text: 'Wonderful' }] });
    isDirty = true;
  }

  /* ---------- Hearth ---------- */

  function buildHearth() {
    const s = S();
    const st = ST.stats(s);
    const gain = ST.rekindleGain(s);
    const can = gain > 0;
    const best = s.bestFloorRun;
    const need = E.T.emberFloor;
    el.rekindle.innerHTML = `
      <div class="rk-head">
        <div class="rk-fire" aria-hidden="true"><svg viewBox="0 0 48 48"><path class="tf" d="M24 4c6 7 11 11 11 18a11 11 0 01-22 0c0-5 3-8 5-11 0 4 1 6 4 7-2-5 0-10 2-14z"/><path class="tf2" d="M24 18c3 4 6 6 6 10a6 6 0 01-12 0c0-3 3-6 6-10z"/></svg></div>
        <div>
          <h3>Rekindle the Hearth</h3>
          <p>Lead your party back to the surface and feed the embers you found to the village Hearth. Its warmth makes every hero stronger, forever.</p>
        </div>
      </div>
      <div class="rk-nums">
        <div><small>Deepest this run</small><b data-k="best">${U.count(best)}</b></div>
        <div><small>Embers you'd bring back</small><b class="em">${flame}<span data-k="gain">${fmt(gain)}</span></b></div>
        <div><small>Hearth warmth</small><b>×${fmt(st.warm)}</b></div>
      </div>
      <button class="btn ember-btn" id="btn-rekindle" type="button" data-k="btn" ${can ? '' : 'disabled'}>${can ? `Rekindle · +${fmt(gain)} embers` : `Reach floor ${need} to rekindle`}</button>
      <p class="small">Heroes, gold and floors start over. Embers, talents, relics, moonstones and feats are yours to keep.${s.stats.rekindles ? '' : ' <b>Tip:</b> your first embers buy the Quartermaster, who levels your heroes while you\'re away.'}</p>
      ${s.embersTotal ? `<p class="small warmth">${fmt(s.embersTotal)} embers earned in all · warmth ×${fmt(st.warm)} to damage and gold</p>` : ''}`;
    $('btn-rekindle').addEventListener('click', confirmRekindle);

    const box = el.talents;
    box.innerHTML = `<div class="em-have">You have <b>${flame}${fmt(s.embers)}</b> embers to spend</div>`;
    for (const br of D.BRANCHES) {
      const sec = document.createElement('div');
      sec.className = 'branch';
      sec.style.setProperty('--bc', br.color);
      sec.innerHTML = `<h4>${br.name}</h4>`;
      for (const t of D.TALENTS.filter((x) => x.branch === br.id)) {
        const lv = s.talents[t.id] || 0;
        const maxed = lv >= t.max;
        const cost = maxed ? 0 : E.talentCost(t, lv);
        const now = lv ? t.text(t.per * lv, lv) : null;
        const next = maxed ? null : t.text(t.per * (lv + 1), lv + 1);
        const row = document.createElement('div');
        row.className = 'talent' + (lv ? ' owned' : '') + (maxed ? ' maxed' : '');
        row.innerHTML = `
          <div class="t-info">
            <div class="t-top"><b>${esc(t.name)}</b><span class="t-lv">${t.max > 100 ? 'Lv ' + lv : lv + '/' + t.max}</span></div>
            <div class="t-txt">${now ? esc(now) : esc(next)}</div>
            ${now && next ? `<div class="t-next">Next: ${esc(next)}</div>` : ''}
          </div>
          <button class="buy ember-buy ${!maxed && s.embers >= cost ? 'afford' : ''}" type="button" ${maxed ? 'disabled' : ''}>${maxed ? 'Max' : `${flame}${fmt(cost)}`}</button>`;
        row.querySelector('button').addEventListener('click', () => {
          if (game().buyTalent(t.id)) buildHearth();
        });
        sec.appendChild(row);
      }
      box.appendChild(sec);
    }
  }

  function confirmRekindle() {
    const s = S();
    const gain = ST.rekindleGain(s);
    if (!gain) return;
    const st = ST.stats(s);
    const after = ST.defaults(0);
    after.embersTotal = s.embersTotal + gain;
    after.talents = s.talents;
    const warmAfter = E.warmth(after);
    const start = E.startFloor(s, st);
    modal({
      cls: 'rk-modal',
      html: `<div class="m-icon fire-ico">${flame}</div><h2>Rekindle the Hearth?</h2>
        <p>You'll bring back <b class="em">${fmt(gain)} embers</b>. The Hearth's warmth goes from <b>×${fmt(st.warm)}</b> to <b>×${fmt(warmAfter)}</b>.</p>
        <p class="muted">Your heroes rest, your gold is spent on the Hearth, and the next delve starts from floor ${U.count(start)}.</p>`,
      buttons: [{ text: 'Keep delving', ghost: true }, { text: 'Rekindle', cls: 'ember-btn', fn: () => {
        const g = game().rekindle();
        if (g) {
          setTimeout(() => toast(`The Hearth roars! +${fmt(g)} embers. Spend them on talents.`, 'ember'), 900);
          setTab('hearth');
        }
      } }],
    });
  }

  function flare() {
    const f = el.flare;
    f.hidden = false;
    f.classList.remove('go');
    void f.offsetWidth;
    f.classList.add('go');
    setTimeout(() => { f.hidden = true; }, 2200);
  }

  /* ---------- Feats ---------- */

  function buildFeats() {
    const s = S();
    const box = el['feat-list'];
    box.innerHTML = '';
    const rows = D.FEATS.map((f) => ({ f, ready: ST.featReady(s, f), tier: s.feats[f.id] || 0 }));
    rows.sort((a, b) => (b.ready > 0) - (a.ready > 0) || (a.tier >= a.f.tiers.length) - (b.tier >= b.f.tiers.length));
    for (const { f, ready, tier } of rows) {
      const done = tier >= f.tiers.length;
      const target = f.tiers[Math.min(tier, f.tiers.length - 1)];
      const v = ST.featValue(s, f.stat);
      const p = done ? 1 : U.clamp(v / target, 0, 1);
      const reward = D.featReward(tier);
      const row = document.createElement('div');
      row.className = 'card feat' + (ready ? ' ready' : '') + (done ? ' done' : '');
      row.dataset.id = f.id;
      let stars = '';
      for (let i = 0; i < f.tiers.length; i++) stars += `<i class="${i < tier ? 'on' : ''}"></i>`;
      const tv = f.stat === 'goldTotal' ? fmt(target) : U.count(target);
      row.innerHTML = `
        <div class="info">
          <div class="name-row"><b>${esc(f.name)}</b><span class="stars">${stars}</span></div>
          <div class="what">${done ? 'Every tier complete' : `${esc(f.what)}: ${tv}`}</div>
          <div class="ms"><i data-k="bar" style="transform:scaleX(${p})"></i><span data-k="txt">${done ? '' : (f.stat === 'goldTotal' ? fmt(v) : U.count(Math.floor(v))) + ' / ' + tv}</span></div>
        </div>
        <button class="buy claim ${ready ? 'afford' : ''}" type="button" ${ready ? '' : 'disabled'}>${done ? '✓' : `${gem}${reward}`}</button>`;
      row.querySelector('button').addEventListener('click', () => {
        const m = game().claimFeat(f.id);
        if (m) {
          toast(`${f.name}: +${m} moonstones`, 'moon');
          buildFeats();
        }
      });
      box.appendChild(row);
    }
  }

  /* ---------- Shop ---------- */

  function buildShop() {
    const s = S();
    const ready = game().dailyReady();
    const step = s.daily.step;
    let days = '';
    for (let i = 0; i < 7; i++) {
      const d = D.DAILY[(Math.floor(step / 7) * 7 + i) % 7];
      const idx = Math.floor(step / 7) * 7 + i;
      const cls = idx < step ? 'got' : idx === step && ready ? 'today' : '';
      const ico = d.kind === 'moon' ? gem : d.kind === 'gold' ? coin : d.kind === 'chest' ? '<i class="chest-ico"></i>' : '<i class="glass-mini"></i>';
      days += `<div class="day ${cls}"><small>Day ${i + 1}</small>${ico}<span>${d.kind === 'moon' ? d.n : d.kind === 'gold' ? d.n + 'm' : d.kind === 'time' ? '1h' : '1'}</span></div>`;
    }
    const today = D.DAILY[step % 7];
    el.daily.innerHTML = `
      <div class="daily-head"><h3>Daily gift</h3><small>${ready ? `Today: ${today.label}` : 'Come back tomorrow for the next one'}</small></div>
      <div class="days">${days}</div>
      <button class="btn ${ready ? 'gold-btn' : ''}" type="button" id="btn-daily" ${ready ? '' : 'disabled'}>${ready ? 'Claim' : 'Claimed today'}</button>`;
    $('btn-daily').addEventListener('click', () => {
      if (game().claimDaily()) buildShop();
    });

    const list = el['shop-list'];
    list.innerHTML = '';
    for (const it of D.SHOP) {
      const row = document.createElement('div');
      row.className = 'card shop-item';
      const left = it.id === 'banner' && s.buffs.banner > Date.now() ? ` <span class="active-tag">${U.duration((s.buffs.banner - Date.now()) / 1000)} left</span>` : '';
      row.innerHTML = `<div class="info"><b>${esc(it.name)}</b>${left}<div class="what">${esc(it.desc)}</div></div>
        <button class="buy moon-buy ${s.moon >= it.cost ? 'afford' : ''}" type="button">${gem}${it.cost}</button>`;
      row.querySelector('button').addEventListener('click', () => {
        if (game().shop(it.id)) buildShop();
      });
      list.appendChild(row);
    }

    liveShop(true);
  }

  function statCells() {
    const s = S();
    const st = ST.stats(s);
    const t = s.stats;
    return [
      ['Deepest floor', U.count(s.bestFloor)], ['This run', U.count(s.bestFloorRun)], ['Monsters', U.count(t.kills)], ['Bosses', U.count(t.bosses)],
      ['Gold earned', fmt(t.goldTotal)], ['Rekindled', U.count(t.rekindles)], ['Taps', U.count(t.taps)], ['Critical hits', U.count(t.crits)],
      ['Wisps caught', U.count(t.wisps)], ['Chests', U.count(t.chests)], ['Time away', U.duration(t.afkSec)], ['Time playing', U.duration(t.playSec)],
      ['Away limit', U.duration(st.offlineCap)], ['Boss timer', st.bossTime + 's'],
    ];
  }

  function liveShop(build) {
    const cells = statCells();
    if (build || el.stats.children.length !== cells.length) {
      el.stats.innerHTML = cells.map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join('');
      return;
    }
    cells.forEach(([, v], i) => {
      const b = el.stats.children[i].lastChild;
      if (b.textContent !== v) b.textContent = v;
    });
  }

  function liveHearth() {
    const s = S();
    const box = el.rekindle;
    const gain = ST.rekindleGain(s);
    const set = (k, v) => { const n = box.querySelector(`[data-k="${k}"]`); if (n && n.textContent !== v) n.textContent = v; };
    set('best', U.count(s.bestFloorRun));
    set('gain', fmt(gain));
    if (gain > 0) set('btn', `Rekindle · +${fmt(gain)} embers`);
  }

  function liveFeats() {
    const s = S();
    for (const row of el['feat-list'].children) {
      const f = D.FEATS.find((x) => x.id === row.dataset.id);
      if (!f) continue;
      const tier = s.feats[f.id] || 0;
      if (tier >= f.tiers.length) continue;
      const target = f.tiers[tier];
      const v = ST.featValue(s, f.stat);
      const bar = row.querySelector('[data-k="bar"]');
      const txt = row.querySelector('[data-k="txt"]');
      bar.style.transform = `scaleX(${U.clamp(v / target, 0, 1)})`;
      const tv = f.stat === 'goldTotal' ? fmt(target) : U.count(target);
      const t2 = (f.stat === 'goldTotal' ? fmt(v) : U.count(Math.floor(v))) + ' / ' + tv;
      if (txt.textContent !== t2) txt.textContent = t2;
    }
  }

  // What each list page shows, boiled down: it's rebuilt only when this changes.
  function sig(page) {
    const s = S();
    switch (page) {
      case 'relics': return JSON.stringify(s.relics) + '|' + (s.moon >= 120) + '|' + s.bestGuardian + '|' + Math.floor(s.floor / 25);
      case 'hearth': return [s.embers, JSON.stringify(s.talents), s.embersTotal, ST.rekindleGain(s) > 0, s.stats.rekindles].join('|');
      case 'feats': return D.FEATS.map((f) => ST.featReady(s, f) + ':' + (s.feats[f.id] || 0)).join(',');
      case 'shop': return [s.moon, game().dailyReady(), s.daily.step, Math.ceil(((s.buffs.banner || 0) - Date.now()) / 60000)].join('|');
      default: return '';
    }
  }
  const sigs = {};

  /* ---------- Refresh ---------- */

  function render() {
    if (tab === 'heroes') updateHeroes();
    else if (tab === 'relics') buildRelics();
    else if (tab === 'hearth') buildHearth();
    else if (tab === 'feats') buildFeats();
    else if (tab === 'shop') buildShop();
  }

  // Keep what's on screen current. The hero list updates in place; the
  // other pages are rebuilt only when what they show has changed (and not
  // mid-scroll), with their fast-moving numbers updated in place.
  function frame(now) {
    hudFrame(now);
    skillsFrame(now);
    if (now < nextUpdate && !isDirty) return;
    nextUpdate = now + 250;
    badges();
    if (tab === 'heroes') updateHeroes();
    else {
      const k = sig(tab);
      if (isDirty || (k !== sigs[tab] && !userBusy())) {
        sigs[tab] = k;
        render();
      }
      if (tab === 'hearth') liveHearth();
      else if (tab === 'feats') liveFeats();
      else if (tab === 'shop') liveShop(false);
    }
    isDirty = false;
  }
  // Don't rebuild a list under a finger mid-scroll.
  let touchT = 0;
  const userBusy = () => Date.now() - touchT < 1200;

  function refresh() {
    heroKey = '';
    isDirty = true;
    ED.battle.placeHeroes();
  }

  /* ---------- Toasts, banners, modals ---------- */

  function toast(msg, kind) {
    const t = document.createElement('div');
    t.className = 'toast' + (kind ? ' t-' + kind : '');
    t.textContent = msg;
    el.toasts.appendChild(t);
    while (el.toasts.children.length > 3) el.toasts.firstChild.remove();
    setTimeout(() => t.classList.add('out'), 2600);
    setTimeout(() => t.remove(), 3100);
  }

  let bannerT = 0;
  function banner(text, kind) {
    const b = el.banner;
    b.className = 'banner ' + (kind || '');
    b.innerHTML = text;
    b.hidden = false;
    void b.offsetWidth;
    b.classList.add('show');
    clearTimeout(bannerT);
    bannerT = setTimeout(() => { b.hidden = true; b.classList.remove('show'); }, 1900);
  }

  // o: { html, buttons: [{ text, fn, cls, ghost }], cls, sticky }
  function modal(o) {
    if (modalOpen) {
      modalQueue.push(o);
      return;
    }
    modalOpen = true;
    const m = el.modal;
    m.className = 'modal ' + (o.cls || '');
    m.innerHTML = `<div class="m-body">${o.html}</div><div class="m-btns"></div>`;
    const bx = m.querySelector('.m-btns');
    for (const b of o.buttons || [{ text: 'OK' }]) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn ' + (b.ghost ? 'ghost ' : '') + (b.cls || '');
      btn.textContent = b.text;
      btn.addEventListener('click', () => {
        A.play('click');
        closeModal();
        if (b.fn) b.fn();
      });
      bx.appendChild(btn);
    }
    m.hidden = false;
    el.scrim.hidden = false;
    m._sticky = !!o.sticky;
  }

  function closeModal() {
    el.modal.hidden = true;
    el.modal.innerHTML = '';
    modalOpen = false;
    if (!sheetOpen) el.scrim.hidden = true;
    isDirty = true;
    if (modalQueue.length) setTimeout(() => modal(modalQueue.shift()), 120);
  }

  /* ---------- Time away ---------- */

  function showAway(sum) {
    const s = S();
    const st = ST.stats(s);
    const title = sum.why === 'glass' ? 'The Hourglass turns…' : sum.why === 'flask' ? 'You drink the Time Flask…' : sum.why === 'daily' ? 'Time flies…' : 'While you were away';
    const sub = sum.why === 'away'
      ? `You were gone ${U.duration(sum.away)}.${sum.capped ? ` Your party delved for ${U.duration(sum.cap)}, then made camp.` : ' Your party kept delving.'}`
      : `${U.duration(sum.sec)} of delving passed in an instant.`;
    const floorLine = sum.from.floor === sum.floorTo ? U.count(sum.floorTo) : `${U.count(sum.from.floor)} → ${U.count(sum.floorTo)}`;
    // One tile per relic, however many copies turned up.
    const found = new Map();
    for (const x of sum.relics) {
      const f = found.get(x.id) || { n: 0, isNew: false };
      f.n += 1;
      f.isNew = f.isNew || x.isNew;
      found.set(x.id, f);
    }
    const relics = found.size
      ? `<div class="away-relics">${[...found].map(([id, f]) => { const r = D.relic(id); return `<div class="mini-relic" style="--rc:${D.RARITY[r.rarity].color}" title="${esc(r.name)}"><img src="${ED.art.relicIcon(r)}" alt="${esc(r.name)}">${f.isNew ? '<em>new</em>' : ''}${f.n > 1 ? `<b>×${f.n}</b>` : ''}</div>`; }).join('')}</div>`
      : '';
    let tip = '';
    if (!st.autoBuy && s.embers >= 1) tip = 'You can afford the <b>Quartermaster</b> at the Hearth: he\'ll level your heroes while you\'re gone.';
    else if (!st.autoBuy && sum.why === 'away' && sum.gold > s.gold * 0.5) tip = `You came back to <b>${fmt(s.gold)} gold</b>. Spend it on your heroes! Reach floor ${E.T.emberFloor} and rekindle to unlock the Quartermaster, who levels them while you're away.`;
    else if (s.farming) tip = 'Your party is stuck below a boss. Level them up, then they\'ll try again.';
    if (sum.capped && !tip) tip = 'Talents in the Hearth\'s <b>Time</b> branch let your party delve for longer while you\'re away.';
    modal({
      cls: 'away',
      html: `<div class="m-icon away-ico"><svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/></svg></div>
        <h2>${title}</h2>
        <p class="sub">${sub}</p>
        <div class="away-grid">
          <div><small>Floor</small><b>${floorLine}</b></div>
          <div><small>Gold earned</small><b class="g">${coin}${fmt(sum.gold)}</b></div>
          <div><small>Monsters</small><b>${U.count(Math.floor(sum.kills))}</b></div>
          <div><small>Bosses</small><b>${U.count(sum.bosses)}</b></div>
          ${sum.levels ? `<div><small>Hero levels</small><b>+${U.count(sum.levels)}</b></div>` : ''}
          ${sum.moon ? `<div><small>Moonstones</small><b>${gem}${sum.moon}</b></div>` : ''}
        </div>
        ${relics}
        ${tip ? `<p class="tip">${tip}</p>` : ''}`,
      buttons: [{ text: sum.why === 'away' ? 'Welcome back' : 'Onward', cls: 'gold-btn' }],
    });
    if (sum.relics.length) A.play('relic');
    else A.play('gold');
  }

  function welcome() {
    modal({
      cls: 'welcome',
      html: `<div class="m-icon fire-ico">${flame}</div>
        <h2>Emberdeep</h2>
        <p>The village Hearth is going out. Somewhere under the mountain, old embers still glow — floor after floor of them, all the way down.</p>
        <p><b>Hire heroes</b> with gold and they'll fight for you. <b>Tap</b> to strike with your torch. When they can't go deeper, <b>rekindle</b> the Hearth and start again, stronger.</p>
        <p class="muted">And when you put your phone down, your party keeps delving.</p>`,
      buttons: [{ text: 'Light the torch', cls: 'gold-btn', fn: () => { A.unlock(); } }],
    });
  }

  function ending() {
    modal({
      cls: 'welcome',
      html: `<div class="m-icon fire-ico">${flame}</div>
        <h2>The Ember Heart</h2>
        <p>Five thousand floors down, at the very root of the mountain, the last Guardian falls. Behind it, the Ember Heart beats — the fire every ember came from.</p>
        <p>Your party carries a spark of it home, and the village Hearth will never go out again.</p>
        <p class="muted">+500 moonstones. The deep goes on, if you want it to — but nothing down there gets any stronger. Thank you for delving.</p>`,
      buttons: [{ text: 'Keep going', cls: 'gold-btn' }],
    });
  }

  /* ---------- Settings ---------- */

  let sheetOpen = false;
  let resetArmed = 0;

  function openSettings() {
    const s = S();
    for (const inp of document.querySelectorAll('[data-setting]')) inp.checked = !!s.settings[inp.dataset.setting];
    for (const b of el['set-notation'].querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.v === s.settings.notation));
    el['save-code'].hidden = true;
    el['save-code'].value = '';
    el['btn-reset'].textContent = 'Erase everything';
    resetArmed = 0;
    el['sheet-settings'].hidden = false;
    el.scrim.hidden = false;
    sheetOpen = true;
  }
  function closeSettings() {
    el['sheet-settings'].hidden = true;
    sheetOpen = false;
    if (!modalOpen) el.scrim.hidden = true;
  }

  function bindSettings() {
    el['btn-settings'].addEventListener('click', () => { A.play('click'); openSettings(); });
    el['settings-close'].addEventListener('click', () => { A.play('click'); closeSettings(); });
    el.scrim.addEventListener('click', () => {
      if (sheetOpen) closeSettings();
      else if (modalOpen && !el.modal._sticky) closeModal();
    });
    document.addEventListener('change', (e) => {
      const k = e.target.dataset && e.target.dataset.setting;
      if (!k) return;
      S().settings[k] = e.target.checked;
      game().applySettings();
      if (k === 'saver') ED.battle.resize();
      A.play('click');
      game().save();
    });
    el['set-notation'].addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      S().settings.notation = b.dataset.v;
      game().applySettings();
      for (const x of el['set-notation'].querySelectorAll('button')) x.setAttribute('aria-pressed', String(x === b));
      for (const k in last) delete last[k];
      refresh();
      A.play('click');
    });
    el['btn-export'].addEventListener('click', async () => {
      const code = ST.exportCode(S());
      el['save-code'].hidden = false;
      el['save-code'].value = code;
      el['save-code'].select();
      try {
        await navigator.clipboard.writeText(code);
        toast('Save code copied. Keep it somewhere safe.');
      } catch (e) {
        toast('Copy the code from the box below.');
      }
    });
    el['btn-import'].addEventListener('click', () => {
      const box = el['save-code'];
      if (box.hidden || !box.value.trim()) {
        box.hidden = false;
        box.value = '';
        box.focus();
        toast('Paste your save code into the box, then tap Load save again.');
        return;
      }
      const S2 = ST.importCode(box.value, Date.now());
      if (!S2) {
        A.play('deny');
        toast('That doesn\'t look like an Emberdeep save code.');
        return;
      }
      closeSettings();
      game().replace(S2);
      toast('Save loaded. Welcome back, delver.');
    });
    el['btn-reset'].addEventListener('click', () => {
      const now = Date.now();
      if (now - resetArmed > 3000) {
        resetArmed = now;
        el['btn-reset'].textContent = 'Tap again to erase everything';
        A.play('deny');
        return;
      }
      closeSettings();
      game().wipe();
      toast('A fresh start. The Hearth flickers, waiting.');
      setTimeout(welcome, 400);
    });
  }

  /* ---------- Events from the battle ---------- */

  function bindBus() {
    bus.on('bossIn', (m) => banner(`<small>${m.boss === 2 ? 'Guardian' : 'Boss'}</small>${esc(m.name)}`, m.boss === 2 ? 'guardian' : 'boss'));
    bus.on('bossDown', (m, r) => {
      banner(`<small>Defeated</small>${esc(m.name)}`, 'win');
      if (r.first && r.moon) toast(`First time beating ${m.name}: +${r.moon} moonstones`, 'moon');
      isDirty = true;
    });
    bus.on('bossFail', () => {
      toast('The boss was too strong. Your party fell back a floor to train.', 'warn');
      isDirty = true;
    });
    bus.on('floor', (f, leapt) => {
      if ((f - 1) % D.FLOORS_PER_BIOME === 0) {
        const { biome, cycle } = E.biomeOf(f);
        banner(`<small>Floor ${U.count(f)}</small>${esc(biome.name)}${cycle ? ' ' + ED.battle.roman(cycle + 1) : ''}`, 'biome');
      } else if (leapt) toast('Bottomless Leap! You dropped straight past a floor.');
      const sk = D.SKILLS.find((x) => x.floor === f && S().bestFloor === f);
      if (sk) setTimeout(() => toast(`New skill: ${sk.name}! ${sk.desc}`, 'skill'), 600);
      if (f === E.T.emberFloor && !S().stats.rekindles && S().bestFloor === f) {
        setTimeout(() => toast('The Hearth stirs: you can rekindle now. Look in the Hearth tab.', 'ember'), 1200);
      }
    });
    bus.on('relics', (list, why) => showRelics(list, why));
    bus.on('wisp', (r) => toast(r.text, r.kind === 'moon' ? 'moon' : r.kind === 'gold' ? 'gold' : 'skill'));
    bus.on('heart', () => setTimeout(ending, 800));
  }

  /* ---------- Init ---------- */

  function init() {
    for (const id of ids) el[id] = $(id);
    buildSkills();
    bindSettings();
    bindBus();
    el.tabs.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tab]');
      if (!b) return;
      A.play('tab');
      setTab(b.dataset.tab);
    });
    el['buy-amt'].addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      game().buyMode = b.dataset.n;
      for (const x of el['buy-amt'].querySelectorAll('button')) x.setAttribute('aria-pressed', String(x === b));
      A.play('click');
      updateHeroes();
    });
    el['buy-amt'].querySelector('[data-n="1"]').setAttribute('aria-pressed', 'true');
    el['qm-toggle'].addEventListener('change', () => {
      S().settings.autoBuy = el['qm-toggle'].checked;
      game().save();
    });
    el['btn-challenge'].addEventListener('click', () => game().challenge());
    el.panel.addEventListener('touchstart', () => { touchT = Date.now(); }, { passive: true });
    el.panel.addEventListener('scroll', () => { touchT = Date.now(); }, { passive: true });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (sheetOpen) closeSettings();
        else if (modalOpen && !el.modal._sticky) closeModal();
      } else if (e.key === ' ' && !modalOpen && !sheetOpen && document.activeElement === document.body) {
        e.preventDefault();
        const cv = $('scene').getBoundingClientRect();
        ED.battle.tap(cv.width * 0.75, cv.height * 0.5);
      } else if (/^[1-5]$/.test(e.key) && !modalOpen && !sheetOpen) {
        const sk = D.SKILLS[Number(e.key) - 1];
        if (sk) skillEls[sk.id].click();
      }
    });
    if (S().seenHint.relicsSeen === undefined) S().seenHint.relicsSeen = '0|0';
    setTab('heroes');
  }

  ED.ui = {
    init, frame, refresh, cost, dirty: () => { isDirty = true; }, toast, banner, modal, showAway, showRelics, welcome, flare, perkText, fxText,
  };
})(window.ED = window.ED || {});
