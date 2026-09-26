/* Riftborn — the panels that slide up over the map: Rifts, caches, wild
   creatures, the Lab (your creatures, the Riftdex and fusion), your bag,
   your agent profile, the menu and the guide. */
window.RB = window.RB || {};
(function (RB) {
  'use strict';

  const { esc, fmtDist, fmtTime, clamp } = RB.util;
  const C = RB.creatures;
  const S = RB.state;
  const W = RB.world;
  const sfx = RB.sfx;
  const $ = (id) => document.getElementById(id);

  let hooks = {};          // set by main: engage, assault, changed, player()
  let current = null;      // { name, refresh }
  let anim = null;         // animated portrait in the sheet

  /* ------------------ Basics ------------------ */

  function toast(text, kind) {
    const el = $('toast');
    const item = document.createElement('div');
    item.className = `toast-item ${kind || ''}`;
    item.innerHTML = text;
    el.appendChild(item);
    setTimeout(() => item.classList.add('out'), 2600);
    setTimeout(() => item.remove(), 3100);
  }

  function open(name, html, bind, refresh) {
    const card = $('sheet-card');
    card.innerHTML = `<button class="sheet-x" data-close aria-label="Close">✕</button>${html}`;
    $('sheet').hidden = false;
    card.scrollTop = 0;
    current = { name, refresh };
    card.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => { sfx.tap(); close(); }));
    card.querySelectorAll('canvas[data-sp]').forEach((cv) => RB.beasts.portraitLater(cv, cv.dataset.sp, { silhouette: cv.dataset.sil === '1' }));
    if (bind) bind(card);
    RB.host.setOverlay(true);
  }

  function close() {
    $('sheet').hidden = true;
    current = null;
    anim = null;
    RB.host.setOverlay(false);
  }

  const isOpen = () => !$('sheet').hidden;
  function refresh() { if (current && current.refresh) current.refresh(); }

  function on(card, sel, fn) {
    card.querySelectorAll(sel).forEach((el) => el.addEventListener('click', (e) => { sfx.tap(); fn(el, e); }));
  }

  // Keep one creature portrait animated while a sheet is open.
  function animate(canvas, id) {
    anim = { canvas, id, t: 0 };
  }
  function tick(dt) {
    if (!anim || !anim.canvas.isConnected) return;
    anim.t += dt;
    // Slowly turn the model and let it roar now and then.
    RB.beasts.portrait(anim.canvas, anim.id, { t: anim.t, dt, angle: 0.95 + Math.sin(anim.t * 0.4) * 0.5, mouth: Math.max(0, Math.sin(anim.t * 0.9) - 0.85) * 6 });
  }

  const loot = (l) => [
    l.orbs ? `🔮 ${l.orbs} Orb${l.orbs > 1 ? 's' : ''}` : '',
    l.darts ? `🎯 ${l.darts} Dart${l.darts > 1 ? 's' : ''}` : '',
    l.shards ? `💠 ${l.shards} Shard${l.shards > 1 ? 's' : ''}` : '',
  ].filter(Boolean).join(' · ');

  function levelUp(L) {
    sfx.levelUp();
    const el = $('levelup');
    $('levelup-n').textContent = L;
    $('levelup-text').textContent = `Bonus supplies added to your bag.${L % 2 === 0 && L <= 14 ? ` You can now upgrade Rifts to level ${S.maxRiftLevel()}.` : ''}`;
    el.hidden = false;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(levelUp.t);
    levelUp.t = setTimeout(() => { el.hidden = true; }, 3200);
  }

  function reportUp(r) { if (r && r.up) levelUp(r.up); }

  // Distance from you in meters, or Infinity until the GPS has found you.
  function distTo(e) {
    const me = hooks.player();
    return me ? W.distM(me, e) : Infinity;
  }

  // "Walk closer" line for things out of reach.
  function tooFar(d, what) {
    if (d === Infinity) return '<p class="far">Waiting for your GPS location…</p>';
    return `<p class="far">${fmtDist(d)} away. Walk within ${S.RANGE} m to ${what}.</p>`;
  }

  const pct = (n) => `${Math.round(clamp(n, 0, 1) * 100)}%`;

  function chip(sp) {
    const r = C.RARITY[sp.rar], el = C.ELEMENTS[sp.el];
    return `<span class="chip" style="--c:${r.color}">${r.name}</span><span class="chip" style="--c:${el.color}">${el.icon} ${el.name}</span>`;
  }

  /* ------------------ Wild creature ------------------ */

  function spawnSheet(spawn) {
    const sp = C.byId(spawn.sp);
    const d = distTo(spawn);
    const near = d <= S.RANGE;
    const dex = S.save.dex[sp.id];
    const lvl = S.spawnLevel(spawn);
    const left = spawn.expires - Date.now();
    open('spawn', `
      <canvas class="portrait big" id="sp-pic"></canvas>
      <h2>${esc(sp.name)}</h2>
      <p class="chips">${chip(sp)}<span class="chip">Lv ${lvl}</span></p>
      <p class="muted">${esc(sp.blurb)}</p>
      <p class="muted small">${dex && dex.caught ? `You've caught ${dex.caught}.` : 'Not caught yet.'} You have ${S.dna(sp.id)} ${esc(sp.name)} DNA. Leaves in ${fmtTime(left)}.</p>
      ${near
        ? `<button class="btn btn-main btn-big" data-engage>Engage in AR</button>
           <p class="muted small center">🎯 ${S.save.items.darts} darts · 🔮 ${S.save.items.orbs} orbs</p>`
        : tooFar(d, 'engage')}
    `, (card) => {
      animate($('sp-pic'), sp.id);
      on(card, '[data-engage]', () => { close(); hooks.engage(spawn); });
    });
  }

  /* ------------------ Supply cache ------------------ */

  function dropSheet(drop) {
    const d = distTo(drop);
    const wait = S.dropReady(drop);
    open('drop', `
      <div class="sheet-icon">📦</div>
      <h2>${esc(drop.name)}</h2>
      <p class="muted">Gear left by expeditions that went through the Rifts. Refills every 10 minutes.</p>
      ${d > S.RANGE ? tooFar(d, 'open it')
        : wait > 0 ? `<p class="far">Empty. Refills in ${fmtTime(wait)}.</p>`
        : '<button class="btn btn-main btn-big" data-open>Open cache</button>'}
    `, (card) => {
      on(card, '[data-open]', () => {
        const r = S.openDrop(drop);
        if (!r.ok) { toast(r.why); return; }
        sfx.crate();
        toast(`Cache opened: ${loot(r.loot)}`, 'good');
        reportUp(r);
        close();
        hooks.changed();
      });
    });
  }

  /* ------------------ Rifts ------------------ */

  function riftSheet(rift) {
    const render = () => {
      const st = S.riftState(rift);
      const me = S.save.agent.faction;
      const F = st.faction ? S.FACTIONS[st.faction] : null;
      const col = S.riftColor(st);
      const d = distTo(rift);
      const near = d <= S.RANGE;
      const hackWait = S.hackReady(rift);
      const keys = S.save.keys[rift.id] ? S.save.keys[rift.id].n : 0;
      const friendly = st.faction === me;
      const enemy = st.faction && !friendly;
      const who = st.mine ? 'Held by you' : F ? `Held by the ${F.name}` : 'Unclaimed';
      const guards = st.guard.length
        ? `<div class="guards">${st.guard.map((g) => `<div class="guard"><canvas data-sp="${g.sp}"></canvas><small>${esc(C.byId(g.sp).name)} · Lv ${g.lvl}</small></div>`).join('')}</div>`
        : '';
      let actions = '';
      if (!near) {
        actions = tooFar(d, 'use it');
      } else {
        actions += hackWait > 0
          ? `<button class="btn" disabled>Hack · ready in ${fmtTime(hackWait)}</button>`
          : '<button class="btn btn-main" data-hack>Hack</button>';
        if (!st.faction) actions += `<button class="btn btn-main" data-claim>Claim · ${S.claimCost} 💠</button>`;
        if (enemy) actions += '<button class="btn btn-danger" data-assault>Assault the guardians</button>';
        if (friendly && st.health < 100) actions += '<button class="btn" data-recharge>Recharge · 2 💠</button>';
        if (st.mine && st.level < 8) actions += `<button class="btn" data-upgrade>Upgrade to L${st.level + 1} · ${S.upgradeCost(st.level)} 💠</button>`;
        if (st.mine) actions += '<button class="btn" data-guards>Choose guardians</button>';
        if (friendly) actions += '<button class="btn" data-link>Link to another Rift</button>';
      }
      open('rift', `
        <div class="rift-head" style="--c:${col}">
          <div class="rift-gem"></div>
          <div>
            <h2>${esc(rift.name)}</h2>
            <p class="rift-who">${who}${st.faction ? ` · Level ${st.level}` : ''}</p>
          </div>
        </div>
        ${st.faction ? `<div class="bar-row"><span>Charge</span><span class="bar"><i style="width:${st.health}%;background:${col}"></i></span><span>${st.health}%</span></div>` : ''}
        ${guards ? `<h3>${friendly ? 'Guardians' : 'Guardians to beat'}</h3>${guards}` : ''}
        <p class="muted small">${keys ? `You hold ${keys} key${keys > 1 ? 's' : ''} to this Rift. ` : ''}${
          !st.faction ? 'Nobody holds this Rift. Claim it for your faction with Rift Shards.'
          : enemy ? `Beat its guardians in battle to knock it back to unclaimed, then claim it.`
          : st.mine ? 'Your Rift loses charge every day. Recharge it, or it falls to the other side.'
          : 'A Rift held by your faction. Hack it for supplies and keys, and link it up.'}</p>
        <div class="actions">${actions}</div>
      `, (card) => {
        card.querySelectorAll('.rift-head').forEach((el) => el.classList.add('glow'));
        on(card, '[data-hack]', () => {
          const r = S.hack(rift);
          if (!r.ok) { toast(r.why); return; }
          sfx.hack();
          toast(`Hacked: ${loot(r.loot)}${r.key ? ' · 🗝️ Key' : ''}`, 'good');
          reportUp(r);
          render();
          hooks.changed();
        });
        on(card, '[data-claim]', () => {
          const r = S.claim(rift);
          if (!r.ok) { toast(r.why, 'bad'); sfx.error(); return; }
          sfx.claim();
          toast(`${esc(rift.name)} is now held by the ${S.faction().name}!`, 'good');
          reportUp(r);
          render();
          hooks.changed();
        });
        on(card, '[data-recharge]', () => {
          const r = S.recharge(rift);
          if (!r.ok) { toast(r.why, 'bad'); sfx.error(); return; }
          sfx.collect();
          reportUp(r);
          render();
        });
        on(card, '[data-upgrade]', () => {
          const r = S.upgrade(rift);
          if (!r.ok) { toast(r.why, 'bad'); sfx.error(); return; }
          sfx.claim();
          toast(`Upgraded to level ${S.riftState(rift).level}. Longer link range and more guardians.`, 'good');
          reportUp(r);
          render();
          hooks.changed();
        });
        on(card, '[data-assault]', () => { close(); hooks.assault(rift); });
        on(card, '[data-guards]', () => guardSheet(rift));
        on(card, '[data-link]', () => linkSheet(rift));
      }, () => render());
    };
    render();
  }

  function guardSheet(rift) {
    const st = S.riftState(rift);
    const max = S.maxGuards(st.level);
    let picked = st.guard.map((c) => c.id);
    const list = S.save.creatures.slice().sort((a, b) => C.power(b) - C.power(a));
    const html = () => `
      <h2>Guardians</h2>
      <p class="muted">Pick up to ${max} creature${max > 1 ? 's' : ''} to defend ${esc(rift.name)}. Upgrade the Rift for more slots.</p>
      <div class="grid">${list.map((c) => card(c, picked.includes(c.id))).join('')}</div>
      <button class="btn btn-main btn-big" data-save>Save</button>`;
    const bind = (el) => {
      on(el, '.cc', (b) => {
        const id = b.dataset.id;
        if (picked.includes(id)) picked = picked.filter((x) => x !== id);
        else { if (picked.length >= max) picked.shift(); picked.push(id); }
        open('guards', html(), bind);
      });
      on(el, '[data-save]', () => { S.setGuards(rift, picked); toast('Guardians posted.', 'good'); riftSheet(rift); });
    };
    open('guards', html(), bind);
  }

  function linkSheet(rift) {
    const targets = S.linkTargets(rift);
    const st = S.riftState(rift);
    open('link', `
      <h2>Link from ${esc(rift.name)}</h2>
      <p class="muted">Links need a key to the other Rift (hack Rifts to get keys). Both Rifts must be held by the ${S.faction().name}. Link three Rifts into a triangle to raise a control field and earn Aether. Range at level ${st.level}: ${fmtDist(S.linkRange(st.level))}.</p>
      ${targets.length ? `<div class="list">${targets.map((x) => `
        <button class="row" data-id="${x.rift.id}" ${x.why ? 'disabled' : ''}>
          <span><b>${esc(x.rift.name)}</b><small>${fmtDist(x.dist)} · 🗝️ ${x.key.n}${x.why ? ` · ${esc(x.why)}` : ''}</small></span>
          <span class="go">${x.why ? '' : 'Link'}</span>
        </button>`).join('')}</div>`
        : '<p class="far">You have no keys yet. Hack other Rifts to collect keys, then come back.</p>'}
      <button class="btn" data-back>Back</button>
    `, (card) => {
      on(card, '[data-back]', () => riftSheet(rift));
      on(card, '.row[data-id]', (b) => {
        const target = W.riftById(b.dataset.id);
        const r = S.link(rift, target);
        if (!r.ok) { toast(r.why, 'bad'); sfx.error(); return; }
        if (r.fields.length) {
          sfx.field();
          toast(`Control field raised! +${r.fields.reduce((a, b2) => a + b2, 0).toLocaleString()} Aether`, 'good');
        } else {
          sfx.link();
          toast(`Linked to ${esc(target.name)}.`, 'good');
        }
        reportUp(r);
        close();
        hooks.changed();
      });
    });
  }

  /* ------------------ Lab ------------------ */

  function card(c, sel) {
    const sp = C.byId(c.sp);
    const team = S.save.team.includes(c.id);
    return `<button class="cc ${sel ? 'sel' : ''}" data-id="${c.id}" style="--r:${C.RARITY[sp.rar].color}">
      <canvas data-sp="${sp.id}"></canvas>
      <b>${esc(sp.name)}</b>
      <small>Lv ${c.lvl} · ⚡${C.power(c)}</small>
      ${team ? '<i class="team-star" title="On your team">★</i>' : ''}
    </button>`;
  }

  function lab(tab) {
    tab = tab || 'mine';
    const tabs = `<div class="tabs">
      <button data-tab="mine" class="${tab === 'mine' ? 'on' : ''}">Creatures</button>
      <button data-tab="dex" class="${tab === 'dex' ? 'on' : ''}">Riftdex</button>
      <button data-tab="fuse" class="${tab === 'fuse' ? 'on' : ''}">Fusion</button>
    </div>`;
    let body = '';
    if (tab === 'mine') {
      const list = S.save.creatures.slice().sort((a, b) => (S.save.team.includes(b.id) - S.save.team.includes(a.id)) || C.power(b) - C.power(a));
      body = `<p class="muted small">★ marks your battle team (up to ${S.MAX_TEAM}). Tap a creature to level it up with DNA.</p>
        <div class="grid">${list.map((c) => card(c)).join('')}</div>`;
    } else if (tab === 'dex') {
      const caught = C.SPECIES.filter((s) => S.save.dex[s.id] && S.save.dex[s.id].caught).length;
      body = `<p class="muted small">${caught} of ${C.SPECIES.length} discovered. Dart creatures to collect their DNA.</p>
        <div class="grid">${C.SPECIES.map((sp) => {
          const d = S.save.dex[sp.id];
          const known = d && (d.caught || d.seen);
          return `<div class="cc dex ${d && d.caught ? '' : 'unknown'}" style="--r:${C.RARITY[sp.rar].color}">
            <canvas data-sp="${sp.id}" data-sil="${known ? 0 : 1}"></canvas>
            <b>${known ? esc(sp.name) : '???'}</b>
            <small>${sp.hybrid ? 'Hybrid · ' : ''}🧬 ${S.dna(sp.id)}</small>
          </div>`;
        }).join('')}</div>`;
    } else {
      body = `<p class="muted small">Fuse DNA from two species to make hybrid DNA. At 100 hybrid DNA the hybrid is born. After that, hybrid DNA levels it up.</p>
        <div class="list">${C.HYBRIDS.map((h) => {
          const owned = S.save.creatures.some((c) => c.sp === h.id);
          const ok = S.canFuse(h.id);
          const known = S.save.dex[h.id];
          return `<div class="fuse" style="--r:${C.RARITY[h.rar].color}">
            <div class="fuse-row">
              ${h.parents.map((p) => {
                const ps = C.byId(p), have = S.dna(p), need = C.fuseCost(p);
                return `<div class="fuse-p"><canvas data-sp="${p}" data-sil="${S.save.dex[p] ? 0 : 1}"></canvas>
                  <small>${S.save.dex[p] ? esc(ps.name) : '???'}</small>
                  <span class="bar"><i style="width:${pct(have / need)}"></i></span><small>${have}/${need}</small></div>`;
              }).join('<span class="plus">+</span>')}
              <span class="plus">=</span>
              <div class="fuse-p"><canvas data-sp="${h.id}" data-sil="${known ? 0 : 1}"></canvas><small>${known ? esc(h.name) : '???'}</small>
                <small>${owned ? `🧬 ${S.dna(h.id)}` : `${S.dna(h.id)}/100`}</small></div>
            </div>
            <button class="btn ${ok ? 'btn-main' : ''}" data-fuse="${h.id}" ${ok ? '' : 'disabled'}>Fuse</button>
          </div>`;
        }).join('')}</div>`;
    }
    open('lab', `<h2>Lab</h2>${tabs}${body}`, (el) => {
      on(el, '[data-tab]', (b) => lab(b.dataset.tab));
      on(el, '.cc[data-id]', (b) => creatureSheet(b.dataset.id));
      on(el, '[data-fuse]', (b) => {
        const r = S.fuse(b.dataset.fuse);
        if (!r.ok) { toast(r.why, 'bad'); return; }
        const h = C.byId(b.dataset.fuse);
        if (r.created) {
          sfx.caught();
          toast(`${esc(h.name)} is born!`, 'good');
          creatureSheet(r.created.id);
        } else {
          sfx.claim();
          toast(`+${r.gain} ${esc(h.name)} DNA`, 'good');
          lab('fuse');
        }
        reportUp(r);
      });
    }, () => lab(tab));
  }

  function creatureSheet(id) {
    const c = S.creature(id);
    if (!c) { lab('mine'); return; }
    const sp = C.byId(c.sp);
    const st = C.stats(c);
    const cost = C.levelCost(c);
    const have = S.dna(c.sp);
    const team = S.save.team.includes(c.id);
    const maxed = c.lvl >= C.MAX_LEVEL;
    open('creature', `
      <canvas class="portrait big" id="cr-pic"></canvas>
      <h2>${esc(sp.name)} <span class="lvl">Lv ${c.lvl}</span></h2>
      <p class="chips">${chip(sp)}${sp.hybrid ? '<span class="chip" style="--c:#fff">Hybrid</span>' : ''}</p>
      <div class="stats">
        <div><b>${st.hp}</b><small>HP</small></div>
        <div><b>${st.atk}</b><small>Attack</small></div>
        <div><b>${st.spd}</b><small>Speed</small></div>
        <div><b>${C.power(c)}</b><small>Power</small></div>
      </div>
      <p class="muted small">${esc(sp.blurb)} Special move: ${C.ELEMENTS[sp.el].icon} ${C.ELEMENTS[sp.el].move}.</p>
      <div class="bar-row"><span>🧬 DNA</span><span class="bar"><i style="width:${maxed ? '100%' : pct(have / cost)}"></i></span><span>${have}${maxed ? '' : `/${cost}`}</span></div>
      <div class="actions">
        <button class="btn btn-main" data-up ${maxed || have < cost ? 'disabled' : ''}>${maxed ? 'Max level' : `Level up · ${cost} DNA`}</button>
        <button class="btn" data-team>${team ? '★ On team (remove)' : '☆ Add to team'}</button>
        <button class="btn btn-danger" data-release>Release for DNA</button>
        <button class="btn" data-back>Back to Lab</button>
      </div>
    `, (el) => {
      animate($('cr-pic'), sp.id);
      on(el, '[data-up]', () => {
        const r = S.levelUp(id);
        if (!r.ok) { toast(r.why, 'bad'); return; }
        sfx.levelUp();
        toast(`${esc(sp.name)} reached level ${S.creature(id).lvl}!`, 'good');
        creatureSheet(id);
      });
      on(el, '[data-team]', () => { S.toggleTeam(id); creatureSheet(id); });
      on(el, '[data-back]', () => lab('mine'));
      on(el, '[data-release]', (b) => {
        if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = 'Tap again to release'; return; }
        const r = S.release(id);
        if (!r.ok) { toast(r.why, 'bad'); return; }
        toast(`${esc(sp.name)} went back through the Rift. +${r.dna} DNA`);
        lab('mine');
      });
    });
  }

  /* ------------------ Bag, profile, scan ------------------ */

  function bag() {
    const it = S.save.items;
    const keys = Object.entries(S.save.keys).map(([id, k]) => ({ id, ...k, d: distTo(k) })).sort((a, b) => a.d - b.d);
    open('bag', `
      <h2>Bag</h2>
      <div class="items">
        <div class="item"><span>🔮</span><b>${it.orbs}</b><small>Rift Orbs · flick them to catch creatures</small></div>
        <div class="item"><span>🎯</span><b>${it.darts}</b><small>DNA Darts · fire them to collect DNA</small></div>
        <div class="item"><span>💠</span><b>${it.shards}</b><small>Rift Shards · claim, recharge and upgrade Rifts</small></div>
      </div>
      <h3>Rift keys</h3>
      ${keys.length ? `<div class="list">${keys.map((k) => `<div class="row"><span><b>${esc(k.name)}</b><small>${k.d === Infinity ? 'Rift key' : `${fmtDist(k.d)} away`}</small></span><span class="go">🗝️ ${k.n}</span></div>`).join('')}</div>`
        : '<p class="muted small">No keys yet. Hacking a Rift often gives you its key. You need keys to link Rifts.</p>'}
    `);
  }

  function profile() {
    const a = S.save.agent, L = S.level(), F = S.faction(), s = S.save.stats;
    const held = Object.values(S.save.rifts).filter((o) => o.mine && o.faction === a.faction).length;
    const buddy = S.team()[0];
    open('profile', `
      <div class="agent-card" style="--c:${F.color}">
        <div class="agent-glyph">${F.glyph}</div>
        <div><h2>${esc(a.name)}</h2><p>${F.one} · Level ${L.level} ${S.title(L.level)}</p></div>
      </div>
      <div class="bar-row"><span>XP</span><span class="bar"><i style="width:${pct(L.frac)};background:${F.color}"></i></span><span>${L.into.toLocaleString()}/${L.need.toLocaleString()}</span></div>
      <p class="muted small">${a.xp.toLocaleString()} XP in total.${L.level < S.MAX_LEVEL ? ` ${(L.need - L.into).toLocaleString()} more to level ${L.level + 1}.` : ' Top level!'}</p>
      <div class="actions" style="flex-direction:row">
        <button class="btn" style="flex:1" data-levels>📈 Levels</button>
        <button class="btn" style="flex:1" data-board>🏆 Leaderboard</button>
      </div>
      <div class="stats">
        <div><b>${S.aether().toLocaleString()}</b><small>Aether</small></div>
        <div><b>${held}</b><small>Rifts held</small></div>
        <div><b>${S.save.links.length}</b><small>Links</small></div>
        <div><b>${S.save.fields.length}</b><small>Fields</small></div>
        <div><b>${s.caught}</b><small>Caught</small></div>
        <div><b>${S.save.creatures.length}</b><small>Creatures</small></div>
        <div><b>${s.wins}</b><small>Battles won</small></div>
        <div><b>${s.hacks}</b><small>Hacks</small></div>
        <div><b>${fmtDist(s.meters)}</b><small>Walked</small></div>
      </div>
      ${buddy ? `<h3>Walking buddy</h3>
      <div class="row"><canvas data-sp="${buddy.sp}"></canvas><span><b>${esc(C.byId(buddy.sp).name)}</b><small>Finds 5 DNA every ${S.BUDDY_M} m you walk · next in ${fmtDist(S.BUDDY_M - S.save.walk.buddy)}</small></span></div>
      <p class="muted small">Supply stash every ${fmtDist(S.STASH_M)}: next in ${fmtDist(S.STASH_M - S.save.walk.stash)}. Your buddy is the first creature on your team (★ in the Lab).</p>` : ''}
      <h3>Medals</h3>
      <div class="medals">${S.medals().map((x) => {
        const t = x.tier ? S.TIERS[x.tier - 1] : null;
        const val = (v) => (x.m.div ? `${(v / x.m.div).toLocaleString()}` : v.toLocaleString());
        return `<div class="medal ${t ? '' : 'none'}" style="${t ? `--t:${t.color}` : ''}">
          <span class="ic">${x.m.icon}</span><b>${esc(x.m.name)}</b>
          <small>${t ? t.name : 'Not yet'}</small>
          <small>${x.next ? `${val(x.value)} / ${val(x.next)} ${x.m.what}` : `${val(x.value)} ${x.m.what}`}</small>
        </div>`;
      }).join('')}</div>
      <p class="muted small center">“${esc(F.motto)}”</p>
    `, (el) => {
      on(el, '[data-levels]', () => levels());
      on(el, '[data-board]', () => board());
    });
  }

  // Every agent level: XP needed, title and reward.
  function levels() {
    const L = S.level().level;
    const rows = [];
    for (let n = 1; n <= S.MAX_LEVEL; n++) {
      const r = S.levelReward(n);
      const unlock = n % 2 === 0 && n <= 14 ? ` · Rift upgrades to L${Math.min(8, 1 + n / 2)}` : '';
      const newTitle = n % 5 === 0 ? ` · New title: <b>${S.title(n)}</b>` : '';
      rows.push(`<div class="row ${n === L ? 'cur' : n > L ? 'locked' : ''}">
        <span class="rank">${n}</span>
        <span><b>${S.xpFor(n).toLocaleString()} XP</b><small>${n === 1 ? 'Where everyone starts' : `🔮 ${r.orbs} · 🎯 ${r.darts} · 💠 ${r.shards}${unlock}${newTitle}`}</small></span>
        <span class="go">${n < L ? '✓' : n === L ? 'You' : ''}</span>
      </div>`);
    }
    open('levels', `
      <h2>Agent levels</h2>
      <p class="muted small">Earn XP by catching and darting creatures, hacking and claiming Rifts, linking, battling, fusing, finishing missions, earning medals and walking. Every level up gives you supplies.</p>
      <div class="list levels">${rows.join('')}</div>
      <button class="btn" data-back>Back</button>
    `, (el) => {
      on(el, '[data-back]', () => profile());
      const cur = el.querySelector('.row.cur');
      if (cur) cur.scrollIntoView({ block: 'center' });
    });
  }

  async function board() {
    const me = RB.auth.user;
    open('board', `<h2>Leaderboard</h2><p class="muted">Loading…</p>`);
    let rows = [];
    try {
      rows = await RB.auth.leaderboard();
    } catch (e) {
      open('board', `<h2>Leaderboard</h2><p class="far">Couldn’t load the leaderboard. Check your internet connection.</p><button class="btn" data-back>Back</button>`, (el) => on(el, '[data-back]', () => profile()));
      return;
    }
    if (!current || current.name !== 'board') return;
    open('board', `
      <h2>Leaderboard</h2>
      <p class="muted small">${me && me.mode === 'cloud' ? 'Top agents everywhere, by XP.' : 'Agents on this phone, by XP. With online accounts (see the README) everyone shares one leaderboard.'}</p>
      ${rows.length ? `<div class="list lb">${rows.map((r, i) => `<div class="row ${me && r.uid === me.uid ? 'me' : ''}">
        <span class="rank">${i + 1}</span>
        <span class="dot" style="--c:${(S.FACTIONS[r.faction] || {}).color || '#888'};margin:0 4px"></span>
        <span><b>${esc(r.name)}</b><small>Level ${r.level} ${S.title(r.level)} · ${Number(r.xp).toLocaleString()} XP</small></span>
      </div>`).join('')}</div>` : '<p class="far">No agents yet.</p>'}
      <button class="btn" data-back>Back</button>
    `, (el) => on(el, '[data-back]', () => profile()));
  }

  function account() {
    const u = RB.auth.user;
    open('account', `
      <h2>Account</h2>
      <div class="row"><span><b>${esc(u.name)}</b><small>${esc(u.email || 'No email')} · ${u.mode === 'cloud' ? 'online account' : 'account on this phone'}</small></span></div>
      <p class="muted small">${u.mode === 'cloud'
        ? `Your progress is saved to your account and follows you to any phone.${RB.auth.lastSync ? ` Last synced ${new Date(RB.auth.lastSync).toLocaleTimeString()}.` : ''}`
        : 'Your account and progress are stored on this phone. Uninstalling the app or clearing the browser’s data deletes them.'}</p>
      <div class="actions">
        ${u.mode === 'cloud' ? '<button class="btn" data-sync>Sync now</button>' : ''}
        <button class="btn btn-danger" data-logout>Log out</button>
      </div>
    `, (el) => {
      on(el, '[data-sync]', async () => { S.persist(true); await RB.auth.flush(); toast('Progress saved to your account.', 'good'); account(); });
      on(el, '[data-logout]', async () => { S.persist(true); await RB.auth.logOut(); location.reload(); });
    });
  }

  function missionsSheet() {
    const ms = S.missions();
    const allClaimed = ms.list.every((m) => m.claimed);
    const r = S.missionReward;
    const surge = C.byId(ms.surge);
    open('missions', `
      <h2>Field missions</h2>
      <p class="muted small">New missions every day. Each pays 🔮 ${r.orbs} · 🎯 ${r.darts} · 💠 ${r.shards} and 300 XP. Finish all three for a Rift Surge.</p>
      <div class="list">${ms.list.map((m, i) => `
        <div class="mission ${m.got >= m.need ? 'done' : ''}">
          <div class="mission-top"><b>${esc(m.text)}</b><small>${m.kind === 'walk' ? `${fmtDist(m.got)} / ${fmtDist(m.need)}` : `${m.got} / ${m.need}`}</small></div>
          <span class="bar"><i style="width:${pct(m.got / m.need)}"></i></span>
          ${m.claimed ? '<small class="muted">Claimed ✓</small>' : m.got >= m.need ? `<button class="btn btn-main" data-claim="${i}">Claim reward</button>` : ''}
        </div>`).join('')}</div>
      <div class="surge">
        <canvas data-sp="${surge.id}" data-sil="${S.save.dex[surge.id] ? 0 : 1}"></canvas>
        <b>Rift Surge</b>
        <p class="muted small">60 ${S.save.dex[surge.id] ? esc(surge.name) : 'mystery creature'} DNA · 🔮 10 · 💠 10 · 800 XP</p>
        ${ms.bonus ? '<small class="muted">Claimed ✓ Come back tomorrow.</small>' : `<button class="btn ${allClaimed ? 'btn-main' : ''}" data-bonus ${allClaimed ? '' : 'disabled'}>Claim Rift Surge</button>`}
      </div>
    `, (el) => {
      on(el, '[data-claim]', (b) => {
        const res = S.claimMission(+b.dataset.claim);
        if (!res.ok) return;
        sfx.collect();
        toast(`Mission reward: ${loot(res.loot)}`, 'good');
        reportUp(res);
        missionsSheet();
      });
      on(el, '[data-bonus]', () => {
        const res = S.claimBonus();
        if (!res.ok) return;
        sfx.caught();
        toast(`Rift Surge! +60 ${esc(C.byId(res.sp).name)} DNA, 🔮 10, 💠 10`, 'good');
        reportUp(res);
        missionsSheet();
      });
    });
  }

  function scan(ents) {
    const me = hooks.player();
    if (!me) {
      open('scan', '<h2>Rift scan</h2><p class="far">Waiting for your GPS location…</p><p class="muted small">Riftborn follows your real position. Head outside for a better signal.</p>');
      return;
    }
    const rows = [];
    for (const s of ents.spawns) if (!S.isGone(s) && W.distM(me, s) < RB.map.SIGHT) rows.push({ e: s, d: W.distM(me, s), kind: 'spawn' });
    for (const r of ents.rifts) rows.push({ e: r, d: W.distM(me, r), kind: 'rift' });
    for (const d of ents.drops) rows.push({ e: d, d: W.distM(me, d), kind: 'drop' });
    rows.sort((a, b) => a.d - b.d);
    const top = rows.filter((r) => r.d < 600).slice(0, 30);
    const label = (r) => {
      if (r.kind === 'spawn') { const sp = C.byId(r.e.sp); return `<canvas data-sp="${sp.id}"></canvas><span><b>${esc(sp.name)}</b><small><i style="color:${C.RARITY[sp.rar].color}">${C.RARITY[sp.rar].name}</i> · ${fmtDist(r.d)}</small></span>`; }
      if (r.kind === 'rift') { const st = S.riftState(r.e); return `<span class="dot" style="--c:${S.riftColor(st)}"></span><span><b>${esc(r.e.name)}</b><small>${st.mine ? 'Yours' : st.faction ? S.FACTIONS[st.faction].name : 'Unclaimed'} · ${fmtDist(r.d)}</small></span>`; }
      return `<span class="dot" style="--c:#FFB020"></span><span><b>${esc(r.e.name)}</b><small>Supply cache · ${fmtDist(r.d)}</small></span>`;
    };
    open('scan', `
      <h2>Rift scan</h2>
      <p class="muted small">Creatures within 300 m, Rifts and caches within 600 m. Creatures move on every 10 minutes.</p>
      ${top.length ? `<div class="list">${top.map((r, i) => `<button class="row scan-row" data-i="${i}">${label(r)}<span class="go">${r.d <= S.RANGE ? 'In range' : '›'}</span></button>`).join('')}</div>` : '<p class="far">Nothing nearby. Go for a walk!</p>'}
    `, (el) => {
      on(el, '.scan-row', (b) => {
        const r = top[+b.dataset.i];
        if (r.kind === 'spawn') spawnSheet(r.e);
        else if (r.kind === 'rift') riftSheet(r.e);
        else dropSheet(r.e);
      });
    });
  }

  /* ------------------ Menu & guide ------------------ */

  function menu() {
    const st = S.save.settings;
    open('menu', `
      <h2>Menu</h2>
      <div class="actions">
        <button class="btn" data-set="sound">Sound: ${st.sound ? 'on' : 'off'}</button>
        <button class="btn" data-set="map">Map: ${({ scanner: 'scanner (like Ingress)', auto: 'day and night follow your clock', day: 'always day', night: 'always night', grid: 'no street map (offline)' })[st.map] || 'scanner'}</button>
        <button class="btn" data-set="ar">AR camera: ${st.ar === false ? 'off' : 'on'}</button>
        <button class="btn" data-gmaps>Google Maps: ${RB.gmaps.key() ? (RB.gmaps.status.state === 'error' ? 'key problem' : 'on') : 'off (add a key)'}</button>
        <button class="btn" data-account>Account: ${esc(RB.auth.user ? RB.auth.user.name : '')}</button>
        <button class="btn" data-guide>How to play</button>
        <button class="btn btn-danger" data-reset>Start this agent over</button>
      </div>
      <p class="muted small center">Stay aware of your surroundings. Never play while driving or cycling.<br>${RB.gmaps.active() ? 'Map data ©Google' : 'Map data © OpenStreetMap contributors © CARTO'}.</p>
    `, (el) => {
      on(el, '[data-set]', (b) => {
        const k = b.dataset.set;
        if (k === 'sound') { st.sound = !st.sound; sfx.on = st.sound; }
        if (k === 'map') st.map = ({ scanner: 'auto', auto: 'day', day: 'night', night: 'grid', grid: 'scanner' })[st.map] || 'scanner';
        if (k === 'ar') st.ar = st.ar === false;
        S.persist();
        menu();
      });
      on(el, '[data-guide]', () => guide());
      on(el, '[data-account]', () => account());
      on(el, '[data-gmaps]', () => googleSheet());
      on(el, '[data-reset]', async (b) => {
        if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = 'Tap again: this deletes this agent’s progress'; return; }
        S.reset();
        await RB.auth.dropSave();
        location.reload();
      });
    });
  }

  // Google Maps key. It's stored on this phone only.
  function googleSheet() {
    const st = S.save.settings;
    const built = !!(window.RB_CONFIG && window.RB_CONFIG.googleMapsKey);
    const gs = RB.gmaps.status;
    open('gmaps', `
      <h2>Google Maps</h2>
      <p class="muted">Riftborn can draw your streets with Google Maps instead of the free map. It needs a Google Maps Platform API key with the <b>Map Tiles API</b> turned on.</p>
      <label class="field"><span>API key</span>
        <input id="gm-key" type="text" autocomplete="off" spellcheck="false" placeholder="${built ? 'Using the key built into this app' : 'AIza…'}" value="${esc(st.googleKey || '')}">
      </label>
      ${gs.text ? `<p class="${gs.state === 'error' ? 'far' : 'muted small'}">${esc(gs.text)}</p>` : ''}
      <div class="actions">
        <button class="btn btn-main" data-save>Save key</button>
        ${st.googleKey ? '<button class="btn" data-clear>Remove key</button>' : ''}
      </div>
      <p class="muted small">How to get one: in the Google Cloud console, create a project, add billing, enable the <b>Map Tiles API</b>, then create an API key under APIs &amp; Services → Credentials. Restrict it to the Map Tiles API, and to your website (or to <code>https://appassets.androidplatform.net/*</code> for the Android app). Google gives a free monthly allowance; you only pay beyond it.</p>
    `, (el) => {
      on(el, '[data-save]', () => {
        st.googleKey = $('gm-key').value.trim();
        S.persist();
        RB.gmaps.reset();
        toast(st.googleKey ? 'Key saved. Loading Google Maps…' : 'Key removed.', 'good');
        close();
      });
      on(el, '[data-clear]', () => {
        st.googleKey = '';
        S.persist();
        RB.gmaps.reset();
        toast('Key removed. Back to the free map.');
        close();
      });
    });
  }

  function guide() {
    open('guide', `
      <h2>How to play</h2>
      <div class="guide">
        <h3>🌀 Rifts</h3>
        <p>Tears between worlds, pinned to real places. Walk within ${S.RANGE} m and <b>hack</b> them for orbs, darts, shards and keys. <b>Claim</b> unclaimed Rifts for your faction, and <b>assault</b> enemy Rifts by beating their guardians in battle.</p>
        <h3>🔗 Links &amp; fields</h3>
        <p>Link two of your faction's Rifts with a key. Close a triangle of links to raise a <b>control field</b>: bigger fields give more <b>Aether</b>. Links can't cross. Your Rifts lose charge every day, so recharge them or they fall.</p>
        <h3>🦖 Creatures</h3>
        <p>Riftborn creatures roam the map and move on every 10 minutes. Tap one nearby and <b>Engage</b> to meet it in AR through your camera.</p>
        <p><b>Darts:</b> keep it in the crosshair by moving your phone, and fire when the yellow target lines up. Hits give DNA and calm it down. Bullseyes give double.</p>
        <p><b>Orbs:</b> flick an orb up at it. Throw when the coloured ring is small for a bonus. Calm creatures are easier to catch.</p>
        <h3>🧬 Lab</h3>
        <p>Spend DNA to level up creatures. Fuse DNA from two species to create <b>hybrids</b> you can't find in the wild.</p>
        <h3>📋 Missions &amp; walking</h3>
        <p>Three new field missions every day (the 📋 button). Finish all three for a Rift Surge. Your first team creature is your walking buddy: it finds DNA every ${S.BUDDY_M} m you walk, and every kilometre you find a supply stash.</p>
        <h3>📦 Caches</h3>
        <p>Supply caches refill every 10 minutes. Great for darts.</p>
        <h3>🧭 Moving</h3>
        <p>You move by walking around in real life. Riftborn follows your phone's GPS, and you have to be within ${S.RANGE} m of a Rift, cache or creature to use it. Creatures hide if you go faster than about 40 km/h, so no playing from a car.</p>
      </div>
    `);
  }

  RB.ui = {
    setHooks(h) { hooks = h; },
    toast, open, close, isOpen, refresh, tick, levelUp,
    spawnSheet, dropSheet, riftSheet, lab, creatureSheet, bag, profile, scan, menu, guide, missionsSheet,
  };
})(window.RB);
