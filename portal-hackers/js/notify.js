/* Portal Hackers: Nexus — reminders while the app is closed, in the Android
   app only (window.PHNative). Off until the player turns them on in the
   menu. When the game goes into the background it schedules at most one of
   each: energy full again, the next team event starting, and an evening
   nudge if today's daily missions aren't done. Coming back cancels them. */
window.PH = window.PH || {};
(function (PH) {
  'use strict';

  const N = window.PHNative || null;
  const SLOT = { energy: 0, event: 1, daily: 2 };
  let waiting = null;

  const call = (f, d) => { try { return f(); } catch (e) { return d; } };
  const available = () => !!N;
  const allowed = () => !!N && call(() => N.notifyAllowed(), false);
  const on = () => !!(PH.state.save && PH.state.save.settings.notify) && allowed();

  // Ask Android (13+ shows its prompt); cb(granted).
  function ask(cb) {
    if (!N) { cb(false); return; }
    waiting = cb;
    call(() => N.askNotify());
  }
  function answer(granted) {
    const cb = waiting;
    waiting = null;
    if (cb) cb(!!granted);
  }

  function plan(now) {
    const S = PH.state, D = PH.data, s = S.save;
    const out = [];
    // Energy: only worth a buzz when there's a real wait.
    const max = S.maxEnergy();
    const missing = max - s.energy;
    if (missing >= 30) {
      const ms = missing * D.ENERGY.regenMs(s.up.energy) - (now - s.energyAt);
      out.push([SLOT.energy, '🔋 Energy full', `You're back to ${max} energy. Go hack some portals!`, ms / 60e3]);
    }
    // The next team event (not one that's already on).
    const w = S.eventWindow(now);
    const start = w.live ? w.next : (now < w.start ? w.start : w.next);
    if (start - now > 5 * 60e3) out.push([SLOT.event, `🏆 ${S.eventName()} starts now`, '30 minutes to earn event points for your team: hack, capture and link portals.', (start - now) / 60e3]);
    // Daily missions, at 7 pm local time if they aren't finished.
    const dl = s.daily;
    const evening = new Date(now); evening.setHours(19, 0, 0, 0);
    if (dl && !dl.bonus && evening.getTime() - now > 10 * 60e3) {
      const left = dl.ids.filter((id) => !dl.done[id]).length;
      out.push([SLOT.daily, '🎯 Daily missions', `${left} daily mission${left === 1 ? '' : 's'} left today. Finish them for the completion bonus.`, (evening.getTime() - now) / 60e3]);
    }
    return out;
  }

  function away() {
    if (!N || !PH.state.save) return;
    call(() => N.cancelAll());
    if (!on()) return;
    for (const [slot, title, body, min] of plan(Date.now())) call(() => N.schedule(slot, title, body, min));
  }
  function back() { if (N) call(() => N.cancelAll()); }

  document.addEventListener('visibilitychange', () => (document.hidden ? away() : back()));
  window.addEventListener('pagehide', away);
  back();

  PH.notify = { available, allowed, on, ask, answer, plan };
})(window.PH);
