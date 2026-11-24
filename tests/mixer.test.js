// #27: every mixer strip (fader, M/S buttons, Out menu) must stay fully visible at any bottom-panel height
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const SHOTS = process.env.SHOTS || require('os').tmpdir();
const srv = require('./serve')(8818);
(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1500, height: 1000 } });
  const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto('http://localhost:8818/'); await pg.waitForTimeout(600);
  await pg.click('#empty-btn'); await pg.waitForTimeout(1200);
  const song = fs.readFileSync(path.join(__dirname, '..', 'examples', 'Neon Riot.studio'), 'utf8');   // 20 tracks, strips with up to 6 effects
  await pg.evaluate(async (s) => { await loadProjectText(s, 'x'); Panels.show('mixer'); }, song);
  await pg.waitForTimeout(800);
  let fail = 0;
  for (const bh of [160, 200, 260, 320, 360, 480, 640]) {
    await pg.evaluate((bh) => { document.body.style.setProperty('--bottom-h', bh + 'px'); Panels.render(); }, bh);
    await pg.waitForTimeout(200);
    const r = await pg.evaluate(() => {
      const panel = document.querySelector('#panel-mixer').getBoundingClientRect();
      const bad = [];
      for (const st of document.querySelectorAll('#panel-mixer .strip:not(.add-bus)')) {
        const s = st.getBoundingClientRect();
        const name = (st.querySelector('.nm') || {}).textContent;
        if (s.bottom > panel.bottom + 1) bad.push(name + ': strip below panel');
        for (const sel of ['.fader', '.btns', '.out-sel', '.nm']) {
          const el = st.querySelector(sel); if (!el) continue;
          const e = el.getBoundingClientRect();
          if (e.height < (sel === '.fader' ? 24 : 8) || e.bottom > s.bottom + 1 || getComputedStyle(el).display === 'none') bad.push(name + ': ' + sel + ' hidden (' + Math.round(e.height) + 'px)');
        }
      }
      const tops = [...document.querySelectorAll('#panel-mixer .strip:not(.add-bus):not(.master) .fader-row')].map((f) => Math.round(f.getBoundingClientRect().top));
      return { bad, aligned: new Set(tops).size === 1, faderH: Math.round(document.querySelector('#panel-mixer .fader').getBoundingClientRect().height) };
    });
    const ok = !r.bad.length && r.aligned; if (!ok) fail++;
    console.log(`${ok ? '✓' : '✗'} panel ${bh}px  fader ${r.faderH}px  ${r.aligned ? 'aligned' : 'NOT aligned'}  ${r.bad.slice(0, 3).join('; ')}`);
    if (bh === 260 || bh === 360) await pg.screenshot({ path: path.join(SHOTS, `mixer-${bh}.png`) });
  }
  console.log(fail ? fail + ' heights fail' : 'mixer fits at all heights'); console.log(errs.join('\n') || 'no errors');
  await b.close(); srv.close(); process.exit(fail ? 1 : 0);
})();
