// Browser tests with Playwright (Chromium). Run: node tests/ui.test.cjs
// Starts a tiny static server, then plays through the core loop on a phone
// viewport and a desktop viewport.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const SHOTS = process.env.SHOTS || '';

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
      fs.createReadStream(p).pipe(res);
    });
    srv.listen(0, () => resolve(srv));
  });
}

let passed = 0, failed = 0, currentPage = null;
async function step(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) {
    failed++;
    console.log(`  ✗ ${name}\n    ${String(e.message).split('\n')[0]}`);
    if (currentPage) console.log('    click state:', JSON.stringify(await currentPage.evaluate(() => window.__nickoClickState && window.__nickoClickState()).catch(() => null)));
    if (SHOTS && currentPage) await currentPage.screenshot({ path: path.join(SHOTS, `fail-${failed}.png`) }).catch(() => {});
  }
}
function assert(c, msg) { if (!c) throw new Error(msg || 'assertion failed'); }

async function shot(page, name) { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png') }); }

async function closeModals(page) {
  for (let i = 0; i < 4; i++) {
    const btn = page.locator('#modal-root .backdrop .actions-row .btn:not([disabled])').first();
    if (!(await btn.count())) return;
    await btn.click();
    await page.waitForTimeout(150);
  }
}

async function noHorizontalScroll(page, label) {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  assert(sw <= iw + 1, `${label}: page is ${sw}px wide in a ${iw}px viewport`);
}

async function fightToEnd(page) {
  // Attack until the result modal or game over appears.
  for (let i = 0; i < 120; i++) {
    if (await page.locator('#screen-gameover.active').count()) return 'defeat';
    const modalBtn = page.locator('#modal-root .result');
    if (await modalBtn.count()) {
      const victory = await page.locator('#modal-root .result.victory').count();
      await page.locator('#modal-root .actions-row .btn').click();
      await page.waitForTimeout(250);
      return victory ? 'victory' : 'other';
    }
    const atk = page.locator('#screen-combat [data-action=attack]:not([disabled])');
    if (await atk.count()) await atk.click();
    await page.waitForTimeout(120);
  }
  throw new Error('fight did not finish');
}

(async () => {
  const srv = await serve();
  const base = `http://localhost:${srv.address().port}/index.html`;
  const browser = await chromium.launch();
  const errors = [];

  console.log('\nPhone (360x780)');
  const ctx = await browser.newContext({ viewport: { width: 360, height: 780 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  currentPage = page;
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(base);
  await page.waitForSelector('#screen-menu.active');

  await step('main menu shows New Game, Continue (disabled without a save), Settings, Credits', async () => {
    for (const t of ['New Game', 'Continue', 'Settings', 'Credits']) assert(await page.getByRole('button', { name: t }).count(), `missing ${t}`);
    assert(await page.getByRole('button', { name: 'Continue' }).isDisabled(), 'Continue should be disabled');
    await noHorizontalScroll(page, 'menu');
    await shot(page, 'phone-menu');
  });

  await step('credits dialog opens and closes', async () => {
    await page.getByRole('button', { name: 'Credits' }).click();
    await page.waitForSelector('.modal');
    await closeModals(page);
  });

  await step('new game: pick slot, create a named Warrior, see summary', async () => {
    await page.getByRole('button', { name: 'New Game' }).click();
    await page.click('[data-action=pick][data-slot="1"]');
    await page.waitForSelector('#screen-create.active');
    await page.fill('#hero-name', 'Nicko');
    await page.click('[data-action=class][data-id=rogue]');
    assert((await page.textContent('#screen-create')).includes('Shadowstep'), 'rogue abilities shown');
    await page.click('[data-action=class][data-id=warrior]');
    const txt = await page.textContent('#screen-create');
    assert(txt.includes('Heavy Strike') && txt.includes('Shield Block'), 'warrior summary lists starting abilities');
    assert(await page.inputValue('#hero-name') === 'Nicko', 'name kept when switching class');
    await noHorizontalScroll(page, 'create');
    await shot(page, 'phone-create');
    await page.click('[data-action=begin]');
    await page.waitForSelector('#screen-game.active');
    await closeModals(page);
    assert((await page.textContent('#hud')).includes('Nicko'), 'HUD shows hero');
  });

  await step('town and world map render; locked locations explain why', async () => {
    const t = await page.textContent('#game-body');
    assert(t.includes('Whispering Woods') && t.includes('Reach level 3'), 'map with lock reason');
    await noHorizontalScroll(page, 'town');
    await shot(page, 'phone-town');
  });

  await step('explore Whispering Woods until a fight starts', async () => {
    await page.click('[data-action=loc][data-id=whisperingWoods]');
    await page.waitForSelector('#explore-btn');
    for (let i = 0; i < 40; i++) {
      if (await page.locator('#screen-combat.active').count()) return;
      await page.click('#explore-btn');
      await page.waitForTimeout(380);
    }
    assert(await page.locator('#screen-combat.active').count(), 'no fight after 40 explores');
  });

  await step('combat shows bars, log, abilities and blocks rapid repeat actions', async () => {
    await page.waitForSelector('#screen-combat.active .ability-btn');
    await noHorizontalScroll(page, 'combat');
    await shot(page, 'phone-combat');
    const atk = page.locator('#screen-combat [data-action=attack]');
    // Three rapid taps: only one player action may resolve.
    await atk.evaluate((b) => { b.click(); b.click(); b.click(); });
    await page.waitForTimeout(100);
    assert(await atk.isDisabled(), 'attack disabled during resolution');
    await page.waitForFunction(() => !document.querySelector('#screen-combat [data-action=attack]')?.disabled || document.querySelector('#modal-root .result') || document.querySelector('#screen-gameover.active'), null, { timeout: 8000 });
    const attacks = await page.locator('#log p', { hasText: 'Nicko attacks!' }).count();
    assert(attacks === 1, `expected 1 attack, got ${attacks}`);
  });

  await step('ability use spends mana', async () => {
    if (!(await page.locator('#screen-combat.active').count()) || await page.locator('#modal-root .result').count()) return;
    const before = await page.locator('#p-mp .label').textContent();
    const hs = page.locator('[data-action=ability][data-id=heavyStrike]:not([disabled])');
    if (await hs.count()) {
      await hs.click();
      await page.waitForTimeout(2500);
      const after = await page.locator('#p-mp .label').textContent();
      assert(before !== after || await page.locator('#modal-root .result').count(), 'mana changed');
    }
  });

  await step('fight resolves to a victory or defeat screen and returns', async () => {
    const r = await fightToEnd(page);
    if (r === 'defeat') {
      await shot(page, 'phone-gameover');
      await page.getByRole('button', { name: 'Revive in Town' }).click();
    }
    await page.waitForSelector('#screen-game.active');
  });

  // Give the hero resources directly through the save, then reload it, to test later systems quickly.
  await step('save/load: autosave exists and Continue resumes', async () => {
    // Leave to the main menu first (it saves and unloads the hero), then edit the save.
    await page.click('[data-action=more]');
    await page.click('[data-more=menu]');
    await page.getByRole('button', { name: 'Main menu' }).click();
    await page.waitForSelector('#screen-menu.active');
    await page.evaluate(() => {
      const env = JSON.parse(localStorage.getItem('nickoRpg.save.1'));
      env.state.player.level = 5;
      env.state.player.gold = 5000;
      env.state.player.xp = 0;
      env.state.inventory.push({ uid: 'test-ring', id: 'copperRing', qty: 1, plus: 0 }, { uid: 'test-pelts', id: 'wolfPelt', qty: 3, plus: 0 });
      localStorage.setItem('nickoRpg.save.1', JSON.stringify(env));
    });
    await page.reload();
    await page.waitForSelector('#screen-menu.active');
    assert(!(await page.getByRole('button', { name: 'Continue' }).isDisabled()), 'Continue enabled');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.waitForSelector('#screen-game.active');
    assert((await page.textContent('#hud')).includes('Lv 5'), 'loaded level 5 hero');
  });

  await step('inventory: filter, inspect, equip and unequip a ring', async () => {
    await page.click('[data-action=nav][data-tab=bag]');
    await page.click('[data-action=filter][data-f=ring]');
    await page.click('.inv-slot[data-uid=test-ring]');
    assert((await page.textContent('#item-detail')).includes('Copper Ring'), 'details shown');
    const critBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('nickoRpg.save.1')).state.player.equipment.ring);
    assert(critBefore === null, 'ring slot empty');
    await page.click('#item-detail [data-action=equip]');
    await page.waitForTimeout(200);
    await page.click('[data-action=more]');
    await page.click('[data-more=gear]');
    await page.waitForTimeout(200);
    assert((await page.textContent('#game-body')).includes('Copper Ring'), 'ring shown as equipped');
    await page.click('[data-action=slot][data-slot=ring]');
    await page.getByRole('button', { name: 'Unequip' }).click();
    await page.waitForTimeout(200);
    assert(!(await page.textContent('.paperdoll')).includes('Copper Ring'), 'ring unequipped');
    await noHorizontalScroll(page, 'gear');
  });

  await step('shop: rapid taps buy exactly one potion and gold updates', async () => {
    await page.click('[data-action=more]');
    await page.click('[data-more=shop]');
    await page.waitForSelector('[data-action=buy][data-id=smallHealthPotion]');
    const gold = async () => page.evaluate(() => Number(document.querySelector('.hud-right .gold').textContent.replace(/[^\d]/g, '')));
    const g0 = await gold();
    await page.evaluate(() => {
      for (let i = 0; i < 4; i++) document.querySelector('[data-action=buy][data-id=smallHealthPotion]:not([data-qty])').click();
    });
    await page.waitForTimeout(300);
    const g1 = await gold();
    const price = g0 - g1;
    assert(price > 0 && price < 60, `one potion bought (spent ${price})`);
    await page.waitForTimeout(500);
    await page.click('[data-action=buy][data-id=smallHealthPotion]:not([data-qty])');
    await page.waitForTimeout(200);
    assert(g1 - (await gold()) === price, 'second deliberate purchase works');
    await noHorizontalScroll(page, 'shop');
    await shot(page, 'phone-shop');
  });

  await step('shop: quest-reserved pelts are protected, blacksmith upgrades', async () => {
    await page.click('[data-action=tab][data-t=smith]');
    await page.click('[data-action=upgrade][data-slot=weapon]');
    await page.waitForTimeout(200);
    assert((await page.textContent('#game-body')).includes('Rusty Sword +1'), 'weapon upgraded');
    await page.click('[data-action=tab][data-t=sell]');
    const t = await page.textContent('#game-body');
    assert(t.includes('An active quest needs these'), 'pelts reserved by quest');
  });

  await step('skill tree: points, learning, locked reasons', async () => {
    await page.waitForTimeout(400);
    await page.click('[data-action=nav][data-tab=skills]');
    const t = await page.textContent('#game-body');
    assert(t.includes('Offensive') && t.includes('Defensive') && t.includes('Berserker'), 'three branches');
    assert(t.includes('Requires level 10'), 'lock reasons shown');
    await page.click('[data-action=node][data-id=w_off1]');
    await page.getByRole('button', { name: 'Learn' }).click();
    await page.waitForTimeout(200);
    await page.click('[data-action=node][data-id=w_off5]');
    assert(await page.getByRole('button', { name: 'Learn' }).isDisabled(), 'ultimate locked');
    await closeModals(page);
    await noHorizontalScroll(page, 'skills');
    await shot(page, 'phone-skills');
  });

  await step('quest journal lists quests with progress', async () => {
    await page.click('[data-action=nav][data-tab=quests]');
    const t = await page.textContent('#game-body');
    assert(t.includes('A Hero Awakens') || t.includes('Goblin Trouble'), 'main quest shown');
    assert(t.includes('Reward'), 'rewards shown');
    await page.click('[data-action=tab][data-t=daily]');
    assert((await page.textContent('#game-body')).includes('Daily Hunt'), 'daily quests');
  });

  await step('boss arena: Goblin King intro and boss fight UI', async () => {
    await page.click('[data-action=more]');
    await page.click('[data-more=bosses]');
    await page.click('[data-action=fight][data-id=goblinKing]');
    await page.waitForSelector('.boss-intro');
    await shot(page, 'phone-boss-intro');
    await page.getByRole('button', { name: 'Fight!' }).click();
    await page.waitForSelector('#screen-combat.active .bar.boss');
    assert(await page.locator('[data-action=flee][disabled]').count(), 'flee disabled for bosses');
    await shot(page, 'phone-boss');
    // Weaken the boss through the live combat object is not exposed; just play a few turns.
    for (let i = 0; i < 3; i++) {
      await page.locator('[data-action=defend]:not([disabled])').click();
      await page.waitForTimeout(1600);
    }
  });

  await step('defeat leads to the Game Over screen, and revive works', async () => {
    let r;
    for (let i = 0; i < 4 && r !== 'defeat'; i++) {
      // Keep defending/attacking until the fight ends either way.
      r = await fightToEnd(page);
      if (r !== 'defeat') break;
    }
    if (r === 'defeat') {
      assert((await page.textContent('#screen-gameover')).includes('You Have Fallen'));
      await page.getByRole('button', { name: 'Revive in Town' }).click();
    }
    await page.waitForSelector('#screen-game.active', { timeout: 5000 });
  });

  await step('manual save, delete with confirmation, corrupted slot handled', async () => {
    await page.evaluate(() => localStorage.setItem('nickoRpg.save.2', '{"broken": tru'));
    await page.click('[data-action=more]');
    await page.click('[data-more=saves]');
    await page.waitForSelector('#screen-saves.active');
    assert((await page.textContent('#screen-saves')).includes('Damaged save'), 'corrupt slot shown');
    await page.click('[data-action=save][data-slot="1"] >> nth=0');
    await page.click('[data-action=del][data-slot="2"]');
    await page.locator('#modal-root').getByRole('button', { name: 'Cancel' }).click();
    assert(await page.evaluate(() => !!localStorage.getItem('nickoRpg.save.2')), 'cancel keeps the save');
    await page.click('[data-action=del][data-slot="2"]');
    await page.locator('#modal-root .actions-row').getByRole('button', { name: 'Delete' }).click();
    await page.waitForTimeout(200);
    assert(await page.evaluate(() => !localStorage.getItem('nickoRpg.save.2')), 'deleted after confirming');
    await page.click('#screen-saves [data-action=back]');
  });

  await step('settings persist (mute, reduced motion, developer tools)', async () => {
    await page.click('[data-action=more]');
    await page.click('[data-more=settings]');
    await page.waitForSelector('#screen-settings.active');
    await page.check('#set-muted', { force: true });
    await page.check('#set-reducedMotion', { force: true });
    await page.check('#set-devTools', { force: true });
    const s = await page.evaluate(() => JSON.parse(localStorage.getItem('nickoRpg.settings')));
    assert(s.muted && s.reducedMotion && s.devTools, 'settings saved');
    assert(await page.evaluate(() => document.body.classList.contains('reduced-motion')), 'reduced motion applied');
    await page.click('#screen-settings [data-action=back]');
  });

  await step('enemy creator: validation, save, duplicate, test fight without rewards', async () => {
    await page.click('[data-action=more]');
    await page.click('[data-more=creator]');
    await page.waitForSelector('#screen-creator.active #ce-name');
    await page.fill('#ce-name', '');
    await page.click('[data-action=save]');
    await page.waitForTimeout(200);
    assert(await page.locator('.field.invalid').count(), 'invalid field highlighted');
    await page.fill('#ce-name', 'Mud Golem');
    await page.fill('#ce-hp', '30');
    await page.selectOption('#ce-shape', 'golem');
    await page.waitForTimeout(400); // the duplicate-click guard ignores a repeat of the same action within 350ms
    await page.click('[data-action=save]');
    await page.waitForTimeout(200);
    assert((await page.textContent('#screen-creator')).includes('Saved enemies (1)'), 'saved');
    await page.waitForTimeout(400);
    await page.click('[data-action=dup]');
    await page.waitForTimeout(200);
    assert((await page.textContent('#screen-creator')).includes('Saved enemies (2)'), 'duplicated');
    await noHorizontalScroll(page, 'creator');
    await shot(page, 'phone-creator');
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem('nickoRpg.save.1')).state.player.gold);
    await page.click('[data-action=testsaved] >> nth=0');
    await page.waitForSelector('#screen-combat.active');
    assert((await page.textContent('#log')).includes('Test fight'), 'test banner');
    await fightToEnd(page);
    await page.waitForSelector('#screen-creator.active');
    const after = await page.evaluate(() => JSON.parse(localStorage.getItem('nickoRpg.save.1')).state.player.gold);
    assert(before === after, 'test fight gave no gold');
  });

  await step('no uncaught errors on the phone run', async () => {
    assert(errors.length === 0, errors.join(' | '));
  });

  console.log('\nDesktop (1366x800)');
  const dctx = await browser.newContext({ viewport: { width: 1366, height: 800 } });
  const dp = await dctx.newPage();
  currentPage = dp;
  const derr = [];
  dp.on('pageerror', (e) => derr.push(e.message));
  await dp.goto(base);
  await dp.waitForSelector('#screen-menu.active');
  await step('desktop: new mage, sidebar navigation, keyboard combat', async () => {
    await dp.getByRole('button', { name: 'New Game' }).click();
    await dp.click('[data-action=pick][data-slot="3"]');
    await dp.click('[data-action=class][data-id=mage]');
    await dp.click('[data-action=begin]');
    await dp.waitForSelector('#screen-game.active');
    await closeModals(dp);
    assert(await dp.locator('.nav-btn[data-tab=shop]').isVisible(), 'sidebar shows Shop on desktop');
    await shot(dp, 'desktop-town');
    await dp.click('[data-action=loc][data-id=whisperingWoods]');
    for (let i = 0; i < 40 && !(await dp.locator('#screen-combat.active').count()); i++) { await dp.keyboard.press('e'); await dp.waitForTimeout(380); }
    await dp.waitForSelector('#screen-combat.active');
    await dp.waitForTimeout(200);
    await dp.keyboard.press('1');
    await dp.waitForTimeout(1500);
    assert((await dp.textContent('#log')).includes('Firebolt'), 'keyboard 1 cast Firebolt');
    await shot(dp, 'desktop-combat');
    await fightToEnd(dp);
  });
  await step('desktop: inventory, skills and quests screens render', async () => {
    if (await dp.locator('#screen-gameover.active').count()) await dp.getByRole('button', { name: 'Revive in Town' }).click();
    for (const tab of ['bag', 'skills', 'quests', 'hero', 'bosses']) {
      await dp.click(`.nav-btn[data-tab=${tab}]`);
      await dp.waitForTimeout(100);
      await noHorizontalScroll(dp, tab);
    }
    await shot(dp, 'desktop-bosses');
    await dp.click('.nav-btn[data-tab=skills]');
    await shot(dp, 'desktop-skills');
  });
  await step('Android back-button hook steps back through screens', async () => {
    await dp.click('.nav-btn[data-tab=bag]');
    assert(await dp.evaluate(() => window.nickoBack()) === true, 'back from bag handled');
    assert(await dp.evaluate(() => document.querySelector('.nav-btn.active').dataset.tab) === 'town', 'returned to town');
    assert(await dp.evaluate(() => window.nickoBack()) === false, 'town lets the app go to background');
    await dp.click('.nav-btn[data-tab=settings]');
    await dp.waitForSelector('#screen-settings.active');
    assert(await dp.evaluate(() => window.nickoBack()) === true);
    await dp.waitForSelector('#screen-game.active');
    await dp.evaluate(() => window.nickoPause());
    assert(await dp.evaluate(() => !!localStorage.getItem('nickoRpg.save.3')), 'pause autosaves');
  });
  await step('no uncaught errors on the desktop run', async () => { assert(derr.length === 0, derr.join(' | ')); });

  await browser.close();
  srv.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
