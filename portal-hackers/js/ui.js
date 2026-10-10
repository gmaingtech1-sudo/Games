/* Portal Hackers: Nexus — everything that isn't the compass: the HUD, the
   XP bar and "next level" card, toasts, the level-up screen, and the panels
   (portal, scan, missions, Compass upgrades, team, profile, progression
   guide, menu). */
window.PH = window.PH || {};
(function (PH) {
  'use strict';

  const D = PH.data;
  const S = PH.state;
  const W = PH.world;
  const A = PH.audio;
  const { esc, fmt, fmtDist, fmtTime } = PH.util;
  const $ = (id) => document.getElementById(id);
  const G = () => PH.game;

  /* ------------------ Toasts ------------------ */

  function toast(html, kind) {
    const box = $('toasts');
    const el = document.createElement('div');
    el.className = `toast ${kind || ''}`;
    el.innerHTML = html;
    box.appendChild(el);
    while (box.children.length > 4) box.removeChild(box.firstChild);
    setTimeout(() => el.classList.add('out'), 3200);
    setTimeout(() => el.remove(), 3700);
  }

  const gain = (xp, cores) => [xp ? `<b class="xp">+${fmt(xp)} XP</b>` : '', cores ? `<b class="cores">+${fmt(cores)} ⬢</b>` : ''].join(' ');

  /* ------------------ Sheet ------------------ */

  let sheetOnClose = null;
  let sheetRender = null;

  function sheet(render, onClose) {
    sheetRender = render;
    sheetOnClose = onClose || null;
    $('sheet').hidden = false;
    redraw();
  }

  function redraw() {
    if (!sheetRender || $('sheet').hidden) return;
    const card = $('sheet-card');
    const scroll = card.scrollTop;
    card.innerHTML = `<button class="sheet-x" type="button" data-close aria-label="Close">✕</button>${sheetRender()}`;
    card.scrollTop = scroll;
  }

  function close() {
    $('sheet').hidden = true;
    sheetRender = null;
    const cb = sheetOnClose;
    sheetOnClose = null;
    if (cb) cb();
  }

  const isOpen = () => !$('sheet').hidden;

  // One click handler for every sheet: buttons say what they do with
  // data-act="name" data-arg="…".
  const actions = {};
  function bindSheet() {
    $('sheet').addEventListener('click', (e) => {
      if (e.target.id === 'sheet') { close(); return; }
      const b = e.target.closest('button');
      if (!b || b.disabled) return;
      if (b.hasAttribute('data-close')) { A.tap(); close(); return; }
      const act = b.getAttribute('data-act');
      if (act && actions[act]) { A.tap(); actions[act](b.getAttribute('data-arg'), b); }
    });
  }

  /* ------------------ HUD ------------------ */

  function displayName() {
    const s = S.save;
    return `${s.prestige ? `[P${s.prestige}] ` : ''}${s.name}`;
  }

  function hud() {
    const s = S.save;
    if (!s) return;
    const pr = S.progress();
    const rk = S.rank();
    $('hud-name').textContent = displayName();
    $('hud-rank').textContent = `Lv ${pr.level} · ${rk.name}`;
    $('hud-rank-icon').textContent = S.avatarIcon();
    $('hud-energy').textContent = `${s.energy}/${S.maxEnergy()}`;
    $('hud-cores').textContent = fmt(s.cores);

    if (pr.next) {
      $('xp-levels').textContent = `LEVEL ${pr.level} → LEVEL ${pr.next}`;
      $('xp-text').textContent = `${fmt(pr.into)} / ${fmt(pr.need)} XP`;
    } else {
      $('xp-levels').textContent = `LEVEL ${pr.level} · MAX`;
      $('xp-text').textContent = S.canPrestige() ? 'NEXUS MASTER: Prestige is ready' : 'MAX';
    }
    $('xp-rank').textContent = `${rk.icon} ${rk.name}`;
    $('xp-fill').style.width = `${pr.frac * 100}%`;
    $('xp-bar').setAttribute('aria-valuenow', Math.round(pr.frac * 100));
    $('xp-caps').textContent = `Today ${fmt(s.caps.dayXP)}/${fmt(D.CAPS.day)} · Week ${fmt(s.caps.weekXP)}/${fmt(D.CAPS.week)}`;

    if (pr.next) {
      $('next-title').textContent = `NEXT LEVEL: ${pr.next}`;
      $('next-left').textContent = `Earn ${fmt(pr.left)} more XP`;
      const rw = D.LEVELS[pr.next][1].map(S.rewardText).join(' + ');
      $('next-list').innerHTML = S.recommend().map((t) => `<li>${esc(t)}</li>`).join('') + `<li class="reward">🎁 ${esc(rw)}</li>`;
    } else {
      $('next-title').textContent = 'NEXUS MASTER';
      $('next-left').textContent = 'Prestige is ready';
      $('next-list').innerHTML = '<li>👑 Open your profile to enter NEXUS PRESTIGE</li>';
    }

    $('btn-territory').hidden = !S.has('territory');
    $('dot-upgrades').hidden = !(s.tokens > 0 || D.BRANCH_ORDER.some((b) => canBuy(b)));
    $('dot-missions').hidden = !(S.has('squad') && !s.squad.active && s.squad.offer.length) && !(S.has('legendaryMissions') && s.legend && !s.legend.active && !s.legend.done);
    $('dot-team').hidden = !chatUnread && !D.OBJECTIVES.some((o) => { const p = S.objectiveProgress(o, Date.now()); return p.done && !p.claimed; });

    activeStrip();
  }

  function canBuy(b) {
    const s = S.save;
    const B = D.BRANCHES[b];
    if (B.gate && !S.has(B.gate)) return false;
    if (s.up[b] >= D.BRANCH_MAX) return false;
    return s.cores >= D.branchCost(b, s.up[b]);
  }

  function activeStrip() {
    const s = S.save;
    const now = Date.now();
    const chips = [];
    if (s.defense) {
      const m = s.defense.acc / 60e3;
      const goal = s.defense.paid10 ? 30 : 10;
      chips.push(`<button class="chip def" type="button" data-chip="defense">🛡️ ${esc(s.defense.name)} ${Math.floor(m)}:${String(Math.floor((s.defense.acc / 1000) % 60)).padStart(2, '0')} / ${goal}:00</button>`);
    }
    if (s.squad.active) {
      const a = s.squad.active, M = D.SQUAD[a.type];
      chips.push(`<button class="chip squad" type="button" data-chip="missions">🤝 ${esc(M.name)} ${a.prog}/${M.goal} · ${fmtTime(a.until - now)}</button>`);
    }
    if (s.legend && s.legend.active) chips.push(`<button class="chip legend" type="button" data-chip="missions">🐉 Legendary ${s.legend.stage}/3</button>`);
    const w = S.eventWindow(now);
    if (w.live) chips.push(`<button class="chip event" type="button" data-chip="event">🏆 ${esc(S.eventName())} · ${fmtTime(w.end - now)} · ${s.event.win === w.win ? s.event.pts : 0} pts</button>`);
    if (G().linkFrom) chips.push(`<button class="chip link" type="button" data-chip="cancelLink">🔗 Pick a portal to link · ✕</button>`);
    $('active').innerHTML = chips.join('');
  }

  /* ------------------ Level-up ------------------ */

  const luQueue = [];
  function levelUp(d) {
    luQueue.push(d);
    if (luQueue.length === 1) showLevelUp();
  }

  function showLevelUp() {
    const d = luQueue[0];
    if (!d) return;
    A.levelUp();
    $('lu-level').textContent = d.level;
    const newRank = D.RANKS.find((r) => r.from === d.level && d.level > 1);
    $('lu-rank').textContent = newRank ? `New rank: ${newRank.icon} ${newRank.name}` : `${d.rank.icon} ${d.rank.name}`;
    $('lu-rewards').innerHTML = d.rewards.map((r) => `<li>🎁 ${esc(r.text)}${r.note ? `<small>${esc(r.note)}</small>` : ''}</li>`).join('')
      + (d.level % 5 === 0 ? '<li class="major">★ Major unlock</li>' : '');
    $('levelup').hidden = false;
  }

  function bindLevelUp() {
    $('lu-ok').addEventListener('click', () => {
      luQueue.shift();
      $('levelup').hidden = true;
      if (luQueue.length) setTimeout(showLevelUp, 200);
      hud();
    });
  }

  /* ------------------ Portal ------------------ */

  function ownerLabel(o) {
    return o ? `<span style="color:${D.TEAMS[o].color}">${D.TEAMS[o].glyph} ${D.TEAMS[o].name}</span>` : '<span class="muted">Neutral</span>';
  }

  function portalSheet(id) {
    const p = W.portalById(id);
    if (!p) return;
    const pick = G().linkFrom;
    if (pick && pick.id !== p.id) { linkTo(p); return; }
    sheet(() => portalHTML(p));
  }

  function uplinkBar(n, owner) {
    const col = owner ? D.TEAMS[owner].color : 'var(--muted)';
    return `<span class="uplinks" style="--uc:${col}">${Array.from({ length: D.MAX_UPLINKS }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;
  }

  function portalHTML(p) {
    const s = S.save;
    const now = Date.now();
    const R = D.RARITY[p.rarity];
    const dist = W.distM(G().pos, p);
    const known = S.discovered(p);
    const owner = S.ownerOf(p, now);
    const r = s.portals[p.id] || {};
    const ups = S.uplinksOf(p, now);
    let out = `<div class="p-head" style="--rc:${R.color}">
      <span class="p-icon">${R.icon}</span>
      <div><h2>${known ? esc(p.name) : 'Unknown signal'}</h2>
      <small>${R.name} portal · ${R.diff} · ${fmtDist(dist)} away</small></div></div>`;
    if (!known) {
      out += `<p class="muted">Walk within your scanner range (${S.scanRange()} m) to discover it.</p>
        <p class="tbl-note">Discovering it: <b class="xp">+${fmt(D.XP.discover[p.rarity] || 0)} XP</b> <b class="cores">+${fmt(D.CORES.discover[p.rarity] || 0)} ⬢</b></p>`;
      out += walkBtn(p);
      return out;
    }
    out += `<div class="p-meta"><span>Held by ${ownerLabel(owner)}${r.mine && owner === s.team ? ' · <b>yours</b>' : ''}${owner ? ` · <b>L${ups}</b>` : ''}</span>
      <span class="p-ups">${uplinkBar(ups, owner)} ${ups}/${D.MAX_UPLINKS} Uplinks${S.firewallsOf(p) ? ` · ${'🧱'.repeat(S.firewallsOf(p))} Firewall` : ''}</span>
      <span>🔑 ${S.keyCount(p.id)} key${S.keyCount(p.id) === 1 ? '' : 's'} · Worth ${fmt(R.xp[0])}–${fmt(R.xp[1])} XP · ${fmt(R.cores[0])}–${fmt(R.cores[1])} ⬢</span></div>`;

    // Hack.
    const cd = r.hackAt && r.hackAt > now ? r.hackAt - now : 0;
    const enemy = owner && owner !== s.team;
    out += `<h3>Hack${cd ? ` · ready in ${fmtTime(cd)}` : ''}</h3><p class="small muted hint">Drops gear and often a key${enemy ? '. On an enemy portal it also <b>sabotages</b> Uplinks' : ''}.</p><div class="tiers">`;
    for (const t of S.tiersFor(p)) {
      const why = S.canHack(p, t.tier, dist);
      out += `<button class="tier ${t.allowed ? '' : 'locked'}" type="button" data-act="hack" data-arg="${p.id}|${t.tier}" ${why ? 'disabled' : ''}>
        <b>${t.H.name}</b><small>${t.allowed ? `+${fmt(D.XP.hack[t.tier])} XP · ${D.DROPS[t.tier][0]}–${D.DROPS[t.tier][1]} items${enemy ? ` · 💥${D.SABOTAGE[t.tier]}` : ''} · 🔋${t.H.energy}` : esc(t.lockText)}</small>
        ${why && t.allowed ? `<small class="why">${esc(why)}</small>` : ''}</button>`;
    }
    out += '</div>';
    if (r.breach && !owner) out += '<p class="good small">Nexus wards down: deploy an Uplink to capture it!</p>';

    if (enemy) {
      // Attack.
      const why = S.canBomb(p, dist);
      out += `<h3>Attack</h3><button class="btn btn-danger wide" type="button" data-act="bomb" data-arg="${p.id}" ${why ? 'disabled' : ''}>💥 Fire Pulse Bomb <small>Knocks out ${D.BOMB_HITS} Uplinks · ${S.itemCount('bomb')} left · 🔋${D.ENERGY.cost.bomb}</small></button>`;
      if (why) out += `<p class="why center">${esc(why)}</p>`;
      out += `<p class="small muted center">Knock out all ${ups} Uplinks and it goes neutral. Then deploy one of yours to capture it: <b class="xp">+${D.XP.captureEnemy} XP</b> <b class="cores">+${D.CORES.captureEnemy} ⬢</b></p>`;
    } else if (!owner) {
      // Capture.
      const c = S.canCapture(p, dist);
      const fromEnemy = !!(r.neutral && r.from);
      const xp = p.rarity === 'nexus' ? `${fmt(R.xp[0])}–${fmt(R.xp[1])} XP · ${fmt(R.cores[0])}–${fmt(R.cores[1])} ⬢`
        : fromEnemy ? `+${D.XP.captureEnemy} XP · +${D.CORES.captureEnemy} ⬢` : `+${D.XP.captureNeutral} XP`;
      if (fromEnemy) out += `<p class="good small center">You knocked it out! Capturing it counts as taking it from ${esc(D.TEAMS[r.from].name)}.</p>`;
      out += `<button class="btn btn-main wide" type="button" data-act="capture" data-arg="${p.id}" ${c.ok ? '' : 'disabled'}>📶 Deploy Uplink to capture <small>${xp} · 🔋${D.ENERGY.cost.capture}</small></button>`;
      if (!c.ok) out += `<p class="why center">${esc(c.text)}</p>`;
    } else {
      // Build it up.
      out += '<h3>Fortify</h3><div class="tiers two">';
      const dw = S.canDeploy(p, dist), fw = S.canFirewall(p, dist);
      out += `<button class="tier" type="button" data-act="deploy" data-arg="${p.id}" ${dw ? 'disabled' : ''}><b>📶 Deploy Uplink</b><small>Level up · ${S.itemCount('uplink')} left · 🔋${D.ENERGY.cost.deploy}</small>${dw ? `<small class="why">${esc(dw)}</small>` : ''}</button>`;
      out += `<button class="tier" type="button" data-act="firewall" data-arg="${p.id}" ${fw ? 'disabled' : ''}><b>🧱 Install Firewall</b><small>Resists attacks · ${S.itemCount('firewall')} left · 🔋${D.ENERGY.cost.firewall}</small>${fw ? `<small class="why">${esc(fw)}</small>` : ''}</button>`;
      out += '</div>';
      // Defend.
      if (s.defense && s.defense.id === p.id) {
        out += `<button class="btn wide" type="button" data-act="stopDefend">🛡️ Stop defending <small>${Math.floor(s.defense.acc / 60e3)} min held</small></button>`;
      } else {
        const c = S.canDefend(p, dist);
        out += `<button class="btn wide" type="button" data-act="defend" data-arg="${p.id}" ${c.ok ? '' : 'disabled'}>🛡️ Defend <small>10 min: +${D.XP.defend10} XP · 30 min: +${D.XP.defend30} XP</small></button>`;
        if (!c.ok) out += `<p class="why center">${esc(c.text)}</p>`;
      }
      // Link.
      const near = dist <= D.RANGE.interact;
      out += `<button class="btn wide" type="button" data-act="linkStart" data-arg="${p.id}" ${near ? '' : 'disabled'}>🔗 Link to another portal <small>Needs its key · +${D.XP.link2} XP · close a triangle for a control field: +${D.XP.link3} XP</small></button>`;
      if (!near) out += `<p class="why center">Stand within ${D.RANGE.interact} m to link from here</p>`;
    }
    out += walkBtn(p);
    return out;
  }

  function walkBtn(ll) {
    if (S.save.settings.walk !== 'tap') return '';
    return `<button class="btn ghost wide" type="button" data-act="walk" data-arg="${ll.lat},${ll.lng}">🚶 Walk here</button>`;
  }

  actions.walk = (arg) => {
    const [lat, lng] = arg.split(',').map(Number);
    G().setWalk({ lat, lng });
    close();
  };

  actions.hack = async (arg) => {
    const [id, tier] = arg.split('|');
    const p = W.portalById(id);
    const dist = W.distM(G().pos, p);
    const why = S.canHack(p, tier, dist);
    if (why) { toast(esc(why), 'bad'); return; }
    S.startHack(p, tier);
    close();
    const params = S.hackParams(tier, p.rarity);
    const ok = await PH.hack.start({ title: D.HACKS[tier].name, sub: `${D.RARITY[p.rarity].icon} ${p.name}`, params });
    const res = S.finishHack(p, tier, ok);
    if (res.ok) {
      const got = Object.keys(res.drops).map((k) => `${D.ITEMS[k].icon}×${res.drops[k]}`).concat(res.key ? ['🔑×1'] : []).join(' ');
      toast(`💻 ${D.HACKS[tier].name} complete ${gain(res.xp, res.cores)}${res.doubled ? ' <small>⚛️ Quantum double cores!</small>' : ''}<br><small>Gear: ${got}</small>`
        + (res.sabotaged ? `<br><small>💥 Sabotage: ${res.sabotaged} Uplink${res.sabotaged > 1 ? 's' : ''} knocked out${res.neutralized ? '. It\'s neutral: deploy an Uplink!' : ''}</small>` : '')
        + (res.breached ? '<br><small>Nexus wards down: deploy an Uplink to capture it</small>' : ''), 'good');
      if (res.neutralized || res.breached) portalSheet(id);
    } else {
      toast('Hack failed. The portal locks you out for 1 minute.', 'bad');
    }
    hud();
  };

  actions.capture = (id) => {
    const p = W.portalById(id);
    const c = S.canCapture(p, W.distM(G().pos, p));
    if (!c.ok) { toast(esc(c.text), 'bad'); return; }
    const res = S.capture(p);
    A.capture();
    toast(`🏴 ${esc(res.text)} ${gain(res.xp, res.cores)}`, 'good');
    G().share(`captured ${p.name} ${D.RARITY[p.rarity].icon}`);
    redraw();
    hud();
  };

  actions.bomb = (id) => {
    const p = W.portalById(id);
    const why = S.canBomb(p, W.distM(G().pos, p));
    if (why) { toast(esc(why), 'bad'); return; }
    const res = S.bomb(p);
    A.bomb();
    G().blast(p);
    toast(res.neutral ? `💥 Direct hit! ${esc(p.name)} is neutral. Deploy an Uplink to capture it.` : `💥 ${res.hit} Uplink${res.hit > 1 ? 's' : ''} knocked out · ${res.left} left`, res.neutral ? 'good' : '');
    redraw();
    hud();
  };

  actions.deploy = (id) => {
    const p = W.portalById(id);
    const why = S.canDeploy(p, W.distM(G().pos, p));
    if (why) { toast(esc(why), 'bad'); return; }
    const n = S.deploy(p);
    A.ping();
    toast(`📶 Uplink deployed: ${esc(p.name)} is now L${n}`);
    redraw();
    hud();
  };

  actions.firewall = (id) => {
    const p = W.portalById(id);
    const why = S.canFirewall(p, W.distM(G().pos, p));
    if (why) { toast(esc(why), 'bad'); return; }
    S.installFirewall(p);
    A.ping();
    toast(`🧱 Firewall installed on ${esc(p.name)}`);
    redraw();
    hud();
  };

  actions.defend = (id) => {
    const p = W.portalById(id);
    S.startDefense(p);
    toast(`🛡️ Defending ${esc(p.name)}. Stay within ${D.RANGE.defendSlack} m. 10 min: +${D.XP.defend10} XP, 30 min: +${D.XP.defend30} XP`);
    redraw();
    hud();
  };
  actions.stopDefend = () => { S.stopDefense('Stopped'); redraw(); hud(); };

  actions.linkStart = (id) => {
    const p = W.portalById(id);
    G().linkFrom = p;
    close();
    const options = linkOptions(p);
    const withKey = options.filter((b) => S.keyCount(b.id) > 0);
    if (!options.length) toast(`No team portals you've discovered within ${S.linkRange()} m. Capture more nearby first.`, 'bad');
    else if (!withKey.length) toast(`🔗 ${options.length} team portal${options.length > 1 ? 's' : ''} in range, but you have no keys to them. Hack them for keys.`, 'bad');
    else toast(`🔗 Tap a team portal you have a key to (${withKey.length} in range)`);
    hud();
  };

  function linkOptions(a) {
    return G().nearby.portals.filter((b) => b.id !== a.id && S.discovered(b) && S.ownerOf(b) === S.save.team && W.distM(a, b) <= S.linkRange());
  }

  function linkTo(b) {
    const a = G().linkFrom;
    const why = S.canLink(a, b, G().pos);
    if (why) { toast(`🔗 ${esc(why)}`, 'bad'); return; }
    const res = S.link(a, b);
    A.link();
    G().linkFrom = null;
    if (res.fields) G().share('raised a control field 🔺');
    toast(`🔗 ${res.fields ? `Control field raised!` : res.n >= 3 ? `Network of ${res.n} portals` : '2 portals connected'} ${gain(res.xp)}`, 'good');
    hud();
  }

  function cubeSheet(e) {
    sheet(() => {
      const d = W.distM(G().pos, e);
      const near = d <= D.RANGE.interact;
      return `<div class="p-head" style="--rc:#FFE65A"><span class="p-icon">🟨</span><div><h2>Tech Cube</h2><small>${fmtDist(d)} away</small></div></div>
        <p class="muted">Worth <b class="cores">+${D.CORES.cube} ⬢</b> and up to +${D.ENERGY.cell(S.save.up.energy)} energy. Walk within ${D.RANGE.interact} m and it's picked up for you. Tech Cubes come back every 10 minutes.</p>
        ${near ? `<button class="btn btn-main wide" type="button" data-act="cube" data-arg="${e.id}">🟨 Pick it up</button>` : walkBtn(e)}`;
    });
  }
  actions.cube = (id) => {
    const e = G().nearby.energy.find((x) => x.id === id);
    if (e) G().collect(e);
    close();
  };

  /* ------------------ Gear ------------------ */

  function gearSheet() {
    sheet(() => {
      const s = S.save;
      let out = '<h2>Gear</h2><p class="muted small">Hack portals for more. Successful hacks drop 2–7 items and often a key to that portal.</p><div class="list">';
      for (const k of D.ITEM_ORDER) {
        const it = D.ITEMS[k];
        out += `<div class="mission"><span class="r-icon">${it.icon}</span><span><b>${it.name}</b><small>${esc(it.text)}</small></span><span class="r-dist big">${S.itemCount(k)}</span></div>`;
      }
      out += '</div><h3>🔑 Portal keys</h3>';
      const ids = Object.keys(s.keys).filter((id) => s.keys[id] > 0);
      if (!ids.length) out += '<p class="muted small">No keys yet. Hack a portal to get a key to it. You need a key to link to a portal.</p>';
      else {
        out += '<div class="list">';
        for (const id of ids) {
          const p = W.portalById(id);
          if (!p) continue;
          out += `<button class="row" type="button" data-act="openPortal" data-arg="${id}"><span class="r-icon">${D.RARITY[p.rarity].icon}</span><span><b>${esc(p.name)}</b><small>${ownerLabel(S.ownerOf(p))} · ${fmtDist(W.distM(G().pos, p))}</small></span><span class="r-dist">×${s.keys[id]}</span></button>`;
        }
        out += '</div>';
      }
      out += `<h3>Your network</h3><p class="small">${S.held().length} portals held · ${s.links.length}/${S.maxLinks()} links · ${s.fields.length} control field${s.fields.length === 1 ? '' : 's'}</p>`;
      return out;
    });
  }

  function signalSheet(sg) {
    sheet(() => {
      const d = W.distM(G().pos, sg);
      return `<div class="p-head" style="--rc:#C08CFF"><span class="p-icon">🌌</span><div><h2>Nexus signal</h2><small>${fmtDist(d)} away · fades in ${fmtTime(sg.expires - Date.now())}</small></div></div>
        <p class="muted">A rare ripple from the Nexus. Walk within ${D.RANGE.interact} m to lock onto it: <b class="xp">+${fmt(D.XP.nexusSignal)} XP</b>.</p>${walkBtn(sg)}`;
    });
  }

  /* ------------------ Scan ------------------ */

  function scanSheet() {
    sheet(() => {
      const n = G().nearby;
      const pos = G().pos;
      const items = [];
      for (const p of n.portals) items.push({ d: W.distM(pos, p), p });
      items.sort((a, b) => a.d - b.d);
      let out = `<h2>Scan</h2><p class="muted small">Scanner range ${S.scanRange()} m · reach ${D.RANGE.interact} m${S.has('quantum') ? ` · Nexus signals ${S.signalRange()} m` : ''}</p>`;
      if (n.signals.length) {
        out += '<h3>Nexus signals</h3><div class="list">';
        for (const sg of n.signals) out += `<button class="row" type="button" data-act="openSignal" data-arg="${sg.id}"><span class="r-icon">🌌</span><span><b>Nexus signal</b><small>${fmtDist(W.distM(pos, sg))}</small></span></button>`;
        out += '</div>';
      }
      out += '<h3>Portals</h3><div class="list">';
      if (!items.length) out += '<p class="muted">Nothing on the scanner. Keep moving.</p>';
      for (const { d, p } of items.slice(0, 30)) {
        const R = D.RARITY[p.rarity];
        const known = S.discovered(p);
        const o = S.ownerOf(p);
        out += `<button class="row" type="button" data-act="openPortal" data-arg="${p.id}">
          <span class="r-icon">${R.icon}</span>
          <span><b>${known ? esc(p.name) : 'Unknown signal'}</b><small>${R.name} · ${known ? ownerLabel(o) : 'undiscovered'}</small></span>
          <span class="r-dist">${fmtDist(d)}</span></button>`;
      }
      out += '</div>';
      return out;
    });
  }
  actions.openPortal = (id) => portalSheet(id);
  actions.openSignal = (id) => { const sg = G().nearby.signals.find((x) => x.id === id); if (sg) signalSheet(sg); };

  /* ------------------ Missions ------------------ */

  let missionTab = 'daily';
  function missionsSheet(tab) {
    if (tab) missionTab = tab;
    sheet(missionsHTML);
  }
  actions.mtab = (t) => { missionTab = t; redraw(); };

  function tabs(list, cur, act) {
    return `<div class="tabs">${list.map(([id, label]) => `<button type="button" class="${id === cur ? 'on' : ''}" data-act="${act}" data-arg="${id}">${label}</button>`).join('')}</div>`;
  }

  function missionsHTML() {
    const s = S.save;
    const now = Date.now();
    let out = `<h2>Missions</h2>${tabs([['daily', 'Daily'], ['squad', 'Squad'], ['legend', 'Legendary'], ['event', 'Team Event']], missionTab, 'mtab')}`;
    if (missionTab === 'daily') {
      const dl = s.daily;
      out += `<p class="muted small">3 new missions every day · resets in ${fmtTime(S.nextMidnight(now) - now)}</p><div class="list">`;
      for (const id of dl.ids) {
        const M = D.DAILY[id];
        const pr = Math.min(M.goal, dl.prog[id] || 0);
        out += `<div class="mission ${dl.done[id] ? 'done' : ''}"><span class="r-icon">${M.icon}</span>
          <span><b>${esc(M.text)}</b><small>${M.xp} XP + ${M.cores} Cores</small><span class="mini-bar"><i style="width:${(pr / M.goal) * 100}%"></i></span></span>
          <span class="r-dist">${dl.done[id] ? '✓' : `${pr}/${M.goal}`}</span></div>`;
      }
      out += `</div><div class="mission bonus ${dl.bonus ? 'done' : ''}"><span class="r-icon">🎁</span><span><b>Daily Completion Bonus</b><small>Complete all 3: ${D.DAILY_BONUS.xp} XP + ${D.DAILY_BONUS.cores} Tech Cores</small></span><span class="r-dist">${dl.bonus ? '✓' : `${dl.ids.filter((i) => dl.done[i]).length}/3`}</span></div>`;
    } else if (missionTab === 'squad') {
      if (!S.has('squad')) return out + lockedHTML('squad');
      out += `<p class="muted small">Your squad: ${s.squadmates.map(esc).join(', ')} and you. Every mission: <b class="xp">+${D.XP.squad} XP</b> <b class="cores">+${D.CORES.squad} ⬢</b>. ${D.SQUAD_MINUTES} minutes to finish.</p>`;
      const a = s.squad.active;
      if (a) {
        const M = D.SQUAD[a.type];
        out += `<div class="mission active"><span class="r-icon">🤝</span><span><b>${esc(M.name)}</b><small>${esc(M.text)} · ${fmtTime(a.until - now)} left</small><span class="mini-bar"><i style="width:${(a.prog / M.goal) * 100}%"></i></span></span><span class="r-dist">${a.prog}/${M.goal}</span></div>`;
      } else {
        out += '<h3>Available</h3><div class="list">';
        if (!s.squad.offer.length) out += '<p class="muted">New squad missions arrive every 4 hours.</p>';
        for (const t of s.squad.offer) {
          const M = D.SQUAD[t];
          out += `<div class="mission"><span class="r-icon">${t === 'teamop' ? '⭐' : '🤝'}</span><span><b>${esc(M.name)}</b><small>${esc(M.text)}${t === 'teamop' ? ' · Special Team Mission' : ''}</small></span><button class="btn small" type="button" data-act="squad" data-arg="${t}">Accept</button></div>`;
        }
        out += '</div>';
      }
    } else if (missionTab === 'legend') {
      if (!S.has('legendaryMissions')) return out + lockedHTML('legendaryMissions');
      const L = s.legend;
      out += `<p class="muted small">One Legendary Mission a day. Clear all three stages, in order, before midnight: <b class="xp">+${fmt(D.XP.legendaryMission)} XP</b> <b class="cores">+${D.CORES.legendaryMission} ⬢</b></p><div class="list">`;
      D.LEGENDARY_STAGES.forEach((st, i) => {
        const done = L.done || L.stage > i;
        out += `<div class="mission ${done ? 'done' : L.active && L.stage === i ? 'active' : ''}"><span class="r-icon">${done ? '✓' : i + 1}</span><span><b>${esc(st.text)}</b></span></div>`;
      });
      out += '</div>';
      if (L.done) out += '<p class="good center">Done for today. A new one arrives at midnight.</p>';
      else if (!L.active) out += '<button class="btn btn-main wide" type="button" data-act="legend">🐉 Begin Legendary Mission</button>';
    } else {
      const w = S.eventWindow(now);
      const name = S.eventName();
      out += `<p class="muted small">A team event runs for 30 minutes every 2 hours. Discover, hack, capture, link and defend to score for your team. Win: <b class="xp">+${fmt(D.XP.teamEvent)} XP</b> and Faction Points.</p>`;
      if (w.live) {
        const pts = s.event.win === w.win ? s.event.pts : 0;
        const sc = S.eventScores(w.win, pts);
        const fr = Math.min(1, (now - w.start) / D.EVENT.length);
        out += `<div class="event-card live"><b>🏆 ${esc(name)} is live</b><small>Ends in ${fmtTime(w.end - now)} · your points: ${pts}</small>`;
        for (const t of Object.keys(D.TEAMS)) {
          const v = Math.round(sc[t] * (t === s.team ? 1 : fr));
          out += `<div class="ev-row"><span style="color:${D.TEAMS[t].color}">${D.TEAMS[t].name}</span><span class="mini-bar"><i style="width:${Math.min(100, v / 30)}%;background:${D.TEAMS[t].color}"></i></span><b>${fmt(v)}</b></div>`;
        }
        out += '</div>';
      } else {
        out += `<div class="event-card"><b>Next: ${esc(name)}</b><small>Starts in ${fmtTime(w.next - now)}</small></div>`;
      }
      out += `<h3>Points</h3><p class="small muted">Discover ${D.EVENT_PTS.discover} · Hack ${D.HACKS.basic.pts}/${D.HACKS.advanced.pts}/${D.HACKS.expert.pts} · Capture ${D.EVENT_PTS.capture} · Link ${D.EVENT_PTS.link} · Defend ${D.EVENT_PTS.defendMin}/min · Nexus signal ${D.EVENT_PTS.signal}</p>`;
    }
    return out;
  }

  function lockedHTML(u) {
    return `<div class="locked-box">🔒 <b>${esc(D.GATES[u].name)}</b> opens at Level ${D.GATES[u].level}<small>${esc(D.GATES[u].text)}</small></div>`;
  }

  actions.squad = (t) => { if (S.acceptSquad(t)) toast(`🤝 Squad mission accepted: ${esc(D.SQUAD[t].name)}`); redraw(); hud(); };
  actions.legend = () => { if (S.acceptLegend()) toast('🐉 Legendary Mission started'); redraw(); hud(); };

  /* ------------------ Compass upgrades ------------------ */

  function upgradesSheet() {
    sheet(() => {
      const s = S.save;
      let out = `<h2>Compass upgrades</h2><p class="muted small">Spend Tech Cores to upgrade your Sci-Fi Compass. You choose the path. You have <b class="cores">${fmt(s.cores)} ⬢</b>${s.tokens ? ` and <b>${s.tokens} Compass Module${s.tokens > 1 ? 's' : ''}</b> (a free upgrade each)` : ''}.</p><div class="branches">`;
      for (const b of D.BRANCH_ORDER) {
        const B = D.BRANCHES[b];
        const l = s.up[b];
        const locked = B.gate && !S.has(B.gate);
        const max = l >= D.BRANCH_MAX;
        const cost = max ? 0 : D.branchCost(b, l);
        out += `<div class="branch ${locked ? 'locked' : ''}">
          <div class="br-top"><span class="r-icon">${B.icon}</span><span><b>${B.name} <small>${l}/${D.BRANCH_MAX}</small></b><small>${esc(B.text)}</small></span></div>
          <span class="pips">${Array.from({ length: D.BRANCH_MAX }, (_, i) => `<i class="${i < l ? 'on' : ''}"></i>`).join('')}</span>
          <small class="effect">Now: ${esc(B.effect(l))}${max ? '' : `<br>Next: ${esc(B.effect(l + 1))}`}</small>
          ${locked ? `<small class="why">Opens at Level ${D.GATES[B.gate].level}</small>`
            : max ? '<small class="good">MAX</small>'
            : `<button class="btn small" type="button" data-act="upgrade" data-arg="${b}" ${s.tokens > 0 || s.cores >= cost ? '' : 'disabled'}>${s.tokens > 0 ? 'Use Compass Module' : `Upgrade · ${fmt(cost)} ⬢`}</button>`}
        </div>`;
      }
      out += '</div>';
      return out;
    });
  }

  actions.upgrade = (b) => {
    const r = S.upgrade(b);
    toast(esc(r.text), r.ok ? 'good' : 'bad');
    if (r.ok) A.ping();
    redraw();
    hud();
  };

  /* ------------------ Team ------------------ */

  function teamSheet() {
    sheet(() => {
      const s = S.save;
      const T = D.TEAMS[s.team];
      const fp = S.teamFP();
      const tl = S.teamLevel();
      const lo = D.teamFPFor(tl), hi = D.teamFPFor(tl + 1);
      const now = Date.now();
      let out = `<div class="team-head" style="--tc:${T.color}"><span class="team-glyph">${T.glyph}</span><div><h2>TEAM ${T.name}</h2><small>${esc(T.motto)}</small></div></div>
        <button class="btn btn-main wide" type="button" data-act="openChat">💬 Team chat <small>${chatStatusText()}${chatUnread ? ` · ${chatUnread} new` : ''}</small></button>
        <div class="xp-mini"><b>TEAM LEVEL ${tl}</b><span class="mini-bar"><i style="width:${tl >= D.TEAM_MAX ? 100 : ((fp - lo) / (hi - lo)) * 100}%;background:${T.color}"></i></span>
        <small>${fmt(fp)} Faction Points${tl < D.TEAM_MAX ? ` · ${fmt(hi - fp)} to Team Level ${tl + 1}` : ''} · you've earned ${fmt(s.fp)}</small></div>
        <p class="muted small">You earn Faction Points from squad missions, team events, Legendary Missions and weekly objectives. Your team levels up for everyone.</p>
        <h3>Team perks</h3><div class="list">`;
      for (const pk of D.TEAM_PERKS) {
        out += `<div class="perk ${tl >= pk.level ? 'on' : ''}"><b>TEAM LEVEL ${pk.level}</b><span>${esc(pk.name)}${pk.text ? `<small>${esc(pk.text)}</small>` : ''}</span><i>${tl >= pk.level ? '✓' : '🔒'}</i></div>`;
      }
      const ws = S.weekStart(now);
      out += `</div><h3>Weekly team objectives · ${fmtTime(ws + 7 * 86400e3 - now)} left</h3>`;
      D.OBJECTIVES.forEach((o, i) => {
        const pr = S.objectiveProgress(o, now);
        out += `<div class="objective ${pr.done ? 'done' : ''}"><b>OBJECTIVE ${i + 1} — ${esc(o.name)}</b><span>${esc(o.text)}</span>
          <span class="mini-bar"><i style="width:${pr.frac * 100}%;background:${T.color}"></i></span>
          <small>${fmt(pr.total)} / ${fmt(o.goal)} · you: ${fmt(pr.mine)}</small><small class="reward">${esc(o.reward)}</small>
          ${pr.claimed ? '<small class="good">Claimed ✓</small>' : pr.done ? `<button class="btn small btn-main" type="button" data-act="claimObj" data-arg="${o.id}">Claim</button>` : ''}</div>`;
      });
      out += `<h3>Your squad</h3><p class="small">${s.squadmates.map((m) => `🧑‍🚀 ${esc(m)}`).join(' · ')}</p>`;
      if (!S.has('squad')) out += `<p class="muted small">Squad missions open at Level ${D.GATES.squad.level}.</p>`;
      return out;
    });
  }

  actions.claimObj = (id) => {
    if (S.claimObjective(id)) { A.levelUp(); toast('🏆 Team objective reward claimed', 'good'); }
    redraw();
    hud();
  };

  /* ------------------ Profile ------------------ */

  let profileTab = 'profile';
  function profileSheet(tab) {
    if (tab) profileTab = tab;
    sheet(profileHTML);
  }
  actions.ptab = (t) => { profileTab = t; redraw(); };

  function profileHTML() {
    const s = S.save;
    const pr = S.progress();
    const rk = S.rank();
    const T = D.TEAMS[s.team];
    let out = `${profileCard()}
      ${tabs([['profile', 'Profile'], ['custom', 'Customise'], ['style', 'Cosmetics'], ['ranks', 'Ranks'], ['ach', 'Achievements']], profileTab, 'ptab')}`;
    if (profileTab === 'custom') return out + customiseHTML();
    if (profileTab === 'profile') {
      const rows = [
        ['PLAYER LEVEL', pr.level], ['RANK', rk.name], ['TEAM', T.name],
        ['PORTALS HACKED', s.stats.hacked], ['PORTALS DEFENDED', s.stats.defended], ['SQUAD MISSIONS', s.stats.squad],
        ['NEXUS EVENTS', s.stats.nexusEvents], ['PRESTIGE', s.prestige],
      ];
      out += `<dl class="profile">${rows.map(([k, v]) => `<dt>${k}:</dt><dd>${esc(typeof v === 'number' ? fmt(v) : v)}</dd>`).join('')}</dl>
        <dl class="profile sub">
          <dt>Total XP</dt><dd>${fmt(s.xp)} / ${fmt(D.CUM[D.MAX_LEVEL])}</dd>
          <dt>Portals discovered</dt><dd>${fmt(s.stats.discovered)}</dd>
          <dt>Portals captured</dt><dd>${fmt(s.stats.captured)} (holding ${S.held().length})</dd>
          <dt>Links made</dt><dd>${fmt(s.stats.links)}</dd>
          <dt>Nexus signals</dt><dd>${fmt(s.stats.signals)}</dd>
          <dt>Team events won</dt><dd>${fmt(s.stats.eventsWon)}</dd>
          <dt>Distance</dt><dd>${fmtDist(s.stats.meters)}</dd>
        </dl>`;
      out += '<h3>Nexus Prestige</h3>';
      if (S.canPrestige()) {
        const next = D.prestigeReward(s.prestige + 1);
        out += `<p class="small">Reset to Level 1 and earn <b>P${s.prestige + 1}: ${esc(next.name)}</b>. You keep your cosmetics, achievements, badges, collectibles, Tech Cores and Compass upgrades.</p>
          <button class="btn btn-main wide" type="button" data-act="prestige">💠 Enter NEXUS PRESTIGE</button>`;
      } else {
        out += `<p class="muted small">Reach Level 50 to Prestige. Your level resets to 1, but you keep cosmetics, achievements, badges, Prestige abilities and rare collectibles.</p>`;
      }
      out += `<div class="list">${[1, 2, 3, 4, 5, 6].map((p) => `<div class="perk ${s.prestige >= p ? 'on' : ''}"><b>P${p}${p === 6 ? '+' : ''}</b><span>${esc(D.prestigeReward(p).name)}</span><i>${s.prestige >= p ? '✓' : ''}</i></div>`).join('')}</div>`;
    } else if (profileTab === 'ranks') {
      for (const r of D.RANKS) {
        const cur = r === rk;
        const done = pr.level > r.to || (pr.level === 50 && r.id === 'master');
        out += `<div class="rank-card ${cur ? 'cur' : ''} ${done ? 'done' : ''}"><b>${r.icon} LEVELS ${r.from}–${r.to} — ${r.name}</b><small>${esc(r.blurb)}</small>
          <ul>${r.unlocks.map((u) => `<li>${esc(u)}</li>`).join('')}</ul></div>`;
      }
      out += '<h3>Unlock milestones</h3><div class="list">';
      for (let l = 5; l <= 50; l += 5) {
        const txt = D.LEVELS[l][1].map(S.rewardText).join(' + ');
        out += `<div class="perk ${pr.level >= l ? 'on' : ''}"><b>LEVEL ${l}</b><span>${esc(txt)}</span><i>${pr.level >= l ? '✓' : '🔒'}</i></div>`;
      }
      out += '</div>';
    } else if (profileTab === 'style') {
      out += '<h3>Compass skins</h3><div class="cos-grid">';
      for (const id in D.SKINS) {
        const sk = D.SKINS[id];
        const own = s.skins.includes(id);
        out += `<button class="cos ${s.skin === id ? 'on' : ''}" type="button" data-act="skin" data-arg="${id}" ${own ? '' : 'disabled'}>
          <span class="swatch" style="background:conic-gradient(${sk.colors.join(',')},${sk.colors[0]})"></span><b>${esc(sk.name)}</b><small>${own ? (s.skin === id ? 'Equipped' : 'Equip') : `🔒 ${esc(sk.from)}`}</small></button>`;
      }
      out += '</div><h3>Agent gear</h3><div class="cos-grid">';
      out += `<button class="cos ${!s.gear ? 'on' : ''}" type="button" data-act="gear" data-arg=""><span class="swatch big">${rk.icon}</span><b>Rank emblem</b><small>${!s.gear ? 'Equipped' : 'Equip'}</small></button>`;
      for (const id in D.GEAR) {
        const g = D.GEAR[id];
        const own = s.gears.includes(id);
        out += `<button class="cos ${s.gear === id ? 'on' : ''}" type="button" data-act="gear" data-arg="${id}" ${own ? '' : 'disabled'}><span class="swatch big">${own ? g.icon : '🔒'}</span><b>${esc(g.name)}</b><small>${own ? (s.gear === id ? 'Equipped' : 'Equip') : esc(g.from)}</small></button>`;
      }
      out += '</div><h3>Badges</h3><p class="badges">';
      out += s.badges.length ? s.badges.map((b) => `<span title="${esc(D.BADGES[b].name)}">${D.BADGES[b].icon} ${esc(D.BADGES[b].name)}</span>`).join('') : '<span class="muted">Every 10 levels earns a rank badge.</span>';
      out += `</p>${s.frame ? '<p class="small">💠 Prestige Compass Frame active</p>' : ''}${s.portalFx ? '<p class="small">✨ Unique Portal Effect active on your portals</p>' : ''}`;
    } else {
      out += '<p class="muted small">Achievements are never reset by Prestige.</p><div class="list">';
      for (const a of D.ACHIEVEMENTS) {
        const got = s.ach[a.id];
        out += `<div class="perk ${got ? 'on' : ''}"><b>${a.icon}</b><span>${esc(a.name)}<small>${esc(a.text)}</small></span><i>${got ? '✓' : `${Math.min(a.n, s.stats[a.stat] || 0)}/${a.n}`}</i></div>`;
      }
      out += '</div>';
    }
    return out;
  }

  actions.skin = (id) => { S.save.skin = id; S.persist(); redraw(); };
  actions.gear = (id) => { S.save.gear = id || null; S.persist(); redraw(); };
  actions.prestige = () => {
    if (!confirm('Enter NEXUS PRESTIGE? Your level resets to 1. You keep cosmetics, achievements, badges, Tech Cores and Compass upgrades.')) return;
    const pr = S.prestige();
    if (!pr) return;
    A.levelUp();
    toast(`💠 PRESTIGE ${S.save.prestige}: ${esc(pr.name)}`, 'good');
    redraw();
    hud();
  };

  /* ------------------ Progression guide ------------------ */

  let guideTab = 'levels';
  function guideSheet(tab) {
    if (tab) guideTab = tab;
    sheet(guideHTML);
  }
  actions.gtab = (t) => { guideTab = t; redraw(); };

  function table(head, rows) {
    return `<table class="tbl"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }

  function guideHTML() {
    const lvl = S.level();
    let out = `<h2>Progression</h2>${tabs([['levels', 'Levels'], ['xp', 'XP'], ['cores', 'Cores'], ['portals', 'Portals'], ['loop', 'How to play']], guideTab, 'gtab')}`;
    if (guideTab === 'levels') {
      out += '<p class="muted small">XP to Next is what you need to reach the next level.</p>';
      const rows = [];
      for (let l = 1; l <= D.MAX_LEVEL; l++) {
        const rw = D.LEVELS[l][1].map(S.rewardText).join(' + ');
        rows.push([l === lvl ? `<b class="here">▶ ${l}</b>` : l, l < D.MAX_LEVEL ? fmt(D.LEVELS[l][0]) : '—', fmt(D.CUM[l]), esc(rw)]);
      }
      out += table(['Level', 'XP to Next', 'Cumulative XP', 'Major Reward'], rows);
    } else if (guideTab === 'xp') {
      const X = D.XP;
      out += table(['Action', 'XP Reward'], [
        ['Discover Common Portal', X.discover.common], ['Discover Rare Portal', X.discover.rare], ['Discover Epic Portal', X.discover.epic], ['Discover Legendary Portal', X.discover.legendary],
        ['Complete Basic Hack', X.hack.basic], ['Complete Advanced Hack', X.hack.advanced], ['Complete Expert Hack', X.hack.expert],
        ['Capture Neutral Portal', X.captureNeutral], ['Capture Enemy Portal', X.captureEnemy],
        ['Defend Portal for 10 min', X.defend10], ['Defend Portal for 30 min', X.defend30],
        ['Connect 2 Portals', X.link2], ['Connect 3+ Portals', X.link3],
        ['Complete Squad Mission', X.squad], ['Win Team Event', fmt(X.teamEvent)], ['Discover Nexus Signal', X.nexusSignal], ['Complete Legendary Mission', fmt(X.legendaryMission)],
      ].map(([a, b]) => [a, `${typeof b === 'number' ? fmt(b) : b} XP`]));
      out += `<p class="tbl-note">Daily XP Cap: <b>${fmt(D.CAPS.day)} XP</b> · Weekly XP Cap: <b>${fmt(D.CAPS.week)} XP</b></p>`;
      out += '<h3>Daily missions</h3>' + table(['Mission', 'Reward'], Object.values(D.DAILY).map((m) => [esc(m.text), `${m.xp} XP + ${m.cores} Cores`]));
      out += `<p class="tbl-note">Completing all 3 daily missions: Daily Completion Bonus, ${D.DAILY_BONUS.xp} XP + ${D.DAILY_BONUS.cores} Tech Cores.</p>`;
    } else if (guideTab === 'cores') {
      const C = D.CORES;
      out += '<p class="muted small">Tech Cores are the main upgrade currency. Spend them on Compass upgrades.</p>';
      out += table(['Source', 'Tech Cores'], [
        ['Common Portal', C.discover.common], ['Rare Portal', C.discover.rare], ['Epic Portal', C.discover.epic], ['Legendary Portal', C.discover.legendary],
        ['Basic Hack', C.hack.basic], ['Advanced Hack', C.hack.advanced], ['Expert Hack', C.hack.expert],
        ['Enemy Portal Capture', C.captureEnemy], ['Tech Cube (picked up)', C.cube], ['Squad Mission', C.squad], ['Legendary Mission', C.legendaryMission], ['Weekly Team Objective', C.weeklyObjective],
      ]);
    } else if (guideTab === 'portals') {
      out += table(['Portal', 'XP', 'Tech Cores', 'Difficulty'], D.RARITY_ORDER.map((k) => {
        const R = D.RARITY[k];
        return [`${R.icon} ${R.name}`, `${fmt(R.xp[0])}–${fmt(R.xp[1])}`, `${fmt(R.cores[0])}–${fmt(R.cores[1])}`, R.diff];
      }));
      out += `<p class="tbl-note">A portal's range is what it pays across discovering, hacking and capturing it. Your scanner sees Rare portals from Level ${D.RARITY.rare.level}, Epic from ${D.RARITY.epic.level}, Legendary from ${D.RARITY.legendary.level} and Nexus portals from ${D.RARITY.nexus.level}. A Nexus portal pays its whole range in one roll when you capture it.</p>`;
      out += '<h3>Hacks</h3>' + table(['Hack', 'Opens', 'Code', 'Grid', 'Energy'], D.TIER_ORDER.map((t) => {
        const H = D.HACKS[t];
        return [H.name, `Level ${H.level}`, `${H.len} nodes`, `${H.grid}×${H.grid}`, `🔋${H.energy}`];
      }));
      out += `<p class="tbl-note">Epic portals need an Advanced Hack or better; Legendary and Nexus portals need an Expert Hack.</p>`;
    } else {
      out += `<div class="loop">${['Explore', 'Discover', 'Hack', 'Earn XP', 'Level Up', 'Unlock', 'Upgrade Compass', 'Join Stronger Missions', 'Control More Portals', 'Compete', 'Reach Nexus Master'].map((x) => `<span>${x}</span>`).join('<i>→</i>')}</div>
        <ul class="howto">
          <li><b>Every action → XP.</b> Discover, hack, capture, defend and link portals, and finish missions.</li>
          <li><b>Every level → reward.</b> Every 5 levels → a major unlock. Every 10 levels → a new rank.</li>
          <li><b>The compass.</b> A 3D disc around you. Portals stand at their real bearing and distance. "?" are portals you haven't discovered: walk within scanner range. The dashed ring is your reach (${D.RANGE.interact} m).</li>
          <li><b>Tech Cubes.</b> The yellow cubes. Walk within reach (or tap one in reach) to pick it up: +${D.CORES.cube} Tech Cores and energy.</li>
          <li><b>Hacking.</b> Watch the code flash across the nodes, then tap it back in order. A successful hack drops gear (📶 Uplinks, 💥 Pulse Bombs, 🧱 Firewalls) and often a 🔑 key to that portal.</li>
          <li><b>Portals.</b> Each portal holds up to 8 Uplinks; that's its level (L1–L8). Deploy an Uplink on a neutral portal to capture it, and more to level up your team's portals. Firewalls help them hold.</li>
          <li><b>Taking enemy portals.</b> Knock out all their Uplinks with Pulse Bombs, or sabotage them with hacks (Basic 1, Advanced 2, Expert 3). Then it's neutral: deploy an Uplink to capture it.</li>
          <li><b>Links and control fields.</b> Link two of your team's portals with a key to the far one. Close a triangle of links to raise a control field.</li>
          <li><b>Holding portals.</b> Enemy teams attack the portals you hold. More Uplinks, Firewalls and the Defense upgrade help them hold, and a portal you're defending can't fall.</li>
          <li><b>Energy.</b> Hacks, attacks, deploying and linking use energy. It refills over time, and Tech Cubes top it up.</li>
          <li><b>Level 50 → Nexus Master. After that → Prestige.</b></li>
        </ul>`;
    }
    return out;
  }

  /* ------------------ Menu ------------------ */

  function menuSheet() {
    sheet(() => {
      const st = S.save.settings;
      return `<h2>Menu</h2><div class="list">
        <button class="row" type="button" data-act="guide"><span class="r-icon">📘</span><span><b>Progression guide</b><small>Levels, XP, Tech Cores, portals, how to play</small></span></button>
        <button class="row" type="button" data-act="walkMode"><span class="r-icon">${st.walk === 'gps' ? '📍' : '🏠'}</span><span><b>Moving: ${st.walk === 'gps' ? 'my location' : 'tap to walk'}</b><small>Tap to switch</small></span></button>
        <button class="row" type="button" data-act="rotate"><span class="r-icon">🧭</span><span><b>Compass turns with phone: ${st.rotate ? 'on' : 'off'}</b><small>Uses the compass sensor when there is one</small></span></button>
        <button class="row" type="button" data-act="sound"><span class="r-icon">${st.sound ? '🔊' : '🔇'}</span><span><b>Sound and vibration: ${st.sound ? 'on' : 'off'}</b></span></button>
        <button class="row" type="button" data-act="share"><span class="r-icon">📣</span><span><b>Share my captures in team chat: ${st.share ? 'on' : 'off'}</b><small>Posts when you capture a portal, raise a field or rank up</small></span></button>
        ${S.save.muted.length ? `<button class="row" type="button" data-act="unmute"><span class="r-icon">🔈</span><span><b>Unblock everyone in chat</b><small>${S.save.muted.length} blocked</small></span></button>` : ''}
        <button class="row" type="button" data-act="shop"><span class="r-icon">🛒</span><span><b>Shop</b><small>Spend Tech Cores on gear, boosts and style</small></span></button>
      </div>
      <h3>Account</h3><div class="list">
        <div class="row"><span class="r-icon">${S.avatarIcon()}</span><span><b>Logged in as ${esc(S.save.name)}</b><small>Accounts are saved on this phone</small></span></div>
        <button class="row" type="button" data-act="password"><span class="r-icon">🔑</span><span><b>Change password</b></span></button>
        <button class="row" type="button" data-act="logout"><span class="r-icon">🚪</span><span><b>Log out</b><small>Switch to another account or sign up</small></span></button>
        <button class="row danger" type="button" data-act="wipe"><span class="r-icon">🗑️</span><span><b>Delete account</b><small>Deletes your hacker and account from this phone</small></span></button>
        <a class="row" href="${D.PRIVACY_URL}" target="_blank" rel="noopener"><span class="r-icon">🔒</span><span><b>Privacy policy</b></span></a>
        <a class="row" href="${D.SUPPORT_URL}" target="_blank" rel="noopener"><span class="r-icon">💬</span><span><b>Help and feedback</b><small>Report a problem or a player</small></span></a>
      </div><p class="fineprint">Portal Hackers: Nexus · your progress is saved on this phone.</p>`;
    });
  }

  actions.guide = () => guideSheet('levels');
  actions.walkMode = () => { G().setWalkMode(S.save.settings.walk === 'gps' ? 'tap' : 'gps'); redraw(); };
  actions.rotate = () => { S.save.settings.rotate = !S.save.settings.rotate; S.persist(); redraw(); };
  actions.sound = () => { S.save.settings.sound = !S.save.settings.sound; A.enabled = S.save.settings.sound; S.persist(); redraw(); };
  actions.share = () => { S.save.settings.share = !S.save.settings.share; S.persist(); redraw(); };
  actions.shop = () => shopSheet();
  actions.unmute = () => { S.save.muted = []; S.persist(); redraw(); };
  actions.logout = () => {
    S.persist(true);
    PH.chat.stop();
    PH.accounts.logOut();
    location.reload();
  };
  actions.wipe = () => {
    if (!confirm(`Delete ${S.save.name}'s account and hacker from this phone? This cannot be undone.`)) return;
    PH.chat.stop();
    PH.accounts.remove(S.save.name);
    location.reload();
  };

  function passwordSheet() {
    sheet(() => `<h2>Change password</h2>
      <form class="ob-form" onsubmit="return false">
        <input id="pw-old" type="password" autocomplete="current-password" placeholder="Current password" aria-label="Current password">
        <input id="pw-new" type="password" autocomplete="new-password" placeholder="New password (6+ characters)" aria-label="New password">
        <input id="pw-new2" type="password" autocomplete="new-password" placeholder="New password again" aria-label="New password again">
        <p id="pw-err" class="form-err" role="alert"></p>
        <button class="btn btn-main btn-big" type="button" data-act="savePassword">Save</button>
      </form>`);
  }
  actions.password = () => passwordSheet();
  actions.savePassword = async () => {
    const o = $('pw-old').value, n = $('pw-new').value;
    if (n !== $('pw-new2').value) { $('pw-err').textContent = 'The new passwords don\'t match'; return; }
    $('pw-err').textContent = 'Saving…';
    const res = await PH.accounts.changePassword(S.save.name, o, n);
    if (!res.ok) { $('pw-err').textContent = res.error; return; }
    close();
    toast('🔑 Password changed', 'good');
  };

  /* ------------------ Shop ------------------ */

  let shopTab = 'deals';
  function shopSheet(tab) {
    if (tab) shopTab = tab;
    sheet(shopHTML);
  }
  actions.stab = (t) => { shopTab = t; redraw(); };

  function shopHTML() {
    const s = S.save;
    const now = Date.now();
    const deals = S.deals(now);
    let out = `<h2>Shop</h2><p class="muted small">Spend Tech Cores. You have <b class="cores">${fmt(s.cores)} ⬢</b>.</p>${tabs(D.SHOP_CATS, shopTab, 'stab')}`;
    const items = shopTab === 'deals' ? deals.map((id) => D.SHOP.find((x) => x.id === id)) : D.SHOP.filter((x) => x.cat === shopTab);
    if (shopTab === 'deals') out += `<p class="small muted">3 items at ${Math.round(D.DEAL_OFF * 100)}% off · new deals in ${fmtTime(S.nextMidnight(now) - now)}</p>`;
    out += '<div class="shop-grid">';
    for (const it of items) {
      const owned = S.ownsShop(it);
      const price = S.price(it);
      const deal = price < it.cost;
      out += `<div class="shop-item ${owned ? 'owned' : ''} ${deal ? 'deal' : ''}">
        <span class="shop-icon">${it.icon}</span><b>${esc(it.name)}</b>${it.text ? `<small>${esc(it.text)}</small>` : ''}
        ${owned ? '<span class="good small">Owned ✓</span>'
          : `<button class="btn small ${s.cores >= price ? 'btn-main' : ''}" type="button" data-act="buy" data-arg="${it.id}" ${s.cores >= price ? '' : 'disabled'}>${deal ? `<s>${fmt(it.cost)}</s> ` : ''}${fmt(price)} ⬢</button>`}
      </div>`;
    }
    out += '</div><p class="fineprint">Earn Tech Cores by discovering portals, hacking, capturing, missions, level-ups and Tech Cubes. There are no real-money purchases.</p>';
    return out;
  }

  actions.buy = (id) => {
    const res = S.buy(id, G().nearby.portals.map((p) => p.id));
    toast(`${res.ok ? '🛒 ' : ''}${esc(res.text)}`, res.ok ? 'good' : 'bad');
    if (res.ok) { A.ping(); PH.chat.updateProfile(); }
    redraw();
    hud();
  };

  /* ------------------ Profile card and customisation ------------------ */

  function profileCard() {
    const s = S.save;
    const banner = (D.BANNERS.find((b) => b.id === s.look.banner) || D.BANNERS[0]).css;
    const shows = s.look.showcase.map((id) => (D.BADGES[id] ? D.BADGES[id].icon : (D.ACHIEVEMENTS.find((a) => a.id === id) || {}).icon)).filter(Boolean);
    return `<div class="prof-card" style="--tc:${D.TEAMS[s.team].color};background:${banner}">
      <span class="prof-avatar">${S.avatarIcon()}${s.gear ? `<i>${D.GEAR[s.gear].icon}</i>` : ''}</span>
      <div class="prof-text">
        <h2 style="color:${S.nameColor()}">${esc(displayName())}${s.stars ? ` <span class="stars">${'★'.repeat(Math.min(s.stars, 10))}</span>` : ''}</h2>
        <small class="prof-title">${esc(S.titleText())}</small>
        <small>Lv ${S.level()} · ${D.TEAMS[s.team].glyph} ${D.TEAMS[s.team].name}</small>
        ${s.look.bio ? `<p class="prof-bio">“${esc(s.look.bio)}”</p>` : ''}
        ${shows.length ? `<span class="prof-show">${shows.join(' ')}</span>` : ''}
      </div></div>`;
  }

  function customiseHTML() {
    const s = S.save;
    let out = '<h3>Avatar</h3><div class="avatar-grid">';
    for (const a of D.AVATARS) {
      const lock = S.lookLock('avatar', a);
      out += `<button class="avatar-btn ${s.look.avatar === a.id ? 'on' : ''}" type="button" data-act="look" data-arg="avatar|${a.id}" ${lock ? 'disabled' : ''} aria-label="Avatar ${a.id}">${a.icon}${lock ? `<small>${esc(lock)}</small>` : ''}</button>`;
    }
    out += '</div><h3>Name colour</h3><div class="chips">';
    for (const c of D.NAME_COLORS) {
      const lock = S.lookLock('color', c);
      const col = c.color === 'team' ? D.TEAMS[s.team].color : c.color;
      out += `<button class="chip-btn ${s.look.color === c.id ? 'on' : ''}" type="button" data-act="look" data-arg="color|${c.id}" ${lock ? 'disabled' : ''} style="color:${col}">${esc(c.name)}${lock ? ' 🔒' : ''}</button>`;
    }
    out += '</div><h3>Banner</h3><div class="banner-grid">';
    for (const b of D.BANNERS) {
      const lock = S.lookLock('banner', b);
      out += `<button class="banner-btn ${s.look.banner === b.id ? 'on' : ''}" type="button" data-act="look" data-arg="banner|${b.id}" ${lock ? 'disabled' : ''} style="background:${b.css}"><span>${esc(b.name)}${lock ? ` · 🔒 ${esc(lock)}` : ''}</span></button>`;
    }
    out += '</div><h3>Title</h3><div class="chips">';
    out += `<button class="chip-btn ${!s.look.title ? 'on' : ''}" type="button" data-act="look" data-arg="title|">Your rank</button>`;
    for (const t of S.titles()) out += `<button class="chip-btn ${s.look.title === t.id ? 'on' : ''}" type="button" data-act="look" data-arg="title|${t.id}">${esc(t.text)}</button>`;
    out += `</div><p class="small muted">Earn titles from ranks, achievements and Prestige, or buy them in the shop.</p>
      <h3>Bio</h3><div class="bio-row"><input id="bio-input" type="text" maxlength="80" value="${esc(s.look.bio)}" placeholder="A line about you (80 characters)" aria-label="Bio"><button class="btn small btn-main" type="button" data-act="saveBio">Save</button></div>
      <h3>Showcase (pick up to 3)</h3><div class="chips">`;
    const opts = s.badges.map((id) => ({ id, icon: D.BADGES[id].icon, name: D.BADGES[id].name }))
      .concat(D.ACHIEVEMENTS.filter((a) => s.ach[a.id]).map((a) => ({ id: a.id, icon: a.icon, name: a.name })));
    if (!opts.length) out += '<span class="muted small">Earn badges and achievements to show them off here.</span>';
    for (const o of opts) out += `<button class="chip-btn ${s.look.showcase.includes(o.id) ? 'on' : ''}" type="button" data-act="look" data-arg="showcase|${o.id}">${o.icon} ${esc(o.name)}</button>`;
    out += '</div><p class="small muted">Change your compass skin and agent gear in Cosmetics. More avatars, colours, banners and titles are in the 🛒 shop.</p>';
    out += '<button class="btn wide" type="button" data-act="shopLook">🛒 Shop for style</button>';
    return out;
  }

  actions.look = (arg) => {
    const i = arg.indexOf('|');
    if (S.setLook(arg.slice(0, i), arg.slice(i + 1))) PH.chat.updateProfile();
    redraw();
  };
  actions.saveBio = () => {
    S.setLook('bio', $('bio-input').value);
    toast('Bio saved', 'good');
    redraw();
  };
  actions.shopLook = () => shopSheet('look');

  /* ------------------ Team chat ------------------ */

  let chatUnread = 0;
  const chatOpen = () => !$('chat').hidden;

  function chatStatusText() {
    const st = PH.chat.state;
    const n = PH.chat.roster.length;
    if (st === 'online') return `${n} online`;
    if (st === 'connecting') return 'connecting…';
    if (!PH.chat.supported()) return 'not available on this device';
    return 'offline';
  }

  function chatColor(from) {
    return from.color === 'team' ? D.TEAMS[S.save.team].color : from.color;
  }

  function msgHTML(m) {
    const mine = m.from.name === S.save.name;
    const time = new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (m.kind === 'activity') {
      return `<div class="msg activity"><span>${esc(m.from.avatar)} <b style="color:${chatColor(m.from)}">${esc(m.from.name)}</b> ${esc(m.text)}</span><time>${time}</time></div>`;
    }
    return `<div class="msg ${mine ? 'mine' : ''}">
      <span class="msg-av">${esc(m.from.avatar)}</span>
      <div class="msg-body"><div class="msg-meta"><button class="msg-name" type="button" data-name="${esc(m.from.name)}" style="color:${chatColor(m.from)}">${m.from.prestige ? `[P${m.from.prestige}] ` : ''}${esc(m.from.name)}</button><small>${esc(m.from.title)} · Lv ${m.from.level}</small><time>${time}</time></div>
      <p>${esc(m.text)}</p></div></div>`;
  }

  function renderChat() {
    if (!chatOpen()) return;
    const T = D.TEAMS[S.save.team];
    $('chat-title').textContent = `TEAM ${T.name} CHAT`;
    $('chat-status').textContent = PH.chat.state === 'online' ? `${PH.chat.roster.length} online${PH.chat.isHub ? ' · you\'re hosting the room' : ''}`
      : PH.chat.state === 'connecting' ? 'Connecting…' : PH.chat.supported() ? 'Offline: tap to reconnect' : 'Chat isn\'t available on this device';
    $('chat-roster').innerHTML = PH.chat.roster.map((p) => `<span class="ro" title="${esc(p.name)}"><i>${esc(p.avatar)}</i><b style="color:${chatColor(p)}">${esc(p.name)}</b></span>`).join('');
    const muted = new Set(S.save.muted);
    const list = $('chat-list');
    const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 60;
    const msgs = PH.chat.history.filter((m) => !muted.has(m.from.name));
    list.innerHTML = msgs.length ? msgs.map(msgHTML).join('')
      : `<p class="muted center chat-empty">No messages yet. Say hi to Team ${esc(T.name)}!<br><small>Messages go straight to teammates who are online now, and aren't kept on any server. Tap a name to block or report someone.</small></p>`;
    if (atBottom) list.scrollTop = list.scrollHeight;
  }

  function openChat() {
    close();
    $('chat').hidden = false;
    chatUnread = 0;
    if (PH.chat.state === 'offline') PH.chat.reconnect();
    renderChat();
    const list = $('chat-list');
    list.scrollTop = list.scrollHeight;
    hud();
  }
  actions.openChat = () => openChat();

  // Reports go to the project's issue tracker, with the player's recent messages.
  function reportPlayer(name) {
    const msgs = PH.chat.history.filter((m) => m.from.name === name).slice(-5)
      .map((m) => `- ${new Date(m.at).toISOString()}: ${m.text}`).join('\n');
    const body = `**Player:** ${name}\n**Team:** ${D.TEAMS[S.save.team].name}\n**Reported by:** ${S.save.name}\n\n**What happened?**\n(Please describe it here.)\n\n**Their recent messages:**\n${msgs || '(none on this phone)'}\n`;
    const url = `${D.SUPPORT_URL}/new?title=${encodeURIComponent(`Report: ${name} in team chat`)}&labels=report&body=${encodeURIComponent(body)}`;
    window.open(url, '_blank', 'noopener');
  }

  function bindChat() {
    $('chat-close').addEventListener('click', () => { $('chat').hidden = true; hud(); });
    $('chat-status').addEventListener('click', () => { if (PH.chat.state === 'offline') PH.chat.reconnect(); });
    $('chat-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = $('chat-input');
      const err = PH.chat.send(input.value);
      if (err && err !== 'Type a message first') toast(esc(err), 'warn');
      if (!err || err.startsWith('Not connected')) input.value = '';
      renderChat();
      $('chat-list').scrollTop = $('chat-list').scrollHeight;
    });
    $('chat-list').addEventListener('click', (e) => {
      const b = e.target.closest('[data-name]');
      if (!b) return;
      const name = b.dataset.name;
      if (name === S.save.name) return;
      if (confirm(`Block ${name}? You won't see their messages any more. You can unblock everyone in the menu.`)) {
        S.save.muted.push(name);
        S.persist();
        renderChat();
        if (confirm(`Also report ${name} to the developer? This opens a report form in your browser with their recent messages filled in.`)) reportPlayer(name);
      }
    });
    PH.chat.on('message', (m) => {
      // Keep the last 100 messages with your account.
      const c = S.save.chat;
      if (!c.some((x) => x.id === m.id)) {
        c.push(m);
        if (c.length > 100) c.splice(0, c.length - 100);
        S.persist();
      }
      if (!chatOpen() && m.from.name !== S.save.name && m.kind !== 'activity' && !S.save.muted.includes(m.from.name)) {
        chatUnread++;
        toast(`💬 <b>${esc(m.from.name)}</b>: ${esc(m.text.slice(0, 60))}`);
        hud();
      }
      renderChat();
    });
    PH.chat.on('roster', renderChat);
    PH.chat.on('state', () => { renderChat(); if (isOpen()) redraw(); });
  }

  /* ------------------ Wiring ------------------ */

  function bind() {
    bindSheet();
    bindLevelUp();
    $('btn-missions').addEventListener('click', () => { A.tap(); missionsSheet(); });
    $('btn-upgrades').addEventListener('click', () => { A.tap(); upgradesSheet(); });
    $('btn-team').addEventListener('click', () => { A.tap(); teamSheet(); });
    $('btn-profile').addEventListener('click', () => { A.tap(); profileSheet('profile'); });
    $('hud-agent').addEventListener('click', () => { A.tap(); profileSheet('profile'); });
    $('hud-menu').addEventListener('click', () => { A.tap(); menuSheet(); });
    $('hud-gear').addEventListener('click', () => { A.tap(); gearSheet(); });
    $('hud-shop').addEventListener('click', () => { A.tap(); shopSheet(); });
    bindChat();
    $('next-card').addEventListener('click', () => { A.tap(); guideSheet('levels'); });
    $('hk-abort').addEventListener('click', () => PH.hack.cancel());
    $('active').addEventListener('click', (e) => {
      const b = e.target.closest('[data-chip]');
      if (!b) return;
      const c = b.getAttribute('data-chip');
      if (c === 'defense' && S.save.defense) portalSheet(S.save.defense.id);
      else if (c === 'missions') missionsSheet(S.save.squad.active ? 'squad' : 'legend');
      else if (c === 'event') missionsSheet('event');
      else if (c === 'cancelLink') { G().linkFrom = null; hud(); }
    });
    // Panels show live timers.
    setInterval(() => {
      const typing = document.activeElement && document.activeElement.tagName === 'INPUT' && $('sheet-card').contains(document.activeElement);
      if (isOpen() && !PH.hack.running && !typing) redraw();
    }, 1000);
  }

  // Game events → toasts and the level-up screen.
  function onEvent(type, d) {
    switch (type) {
      case 'levelup': levelUp(d); break;
      case 'discover': A.discover(); toast(`${esc(d.text)} ${gain(d.xp, d.cores)}`, 'good'); break;
      case 'signal': A.signal(); toast(`🌌 Nexus signal locked ${gain(d.xp)}`, 'good'); break;
      case 'cap': toast(`⛔ ${esc(d.text)}`, 'warn'); break;
      case 'mission': if (!d.bad) A.ping(); toast(`${d.big ? '🎉 ' : ''}${esc(d.text)} ${gain(d.xp, d.cores)}${d.fp ? ` <small>+${d.fp} FP</small>` : ''}`, d.bad ? 'bad' : 'good'); break;
      case 'squadChat': toast(`💬 ${esc(d.text)}`); break;
      case 'lost': toast(`⚠️ ${d.lost.length === 1 ? 'One of your portals was' : `${d.lost.length} of your portals were`} taken by ${esc(D.TEAMS[d.lost[0].by].name)}`, 'bad'); break;
      case 'defenseEnd': toast(`🛡️ Defense over: ${esc(d.why)}`); break;
      case 'event': toast(d.win ? `🏆 Your team won the event! ${gain(D.XP.teamEvent)}` : '🏆 Team event over. Another team took it this time.', d.win ? 'good' : ''); break;
      case 'ach': A.ping(); toast(`🏅 Achievement: ${esc(d.a.name)}`, 'good'); break;
      default: break;
    }
  }

  PH.ui = { bind, onEvent, hud, toast, close, isOpen, portalSheet, cubeSheet, gearSheet, signalSheet, scanSheet, guideSheet, menuSheet };
})(window.PH);
