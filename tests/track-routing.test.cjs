const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');

test('deleting a bus clears routing and sidechain references in one undo step', { timeout: 45000 }, async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    headless: true, args: ['--no-sandbox', '--mute-audio'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.goto(process.env.STUDIO_BASE_URL || 'http://127.0.0.1:4173/');
    await page.locator('#start-btn').click();
    await page.waitForFunction(() => App.project && Engine.ctx?.state === 'running');
    const ids = await page.evaluate(() => {
      const p = blankProject();
      const bus = makeTrack('bus', p), otherBus = makeTrack('bus', p);
      const track = makeTrack('synth', p), unaffected = makeTrack('synth', p);
      track.inst = unaffected.inst = presetInst('Super Saw');
      track.out = bus.id;
      track.fx = [newFx('scomp', { src: bus.id })];
      unaffected.out = otherBus.id;
      unaffected.fx = [newFx('scomp', { src: track.id })];
      p.tracks = [bus, otherBus, track, unaffected];
      p.master.fx = [newFx('scomp', { src: bus.id })];
      App.load(p); Panels.show('mixer');
      return { bus: bus.id, otherBus: otherBus.id, track: track.id, unaffected: unaffected.id };
    });
    const state = () => page.evaluate(ids => ({
      busExists: !!App.track(ids.bus), out: App.track(ids.track).out,
      sidechain: App.track(ids.track).fx[0].p.src,
      masterSidechain: App.project.master.fx[0].p.src,
      unaffectedOut: App.track(ids.unaffected).out,
      unaffectedSidechain: App.track(ids.unaffected).fx[0].p.src,
      undoCount: App.undoStack.length,
      outputs: [...document.querySelectorAll('#panel-mixer .out-sel')].map(e => ({ value: e.value, label: e.selectedOptions[0]?.textContent })),
    }), ids);
    await page.evaluate(ids => Headers.menu(App.track(ids.bus), { clientX: 300, clientY: 300 }), ids);
    await page.locator('.ctx-menu .item').filter({ hasText: /^Delete track$/ }).click();
    const deleted = await state();
    assert.equal(deleted.busExists, false);
    assert.equal(deleted.out, null, 'routing to a deleted bus resets to Master');
    assert.equal(deleted.sidechain, '', 'deleted sidechain source is cleared');
    assert.equal(deleted.masterSidechain, '', 'master effect references are cleared too');
    assert.equal(deleted.unaffectedOut, ids.otherBus);
    assert.equal(deleted.unaffectedSidechain, ids.track);
    assert.equal(deleted.undoCount, 1, 'deletion and reference cleanup share one undo step');
    assert.deepEqual(deleted.outputs[0], { value: '', label: '→ Master' });
    await page.evaluate(() => App.undo());
    const restored = await state();
    assert.equal(restored.busExists, true);
    assert.equal(restored.out, ids.bus);
    assert.equal(restored.sidechain, ids.bus);
    assert.equal(restored.masterSidechain, ids.bus);
    assert.equal(restored.undoCount, 0);
    assert.equal(restored.outputs[0].value, ids.bus);
    await page.evaluate(() => App.redo());
    assert.deepEqual(await state(), deleted, 'redo removes the bus and clears the same references');
    // Ordinary tracks can also be sidechain keys; their deletion must clear references.
    await page.evaluate(ids => Headers.menu(App.track(ids.track), { clientX: 300, clientY: 300 }), ids);
    await page.locator('.ctx-menu .item').filter({ hasText: /^Delete track$/ }).click();
    assert.equal(await page.evaluate(ids => App.track(ids.unaffected).fx[0].p.src, ids), '');
    assert.equal(await page.evaluate(ids => App.track(ids.unaffected).out, ids), ids.otherBus);
    assert.deepEqual(pageErrors, []);
  } finally { await browser.close(); }
});
