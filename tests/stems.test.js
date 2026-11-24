// #30: stems come from one full-song render (sidechain + buses like the mix), add up to the mix, can be cancelled
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const srv = require('./serve')(8820);
(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ acceptDownloads: true });
  const errs = []; pg.on('pageerror', (e) => errs.push(e.message + ' ' + (e.stack || '').split('\n')[1]));
  const downloads = []; pg.on('download', (d) => downloads.push(d.suggestedFilename()));
  await pg.goto('http://localhost:8820/'); await pg.waitForTimeout(600);
  await pg.click('#empty-btn'); await pg.waitForTimeout(1000);
  const song = fs.readFileSync(path.join(__dirname, '..', 'examples', 'Neon Riot.studio'), 'utf8');
  const r = await pg.evaluate(async (s) => {
    await loadProjectText(s, 'x');
    // 8 bars of the first drop (beats 64-96)
    const P = clone(App.project);
    P.tracks.forEach((t) => { t.clips = t.clips.filter((c) => c.start >= 64 && c.start < 96).map((c) => ({ ...c, start: c.start - 64 })); t.auto = []; });
    App.load(P); await Engine.ensureInstruments(App.project);
    const rms = (b) => { let e = 0, n = 0; for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) e += d[i] * d[i]; n += d.length; } return 10 * Math.log10(e / n + 1e-12); };
    const out = {};
    const list = Engine.stemList(App.project);
    out.list = list.map((x) => x.name);
    let t0 = performance.now();
    const stems = await Engine.renderStems(App.project, { onProgress: () => {} });
    out.onePassSec = (performance.now() - t0) / 1000;
    const by = Object.fromEntries(stems.map((x) => [x.name, x]));
    // old way: one 'only' render per track (no sidechain key, no bus)
    t0 = performance.now();
    const oldSub = await Engine.render(App.project, { only: App.project.tracks.find((t) => t.name === 'Sub').id, noMaster: true });
    out.oldOneTrackSec = (performance.now() - t0) / 1000;
    out.subNew = rms(by['Sub'].buffer); out.subOld = rms(oldSub);
    out.busStem = by['Bass Bus (bus)'] ? rms(by['Bass Bus (bus)'].buffer) : null;
    out.fxret = by['FX returns (reverb + delay)'] ? rms(by['FX returns (reverb + delay)'].buffer) : null;
    // stems that make up the mix (tracks not routed to a bus + bus stems + FX returns) must add up to what reaches
    // the master in the same render (separate renders differ: noise and unison phases are random)
    const P2 = App.project;
    const parts = list.filter((x) => x.id === '__fxret' || P2.tracks.find((t) => t.id === x.id && (t.type === 'bus' || !t.out)));
    const bufs = await Engine.render(P2, { stems: parts.concat([{ id: '__mixin' }]), noMaster: true });
    const mixIn = bufs[bufs.length - 1].getChannelData(0), L = mixIn.length;
    const sum = new Float32Array(L);
    for (let k = 0; k < parts.length; k++) { const d = bufs[k].getChannelData(0); for (let i = 0; i < L; i++) sum[i] += d[i]; }
    let err = 0, ref = 0;
    for (let i = 0; i < L; i++) { err += (sum[i] - mixIn[i]) ** 2; ref += mixIn[i] ** 2; }
    out.sumErrDb = 10 * Math.log10(err / ref + 1e-15);
    // cancel after the first progress tick
    let ticks = 0; t0 = performance.now();
    try { await Engine.renderStems(App.project, { perPass: 3, onProgress: () => ticks++, isCancelled: () => ticks > 0 }); out.cancel = 'not cancelled'; }
    catch (e) { out.cancel = e.cancelled ? 'cancelled' : e.message; }
    out.cancelSec = (performance.now() - t0) / 1000;
    return out;
  }, song);
  // real export flow; count saves (the desktop app writes straight to a folder, a browser would show download prompts)
  const saved = await pg.evaluate(async () => {
    const names = []; const orig = window.saveBytes;
    window.saveBytes = async (name) => { names.push(name); return name; };
    let shown = false; const obs = new MutationObserver(() => { if (document.querySelector('#busy.on .busy-cancel:not([style*="none"])')) shown = true; });
    obs.observe(document.body, { subtree: true, attributes: true, childList: true });
    await exportSong('stems');
    obs.disconnect(); window.saveBytes = orig;
    return { names, shown, toast: document.querySelector('#toast').textContent };
  });
  downloads.push(...saved.names);
  const ok = (n, c, i = '') => console.log((c ? '✓ ' : '✗ ') + n + (i ? '  (' + i + ')' : ''));
  console.log('stems:', r.list.join(', '));
  ok('bus and FX-return stems are listed', r.list.includes('Bass Bus (bus)') && r.list.includes('FX returns (reverb + delay)'));
  ok('sidechain pumping is in the Sub stem', r.subOld - r.subNew > 0.5, `new ${r.subNew.toFixed(1)} dB vs old ${r.subOld.toFixed(1)} dB`);
  ok('bus stem has the bus output', r.busStem !== null && r.busStem > -45, r.busStem && r.busStem.toFixed(1) + ' dB');
  ok('FX returns stem has the reverb/delay', r.fxret !== null && r.fxret > -60, r.fxret && r.fxret.toFixed(1) + ' dB');
  ok('stems add up to the mix', r.sumErrDb < -60, 'difference ' + r.sumErrDb.toFixed(0) + ' dB');
  ok('cancel stops after the current pass', r.cancel === 'cancelled' && r.cancelSec < r.onePassSec * 1.5, r.cancel + ' after 1 of 5 passes, ' + r.cancelSec.toFixed(1) + 's');
  ok('export saved one file per stem', downloads.length === r.list.length, downloads.length + ' files: ' + saved.toast);
  ok('progress dialog with a Cancel button was shown', saved.shown);
  ok('files are numbered and named', /^.+ - 01 Breakbeat\.wav$/.test(downloads[0] || ''), downloads[0]);
  console.log(`one pass for ${r.list.length} stems: ${r.onePassSec.toFixed(1)}s (one single-track render the old way: ${r.oldOneTrackSec.toFixed(1)}s)`);
  console.log(errs.join('\n') || 'no errors');
  await b.close(); srv.close();
})();
