/* Wayfarers — start-up, the main loop, saving, and time spent away. */
(function (WF) {
  'use strict';

  const D = WF.data;
  const ST = WF.state;
  const R = WF.render;
  const UI = WF.ui;
  const { fmt } = WF.util;

  const store = (() => { try { return window.localStorage; } catch (e) { return null; } })();
  const canvas = document.getElementById('battle');
  const ctx = canvas.getContext('2d');

  let S = ST.load(store);
  let battle = null;
  let lastWall = S.lastSeen || Date.now();
  let lastFrame = performance.now();
  let t = 0;
  let uiTimer = 0;
  let saveTimer = 0;

  WF.audio.on = S.sound;

  const save = () => ST.save(store);

  /* ---------- The fight ---------- */

  function newBattle() {
    R.clearFx();
    battle = WF.battle.create(S.stage, S.party, ST.heroFull, ST.bonus().energy);
  }

  // Levels and upgrades bought mid-fight take effect straight away.
  function refreshStats() {
    if (!battle) return;
    battle.energyMult = ST.bonus().energy;
    for (const h of battle.heroes) {
      const f = ST.heroFull(h.id);
      const k = h.hp / h.maxHp;
      h.maxHp = f.hp;
      if (h.alive) h.hp = f.hp * k;
      h.atk = f.atk;
      h.interval = f.interval;
    }
  }

  const callbacks = {
    kill(foe) {
      ST.onKill(battle.stage, foe.boss);
      WF.audio.play('coin');
    },
    won() {
      const stage = battle.stage;
      const gems = ST.onStageWon(stage);
      if (D.isBoss(stage)) {
        WF.audio.play('boss');
        UI.toast(D.FOES[D.landOf(stage).boss].name + ' defeated!' + (gems ? ' +' + gems + ' gems' : ''));
        if (stage % D.STAGES_PER_CHAPTER === 0 && S.autoPush) setTimeout(() => UI.toast('Chapter ' + D.chapterOf(stage + 1) + ': ' + D.landOf(stage + 1).name), 1800);
      } else WF.audio.play('win');
      newBattle();
      if (UI.tab === 'battle' || UI.tab === 'camp') UI.rebuild();
      save();
    },
    lost() {
      const pushing = S.autoPush;
      ST.onStageLost(battle.stage);
      WF.audio.play('lose');
      if (pushing) UI.toast(battle.timedOut ? 'Out of time! Your party falls back to gather strength.' : 'Your party was defeated and falls back.');
      newBattle();
      if (UI.tab === 'battle') UI.rebuild();
      save();
    },
  };

  const SOUND_FOR = {
    shot: (e) => (e.style === 'heal' ? null : 'shoot'),
    cast: (e) => (e.skill.type === 'heal' || e.skill.type === 'shield' || e.skill.type === 'rally' ? 'heal' : 'cast'),
    blast: (e) => (e.style === 'aoe' || e.style === 'stun' ? 'blast' : null),
    dmg: (e) => (e.unit.side === 'hero' ? 'hurt' : e.crit ? 'crit' : 'hit'),
    death: (e) => (e.unit.side === 'foe' ? 'kill' : null),
  };

  function drainEvents() {
    for (const e of battle.events) {
      R.onEvent(e);
      const f = SOUND_FOR[e.kind];
      const name = f && f(e);
      if (name) WF.audio.play(name);
    }
    battle.events.length = 0;
  }

  /* ---------- Time away ---------- */

  function away(secs) {
    const before = { gold: S.chest.gold, gems: S.chest.gems };
    ST.fillChest(secs);
    const gained = { gold: S.chest.gold - before.gold, gems: S.chest.gems - before.gems };
    if (secs >= 60 && (gained.gold >= 1 || gained.gems >= 1)) UI.welcome(secs, { gold: S.chest.gold, gems: S.chest.gems });
    save();
  }

  /* ---------- Loop ---------- */

  function frame(now) {
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    t += dt;

    // Wall-clock time also covers the tab being hidden or the phone asleep.
    const wall = Date.now();
    const gap = (wall - lastWall) / 1000;
    lastWall = wall;
    if (gap > 5) away(gap);
    else if (gap > 0) ST.fillChest(gap);

    if (battle) {
      let left = dt * S.speed;
      while (left > 0) {
        const step = Math.min(0.05, left);
        WF.battle.update(battle, step, callbacks);
        left -= step;
      }
      drainEvents();
    }
    R.frame(ctx, battle, dt, t);
    UI.hud(battle);

    uiTimer += dt;
    if (uiTimer > 0.25) { uiTimer = 0; UI.refresh(); }
    saveTimer += dt;
    if (saveTimer > 10) { saveTimer = 0; save(); }

    requestAnimationFrame(frame);
  }

  /* ---------- Start ---------- */

  function resize() {
    R.resize(canvas);
  }

  UI.init({
    save,
    restartBattle: newBattle,
    partyChanged: () => { newBattle(); save(); },
    statsChanged: () => { refreshStats(); save(); },
    reset: () => {
      S = ST.reset(store);
      WF.audio.on = S.sound;
      lastWall = Date.now();
      newBattle();
      UI.show('battle');
      save();
    },
  });

  document.getElementById('btn-speed').addEventListener('click', () => {
    WF.audio.unlock();
    S.speed = S.speed >= 3 ? 1 : S.speed + 1;
    WF.audio.play('tap');
    save();
  });

  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  window.addEventListener('pagehide', save);
  document.addEventListener('pointerdown', () => WF.audio.unlock(), { passive: true });

  resize();
  newBattle();

  // Loot from time spent away since the last visit.
  const awaySecs = (Date.now() - (S.lastSeen || Date.now())) / 1000;
  lastWall = Date.now();
  if (S.tutorial) {
    S.tutorial = false;
    save();
    UI.toast('Your heroes fight on their own. Spend gold to make them stronger!');
  } else if (awaySecs > 5) away(awaySecs);

  requestAnimationFrame((n) => { lastFrame = n; frame(n); });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  WF.debug = { get battle() { return battle; }, fmt };
})(window.WF = window.WF || {});
