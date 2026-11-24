// #26: the top bar must fit (no hidden controls) at every window width down to the 1000px minimum
const { chromium } = require('playwright');
const path = require('path');
const SHOTS = process.env.SHOTS || require('os').tmpdir();
const srv = require('./serve')(8817);
(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1600, height: 900 } });
  const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto('http://localhost:8817/'); await pg.waitForTimeout(600);
  await pg.click('#empty-btn'); await pg.waitForTimeout(1200);
  let fail = 0;
  for (const w of [1920, 1600, 1500, 1400, 1300, 1250, 1200, 1100, 1000]) {
    await pg.setViewportSize({ width: w, height: 760 }); await pg.waitForTimeout(150);
    const r = await pg.evaluate(() => {
      const tb = document.querySelector('#topbar');
      const ids = ['btn-new', 'btn-open', 'btn-gen', 'btn-save', 'btn-export', 'btn-play', 'bpm', 'key', 'scale', 'timesig', 'btn-typing', 'btn-settings', 'btn-undo', 'btn-redo'];
      const hidden = ids.filter((id) => { const r = document.getElementById(id).getBoundingClientRect(); return r.width === 0 || r.right > innerWidth + 0.5; });
      return { over: tb.scrollWidth - tb.clientWidth, hidden };
    });
    const ok = r.over <= 0 && !r.hidden.length; if (!ok) fail++;
    console.log(`${ok ? '✓' : '✗'} ${w}px  overflow ${r.over}px  ${r.hidden.length ? 'hidden: ' + r.hidden.join(',') : ''}`);
    if (w === 1000 || w === 1400) await pg.screenshot({ path: path.join(SHOTS, `topbar-${w}.png`), clip: { x: 0, y: 0, width: w, height: 60 } });
  }
  console.log(fail ? fail + ' widths fail' : 'all widths fit'); console.log(errs.join('\n') || 'no errors');
  await b.close(); srv.close(); process.exit(fail ? 1 : 0);
})();
