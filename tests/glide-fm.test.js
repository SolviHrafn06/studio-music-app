const path = require('path');
const SHOTS = process.env.SHOTS || require('os').tmpdir();
const EXAMPLE = path.join(__dirname, '..', 'examples', 'Neon Riot.studio');
const { chromium } = require('playwright');
const srv = require('./serve')(8787);
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage();
  const errs=[]; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('http://localhost:8787/'); await pg.click('#start-btn'); await pg.waitForTimeout(1500);
  const r = await pg.evaluate(async () => {
    const P = { ...App.project, bpm: 120, tracks: [] };
    const tr = makeTrack('synth', P); tr.inst = presetInst('808 Slide');
    tr.clips = [{ id: 'g', start: 0, length: 4, notes: [{ p: 36, s: 0, d: 6, v: 0.9 }, { p: 43, s: 4, d: 8, v: 0.9 }] }];
    P.tracks = [tr]; P.master = { fx: [], volume: 0.9 };
    const buf = await Engine.render(P, { tail: 0.5 });
    const d = buf.getChannelData(0), sr = buf.sampleRate;
    function f0(s){ const N=4096; let best=0,bt=0; for(let tau=200;tau<1500;tau++){ let c=0,e1=0,e2=0; for(let i=0;i<N;i+=2){c+=d[s+i]*d[s+i+tau]; e1+=d[s+i]**2; e2+=d[s+i+tau]**2;} c/=Math.sqrt(e1*e2)+1e-9; if(c>best+0.002){best=c;bt=tau;} } return (sr/bt).toFixed(1); }
    const fm = presetInst('FM Bell'); const ctx=new OfflineAudioContext(2,44100,44100); playPatch(ctx,ctx.destination,fm.patch,72,0,0.5,0.8); const fb=await ctx.startRendering(); let pk=0; for (const v of fb.getChannelData(0)) pk=Math.max(pk,Math.abs(v));
    return { before: f0(Math.floor(0.3*sr)), after: f0(Math.floor(0.9*sr)), expected: [mtof(36).toFixed(1), mtof(43).toFixed(1)], fmPeak: pk.toFixed(2) };
  });
  console.log(JSON.stringify(r), errs.join('|') || 'no errors');
  await b.close(); srv.close();
})();
