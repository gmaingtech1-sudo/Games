/* ParanormalADHDhunters — your investigator: level, coins, gear, uniforms,
   story progress, achievements, daily challenges and settings. Saved in
   localStorage. */
import { RANKS, xpToNext, DAILY, ACHIEVEMENTS, UNIFORMS, EQUIPMENT, CHAPTERS } from './data.js';
import { todayKey, rng, hashString } from './util.js';
import { host } from './host.js';

const KEY = 'paranormaladhdhunters-v1';

function guessQuality() {
  const mem = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  if (mem <= 2 || (mobile && cores <= 4)) return 'low';
  return mobile ? 'med' : 'high';
}

function defaults() {
  return {
    v: 1,
    name: 'Investigator',
    uniform: 'midnight',
    level: 1, xp: 0, coins: 150,
    tiers: { flashlight: 0, emf: 0, thermo: 0, spirit: 0, camera: 0 },
    uniforms: ['midnight', 'violet'],
    diff: 'amateur',
    story: { caseIndex: 0, clues: [], notebook: [], prologue: false, chapterDone: false },
    achievements: {},
    stats: {
      investigations: 0, correct: 0, wrong: 0, evidence: 0, photos: 0, ghostPhotos: 0, spooks: 0, answers: 0,
      hides: 0, lights: 0, events: 0, team: 0, byGhost: {}, fastest: 0,
    },
    daily: { key: '', progress: {}, claimed: {}, bonus: false },
    history: [],
    tips: {},
    settings: {
      master: 0.9, sfx: 1, amb: 0.8, sens: 1, invertY: false, quality: guessQuality(),
      lefty: false, reduceFlash: false, vibrate: true, voice: true,
    },
  };
}

function merge(base, saved) {
  if (!saved || typeof saved !== 'object') return base;
  for (const k in base) {
    if (!(k in saved)) continue;
    if (base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) base[k] = merge(base[k], saved[k]);
    else base[k] = saved[k];
  }
  for (const k in saved) if (!(k in base)) base[k] = saved[k];
  return base;
}

export class Profile {
  constructor() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { saved = null; }
    // the Android app keeps its own copy, in case the WebView's storage was cleared
    if (!saved) { try { saved = JSON.parse(host.loadSave() || 'null'); } catch (e) { saved = null; } }
    this.d = merge(defaults(), saved);
    this.fresh = !saved;
    this.ensureDaily();
  }

  save() {
    host.writeSave(JSON.stringify(this.d));
    try { localStorage.setItem(KEY, JSON.stringify(this.d)); } catch (e) {
      // storage full: drop the photo thumbnails from history and try again
      this.d.history.forEach((h) => { h.photo = null; });
      try { localStorage.setItem(KEY, JSON.stringify(this.d)); } catch (e2) { /* give up quietly */ }
    }
  }

  reset() { this.d = defaults(); this.ensureDaily(); this.save(); }

  get settings() { return this.d.settings; }

  /* ---------- level and rank ---------- */

  rank(level = this.d.level) {
    let r = RANKS[0];
    for (const x of RANKS) if (level >= x.level) r = x;
    return r;
  }

  nextRank(level = this.d.level) { return RANKS.find((x) => x.level > level) || null; }

  /** Adds XP and returns how many levels were gained. */
  addXP(n) {
    let ups = 0;
    this.d.xp += Math.round(n);
    while (this.d.xp >= xpToNext(this.d.level)) {
      this.d.xp -= xpToNext(this.d.level);
      this.d.level++;
      ups++;
    }
    return ups;
  }

  addCoins(n) { this.d.coins = Math.max(0, this.d.coins + Math.round(n)); }

  uniform() { return UNIFORMS.find((u) => u.id === this.d.uniform) || UNIFORMS[0]; }

  /* ---------- gear ---------- */

  upgradeCost(id) {
    const t = this.d.tiers[id] || 0;
    const next = EQUIPMENT[id].tiers[t + 1];
    return next ? next.cost : null;
  }

  upgrade(id) {
    const cost = this.upgradeCost(id);
    if (cost == null || this.d.coins < cost) return false;
    this.d.coins -= cost;
    this.d.tiers[id] = (this.d.tiers[id] || 0) + 1;
    this.save();
    return true;
  }

  buyUniform(id) {
    const u = UNIFORMS.find((x) => x.id === id);
    if (!u || this.d.uniforms.includes(id)) return false;
    if (this.d.level < u.level || this.d.coins < u.cost) return false;
    this.d.coins -= u.cost;
    this.d.uniforms.push(id);
    this.save();
    return true;
  }

  /* ---------- story ---------- */

  chapter() { return CHAPTERS[0]; }

  nextCase() {
    const ch = this.chapter();
    return ch.cases[this.d.story.caseIndex] || null;
  }

  storyComplete() { return this.d.story.caseIndex >= this.chapter().cases.length; }

  /* ---------- achievements ---------- */

  unlock(id) {
    if (this.d.achievements[id]) return null;
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    if (!a) return null;
    this.d.achievements[id] = Date.now();
    this.addXP(a.xp);
    return a;
  }

  /* ---------- daily challenges ---------- */

  ensureDaily() {
    const key = todayKey();
    if (this.d.daily.key === key) return;
    this.d.daily = { key, progress: {}, claimed: {}, bonus: false };
  }

  dailies() {
    this.ensureDaily();
    const r = rng(hashString('pah-daily-' + this.d.daily.key));
    const pool = r.shuffle(DAILY.slice());
    return pool.slice(0, 3).map((t) => {
      const n = r.pick(t.n);
      return { ...t, n, label: t.text.replace('{n}', n), have: this.d.daily.progress[t.id] || 0, claimed: !!this.d.daily.claimed[t.id] };
    });
  }

  /** stats: {statName: amount}. Returns the challenges completed by this. */
  bumpDaily(stats) {
    const done = [];
    for (const c of this.dailies()) {
      if (c.claimed) continue;
      const add = stats[c.stat] || 0;
      if (!add) continue;
      const have = Math.min(c.n, (this.d.daily.progress[c.id] || 0) + add);
      this.d.daily.progress[c.id] = have;
      if (have >= c.n) {
        this.d.daily.claimed[c.id] = true;
        this.addCoins(c.coins);
        this.addXP(c.xp);
        done.push(c);
      }
    }
    if (!this.d.daily.bonus && this.dailies().every((c) => c.claimed)) {
      this.d.daily.bonus = true;
      done.push({ id: 'all', label: 'All three dailies!', coins: 150, xp: 100 });
      this.addCoins(150);
      this.addXP(100);
    }
    return done;
  }
}
