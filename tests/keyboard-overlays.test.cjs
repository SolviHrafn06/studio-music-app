const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { chromium } = require('playwright-core');

// Run against Studio's resources server, e.g. STUDIO_BASE_URL=http://127.0.0.1:4173/.
test('dialogs, menus and busy overlays own keyboard input', { timeout: 45000 }, async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    headless: true, args: ['--no-sandbox', '--mute-audio'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto(process.env.STUDIO_BASE_URL || 'http://127.0.0.1:4173/');
    await page.locator('#start-btn').click();
    await page.waitForFunction(() => App.project && Engine.ctx?.state === 'running');
    await page.evaluate(() => {
      const clip = App.project.tracks[0].clips[0];
      App.selClips = new Set([clip.id]); App.selClipId = clip.id;
      App.seek(5);
    });
    const state = async () => {
      const current = await page.evaluate(() => ({ project: JSON.stringify(App.project),
        selection: [...App.selClips], playing: Engine.playing, playhead: App.playhead, tab: App.tab }));
      current.project = createHash('sha256').update(current.project).digest('hex');
      return current;
    };
    const before = await state();
    const backgroundKeys = async () => {
      for (const key of ['Delete', 'Backspace', 'Space', 'Home', 'Control+z', 'Control+d', 'F9', 'a']) {
        await page.keyboard.press(key);
        assert.deepEqual(await state(), before, `${key} must leave the background song unchanged`);
      }
    };

    await page.locator('#btn-gen').click();
    await backgroundKeys();
    assert.deepEqual(await state(), before, 'modal keys must not modify the song, selection or transport');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.modal-ov').count(), 0);
    assert.deepEqual(await state(), before, 'Escape cancels the dialog without clearing timeline selection');

    await page.evaluate(() => {
      Generator.open();
      window.cancelled = null;
      confirmReplace().then(result => { window.cancelled = result; });
    });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.cancelled === false);
    assert.equal(await page.locator('.modal-ov').count(), 1, 'only the top dialog closes');
    await page.keyboard.press('Escape');

    await page.evaluate(() => { window.generated = 0; Generator.run = () => { window.generated++; }; Generator.open(); });
    await page.locator('.modal-ov select').first().focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => window.generated), 0, 'Enter in a select keeps its native behavior');
    assert.equal(await page.locator('.modal-ov').count(), 1);
    await page.locator('.modal-head button').click();
    await page.evaluate(() => Generator.open());
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.generated === 1);
    assert.equal(await page.locator('.modal-ov').count(), 0, 'Enter activates the dialog primary action');
    assert.deepEqual(await state(), before);

    await page.evaluate(() => Generator.open());
    await page.getByRole('button', { name: 'Cancel', exact: true }).focus();
    await page.keyboard.press('Space');
    assert.equal(await page.locator('.modal-ov').count(), 0, 'Space activates the focused dialog button');
    assert.deepEqual(await state(), before);

    await page.evaluate(() => Menu.show(300, 300, [{ label: 'Test', action: () => {} }]));
    await backgroundKeys();
    assert.deepEqual(await state(), before, 'context menu keys must not affect the song');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.ctx-menu').count(), 0);
    assert.deepEqual(await state(), before);

    await page.evaluate(() => { window.busy = Busy.show('Testing'); });
    await page.locator('#btn-play').focus();
    await backgroundKeys();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Enter');
    assert.deepEqual(await state(), before, 'busy keys must not affect the song');
    assert.equal(await page.locator('#busy.on').count(), 1, 'busy work cannot be dismissed with Escape');
    await page.evaluate(() => window.busy.hide());

    await page.evaluate(() => {
      App.selectTrack(App.project.tracks.find(t => t.type === 'synth').id, false);
    });
    await page.keyboard.down('a');
    assert.equal(await page.evaluate(() => App.held.has('ka')), true);
    await page.evaluate(() => Generator.open());
    await page.keyboard.up('a');
    assert.equal(await page.evaluate(() => App.held.has('ka')), false, 'preexisting notes still release under overlays');
    await page.keyboard.press('Escape');

    await page.keyboard.press('Space');
    await page.waitForFunction(() => Engine.playing);
    await page.keyboard.press('Space');
    await page.waitForFunction(() => !Engine.playing);
    await page.keyboard.press('Delete');
    assert.equal(await page.evaluate(id => App.findClip(id), before.selection[0]), null, 'normal timeline Delete still works');
  } finally { await browser.close(); }
});
