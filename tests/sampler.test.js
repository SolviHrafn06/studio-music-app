const path = require('path');
const SHOTS = process.env.SHOTS || require('os').tmpdir();
const EXAMPLE = path.join(__dirname, '..', 'examples', 'Neon Riot.studio');
const { chromium } = require('playwright');
const srv = require('./serve')(8788);
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1500, height: 920 } });
  const errs=[]; pg.on('pageerror', e => errs.push(e.message + ' ' + (e.stack||'').split('\n')[1]));
  await pg.goto('http://localhost:8788/'); await pg.click('#start-btn'); await pg.waitForTimeout(1500);
  const r = await pg.evaluate(async () => {
    const P = App.project; const drums = P.tracks[0];
    const loop = await Engine.render(P, { only: drums.id, noMaster: true, tail: 0 });
    // take first 2 bars (8 beats)
    const sr = loop.sampleRate, len = Math.round(8 * 60 / P.bpm * sr);
    const b2 = new AudioBuffer({ numberOfChannels: 2, length: len, sampleRate: sr }); for (let c=0;c<2;c++) b2.copyToChannel(loop.getChannelData(c).subarray(0,len), c);
    const id = Buffers.add(b2);
    const t = makeSamplerTrack(id, 'Drum loop', true);
    await new Promise(r=>setTimeout(r,500));
    const out = await Engine.render(App.project, { only: t.id, noMaster: true, tail: 0.3 });
    let pk=0; for (const v of out.getChannelData(0)) pk=Math.max(pk,Math.abs(v));
    // expected hit times (kick/snare/hat steps) vs slices
    return { slices: t.inst.slices.map(s=>(s/(60/P.bpm/4)).toFixed(1)), notes: t.clips[0].notes.length, peak: pk.toFixed(2) };
  });
  console.log(JSON.stringify(r));
  await pg.evaluate(() => { Panels.show('inst'); });
  await pg.waitForTimeout(400);
  await pg.screenshot({ path: path.join(SHOTS, 'smp.png') });
  console.log(errs.join('\n') || 'no errors');
  await b.close(); srv.close();
})();
