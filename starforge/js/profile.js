/* Starforge — the pilot's profile: credits, owned parts, the ship, upgrades,
   records and settings. Saved by SF.host (localStorage, or the Android app). */
(function (SF) {
  'use strict';

  const P = SF.parts;
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function defaults() {
    return {
      v: 1,
      credits: 250,
      owned: { hull: ['sparrow'], wings: ['swept'], engine: ['ion'], weapon: ['pulse'], special: ['nova'], finish: ['matte'] },
      ship: {
        name: 'NOVA-7',
        hull: 'sparrow', wings: 'swept', engine: 'ion', weapon: 'pulse', special: 'nova',
        body: 'snow', accent: 'ocean', energy: 'cyan', decal: 'stripe', finish: 'matte',
      },
      upgrades: { armor: 0, shield: 0, damage: 0, thrust: 0, charge: 0, magnet: 0 },
      best: { score: 0, sector: 0 },
      totals: { runs: 0, kills: 0, bosses: 0, earned: 0 },
      settings: { sound: true, music: true, vibe: true, shake: !reducedMotion, sens: 1.3 },
      tipSeen: false,
    };
  }

  // Take whatever was saved and keep only what still makes sense.
  function sanitize(raw) {
    const d = defaults();
    if (!raw || typeof raw !== 'object') return d;
    const num = (v, fb) => (typeof v === 'number' && isFinite(v) ? v : fb);
    d.credits = Math.max(0, Math.floor(num(raw.credits, d.credits)));
    if (raw.owned) {
      for (const slot of P.PRICED) {
        const list = Array.isArray(raw.owned[slot]) ? raw.owned[slot] : [];
        for (const id of list) if (P.has(slot, id) && !d.owned[slot].includes(id)) d.owned[slot].push(id);
      }
    }
    if (raw.ship) {
      for (const slot of Object.keys(P.SLOTS)) {
        const id = raw.ship[slot];
        if (!P.has(slot, id)) continue;
        if (P.priced(slot) && !d.owned[slot].includes(id)) continue;
        d.ship[slot] = id;
      }
      if (typeof raw.ship.name === 'string' && raw.ship.name.trim()) d.ship.name = raw.ship.name.trim().slice(0, 14);
    }
    if (raw.upgrades) {
      for (const k of Object.keys(d.upgrades)) d.upgrades[k] = Math.max(0, Math.min(P.UPGRADE_MAX, Math.floor(num(raw.upgrades[k], 0))));
    }
    if (raw.best) {
      d.best.score = Math.max(0, num(raw.best.score, 0));
      d.best.sector = Math.max(0, num(raw.best.sector, 0));
    }
    if (raw.totals) for (const k of Object.keys(d.totals)) d.totals[k] = Math.max(0, num(raw.totals[k], 0));
    if (raw.settings) {
      for (const k of ['sound', 'music', 'vibe', 'shake']) if (typeof raw.settings[k] === 'boolean') d.settings[k] = raw.settings[k];
      d.settings.sens = Math.max(0.8, Math.min(2.2, num(raw.settings.sens, d.settings.sens)));
    }
    d.tipSeen = !!raw.tipSeen;
    return d;
  }

  const profile = {
    data: sanitize(SF.host.loadSave()),

    save() { SF.host.writeSave(this.data); },

    reset() {
      const settings = this.data.settings;
      this.data = defaults();
      this.data.settings = settings;
      this.save();
    },

    owns(slot, id) {
      return !P.priced(slot) || this.data.owned[slot].includes(id);
    },

    // Put an item on the ship. Returns false if it has to be bought first.
    equip(slot, id) {
      if (!P.has(slot, id) || !this.owns(slot, id)) return false;
      this.data.ship[slot] = id;
      this.save();
      return true;
    },

    // Buy and equip. Returns 'ok', 'owned' or 'poor'.
    buy(slot, id) {
      if (this.owns(slot, id)) {
        this.equip(slot, id);
        return 'owned';
      }
      const item = P.get(slot, id);
      if (this.data.credits < item.price) return 'poor';
      this.data.credits -= item.price;
      this.data.owned[slot].push(id);
      this.data.ship[slot] = id;
      this.save();
      return 'ok';
    },

    upgradeCost(id) {
      const lv = this.data.upgrades[id] || 0;
      return lv >= P.UPGRADE_MAX ? null : P.UPGRADE_COST[lv];
    },

    // Returns 'ok', 'max' or 'poor'.
    upgrade(id) {
      const cost = this.upgradeCost(id);
      if (cost === null) return 'max';
      if (this.data.credits < cost) return 'poor';
      this.data.credits -= cost;
      this.data.upgrades[id] += 1;
      this.save();
      return 'ok';
    },

    rename(name) {
      const n = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 14);
      if (n) this.data.ship.name = n;
      this.save();
    },

    // Called at the end of every run.
    record(run) {
      const d = this.data;
      d.credits += run.credits;
      d.totals.runs += 1;
      d.totals.kills += run.kills;
      d.totals.bosses += run.bosses;
      d.totals.earned += run.credits;
      const best = { score: run.score > d.best.score, sector: run.sector > d.best.sector };
      if (best.score) d.best.score = run.score;
      if (best.sector) d.best.sector = run.sector;
      this.save();
      return best;
    },

    stats() { return P.stats(this.data.ship, this.data.upgrades); },
  };

  SF.profile = profile;
})(window.SF = window.SF || {});
