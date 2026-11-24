// #32: track names / instruments have full-text tooltips; the track list can be dragged wider and remembers it
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const SHOTS = process.env.SHOTS || require('os').tmpdir();
const srv = require('./serve')(8819);
(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1500, height: 900 } });
  const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto('http://localhost:8819/'); await pg.waitForTimeout(600);
  await pg.click('#empty-btn'); await pg.waitForTimeout(1200);
  const song = fs.readFileSync(path.join(__dirname, '..', 'examples', 'Neon Riot.studio'), 'utf8');
  await pg.evaluate(async (s) => { await loadProjectText(s, 'x'); }, song);
  await pg.waitForTimeout(600);
  const checks = [];
  const ok = (name, cond, info = '') => { checks.push(cond); console.log(`${cond ? '✓' : '✗'} ${name} ${info}`); };
  const tips = await pg.evaluate(() => [...document.querySelectorAll('.track-header')].map((hd) => ({ name: hd.querySelector('input.name').title, inst: (hd.querySelector('select.inst-sel') || {}).title })));
  const ht = tips.find((t) => /Halftime Drums/.test(t.name));
  ok('name tooltip has the full name', !!ht, ht && ht.name);
  ok('kit tooltip', ht && /Drum kit: Trap/.test(ht.inst), ht && ht.inst);
  const bw = tips.find((t) => /^BWAHH \(/.test(t.name));
  ok('instrument tooltip', bw && /Instrument: Bwahh Bass/.test(bw.inst), bw && bw.inst);
  // drag the divider 120px to the right
  const handle = await pg.$('.head-resize'); const box = await handle.boundingBox();
  const laneX0 = await pg.evaluate(() => document.querySelector('#lanes').getBoundingClientRect().left);
  await pg.mouse.move(box.x + 3, box.y + 100); await pg.mouse.down(); await pg.mouse.move(box.x + 123, box.y + 100, { steps: 6 }); await pg.mouse.up();
  await pg.waitForTimeout(200);
  const after = await pg.evaluate(() => ({ w: Math.round(document.querySelector('#headers').getBoundingClientRect().width), lane: document.querySelector('#lanes').getBoundingClientRect().left, saved: localStorage.getItem('studio-head-w'), clipped: [...document.querySelectorAll('.track-header input.name')].filter((i) => i.scrollWidth > i.clientWidth + 1).map((i) => i.value) }));
  ok('track list got wider', after.w >= 345 && after.w <= 355, after.w + 'px');
  ok('timeline moved with it', Math.abs(after.lane - laneX0 - 120) < 3);
  ok('width remembered', after.saved === String(after.w), 'saved=' + after.saved);
  ok('no names clipped when wide', !after.clipped.length, after.clipped.join(','));
  await pg.screenshot({ path: path.join(SHOTS, 'headers-wide.png'), clip: { x: 0, y: 0, width: 900, height: 500 } });
  // clamps and reload keeps the width
  await pg.evaluate(() => Headers.setWidth(9999));
  ok('max width clamped', await pg.evaluate(() => Math.round(document.querySelector('#headers').getBoundingClientRect().width)) === 420);
  await pg.evaluate(() => localStorage.setItem('studio-head-w', '300'));
  await pg.reload(); await pg.waitForTimeout(600); await pg.click('#empty-btn'); await pg.waitForTimeout(800);
  ok('width restored after restart', await pg.evaluate(() => Math.round(document.querySelector('#headers').getBoundingClientRect().width)) === 300);
  // double-click resets
  await pg.dblclick('.head-resize');
  ok('double-click resets to 230px', await pg.evaluate(() => Math.round(document.querySelector('#headers').getBoundingClientRect().width)) === 230);
  const fail = checks.filter((c) => !c).length;
  console.log(fail ? fail + ' checks failed' : 'all header checks passed'); console.log(errs.join('\n') || 'no errors');
  await b.close(); srv.close(); process.exit(fail ? 1 : 0);
})();
